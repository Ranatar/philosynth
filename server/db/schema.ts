/**
 * PhiloSynth Service — Drizzle-схема БД.
 * Источник истины: docs/02-data-model.md (ревизия 2026-07-22, v11).
 *
 * 28 таблиц (§2.1–2.28):
 *   users, sessions, syntheses, synthesis_lineage, sections,
 *   categories, category_edges, cluster_labels, theses, glossary_terms,
 *   dialogue_turns, element_versions, edit_plans, mode_results,
 *   generation_log, context_log, prompt_templates, synthesis_configs,
 *   api_keys, transactions, api_usage, subscription_plans,
 *   user_subscriptions, category_type_catalog, relationship_type_catalog,
 *   element_enrichments, characteristic_justifications,
 *   representation_transforms.
 *
 * v10: ext_graph_metrics, structure_sections (syntheses);
 *      clarity, breadth, depth_score, applicability (categories);
 *      innovation_degree, context_dependency (category_edges).
 * v11: keep_full_budget, parent_context_schema, paused_state,
 *      status 'paused' (syntheses); маркеры pause/resume в generation_log;
 *      budget_mode, parent_overhead, parent_spec (context_log);
 *      ключи parent_deps.* / md_by_card / sd_by_card / mode_deps
 *      (synthesis_configs).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** BYTEA (drizzle-orm 0.44 не экспортирует его из pg-core). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/* ── Типы JSONB-полей — единственный источник истины в shared/types ──── */

import type {
  PausedState,
  PauseReasonKind,
} from "@philosynth/shared/types/synthesis";
import type { EditStep } from "@philosynth/shared/types/edit-plan";
import type {
  ContextEntry as ContextLogEntry,
  ParentSpecLog,
} from "@philosynth/shared/types/generation";

export type { PausedState, PauseReasonKind, EditStep, ParentSpecLog };
export type { ContextLogEntry };

/* ─────────────────────────── 2.1. users ─────────────────────────────── */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
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

/* ────────────────────────── 2.2. sessions ───────────────────────────── */

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

/* ────────────────────────── 2.3. syntheses ──────────────────────────── */

export const syntheses = pgTable(
  "syntheses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Параметры синтеза (аналог DOC_STATE.params).
    // v11: участники (философы/концепции) ОПЦИОНАЛЬНЫ — 0 участников =
    // свободный синтез из зерна (participantCardinality = 'none').
    seed: text("seed").notNull().default(""),
    method: text("method", {
      enum: [
        "dialectical",
        "integrative",
        "deconstructive",
        "hermeneutical",
        "analytical",
        "creative",
      ],
    })
      .notNull()
      .default("dialectical"),
    synthLevel: text("synth_level", {
      enum: ["comparative", "transformative", "generative"],
    })
      .notNull()
      .default("comparative"),
    depth: text("depth", {
      enum: ["overview", "standard", "deep", "exhaustive"],
    })
      .notNull()
      .default("standard"),
    generationOrder: text("generation_order", {
      enum: ["architectural", "genetic"],
    })
      .notNull()
      .default("architectural"),
    /** Расширенные характеристики графа (v10) */
    extGraphMetrics: boolean("ext_graph_metrics").notNull().default(false),
    /** Не ужимать бюджет секций под давлением родителей (v11, tz_budget_mode) */
    keepFullBudget: boolean("keep_full_budget").notNull().default(false),
    /** Доп. контекст пользователя */
    context: text("context").notNull().default(""),
    lang: text("lang").notNull().default("Russian"),

    // Состояние
    title: text("title").notNull().default("Синтез Философской Концепции"),
    docNum: text("doc_num").notNull().default(""),
    /** 'paused' добавлен в v11 */
    status: text("status", {
      enum: ["draft", "generating", "paused", "ready", "error"],
    })
      .notNull()
      .default("draft"),
    isPublic: boolean("is_public").notNull().default(false),

    /** Порядок разделов: ["sum","graph","glossary",...] */
    sectionOrder: jsonb("section_order")
      .$type<string[]>()
      .notNull()
      .default(sql`'["sum"]'::jsonb`),

    /** Снимок sectionOrder для «Структура документа» (v10, nullable) */
    structureSections: jsonb("structure_sections").$type<string[] | null>(),
    /** 'selective-v1' | 'monolithic' (legacy-импорт; мигрирует при первой
     *  перегенерации с маркером schema_migration_marker в generation_log) */
    parentContextSchema: text("parent_context_schema")
      .notNull()
      .default("selective-v1"),
    /** Персистентное состояние паузы (v11, nullable) */
    pausedState: jsonb("paused_state").$type<PausedState | null>(),

    // Версионирование (аналог DOC_STATE.docVersion)
    versionBase: integer("version_base").notNull().default(1),
    versionSub: integer("version_sub").notNull().default(0),
    versionModes: integer("version_modes").notNull().default(0),
    versionModeRegen: integer("version_mode_regen").notNull().default(0),

    /** Капсула (HTML, хранится отдельно от секций) */
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
    index("idx_syntheses_public")
      .on(t.isPublic)
      .where(sql`${t.isPublic} = true`),
    index("idx_syntheses_paused")
      .on(t.status)
      .where(sql`${t.status} = 'paused'`),
    // pg_trgm-индекс поиска по названию (CREATE EXTENSION — в миграции)
    index("idx_syntheses_title_trgm").using(
      "gin",
      sql`${t.title} gin_trgm_ops`,
    ),
  ],
);

