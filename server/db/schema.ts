/**
 * PhiloSynth Service — Drizzle-схема БД.
 * Источник истины: docs/02-data-model.md (ревизия 2026-07-22, v11).
 *
 * 39 таблиц (§2.1–2.39; admin_audit — беседа 8.1; auth_tokens и
 * mail_outbox — беседа 9.1; recommendations — беседа 10.1;
 * synthesis_members, comments, reviews, review_revisions, review_findings —
 * беседа 16.1, миграция 0017; notifications, notification_settings — беседа
 * 16.2, миграция 0018, там же auth_tokens += member_invite/synthesis_id/
 * member_role):
 *   users, sessions, syntheses, synthesis_lineage, sections,
 *   categories, category_edges, cluster_labels, theses, glossary_terms,
 *   dialogue_turns, element_versions, edit_plans, mode_results,
 *   generation_log, context_log, prompt_templates, synthesis_configs,
 *   api_keys, transactions, api_usage, subscription_plans,
 *   user_subscriptions, category_type_catalog, relationship_type_catalog,
 *   element_enrichments, characteristic_justifications,
 *   representation_transforms, admin_audit, auth_tokens, mail_outbox,
 *   recommendations, synthesis_members, comments, reviews,
 *   review_revisions, review_findings, notifications, notification_settings.
 * 17.1 (миграция 0019): + proposals, proposal_events (§2.40–2.41).
 * 18.1 (миграция 0020): + synthesis_search (§2.42) — индекс поиска; там же
 *   индексы точного термина glossary_terms и триграммный индекс зерна.
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
  type AnyPgColumn,
  boolean,
  check,
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

/** TSVECTOR (18.1): в pg-core drizzle-orm 0.44 типа нет. Значение пишется и
 *  читается только SQL-выражениями (`to_tsvector`, `@@`) — в JS не ходит. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

/* ── Типы JSONB-полей — единственный источник истины в shared/types ──── */

