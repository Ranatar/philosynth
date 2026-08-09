/**
 * Pause / Resume Service (беседа 1.4b; 01-architecture §4.12,
 * 05-file-structure server/services/pause-resume-service.ts).
 *
 * Порт логики паузы/возобновления philosynth.html [24482–26019]:
 *  - _logPauseEvent [24504] → logPauseEvent: строки-маркеры generation_log
 *    (pause_marker / resume_marker / user_action_marker, 02 §2.15);
 *  - создание pausedState → createPausedState (для kind='gen' точки паузы
 *    generation-service пишут снимок сами — беседа 1.4; здесь общий API:
 *    плановые паузы 2.2, догенерация подразделов ниже, тесты);
 *  - _computeGenPauseEstimates [24521] → computePauseEstimates: оценки
 *    стоимости действий модалки через cost-estimator (1.1);
 *  - resumeGeneration [25075]: ветки stop (_finalizeAfterStop_gen [25405])
 *    / retry / skip / fill-missing-subs (_resumeFromSubsection [25317] +
 *    _continueAfterFilledSubs [25500]);
 *  - resumePlan [25910] — каркас: валидация, resume-marker, ветка stop;
 *    исполнение шагов retry/skip_step — разъём setPlanResumeExecutor
 *    (заполнен: plan-executor регистрируется в нём при импорте, 2.2).
 *
 * Адаптации DOM/DOC_STATE → сервис (задокументированные отступления):
 *  - подмена DOC_STATE в _computeGenPauseEstimates не нужна: серверный
 *    оценщик принимает входы параметрами; «edit-режим» исходника
 *    (estimateCost({sections})) — isEdit + actualOutputChars из
 *    последних done-строк generation_log;
 *  - shared-тип PausedStateGen.partialSubsections хранит только имена
 *    (решение 1.4) — обрывочный подраздел (status!=='done')
 *    восстанавливается из metadata.subsections последней error-строки
 *    генлога; при её отсутствии — консервативный фолбэк expected−partial;
 *  - confirm-диалог деградации зависимостей при skip [25686–25740] —
 *    клиентское подтверждение (PauseModal/1.5); серверная ветка skip
 *    пропускает без вопросов;
 *  - fill-missing-subs: полный regenerateSubsection живёт в
 *    generation-service (беседа 2.2; долг 1.4b «объединить минимальный
 *    порт с полноценным» закрыт — локальная копия
 *    regenerateSubsectionForResume вырезана, вызов делегируется);
 *  - очистка callout'ов «Генерация прервана» из DOM [25378–25386] не
 *    нужна: сервер хранит в html_content чистый частичный HTML из
 *    reconnect-буфера (решение 1.4), callout — клиентский рендер;
 *  - intra-запись ctxLog [20255–20310]: колонки type='intra-section' в
 *    context_log нет — тип восстановим по sectionKey вида
 *    'раздел:подраздел' и префиксу 'intra:' у entries;
 *  - _resumeWithNewApiKey [24552] (ввод нового ключа в модалке) —
 *    TODO(6.1) BYO-Key: ключ серверный (env), менять из модалки нечего;
 *    auth-пауза возобновляется retry после замены ключа на сервере;
 *  - прогресс-панель/контейнеры/кнопки (_rebuildProgressPanelForResume,
 *    _ensureDocBodyContainers, submitBtn) — клиент (1.5).
 *
 * Регистрация провайдера оценок (setPauseEstimatesProvider) — побочный
 * эффект импорта модуля (низ файла): ws/handler импортирует его при
 * старте сервера, поэтому generation_paused из generation-service несёт
 * живые estimates; без импорта — деградация до {} (fail-open).
 */
import { and, desc, eq, inArray } from "drizzle-orm";

import type {
  PausedState,
  PausedStateGen,
  PausedStatePlan,
  PauseReasonKind,
} from "@philosynth/shared/types/synthesis";
import type {
  PauseEstimates,
  ResumeGenerationMode,
  ResumePlanMode,
  WsServerMessage,
} from "@philosynth/shared/types/ws-messages";

import { db } from "../db/index.js";
import {
  editPlans,
  generationLog,
  sections,
  syntheses,
} from "../db/schema.js";
import { env } from "../env.js";
import type { DepsMap } from "../utils/deep-merge.js";
import {
  innerTextTrimmed,
  parseFragment,
  removeSubsectionHtml,
} from "../utils/html-parser.js";
import { buildDynamicOrder } from "../utils/topo-sort.js";
import { connectionManager } from "../ws/connection-manager.js";

