/**
 * Representation Transformer — прямая конверсия представлений концепции
 * graph ↔ theses (беседа 5.5; 01-arch §4.11, 02 §2.28, 03 §2.15 и
 * §3.1–3.2). НОВЫЙ код: в исходнике подсистемы нет (идея предыдущего
 * проекта).
 *
 * Отличие от каскадной перегенерации (01 §4.11): раздел-источник —
 * ЕДИНСТВЕННЫЙ вход промпта; зерно, secCtx и межсекционный контекст
 * (buildContextForSection) не участвуют, промпт — специальный
 * (server/config/transform-templates.ts).
 *
 * Модель исполнения — как у обогащений 5.3 и режимов 4.1 (решение п.5
 * 03 §3.1): HTTP-роут СОЗДАЁТ операцию и отвечает { ok: true }; операция
 * идёт ПОД generation-слотом синтеза (withGenerationSlot — второй запуск
 * → GENERATION_IN_PROGRESS); дельты — stream_delta с sectionKey
 * "transform:{direction}" (образец "mode:{modeKey}"), старт —
 * transform_started, финал — transform_done, обрыв — stream_error с тем же
 * sectionKey (паузы/pausedState у трансформаций НЕТ — паритет режимов).
 *
 * Решения (кандидаты в «По факту 5.5»):
 *  - ФОРМА РЕЗУЛЬТАТА: шаблон Registry задаёт режим трансформации, а
 *    форму результата даёт готовое задание раздела из buildSectionDefs
 *    (1.2) — те же подразделы и столбцы, что у генерации → штатные
 *    парсеры 1.4 (parseThesesFromHTML / parseGraphFromHTML), ответ —
 *    целый <div class="doc-section"> (buildSYS outputMode 'full');
 *  - ОТСТУПЛЕНИЕ от буквы п.4 запроса («перерисовать раздел через
 *    element-renderer»): перерисовка одной таблицы оставила бы прежние
 *    обоснования тезисов / комментарии к кластерам при новых строках —
 *    тот самый рассинхрон, о котором 02 §3. Поэтому раздел-хозяин, если
 *    он есть в sections, ЗАМЕЩАЕТСЯ целиком сгенерированной секцией
 *    (паритет regenerateSection — трансформация и есть замена всего
 *    представления), а затем таблицы дополнительно перерисовываются
 *    element-renderer'ом из строк БД — тождество БД↔HTML после
 *    нормализаций парсера. Раздела нет в документе → только гранулярные
 *    таблицы, в summary sectionMissing=1 (паритет htmlSync 5.1);
 *  - СНИМКИ (02 §2.28 после правки 2026-09-02): source_snapshot —
 *    представление-ИСТОЧНИК на момент трансформации (аудит),
 *    target_snapshot — представление-ЦЕЛЬ до замены, из него откат.
 *    Оба несут строки БД целиком (с id — откат восстанавливает прежние
 *    id, и полиморфные ссылки element_versions / element_enrichments на
 *    них снова живы) и html_content раздела-хозяина (откат возвращает и
 *    прозу). ПРОТИВОРЕЧИЕ ДОКОВ: 03 §2.15 rollback пишет «восстанавливает
 *    source_snapshot», текст запроса 5.5 — тоже; 02 §2.28 (более позднее
 *    явное решение) — откат из target_snapshot. Принят 02: source — то,
 *    что было ВХОДОМ, восстанавливать его бессмысленно;
 *  - ОТКАТ пишется новой строкой representation_transforms с тем же
 *    direction и resultSummary.rollback = 1 (для аудита, как велит
 *    запрос) — с той же семантикой снимков: source_snapshot — ВХОД
 *    отката (снимок, из которого восстановили), target_snapshot —
 *    состояние цели ДО отката (то, что заменили). Откат строки-отката
 *    поэтому возвращает состояние до неё — «откат отката»;
 *  - НОРМАЛИЗАЦИЯ типов на каталог при theses→graph — через
 *    saveGraphToDb (5.5 закрывает долг §12 там же; graph-parser);
 *  - СТОИМОСТЬ: строка representation_transforms несёт токены и cost; в
 *    отличие от обогащений (01 §4.9) трансформация замещает раздел
 *    документа → входит в syntheses.total_cost_usd (bumpTotals) и пишет
 *    generation_log source 'edit' (log_type enum иного не даёт) с меткой
 *    «[трансформация …]» — лог промптов/контекста её видит;
 *  - ПУСТОЙ ИСТОЧНИК → TransformError VALIDATION_ERROR («No theses to
 *    transform» / «No graph to transform») — роут проверяет синхронно
 *    (edge case протокола → 400).
 */
