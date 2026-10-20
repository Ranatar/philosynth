/**
 * Общая часть extract-ui-strings.mjs и build-localized.mjs: разбор исходников
 * TypeScript-парсером и опись строк, выводимых в интерфейс.
 *
 * Каждая запись описи — фрагмент исходника с точным диапазоном [start, end)
 * и правилом обратной записи. Идентификатор записи не зависит от номеров
 * строк: хэш (файл, вид, текст, порядковый номер среди одинаковых), так что
 * сборщик находит запись в изменившемся исходнике, пока не изменилась она сама.
 *
 * Виды записей:
 *   jsx  — связный текст внутри JSX-элемента; выражения между кусками текста
 *          заменены на {0}, {1}… (при переводе их можно переставлять);
 *   attr — строка в JSX-атрибуте (placeholder, title, aria-label… или с кириллицей);
 *   str  — строковый литерал в коде (кириллический): сообщения, подписи, словари;
 *   tpl  — шаблонная строка `…${x}…`; ${…} заменены на {0}, {1}…
 *
 * Строки-сопоставители (ключи словарей, аргументы includes/startsWith/…,
 * операнды сравнений, case, RegExp) в опись НЕ попадают: по ним разбирается
 * сгенерированный документ, переводить их нельзя.
 */

import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const CYR = /[А-Яа-яЁё]/;
const LETTER = /\p{L}/u;

/* ───────────── Охват ───────────── */

/**
 * mode "ui"  — всё, что похоже на интерфейсный текст (JSX, атрибуты,
 *              кириллические литералы);
 * mode "msg" — только кириллические литералы в сообщениях: throw, new *Error,
 *              свойства message/error/title/…, вызовы c.json/fail/…
 */
export const SCOPE = [
  { group: "client", dir: "client/src", mode: "ui" },
  {
    group: "shared",
    dir: "packages/shared",
    mode: "ui",
    skip: [
      "packages/shared/constants/phil-filename.ts", // таблица транслитерации имён файлов
      "packages/shared/utils/transliterate.ts",
      "packages/shared/utils/normalize.ts",
      "packages/shared/utils/colorize-log.ts", // только регулярки
      // 13.1 (Д-63): общий модуль разметки и ядро санитайзера — их русские
      // строки суть диагностика (расхождения модуля с промптом — вывод сторожа;
      // sanitizeWarningsRu — ХРАНИМАЯ форма предупреждений чистки в parseWarnings
      // генлога, язык записи — не язык чтения, 14.2/Д-54). Фразы для ОТВЕТА
      // (warnings правки подраздела, импорта) с 14.1 (Д-60) собирает
      // server/utils/html-parser.ts: sanitizeWarnings(report) через tl() — он в
      // охвате группы server-messages.
      "packages/shared/constants/doc-markup.ts",
      "packages/shared/utils/doc-markup-sanitize.ts",
    ],
  },
  { group: "server-data", file: "server/config/compat-matrix.ts", mode: "ui" },
  { group: "server-data", file: "server/services/compat-advisor.ts", mode: "ui" },
  { group: "server-data", file: "server/services/log-formatter.ts", mode: "ui" },
  { group: "server-data", file: "scripts/seed/seed-taxonomy.ts", mode: "ui" },
  { group: "server-messages", dir: "server/routes", mode: "msg" },
  { group: "server-messages", dir: "server/services", mode: "msg" },
  { group: "server-messages", dir: "server/ws", mode: "msg" },
  { group: "server-messages", dir: "server/middleware", mode: "msg" },
  // 14.1 (Д-58, п.3): ВЕСЬ server/ в режиме msg — до 14.1 index.ts (notFound /
  // onError) и utils/ (html-parser: отказы и предупреждения ручной правки) были
  // вне охвата, и русский литерал там проходил i18n:check. Вне описи остаётся то,
  // что русским положено по конституции Фазы 11: server/config (промпты и генераты
  // из исходника), server/db (схема — значения БД), server/env.ts (отказы при
  // старте — вывод в консоль, не ответ человеку), сторожа audit/integration-check
  // (их вывод — консоль). Белый список — ЭТИ строки и STORED_TEXT_EXCLUSIONS
  // (i18n-core): новая запись — только с доводом.
  {
    group: "server-messages",
    dir: "server",
    mode: "msg",
    skipDirs: ["server/config", "server/db"],
    skip: ["server/env.ts", "server/audit.mts", "server/integration-check.mts"],
  },
];

/** Каталоги, чьи строки не входят в опись, но сверяются: попадание текста
 *  записи внутрь промпта даёт предупреждение. */
const PROMPT_DIR = "server/config";

