/**
 * Роуты перегенерации (беседа 2.2; 03-spec §2.5):
 *
 *   POST /syntheses/:id/regenerate/:sectionKey → { ok: true }
 *        body { context?: string }
 *   POST /syntheses/:id/regenerate-subsection  → { ok: true }
 *        body { sectionKey, subsectionName, userNote?,
 *               includeCurrentContent? }
 *
 * Решения:
 *  - owner-only (перегенерация — edit-операция, правило планов 2.1);
 *  - не-UUID id → 404 (guard до PG, правило 1.6);
 *  - активная генерация → 409 GENERATION_IN_PROGRESS (03 §4.3);
 *  - исполнение — фоном под generation-слотом; прогресс — WebSocket
 *    (stream_delta/section_done); ошибка стрима — stream_error БЕЗ
 *    pausedState (паритет ручной перегенерации исходника [20716]);
 *  - add/delete разделов намеренно НЕ здесь: только через планы (§2.6).
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { syntheses } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import {
  getAffectedModes,
  getCrossSecDependents,
  getIntraDependents,
  loadModesState,
  type SectionDefsForCascade,
} from "../services/cascade-analyzer.js";
import { estimateSubsectionCost } from "../services/cost-estimator.js";
import {
  GenerationError,
  buildEditInfra,
  isGenerationActive,
  loadSynthesis,
  startSectionRegeneration,
  startSubsectionRegeneration,
} from "../services/generation-service.js";
import { loadActualOutputChars } from "../services/pause-resume-service.js";
import {
  baseCtx,
  baseCtxStatic,
  buildSYS,
  hasConceptParticipants,
} from "../services/prompt-builder.js";
import { buildSubsectionMap } from "../services/section-defs-builder.js";
import { isUuid } from "./syntheses.js";

import type {
  AffectedModeDto,
  CrossSectionDepDto,
  SubsectionImpactRequest,
  SubsectionImpactResponse,
} from "@philosynth/shared/types/edit-plan";

export const generationRoutes = new Hono<AuthEnv>();

/** Владелец и существование; null = гейты пройдены. */
async function ownerGate(
  c: Context,
  id: string,
  userId: string,
): Promise<Response | null> {
  if (!isUuid(id))
    return c.json({ error: "Синтез не найден", code: "NOT_FOUND" }, 404);
  const [row] = await db
    .select({ userId: syntheses.userId })
    .from(syntheses)
    .where(eq(syntheses.id, id))
    .limit(1);
  if (!row)
    return c.json({ error: "Синтез не найден", code: "NOT_FOUND" }, 404);
  if (row.userId !== userId)
    return c.json({ error: "Нет доступа к синтезу", code: "FORBIDDEN" }, 403);
  if (isGenerationActive(id)) {
    return c.json(
      { error: "Генерация уже идёт", code: "GENERATION_IN_PROGRESS" },
      409,
    );
  }
  return null;
}

/* ── POST /syntheses/:id/regenerate/:sectionKey ──────────────────────── */

generationRoutes.post(
  "/:id/regenerate/:sectionKey",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const sectionKey = c.req.param("sectionKey");
    const gate = await ownerGate(c, id, user.id);
    if (gate) return gate;

    let context: string | undefined;
    try {
      const body = (await c.req.json()) as { context?: string };
      if (body && typeof body.context === "string") context = body.context;
    } catch {
      /* пустое тело допустимо */
    }

    void startSectionRegeneration(id, user.id, sectionKey, context ?? null);
    return c.json({ ok: true });
  },
);

/* ── POST /syntheses/:id/regenerate-subsection ───────────────────────── */

generationRoutes.post(
  "/:id/regenerate-subsection",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const gate = await ownerGate(c, id, user.id);
    if (gate) return gate;

    let body: {
      sectionKey?: string;
      subsectionName?: string;
      userNote?: string;
      includeCurrentContent?: boolean;
    };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: "Невалидный JSON", code: "VALIDATION_ERROR" }, 400);
    }
    if (
      typeof body.sectionKey !== "string" ||
      typeof body.subsectionName !== "string"
    ) {
      return c.json(
        {
          error: "Требуются sectionKey и subsectionName",
          code: "VALIDATION_ERROR",
        },
        400,
      );
    }

    void startSubsectionRegeneration(
      id,
      user.id,
      body.sectionKey,
      body.subsectionName,
      {
        ...(body.userNote !== undefined ? { userNote: body.userNote } : {}),
        ...(body.includeCurrentContent !== undefined
          ? { includeCurrentContent: body.includeCurrentContent }
          : {}),
      },
    );
    return c.json({ ok: true });
  },
);

/* ── POST /syntheses/:id/subsection-impact (беседа 2.3) ──────────────── */
/*
 * Read-only превью подраздельной перегенерации для SubsectionRegenPanel.
 * Закрывает транспорт долга §12 «внутрисекционный каскад по
 * affectedSubs»: зависимые вычислимы по картам ДО перегенерации
 * (getIntraDependents/getCrossSecDependents), а /regenerate-subsection
 * отвечает { ok:true } и работает фоном — вернуть их не может.
 * Порт расчётной части showSubsectionRegenUI [18686]: intra-зависимые →
 * cross-зависимые от ВСЕХ изменяемых (dedup «section:sub», фильтр по
 * присутствующим разделам и актуальной карте подразделов) → затронутые
 * режимы → estimateSubsectionCost. Оценка — fail-open null.
 * Без гейта isGenerationActive: превью не мешает активному прогону.
 */