import { and, asc, desc, eq } from "drizzle-orm";

import type { RepresentationTransform, TransformDirection } from "@philosynth/shared/types/elements";
import type { WsServerMessage } from "@philosynth/shared/types/ws-messages";
import { ML, SL } from "@philosynth/shared/constants/labels";
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";

import { db } from "../db/index.js";
import {
  categories,
  categoryEdges,
  clusterLabels,
  generationLog,
  representationTransforms,
  sections,
  syntheses,
  synthesisLineage,
  theses,
} from "../db/schema.js";
import { env } from "../env.js";
import { transformPromptKey } from "../config/transform-templates.js";
import { connectionManager } from "../ws/connection-manager.js";
import { clearStreamState } from "../ws/stream-state.js";

import { PRICE_IN, PRICE_OUT } from "./cost-estimator.js";
import {
  applyElementUpdateToHtml,
  writeSectionHtml,
  type RenderableTable,
} from "./element-renderer.js";
import { parseThesesFromHTML, saveElementsToDb } from "./element-parser.js";
import {
  GenerationError,
  buildEditInfra,
  buildPromptSkeleton,
  bumpTotals,
  loadSynthesis,
  streamWithRetries,
  withGenerationSlot,
  type GenerationSlotHandle,
  type SynthesisRow,
} from "./generation-service.js";
import { ROLE_MAP, parseGraphFromHTML, saveGraphToDb } from "./graph-parser.js";
import { buildSYS } from "./prompt-builder.js";
import { renderTemplate } from "./prompt-registry.js";
import { StreamError, classifyStreamError } from "./streaming-manager.js";

const sendToUser = (userId: string, msg: WsServerMessage): void =>
  connectionManager.sendToUser(userId, msg);

/* ══ Типы ═════════════════════════════════════════════════════════════ */

export const TRANSFORM_DIRECTIONS: readonly TransformDirection[] = [
  "graph_to_theses",
  "theses_to_graph",
];

export function isTransformDirection(v: unknown): v is TransformDirection {
  return typeof v === "string" && (TRANSFORM_DIRECTIONS as readonly string[]).includes(v);
}

/** Ключ стрима (stream_state в Redis, sectionKey у stream_delta/stream_error). */
export function transformStreamKey(direction: TransformDirection): string {
  return `transform:${direction}`;
}

/** Раздел-цель трансформации (что замещается). */
export const TRANSFORM_TARGET_SECTION: Readonly<Record<TransformDirection, "theses" | "graph">> = {
  graph_to_theses: "theses",
  theses_to_graph: "graph",
};
/** Раздел-источник трансформации. */
export const TRANSFORM_SOURCE_SECTION: Readonly<Record<TransformDirection, "theses" | "graph">> = {
  graph_to_theses: "graph",
  theses_to_graph: "theses",
};

export type TransformErrorCode = "NOT_FOUND" | "VALIDATION_ERROR";

export class TransformError extends Error {
  constructor(
    public readonly code: TransformErrorCode,
    message: string,
    public readonly details?: Record<string, string> | undefined,
  ) {
    super(message);
    this.name = "TransformError";
  }
}

export interface TransformUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface TransformResult {
  transform: RepresentationTransform;
  summary: Record<string, number>;
  usage: TransformUsage;
}

/* ══ DTO и снимки ═════════════════════════════════════════════════════ */

type TransformRow = typeof representationTransforms.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;
type EdgeRow = typeof categoryEdges.$inferSelect;
type ClusterRow = typeof clusterLabels.$inferSelect;
type ThesisRow = typeof theses.$inferSelect;

/** Снимок графа (строки БД целиком + HTML раздела-хозяина). */
export interface GraphSnapshot {
  kind: "graph";
  categories: CategoryRow[];
  edges: EdgeRow[];
  clusters: ClusterRow[];
  /** html_content раздела graph на момент снимка; null — раздела нет */
  sectionHtml: string | null;
}

/** Снимок тезисов. */
export interface ThesesSnapshot {
  kind: "theses";
  theses: ThesisRow[];
  sectionHtml: string | null;
}

export type RepresentationSnapshot = GraphSnapshot | ThesesSnapshot;

