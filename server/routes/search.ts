/**
 * Поиск концепций — маршрут (беседа 18.1; 03 §2.21):
 *
 *   GET /api/v1/syntheses/search
 *
 * Один маршрут на три списка каталога. Параметры (все необязательны):
 *   scope         mine | shared | public   (вошедшему по умолчанию mine,
 *                 гостю — public; гость с иным scope → 401)
 *   q, field      текст и поле: title (умолчание) | seed | content | term
 *   search        прежний параметр каталогов: то же, что q с field=title
 *   philosopher   имя философа, повторяемый (≤ 20)
 *   philMode      all (умолчание) | any
 *   philArea      direct (умолчание; прямые участники) | lineage (вся
 *                 родословная, как /lineage/search)
 *   epoch         номер эпохи PHILOSOPHER_EPOCHS с нуля, повторяемый:
 *                 среди философов концепции (в области philArea) есть
 *                 философ одной из названных эпох
 *   method, synthLevel, status, lang
 *   meta          true | false — мета-синтез (среди родителей есть концепция)
 *   descendantsOf id концепции X: только её видимые потомки
 *   dateFrom, dateTo   YYYY-MM-DD, по дате создания, обе границы включены (UTC)
 *   sort          relevance | createdAt | updatedAt | title | method | status
 *                 (с текстом по умолчанию relevance, без текста — createdAt)
 *   order         desc (умолчание) | asc;   page, limit (≤ 100, умолчание 20)
 *
 * Ответ — SynthesisSearchResponse: превью каталога (toPreview +
 * projectPreview по смотрящему) + фрагмент с совпадением + у найденного
 * термина его id + в списке shared — моя роль и статус.
 *
 * Гостевой путь (optionalAuth) — ЧЕТВЁРТЫЙ после трёх путей 8.6: гостю
 * открыт только список public. Права — на каждом запросе по строкам
 * синтеза и участий (services/search → SQL-зеркало services/capabilities);
 * здесь сравнений с владельцем нет. Монтируется ДО synthesesRoutes: иначе
 * `/search` перехватил бы `GET /:id`.
 */
import { Hono } from "hono";
import { inArray } from "drizzle-orm";

import { db } from "../db/index.js";
import { syntheses } from "../db/schema.js";
import { optionalAuth, viewerOf, type AuthEnv } from "../middleware/auth.js";
import { getDescendants } from "../services/lineage-service.js";
import { searchSyntheses, type SearchParams } from "../services/search.js";
import { pruneInvisible } from "./lineage.js";
import {
  forbiddenJson,
  isUuid,
  loadAuthorNamesFor,
  loadConceptParentFlags,
  loadPhilosophersFor,
  loadSynthesisForRead,
  notFoundJson,
  projectPreview,
  toPreview,
} from "./syntheses.js";
import { PHILOSOPHER_EPOCHS } from "@philosynth/shared/constants/philosophers";
import {
  SEARCH_DEFAULT_FIELD,
  SEARCH_FIELDS,
  SEARCH_PAGE_DEFAULT,
  SEARCH_PAGE_MAX,
  SEARCH_PHILOSOPHERS_MAX,
  SEARCH_PHIL_AREAS,
  SEARCH_PHIL_MODES,
  SEARCH_QUERY_MAX,
  SEARCH_SCOPES,
  SEARCH_SORTS,
  isSearchField,
  isSearchScope,
  type SearchPhilArea,
  type SearchPhilMode,
  type SearchScope,
  type SearchSort,
} from "@philosynth/shared/constants/search";
import type { LineageNode } from "@philosynth/shared/types/lineage";
import type { SynthesisSearchItem, SynthesisSearchResponse } from "@philosynth/shared/types/search";
import type { SynthesisViewer } from "@philosynth/shared/types/synthesis";
import { tl } from "@philosynth/shared/i18n/t";

export const searchRoutes = new Hono<AuthEnv>();

