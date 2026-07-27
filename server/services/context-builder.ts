/**
 * Context Builder — сборка межсекционного контекста раздела
 * (01-architecture §4.3 + §4.13 ч. II; 04-code-reuse-map §2.1, §1.10;
 * беседа 1.3).
 *
 * Порт из philosynth.html:
 *  - buildContextForSection [8313–8499] — 6 шагов: required → остаток
 *    бюджета → optional (truncate/skipped_budget) → пережатие required с
 *    неприкосновенным набором → лог утраченных ключей (4b) → запись ctxLog
 *    → форматирование блока «КОНТЕКСТ ИЗ ПРЕДЫДУЩИХ РАЗДЕЛОВ»;
 *  - applyBudgetPressure [10141] — КАНОН (нижний пол 40% базового бюджета);
 *  - parentOverheadForSection [10150] — точный вес родителей по спецу раздела;
 *  - computeConceptOverhead [10133] — грубый суммарный вес (legacy/монолит);
 *  - extractIntraSectionContext [19866] / extractRelevantIntraSectionContext
 *    [19894] — внутрисекционный контекст (04-map §2.1).
 *
 * ═══ Адаптации DOM/DOC_STATE → сервис ═══
 *
 * 1. `generated` (карта sectionKey → DOM-элемент) → ContextSource
 *    (context-extractor.ts): доступ к разделам и гранулярным таблицам
 *    одного синтеза с мемоизацией. Создаётся из synthesisId.
 *
 * 2. Глобального ctxLog нет: в исходнике [8357] запись пушится в массив
 *    модуля. Здесь buildContextForSection ВОЗВРАЩАЕТ запись
 *    (BuildContextResult.ctxLog) — персистентность в context_log
 *    остаётся за generation-service (беседа 1.4).
 *
 * 3. DOC_STATE.params (keepFullBudget, generationOrder, synthLevel, method)
 *    по умолчанию читаются из строки syntheses по synthesisId; вызывающий
 *    может передать их явно (opts.params) — это прямой аналог того, что в
 *    исходнике [8320–8327] значения берутся из DOC_STATE с фолбэками.
 *
 * 4. DOC_STATE.participants / _conceptParticipants: наполнение полей
 *    концепций-родителей (capsule/goals/…) — обязанность
 *    meta-synthesis-service (беседа 3.1, importConceptAsParticipant).
 *    Здесь они принимаются параметром (opts.participants); без них
 *    overhead = 0, parentSpec = null — поведение не-мета-синтеза.
 *
 * 5. FRAGMENT_SHARE в buildContextForSection исходника НЕ участвует
 *    (используется только оценщиком, cost-estimator беседы 1.1) — здесь
 *    тоже не читается; из конфигов нужен только context_budget.
 */

import type {
  ContextEntry,
  CtxLogDraft,
} from "@philosynth/shared/types/generation";

import { db } from "../db/index.js";
import { syntheses } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { CTX_LABELS } from "@philosynth/shared/constants/ctx-keys";
import type { DepsMap, SectionDeps } from "../utils/deep-merge.js";
import { sourceOf } from "../utils/topo-sort.js";
import { truncateText } from "../utils/text.js";
import type { HtmlElement } from "../utils/html-parser.js";
import { tableToText } from "../utils/text.js";
import { innerTextTrimmed } from "../utils/html-parser.js";
import { getConfig } from "./prompt-registry.js";
import { findSubstitute, getActiveSubstitutionMap } from "./synthesis-engine.js";
import {
  createDbContextSource,
  extractContextFragment,
  extractIntraSectionContext,
} from "./context-extractor.js";
import type { ContextSource } from "./context-extractor.js";
import {
  buildParentSpecForLog,
  isConceptParticipant,
  parentFieldValue,
  resolveParentSpec,
} from "./parent-context.js";
import type { ConceptParticipant, ParentDepsParams } from "./parent-context.js";

/* ══ Режим бюджета секций (01-arch §4.13 ч. II) ══════════════════════ */

/** Результат applyBudgetPressure */
export interface BudgetPressureResult {
  effectiveBudget: number;
  /** На сколько ужат базовый бюджет (0 при mode='full' или overhead=0) */
  applied: number;
  mode: "full" | "shrink";
}

