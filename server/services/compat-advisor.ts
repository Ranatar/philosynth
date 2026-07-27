/**
 * Compat Advisor v2 + Section Dependency Warnings
 * (01-architecture §4.15 п. 1–2; беседа 1.1).
 *
 * Порт из philosynth.html:
 *  - SEC_GROUP [6973], METHOD_SYNERGY_PEAKS [6990], BASE_SECTION_RATING
 *    [7002] — константы алгоритма рейтингов (данные матрицы — в БД,
 *    параметры вычисления — в коде, по принципу Registry «логика в коде»);
 *  - computeSectionRating [7245], computeSections [7277];
 *  - getCompatEntry [7298], getCompatEntryByKey [7312] — entry-модель
 *    `level:method` (computeMethodRating / computeOverallCompat /
 *    getCompatAdvice удалены в v11 — НЕ портируются);
 *  - chipClassForRating [7325], iconForSeverity [7335], titleForSeverity
 *    [7348];
 *  - computeSectionWarnings [6616] — 1:1;
 *  - updateSectionWarnings [6645] — DOM-рендерер формы; серверный аналог —
 *    computeSectionAdvice: та же логика четырёх блоков (зависимости,
 *    конфликты ✗✗/✗, рекомендации, подстановки), но вместо innerHTML —
 *    структурированные элементы {icon, text, severity}; HTML/CSS-классы —
 *    задача клиента (SectionWarnings.tsx, беседа 1.5). Тексты сообщений
 *    сохранены дословно (HTML-теги <strong> и т.п. в текстах не
 *    воспроизводятся — это разметка, не содержание).
 *
 * Адаптация: COMPAT_MATRIX_COMPACT читается через
 * prompt-registry.getConfig("compat_matrix") → async-аксессоры;
 * DOM-чекбоксы → массив выбранных ключей разделов.
 */

import {
  SEC_ID_TO_KEY,
  SECTION_LABELS,
  type SectionCheckboxId,
} from "@philosynth/shared/constants/section-labels";
import { CTX_LABELS } from "@philosynth/shared/constants/ctx-keys";
import { ML, SL } from "@philosynth/shared/constants/labels";
import type {
  GenerationOrder,
  SynthesisMethod,
  SynthLevel,
} from "@philosynth/shared/types/synthesis";

import type { DepsMap } from "../utils/deep-merge.js";
import {
  computePredecessors,
  getSubstituteQuality,
  resolveCircularDeps,
  sourceOf,
  type SubstitutionMap,
} from "../utils/topo-sort.js";
import { getConfig } from "./prompt-registry.js";
import {
  buildEffectiveDepsWith,
  getActiveSubstitutionMap,
  resolveContextDeps,
} from "./synthesis-engine.js";

/* ── Типы матрицы совместимости ──────────────────────────────────────── */

export type CompatSeverity =
  | "synergy-max"
  | "synergy"
  | "stable"
  | "tension"
  | "conflict"
  | "hard-conflict";

/** Символ рейтинга: ★★★ | ★★ | ★ | ≈ | ✗ | ✗✗ */
export type CompatRating = string;

export interface CompatReplacement {
  param: "method" | "level" | string;
  value: string;
  label: string;
  rating: CompatRating;
}

export interface CompatOrderAdvice {
  recommended: GenerationOrder;
  strength: string;
  text: string;
}

/** Запись COMPAT_MATRIX_COMPACT (значение конфига compat_matrix) */
export interface CompatMatrixEntry {
  rating: CompatRating;
  severity: CompatSeverity;
  desc: string;
  advice: string | null;
  replacements: {
    keepLevel?: CompatReplacement[];
    keepMethod?: CompatReplacement[];
  } | null;
  sections_override: Record<string, CompatRating> | null;
  orderAdvice?: CompatOrderAdvice;
}

/** Полная запись с вычисленным полем sections (getCompatEntry) */
export interface CompatEntry extends CompatMatrixEntry {
  sections: Record<string, CompatRating>;
}

