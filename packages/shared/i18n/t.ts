/**
 * Перевод строк интерфейса — общий для клиента и сервера.
 *
 *   tl("auth.login.submit", "Войти")
 *   tl("catalog.synthesisCard.author", "Автор: {authorName}", { authorName })
 *   tl("edit.recommendationsPanel.pending",
 *      "{n, plural, one {# рекомендация} few {# рекомендации} many {# рекомендаций} other {# рекомендации}}",
 *      { n })
 *
 * Второй аргумент — русский текст: он же запасной вариант, он же источник
 * колонки ru мастер-таблицы (packages/shared/i18n/strings.json), откуда его
 * забирает `npm run i18n:export`. Подстановки — {имя}; значения — только
 * строки, числа, null/undefined/boolean (ReactNode сюда не передаётся —
 * это ловит проверка типов).
 *
 * Плюралы (беседа 11.2, п.2) — ICU-подмножество:
 *   {n, plural, one {…} few {…} many {…} other {…}}
 * Внутри формы «#» — само число. Форма выбирается Intl.PluralRules ЯЗЫКА
 * КАТАЛОГА: ru — one/few/many/other, en и de — one/other; допускаются и
 * точные формы «=0», «=1». Форма other обязательна — она же запасная.
 * Словоформы для ПРОМПТОВ (shared/utils/cardinality.ts) сюда не относятся:
 * там русский текст задания модели при любом языке интерфейса.
 *
 * Каталог текущего языка отдаёт провайдер: клиент ставит его из своего
 * хранилища языка (11.3), сервер — из языка запроса (server/i18n/locale.ts).
 * Каталог несёт свой язык — от него зависят правила плюралов. Пока
 * провайдер не поставлен, возвращается русский текст с русскими правилами —
 * поведение проекта не меняется.
 */

/** null, undefined и логические значения подставляются пустой строкой —
 *  как их (не) рисует React в JSX. */
export type TlParams = Readonly<Record<string, string | number | boolean | null | undefined>>;
export type Catalog = Readonly<Record<string, string>>;

/** Каталог одного языка: строки и язык (для Intl.PluralRules). */
export interface CatalogSource {
  locale: string;
  strings: Catalog;
}

/** Язык исходника и колонки ru — умолчание, когда каталога нет. */
export const FALLBACK_LOCALE = "ru";

let catalogProvider: (() => CatalogSource | null | undefined) | null = null;

/** Поставить источник каталога текущего языка (null — только русский). */
export function setCatalogProvider(
  provider: (() => CatalogSource | null | undefined) | null,
): void {
  catalogProvider = provider;
}

/* ───────────── Разбор сообщения ───────────── */

export type MessagePart =
  | { kind: "text"; text: string }
  | { kind: "arg"; name: string }
  | { kind: "plural"; name: string; forms: Readonly<Record<string, readonly MessagePart[]>> };

const IDENT = /^[A-Za-z_$][\w$]*$/;

/**
 * Разобрать текст на куски: текст, {имя}, {имя, plural, форма {…} …}.
 * Всё, что не разобралось (непарные скобки, не-идентификатор), остаётся
 * текстом — как прежний formatMessage оставлял неизвестные подстановки.
 */
export function parseMessage(text: string): MessagePart[] {
  const out: MessagePart[] = [];
  let buf = "";
  let i = 0;
  const flush = (): void => {
    if (buf) out.push({ kind: "text", text: buf });
    buf = "";
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (ch !== "{") {
      buf += ch;
      i++;
      continue;
    }
    const close = matchingBrace(text, i);
    if (close < 0) {
      buf += ch;
      i++;
      continue;
    }
    const body = text.slice(i + 1, close);
    const part = parseArgument(body);
    if (!part) {
      buf += ch;
      i++;
      continue;
    }
    flush();
    out.push(part);
    i = close + 1;
  }
  flush();
  return out;
}

