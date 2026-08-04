/**
 * cascade-analyzer — каскадный анализ зависимостей (беседа 2.1;
 * карта 04 §1.1, 01-arch §4.5, §4.14 п.6).
 *
 * Порты из philosynth.html (номера строк — ревизия 26 024):
 *  - computeDependents [5473] — обращение predecessors;
 *  - canonicalSubsectionKey [9753] — каноникализация портретных заголовков
 *    (v11, 01-arch §4.14 п.6): варианты SUBSECTION_SUM_PORTRAIT
 *    схлопываются в канон, в котором хранятся INTRA_DEPS и
 *    SUBSECTION_TO_CTX_KEYS;
 *  - getIntraDependents [9566] — транзитивные внутрисекционные зависимые;
 *  - buildCtxKeyConsumers [9690] — обратная карта ключ → потребители
 *    (гранулярный каскад, v11);
 *  - getCrossSecDependents [9767] — межсекционные зависимые подраздела;
 *  - getAffectedModes [22814] — затронутые результаты режимов;
 *  - sortInTopoOrder [20482];
 *  - buildFactualDepsMap [5501] / computeFactualDependents [5544] —
 *    ФАКТИЧЕСКИЕ зависимости из ctxLog (context_log);
 *  - analyzeImpact — серверный аналог РАСЧЁТНОЙ части updateLiveCascade
 *    [19139–19505]: downstream (B), upstream добавляемых (C1–C3),
 *    затронутые режимы (E5) и весовые подсказки (E1, factReverse);
 *    DOM-рендер (панель #cascadePanel) — клиент, беседа 2.3.
 *
 * Адаптации DOM/DOC_STATE → сервис:
 *  - DOC_STATE.params / sectionOrder / resolvedDeps / effectiveDeps /
 *    sectionDefs / modes / factualDeps → аргументы функций; analyzeImpact
 *    поднимает всё из БД сам (единственная функция модуля с БД-доступом);
 *  - _SUM_PORTRAIT_VARIANTS — из Registry (конфиг subsection_map, поле
 *    sumPortraitVariants; как buildSubsectionMap в 1.2) → каноникализация
 *    асинхронна; для sync-потребителей (колбэк
 *    extractRelevantIntraSectionContext из 1.3) — getCanonicalizer(),
 *    возвращающий синхронную функцию с уже загруженными вариантами;
 *  - INTRA_DEPS / SUBSECTION_TO_CTX_KEYS / MODE_DEPS — из Registry
 *    (intra_deps / subsection_ctx_keys / mode_deps), не из server/config;
 *  - getEffectiveModeDeps [22558] — ВЛАДЕЛЕЦ mode-service (беседа 4.1,
 *    карта 04 §1.11); здесь минимальный локальный порт
 *    getEffectiveModeDepsFromConfig, TODO(4.1): при создании mode-service
 *    перевести на импорт оттуда. MODE_CONFIG.title (тоже 4.1) заменён
 *    словарём MODE_TITLES (значения — дословно из MODE_CONFIG исходника
 *    [22579]);
 *  - статусы entries ctxLog совпадают с исходником
 *    (found/truncated/missing/…, сверено с context-builder 1.3) —
 *    buildFactualDepsMap портируется 1:1.
 *
 * Реэкспорты для соответствия карте 04:
 *  - sourceOf — портирован в 1.1 (server/utils/topo-sort.ts), карта числит
 *    его здесь;
 *  - buildPlanOrder — модуль plan-order-builder.ts (05), первый запрос 2.1
 *    числит его здесь.
 */

import { and, asc, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  contextLog,
  modeResults,
  syntheses,
  synthesisLineage,
} from "../db/schema.js";
import { sourceOf, getSubstituteQuality } from "../utils/topo-sort.js";
import {
  buildEffectiveDeps,
  getActiveSubstitutionMap,
  resolveContextDeps,
} from "./synthesis-engine.js";
import { buildDynamicOrder } from "../utils/topo-sort.js";
import {
  SUBSECTION_SUM_PORTRAIT,
  buildSubsectionMap,
} from "./section-defs-builder.js";
import { getConfig } from "./prompt-registry.js";

import { CTX_LABELS } from "@philosynth/shared/constants/ctx-keys";
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";

import type { ContextEntry } from "@philosynth/shared/types/generation";
import type {
  GenerationOrder,
  SynthesisMethod,
  SynthLevel,
  Depth,
} from "@philosynth/shared/types/synthesis";
import type { DepsMap, SectionDeps } from "../utils/deep-merge.js";
import type { PromptParams } from "./prompt-builder.js";
import type {
  SectionParts,
  SubsectionMapConfig,
} from "./section-defs-builder.js";

