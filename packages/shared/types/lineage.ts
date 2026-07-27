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
}
