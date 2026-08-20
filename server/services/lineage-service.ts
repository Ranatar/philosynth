/**
 * Lineage Service (беседа 3.1; 01-architecture §4.6 «Граф наследования»,
 * 02-data-model §2.4, 03-specification §2.8).
 *
 * Навигация по synthesis_lineage рекурсивными CTE:
 *  - getAncestors(id, maxDepth)   — дерево предков (LineageNode);
 *  - getDescendants(id, maxDepth) — потомки (список поддеревьев);
 *  - searchByPhilosophers(names)  — синтезы, в генеалогии которых есть ВСЕ
 *    указанные философы (транзитивно; HAVING count = names.length);
 *  - createLineageRecords         — запись генеалогии при создании синтеза.
 *
 * Прародителей в исходнике нет (клиентская генеалогия жила в объектах
 * genealogy концепт-файлов — reconstructGenealogy, беседа 3.2); здесь
 * источник истины — БД. Ограничение глубины — как в примере CTE 02 §2.4
 * (depth < 10); защитный clamp на maxDepth 1..10.
 *
 * Доступ (владелец/публичный) сервис НЕ проверяет — это слой роутов
 * (routes/lineage.ts): descendants может содержать чужие приватные
 * синтезы, роут отсекает невидимые поддеревья.
 */

import { inArray } from "drizzle-orm";

import { db, sql } from "../db/index.js";
import { syntheses, synthesisLineage } from "../db/schema.js";
import type {
  LineageNode,
  ParticipantInput,
} from "@philosynth/shared/types/lineage";

const MAX_LINEAGE_DEPTH = 10;

function clampDepth(depth: number | undefined, fallback: number): number {
  if (!Number.isFinite(depth) || depth === undefined) return fallback;
  return Math.min(Math.max(Math.trunc(depth), 1), MAX_LINEAGE_DEPTH);
}

/** Заголовки синтезов по списку id (для имён узлов). */
async function titlesFor(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ id: syntheses.id, title: syntheses.title })
    .from(syntheses)
    .where(inArray(syntheses.id, [...new Set(ids)]));
  for (const r of rows) map.set(r.id, r.title);
  return map;
}

/* ══ getAncestors ═════════════════════════════════════════════════════ */

interface AncestorRow {
  synthesis_id: string;
  parent_type: "philosopher" | "synthesis";
  parent_name: string | null;
  parent_synthesis_id: string | null;
  position: number;
  depth: number;
}

/**
 * Дерево предков: корень — сам синтез (depth 0), children — родители в
 * порядке position; философ — лист, концепция раскрывается вглубь до
 * maxDepth. Родитель, удалённый из БД (SET NULL), пропускается.
 */
export async function getAncestors(
  synthesisId: string,
  maxDepth?: number,
): Promise<LineageNode> {
  const depth = clampDepth(maxDepth, 10);

  const rows = await sql<AncestorRow[]>`
    WITH RECURSIVE ancestors AS (
      SELECT synthesis_id, parent_type, parent_name, parent_synthesis_id,
             position, 1 AS depth
      FROM synthesis_lineage WHERE synthesis_id = ${synthesisId}

      UNION ALL

      SELECT sl.synthesis_id, sl.parent_type, sl.parent_name,
             sl.parent_synthesis_id, sl.position, a.depth + 1
      FROM synthesis_lineage sl
      JOIN ancestors a ON sl.synthesis_id = a.parent_synthesis_id
      WHERE a.parent_type = 'synthesis' AND a.depth < ${depth}
    )
    SELECT * FROM ancestors ORDER BY depth, position
  `;

  const byChild = new Map<string, AncestorRow[]>();
  for (const r of rows) {
    const list = byChild.get(r.synthesis_id) ?? [];
    list.push(r);
    byChild.set(r.synthesis_id, list);
  }

  const idsForTitles = [
    synthesisId,
    ...rows
      .filter((r) => r.parent_type === "synthesis" && r.parent_synthesis_id)
      .map((r) => r.parent_synthesis_id as string),
  ];
  const titles = await titlesFor(idsForTitles);

  const build = (
    id: string,
    nodeDepth: number,
    path: Set<string>,
  ): LineageNode[] => {
    if (nodeDepth > depth) return [];
    const children: LineageNode[] = [];
    for (const r of byChild.get(id) ?? []) {
      if (r.parent_type === "philosopher") {
        if (!r.parent_name) continue;
        children.push({
          type: "philosopher",
          name: r.parent_name,
          depth: nodeDepth,
          children: [],
        });
      } else {
        const pid = r.parent_synthesis_id;
        if (!pid || path.has(pid)) continue; // страховка от цикла в данных
        children.push({
          type: "synthesis",
          name: titles.get(pid) ?? "[безымянная концепция]",
          synthesisId: pid,
          depth: nodeDepth,
          children: build(pid, nodeDepth + 1, new Set([...path, pid])),
        });
      }
    }
    return children;
  };

  return {
    type: "synthesis",
    name: titles.get(synthesisId) ?? "[безымянная концепция]",
    synthesisId,
    depth: 0,
    children: build(synthesisId, 1, new Set([synthesisId])),
  };
}

