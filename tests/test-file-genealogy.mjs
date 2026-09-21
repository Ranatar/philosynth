/**
 * Дерево генеалогии импортированного файла (syntheses.file_genealogy) —
 * живая PG, без сервера/браузера. Живой файл одностраничника — путь из
 * TFG_FILE (по умолчанию /mnt/user-data/uploads/PS-6933-6RIK-…html); без
 * файла — пропуск: живых концепций в репозитории нет.
 *
 *  S1  импорт: file_genealogy записано целиком, lineage — только философ,
 *      предупреждение о снимке без ложного «сохранено во встроенном состоянии»;
 *  S2  getAncestors подшивает ветку файла (fromFile, метаданные, глубина),
 *      ограничение глубины работает и для узлов файла;
 *  S3  unlinkedFileParents и бейдж каталога (loadConceptParentFlags);
 *  S4  экспорт: встроенная genealogy — полное дерево, имена родителей
 *      настоящие (не «[безымянная концепция]»), md-подзаголовок — тоже;
 *  S5  roundtrip экспорт → импорт другим пользователем: дерево той же формы;
 *  S6  несвязанная связь (другое имя) встаёт В КОНЕЦ и узел файла не заслоняет;
 *  S7  ПРАВИЛО ПРИОРИТЕТА: связь с тем же именем встаёт на позицию узла файла
 *      и перекрывает всю его ветку деревом из БД;
 *  S8  родитель удалён (SET NULL) → узел файла снова виден;
 *  S9  синтез не из файла: дерево как прежде; sanitizeFileGenealogy на мусоре.
 *
 * Запуск (из корня, PG поднят и мигрирован):
 *   node_modules/.bin/tsx tests/test-file-genealogy.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

const FILE =
  process.env.TFG_FILE ??
  "/mnt/user-data/uploads/PS-6933-6RIK-vmeschayuschiy-razlom-rgG2.html";
if (!existsSync(FILE)) {
  console.log("TFG_FILE не задан или файла нет — пропуск");
  process.exit(0);
}

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 600)); }
}

const { db, closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");
const schema = await import("../server/db/schema.ts");
const ls = await import("../server/services/lineage-service.ts");
const imp = await import("../server/services/import-service.ts");
const { exportHTML } = await import("../server/services/export/html-exporter.ts");
const { exportMD } = await import("../server/services/export/md-exporter.ts");
const { loadConceptParentFlags } = await import("../server/routes/syntheses.ts");
const { eq, inArray } = await import("drizzle-orm");

const TAG = randomUUID().slice(0, 8);
const html = readFileSync(FILE, "utf8");
const P = "Грамматика самоотрицания";

/** Дерево в строки «отступ + имя [метки]» — сравнение формы. */
function shape(node, d = 0, out = []) {
  const marks = [node.fromFile ? "file" : "", node.synthesisId ? "db" : ""].filter(Boolean).join(",");
  out.push("  ".repeat(d) + node.name + (marks ? ` [${marks}]` : ""));
  for (const c of node.children) shape(c, d + 1, out);
  return out;
}
const names = (node) => node.children.map((c) => c.name);
const stateOf = (h) =>
  JSON.parse(/<script type="application\/json" id="philosynth-state">([\s\S]*?)<\/script>/.exec(h)[1]);
const lineageOf = (sid) =>
  db.select().from(schema.synthesisLineage).where(eq(schema.synthesisLineage.synthesisId, sid));

