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
    "analyzeImpact", "sourceOf", "buildPlanOrder",
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
  // 2.4: метка TODO(2.4) снята — оценка живая через getSectionContextQualityMap
  if (/TODO\(2\.4\)(?! закрыт)/.test(sec)) errs.push("4o: незакрытая метка TODO(2.4) (context-quality живой с 2.4)");
  if (!sec.includes("getSectionContextQualityMap"))
    errs.push("4o: contextQualityScore не через getSectionContextQualityMap (2.4, без N+1)");
  if (!sec.includes("parseSubsectionsFromHTML"))
    errs.push("4o: subsections не через порт 1.4 (generation-service)");
  if (!sec.includes("buildContextForSection"))
    errs.push("4o: /:key/context не через живой buildContextForSection (03 §2.3)");
  if (!sec.includes("loadSynthesisForRead")) errs.push("4o: sections без общей проверки доступа");

  const el = await rd("./routes/elements.ts");
  // До 5.1 здесь стоял запрет не-GET роутов; беседа 5.1 их добавила
  // (проверяются в 4ab). Инвариант 1.6 сузился: GET /categories на месте.
  if (!el.includes('elementsRoutes.get("/:id/categories", requireAuth'))
    errs.push("4o: elements.ts потерял GET /:id/categories беседы 1.6");
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
    // 2.4: оценка живая; у синтеза 5n нет записей context_log → null законен,
    // но контракт формы — number | null (не undefined)
    if (!secs5n?.every((s) => s.contextQualityScore === null || typeof s.contextQualityScore === "number"))
      errs.push("5n: contextQualityScore не number|null (2.4)");
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

// ── 5q (беседа 2.4): живые context-quality и log-formatter против БД (ДО закрытия пула) ──
{
  const cq = await import("./services/context-quality.js");
  const lf = await import("./services/log-formatter.js");
  const { db } = await import("./db/index.js");
  const sch = await import("./db/schema.js");
  const { eq } = await import("drizzle-orm");
  const [u5q] = await db.insert(sch.users).values({
    email: `iq5q-${Date.now()}@check.local`, passwordHash: "x", displayName: "5q",
  }).returning();
  const uid5q = (u5q as { id: string }).id;
  const [s5q] = await db.insert(sch.syntheses).values({
    userId: uid5q, title: "5q", docNum: "IQ-5Q", status: "ready",
    params: { philosophers: ["Кант"] }, sectionOrder: ["sum"],
  } as never).returning();
  const sid5q = (s5q as { id: string }).id;
  // Две записи одного раздела: last-win обязан взять вторую
  await db.insert(sch.contextLog).values({
    synthesisId: sid5q, sectionKey: "sum",
    budget: 1000, totalUsed: 500, reqFound: 1, reqTotal: 2, entries: [],
  } as never);
  await new Promise((r) => setTimeout(r, 5));
  await db.insert(sch.contextLog).values({
    synthesisId: sid5q, sectionKey: "sum",
    budget: 1000, totalUsed: 300, reqFound: 3, reqTotal: 4, entries: [],
  } as never);
  const q = await cq.getSectionContextQuality(sid5q, "sum");
  // Формула [5571]: round(3/4×70 + min(1,300/1000)×30) = round(52.5+9) = 62 (пол-в-верх round)
  if (q?.score !== Math.round((3 / 4) * 70 + (300 / 1000) * 30))
    errs.push(`5q: last-win/формула сломаны (score=${q?.score})`);
  // Края: reqTotal=0 → reqScore=1; budget=0 → usage=0 ⇒ 70+0
  await db.insert(sch.contextLog).values({
    synthesisId: sid5q, sectionKey: "graph",
    budget: 0, totalUsed: 0, reqFound: 0, reqTotal: 0, entries: [],
  } as never);
  const qe = await cq.getSectionContextQuality(sid5q, "graph");
  if (qe?.score !== 70) errs.push(`5q: края reqTotal=0/budget=0 не по исходнику (score=${qe?.score})`);
  const qm = await cq.getSectionContextQualityMap(sid5q);
  if (qm.get("sum")?.score !== q?.score || qm.get("graph")?.score !== 70)
    errs.push("5q: Map-выборка расходится с поштучной");
  if ((await cq.getSectionContextQuality(sid5q, "нет-такого")) !== null)
    errs.push("5q: отсутствие записей раздела обязано давать null");
  // Форматтер на синтезе без genLog: шапка есть, форма { text, html }
  const fh = await lf.formatCtxLogHTML(sid5q);
  if (typeof fh?.text !== "string" || typeof fh?.html !== "string" ||
      !fh.text.includes("ЛОГ КОНТЕКСТА") || !fh.html.includes("<span"))
    errs.push("5q: formatCtxLogHTML не { text, html } с шапкой и раскраской");
  await db.delete(sch.syntheses).where(eq(sch.syntheses.id, sid5q));
  await db.delete(sch.users).where(eq(sch.users.id, uid5q));
}

// ── 5r (беседа 3.1): живые meta-synthesis/lineage против БД (ДО закрытия пула) ──
{
  const ms = await import("./services/meta-synthesis-service.js");
  const ls = await import("./services/lineage-service.js");
  const { db } = await import("./db/index.js");
  const sch = await import("./db/schema.js");
  const { eq } = await import("drizzle-orm");
  const tag5r = Date.now().toString(36);
  const [u5r] = await db.insert(sch.users).values({
    email: `iq5r-${tag5r}@check.local`, passwordHash: "x", displayName: "5r",
  }).returning();
  const uid5r = (u5r as { id: string }).id;
  const mk = async (title: string, phils: string[], keys: string[]) => {
    const [s] = await db.insert(sch.syntheses).values({
      userId: uid5r, title, method: "dialectical", synthLevel: "integrative",
      depth: "standard", status: "ready", sectionOrder: keys,
      capsuleHtml: `<div class="capsule"><p>Капсула «${title}»: принцип.</p></div>`,
    } as never).returning();
    const id = (s as { id: string }).id;
    if (keys.length) await db.insert(sch.sections).values(keys.map((key, i) => ({
      synthesisId: id, key, sectionNum: i + 1, title: key,
      htmlContent: `<p>${key}</p>`,
    })));
    await ls.createLineageRecords(id,
      phils.map((name) => ({ type: "philosopher" as const, name })));
    return id;
  };
  const FULL = ["sum", "graph", "dialogue", "glossary", "theses", "critique"];
  const a5r = await mk(`A-${tag5r}`, [`Кант-${tag5r}`, `Гегель-${tag5r}`], FULL);
  const b5r = await mk(`B-${tag5r}`, [`Сартр-${tag5r}`], FULL);
  const m5r = await mk(`M-${tag5r}`, [], ["sum"]);
  await ls.createLineageRecords(m5r, [
    { type: "philosopher", name: `Бовуар-${tag5r}` },
    { type: "synthesis", synthesisId: a5r },
    { type: "synthesis", synthesisId: b5r },
  ]);
  // Пригодность: полный ✓; без glossary → missing ровно ['glossary']
  const cr5r = await mk(`C-${tag5r}`, [`Платон-${tag5r}`],
    FULL.filter((k) => k !== "glossary"));
  if (!(await ms.validateConceptForMetaSynthesis(a5r)).valid)
    errs.push("5r: полная концепция признана непригодной");
  const vc5r = await ms.validateConceptForMetaSynthesis(cr5r);
  if (vc5r.valid || vc5r.missing.join() !== "glossary")
    errs.push(`5r: edge без glossary → ${JSON.stringify(vc5r.missing)}`);
  // Транзитивные предки через CTE (включая непосредственного философа меты)
  const anc5r = await ms.collectPhilosopherAncestors(m5r);
  if (anc5r.size !== 4 || !anc5r.has(`Кант-${tag5r}`) || !anc5r.has(`Бовуар-${tag5r}`))
    errs.push(`5r: collectPhilosopherAncestors не транзитивен (${anc5r.size})`);
  if (!(await ms.isAncestor(a5r, m5r)) || (await ms.isAncestor(m5r, a5r)))
    errs.push("5r: isAncestor путает направление");
  // Поиск по ВСЕМ философам: транзитивно и с HAVING-пересечением
  const f5r = await ls.searchByPhilosophers([`Кант-${tag5r}`, `Сартр-${tag5r}`]);
  if (f5r.length !== 1 || f5r[0] !== m5r)
    errs.push(`5r: searchByPhilosophers(Кант+Сартр) ≠ [мета] (${f5r.length})`);
  // Дерево предков: глубина ограничивается, второй уровень раскрыт
  const tr5r = await ls.getAncestors(m5r, 10);
  const nodeA5r = tr5r?.children.find((n) => n.synthesisId === a5r);
  if (!nodeA5r || nodeA5r.children.length !== 2)
    errs.push("5r: getAncestors не раскрывает второй уровень");
  if ((await ls.getAncestors(m5r, 1)).children.find((n) => n.synthesisId === a5r)?.children.length !== 0)
    errs.push("5r: maxDepth=1 не обрезает дерево");
  // Пересечения генеалогий: общий предок → info с именем философа
  const ov5r = await ms.checkGenealogyOverlaps([
    { type: "synthesis", synthesisId: m5r },
    { type: "synthesis", synthesisId: a5r },
  ]);
  if (!ov5r.some((w) => w.level === "info" && w.text.includes(`Кант-${tag5r}`)))
    errs.push("5r: overlap-info без имени общего философа");
  // Блок Selective: гейт флагом + капсула в тексте
  const parts5r = await ms.loadConceptParticipants(m5r);
  const blk5r = await ms.conceptContextBlockSelective(
    { participants: parts5r, isMetaSynthesis: true }, "sum",
    { required: ["capsule"], optional: [] });
  if (!blk5r.includes(`«A-${tag5r}»: принцип`) || !blk5r.includes(`«B-${tag5r}»`))
    errs.push("5r: Selective-блок без капсул обеих концепций");
  if (ms.conceptContextBlockFull({ participants: parts5r, isMetaSynthesis: false }) !== "")
    errs.push("5r: гейт isMetaSynthesis=false не пустой");
  await db.delete(sch.syntheses).where(eq(sch.syntheses.userId, uid5r));
  await db.delete(sch.users).where(eq(sch.users.id, uid5r));
}

// 1.4b: singleton Redis переоткрывался в 5k и держал event loop после
// INTEGRATION OK (процесс не завершался сам) — закрываем явно
await rClose();
// ── 5s (беседа 4.2): живой экспорт против БД (ДО закрытия пула) ──
{
  const { loadGModel } = await import("./services/export/graph-model.js");
  const { buildMMD, exportMMD: xMMD } = await import("./services/export/mmd-exporter.js");
  const { buildJSON } = await import("./services/export/json-exporter.js");
  const { buildPNG } = await import("./services/export/png-exporter.js");
  const { exportMD: xMD } = await import("./services/export/md-exporter.js");
  const { ExportError: XErr } = await import("./services/export/common.js");
  const { db: db5s } = await import("./db/index.js");
  const sch5s = await import("./db/schema.js");
  const tag5s = Date.now().toString(36);
  const [u5s] = await db5s.insert(sch5s.users).values({
    email: `iq5s-${tag5s}@check.local`, passwordHash: "x", displayName: "5s",
  }).returning();
  const uid5s = (u5s as { id: string }).id;
  const [s5s] = await db5s.insert(sch5s.syntheses).values({
    userId: uid5s, title: `X-${tag5s}`, method: "dialectical",
    synthLevel: "comparative", depth: "overview", status: "ready",
    sectionOrder: ["sum", "graph"], docNum: `PS-5S-${tag5s.toUpperCase()}`,
  } as never).returning();
  const sid5s = (s5s as { id: string }).id;
  await db5s.insert(sch5s.sections).values([
    { synthesisId: sid5s, key: "sum", sectionNum: 1, title: "Сводное резюме",
      htmlContent: `<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">Сводное резюме</div><div class="doc-content"><p>Цель.</p></div></div>` },
    { synthesisId: sid5s, key: "graph", sectionNum: 2, title: "Граф категорий",
      htmlContent: `<div class="doc-section"><div class="section-num">§ 2</div><div class="section-title">Граф категорий</div><div class="doc-content"><table class="doc-table"><tbody><tr><td>x</td></tr></tbody></table></div></div>` },
  ]);
  const cats5s = await db5s.insert(sch5s.categories).values([
    { synthesisId: sid5s, name: `Бытие-${tag5s}`, type: "онтологическая",
      definition: "осн", origin: "Кант", centrality: 0.9, certainty: 0.8,
      clusterIndices: [0, 1], structuralRoles: ["core"],
      proceduralRoles: ["synthesis"], position: 0 },
    { synthesisId: sid5s, name: `Знание-${tag5s}`, type: "эпистемологическая",
      definition: "", origin: "", centrality: 0.6, certainty: 0.5,
      clusterIndices: [0], structuralRoles: ["bridge"],
      proceduralRoles: ["thesis"], position: 1 },
    { synthesisId: sid5s, name: `Благо-${tag5s}`, type: "этическая",
      definition: "", origin: "", centrality: 0.7, certainty: 0.6,
      clusterIndices: [1], structuralRoles: ["peripheral"],
      proceduralRoles: ["antithesis"], position: 2 },
  ] as never).returning();
  const cid = (n: number) => (cats5s[n] as { id: string }).id;
  await db5s.insert(sch5s.categoryEdges).values([
    { synthesisId: sid5s, sourceId: cid(0), targetId: cid(1),
      edgeType: "иерархическая", description: "", direction: "однонаправленная",
      strength: 0.7, position: 0 },
    { synthesisId: sid5s, sourceId: cid(2), targetId: cid(2),
      edgeType: "противоречие", description: "", direction: "рефлексивная",
      strength: 0.5, position: 1 },
  ] as never);
  await db5s.insert(sch5s.clusterLabels).values([
    { synthesisId: sid5s, clusterIndex: 0, label: "I — Основания" },
    { synthesisId: sid5s, clusterIndex: 1, label: "II — Практика" },
  ] as never);

  const G5s = await loadGModel(sid5s);
  if (G5s.nodes.length !== 3 || G5s.edges.length !== 2)
    errs.push(`5s: loadGModel — узлов ${G5s.nodes.length}/3, рёбер ${G5s.edges.length}/2`);
  if ((G5s.topology.clusters[`Бытие-${tag5s}`] ?? []).length !== 2)
    errs.push("5s: loadGModel — мульти-кластерность узла потеряна");
  if (G5s.topology.clusterLabels[1] !== "II — Практика")
    errs.push("5s: loadGModel — clusterLabels не по clusterIndex");
  const mmd5s = buildMMD(G5s);
  if (!mmd5s.startsWith("graph TD") || !mmd5s.includes("subgraph CL1") ||
      !/N0_0|N0_1/.test(mmd5s) || !/↺/.test(mmd5s))
    errs.push("5s: buildMMD — нет субграфов/копий/петли");
  if (/\n\s*class N/.test(mmd5s))
    errs.push("5s: buildMMD — появилась строка class (квирк classDef-без-class нарушен)");
  const j5s = buildJSON(G5s, { docNum: (s5s as { docNum: string }).docNum, title: `X-${tag5s}` });
  if (j5s.meta.format !== "PhiloSynth Graph" || j5s.nodes.length !== 3 ||
      j5s.clusters.length !== 2 || j5s.nodes[0]!.clusters.length !== 2)
    errs.push("5s: buildJSON — структура meta/nodes/clusters разошлась");
  const png5s = buildPNG(G5s);
  if (png5s.length < 10_000 || png5s[0] !== 0x89 || png5s[1] !== 0x50)
    errs.push("5s: buildPNG — не PNG или подозрительно мал");
  const md5s = await xMD(sid5s);
  if (!md5s.startsWith(`# X-${tag5s}`) || !/^## § 1 — Сводное резюме$/m.test(md5s) ||
      !md5s.includes("| Документ № |"))
    errs.push("5s: exportMD — шапка/разделы не собрались");
  // Синтез без графа: NO_GRAPH (alert исходника → 400 в роуте)
  const [g0] = await db5s.insert(sch5s.syntheses).values({
    userId: uid5s, title: `G0-${tag5s}`, method: "dialectical",
    synthLevel: "comparative", depth: "overview", status: "ready",
    sectionOrder: ["sum"],
  } as never).returning();
  try {
    await xMMD((g0 as { id: string }).id);
    errs.push("5s: exportMMD без графа не бросил ExportError");
  } catch (e) {
    if (!(e instanceof XErr) || e.code !== "NO_GRAPH" || e.message !== "Нет графа.")
      errs.push("5s: exportMMD без графа — не NO_GRAPH «Нет графа.»");
  }
  const { eq: eq5s } = await import("drizzle-orm");
  await db5s.delete(sch5s.users).where(eq5s(sch5s.users.id, uid5s)); // каскад приберёт синтезы
}

// ── 5t (беседа 4.3): живой импорт против БД (ДО закрытия пула) ──
{
  const { importHTML: imp5t, ImportError: IErr5t } =
    await import("./services/import-service.js");
  const { db: db5t } = await import("./db/index.js");
  const sch5t = await import("./db/schema.js");
  const { eq: eq5t } = await import("drizzle-orm");
  const tag5t = Date.now().toString(36);
  const [u5t] = await db5t.insert(sch5t.users).values({
    email: `iq5t-${tag5t}@check.local`, passwordHash: "x", displayName: "5t",
  } as never).returning();
  const uid5t = (u5t as { id: string }).id;
  // Минимальный standalone-файл: шапка с id + sum-раздел + legacy-state
  const html5t = `<html><body><div id="docOutput">
    <div id="docTitle">Интеграционный импорт</div>
    <span id="docMethod">Диалектический</span><span id="docDepth">Стандартная</span>
    <span id="docSynthLevel">Сравнительный</span><span id="docNum">PS-5T5T</span>
    <div id="docBodies"><div class="doc-body"><div class="doc-section">
      <div class="section-num">§ 1</div><div class="section-title">Исполнительное резюме синтеза</div>
      <div class="doc-content"><p>Т</p></div></div></div></div>
    <span id="footerPhil">Кант</span></div>
    <script type="application/json" id="philosynth-state">{"version":2,
      "genLog":[{"sectionKey":"sum","sectionLabel":"Резюме","status":"done","source":"initial",
        "inputTokens":1,"outputTokens":2,"cost":0.001},
        {"type":"version-marker","version":"v2","timestamp":"2026-08-01T10:00:00Z"}],
      "ctxLog":[],"sectionOrder":["sum"],"docVersion":2,
      "participants":[{"type":"philosopher","name":"Кант"}]}</scr` + `ipt></body></html>`;
  const r5t = await imp5t(html5t, uid5t, "iq5t.html");
  if (!r5t.synthesisId) errs.push("5t: importHTML не вернул synthesisId");
  const [row5t] = await db5t.select().from(sch5t.syntheses)
    .where(eq5t(sch5t.syntheses.id, r5t.synthesisId));
  const rr = row5t as { method: string; docNum: string; status: string } | undefined;
  if (!rr || rr.method !== "dialectical" || rr.docNum !== "PS-5T5T" || rr.status !== "ready")
    errs.push("5t: строка syntheses после импорта неверна (method/docNum/status)");
  const secs5t = await db5t.select().from(sch5t.sections)
    .where(eq5t(sch5t.sections.synthesisId, r5t.synthesisId));
  if (secs5t.length !== 1 || (secs5t[0] as { key: string }).key !== "sum")
    errs.push("5t: раздел sum не восстановлен");
  const gl5t = await db5t.select().from(sch5t.generationLog)
    .where(eq5t(sch5t.generationLog.synthesisId, r5t.synthesisId));
  // Порядок legacy-логов: даты синтетические t0+i (маркер с реальным
  // timestamp прошлого НЕ должен встать раньше generation-записи)
  const glRows = (gl5t as { logType: string; costUsd: string; createdAt: Date }[])
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const g0r = glRows[0];
  const g1r = glRows[1];
  if (glRows.length !== 2 || !g0r || !g1r || g0r.logType !== "generation" ||
      g1r.logType !== "version_marker" || Number(g0r.costUsd) !== 0.001)
    errs.push("5t: legacy genLog — порядок/маппинг cost→cost_usd/version-marker нарушены");
  const lin5t = await db5t.select().from(sch5t.synthesisLineage)
    .where(eq5t(sch5t.synthesisLineage.synthesisId, r5t.synthesisId));
  if (lin5t.length !== 1 || (lin5t[0] as { parentName: string | null }).parentName !== "Кант")
    errs.push("5t: lineage философа не построен");
  // IMPORT_INVALID на не-PhiloSynth файле, записи не создаются
  let threw5t = false;
  try { await imp5t("<html><body><p>x</p></body></html>", uid5t); }
  catch (e) { threw5t = e instanceof IErr5t && (e as { code: string }).code === "IMPORT_INVALID"; }
  if (!threw5t) errs.push("5t: не-PhiloSynth файл не дал ImportError IMPORT_INVALID");
  await db5t.delete(sch5t.users).where(eq5t(sch5t.users.id, uid5t)); // каскад приберёт импорт
}