/* ─────────────────────── 2.4. synthesis_lineage ─────────────────────── */

export const synthesisLineage = pgTable(
  "synthesis_lineage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    parentType: text("parent_type", {
      enum: ["philosopher", "synthesis"],
    }).notNull(),
    /** Имя философа (если parent_type = 'philosopher') */
    parentName: text("parent_name"),
    /** id концепции-родителя (если parent_type = 'synthesis') */
    parentSynthesisId: uuid("parent_synthesis_id").references(
      () => syntheses.id,
      { onDelete: "set null" },
    ),
    /** Порядок среди родителей */
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("idx_lineage_synthesis").on(t.synthesisId),
    index("idx_lineage_parent_synth").on(t.parentSynthesisId),
    index("idx_lineage_parent_name")
      .on(t.parentName)
      .where(sql`${t.parentType} = 'philosopher'`),
  ],
);

/* ────────────────────────── 2.5. sections ───────────────────────────── */

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    /** 'sum'|'graph'|'glossary'|'theses'|... */
    key: text("key").notNull(),
    sectionNum: integer("section_num").notNull(),
    title: text("title").notNull(),
    htmlContent: text("html_content").notNull().default(""),
    /** Доп. контекст раздела (secCtx) */
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
    index("idx_sections_synthesis").on(t.synthesisId),
    uniqueIndex("sections_synthesis_key_unique").on(t.synthesisId, t.key),
  ],
);

/* ───────────────────────── 2.6. categories ──────────────────────────── */

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** 'онтологическая', 'эпистемологическая', ... (свободный текст) */
    type: text("type").notNull().default(""),
    definition: text("definition").notNull().default(""),
    centrality: real("centrality").notNull().default(0.5),
    certainty: real("certainty").notNull().default(0.5),
    /** Историческая значимость (0–1) */
    historicalSignificance: real("historical_significance")
      .notNull()
      .default(0.5),
    /** Уровень инновационности (1–5) */
    innovationDegree: integer("innovation_degree").notNull().default(1),
    /** Ясность (0–1, v10) */
    clarity: real("clarity").notNull().default(0),
    /** Широта (0–1, v10) */
    breadth: real("breadth").notNull().default(0),
    /** Глубина (0–1, v10; «depth_score» чтобы не конфликтовать с SQL) */
    depthScore: real("depth_score").notNull().default(0),
    /** Применимость (0–1, v10) */
    applicability: real("applicability").notNull().default(0),
    /** Ссылка на каталог типов (нормализованный) */
    typeCatalogId: uuid("type_catalog_id").references(
      () => categoryTypeCatalog.id,
    ),
    /** Столбец «Происхождение/Генеалогия/Преодолённые ограничения» */
    origin: text("origin").notNull().default(""),

    // Топология (из parseTopology)
    /** [0, 2] — индексы кластеров */
    clusterIndices: jsonb("cluster_indices")
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** ["central", "bridge"] */
    structuralRoles: jsonb("structural_roles")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** ["synthesis", "thesis"] */
    proceduralRoles: jsonb("procedural_roles")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    hasReflexive: boolean("has_reflexive").notNull().default(false),

    /** Порядок в таблице */
    position: integer("position").notNull().default(0),
    source: text("source", { enum: ["generated", "manual"] })
      .notNull()
      .default("generated"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_categories_synthesis").on(t.synthesisId)],
);

