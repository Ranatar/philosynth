/**
 * Тестовые запросы беседы 3.1 (07-conversation-protocol) единым прогоном:
 *  Т1: два синтеза (Кант+Гегель, Хайдеггер+Сартр) → мета-синтез из обоих
 *      c двумя философами — synthesis_lineage ровно 4 записи
 *      (2 philosopher + 2 synthesis, сквозные позиции); контекст ОБЕИХ
 *      концепций попадает в ПРОМПТ через настоящий конвейер
 *      (registerParentContextProvider → buildParams → baseCtx);
 *  Т2: searchByPhilosophers([Кант]) — и прямой синтез, и мета (транзитивно);
 *  Т3: checkGenealogyOverlaps: два концепта с ОБЩИМ философом — warning
 *      содержит имя философа.
 * Браузерных тестов в 3.1 нет — бэкенд (клиентская половина — 3.2).
 */
import { and, asc, eq } from "drizzle-orm";

import { db, closeDb } from "../server/db/index.js";
import { closeRedis } from "../server/redis.js";
import {
  sections,
  syntheses,
  synthesisLineage,
  users,
} from "../server/db/schema.js";
import {
  checkGenealogyOverlaps,
  loadConceptParticipants,
} from "../server/services/meta-synthesis-service.js";
import {
  createLineageRecords,
  searchByPhilosophers,
} from "../server/services/lineage-service.js";
import {
  buildParams,
  registerParentContextProvider,
} from "../server/services/generation-service.js";
import { baseCtx, baseCtxStatic } from "../server/services/prompt-builder.js";

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

async function makeConcept(
  userId: string,
  title: string,
  phils: string[],
): Promise<string> {
  const keys = ["sum", "graph", "dialogue", "glossary", "theses", "critique"];
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
        `<div class="capsule"><p>Капсула «${title}»: несущий принцип ` +
        "концепции, развёрнутый в самостоятельную позицию.</p></div>",
    })
    .returning({ id: syntheses.id });
  const id = (row as { id: string }).id;
  await db.insert(sections).values(
    keys.map((key, i) => ({
      synthesisId: id,
      key,
      sectionNum: i + 1,
      title: key,
      htmlContent: `<section data-key="${key}"><p>Раздел ${key} «${title}».</p></section>`,
    })),
  );
  await createLineageRecords(
    id,
    phils.map((name) => ({ type: "philosopher" as const, name })),
  );
  return id;
}