import { estimateCost, estimateSubsectionCost } from "./cost-estimator.js";
import {
  computeSkipDegrades,
  finalizeRun,
  findSubsection,
  isGenerationActive,
  loadSynthesis,
  parseSubsectionsFromHTML,
  regenerateSubsection,
  resumeSynthesisFromPass,
  runGenerationPasses,
  setPauseEstimatesProvider,
  withGenerationSlot,
  type SynthesisRow,
} from "./generation-service.js";
import {
  baseCtxStatic,
  buildSYS,
  type PromptParams,
} from "./prompt-builder.js";
import {
  buildSectionDefs,
  groupPasses,
  patchPromptsWithSecCtx,
  type SectionDefFull,
} from "./section-defs-builder.js";
import {
  classifyStreamError,
  pauseFriendlyMessage,
  StreamError,
} from "./streaming-manager.js";
import { buildEffectiveDeps, resolveContextDeps } from "./synthesis-engine.js";

/* ══ Константы ════════════════════════════════════════════════════════ */

/**
 * Порог продолжения оборванного подраздела (_resumeFromSubsection
 * [25361]): частичный текст ≥ 250 симв. сохраняется и дописывается
 * («Заверши»), короче — див удаляется и подраздел генерируется заново.
 */
const RESUME_CONTINUE_THRESHOLD = 250;

/** userNote режима продолжения — дословно из _resumeFromSubsection [25412] */
const RESUME_CONTINUE_USER_NOTE =
  "Генерация этого подраздела была прервана (сетевая ошибка / " +
  "лимит max_tokens / таймаут стрима). В блоке «НАЧАЛЬНЫЙ ФРАГМЕНТ " +
  "ПОДРАЗДЕЛА» приведён уже написанный тобой текст. Сохрани его " +
  "ДОСЛОВНО и продолжи писать именно с того места, где он " +
  "заканчивается, до полного объёма задания. Не переписывай и не " +
  "перефразируй уже написанное — только допиши недостающее.";

/* ══ Служебное ════════════════════════════════════════════════════════ */

export class PauseResumeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PauseResumeError";
    this.code = code;
  }
}

const sendToUser = (userId: string, msg: WsServerMessage): void =>
  connectionManager.sendToUser(userId, msg);


/** Параметры генерации из снапшота genParams (buildParams 1.4). */
type GenParams = PromptParams & {
  secCtx: Record<string, string>;
  keepFullBudget?: boolean | undefined;
};

function genParamsSecCtx(ps: PausedStateGen): Record<string, string> {
  const raw = (ps.genParams as { secCtx?: unknown }).secCtx;
  return raw && typeof raw === "object"
    ? { ...(raw as Record<string, string>) }
    : {};
}

async function clearPauseAndSetGenerating(synthesisId: string): Promise<void> {
  // _clearPausedState [25141]: новая ошибка запишет НОВЫЙ pausedState
  await db
    .update(syntheses)
    .set({ status: "generating", pausedState: null, updatedAt: new Date() })
    .where(eq(syntheses.id, synthesisId));
}

/* ══ Маркеры генлога (_logPauseEvent [24504]) ═════════════════════════ */

export type PauseEventType =
  | "pause_marker"
  | "resume_marker"
  | "user_action_marker";

/**
 * Порт _logPauseEvent(type, data) [24504]: строка-маркер в generation_log.
 * Маркеры видны в «Логе контекста», из «Лога промптов» исключаются по
 * log_type (02 §2.15). Сбой записи не роняет вызывающего (try/catch
 * исходника).
 */
export async function logPauseEvent(
  synthesisId: string,
  type: PauseEventType,
  data: {
    sectionKey?: string | undefined;
    sectionLabel?: string | undefined;
    source?: "initial" | "resume" | undefined;
  } & Record<string, unknown>,
): Promise<void> {
  try {
    const { sectionKey, sectionLabel, source, ...meta } = data;
    await db.insert(generationLog).values({
      synthesisId,
      sectionKey: sectionKey ?? "_pause",
      sectionLabel: sectionLabel ?? "",
      logType: type,
      source: source ?? "initial",
      status: "done",
      metadata: meta,
    });
  } catch (e) {
    console.warn("_logPauseEvent failed:", e);
  }
}

