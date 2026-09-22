#!/usr/bin/env node
/**
 * i18n:export — сверить вызовы tl() в коде с мастер-таблицей и выгрузить
 * файл для переводчика.
 *
 *   node scripts/i18n/i18n-export.mjs [--lang en,de] [--out <файл>] [--no-drafts] [--dry] [--prune]
 *
 * 1. Сверка (пишет таблицу, если не --dry):
 *    новый ключ в коде          → строка в таблице с колонкой ru, переводы пусты;
 *    русский текст в коде иной  → ru обновляется, прежние переводы становятся
 *                                 устаревшими (from[lang] ≠ ru);
 *    ключа больше нет в коде    → obsolete (с --prune — удаляется);
 *    строки data не сверяются: их вызовов tl() в коде нет по устройству.
 *    Если в коде нет ни одного вызова tl() (codemod ещё не применён),
 *    сверка пропускается целиком — иначе вся таблица стала бы obsolete.
 * 2. Файл для переводчика — подмножество таблицы того же формата: строки,
 *    где у языка нет перевода, перевод устарел или (без --no-drafts) черновой.
 *    У устаревших — prev: русский текст и перевод, с которых он делался.
 *    Переводчик заполняет колонки языков; остальное не трогает.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LANGS, TABLE_PATH, readTable, writeTable, scanCalls, isStale } from "./i18n-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const langs = opt("--lang", LANGS.filter((l) => l !== "ru").join(",")).split(",").map((s) => s.trim()).filter(Boolean);
for (const l of langs) if (!LANGS.includes(l) || l === "ru") { console.error(`неизвестный язык: ${l} (есть: ${LANGS.join(", ")})`); process.exit(2); }
const withDrafts = !argv.includes("--no-drafts");
const dry = argv.includes("--dry");
const prune = argv.includes("--prune");
const outPath = path.resolve(opt("--out", `i18n-request.${langs.join("-")}.json`));

const tablePath = path.join(ROOT, TABLE_PATH);
const table = readTable(ROOT);
const S = table.strings;

/* 1. сверка */
const { calls, problems } = scanCalls(ROOT);
const sync = { added: [], changed: [], obsolete: [], revived: [], pruned: [] };
if (calls.size) {
  for (const [key, c] of calls) {
    const row = S[key];
    if (!row) {
      const fresh = { ru: c.ru };
      for (const l of LANGS) if (l !== "ru") fresh[l] = null;
      if (c.params.length) fresh.params = Object.fromEntries(c.params.map((p) => [p, ""]));
      fresh.where = c.where;
      S[key] = fresh;
      sync.added.push(key);
      continue;
    }
    if (row.ru !== c.ru) { sync.changed.push(`${key}: «${row.ru}» → «${c.ru}»`); row.ru = c.ru; }
    if (row.obsolete) { delete row.obsolete; sync.revived.push(key); }
    delete row.data;
    row.where = c.where;
  }
  for (const [key, row] of Object.entries(S)) {
    if (row.data || calls.has(key)) continue;
    if (prune) { delete S[key]; sync.pruned.push(key); }
    else if (!row.obsolete) { row.obsolete = true; sync.obsolete.push(key); }
  }
  if (!dry) {
    table.meta.synced = new Date().toISOString();
    writeTable(tablePath, table);
  }
}

/* 2. файл для переводчика */
const req = {};
const counts = Object.fromEntries(langs.map((l) => [l, { missing: 0, stale: 0, draft: 0 }]));
for (const [key, row] of Object.entries(S)) {
  if (row.obsolete) continue;
  let need = false;
  const prev = {};
  for (const l of langs) {
    if (row[l] == null) { counts[l].missing++; need = true; }
    else if (isStale(row, l)) { counts[l].stale++; need = true; prev.ru = row.from[l]; prev[l] = row[l]; }
    else if (withDrafts && row.draft?.includes(l)) { counts[l].draft++; need = true; }
  }
  if (!need) continue;
  const item = { ru: row.ru };
  for (const l of langs) item[l] = row[l] ?? null;
  if (Object.keys(prev).length) item.prev = prev;
  if (row.draft?.some((l) => langs.includes(l))) item.draft = row.draft.filter((l) => langs.includes(l));
  for (const k of ["params", "note", "where"]) if (row[k] !== undefined) item[k] = row[k];
  req[key] = item;
}
const request = {
  meta: {
    kind: "translation-request",
    created: new Date().toISOString(),
    languages: langs,
    counts,
    howTo: [
      "Заполнить колонки языков; ru, prev, params, where не менять.",
      "{имя} — подстановки: в переводе каждая должна остаться, порядок любой.",
      "prev — русский текст и перевод, с которых делался прежний перевод (ru с тех пор изменился).",
      "draft — перевод черновой: вычитать; при вливании отметка снимается.",
      "Вливание: npm run i18n:import -- <этот файл>",
    ],
  },
  strings: req,
};
writeTable(outPath, request);

/* отчёт */
const show = (title, list, limit = 15) => {
  if (!list.length) return;
  console.log(`\n${title} (${list.length}):`);
  for (const s of list.slice(0, limit)) console.log("  " + s.slice(0, 160));
  if (list.length > limit) console.log(`  … ещё ${list.length - limit}`);
};
if (!calls.size) console.log("⚠ в коде нет вызовов tl() — сверка с кодом пропущена (codemod ещё не применён)");
else console.log(`сверка с кодом${dry ? " (--dry, таблица не записана)" : ""}: ключей в коде ${calls.size}; новых ${sync.added.length}, русский текст изменён ${sync.changed.length}, стали obsolete ${sync.obsolete.length}, вернулись ${sync.revived.length}${prune ? `, удалено ${sync.pruned.length}` : ""}`);
show("ошибки вызовов tl()", problems);
show("новые ключи", sync.added);
show("изменён русский текст", sync.changed);
show("исчезли из кода (obsolete)", sync.obsolete);
console.log(`\nфайл для переводчика: ${outPath}`);
console.log(`строк ${Object.keys(req).length}; ${langs.map((l) => `${l}: нет перевода ${counts[l].missing}, устарел ${counts[l].stale}, черновик ${withDrafts ? counts[l].draft : "не выгружен"}`).join("; ")}`);
