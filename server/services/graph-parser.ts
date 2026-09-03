/**
 * Graph Parser (беседа 1.4; 04-code-reuse-map §1.7, 02-data-model §3).
 *
 * Порт parseTopology(container, nodeNames) [philosynth.html 12696–12902] и
 * parseGraph(ct) [12925–12988]: извлечение категорий, связей и двухслойной
 * топологии из HTML-ответа Claude. Парсинг — через server/utils/html-parser
 * (единственная точка входа linkedom, инвариант беседы 1.3), вместо
 * браузерного DOM.
 *
 * Адаптации (задокументированные отступления):
 *  - normalizeName/normalizeType НЕ дублируются — они портированы в 0.1 в
 *    shared/utils/normalize.ts (карта 04 §1.7) и импортируются оттуда;
 *  - _rebuildNodeColors/_rebuildEdgeStyles из хвоста parseGraph — клиентские
 *    динамические палитры (карта 04 §1.7 → client/components/graph/
 *    graph-utils.ts, категория «непереносимое»); на сервере рендера нет,
 *    вызовы опущены — формулировка 07 «после парсинга вызываются…»
 *    относится к клиенту (беседа 1.7);
 *  - console.warn о пропущенной римской цифре сохранён (поведение 1:1);
 *  - saveGraphToDb — новое (в исходнике G живёт в памяти): семантика
 *    ЗАМЕНЫ — прежние categories/category_edges/cluster_labels синтеза
 *    удаляются (перегенерация графа замещает граф; CASCADE по source_id/
 *    target_id страхует от осиротевших рёбер);
 *  - рёбра с концами, не совпавшими ни с одной категорией, в БД не пишутся
 *    (FK NOT NULL) — исходник хранил их по именам и молча не рендерил;
 *    здесь они возвращаются в warnings;
 *  - categories.has_reflexive: в исходнике рефлексивность читается при
 *    рендере из направления ребра; в БД поле денормализовано — true, если
 *    есть ребро узла с направлением «рефлексивная» (self-loop или явное).
 */
import { eq } from "drizzle-orm";

import { normalizeName, normalizeType } from "@philosynth/shared/utils/normalize";

import { db } from "../db/index.js";
import { categories, categoryEdges, clusterLabels } from "../db/schema.js";
import { parseFragment, type HtmlElement } from "../utils/html-parser.js";

/* ── Типы результата парсинга (форма G исходника) ────────────────────── */

export interface ParsedGraphNode {
  name: string;
  type: string;
  def: string;
  cen: number;
  cert: number;
  orig: string;
  // Расширенные характеристики (extGraphMetrics, v10; столбцы 6–11)
  histSig?: number | undefined;
  innovDeg?: number | undefined;
  clarity?: number | undefined;
  breadth?: number | undefined;
  depth?: number | undefined;
  applic?: number | undefined;
  _extended?: boolean | undefined;
}

export interface ParsedGraphEdge {
  src: string;
  desc: string;
  tgt: string;
  type: string;
  dir: string;
  str: number;
  // Расширенные характеристики связей (столбцы 6–10)
  certEdge?: number | undefined;
  innovDeg?: number | undefined;
  histSupport?: number | undefined;
  logNec?: number | undefined;
  ctxDep?: number | undefined;
  _extended?: boolean | undefined;
}

export interface ParsedTopology {
  /** nodeName → number[] (индексы кластеров) */
  clusters: Record<string, number[]>;
  roles: {
    structural: Record<string, string[]>;
    procedural: Record<string, string[]>;
  };
  clusterLabels: string[];
}

export interface ParsedGraph {
  nodes: ParsedGraphNode[];
  edges: ParsedGraphEdge[];
  topology: ParsedTopology;
}

/* ── parseTopology [12696] ───────────────────────────────────────────── */

