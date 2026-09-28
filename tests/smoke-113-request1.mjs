#!/usr/bin/env node
/**
 * smoke-113-request1.mjs — смоук первого запроса беседы 11.3 (язык
 * интерфейса на клиенте: хранилище языка и каталогов, useT, переключатель,
 * форма создания без жёсткого «Russian», static-строки → фабрики, машинные
 * значения литералами, PauseModal, пометка разбора с потерями). Без БД и
 * браузера — модули и исходники. Запуск:
 *   node_modules/.bin/tsx tests/smoke-113-request1.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_UI_LOCALE, UI_LOCALES, isUiLocale } from "../packages/shared/i18n/locales.ts";
import { currentCatalogLocale, setCatalogProvider, tl } from "../packages/shared/i18n/t.ts";
import { UI_LOCALE_COOKIE as SERVER_COOKIE } from "../server/i18n/locale.ts";
import {
  UI_LOCALE_COOKIE,
  UI_LOCALE_NAMES,
  applyUserLocale,
  catalogLoadCount,
  currentUiLocale,
  loadCatalog,
  resolveInitialLocale,
  useI18nStore,
} from "../client/src/i18n/i18n-store.ts";
import { useLocale, useT } from "../client/src/i18n/useT.ts";
import { useAuthStore } from "../client/src/stores/auth-store.ts";
import { MIRROR_EXCLUSIONS, readTable, scanCalls, scanStaticCalls } from "../scripts/i18n/i18n-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const strip = (src) => src.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? "\n    " + detail : ""}`); }
};

/* ── 1. Хранилище языка ── */
console.log("═══ 1. i18n-store: язык, cookie, каталоги ═══");
ok("cookie клиента ≡ серверной (ui_locale)", UI_LOCALE_COOKIE === SERVER_COOKIE && UI_LOCALE_COOKIE === "ui_locale");
ok("самоназвания языков покрывают UI_LOCALES и не переведены", UI_LOCALES.every((l) => UI_LOCALE_NAMES[l]) && UI_LOCALE_NAMES.ru === "Русский" && UI_LOCALE_NAMES.en === "English" && UI_LOCALE_NAMES.de === "Deutsch");
// Node ≥ 21 несёт глобальный navigator.language (en-US) — вне браузера язык
// берётся из него, cookie нет; итог всегда из UI_LOCALES
const navBase = (globalThis.navigator?.language ?? "").toLowerCase().split("-")[0];
const expectedInitial = isUiLocale(navBase) ? navBase : DEFAULT_UI_LOCALE;
ok("resolveInitialLocale: cookie нет → navigator.language → ru", resolveInitialLocale() === expectedInitial && isUiLocale(resolveInitialLocale()));
const st0 = useI18nStore.getState();
ok("начальное состояние: locale по resolveInitialLocale, каталога нет (вне Vite), version 0", st0.locale === expectedInitial && st0.catalog === null && st0.version === 0 && st0.loading === false);
await st0.setLocale("ru");
useI18nStore.setState({ version: 0 });
ok("currentUiLocale() ≡ хранилищу", currentUiLocale() === useI18nStore.getState().locale && currentUiLocale() === "ru");
ok("провайдер каталога tl() поставлен хранилищем (ru → русский текст)", tl("common.logIn", "Войти") === "Войти" && currentCatalogLocale() === "ru");
ok("loadCatalog(ru) → null без запроса", (await loadCatalog("ru")) === null && !("ru" in catalogLoadCount));
// вне Vite import.meta.glob нет — загрузчиков нет, каталог честно null и без счётчика
const enOutsideVite = await loadCatalog("en");
ok("loadCatalog(en) вне Vite → null (загрузчиков нет), повтор не считается", enOutsideVite === null && (await loadCatalog("en")) === null && !("en" in catalogLoadCount));
await useI18nStore.getState().setLocale("en");
const st1 = useI18nStore.getState();
ok("setLocale(en): язык сменился, version вырос", st1.locale === "en" && st1.version === 1);
const v1 = st1.version;
await st1.setLocale("en");
ok("повтор того же языка — version не растёт (ни запроса, ни перерисовки)", useI18nStore.getState().version === v1);
await useI18nStore.getState().setLocale("xx");
ok("setLocale с чужим кодом игнорируется", useI18nStore.getState().locale === "en");
applyUserLocale(null);
ok("applyUserLocale(null) — «не выбирал», язык не меняется", useI18nStore.getState().locale === "en");
applyUserLocale("de");
ok("applyUserLocale(de) переключает язык", useI18nStore.getState().locale === "de");
await useI18nStore.getState().setLocale("ru");
ok("возврат на ru: каталог null, tl() русский", useI18nStore.getState().catalog === null && tl("common.logIn", "Войти") === "Войти");
// подменный каталог через хранилище — tl() читает его без перезагрузки
useI18nStore.setState({ locale: "en", catalog: { locale: "en", strings: { "common.logIn": "Log in", "x.plural": "{n, plural, one {# item} other {# items}}" } }, version: useI18nStore.getState().version + 1 });
ok("tl() отвечает по каталогу хранилища", tl("common.logIn", "Войти") === "Log in" && currentCatalogLocale() === "en");
ok("плюралы — по языку каталога хранилища (en: one/other)", tl("x.plural", "…", { n: 2 }) === "2 items" && tl("x.plural", "…", { n: 1 }) === "1 item");
ok("ключа нет в каталоге → русский текст", tl("nope.key", "Запасной") === "Запасной");
useI18nStore.setState({ locale: "ru", catalog: null, version: useI18nStore.getState().version + 1 });