export function toTransformDto(r: TransformRow): RepresentationTransform {
  return {
    id: r.id,
    synthesisId: r.synthesisId,
    direction: r.direction,
    sourceSnapshot: r.sourceSnapshot,
    targetSnapshot: r.targetSnapshot,
    resultSummary: r.resultSummary,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: Number(r.costUsd),
    createdAt: r.createdAt.toISOString(),
  };
}

async function loadSectionHtml(synthesisId: string, key: string): Promise<{ id: string; html: string } | null> {
  const [sec] = await db
    .select({ id: sections.id, html: sections.htmlContent })
    .from(sections)
    .where(and(eq(sections.synthesisId, synthesisId), eq(sections.key, key)))
    .limit(1);
  return sec ?? null;
}

async function loadGraphRows(synthesisId: string): Promise<{
  categories: CategoryRow[];
  edges: EdgeRow[];
  clusters: ClusterRow[];
}> {
  const [cats, edges, clusters] = await Promise.all([
    db.select().from(categories).where(eq(categories.synthesisId, synthesisId)).orderBy(asc(categories.position)),
    db.select().from(categoryEdges).where(eq(categoryEdges.synthesisId, synthesisId)).orderBy(asc(categoryEdges.position)),
    db.select().from(clusterLabels).where(eq(clusterLabels.synthesisId, synthesisId)).orderBy(asc(clusterLabels.clusterIndex)),
  ]);
  return { categories: cats, edges, clusters };
}

async function loadThesesRows(synthesisId: string): Promise<ThesisRow[]> {
  return db.select().from(theses).where(eq(theses.synthesisId, synthesisId)).orderBy(asc(theses.thesisNum));
}

/** Снимок графа: строки + HTML раздела. */
export async function snapshotGraph(synthesisId: string): Promise<GraphSnapshot> {
  const rows = await loadGraphRows(synthesisId);
  const sec = await loadSectionHtml(synthesisId, "graph");
  return { kind: "graph", ...rows, sectionHtml: sec?.html ?? null };
}

/** Снимок тезисов: строки + HTML раздела. */
export async function snapshotTheses(synthesisId: string): Promise<ThesesSnapshot> {
  const rows = await loadThesesRows(synthesisId);
  const sec = await loadSectionHtml(synthesisId, "theses");
  return { kind: "theses", theses: rows, sectionHtml: sec?.html ?? null };
}

/** Есть ли что трансформировать (для синхронного 400 роута). */
export async function hasSourceRepresentation(
  synthesisId: string,
  direction: TransformDirection,
): Promise<boolean> {
  if (direction === "graph_to_theses") {
    const [r] = await db.select({ id: categories.id }).from(categories).where(eq(categories.synthesisId, synthesisId)).limit(1);
    return Boolean(r);
  }
  const [r] = await db.select({ id: theses.id }).from(theses).where(eq(theses.synthesisId, synthesisId)).limit(1);
  return Boolean(r);
}

export function emptySourceMessage(direction: TransformDirection): string {
  return direction === "graph_to_theses" ? "No graph to transform" : "No theses to transform";
}

/* ══ Текстовые блоки источника для промпта ════════════════════════════ */

const fmt = (n: number): string => String(Math.round(n * 100) / 100);
const orDash = (s: string | null | undefined): string => (s && s.trim() ? s.trim() : "—");
const label = (dict: Readonly<Record<string, string>>, k: string): string => dict[k] ?? k;

/** Обратная карта ROLE_MAP: ключ роли → русская метка (как в 5.3). */
const ROLE_LABEL: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  for (const [ru, key] of Object.entries(ROLE_MAP)) out[key] ??= ru;
  return out;
})();

