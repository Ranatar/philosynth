#!/usr/bin/env node
/**
 * i18n:params — привести имена подстановок мастер-таблицы к говорящим
 * именам из scripts/i18n/names.json (поле params; беседа 11.2, п.7а).
 *
 *   node scripts/i18n/i18n-params.mjs [--dry]
 *
 * Имена подстановок в strings.json когда-то вывелись из выражений
 * (paramNames): `value`, `recs2`, `lc2` — переводчик их не поймёт. Запись
 * names.json с params задаёт имена ПО ПОЗИЦИЯМ {0},{1}… своего ru; здесь
 * они накладываются на строку таблицы того же ключа: ru/en/de/from.* —
 * замена {старое} → {новое} по позиции в row.params, сам row.params
 * пересобирается с выражениями за подстановками. Применять ДО codemod'а
 * (тот берёт имена из таблицы) — иначе переименование трогало бы и код.
 * Идемпотентно: где имена уже те, изменений нет.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LANGS, TABLE_PATH, NAMES_PATH, readTable, writeTable, placeholderSet } from "./i18n-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dry = process.argv.includes("--dry");

const table = readTable(ROOT);
const S = table.strings;
const names = JSON.parse(fs.readFileSync(path.join(ROOT, NAMES_PATH), "utf8"));

const rep = { renamed: [], unchanged: 0, problems: [] };
for (const rec of names) {
  if (!Array.isArray(rec.params) || rec.id === null) continue;
  const row = S[rec.id];
  if (!row) { rep.problems.push(`${rec.id}: ключа нет в таблице`); continue; }
  const old = Object.keys(row.params ?? {});
  if (old.length !== rec.params.length) {
    rep.problems.push(`${rec.id}: в таблице ${old.length} подстановок, в names.json ${rec.params.length}`);
    continue;
  }
  const pairs = old.map((o, i) => [o, rec.params[i]]).filter(([o, n]) => o !== n);
  if (!pairs.length) { rep.unchanged++; continue; }
  // замена по всему тексту всех языков и from.*; двухфазно — через маркеры,
  // чтобы обмен имён (a→b, b→a) не смешался
  const swap = (text) => {
    if (text == null) return text;
    let t = text;
    pairs.forEach(([o], i) => { t = t.split(`{${o}}`).join(`\u0000${i}\u0000`); });
    pairs.forEach(([, n], i) => { t = t.split(`\u0000${i}\u0000`).join(`{${n}}`); });
    return t;
  };
  const before = placeholderSet(row.ru);
  for (const l of LANGS) row[l] = swap(row[l]);
  if (row.from) for (const l of Object.keys(row.from)) row.from[l] = swap(row.from[l]);
  row.params = Object.fromEntries(old.map((o, i) => [rec.params[i], row.params[o]]));
  const after = placeholderSet(row.ru);
  if (after.split(",").length !== before.split(",").length)
    rep.problems.push(`${rec.id}: число подстановок изменилось (${before} → ${after})`);
  rep.renamed.push(`${rec.id}: ${pairs.map(([o, n]) => `${o}→${n}`).join(", ")}`);
}

if (rep.problems.length) {
  for (const p of rep.problems) console.error("✗ " + p);
  process.exit(1);
}
if (!dry && rep.renamed.length) {
  table.meta.paramsRenamed = new Date().toISOString();
  writeTable(path.join(ROOT, TABLE_PATH), table);
}
console.log(`${dry ? "(--dry) " : ""}переименовано строк ${rep.renamed.length}, уже говорящих ${rep.unchanged}`);
for (const r of rep.renamed) console.log("  " + r);