/* ── Константы алгоритма рейтингов (дословно, [6973–7010]) ───────────── */

/** Группы секций: core модулируются severity, meta — стабильнее */
export const SEC_GROUP: Readonly<Record<string, "core" | "meta">> = {
  sum: "core",
  graph: "core",
  theses: "core",
  dialogue: "core",
  critique: "core",
  origin: "core",
  glossary: "core",
  name: "meta",
  history: "meta",
  practical: "meta",
  evolution: "meta",
};

/** Профиль синергии для каждого метода [6990] */
export const METHOD_SYNERGY_PEAKS: Readonly<
  Record<SynthesisMethod, readonly string[] | null>
> = {
  dialectical: null, // равномерная синергия во всём документе
  integrative: null, // (на практике только с comparative)
  deconstructive: null, // равномерная деконструктивная синергия
  hermeneutical: null, // (на практике только с comparative)
  analytical: ["theses", "critique", "origin"], // верификация и формальный аудит
  creative: ["dialogue", "glossary"], // открытые, незамкнутые секции
};

/** Базовые рейтинги [core, meta] для каждого severity [7002] */
export const BASE_SECTION_RATING: Readonly<
  Record<CompatSeverity, readonly [CompatRating, CompatRating]>
> = {
  //                core    meta
  stable: ["★", "★"],
  tension: ["≈", "★"],
  synergy: ["★★", "★"],
  "synergy-max": ["★★★", "★★"],
  conflict: ["≈", "≈"],
  "hard-conflict": ["≈", "≈"],
};

/* ── Вычисление рейтингов (порт 1:1) ─────────────────────────────────── */

/**
 * Порт computeSectionRating(section, severity, method, overrides) [7245]:
 * 1) явное переопределение; 2) synergy-max × core — модуляция через
 * METHOD_SYNERGY_PEAKS; 3) базовый рейтинг по группе.
 */
export function computeSectionRating(
  section: string,
  severity: CompatSeverity,
  method: SynthesisMethod,
  overrides: Record<string, CompatRating> = {},
): CompatRating {
  // 1. Явное переопределение имеет наивысший приоритет
  if (Object.prototype.hasOwnProperty.call(overrides, section)) {
    return overrides[section] as CompatRating;
  }

  const group = SEC_GROUP[section] ?? "meta";
  const [baseCore, baseMeta] = BASE_SECTION_RATING[severity] ?? ["≈", "≈"];

  // 2. При synergy-max: модулируем core-секции через профиль метода
  if (severity === "synergy-max" && group === "core") {
    const peaks = METHOD_SYNERGY_PEAKS[method] ?? null;

    if (peaks !== null) {
      // Концентрированная синергия: пики → ★★★, остальные core → ★★
      return peaks.includes(section) ? "★★★" : "★★";
    }
    // Широкая синергия: все core → ★★★
    return "★★★";
  }

  // 3. Базовый рейтинг по группе
  return group === "core" ? baseCore : baseMeta;
}

/** Порт computeSections(severity, method, overrides) [7277]: 11 рейтингов. */
export function computeSections(
  severity: CompatSeverity,
  method: SynthesisMethod,
  overrides: Record<string, CompatRating> | null = {},
): Record<string, CompatRating> {
  const SECTIONS = [
    "sum",
    "graph",
    "glossary",
    "theses",
    "dialogue",
    "critique",
    "name",
    "history",
    "practical",
    "evolution",
    "origin",
  ];
  const ov = overrides ?? {};
  return Object.fromEntries(
    SECTIONS.map((sec) => [sec, computeSectionRating(sec, severity, method, ov)]),
  );
}

/* ── Публичные аксессоры (матрица — из Registry) ─────────────────────── */

/**
 * Порт getCompatEntry(level, method) [7298]: запись матрицы с вычисленным
 * полем sections. Матрица — getConfig("compat_matrix"). null, если пары нет.
 */
