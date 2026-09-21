/**
 * Роуты /syntheses (беседа 1.4, запрос 2; 03-spec §2.2).
 *
 * Пока ТОЛЬКО POST /syntheses: принимает параметры §2.2, валидирует,
 * создаёт запись syntheses + генеалогию synthesis_lineage (философы),
 * запускает генерацию В ФОНЕ и отвечает { id, status: "generating" } —
 * клиент подключается по WebSocket (subscribe_generation привяжет стрим,
 * но дельты и так идут по userId через connection-manager).
 *
 * Беседа 8.6 (модель публичности, сервер): булев is_public заменён ступенью
 * visibility ('private'|'showcase'|'full') и четырьмя флагами (миграция
 * 0005). loadSynthesisForRead возвращает сверх доступа уровень смотрящего
 * (viewer owner/user/guest) и объём (scope full/showcase); действенность
 * флагов — ТОЛЬКО effectiveFlags (shared/utils/visibility); отсечение полей
 * по смотрящему — ТОЛЬКО projectSynthesis/projectPreview. Гостю (без
 * сессии, optionalAuth) открыты ровно два пути этого файла: GET /public и
 * GET /:id (третий — GET /billing/plans); стоимость/токены/пауза гостю не
 * отдаются никогда, зарегистрированному — всегда (флагом не управляются).
 * Чужая концепция годится в участники мета-синтеза только при действенном
 * allow_meta (403 META_NOT_ALLOWED); витрина — никогда.
 *
 * Беседа 1.6 (транспорт чтения, сервер) добавила: GET / (список своих),
 * GET /public, GET /:id (SynthesisFull + pausedState + pauseEstimates),
 * PATCH /:id, DELETE /:id, POST /:id/duplicate; POST / заполняет doc_num
 * (формат исходника [12110]) и снимок structure_sections. Из роутов §2.2
 * не реализован только POST /syntheses/import — беседа 4.3.
 *
 * Решения:
 *  - v11: philosophers И participants опциональны; оба пусты — свободный
 *    синтез, обязателен seed (§2.2). participants типа "synthesis"
 *    (мета-синтез) — беседа 3.1: пока 422-подобный VALIDATION_ERROR,
 *    чтобы не создать запись, которую генератор не умеет наполнить.
 *  - sectionOrder = ["sum", ...sections] (sum всегда первый и всегда есть,
 *    как в исходнике; из p.sec он исключается генератором).
 *  - sectionContexts не персистятся до генерации (колонки нет): передаются
 *    в generateSynthesis(opts) и ложатся в sections.sec_context при
 *    upsert'е раздела (решение запроса 1).
 *  - Предпроверки (лимит 3, наличие API-ключа) — ДО создания строки
 *    (assertCanStartGeneration), чтобы не плодить вечно-generating записи;
 *    фоновый сбой старта после создания строки переводит её в 'error'
 *    и шлёт stream_error по WS.
 */
import { Hono } from "hono";

import { db } from "../db/index.js";
import { syntheses, synthesisLineage, users } from "../db/schema.js";
import {
  checkGenealogyOverlaps,
  loadConceptContext,
  unsuitableConceptMessage,
  validateConceptForMetaSynthesis,
  type OverlapParticipant,
} from "../services/meta-synthesis-service.js";
import {
  createLineageRecords,
  unlinkedFileParents,
} from "../services/lineage-service.js";
import { parentOverheadForSection } from "../services/context-builder.js";
import { normalizeSectionKey } from "../services/parent-context.js";
import {
  optionalAuth,
  requireAuth,
  viewerOf,
  type AuthEnv,
} from "../middleware/auth.js";
import { billingCheck } from "../middleware/billing-check.js"; // 6.1
import {
  BillingError,
  billingErrorStatus,
  computeChargeUsd,
  resolveBilling,
} from "../services/billing-service.js"; // 7.1: точный гейт оценки
import {
  assertCanStartGeneration,
  generateSynthesis,
  GenerationError,
  isGenerationActive,
} from "../services/generation-service.js";
import {
  buildSectionDefs,
  groupPasses,
  patchPromptsWithSecCtx,
  SEC_NAMES,
} from "../services/section-defs-builder.js";
import {
  baseCtx,
  baseCtxStatic,
  buildSYS,
  hasConceptParticipants,
} from "../services/prompt-builder.js";
import { estimateCost } from "../services/cost-estimator.js";
import {
  computeSectionAdvice,
  getCompatEntryByKey,
  iconForSeverity,
  titleForSeverity,
  type SectionAdviceInput,
} from "../services/compat-advisor.js";
import {
  buildEffectiveDeps,
  resolveContextDeps,
} from "../services/synthesis-engine.js";
import { buildDynamicOrder } from "../utils/topo-sort.js";
import { connectionManager } from "../ws/connection-manager.js";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  ne,
} from "drizzle-orm";

import {
  categories,
  categoryEdges,
  clusterLabels,
  dialogueTurns,
  glossaryTerms,
  sections,
  theses,
} from "../db/schema.js";
import {
  computePauseEstimates,
} from "../services/pause-resume-service.js";
import type {
  EffectiveFlags,
  PausedState,
  SynthesisFull,
  SynthesisPreview,
  SynthesisScope,
  SynthesisViewer,
  SynthesisVisibility,
} from "@philosynth/shared/types/synthesis";
import { SYNTHESIS_VISIBILITIES } from "@philosynth/shared/types/synthesis";
import type { SectionFull } from "@philosynth/shared/types/section";
import { effectiveFlags } from "@philosynth/shared/utils/visibility";
import { parseSubsectionsFromHTML } from "../services/generation-service.js";
import type { PauseEstimates } from "@philosynth/shared/types/ws-messages";

/* ── Допустимые значения (зеркало enum'ов схемы 02) ──────────────────── */

const METHODS = new Set([
  "dialectical",
  "integrative",
  "deconstructive",
  "hermeneutical",
  "analytical",
  "creative",
]);
const SYNTH_LEVELS = new Set(["comparative", "transformative", "generative"]);
const DEPTHS = new Set(["overview", "standard", "deep", "exhaustive"]);
const GENERATION_ORDERS = new Set(["architectural", "genetic"]);

interface PostBody {
  seed?: unknown;
  philosophers?: unknown;
  sections?: unknown;
  method?: unknown;
  depth?: unknown;
  synthLevel?: unknown;
  generationOrder?: unknown;
  extGraphMetrics?: unknown;
  keepFullBudget?: unknown;
  context?: unknown;
  sectionContexts?: unknown;
  lang?: unknown;
  participants?: unknown;
}

const isStrArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/* ── Helpers беседы 1.6 (транспорт чтения) ───────────────────────────── */

/**
 * Номер документа — формат исходника [12110]:
 * "PS-" + rand(1000..9999) + "-" + Date.now().toString(36).toUpperCase().slice(-4)
 */
export function makeDocNum(): string {
  return (
    "PS-" +
    Math.floor(Math.random() * 9000 + 1000) +
    "-" +
    Date.now().toString(36).toUpperCase().slice(-4)
  );
}

/** Невалидный UUID до запроса к PG (иначе 22P02) → трактуем как 404. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string): boolean => UUID_RE.test(v);

/** Строка syntheses целиком (типизированный select * ). */
type SynthesisRow = typeof syntheses.$inferSelect;

/** Результат loadSynthesisForRead (8.6): к доступу добавлены уровень
 *  смотрящего и объём. Потребители, требующие содержания (разделы,
 *  элементы, режимы, преобразования, обогащение, экспорт), отказывают
 *  невладельцу при scope='showcase' — иначе витрина течёт боковым ходом. */
export type ReadAccess =
  | {
      access: "ok";
      row: SynthesisRow;
      viewer: SynthesisViewer;
      scope: SynthesisScope;
    }
  | { access: "notfound" }
  | { access: "forbidden" };

/**
 * Загрузка синтеза + проверка доступа на ЧТЕНИЕ (правило одно на весь
 * транспорт; беседа 8.6 переписала правило 1.6 «владелец ИЛИ is_public»):
 *  - владелец → 'ok' / viewer 'owner' / scope 'full' при любой ступени;
 *  - visibility='private' и не владелец → 'forbidden';
 *  - 'showcase' → 'ok' со scope 'showcase' (содержание не отдаётся);
 *  - 'full' → 'ok' со scope 'full';
 *  - userId=null (гость без сессии) → viewer 'guest'.
 * Несуществующий/невалидный id → 'notfound' (guard до запроса к PG).
 * Используется всеми роутами чтения (sections/elements/logs/export/…).
 */