/** Роли: русская метка → ключ (структурные + процессуальные) [12707]. */
// export — 5.1: element-renderer строит обратную карту ключ → метка
export const ROLE_MAP: Readonly<Record<string, string>> = {
  // Структурные
  "центральная": "central",
  "периферийная": "peripheral",
  "мост": "bridge",
  "генеративная": "generative",
  "ядро": "core",
  // Процессуальные: общая
  "синтез": "synthesis",
  // Процессуальные: dialectical
  "тезис": "thesis",
  "антитезис": "antithesis",
  // Процессуальные: deconstructive
  "деконструированная": "deconstructed",
  "пересобранная": "reassembled",
  // Процессуальные: hermeneutical
  "расширение горизонта": "horizon-expansion",
  "предгоризонт": "pre-horizon",
  // Процессуальные: integrative
  "интегрирующая": "integrating",
  "основание": "foundation",
  // Процессуальные: analytical
  "формализованная": "formalized",
  "верифицирующая": "verifying",
};

/**
 * Порт parseTopology(container, nodeNames) [12696]: читает подраздел
 * «Топология графа» (таблица может быть сиблингом — FIX 1 исходника),
 * нечётко маппит роли (FIX 2) и имена узлов, собирает кластеры
 * (голые римские цифры новых кластеров не создают).
 */