export async function getCompatEntry(
  level: string,
  method: string,
): Promise<CompatEntry | null> {
  const matrix =
    await getConfig<Record<string, CompatMatrixEntry>>("compat_matrix");
  const entry = matrix[`${level}:${method}`];
  if (!entry) return null;
  return {
    ...entry,
    sections: computeSections(
      entry.severity,
      method as SynthesisMethod,
      entry.sections_override,
    ),
  };
}

/** Порт getCompatEntryByKey(key) [7312] — например, "transformative:analytical". */
export async function getCompatEntryByKey(
  key: string,
): Promise<CompatEntry | null> {
  const [level, method] = key.split(":");
  return getCompatEntry(level ?? "", method ?? "");
}

/* ── UI-хелперы Advisor v2 (порт 1:1, [7325–7360]) ───────────────────── */

/** Маппинг рейтинга раздела → CSS-класс чипа */
export function chipClassForRating(r: CompatRating): string {
  if (r === "★★★" || r === "★★") return "chip-synergy";
  if (r === "★") return "chip-ok";
  if (r === "≈") return "chip-tension";
  if (r === "✗") return "chip-conflict";
  if (r === "✗✗") return "chip-hard-conflict";
  return "chip-ok";
}

/** Иконка для общего рейтинга */
export function iconForSeverity(sev: string): string {
  const map: Record<string, string> = {
    "synergy-max": "★★★",
    synergy: "★★",
    stable: "★",
    tension: "≈",
    conflict: "✗",
    "hard-conflict": "✗✗",
  };
  return map[sev] ?? "●";
}

/** Заголовок для общего рейтинга */
export function titleForSeverity(sev: string): string {
  const map: Record<string, string> = {
    "synergy-max": "Структурный резонанс",
    synergy: "Продуктивный парадокс",
    stable: "Надёжное качество",
    tension: "Управляемое напряжение",
    conflict: "Умеренный конфликт",
    "hard-conflict": "Жёсткий конфликт",
  };
  return map[sev] ?? "Совместимость параметров";
}

/* ── Section Dependency Warnings ─────────────────────────────────────── */

/** Результат computeSectionWarnings: secId → {needs (secId[]), label} */
export interface SectionWarningsMap {
  [secId: string]: { needs: string[]; label: string };
}

/**
 * Порт computeSectionWarnings(resolvedDeps) [6616] — 1:1: какие секции
 * требуют каких (по required-ключам через sourceOf; sum исключён).
 * Ключи результата — DOM-id формы (secGraph, …), как в исходнике.
 */
export function computeSectionWarnings(
  resolvedDeps: DepsMap,
): SectionWarningsMap {
  const warnings: SectionWarningsMap = {};
  for (const [sec, deps] of Object.entries(resolvedDeps)) {
    const secId = "sec" + sec.charAt(0).toUpperCase() + sec.slice(1);
    const needs = [
      ...new Set(
        deps.required
          .map((k) => sourceOf(k))
          .filter((src) => src !== "sum")
          .map((src) => "sec" + src.charAt(0).toUpperCase() + src.slice(1)),
      ),
    ];
    warnings[secId] = {
      needs,
      label:
        (SECTION_LABELS as Record<string, string>)[secId] ?? sec,
    };
  }
  return warnings;
}

/* ── Серверный аналог updateSectionWarnings [6645] ───────────────────── */

/** Один элемент панели предупреждений/рекомендаций/подстановок */
export interface SectionAdviceItem {
  /** ⚠ | ✗ | ✗✗ | 💡 | ⇄ — иконка исходника */
  icon: string;
  /** Текст сообщения (дословно из исходника, без HTML-разметки) */
  text: string;
  /** Для конфликтов ✗✗/✗ — severity для стилизации на клиенте */
  severity?: "hard-conflict" | "conflict";
}

export interface SectionAdviceInput {
  /** Выбранные разделы (ключи, без 'sum') — аналог checked-чекбоксов */
  sections: string[];
  synthLevel: SynthLevel;
  method: SynthesisMethod;
  generationOrder?: GenerationOrder | undefined;
}