import type {
  PausedState,
  PauseReasonKind,
} from "@philosynth/shared/types/synthesis";
import type { EditStep } from "@philosynth/shared/types/edit-plan";
import type { VersionOrigin } from "@philosynth/shared/types/elements";
import type { FileGenealogyNode } from "@philosynth/shared/types/lineage";
import type { RecommendationIssue } from "@philosynth/shared/types/recommendations";
import type {
  DiscussionAddress,
  ReviewDocVersion,
  ReviewFields,
  ReviewFinding,
} from "@philosynth/shared/types/discussion"; // 16.1
import type { NotificationPayload } from "@philosynth/shared/types/notifications"; // 16.2
import type { ProposalBase } from "@philosynth/shared/types/proposals"; // 17.1
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
  /** Stripe Customer пользователя (миграция 0003, беседа 7.1): создаётся
   *  один раз при первом пополнении или подписке и переиспользуется
   *  (до 7.1 Customer создавался на каждую подписку — 02 §2.1). */
  stripeCustomerId: text("stripe_customer_id").unique(),
  /** Момент подтверждения адреса (миграция 0006, беседа 9.1). NULL — не
   *  подтверждён. Пока НЕ ограничивает ничего: вход разрешён, у всех
   *  пользователей до 9.1 колонка пуста — запрет вышвырнул бы их разом. */
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  /** Язык интерфейса (миграция 0010, беседа 11.2): 'ru' | 'en' | 'de'
   *  (UI_LOCALES shared/i18n/locales); NULL — не выбирал: язык запроса
   *  берётся из cookie ui_locale и Accept-Language (server/i18n/locale.ts).
   *  Проверяется кодом, не CHECK: список языков растёт без миграции. */
  uiLocale: text("ui_locale"),
  /** Язык генерации по умолчанию для новых синтезов (миграция 0010, 11.2):
   *  значение syntheses.lang («Russian», «German», …). Смена uiLocale
   *  переписывает его правилом genLangForUi; смена genLang интерфейс не
   *  трогает (связь односторонняя). NULL — не выбирал. */
  genLang: text("gen_lang"),
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
    /** Ступень видимости (беседа 8.6, миграция 0005 — вместо булева
     *  is_public): 'private' — только владелец; 'showcase' — витрина:
     *  капсула, метаданные, философы, даты, тела разделов и элементы НЕ
     *  отдаются; 'full' — произведение целиком. Публичный каталог фильтрует
     *  по этой колонке (индекс idx_syntheses_visibility). */
    visibility: text("visibility", {
      enum: ["private", "showcase", "full"],
    })
      .notNull()
      .default("private"),
    /** Показывать имя автора (users.display_name) — действует на ОБЕИХ
     *  неприватных ступенях (8.6) */
    showAuthor: boolean("show_author").notNull().default(false),
    /** Логи generation/context/formatted чужому зарегистрированному —
     *  ТОЛЬКО при visibility='full' (effectiveFlags); стоимость и токены
     *  флагом НЕ управляются (решение 8.6) */
    showLogs: boolean("show_logs").notNull().default(true),
    /** Дамп запросов (/logs/prompts) чужому — только при 'full' */
    showPrompts: boolean("show_prompts").notNull().default(false),
    /** Пригодность в участники чужого мета-синтеза — только при 'full';
     *  по умолчанию разрешена (миграция не отнимает возможность) */
    allowMeta: boolean("allow_meta").notNull().default(true),

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
    /** Дерево генеалогии импортированного файла (FileGenealogyNode): снимок
     *  предков, которых нет в synthesis_lineage. null — синтез не из файла.
     *  Связь в БД на той же позиции перекрывает узел файла (lineage-service). */
    fileGenealogy: jsonb("file_genealogy").$type<FileGenealogyNode | null>(),

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
    // 8.6: публичный каталог и pruneInvisible фильтруют по ступени
    index("idx_syntheses_visibility")
      .on(t.visibility)
      .where(sql`${t.visibility} <> 'private'`),
    check(
      "syntheses_visibility_check",
      sql`${t.visibility} IN ('private', 'showcase', 'full')`,
    ),
    index("idx_syntheses_paused")
      .on(t.status)
      .where(sql`${t.status} = 'paused'`),
    // pg_trgm-индекс поиска по названию (CREATE EXTENSION — в миграции)
    index("idx_syntheses_title_trgm").using(
      "gin",
      sql`${t.title} gin_trgm_ops`,
    ),
    // 18.1 (миграция 0020): запасной ход поиска по зерну (опечатки —
    // word_similarity по триграммам)
    index("idx_syntheses_seed_trgm").using(
      "gin",
      sql`${t.seed} gin_trgm_ops`,
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
    // 15.1 (Д-70, миграция 0014): пара «ребёнок → концепция-родитель»
    // единственна — два одновременных POST /lineage/link не пишут дубль;
    // linkParent переводит нарушение в LINEAGE_EXISTS. Частичный: строки
    // философов и строки с удалённым родителем (SET NULL) не ограничиваются
    uniqueIndex("uq_lineage_parent_pair")
      .on(t.synthesisId, t.parentSynthesisId)
      .where(
        sql`${t.parentType} = 'synthesis' AND ${t.parentSynthesisId} IS NOT NULL`,
      ),
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
    /** Ссылка на каталог типов (нормализованный). ON DELETE SET NULL —
     *  миграция 0003 (7.1): удаление пользовательского типа отвязывает
     *  категории, текст type остаётся */
    typeCatalogId: uuid("type_catalog_id").references(
      () => categoryTypeCatalog.id,
      { onDelete: "set null" },
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
    /** ON DELETE SET NULL — миграция 0003 (7.1), см. categories */
    typeCatalogId: uuid("type_catalog_id").references(
      () => relationshipTypeCatalog.id,
      { onDelete: "set null" },
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
    /** 12.1 (Д-1, миграция 0011): метка тезиса так, как её записал документ
     *  в первой ячейке сводной таблицы («О-1», «Э-2»). NULL — метка совпадает
     *  с номером (документы службы с целой нумерацией). Рендерер 5.1 рисует
     *  label ?? thesis_num, сторож рекомендаций 10.1 сводит метку по колонке. */
    label: text("label"),
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
  (t) => [
    index("idx_glossary_synthesis").on(t.synthesisId),
    // 18.1 (миграция 0020): точный термин без регистра — поле `term` поиска.
    // Второй индекс — имя термина без хвостовой скобки-пояснения: документ
    // пишет «Имя (пояснение)» одной ячейкой, человек ищет по имени
    // (выражение — GLOSSARY_TERM_BASE_SQL в services/search.ts, сторож 4br)
    index("idx_glossary_term_lower").on(sql`lower(${t.term})`),
    index("idx_glossary_term_base").on(
      sql`lower(btrim(regexp_replace(${t.term}, '[[:space:]]*[(][^()]*[)][[:space:]]*$', '')))`,
    ),
  ],
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
      // +recommendation (10.2): правка исполнила рекомендацию критики
      // +proposal (17.1): правка исполнила принятое предложение участника
      enum: ["manual", "regenerated", "cascade", "auto_rename", "rollback", "recommendation", "proposal"],
    })
      .notNull()
      .default("manual"),
    /** 10.2 (миграция 0009): «почему изменилось» — снимок рекомендации,
     *  породившей версию (номер, раунд, операция, основание, план, шаг).
     *  NULL — правка не по рекомендации */
    origin: jsonb("origin").$type<VersionOrigin>(),
    /** 17.1 (миграция 0019): ИСПОЛНИТЕЛЬ правки — кто нажал (владелец либо
     *  редактор). NULL — строка до 17.1 или запись службы без пользователя:
     *  читается как владелец. Схему номера версии не меняет: номер считает,
     *  что произошло, а не кто это сделал (врезка «Фаза 17») */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
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
    /** 17.1 (миграция 0019): ИСПОЛНИТЕЛЬ операции — кто нажал кнопку (он же
     *  плательщик: resolveBilling получает его). NULL — строка до 17.1,
     *  импорт либо запись службы: читается как владелец */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
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
    /** Автор черновика. ON DELETE SET NULL — миграция 0003 (7.1): голый
     *  REFERENCES валил удаление админа по FK 23503 («По факту 6.2» п.11). */
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
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
    /** bonus (2026-11-25, миграция 0023) — пробный подарок на баланс при
     *  первом подтверждении почты; не больше одного на пользователя
     *  (uq_transactions_trial) */
    type: text("type", { enum: ["topup", "usage", "refund", "bonus"] }).notNull(),
    amountUsd: numeric("amount_usd", { precision: 10, scale: 6 }).notNull(),
    balanceAfter: numeric("balance_after", {
      precision: 10,
      scale: 4,
    }).notNull(),
    /** ON DELETE SET NULL (правка 6.1): история платежей переживает
     *  удаление синтеза; без этого DELETE /syntheses/:id падал бы на FK у
     *  любого оплаченного синтеза (02 §2.20 писал голый REFERENCES). */
    synthesisId: uuid("synthesis_id").references(() => syntheses.id, {
      onDelete: "set null",
    }),
    sectionKey: text("section_key"),
    stripeId: text("stripe_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_transactions_user").on(t.userId),
    uniqueIndex("uq_transactions_trial").on(t.userId).where(sql`${t.type} = 'bonus'`),
  ],
);