/* ══ createPausedState ════════════════════════════════════════════════ */

/**
 * Снимок паузы: syntheses.paused_state + status='paused' + pause_marker.
 * timestamp проставляется здесь (Date.now — shared-тип 0.1, решение 1.4).
 */
export async function createPausedState(
  synthesisId: string,
  kind: "gen",
  ctx: Omit<PausedStateGen, "kind" | "timestamp">,
): Promise<PausedStateGen>;
export async function createPausedState(
  synthesisId: string,
  kind: "plan",
  ctx: Omit<PausedStatePlan, "kind" | "timestamp">,
): Promise<PausedStatePlan>;
export async function createPausedState(
  synthesisId: string,
  kind: "gen" | "plan",
  ctx:
    | Omit<PausedStateGen, "kind" | "timestamp">
    | Omit<PausedStatePlan, "kind" | "timestamp">,
): Promise<PausedState> {
  const ps = { kind, timestamp: Date.now(), ...ctx } as PausedState;
  await db
    .update(syntheses)
    .set({ status: "paused", pausedState: ps, updatedAt: new Date() })
    .where(eq(syntheses.id, synthesisId));
  if (ps.kind === "gen") {
    await logPauseEvent(synthesisId, "pause_marker", {
      kind: "gen",
      sectionKey: ps.sectionKeys.join("+"),
      sectionLabel: ps.sectionLabel,
      reasonKind: ps.reasonKind,
      reason: ps.reason,
      passIdx: ps.passIdx,
      isPartial: ps.isPartial,
      maxTokensUsed: ps.maxTokensUsed ?? null,
    });
  } else {
    await logPauseEvent(synthesisId, "pause_marker", {
      kind: "plan",
      reasonKind: ps.reasonKind,
      reason: ps.reason,
      stepIdx: ps.stepIdx,
      totalSteps: ps.totalSteps,
    });
  }
  return ps;
}

/* ══ Пересборка инфраструктуры из genParams ═══════════════════════════ */

interface RebuiltInfra {
  p: GenParams;
  resolvedDeps: DepsMap;
  effectiveDeps: DepsMap;
  dynamicOrder: string[];
  defs: SectionDefFull[];
  passes: SectionDefFull[][];
}

/**
 * Общий шаг _computeGenPauseEstimates [24545] / resumeGeneration [25113] /
 * _resumeFromSubsection [25330]: resolveContextDeps → buildEffectiveDeps →
 * buildDynamicOrder → buildSectionDefs → patchPromptsWithSecCtx →
 * перенумерация по динамическому порядку → groupPasses.
 */
async function rebuildInfra(ps: PausedStateGen): Promise<RebuiltInfra | null> {
  const raw = ps.genParams;
  if (!raw || typeof raw !== "object") return null;
  const p = { ...(raw as unknown as GenParams) };
  p.secCtx = { ...(p.secCtx ?? {}) };

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
  ).filter(Boolean);
  p.sec = dynamicOrder.filter((k) => k !== "sum");

  const baseDefs = await buildSectionDefs(p);
  patchPromptsWithSecCtx(baseDefs, p.secCtx);
  const defsMap = Object.fromEntries(baseDefs.map((d) => [d.key, d]));
  let secNum = 1;
  const defs: SectionDefFull[] = dynamicOrder.map((key) => {
    const d = { ...(defsMap[key] as SectionDefFull) };
    d.num = secNum++;
    return d;
  });
  const passes = groupPasses(defs);
  return { p, resolvedDeps, effectiveDeps, dynamicOrder, defs, passes };
}

/* ══ Фактические данные генлога для оценщика ══════════════════════════ */

/**
 * Фактические outputChars разделов — последние done-строки генлога
 * (edit-режим estimateCost({sections}) исходника читает фактические
 * размеры из DOC_STATE; серверный аналог — generation_log).
 * Экспортирована для edit-planner (беседа 2.1, estimatePlanCost).
 */
export async function loadActualOutputChars(
  synthesisId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      sectionKey: generationLog.sectionKey,
      outputChars: generationLog.outputChars,
    })
    .from(generationLog)
    .where(
      and(
        eq(generationLog.synthesisId, synthesisId),
        eq(generationLog.logType, "generation"),
        eq(generationLog.status, "done"),
      ),
    )
    .orderBy(generationLog.createdAt);
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.outputChars <= 0) continue;
    for (const key of r.sectionKey.split("+")) {
      // подраздельные строки 'раздел:подраздел' размером раздела не являются
      if (key && key !== "_genCommon" && !key.includes(":")) {
        out[key] = r.outputChars;
      }
    }
  }
  return out;
}