/* Допустимые значения — зеркало enum'ов схемы (02), как в routes/syntheses */
const METHODS = new Set(["dialectical", "integrative", "deconstructive", "hermeneutical", "analytical", "creative"]);
const SYNTH_LEVELS = new Set(["comparative", "transformative", "generative"]);
const STATUSES = new Set(["draft", "generating", "paused", "ready", "error"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Глубина обхода потомков для фильтра (предел сервиса родословной). */
const DESCENDANTS_DEPTH = 10;

/** YYYY-MM-DD → начало суток UTC (сдвиг в днях); негодная дата → null. */
function dayStart(raw: string, plusDays = 0): string | null {
  if (!DATE_RE.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return null;
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d.toISOString();
}

const collectIds = (nodes: LineageNode[], out: Set<string>): void => {
  for (const n of nodes) {
    if (n.type === "synthesis" && n.synthesisId) out.add(n.synthesisId);
    collectIds(n.children, out);
  }
};

searchRoutes.get("/search", optionalAuth, async (c) => {
  const user = viewerOf(c);
  const userId = user?.id ?? null;
  const viewer: SynthesisViewer = user ? "user" : "guest";
  const q = c.req.query();
  const details: Record<string, string> = {};

  /* ── список ── */
  let scope: SearchScope = user ? "mine" : "public";
  if (q.scope !== undefined) {
    if (isSearchScope(q.scope)) scope = q.scope;
    else details.scope = SEARCH_SCOPES.join("|");
  }
  if (!user && scope !== "public" && !details.scope) {
    // гость — только публичное (как сегодня: свои и «со мной» — под сессией)
    return c.json({ error: tl("common.authRequired", "Требуется авторизация"), code: "AUTH_REQUIRED" }, 401);
  }

  /* ── текст ── */
  const rawText = (q.q ?? q.search ?? "").trim();
  if (rawText.length > SEARCH_QUERY_MAX) details.q = `≤ ${SEARCH_QUERY_MAX}`;
  let field = SEARCH_DEFAULT_FIELD;
  if (q.field !== undefined && q.q !== undefined) {
    if (isSearchField(q.field)) field = q.field;
    else details.field = SEARCH_FIELDS.join("|");
  } else if (q.field !== undefined && !isSearchField(q.field)) {
    details.field = SEARCH_FIELDS.join("|");
  }

  /* ── философы и эпохи ── */
  const philosophers = [...new Set((c.req.queries("philosopher") ?? []).map((s) => s.trim()).filter(Boolean))];
  if (philosophers.length > SEARCH_PHILOSOPHERS_MAX) details.philosopher = `≤ ${SEARCH_PHILOSOPHERS_MAX}`;
  let philMode: SearchPhilMode = "all";
  if (q.philMode !== undefined) {
    if ((SEARCH_PHIL_MODES as readonly string[]).includes(q.philMode)) philMode = q.philMode as SearchPhilMode;
    else details.philMode = SEARCH_PHIL_MODES.join("|");
  }
  let philArea: SearchPhilArea = "direct";
  if (q.philArea !== undefined) {
    if ((SEARCH_PHIL_AREAS as readonly string[]).includes(q.philArea)) philArea = q.philArea as SearchPhilArea;
    else details.philArea = SEARCH_PHIL_AREAS.join("|");
  }
  const epochs: number[] = [];
  for (const raw of c.req.queries("epoch") ?? []) {
    const n = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : -1;
    if (n >= 0 && n < PHILOSOPHER_EPOCHS.length) {
      if (!epochs.includes(n)) epochs.push(n);
    } else details.epoch = `0…${PHILOSOPHER_EPOCHS.length - 1}`;
  }
  const epochPhilosophers = epochs.flatMap((i) => [...(PHILOSOPHER_EPOCHS[i]?.philosophers ?? [])]);

  /* ── прочие фильтры ── */
  if (q.method !== undefined && !METHODS.has(q.method)) details.method = [...METHODS].join("|");
  if (q.synthLevel !== undefined && !SYNTH_LEVELS.has(q.synthLevel)) details.synthLevel = [...SYNTH_LEVELS].join("|");
  if (q.status !== undefined && !STATUSES.has(q.status)) details.status = [...STATUSES].join("|");
  let meta: boolean | null = null;
  if (q.meta !== undefined) {
    if (q.meta === "true" || q.meta === "false") meta = q.meta === "true";
    else details.meta = "true|false";
  }
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  if (q.dateFrom !== undefined) {
    dateFrom = dayStart(q.dateFrom);
    if (!dateFrom) details.dateFrom = "YYYY-MM-DD";
  }
  if (q.dateTo !== undefined) {
    dateTo = dayStart(q.dateTo, 1); // граница включена: до начала следующих суток
    if (!dateTo) details.dateTo = "YYYY-MM-DD";
  }
  const lang = q.lang?.trim() ? q.lang.trim() : null;

  /* ── порядок и страницы (смысл параметров каталогов сохранён) ── */
  let sort: SearchSort = rawText ? "relevance" : "createdAt";
  if (q.sort !== undefined) {
    if ((SEARCH_SORTS as readonly string[]).includes(q.sort)) sort = q.sort as SearchSort;
    else details.sort = SEARCH_SORTS.join("|");
  }
  const orderDesc = (q.order ?? "desc") !== "asc";
  const pageRaw = Number.parseInt(q.page ?? "1", 10);
  const limitRaw = Number.parseInt(q.limit ?? String(SEARCH_PAGE_DEFAULT), 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(limitRaw, SEARCH_PAGE_MAX) : SEARCH_PAGE_DEFAULT;

  if (Object.keys(details).length > 0) {
    return c.json(
      { error: tl("server.routes.syntheses.invalidParams", "Невалидные параметры"), code: "VALIDATION_ERROR", details },
      400,
    );
  }

  /* ── потомки концепции X: X должна быть читаема смотрящим ── */
  let descendantIds: string[] | null = null;
  if (q.descendantsOf !== undefined) {
    if (!isUuid(q.descendantsOf)) return c.json(notFoundJson, 404);
    const res = await loadSynthesisForRead(q.descendantsOf, userId);
    if (res.access === "notfound") return c.json(notFoundJson, 404);
    if (res.access === "forbidden") return c.json(forbiddenJson, 403);
    // то же дерево, что GET /:id/lineage/descendants: невидимый посредник
    // срезается вместе с поддеревом
    const tree = await pruneInvisible(await getDescendants(q.descendantsOf, DESCENDANTS_DEPTH), userId);
    const ids = new Set<string>();
    collectIds(tree, ids);
    descendantIds = [...ids];
  }

  const params: SearchParams = {
    scope,
    q: rawText,
    field,
    philosophers,
    philMode,
    philArea,
    epochPhilosophers,
    method: q.method ?? null,
    synthLevel: q.synthLevel ?? null,
    lang,
    meta,
    descendantIds,
    status: q.status ?? null,
    dateFrom,
    dateTo,
    sort,
    orderDesc,
    page,
    limit,
  };
  const found = await searchSyntheses(params, userId);

  /* ── превью — теми же функциями, что каталоги ── */
  const ids = found.hits.map((h) => h.id);
  const rows = ids.length > 0 ? await db.select().from(syntheses).where(inArray(syntheses.id, ids)) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const philMap = await loadPhilosophersFor(ids);
  const metaFlags = await loadConceptParentFlags(ids);
  const authors = await loadAuthorNamesFor(rows);
  const items: SynthesisSearchItem[] = [];
  for (const h of found.hits) {
    const r = byId.get(h.id);
    if (!r) continue; // удалена между запросами
    items.push({
      ...projectPreview(toPreview(r, philMap.get(r.id) ?? [], metaFlags.has(r.id), authors.get(r.id)), viewer),
      ...(h.fragment ? { fragment: h.fragment } : {}),
      ...(h.term ? { term: h.term } : {}),
      ...(h.myRole && h.myStatus ? { myRole: h.myRole, myStatus: h.myStatus } : {}),
    });
  }

  const body: SynthesisSearchResponse = {
    items,
    total: found.total,
    match: found.match,
    query: {
      scope,
      q: rawText,
      field: rawText ? field : null,
      philosophers,
      philMode,
      philArea,
      epochs,
      method: params.method,
      synthLevel: params.synthLevel,
      lang,
      meta,
      descendantsOf: q.descendantsOf ?? null,
      status: params.status,
      dateFrom: q.dateFrom ?? null,
      dateTo: q.dateTo ?? null,
      sort,
      order: orderDesc ? "desc" : "asc",
      page,
      limit,
    },
  };
  return c.json(body);
});