/* ────────────────────────── 2.20a. trial_grants ─────────────────────── */

/**
 * Адреса, получившие пробный подарок (2026-11-25, миграция 0024; решение
 * пользователя: на одну и ту же почту подарок дважды не даётся).
 * uq_transactions_trial держит «один на учётную запись», но удаление
 * учётной записи освобождает адрес (email → deleted-…@deleted.invalid), и
 * новая регистрация на тот же ящик получала подарок снова. Здесь — отпечаток
 * АДРЕСА (billing-service trialEmailHash: SHA-256 нормализованного адреса,
 * сам адрес не хранится), без ссылки на пользователя: строка переживает
 * удаление учётной записи.
 */
export const trialGrants = pgTable("trial_grants", {
  emailHash: text("email_hash").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ─────────────────────────── 2.21. api_usage ────────────────────────── */

export const apiUsage = pgTable(
  "api_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** ON DELETE SET NULL (правка 6.1) — см. transactions.synthesis_id */
    synthesisId: uuid("synthesis_id").references(() => syntheses.id, {
      onDelete: "set null",
    }),
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

export const subscriptionPlans = pgTable(
  "subscription_plans",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Уникальный идентификатор РЕДАКЦИИ тарифа: 'starter' (редакция 1),
   *  'starter-v2' (редакция 2) … (15.4, Д-74). Редакция 1 семейства носит
   *  имя семейства — так посеянные 8.3 строки остались собой. */
  name: text("name").notNull().unique(),
  /** 15.4 (Д-74, миграция 0016): семейство тарифа — одно у всех редакций
   *  ('starter'); у строк до миграции = name. Product в Stripe — один на
   *  семейство, Price — на редакцию. */
  family: text("family").notNull(),
  /** 15.4: номер редакции в семействе, с 1; новая редакция — max+1 */
  edition: integer("edition").notNull().default(1),
  /** 'Starter', 'Pro', 'Academic' */
  displayName: text("display_name").notNull(),
  priceUsd: numeric("price_usd", { precision: 10, scale: 2 }).notNull(),
  billingPeriod: text("billing_period", { enum: ["month", "year"] })
    .notNull()
    .default("month"),
  /** Кредитов за период (миграция 0021 свела четыре квоты — синтезы,
   *  перегенерации, режимы, обогащения — в одну; веса операций —
   *  config/plan-economics.ts CREDIT_WEIGHTS) */
  quotaCredits: integer("quota_credits").notNull(),
  /** Stripe Price ID */
  stripePriceId: text("stripe_price_id").notNull(),
  /** «открыт для покупки» (15.4): GET /billing/plans и POST /subscribe видят
   *  только такие; закрытая редакция держит квоты своих подписчиков */
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  },
  (t) => [
    // 15.4: одна строка на номер редакции в семействе
    uniqueIndex("uq_subscription_plans_family_edition").on(t.family, t.edition),
  ],
);

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
    // Израсходовано кредитов (сбрасывается в начале каждого периода; 0021)
    usedCredits: integer("used_credits").notNull().default(0),
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

/* ─────────────────────── 2.23a. credit_charges ─────────────────────── */

/**
 * Журнал списаний кредитов подписки (решение пользователя 2026-11-17,
 * миграция 0022): строка на операцию, взявшую кредиты под слотом
 * генерации, — кто, за какой документ, сколько, за что. Деньги баланса
 * уже журналируются transactions (synthesis_id), себестоимость BYO —
 * api_usage; кредиты до 0022 списывались счётчиком used_credits без
 * привязки к документу. Потребители: строка «С вас» в футере документа
 * (GET /syntheses/:id/charges) и история на странице биллинга
 * (GET /billing/credit-charges). Удаление документа строку не удаляет
 * (SET NULL — как api_usage/transactions), удаление пользователя — да.
 */
export const creditCharges = pgTable(
  "credit_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    synthesisId: uuid("synthesis_id").references(() => syntheses.id, {
      onDelete: "set null",
    }),
    subscriptionId: uuid("subscription_id").references(() => userSubscriptions.id, {
      onDelete: "set null",
    }),
    credits: integer("credits").notNull(),
    /** Вид операции: synthesis | section | subsection | mode | enrichment | plan */
    op: text("op").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_credit_charges_user").on(t.userId, t.createdAt),
    index("idx_credit_charges_synthesis_user").on(t.synthesisId, t.userId),
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
  /** ON DELETE SET NULL — миграция 0003 (7.1), тот же класс, что prompt_templates */
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
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
  /** ON DELETE SET NULL — миграция 0003 (7.1) */
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
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

    // Снимки до трансформации (для отката); семантика — 02 §2.28 (правка
    // 2026-09-02): source — представление-ИСТОЧНИК на момент
    // трансформации (аудит), target — представление-ЦЕЛЬ до замены (из
    // него откат). Форма JSON — GraphSnapshot | ThesesSnapshot
    // (representation-transformer 5.5: строки БД целиком + sectionHtml)
    /** Представление-источник на момент трансформации */
    sourceSnapshot: jsonb("source_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    /** Представление-цель ДО замены — из него делается откат */
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

/* ───────────────────────── 2.29. admin_audit ────────────────────────── */

/**
 * Журнал административных действий (беседа 8.1; 02 §2.29, миграция 0004).
 * Пишется ТОЛЬКО через services/admin-audit.ts (writeAudit) — в той же
 * транзакции, что и само действие. actor_id — ON DELETE SET NULL, не
 * CASCADE: след действий обязан пережить исчезновение актора (7.1
 * анонимизирует строку users, а не удаляет её — writeAudit-потребитель
 * account-deletion сам обнуляет actor_id, воспроизводя эффект SET NULL).
 * action — значение из ADMIN_ACTIONS (замороженная константа сервиса,
 * enum колонки намеренно не задан: список расширяется без миграции).
 */
export const adminAudit = pgTable(
  "admin_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** prompt.version.created | … | user.role.changed | user.bootstrapped | account.deleted */
    action: text("action").notNull(),
    /** 'prompt_template' | 'synthesis_config' | 'taxonomy_type' | 'user' */
    targetType: text("target_type").notNull(),
    /** Ключ шаблона/конфига, id типа каталога, id пользователя; null — нет цели */
    targetId: text("target_id"),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_admin_audit_actor").on(t.actorId),
    index("idx_admin_audit_created").on(t.createdAt),
  ],
);

/* ──────────────────────── 2.30. auth_tokens ─────────────────────────── */

/**
 * Одноразовые доводы из писем (беседа 9.1; 02 §2.30, миграция 0006):
 * подтверждение адреса и сброс пароля. В базе лежит ХЭШ довода (sha256,
 * hex), а не он сам: утечка таблицы не должна давать ни входа, ни
 * подтверждения — тот же принцип, что у sessions.id (0.2). Выдача нового
 * довода того же назначения помечает прежние использованными
 * (services/auth-tokens.ts), иначе старая ссылка из почты осталась бы
 * рабочей. user_id — ON DELETE CASCADE; но 7.1 строку users анонимизирует,
 * а не удаляет, поэтому account-deletion снимает доводы явно (урок 8.1).
 * 15.3 (Д-73, миграция 0015): третье назначение 'email_change' — смена
 * адреса; НОВЫЙ адрес лежит в строке довода (new_email), в users до
 * подтверждения ничего не пишется. 15.3 (Д-72): погашенные и просроченные
 * доводы старше AUTH_TOKEN_RETENTION_DAYS снимает проход чистки.
 */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose", {
      enum: ["email_verify", "password_reset", "email_change", "member_invite"],
    }).notNull(),
    tokenHash: text("token_hash").notNull(),
    /** 15.3 (Д-73): новый адрес у довода 'email_change'; 16.2: приглашаемый
     *  адрес у 'member_invite' (аккаунта нет — user_id несёт пригласившего);
     *  у прочих — NULL */
    newEmail: text("new_email"),
    /** 16.2 (миграция 0018): синтез и роль приглашения 'member_invite';
     *  CASCADE — удалённая концепция уносит ждущие приглашения; у прочих
     *  назначений — NULL */
    synthesisId: uuid("synthesis_id").references(() => syntheses.id, { onDelete: "cascade" }),
    memberRole: text("member_role", { enum: ["reviewer", "editor"] }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_auth_tokens_user_purpose").on(t.userId, t.purpose),
    index("idx_auth_tokens_hash").on(t.tokenHash),
    index("idx_auth_tokens_synthesis").on(t.synthesisId),
    check(
      "auth_tokens_purpose_check",
      sql`${t.purpose} IN ('email_verify','password_reset','email_change','member_invite')`,
    ),
    check(
      "auth_tokens_member_role_check",
      sql`${t.memberRole} IS NULL OR ${t.memberRole} IN ('reviewer','editor')`,
    ),
  ],
);