/** Чистое ядро блока «ГРАФ КАТЕГОРИЙ» (экспорт — для смоука 5.5). */
export function buildGraphBlock(
  cats: readonly Pick<CategoryRow, "id" | "name" | "type" | "definition" | "centrality" | "certainty" | "origin" | "clusterIndices" | "structuralRoles" | "proceduralRoles" | "hasReflexive">[],
  edges: readonly Pick<EdgeRow, "sourceId" | "targetId" | "description" | "edgeType" | "direction" | "strength">[],
  clusters: readonly Pick<ClusterRow, "clusterIndex" | "label">[],
): string {
  const nameOf = new Map(cats.map((c) => [c.id, c.name]));
  const clusterLabel = new Map(clusters.map((c) => [c.clusterIndex, c.label]));
  const lines: string[] = [];
  lines.push(`КАТЕГОРИИ (${cats.length}):`);
  cats.forEach((c, i) => {
    const roles = [...c.structuralRoles, ...c.proceduralRoles].map((r) => ROLE_LABEL[r] ?? r);
    const cl = c.clusterIndices.map((idx) => clusterLabel.get(idx) ?? `кластер ${idx + 1}`);
    lines.push(
      `${i + 1}. «${c.name}» — тип: ${orDash(c.type)}; определение: ${orDash(c.definition)}; ` +
        `центральность ${fmt(c.centrality)}, определённость ${fmt(c.certainty)}` +
        (c.origin.trim() ? `; происхождение: ${c.origin.trim()}` : "") +
        (roles.length ? `; роли: ${roles.join(", ")}` : "") +
        (cl.length ? `; кластеры: ${cl.join(" / ")}` : "") +
        (c.hasReflexive ? "; рефлексивная связь" : ""),
    );
  });
  lines.push("");
  lines.push(`СВЯЗИ (${edges.length}):`);
  edges.forEach((e, i) => {
    const arrow = e.direction === "двунаправленная" ? "↔" : e.direction === "рефлексивная" ? "↺" : "→";
    lines.push(
      `${i + 1}. «${nameOf.get(e.sourceId) ?? "?"}» ${arrow} «${nameOf.get(e.targetId) ?? "?"}» — ` +
        `${orDash(e.edgeType)}, сила ${fmt(e.strength)}: ${orDash(e.description)}`,
    );
  });
  if (clusters.length) {
    lines.push("");
    lines.push(`КЛАСТЕРЫ (${clusters.length}):`);
    for (const c of clusters) {
      const members = cats.filter((k) => k.clusterIndices.includes(c.clusterIndex)).map((k) => `«${k.name}»`);
      lines.push(`${c.clusterIndex + 1}. ${c.label}: ${members.join(", ") || "—"}`);
    }
  }
  return lines.join("\n");
}

const THESIS_TYPE_RU: Readonly<Record<string, string>> = {
  ontological: "онтологический",
  epistemological: "эпистемологический",
  ethical: "этический",
};

/** Чистое ядро блока «КОРПУС ТЕЗИСОВ» (экспорт — для смоука 5.5). */
export function buildThesesBlock(
  rows: readonly Pick<ThesisRow, "thesisNum" | "formulation" | "justification" | "thesisType" | "noveltyDegree" | "relatedCategories">[],
): string {
  const lines: string[] = [`ТЕЗИСЫ (${rows.length}):`];
  for (const t of rows) {
    lines.push(
      `${t.thesisNum}. [${THESIS_TYPE_RU[t.thesisType] ?? t.thesisType}] ${t.formulation}` +
        (t.justification.trim() ? `\n   Обоснование: ${t.justification.trim()}` : "") +
        (t.noveltyDegree.trim() ? `\n   Степень новизны: ${t.noveltyDegree.trim()}` : "") +
        (t.relatedCategories.length ? `\n   Связанные категории: ${t.relatedCategories.join(", ")}` : ""),
    );
  }
  return lines.join("\n");
}

/** Контекст синтеза (ориентация, не источник): как в 5.3, экспорт для смоука. */
export function buildTransformContextText(
  row: Pick<SynthesisRow, "title" | "method" | "synthLevel">,
  participants: readonly string[],
): string {
  return [
    `Название концепции: ${row.title}`,
    `Метод синтеза: ${label(ML, row.method)}; уровень: ${label(SL, row.synthLevel)}`,
    `Участники синтеза: ${participants.length ? participants.join(", ") : "[свободный синтез — участников нет]"}`,
  ].join("\n");
}

async function loadParentTitles(synthesisId: string): Promise<string[]> {
  const rows = await db
    .select({ title: syntheses.title })
    .from(synthesisLineage)
    .innerJoin(syntheses, eq(syntheses.id, synthesisLineage.parentSynthesisId))
    .where(and(eq(synthesisLineage.synthesisId, synthesisId), eq(synthesisLineage.parentType, "synthesis")))
    .orderBy(asc(synthesisLineage.position));
  return rows.map((p) => `концепция «${p.title}»`);
}

/* ══ Задание раздела из buildSectionDefs ══════════════════════════════ */

/**
 * Задание раздела-цели: def из buildEditInfra (тот же p, что у правок).
 * Если раздела нет в section_order (например, тезисы никогда не
 * генерировались), ключ добавляется в p.sec для сборки def — номер тогда
 * условный (раздела в документе всё равно нет).
 */
