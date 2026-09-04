/**
 * Element Enrichment Service — точечные Claude-запросы для обогащения
 * элементов и обоснования характеристик (беседа 5.3; 01-arch §4.9,
 * 02 §2.26–2.27, 03 §2.14 / §3.1–3.2). НОВЫЙ код: в исходнике подсистемы
 * нет (идея предыдущего проекта).
 *
 * Модель исполнения (решение 2026-09-02, п.5 в 03 §3.1): HTTP-роут
 * СОЗДАЁТ операцию и отвечает { ok: true }; результат идёт клиенту через
 * WS — enrichment_delta по ходу стрима и enrichment_done в конце (с
 * аддитивными enrichmentId/content — паритет mode_done.html). WS-вход
 * start_enrichment — альтернативный запуск для клиента с открытым
 * сокетом; идемпотентность при активной операции — общим слотом
 * withGenerationSlot (второй запуск → GENERATION_IN_PROGRESS).
 *
 * Решения:
 *  - обогащение исполняется ПОД generation-слотом синтеза: гонка с
 *    saveGraphToDb/PATCH-правками (5.1) исключена той же защёлкой, что у
 *    режимов 4.1; стрим — streamWithRetries (ретраится только pre-stream);
 *    обрыв → stream_error клиенту (sectionKey "enrich:{type}:{id}"),
 *    паузы (pausedState) у обогащений НЕТ — как у режимов;
 *  - системный промпт — buildSYS(p, { outputMode: "mode" }): формат ответа
 *    задаёт сам шаблон (server/config/enrichment-templates.ts); отдельного
 *    system-ключа канон 03 §2.14 не предусматривает;
 *  - стоимость: строка element_enrichments / characteristic_justifications
 *    несёт свои токены и cost_usd; в syntheses.total_cost_usd НЕ входит
 *    (01 §4.9 «Биллинг обогащений»), bumpTotals не вызывается;
 *    генерационный лог (generation_log) не пишется — log_type enum его
 *    не предусматривает, история обогащений — своя таблица;
 *  - биллинг (07 5.3 п.2b): разъём setUsageRecorder — по умолчанию no-op;
 *    строку api_usage (billing_mode byo|subscription|balance) и инкремент
 *    used_enrichments пишет billing-service беседы 6.1 (долг §12 внесён
 *    2026-09-02). Стоимость в контексте рекордера уже посчитана;
 *  - justifyCharacteristic: значение проверяется по диапазону
 *    ХАРАКТЕРИСТИКИ (shared/constants/characteristics — п.18 правки
 *    2026-09-02), ответ Claude разбирается по трём data-section
 *    (JUSTIFICATION_SECTIONS) → justification / limitations /
 *    alternative_approaches; если секций нет — весь ответ в justification,
 *    остальные null (fail-soft: обоснование не теряется);
 *  - enrichment_type в БД для обоснования характеристики — 'characteristic'
 *    (enum 02 §2.26), но строка живёт в characteristic_justifications;
 *    enrichment_done для него несёт enrichmentType 'characteristic' и
 *    enrichmentId = id обоснования (собственного WS-финала у §3.2 нет);
 *  - доступ: элемент обязан принадлежать synthesisId (иначе NOT_FOUND) —
 *    проверка владельца синтеза и 409 — на роуте/ws-обработчике.
 */
import { and, asc, desc, eq, or } from "drizzle-orm";

import type {
  CategoryEnrichmentType,
  CharacteristicJustification,
  EdgeEnrichmentType,
  ElementEnrichment,
  EnrichmentType,
} from "@philosynth/shared/types/elements";
import type { WsServerMessage } from "@philosynth/shared/types/ws-messages";
import { ML, SL } from "@philosynth/shared/constants/labels";
import {
  resolveCharacteristic,
  validateCharacteristicValue,
  type CharacteristicElementType,
  type CharacteristicSpec,
} from "@philosynth/shared/constants/characteristics";

import { db } from "../db/index.js";
import {
  categories,
  categoryEdges,
  characteristicJustifications,
  elementEnrichments,
  syntheses,
  synthesisLineage,
} from "../db/schema.js";
import { env } from "../env.js";
import { JUSTIFICATION_SECTIONS } from "../config/enrichment-templates.js";
import { innerTextTrimmed, parseFragment } from "../utils/html-parser.js";
import { connectionManager } from "../ws/connection-manager.js";
import { clearStreamState } from "../ws/stream-state.js";

