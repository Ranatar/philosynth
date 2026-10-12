#!/usr/bin/env node
/**
 * i18n:add-lang — завести новый язык интерфейса одной командой (беседа 12.5,
 * Д-33; пункт 1 типовой беседы L «новый язык интерфейса», 07 §8).
 *
 *   node scripts/i18n/i18n-add-lang.mjs <xx> [--locale <bcp47>] [--dry]
 *
 * Что делает (всё — идемпотентно; язык уже заведён → ничего не меняет):
 *   1. scripts/i18n/i18n-core.mjs — `LANGS` += xx, `LANG_LOCALE[xx]` = код
 *      Intl (по умолчанию xx; --locale задаёт иной, например «pt-BR»);
 *   2. packages/shared/i18n/strings.json — `meta.languages` += xx и колонка
 *      xx: null у КАЖДОЙ строки (включая obsolete — у таблицы одна форма);
 *      порядок полей записи берётся из meta.languages (writeTable);
 *   3. `npm run i18n:split` — каталог generated/xx.json (пока пустой: ни одной
 *      строки с переводом) и карта данных; сверка 4aw/4ay ждёт свежих генератов.
 *
 * Чего НЕ делает (пункты 2–4 беседы L остаются рукой; команда печатает
 * список): `UI_LOCALES`/`UI_TO_GEN` в packages/shared/i18n/locales.ts (сторож
 * 4aw требует LANGS ≡ UI_LOCALES — до правки locales.ts он красный, это
 * ожидаемо внутри одного запроса беседы), `UI_LOCALE_NAMES` в
 * client/src/i18n/i18n-store.ts, черновик перевода (`i18n:export --lang xx
 * --dry --out …` → перевод → `i18n:import … --draft` → `i18n:split`),
 * NEXT-CONTEXT. Без черновика `i18n:check --strict` красный у каждого ключа
 * («нет перевода xx») — так и задумано 11.4: каталог обязан нести все языки.
 *
 * Формы плюралов нового языка инструменты знают сами (Intl.PluralRules):
 * команда печатает категории, которые обязан нести каждый {n, plural, …}.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LANGS, LANG_LOCALE, TABLE_PATH, readTable, writeTable } from "./i18n-core.mjs";
import { pluralCategoriesOf } from "../../packages/shared/i18n/t.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CORE_REL = "scripts/i18n/i18n-core.mjs";
const argv = process.argv.slice(2);
const lang = argv.find((a) => !a.startsWith("--"));
const dry = argv.includes("--dry");
const locale = argv.includes("--locale") ? argv[argv.indexOf("--locale") + 1] : lang;

if (!lang || !/^[a-z]{2,3}$/.test(lang)) {
  console.error("нужно: <xx> — код языка (BCP-47 без региона, строчными: fr, pt, zh); иной код Intl — --locale <bcp47>");
  process.exit(2);
}
if (!locale || !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale)) {
  console.error(`негодный код Intl: ${locale}`);
  process.exit(2);
}
try { new Intl.PluralRules(locale); } catch { console.error(`Intl не знает язык «${locale}»`); process.exit(2); }

const report = [];
const note = (s) => report.push(s);

/* 1. LANGS и LANG_LOCALE в i18n-core.mjs — текстовой правкой двух литералов */
const coreAbs = path.join(ROOT, CORE_REL);
let core = fs.readFileSync(coreAbs, "utf8");
const langsRe = /export const LANGS = \[([^\]]*)\];/;
const localeRe = /export const LANG_LOCALE = \{([^}]*)\};/;
const mL = core.match(langsRe), mLL = core.match(localeRe);
if (!mL || !mLL) { console.error(`${CORE_REL}: не найдены литералы LANGS / LANG_LOCALE — правка руками`); process.exit(1); }
const listed = mL[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
if (listed.join() !== LANGS.join()) { console.error(`${CORE_REL}: литерал LANGS (${listed.join()}) ≠ загруженному (${LANGS.join()})`); process.exit(1); }
if (LANGS.includes(lang)) note(`LANGS уже содержит «${lang}» — i18n-core не тронут`);
else {
  core = core.replace(langsRe, `export const LANGS = [${[...listed, lang].map((l) => JSON.stringify(l)).join(", ")}];`);
  const entries = mLL[1].split(",").map((s) => s.trim()).filter(Boolean);
  entries.push(`${lang}: ${JSON.stringify(locale)}`);
  core = core.replace(localeRe, `export const LANG_LOCALE = { ${entries.join(", ")} };`);
  if (!dry) fs.writeFileSync(coreAbs, core);
  note(`${CORE_REL}: LANGS += ${lang}; LANG_LOCALE[${lang}] = ${JSON.stringify(locale)}`);
}
if (LANG_LOCALE[lang] && LANG_LOCALE[lang] !== locale) note(`⚠ LANG_LOCALE[${lang}] уже = ${JSON.stringify(LANG_LOCALE[lang])}, довод --locale ${JSON.stringify(locale)} не применён`);

/* 2. Таблица: meta.languages и колонка у каждой строки */
const table = readTable(ROOT);
const metaLangs = Array.isArray(table.meta.languages) ? [...table.meta.languages] : [...LANGS];
let touched = 0;
if (!metaLangs.includes(lang)) metaLangs.push(lang);
for (const row of Object.values(table.strings)) if (!(lang in row)) { row[lang] = null; touched++; }
if (touched || metaLangs.join() !== (table.meta.languages ?? []).join()) {
  table.meta.languages = metaLangs;
  table.meta.langAdded = { ...(table.meta.langAdded ?? {}), [lang]: new Date().toISOString() };
  if (!dry) writeTable(path.join(ROOT, TABLE_PATH), table);
  note(`${TABLE_PATH}: meta.languages = [${metaLangs.join(", ")}]; колонка «${lang}: null» дописана у ${touched} строк`);
} else note(`${TABLE_PATH}: язык «${lang}» уже в meta.languages, колонка у всех строк есть`);

/* 3. Генераты */
if (!dry) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/i18n/i18n-split.mjs")], { cwd: ROOT, encoding: "utf8" });
  note(`i18n:split → ${r.status === 0 ? "каталоги и карта перегенерированы" : "ОШИБКА:\n" + (r.stdout + r.stderr).trim()}`);
  if (r.status !== 0) { for (const s of report) console.log("• " + s); process.exit(1); }
} else note("i18n:split (пропущено в --dry)");