async function buildTargetSectionTask(
  synthesisId: string,
  targetKey: "theses" | "graph",
): Promise<{ task: string; title: string; num: number; hasSection: boolean; row: SynthesisRow; philosophers: string[]; p: Awaited<ReturnType<typeof buildEditInfra>>["p"] }> {
  const { row, philosophers, secCtx } = await loadSynthesis(synthesisId);
  const order: string[] = row.sectionOrder ?? [];
  const rowForInfra: SynthesisRow = order.includes(targetKey)
    ? row
    : { ...row, sectionOrder: [...order, targetKey] };
  const infra = await buildEditInfra(rowForInfra, philosophers, secCtx);
  const def = infra.defs.find((d) => d.key === targetKey);
  if (!def) throw new TransformError("VALIDATION_ERROR", `Раздел «${targetKey}» не найден в определениях`);
  const [secRow] = await db
    .select({ sectionNum: sections.sectionNum })
    .from(sections)
    .where(and(eq(sections.synthesisId, synthesisId), eq(sections.key, targetKey)))
    .limit(1);
  const num = secRow?.sectionNum ?? def.num;
  const task = `§ ${num} — ${def.title.toUpperCase()}\n${def.prompt}`;
  return { task, title: def.title, num, hasSection: Boolean(secRow), row, philosophers, p: infra.p };
}

/* ══ Общий стрим ══════════════════════════════════════════════════════ */

interface StreamedResult {
  html: string;
  usage: TransformUsage;
}

/**
 * Промпт → SYS(full) → generation_log 'edit' → стрим stream_delta
 * ("transform:{direction}"). Обрыв: genEntry error (usage max-tokens
 * учитывается, как у режимов), очистка stream_state, исключение
 * вызывающему (stream_error шлёт обёртка startTransform).
 */
async function streamTransform(
  handle: GenerationSlotHandle,
  direction: TransformDirection,
  prompt: string,
  SYS: string,
  targetKey: string,
  targetTitle: string,
): Promise<StreamedResult> {
  const { synthesisId, userId } = handle;
  const apiKey = env.anthropic.apiKey; // TODO(6.1): BYO-Key пользователя
  const streamKey = transformStreamKey(direction);
  const [genEntry] = await db
    .insert(generationLog)
    .values({
      synthesisId,
      sectionKey: targetKey,
      sectionLabel: `${targetTitle} [трансформация ${direction === "graph_to_theses" ? "граф → тезисы" : "тезисы → граф"}]`,
      logType: "generation",
      source: "edit",
      status: "streaming",
      priorChars: 0,
      taskChars: prompt.length,
      inputChars: SYS.length + prompt.length,
      metadata: {
        transformDirection: direction,
        expectedSubsections: [],
        subsections: [],
        promptSkeleton: buildPromptSkeleton(prompt),
        sys: SYS,
      },
    })
    .returning({ id: generationLog.id });
  const genEntryId = (genEntry as { id: string }).id;

  const onDelta = (delta: string, totalChars: number): void => {
    sendToUser(userId, { type: "stream_delta", synthesisId, sectionKey: streamKey, delta, totalChars });
  };
  try {
    const { usage, html } = await streamWithRetries(handle, streamKey, prompt, SYS, apiKey, onDelta);
    const costUsd = usage.inputTokens * PRICE_IN + usage.outputTokens * PRICE_OUT;
    await db
      .update(generationLog)
      .set({
        status: "done",
        outputChars: html.length,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: costUsd.toFixed(6),
      })
      .where(eq(generationLog.id, genEntryId));
    await bumpTotals(synthesisId, usage);
    await clearStreamState(synthesisId, streamKey);
    return { html: html.trim(), usage: { ...usage, costUsd } };
  } catch (rawErr) {
    const e = rawErr instanceof StreamError ? rawErr : classifyStreamError(rawErr, false);
    const eUsage = e.usage ?? { inputTokens: 0, outputTokens: 0 };
    const eCost = eUsage.inputTokens * PRICE_IN + eUsage.outputTokens * PRICE_OUT;
    await db
      .update(generationLog)
      .set({
        status: "error",
        errorMessage: e.message,
        inputTokens: eUsage.inputTokens,
        outputTokens: eUsage.outputTokens,
        costUsd: eCost.toFixed(6),
      })
      .where(eq(generationLog.id, genEntryId));
    await bumpTotals(synthesisId, eUsage);
    await clearStreamState(synthesisId, streamKey);
    throw e;
  }
}

/* ══ Замена HTML раздела ══════════════════════════════════════════════ */

