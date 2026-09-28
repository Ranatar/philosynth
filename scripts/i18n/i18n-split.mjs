#!/usr/bin/env node
/**
 * i18n:split — нарезать мастер-таблицу на каталоги рантайма
 * packages/shared/i18n/generated/<lang>.json (беседа 11.2, п.3).
 *
 *   node scripts/i18n/i18n-split.mjs [--check]
 *
 * Русского каталога нет: ru — второй аргумент tl() в коде. В каталог языка
 * попадает ключ, у которого есть перевод на этот язык, включая ЧЕРНОВОЙ
 * (draft): черновик лучше русского текста. Не попадают: obsolete и пустые
 * переводы. Устаревший перевод (from[lang] ≠ ru) попадает — он лучше
 * русского; i18n:check сообщает о нём отдельно.
 *
 * Строки data (беседа 11.4) ПОПАДАЮТ: их показ идёт через карту
 * «значение → ключ» (generated/data-keys.ts, tData из shared/i18n/data.ts) и
 * тот же tl() — без строки в каталоге tl() вернул бы русский текст. Прежнее
 * правило 11.2 «data — нет» действовало, пока data-строки никто не показывал
 * через tl().
 *
 * Карта «значение → ключ» — тоже генерат этого скрипта: русский текст
 * data-строки → её ключ. Один текст у нескольких ключей (например,
 * «Аналитический» в shared.labels и data.compatMatrix) — берётся ключ по
 * предпочтению пространств имён: shared.* → data.* → клиентские → server.*
 * (у данных источник истины — общие константы, показ — клиент).
 *
 * Форма каталога — вход setCatalogProvider (t.ts): { locale, strings }.
 * --check: не писать, а сверить файлы с нарезкой (сторож 4aw); код возврата 1
 * при расхождении. Файлы генерируются — руками не правятся.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LANGS, readTable, loadNames, resolveName } from "./i18n-core.mjs";
import { extractProject, namespaceOf, isDataFile } from "./ui-strings-lib.mjs";

export const GENERATED_DIR = "packages/shared/i18n/generated";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Каталог языка по таблице (чистая функция — её же зовёт сторож). */
export function splitCatalog(table, lang) {
  const strings = {};
  for (const key of Object.keys(table.strings).sort()) {
    const row = table.strings[key];
    if (row.obsolete) continue;
    const v = row[lang];
    if (v == null || v === "") continue;
    strings[key] = v;
  }
  return { locale: lang, strings };
}

export function renderCatalog(catalog) {
  return JSON.stringify(catalog, null, 2) + "\n";
}

/** Порядок предпочтения пространств имён при одном русском тексте у
 *  нескольких data-ключей (11.4): чем меньше — тем предпочтительнее. */
function nsRank(key) {
  if (key.startsWith("shared.")) return 0;
  if (key.startsWith("data.")) return 1;
  if (key.startsWith("server.")) return 3;
  return 2;
}

/** Карта «русский текст data-строки → ключ» (чистая функция; её же зовёт
 *  сторож 4ay). Ключи — только со отметкой data и без obsolete. */
export function dataKeyMap(table, root = null) {
  const map = new Map();
  for (const key of Object.keys(table.strings).sort()) {
    const row = table.strings[key];
    if (!row.data || row.obsolete) continue;
    const prev = map.get(row.ru);
    if (!prev || nsRank(key) < nsRank(prev) || (nsRank(key) === nsRank(prev) && key < prev)) map.set(row.ru, key);
  }
  // Значения файлов-данных, чей ключ потерял отметку data, потому что тот же
  // текст стоит и надписью в коде (i18n:export снимает data при живом tl();
  // 09 §2, 11.2 п.3): «Диалектический» → common.dialectical, «Основание» →
  // common.ground. Берутся из описи файлов-данных — только они, не вся таблица.
  if (root) {
    const names = loadNames(root);
    for (const f of extractProject(root, { withWarnings: false }).files) {
      if (!isDataFile(f.rel)) continue;
      const ns = namespaceOf(f.rel);
      for (const e of f.entries) {
        if (map.has(e.text)) continue;
        const r = resolveName(names, ns, e);
        if (!r || r.exclude) continue;
        const row = table.strings[r.key];
        if (row && !row.obsolete && row.ru === e.text) map.set(e.text, r.key);
      }
    }
  }
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export const DATA_KEYS_REL = `${GENERATED_DIR}/data-keys.ts`;

export function renderDataKeys(map) {
  const lines = [
    "/**",
    " * ГЕНЕРАТ — не править руками: npm run i18n:split (беседа 11.4).",
    " * Карта «русское значение data-строки → ключ strings.json» для перевода",
    " * данных ПО МЕСТУ ПОКАЗА (shared/i18n/data.ts → tData). Сами константы,",
    " * сиды, БД и промпты остаются русскими.",
    " */",
    "export const DATA_KEYS: Readonly<Record<string, string>> = {",
  ];
  for (const [ru, key] of Object.entries(map)) lines.push(`  ${JSON.stringify(ru)}: ${JSON.stringify(key)},`);
  lines.push("};", "");
  return lines.join("\n");
}

/** [{ lang, rel, expected, actual }] — actual: null, если файла нет. */
export function compareCatalogs(root) {
  const table = readTable(root);
  const res = LANGS.filter((l) => l !== "ru").map((lang) => {
    const rel = `${GENERATED_DIR}/${lang}.json`;
    const abs = path.join(root, rel);
    return {
      lang,
      rel,
      expected: renderCatalog(splitCatalog(table, lang)),
      actual: fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null,
    };
  });
  // 11.4: карта «значение → ключ» — тем же сравнением
  const dkAbs = path.join(root, DATA_KEYS_REL);
  res.push({
    lang: "data-keys",
    rel: DATA_KEYS_REL,
    expected: renderDataKeys(dataKeyMap(table, root)),
    actual: fs.existsSync(dkAbs) ? fs.readFileSync(dkAbs, "utf8") : null,
  });
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const res = compareCatalogs(ROOT);
  let bad = 0;
  fs.mkdirSync(path.join(ROOT, GENERATED_DIR), { recursive: true });
  for (const r of res) {
    const n = r.lang === "data-keys"
      ? (r.expected.match(/^  "/gm) ?? []).length
      : Object.keys(JSON.parse(r.expected).strings).length;
    if (check) {
      const ok = r.actual === r.expected;
      if (!ok) bad++;
      console.log(`${ok ? "✓" : "✗"} ${r.rel}: ${n} строк${ok ? "" : r.actual === null ? " — файла нет" : " — устарел (npm run i18n:split)"}`);
    } else {
      fs.writeFileSync(path.join(ROOT, r.rel), r.expected);
      console.log(`${r.rel}: ${n} строк`);
    }
  }
  process.exit(bad ? 1 : 0);
}