export async function loadSynthesisForRead(
  id: string,
  userId: string | null,
): Promise<ReadAccess> {
  if (!isUuid(id)) return { access: "notfound" };
  const [row] = await db
    .select()
    .from(syntheses)
    .where(eq(syntheses.id, id))
    .limit(1);
  if (!row) return { access: "notfound" };
  if (userId !== null && row.userId === userId) {
    return { access: "ok", row, viewer: "owner", scope: "full" };
  }
  if (row.visibility === "private") return { access: "forbidden" };
  return {
    access: "ok",
    row,
    viewer: userId === null ? "guest" : "user",
    scope: row.visibility === "showcase" ? "showcase" : "full",
  };
}

/** Чужая концепция годится в участники мета-синтеза, только если
 *  allow_meta ДЕЙСТВЕНЕН (effectiveFlags ⇒ visibility='full'); своя —
 *  всегда; витрина — никогда (8.6 п.8: loadConceptContext читал бы
 *  спрятанное от человека). */
export function metaAllowedFor(
  res: Extract<ReadAccess, { access: "ok" }>,
): boolean {
  return res.viewer === "owner" || effectiveFlags(res.row).allowMeta;
}

/** Единые JSON-ответы отказа доступа (03 §4.3). */
export const notFoundJson = {
  error: "Синтез не найден",
  code: "NOT_FOUND",
} as const;
export const forbiddenJson = {
  error: "Нет доступа к синтезу",
  code: "FORBIDDEN",
} as const;
/** 8.6: витрина не раскрывает содержания — ответ контент-роутов
 *  (разделы, элементы, режимы, преобразования, обогащение, экспорт)
 *  невладельцу при scope='showcase'. Код тот же FORBIDDEN (§4.3). */
export const showcaseForbiddenJson = {
  error: "Концепция открыта витриной: доступны капсула и метаданные, содержание — нет",
  code: "FORBIDDEN",
} as const;
/** 8.6 п.8: чужая концепция без действенного allow_meta в участниках. */
export const metaNotAllowedJson = (title: string, synthesisId: string) =>
  ({
    error: `Автор концепции «${title}» не разрешил использовать её в мета-синтезе`,
    code: "META_NOT_ALLOWED",
    details: { participants: synthesisId, title },
  }) as const;

/** Превью капсулы для карточки каталога: HTML → плоский текст, 200 симв. */
function capsulePreviewOf(capsuleHtml: string): string {
  return capsuleHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Философы-родители по списку синтезов (для превью каталога;
 *  экспорт — для /lineage/search, беседа 3.1). */
export async function loadPhilosophersFor(
  ids: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({
      synthesisId: synthesisLineage.synthesisId,
      parentName: synthesisLineage.parentName,
    })
    .from(synthesisLineage)
    .where(
      and(
        inArray(synthesisLineage.synthesisId, ids),
        eq(synthesisLineage.parentType, "philosopher"),
      ),
    )
    .orderBy(asc(synthesisLineage.position));
  for (const r of rows) {
    if (!r.parentName) continue;
    const list = map.get(r.synthesisId) ?? [];
    list.push(r.parentName);
    map.set(r.synthesisId, list);
  }
  return map;
}

/** Синтезы из списка, у которых есть родители-концепции
 *  (parent_type='synthesis') — признак «мета-синтез» для бейджа карточки
 *  каталога (беседа 3.2, п. 5; аддитивная правка транспорта — дыра доков:
 *  SynthesisPreview признака не нёс). Экспорт — для /lineage/search. */
export async function loadConceptParentFlags(
  ids: string[],
): Promise<Set<string>> {
  const flags = new Set<string>();
  if (ids.length === 0) return flags;
  const rows = await db
    .select({ synthesisId: synthesisLineage.synthesisId })
    .from(synthesisLineage)
    .where(
      and(
        inArray(synthesisLineage.synthesisId, ids),
        eq(synthesisLineage.parentType, "synthesis"),
      ),
    );
  for (const r of rows) flags.add(r.synthesisId);
  // Родители-концепции из дерева импортированного файла тоже делают синтез
  // мета-синтезом (бейдж каталога); перекрытие связью БД здесь неважно —
  // перекрытая связь сама даёт флаг выше
  const rest = ids.filter((id) => !flags.has(id));
  if (rest.length > 0) {
    const fileRows = await db
      .select({ id: syntheses.id, fileGenealogy: syntheses.fileGenealogy })
      .from(syntheses)
      .where(
        and(inArray(syntheses.id, rest), isNotNull(syntheses.fileGenealogy)),
      );
    for (const r of fileRows) {
      if (r.fileGenealogy?.participants?.some((p) => p.type === "concept"))
        flags.add(r.id);
    }
  }
  return flags;
}

/** 8.6: имена авторов (users.display_name) батчем по списку строк —
 *  ТОЛЬКО для строк с действенным show_author (effectiveFlags); пустое
 *  display_name → имени нет. Экспорт — для /lineage/search. */
export async function loadAuthorNamesFor(
  rows: SynthesisRow[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const userIds = [
    ...new Set(
      rows.filter((r) => effectiveFlags(r).showAuthor).map((r) => r.userId),
    ),
  ];
  if (userIds.length === 0) return names;
  const urows = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, userIds));
  const byUser = new Map(urows.map((u) => [u.id, u.displayName]));
  for (const r of rows) {
    if (!effectiveFlags(r).showAuthor) continue;
    const name = byUser.get(r.userId)?.trim();
    if (name) names.set(r.id, name);
  }
  return names;
}

/** Экспорт — для /lineage/search (беседа 3.1). Третий параметр — признак
 *  родителей-концепций (беседа 3.2; loadConceptParentFlags); четвёртый
 *  (8.6) — имя автора при действенном show_author (loadAuthorNamesFor). */
