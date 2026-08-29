/**
 * prompt-reconstruction — порты reconstructBaseCtxSkeleton [24149],
 * reconstructCtxMarkers [24202], reconstructSectionTask [24247],
 * reconstructSkeleton [24320] (беседа 4.2, п. 5b первого запроса; карта
 * 04 §2.5). Fallback для записей generation_log БЕЗ metadata.promptSkeleton
 * (например, импортированных): скелет промпта восстанавливается из
 * параметров синтеза, ctxLog и определений разделов. Потребитель —
 * log-formatter (formatPromptsForExport, GET /logs/prompts; долг §12
 * «TODO(4.2) в log-formatter» закрывается подключением там).
 *
 * АДАПТАЦИИ DOM/глобалы → сервис:
 *  - тексты Registry асинхронны (mdText/sdText/renderTemplate/
 *    buildSectionDefs) → вся цепочка reconstruct* стала async;
 *  - config.buildPrompt(param, ctx) исходника в mode-service отсутствует —
 *    промпт режима рендерится renderTemplate(config.promptKey,
 *    { param, context }) (как в runMode [486]);
 *  - поля genEntry (modeParam, hasUserNote, userNotePreview,
 *    hasCurrentContent, currentContentChars) на сервере живут в
 *    generation_log.metadata (пишет generation-service [2295]);
 *  - source 'subsection-regen' исходника → серверный enum
 *    'subsection_regen' (адаптация 2.2);
 *  - у серверных строк context_log нет поля type — intra-записи узнаются
 *    составным ключом (isIntraCtxKey: содержит ':' и не 'mode:', как в
 *    log-formatter), их entries несут префикс 'intra:' в e.key;
 *  - восстановление номеров из DOC_STATE.sectionDefs вырождено: defs
 *    строятся заново тем же buildSectionDefs — нумерация совпадает с
 *    генерационной по построению;
 *  - params — не DOC_STATE.params || genCommon._params, а buildParams от
 *    строки syntheses (генлог метаданных _params не хранит); собирает
 *    вызывающий (buildReconstructionContext).
 *
 * Циклов импортов нет: generation-service/section-defs-builder/
 * mode-service не импортируют ни этот модуль, ни log-formatter.
 */
import { CTX_LABELS } from "@philosynth/shared/constants/ctx-keys";
import { DL, ML, SL } from "@philosynth/shared/constants/labels";

import { buildParams, loadSynthesis } from "./generation-service.js";
import { loadConceptParticipants } from "./meta-synthesis-service.js";
import { isConceptParticipant } from "./parent-context.js";
import { getModeConfig } from "./mode-service.js";
import { mdText, sdText } from "./prompt-builder.js";
import { renderTemplate } from "./prompt-registry.js";
import {
  buildSectionDefs,
  patchPromptsWithSecCtx,
} from "./section-defs-builder.js";

import type { contextLog, generationLog } from "../db/schema.js";

type GenRow = typeof generationLog.$inferSelect;
type CtxRow = typeof contextLog.$inferSelect;

/** Форма p исходника — буквально возврат buildParams (generation-service). */
export type ReconstructionParams = ReturnType<typeof buildParams>;

/** genCommon — структурный минимум (conceptBlockSizes для мета-маркеров);
 *  GenCommonMeta log-formatter — структурный подтип. */
export interface ReconstructionGenCommon {
  conceptBlockSizes?: { name: string; chars: number }[] | undefined;
}

/** Всё, что нужно реконструкции одного синтеза (собирается один раз). */
export interface ReconstructionContext {
  params: ReconstructionParams;
  genCommon: ReconstructionGenCommon | null;
  ctxRows: CtxRow[];
}

/** Сборка контекста реконструкции: параметры — из строки syntheses. */
export async function buildReconstructionContext(
  synthesisId: string,
  ctxRows: CtxRow[],
  genCommon: ReconstructionGenCommon | null,
): Promise<ReconstructionContext | null> {
  try {
    const { row, philosophers, secCtx } = await loadSynthesis(synthesisId);
    const conceptParticipants = await loadConceptParticipants(synthesisId);
    const params = buildParams(row, philosophers, secCtx, conceptParticipants);
    return { params, genCommon, ctxRows };
  } catch {
    // fail-open: экспорт промптов не должен падать из-за реконструкции
    return null;
  }
}

/** intra-запись ctxLog (двойник log-formatter): составной ключ, не mode:. */
const isIntraCtxKey = (k: string): boolean =>
  k.includes(":") && !k.startsWith("mode:");

/* ══ reconstructBaseCtxSkeleton [24149] ═══════════════════════════════ */

