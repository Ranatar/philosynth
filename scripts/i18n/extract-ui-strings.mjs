#!/usr/bin/env node
/**
 * Опись строк интерфейса PhiloSynth в один JSON-файл.
 *
 *   node scripts/i18n/extract-ui-strings.mjs [--out ui-strings.json] [--merge old.json]
 *
 * --merge: перенести поле "tr" (перевод) из прежней описи по id — после правок
 * кода опись пересобирается без потери сделанного перевода; исчезнувшие
 * записи с переводом перечисляются в отчёте.
 *
 * Формат (одна запись — одна строка файла, чтобы текст читался подряд):
 *   { "meta": {...},
 *     "files": { "client/src/pages/LoginPage.tsx": [
 *         {"id":"…","line":42,"kind":"jsx","text":"Войти","tr":null}, … ] } }
 * Переводчик заполняет только "tr"; null — оставить исходный текст.
 * {0}, {1}… — подстановки; в переводе их можно переставлять, но каждая
 * должна встретиться ровно столько раз, сколько нужно (минимум один).
 * "args" — что стоит за подстановками (исходный код выражения), для справки.
 * "warn" — строку опасно переводить вслепую (см. meta.kinds).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractProject } from "./ui-strings-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const outPath = path.resolve(opt("--out", path.join(ROOT, "ui-strings.json")));
const mergePath = opt("--merge", null);

const { files, matcherCount } = extractProject(ROOT);

/* перенос переводов */
const oldTr = new Map();
if (mergePath) {
  const old = JSON.parse(fs.readFileSync(mergePath, "utf8"));
  for (const [rel, list] of Object.entries(old.files)) {
    for (const e of list) if (e.tr != null) oldTr.set(e.id, { rel, e });
  }
}

const groups = {};
let total = 0, chars = 0;
const unique = new Set();
for (const f of files) {
  for (const e of f.entries) {
    e.tr = oldTr.get(e.id)?.e.tr ?? null;
    oldTr.delete(e.id);
    groups[f.group] ??= { files: 0, entries: 0, chars: 0 };
    groups[f.group].entries++;
    groups[f.group].chars += e.text.length;
    total++; chars += e.text.length; unique.add(e.text);
  }
  if (f.entries.length) groups[f.group].files++;
}

const meta = {
  generated: new Date().toISOString(),
  source: "PhiloSynth (Ranatar/philosynth)",
  totals: { entries: total, unique: unique.size, chars, groups },
  excludedMatchers: matcherCount,
  kinds: {
    jsx: "текст внутри JSX; {0},{1}… — выражения между кусками текста",
    attr: "строка в JSX-атрибуте (placeholder, title, aria-label…)",
    str: "строковый литерал в коде: сообщения, подписи, словари",
    tpl: "шаблонная строка; {0},{1}… — ${…}",
  },
  groups: {
    client: "клиент (client/src)",
    shared: "общие константы packages/shared — используются и сервером",
    "server-data": "данные, которые сервер отдаёт в интерфейс: матрица совместимости, лог, таксономия",
    "server-messages": "сообщения сервера об ошибках и отказах, доходящие до пользователя",
  },
  notInScope: [
    "server/config/prompt-templates.ts, section-templates.ts и прочие промпты — модель, а не интерфейс",
    "server/config/export-assets.ts — оболочка экспортируемого HTML",
    "строки-сопоставители (разбор документа) — excludedMatchers",
  ],
  howTo: "Заполнить \"tr\"; null — оставить как есть. Сборка: node scripts/i18n/build-localized.mjs --json <файл> --out <каталог>",
};

/* запись: meta — развёрнуто, записи — по одной на строку */
const KEYS = ["id", "line", "kind", "text", "tr", "args", "warn"];
const lines = ["{", `  "meta": ${JSON.stringify(meta, null, 2).replace(/\n/g, "\n  ")},`, `  "files": {`];
const nonEmpty = files.filter((f) => f.entries.length);
nonEmpty.forEach((f, fi) => {
  lines.push(`    ${JSON.stringify(f.rel)}: [`);
  f.entries.forEach((e, ei) => {
    const o = {};
    for (const k of KEYS) if (e[k] !== undefined) o[k] = e[k];
    lines.push(`      ${JSON.stringify(o)}${ei < f.entries.length - 1 ? "," : ""}`);
  });
  lines.push(`    ]${fi < nonEmpty.length - 1 ? "," : ""}`);
});
lines.push("  }", "}", "");
fs.writeFileSync(outPath, lines.join("\n"));

console.log(`опись: ${outPath}`);
console.log(`записей ${total} (уникальных текстов ${unique.size}), знаков ${chars}; сопоставителей исключено ${matcherCount}`);
for (const [g, v] of Object.entries(groups)) console.log(`  ${g.padEnd(16)} файлов ${String(v.files).padStart(3)}  записей ${String(v.entries).padStart(5)}  знаков ${v.chars}`);
if (mergePath) {
  const carried = [...files].reduce((s, f) => s + f.entries.filter((e) => e.tr != null).length, 0);
  console.log(`перенесено переводов: ${carried}; осиротело (записи больше нет): ${oldTr.size}`);
  for (const { rel, e } of oldTr.values()) console.log(`  ✗ ${rel}:${e.line} ${JSON.stringify(e.text).slice(0, 80)}`);
}