/* ── Реэкспорты (соответствие карте 04 и первому запросу 2.1) ────────── */

export { sourceOf } from "../utils/topo-sort.js";
export { buildPlanOrder } from "./plan-order-builder.js";
export type { PlanOrderInput, PlanOrderItem } from "./plan-order-builder.js";

const LBL = KEY_LABELS as Record<string, string>;
const CTX = CTX_LABELS as Record<string, string>;

/* ══ computeDependents [5473] ═════════════════════════════════════════ */

import { computePredecessors } from "../utils/topo-sort.js";

/**
 * Обращение карты предшественников: dependents[B] = разделы, зависящие
 * от B. Порт 1:1.
 */
export function computeDependents(
  effectiveDeps: DepsMap,
): Record<string, Set<string>> {
  const preds = computePredecessors(effectiveDeps);
  const dependents: Record<string, Set<string>> = {};
  for (const sec of Object.keys(effectiveDeps)) {
    dependents[sec] = new Set();
  }
  // Если B ∈ preds[A], значит A зависит от B → B влияет на A → A ∈ dependents[B]
  for (const [sec, predSet] of Object.entries(preds)) {
    for (const pred of predSet) {
      if (!dependents[pred]) dependents[pred] = new Set();
      (dependents[pred] as Set<string>).add(sec);
    }
  }
  return dependents;
}

/* ══ canonicalSubsectionKey [9753] ════════════════════════════════════ */

/** Канонический ключ портретного подраздела sum (в нём хранятся карты). */
export const PORTRAIT_CANON = "Портрет каждого философа";

/**
 * Чистое ядро canonicalSubsectionKey [9753]: варианты портретного
 * заголовка переданы явно (в исходнике — глобал _SUM_PORTRAIT_VARIANTS).
 */
export function canonicalSubsectionKeyWith(
  variants: ReadonlySet<string>,
  sectionKey: string,
  subsectionName: string,
): string {
  if (sectionKey === "sum" && variants.has(subsectionName)) {
    return PORTRAIT_CANON;
  }
  return subsectionName;
}

/**
 * Синхронный каноникализатор с уже загруженными вариантами из Registry —
 * для колбэка extractRelevantIntraSectionContext (context-builder, 1.3;
 * закрытие TODO(2.1)) и для внутренних потребителей модуля.
 */
export async function getCanonicalizer(): Promise<
  (sectionKey: string, subsectionName: string) => string
> {
  const cfg = await getConfig<SubsectionMapConfig>("subsection_map");
  const variants: ReadonlySet<string> = new Set(cfg.sumPortraitVariants);
  return (sectionKey, subsectionName) =>
    canonicalSubsectionKeyWith(variants, sectionKey, subsectionName);
}

/**
 * Порт canonicalSubsectionKey(sectionKey, subsectionName) [9753] —
 * удобная async-форма (варианты — из Registry).
 */
export async function canonicalSubsectionKey(
  sectionKey: string,
  subsectionName: string,
): Promise<string> {
  return (await getCanonicalizer())(sectionKey, subsectionName);
}

/* ══ getIntraDependents [9566] ════════════════════════════════════════ */

/**
 * Порт getIntraDependents(sectionKey, subsectionName): транзитивные
 * ВНУТРИсекционные зависимые подраздела по INTRA_DEPS (BFS вниз).
 * DOC_STATE.params → параметр p (нужен buildSubsectionMap и
 * SUBSECTION_SUM_PORTRAIT для денормализации имён под фактическую
 * кардинальность документа). INTRA_DEPS — из Registry.
 */
export async function getIntraDependents(
  p: PromptParams,
  sectionKey: string,
  subsectionName: string,
): Promise<string[]> {
  const intraDeps = await getConfig<
    Record<string, Record<string, string[]> | undefined>
  >("intra_deps");
  const deps = intraDeps[sectionKey] ?? {};
  const result = new Set<string>();
  const actualSubMap = await buildSubsectionMap(p);
  const actualSubs = new Set(actualSubMap[sectionKey] ?? Object.keys(deps));

  // Канонизируем input: в INTRA_DEPS имя подраздела «Портрет...»
  // зафиксировано как канон («Портрет каждого философа»), но в документе
  // оно может иметь другой вид — приводим.
  const canonicalize = await getCanonicalizer();
  const canonInput = canonicalize(sectionKey, subsectionName);
  // И обратная карта «канон → актуальное отображаемое имя» — для того,
  // чтобы вернуть имена, совпадающие с фактическими подразделами.
  const portraitActual =
    sectionKey === "sum" ? SUBSECTION_SUM_PORTRAIT(p) : null;
  const denormalize = (name: string): string =>
    sectionKey === "sum" && name === PORTRAIT_CANON && portraitActual
      ? portraitActual
      : name;

  const queue: string[] = [canonInput];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const [sub, sources] of Object.entries(deps)) {
      if (sources.includes(current) && !result.has(denormalize(sub))) {
        const actualName = denormalize(sub);
        if (actualSubs.has(actualName)) {
          result.add(actualName);
          queue.push(sub); // для дальнейшего обхода — канон
        }
      }
    }
  }

  return [...result];
}

