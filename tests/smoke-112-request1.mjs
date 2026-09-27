#!/usr/bin/env node
/**
 * smoke-112-request1.mjs — смоук первого запроса беседы 11.2 (язык
 * интерфейса: словарь языков и правило владельца, ICU-плюралы в tl(),
 * каталоги-генераты, язык запроса по cookie/Accept-Language, codemod и
 * зеркала с данными, Д-16 — поиск подразделов по месту). Чистые функции,
 * без БД и браузера. Запуск: node_modules/.bin/tsx tests/smoke-112-request1.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_UI_LOCALE,
  GEN_FALLBACK,
  GEN_LANG_VALUES,
  LANG_OPTIONS,
  UI_LOCALES,
  UI_TO_GEN,
  genLangForUi,
  isUiLocale,
} from "../packages/shared/i18n/locales.ts";
import {
  currentCatalogLocale,
  formatMessage,
  parseMessage,
  placeholderNames,
  pluralCategoriesOf,
  pluralFormsOf,
  setCatalogProvider,
  tl,
} from "../packages/shared/i18n/t.ts";
import {
  catalogFor,
  currentLocale,
  currentLocaleSource,
  installServerCatalogProvider,
  localeFromAcceptLanguage,
  resetCatalogs,
  resolveGuestLocale,
  runWithLocale,
  setRequestLocale,
} from "../server/i18n/locale.ts";
import { parseFragment, resolveSubsection } from "../server/utils/html-parser.ts";
import { resolveSubsection as reexported } from "../server/services/generation-service.ts";
import { indexSectionSubsections, thesisLabelsFromHtml } from "../server/services/recommendations.ts";
import { recommendationProseOf } from "../server/services/recommendation-planner.ts";
import {
  MIRROR_EXCLUSIONS,
  exclusionSpan,
  mirrorExclusionFor,
  placeholderSet,
  pluralFormProblems,
  readTable,
  scanCalls,
} from "../scripts/i18n/i18n-core.mjs";
import { compareCatalogs, splitCatalog } from "../scripts/i18n/i18n-split.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? "\n    " + detail : ""}`); }
};

/* ── 1. Словарь языков и правило владельца ── */
console.log("═══ 1. locales: UI_LOCALES, UI_TO_GEN, genLangForUi ═══");
ok("UI_LOCALES = ru, en, de", UI_LOCALES.join() === "ru,en,de" && DEFAULT_UI_LOCALE === "ru");
ok("UI_TO_GEN ⊆ LANG_OPTIONS (один список)", Object.values(UI_TO_GEN).every((g) => GEN_LANG_VALUES.includes(g)));
ok("GEN_FALLBACK = English и есть в LANG_OPTIONS", GEN_FALLBACK === "English" && GEN_LANG_VALUES.includes(GEN_FALLBACK));
ok("LANG_OPTIONS — 9 пар, «__custom» последним", LANG_OPTIONS.length === 9 && LANG_OPTIONS.at(-1)[0] === "__custom" && !GEN_LANG_VALUES.includes("__custom"));
ok("genLangForUi: ru→Russian, en→English, de→German", genLangForUi("ru") === "Russian" && genLangForUi("en") === "English" && genLangForUi("de") === "German");
ok("genLangForUi: неизвестное → English", genLangForUi("fr") === "English" && genLangForUi("") === "English");
ok("isUiLocale строг", isUiLocale("de") && !isUiLocale("DE") && !isUiLocale(null) && !isUiLocale("ru-RU"));