interface SubDetail {
  name: string;
  chars: number;
  status: string;
}

/**
 * metadata.subsections последней error-строки генлога раздела —
 * восстановление статусов подразделов (shared PausedStateGen хранит
 * только имена, решение 1.4: chars/status — в метаданных генлога).
 */
async function loadPausedSubsectionDetail(
  synthesisId: string,
  sectionKeyJoined: string,
): Promise<SubDetail[]> {
  const [row] = await db
    .select({ metadata: generationLog.metadata })
    .from(generationLog)
    .where(
      and(
        eq(generationLog.synthesisId, synthesisId),
        eq(generationLog.sectionKey, sectionKeyJoined),
        eq(generationLog.logType, "generation"),
        eq(generationLog.status, "error"),
      ),
    )
    .orderBy(desc(generationLog.createdAt))
    .limit(1);
  const meta = (row?.metadata ?? {}) as { subsections?: unknown };
  if (!Array.isArray(meta.subsections)) return [];
  return meta.subsections.filter(
    (s): s is SubDetail => !!s && typeof (s as SubDetail).name === "string",
  );
}

/**
 * Недостающие подразделы [24576–24586, 25349–25360]: обрывочный
 * (status!=='done') первым, затем прочие в порядке expectedSubsections.
 */
function computeMissingSubs(
  ps: PausedStateGen,
  detail: SubDetail[],
): { missing: string[]; streamingSub: string | null } {
  const expected = ps.expectedSubsections ?? [];
  const doneNames =
    detail.length > 0
      ? new Set(detail.filter((s) => s.status === "done").map((s) => s.name))
      : new Set(ps.partialSubsections ?? []);
  const streamingSub = detail.find((s) => s.status !== "done")?.name ?? null;
  const missing: string[] = [];
  if (streamingSub) missing.push(streamingSub);
  for (const sub of expected) {
    if (!doneNames.has(sub) && !missing.includes(sub)) missing.push(sub);
  }
  return { missing, streamingSub };
}

/* ══ computePauseEstimates (_computeGenPauseEstimates [24521]) ════════ */

/**
 * Оценки стоимости действий модалки паузы: wholeSection («весь раздел
 * заново»), fillMissingSubs («догенерировать недостающие»), skipRemaining
 * («пропустить» — стоимость ОСТАЛЬНЫХ разделов с passIdx+1). Ошибки —
 * fail-open {} (console.warn, как исходник); отсутствующая оценка
 * опускается (null исходника ↔ отсутствие поля PauseEstimates).
 */
