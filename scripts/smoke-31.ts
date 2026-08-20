/**
 * Смоук беседы 3.1 (запрос 1) на живой БД: два синтеза-концепции →
 * мета-синтез; loadConceptContext / validate / overlaps / блоки контекста /
 * CTE lineage-service. НЕ юнит-тест — проверка живого SQL и склейки.
 */
import { db, closeDb } from "../server/db/index.js";
import { closeRedis } from "../server/redis.js";

import { sections, syntheses, synthesisLineage, users } from "../server/db/schema.js";
import {
  checkGenealogyOverlaps,
  collectPhilosopherAncestors,
  conceptContextBlockFull,
  conceptContextBlockSelective,
  isAncestor,
  loadConceptContext,
  loadConceptParticipants,
  validateConceptForMetaSynthesis,
} from "../server/services/meta-synthesis-service.js";
import {
  createLineageRecords,
  getAncestors,
  getDescendants,
  searchByPhilosophers,
} from "../server/services/lineage-service.js";

/** Изоляция прогонов в общей БД: уникальный суффикс имён философов. */
const TAG = Date.now().toString(36);
const N = (s: string): string => `${s} ${TAG}`;

let fails = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) console.log("  ✓", name);
  else {
    fails++;
    console.error("  ✗", name, extra ?? "");
  }
}

const SEC_HTML = (key: string, num: number): string =>
  `<section data-key="${key}"><h2>§${num}</h2><p>Содержимое раздела ${key}: ` +
  "категориальный аппарат, развёрнутый достаточно, чтобы фрагмент был непуст." +
  "</p></section>";

async function makeConcept(
  userId: string,
  title: string,
  phils: string[],
  opts: { skipGlossary?: boolean } = {},
): Promise<string> {
  const keys = ["sum", "graph", "dialogue", "glossary", "theses", "critique"]
    .filter((k) => !(opts.skipGlossary && k === "glossary"));
  const [row] = await db
    .insert(syntheses)
    .values({
      userId,
      title,
      method: "dialectical",
      synthLevel: "integrative",
      depth: "standard",
      status: "ready",
      sectionOrder: keys,
      capsuleHtml:
        `<div class="capsule"><p>Капсула «${title}»: единый принцип, ` +
        "связывающий опыт и его условия.</p></div>",
    })
    .returning({ id: syntheses.id });
  const id = (row as { id: string }).id;
  await db.insert(sections).values(
    keys.map((key, i) => ({
      synthesisId: id,
      key,
      sectionNum: i + 1,
      title: key,
      htmlContent: SEC_HTML(key, i + 1),
    })),
  );
  await createLineageRecords(
    id,
    phils.map((name) => ({ type: "philosopher" as const, name })),
  );
  return id;
}

