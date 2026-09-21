/**
 * Режимы в импортированном файле одностраничника (2026-09-21, вне бесед) —
 * живая PG, без сервера. Фикстура: живой файл (TIM_FILE; по умолчанию
 * /mnt/user-data/uploads/PS-6933-6RIK-…html; без файла — пропуск) + блок
 * #philosynth-modes в разметке buildModesExportSection [17535] ДОСЛОВНО
 * (обёртка с отступами строк, data-mode-*). Разметка сверена с настоящим
 * прогоном одностраничника: импорт живого файла, runMode на моке API ×4,
 * saveHTML — сервис получил те же четыре результата.
 *
 *  M1  импорт: четыре результата, ключи/параметры/даты файла, html без
 *      пробельного обрамления обёртки (== тому, что лежало в DOC_STATE);
 *  M2  экспорт → импорт дважды: результаты побайтно те же (до правки
 *      каждый круг прибавлял 16 пробельных символов);
 *  M3  файл без режимов — mode_results пуст.
 * Запуск: node_modules/.bin/tsx tests/test-import-modes.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

const FILE = process.env.TIM_FILE ?? "/mnt/user-data/uploads/PS-6933-6RIK-vmeschayuschiy-razlom-rgG2.html";
if (!existsSync(FILE)) { console.log("TIM_FILE не задан или файла нет — пропуск"); process.exit(0); }

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 500)); }
}
const { db, closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");
const schema = await import("../server/db/schema.ts");
const imp = await import("../server/services/import-service.ts");
const { exportHTML } = await import("../server/services/export/html-exporter.ts");
const { eq, asc } = await import("drizzle-orm");

import { RESULTS, withModes } from "./modes-fixture.mjs";
const TAG = randomUUID().slice(0, 8);
const live = readFileSync(FILE, "utf8");
const modesOf = async (sid) =>
  (await db.select().from(schema.modeResults).where(eq(schema.modeResults.synthesisId, sid)).orderBy(asc(schema.modeResults.createdAt)))
    .map((r) => [r.modeKey, r.paramValue, r.htmlContent, r.createdAt.toISOString()]);

let uid;
try {
  const [u] = await db.insert(schema.users).values({ email: `m-${TAG}@tim.local`, passwordHash: "x" }).returning({ id: schema.users.id });
  uid = u.id;
  check("фикстура: блок режимов вставлен", withModes(live).includes('id="philosynth-modes"'));

  console.log("── M1 импорт ──");
  const r1 = await imp.importHTML(withModes(live), uid, "with-modes.html");
  const m1 = await modesOf(r1.synthesisId);
  check("четыре результата", m1.length === 4, m1.map((x) => x.slice(0, 2)));
  check("ключи и параметры файла", m1.map((x) => x[0] + "|" + x[1]).join(";") === RESULTS.map((x) => x[0] + "|" + x[2]).join(";"));
  check("даты — из data-mode-timestamp", m1.every((x, i) => x[3] === RESULTS[i][3]), m1.map((x) => x[3]));
  check("html без пробельного обрамления обёртки (== DOC_STATE одностраничника)", m1.every((x, i) => x[2] === RESULTS[i][4]), m1.map((x) => x[2].length));

  console.log("── M2 экспорт → импорт ×2 ──");
  let cur = r1.synthesisId;
  for (let k = 1; k <= 2; k++) {
    const exp = await exportHTML(cur);
    check(`круг ${k}: экспорт несёт 4 результата`, (exp.match(/class="philosynth-mode"/g) || []).length === 4);
    const r = await imp.importHTML(exp, uid, `rt${k}.html`);
    cur = r.synthesisId;
    const m = await modesOf(cur);
    check(`круг ${k}: результаты побайтно те же`, JSON.stringify(m) === JSON.stringify(m1), m.map((x) => x[2].length));
  }

  console.log("── M3 без режимов ──");
  const r3 = await imp.importHTML(live, uid, "plain.html");
  check("файл без режимов — mode_results пуст", (await modesOf(r3.synthesisId)).length === 0);
} catch (e) {
  failed++; console.log("  ✗ КРАХ:", e);
} finally {
  if (uid) {
    await db.delete(schema.syntheses).where(eq(schema.syntheses.userId, uid));
    await db.delete(schema.users).where(eq(schema.users.id, uid));
  }
  await closeDb(); await closeRedis();
}
console.log(`\nИТОГ: ${n - failed} ✓ / ${failed} ✗`);
process.exit(failed ? 1 : 0);
