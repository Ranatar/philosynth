/**
 * Synthesis Engine — ядро (01-architecture §4.2; беседа 1.1).
 *
 * Порт из philosynth.html:
 *  - resolveContextDeps [6267] — резолвер зависимостей (BASE/GENETIC +
 *    уровне- и метод-патчи через deepMergeUniq);
 *  - buildEffectiveDeps [6444] — эффективные зависимости с подстановками;
 *  - findSubstitute [6423] — поиск заменителя недостающего ctx-ключа;
 *  - getActiveSubstitutionMap [6434] — активная карта подстановок по порядку
 *    генерации;
 *  - deepMergeUniq / sourceOf / getSubstituteQuality — реализованы в
 *    server/utils (deep-merge.ts, topo-sort.ts — по 04/05), здесь
 *    реэкспортируются (состав модуля — протокол 07, беседа 1.1, п. 1).
 *
 * Адаптация к сервису:
 *  - все конфиги (CONTEXT_DEPS_*, SUBSTITUTION_MAP*) читаются из
 *    Prompt Registry (prompt-registry.getConfig, Redis-кэш поверх
 *    synthesis_configs) — не хардкод → функции, которым нужны конфиги,
 *    асинхронны;
 *  - DOC_STATE отсутствует: getActiveSubstitutionMap принимает
 *    generationOrder параметром (в исходнике — DOC_STATE.params);
 *  - fallback `resolvedDeps ?? CONTEXT_DEPS_BASE` исходника снят —
 *    resolvedDeps обязателен (глобальных конфигов нет);
 *  - buildEffectiveDeps: асинхронная обёртка (сама тянет карту подстановок)
 *    + чистое ядро buildEffectiveDepsWith(selectedSections, resolvedDeps,
 *    substitutionMap) — для advisor'а, тестов и вызовов с уже загруженной
 *    картой. Логика ядра — 1:1.
 *
 * Топологический слой (computePredecessors, buildDynamicOrder,
 * resolveCircularDeps) — server/utils/topo-sort.ts (беседа 1.1, п. 2).
 */

import type {
  GenerationOrder,
  SynthesisMethod,
  SynthLevel,
} from "@philosynth/shared/types/synthesis";

import type { DepsMap, PartialDepsMap } from "../utils/deep-merge.js";
import { deepMergeUniq } from "../utils/deep-merge.js";
import type { SubstitutionMap } from "../utils/topo-sort.js";
import { sourceOf } from "../utils/topo-sort.js";
import { getConfig } from "./prompt-registry.js";

/* ── Реэкспорт состава модуля по протоколу (беседа 1.1, п. 1) ─────────── */

export { deepMergeUniq } from "../utils/deep-merge.js";
export type { DepsMap, PartialDepsMap, SectionDeps } from "../utils/deep-merge.js";
export { getSubstituteQuality, sourceOf } from "../utils/topo-sort.js";
export type {
  SubstituteCandidate,
  SubstitutionMap,
} from "../utils/topo-sort.js";

/* ── Параметры резолвера ─────────────────────────────────────────────── */

/** Минимальный срез параметров синтеза для резолвера зависимостей */
export interface ContextDepsParams {
  synthLevel?: SynthLevel | undefined;
  method?: SynthesisMethod | undefined;
  generationOrder?: GenerationOrder | undefined;
}

/**
 * Порт resolveContextDeps(p) [6267]. Конфиги — из Registry:
 *  - architectural: context_deps.base + context_deps.level[level]
 *    + context_deps.method[method];
 *  - genetic: context_deps.genetic + context_deps.level_genetic[level]
 *    + context_deps.method[method] (метод-патчи применимы и к генетическому).
 * Слияние — deepMergeUniq, дефолты уровней/метода — как в исходнике.
 */