const VISIBLE_ATTRS = new Set([
  "placeholder", "title", "alt", "aria-label", "aria-description", "label",
  "tooltip", "description", "hint", "text", "message", "caption", "heading",
  "subtitle", "emptyText", "confirmText",
]);
const HIDDEN_ATTRS = new Set([
  "className", "key", "to", "href", "type", "id", "name", "style", "role",
  "htmlFor", "method", "src", "rel", "target", "autoComplete", "inputMode",
  "data-testid", "viewBox", "d", "fill", "stroke", "xmlns", "lang", "value",
]);
// 14.1 (Д-58): + subject — тема письма (mail/templates), собранная в
// переменную и отданная свойством `{ subject, text, html }`.
// 14.1 (Д-56): + desc — описания маркеров легенды PNG («внутренний силуэт»).
const MSG_PROPS = /^(message|error|text|title|label|warning|reason|hint|description|subject|desc)$/;
// 14.1 (Д-58, п.1): цель присваивания `details[поле] = "…"` / `d.email = "…"` —
// словари отказов проверки полей (ответ VALIDATION_ERROR, клиент показывает
// как есть). Имя словаря — по соглашению кода (details, d, dd, errors…) либо
// свойство с именем из MSG_PROPS.
const DETAILS_IDS = /^(d|dd|details|errors?|problems?|fieldErrors|issues)$/;
// 14.1 (Д-58, п.5): накопители предупреждений — `warnings.push("…")`.
const PUSH_TARGETS = /^(warnings?|warns|errs|errors|problems|messages|notes|hints|reasons|lost|missing)$/;
// 12.3 (Д-32): + decline и *hint — сообщения планировщика рекомендаций.
// Отказ `decline(r, "код", "текст")` и часть подсказки `addHint("текст")` уходят
// в ответ человеку, но ни throw, ни new *Error, ни свойство message их не
// окружает: до 12.3 опись их не видела, и литерал без tl() проходил i18n:check
// («По факту 11.4» п.14). Код отказа (второй довод decline) — латиница, в
// опись не попадает: msg-режим берёт только кириллические литералы.
// 14.1 (Д-58/Д-56): + …Json (локальные обёртки ответа — validationJson), + fillText /
// strokeText (текст, нарисованный на холсте PNG-выгрузки, читает человек).
const MSG_CALLS = /(\.json|Json|fail|decline|hint|badRequest|httpError|apiError|fillText|strokeText)$/i;
const MATCHER_METHODS =
  /^(includes|startsWith|endsWith|indexOf|lastIndexOf|test|match|matchAll|search|split|replace|replaceAll|has|querySelector|querySelectorAll|closest)$/;

/* ───────────── Файлы ───────────── */

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!["node_modules", "dist", "build"].includes(e.name)) walk(p, out);
    } else if (/\.(tsx?|mts)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

/** [{rel, group, mode}] — файлы охвата в стабильном порядке. */
export function listScopeFiles(root) {
  const res = [];
  const seen = new Set();
  for (const s of SCOPE) {
    const files = s.file ? [path.join(root, s.file)] : walk(path.join(root, s.dir)).sort();
    for (const abs of files) {
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (seen.has(rel) || !fs.existsSync(abs)) continue;
      if (s.skip?.includes(rel)) continue;
      if (s.skipDirs?.some((d) => rel.startsWith(d + "/"))) continue;
      if (rel.startsWith("packages/shared/i18n/generated/")) continue; // генераты 11.2/11.4 — не опись
      seen.add(rel);
      res.push({ rel, group: s.group, mode: s.mode });
    }
  }
  return res;
}

/* ───────────── Разбор ───────────── */

function parse(abs) {
  const src = fs.readFileSync(abs, "utf8");
  const kind = abs.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(abs, src, ts.ScriptTarget.Latest, true, kind);
}

const isStrLike = (n) =>
  ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n);

function containsNode(n, pred) {
  let found = false;
  (function v(x) {
    if (found) return;
    if (pred(x)) { found = true; return; }
    ts.forEachChild(x, v);
  })(n);
  return found;
}

function hasJsx(n) {
  return containsNode(n, (x) =>
    ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x));
}

function hasCyrLiteral(n) {
  return containsNode(n, (x) => isStrLike(x) && CYR.test(x.getText()));
}

function inConsole(n, sf) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && /^(console|logger|log)\./.test(p.expression.getText(sf))) return true;
  }
  return false;
}

function inTypeOrImport(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) ||
        ts.isExternalModuleReference(p) || ts.isImportTypeNode(p)) return true;
  }
  return false;
}