import { PRICE_IN, PRICE_OUT } from "./cost-estimator.js";
import {
  GenerationError,
  loadSynthesis,
  streamWithRetries,
  withGenerationSlot,
  type GenerationSlotHandle,
  type SynthesisRow,
} from "./generation-service.js";
import { ROLE_MAP } from "./graph-parser.js";
import { buildSYS } from "./prompt-builder.js";
import { renderTemplate } from "./prompt-registry.js";
import { StreamError, classifyStreamError } from "./streaming-manager.js";

const sendToUser = (userId: string, msg: WsServerMessage): void =>
  connectionManager.sendToUser(userId, msg);

/* ══ Типы ═════════════════════════════════════════════════════════════ */

export type EnrichableType = "category" | "edge";

export const CATEGORY_ENRICHMENT_TYPES: readonly CategoryEnrichmentType[] = [
  "description",
  "evolution",
  "justification",
];
export const EDGE_ENRICHMENT_TYPES: readonly EdgeEnrichmentType[] = [
  "justification",
  "counterarguments",
];

export function isCategoryEnrichmentType(v: unknown): v is CategoryEnrichmentType {
  return typeof v === "string" && (CATEGORY_ENRICHMENT_TYPES as readonly string[]).includes(v);
}
export function isEdgeEnrichmentType(v: unknown): v is EdgeEnrichmentType {
  return typeof v === "string" && (EDGE_ENRICHMENT_TYPES as readonly string[]).includes(v);
}

/** Ключ шаблона Registry по элементу и типу (канон 03 §2.14). */
export function enrichmentPromptKey(
  elementType: EnrichableType,
  enrichmentType: string,
): string {
  return `enrichment.${elementType}.${enrichmentType}`;
}
export const CHARACTERISTIC_PROMPT_KEY = "enrichment.characteristic_justification";

/** Ключ стрима (stream_state в Redis, sectionKey у stream_error). */
export function enrichmentStreamKey(elementType: string, elementId: string): string {
  return `enrich:${elementType}:${elementId}`;
}

export type EnrichmentErrorCode = "NOT_FOUND" | "VALIDATION_ERROR";

export class EnrichmentError extends Error {
  constructor(
    public readonly code: EnrichmentErrorCode,
    message: string,
    public readonly details?: Record<string, string> | undefined,
  ) {
    super(message);
    this.name = "EnrichmentError";
  }
}

export interface EnrichmentUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/* ══ Биллинг: разъём (07 5.3 п.2b) ════════════════════════════════════ */

export interface EnrichmentUsageContext {
  userId: string;
  synthesisId: string;
  /** Что именно обогащалось (для section_key api_usage — "enrich:…") */
  streamKey: string;
  usage: EnrichmentUsage;
}

export type UsageRecorder = (ctx: EnrichmentUsageContext) => Promise<void>;

/** По умолчанию — no-op: строку api_usage и used_enrichments пишет
 *  billing-service 6.1 через setUsageRecorder (долг §12). */
let usageRecorder: UsageRecorder = async () => {};

export function setUsageRecorder(fn: UsageRecorder | null): void {
  usageRecorder = fn ?? (async () => {});
}

async function recordUsage(ctx: EnrichmentUsageContext): Promise<void> {
  try {
    await usageRecorder(ctx);
  } catch (err) {
    // Учёт не должен ронять уже сохранённое обогащение
    console.error("enrichment usage recorder:", err);
  }
}

/* ══ DTO ══════════════════════════════════════════════════════════════ */

type EnrichmentRow = typeof elementEnrichments.$inferSelect;
type JustificationRow = typeof characteristicJustifications.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type EdgeRow = typeof categoryEdges.$inferSelect;

export function toEnrichmentDto(r: EnrichmentRow): ElementEnrichment {
  return {
    id: r.id,
    synthesisId: r.synthesisId,
    elementId: r.elementId,
    elementType: r.elementType,
    enrichmentType: r.enrichmentType as EnrichmentType,
    promptKey: r.promptKey,
    content: r.content,
    metadata: r.metadata,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: Number(r.costUsd),
    createdAt: r.createdAt.toISOString(),
  };
}