export interface SectionAdvice {
  warnings: SectionAdviceItem[];
  recommendations: SectionAdviceItem[];
  substitutions: SectionAdviceItem[];
}

/** Обратный словарь contextKeyToSecId [6690] (10 записей, без capsule) */
const CONTEXT_KEY_TO_SEC_ID: Readonly<Record<string, string>> = {
  graph: "secGraph",
  glossary: "secGlossary",
  theses: "secTheses",
  name: "secName",
  history: "secHistory",
  practical: "secPractical",
  dialogue: "secDialogue",
  evolution: "secEvolution",
  critique: "secCritique",
  origin: "secOrigin",
};

/**
 * Серверный аналог updateSectionWarnings [6645]: четыре блока логики 1:1,
 * DOM → структурированные списки. Конфиги (матрица, deps, подстановки) —
 * из Registry; тексты сообщений — дословно из исходника.
 */
export async function computeSectionAdvice(
  input: SectionAdviceInput,
): Promise<SectionAdvice> {
  const warnings: SectionAdviceItem[] = [];
  const recommendations: SectionAdviceItem[] = [];
  const substitutions: SectionAdviceItem[] = [];

  const selected = new Set(input.sections);
  const isSelectedId = (secId: string): boolean => {
    const key = (SEC_ID_TO_KEY as Record<string, string>)[secId];
    return key !== undefined && selected.has(key);
  };
  const labelOf = (secId: string): string =>
    (SECTION_LABELS as Record<string, string>)[secId] ?? secId;

  const resolvedForWarnings = await resolveContextDeps({
    synthLevel: input.synthLevel,
    method: input.method,
    generationOrder: input.generationOrder,
  });
  const sectionWarnings = computeSectionWarnings(resolvedForWarnings);

  // ── 1. Предупреждения о зависимостях между разделами ─────────────────
  for (const [secId, cfg] of Object.entries(sectionWarnings)) {
    if (!isSelectedId(secId) || cfg.needs.length === 0) continue;
    const missing = cfg.needs.filter((depId) => !isSelectedId(depId));
    if (missing.length > 0) {
      const missingNames = missing.map((id) => "«" + labelOf(id) + "»").join(", ");
      const word = missing.length === 1 ? "раздела" : "разделов";
      warnings.push({
        icon: "⚠",
        text:
          "Без " +
          word +
          " " +
          missingNames +
          " раздел «" +
          cfg.label +
          "» будет ненадлежащего качества!",
      });
    }
  }

  // ── 2. Предупреждения: конфликт параметров для конкретных разделов ───
  const compatKey = input.synthLevel + ":" + input.method;
  const compatEntry = await getCompatEntryByKey(compatKey);

  if (compatEntry) {
    for (const [secId, secKey] of Object.entries(
      SEC_ID_TO_KEY as Record<SectionCheckboxId, string>,
    )) {
      if (!isSelectedId(secId)) continue;
      const secRating = compatEntry.sections[secKey];
      if (secRating === "✗✗") {
        const secLabel = labelOf(secId);
        warnings.push({
          icon: "✗✗",
          severity: "hard-conflict",
          text:
            "Раздел «" +
            secLabel +
            "» имеет жёсткий конфликт (✗✗) с текущей комбинацией " +
            SL[input.synthLevel] +
            " × " +
            ML[input.method] +
            ". Результат будет содержать противоречивые директивы!",
        });
      } else if (secRating === "✗") {
        const secLabel = labelOf(secId);
        warnings.push({
          icon: "✗",
          severity: "conflict",
          text:
            "Раздел «" +
            secLabel +
            "» имеет умеренный конфликт (✗) с текущей комбинацией " +
            SL[input.synthLevel] +
            " × " +
            ML[input.method] +
            ". Рекомендуется исключить этот раздел или изменить параметры.",
        });
      }
    }
  }

  // ── 3. Мягкие рекомендации: необязательный контекст из CONTEXT_DEPS ──
  {
    const benefitMap: Record<string, string[]> = {};

    for (const [secId, depKey] of Object.entries(CONTEXT_KEY_TO_SEC_ID).map(
      ([k, v]) => [v, k] as const,
    )) {
      // secIdToDepKey исходника — инверсия contextKeyToSecId (те же 10 пар)
      if (!isSelectedId(secId)) continue;

      const deps = resolvedForWarnings[depKey];
      if (!deps || !deps.optional || deps.optional.length === 0) continue;

      for (const optKey of deps.optional) {
        const parentSection = optKey.split(":")[0] ?? "";
        if (parentSection === "sum") continue;

        const parentSecId = CONTEXT_KEY_TO_SEC_ID[parentSection];
        if (!parentSecId) continue;

        if (isSelectedId(parentSecId)) continue;

        const sectionWarningCfg = sectionWarnings[secId];
        if (sectionWarningCfg && sectionWarningCfg.needs.includes(parentSecId))
          continue;

        benefitMap[parentSecId] ??= [];
        const consumerLabel = labelOf(secId);
        if (!benefitMap[parentSecId].includes(consumerLabel)) {
          benefitMap[parentSecId].push(consumerLabel);
        }
      }
    }

    for (const [srcSecId, consumers] of Object.entries(benefitMap)) {
      const srcLabel = labelOf(srcSecId);
      const consumerList = consumers.map((c) => "«" + c + "»").join(", ");
      const word = consumers.length === 1 ? "раздела" : "разделов";
      recommendations.push({
        icon: "💡",
        text:
          "Включение «" +
          srcLabel +
          "» может улучшить качество " +
          word +
          " " +
          consumerList +
          " (дополнительный контекст).",
      });
    }
  }

  // ── 4. Уведомления о подстановках контекста ──────────────────────────
  {
    const subMap: SubstitutionMap = await getActiveSubstitutionMap(
      input.generationOrder,
    );
    const currentSections = input.sections;

    // Deep-clone, чтобы resolveCircularDeps не мутировал оригинал
    const effDeps = buildEffectiveDepsWith(
      currentSections,
      resolvedForWarnings,
      subMap,
    );
    const effDepsClone: DepsMap = {};
    for (const [k, v] of Object.entries(effDeps)) {
      effDepsClone[k] = {
        required: [...v.required],
        optional: [...v.optional],
      };
    }
    const predsClone = computePredecessors(effDepsClone);
    resolveCircularDeps(predsClone, effDepsClone, resolvedForWarnings, subMap);

    // Используем effDepsClone (после разрешения циклов) для уведомлений
    const resolvedEffDeps = effDepsClone;

    for (const [sec, deps] of Object.entries(resolvedEffDeps)) {
      const originalDeps = resolvedForWarnings[sec];
      // Множество всех ключей в оригинальных deps — и required, и optional
      const origAllKeys = new Set([
        ...(originalDeps?.required ?? []),
        ...(originalDeps?.optional ?? []),
      ]);

      // Перебираем и required, и optional из effectiveDeps
      for (const ctxKey of [...deps.required, ...deps.optional]) {
        // Если ключ присутствует в оригинале — это не замена, пропускаем
        if (origAllKeys.has(ctxKey)) continue;

        const q = getSubstituteQuality(ctxKey, subMap);
        const qLabel =
          q === 3
            ? "равноценная замена"
            : q === 2
              ? "частичная замена"
              : "слабая замена";
        const secLabel =
          (SECTION_LABELS as Record<string, string>)[
            "sec" + sec.charAt(0).toUpperCase() + sec.slice(1)
          ] ?? sec;
        substitutions.push({
          icon: "⇄",
          text:
            `«${secLabel}»: контекст «${(CTX_LABELS as Record<string, string>)[ctxKey] ?? ctxKey}» ` +
            `используется как ${qLabel} для недостающего контекста.`,
        });
      }
    }
  }

  return { warnings, recommendations, substitutions };
}