/* ──────────────────────── 2.7. category_edges ───────────────────────── */

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
    /** 'иерархическая', 'диалектическая', ... (свободный текст) */
    edgeType: text("edge_type").notNull().default(""),
    direction: text("direction", {
      enum: ["однонаправленная", "двунаправленная", "рефлексивная"],
    })
      .notNull()
      .default("однонаправленная"),
    strength: real("strength").notNull().default(0.5),
    /** Определённость/спорность связи */
    certainty: real("certainty").notNull().default(0.5),
    /** Историческая поддержка */
    historicalSupport: real("historical_support").notNull().default(0.5),
    /** Логическая необходимость */
    logicalNecessity: real("logical_necessity").notNull().default(0.5),
    /** Степень инновации связи (1–5, v10) */
    innovationDegree: integer("innovation_degree").notNull().default(1),
    /** Контекстозависимость (0–1, v10) */
    contextDependency: real("context_dependency").notNull().default(0.5),
    typeCatalogId: uuid("type_catalog_id").references(
      () => relationshipTypeCatalog.id,
    ),
    position: integer("position").notNull().default(0),
    sourceOrigin: text("source_origin", { enum: ["generated", "manual"] })
      .notNull()
      .default("generated"),
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

/* ──────────────────────── 2.8. cluster_labels ───────────────────────── */

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
    uniqueIndex("cluster_labels_synthesis_cluster_unique").on(
      t.synthesisId,
      t.clusterIndex,
    ),
  ],
);

/* ─────────────────────────── 2.9. theses ────────────────────────────── */

