#!/usr/bin/env node
/**
 * i18n:split — нарезать мастер-таблицу на каталоги рантайма
 * packages/shared/i18n/generated/<lang>.json (беседа 11.2, п.3).
 *
 *   node scripts/i18n/i18n-split.mjs [--check]
 *
 * Русского каталога нет: ru — второй аргумент tl() в коде. В каталог языка
 * попадает ключ, у которого есть перевод на этот язык, включая ЧЕРНОВОЙ
 * (draft): черновик лучше русского текста. Не попадают: строки data
 * (переводятся по месту показа — 11.4), obsolete, пустые переводы.
 * Устаревший перевод (from[lang] ≠ ru) попадает — он лучше русского;
 * i18n:check сообщает о нём отдельно.
 *
 * Форма каталога — вход setCatalogProvider (t.ts): { locale, strings }.
 * --check: не писать, а сверить файлы с нарезкой (сторож 4aw); код возврата 1
 * при расхождении. Файлы генерируются — руками не правятся.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LANGS, readTable } from "./i18n-core.mjs";

export const GENERATED_DIR = "packages/shared/i18n/generated";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Каталог языка по таблице (чистая функция — её же зовёт сторож). */
export function splitCatalog(table, lang) {
  const strings = {};
  for (const key of Object.keys(table.strings).sort()) {
    const row = table.strings[key];
    if (row.data || row.obsolete) continue;
    const v = row[lang];
    if (v == null || v === "") continue;
    strings[key] = v;
  }
  return { locale: lang, strings };
}

export function renderCatalog(catalog) {
  return JSON.stringify(catalog, null, 2) + "\n";
}

/** [{ lang, rel, expected, actual }] — actual: null, если файла нет. */
export function compareCatalogs(root) {
  const table = readTable(root);
  return LANGS.filter((l) => l !== "ru").map((lang) => {
    const rel = `${GENERATED_DIR}/${lang}.json`;
    const abs = path.join(root, rel);
    return {
      lang,
      rel,
      expected: renderCatalog(splitCatalog(table, lang)),
      actual: fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null,
    };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const res = compareCatalogs(ROOT);
  let bad = 0;
  fs.mkdirSync(path.join(ROOT, GENERATED_DIR), { recursive: true });
  for (const r of res) {
    const n = Object.keys(JSON.parse(r.expected).strings).length;
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