/* ── 2. Хуки ── */
console.log("═══ 2. useT / useLocale ═══");
ok("useT и useLocale экспортированы функциями", typeof useT === "function" && typeof useLocale === "function");
const useTsrc = strip(rd("client/src/i18n/useT.ts"));
ok("useT подписан на version и возвращает tl", /useI18nStore\(\(s\) => s\.version\);/.test(useTsrc) && /return tl;/.test(useTsrc));
const appSrc = strip(rd("client/src/App.tsx"));
ok("App зовёт useT() — перерисовка дерева при смене языка", /useT\(\);/.test(appSrc));

/* ── 3. auth-store ── */
console.log("═══ 3. auth-store: setUiLocale / setGenLang ═══");
const auth = useAuthStore.getState();
ok("useAuthStore — настоящий стор (getState), с setUiLocale и setGenLang", typeof useAuthStore.getState === "function" && typeof auth.setUiLocale === "function" && typeof auth.setGenLang === "function");
const authSrc = strip(rd("client/src/stores/auth-store.ts"));
ok("setUiLocale → PATCH /auth/me { uiLocale }, применяет язык до и после", /applyUserLocale\(uiLocale\);[\s\S]*apiPatch<\{ user: AuthUser \}>\("\/auth\/me", \{ uiLocale \}\)[\s\S]*applyUserLocale\(user\.uiLocale\)/.test(authSrc));
ok("setGenLang → PATCH /auth/me { genLang } без смены интерфейса", /apiPatch<\{ user: AuthUser \}>\("\/auth\/me", \{ genLang \}\);\s*set\(\{ user \}\);/.test(authSrc) && !/setGenLang[\s\S]{0,400}applyUserLocale/.test(authSrc.slice(authSrc.indexOf("async setGenLang"), authSrc.indexOf("async setGenLang") + 500)));
ok("restore и login применяют ui_locale пользователя", /set\(\{ user: full, status: "authenticated", pending: false \}\);\s*applyUserLocale\(full\.uiLocale\);/.test(authSrc) && /set\(\{ user, status: "authenticated" \}\);\s*applyUserLocale\(user\.uiLocale\);/.test(authSrc));

