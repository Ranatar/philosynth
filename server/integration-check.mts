/**
 * Интеграционная проверка: рантайм-импорт каждого модуля shared и server,
 * присутствие всех ожидаемых экспортов, совместимость типов, async-цепочки.
 */
const errs: string[] = [];
const need = (mod: Record<string, unknown>, names: string[], label: string) => {
  for (const n of names) if (!(n in mod)) errs.push(`${label}: нет экспорта ${n}`);
};

// ── 1. Все value-модули shared: пути + имена экспортов ──
need(await import("@philosynth/shared/constants/philosophers"),
  ["PHILOSOPHER_EPOCHS", "PHILOSOPHERS", "PHILOSOPHER_COUNT", "isKnownPhilosopher"], "constants/philosophers");
need(await import("@philosynth/shared/constants/phil-filename"), ["PHIL_FILENAME"], "constants/phil-filename");
need(await import("@philosynth/shared/constants/labels"),
  ["ML", "DL", "SL", "REVERSE_ML", "REVERSE_DL", "REVERSE_SL"], "constants/labels");
need(await import("@philosynth/shared/constants/section-labels"),
  ["SECTION_KEYS", "KEY_LABELS", "isSectionKey", "SECTION_CHECKBOX_IDS", "SECTION_LABELS", "SEC_ID_TO_KEY"], "constants/section-labels");
need(await import("@philosynth/shared/constants/ctx-keys"),
  ["CTX_LABELS", "ALL_CTX_KEYS", "isCtxKey", "ctxKeySection"], "constants/ctx-keys");
need(await import("@philosynth/shared/constants/methods"),
  ["METHOD_CODE", "LEVEL_CODE", "ORDER_CODE", "DEPTH_CODE"], "constants/methods");
need(await import("@philosynth/shared/utils/cardinality"),
  ["participantCardinality", "participantWord", "participantWordSg", "hasConceptParticipants"], "utils/cardinality");
need(await import("@philosynth/shared/utils/version"),
  ["initialVersion", "parseVersion", "formatVersion", "formatVersionFilename"], "utils/version");
need(await import("@philosynth/shared/utils/transliterate"), ["transliterate"], "utils/transliterate");
need(await import("@philosynth/shared/utils/normalize"), ["normalizeName", "normalizeType"], "utils/normalize");
need(await import("@philosynth/shared/utils/escape"), ["esc"], "utils/escape");

// ── 2. Server-модули ──
need(await import("./db/schema.js"), [
  "users","sessions","syntheses","synthesisLineage","sections","categories","categoryEdges",
  "clusterLabels","theses","glossaryTerms","dialogueTurns","elementVersions","editPlans",
  "modeResults","generationLog","contextLog","promptTemplates","synthesisConfigs","apiKeys",
  "transactions","apiUsage","subscriptionPlans","userSubscriptions","categoryTypeCatalog",
  "relationshipTypeCatalog","elementEnrichments","characteristicJustifications","representationTransforms",
], "db/schema (28 таблиц)");
need(await import("./db/index.js"), ["db", "sql", "schema", "closeDb"], "db/index");
need(await import("./env.js"), ["env"], "env");
need(await import("./utils/text.js"), ["truncateText", "tableToText"], "utils/text");

// ── 2b. Модули беседы 0.2: auth, роуты, rate-limiter, WS, Redis ──
need(await import("./middleware/auth.js"), [
  "hashPassword","verifyPassword","generateSessionToken","sessionIdFromToken",
  "createSession","validateSessionToken","invalidateSession",
  "setSessionCookie","clearSessionCookie","getSessionToken",
  "requireAuth",
], "middleware/auth");
need(await import("./middleware/admin-only.js"), ["requireAdmin"], "middleware/admin-only");
need(await import("./routes/auth.js"), ["authRoutes"], "routes/auth");
need(await import("./middleware/rate-limiter.js"), ["rateLimiter"], "middleware/rate-limiter");
need(await import("./ws/connection-manager.js"), ["ConnectionManager", "connectionManager"], "ws/connection-manager");
need(await import("./ws/handler.js"), ["registerWebSocket"], "ws/handler");
need(await import("./redis.js"), ["redis", "connectRedis", "closeRedis"], "redis");

// ── 2c. Модули беседы 0.3: prompt-registry + config/* (seed-данные) ──
need(await import("./services/prompt-registry.js"), [
  "getTemplate","renderTemplate","getConfig","invalidateCache",
  "listVersions","activateVersion","listConfigVersions","warmCache",
  "RegistryNotFoundError","TemplateRenderError",
], "services/prompt-registry");
need(await import("./config/context-deps.js"), [
  "CONTEXT_DEPS_BASE","CONTEXT_DEPS_GENETIC","CONTEXT_DEPS_LEVEL",
  "CONTEXT_DEPS_LEVEL_GENETIC","CONTEXT_DEPS_METHOD",
], "config/context-deps");
need(await import("./config/substitution-map.js"),
  ["SUBSTITUTION_MAP","SUBSTITUTION_MAP_GENETIC"], "config/substitution-map");
need(await import("./config/compat-matrix.js"),
  ["COMPAT_MATRIX_COMPACT","COMPAT_SEC_LABELS"], "config/compat-matrix");
need(await import("./config/intra-deps.js"), ["INTRA_DEPS"], "config/intra-deps");
need(await import("./config/subsection-ctx-keys.js"),
  ["SUBSECTION_TO_CTX_KEYS"], "config/subsection-ctx-keys");
need(await import("./config/topology-roles.js"),
  ["TOPOLOGY_ROLES_PROCEDURAL"], "config/topology-roles");
need(await import("./config/fragment-share.js"),
  ["FRAGMENT_SHARE","CONTEXT_BUDGET"], "config/fragment-share");
need(await import("./config/extra-types.js"),
  ["EXTRA_CATEGORY_TYPES","EXTRA_EDGE_TYPES","SYNTH_LEVEL_TYPE_PHRASING","buildExtraTypesBlock"],
  "config/extra-types");
need(await import("./config/parent-deps.js"), [
  "PARENT_FIELD_ORDER","PARENT_FIELD_LABELS","PARENT_DEPS_BASE","PARENT_DEPS_GENETIC",
  "PARENT_DEPS_LEVEL","PARENT_DEPS_LEVEL_GENETIC","PARENT_DEPS_METHOD","PARENT_INTRA_DEPS",
  "PARENT_CONTEXT_SCHEMA_ID","PARENT_CONTEXT_SCHEMA_VERSION",
], "config/parent-deps");
need(await import("./config/cardinality-prompts.js"),
  ["MD_BY_CARD","SD_BY_CARD"], "config/cardinality-prompts");
need(await import("./config/mode-deps.js"), ["MODE_DEPS"], "config/mode-deps");
need(await import("./config/prompt-templates.js"),
  ["SEED_PROMPT_TEMPLATES"], "config/prompt-templates");

// ── 2d. Модули беседы 0.3b: element-taxonomy ──
need(await import("./services/element-taxonomy.js"), [
  "getCategoryTypes","getRelationshipTypes","normalizeType","createCustomType",
  "invalidateTaxonomyCache","TaxonomyValidationError",
], "services/element-taxonomy");

// ── 2f. Модули беседы 1.1: engine, topo-sort, advisor, estimator ──
need(await import("./utils/deep-merge.js"), ["deepMergeUniq"], "utils/deep-merge");
need(await import("./utils/topo-sort.js"), [
  "sourceOf","getSubstituteQuality","SECTION_TOPO_ORDER_ARCHITECTURAL",
  "SECTION_TOPO_ORDER_GENETIC","computePredecessors","topologicalSort",
  "buildDynamicOrder","resolveCircularDeps","findOneCycle","getEdgeQuality","removeEdge",
], "utils/topo-sort");
need(await import("./services/synthesis-engine.js"), [
  "resolveContextDeps","buildEffectiveDeps","buildEffectiveDepsWith",
  "findSubstitute","getActiveSubstitutionMap",
  // реэкспорты по составу протокола 07 (беседа 1.1, п. 1):
  "deepMergeUniq","sourceOf","getSubstituteQuality",
], "services/synthesis-engine");
need(await import("./services/compat-advisor.js"), [
  "SEC_GROUP","METHOD_SYNERGY_PEAKS","BASE_SECTION_RATING",
  "computeSectionRating","computeSections","getCompatEntry","getCompatEntryByKey",
  "chipClassForRating","iconForSeverity","titleForSeverity",
  "computeSectionWarnings","computeSectionAdvice",
], "services/compat-advisor");
need(await import("./services/cost-estimator.js"), [
  "CHARS_PER_TOKEN","PRICE_IN","PRICE_OUT","HTML_OVERHEAD","OUTPUT_MULTIPLIER",
  "WORDS_TO_CHARS","SECTION_OUTPUT_MULT","mw",
  "estimateCost","estimateSubsectionCost","estimateModeCost",
], "services/cost-estimator");
// Реэкспорты engine — те же самые функции, не дубликаты
{
  const eng11 = await import("./services/synthesis-engine.js");
  const dm11 = await import("./utils/deep-merge.js");
  const ts11 = await import("./utils/topo-sort.js");
  if (!Object.is(eng11.deepMergeUniq, dm11.deepMergeUniq))
    errs.push("2f: engine.deepMergeUniq ≠ utils/deep-merge.deepMergeUniq (дубликат?)");
  if (!Object.is(eng11.sourceOf, ts11.sourceOf) ||
      !Object.is(eng11.getSubstituteQuality, ts11.getSubstituteQuality))
    errs.push("2f: реэкспорты engine из topo-sort не тождественны оригиналам");
}

// ── 2g. Модули беседы 1.2: prompt-builder, section-defs-builder, seed-конфиги ──
need(await import("./services/prompt-builder.js"), [
  "buildSYS","baseCtx","baseCtxStatic","baseCtxParents","setParentContextProvider",
  "philNames","conceptNames","participantsForPrompt","eachParticipant","hasNoParticipants",
  "mdText","sdText","buildQualityReinforcement","getStopSignal","STOP_SIGNAL_TEMPLATE_KEY",
  "buildExtraTypesBlock","extraTypesBlockFrom","participantVars",
  // реэкспорты кардинальности (те же функции shared):
  "participantCardinality","participantWord","participantWordSg","hasConceptParticipants",
], "services/prompt-builder");
need(await import("./services/section-defs-builder.js"), [
  "buildSectionDefs","serializeParts","groupPasses","patchPromptsWithSecCtx",
  "parseGlossarySubsections","SUBSECTION_SUM_PORTRAIT","buildSubsectionMap","SEC_NAMES",
], "services/section-defs-builder");
need(await import("./config/section-templates.js"), ["SEED_SECTION_TEMPLATES"], "config/section-templates");
need(await import("./config/subsection-map.js"), [
  "SUBSECTION_MAP_BASE","SUBSECTION_MAP_GLOSSARY",
  "SUBSECTION_CRITIQUE_NOVELTY","SUBSECTION_CRITIQUE_CHECK","SUM_PORTRAIT_VARIANTS",
], "config/subsection-map");
{
  // Реэкспорты кардинальности — те же функции shared, не дубликаты
  const pb12 = await import("./services/prompt-builder.js");
  const card12 = await import("@philosynth/shared/utils/cardinality");
  if (!Object.is(pb12.participantCardinality, card12.participantCardinality) ||
      !Object.is(pb12.hasConceptParticipants, card12.hasConceptParticipants))
    errs.push("2g: реэкспорты кардинальности prompt-builder не тождественны shared");
  // SEC_NAMES ⊂ KEY_LABELS (беседа 1.2: значения обязаны совпадать)
  const sdb12 = await import("./services/section-defs-builder.js");
  const { KEY_LABELS: kl12 } = await import("@philosynth/shared/constants/section-labels");
  for (const [k, v] of Object.entries(sdb12.SEC_NAMES))
    if ((kl12 as Record<string, string>)[k] !== v)
      errs.push(`2g: SEC_NAMES.${k}=«${v}» ≠ KEY_LABELS.${k}=«${(kl12 as Record<string, string>)[k]}»`);
  // 146 section-шаблонов, ключи уникальны и с префиксом section.
  const st12 = (await import("./config/section-templates.js")).SEED_SECTION_TEMPLATES;
  const keys12 = st12.map((t) => t.key);
  if (st12.length !== 146 || new Set(keys12).size !== st12.length ||
      !keys12.every((k) => k.startsWith("section.")))
    errs.push(`2g: SEED_SECTION_TEMPLATES: ${st12.length} шт., ожидали 146 уникальных section.*`);
}

// ── 2h. Модули беседы 1.3: context-builder, context-extractor, parent-context, html-parser ──
need(await import("./services/context-builder.js"), [
  "buildContextForSection","applyBudgetPressure","parentOverheadForSection",
  "computeConceptOverhead","extractIntraSectionContext","extractRelevantIntraSectionContext",
], "services/context-builder");
need(await import("./services/context-extractor.js"), [
  "createDbContextSource","extractContextFragment","extractGraphNodesTable",
  "extractGraphNodesCompact","extractGraphEdges","extractGlossaryTable","extractThesesSummary",
  "extractSummaryGoals","extractSummaryTensions","extractSection","extractCapsuleText",
  "extractNameTitle","extractIntraSectionContext","extractSubsectionContent","extractAllTablesAsText",
], "services/context-extractor");
need(await import("./services/parent-context.js"), [
  "resolveParentDeps","resolveParentDepsForSubsection","resolveParentSpec",
  "parentFieldsUsedFor","buildParentSpecForLog","validateParentDeps",
  "isConceptParticipant","parentFieldValue","normalizeSectionKey",
  "getParentFieldOrder","getParentFieldLabels",
], "services/parent-context");
need(await import("./utils/html-parser.js"), [
  "parseFragment","innerText","innerTextTrimmed",
], "utils/html-parser");
{
  // Реэкспорт extractIntraSectionContext из context-builder (карта 04 §2.1) —
  // ТА ЖЕ функция, что реализована в context-extractor, а не копия.
  const cb2h = await import("./services/context-builder.js");
  const cx2h = await import("./services/context-extractor.js");
  if (!Object.is(cb2h.extractIntraSectionContext, cx2h.extractIntraSectionContext))
    errs.push("2h: реэкспорт extractIntraSectionContext не тождествен реализации");
  // Диспетчер обязан покрывать ВСЕ ключи CTX_LABELS (перечень v11 выводится
  // из него); capsule:full обрабатывается до switch — как в исходнике [8153].
  const cxSrc2h = readFileSync(new URL("./services/context-extractor.ts", import.meta.url), "utf8");
  const { ALL_CTX_KEYS: ack2h } = await import("@philosynth/shared/constants/ctx-keys");
  const missing2h = ack2h.filter(
    (k) => k !== "capsule:full" && !cxSrc2h.includes(`case "${k}":`),
  );
  if (missing2h.length)
    errs.push(`2h: extractContextFragment не покрывает ключи: ${missing2h.join(", ")}`);
  if (!/if \(contextKey === "capsule:full"\)/.test(cxSrc2h))
    errs.push("2h: capsule:full должен обрабатываться ДО гейта наличия раздела");
}

// ── 2i. Модули беседы 1.4: streaming-manager, generation-service, graph-parser,
//        element-parser, ws/stream-state, routes/syntheses ──
need(await import("./services/streaming-manager.js"), [
  "streamSection","classifyStreamError","pauseFriendlyMessage","StreamError",
  "getStreamState","clearStreamState",
], "services/streaming-manager");
need(await import("./services/generation-service.js"), [
  "generateSynthesis","cancelGeneration","isGenerationActive","assertCanStartGeneration",
  "registerParentContextProvider","parseSubsectionsFromHTML","buildPromptSkeleton",
  "extractTitleFromNameHtml","computeFullConceptBlockSizes","buildParentSpecBySection",
  "GenerationError",
], "services/generation-service");
need(await import("./services/graph-parser.js"), [
  "parseGraphFromHTML","parseGraphFromElement","parseTopology","saveGraphToDb","hasGraph",
], "services/graph-parser");
need(await import("./services/element-parser.js"), [
  "parseThesesFromHTML","parseGlossaryFromHTML","saveElementsToDb",
], "services/element-parser");
need(await import("./ws/stream-state.js"), [
  "saveStreamState","getStreamState","clearStreamState",
], "ws/stream-state");
need(await import("./routes/syntheses.js"), ["synthesesRoutes"], "routes/syntheses");
{
  // Реэкспорты stream-state из streaming-manager (07: get/clearStreamState
  // числятся в streaming-manager) — ТЕ ЖЕ функции, не копии.
  const sm2i = await import("./services/streaming-manager.js");
  const ss2i = await import("./ws/stream-state.js");
  if (!Object.is(sm2i.getStreamState, ss2i.getStreamState) ||
      !Object.is(sm2i.clearStreamState, ss2i.clearStreamState))
    errs.push("2i: реэкспорты get/clearStreamState не тождественны реализации ws/stream-state");
}

// ── 2j. Модули беседы 1.4b: pause-resume-service, порты в section-defs-builder
//        и html-parser, клиентская модалка паузы ──
{
  need(await import("./services/pause-resume-service.js"), [
    "logPauseEvent", "createPausedState", "computePauseEstimates",
    "resumeGeneration", "resumePlan", "setPlanResumeExecutor", "PauseResumeError",
  ], "services/pause-resume-service");
  need(await import("./services/section-defs-builder.js"),
    ["serializeSubsectionRegen", "extractPreambleConstraints"],
    "section-defs-builder (порты [10654]/[10727], 1.4b)");
  need(await import("./utils/html-parser.js"),
    ["spliceSubsectionHtml", "removeSubsectionHtml"],
    "html-parser (врезка подраздела, 1.4b)");
  // Клиентский PauseModal — в 4l (clientModule объявляется ниже, в блоке 0.4)
  // Разъёмы generation-service, добавленные 1.4b
  need(await import("./services/generation-service.js"), [
    "withGenerationSlot", "runGenerationPasses", "resumeSynthesisFromPass",
    "loadSynthesis", "finalizeRun", "setPauseEstimatesProvider",
  ], "generation-service (экспорты 1.4b)");
}

// ── 3. Типовые (compile-time) модули: сам факт импорта проверяет пути ──
import type { SynthesisFull, PausedState } from "@philosynth/shared/types/synthesis";
import type { SectionFull } from "@philosynth/shared/types/section";
import type { Category } from "@philosynth/shared/types/graph";
import type { Thesis, RepresentationTransform, CategoryType } from "@philosynth/shared/types/elements";
import type { LineageNode } from "@philosynth/shared/types/lineage";
import type { EditPlan } from "@philosynth/shared/types/edit-plan";
import type { GenLogEntry } from "@philosynth/shared/types/generation";
import type { ModeResult } from "@philosynth/shared/types/modes";
import type { Transaction } from "@philosynth/shared/types/billing";
import type { PromptTemplate } from "@philosynth/shared/types/prompts";
import type { WsClientMessage, WsServerMessage } from "@philosynth/shared/types/ws-messages";

// ── 4. Совместимость типов между слоями (компилятор — судья) ──
import { schema } from "./db/index.js";
import { participantCardinality } from "@philosynth/shared/utils/cardinality";
import { formatVersionFilename, parseVersion } from "@philosynth/shared/utils/version";
import { METHOD_CODE, LEVEL_CODE, ORDER_CODE, DEPTH_CODE } from "@philosynth/shared/constants/methods";
import { ML } from "@philosynth/shared/constants/labels";

type SynthRow = typeof schema.syntheses.$inferSelect;
// метод из строки БД индексирует и ML, и METHOD_CODE (union-совместимость)
const _t1 = (r: SynthRow) => ML[r.method] + METHOD_CODE[r.method] + LEVEL_CODE[r.synthLevel] + ORDER_CODE[r.generationOrder] + DEPTH_CODE[r.depth];
// pausedState строки БД присвоим shared-типу и обратно
const _t2 = (r: SynthRow): PausedState | null => r.pausedState;
// SynthesisParams.philosophers совместим с CardinalityParams.phil
import type { SynthesisParams } from "@philosynth/shared/types/synthesis";
const _t3 = (p: SynthesisParams) => participantCardinality({ phil: p.philosophers, participants: p.participants });
// version: числовые колонки строки → DocVersion → имя файла
const _t4 = (r: SynthRow) => formatVersionFilename({ base: r.versionBase, sub: r.versionSub, modes: r.versionModes, modeRegen: r.versionModeRegen });
void _t1; void _t2; void _t3; void _t4;

// ── 4b. Кросс-слойные совместимости беседы 0.2 ──
import { connectionManager, type ConnectionManager } from "./ws/connection-manager.js";
import type { SessionInfo, AuthUser } from "./middleware/auth.js";
import type { MiddlewareHandler } from "hono";
import { rateLimiter } from "./middleware/rate-limiter.js";
// строка sessions из БД присваивается SessionInfo (auth ↔ schema)
const _t5 = (s: typeof schema.sessions.$inferSelect): SessionInfo => s;
// role строки users сужается до union AuthUser (enum-колонка ↔ тип)
const _t6 = (u: typeof schema.users.$inferSelect): AuthUser["role"] => u.role;
// send/sendToUser принимают ровно WsServerMessage (ws ↔ shared/types)
const _t7 = (m: WsServerMessage): Parameters<ConnectionManager["send"]>[1] => m;
const _t8 = (m: WsServerMessage): Parameters<ConnectionManager["sendToUser"]>[1] => m;
// rateLimiter() — валидный Hono-middleware
const _t9: MiddlewareHandler = rateLimiter();
void _t5; void _t6; void _t7; void _t8; void _t9; void connectionManager;