/* ══ buildCtxKeyConsumers [9690] ══════════════════════════════════════ */

/** Потребитель ctx-ключа: раздел и (если гранулярность есть) подраздел. */
export interface CtxKeyConsumer {
  section: string;
  subsection: string | null;
}

/** sectionDefs в объёме, нужном гранулярному каскаду (def.parts из 1.2). */
export type SectionDefsForCascade = Record<
  string,
  { parts?: SectionParts | undefined } | undefined
>;

/**
 * Порт buildCtxKeyConsumers() [9690]: обратная карта ключ → подразделы-
 * потребители («перегенерировать подраздел, а не весь раздел», v11).
 * DOC_STATE.resolvedDeps → параметр depsSource (актуальные зависимости,
 * учитывающие generationOrder/level/method); DOC_STATE.sectionDefs →
 * необязательный sectionDefs (без него — потребитель «весь раздел»).
 */
export function buildCtxKeyConsumers(
  depsSource: DepsMap,
  sectionDefs?: SectionDefsForCascade,
): Record<string, CtxKeyConsumer[]> {
  const consumers: Record<string, CtxKeyConsumer[]> = {};

  for (const [sectionKey, deps] of Object.entries(depsSource)) {
    const allKeys = [...(deps.required || []), ...(deps.optional || [])];

    for (const ctxKey of allKeys) {
      if (!consumers[ctxKey]) consumers[ctxKey] = [];
      const list = consumers[ctxKey] as CtxKeyConsumer[];

      // Определяем, какие подразделы используют этот ключ.
      // Если раздел имеет parts с shared-блоками, scope указывает
      // конкретных потребителей. Иначе — весь раздел является потребителем
      // (без гранулярности до подразделов).
      const def = sectionDefs?.[sectionKey];
      if (def?.parts) {
        const sharedScopes: string[] = [];
        for (const item of def.parts.subsections) {
          if (item.type === "shared" && item.scope) {
            sharedScopes.push(...item.scope);
          }
        }

        if (sharedScopes.length > 0) {
          // Конкретные подразделы из scope
          for (const subName of sharedScopes) {
            list.push({ section: sectionKey, subsection: subName });
          }
        } else {
          // Нет shared — все именованные подразделы считаются потребителями
          for (const item of def.parts.subsections) {
            if (item.name) {
              list.push({ section: sectionKey, subsection: item.name });
            }
          }
        }
      } else {
        // Нет parts — весь раздел
        list.push({ section: sectionKey, subsection: null });
      }
    }
  }

  return consumers;
}

/* ══ getCrossSecDependents [9767] ═════════════════════════════════════ */

/** Межсекционный зависимый: потребитель + ключ, через который он затронут. */
export interface CrossSecDependent extends CtxKeyConsumer {
  ctxKey: string;
}

/**
 * Порт getCrossSecDependents(sectionKey, subsectionName): какие
 * подразделы ДРУГИХ разделов потребляют контекст данного подраздела
 * (через SUBSECTION_TO_CTX_KEYS из Registry, конфиг subsection_ctx_keys).
 * DOC_STATE.resolvedDeps/sectionDefs → параметры.
 */
export async function getCrossSecDependents(
  sectionKey: string,
  subsectionName: string,
  resolvedDeps: DepsMap,
  sectionDefs?: SectionDefsForCascade,
): Promise<CrossSecDependent[]> {
  const canonName = await canonicalSubsectionKey(sectionKey, subsectionName);
  const subsectionCtxKeys = await getConfig<
    Record<string, Record<string, string[]> | undefined>
  >("subsection_ctx_keys");
  const ctxKeys = (subsectionCtxKeys[sectionKey] ?? {})[canonName] ?? [];
  if (!ctxKeys.length) return [];

  const consumers = buildCtxKeyConsumers(resolvedDeps, sectionDefs);
  const result: CrossSecDependent[] = [];

  for (const ctxKey of ctxKeys) {
    const list = consumers[ctxKey] ?? [];
    for (const entry of list) {
      // Не включаем потребителей из того же раздела — это покрывается INTRA_DEPS
      if (entry.section === sectionKey) continue;
      result.push({ ...entry, ctxKey });
    }
  }

  return result;
}

