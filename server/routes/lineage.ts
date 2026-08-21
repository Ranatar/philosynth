/**
 * Роуты генеалогии (беседа 3.1; 03-specification §2.8):
 *  - GET /syntheses/:id/lineage/ancestors?depth=10   → { tree }
 *  - GET /syntheses/:id/lineage/descendants?depth=5  → { children }
 *  - GET /lineage/search?philosopher=Кант&philosopher=Хайдеггер
 *      → { syntheses: SynthesisPreview[] }
 *
 * Точки монтирования РАЗНЫЕ (§2.8): первые два живут под /syntheses,
 * поиск — под /lineage; отсюда ДВА экспортируемых роутера
 * (lineageRoutes / lineageSearchRoutes) — index.ts монтирует оба.
 *
 * Доступ:
 *  - ancestors/descendants — владелец ИЛИ is_public (loadSynthesisForRead,
 *    решение аудита 2026-07-30 для транспорта чтения); невалидный UUID →
 *    404 (guard 1.6 до запроса к PG);
 *  - в дереве потомков чужие ПРИВАТНЫЕ синтезы отсекаются вместе с их
 *    поддеревьями (генеалогия — тоже данные синтеза; правило видимости
 *    §6 01-architecture). Для предков отсечения нет: родительские имена
 *    уже видимы в SynthesisFull.parentSyntheses (GET /:id, беседа 1.6);
 *  - /lineage/search возвращает только видимые синтезы (свои ИЛИ
 *    публичные) — паритет каталога.
 */

import { Hono } from "hono";
import { and, eq, inArray, or } from "drizzle-orm";

import { db } from "../db/index.js";
import { syntheses } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import {
  getAncestors,
  getDescendants,
  searchByPhilosophers,
} from "../services/lineage-service.js";
import type { LineageNode } from "@philosynth/shared/types/lineage";
import {
  forbiddenJson,
  loadConceptParentFlags,
  loadPhilosophersFor,
  loadSynthesisForRead,
  notFoundJson,
  toPreview,
} from "./syntheses.js";

/** depth из query: невалидный/отсутствующий → дефолт (clamp — в сервисе). */
function depthParam(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Отсечение невидимых узлов-концепций из дерева потомков: узел виден,
 * если синтез принадлежит пользователю или публичен; невидимый узел
 * удаляется ВМЕСТЕ с поддеревом (транзитивная видимость через приватного
 * посредника не раскрывается).
 */
async function pruneInvisible(
  nodes: LineageNode[],
  userId: string,
): Promise<LineageNode[]> {
  const ids: string[] = [];
  const collect = (list: LineageNode[]): void => {
    for (const n of list) {
      if (n.type === "synthesis" && n.synthesisId) ids.push(n.synthesisId);
      collect(n.children);
    }
  };
  collect(nodes);
  if (ids.length === 0) return nodes;

  const rows = await db
    .select({ id: syntheses.id })
    .from(syntheses)
    .where(
      and(
        inArray(syntheses.id, [...new Set(ids)]),
        or(eq(syntheses.userId, userId), eq(syntheses.isPublic, true)),
      ),
    );
  const visible = new Set(rows.map((r) => r.id));

  const prune = (list: LineageNode[]): LineageNode[] =>
    list
      .filter((n) => n.type !== "synthesis" || visible.has(n.synthesisId ?? ""))
      .map((n) => ({ ...n, children: prune(n.children) }));
  return prune(nodes);
}

/* ══ /syntheses/:id/lineage/* ═════════════════════════════════════════ */

export const lineageRoutes = new Hono<AuthEnv>();

lineageRoutes.get("/:id/lineage/ancestors", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const res = await loadSynthesisForRead(id, user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);

  const tree = await getAncestors(id, depthParam(c.req.query("depth"), 10));
  return c.json({ tree });
});

lineageRoutes.get("/:id/lineage/descendants", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const res = await loadSynthesisForRead(id, user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);

  const children = await getDescendants(
    id,
    depthParam(c.req.query("depth"), 5),
  );
  return c.json({ children: await pruneInvisible(children, user.id) });
});

/* ══ /lineage/search ══════════════════════════════════════════════════ */

export const lineageSearchRoutes = new Hono<AuthEnv>();

lineageSearchRoutes.get("/search", requireAuth, async (c) => {
  const user = c.get("user");
  const names = (c.req.queries("philosopher") ?? [])
    .map((n) => n.trim())
    .filter(Boolean);
  if (names.length === 0) {
    return c.json(
      {
        error: "Укажите хотя бы одного философа",
        code: "VALIDATION_ERROR",
        details: { philosopher: "хотя бы один параметр philosopher" },
      },
      400,
    );
  }

  const ids = await searchByPhilosophers(names);
  if (ids.length === 0) return c.json({ syntheses: [] });

  // Только видимые: свои ИЛИ публичные (паритет каталога 1.6)
  const rows = await db
    .select()
    .from(syntheses)
    .where(
      and(
        inArray(syntheses.id, ids),
        or(eq(syntheses.userId, user.id), eq(syntheses.isPublic, true)),
      ),
    )
    .orderBy(syntheses.createdAt);

  const rowIds = rows.map((r) => r.id);
  const philMap = await loadPhilosophersFor(rowIds);
  const metaFlags = await loadConceptParentFlags(rowIds); // беседа 3.2
  return c.json({
    syntheses: rows.map((r) =>
      toPreview(r, philMap.get(r.id) ?? [], metaFlags.has(r.id)),
    ),
  });
});
