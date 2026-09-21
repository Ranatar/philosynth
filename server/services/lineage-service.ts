/**
 * Lineage Service (беседа 3.1; 01-architecture §4.6 «Граф наследования»,
 * 02-data-model §2.4, 03-specification §2.8).
 *
 * Навигация по synthesis_lineage рекурсивными CTE:
 *  - getAncestors(id, maxDepth)   — дерево предков (LineageNode);
 *  - getDescendants(id, maxDepth) — потомки (список поддеревьев);
 *  - searchByPhilosophers(names)  — синтезы, в генеалогии которых есть ВСЕ
 *    указанные философы (транзитивно; HAVING count = names.length);
 *  - createLineageRecords         — запись генеалогии при создании синтеза;
 *  - дерево импортированного файла (syntheses.file_genealogy):
 *    sanitizeFileGenealogy (запись при импорте), unlinkedFileParents,
 *    подшивка в getAncestors и позиция связи в linkParent. ПРАВИЛО
 *    ПРИОРИТЕТА: действующая строка synthesis_lineage на позиции i
 *    перекрывает узел файла с индексом i; узел файла — только где связи
 *    нет (или её родитель удалён — SET NULL);
 *  - 8.5: normalizeConceptTitle / findSameOwnerSynthesesByTitle — сопоставление
 *    концепции-родителя ПО ИМЕНИ среди синтезов того же владельца
 *    (предложением, без записи); isDescendantOf + linkParent —
 *    POST /syntheses/:id/lineage/link с заслонами LINEAGE_SELF /
 *    LINEAGE_CYCLE / идемпотентный отказ на существующую пару.
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

import { and, eq, inArray, ne } from "drizzle-orm";

import { db, sql } from "../db/index.js";
import { syntheses, synthesisLineage } from "../db/schema.js";
import type {
  FileGenealogyNode,
  LineageCandidateMatch,
  LineageNode,
  LineageRecord,
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

/* ══ Дерево импортированного файла (syntheses.file_genealogy) ═════════ */

/** Предел вложенности дерева файла при записи (страховка от мусора). */
const MAX_FILE_GENEALOGY_DEPTH = 32;

