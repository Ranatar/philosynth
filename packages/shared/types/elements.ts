import type { ElementSource } from "./graph";

// ─── Enums ──────────────────────────────────────────────────────────────────

export type ThesisType = "ontological" | "epistemological" | "ethical";

export type TermCategory =
  | "redefined"
  | "borrowed"
  | "new"
  | "transformed"
  | "emergent"
  | string; // Claude может вернуть нестандартный тип

export type ElementType =
  | "category"
  | "edge"
  | "thesis"
  | "glossary_term"
  | "dialogue_turn"
  | "section";

export type ChangeSource =
  | "manual"
  | "regenerated"
  | "cascade"
  | "auto_rename";

export type EnrichmentElementType =
  | "category"
  | "edge"
  | "thesis"
  | "glossary_term";

export type EnrichmentType =
  | "description"
  | "justification"
  | "evolution"
  | "characteristic";

export type TransformDirection = "graph_to_theses" | "theses_to_graph";

// ─── Row types ─────────────────────────────────────────────────────────────

/** Тезис (matches schema.ts theses) */
export interface Thesis {
  id: string;
  synthesisId: string;
  thesisNum: number;
  /** Текст тезиса (жирный) */
  formulation: string;
  justification: string;
  thesisType: ThesisType;
  noveltyDegree: string;
  /** Имена связанных категорий */
  relatedCategories: string[];
  source: ElementSource;
  createdAt: Date;
  updatedAt: Date;
}

/** Термин глоссария (matches schema.ts glossary_terms) */
export interface GlossaryTerm {
  id: string;
  synthesisId: string;
  term: string;
  definition: string;
  /** Доп. столбцы, зависящие от synth_level */
  extraColumns: Record<string, string>;
  termCategory: TermCategory;
  source: ElementSource;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Реплика диалога (matches schema.ts dialogue_turns) */
export interface DialogueTurn {
  id: string;
  synthesisId: string;
  /** Часть диалога (1–5) */
  partNumber: number;
  /** Номер реплики внутри части */
  turnNumber: number;
  speaker: string;
  content: string;
  /** Понятия, введённые в этой реплике */
  newConcepts: string[];
  createdAt: Date;
}

/** Версия элемента (matches schema.ts element_versions) */
export interface ElementVersion {
  id: string;
  elementId: string;
  elementType: ElementType;
  version: number;
  /** Полный снимок элемента до изменения */
  data: Record<string, unknown>;
  changeSource: ChangeSource;
  createdAt: Date;
}

/** Обогащение элемента (matches schema.ts element_enrichments) */
export interface ElementEnrichment {
  id: string;
  synthesisId: string;
  elementId: string;
  elementType: EnrichmentElementType;
  enrichmentType: EnrichmentType;
  /** Ключ шаблона в Prompt Registry */
  promptKey: string;
  /** Результат обогащения (текст от Claude) */
  content: string;
  metadata: Record<string, unknown>;
  inputTokens: number;
  outputTokens: number;
  /** numeric(10,6) */
  costUsd: string;
  createdAt: Date;
}

/** Обоснование числовой характеристики (matches schema.ts characteristic_justifications) */
export interface CharacteristicJustification {
  id: string;
  elementId: string;
  elementType: "category" | "edge";
  /** 'centrality'|'certainty'|'historical_significance'|'strength'|... */
  characteristic: string;
  value: number;
  justification: string;
  alternativeApproaches: string | null;
  limitations: string | null;
  inputTokens: number;
  outputTokens: number;
  /** numeric(10,6) */
  costUsd: string;
  createdAt: Date;
}

/** Трансформация graph↔theses (matches schema.ts representation_transforms) */
export interface RepresentationTransform {
  id: string;
  synthesisId: string;
  direction: TransformDirection;
  /** Снимок источника до трансформации */
  sourceSnapshot: Record<string, unknown>;
  /** Снимок цели до трансформации (то, что было заменено) */
  targetSnapshot: Record<string, unknown>;
  resultSummary: TransformResultSummary;
  inputTokens: number;
  outputTokens: number;
  /** numeric(10,6) */
  costUsd: string;
  createdAt: Date;
}

export interface TransformResultSummary {
  categoriesCreated?: number;
  categoriesRemoved?: number;
  edgesCreated?: number;
  edgesRemoved?: number;
  thesesCreated?: number;
  thesesRemoved?: number;
  [key: string]: unknown;
}

// ─── Input types ───────────────────────────────────────────────────────────

export interface ThesisUpdateInput {
  formulation?: string;
  justification?: string;
  thesisType?: ThesisType;
  noveltyDegree?: string;
  relatedCategories?: string[];
}

export interface GlossaryTermUpdateInput {
  term?: string;
  definition?: string;
  extraColumns?: Record<string, string>;
  termCategory?: TermCategory;
}

/** Результат impact-анализа после редактирования элемента */
export interface EditImpact {
  /** Затронутые ключи секций */
  affectedSections: string[];
  /** Затронутые подразделы (sectionKey:subsectionName) */
  affectedSubsections: string[];
  /** Затронутые режимы */
  affectedModes: string[];
}
