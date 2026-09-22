#!/usr/bin/env node
/**
 * i18n:init — первичная мастер-таблица packages/shared/i18n/strings.json.
 * Одноразовый: берёт опись строк интерфейса (ui-strings-lib) и имена ключей
 * (scripts/i18n/names.json), выпускает таблицу с колонкой ru, черновиком en
 * и пустой de. Код не трогает — переписывание литералов в tl() делает
 * i18n:codemod.
 *
 *   node scripts/i18n/i18n-init.mjs [--force] [--out <путь таблицы>]
 *
 * Без --force существующую таблицу не перезаписывает: после первичного
 * выпуска таблица ведётся через i18n:export / i18n:import.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractProject, namespaceOf, isDataFile } from "./ui-strings-lib.mjs";
import { LANGS, TABLE_PATH, FN, loadNames, resolveName, paramNames, toNamed, writeTable } from "./i18n-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const outAbs = path.resolve(ROOT, argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : TABLE_PATH);
if (fs.existsSync(outAbs) && !argv.includes("--force")) {
  console.error(`${path.relative(ROOT, outAbs)} уже есть — таблица ведётся через i18n:export/import (перезаписать: --force)`);
  process.exit(2);
}

const names = loadNames(ROOT);
const { files } = extractProject(ROOT, { withWarnings: false });

const strings = {};
const rawText = new Map(); // ключ → текст описи с {0},{1}
const unnamed = [];
const conflicts = [];
let excluded = 0, entries = 0;

for (const f of files) {
  const ns = namespaceOf(f.rel);
  const data = isDataFile(f.rel);
  for (const e of f.entries) {
    const r = resolveName(names, ns, e);
    if (!r) { unnamed.push(`${f.rel}:${e.line} [${ns}] ${e.text}`); continue; }
    if (r.exclude) { excluded++; continue; }
    entries++;
    const where = `${f.rel}:${e.line}`;
    const prev = strings[r.key];
    if (prev) {
      // тот же текст в другом месте: подстановки называются как в первом вхождении
      if (rawText.get(r.key) !== e.text) conflicts.push(`${r.key}: «${rawText.get(r.key)}» ≠ «${e.text}» (${where})`);
      else if (!prev.where.includes(where)) prev.where.push(where);
      if (!data) delete prev.data;
      if (e.static) prev.static = true;
      continue;
    }
    const pn = e.args ? paramNames(e.args) : [];
    const ru = toNamed(e.text, pn);
    rawText.set(r.key, e.text);
    const row = { ru };
    for (const l of LANGS) if (l !== "ru") row[l] = null;
    if (r.en != null) {
      row.en = toNamed(r.en, pn);
      row.from = { en: ru };
      row.draft = ["en"];
    }
    if (pn.length) row.params = Object.fromEntries(pn.map((n, i) => [n, e.args[i]]));
    if (data) row.data = true;
    if (e.static && !data) row.static = true;
    row.where = [where];
    strings[r.key] = row;
  }
}

if (conflicts.length || unnamed.length) {
  for (const c of conflicts) console.error(`✗ конфликт ключа: ${c}`);
  for (const u of unnamed.slice(0, 40)) console.error(`✗ нет имени: ${u}`);
  if (unnamed.length > 40) console.error(`  … ещё ${unnamed.length - 40}`);
  console.error(`\nключей не присвоено: ${unnamed.length}, конфликтов: ${conflicts.length} — дополните ${"scripts/i18n/names.json"}`);
  process.exit(1);
}

const keys = Object.keys(strings);
const table = {
  meta: {
    languages: LANGS,
    function: `${FN}(key, ru, params?) из @philosynth/shared/i18n/t`,
    created: new Date().toISOString(),
    counts: {
      keys: keys.length,
      entries,
      excluded,
      data: keys.filter((k) => strings[k].data).length,
      static: keys.filter((k) => strings[k].static).length,
    },
    notes: [
      "Правится только через i18n:export (сверка с кодом, файл для переводчика) и i18n:import (вливание перевода).",
      "en — черновик (draft), составлен при выпуске таблицы; вычитанный перевод снимает отметку draft.",
      "data — строки из данных (общие константы, сиды БД): в коде их вызовов tl() нет, подключаются по месту показа.",
      "static — строка вычисляется при импорте модуля и при смене языка сама не обновится.",
    ],
  },
  strings,
};
fs.mkdirSync(path.dirname(outAbs), { recursive: true });
writeTable(outAbs, table);

const chars = (l) => keys.reduce((s, k) => s + (strings[k][l]?.length ?? 0), 0);
console.log(`таблица: ${path.relative(ROOT, outAbs)}`);
console.log(`ключей ${keys.length} (из ${entries} записей описи; исключено как неинтерфейсные ${excluded})`);
console.log(`  data ${table.meta.counts.data}, static ${table.meta.counts.static}`);
console.log(`  знаков: ru ${chars("ru")}, en (черновик) ${chars("en")}`);
