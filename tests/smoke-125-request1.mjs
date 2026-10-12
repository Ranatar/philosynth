/**
 * Смоук беседы 12.5 (запрос 1) — чистые функции (A–D) и живая БД (E), без браузера.
 *  A. Д-43: renderThesesTable сохраняет прежний текст ячейки «Тип» у строки с
 *     той же меткой, если mapThesisType(прежний) равен типу в БД; иначе —
 *     каноническая метка. На встроенной таблице и, если задан T125_FILE
 *     (экспорт службы — файл концепции 10.1–12.2), на живом документе:
 *     перерисовка таблицы тезисов НЕ меняет ни одной ячейки «Тип».
 *  B. Д-40: надстройка раскладки блока тезиса — накладывается ровно один раз
 *     в конец section.theses.shared, идемпотентна, снимается побайтно; её
 *     «Обоснование.» узнаёт разбор второй модели (readThesisBlock).
 *  C. Д-33: сканер значений файлов-данных — на HEAD ни одного значения без
 *     строки таблицы и ни одного расхождения; i18n:add-lang --dry на репо
 *     ничего не пишет и перечисляет ручные шаги.
 *  D. Д-39: ROOT генераторов — два уровня вверх.
 *  E. Д-49: встроенное состояние выгрузки (philosynth-state) пишет
 *     parentContextSchema колонкой syntheses.parent_context_schema; круг
 *     экспорт → импорт на живой БД (PG+Redis; без них — пропуск) хранит
 *     monolithic и selective-v1 как есть.
 * Запуск: node_modules/.bin/tsx tests/smoke-125-request1.mjs
 *   T125_FILE=<экспорт службы> — живой документ для A.
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

let ok = 0, bad = 0;
const t = (name, cond, extra = "") => { if (cond) { ok++; console.log(`  ✓ ${name}`); } else { bad++; console.log(`  ✗ ${name} ${extra}`); } };
const J = (o) => JSON.stringify(o);
const rd = (rel) => readFile(new URL(rel, import.meta.url), "utf8");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

console.log("A. Д-43: столбец «Тип» при перерисовке");
const { locateDocTable, readThesisBlock } = await import("../server/utils/html-parser.ts");
const { mapThesisType, parseThesesFromHTML } = await import("../server/services/element-parser.ts");
const { renderThesesTable, THESIS_TYPE_LABELS } = await import("../server/services/element-renderer.ts");
const typeCells = (html) => [...html.matchAll(/<tr><td>[^<]*<\/td><td>[^<]*<\/td><td>([^<]*)<\/td>/g)].map((m) => m[1]);
const SUB = "Сводная таблица тезисов";
const fixture = `<div data-section="${SUB}"><h4>${SUB}</h4><table class="doc-table"><thead><tr><th>№</th><th>Формулировка тезиса</th><th>Тип (онтол./эпистем./этич.)</th><th>Степень новизны</th><th>Связанные категории</th></tr></thead><tbody>` +
  `<tr><td>О-1</td><td>Бытие есть становление</td><td>Онтологический</td><td>высокая</td><td>Бытие</td></tr>` +
  `<tr><td>Э-1</td><td>Знание есть разлом</td><td>Эпистемологический (гносеологический)</td><td>средняя</td><td>Знание</td></tr>` +
  `<tr><td>А-1</td><td>Благо есть мера</td><td>Этический / аксиологический</td><td>низкая</td><td>Благо</td></tr>` +
  `</tbody></table></div>`;
const loc = locateDocTable(fixture, [{ subsection: SUB }]);
t("locateDocTable отдаёт ячейки строк (rows)", loc?.rows.length === 3 && loc.rows[2][0] === "А-1" && loc.rows[2][2] === "Этический / аксиологический", J(loc?.rows));
const rows = [
  { thesisNum: 1, label: "О-1", formulation: "Бытие есть становление", thesisType: "ontological", noveltyDegree: "высокая", relatedCategories: ["Бытие"] },
  { thesisNum: 2, label: "Э-1", formulation: "Знание есть разлом", thesisType: "epistemological", noveltyDegree: "средняя", relatedCategories: ["Знание"] },
  { thesisNum: 3, label: "А-1", formulation: "Благо есть мера (правка)", thesisType: "ethical", noveltyDegree: "низкая", relatedCategories: ["Благо"] },
];
const re1 = renderThesesTable(rows, { headers: loc.headers, priorRows: loc.rows });
t("прежний текст «Тип» сохранён у всех строк (правка формулировки его не трогает)", J(typeCells(re1)) === J(["Онтологический", "Эпистемологический (гносеологический)", "Этический / аксиологический"]), J(typeCells(re1)));
t("формулировка при этом перерисована", re1.includes("<td>Благо есть мера (правка)</td>"));
const re2 = renderThesesTable(rows.map((r) => (r.label === "А-1" ? { ...r, thesisType: "ontological" } : r)), { headers: loc.headers, priorRows: loc.rows });
t("тип в БД сменился — ячейка становится канонической меткой", typeCells(re2)[2] === THESIS_TYPE_LABELS.ontological, J(typeCells(re2)));
const re3 = renderThesesTable(rows, { headers: loc.headers });
t("без прежних строк — канонические метки (как до 12.5)", J(typeCells(re3)) === J([THESIS_TYPE_LABELS.ontological, THESIS_TYPE_LABELS.epistemological, THESIS_TYPE_LABELS.ethical]), J(typeCells(re3)));
const re4 = renderThesesTable(rows, { headers: ["Тип", "№", "Формулировка", "Новизна", "Категории"], priorRows: [["Онтологический", "О-1", "x", "y", "z"]] });
t("столбец «Тип» ищется по заголовку, не по месту", typeCells(re4)[0] === THESIS_TYPE_LABELS.ontological && /<td>О-1<\/td><td>Бытие есть становление<\/td><td>онтологический<\/td>/.test(re4), re4.slice(0, 300));
t("mapThesisType экспортирован и различает три типа", mapThesisType("Этический / аксиологический") === "ethical" && mapThesisType("гносеологический") === "epistemological" && mapThesisType("прочее") === "ontological");
const file = process.env.T125_FILE ?? process.env.T121_FILE;
if (!file) console.log("  ~ T125_FILE не задан — живой документ пропущен");
else if (!existsSync(file)) console.log("  ~ файл не найден, пропущен:", file);
else {
  const html = readFileSync(file, "utf8");
  const m = new RegExp(`<div[^>]*data-section="${SUB}"[\\s\\S]*?</table>`).exec(html);
  t("живой документ: сводная таблица тезисов найдена", !!m);
  if (m) {
    const sec = m[0] + "</div>";
    const live = locateDocTable(sec, [{ subsection: SUB }]);
    const parsed = parseThesesFromHTML(sec).map((p) => ({ thesisNum: p.thesisNum, label: p.label ?? null, formulation: p.formulation, thesisType: p.thesisType, noveltyDegree: p.noveltyDegree, relatedCategories: p.relatedCategories }));
    const re = renderThesesTable(parsed, { headers: live.headers, priorRows: live.rows });
    const before = live.rows.map((r) => r[2]);
    t(`живой документ: ${parsed.length} тезисов, ни одна ячейка «Тип» не изменилась при перерисовке`, parsed.length > 0 && J(typeCells(re)) === J(before), `${J([...new Set(before)])} → ${J([...new Set(typeCells(re))])}`);
    t("живой документ: ячейки «Тип» не канонические (иначе проверке нечего беречь)", before.some((c) => !Object.values(THESIS_TYPE_LABELS).includes(c)), J([...new Set(before)]));
  }
}

console.log("B. Д-40: надстройка раскладки блока тезиса");
const TL = await import("../server/config/thesis-layout-templates.ts");
const gen = await import("../server/config/section-templates.ts");
const shared = gen.SEED_SECTION_TEMPLATES.find((x) => x.key === TL.THESES_SHARED_TEMPLATE_KEY);
t("генерат section.theses.shared без надстройки", !!shared && !shared.body.includes(TL.THESIS_LAYOUT_MARKER));
const applied = TL.applyThesisLayoutOverrides(gen.SEED_SECTION_TEMPLATES);
const ap = applied.find((x) => x.key === TL.THESES_SHARED_TEMPLATE_KEY);
t("наложение: ровно одна добавка в конце, прочие шаблоны нетронуты", ap.body === shared.body + TL.THESIS_LAYOUT_ADDENDUM && applied.filter((x) => x.key !== TL.THESES_SHARED_TEMPLATE_KEY).every((x, i) => x === gen.SEED_SECTION_TEMPLATES.filter((y) => y.key !== TL.THESES_SHARED_TEMPLATE_KEY)[i]));
t("идемпотентно", TL.applyThesisLayoutOverrides(applied).find((x) => x.key === TL.THESES_SHARED_TEMPLATE_KEY).body === ap.body);
const st = TL.stripThesisLayoutAddendum(ap.body);
t("снятие — побайтно генерат", st.departed && st.text === shared.body);
t("снятие с генерата — departed=false, текст цел", !TL.stripThesisLayoutAddendum(shared.body).departed && TL.stripThesisLayoutAddendum(shared.body).text === shared.body);
t("надстройка не вводит оборотов закрытых списков 11.1 (сторож 4av)", !/СТРОГО одно из|Столбцы СТРОГО|СТРОГО из списка|\nТип:/.test(TL.THESIS_LAYOUT_ADDENDUM));
const sample = `<div data-section="Онтологические тезисы"><h4>Онтологические тезисы</h4><h5>Тезис О-1 (Разлом)</h5><p><strong>Бытие есть становление</strong></p><p><strong>${TL.THESIS_JUSTIFICATION_LEAD}</strong> Потому что так учил Гераклит.</p><p><strong>Степень новизны:</strong> высокая</p></div>`;
const blk = readThesisBlock(sample, "О-1");
t("раскладка надстройки читается второй моделью разбора: формулировка и обоснование", blk?.formulation === "Бытие есть становление" && blk?.justification === "Потому что так учил Гераклит.", J(blk));
t("требование раскладки называет все три части и дословность", /<h5>Тезис \{метка\}/.test(TL.THESIS_LAYOUT_ADDENDUM) && /ДОСЛОВНО равна формулировке в сводной таблице/.test(TL.THESIS_LAYOUT_ADDENDUM) && /первой ячейке/.test(TL.THESIS_LAYOUT_ADDENDUM));

console.log("C. Д-33: значения файлов-данных и i18n:add-lang");
const core = await import("../scripts/i18n/i18n-core.mjs");
const { scanDataValues } = await import("../scripts/i18n/i18n-data.mjs");
const { UI_LOCALES } = await import("../packages/shared/i18n/locales.ts");
const table = core.readTable(ROOT);
const scan = scanDataValues(ROOT, table);
t(`сканер: ${scan.present.length} значений со строкой, 0 без строки, 0 расхождений`, scan.present.length >= 400 && scan.missing.length === 0 && scan.mismatch.length === 0, J({ missing: scan.missing.slice(0, 3), mismatch: scan.mismatch.slice(0, 3) }));
t("LANGS ≡ UI_LOCALES ≡ meta.languages", core.LANGS.join() === UI_LOCALES.join() && (table.meta.languages ?? []).join() === core.LANGS.join());
const snapshot = readFileSync(path.join(ROOT, core.TABLE_PATH), "utf8");
const coreSrc = readFileSync(path.join(ROOT, "scripts/i18n/i18n-core.mjs"), "utf8");
const dry = spawnSync(process.execPath, [path.join(ROOT, "scripts/i18n/i18n-add-lang.mjs"), "fr", "--dry"], { cwd: ROOT, encoding: "utf8" });
t("add-lang fr --dry: исполнился, перечислил правки и ручные шаги", dry.status === 0 && /LANGS \+= fr/.test(dry.stdout) && /колонка «fr: null»/.test(dry.stdout) && /UI_LOCALES \+= "fr"/.test(dry.stdout) && /i18n:export -- --lang fr --dry/.test(dry.stdout), (dry.stdout + dry.stderr).slice(0, 400));
t("add-lang --dry ничего не записал (таблица и i18n-core побайтно прежние)", readFileSync(path.join(ROOT, core.TABLE_PATH), "utf8") === snapshot && readFileSync(path.join(ROOT, "scripts/i18n/i18n-core.mjs"), "utf8") === coreSrc);
const badCode = spawnSync(process.execPath, [path.join(ROOT, "scripts/i18n/i18n-add-lang.mjs"), "FR"], { cwd: ROOT, encoding: "utf8" });
t("add-lang отвергает негодный код", badCode.status === 2);
const chk = readFileSync(path.join(ROOT, "scripts/i18n/i18n-check.mjs"), "utf8");
t("i18n:check --strict красит значения файлов-данных без строки", /scanDataValues/.test(chk) && /dataMissing\.length \+ dataMismatch\.length/.test(chk));
const exp = readFileSync(path.join(ROOT, "scripts/i18n/i18n-export.mjs"), "utf8");
t("i18n:export --data заводит строки data", /--data/.test(exp) && /scanDataValues/.test(exp));
const pkg = JSON.parse(await rd("../package.json"));
t("npm-скрипт i18n:add-lang", pkg.scripts["i18n:add-lang"] === "node scripts/i18n/i18n-add-lang.mjs");

console.log("D. Д-39: корень генераторов");
for (const rel of ["scripts/extract/extract-export-assets.mjs", "scripts/extract/extract-section-templates.mjs", "scripts/extract/extract-seed-data.mjs"]) {
  const src = readFileSync(path.join(ROOT, rel), "utf8");
  t(`${rel}: ROOT два уровня вверх`, /\(import\.meta\.url\)\),\s*"\.\.",\s*"\.\."\)/.test(src));
}

console.log("E. Д-49: встроенное состояние выгрузки пишет колонку parent_context_schema (живая БД)");
const exSrc = readFileSync(path.join(ROOT, "server/services/export/html-exporter.ts"), "utf8");
t("html-exporter: parentContextSchema: row.parentContextSchema, константы PARENT_CONTEXT_SCHEMA_ID в состоянии нет", /parentContextSchema: row\.parentContextSchema,/.test(exSrc) && !/parentContextSchema: PARENT_CONTEXT_SCHEMA_ID/.test(exSrc));
const impSrc = readFileSync(path.join(ROOT, "server/services/import-service.ts"), "utf8");
t("import-service читает parentContextSchema из состояния (02 §4 п.9), fallback monolithic", /str\(embeddedState\?\.parentContextSchema\)/.test(impSrc) && /: "monolithic";/.test(impSrc));
let db, schema, eq, dbUp = false;
try {
  ({ db, schema } = await import("../server/db/index.ts"));
  ({ eq } = await import("drizzle-orm"));
  await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  dbUp = true;
} catch (e) {
  console.log("  ~ БД недоступна — круг экспорт → импорт пропущен:", e?.cause?.code ?? e?.message);
}
if (dbUp) {
  const exp = await import("../server/services/export/html-exporter.ts");
  const imp = await import("../server/services/import-service.ts");
  const tag = "sm125-" + Math.random().toString(36).slice(2, 8);
  const [owner] = await db.insert(schema.users).values({ email: `${tag}@sm.local`, passwordHash: "x" }).returning();
  const ids = [];
  const stateOf = (file) => JSON.parse(/<script type="application\/json" id="philosynth-state">([\s\S]*?)<\/script>/.exec(file)[1]);
  try {
    for (const schemaId of ["monolithic", "selective-v1"]) {
      const [s] = await db.insert(schema.syntheses).values({ userId: owner.id, seed: "зерно " + tag, title: `${schemaId} ${tag}`, status: "ready", sectionOrder: ["sum"], parentContextSchema: schemaId }).returning();
      ids.push(s.id);
      await db.insert(schema.sections).values({ synthesisId: s.id, key: "sum", sectionNum: 1, title: "Резюме", htmlContent: `<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">Резюме</div><div class="doc-content"><div data-section="Цели и задачи"><h4>Цели и задачи</h4><p>Текст ${tag}.</p></div></div></div>` });
      const file = await exp.exportHTML(s.id);
      const st = stateOf(file);
      t(`${schemaId}: встроенное состояние несёт схему колонки`, st.parentContextSchema === schemaId && st.parentContextSchemaVersion === 1, J([st.parentContextSchema, st.parentContextSchemaVersion]));
      const res = await imp.importHTML(file, owner.id, `${schemaId}.html`);
      ids.push(res.synthesisId);
      const [back] = await db.select({ pcs: schema.syntheses.parentContextSchema }).from(schema.syntheses).where(eq(schema.syntheses.id, res.synthesisId));
      t(`${schemaId}: после круга экспорт → импорт схема прежняя (без маркера миграции)`, back.pcs === schemaId, back.pcs);
    }
  } catch (e) {
    bad++;
    console.log("  ✗ ИСКЛЮЧЕНИЕ:", e?.stack ?? e);
  } finally {
    for (const id of ids) await db.delete(schema.syntheses).where(eq(schema.syntheses.id, id)).catch(() => {});
    await db.delete(schema.users).where(eq(schema.users.id, owner.id)).catch(() => {});
  }
}

console.log(`\nИТОГ smoke-125: ${ok} ✓ / ${bad} ✗`);
try { const { closeDb } = await import("../server/db/index.ts"); await closeDb(); } catch {}
try { const { closeRedis } = await import("../server/redis.ts"); await closeRedis(); } catch {}
process.exit(bad ? 1 : 0);