export async function reconstructBaseCtxSkeleton(
  params: ReconstructionParams | null,
  gc: ReconstructionGenCommon | null,
): Promise<string> {
  if (!params) return "";

  const p = params;
  const phils = (p.participants || [])
    .filter((x) => x.type === "philosopher")
    .map((x) => x.name);
  // Адаптация: участники-концепции сервиса несут type='synthesis'
  // (исходник — 'concept'; isConceptParticipant принимает оба)
  const concepts = (p.participants || [])
    .filter((x) => isConceptParticipant(x))
    .map((x) => "«" + (x.name ?? "") + "»");

  let participantsLine = "";
  if (phils.length && concepts.length)
    participantsLine =
      "ФИЛОСОФЫ: " +
      phils.join(", ") +
      "\nКОНЦЕПЦИИ-УЧАСТНИКИ: " +
      concepts.join(", ");
  else if (phils.length) participantsLine = "ФИЛОСОФЫ: " + phils.join(", ");
  else if (concepts.length)
    participantsLine = "КОНЦЕПЦИИ-УЧАСТНИКИ: " + concepts.join(", ");

  const isMeta = concepts.length > 0;
  const metaNote = isMeta
    ? "\nРЕЖИМ: МЕТА-СИНТЕЗ. Среди участников есть ранее синтезированные " +
      "концепции. Их контекст (капсула, категории, тезисы) приведён ниже. " +
      "Обращайся с каждой концепцией-участником как с самостоятельной " +
      "философской позицией, обладающей собственным категориальным аппаратом."
    : "";

  let conceptCtx = "";
  if (isMeta) {
    const sizes = gc?.conceptBlockSizes || [];
    const markers = (p.participants || [])
      .filter((x) => isConceptParticipant(x))
      .map((c) => {
        const found = sizes.find((s) => s.name === c.name);
        const chars = found ? found.chars.toLocaleString("ru") : "?";
        return "[контекст «" + c.name + "»: " + chars + " симв.]";
      });
    conceptCtx =
      "\n\nКОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ СИНТЕЗА " +
      "(каждая — результат предыдущего синтеза; обращайся с ней " +
      "как с полноценной философской позицией, у которой есть " +
      'собственные категории, тезисы и внутренняя логика):\n"""\n' +
      markers.join("\n") +
      '\n"""';
  }

  return (
    "ЗЕРНО КОНЦЕПЦИИ: «" +
    (p.seed || "") +
    "»\n" +
    participantsLine +
    metaNote +
    "\n" +
    "МЕТОД: " +
    ((ML as Record<string, string>)[p.method ?? ""] || p.method) +
    " — " +
    ((await mdText(p, p.method)) || "") +
    "\n" +
    "УРОВЕНЬ СИНТЕЗА: " +
    ((SL as Record<string, string>)[p.synthLevel ?? ""] || p.synthLevel) +
    " — " +
    ((await sdText(p, p.synthLevel)) || "") +
    "\n" +
    "ГЛУБИНА: " +
    ((DL as Record<string, string>)[p.depth ?? ""] || p.depth) +
    (p.ctx ? "\nКОНТЕКСТ: " + p.ctx : "") +
    conceptCtx
  );
}

/* ══ reconstructCtxMarkers [24202] ════════════════════════════════════ */

export function reconstructCtxMarkers(
  sectionKey: string,
  ctxRows: CtxRow[],
): string {
  const parts: string[] = [];

  // Ищем все ctxLog-записи для этого ключа
  const entries = ctxRows.filter((c) => c.sectionKey === sectionKey);

  for (const ctx of entries) {
    if (!ctx.entries?.length) continue;

    if (isIntraCtxKey(ctx.sectionKey)) {
      // Внутрисекционный контекст (для подразделовых перегенераций)
      const markers = ctx.entries
        .filter((e) => e.status === "found")
        .map(
          (e) =>
            "[" +
            e.key.replace("intra:", "") +
            ": " +
            (e.len || 0).toLocaleString("ru") +
            " симв.]",
        );
      if (markers.length) {
        parts.push(
          'КОНТЕКСТ ДРУГИХ ПОДРАЗДЕЛОВ ЭТОГО РАЗДЕЛА:\n"""\n' +
            markers.join("\n") +
            '\n"""',
        );
      }
    } else {
      // Межсекционный контекст (стандартный)
      const markers = ctx.entries
        .filter((e) => e.status === "found" || e.status === "truncated")
        .map((e) => {
          const label =
            (CTX_LABELS as Record<string, string>)[e.key] || e.key;
          const suffix = e.status === "truncated" ? " [обрезан]" : "";
          return (
            "[" +
            label +
            ": " +
            (e.len || 0).toLocaleString("ru") +
            " симв." +
            suffix +
            "]"
          );
        });
      if (markers.length) {
        parts.push(
          "КОНТЕКСТ ИЗ ПРЕДЫДУЩИХ РАЗДЕЛОВ " +
            '(используй термины, §§ и названия категорий; не повторяй содержание):\n"""\n' +
            markers.join("\n") +
            '\n"""',
        );
      }
    }
  }

  return parts.length ? "\n\n" + parts.join("\n\n") : "";
}

/* ══ reconstructSectionTask [24247] ═══════════════════════════════════ */

