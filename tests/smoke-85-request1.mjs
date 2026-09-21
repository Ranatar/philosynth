/**
 * Смоук беседы 8.5 (запрос 1; живая PG, без сервера/браузера):
 *  - normalizeConceptTitle: ёлочки/лапки/обычные кавычки, двойные пробелы,
 *    регистр; пустая строка не матчит ничего;
 *  - findSameOwnerSynthesesByTitle: совпадения только у ТОГО ЖЕ владельца,
 *    excludeId исключает себя, чужая одноимённая (даже публичная) не идёт;
 *  - linkParent/isDescendantOf: связь → position в конец, повтор →
 *    LINEAGE_EXISTS без второй строки, self → LINEAGE_SELF, потомок в
 *    родители → LINEAGE_CYCLE, дерево getAncestors видит связь;
 *  - importHTML живого файла одностраничника (tests/fixtures или путь из
 *    SMOKE85_FILE): 0 UUID → lineageCandidates с parentName и пустыми
 *    matches, предупреждение «импортировать родителя ДО», lineage — только philosopher;
 *    после появления у владельца синтеза «Грамматика  самоотрицания» (двойной
 *    пробел + ёлочки в файле) повторный импорт → 1 совпадение, связь при
 *    импорте НЕ создана; linkParent → parentSyntheses ребёнка = 1;
 *  - текстовые контракты: ветка UUID в import-service цела; коды в
 *    ApiErrorCode клиента и 03 §4.3; роут смонтирован через lineageRoutes.
 * Запуск (из корня, PG поднят и мигрирован):
 *   node_modules/.bin/tsx tests/smoke-85-request1.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`, extra === undefined ? "" : JSON.stringify(extra)); }
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const { db, sql, closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");
const schema = await import("../server/db/schema.ts");
const ls = await import("../server/services/lineage-service.ts");
const imp = await import("../server/services/import-service.ts");
const { eq } = await import("drizzle-orm");

const TAG = randomUUID().slice(0, 8);

try {
  console.log("── чистые ядра ──");
  const N = ls.normalizeConceptTitle;
  check("норм.: ёлочки + двойной пробел + регистр", N("«Грамматика   Самоотрицания»") === "грамматика самоотрицания");
  check("норм.: обычные кавычки и лапки", N('"Онтология „разлома“"') === "онтология разлома");
  check("норм.: типографские “”", N("“Вмещающий разлом”") === "вмещающий разлом");
  check("норм.: пустая строка", N("  «»  ") === "");
  check("норм.: разные имена не сливаются", N("Онтология разлома") !== N("Онтология разломов"));

  console.log("── живая БД: владельцы и совпадения ──");
  const [uA] = await db.insert(schema.users).values({ email: `a-${TAG}@t85.local`, passwordHash: "x" }).returning({ id: schema.users.id });
  const [uB] = await db.insert(schema.users).values({ email: `b-${TAG}@t85.local`, passwordHash: "x" }).returning({ id: schema.users.id });
  const mk = async (userId, title, extra = {}) => {
    const [r] = await db.insert(schema.syntheses).values({ userId, title, docNum: `T85-${TAG}`, status: "ready", ...extra }).returning({ id: schema.syntheses.id });
    return r.id;
  };
  const a1 = await mk(uA.id, `Грамматика  самоотрицания ${TAG}`);   // двойной пробел
  const a2 = await mk(uA.id, `«Грамматика самоотрицания ${TAG}»`);  // вторая версия в ёлочках
  const a3 = await mk(uA.id, `Другое имя ${TAG}`);
  const b1 = await mk(uB.id, `Грамматика самоотрицания ${TAG}`, { isPublic: true }); // чужая публичная
  const child = await mk(uA.id, `Вмещающий разлом ${TAG}`);

  const m = await ls.findSameOwnerSynthesesByTitle(uA.id, `«Грамматика самоотрицания ${TAG}»`, child);
  check("совпадения: две версии владельца", m.length === 2 && m.map((x) => x.id).sort().join() === [a1, a2].sort().join(), m);
  check("совпадения: чужая публичная не идёт", !m.some((x) => x.id === b1));
  check("совпадения: createdAt — ISO-строка", typeof m[0]?.createdAt === "string" && !Number.isNaN(Date.parse(m[0].createdAt)));
  const self = await ls.findSameOwnerSynthesesByTitle(uA.id, `Вмещающий разлом ${TAG}`, child);
  check("совпадения: excludeId исключает себя", self.length === 0, self);
  const none = await ls.findSameOwnerSynthesesByTitle(uA.id, `Нет такого ${TAG}`);
  check("совпадения: другое имя → пусто", none.length === 0);

  console.log("── живая БД: linkParent ──");
  // у ребёнка уже есть философ на позиции 0
  await db.insert(schema.synthesisLineage).values({ synthesisId: child, parentType: "philosopher", parentName: `Юнг-${TAG}`, position: 0 });
  const rec = await ls.linkParent(child, a1);
  check("link: строка parent_type='synthesis'", rec.parentType === "synthesis" && rec.parentSynthesisId === a1);
  check("link: position — в конец (1)", rec.position === 1, rec);
  const codeOf = async (p) => { try { await p; return null; } catch (e) { return e?.code ?? String(e); } };
  check("link: повтор → LINEAGE_EXISTS", (await codeOf(ls.linkParent(child, a1))) === "LINEAGE_EXISTS");
  const rows = await db.select().from(schema.synthesisLineage).where(eq(schema.synthesisLineage.synthesisId, child));
  check("link: дубликата строки нет (2 строки)", rows.length === 2, rows.length);
  check("link: self → LINEAGE_SELF", (await codeOf(ls.linkParent(child, child))) === "LINEAGE_SELF");
  // a1 — родитель child; сделать child родителем a1 = цикл
  check("isDescendantOf: child — потомок a1", (await ls.isDescendantOf(a1, child)) === true);
  check("isDescendantOf: a1 — не потомок child", (await ls.isDescendantOf(child, a1)) === false);
  check("link: потомок в родители → LINEAGE_CYCLE", (await codeOf(ls.linkParent(a1, child))) === "LINEAGE_CYCLE");
  // транзитивно: a3 ← child; child ← a1; потом a1 ← a3 — цикл через 2 шага
  await ls.linkParent(a3, child);
  check("link: транзитивный цикл → LINEAGE_CYCLE", (await codeOf(ls.linkParent(a1, a3))) === "LINEAGE_CYCLE");
  check("link: несвязанная пара проходит (a2 ← a3)", (await codeOf(ls.linkParent(a3, a2))) === null);
  const tree = await ls.getAncestors(child);
  check("getAncestors ребёнка видит философа и концепцию", tree.children.length === 2 && tree.children.some((c) => c.type === "synthesis" && c.synthesisId === a1), tree.children.map((c) => c.type));

  console.log("── импорт живого файла одностраничника ──");
  const filePath = process.env.SMOKE85_FILE ?? "/mnt/user-data/uploads/PS-6933-6RIK-vmeschayuschiy-razlom-rgG2.html";
  if (!existsSync(filePath)) {
    console.log("  ~ файл не найден, блок пропущен:", filePath);
  } else {
    const html = readFileSync(filePath, "utf8");
    check("файл: 0 synthesisId", !/synthesisId/.test(html));
    check("файл: 0 UUID", !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(html));
    const [uC] = await db.insert(schema.users).values({ email: `c-${TAG}@t85.local`, passwordHash: "x" }).returning({ id: schema.users.id });
    const t1 = Date.now();
    const r1 = await imp.importHTML(html, uC.id, "PS-6933-6RIK.html");
    console.log(`    импорт 1: ${Date.now() - t1} мс`);
    check("импорт без родителя: lineageCandidates = 1", r1.lineageCandidates.length === 1, r1.lineageCandidates);
    const c1 = r1.lineageCandidates[0];
    check("кандидат: parentName из файла", c1?.parentName === "Грамматика самоотрицания", c1);
    check("кандидат: matches пуст", c1?.matches.length === 0);
    check("кандидат: position = 1 (после Юнга)", c1?.position === 1, c1);
    const w1 = r1.warnings.filter((w) => w.field === "lineage");
    check("предупреждение: «импортировать родителя ДО»", w1.length === 1 && /импортировать родителя ДО/.test(w1[0].message), w1);
    const l1 = await db.select().from(schema.synthesisLineage).where(eq(schema.synthesisLineage.synthesisId, r1.synthesisId));
    check("lineage: только philosopher (Юнг)", l1.length === 1 && l1[0].parentType === "philosopher" && l1[0].parentName === "Юнг", l1);

    // Родитель появился у владельца — в ёлочках и с двойным пробелом
    const parent = await mk(uC.id, "«Грамматика  самоотрицания»");
    const r2 = await imp.importHTML(html, uC.id, "PS-6933-6RIK.html");
    const c2 = r2.lineageCandidates[0];
    check("повторный импорт: 1 совпадение по имени", c2?.matches.length === 1 && c2.matches[0].id === parent, c2);
    check("предупреждение: «выберите родителя»", r2.warnings.some((w) => w.field === "lineage" && /совпадени/.test(w.message)));
    const l2 = await db.select().from(schema.synthesisLineage).where(eq(schema.synthesisLineage.synthesisId, r2.synthesisId));
    check("связь при импорте НЕ создана даже при единственном совпадении", l2.every((r) => r.parentType === "philosopher"));
    // Роут всегда передаёт parentName; связь встаёт на позицию узла файла
    // (правило приоритета file_genealogy) = позиции кандидата
    const rec2 = await ls.linkParent(r2.synthesisId, parent, c2.parentName);
    check("linkParent после импорта: position = позиции кандидата (1)", rec2.position === 1 && c2.position === 1, rec2);
    const l3 = await db.select().from(schema.synthesisLineage).where(eq(schema.synthesisLineage.synthesisId, r2.synthesisId));
    check("после связывания: parent_type='synthesis' есть → isMetaSynthesis станет true", l3.some((r) => r.parentType === "synthesis" && r.parentSynthesisId === parent));
    // уборка импортов (тяжёлые)
    await db.delete(schema.syntheses).where(eq(schema.syntheses.userId, uC.id));
    await db.delete(schema.users).where(eq(schema.users.id, uC.id));
  }

  console.log("── текстовые контракты ──");
  const impS = read("server/services/import-service.ts");
  check("ветка UUID цела", /if \(sid && UUID_RE\.test\(sid\) && sid !== synthesisId\)/.test(impS) && /findSameOwnerSynthesesByTitle\(/.test(impS));
  const cl = read("client/src/api/client.ts");
  for (const c of ["LINEAGE_SELF", "LINEAGE_CYCLE", "LINEAGE_EXISTS"]) {
    check(`ApiErrorCode += ${c}`, cl.includes(`"${c}"`));
    check(`03 §4.3 += ${c}`, read("docs/03-specification.md").includes(c));
  }
  const rt = read("server/routes/lineage.ts");
  check("роут POST /:id/lineage/link на lineageRoutes", /lineageRoutes\.post\("\/:id\/lineage\/link"/.test(rt));
  check("роут: владелец родителя проверяется", /parent\.userId !== user\.id/.test(rt));
  check("ImportPage: второй шаг «Точно связать?»", /Точно связать\?/.test(read("client/src/pages/ImportPage.tsx")));
  check("api/lineage: linkParent", /export function linkParent\(/.test(read("client/src/api/lineage.ts")));

  // уборка
  await db.delete(schema.syntheses).where(eq(schema.syntheses.userId, uA.id));
  await db.delete(schema.syntheses).where(eq(schema.syntheses.userId, uB.id));
  await db.delete(schema.users).where(eq(schema.users.id, uA.id));
  await db.delete(schema.users).where(eq(schema.users.id, uB.id));
} catch (e) {
  failed++;
  console.error("  ✗ исключение:", e?.stack ?? e);
} finally {
  await closeDb().catch(() => {});
  await closeRedis().catch(() => {});
}
console.log(`\nИТОГ: ${n - failed} ✓ / ${failed} ✗`);
process.exit(failed ? 1 : 0);