export function toPreview(
  row: SynthesisRow,
  philosophers: string[],
  hasConceptParents = false,
  authorName?: string,
): SynthesisPreview {
  return {
    id: row.id,
    title: row.title,
    method: row.method,
    synthLevel: row.synthLevel,
    depth: row.depth,
    status: row.status,
    visibility: row.visibility,
    ...(authorName ? { authorName } : {}),
    philosophers,
    hasConceptParents,
    capsulePreview: capsulePreviewOf(row.capsuleHtml),
    totalCostUsd: Number.parseFloat(row.totalCostUsd ?? "0") || 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 8.6 п.5: отсечение полей превью по смотрящему — гость не получает
 *  totalCostUsd. Зарегистрированный видит стоимость у любой неприватной
 *  концепции (флагом не управляется). Экспорт — для /lineage/search. */
export function projectPreview(
  preview: SynthesisPreview,
  viewer: SynthesisViewer,
): SynthesisPreview {
  if (viewer !== "guest") return preview;
  const { totalCostUsd: _cost, ...guest } = preview;
  return guest;
}

/**
 * 8.6 п.5: отсечение полей SynthesisFull по смотрящему — ОДНОЙ функцией.
 *  - guest: totalCostUsd/totalInputTokens/totalOutputTokens убраны;
 *    pausedState/pauseEstimates → null (genParams несут зерно и secCtx —
 *    рабочее состояние владельца); при scope='full' документ отдаётся
 *    одним ответом — sections (тела разделов) вложены;
 *  - user (чужой зарегистрированный): стоимость и токены видны всегда;
 *    pausedState/pauseEstimates → null при scope='showcase';
 *  - scope='showcase' (любой невладелец): sections не отдаются (элементы,
 *    граф, тезисы, глоссарий живут в своих роутах и там гейтятся тем же
 *    правилом); capsuleHtml, метаданные, философы, даты — отдаются;
 *  - authorName — ТОЛЬКО при действенном show_author (flags) и непустом
 *    display_name; иначе поля нет.
 * Владелец получает всё без изменений.
 */
export function projectSynthesis(
  full: SynthesisFull,
  viewer: SynthesisViewer,
  flags: EffectiveFlags,
  extra: { authorName?: string | null; sections?: SectionFull[] } = {},
): SynthesisFull {
  const scope = full.scope;
  const base: SynthesisFull = { ...full };
  delete base.authorName;
  if (flags.showAuthor && extra.authorName?.trim()) {
    base.authorName = extra.authorName.trim();
  }
  if (viewer === "owner") return base;
  if (scope === "showcase") {
    base.pausedState = null;
    base.pauseEstimates = null;
  }
  if (viewer === "user") return base;
  // guest
  const {
    totalCostUsd: _c,
    totalInputTokens: _i,
    totalOutputTokens: _o,
    ...guest
  } = base;
  const out: SynthesisFull = {
    ...guest,
    pausedState: null,
    pauseEstimates: null,
  };
  if (scope === "full" && extra.sections) out.sections = extra.sections;
  return out;
}

/** Тела разделов для гостевого «документа одним ответом» (8.6 п.6):
 *  порядок sectionOrder, чужие ключи в хвост по sectionNum (как
 *  routes/sections 1.6); капсула живёт в capsuleHtml и здесь исключается. */
async function loadSectionsFull(row: SynthesisRow): Promise<SectionFull[]> {
  const rows = await db
    .select()
    .from(sections)
    .where(eq(sections.synthesisId, row.id))
    .orderBy(asc(sections.sectionNum));
  const order = (row.sectionOrder ?? []).filter((k) => k !== "capsule");
  const idx = (k: string): number => {
    const i = order.indexOf(k);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return rows
    .filter((r) => r.key !== "capsule")
    .sort((a, b) => idx(a.key) - idx(b.key) || a.sectionNum - b.sectionNum)
    .map((r) => ({
      key: r.key,
      sectionNum: r.sectionNum,
      title: r.title,
      htmlContent: r.htmlContent,
      secContext: r.secContext,
      isEdited: r.isEdited,
      subsections: subsectionNamesOf(r.htmlContent),
    }));
}

/** Как listSubsections в routes/sections (1.6): уникальные data-section в
 *  порядке появления, прогнанные через порт 1.4 (канонизация едина с
 *  трекингом генерации). Дублировано локально: sections.ts импортирует
 *  этот модуль — обратный импорт замкнул бы цикл. */
function subsectionNamesOf(html: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const re = /data-section="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const name = m[1] as string;
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return parseSubsectionsFromHTML(html, names).map((x) => x.name);
}

/**
 * SynthesisFull (03 §2.2): строка + генеалогия + pauseEstimates.
 * Оценки паузы — только для kind='gen' (computePauseEstimates, 1.4b,
 * fail-open {}); kind='plan' → {}; pausedState=null → null.
 */
async function buildSynthesisFull(
  row: SynthesisRow,
  viewerUserId: string | null,
  scope: SynthesisScope = "full",
): Promise<SynthesisFull> {
  const lineageRows = await db
    .select()
    .from(synthesisLineage)
    .where(eq(synthesisLineage.synthesisId, row.id))
    .orderBy(asc(synthesisLineage.position));

  const philosophers = lineageRows
    .filter((r) => r.parentType === "philosopher" && r.parentName)
    .map((r) => r.parentName as string);

  const parentIds = lineageRows
    .filter((r) => r.parentType === "synthesis" && r.parentSynthesisId)
    .map((r) => r.parentSynthesisId as string);
  const parentSyntheses =
    parentIds.length > 0
      ? (
          await db
            .select({ id: syntheses.id, title: syntheses.title })
            .from(syntheses)
            .where(inArray(syntheses.id, parentIds))
        ).sort((a, b) => parentIds.indexOf(a.id) - parentIds.indexOf(b.id))
      : [];

  // Дерево импортированного файла: родители-концепции без связи в БД
  // (правило приоритета — unlinkedFileParents, lineage-service)
  const fileConceptParents = unlinkedFileParents(row.fileGenealogy, lineageRows)
    .filter((f) => f.node.type === "concept")
    .map((f) => f.node.name);

  const childSyntheses = await db
    .select({ id: syntheses.id, title: syntheses.title })
    .from(syntheses)
    .where(
      exists(
        db
          .select({ one: synthesisLineage.id })
          .from(synthesisLineage)
          .where(
            and(
              eq(synthesisLineage.parentSynthesisId, row.id),
              eq(synthesisLineage.synthesisId, syntheses.id),
            ),
          ),
      ),
    );

  const ps = (row.pausedState ?? null) as PausedState | null;
  let pauseEstimates: PauseEstimates | null = null;
  if (ps) {
    pauseEstimates =
      ps.kind === "gen" ? await computePauseEstimates(row.id, ps) : {};
  }

  return {
    id: row.id,
    title: row.title,
    seed: row.seed,
    method: row.method,
    synthLevel: row.synthLevel,
    depth: row.depth,
    generationOrder: row.generationOrder,
    extGraphMetrics: row.extGraphMetrics,
    context: row.context,
    lang: row.lang,
    status: row.status,
    keepFullBudget: row.keepFullBudget,
    parentContextSchema:
      row.parentContextSchema as SynthesisFull["parentContextSchema"],
    pausedState: ps,
    pauseEstimates,
    visibility: row.visibility,
    showAuthor: row.showAuthor,
    showLogs: row.showLogs,
    showPrompts: row.showPrompts,
    allowMeta: row.allowMeta,
    scope,
    // Беседа 5.2 («По факту 5.2»): признак владения для клиентских гейтов
    // (✎ редактора, «Изменить», режимы). Именно флаг, а не userId — у
    // публичного синтеза id владельца читателю не раскрывается.
    isOwner: viewerUserId !== null && row.userId === viewerUserId,
    docNum: row.docNum,
    sectionOrder: row.sectionOrder,
    version: {
      base: row.versionBase,
      sub: row.versionSub,
      modes: row.versionModes,
      modeRegen: row.versionModeRegen,
    },
    structureSections: row.structureSections ?? null,
    capsuleHtml: row.capsuleHtml,
    totalInputTokens: row.totalInputTokens,
    totalOutputTokens: row.totalOutputTokens,
    totalCostUsd: Number.parseFloat(row.totalCostUsd ?? "0") || 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    philosophers,
    parentSyntheses,
    fileConceptParents,
    childSyntheses,
  };
}

/** Имя автора одной строки при действенном show_author (8.6). */
async function authorNameOf(row: SynthesisRow): Promise<string | null> {
  const names = await loadAuthorNamesFor([row]);
  return names.get(row.id) ?? null;
}

/** GET /:id целиком: SynthesisFull → projectSynthesis по смотрящему. */
async function respondSynthesisFull(
  res: Extract<ReadAccess, { access: "ok" }>,
  viewerUserId: string | null,
): Promise<SynthesisFull> {
  const full = await buildSynthesisFull(res.row, viewerUserId, res.scope);
  const flags = effectiveFlags(res.row);
  const extra: { authorName?: string | null; sections?: SectionFull[] } = {
    authorName: flags.showAuthor ? await authorNameOf(res.row) : null,
  };
  if (res.viewer === "guest" && res.scope === "full") {
    extra.sections = await loadSectionsFull(res.row);
  }
  return projectSynthesis(full, res.viewer, flags, extra);
}

export const synthesesRoutes = new Hono<AuthEnv>();

synthesesRoutes.post("/", requireAuth, billingCheck({ quota: "syntheses" }), async (c) => {
  const user = c.get("user");

  let body: PostBody;
  try {
    body = (await c.req.json()) as PostBody;
  } catch {
    return c.json(
      { error: "Невалидный JSON", code: "VALIDATION_ERROR" },
      400,
    );
  }

  /* ── Валидация §2.2 ── */
  const details: Record<string, string> = {};

  const seed = typeof body.seed === "string" ? body.seed.trim() : "";
  const philosophers = isStrArray(body.philosophers)
    ? body.philosophers.map((p) => p.trim()).filter(Boolean)
    : body.philosophers === undefined
      ? []
      : null;
  if (philosophers === null) details.philosophers = "массив строк";

  // v11: participants (мета-синтез) — тип "synthesis" ПРИНИМАЕТСЯ
  // (беседа 3.1: серверная половина снятия гейта 1.5b; клиент — 3.2).
  let participantPhilosophers: string[] = [];
  const conceptIds: string[] = [];
  if (body.participants !== undefined) {
    if (!Array.isArray(body.participants)) {
      details.participants = "массив ParticipantInput";
    } else {
      for (const p of body.participants as Array<Record<string, unknown>>) {
        if (p && p.type === "philosopher" && typeof p.name === "string") {
          participantPhilosophers.push(p.name.trim());
        } else if (p && p.type === "synthesis") {
          if (typeof p.synthesisId !== "string" || !isUuid(p.synthesisId)) {
            details.participants =
              "участник synthesis требует synthesisId (UUID)";
            break;
          }
          conceptIds.push(p.synthesisId);
        } else {
          details.participants =
            "элементы {type:'philosopher', name} | {type:'synthesis', synthesisId}";
          break;
        }
      }
    }
  }
  participantPhilosophers = participantPhilosophers.filter(Boolean);
  const allPhilosophers = [
    ...new Set([...(philosophers ?? []), ...participantPhilosophers]),
  ];

  // v11: оба списка пусты — свободный синтез, обязателен seed.
  // Код ошибки — по 03 §4.3: NO_PARTICIPANTS_SEED_REQUIRED (беседа 1.5:
  // до неё роут отдавал общий VALIDATION_ERROR — код приведён к спеке)
  let noParticipantsSeedMissing = false;
  if (allPhilosophers.length === 0 && conceptIds.length === 0 && !seed) {
    noParticipantsSeedMissing = true;
    details.seed = "обязателен при пустых philosophers/participants";
  }

  const knownSections = new Set(Object.keys(SEC_NAMES));
  let sections: string[] = [];
  if (!isStrArray(body.sections)) {
    details.sections = "массив ключей разделов";
  } else {
    sections = [...new Set(body.sections.filter((s) => s !== "sum"))];
    const unknown = sections.filter((s) => !knownSections.has(s));
    if (unknown.length > 0) {
      details.sections = `неизвестные разделы: ${unknown.join(", ")}`;
    }
  }

  const method = (body.method ?? "dialectical") as string;
  if (!METHODS.has(method)) details.method = "неизвестный метод";
  const synthLevel = (body.synthLevel ?? "comparative") as string;
  if (!SYNTH_LEVELS.has(synthLevel)) details.synthLevel = "неизвестный уровень";
  const depth = (body.depth ?? "standard") as string;
  if (!DEPTHS.has(depth)) details.depth = "неизвестная глубина";
  const generationOrder = (body.generationOrder ?? "architectural") as string;
  if (!GENERATION_ORDERS.has(generationOrder))
    details.generationOrder = "architectural | genetic";

  let sectionContexts: Record<string, string> | undefined;
  if (body.sectionContexts !== undefined) {
    if (
      typeof body.sectionContexts !== "object" ||
      body.sectionContexts === null ||
      Array.isArray(body.sectionContexts) ||
      !Object.values(body.sectionContexts).every((v) => typeof v === "string")
    ) {
      details.sectionContexts = "Record<string, string>";
    } else {
      sectionContexts = body.sectionContexts as Record<string, string>;
    }
  }

  if (Object.keys(details).length > 0) {
    return c.json(
      {
        error: "Невалидные параметры синтеза",
        code: noParticipantsSeedMissing
          ? "NO_PARTICIPANTS_SEED_REQUIRED"
          : "VALIDATION_ERROR",
        details,
      },
      400,
    );
  }

  /* ── Участники-концепции (беседа 3.1; M1–M3 §1.6): доступ (владелец
        ИЛИ публичный — паритет каталога) и пригодность
        (validateConceptForMetaSynthesis: sum/glossary/theses/critique,
        graph|dialogue, capsule). Дубликаты id отклоняются. ── */
  const overlapParticipants: OverlapParticipant[] = allPhilosophers.map(
    (name) => ({ type: "philosopher", name }),
  );
  if (conceptIds.length > 0) {
    if (new Set(conceptIds).size !== conceptIds.length) {
      return c.json(
        {
          error: "Невалидные параметры синтеза",
          code: "VALIDATION_ERROR",
          details: { participants: "участники-концепции не должны повторяться" },
        },
        400,
      );
    }
    for (const cid of conceptIds) {
      const access = await loadSynthesisForRead(cid, user.id);
      if (access.access === "notfound") {
        return c.json(
          {
            error: "Невалидные параметры синтеза",
            code: "VALIDATION_ERROR",
            details: { participants: `концепция ${cid} не найдена` },
          },
          400,
        );
      }
      if (access.access === "forbidden") {
        return c.json(
          {
            error: "Нет доступа к концепции-участнику",
            code: "FORBIDDEN",
            details: { participants: cid },
          },
          403,
        );
      }
      // 8.6 п.8: чужая концепция — только при ДЕЙСТВЕННОМ allow_meta
      // (visibility='full' && allow_meta); своя — всегда; витрина — никогда.
      if (!metaAllowedFor(access)) {
        return c.json(metaNotAllowedJson(access.row.title, cid), 403);
      }
      const check = await validateConceptForMetaSynthesis(cid);
      if (!check.valid) {
        return c.json(
          {
            error: "Концепция-участник непригодна для мета-синтеза",
            code: "VALIDATION_ERROR",
            details: {
              participants: unsuitableConceptMessage(
                access.row.title,
                check.missing,
              ),
              missing: check.missing.join(", "),
            },
          },
          400,
        );
      }
      overlapParticipants.push({
        type: "synthesis",
        synthesisId: cid,
        name: access.row.title,
      });
    }
  }
  // M3: генеалогические пересечения — НЕ блокируют (confirm исходника
  // [22052] жил на клиенте); предупреждения уходят в ответ POST
  // (аддитивное поле warnings — дыра 03 §2.2, в патч доков).
  const genealogyWarnings =
    conceptIds.length > 0 ? await checkGenealogyOverlaps(overlapParticipants) : [];

  /* ── 7.1: точная оценка стоимости для гейта баланса (долг §12 6.1).
        billingCheck перед разбором тела мог сверить баланс лишь с порогом
        BILLING_MIN_RESERVE_USD; здесь параметры известны — считаем
        estimateCost и сверяем баланс с ожидаемым СПИСАНИЕМ (себестоимость
        × BILLING_MARKUP). Только для режима 'balance' под принуждением
        (BYO/подписка баланса не требуют); сбой оценки — fail-open к порогу.
        Оценка передаётся и слоту (withGenerationSlot повторяет гейт). ── */
  const billingCtx = c.get("billing");
  let estimatedChargeUsd: number | undefined;
  if (billingCtx?.billingMode === "balance" && billingCtx.enforced) {
    try {
      const est = await estimateSynthesisCost(user.id, {
        seed,
        philosophers: allPhilosophers,
        conceptIds,
        sections,
        method,
        synthLevel,
        depth,
        generationOrder,
        extGraphMetrics: body.extGraphMetrics === true,
        context: typeof body.context === "string" ? body.context : "",
        lang: typeof body.lang === "string" && body.lang.trim() ? body.lang.trim() : "Russian",
        keepFullBudget: body.keepFullBudget === true,
        secCtx: sectionContexts,
      });
      estimatedChargeUsd = computeChargeUsd(est.cost);
    } catch (err) {
      console.warn("[syntheses] точная оценка гейта недоступна, порог по умолчанию:", err);
    }
    if (estimatedChargeUsd !== undefined) {
      try {
        await resolveBilling(user.id, {
          quota: "syntheses",
          estimatedCostUsd: estimatedChargeUsd,
          consume: false,
        });
      } catch (err) {
        if (err instanceof BillingError) {
          return c.json(
            {
              error: err.message,
              code: err.code,
              ...(err.details !== undefined
                ? { details: { ...err.details, estimatedChargeUsd } }
                : { details: { estimatedChargeUsd } }),
            },
            billingErrorStatus(err.code),
          );
        }
        throw err;
      }
    }
  }

  /* ── Предпроверки старта ДО создания строки ── */
  try {
    assertCanStartGeneration(user.id);
  } catch (err) {
    if (err instanceof GenerationError) {
      const status = err.code === "RATE_LIMIT" ? 429 : 400;
      return c.json({ error: err.message, code: err.code }, status);
    }
    throw err;
  }

  /* ── Создание записи + генеалогия ── */
  const [row] = await db
    .insert(syntheses)
    .values({
      userId: user.id,
      seed,
      method: method as (typeof syntheses.$inferInsert)["method"],
      synthLevel: synthLevel as (typeof syntheses.$inferInsert)["synthLevel"],
      depth: depth as (typeof syntheses.$inferInsert)["depth"],
      generationOrder:
        generationOrder as (typeof syntheses.$inferInsert)["generationOrder"],
      extGraphMetrics: body.extGraphMetrics === true,
      keepFullBudget: body.keepFullBudget === true,
      context: typeof body.context === "string" ? body.context : "",
      ...(typeof body.lang === "string" && body.lang.trim()
        ? { lang: body.lang.trim() }
        : {}),
      sectionOrder: ["sum", ...sections],
      // Пункт 4 запроса 1.6: doc_num по формату исходника [12110]
      docNum: makeDocNum(),
      // Пункт 6 запроса 1.6: снимок структуры документа при создании —
      // без него карточка «Структура документа устарела» (беседа 2.3)
      // всегда в ветке «актуальность не определена». Обновление снимка
      // после исполнения плана — беседа 2.2.
      structureSections: ["sum", ...sections],
      status: "generating",
    })
    .returning({ id: syntheses.id });
  const synthesisId = (row as { id: string }).id;

  // Генеалогия: философы, затем концепции (сквозные позиции) —
  // createLineageRecords (lineage-service, беседа 3.1)
  await createLineageRecords(synthesisId, [
    ...allPhilosophers.map((name) => ({
      type: "philosopher" as const,
      name,
    })),
    ...conceptIds.map((cid) => ({
      type: "synthesis" as const,
      synthesisId: cid,
    })),
  ]);

  /* ── Запуск генерации в фоне (§2.2: «Генерация начинается, клиент
        подключается по WebSocket») ── */
  void generateSynthesis(synthesisId, user.id, {
    sectionContexts,
    estimatedCostUsd: estimatedChargeUsd,
  }).catch(
    async (err) => {
      const message =
        err instanceof Error ? err.message : "Не удалось запустить генерацию";
      const code = err instanceof GenerationError ? err.code : "INTERNAL_ERROR";
      console.error(`[syntheses] generateSynthesis(${synthesisId}):`, err);
      // Пред-цикловый сбой: строка не должна висеть в 'generating'
      await db
        .update(syntheses)
        .set({ status: "error", updatedAt: new Date() })
        .where(eq(syntheses.id, synthesisId))
        .catch(() => {});
      connectionManager.sendToUser(user.id, {
        type: "stream_error",
        synthesisId,
        error: `${message} (${code})`,
        recoverable: false,
      });
    },
  );

  return c.json(
    {
      id: synthesisId,
      status: "generating" as const,
      // Беседа 3.1 (M3): неблокирующие предупреждения генеалогических
      // пересечений — аддитивно к контракту §2.2 (в патч доков)
      ...(genealogyWarnings.length > 0 ? { warnings: genealogyWarnings } : {}),
    },
    201,
  );
});

/* ── POST /syntheses/advice (беседа 1.5; Advisor v2 + Section Dependency
      Warnings, 01 §4.15 п.1–2) ─────────────────────────────────────────────
   Данные для панели совместимости и трёх боксов предупреждений формы:
   getCompatEntryByKey(`{level}:{method}`) + computeSectionAdvice (1.1).
   icon/title считаются здесь же (iconForSeverity/titleForSeverity —
   серверные экспорты 1.1; отдаются в ответе, чтобы клиент не зеркалил
   словари); CSS-классы чипов (chipClassForRating) — на клиенте, как
   зафиксировано в NEXT-CONTEXT (глава 1.1, «Беседа 1.5»).

   ДЫРА ДОКОВ (в один патч с /estimate): эндпоинта нет в 03 §2.2. */

synthesesRoutes.post("/advice", requireAuth, async (c) => {
  let body: PostBody;
  try {
    body = (await c.req.json()) as PostBody;
  } catch {
    return c.json({ error: "Невалидный JSON", code: "VALIDATION_ERROR" }, 400);
  }

  const details: Record<string, string> = {};
  const method = (body.method ?? "dialectical") as string;
  if (!METHODS.has(method)) details.method = "неизвестный метод";
  const synthLevel = (body.synthLevel ?? "comparative") as string;
  if (!SYNTH_LEVELS.has(synthLevel)) details.synthLevel = "неизвестный уровень";
  const generationOrder = (body.generationOrder ?? "architectural") as string;
  if (!GENERATION_ORDERS.has(generationOrder))
    details.generationOrder = "architectural | genetic";
  const knownSections = new Set(Object.keys(SEC_NAMES));
  const sections = isStrArray(body.sections)
    ? [...new Set(body.sections.filter((s) => s !== "sum"))]
    : null;
  if (sections === null || sections.some((s) => !knownSections.has(s))) {
    details.sections = "массив известных ключей разделов";
  }
  if (Object.keys(details).length > 0) {
    return c.json(
      { error: "Невалидные параметры", code: "VALIDATION_ERROR", details },
      400,
    );
  }

  try {
    const entry = await getCompatEntryByKey(`${synthLevel}:${method}`);
    const advice = await computeSectionAdvice({
      sections: sections as string[],
      method: method as SectionAdviceInput["method"],
      synthLevel: synthLevel as SectionAdviceInput["synthLevel"],
      generationOrder: generationOrder as SectionAdviceInput["generationOrder"],
    });
    return c.json({
      entry: entry
        ? {
            ...entry,
            icon: iconForSeverity(entry.severity),
            title: titleForSeverity(entry.severity),
          }
        : null,
      advice,
    });
  } catch (err) {
    console.warn("[syntheses] advice failed:", err);
    return c.json(
      { error: "Анализ совместимости недоступен", code: "INTERNAL_ERROR" },
      500,
    );
  }
});

/* ── Оценка стоимости по параметрам формы (беседа 1.5; вынесена 7.1) ──
   Общее ядро POST /estimate и точного гейта баланса POST /syntheses:
   зеркалит конвейер generation-service (resolveContextDeps →
   buildEffectiveDeps → buildDynamicOrder → buildSectionDefs → groupPasses →
   buildSYS/baseCtxStatic → estimateCost) без записей в БД. Недоступные
   концепции для оценки молча пропускаются (оценка — не гейт доступа). */

interface EstimateInput {
  seed: string;
  philosophers: string[];
  conceptIds: string[];
  sections: string[];
  method: string;
  synthLevel: string;
  depth: string;
  generationOrder: string;
  extGraphMetrics: boolean;
  context: string;
  lang: string;
  keepFullBudget: boolean;
  secCtx: Record<string, string> | undefined;
}

async function estimateSynthesisCost(
  userId: string,
  input: EstimateInput,
): Promise<Awaited<ReturnType<typeof estimateCost>>> {
  // Участники-концепции с полями (для веса родителей в оценке)
  const estimateConcepts = [];
  for (const cid of [...new Set(input.conceptIds)]) {
    const access = await loadSynthesisForRead(cid, userId);
    if (access.access !== "ok") continue; // см. комментарий выше
    if (!metaAllowedFor(access)) continue; // 8.6: недейственный allow_meta — молча, оценка не гейт
    try {
      estimateConcepts.push(await loadConceptContext(cid));
    } catch (err) {
      console.warn("[syntheses] estimate: loadConceptContext:", err);
    }
  }

  // Конвейер 1.1/1.2 — как runGenerationPasses [12078–12183], без БД-записей
  const p = {
    seed: input.seed,
    phil: input.philosophers,
    participants: [
      ...input.philosophers.map((name) => ({
        type: "philosopher" as const,
        name,
      })),
      ...estimateConcepts,
    ],
    isMetaSynthesis: estimateConcepts.length > 0,
    sec: input.sections,
    method: input.method as Parameters<typeof buildSectionDefs>[0]["method"],
    synthLevel:
      input.synthLevel as Parameters<typeof buildSectionDefs>[0]["synthLevel"],
    depth: input.depth as Parameters<typeof buildSectionDefs>[0]["depth"],
    generationOrder:
      input.generationOrder as Parameters<
        typeof buildSectionDefs
      >[0]["generationOrder"],
    extGraphMetrics: input.extGraphMetrics,
    ctx: input.context,
    lang: input.lang,
    keepFullBudget: input.keepFullBudget,
  };

  {
    const resolvedDeps = await resolveContextDeps(p);
    const effectiveDeps = await buildEffectiveDeps(
      p.sec,
      resolvedDeps,
      p.generationOrder,
    );
    const dynamicOrder = buildDynamicOrder(
      effectiveDeps,
      p.sec,
      resolvedDeps,
      p.generationOrder,
    );
    p.sec = dynamicOrder.filter((k) => k !== "sum");

    const baseDefs = await buildSectionDefs(p);
    patchPromptsWithSecCtx(baseDefs, input.secCtx);
    const defsMap = new Map(baseDefs.map((d) => [d.key, d]));
    const defs = dynamicOrder
      .map((key) => defsMap.get(key))
      .filter((d): d is NonNullable<typeof d> => d !== undefined);
    const passes = groupPasses(defs);

    const SYS = await buildSYS(p);
    // Ориентир 1.1: baseCtxStatic при концепциях-участниках, иначе полный
    // baseCtx (с 3.1 ветки различаются: родителей считает
    // parentOverheadForSection ниже, а не baseCtx)
    const baseStatic = hasConceptParticipants(p)
      ? await baseCtxStatic(p)
      : await baseCtx(p);

    // 3.1: вес родительского контекста по разделам (01 §4.13 ч. II) —
    // предвычисляем (estimateCost ждёт синхронный колбэк)
    const overheadBySection: Record<string, number> = {};
    if (estimateConcepts.length > 0) {
      for (const key of dynamicOrder) {
        overheadBySection[key] = await parentOverheadForSection(
          estimateConcepts,
          key,
          p.generationOrder,
          p.synthLevel,
          p.method,
        );
      }
    }

    const est = await estimateCost({
      params: {
        depth: p.depth,
        generationOrder: p.generationOrder,
        keepFullBudget: p.keepFullBudget,
      },
      passes: passes.map((pass) =>
        pass.map((d) => ({ key: d.key, prompt: d.prompt, title: d.title })),
      ),
      effectiveDeps,
      sysChars: SYS.length,
      baseStaticChars: baseStatic.length,
      parentOverheadForSection: (sectionKey) =>
        overheadBySection[normalizeSectionKey(sectionKey)] ?? 0,
    });

    return est;
  }
}

/* ── POST /syntheses/estimate (беседа 1.5; G3 «Оценка стоимости до
      генерации») ──────────────────────────────────────────────────────────
   Принимает те же параметры, что POST /syntheses, но НЕ создаёт записей и
   не запускает генерацию: зеркалит конвейер generation-service
   (resolveContextDeps → buildEffectiveDeps → buildDynamicOrder →
   buildSectionDefs → groupPasses → buildSYS/baseCtxStatic) и возвращает
   результат estimateCost. Потребитель — CostEstimate.tsx.

   ДЫРА ДОКОВ (закрыть патчем в завершение беседы 1.5): эндпоинта нет в
   03-spec §2.2, хотя требование G3 (§1.3) предписывает серверную оценку;
   протокол 07 (беседа 1.5, п. 5) допускает «estimateCost на сервере». */

synthesesRoutes.post("/estimate", requireAuth, async (c) => {
  const user = c.get("user");
  let body: PostBody;
  try {
    body = (await c.req.json()) as PostBody;
  } catch {
    return c.json({ error: "Невалидный JSON", code: "VALIDATION_ERROR" }, 400);
  }

  const details: Record<string, string> = {};

  const seed = typeof body.seed === "string" ? body.seed.trim() : "";
  const phil = isStrArray(body.philosophers)
    ? body.philosophers.map((s) => s.trim()).filter(Boolean)
    : [];
  // Участники-концепции принимаются (беседа 3.1) — данные для
  // estimate-diff FullBudgetPreview: клиент зовёт /estimate с концепциями
  // и без, разницу рисует беседа 3.2. Недоступные/несуществующие id для
  // оценки молча пропускаются (оценка — вспомогательная, не гейт).
  const participantPhilosophers: string[] = [];
  const estimateConceptIds: string[] = [];
  if (Array.isArray(body.participants)) {
    for (const p of body.participants as Array<Record<string, unknown>>) {
      if (p && p.type === "philosopher" && typeof p.name === "string") {
        participantPhilosophers.push(p.name.trim());
      } else if (
        p &&
        p.type === "synthesis" &&
        typeof p.synthesisId === "string" &&
        isUuid(p.synthesisId)
      ) {
        estimateConceptIds.push(p.synthesisId);
      }
    }
  }
  const allPhil = [
    ...new Set([...phil, ...participantPhilosophers.filter(Boolean)]),
  ];

  const knownSections = new Set(Object.keys(SEC_NAMES));
  let sections: string[] = [];
  if (isStrArray(body.sections)) {
    sections = [...new Set(body.sections.filter((s) => s !== "sum"))];
    if (sections.some((s) => !knownSections.has(s))) {
      details.sections = "неизвестные разделы";
    }
  } else {
    details.sections = "массив ключей разделов";
  }

  const method = (body.method ?? "dialectical") as string;
  if (!METHODS.has(method)) details.method = "неизвестный метод";
  const synthLevel = (body.synthLevel ?? "comparative") as string;
  if (!SYNTH_LEVELS.has(synthLevel)) details.synthLevel = "неизвестный уровень";
  const depth = (body.depth ?? "standard") as string;
  if (!DEPTHS.has(depth)) details.depth = "неизвестная глубина";
  const generationOrder = (body.generationOrder ?? "architectural") as string;
  if (!GENERATION_ORDERS.has(generationOrder))
    details.generationOrder = "architectural | genetic";

  if (Object.keys(details).length > 0) {
    return c.json(
      { error: "Невалидные параметры оценки", code: "VALIDATION_ERROR", details },
      400,
    );
  }

  const secCtx =
    body.sectionContexts &&
    typeof body.sectionContexts === "object" &&
    !Array.isArray(body.sectionContexts)
      ? (body.sectionContexts as Record<string, string>)
      : undefined;

  try {
    const est = await estimateSynthesisCost(user.id, {
      seed,
      philosophers: allPhil,
      conceptIds: estimateConceptIds,
      sections,
      method,
      synthLevel,
      depth,
      generationOrder,
      extGraphMetrics: body.extGraphMetrics === true,
      context: typeof body.context === "string" ? body.context : "",
      lang: typeof body.lang === "string" && body.lang.trim() ? body.lang : "Russian",
      keepFullBudget: body.keepFullBudget === true,
      secCtx,
    });
    return c.json({ estimate: est });
  } catch (err) {
    // Оценка — вспомогательная: сбой Registry/конфигов не должен ронять форму
    console.warn("[syntheses] estimate failed:", err);
    return c.json(
      { error: "Оценка стоимости недоступна", code: "INTERNAL_ERROR" },
      500,
    );
  }
});

/* ═══ Беседа 1.6: транспорт чтения (03 §2.2) ═══════════════════════════
   Порядок регистрации важен: GET /public — ДО GET /:id (оба матчат
   GET /syntheses/public; Hono отдаёт приоритет более раннему). */

const SORT_COLUMNS = {
  createdAt: syntheses.createdAt,
  updatedAt: syntheses.updatedAt,
  title: syntheses.title,
  method: syntheses.method,
  status: syntheses.status,
} as const;
type SortKey = keyof typeof SORT_COLUMNS;

/** Общий разбор query-параметров списков (страница/лимит/сортировка). */
function parseListQuery(q: Record<string, string | undefined>): {
  page: number;
  limit: number;
  sortKey: SortKey;
  orderDesc: boolean;
} {
  const pageRaw = Number.parseInt(q.page ?? "1", 10);
  const limitRaw = Number.parseInt(q.limit ?? "20", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const limit =
    Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(limitRaw, 100) : 20;
  const sortKey: SortKey =
    q.sort && q.sort in SORT_COLUMNS ? (q.sort as SortKey) : "createdAt";
  const orderDesc = (q.order ?? "desc") !== "asc";
  return { page, limit, sortKey, orderDesc };
}

/* ── GET /syntheses — список своих (C1) ──────────────────────────────── */

synthesesRoutes.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const q = c.req.query();
  const { page, limit, sortKey, orderDesc } = parseListQuery(q);

  const conds = [eq(syntheses.userId, user.id)];
  if (q.status) {
    if (
      !["draft", "generating", "paused", "ready", "error"].includes(q.status)
    ) {
      return c.json(
        {
          error: "Невалидные параметры",
          code: "VALIDATION_ERROR",
          details: { status: "draft|generating|paused|ready|error" },
        },
        400,
      );
    }
    conds.push(eq(syntheses.status, q.status as SynthesisRow["status"]));
  }
  if (q.method) {
    if (!METHODS.has(q.method)) {
      return c.json(
        {
          error: "Невалидные параметры",
          code: "VALIDATION_ERROR",
          details: { method: "неизвестный метод" },
        },
        400,
      );
    }
    conds.push(eq(syntheses.method, q.method as SynthesisRow["method"]));
  }
  if (q.search) {
    // Поиск серверный (решение аудита 2026-07-30): частичное совпадение
    // title; в схеме под это gin_trgm_ops (ILIKE '%…%' использует индекс)
    conds.push(ilike(syntheses.title, `%${q.search}%`));
  }
  const where = and(...conds);

  const sortCol = SORT_COLUMNS[sortKey];
  const rows = await db
    .select()
    .from(syntheses)
    .where(where)
    .orderBy(orderDesc ? desc(sortCol) : asc(sortCol))
    .limit(limit)
    .offset((page - 1) * limit);
  const [totalRow] = await db
    .select({ value: count() })
    .from(syntheses)
    .where(where);
  const total = Number(totalRow?.value ?? 0);

  const ids = rows.map((r) => r.id);
  const philMap = await loadPhilosophersFor(ids);
  const metaFlags = await loadConceptParentFlags(ids); // беседа 3.2
  const authors = await loadAuthorNamesFor(rows); // 8.6
  const items = rows.map((r) =>
    toPreview(r, philMap.get(r.id) ?? [], metaFlags.has(r.id), authors.get(r.id)),
  );
  return c.json({ items, total });
});

/* ── GET /syntheses/public — публичный каталог (C2) ──────────────────── */
/* 8.6: гостевой путь (optionalAuth) — сортировка и фильтры те же, для
 * гостя поля урезаны projectPreview (без totalCostUsd). Каталог = все
 * неприватные ступени: витрина тоже в списке (капсула и метаданные —
 * её смысл), содержание закрыто GET /:id. Регистрируется ДО /:id. */

synthesesRoutes.get("/public", optionalAuth, async (c) => {
  const viewerUser = viewerOf(c);
  const viewer: SynthesisViewer = viewerUser ? "user" : "guest";
  const q = c.req.query();
  const { page, limit, sortKey, orderDesc } = parseListQuery(q);

  const conds = [ne(syntheses.visibility, "private")];
  if (q.search) conds.push(ilike(syntheses.title, `%${q.search}%`));
  if (q.philosopher) {
    // Точное имя философа в генеалогии (как в §2.8 lineage/search)
    conds.push(
      exists(
        db
          .select({ one: synthesisLineage.id })
          .from(synthesisLineage)
          .where(
            and(
              eq(synthesisLineage.synthesisId, syntheses.id),
              eq(synthesisLineage.parentType, "philosopher"),
              eq(synthesisLineage.parentName, q.philosopher),
            ),
          ),
      ),
    );
  }
  const where = and(...conds);

  const sortCol = SORT_COLUMNS[sortKey];
  const rows = await db
    .select()
    .from(syntheses)
    .where(where)
    .orderBy(orderDesc ? desc(sortCol) : asc(sortCol))
    .limit(limit)
    .offset((page - 1) * limit);
  const [totalRow] = await db
    .select({ value: count() })
    .from(syntheses)
    .where(where);
  const total = Number(totalRow?.value ?? 0);

  const ids = rows.map((r) => r.id);
  const philMap = await loadPhilosophersFor(ids);
  const metaFlags = await loadConceptParentFlags(ids); // беседа 3.2
  const authors = await loadAuthorNamesFor(rows); // 8.6
  const items = rows.map((r) =>
    projectPreview(
      toPreview(r, philMap.get(r.id) ?? [], metaFlags.has(r.id), authors.get(r.id)),
      viewer,
    ),
  );
  return c.json({ items, total });
});

/* ── GET /syntheses/:id — SynthesisFull по смотрящему (8.6 п.3–5) ─────── */
/* Гостевой путь (optionalAuth): владелец — всё; чужой зарегистрированный —
 * по ступени (витрина без разделов, стоимость видна); гость — без
 * стоимости/токенов/паузы, при 'full' с телами разделов одним ответом. */

synthesesRoutes.get("/:id", optionalAuth, async (c) => {
  const viewerUser = viewerOf(c);
  const res = await loadSynthesisForRead(
    c.req.param("id"),
    viewerUser?.id ?? null,
  );
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  return c.json({
    synthesis: await respondSynthesisFull(res, viewerUser?.id ?? null),
  });
});

/* ── PATCH /syntheses/:id { title?, extGraphMetrics?, visibility?,
 *    showAuthor?, showLogs?, showPrompts?, allowMeta? } (8.6 п.9) ────── */
/* Только владелец. visibility вне перечисления → 400 с details.visibility.
 * Флаг, присланный вместе с витриной, ПРИНИМАЕТСЯ и хранится (порядок
 * правки не важен; действенность решает effectiveFlags при чтении).
 * isPublic (синоним 8.6) с 8.7 не принимается — 400 с details.isPublic:
 * клиент шлёт visibility; молчаливый no-op спрятал бы ошибку старого клиента.
 * extGraphMetrics добавлен беседой 2.3: чекбокс «Расширенные
 * характеристики» на карточке графа в EditModal пишет тот же флаг, что
 * читает перегенерация (исходник писал DOC_STATE.params напрямую [18475]). */

synthesesRoutes.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!isUuid(id)) return c.json(notFoundJson, 404);

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Невалидный JSON", code: "VALIDATION_ERROR" }, 400);
  }

  const details: Record<string, string> = {};
  const patch: Partial<typeof syntheses.$inferInsert> = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      details.title = "непустая строка";
    } else if (body.title.trim().length > 300) {
      details.title = "не длиннее 300 символов";
    } else {
      patch.title = body.title.trim();
    }
  }
  if (body.visibility !== undefined) {
    if (
      typeof body.visibility !== "string" ||
      !(SYNTHESIS_VISIBILITIES as readonly string[]).includes(body.visibility)
    ) {
      details.visibility = "private | showcase | full";
    } else {
      patch.visibility = body.visibility as SynthesisVisibility;
    }
  }
  if (body.isPublic !== undefined) {
    // 8.7: синоним 8.6 снят — старому клиенту ясный ответ, не молчаливый no-op
    details.isPublic = "снят в 8.7 — используйте visibility";
  }
  for (const flag of ["showAuthor", "showLogs", "showPrompts", "allowMeta"] as const) {
    if (body[flag] === undefined) continue;
    if (typeof body[flag] !== "boolean") details[flag] = "boolean";
    else patch[flag] = body[flag] as boolean;
  }
  if (body.extGraphMetrics !== undefined) {
    if (typeof body.extGraphMetrics !== "boolean")
      details.extGraphMetrics = "boolean";
    else patch.extGraphMetrics = body.extGraphMetrics;
  }
  if (Object.keys(details).length > 0) {
    return c.json(
      { error: "Невалидные параметры", code: "VALIDATION_ERROR", details },
      400,
    );
  }
  if (Object.keys(patch).length === 0) {
    return c.json(
      {
        error:
          "Нужно хотя бы одно из полей title, extGraphMetrics, visibility, showAuthor, showLogs, showPrompts, allowMeta",
        code: "VALIDATION_ERROR",
        details: {
          body: "title? | extGraphMetrics? | visibility? | showAuthor? | showLogs? | showPrompts? | allowMeta?",
        },
      },
      400,
    );
  }

  const [row] = await db
    .select()
    .from(syntheses)
    .where(eq(syntheses.id, id))
    .limit(1);
  if (!row) return c.json(notFoundJson, 404);
  if (row.userId !== user.id) return c.json(forbiddenJson, 403);

  const [updated] = await db
    .update(syntheses)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(syntheses.id, id))
    .returning();
  const urow = updated as SynthesisRow;
  return c.json({
    synthesis: await respondSynthesisFull(
      { access: "ok", row: urow, viewer: "owner", scope: "full" },
      user.id,
    ),
  });
});

