/**
 * Parent Context — селективный родительский контекст мета-синтеза
 * (01-architecture §4.13 часть I; 04-code-reuse-map §1.10; беседа 1.3).
 *
 * Порт из philosynth.html:
 *  - _validateParentDeps  [10055] — самопроверка карт на неизвестные поля;
 *  - resolveParentDeps    [10092] — 4-слойное слияние карт (BASE (+GENETIC)
 *    + LEVEL[level] + METHOD[method]) через тот же deepMergeUniq, что и
 *    CONTEXT_DEPS;
 *  - resolveParentDepsForSubsection [10114] — spec подраздела: пересечение
 *    intra-полей с section-полями (intra НЕ расширяет section);
 *  - parentFieldsUsedFor  [10182] — фактически использованные поля
 *    (spec ∩ непустые у родителей) в каноническом порядке;
 *  - buildParentSpecForLog [10197] — разбивка для ctxLog.parentSpec.
 *
 * НЕ здесь (по 04-code-reuse-map §1.10):
 *  - conceptContextBlockFull/Selective → meta-synthesis-service (беседа 3.1);
 *  - applyBudgetPressure/parentOverheadForSection/computeConceptOverhead →
 *    context-builder.ts (эта же беседа, бюджетная часть §4.13 ч. II).
 *
 * Адаптация к сервису:
 *  - карты PARENT_* читаются из Prompt Registry (getConfig) — как
 *    CONTEXT_DEPS в synthesis-engine → резолверы асинхронны;
 *  - _validateParentDeps в исходнике вызывается при загрузке модуля; здесь
 *    это явная validateParentDeps() (конфиги приезжают из БД, а не из
 *    литералов), вызывается сидом/стартом при необходимости.
 */

import type { ParentSpecLog } from "@philosynth/shared/types/generation";

import { deepMergeUniq } from "../utils/deep-merge.js";
import type { PartialDepsMap, SectionDeps } from "../utils/deep-merge.js";
import { getConfig } from "./prompt-registry.js";

/* ── Типы ────────────────────────────────────────────────────────────── */

/** Поле родительской концепции (PARENT_FIELD_ORDER) */
export type ParentField = string;

/** Минимальный срез параметров для резолвера родительских зависимостей */
export interface ParentDepsParams {
  generationOrder?: string | undefined;
  synthLevel?: string | undefined;
  method?: string | undefined;
}

/**
 * Концепция-родитель в форме исходника: type="concept" + текстовые поля из
 * PARENT_FIELD_ORDER (capsule, goals, portraits, tensions, graphNodes,
 * graphEdges, dialogueConcepts, dialogueSynthesis, glossaryCompact,
 * thesesSummary). Наполнение — importConceptAsParticipant (беседа 3.1).
 * API сервиса помечает концепции type="synthesis" — принимаются оба.
 */
export interface ConceptParticipant {
  type: string;
  name?: string | undefined;
  [field: string]: unknown;
}

/** Карта intra-зависимостей: раздел → подраздел → частичный spec */
type ParentIntraDepsMap = Record<
  string,
  Record<string, Partial<SectionDeps> | undefined> | undefined
>;

/** Концепция ли участник (исходник: "concept"; API сервиса: "synthesis") */
export function isConceptParticipant(p: { type?: string } | null | undefined): boolean {
  return !!p && (p.type === "concept" || p.type === "synthesis");
}

/** Значение текстового поля родителя ("" для отсутствующих/нестроковых) */
export function parentFieldValue(c: ConceptParticipant, field: ParentField): string {
  const v = c[field];
  return typeof v === "string" ? v : "";
}

/* ── Конфиги из Registry ─────────────────────────────────────────────── */

export async function getParentFieldOrder(): Promise<readonly ParentField[]> {
  return getConfig<ParentField[]>("parent_field_order");
}

export async function getParentFieldLabels(): Promise<
  Readonly<Record<string, string>>
> {
  return getConfig<Record<string, string>>("parent_field_labels");
}

async function getParentIntraDeps(): Promise<ParentIntraDepsMap> {
  return getConfig<ParentIntraDepsMap>("parent_intra_deps");
}

/* ── resolveParentDeps [10092] ───────────────────────────────────────── */

/**
 * Порт resolveParentDeps(p) [10092]:
 *  - architectural: BASE + LEVEL[level] + METHOD[method];
 *  - genetic:       BASE + GENETIC + LEVEL_GENETIC[level] + METHOD[method].
 * Дефолты (architectural / comparative / dialectical) — как в исходнике.
 */
