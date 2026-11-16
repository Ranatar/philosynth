/**
 * Похожие концепции — маршрут (беседа 18.3; 03 §2.22):
 *
 *   GET /api/v1/syntheses/:id/similar?limit=
 *
 * Ответ — SimilarSynthesesResponse: превью каталога (toPreview +
 * projectPreview по смотрящему, как у поиска) + мера СЛОВАМИ (`grade`) +
 * причины. Числа меры в ответе нет. Считается на запрос, в БД не хранится.
 *
 * Гостевой путь (optionalAuth) — ПЯТЫЙ после трёх путей 8.6 и поиска 18.1:
 * блок живёт на странице концепции, а её читает и гость. Саму концепцию
 * открывает `loadSynthesisForRead` (чужая приватная → 403), кандидатов —
 * правила поиска (services/similarity → services/capabilities); здесь
 * сравнений с владельцем нет. Монтируется ДО synthesesRoutes.
 */
import { Hono } from "hono";
import { inArray } from "drizzle-orm";

import { db } from "../db/index.js";
import { syntheses } from "../db/schema.js";
import { optionalAuth, viewerOf, type AuthEnv } from "../middleware/auth.js";
import { findSimilar } from "../services/similarity.js";
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
import { SIMILAR_LIMIT_DEFAULT, SIMILAR_LIMIT_MAX } from "@philosynth/shared/constants/similarity";
import type { SimilarSynthesesResponse, SimilarSynthesisItem } from "@philosynth/shared/types/similarity";
import type { SynthesisViewer } from "@philosynth/shared/types/synthesis";
import { tl } from "@philosynth/shared/i18n/t";

export const similarRoutes = new Hono<AuthEnv>();

similarRoutes.get("/:id/similar", optionalAuth, async (c) => {
  const user = viewerOf(c);
  const userId = user?.id ?? null;
  const viewer: SynthesisViewer = user ? "user" : "guest";
  const id = c.req.param("id");
  if (!isUuid(id)) return c.json(notFoundJson, 404);

  let limit = SIMILAR_LIMIT_DEFAULT;
  const rawLimit = c.req.query("limit");
  if (rawLimit !== undefined) {
    const n = /^\d+$/.test(rawLimit) ? Number.parseInt(rawLimit, 10) : 0;
    if (n < 1 || n > SIMILAR_LIMIT_MAX) {
      return c.json(
        {
          error: tl("server.routes.syntheses.invalidParams", "Невалидные параметры"),
          code: "VALIDATION_ERROR",
          details: { limit: `1…${SIMILAR_LIMIT_MAX}` },
        },
        400,
      );
    }
    limit = n;
  }

  const res = await loadSynthesisForRead(id, userId);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  // витрина: содержание самой концепции смотрящему закрыто — её термины и
  // категории не читаются и ни с кем не сравниваются
  const sourceContentOpen = res.scope === "full";

  const found = await findSimilar(
    {
      id: res.row.id,
      lang: res.row.lang,
      method: res.row.method,
      synthLevel: res.row.synthLevel,
      contentOpen: sourceContentOpen,
    },
    userId,
    limit,
  );

  /* ── превью — теми же функциями, что каталоги и поиск ── */
  const ids = found.hits.map((h) => h.id);
  const rows = ids.length > 0 ? await db.select().from(syntheses).where(inArray(syntheses.id, ids)) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const philMap = await loadPhilosophersFor(ids);
  const metaFlags = await loadConceptParentFlags(ids);
  const authors = await loadAuthorNamesFor(rows);
  const items: SimilarSynthesisItem[] = [];
  for (const h of found.hits) {
    const r = byId.get(h.id);
    if (!r) continue; // удалена между запросами
    items.push({
      ...projectPreview(toPreview(r, philMap.get(r.id) ?? [], metaFlags.has(r.id), authors.get(r.id)), viewer),
      similarity: {
        grade: h.grade,
        reasons: h.reasons,
        textCompared: h.textCompared,
        ...(h.textSkipped ? { textSkipped: h.textSkipped } : {}),
      },
    });
  }

  const body: SimilarSynthesesResponse = { items, capped: found.capped, sourceContentOpen };
  return c.json(body);
});
