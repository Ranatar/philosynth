#!/usr/bin/env node
/**
 * smoke-114-request1.mjs — смоук первого запроса беседы 11.4 (данные по месту
 * показа: карта «значение → ключ», tData/tDataLoose, каталоги с data-строками,
 * немецкий черновик, цикл переводчика export → import на копии таблицы,
 * i18n:check --strict). Без БД и браузера. Запуск:
 *   node_modules/.bin/tsx tests/smoke-114-request1.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { setCatalogProvider } from "../packages/shared/i18n/t.ts";
import { displayKey, isDataValue, tData, tDataLoose } from "../packages/shared/i18n/data.ts";
import { DATA_KEYS } from "../packages/shared/i18n/generated/data-keys.ts";
import { ML, SL, DL } from "../packages/shared/constants/labels.ts";
import { KEY_LABELS } from "../packages/shared/constants/section-labels.ts";
import { CTX_LABELS } from "../packages/shared/constants/ctx-keys.ts";
import { PHILOSOPHERS, PHILOSOPHER_EPOCHS } from "../packages/shared/constants/philosophers.ts";
import { CATEGORY_CHARACTERISTICS, EDGE_CHARACTERISTICS, validateCharacteristicValue, VALUE_ERROR_NOT_INTEGER } from "../packages/shared/constants/characteristics.ts";
import { PASSWORD_TOO_SHORT_TEMPLATE, PASSWORD_TOO_SHORT_MESSAGE, PASSWORD_MIN_LENGTH } from "../packages/shared/constants/auth.ts";
import { MODE_UI } from "../client/src/components/modes/ModeModal.tsx";
import { readTable, scanCalls, MIRROR_EXCLUSIONS, SCAN_SKIP } from "../scripts/i18n/i18n-core.mjs";
import { splitCatalog, dataKeyMap, compareCatalogs } from "../scripts/i18n/i18n-split.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? "\n    " + detail : ""}`); }
};
const table = readTable(ROOT);
const S = table.strings;
const enCat = JSON.parse(rd("packages/shared/i18n/generated/en.json"));
const deCat = JSON.parse(rd("packages/shared/i18n/generated/de.json"));
const withCat = (cat, fn) => { setCatalogProvider(() => cat); try { return fn(); } finally { setCatalogProvider(null); } };

/* ── 1. Карта «значение → ключ» ── */
console.log("1. карта DATA_KEYS");
const dataRows = Object.entries(S).filter(([, r]) => r.data && !r.obsolete);
ok("data-строк в таблице 410", dataRows.length === 410, String(dataRows.length));
ok("каждая data-строка представлена в карте", dataRows.every(([, r]) => r.ru in DATA_KEYS));
ok("карта ведёт на живые ключи с тем же ru", Object.entries(DATA_KEYS).every(([ru, k]) => S[k] && !S[k].obsolete && S[k].ru === ru));
ok("значения файлов-данных без отметки data — в карте (Диалектический → common.dialectical)", DATA_KEYS["Диалектический"] === "common.dialectical" && DATA_KEYS["Основание"] === "common.ground");
ok("коллизии одного текста решаются предпочтением shared → data", DATA_KEYS["Аналитический"] === "shared.labels.methodAnalytical" && DATA_KEYS["⚔ Оппонент"] === "modes.modeModal.opponent");
ok("dataKeyMap(таблица, root) ≡ генерату", JSON.stringify(dataKeyMap(table, ROOT)) === JSON.stringify(DATA_KEYS));
ok("compareCatalogs: en, de и карта свежие", compareCatalogs(ROOT).every((r) => r.actual === r.expected));
ok("displayKey/isDataValue", displayKey(ML.dialectical) === "common.dialectical" && isDataValue("Онтологическая") && displayKey("нет такого") === null && !isDataValue("нет такого"));