generationRoutes.post("/:id/subsection-impact", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!isUuid(id))
    return c.json({ error: "Синтез не найден", code: "NOT_FOUND" }, 404);

  let body: SubsectionImpactRequest;
  try {
    body = (await c.req.json()) as SubsectionImpactRequest;
  } catch {
    return c.json({ error: "Невалидный JSON", code: "VALIDATION_ERROR" }, 400);
  }
  if (
    typeof body.sectionKey !== "string" ||
    typeof body.subsectionName !== "string"
  ) {
    return c.json(
      {
        error: "Требуются sectionKey и subsectionName",
        code: "VALIDATION_ERROR",
      },
      400,
    );
  }
  const { sectionKey, subsectionName } = body;

  try {
    const { row, philosophers, secCtx } = await loadSynthesis(id);
    if (row.userId !== user.id)
      return c.json({ error: "Нет доступа к синтезу", code: "FORBIDDEN" }, 403);

    const sectionOrder: readonly string[] = row.sectionOrder ?? [];
    const infra = await buildEditInfra(row, philosophers, secCtx);

    // 1. Внутрисекционные транзитивные зависимые (фактические имена)
    const intraDependents = await getIntraDependents(
      infra.p,
      sectionKey,
      subsectionName,
    );

    // 2. Межразделовые зависимые от всех изменяемых подразделов —
    //    dedup по "section:sub|*", фильтр по присутствующим разделам и
    //    актуальной карте подразделов (паритет [18732–18744])
    const defsForCascade: SectionDefsForCascade = Object.fromEntries(
      infra.defs.map((d) => [d.key, { parts: d.parts }]),
    );
    const allChanged = [subsectionName, ...intraDependents];
    const presentSections = new Set(sectionOrder);
    const subsMap = await buildSubsectionMap(infra.p);
    const crossMap = new Map<string, CrossSectionDepDto>();
    for (const sub of allChanged) {
      for (const d of await getCrossSecDependents(
        sectionKey,
        sub,
        infra.resolvedDeps,
        defsForCascade,
      )) {
        if (!presentSections.has(d.section)) continue;
        if (
          d.subsection &&
          subsMap[d.section] &&
          !(subsMap[d.section] as string[]).includes(d.subsection)
        )
          continue;
        const k = d.section + ":" + (d.subsection ?? "*");
        if (!crossMap.has(k))
          crossMap.set(k, { section: d.section, subsection: d.subsection });
      }
    }

    // 3. Затронутые режимы (changedSections пуст — раздел целиком не меняется)
    const modes = await loadModesState(id);
    const affectedModes: AffectedModeDto[] = await getAffectedModes({
      modes,
      generationOrder: infra.p.generationOrder,
      sectionOrder,
      changedSections: [],
      changedSubsections: allChanged.map((s) => sectionKey + ":" + s),
    });

    // 4. Оценка стоимости подраздела (поставщики — как estimatePlanCost)
    let estimate: SubsectionImpactResponse["estimate"] = null;
    try {
      const def = infra.defs.find((d) => d.key === sectionKey);
      if (def?.parts) {
        const p = infra.p;
        const estimatorParams = {
          depth: p.depth,
          generationOrder: p.generationOrder,
          keepFullBudget: row.keepFullBudget,
        };
        const subSysChars = (await buildSYS(p, { outputMode: "subsection" }))
          .length;
        const baseStaticChars = hasConceptParticipants(p)
          ? (await baseCtxStatic(p)).length
          : (await baseCtx(p)).length;
        const actualOutputChars = await loadActualOutputChars(id);
        const est = await estimateSubsectionCost({
          sectionKey,
          subsectionName,
          parts: def.parts,
          params: estimatorParams,
          sysChars: subSysChars,
          baseStaticChars,
          effectiveDeps: infra.effectiveDeps,
          sectionOutputChars: actualOutputChars[sectionKey],
          actualOutputChars,
        });
        if (est)
          estimate = {
            cost: est.cost,
            inTokens: est.inTokens,
            outTokens: est.outTokens,
          };
      }
    } catch (err) {
      console.warn("[generation] subsection-impact estimate failed:", err);
    }

    const response: SubsectionImpactResponse = {
      intraDependents,
      crossDependents: [...crossMap.values()],
      affectedModes,
      estimate,
    };
    return c.json(response);
  } catch (err) {
    if (err instanceof GenerationError && err.code === "NOT_FOUND")
      return c.json({ error: "Синтез не найден", code: "NOT_FOUND" }, 404);
    console.error("[generation] subsection-impact:", err);
    return c.json({ error: "Внутренняя ошибка", code: "INTERNAL_ERROR" }, 500);
  }
});