/* ══ getAffectedModes [22814] ═════════════════════════════════════════ */

/** Результат режима в объёме, нужном анализу (mode_results). */
export interface ModeResultLite {
  param: string;
  html?: string | null | undefined;
}

/** Аналог DOC_STATE.modes: modeKey → массив результатов (index = позиция). */
export type ModesState = Record<string, ModeResultLite[]>;

/** Затронутый результат режима (кандидат на каскадную перегенерацию). */
export interface AffectedMode {
  modeKey: string;
  index: number;
  param: string;
  title: string;
  reason: string;
}

/**
 * MODE_CONFIG[*].title исходника [22579] — дословно. Сам MODE_CONFIG
 * (промпты режимов) — mode-service, беседа 4.1; TODO(4.1): при его
 * создании перевести на импорт оттуда.
 */
export const MODE_TITLES: Readonly<Record<string, string>> = {
  adversarial: "⚔ Оппонент",
  translator: "🔄 Переводчик",
  timeslice: "⏳ Временной срез",
} as const;

/**
 * Локальный порт getEffectiveModeDeps(modeKey, p) [22558]: MODE_DEPS —
 * из Registry (конфиг mode_deps); при генетическом порядке graph:nodes /
 * graph:edges замещаются диалоговыми ключами, если графа нет в документе
 * (DOC_STATE.sectionOrder → параметр sectionOrder).
 * ВЛАДЕЛЕЦ функции — mode-service (карта 04 §1.11, беседа 4.1);
 * TODO(4.1): заменить на импорт из mode-service, этот порт удалить.
 */
export async function getEffectiveModeDepsFromConfig(
  modeKey: string,
  generationOrder: GenerationOrder | undefined,
  sectionOrder: readonly string[],
): Promise<SectionDeps> {
  const modeDeps =
    await getConfig<Record<string, SectionDeps | undefined>>("mode_deps");
  const base = modeDeps[modeKey];
  if (!base) return { required: [], optional: [] };

  if (generationOrder === "genetic") {
    // Заменяем graph:nodes на dialogue:new_concepts, если графа нет
    const hasGraph = sectionOrder.includes("graph");
    const mapKey = (k: string): string => {
      if (k === "graph:nodes" && !hasGraph) return "dialogue:new_concepts";
      if (k === "graph:edges" && !hasGraph) return "dialogue:turning_points";
      return k;
    };
    return {
      required: base.required.map(mapKey),
      optional: base.optional.map(mapKey),
    };
  }

  return base;
}

export interface AffectedModesInput {
  /** Результаты режимов (аналог DOC_STATE.modes) */
  modes: ModesState;
  generationOrder?: GenerationOrder | undefined;
  /** sectionOrder документа (для генетической подмены graph-ключей) */
  sectionOrder: readonly string[];
  changedSections: string[];
  /** "sectionKey:subsectionName" — как в исходнике */
  changedSubsections?: string[] | undefined;
}

/**
 * Порт getAffectedModes(changedSections, changedSubsections) [22814]:
 * какие сгенерированные результаты режимов затронуты изменением разделов
 * или подразделов. Тексты reason — дословно.
 */
