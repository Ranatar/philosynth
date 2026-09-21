/**
 * Типы генеалогии (граф наследования концепций).
 * Соответствие: server/db/schema.ts (synthesis_lineage),
 * 03-specification §2.8, §4.1.
 */

export type ParentType = "philosopher" | "synthesis";

/** Участник мета-синтеза (POST /syntheses, 03-spec §4.1) */
export type ParticipantInput =
  | { type: "philosopher"; name: string }
  | { type: "synthesis"; synthesisId: string };

/** Строка таблицы synthesis_lineage */
export interface LineageRecord {
  id: string;
  synthesisId: string;
  parentType: ParentType;
  /** Имя философа (parent_type = 'philosopher') */
  parentName: string | null;
  /** id концепции-родителя (parent_type = 'synthesis') */
  parentSynthesisId: string | null;
  /** Порядок среди родителей */
  position: number;
}

/** Узел дерева для GET /lineage/ancestors|descendants */
export interface LineageNode {
  /** 'philosopher' — лист; 'synthesis' — может иметь родителей */
  type: ParentType;
  /** Имя философа либо заголовок концепции */
  name: string;
  /** id синтеза (для type='synthesis') */
  synthesisId?: string;
  /** Глубина от корня запроса (1 = непосредственный родитель) */
  depth: number;
  /** Родители узла (для ancestors) либо потомки (для descendants) */
  children: LineageNode[];
  /**
   * Узел пришёл из дерева импортированного файла (syntheses.file_genealogy),
   * а не из synthesis_lineage: снимок, без synthesisId и без ссылки.
   * Только у ancestors; у file-узлов концепций могут быть метаданные файла.
   */
  fromFile?: true;
  method?: string;
  synthLevel?: string;
  generationOrder?: string;
  seed?: string;
  capsule?: string;
}

/**
 * Дерево генеалогии, сохранённое при импорте файла (syntheses.file_genealogy):
 * корень — сам синтез, participants — родители в порядке файла. Индекс в
 * participants корня = position строки synthesis_lineage, которую импорт
 * создал (или создал бы) для этого родителя.
 *
 * ПРАВИЛО ПРИОРИТЕТА: строка synthesis_lineage с тем же position (философ с
 * именем или концепция с живым parent_synthesis_id) ПЕРЕКРЫВАЕТ узел файла;
 * узел файла показывается только там, где связи в БД нет.
 */
export interface FileGenealogyNode {
  type: "concept" | "philosopher";
  name: string;
  method?: string;
  synthLevel?: string;
  generationOrder?: string;
  seed?: string;
  capsule?: string;
  /** id концепции в БД сервиса, если файл его нёс (экспорт 4.2) */
  synthesisId?: string;
  participants?: FileGenealogyNode[];
}

/* ══ Беседа 8.5: сопоставление родителя при импорте ══════════════════ */

/** Совпадение по имени среди синтезов ТОГО ЖЕ владельца */
export interface LineageCandidateMatch {
  id: string;
  title: string;
  createdAt: string;
}

/**
 * Предложение родителя из ответа POST /syntheses/import (03 §2.2):
 * концепция-родитель из genealogy файла, которую ветка UUID не связала.
 * matches пуст — совпадений по имени нет; связь при импорте НЕ создаётся
 * даже при единственном совпадении (имя — не идентификатор).
 */
export interface LineageCandidate {
  /** Имя концепции-родителя, как оно записано в файле */
  parentName: string;
  /** Позиция среди participants файла (какое место заняла бы связь) */
  position: number;
  matches: LineageCandidateMatch[];
}

/** Тело POST /syntheses/:id/lineage/link (03 §2.8) */
export interface LinkParentInput {
  parentName: string;
  parentSynthesisId: string;
}