export async function computePauseEstimates(
  synthesisId: string,
  ps: PausedStateGen,
): Promise<PauseEstimates> {
  if (!ps || ps.kind !== "gen" || !ps.genParams) return {};
  const sectionKey = ps.sectionKeys[0];
  if (!sectionKey) return {};

  const result: PauseEstimates = {};
  try {
    const infra = await rebuildInfra(ps);
    if (!infra) return {};
    const { p, effectiveDeps, passes } = infra;

    const estimatorParams = {
      depth: p.depth,
      generationOrder: p.generationOrder,
      keepFullBudget: p.keepFullBudget,
    };
    const sysChars = (await buildSYS(p)).length;
    const baseStaticChars = (await baseCtxStatic(p)).length;
    const actualOutputChars = await loadActualOutputChars(synthesisId);

    // 1. Весь раздел заново — estimateCost({sections:[sectionKey]}) [24593]
    const targetPass = passes.find((pass) =>
      pass.some((d) => d.key === sectionKey),
    );
    if (targetPass) {
      const wholeEst = await estimateCost({
        params: estimatorParams,
        passes: [targetPass],
        effectiveDeps,
        sysChars,
        baseStaticChars,
        isEdit: true,
        actualOutputChars,
      });
      result.wholeSection = wholeEst.cost;
    }

    // 2. Догенерация только недостающих подразделов [24597–24622]
    const detail = await loadPausedSubsectionDetail(
      synthesisId,
      ps.sectionKeys.join("+"),
    );
    const { missing } = computeMissingSubs(ps, detail);
    const targetDef = infra.defs.find((d) => d.key === sectionKey);
    if (
      missing.length > 0 &&
      targetDef?.parts &&
      Array.isArray(targetDef.parts.subsections)
    ) {
      const subSysChars = (await buildSYS(p, { outputMode: "subsection" }))
        .length;
      let total = 0;
      let anyOk = false;
      for (const subName of missing) {
        const subEst = await estimateSubsectionCost({
          sectionKey,
          subsectionName: subName,
          parts: targetDef.parts,
          params: estimatorParams,
          sysChars: subSysChars,
          baseStaticChars,
          effectiveDeps,
          sectionOutputChars: actualOutputChars[sectionKey],
          actualOutputChars,
        });
        if (subEst && typeof subEst.cost === "number") {
          total += subEst.cost;
          anyOk = true;
        }
      }
      if (anyOk) result.fillMissingSubs = total;
    }

    // 3. Пропустить текущий раздел — стоимость ОСТАЛЬНЫХ (passIdx+1…)
    //    [24625–24634]
    const remainingPasses = passes.slice(ps.passIdx + 1);
    if (remainingPasses.length > 0) {
      const skipEst = await estimateCost({
        params: estimatorParams,
        passes: remainingPasses,
        effectiveDeps,
        sysChars,
        baseStaticChars,
        isEdit: true,
        actualOutputChars,
      });
      result.skipRemaining = skipEst.cost;
    } else {
      result.skipRemaining = 0;
    }
  } catch (e) {
    console.warn("_computeGenPauseEstimates error:", e);
  }
  return result;
}

/* ══ resumeGeneration (kind='gen') [25075] ════════════════════════════ */

/**
 * Действия возобновления основной генерации:
 *  - stop — зафиксировать текущее состояние как финальное;
 *  - retry — очистить частичное, прерванный pass заново;
 *  - skip — пропустить прерванный pass, продолжить со следующего;
 *  - fill-missing-subs — догенерировать только недостающие подразделы,
 *    затем продолжить со СЛЕДУЮЩЕГО pass.
 * Валидация — RESUME_INVALID (03 §4.3): нет pausedState kind='gen', либо
 * активная генерация уже идёт (два resume подряд — второй отклонён).
 */
export async function resumeGeneration(
  synthesisId: string,
  userId: string,
  mode: ResumeGenerationMode,
): Promise<void> {
  const [row] = await db
    .select()
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  if (!row) throw new PauseResumeError("NOT_FOUND", "Синтез не найден");
  if (row.userId !== userId) {
    throw new PauseResumeError("FORBIDDEN", "Нет доступа к синтезу");
  }
  if (isGenerationActive(synthesisId)) {
    throw new PauseResumeError(
      "RESUME_INVALID",
      "Генерация уже выполняется — повторное возобновление отклонено",
    );
  }
  const ps = row.pausedState;
  if (row.status !== "paused" || !ps || ps.kind !== "gen") {
    throw new PauseResumeError(
      "RESUME_INVALID",
      "Возобновление невозможно: синтез не находится в паузе генерации",
    );
  }
  /* Runtime-guard: mode приходит из WS-сообщения — «чужой mode» обязан
     давать RESUME_INVALID (03 §4.3), а не проваливаться в retry. */
  if (!["fill-missing-subs", "retry", "skip", "stop"].includes(mode)) {
    throw new PauseResumeError(
      "RESUME_INVALID",
      `Неизвестный режим возобновления: ${String(mode)}`,
    );
  }

  // resume-marker [25081]
  await logPauseEvent(synthesisId, "resume_marker", {
    kind: "gen",
    mode,
    sectionKey: ps.sectionKeys.join("+"),
    sectionLabel: ps.sectionLabel,
    passIdx: ps.passIdx,
    source: "resume",
  });

  if (mode === "stop") {
    sendToUser(userId, { type: "generation_resumed", synthesisId, mode });
    await finalizeAfterStopGen(synthesisId, userId, row, ps);
    return;
  }

  if (mode === "fill-missing-subs") {
    await resumeFillMissingSubs(synthesisId, userId, row, ps);
    return;
  }

  await resumeRetryOrSkip(synthesisId, userId, ps, mode);
}