/* ── 2. Каталоги несут data-строки, de заполнен ── */
console.log("2. каталоги");
const live = Object.entries(S).filter(([, r]) => !r.obsolete);
ok("каталог en несёт ВСЕ живые ключи (включая data)", live.every(([k]) => k in enCat.strings) && Object.keys(enCat.strings).length === live.length);
ok("каталог de несёт ВСЕ живые ключи (черновик 11.4)", deCat.locale === "de" && live.every(([k]) => k in deCat.strings));
ok("splitCatalog не выбрасывает data", Object.keys(splitCatalog(table, "en").strings).length === live.length);
// 2026-09-29: en и de утверждены владельцем (import без --draft) — черновиков нет, from = ru
ok("en и de утверждены: черновиков нет, from.en/de = ru у каждого ключа", live.every(([, r]) => !(r.draft ?? []).includes("de") && !(r.draft ?? []).includes("en") && r.from?.de === r.ru && r.from?.en === r.ru));

/* ── 3. tData по месту показа ── */
console.log("3. tData / tDataLoose");
ok("без каталога — русский", tData(ML.dialectical) === "Диалектический" && tData("Онтологическая") === "Онтологическая");
ok("en: метки метода/уровня/глубины", withCat(enCat, () => [tData(ML.dialectical), tData(SL.generative), tData(DL.deep)].join("|")) === "Dialectical|Generative|Deep");
ok("de: метки", withCat(deCat, () => [tData(ML.analytical), tData(SL.comparative)].join("|")) === "Analytisch|Vergleichend");
ok("en: разделы KEY_LABELS все переводятся", withCat(enCat, () => Object.values(KEY_LABELS).every((v) => tData(v) !== v && /^[A-Za-z]/.test(tData(v)))));
ok("en: CTX_LABELS все переводятся", withCat(enCat, () => Object.values(CTX_LABELS).every((v) => tData(v) !== v)));
ok("en: философы и эпохи переводятся", withCat(enCat, () => PHILOSOPHERS.every((p) => tData(p) !== p) && PHILOSOPHER_EPOCHS.every((e) => tData(e.label) !== e.label)));
ok("en: характеристики", withCat(enCat, () => [...CATEGORY_CHARACTERISTICS, ...EDGE_CHARACTERISTICS].every((c) => tData(c.labelRu) !== c.labelRu)));
ok("en: таксономия сида и тип документа со строчной", withCat(enCat, () => tData("Онтологическая") === "Ontological" && tDataLoose("онтологическая") === "ontological" && tDataLoose("Диалектическая") !== "Диалектическая"));
ok("пользовательский тип / чужое значение — как есть", withCat(enCat, () => tData("Пользовательский тип 42") === "Пользовательский тип 42" && tDataLoose("мой тип") === "мой тип"));
ok("null/пусто → пустая строка", tData(null) === "" && tData(undefined) === "" && tData("") === "" && tDataLoose(null) === "");
ok("en: MODE_UI (title, desc, placeholder, suggestions)", withCat(enCat, () => Object.values(MODE_UI).every((m) => [m.title, m.desc, m.paramLabel, m.paramPlaceholder, ...m.suggestions].every((v) => tData(v) !== v))));
ok("en: шаблон с подстановкой (пароль)", withCat(enCat, () => { const t = tData(PASSWORD_TOO_SHORT_TEMPLATE, { minLength: PASSWORD_MIN_LENGTH }); return /8/.test(t) && !/[а-яё]/i.test(t) && !/\{minLength\}/.test(t); }));
ok("PASSWORD_TOO_SHORT_MESSAGE остался русским (bootstrap-admin)", /[а-яё]/i.test(PASSWORD_TOO_SHORT_MESSAGE) && PASSWORD_TOO_SHORT_MESSAGE.includes(String(PASSWORD_MIN_LENGTH)));
const intSpec = CATEGORY_CHARACTERISTICS.find((c) => c.integer);
ok("validateCharacteristicValue: ru без каталога, en с каталогом", validateCharacteristicValue(intSpec, 2.5) === "Ожидается целое число от 1 до 5" && withCat(enCat, () => /integer/i.test(validateCharacteristicValue(intSpec, 2.5))) && VALUE_ERROR_NOT_INTEGER.includes("{min}"));
ok("константы остались русскими", ML.dialectical === "Диалектический" && MODE_UI.adversarial.title === "⚔ Оппонент" && KEY_LABELS.graph === "Граф категорий");