async function main(): Promise<void> {
  // Чистый пользователь на прогон
  const [u] = await db
    .insert(users)
    .values({
      email: `smoke31-${Date.now()}@test.local`,
      passwordHash: "x",
    })
    .returning({ id: users.id });
  const userId = (u as { id: string }).id;

  console.log("1. Две концепции-участника");
  const aId = await makeConcept(userId, "Трансцендентальная диалектика опыта", [
    N("Иммануил Кант"),
    N("Георг Гегель"),
  ]);
  const bId = await makeConcept(userId, "Экзистенциальная аналитика заботы", [
    N("Мартин Хайдеггер"),
    N("Жан-Поль Сартр"),
  ]);

  console.log("2. validateConceptForMetaSynthesis");
  const vA = await validateConceptForMetaSynthesis(aId);
  check("A пригодна", vA.valid && vA.missing.length === 0, vA);
  check("A: warnings пусты (есть graph и dialogue)", vA.warnings.length === 0, vA.warnings);
  const cripple = await makeConcept(userId, "Обрубок без глоссария", [N("Платон")], {
    skipGlossary: true,
  });
  const vC = await validateConceptForMetaSynthesis(cripple);
  check(
    "edge: без glossary → {valid:false, missing:['glossary']}",
    !vC.valid && vC.missing.length === 1 && vC.missing[0] === "glossary",
    vC,
  );

  console.log("3. loadConceptContext");
  const pa = await loadConceptContext(aId);
  check("name из title", pa.name === "Трансцендентальная диалектика опыта");
  check("капсула извлечена", pa.capsule.includes("единый принцип"), pa.capsule.slice(0, 80));
  check("type='synthesis'", pa.type === "synthesis");
  const filled = (
    ["capsule", "goals", "portraits", "tensions", "graphNodes", "graphEdges",
     "dialogueConcepts", "dialogueSynthesis", "glossaryCompact", "thesesSummary"] as const
  ).map((k) => `${k}:${pa[k] ? "✔" : "·"}`).join(" ");
  console.log("   наполнение полей:", filled);

  console.log("4. Мета-синтез: lineage философ+концепции");
  const [meta] = await db
    .insert(syntheses)
    .values({
      userId,
      title: "Мета-синтез: опыт как забота",
      method: "dialectical",
      synthLevel: "integrative",
      depth: "standard",
      status: "ready",
      sectionOrder: ["sum"],
      capsuleHtml: "<p>м</p>",
    })
    .returning({ id: syntheses.id });
  const metaId = (meta as { id: string }).id;
  await createLineageRecords(metaId, [
    { type: "philosopher", name: N("Симона де Бовуар") },
    { type: "synthesis", synthesisId: aId },
    { type: "synthesis", synthesisId: bId },
  ]);
  const lineageRows = await db.select().from(synthesisLineage);
  void lineageRows;

  console.log("5. loadConceptParticipants(meta)");
  const parts = await loadConceptParticipants(metaId);
  check("две концепции в порядке позиций", parts.length === 2 && parts[0]?.synthesisId === aId, parts.map((p) => p.name));

  console.log("6. collectPhilosopherAncestors / isAncestor");
  const anc = await collectPhilosopherAncestors(metaId);
  check(
    "предки транзитивно: Кант, Гегель, Хайдеггер, Сартр, Бовуар",
    anc.size === 5 && anc.has(N("Иммануил Кант")) && anc.has(N("Жан-Поль Сартр")) && anc.has(N("Симона де Бовуар")),
    [...anc],
  );
  check("isAncestor(A, meta)", await isAncestor(aId, metaId));
  check("!isAncestor(meta, A)", !(await isAncestor(metaId, aId)));

  console.log("7. checkGenealogyOverlaps");
  const w1 = await checkGenealogyOverlaps([
    { type: "philosopher", name: N("Иммануил Кант") },
    { type: "synthesis", synthesisId: aId },
    { type: "synthesis", synthesisId: bId },
  ]);
  check(
    "warn: Кант выбран и в генеалогии A",
    w1.some((w) => w.level === "warn" && w.text.includes(N("Иммануил Кант")) && w.text.includes("удвоено")),
    w1,
  );
  const meta2 = await db
    .insert(syntheses)
    .values({ userId, title: "Второй потомок A", method: "dialectical", synthLevel: "integrative", depth: "standard", status: "ready", sectionOrder: ["sum"], capsuleHtml: "<p>м</p>" })
    .returning({ id: syntheses.id });
  const meta2Id = (meta2[0] as { id: string }).id;
  await createLineageRecords(meta2Id, [{ type: "synthesis", synthesisId: aId }]);
  const w2 = await checkGenealogyOverlaps([
    { type: "synthesis", synthesisId: metaId },
    { type: "synthesis", synthesisId: meta2Id },
  ]);
  check(
    "info: общие предки двух концепций (через A)",
    w2.some((w) => w.level === "info" && w.text.includes("общих предков") && w.text.includes("Кант")),
    w2,
  );

  console.log("8. Блоки родительского контекста");
  const pBlk = { participants: parts, isMetaSynthesis: true, synthLevel: "integrative", method: "dialectical" };
  const full = conceptContextBlockFull(pBlk);
  check("Full: обе концепции и капсула", full.includes("КОНЦЕПЦИЯ-УЧАСТНИК") && full.includes("Экзистенциальная аналитика") && full.includes("КАПСУЛА"), full.slice(0, 120));
  check("Full: квирк — нет PORTRAITS", !full.includes("ПОРТРЕТ"));
  const sel = await conceptContextBlockSelective(pBlk, "origin");
  check("Selective(origin): непуст, содержит капсулу", sel.includes("единый принцип"), sel.slice(0, 400));
  const selExplicit = await conceptContextBlockSelective(pBlk, "sum", { required: ["capsule"], optional: [] });
  check("Selective explicitSpec: только капсула", selExplicit.includes("единый принцип") && !selExplicit.includes("ТЕЗИСЫ"), selExplicit.slice(0, 400));
  const empty = conceptContextBlockFull({ participants: parts, isMetaSynthesis: false });
  check("гейт isMetaSynthesis=false → ''", empty === "");

  console.log("9. getAncestors / getDescendants");
  const tree = await getAncestors(metaId, 10);
  check("корень = мета, depth 0", tree.synthesisId === metaId && tree.depth === 0);
  check("3 ребёнка в порядке позиций", tree.children.length === 3 && tree.children[0]?.type === "philosopher");
  const nodeA = tree.children.find((n) => n.synthesisId === aId);
  check(
    "уровень 2: философы A",
    !!nodeA && nodeA.children.length === 2 && nodeA.children[0]?.name === N("Иммануил Кант"),
    nodeA?.children,
  );
  const shallow = await getAncestors(metaId, 1);
  check("depth=1: без второго уровня", (shallow.children.find((n) => n.synthesisId === aId)?.children.length ?? -1) === 0);
  const desc = await getDescendants(aId, 5);
  check(
    "потомки A: meta и meta2",
    desc.length === 2 && desc.every((d) => [metaId, meta2Id].includes(d.synthesisId ?? "")),
    desc.map((d) => d.name),
  );

  console.log("10. searchByPhilosophers");
  const s1 = await searchByPhilosophers([N("Иммануил Кант"), N("Мартин Хайдеггер")]);
  check("Кант+Хайдеггер → только мета (транзитивно)", s1.length === 1 && s1[0] === metaId, s1);
  const s2 = await searchByPhilosophers([N("Иммануил Кант")]);
  check(
    "Кант → A, мета, второй потомок",
    s2.length === 3 && [aId, metaId, meta2Id].every((id) => s2.includes(id)),
    s2,
  );
  const s3 = await searchByPhilosophers(["Никто Такойович"]);
  check("несуществующий философ → []", s3.length === 0);

  console.log(fails === 0 ? "\nСМОУК 3.1: все проверки сошлись" : `\nСМОУК 3.1: ПРОВАЛОВ ${fails}`);
  if (fails > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("ФАТАЛЬНО:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  
  });
