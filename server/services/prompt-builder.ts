/**
 * Prompt Builder (беседа 1.2; 01-architecture §4.2, карта 04 §1.9/§2.2).
 *
 * Сборка системного промпта и базового контекста. Все ТЕКСТЫ — из
 * Prompt Registry (посеяны в 0.3/1.2), вся ЛОГИКА (ветвление по
 * кардинальности, мета-синтезу, языку, режиму вывода) — здесь
 * («условия в коде, текст в Registry», NEXT-CONTEXT 0.3).
 *
 * Портированные функции исходника (якоря philosynth.html):
 *  - buildSYS(p, opts) [8590] — из 4 частей Registry: system +
 *    system.lang_instruction + system.participants_note +
 *    system.output_mode.{full|subsection|mode};
 *  - baseCtx(p, sectionKey) [10515] = baseCtxStatic(p) [10315] +
 *    baseCtxParents(p, sectionKey[, subsectionName]) [10371];
 *  - philNames [9849] / conceptNames [9857];
 *  - participantsForPrompt [10531] (плейсхолдер «[свободный синтез: …]»);
 *  - eachParticipant [10590]; hasNoParticipants [10605];
 *  - mdText [4473] / sdText [4523] — словари md_by_card / sd_by_card
 *    из Registry (v11, 01-arch §4.14);
 *  - buildQualityReinforcement [8649] — шаблон quality_reinforcement;
 *  - STOP_SIGNAL [10511] — шаблон stop_signal (v10). ОТСТУПЛЕНИЕ от
 *    формулировки 07 («константа в prompt-builder»): текст посеян в 0.3
 *    отдельным шаблоном Registry — единый источник истины, здесь только
 *    доступ (getStopSignal);
 *  - _buildExtraTypesBlock [8977] — конфиг extra_types из Registry
 *    (данные-двойник для сидинга: server/config/extra-types.ts).
 *
 * Адаптации DOM/DOC_STATE → сервис:
 *  1. p — параметры аргументом (исходник-форма: phil/sec/ctx/…), не DOC_STATE;
 *     маппинг из API-формы SynthesisParams — на вызывающей стороне (1.4).
 *  2. Родительский блок (conceptContextBlockFull/Selective,
 *     resolveParentDepsForSubsection) принадлежит parent-context (1.3) и
 *     meta-synthesis-service (3.1) — здесь подключаемый провайдер
 *     (setParentContextProvider); без провайдера мета-синтез получает
 *     пустой блок с console.warn (TODO 1.3/3.1).
 *  3. Функции async: тексты и словари читаются из Registry (Redis-кэш).
 */

import type {
  Depth,
  GenerationOrder,
  SynthesisMethod,
  SynthLevel,
} from "@philosynth/shared/types/synthesis";
import { DL, ML, SL } from "@philosynth/shared/constants/labels";
import {
  type CardinalityParams,
  hasConceptParticipants,
  participantCardinality,
  participantWord,
  participantWordSg,
} from "@philosynth/shared/utils/cardinality";

import { getConfig, getTemplate, renderTemplate } from "./prompt-registry.js";
import { mw } from "./cost-estimator.js";

export {
  hasConceptParticipants,
  participantCardinality,
  participantWord,
  participantWordSg,
};

/* ── Параметры ───────────────────────────────────────────────────────── */

/** Участник в форме промптов: философ или концепция (имя обязательно).
 *  Исходник помечает концепции type="concept"; API сервиса — "synthesis"
 *  (как в shared/utils/cardinality — принимаются оба). */
export interface PromptParticipant {
  type: string;
  name: string;
}

/** Параметры синтеза в форме исходника (p.phil / p.sec / p.ctx / …). */
export interface PromptParams extends CardinalityParams {
  seed?: string | undefined;
  phil?: string[] | undefined;
  participants?: PromptParticipant[] | undefined;
  sec: string[];
  method: SynthesisMethod;
  synthLevel?: SynthLevel | undefined;
  depth: Depth;
  generationOrder?: GenerationOrder | undefined;
  extGraphMetrics?: boolean | undefined;
  /** Доп. контекст пользователя (p.ctx исходника / context API) */
  ctx?: string | undefined;
  lang?: string | undefined;
}

const isConceptType = (t: string): boolean => t === "concept" || t === "synthesis";

/* ── Имена участников ────────────────────────────────────────────────── */

/** Порт philNames [9849]: философы из participants, иначе p.phil. */
export function philNames(p: PromptParams): string[] {
  if (!p.participants) return p.phil ?? [];
  return p.participants
    .filter((x) => x.type === "philosopher")
    .map((x) => x.name);
}

/** Порт conceptNames [9857]: только концепции, в «кавычках-ёлочках». */
export function conceptNames(p: PromptParams): string[] {
  return (p.participants ?? [])
    .filter((x) => isConceptType(x.type))
    .map((x) => "«" + x.name + "»");
}