/**
 * КАНОН applyBudgetPressure(baseBudget, conceptOverhead, keepFullBudget)
 * [philosynth.html ~10141] — логика 1:1, нижний пол 40% базового бюджета.
 *
 * Каноническое место — этот модуль (04-code-reuse-map §1.10). До беседы 1.3
 * в cost-estimator.ts жила приватная копия с меткой TODO(1.3); копия удалена,
 * оценщик импортирует функцию отсюда.
 */
export function applyBudgetPressure(
  baseBudget: number,
  conceptOverhead: number,
  keepFullBudget: boolean,
): BudgetPressureResult {
  if (keepFullBudget || !conceptOverhead) {
    return {
      effectiveBudget: baseBudget,
      applied: 0,
      mode: keepFullBudget ? "full" : "shrink",
    };
  }
  const effective = Math.max(
    baseBudget - conceptOverhead,
    Math.floor(baseBudget * 0.4),
  );
  return {
    effectiveBudget: effective,
    applied: baseBudget - effective,
    mode: "shrink",
  };
}

/**
 * Порт computeConceptOverhead(participants) [10133]: грубый суммарный вес
 * шести полей всех концепций (legacy-оценка для монолитного блока).
 * Сохранён дословно, включая фиксированный список полей.
 */
export function computeConceptOverhead(
  participants: readonly ConceptParticipant[] | null | undefined,
): number {
  if (!participants) return 0;
  const LEGACY_FIELDS = [
    "capsule",
    "graphNodes",
    "glossaryCompact",
    "thesesSummary",
    "goals",
    "tensions",
  ];
  return participants
    .filter(isConceptParticipant)
    .reduce(
      (sum, c) =>
        sum + LEGACY_FIELDS.reduce((s, f) => s + parentFieldValue(c, f).length, 0),
      0,
    );
}

/**
 * Порт parentOverheadForSection(participants, sectionKey, order, synthLevel,
 * method, subsectionName) [10150]: точный вес родительского контекста для
 * раздела = Σ длин выбранных спецом полей по всем концепциям + 200 симв.
 * служебной обёртки на концепцию.
 *
 * Асинхронна: spec резолвится из Registry (parent-context.ts).
 */
export async function parentOverheadForSection(
  participants: readonly ConceptParticipant[] | null | undefined,
  sectionKey: string,
  order?: string | undefined,
  synthLevel?: string | undefined,
  method?: string | undefined,
  subsectionName?: string | undefined,
): Promise<number> {
  if (!participants || participants.length === 0) return 0;
  const spec = await resolveParentSpec(
    { generationOrder: order, synthLevel, method },
    sectionKey,
    subsectionName,
  );
  const fields = new Set([...(spec.required ?? []), ...(spec.optional ?? [])]);

  let total = 0;
  for (const c of participants) {
    if (!isConceptParticipant(c)) continue;
    for (const fld of fields) total += parentFieldValue(c, fld).length;
    total += 200;
  }
  return total;
}

/* ══ buildContextForSection ══════════════════════════════════════════ */

/** Параметры синтеза, влияющие на бюджет (в исходнике — DOC_STATE.params) */
export interface ContextBuildParams extends ParentDepsParams {
  /** Не ужимать бюджет секций под давлением родителей (v11) */
  keepFullBudget?: boolean | undefined;
}

export interface BuildContextOptions {
  /** Источник данных; по умолчанию createDbContextSource(synthesisId) */
  source?: ContextSource | undefined;
  /** Параметры синтеза; по умолчанию читаются из строки syntheses */
  params?: ContextBuildParams | undefined;
  /** Концепции-родители с наполненными полями (беседа 3.1); default [] */
  participants?: readonly ConceptParticipant[] | undefined;
  /** Подраздельная перегенерация: спец родителей берётся по PARENT_INTRA_DEPS */
  subsectionName?: string | undefined;
}

export interface BuildContextResult {
  /** Готовый блок для промпта либо "" (как возвращаемое значение исходника) */
  text: string;
  /** Запись ctxLog; null — раздела нет в картах зависимостей (ранний выход) */
  ctxLog: CtxLogDraft | null;
}

/** Неприкосновенные required-фрагменты при пережатии (шаг 4) [8420] */
const UNTOUCHABLE = new Set([
  "graph:nodes",
  "graph:edges",
  "sum:goals",
  "sum:tensions",
]);

