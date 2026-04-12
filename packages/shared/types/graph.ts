// ─── Enums ──────────────────────────────────────────────────────────────────

export type EdgeDirection =
  | "однонаправленная"
  | "двунаправленная"
  | "рефлексивная";

export type ElementSource = "generated" | "manual";

/** Структурные роли категории (из parseTopology) */
export type StructuralRole =
  | "central"
  | "bridge"
  | "peripheral"
  | "isolated"
  | "hub";

/** Процедурные роли категории */
export type ProceduralRole =
  | "thesis"
  | "antithesis"
  | "synthesis"
  | "foundation"
  | "consequence"
  | "mediator";

// ─── Row types ─────────────────────────────────────────────────────────────

/** Категория графа (matches schema.ts categories) */
export interface Category {
  id: string;
  synthesisId: string;
  name: string;
  /** Тип категории (свободный текст от Claude): 'онтологическая', ... */
  type: string;
  definition: string;
  centrality: number;
  certainty: number;
  historicalSignificance: number;
  /** 1–5 */
  innovationDegree: number;
  /** FK на category_type_catalog (нормализованный тип) */
  typeCatalogId: string | null;
  /** Столбец «Происхождение / Генеалогия / Преодолённые ограничения» */
  origin: string;

  // Топология
  /** Индексы кластеров, к которым принадлежит: [0, 2] */
  clusterIndices: number[];
  structuralRoles: StructuralRole[];
  proceduralRoles: ProceduralRole[];
  hasReflexive: boolean;

  position: number;
  source: ElementSource;
  createdAt: Date;
  updatedAt: Date;
}

/** Связь между категориями (matches schema.ts category_edges) */
export interface CategoryEdge {
  id: string;
  synthesisId: string;
  sourceId: string;
  targetId: string;
  description: string;
  /** Тип связи (свободный текст): 'иерархическая', 'диалектическая', ... */
  edgeType: string;
  direction: EdgeDirection;
  strength: number;
  certainty: number;
  historicalSupport: number;
  logicalNecessity: number;
  /** FK на relationship_type_catalog (нормализованный тип) */
  typeCatalogId: string | null;
  position: number;
  sourceOrigin: ElementSource;
  createdAt: Date;
}

/** Метка кластера (matches schema.ts cluster_labels) */
export interface ClusterLabel {
  id: string;
  synthesisId: string;
  clusterIndex: number;
  label: string;
}

// ─── Taxonomy catalogs ─────────────────────────────────────────────────────

/** Каталог типов категорий (matches schema.ts category_type_catalog) */
export interface CategoryTypeCatalogEntry {
  id: string;
  key: string;
  nameRu: string;
  description: string;
  isSystem: boolean;
  createdBy: string | null;
  createdAt: Date;
}

/** Каталог типов связей (matches schema.ts relationship_type_catalog) */
export interface RelationshipTypeCatalogEntry {
  id: string;
  key: string;
  nameRu: string;
  description: string;
  defaultDirection: string;
  isSystem: boolean;
  createdBy: string | null;
  createdAt: Date;
}

// ─── Aggregated views ──────────────────────────────────────────────────────

/** Топологическая информация — агрегация из category + cluster_labels */
export interface TopologyInfo {
  clusters: ClusterLabel[];
  /** Категории, сгруппированные по кластеру */
  clusterMembers: Record<number, string[]>;
  /** Сводка ролей */
  roleCounts: {
    structural: Record<StructuralRole, number>;
    procedural: Record<ProceduralRole, number>;
  };
}

/** Данные графа для визуализации на клиенте */
export interface GraphData {
  categories: Category[];
  edges: CategoryEdge[];
  clusters: ClusterLabel[];
}

/** Обновление категории (PATCH /api/elements/categories/:id) */
export interface CategoryUpdateInput {
  name?: string;
  type?: string;
  definition?: string;
  centrality?: number;
  certainty?: number;
  historicalSignificance?: number;
  innovationDegree?: number;
  typeCatalogId?: string | null;
  origin?: string;
  structuralRoles?: StructuralRole[];
  proceduralRoles?: ProceduralRole[];
}

/** Обновление связи (PATCH /api/elements/edges/:id) */
export interface EdgeUpdateInput {
  description?: string;
  edgeType?: string;
  direction?: EdgeDirection;
  strength?: number;
  certainty?: number;
  historicalSupport?: number;
  logicalNecessity?: number;
  typeCatalogId?: string | null;
}