// ── 5u (беседа 5.1): живой Element Editor против БД (ДО закрытия пула) ──
{
  const { db: db5u } = await import("./db/index.js");
  const sch5u = await import("./db/schema.js");
  const { eq: eq5u, and: and5u } = await import("drizzle-orm");
  const er5u = await import("./services/element-renderer.js");
  const ev5u = await import("./services/element-versioning.js");
  const gp5u = await import("./services/graph-parser.js");
  const tag5u = Date.now().toString(36);
  const [u5u] = await db5u.insert(sch5u.users).values({
    email: `iq5u-${tag5u}@check.local`, passwordHash: "x", displayName: "5u",
  } as never).returning();
  const uid5u = (u5u as { id: string }).id;
  const [s5u] = await db5u.insert(sch5u.syntheses).values({
    userId: uid5u, seed: "5u", sectionOrder: ["sum", "graph"], status: "ready",
  } as never).returning();
  const sid5u = (s5u as { id: string }).id;
  const html5u =
    '<div class="doc-content"><div data-section="Таблица категорий"><h4>Таблица категорий</h4>' +
    '<p>Вводный абзац.</p><table class="doc-table"><thead><tr><th>Категория</th><th>Тип</th>' +
    '<th>Определение</th><th>Центральность</th><th>Определённость</th><th>Происхождение</th></tr></thead>' +
    '<tbody><tr><td>Старое</td><td>онтологическая</td><td>x</td><td>0.5</td><td>0.5</td><td>y</td></tr></tbody></table>' +
    '<p>Комментарий после.</p></div></div>';
  const [sec5u] = await db5u.insert(sch5u.sections).values({
    synthesisId: sid5u, key: "graph", sectionNum: 2, title: "Граф", htmlContent: html5u,
  } as never).returning();
  const [cat5u] = await db5u.insert(sch5u.categories).values({
    synthesisId: sid5u, name: "Новая", type: "логическая", definition: "d", centrality: 0.7,
    certainty: 0.4, origin: "o", position: 0,
  } as never).returning();
  const catId5u = (cat5u as { id: string }).id;
  // (1) перерисовка одной таблицы: h4/проза целы, парсер читает БД-строку
  const ap = await er5u.applyElementUpdateToHtml(sid5u, "categories");
  if (!ap.updated || ap.outcome !== "replaced")
    errs.push(`5u: applyElementUpdateToHtml → ${JSON.stringify(ap)} (ожидалось replaced)`);
  const [after5u] = await db5u.select().from(sch5u.sections)
    .where(eq5u(sch5u.sections.id, (sec5u as { id: string }).id));
  const h5u = (after5u as { htmlContent: string; isEdited: boolean }).htmlContent;
  if (!h5u.includes("<h4>Таблица категорий</h4><p>Вводный абзац.</p>") || !h5u.includes("<p>Комментарий после.</p>"))
    errs.push("5u: перерисовка таблицы стёрла h4/прозу подраздела (02 §3 — раздел не перерисовывается)");
  if (h5u.includes("<td>Старое</td>")) errs.push("5u: старая строка таблицы осталась");
  const g5u = gp5u.parseGraphFromHTML(h5u);
  if (g5u.nodes.length !== 1 || g5u.nodes[0]?.name !== "Новая" || g5u.nodes[0]?.cen !== 0.7 || g5u.nodes[0]?.type !== "логическая")
    errs.push(`5u: round-trip parseGraph(html_content) ≠ БД: ${JSON.stringify(g5u.nodes[0])}`);
  if (!(after5u as { isEdited: boolean }).isEdited) errs.push("5u: sections.is_edited не выставлен");
  // (2) версии: автоинкремент, фильтр synthesis_id, откат создаёт 'rollback'
  const v1 = await ev5u.createVersion(sid5u, catId5u, "category", { ...cat5u as object, name: "Первая" }, "manual");
  const v2 = await ev5u.createVersion(sid5u, catId5u, "category", cat5u as Record<string, unknown>, "manual");
  if (v1.version !== 1 || v2.version !== 2) errs.push(`5u: версии ${v1.version}/${v2.version}, ожидалось 1/2`);
  const rb = await ev5u.rollbackToVersion(sid5u, "category", catId5u, 1);
  if ((rb.element as { name: string }).name !== "Первая" || rb.version.version !== 3 || rb.version.changeSource !== "rollback")
    errs.push(`5u: rollback → name=${(rb.element as { name: string }).name}, v${rb.version.version}/${rb.version.changeSource}`);
  const hist = await ev5u.getVersionHistory(sid5u, "category", catId5u);
  if (hist.map((v) => v.version).join(",") !== "3,2,1") errs.push("5u: история не 3,2,1 DESC");
  const foreign = await ev5u.getVersionHistory("00000000-0000-4000-8000-000000000000", "category", catId5u);
  if (foreign.length !== 0) errs.push("5u: getVersionHistory с чужим synthesisId вернул версии (фильтр доступа сломан)");
  // (3) CASCADE версий вместе с синтезом (правка п.3, миграция 0001)
  await db5u.delete(sch5u.syntheses).where(eq5u(sch5u.syntheses.id, sid5u));
  const left = await db5u.select().from(sch5u.elementVersions)
    .where(and5u(eq5u(sch5u.elementVersions.synthesisId, sid5u), eq5u(sch5u.elementVersions.elementType, "category")));
  if (left.length !== 0) errs.push("5u: версии пережили удаление синтеза (нет CASCADE по synthesis_id)");
  await db5u.delete(sch5u.users).where(eq5u(sch5u.users.id, uid5u));
}

// ── 2t (беседа 5.3): модули Element Enrichment + taxonomy-роуты ──────
{
  need(await import("./services/element-enrichment.js"), [
    "EnrichmentError", "enrichCategory", "enrichEdge", "justifyCharacteristic",
    "startEnrichment", "startJustification", "getEnrichments", "getJustifications",
    "setUsageRecorder", "validateJustifyInput", "parseJustificationHtml",
    "buildSynthesisContextText", "buildCategoryVars", "buildEdgeVars", "buildCharacteristicVars",
    "enrichmentPromptKey", "enrichmentStreamKey", "toEnrichmentDto", "toJustificationDto",
    "CATEGORY_ENRICHMENT_TYPES", "EDGE_ENRICHMENT_TYPES", "CHARACTERISTIC_PROMPT_KEY",
  ], "services/element-enrichment");
  need(await import("./routes/enrichment.js"), ["enrichmentRoutes"], "routes/enrichment");
  need(await import("./routes/taxonomy.js"), ["taxonomyRoutes"], "routes/taxonomy");
  need(await import("./config/enrichment-templates.js"), ["SEED_ENRICHMENT_TEMPLATES", "JUSTIFICATION_SECTIONS"], "config/enrichment-templates");
  need(await import("./services/element-taxonomy.js"), ["RELATIONSHIP_DIRECTIONS"], "services/element-taxonomy (5.3)");
  need(await import("@philosynth/shared/constants/characteristics"), [
    "CATEGORY_CHARACTERISTICS", "EDGE_CHARACTERISTICS", "CHARACTERISTICS_BY_TYPE",
    "resolveCharacteristic", "validateCharacteristicValue",
  ], "shared/constants/characteristics");
}

// ── 5v (беседа 5.3): живая история обогащений против БД (ДО закрытия пула) ──
// Стрим здесь не гоняем (нет Claude) — проверяются доступ по synthesis_id,
// сортировка DESC, фильтр elementType, DTO (costUsd → number) и CASCADE.
{
  const { db: db5v } = await import("./db/index.js");
  const sch5v = await import("./db/schema.js");
  const { eq: eq5v } = await import("drizzle-orm");
  const en5v = await import("./services/element-enrichment.js");
  const tag5v = Date.now().toString(36);
  const [u5v] = await db5v.insert(sch5v.users).values({
    email: `iq5v-${tag5v}@check.local`, passwordHash: "x", displayName: "5v",
  } as never).returning();
  const uid5v = (u5v as { id: string }).id;
  const [s5v] = await db5v.insert(sch5v.syntheses).values({
    userId: uid5v, seed: "5v", sectionOrder: ["sum", "graph"], status: "ready",
  } as never).returning();
  const sid5v = (s5v as { id: string }).id;
  const [cat5v] = await db5v.insert(sch5v.categories).values({
    synthesisId: sid5v, name: "Э", type: "логическая", definition: "d", position: 0,
  } as never).returning();
  const catId5v = (cat5v as { id: string }).id;
  const ins = (t: string) => db5v.insert(sch5v.elementEnrichments).values({
    synthesisId: sid5v, elementId: catId5v, elementType: "category", enrichmentType: t,
    promptKey: en5v.enrichmentPromptKey("category", t), content: "<div>" + t + "</div>",
    inputTokens: 10, outputTokens: 5, costUsd: "0.000105",
  } as never);
  await ins("description");
  await new Promise((r) => setTimeout(r, 5));
  await ins("evolution");
  const hist = await en5v.getEnrichments(sid5v, catId5v);
  if (hist.map((e) => e.enrichmentType).join(",") !== "evolution,description")
    errs.push(`5v: getEnrichments не DESC по created_at: ${hist.map((e) => e.enrichmentType).join(",")}`);
  if (hist[0] && (typeof hist[0].costUsd !== "number" || Math.abs(hist[0].costUsd - 0.000105) > 1e-9))
    errs.push("5v: DTO costUsd не number из numeric");
  if ((await en5v.getEnrichments(sid5v, catId5v, "edge")).length !== 0) errs.push("5v: фильтр elementType не работает");
  if ((await en5v.getEnrichments("00000000-0000-4000-8000-000000000000", catId5v)).length !== 0)
    errs.push("5v: getEnrichments с чужим synthesisId вернул записи (доступ по synthesis_id сломан)");
  await db5v.insert(sch5v.characteristicJustifications).values({
    synthesisId: sid5v, elementId: catId5v, elementType: "category", characteristic: "centrality",
    value: 0.9, justification: "j", limitations: null, alternativeApproaches: "a",
  } as never);
  const js = await en5v.getJustifications(sid5v, catId5v);
  if (js.length !== 1 || js[0]?.limitations !== null || js[0]?.alternativeApproaches !== "a" || js[0]?.value !== 0.9)
    errs.push(`5v: getJustifications → ${JSON.stringify(js)}`);
  await db5v.delete(sch5v.syntheses).where(eq5v(sch5v.syntheses.id, sid5v));
  const left = await db5v.select().from(sch5v.elementEnrichments).where(eq5v(sch5v.elementEnrichments.synthesisId, sid5v));
  const leftJ = await db5v.select().from(sch5v.characteristicJustifications).where(eq5v(sch5v.characteristicJustifications.synthesisId, sid5v));
  if (left.length || leftJ.length) errs.push("5v: обогащения/обоснования пережили удаление синтеза (нет CASCADE)");
  await db5v.delete(sch5v.users).where(eq5v(sch5v.users.id, uid5v));
}

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
  // Гейт 1.5b СУЖЕН беседой 3.2: сервер принимает каталожные концепции
  // (type='synthesis'), блокируются только ФАЙЛОВЫЕ — до импорта 4.3
  if (!formSrc15b.includes("Файловые концепции пока не поддержаны"))
    errs.push("4n: сабмит с файловыми ☑-концепциями не блокируется (гейт сужен 3.2, остаток — до 4.3)");
  if (!formSrc15b.includes("CONTEXT_BUDGET_PREVIEW"))
    errs.push("4n: превью бюджета без клиентской копии CONTEXT_BUDGET (дрейф-риск обязан быть локализован и помечен)");
  const pageSrc15b = await rd("../client/src/pages/CreateSynthesisPage.tsx");
  if (!pageSrc15b.includes("prepareForGeneration()")) errs.push("4n: prepareForGeneration не зовётся перед POST");
  const cfSrc = await rd("../client/src/utils/concept-file.ts");
  // Долг TODO(3.1/3.2) ЗАКРЫТ беседой 3.2: genealogy заполняется
  if (/TODO\(3\.1\/3\.2\)(?! закрыт)/.test(cfSrc))
    errs.push("4n: незакрытая метка TODO(3.1/3.2) после закрытия долга (3.2)");
  if (!cfSrc.includes("reconstructGenealogy(meta, embeddedState, doc)"))
    errs.push("4n: importConceptAsParticipant не реконструирует генеалогию (долг 3.2)");
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
  // Беседа 4.2 сняла заглушки: кнопки экспорта зовут downloadExport (§12 закрыт)
  if (!gmSrc.includes("downloadExport") || gmSrc.includes("exportStub"))
    errs.push("4q: экспорт-кнопки GraphModal не переведены на downloadExport (4.2)");

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

// ── 2p (беседа 3.1): модули мета-синтеза и генеалогии ──
need(await import("./services/meta-synthesis-service.js"), [
  "MetaSynthesisError", "loadConceptContext", "loadConceptParticipants",
  "validateConceptForMetaSynthesis", "unsuitableConceptMessage",
  "collectPhilosopherAncestors", "isAncestor", "checkGenealogyOverlaps",
  "conceptContextBlockFull", "conceptContextBlockSelective",
  "buildMetaParentContext",
], "services/meta-synthesis-service (3.1)");
need(await import("./services/lineage-service.js"), [
  "getAncestors", "getDescendants", "searchByPhilosophers",
  "createLineageRecords",
], "services/lineage-service (3.1)");
need(await import("./routes/lineage.js"),
  ["lineageRoutes", "lineageSearchRoutes"], "routes/lineage (3.1)");