/* ── 4. Переключатель и профиль ── */
console.log("═══ 4. LanguageSwitch, Header, ProfilePage ═══");
const sw = strip(rd("client/src/components/layout/LanguageSwitch.tsx"));
ok("вошедшему — setUiLocale, гостю — setLocale", /if \(authenticated\) void setUiLocale\(next\);/.test(sw) && /else void setLocale\(next\);/.test(sw));
ok("одинаковый язык — выход без действий", /if \(next === locale\) return;/.test(sw));
ok("подписи — UI_LOCALE_NAMES, кнопки с lang и aria-pressed", /\{UI_LOCALE_NAMES\[l\]\}/.test(sw) && /lang=\{l\}/.test(sw) && /aria-pressed=\{l === locale\}/.test(sw));
ok("переключатель не ходит в сеть сам", !/apiPatch|fetch\(|document\.cookie/.test(sw));
ok("два вида: topbar → .app-topbar-btn, form → .action-btn", /"app-topbar-btn app-lang-btn"/.test(sw) && /"action-btn app-lang-btn"/.test(sw));
const header = strip(rd("client/src/components/layout/Header.tsx"));
ok("в шапке переключатель стоит в .topbar-right до имени/ссылок входа", /data-testid="topbar-right">\s*<LanguageSwitch variant="topbar" \/>\s*\{user \?/.test(header));
ok("Header и баннер зовут useT", (header.match(/const tl = useT\(\);/g) ?? []).length === 2);
const profile = strip(rd("client/src/pages/ProfilePage.tsx"));
ok("в профиле секция «Язык» с переключателем и строкой языка генерации", /<LanguageSwitch variant="form" \/>/.test(profile) && /profilePage\.genLangNote/.test(profile) && /genLangForUi\(locale\)/.test(profile));

/* ── 5. Форма создания ── */
console.log("═══ 5. SynthesisForm: язык генерации из профиля ═══");
const form = strip(rd("client/src/components/synthesis/SynthesisForm.tsx"));
ok("жёсткого «Russian» нет", !/"Russian"/.test(form));
ok("умолчание: user.genLang, иначе genLangForUi(язык интерфейса)", /const initialGenLang = \(userGenLang \?\? ""\)\.trim\(\) \|\| genLangForUi\(uiLocale\);/.test(form));
ok("значение вне списка → ветка «Другой…» с ним в поле", /GEN_LANG_VALUES\.includes\(initialGenLang\) \? initialGenLang : LANG_CUSTOM_VALUE/.test(form) && /GEN_LANG_VALUES\.includes\(initialGenLang\) \? "" : initialGenLang/.test(form));
ok("смена языка вошедшим → setGenLang (PATCH { genLang }), интерфейс не трогается", /void setGenLang\(v\);/.test(form) && !/setUiLocale|setLocale\(/.test(form));
ok("«Другой…» через tl() по месту, самоназвания как есть", /v === LANG_CUSTOM_VALUE \? tl\("synthesis\.synthesisForm\.otherLanguage", "Другой…"\) : l/.test(form));
ok("словари опций формы — фабрики, зовутся при отрисовке", /const METHOD_OPTIONS = \(\) => \[/.test(form) && /\{DEPTH_OPTIONS\(\)\.map\(/.test(form));

/* ── 6. static → фабрики; машинные значения ── */
console.log("═══ 6. static-строки и машинные значения ═══");
const staticAll = scanStaticCalls(ROOT);
const staticClient = staticAll.filter((x) => x.startsWith("client/"));
ok("в клиенте нет tl() на уровне модуля", staticClient.length === 0, staticClient.slice(0, 5).join("; "));
ok("вне клиента static остались (сервер — контекст запроса), их считаем", staticAll.length > 0 && staticAll.every((x) => !x.startsWith("client/")));
const { problems } = scanCalls(ROOT);
ok("ошибок вызовов tl() нет", problems.length === 0, problems.slice(0, 3).join("; "));
const table = readTable(ROOT);
ok("в таблице static остались только у серверных ключей", Object.entries(table.strings).filter(([, r]) => r.static).every(([, r]) => (r.where ?? []).every((w) => !w.startsWith("client/"))));
const excl = (file, text) => MIRROR_EXCLUSIONS.some((x) => x.file === file && x.text === text);
ok("машинные значения — в MIRROR_EXCLUSIONS", excl("client/src/components/edit/EditModal.tsx", "Структура документа") && excl("client/src/utils/capsule-html.ts", "Капсула") && excl("client/src/utils/recommendations.ts", "удалить") && excl("client/src/utils/recommendations.ts", "перегенерировать") && excl("client/src/i18n/i18n-store.ts", "Русский"));
ok("…и литералами в коде", /const STRUCTURE_SUBSECTION = "Структура документа"/.test(rd("client/src/components/edit/EditModal.tsx")) && /const CAPSULE_SECTION = "Капсула"/.test(rd("client/src/utils/capsule-html.ts")) && /const OP_DELETE = "удалить";\s*const OP_REGENERATE = "перегенерировать";/.test(rd("client/src/utils/recommendations.ts")));
ok("ключи машинных значений помечены data в таблице", ["edit.editModal.documentStructure", "utils.recommendations.opDelete", "utils.recommendations.opRegenerate"].every((k) => table.strings[k]?.data === true && !table.strings[k].obsolete));
const rec = await import("../client/src/utils/recommendations.ts");
ok("фабрика COST_KIND_LABEL отдаёт подписи при вызове", rec.COST_KIND_LABEL().manual === "вручную" && rec.costKindOf({ op: "удалить" }) === "manual");
const vt = await import("../client/src/utils/visibility-text.ts");
ok("фабрики visibility-text — функции", typeof vt.VISIBILITY_LABELS === "function" && vt.VISIBILITY_LABELS().showcase === "Витрина" && typeof vt.SHOWCASE_FLAGS_NOTE === "function");
const main = strip(rd("client/src/main.tsx"));
ok("main.tsx — монтирование в функции, tl() не на уровне модуля", /function mountApp\(\)/.test(main) && /mountApp\(\);/.test(main));

/* ── 7. PauseModal и пометка разбора ── */
console.log("═══ 7. PauseModal.keyInvalid, parseWarnings ═══");
const pm = strip(rd("client/src/components/synthesis/PauseModal.tsx"));
ok("keyInvalid переделан: tl() без JSX в подстановке", /tl\("synthesis\.pauseModal\.keyInvalidLead"/.test(pm) && !/недействителен или истёк\. Генерация остановлена\{" "\}/.test(pm));
ok("старого ключа keyInvalid нет ни в коде, ни в таблице", !/"synthesis\.pauseModal\.keyInvalid"/.test(pm) && !("synthesis.pauseModal.keyInvalid" in table.strings));
const sv = strip(rd("client/src/components/document/SectionView.tsx"));
ok("SectionView: пометка под гейтом showParseWarnings, плюрал по n", /const parseWarnings = showParseWarnings \? section\.parseWarnings \?\? \[\] : \[\];/.test(sv) && /parsedWithLosses/.test(sv) && /\{n, plural, one \{# предупреждение\} few \{# предупреждения\} many \{# предупреждений\} other/.test(sv));
const dv = strip(rd("client/src/components/document/DocumentView.tsx"));
ok("DocumentView передаёт isOwner — чужому и гостю пометки нет", /showParseWarnings=\{synthesis\.isOwner\}/.test(dv));
ok("плюрал пометки на русском: 1/2/5 предупреждений", tl("document.sectionView.parsedWithLosses", "⚠ Разобран с потерями ({n, plural, one {# предупреждение} few {# предупреждения} many {# предупреждений} other {# предупреждения}})", { n: 5 }) === "⚠ Разобран с потерями (5 предупреждений)" && tl("k", "{n, plural, one {# предупреждение} few {# предупреждения} many {# предупреждений} other {#}}", { n: 2 }) === "2 предупреждения");

/* ── 8. Оформление и каталоги ── */
console.log("═══ 8. CSS-блок 11.3, каталоги ═══");
const css = rd("client/src/globals.css");
const iBlock = css.indexOf("Беседа 11.3 — язык интерфейса"), iUtil = css.lastIndexOf("@tailwind utilities");
ok("блок «Беседа 11.3» в части 3 до @tailwind utilities", iBlock > 0 && iBlock < iUtil);
ok("правила переключателя и пометки на месте", [".app-lang-switch", ".app-lang-choice", ".app-lang-btn.active", ".sec-disclosure.parse-warnings", ".parse-warnings-list"].every((c) => css.includes(c)));
ok("новых hex в блоке нет (палитра закрыта)", !/#[0-9a-f]{3,6}\b/i.test(css.slice(iBlock, iUtil).replace(/#fff\b/g, "")));
const en = JSON.parse(rd("packages/shared/i18n/generated/en.json"));
ok("каталог en несёт строки 11.3", ["layout.languageSwitch.label", "profilePage.uiLanguage", "profilePage.genLangNote", "document.sectionView.parsedWithLosses", "synthesis.pauseModal.keyInvalidLead", "synthesis.synthesisForm.otherLanguage"].every((k) => k in en.strings));
ok("самоназвания языков в каталог не попали", !Object.values(en.strings).includes("Deutsch") && !("i18n.i18nStore.russian" in en.strings));
const storeSrc = rd("client/src/i18n/i18n-store.ts");
ok("import.meta.glob литеральный по generated/*.json (иначе Vite не разрежет чанки)", /import\.meta\.glob\("\.\.\/\.\.\/\.\.\/packages\/shared\/i18n\/generated\/\*\.json"\)/.test(storeSrc));

setCatalogProvider(null);
console.log(`\n${pass} ✓, ${fail} ✗`);
process.exit(fail ? 1 : 0);