/**
 * Заместить html_content раздела-хозяина сгенерированной секцией и
 * перерисовать таблицы из строк БД (см. шапку модуля). Возвращает 1, если
 * раздела нет (sectionMissing), иначе 0.
 */
async function replaceTargetSectionHtml(
  synthesisId: string,
  targetKey: "theses" | "graph",
  html: string,
): Promise<number> {
  const sec = await loadSectionHtml(synthesisId, targetKey);
  if (!sec) return 1;
  await writeSectionHtml(sec.id, html);
  const tables: RenderableTable[] = targetKey === "theses" ? ["theses"] : ["categories", "edges", "topology"];
  for (const t of tables) {
    try {
      await applyElementUpdateToHtml(synthesisId, t);
    } catch (err) {
      console.warn(`transform: перерисовка таблицы ${t} пропущена:`, err);
    }
  }
  return 0;
}

/* ══ transformGraphToTheses ═══════════════════════════════════════════ */

async function insertTransformRow(
  synthesisId: string,
  direction: TransformDirection,
  sourceSnapshot: RepresentationSnapshot,
  targetSnapshot: RepresentationSnapshot,
  summary: Record<string, number>,
  usage: TransformUsage,
): Promise<RepresentationTransform> {
  const [saved] = await db
    .insert(representationTransforms)
    .values({
      synthesisId,
      direction,
      sourceSnapshot: sourceSnapshot as unknown as Record<string, unknown>,
      targetSnapshot: targetSnapshot as unknown as Record<string, unknown>,
      resultSummary: summary,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd.toFixed(6),
    })
    .returning();
  return toTransformDto(saved as TransformRow);
}

/**
 * graph → theses под уже занятым слотом (07 5.5 п.1):
 * a. граф из БД (categories + edges + cluster_labels); b. промпт
 * transform.graph_to_theses + задание раздела theses; c. снимок тезисов
 * (цель, → target_snapshot); d. снимок графа (источник, → source_snapshot);
 * e. стрим; f. parseThesesFromHTML; g. замена тезисов (saveElementsToDb);
 * h. строка representation_transforms; i. { summary, usage }.
 */
export async function transformGraphToTheses(handle: GenerationSlotHandle): Promise<TransformResult> {
  const { synthesisId, userId } = handle;
  const direction: TransformDirection = "graph_to_theses";
  const source = await snapshotGraph(synthesisId);
  if (source.categories.length === 0)
    throw new TransformError("VALIDATION_ERROR", emptySourceMessage(direction));
  const target = await snapshotTheses(synthesisId);

  const { task, title, row, philosophers, p } = await buildTargetSectionTask(synthesisId, "theses");
  const ctx = buildTransformContextText(row, [...philosophers, ...(await loadParentTitles(synthesisId))]);
  const prompt = await renderTemplate(transformPromptKey(direction), {
    synthesis_context: ctx,
    graph_block: buildGraphBlock(source.categories, source.edges, source.clusters),
    section_task: task,
  });
  const SYS = await buildSYS(p, { outputMode: "full" });

  sendToUser(userId, { type: "transform_started", synthesisId, direction });
  const { html, usage } = await streamTransform(handle, direction, prompt, SYS, "theses", title);

  const parsed = parseThesesFromHTML(html);
  if (parsed.length === 0)
    throw new TransformError("VALIDATION_ERROR", "В ответе не найдена «Сводная таблица тезисов» — тезисы не заменены");
  await saveElementsToDb(synthesisId, "theses", { theses: parsed });
  const sectionMissing = await replaceTargetSectionHtml(synthesisId, "theses", html);

  const summary: Record<string, number> = {
    thesesCreated: parsed.length,
    thesesRemoved: target.theses.length,
    sectionMissing,
  };
  const transform = await insertTransformRow(synthesisId, direction, source, target, summary, usage);
  sendToUser(userId, { type: "transform_done", synthesisId, direction, summary, usage });
  return { transform, summary, usage };
}

/**
 * theses → graph под слотом (07 5.5 п.1): a. тезисы из БД; b. промпт
 * transform.theses_to_graph + задание раздела graph; c. снимок графа
 * (цель) и тезисов (источник); d. стрим → parseGraphFromHTML →
 * saveGraphToDb; e. нормализация типов на каталог (в saveGraphToDb);
 * f. строка representation_transforms; g. { summary, usage }.
 */