export function parseTopology(
  container: HtmlElement,
  nodeNames: string[],
): ParsedTopology {
  const result: ParsedTopology = {
    clusters: {},
    roles: { structural: {}, procedural: {} },
    clusterLabels: [],
  };
  if (!nodeNames.length) return result;

  const sec = container.querySelector('[data-section="Топология графа"]');
  if (!sec) return result;

  // FIX 2: нечёткий маппинг ролей — мужской/женский/средний род
  function matchRole(raw: string): string | null {
    const s = raw.trim().toLowerCase();
    // 1. Точное совпадение
    if (ROLE_MAP[s]) return ROLE_MAP[s];
    // 2. Совпадение по вхождению (для многословных ролей)
    for (const [pattern, key] of Object.entries(ROLE_MAP)) {
      if (s.includes(pattern) || pattern.includes(s)) return key;
    }
    // 3. Совпадение по основе слова
    for (const [pattern, key] of Object.entries(ROLE_MAP)) {
      const stem = pattern.replace(/(ая|ый|ое|ий|ой|ие|ые)$/, "");
      if (stem.length >= 4 && s.startsWith(stem)) return key;
    }
    return null;
  }

  function addStructural(name: string, role: string): void {
    (result.roles.structural[name] ??= []);
    if (!result.roles.structural[name].includes(role))
      result.roles.structural[name].push(role);
  }
  function addProcedural(name: string, role: string): void {
    (result.roles.procedural[name] ??= []);
    if (!result.roles.procedural[name].includes(role))
      result.roles.procedural[name].push(role);
  }

  // «I — Первый кластер» → «Первый кластер»; без префикса — как есть
  function clusterNamePart(label: string): string {
    const m = label.match(/^[IVXLCDM]+\s*[-–—]\s*(.+)$/i);
    return m && m[1] !== undefined ? m[1].trim() : label;
  }

  function isBareRoman(s: string): boolean {
    return /^[IVXLCDM]+$/i.test(s.trim());
  }

  // Ищет кластер по метке; голая римская цифра нового НЕ создаёт
  function findOrCreateCluster(label: string): number {
    if (!label) return -1;

    // 1. Точное совпадение
    let idx = result.clusterLabels.indexOf(label);
    if (idx !== -1) return idx;

    const SEPS = [" —", " –", " -", "\u00a0—", "\u00a0–", "\u00a0-", " ", "\u00a0"];

    // 2. Префиксное совпадение (в обе стороны)
    idx = result.clusterLabels.findIndex((existing) => {
      if (SEPS.some((s) => existing.startsWith(label + s))) return true;
      if (SEPS.some((s) => label.startsWith(existing + s))) return true;
      return false;
    });
    if (idx !== -1) return idx;

    // 3. Совпадение именных частей: «Логика» ↔ «I — Логика»
    const namePart = clusterNamePart(label);
    idx = result.clusterLabels.findIndex(
      (existing) =>
        clusterNamePart(existing).toLowerCase() === namePart.toLowerCase(),
    );
    if (idx !== -1) return idx;

    // 4. Голая римская цифра без совпадения — пропуск (console.warn как в исходнике)
    if (isBareRoman(label)) {
      console.warn(
        "parseTopology: голая римская цифра «" +
          label +
          "» без совпадения с существующим кластером — пропущена",
      );
      return -1;
    }

    // 5. Полноценная метка — новый кластер
    idx = result.clusterLabels.length;
    result.clusterLabels.push(label);
    return idx;
  }

  function assignCluster(name: string, idx: number): void {
    if (idx === -1) return;
    (result.clusters[name] ??= []);
    if (!result.clusters[name].includes(idx)) result.clusters[name].push(idx);
  }

  // Нечёткое сопоставление имён топологической таблицы с каноническими
  const _nodeNamesLower = nodeNames.map((n) => n.toLowerCase().trim());
  function matchNodeName(rawName: string): string {
    const norm = rawName.toLowerCase().trim();
    // 1. Точное совпадение
    const exactIdx = _nodeNamesLower.indexOf(norm);
    if (exactIdx !== -1) return nodeNames[exactIdx] as string;
    // 2. Одно имя содержит другое
    for (let i = 0; i < nodeNames.length; i++) {
      const cn = _nodeNamesLower[i] as string;
      if (norm.includes(cn) || cn.includes(norm)) return nodeNames[i] as string;
    }
    // 3. Совпадение по первому слову
    const firstWord = norm.split(/[\s,;:–—]+/)[0] ?? "";
    if (firstWord.length >= 4) {
      for (let i = 0; i < nodeNames.length; i++) {
        if ((_nodeNamesLower[i] as string).startsWith(firstWord))
          return nodeNames[i] as string;
      }
    }
    // 4. Не найден — как есть (fallback)
    return rawName;
  }

  // FIX 1: таблица может быть сиблингом «Топология графа», а не потомком
  const topoSection =
    sec.querySelector('[data-section="Топологическая таблица"]') ||
    container.querySelector('[data-section="Топологическая таблица"]');
  const tableScope = topoSection || sec;

  for (const tr of tableScope.querySelectorAll("table.doc-table tbody tr")) {
    const td = Array.from(tr.querySelectorAll("td")).map((c) =>
      (c.textContent ?? "").trim(),
    );
    if (td.length < 2) continue;

    const rawName = normalizeName(td[0] as string);
    if (!rawName) continue;
    const name = matchNodeName(rawName);

    // ── Столбец 1: Кластер(ы) ──
    const clusterRaw = (td[1] || "").trim();
    if (clusterRaw) {
      for (const part of clusterRaw.split(/\s*\/\s*/)) {
        const label = part.trim();
        if (!label) continue;
        if (/^мост$/i.test(label)) {
          addStructural(name, "bridge"); // роль — да, кластер — нет
        } else {
          assignCluster(name, findOrCreateCluster(label));
        }
      }
    }

    // ── Столбец 2: Структурные роли ──
    const strRaw = (td[2] || "").trim();
    if (strRaw) {
      for (const part of strRaw.split(/[,/]+/)) {
        const key = matchRole(part);
        if (key) addStructural(name, key);
      }
    }

    // ── Столбец 3: Процессуальные роли ──
    const procRaw = (td[3] || "").trim();
    if (procRaw) {
      for (const part of procRaw.split(/[,/]+/)) {
        const key = matchRole(part);
        if (key) addProcedural(name, key);
      }
    }
  }

  return result;
}

/* ── parseGraph [12925] ──────────────────────────────────────────────── */

/**
 * Порт parseGraph(ct): «Таблица категорий» → nodes (базовые столбцы 0–5,
 * расширенные 6–11 при extGraphMetrics), «Таблица связей» → edges
 * (базовые 0–5, расширенные 6–10), затем parseTopology.
 */
