/**
 * Роуты режимов (беседа 4.1; 03-spec §2.7):
 *
 *   POST   /syntheses/:id/modes/:modeKey/run { param } → { ok: true }
 *          // запуск фоном; стриминг через WebSocket (stream_delta
 *          // sectionKey "mode:{modeKey}", mode_done)
 *   GET    /syntheses/:id/modes            → { modes: Record<key, ModeResult[]> }
 *   GET    /syntheses/:id/modes/:modeKey   → { results, warnings, estimate }
 *   DELETE /syntheses/:id/modes/:modeKey/:index → { ok: true }
 *
 * Решения:
 *  - чтение (оба GET) — владелец ИЛИ is_public (loadSynthesisForRead:
 *    результаты режимов — часть контента документа, правило транспорта
 *    чтения 1.6); run/DELETE — только владелец (edit-операции);
 *  - не-UUID id → 404 (guard до PG, правило 1.6); неизвестный modeKey →
 *    404 NOT_FOUND «Режим не найден»;
 *  - run/DELETE при активной генерации → 409 GENERATION_IN_PROGRESS
 *    (единообразие с routes/generation 2.2; для DELETE — отступление от
 *    «всегда доступного» removeModeResult исходника: план может как раз
 *    перегенерировать этот индекс);
 *  - пустой param → 400 VALIDATION_ERROR + details.param;
 *  - GET /:modeKey несёт АДДИТИВНЫЕ warnings (checkModeDeps) и estimate
 *    (estimateModeCost, fail-open null) — транспорт ModeModal; §2.7 их
 *    не специфицирует (дыра доков — в патч на завершение; прецеденты:
 *    warnings POST 3.1, hasConceptParents 3.2);
 *  - index в DELETE — позиция по created_at ASC (контракт loadModesState
 *    2.1 и delete-шагов plan-executor 2.2); вне диапазона → 404.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { and, asc, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { modeResults, syntheses } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import {
  isGenerationActive,
  loadSynthesis,
} from "../services/generation-service.js";
import {
  computeModeDepsWarnings,
  estimateModeForSynthesis,
  getModeConfig,
  startMode,
  startModeRegen,
} from "../services/mode-service.js";
import {
  forbiddenJson,
  isUuid,
  loadSynthesisForRead,
  notFoundJson,
} from "./syntheses.js";

import type { GenerationOrder } from "@philosynth/shared/types/synthesis";
import type { ModeResult } from "@philosynth/shared/types/modes";

export const modesRoutes = new Hono<AuthEnv>();

type ModeRow = typeof modeResults.$inferSelect;

/** Строка mode_results → API-представление (Number для numeric, как
 *  Number(balanceUsd) в auth 0.2). */