export async function transformThesesToGraph(handle: GenerationSlotHandle): Promise<TransformResult> {
  const { synthesisId, userId } = handle;
  const direction: TransformDirection = "theses_to_graph";
  const source = await snapshotTheses(synthesisId);
  if (source.theses.length === 0)
    throw new TransformError("VALIDATION_ERROR", emptySourceMessage(direction));
  const target = await snapshotGraph(synthesisId);

  const { task, title, row, philosophers, p } = await buildTargetSectionTask(synthesisId, "graph");
  const ctx = buildTransformContextText(row, [...philosophers, ...(await loadParentTitles(synthesisId))]);
  const prompt = await renderTemplate(transformPromptKey(direction), {
    synthesis_context: ctx,
    theses_block: buildThesesBlock(source.theses),
    section_task: task,
  });
  const SYS = await buildSYS(p, { outputMode: "full" });

  sendToUser(userId, { type: "transform_started", synthesisId, direction });
  const { html, usage } = await streamTransform(handle, direction, prompt, SYS, "graph", title);

  const parsed = parseGraphFromHTML(html);
  if (parsed.nodes.length === 0)
    throw new TransformError("VALIDATION_ERROR", "В ответе не найдена «Таблица категорий» — граф не заменён");
  const saved = await saveGraphToDb(synthesisId, parsed);
  for (const w of saved.warnings) console.warn("transform theses→graph:", w);
  const sectionMissing = await replaceTargetSectionHtml(synthesisId, "graph", html);

  const summary: Record<string, number> = {
    categoriesCreated: saved.categoriesInserted,
    categoriesRemoved: target.categories.length,
    edgesCreated: saved.edgesInserted,
    edgesRemoved: target.edges.length,
    clustersCreated: saved.clustersInserted,
    categoriesNormalized: saved.categoriesNormalized,
    edgesNormalized: saved.edgesNormalized,
    sectionMissing,
  };
  const transform = await insertTransformRow(synthesisId, direction, source, target, summary, usage);
  sendToUser(userId, { type: "transform_done", synthesisId, direction, summary, usage });
  return { transform, summary, usage };
}

/* ══ Обёртка запуска (свой слот; ошибки → stream_error) ═══════════════ */

/**
 * Запуск трансформации в собственном слоте (POST /transform/*, WS
 * start_transform). Ошибки ДО слота (GENERATION_IN_PROGRESS, RATE_LIMIT,
 * API_KEY_MISSING) — вызывающему; ошибки внутри (пустой источник, шаблон,
 * стрим, парсинг) — stream_error клиенту с sectionKey "transform:…".
 */
export async function startTransform(
  synthesisId: string,
  userId: string,
  direction: TransformDirection,
): Promise<void> {
  await withGenerationSlot(synthesisId, userId, async (handle) => {
    try {
      if (direction === "graph_to_theses") await transformGraphToTheses(handle);
      else await transformThesesToGraph(handle);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`transform(${synthesisId}, ${direction}):`, err);
      sendToUser(userId, {
        type: "stream_error",
        synthesisId,
        sectionKey: transformStreamKey(direction),
        error: message,
        recoverable: false,
      });
    }
  });
}

/* ══ История ══════════════════════════════════════════════════════════ */

/** История трансформаций синтеза (новые первыми). */
export async function getTransformHistory(synthesisId: string): Promise<RepresentationTransform[]> {
  const rows = await db
    .select()
    .from(representationTransforms)
    .where(eq(representationTransforms.synthesisId, synthesisId))
    .orderBy(desc(representationTransforms.createdAt));
  return rows.map(toTransformDto);
}

/* ══ Откат ════════════════════════════════════════════════════════════ */

const asDate = (v: unknown): Date => (v instanceof Date ? v : new Date(String(v)));

/** Восстановить граф из снимка (прежние id; транзакция). */
async function restoreGraph(synthesisId: string, snap: GraphSnapshot): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(categoryEdges).where(eq(categoryEdges.synthesisId, synthesisId));
    await tx.delete(categories).where(eq(categories.synthesisId, synthesisId));
    await tx.delete(clusterLabels).where(eq(clusterLabels.synthesisId, synthesisId));
    if (snap.categories.length) {
      await tx.insert(categories).values(
        snap.categories.map((c) => ({
          ...c,
          synthesisId,
          typeCatalogId: c.typeCatalogId ?? null,
          createdAt: asDate(c.createdAt),
          updatedAt: new Date(),
        })),
      );
    }
    if (snap.edges.length) {
      await tx.insert(categoryEdges).values(
        snap.edges.map((e) => ({
          ...e,
          synthesisId,
          typeCatalogId: e.typeCatalogId ?? null,
          createdAt: asDate(e.createdAt),
        })),
      );
    }
    if (snap.clusters.length) {
      await tx.insert(clusterLabels).values(snap.clusters.map((c) => ({ ...c, synthesisId })));
    }
  });
}

