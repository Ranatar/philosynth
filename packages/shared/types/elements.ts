/**
 * Гранулярные элементы: тезисы, глоссарий, диалог, версии, impact-анализ.
 * Соответствие: server/db/schema.ts (theses, glossary_terms, dialogue_turns,
 * element_versions), 03-specification §2.4 (ImpactAnalysis).
 */

import type { ElementSource } from "./graph.js";

export type ThesisType = "ontological" | "epistemological" | "ethical";

/** Строка таблицы theses */
export interface Thesis {
  id: string;
  synthesisId: string;
  thesisNum: number;
  /** Текст тезиса (жирный) */
  formulation: string;
  /** Обоснование */
  justification: string;
  thesisType: ThesisType;
  noveltyDegree: string;
  /** Имена связанных категорий */
  relatedCategories: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
}

/** Строка таблицы glossary_terms */
export interface GlossaryTerm {
  id: string;
  synthesisId: string;
  term: string;
  definition: string;
  /** Дополнительные столбцы зависят от synth_level */
  extraColumns: Record<string, string>;
  /** 'redefined'|'borrowed'|'new'|'transformed'|'emergent'|... */
  termCategory: string;
  source: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** Строка таблицы dialogue_turns */
export interface DialogueTurn {
  id: string;
  synthesisId: string;
  /** Часть диалога (1–5) */
  partNumber: number;
  /** Номер реплики внутри части */
  turnNumber: number;
  /** Имя участника */
  speaker: string;
  content: string;
  /** Понятия, введённые в этой реплике */
  newConcepts: string[];
  createdAt: string;
}

/* ── Версионирование (element_versions) ──────────────────────────────── */

export type VersionedElementType =
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
  | "auto_rename"
  /** Откат к прежней версии (03 §2.4, правка 2026-09-02) */
  | "rollback";

/** Строка таблицы element_versions */
export interface ElementVersion {
  id: string;
  /** Владелец версии — по нему идёт проверка доступа (02 §2.12, п.3) */
  synthesisId: string;
  elementId: string;
  elementType: VersionedElementType;
  version: number;
  /** Полный снимок элемента до изменения */
  data: Record<string, unknown>;
  changeSource: ChangeSource;
  createdAt: string;
}

/* ── Impact-анализ при PATCH элементов (03-spec §2.4) ────────────────── */

export interface ImpactAnalysis {
  /** Ключи разделов, ссылающихся на элемент */
  affectedSections: string[];
  /** "sectionKey:subsectionName" */
  affectedSubsections: string[];
  affectedModes: { modeKey: string; index: number; title: string }[];
  severity: "none" | "low" | "high";
}

/* ── Таксономия: каталоги типов (03-spec §2.13, 01-arch §4.8) ────────── */

/** Строка category_type_catalog (18 системных + пользовательские) */
export interface CategoryType {
  id: string;
  /** 'ontological', 'epistemological', ... */
  key: string;
  /** 'Онтологическая', 'Эпистемологическая', ... */
  nameRu: string;
  description: string;
  /** Системный (предзаполненный) или пользовательский */
  isSystem: boolean;
  createdBy: string | null;
  createdAt: string;
}

/** Строка relationship_type_catalog (29 системных + пользовательские) */
export interface RelationshipType {
  id: string;
  /** 'hierarchical', 'dialectical', ... */
  key: string;
  nameRu: string;
  description: string;
  defaultDirection: string;
  isSystem: boolean;
  createdBy: string | null;
  createdAt: string;
}

/** Результат нечёткой нормализации (POST /taxonomy/normalize) */
export interface TypeMatch {
  key: string;
  nameRu: string;
  /** Уверенность сопоставления 0–1 */
  score: number;
}

/* ── Обогащение элементов (03-spec §2.14, 01-arch §4.9) ──────────────── */

export type EnrichableElementType =
  | "category"
  | "edge"
  | "thesis"
  | "glossary_term";

export type EnrichmentType =
  | "description"
  | "justification"
  /** Контраргументы к связи (03 §2.14; добавлен 2026-09-02) */
  | "counterarguments"
  | "evolution"
  | "characteristic";

/** Строка element_enrichments */
export interface ElementEnrichment {
  id: string;
  synthesisId: string;
  elementId: string;
  elementType: EnrichableElementType;
  enrichmentType: EnrichmentType;
  /** Ключ шаблона в Prompt Registry */
  promptKey: string;
  /** Результат обогащения (текст от Claude) */
  content: string;
  metadata: Record<string, unknown>;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: string;
}

/** Строка characteristic_justifications */
export interface CharacteristicJustification {
  id: string;
  /** Владелец обоснования — см. ElementVersion.synthesisId */
  synthesisId: string;
  elementId: string;
  elementType: "category" | "edge";
  /** 'centrality'|'certainty'|'historical_significance'|... */
  characteristic: string;
  value: number;
  /** Текст обоснования от Claude */
  justification: string;
  /** Альтернативные подходы к оценке */
  alternativeApproaches: string | null;
  /** Ограничения текущей оценки */
  limitations: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: string;
}

/* ── Трансформации graph↔theses (03-spec §2.15, 01-arch §4.11) ───────── */

export type TransformDirection = "graph_to_theses" | "theses_to_graph";

/** Строка representation_transforms + API-представление (§2.15) */
export interface RepresentationTransform {
  id: string;
  synthesisId: string;
  direction: TransformDirection;
  /** Граф или тезисы ДО трансформации (для отката) */
  sourceSnapshot: Record<string, unknown>;
  /** Старое состояние цели, которое было заменено */
  targetSnapshot: Record<string, unknown>;
  resultSummary: {
    categoriesCreated?: number;
    categoriesRemoved?: number;
    edgesCreated?: number;
    edgesRemoved?: number;
    thesesCreated?: number;
    thesesRemoved?: number;
  };
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: string;
}

export type { ElementSource };
