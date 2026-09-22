#!/usr/bin/env node
/**
 * Сборка локализованной копии PhiloSynth по переведённой описи.
 *
 *   node scripts/i18n/build-localized.mjs --json ui-strings.en.json --out ../philosynth-en
 *        [--src <корень исходника>] [--clean]
 *
 * Исходник не трогается: он копируется в --out (без .git, node_modules,
 * dist), и в копии заменяются строки с заполненным "tr". Записи ищутся
 * заново разбором исходника и сопоставляются по id, поэтому опись переживает
 * правки кода, пока не изменилась сама строка. Нужны установленные
 * зависимости исходника (npm install): по типам отсеиваются литералы-значения.
 * Строка внутри ${…} шаблона, который тоже переводится, подставляется
 * в перевод внешнего шаблона уже переведённой.
 *
 * Отчёт: применено / без перевода / устаревшие (записи в коде больше нет) /
 * ошибки перевода (подстановки) / новые строки кода, которых нет в описи.
 * Каждый изменённый файл перепроверяется парсером. Код возврата 1 —
 * при ошибках перевода или синтаксиса.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractProject, parseErrors, renderReplacement } from "./ui-strings-lib.mjs";

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const SRC = path.resolve(opt("--src", path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")));
const jsonPath = opt("--json", null);
const OUT = opt("--out", null) && path.resolve(opt("--out"));
if (!jsonPath || !OUT) {
  console.error("нужно: --json <переведённая опись> --out <каталог копии>");
  process.exit(2);
}
if (OUT === SRC || OUT.startsWith(SRC + path.sep)) {
  console.error("--out не может лежать внутри исходника");
  process.exit(2);
}
if (fs.existsSync(OUT)) {
  if (!argv.includes("--clean")) {
    console.error(`${OUT} уже существует — добавьте --clean, чтобы пересоздать`);
    process.exit(2);
  }
  fs.rmSync(OUT, { recursive: true, force: true });
}

/* 1. копия */
const SKIP = new Set([".git", "node_modules", "dist", "build", ".cache"]);
fs.cpSync(SRC, OUT, {
  recursive: true,
  filter: (p) => !SKIP.has(path.basename(p)),
});

/* 2. переводы из описи */
const doc = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const wanted = new Map(); // id → {rel, e}
let untranslated = 0;
for (const [rel, list] of Object.entries(doc.files)) {
  for (const e of list) {
    if (e.tr == null || e.tr === e.text) untranslated++;
    else wanted.set(e.id, { rel, e });
  }
}
const known = new Set(Object.values(doc.files).flat().map((e) => e.id));

/* 3. разбор исходника (с проверкой типов) и замены в копии: копия
 *    побайтно совпадает с исходником, диапазоны переносятся как есть */
const report = { applied: 0, invalid: [], warned: [], fresh: [], syntax: [] };
const project = extractProject(SRC, { withWarnings: false });
for (const f of project.files) {
  const entries = f.entries;
  const abs = path.join(OUT, f.rel);
  for (const e of entries) if (!known.has(e.id)) report.fresh.push(`${f.rel}:${e.line} ${e.text}`);

  // Записи с переводом этого файла
  const chosen = [];
  for (const e of entries) {
    const w = wanted.get(e.id);
    if (!w) continue;
    wanted.delete(e.id);
    chosen.push({ e, tr: w.e.tr, warn: w.e.warn });
  }
  // Вложенность: строка внутри ${…} шаблона, который тоже переводится.
  // Код подстановки внешней записи собирается из исходника с уже
  // применёнными внутренними заменами; в файл пишутся только внешние.
  const inside = (a, [s, e]) => a.e.start >= s && a.e.end <= e;
  const rendered = new Map();
  const render = (c) => {
    if (rendered.has(c)) return rendered.get(c);
    const src0 = fs.readFileSync(abs, "utf8");
    const argCode = (c.e.argSpans ?? []).map((span) => {
      let code = src0.slice(span[0], span[1]);
      const inner = chosen.filter((x) => x !== c && inside(x, span)).filter(
        (x) => !chosen.some((y) => y !== x && y !== c && inside(y, span) && x.e.start >= y.e.start && x.e.end <= y.e.end && (y.e.start !== x.e.start || y.e.end !== x.e.end)));
      for (const x of inner.sort((a, b) => b.e.start - a.e.start)) {
        const r = render(x);
        if (r.error) continue;
        code = code.slice(0, x.e.start - span[0]) + r.code + code.slice(x.e.end - span[0]);
      }
      return code;
    });
    const r = renderReplacement(c.e, c.tr, argCode.length ? argCode : c.e.args);
    rendered.set(c, r);
    return r;
  };
  const edits = [];
  for (const c of chosen) {
    const r = render(c);
    if (r.error) {
      report.invalid.push(`${f.rel}:${c.e.line} [${c.e.id}] ${r.error}`);
      continue;
    }
    if (c.warn) report.warned.push(`${f.rel}:${c.e.line} ${JSON.stringify(c.e.text)} — ${c.warn}`);
    const nested = chosen.some((o) => o !== c && c.e.start >= o.e.start && c.e.end <= o.e.end);
    if (!nested) edits.push({ start: c.e.start, end: c.e.end, code: r.code });
  }
  if (!edits.length) continue;
  let src = fs.readFileSync(abs, "utf8");
  for (const ed of edits.sort((a, b) => b.start - a.start)) {
    src = src.slice(0, ed.start) + ed.code + src.slice(ed.end);
  }
  fs.writeFileSync(abs, src);
  report.applied += chosen.length - chosen.filter((c) => rendered.get(c)?.error).length;
  for (const err of parseErrors(abs)) report.syntax.push(`${f.rel}:${err}`);
}
const stale = [...wanted.values()].map(({ rel, e }) => `${rel}:${e.line} [${e.id}] ${e.text}`);

/* 4. отчёт */
const show = (title, list, limit = 30) => {
  if (!list.length) return;
  console.log(`\n${title} (${list.length}):`);
  for (const s of list.slice(0, limit)) console.log("  " + s.slice(0, 160));
  if (list.length > limit) console.log(`  … ещё ${list.length - limit}`);
};
console.log(`копия: ${OUT}`);
console.log(`применено ${report.applied}, без перевода ${untranslated}, устаревших ${stale.length}, ошибок перевода ${report.invalid.length}, ошибок синтаксиса ${report.syntax.length}`);
show("ошибки перевода", report.invalid);
show("ошибки синтаксиса после замены", report.syntax);
show("устаревшие записи (строки в коде больше нет — пересоберите опись с --merge)", stale);
show("переведены строки с предупреждением", report.warned, 15);
show("новые строки кода, которых нет в описи", report.fresh, 15);
process.exit(report.invalid.length || report.syntax.length ? 1 : 0);
