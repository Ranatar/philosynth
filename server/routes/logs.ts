/**
 * Роуты логов (беседа 2.4; 03-spec §2.12 + /logs/prompts из 07 2.4 —
 * в 03 §2.12 эндпоинт не числится, дыра доков в патч завершения).
 *
 *   GET /syntheses/:id/logs/generation → { entries: GenLogEntry[] }
 *   GET /syntheses/:id/logs/context    → { entries: CtxLogEntry[] }
 *   GET /syntheses/:id/logs/formatted  → { text, html }
 *   GET /syntheses/:id/logs/prompts    → { text: string | null }
 *
 * Решения:
 *  - Доступ (8.6 п.7): loadSynthesisForRead + гейт по effectiveFlags —
 *    viewer 'owner' → всегда, при любых флагах и ступени; 'user' →
 *    generation/context/formatted при действенном show_logs, prompts при
 *    действенном show_prompts, иначе 403 (на витрине оба погашены → 403);
 *    'guest' → 403 всегда (роуты и так под requireAuth, но гейт стоит —
 *    маршрут может открыться позже). Стоимость и токены (SynthesisFull)
 *    флагом не управляются — это про ЛОГИ.
 *  - /generation отдаёт ВСЕ строки, включая маркеры и служебную
 *    '_genCommon' — фильтрация за потребителем (лог-вьюер использует
 *    /formatted; сырой эндпоинт — отладочный, 03 §2.12).
 *  - /prompts: null при отсутствии записей-запросов (клиент показывает
 *    «Нет сохранённых промптов», как downloadPrompts [24119]); ответ —
 *    JSON { text }, файл собирает клиент (Blob, имя по docNum —
 *    паритет downloadPrompts).
 *  - Порядок строк — created_at asc (порядок массивов исходника).
 */
import { Hono } from "hono";

import { asc, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { contextLog, generationLog } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import {
  formatCtxLogHTML,
  formatPromptsForExport,
} from "../services/log-formatter.js";
import {
  forbiddenJson,
  loadSynthesisForRead,
  notFoundJson,
  type ReadAccess,
} from "./syntheses.js";
import { effectiveFlags } from "@philosynth/shared/utils/visibility";

import type {
  CtxLogEntry,
  GenLogEntry,
} from "@philosynth/shared/types/generation";

export const logsRoutes = new Hono<AuthEnv>();

/** 8.6 п.7: гейт логов по действенности флагов (ЕДИНАЯ функция для
 *  четырёх путей). kind 'logs' — generation/context/formatted (show_logs),
 *  'prompts' — дамп запросов (show_prompts). */
export function logsAllowed(
  res: Extract<ReadAccess, { access: "ok" }>,
  kind: "logs" | "prompts",
): boolean {
  if (res.viewer === "owner") return true;
  if (res.viewer === "guest") return false;
  const flags = effectiveFlags(res.row);
  return kind === "logs" ? flags.showLogs : flags.showPrompts;
}

const logsForbiddenJson = {
  error: "Автор не открыл лог генерации этой концепции",
  code: "FORBIDDEN",
} as const;
const promptsForbiddenJson = {
  error: "Автор не открыл тексты запросов этой концепции",
  code: "FORBIDDEN",
} as const;

/* ── GET /:id/logs/generation ────────────────────────────────────────── */

logsRoutes.get("/:id/logs/generation", requireAuth, async (c) => {
  const user = c.get("user");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  if (!logsAllowed(res, "logs")) return c.json(logsForbiddenJson, 403);

  const rows = await db
    .select()
    .from(generationLog)
    .where(eq(generationLog.synthesisId, res.row.id))
    .orderBy(asc(generationLog.createdAt));
  const entries: GenLogEntry[] = rows.map((r) => ({
    id: r.id,
    synthesisId: r.synthesisId,
    sectionKey: r.sectionKey,
    sectionLabel: r.sectionLabel,
    logType: r.logType,
    source: r.source,
    status: r.status,
    priorChars: r.priorChars,
    taskChars: r.taskChars,
    inputChars: r.inputChars,
    outputChars: r.outputChars,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: Number(r.costUsd),
    errorMessage: r.errorMessage,
    metadata: r.metadata,
    createdAt: r.createdAt.toISOString(),
  }));
  return c.json({ entries });
});

/* ── GET /:id/logs/context ───────────────────────────────────────────── */

logsRoutes.get("/:id/logs/context", requireAuth, async (c) => {
  const user = c.get("user");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  if (!logsAllowed(res, "logs")) return c.json(logsForbiddenJson, 403);

  const rows = await db
    .select()
    .from(contextLog)
    .where(eq(contextLog.synthesisId, res.row.id))
    .orderBy(asc(contextLog.createdAt));
  const entries: CtxLogEntry[] = rows.map((r) => ({
    id: r.id,
    synthesisId: r.synthesisId,
    sectionKey: r.sectionKey,
    budget: r.budget,
    totalUsed: r.totalUsed,
    reqFound: r.reqFound,
    reqTotal: r.reqTotal,
    optIncluded: r.optIncluded,
    optTotal: r.optTotal,
    budgetMode: r.budgetMode,
    parentOverhead: r.parentOverhead,
    parentSpec: r.parentSpec ?? null,
    entries: r.entries,
    createdAt: r.createdAt.toISOString(),
  }));
  return c.json({ entries });
});

/* ── GET /:id/logs/formatted ─────────────────────────────────────────── */

logsRoutes.get("/:id/logs/formatted", requireAuth, async (c) => {
  const user = c.get("user");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  if (!logsAllowed(res, "logs")) return c.json(logsForbiddenJson, 403);

  const { text, html } = await formatCtxLogHTML(res.row.id);
  return c.json({ text, html });
});

/* ── GET /:id/logs/prompts (07 2.4; в 03 §2.12 не числится) ──────────── */

logsRoutes.get("/:id/logs/prompts", requireAuth, async (c) => {
  const user = c.get("user");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  if (!logsAllowed(res, "prompts")) return c.json(promptsForbiddenJson, 403);

  const text = await formatPromptsForExport(res.row.id);
  return c.json({ text });
});