/* ──────────────────────── 2.31. mail_outbox ─────────────────────────── */

/**
 * Очередь исходящих писем (беседа 9.1; 02 §2.31, миграция 0006). Строка
 * пишется services/mail/outbox.ts В ТРАНЗАКЦИИ действия, разбирает её
 * services/mail/worker.ts. status: 'pending' → 'sent' | 'failed'.
 * Постоянный отказ (5xx SMTP, негодный адрес) — сразу 'failed'; временный
 * (4xx, сеть, таймаут) — attempts+1 и next_attempt_at с растущей задержкой,
 * после последней попытки — 'failed'. Число 'pending' с прошедшим
 * next_attempt_at — единственный признак того, что работник отстал,
 * поэтому мёртвые письма в нём лежать не должны.
 * Тела письма (в них живая ссылка-довод) работник затирает при переходе в
 * 'sent' и 'failed' — иначе очередь выдавала бы то, что auth_tokens прячет
 * хэшем.
 * С пользователем строка НЕ связана намеренно: письмо — о совершённом
 * действии и переживает любую судьбу учётной записи.
 */
export const mailOutbox = pgTable(
  "mail_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    bodyHtml: text("body_html").notNull(),
    status: text("status", { enum: ["pending", "sent", "failed"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("idx_mail_outbox_status_next").on(t.status, t.nextAttemptAt)],
);

/* ──────────────────────── 2.32. recommendations ─────────────────────── */

/**
 * Разобранные строки подраздела «Таблица рекомендаций» критики (беседа 10.1,
 * миграция 0007_recommendations). Пишет только
 * server/services/recommendations.ts.
 *
 * `num` — строкой: развилка даёт «5а» / «5б». Номер НЕ уникален в раунде:
 * контракт таблицы велит рекомендацию о двух подразделах писать ДВУМЯ
 * строками с одним номером, поэтому ключ строки — её место в таблице
 * (`position`), а не номер (текст беседы требовал UNIQUE по num и тем самым
 * противоречил собственному шаблону).
 * `round_hash` — sha256 содержимого подраздела-таблицы на момент разбора:
 * повторный разбор того же текста раунд не открывает.
 * `source_hash` — sha256 адресата (содержимое подраздела + значение
 * элемента): беседа 10.2 отличает по нему устаревшую рекомендацию ('stale' —
 * текст изменился) от негодной ('invalid' — адрес не найден).
 * Синтез удаляется каскадом; строка users здесь не участвует —
 * account-deletion (7.1) удаляет синтезы, вопрос 9.1 о FK на users снят.
 */
export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    position: integer("position").notNull(),
    num: text("num").notNull(),
    addressSubsection: text("address_subsection").notNull().default(""),
    addressSection: text("address_section"),
    element: text("element"),
    elementKind: text("element_kind", {
      enum: ["category", "thesis", "glossary_term"],
    }),
    elementId: uuid("element_id"),
    op: text("op").notNull().default(""),
    replacement: text("replacement"),
    rationale: text("rationale").notNull().default(""),
    severity: text("severity").notNull().default(""),
    status: text("status", {
      enum: ["new", "planned", "done", "rejected", "invalid", "stale"],
    })
      .notNull()
      .default("new"),
    invalidReason: text("invalid_reason"),
    /** 12.3 (Д-21, миграция 0012): что сторож ЗАМЕТИЛ, но отказом не счёл —
     *  строка годна к исполнению (status не 'invalid'). Сейчас сюда пишется
     *  одно: столбец «Основание» называет подраздел, которого в критике нет.
     *  NULL — замечаний нет. Несколько замечаний — через «; » */
    warning: text("warning"),
    /** 12.3 (Д-46, миграция 0013): находки сторожа КОДАМИ —
     *  [{ level: 'invalid' | 'warning', code, params }]. Фраза человеку
     *  собирается при чтении на языке запроса; invalid_reason и warning
     *  хранят её русский вид (для SQL-диагностики и строк до 12.3).
     *  NULL — строка разобрана до 12.3: кодов нет, есть только текст */
    issues: jsonb("issues").$type<RecommendationIssue[]>(),
    sourceHash: text("source_hash"),
    roundHash: text("round_hash").notNull(),
    planId: uuid("plan_id").references(() => editPlans.id, {
      onDelete: "set null",
    }),
    stepIndex: integer("step_index"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_recommendations_round_position").on(
      t.synthesisId,
      t.round,
      t.position,
    ),
    index("idx_recommendations_round_num").on(t.synthesisId, t.round, t.num),
    index("idx_recommendations_status").on(t.synthesisId, t.status),
    check(
      "recommendations_status_check",
      sql`${t.status} IN ('new','planned','done','rejected','invalid','stale')`,
    ),
  ],
);

