/**
 * Топологический порядок разделов и разрыв циклических зависимостей
 * (беседа 1.1). Порт из philosynth.html:
 *  - sourceOf [6410] (карта 04 числит его в cascade-analyzer, беседа 2.1 —
 *    размещён здесь как нижний общий слой: нужен topo-sort'у, engine'у и
 *    advisor'у уже сейчас; cascade-analyzer будет импортировать отсюда);
 *  - SECTION_TOPO_ORDER_ARCHITECTURAL / _GENETIC [6505, 6520] — константы
 *    алгоритма (в synthesis_configs не сеются, беседа 0.3);
 *  - computePredecessors [6486];
 *  - topologicalSort — в исходнике алгоритм Кана инлайнен в buildDynamicOrder;
 *    по протоколу 07 (беседа 1.1, п. 2) выделен в отдельную функцию;
 *  - buildDynamicOrder [6535];
 *  - resolveCircularDeps [6929] + findOneCycle [6886] + getEdgeQuality [6844]
 *    + removeEdge [6867] — итеративный разрыв циклов по слабейшему ребру;
 *  - getSubstituteQuality [6834] — определён здесь (нужен getEdgeQuality;
 *    utils не может импортировать services), реэкспортируется из
 *    synthesis-engine (протокол 07, беседа 1.1, п. 1).
 *
 * Адаптация DOM/DOC_STATE → параметры:
 *  - getSubstituteQuality в исходнике читает активную карту подстановок из
 *    DOC_STATE.params.generationOrder — здесь карта передаётся аргументом
 *    (асинхронный выбор карты — getActiveSubstitutionMap в synthesis-engine);
 *  - getEdgeQuality / resolveCircularDeps / buildDynamicOrder получают
 *    substitutionMap последним параметром (для оценки качества
 *    рёбер-заменителей); при отсутствии карты качество заменителя = 1,
 *    как fallback `?? 1` исходника;
 *  - fallback `resolvedDeps ?? CONTEXT_DEPS_BASE` исходника снят: глобальных
 *    конфигов в сервисе нет, resolvedDeps обязателен.
 *
 * ВАЖНО (семантика исходника сохранена): buildDynamicOrder через
 * resolveCircularDeps МУТИРУЕТ и predecessors, и effectiveDeps (удаляет
 * слабейшие ключи / переносит required→optional). После возврата
 * effectiveDeps актуален для buildContextForSection (беседа 1.3).
 */

import type { DepsMap } from "./deep-merge.js";

/** Кандидат-заменитель из SUBSTITUTION_MAP: ключ + качество 1/2/3 */
export interface SubstituteCandidate {
  key: string;
  q: number;
}

/** Карта подстановок: ctxKey → упорядоченные по качеству кандидаты */
export type SubstitutionMap = Record<string, SubstituteCandidate[]>;

/** sectionKey → Set предшественников */
export type PredecessorsMap = Record<string, Set<string>>;

/** Порт sourceOf(ctxKey) [6410]: 'graph:nodes' → 'graph'. */
export function sourceOf(ctxKey: string): string {
  return ctxKey.split(":")[0] ?? ctxKey;
}

/**
 * Порт getSubstituteQuality(ctxKey) [6834]: качество ключа-заменителя —
 * поиск по всем спискам кандидатов карты. null, если ключ не является
 * заменителем ни для чего.
 */
export function getSubstituteQuality(
  ctxKey: string,
  substitutionMap: SubstitutionMap,
): number | null {
  for (const candidates of Object.values(substitutionMap)) {
    const found = candidates.find((c) => c.key === ctxKey);
    if (found) return found.q;
  }
  return null;
}

/** SECTION_TOPO_ORDER_ARCHITECTURAL [6505] — базовый порядок (дословно). */
export const SECTION_TOPO_ORDER_ARCHITECTURAL: Readonly<
  Record<string, number>
> = {
  sum: 0,
  graph: 1,
  glossary: 2,
  theses: 3,
  name: 4,
  history: 5,
  origin: 6,
  practical: 6,
  dialogue: 6,
  evolution: 7,
  critique: 8,
  capsule: 9,
};

/** SECTION_TOPO_ORDER_GENETIC [6520] — генетический порядок (дословно). */
export const SECTION_TOPO_ORDER_GENETIC: Readonly<Record<string, number>> = {
  sum: 0,
  dialogue: 1,
  theses: 2,
  glossary: 3,
  graph: 4,
  name: 5,
  history: 6,
  origin: 7,
  practical: 7,
  evolution: 8,
  critique: 9,
  capsule: 10,
};

/**
 * Порт computePredecessors(effectiveDeps) [6486]: sectionKey → Set источников
 * его ctx-ключей (без 'sum' и без самого раздела).
 */