export function toJustificationDto(r: JustificationRow): CharacteristicJustification {
  return {
    id: r.id,
    synthesisId: r.synthesisId,
    elementId: r.elementId,
    elementType: r.elementType,
    characteristic: r.characteristic,
    value: r.value,
    justification: r.justification,
    alternativeApproaches: r.alternativeApproaches ?? null,
    limitations: r.limitations ?? null,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: Number(r.costUsd),
    createdAt: r.createdAt.toISOString(),
  };
}

/* ══ Загрузка элементов и контекст промпта ════════════════════════════ */

async function loadCategory(synthesisId: string, categoryId: string): Promise<CategoryRow> {
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.synthesisId, synthesisId)))
    .limit(1);
  if (!row) throw new EnrichmentError("NOT_FOUND", "Категория не найдена");
  return row;
}

async function loadEdge(synthesisId: string, edgeId: string): Promise<EdgeRow> {
  const [row] = await db
    .select()
    .from(categoryEdges)
    .where(and(eq(categoryEdges.id, edgeId), eq(categoryEdges.synthesisId, synthesisId)))
    .limit(1);
  if (!row) throw new EnrichmentError("NOT_FOUND", "Связь не найдена");
  return row;
}

/** Порядок метода/уровня: словари меток shared без индекс-подписи. */
const label = (dict: Readonly<Record<string, string>>, k: string): string =>
  dict[k] ?? k;

/** Число без хвостовых нулей (как fmtNum element-renderer 5.1). */
const fmt = (n: number): string => String(Math.round(n * 100) / 100);

/** Обратная карта ROLE_MAP: ключ роли → русская метка. */
const ROLE_LABEL: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  for (const [ru, key] of Object.entries(ROLE_MAP)) out[key] ??= ru;
  return out;
})();

const orDash = (s: string | null | undefined): string =>
  s && s.trim() ? s.trim() : "—";

/**
 * Блок «КОНТЕКСТ СИНТЕЗА» — общий для всех шаблонов: зерно, метод,
 * уровень, участники (философы + концепции-родители), заголовок.
 */
/**
 * Чистое ядро блока «КОНТЕКСТ СИНТЕЗА» (экспорт — для смоука 5.3):
 * зерно, метод, уровень, участники (философы + концепции-родители).
 */
export function buildSynthesisContextText(
  row: Pick<SynthesisRow, "title" | "seed" | "method" | "synthLevel" | "context">,
  participants: readonly string[],
): string {
  const lines = [
    `Название концепции: ${row.title}`,
    `Зерно: ${orDash(row.seed)}`,
    `Метод синтеза: ${label(ML, row.method)}; уровень: ${label(SL, row.synthLevel)}`,
    `Участники синтеза: ${
      participants.length
        ? participants.join(", ")
        : "[свободный синтез — участников нет, концепция выведена из зерна]"
    }`,
  ];
  if (row.context.trim()) lines.push(`Дополнительный контекст автора: ${row.context.trim()}`);
  return lines.join("\n");
}

/** Загрузка участников (концепции-родители из lineage) + чистое ядро. */
async function buildSynthesisContext(
  row: SynthesisRow,
  philosophers: string[],
): Promise<string> {
  const parentRows = await db
    .select({ title: syntheses.title })
    .from(synthesisLineage)
    .innerJoin(syntheses, eq(syntheses.id, synthesisLineage.parentSynthesisId))
    .where(
      and(
        eq(synthesisLineage.synthesisId, row.id),
        eq(synthesisLineage.parentType, "synthesis"),
      ),
    )
    .orderBy(asc(synthesisLineage.position));
  return buildSynthesisContextText(row, [
    ...philosophers,
    ...parentRows.map((p) => `концепция «${p.title}»`),
  ]);
}