export async function getAffectedModes(
  input: AffectedModesInput,
): Promise<AffectedMode[]> {
  const { modes, changedSections, changedSubsections } = input;
  const affected: AffectedMode[] = [];

  const subsectionCtxKeys =
    changedSubsections && changedSubsections.length > 0
      ? await getConfig<Record<string, Record<string, string[]> | undefined>>(
          "subsection_ctx_keys",
        )
      : null;
  const canonicalize =
    subsectionCtxKeys !== null ? await getCanonicalizer() : null;

  for (const [modeKey, results] of Object.entries(modes || {})) {
    if (!Array.isArray(results)) continue;
    const deps = await getEffectiveModeDepsFromConfig(
      modeKey,
      input.generationOrder,
      input.sectionOrder,
    );
    if (!deps) continue;
    const title = MODE_TITLES[modeKey] ?? modeKey;
    const allCtxKeys = [...(deps.required || []), ...(deps.optional || [])];

    for (let i = 0; i < results.length; i++) {
      if (!results[i]?.html) continue;
      let found = false;

      // Проверяем разделы
      for (const ctxKey of allCtxKeys) {
        const src = sourceOf(ctxKey);
        if (changedSections.includes(src)) {
          affected.push({
            modeKey,
            index: i,
            param: (results[i] as ModeResultLite).param,
            title: title + " · " + (results[i] as ModeResultLite).param,
            reason:
              "Изменён раздел «" +
              (LBL[src] || src) +
              "» (контекст: " +
              (CTX[ctxKey] || ctxKey) +
              ")",
          });
          found = true;
          break;
        }
      }

      // Проверяем подразделы (через SUBSECTION_TO_CTX_KEYS)
      if (!found && changedSubsections && subsectionCtxKeys && canonicalize) {
        for (const subId of changedSubsections) {
          const [secKey, subName] = subId.split(":") as [
            string,
            string | undefined,
          ];
          if (!subName) continue;
          const canonSub = canonicalize(secKey, subName);
          const ctxKeys = (subsectionCtxKeys[secKey] ?? {})[canonSub] ?? [];
          const overlap = ctxKeys.filter((k) => allCtxKeys.includes(k));
          if (overlap.length > 0) {
            affected.push({
              modeKey,
              index: i,
              param: (results[i] as ModeResultLite).param,
              title: title + " · " + (results[i] as ModeResultLite).param,
              reason:
                "Изменён подраздел «" +
                subName +
                "» в «" +
                (LBL[secKey] || secKey) +
                "»",
            });
            break;
          }
        }
      }
    }
  }

  return affected;
}

/* ══ sortInTopoOrder [20482] ══════════════════════════════════════════ */

/**
 * Порт sortInTopoOrder(keys): сортировка по позиции в sectionOrder
 * документа (DOC_STATE.sectionOrder → первый параметр).
 */
export function sortInTopoOrder(
  sectionOrder: readonly string[],
  keys: Iterable<string>,
): string[] {
  const orderMap: Record<string, number> = {};
  sectionOrder.forEach((k, i) => {
    orderMap[k] = i;
  });
  return [...keys].sort((a, b) => (orderMap[a] ?? 999) - (orderMap[b] ?? 999));
}

/* ══ buildFactualDepsMap [5501] / computeFactualDependents [5544] ═════ */

/** Строка ctxLog в объёме, нужном фактическому анализу. */
export interface CtxLogRowLite {
  sectionKey: string;
  entries: ContextEntry[];
}

/** consumer → source → факт использования контекста. */
export type FactualDepsMap = Record<
  string,
  Record<string, { chars: number; keys: string[]; statuses: string[] }>
>;

/**
 * Порт buildFactualDepsMap(log) [5501]: ФАКТИЧЕСКИЕ зависимости из
 * ctxLog — что реально попало в контекст каждого раздела. Статусы
 * entries сервиса совпадают с исходником (found/truncated/missing/…,
 * контракт context-builder 1.3) — логика 1:1. Порядок строк — по
 * createdAt ASC (аналог порядка массива ctxLog): «последняя запись»
 * отражает актуальное состояние.
 */
export function buildFactualDepsMap(log: CtxLogRowLite[]): FactualDepsMap {
  if (!log || !log.length) return {};

  // При мультисессионном логе для одного sectionKey может быть
  // несколько записей (оригинал + перегенерации). Берём ПОСЛЕДНЮЮ:
  // она отражает актуальное состояние зависимостей раздела.
  const latestByKey: Record<string, CtxLogRowLite> = {};
  for (const entry of log) {
    latestByKey[entry.sectionKey] = entry; // перезаписывает → остаётся последняя
  }

  const map: FactualDepsMap = {};
  for (const entry of Object.values(latestByKey)) {
    const consumer = entry.sectionKey;
    if (!map[consumer]) map[consumer] = {};
    const consumerMap = map[consumer] as Record<
      string,
      { chars: number; keys: string[]; statuses: string[] }
    >;

    for (const e of entry.entries) {
      const source = sourceOf(e.key);
      if (source === "sum" || source === consumer) continue;
      if (e.status === "missing") continue;

      if (!consumerMap[source]) {
        consumerMap[source] = { chars: 0, keys: [], statuses: [] };
      }

      const info = consumerMap[source] as {
        chars: number;
        keys: string[];
        statuses: string[];
      };
      info.keys.push(e.key);
      info.statuses.push(e.status);

      if (e.status === "found" || e.status === "truncated") {
        info.chars += e.len || 0;
      }
    }
  }
  return map;
}

/** source → фактические потребители его контекста (по убыванию chars). */
export type FactualDependents = Record<
  string,
  {
    consumers: { key: string; chars: number; keys: string[] }[];
    totalChars: number;
  }
>;