async function main(): Promise<void> {
  const [u] = await db
    .insert(users)
    .values({ email: `t31-${TAG}@test.local`, passwordHash: "x" })
    .returning({ id: users.id });
  const userId = (u as { id: string }).id;

  /* ══ Т1: мета-синтез 2 философа + 2 концепции ══ */
  console.log("Т1. Мета-синтез: lineage 4 записи + контекст обеих в промпте");
  const titleA = `Трансцендентальная диалектика ${TAG}`;
  const titleB = `Экзистенциальная аналитика ${TAG}`;
  const aId = await makeConcept(userId, titleA, [N("Иммануил Кант"), N("Георг Гегель")]);
  const bId = await makeConcept(userId, titleB, [N("Мартин Хайдеггер"), N("Жан-Поль Сартр")]);

  const [meta] = await db
    .insert(syntheses)
    .values({
      userId,
      title: `Мета-синтез ${TAG}`,
      method: "dialectical",
      synthLevel: "integrative",
      depth: "standard",
      status: "created",
      sectionOrder: ["sum", "theses"],
      seed: "Опыт как забота",
    })
    .returning({ id: syntheses.id });
  const metaId = (meta as { id: string }).id;
  // Как POST /syntheses: философы, затем концепции, сквозные позиции
  await createLineageRecords(metaId, [
    { type: "philosopher", name: N("Морис Мерло-Понти") },
    { type: "philosopher", name: N("Симона де Бовуар") },
    { type: "synthesis", synthesisId: aId },
    { type: "synthesis", synthesisId: bId },
  ]);

  const rows = await db
    .select()
    .from(synthesisLineage)
    .where(eq(synthesisLineage.synthesisId, metaId))
    .orderBy(asc(synthesisLineage.position));
  check("ровно 4 записи lineage", rows.length === 4, rows.length);
  check(
    "2 philosopher + 2 synthesis",
    rows.filter((r) => r.parentType === "philosopher").length === 2 &&
      rows.filter((r) => r.parentType === "synthesis").length === 2,
  );
  check(
    "сквозные позиции 0..3, философы впереди",
    rows.map((r) => r.position).join(",") === "0,1,2,3" &&
      rows[0]?.parentType === "philosopher" &&
      rows[3]?.parentSynthesisId === bId,
    rows.map((r) => `${r.position}:${r.parentType}`),
  );

  // Настоящий конвейер промпта: провайдер + buildParams + baseCtx
  registerParentContextProvider();
  const [metaRow] = await db
    .select()
    .from(syntheses)
    .where(eq(syntheses.id, metaId))
    .limit(1);
  if (!metaRow) throw new Error("meta row?");
  const phils = rows
    .filter((r) => r.parentType === "philosopher")
    .map((r) => r.parentName as string);
  const concepts = await loadConceptParticipants(metaId);
  check("loadConceptParticipants: обе, в порядке позиций",
    concepts.length === 2 && concepts[0]?.synthesisId === aId && concepts[1]?.synthesisId === bId,
    concepts.map((c) => c.name));

  const p = buildParams(metaRow, phils, {}, concepts);
  check("гейт: p.isMetaSynthesis === true", p.isMetaSynthesis === true);
  check(
    "participants слиты: 2 философа + 2 концепции",
    (p.participants ?? []).length === 4,
    (p.participants ?? []).map((x) => x.type),
  );

  const ctx = await baseCtx(p);
  check(
    "ПРОМПТ: блок концепций-участников присутствует",
    ctx.includes("КОНЦЕПЦИЯ-УЧАСТНИК"),
  );
  // КВИРК экстрактора (порт 1.3): capsule:full отрезает ведущее слово
  // «Капсула» — текст начинается с «Название»: …
  check(
    "ПРОМПТ: контекст концепции A (заголовок + тело капсулы)",
    ctx.includes(`КОНЦЕПЦИЯ-УЧАСТНИК: «${titleA}»`) &&
      ctx.includes(`«${titleA}»: несущий принцип`),
  );
  check(
    "ПРОМПТ: контекст концепции B (заголовок + тело капсулы)",
    ctx.includes(`КОНЦЕПЦИЯ-УЧАСТНИК: «${titleB}»`) &&
      ctx.includes(`«${titleB}»: несущий принцип`),
  );
  check(
    "ПРОМПТ: философы-участники тоже на месте",
    ctx.includes(N("Морис Мерло-Понти")) && ctx.includes(N("Симона де Бовуар")),
  );
  const ctxStatic = await baseCtxStatic(p);
  check(
    "baseCtxStatic (оценка): БЕЗ блока родителей",
    !ctxStatic.includes("КОНЦЕПЦИЯ-УЧАСТНИК"),
  );

  /* ══ Т2: searchByPhilosophers транзитивно ══ */
  console.log("Т2. searchByPhilosophers([Кант]): прямой + мета");
  const found = await searchByPhilosophers([N("Иммануил Кант")]);
  check(
    "найдены прямой синтез И мета-синтез",
    found.includes(aId) && found.includes(metaId),
    found,
  );
  check("чужого (B) в выдаче нет", !found.includes(bId), found);

  /* ══ Т3: overlaps — общий философ у двух концептов ══ */
  console.log("Т3. checkGenealogyOverlaps: общий философ двух концептов");
  const cId = await makeConcept(userId, `Критическая онтология ${TAG}`, [
    N("Иммануил Кант"),
    N("Жан-Поль Сартр"),
  ]);
  const w = await checkGenealogyOverlaps([
    { type: "synthesis", synthesisId: aId },
    { type: "synthesis", synthesisId: cId },
  ]);
  check(
    "info-warning с именем общего философа (Кант)",
    w.some(
      (x) =>
        x.level === "info" &&
        x.text.includes(N("Иммануил Кант")) &&
        x.text.includes("общих предков"),
    ),
    w,
  );
  check(
    "имена обеих концепций в тексте",
    w.some((x) => x.text.includes(titleA) && x.text.includes("Критическая онтология")),
    w.map((x) => x.text.slice(0, 90)),
  );

  console.log(
    fails === 0
      ? "\nТЕСТЫ 3.1 (запросы 2–4): все проверки сошлись"
      : `\nТЕСТЫ 3.1: ПРОВАЛОВ ${fails}`,
  );
  if (fails > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("ФАТАЛЬНО:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
    await closeRedis();
  });