/* ── DELETE /syntheses/:id — только владелец ─────────────────────────── */

synthesesRoutes.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!isUuid(id)) return c.json(notFoundJson, 404);

  const [row] = await db
    .select({ userId: syntheses.userId })
    .from(syntheses)
    .where(eq(syntheses.id, id))
    .limit(1);
  if (!row) return c.json(notFoundJson, 404);
  if (row.userId !== user.id) return c.json(forbiddenJson, 403);

  // Активную генерацию копить в удалённой строке нельзя
  if (isGenerationActive(id)) {
    return c.json(
      {
        error: "Генерация ещё идёт — остановите её перед удалением",
        code: "GENERATION_IN_PROGRESS",
      },
      409,
    );
  }

  await db.delete(syntheses).where(eq(syntheses.id, id));
  // CASCADE снимает sections/элементы/логи/lineage; parent_synthesis_id
  // у потомков — SET NULL (схема 02 §2.4)
  return c.json({ ok: true });
});

/* ── POST /syntheses/:id/duplicate (пункт 7 запроса 1.6; 03 §2.2) ────── */

synthesesRoutes.post("/:id/duplicate", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!isUuid(id)) return c.json(notFoundJson, 404);

  const [row] = await db
    .select()
    .from(syntheses)
    .where(eq(syntheses.id, id))
    .limit(1);
  if (!row) return c.json(notFoundJson, 404);
  // Решение беседы: duplicate — только владелец (как PATCH/DELETE);
  // «форк» чужого публичного синтеза протоколом не оговорён.
  if (row.userId !== user.id) return c.json(forbiddenJson, 403);
  if (row.status === "generating" || isGenerationActive(id)) {
    return c.json(
      {
        error: "Синтез ещё генерируется — дождитесь завершения",
        code: "GENERATION_IN_PROGRESS",
      },
      409,
    );
  }

  const newId = await db.transaction(async (tx) => {
    /* Копия строки syntheses: новый doc_num, title += « (копия)»,
       visibility = 'private' (пункт 7 1.6; 8.6: флаги публичности —
       дефолты схемы, а не копия). Контент и статистика копируются;
       pausedState копируется (genParams не привязаны к id — resume
       у копии работоспособен). Логи generation_log/context_log НЕ
       копируются: это история генерации оригинала, а не контент. */
    const [inserted] = await tx
      .insert(syntheses)
      .values({
        userId: user.id,
        seed: row.seed,
        method: row.method,
        synthLevel: row.synthLevel,
        depth: row.depth,
        generationOrder: row.generationOrder,
        extGraphMetrics: row.extGraphMetrics,
        keepFullBudget: row.keepFullBudget,
        context: row.context,
        lang: row.lang,
        title: `${row.title} (копия)`,
        docNum: makeDocNum(),
        status: row.status,
        visibility: "private",
        sectionOrder: row.sectionOrder,
        structureSections: row.structureSections ?? null,
        parentContextSchema: row.parentContextSchema,
        pausedState: (row.pausedState ?? null) as PausedState | null,
        versionBase: row.versionBase,
        versionSub: row.versionSub,
        versionModes: row.versionModes,
        versionModeRegen: row.versionModeRegen,
        capsuleHtml: row.capsuleHtml,
        totalInputTokens: row.totalInputTokens,
        totalOutputTokens: row.totalOutputTokens,
        totalCostUsd: row.totalCostUsd,
      })
      .returning({ id: syntheses.id });
    const copyId = (inserted as { id: string }).id;

    /* Генеалогия: копируются РОДИТЕЛИ оригинала (философы и концепции) —
       у копии та же генеалогия содержания. Связь «копия → оригинал» НЕ
       создаётся: это копия, а не потомок (пункт 7). */
    const lineageRows = await tx
      .select()
      .from(synthesisLineage)
      .where(eq(synthesisLineage.synthesisId, id))
      .orderBy(asc(synthesisLineage.position));
    if (lineageRows.length > 0) {
      await tx.insert(synthesisLineage).values(
        lineageRows.map((r) => ({
          synthesisId: copyId,
          parentType: r.parentType,
          parentName: r.parentName,
          parentSynthesisId: r.parentSynthesisId,
          position: r.position,
        })),
      );
    }

    /* Разделы */
    const sectionRows = await tx
      .select()
      .from(sections)
      .where(eq(sections.synthesisId, id));
    if (sectionRows.length > 0) {
      await tx.insert(sections).values(
        sectionRows.map((s) => ({
          synthesisId: copyId,
          key: s.key,
          sectionNum: s.sectionNum,
          title: s.title,
          htmlContent: s.htmlContent,
          secContext: s.secContext,
          isEdited: s.isEdited,
        })),
      );
    }

    /* Категории — с ремапом id для рёбер (returning сохраняет порядок
       values, маппинг старый id → новый по индексу) */
    const catRows = await tx
      .select()
      .from(categories)
      .where(eq(categories.synthesisId, id))
      .orderBy(asc(categories.position));
    const idMap = new Map<string, string>();
    if (catRows.length > 0) {
      const insertedCats = await tx
        .insert(categories)
        .values(
          catRows.map((cat) => ({
            synthesisId: copyId,
            name: cat.name,
            type: cat.type,
            definition: cat.definition,
            centrality: cat.centrality,
            certainty: cat.certainty,
            historicalSignificance: cat.historicalSignificance,
            innovationDegree: cat.innovationDegree,
            clarity: cat.clarity,
            breadth: cat.breadth,
            depthScore: cat.depthScore,
            applicability: cat.applicability,
            typeCatalogId: cat.typeCatalogId,
            origin: cat.origin,
            clusterIndices: cat.clusterIndices,
            structuralRoles: cat.structuralRoles,
            proceduralRoles: cat.proceduralRoles,
            hasReflexive: cat.hasReflexive,
            position: cat.position,
            source: cat.source,
          })),
        )
        .returning({ id: categories.id });
      insertedCats.forEach((ins, i) => {
        idMap.set((catRows[i] as { id: string }).id, ins.id);
      });
    }

    /* Рёбра (только те, чьи концы отремаплены) */
    const edgeRows = await tx
      .select()
      .from(categoryEdges)
      .where(eq(categoryEdges.synthesisId, id))
      .orderBy(asc(categoryEdges.position));
    const remapped = edgeRows
      .filter((e) => idMap.has(e.sourceId) && idMap.has(e.targetId))
      .map((e) => ({
        synthesisId: copyId,
        sourceId: idMap.get(e.sourceId) as string,
        targetId: idMap.get(e.targetId) as string,
        description: e.description,
        edgeType: e.edgeType,
        direction: e.direction,
        strength: e.strength,
        certainty: e.certainty,
        historicalSupport: e.historicalSupport,
        logicalNecessity: e.logicalNecessity,
        innovationDegree: e.innovationDegree,
        contextDependency: e.contextDependency,
        typeCatalogId: e.typeCatalogId,
        position: e.position,
        sourceOrigin: e.sourceOrigin,
      }));
    if (remapped.length > 0) await tx.insert(categoryEdges).values(remapped);

    /* Кластеры, тезисы, глоссарий, диалог */
    const clusterRows = await tx
      .select()
      .from(clusterLabels)
      .where(eq(clusterLabels.synthesisId, id));
    if (clusterRows.length > 0) {
      await tx.insert(clusterLabels).values(
        clusterRows.map((cl) => ({
          synthesisId: copyId,
          clusterIndex: cl.clusterIndex,
          label: cl.label,
        })),
      );
    }
    const thesisRows = await tx
      .select()
      .from(theses)
      .where(eq(theses.synthesisId, id));
    if (thesisRows.length > 0) {
      await tx.insert(theses).values(
        thesisRows.map((t) => ({
          synthesisId: copyId,
          thesisNum: t.thesisNum,
          formulation: t.formulation,
          justification: t.justification,
          thesisType: t.thesisType,
          noveltyDegree: t.noveltyDegree,
          relatedCategories: t.relatedCategories,
          source: t.source,
        })),
      );
    }
    const termRows = await tx
      .select()
      .from(glossaryTerms)
      .where(eq(glossaryTerms.synthesisId, id));
    if (termRows.length > 0) {
      await tx.insert(glossaryTerms).values(
        termRows.map((g) => ({
          synthesisId: copyId,
          term: g.term,
          definition: g.definition,
          extraColumns: g.extraColumns,
          termCategory: g.termCategory,
          source: g.source,
          position: g.position,
        })),
      );
    }
    const turnRows = await tx
      .select()
      .from(dialogueTurns)
      .where(eq(dialogueTurns.synthesisId, id));
    if (turnRows.length > 0) {
      await tx.insert(dialogueTurns).values(
        turnRows.map((d) => ({
          synthesisId: copyId,
          partNumber: d.partNumber,
          turnNumber: d.turnNumber,
          speaker: d.speaker,
          content: d.content,
          newConcepts: d.newConcepts,
        })),
      );
    }

    return copyId;
  });

  return c.json({ id: newId }, 201);
});