/** Порт hasNoParticipants [10605]: свободный синтез. */
export function hasNoParticipants(p: CardinalityParams): boolean {
  return participantCardinality(p) === "none";
}

/**
 * Порт participantsForPrompt [10531]: универсальная метка участников для
 * подстановки `(${pp})` в шаблоны. При 0 участников — мета-инструкция
 * «[свободный синтез: …]» (LLM штатно читает квадратные скобки как
 * meta-указание; предотвращает пустые скобки «()»).
 */
export function participantsForPrompt(p: PromptParams): string {
  const phils = (p.participants ?? [])
    .filter((x) => x.type === "philosopher")
    .map((x) => x.name);
  const concepts = (p.participants ?? [])
    .filter((x) => isConceptType(x.type))
    .map((x) => "«" + x.name + "»");
  const parts: string[] = [];
  if (phils.length) parts.push(phils.join(", "));
  if (concepts.length) parts.push(concepts.join(", "));
  const result = parts.join("; ") || (p.phil ?? []).join(", ");
  if (!result)
    return "[свободный синтез: определи релевантные философские традиции самостоятельно по содержанию зерна]";
  return result;
}

/** Порт eachParticipant [10590]: «влияние кого» — по кардинальности. */
export function eachParticipant(p: PromptParams): string {
  const card = participantCardinality(p);
  if (card === "none")
    return "каждой значимой философской традиции, отражённой в зерне";
  if (hasConceptParticipants(p))
    return card === "single"
      ? "единственного участника синтеза (" + participantsForPrompt(p) + ")"
      : "каждого участника (" + participantsForPrompt(p) + ")";
  const names = (p.phil ?? []).join(", ");
  return card === "single"
    ? "единственного участника синтеза — " + names +
        " — и философских традиций, с которыми он соотносится в свете зерна концепции"
    : "каждого из философов (" + names + ")";
}

/* ── Описания метода/уровня по кардинальности (v11) ──────────────────── */

type ByCard = Record<"multi" | "single" | "none", Record<string, string>>;

/** Порт mdText [4473]: MD_BY_CARD[card][method] с фолбэком на multi. */
export async function mdText(
  p: CardinalityParams & { method?: string | undefined },
  method?: string,
): Promise<string> {
  const card = participantCardinality(p);
  const m = method || p?.method || "dialectical";
  const MD = await getConfig<ByCard>("md_by_card");
  return (MD[card] && MD[card][m]) || MD.multi[m] || "";
}

/** Порт sdText [4523]: SD_BY_CARD[card][level] с фолбэком на multi. */
export async function sdText(
  p: CardinalityParams & { synthLevel?: string | undefined },
  level?: string,
): Promise<string> {
  const card = participantCardinality(p);
  const l = level || p?.synthLevel || "comparative";
  const SD = await getConfig<ByCard>("sd_by_card");
  return (
    (SD[card] && SD[card][l]) || SD.multi[l] || (SD.multi.comparative as string)
  );
}

/* ── buildSYS ────────────────────────────────────────────────────────── */

export type SysOutputMode = "full" | "subsection" | "mode";

export interface BuildSysOptions {
  outputMode?: SysOutputMode | undefined;
}

/**
 * Порт buildSYS(p, opts) [8590]. Сборка из 4 частей Registry (схема 0.3):
 * ядро system с плейсхолдерами {{lang_instruction}} / {{participants_note}} /
 * {{output_mode_instruction}}; условия — здесь:
 *  - lang_instruction: рендер system.lang_instruction ТОЛЬКО при lang≠Russian;
 *  - participants_note: рендер system.participants_note при непустом p.phil;
 *  - output_mode_instruction: system.output_mode.{outputMode}.
 */
export async function buildSYS(
  p: Pick<PromptParams, "phil" | "lang"> | null | undefined,
  opts: BuildSysOptions = {},
): Promise<string> {
  const outputMode: SysOutputMode =
    opts.outputMode === "subsection"
      ? "subsection"
      : opts.outputMode === "mode"
        ? "mode"
        : "full";
  const philList = p?.phil?.length ? p.phil.join(", ") : "";
  const lang = p?.lang || "Russian";
  const langInstruction =
    lang === "Russian"
      ? ""
      : await renderTemplate("system.lang_instruction", { lang });
  const participantsNote = philList
    ? await renderTemplate("system.participants_note", { philosophers: philList })
    : "";
  const outputModeInstruction = await getTemplate(
    `system.output_mode.${outputMode}`,
  );
  return renderTemplate("system", {
    lang_instruction: langInstruction,
    participants_note: participantsNote,
    output_mode_instruction: outputModeInstruction,
  });
}

/* ── Базовый контекст ────────────────────────────────────────────────── */