/* ── 2. Плюралы ── */
console.log("═══ 2. t.ts: разбор сообщения и ICU-плюралы ═══");
const ruP = "{n, plural, one {# рекомендация} few {# рекомендации} many {# рекомендаций} other {# рекомендации}}";
const expect = { 1: "1 рекомендация", 2: "2 рекомендации", 5: "5 рекомендаций", 11: "11 рекомендаций", 21: "21 рекомендация", 22: "22 рекомендации", 25: "25 рекомендаций", 101: "101 рекомендация", 0: "0 рекомендаций" };
for (const [n, want] of Object.entries(expect)) ok(`ru ${n}`, formatMessage(ruP, { n: Number(n) }) === want, formatMessage(ruP, { n: Number(n) }));
ok("ru дробное → other", formatMessage(ruP, { n: 1.5 }) === "1.5 рекомендации");
const enP = "{n, plural, one {# recommendation} other {# recommendations}}";
ok("en 1/2", formatMessage(enP, { n: 1 }, "en") === "1 recommendation" && formatMessage(enP, { n: 2 }, "en") === "2 recommendations");
ok("точная форма =0", formatMessage("{n, plural, =0 {нет} one {#} other {#}}", { n: 0 }) === "нет");
ok("плюрал и подстановка рядом", formatMessage("{who}: " + enP, { who: "A", n: 3 }, "en") === "A: 3 recommendations");
ok("вложенная подстановка в форме", formatMessage("{n, plural, one {# для {who}} other {# для {who}}}", { n: 1, who: "X" }) === "1 для X");
ok("нет форм языка → other", formatMessage("{n, plural, one {a} other {b}}", { n: 3 }, "ru") === "b");
ok("без параметра плюрала → other, # пусто", formatMessage(enP, {}, "en") === " recommendations");
ok("неизвестная подстановка остаётся", formatMessage("Автор: {a} {b}", { a: "X" }) === "Автор: X {b}");
ok("null/boolean → пусто, число → строка", formatMessage("{a}|{b}|{c}", { a: null, b: true, c: 7 }) === "||7");
ok("непарные скобки не ломают (пробелы вокруг имени снимаются)", formatMessage("a { b } {c", { c: 1 }) === "a {b} {c");
ok("plural без other — не плюрал (текст как есть)", formatMessage("{n, plural, one {a}}", { n: 1 }) === "{n, plural, one {a}}");
ok("parseMessage: три вида кусков", parseMessage("x {a} " + ruP).map((p) => p.kind).join() === "text,arg,text,plural");
ok("pluralFormsOf", JSON.stringify(pluralFormsOf(ruP)) === JSON.stringify([{ name: "n", forms: ["one", "few", "many", "other"] }]));
ok("placeholderNames видит аргумент и вложенные", placeholderNames("{a} {n, plural, one {#} other {{b}}}").join() === "a,b,n");
ok("pluralCategoriesOf ru/en/de", pluralCategoriesOf("ru").join() === "few,many,one,other" && pluralCategoriesOf("en").join() === "one,other" && pluralCategoriesOf("de").join() === "one,other");
ok("placeholderSet (сверка перевода) через тот же разбор", placeholderSet(ruP) === "{n}" && placeholderSet("{a} и {b}") === "{a},{b}");
ok("pluralFormProblems: few в английском — отказ", pluralFormProblems("{n, plural, one {a} few {b} other {c}}", "en").length === 1);
ok("pluralFormProblems: русский без many — отказ", pluralFormProblems("{n, plural, one {a} few {b} other {c}}", "ru").length === 1);
ok("pluralFormProblems: полный русский — чисто; =N допустимо", !pluralFormProblems(ruP, "ru").length && !pluralFormProblems("{n, plural, =1 {x} one {a} other {b}}", "en").length);

/* ── 3. Провайдер каталога с языком ── */
console.log("═══ 3. setCatalogProvider({ locale, strings }) ═══");
setCatalogProvider(() => ({ locale: "en", strings: { k: enP, plain: "Hello" } }));
ok("перевод из каталога с правилами его языка", tl("k", ruP, { n: 2 }) === "2 recommendations" && tl("plain", "Привет") === "Hello");
ok("нет ключа → русский с русскими правилами", tl("missing", ruP, { n: 5 }) === "5 рекомендаций");
ok("currentCatalogLocale = en", currentCatalogLocale() === "en");
setCatalogProvider(null);
ok("без провайдера — ru", currentCatalogLocale() === "ru" && tl("k", "Привет") === "Привет");