const users = [];
try {
  const mkUser = async (s) => {
    const [u] = await db.insert(schema.users)
      .values({ email: `${s}-${TAG}@tfg.local`, passwordHash: "x" })
      .returning({ id: schema.users.id });
    users.push(u.id);
    return u.id;
  };
  const uA = await mkUser("a");
  const uB = await mkUser("b");

  /* ══ S1 ══ */
  console.log("── S1 импорт ──");
  const r = await imp.importHTML(html, uA, "live.html");
  const child = r.synthesisId;
  const [row] = await db.select().from(schema.syntheses).where(eq(schema.syntheses.id, child));
  const fg = row.fileGenealogy;
  check("file_genealogy записано", !!fg && fg.participants?.length === 2, fg && fg.participants?.map((p) => p.name));
  check("file_genealogy: порядок файла (Юнг, затем концепция)",
    fg?.participants?.[0]?.type === "philosopher" && fg.participants[0].name === "Юнг" &&
    fg.participants[1]?.type === "concept" && fg.participants[1].name === P);
  check("file_genealogy: вложенность сохранена (2 концепции × 2 философа)",
    fg?.participants?.[1]?.participants?.length === 2 &&
    fg.participants[1].participants.every((c) => c.type === "concept" && c.participants?.length === 2));
  check("file_genealogy: метаданные концепций файла", !!fg?.participants?.[1]?.method && !!fg.participants[1].synthLevel);
  const l1 = await lineageOf(child);
  check("lineage — только философ на позиции 0", l1.length === 1 && l1[0].parentType === "philosopher" && l1[0].position === 0, l1);
  const w = r.warnings.filter((x) => x.field === "lineage");
  check("предупреждение: снимок из файла + как получить связь",
    w.length === 1 && /снимок/.test(w[0].message) && /импортировать родителя ДО/.test(w[0].message), w);
  check("предупреждение без ложного «встроенном состоянии»", !w.some((x) => /встроенном состоянии/.test(x.message)));

  /* ══ S2 ══ */
  console.log("── S2 getAncestors ──");
  const t = await ls.getAncestors(child);
  const expected = [
    row.title + " [db]",
    "  Юнг",
    `  ${P} [file]`,
    "    Экзистенциальная грамматика [file]",
    "      Витгенштейн [file]",
    "      Шестов [file]",
    "    Онтология самоотрицания [file]",
    "      Парменид [file]",
    "      Левинас [file]",
  ];
  check("дерево = дереву файла", shape(t).join("\n") === expected.join("\n"), shape(t));
  const gNode = t.children[1];
  check("узел файла несёт метаданные и depth", gNode.method && gNode.synthLevel && gNode.depth === 1 && gNode.children[0].depth === 2, gNode);
  check("узел файла без synthesisId", gNode.synthesisId === undefined);
  const t1 = await ls.getAncestors(child, 1);
  check("maxDepth=1: ветка файла обрезана на первом уровне", t1.children[1].children.length === 0, shape(t1));
  const t2 = await ls.getAncestors(child, 2);
  check("maxDepth=2: философы третьего уровня не показаны",
    t2.children[1].children.length === 2 && t2.children[1].children.every((c) => c.children.length === 0), shape(t2));

  /* ══ S3 ══ */
  console.log("── S3 родители файла и бейдж ──");
  const un = ls.unlinkedFileParents(fg, l1);
  check("unlinkedFileParents: только концепция на позиции 1", un.length === 1 && un[0].position === 1 && un[0].node.name === P, un);
  const flags = await loadConceptParentFlags([child]);
  check("бейдж каталога: мета-синтез из файла", flags.has(child));

  /* ══ S4 ══ */
  console.log("── S4 экспорт ──");
  const exp = await exportHTML(child);
  const st = stateOf(exp);
  const eg = st.genealogy;
  check("экспорт: корень — синтез", eg.type === "concept" && eg.name === row.title && eg.method === row.method);
  check("экспорт: ветка файла полной глубины",
    eg.participants?.[1]?.name === P && eg.participants[1].participants?.length === 2 &&
    eg.participants[1].participants.every((c) => c.participants?.length === 2), eg.participants);
  check("экспорт: капсулы в genealogy не пишутся", !JSON.stringify(eg).includes('"capsule"'));
  check("экспорт: «[безымянная концепция]» нигде нет", !exp.includes("[безымянная концепция]"));
  const md = await exportMD(child);
  check("md: родитель-концепция назван по имени", md.includes(P) && !md.includes("[безымянная концепция]"));

  /* ══ S5 ══ */
  console.log("── S5 roundtrip экспорт → импорт (другой пользователь) ──");
  const r2 = await imp.importHTML(exp, uB, "roundtrip.html");
  const tB = await ls.getAncestors(r2.synthesisId);
  check("roundtrip: форма дерева та же", shape(tB).slice(1).join("\n") === expected.slice(1).join("\n"), shape(tB));

  /* ══ S6 ══ */
  console.log("── S6 несвязанная связь уходит в конец ──");
  const mk = async (title) => {
    const [x] = await db.insert(schema.syntheses)
      .values({ userId: uA, title, docNum: `TFG-${TAG}`, status: "ready" })
      .returning({ id: schema.syntheses.id });
    return x.id;
  };
  const other = await mk(`Другое имя ${TAG}`);
  const recO = await ls.linkParent(child, other, `Другое имя ${TAG}`);
  check("позиция = за пределами файла (2)", recO.position === 2, recO);
  const t3 = await ls.getAncestors(child);
  check("дерево: Юнг, концепция файла, новая связь", names(t3).join("|") === ["Юнг", P, `Другое имя ${TAG}`].join("|"), names(t3));
  check("узел файла не заслонён", t3.children[1].fromFile === true);

  /* ══ S7 ══ */
  console.log("── S7 правило приоритета ──");
  const gram = await mk(`«${P}»`); // ёлочки — нормализация имени
  await db.insert(schema.synthesisLineage).values({ synthesisId: gram, parentType: "philosopher", parentName: "Витгенштейн", position: 0 });
  const recG = await ls.linkParent(child, gram, P);
  check("связь встала на позицию узла файла (1)", recG.position === 1, recG);
  const t4 = await ls.getAncestors(child);
  check("узел 1 — из БД, со ссылкой", t4.children[1].synthesisId === gram && !t4.children[1].fromFile, t4.children[1]);
  check("ветка файла перекрыта целиком — поддерево из БД",
    shape(t4.children[1]).slice(1).join("|") === "  Витгенштейн", shape(t4.children[1]));
  check("порядок сохранён: Юнг, связь 1, связь 2", names(t4).join("|") === ["Юнг", `«${P}»`, `Другое имя ${TAG}`].join("|"), names(t4));
  const l4 = await lineageOf(child);
  check("unlinkedFileParents пуст (перекрыто)", ls.unlinkedFileParents(fg, l4).length === 0);
  const exp2 = stateOf(await exportHTML(child)).genealogy;
  check("экспорт после связи: synthesisId у родителя", exp2.participants[1].synthesisId === gram, exp2.participants[1]);

  /* ══ S8 ══ */
  console.log("── S8 родитель удалён ──");
  await db.delete(schema.syntheses).where(eq(schema.syntheses.id, gram));
  const t5 = await ls.getAncestors(child);
  check("SET NULL → узел файла снова на позиции 1",
    t5.children[1].name === P && t5.children[1].fromFile === true && t5.children[1].children.length === 2, shape(t5));

  /* ══ S9 ══ */
  console.log("── S9 синтез не из файла; мусор ──");
  const plain = await mk(`Обычный ${TAG}`);
  await db.insert(schema.synthesisLineage).values({ synthesisId: plain, parentType: "philosopher", parentName: "Кант", position: 0 });
  await ls.linkParent(plain, other, "что угодно");
  const t6 = await ls.getAncestors(plain);
  check("без file_genealogy — прежнее дерево", shape(t6).slice(1).join("|") === ["  Кант", `  Другое имя ${TAG} [db]`].join("|"), shape(t6));
  const lp = await lineageOf(plain);
  check("без file_genealogy — связь в конец (1)", lp.find((x) => x.parentType === "synthesis")?.position === 1);
  const junk = ls.sanitizeFileGenealogy({
    type: "concept", name: "Корень", extra: 1,
    participants: [{ type: "philosopher" }, "мусор", { type: "synthesis", name: " X ", seed: "", participants: [] }],
  });
  check("sanitize: безымянный узел не выбрасывается (индексы = позиции)",
    junk.participants.length === 2 && junk.participants[0].name === "[безымянный философ]", junk);
  check("sanitize: type synthesis → concept, лишние/пустые поля сняты",
    junk.participants[1].type === "concept" && junk.participants[1].name === "X" && !("seed" in junk.participants[1]) &&
    !("participants" in junk.participants[1]) && !("extra" in junk), junk);
  check("sanitize: не объект → null", ls.sanitizeFileGenealogy(null) === null && ls.sanitizeFileGenealogy("x") === null);
} catch (e) {
  failed++;
  console.log("  ✗ КРАХ:", e);
} finally {
  if (users.length) {
    await db.delete(schema.syntheses).where(inArray(schema.syntheses.userId, users));
    await db.delete(schema.users).where(inArray(schema.users.id, users));
  }
  await closeDb();
  await closeRedis();
}
console.log(`\nИТОГ: ${n - failed} ✓ / ${failed} ✗`);
process.exit(failed ? 1 : 0);
