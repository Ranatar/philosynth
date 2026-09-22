#!/usr/bin/env node
/**
 * i18n:check — сверка кода и мастер-таблицы только отчётом (для приёмки).
 *
 *   node scripts/i18n/i18n-check.mjs [--strict] [--lang en,de]
 *
 * Проверяет:
 *   · вызовы tl(): ключ и русский текст — литералы, один ключ — один текст;
 *   · ключи в коде, которых нет в таблице; расхождение русского текста код ↔ таблица;
 *   · ключи таблицы, которых нет в коде (кроме data);
 *   · подстановки перевода ≠ русским;
 *   · по языкам: нет перевода / устарел / черновик;
 *   · строки интерфейса, всё ещё стоящие в коде литералами: с ключом в таблице
 *     (codemod не применён) и без ключа (новая строка без имени в names.json).
 * --strict: код возврата 1, если есть что-то кроме непереведённого и черновиков.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractProject, namespaceOf, isDataFile } from "./ui-strings-lib.mjs";
import { LANGS, readTable, scanCalls, placeholderSet, isStale, loadNames, resolveName } from "./i18n-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const langs = (argv.includes("--lang") ? argv[argv.indexOf("--lang") + 1] : LANGS.filter((l) => l !== "ru").join(",")).split(",");

const table = readTable(ROOT);
const S = table.strings;
const { calls, problems } = scanCalls(ROOT);

const notInTable = [], ruMismatch = [], notInCode = [], badPlaceholders = [];
for (const [key, c] of calls) {
  if (!S[key]) notInTable.push(`${key} (${c.where[0]})`);
  else if (S[key].ru !== c.ru) ruMismatch.push(`${key}: код «${c.ru}» ≠ таблица «${S[key].ru}»`);
}
if (calls.size) for (const [key, row] of Object.entries(S)) if (!row.data && !calls.has(key)) notInCode.push(key);
const perLang = Object.fromEntries(langs.map((l) => [l, { missing: 0, stale: 0, draft: 0 }]));
for (const [key, row] of Object.entries(S)) {
  if (row.obsolete) continue;
  for (const l of langs) {
    if (row[l] == null) perLang[l].missing++;
    else {
      if (isStale(row, l)) perLang[l].stale++;
      if (row.draft?.includes(l)) perLang[l].draft++;
      if (placeholderSet(row[l]) !== placeholderSet(row.ru)) badPlaceholders.push(`${key} [${l}]`);
    }
  }
}

// строки, оставшиеся литералами
const names = loadNames(ROOT);
const literalKeyed = [], literalUnnamed = [];
for (const f of extractProject(ROOT, { withWarnings: false }).files) {
  if (isDataFile(f.rel)) continue;
  const ns = namespaceOf(f.rel);
  for (const e of f.entries) {
    const r = resolveName(names, ns, e);
    if (!r) literalUnnamed.push(`${f.rel}:${e.line} ${e.text}`);
    else if (!r.exclude) literalKeyed.push(`${f.rel}:${e.line} ${r.key}`);
  }
}

const show = (title, list, limit = 15) => {
  console.log(`${list.length ? "✗" : "✓"} ${title}: ${list.length}`);
  for (const s of list.slice(0, limit)) console.log("    " + s.slice(0, 160));
  if (list.length > limit) console.log(`    … ещё ${list.length - limit}`);
};
console.log(`вызовов tl() в коде: ${calls.size} ключей; в таблице: ${Object.keys(S).length}`);
show("ошибки вызовов tl()", problems);
show("ключи кода, которых нет в таблице (нужен i18n:export)", notInTable);
show("русский текст код ≠ таблица (нужен i18n:export)", ruMismatch);
show("ключи таблицы, которых нет в коде", notInCode);
show("подстановки перевода ≠ русским", badPlaceholders);
show("литералы с ключом — codemod не применён", literalKeyed, 5);
show("литералы без ключа — дополнить names.json", literalUnnamed);
for (const l of langs) console.log(`  ${l}: нет перевода ${perLang[l].missing}, устарел ${perLang[l].stale}, черновик ${perLang[l].draft}`);

const fatal = problems.length + notInTable.length + ruMismatch.length + badPlaceholders.length + literalUnnamed.length +
  (calls.size ? literalKeyed.length + notInCode.length : 0);
process.exit(argv.includes("--strict") && fatal ? 1 : 0);