/**
 * Общая ветка retry/skip [25143–25296]: startIdx = passIdx (retry) либо
 * passIdx+1 (skip); при retry частичный контент прерванных разделов
 * очищается (аналог ct.innerHTML="" [25292]; следующий upsert перезапишет).
 */
async function resumeRetryOrSkip(
  synthesisId: string,
  userId: string,
  ps: PausedStateGen,
  mode: "retry" | "skip",
): Promise<void> {
  const startIdx = mode === "skip" ? ps.passIdx + 1 : ps.passIdx;

  if (mode === "retry" && ps.sectionKeys.length > 0) {
    await db
      .update(sections)
      .set({ htmlContent: "", updatedAt: new Date() })
      .where(
        and(
          eq(sections.synthesisId, synthesisId),
          inArray(sections.key, ps.sectionKeys),
        ),
      );
  }

  await clearPauseAndSetGenerating(synthesisId);
  sendToUser(userId, {
    type: "generation_resumed",
    synthesisId,
    mode,
    fromPassIdx: startIdx,
  });

  await resumeSynthesisFromPass(synthesisId, userId, startIdx, {
    sectionContexts: genParamsSecCtx(ps),
  });
}

/**
 * Порт _finalizeAfterStop_gen [25405]: текущее состояние — финальное.
 * dynamicOrder пересобирается из genParams (для sectionOrder); при сбое
 * пересборки — фолбэк на сохранённый row.sectionOrder.
 */
async function finalizeAfterStopGen(
  synthesisId: string,
  userId: string,
  row: SynthesisRow,
  ps: PausedStateGen,
): Promise<void> {
  let dynamicOrder: string[] = row.sectionOrder ?? [];
  try {
    const infra = await rebuildInfra(ps);
    if (infra) dynamicOrder = infra.dynamicOrder;
  } catch (e) {
    console.warn("finalizeAfterStopGen: пересборка порядка не удалась:", e);
  }
  await finalizeRun(
    synthesisId,
    userId,
    dynamicOrder,
    row.totalInputTokens,
    row.totalOutputTokens,
  );
}

/* ══ fill-missing-subs (_resumeFromSubsection [25317]) ════════════════ */

