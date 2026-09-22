#!/usr/bin/env node
/**
 * i18n:codemod — переписать строки интерфейса в вызовы tl() по мастер-таблице.
 *
 *   node scripts/i18n/i18n-codemod.mjs --out <каталог копии> [--clean]   испытание на копии
 *   node scripts/i18n/i18n-codemod.mjs --in-place                        применение к репозиторию
 *
 * Что делает с записью описи, у которой в таблице есть ключ:
 *   JSX-текст        Войти                 → {tl("loginPage.submit", "Войти")}
 *   JSX-атрибут      placeholder="Поиск…"  → placeholder={tl("…", "Поиск…")}
 *   литерал          "Ошибка"              → tl("common.error", "Ошибка")
 *   шаблон / {0}     `Автор: ${name}`      → tl("…", "Автор: {authorName}", { authorName: name })
 * и добавляет в файл импорт tl. Строки внутри подстановок переводимого
 * шаблона переписываются там же (вложенность учитывается).
 *
 * Не трогает: файлы-данные (packages/shared, сиды БД), строки без ключа
 * (исключённые как неинтерфейсные), файлы, где имя tl уже занято.
 * Отчёт перечисляет static-строки (вычисляются при импорте модуля) — их
 * при смене языка нужно переделать вручную.
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { extractProject, namespaceOf, isDataFile, parseErrors } from "./ui-strings-lib.mjs";
import { FN, FN_MODULE, TABLE_PATH, loadNames, resolveName, readTable } from "./i18n-core.mjs";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const inPlace = argv.includes("--in-place");
const outArg = argv.includes("--out") ? path.resolve(argv[argv.indexOf("--out") + 1]) : null;
if (!inPlace && !outArg) {
  console.error("нужно: --out <каталог копии> или --in-place");
  process.exit(2);
}
const OUT = inPlace ? SRC : outArg;
if (!inPlace) {
  if (OUT === SRC || OUT.startsWith(SRC + path.sep)) { console.error("--out не может лежать внутри исходника"); process.exit(2); }
  if (fs.existsSync(OUT)) {
    if (!argv.includes("--clean")) { console.error(`${OUT} уже существует — добавьте --clean`); process.exit(2); }
    fs.rmSync(OUT, { recursive: true, force: true });
  }
  const SKIP = new Set([".git", "node_modules", "dist", "build", ".cache"]);
  fs.cpSync(SRC, OUT, { recursive: true, filter: (p) => !SKIP.has(path.basename(p)) });
}

const table = readTable(SRC);
const names = loadNames(SRC);
const project = extractProject(SRC, { withWarnings: false });

const q = (s) => JSON.stringify(s);
const IDENT = /^[A-Za-z_$][\w$]*$/;

/** Объявлено ли имя в файле (переменная, параметр, функция, импорт). */
function declares(abs, name) {
  const src = fs.readFileSync(abs, "utf8");
  if (!src.includes(name)) return false;
  const sf = ts.createSourceFile(abs, src, ts.ScriptTarget.Latest, true, abs.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let hit = false;
  (function v(n) {
    if (hit) return;
    if (ts.isIdentifier(n) && n.text === name) {
      const p = n.parent;
      if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p) ||
           ts.isBindingElement(p) || ts.isImportSpecifier(p) || ts.isImportClause(p)) && p.name === n) hit = true;
    }
    ts.forEachChild(n, v);
  })(sf);
  return hit;
}