export const theses = pgTable(
  "theses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    thesisNum: integer("thesis_num").notNull(),
    /** Текст тезиса (жирный) */
    formulation: text("formulation").notNull(),
    /** Обоснование */
    justification: text("justification").notNull().default(""),
    thesisType: text("thesis_type", {
      enum: ["ontological", "epistemological", "ethical"],
    })
      .notNull()
      .default("ontological"),
    noveltyDegree: text("novelty_degree").notNull().default(""),
    /** Имена категорий */
    relatedCategories: jsonb("related_categories")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
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

/* ───────────────────────── 2.10. glossary_terms ─────────────────────── */

export const glossaryTerms = pgTable(
  "glossary_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    definition: text("definition").notNull(),
    /** Дополнительные столбцы зависят от synth_level, хранятся как JSON */
    extraColumns: jsonb("extra_columns")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** 'redefined'|'borrowed'|'new'|'transformed'|'emergent'|... */
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

/* ───────────────────────── 2.11. dialogue_turns ─────────────────────── */

export const dialogueTurns = pgTable(
  "dialogue_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    /** Часть диалога (1–5) */
    partNumber: integer("part_number").notNull(),
    /** Номер реплики внутри части */
    turnNumber: integer("turn_number").notNull(),
    /** Имя участника */
    speaker: text("speaker").notNull(),
    /** Текст реплики */
    content: text("content").notNull(),
    /** Понятия, введённые в этой реплике */
    newConcepts: jsonb("new_concepts")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_dialogue_synthesis").on(t.synthesisId)],
);

/* ──────────────────────── 2.12. element_versions ────────────────────── */

export const elementVersions = pgTable(
  "element_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Владелец версии (правка 2026-09-02, аудит фаз 5–6). Нужен для двух
     * вещей: проверка доступа в роутах /syntheses/:id/elements/... одним
     * WHERE вместо JOIN по пяти таблицам с ветвлением по element_type, и
     * каскадная уборка — без него версии переживали удаление синтеза
     * (element_id полиморфный, FK на элемент невозможен). Устройство
     * зеркалит element_enrichments.
     */
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    elementId: uuid("element_id").notNull(),
    elementType: text("element_type", {
      enum: [
        "category",
        "edge",
        "thesis",
        "glossary_term",
        "dialogue_turn",
        "section",
      ],
    }).notNull(),
    version: integer("version").notNull(),
    /** Полный снимок элемента до изменения */
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    changeSource: text("change_source", {
      // +rollback (правка 2026-09-02): откат к версии сам создаёт версию
      enum: ["manual", "regenerated", "cascade", "auto_rename", "rollback"],
    })
      .notNull()
      .default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_versions_element").on(t.elementId, t.elementType),
    index("idx_versions_synthesis").on(t.synthesisId),
  ],
);

/* ─────────────────────────── 2.13. edit_plans ───────────────────────── */

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
    /** 'paused' — v11 (01-arch §4.12, kind="plan") */
    status: text("status", {
      enum: ["draft", "executing", "paused", "done", "failed"],
    })
      .notNull()
      .default("draft"),
    currentStep: integer("current_step").notNull().default(0),
    /** Массив EditStep */
    steps: jsonb("steps")
      .$type<EditStep[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_plans_synthesis").on(t.synthesisId)],
);

/* ─────────────────────────── 2.14. mode_results ─────────────────────── */

export const modeResults = pgTable(
  "mode_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    /** 'adversarial'|'translator'|'timeslice' */
    modeKey: text("mode_key").notNull(),
    /** «Кант», «Аналитическая ФР», «Афины V в. до н.э.» */
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

/* ────────────────────────── 2.15. generation_log ────────────────────── */

export const generationLog = pgTable(
  "generation_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    sectionKey: text("section_key").notNull(),
    sectionLabel: text("section_label").notNull().default(""),
    /** v11: маркеры pause/resume/user-action/schema-migration —
     *  показываются в «Логе контекста», исключаются из «Лога промптов» */
    logType: text("log_type", {
      enum: [
        "generation",
        "version_marker",
        "deletion_marker",
        "pause_marker",
        "resume_marker",
        "user_action_marker",
        "schema_migration_marker",
      ],
    })
      .notNull()
      .default("generation"),
    source: text("source", {
      enum: [
        "initial",
        "edit",
        "edit_add",
        "cascade",
        "subsection_regen",
        "mode",
        "mode_cascade",
        /* 'resume' — возобновлённая генерация (исходник [25573]; дыра
         * 02 §2.15, найдена беседой 1.4b). Колонка text — миграции не
         * требует. */
        "resume",
      ],
    })
      .notNull()
      .default("initial"),
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
    /** secCtxPreview, modeParam, subsections; v11: promptSkeleton —
     *  скелет промпта пишется при генерации, реконструкция — fallback импорта */
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_genlog_synthesis").on(t.synthesisId)],
);

/* ─────────────────────────── 2.16. context_log ──────────────────────── */

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
    // v11 (tz_budget_mode / selective-parent-context):
    budgetMode: text("budget_mode", { enum: ["full", "shrink"] })
      .notNull()
      .default("shrink"),
    /** Вес родительского контекста (симв.) */
    parentOverhead: integer("parent_overhead").notNull().default(0),
    /** Per-parent spec: required/optional поля, missingRequired, опущенные */
    parentSpec: jsonb("parent_spec").$type<ParentSpecLog | null>(),
    /** Поверх entries вычисляется качество контекста раздела
     *  (getSectionContextQuality → score + issues, бейдж в Edit Modal) */
    entries: jsonb("entries")
      .$type<ContextLogEntry[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_ctxlog_synthesis").on(t.synthesisId)],
);

/* ────────────────────────── 2.17. prompt_templates ──────────────────── */

export const promptTemplates = pgTable(
  "prompt_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 'system', 'method.dialectical.graph', ...
     *  v11: схема ключей учитывает кардинальность —
     *  method.{method}.{card}.{section} (card: none|single|multi) */
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
    uniqueIndex("prompt_templates_key_version_unique").on(t.key, t.version),
    index("idx_prompts_key_active")
      .on(t.key)
      .where(sql`${t.isActive} = true`),
  ],
);

/* ────────────────────────── 2.18. synthesis_configs ─────────────────── */

export const synthesisConfigs = pgTable(
  "synthesis_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 'context_deps.base'|'.genetic'|'.level'|'.level_genetic'|'.method',
     *  'substitution_map', 'compat_matrix',
     *  v11: 'parent_deps.base'|'.genetic'|'.level'|'.level_genetic'|'.method',
     *       'parent_intra_deps', 'parent_field_order', 'parent_field_labels',
     *       'md_by_card', 'sd_by_card', 'mode_deps', ... */
    key: text("key").notNull(),
    version: integer("version").notNull().default(1),
    value: jsonb("value").$type<unknown>().notNull(),
    isActive: boolean("is_active").notNull().default(false),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("synthesis_configs_key_version_unique").on(t.key, t.version),
    index("idx_configs_key_active")
      .on(t.key)
      .where(sql`${t.isActive} = true`),
  ],
);