// ── 4c. Кросс-слойные совместимости беседы 0.3 ──
import type { SynthesisConfigKey, PromptVersion } from "@philosynth/shared/types/prompts";
import type { SeedPromptTemplate } from "./config/prompt-templates.js";
import { SEED_PROMPT_TEMPLATES } from "./config/prompt-templates.js";
import { listVersions as _lv, getConfig as _gc } from "./services/prompt-registry.js";
// сеемый шаблон присваивается insert-типу строки prompt_templates
const _t10 = (t: SeedPromptTemplate): typeof schema.promptTemplates.$inferInsert =>
  ({ key: t.key, body: t.body, description: t.description });
// известные v11-ключи принимаются SynthesisConfigKey (union из shared)
const _t11: SynthesisConfigKey[] = [
  "context_deps.base", "parent_deps.method", "md_by_card", "sd_by_card", "mode_deps",
];
// listVersions возвращает ровно shared PromptVersion[]
const _t12: (k: string) => Promise<PromptVersion[]> = _lv;
// getConfig типизируется вызывающим (generic)
const _t13: Promise<Record<string, { required?: string[]; optional?: string[] }>> =
  Promise.resolve({}) as ReturnType<typeof _gc<Record<string, { required?: string[]; optional?: string[] }>>>;
void _t10; void _t11; void _t12; void _t13; void SEED_PROMPT_TEMPLATES;

// ── 4d. Кросс-слойные совместимости беседы 0.3b ──
import type { RelationshipType, TypeMatch } from "@philosynth/shared/types/elements";
import {
  normalizeType as txNormalize, createCustomType as txCreate,
  type NormalizeResult, type TaxonomyKind,
} from "./services/element-taxonomy.js";
// сеемая форма записи присваивается insert-типам строк обоих каталогов
const _t14: typeof schema.categoryTypeCatalog.$inferInsert =
  { key: "k", nameRu: "К", description: "", isSystem: true };
const _t15: typeof schema.relationshipTypeCatalog.$inferInsert =
  { key: "k", nameRu: "К", description: "", isSystem: true, defaultDirection: "bidirectional" };
// normalizeType возвращает ровно { match: TypeMatch|null, suggestions: TypeMatch[] } (03-spec §2.13)
const _t16: (t: string, k: TaxonomyKind) => Promise<NormalizeResult> = txNormalize;
const _t17 = (r: NormalizeResult): [TypeMatch | null, TypeMatch[]] => [r.match, r.suggestions];
// RelationshipType расширяет CategoryType (shared) — результат createCustomType сужается
const _t18 = (r: RelationshipType): CategoryType => r;
const _t19: ReturnType<typeof txCreate> extends Promise<CategoryType | RelationshipType> ? true : never = true;
void _t14; void _t15; void _t16; void _t17; void _t18; void _t19;

// ── 5b. Async-цепочки auth против живой БД (до закрытия пула) ──
import {
  createSession, hashPassword, invalidateSession, validateSessionToken, verifyPassword,
} from "./middleware/auth.js";
import { eq } from "drizzle-orm";
{
  const hash = await hashPassword("integration-check-pw");
  if (!(await verifyPassword("integration-check-pw", hash))) errs.push("verifyPassword: не подтвердил свой хэш");
  if (await verifyPassword("wrong", hash)) errs.push("verifyPassword: принял неверный пароль");

  const [tmp] = await db.insert(schema.users)
    .values({ email: `itest-${Date.now()}@check.local`, passwordHash: hash })
    .returning({ id: schema.users.id });
  const { token, session } = await createSession(tmp!.id);
  if (session.id === token) errs.push("createSession: в БД ушёл сырой токен, а не хэш");
  const valid = await validateSessionToken(token);
  if (valid?.user.id !== tmp!.id) errs.push("validateSessionToken: не нашёл живую сессию");
  // истечение → null + самоподчистка строки
  await db.update(schema.sessions)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(schema.sessions.id, session.id));
  if ((await validateSessionToken(token)) !== null) errs.push("validateSessionToken: принял истёкшую сессию");
  const leftover = await db.query.sessions.findMany({ where: (s, { eq: eq2 }) => eq2(s.id, session.id) });
  if (leftover.length !== 0) errs.push("validateSessionToken: истёкшая сессия не удалена");
  await invalidateSession(session.id); // идемпотентность на отсутствующей строке
  await db.delete(schema.users).where(eq(schema.users.id, tmp!.id)); // cleanup
}