export function computePredecessors(effectiveDeps: DepsMap): PredecessorsMap {
  const preds: PredecessorsMap = {};

  for (const [sec, deps] of Object.entries(effectiveDeps)) {
    preds[sec] = new Set();
    for (const ctxKey of [...deps.required, ...deps.optional]) {
      const src = sourceOf(ctxKey);
      if (src !== "sum" && src !== sec) {
        preds[sec].add(src);
      }
    }
  }
  return preds;
}

/**
 * Порт getEdgeQuality(fromSection, toSection, effectiveDeps, resolvedDeps)
 * [6844]: минимальное качество среди ключей ребра from→to.
 * Оригинальная зависимость (присутствует в resolvedDeps) — цена 10;
 * заменитель — его q из substitutionMap (fallback 1); нет ключей — Infinity.
 */
export function getEdgeQuality(
  fromSection: string,
  toSection: string,
  effectiveDeps: DepsMap,
  resolvedDeps: DepsMap,
  substitutionMap: SubstitutionMap = {},
): number {
  const deps = effectiveDeps[toSection];
  if (!deps) return Infinity;

  const allKeys = [...deps.required, ...deps.optional];
  const edgeKeys = allKeys.filter((k) => sourceOf(k) === fromSection);
  if (!edgeKeys.length) return Infinity;

  let minQ = Infinity;
  for (const k of edgeKeys) {
    const origDeps = resolvedDeps[toSection];
    const isOriginal =
      origDeps !== undefined &&
      [...origDeps.required, ...origDeps.optional].includes(k);
    if (isOriginal) {
      minQ = Math.min(minQ, 10); // оригинальная зависимость — высокая цена удаления
    } else {
      const q = getSubstituteQuality(k, substitutionMap) ?? 1;
      minQ = Math.min(minQ, q);
    }
  }
  return minQ;
}

/**
 * Порт removeEdge(fromSection, toSection, predecessors, effectiveDeps) [6867].
 * Мутирует обе структуры: optional-ключи с источником fromSection удаляются,
 * required-ключи ПЕРЕНОСЯТСЯ в optional (контекст ценен, просто не блокирует
 * порядок — комментарий исходника).
 */
export function removeEdge(
  fromSection: string,
  toSection: string,
  predecessors: PredecessorsMap,
  effectiveDeps: DepsMap,
): void {
  predecessors[toSection]?.delete(fromSection);

  const deps = effectiveDeps[toSection];
  if (!deps) return;

  // Удаляем из optional все ключи с источником fromSection
  deps.optional = deps.optional.filter((k) => sourceOf(k) !== fromSection);

  // required-ключи с источником fromSection — это оригинальные зависимости (q=10),
  // до которых дошла очередь только при отсутствии других вариантов.
  // Переносим их в optional, не удаляем полностью.
  const reqFromSrc = deps.required.filter((k) => sourceOf(k) === fromSection);
  if (reqFromSrc.length) {
    deps.required = deps.required.filter((k) => sourceOf(k) !== fromSection);
    deps.optional = [...deps.optional, ...reqFromSrc];
  }
}

/**
 * Порт findOneCycle(predecessors) [6886]: DFS с трёхцветной раскраской.
 * Возвращает один найденный цикл как массив узлов [pred, ..., node]
 * (последнее ребро node→pred замыкает цикл) или null.
 */
export function findOneCycle(
  predecessors: PredecessorsMap,
): string[] | null {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color: Record<string, number> = {};
  for (const n of Object.keys(predecessors)) color[n] = WHITE;

  let foundCycle: string[] | null = null;

  function dfs(node: string, path: string[]): void {
    if (foundCycle) return;
    color[node] = GRAY;
    path.push(node);

    for (const pred of [...(predecessors[node] ?? [])]) {
      if (foundCycle) return;
      if (color[pred] === GRAY) {
        // pred уже в текущем пути — цикл найден
        const idx = path.indexOf(pred);
        foundCycle = path.slice(idx);
        return;
      }
      if (color[pred] === WHITE) dfs(pred, path);
    }

    path.pop();
    color[node] = BLACK;
  }

  for (const node of Object.keys(predecessors)) {
    if (color[node] === WHITE) dfs(node, []);
    if (foundCycle) break;
  }

  return foundCycle;
}

/**
 * Порт resolveCircularDeps(predecessors, effectiveDeps, resolvedDeps) [6929]:
 * итеративный разрыв циклов ПО САМОМУ СЛАБОМУ РЕБРУ (findOneCycle +
 * getEdgeQuality; уточнение семантики — 01-architecture §4.15 п. 1).
 * Мутирует predecessors и effectiveDeps; возвращает predecessors.
 */