/* ─────────────────────────── 2.19. api_keys ─────────────────────────── */

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** AES-256 encrypted */
    encryptedKey: bytea("encrypted_key").notNull(),
    /** 'sk-ant-api03-...' (первые 14 символов) */
    keyPrefix: text("key_prefix").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_apikeys_user").on(t.userId)],
);

/* ────────────────────────── 2.20. transactions ──────────────────────── */

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type", { enum: ["topup", "usage", "refund"] }).notNull(),
    amountUsd: numeric("amount_usd", { precision: 10, scale: 6 }).notNull(),
    balanceAfter: numeric("balance_after", {
      precision: 10,
      scale: 4,
    }).notNull(),
    synthesisId: uuid("synthesis_id").references(() => syntheses.id),
    sectionKey: text("section_key"),
    stripeId: text("stripe_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_transactions_user").on(t.userId)],
);

/* ─────────────────────────── 2.21. api_usage ────────────────────────── */

export const apiUsage = pgTable(
  "api_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    synthesisId: uuid("synthesis_id").references(() => syntheses.id),
    sectionKey: text("section_key"),
    /**
     * Режим биллинга запроса (правка 2026-09-02): три значения по
     * приоритету 01 §6 — byo (ключ пользователя, списания нет, cost_usd
     * несёт СЕБЕСТОИМОСТЬ для статистики), subscription (списана квота),
     * balance (списано с баланса). Прежний enum byo|service не различал
     * подписку и баланс.
     */
    billingMode: text("billing_mode", {
      enum: ["byo", "subscription", "balance"],
    }).notNull(),
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

/* ──────────────────────── 2.22. subscription_plans ──────────────────── */

export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** 'starter', 'pro', 'academic' */
  name: text("name").notNull().unique(),
  /** 'Starter', 'Pro', 'Academic' */
  displayName: text("display_name").notNull(),
  priceUsd: numeric("price_usd", { precision: 10, scale: 2 }).notNull(),
  billingPeriod: text("billing_period", { enum: ["month", "year"] })
    .notNull()
    .default("month"),
  /** Полных синтезов за период */
  quotaSyntheses: integer("quota_syntheses").notNull(),
  /** Перегенераций разделов за период */
  quotaRegenerations: integer("quota_regenerations").notNull(),
  /** Запусков режимов за период */
  quotaModes: integer("quota_modes").notNull(),
  /** Обогащений элементов за период */
  quotaEnrichments: integer("quota_enrichments").notNull(),
  /** Stripe Price ID */
  stripePriceId: text("stripe_price_id").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ─────────────────────── 2.23. user_subscriptions ───────────────────── */

export const userSubscriptions = pgTable(
  "user_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    status: text("status", {
      enum: ["active", "past_due", "canceled", "trialing", "incomplete"],
    })
      .notNull()
      .default("active"),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", {
      withTimezone: true,
    }).notNull(),
    // Счётчики использования (сбрасываются в начале каждого периода)
    usedSyntheses: integer("used_syntheses").notNull().default(0),
    usedRegenerations: integer("used_regenerations").notNull().default(0),
    usedModes: integer("used_modes").notNull().default(0),
    usedEnrichments: integer("used_enrichments").notNull().default(0),
    cancelAtPeriodEnd: boolean("cancel_at_period_end")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_subscriptions_user").on(t.userId),
    index("idx_subscriptions_status")
      .on(t.status)
      .where(sql`${t.status} IN ('active', 'trialing')`),
  ],
);