/* ══ getDescendants ═══════════════════════════════════════════════════ */

interface DescendantRow {
  child_id: string;
  parent_id: string;
  depth: number;
}

/**
 * Потомки: синтезы, у которых данный — среди родителей (транзитивно).
 * Возвращает список поддеревьев непосредственных потомков; children узла —
 * его собственные потомки. userId узлов НЕ фильтруется здесь (см. шапку).
 */
export async function getDescendants(
  synthesisId: string,
  maxDepth?: number,
): Promise<LineageNode[]> {
  const depth = clampDepth(maxDepth, 5);

  const rows = await sql<DescendantRow[]>`
    WITH RECURSIVE descendants AS (
      SELECT sl.synthesis_id AS child_id,
             sl.parent_synthesis_id AS parent_id, 1 AS depth
      FROM synthesis_lineage sl
      WHERE sl.parent_synthesis_id = ${synthesisId}
        AND sl.parent_type = 'synthesis'

      UNION ALL

      SELECT sl.synthesis_id, sl.parent_synthesis_id, d.depth + 1
      FROM synthesis_lineage sl
      JOIN descendants d ON sl.parent_synthesis_id = d.child_id
      WHERE sl.parent_type = 'synthesis' AND d.depth < ${depth}
    )
    SELECT DISTINCT child_id, parent_id, depth FROM descendants
    ORDER BY depth, child_id
  `;

  const byParent = new Map<string, string[]>();
  for (const r of rows) {
    const list = byParent.get(r.parent_id) ?? [];
    if (!list.includes(r.child_id)) list.push(r.child_id);
    byParent.set(r.parent_id, list);
  }

  const titles = await titlesFor(rows.map((r) => r.child_id));

  const build = (
    parentId: string,
    nodeDepth: number,
    path: Set<string>,
  ): LineageNode[] => {
    if (nodeDepth > depth) return [];
    const out: LineageNode[] = [];
    for (const childId of byParent.get(parentId) ?? []) {
      if (path.has(childId)) continue; // страховка от цикла в данных
      out.push({
        type: "synthesis",
        name: titles.get(childId) ?? "[безымянная концепция]",
        synthesisId: childId,
        depth: nodeDepth,
        children: build(childId, nodeDepth + 1, new Set([...path, childId])),
      });
    }
    return out;
  };

  return build(synthesisId, 1, new Set([synthesisId]));
}

/* ══ searchByPhilosophers ═════════════════════════════════════════════ */

/**
 * id синтезов, в генеалогии которых (транзитивно, глубина ≤ 10) есть ВСЕ
 * указанные философы: рекурсивный CTE пар (root_id, философ-предок) +
 * HAVING COUNT(DISTINCT) = names.length (03 §2.8). Пустой список имён →
 * пустой результат (валидация — у роута).
 */
export async function searchByPhilosophers(
  names: readonly string[],
): Promise<string[]> {
  const uniq = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (uniq.length === 0) return [];

  const rows = await sql<{ root_id: string }[]>`
    WITH RECURSIVE anc AS (
      SELECT sl.synthesis_id AS root_id, sl.parent_type, sl.parent_name,
             sl.parent_synthesis_id, 1 AS depth
      FROM synthesis_lineage sl

      UNION ALL

      SELECT a.root_id, sl.parent_type, sl.parent_name,
             sl.parent_synthesis_id, a.depth + 1
      FROM synthesis_lineage sl
      JOIN anc a ON sl.synthesis_id = a.parent_synthesis_id
      WHERE a.parent_type = 'synthesis' AND a.depth < 10
    )
    SELECT root_id FROM anc
    WHERE parent_type = 'philosopher'
      AND parent_name IN ${sql(uniq)}
    GROUP BY root_id
    HAVING COUNT(DISTINCT parent_name) = ${uniq.length}
  `;
  return rows.map((r) => r.root_id);
}

/* ══ createLineageRecords ═════════════════════════════════════════════ */

/**
 * Запись synthesis_lineage при создании синтеза (07, запрос 1): позиции —
 * сквозные по порядку participants. Философы дедуплицируются вызывающим
 * (POST-роут сливает philosophers[] и participants).
 */
export async function createLineageRecords(
  synthesisId: string,
  participants: readonly ParticipantInput[],
): Promise<void> {
  if (participants.length === 0) return;
  await db.insert(synthesisLineage).values(
    participants.map((p, position) =>
      p.type === "philosopher"
        ? {
            synthesisId,
            parentType: "philosopher" as const,
            parentName: p.name,
            position,
          }
        : {
            synthesisId,
            parentType: "synthesis" as const,
            parentSynthesisId: p.synthesisId,
            position,
          },
    ),
  );
}