export async function reconstructSectionTask(
  genEntry: GenRow,
  ctx: ReconstructionContext,
): Promise<string> {
  const params = ctx.params;
  if (!params) return "";

  const key = genEntry.sectionKey;
  const source = genEntry.source || "";
  const meta = (genEntry.metadata || {}) as Record<string, unknown>;

  // Режимы — своя структура
  if (key?.startsWith("mode:")) {
    const modeKey = key.replace("mode:", "");
    const config = getModeConfig(modeKey);
    if (!config) return "[режим " + modeKey + ": шаблон недоступен]";
    const param =
      typeof meta["modeParam"] === "string" && meta["modeParam"]
        ? (meta["modeParam"] as string)
        : "?";
    const ctxMarkers = reconstructCtxMarkers(key, ctx.ctxRows);
    // Шаблон режима с маркерами вместо контекста (адаптация: у сервиса
    // нет config.buildPrompt — рендер тем же путём, что runMode [486])
    try {
      return await renderTemplate(config.promptKey, {
        param,
        context: ctxMarkers
          ? "\n" + ctxMarkers + "\n"
          : "[контекст: " +
            (genEntry.priorChars || 0).toLocaleString("ru") +
            " симв.]",
      });
    } catch {
      return "[режим " + modeKey + ": шаблон недоступен]";
    }
  }

  // Подразделовая перегенерация
  if (source === "subsection_regen") {
    const parts = key.split(":");
    const secKey = parts[0]!;
    const subName = parts.slice(1).join(":");

    const allDefs = await buildSectionDefs(params);
    patchPromptsWithSecCtx(allDefs, params.secCtx || {});
    const def = allDefs.find((d) => d.key === secKey);
    if (!def?.parts)
      return "[подраздел " + subName + ": определение недоступно]";

    const sub = def.parts.subsections.find((s) => s.name === subName);
    if (!sub) return "[подраздел «" + subName + "» не найден]";

    const lines: string[] = [];
    lines.push(def.parts.preamble_short || "");
    lines.push("Перегенерируй ТОЛЬКО секцию:\n\n«" + sub.name + "»\n" + sub.body);
    if (meta["hasUserNote"] && typeof meta["userNotePreview"] === "string")
      lines.push(
        "ДОПОЛНИТЕЛЬНАЯ ИНСТРУКЦИЯ ПОЛЬЗОВАТЕЛЯ:\n" +
          (meta["userNotePreview"] as string),
      );
    if (meta["hasCurrentContent"])
      lines.push(
        "ТЕКУЩЕЕ СОДЕРЖИМОЕ ПОДРАЗДЕЛА: [" +
          ((meta["currentContentChars"] as number) || 0).toLocaleString("ru") +
          " симв.]",
      );
    return lines.filter(Boolean).join("\n\n");
  }

  // Стандартные разделы (generation, edit, cascade, edit-add)
  const sectionKeys = key.includes("+") ? key.split("+") : [key];

  const allDefs = await buildSectionDefs(params);
  patchPromptsWithSecCtx(allDefs, params.secCtx || {});
  const defsMap = Object.fromEntries(allDefs.map((d) => [d.key, d]));

  // Восстановление номеров из DOC_STATE.sectionDefs исходника вырождено:
  // defs построены тем же buildSectionDefs — нумерация генерационная.

  const sp = sectionKeys
    .map((k) => defsMap[k])
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .map((d) => "§ " + d.num + " — " + d.title.toUpperCase() + "\n" + d.prompt)
    .join("\n\n");

  return (
    "ЗАДАНИЕ: составь ТОЛЬКО следующие разделы " +
    "(строго в указанном порядке, без добавления других):\n\n" +
    sp
  );
}

/* ══ reconstructSkeleton [24320] ══════════════════════════════════════ */

/**
 * Полный скелет промпта из сохранённых данных — fallback для записей без
 * metadata.promptSkeleton (импортированные файлы). null — параметров нет.
 */
export async function reconstructSkeleton(
  genEntry: GenRow,
  ctx: ReconstructionContext | null,
): Promise<string | null> {
  const params = ctx?.params;
  if (!ctx || !params) return null;

  const key = genEntry.sectionKey;
  const source = genEntry.source || "";

  // Режимы — собственная структура промпта (без baseCtx)
  if (key?.startsWith("mode:")) {
    return reconstructSectionTask(genEntry, ctx);
  }

  // Все остальные: baseCtx + ctxMarkers + task + quality
  const base = await reconstructBaseCtxSkeleton(params, ctx.genCommon);

  let ctxMarkers = "";
  if (source === "subsection_regen" && key?.includes(":")) {
    // Подразделовая перегенерация: inter-section по ключу раздела,
    // intra-section по полному ключу (раздел:подраздел)
    const secKey = key.split(":")[0]!;
    const interCtx = reconstructCtxMarkers(secKey, ctx.ctxRows);
    const intraCtx = reconstructCtxMarkers(key, ctx.ctxRows);
    ctxMarkers = interCtx + intraCtx;
  } else {
    ctxMarkers = reconstructCtxMarkers(key, ctx.ctxRows);
  }

  const task = await reconstructSectionTask(genEntry, ctx);
  const quality = "\n\n[ТРЕБОВАНИЯ К КАЧЕСТВУ: см. общие элементы]";

  return "ПАРАМЕТРЫ СИНТЕЗА:\n" + base + ctxMarkers + "\n\n" + task + quality;
}