/** Литерал в позиции «сопоставителя»: переводить нельзя. */
function isMatcher(n, sf) {
  const p = n.parent;
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) && p.name === n) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === n) return true;
  if (ts.isCaseClause(p)) return true;
  if (ts.isBinaryExpression(p)) {
    const k = p.operatorToken.kind;
    if ([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
         ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken,
         ts.SyntaxKind.InKeyword].includes(k)) return true;
  }
  if (ts.isCallExpression(p) && p.arguments.includes(n)) {
    const e = p.expression;
    if (ts.isPropertyAccessExpression(e) && MATCHER_METHODS.test(e.name.text)) return true;
  }
  if (ts.isNewExpression(p) && p.expression.getText(sf) === "RegExp") return true;
  return false;
}

/** Имя JSX-атрибута, внутри значения которого лежит узел (или null). */
function jsxAttrName(n, sf) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p)) return p.name.getText(sf);
    if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxFragment(p) ||
        ts.isBlock(p) || ts.isFunctionLike(p)) return null;
  }
  return null;
}

/** Внутри функции (вычисляется при вызове) или на уровне модуля (при импорте). */
function inFunction(n) {
  for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p) || ts.isClassStaticBlockDeclaration?.(p)) return true;
  return false;
}

/** Корневой идентификатор цепочки `a.b[c].d` (или null). */
function rootIdentifier(e) {
  while (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e) || ts.isNonNullExpression(e)) e = e.expression;
  return ts.isIdentifier(e) ? e : null;
}

/** Левая часть присваивания — словарь отказов проверки полей либо свойство-сообщение. */
function isDetailsTarget(lhs, sf) {
  if (ts.isElementAccessExpression(lhs) || ts.isPropertyAccessExpression(lhs)) {
    const root = rootIdentifier(lhs);
    if (root && DETAILS_IDS.test(root.text)) return true;
    if (ts.isPropertyAccessExpression(lhs) && MSG_PROPS.test(lhs.name.getText(sf))) return true;
  }
  return false;
}

/** `super(…)` в классе, расширяющем *Error: довод — сообщение ошибки. */
function isErrorSuperCall(p, sf) {
  if (!ts.isCallExpression(p) || p.expression.kind !== ts.SyntaxKind.SuperKeyword) return false;
  for (let c = p.parent; c; c = c.parent) {
    if (ts.isClassDeclaration(c) || ts.isClassExpression(c)) {
      const ext = (c.heritageClauses ?? []).find((h) => h.token === ts.SyntaxKind.ExtendsKeyword);
      return !!ext && ext.types.some((t) => /Error$/.test(t.expression.getText(sf)));
    }
  }
  return false;
}

/**
 * Узел стоит в сообщении человеку. Исходные виды (11.2): довод throw,
 * `new …Error(…)`, свойство из MSG_PROPS, довод вызова из MSG_CALLS.
 * 14.1 (Д-58) — пять слепых видов ревизии непереведённого 2026-10-13:
 *  (1) правая часть присваивания в словарь отказов `details[поле] = …`;
 *  (5) довод `warnings.push(…)` и прочих накопителей PUSH_TARGETS;
 *  (6) довод `super(…)` в классе-наследнике *Error (prompt-registry);
 *  (2) и (4) — литералы, отданные ПО ИМЕНИ (константа уровня модуля,
 *      локальная переменная, функция того же файла), разбираются
 *      resolveByName ниже: этот предикат проверяет только контекст узла.
 */
function isMessageContext(n, sf, sinks = null) {
  let child = n;
  for (let p = n.parent; p && !ts.isBlock(p) && !ts.isSourceFile(p); child = p, p = p.parent) {
    if (ts.isThrowStatement(p)) return true;
    // (7) довод локальной функции, которая отдаёт этот параметр в сообщение
    // (secTitle(text) → ctx.fillText(text); validationJson(c, details, error) → c.json({ error }))
    if (sinks && ts.isCallExpression(p) && ts.isIdentifier(p.expression) && sinks.has(p.expression.text) &&
        sinks.get(p.expression.text).has(p.arguments.indexOf(child))) return true;
    if (ts.isNewExpression(p) && /Error$/.test(p.expression.getText(sf))) return true;
    if (ts.isPropertyAssignment(p) && MSG_PROPS.test(p.name.getText(sf))) return true;
    if (ts.isShorthandPropertyAssignment(p) && MSG_PROPS.test(p.name.getText(sf))) return true;
    if (ts.isCallExpression(p) && MSG_CALLS.test(p.expression.getText(sf))) return true;
    if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        child === p.right && isDetailsTarget(p.left, sf)) return true;
    if (ts.isCallExpression(p) && p.arguments.includes(child) && ts.isPropertyAccessExpression(p.expression) &&
        p.expression.name.text === "push") {
      const root = rootIdentifier(p.expression.expression);
      if (root && PUSH_TARGETS.test(root.text)) return true;
    }
    if (isErrorSuperCall(p, sf) && p.arguments.includes(child)) return true;
  }
  return false;
}

