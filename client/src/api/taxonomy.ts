/**
 * API-функции каталогов типов (таксономия). Беседа 5.4 (запрос 1, п. 6).
 *
 * Контракт: 03-specification §2.13 и server/routes/taxonomy.ts (5.3):
 *  - getCategoryTypes → GET /taxonomy/category-types → { types }
 *  - getRelationshipTypes → GET /taxonomy/relationship-types → { types }
 *  - normalizeType → POST /taxonomy/normalize { text, kind } →
 *      { match: TypeMatch | null, suggestions: TypeMatch[] }
 *      (match — при точном/подстрочном совпадении или Левенштейн-близости
 *      ≥ порога сервиса; иначе null и до 3 ближайших кандидатов)
 *  - createCustomType → POST /taxonomy/{category|relationship}-types
 *      { key, nameRu, description, defaultDirection? } → 201 { type };
 *      дубликат ключа / невалидный ключ → 400 VALIDATION_ERROR + details
 *      (контракт TaxonomyValidationError 0.3b).
 *
 * Каталоги глобальные (не привязаны к синтезу) и меняются редко — списки
 * кэшируются на время сессии вкладки (invalidateTaxonomyCache после
 * создания типа). ApiError пробрасывается как есть — TaxonomySelector
 * разбирает details сам.
 */

import type {
  CategoryType,
  RelationshipType,
  TypeMatch,
} from "@philosynth/shared/types/elements";

import { apiGet, apiPost } from "./client";

export type TaxonomyKind = "category" | "relationship";

export type RelationshipDirection =
  | "unidirectional"
  | "bidirectional"
  | "reflexive";

export interface NormalizeResult {
  match: TypeMatch | null;
  suggestions: TypeMatch[];
}

export interface CreateTypeInput {
  key: string;
  nameRu: string;
  description?: string;
  /** Только для kind='relationship'; необязателен (дефолт схемы) */
  defaultDirection?: RelationshipDirection;
}

/** Единый вид строки каталога для селектора (общие поля обоих каталогов) */
export type CatalogType = CategoryType | RelationshipType;

const cache: Partial<Record<TaxonomyKind, Promise<CatalogType[]>>> = {};

export function getCategoryTypes(): Promise<CategoryType[]> {
  return apiGet<{ types: CategoryType[] }>("/taxonomy/category-types").then(
    (r) => r.types,
  );
}

export function getRelationshipTypes(): Promise<RelationshipType[]> {
  return apiGet<{ types: RelationshipType[] }>(
    "/taxonomy/relationship-types",
  ).then((r) => r.types);
}

/** Каталог по виду, с кэшем на сессию вкладки (сброс при неудаче) */
export function getCatalog(kind: TaxonomyKind): Promise<CatalogType[]> {
  const cached = cache[kind];
  if (cached) return cached;
  const p: Promise<CatalogType[]> = (
    kind === "category" ? getCategoryTypes() : getRelationshipTypes()
  ).catch((err: unknown) => {
    delete cache[kind];
    throw err;
  });
  cache[kind] = p;
  return p;
}

export function invalidateTaxonomyCache(kind?: TaxonomyKind): void {
  if (kind) delete cache[kind];
  else {
    delete cache.category;
    delete cache.relationship;
  }
}

export function normalizeType(
  text: string,
  kind: TaxonomyKind,
): Promise<NormalizeResult> {
  return apiPost<NormalizeResult>("/taxonomy/normalize", { text, kind });
}

export function createCustomType(
  kind: TaxonomyKind,
  input: CreateTypeInput,
): Promise<CatalogType> {
  const path =
    kind === "category"
      ? "/taxonomy/category-types"
      : "/taxonomy/relationship-types";
  const body: Record<string, unknown> = {
    key: input.key,
    nameRu: input.nameRu,
    description: input.description ?? "",
  };
  if (kind === "relationship" && input.defaultDirection)
    body.defaultDirection = input.defaultDirection;
  return apiPost<{ type: CatalogType }>(path, body).then((r) => {
    invalidateTaxonomyCache(kind);
    return r.type;
  });
}