/** Бюджет по глубине из Registry; фолбэк 12000 — как в исходнике [8318] */
async function baseBudgetFor(depth: string): Promise<number> {
  const budgets = await getConfig<Record<string, number>>("context_budget");
  return budgets[depth] || 12000;
}

/**
 * Порт buildContextForSection(sectionKey, generated, depth, effectiveDepsMap,
 * resolvedDeps) [8313]. Пять позиционных параметров — как в протоколе 07
 * (беседа 1.3); шестой, opts, заменяет чтение DOC_STATE.
 *
 * ВАЖНО (наследие 1.1): buildDynamicOrder МУТИРУЕТ effectiveDeps — сюда
 * следует передавать именно ту карту, что прошла через него (семантика
 * исходника).
 */
export async function buildContextForSection(
  sectionKey: string,
  synthesisId: string,
  depth: string,
  effectiveDepsMap: DepsMap | null | undefined,
  resolvedDeps: DepsMap,
  opts: BuildContextOptions = {},
): Promise<BuildContextResult> {
  const depsSource = resolvedDeps;
  const deps: SectionDeps | undefined =
    effectiveDepsMap?.[sectionKey] ?? depsSource[sectionKey];
  if (!deps) return { text: "", ctxLog: null };

  const origDeps = depsSource[sectionKey];
  const origAllKeys = new Set<string>([
    ...(origDeps?.required ?? []),
    ...(origDeps?.optional ?? []),
  ]);

  const src = opts.source ?? createDbContextSource(synthesisId);
  const params = opts.params ?? (await loadParams(synthesisId));
  const participants = opts.participants ?? [];

  const baseBudget = await baseBudgetFor(depth);

  /* Per-section formula через applyBudgetPressure [8320–8339].
     Унифицировано: critique × 1.5 применяется ДО давления. */
  const keepFullBudget = !!params.keepFullBudget;
  const genOrder = params.generationOrder || "architectural";
  const synthLevel = params.synthLevel || "comparative";
  const method = params.method || "dialectical";
  const parentOverhead = await parentOverheadForSection(
    participants,
    sectionKey,
    genOrder,
    synthLevel,
    method,
    opts.subsectionName,
  );
  const baseWithCritic =
    sectionKey === "critique" ? Math.floor(baseBudget * 1.5) : baseBudget;
  const pressure = applyBudgetPressure(
    baseWithCritic,
    parentOverhead,
    keepFullBudget,
  );
  const totalBudget = pressure.effectiveBudget;

  // 1. Обязательный контекст
  const requiredParts: { key: string; text: string }[] = [];
  const logEntries: ContextEntry[] = [];
  for (const key of deps.required) {
    const text = await extractContextFragment(key, src);
    if (text) {
      requiredParts.push({ key, text });
      logEntries.push({
        key,
        status: "found",
        len: text.length,
        priority: "required",
        isSubstitute: !origAllKeys.has(key),
      });
    } else {
      logEntries.push({
        key,
        status: "missing",
        len: 0,
        priority: "required",
        isSubstitute: !origAllKeys.has(key),
      });
    }
  }

  // 2. Остаток бюджета
  const requiredLen = requiredParts.reduce((sum, p) => sum + p.text.length, 0);
  let remainingBudget = totalBudget - requiredLen;

  // 3. Опциональный контекст
  const optionalParts: { key: string; text: string }[] = [];
  if (remainingBudget > 500) {
    for (const key of deps.optional) {
      if (remainingBudget <= 300) {
        logEntries.push({
          key,
          status: "skipped_budget",
          len: 0,
          priority: "optional",
          note: "бюджет исчерпан: осталось " + remainingBudget + " симв.",
          isSubstitute: !origAllKeys.has(key),
        });
        continue;
      }
      const text = await extractContextFragment(key, src);
      if (!text) {
        logEntries.push({
          key,
          status: "missing",
          len: 0,
          priority: "optional",
          isSubstitute: !origAllKeys.has(key),
        });
        continue;
      }
      if (text.length <= remainingBudget) {
        optionalParts.push({ key, text });
        remainingBudget -= text.length;
        logEntries.push({
          key,
          status: "found",
          len: text.length,
          priority: "optional",
          isSubstitute: !origAllKeys.has(key),
        });
      } else {
        const truncLen = remainingBudget - 50;
        optionalParts.push({ key, text: truncateText(text, truncLen) });
        logEntries.push({
          key,
          status: "truncated",
          len: truncLen,
          priority: "optional",
          note: "обрезан с " + text.length + " до " + truncLen,
          isSubstitute: !origAllKeys.has(key),
        });
        remainingBudget = 0;
        // Цикл НЕ обрывается: остаток опциональных ключей должен
        // залогироваться как skipped_budget (условие в начале следующей
        // итерации это обеспечивает) — комментарий исходника [8398].
      }
    }
  } else {
    for (const key of deps.optional) {
      logEntries.push({
        key,
        status: "skipped_budget",
        len: 0,
        priority: "optional",
        note: "бюджет исчерпан: осталось " + remainingBudget + " симв.",
        isSubstitute: !origAllKeys.has(key),
      });
    }
  }

  // 4. Пережатие required, если он сильно превышает бюджет
  //    (таблицы графа и цели — неприкосновенны)
  if (requiredLen > totalBudget * 1.5) {
    for (let j = requiredParts.length - 1; j >= 0; j--) {
      const currentTotal = requiredParts.reduce((s, p) => s + p.text.length, 0);
      if (currentTotal <= totalBudget * 1.3) break;
      const part = requiredParts[j];
      if (!part || UNTOUCHABLE.has(part.key)) continue;
      part.text = truncateText(
        part.text,
        Math.max(500, Math.floor(part.text.length * 0.5)),
      );
    }
  }

  // 4b. Лог утраченных ключей из оригинальных зависимостей
  const effectiveAllKeys = new Set<string>([...deps.required, ...deps.optional]);
  if (origDeps) {
    const available = new Set<string>([
      "sum",
      ...Object.keys(effectiveDepsMap ?? {}),
    ]);
    const substitutionMap = await getActiveSubstitutionMap(
      genOrder === "genetic" ? "genetic" : "architectural",
    );

    for (const tier of ["required", "optional"] as const) {
      for (const origKey of origDeps[tier] ?? []) {
        if (effectiveAllKeys.has(origKey)) continue;

        const source = sourceOf(origKey);
        const sub = findSubstitute(origKey, available, sectionKey, substitutionMap);
        let note: string;

        if (sub && effectiveAllKeys.has(sub)) {
          // Заменитель найден И присутствует в effective deps — он уже
          // залогирован как обычный found/truncated, не дублируем.
          continue;
        } else if (sub) {
          note =
            "замена " +
            (CTX_LABELS[sub as keyof typeof CTX_LABELS] ?? sub) +
            " удалена при разрешении цикла";
        } else if (!available.has(source)) {
          note = "раздел-источник не выбран, замена не найдена";
        } else {
          note = "удалён при разрешении цикла зависимостей";
        }

        logEntries.push({
          key: origKey,
          status: "dropped",
          len: 0,
          priority: tier,
          isSubstitute: false,
          note,
        });
      }
    }
  }

  // 5. Запись ctxLog (в исходнике — push в глобальный массив [8357])
  const totalUsed =
    requiredParts.reduce((s, p) => s + p.text.length, 0) +
    optionalParts.reduce((s, p) => s + p.text.length, 0);

  const ctxLog: CtxLogDraft = {
    sectionKey,
    rawBaseBudget: baseWithCritic,
    conceptOverheadApplied: pressure.applied,
    budgetMode: pressure.mode,
    budget: totalBudget,
    parentOverhead,
    entries: logEntries,
    totalUsed,
    reqFound: logEntries.filter(
      (e) => e.priority === "required" && e.status === "found",
    ).length,
    reqTotal: deps.required.length,
    optIncluded: logEntries.filter(
      (e) =>
        e.priority === "optional" &&
        (e.status === "found" || e.status === "truncated"),
    ).length,
    optTotal: deps.optional.length,
    parentSpec: await buildParentSpecForLog(
      participants,
      { generationOrder: genOrder, synthLevel, method },
      sectionKey,
      opts.subsectionName,
    ),
  };

  // 6. Форматирование
  const allParts = [...requiredParts, ...optionalParts];
  if (allParts.length === 0) return { text: "", ctxLog };
  const formatted = allParts
    .map((p) => {
      const label = CTX_LABELS[p.key as keyof typeof CTX_LABELS] ?? p.key;
      return "### " + label + "\n" + p.text;
    })
    .join("\n\n");

  return {
    text:
      "\n\nКОНТЕКСТ ИЗ ПРЕДЫДУЩИХ РАЗДЕЛОВ (используй термины, §§ и названия " +
      'категорий; не повторяй содержание):\n"""\n' +
      formatted +
      '\n"""',
    ctxLog,
  };
}