/* ───────────── 14.1 (Д-58, пп.2 и 4): литералы, отданные по имени ───────────── */

function scopeOf(n, sf) {
  for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p) || ts.isSourceFile(p)) return p;
  return sf;
}

/** Объявления файла по имени: переменные (с присваиваниями `name = …` в той же
 *  области — `let bad = null; … bad = "…"`), параметры с умолчанием, функции
 *  (объявления и стрелочные/функциональные выражения в const). */
function collectDeclarations(sf) {
  const decls = new Map(); // имя → [{ node, scope, assigns: [] }]
  const add = (name, node) => {
    if (!decls.has(name)) decls.set(name, []);
    const rec = { node, scope: scopeOf(node, sf), assigns: [] };
    decls.get(name).push(rec);
    return rec;
  };
  const assigns = [];
  (function v(n) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) add(n.name.text, n);
    else if (ts.isParameter(n) && ts.isIdentifier(n.name) && n.initializer) add(n.name.text, n);
    else if (ts.isFunctionDeclaration(n) && n.name) add(n.name.text, n);
    else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left)) assigns.push(n);
    ts.forEachChild(n, v);
  })(sf);
  for (const a of assigns) {
    const rec = resolveDeclRec(decls, a.left.text, a);
    if (rec) rec.assigns.push(a.right);
  }
  return decls;
}

function resolveDeclRec(decls, name, use) {
  let best = null;
  for (const d of decls.get(name) ?? []) {
    if (d.scope.pos <= use.pos && use.end <= d.scope.end && (!best || d.scope.pos >= best.scope.pos)) best = d;
  }
  return best;
}

/** Ближайшее объявление имени, чья область охватывает место употребления. */
function resolveDecl(decls, name, use) {
  return resolveDeclRec(decls, name, use)?.node ?? null;
}

/** Выражения-значения объявления: инициализатор и присваивания переменной
 *  либо return функции (объявленной или присвоенной в const). */
function valueNodesOf(rec) {
  const decl = rec.node;
  const fnReturns = (fn) => {
    const out = [];
    if (!fn.body) return out;
    if (!ts.isBlock(fn.body)) return [fn.body]; // стрелочная с выражением
    (function v(n) {
      if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
      if (ts.isFunctionLike(n)) return; // вложенные функции — не возврат этой
      ts.forEachChild(n, v);
    })(fn.body);
    return out;
  };
  if (ts.isFunctionDeclaration(decl)) return fnReturns(decl);
  if (ts.isVariableDeclaration(decl) && decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)))
    return fnReturns(decl.initializer);
  const out = [];
  if ((ts.isVariableDeclaration(decl) || ts.isParameter(decl)) && decl.initializer) out.push(decl.initializer);
  out.push(...rec.assigns);
  return out;
}

/** Функции файла, отдающие параметр в сообщение: имя → индексы параметров.
 *  `const secTitle = (text) => { … ctx.fillText(text, …) }` → secTitle: {0};
 *  `function validationJson(c, details, error = "…") { c.json({ error, … }) }` → {2}. */
function collectParamSinks(decls, sf) {
  const sinks = new Map();
  for (const [name, recs] of decls) {
    for (const rec of recs) {
      const fn = ts.isFunctionDeclaration(rec.node) ? rec.node
        : ts.isVariableDeclaration(rec.node) && rec.node.initializer && (ts.isArrowFunction(rec.node.initializer) || ts.isFunctionExpression(rec.node.initializer)) ? rec.node.initializer
        : null;
      if (!fn || !fn.body) continue;
      fn.parameters.forEach((param, idx) => {
        if (!ts.isIdentifier(param.name)) return;
        const pname = param.name.text;
        let hit = false;
        (function v(n) {
          if (hit) return;
          if (ts.isIdentifier(n) && n.text === pname && isValueIdentifier(n) && n !== param.name && isMessageContext(n, sf)) hit = true;
          ts.forEachChild(n, v);
        })(fn.body);
        if (hit) {
          if (!sinks.has(name)) sinks.set(name, new Set());
          sinks.get(name).add(idx);
        }
      });
    }
  }
  return sinks;
}

/** Идентификатор в позиции ЗНАЧЕНИЯ (не имя свойства, не объявление, не тип)
 *  и не объект вызова метода (`DIRECTIONS.join(…)` — запрос к данным, а не
 *  текст сообщения; `TABLE_LOCK_HINT[hit.table]` и голое имя — текст). */
function isValueIdentifier(id) {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p) && (p.name === id || p.expression === id)) return false;
  if (ts.isPropertyAssignment(p) && p.name === id) return false;
  if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p)) && p.name === id) return false;
  if (ts.isBindingElement(p)) return false;
  if (inTypeOrImport(id)) return false;
  for (let q = p; q; q = q.parent) if (ts.isTypeNode(q)) return false;
  return true;
}