/** Список связей категории для промпта («→ B (тип): описание»). */
async function relatedEdgesText(synthesisId: string, cat: CategoryRow): Promise<string> {
  const rows = await db
    .select({
      sourceId: categoryEdges.sourceId,
      targetId: categoryEdges.targetId,
      edgeType: categoryEdges.edgeType,
      description: categoryEdges.description,
      direction: categoryEdges.direction,
    })
    .from(categoryEdges)
    .where(
      and(
        eq(categoryEdges.synthesisId, synthesisId),
        or(eq(categoryEdges.sourceId, cat.id), eq(categoryEdges.targetId, cat.id)),
      ),
    )
    .orderBy(asc(categoryEdges.position));
  if (rows.length === 0) return "— (связей в графе нет)";
  const otherIds = [...new Set(rows.map((r) => (r.sourceId === cat.id ? r.targetId : r.sourceId)))];
  const names = new Map<string, string>();
  for (const id of otherIds) {
    const [c] = await db
      .select({ name: categories.name })
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    if (c) names.set(id, c.name);
  }
  return rows
    .map((r) => {
      const outgoing = r.sourceId === cat.id;
      const other = names.get(outgoing ? r.targetId : r.sourceId) ?? "?";
      const arrow = r.direction === "двунаправленная" ? "↔" : outgoing ? "→" : "←";
      return `- «${cat.name}» ${arrow} «${other}» (${orDash(r.edgeType)}): ${orDash(r.description)}`;
    })
    .join("\n");
}

function categoryMetricsText(c: CategoryRow): string {
  return [
    `центральность ${fmt(c.centrality)}`,
    `определённость ${fmt(c.certainty)}`,
    `историческая значимость ${fmt(c.historicalSignificance)}`,
    `инновационность ${c.innovationDegree}/5`,
    `ясность ${fmt(c.clarity)}`,
    `широта ${fmt(c.breadth)}`,
    `глубина ${fmt(c.depthScore)}`,
    `применимость ${fmt(c.applicability)}`,
  ].join(", ");
}

function edgeMetricsText(e: EdgeRow): string {
  return [
    `сила ${fmt(e.strength)}`,
    `определённость ${fmt(e.certainty)}`,
    `историческая поддержка ${fmt(e.historicalSupport)}`,
    `логическая необходимость ${fmt(e.logicalNecessity)}`,
    `инновационность ${e.innovationDegree}/5`,
    `контекстозависимость ${fmt(e.contextDependency)}`,
  ].join(", ");
}

function categoryRolesText(c: CategoryRow): string {
  const roles = [...c.structuralRoles, ...c.proceduralRoles].map(
    (r) => ROLE_LABEL[r] ?? r,
  );
  const clusters = c.clusterIndices.length
    ? `; кластеры: ${c.clusterIndices.map((i) => i + 1).join(", ")}`
    : "";
  return (roles.length ? roles.join(", ") : "—") + clusters +
    (c.hasReflexive ? "; есть рефлексивная связь" : "");
}

/** Чистое ядро переменных шаблонов категории (экспорт — смоук 5.3). */
export function buildCategoryVars(
  cat: CategoryRow,
  relatedEdges: string,
  synthesisContext: string,
): Record<string, string> {
  return {
    synthesis_context: synthesisContext,
    category_name: cat.name,
    category_type: orDash(cat.type),
    category_definition: orDash(cat.definition),
    category_origin: orDash(cat.origin),
    category_roles: categoryRolesText(cat),
    category_metrics: categoryMetricsText(cat),
    related_edges: relatedEdges,
  };
}

async function categoryVars(
  synthesisId: string,
  cat: CategoryRow,
  synthesisContext: string,
): Promise<Record<string, string>> {
  return buildCategoryVars(cat, await relatedEdgesText(synthesisId, cat), synthesisContext);
}

async function edgeEnds(edge: EdgeRow): Promise<{ source: CategoryRow | null; target: CategoryRow | null }> {
  const [source] = await db.select().from(categories).where(eq(categories.id, edge.sourceId)).limit(1);
  const [target] = await db.select().from(categories).where(eq(categories.id, edge.targetId)).limit(1);
  return { source: source ?? null, target: target ?? null };
}

/** Чистое ядро переменных шаблонов связи (экспорт — смоук 5.3). */
export function buildEdgeVars(
  edge: EdgeRow,
  source: Pick<CategoryRow, "name" | "definition"> | null,
  target: Pick<CategoryRow, "name" | "definition"> | null,
  synthesisContext: string,
): Record<string, string> {
  return {
    synthesis_context: synthesisContext,
    source_name: source?.name ?? "?",
    source_definition: orDash(source?.definition),
    target_name: target?.name ?? "?",
    target_definition: orDash(target?.definition),
    edge_type: orDash(edge.edgeType),
    edge_direction: orDash(edge.direction),
    edge_description: orDash(edge.description),
    edge_metrics: edgeMetricsText(edge),
  };
}