function toModeResult(row: ModeRow): ModeResult {
  return {
    id: row.id,
    synthesisId: row.synthesisId,
    modeKey: row.modeKey as ModeResult["modeKey"],
    paramValue: row.paramValue,
    htmlContent: row.htmlContent,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    costUsd: Number(row.costUsd),
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadModeRowsAsc(
  synthesisId: string,
  modeKey: string,
): Promise<ModeRow[]> {
  return db
    .select()
    .from(modeResults)
    .where(
      and(
        eq(modeResults.synthesisId, synthesisId),
        eq(modeResults.modeKey, modeKey),
      ),
    )
    .orderBy(asc(modeResults.createdAt));
}

/** Владелец + существование + отсутствие активной генерации (edit-гейт,
 *  паритет ownerGate routes/generation 2.2). null = гейты пройдены. */
async function ownerEditGate(
  c: Context,
  id: string,
  userId: string,
): Promise<Response | null> {
  if (!isUuid(id)) return c.json(notFoundJson, 404);
  const [row] = await db
    .select({ userId: syntheses.userId })
    .from(syntheses)
    .where(eq(syntheses.id, id))
    .limit(1);
  if (!row) return c.json(notFoundJson, 404);
  if (row.userId !== userId) return c.json(forbiddenJson, 403);
  if (isGenerationActive(id)) {
    return c.json(
      { error: "Генерация уже идёт", code: "GENERATION_IN_PROGRESS" },
      409,
    );
  }
  return null;
}

const modeNotFoundJson = { error: "Режим не найден", code: "NOT_FOUND" } as const;

/* ── GET /syntheses/:id/modes — все режимы с результатами (§2.7) ────── */

modesRoutes.get("/:id/modes", requireAuth, async (c) => {
  const user = c.get("user");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);

  const rows = await db
    .select()
    .from(modeResults)
    .where(eq(modeResults.synthesisId, res.row.id))
    .orderBy(asc(modeResults.createdAt));
  const modes: Record<string, ModeResult[]> = {};
  for (const row of rows) {
    (modes[row.modeKey] ??= []).push(toModeResult(row));
  }
  return c.json({ modes });
});

/* ── GET /syntheses/:id/modes/:modeKey — результаты одного режима ───── */

modesRoutes.get("/:id/modes/:modeKey", requireAuth, async (c) => {
  const user = c.get("user");
  const modeKey = c.req.param("modeKey");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  if (!getModeConfig(modeKey)) return c.json(modeNotFoundJson, 404);

  const rows = await loadModeRowsAsc(res.row.id, modeKey);
  const warnings = await computeModeDepsWarnings(
    modeKey,
    res.row.generationOrder as GenerationOrder,
    res.row.sectionOrder ?? [],
  );
  // Философы нужны только для SYS-оценки; fail-open уровнем ниже
  let estimate = null;
  try {
    const { philosophers } = await loadSynthesis(res.row.id);
    estimate = await estimateModeForSynthesis(modeKey, res.row, philosophers);
  } catch (err) {
    console.warn("GET /modes/:modeKey estimate fail-open:", err);
  }

  return c.json({ results: rows.map(toModeResult), warnings, estimate });
});

/* ── POST /syntheses/:id/modes/:modeKey/run — запуск режима (§2.7) ──── */

modesRoutes.post("/:id/modes/:modeKey/run", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const modeKey = c.req.param("modeKey");
  const gate = await ownerEditGate(c, id, user.id);
  if (gate) return gate;
  if (!getModeConfig(modeKey)) return c.json(modeNotFoundJson, 404);

  let body: unknown = {};
  try {
    body = await c.req.json();
  } catch {
    /* пустое/битое тело → провалит валидацию param ниже */
  }
  const param =
    typeof (body as { param?: unknown }).param === "string"
      ? ((body as { param: string }).param).trim()
      : "";
  if (!param) {
    return c.json(
      {
        error: "Невалидные данные",
        code: "VALIDATION_ERROR",
        details: { param: "Заполните параметр." },
      },
      400,
    );
  }

  // Исполнение фоном под generation-слотом; прогресс — WebSocket.
  // Ошибки ДО слота внутри фона (гонка за слот и т.п.) станут
  // stream_error из startMode-цепочки; sync-гейт 409 уже пройден.
  void startMode(id, user.id, modeKey, param).catch((err) => {
    console.error(`startMode(${id}, ${modeKey}):`, err);
  });
  return c.json({ ok: true });
});

/* ── DELETE /syntheses/:id/modes/:modeKey/:index (§2.7) ─────────────── */

modesRoutes.delete("/:id/modes/:modeKey/:index", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const modeKey = c.req.param("modeKey");
  const gate = await ownerEditGate(c, id, user.id);
  if (gate) return gate;
  if (!getModeConfig(modeKey)) return c.json(modeNotFoundJson, 404);

  const idxRaw = c.req.param("index");
  const index = /^\d+$/.test(idxRaw) ? Number.parseInt(idxRaw, 10) : -1;
  if (index < 0) return c.json(notFoundJson, 404);

  const rows = await loadModeRowsAsc(id, modeKey);
  const target = rows[index];
  if (!target) return c.json(notFoundJson, 404);

  await db.delete(modeResults).where(eq(modeResults.id, target.id));
  return c.json({ ok: true });
});

/** POST /:id/modes/:modeKey/:index/regenerate — тихая перегенерация
 *  СУЩЕСТВУЮЩЕГО результата (его собственный param; UPDATE строки).
 *  Транспорт каскада режимов из SubsectionRegenPanel (долг §12 за 4.1;
 *  §2.7 исходника такого эндпоинта не имел — вызов был внутренним).
 *  Гейты как у DELETE: владелец + 409 при активной генерации; фон. */
modesRoutes.post(
  "/:id/modes/:modeKey/:index/regenerate",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const modeKey = c.req.param("modeKey");
    const gate = await ownerEditGate(c, id, user.id);
    if (gate) return gate;
    if (!getModeConfig(modeKey)) return c.json(modeNotFoundJson, 404);

    const idxRaw = c.req.param("index");
    const index = /^\d+$/.test(idxRaw) ? Number.parseInt(idxRaw, 10) : -1;
    if (index < 0) return c.json(notFoundJson, 404);

    const rows = await loadModeRowsAsc(id, modeKey);
    if (!rows[index]) return c.json(notFoundJson, 404);

    // Фон: ошибки стрима уйдут stream_error'ом из startModeRegen;
    // sync-гейт 409 уже пройден (паритет POST /run).
    void startModeRegen(id, user.id, modeKey, index).catch((err) => {
      console.error(`startModeRegen(${id}, ${modeKey}:${index}):`, err);
    });
    return c.json({ ok: true });
  },
);
