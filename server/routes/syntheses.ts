/**
 * Роуты /syntheses (беседа 1.4, запрос 2; 03-spec §2.2).
 *
 * Пока ТОЛЬКО POST /syntheses: принимает параметры §2.2, валидирует,
 * создаёт запись syntheses + генеалогию synthesis_lineage (философы),
 * запускает генерацию В ФОНЕ и отвечает { id, status: "generating" } —
 * клиент подключается по WebSocket (subscribe_generation привяжет стрим,
 * но дельты и так идут по userId через connection-manager).
 *
 * Беседа 1.6 (транспорт чтения, сервер) добавила: GET / (список своих),
 * GET /public, GET /:id (SynthesisFull + pausedState + pauseEstimates),
 * PATCH /:id, DELETE /:id, POST /:id/duplicate; POST / заполняет doc_num
 * (формат исходника [12110]) и снимок structure_sections. Из роутов §2.2
 * не реализован только POST /syntheses/import — беседа 4.3.
 *
 * Решения:
 *  - v11: philosophers И participants опциональны; оба пусты — свободный
 *    синтез, обязателен seed (§2.2). participants типа "synthesis"
 *    (мета-синтез) — беседа 3.1: пока 422-подобный VALIDATION_ERROR,
 *    чтобы не создать запись, которую генератор не умеет наполнить.
 *  - sectionOrder = ["sum", ...sections] (sum всегда первый и всегда есть,
 *    как в исходнике; из p.sec он исключается генератором).
 *  - sectionContexts не персистятся до генерации (колонки нет): передаются
 *    в generateSynthesis(opts) и ложатся в sections.sec_context при
 *    upsert'е раздела (решение запроса 1).
 *  - Предпроверки (лимит 3, наличие API-ключа) — ДО создания строки
 *    (assertCanStartGeneration), чтобы не плодить вечно-generating записи;
 *    фоновый сбой старта после создания строки переводит её в 'error'
 *    и шлёт stream_error по WS.
 */
import { Hono } from "hono";

import { db } from "../db/index.js";
import { syntheses, synthesisLineage } from "../db/schema.js";
import {
  checkGenealogyOverlaps,
  loadConceptContext,
  unsuitableConceptMessage,
  validateConceptForMetaSynthesis,
  type OverlapParticipant,
} from "../services/meta-synthesis-service.js";
import { createLineageRecords } from "../services/lineage-service.js";
import { parentOverheadForSection } from "../services/context-builder.js";
import { normalizeSectionKey } from "../services/parent-context.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import {
  assertCanStartGeneration,
  generateSynthesis,
  GenerationError,
  isGenerationActive,
} from "../services/generation-service.js";
import {
  buildSectionDefs,
  groupPasses,
  patchPromptsWithSecCtx,
  SEC_NAMES,
} from "../services/section-defs-builder.js";
import {
  baseCtx,
  baseCtxStatic,
  buildSYS,
  hasConceptParticipants,
} from "../services/prompt-builder.js";
import { estimateCost } from "../services/cost-estimator.js";
import {
  computeSectionAdvice,
  getCompatEntryByKey,
  iconForSeverity,
  titleForSeverity,
  type SectionAdviceInput,
} from "../services/compat-advisor.js";
import {
  buildEffectiveDeps,
  resolveContextDeps,
} from "../services/synthesis-engine.js";
import { buildDynamicOrder } from "../utils/topo-sort.js";
import { connectionManager } from "../ws/connection-manager.js";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
} from "drizzle-orm";

import {
  categories,
  categoryEdges,
  clusterLabels,
  dialogueTurns,
  glossaryTerms,
  sections,
  theses,
} from "../db/schema.js";
import {
  computePauseEstimates,
} from "../services/pause-resume-service.js";
import type {
  PausedState,
  SynthesisFull,
  SynthesisPreview,
} from "@philosynth/shared/types/synthesis";
import type { PauseEstimates } from "@philosynth/shared/types/ws-messages";

/* ── Допустимые значения (зеркало enum'ов схемы 02) ──────────────────── */

const METHODS = new Set([
  "dialectical",
  "integrative",
  "deconstructive",
  "hermeneutical",
  "analytical",
  "creative",
]);
const SYNTH_LEVELS = new Set(["comparative", "transformative", "generative"]);
const DEPTHS = new Set(["overview", "standard", "deep", "exhaustive"]);
const GENERATION_ORDERS = new Set(["architectural", "genetic"]);

interface PostBody {
  seed?: unknown;
  philosophers?: unknown;
  sections?: unknown;
  method?: unknown;
  depth?: unknown;
  synthLevel?: unknown;
  generationOrder?: unknown;
  extGraphMetrics?: unknown;
  keepFullBudget?: unknown;
  context?: unknown;
  sectionContexts?: unknown;
  lang?: unknown;
  participants?: unknown;
}

const isStrArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/* ── Helpers беседы 1.6 (транспорт чтения) ───────────────────────────── */

/**
 * Номер документа — формат исходника [12110]:
 * "PS-" + rand(1000..9999) + "-" + Date.now().toString(36).toUpperCase().slice(-4)
 */
export function makeDocNum(): string {
  return (
    "PS-" +
    Math.floor(Math.random() * 9000 + 1000) +
    "-" +
    Date.now().toString(36).toUpperCase().slice(-4)
  );
}

/** Невалидный UUID до запроса к PG (иначе 22P02) → трактуем как 404. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string): boolean => UUID_RE.test(v);

/** Строка syntheses целиком (типизированный select * ). */
type SynthesisRow = typeof syntheses.$inferSelect;

/**
 * Загрузка синтеза + проверка доступа на ЧТЕНИЕ (решение аудита
 * 2026-07-30): владелец ИЛИ is_public = true; несуществующий/невалидный
 * id → 'notfound', чужой непубличный → 'forbidden'.
 * Используется и роутами sections.ts / elements.ts (беседа 1.6).
 */
export async function loadSynthesisForRead(
  id: string,
  userId: string,
): Promise<
  | { access: "ok"; row: SynthesisRow }
  | { access: "notfound" }
  | { access: "forbidden" }
