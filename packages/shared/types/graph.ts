/**
 * Типы графа категорий.
 * Соответствие: server/db/schema.ts (categories, category_edges,
 * cluster_labels), 03-specification §2.4, parseGraph/parseTopology.
 */

export type EdgeDirection =
  | "однонаправленная"
  | "двунаправленная"
  | "рефлексивная";

export type ElementSource = "generated" | "manual";

/** Строка таблицы categories (camelCase-представление в API) */
export interface Category {
  id: string;
  synthesisId: string;
  name: string;
  /** Свободный текст: 'онтологическая', 'эпистемологическая', ... */
  type: string;
  definition: string;
  centrality: number;
  certainty: number;
  /** Историческая значимость (0–1) */
  historicalSignificance: number;
  /** Уровень инновационности (1–5) */
  innovationDegree: number;
  /** Ясность (0–1, v10) */
  clarity: number;
  /** Широта (0–1, v10) */
  breadth: number;
  /** Глубина (0–1, v10; depth_score в SQL) */
  depthScore: number;
  /** Применимость (0–1, v10) */
  applicability: number;
  /** Ссылка на каталог типов (нормализованный тип) */
  typeCatalogId: string | null;
  /** Столбец «Происхождение/Генеалогия/Преодолённые ограничения» */
  origin: string;
  // Топология (из parseTopology)
  /** Индексы кластеров, напр. [0, 2] */
  clusterIndices: number[];
  /** ["central", "bridge"] */
  structuralRoles: string[];
  /** ["synthesis", "thesis"] */
  proceduralRoles: string[];
  hasReflexive: boolean;
  /** Порядок в таблице раздела */
  position: number;
  source: ElementSource;
  createdAt: string;
  updatedAt: string;
}

/** Строка таблицы category_edges */
export interface CategoryEdge {
  id: string;
  synthesisId: string;
  sourceId: string;
  targetId: string;
  description: string;
  /** Свободный текст: 'иерархическая', 'диалектическая', ... */
  edgeType: string;
  direction: EdgeDirection;
  strength: number;
  /** Определённость/спорность связи */
  certainty: number;
  /** Историческая поддержка */
  historicalSupport: number;
  /** Логическая необходимость */
  logicalNecessity: number;
  /** Степень инновации связи (1–5, v10) */
  innovationDegree: number;
  /** Контекстозависимость (0–1, v10) */
  contextDependency: number;
  typeCatalogId: string | null;
  position: number;
  sourceOrigin: ElementSource;
  createdAt: string;
}

/** Строка таблицы cluster_labels */
export interface ClusterLabel {
  id: string;
  synthesisId: string;
  clusterIndex: number;
  label: string;
}

/** Агрегат топологии для GET /syntheses/:id/categories */
export interface TopologyInfo {
  clusters: ClusterLabel[];
  /** Присутствующие структурные роли графа */
  structuralRoles: string[];
  /** Присутствующие процессуальные роли графа */
  proceduralRoles: string[];
  hasReflexiveEdges: boolean;
}

/** Ответ GET /syntheses/:id/categories (03-spec §2.4) */
export interface GraphData {
  categories: Category[];
  edges: CategoryEdge[];
  clusters: ClusterLabel[];
  topology: TopologyInfo;
}