/** Порт computeFactualDependents(factualDeps) [5544] — 1:1. */
export function computeFactualDependents(
  factualDeps: FactualDepsMap,
): FactualDependents {
  const result: FactualDependents = {};

  for (const [consumer, sources] of Object.entries(factualDeps)) {
    for (const [source, info] of Object.entries(sources)) {
      if (!result[source]) result[source] = { consumers: [], totalChars: 0 };
      const data = result[source] as FactualDependents[string];
      data.consumers.push({
        key: consumer,
        chars: info.chars,
        keys: info.keys,
      });
      data.totalChars += info.chars;
    }
  }

  // Сортируем потребителей по убыванию chars
  for (const data of Object.values(result)) {
    data.consumers.sort((a, b) => b.chars - a.chars);
  }

  return result;
}

/* ══ analyzeImpact — серверный аналог updateLiveCascade [19139] ═══════ */

/** Действия плана в объёме, нужном анализу. */
export interface PlanActions {
  regen: string[];
  remove: string[];
  add: string[];
}

/** «Обязательные зависимости отсутствуют» для добавляемого раздела (C1). */
export interface MissingHardDep {
  consumer: string;
  label: string;
  sources: { ctxKey: string; src: string; label: string }[];
}

/** Активная подстановка контекста для добавляемого раздела (C2). */
export interface ActiveSubstitution {
  consumer: string;
  consumerLabel: string;
  ctxKey: string;
  ctxLabel: string;
  replacedKey: string | null;
  replacedLabel: string;
  quality: number;
}

/** Рекомендация добавить раздел-источник optional-контекста (C3). */
export interface AddableBenefit {
  src: string;
  label: string;
  consumers: string[];
}

/** Весовая подсказка downstream-раздела (E1: chars от источника плана). */
export interface FactualWeightHint {
  source: string;
  chars: number;
}

/** Результат полного каскадного анализа (расчётная часть updateLiveCascade). */
export interface CascadeImpact {
  /** Downstream: затронутые разделы вне плана (topo-порядок документа) */
  affectedSections: string[];
  /** depKey → фактические веса контекста от источников плана (E1) */
  factualWeights: Record<string, FactualWeightHint[]>;
  missingHard: MissingHardDep[];
  activeSubstitutions: ActiveSubstitution[];
  recommendations: AddableBenefit[];
  affectedModes: AffectedMode[];
}

/** Параметры p в форме исходника из строки syntheses (аналог 1.4). */
function paramsFromRow(
  row: typeof syntheses.$inferSelect,
  philosophers: string[],
): PromptParams {
  return {
    seed: row.seed,
    phil: philosophers,
    participants: philosophers.map((name) => ({
      type: "philosopher" as const,
      name,
    })),
    sec: (row.sectionOrder ?? []).filter((k) => k !== "sum"),
    method: row.method as SynthesisMethod,
    synthLevel: row.synthLevel as SynthLevel,
    depth: row.depth as Depth,
    generationOrder: row.generationOrder as GenerationOrder,
    extGraphMetrics: row.extGraphMetrics,
    ctx: row.context,
    lang: row.lang,
  };
}

/**
 * Локальный загрузчик строки синтеза + философов-родителей.
 * НЕ импортирует loadSynthesis из generation-service намеренно: тот
 * модуль импортирует context-builder, а context-builder — этот модуль
 * (getCanonicalizer, закрытие TODO(2.1)) — статический цикл. Отсутствие
 * синтеза → Error (потребитель createPlan проверяет существование сам
 * через loadSynthesis до вызова analyzeImpact).
 */
async function loadSynthesisLocal(synthesisId: string): Promise<{
  row: typeof syntheses.$inferSelect;
  philosophers: string[];
}> {
  const [row] = await db
    .select()
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  if (!row) throw new Error("Синтез не найден");
  const lineage = await db
    .select()
    .from(synthesisLineage)
    .where(eq(synthesisLineage.synthesisId, synthesisId))
    .orderBy(asc(synthesisLineage.position));
  const philosophers = lineage
    .filter((l) => l.parentType === "philosopher" && l.parentName)
    .map((l) => l.parentName as string);
  return { row, philosophers };
}

/** mode_results → ModesState (index = позиция по createdAt ASC). */
export async function loadModesState(synthesisId: string): Promise<ModesState> {
  const rows = await db
    .select({
      modeKey: modeResults.modeKey,
      param: modeResults.paramValue,
      html: modeResults.htmlContent,
    })
    .from(modeResults)
    .where(eq(modeResults.synthesisId, synthesisId))
    .orderBy(asc(modeResults.createdAt));
  const modes: ModesState = {};
  for (const r of rows) {
    (modes[r.modeKey] ??= []).push({ param: r.param, html: r.html });
  }
  return modes;
}

