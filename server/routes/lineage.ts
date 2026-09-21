/**
 * Роуты генеалогии (беседа 3.1; 03-specification §2.8):
 *  - GET /syntheses/:id/lineage/ancestors?depth=10   → { tree }
 *  - GET /syntheses/:id/lineage/descendants?depth=5  → { children }
 *  - GET /lineage/search?philosopher=Кант&philosopher=Хайдеггер
 *      → { syntheses: SynthesisPreview[] }
 *  - POST /syntheses/:id/lineage/link { parentName, parentSynthesisId } (8.5)
 *      → { ok: true, record: LineageRecord }
 *    Заслоны: владелец обоих синтезов — текущий пользователь (иначе 403;
 *    :id не найден → 404, parentSynthesisId не UUID/не найден → 404);
 *    :id === parentSynthesisId → 400 LINEAGE_SELF; родитель — среди
 *    ПОТОМКОВ :id → 409 LINEAGE_CYCLE; пара уже есть → 409 LINEAGE_EXISTS
 *    (идемпотентный отказ, дубликата строки нет). parentName обязателен
 *    (текст из файла — для журнала/сообщения), в БД не пишется:
 *    parent_name в модели — имя ФИЛОСОФА (02 §2.4).
 *
 * Точки монтирования РАЗНЫЕ (§2.8): первые два живут под /syntheses,
 * поиск — под /lineage; отсюда ДВА экспортируемых роутера
 * (lineageRoutes / lineageSearchRoutes) — index.ts монтирует оба.
 *
 * Доступ:
 *  - ancestors/descendants — владелец ИЛИ неприватная ступень (8.6:
 *    visibility ≠ 'private'; витрина ПРОХОДИТ — генеалогия есть метаданные,
 *    как parentSyntheses/childSyntheses в SynthesisFull) (loadSynthesisForRead,
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
import { and, eq, inArray, ne, or } from "drizzle-orm";

import { db } from "../db/index.js";
import { syntheses } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import {
  getAncestors,
  getDescendants,
  LineageLinkError,
  linkParent,
  searchByPhilosophers,
} from "../services/lineage-service.js";
import type { LineageNode } from "@philosynth/shared/types/lineage";
import {
  forbiddenJson,
  isUuid,
  loadAuthorNamesFor,
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
 * если синтез принадлежит пользователю или неприватен (8.6: visibility ≠
 * 'private' — витрина видна как узел, её содержание закрыто своими
 * роутами); невидимый узел
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
        or(eq(syntheses.userId, userId), ne(syntheses.visibility, "private")),
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

/* ══ POST /syntheses/:id/lineage/link (8.5) ═══════════════════════════ */

lineageRoutes.post("/:id/lineage/link", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = null;
  }
  const b = (body ?? {}) as { parentName?: unknown; parentSynthesisId?: unknown };
  const details: Record<string, string> = {};
  const parentName =
    typeof b.parentName === "string" ? b.parentName.trim() : "";
  if (!parentName) details.parentName = "обязательное поле";
  const parentSynthesisId =
    typeof b.parentSynthesisId === "string" ? b.parentSynthesisId : "";
  if (!parentSynthesisId) details.parentSynthesisId = "обязательное поле";
  if (Object.keys(details).length > 0) {
    return c.json(
      { error: "Невалидные параметры связи", code: "VALIDATION_ERROR", details },
      400,
    );
  }

  // Ребёнок: должен существовать и принадлежать пользователю (не «читаемый»
  // — публичный чужой синтез править нельзя)
  const child = await loadSynthesisForRead(id, user.id);
  if (child.access === "notfound") return c.json(notFoundJson, 404);
  if (child.access === "forbidden" || child.row.userId !== user.id)
    return c.json(forbiddenJson, 403);

  if (id === parentSynthesisId) {
    return c.json(
      {
        error: "Концепция не может быть собственным родителем",
        code: "LINEAGE_SELF",
      },
      400,
    );
  }

  // Родитель: существует и принадлежит ТОМУ ЖЕ пользователю. Сопоставление
  // идёт по имени, а имя не идентификатор — чужие одноимённые концепции в
  // родители не идут (07 8.5, «Чего не делать»), даже публичные.
  if (!isUuid(parentSynthesisId)) {
    return c.json(
      { error: "Концепция-родитель не найдена", code: "NOT_FOUND" },
      404,
    );
  }
  const [parent] = await db
    .select({ id: syntheses.id, userId: syntheses.userId })
    .from(syntheses)
    .where(eq(syntheses.id, parentSynthesisId))
    .limit(1);
  if (!parent) {
    return c.json(
      { error: "Концепция-родитель не найдена", code: "NOT_FOUND" },
      404,
    );
  }
  if (parent.userId !== user.id) {
    return c.json(
      {
        error: "Концепция-родитель принадлежит другому пользователю",
        code: "FORBIDDEN",
      },
      403,
    );
  }

  try {
    const record = await linkParent(id, parentSynthesisId, parentName);
    return c.json({ ok: true, record });
  } catch (err) {
    if (err instanceof LineageLinkError) {
      const status = err.code === "LINEAGE_SELF" ? 400 : 409;
      return c.json({ error: err.message, code: err.code }, status);
    }
    throw err;
  }
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

  // Только видимые: свои ИЛИ неприватные (паритет каталога 1.6; 8.6 —
  // visibility ≠ 'private'). Роут под requireAuth — смотрящий 'user',
  // стоимость в превью остаётся; authorName по действенному show_author.
  const rows = await db
    .select()
    .from(syntheses)
    .where(
      and(
        inArray(syntheses.id, ids),
        or(eq(syntheses.userId, user.id), ne(syntheses.visibility, "private")),
      ),
    )
    .orderBy(syntheses.createdAt);

  const rowIds = rows.map((r) => r.id);
  const philMap = await loadPhilosophersFor(rowIds);
  const metaFlags = await loadConceptParentFlags(rowIds); // беседа 3.2
  const authors = await loadAuthorNamesFor(rows); // 8.6
  return c.json({
    syntheses: rows.map((r) =>
      toPreview(r, philMap.get(r.id) ?? [], metaFlags.has(r.id), authors.get(r.id)),
    ),
  });
});