/**
 * Литералы, которые попадают в сообщение не на месте, а через имя:
 * `throw new X(LAST_ADMIN_MESSAGE)`, `hint: TABLE_LOCK_HINT[t]`,
 * `const subject = \`…\`; return { subject }`, `tail` → `hoursPhrase(h)` →
 * возвраты функции. Для каждого идентификатора в контексте сообщения берётся
 * ближайшее объявление того же файла, из его значений собираются
 * кириллические литералы, вложенные имена разбираются так же (глубина ≤ 4,
 * без повторов). Возвращает Set узлов-литералов.
 */
function literalsByName(sf) {
  const decls = collectDeclarations(sf);
  const sinks = collectParamSinks(decls, sf);
  const found = new Set();
  const visited = new Set();
  const follow = (expr, depth) => {
    if (depth > 4) return;
    (function v(n) {
      if (isStrLike(n) && CYR.test(templateText(n)) && !inConsole(n, sf) && !inTypeOrImport(n)) found.add(n);
      if (ts.isIdentifier(n) && isValueIdentifier(n)) {
        const rec = resolveDeclRec(decls, n.text, n);
        if (rec && !visited.has(rec)) {
          visited.add(rec);
          for (const val of valueNodesOf(rec)) follow(val, depth + 1);
        }
      }
      ts.forEachChild(n, v);
    })(expr);
  };
  (function v(n) {
    if (ts.isIdentifier(n) && isValueIdentifier(n) && isMessageContext(n, sf, sinks)) {
      const rec = resolveDeclRec(decls, n.text, n);
      if (rec && !visited.has(rec)) {
        visited.add(rec);
        for (const val of valueNodesOf(rec)) follow(val, 1);
      }
    }
    ts.forEachChild(n, v);
  })(sf);
  return { found, sinks };
}

/**
 * Значение, а не надпись: контекстный тип литерала — строковый литерал или
 * объединение литералов (direction: "однонаправленная", useState<Status>("…")).
 * Такие строки хранятся в БД и сравниваются; перевод сломал бы данные.
 */
function isTypedValue(n, checker) {
  const t = checker.getContextualType(n);
  if (!t) return false;
  const parts = t.isUnion() ? t.types : [t];
  const lits = parts.filter((p) => p.isStringLiteral());
  const rest = parts.filter((p) => !p.isStringLiteral() &&
    !(p.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)));
  return lits.length > 0 && rest.length === 0;
}

const TSCONFIGS = ["client/tsconfig.json", "server/tsconfig.json", "packages/shared/tsconfig.json", "scripts/tsconfig.json"];

/**
 * Программы TypeScript по tsconfig проекта — ради проверки типов литералов.
 * Требует установленных зависимостей (npm install); без них — null, и опись
 * строится без этой проверки (с предупреждением в консоли).
 */
export function createTyped(root) {
  if (!fs.existsSync(path.join(root, "node_modules", "typescript"))) return null;
  const map = new Map();
  for (const rel of TSCONFIGS) {
    const cfgPath = path.join(root, rel);
    if (!fs.existsSync(cfgPath)) continue;
    const cfg = ts.getParsedCommandLineOfConfigFile(cfgPath, {}, {
      ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {},
    });
    if (!cfg) continue;
    const program = ts.createProgram({ rootNames: cfg.fileNames, options: { ...cfg.options, noEmit: true } });
    const checker = program.getTypeChecker();
    for (const sf of program.getSourceFiles()) {
      const abs = path.resolve(sf.fileName);
      if (!map.has(abs) && abs.startsWith(root) && !abs.includes("node_modules")) map.set(abs, { sf, checker });
    }
  }
  return map;
}

/** Можно ли значение выражения подставить в строку: примитив, null/undefined.
 *  Объекты (в том числе JSX-элементы в переменной) — нельзя. */
function printable(expr, checker) {
  if (!checker) return true;
  const t = checker.getTypeAtLocation(expr);
  const parts = t.isUnion() ? t.types : [t];
  const OK = ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike |
    ts.TypeFlags.BigIntLike | ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void |
    ts.TypeFlags.EnumLike | ts.TypeFlags.Any | ts.TypeFlags.Unknown;
  // брендированные примитивы (string & {…}) и литеральные шаблоны тоже печатаемы
  const ok = (p) => (p.flags & OK) !== 0 || (p.flags & ts.TypeFlags.TemplateLiteral) !== 0 ||
    (p.isIntersection() && p.types.some(ok));
  return parts.every(ok);
}