/** Аналог чтения DOC_STATE.params: параметры синтеза из БД. */
async function loadParams(synthesisId: string): Promise<ContextBuildParams> {
  const row = await db.query.syntheses.findFirst({
    where: eq(syntheses.id, synthesisId),
    columns: {
      keepFullBudget: true,
      generationOrder: true,
      synthLevel: true,
      method: true,
    },
  });
  return {
    keepFullBudget: row?.keepFullBudget ?? false,
    generationOrder: row?.generationOrder ?? "architectural",
    synthLevel: row?.synthLevel ?? "comparative",
    method: row?.method ?? "dialectical",
  };
}

/* ══ Внутрисекционный контекст (04-map §2.1) ═════════════════════════ */

/**
 * Порт extractIntraSectionContext(container, excludeName) [19866].
 * Реализация — в context-extractor.ts (там же весь DOM-слой);
 * здесь реэкспорт, чтобы соответствовать карте 04 §2.1.
 */
export { extractIntraSectionContext };

/**
 * Порт extractRelevantIntraSectionContext(container, sectionKey,
 * subsectionName) [19894]: транзитивное замыкание ВВЕРХ по INTRA_DEPS,
 * извлекаются только нужные подразделы.
 *
 * Адаптации:
 *  - INTRA_DEPS читается из Registry (конфиг intra_deps);
 *  - canonicalSubsectionKey [9753] принадлежит cascade-analyzer (беседа 2.1,
 *    04-map §1.1) — до её появления передаётся колбэком `canonicalize`;
 *    default — тождество. TODO(2.1): подставить настоящую каноникализацию
 *    портретных заголовков (иначе при кардинальности ≠ multi имена
 *    подразделов не совпадут с каноном INTRA_DEPS).
 */
