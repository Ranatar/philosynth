/**
 * plan-order-builder — единый топологический порядок add+regen (v10).
 * Беседа 2.1. Порт buildPlanOrder(plan) [philosynth.html 20495–20578].
 *
 * Семантика (01-arch §4.5 п.6): добавления и перегенерации сортируются
 * ВМЕСТЕ по зависимостям будущего состояния документа, а не раздельно.
 * Алгоритм: Кан по рёбрам «внутри плана» (predecessors будущего
 * effectiveDeps, сведённые к операциям плана) со вторичной сортировкой
 * по каноническому порядку SECTION_TOPO_ORDER_* (и в стартовой очереди,
 * и при вставке освободившихся узлов). Невошедшие узлы (циклы) — в конец.
 *
 * Адаптации DOM/DOC_STATE → сервис:
 *  - DOC_STATE.params / DOC_STATE.sectionOrder → аргументы (params,
 *    sectionOrder); ветка `if (!p)` исходника сохранена (params: null);
 *  - resolveContextDeps/buildEffectiveDeps сервиса асинхронны (Registry)
 *    → функция async;
 *  - buildEffectiveDeps исходника принимал (sections, resolved, order) —
 *    сигнатура сервиса та же (беседа 1.1).
 *
 * Карта 04 §4 («Новое») числит модуль отдельным файлом; первый запрос
 * беседы 2.1 в 07 кладёт buildPlanOrder в cascade-analyzer — там
 * реэкспорт (по образцу sourceOf из 1.1).
 */

import {
  buildEffectiveDeps,
  resolveContextDeps,
} from "./synthesis-engine.js";
import {
  SECTION_TOPO_ORDER_ARCHITECTURAL,
  SECTION_TOPO_ORDER_GENETIC,
  computePredecessors,
} from "../utils/topo-sort.js";

import type { PromptParams } from "./prompt-builder.js";

/** Операции плана в объёме, нужном порядку (regen/remove/add — ключи разделов). */
export interface PlanOrderInput {
  regen: string[];
  remove: string[];
  add: string[];
}

/** Элемент единого порядка исполнения. */
export interface PlanOrderItem {
  key: string;
  action: "add" | "regen";
}

/**
 * Порт buildPlanOrder(plan) [20495]. params === null → тривиальный
 * порядок «сначала add, затем regen» (ветка `if (!p)` исходника).
 */
export async function buildPlanOrder(
  plan: PlanOrderInput,
  params: PromptParams | null,
  sectionOrder: readonly string[],
): Promise<PlanOrderItem[]> {
  const p = params;
  if (!p)
    return [
      ...plan.add.map((k): PlanOrderItem => ({ key: k, action: "add" })),
      ...plan.regen.map((k): PlanOrderItem => ({ key: k, action: "regen" })),
    ];

  // ── 1. Будущий набор разделов (после удалений + добавлений) ──
  const removeSet = new Set(plan.remove);
  const futureSections = [
    ...sectionOrder.filter((k) => k !== "sum" && !removeSet.has(k)),
    ...plan.add,
  ];

  // ── 2. Граф зависимостей для будущего состояния ──
  const futureParams: PromptParams = { ...p, sec: futureSections };
  const futureResolved = await resolveContextDeps(futureParams);
  const futureEffDeps = await buildEffectiveDeps(
    futureSections,
    futureResolved,
    p.generationOrder,
  );

  // ── 3. Predecessors — для каждого раздела: от кого он зависит ──
  const preds = computePredecessors(futureEffDeps);

  // ── 4. Множество операций плана ──
  const planSet = new Set([...plan.add, ...plan.regen]);
  const addSet = new Set(plan.add);

  // ── 5. Топосорт (Кан) только среди операций плана ──
  // Учитываем только зависимости ВНУТРИ плана
  const inDegree: Record<string, number> = {};
  const adjList: Record<string, string[]> = {};
  for (const key of planSet) {
    inDegree[key] = 0;
    adjList[key] = [];
  }
  for (const key of planSet) {
    const predSet = preds[key] ?? new Set<string>();
    for (const pred of predSet) {
      if (planSet.has(pred) && pred !== key) {
        (adjList[pred] as string[]).push(key);
        inDegree[key] = (inDegree[key] ?? 0) + 1;
      }
    }
  }

  // Вторичная сортировка по каноническому порядку
  const TOPO =
    p.generationOrder === "genetic"
      ? SECTION_TOPO_ORDER_GENETIC
      : SECTION_TOPO_ORDER_ARCHITECTURAL;

  const queue = [...planSet]
    .filter((k) => inDegree[k] === 0)
    .sort((a, b) => (TOPO[a] ?? 99) - (TOPO[b] ?? 99));
  const order: PlanOrderItem[] = [];

  while (queue.length) {
    const node = queue.shift() as string;
    order.push({
      key: node,
      action: addSet.has(node) ? "add" : "regen",
    });
    for (const succ of (adjList[node] ?? []).sort(
      (a, b) => (TOPO[a] ?? 99) - (TOPO[b] ?? 99),
    )) {
      inDegree[succ] = (inDegree[succ] ?? 0) - 1;
      if (inDegree[succ] === 0) {
        const pos = queue.findIndex((q) => (TOPO[q] ?? 99) > (TOPO[succ] ?? 99));
        if (pos === -1) queue.push(succ);
        else queue.splice(pos, 0, succ);
      }
    }
  }

  // Цикл: если что-то не вошло (циклическая зависимость) — добавляем в конец
  for (const key of planSet) {
    if (!order.some((o) => o.key === key)) {
      order.push({ key, action: addSet.has(key) ? "add" : "regen" });
    }
  }

  return order;
}