/* JSX-текст так, как его покажет React (правило Babel cleanJSXElementLiteralChild). */
function cleanJsxText(raw) {
  const lines = raw.split(/\r\n|\n|\r/);
  let lastNonEmpty = 0;
  lines.forEach((l, i) => { if (/[^ \t]/.test(l)) lastNonEmpty = i; });
  let out = "";
  lines.forEach((line, i) => {
    const first = i === 0, last = i === lines.length - 1;
    let t = line.replace(/\t/g, " ");
    if (!first) t = t.replace(/^[ ]+/, "");
    if (!last) t = t.replace(/[ ]+$/, "");
    if (t) {
      if (i !== lastNonEmpty) t += " ";
      out += t;
    }
  });
  return out;
}

const templateText = (n) =>
  ts.isTemplateExpression(n)
    ? n.head.text + n.templateSpans.map((s, i) => `{${i}}` + s.literal.text).join("")
    : n.text;

/* ───────────── Извлечение из одного файла ───────────── */

/**
 * Возвращает { entries, matchers }.
 * entry: { kind, text, line, start, end, args?, quote?, jsxAttr? }
 *   start/end — диапазон исходника, который заменяется при сборке;
 *   args      — исходный текст выражений для {0}, {1}…
 */
export function extractFile(abs, mode, typed = null) {
  const hit = typed?.get(abs);
  const sf = hit?.sf ?? parse(abs);
  const checker = hit?.checker ?? null;
  const src = sf.text;
  const entries = [];
  const matchers = [];
  const covered = new Set(); // узлы, уже вошедшие в jsx-запись
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  // 14.1 (Д-58): литералы, отданные в сообщение по имени (константа, переменная, функция)
  const { found: byName, sinks } = mode === "msg" ? literalsByName(sf) : { found: new Set(), sinks: null };

  function jsxRuns(el) {
    const kids = [...el.children];
    let run = [];
    const flush = () => {
      // обрезать края-пробелы
      while (run.length && ts.isJsxText(run[0]) && !/\S/.test(run[0].text)) run.shift();
      while (run.length && ts.isJsxText(run.at(-1)) && !/\S/.test(run.at(-1).text)) run.pop();
      if (run.length) emitRun(run);
      run = [];
    };
    for (const k of kids) {
      const inlineable =
        ts.isJsxText(k) ||
        (ts.isJsxExpression(k) && k.expression && !hasJsx(k.expression) &&
          !(hasCyrLiteral(k.expression) && !isPlainLiteral(k.expression)));
      if (inlineable) run.push(k);
      else flush();
    }
    flush();
  }

  function isPlainLiteral(e) {
    return ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e);
  }

  function emitRun(run) {
    let text = "";
    const args = [];
    const argSpans = [];
    let unprintable = false;
    let hasLetters = false;
    for (const k of run) {
      if (ts.isJsxText(k)) {
        const t = cleanJsxText(k.text);
        if (LETTER.test(t)) hasLetters = true;
        text += t;
      } else if (isPlainLiteral(k.expression)) {
        if (LETTER.test(k.expression.text)) hasLetters = true;
        text += k.expression.text;
      } else {
        text += `{${args.length}}`;
        args.push(k.expression.getText(sf));
        argSpans.push([k.expression.getStart(sf), k.expression.end]);
        if (!printable(k.expression, checker)) unprintable = true;
      }
    }
    if (!hasLetters) return;
    // Диапазон: от первого непробельного символа до последнего.
    // У JsxText getStart() пропускает пробелы как «trivia», поэтому края
    // считаются от pos/end самого узла, где text включает все пробелы.
    let start = ts.isJsxText(run[0]) ? run[0].pos : run[0].getStart(sf);
    let end = run.at(-1).end;
    if (ts.isJsxText(run[0])) start += run[0].text.length - run[0].text.trimStart().length;
    if (ts.isJsxText(run.at(-1))) end -= run.at(-1).text.length - run.at(-1).text.trimEnd().length;
    text = text.replace(/\s+/g, " ").trim();
    for (const k of run) covered.add(k);
    entries.push({ kind: "jsx", text, line: lineOf(start), start, end, ...(args.length ? { args, argSpans } : {}),
      ...(unprintable ? { unprintable: true } : {}) });
  }

  function visit(n) {
    if ((ts.isJsxElement(n) || ts.isJsxFragment(n)) && mode === "ui") jsxRuns(n);

    if (isStrLike(n) && !inTypeOrImport(n) && !inConsole(n, sf)) {
      // ключ и русский текст уже переведённого вызова tl("key", "ru", …)
      if (ts.isCallExpression(n.parent) && ts.isIdentifier(n.parent.expression) &&
          n.parent.expression.text === "tl" && n.parent.arguments.indexOf(n) in { 0: 1, 1: 1 }) return;
      const text = templateText(n);
      if (isMatcher(n, sf)) {
        if (CYR.test(text)) matchers.push(text);
        return;
      }
      if (checker && isTypedValue(n, checker)) {
        if (CYR.test(text)) matchers.push(text);
        return;
      }
      const inCoveredRun = (() => {
        for (let p = n.parent; p; p = p.parent) if (covered.has(p)) return true;
        return false;
      })();
      if (inCoveredRun) return;

      const attr = jsxAttrName(n, sf);
      let take = false, kind = ts.isTemplateExpression(n) ? "tpl" : "str";
      if (mode === "ui") {
        if (attr) {
          take = !HIDDEN_ATTRS.has(attr) &&
                 ((VISIBLE_ATTRS.has(attr) && LETTER.test(text)) || CYR.test(text));
          if (take) kind = ts.isTemplateExpression(n) ? "tpl" : "attr";
        } else take = CYR.test(text);
      } else {
        take = CYR.test(text) && (isMessageContext(n, sf, sinks) || byName.has(n));
      }
      if (take) {
        const start = n.getStart(sf);
        const e = { kind, text, line: lineOf(start), start, end: n.getEnd() };
        if (!inFunction(n)) e.static = true;
        if (mode === "msg" && byName.has(n) && !isMessageContext(n, sf, sinks)) e.byName = true;
        if (ts.isTemplateExpression(n)) {
          e.args = n.templateSpans.map((s) => s.expression.getText(sf));
          e.argSpans = n.templateSpans.map((s) => [s.expression.getStart(sf), s.expression.end]);
          if (n.templateSpans.some((s) => !printable(s.expression, checker))) e.unprintable = true;
        }
        else e.quote = src[start];
        e.jsxAttr = ts.isJsxAttribute(n.parent); // значение атрибута без { }
        entries.push(e);
      }
      if (!ts.isTemplateExpression(n)) return;
    }
    if (ts.isRegularExpressionLiteral(n)) return;
    ts.forEachChild(n, visit);
  }
  visit(sf);
  entries.sort((a, b) => a.start - b.start);
  return { entries, matchers };
}