export async function extractRelevantIntraSectionContext(
  container: HtmlElement,
  sectionKey: string,
  subsectionName: string,
  canonicalize: (sectionKey: string, name: string) => string = (_k, n) => n,
): Promise<string> {
  const intraDeps =
    await getConfig<Record<string, Record<string, string[]> | undefined>>(
      "intra_deps",
    );
  const deps = intraDeps[sectionKey] ?? {};

  const canonName = canonicalize(sectionKey, subsectionName);
  const directDeps = deps[canonName];

  // Нет записи в INTRA_DEPS — подраздел «корневой»: консервативный фолбэк
  if (!directDeps || directDeps.length === 0) {
    return extractIntraSectionContext(container, subsectionName);
  }

  // Транзитивное замыкание вверх
  const needed = new Set<string>();
  const queue = [...directDeps];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || needed.has(current)) continue;
    needed.add(current);
    for (const p of deps[current] ?? []) {
      if (!needed.has(p)) queue.push(p);
    }
  }

  const parts: string[] = [];
  for (const sec of container.querySelectorAll("[data-section]")) {
    const name = sec.getAttribute("data-section");
    if (name === null || name === subsectionName) continue; // себя не включаем
    if (!needed.has(canonicalize(sectionKey, name))) continue;
    const tables = Array.from(sec.querySelectorAll("table.doc-table"));
    if (tables.length > 0) {
      const tableParts = tables.map((t) => tableToText(t));
      const nonTableText = innerTextTrimmed(sec).replace(/\n{3,}/g, "\n\n");
      parts.push(
        `[${name}]\n${truncateText(nonTableText, 1500)}\n${tableParts.join("\n")}`,
      );
    } else {
      const text = innerTextTrimmed(sec);
      if (text) parts.push(`[${name}]\n${truncateText(text, 2000)}`);
    }
  }
  return parts.join("\n\n");
}