function strField(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

/**
 * Очистка дерева файла перед записью в syntheses.file_genealogy: только
 * известные поля, имя обязательно, всё, что не 'philosopher', — концепция
 * (сервис 4.3 пишет у участников type='synthesis'). Узел без имени
 * становится «[безымянная концепция]», а НЕ выбрасывается — иначе съедут
 * индексы participants корня, а индекс = position связи в БД.
 */
export function sanitizeFileGenealogy(
  node: unknown,
  level = 0,
): FileGenealogyNode | null {
  if (!node || typeof node !== "object") return null;
  const n = node as Record<string, unknown>;
  const isPhil = n.type === "philosopher";
  const name =
    strField(n.name)?.trim() ?? (isPhil ? "[безымянный философ]" : "[безымянная концепция]");
  if (isPhil) return { type: "philosopher", name };
  const out: FileGenealogyNode = { type: "concept", name };
  for (const k of [
    "method",
    "synthLevel",
    "generationOrder",
    "seed",
    "capsule",
    "synthesisId",
  ] as const) {
    const v = strField(n[k]);
    if (v !== undefined) out[k] = v;
  }
  if (Array.isArray(n.participants) && level < MAX_FILE_GENEALOGY_DEPTH) {
    const kids = n.participants
      .map((p) => sanitizeFileGenealogy(p, level + 1))
      .filter((p): p is FileGenealogyNode => p !== null);
    if (kids.length > 0) out.participants = kids;
  }
  return out;
}

/** Минимум строки synthesis_lineage для правила приоритета. */
interface LineagePosRow {
  position: number;
  parentType: "philosopher" | "synthesis";
  parentName: string | null;
  parentSynthesisId: string | null;
}

/** Действует ли строка: философ с именем или концепция с живым родителем. */
function rowIsLive(r: LineagePosRow): boolean {
  return r.parentType === "philosopher"
    ? !!r.parentName
    : !!r.parentSynthesisId;
}

/**
 * Родители из дерева файла, НЕ перекрытые действующей связью в БД на той
 * же позиции (правило приоритета). Порядок — порядок файла.
 */
export function unlinkedFileParents(
  fileGenealogy: FileGenealogyNode | null | undefined,
  rows: readonly LineagePosRow[],
): { position: number; node: FileGenealogyNode }[] {
  const parts = fileGenealogy?.participants ?? [];
  if (parts.length === 0) return [];
  const taken = new Set(rows.filter(rowIsLive).map((r) => r.position));
  return parts
    .map((node, position) => ({ position, node }))
    .filter((x) => !taken.has(x.position));
}

/** Узел файла → LineageNode (снимок: fromFile, без synthesisId). */
function fileNodeToLineage(
  node: FileGenealogyNode,
  nodeDepth: number,
  maxDepth: number,
): LineageNode {
  if (node.type === "philosopher") {
    return {
      type: "philosopher",
      name: node.name,
      depth: nodeDepth,
      children: [],
      fromFile: true,
    };
  }
  const out: LineageNode = {
    type: "synthesis",
    name: node.name,
    depth: nodeDepth,
    children:
      nodeDepth < maxDepth
        ? (node.participants ?? []).map((p) =>
            fileNodeToLineage(p, nodeDepth + 1, maxDepth),
          )
        : [],
    fromFile: true,
  };
  if (node.method) out.method = node.method;
  if (node.synthLevel) out.synthLevel = node.synthLevel;
  if (node.generationOrder) out.generationOrder = node.generationOrder;
  if (node.seed) out.seed = node.seed;
  if (node.capsule) out.capsule = node.capsule;
  return out;
}

/** Заголовки и деревья файла синтезов по списку id. */
async function titlesAndFileTrees(ids: string[]): Promise<{
  titles: Map<string, string>;
  files: Map<string, FileGenealogyNode>;
}> {
  const titles = new Map<string, string>();
  const files = new Map<string, FileGenealogyNode>();
  if (ids.length === 0) return { titles, files };
  const rows = await db
    .select({
      id: syntheses.id,
      title: syntheses.title,
      fileGenealogy: syntheses.fileGenealogy,
    })
    .from(syntheses)
    .where(inArray(syntheses.id, [...new Set(ids)]));
  for (const r of rows) {
    titles.set(r.id, r.title);
    if (r.fileGenealogy) files.set(r.id, r.fileGenealogy);
  }
  return { titles, files };
}

/**
 * Дерево предков в форме embeddedState.genealogy (FileGenealogyNode) — для
 * экспорта: корень с метаданными строки, узлы БД с synthesisId, узлы файла
 * как есть. Капсулы не пишутся (паритет stripCapsulesFromGenealogy).
 */
export function lineageTreeToFileGenealogy(
  node: LineageNode,
  rootMeta: { method?: string; synthLevel?: string; seed?: string } = {},
): FileGenealogyNode {
  const conv = (n: LineageNode): FileGenealogyNode => {
    if (n.type === "philosopher") return { type: "philosopher", name: n.name };
    const out: FileGenealogyNode = { type: "concept", name: n.name };
    if (n.synthesisId) out.synthesisId = n.synthesisId;
    if (n.method) out.method = n.method;
    if (n.synthLevel) out.synthLevel = n.synthLevel;
    if (n.generationOrder) out.generationOrder = n.generationOrder;
    if (n.seed) out.seed = n.seed;
    out.participants = n.children.map(conv);
    return out;
  };
  const root = conv(node);
  if (rootMeta.method) root.method = rootMeta.method;
  if (rootMeta.synthLevel) root.synthLevel = rootMeta.synthLevel;
  if (rootMeta.seed) root.seed = rootMeta.seed;
  return root;
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
  const { titles, files } = await titlesAndFileTrees(idsForTitles);

  const build = (
    id: string,
    nodeDepth: number,
    path: Set<string>,
  ): LineageNode[] => {
    if (nodeDepth > depth) return [];
    // Слоты по позиции: связь БД либо (правило приоритета) узел файла
    const slots: { position: number; node: LineageNode }[] = [];
    const dbRows = byChild.get(id) ?? [];
    for (const r of dbRows) {
      if (r.parent_type === "philosopher") {
        if (!r.parent_name) continue;
        slots.push({
          position: r.position,
          node: {
            type: "philosopher",
            name: r.parent_name,
            depth: nodeDepth,
            children: [],
          },
        });
      } else {
        const pid = r.parent_synthesis_id;
        if (!pid || path.has(pid)) continue; // страховка от цикла в данных
        slots.push({
          position: r.position,
          node: {
            type: "synthesis",
            name: titles.get(pid) ?? "[безымянная концепция]",
            synthesisId: pid,
            depth: nodeDepth,
            children: build(pid, nodeDepth + 1, new Set([...path, pid])),
          },
        });
      }
    }
    const fileParents = unlinkedFileParents(
      files.get(id),
      dbRows.map((r) => ({
        position: r.position,
        parentType: r.parent_type,
        parentName: r.parent_name,
        parentSynthesisId: r.parent_synthesis_id,
      })),
    );
    for (const f of fileParents) {
      slots.push({
        position: f.position,
        node: fileNodeToLineage(f.node, nodeDepth, depth),
      });
    }
    // Устойчивая сортировка: при равных позициях — порядок БД, затем файла
    return slots
      .map((x, i) => ({ ...x, i }))
      .sort((a, b) => a.position - b.position || a.i - b.i)
      .map((x) => x.node);
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

/* ══ 8.5: сопоставление родителя по имени ═════════════════════════════ */

/**
 * Нормализация названия концепции для сопоставления по имени (07, беседа
 * 8.5, п.2): схлопнуть пробелы, снять кавычки-ёлочки и обычные (в том
 * числе „лапки“ и типографские “”), привести регистр. НЕ идентификатор —
 * результат сравнения служит только предложению, связь по нему молча не
 * создаётся.
 */
export function normalizeConceptTitle(title: string): string {
  return title
    .replace(/[«»"„“”‟']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Синтезы владельца, чьё название совпадает с parentName после
 * нормализации; excludeId — только что созданный синтез (сам себе не
 * родитель). Нормализация выполняется в TS, а не в SQL: одна функция —
 * один источник истины для сравнения; синтезов у владельца — десятки/сотни,
 * одна выборка заголовков дешевле подбора регулярных выражений PG.
 */
export async function findSameOwnerSynthesesByTitle(
  userId: string,
  parentName: string,
  excludeId?: string,
): Promise<LineageCandidateMatch[]> {
  const wanted = normalizeConceptTitle(parentName);
  if (!wanted) return [];
  const rows = await db
    .select({
      id: syntheses.id,
      title: syntheses.title,
      createdAt: syntheses.createdAt,
    })
    .from(syntheses)
    .where(
      excludeId
        ? and(eq(syntheses.userId, userId), ne(syntheses.id, excludeId))
        : eq(syntheses.userId, userId),
    )
    .orderBy(syntheses.createdAt);
  return rows
    .filter((r) => normalizeConceptTitle(r.title) === wanted)
    .map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
    }));
}

/* ══ 8.5: POST /syntheses/:id/lineage/link ═════════════════════════════ */

/**
 * Есть ли candidateId среди ПОТОМКОВ rootId (транзитивно, без потолка
 * глубины CTE 02 §2.4 — цикл создаётся привязкой родителя, который сам
 * происходит от нас, и проверять надо именно потомков, а не предков;
 * защитный потолок 100 на случай уже испорченных данных).
 */
export async function isDescendantOf(
  rootId: string,
  candidateId: string,
): Promise<boolean> {
  const rows = await sql<{ found: number }[]>`
    WITH RECURSIVE descendants AS (
      SELECT sl.synthesis_id AS child_id, 1 AS depth
      FROM synthesis_lineage sl
      WHERE sl.parent_synthesis_id = ${rootId}
        AND sl.parent_type = 'synthesis'

      UNION ALL

      SELECT sl.synthesis_id, d.depth + 1
      FROM synthesis_lineage sl
      JOIN descendants d ON sl.parent_synthesis_id = d.child_id
      WHERE sl.parent_type = 'synthesis' AND d.depth < 100
    )
    SELECT 1 AS found FROM descendants WHERE child_id = ${candidateId} LIMIT 1
  `;
  return rows.length > 0;
}

export type LineageLinkErrorCode =
  | "LINEAGE_SELF"
  | "LINEAGE_CYCLE"
  | "LINEAGE_EXISTS";

/** Отказ связывания; статус/код HTTP назначает роут (03 §4.3). */
export class LineageLinkError extends Error {
  constructor(
    readonly code: LineageLinkErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LineageLinkError";
  }
}

/**
 * Привязка концепции-родителя к существующему синтезу (беседа 8.5, п.3):
 * строка synthesis_lineage parent_type='synthesis', position — в конец
 * существующих родителей. Заслоны здесь — только структурные (self /
 * пара уже есть / цикл через потомков); владение обоими синтезами
 * проверяет роут (403 FORBIDDEN), как и прочий доступ в этом сервисе.
 * Существующая пара → LINEAGE_EXISTS (идемпотентный отказ, строка не
 * дублируется).
 */
export async function linkParent(
  synthesisId: string,
  parentSynthesisId: string,
  parentName?: string,
): Promise<LineageRecord> {
  if (synthesisId === parentSynthesisId) {
    throw new LineageLinkError(
      "LINEAGE_SELF",
      "Концепция не может быть собственным родителем",
    );
  }
  const [dup] = await db
    .select({ id: synthesisLineage.id })
    .from(synthesisLineage)
    .where(
      and(
        eq(synthesisLineage.synthesisId, synthesisId),
        eq(synthesisLineage.parentType, "synthesis"),
        eq(synthesisLineage.parentSynthesisId, parentSynthesisId),
      ),
    )
    .limit(1);
  if (dup) {
    throw new LineageLinkError(
      "LINEAGE_EXISTS",
      "Эта концепция уже указана родителем",
    );
  }
  if (await isDescendantOf(synthesisId, parentSynthesisId)) {
    throw new LineageLinkError(
      "LINEAGE_CYCLE",
      "Нельзя назначить родителем собственного потомка — родословная замкнётся в цикл",
    );
  }
  // Позиция связи. Правило приоритета дерева файла: если в file_genealogy
  // ребёнка есть не перекрытая концепция с тем же (нормализованным) именем,
  // связь встаёт на ЕЁ позицию и перекрывает узел файла; иначе — в конец,
  // за пределы и связей БД, и participants файла (чтобы не заслонить
  // чужой узел файла).
  const existing = await db
    .select({
      position: synthesisLineage.position,
      parentType: synthesisLineage.parentType,
      parentName: synthesisLineage.parentName,
      parentSynthesisId: synthesisLineage.parentSynthesisId,
    })
    .from(synthesisLineage)
    .where(eq(synthesisLineage.synthesisId, synthesisId));
  const [own] = await db
    .select({ fileGenealogy: syntheses.fileGenealogy })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  const fileGenealogy = own?.fileGenealogy ?? null;
  let position: number | null = null;
  if (parentName && fileGenealogy) {
    const want = normalizeConceptTitle(parentName);
    const hit = unlinkedFileParents(fileGenealogy, existing).find(
      (f) =>
        f.node.type === "concept" && normalizeConceptTitle(f.node.name) === want,
    );
    if (hit) position = hit.position;
  }
  if (position === null) {
    const maxRow = existing.reduce((m, r) => Math.max(m, r.position), -1);
    const fileLen = fileGenealogy?.participants?.length ?? 0;
    position = Math.max(maxRow, fileLen - 1) + 1;
  }
  const [row] = await db
    .insert(synthesisLineage)
    .values({
      synthesisId,
      parentType: "synthesis",
      parentSynthesisId,
      position,
    })
    .returning();
  if (!row) throw new Error("synthesis_lineage: строка связи не создана");
  return {
    id: row.id,
    synthesisId: row.synthesisId,
    parentType: row.parentType,
    parentName: row.parentName,
    parentSynthesisId: row.parentSynthesisId,
    position: row.position,
  };
}
