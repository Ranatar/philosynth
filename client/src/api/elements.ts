/**
 * API-функции гранулярных элементов. Беседа 1.7 (запрос 1, п. 10) +
 * расширение беседы 5.2 (запрос 1, п. 8).
 *
 * Контракт: 03-specification §2.4 (+ «По факту 5.1») и
 * server/routes/elements.ts:
 *  - getCategories → GET /syntheses/:id/categories →
 *      { categories, edges, clusters, topology } (GraphData);
 *  - getTheses / getGlossary → GET /theses → { theses }, GET /glossary →
 *      { terms } (чтение: владелец ИЛИ публичный);
 *  - updateCategory / updateEdge / updateThesis / updateGlossaryTerm →
 *      PATCH …; ответ несёт элемент, impact, АДДИТИВНО version и htmlSync
 *      (какие таблицы перерисованы, какие поля до документа не дошли);
 *  - deleteEdge → DELETE /edges/:edgeId → { ok, impact, version, htmlSync };
 *  - getVersionHistory → GET /elements/:type/:elementId/versions →
 *      { versions } (version DESC);
 *  - rollbackToVersion → POST …/rollback { version } →
 *      { element, version, impact, htmlSync };
 *  - autoRename → POST /elements/auto-rename { oldName, newName } →
 *      { affectedSections, affectedTheses };
 *  - updateCapsule → PATCH /capsule { html } → { capsuleHtml, version }.
 *
 * Гейты правок (сервер 5.1): не-владелец → 403 FORBIDDEN, активная
 * генерация → 409 GENERATION_IN_PROGRESS, невалидные поля → 400
 * VALIDATION_ERROR с details по полям. ApiError пробрасывается как есть —
 * формы редактора разбирают details сами.
 */

import type {
  Category,
  CategoryEdge,
  GraphData,
} from "@philosynth/shared/types/graph";
import type {
  AutoRenameInput,
  AutoRenameResult,
  CategoryUpdateInput,
  EdgeUpdateInput,
  ElementVersion,
  GlossaryTerm,
  GlossaryTermUpdateInput,
  HtmlSyncInfo,
  ImpactAnalysis,
  Thesis,
  ThesisUpdateInput,
  VersionedElementType,
} from "@philosynth/shared/types/elements";

import { apiDelete, apiGet, apiPatch, apiPost } from "./client";

const base = (synthesisId: string): string =>
  `/syntheses/${encodeURIComponent(synthesisId)}`;

/* ── Чтение ──────────────────────────────────────────────────────────── */

export function getCategories(synthesisId: string): Promise<GraphData> {
  return apiGet<GraphData>(`${base(synthesisId)}/categories`);
}

export function getCategory(
  synthesisId: string,
  categoryId: string,
): Promise<Category> {
  return apiGet<{ category: Category }>(
    `${base(synthesisId)}/categories/${encodeURIComponent(categoryId)}`,
  ).then((r) => r.category);
}

export function getTheses(synthesisId: string): Promise<Thesis[]> {
  return apiGet<{ theses: Thesis[] }>(`${base(synthesisId)}/theses`).then(
    (r) => r.theses,
  );
}

export function getGlossary(synthesisId: string): Promise<GlossaryTerm[]> {
  return apiGet<{ terms: GlossaryTerm[] }>(`${base(synthesisId)}/glossary`).then(
    (r) => r.terms,
  );
}

/* ── Правки (ответы 5.1: element + impact + version + htmlSync) ─────── */

/** Общая часть ответов PATCH/DELETE/rollback («По факту 5.1» п.6) */
export interface ElementMutationMeta {
  impact: ImpactAnalysis;
  version: ElementVersion;
  htmlSync: HtmlSyncInfo;
}

export interface UpdateCategoryResponse extends ElementMutationMeta {
  category: Category;
}
export interface UpdateEdgeResponse extends ElementMutationMeta {
  edge: CategoryEdge;
}
export interface UpdateThesisResponse extends ElementMutationMeta {
  thesis: Thesis;
}
export interface UpdateGlossaryTermResponse extends ElementMutationMeta {
  term: GlossaryTerm;
}
export interface DeleteEdgeResponse extends ElementMutationMeta {
  ok: true;
}
export interface RollbackResponse extends ElementMutationMeta {
  /** DTO типа элемента (Category | CategoryEdge | Thesis | GlossaryTerm),
   *  для section/dialogue_turn — снимок строки */
  element: unknown;
}
export interface UpdateCapsuleResponse {
  capsuleHtml: string;
  version: ElementVersion;
}

export function updateCategory(
  synthesisId: string,
  categoryId: string,
  body: CategoryUpdateInput,
): Promise<UpdateCategoryResponse> {
  return apiPatch<UpdateCategoryResponse>(
    `${base(synthesisId)}/categories/${encodeURIComponent(categoryId)}`,
    body,
  );
}

export function updateEdge(
  synthesisId: string,
  edgeId: string,
  body: EdgeUpdateInput,
): Promise<UpdateEdgeResponse> {
  return apiPatch<UpdateEdgeResponse>(
    `${base(synthesisId)}/edges/${encodeURIComponent(edgeId)}`,
    body,
  );
}

export function deleteEdge(
  synthesisId: string,
  edgeId: string,
): Promise<DeleteEdgeResponse> {
  return apiDelete<DeleteEdgeResponse>(
    `${base(synthesisId)}/edges/${encodeURIComponent(edgeId)}`,
  );
}

export function updateThesis(
  synthesisId: string,
  thesisId: string,
  body: ThesisUpdateInput,
): Promise<UpdateThesisResponse> {
  return apiPatch<UpdateThesisResponse>(
    `${base(synthesisId)}/theses/${encodeURIComponent(thesisId)}`,
    body,
  );
}

export function updateGlossaryTerm(
  synthesisId: string,
  termId: string,
  body: GlossaryTermUpdateInput,
): Promise<UpdateGlossaryTermResponse> {
  return apiPatch<UpdateGlossaryTermResponse>(
    `${base(synthesisId)}/glossary/${encodeURIComponent(termId)}`,
    body,
  );
}

export function updateCapsule(
  synthesisId: string,
  html: string,
): Promise<UpdateCapsuleResponse> {
  return apiPatch<UpdateCapsuleResponse>(`${base(synthesisId)}/capsule`, {
    html,
  });
}

/* ── Версии ──────────────────────────────────────────────────────────── */

export function getVersionHistory(
  synthesisId: string,
  elementType: VersionedElementType,
  elementId: string,
): Promise<ElementVersion[]> {
  return apiGet<{ versions: ElementVersion[] }>(
    `${base(synthesisId)}/elements/${elementType}/${encodeURIComponent(
      elementId,
    )}/versions`,
  ).then((r) => r.versions);
}

export function rollbackToVersion(
  synthesisId: string,
  elementType: VersionedElementType,
  elementId: string,
  version: number,
): Promise<RollbackResponse> {
  return apiPost<RollbackResponse>(
    `${base(synthesisId)}/elements/${elementType}/${encodeURIComponent(
      elementId,
    )}/rollback`,
    { version },
  );
}

/* ── Автозамена имён (E8) ────────────────────────────────────────────── */

export function autoRename(
  synthesisId: string,
  body: AutoRenameInput,
): Promise<AutoRenameResult> {
  return apiPost<AutoRenameResult>(
    `${base(synthesisId)}/elements/auto-rename`,
    body,
  );
}