/* ── 4. Каталоги-генераты ── */
console.log("═══ 4. i18n:split → generated/<lang>.json ═══");
const table = readTable(ROOT);
const cmp = compareCatalogs(ROOT);
ok("generated/en.json и de.json ≡ нарезке", cmp.every((r) => r.actual === r.expected), cmp.filter((r) => r.actual !== r.expected).map((r) => r.rel).join());
const en = splitCatalog(table, "en");
ok("каталог несёт locale и ≥1500 строк", en.locale === "en" && Object.keys(en.strings).length >= 1500);
ok("строки data и obsolete не попадают", Object.entries(table.strings).every(([k, r]) => !(r.data || r.obsolete) || !(k in en.strings)));
ok("черновики попадают", Object.entries(table.strings).some(([k, r]) => r.draft?.includes("en") && k in en.strings));
ok("неговорящих имён подстановок нет", !Object.values(table.strings).some((r) => Object.keys(r.params ?? {}).some((p) => p === "value" || /\d$/.test(p))));
ok("говорящие имена из names.json params: jsonErrorAt", Object.keys(table.strings["adminPromptsPage.jsonErrorAt"].params).join() === "message,line,column");
ok("русского каталога нет", !fs.existsSync(path.join(ROOT, "packages/shared/i18n/generated/ru.json")));

/* ── 5. Язык запроса на сервере ── */
console.log("═══ 5. server/i18n/locale ═══");
ok("вне запроса — ru/default", currentLocale() === "ru" && currentLocaleSource() === "default");
ok("Accept-Language: по q, en-GB → en, чужое → null", localeFromAcceptLanguage("fr;q=0.9, de;q=0.8, en-GB;q=0.7") === "de" && localeFromAcceptLanguage("en-GB") === "en" && localeFromAcceptLanguage("fr,it") === null && localeFromAcceptLanguage("") === null);
ok("cookie первее заголовка", resolveGuestLocale("en", "de").locale === "en" && resolveGuestLocale("en", "de").source === "cookie");
ok("негодная cookie → заголовок", resolveGuestLocale("xx", "de").locale === "de" && resolveGuestLocale("xx", "de").source === "accept-language");
ok("ничего → ru", resolveGuestLocale(undefined, undefined).locale === "ru");
ok("runWithLocale + setRequestLocale (пользователь первым)", runWithLocale("en", () => { setRequestLocale("de"); return currentLocale() + "/" + currentLocaleSource(); }) === "de/user");
ok("setRequestLocale вне контекста — no-op", (setRequestLocale("de"), currentLocale() === "ru"));
ok("setRequestLocale с null не трогает язык", runWithLocale("en", () => { setRequestLocale(null); return currentLocale(); }) === "en");
resetCatalogs();
const cat = catalogFor("en");
ok("catalogFor(en) читает генерат; ru → null", cat && cat.locale === "en" && Object.keys(cat.strings).length >= 1500 && catalogFor("ru") === null);
installServerCatalogProvider();
ok("tl() в контексте en отвечает по-английски", runWithLocale("en", () => tl("common.invalidData", "Невалидные данные")) === "Invalid data");
ok("tl() вне контекста — по-русски", tl("common.invalidData", "Невалидные данные") === "Невалидные данные");
setCatalogProvider(null);

