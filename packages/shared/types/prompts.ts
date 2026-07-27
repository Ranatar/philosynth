/**
 * Типы Prompt Registry: шаблоны и конфигурации синтеза.
 * Соответствие: server/db/schema.ts (prompt_templates, synthesis_configs),
 * 01-architecture §4.1, 03-specification §2.9.
 */

/** Строка prompt_templates.
 *  Ключ-путь: 'system', 'method.dialectical.graph',
 *  'level.transformative.graph_methodology', 'section.critique.preamble',
 *  'enrichment.category', ...
 *  v11: схема учитывает кардинальность — method.{method}.{card}.{section}
 *  (card: none|single|multi) либо card-плейсхолдеры внутри шаблона. */
export interface PromptTemplate {
  id: string;
  key: string;
  version: number;
  /** Текст с плейсхолдерами {{participants}}, {{method_label}},
   *  {{synth_level_desc}} — Mustache-подобная подстановка без логики */
  body: string;
  isActive: boolean;
  description: string;
  createdAt: string;
  createdBy: string | null;
}

/** GET /prompts/:key/versions — версия без тела (список) */
export interface PromptVersion {
  version: number;
  isActive: boolean;
  description: string;
  createdAt: string;
  createdBy: string | null;
}

/** Известные ключи synthesis_configs (расширяемый список;
 *  v11-ключи — 01-arch §4.13–4.15) */
export type SynthesisConfigKey =
  | "context_deps.base"
  | "context_deps.genetic"
  | "context_deps.level"
  | "context_deps.level_genetic"
  | "context_deps.method"
  | "substitution_map"
  | "substitution_map_genetic"
  | "compat_matrix"
  | "fragment_share"
  | "intra_deps"
  | "subsection_map"
  | "subsection_ctx_keys"
  | "topology_roles"
  | "extra_types"
  // v11:
  | "parent_deps.base"
  | "parent_deps.genetic"
  | "parent_deps.level"
  | "parent_deps.level_genetic"
  | "parent_deps.method"
  | "parent_intra_deps"
  | "parent_field_order"
  | "parent_field_labels"
  | "md_by_card"
  | "sd_by_card"
  | "mode_deps"
  | (string & {});

/** Строка synthesis_configs */
export interface SynthesisConfig {
  id: string;
  key: SynthesisConfigKey;
  version: number;
  /** JSON-значение конфига (структура зависит от ключа) */
  value: unknown;
  isActive: boolean;
  description: string;
  createdAt: string;
}
