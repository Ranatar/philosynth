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
 *    LINEAGE_CYCLE / идемпотентный отказ на существующую пару;
 *  - 15.1 (Д-68/Д-69/Д-70): родословная после импорта. fileNodeAt — узел
 *    верхнего уровня дерева файла по позиции и его состояние (свободен /
 *    перекрыт / не концепция); fileNodeCandidates — совпадения по имени и
 *    поиск по названию среди своих (GET …/lineage/file-node/:position/
 *    candidates); linkParent принимает явную позицию узла файла
 *    (безымянные и одноимённые узлы по имени не адресуются) и переводит
 *    нарушение уникального индекса uq_lineage_parent_pair (миграция 0014)
 *    в LINEAGE_EXISTS; unlinkParent снимает связь ТОЛЬКО поверх узла-концепции
 *    файла (DELETE …/lineage/link/:parentSynthesisId; иначе
 *    LINEAGE_GENERATED — текст разделов написан по этому родителю);
 *    isMetaSynthesisRows — ОДНО правило «мета-синтез» для бейджа каталога
 *    (loadConceptParentFlags) и страницы (parentSyntheses/fileConceptParents):
 *    живая связь-концепция либо неперекрытый узел-концепция файла; строка
 *    с удалённым родителем (SET NULL) не считается — её не видят ни древо,
 *    ни контекст генерации, ни выгрузка.
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

import { and, desc, eq, ilike, inArray, ne } from "drizzle-orm";

import { db, sql } from "../db/index.js";
import { syntheses, synthesisLineage } from "../db/schema.js";
import type {
  FileGenealogyNode,
  FileNodeCandidates,
  FileNodeState,
  LineageCandidateMatch,
  LineageNode,
  LineageRecord,
  LineageUnlinkResult,
  ParticipantInput,
} from "@philosynth/shared/types/lineage";
import { tl } from "@philosynth/shared/i18n/t";

const MAX_LINEAGE_DEPTH = 10;

/* ══ 14.2 (Д-57): безымянные узлы дерева файла ════════════════════════ */

/** Русские заглушки записей до 14.2 — и вид для экспорт-зеркал (11.4). */
export const UNNAMED_CONCEPT_RU = "[безымянная концепция]";
export const UNNAMED_PHILOSOPHER_RU = "[безымянный философ]";

/** Узел файла без имени: признак 14.2, пустое имя либо старая русская заглушка. */
export function isUnnamedFileNode(node: Pick<FileGenealogyNode, "name" | "unnamed">): boolean {
  if (node.unnamed) return true;
  const t = (node.name ?? "").trim();
  return !t || t === UNNAMED_CONCEPT_RU || t === UNNAMED_PHILOSOPHER_RU;
}

/** Подстановка имени на языке запроса (вне запроса — по-русски). */
export function unnamedLabel(type: "concept" | "philosopher" | "synthesis"): string {
  return type === "philosopher"
    ? tl("server.lineageService.unnamedPhilosopher", "[безымянный философ]")
    : tl("server.lineageService.unnamedConcept", "[безымянная концепция]");
}

/** Имя узла файла для ответа: своё либо подстановка на языке запроса. */
export function fileNodeName(node: FileGenealogyNode): string {
  return isUnnamedFileNode(node) ? unnamedLabel(node.type) : node.name;
}

/** Имя узла файла для экспорт-зеркала: своё либо русская заглушка. */
export function fileNodeNameRu(node: FileGenealogyNode): string {
  return isUnnamedFileNode(node)
    ? node.type === "philosopher" ? UNNAMED_PHILOSOPHER_RU : UNNAMED_CONCEPT_RU
    : node.name;
}

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
 * (сервис 4.3 пишет у участников type='synthesis'). Узел без имени НЕ
 * выбрасывается — иначе съедут индексы participants корня, а индекс =
 * position связи в БД; 14.2 (Д-57): он пишется с пустым имением и признаком
 * unnamed (до 14.2 — русской заглушкой; старая заглушка на входе тоже
 * считается пустым именем), подстановку делает читатель (fileNodeName).
 */