> {
  if (!isUuid(id)) return { access: "notfound" };
  const [row] = await db
    .select()
    .from(syntheses)
    .where(eq(syntheses.id, id))
    .limit(1);
  if (!row) return { access: "notfound" };
  if (row.userId !== userId && !row.isPublic) return { access: "forbidden" };
  return { access: "ok", row };
}

/** Единые JSON-ответы отказа доступа (03 §4.3). */
export const notFoundJson = {
  error: "Синтез не найден",
  code: "NOT_FOUND",
} as const;
export const forbiddenJson = {
  error: "Нет доступа к синтезу",
  code: "FORBIDDEN",
} as const;

/** Превью капсулы для карточки каталога: HTML → плоский текст, 200 симв. */
function capsulePreviewOf(capsuleHtml: string): string {
  return capsuleHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Философы-родители по списку синтезов (для превью каталога;
 *  экспорт — для /lineage/search, беседа 3.1). */
export async function loadPhilosophersFor(
  ids: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({
      synthesisId: synthesisLineage.synthesisId,
      parentName: synthesisLineage.parentName,
    })
    .from(synthesisLineage)
    .where(
      and(
        inArray(synthesisLineage.synthesisId, ids),
        eq(synthesisLineage.parentType, "philosopher"),
      ),
    )
    .orderBy(asc(synthesisLineage.position));
  for (const r of rows) {
    if (!r.parentName) continue;
    const list = map.get(r.synthesisId) ?? [];
    list.push(r.parentName);
    map.set(r.synthesisId, list);
  }
  return map;
}

/** Синтезы из списка, у которых есть родители-концепции
 *  (parent_type='synthesis') — признак «мета-синтез» для бейджа карточки
 *  каталога (беседа 3.2, п. 5; аддитивная правка транспорта — дыра доков:
 *  SynthesisPreview признака не нёс). Экспорт — для /lineage/search. */
export async function loadConceptParentFlags(
  ids: string[],
): Promise<Set<string>> {
  const flags = new Set<string>();
  if (ids.length === 0) return flags;
  const rows = await db
    .select({ synthesisId: synthesisLineage.synthesisId })
    .from(synthesisLineage)
    .where(
      and(
        inArray(synthesisLineage.synthesisId, ids),
        eq(synthesisLineage.parentType, "synthesis"),
      ),
    );
  for (const r of rows) flags.add(r.synthesisId);
  return flags;
}

/** Экспорт — для /lineage/search (беседа 3.1). Третий параметр — признак
 *  родителей-концепций (беседа 3.2; loadConceptParentFlags). */
export function toPreview(
  row: SynthesisRow,
  philosophers: string[],
  hasConceptParents = false,
): SynthesisPreview {
  return {
    id: row.id,
    title: row.title,
    method: row.method,
    synthLevel: row.synthLevel,
    depth: row.depth,
    status: row.status,
    isPublic: row.isPublic,
    philosophers,
    hasConceptParents,
    capsulePreview: capsulePreviewOf(row.capsuleHtml),
    totalCostUsd: Number.parseFloat(row.totalCostUsd ?? "0") || 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * SynthesisFull (03 §2.2): строка + генеалогия + pauseEstimates.
 * Оценки паузы — только для kind='gen' (computePauseEstimates, 1.4b,
 * fail-open {}); kind='plan' → {}; pausedState=null → null.
 */
async function buildSynthesisFull(
  row: SynthesisRow,
  viewerUserId: string,
): Promise<SynthesisFull> {
  const lineageRows = await db
    .select()
    .from(synthesisLineage)
    .where(eq(synthesisLineage.synthesisId, row.id))
    .orderBy(asc(synthesisLineage.position));

  const philosophers = lineageRows
    .filter((r) => r.parentType === "philosopher" && r.parentName)
    .map((r) => r.parentName as string);

  const parentIds = lineageRows
    .filter((r) => r.parentType === "synthesis" && r.parentSynthesisId)
    .map((r) => r.parentSynthesisId as string);
  const parentSyntheses =
    parentIds.length > 0
      ? (
          await db
            .select({ id: syntheses.id, title: syntheses.title })
            .from(syntheses)
            .where(inArray(syntheses.id, parentIds))
        ).sort((a, b) => parentIds.indexOf(a.id) - parentIds.indexOf(b.id))
      : [];

  const childSyntheses = await db
    .select({ id: syntheses.id, title: syntheses.title })
    .from(syntheses)
    .where(
      exists(
        db
          .select({ one: synthesisLineage.id })
          .from(synthesisLineage)
          .where(
            and(
              eq(synthesisLineage.parentSynthesisId, row.id),
              eq(synthesisLineage.synthesisId, syntheses.id),
            ),
          ),
      ),
    );

  const ps = (row.pausedState ?? null) as PausedState | null;
  let pauseEstimates: PauseEstimates | null = null;
  if (ps) {
    pauseEstimates =
      ps.kind === "gen" ? await computePauseEstimates(row.id, ps) : {};
  }

  return {
    id: row.id,
    title: row.title,
    seed: row.seed,
    method: row.method,
    synthLevel: row.synthLevel,
    depth: row.depth,
    generationOrder: row.generationOrder,
    extGraphMetrics: row.extGraphMetrics,
    context: row.context,
    lang: row.lang,
    status: row.status,
    keepFullBudget: row.keepFullBudget,
    parentContextSchema:
      row.parentContextSchema as SynthesisFull["parentContextSchema"],
    pausedState: ps,
    pauseEstimates,
    isPublic: row.isPublic,
    // Беседа 5.2 («По факту 5.2»): признак владения для клиентских гейтов
    // (✎ редактора, «Изменить», режимы). Именно флаг, а не userId — у
    // публичного синтеза id владельца читателю не раскрывается.
    isOwner: row.userId === viewerUserId,
    docNum: row.docNum,
    sectionOrder: row.sectionOrder,
    version: {
      base: row.versionBase,
      sub: row.versionSub,
      modes: row.versionModes,
      modeRegen: row.versionModeRegen,
    },
    structureSections: row.structureSections ?? null,
    capsuleHtml: row.capsuleHtml,
    totalInputTokens: row.totalInputTokens,
    totalOutputTokens: row.totalOutputTokens,
    totalCostUsd: Number.parseFloat(row.totalCostUsd ?? "0") || 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    philosophers,
    parentSyntheses,
    childSyntheses,
  };
}

export const synthesesRoutes = new Hono<AuthEnv>();

synthesesRoutes.post("/", requireAuth, async (c) => {
  const user = c.get("user");

  let body: PostBody;
  try {
    body = (await c.req.json()) as PostBody;
  } catch {
    return c.json(
      { error: "Невалидный JSON", code: "VALIDATION_ERROR" },
      400,
    );
  }

  /* ── Валидация §2.2 ── */
  const details: Record<string, string> = {};

  const seed = typeof body.seed === "string" ? body.seed.trim() : "";
  const philosophers = isStrArray(body.philosophers)
    ? body.philosophers.map((p) => p.trim()).filter(Boolean)
    : body.philosophers === undefined
      ? []
      : null;
  if (philosophers === null) details.philosophers = "массив строк";

  // v11: participants (мета-синтез) — тип "synthesis" ПРИНИМАЕТСЯ
  // (беседа 3.1: серверная половина снятия гейта 1.5b; клиент — 3.2).
  let participantPhilosophers: string[] = [];
  const conceptIds: string[] = [];
  if (body.participants !== undefined) {
    if (!Array.isArray(body.participants)) {
      details.participants = "массив ParticipantInput";
    } else {
      for (const p of body.participants as Array<Record<string, unknown>>) {
        if (p && p.type === "philosopher" && typeof p.name === "string") {
          participantPhilosophers.push(p.name.trim());
        } else if (p && p.type === "synthesis") {
          if (typeof p.synthesisId !== "string" || !isUuid(p.synthesisId)) {
            details.participants =
              "участник synthesis требует synthesisId (UUID)";
            break;
          }
          conceptIds.push(p.synthesisId);
        } else {
          details.participants =
            "элементы {type:'philosopher', name} | {type:'synthesis', synthesisId}";
          break;
        }
      }
    }
  }
  participantPhilosophers = participantPhilosophers.filter(Boolean);
  const allPhilosophers = [
    ...new Set([...(philosophers ?? []), ...participantPhilosophers]),
  ];

  // v11: оба списка пусты — свободный синтез, обязателен seed.
  // Код ошибки — по 03 §4.3: NO_PARTICIPANTS_SEED_REQUIRED (беседа 1.5:
  // до неё роут отдавал общий VALIDATION_ERROR — код приведён к спеке)
  let noParticipantsSeedMissing = false;
  if (allPhilosophers.length === 0 && conceptIds.length === 0 && !seed) {
    noParticipantsSeedMissing = true;
    details.seed = "обязателен при пустых philosophers/participants";
  }

  const knownSections = new Set(Object.keys(SEC_NAMES));
  let sections: string[] = [];
  if (!isStrArray(body.sections)) {
    details.sections = "массив ключей разделов";
  } else {
    sections = [...new Set(body.sections.filter((s) => s !== "sum"))];
    const unknown = sections.filter((s) => !knownSections.has(s));
    if (unknown.length > 0) {
      details.sections = `неизвестные разделы: ${unknown.join(", ")}`;
    }
  }

  const method = (body.method ?? "dialectical") as string;
  if (!METHODS.has(method)) details.method = "неизвестный метод";
  const synthLevel = (body.synthLevel ?? "comparative") as string;
  if (!SYNTH_LEVELS.has(synthLevel)) details.synthLevel = "неизвестный уровень";
  const depth = (body.depth ?? "standard") as string;
  if (!DEPTHS.has(depth)) details.depth = "неизвестная глубина";
  const generationOrder = (body.generationOrder ?? "architectural") as string;
  if (!GENERATION_ORDERS.has(generationOrder))
    details.generationOrder = "architectural | genetic";

  let sectionContexts: Record<string, string> | undefined;
  if (body.sectionContexts !== undefined) {
    if (
      typeof body.sectionContexts !== "object" ||
      body.sectionContexts === null ||
      Array.isArray(body.sectionContexts) ||
      !Object.values(body.sectionContexts).every((v) => typeof v === "string")
    ) {
      details.sectionContexts = "Record<string, string>";
    } else {
      sectionContexts = body.sectionContexts as Record<string, string>;
    }
  }

  if (Object.keys(details).length > 0) {
    return c.json(
      {
        error: "Невалидные параметры синтеза",
        code: noParticipantsSeedMissing
          ? "NO_PARTICIPANTS_SEED_REQUIRED"
          : "VALIDATION_ERROR",
        details,
      },
      400,
    );
  }

  /* ── Участники-концепции (беседа 3.1; M1–M3 §1.6): доступ (владелец
        ИЛИ публичный — паритет каталога) и пригодность
        (validateConceptForMetaSynthesis: sum/glossary/theses/critique,
        graph|dialogue, capsule). Дубликаты id отклоняются. ── */
  const overlapParticipants: OverlapParticipant[] = allPhilosophers.map(
    (name) => ({ type: "philosopher", name }),
  );
  if (conceptIds.length > 0) {
    if (new Set(conceptIds).size !== conceptIds.length) {
      return c.json(
        {
          error: "Невалидные параметры синтеза",
          code: "VALIDATION_ERROR",
          details: { participants: "участники-концепции не должны повторяться" },
        },
        400,
      );
    }
    for (const cid of conceptIds) {
      const access = await loadSynthesisForRead(cid, user.id);
      if (access.access === "notfound") {
        return c.json(
          {
            error: "Невалидные параметры синтеза",
            code: "VALIDATION_ERROR",
            details: { participants: `концепция ${cid} не найдена` },
          },
          400,
        );
      }
      if (access.access === "forbidden") {
        return c.json(
          {
            error: "Нет доступа к концепции-участнику",
            code: "FORBIDDEN",
            details: { participants: cid },
          },
          403,
        );
      }
      const check = await validateConceptForMetaSynthesis(cid);
      if (!check.valid) {
        return c.json(
          {
            error: "Концепция-участник непригодна для мета-синтеза",
            code: "VALIDATION_ERROR",
            details: {
              participants: unsuitableConceptMessage(
                access.row.title,
                check.missing,
              ),
              missing: check.missing.join(", "),
            },
          },
          400,
        );
      }
      overlapParticipants.push({
        type: "synthesis",
        synthesisId: cid,
        name: access.row.title,
      });
    }
  }
  // M3: генеалогические пересечения — НЕ блокируют (confirm исходника
  // [22052] жил на клиенте); предупреждения уходят в ответ POST
  // (аддитивное поле warnings — дыра 03 §2.2, в патч доков).
  const genealogyWarnings =
    conceptIds.length > 0 ? await checkGenealogyOverlaps(overlapParticipants) : [];

  /* ── Предпроверки старта ДО создания строки ── */
  try {
    assertCanStartGeneration(user.id);
  } catch (err) {
    if (err instanceof GenerationError) {
      const status = err.code === "RATE_LIMIT" ? 429 : 400;
      return c.json({ error: err.message, code: err.code }, status);
    }
    throw err;
  }

  /* ── Создание записи + генеалогия ── */
  const [row] = await db
    .insert(syntheses)
    .values({
      userId: user.id,
      seed,
      method: method as (typeof syntheses.$inferInsert)["method"],
      synthLevel: synthLevel as (typeof syntheses.$inferInsert)["synthLevel"],
      depth: depth as (typeof syntheses.$inferInsert)["depth"],
      generationOrder:
        generationOrder as (typeof syntheses.$inferInsert)["generationOrder"],
      extGraphMetrics: body.extGraphMetrics === true,
      keepFullBudget: body.keepFullBudget === true,
      context: typeof body.context === "string" ? body.context : "",
      ...(typeof body.lang === "string" && body.lang.trim()
        ? { lang: body.lang.trim() }
        : {}),
      sectionOrder: ["sum", ...sections],
      // Пункт 4 запроса 1.6: doc_num по формату исходника [12110]
      docNum: makeDocNum(),
      // Пункт 6 запроса 1.6: снимок структуры документа при создании —
      // без него карточка «Структура документа устарела» (беседа 2.3)
      // всегда в ветке «актуальность не определена». Обновление снимка
      // после исполнения плана — беседа 2.2.
      structureSections: ["sum", ...sections],
      status: "generating",
    })
    .returning({ id: syntheses.id });
  const synthesisId = (row as { id: string }).id;

  // Генеалогия: философы, затем концепции (сквозные позиции) —
  // createLineageRecords (lineage-service, беседа 3.1)
  await createLineageRecords(synthesisId, [
    ...allPhilosophers.map((name) => ({
      type: "philosopher" as const,
      name,
    })),
    ...conceptIds.map((cid) => ({
      type: "synthesis" as const,
      synthesisId: cid,
    })),
  ]);

  /* ── Запуск генерации в фоне (§2.2: «Генерация начинается, клиент
        подключается по WebSocket») ── */
  void generateSynthesis(synthesisId, user.id, { sectionContexts }).catch(
    async (err) => {
      const message =
        err instanceof Error ? err.message : "Не удалось запустить генерацию";
      const code = err instanceof GenerationError ? err.code : "INTERNAL_ERROR";
      console.error(`[syntheses] generateSynthesis(${synthesisId}):`, err);
      // Пред-цикловый сбой: строка не должна висеть в 'generating'
      await db
        .update(syntheses)
        .set({ status: "error", updatedAt: new Date() })
        .where(eq(syntheses.id, synthesisId))
        .catch(() => {});
      connectionManager.sendToUser(user.id, {
        type: "stream_error",
        synthesisId,
        error: `${message} (${code})`,
        recoverable: false,
      });
    },
  );

  return c.json(
    {
      id: synthesisId,
      status: "generating" as const,
      // Беседа 3.1 (M3): неблокирующие предупреждения генеалогических
      // пересечений — аддитивно к контракту §2.2 (в патч доков)
      ...(genealogyWarnings.length > 0 ? { warnings: genealogyWarnings } : {}),
    },
    201,
  );
});

/* ── POST /syntheses/advice (беседа 1.5; Advisor v2 + Section Dependency
      Warnings, 01 §4.15 п.1–2) ─────────────────────────────────────────────
   Данные для панели совместимости и трёх боксов предупреждений формы:
   getCompatEntryByKey(`{level}:{method}`) + computeSectionAdvice (1.1).
   icon/title считаются здесь же (iconForSeverity/titleForSeverity —
   серверные экспорты 1.1; отдаются в ответе, чтобы клиент не зеркалил
   словари); CSS-классы чипов (chipClassForRating) — на клиенте, как
   зафиксировано в NEXT-CONTEXT (глава 1.1, «Беседа 1.5»).

   ДЫРА ДОКОВ (в один патч с /estimate): эндпоинта нет в 03 §2.2. */

synthesesRoutes.post("/advice", requireAuth, async (c) => {
  let body: PostBody;
  try {
    body = (await c.req.json()) as PostBody;
  } catch {
    return c.json({ error: "Невалидный JSON", code: "VALIDATION_ERROR" }, 400);
  }

  const details: Record<string, string> = {};
  const method = (body.method ?? "dialectical") as string;
  if (!METHODS.has(method)) details.method = "неизвестный метод";
  const synthLevel = (body.synthLevel ?? "comparative") as string;
  if (!SYNTH_LEVELS.has(synthLevel)) details.synthLevel = "неизвестный уровень";
  const generationOrder = (body.generationOrder ?? "architectural") as string;
  if (!GENERATION_ORDERS.has(generationOrder))
    details.generationOrder = "architectural | genetic";
  const knownSections = new Set(Object.keys(SEC_NAMES));
  const sections = isStrArray(body.sections)
    ? [...new Set(body.sections.filter((s) => s !== "sum"))]
    : null;
  if (sections === null || sections.some((s) => !knownSections.has(s))) {
    details.sections = "массив известных ключей разделов";
  }
  if (Object.keys(details).length > 0) {
    return c.json(
      { error: "Невалидные параметры", code: "VALIDATION_ERROR", details },
      400,
    );
  }

  try {
    const entry = await getCompatEntryByKey(`${synthLevel}:${method}`);
    const advice = await computeSectionAdvice({
      sections: sections as string[],
      method: method as SectionAdviceInput["method"],
      synthLevel: synthLevel as SectionAdviceInput["synthLevel"],
      generationOrder: generationOrder as SectionAdviceInput["generationOrder"],
    });
    return c.json({
      entry: entry
        ? {
            ...entry,
            icon: iconForSeverity(entry.severity),
            title: titleForSeverity(entry.severity),
          }
        : null,
      advice,
    });
  } catch (err) {
    console.warn("[syntheses] advice failed:", err);
    return c.json(
      { error: "Анализ совместимости недоступен", code: "INTERNAL_ERROR" },
      500,
    );
  }
});

/* ── POST /syntheses/estimate (беседа 1.5; G3 «Оценка стоимости до
      генерации») ──────────────────────────────────────────────────────────
   Принимает те же параметры, что POST /syntheses, но НЕ создаёт записей и
   не запускает генерацию: зеркалит конвейер generation-service
   (resolveContextDeps → buildEffectiveDeps → buildDynamicOrder →
   buildSectionDefs → groupPasses → buildSYS/baseCtxStatic) и возвращает
   результат estimateCost. Потребитель — CostEstimate.tsx.

   ДЫРА ДОКОВ (закрыть патчем в завершение беседы 1.5): эндпоинта нет в
   03-spec §2.2, хотя требование G3 (§1.3) предписывает серверную оценку;
   протокол 07 (беседа 1.5, п. 5) допускает «estimateCost на сервере». */

synthesesRoutes.post("/estimate", requireAuth, async (c) => {
  const user = c.get("user");
  let body: PostBody;
  try {
    body = (await c.req.json()) as PostBody;
  } catch {
    return c.json({ error: "Невалидный JSON", code: "VALIDATION_ERROR" }, 400);
  }

  const details: Record<string, string> = {};

  const seed = typeof body.seed === "string" ? body.seed.trim() : "";
  const phil = isStrArray(body.philosophers)
    ? body.philosophers.map((s) => s.trim()).filter(Boolean)
    : [];
  // Участники-концепции принимаются (беседа 3.1) — данные для
  // estimate-diff FullBudgetPreview: клиент зовёт /estimate с концепциями
  // и без, разницу рисует беседа 3.2. Недоступные/несуществующие id для
  // оценки молча пропускаются (оценка — вспомогательная, не гейт).
  const participantPhilosophers: string[] = [];
  const estimateConceptIds: string[] = [];
  if (Array.isArray(body.participants)) {
    for (const p of body.participants as Array<Record<string, unknown>>) {
      if (p && p.type === "philosopher" && typeof p.name === "string") {
        participantPhilosophers.push(p.name.trim());
      } else if (
        p &&
        p.type === "synthesis" &&
        typeof p.synthesisId === "string" &&
        isUuid(p.synthesisId)
      ) {
        estimateConceptIds.push(p.synthesisId);
      }
    }
  }
  const allPhil = [
    ...new Set([...phil, ...participantPhilosophers.filter(Boolean)]),
  ];

  const knownSections = new Set(Object.keys(SEC_NAMES));
  let sections: string[] = [];
  if (isStrArray(body.sections)) {
    sections = [...new Set(body.sections.filter((s) => s !== "sum"))];
    if (sections.some((s) => !knownSections.has(s))) {
      details.sections = "неизвестные разделы";
    }
  } else {
    details.sections = "массив ключей разделов";
  }

  const method = (body.method ?? "dialectical") as string;
  if (!METHODS.has(method)) details.method = "неизвестный метод";
  const synthLevel = (body.synthLevel ?? "comparative") as string;
  if (!SYNTH_LEVELS.has(synthLevel)) details.synthLevel = "неизвестный уровень";
  const depth = (body.depth ?? "standard") as string;
  if (!DEPTHS.has(depth)) details.depth = "неизвестная глубина";
  const generationOrder = (body.generationOrder ?? "architectural") as string;
  if (!GENERATION_ORDERS.has(generationOrder))
    details.generationOrder = "architectural | genetic";

  if (Object.keys(details).length > 0) {
    return c.json(
      { error: "Невалидные параметры оценки", code: "VALIDATION_ERROR", details },
      400,
    );
  }

  const secCtx =
    body.sectionContexts &&
    typeof body.sectionContexts === "object" &&
    !Array.isArray(body.sectionContexts)
      ? (body.sectionContexts as Record<string, string>)
      : undefined;

  // Участники-концепции с полями (для веса родителей в оценке)
  const estimateConcepts = [];
  for (const cid of [...new Set(estimateConceptIds)]) {
    const access = await loadSynthesisForRead(cid, user.id);
    if (access.access !== "ok") continue; // см. комментарий выше
    try {
      estimateConcepts.push(await loadConceptContext(cid));
    } catch (err) {
      console.warn("[syntheses] estimate: loadConceptContext:", err);
    }
  }

  // Конвейер 1.1/1.2 — как runGenerationPasses [12078–12183], без БД-записей
  const p = {
    seed,
    phil: allPhil,
    participants: [
      ...allPhil.map((name) => ({
        type: "philosopher" as const,
        name,
      })),
      ...estimateConcepts,
    ],
    isMetaSynthesis: estimateConcepts.length > 0,
    sec: sections,
    method: method as Parameters<typeof buildSectionDefs>[0]["method"],
    synthLevel:
      synthLevel as Parameters<typeof buildSectionDefs>[0]["synthLevel"],
    depth: depth as Parameters<typeof buildSectionDefs>[0]["depth"],
    generationOrder:
      generationOrder as Parameters<
        typeof buildSectionDefs
      >[0]["generationOrder"],
    extGraphMetrics: body.extGraphMetrics === true,
    ctx: typeof body.context === "string" ? body.context : "",
    lang: typeof body.lang === "string" && body.lang.trim() ? body.lang : "Russian",
    keepFullBudget: body.keepFullBudget === true,
  };

  try {
    const resolvedDeps = await resolveContextDeps(p);
    const effectiveDeps = await buildEffectiveDeps(
      p.sec,
      resolvedDeps,
      p.generationOrder,
    );
    const dynamicOrder = buildDynamicOrder(
      effectiveDeps,
      p.sec,
      resolvedDeps,
      p.generationOrder,
    );
    p.sec = dynamicOrder.filter((k) => k !== "sum");

    const baseDefs = await buildSectionDefs(p);
    patchPromptsWithSecCtx(baseDefs, secCtx);
    const defsMap = new Map(baseDefs.map((d) => [d.key, d]));
    const defs = dynamicOrder
      .map((key) => defsMap.get(key))
      .filter((d): d is NonNullable<typeof d> => d !== undefined);
    const passes = groupPasses(defs);

    const SYS = await buildSYS(p);
    // Ориентир 1.1: baseCtxStatic при концепциях-участниках, иначе полный
    // baseCtx (с 3.1 ветки различаются: родителей считает
    // parentOverheadForSection ниже, а не baseCtx)
    const baseStatic = hasConceptParticipants(p)
      ? await baseCtxStatic(p)
      : await baseCtx(p);

    // 3.1: вес родительского контекста по разделам (01 §4.13 ч. II) —
    // предвычисляем (estimateCost ждёт синхронный колбэк)
    const overheadBySection: Record<string, number> = {};
    if (estimateConcepts.length > 0) {
      for (const key of dynamicOrder) {
        overheadBySection[key] = await parentOverheadForSection(
          estimateConcepts,
          key,
          p.generationOrder,
          p.synthLevel,
          p.method,
        );
      }
    }

    const est = await estimateCost({
      params: {
        depth: p.depth,
        generationOrder: p.generationOrder,
        keepFullBudget: p.keepFullBudget,
      },
      passes: passes.map((pass) =>
        pass.map((d) => ({ key: d.key, prompt: d.prompt, title: d.title })),
      ),
      effectiveDeps,
      sysChars: SYS.length,
      baseStaticChars: baseStatic.length,
      parentOverheadForSection: (sectionKey) =>
        overheadBySection[normalizeSectionKey(sectionKey)] ?? 0,
    });

    return c.json({ estimate: est });
  } catch (err) {
    // Оценка — вспомогательная: сбой Registry/конфигов не должен ронять форму
    console.warn("[syntheses] estimate failed:", err);
    return c.json(
      { error: "Оценка стоимости недоступна", code: "INTERNAL_ERROR" },
      500,
    );
  }
});

/* ═══ Беседа 1.6: транспорт чтения (03 §2.2) ═══════════════════════════
   Порядок регистрации важен: GET /public — ДО GET /:id (оба матчат
   GET /syntheses/public; Hono отдаёт приоритет более раннему). */

const SORT_COLUMNS = {
  createdAt: syntheses.createdAt,
  updatedAt: syntheses.updatedAt,
  title: syntheses.title,
  method: syntheses.method,
  status: syntheses.status,
} as const;
type SortKey = keyof typeof SORT_COLUMNS;

/** Общий разбор query-параметров списков (страница/лимит/сортировка). */
function parseListQuery(q: Record<string, string | undefined>): {
  page: number;
  limit: number;
  sortKey: SortKey;
  orderDesc: boolean;
} {
  const pageRaw = Number.parseInt(q.page ?? "1", 10);
  const limitRaw = Number.parseInt(q.limit ?? "20", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const limit =
    Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(limitRaw, 100) : 20;
  const sortKey: SortKey =
    q.sort && q.sort in SORT_COLUMNS ? (q.sort as SortKey) : "createdAt";
  const orderDesc = (q.order ?? "desc") !== "asc";
  return { page, limit, sortKey, orderDesc };
}

/* ── GET /syntheses — список своих (C1) ──────────────────────────────── */

synthesesRoutes.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const q = c.req.query();
  const { page, limit, sortKey, orderDesc } = parseListQuery(q);

  const conds = [eq(syntheses.userId, user.id)];
  if (q.status) {
    if (
      !["draft", "generating", "paused", "ready", "error"].includes(q.status)
    ) {
      return c.json(
        {
          error: "Невалидные параметры",
          code: "VALIDATION_ERROR",
          details: { status: "draft|generating|paused|ready|error" },
        },
        400,
      );
    }
    conds.push(eq(syntheses.status, q.status as SynthesisRow["status"]));
  }
  if (q.method) {
    if (!METHODS.has(q.method)) {
      return c.json(
        {
          error: "Невалидные параметры",
          code: "VALIDATION_ERROR",
          details: { method: "неизвестный метод" },
        },
        400,
      );
    }
    conds.push(eq(syntheses.method, q.method as SynthesisRow["method"]));
  }
  if (q.search) {
    // Поиск серверный (решение аудита 2026-07-30): частичное совпадение
    // title; в схеме под это gin_trgm_ops (ILIKE '%…%' использует индекс)
    conds.push(ilike(syntheses.title, `%${q.search}%`));
  }
  const where = and(...conds);

  const sortCol = SORT_COLUMNS[sortKey];
  const rows = await db
    .select()
    .from(syntheses)
    .where(where)
    .orderBy(orderDesc ? desc(sortCol) : asc(sortCol))
    .limit(limit)
    .offset((page - 1) * limit);
  const [totalRow] = await db
    .select({ value: count() })
    .from(syntheses)
    .where(where);
  const total = Number(totalRow?.value ?? 0);

  const ids = rows.map((r) => r.id);
  const philMap = await loadPhilosophersFor(ids);
  const metaFlags = await loadConceptParentFlags(ids); // беседа 3.2
  const items = rows.map((r) =>
    toPreview(r, philMap.get(r.id) ?? [], metaFlags.has(r.id)),
  );
  return c.json({ items, total });
});

/* ── GET /syntheses/public — публичный каталог (C2) ──────────────────── */

synthesesRoutes.get("/public", requireAuth, async (c) => {
  const q = c.req.query();
  const { page, limit, sortKey, orderDesc } = parseListQuery(q);

  const conds = [eq(syntheses.isPublic, true)];
  if (q.search) conds.push(ilike(syntheses.title, `%${q.search}%`));
  if (q.philosopher) {
    // Точное имя философа в генеалогии (как в §2.8 lineage/search)
    conds.push(
      exists(
        db
          .select({ one: synthesisLineage.id })
          .from(synthesisLineage)
          .where(
            and(
              eq(synthesisLineage.synthesisId, syntheses.id),
              eq(synthesisLineage.parentType, "philosopher"),
              eq(synthesisLineage.parentName, q.philosopher),
            ),
          ),
      ),
    );
  }
  const where = and(...conds);

  const sortCol = SORT_COLUMNS[sortKey];
  const rows = await db
    .select()
    .from(syntheses)
    .where(where)
    .orderBy(orderDesc ? desc(sortCol) : asc(sortCol))
    .limit(limit)
    .offset((page - 1) * limit);
  const [totalRow] = await db
    .select({ value: count() })
    .from(syntheses)
    .where(where);
  const total = Number(totalRow?.value ?? 0);

  const ids = rows.map((r) => r.id);
  const philMap = await loadPhilosophersFor(ids);
  const metaFlags = await loadConceptParentFlags(ids); // беседа 3.2
  const items = rows.map((r) =>
    toPreview(r, philMap.get(r.id) ?? [], metaFlags.has(r.id)),
  );
  return c.json({ items, total });
});

/* ── GET /syntheses/:id — SynthesisFull (владелец ИЛИ публичный) ─────── */

synthesesRoutes.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  return c.json({ synthesis: await buildSynthesisFull(res.row, user.id) });
});