/* ──────────────────── 2.33. synthesis_members (16.1) ───────────────────── */

/**
 * Участники синтеза (беседа 16.1, миграция 0017; врезка «Фаза 16» в 07).
 * Круг — ТОЛЬКО приглашённые владельцем (решение пользователя 2026-11-05):
 * рецензентов «с улицы» нет. Роль editor заводится сразу, её права
 * действуют с Фазы 17 (в 16.1 edit = владелец). status 'invited' — строка
 * приглашения до принятия (приглашения — 16.2), 'active' — участие
 * действует: участник читает концепцию на любой ступени видимости и
 * обсуждает её. Владелец — не строка таблицы, а syntheses.user_id.
 * Одна строка на пару (synthesis_id, user_id). user_id — CASCADE; 7.1
 * анонимизирует users вместо удаления, поэтому account-deletion снимает
 * участие явно (урок 8.1/9.1).
 */
export const synthesisMembers = pgTable(
  "synthesis_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["reviewer", "editor"] }).notNull(),
    status: text("status", { enum: ["invited", "active"] })
      .notNull()
      .default("invited"),
    /** Кто пригласил (владелец); SET NULL — след участия переживает актора */
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    /** Когда участие стало действующим (принятие приглашения — 16.2) */
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_synthesis_members_pair").on(t.synthesisId, t.userId),
    index("idx_synthesis_members_user").on(t.userId),
    check("synthesis_members_role_check", sql`${t.role} IN ('reviewer','editor')`),
    check("synthesis_members_status_check", sql`${t.status} IN ('invited','active')`),
  ],
);