/* ───────────── Идентификаторы и полная опись ───────────── */

export function makeIds(rel, entries) {
  const count = new Map();
  for (const e of entries) {
    const k = `${e.kind}\u0000${e.text}`;
    const i = count.get(k) ?? 0;
    count.set(k, i + 1);
    e.id = crypto.createHash("sha1").update(`${rel}\u0000${k}\u0000${i}`).digest("hex").slice(0, 10);
  }
}

function collectPromptText(root) {
  const parts = [];
  for (const abs of walk(path.join(root, PROMPT_DIR))) {
    if (abs.endsWith("export-assets.ts")) continue; // оболочка экспорта, не промпты
    const sf = parse(abs);
    (function v(n) {
      if (isStrLike(n)) parts.push(templateText(n));
      ts.forEachChild(n, v);
    })(sf);
  }
  return parts.join("\n\u0000\n");
}

/** Полная опись проекта: [{rel, group, entries}] + сводка сопоставителей. */
export function extractProject(root, { withWarnings = true, typed = createTyped(root) } = {}) {
  if (!typed) console.warn("⚠ node_modules не найдены — проверка типов литералов пропущена; запустите npm install");
  const files = [];
  const matcherIndex = new Map(); // текст → файл
  for (const f of listScopeFiles(root)) {
    const { entries, matchers } = extractFile(path.join(root, f.rel), f.mode, typed);
    makeIds(f.rel, entries);
    for (const m of matchers) if (!matcherIndex.has(m)) matcherIndex.set(m, f.rel);
    files.push({ ...f, entries });
  }
  if (withWarnings) {
    const prompts = collectPromptText(root);
    for (const f of files) {
      for (const e of f.entries) {
        const w = [];
        if (f.group === "shared") w.push("общий модуль клиента и сервера: строка может уходить в промпты и разбор документа");
        const bare = e.text.replace(/\{\d+\}/g, "").trim();
        if (bare.length >= 4 && matcherIndex.has(bare)) w.push(`совпадает со строкой-сопоставителем (${matcherIndex.get(bare)})`);
        if (bare.length >= 20 && prompts.includes(bare)) w.push("встречается в промптах server/config");
        if (w.length) e.warn = w.join("; ");
      }
    }
  }
  return { files, matcherCount: [...matcherIndex.keys()].length, typed: !!typed };
}

/* ───────────── Обратная запись ───────────── */

function escapeJs(s, quote) {
  let out = "";
  for (const ch of s) {
    if (ch === "\\") out += "\\\\";
    else if (ch === quote) out += "\\" + quote;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\u2028") out += "\\u2028";
    else if (ch === "\u2029") out += "\\u2029";
    else if (quote === "`" && ch === "$") out += "\\$";
    else out += ch;
  }
  return out;
}

