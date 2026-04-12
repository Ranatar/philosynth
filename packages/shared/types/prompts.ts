// ─── Row types (matches schema.ts) ─────────────────────────────────────────

/** Промптовый шаблон (matches schema.ts prompt_templates) */
export interface PromptTemplate {
  id: string;
  /**
   * Ключ-путь: 'system', 'method.dialectical.graph',
   * 'level.transformative.graph_methodology', 'section.critique.preamble'
   */
  key: string;
  version: number;
  /** Тело шаблона с {{плейсхолдерами}} */
  body: string;
  isActive: boolean;
  description: string;
  createdAt: Date;
  createdBy: string | null;
}

/** Конфигурация синтеза (matches schema.ts synthesis_configs) */
export interface SynthesisConfig {
  id: string;
  /**
   * Ключ: 'context_deps.base', 'substitution_map', 'compat_matrix',
   * 'fragment_share', 'intra_deps', 'subsection_map', 'topology_roles'
   */
  key: string;
  version: number;
  /** JSON-значение конфигурации */
  value: unknown;
  isActive: boolean;
  description: string;
  createdAt: Date;
}

// ─── Input types ───────────────────────────────────────────────────────────

/** Создание новой версии шаблона (POST /api/prompts/templates) */
export interface PromptTemplateCreateInput {
  key: string;
  body: string;
  description?: string;
}

/** Создание новой версии конфигурации (POST /api/prompts/configs) */
export interface SynthesisConfigCreateInput {
  key: string;
  value: unknown;
  description?: string;
}

/** Активация конкретной версии (POST /api/prompts/templates/:key/activate) */
export interface ActivateVersionInput {
  version: number;
}

// ─── Projections ───────────────────────────────────────────────────────────

/** Сводка по ключу — все версии */
export interface PromptVersionList {
  key: string;
  versions: Array<{
    version: number;
    isActive: boolean;
    description: string;
    createdAt: Date;
  }>;
}

/** Результат тестирования черновика шаблона */
export interface PromptTestResult {
  /** Отрендеренный шаблон с тестовыми данными */
  rendered: string;
  /** Найденные незаполненные плейсхолдеры */
  missingPlaceholders: string[];
  /** Приблизительное кол-во токенов */
  estimatedTokens: number;
}