async function edgeVars(
  edge: EdgeRow,
  synthesisContext: string,
): Promise<Record<string, string>> {
  const { source, target } = await edgeEnds(edge);
  return buildEdgeVars(edge, source, target, synthesisContext);
}

/** Чистое ядро переменных обоснования характеристики (экспорт — смоук 5.3). */
export function buildCharacteristicVars(
  elementType: CharacteristicElementType,
  spec: CharacteristicSpec,
  value: number,
  currentValue: number,
  elementLabel: string,
  elementSummary: string,
  synthesisContext: string,
): Record<string, string> {
  return {
    synthesis_context: synthesisContext,
    element_kind: elementType === "category" ? "категория" : "связь",
    element_label: elementLabel,
    element_summary: elementSummary,
    characteristic_label: spec.labelRu,
    characteristic_key: spec.key,
    value: fmt(value),
    range: spec.integer ? `целое от ${spec.min} до ${spec.max}` : `от ${spec.min} до ${spec.max}`,
    current_value: Number.isFinite(currentValue) ? fmt(currentValue) : "—",
  };
}

/* ══ Общий стрим ══════════════════════════════════════════════════════ */

interface StreamedResult {
  content: string;
  usage: EnrichmentUsage;
}

/**
 * Промпт → SYS(mode) → стрим с enrichment_delta. Обрыв: классификация,
 * очистка stream_state, исключение вызывающему (stream_error шлёт
 * обёртка start*). Токены при max-tokens (err.usage) не сохраняются —
 * частичное обогащение не записывается (нечего показывать).
 */
async function streamEnrichment(
  handle: GenerationSlotHandle,
  streamKey: string,
  elementId: string,
  promptKey: string,
  vars: Record<string, string>,
  row: SynthesisRow,
  philosophers: string[],
): Promise<StreamedResult> {
  const apiKey = env.anthropic.apiKey; // TODO(6.1): BYO-Key пользователя
  const prompt = await renderTemplate(promptKey, vars);
  const SYS = await buildSYS({ phil: philosophers, lang: row.lang }, { outputMode: "mode" });
  const onDelta = (delta: string, totalChars: number): void => {
    sendToUser(handle.userId, {
      type: "enrichment_delta",
      synthesisId: handle.synthesisId,
      elementId,
      delta,
      totalChars,
    });
  };
  try {
    const { usage, html } = await streamWithRetries(handle, streamKey, prompt, SYS, apiKey, onDelta);
    const costUsd = usage.inputTokens * PRICE_IN + usage.outputTokens * PRICE_OUT;
    await clearStreamState(handle.synthesisId, streamKey);
    return { content: html.trim(), usage: { ...usage, costUsd } };
  } catch (rawErr) {
    await clearStreamState(handle.synthesisId, streamKey);
    throw rawErr instanceof StreamError ? rawErr : classifyStreamError(rawErr, false);
  }
}

/* ══ enrichCategory / enrichEdge ══════════════════════════════════════ */

export interface EnrichResult {
  enrichment: ElementEnrichment;
  usage: EnrichmentUsage;
}

/**
 * Обогащение категории под уже занятым слотом:
 * a. категория + контекст синтеза; b. промпт enrichment.category.{type};
 * c. стрим (enrichment_delta); d. INSERT element_enrichments;
 * e. учёт (рекордер) + enrichment_done; возврат { enrichment, usage }.
 */
export async function enrichCategory(
  handle: GenerationSlotHandle,
  categoryId: string,
  enrichmentType: CategoryEnrichmentType,
): Promise<EnrichResult> {
  if (!isCategoryEnrichmentType(enrichmentType))
    throw new EnrichmentError("VALIDATION_ERROR", "Неизвестный тип обогащения категории", {
      type: String(enrichmentType),
    });
  const { synthesisId, userId } = handle;
  const cat = await loadCategory(synthesisId, categoryId);
  const { row, philosophers } = await loadSynthesis(synthesisId);
  const synthesisContext = await buildSynthesisContext(row, philosophers);
  const vars = await categoryVars(synthesisId, cat, synthesisContext);
  const promptKey = enrichmentPromptKey("category", enrichmentType);
  const streamKey = enrichmentStreamKey("category", categoryId);

  const { content, usage } = await streamEnrichment(
    handle, streamKey, categoryId, promptKey, vars, row, philosophers,
  );
  const [saved] = await db
    .insert(elementEnrichments)
    .values({
      synthesisId,
      elementId: categoryId,
      elementType: "category",
      enrichmentType,
      promptKey,
      content,
      metadata: { elementName: cat.name, model: env.anthropic.model },
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd.toFixed(6),
    })
    .returning();
  const enrichment = toEnrichmentDto(saved as EnrichmentRow);
  await recordUsage({ userId, synthesisId, streamKey, usage });
  sendToUser(userId, {
    type: "enrichment_done",
    synthesisId,
    elementId: categoryId,
    enrichmentType,
    usage,
    enrichmentId: enrichment.id,
    content,
  });
  return { enrichment, usage };
}