/**
 * Порт baseCtxStatic(p) [10315]: статическая часть базового контекста —
 * зерно, участники (или явный режим свободного синтеза), пометка режима
 * (развитие одной позиции / развитие концепции / мета-синтез), метод,
 * уровень, глубина, контекст пользователя. В v10 строка
 * «ВЫБРАННЫЕ РАЗДЕЛЫ» убрана — здесь её нет.
 */
export async function baseCtxStatic(p: PromptParams): Promise<string> {
  const phils = philNames(p);
  const concepts = conceptNames(p);
  const card = participantCardinality(p);
  let participantsLine = "";
  if (phils.length && concepts.length)
    participantsLine =
      "ФИЛОСОФЫ: " + phils.join(", ") +
      "\nКОНЦЕПЦИИ-УЧАСТНИКИ: " + concepts.join(", ");
  else if (phils.length) participantsLine = "ФИЛОСОФЫ: " + phils.join(", ");
  else if (concepts.length)
    participantsLine = "КОНЦЕПЦИИ-УЧАСТНИКИ: " + concepts.join(", ");
  else
    // Свободный синтез — нет ни философов, ни концепций-участников.
    participantsLine =
      "РЕЖИМ: СВОБОДНЫЙ СИНТЕЗ. У концепции нет участников-философов и " +
      "нет концепций-родителей. Концепция порождается ИСКЛЮЧИТЕЛЬНО из " +
      "зерна выше. Не приписывай идеи конкретным мыслителям и не " +
      "ссылайся на «участников синтеза» — их нет. Допустимы ссылки на " +
      "философские традиции и течения как на интеллектуальный фон, " +
      "если этого требует содержание зерна.";

  let modeNote = "";
  if (card === "single" && !hasConceptParticipants(p)) {
    modeNote =
      "\nРЕЖИМ: РАЗВИТИЕ ОДНОЙ ПОЗИЦИИ. У синтеза один участник-" +
      "философ и зерно концепции. Задача — не столкнуть несколько позиций, а " +
      "развить исходную позицию в направлении, заданном зерном. " +
      "Везде, где шаблон метода/уровня упоминает «между традициями», " +
      "«минимум двумя философами», «различными источниками», — читай это " +
      "как напряжение между исходной позицией и проблемным полем зерна.";
  } else if (card === "single" && hasConceptParticipants(p)) {
    modeNote =
      "\nРЕЖИМ: РАЗВИТИЕ КОНЦЕПЦИИ. У синтеза один участник — " +
      "ранее синтезированная концепция, и зерно. Задача — развить исходную " +
      "концепцию-родителя в направлении, заданном зерном. Шаблоны метода/" +
      "уровня, упоминающие «между традициями» и «минимум двумя источниками», " +
      "читай как напряжение между категориями исходной концепции и " +
      "проблемным полем зерна.";
  } else if (hasConceptParticipants(p)) {
    modeNote =
      "\nРЕЖИМ: МЕТА-СИНТЕЗ. Среди участников есть ранее синтезированные " +
      "концепции. Их контекст (капсула, категории, тезисы и т.п.) приведён ниже. " +
      "Обращайся с каждой концепцией-участником как с самостоятельной " +
      "философской позицией, обладающей собственным категориальным аппаратом.";
  }
  const levelKey = p.synthLevel || "comparative";
  return (
    "ЗЕРНО КОНЦЕПЦИИ: «" + (p.seed || "") + "»\n" +
    participantsLine + modeNote + "\n" +
    "МЕТОД: " + ML[p.method] + " — " + (await mdText(p, p.method)) + "\n" +
    "УРОВЕНЬ СИНТЕЗА: " + (SL[levelKey] || SL.comparative) + " — " +
    (await sdText(p, levelKey)) + "\n" +
    "ГЛУБИНА: " + DL[p.depth] +
    (p.ctx ? "\nКОНТЕКСТ: " + p.ctx : "")
  );
}

/**
 * Провайдер родительского блока контекста (мета-синтез, v11 01-arch §4.13):
 * реализация — conceptContextBlockFull/Selective +
 * resolveParentDepsForSubsection (parent-context, беседа 1.3;
 * meta-synthesis-service, беседа 3.1). Подключается через
 * setParentContextProvider при старте генерационного слоя.
 */
export type ParentContextProvider = (
  p: PromptParams,
  sectionKey?: string,
  subsectionName?: string,
) => Promise<string> | string;

let parentContextProvider: ParentContextProvider | null = null;

/** Регистрация/сброс провайдера родительского блока (TODO 1.3/3.1). */
export function setParentContextProvider(
  fn: ParentContextProvider | null,
): void {
  parentContextProvider = fn;
}

/**
 * Порт baseCtxParents(p, sectionKey, subsectionName) [10371]: блок
 * контекста концепций-родителей, пер-секционный (v11). Диспетчеризация
 * full/selective/subsection-spec живёт в провайдере (1.3/3.1); без
 * провайдера мета-синтез получает "" с предупреждением.
 */