export function parseGraphFromElement(ct: HtmlElement): ParsedGraph {
  const nodes: ParsedGraphNode[] = [];
  const edges: ParsedGraphEdge[] = [];

  const nodeSection = ct.querySelector('[data-section="Таблица категорий"]');
  if (nodeSection) {
    for (const tr of nodeSection.querySelectorAll("table.doc-table tbody tr")) {
      const td = Array.from(tr.querySelectorAll("td")).map((c) =>
        (c.textContent ?? "").trim(),
      );
      if (td.length >= 4) {
        const node: ParsedGraphNode = {
          name: normalizeName(td[0] as string),
          type: normalizeType(td[1] || "").toLowerCase(),
          def: td[2] || "",
          cen: parseFloat(td[3] as string) || 0.5,
          cert: parseFloat(td[4] ?? "") || 0.5,
          orig: td[5] || "",
        };
        // Расширенные характеристики (столбцы 6–11, если присутствуют)
        if (td.length > 6 && td[6]) {
          node.histSig = parseFloat(td[6]) || 0;
          node.innovDeg = parseFloat(td[7] ?? "") || 0;
          node.clarity = parseFloat(td[8] ?? "") || 0;
          node.breadth = parseFloat(td[9] ?? "") || 0;
          node.depth = parseFloat(td[10] ?? "") || 0;
          node.applic = parseFloat(td[11] ?? "") || 0;
          node._extended = true;
        }
        nodes.push(node);
      }
    }
  }

  const edgeSection = ct.querySelector('[data-section="Таблица связей"]');
  if (edgeSection) {
    for (const tr of edgeSection.querySelectorAll("table.doc-table tbody tr")) {
      const td = Array.from(tr.querySelectorAll("td")).map((c) =>
        (c.textContent ?? "").trim(),
      );
      if (td.length >= 4) {
        const edge: ParsedGraphEdge = {
          src: normalizeName(td[0] as string),
          desc: td[1] || "",
          tgt: normalizeName(td[2] as string),
          type: td[3] || "",
          dir: (td[4] || "однонаправленная").toLowerCase(),
          str: parseFloat(td[5] ?? "") || 0.5,
        };
        // Расширенные характеристики связей (столбцы 6–10)
        if (td.length > 6 && td[6]) {
          edge.certEdge = parseFloat(td[6]) || 0;
          edge.innovDeg = parseFloat(td[7] ?? "") || 0;
          edge.histSupport = parseFloat(td[8] ?? "") || 0;
          edge.logNec = parseFloat(td[9] ?? "") || 0;
          edge.ctxDep = parseFloat(td[10] ?? "") || 0;
          edge._extended = true;
        }
        edges.push(edge);
      }
    }
  }

  const topology = parseTopology(
    ct,
    nodes.map((n) => n.name),
  );
  // _rebuildNodeColors/_rebuildEdgeStyles — клиентские палитры (04 §1.7),
  // на сервере опущены (см. шапку модуля).
  return { nodes, edges, topology };
}

/** Как в 07: вход — HTML-строка раздела «graph» (обёртка над portом). */
export function parseGraphFromHTML(html: string): ParsedGraph {
  return parseGraphFromElement(parseFragment(html));
}

/* ── Запись в БД ─────────────────────────────────────────────────────── */

export interface SaveGraphResult {
  categoriesInserted: number;
  edgesInserted: number;
  clustersInserted: number;
  /** Рёбра с концами вне таблицы категорий и прочие пропуски */
  warnings: string[];
}

/**
 * saveGraphToDb(synthesisId, parsedGraph): транзакционная ЗАМЕНА графа
 * синтеза — DELETE прежних categories / category_edges / cluster_labels,
 * INSERT новых (02-data-model §3: HTML → гранулярные таблицы).
 */