async function resumeFillMissingSubs(
  synthesisId: string,
  userId: string,
  row: SynthesisRow,
  ps: PausedStateGen,
): Promise<void> {
  const infra = await rebuildInfra(ps);
  if (!infra) {
    // «параметры генерации утеряны» [25320]
    throw new PauseResumeError(
      "RESUME_INVALID",
      "Невозможно возобновить: параметры генерации утеряны",
    );
  }
  const { p, effectiveDeps, resolvedDeps } = infra;

  // Целевой раздел pass — тот, у которого есть структурированные parts
  // [25344–25348]
  const targetDef = infra.defs.find(
    (d) =>
      ps.sectionKeys.includes(d.key) &&
      d.parts &&
      Array.isArray(d.parts.subsections) &&
      d.parts.subsections.some((s) => s.name),
  );
  if (!targetDef) {
    // Нет parts — догенерация невозможна: автоматический fallback на retry
    // (полная перегенерация раздела) [25341]
    console.warn("_resumeFromSubsection: нет parts, fallback на retry");
    await resumeRetryOrSkip(synthesisId, userId, ps, "retry");
    return;
  }
  const sectionKey = targetDef.key;

  const detail = await loadPausedSubsectionDetail(
    synthesisId,
    ps.sectionKeys.join("+"),
  );
  const { missing, streamingSub } = computeMissingSubs(ps, detail);

  if (missing.length === 0) {
    // «недостающих подразделов нет» [25355] → следующий pass
    console.warn("_resumeFromSubsection: недостающих подразделов нет");
    await clearPauseAndSetGenerating(synthesisId);
    sendToUser(userId, {
      type: "generation_resumed",
      synthesisId,
      mode: "fill-missing-subs",
      fromPassIdx: ps.passIdx + 1,
    });
    await resumeSynthesisFromPass(synthesisId, userId, ps.passIdx + 1, {
      sectionContexts: p.secCtx,
    });
    return;
  }

  /* Режим продолжения оборванного подраздела [25361–25376]: частичный
     текст ≥ RESUME_CONTINUE_THRESHOLD сохраняется и дописывается
     («Заверши»); короче — див удаляется, подраздел генерируется заново. */
  let streamingContinueMode = false;
  if (streamingSub) {
    const [secRow] = await db
      .select({ htmlContent: sections.htmlContent })
      .from(sections)
      .where(
        and(
          eq(sections.synthesisId, synthesisId),
          eq(sections.key, sectionKey),
        ),
      )
      .limit(1);
    const sectionHtml = secRow?.htmlContent ?? "";
    if (sectionHtml) {
      const container = parseFragment(sectionHtml);
      const div = findSubsection(container, streamingSub);
      if (div) {
        if (innerTextTrimmed(div).length >= RESUME_CONTINUE_THRESHOLD) {
          streamingContinueMode = true;
        } else {
          const removed = removeSubsectionHtml(sectionHtml, streamingSub);
          if (removed.removed) {
            await db
              .update(sections)
              .set({ htmlContent: removed.html, updatedAt: new Date() })
              .where(
                and(
                  eq(sections.synthesisId, synthesisId),
                  eq(sections.key, sectionKey),
                ),
              );
          }
        }
      }
    }
  }

  await clearPauseAndSetGenerating(synthesisId);
  sendToUser(userId, {
    type: "generation_resumed",
    synthesisId,
    mode: "fill-missing-subs",
    fromPassIdx: ps.passIdx,
  });

  await withGenerationSlot(synthesisId, userId, async (handle) => {
    try {
      // ── Последовательная догенерация недостающих [25409–25421] ──
      for (const subName of missing) {
        const isContinueSub =
          streamingContinueMode &&
          streamingSub !== null &&
          subName === streamingSub;
        // Полный regenerateSubsection (generation-service, беседа 2.2) —
        // долг 1.4b «объединить с минимальным портом» закрыт.
        await regenerateSubsection(
          handle,
          p,
          targetDef,
          subName,
          effectiveDeps,
          resolvedDeps,
          isContinueSub
            ? {
                includeCurrentContent: true,
                resumeFromInterruption: true,
                userNote: RESUME_CONTINUE_USER_NOTE,
              }
            : {},
        );
      }

      // ── _continueAfterFilledSubs [25500]: следующий pass обычным
      //    циклом под тем же слотом ──
      const fresh = await loadSynthesis(synthesisId);
      Object.assign(fresh.secCtx, p.secCtx);
      await runGenerationPasses(
        handle,
        fresh.row,
        fresh.philosophers,
        fresh.secCtx,
        env.anthropic.apiKey,
        { startIdx: ps.passIdx + 1, source: "resume" },
      );
    } catch (rawErr) {
      /* Новая ошибка при догенерации [25440–25478]: пересчитываем готовые
         подразделы по фактическому html и пишем НОВЫЙ pausedState. */
      const e =
        rawErr instanceof StreamError
          ? rawErr
          : classifyStreamError(rawErr, false);
      const errorMsg = pauseFriendlyMessage(e);
      const [fresh] = await db
        .select({
          totalInputTokens: syntheses.totalInputTokens,
          totalOutputTokens: syntheses.totalOutputTokens,
        })
        .from(syntheses)
        .where(eq(syntheses.id, synthesisId))
        .limit(1);
      const totals = fresh ?? row;

      if (e.kind === "user-abort") {
        // §3.1: pausedState не создаётся — финализация по правилам stop
        await logPauseEvent(synthesisId, "user_action_marker", {
          action: "abort",
          context: "fill-missing-subs",
          sectionKey: `${sectionKey}`,
          source: "resume",
        });
        await finalizeRun(
          synthesisId,
          userId,
          infra.dynamicOrder,
          totals.totalInputTokens,
          totals.totalOutputTokens,
        );
        return;
      }

      const [curSec] = await db
        .select({ htmlContent: sections.htmlContent })
        .from(sections)
        .where(
          and(
            eq(sections.synthesisId, synthesisId),
            eq(sections.key, sectionKey),
          ),
        )
        .limit(1);
      const doneSubs = parseSubsectionsFromHTML(
        curSec?.htmlContent ?? "",
        ps.expectedSubsections,
      ).filter((s) => s.chars > 0);

      const newPs = await createPausedState(synthesisId, "gen", {
        passIdx: ps.passIdx,
        sectionKeys: ps.sectionKeys,
        sectionLabel: ps.sectionLabel,
        isPartial: doneSubs.length > 0,
        reason: errorMsg,
        reasonKind: e.kind || "partial",
        partialSubsections: doneSubs.map((s) => s.name),
        expectedSubsections: [...ps.expectedSubsections],
        completedPasses: ps.completedPasses,
        genParams: ps.genParams,
        skipDegrades: computeSkipDegrades(
          effectiveDeps, ps.sectionKeys, ps.completedPasses,
        ),
        ...(e.kind === "max-tokens"
          ? { maxTokensUsed: e.maxTokensUsed || env.anthropic.maxTokens }
          : {}),
      });
      sendToUser(userId, {
        type: "generation_paused",
        synthesisId,
        kind: "gen",
        reasonKind: newPs.reasonKind as Exclude<PauseReasonKind, "user-abort">,
        reason: errorMsg,
        isPartial: newPs.isPartial,
        partialSubsections: newPs.partialSubsections,
        expectedSubsections: newPs.expectedSubsections,
        skipDegrades: newPs.skipDegrades ?? [],
        estimates: await computePauseEstimates(synthesisId, newPs),
      });
    }
  });
}

