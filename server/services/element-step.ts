/**
 * Element Step (беседа 10.2; НОВОЕ) — исполнение двух шагов плана мельче
 * раздела:
 *
 *   edit_element   — применить ГОТОВЫЙ текст к полю элемента. Модель не
 *                    зовётся, квота не расходуется, стоимость 0;
 *   refine_element — точечная генерация В ЭЛЕМЕНТ: модель получает узкий
 *                    контекст (сам элемент, подраздел, где он живёт, довод
 *                    рекомендации) и возвращает новое значение ОДНОГО поля.
 *
 * Оба шага пишут значение теми же функциями, что и ручная правка 5.1
 * (updateCategory / updateThesis / updateGlossaryTerm / updateCategoryEdge):
 * версия-снимок ДО правки, UPDATE, перерисовка одной таблицы в html_content.
 * Отличие от руки человека — changeSource 'recommendation' и origin версии:
 * история отвечает не только «что изменилось», но и «почему».
 *
 * Образец refine_element — element-enrichment (5.3): обращение к модели,
 * привязанное к элементу, под уже занятым generation-слотом. Отличия:
 *  - результат пишется В ЭЛЕМЕНТ, а не рядом с ним;
 *  - дельты никому не шлются: шаг идёт внутри плана, его ход клиент видит
 *    по plan_step_started / plan_step_done (своего WS-сообщения у шага нет —
 *    чужой stream_delta клиент принял бы за генерацию раздела);
 *  - стоимость входит в итог документа (bumpTotals) и в generation_log
 *    (source 'edit') — это правка документа, как перегенерация подраздела;
 *  - негодный ответ модели (пусто, разметка, слишком длинно) в элемент НЕ
 *    пишется: проверка ДО записи, шаг падает, план встаёт на паузу.
 *
 * Модуль — лист графа импортов (его зовёт только plan-executor).
 */
import { and, eq } from "drizzle-orm";

import {
  ELEMENT_STEP_FIELDS,
  ELEMENT_STEP_FIELD_LABELS,
  ELEMENT_STEP_HOST,
  ELEMENT_STEP_KIND_LABELS,
  defaultElementStepField,
  parseElementStepTarget,
} from "@philosynth/shared/constants/edit-steps";
import { KEY_LABELS, isSectionKey } from "@philosynth/shared/constants/section-labels";

import { RECOMMENDATIONS_REFINE_TEMPLATE_KEY } from "../config/recommendation-templates.js";
import { db } from "../db/index.js";
import {
  categories,
  categoryEdges,
  generationLog,
  glossaryTerms,
  sections,
  theses,
} from "../db/schema.js";
import { parseFragment } from "../utils/html-parser.js";
import { truncateText } from "../utils/text.js";
import { PRICE_IN, PRICE_OUT } from "./cost-estimator.js";
import {
  ElementEditorError,
  updateCategory,
  updateCategoryEdge,
  updateGlossaryTerm,
  updateThesis,
  type ElementUpdateOptions,
} from "./element-editor.js";
import { TABLE_SUBSECTIONS } from "./element-renderer.js";
import {
  buildPromptSkeleton,
  bumpTotals,
  extractSubsectionContent,
  loadSynthesis,
  streamWithRetries,
  type GenerationSlotHandle,
} from "./generation-service.js";
import { buildSYS } from "./prompt-builder.js";
import { renderTemplate } from "./prompt-registry.js";
import { StreamError, classifyStreamError } from "./streaming-manager.js";
import { clearStreamState } from "../ws/stream-state.js";

import type { EditStep, ElementStepKind } from "@philosynth/shared/types/edit-plan";
import type { HtmlSyncInfo, VersionOrigin } from "@philosynth/shared/types/elements";

/* ══ Ошибки ═══════════════════════════════════════════════════════════ */

export type ElementStepErrorCode = "NOT_FOUND" | "VALIDATION_ERROR" | "MODEL_ANSWER_INVALID";