/* ───────────────────────── 2.34. comments (16.1) ───────────────────────── */

/**
 * Комментарии к объектам концепции (беседа 16.1, миграция 0017). Обсуждение
 * документ НЕ меняет. Адрес — устойчивый (`DiscussionAddress`: вид + ключ +
 * id + хэш содержимого + версия элемента), рядом — address_kind/address_key
 * колонками для отбора и сводки, и выдержка объекта «как было» (обычный
 * текст ≤ ADDRESS_EXCERPT_MAX). Состояние адреса (current/outdated/deleted)
 * вычисляется при чтении и не хранится. Ветка плоская: parent_id — всегда
 * корень; статус ветки живёт у корня (у ответов 'open'). Скрытие владельцем
 * (status 'hidden') и удаление автором (deleted_at, body = '') — не удаление
 * строки: пометка видна, ветка не рвётся. body — ОБЫЧНЫЙ ТЕКСТ без HTML
 * (нового входа разметки после 13.1 не открывается; клиент экранирует).
 * author_id — SET NULL на случай физического удаления строки users; штатно
 * (7.1) строка анонимизируется, и автор показывается как «удалённый
 * пользователь» по признаку анонимизации. Удаление синтеза — CASCADE.
 */
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    /** Полный адрес (shared DiscussionAddress) на момент записи */
    address: jsonb("address").$type<DiscussionAddress>().notNull(),
    /** Дубли полей адреса колонками — отбор по адресу и сводка */
    addressKind: text("address_kind").notNull(),
    addressKey: text("address_key").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    /** Корень ветки; null — сам корень. CASCADE: ответы уходят с корнем
     *  (строка корня при удалении автором не удаляется — см. deleted_at) */
    parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["question", "objection", "source", "unclear"] }),
    body: text("body").notNull(),
    status: text("status", { enum: ["open", "resolved", "hidden"] })
      .notNull()
      .default("open"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** Скрыт владельцем — кем и когда (status = 'hidden') */
    hiddenBy: uuid("hidden_by").references(() => users.id, { onDelete: "set null" }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    /** Удалён автором: тело стёрто, строка остаётся заглушкой, пока есть
     *  ответы (без ответов в списках не показывается) */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_comments_synthesis_created").on(t.synthesisId, t.createdAt),
    index("idx_comments_address").on(t.synthesisId, t.addressKind, t.addressKey),
    index("idx_comments_parent").on(t.parentId),
    index("idx_comments_author").on(t.authorId),
    check("comments_status_check", sql`${t.status} IN ('open','resolved','hidden')`),
    check(
      "comments_kind_check",
      sql`${t.kind} IS NULL OR ${t.kind} IN ('question','objection','source','unclear')`,
    ),
  ],
);

/* ────────────────────────── 2.35. reviews (16.1) ───────────────────────── */

/**
 * Рецензии (беседа 16.1, миграция 0017). Семь текстовых полей — обычный
 * текст; версия документа (четыре числа version_*) — к какой редакции
 * концепции писалась; status: draft (виден только автору) → published →
 * withdrawn (остаётся видимой с пометкой). Правка опубликованной — новая
 * редакция в review_revisions (прежняя сохраняется); revision — номер
 * текущей (0 — ещё не публиковалась). Замечания — review_findings.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    versionBase: integer("version_base").notNull().default(1),
    versionSub: integer("version_sub").notNull().default(0),
    versionModes: integer("version_modes").notNull().default(0),
    versionModeRegen: integer("version_mode_regen").notNull().default(0),
    title: text("title").notNull().default(""),
    summary: text("summary").notNull().default(""),
    strengths: text("strengths").notNull().default(""),
    objections: text("objections").notNull().default(""),
    minor: text("minor").notNull().default(""),
    questions: text("questions").notNull().default(""),
    conclusion: text("conclusion").notNull().default(""),
    status: text("status", { enum: ["draft", "published", "withdrawn"] })
      .notNull()
      .default("draft"),
    revision: integer("revision").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_reviews_synthesis").on(t.synthesisId, t.status),
    index("idx_reviews_author").on(t.authorId),
    check("reviews_status_check", sql`${t.status} IN ('draft','published','withdrawn')`),
  ],
);

/* ─────────────────────── 2.36. review_revisions (16.1) ─────────────────── */

/** Редакции опубликованной рецензии: снимок полей, версии документа и
 *  замечаний на момент публикации/правки. UNIQUE(review_id, revision). */