// ── 4v (беседа 3.1): контракты мета-синтеза ──
{
  const fsv = await import("node:fs/promises");
  const rdv = (rel: string) => fsv.readFile(new URL(rel, import.meta.url), "utf8");
  const msSrc = await rdv("./services/meta-synthesis-service.ts");
  const lsSrc = await rdv("./services/lineage-service.ts");
  const gsSrc = await rdv("./services/generation-service.ts");
  const rsSrc = await rdv("./routes/syntheses.ts");
  const rlSrc = await rdv("./routes/lineage.ts");
  const scSrc = await rdv("./routes/sections.ts");
  const ixSrc4v = await rdv("./index.ts");

  // Провайдер: стаб 1.4 заменён настоящим; предупреждение-заглушка удалена
  if (!gsSrc.includes("buildMetaParentContext(p, sectionKey, subsectionName)"))
    errs.push("4v: registerParentContextProvider не зовёт buildMetaParentContext");
  if (gsSrc.includes("блок родителей опущен"))
    errs.push("4v: стаб провайдера 1.4 не удалён");
  // Гейт мета-синтеза — ФЛАГ isMetaSynthesis выставляется в buildParams
  if (!gsSrc.includes("isMetaSynthesis: conceptParticipants.length > 0"))
    errs.push("4v: buildParams не выставляет флаг isMetaSynthesis");
  // Загрузка участников внутри runGenerationPasses/buildEditInfra
  // (сигнатуры прежние — pause-resume/планы получают мета-контекст даром)
  if ((gsSrc.match(/loadConceptParticipants\(/g) ?? []).length < 2)
    errs.push("4v: loadConceptParticipants не в обеих точках generation-service");
  // Все 4 вызова buildContextForSection несут participants (давление бюджета)
  if ((gsSrc.match(/participants: (conceptParticipants|p\.conceptParticipants \?\? \[\])/g) ?? []).length !== 4)
    errs.push("4v: не все вызовы buildContextForSection несут participants");
  // genCommon наполнен реальными участниками (TODO(3.1) закрыты)
  if (/buildParentSpecBySection\(\s*\[\]/.test(gsSrc) ||
      /computeFullConceptBlockSizes\(\[\]\)/.test(gsSrc))
    errs.push("4v: genCommon всё ещё с пустыми участниками");
  if (/TODO\(3\.1\)/.test(gsSrc + msSrc + lsSrc + rsSrc + rlSrc + scSrc))
    errs.push("4v: маркеры TODO(3.1) в серверном дереве остались");
  // Квирк монолита: portraits/graphEdges отсутствуют в Full-блоке (порт 1:1)
  const fullBody = msSrc.split("conceptContextBlockFull(p: ConceptBlockParams)")[1]
    ?.split("conceptContextBlockSelective")[0] ?? "";
  if (fullBody.includes('"portraits"') || fullBody.includes('"graphEdges"'))
    errs.push("4v: квирк Full-блока нарушен (portraits/graphEdges попали в монолит)");
  // loadConceptContext — все 10 полей исходника (дыра 07: там 8)
  for (const k of ["capsule:full", "sum:goals", "sum:portraits", "sum:tensions",
    "graph:nodes_top", "graph:edges", "dialogue:new_concepts",
    "dialogue:synthesis", "glossary:table", "theses:summary"])
    if (!msSrc.includes(`"${k}"`))
      errs.push(`4v: loadConceptContext без фрагмента ${k}`);
  // Тексты предупреждений [22475]/[22492] дословно
  if (!msSrc.includes("Это может привести к доминированию их позиций.") ||
      !msSrc.includes("Их влияние будет удвоено."))
    errs.push("4v: тексты checkGenealogyOverlaps не дословны");
  // POST: приём synthesis-участников + генеалогия через createLineageRecords
  if (!rsSrc.includes('p.type === "synthesis"') ||
      !rsSrc.includes("createLineageRecords(synthesisId"))
    errs.push("4v: POST /syntheses не принимает концепции или пишет lineage мимо сервиса");
  if (!rsSrc.includes("genealogyWarnings"))
    errs.push("4v: ответ POST без предупреждений генеалогии (M3)");
  // /estimate: вес родителей синхронным колбэком по предвычисленной карте
  if (!rsSrc.includes("overheadBySection[normalizeSectionKey(sectionKey)]"))
    errs.push("4v: /estimate без parentOverheadForSection-колбэка");
  // Превью контекста раздела — с участниками (пометка «до 3.1» закрыта)
  if (!scSrc.includes("{ participants: conceptParticipants }"))
    errs.push("4v: /:key/context не передаёт участников");
  // CTE: имя descendants (desc — SQL-keyword), клампы глубины, IN-список
  if (/WITH RECURSIVE desc/.test(lsSrc))
    errs.push("4v: CTE назван desc (зарезервированное слово)");
  if (!lsSrc.includes("MAX_LINEAGE_DEPTH = 10"))
    errs.push("4v: clampDepth без потолка 10");
  // Доступ: lineage-роуты под requireAuth + loadSynthesisForRead; отсечение
  // приватных поддеревьев потомков
  if ((rlSrc.match(/requireAuth/g) ?? []).length < 3)
    errs.push("4v: lineage-роуты не все под requireAuth");
  if (!rlSrc.includes("pruneInvisible"))
    errs.push("4v: потомки без отсечения приватных поддеревьев");
  // Монтирование обоих роутеров
  if (!ixSrc4v.includes('app.route("/api/v1/syntheses", lineageRoutes)') ||
      !ixSrc4v.includes('app.route("/api/v1/lineage", lineageSearchRoutes)'))
    errs.push("4v: lineage-роутеры не смонтированы");
  // Анти-цикл ESM: meta-synthesis-service не импортирует generation-service
  if (/from "\.\/generation-service\.js"/.test(msSrc))
    errs.push("4v: цикл meta-synthesis-service → generation-service");
  // Миграция схемы (стык 2.2↔3.1): p переводится вместе со строкой
  if (!gsSrc.includes("p.parentContextSchema = PARENT_CONTEXT_SCHEMA_ID"))
    errs.push("4v: первая перегенерация после миграции шла бы по монолиту");
}

// ── 4w (беседа 3.2): Concept Participants + Genealogy Tree — клиент ──
{
  const cm = clientModule;
  need(await cm("../client/src/utils/genealogy.ts"), [
    "isPlaceholderConceptName", "resolveConceptName", "reconstructGenealogy",
    "restoreCapsulesFromHTML", "normalizeGenealogyNames",
    "stripCapsulesFromGenealogy", "collectPhilosopherAncestors",
    "checkGenealogyOverlaps", "lineageNodeToGenealogy",
  ], "client/utils/genealogy");
  need(await cm("../client/src/api/lineage.ts"),
    ["getAncestors", "getDescendants", "searchByPhilosophers"], "client/api/lineage");
  need(await cm("../client/src/components/lineage/GenealogyTree.tsx"),
    ["GenealogyTree"], "client/lineage/GenealogyTree");
  need(await cm("../client/src/components/lineage/LineageSearch.tsx"),
    ["LineageSearch"], "client/lineage/LineageSearch");

  const fsw = await import("node:fs/promises");
  const rdw = (rel: string) => fsw.readFile(new URL(rel, import.meta.url), "utf8");
  const genSrc = await rdw("../client/src/utils/genealogy.ts");
  const msSrc4w = await rdw("./services/meta-synthesis-service.ts");
  // Тексты checkGenealogyOverlaps КЛИЕНТ ≡ СЕРВЕР (дословный дрейф-контроль)
  for (const t of ["Это может привести к доминированию их позиций.",
    "Их влияние будет удвоено."])
    if (!genSrc.includes(t) || !msSrc4w.includes(t))
      errs.push(`4w: текст overlaps дрейфанул клиент↔сервер: ${t.slice(0, 30)}…`);
  // FIX кириллицы в resolveConceptName ([а-яё], та же грабля, что 1.4)
  if (!genSrc.includes("рекомендуем[а-яё]+"))
    errs.push("4w: resolveConceptName без FIX [а-яё] (регексп префиксов не срежет кириллицу)");
  // Адаптер API-дерева сохраняет synthesisId (кликабельность узлов)
  if (!genSrc.includes("if (node.synthesisId) g.synthesisId = node.synthesisId;"))
    errs.push("4w: lineageNodeToGenealogy теряет synthesisId");

  const cfSrc4w = await rdw("../client/src/utils/concept-file.ts");
  // Каталожные записи пула: фабрика + префикс дедупликации
  if (!cfSrc4w.includes("catalogPreviewToPoolEntry") ||
      !cfSrc4w.includes('"catalog:" + preview.id'))
    errs.push("4w: catalogPreviewToPoolEntry отсутствует или без префикса catalog:");

  const formSrc32 = await rdw("../client/src/components/synthesis/SynthesisForm.tsx");
  // Каталожные ☑ → ParticipantInput {type:'synthesis'} в POST и /estimate
  if (!formSrc32.includes('.map((p) => ({ type: "synthesis", synthesisId: p.synthesisId! }))'))
    errs.push("4w: buildInput не переводит каталожные концепции в participants");
  if (!/conceptParticipants,\s*\/\/ беседа 3\.2/.test(formSrc32))
    errs.push("4w: участники-концепции не в deps estimateParams (оценка не пересчитается)");
  // Предполётный confirm пересечений (тексты — из checkGenealogyOverlaps)
  if (!formSrc32.includes("Генеалогические пересечения участников:"))
    errs.push("4w: предполётный confirm пересечений отсутствует");
  // estimate-diff: /estimate ДВАЖДЫ — с участниками и без
  if ((formSrc32.match(/estimateSynthesis\(/g) ?? []).length < 2)
    errs.push("4w: FullBudgetPreview без двух вызовов /estimate (estimate-diff, долг §12)");
  if (!formSrc32.includes("Оценка с родителями:"))
    errs.push("4w: строка estimate-diff не рисуется");

  const advSrc = await rdw("../client/src/components/synthesis/CompatAdvisor.tsx");
  // Долг §12: applyReplacement-трио
  if (!advSrc.includes("onApplyReplacement") ||
      !advSrc.includes("СОХРАНИТЬ УРОВЕНЬ → ЗАМЕНИТЬ МЕТОД:"))
    errs.push("4w: CompatAdvisor без кнопок замен (долг applyReplacement §12)");
  if (!advSrc.includes("orderAdvice"))
    errs.push("4w: CompatAdvisor без блока рекомендации порядка");
  if (!advSrc.includes('severity === "conflict" || severity === "hard-conflict"'))
    errs.push("4w: панель не автораскрывается при конфликте");

  const pageSrc32 = await rdw("../client/src/pages/CreateSynthesisPage.tsx");
  if (!pageSrc32.includes("genWarnings"))
    errs.push("4w: серверные warnings POST не рисуются");
  // Попутная починка дефекта 1.6b: navigate НЕ внутри апдейтера setState
  if (/setSynthesisId\(\(id\) => \{\s*if \(id\) navigate/.test(pageSrc32))
    errs.push("4w: navigate внутри апдейтера setSynthesisId (setState-in-render — дефект 1.6b вернулся)");

  const dvSrc = await rdw("../client/src/components/document/DocumentView.tsx");
  if (!dvSrc.includes("afterHeader"))
    errs.push("4w: DocumentView без слота afterHeader");
  const spSrc = await rdw("../client/src/pages/SynthesisPage.tsx");
  if (!spSrc.includes("Генеалогическое древо") || !spSrc.includes("getAncestors"))
    errs.push("4w: SynthesisPage без секции генеалогии");
  if (!spSrc.includes("descendantsOf=${synthesis.id}"))
    errs.push("4w: SynthesisPage без ссылки «Потомки в каталоге»");
  const cpSrc = await rdw("../client/src/pages/CatalogPage.tsx");
  if (!cpSrc.includes('searchParams.get("descendantsOf")') ||
      !cpSrc.includes("getDescendants") || !cpSrc.includes("visibleItems"))
    errs.push("4w: CatalogPage без фильтра потомков (пересечение — аудит 2026-07-30)");
  if (!cpSrc.includes("<LineageSearch />"))
    errs.push("4w: LineageSearch не встроен в каталог");
  const cardSrc = await rdw("../client/src/components/catalog/SynthesisCard.tsx");
  if (!cardSrc.includes("hasConceptParents") || !cardSrc.includes("мета-синтез"))
    errs.push("4w: карточка без бейджа мета-синтеза");

  // Транспорт признака: shared-тип + сервер (обе точки списков + поиск)
  const prevSrc = await rdw("../packages/shared/types/synthesis.ts");
  if (!prevSrc.includes("hasConceptParents: boolean"))
    errs.push("4w: SynthesisPreview без hasConceptParents");
  const rsSrc4w = await rdw("./routes/syntheses.ts");
  if (!rsSrc4w.includes("loadConceptParentFlags") ||
      (rsSrc4w.match(/metaFlags\.has\(r\.id\)/g) ?? []).length < 2)
    errs.push("4w: списки каталога не несут hasConceptParents");
  const rlSrc4w = await rdw("./routes/lineage.ts");
  if (!rlSrc4w.includes("loadConceptParentFlags"))
    errs.push("4w: /lineage/search без hasConceptParents");

  // CSS дерева: базовые правила + мобильная медиа + светлая схема + квирк
  const cssSrc = await rdw("../client/src/globals.css");
  if (!cssSrc.includes(".gen-tree {") || !cssSrc.includes(".gen-tree-light"))
    errs.push("4w: CSS .gen-tree/.gen-tree-light не в globals.css");
  if (!/@media \(max-width: 500px\) \{[^]*?\.gen-tree ul \{[^]*?flex-direction: column/.test(cssSrc))
    errs.push("4w: мобильная медиа дерева (≤500px, column) не перенесена");
  if (!cssSrc.includes(".gen-tree > ul::before { display: none; }*/"))
    errs.push("4w: закомментированный квирк исходника не сохранён дословно");

  for (const rel of ["../client/src/utils/genealogy.ts", "../client/src/api/lineage.ts",
    "../client/src/components/lineage/GenealogyTree.tsx",
    "../client/src/components/lineage/LineageSearch.tsx"]) {
    const src = await rdw(rel);
    if (/localStorage|sessionStorage/.test(src)) errs.push(`4w: browser storage запрещён (${rel})`);
    if (/TODO\(3\.2\)(?! закрыт)/.test(src)) errs.push(`4w: незакрытая метка TODO(3.2) в ${rel}`);
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

  // Канон портретного подраздела — дословно из исходника; заголовки
  // режимов переехали в mode-service (беседа 4.1) — проверка ниже в 4x
  if (!caSrc.includes('PORTRAIT_CANON = "Портрет каждого философа"'))
    errs.push("4r: PORTRAIT_CANON не дословный [9753]");
  // Анти-цикл: cascade-analyzer НЕ импортирует generation-service
  // (context-builder → cascade-analyzer → generation-service → context-builder)
  if (/from "\.\/generation-service\.js"/.test(caSrc) || !/loadSynthesisLocal/.test(caSrc))
    errs.push("4r: cascade-analyzer обязан грузить синтез локально (цикл через generation-service)");
  // Беседа 4.1: локальные порты режимов СНЯТЫ (долг §12) — владелец
  // mode-service; связь с ним только ЛЕНИВЫМ import() (статический
  // импорт замкнул бы цикл через generation-service)
  if (/TODO\(4\.1\)/.test(caSrc))
    errs.push("4r: метки TODO(4.1) остались после снятия портов режимов (4.1)");
  // (^import — иначе ловится пример в комментарии; дефект пойман 4.1)
  if (/^import[^\n]*from "\.\/mode-service\.js"/m.test(caSrc))
    errs.push("4r: статический импорт mode-service в cascade-analyzer — цикл (нужен ленивый import())");
  if (!caSrc.includes('await import("./mode-service.js")'))
    errs.push("4r: делегаты режимов не связаны с mode-service (ленивый import())");
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
  // ws/handler: операции 2.2 диспетчеризованы; start_mode реализован 4.1
  for (const t of ["start_regen", "start_sub_regen", "execute_plan", "confirm_step"])
    if (!new RegExp(`case "${t}":\\s*\\n(?![\\s\\S]{0,80}не реализован)`).test(whSrc2))
      errs.push(`4s: ws ${t} не реализован`);
  if (!/case "start_mode":[\s\S]{0,300}startMode\(/.test(whSrc2))
    errs.push("4s: start_mode не диспетчеризован в startMode (беседа 4.1)");
  // routes/generation: owner-only + 409 при активной генерации
  if (!rgSrc.includes("GENERATION_IN_PROGRESS") || !rgSrc.includes("requireAuth"))
    errs.push("4s: routes/generation без гейтов (03 §2.5, §4.3)");
  const ixSrc2 = await rdr2("./index.ts");
  if (!ixSrc2.includes('app.route("/api/v1/syntheses", generationRoutes)'))
    errs.push("4s: generationRoutes не смонтирован");
}


// ── 2n (беседа 2.4): colorize-log (shared), log-formatter, context-quality, routes/logs ──
need(await import("@philosynth/shared/utils/colorize-log"), ["colorizeLog"], "utils/colorize-log");
need(await import("./services/log-formatter.js"),
  ["formatCtxLog", "formatCtxLogHTML", "formatPromptsForExport"], "services/log-formatter");
need(await import("./services/context-quality.js"),
  ["getSectionContextQuality", "getSectionContextQualityMap"], "services/context-quality");
need(await import("./routes/logs.js"), ["logsRoutes"], "routes/logs");

// ── 4t (беседа 2.4): текстовые контракты лога контекста и генерации ──
{
  const fsr3 = await import("node:fs/promises");
  const rdr3 = (p: string) => fsr3.readFile(new URL(p, import.meta.url), "utf8");
  const lfSrc = await rdr3("./services/log-formatter.ts");
  // genCommon — из служебной строки '_genCommon' (1.4), из цикла записей исключена
  if (!lfSrc.includes('sectionKey === "_genCommon"') ||
      !lfSrc.includes('sectionKey !== "_genCommon"'))
    errs.push("4t: служебная строка _genCommon не выделена/не исключена из цикла");
  // rawBaseBudget: ×1.5 только critique (восстановление сырого бюджета)
  if (!/critique.*1\.5/.test(lfSrc))
    errs.push("4t: восстановление rawBaseBudget (critique ×1.5) потеряно");
  // Fallback-реконструкция промптов — НЕ здесь (4.2): пометка + TODO
  // Беседа 4.2 подключила fallback-реконструкцию: метка «промпт недоступен»
  // остаётся лишь при невозможной реконструкции; маркеров TODO(4.2) нет
  if (!lfSrc.includes("промпт недоступен (импортированная") || /TODO\(4\.2\)/.test(lfSrc))
    errs.push("4t: log-formatter — метка недоступности или устаревший TODO(4.2)");
  // Регулярки СРЕЗА параметров тождественны v10 [24410/24443]: два маркера;
  // «КОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ» — в регулярках СВЁРТКИ скелета
  // (generation-service, порт [8546] беседы 1.4) — 07 смешивает оба места
  for (const m of ["КОНТЕКСТ ДРУГИХ", "Перегенерируй ТОЛЬКО"])
    if (!lfSrc.includes(m)) errs.push(`4t: маркер среза «${m}» потерян`);
  if (!(await rdr3("./services/generation-service.ts")).includes("КОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ"))
    errs.push("4t: маркер свёртки «КОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ» потерян [8546]");
  // colorize-log: клиентский файл — тонкий реэкспорт единой shared-реализации
  const clSrc = await rdr3("../client/src/components/logs/colorize-log.ts");
  if (!clSrc.includes('export { colorizeLog } from "@philosynth/shared/utils/colorize-log"'))
    errs.push("4t: клиентский colorize-log не реэкспорт shared (дублирование реализаций)");
  // routes/logs: 4 эндпоинта, каждый под requireAuth; доступ через loadSynthesisForRead (1.6)
  const rlSrc = await rdr3("./routes/logs.ts");
  for (const ep of ["/:id/logs/generation", "/:id/logs/context", "/:id/logs/formatted", "/:id/logs/prompts"])
    if (!rlSrc.includes(`"${ep}", requireAuth`))
      errs.push(`4t: ${ep} отсутствует либо без requireAuth`);
  if (!rlSrc.includes("loadSynthesisForRead"))
    errs.push("4t: logs без общей проверки доступа (владелец ИЛИ публичный, 1.6)");
  const ixSrc3 = await rdr3("./index.ts");
  if (!ixSrc3.includes('app.route("/api/v1/syntheses", logsRoutes)'))
    errs.push("4t: logsRoutes не смонтирован");
  // plan-executor: version_marker несёт metadata.version (печать «ВЕРСИЯ vN»)
  const peSrc3 = await rdr3("./services/plan-executor.ts");
  if (!/version:\s*vrow\s*\?\s*formatVersion/.test(peSrc3))
    errs.push("4t: version_marker без metadata.version — «ВЕРСИЯ vN» в логе останется без номера");
  // Клиент: ContextLogViewer — html через dangerouslySetInnerHTML, перезапрос
  // по refreshKey, download через Blob + transliterate (паритет имени файла)
  const cvSrc = await rdr3("../client/src/components/logs/ContextLogViewer.tsx");
  for (const m of ["dangerouslySetInnerHTML", "refreshKey", "transliterate", "Blob"])
    if (!cvSrc.includes(m)) errs.push(`4t: ContextLogViewer без ${m}`);
  if (/localStorage|sessionStorage/.test(cvSrc))
    errs.push("4t: browser storage запрещён (ContextLogViewer)");
  // DocumentFooter: кнопка «◈ Лог» строго за пропом onOpenLog
  const dfSrc = await rdr3("../client/src/components/document/DocumentFooter.tsx");
  if (!dfSrc.includes("onOpenLog") || !dfSrc.includes("◈ Лог"))
    errs.push("4t: кнопка «◈ Лог» в DocumentFooter потеряна");
  // SynthesisPage: viewOnly-подписка ВСЕГДА (фикс интеграционного бага
  // тестов 2.4: standalone-regen не меняет status → без постоянной
  // подписки live-обновление лога не работает; аналог refreshCtxLogIfOpen)
  const spSrc = await rdr3("../client/src/pages/SynthesisPage.tsx");
  if (!spSrc.includes("synthesisId: id ?? null") || !spSrc.includes("viewOnly: true"))
    errs.push("4t: SynthesisPage без постоянной viewOnly-подписки (live-лог standalone-regen)");
  if (!spSrc.includes("refreshKey"))
    errs.push("4t: SynthesisPage не передаёт refreshKey в ContextLogViewer");
  // globals.css: стили лога .raw-* портированы
  const cssSrc = await rdr3("../client/src/globals.css");
  if (!cssSrc.includes(".raw-overlay") || !cssSrc.includes(".raw-copy"))
    errs.push("4t: стили .raw-* лога не портированы в globals.css");
  // Меток TODO(2.4) в дереве не осталось
  for (const p of ["./routes/sections.ts", "./services/log-formatter.ts"])
    if (/TODO\(2\.4\)(?! закрыт)/.test(await rdr3(p))) errs.push(`4t: незакрытая метка TODO(2.4) в ${p}`);
}

// ── 2o (беседа 2.3): клиент Edit Modal + Cascade Panel + превью-транспорт ──
need(await clientModule("../client/src/api/plans.ts"), [
  "createPlan", "getPlan", "updatePlan", "executePlan", "deletePlan",
  "getPlanImpact", "getSubsectionImpact", "regenerateSubsection",
], "client/api/plans (2.3)");
need(await clientModule("../client/src/hooks/useEditPlan.ts"),
  ["useEditPlan", "useEditPlanStore"], "client/hooks/useEditPlan (2.3)");
for (const [file, exp] of [
  ["EditModal", "EditModal"], ["EditSectionCard", "EditSectionCard"],
  ["SubsectionRegenPanel", "SubsectionRegenPanel"], ["CascadePanel", "CascadePanel"],
  ["EditPlanPanel", "EditPlanPanel"], ["AddSectionPanel", "AddSectionPanel"],
] as const) {
  need(await clientModule(`../client/src/components/edit/${file}.tsx`), [exp],
    `client/components/edit/${file} (2.3)`);
}

// ── 4u (беседа 2.3): контракты превью-эндпоинтов и клиента редактирования ──
{
  const rdr4 = async (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  // shared: DTO превью каскада и подраздела
  const epTypes = await rdr4("../packages/shared/types/edit-plan.ts");
  for (const t of ["PlanImpactRequest", "PlanImpactResponse", "CascadeImpactDto",
    "SubsectionImpactRequest", "SubsectionImpactResponse", "CrossSectionDepDto"])
    if (!epTypes.includes(`export interface ${t}`))
      errs.push(`4u: shared/edit-plan без DTO ${t}`);
  // routes/plans: POST /:id/plans/impact — read-only (владелец, без insert),
  // маршрут не коллизирует: POST на /:id/plans/:planId не существует
  const rpSrc4 = await rdr4("./routes/plans.ts");
  if (!rpSrc4.includes('"/:id/plans/impact", requireAuth'))
    errs.push("4u: POST /:id/plans/impact отсутствует либо без requireAuth");
  const impactBlock = rpSrc4.slice(
    rpSrc4.indexOf('plansRoutes.post("/:id/plans/impact"'),
    rpSrc4.indexOf('plansRoutes.post("/:id/plans/:planId/execute"'));
  if (impactBlock.includes("insert("))
    errs.push("4u: превью каскада пишет в БД — обязан быть read-only (решение 2.3)");
  if (!impactBlock.includes("row.userId !== user.id"))
    errs.push("4u: превью каскада без владельческого гейта (правило 2.1)");
  if (!impactBlock.includes("estimatePlanCost"))
    errs.push("4u: превью без оценки стоимости выбранных действий (паритет футера)");
  if (/plansRoutes\.post\("\/:id\/plans\/:planId"/.test(rpSrc4))
    errs.push("4u: появился POST /:id/plans/:planId — теперь коллизирует с /plans/impact");
  // routes/generation: POST /:id/subsection-impact — БЕЗ гейта активной
  // генерации (превью не мешает прогону), с фильтрами присутствия
  const rgSrc4 = await rdr4("./routes/generation.ts");
  if (!rgSrc4.includes('"/:id/subsection-impact", requireAuth'))
    errs.push("4u: POST /:id/subsection-impact отсутствует либо без requireAuth");
  const subBlock = rgSrc4.slice(rgSrc4.indexOf("/:id/subsection-impact"));
  if (subBlock.includes("isGenerationActive("))
    errs.push("4u: превью подраздела гейтится активной генерацией — решение 2.3 требует обратного");
  for (const m of ["getIntraDependents", "getCrossSecDependents", "getAffectedModes",
    "buildSubsectionMap", "estimateSubsectionCost"])
    if (!subBlock.includes(m)) errs.push(`4u: превью подраздела без ${m}`);
  // PATCH /syntheses/:id += extGraphMetrics (транспорт чекбокса графа)
  const synSrc4 = await rdr4("./routes/syntheses.ts");
  if (!synSrc4.includes("body.extGraphMetrics !== undefined"))
    errs.push("4u: PATCH /syntheses/:id не принимает extGraphMetrics");
  // useEditPlan: терминальный колбэк по ПЕРЕХОДУ статуса в handleMessage
  // (грабля R3: ref-дедупликация в эффекте не переживает ремаунт);
  // подтверждение шага: draft→PATCH, executing→WS confirm_step
  const uepSrc = await rdr4("../client/src/hooks/useEditPlan.ts");
  if (!uepSrc.includes("prevStatus") || !uepSrc.includes("nextStatus !== prevStatus"))
    errs.push("4u: useEditPlan без детекции ПЕРЕХОДА терминального статуса (грабля R3)");
  if (!uepSrc.includes('send({ type: "confirm_step"'))
    errs.push("4u: confirmStep на исполнении не шлёт WS confirm_step");
  // EditModal: живой каскад с debounce+seq, НЕРАЗРУШАЮЩЕЕ обновление
  // (reloadSections+applySynthesis, НЕ store.load — цикл ремаунтов R3)
  const emSrc = await rdr4("../client/src/components/edit/EditModal.tsx");
  if (!emSrc.includes("400") || !emSrc.includes("impactSeq"))
    errs.push("4u: EditModal без debounce 400мс + seq-защиты превью каскада");
  if (!emSrc.includes("reloadSections") || /useSynthesisStore\(\(s\) => s\.load\)/.test(emSrc))
    errs.push("4u: onPlanFinished обязан обновлять reloadSections+applySynthesis, не store.load (грабля R3)");
  if (!emSrc.includes("structureSections"))
    errs.push("4u: EditModal без карточки «Структура документа устарела»");
  // SubsectionRegenPanel: очередь по section_done, капсула → весь раздел
  const srSrc = await rdr4("../client/src/components/edit/SubsectionRegenPanel.tsx");
  if (!srSrc.includes("section_done") || !srSrc.includes("stream_error"))
    errs.push("4u: очередь каскада подразделов не ждёт section_done/stream_error");
  if (!srSrc.includes('"capsule"'))
    errs.push("4u: потерян квирк «подраздел капсулы → перегенерация всего раздела»");
  // EditSectionCard: пороги бейджа 90/60 [18497], null → бейдж не рисуется
  const escSrc = await rdr4("../client/src/components/edit/EditSectionCard.tsx");
  if (!escSrc.includes(">= 90") || !escSrc.includes(">= 60") || !escSrc.includes("score !== null"))
    errs.push("4u: бейдж качества без порогов 90/60 либо рисует null как ноль");
  // Долг 1.6b закрыт: disclosure секционного контекста в SectionView
  const svSrc = await rdr4("../client/src/components/document/SectionView.tsx");
  if (!svSrc.includes("secContext") || !svSrc.includes("sec-disclosure"))
    errs.push("4u: долг makeSectionCtxDisclosure не закрыт в SectionView");
  // CSS модалки/каскада портирован; @keyframes spin добавлен (его не было)
  const cssSrc4 = await rdr4("../client/src/globals.css");
  for (const cls of [".edit-overlay", ".edit-modal", ".cascade-panel", "@keyframes spin"])
    if (!cssSrc4.includes(cls)) errs.push(`4u: globals.css без ${cls}`);
  // browser storage запрещён во всех новых клиент-файлах
  for (const rel of ["../client/src/hooks/useEditPlan.ts", "../client/src/api/plans.ts",
    "../client/src/components/edit/EditModal.tsx"])
    if (/localStorage|sessionStorage/.test(await rdr4(rel)))
      errs.push(`4u: browser storage запрещён (${rel})`);
  // Меток TODO(2.3) в дереве не осталось
  for (const rel of ["./routes/plans.ts", "./routes/generation.ts",
    "../client/src/components/edit/EditModal.tsx"])
    if (/TODO\(2\.3\)(?! закрыт)/.test(await rdr4(rel)))
      errs.push(`4u: незакрытая метка TODO(2.3) в ${rel}`);
}

// ── 4x (беседа 4.1): Mode Service — сервер + клиент ──────────────────
{
  const rdx = async (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const msx = await rdx("./services/mode-service.ts");

  // Заголовки/статика режимов дословно [22578] (анонс в 4r: «проверка в 4x»)
  for (const t of ['title: "⚔ Оппонент"', 'title: "🔄 Переводчик"', 'title: "⏳ Временной срез"'])
    if (!msx.includes(t)) errs.push(`4x: заголовок режима не дословный: ${t}`);
  // Тексты предупреждений checkModeDeps [22782] дословно
  for (const t of ["» недоступен (раздел «", "» не сгенерирован).",
    "» недоступен — качество может быть снижено."])
    if (!msx.includes(t)) errs.push("4x: текст предупреждения checkModeDeps не дословный");
  // Квирки исходника: taskChars = prompt − ctx (runMode) / целиком (silent);
  // catch silent не учитывает usage
  if (!msx.includes("prompt.length - ctx.length"))
    errs.push("4x: квирк taskChars runMode (prompt − ctx) потерян");
  if (!msx.includes("taskChars: prompt.length,"))
    errs.push("4x: квирк taskChars silent (промпт целиком) потерян");
  // Отступления (зафиксированы 07/03): silent — UPDATE с сохранением
  // created_at; source 'mode_cascade' (enum 02 §2.15); метка «[каскад]»
  if (!msx.includes("created_at") || !msx.includes('"mode_cascade"') || !msx.includes("[каскад]"))
    errs.push("4x: отступления silent-перегенерации (created_at/mode_cascade/[каскад]) потеряны");
  // Регистрация разъёма plan-executor — побочным эффектом импорта
  if (!/setModeRegenerator\(/.test(msx))
    errs.push("4x: регистрация regenerateModeSilent в setModeRegenerator потеряна");
  // Дельты стрима идут под sectionKey "mode:{modeKey}" (клиентский guard ниже)
  if (!msx.includes('"mode:" + modeKey'))
    errs.push('4x: sectionKey дельт режима не "mode:{modeKey}"');

  // Роуты §2.7: смонтированы, гейты auth/409/VALIDATION_ERROR, DELETE под 409
  const rt = await rdx("./routes/modes.ts");
  if (!rt.includes("requireAuth") || !rt.includes("isGenerationActive") ||
      !rt.includes('"VALIDATION_ERROR"') || !rt.includes("GENERATION_IN_PROGRESS"))
    errs.push("4x: routes/modes без гейтов (auth/409/VALIDATION_ERROR)");
  // Долг §12 закрыт: транспорт одиночной тихой перегенерации (каскад
  // SubsectionRegenPanel) — роут + обёртка startModeRegen с mode_done
  if (!rt.includes("/regenerate") || !rt.includes("startModeRegen"))
    errs.push("4x: POST /modes/:modeKey/:index/regenerate потерян (каскад режимов)");
  if (!msx.includes("startModeRegen") || !/startModeRegen[\s\S]{0,700}"mode_done"/.test(msx))
    errs.push("4x: startModeRegen без финала mode_done");
  if (!(await rdx("./index.ts")).includes("modesRoutes"))
    errs.push("4x: modesRoutes не смонтирован в index.ts");

  // Дрейф-контроль клиент↔сервер: MODE_UI (ModeModal) ≡ статике MODE_CONFIG.
  // Сравниваем ПОЛЯ (title/desc/paramLabel/paramPlaceholder/suggestions)
  // построчно в обе стороны — как 4w для checkGenealogyOverlaps.
  const mm = await rdx("../client/src/components/modes/ModeModal.tsx");
  const grab = (src: string, beg: string, end: string) => {
    const a = src.indexOf(beg); const b = src.indexOf(end, a);
    return a >= 0 && b > a ? src.slice(a, b) : "";
  };
  const cfgBlock = grab(msx, "export const MODE_CONFIG", "export const MODE_KEYS");
  const uiBlock = grab(mm, "export const MODE_UI", "export function");
  const fields = (block: string): string[] => {
    const out: string[] = [];
    const re = /(?:title|desc|paramLabel|paramPlaceholder|suggestions): (?:\[[^\]]*\]|"(?:[^"\\]|\\.)*")/g;
    for (let m = re.exec(block); m; m = re.exec(block)) out.push(m[0]);
    return out;
  };
  const srvF = fields(cfgBlock); const cliF = fields(uiBlock);
  if (srvF.length < 15 || cliF.length < 15)
    errs.push(`4x: дрейф-контроль MODE_UI — статика не найдена (server ${srvF.length}, client ${cliF.length})`);
  for (const s of srvF) if (!cliF.includes(s))
    errs.push(`4x: MODE_UI отстал от MODE_CONFIG: ${s.slice(0, 48)}…`);
  for (const s of cliF) if (!srvF.includes(s))
    errs.push(`4x: MODE_CONFIG отстал от MODE_UI: ${s.slice(0, 48)}…`);

  // Клиент: API-обёртки, вкладки, guard прогресса, кнопки страницы, CSS
  const am = await rdx("../client/src/api/modes.ts");
  for (const fn of ["runMode", "getModes", "getModeResults", "deleteMode"])
    if (!am.includes(`function ${fn}`)) errs.push(`4x: api/modes без ${fn}`);
  if (!(await rdx("../client/src/components/modes/ModeTabBar.tsx")).includes('id="modeTabsBar"'))
    errs.push('4x: ModeTabBar без id="modeTabsBar" (исходник [1620])');
  if (!(await rdx("../client/src/hooks/useStreamingGeneration.ts")).includes('startsWith("mode:")'))
    errs.push("4x: useStreamingGeneration без guard дельт режимов (mode:)");
  const spx = await rdx("../client/src/pages/SynthesisPage.tsx");
  if (!spx.includes("MODE_ORDER") || !spx.includes("capsuleHtml"))
    errs.push("4x: SynthesisPage без кнопок режимов или гейта капсулы (порт updateModeButtons [11799])");
  const cssX = await rdx("../client/src/globals.css");
  for (const sel of [".mode-overlay", ".mode-modal", ".mode-tab", "#modeTabsBar", "@keyframes pulse-tab"])
    if (!cssX.includes(sel)) errs.push(`4x: globals.css без ${sel}`);
  // browser storage запрещён в новых клиент-файлах
  for (const rel of ["../client/src/api/modes.ts",
    "../client/src/components/modes/ModeModal.tsx",
    "../client/src/components/modes/ModeTabBar.tsx",
    "../client/src/components/modes/ModeContent.tsx"])
    if (/localStorage|sessionStorage/.test(await rdx(rel)))
      errs.push(`4x: browser storage запрещён (${rel})`);
  // Долги §12 ЗАКРЫТЫ: панель «РЕЖИМЫ» EditModal + каскад режимов
  const mrp = await rdx("../client/src/components/edit/ModeResultsPanel.tsx");
  for (const t of ["РЕЖИМЫ", "editRegenMode-", "editDeleteMode-",
    "рекомендуется перегенерация"])
    if (!mrp.includes(t)) errs.push(`4x: ModeResultsPanel без «${t}» (порт [18556–18620])`);
  const emx = await rdx("../client/src/components/edit/EditModal.tsx");
  if (!emx.includes("ModeResultsPanel") || !emx.includes("modeRegen") ||
      !emx.includes("modeRemove"))
    errs.push("4x: EditModal не собирает режимные шаги в план");
  const cpx = await rdx("../client/src/components/edit/CascadePanel.tsx");
  if (!cpx.includes("отметить ↑") || !cpx.includes("onMarkModeRegen"))
    errs.push("4x: CascadePanel E5 без кнопки «отметить ↑» [19483]");
  const srx = await rdx("../client/src/components/edit/SubsectionRegenPanel.tsx");
  for (const t of ["Перегенерировать их?", "Оценка стоимости: ≈ $",
    "regenerateModeResult", 'kind: "mode"'])
    if (!srx.includes(t))
      errs.push(`4x: каскад режимов SubsectionRegenPanel без «${t}» (confirm [19022])`);
  if (!(await rdx("../client/src/hooks/useEditPlan.ts")).includes('"mode_done"'))
    errs.push("4x: useEditPlan не пробрасывает mode_done в SectionEvent");
  if (!(await rdx("../client/src/api/modes.ts")).includes("regenerateModeResult"))
    errs.push("4x: api/modes без regenerateModeResult");
  // Счётчики SynthesisPage перечитываются при закрытии EditModal
  if (!/editOpen/.test((await rdx("../client/src/pages/SynthesisPage.tsx"))
      .split("setModeCounts({})")[1]?.slice(0, 900) ?? ""))
    errs.push("4x: счётчики режимов SynthesisPage не перечитываются при закрытии EditModal");
  // Устаревших меток TODO(4.1) не осталось нигде в затронутых точках
  for (const rel of ["./services/plan-executor.ts", "./services/mode-service.ts",
    "./routes/modes.ts", "../client/src/components/edit/EditModal.tsx",
    "../client/src/components/edit/SubsectionRegenPanel.tsx"])
    if (/TODO\(4\.1\)/.test(await rdx(rel)))
      errs.push(`4x: устаревшая метка TODO(4.1) в ${rel}`);
}

// ── 2q (беседа 4.2): модули экспорта ─────────────────────────────────
need(await import("./services/export/common.js"),
  ["ExportError", "loadExportSynthesis", "exportFilename"], "export/common");
need(await import("./services/export/graph-model.js"),
  ["loadGModel", "emptyTopology"], "export/graph-model");
need(await import("./services/export/graph-style.js"),
  ["CPAL", "STRUCTURAL_PRIORITY", "PROCEDURAL_PRIORITY", "createGraphStyle",
   "_hexToHSL", "_hslToHex", "_blendHex"], "export/graph-style");
need(await import("./services/export/graph-physics.js"), ["tick", "warmup"], "export/graph-physics");
need(await import("./services/export/filename.js"), ["getDocFilename"], "export/filename");
need(await import("./services/export/mmd-exporter.js"), ["buildMMD", "exportMMD"], "export/mmd-exporter");
need(await import("./services/export/json-exporter.js"), ["buildJSON", "exportJSON"], "export/json-exporter");
need(await import("./services/export/png-exporter.js"), ["buildPNG", "exportPNG"], "export/png-exporter");
need(await import("./services/export/md-exporter.js"),
  ["buildMD", "exportMD", "subtitleForExport", "docDateFor"], "export/md-exporter");
need(await import("./services/export/html-exporter.js"),
  ["exportHTML", "buildModesExportSection", "buildGraphExportSection"], "export/html-exporter");
need(await import("./utils/css-audit.js"), ["auditCSS"], "utils/css-audit");
need(await import("./services/prompt-reconstruction.js"),
  ["buildReconstructionContext", "reconstructBaseCtxSkeleton",
   "reconstructCtxMarkers", "reconstructSectionTask", "reconstructSkeleton"],
  "prompt-reconstruction");
need(await import("./routes/export.js"), ["exportRoutes"], "routes/export");
need(await import("./config/export-assets.js"),
  ["EXPORT_GRAPH_FN_BUNDLE", "EXPORT_GRAPH_CONST_BUNDLE",
   "EXPORT_GM_OVERLAY_HTML", "EXPORT_MODE_OVERLAY_HTML",
   "EXPORT_SOURCE_RAW_CSS"], "config/export-assets");

// ── 4y (беседа 4.2): Export Service — контракты + дрейф-контроль ─────
{
  const { readFileSync: rf42 } = await import("node:fs");
  const rdx = async (rel: string): Promise<string> =>
    rf42(new URL(rel, import.meta.url), "utf8");
  const gs42 = await import("./services/export/graph-style.js");
  const cliUtils42 = await rdx("../client/src/components/graph/graph-utils.ts");
  const srvStyle42 = await rdx("./services/export/graph-style.ts");
  // Дрейф-контроль graph-style ↔ клиентский graph-utils 1.7 (оба — порты
  // одного исходника; сторож — как MODE_UI↔MODE_CONFIG в 4x)
  const pairs42 = (txt: string, name: string): string => {
    const m = txt.match(new RegExp(name + String.raw`[^=]*=\s*\{([\s\S]*?)\};`));
    if (!m) return "«блок не найден»";
    return [...m[1]!.matchAll(/([\wа-яё-]+)\s*:\s*([\d.]+)/gi)]
      .map((x) => x[1] + ":" + x[2]).join(",");
  };
  for (const nm of ["_TC_HUE_SEEDS", "_EC_HUE_SEEDS"])
    if (pairs42(cliUtils42, nm) !== pairs42(srvStyle42, nm))
      errs.push(`4y: дрейф ${nm} клиент↔сервер (${pairs42(cliUtils42, nm)} ≠ ${pairs42(srvStyle42, nm)})`);
  const dash42 = (txt: string): string =>
    [...txt.matchAll(/([\wа-яё]+)\s*:\s*\{\s*dash:\s*"([^"]+)",\s*pri:\s*(\d+)/gi)]
      .map((m) => (m[1] ?? "") + (m[2] ?? "") + (m[3] ?? "")).join("|");
  if (dash42(cliUtils42) !== dash42(srvStyle42))
    errs.push("4y: дрейф _EC_DASH_SEEDS клиент↔сервер");
  const cpal42 = (txt: string): string =>
    (txt.match(/CPAL[^=]*=\s*\[([\s\S]*?)\]/)?.[1] ?? "").match(/#[0-9a-f]{6}/gi)?.join(",") ?? "";
  if (cpal42(cliUtils42) !== gs42.CPAL.join(","))
    errs.push("4y: дрейф CPAL клиент↔сервер");
  const prio42 = (txt: string, name: string): string =>
    (txt.match(new RegExp(name + String.raw`[^=]*=\s*\[([\s\S]*?)\]`))?.[1] ?? "")
      .match(/"([\w-]+)"/g)?.join(",") ?? "";
  if (prio42(cliUtils42, "STRUCTURAL_PRIORITY") !== gs42.STRUCTURAL_PRIORITY.map((x) => `"${x}"`).join(","))
    errs.push("4y: дрейф STRUCTURAL_PRIORITY клиент↔сервер");
  if (prio42(cliUtils42, "PROCEDURAL_PRIORITY") !== gs42.PROCEDURAL_PRIORITY.map((x) => `"${x}"`).join(","))
    errs.push("4y: дрейф PROCEDURAL_PRIORITY клиент↔сервер");
  // Физика: числовые литералы tick/warmup тождественны клиентским
  const cliPhys42 = await rdx("../client/src/utils/graph-physics.ts");
  const srvPhys42 = await rdx("./services/export/graph-physics.ts");
  const fnNums42 = (txt: string, name: string): string => {
    const i = txt.indexOf("function " + name + "(");
    if (i < 0) return "«нет функции»";
    const j = txt.indexOf("\nexport function", i + 1);
    return (txt.slice(i, j < 0 ? undefined : j).match(/[-+]?\d*\.?\d+/g) ?? []).join(",");
  };
  for (const fn of ["tick", "warmup"])
    if (fnNums42(cliPhys42, fn) !== fnNums42(srvPhys42, fn))
      errs.push(`4y: дрейф констант физики ${fn} клиент↔сервер`);
  // subtitleForExport ↔ subtitleFor DocumentHeader (двойник веток [12126])
  const dh42 = await rdx("../client/src/components/document/DocumentHeader.tsx");
  const mdx42 = await rdx("./services/export/md-exporter.ts");
  for (const t of ["Свободный синтез (на основе зерна)", '"На основе: " + parts.join(" + ")'])
    if (!dh42.includes(t) || !mdx42.includes(t))
      errs.push(`4y: дрейф веток подзаголовка («${t.slice(0, 30)}…»)`);
  // Ассеты: fnBundle несёт все 46 функций встроенного просмотрщика,
  // constBundle — 6 констант; разметка модалок; CSS исходника цел
  const xa42 = await import("./config/export-assets.js");
  const FN46 = ["normalizeName", "normalizeType", "parseTopology", "parseGraph",
    "_hexToHSL", "_hslToHex", "_blendHex", "_rebuildNodeColors", "_rebuildEdgeStyles",
    "edgeTypeStyle", "showNodePanel", "showEdgePanel", "typeColor", "typeColorHex",
    "getTopRole", "getStructuralMarkers", "getStructuralMarker", "polyPath",
    "hexStarPath", "trapezoidPath", "rectPath", "nodeSymbolPath", "nodeGeometry3D",
    "tick", "warmup", "mkSprite", "getRolesFromLayer", "getRolesForMode",
    "getAllRoles", "applyClusters3D", "applyClusters2D", "toggleClusters",
    "clearLegendFilter", "build3D", "build2D", "buildLegend", "switchView",
    "openGraph", "closeGraph", "downloadFile", "toggleExportMenu",
    "closeExportMenu", "doExport", "exportMMD", "exportPNG", "exportJSON"];
  for (const fn of FN46)
    if (!new RegExp("function " + fn + "\\s*\\(").test(xa42.EXPORT_GRAPH_FN_BUNDLE))
      errs.push(`4y: fnBundle без function ${fn}(…)`);
  for (const cn of ["_TC_HUE_SEEDS", "_EC_HUE_SEEDS", "_EC_DASH_SEEDS", "CPAL",
    "PROCEDURAL_PRIORITY", "STRUCTURAL_PRIORITY"])
    if (!xa42.EXPORT_GRAPH_CONST_BUNDLE.includes("const " + cn + " ="))
      errs.push(`4y: constBundle без ${cn}`);
  if (!xa42.EXPORT_GM_OVERLAY_HTML.includes('id="gmOverlay"') ||
      xa42.EXPORT_GM_OVERLAY_HTML.includes("visible\""))
    errs.push("4y: gmOverlay-ассет повреждён (нет id либо класс visible)");
  if (!xa42.EXPORT_MODE_OVERLAY_HTML.includes('id="modeOverlay"') ||
      xa42.EXPORT_MODE_OVERLAY_HTML.includes("mode-modal-params"))
    errs.push("4y: modeOverlay-ассет несёт .mode-modal-params (клон обязан вырезать)");
  if (xa42.EXPORT_SOURCE_RAW_CSS.length < 50_000 ||
      !xa42.EXPORT_SOURCE_RAW_CSS.includes(".doc-header"))
    errs.push("4y: rawCSS-ассет подозрительно мал или без .doc-header");
  // Квирк исходника сохранён: classDef объявляются, строки class N… не пишутся
  const mmdSrc42 = await rdx("./services/export/mmd-exporter.ts");
  if (!mmdSrc42.includes("classDef t") || /lines\.push\([^)]*"class N/.test(mmdSrc42))
    errs.push("4y: mmd-exporter — квирк classDef-без-class нарушен");
  // Роуты: 5 эндпоинтов, NO_GRAPH → 400 VALIDATION_ERROR, монтирование
  const rx42 = await rdx("./routes/export.ts");
  for (const fmt of ["html", "md", "mmd", "png", "json"])
    if (!rx42.includes(`/:id/export/${fmt}`))
      errs.push(`4y: routes/export без GET /:id/export/${fmt}`);
  if (!rx42.includes('"VALIDATION_ERROR"') || !rx42.includes("NO_GRAPH") ||
      !rx42.includes("filename*=UTF-8''"))
    errs.push("4y: routes/export — NO_GRAPH→400 или RFC5987-имя потеряны");
  if (!(await rdx("./index.ts")).includes("exportRoutes"))
    errs.push("4y: exportRoutes не смонтирован в index.ts");
  // log-formatter: TODO(4.2) сняты, реконструкция подключена
  const lf42 = await rdx("./services/log-formatter.ts");
  if (/TODO\(4\.2\)/.test(lf42))
    errs.push("4y: устаревшая метка TODO(4.2) в log-formatter");
  if (!lf42.includes("reconstructSkeleton") || !lf42.includes("buildReconstructionContext"))
    errs.push("4y: log-formatter без fallback-реконструкции");
  // Клиент: заглушки GraphModal сняты, меню экспорта в SynthesisPage
  const gm42 = await rdx("../client/src/components/graph/GraphModal.tsx");
  if (gm42.includes("exportStub") || /TODO\(4\.2\)/.test(gm42) ||
      !gm42.includes("downloadExport"))
    errs.push("4y: GraphModal — заглушки экспорта не сняты (долг §12)");
  const sp42 = await rdx("../client/src/pages/SynthesisPage.tsx");
  if (!sp42.includes("⤓ Экспорт") || !sp42.includes("EXPORT_FORMATS"))
    errs.push("4y: SynthesisPage без меню «⤓ Экспорт»");
  const ax42 = await rdx("../client/src/api/export.ts");
  for (const t of ["exportUrl", "downloadExport", "EXPORT_FORMATS"])
    if (!ax42.includes(t)) errs.push(`4y: api/export без ${t}`);
  if (/localStorage|sessionStorage/.test(ax42))
    errs.push("4y: browser storage запрещён (api/export)");
  // Устаревших TODO(4.2) не осталось в затронутых точках
  for (const rel of ["./services/export/html-exporter.ts",
    "../client/src/components/graph/GraphModal.tsx",
    "../client/src/pages/SynthesisPage.tsx"])
    if (/TODO\(4\.2\)/.test(await rdx(rel)))
      errs.push(`4y: устаревшая метка TODO(4.2) в ${rel}`);
}

// ── 2r (беседа 4.3): модули импорта ──────────────────────────────────
{
  need(await import("./services/import-service.js"), [
    "importHTML", "ImportError", "titleToKey", "isPlaceholderConceptName",
    "resolveConceptName", "normalizeGenealogyNames", "restoreCapsulesFromHTML",
    "reconstructGenealogy", "extractMetadata", "validateImportMeta",
    "extractSections", "extractEmbeddedState", "extractModesFromHTML",
  ], "services/import-service");
  need(await import("./utils/html-parser.js"), ["parseDocument"], "utils/html-parser (4.3)");
  need(await import("./routes/import.js"), ["importRoutes"], "routes/import");
}

// ── 4z (беседа 4.3): контракты импорта + дрейф двойников клиент↔сервер ──
{
  const rdx = async (rel: string): Promise<string> =>
    readFileSync(new URL(rel, import.meta.url), "utf8");
  const is43 = await rdx("./services/import-service.ts");
  // Дрейф серверной копии titleToKey ↔ client/utils/concept-file.ts:
  // словарь TITLE_TO_KEY и ключевые слова KW должны совпадать построчно
  const cf43 = await rdx("../client/src/utils/concept-file.ts");
  // Ключи нормализуются: prettier у клиента снимает кавычки с
  // однословных ключей («глоссарий:» против «"глоссарий":»)
  const dict = (src: string): string =>
    (src.match(/(?:"[^"]+"|[а-яё]+):\s*"(?:sum|graph|glossary|theses|name|history|origin|practical|dialogue|evolution|critique)"/g) ?? [])
      .map(x => x.replace(/\s+/g, " ").replace(/^"|"(?=:)/g, "")).sort().join("|");
  if (dict(is43) !== dict(cf43) || !dict(is43))
    errs.push("4z: дрейф TITLE_TO_KEY/KW серверной копии titleToKey ↔ concept-file.ts");
  // Дрейф genealogy-портов ↔ client/utils/genealogy.ts: литералы санации
  const gy43 = await rdx("../client/src/utils/genealogy.ts");
  for (const lit of ["[безымянная концепция]", "синтез философской концепции",
    "импортированный документ", "итогов[а-яё]+"]) {
    if (is43.includes(lit) !== gy43.includes(lit))
      errs.push(`4z: дрейф литерала генеалогии «${lit}» клиент↔сервер`);
  }
  // Адаптация 4: серверный reconstructGenealogy принимает 'synthesis'
  if (!is43.includes("!== \"philosopher\""))
    errs.push("4z: reconstructGenealogy — распознавание концепций по type!=='philosopher' потеряно");
  // Порядок legacy-логов: forceDate-ветка в мапперах
  if (!is43.includes("forceDate") || !is43.includes("genAllDated"))
    errs.push("4z: мапперы логов без правила синтетических дат (порядок legacy-журнала)");
  // Квирк капсулы: сборка из meta.capsuleText обёрткой doc-section
  if (!is43.includes("meta.capsuleText") || !is43.includes("<div class=\"doc-section\">"))
    errs.push("4z: квирк капсулы [21806] потерян");
  // Роут: multipart + IMPORT_INVALID + лимит + монтирование
  const ri43 = await rdx("./routes/import.ts");
  if (!ri43.includes("parseBody") || !ri43.includes("IMPORT_INVALID") ||
      !ri43.includes("MAX_IMPORT_BYTES") || !ri43.includes("requireAuth"))
    errs.push("4z: routes/import — parseBody/IMPORT_INVALID/лимит/requireAuth потеряны");
  if (!(await rdx("./index.ts")).includes("importRoutes"))
    errs.push("4z: importRoutes не смонтирован в index.ts");
  // linkedom-инвариант: parseDocument живёт только в html-parser
  // (проверка по ИМПОРТУ — слово встречается в комментарии шапки)
  if (/from\s+"linkedom"/.test(is43))
    errs.push("4z: linkedom просочился в import-service (инвариант 1.3 — только html-parser)");
  // Клиент: ImportPage без заглушки, api/import — локальный multipart-fetch
  const ip43 = await rdx("../client/src/pages/ImportPage.tsx");
  if (ip43.includes("PageStub") || !ip43.includes("Подтвердить импорт") ||
      !ip43.includes("Зона загрузки файла"))
    errs.push("4z: ImportPage — заглушка 0.4 не заменена или подтверждение/зона потеряны");
  if (/localStorage|sessionStorage/.test(ip43))
    errs.push("4z: browser storage запрещён (ImportPage)");
  const ai43 = await rdx("../client/src/api/import.ts");
  if (!ai43.includes("FormData") || !ai43.includes("credentials"))
    errs.push("4z: api/import — multipart FormData/credentials потеряны");
  // Устаревших меток TODO(4.3) нет
  for (const rel of ["./services/import-service.ts", "./routes/import.ts",
    "../client/src/pages/ImportPage.tsx", "../client/src/api/import.ts"])
    if (/TODO\(4\.3\)/.test(await rdx(rel)))
      errs.push(`4z: устаревшая метка TODO(4.3) в ${rel}`);
}

// ── 4aa (правка 2026-09-02): id из URL — только после проверки uuid ──
// ДЕФЕКТ, найден браузерным тестом 0.4/2: WS-операции брали synthesisId
// из ?resume= / subscribe_generation, то есть прямо из адреса страницы,
// и сравнивали строку с колонкой типа uuid. Произвольный id («/synthesis/
// что-угодно») давал PostgresError «invalid input syntax for type uuid»,
// обработчик валился, и ПОСЛЕ ЭТОГО любой HTTP-запрос отвечал 500 —
// вплоть до /auth/me, отчего клиент считал сессию мёртвой.
// Инвариант: каждая функция ws/handler.ts, принимающая synthesisId,
// обязана вызвать isUuid ДО первого обращения к БД.
{
  const rd4aa = async (rel: string): Promise<string> =>
    (await import("node:fs/promises")).readFile(new URL(rel, import.meta.url), "utf8");
  const ws = await rd4aa("./ws/handler.ts");
  if (!ws.includes('import { isUuid }'))
    errs.push("4aa: ws/handler.ts не импортирует isUuid");
  for (const fn of ["handleResume", "handleSubscribeGeneration"]) {
    const at = ws.indexOf(`async function ${fn}(`);
    if (at < 0) { errs.push(`4aa: не найдена функция ${fn}`); continue; }
    const dbAt = ws.indexOf("await db", at);
    const uuidAt = ws.indexOf("isUuid(synthesisId)", at);
    if (uuidAt < 0 || dbAt < 0 || uuidAt > dbAt)
      errs.push(`4aa: ${fn} обращается к БД до проверки isUuid (500 на кривом id)`);
  }
  // Живая проверка: кривой id не доходит до БД (иначе PostgresError)
  const routes4aa = await import("./routes/syntheses.js");
  const bad = await routes4aa.loadSynthesisForRead(
    "не-uuid-строка",
    "00000000-0000-0000-0000-000000000000",
  );
  if (bad.access !== "notfound")
    errs.push("4aa: loadSynthesisForRead на не-uuid вернул не notfound");
}

// ── 2s (беседа 5.1): модули Element Editor ────────────────────────────
{
  need(await import("./services/element-editor.js"), [
    "ElementEditorError", "updateCategory", "updateCategoryEdge", "deleteCategoryEdge",
    "updateThesis", "updateGlossaryTerm", "autoRenameReferences", "computeElementImpact",
    "rollbackElement", "updateCapsule", "toCategoryDto", "toEdgeDto", "toThesisDto", "toGlossaryDto",
  ], "services/element-editor");
  need(await import("./services/element-versioning.js"), [
    "VersioningError", "createVersion", "getVersionHistory", "rollbackToVersion",
    "loadElementRow", "restoreElementData", "snapshotOf", "isVersionedElementType",
    "VERSIONED_ELEMENT_TYPES",
  ], "services/element-versioning");
  need(await import("./services/element-renderer.js"), [
    "renderCategoriesTable", "renderEdgesTable", "renderTopologyTable", "renderThesesTable",
    "renderGlossaryTable", "applyElementUpdateToHtml", "writeSectionHtml", "locatorsFor",
    "ROLE_LABELS", "THESIS_TYPE_LABELS", "TABLE_SUBSECTIONS", "TABLE_SECTION",
  ], "services/element-renderer");
  need(await import("./utils/html-parser.js"), [
    "locateDocTable", "replaceDocTable", "replaceThesisParagraph",
  ], "utils/html-parser (5.1)");
  need(await import("./services/graph-parser.js"), ["ROLE_MAP"], "services/graph-parser (export 5.1)");
}

// ── 4ab (беседа 5.1): дрейф-контроль parser ↔ renderer + контракты ────
// Пара element-parser/graph-parser (1.4) ↔ element-renderer (5.1) — как
// MODE_UI↔MODE_CONFIG (4x) и graph-style↔graph-utils (4y): форма таблиц
// задана шаблонами Registry, которые правит админ (6.2); расхождение
// парсера и рендерера тихо ломает round-trip. Проверка — без БД, на
// чистых функциях: parse(render(x)) ≡ x по полям.
{
  const er = await import("./services/element-renderer.js");
  const gp = await import("./services/graph-parser.js");
  const ep = await import("./services/element-parser.js");
  const hp = await import("./utils/html-parser.js");
  const rd4ab = async (rel: string): Promise<string> =>
    (await import("node:fs/promises")).readFile(new URL(rel, import.meta.url), "utf8");

  // (а) роли: обратная карта — биекция на ключах ROLE_MAP
  for (const key of new Set(Object.values(gp.ROLE_MAP))) {
    const label = er.ROLE_LABELS[key];
    if (!label || gp.ROLE_MAP[label] !== key)
      errs.push(`4ab: ROLE_LABELS[${key}]=«${label}» не читается ROLE_MAP обратно`);
  }
  // (б) ширина таблиц: базовые/расширенные столбцы ↔ индексы парсера
  if (er.CATEGORY_BASE_HEADERS.length + 1 !== 6 || er.CATEGORY_EXT_HEADERS.length !== 6)
    errs.push("4ab: столбцы категорий ≠ 6 базовых + 6 расширенных (parseGraph td[0..5]/td[6..11])");
  if (er.EDGE_BASE_HEADERS.length !== 6 || er.EDGE_EXT_HEADERS.length !== 5)
    errs.push("4ab: столбцы связей ≠ 6 + 5 (parseGraph td[0..5]/td[6..10])");
  if (er.TOPOLOGY_HEADERS.length !== 5 || er.THESES_HEADERS.length !== 5)
    errs.push("4ab: топология/тезисы ≠ 5 столбцов");
  if (!er.GLOSSARY_BASE_HEADERS[0]?.toLowerCase().includes("термин"))
    errs.push("4ab: первый th глоссария не содержит «термин» — parseGlossaryFromHTML [8027] таблицу не найдёт");
  // (в) шаблоны Registry: порядок столбцов рендерера ≡ строке «Столбцы СТРОГО»
  const tpl = await rd4ab("./config/section-templates.ts");
  const mustHave = [
    "Столбцы СТРОГО: Категория | Тип | Определение | Центральность | Определённость | {{graph_last_col_name}}",
    "| Ист. значимость | Степень инновации | Ясность | Широта | Глубина | Применимость",
    "Столбцы СТРОГО: Источник | Описание связи | Цель | Тип | Направление | Сила",
    "| Определённость связи | Степень инновации | Ист. поддержка | Логическая необходимость | Контекстозависимость",
    "Столбцы СТРОГО: Категория | Кластер | Структурные роли | Процессуальные роли | Рефлексивная связь",
    "Столбцы: № | Формулировка тезиса | Тип (онтол./эпистем./этич.) | Степень новизны | Связанные категории",
    "Столбцы таблицы: Термин | Принятое определение в данной концепции | {{glossary_col}}",
  ];
  for (const m of mustHave) if (!tpl.includes(m)) errs.push(`4ab: в section-templates не найден порядок столбцов «${m.slice(0, 50)}…» — рендерер дрейфует от промпта`);
  const hdrJoin = (a: readonly string[]) => a.join(" | ");
  if (!tpl.includes(hdrJoin(er.CATEGORY_BASE_HEADERS) + " | {{graph_last_col_name}}")) errs.push("4ab: CATEGORY_BASE_HEADERS ≠ шаблон");
  if (!tpl.includes("| " + hdrJoin(er.CATEGORY_EXT_HEADERS))) errs.push("4ab: CATEGORY_EXT_HEADERS ≠ шаблон");
  if (!tpl.includes(hdrJoin(er.EDGE_BASE_HEADERS))) errs.push("4ab: EDGE_BASE_HEADERS ≠ шаблон");
  if (!tpl.includes("| " + hdrJoin(er.EDGE_EXT_HEADERS))) errs.push("4ab: EDGE_EXT_HEADERS ≠ шаблон");
  if (!tpl.includes(hdrJoin(er.TOPOLOGY_HEADERS))) errs.push("4ab: TOPOLOGY_HEADERS ≠ шаблон");
  if (!tpl.includes(hdrJoin(er.THESES_HEADERS))) errs.push("4ab: THESES_HEADERS ≠ шаблон");
  if (!tpl.includes(hdrJoin(er.GLOSSARY_BASE_HEADERS))) errs.push("4ab: GLOSSARY_BASE_HEADERS ≠ шаблон");
  // (г) round-trip на чистых функциях
  const now = new Date();
  const base = { synthesisId: "s", typeCatalogId: null, source: "generated", createdAt: now, updatedAt: now,
    historicalSignificance: 0.4, innovationDegree: 3, clarity: 0.3, breadth: 0.6, depthScore: 0.7, applicability: 0.2 };
  const cats = [
    { ...base, id: "a", name: "Бытие", type: "онтологическая", definition: "То & <есть>", centrality: 0.9, certainty: 0.8, origin: "П", clusterIndices: [0], structuralRoles: ["central"], proceduralRoles: ["thesis"], hasReflexive: true, position: 0 },
    { ...base, id: "b", name: "Становление", type: "метафизическая", definition: "Переход", centrality: 0.7, certainty: 0.6, origin: "Г", clusterIndices: [], structuralRoles: ["bridge"], proceduralRoles: [], hasReflexive: false, position: 1 },
  ] as never[];
  const edges = [{ id: "e", synthesisId: "s", sourceId: "a", targetId: "b", description: "порождает", edgeType: "диалектическая", direction: "однонаправленная", strength: 0.8, certainty: 0.9, historicalSupport: 0.1, logicalNecessity: 0.2, innovationDegree: 4, contextDependency: 0.6, typeCatalogId: null, position: 0, sourceOrigin: "generated", createdAt: now }] as never[];
  const wrap = (n: string, t: string) => `<div data-section="${n}"><h4>${n}</h4>${t}</div>`;
  const html = wrap("Таблица категорий", er.renderCategoriesTable(cats, { extGraphMetrics: true, lastColName: "Происхождение" }))
    + wrap("Таблица связей", er.renderEdgesTable(edges, cats, { extGraphMetrics: true }))
    + wrap("Топология графа", "<p>проза</p>")
    + wrap("Топологическая таблица", er.renderTopologyTable(cats, [{ clusterIndex: 0, label: "Ядро" }]));
  const g = gp.parseGraphFromHTML(html);
  const n0 = g.nodes[0];
  if (g.nodes.length !== 2 || n0?.name !== "Бытие" || n0.def !== "То & <есть>" || n0.cen !== 0.9 || n0.histSig !== 0.4 || n0.innovDeg !== 3 || !n0._extended)
    errs.push(`4ab: round-trip категорий сломан: ${JSON.stringify(n0)}`);
  const e0 = g.edges[0];
  if (g.edges.length !== 1 || e0?.src !== "Бытие" || e0.tgt !== "Становление" || e0.str !== 0.8 || e0.certEdge !== 0.9 || e0.innovDeg !== 4)
    errs.push(`4ab: round-trip связей сломан: ${JSON.stringify(e0)}`);
  if (g.topology.clusterLabels.join() !== "Ядро" || g.topology.roles.structural["Бытие"]?.join() !== "central" || g.topology.roles.procedural["Бытие"]?.join() !== "thesis" || g.topology.roles.structural["Становление"]?.join() !== "bridge" || g.topology.clusters["Становление"])
    errs.push(`4ab: round-trip топологии сломан: ${JSON.stringify(g.topology)}`);
  const th = ep.parseThesesFromHTML(wrap("Сводная таблица тезисов", er.renderThesesTable([
    { id: "t", synthesisId: "s", thesisNum: 2, formulation: "Тезис", justification: "", thesisType: "epistemological", noveltyDegree: "высокая", relatedCategories: ["Бытие", "Становление"], source: "generated", createdAt: now, updatedAt: now },
  ] as never[])));
  if (th.length !== 1 || th[0]?.thesisNum !== 2 || th[0].thesisType !== "epistemological" || th[0].relatedCategories.join() !== "Бытие,Становление")
    errs.push(`4ab: round-trip тезисов сломан: ${JSON.stringify(th[0])}`);
  for (const [k, label] of Object.entries(er.THESIS_TYPE_LABELS)) {
    const one = ep.parseThesesFromHTML(wrap("Сводная таблица тезисов", er.renderThesesTable([
      { id: "t", synthesisId: "s", thesisNum: 1, formulation: "Ф", justification: "", thesisType: k, noveltyDegree: "", relatedCategories: [], source: "generated", createdAt: now, updatedAt: now },
    ] as never[])));
    if (one[0]?.thesisType !== k) errs.push(`4ab: метка «${label}» не читается парсером как ${k}`);
  }
  const gl = ep.parseGlossaryFromHTML(wrap("Таблица определений", er.renderGlossaryTable([
    { id: "g", synthesisId: "s", term: "Бытие", definition: "Опр.", extraColumns: { "Столбец А": "а", "Столбец Б": "б" }, termCategory: "", source: "generated", position: 0, createdAt: now, updatedAt: now },
  ] as never[])));
  if (gl.length !== 1 || gl[0]?.term !== "Бытие" || JSON.stringify(gl[0].extraColumns) !== JSON.stringify({ "Столбец А": "а", "Столбец Б": "б" }))
    errs.push(`4ab: round-trip глоссария сломан: ${JSON.stringify(gl[0])}`);
  // (д) replaceDocTable сохраняет всё вне таблицы
  const rep = hp.replaceDocTable(wrap("Таблица связей", "<p>до</p><table class=\"doc-table\"><tbody><tr><td>x</td></tr></tbody></table><p>после</p>"), [{ subsection: "Таблица связей" }], "<table class=\"doc-table\"></table>", "Таблица связей");
  if (rep.outcome !== "replaced" || !rep.html.includes("<p>до</p><table class=\"doc-table\"></table><p>после</p>"))
    errs.push("4ab: replaceDocTable не сохраняет прозу вокруг таблицы");
  // (е) текстовые контракты
  const editor = await rd4ab("./services/element-editor.ts");
  const routes = await rd4ab("./routes/elements.ts");
  const renderer = await rd4ab("./services/element-renderer.ts");
  const versioning = await rd4ab("./services/element-versioning.ts");
  if (!/computeElementImpact\("category", row\.id, synthesisId, \[\s*before\.name,\s*row\.name,\s*\]\)/.test(editor))
    errs.push("4ab: impact категории считается без ПРЕЖНЕГО имени (ссылки на старое имя — то, что ломает правка)");
  if (!editor.includes("formulation, justification, updatedAt") || !editor.includes(".set({ term, definition, extraColumns: extra"))
    errs.push("4ab: autoRenameReferences не переписывает текстовые поля гранулярных строк (рассинхрон БД↔HTML)");
  if (!editor.includes("recomputeReflexive(synthesisId, [row.sourceId, row.targetId], tx)"))
    errs.push("4ab: смена направления связи не пересчитывает has_reflexive");
  if (!editor.includes('sync.pending.push("thesis.justification")') || !editor.includes('sync.pending.push("glossary_term.termCategory")'))
    errs.push("4ab: поля вне таблиц теряются молча (нет htmlSync.pending) — 02 §3 п.4");
  if (/from "\.\/generation-service\.js"/.test(await rd4ab("./services/cascade-analyzer.ts")))
    errs.push("4ab: cascade-analyzer статически импортирует generation-service (цикл 2.1)");
  if (renderer.includes("spliceSubsectionHtml(")) errs.push("4ab: рендерер зовёт spliceSubsectionHtml — заменил бы весь подраздел вместе с h4/прозой");
  if (!renderer.includes("import { parseHTML }") && renderer.includes("linkedom")) errs.push("4ab: linkedom вне html-parser");
  if (!versioning.includes("coalesce(max(") || !versioning.includes('"rollback"')) errs.push("4ab: versioning без автоинкремента/rollback");
  for (const ep2 of [
    'elementsRoutes.patch("/:id/categories/:catId"', 'elementsRoutes.patch("/:id/edges/:edgeId"',
    'elementsRoutes.delete("/:id/edges/:edgeId"', 'elementsRoutes.get("/:id/theses"', 'elementsRoutes.patch("/:id/theses/:thesisId"',
    'elementsRoutes.get("/:id/glossary"', 'elementsRoutes.patch("/:id/glossary/:termId"',
    '"/:id/elements/:elementType/:elementId/versions"', '"/:id/elements/:elementType/:elementId/rollback"',
    'elementsRoutes.post("/:id/elements/auto-rename"', 'elementsRoutes.patch("/:id/capsule"',
  ]) if (!routes.includes(ep2)) errs.push(`4ab: в routes/elements.ts нет ${ep2}`);
  // Гейт правки: не-UUID → 404 ДО БД, владелец, генерация → 409
  const gateAt = routes.indexOf("async function ownerEditGate(");
  if (gateAt < 0 || routes.indexOf("isUuid(id)", gateAt) > routes.indexOf("await db", gateAt))
    errs.push("4ab: ownerEditGate обращается к БД до isUuid (правило 4aa)");
  if (!routes.includes('"GENERATION_IN_PROGRESS" },\n      409')) errs.push("4ab: правки не гейтятся активной генерацией (гонка с saveGraphToDb)");
  const idx = await rd4ab("./index.ts");
  if (!idx.includes("elementsRoutes); // беседы 1.6 (GET) + 5.1")) errs.push("4ab: монтирование elementsRoutes не помечено 5.1");
  // shared: типы входов PATCH
  const sharedEl = await rd4ab("../packages/shared/types/elements.ts");
  for (const t of ["CategoryUpdateInput", "EdgeUpdateInput", "ThesisUpdateInput", "GlossaryTermUpdateInput", "HtmlSyncInfo", "AutoRenameResult"])
    if (!sharedEl.includes(`export interface ${t}`)) errs.push(`4ab: shared/types/elements без ${t}`);
  // Устаревших меток нет
  for (const rel of ["./services/element-editor.ts", "./services/element-renderer.ts", "./services/element-versioning.ts", "./routes/elements.ts"])
    if ((await rd4ab(rel)).includes("TODO(5.1)")) errs.push(`4ab: устаревшая метка TODO(5.1) в ${rel}`);
}

// Единый финальный гейт (перенесён из-за дефекта 2.1 — см. выше)
// ── 4ac (беседа 5.2): Element Editor UI (клиент) + isOwner ─────────────
// Новая функциональность (в исходнике нет). Контракты, которые тихо
// ломаются при правках соседей: ✎ в таблицах — В СТРОКЕ HTML (грабля
// 1.6b), «Перегенерировать затронутые» только через планы (второго пути
// запуска перегенерации нет), htmlSync.pending/sectionMissing показаны
// (долг §12 5.1 → 5.2), редактор поверх графа выше .gm-overlay, гейты
// по SynthesisFull.isOwner («По факту 5.2»), CSS блоков 5/7 кита в
// части 3 globals.css.
{
  const cm = clientModule;
  const fsm = await import("node:fs/promises");
  const rd = (rel: string) => fsm.readFile(new URL(rel, import.meta.url), "utf8");
  need(await cm("../client/src/api/elements.ts"), [
    "getCategories", "getCategory", "getTheses", "getGlossary",
    "updateCategory", "updateEdge", "deleteEdge", "updateThesis", "updateGlossaryTerm",
    "updateCapsule", "getVersionHistory", "rollbackToVersion", "autoRename",
  ], "client/api/elements (5.2)");
  need(await cm("../client/src/components/edit/ElementEditor.tsx"),
    ["ElementEditor", "FieldError", "fmtNum", "HOST_SECTION"], "client/edit/ElementEditor");
  need(await cm("../client/src/components/edit/CategoryEditor.tsx"),
    ["CategoryEditor", "categoryToDraft", "categoryDiff", "CATEGORY_DRAFT_CHARACTERISTICS"], "client/edit/CategoryEditor");
  need(await cm("../client/src/components/edit/ThesisEditor.tsx"),
    ["ThesisEditor", "thesisToDraft", "thesisDiff", "THESIS_TYPE_OPTIONS"], "client/edit/ThesisEditor");
  need(await cm("../client/src/components/edit/GlossaryTermEditor.tsx"),
    ["GlossaryTermEditor", "glossaryToDraft", "glossaryDiff"], "client/edit/GlossaryTermEditor");
  need(await cm("../client/src/components/edit/VersionHistory.tsx"),
    ["VersionHistory", "diffSnapshots", "versionPreview"], "client/edit/VersionHistory");
  need(await cm("../client/src/components/document/SectionView.tsx"),
    ["addInlineEditButtons"], "client/document/SectionView (5.2)");

  // (а) THESIS_TYPE_OPTIONS ≡ THESIS_TYPE_LABELS рендерера (дрейф-контроль меток)
  const te = await cm("../client/src/components/edit/ThesisEditor.tsx") as { THESIS_TYPE_OPTIONS: { value: string; label: string }[] };
  const er4ac = await import("./services/element-renderer.js");
  for (const o of te.THESIS_TYPE_OPTIONS)
    if (er4ac.THESIS_TYPE_LABELS[o.value] !== o.label)
      errs.push(`4ac: метка типа тезиса «${o.value}» в ThesisEditor («${o.label}») ≠ element-renderer («${er4ac.THESIS_TYPE_LABELS[o.value]}»)`);
  // (б) HOST_SECTION ≡ TABLE_SECTION рендерера
  const ee4ac = await cm("../client/src/components/edit/ElementEditor.tsx") as { HOST_SECTION: Record<string, string> };
  const ts4ac = er4ac.TABLE_SECTION as Record<string, string>;
  for (const [k, sec] of Object.entries({ category: ts4ac.categories, thesis: ts4ac.theses, glossary_term: ts4ac.glossary }))
    if (ee4ac.HOST_SECTION[k] !== sec) errs.push(`4ac: HOST_SECTION.${k}=${ee4ac.HOST_SECTION[k]} ≠ TABLE_SECTION (${sec})`);
  // (в) CATEGORY_TYPES ⊆ section-templates — СНЯТО беседой 5.4: временная
  //     константа удалена, select заменён TaxonomySelector по каталогу
  //     0.3b (долг §12 закрыт); проверка каталога — секция 4ae (5.4)
  if ("CATEGORY_TYPES" in (await cm("../client/src/components/edit/CategoryEditor.tsx") as object))
    errs.push("4ac: CATEGORY_TYPES вернулась в CategoryEditor — тип выбирается TaxonomySelector'ом (5.4)");

  // (г) текстовые контракты
  const sv = await rd("../client/src/components/document/SectionView.tsx");
  if (!sv.includes("addInlineEditButtons(doc, root)") || sv.includes("useEffect"))
    errs.push("4ac: кнопки ✎ обязаны добавляться в HTML-СТРОКУ (addInlineEditButtons внутри enrichSectionHtml), не эффектом");
  const el = await rd("../client/src/components/edit/ElementEditor.tsx");
  if (/regenerateSection|\/regenerate\//.test(el) || /import .*api\/generation/.test(el))
    errs.push("4ac: ElementEditor запускает перегенерацию напрямую — только через планы (onRegenerateAffected → EditModal)");
  if (!el.includes("onRegenerateAffected") || !el.includes("htmlSync.pending") && !el.includes("sync.pending"))
    errs.push("4ac: ElementEditor без onRegenerateAffected или без показа htmlSync.pending");
  if (!el.includes("html-sync-pending") || !el.includes("html-sync-missing"))
    errs.push("4ac: предупреждения pending/sectionMissing (data-testid html-sync-*) отсутствуют");
  const em = await rd("../client/src/components/edit/EditModal.tsx");
  if (!em.includes("initialRegen")) errs.push("4ac: EditModal без initialRegen (предотметка разделов из редактора)");
  const sp = await rd("../client/src/pages/SynthesisPage.tsx");
  if (!sp.includes("synthesis?.isOwner") || !/editable=\{isOwner && !live\}/.test(sp))
    errs.push("4ac: SynthesisPage не гейтит редактор по SynthesisFull.isOwner");
  if (!/\{isOwner && \(\s*<button[^]*?✎ Изменить/.test(sp)) errs.push("4ac: «✎ Изменить» не под isOwner");
  const gm = await rd("../client/src/components/graph/GraphModal.tsx");
  if (!gm.includes("element-editor-overlay") || !gm.includes('variant="modal"'))
    errs.push("4ac: GraphModal без модального ElementEditor поверх графа");
  const gu = await rd("../client/src/components/graph/graph-utils.ts");
  if (!gu.includes("dbId: c.id")) errs.push("4ac: buildGFromGraphData не заполняет GNode.dbId (кнопка ✎ NodePanel не найдёт категорию)");
  const sr = await rd("./routes/syntheses.ts");
  if (!sr.includes("isOwner: row.userId === viewerUserId")) errs.push("4ac: SynthesisFull без isOwner (routes/syntheses)");
  const ty = await rd("../packages/shared/types/synthesis.ts");
  if (!ty.includes("isOwner: boolean")) errs.push("4ac: shared SynthesisFull без isOwner");
  const css = await rd("../client/src/globals.css");
  for (const sel of [".version-item.current", ".diff-line.del::before", ".inline-edit-btn", ".inline-edit-dirty", ".doc-table td.inline-edit-cell", ".edit-overlay.element-editor-overlay", ".gm-panel-edit-btn"])
    if (!css.includes(sel)) errs.push(`4ac: в globals.css нет правила ${sel}`);
  for (const rel of ["../client/src/components/edit/ElementEditor.tsx", "../client/src/components/edit/VersionHistory.tsx", "../client/src/api/elements.ts"]) {
    if (/localStorage|sessionStorage/.test(await rd(rel))) errs.push(`4ac: browser storage запрещён (${rel})`);
    if (/TODO\(5\.2\)/.test(await rd(rel))) errs.push(`4ac: устаревшая метка TODO(5.2) в ${rel}`);
  }
}

// ── 4ad (беседа 5.3): Enrichment Service — контракты + дрейф шаблонов ↔ переменных ──
// Шаблоны enrichment.* правит админ (6.2), переменные собирает сервис —
// расхождение тихо ронит strict-рендер prompt-registry: пара сторожится
// как parser↔renderer (4ab). Плюс канон ключей 03 §2.14, диапазоны п.18,
// маршруты §2.13/§2.14, start_enrichment в ws/handler, no bumpTotals.
{
  const fsm = await import("node:fs/promises");
  const rd = (rel: string) => fsm.readFile(new URL(rel, import.meta.url), "utf8");
  const en = await import("./services/element-enrichment.js");
  const et = await import("./config/enrichment-templates.js");
  const ch = await import("@philosynth/shared/constants/characteristics");
  const pt = await import("./config/prompt-templates.js");
  const st = await import("./config/section-templates.js");

  // (а) канон ключей — ровно шесть, уникальны среди сидов 0.3/1.2
  const CANON = [
    "enrichment.category.description", "enrichment.category.evolution", "enrichment.category.justification",
    "enrichment.edge.justification", "enrichment.edge.counterarguments", "enrichment.characteristic_justification",
  ];
  const keys = et.SEED_ENRICHMENT_TEMPLATES.map((t) => t.key).sort();
  if (keys.join() !== [...CANON].sort().join()) errs.push(`4ad: ключи enrichment.* ≠ канону 03 §2.14: ${keys.join(",")}`);
  const others = new Set([...pt.SEED_PROMPT_TEMPLATES, ...st.SEED_SECTION_TEMPLATES].map((t) => t.key));
  for (const k of keys) if (others.has(k)) errs.push(`4ad: ключ ${k} дублирует сид 0.3/1.2`);
  for (const t of en.CATEGORY_ENRICHMENT_TYPES) if (!CANON.includes(en.enrichmentPromptKey("category", t))) errs.push(`4ad: enrichmentPromptKey(category,${t}) вне канона`);
  for (const t of en.EDGE_ENRICHMENT_TYPES) if (!CANON.includes(en.enrichmentPromptKey("edge", t))) errs.push(`4ad: enrichmentPromptKey(edge,${t}) вне канона`);
  if (!CANON.includes(en.CHARACTERISTIC_PROMPT_KEY)) errs.push("4ad: CHARACTERISTIC_PROMPT_KEY вне канона");

  // (б) ДРЕЙФ: плейсхолдеры каждого шаблона ≡ ключам переменных сервиса
  const RE = /\{\{\s*([\w.-]+)\s*\}\}/g;
  const now = new Date();
  const cat = {
    id: "c", synthesisId: "s", name: "Бытие", type: "онтологическая", definition: "d", centrality: 0.9, certainty: 0.5,
    historicalSignificance: 0.5, innovationDegree: 1, clarity: 0, breadth: 0, depthScore: 0, applicability: 0,
    typeCatalogId: null, origin: "", clusterIndices: [], structuralRoles: [], proceduralRoles: [], hasReflexive: false,
    position: 0, source: "generated", createdAt: now, updatedAt: now,
  } as unknown as Parameters<typeof en.buildCategoryVars>[0];
  const edge = {
    id: "e", synthesisId: "s", sourceId: "c", targetId: "t", description: "", edgeType: "", direction: "однонаправленная",
    strength: 0.5, certainty: 0.5, historicalSupport: 0.5, logicalNecessity: 0.5, innovationDegree: 1, contextDependency: 0.5,
    typeCatalogId: null, position: 0, sourceOrigin: "generated", createdAt: now,
  } as unknown as Parameters<typeof en.buildEdgeVars>[0];
  const ctx = en.buildSynthesisContextText({ title: "t", seed: "s", method: "dialectical", synthLevel: "comparative", context: "" }, []);
  const spec = ch.resolveCharacteristic("category", "centrality")!;
  const varsFor: Record<string, Record<string, string>> = {
    category: en.buildCategoryVars(cat, "—", ctx),
    edge: en.buildEdgeVars(edge, null, null, ctx),
    characteristic: en.buildCharacteristicVars("category", spec, 0.9, 0.9, "l", "s", ctx),
  };
  for (const t of et.SEED_ENRICHMENT_TEMPLATES) {
    const kind = t.key.startsWith("enrichment.category.") ? "category" : t.key.startsWith("enrichment.edge.") ? "edge" : "characteristic";
    const ph = new Set([...t.body.matchAll(RE)].map((m) => m[1] as string));
    const vs = new Set(Object.keys(varsFor[kind]!));
    for (const x of ph) if (!vs.has(x)) errs.push(`4ad: ${t.key}: плейсхолдер {{${x}}} не подаётся сервисом (strict-рендер упадёт)`);
    for (const x of vs) if (!ph.has(x)) errs.push(`4ad: ${t.key}: переменная ${x} сервиса не используется шаблоном`);
  }
  const chT = et.SEED_ENRICHMENT_TEMPLATES.find((t) => t.key === en.CHARACTERISTIC_PROMPT_KEY)!;
  for (const name of Object.values(et.JUSTIFICATION_SECTIONS))
    if (!chT.body.includes(`data-section="${name}"`)) errs.push(`4ad: шаблон обоснования без data-section «${name}» (парсер трёх колонок его не найдёт)`);

  // (в) диапазоны п.18: innovation_degree целое [1,5], остальное REAL [0,1]; 8/6 характеристик
  if (ch.CATEGORY_CHARACTERISTICS.length !== 8 || ch.EDGE_CHARACTERISTICS.length !== 6) errs.push("4ad: не 8/6 характеристик");
  for (const sp of [...ch.CATEGORY_CHARACTERISTICS, ...ch.EDGE_CHARACTERISTICS]) {
    const okRange = sp.key === "innovation_degree" ? sp.integer && sp.min === 1 && sp.max === 5 : !sp.integer && sp.min === 0 && sp.max === 1;
    if (!okRange) errs.push(`4ad: диапазон ${sp.key} ≠ п.18`);
  }
  // dtoField обязан быть колонкой DTO Category/CategoryEdge (иначе current_value всегда «—»)
  const catDtoFields = new Set(Object.keys(cat as object));
  const edgeDtoFields = new Set(Object.keys(edge as object));
  for (const sp of ch.CATEGORY_CHARACTERISTICS) if (!catDtoFields.has(sp.dtoField)) errs.push(`4ad: dtoField ${sp.dtoField} нет у строки categories`);
  for (const sp of ch.EDGE_CHARACTERISTICS) if (!edgeDtoFields.has(sp.dtoField)) errs.push(`4ad: dtoField ${sp.dtoField} нет у строки category_edges`);
  if (ch.resolveCharacteristic("category", "depth")?.key !== "depth_score") errs.push("4ad: алиас depth → depth_score (07 5.3 п.18) не работает");

  // (г) маршруты §2.14 / §2.13, монтирование, WS
  const { enrichmentRoutes: er } = await import("./routes/enrichment.js");
  const { taxonomyRoutes: tr } = await import("./routes/taxonomy.js");
  const routeSet = (app: { routes: { method: string; path: string }[] }) =>
    new Set(app.routes.filter((r) => r.method !== "ALL").map((r) => `${r.method} ${r.path}`));
  for (const r of ["POST /:id/enrich/category/:catId", "POST /:id/enrich/edge/:edgeId", "POST /:id/justify-characteristic", "GET /:id/enrichments/:elementId", "GET /:id/justifications/:elementId"])
    if (!routeSet(er).has(r)) errs.push(`4ad: routes/enrichment без ${r}`);
  for (const r of ["GET /category-types", "POST /category-types", "GET /relationship-types", "POST /relationship-types", "POST /normalize"])
    if (!routeSet(tr).has(r)) errs.push(`4ad: routes/taxonomy без ${r}`);
  const idx = await rd("./index.ts");
  if (!idx.includes('app.route("/api/v1/syntheses", enrichmentRoutes)')) errs.push("4ad: enrichmentRoutes не смонтирован");
  if (!idx.includes('app.route("/api/v1/taxonomy", taxonomyRoutes)')) errs.push("4ad: taxonomyRoutes не смонтирован на /api/v1/taxonomy");
  const ws = await rd("./ws/handler.ts");
  if (!ws.includes('"start_enrichment",') || !ws.includes('case "start_enrichment":')) errs.push("4ad: ws/handler без start_enrichment");
  if (!/row\.userId !== user\.id/.test(ws.slice(ws.indexOf('case "start_enrichment"')))) errs.push("4ad: start_enrichment без проверки владельца");

  // (д) текстовые контракты сервиса
  const svc = await rd("./services/element-enrichment.ts");
  if (/bumpTotals\(/.test(svc)) errs.push("4ad: сервис зовёт bumpTotals — стоимость обогащений не входит в total_cost_usd (01 §4.9)");
  if (!/withGenerationSlot\(/.test(svc)) errs.push("4ad: обогащения не под generation-слотом (идемпотентность п.5 03 §3.1)");
  if (!/setUsageRecorder/.test(svc)) errs.push("4ad: нет разъёма setUsageRecorder (07 5.3 п.2b, долг §12 → 6.1)");
  if (!/outputMode: "mode"/.test(svc)) errs.push("4ad: SYS обогащений не buildSYS(outputMode mode)");
  if (/from "linkedom"/.test(svc)) errs.push("4ad: linkedom вне html-parser");
  const wsT = await rd("../packages/shared/types/ws-messages.ts");
  const doneBlock = wsT.slice(wsT.indexOf("export interface WsEnrichmentDone"));
  if (!/enrichmentId: string/.test(doneBlock.slice(0, doneBlock.indexOf("}"))) || !/content: string/.test(doneBlock.slice(0, doneBlock.indexOf("}"))))
    errs.push("4ad: WsEnrichmentDone без enrichmentId/content");
  if (!/export interface WsStartEnrichment/.test(wsT)) errs.push("4ad: shared без WsStartEnrichment");
  const seed = await rd("../scripts/seed-prompts.ts");
  if (!seed.includes("...SEED_ENRICHMENT_TEMPLATES")) errs.push("4ad: seed-prompts не сеет SEED_ENRICHMENT_TEMPLATES");
  for (const rel of ["./services/element-enrichment.ts", "./routes/enrichment.ts", "./routes/taxonomy.ts"])
    if (/TODO\(5\.3\)/.test(await rd(rel))) errs.push(`4ad: устаревшая метка TODO(5.3) в ${rel}`);
}

// ── 2u/4ae (беседа 5.4): Характеристики + Обогащение + Таксономия UI (клиент) ──
// Всё — новый код (карты 04 у 5.4 нет); проверяется дрейф клиент ↔ сервер:
// пути api/* ↔ роуты, типы обогащения панели ↔ канон шаблонов 5.3,
// слайдеры ↔ shared/constants/characteristics, guard enrich: в хуке
// генерации, снятие CATEGORY_TYPES, интеграция графа (GEdge.dbId,
// EdgePanel.onEdit, NodePanel.edit), CSS блоков 1/2/8 кита в части 3.
{
  const cm = clientModule;
  const fsm = await import("node:fs/promises");
  const rd = (rel: string) => fsm.readFile(new URL(rel, import.meta.url), "utf8");
  // (а) 2u — модули и экспорты
  const tax = await cm("../client/src/api/taxonomy.ts") as Record<string, unknown>;
  need(tax, ["getCategoryTypes", "getRelationshipTypes", "getCatalog", "invalidateTaxonomyCache", "normalizeType", "createCustomType"], "client/api/taxonomy (5.4)");
  const enr = await cm("../client/src/api/enrichment.ts") as Record<string, unknown>;
  need(enr, ["enrichCategory", "enrichEdge", "justifyCharacteristic", "getEnrichments", "getJustifications"], "client/api/enrichment (5.4)");
  need(await cm("../client/src/hooks/useEnrichmentStream.ts"), ["useEnrichmentStream", "messageOfEnrichmentError"], "client/hooks/useEnrichmentStream");
  const cs = await cm("../client/src/components/edit/CharacteristicSlider.tsx") as Record<string, unknown>;
  need(cs, ["CharacteristicSlider", "CharacteristicSliderGroup", "characteristicStep", "formatCharacteristic", "REAL_STEP"], "client/edit/CharacteristicSlider");
  const ep = await cm("../client/src/components/edit/EnrichmentPanel.tsx") as Record<string, unknown>;
  need(ep, ["EnrichmentPanel", "CATEGORY_ENRICHMENT_OPTIONS", "EDGE_ENRICHMENT_OPTIONS", "ENRICHMENT_TYPE_LABELS"], "client/edit/EnrichmentPanel");
  const ts = await cm("../client/src/components/edit/TaxonomySelector.tsx") as Record<string, unknown>;
  need(ts, ["TaxonomySelector", "typeTextFromCatalog", "suggestTypeKey"], "client/edit/TaxonomySelector");
  const ede = await cm("../client/src/components/edit/EdgeEditor.tsx") as Record<string, unknown>;
  need(ede, ["EdgeEditor", "edgeToDraft", "edgeDiff", "EDGE_DIRECTIONS"], "client/edit/EdgeEditor");
  const ee = await cm("../client/src/components/edit/ElementEditor.tsx") as { HOST_SECTION: Record<string, string> };
  if (ee.HOST_SECTION.edge !== "graph") errs.push("4ae: HOST_SECTION.edge ≠ graph (EdgeEditor 5.4)");

  // (б) ДРЕЙФ: типы обогащения панели ≡ канон шаблонов 5.3 / сервиса
  const en54 = await import("./services/element-enrichment.js");
  const panelCat = (ep.CATEGORY_ENRICHMENT_OPTIONS as { type: string }[]).map((o) => o.type).sort().join();
  const panelEdge = (ep.EDGE_ENRICHMENT_OPTIONS as { type: string }[]).map((o) => o.type).sort().join();
  if (panelCat !== [...en54.CATEGORY_ENRICHMENT_TYPES].sort().join()) errs.push(`4ae: типы обогащения категории панели (${panelCat}) ≠ сервису`);
  if (panelEdge !== [...en54.EDGE_ENRICHMENT_TYPES].sort().join()) errs.push(`4ae: типы обогащения связи панели (${panelEdge}) ≠ сервису`);
  const labels = ep.ENRICHMENT_TYPE_LABELS as Record<string, string>;
  for (const t of [...en54.CATEGORY_ENRICHMENT_TYPES, ...en54.EDGE_ENRICHMENT_TYPES, "characteristic"]) if (!labels[t]) errs.push(`4ae: нет подписи типа обогащения «${t}»`);

  // (в) ДРЕЙФ: слайдеры ↔ характеристики (шаг, направления, черновики)
  const ch = await import("@philosynth/shared/constants/characteristics");
  const step = cs.characteristicStep as (s: { integer: boolean }) => number;
  for (const sp of [...ch.CATEGORY_CHARACTERISTICS, ...ch.EDGE_CHARACTERISTICS])
    if (step(sp) !== (sp.integer ? 1 : (cs.REAL_STEP as number))) errs.push(`4ae: шаг слайдера ${sp.key} не по спеке`);
  const ce54 = await cm("../client/src/components/edit/CategoryEditor.tsx") as { CATEGORY_DRAFT_CHARACTERISTICS: readonly string[] };
  const draftFields = [...ce54.CATEGORY_DRAFT_CHARACTERISTICS].sort().join();
  if (draftFields !== ch.CATEGORY_CHARACTERISTICS.map((s) => s.dtoField).sort().join()) errs.push("4ae: черновик CategoryEditor не покрывает все dtoField характеристик");
  const { RELATIONSHIP_DIRECTIONS: dirs } = await import("./services/element-taxonomy.js");
  const edeDirs = ede.EDGE_DIRECTIONS as readonly string[];
  const edgeSrc = await rd("../client/src/components/edit/EdgeEditor.tsx");
  if (edeDirs.length !== 3 || !edeDirs.includes("однонаправленная") || !edeDirs.includes("двунаправленная") || !edeDirs.includes("рефлексивная")) errs.push("4ae: EDGE_DIRECTIONS ≠ трём значениям схемы");
  if (dirs.length !== 3) errs.push("4ae: RELATIONSHIP_DIRECTIONS сервиса ≠ 3 (проверка направлений формы нового типа)");
  const taxSrc = await rd("../client/src/components/edit/TaxonomySelector.tsx");
  for (const d of dirs) if (!taxSrc.includes(`${d}:`)) errs.push(`4ae: TaxonomySelector без подписи направления «${d}»`);
  if (!/edgeType: v\.type, typeCatalogId: v\.typeCatalogId/.test(edgeSrc)) errs.push("4ae: EdgeEditor не пишет пару edgeType+typeCatalogId из селектора (03 §2.4 п.11)");

  // (г) пути api/* ≡ роутам сервера (перехват fetch)
  const origFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${String(url)}`);
    return new Response(JSON.stringify({ ok: true, enrichments: [], justifications: [], types: [], match: null, suggestions: [], type: { id: "t", key: "k", nameRu: "N" } }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    await (enr.enrichCategory as (...a: unknown[]) => Promise<unknown>)("S", "C", "description");
    await (enr.enrichEdge as (...a: unknown[]) => Promise<unknown>)("S", "E", "justification");
    await (enr.justifyCharacteristic as (...a: unknown[]) => Promise<unknown>)("S", { elementId: "C", elementType: "category", characteristic: "centrality", value: 0.5 });
    await (enr.getEnrichments as (...a: unknown[]) => Promise<unknown>)("S", "C", "category");
    await (enr.getJustifications as (...a: unknown[]) => Promise<unknown>)("S", "C");
    (tax.invalidateTaxonomyCache as () => void)();
    await (tax.getCategoryTypes as () => Promise<unknown>)();
    await (tax.getRelationshipTypes as () => Promise<unknown>)();
    await (tax.normalizeType as (...a: unknown[]) => Promise<unknown>)("x", "category");
    await (tax.createCustomType as (...a: unknown[]) => Promise<unknown>)("category", { key: "k", nameRu: "N" });
  } finally { globalThis.fetch = origFetch; }
  const want = [
    "POST /api/v1/syntheses/S/enrich/category/C", "POST /api/v1/syntheses/S/enrich/edge/E", "POST /api/v1/syntheses/S/justify-characteristic",
    "GET /api/v1/syntheses/S/enrichments/C?elementType=category", "GET /api/v1/syntheses/S/justifications/C",
    "GET /api/v1/taxonomy/category-types", "GET /api/v1/taxonomy/relationship-types", "POST /api/v1/taxonomy/normalize", "POST /api/v1/taxonomy/category-types",
  ];
  for (const w of want) if (!calls.includes(w)) errs.push(`4ae: api-клиент 5.4 не шлёт ${w} (есть: ${calls.join(" | ")})`);

  // (д) текстовые контракты клиента
  const usg = await rd("../client/src/hooks/useStreamingGeneration.ts");
  if (!/startsWith\("enrich:"\)/.test(usg)) errs.push("4ae: useStreamingGeneration без guard enrich: (обрыв обогащения станет ошибкой генерации)");
  const hook = await rd("../client/src/hooks/useEnrichmentStream.ts");
  for (const m of ["enrichment_delta", "enrichment_done", "stream_error"]) if (!hook.includes(`case "${m}"`)) errs.push(`4ae: useEnrichmentStream не разбирает ${m}`);
  if (/start_enrichment/.test(hook.replace(/\/\*[\s\S]*?\*\//g, ""))) errs.push("4ae: useEnrichmentStream шлёт start_enrichment — решение 5.4 «только HTTP»");
  const ceSrc = await rd("../client/src/components/edit/CategoryEditor.tsx");
  if (/export const CATEGORY_TYPES/.test(ceSrc) || !ceSrc.includes("TaxonomySelector") || !ceSrc.includes("CharacteristicSliderGroup")) errs.push("4ae: CategoryEditor без TaxonomySelector/CharacteristicSliderGroup или с CATEGORY_TYPES");
  const gu = await rd("../client/src/components/graph/graph-utils.ts");
  if (!/dbId\?: string;/.test(gu.slice(gu.indexOf("export interface GEdge"))) || !gu.includes("dbId: e.id,")) errs.push("4ae: GEdge без dbId (правка связи из EdgePanel)");
  const epn = await rd("../client/src/components/graph/EdgePanel.tsx");
  if (!/onEdit\?: \(\(\) => void\) \| undefined/.test(epn)) errs.push("4ae: EdgePanel без onEdit");
  const np = await rd("../client/src/components/graph/NodePanel.tsx");
  if (!/export interface NodePanelEdit/.test(np) || !np.includes("CharacteristicSliderGroup") || !np.includes("<EnrichmentPanel") || !np.includes("<TaxonomySelector")) errs.push("4ae: NodePanel без блока правки по месту (слайдеры/обогащение/тип)");
  if (!/onCommit=\{/.test(np)) errs.push("4ae: NodePanel не шлёт PATCH по отпусканию (onCommit)");
  const gm = await rd("../client/src/components/graph/GraphModal.tsx");
  if (!gm.includes("useEnrichmentStream(") || !gm.includes('kind: "edge"') || !/\(editable \|\| editDisabled\) && synthesisId && panelCategory/.test(gm)) errs.push("4ae: GraphModal без канала обогащений / редактора связи / readOnly-блока");
  const sp = await rd("../client/src/pages/SynthesisPage.tsx");
  if (!sp.includes("editDisabled={isOwner && live}")) errs.push("4ae: SynthesisPage: editDisabled не сужен до владельца (readOnly-блок панели узла)");
  const css = await rd("../client/src/globals.css");
  for (const sel of [".char-slider {", ".char-slider.discrete", ".char-slider.readonly", ".char-justification {", ".combobox-list {", ".combobox-item.create", ".type-origin.catalog", ".enrich-card.streaming", "@keyframes enrich-caret", ".gm-info-panel .char-slider {", ".combobox-create-form {"])
    if (!css.includes(sel)) errs.push(`4ae: globals.css без правила ${sel} (кит блоки 1/2/8 + дополнения 5.4)`);
  const kit = await rd("../docs/fragments-for-conversations/5-6-ui-kit.css");
  for (const rule of [".char-slider-why {", ".combobox-item-code {", ".enrich-card-type {"]) {
    const i = kit.indexOf(rule); const j = kit.indexOf("}", i);
    if (i < 0) { errs.push(`4ae: в ките нет ${rule}`); continue; }
    const body = kit.slice(i, j + 1).replace(/\s+/g, " ");
    if (!css.replace(/\s+/g, " ").includes(body)) errs.push(`4ae: правило кита ${rule} перенесено в globals.css не дословно`);
  }
  for (const rel of ["../client/src/components/edit/CharacteristicSlider.tsx", "../client/src/components/edit/EnrichmentPanel.tsx", "../client/src/components/edit/TaxonomySelector.tsx", "../client/src/components/edit/EdgeEditor.tsx", "../client/src/hooks/useEnrichmentStream.ts", "../client/src/api/taxonomy.ts", "../client/src/api/enrichment.ts"]) {
    const t = await rd(rel);
    if (/localStorage|sessionStorage/.test(t)) errs.push(`4ae: browser storage в ${rel}`);
    if (/TODO\(5\.4\)/.test(t)) errs.push(`4ae: устаревшая метка TODO(5.4) в ${rel}`);
  }
}

if (errs.length) { console.error("ПРОБЛЕМЫ:\n" + errs.map(e => " - " + e).join("\n")); process.exit(1); }

console.log("INTEGRATION OK: 11 value-модулей shared, 4 server-модуля 0.1 + 7 модулей 0.2 (auth/admin-only/routes/rate-limiter/ws×2/redis) + 13 модулей 0.3 (prompt-registry + 12 config) + 1 модуль 0.3b (element-taxonomy) + 5 модулей 1.1 (deep-merge/topo-sort/synthesis-engine/compat-advisor/cost-estimator, реэкспорты тождественны) + 4 модуля 1.2 (prompt-builder/section-defs-builder + section-templates 146 шт./subsection-map; SEC_NAMES≡KEY_LABELS, реэкспорты кардинальности тождественны) + 17 клиент-модулей 0.4+0.6 (api/store/useWebSocket/App/layout×3/pages×10), 11 файлов типов, 4+5+4+6 кросс-слойных совместимостей + 4e (AuthUser client↔server, ApiErrorCode⊇§4.3+серверные коды, маршруты App↔Sidebar↔протокол, BASE_URL↔монтирование, эндпоинты store↔routes) + 4h 1.1 (async-сигнатуры engine/advisor/estimator, перенос applyBudgetPressure в context-builder (1.3), константы [7539] и топо-таблицы [6505/6520] дословно) + 4j/5j 1.3 (async-сигнатуры context-builder/extractor/parent-context, CtxLogDraft⊇context_log, пол 40% и пороги бюджета дословно, DOM-слой изолирован в html-parser, живой конвейер на sections+categories) + 4i 1.2 (async-сигнатуры билдеров, parts/defs структурно совместимы со входами оценщика, стоп-сигнал из Registry без хардкода, разъём провайдера 1.3, тексты разделов только из Registry, посевы += SEED_SECTION_TEMPLATES/subsection_map, extract:sections, баннер генерата), async-цепочки (5e: auth-store против authRoutes через app.request на живой БД — register/login/logout/restore/NETWORK_ERROR (auth-жизненный цикл; registry: getTemplate/render/getConfig/NOT_FOUND/кэш-инвалидация; taxonomy: counts 18/29, normalizeType match/null-кейсы, валидация createCustomType, кэш-инвалидация — всё на живой БД+Redis; 4f/5f 0.5: контракт password-change (requireAuth, eq+ne-инвалидация, транзакция, общая PASSWORD_MIN_LENGTH) + живой цикл смены пароля (отказы без побочных эффектов, старый пароль мёртв, чужая сессия убита, текущая жива; 4g/5g 0.6: контракт профиля (PATCH /me, /profile в App+Header, skipUnauthorizedHandler объявлен и применён) + живой смоук PATCH displayName/пустая→null/101→400; 5h 1.1: живой конвейер resolveContextDeps→buildEffectiveDeps(подстановка)→buildDynamicOrder→getCompatEntryByKey→computeSectionAdvice→estimateCost на посеянных конфигах; 5i 1.1+1.2: сквозной конвейер buildSYS→baseCtxStatic→buildSectionDefs→groupPasses→estimateCost(sysChars/baseStaticChars/passes реальные)→patchPromptsWithSecCtx + stop_signal из Registry); reject после closeDb) + 2i/4k/5k 1.4 (6 модулей streaming-manager/generation-service/graph-parser/element-parser/stream-state/routes-syntheses, реэкспорты stream-state тождественны; контракты: baseUrl из env, ретраи только pre-stream из env, activeRuns.set до await (гонка), цены из cost-estimator, scaffold дословно, _genCommon/common, user-abort без pausedState, linkedom изолирован, POST по SEC_NAMES, resume §3.3; живьём: двойной saveGraphToDb/saveElementsToDb — идемпотентная замена, stream-state круговой по разделу и указателю, предохранители cancelGeneration/assertCanStartGeneration) + 2j/4l/5l 1.4b (pause-resume-service + порты serializeSubsectionRegen/extractPreambleConstraints в section-defs-builder и spliceSubsectionHtml/removeSubsectionHtml в html-parser + клиентский PauseModal (4 рендерера, fmtCost ≡ _fmtCost) + разъёмы generation-service; контракты: порог 250 и userNote «Заверши» дословно, runtime-guard режимов, провайдер estimates регистрируется импортом и питает обе точки generation_paused, метка [возобновление], resume_* диспетчеризованы, linkedom изолирован, 'resume' ∈ source; живьём: createPausedState → paused_state+pause_marker, computePauseEstimates из genParams (whole>0, skip=0, fill>0), RESUME_INVALID/FORBIDDEN, stop-финализация с resume_marker; фикс: closeRedis в teardown — event loop больше не висит) + 4m/5m 1.5 (9 клиент-модулей формы/прогресса: api/syntheses + SynthesisForm/PhilosopherPicker/SectionPicker/CostEstimate/CompatAdvisor/SectionWarnings/GenerationProgress + useStreamingGeneration + CreateSynthesisPage; контракты: /estimate и /advice под requireAuth и без записей в БД, конвейер оценки зеркалит generation-service, NO_PARTICIPANTS_SEED_REQUIRED в коде роута, confirm перед skip, ?resume= и subscribe_generation в хуке, условный keepFullBudget, browser storage запрещён; живьём: estimate cost/in/out>0 passes=3, advice stable ★ + ⚠ evolution, 401 без сессии, свободный синтез без seed → 400 NO_PARTICIPANTS_SEED_REQUIRED без создания записи) + 4n 1.5b (пул: pool-store 9 действий без snapshotCurrentState (снимки вырождены), concept-file 16 экспортов, PoolCard/ConceptPool, SYNTH_READY_SECTIONS из SectionPicker; контракты: форма читает пул из стора и монтирует ConceptPool, сабмит с ФАЙЛОВЫМИ ☑-концепциями гейтится до 4.3 (сужено 3.2; каталожные проходят), CONTEXT_BUDGET_PREVIEW локализован, prepareForGeneration перед POST, genealogy заполняется reconstructGenealogy (долг TODO(3.1/3.2) закрыт 3.2), browser storage запрещён) + 2k/4o/5n 1.6 (транспорт чтения: routes/sections + routes/elements(GET) + расширение routes/syntheses, makeDocNum [12110] дословно, /public ДО /:id, requireAuth всюду, duplicate переносит генеалогию родителей без связи с оригиналом и без логов, viewOnly ДО запуска генерации, shared += pauseEstimates/subsections/viewOnly, маркеров TODO(1.6) в дереве нет; живьём: список/SynthesisFull(null-пауза)/sections в порядке sectionOrder с subsections из HTML/categories с hasReflexiveEdges/PATCH isPublic/duplicate без lineage-связи/DELETE+404) + 4p 1.6b (просмотр/каталог: api/sections + synthesis-store + document×5 + catalog×2 + LoadingSpinner; контракты: SectionView обогащает HTML-СТРОКУ (enrichSectionHtml/DOMParser, БЕЗ useEffect — вставки эффектом стираются при hash-навигации), слуг-регексп и <2-порог TOC дословны, capsule исключён в TOC и DocumentView, extractCapsuleText реюз 1.5b, ✎→PATCH title, футер ровно totalCostUsd без ставок, страница просмотра viewOnly:true + pausedState из GET /:id + reloadSections + PauseModal, каталог с серверным ?search= и PATCH isPublic, условный viewOnly в хуке, browser storage запрещён, маркеров TODO(1.6b) в дереве нет; живьём: браузерный харнесс tests/test-16b-requests2-9.mjs — 63 проверки ×3 прогона) + 4q 1.7 (граф: 10 клиент-модулей (api/elements + graph-utils 16 экспортов + Graph3D/Graph2D (build/dispose) + 4 компонента + physics/geometry); контракты: сиды hue дословны, fuzzy typeColor 1:1 [556] (квирк подстрочных типов), roleMode=procedural, warmup узлами параметром, touch passive:false, тултип normalizeType, raise() в hover 2D, edge-arc петли, TODO(4.2) на экспорте (§12), «◈ Граф»+getCategories+extGraphMetrics в SynthesisPage, CSS графа в globals.css + медиа-легенда ≤600px + анти-грабля «*/ в комментарии», browser storage запрещён; браузерные смоуки — tests/test-17-requests2-9.mjs 84 ✓ ×2) + 2l/4r/5o 2.1 (cascade-analyzer 18 экспортов + edit-planner + plan-order-builder + routes/plans + wave-функции cost-estimator (долг 1.1 закрыт) + export loadActualOutputChars; реэкспорты sourceOf/buildPlanOrder тождественны; контракты: PORTRAIT_CANON и MODE_TITLES дословно, анти-цикл loadSynthesisLocal, локальные порты режимов сняты 4.1 (ленивые делегаты), reason-тексты, buildDynamicOrder над текущими deps, фильтры фактических деп [5501], ветка !p и вторичная сортировка buildPlanOrder, капсула-квирк и формат волны, статусы confirmed/pending, insert без estimatedCost (02 §2.13), гейт draft/PLAN_CONFLICT, isUuid, execute отсутствует (2.2), монтирование; живьём: analyzeImpact downstream, createPlan (confirmed+pending, порядок, оценка>0), updatePlan skip→каскад исчезает, PlanError VALIDATION_ERROR/FORBIDDEN/NOT_FOUND, deletePlan) + 2m/4s/5p 2.2 (plan-executor/structure-tracker/routes-generation + 14 новых экспортов generation-service; ALL_SECTION_KEYS [20906] дословно; контракты: is_edited при regen, снимок структуры [20461], version_sub [18811], регекс §N [5628] + «[удалён]», skipDegrades в трёх паузах + confirm в PauseModal (долг §12 закрыт), минимальный порт 1.4b вырезан, гейты executePlan, разъём setModeRegenerator (заполнен 4.1) с продолжением плана, пауза kind='plan' без WS при user-abort, структурный пост-шаг, регистрация setPlanResumeExecutor, ws-операции 2.2 + start_mode реализован 4.1, execute-роут и generationRoutes смонтированы; живьём: deleteSection на БД — порядок/перенумерация/пометка [удалён]/deletion_marker, buildDeletionReplacements на посеянном substitution_map; ФИКС ревью 2.2: финальный гейт errs перенесён В КОНЕЦ — секция 4r стояла после гейта и не проверялась) + 2n/4t/5q 2.4 (лог контекста и генерации: shared colorize-log (клиент — тонкий реэкспорт) + log-formatter + context-quality + routes/logs; контракты: _genCommon выделена и исключена из цикла, rawBaseBudget critique ×1.5, записи без promptSkeleton помечены (реконструкция — TODO(4.2)), маркеры парсинга v10, 4 эндпоинта под requireAuth + loadSynthesisForRead, logsRoutes смонтирован, version_marker несёт metadata.version, ContextLogViewer (dangerouslySetInnerHTML/refreshKey/Blob+transliterate), «◈ Лог» за onOpenLog, постоянная viewOnly-подписка SynthesisPage (live-лог standalone-regen), стили .raw-*, меток TODO(2.4) нет, 4o/5n перевёрнуты; живьём: формула [5571] и края reqTotal=0→70, last-win по created_at, Map ≡ поштучной, null без записей, formatCtxLogHTML { text, html } с шапкой; тесты — tests/test-24-requests2-5.mjs 51 ✓ ×2) + 2o/4u 2.3 (Edit Modal + Cascade Panel, клиент: api/plans 8 экспортов + useEditPlan/useEditPlanStore + 6 компонентов edit/; превью-транспорт: POST /plans/impact read-only с владельческим гейтом и оценкой (без insert), POST /subsection-impact без гейта активной генерации с intra/cross/modes/estimate, PATCH += extGraphMetrics; контракты клиента: терминальный колбэк по ПЕРЕХОДУ статуса + WS confirm_step на исполнении, debounce 400мс + seq превью, неразрушающее обновление reloadSections+applySynthesis (грабля R3 — цикл ремаунтов от store.load), карточка структуры, очередь подраздельного каскада по section_done с капсула-квирком, пороги бейджа 90/60 и null≠0, долг makeSectionCtxDisclosure закрыт в SectionView, CSS .edit-*/.cascade-*/@keyframes spin, browser storage запрещён, меток TODO(2.3) нет; живьём — браузерный харнесс tests/test-23-requests2-5.mjs 60 ✓ ×3) + 2p/4v/5r 3.1 (meta-synthesis-service 11 экспортов + lineage-service 4 + routes/lineage 2 роутера; контракты: провайдер = buildMetaParentContext (стаб 1.4 удалён), флаг isMetaSynthesis в buildParams, loadConceptParticipants в обеих точках generation-service без смены сигнатур, participants во всех 4 buildContextForSection, genCommon наполнен, квирк Full-блока (без portraits/graphEdges), 10 фрагментов loadConceptContext, тексты overlaps [22475/22492] дословно, POST принимает synthesis + warnings M3, /estimate с колбэком веса родителей, /:key/context с участниками, CTE descendants + потолок 10, requireAuth + pruneInvisible, оба роутера смонтированы, анти-цикл ESM, миграция схемы переводит и p (стык 2.2↔3.1), TODO(3.1) в server-дереве нет; живьём: пригодность + edge missing=['glossary'], транзитивные предки CTE, isAncestor направленный, searchByPhilosophers с HAVING-пересечением, дерево предков с обрезкой maxDepth, overlap-info с именем философа, Selective-блок с капсулами обеих, гейт флагом; тесты — scripts/test-31-requests2-4.ts 16 ✓ ×2) + 4w 3.2 (Concept Participants + Genealogy Tree, клиент: utils/genealogy 9 экспортов (порты reconstructGenealogy/restoreCapsulesFromHTML — долги §12 закрыты, FIX [а-яё], checkGenealogyOverlaps ≡ серверным дословно — дрейф-контроль клиент↔сервер) + api/lineage 3 + GenealogyTree/LineageSearch; контракты: каталожные концепции в пуле (catalogPreviewToPoolEntry, префикс catalog:), гейт 1.5b СУЖЕН до файловых (4n обновлена), buildInput → participants type='synthesis' и в /estimate (deps), предполётный confirm пересечений, estimate-diff двумя вызовами /estimate (долг §12), CompatAdvisor: кнопки замен + orderAdvice + автораскрытие conflict (долг applyReplacement §12), warnings POST рисуются, попутная починка setState-in-render 1.6b (navigate вне апдейтера), DocumentView.afterHeader + секция «Генеалогическое древо» + ссылка потомков, CatalogPage: ?descendantsOf= пересечением + LineageSearch, бейдж мета-синтеза, транспорт hasConceptParents (shared + оба списка + /lineage/search), CSS дерева + медиа ≤500px + светлая схема + квирк-комментарий дословно, browser storage запрещён, меток TODO(3.2) нет; живьём — браузерный харнесс tests/test-32-requests2-5.mjs 52 ✓ ×2) + 4x 4.1 (Mode Service: mode-service (MODE_CONFIG статика + заголовки дословно [22578], канонический getEffectiveModeDeps [22558] — делегаты cascade-analyzer ленивым import(), тексты checkModeDeps [22782] дословно, квирки taskChars prompt−ctx/целиком, отступления silent: UPDATE с сохранением created_at + source mode_cascade + метка [каскад], регистрация setModeRegenerator побочным эффектом импорта — долг §12 закрыт, дельты mode:{modeKey}) + routes/modes §2.7 (auth/409/VALIDATION_ERROR, warnings/estimate в GET, DELETE под 409 — отступление) + клиент (MODE_UI ≡ MODE_CONFIG — дрейф-контроль полей в обе стороны, api/modes ×4, id=modeTabsBar, guard mode: в useStreamingGeneration, кнопки+гейт капсулы SynthesisPage, CSS .mode-*/#modeTabsBar/@keyframes pulse-tab, browser storage запрещён, устаревших TODO(4.1) нет; долги §12 ЗАКРЫТЫ довыполнением 4.1: панель «РЕЖИМЫ» EditModal [18556–18620] с планом modeRegen/modeRemove + кнопка «отметить ↑» E5 [19483] + подраздельный каскад режимов (confirm с оценкой [19022] → POST /modes/:key/:index/regenerate → тихая перегенерация с СОБСТВЕННЫМ param — отступление от runMode-из-модалки исходника [19034], mode_done в SectionEvent, refetch счётчиков при закрытии EditModal); живьём — браузерный харнесс tests/test-41-requests2-5.mjs 77 ✓ ×2)" + " + 2q/4y/5s 4.2 (Export Service: 8 модулей services/export/* + css-audit + prompt-reconstruction + routes/export + export-assets (генерат extract:export-assets); контракты: fnBundle 46 функций + constBundle 6 констант из исходника (замена fn.toString — DOM-сериализация на сервере неисполнима), gmOverlay/modeOverlay-статика (без .mode-modal-params), rawCSS цел, квирк classDef-без-class сохранён, 5 роутов + NO_GRAPH→400 VALIDATION_ERROR + RFC5987-имена, монтирование, log-formatter БЕЗ TODO(4.2) с подключённой реконструкцией (долг §12 закрыт), GraphModal без заглушек + «⤓ Экспорт» SynthesisPage + api/export (долг §12 закрыт); ДРЕЙФ-КОНТРОЛЬ: graph-style↔graph-utils 1.7 (сиды hue, dash-сиды, CPAL, приоритеты) и graph-physics↔клиент (константы tick/warmup) и subtitleForExport↔DocumentHeader; живьём 5s: loadGModel (мульти-кластерность, clusterLabels по индексу) → buildMMD (субграфы/копии/петля) → buildJSON → buildPNG (валидный PNG) → exportMD (шапка + ## § N) + ExportError NO_GRAPH «Нет графа.» на безграфном синтезе; тесты — tests/test-42-requests2-6.mjs 76 ✓ ×2)" + " + 2r/4z/5t 4.3 (Import Service: import-service (importHTML a–m + extract*/validate + серверные копии titleToKey/genealogy-портов, 9 адаптаций в шапке) + parseDocument в html-parser (единственная точка linkedom) + routes/import (multipart, IMPORT_INVALID→400, лимит 25 МБ) + клиент ImportPage/api-import; ДРЕЙФ-КОНТРОЛЬ: TITLE_TO_KEY/KW ↔ concept-file.ts и литералы санации генеалогии ↔ genealogy.ts; контракты: type!=='philosopher' (адаптация 4), forceDate-правило порядка legacy-логов, квирк капсулы [21806], монтирование, browser storage запрещён, меток TODO(4.3) нет; живьём 5t: importHTML standalone-файла → syntheses/sections/genLog (порядок t0+i, cost→cost_usd, version-marker)/lineage + ImportError на не-PhiloSynth; тесты — tests/test-43-requests2-5.mjs 64 ✓ ×2)" + " + 2s/4ab/5u 5.1 (Element Editor + Versioning: element-editor 14 экспортов + element-versioning 9 + element-renderer 12 + locateDocTable/replaceDocTable/replaceThesisParagraph в html-parser (единственная точка linkedom) + ROLE_MAP export graph-parser + routes/elements §2.4 целиком (11 эндпоинтов, DELETE edge аддитивно); ДРЕЙФ-КОНТРОЛЬ parser↔renderer: биекция ROLE_MAP↔ROLE_LABELS, ширина таблиц ≡ индексам td парсеров, порядок столбцов ≡ строкам «Столбцы СТРОГО» section-templates, round-trip parse(render(x)) ≡ x по полям на всех пяти таблицах + метки типов тезисов, replaceDocTable сохраняет прозу вокруг таблицы; контракты: impact по прежнему И новому имени, auto-rename переписывает текстовые поля гранулярных строк, has_reflexive пересчитывается, htmlSync.pending для полей вне таблиц (02 §3 п.4), рендерер без spliceSubsectionHtml, ownerEditGate isUuid→владелец→409, shared-типы входов PATCH, меток TODO(5.1) нет; живьём 5u: applyElementUpdateToHtml replaced с сохранением h4/прозы и is_edited → parseGraph(html_content) ≡ БД, версии 1/2 → rollback → 3/rollback + история DESC + фильтр synthesis_id + CASCADE при удалении синтеза; тесты — tests/test-51-requests2-6.mjs 111 ✓ ×2)" + " + 4ac 5.2 (Element Editor UI, клиент: api/elements 13 экспортов + ElementEditor/CategoryEditor/ThesisEditor/GlossaryTermEditor/VersionHistory + addInlineEditButtons в SectionView; ДРЕЙФ-КОНТРОЛЬ: THESIS_TYPE_OPTIONS ≡ THESIS_TYPE_LABELS рендерера, HOST_SECTION ≡ TABLE_SECTION, CATEGORY_TYPES ⊆ section-templates (временно, до TaxonomySelector 5.4); контракты: ✎ в HTML-строке без useEffect, перегенерация только через планы (onRegenerateAffected → EditModal.initialRegen), предупреждения htmlSync.pending/sectionMissing (долг §12 закрыт), редактор поверх графа (.element-editor-overlay) + GNode.dbId, isOwner в SynthesisFull (сервер+shared) и гейты SynthesisPage, CSS блоков 5/7 кита в части 3, browser storage запрещён; тесты — tests/test-52-requests2-5.mjs 73 ✓ ×2 + smoke-52 26 ✓)" + " + 2t/4ad/5v 5.3 (Element Enrichment: element-enrichment 22 экспорта + routes/enrichment §2.14 (5) + routes/taxonomy §2.13 (5; дыра 0.3b закрыта) + enrichment-templates (6 ключей канона) + shared/constants/characteristics; ДРЕЙФ-КОНТРОЛЬ шаблоны ↔ переменные сервиса в обе стороны (strict-рендер), три data-section обоснования ↔ парсер колонок, dtoField ↔ строки таблиц; контракты: диапазоны п.18 (8/6, innovation_degree целое [1,5]), алиас depth, слот withGenerationSlot (п.5 03 §3.1), без bumpTotals (01 §4.9), разъём setUsageRecorder (→ 6.1), SYS mode, start_enrichment с владельцем, WsEnrichmentDone += enrichmentId/content, посев; живьём 5v: история DESC, фильтр elementType, доступ по synthesis_id, DTO numeric→number, CASCADE; тесты — tests/test-53-requests2-6.mjs 87 ✓ ×2 + smoke-53 59 ✓)" + " + 2u/4ae 5.4 (Характеристики/Обогащение/Таксономия UI, клиент: api/taxonomy 6 + api/enrichment 5 + useEnrichmentStream + CharacteristicSlider(Group) + EnrichmentPanel + TaxonomySelector + EdgeEditor (новый вид kind='edge' ElementEditor); ДРЕЙФ-КОНТРОЛЬ: типы обогащения панели ≡ сервису 5.3, шаг слайдеров ≡ integer спек, черновик CategoryEditor ⊇ dtoField, направления связей ≡ схеме, пути api/* ≡ роутам (перехват fetch), правила кита 1/2/8 дословно в части 3; контракты: guard enrich: в useStreamingGeneration, запуск только HTTP (start_enrichment не используется), CATEGORY_TYPES снята (долг §12 закрыт), GEdge.dbId + EdgePanel.onEdit + NodePanel.edit (PATCH по onCommit) + readOnly-блок владельца при генерации, browser storage запрещён; тесты — tests/test-54-requests2-6.mjs 79 ✓ ×2 + smoke-54 36 ✓)");