/* ─────────────────────── 2.24. category_type_catalog ────────────────── */

export const categoryTypeCatalog = pgTable("category_type_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** 'ontological', 'epistemological', ... (18 системных) */
  key: text("key").notNull().unique(),
  /** 'Онтологическая', 'Эпистемологическая', ... */
  nameRu: text("name_ru").notNull(),
  description: text("description").notNull().default(""),
  /** Системный (предзаполненный) или пользовательский */
  isSystem: boolean("is_system").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ───────────────────── 2.25. relationship_type_catalog ──────────────── */

export const relationshipTypeCatalog = pgTable("relationship_type_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** 'hierarchical', 'dialectical', ... (29 системных) */
  key: text("key").notNull().unique(),
  /** 'Иерархическая', 'Диалектическая', ... */
  nameRu: text("name_ru").notNull(),
  description: text("description").notNull().default(""),
  defaultDirection: text("default_direction").notNull().default("unidirectional"),
  isSystem: boolean("is_system").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ─────────────────────── 2.26. element_enrichments ──────────────────── */

export const elementEnrichments = pgTable(
  "element_enrichments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    elementId: uuid("element_id").notNull(),
    elementType: text("element_type", {
      enum: ["category", "edge", "thesis", "glossary_term"],
    }).notNull(),
    enrichmentType: text("enrichment_type", {
      // +counterarguments (правка 2026-09-02): 03 §2.14 допускает его для
      // связей, а enum модели о нём не знал
      enum: [
        "description",
        "justification",
        "counterarguments",
        "evolution",
        "characteristic",
      ],
    }).notNull(),
    /** Ключ шаблона в Prompt Registry */
    promptKey: text("prompt_key").notNull(),
    /** Результат обогащения (текст от Claude) */
    content: text("content").notNull(),
    /** Доп. структурированные данные */
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
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

/* ────────────────── 2.27. characteristic_justifications ─────────────── */

export const characteristicJustifications = pgTable(
  "characteristic_justifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Владелец обоснования — см. комментарий в element_versions
     *  (правка 2026-09-02, аудит фаз 5–6) */
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    elementId: uuid("element_id").notNull(),
    elementType: text("element_type", {
      enum: ["category", "edge"],
    }).notNull(),
    /** 'centrality'|'certainty'|'historical_significance'|... */
    characteristic: text("characteristic").notNull(),
    value: real("value").notNull(),
    /** Текст обоснования от Claude */
    justification: text("justification").notNull(),
    /** Альтернативные подходы к оценке */
    alternativeApproaches: text("alternative_approaches"),
    /** Ограничения текущей оценки */
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
    index("idx_justifications_synthesis").on(t.synthesisId),
  ],
);

/* ─────────────────── 2.28. representation_transforms ────────────────── */

export const representationTransforms = pgTable(
  "representation_transforms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    direction: text("direction", {
      enum: ["graph_to_theses", "theses_to_graph"],
    }).notNull(),

    // Снимки до трансформации (для отката)
    /** Граф или тезисы ДО трансформации */
    sourceSnapshot: jsonb("source_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    /** Граф или тезисы ПОСЛЕ (старые, которые были заменены) */
    targetSnapshot: jsonb("target_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),

    /** { categoriesCreated, categoriesRemoved, thesesCreated, ... } */
    resultSummary: jsonb("result_summary")
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

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