export const reviewRevisions = pgTable(
  "review_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    docVersion: jsonb("doc_version").$type<ReviewDocVersion>().notNull(),
    fields: jsonb("fields").$type<ReviewFields>().notNull(),
    findings: jsonb("findings")
      .$type<Omit<ReviewFinding, "resolution">[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uq_review_revisions_review_revision").on(t.reviewId, t.revision)],
);

/* ──────────────────────── 2.37. review_findings (16.1) ─────────────────── */

/** Замечания рецензии — адрес (как у комментария), выдержка, текст, вид.
 *  synthesis_id дублируется для сводки по адресам одним запросом. */
export const reviewFindings = pgTable(
  "review_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    address: jsonb("address").$type<DiscussionAddress>().notNull(),
    addressKind: text("address_kind").notNull(),
    addressKey: text("address_key").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    body: text("body").notNull(),
    kind: text("kind", { enum: ["question", "objection", "source", "unclear"] }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_review_findings_review").on(t.reviewId, t.position),
    index("idx_review_findings_address").on(t.synthesisId, t.addressKind, t.addressKey),
    check(
      "review_findings_kind_check",
      sql`${t.kind} IS NULL OR ${t.kind} IN ('question','objection','source','unclear')`,
    ),
  ],
);

/* ───────────────────── 2.38. notifications (16.2) ───────────────────── */

/**
 * Уведомления в приложении (беседа 16.2; 02 §2.38). Строка — КОД события
 * (`type`) + ссылки (синтез, актор, адрес, объект) + параметры (`payload`);
 * фразу собирает читатель на своём языке (клиент — `tl()`, сводка по почте —
 * под языком получателя). Получатель — `user_id`; актор события строки себе
 * не получает. Отключённая в профиле категория не пишется вовсе.
 * `dedupe_key` — уникальность повторяющихся событий (`finding_outdated`:
 * объект + хэш — одно уведомление на одну смену содержимого).
 * CASCADE по синтезу: удалённая концепция уносит свои уведомления; по
 * пользователю при анонимизации 7.1 не срабатывает — account-deletion
 * снимает явно.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: [
        "member_invited",
        "member_accepted",
        "member_declined",
        "member_role_changed",
        "member_removed",
        "comment_new",
        "comment_reply",
        "review_published",
        "finding_outdated",
        "proposal_created",
        "proposal_decided",
      ],
    }).notNull(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    /** Кто совершил событие; SET NULL — след переживает актора */
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** Адрес обсуждения (комментарий, замечание); у событий участия — NULL */
    address: jsonb("address").$type<DiscussionAddress>(),
    /** На что ссылается: member | comment | review | finding | proposal */
    refKind: text("ref_kind", { enum: ["member", "comment", "review", "finding", "proposal"] }),
    refId: uuid("ref_id"),
    payload: jsonb("payload").$type<NotificationPayload>().notNull().default({}),
    /** Ключ дедупликации повторяющихся событий; NULL — без неё */
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    /** Вошло в сводку по почте (работник ставит; непрочитанное после — в
     *  следующую сводку не попадает) */
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_notifications_user_created").on(t.userId, t.createdAt),
    index("idx_notifications_user_unread").on(t.userId).where(sql`${t.readAt} IS NULL`),
    index("idx_notifications_synthesis").on(t.synthesisId),
    uniqueIndex("uq_notifications_dedupe").on(t.dedupeKey).where(sql`${t.dedupeKey} IS NOT NULL`),
    check(
      "notifications_type_check",
      sql`${t.type} IN ('member_invited','member_accepted','member_declined','member_role_changed','member_removed','comment_new','comment_reply','review_published','finding_outdated','proposal_created','proposal_decided')`,
    ),
    check(
      "notifications_ref_kind_check",
      sql`${t.refKind} IS NULL OR ${t.refKind} IN ('member','comment','review','finding','proposal')`,
    ),
  ],
);

/* ─────────────────── 2.39. notification_settings (16.2) ─────────────── */

/**
 * Настройки уведомлений пользователя (беседа 16.2; 02 §2.39): отключённые
 * категории (`NOTIFICATION_CATEGORIES`, shared) и сводка по почте. Строки
 * нет — всё включено. `digest_sent_at` — момент последней сводки: работник
 * шлёт следующую не раньше чем через NOTIFY_DIGEST_INTERVAL_HOURS и только
 * при непрочитанном, не вошедшем в прежние сводки.
 */