/* ── 4. Сканы и зеркала ── */
console.log("4. сканы");
const scan = scanCalls(ROOT);
ok("data.ts исключён из сканов; нелитеральных tl() нет", SCAN_SKIP.has("packages/shared/i18n/data.ts") && scan.problems.length === 0);
ok("MIRROR_EXCLUSIONS ≥ 10, литералы на месте", MIRROR_EXCLUSIONS.length >= 10 && MIRROR_EXCLUSIONS.filter((x) => x.text).every((x) => rd(x.file).includes(`"${x.text}"`)));
const dh = rd("client/src/components/document/DocumentHeader.tsx");
ok("подзаголовок: subtitleFor цела, показ — subtitleDisplay", /function subtitleFor\(/.test(dh) && /\{subtitleDisplay\(synthesis\)\}/.test(dh) && dh.includes('"На основе: "') && dh.includes('"Свободный синтез (на основе зерна)"'));

/* ── 5. Цикл переводчика на КОПИИ таблицы: export de → правка → import без --draft снимает draft только у правленых ── */
console.log("5. цикл переводчика (копия репозитория таблицы)");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "t114-"));
  // копия скриптов и таблицы, чтобы не трогать рабочую
  for (const d of ["scripts/i18n", "packages/shared/i18n"]) fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
  fs.mkdirSync(path.join(tmp, "node_modules"), { recursive: true });
  fs.symlinkSync(path.join(ROOT, "node_modules/typescript"), path.join(tmp, "node_modules/typescript"), "dir");
  const run = (args) => spawnSync(process.execPath, args, { cwd: tmp, encoding: "utf8" });
  const req = path.join(tmp, "req.de.json");
  let r = run(["scripts/i18n/i18n-export.mjs", "--lang", "de", "--dry", "--out", req]);
  ok("export --lang de пишет файл переводчика", r.status === 0 && fs.existsSync(req), r.stdout.slice(-200));
  const file = JSON.parse(fs.readFileSync(req, "utf8"));
  const keys = Object.keys(file.strings);
  ok("export --lang de без черновиков и пропусков — файл пуст (нечего переводить)", keys.length === 0, String(keys.length));
  // цикл переводчика воспроизводится на копии: помечаем три строки черновиком de (как после i18n:import --draft)
  const tp0 = path.join(tmp, "packages/shared/i18n/strings.json");
  const t0 = JSON.parse(fs.readFileSync(tp0, "utf8"));
  const [k1, k2, k3] = ["common.save", "common.cancel", "shared.labels.methodAnalytical"];
  for (const k of [k1, k2, k3]) t0.strings[k].draft = ["de"];
  fs.writeFileSync(tp0, JSON.stringify(t0, null, 2) + "\n");
  r = run(["scripts/i18n/i18n-export.mjs", "--lang", "de", "--dry", "--out", req]);
  const file2 = JSON.parse(fs.readFileSync(req, "utf8"));
  ok("export после --draft у трёх строк отдаёт ровно их", Object.keys(file2.strings).sort().join() === [k1, k2, k3].sort().join() && Object.values(file2.strings).every((s) => s.draft?.includes("de")));
  Object.assign(file, file2);
  // k1: новый текст; k2: тот же текст, отметка de снята переводчиком; k3: не тронут
  const edited = { meta: file.meta, strings: {} };
  edited.strings[k1] = { ...file.strings[k1], de: "Speichern!", draft: file.strings[k1].draft };
  edited.strings[k2] = { ...file.strings[k2], draft: file.strings[k2].draft.filter((l) => l !== "de") };
  edited.strings[k3] = { ...file.strings[k3] };
  fs.writeFileSync(req, JSON.stringify(edited));
  r = run(["scripts/i18n/i18n-import.mjs", req]);
  const t2 = JSON.parse(fs.readFileSync(path.join(tmp, "packages/shared/i18n/strings.json"), "utf8")).strings;
  ok("import без --draft: новый текст записан, draft de снят", r.status === 0 && t2[k1].de === "Speichern!" && !(t2[k1].draft ?? []).includes("de") && t2[k1].from.de === t2[k1].ru, r.stdout.slice(-300));
  ok("тот же текст с убранной отметкой — вычитка подтверждена", !(t2[k2].draft ?? []).includes("de") && t2[k2].de === file.strings[k2].de);
  ok("нетронутая строка осталась черновиком", (t2[k3].draft ?? []).includes("de") && !(t2[k1].draft ?? []).includes("de"));
  ok("остальные 2266 строк не тронуты (утверждены, без draft)", Object.keys(t2).filter((k) => ![k1, k2, k3].includes(k)).every((k) => !(t2[k].draft ?? []).length && t2[k].de === S[k].de));
  // отказы: плюрал не своего языка, подстановки
  const rowOf = (k) => ({ ru: t0.strings[k].ru, params: t0.strings[k].params });
  const bad = { meta: file.meta, strings: { "document.sectionView.parsedWithLosses": { ...rowOf("document.sectionView.parsedWithLosses"), de: "⚠ x ({n, plural, one {#} few {#} other {#}})" }, "adminPromptsPage.compare": { ...rowOf("adminPromptsPage.compare"), de: "Vergleich: {a} → {b}" } } };
  fs.writeFileSync(req, JSON.stringify(bad));
  r = run(["scripts/i18n/i18n-import.mjs", req]);
  ok("import отвергает few в немецком и чужие подстановки", r.status === 1 && /few/.test(r.stdout) && /подстановки/.test(r.stdout));
  // --draft ставит отметку обратно
  fs.writeFileSync(req, JSON.stringify({ meta: file.meta, strings: { [k1]: { ...file.strings[k1], de: "Speichern?" } } }));
  r = run(["scripts/i18n/i18n-import.mjs", req, "--draft"]);
  const t3 = JSON.parse(fs.readFileSync(path.join(tmp, "packages/shared/i18n/strings.json"), "utf8")).strings;
  ok("import --draft ставит отметку черновика", r.status === 0 && t3[k1].de === "Speichern?" && t3[k1].draft.includes("de"));
  // split на копии: data-строки в каталоге
  r = run(["scripts/i18n/i18n-split.mjs"]);
  const deTmp = JSON.parse(fs.readFileSync(path.join(tmp, "packages/shared/i18n/generated/de.json"), "utf8"));
  ok("split на копии: de несёт правку и data-строки", r.status === 0 && deTmp.strings[k1] === "Speichern?" && deTmp.strings["data.taxonomy.ontologicalName"] === "Ontologisch");
  fs.rmSync(tmp, { recursive: true, force: true });
}

