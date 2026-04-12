import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  real,
  numeric,
  timestamp,
  jsonb,
  customType,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Custom type: bytea ────────────────────────────────────────────────────────

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
//  2.1  users
// ═══════════════════════════════════════════════════════════════════════════════

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  role: text("role").notNull().default("user"), // 'user' | 'admin'
  balanceUsd: numeric("balance_usd", { precision: 10, scale: 4 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  syntheses: many(syntheses),
  apiKeys: many(apiKeys),
  transactions: many(transactions),
  apiUsage: many(apiUsage),
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  2.2  sessions
// ═══════════════════════════════════════════════════════════════════════════════

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("idx_sessions_user").on(t.userId)],
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  2.3  syntheses
// ═══════════════════════════════════════════════════════════════════════════════

export const syntheses = pgTable(
  "syntheses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Параметры синтеза
    seed: text("seed").notNull().default(""),
    method: text("method").notNull().default("dialectical"),
    synthLevel: text("synth_level").notNull().default("comparative"),
    depth: text("depth").notNull().default("standard"),
    generationOrder: text("generation_order").notNull().default("architectural"),
    context: text("context").notNull().default(""),
    lang: text("lang").notNull().default("Russian"),

    // Состояние
    title: text("title").notNull().default("Синтез Философской Концепции"),
    docNum: text("doc_num").notNull().default(""),
    status: text("status").notNull().default("draft"),
    isPublic: boolean("is_public").notNull().default(false),

    // Порядок разделов
    sectionOrder: jsonb("section_order").notNull().default('["sum"]'),

    // Версионирование
    versionBase: integer("version_base").notNull().default(1),
    versionSub: integer("version_sub").notNull().default(0),
    versionModes: integer("version_modes").notNull().default(0),
    versionModeRegen: integer("version_mode_regen").notNull().default(0),

    // Капсула
    capsuleHtml: text("capsule_html").notNull().default(""),

    // Статистика
    totalInputTokens: integer("total_input_tokens").notNull().default(0),
    totalOutputTokens: integer("total_output_tokens").notNull().default(0),
    totalCostUsd: numeric("total_cost_usd", { precision: 10, scale: 6 })
      .notNull()
      .default("0"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_syntheses_user").on(t.userId),
    index("idx_syntheses_status").on(t.status),
    // Partial index for public syntheses
    // NOTE: gin_trgm_ops index on title needs raw SQL in migration
  ],
);

export const synthesesRelations = relations(syntheses, ({ one, many }) => ({
  user: one(users, { fields: [syntheses.userId], references: [users.id] }),
  sections: many(sections),
  categories: many(categories),
  categoryEdges: many(categoryEdges),
  clusterLabels: many(clusterLabels),
  theses: many(theses),
  glossaryTerms: many(glossaryTerms),
  dialogueTurns: many(dialogueTurns),
  lineage: many(synthesisLineage),
  editPlans: many(editPlans),
  modeResults: many(modeResults),
  generationLog: many(generationLog),
  contextLog: many(contextLog),
  elementEnrichments: many(elementEnrichments),
  representationTransforms: many(representationTransforms),
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  2.4  synthesis_lineage
// ═══════════════════════════════════════════════════════════════════════════════

export const synthesisLineage = pgTable(
  "synthesis_lineage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    parentType: text("parent_type").notNull(), // 'philosopher' | 'synthesis'
    parentName: text("parent_name"), // имя философа
    parentSynthesisId: uuid("parent_synthesis_id").references(
      () => syntheses.id,
      { onDelete: "set null" },
    ),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("idx_lineage_synthesis").on(t.synthesisId),
    index("idx_lineage_parent_synth").on(t.parentSynthesisId),
    index("idx_lineage_parent_name").on(t.parentName),
  ],
);

export const synthesisLineageRelations = relations(
  synthesisLineage,
  ({ one }) => ({
    synthesis: one(syntheses, {
      fields: [synthesisLineage.synthesisId],
      references: [syntheses.id],
      relationName: "lineageChild",
    }),
    parentSynthesis: one(syntheses, {
      fields: [synthesisLineage.parentSynthesisId],
      references: [syntheses.id],
      relationName: "lineageParent",
    }),
  }),
);

// ═══════════════════════════════════════════════════════════════════════════════
//  2.5  sections
// ═══════════════════════════════════════════════════════════════════════════════

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // 'sum'|'graph'|'glossary'|'theses'|...
    sectionNum: integer("section_num").notNull(),
    title: text("title").notNull(),
    htmlContent: text("html_content").notNull().default(""),
    secContext: text("sec_context").notNull().default(""),
    isEdited: boolean("is_edited").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_sections_synthesis_key").on(t.synthesisId, t.key),
    index("idx_sections_synthesis").on(t.synthesisId),
  ],
);

export const sectionsRelations = relations(sections, ({ one }) => ({
  synthesis: one(syntheses, {
    fields: [sections.synthesisId],
    references: [syntheses.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  2.22  category_type_catalog  (defined early — referenced by categories)
// ═══════════════════════════════════════════════════════════════════════════════

export const categoryTypeCatalog = pgTable("category_type_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(), // 'ontological', 'epistemological', ...
  nameRu: text("name_ru").notNull(),
  description: text("description").notNull().default(""),
  isSystem: boolean("is_system").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ═══════════════════════════════════════════════════════════════════════════════
//  2.23  relationship_type_catalog  (defined early — referenced by edges)
// ═══════════════════════════════════════════════════════════════════════════════

export const relationshipTypeCatalog = pgTable("relationship_type_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(), // 'hierarchical', 'dialectical', ...
  nameRu: text("name_ru").notNull(),
  description: text("description").notNull().default(""),
  defaultDirection: text("default_direction").notNull().default("unidirectional"),
  isSystem: boolean("is_system").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ═══════════════════════════════════════════════════════════════════════════════
//  2.6  categories
// ═══════════════════════════════════════════════════════════════════════════════

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull().default(""),
    definition: text("definition").notNull().default(""),
    centrality: real("centrality").notNull().default(0.5),
    certainty: real("certainty").notNull().default(0.5),
    historicalSignificance: real("historical_significance")
      .notNull()
      .default(0.5),
    innovationDegree: integer("innovation_degree").notNull().default(1),
    typeCatalogId: uuid("type_catalog_id").references(
      () => categoryTypeCatalog.id,
    ),
    origin: text("origin").notNull().default(""),

    // Топология
    clusterIndices: jsonb("cluster_indices").notNull().default("[]"),
    structuralRoles: jsonb("structural_roles").notNull().default("[]"),
    proceduralRoles: jsonb("procedural_roles").notNull().default("[]"),
    hasReflexive: boolean("has_reflexive").notNull().default(false),

    position: integer("position").notNull().default(0),
    source: text("source").notNull().default("generated"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_categories_synthesis").on(t.synthesisId)],
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  synthesis: one(syntheses, {
    fields: [categories.synthesisId],
    references: [syntheses.id],
  }),
  typeCatalog: one(categoryTypeCatalog, {
    fields: [categories.typeCatalogId],
    references: [categoryTypeCatalog.id],
  }),
  outgoingEdges: many(categoryEdges, { relationName: "edgeSource" }),
  incomingEdges: many(categoryEdges, { relationName: "edgeTarget" }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  2.7  category_edges
// ═══════════════════════════════════════════════════════════════════════════════

export const categoryEdges = pgTable(
  "category_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    description: text("description").notNull().default(""),
    edgeType: text("edge_type").notNull().default(""),
    direction: text("direction").notNull().default("однонаправленная"),
    strength: real("strength").notNull().default(0.5),
    certainty: real("certainty").notNull().default(0.5),
    historicalSupport: real("historical_support").notNull().default(0.5),
    logicalNecessity: real("logical_necessity").notNull().default(0.5),
    typeCatalogId: uuid("type_catalog_id").references(
      () => relationshipTypeCatalog.id,
    ),
    position: integer("position").notNull().default(0),
    sourceOrigin: text("source_origin").notNull().default("generated"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_edges_synthesis").on(t.synthesisId),
    index("idx_edges_source").on(t.sourceId),
    index("idx_edges_target").on(t.targetId),
  ],
);

export const categoryEdgesRelations = relations(categoryEdges, ({ one }) => ({
  synthesis: one(syntheses, {
    fields: [categoryEdges.synthesisId],
    references: [syntheses.id],
  }),
  source: one(categories, {
    fields: [categoryEdges.sourceId],
    references: [categories.id],
    relationName: "edgeSource",
  }),
  target: one(categories, {
    fields: [categoryEdges.targetId],
    references: [categories.id],
    relationName: "edgeTarget",
  }),
  typeCatalog: one(relationshipTypeCatalog, {
    fields: [categoryEdges.typeCatalogId],
    references: [relationshipTypeCatalog.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  2.8  cluster_labels
// ═══════════════════════════════════════════════════════════════════════════════

export const clusterLabels = pgTable(
  "cluster_labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    clusterIndex: integer("cluster_index").notNull(),
    label: text("label").notNull(),
  },
  (t) => [
    unique("uq_cluster_labels_synthesis_index").on(
      t.synthesisId,
      t.clusterIndex,
    ),
  ],
);

export const clusterLabelsRelations = relations(clusterLabels, ({ one }) => ({
  synthesis: one(syntheses, {
    fields: [clusterLabels.synthesisId],
    references: [syntheses.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  2.9  theses
// ═══════════════════════════════════════════════════════════════════════════════

export const theses = pgTable(
  "theses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    thesisNum: integer("thesis_num").notNull(),
    formulation: text("formulation").notNull(),
    justification: text("justification").notNull().default(""),
    thesisType: text("thesis_type").notNull().default("ontological"),
    noveltyDegree: text("novelty_degree").notNull().default(""),
    relatedCategories: jsonb("related_categories").notNull().default("[]"),
    source: text("source").notNull().default("generated"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_theses_synthesis").on(t.synthesisId)],
);

export const thesesRelations = relations(theses, ({ one }) => ({
  synthesis: one(syntheses, {
    fields: [theses.synthesisId],
    references: [syntheses.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  2.10  glossary_terms
// ═══════════════════════════════════════════════════════════════════════════════

export const glossaryTerms = pgTable(
  "glossary_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    definition: text("definition").notNull(),
    extraColumns: jsonb("extra_columns").notNull().default("{}"),
    termCategory: text("term_category").notNull().default(""),
    source: text("source").notNull().default("generated"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_glossary_synthesis").on(t.synthesisId)],
);

export const glossaryTermsRelations = relations(glossaryTerms, ({ one }) => ({
  synthesis: one(syntheses, {
    fields: [glossaryTerms.synthesisId],
    references: [syntheses.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  2.11  dialogue_turns
// ═══════════════════════════════════════════════════════════════════════════════

export const dialogueTurns = pgTable(
  "dialogue_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    partNumber: integer("part_number").notNull(),
    turnNumber: integer("turn_number").notNull(),
    speaker: text("speaker").notNull(),
    content: text("content").notNull(),
    newConcepts: jsonb("new_concepts").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_dialogue_synthesis").on(t.synthesisId)],
);

export const dialogueTurnsRelations = relations(dialogueTurns, ({ one }) => ({
  synthesis: one(syntheses, {
    fields: [dialogueTurns.synthesisId],
    references: [syntheses.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  2.12  element_versions
// ═══════════════════════════════════════════════════════════════════════════════

export const elementVersions = pgTable(
  "element_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    elementId: uuid("element_id").notNull(),
    elementType: text("element_type").notNull(),
    version: integer("version").notNull(),
    data: jsonb("data").notNull(),
    changeSource: text("change_source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_versions_element").on(t.elementId, t.elementType)],
);

// ═══════════════════════════════════════════════════════════════════════════════
//  2.13  edit_plans
// ═══════════════════════════════════════════════════════════════════════════════

export const editPlans = pgTable(
  "edit_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull().default("draft"),
    currentStep: integer("current_step").notNull().default(0),
    steps: jsonb("steps").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_plans_synthesis").on(t.synthesisId)],
);

export const editPlansRelations = relations(editPlans, ({ one }) => ({
  synthesis: one(syntheses, {
    fields: [editPlans.synthesisId],
    references: [syntheses.id],
  }),
  user: one(users, { fields: [editPlans.userId], references: [users.id] }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  2.14  mode_results
// ═══════════════════════════════════════════════════════════════════════════════

export const modeResults = pgTable(
  "mode_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    modeKey: text("mode_key").notNull(),
    paramValue: text("param_value").notNull(),
    htmlContent: text("html_content").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_modes_synthesis").on(t.synthesisId),
    index("idx_modes_key").on(t.synthesisId, t.modeKey),
  ],
);

export const modeResultsRelations = relations(modeResults, ({ one }) => ({
  synthesis: one(syntheses, {
    fields: [modeResults.synthesisId],
    references: [syntheses.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  2.15  generation_log
// ═══════════════════════════════════════════════════════════════════════════════

export const generationLog = pgTable(
  "generation_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    sectionKey: text("section_key").notNull(),
    sectionLabel: text("section_label").notNull().default(""),
    logType: text("log_type").notNull().default("generation"),
    source: text("source").notNull().default("initial"),
    status: text("status").notNull().default("done"),
    priorChars: integer("prior_chars").notNull().default(0),
    taskChars: integer("task_chars").notNull().default(0),
    inputChars: integer("input_chars").notNull().default(0),
    outputChars: integer("output_chars").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 })
      .notNull()
      .default("0"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").notNull().default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_genlog_synthesis").on(t.synthesisId)],
);

export const generationLogRelations = relations(generationLog, ({ one }) => ({
  synthesis: one(syntheses, {
    fields: [generationLog.synthesisId],
    references: [syntheses.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  2.16  context_log
// ═══════════════════════════════════════════════════════════════════════════════

export const contextLog = pgTable(
  "context_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    sectionKey: text("section_key").notNull(),
    budget: integer("budget").notNull().default(0),
    totalUsed: integer("total_used").notNull().default(0),
    reqFound: integer("req_found").notNull().default(0),
    reqTotal: integer("req_total").notNull().default(0),
    optIncluded: integer("opt_included").notNull().default(0),
    optTotal: integer("opt_total").notNull().default(0),
    entries: jsonb("entries").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_ctxlog_synthesis").on(t.synthesisId)],
);

export const contextLogRelations = relations(contextLog, ({ one }) => ({
  synthesis: one(syntheses, {
    fields: [contextLog.synthesisId],
    references: [syntheses.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  2.17  prompt_templates
// ═══════════════════════════════════════════════════════════════════════════════

export const promptTemplates = pgTable(
  "prompt_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    version: integer("version").notNull().default(1),
    body: text("body").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (t) => [
    unique("uq_prompts_key_version").on(t.key, t.version),
    index("idx_prompts_key_active").on(t.key),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════
//  2.18  synthesis_configs
// ═══════════════════════════════════════════════════════════════════════════════

export const synthesisConfigs = pgTable(
  "synthesis_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    version: integer("version").notNull().default(1),
    value: jsonb("value").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_configs_key_version").on(t.key, t.version),
    index("idx_configs_key_active").on(t.key),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════
//  2.19  api_keys
// ═══════════════════════════════════════════════════════════════════════════════

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    encryptedKey: bytea("encrypted_key").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_apikeys_user").on(t.userId)],
);

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, { fields: [apiKeys.userId], references: [users.id] }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  2.20  transactions
// ═══════════════════════════════════════════════════════════════════════════════

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type").notNull(), // 'topup'|'usage'|'refund'
    amountUsd: numeric("amount_usd", { precision: 10, scale: 6 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 10, scale: 4 }).notNull(),
    synthesisId: uuid("synthesis_id").references(() => syntheses.id),
    sectionKey: text("section_key"),
    stripeId: text("stripe_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_transactions_user").on(t.userId)],
);

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
  synthesis: one(syntheses, {
    fields: [transactions.synthesisId],
    references: [syntheses.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  2.21  api_usage
// ═══════════════════════════════════════════════════════════════════════════════

export const apiUsage = pgTable(
  "api_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    synthesisId: uuid("synthesis_id").references(() => syntheses.id),
    sectionKey: text("section_key"),
    billingMode: text("billing_mode").notNull(), // 'byo'|'service'
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_usage_user").on(t.userId),
    index("idx_usage_synthesis").on(t.synthesisId),
  ],
);

export const apiUsageRelations = relations(apiUsage, ({ one }) => ({
  user: one(users, { fields: [apiUsage.userId], references: [users.id] }),
  synthesis: one(syntheses, {
    fields: [apiUsage.synthesisId],
    references: [syntheses.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  2.24  element_enrichments
// ═══════════════════════════════════════════════════════════════════════════════

export const elementEnrichments = pgTable(
  "element_enrichments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    elementId: uuid("element_id").notNull(),
    elementType: text("element_type").notNull(),
    enrichmentType: text("enrichment_type").notNull(),
    promptKey: text("prompt_key").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").notNull().default("{}"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_enrichments_element").on(t.elementId, t.elementType),
    index("idx_enrichments_synthesis").on(t.synthesisId),
  ],
);

export const elementEnrichmentsRelations = relations(
  elementEnrichments,
  ({ one }) => ({
    synthesis: one(syntheses, {
      fields: [elementEnrichments.synthesisId],
      references: [syntheses.id],
    }),
  }),
);

// ═══════════════════════════════════════════════════════════════════════════════
//  2.25  characteristic_justifications
// ═══════════════════════════════════════════════════════════════════════════════

export const characteristicJustifications = pgTable(
  "characteristic_justifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    elementId: uuid("element_id").notNull(),
    elementType: text("element_type").notNull(),
    characteristic: text("characteristic").notNull(),
    value: real("value").notNull(),
    justification: text("justification").notNull(),
    alternativeApproaches: text("alternative_approaches"),
    limitations: text("limitations"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_justifications_element").on(t.elementId, t.elementType),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════
//  2.26  representation_transforms
// ═══════════════════════════════════════════════════════════════════════════════

export const representationTransforms = pgTable(
  "representation_transforms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(), // 'graph_to_theses' | 'theses_to_graph'
    sourceSnapshot: jsonb("source_snapshot").notNull(),
    targetSnapshot: jsonb("target_snapshot").notNull(),
    resultSummary: jsonb("result_summary").notNull().default("{}"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_transforms_synthesis").on(t.synthesisId),
    index("idx_transforms_direction").on(t.synthesisId, t.direction),
  ],
);

export const representationTransformsRelations = relations(
  representationTransforms,
  ({ one }) => ({
    synthesis: one(syntheses, {
      fields: [representationTransforms.synthesisId],
      references: [syntheses.id],
    }),
  }),
);