// ── 5c. Async-цепочки Prompt Registry против живой БД+Redis (до закрытия пула) ──
import {
  getTemplate as rGetTemplate, renderTemplate as rRender, getConfig as rGetConfig,
  invalidateCache as rInvalidate, RegistryNotFoundError as RNF,
} from "./services/prompt-registry.js";
import { connectRedis as rConnect, closeRedis as rClose, redis as rRedis } from "./redis.js";
{
  const redisUp = await rConnect();
  const seeded = await db.$count(schema.promptTemplates);
  if (seeded === 0) {
    errs.push("prompt_templates пуста — прогоните npm run seed:prompts перед check:integration");
  } else {
    const sys = await rGetTemplate("system");
    if (!sys.includes("{{output_mode_instruction}}")) errs.push("getTemplate(system): нет плейсхолдера output_mode_instruction");
    const rendered = await rRender("method.dialectical.sum", {
      participants: "Кант, Гегель", participant_word: "философов",
      participant_word_sg: "философа", each_participant: "каждого из философов",
    });
    if (/\{\{/.test(rendered)) errs.push("renderTemplate: остались незакрытые плейсхолдеры");
    const deps = await rGetConfig<Record<string, { required?: unknown }>>("context_deps.base");
    if (!deps.graph || !Array.isArray(deps.graph.required)) errs.push("getConfig(context_deps.base): нет graph.required[]");
    try { await rGetTemplate("no.such.key.integration"); errs.push("getTemplate(несуществующий): не бросил ошибку"); }
    catch (e) { if (!(e instanceof RNF)) errs.push("getTemplate(несуществующий): не RegistryNotFoundError"); }
    if (redisUp) {
      await rInvalidate("system");
      if (await rRedis.exists("prompt_cache:system")) errs.push("invalidateCache: ключ prompt_cache:system не удалён");
      await rGetTemplate("system");
      if (!(await rRedis.exists("prompt_cache:system"))) errs.push("getTemplate: кэш не прогрелся после инвалидации");
    }
  }
  // NB: rClose здесь НЕ вызываем — соединение переиспользует секция 5d
  // (connect() сразу после quit() в ioredis гонится со статусом сокета).
}

// ── 5d. Async-цепочки Element Taxonomy против живой БД+Redis (до закрытия пула) ──
import {
  getCategoryTypes as txCats, getRelationshipTypes as txRels,
  invalidateTaxonomyCache as txInvalidate, TaxonomyValidationError as TVE,
} from "./services/element-taxonomy.js";
{
  const redisUp = rRedis.status === "ready" || (await rConnect());
  const sysCats = await db.$count(schema.categoryTypeCatalog, eq(schema.categoryTypeCatalog.isSystem, true));
  const sysRels = await db.$count(schema.relationshipTypeCatalog, eq(schema.relationshipTypeCatalog.isSystem, true));
  if (sysCats === 0 || sysRels === 0) {
    errs.push("каталоги типов пусты — прогоните npm run seed:taxonomy перед check:integration");
  } else {
    if (sysCats !== 18) errs.push(`category_type_catalog: системных ${sysCats}, ожидалось 18`);
    if (sysRels !== 29) errs.push(`relationship_type_catalog: системных ${sysRels}, ожидалось 29`);
    const cats = await txCats();
    if (cats.length < 18 || !cats[0]?.isSystem) errs.push("getCategoryTypes: <18 типов или системные не первыми");
    const m1 = await txNormalize("диалектическая", "relationship");
    if (m1.match?.key !== "dialectical") errs.push(`normalizeType(диалектическая): match=${m1.match?.key ?? "null"}, ожидался dialectical`);
    const m2 = await txNormalize("странный_тип_42", "category");
    if (m2.match !== null || m2.suggestions.length === 0) errs.push("normalizeType(странный_тип_42): ожидался match=null + suggestions");
    try { await txCreate("Bad-Key!", "Плохой", "", "relationship", "00000000-0000-0000-0000-000000000000"); errs.push("createCustomType(невалидный ключ): не бросил ошибку"); }
    catch (e) { if (!(e instanceof TVE)) errs.push("createCustomType(невалидный ключ): не TaxonomyValidationError"); }
    if (redisUp) {
      await txInvalidate("relationship");
      if (await rRedis.exists("taxonomy_cache:relationship_types")) errs.push("invalidateTaxonomyCache: ключ не удалён");
      await txRels();
      if (!(await rRedis.exists("taxonomy_cache:relationship_types"))) errs.push("getRelationshipTypes: кэш не прогрелся после инвалидации");
    }
  }
  await rClose();
}

// ── 2e. Модули беседы 0.4: клиент (tsx транспилирует и .tsx) ──
// Импортируется всё, что не тянет CSS (main.tsx с globals.css — исключение).
// Импорты — через путь-переменную: клиентские файлы живут в bundler-мире
// (client/tsconfig: jsx, DOM, bundler-резолюция) и НЕ типочекаются
// NodeNext-конфигом checks (их проверяет tsc -b client); tsx резолвит в рантайме.
const clientModule = (p: string): Promise<Record<string, unknown>> =>
  import(p) as Promise<Record<string, unknown>>;
need(await clientModule("../client/src/api/client.ts"), [
  "api","apiGet","apiPost","apiPatch","apiDelete","ApiError","setUnauthorizedHandler",
], "client/api/client");
need(await clientModule("../client/src/stores/auth-store.ts"), ["useAuthStore"], "client/stores/auth-store");
need(await clientModule("../client/src/hooks/useWebSocket.ts"), ["useWebSocket"], "client/hooks/useWebSocket");
need(await clientModule("../client/src/App.tsx"), ["App"], "client/App");
need(await clientModule("../client/src/components/layout/Layout.tsx"), ["Layout"], "client/layout/Layout");
need(await clientModule("../client/src/components/layout/Header.tsx"), ["Header"], "client/layout/Header");
need(await clientModule("../client/src/components/layout/Sidebar.tsx"), ["Sidebar"], "client/layout/Sidebar");
for (const [file, exp] of [
  ["LoginPage","LoginPage"],["RegisterPage","RegisterPage"],["CatalogPage","CatalogPage"],
  ["CreateSynthesisPage","CreateSynthesisPage"],["SynthesisPage","SynthesisPage"],
  ["ImportPage","ImportPage"],["BillingPage","BillingPage"],["AdminPromptsPage","AdminPromptsPage"],
  ["NotFoundPage","NotFoundPage"],["ProfilePage","ProfilePage"], // 0.6
] as const) {
  need(await clientModule(`../client/src/pages/${file}.tsx`), [exp], `client/pages/${file}`);
}

// ── 4e. Кросс-слойные совместимости беседы 0.4 (клиент ↔ сервер) ──
// Клиент не может импортировать server-типы (границы tsconfig-проектов),
// поэтому совместимость контрактов проверяется парсингом исходников —
// по паттерну audit.mts (schema↔types).
import { readFileSync } from "node:fs";
{
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  const clientApi = read("../client/src/api/client.ts");
  const clientStore = read("../client/src/stores/auth-store.ts");
  const clientApp = read("../client/src/App.tsx");
  const clientSidebar = read("../client/src/components/layout/Sidebar.tsx");
  const serverAuthMw = read("./middleware/auth.ts");
  const serverAuthRoutes = read("./routes/auth.ts");
  const serverIndex = read("./index.ts");

  const ifaceFields = (src: string, name: string): string[] => {
    const m = src.match(new RegExp(`interface ${name} \\{([^}]*)\\}`, "s"));
    return m
      ? [...m[1]!.matchAll(/^\s*(\w+)\??:/gm)].map((x) => x[1]!)
      : [];
  };
  // AuthUser: одинаковый набор полей (опциональность role/balanceUsd на клиенте —
  // осознанное решение 0.4: login-ответ усечён, дотяжка через /auth/me)
  const sFields = ifaceFields(serverAuthMw, "AuthUser").sort();
  const cFields = ifaceFields(clientStore, "AuthUser").sort();
  if (sFields.length === 0 || cFields.length === 0) errs.push("4e: AuthUser не распарсен");
  else if (sFields.join() !== cFields.join())
    errs.push(`4e: поля AuthUser расходятся: server={${sFields}} client={${cFields}}`);

  // ApiErrorCode клиента покрывает коды §4.3 и все литералы code:"X" сервера
  const clientCodes = new Set([...clientApi.matchAll(/\|\s*"([A-Z_]+)"/g)].map((m) => m[1]!));
  const spec43 = ["AUTH_REQUIRED","FORBIDDEN","NOT_FOUND","VALIDATION_ERROR","RATE_LIMIT",
    "INSUFFICIENT_BALANCE","API_KEY_INVALID","API_KEY_MISSING","GENERATION_IN_PROGRESS",
    "PLAN_CONFLICT","IMPORT_INVALID","INCOMPATIBLE_SECTIONS","QUOTA_EXCEEDED","BILLING_REQUIRED",
    "GENERATION_PAUSED","RESUME_INVALID","NO_PARTICIPANTS_SEED_REQUIRED"];
  for (const c of spec43) if (!clientCodes.has(c)) errs.push(`4e: ApiErrorCode без кода §4.3 ${c}`);
  for (const src of [serverAuthRoutes, serverIndex]) {
    for (const m of src.matchAll(/code:\s*"([A-Z_]+)"/g)) {
      if (!clientCodes.has(m[1]!)) errs.push(`4e: сервер шлёт code ${m[1]}, клиент не знает`);
    }
  }

  // Маршруты: App.tsx содержит ровно 8 путей протокола 0.4; цели Sidebar ⊆ маршрутов
  const appPaths = new Set([...clientApp.matchAll(/path="([^"]+)"/g)].map((m) => m[1]!));
  const protoRoutes = ["/login","/register","/catalog","/synthesis/new","/synthesis/:id",
    "/import","/billing","/admin/prompts"];
  for (const r of protoRoutes) if (!appPaths.has(r)) errs.push(`4e: в App.tsx нет маршрута ${r}`);
  for (const m of clientSidebar.matchAll(/to:\s*"([^"]+)"/g)) {
    if (!appPaths.has(m[1]!)) errs.push(`4e: Sidebar ведёт на ${m[1]}, маршрута нет в App`);
  }

  // База клиента ↔ монтирование сервера; эндпоинты auth-store ↔ routes/auth.ts
  if (!clientApi.includes('const BASE_URL = "/api/v1"')) errs.push("4e: BASE_URL клиента ≠ /api/v1");
  if (!serverIndex.includes('app.route("/api/v1/auth"')) errs.push("4e: сервер не монтирует /api/v1/auth");
  for (const ep of ["/login","/logout","/register","/me"]) {
    if (!clientStore.includes(`"/auth${ep}"`)) errs.push(`4e: auth-store не зовёт /auth${ep}`);
    const method = ep === "/me" ? "get" : "post";
    if (!new RegExp(`\\.${method}\\("${ep}"`).test(serverAuthRoutes))
      errs.push(`4e: routes/auth без ${method.toUpperCase()} ${ep}`);
  }
}

// ── 5e. Async-цепочка клиент↔сервер БЕЗ браузера (беседа 0.4) ──
// Глобальный fetch подменяется на app.request() мини-Hono с реальными
// authRoutes и живой БД: клиентский auth-store гоняется против настоящего
// серверного кода в одном процессе. Cookie в node-fetch не сохраняются —
// проверяется и fallback login'а на усечённого пользователя (без /auth/me).
{
  const { Hono } = await import("hono");
  const { authRoutes } = await import("./routes/auth.js");
  const mini = new Hono();
  mini.route("/api/v1/auth", authRoutes);

  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    mini.request(String(input), init)) as typeof fetch;
  try {
    const storeMod = await clientModule("../client/src/stores/auth-store.ts");
    // Минимальный структурный контракт store для рантайм-проверок
    type St = {
      user: { email?: string; role?: string } | null;
      status: string; error: string | null; pending: boolean;
      register(e: string, p: string, d?: string): Promise<boolean>;
      login(e: string, p: string): Promise<boolean>;
      logout(): Promise<void>; restore(): Promise<void>;
    };
    const st = () => (storeMod.useAuthStore as { getState(): St }).getState();

    const email = `it-0.4-${Date.now()}@check.dev`;
    const okReg = await st().register(email, "integration-04", "Проверка 0.4");
    if (!okReg) errs.push(`5e: register()+auto-login вернул false (${st().error})`);
    if (st().user?.email !== email) errs.push("5e: user не в store после register");
    if (st().user?.role !== undefined)
      errs.push("5e: без cookie ждали усечённого user (fallback), а role пришла");
    if (st().status !== "authenticated") errs.push(`5e: status=${st().status} после login`);

    await st().logout();
    if (st().user !== null || st().status !== "anonymous") errs.push("5e: logout не сбросил store");

    const okBad = await st().login(email, "wrong-password");
    if (okBad !== false) errs.push("5e: login(bad) не false");
    if (!st().error) errs.push("5e: login(bad) не выставил error");
    if (st().pending !== false) errs.push("5e: pending завис после ошибки");

    await st().restore();
    if (st().status !== "anonymous") errs.push("5e: restore без cookie не anonymous");

    // async-проброс отказа транспорта: ApiError(NETWORK_ERROR) доходит до вызывающего
    globalThis.fetch = (() => { throw new TypeError("fetch failed"); }) as typeof fetch;
    const apiMod = await clientModule("../client/src/api/client.ts");
    const apiGet = apiMod.apiGet as (p: string) => Promise<unknown>;
    const ApiErrorCls = apiMod.ApiError as new (...a: never[]) => Error & { code: string };
    let netErr: unknown;
    try { await apiGet("/auth/me"); } catch (e) { netErr = e; }
    if (!(netErr instanceof ApiErrorCls) || netErr.code !== "NETWORK_ERROR")
      errs.push("5e: сбой fetch не пробросился как ApiError NETWORK_ERROR");

    // чистка тестового пользователя
    const { db: db5e, schema: schema5e } = await import("./db/index.js");
    const { eq: eq5e } = await import("drizzle-orm");
    await db5e.delete(schema5e.users).where(eq5e(schema5e.users.email, email));
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ── 4f. Контрактные проверки беседы 0.5 (password-change) ──
// Новых модулей беседа не создала (эндпоинт внутри routes/auth.ts, секция 2b);
// проверяются контракт §2.1 и защитные инварианты — парсингом по паттерну 4e.
// Коды ошибок эндпоинта покрыты общим сканом 4e (code:"X" сервера ⊆ клиент).
{
  const src = readFileSync(new URL("./routes/auth.ts", import.meta.url), "utf8");
  if (!/\.post\("\/password-change",\s*requireAuth,/.test(src))
    errs.push("4f: routes/auth без POST /password-change c requireAuth первым");
  // Инвалидация «всех, КРОМЕ текущей»: and(eq(userId), ne(sessionId))
  if (!/ne\(\s*schema\.sessions\.id/.test(src) || !/eq\(\s*schema\.sessions\.userId/.test(src))
    errs.push("4f: delete сессий без пары eq(userId)+ne(текущая) — инвариант §2.1 нарушен");
  // Атомарность: смена хэша и зачистка сессий — в одной транзакции
  if (!/db\.transaction\(/.test(src))
    errs.push("4f: password-change без db.transaction (хэш и сессии могут разойтись)");
  // Единая константа длины пароля с register (не дублированная цифра)
  const minLenUses = [...src.matchAll(/PASSWORD_MIN_LENGTH/g)].length;
  if (minLenUses < 4) // объявление + register(2: сравнение и текст) + password-change
    errs.push(`4f: PASSWORD_MIN_LENGTH используется ${minLenUses} раз — password-change не на общей константе?`);
}

// ── 5f. Async-цепочка password-change против живой БД (беседа 0.5) ──
// Полный жизненный цикл через app.request с реальными authRoutes:
// отказы (неверный текущий / короткий новый) без побочных эффектов,
// успешная смена → старый пароль мёртв, чужая сессия убита, текущая жива.
{
  const { Hono: Hono5f } = await import("hono");
  const { authRoutes: authRoutes5f } = await import("./routes/auth.js");
  const app5f = new Hono5f().route("/auth", authRoutes5f);
  const cookieOf = (r: Response) =>
    (r.headers.get("set-cookie") ?? "").match(/philosynth_session=[^;]+/)?.[0] ?? null;
  const post = (path: string, body: unknown, cookie?: string | null) =>
    app5f.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });

  const email = `it-0.5-${Date.now()}@check.dev`;
  const OLD = "it-old-password";
  const NEW = "it-new-password";
  await post("/auth/register", { email, password: OLD });
  const a = cookieOf(await post("/auth/login", { email, password: OLD })); // текущая
  const b = cookieOf(await post("/auth/login", { email, password: OLD })); // «чужая»
  if (!a || !b) errs.push("5f: login не выдал cookie — цикл прерван");
  else {
    // Отказ 1: неверный текущий пароль → 401, сессия B не тронута
    const wrong = await post("/auth/password-change",
      { currentPassword: "wrong", newPassword: NEW }, a);
    if (wrong.status !== 401) errs.push(`5f: неверный currentPassword → ${wrong.status}, ждали 401`);
    // Отказ 2: короткий новый → 400 VALIDATION_ERROR + details.newPassword
    const short = await post("/auth/password-change",
      { currentPassword: OLD, newPassword: "short" }, a);
    const shortBody = (await short.json().catch(() => null)) as
      { code?: string; details?: { newPassword?: string } } | null;
    if (short.status !== 400 || shortBody?.code !== "VALIDATION_ERROR" || !shortBody?.details?.newPassword)
      errs.push(`5f: короткий newPassword → ${short.status}/${shortBody?.code}, ждали 400 VALIDATION_ERROR+details`);
    if ((await app5f.request("/auth/me", { headers: { cookie: b } })).status !== 200)
      errs.push("5f: отказы инвалидировали постороннюю сессию B");
    // Успех: смена → старый login 401, новый 200; B мертва, A жива
    const ok = await post("/auth/password-change",
      { currentPassword: OLD, newPassword: NEW }, a);
    const okBody = (await ok.json().catch(() => null)) as { ok?: boolean } | null;
    if (ok.status !== 200 || okBody?.ok !== true) errs.push(`5f: смена пароля → ${ok.status}, ждали 200 {ok:true}`);
    if ((await post("/auth/login", { email, password: OLD })).status !== 401)
      errs.push("5f: старый пароль всё ещё принимается после смены");
    if ((await post("/auth/login", { email, password: NEW })).status !== 200)
      errs.push("5f: новый пароль не принимается после смены");
    if ((await app5f.request("/auth/me", { headers: { cookie: b } })).status !== 401)
      errs.push("5f: прочая сессия B пережила смену пароля");
    if ((await app5f.request("/auth/me", { headers: { cookie: a } })).status !== 200)
      errs.push("5f: ТЕКУЩАЯ сессия A убита сменой пароля");
  }
  {
    const { db: db5f, schema: schema5f } = await import("./db/index.js");
    const { eq: eq5f } = await import("drizzle-orm");
    await db5f.delete(schema5f.users).where(eq5f(schema5f.users.email, email));
  }
}

// ── 4g. Контрактные проверки беседы 0.6 (профиль) ──
// Парсинг по паттерну 4e/4f: PATCH /auth/me, маршрут /profile, ссылка
// в Header, опция skipUnauthorizedHandler и её использование store'ом.
{
  const read06 = (rel: string) =>
    readFileSync(new URL(rel, import.meta.url), "utf8");
  const srvAuth = read06("./routes/auth.ts");
  const cliApi = read06("../client/src/api/client.ts");
  const cliStore = read06("../client/src/stores/auth-store.ts");
  const cliApp = read06("../client/src/App.tsx");
  const cliHeader = read06("../client/src/components/layout/Header.tsx");

  if (!/\.patch\("\/me",\s*requireAuth,/.test(srvAuth))
    errs.push("4g: routes/auth без PATCH /me c requireAuth первым");
  if (!srvAuth.includes("DISPLAY_NAME_MAX_LENGTH"))
    errs.push("4g: лимит displayName не вынесен в константу");
  if (!/path="\/profile"/.test(cliApp))
    errs.push("4g: в App.tsx нет маршрута /profile");
  if (!/to="\/profile"/.test(cliHeader))
    errs.push("4g: Header не ведёт на /profile (ссылка A3)");
  // Опция «401 — штатный ответ формы» существует и применяется к обеим сторонам
  if (!cliApi.includes("skipUnauthorizedHandler"))
    errs.push("4g: api/client без опции skipUnauthorizedHandler");
  if (!/skipUnauthorizedHandler\s*&&\s*onUnauthorized/.test(cliApi.replace(/!/g, "")))
    errs.push("4g: 401-обработчик не учитывает skipUnauthorizedHandler");
  if (!/password-change[\s\S]{0,200}skipUnauthorizedHandler:\s*true/.test(cliStore))
    errs.push("4g: changePassword в store не использует skipUnauthorizedHandler");
  if (!cliStore.includes('apiPatch<{ user: AuthUser }>("/auth/me"'))
    errs.push("4g: updateProfile не зовёт PATCH /auth/me");
}

// ── 5g. Async-цепочка PATCH /auth/me против живой БД (беседа 0.6) ──
// Смоук поверх реальных authRoutes: смена видна в /auth/me, пустая → null,
// 101 → VALIDATION_ERROR. Детальные кейсы — test-06-request2-{api,browser}.mjs.
{
  const { Hono: Hono5g } = await import("hono");
  const { authRoutes: authRoutes5g } = await import("./routes/auth.js");
  const app5g = new Hono5g().route("/auth", authRoutes5g);
  const email = `it-0.6-${Date.now()}@check.dev`;
  const post5g = (path: string, body: unknown, cookie?: string | null) =>
    app5g.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
  await post5g("/auth/register", { email, password: "it-06-password" });
  const login5g = await post5g("/auth/login", { email, password: "it-06-password" });
  const cookie5g =
    (login5g.headers.get("set-cookie") ?? "").match(/philosynth_session=[^;]+/)?.[0] ?? null;
  if (!cookie5g) errs.push("5g: login не выдал cookie");
  else {
    const patch5g = (body: unknown) =>
      app5g.request("/auth/me", {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: cookie5g },
        body: JSON.stringify(body),
      });
    const set = await patch5g({ displayName: "Интеграция 0.6" });
    const setBody = (await set.json().catch(() => null)) as
      { user?: { displayName?: string | null; balanceUsd?: unknown } } | null;
    if (set.status !== 200 || setBody?.user?.displayName !== "Интеграция 0.6" ||
        typeof setBody?.user?.balanceUsd !== "number")
      errs.push(`5g: PATCH displayName → ${set.status}, ждали 200 + полный user`);
    const me5g = await app5g.request("/auth/me", { headers: { cookie: cookie5g } });
    const me5gBody = (await me5g.json().catch(() => null)) as
      { user?: { displayName?: string | null } } | null;
    if (me5gBody?.user?.displayName !== "Интеграция 0.6")
      errs.push("5g: смена displayName не видна в GET /auth/me");
    const empty = await patch5g({ displayName: "" });
    const emptyBody = (await empty.json().catch(() => null)) as
      { user?: { displayName?: string | null } } | null;
    if (empty.status !== 200 || emptyBody?.user?.displayName !== null)
      errs.push("5g: пустая строка не дала displayName=null");
    const long = await patch5g({ displayName: "х".repeat(101) });
    const longBody = (await long.json().catch(() => null)) as
      { code?: string; details?: { displayName?: string } } | null;
    if (long.status !== 400 || longBody?.code !== "VALIDATION_ERROR" || !longBody?.details?.displayName)
      errs.push(`5g: 101 символ → ${long.status}/${longBody?.code}, ждали 400 VALIDATION_ERROR+details`);
  }
  {
    const { db: db5g, schema: schema5g } = await import("./db/index.js");
    const { eq: eq5g } = await import("drizzle-orm");
    await db5g.delete(schema5g.users).where(eq5g(schema5g.users.email, email));
  }
}

// ── 4h. Контрактные проверки беседы 1.1 (engine/advisor/estimator) ──
// Типовые совместимости (компилятор — судья) + парсинг инвариантов.
import type { DepsMap as DepsMap11, SectionDeps as SectionDeps11 } from "./utils/deep-merge.js";
import type { SubstitutionMap as SubMap11 } from "./utils/topo-sort.js";
import {
  resolveContextDeps as rcd11,
  buildEffectiveDeps as bed11,
  findSubstitute as fs11,
} from "./services/synthesis-engine.js";
import { getCompatEntryByKey as gce11, type CompatEntry as CompatEntry11 } from "./services/compat-advisor.js";
import {
  estimateCost as ec11,
  estimateModeCost as emc11,
  type EstimateCostInput as ECInput11,
  type FullCostEstimate as FCE11,
  type CostEstimate as CE11,
} from "./services/cost-estimator.js";
// async-сигнатуры и возвраты соответствуют контрактам беседы 1.1
const _t20: (p: { method?: "dialectical"; synthLevel?: "comparative" }) => Promise<DepsMap11> = rcd11;
const _t21: (s: string[], r: DepsMap11, o?: "genetic" | "architectural") => Promise<DepsMap11> = bed11;
const _t22: (k: string, a: ReadonlySet<string>, self: string, m: SubMap11) => string | null = fs11;
const _t23: (k: string) => Promise<CompatEntry11 | null> = gce11;
const _t24: (i: ECInput11) => Promise<FCE11> = ec11;
const _t25: (i: { deps: SectionDeps11; params: { depth: "standard" }; sysChars: number }) => Promise<CE11> = emc11;
{
  // Перенос закрыт в 1.3: копии applyBudgetPressure в оценщике нет,
  // функция импортируется из канона context-builder.ts (04-map §1.10).
  const estSrc = readFileSync(new URL("./services/cost-estimator.ts", import.meta.url), "utf8");
  if (/function applyBudgetPressure/.test(estSrc) || /TODO\(1\.3\)/.test(estSrc))
    errs.push("4h: копия applyBudgetPressure/метка TODO(1.3) должны быть удалены из cost-estimator (перенос 1.3)");
  if (!/import \{ applyBudgetPressure \} from "\.\/context-builder\.js"/.test(estSrc))
    errs.push("4h: cost-estimator должен импортировать applyBudgetPressure из context-builder");
  // Мутация effectiveDeps в buildDynamicOrder — задокументирована (семантика исходника)
  const topoSrc = readFileSync(new URL("./utils/topo-sort.ts", import.meta.url), "utf8");
  if (!/МУТИРУЕТ effectiveDeps/.test(topoSrc))
    errs.push("4h: мутация effectiveDeps в topo-sort не задокументирована");
  // Константы оценщика — дословно из исходника [7539]
  const cost11 = await import("./services/cost-estimator.js");
  if (cost11.CHARS_PER_TOKEN !== 2.6 || cost11.PRICE_IN !== 3 / 1e6 ||
      cost11.PRICE_OUT !== 15 / 1e6 || cost11.HTML_OVERHEAD !== 1.5 ||
      cost11.OUTPUT_MULTIPLIER !== 3.5 || cost11.WORDS_TO_CHARS !== 7 ||
      cost11.SECTION_OUTPUT_MULT.critique !== 5.0 || cost11.SECTION_OUTPUT_MULT._default !== 3.5)
    errs.push("4h: константы оценщика разошлись с исходником [7539]");
  // Топо-таблицы — дословно [6505/6520] (точечные инварианты)
  const topo11 = await import("./utils/topo-sort.js");
  const A11 = topo11.SECTION_TOPO_ORDER_ARCHITECTURAL;
  const G11 = topo11.SECTION_TOPO_ORDER_GENETIC;
  if (A11.sum !== 0 || A11.graph !== 1 || A11.capsule !== 9 ||
      A11.origin !== 6 || A11.practical !== 6 || A11.dialogue !== 6)
    errs.push("4h: SECTION_TOPO_ORDER_ARCHITECTURAL разошёлся с исходником");
  if (G11.dialogue !== 1 || G11.graph !== 4 || G11.capsule !== 10)
    errs.push("4h: SECTION_TOPO_ORDER_GENETIC разошёлся с исходником");
}

// ── 5h. Живой конвейер беседы 1.1 против посеянных конфигов ──
// resolveContextDeps → buildEffectiveDeps (подстановка) → buildDynamicOrder →
// getCompatEntryByKey → estimateCost. Детальные кейсы — test-11-request{2..7}.mjs.
{
  const eng5h = await import("./services/synthesis-engine.js");
  const topo5h = await import("./utils/topo-sort.js");
  const adv5h = await import("./services/compat-advisor.js");
  const cost5h = await import("./services/cost-estimator.js");

  const rd5h = await eng5h.resolveContextDeps({ method: "dialectical", synthLevel: "comparative" });
  if (!rd5h.graph?.required.includes("sum:goals"))
    errs.push("5h: resolveContextDeps: graph.required без sum:goals");
  const sub5h = await eng5h.getActiveSubstitutionMap("architectural");
  const ed5h = eng5h.buildEffectiveDepsWith(["graph", "theses"], rd5h, sub5h);
  if (!ed5h.theses?.optional.includes("graph:nodes"))
    errs.push("5h: подстановка glossary:table→graph:nodes не сработала");
  const order5h = topo5h.buildDynamicOrder(ed5h, ["graph", "theses"], rd5h, "architectural", sub5h);
  if (order5h[0] !== "sum" || order5h.indexOf("graph") > order5h.indexOf("theses"))
    errs.push(`5h: buildDynamicOrder дал ${order5h.join("→")}`);
  const entry5h = await adv5h.getCompatEntryByKey("generative:creative");
  if (!entry5h || entry5h.rating !== "★★" || Object.keys(entry5h.sections).length !== 11)
    errs.push("5h: getCompatEntryByKey(generative:creative) без ★★/11 чипов");
  const advice5h = await adv5h.computeSectionAdvice({
    sections: ["theses"], synthLevel: "comparative", method: "dialectical",
  });
  if (!advice5h.warnings.some((w) => w.text.includes("«Граф категорий»")))
    errs.push("5h: computeSectionAdvice не предупредил о недостающем graph");
  const est5h = await cost5h.estimateCost({
    params: { depth: "standard" },
    passes: [[{ key: "sum", prompt: "x".repeat(500), title: "Резюме" }],
             [{ key: "theses", prompt: "x".repeat(500), title: "Тезисы" }]],
    effectiveDeps: ed5h, sysChars: 1000, baseStaticChars: 500,
  });
  if (!(est5h.inTokens > 0 && est5h.outTokens > 0 && est5h.passes === 2))
    errs.push("5h: estimateCost на живых конфигах дал вырожденный результат");
}

// ── 4i. Контрактные проверки беседы 1.2 (prompt-builder/section-defs-builder) ──
// Типовые совместимости с оценщиком 1.1 (компилятор — судья) + парсинг инвариантов.
import {
  buildSYS as bs12,
  baseCtxStatic as bcs12,
  type PromptParams as PP12,
  type BuildSysOptions as BSO12,
} from "./services/prompt-builder.js";
import {
  buildSectionDefs as bsd12,
  groupPasses as gp12,
  type SectionDefFull as SDF12,
  type SectionParts as SP12,
} from "./services/section-defs-builder.js";
import type {
  EstimateSectionDef as ESD12,
  EstimateSectionParts as ESP12,
} from "./services/cost-estimator.js";
// async-сигнатуры соответствуют контрактам беседы 1.2
const _t26: (p: Pick<PP12, "phil" | "lang">, o?: BSO12) => Promise<string> = bs12;
const _t27: (p: PP12) => Promise<string> = bcs12;
const _t28: (p: PP12) => Promise<SDF12[]> = bsd12;
// parts билдера структурно совместимы со входами оценщика (NEXT-CONTEXT 1.1)
const _t29 = (p: SP12): ESP12 => p;
const _t30 = (d: SDF12): ESD12 => d;
// groupPasses(defs) подаётся в estimateCost.passes без приведения типов
const _t31 = (d: SDF12[]): ESD12[][] => gp12(d);
{
  const pbSrc = readFileSync(new URL("./services/prompt-builder.ts", import.meta.url), "utf8");
  // Стоп-сигнал читается из Registry (отступление от «константы» 07 задокументировано),
  // текст НЕ захардкожен в модуле
  if (!/getTemplate\(STOP_SIGNAL_TEMPLATE_KEY\)/.test(pbSrc) || /ПРЕКРАТИ генерацию/.test(pbSrc))
    errs.push("4i: стоп-сигнал должен читаться из Registry, без захардкоженного текста");
  if (!/ОТСТУПЛЕНИЕ/.test(pbSrc))
    errs.push("4i: отступление по STOP_SIGNAL не задокументировано в prompt-builder");
  // Провайдер родительского блока — подключаемый, с TODO на 1.3/3.1
  if (!/setParentContextProvider/.test(pbSrc) || !/1\.3/.test(pbSrc))
    errs.push("4i: провайдер родительского контекста без разъёма/ссылки на 1.3");
  // Тексты разделов — только из Registry: в билдере нет захардкоженных промптов
  const sdbSrc = readFileSync(new URL("./services/section-defs-builder.ts", import.meta.url), "utf8");
  if (/Составь §/.test(sdbSrc) || /ИСПОЛНИТЕЛЬНОЕ РЕЗЮМЕ СИНТЕЗА/.test(sdbSrc))
    errs.push("4i: в section-defs-builder остались захардкоженные тексты промптов");
  if (!/renderTemplate/.test(sdbSrc))
    errs.push("4i: section-defs-builder не использует renderTemplate Registry");
  // Посевы расширены артефактами 1.2
  const spSrc = readFileSync(new URL("../scripts/seed-prompts.ts", import.meta.url), "utf8");
  if (!/SEED_SECTION_TEMPLATES/.test(spSrc))
    errs.push("4i: seed-prompts не сеет SEED_SECTION_TEMPLATES");
  const scSrc = readFileSync(new URL("../scripts/seed-configs.ts", import.meta.url), "utf8");
  if (!/"subsection_map"/.test(scSrc))
    errs.push("4i: seed-configs не сеет subsection_map");
  // Генератор шаблонов подключён скриптом, файл помечен как сгенерированный
  const pkg12 = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as
    { scripts?: Record<string, string> };
  if (pkg12.scripts?.["extract:sections"] !== "node scripts/extract-section-templates.mjs")
    errs.push("4i: package.json без скрипта extract:sections");
  const stSrc = readFileSync(new URL("./config/section-templates.ts", import.meta.url), "utf8");
  if (!/СГЕНЕРИРОВАНО scripts\/extract-section-templates\.mjs/.test(stSrc))
    errs.push("4i: section-templates.ts без баннера «СГЕНЕРИРОВАНО … НЕ ПРАВИТЬ»");
}

// ── 5i. Живой конвейер бесед 1.1+1.2 против посеянного Registry ──
// buildSYS → baseCtxStatic → buildSectionDefs → groupPasses →
// estimateCost(sysChars/baseStaticChars/passes) → patchPromptsWithSecCtx.
// Байтовая сверка с исходником и детальные кейсы — smoke-12-request1.mjs /
// test-12-requests2-8.mjs.
{
  const pb5i = await import("./services/prompt-builder.js");
  const sdb5i = await import("./services/section-defs-builder.js");
  const eng5i = await import("./services/synthesis-engine.js");
  const cost5i = await import("./services/cost-estimator.js");

  const p5i = {
    seed: "Интеграция 1.2", phil: ["Кант", "Гегель"],
    sec: ["graph", "theses"],
    method: "dialectical", synthLevel: "comparative", depth: "standard",
    generationOrder: "architectural", extGraphMetrics: false, ctx: "",
  } as Parameters<typeof sdb5i.buildSectionDefs>[0];

  const sys5i = await pb5i.buildSYS(p5i, {});
  if (!(sys5i.length > 1000) || !sys5i.includes("Кант"))
    errs.push("5i: buildSYS вырожден или без имён философов");
  const static5i = await pb5i.baseCtxStatic(p5i);
  if (!static5i.includes("ЗЕРНО КОНЦЕПЦИИ") || static5i.includes("ВЫБРАННЫЕ РАЗДЕЛЫ"))
    errs.push("5i: baseCtxStatic без ЗЕРНА или с устаревшей строкой разделов");
  const stop5i = await pb5i.getStopSignal();
  if (!stop5i.startsWith("\n\nСТОП"))
    errs.push("5i: stop_signal из Registry не начинается с «\\n\\nСТОП»");

  const defs5i = await sdb5i.buildSectionDefs(p5i);
  if (defs5i.length !== 3 || defs5i.map((d) => d.key).join(",") !== "sum,graph,theses")
    errs.push(`5i: buildSectionDefs дал ${defs5i.map((d) => d.key).join(",")}`);
  if (defs5i.some((d) => d.prompt.includes("{{") || !d.prompt.trim()))
    errs.push("5i: в промптах разделов пусто или остались {{…}}");

  const rd5i = await eng5i.resolveContextDeps(p5i);
  const sub5i = await eng5i.getActiveSubstitutionMap("architectural");
  const ed5i = eng5i.buildEffectiveDepsWith(["graph", "theses"], rd5i, sub5i);
  const passes5i = sdb5i.groupPasses(defs5i);
  const est5i = await cost5i.estimateCost({
    params: { depth: "standard" },
    passes: passes5i,
    effectiveDeps: ed5i,
    sysChars: sys5i.length,
    baseStaticChars: static5i.length,
  });
  if (!(est5i.passes === 3 && est5i.inTokens > 0 && est5i.outTokens > 0))
    errs.push("5i: estimateCost на реальных buildSYS/defs дал вырожденный результат");

  sdb5i.patchPromptsWithSecCtx(defs5i, { graph: "Интеграционный акцент" });
  const g5i = defs5i.find((d) => d.key === "graph");
  if (!g5i?.prompt.includes("ДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ К ЭТОМУ РАЗДЕЛУ (от пользователя):\nИнтеграционный акцент"))
    errs.push("5i: patchPromptsWithSecCtx не вписал secCtx в промпт graph");
}

// ── 4j. Контрактные проверки беседы 1.3 (context-builder/extractor/parent-context) ──
// Типовые совместимости (компилятор — судья) + парсинг инвариантов порта.
import type {
  CtxLogDraft as CtxLogDraft13,
  CtxLogEntry as CtxLogEntry13,
  ContextEntry as ContextEntry13,
  ParentSpecLog as ParentSpecLog13,
} from "@philosynth/shared/types/generation";
import type { DepsMap as DepsMap13, SectionDeps as SectionDeps13 } from "./utils/deep-merge.js";
import {
  buildContextForSection as bcfs13,
  applyBudgetPressure as abp13,
  parentOverheadForSection as pofs13,
  computeConceptOverhead as cco13,
  type BuildContextResult as BCR13,
  type BudgetPressureResult as BPR13,
} from "./services/context-builder.js";
import {
  resolveParentDeps as rpd13,
  resolveParentDepsForSubsection as rpds13,
  buildParentSpecForLog as bpsl13,
  type ConceptParticipant as CP13,
} from "./services/parent-context.js";
import {
  extractContextFragment as ecf13,
  createDbContextSource as cdcs13,
  type ContextSource as CS13,
} from "./services/context-extractor.js";
import { innerText as it13, type HtmlElement as HE13 } from "./utils/html-parser.js";

// async-сигнатуры и возвраты соответствуют контрактам беседы 1.3
const _t40: (
  k: string, id: string, d: string,
  e: DepsMap13 | null | undefined, r: DepsMap13,
) => Promise<BCR13> = bcfs13;
const _t41: (b: number, o: number, keep: boolean) => BPR13 = abp13;
const _t42: (p: readonly CP13[] | null | undefined, k: string) => Promise<number> = pofs13;
const _t43: (p: readonly CP13[] | null | undefined) => number = cco13;
const _t44: (p: { generationOrder?: string }) => Promise<Record<string, SectionDeps13>> = rpd13;
const _t45: (p: { synthLevel?: string }, k: string, sub: string) => Promise<SectionDeps13> = rpds13;
const _t46: (
  p: readonly CP13[] | null | undefined, q: Record<string, never>, k: string,
) => Promise<ParentSpecLog13 | null> = bpsl13;
const _t47: (k: string, src: CS13) => Promise<string | null> = ecf13;
const _t48: (id: string) => CS13 = cdcs13;
const _t49: (el: HE13 | null | undefined) => string = it13;
// Черновик ctxLog покрывает все поля строки context_log, кроме служебных:
// персистентность (беседа 1.4) не потребует довычислений.
const _t50: (d: CtxLogDraft13) => Omit<CtxLogEntry13, "id" | "synthesisId" | "createdAt"> = (d) => ({
  sectionKey: d.sectionKey, budget: d.budget, totalUsed: d.totalUsed,
  reqFound: d.reqFound, reqTotal: d.reqTotal,
  optIncluded: d.optIncluded, optTotal: d.optTotal,
  budgetMode: d.budgetMode, parentOverhead: d.parentOverhead,
  parentSpec: d.parentSpec, entries: d.entries satisfies ContextEntry13[],
});
{
  const cbSrc13 = readFileSync(new URL("./services/context-builder.ts", import.meta.url), "utf8");
  const cxSrc13 = readFileSync(new URL("./services/context-extractor.ts", import.meta.url), "utf8");
  const pcSrc13 = readFileSync(new URL("./services/parent-context.ts", import.meta.url), "utf8");
  const hpSrc13 = readFileSync(new URL("./utils/html-parser.ts", import.meta.url), "utf8");

  // Канон applyBudgetPressure: экспортируется отсюда, пол 40% дословно [10141]
  if (!/export function applyBudgetPressure/.test(cbSrc13) ||
      !/Math\.floor\(baseBudget \* 0\.4\)/.test(cbSrc13))
    errs.push("4j: канон applyBudgetPressure отсутствует или пол 40% изменён");
  // Неприкосновенный набор шага 4 — дословно [8420]
  for (const k13 of ["graph:nodes", "graph:edges", "sum:goals", "sum:tensions"])
    if (!new RegExp(`UNTOUCHABLE[\\s\\S]{0,240}"${k13}"`).test(cbSrc13))
      errs.push(`4j: UNTOUCHABLE не содержит ${k13}`);
  // Пороги бюджетирования [8340–8420] — дословно
  if (!/totalBudget \* 1\.5/.test(cbSrc13) || !/totalBudget \* 1\.3/.test(cbSrc13) ||
      !/remainingBudget > 500/.test(cbSrc13) || !/remainingBudget <= 300/.test(cbSrc13) ||
      !/remainingBudget - 50/.test(cbSrc13))
    errs.push("4j: пороги бюджетирования разошлись с исходником [8340–8420]");
  // critique × 1.5 применяется ДО давления родителей [8332]
  if (!/critique"[\s\S]{0,40}Math\.floor\(baseBudget \* 1\.5\)[\s\S]{0,400}applyBudgetPressure\(/.test(cbSrc13))
    errs.push("4j: множитель critique×1.5 должен применяться ДО applyBudgetPressure");
  // Вес родителя: +200 симв. служебной обёртки на концепцию [10150]
  if (!/total \+= 200/.test(cbSrc13))
    errs.push("4j: parentOverheadForSection без обвязки 200 симв. на концепцию");
  // DOM-слой изолирован: сервисы 1.3 не трогают браузерные глобалы,
  // linkedom импортируется ТОЛЬКО в server/utils/html-parser.ts.
  // Комментарии вырезаются: в JSDoc портов имена исходника упоминаются легитимно.
  const code13 = [cbSrc13, cxSrc13, pcSrc13]
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  if (/\bdocument\.(getElementById|createElement)\b|\bwindow\./.test(code13))
    errs.push("4j: сервисы 1.3 обращаются к браузерным глобалам");
  if (/from "linkedom"/.test(code13))
    errs.push("4j: linkedom импортируется вне server/utils/html-parser.ts");
  if (!/from "linkedom"/.test(hpSrc13))
    errs.push("4j: html-parser должен быть единственной точкой входа linkedom");
  // Тексты — из Registry, а не хардкодом (правило 1.2 сохраняется)
  if (!/graph_last_col_name/.test(cxSrc13))
    errs.push("4j: имя последнего столбца графа не берётся из Registry");
  // Карты родителей — из Registry, не из server/config напрямую
  if (/from "\.\.\/config\/parent-deps\.js"/.test(pcSrc13))
    errs.push("4j: parent-context читает config/parent-deps в обход Registry");
  // TODO(2.1) canonicalSubsectionKey ЗАКРЫТ беседой 2.1: default колбэка —
  // настоящая каноникализация из cascade-analyzer
  if (!/getCanonicalizer/.test(cbSrc13))
    errs.push("4j: каноникализация из cascade-analyzer (2.1) не подключена в context-builder");
  // Гейт наличия раздела сохранён (аналог `if (!el) return null` [8155])
  if (!/const el = await src\.getSectionElement/.test(cxSrc13) || !/if \(!el\) return null;/.test(cxSrc13))
    errs.push("4j: гейт наличия раздела в extractContextFragment не сохранён");
}

// ── 4k. Контрактные проверки беседы 1.4 (streaming/generation/парсеры) ──
{
  const sm4k = await import("./services/streaming-manager.js");
  const gs4k = await import("./services/generation-service.js");
  const gp4k = await import("./services/graph-parser.js");
  type StreamUsage14 = import("./services/streaming-manager.js").StreamUsage;
  type ParsedGraph14 = import("./services/graph-parser.js").ParsedGraph;
  type SaveGraphResult14 = import("./services/graph-parser.js").SaveGraphResult;
  type ParsedThesis14 = import("./services/element-parser.js").ParsedThesis;
  type ParsedGlossaryTerm14 = import("./services/element-parser.js").ParsedGlossaryTerm;
  type PauseReasonKind14 = import("@philosynth/shared/types/synthesis").PauseReasonKind;
  type StreamErrorKind14 = import("./services/streaming-manager.js").StreamErrorKind;

  // Async/sync-сигнатуры (compile-time, сквозная серия _t51+)
  const _t51: (
    sid: string, key: string, p: string, sys: string, k: string,
  ) => Promise<StreamUsage14> = (sid, key, p, sys, k) => sm4k.streamSection(sid, key, p, sys, k);
  const _t52: (sid: string, uid: string) => Promise<void> = (sid, uid) =>
    gs4k.generateSynthesis(sid, uid);
  const _t53: (html: string) => ParsedGraph14 = (h) => gp4k.parseGraphFromHTML(h);
  const _t54: (sid: string, g: ParsedGraph14) => Promise<SaveGraphResult14> = (sid, g) =>
    gp4k.saveGraphToDb(sid, g);
  // Черновики парсеров совместимы со строками insert соответствующих таблиц
  const _t55: (sid: string, t: ParsedThesis14) => typeof schema.theses.$inferInsert =
    (sid, t) => ({ synthesisId: sid, ...t });
  const _t56: (sid: string, g: ParsedGlossaryTerm14) => typeof schema.glossaryTerms.$inferInsert =
    (sid, g) => ({ synthesisId: sid, ...g });
  // Таксономия: kinds стрима ⊂ PauseReasonKind; 'context-error' — только паузы
  const _t57: PauseReasonKind14 = "context-error";
  const _t58: (k: StreamErrorKind14) => PauseReasonKind14 = (k) => k;
  void _t51; void _t52; void _t53; void _t54; void _t55; void _t56; void _t57; void _t58;

  const strip4k = (s: string): string =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const smSrc = strip4k(readFileSync(new URL("./services/streaming-manager.ts", import.meta.url), "utf8"));
  const gsSrc = strip4k(readFileSync(new URL("./services/generation-service.ts", import.meta.url), "utf8"));
  const rsSrc = strip4k(readFileSync(new URL("./routes/syntheses.ts", import.meta.url), "utf8"));
  const whSrc = strip4k(readFileSync(new URL("./ws/handler.ts", import.meta.url), "utf8"));

  // База API — только из env (тестируемость/BYO-прокси), без хардкода облака
  if (!smSrc.includes("${env.anthropic.baseUrl}/v1/messages") ||
      smSrc.includes("api.anthropic.com"))
    errs.push("4k: URL API должен браться из env.anthropic.baseUrl (без хардкода)");
  // Модель v11: ретраится ТОЛЬКО pre-stream, задержки из env
  if (!gsSrc.includes('e.kind !== "pre-stream"') ||
      !gsSrc.includes("env.streaming.retryDelays") || /\[1000,\s*3000/.test(gsSrc))
    errs.push("4k: ретраи должны быть только pre-stream с задержками из env.streaming.retryDelays");
  // Гонка двойного старта: слот резервируется ДО первого await (фикс 1.4)
  const setIdx4k = gsSrc.indexOf("activeRuns.set(synthesisId, run)");
  const loadIdx4k = gsSrc.indexOf("await loadSynthesis(synthesisId)");
  if (setIdx4k === -1 || loadIdx4k === -1 || setIdx4k > loadIdx4k)
    errs.push("4k: activeRuns.set обязан стоять ДО await loadSynthesis (гонка двойного старта)");
  // Цены — из cost-estimator, не литералами
  if (!/import \{[^}]*PRICE_IN[^}]*\} from "\.\/cost-estimator\.js"/.test(gsSrc) ||
      /3 \/ 1e6|15 \/ 1e6/.test(gsSrc))
    errs.push("4k: цены должны импортироваться из cost-estimator (PRICE_IN/PRICE_OUT)");
  // Каркас промпта прохода — дословный scaffold исходника [12160]
  if (!gsSrc.includes("ЗАДАНИЕ: составь ТОЛЬКО следующие разделы (строго в указанном порядке, без добавления других):"))
    errs.push("4k: scaffold промпта прохода разошёлся с исходником");
  // genCommon персистится служебной строкой генлога (решение 1.4)
  if (!gsSrc.includes('"_genCommon"') || !gsSrc.includes('"common"'))
    errs.push("4k: genCommon должен персиститься строкой generation_log (_genCommon/common)");
  // §3.1: user-abort финализируется БЕЗ pausedState
  if (!gsSrc.includes('e.kind === "user-abort"'))
    errs.push("4k: ветка user-abort (финализация без pausedState, §3.1) не найдена");
  // DOM-слой изолирован: linkedom не импортируется модулями 1.4 напрямую
  for (const [nm, src] of [["streaming-manager", smSrc], ["generation-service", gsSrc]] as const) {
    if (/from "linkedom"/.test(src)) errs.push(`4k: ${nm} не должен импортировать linkedom напрямую`);
  }
  const gpSrc4k = strip4k(readFileSync(new URL("./services/graph-parser.ts", import.meta.url), "utf8"));
  const epSrc4k = strip4k(readFileSync(new URL("./services/element-parser.ts", import.meta.url), "utf8"));
  if (/from "linkedom"/.test(gpSrc4k) || /from "linkedom"/.test(epSrc4k))
    errs.push("4k: парсеры обязаны идти через utils/html-parser, не linkedom напрямую");
  // Роут POST /syntheses: валидация разделов по SEC_NAMES, статус generating
  if (!rsSrc.includes("Object.keys(SEC_NAMES)") || !rsSrc.includes('status: "generating"'))
    errs.push("4k: POST /syntheses должен валидировать разделы по SEC_NAMES и стартовать в 'generating'");
  // Reconnect §3.3: handler шлёт type:"resume" с накопленным буфером
  if (!whSrc.includes('type: "resume"') || !whSrc.includes("htmlSoFar"))
    errs.push("4k: handler обязан реализовывать resume-протокол §3.3");
}

// ── 4l. Контрактные проверки беседы 1.4b (pause-resume) ──
{
  const pr4l = await import("./services/pause-resume-service.js");
  const sd4l = await import("./services/section-defs-builder.js");
  const sch4l = await import("./db/schema.js");
  type ResumeGenMode14b = import("@philosynth/shared/types/ws-messages").ResumeGenerationMode;
  type ResumePlanMode14b = import("@philosynth/shared/types/ws-messages").ResumePlanMode;
  type PauseEstimates14b = import("@philosynth/shared/types/ws-messages").PauseEstimates;
  type PausedStateGen14b = import("@philosynth/shared/types/synthesis").PausedStateGen;
  type GenSource14b = import("@philosynth/shared/types/generation").GenerationSource;
  type SectionParts14b = import("./services/section-defs-builder.js").SectionParts;
  type SubsectionRegenOpts14b = import("./services/section-defs-builder.js").SubsectionRegenOpts;

  // Сигнатуры и перечни (compile-time, сквозная серия _t59+)
  const _t59: GenSource14b = "resume"; // дыра 02 §2.15 закрыта патчем 14b/A
  const _t60: NonNullable<(typeof sch4l.generationLog.$inferInsert)["source"]> = "resume";
  const _t61: (sid: string, uid: string, m: ResumeGenMode14b) => Promise<void> =
    (s, u, m) => pr4l.resumeGeneration(s, u, m);
  const _t62: (sid: string, pid: string, uid: string, m: ResumePlanMode14b) => Promise<void> =
    (s, p, u, m) => pr4l.resumePlan(s, p, u, m);
  const _t63: (sid: string, ps: PausedStateGen14b) => Promise<PauseEstimates14b> =
    (s, ps) => pr4l.computePauseEstimates(s, ps);
  const _t64: Record<ResumeGenMode14b, 1> = { "fill-missing-subs": 1, retry: 1, skip: 1, stop: 1 };
  const _t65: Record<ResumePlanMode14b, 1> = { retry: 1, skip_step: 1, stop: 1 };
  const _t66: (p: SectionParts14b, s: string, i: string, o?: SubsectionRegenOpts14b) => string =
    (p, s, i, o) => sd4l.serializeSubsectionRegen(p, s, i, o);
  void _t59; void _t60; void _t61; void _t62; void _t63; void _t64; void _t65; void _t66;

  const strip4l = (s: string): string =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const prSrc = strip4l(readFileSync(new URL("./services/pause-resume-service.ts", import.meta.url), "utf8"));
  const gsSrc4l = strip4l(readFileSync(new URL("./services/generation-service.ts", import.meta.url), "utf8"));
  const whSrc4l = strip4l(readFileSync(new URL("./ws/handler.ts", import.meta.url), "utf8"));
  const pmSrc = readFileSync(new URL("../client/src/components/synthesis/PauseModal.tsx", import.meta.url), "utf8");

  // Порог продолжения и userNote «Заверши» — дословно из исходника [25361/25412]
  if (!prSrc.includes("RESUME_CONTINUE_THRESHOLD = 250"))
    errs.push("4l: порог продолжения оборванного подраздела (250) разошёлся с исходником");
  if (!prSrc.includes("ДОСЛОВНО и продолжи писать именно с того места"))
    errs.push("4l: userNote режима продолжения разошёлся с _resumeFromSubsection");
  // Runtime-guard «чужого mode» (03 §4.3): WS-строка не должна проваливаться в retry
  if (!prSrc.includes('["fill-missing-subs", "retry", "skip", "stop"].includes(mode)') ||
      !prSrc.includes('["retry", "skip_step", "stop"].includes(mode)'))
    errs.push("4l: runtime-guard режимов возобновления не найден");
  // Регистрация провайдера оценок — побочный эффект импорта (низ модуля)
  if (!prSrc.includes("setPauseEstimatesProvider((synthesisId, ps)"))
    errs.push("4l: провайдер estimates обязан регистрироваться при импорте pause-resume-service");
  if ((gsSrc4l.match(/estimates: await pauseEstimatesFor\(/g) ?? []).length < 2)
    errs.push("4l: обе точки generation_paused обязаны нести живые estimates");
  // Метка возобновления — только в genEntry [25601]
  if (!gsSrc4l.includes('" [возобновление]"'))
    errs.push("4l: labelSuffix [возобновление] в генлоге не найден");
  // handler: resume_* диспетчеризованы (не заглушки)
  if (!whSrc4l.includes("handleResumeGeneration(ws, user") ||
      !whSrc4l.includes("handleResumePlan(ws, user"))
    errs.push("4l: resume_generation/resume_plan не диспетчеризованы в handler");
  // DOM-мутации — только через html-parser (изоляция linkedom, правило 1.3)
  if (/from "linkedom"/.test(prSrc))
    errs.push("4l: pause-resume-service не должен импортировать linkedom напрямую");
  // Клиентская модалка: 4 рендерера + бейдж, без browser storage
  for (const nm of ["GenContent", "PlanContent", "BillingContent", "AuthContent", "PauseBadge"])
    if (!pmSrc.includes(nm)) errs.push(`4l: в PauseModal отсутствует ${nm}`);
  if (/localStorage|sessionStorage/.test(pmSrc))
    errs.push("4l: PauseModal не должен использовать browser storage");
  // Семантика fmtCost — опорные точки _fmtCost [24634] (байтовая сверка — smoke-1.4b)
  const pmMod4l = await clientModule("../client/src/components/synthesis/PauseModal.tsx");
  need(pmMod4l, ["PauseModal", "PauseBadge", "fmtCost"], "client/synthesis/PauseModal");
  const pm4l = pmMod4l as { fmtCost: (c: number | null) => string };
  if (pm4l.fmtCost(0) !== "$0" || pm4l.fmtCost(0.0042) !== "≈ 0.42¢" ||
      pm4l.fmtCost(0.1234) !== "≈ $0.123" || pm4l.fmtCost(null) !== "")
    errs.push("4l: fmtCost разошёлся с _fmtCost [24634]");
}

// ── 5j. Живой конвейер беседы 1.3 против БД (ДО секции 5, закрывающей пул) ──
// resolveContextDeps → buildEffectiveDeps → buildDynamicOrder →
// buildContextForSection на реальных sections/categories.
// Детальные кейсы — smoke-13-request1.mjs / test-13-requests2-7.mjs.
{
  const cb5j = await import("./services/context-builder.js");
  const cx5j = await import("./services/context-extractor.js");
  const pc5j = await import("./services/parent-context.js");
  const eng5j = await import("./services/synthesis-engine.js");
  const topo5j = await import("./utils/topo-sort.js");
  const { db: db5j } = await import("./db/index.js");
  const sch5j = await import("./db/schema.js");
  const { eq: eq5j } = await import("drizzle-orm");

  const u5j = (
    await db5j.insert(sch5j.users)
      .values({ email: `ic13-${Date.now()}@example.org`, passwordHash: "x" })
      .returning({ id: sch5j.users.id })
  )[0]!.id;

  try {
    const s5j = (
      await db5j.insert(sch5j.syntheses)
        .values({ userId: u5j, seed: "интеграция 1.3", depth: "standard" })
        .returning({ id: sch5j.syntheses.id })
    )[0]!.id;

    await db5j.insert(sch5j.sections).values([
      { synthesisId: s5j, key: "sum", sectionNum: 1, title: "Резюме",
        htmlContent: '<div data-section="Цели и метод"><p>Цель интеграции.</p></div>' },
      { synthesisId: s5j, key: "graph", sectionNum: 2, title: "Граф", htmlContent: "<p>граф</p>" },
    ]);
    await db5j.insert(sch5j.categories).values({
      synthesisId: s5j, name: "Свобода", type: "онтологическая",
      definition: "Способность к самоопределению", centrality: 0.9, certainty: 0.8, origin: "Кант",
    });

    const p5j = { method: "dialectical", synthLevel: "comparative", generationOrder: "architectural" } as const;
    const rd5j = await eng5j.resolveContextDeps(p5j);
    const sel5j = ["sum", "graph", "theses"];
    const ed5j = await eng5j.buildEffectiveDeps(sel5j, rd5j, "architectural");
    topo5j.buildDynamicOrder(ed5j, sel5j, rd5j, "architectural");

    const res5j = await cb5j.buildContextForSection("theses", s5j, "standard", ed5j, rd5j);
    if (!res5j.text.includes("КОНТЕКСТ ИЗ ПРЕДЫДУЩИХ РАЗДЕЛОВ") ||
        !res5j.text.includes("ТАБЛИЦА КАТЕГОРИЙ"))
      errs.push("5j: buildContextForSection не собрал контекст из БД (HTML + гранулярные таблицы)");
    if (!res5j.ctxLog || res5j.ctxLog.budget !== 48000 ||
        res5j.ctxLog.totalUsed > res5j.ctxLog.budget)
      errs.push("5j: ctxLog — бюджет из Registry либо totalUsed некорректны");
    if (!res5j.ctxLog?.entries.some((e) => e.status === "found" && e.priority === "required"))
      errs.push("5j: ни один required-фрагмент не найден на живых данных");
    if (res5j.ctxLog?.parentSpec !== null || res5j.ctxLog?.parentOverhead !== 0)
      errs.push("5j: не-мета-синтез обязан давать parentSpec=null и overhead=0");

    // Давление родителей: overhead > 0 → бюджет ужат ровно по applyBudgetPressure
    const heavy5j = [{
      type: "concept", name: "Родитель",
      capsule: "к".repeat(30000), goals: "ц".repeat(30000), tensions: "н".repeat(30000),
      graphNodes: "г".repeat(30000), thesesSummary: "с".repeat(30000),
    }];
    const pressed5j = await cb5j.buildContextForSection(
      "theses", s5j, "standard", ed5j, rd5j, { participants: heavy5j },
    );
    const expected5j = Math.max(48000 - (pressed5j.ctxLog?.parentOverhead ?? 0), Math.floor(48000 * 0.4));
    if (!pressed5j.ctxLog || pressed5j.ctxLog.parentOverhead <= 0 ||
        pressed5j.ctxLog.budget !== expected5j)
      errs.push("5j: давление родителей / пол 40% разошлись с applyBudgetPressure");
    if (!pressed5j.ctxLog?.parentSpec || pressed5j.ctxLog.parentSpec.perParent.length !== 1)
      errs.push("5j: parentSpec не заполнен при наличии концепций-родителей");
    const kept5j = await cb5j.buildContextForSection(
      "theses", s5j, "standard", ed5j, rd5j,
      { participants: heavy5j, params: { keepFullBudget: true } },
    );
    if (kept5j.ctxLog?.budget !== 48000 || kept5j.ctxLog.budgetMode !== "full")
      errs.push("5j: keepFullBudget не отключает ужатие бюджета");

    // Диспетчер: несгенерированный раздел → null, не исключение
    const src5j = cx5j.createDbContextSource(s5j);
    if ((await cx5j.extractContextFragment("critique:full", src5j)) !== null)
      errs.push("5j: фрагмент несгенерированного раздела обязан быть null");
    if (!(await cx5j.extractGraphNodesTable(src5j))?.startsWith("ТАБЛИЦА КАТЕГОРИЙ:"))
      errs.push("5j: extractGraphNodesTable из categories дал неожиданный формат");

    // Карты родителей из Registry валидны (аналог _validateParentDeps [10055])
    const warn5j = await pc5j.validateParentDeps();
    if (warn5j.length)
      errs.push(`5j: validateParentDeps дал ${warn5j.length} предупреждений: ${warn5j[0]}`);
  } finally {
    await db5j.delete(sch5j.users).where(eq5j(sch5j.users.id, u5j));
  }
}

// ── 5k. Живые смоуки беседы 1.4 против БД/Redis (ДО секции 5) ──
// Замена графа/элементов идемпотентна (нет 23505), stream-state круговой,
// предохранители генерации. Полный цикл с моком API — test-14-requests2-8.mjs.
{
  const gp5k = await import("./services/graph-parser.js");
  const ep5k = await import("./services/element-parser.js");
  const ss5k = await import("./ws/stream-state.js");
  const gs5k = await import("./services/generation-service.js");
  const { db: db5k } = await import("./db/index.js");
  const sch5k = await import("./db/schema.js");
  const { eq: eq5k } = await import("drizzle-orm");
  const { env: env5k } = await import("./env.js");
  // lazyConnect + enableOfflineQueue=false: без явного connect первая
  // команда реджектится и fail-open прячет её — подключаем явно.
  await (await import("./redis.js")).connectRedis();

  const u5k = (
    await db5k.insert(sch5k.users)
      .values({ email: `ic14-${Date.now()}@example.org`, passwordHash: "x" })
      .returning({ id: sch5k.users.id })
  )[0]!.id;

  try {
    const s5k = (
      await db5k.insert(sch5k.syntheses)
        .values({ userId: u5k, seed: "интеграция 1.4", depth: "overview" })
        .returning({ id: sch5k.syntheses.id })
    )[0]!.id;

    // Замена графа — дважды подряд (двойной вызов не должен падать 23505)
    const graphHtml5k =
      '<div data-section="Таблица категорий"><table class="doc-table"><tbody>' +
      "<tr><td>Свобода</td><td>Онтологическая</td><td>опр</td><td>0.9</td><td>0.8</td><td>Кант</td></tr>" +
      "<tr><td>Дух</td><td>Онтологическая</td><td>опр</td><td>0.8</td><td>0.7</td><td>Гегель</td></tr>" +
      "</tbody></table></div>" +
      '<div data-section="Таблица связей"><table class="doc-table"><tbody>' +
      "<tr><td>Свобода</td><td>снимается</td><td>Дух</td><td>диалектическая</td><td>двунаправленная</td><td>0.9</td></tr>" +
      "</tbody></table></div>" +
      '<div data-section="Топология графа"><div data-section="Топологическая таблица">' +
      '<table class="doc-table"><tbody><tr><td>Свобода</td><td>I — Ядро</td><td>центральная</td><td>тезис</td></tr>' +
      "</tbody></table></div></div>";
    const parsed5k = gp5k.parseGraphFromHTML(graphHtml5k);
    if (parsed5k.nodes.length !== 2 || parsed5k.edges.length !== 1)
      errs.push("5k: parseGraphFromHTML не распарсил фикстуру");
    const save1 = await gp5k.saveGraphToDb(s5k, parsed5k);
    const save2 = await gp5k.saveGraphToDb(s5k, parsed5k); // замена, не дубль
    if (save2.categoriesInserted !== save1.categoriesInserted ||
        save2.clustersInserted !== save1.clustersInserted)
      errs.push("5k: повторный saveGraphToDb должен давать идентичную замену");
    if (!(await gp5k.hasGraph(s5k))) errs.push("5k: hasGraph после сохранения = false");

    // Замена элементов — дважды
    const th5k = [{ thesisNum: 1, formulation: "Тезис.", justification: "",
      thesisType: "ontological" as const, noveltyDegree: "высокая", relatedCategories: ["Свобода"] }];
    await ep5k.saveElementsToDb(s5k, "theses", { theses: th5k });
    const r2 = await ep5k.saveElementsToDb(s5k, "theses", { theses: th5k });
    if (r2.thesesInserted !== 1) errs.push("5k: повторный saveElementsToDb — не замена");

    // stream-state: запись → чтение (по разделу и по указателю) → очистка
    await ss5k.saveStreamState({ synthesisId: s5k, sectionKey: "sum",
      htmlSoFar: "<p>частично</p>", charsSoFar: 16, status: "streaming",
      updatedAt: new Date().toISOString() });
    const byKey5k = await ss5k.getStreamState(s5k, "sum");
    const byPtr5k = await ss5k.getStreamState(s5k);
    if (byKey5k?.htmlSoFar !== "<p>частично</p>" || byPtr5k?.sectionKey !== "sum")
      errs.push("5k: stream-state не читается по разделу/указателю");
    await ss5k.clearStreamState(s5k);
    if ((await ss5k.getStreamState(s5k)) !== null)
      errs.push("5k: clearStreamState не очистил буфер");

    // Предохранители генерации
    if (gs5k.isGenerationActive(s5k)) errs.push("5k: ложно-активная генерация");
    if (gs5k.cancelGeneration(s5k, u5k) !== false)
      errs.push("5k: cancelGeneration без активного цикла обязан вернуть false");
    if (!env5k.anthropic.apiKey) {
      try {
        gs5k.assertCanStartGeneration(u5k);
        errs.push("5k: без API-ключа assertCanStartGeneration обязан бросить API_KEY_MISSING");
      } catch (e) {
        if (!(e instanceof gs5k.GenerationError) || e.code !== "API_KEY_MISSING")
          errs.push("5k: неверный код ошибки предпроверки: " + String(e));
      }
    }
  } finally {
    await db5k.delete(sch5k.users).where(eq5k(sch5k.users.id, u5k)); // CASCADE подчистит
  }
}

// ── 5l. Живой pause/resume беседы 1.4b против БД (до закрытия пула) ──
// createPausedState → paused_state + pause_marker; computePauseEstimates
// на пересобранной из genParams инфраструктуре; валидации resumeGeneration
// (чужой mode / чужой пользователь); stop-финализация с resume_marker.
// Полные сценарии — tests/test-14b-requests2-6.mjs (56 ✓, живой сервер).
{
  const pr5l = await import("./services/pause-resume-service.js");
  const { db: db5l } = await import("./db/index.js");
  const sch5l = await import("./db/schema.js");
  const { and: and5l, eq: eq5l } = await import("drizzle-orm");

  const u5l = (
    await db5l.insert(sch5l.users)
      .values({ email: `ic14b-${Date.now()}@example.org`, passwordHash: "x" })
      .returning({ id: sch5l.users.id })
  )[0]!.id;
  try {
    const s5l = (
      await db5l.insert(sch5l.syntheses)
        .values({ userId: u5l, seed: "интеграция 1.4b", depth: "overview", status: "generating" })
        .returning({ id: sch5l.syntheses.id })
    )[0]!.id;

    const genParams5l = {
      seed: "интеграция 1.4b", phil: ["Кант"],
      participants: [{ type: "philosopher", name: "Кант" }],
      sec: [], method: "dialectical", synthLevel: "comparative",
      depth: "overview", generationOrder: "architectural",
      extGraphMetrics: false, ctx: "", lang: "Russian",
      secCtx: {}, keepFullBudget: false,
    };
    const ps5l = await pr5l.createPausedState(s5l, "gen", {
      passIdx: 0, sectionKeys: ["sum"], sectionLabel: "Резюме",
      isPartial: true, reason: "интеграционная пауза", reasonKind: "partial",
      partialSubsections: ["Цели и метод"],
      expectedSubsections: ["Цели и метод", "Портрет каждого философа"],
      completedPasses: [], genParams: genParams5l,
    });
    if (ps5l.kind !== "gen" || !(ps5l.timestamp > 0))
      errs.push("5l: createPausedState не проставил kind/timestamp");
    const [row5l] = await db5l.select().from(sch5l.syntheses).where(eq5l(sch5l.syntheses.id, s5l));
    if (row5l?.status !== "paused" || row5l.pausedState?.kind !== "gen")
      errs.push("5l: пауза не персистирована (status/paused_state)");
    const mk5l = await db5l.select({ lt: sch5l.generationLog.logType })
      .from(sch5l.generationLog)
      .where(and5l(eq5l(sch5l.generationLog.synthesisId, s5l),
        eq5l(sch5l.generationLog.logType, "pause_marker")));
    if (mk5l.length !== 1) errs.push("5l: pause_marker не записан");

    // Живые оценки: rebuildInfra из genParams (конфиги — из посеянного Registry)
    const est5l = await pr5l.computePauseEstimates(s5l, ps5l);
    if (!(typeof est5l.wholeSection === "number" && est5l.wholeSection > 0))
      errs.push("5l: wholeSection не вычислен из genParams");
    if (est5l.skipRemaining !== 0)
      errs.push("5l: skipRemaining единственного pass обязан быть 0");
    if (!(typeof est5l.fillMissingSubs === "number" && est5l.fillMissingSubs > 0))
      errs.push("5l: fillMissingSubs по недостающим не вычислен");

    // Валидации: чужой mode → RESUME_INVALID, чужой пользователь → FORBIDDEN
    for (const [uid5l, mode5l, code5l] of [
      [u5l, "bogus-mode", "RESUME_INVALID"],
      ["00000000-0000-0000-0000-000000000000", "retry", "FORBIDDEN"],
    ] as const) {
      try {
        await pr5l.resumeGeneration(s5l, uid5l, mode5l as never);
        errs.push(`5l: resumeGeneration(${mode5l}) обязан бросить ${code5l}`);
      } catch (e) {
        if (!(e instanceof pr5l.PauseResumeError) || e.code !== code5l)
          errs.push(`5l: ожидался ${code5l}, получено ${String(e)}`);
      }
    }

    // stop: текущее состояние — финальное
    await pr5l.resumeGeneration(s5l, u5l, "stop");
    const [after5l] = await db5l.select().from(sch5l.syntheses).where(eq5l(sch5l.syntheses.id, s5l));
    if (after5l?.status !== "ready" || after5l.pausedState !== null)
      errs.push("5l: stop не финализировал синтез (ready + pausedState=null)");
    const rmk5l = await db5l.select({ md: sch5l.generationLog.metadata })
      .from(sch5l.generationLog)
      .where(and5l(eq5l(sch5l.generationLog.synthesisId, s5l),
        eq5l(sch5l.generationLog.logType, "resume_marker")));
    if (rmk5l.length !== 1 || (rmk5l[0]?.md as { mode?: string } | null)?.mode !== "stop")
      errs.push("5l: resume_marker(mode=stop) не записан");

    // Повторный resume на ready → RESUME_INVALID (edge R6a)
    try {
      await pr5l.resumeGeneration(s5l, u5l, "retry");
      errs.push("5l: resume на ready обязан бросить RESUME_INVALID");
    } catch (e) {
      if (!(e instanceof pr5l.PauseResumeError) || e.code !== "RESUME_INVALID")
        errs.push("5l: ожидался RESUME_INVALID на ready: " + String(e));
    }
  } finally {
    await db5l.delete(sch5l.users).where(eq5l(sch5l.users.id, u5l)); // CASCADE подчистит
  }
}

// ── 4m (беседа 1.5): форма/прогресс — клиент-модули + контракты роутов ──
{
  const cm = clientModule;
  need(await cm("../client/src/api/syntheses.ts"),
    ["createSynthesis", "estimateSynthesis", "getSynthesis", "fetchSynthesisAdvice"],
    "client/api/syntheses");
  for (const [f, exp] of [
    ["SynthesisForm", "SynthesisForm"], ["PhilosopherPicker", "PhilosopherPicker"],
    ["SectionPicker", "SectionPicker"], ["CostEstimate", "CostEstimate"],
    ["CompatAdvisor", "CompatAdvisor"], ["SectionWarnings", "SectionWarnings"],
    ["GenerationProgress", "GenerationProgress"],
  ] as const) {
    need(await cm(`../client/src/components/synthesis/${f}.tsx`), [exp], `client/synthesis/${f}`);
  }
  need(await cm("../client/src/hooks/useStreamingGeneration.ts"),
    ["useStreamingGeneration"], "client/hooks/useStreamingGeneration");
  need(await cm("../client/src/pages/CreateSynthesisPage.tsx"),
    ["CreateSynthesisPage"], "client/pages/CreateSynthesisPage");

  // Текстовые контракты (кросс-мировые типы статически не проверяемы — TS5097)
  const fsm = await import("node:fs/promises");
  const rd = (rel: string) => fsm.readFile(new URL(rel, import.meta.url), "utf8");
  const routeSrc = await rd("./routes/syntheses.ts");
  if (!routeSrc.includes('synthesesRoutes.post("/estimate", requireAuth'))
    errs.push("4m: POST /syntheses/estimate без requireAuth либо не смонтирован");
  if (!routeSrc.includes('synthesesRoutes.post("/advice", requireAuth'))
    errs.push("4m: POST /syntheses/advice без requireAuth либо не смонтирован");
  // 1.6: срез /estimate ограничен началом блока роутов чтения — иначе
  // duplicate/DELETE ниже по файлу ложно срабатывали как «запись из estimate»
  const estEnd = routeSrc.indexOf("Беседа 1.6: транспорт чтения");
  const estSlice = routeSrc.slice(
    routeSrc.indexOf('synthesesRoutes.post("/estimate"'),
    estEnd === -1 ? undefined : estEnd,
  );
  const advSlice = routeSrc.slice(
    routeSrc.indexOf('synthesesRoutes.post("/advice"'),
    routeSrc.indexOf('synthesesRoutes.post("/estimate"'),
  );
  for (const [name, slice] of [["estimate", estSlice], ["advice", advSlice]] as const) {
    if (/db\.(insert|update|delete)\(/.test(slice))
      errs.push(`4m: ${name} пишет в БД — эндпоинт обязан быть чистым`);
  }
  for (const fn of ["resolveContextDeps", "buildEffectiveDeps", "buildDynamicOrder",
    "buildSectionDefs", "groupPasses", "buildSYS", "estimateCost"]) {
    if (!estSlice.includes(fn + "("))
      errs.push(`4m: конвейер /estimate не зовёт ${fn} (зеркало generation-service)`);
  }
  if (!routeSrc.includes('"NO_PARTICIPANTS_SEED_REQUIRED"'))
    errs.push("4m: код NO_PARTICIPANTS_SEED_REQUIRED (03 §4.3) не используется роутом");
  const apiSrc = await rd("../client/src/api/syntheses.ts");
  for (const path of ["/syntheses/estimate", "/syntheses/advice"]) {
    if (!apiSrc.includes(`"${path}"`)) errs.push(`4m: client api не зовёт ${path}`);
  }
  for (const field of ["inTokens", "outTokens", "cost", "passes"]) {
    if (!apiSrc.includes(field)) errs.push(`4m: SynthesisEstimate без поля ${field} (FullCostEstimate)`);
  }
  const pageSrc = await rd("../client/src/pages/CreateSynthesisPage.tsx");
  if (!(pageSrc.includes('mode === "skip"') && pageSrc.includes("window.confirm")))
    errs.push("4m: confirm деградации перед resume_generation(skip) не найден (адаптация 1.4b→1.5)");
  const hookSrc = await rd("../client/src/hooks/useStreamingGeneration.ts");
  if (!hookSrc.includes("?resume=")) errs.push("4m: useStreamingGeneration без ?resume= (§3.3)");
  if (!hookSrc.includes('"subscribe_generation"')) errs.push("4m: хук не шлёт subscribe_generation");
  const formSrc = await rd("../client/src/components/synthesis/SynthesisForm.tsx");
  if (!formSrc.includes("хотя бы один раздел")) errs.push("4m: форма без валидации «0 секций»");
  if (!formSrc.includes("conceptParticipants.length > 0"))
    errs.push("4m: keepFullBudget не условен по концепциям пула");
  if (!formSrc.includes("fetchSynthesisAdvice")) errs.push("4m: форма не тянет совет (advisor)");
  for (const rel of ["../client/src/api/syntheses.ts", "../client/src/hooks/useStreamingGeneration.ts",
    "../client/src/pages/CreateSynthesisPage.tsx"]) {
    const src = await rd(rel);
    if (/localStorage|sessionStorage/.test(src))
      errs.push(`4m: browser storage запрещён (${rel})`);
  }
}

// ── 5m (беседа 1.5): живые /estimate и /advice + код свободного синтеза ──
{
  const { Hono: Hono5m } = await import("hono");
  const { synthesesRoutes: routes5m } = await import("./routes/syntheses.js");
  const { db: db5m, schema: sch5m } = await import("./db/index.js");
  const { eq: eq5m } = await import("drizzle-orm");
  const authMod5m = await import("./middleware/auth.js");
  const { env: env5m } = await import("./env.js");
  const [u5m] = await db5m.insert(sch5m.users)
    .values({ email: `i15-${Date.now()}@check.local`, passwordHash: await authMod5m.hashPassword("pw-15-check") })
    .returning({ id: sch5m.users.id });
  const uid5m = (u5m as { id: string }).id;
  try {
    const { token: tok5m } = await authMod5m.createSession(uid5m);
    const cookie5m = `${env5m.session.cookieName}=${tok5m}`;
    const app5m = new Hono5m();
    app5m.route("/api/v1/syntheses", routes5m);
    const post5m = (path: string, body: unknown, withAuth = true) =>
      app5m.request(`http://local${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(withAuth ? { cookie: cookie5m } : {}) },
        body: JSON.stringify(body),
      });

    const er = await post5m("/api/v1/syntheses/estimate", {
      seed: "проверка", philosophers: ["Кант"], sections: ["graph", "glossary"],
      method: "dialectical", depth: "standard", synthLevel: "comparative",
    });
    const ej = (await er.json()) as { estimate?: { cost: number; inTokens: number; outTokens: number; passes: number } };
    if (er.status !== 200 || !ej.estimate) errs.push("5m: /estimate не вернул estimate: " + er.status);
    else {
      if (!(ej.estimate.cost > 0 && ej.estimate.inTokens > 0 && ej.estimate.outTokens > 0))
        errs.push("5m: /estimate вернул нулевые оценки");
      if (ej.estimate.passes !== 3) errs.push("5m: /estimate passes ≠ 3 (sum+graph+glossary): " + ej.estimate.passes);
    }

    const ar = await post5m("/api/v1/syntheses/advice", {
      sections: ["evolution"], method: "creative", synthLevel: "comparative",
    });
    const aj = (await ar.json()) as {
      entry?: { severity: string; icon: string; title: string } | null;
      advice?: { warnings: { icon: string; text: string }[] };
    };
    if (ar.status !== 200 || !aj.advice) errs.push("5m: /advice не ответил: " + ar.status);
    else {
      if (aj.entry?.severity !== "stable" || aj.entry?.icon !== "★")
        errs.push("5m: entry comparative:creative ≠ stable/★");
      if (!aj.advice.warnings.some((w) => w.text.includes("Эволюция и перспективы")))
        errs.push("5m: warnings не содержат зависимость evolution");
    }

    const noAuth = await post5m("/api/v1/syntheses/estimate", { sections: [] }, false);
    if (noAuth.status !== 401) errs.push("5m: /estimate без сессии обязан отдавать 401");

    const np = await post5m("/api/v1/syntheses", {
      sections: ["glossary"], method: "dialectical", depth: "standard", synthLevel: "comparative",
    });
    const npj = (await np.json()) as { code?: string };
    if (np.status !== 400 || npj.code !== "NO_PARTICIPANTS_SEED_REQUIRED")
      errs.push(`5m: свободный синтез без seed → ожидался 400 NO_PARTICIPANTS_SEED_REQUIRED, получено ${np.status}/${npj.code}`);
    const rows5m = await db5m.select({ id: sch5m.syntheses.id }).from(sch5m.syntheses)
      .where(eq5m(sch5m.syntheses.userId, uid5m));
    if (rows5m.length !== 0) errs.push("5m: отклонённый POST создал запись syntheses");
  } finally {
    await db5m.delete(sch5m.users).where(eq5m(sch5m.users.id, uid5m)); // CASCADE
  }
}

// ── 2k. Модули беседы 1.6: routes/sections, routes/elements, расширение syntheses ──
{
  need(await import("./routes/sections.js"), ["sectionsRoutes"], "routes/sections (1.6)");
  need(await import("./routes/elements.js"), ["elementsRoutes"], "routes/elements (1.6, только GET)");
  const rt2k = await import("./routes/syntheses.js");
  need(rt2k, ["synthesesRoutes", "loadSynthesisForRead", "makeDocNum", "isUuid",
    "notFoundJson", "forbiddenJson"], "routes/syntheses (расширение 1.6)");
  const dn2k = rt2k.makeDocNum();
  if (!/^PS-\d{4}-[0-9A-Z]{4}$/.test(dn2k))
    errs.push("2k: makeDocNum вне маски PS-NNNN-XXXX ([12110]): " + dn2k);
  if (rt2k.isUuid("not-a-uuid") || !rt2k.isUuid("00000000-0000-4000-8000-000000000000"))
    errs.push("2k: isUuid неверно классифицирует");
  // Типовые присваивания (арность/асинхронность под tsc)
  const _t70: (id: string, userId: string) => Promise<
    { access: "ok"; row: unknown } | { access: "notfound" } | { access: "forbidden" }
  > = rt2k.loadSynthesisForRead;
  const _t71: () => string = rt2k.makeDocNum;
  const _t72: (v: string) => boolean = rt2k.isUuid;
}

// ── 2l. Модули беседы 2.1: cascade-analyzer, edit-planner, plan-order-builder, routes/plans ──
{
  const ca2l = await import("./services/cascade-analyzer.js");
  need(ca2l, ["computeDependents", "canonicalSubsectionKey", "canonicalSubsectionKeyWith",
    "getCanonicalizer", "getIntraDependents", "getCrossSecDependents", "getAffectedModes",
    "sortInTopoOrder", "buildCtxKeyConsumers", "buildFactualDepsMap", "computeFactualDependents",
    "analyzeImpact", "sourceOf", "buildPlanOrder", "MODE_TITLES",
    "getEffectiveModeDepsFromConfig", "loadModesState", "PORTRAIT_CANON",
  ], "services/cascade-analyzer (2.1)");
  const pob2l = await import("./services/plan-order-builder.js");
  need(pob2l, ["buildPlanOrder"], "services/plan-order-builder (2.1)");
  const ts2l = await import("./utils/topo-sort.js");
  // Реэкспорты соответствия карте 04 — тождественны, не дубликаты
  if (!Object.is(ca2l.sourceOf, ts2l.sourceOf))
    errs.push("2l: sourceOf в cascade-analyzer — не реэкспорт из topo-sort (1.1)");
  if (!Object.is(ca2l.buildPlanOrder, pob2l.buildPlanOrder))
    errs.push("2l: buildPlanOrder в cascade-analyzer — не реэкспорт из plan-order-builder (05)");
  const ep2l = await import("./services/edit-planner.js");
  need(ep2l, ["createPlan", "updatePlan", "getPlan", "deletePlan", "estimatePlanCost",
    "PlanError", "toApiPlan", "loadPlanRow"], "services/edit-planner (2.1)");
  const ce2l = await import("./services/cost-estimator.js");
  need(ce2l, ["estimateCascadeWaveCost", "formatWaveCost"],
    "cost-estimator (wave-функции — долг 1.1, закрыт 2.1)");
  need(await import("./routes/plans.js"), ["plansRoutes"], "routes/plans (2.1)");
  // 1.4b: loadActualOutputChars стал export — потребитель estimatePlanCost
  need(await import("./services/pause-resume-service.js"), ["loadActualOutputChars"],
    "pause-resume-service (export loadActualOutputChars, 2.1)");
  // Типовые присваивания (арность/асинхронность под tsc)
  type DepsMap2l = import("./utils/deep-merge.js").DepsMap;
  const _t80: (effectiveDeps: DepsMap2l) => Record<string, Set<string>> = ca2l.computeDependents;
  const _t81: (sectionOrder: readonly string[], keys: Iterable<string>) => string[] = ca2l.sortInTopoOrder;
  const _t82: (est: { cost: number; items: number } | null) => string = ce2l.formatWaveCost;
  const _t83: (sectionKey: string, subsectionName: string) => Promise<string> = ca2l.canonicalSubsectionKey;
}

// ── 4o. Контрактные проверки беседы 1.6 (транспорт чтения) ──
{
  const fsm = await import("node:fs/promises");
  const rd = (rel: string) => fsm.readFile(new URL(rel, import.meta.url), "utf8");

  const rs = await rd("./routes/syntheses.ts");
  // Порядок регистрации Hono: GET /public строго ДО GET /:id
  const iPub = rs.indexOf('synthesesRoutes.get("/public"');
  const iById = rs.indexOf('synthesesRoutes.get("/:id"');
  if (iPub === -1 || iById === -1 || iPub > iById)
    errs.push("4o: GET /public обязан регистрироваться ДО GET /:id (оба матчат /syntheses/public)");
  // Формула docNum [12110] дословно + заполнение в POST
  if (!rs.includes("Math.floor(Math.random() * 9000 + 1000)") ||
      !rs.includes("Date.now().toString(36).toUpperCase().slice(-4)"))
    errs.push("4o: makeDocNum не по формуле исходника [12110]");
  if (!rs.includes("docNum: makeDocNum()")) errs.push("4o: POST не заполняет doc_num (пункт 4)");
  if (!rs.includes('structureSections: ["sum", ...sections]'))
    errs.push("4o: POST без снимка structure_sections (пункт 6)");
  // requireAuth на всех новых роутах
  for (const sig of ['synthesesRoutes.get("/", requireAuth',
    'synthesesRoutes.get("/public", requireAuth', 'synthesesRoutes.get("/:id", requireAuth',
    'synthesesRoutes.patch("/:id", requireAuth', 'synthesesRoutes.delete("/:id", requireAuth',
    'synthesesRoutes.post("/:id/duplicate", requireAuth']) {
    if (!rs.includes(sig)) errs.push(`4o: роут без requireAuth либо не найден: ${sig}`);
  }
  // duplicate: генеалогия родителей переносится, связи с оригиналом и логов нет
  const dupSlice = rs.slice(rs.indexOf('"/:id/duplicate"'));
  if (!dupSlice.includes("parentSynthesisId: r.parentSynthesisId"))
    errs.push("4o: duplicate не переносит генеалогию родителей");
  if (/insert\((?:generationLog|contextLog)\)/.test(dupSlice))
    errs.push("4o: duplicate копирует логи (история, не контент)");
  if (!dupSlice.includes("GENERATION_IN_PROGRESS"))
    errs.push("4o: duplicate без отказа при активной генерации");

  const sec = await rd("./routes/sections.ts");
  if (!sec.includes("TODO(2.4)")) errs.push("4o: contextQualityScore=null без метки TODO(2.4)");
  if (!sec.includes("parseSubsectionsFromHTML"))
    errs.push("4o: subsections не через порт 1.4 (generation-service)");
  if (!sec.includes("buildContextForSection"))
    errs.push("4o: /:key/context не через живой buildContextForSection (03 §2.3)");
  if (!sec.includes("loadSynthesisForRead")) errs.push("4o: sections без общей проверки доступа");

  const el = await rd("./routes/elements.ts");
  if (/elementsRoutes\.(patch|post|put|delete)\(/.test(el))
    errs.push("4o: elements.ts содержит не-GET роуты (PATCH-часть — беседа 5.1)");
  if (!el.includes("loadSynthesisForRead")) errs.push("4o: elements без общей проверки доступа");

  const wh = await rd("./ws/handler.ts");
  const hs = wh.slice(wh.indexOf("async function handleSubscribeGeneration"));
  const iView = hs.indexOf("if (viewOnly)");
  const iGen = hs.indexOf("generateSynthesis(");
  if (iView === -1 || iGen === -1 || iView > iGen)
    errs.push("4o: ветка viewOnly обязана стоять ДО запуска generateSynthesis (пункт 5)");

  const ix = await rd("./index.ts");
  for (const m of ["sectionsRoutes", "elementsRoutes"]) {
    if (!ix.includes(m)) errs.push(`4o: ${m} не смонтирован в index.ts (пункт 9)`);
  }

  // Shared-типы дополнены под 03 §2.2/§2.3/§3.1
  if (!(await rd("../packages/shared/types/synthesis.ts")).includes("pauseEstimates: PauseEstimates | null"))
    errs.push("4o: SynthesisFull без pauseEstimates");
  if (!(await rd("../packages/shared/types/section.ts")).includes("subsections: string[]"))
    errs.push("4o: SectionSummary без subsections");
  if (!(await rd("../packages/shared/types/ws-messages.ts")).includes("viewOnly?: boolean"))
    errs.push("4o: WsSubscribeGeneration без viewOnly");

  // Маркеров TODO(1.6) в дереве не осталось (пункт 8; клиентские → TODO(1.6b))
  const pathMod = await import("node:path");
  async function walk4o(dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const e of await fsm.readdir(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
      const p = pathMod.join(dir, e.name);
      if (e.isDirectory()) out.push(...(await walk4o(p)));
      else if (/\.(ts|tsx|mts|mjs)$/.test(e.name)) out.push(p);
    }
    return out;
  }
  const here4o = new URL(".", import.meta.url).pathname;
  for (const root of [here4o, pathMod.join(here4o, "../client/src"),
    pathMod.join(here4o, "../packages")]) {
    for (const f of await walk4o(root)) {
      if (f.endsWith("integration-check.mts")) continue;
      if ((await fsm.readFile(f, "utf8")).includes("TODO(1.6)"))
        errs.push(`4o: остался маркер TODO(1.6): ${f}`);
    }
  }
}

// ── 5n (беседа 1.6): живой транспорт чтения против БД (ДО секции 5) ──
{
  const { Hono: Hono5n } = await import("hono");
  const rt5n = await import("./routes/syntheses.js");
  const { sectionsRoutes: secR5n } = await import("./routes/sections.js");
  const { elementsRoutes: elR5n } = await import("./routes/elements.js");
  const { db: db5n, schema: sch5n } = await import("./db/index.js");
  const { eq: eq5n } = await import("drizzle-orm");
  const authMod5n = await import("./middleware/auth.js");
  const { env: env5n } = await import("./env.js");

  const [u5n] = await db5n.insert(sch5n.users)
    .values({ email: `i16-${Date.now()}@check.local`, passwordHash: await authMod5n.hashPassword("pw-16-check") })
    .returning({ id: sch5n.users.id });
  const uid5n = (u5n as { id: string }).id;
  try {
    const { token: tok5n } = await authMod5n.createSession(uid5n);
    const cookie5n = `${env5n.session.cookieName}=${tok5n}`;
    const app5n = new Hono5n();
    app5n.route("/api/v1/syntheses", rt5n.synthesesRoutes);
    app5n.route("/api/v1/syntheses", secR5n);
    app5n.route("/api/v1/syntheses", elR5n);
    const req5n = async (method: string, path: string, body?: unknown) => {
      const r = await app5n.request(`http://local/api/v1${path}`, {
        method,
        headers: { "content-type": "application/json", cookie: cookie5n },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      let j: unknown = null;
      try { j = await r.json(); } catch { /* не-JSON */ }
      return { status: r.status, body: j };
    };

    // Прямые вставки: ready-синтез + разделы + мини-граф с рефлексивным ребром
    const [s5n] = await db5n.insert(sch5n.syntheses).values({
      userId: uid5n, seed: "интеграционный синтез 1.6", status: "ready",
      title: "Интеграционный синтез 1.6", docNum: rt5n.makeDocNum(),
      sectionOrder: ["sum", "graph"], structureSections: ["sum", "graph"],
    }).returning({ id: sch5n.syntheses.id });
    const sid5n = (s5n as { id: string }).id;
    await db5n.insert(sch5n.synthesisLineage).values({
      synthesisId: sid5n, parentType: "philosopher", parentName: "Кант", position: 0,
    });
    await db5n.insert(sch5n.sections).values([
      { synthesisId: sid5n, key: "sum", sectionNum: 1, title: "Резюме",
        htmlContent: '<div data-section="Цели и задачи"><p>Цели.</p></div>' },
      { synthesisId: sid5n, key: "graph", sectionNum: 2, title: "Граф",
        htmlContent: '<div data-section="Узлы"><table class="doc-table"><tr><td>x</td></tr></table></div>' },
    ]);
    const cats5n = await db5n.insert(sch5n.categories).values([
      { synthesisId: sid5n, name: "Опосредование", position: 0 },
      { synthesisId: sid5n, name: "Тотальность", position: 1 },
    ]).returning({ id: sch5n.categories.id });
    await db5n.insert(sch5n.categoryEdges).values({
      synthesisId: sid5n,
      sourceId: (cats5n[0] as { id: string }).id,
      targetId: (cats5n[0] as { id: string }).id,
      direction: "рефлексивная", position: 0,
    });
    await db5n.insert(sch5n.clusterLabels).values({
      synthesisId: sid5n, clusterIndex: 0, label: "I — Основания",
    });

    const list5n = await req5n("GET", "/syntheses");
    const listBody5n = list5n.body as { items: { id: string }[] };
    if (list5n.status !== 200 ||
        !listBody5n.items?.some((s) => s.id === sid5n))
      errs.push("5n: GET /syntheses не вернул вставленный синтез");
    const full5n = ((await req5n("GET", `/syntheses/${sid5n}`)).body as {
      synthesis: Record<string, unknown>;
    }).synthesis;
    if (!/^PS-\d{4}-[0-9A-Z]{4}$/.test(String(full5n?.docNum)))
      errs.push("5n: docNum вне маски");
    if ((full5n?.philosophers as string[])?.join() !== "Кант")
      errs.push("5n: философы не из lineage");
    if (full5n?.pausedState !== null || full5n?.pauseEstimates !== null)
      errs.push("5n: у обычного синтеза pausedState/pauseEstimates обязаны быть null");
    const secs5n = ((await req5n("GET", `/syntheses/${sid5n}/sections`)).body as {
      sections: { key: string; subsections: string[]; contextQualityScore: unknown }[];
    }).sections;
    if (secs5n?.map((s) => s.key).join() !== "sum,graph")
      errs.push("5n: /sections не в порядке sectionOrder");
    if (!secs5n?.[1]?.subsections?.includes("Узлы"))
      errs.push("5n: subsections не извлечены из HTML");
    if (!secs5n?.every((s) => s.contextQualityScore === null))
      errs.push("5n: contextQualityScore ≠ null (TODO(2.4))");
    const g5n = (await req5n("GET", `/syntheses/${sid5n}/categories`)).body as {
      categories: unknown[]; edges: unknown[];
      topology: { hasReflexiveEdges: boolean };
    };
    if (g5n?.categories?.length !== 2 || g5n?.edges?.length !== 1)
      errs.push("5n: /categories вернул не 2/1");
    if (g5n?.topology?.hasReflexiveEdges !== true)
      errs.push("5n: hasReflexiveEdges не увидел рефлексивное ребро");
    const patched5n = await req5n("PATCH", `/syntheses/${sid5n}`, { isPublic: true });
    const patchedBody5n = patched5n.body as { synthesis?: { isPublic: boolean } };
    if (patched5n.status !== 200 || patchedBody5n.synthesis?.isPublic !== true)
      errs.push("5n: PATCH isPublic не сработал");
    const dup5n = await req5n("POST", `/syntheses/${sid5n}/duplicate`);
    const copyId5n = (dup5n.body as { id?: string })?.id;
    if (dup5n.status !== 201 || !copyId5n) errs.push("5n: duplicate не вернул id");
    else {
      const copyFull5n = ((await req5n("GET", `/syntheses/${copyId5n}`)).body as {
        synthesis: Record<string, unknown>;
      }).synthesis;
      if (!String(copyFull5n?.title).endsWith(" (копия)") || copyFull5n?.isPublic !== false)
        errs.push("5n: копия без « (копия)» либо публична");
      if ((copyFull5n?.parentSyntheses as { id: string }[])?.some((s) => s.id === sid5n))
        errs.push("5n: у копии появилась lineage-связь с оригиналом");
      const del5n = await req5n("DELETE", `/syntheses/${copyId5n}`);
      if (del5n.status !== 200) errs.push("5n: DELETE копии не 200");
      if ((await req5n("GET", `/syntheses/${copyId5n}`)).status !== 404)
        errs.push("5n: копия жива после DELETE");
    }
  } finally {
    await db5n.delete(sch5n.users).where(eq5n(sch5n.users.id, uid5n)); // CASCADE
  }
}

// ── 5o (беседа 2.1): живой планировщик против БД (ДО секции 5) ──
{
  const ca5o = await import("./services/cascade-analyzer.js");
  const ep5o = await import("./services/edit-planner.js");
  const { db: db5o, schema: sch5o } = await import("./db/index.js");
  const { eq: eq5o } = await import("drizzle-orm");
  const [u5o] = await db5o.insert(sch5o.users)
    .values({ email: `i21-${Date.now()}@check.local`, passwordHash: "x" })
    .returning({ id: sch5o.users.id });
  const uid5o = (u5o as { id: string }).id;
  try {
    const [s5o] = await db5o.insert(sch5o.syntheses).values({
      userId: uid5o, seed: "интеграционный синтез 2.1", status: "ready",
      sectionOrder: ["sum", "graph", "theses"],
    }).returning({ id: sch5o.syntheses.id });
    const sid5o = (s5o as { id: string }).id;
    await db5o.insert(sch5o.synthesisLineage).values([
      { synthesisId: sid5o, parentType: "philosopher", parentName: "Кант", position: 0 },
      { synthesisId: sid5o, parentType: "philosopher", parentName: "Гегель", position: 1 },
    ]);
    await db5o.insert(sch5o.generationLog).values(["graph", "theses"].map((k) => ({
      synthesisId: sid5o, logType: "generation" as const, sectionKey: k, status: "done" as const,
      outputChars: 4000, inputTokens: 10, outputTokens: 20,
    })));

    // Каскад: theses зависит от graph (required graph:nodes_compact/graph:edges)
    const imp5o = await ca5o.analyzeImpact(sid5o, { regen: ["graph"], remove: [], add: [] });
    if (!imp5o.affectedSections.includes("theses"))
      errs.push("5o: analyzeImpact не видит theses в downstream graph");
    if (imp5o.affectedSections.includes("sum") || imp5o.affectedSections.includes("graph"))
      errs.push("5o: в affectedSections попал sum или сама операция плана");

    // createPlan: пользовательский confirmed, каскадный pending/cascadeGenerated,
    // порядок buildPlanOrder (graph раньше theses)
    const plan5o = await ep5o.createPlan(sid5o, uid5o, { regen: ["graph"], remove: [], add: [] });
    const st5o = plan5o.steps;
    const user5o = st5o.find((s) => s.type === "regen" && s.target === "graph");
    const casc5o = st5o.find((s) => s.type === "regen" && s.target === "theses");
    if (!user5o || user5o.status !== "confirmed" || user5o.cascadeGenerated)
      errs.push("5o: пользовательский шаг regen graph не confirmed-пользовательский");
    if (!casc5o || casc5o.status !== "pending" || !casc5o.cascadeGenerated)
      errs.push("5o: каскадный шаг theses не pending/cascadeGenerated");
    if (st5o.findIndex((s) => s.type === "regen" && s.target === "graph") >
        st5o.findIndex((s) => s.type === "regen" && s.target === "theses"))
      errs.push("5o: buildPlanOrder нарушен (theses раньше graph)");
    if (!(typeof plan5o.estimatedCost === "number" && plan5o.estimatedCost > 0))
      errs.push("5o: estimatedCost плана не положителен");

    // PATCH-семантика: skip единственного базового шага → каскад исчезает
    const regenIdx5o = st5o.findIndex((s) => s.type === "regen" && s.target === "graph");
    const upd5o = await ep5o.updatePlan(sid5o, plan5o.id, uid5o, {
      steps: [{ index: regenIdx5o, status: "skipped" }],
    });
    if (!upd5o.steps.some((s) => s.type === "regen" && s.target === "graph" && s.status === "skipped"))
      errs.push("5o: skip базового шага не применился (шаг обязан ОСТАТЬСЯ skipped)");
    if (upd5o.steps.some((s) => s.cascadeGenerated))
      errs.push("5o: каскадные шаги пережили снятие единственного базового");

    // Коды PlanError: regen∩remove, чужой доступ, удаление
    let code5oA = "";
    try { await ep5o.createPlan(sid5o, uid5o, { regen: ["graph"], remove: ["graph"], add: [] }); }
    catch (e) { code5oA = e instanceof ep5o.PlanError ? e.code : String(e); }
    if (code5oA !== "VALIDATION_ERROR") errs.push("5o: regen∩remove не даёт VALIDATION_ERROR: " + code5oA);
    let code5oB = "";
    try { await ep5o.getPlan(sid5o, plan5o.id, "00000000-0000-4000-8000-000000000001"); }
    catch (e) { code5oB = e instanceof ep5o.PlanError ? e.code : String(e); }
    if (code5oB !== "FORBIDDEN") errs.push("5o: чужой getPlan не FORBIDDEN: " + code5oB);
    await ep5o.deletePlan(sid5o, plan5o.id, uid5o);
    let code5oC = "";
    try { await ep5o.getPlan(sid5o, plan5o.id, uid5o); }
    catch (e) { code5oC = e instanceof ep5o.PlanError ? e.code : String(e); }
    if (code5oC !== "NOT_FOUND") errs.push("5o: план жив после deletePlan: " + code5oC);
  } finally {
    await db5o.delete(sch5o.users).where(eq5o(sch5o.users.id, uid5o)); // CASCADE
  }
}

// ── 5. Async-цепочки: реальный запрос через db и через sql ──
import { db, sql, closeDb } from "./db/index.js";
const viaRaw = await sql`SELECT 1 AS one`;
if (viaRaw[0]?.one !== 1) errs.push("await sql: неожиданный результат");
const viaDrizzle = await db.query.users.findMany({ limit: 1 });
if (!Array.isArray(viaDrizzle)) errs.push("await db.query: не массив");
// ── 5p (беседа 2.2): живой deleteSection против БД (без стрима) ──
{
  const { db } = await import("./db/index.js");
  const sch = await import("./db/schema.js");
  const gs5p = await import("./services/generation-service.js");
  const { eq, and } = await import("drizzle-orm");
  const [u] = await db.insert(sch.users).values({
    email: `ic5p-${Date.now()}@x.ru`, passwordHash: "x", displayName: "5p",
  }).returning();
  const order = ["sum", "graph", "theses"];
  const [sy] = await db.insert(sch.syntheses).values({
    userId: (u as { id: string }).id, seed: "5p", sectionOrder: order,
    status: "ready",
  }).returning();
  const sid = (sy as { id: string }).id;
  const names: Record<string, string> = { sum: "Свод", graph: "Граф категорий", theses: "Корпус тезисов" };
  for (let i = 0; i < order.length; i++) {
    await db.insert(sch.sections).values({
      synthesisId: sid, key: order[i] as string, sectionNum: i + 1,
      title: names[order[i] as string] as string,
      htmlContent: `<div data-section="x"><p>Раздел ${i + 1}, см. § 2 и § 3.</p></div>`,
      secContext: "",
    });
  }
  await gs5p.deleteSection(sid, "graph");
  const [row5p] = await db.select({ so: sch.syntheses.sectionOrder })
    .from(sch.syntheses).where(eq(sch.syntheses.id, sid));
  if (JSON.stringify(row5p?.so) !== JSON.stringify(["sum", "theses"]))
    errs.push("5p: sectionOrder после deleteSection неверен");
  const [th5p] = await db.select({ num: sch.sections.sectionNum, html: sch.sections.htmlContent })
    .from(sch.sections)
    .where(and(eq(sch.sections.synthesisId, sid), eq(sch.sections.key, "theses")));
  if (th5p?.num !== 2)
    errs.push("5p: перенумерация после удаления неверна (theses должен стать § 2)");
  if (!th5p?.html.includes("§ 2 [удалён]") || !th5p?.html.includes("и § 2."))
    errs.push("5p: ссылки §N не перенумерованы/не помечены [удалён]");
  const [dm5p] = await db.select({ m: sch.generationLog.metadata })
    .from(sch.generationLog)
    .where(and(eq(sch.generationLog.synthesisId, sid),
      eq(sch.generationLog.logType, "deletion_marker")));
  if ((dm5p?.m as { sectionNum?: number } | null)?.sectionNum !== 2)
    errs.push("5p: deletion_marker без номера удалённого раздела");
  // Чистые функции 2.2 на живых конфигах
  const reps = await gs5p.buildDeletionReplacements("graph", ["sum", "glossary"], "architectural");
  if (!Array.isArray(reps) || reps.some((r) => !r.key || typeof r.quality !== "number"))
    errs.push("5p: buildDeletionReplacements сломан");
  await db.delete(sch.syntheses).where(eq(sch.syntheses.id, sid));
  await db.delete(sch.users).where(eq(sch.users.id, (u as { id: string }).id));
}

// 1.4b: singleton Redis переоткрывался в 5k и держал event loop после
// INTEGRATION OK (процесс не завершался сам) — закрываем явно
await rClose();
// closeDb возвращает Promise<void> и реально ждёт закрытия
const p = closeDb();
if (!(p instanceof Promise)) errs.push("closeDb не Promise");
await p;
// после закрытия запрос обязан отклониться — await пробрасывает reject
let rejected = false;
try { await sql`SELECT 1`; } catch { rejected = true; }
if (!rejected) errs.push("await после closeDb не отклонился (пул не закрыт?)");


// ── 4n (беседа 1.5b): Unified Concept Pool — клиент-модули + контракты ──
{
  const cm = clientModule;
  need(await cm("../client/src/stores/pool-store.ts"), ["usePoolStore"], "client/stores/pool-store");
  need(await cm("../client/src/utils/concept-file.ts"), [
    "parseConceptFile", "importConceptAsParticipant", "titleToKey",
    "truncateText", "tableToText", "extractSection", "extractGlossaryCompact",
    "extractThesesSummary", "extractGraphNodesTable", "extractGraphEdgesTable",
    "extractContextFragment", "extractCapsuleText", "extractMetadata",
    "extractSections", "extractEmbeddedState", "fetchWithFallback",
  ], "client/utils/concept-file");
  need(await cm("../client/src/components/pool/PoolCard.tsx"), ["PoolCard"], "client/pool/PoolCard");
  need(await cm("../client/src/components/pool/ConceptPool.tsx"), ["ConceptPool"], "client/pool/ConceptPool");
  need(await cm("../client/src/components/synthesis/SectionPicker.tsx"),
    ["SectionPicker", "SYNTH_READY_SECTIONS"], "client/synthesis/SectionPicker (1.5b: secSynthReady)");

  const fsm = await import("node:fs/promises");
  const rd = (rel: string) => fsm.readFile(new URL(rel, import.meta.url), "utf8");
  const storeSrc = await rd("../client/src/stores/pool-store.ts");
  for (const act of ["addToPool", "removeFromPool", "renamePoolConcept",
    "toggleSynthParticipant", "selectForViewing", "refreshPoolParticipant",
    "refreshAllSynthParticipants", "prepareForGeneration", "setPoolStatus"]) {
    if (!storeSrc.includes(act + ":")) errs.push(`4n: pool-store без действия ${act}`);
  }
  if (/snapshotCurrentState\s*[:(]/.test(storeSrc))
    errs.push("4n: snapshotCurrentState не должен существовать в сервисе (снимки вырождены — 07 «По факту 1.5b»)");
  const formSrc15b = await rd("../client/src/components/synthesis/SynthesisForm.tsx");
  if (!formSrc15b.includes("usePoolStore")) errs.push("4n: форма не читает пул из pool-store");
  if (!formSrc15b.includes("<ConceptPool />")) errs.push("4n: ConceptPool не встроен в форму");
  if (!formSrc15b.includes("Мета-синтез с концепциями-участниками"))
    errs.push("4n: сабмит с ☑-концепциями не блокируется (гейт до 3.1/4.3)");
  if (!formSrc15b.includes("CONTEXT_BUDGET_PREVIEW"))
    errs.push("4n: превью бюджета без клиентской копии CONTEXT_BUDGET (дрейф-риск обязан быть локализован и помечен)");
  const pageSrc15b = await rd("../client/src/pages/CreateSynthesisPage.tsx");
  if (!pageSrc15b.includes("prepareForGeneration()")) errs.push("4n: prepareForGeneration не зовётся перед POST");
  const cfSrc = await rd("../client/src/utils/concept-file.ts");
  if (!cfSrc.includes("TODO(3.1/3.2)")) errs.push("4n: отступление genealogy=null не помечено TODO(3.1/3.2)");
  for (const rel of ["../client/src/stores/pool-store.ts", "../client/src/utils/concept-file.ts",
    "../client/src/components/pool/ConceptPool.tsx", "../client/src/components/pool/PoolCard.tsx"]) {
    const src = await rd(rel);
    if (/localStorage|sessionStorage/.test(src)) errs.push(`4n: browser storage запрещён (${rel})`);
  }
}

// ── 4p (беседа 1.6b): просмотр документа + каталог — клиент-модули + контракты ──
{
  const cm = clientModule;
  need(await cm("../client/src/api/sections.ts"), ["getSections", "getSection"], "client/api/sections");
  need(await cm("../client/src/stores/synthesis-store.ts"), ["useSynthesisStore"], "client/stores/synthesis-store");
  need(await cm("../client/src/components/document/DocumentView.tsx"), ["DocumentView"], "client/document/DocumentView");
  need(await cm("../client/src/components/document/DocumentHeader.tsx"), ["DocumentHeader"], "client/document/DocumentHeader");
  need(await cm("../client/src/components/document/SectionView.tsx"),
    ["SectionView", "enrichSectionHtml"], "client/document/SectionView");
  need(await cm("../client/src/components/document/TableOfContents.tsx"),
    ["TableOfContents", "subsectionSlugId"], "client/document/TableOfContents");
  need(await cm("../client/src/components/document/DocumentFooter.tsx"), ["DocumentFooter"], "client/document/DocumentFooter");
  need(await cm("../client/src/components/catalog/SynthesisCard.tsx"), ["SynthesisCard"], "client/catalog/SynthesisCard");
  need(await cm("../client/src/components/catalog/SynthesisList.tsx"), ["SynthesisList"], "client/catalog/SynthesisList");
  need(await cm("../client/src/components/shared/LoadingSpinner.tsx"), ["LoadingSpinner"], "client/shared/LoadingSpinner");

  const fsm = await import("node:fs/promises");
  const rd = (rel: string) => fsm.readFile(new URL(rel, import.meta.url), "utf8");

  // ГРАБЛЯ 1.6b: пострендер-мутации внутри dangerouslySetInnerHTML
  // стираются при hash-навигации — якоря/⏫ обязаны жить В СТРОКЕ
  const svSrc = await rd("../client/src/components/document/SectionView.tsx");
  if (svSrc.includes("useEffect"))
    errs.push("4p: SectionView не должен вставлять якоря эффектом (React пере-применяет innerHTML при hash-навигации — 07 «По факту 1.6b»)");
  if (!svSrc.includes("DOMParser") || !svSrc.includes("enrichSectionHtml"))
    errs.push("4p: SectionView без обогащения HTML-строки (enrichSectionHtml/DOMParser)");
  if (!/import \{ subsectionSlugId \} from "\.\/TableOfContents"/.test(svSrc))
    errs.push("4p: SectionView не переиспользует subsectionSlugId из TableOfContents (риск дрейфа слугов)");

  const tocSrc = await rd("../client/src/components/document/TableOfContents.tsx");
  if (!tocSrc.includes("[^a-zA-Zа-яА-ЯёЁ0-9]"))
    errs.push("4p: слуг-регексп buildTableOfContents не дословный ([^a-zA-Zа-яА-ЯёЁ0-9])");
  if (!tocSrc.includes('key !== "capsule"'))
    errs.push("4p: TOC не пропускает ключ capsule");
  if (!tocSrc.includes("visible.length < 2"))
    errs.push("4p: TOC не скрывается при <2 разделах (порт buildTableOfContents)");

  const dvSrc = await rd("../client/src/components/document/DocumentView.tsx");
  if (!dvSrc.includes('s.key !== "capsule"'))
    errs.push("4p: DocumentView не исключает capsule из тел (removeCapsuleFromDocBodies)");

  const dhSrc = await rd("../client/src/components/document/DocumentHeader.tsx");
  if (!dhSrc.includes('extractCapsuleText } from "../../utils/concept-file"'))
    errs.push("4p: DocumentHeader не переиспользует extractCapsuleText из 1.5b");
  if (!dhSrc.includes("updateSynthesis("))
    errs.push("4p: ✎ (editDocTitle) не бьёт в PATCH /syntheses/:id");

  const dfSrc = await rd("../client/src/components/document/DocumentFooter.tsx");
  if (!dfSrc.includes("totalCostUsd"))
    errs.push("4p: футер не берёт стоимость из totalCostUsd");
  if (/1_000_000|1e6|\/\s*1000000/.test(dfSrc))
    errs.push("4p: футер пересчитывает стоимость по ставкам (квирк updateFooterCost 3/15$/M переносить запрещено — решение 1.6)");

  const spSrc = await rd("../client/src/pages/SynthesisPage.tsx");
  if (!spSrc.includes("viewOnly: true"))
    errs.push("4p: страница просмотра подписывается без viewOnly (открытие перезапустит генерацию)");
  if (!spSrc.includes("synthesis?.pausedState") && !spSrc.includes("synthesis.pausedState"))
    errs.push("4p: pausedState не берётся из GET /:id (маркер 1.6b «источник pausedState»)");
  if (!spSrc.includes("reloadSections"))
    errs.push("4p: готовые разделы не дотягиваются транспортом чтения по section_done");
  if (!spSrc.includes("<PauseModal"))
    errs.push("4p: PauseModal не смонтирован на странице просмотра");

  const cpSrc = await rd("../client/src/pages/CatalogPage.tsx");
  if (!cpSrc.includes("{ search }"))
    errs.push("4p: поиск каталога не серверный (?search= обязан уходить параметром)");
  if (!cpSrc.includes("updateSynthesis("))
    errs.push("4p: переключатель публикации не бьёт в PATCH { isPublic }");

  const hookSrc = await rd("../client/src/hooks/useStreamingGeneration.ts");
  if (!hookSrc.includes("viewOnly ? { viewOnly: true }"))
    errs.push("4p: subscribe_generation не несёт условный viewOnly");

  for (const rel of ["../client/src/stores/synthesis-store.ts", "../client/src/api/sections.ts",
    "../client/src/pages/SynthesisPage.tsx", "../client/src/pages/CatalogPage.tsx"]) {
    const src = await rd(rel);
    if (/localStorage|sessionStorage/.test(src)) errs.push(`4p: browser storage запрещён (${rel})`);
  }
  // Маркеров TODO(1.6b) в дереве быть не должно (пункт 9 + закрытие)
  const walk = async (dir: string): Promise<string[]> => {
    const out: string[] = [];
    for (const e of await fsm.readdir(new URL(dir, import.meta.url), { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const rel = `${dir}${e.name}`;
      if (e.isDirectory()) out.push(...await walk(rel + "/"));
      else if (/\.(ts|tsx|mts|mjs)$/.test(e.name)) out.push(rel);
    }
    return out;
  };
  for (const f of await walk("../client/src/")) {
    if ((await fsm.readFile(new URL(f, import.meta.url), "utf8")).includes("TODO(1.6b)"))
      errs.push(`4p: остался маркер TODO(1.6b): ${f}`);
  }
}

// ── 4q (беседа 1.7): визуализация графа — клиент-модули + контракты ──
{
  const cm = clientModule;
  need(await cm("../client/src/api/elements.ts"), ["getCategories"], "client/api/elements");
  need(await cm("../client/src/components/graph/graph-utils.ts"), [
    "graphState","buildGFromGraphData","typeColor","typeColorHex","edgeTypeStyle",
    "getStructuralMarkers","nodeSymbolPath","setLegendFilter","clearLegendFilter",
    "_rebuildNodeColors","_rebuildEdgeStyles","_hexToHSL","_hslToHex","CPAL",
    "STRUCTURAL_PRIORITY","PROCEDURAL_PRIORITY",
  ], "client/graph/graph-utils");
  need(await cm("../client/src/components/graph/Graph3D.tsx"),
    ["default", "buildGraph3D", "disposeGraph3D"], "client/graph/Graph3D");
  need(await cm("../client/src/components/graph/Graph2D.tsx"),
    ["default", "buildGraph2D", "disposeGraph2D"], "client/graph/Graph2D");
  for (const c of ["NodePanel", "EdgePanel", "GraphLegend", "GraphModal"])
    need(await cm(`../client/src/components/graph/${c}.tsx`), ["default"], `client/graph/${c}`);
  need(await cm("../client/src/utils/graph-physics.ts"), ["tick", "warmup"], "client/utils/graph-physics");
  need(await cm("../client/src/utils/graph-geometry.ts"), ["nodeGeometry3D", "mkSprite"], "client/utils/graph-geometry");

  const fsm = await import("node:fs/promises");
  const rd = (rel: string) => fsm.readFile(new URL(rel, import.meta.url), "utf8");

  // Динамические палитры v10: сиды hue дословны, fuzzy-поиск typeColor 1:1
  // (квирк исходника: подстрочные типы делят цвет — 07 «По факту 1.7» (ж))
  const guSrc = await rd("../client/src/components/graph/graph-utils.ts");
  if (!/онтологическ[^\n]*215|215[^\n]*онтологическ/.test(guSrc))
    errs.push("4q: сид hue онтологической (215) не дословный (_TC_HUE_SEEDS)");
  if (!guSrc.includes("lp.includes(k) || k.includes(lp)"))
    errs.push("4q: fuzzy-поиск typeColor не 1:1 с исходником [556] (квирк подстрочных типов — часть контракта)");
  if (!guSrc.includes('roleMode: "procedural"'))
    errs.push("4q: roleMode по умолчанию не procedural (протокол 1.7)");

  // Graph3D: warmup узлами ПАРАМЕТРОМ (в исходнике [782] — глобальный
  // G.nodes, адаптация (порт-решение)); touch с passive:false; тултип [тип]
  const g3Src = await rd("../client/src/components/graph/Graph3D.tsx");
  if (!g3Src.includes("warmup(G.nodes"))
    errs.push("4q: Graph3D не передаёт узлы в warmup параметром (адаптация 1.7)");
  if (!g3Src.includes("passive: false"))
    errs.push("4q: touch-обработчики Graph3D без passive:false (preventDefault умрёт)");
  if (!g3Src.includes("normalizeType("))
    errs.push("4q: тултип 3D без normalizeType (формат имя+[тип])");

  // Graph2D: raise() в hover (порт; ИЗВЕСТНОЕ СЛЕДСТВИЕ — nth-порядок
  // .node-g не инвариантен, тесты адресуются по __data__.name), рефлексивные дуги
  const g2Src = await rd("../client/src/components/graph/Graph2D.tsx");
  if (!g2Src.includes(".raise()"))
    errs.push("4q: hover Graph2D без raise() (порт исходника)");
  if (!g2Src.includes("edge-arc"))
    errs.push("4q: рефлексивные петли (edge-arc) не рендерятся в 2D");

  // GraphModal: экспорт — заглушки с меткой долга 4.2 (§12)
  const gmSrc = await rd("../client/src/components/graph/GraphModal.tsx");
  if (!gmSrc.includes("TODO(4.2)"))
    errs.push("4q: экспорт-кнопки GraphModal без метки TODO(4.2) (долг §12)");

  // SynthesisPage: кнопка, транспорт, extGraphMetrics, catch без модалки
  const spSrc = await rd("../client/src/pages/SynthesisPage.tsx");
  if (!spSrc.includes("◈ Граф"))
    errs.push("4q: кнопка «◈ Граф» отсутствует на странице синтеза");
  if (!spSrc.includes("getCategories("))
    errs.push("4q: открытие графа не через getCategories (api/elements)");
  if (!spSrc.includes("extGraphMetrics={synthesis.extGraphMetrics}"))
    errs.push("4q: extGraphMetrics не проброшен в GraphModal (секции РАСШИРЕННЫЕ умрут)");

  // CSS: комплект графа + медиа-адаптация легенды (отклонение (е) 07
  // «По факту 1.7») + анти-грабля «*/ в тексте комментария»
  const css = await rd("../client/src/globals.css");
  if (!css.includes(".gm-overlay {"))
    errs.push("4q: CSS графа (.gm-overlay) не портирован в globals.css (дыра комплекта (а))");
  if (!css.includes("@media (max-width: 600px)") || !/max-width: 600px\)[^{]*\{\s*\n\s*\.gm-legend/.test(css))
    errs.push("4q: медиа-адаптация легенды ≤600px отсутствует (мобильные жесты умрут — R9)");
  if (/\*\/\.gm-/.test(css))
    errs.push("4q: в CSS вернулась последовательность «*/.gm-» (грабля: */ в тексте комментария съедает следующее правило)");

  // Запрет browser storage в комплекте 1.7
  for (const rel of ["../client/src/api/elements.ts",
    "../client/src/components/graph/graph-utils.ts",
    "../client/src/components/graph/GraphModal.tsx"]) {
    const src = await rd(rel);
    if (/localStorage|sessionStorage/.test(src)) errs.push(`4q: browser storage запрещён (${rel})`);
  }
}

// Гейт перенесён в конец файла (дефект 2.1: секция 4r была ПОСЛЕ гейта
// и копила ошибки вхолостую; найден ревью беседы 2.2)
// ── 4r (беседа 2.1): каскадный анализ + планировщик — текстовые контракты ──
{
  const fsr = await import("node:fs/promises");
  const rdr = (rel: string) => fsr.readFile(new URL(rel, import.meta.url), "utf8");
  const caSrc = await rdr("./services/cascade-analyzer.ts");
  const epSrc = await rdr("./services/edit-planner.ts");
  const ceSrc = await rdr("./services/cost-estimator.ts");
  const pobSrc = await rdr("./services/plan-order-builder.ts");
  const rpSrc = await rdr("./routes/plans.ts");
  const ixSrc = await rdr("./index.ts");
  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  // Канон портретного подраздела и заголовки режимов — дословно из исходника
  if (!caSrc.includes('PORTRAIT_CANON = "Портрет каждого философа"'))
    errs.push("4r: PORTRAIT_CANON не дословный [9753]");
  for (const t of ["⚔ Оппонент", "🔄 Переводчик", "⏳ Временной срез"])
    if (!caSrc.includes(`"${t}"`))
      errs.push(`4r: MODE_TITLES без «${t}» (MODE_CONFIG [22579] дословно)`);
  // Анти-цикл: cascade-analyzer НЕ импортирует generation-service
  // (context-builder → cascade-analyzer → generation-service → context-builder)
  if (/from "\.\/generation-service\.js"/.test(caSrc) || !/loadSynthesisLocal/.test(caSrc))
    errs.push("4r: cascade-analyzer обязан грузить синтез локально (цикл через generation-service)");
  // Владелец getEffectiveModeDeps/MODE_CONFIG — mode-service (4.1): метки на месте
  if (!/TODO\(4\.1\)/.test(caSrc))
    errs.push("4r: локальные порты режимов без меток TODO(4.1) (долг §12)");
  // Тексты reason getAffectedModes — дословно [22814]
  if (!caSrc.includes("Изменён раздел «") || !caSrc.includes("Изменён подраздел «"))
    errs.push("4r: reason-тексты getAffectedModes не дословные");
  // analyzeImpact: текущие effectiveDeps — ПОСЛЕ buildDynamicOrder (мутация
  // разрыва циклов как в DOC_STATE, грабля 1.1); фильтры фактических деп 1:1
  if (!/buildDynamicOrder\(effectiveDeps/.test(caSrc))
    errs.push("4r: analyzeImpact не прогоняет текущие deps через buildDynamicOrder");
  if (!caSrc.includes('e.status === "found" || e.status === "truncated"') ||
      !caSrc.includes('source === "sum" || source === consumer'))
    errs.push("4r: фильтры buildFactualDepsMap разошлись с исходником [5501]");

  // buildPlanOrder: ветка params=null и вторичная сортировка по каноническому порядку
  if (!/if \(!p\)/.test(pobSrc) || !pobSrc.includes("TOPO[a] ?? 99"))
    errs.push("4r: buildPlanOrder без ветки !p или вторичной сортировки [20495]");

  // Волна: капсула-квирк и формат стоимости — дословно [7912/7928]
  if (!ceSrc.includes('d.subsection && d.section !== "capsule"'))
    errs.push("4r: estimateCascadeWaveCost без капсула-квирка [7912]");
  if (!/Оценка стоимости: ≈ \$/.test(ceSrc))
    errs.push("4r: формат formatWaveCost не дословный [7928]");

  // Планировщик: статусы confirmed/pending; estimatedCost НЕ хранится
  // (02 §2.13 — вычислим заново); PLAN_CONFLICT вне draft
  if (!epSrc.includes('isCascade ? "pending" : "confirmed"'))
    errs.push("4r: статусы шагов (пользовательские confirmed / каскадные pending) нарушены");
  if (!epSrc.includes('.values({ synthesisId, userId, status: "draft", steps })'))
    errs.push("4r: insert edit_plans пишет лишнее (estimatedCost не хранится, 02 §2.13)");
  if (!epSrc.includes('planRow.status !== "draft"') || !epSrc.includes("PLAN_CONFLICT"))
    errs.push("4r: updatePlan без гейта draft/PLAN_CONFLICT");

  // Роуты §2.6: isUuid-гейт до PG; execute РЕАЛИЗОВАН беседой 2.2
  if (!/isUuid\(/.test(rpSrc))
    errs.push("4r: routes/plans без isUuid-гейта (правило 1.6)");
  if (!rpSrc.includes('"/:id/plans/:planId/execute"'))
    errs.push("4r→2.2: POST execute пропал из routes/plans");
  if (!ixSrc.includes('app.route("/api/v1/syntheses", plansRoutes)'))
    errs.push("4r: plansRoutes не смонтирован в index.ts");
}


// ── 2m (беседа 2.2): plan-executor, structure-tracker, расширения generation-service, routes/generation ──
{
  const gs2m = await import("./services/generation-service.js");
  need(gs2m, ["regenerateSection", "startSectionRegeneration", "regenerateSubsection",
    "runSubsectionRegen", "startSubsectionRegeneration", "addSection", "deleteSection",
    "buildDeletionReplacements", "getAvailableSectionsToAdd", "ALL_SECTION_KEYS",
    "buildEditInfra", "findSubsection", "extractSubsectionContent", "computeSkipDegrades",
  ], "services/generation-service (расширение 2.2)");
  const pe2m = await import("./services/plan-executor.js");
  need(pe2m, ["executePlan", "confirmStep", "setModeRegenerator"],
    "services/plan-executor (2.2)");
  const st2m = await import("./services/structure-tracker.js");
  need(st2m, ["refreshSumDef", "updateStructureSections", "isStructureOutdated",
    "STRUCTURE_SUBSECTION"], "services/structure-tracker (2.2)");
  need(await import("./routes/generation.js"), ["generationRoutes"],
    "routes/generation (2.2, 03 §2.5)");
  // ALL_SECTION_KEYS [20906] — дословно, 11 ключей без «sum»
  const keys = gs2m.ALL_SECTION_KEYS as readonly string[];
  if (keys.length !== 11 || keys.includes("sum") || keys[0] !== "graph" || keys[10] !== "capsule")
    errs.push("2m: ALL_SECTION_KEYS расходится с исходником [20906]");
  // Типовые присваивания (арность/асинхронность под tsc)
  const _t90: (synthesisId: string, planId: string, userId: string) => Promise<void> =
    pe2m.executePlan;
  const _t91: (planId: string, stepIndex: number, userId: string) => Promise<string> =
    pe2m.confirmStep;
  const _t92: (synthesisId: string, sectionKey: string) => Promise<void> = gs2m.deleteSection;
  const _t93: (
    structureSections: readonly string[] | null, sectionOrder: readonly string[],
  ) => boolean = st2m.isStructureOutdated;
  // Санитария чистых функций
  if (gs2m.getAvailableSectionsToAdd(["sum", "graph"]).includes("graph") ||
      !gs2m.getAvailableSectionsToAdd(["sum", "graph"]).includes("dialogue"))
    errs.push("2m: getAvailableSectionsToAdd неверно фильтрует");
  if (st2m.isStructureOutdated(null, ["sum"]) !== true ||
      st2m.isStructureOutdated(["sum", "graph"], ["sum", "graph"]) !== false)
    errs.push("2m: isStructureOutdated расходится с [18410]");
}

// ── 4s (беседа 2.2): текстовые контракты executor'а и регенерации ──
{
  const fsr2 = await import("node:fs/promises");
  const rdr2 = (rel: string) => fsr2.readFile(new URL(rel, import.meta.url), "utf8");
  const gsSrc2 = await rdr2("./services/generation-service.ts");
  const peSrc = await rdr2("./services/plan-executor.ts");
  const prsSrc2 = await rdr2("./services/pause-resume-service.ts");
  const whSrc2 = await rdr2("./ws/handler.ts");
  const rgSrc = await rdr2("./routes/generation.ts");
  const pmSrc = await rdr2("../client/src/components/synthesis/PauseModal.tsx");

  // generation-service: перегенерация помечает раздел изменённым
  if (!gsSrc2.includes("await upsertSection(synthesisId, def, html, newCtx ?? \"\", true)"))
    errs.push("4s: regenerateSection не помечает is_edited=true");
  // снимок структуры [20461] при перегенерации «Структура документа»
  if (!gsSrc2.includes('sectionKey === "sum" && subsectionName === STRUCTURE_SUBSECTION'))
    errs.push("4s: снимок structureSections [20461] потерян");
  // version_sub инкремент [18811] у standalone-обёртки
  if (!/startSubsectionRegeneration[\s\S]{0,900}versionSub.*\+ 1/.test(gsSrc2))
    errs.push("4s: version_sub += 1 [18811] потерян в startSubsectionRegeneration");
  // renumberSectionRefs: строковая замена §N (задокументированное отступление)
  if (!gsSrc2.includes("/§\\s*(\\d+)/g"))
    errs.push("4s: renumberSectionRefs без регекса §N [5628]");
  if (!gsSrc2.includes('" [удалён]"'))
    errs.push("4s: пометка «[удалён]» у ссылок на удалённый раздел потеряна");
  // confirm деградации при skip [25686]: helper + три точки паузы
  if ((gsSrc2.match(/skipDegrades/g) ?? []).length < 4)
    errs.push("4s: computeSkipDegrades/skipDegrades не разведён по паузам gen");
  if (!prsSrc2.includes("computeSkipDegrades"))
    errs.push("4s: пауза resumeFillMissingSubs без skipDegrades");
  if (!pmSrc.includes("resumeGenConfirmed") || !pmSrc.includes("skipDegrades"))
    errs.push("4s: PauseModal без confirm деградации (долг §12 2.2)");
  // pause-resume: минимальный порт вырезан, делегирование полному (долг 1.4b);
  // сверка по коду БЕЗ комментариев — шапка законно упоминает вырезанное
  const strip4s = (x: string) =>
    x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  if (strip4s(prsSrc2).includes("regenerateSubsectionForResume"))
    errs.push("4s: локальный минимальный порт regenerateSubsection не вырезан");
  if (!/import \{[^}]*regenerateSubsection[^}]*\} from "\.\/generation-service\.js"/.test(prsSrc2))
    errs.push("4s: pause-resume не делегирует полному regenerateSubsection");
  // plan-executor: гейты, разъём режимов, пауза плана, регистрация resume
  if (!peSrc.includes('row.status !== "draft"') || !peSrc.includes("isGenerationActive"))
    errs.push("4s: executePlan без гейтов draft/isGenerationActive");
  if (!peSrc.includes("setModeRegenerator") ||
      !/regen_mode[\s\S]{0,700}continue/.test(peSrc))
    errs.push("4s: разъём режимов/продолжение плана при modeErr потеряны (TODO(4.1))");
  if (!peSrc.includes('createPausedState(synthesisId, "plan"'))
    errs.push("4s: пауза kind='plan' [19770] потеряна");
  if (!peSrc.includes('ps.reasonKind !== "user-abort"'))
    errs.push("4s: user-abort плана не должен слать generation_paused (тип §3.2)");
  if (!peSrc.includes("sum:${STRUCTURE_SUBSECTION}") && !peSrc.includes("sum:Структура"))
    errs.push("4s: пост-план структурный шаг потерян (07 2.2 п.1)");
  if (!/setPlanResumeExecutor\(\(/.test(peSrc))
    errs.push("4s: регистрация resume-исполнителя (долг §12 1.4b) потеряна");
  // ws/handler: операции 2.2 диспетчеризованы; start_mode остался 4.1
  for (const t of ["start_regen", "start_sub_regen", "execute_plan", "confirm_step"])
    if (!new RegExp(`case "${t}":\\s*\\n(?![\\s\\S]{0,80}не реализован)`).test(whSrc2))
      errs.push(`4s: ws ${t} не реализован`);
  if (!/case "start_mode":[\s\S]{0,220}4\.1/.test(whSrc2))
    errs.push("4s: start_mode должен остаться заглушкой 4.1");
  // routes/generation: owner-only + 409 при активной генерации
  if (!rgSrc.includes("GENERATION_IN_PROGRESS") || !rgSrc.includes("requireAuth"))
    errs.push("4s: routes/generation без гейтов (03 §2.5, §4.3)");
  const ixSrc2 = await rdr2("./index.ts");
  if (!ixSrc2.includes('app.route("/api/v1/syntheses", generationRoutes)'))
    errs.push("4s: generationRoutes не смонтирован");
}


// Единый финальный гейт (перенесён из-за дефекта 2.1 — см. выше)
if (errs.length) { console.error("ПРОБЛЕМЫ:\n" + errs.map(e => " - " + e).join("\n")); process.exit(1); }

console.log("INTEGRATION OK: 11 value-модулей shared, 4 server-модуля 0.1 + 7 модулей 0.2 (auth/admin-only/routes/rate-limiter/ws×2/redis) + 13 модулей 0.3 (prompt-registry + 12 config) + 1 модуль 0.3b (element-taxonomy) + 5 модулей 1.1 (deep-merge/topo-sort/synthesis-engine/compat-advisor/cost-estimator, реэкспорты тождественны) + 4 модуля 1.2 (prompt-builder/section-defs-builder + section-templates 146 шт./subsection-map; SEC_NAMES≡KEY_LABELS, реэкспорты кардинальности тождественны) + 17 клиент-модулей 0.4+0.6 (api/store/useWebSocket/App/layout×3/pages×10), 11 файлов типов, 4+5+4+6 кросс-слойных совместимостей + 4e (AuthUser client↔server, ApiErrorCode⊇§4.3+серверные коды, маршруты App↔Sidebar↔протокол, BASE_URL↔монтирование, эндпоинты store↔routes) + 4h 1.1 (async-сигнатуры engine/advisor/estimator, перенос applyBudgetPressure в context-builder (1.3), константы [7539] и топо-таблицы [6505/6520] дословно) + 4j/5j 1.3 (async-сигнатуры context-builder/extractor/parent-context, CtxLogDraft⊇context_log, пол 40% и пороги бюджета дословно, DOM-слой изолирован в html-parser, живой конвейер на sections+categories) + 4i 1.2 (async-сигнатуры билдеров, parts/defs структурно совместимы со входами оценщика, стоп-сигнал из Registry без хардкода, разъём провайдера 1.3, тексты разделов только из Registry, посевы += SEED_SECTION_TEMPLATES/subsection_map, extract:sections, баннер генерата), async-цепочки (5e: auth-store против authRoutes через app.request на живой БД — register/login/logout/restore/NETWORK_ERROR (auth-жизненный цикл; registry: getTemplate/render/getConfig/NOT_FOUND/кэш-инвалидация; taxonomy: counts 18/29, normalizeType match/null-кейсы, валидация createCustomType, кэш-инвалидация — всё на живой БД+Redis; 4f/5f 0.5: контракт password-change (requireAuth, eq+ne-инвалидация, транзакция, общая PASSWORD_MIN_LENGTH) + живой цикл смены пароля (отказы без побочных эффектов, старый пароль мёртв, чужая сессия убита, текущая жива; 4g/5g 0.6: контракт профиля (PATCH /me, /profile в App+Header, skipUnauthorizedHandler объявлен и применён) + живой смоук PATCH displayName/пустая→null/101→400; 5h 1.1: живой конвейер resolveContextDeps→buildEffectiveDeps(подстановка)→buildDynamicOrder→getCompatEntryByKey→computeSectionAdvice→estimateCost на посеянных конфигах; 5i 1.1+1.2: сквозной конвейер buildSYS→baseCtxStatic→buildSectionDefs→groupPasses→estimateCost(sysChars/baseStaticChars/passes реальные)→patchPromptsWithSecCtx + stop_signal из Registry); reject после closeDb) + 2i/4k/5k 1.4 (6 модулей streaming-manager/generation-service/graph-parser/element-parser/stream-state/routes-syntheses, реэкспорты stream-state тождественны; контракты: baseUrl из env, ретраи только pre-stream из env, activeRuns.set до await (гонка), цены из cost-estimator, scaffold дословно, _genCommon/common, user-abort без pausedState, linkedom изолирован, POST по SEC_NAMES, resume §3.3; живьём: двойной saveGraphToDb/saveElementsToDb — идемпотентная замена, stream-state круговой по разделу и указателю, предохранители cancelGeneration/assertCanStartGeneration) + 2j/4l/5l 1.4b (pause-resume-service + порты serializeSubsectionRegen/extractPreambleConstraints в section-defs-builder и spliceSubsectionHtml/removeSubsectionHtml в html-parser + клиентский PauseModal (4 рендерера, fmtCost ≡ _fmtCost) + разъёмы generation-service; контракты: порог 250 и userNote «Заверши» дословно, runtime-guard режимов, провайдер estimates регистрируется импортом и питает обе точки generation_paused, метка [возобновление], resume_* диспетчеризованы, linkedom изолирован, 'resume' ∈ source; живьём: createPausedState → paused_state+pause_marker, computePauseEstimates из genParams (whole>0, skip=0, fill>0), RESUME_INVALID/FORBIDDEN, stop-финализация с resume_marker; фикс: closeRedis в teardown — event loop больше не висит) + 4m/5m 1.5 (9 клиент-модулей формы/прогресса: api/syntheses + SynthesisForm/PhilosopherPicker/SectionPicker/CostEstimate/CompatAdvisor/SectionWarnings/GenerationProgress + useStreamingGeneration + CreateSynthesisPage; контракты: /estimate и /advice под requireAuth и без записей в БД, конвейер оценки зеркалит generation-service, NO_PARTICIPANTS_SEED_REQUIRED в коде роута, confirm перед skip, ?resume= и subscribe_generation в хуке, условный keepFullBudget, browser storage запрещён; живьём: estimate cost/in/out>0 passes=3, advice stable ★ + ⚠ evolution, 401 без сессии, свободный синтез без seed → 400 NO_PARTICIPANTS_SEED_REQUIRED без создания записи) + 4n 1.5b (пул: pool-store 9 действий без snapshotCurrentState (снимки вырождены), concept-file 16 экспортов, PoolCard/ConceptPool, SYNTH_READY_SECTIONS из SectionPicker; контракты: форма читает пул из стора и монтирует ConceptPool, сабмит с ☑-концепциями гейтится до 3.1/4.3, CONTEXT_BUDGET_PREVIEW локализован, prepareForGeneration перед POST, genealogy=null помечен TODO(3.1/3.2), browser storage запрещён) + 2k/4o/5n 1.6 (транспорт чтения: routes/sections + routes/elements(GET) + расширение routes/syntheses, makeDocNum [12110] дословно, /public ДО /:id, requireAuth всюду, duplicate переносит генеалогию родителей без связи с оригиналом и без логов, viewOnly ДО запуска генерации, shared += pauseEstimates/subsections/viewOnly, маркеров TODO(1.6) в дереве нет; живьём: список/SynthesisFull(null-пауза)/sections в порядке sectionOrder с subsections из HTML/categories с hasReflexiveEdges/PATCH isPublic/duplicate без lineage-связи/DELETE+404) + 4p 1.6b (просмотр/каталог: api/sections + synthesis-store + document×5 + catalog×2 + LoadingSpinner; контракты: SectionView обогащает HTML-СТРОКУ (enrichSectionHtml/DOMParser, БЕЗ useEffect — вставки эффектом стираются при hash-навигации), слуг-регексп и <2-порог TOC дословны, capsule исключён в TOC и DocumentView, extractCapsuleText реюз 1.5b, ✎→PATCH title, футер ровно totalCostUsd без ставок, страница просмотра viewOnly:true + pausedState из GET /:id + reloadSections + PauseModal, каталог с серверным ?search= и PATCH isPublic, условный viewOnly в хуке, browser storage запрещён, маркеров TODO(1.6b) в дереве нет; живьём: браузерный харнесс tests/test-16b-requests2-9.mjs — 63 проверки ×3 прогона) + 4q 1.7 (граф: 10 клиент-модулей (api/elements + graph-utils 16 экспортов + Graph3D/Graph2D (build/dispose) + 4 компонента + physics/geometry); контракты: сиды hue дословны, fuzzy typeColor 1:1 [556] (квирк подстрочных типов), roleMode=procedural, warmup узлами параметром, touch passive:false, тултип normalizeType, raise() в hover 2D, edge-arc петли, TODO(4.2) на экспорте (§12), «◈ Граф»+getCategories+extGraphMetrics в SynthesisPage, CSS графа в globals.css + медиа-легенда ≤600px + анти-грабля «*/ в комментарии», browser storage запрещён; браузерные смоуки — tests/test-17-requests2-9.mjs 84 ✓ ×2) + 2l/4r/5o 2.1 (cascade-analyzer 18 экспортов + edit-planner + plan-order-builder + routes/plans + wave-функции cost-estimator (долг 1.1 закрыт) + export loadActualOutputChars; реэкспорты sourceOf/buildPlanOrder тождественны; контракты: PORTRAIT_CANON и MODE_TITLES дословно, анти-цикл loadSynthesisLocal, TODO(4.1) на локальных портах режимов, reason-тексты, buildDynamicOrder над текущими deps, фильтры фактических деп [5501], ветка !p и вторичная сортировка buildPlanOrder, капсула-квирк и формат волны, статусы confirmed/pending, insert без estimatedCost (02 §2.13), гейт draft/PLAN_CONFLICT, isUuid, execute отсутствует (2.2), монтирование; живьём: analyzeImpact downstream, createPlan (confirmed+pending, порядок, оценка>0), updatePlan skip→каскад исчезает, PlanError VALIDATION_ERROR/FORBIDDEN/NOT_FOUND, deletePlan) + 2m/4s/5p 2.2 (plan-executor/structure-tracker/routes-generation + 14 новых экспортов generation-service; ALL_SECTION_KEYS [20906] дословно; контракты: is_edited при regen, снимок структуры [20461], version_sub [18811], регекс §N [5628] + «[удалён]», skipDegrades в трёх паузах + confirm в PauseModal (долг §12 закрыт), минимальный порт 1.4b вырезан, гейты executePlan, разъём setModeRegenerator (TODO(4.1)) с продолжением плана, пауза kind='plan' без WS при user-abort, структурный пост-шаг, регистрация setPlanResumeExecutor, ws-операции 2.2 + start_mode→4.1, execute-роут и generationRoutes смонтированы; живьём: deleteSection на БД — порядок/перенумерация/пометка [удалён]/deletion_marker, buildDeletionReplacements на посеянном substitution_map; ФИКС ревью 2.2: финальный гейт errs перенесён В КОНЕЦ — секция 4r стояла после гейта и не проверялась)");