export const notificationSettings = pgTable("notification_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  mutedCategories: jsonb("muted_categories").$type<string[]>().notNull().default([]),
  emailDigest: boolean("email_digest").notNull().default(true),
  digestSentAt: timestamp("digest_sent_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ───────────────────────── 2.40. proposals (17.1) ───────────────────── */

/**
 * Предложения изменений (беседа 17.1; 02 §2.40, врезка «Фаза 17» в 07).
 * Предложение документ НЕ меняет: принять его значит собрать ЧЕРНОВИК плана
 * правок (`plan_id`) и исполнить его существующим исполнителем; статус
 * `accepted` ставит исполненный шаг. Адрес, выдержка и состояние — как у
 * комментариев 16.1 (вычисляется при чтении). Основа: у элемента — номер
 * версии (`base_version`), у раздела, подраздела, капсулы — хэш содержимого
 * (`base_hash`); «устарело» (основа ≠ текущему) НЕ хранится — вычисляется.
 * `source_id` — без FK: источник (комментарий, замечание рецензии, строка
 * рекомендаций) может исчезнуть, предложение остаётся.
 * CASCADE по синтезу; автор SET NULL (при анонимизации 7.1 строка users
 * остаётся — автор читается «удалённым пользователем», как в 16.1).
 */
export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    address: jsonb("address").$type<DiscussionAddress>().notNull(),
    addressKind: text("address_kind").notNull(),
    addressKey: text("address_key").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    /** Основа: { version, hash } на момент записи */
    base: jsonb("base").$type<ProposalBase>().notNull(),
    source: text("source", { enum: ["direct", "comment", "review_finding", "recommendation"] })
      .notNull()
      .default("direct"),
    sourceId: uuid("source_id"),
    /** Рецензия замечания-источника (source = review_finding) — снимок id */
    sourceReviewId: uuid("source_review_id"),
    kind: text("kind", { enum: ["replace", "note"] }).notNull(),
    /** replace у элемента: правимое поле */
    field: text("field"),
    /** replace: готовое значение поля / разметка содержимого подраздела */
    value: text("value"),
    rationale: text("rationale").notNull().default(""),
    status: text("status", { enum: ["open", "accepted", "rejected", "withdrawn", "closed"] })
      .notNull()
      .default("open"),
    /** Черновик плана, в котором предложение стоит («принимается») */
    planId: uuid("plan_id").references(() => editPlans.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** Слово решившего (отклонение, закрытие) — обычный текст */
    note: text("note").notNull().default(""),
    closeReason: text("close_reason", { enum: ["member_removed", "superseded", "outdated", "manual"] }),
    /** Новое предложение поверх текущего, заведённое взамен этого */
    supersededBy: uuid("superseded_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_proposals_synthesis_created").on(t.synthesisId, t.createdAt),
    index("idx_proposals_address").on(t.synthesisId, t.addressKind, t.addressKey),
    index("idx_proposals_author").on(t.authorId),
    index("idx_proposals_plan").on(t.planId),
    check("proposals_source_check", sql`${t.source} IN ('direct','comment','review_finding','recommendation')`),
    check("proposals_kind_check", sql`${t.kind} IN ('replace','note')`),
    check("proposals_status_check", sql`${t.status} IN ('open','accepted','rejected','withdrawn','closed')`),
    check(
      "proposals_close_reason_check",
      sql`${t.closeReason} IS NULL OR ${t.closeReason} IN ('member_removed','superseded','outdated','manual')`,
    ),
  ],
);

/* ────────────────────── 2.41. proposal_events (17.1) ────────────────── */

/**
 * Журнал событий предложения (беседа 17.1; 02 §2.41): кто и что с ним
 * сделал. Пишется той же транзакцией, что смена состояния. Фраза не
 * хранится (правило 14.2) — код `type` и параметры `payload`.
 */
export const proposalEvents = pgTable(
  "proposal_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    synthesisId: uuid("synthesis_id")
      .notNull()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type", {
      enum: ["created", "plan_drafted", "plan_released", "accepted", "rejected", "withdrawn", "closed", "rebased"],
    }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_proposal_events_proposal").on(t.proposalId, t.createdAt),
    check(
      "proposal_events_type_check",
      sql`${t.type} IN ('created','plan_drafted','plan_released','accepted','rejected','withdrawn','closed','rebased')`,
    ),
  ],
);

/* ────────────────────── 2.42. synthesis_search (18.1) ─────────────────── */

/**
 * Индекс поиска концепций (беседа 18.1; 02 §2.42; врезка «Фаза 18» в 07).
 * Одна строка на синтез; пишет ТОЛЬКО `reindexSynthesis`
 * (services/search-index.ts) — её зовут все писатели названия, зерна,
 * капсулы, категорий и терминов глоссария сразу после своей записи;
 * триггеров нет. Тезисы и тексты разделов в индекс НЕ входят.
 *
 * Четыре tsvector — по словарю языка генерации (`config`) плюс `simple`:
 * название, зерно, капсула (без разметки) и содержание целиком (капсула +
 * имена категорий + термины и определения глоссария). Капсула отдельно —
 * витрина ищется по ней, но не по категориям и терминам. Два текста — для
 * фрагмента выдачи (`ts_headline`) и запасного хода по триграммам.
 * tsvector и GIN drizzle-kit не знает — SQL миграции 0020 написан рукой.
 */
export const synthesisSearch = pgTable(
  "synthesis_search",
  {
    synthesisId: uuid("synthesis_id")
      .primaryKey()
      .references(() => syntheses.id, { onDelete: "cascade" }),
    /** Словарь документа: 'russian' | 'english' | 'german' | 'simple'
     *  (shared searchTsConfigFor по syntheses.lang) */
    config: text("config").notNull().default("simple"),
    titleTsv: tsvector("title_tsv").notNull(),
    seedTsv: tsvector("seed_tsv").notNull(),
    capsuleTsv: tsvector("capsule_tsv").notNull(),
    contentTsv: tsvector("content_tsv").notNull(),
    /** Капсула без разметки и без заголовка раздела */
    capsuleText: text("capsule_text").notNull().default(""),
    /** Имена категорий и «термин — определение», по строке на элемент */
    elementsText: text("elements_text").notNull().default(""),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_synthesis_search_title").using("gin", t.titleTsv),
    index("idx_synthesis_search_seed").using("gin", t.seedTsv),
    index("idx_synthesis_search_capsule").using("gin", t.capsuleTsv),
    index("idx_synthesis_search_content").using("gin", t.contentTsv),
    index("idx_synthesis_search_capsule_trgm").using(
      "gin",
      sql`${t.capsuleText} gin_trgm_ops`,
    ),
    index("idx_synthesis_search_elements_trgm").using(
      "gin",
      sql`${t.elementsText} gin_trgm_ops`,
    ),
    check(
      "synthesis_search_config_check",
      sql`${t.config} IN ('russian', 'english', 'german', 'simple')`,
    ),
  ],
);