/* отчёт и список ручной работы */
console.log(`${dry ? "(--dry) " : ""}язык «${lang}» (Intl: ${locale}; формы плюрала: ${pluralCategoriesOf(locale).join("/")})`);
for (const s of report) console.log("• " + s);
console.log(`
Осталось рукой (беседа L, пункты 2–4; 07 §8):
  2. packages/shared/i18n/locales.ts — UI_LOCALES += "${lang}", UI_TO_GEN.${lang} = <язык генерации из LANG_OPTIONS>;
     client/src/i18n/i18n-store.ts — UI_LOCALE_NAMES.${lang} = <самоназвание> (не переводится, MIRROR_EXCLUSIONS по тексту).
     Сторож 4aw требует LANGS ≡ UI_LOCALES — до этой правки check:integration красный.
  3. Черновик: npm run i18n:export -- --lang ${lang} --dry --out i18n-request.${lang}.json → перевод всех строк
     (подстановки {имя} сохранить; формы плюрала: ${pluralCategoriesOf(locale).join(", ")}) →
     npm run i18n:import -- i18n-request.${lang}.json --draft → npm run i18n:split → npm run i18n:check -- --strict.
     Без черновика --strict красный у каждого ключа («нет перевода ${lang}») — так задумано 11.4.
  4. Сторожа 4aw/4ax/4ay и тесты 112–114 языки берут из UI_LOCALES (12.5) — править их не нужно;
     NEXT-CONTEXT — состояние языков.`);