/* ── PATCH /syntheses/:id { title?, isPublic?, extGraphMetrics? } ────── */
/* Только владелец. extGraphMetrics добавлен беседой 2.3: чекбокс
 * «Расширенные характеристики» на карточке графа в EditModal пишет тот же
 * флаг, что читает перегенерация (исходник писал DOC_STATE.params напрямую
 * [18475]; транспорта для этого поля до 2.3 не было — дыра доков). */

synthesesRoutes.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!isUuid(id)) return c.json(notFoundJson, 404);

  let body: { title?: unknown; isPublic?: unknown; extGraphMetrics?: unknown };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Невалидный JSON", code: "VALIDATION_ERROR" }, 400);
  }

  const details: Record<string, string> = {};
  const patch: Partial<typeof syntheses.$inferInsert> = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      details.title = "непустая строка";
    } else if (body.title.trim().length > 300) {
      details.title = "не длиннее 300 символов";
    } else {
      patch.title = body.title.trim();
    }
  }
  if (body.isPublic !== undefined) {
    if (typeof body.isPublic !== "boolean") details.isPublic = "boolean";
    else patch.isPublic = body.isPublic;
  }
  if (body.extGraphMetrics !== undefined) {
    if (typeof body.extGraphMetrics !== "boolean")
      details.extGraphMetrics = "boolean";
    else patch.extGraphMetrics = body.extGraphMetrics;
  }
  if (Object.keys(details).length > 0) {
    return c.json(
      { error: "Невалидные параметры", code: "VALIDATION_ERROR", details },
      400,
    );
  }
  if (Object.keys(patch).length === 0) {
    return c.json(
      {
        error: "Нужно хотя бы одно из полей title, isPublic, extGraphMetrics",
        code: "VALIDATION_ERROR",
        details: { body: "title? | isPublic? | extGraphMetrics?" },
      },
      400,
    );
  }

  const [row] = await db
    .select()
    .from(syntheses)
    .where(eq(syntheses.id, id))
    .limit(1);
  if (!row) return c.json(notFoundJson, 404);
  if (row.userId !== user.id) return c.json(forbiddenJson, 403);

  const [updated] = await db
    .update(syntheses)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(syntheses.id, id))
    .returning();
  return c.json({
    synthesis: await buildSynthesisFull(updated as SynthesisRow, user.id),
  });
});