export async function saveGraphToDb(
  synthesisId: string,
  parsed: ParsedGraph,
): Promise<SaveGraphResult> {
  const warnings: string[] = [];

  return db.transaction(async (tx) => {
    // Замена: рёбра удалятся и CASCADE'ом по категориям, DELETE явный —
    // для рёбер, чьи категории могли быть добавлены вручную и уцелеть.
    await tx
      .delete(categoryEdges)
      .where(eq(categoryEdges.synthesisId, synthesisId));
    await tx.delete(categories).where(eq(categories.synthesisId, synthesisId));
    await tx
      .delete(clusterLabels)
      .where(eq(clusterLabels.synthesisId, synthesisId));

    // has_reflexive: есть ребро узла с направлением «рефлексивная»
    const reflexiveNames = new Set<string>();
    for (const e of parsed.edges) {
      if (e.dir.includes("рефлексивн")) {
        reflexiveNames.add(e.src);
        if (e.tgt) reflexiveNames.add(e.tgt);
      }
    }

    let categoriesInserted = 0;
    const idByName = new Map<string, string>();
    if (parsed.nodes.length > 0) {
      const rows = parsed.nodes.map((n, i) => ({
        synthesisId,
        name: n.name,
        type: n.type,
        definition: n.def,
        centrality: n.cen,
        certainty: n.cert,
        origin: n.orig,
        ...(n._extended
          ? {
              historicalSignificance: n.histSig ?? 0,
              innovationDegree: Math.round(n.innovDeg ?? 0) || 1,
              clarity: n.clarity ?? 0,
              breadth: n.breadth ?? 0,
              depthScore: n.depth ?? 0,
              applicability: n.applic ?? 0,
            }
          : {}),
        clusterIndices: parsed.topology.clusters[n.name] ?? [],
        structuralRoles: parsed.topology.roles.structural[n.name] ?? [],
        proceduralRoles: parsed.topology.roles.procedural[n.name] ?? [],
        hasReflexive: reflexiveNames.has(n.name),
        position: i,
        source: "generated" as const,
      }));
      const inserted = await tx
        .insert(categories)
        .values(rows)
        .returning({ id: categories.id, name: categories.name });
      categoriesInserted = inserted.length;
      for (const r of inserted) idByName.set(r.name, r.id);
    }

    let edgesInserted = 0;
    if (parsed.edges.length > 0) {
      const edgeRows = [];
      let pos = 0;
      for (const e of parsed.edges) {
        const sourceId = idByName.get(e.src);
        const targetId = idByName.get(e.tgt);
        if (!sourceId || !targetId) {
          // Исходник хранил такие рёбра по именам и не рендерил; БД с FK
          // их не принимает — фиксируем предупреждением.
          warnings.push(
            `ребро «${e.src}» → «${e.tgt}» пропущено: ` +
              `${!sourceId ? "источник" : "цель"} не найдена в таблице категорий`,
          );
          continue;
        }
        edgeRows.push({
          synthesisId,
          sourceId,
          targetId,
          description: e.desc,
          edgeType: e.type,
          direction: e.dir.includes("рефлекс")
            ? ("рефлексивная" as const)
            : e.dir.includes("двунаправ")
              ? ("двунаправленная" as const)
              : ("однонаправленная" as const),
          strength: e.str,
          ...(e._extended
            ? {
                certainty: e.certEdge ?? 0.5,
                innovationDegree: Math.round(e.innovDeg ?? 0) || 1,
                historicalSupport: e.histSupport ?? 0.5,
                logicalNecessity: e.logNec ?? 0.5,
                contextDependency: e.ctxDep ?? 0.5,
              }
            : {}),
          position: pos++,
          sourceOrigin: "generated" as const,
        });
      }
      if (edgeRows.length > 0) {
        const inserted = await tx
          .insert(categoryEdges)
          .values(edgeRows)
          .returning({ id: categoryEdges.id });
        edgesInserted = inserted.length;
      }
    }

    let clustersInserted = 0;
    if (parsed.topology.clusterLabels.length > 0) {
      const inserted = await tx
        .insert(clusterLabels)
        .values(
          parsed.topology.clusterLabels.map((label, clusterIndex) => ({
            synthesisId,
            clusterIndex,
            label,
          })),
        )
        .returning({ id: clusterLabels.id });
      clustersInserted = inserted.length;
    }

    return { categoriesInserted, edgesInserted, clustersInserted, warnings };
  });
}

/** Служебное: проверка наличия категорий (используется тестами/роутами). */
export async function hasGraph(synthesisId: string): Promise<boolean> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.synthesisId, synthesisId))
    .limit(1);
  return rows.length > 0;
}