export async function resolveParentDeps(
  p: ParentDepsParams,
): Promise<Record<string, SectionDeps>> {
  const order = p.generationOrder || "architectural";
  const level = p.synthLevel || "comparative";
  const method = p.method || "dialectical";

  const [base, levelMap, levelGeneticMap, methodMap, genetic] = await Promise.all([
    getConfig<PartialDepsMap>("parent_deps.base"),
    getConfig<Record<string, PartialDepsMap>>("parent_deps.level"),
    getConfig<Record<string, PartialDepsMap>>("parent_deps.level_genetic"),
    getConfig<Record<string, PartialDepsMap>>("parent_deps.method"),
    order === "genetic"
      ? getConfig<PartialDepsMap>("parent_deps.genetic")
      : Promise.resolve({} as PartialDepsMap),
  ]);

  if (order === "genetic") {
    return deepMergeUniq(
      base,
      genetic,
      levelGeneticMap[level] ?? {},
      methodMap[method] ?? {},
    );
  }
  return deepMergeUniq(base, levelMap[level] ?? {}, methodMap[method] ?? {});
}

/** Нормализация ключа секции исходника: "graph+glossary:sub" → "graph" */
export function normalizeSectionKey(sectionKey: string | null | undefined): string {
  return String(sectionKey || "").split("+")[0]?.split(":")[0] ?? "";
}

/**
 * Порт resolveParentDepsForSubsection(p, sectionKey, subsectionName) [10114].
 * Нет intra-записи → полный section-spec; явный `{}` → тоже полный;
 * иначе — пересечение intra-полей с section-полями (intra не расширяет
 * section). Fallback при отсутствии section-записи — {required:["capsule"]}.
 */
export async function resolveParentDepsForSubsection(
  p: ParentDepsParams,
  sectionKey: string,
  subsectionName: string,
): Promise<SectionDeps> {
  const key = normalizeSectionKey(sectionKey);
  const resolved = await resolveParentDeps(p);
  const secDeps: SectionDeps = resolved[key] ?? { required: ["capsule"], optional: [] };

  const intraMap = await getParentIntraDeps();
  const intra = intraMap[key]?.[subsectionName];
  if (!intra) return secDeps;

  const hasR = Array.isArray(intra.required);
  const hasO = Array.isArray(intra.optional);
  if (!hasR && !hasO) return secDeps; // явный {} — полный section-spec

  const secAll = new Set([...(secDeps.required ?? []), ...(secDeps.optional ?? [])]);
  return {
    required: (intra.required ?? []).filter((f) => secAll.has(f)),
    optional: (intra.optional ?? []).filter((f) => secAll.has(f)),
  };
}

/**
 * Spec раздела или подраздела одной функцией — общий вход для
 * parentOverheadForSection / buildParentSpecForLog / conceptContextBlock*
 * (в исходнике эта развилка дублируется в каждом из них: [10150], [10197]).
 */
export async function resolveParentSpec(
  p: ParentDepsParams,
  sectionKey: string,
  subsectionName?: string | undefined,
): Promise<SectionDeps> {
  if (subsectionName) {
    return resolveParentDepsForSubsection(p, sectionKey, subsectionName);
  }
  const key = normalizeSectionKey(sectionKey);
  const resolved = await resolveParentDeps(p);
  return resolved[key] ?? { required: ["capsule"], optional: [] };
}

/* ── parentFieldsUsedFor [10182] ─────────────────────────────────────── */

/**
 * Порт parentFieldsUsedFor(p, sectionKey, subsectionName) [10182]:
 * фактически использованные поля = (required ∪ optional) ∩ непустые
 * хотя бы у одного родителя, в каноническом порядке PARENT_FIELD_ORDER.
 */
export async function parentFieldsUsedFor(
  participants: readonly ConceptParticipant[] | null | undefined,
  p: ParentDepsParams,
  sectionKey: string,
  subsectionName?: string | undefined,
): Promise<ParentField[]> {
  const concepts = (participants ?? []).filter(isConceptParticipant);
  if (concepts.length === 0) return [];

  const spec = await resolveParentSpec(p, sectionKey, subsectionName);
  const allowed = new Set([...(spec.required ?? []), ...(spec.optional ?? [])]);
  const order = await getParentFieldOrder();

  return order.filter(
    (fld) => allowed.has(fld) && concepts.some((c) => parentFieldValue(c, fld) !== ""),
  );
}