/** context_log синтеза в порядке createdAt ASC (аналог массива ctxLog). */
async function loadCtxLog(synthesisId: string): Promise<CtxLogRowLite[]> {
  const rows = await db
    .select({ sectionKey: contextLog.sectionKey, entries: contextLog.entries })
    .from(contextLog)
    .where(eq(contextLog.synthesisId, synthesisId))
    .orderBy(asc(contextLog.createdAt));
  return rows.map((r) => ({ sectionKey: r.sectionKey, entries: r.entries }));
}

/**
 * Серверный аналог updateLiveCascade(plan) [19139] — только расчёт, без
 * DOM (панель — клиент 2.3):
 *  A. будущее состояние (futureSections → futureResolved/futureEffDeps);
 *  B. downstream: computeDependents по ТЕКУЩИМ effectiveDeps (для regen/
 *     remove) и по futureEffDeps (бенефициары добавлений); чистка от
 *     операций плана и удалённых; весовые подсказки — из фактических
 *     зависимостей ctxLog (factReverse, E1);
 *  C. upstream добавляемых: C1 жёсткие потери (required без источника и
 *     без подстановки), C2 активные подстановки (с квирком «источник
 *     заменяемого добавляется тем же планом → подстановка не нужна»),
 *     C3 рекомендации по optional;
 *  E5. затронутые режимы: changedSections = regen ∪ remove ∪ add
 *     (подразделы, как в исходнике, здесь не передаются).
 *
 * Текущие effectiveDeps проходят через buildDynamicOrder — как в
 * DOC_STATE (мутация разрыва циклов сохранена, грабля 1.1); будущие —
 * только buildEffectiveDeps (1:1 с updateLiveCascade).
 */