/* ══ resumePlan (kind='plan') [25910] ═════════════════════════════════ */

export type PlanResumeExecutor = (
  synthesisId: string,
  planId: string,
  userId: string,
  mode: "retry" | "skip_step",
) => Promise<void>;

let planResumeExecutor: PlanResumeExecutor | null = null;

/** Разъём для plan-executor (беседа 2.2): исполнение шагов retry/skip_step
 *  (deleteSection/addSection/regenerateSection [25491–25510]). */
export function setPlanResumeExecutor(fn: PlanResumeExecutor | null): void {
  planResumeExecutor = fn;
}

/**
 * Порт resumePlan(mode) [25910] — каркас 1.4b: валидация (RESUME_INVALID),
 * resume-marker, ветка stop (очистка остатка [25454]: pausedState → null,
 * план → 'failed', синтез → 'ready'); исполнение шагов retry/skip_step
 * делегируется plan-executor (2.2) через setPlanResumeExecutor — до его
 * регистрации → RESUME_INVALID (адаптация: отдельного кода
 * «не реализовано» в 03 §4.3 нет).
 */
export async function resumePlan(
  synthesisId: string,
  planId: string,
  userId: string,
  mode: ResumePlanMode,
): Promise<void> {
  const [row] = await db
    .select()
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  if (!row) throw new PauseResumeError("NOT_FOUND", "Синтез не найден");
  if (row.userId !== userId) {
    throw new PauseResumeError("FORBIDDEN", "Нет доступа к синтезу");
  }
  const ps = row.pausedState;
  if (row.status !== "paused" || !ps || ps.kind !== "plan") {
    throw new PauseResumeError(
      "RESUME_INVALID",
      "Возобновление невозможно: синтез не находится в паузе плана",
    );
  }
  if (!["retry", "skip_step", "stop"].includes(mode)) {
    throw new PauseResumeError(
      "RESUME_INVALID",
      `Неизвестный режим возобновления плана: ${String(mode)}`,
    );
  }
  const [plan] = await db
    .select({ id: editPlans.id })
    .from(editPlans)
    .where(
      and(eq(editPlans.id, planId), eq(editPlans.synthesisId, synthesisId)),
    )
    .limit(1);
  if (!plan) throw new PauseResumeError("NOT_FOUND", "План не найден");

  await logPauseEvent(synthesisId, "resume_marker", {
    kind: "plan",
    mode,
    stepIdx: ps.stepIdx,
    totalSteps: ps.totalSteps,
    source: "resume",
  });

  if (mode === "stop") {
    await db
      .update(syntheses)
      .set({ status: "ready", pausedState: null, updatedAt: new Date() })
      .where(eq(syntheses.id, synthesisId));
    await db
      .update(editPlans)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(editPlans.id, planId));
    sendToUser(userId, { type: "generation_resumed", synthesisId, mode });
    return;
  }

  if (!planResumeExecutor) {
    throw new PauseResumeError(
      "RESUME_INVALID",
      "Возобновление шагов плана требует plan-executor (беседа 2.2)",
    );
  }
  sendToUser(userId, { type: "generation_resumed", synthesisId, mode });
  await planResumeExecutor(synthesisId, planId, userId, mode);
}

/* ══ Регистрация провайдера оценок (побочный эффект импорта) ══════════ */

setPauseEstimatesProvider((synthesisId, ps) =>
  computePauseEstimates(synthesisId, ps),
);
