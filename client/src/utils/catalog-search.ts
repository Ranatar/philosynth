/**
 * Состояние поиска каталога ↔ адресная строка ↔ запрос (беседа 18.2).
 *
 * Сервер поиска — один маршрут `GET /syntheses/search` (18.1, 03 §2.21).
 * Состояние поиска каталога живёт В АДРЕСНОЙ СТРОКЕ: ссылкой можно
 * поделиться, а «назад» возвращает прежний поиск. Чтобы адрес и запрос не
 * могли разойтись, их пишет ОДИН сериализатор (`searchParamsOf`): имена
 * параметров адреса — это имена параметров маршрута (сторож 4bs сверяет
 * список `CATALOG_URL_PARAMS` с разбором `server/routes/search.ts`).
 *
 * Чего в адресе нет: `limit` (страница каталога постоянна — умолчание
 * сервера) и прежнего синонима `search` (клиент шлёт `q` + `field`).
 *
 * Чтение адреса прощающее: негодное значение отбрасывается (ссылку могли
 * поправить руками), а не уходит на сервер за 400. Статус и дата действуют
 * только в списке «Мои» (решение запроса 18.2, п.2): в прочих списках они
 * из адреса не читаются и в запрос не попадают.
 *
 * Модуль чистый: ни React, ни DOM, ни tl() — фразы собирают компоненты.
 */
import { DL, ML, SL } from "@philosynth/shared/constants/labels";
import { PHILOSOPHER_EPOCHS } from "@philosynth/shared/constants/philosophers";
import {
  SEARCH_DEFAULT_FIELD,
  SEARCH_PAGE_DEFAULT,
  SEARCH_PHILOSOPHERS_MAX,
  SEARCH_PHIL_AREAS,
  SEARCH_PHIL_MODES,
  SEARCH_QUERY_MAX,
  SEARCH_SORTS,
  isSearchField,
  isSearchScope,
  type SearchField,
  type SearchPhilArea,
  type SearchPhilMode,
  type SearchScope,
  type SearchSort,
} from "@philosynth/shared/constants/search";

/** Параметры адресной строки каталога — те же имена, что у маршрута 18.1. */
export const CATALOG_URL_PARAMS = [
  "scope",
  "q",
  "field",
  "philosopher",
  "philMode",
  "philArea",
  "epoch",
  "method",
  "synthLevel",
  "depth",
  "lang",
  "status",
  "meta",
  "descendantsOf",
  "dateFrom",
  "dateTo",
  "sort",
  "order",
  "page",
] as const;
export type CatalogUrlParam = (typeof CATALOG_URL_PARAMS)[number];

/** Параметры маршрута, которых в адресе нет намеренно (см. шапку). */
export const CATALOG_API_ONLY_PARAMS = ["limit"] as const;

/** Статусы концепции — зеркало enum схемы (02 §2.3), как в routes/search. */
export const CATALOG_STATUSES = ["draft", "generating", "paused", "ready", "error"] as const;

export const CATALOG_PAGE_LIMIT = SEARCH_PAGE_DEFAULT;

export interface CatalogSearchState {
  scope: SearchScope;
  q: string;
  field: SearchField;
  philosophers: string[];
  philMode: SearchPhilMode;
  philArea: SearchPhilArea;
  epochs: number[];
  method: string | null;
  synthLevel: string | null;
  /** Глубина проработки (Д-89) */
  depth: string | null;
  lang: string | null;
  meta: boolean | null;
  descendantsOf: string | null;
  /** Только в списке «Мои» */
  status: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  /** null — умолчание сервера (с текстом — по весу совпадения, без — по дате) */
  sort: SearchSort | null;
  order: "asc" | "desc";
  page: number;
}

/** Каким каталог открыт: «/catalog» вошедшего либо «/explore» (только публичное). */
export interface CatalogSearchContext {
  defaultScope: SearchScope;
  /** «/explore»: список один, параметр `scope` адреса не читается */
  lockScope: boolean;
}

