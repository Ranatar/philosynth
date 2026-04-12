// ─── Enums ──────────────────────────────────────────────────────────────────

export type ParentType = "philosopher" | "synthesis";

// ─── Row type (matches schema.ts synthesis_lineage) ────────────────────────

export interface SynthesisLineage {
  id: string;
  synthesisId: string;
  parentType: ParentType;
  /** Имя философа (если parentType = 'philosopher') */
  parentName: string | null;
  /** ID концепции-родителя (если parentType = 'synthesis') */
  parentSynthesisId: string | null;
  /** Порядок среди родителей */
  position: number;
}

// ─── Graph traversal types ─────────────────────────────────────────────────

/** Узел генеалогического дерева (результат рекурсивного CTE) */
export interface LineageNode {
  parentType: ParentType;
  parentName: string | null;
  parentSynthesisId: string | null;
  /** Глубина от запрошенного узла (1 = прямой родитель) */
  depth: number;
  /** Заголовок родительской концепции (join-enriched) */
  parentTitle?: string;
}

/** Результат GET /api/lineage/:id/ancestors */
export interface AncestorTree {
  synthesisId: string;
  synthesisTitle: string;
  ancestors: LineageNode[];
}

/** Результат GET /api/lineage/:id/descendants */
export interface DescendantTree {
  synthesisId: string;
  synthesisTitle: string;
  descendants: LineageDescendant[];
}

export interface LineageDescendant {
  synthesisId: string;
  title: string;
  depth: number;
}

/** Результат GET /api/lineage/search?philosopher=... */
export interface LineageSearchResult {
  synthesisId: string;
  title: string;
  method: string;
  /** Все философы-участники этого синтеза */
  philosophers: string[];
  depth: number;
}