export function resolveCircularDeps(
  predecessors: PredecessorsMap,
  effectiveDeps: DepsMap,
  resolvedDeps: DepsMap,
  substitutionMap: SubstitutionMap = {},
): PredecessorsMap {
  // Верхняя граница итераций = количество рёбер (каждая итерация удаляет хотя бы одно)
  const maxIter = Object.values(predecessors).reduce((s, p) => s + p.size, 0);

  for (let i = 0; i < maxIter; i++) {
    const cycle = findOneCycle(predecessors);
    if (!cycle) break; // циклов нет — готово

    // Ищем ребро с минимальным качеством
    let weakestEdge: [string, string] | null = null;
    let weakestQ = Infinity;
    for (let j = 0; j < cycle.length; j++) {
      const to = cycle[j] as string;
      const from = cycle[(j + 1) % cycle.length] as string;
      const q = getEdgeQuality(
        from,
        to,
        effectiveDeps,
        resolvedDeps,
        substitutionMap,
      );
      if (q < weakestQ) {
        weakestQ = q;
        weakestEdge = [from, to];
      }
    }

    if (weakestEdge) {
      removeEdge(weakestEdge[0], weakestEdge[1], predecessors, effectiveDeps);
    } else {
      // Все рёбра — оригинальные зависимости (q=10/Infinity).
      // Такое возможно только если пользователь выбрал набор, где два раздела
      // являются оригинальными required-зависимостями друг друга.
      // Разрываем последнее ребро цикла как крайний fallback.
      removeEdge(
        cycle[0] as string,
        cycle[cycle.length - 1] as string,
        predecessors,
        effectiveDeps,
      );
    }
  }

  return predecessors;
}

/**
 * Топологическая сортировка (алгоритм Кана) — в исходнике инлайнена внутри
 * buildDynamicOrder [6535]; выделена по протоколу 07 (беседа 1.1, п. 2).
 * Предполагает АЦИКЛИЧНЫЙ preds (циклы разорваны resolveCircularDeps).
 * Ties разрешаются по taблице topoOrder (queue упорядочена по ней,
 * вставка новых узлов — по позиции, как в исходнике).
 */
export function topologicalSort(
  selectedSections: string[],
  preds: PredecessorsMap,
  topoOrder: Readonly<Record<string, number>>,
): string[] {
  const inDegree: Record<string, number> = {};
  const adjList: Record<string, string[]> = {};

  for (const sec of selectedSections) {
    inDegree[sec] = 0;
    adjList[sec] = [];
  }

  for (const [sec, predSet] of Object.entries(preds)) {
    for (const pred of predSet) {
      if (!selectedSections.includes(pred)) continue;
      adjList[pred]?.push(sec);
      inDegree[sec] = (inDegree[sec] ?? 0) + 1;
    }
  }

  const rank = (s: string): number => topoOrder[s] ?? Number.MAX_SAFE_INTEGER;

  const queue = selectedSections
    .filter((s) => inDegree[s] === 0)
    .sort((a, b) => rank(a) - rank(b));
  const order: string[] = [];

  while (queue.length) {
    const node = queue.shift() as string;
    order.push(node);
    const succs = (adjList[node] ?? []).sort((a, b) => rank(a) - rank(b));
    for (const succ of succs) {
      inDegree[succ] = (inDegree[succ] ?? 0) - 1;
      if (inDegree[succ] === 0) {
        const pos = queue.findIndex((q) => rank(q) > rank(succ));
        if (pos === -1) queue.push(succ);
        else queue.splice(pos, 0, succ);
      }
    }
  }

  return order;
}

/**
 * Порт buildDynamicOrder(effectiveDeps, selectedSections, resolvedDeps,
 * generationOrder) [6535]: разрыв циклов + Кан + 'sum' первым.
 *
 * МУТИРУЕТ effectiveDeps (через resolveCircularDeps) — после возврата
 * effectiveDeps актуален для buildContextForSection (комментарий исходника).
 */
export function buildDynamicOrder(
  effectiveDeps: DepsMap,
  selectedSections: string[],
  resolvedDeps: DepsMap,
  generationOrder?: string,
  substitutionMap: SubstitutionMap = {},
): string[] {
  const TOPO =
    generationOrder === "genetic"
      ? SECTION_TOPO_ORDER_GENETIC
      : SECTION_TOPO_ORDER_ARCHITECTURAL;
  const preds = computePredecessors(effectiveDeps);

  // ── Разрываем циклы перед топосортировкой ──────────────────────
  // Мутирует и preds, и effectiveDeps (удаляет weakest optional-ключи).
  resolveCircularDeps(preds, effectiveDeps, resolvedDeps, substitutionMap);
  // ───────────────────────────────────────────────────────────────

  const order = topologicalSort(selectedSections, preds, TOPO);

  return ["sum", ...order];
}