/** Аналогично enrichCategory для связи (enrichment.edge.{type}). */
export async function enrichEdge(
  handle: GenerationSlotHandle,
  edgeId: string,
  enrichmentType: EdgeEnrichmentType,
): Promise<EnrichResult> {
  if (!isEdgeEnrichmentType(enrichmentType))
    throw new EnrichmentError("VALIDATION_ERROR", "Неизвестный тип обогащения связи", {
      type: String(enrichmentType),
    });
  const { synthesisId, userId } = handle;
  const edge = await loadEdge(synthesisId, edgeId);
  const { row, philosophers } = await loadSynthesis(synthesisId);
  const synthesisContext = await buildSynthesisContext(row, philosophers);
  const vars = await edgeVars(edge, synthesisContext);
  const promptKey = enrichmentPromptKey("edge", enrichmentType);
  const streamKey = enrichmentStreamKey("edge", edgeId);

  const { content, usage } = await streamEnrichment(
    handle, streamKey, edgeId, promptKey, vars, row, philosophers,
  );
  const [saved] = await db
    .insert(elementEnrichments)
    .values({
      synthesisId,
      elementId: edgeId,
      elementType: "edge",
      enrichmentType,
      promptKey,
      content,
      metadata: {
        elementName: `${vars.source_name} → ${vars.target_name}`,
        model: env.anthropic.model,
      },
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd.toFixed(6),
    })
    .returning();
  const enrichment = toEnrichmentDto(saved as EnrichmentRow);
  await recordUsage({ userId, synthesisId, streamKey, usage });
  sendToUser(userId, {
    type: "enrichment_done",
    synthesisId,
    elementId: edgeId,
    enrichmentType,
    usage,
    enrichmentId: enrichment.id,
    content,
  });
  return { enrichment, usage };
}

/* ══ justifyCharacteristic ════════════════════════════════════════════ */

export interface JustifyInput {
  elementId: string;
  elementType: CharacteristicElementType;
  characteristic: string;
  value: number;
}

export interface JustifyResult {
  justification: CharacteristicJustification;
  usage: EnrichmentUsage;
}

/** Валидация входа (без обращения к БД): тип, характеристика, диапазон. */
export function validateJustifyInput(body: unknown): JustifyInput {
  const details: Record<string, string> = {};
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const elementType = b.elementType;
  if (elementType !== "category" && elementType !== "edge")
    details.elementType = "Ожидается 'category' или 'edge'";
  if (typeof b.elementId !== "string" || !b.elementId)
    details.elementId = "Обязательное поле";
  let spec: CharacteristicSpec | null = null;
  if (typeof b.characteristic !== "string" || !b.characteristic) {
    details.characteristic = "Обязательное поле";
  } else if (!details.elementType) {
    spec = resolveCharacteristic(elementType as CharacteristicElementType, b.characteristic);
    if (!spec) details.characteristic = `У элемента типа '${String(elementType)}' нет характеристики «${b.characteristic}»`;
  }
  if (spec) {
    const err = validateCharacteristicValue(spec, b.value);
    if (err) details.value = err;
  } else if (typeof b.value !== "number") {
    details.value = "Ожидается число";
  }
  if (Object.keys(details).length > 0)
    throw new EnrichmentError("VALIDATION_ERROR", "Невалидные данные", details);
  return {
    elementId: b.elementId as string,
    elementType: elementType as CharacteristicElementType,
    characteristic: (spec as CharacteristicSpec).key,
    value: b.value as number,
  };
}