export function emptySearchState(scope: SearchScope): CatalogSearchState {
  return {
    scope,
    q: "",
    field: SEARCH_DEFAULT_FIELD,
    philosophers: [],
    philMode: "all",
    philArea: "direct",
    epochs: [],
    method: null,
    synthLevel: null,
    depth: null,
    lang: null,
    meta: null,
    descendantsOf: null,
    status: null,
    dateFrom: null,
    dateTo: null,
    sort: null,
    order: "desc",
    page: 1,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD настоящего дня (2026-02-31 — нет). */
export function isDay(raw: string): boolean {
  if (!DATE_RE.test(raw)) return false;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw;
}

const oneOf = <T extends string>(list: readonly T[], v: string | null): T | null =>
  v !== null && (list as readonly string[]).includes(v) ? (v as T) : null;

/** Прочитать состояние поиска из адресной строки (прощающе — см. шапку). */
export function parseCatalogSearch(params: URLSearchParams, ctx: CatalogSearchContext): CatalogSearchState {
  const st = emptySearchState(ctx.defaultScope);
  const scope = params.get("scope");
  if (!ctx.lockScope && isSearchScope(scope)) st.scope = scope;

  st.q = (params.get("q") ?? "").trim().slice(0, SEARCH_QUERY_MAX);
  const field = params.get("field");
  if (isSearchField(field)) st.field = field;

  const phil: string[] = [];
  for (const raw of params.getAll("philosopher")) {
    const name = raw.trim();
    if (name && !phil.includes(name) && phil.length < SEARCH_PHILOSOPHERS_MAX) phil.push(name);
  }
  st.philosophers = phil;
  st.philMode = oneOf(SEARCH_PHIL_MODES, params.get("philMode")) ?? "all";
  st.philArea = oneOf(SEARCH_PHIL_AREAS, params.get("philArea")) ?? "direct";
  const epochs: number[] = [];
  for (const raw of params.getAll("epoch")) {
    if (!/^\d+$/.test(raw)) continue;
    const n = Number.parseInt(raw, 10);
    if (n < PHILOSOPHER_EPOCHS.length && !epochs.includes(n)) epochs.push(n);
  }
  st.epochs = epochs.sort((a, b) => a - b);

  st.method = oneOf(Object.keys(ML), params.get("method"));
  st.synthLevel = oneOf(Object.keys(SL), params.get("synthLevel"));
  st.depth = oneOf(Object.keys(DL), params.get("depth"));
  const lang = (params.get("lang") ?? "").trim();
  st.lang = lang || null;
  const meta = params.get("meta");
  st.meta = meta === "true" ? true : meta === "false" ? false : null;
  const desc = params.get("descendantsOf");
  st.descendantsOf = desc && UUID_RE.test(desc) ? desc : null;

  if (st.scope === "mine") {
    st.status = oneOf(CATALOG_STATUSES, params.get("status"));
    const from = params.get("dateFrom");
    const to = params.get("dateTo");
    st.dateFrom = from && isDay(from) ? from : null;
    st.dateTo = to && isDay(to) ? to : null;
  }

  st.sort = oneOf(SEARCH_SORTS, params.get("sort"));
  st.order = params.get("order") === "asc" ? "asc" : "desc";
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  st.page = Number.isFinite(page) && page >= 1 ? page : 1;
  return st;
}

export interface SearchParamsOptions {
  /** Список по умолчанию: совпавший `scope` в адрес не пишется */
  omitScope?: SearchScope | null;
  /** Запрос к серверу: поле текста шлётся только вместе с текстом, плюс limit */
  forApi?: boolean;
}

/**
 * ЕДИНСТВЕННЫЙ сериализатор состояния: и адресная строка, и запрос к
 * маршруту поиска. Умолчания не пишутся; порядок параметров постоянен
 * (одинаковое состояние — одинаковая ссылка).
 */
export function searchParamsOf(st: CatalogSearchState, opts: SearchParamsOptions = {}): URLSearchParams {
  const p = new URLSearchParams();
  const mine = st.scope === "mine";
  if (opts.forApi || st.scope !== (opts.omitScope ?? null)) p.set("scope", st.scope);
  const q = st.q.trim();
  if (q) p.set("q", q);
  if (st.field !== SEARCH_DEFAULT_FIELD && (q || !opts.forApi)) p.set("field", st.field);
  for (const name of st.philosophers) p.append("philosopher", name);
  if (st.philosophers.length > 0 && st.philMode !== "all") p.set("philMode", st.philMode);
  if ((st.philosophers.length > 0 || st.epochs.length > 0) && st.philArea !== "direct") p.set("philArea", st.philArea);
  for (const n of st.epochs) p.append("epoch", String(n));
  if (st.method) p.set("method", st.method);
  if (st.synthLevel) p.set("synthLevel", st.synthLevel);
  if (st.depth) p.set("depth", st.depth);
  if (st.lang) p.set("lang", st.lang);
  if (mine && st.status) p.set("status", st.status);
  if (st.meta !== null) p.set("meta", st.meta ? "true" : "false");
  if (st.descendantsOf) p.set("descendantsOf", st.descendantsOf);
  if (mine && st.dateFrom) p.set("dateFrom", st.dateFrom);
  if (mine && st.dateTo) p.set("dateTo", st.dateTo);
  if (st.sort) p.set("sort", st.sort);
  if (st.order !== "desc") p.set("order", st.order);
  if (st.page > 1) p.set("page", String(st.page));
  if (opts.forApi) p.set("limit", String(CATALOG_PAGE_LIMIT));
  return p;
}

/** Адресная строка каталога для состояния (без «?»; пустая — умолчания). */
export function catalogSearchString(st: CatalogSearchState, ctx: CatalogSearchContext): string {
  return searchParamsOf(st, { omitScope: ctx.defaultScope }).toString();
}

/** Строка запроса к `GET /syntheses/search`. */
export function searchQueryString(st: CatalogSearchState): string {
  return searchParamsOf(st, { forApi: true }).toString();
}

/** Сколько фильтров панели задано (текст поиска фильтром не считается). */
export function activeFilterCount(st: CatalogSearchState): number {
  const mine = st.scope === "mine";
  return (
    (st.philosophers.length > 0 ? 1 : 0) +
    (st.epochs.length > 0 ? 1 : 0) +
    (st.method ? 1 : 0) +
    (st.synthLevel ? 1 : 0) +
    (st.depth ? 1 : 0) +
    (st.lang ? 1 : 0) +
    (st.meta !== null ? 1 : 0) +
    (st.descendantsOf ? 1 : 0) +
    (mine && st.status ? 1 : 0) +
    (mine && (st.dateFrom || st.dateTo) ? 1 : 0)
  );
}

/** Задано ли хоть что-то, кроме списка: текст либо фильтр. */
export function hasSearchCriteria(st: CatalogSearchState): boolean {
  return st.q.trim() !== "" || activeFilterCount(st) > 0;
}

/** Сброс фильтров панели: список, текст и поле остаются, страница — первая. */
export function resetFilters(st: CatalogSearchState): CatalogSearchState {
  return { ...emptySearchState(st.scope), q: st.q, field: st.field };
}

/** Смена списка: статус и дата живут только в «Моих»; страница — первая. */
export function withScope(st: CatalogSearchState, scope: SearchScope): CatalogSearchState {
  const mine = scope === "mine";
  return {
    ...st,
    scope,
    status: mine ? st.status : null,
    dateFrom: mine ? st.dateFrom : null,
    dateTo: mine ? st.dateTo : null,
    page: 1,
  };
}

/**
 * Чем ослабить поиск, когда ничего не найдено, — кодами, по состоянию:
 *  - `philAny`     названо несколько философов в режиме «все»;
 *  - `philLineage` философы или эпохи ищутся только среди прямых участников;
 *  - `fieldContent` текст ищется в названии или зерне — есть ещё содержание;
 *  - `termExact`   поле «термин» ищет термин целиком, без словоформ;
 *  - `dates`       задан промежуток дат;
 *  - `fewerFilters` фильтров два и больше;
 *  - `otherScope`  другой список каталога (вошедшему).
 */
export type RelaxHint =
  | "philAny"
  | "philLineage"
  | "fieldContent"
  | "termExact"
  | "dates"
  | "fewerFilters"
  | "otherScope";

export function relaxHints(st: CatalogSearchState, ctx: CatalogSearchContext): RelaxHint[] {
  const out: RelaxHint[] = [];
  const q = st.q.trim();
  if (st.philosophers.length > 1 && st.philMode === "all") out.push("philAny");
  if ((st.philosophers.length > 0 || st.epochs.length > 0) && st.philArea === "direct") out.push("philLineage");
  if (q && (st.field === "title" || st.field === "seed")) out.push("fieldContent");
  if (q && st.field === "term") out.push("termExact");
  if (st.scope === "mine" && (st.dateFrom || st.dateTo)) out.push("dates");
  if (activeFilterCount(st) >= 2) out.push("fewerFilters");
  if (!ctx.lockScope) out.push("otherScope");
  return out;
}

/** Адрес документа с переходом к термину глоссария (для карточки выдачи):
 *  id термина — первым, ключ имени — запасным (id меняется при
 *  перегенерации глоссария, а гостю id разрешить нечем). */
export function termLinkOf(synthesisId: string, term: { id: string; key: string }): string {
  const p = new URLSearchParams();
  p.set("term", term.id);
  if (term.key) p.set("termKey", term.key);
  return `/synthesis/${encodeURIComponent(synthesisId)}?${p.toString()}`;
}