/* ── 6. Codemod и зеркала с данными ── */
console.log("═══ 6. codemod применён, зеркала оставлены ═══");
const scan = scanCalls(ROOT);
ok("вызовов tl() в коде ≥ 1800 ключей, без ошибок", scan.calls.size >= 1800 && scan.problems.length === 0, scan.problems.slice(0, 2).join("; "));
ok("MIRROR_EXCLUSIONS: ≥5 записей с доводами", MIRROR_EXCLUSIONS.length >= 5 && MIRROR_EXCLUSIONS.every((x) => x.reason && x.file && (x.block || x.text)));
for (const x of MIRROR_EXCLUSIONS) {
  const src = fs.readFileSync(path.join(ROOT, x.file), "utf8");
  if (x.block) {
    const span = exclusionSpan(src, x.block);
    ok(`область найдена и без tl(): ${x.file} ${x.block[0]}`, span && !/\btl\(/.test(src.slice(span[0], span[1])));
  } else ok(`литерал на месте: ${x.file} «${x.text}»`, src.includes(`"${x.text}"`));
}
const mm = fs.readFileSync(path.join(ROOT, "client/src/components/modes/ModeModal.tsx"), "utf8");
ok("mirrorExclusionFor попадает по области", !!mirrorExclusionFor("client/src/components/modes/ModeModal.tsx", mm, { start: mm.indexOf("⚔ Оппонент"), end: mm.indexOf("⚔ Оппонент") + 5, text: "⚔ Оппонент" }));
ok("mirrorExclusionFor чужого файла — null", mirrorExclusionFor("client/src/App.tsx", "", { start: 0, end: 1, text: "x" }) === null);
const form = fs.readFileSync(path.join(ROOT, "client/src/components/synthesis/SynthesisForm.tsx"), "utf8");
ok("SynthesisForm берёт LANG_OPTIONS из shared", !/const LANG_OPTIONS\s*=/.test(form) && form.includes('from "@philosynth/shared/i18n/locales"'));

/* ── 7. Д-16: поиск подразделов по месту ── */
console.log("═══ 7. Д-16: resolveSubsection в html-parser и потребители ═══");
ok("generation-service реэкспортирует то же ядро", reexported === resolveSubsection);
const order = ["Онтологические тезисы", "Эпистемологические тезисы", "Этические и аксиологические тезисы", "Сводная таблица тезисов"];
const html = `<div data-section="Ontological theses"><p>a</p></div><div data-section="Epistemological theses"><p>b</p></div><div data-section="Ethical theses"><p>c</p></div><div data-section="Summary table"><table class="doc-table"><tbody><tr><td>О-1</td><td>Бытие едино</td></tr><tr><td>Э-1</td><td>Знание есть</td></tr></tbody></table></div>`;
const look = resolveSubsection(parseFragment(html), order[3], order);
ok("переведённый подраздел опознан по месту с предупреждением", look.byPosition && look.actualName === "Summary table" && /по месту/.test(look.warning ?? ""));
ok("без порядка — не найден, без предупреждения", resolveSubsection(parseFragment(html), order[3]).el === null);
const abc = new Map(), warn = [];
const canon = indexSectionSubsections("theses", html, order, abc, warn);
ok("indexSectionSubsections → канонические имена", canon.join("|") === order.join("|"));
ok("карта канон → фактический атрибут", abc.get("theses\u0000Сводная таблица тезисов") === "Summary table" && abc.size === 4);
ok("по предупреждению на подраздел", warn.length === 4);
ok("без порядка → фактические атрибуты", indexSectionSubsections("theses", html, [], new Map(), []).join("|") === "Ontological theses|Epistemological theses|Ethical theses|Summary table");
const ruHtml = order.map((n) => `<div data-section="${n}"><p>x</p></div>`).join("");
ok("русский документ: канон = атрибут, карта пуста", indexSectionSubsections("theses", ruHtml, order, new Map(), []).join("|") === order.join("|"));
const mixed = `<div data-section="Онтологические тезисы"><p>a</p></div><div data-section="Ручной подраздел"><p>z</p></div>`;
ok("лишний подраздел вне карты остаётся как есть", indexSectionSubsections("theses", mixed, order, new Map(), []).join("|") === "Онтологические тезисы|Ручной подраздел");
const labels = thesisLabelsFromHtml(html, order, []);
ok("thesisLabelsFromHtml читает переведённую сводную таблицу", labels.size === 2 && [...labels.values()].join() === "О-1,Э-1");
ok("thesisLabelsFromHtml: запасной нечёткий поиск жив", thesisLabelsFromHtml(`<div data-section="Сводная таблица (тезисы)"><table><tbody><tr><td>О-1</td><td>x</td></tr></tbody></table></div>`).size === 1);
const critOrder = ["Внутренняя когерентность", "Оценка новизны", "Рекомендации по улучшению"];
const crit = `<div data-section="Internal coherence"><p>x</p></div><div data-section="Novelty"><p>y</p></div><div data-section="Recommendations"><ol><li>Рекомендация 1. Уточнить</li><li>Рекомендация 2. Убрать</li></ol></div>`;
ok("recommendationProseOf по месту", recommendationProseOf(crit, "2", critOrder) === "Рекомендация 2. Убрать");
ok("recommendationProseOf без порядка честно null", recommendationProseOf(crit, "2") === null);
ok("recommendationProseOf по точному имени как прежде", recommendationProseOf(crit.replace('"Recommendations"', '"Рекомендации по улучшению"'), "1") === "Рекомендация 1. Уточнить");

console.log(`\n${pass} ✓, ${fail} ✗`);
process.exit(fail ? 1 : 0);