export function sanitizeFileGenealogy(
  node: unknown,
  level = 0,
): FileGenealogyNode | null {
  if (!node || typeof node !== "object") return null;
  const n = node as Record<string, unknown>;
  const isPhil = n.type === "philosopher";
  const rawName = strField(n.name)?.trim() ?? "";
  const unnamed = isUnnamedFileNode({ name: rawName });
  const named = (type: FileGenealogyNode["type"]): FileGenealogyNode =>
    unnamed ? { type, name: "", unnamed: true } : { type, name: rawName };
  if (isPhil) return named("philosopher");
  const out = named("concept");
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
export interface LineagePosRow {
  position: number;
  parentType: "philosopher" | "synthesis";
  parentName: string | null;
  parentSynthesisId: string | null;
}

/** Действует ли строка: философ с именем или концепция с живым родителем. */
export function rowIsLive(r: LineagePosRow): boolean {
  return r.parentType === "philosopher"
    ? !!r.parentName
    : !!r.parentSynthesisId;
}

/**
 * 15.1 (Д-68/Д-69): узел ВЕРХНЕГО уровня дерева файла по позиции и его
 * состояние по правилу приоритета: 'missing' — дерева нет либо позиция вне
 * participants; 'covered' — на позиции действует связь БД (узел перекрыт);
 * 'not_concept' — узел философа; 'free' — неперекрытая концепция (её можно
 * связать; её же проступание и есть результат отвязки).
 */
export function fileNodeAt(
  fileGenealogy: FileGenealogyNode | null | undefined,
  rows: readonly LineagePosRow[],
  position: number,
): { state: FileNodeState; node: FileGenealogyNode | null } {
  const parts = fileGenealogy?.participants ?? [];
  if (!Number.isInteger(position) || position < 0 || position >= parts.length)
    return { state: "missing", node: null };
  const node = parts[position] as FileGenealogyNode;
  if (rows.some((r) => r.position === position && rowIsLive(r)))
    return { state: "covered", node };
  if (node.type !== "concept") return { state: "not_concept", node };
  return { state: "free", node };
}

/**
 * 15.1 (Д-70): ОДНО правило «мета-синтез» — живая связь-концепция в БД либо
 * неперекрытый узел-концепция дерева файла. Им живут бейдж каталога
 * (loadConceptParentFlags) и страница синтеза (parentSyntheses непусты либо
 * fileConceptParents непусты — те же два источника). Строка с удалённым
 * родителем (SET NULL) мета-синтезом не делает: древо (getAncestors),
 * контекст генерации (loadConceptParticipants), реконструкция промптов и
 * выгрузка её не видят — считать её только в каталоге значило бы расходиться
 * с ними (решение 15.1, «По факту»).
 */
export function isMetaSynthesisRows(
  rows: readonly LineagePosRow[],
  fileGenealogy: FileGenealogyNode | null | undefined,
): boolean {
  if (rows.some((r) => r.parentType === "synthesis" && rowIsLive(r))) return true;
  return unlinkedFileParents(fileGenealogy, rows).some(
    (f) => f.node.type === "concept",
  );
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
  const unnamed = isUnnamedFileNode(node);
  if (node.type === "philosopher") {
    return {
      type: "philosopher",
      name: fileNodeName(node),
      ...(unnamed ? { unnamed: true } : {}),
      depth: nodeDepth,
      children: [],
      fromFile: true,
    };
  }
  const out: LineageNode = {
    type: "synthesis",
    name: fileNodeName(node),
    ...(unnamed ? { unnamed: true } : {}),
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
  // 14.2 (Д-57): безымянный узел в выгрузке — русская заглушка (зеркало 11.4),
  // импорт распознаёт её как пустое имя
  const conv = (n: LineageNode): FileGenealogyNode => {
    if (n.type === "philosopher") return { type: "philosopher", name: n.unnamed ? UNNAMED_PHILOSOPHER_RU : n.name };
    const out: FileGenealogyNode = { type: "concept", name: n.unnamed ? UNNAMED_CONCEPT_RU : n.name };
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
    // Слоты по позиции: связь БД либо (правило приоритета) узел файла.
    // 15.1: каждый узел несёт position; связь-концепция, перекрывающая
    // узел-концепцию файла, — coversFileNode (её можно отвязать, Д-69)
    const slots: { position: number; node: LineageNode }[] = [];
    const dbRows = byChild.get(id) ?? [];
    const fileParts = files.get(id)?.participants ?? [];
    for (const r of dbRows) {
      if (r.parent_type === "philosopher") {
        if (!r.parent_name) continue;
        slots.push({
          position: r.position,
          node: {
            type: "philosopher",
            name: r.parent_name,
            depth: nodeDepth,
            position: r.position,
            children: [],
          },
        });
      } else {
        const pid = r.parent_synthesis_id;
        if (!pid || path.has(pid)) continue; // страховка от цикла в данных
        const covers = fileParts[r.position]?.type === "concept";
        slots.push({
          position: r.position,
          node: {
            type: "synthesis",
            name: titles.get(pid) ?? unnamedLabel("synthesis"),
            synthesisId: pid,
            depth: nodeDepth,
            position: r.position,
            ...(covers ? { coversFileNode: true as const } : {}),
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
        node: { ...fileNodeToLineage(f.node, nodeDepth, depth), position: f.position },
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
    name: titles.get(synthesisId) ?? unnamedLabel("synthesis"),
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
        name: titles.get(childId) ?? unnamedLabel("synthesis"),
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
  | "LINEAGE_EXISTS"
  | "LINEAGE_NODE_UNAVAILABLE" // 15.1 (Д-68): узел файла перекрыт / не концепция / нет такой позиции
  | "LINEAGE_NOT_LINKED" // 15.1 (Д-69): такой связи нет (роут → 404 NOT_FOUND)
  | "LINEAGE_GENERATED"; // 15.1 (Д-69): родитель без узла файла — по нему сгенерирован документ

/** Отказ связывания; статус/код HTTP назначает роут (03 §4.3). */
export class LineageLinkError extends Error {
  constructor(
    readonly code: LineageLinkErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LineageLinkError";
  }
}

/** pg-код ошибки: DrizzleQueryError прячет его в cause (09 §3, 0.2). */
function pgCodeOf(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  const c = e?.cause?.code ?? e?.code;
  return typeof c === "string" ? c : undefined;
}

/**
 * Привязка концепции-родителя к существующему синтезу (беседа 8.5, п.3):
 * строка synthesis_lineage parent_type='synthesis', position — в конец
 * существующих родителей. Заслоны здесь — только структурные (self /
 * пара уже есть / цикл через потомков); владение обоими синтезами
 * проверяет роут (403 FORBIDDEN), как и прочий доступ в этом сервисе.
 * Существующая пара → LINEAGE_EXISTS (идемпотентный отказ, строка не
 * дублируется). 15.1 (Д-70): отказ держит и уникальный индекс
 * uq_lineage_parent_pair (миграция 0014) — два одновременных вызова не
 * пишут дубль, второй получает тот же LINEAGE_EXISTS из 23505. 15.1
 * (Д-68): `position` — явная позиция узла файла из Д-68 (кандидаты узла);
 * узел на ней обязан быть свободной концепцией (LINEAGE_NODE_UNAVAILABLE),
 * имя при этом не сверяется — безымянный и одноимённые узлы по имени не
 * адресуются. 15.1 (Д-80): без position и без узла файла с таким именем —
 * LINEAGE_NODE_UNAVAILABLE (reason: missing): связь человека всегда стоит
 * на узле-концепции файла, строки «за пределы» дерева больше не пишутся —
 * каждая строка без узла файла есть родитель генерации.
 */
export async function linkParent(
  synthesisId: string,
  parentSynthesisId: string,
  parentName?: string,
  options: { position?: number | undefined } = {},
): Promise<LineageRecord> {
  if (synthesisId === parentSynthesisId) {
    throw new LineageLinkError(
      "LINEAGE_SELF",
      tl("server.lineageService.selfParent", "Концепция не может быть собственным родителем"),
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
      tl("server.lineageService.alreadyParent", "Эта концепция уже указана родителем"),
    );
  }
  if (await isDescendantOf(synthesisId, parentSynthesisId)) {
    throw new LineageLinkError(
      "LINEAGE_CYCLE",
      tl("server.lineageService.descendantAsParent", "Нельзя назначить родителем собственного потомка — родословная замкнётся в цикл"),
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
  // Гонка двух одинаковых привязок: вторая читает строки уже после вставки
  // первой — та же пара уже есть → тот же идемпотентный LINEAGE_EXISTS, а не
  // «узел перекрыт» (перекрыт он этим самым родителем)
  const alreadyLinked = () =>
    existing.some((r) => r.parentType === "synthesis" && r.parentSynthesisId === parentSynthesisId);
  if (options.position !== undefined) {
    // 15.1 (Д-68): явная позиция узла файла — узел обязан быть свободной концепцией
    const at = fileNodeAt(fileGenealogy, existing, options.position);
    if (at.state !== "free") {
      if (alreadyLinked()) {
        throw new LineageLinkError(
          "LINEAGE_EXISTS",
          tl("server.lineageService.alreadyParent", "Эта концепция уже указана родителем"),
        );
      }
      throw new LineageLinkError(
        "LINEAGE_NODE_UNAVAILABLE",
        fileNodeUnavailableMessage(at.state),
        { position: options.position, reason: at.state },
      );
    }
    position = options.position;
  }
  if (position === null && parentName && fileGenealogy) {
    const want = normalizeConceptTitle(parentName);
    const hit = unlinkedFileParents(fileGenealogy, existing).find(
      (f) =>
        f.node.type === "concept" && normalizeConceptTitle(f.node.name) === want,
    );
    if (hit) position = hit.position;
  }
  if (position === null && alreadyLinked()) {
    throw new LineageLinkError(
      "LINEAGE_EXISTS",
      tl("server.lineageService.alreadyParent", "Эта концепция уже указана родителем"),
    );
  }
  if (position === null) {
    // 15.1 (Д-80): связь по выбору человека ВСЕГДА стоит на узле-концепции
    // дерева файла — иначе строка не отвязывалась бы (Д-69: без узла файла —
    // LINEAGE_GENERATED), а по ней ничего не генерировалось. До 15.1 связь без
    // совпадения уходила «за пределы» (position = max(maxRow, fileLen-1)+1,
    // правило 2026-09-21); теперь это отказ — у ImportPage и древа есть
    // position, по имени без узла связывать нечего.
    throw new LineageLinkError(
      "LINEAGE_NODE_UNAVAILABLE",
      fileNodeUnavailableMessage("missing"),
      { reason: "missing" },
    );
  }
  let row: typeof synthesisLineage.$inferSelect | undefined;
  try {
    [row] = await db
      .insert(synthesisLineage)
      .values({
        synthesisId,
        parentType: "synthesis",
        parentSynthesisId,
        position,
      })
      .returning();
  } catch (err) {
    // 15.1 (Д-70): гонка двух одновременных привязок — уникальный индекс
    // uq_lineage_parent_pair; второй получает тот же идемпотентный отказ
    if (pgCodeOf(err) === "23505") {
      throw new LineageLinkError(
        "LINEAGE_EXISTS",
        tl("server.lineageService.alreadyParent", "Эта концепция уже указана родителем"),
      );
    }
    throw err;
  }
  if (!row) throw new Error(tl("server.lineageService.lineageRowNotCreated", "synthesis_lineage: строка связи не создана"));
  return {
    id: row.id,
    synthesisId: row.synthesisId,
    parentType: row.parentType,
    parentName: row.parentName,
    parentSynthesisId: row.parentSynthesisId,
    position: row.position,
  };
}

/** Текст отказа по состоянию узла файла (15.1, Д-68). */
function fileNodeUnavailableMessage(state: FileNodeState): string {
  switch (state) {
    case "covered":
      return tl("server.lineageService.nodeCovered", "Этот узел дерева файла уже перекрыт связью в базе");
    case "not_concept":
      return tl("server.lineageService.nodeNotConcept", "Этот узел дерева файла — философ, а не концепция: связывать нечего");
    default:
      return tl("server.lineageService.nodeMissing", "Узла дерева файла с такой позицией нет");
  }
}

/* ══ 15.1 (Д-68): кандидаты для узла дерева файла ══════════════════════ */

/** Экранирование % и _ для ILIKE-поиска по подстроке. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => "\\" + ch);
}

/** Предел списка совпадений по подстроке названия. */
export const FILE_NODE_SEARCH_LIMIT = 20;

/**
 * Синтезы владельца, чьё название содержит подстроку (ILIKE), кроме самого
 * ребёнка; новые первыми, не больше FILE_NODE_SEARCH_LIMIT. Пустой запрос →
 * пустой список (поиск — по слову человека, не «все мои концепции»).
 */
export async function searchOwnerSynthesesByTitle(
  userId: string,
  query: string,
  excludeId: string,
): Promise<LineageCandidateMatch[]> {
  const q = query.trim();
  if (!q) return [];
  const rows = await db
    .select({
      id: syntheses.id,
      title: syntheses.title,
      createdAt: syntheses.createdAt,
    })
    .from(syntheses)
    .where(
      and(
        eq(syntheses.userId, userId),
        ne(syntheses.id, excludeId),
        ilike(syntheses.title, `%${escapeLike(q)}%`),
      ),
    )
    .orderBy(desc(syntheses.createdAt))
    .limit(FILE_NODE_SEARCH_LIMIT);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Кандидаты для узла верхнего уровня дерева файла (GET …/lineage/file-node/
 * :position/candidates): узел по позиции обязан быть свободной концепцией
 * (иначе LineageLinkError LINEAGE_NODE_UNAVAILABLE с details.reason —
 * 'covered' | 'not_concept' | 'missing'); matches — совпадения по имени
 * среди синтезов владельца (8.5, по имени узла; у безымянного — пусто),
 * search — по подстроке названия, когда query непуст. Владение ребёнком
 * проверяет роут.
 */
export async function fileNodeCandidates(
  synthesisId: string,
  userId: string,
  position: number,
  query = "",
): Promise<FileNodeCandidates> {
  const [own] = await db
    .select({ fileGenealogy: syntheses.fileGenealogy })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  const rows = await db
    .select({
      position: synthesisLineage.position,
      parentType: synthesisLineage.parentType,
      parentName: synthesisLineage.parentName,
      parentSynthesisId: synthesisLineage.parentSynthesisId,
    })
    .from(synthesisLineage)
    .where(eq(synthesisLineage.synthesisId, synthesisId));
  const at = fileNodeAt(own?.fileGenealogy ?? null, rows, position);
  if (at.state !== "free" || !at.node) {
    throw new LineageLinkError(
      "LINEAGE_NODE_UNAVAILABLE",
      fileNodeUnavailableMessage(at.state),
      { position, reason: at.state },
    );
  }
  const unnamed = isUnnamedFileNode(at.node);
  const matches = unnamed
    ? []
    : await findSameOwnerSynthesesByTitle(userId, at.node.name, synthesisId);
  const search = await searchOwnerSynthesesByTitle(userId, query, synthesisId);
  return {
    node: {
      position,
      name: fileNodeName(at.node),
      ...(unnamed ? { unnamed: true as const } : {}),
    },
    matches,
    search,
    query: query.trim(),
  };
}

/* ══ 15.1 (Д-69): DELETE /syntheses/:id/lineage/link/:parentSynthesisId ══ */

/**
 * Отвязка концепции-родителя — обратная операция привязки (решение
 * пользователя 2026-10-14, «как надёжнее»): снимается строка
 * parent_type='synthesis' с этим родителем, и ТОЛЬКО если на её позиции в
 * file_genealogy стоит узел-концепция — тогда узел снова проступает
 * снимком (unlinkedFileParents), сведения о родителе не теряются. Строка
 * без узла файла — родитель, по которому документ сгенерирован (участник
 * POST /syntheses) либо привязанный за пределы дерева файла, — не
 * снимается: LINEAGE_GENERATED (текст разделов написан по этому родителю,
 * реконструкция промптов и бейдж «мета» солгали бы). Дерево потомков не
 * трогается — у ребёнка свои потомки остаются, у родителя из «Потомков»
 * уходит одна ветка. Нет такой связи → LINEAGE_NOT_LINKED. Владение
 * ребёнком и гейт активной операции — у роута.
 */
export async function unlinkParent(
  synthesisId: string,
  parentSynthesisId: string,
): Promise<LineageUnlinkResult> {
  const rows = await db
    .select()
    .from(synthesisLineage)
    .where(eq(synthesisLineage.synthesisId, synthesisId));
  const link = rows.find(
    (r) => r.parentType === "synthesis" && r.parentSynthesisId === parentSynthesisId,
  );
  if (!link) {
    throw new LineageLinkError(
      "LINEAGE_NOT_LINKED",
      tl("server.lineageService.notLinked", "Эта концепция не указана родителем"),
    );
  }
  const [own] = await db
    .select({ fileGenealogy: syntheses.fileGenealogy })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  const fileNode = own?.fileGenealogy?.participants?.[link.position] ?? null;
  if (!fileNode || fileNode.type !== "concept") {
    throw new LineageLinkError(
      "LINEAGE_GENERATED",
      tl("server.lineageService.generatedParent", "По этому родителю сгенерирован текст документа — его нельзя отвязать"),
      { position: link.position },
    );
  }
  await db.delete(synthesisLineage).where(eq(synthesisLineage.id, link.id));
  return {
    ok: true,
    record: {
      id: link.id,
      synthesisId: link.synthesisId,
      parentType: link.parentType,
      parentName: link.parentName,
      parentSynthesisId: link.parentSynthesisId,
      position: link.position,
    },
    revealed: {
      position: link.position,
      name: fileNodeName(fileNode),
      ...(isUnnamedFileNode(fileNode) ? { unnamed: true as const } : {}),
    },
  };
}