/** Разбор трёх data-section ответа; fallback — весь текст в justification. */
export function parseJustificationHtml(html: string): {
  justification: string;
  limitations: string | null;
  alternatives: string | null;
} {
  const root = parseFragment(html);
  const pick = (name: string): string | null => {
    const el = root.querySelector(`[data-section="${name}"]`);
    if (!el) return null;
    // Заголовок h4 дублирует имя секции — в колонку идёт содержимое без него
    const clone = parseFragment(el.innerHTML);
    const h4 = clone.querySelector("h4");
    if (h4) h4.textContent = "";
    const text = innerTextTrimmed(clone);
    return text || null;
  };
  const justification = pick(JUSTIFICATION_SECTIONS.justification);
  const limitations = pick(JUSTIFICATION_SECTIONS.limitations);
  const alternatives = pick(JUSTIFICATION_SECTIONS.alternatives);
  if (justification === null && limitations === null && alternatives === null) {
    return { justification: innerTextTrimmed(root) || html.trim(), limitations: null, alternatives: null };
  }
  return { justification: justification ?? "", limitations, alternatives };
}

/**
 * Обоснование характеристики под слотом: элемент + контекст → промпт
 * enrichment.characteristic_justification → стрим → разбор секций →
 * INSERT characteristic_justifications → учёт → enrichment_done
 * (enrichmentType 'characteristic', enrichmentId = id обоснования).
 * Хранится сырой HTML целиком? Нет: колонки текстовые (02 §2.27) — в них
 * плоский текст секций; полный HTML — в metadata не пишется (таблица его
 * не имеет). Клиент 5.4 рендерит три поля.
 */
export async function justifyCharacteristic(
  handle: GenerationSlotHandle,
  input: JustifyInput,
): Promise<JustifyResult> {
  const { synthesisId, userId } = handle;
  const spec = resolveCharacteristic(input.elementType, input.characteristic);
  if (!spec)
    throw new EnrichmentError("VALIDATION_ERROR", "Неизвестная характеристика", {
      characteristic: input.characteristic,
    });
  const valueErr = validateCharacteristicValue(spec, input.value);
  if (valueErr)
    throw new EnrichmentError("VALIDATION_ERROR", "Невалидные данные", { value: valueErr });

  const { row, philosophers } = await loadSynthesis(synthesisId);
  const synthesisContext = await buildSynthesisContext(row, philosophers);

  let elementLabel: string;
  let elementSummary: string;
  let currentValue: number;
  if (input.elementType === "category") {
    const cat = await loadCategory(synthesisId, input.elementId);
    elementLabel = cat.name;
    elementSummary = `${orDash(cat.type)}. ${orDash(cat.definition)} Роли: ${categoryRolesText(cat)}. Характеристики: ${categoryMetricsText(cat)}. Связи:\n${await relatedEdgesText(synthesisId, cat)}`;
    currentValue = (cat as unknown as Record<string, number>)[spec.dtoField] ?? Number.NaN;
  } else {
    const edge = await loadEdge(synthesisId, input.elementId);
    const v = await edgeVars(edge, synthesisContext);
    elementLabel = `${v.source_name} → ${v.target_name}`;
    elementSummary = `${v.edge_type}, ${v.edge_direction}. ${v.edge_description} Характеристики: ${v.edge_metrics}. Источник «${v.source_name}»: ${v.source_definition}. Цель «${v.target_name}»: ${v.target_definition}`;
    currentValue = (edge as unknown as Record<string, number>)[spec.dtoField] ?? Number.NaN;
  }

  const vars = buildCharacteristicVars(
    input.elementType, spec, input.value, currentValue, elementLabel, elementSummary, synthesisContext,
  );
  const streamKey = enrichmentStreamKey(`${input.elementType}-${spec.key}`, input.elementId);

  const { content, usage } = await streamEnrichment(
    handle, streamKey, input.elementId, CHARACTERISTIC_PROMPT_KEY, vars, row, philosophers,
  );
  const parsed = parseJustificationHtml(content);
  const [saved] = await db
    .insert(characteristicJustifications)
    .values({
      synthesisId,
      elementId: input.elementId,
      elementType: input.elementType,
      characteristic: spec.key,
      value: input.value,
      justification: parsed.justification,
      alternativeApproaches: parsed.alternatives,
      limitations: parsed.limitations,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd.toFixed(6),
    })
    .returning();
  const justification = toJustificationDto(saved as JustificationRow);
  await recordUsage({ userId, synthesisId, streamKey, usage });
  sendToUser(userId, {
    type: "enrichment_done",
    synthesisId,
    elementId: input.elementId,
    enrichmentType: "characteristic",
    usage,
    enrichmentId: justification.id,
    content,
  });
  return { justification, usage };
}