/* ── 6. i18n:check --strict ── */
console.log("6. i18n:check --strict");
{
  const r = spawnSync(process.execPath, ["scripts/i18n/i18n-check.mjs", "--strict"], { cwd: ROOT, encoding: "utf8" });
  ok("рабочая таблица: --strict чист", r.status === 0, r.stdout.split("\n").filter((l) => l.startsWith("✗")).join("; "));
  // удалить перевод одного ключа на копии → красный с ключом
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "t114c-"));
  for (const d of ["scripts/i18n", "packages/shared/i18n", "client/src", "server", "packages/shared", "scripts"]) fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(tmp, "node_modules"), "dir");
  const tp = path.join(tmp, "packages/shared/i18n/strings.json");
  const t = JSON.parse(fs.readFileSync(tp, "utf8"));
  t.strings["common.save"].de = null;
  fs.writeFileSync(tp, JSON.stringify(t));
  const r2 = spawnSync(process.execPath, ["scripts/i18n/i18n-check.mjs", "--strict"], { cwd: tmp, encoding: "utf8" });
  ok("удалён перевод de у common.save → --strict красный с ключом", r2.status === 1 && /common\.save \[de\]/.test(r2.stdout), r2.stdout.slice(-300));
  const r3 = spawnSync(process.execPath, ["scripts/i18n/i18n-check.mjs"], { cwd: tmp, encoding: "utf8" });
  ok("без --strict — только отчёт (код 0)", r3.status === 0);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nИТОГ: ${pass} ✓, ${fail} ✗`);
process.exit(fail ? 1 : 0);