export class ElementStepError extends Error {
  constructor(
    public readonly code: ElementStepErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ElementStepError";
  }
}

/* ══ Элемент глазами шага ═════════════════════════════════════════════ */

/** Подраздел, где служба рисует таблицу элемента (запасной адрес контекста). */
const DEFAULT_SUBSECTION: Readonly<Record<ElementStepKind, string>> = {
  category: TABLE_SUBSECTIONS.categories,
  edge: TABLE_SUBSECTIONS.edges,
  thesis: TABLE_SUBSECTIONS.theses,
  glossary_term: TABLE_SUBSECTIONS.glossary,
};

export interface StepElement {
  kind: ElementStepKind;
  id: string;
  /** Как элемент назвать человеку и модели */
  name: string;
  /** Текстовые поля элемента (те, что шаг вправе править, и соседние) */
  fields: Record<string, string>;
}

/** Предельная длина значения поля (знаков): поле — не подраздел. */
export const ELEMENT_FIELD_MAX_CHARS = 4000;

/** Поле шага: названное либо поле по умолчанию; вне белого списка — отказ. */
export function resolveStepField(kind: ElementStepKind, field: string | undefined): string {
  const f = field ?? defaultElementStepField(kind);
  if (!ELEMENT_STEP_FIELDS[kind].includes(f))
    throw new ElementStepError(
      "VALIDATION_ERROR",
      `Поле «${f}» у элемента вида «${kind}» шагом не правится`,
      { field: f, allowed: [...ELEMENT_STEP_FIELDS[kind]] },
    );
  return f;
}

/** Элемент ЭТОГО синтеза; нет строки → null (шаг не создаётся / падает). */
export async function loadStepElement(
  synthesisId: string,
  kind: ElementStepKind,
  elementId: string,
): Promise<StepElement | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(elementId)) return null;
  if (kind === "category") {
    const [r] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, elementId), eq(categories.synthesisId, synthesisId)))
      .limit(1);
    return r
      ? { kind, id: r.id, name: r.name, fields: { name: r.name, type: r.type, definition: r.definition, origin: r.origin } }
      : null;
  }
  if (kind === "thesis") {
    const [r] = await db
      .select()
      .from(theses)
      .where(and(eq(theses.id, elementId), eq(theses.synthesisId, synthesisId)))
      .limit(1);
    return r
      ? {
          kind,
          id: r.id,
          name: truncateText(r.formulation, 120),
          fields: { formulation: r.formulation, justification: r.justification, thesisType: r.thesisType },
        }
      : null;
  }
  if (kind === "glossary_term") {
    const [r] = await db
      .select()
      .from(glossaryTerms)
      .where(and(eq(glossaryTerms.id, elementId), eq(glossaryTerms.synthesisId, synthesisId)))
      .limit(1);
    return r ? { kind, id: r.id, name: r.term, fields: { term: r.term, definition: r.definition } } : null;
  }
  const [r] = await db
    .select()
    .from(categoryEdges)
    .where(and(eq(categoryEdges.id, elementId), eq(categoryEdges.synthesisId, synthesisId)))
    .limit(1);
  if (!r) return null;
  const ends = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.synthesisId, synthesisId));
  const nameOf = (id: string): string => ends.find((c) => c.id === id)?.name ?? "?";
  return {
    kind,
    id: r.id,
    name: `${nameOf(r.sourceId)} → ${nameOf(r.targetId)}`,
    fields: { description: r.description, edgeType: r.edgeType, direction: r.direction },
  };
}

/* ══ Запись значения (общая для обоих шагов) ══════════════════════════ */

export interface ElementStepApplied {
  elementId: string;
  field: string;
  before: string;
  after: string;
  versionId: string;
  htmlSync: HtmlSyncInfo;
}