/* ══ Обёртки запуска (свой слот; ошибки стрима → stream_error) ════════ */

function reportStreamError(
  synthesisId: string,
  userId: string,
  streamKey: string,
  err: unknown,
): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`enrichment(${synthesisId}, ${streamKey}):`, err);
  sendToUser(userId, {
    type: "stream_error",
    synthesisId,
    sectionKey: streamKey,
    error: message,
    recoverable: false,
  });
}

/**
 * Запуск обогащения категории/связи в собственном слоте (POST
 * /enrich/*, WS start_enrichment). Ошибки ДО слота (GENERATION_IN_PROGRESS,
 * RATE_LIMIT, API_KEY_MISSING) пробрасываются вызывающему; ошибки внутри
 * (NOT_FOUND элемента, шаблон, стрим) → stream_error клиенту.
 */
export async function startEnrichment(
  synthesisId: string,
  userId: string,
  elementType: EnrichableType,
  elementId: string,
  enrichmentType: string,
): Promise<void> {
  await withGenerationSlot(synthesisId, userId, async (handle) => {
    const streamKey = enrichmentStreamKey(elementType, elementId);
    try {
      if (elementType === "category") {
        if (!isCategoryEnrichmentType(enrichmentType))
          throw new EnrichmentError("VALIDATION_ERROR", `Неизвестный тип обогащения категории: ${enrichmentType}`);
        await enrichCategory(handle, elementId, enrichmentType);
      } else {
        if (!isEdgeEnrichmentType(enrichmentType))
          throw new EnrichmentError("VALIDATION_ERROR", `Неизвестный тип обогащения связи: ${enrichmentType}`);
        await enrichEdge(handle, elementId, enrichmentType);
      }
    } catch (err) {
      reportStreamError(synthesisId, userId, streamKey, err);
    }
  });
}

/** Запуск обоснования характеристики в собственном слоте (POST
 *  /justify-characteristic; вход уже провалидирован роутом). */
export async function startJustification(
  synthesisId: string,
  userId: string,
  input: JustifyInput,
): Promise<void> {
  await withGenerationSlot(synthesisId, userId, async (handle) => {
    const streamKey = enrichmentStreamKey(
      `${input.elementType}-${input.characteristic}`, input.elementId,
    );
    try {
      await justifyCharacteristic(handle, input);
    } catch (err) {
      reportStreamError(synthesisId, userId, streamKey, err);
    }
  });
}

/* ══ История ══════════════════════════════════════════════════════════ */

/** История обогащений элемента (новые первыми); elementType — фильтр. */
export async function getEnrichments(
  synthesisId: string,
  elementId: string,
  elementType?: EnrichableType | undefined,
): Promise<ElementEnrichment[]> {
  const rows = await db
    .select()
    .from(elementEnrichments)
    .where(
      and(
        eq(elementEnrichments.synthesisId, synthesisId),
        eq(elementEnrichments.elementId, elementId),
        ...(elementType ? [eq(elementEnrichments.elementType, elementType)] : []),
      ),
    )
    .orderBy(desc(elementEnrichments.createdAt));
  return rows.map(toEnrichmentDto);
}

/** История обоснований характеристик элемента (новые первыми). */
export async function getJustifications(
  synthesisId: string,
  elementId: string,
  elementType?: EnrichableType | undefined,
): Promise<CharacteristicJustification[]> {
  const rows = await db
    .select()
    .from(characteristicJustifications)
    .where(
      and(
        eq(characteristicJustifications.synthesisId, synthesisId),
        eq(characteristicJustifications.elementId, elementId),
        ...(elementType ? [eq(characteristicJustifications.elementType, elementType)] : []),
      ),
    )
    .orderBy(desc(characteristicJustifications.createdAt));
  return rows.map(toJustificationDto);
}

// GenerationError реэкспортируется для роутов/ws (единый catch гейтов слота)
export { GenerationError };