/** Индекс парной «}» для «{» в позиции open, либо −1. */
function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let j = open; j < text.length; j++) {
    const c = text[j];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

function parseArgument(body: string): MessagePart | null {
  const comma = body.indexOf(",");
  if (comma < 0) {
    const name = body.trim();
    return IDENT.test(name) ? { kind: "arg", name } : null;
  }
  const name = body.slice(0, comma).trim();
  if (!IDENT.test(name)) return null;
  const rest = body.slice(comma + 1);
  const comma2 = rest.indexOf(",");
  if (comma2 < 0) return null;
  const type = rest.slice(0, comma2).trim();
  if (type !== "plural") return null;
  const forms = parseForms(rest.slice(comma2 + 1));
  if (!forms || !("other" in forms)) return null;
  return { kind: "plural", name, forms };
}

/** «one {…} few {…} =0 {…}» → { one: parts, few: parts, "=0": parts } */
function parseForms(src: string): Record<string, MessagePart[]> | null {
  const forms: Record<string, MessagePart[]> = {};
  let i = 0;
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i]!)) i++;
    if (i >= src.length) break;
    let key = "";
    while (i < src.length && !/[\s{]/.test(src[i]!)) key += src[i++]!;
    while (i < src.length && /\s/.test(src[i]!)) i++;
    if (!key || src[i] !== "{") return null;
    if (!/^(zero|one|two|few|many|other|=\d+)$/.test(key)) return null;
    const close = matchingBrace(src, i);
    if (close < 0) return null;
    forms[key] = parseMessage(src.slice(i + 1, close));
    i = close + 1;
  }
  return Object.keys(forms).length ? forms : null;
}

/** Все форм-ключи плюралов сообщения: [{ name, forms }] (проверка i18n:import). */
export function pluralFormsOf(text: string): { name: string; forms: string[] }[] {
  const res: { name: string; forms: string[] }[] = [];
  const walk = (parts: readonly MessagePart[]): void => {
    for (const p of parts) {
      if (p.kind !== "plural") continue;
      res.push({ name: p.name, forms: Object.keys(p.forms) });
      for (const f of Object.values(p.forms)) walk(f);
    }
  };
  walk(parseMessage(text));
  return res;
}

/** Имена подстановок сообщения (включая аргументы плюралов), отсортированы, без повторов. */
export function placeholderNames(text: string): string[] {
  const names = new Set<string>();
  const walk = (parts: readonly MessagePart[]): void => {
    for (const p of parts) {
      if (p.kind === "arg") names.add(p.name);
      else if (p.kind === "plural") {
        names.add(p.name);
        for (const f of Object.values(p.forms)) walk(f);
      }
    }
  };
  walk(parseMessage(text));
  return [...names].sort();
}

/** Категории плюрала языка по Intl.PluralRules (ru: few, many, one, other). */
export function pluralCategoriesOf(locale: string): string[] {
  try {
    return [...new Intl.PluralRules(locale).resolvedOptions().pluralCategories].sort();
  } catch {
    return ["other"];
  }
}

/* ───────────── Подстановка ───────────── */

function printValue(v: string | number | boolean | null | undefined): string {
  return v == null || typeof v === "boolean" ? "" : String(v);
}

function selectForm(
  forms: Readonly<Record<string, readonly MessagePart[]>>,
  value: unknown,
  locale: string,
): readonly MessagePart[] {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(n)) {
    const exact = forms[`=${n}`];
    if (exact) return exact;
    let cat = "other";
    try {
      cat = new Intl.PluralRules(locale).select(n);
    } catch {
      /* неизвестный язык — other */
    }
    const byCat = forms[cat];
    if (byCat) return byCat;
  }
  return forms["other"] ?? [];
}

function renderParts(
  parts: readonly MessagePart[],
  params: TlParams | undefined,
  locale: string,
  hash: string | null,
): string {
  let out = "";
  for (const p of parts) {
    if (p.kind === "text") {
      out += hash === null ? p.text : p.text.replace(/#/g, hash);
    } else if (p.kind === "arg") {
      out += params && Object.prototype.hasOwnProperty.call(params, p.name)
        ? printValue(params[p.name])
        : `{${p.name}}`;
    } else {
      const has = params && Object.prototype.hasOwnProperty.call(params, p.name);
      const value = has ? params[p.name] : undefined;
      const form = selectForm(p.forms, value, locale);
      out += renderParts(form, params, locale, has ? printValue(value) : "");
    }
  }
  return out;
}

/** Подставить {имя} из params и раскрыть плюралы по правилам locale;
 *  неизвестные подстановки остаются как есть. */
export function formatMessage(text: string, params?: TlParams, locale: string = FALLBACK_LOCALE): string {
  if (!params && !text.includes("{")) return text;
  return renderParts(parseMessage(text), params, locale, null);
}

/** Текущий язык каталога (ru, пока провайдер не поставлен). */
export function currentCatalogLocale(): string {
  return catalogProvider?.()?.locale ?? FALLBACK_LOCALE;
}

export function tl(key: string, ru: string, params?: TlParams): string {
  const source = catalogProvider?.();
  const translated = source?.strings[key];
  return translated !== undefined
    ? formatMessage(translated, params, source?.locale ?? FALLBACK_LOCALE)
    : formatMessage(ru, params, FALLBACK_LOCALE);
}