/** Вставить импорт tl после последнего import верхнего уровня. */
function addImport(src, abs) {
  if (new RegExp(`import\\s*\\{[^}]*\\b${FN}\\b[^}]*\\}\\s*from\\s*["']${FN_MODULE}["']`).test(src)) return src;
  const sf = ts.createSourceFile(abs, src, ts.ScriptTarget.Latest, true, abs.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports = sf.statements.filter((s) => ts.isImportDeclaration(s));
  const line = `import { ${FN} } from "${FN_MODULE}";\n`;
  if (!imports.length) {
    // после шапочного комментария, если он есть
    const first = sf.statements[0];
    const at = first ? first.getStart(sf) : 0;
    return src.slice(0, at) + line + src.slice(at);
  }
  const end = imports.at(-1).end;
  return src.slice(0, end) + "\n" + line.trimEnd() + src.slice(end);
}

const report = { files: 0, rewritten: 0, skippedFiles: [], static: [], syntax: [], noKey: 0, manual: [] };

for (const f of project.files) {
  if (isDataFile(f.rel) || !f.entries.length) continue;
  const abs = path.join(OUT, f.rel);
  const ns = namespaceOf(f.rel);

  const chosen = [];
  for (const e of f.entries) {
    const r = resolveName(names, ns, e);
    if (!r || r.exclude) { if (!r) report.noKey++; continue; }
    const row = table.strings[r.key];
    if (!row) { report.noKey++; continue; }
    if (e.unprintable) { report.manual.push(`${f.rel}:${e.line} ${r.key} — подстановка не строка и не число (JSX-элемент?)`); continue; }
    chosen.push({ e, key: r.key, row });
  }
  if (!chosen.length) continue;
  if (declares(abs, FN)) {
    report.skippedFiles.push(`${f.rel}: имя ${FN} уже объявлено`);
    continue;
  }

  const src0 = fs.readFileSync(abs, "utf8");
  const inside = (a, [s, e]) => a.e.start >= s && a.e.end <= e;
  const contains = (o, c) => o !== c && c.e.start >= o.e.start && c.e.end <= o.e.end;
  const rendered = new Map();

  const render = (c) => {
    if (rendered.has(c)) return rendered.get(c);
    const argCode = (c.e.argSpans ?? []).map((span) => {
      let code = src0.slice(span[0], span[1]);
      // только непосредственно вложенные записи; глубже — их отрисует render
      const inner = chosen.filter((x) => x !== c && inside(x, span) &&
        !chosen.some((y) => y !== x && y !== c && inside(y, span) && contains(y, x)));
      for (const x of inner.sort((a, b) => b.e.start - a.e.start)) {
        code = code.slice(0, x.e.start - span[0]) + render(x) + code.slice(x.e.end - span[0]);
      }
      return code;
    });
    const names = Object.keys(c.row.params ?? {});
    let call;
    if (names.length) {
      const props = names.map((n, i) => (argCode[i] === n && IDENT.test(n) ? n : `${n}: ${argCode[i]}`));
      call = `${FN}(${q(c.key)}, ${q(c.row.ru)}, { ${props.join(", ")} })`;
    } else {
      call = `${FN}(${q(c.key)}, ${q(c.row.ru)})`;
    }
    const code = c.e.kind === "jsx" || c.e.jsxAttr ? `{${call}}` : call;
    rendered.set(c, code);
    return code;
  };

  const edits = [];
  for (const c of chosen) {
    const code = render(c);
    if (!chosen.some((o) => contains(o, c))) edits.push({ start: c.e.start, end: c.e.end, code });
    if (c.e.static) report.static.push(`${f.rel}:${c.e.line} ${c.key}`);
  }
  let src = src0;
  for (const ed of edits.sort((a, b) => b.start - a.start)) src = src.slice(0, ed.start) + ed.code + src.slice(ed.end);
  src = addImport(src, abs);
  fs.writeFileSync(abs, src);
  report.files++;
  report.rewritten += chosen.length;
  for (const err of parseErrors(abs)) report.syntax.push(`${f.rel}:${err}`);
}

const show = (title, list, limit = 20) => {
  if (!list.length) return;
  console.log(`\n${title} (${list.length}):`);
  for (const s of list.slice(0, limit)) console.log("  " + s.slice(0, 160));
  if (list.length > limit) console.log(`  … ещё ${list.length - limit}`);
};
console.log(`${inPlace ? "в репозитории" : `копия: ${OUT}`}`);
console.log(`файлов переписано ${report.files}, строк ${report.rewritten}; без ключа ${report.noKey}; ошибок синтаксиса ${report.syntax.length}`);
show("файлы пропущены", report.skippedFiles);
show("оставлены как есть — переделать вручную", report.manual);
show("ошибки синтаксиса", report.syntax);
show("static — вычисляются при импорте модуля, при смене языка не обновятся (переделать вручную)", report.static, 15);
process.exit(report.syntax.length ? 1 : 0);
