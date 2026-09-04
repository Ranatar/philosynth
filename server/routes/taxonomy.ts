/**
 * Роуты каталогов типов (беседа 5.3; 03-spec §2.13). Дыра доков 0.3b,
 * закрытая правкой 07 2026-07-23: модуль числился в карте 04, но ни одна
 * беседа его не создавала. Тонкие обёртки над element-taxonomy.ts:
 *
 *   GET  /taxonomy/category-types       → { types: CategoryType[] }
 *   POST /taxonomy/category-types       { key, nameRu, description } → { type }
 *   GET  /taxonomy/relationship-types   → { types: RelationshipType[] }
 *   POST /taxonomy/relationship-types   { key, nameRu, description,
 *                                         defaultDirection? } → { type }
 *   POST /taxonomy/normalize            { text, kind } → { match, suggestions }
 *
 * Решения:
 *  - все эндпоинты требуют сессии (правило §2 «все, кроме auth»); чтение
 *    каталога — любому пользователю, создание — любому (01 §4.8:
 *    «пользователь и админ могут добавлять новые типы»); админ-update/
 *    delete не специфицированы — долг §12 за 5.4;
 *  - валидация тел: строки обязательны (key/nameRu/text), description по
 *    умолчанию ""; defaultDirection ∈ RELATIONSHIP_DIRECTIONS либо
 *    отсутствует; kind ∈ category|relationship; ошибки сервиса
 *    (TaxonomyValidationError: невалидный ключ, дубликат) → 400
 *    VALIDATION_ERROR + details (дубликат ключа — тоже 400, не 409:
 *    контракт TaxonomyValidationError.code беседы 0.3b);
 *  - монтирование — /api/v1/taxonomy (index.ts), отдельно от /syntheses:
 *    каталоги глобальные, не привязаны к синтезу.
 */
import { Hono } from "hono";
import type { Context } from "hono";

import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import {
  RELATIONSHIP_DIRECTIONS,
  TaxonomyValidationError,
  createCustomType,
  getCategoryTypes,
  getRelationshipTypes,
  normalizeType,
  type RelationshipDirection,
  type TaxonomyKind,
} from "../services/element-taxonomy.js";

export const taxonomyRoutes = new Hono<AuthEnv>();

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const v: unknown = await c.req.json();
    return typeof v === "object" && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function validationJson(c: Context, details: Record<string, string>, error = "Невалидные данные"): Response {
  return c.json({ error, code: "VALIDATION_ERROR", details }, 400);
}

/** Общие поля тела POST каталога: key, nameRu обязательны; description → "". */
function readTypeBody(body: Record<string, unknown>):
  | { ok: true; key: string; nameRu: string; description: string }
  | { ok: false; details: Record<string, string> } {
  const details: Record<string, string> = {};
  if (typeof body.key !== "string" || !body.key.trim()) details.key = "Обязательное поле";
  if (typeof body.nameRu !== "string" || !body.nameRu.trim()) details.nameRu = "Обязательное поле";
  if (body.description !== undefined && typeof body.description !== "string")
    details.description = "Ожидается строка";
  if (Object.keys(details).length) return { ok: false, details };
  return {
    ok: true,
    key: (body.key as string).trim(),
    nameRu: body.nameRu as string,
    description: typeof body.description === "string" ? body.description : "",
  };
}

function serviceError(c: Context, err: unknown): Response {
  if (err instanceof TaxonomyValidationError)
    return validationJson(c, err.details ?? {}, err.message);
  throw err;
}

/* ── category-types ──────────────────────────────────────────────────── */

taxonomyRoutes.get("/category-types", requireAuth, async (c) =>
  c.json({ types: await getCategoryTypes() }),
);

taxonomyRoutes.post("/category-types", requireAuth, async (c) => {
  const user = c.get("user");
  const parsed = readTypeBody(await readJson(c));
  if (!parsed.ok) return validationJson(c, parsed.details);
  try {
    const type = await createCustomType(
      parsed.key, parsed.nameRu, parsed.description, "category", user.id,
    );
    return c.json({ type }, 201);
  } catch (err) {
    return serviceError(c, err);
  }
});

/* ── relationship-types ──────────────────────────────────────────────── */

taxonomyRoutes.get("/relationship-types", requireAuth, async (c) =>
  c.json({ types: await getRelationshipTypes() }),
);

taxonomyRoutes.post("/relationship-types", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const parsed = readTypeBody(body);
  if (!parsed.ok) return validationJson(c, parsed.details);
  let defaultDirection: RelationshipDirection | undefined;
  if (body.defaultDirection !== undefined) {
    if (
      typeof body.defaultDirection !== "string" ||
      !(RELATIONSHIP_DIRECTIONS as readonly string[]).includes(body.defaultDirection)
    ) {
      return validationJson(c, {
        defaultDirection: `Ожидается ${RELATIONSHIP_DIRECTIONS.join(" | ")}`,
      });
    }
    defaultDirection = body.defaultDirection as RelationshipDirection;
  }
  try {
    const type = await createCustomType(
      parsed.key, parsed.nameRu, parsed.description, "relationship", user.id, defaultDirection,
    );
    return c.json({ type }, 201);
  } catch (err) {
    return serviceError(c, err);
  }
});

/* ── normalize ───────────────────────────────────────────────────────── */

taxonomyRoutes.post("/normalize", requireAuth, async (c) => {
  const body = await readJson(c);
  const details: Record<string, string> = {};
  if (typeof body.text !== "string" || !body.text.trim()) details.text = "Обязательное поле";
  if (body.kind !== "category" && body.kind !== "relationship")
    details.kind = "Ожидается category | relationship";
  if (Object.keys(details).length) return validationJson(c, details);
  const result = await normalizeType(body.text as string, body.kind as TaxonomyKind);
  return c.json(result);
});