/** Восстановить тезисы из снимка (прежние id; транзакция). */
async function restoreTheses(synthesisId: string, snap: ThesesSnapshot): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(theses).where(eq(theses.synthesisId, synthesisId));
    if (snap.theses.length) {
      await tx.insert(theses).values(
        snap.theses.map((t) => ({
          ...t,
          synthesisId,
          createdAt: asDate(t.createdAt),
          updatedAt: new Date(),
        })),
      );
    }
  });
}

function isGraphSnapshot(v: unknown): v is GraphSnapshot {
  return typeof v === "object" && v !== null && (v as { kind?: unknown }).kind === "graph";
}
function isThesesSnapshot(v: unknown): v is ThesesSnapshot {
  return typeof v === "object" && v !== null && (v as { kind?: unknown }).kind === "theses";
}

/**
 * rollbackTransform(synthesisId, transformId): восстанавливает
 * представление-ЦЕЛЬ из target_snapshot (02 §2.28): graph_to_theses →
 * тезисы, theses_to_graph → граф; html_content раздела — из снимка (если
 * в снимке был и раздел есть сейчас). Откат пишется новой строкой
 * representation_transforms (тот же direction, resultSummary.rollback=1,
 * source_snapshot — восстановленный снимок (вход отката), target_snapshot
 * — состояние цели ДО отката; токены 0). Гейт активной генерации — на
 * роуте.
 */
export async function rollbackTransform(
  synthesisId: string,
  transformId: string,
): Promise<{ transform: RepresentationTransform; summary: Record<string, number> }> {
  const [row] = await db
    .select()
    .from(representationTransforms)
    .where(and(eq(representationTransforms.id, transformId), eq(representationTransforms.synthesisId, synthesisId)))
    .limit(1);
  if (!row) throw new TransformError("NOT_FOUND", "Трансформация не найдена");

  const targetKey = TRANSFORM_TARGET_SECTION[row.direction];
  const snap = row.targetSnapshot as unknown;
  let before: RepresentationSnapshot;
  let summary: Record<string, number>;

  if (targetKey === "theses") {
    if (!isThesesSnapshot(snap)) throw new TransformError("VALIDATION_ERROR", "Снимок тезисов повреждён — откат невозможен");
    before = await snapshotTheses(synthesisId);
    await restoreTheses(synthesisId, snap);
    summary = { rollback: 1, thesesCreated: snap.theses.length, thesesRemoved: before.theses.length };
  } else {
    if (!isGraphSnapshot(snap)) throw new TransformError("VALIDATION_ERROR", "Снимок графа повреждён — откат невозможен");
    before = await snapshotGraph(synthesisId);
    await restoreGraph(synthesisId, snap);
    summary = {
      rollback: 1,
      categoriesCreated: snap.categories.length,
      categoriesRemoved: before.categories.length,
      edgesCreated: snap.edges.length,
      edgesRemoved: before.edges.length,
    };
  }

  const sec = await loadSectionHtml(synthesisId, targetKey);
  if (!sec) {
    summary.sectionMissing = 1;
  } else if (snap.sectionHtml) {
    await writeSectionHtml(sec.id, snap.sectionHtml);
  } else {
    // В снимке HTML не было (раздел появился позже) — таблицы из строк БД
    const tables: RenderableTable[] = targetKey === "theses" ? ["theses"] : ["categories", "edges", "topology"];
    for (const t of tables) await applyElementUpdateToHtml(synthesisId, t);
  }

  const restored: RepresentationSnapshot = targetKey === "theses"
    ? await snapshotTheses(synthesisId)
    : await snapshotGraph(synthesisId);
  const transform = await insertTransformRow(
    synthesisId, row.direction, restored, before, summary,
    { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  );
  return { transform, summary };
}

/** Подпись раздела-цели для сообщений (KEY_LABELS). */
export function targetSectionLabel(direction: TransformDirection): string {
  const key = TRANSFORM_TARGET_SECTION[direction];
  return KEY_LABELS[key as keyof typeof KEY_LABELS] ?? key;
}

// GenerationError реэкспортируется для роутов/ws (единый catch гейтов слота)
export { GenerationError };