export async function baseCtxParents(
  p: PromptParams,
  sectionKey?: string,
  subsectionName?: string,
): Promise<string> {
  if (!hasConceptParticipants(p)) return "";
  if (!parentContextProvider) {
    console.warn(
      "[prompt-builder] baseCtxParents: провайдер родительского контекста " +
        "не подключён (parent-context — беседа 1.3, meta-synthesis — 3.1); " +
        "блок родителей опущен",
    );
    return "";
  }
  return parentContextProvider(p, sectionKey, subsectionName);
}

/**
 * Порт baseCtx(p, sectionKey) [10515] = baseCtxStatic + baseCtxParents.
 * subsectionName пробрасывается в baseCtxParents для подраздельной
 * специализации родителей (PARENT_INTRA_DEPS; в исходнике вызывающие
 * передают его в baseCtxParents напрямую).
 */
export async function baseCtx(
  p: PromptParams,
  sectionKey?: string,
  subsectionName?: string,
): Promise<string> {
  return (
    (await baseCtxStatic(p)) +
    (await baseCtxParents(p, sectionKey, subsectionName))
  );
}

/* ── Качество, стоп-сигнал, доп. типы ────────────────────────────────── */

/** Порт buildQualityReinforcement(p) [8649]: шаблон quality_reinforcement,
 *  {{min_words}} = mw(p) по depth. */
export async function buildQualityReinforcement(p: {
  depth?: Depth | string | undefined;
}): Promise<string> {
  return renderTemplate("quality_reinforcement", { min_words: mw(p) });
}

/** Ключ шаблона стоп-сигнала (v10; посеян в 0.3). */
export const STOP_SIGNAL_TEMPLATE_KEY = "stop_signal";

/**
 * STOP_SIGNAL [10511]: инструкция прекратить генерацию после последнего
 * запрошенного раздела. В исходнике добавляется ОДИН раз в конец итогового
 * задания (`${sp}${quality}${STOP_SIGNAL}`), не в method/level-фрагменты.
 * Источник текста — Registry (единый источник истины вместо константы 07).
 */
export async function getStopSignal(): Promise<string> {
  return getTemplate(STOP_SIGNAL_TEMPLATE_KEY);
}

/** Форма конфига extra_types (сеется из server/config/extra-types.ts). */
export interface ExtraTypesConfig {
  categoryTypes: Record<string, readonly string[]>;
  edgeTypes: Record<string, readonly string[]>;
  levelPhrasing: Record<string, string>;
}

/**
 * Чистое ядро _buildExtraTypesBlock [8977] над переданными словарями —
 * логика дословно совпадает с портом в server/config/extra-types.ts
 * (тот работает по статическим данным и служит источником сидинга).
 */
export function extraTypesBlockFrom(
  cfg: ExtraTypesConfig,
  method: string,
  synthLevel: string,
  kind: "category" | "edge",
): string {
  const map = kind === "category" ? cfg.categoryTypes : cfg.edgeTypes;
  const extra = map[method] || [];
  if (!extra.length) return "";
  const phrasing = cfg.levelPhrasing[synthLevel];
  if (phrasing === undefined) return "";
  if (synthLevel === "generative") {
    // На порождающем уровне: просто добавляем в список через « / »
    return " / " + extra.join(" / ");
  }
  return "\n" + phrasing + extra.join(" / ");
}

/**
 * Порт _buildExtraTypesBlock(method, synthLevel, kind) [8977]:
 * добавка к списку допустимых типов категорий/связей в промпте графа.
 * Словари — конфиг extra_types из Registry (07, беседа 1.2).
 */
export async function buildExtraTypesBlock(
  method: string,
  synthLevel: string,
  kind: "category" | "edge",
): Promise<string> {
  return extraTypesBlockFrom(
    await getConfig<ExtraTypesConfig>("extra_types"),
    method,
    synthLevel,
    kind,
  );
}

/* ── Общие переменные подстановки словоформ ──────────────────────────── */

/**
 * Словоформенные переменные для renderTemplate шаблонов method.* / level.* /
 * section.* (инвентарь плейсхолдеров — extract-seed-data /
 * extract-section-templates). participant_word_sg_cap — капитализированная
 * форма для «Источники влияния» (в исходнике charAt(0).toUpperCase()).
 */
export function participantVars(
  p: PromptParams,
): Record<string, string | number> {
  const sg = participantWordSg(p);
  return {
    participants: participantsForPrompt(p),
    participant_word: participantWord(p),
    participant_word_sg: sg,
    participant_word_sg_cap: sg.charAt(0).toUpperCase() + sg.slice(1),
    each_participant: eachParticipant(p),
    min_words: mw(p),
  };
}