export async function resolveContextDeps(
  p: ContextDepsParams,
): Promise<DepsMap> {
  const level = p.synthLevel ?? "comparative";
  const method = p.method ?? "dialectical";
  const order = p.generationOrder ?? "architectural";

  if (order === "genetic") {
    const [genetic, levelGenetic, methodPatch] = await Promise.all([
      getConfig<PartialDepsMap>("context_deps.genetic"),
      getConfig<Record<string, PartialDepsMap>>("context_deps.level_genetic"),
      getConfig<Record<string, PartialDepsMap>>("context_deps.method"),
    ]);
    return deepMergeUniq(
      genetic,
      levelGenetic[level] ?? {},
      methodPatch[method] ?? {}, // метод-патчи применимы и к генетическому
    );
  }

  const [base, levelPatch, methodPatch] = await Promise.all([
    getConfig<PartialDepsMap>("context_deps.base"),
    getConfig<Record<string, PartialDepsMap>>("context_deps.level"),
    getConfig<Record<string, PartialDepsMap>>("context_deps.method"),
  ]);
  return deepMergeUniq(base, levelPatch[level] ?? {}, methodPatch[method] ?? {});
}

/* ── Подстановки ─────────────────────────────────────────────────────── */

/**
 * Порт getActiveSubstitutionMap() [6434]. В исходнике порядок брался из
 * DOC_STATE.params — здесь передаётся параметром; карта — из Registry
 * (substitution_map / substitution_map_genetic).
 */
export async function getActiveSubstitutionMap(
  generationOrder?: GenerationOrder,
): Promise<SubstitutionMap> {
  return generationOrder === "genetic"
    ? getConfig<SubstitutionMap>("substitution_map_genetic")
    : getConfig<SubstitutionMap>("substitution_map");
}

/**
 * Порт findSubstitute(ctxKey, available, selfSection, substitutionMap) [6423]:
 * первый (наивысшее качество) кандидат, чей источник доступен и не является
 * selfSection. Карта обязательна (fallback на глобальную SUBSTITUTION_MAP
 * исходника в сервисе невозможен).
 */
export function findSubstitute(
  ctxKey: string,
  available: ReadonlySet<string>,
  selfSection: string,
  substitutionMap: SubstitutionMap,
): string | null {
  const candidates = substitutionMap[ctxKey] ?? [];
  // Берём первый (наивысшее качество), чей источник доступен и не является selfSection
  for (const { key } of candidates) {
    const src = sourceOf(key);
    if (src !== selfSection && available.has(src)) return key;
  }
  return null;
}

/* ── Эффективные зависимости ─────────────────────────────────────────── */

/**
 * Чистое ядро buildEffectiveDeps [6444] — логика 1:1, карта подстановок
 * передаётся явно. Понижение required→optional при качестве заменителя < 3 —
 * как в исходнике (subQuality ищется в списке кандидатов ИСХОДНОГО ключа).
 */
export function buildEffectiveDepsWith(
  selectedSections: string[],
  resolvedDeps: DepsMap,
  substitutionMap: SubstitutionMap,
): DepsMap {
  const available = new Set(["sum", ...selectedSections]);
  const result: DepsMap = {};

  for (const sec of selectedSections) {
    const base = resolvedDeps[sec];
    if (!base) {
      result[sec] = { required: [], optional: [] };
      continue;
    }

    const effective: { required: string[]; optional: string[] } = {
      required: [],
      optional: [],
    };

    const resolve = (ctxKey: string, tier: "required" | "optional"): void => {
      const src = sourceOf(ctxKey);
      if (available.has(src)) {
        effective[tier].push(ctxKey);
      } else {
        const sub = findSubstitute(ctxKey, available, sec, substitutionMap);
        if (sub) {
          const subQuality =
            (substitutionMap[ctxKey] ?? []).find((c) => c.key === sub)?.q ?? 1;
          const effectiveTier =
            tier === "required" && subQuality < 3 ? "optional" : tier;
          effective[effectiveTier].push(sub);
        }
      }
    };

    for (const k of base.required) resolve(k, "required");
    for (const k of base.optional) resolve(k, "optional");

    result[sec] = {
      required: [...new Set(effective.required)],
      optional: [...new Set(effective.optional)],
    };
  }
  return result;
}

/**
 * Порт buildEffectiveDeps(selectedSections, resolvedDeps, generationOrder)
 * [6444] — асинхронная обёртка: карта подстановок выбирается по порядку
 * генерации из Registry, ядро — buildEffectiveDepsWith.
 */
export async function buildEffectiveDeps(
  selectedSections: string[],
  resolvedDeps: DepsMap,
  generationOrder?: GenerationOrder,
): Promise<DepsMap> {
  const substitutionMap = await getActiveSubstitutionMap(generationOrder);
  return buildEffectiveDepsWith(selectedSections, resolvedDeps, substitutionMap);
}