/** Разбить перевод на куски текста и номера подстановок; проверить набор. */
export function splitPlaceholders(tr, argCount) {
  const parts = [];
  const used = new Map();
  let last = 0;
  for (const m of tr.matchAll(/\{(\d+)\}/g)) {
    const i = Number(m[1]);
    if (i >= argCount) return { error: `лишняя подстановка {${i}}` };
    parts.push(tr.slice(last, m.index), i);
    used.set(i, (used.get(i) ?? 0) + 1);
    last = m.index + m[0].length;
  }
  parts.push(tr.slice(last));
  for (let i = 0; i < argCount; i++) {
    if (!used.has(i)) return { error: `в переводе нет подстановки {${i}}` };
  }
  return { parts };
}

/** Исходный код для замены диапазона записи переводом. */
export function renderReplacement(e, tr, argCode = e.args) {
  const argc = e.args?.length ?? 0;
  const sp = splitPlaceholders(tr, argc);
  if (sp.error) return sp;
  const { parts } = sp;

  if (e.kind === "jsx") {
    const seg = (s) => {
      if (!s) return "";
      // спецсимволы JSX и пробелы на краях — надёжнее строковым выражением
      if (/[{}<>]/.test(s) || /^\s|\s$/.test(s) || /\n/.test(s)) return `{${JSON.stringify(s)}}`;
      return s;
    };
    return { code: parts.map((p) => (typeof p === "number" ? `{${argCode[p]}}` : seg(p))).join("") };
  }
  if (e.kind === "tpl") {
    return { code: "`" + parts.map((p) => (typeof p === "number" ? "${" + argCode[p] + "}" : escapeJs(p, "`"))).join("") + "`" };
  }
  // str / attr
  if (e.jsxAttr) {
    // значение JSX-атрибута не знает экранирования
    if (tr.includes(e.quote) || /[\n\r]/.test(tr)) return { code: `{${JSON.stringify(tr)}}` };
    return { code: e.quote + tr + e.quote };
  }
  return { code: e.quote + escapeJs(tr, e.quote) + e.quote };
}

/** Синтаксические ошибки файла (без проверки типов). */
export function parseErrors(abs) {
  const sf = parse(abs);
  return (sf.parseDiagnostics ?? []).map((d) => {
    const { line } = sf.getLineAndCharacterOfPosition(d.start ?? 0);
    return `${line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`;
  });
}

/* ───────────── Пространства имён ключей ───────────── */

const camel = (s) => s.replace(/\.(tsx?|mts|mjs)$/, "")
  .replace(/[-_](\w)/g, (_, c) => c.toUpperCase())
  .replace(/^[A-Z]/, (c) => c.toLowerCase());

/** Пространство имён ключа по пути файла: pages/LoginPage.tsx → loginPage,
 *  components/edit/EdgeEditor.tsx → edit.edgeEditor, server/routes/auth.ts →
 *  server.routes.auth, packages/shared/constants/labels.ts → shared.labels. */
export function namespaceOf(rel) {
  let m;
  if ((m = rel.match(/^client\/src\/pages\/(.+)$/))) return camel(m[1]);
  if ((m = rel.match(/^client\/src\/components\/([^/]+)\/(.+)$/))) return `${camel(m[1])}.${camel(m[2].replace(/\//g, "."))}`;
  if ((m = rel.match(/^client\/src\/([^/]+)\/(.+)$/))) return `${camel(m[1])}.${camel(m[2])}`;
  if ((m = rel.match(/^client\/src\/(.+)$/))) return camel(m[1]);
  if ((m = rel.match(/^packages\/shared\/(?:constants|utils|types|i18n)\/(.+)$/))) return `shared.${camel(m[1])}`;
  if (rel === "server/config/compat-matrix.ts") return "data.compatMatrix";
  if (rel === "scripts/seed/seed-taxonomy.ts") return "data.taxonomy";
  if ((m = rel.match(/^server\/services\/(.+)$/))) return `server.${m[1].split("/").map(camel).join(".")}`;
  if ((m = rel.match(/^server\/([^/]+)\/(.+)$/))) return `server.${camel(m[1])}.${m[2].split("/").map(camel).join(".")}`;
  return camel(rel.replace(/\//g, "."));
}

/** Файлы-данные: их строки получают ключи и переводы в таблице, но код
 *  не переписывается. Сиды БД переводятся через данные; общие константы
 *  packages/shared читают и сервер (промпты, разбор документа), и клиент —
 *  подключать их к переводу нужно вручную, по месту показа. */
export function isDataFile(rel) {
  return rel.startsWith("packages/shared/") ||
    rel === "server/config/compat-matrix.ts" || rel === "scripts/seed/seed-taxonomy.ts";
}
