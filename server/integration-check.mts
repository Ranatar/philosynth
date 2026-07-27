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
  // TODO следующих бесед помечены в коде
  if (!/TODO\(2\.1\)/.test(cbSrc13))
    errs.push("4j: TODO(2.1) canonicalSubsectionKey не помечен в context-builder");
  // Гейт наличия раздела сохранён (аналог `if (!el) return null` [8155])
  if (!/const el = await src\.getSectionElement/.test(cxSrc13) || !/if \(!el\) return null;/.test(cxSrc13))
    errs.push("4j: гейт наличия раздела в extractContextFragment не сохранён");
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

// ── 5. Async-цепочки: реальный запрос через db и через sql ──
import { db, sql, closeDb } from "./db/index.js";
const viaRaw = await sql`SELECT 1 AS one`;
if (viaRaw[0]?.one !== 1) errs.push("await sql: неожиданный результат");
const viaDrizzle = await db.query.users.findMany({ limit: 1 });
if (!Array.isArray(viaDrizzle)) errs.push("await db.query: не массив");
// closeDb возвращает Promise<void> и реально ждёт закрытия
const p = closeDb();
if (!(p instanceof Promise)) errs.push("closeDb не Promise");
await p;
// после закрытия запрос обязан отклониться — await пробрасывает reject
let rejected = false;
try { await sql`SELECT 1`; } catch { rejected = true; }
if (!rejected) errs.push("await после closeDb не отклонился (пул не закрыт?)");

if (errs.length) { console.error("ПРОБЛЕМЫ:\n" + errs.map(e => " - " + e).join("\n")); process.exit(1); }
console.log("INTEGRATION OK: 11 value-модулей shared, 4 server-модуля 0.1 + 7 модулей 0.2 (auth/admin-only/routes/rate-limiter/ws×2/redis) + 13 модулей 0.3 (prompt-registry + 12 config) + 1 модуль 0.3b (element-taxonomy) + 5 модулей 1.1 (deep-merge/topo-sort/synthesis-engine/compat-advisor/cost-estimator, реэкспорты тождественны) + 4 модуля 1.2 (prompt-builder/section-defs-builder + section-templates 146 шт./subsection-map; SEC_NAMES≡KEY_LABELS, реэкспорты кардинальности тождественны) + 17 клиент-модулей 0.4+0.6 (api/store/useWebSocket/App/layout×3/pages×10), 11 файлов типов, 4+5+4+6 кросс-слойных совместимостей + 4e (AuthUser client↔server, ApiErrorCode⊇§4.3+серверные коды, маршруты App↔Sidebar↔протокол, BASE_URL↔монтирование, эндпоинты store↔routes) + 4h 1.1 (async-сигнатуры engine/advisor/estimator, перенос applyBudgetPressure в context-builder (1.3), константы [7539] и топо-таблицы [6505/6520] дословно) + 4j/5j 1.3 (async-сигнатуры context-builder/extractor/parent-context, CtxLogDraft⊇context_log, пол 40% и пороги бюджета дословно, DOM-слой изолирован в html-parser, живой конвейер на sections+categories) + 4i 1.2 (async-сигнатуры билдеров, parts/defs структурно совместимы со входами оценщика, стоп-сигнал из Registry без хардкода, разъём провайдера 1.3, тексты разделов только из Registry, посевы += SEED_SECTION_TEMPLATES/subsection_map, extract:sections, баннер генерата), async-цепочки (5e: auth-store против authRoutes через app.request на живой БД — register/login/logout/restore/NETWORK_ERROR (auth-жизненный цикл; registry: getTemplate/render/getConfig/NOT_FOUND/кэш-инвалидация; taxonomy: counts 18/29, normalizeType match/null-кейсы, валидация createCustomType, кэш-инвалидация — всё на живой БД+Redis; 4f/5f 0.5: контракт password-change (requireAuth, eq+ne-инвалидация, транзакция, общая PASSWORD_MIN_LENGTH) + живой цикл смены пароля (отказы без побочных эффектов, старый пароль мёртв, чужая сессия убита, текущая жива; 4g/5g 0.6: контракт профиля (PATCH /me, /profile в App+Header, skipUnauthorizedHandler объявлен и применён) + живой смоук PATCH displayName/пустая→null/101→400; 5h 1.1: живой конвейер resolveContextDeps→buildEffectiveDeps(подстановка)→buildDynamicOrder→getCompatEntryByKey→computeSectionAdvice→estimateCost на посеянных конфигах; 5i 1.1+1.2: сквозной конвейер buildSYS→baseCtxStatic→buildSectionDefs→groupPasses→estimateCost(sysChars/baseStaticChars/passes реальные)→patchPromptsWithSecCtx + stop_signal из Registry); reject после closeDb)");