export async function analyzeImpact(
  synthesisId: string,
  plan: PlanActions,
): Promise<CascadeImpact> {
  const { row, philosophers } = await loadSynthesisLocal(synthesisId);
  const p = paramsFromRow(row, philosophers);
  const sectionOrder: readonly string[] = row.sectionOrder ?? [];

  const activeSet = new Set([...plan.regen, ...plan.add]);
  const removeSet = new Set(plan.remove);

  // ══ A. Будущее состояние документа ══
  const futureSections = [
    ...sectionOrder.filter((k) => k !== "sum" && !removeSet.has(k)),
    ...plan.add,
  ];

  let futureResolved: DepsMap | null = null;
  let futureEffDeps: DepsMap | null = null;

  if (futureSections.length > 0) {
    const futureParams: PromptParams = { ...p, sec: futureSections };
    futureResolved = await resolveContextDeps(futureParams);
    futureEffDeps = await buildEffectiveDeps(
      futureSections,
      futureResolved,
      p.generationOrder,
    );
  }

  // ══ B. DOWNSTREAM: существующие разделы, затронутые планом ══
  // Текущие effectiveDeps документа (аналог DOC_STATE.effectiveDeps —
  // после buildDynamicOrder, мутация разрыва циклов сохранена)
  const resolvedDeps = await resolveContextDeps(p);
  const effectiveDeps = await buildEffectiveDeps(
    p.sec,
    resolvedDeps,
    p.generationOrder,
  );
  buildDynamicOrder(effectiveDeps, p.sec, resolvedDeps, p.generationOrder);

  const dependents = computeDependents(effectiveDeps);
  const factDeps = buildFactualDepsMap(await loadCtxLog(synthesisId));
  const factReverse = computeFactualDependents(factDeps);

  const affected = new Set<string>();

  for (const key of plan.regen) {
    for (const dep of dependents[key] ?? new Set<string>()) {
      if (dep !== "sum") affected.add(dep);
    }
  }
  for (const key of plan.remove) {
    for (const dep of dependents[key] ?? new Set<string>()) {
      if (dep !== "sum") affected.add(dep);
    }
  }

  // Downstream-бенефициары добавлений
  if (plan.add.length > 0 && futureEffDeps) {
    const futureDependents = computeDependents(futureEffDeps);
    for (const key of plan.add) {
      for (const dep of futureDependents[key] ?? new Set<string>()) {
        if (dep !== "sum") affected.add(dep);
      }
    }
  }

  // Чистим affected
  for (const key of activeSet) affected.delete(key);
  for (const key of removeSet) affected.delete(key);

  const remainingAfterRemove = new Set(
    sectionOrder.filter((k) => !removeSet.has(k)),
  );
  for (const key of affected) {
    if (!remainingAfterRemove.has(key)) affected.delete(key);
  }

  // Весовые подсказки E1: chars от каждого источника плана (factReverse)
  const factualWeights: Record<string, FactualWeightHint[]> = {};
  for (const depKey of affected) {
    for (const srcKey of [...plan.regen, ...plan.remove]) {
      const fi = factReverse[srcKey];
      if (fi) {
        const consumer = fi.consumers.find((c) => c.key === depKey);
        if (consumer && consumer.chars > 0) {
          (factualWeights[depKey] ??= []).push({
            source: srcKey,
            chars: consumer.chars,
          });
        }
      }
    }
  }

  // ══ C. UPSTREAM: анализ зависимостей добавляемых разделов ══
  const missingHard: MissingHardDep[] = [];
  const activeSubs: ActiveSubstitution[] = [];
  const addableBenefits: Record<string, { label: string; consumers: string[] }> =
    {};

  if (plan.add.length > 0 && futureResolved && futureEffDeps) {
    const futureSet = new Set(["sum", ...futureSections]);
    const subMap = await getActiveSubstitutionMap(p.generationOrder);

    for (const addKey of plan.add) {
      const origDeps = futureResolved[addKey];
      const effDeps = futureEffDeps[addKey];
      if (!origDeps) continue;

      const consumerLabel = LBL[addKey] || addKey;
      const origAll = new Set([
        ...(origDeps.required || []),
        ...(origDeps.optional || []),
      ]);
      const effAll = new Set([
        ...(effDeps?.required || []),
        ...(effDeps?.optional || []),
      ]);

      // ── C1. Жёсткие потери ──
      const hardMissing: MissingHardDep["sources"] = [];
      for (const ctxKey of origDeps.required) {
        const src = sourceOf(ctxKey);
        if (src === "sum" || futureSet.has(src)) continue;
        const hasSubstitute = [...effAll].some(
          (k) => !origAll.has(k) && sourceOf(k) !== src && sourceOf(k) !== addKey,
        );
        if (!hasSubstitute) {
          hardMissing.push({ ctxKey, src, label: CTX[ctxKey] || ctxKey });
        }
      }
      if (hardMissing.length > 0) {
        missingHard.push({
          consumer: addKey,
          label: consumerLabel,
          sources: hardMissing,
        });
      }

      // ── C2. Активные подстановки ──
      if (effDeps) {
        const addSet = new Set(plan.add);
        for (const ctxKey of [
          ...(effDeps.required || []),
          ...(effDeps.optional || []),
        ]) {
          if (origAll.has(ctxKey)) continue;
          const q = getSubstituteQuality(ctxKey, subMap);
          if (q == null) continue;

          let replacedKey: string | null = null;
          for (const [origK, candidates] of Object.entries(subMap)) {
            if (candidates.some((c) => c.key === ctxKey)) {
              replacedKey = origK;
              break;
            }
          }

          // Если источник заменяемого контекста тоже добавляется в этом же
          // плане — подстановка не нужна: оригинал будет доступен после
          // генерации
          if (replacedKey) {
            const replacedSrc = sourceOf(replacedKey);
            if (addSet.has(replacedSrc) || futureSet.has(replacedSrc)) continue;
          }

          activeSubs.push({
            consumer: addKey,
            consumerLabel,
            ctxKey,
            ctxLabel: CTX[ctxKey] || ctxKey,
            replacedKey,
            replacedLabel: replacedKey ? CTX[replacedKey] || replacedKey : "?",
            quality: q,
          });
        }
      }

      // ── C3. Рекомендации по optional-зависимостям ──
      for (const ctxKey of origDeps.optional || []) {
        const src = sourceOf(ctxKey);
        if (src === "sum" || futureSet.has(src)) continue;
        if (!addableBenefits[src]) {
          addableBenefits[src] = { label: LBL[src] || src, consumers: [] };
        }
        const bucket = addableBenefits[src] as {
          label: string;
          consumers: string[];
        };
        if (!bucket.consumers.includes(consumerLabel)) {
          bucket.consumers.push(consumerLabel);
        }
      }
    }
  }

  // ══ E5. Затронутые режимы ══
  const changedSections = [...plan.regen, ...plan.remove, ...plan.add];
  const affectedModes = await getAffectedModes({
    modes: await loadModesState(synthesisId),
    generationOrder: p.generationOrder,
    sectionOrder,
    changedSections,
  });

  return {
    affectedSections: sortInTopoOrder(sectionOrder, affected),
    factualWeights,
    missingHard,
    activeSubstitutions: activeSubs,
    recommendations: Object.entries(addableBenefits).map(([src, info]) => ({
      src,
      label: info.label,
      consumers: info.consumers,
    })),
    affectedModes,
  };
}
