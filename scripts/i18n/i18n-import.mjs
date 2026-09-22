#!/usr/bin/env node
/**
 * i18n:import — влить переведённый файл в мастер-таблицу.
 *
 *   node scripts/i18n/i18n-import.mjs <файл> [--dry] [--draft]
 *
 * Для каждой строки файла и каждого языка, где перевод заполнен:
 *   ключа нет в таблице                 → отклонено;
 *   русский текст в таблице уже другой  → отклонено целиком: перевод сделан
 *                                         с прежней версии, её надо выгрузить заново;
 *   подстановки перевода ≠ русским      → отклонён этот язык;
 *   иначе                               → перевод записан, from[язык] = ru,
 *                                         отметка draft снята (с --draft — ставится:
 *                                         так вливают машинный черновик);
 *   перевод тот же, что в таблице       → без изменений; если переводчик убрал
 *                                         язык из draft записи — вычитка подтверждена,
 *                                         отметка снимается.
 * Колонки ru, params, where из файла не берутся — их источник код.
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LANGS, TABLE_PATH, readTable, writeTable, placeholderSet, isStale } from "./i18n-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith("--"));
if (!file) { console.error("нужно: <переведённый файл>"); process.exit(2); }
const dry = argv.includes("--dry");
const asDraft = argv.includes("--draft");

const table = readTable(ROOT);
const S = table.strings;
const incoming = JSON.parse(fs.readFileSync(path.resolve(file), "utf8")).strings ?? {};

const rep = { applied: 0, reviewed: 0, unchanged: 0, empty: 0, rejected: [] };
for (const [key, item] of Object.entries(incoming)) {
  const row = S[key];
  if (!row) { rep.rejected.push(`${key}: ключа нет в таблице`); continue; }
  if (item.ru !== row.ru) { rep.rejected.push(`${key}: русский текст изменился после выгрузки («${item.ru}» → «${row.ru}») — выгрузите заново`); continue; }
  for (const l of LANGS) {
    if (l === "ru") continue;
    const v = item[l];
    if (v == null || v === "") { rep.empty++; continue; }
    if (placeholderSet(v) !== placeholderSet(row.ru)) {
      rep.rejected.push(`${key} [${l}]: подстановки ${placeholderSet(v) || "—"} ≠ ${placeholderSet(row.ru) || "—"}`);
      continue;
    }
    const inTableDraft = row.draft?.includes(l);
    const inFileDraft = item.draft?.includes(l);
    if (v === row[l] && !isStale(row, l)) {
      // тот же текст: вычитка подтверждена, только если переводчик снял отметку draft
      if (inTableDraft && !inFileDraft && !asDraft) {
        row.draft = row.draft.filter((x) => x !== l);
        if (!row.draft.length) delete row.draft;
        rep.reviewed++;
      } else rep.unchanged++;
      continue;
    }
    row[l] = v;
    row.from = { ...(row.from ?? {}), [l]: row.ru };
    const drafts = new Set(row.draft ?? []);
    if (asDraft) drafts.add(l); else drafts.delete(l);
    if (drafts.size) row.draft = [...drafts]; else delete row.draft;
    rep.applied++;
  }
}
if (!dry && (rep.applied || rep.reviewed)) {
  table.meta.imported = new Date().toISOString();
  writeTable(path.join(ROOT, TABLE_PATH), table);
}

console.log(`${dry ? "(--dry) " : ""}влито переводов ${rep.applied}, подтверждено вычиткой ${rep.reviewed}, без изменений ${rep.unchanged}, пустых ${rep.empty}, отклонено ${rep.rejected.length}`);
for (const r of rep.rejected.slice(0, 40)) console.log("  ✗ " + r.slice(0, 180));
if (rep.rejected.length > 40) console.log(`  … ещё ${rep.rejected.length - 40}`);
process.exit(rep.rejected.length ? 1 : 0);