/** Значение поля как его пишет человек: без переносов и крайних пробелов. */
export function normalizeFieldValue(raw: string): string {
  return raw.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function originOf(
  step: EditStep,
  planId: string | null,
  stepIndex: number | null,
): VersionOrigin | null {
  const rec = step.recommendations?.[0];
  if (!rec) return null;
  return {
    kind: "recommendation",
    recommendationId: rec.id,
    round: rec.round,
    num: rec.num,
    op: rec.op,
    rationale: rec.rationale,
    planId,
    stepIndex,
    stepType: step.type === "refine_element" ? "refine_element" : "edit_element",
  };
}

async function writeField(
  synthesisId: string,
  el: StepElement,
  field: string,
  value: string,
  opts: ElementUpdateOptions,
): Promise<ElementStepApplied> {
  const v = normalizeFieldValue(value);
  if (!v)
    throw new ElementStepError(
      "VALIDATION_ERROR",
      "Пустое значение: удаление — отдельная операция, а не пустая правка",
      { field },
    );
  if (v.length > ELEMENT_FIELD_MAX_CHARS)
    throw new ElementStepError("VALIDATION_ERROR", `Значение длиннее ${ELEMENT_FIELD_MAX_CHARS} знаков`, {
      field,
      length: v.length,
    });
  const before = el.fields[field] ?? "";
  try {
    const patch = { [field]: v };
    const res =
      el.kind === "category" ? await updateCategory(synthesisId, el.id, patch, opts)
      : el.kind === "thesis" ? await updateThesis(synthesisId, el.id, patch, opts)
      : el.kind === "glossary_term" ? await updateGlossaryTerm(synthesisId, el.id, patch, opts)
      : await updateCategoryEdge(synthesisId, el.id, patch, opts);
    return {
      elementId: el.id,
      field,
      before,
      after: v,
      versionId: res.version.id,
      htmlSync: res.htmlSync,
    };
  } catch (err) {
    if (err instanceof ElementEditorError)
      throw new ElementStepError(err.code, err.message, err.details as Record<string, unknown> | undefined);
    throw err;
  }
}

function stepElementRef(step: EditStep): { kind: ElementStepKind; elementId: string } {
  const ref = parseElementStepTarget(step.target);
  if (!ref)
    throw new ElementStepError("VALIDATION_ERROR", `Цель шага «${step.target}» — не «вид:идентификатор»`);
  return ref;
}

/* ══ edit_element ═════════════════════════════════════════════════════ */

/**
 * Применить готовый текст. Без модели, без слота биллинга, без квоты.
 * Источник версии — 'recommendation', если шаг рождён рекомендацией; шаг,
 * собранный человеком в плане руками, остаётся 'manual'.
 */
export async function applyElementEdit(
  synthesisId: string,
  step: EditStep,
  planId: string | null = null,
  stepIndex: number | null = null,
): Promise<ElementStepApplied> {
  const { kind, elementId } = stepElementRef(step);
  const field = resolveStepField(kind, step.field);
  if (typeof step.value !== "string")
    throw new ElementStepError("VALIDATION_ERROR", "У шага edit_element нет значения");
  const el = await loadStepElement(synthesisId, kind, elementId);
  if (!el)
    throw new ElementStepError("NOT_FOUND", `Элемент шага не найден: ${ELEMENT_STEP_KIND_LABELS[kind]} ${elementId}`);
  const origin = originOf(step, planId, stepIndex);
  return writeField(synthesisId, el, field, step.value, {
    changeSource: origin ? "recommendation" : "manual",
    origin,
  });
}

/* ══ refine_element ═══════════════════════════════════════════════════ */

const SUBSECTION_CONTEXT_MAX = 9000;

/** Переменные шаблона recommendations.refine_element — чистое ядро (дрейф-контроль). */
export function buildRefineVars(input: {
  element: StepElement;
  field: string;
  subsectionName: string;
  subsectionContent: string;
  note: string;
}): Record<string, string> {
  const { element: el, field } = input;
  const card = Object.entries(el.fields)
    .filter(([k, v]) => k !== field && v.trim())
    .map(([k, v]) => `— ${ELEMENT_STEP_FIELD_LABELS[k] ?? k}: ${truncateText(v, 600)}`);
  return {
    element_kind: ELEMENT_STEP_KIND_LABELS[el.kind],
    element_name: el.name,
    field_label: ELEMENT_STEP_FIELD_LABELS[field] ?? field,
    current_value: el.fields[field] ?? "",
    element_card: card.length ? card.join("\n") : "— (нет)",
    subsection_name: input.subsectionName,
    subsection_content: input.subsectionContent || "(подраздел в документе не найден)",
    note: input.note || "(довод не указан)",
  };
}

/**
 * Значение поля из ответа модели. Контракт шаблона — голый текст одним
 * абзацем; модель ошибается, поэтому: снять ограду ```…```, разметку, ярлык
 * «Новое определение:», кавычки ВОКРУГ ВСЕГО ответа. null — ответ пуст.
 */
export function cleanModelFieldValue(answer: string): string | null {
  let s = answer.replace(/^\s*```[a-z]*\s*/i, "").replace(/\s*```\s*$/i, "");
  if (/<[a-z][^>]*>/i.test(s)) s = parseFragment(s).textContent ?? "";
  s = normalizeFieldValue(s);
  s = s.replace(/^(?:нов(?:ое|ая|ый)\s+[а-яё ]{3,40}|значение поля|ответ)\s*[:—-]\s*/i, "");
  const pairs: [string, string][] = [["«", "»"], ['"', '"'], ["“", "”"], ["„", "“"]];
  for (const [l, r] of pairs) {
    if (s.startsWith(l) && s.endsWith(r) && s.length > 2) {
      const inner = s.slice(1, -1);
      // снимаем только ОБРАМЛЯЮЩУЮ пару: внутри таких же кавычек быть не должно
      if (!inner.includes(l) && !inner.includes(r)) s = inner.trim();
      break;
    }
  }
  return s ? s : null;
}

export const REFINE_STREAM_KEY_PREFIX = "refine";

export interface ElementRefineResult extends ElementStepApplied {
  usage: { inputTokens: number; outputTokens: number };
  outputChars: number;
}

/**
 * Точечная генерация в элемент под УЖЕ ЗАНЯТЫМ слотом плана (квоту
 * regenerations план взял при взятии слота — countBillableSteps).
 */
export async function refineElement(
  handle: GenerationSlotHandle,
  step: EditStep,
  planId: string | null = null,
  stepIndex: number | null = null,
): Promise<ElementRefineResult> {
  const { synthesisId } = handle;
  const { kind, elementId } = stepElementRef(step);
  const field = resolveStepField(kind, step.field);
  const el = await loadStepElement(synthesisId, kind, elementId);
  if (!el)
    throw new ElementStepError("NOT_FOUND", `Элемент шага не найден: ${ELEMENT_STEP_KIND_LABELS[kind]} ${elementId}`);

  // Подраздел: названный рекомендацией («sectionKey:имя»), иначе — таблица вида
  const host = ELEMENT_STEP_HOST[kind];
  let secKey = host;
  let subName = DEFAULT_SUBSECTION[kind];
  if (step.subsection) {
    const i = step.subsection.indexOf(":");
    if (i > 0) {
      secKey = step.subsection.slice(0, i);
      subName = step.subsection.slice(i + 1);
    }
  }
  const [sec] = await db
    .select({ html: sections.htmlContent })
    .from(sections)
    .where(and(eq(sections.synthesisId, synthesisId), eq(sections.key, secKey)))
    .limit(1);
  const subText = sec ? (extractSubsectionContent(parseFragment(sec.html), subName) ?? "") : "";

  const { row, philosophers } = await loadSynthesis(synthesisId);
  const prompt = await renderTemplate(
    RECOMMENDATIONS_REFINE_TEMPLATE_KEY,
    buildRefineVars({
      element: el,
      field,
      subsectionName: subName,
      subsectionContent: truncateText(subText, SUBSECTION_CONTEXT_MAX),
      note: step.context ?? "",
    }),
  );
  const SYS = await buildSYS({ phil: philosophers, lang: row.lang }, { outputMode: "mode" });
  const streamKey = `${REFINE_STREAM_KEY_PREFIX}:${kind}:${elementId}`;
  const hostLabel = isSectionKey(host) ? KEY_LABELS[host] : host;
  const rec = step.recommendations?.[0];

  const [genEntry] = await db
    .insert(generationLog)
    .values({
      synthesisId,
      sectionKey: host,
      sectionLabel:
        `${hostLabel} → ${ELEMENT_STEP_KIND_LABELS[kind]} «${truncateText(el.name, 80)}», ` +
        `${ELEMENT_STEP_FIELD_LABELS[field] ?? field}` +
        (rec ? ` [по рекомендации ${rec.num}, раунд ${rec.round}]` : " [точечная правка]"),
      logType: "generation",
      source: "edit",
      status: "streaming",
      priorChars: 0,
      taskChars: prompt.length,
      inputChars: SYS.length + prompt.length,
      metadata: {
        elementStep: { kind, elementId, field },
        ...(rec ? { recommendation: { id: rec.id, num: rec.num, round: rec.round } } : {}),
        promptSkeleton: buildPromptSkeleton(prompt),
        sys: SYS,
      },
    })
    .returning({ id: generationLog.id });
  const genEntryId = (genEntry as { id: string }).id;

  let answer: string;
  let usage: { inputTokens: number; outputTokens: number };
  try {
    const streamed = await streamWithRetries(
      handle,
      streamKey,
      prompt,
      SYS,
      handle.billing.apiKey,
      () => undefined, // дельты никому не шлются — см. шапку
    );
    answer = streamed.html;
    usage = streamed.usage;
  } catch (rawErr) {
    const e = rawErr instanceof StreamError ? rawErr : classifyStreamError(rawErr, false);
    const eUsage = e.usage ?? { inputTokens: 0, outputTokens: 0 };
    await db
      .update(generationLog)
      .set({
        status: "error",
        errorMessage: e.message,
        inputTokens: eUsage.inputTokens,
        outputTokens: eUsage.outputTokens,
        costUsd: (eUsage.inputTokens * PRICE_IN + eUsage.outputTokens * PRICE_OUT).toFixed(6),
      })
      .where(eq(generationLog.id, genEntryId));
    await bumpTotals(synthesisId, eUsage);
    await clearStreamState(synthesisId, streamKey);
    throw e;
  }
  const costUsd = usage.inputTokens * PRICE_IN + usage.outputTokens * PRICE_OUT;
  const value = cleanModelFieldValue(answer);
  const bad =
    value === null ? "модель вернула пустой ответ"
    : value.length > ELEMENT_FIELD_MAX_CHARS ? `ответ модели длиннее ${ELEMENT_FIELD_MAX_CHARS} знаков`
    : null;
  await db
    .update(generationLog)
    .set({
      status: bad ? "error" : "done",
      ...(bad ? { errorMessage: bad } : {}),
      outputChars: answer.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: costUsd.toFixed(6),
    })
    .where(eq(generationLog.id, genEntryId));
  await bumpTotals(synthesisId, usage);
  await clearStreamState(synthesisId, streamKey);
  if (bad || value === null)
    // Негодный ответ в элемент НЕ пишется; токены потрачены и учтены
    throw new ElementStepError("MODEL_ANSWER_INVALID", `Точечная правка не удалась: ${bad}. Элемент не изменён.`);

  const origin = originOf(step, planId, stepIndex);
  const applied = await writeField(synthesisId, el, field, value, {
    changeSource: origin ? "recommendation" : "manual",
    origin,
  });
  return { ...applied, usage, outputChars: answer.length };
}