/* ── buildParentSpecForLog [10197] ───────────────────────────────────── */

/**
 * Порт buildParentSpecForLog(participants, sectionKey, order, synthLevel,
 * method, subsectionName) [10197]. Возвращает null, если концепций нет
 * (как в исходнике) — тогда в ctxLog.parentSpec пишется null.
 *
 * Формула веса на родителя — дословно: Σ (длина поля + длина метки + 4)
 * по включённым полям, плюс 90 симв. служебной обвязки и длина имени.
 */
export async function buildParentSpecForLog(
  participants: readonly ConceptParticipant[] | null | undefined,
  p: ParentDepsParams,
  sectionKey: string,
  subsectionName?: string | undefined,
): Promise<ParentSpecLog | null> {
  const concepts = (participants ?? []).filter(isConceptParticipant);
  if (concepts.length === 0) return null;

  const spec = await resolveParentSpec(p, sectionKey, subsectionName);
  const required = spec.required ?? ["capsule"];
  const optional = spec.optional ?? [];
  const allAllowed = new Set([...required, ...optional]);

  const [order, labels] = await Promise.all([
    getParentFieldOrder(),
    getParentFieldLabels(),
  ]);

  const perParent = concepts.map((c) => {
    const included: string[] = [];
    const omitted: string[] = [];
    const missingRequired: string[] = [];

    for (const fld of order) {
      const has = parentFieldValue(c, fld) !== "";
      if (allAllowed.has(fld)) {
        if (has) included.push(fld);
        else if (required.includes(fld)) missingRequired.push(fld);
      } else if (has) {
        omitted.push(fld);
      }
    }

    let chars = 0;
    for (const fld of included) {
      chars += parentFieldValue(c, fld).length;
      chars += (labels[fld] ?? fld).length + 4;
    }
    chars += 90 + (c.name ?? "").length;

    return {
      name: c.name ?? "",
      includedFields: included,
      omittedFields: omitted,
      missingRequired,
      chars,
    };
  });

  const totalChars = perParent.reduce((s, pp) => s + pp.chars, 0);
  return { required, optional, perParent, totalChars };
}

/* ── _validateParentDeps [10055] ─────────────────────────────────────── */

/**
 * Порт _validateParentDeps() [10055]: самопроверка карт на неизвестные
 * поля. В исходнике вызывается при загрузке модуля; здесь — явно (карты
 * приходят из БД). Возвращает список предупреждений вместо console.warn,
 * чтобы вызывающий (сид, старт, тесты) решал, как их подать.
 */
export async function validateParentDeps(): Promise<string[]> {
  const warnings: string[] = [];
  const order = await getParentFieldOrder();
  const valid = new Set<string>(order);

  const check = (map: PartialDepsMap | undefined, name: string): void => {
    for (const [section, spec] of Object.entries(map ?? {})) {
      for (const tier of ["required", "optional"] as const) {
        for (const fld of spec?.[tier] ?? []) {
          if (!valid.has(fld)) {
            warnings.push(
              `[${name}] неизвестное поле «${fld}» в разделе "${section}" (${tier})`,
            );
          }
        }
      }
    }
  };

  const [base, genetic, level, levelGenetic, method, intra] = await Promise.all([
    getConfig<PartialDepsMap>("parent_deps.base"),
    getConfig<PartialDepsMap>("parent_deps.genetic"),
    getConfig<Record<string, PartialDepsMap>>("parent_deps.level"),
    getConfig<Record<string, PartialDepsMap>>("parent_deps.level_genetic"),
    getConfig<Record<string, PartialDepsMap>>("parent_deps.method"),
    getParentIntraDeps(),
  ]);

  check(base, "PARENT_DEPS_BASE");
  check(genetic, "PARENT_DEPS_GENETIC");
  for (const [lvl, map] of Object.entries(level)) check(map, `PARENT_DEPS_LEVEL[${lvl}]`);
  for (const [lvl, map] of Object.entries(levelGenetic))
    check(map, `PARENT_DEPS_LEVEL_GENETIC[${lvl}]`);
  for (const [m, map] of Object.entries(method)) check(map, `PARENT_DEPS_METHOD[${m}]`);
  for (const [section, subs] of Object.entries(intra)) {
    for (const [subName, spec] of Object.entries(subs ?? {})) {
      check({ [subName]: spec ?? {} }, `PARENT_INTRA_DEPS[${section}]`);
    }
  }

  return warnings;
}