/* ── DELETE /syntheses/:id — только владелец ─────────────────────────── */

synthesesRoutes.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!isUuid(id)) return c.json(notFoundJson, 404);

  const [row] = await db
    .select({ userId: syntheses.userId })
    .from(syntheses)
    .where(eq(syntheses.id, id))
    .limit(1);
  if (!row) return c.json(notFoundJson, 404);
  if (row.userId !== user.id) return c.json(forbiddenJson, 403);

  // Активную генерацию копить в удалённой строке нельзя
  if (isGenerationActive(id)) {
    return c.json(
      {
        error: "Генерация ещё идёт — остановите её перед удалением",
        code: "GENERATION_IN_PROGRESS",
      },
      409,
    );
  }

  await db.delete(syntheses).where(eq(syntheses.id, id));
  // CASCADE снимает sections/элементы/логи/lineage; parent_synthesis_id
  // у потомков — SET NULL (схема 02 §2.4)
  return c.json({ ok: true });
});

/* ── POST /syntheses/:id/duplicate (пункт 7 запроса 1.6; 03 §2.2) ────── */

synthesesRoutes.post("/:id/duplicate", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!isUuid(id)) return c.json(notFoundJson, 404);

  const [row] = await db
    .select()
    .from(syntheses)
    .where(eq(syntheses.id, id))
    .limit(1);
  if (!row) return c.json(notFoundJson, 404);
  // Решение беседы: duplicate — только владелец (как PATCH/DELETE);
  // «форк» чужого публичного синтеза протоколом не оговорён.
  if (row.userId !== user.id) return c.json(forbiddenJson, 403);
  if (row.status === "generating" || isGenerationActive(id)) {
    return c.json(
      {
        error: "Синтез ещё генерируется — дождитесь завершения",
        code: "GENERATION_IN_PROGRESS",
      },
      409,
    );
  }

  const newId = await db.transaction(async (tx) => {
    /* Копия строки syntheses: новый doc_num, title += « (копия)»,
       is_public = false (пункт 7). Контент и статистика копируются;
       pausedState копируется (genParams не привязаны к id — resume
       у копии работоспособен). Логи generation_log/context_log НЕ
       копируются: это история генерации оригинала, а не контент. */
    const [inserted] = await tx
      .insert(syntheses)
      .values({
        userId: user.id,
        seed: row.seed,
        method: row.method,
        synthLevel: row.synthLevel,
        depth: row.depth,
        generationOrder: row.generationOrder,
        extGraphMetrics: row.extGraphMetrics,
        keepFullBudget: row.keepFullBudget,
        context: row.context,
        lang: row.lang,
        title: `${row.title} (копия)`,
        docNum: makeDocNum(),
        status: row.status,
        isPublic: false,
        sectionOrder: row.sectionOrder,
        structureSections: row.structureSections ?? null,
        parentContextSchema: row.parentContextSchema,
        pausedState: (row.pausedState ?? null) as PausedState | null,
        versionBase: row.versionBase,
        versionSub: row.versionSub,
        versionModes: row.versionModes,
        versionModeRegen: row.versionModeRegen,
        capsuleHtml: row.capsuleHtml,
        totalInputTokens: row.totalInputTokens,
        totalOutputTokens: row.totalOutputTokens,
        totalCostUsd: row.totalCostUsd,
      })
      .returning({ id: syntheses.id });
    const copyId = (inserted as { id: string }).id;

    /* Генеалогия: копируются РОДИТЕЛИ оригинала (философы и концепции) —
       у копии та же генеалогия содержания. Связь «копия → оригинал» НЕ
       создаётся: это копия, а не потомок (пункт 7). */
    const lineageRows = await tx
      .select()
      .from(synthesisLineage)
      .where(eq(synthesisLineage.synthesisId, id))
      .orderBy(asc(synthesisLineage.position));
    if (lineageRows.length > 0) {
      await tx.insert(synthesisLineage).values(
        lineageRows.map((r) => ({
          synthesisId: copyId,
          parentType: r.parentType,
          parentName: r.parentName,
          parentSynthesisId: r.parentSynthesisId,
          position: r.position,
        })),
      );
    }

    /* Разделы */
    const sectionRows = await tx
      .select()
      .from(sections)
      .where(eq(sections.synthesisId, id));
    if (sectionRows.length > 0) {
      await tx.insert(sections).values(
        sectionRows.map((s) => ({
          synthesisId: copyId,
          key: s.key,
          sectionNum: s.sectionNum,
          title: s.title,
          htmlContent: s.htmlContent,
          secContext: s.secContext,
          isEdited: s.isEdited,
        })),
      );
    }

    /* Категории — с ремапом id для рёбер (returning сохраняет порядок
       values, маппинг старый id → новый по индексу) */
    const catRows = await tx
      .select()
      .from(categories)
      .where(eq(categories.synthesisId, id))
      .orderBy(asc(categories.position));
    const idMap = new Map<string, string>();
    if (catRows.length > 0) {
      const insertedCats = await tx
        .insert(categories)
        .values(
          catRows.map((cat) => ({
            synthesisId: copyId,
            name: cat.name,
            type: cat.type,
            definition: cat.definition,
            centrality: cat.centrality,
            certainty: cat.certainty,
            historicalSignificance: cat.historicalSignificance,
            innovationDegree: cat.innovationDegree,
            clarity: cat.clarity,
            breadth: cat.breadth,
            depthScore: cat.depthScore,
            applicability: cat.applicability,
            typeCatalogId: cat.typeCatalogId,
            origin: cat.origin,
            clusterIndices: cat.clusterIndices,
            structuralRoles: cat.structuralRoles,
            proceduralRoles: cat.proceduralRoles,
            hasReflexive: cat.hasReflexive,
            position: cat.position,
            source: cat.source,
          })),
        )
        .returning({ id: categories.id });
      insertedCats.forEach((ins, i) => {
        idMap.set((catRows[i] as { id: string }).id, ins.id);
      });
    }

    /* Рёбра (только те, чьи концы отремаплены) */
    const edgeRows = await tx
      .select()
      .from(categoryEdges)
      .where(eq(categoryEdges.synthesisId, id))
      .orderBy(asc(categoryEdges.position));
    const remapped = edgeRows
      .filter((e) => idMap.has(e.sourceId) && idMap.has(e.targetId))
      .map((e) => ({
        synthesisId: copyId,
        sourceId: idMap.get(e.sourceId) as string,
        targetId: idMap.get(e.targetId) as string,
        description: e.description,
        edgeType: e.edgeType,
        direction: e.direction,
        strength: e.strength,
        certainty: e.certainty,
        historicalSupport: e.historicalSupport,
        logicalNecessity: e.logicalNecessity,
        innovationDegree: e.innovationDegree,
        contextDependency: e.contextDependency,
        typeCatalogId: e.typeCatalogId,
        position: e.position,
        sourceOrigin: e.sourceOrigin,
      }));
    if (remapped.length > 0) await tx.insert(categoryEdges).values(remapped);

    /* Кластеры, тезисы, глоссарий, диалог */
    const clusterRows = await tx
      .select()
      .from(clusterLabels)
      .where(eq(clusterLabels.synthesisId, id));
    if (clusterRows.length > 0) {
      await tx.insert(clusterLabels).values(
        clusterRows.map((cl) => ({
          synthesisId: copyId,
          clusterIndex: cl.clusterIndex,
          label: cl.label,
        })),
      );
    }
    const thesisRows = await tx
      .select()
      .from(theses)
      .where(eq(theses.synthesisId, id));
    if (thesisRows.length > 0) {
      await tx.insert(theses).values(
        thesisRows.map((t) => ({
          synthesisId: copyId,
          thesisNum: t.thesisNum,
          formulation: t.formulation,
          justification: t.justification,
          thesisType: t.thesisType,
          noveltyDegree: t.noveltyDegree,
          relatedCategories: t.relatedCategories,
          source: t.source,
        })),
      );
    }
    const termRows = await tx
      .select()
      .from(glossaryTerms)
      .where(eq(glossaryTerms.synthesisId, id));
    if (termRows.length > 0) {
      await tx.insert(glossaryTerms).values(
        termRows.map((g) => ({
          synthesisId: copyId,
          term: g.term,
          definition: g.definition,
          extraColumns: g.extraColumns,
          termCategory: g.termCategory,
          source: g.source,
          position: g.position,
        })),
      );
    }
    const turnRows = await tx
      .select()
      .from(dialogueTurns)
      .where(eq(dialogueTurns.synthesisId, id));
    if (turnRows.length > 0) {
      await tx.insert(dialogueTurns).values(
        turnRows.map((d) => ({
          synthesisId: copyId,
          partNumber: d.partNumber,
          turnNumber: d.turnNumber,
          speaker: d.speaker,
          content: d.content,
          newConcepts: d.newConcepts,
        })),
      );
    }

    return copyId;
  });

  return c.json({ id: newId }, 201);
});
