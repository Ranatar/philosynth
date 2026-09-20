/**
 * Роуты разделов (беседа 1.6; 03-spec §2.3). Модуль числился в 05, но до
 * аудита 2026-07-30 не создавался ни одной беседой.
 *
 *   GET /syntheses/:id/sections            → { sections: SectionSummary[] }
 *   GET /syntheses/:id/sections/:key       → { section: SectionFull }
 *   GET /syntheses/:id/sections/:key/context → SectionContextPreview
 *   GET   /syntheses/:id/sections/:key/subsections/:name → SubsectionSource (9.2)
 *   PATCH /syntheses/:id/sections/:key/subsections/:name { html }        (9.2)
 *
 * Беседа 9.2 — ручная правка. ЕДИНИЦА ПРАВКИ — ПОДРАЗДЕЛ: маршрута на тело
 * раздела целиком здесь НЕТ и заводить его нельзя. Разметка раздела несущая:
 * по data-section подраздел находят перегенерация (2.2), планы с адресом
 * «sectionKey:subsectionName» (2.1), сборка контекста, врезка таблиц (5.1),
 * импорт и экспорт (4.2/4.3); правка тела позволила бы переименовать или
 * удалить подраздел — и всё это перестало бы его находить молча и не сразу.
 *
 * Решения (аудит 2026-07-30 + беседа 1.6):
 *  - Доступ на чтение — владелец ИЛИ неприватная ступень (8.6: visibility; витрина → 403 на содержание) (loadSynthesisForRead из
 *    routes/syntheses.ts); 403 FORBIDDEN / 404 NOT_FOUND по §4.3.
 *  - Список — в порядке sectionOrder; ключи вне sectionOrder (не должно
 *    случаться, страховка) — в хвосте по sectionNum.
 *  - contextQualityScore: заполняется getSectionContextQualityMap
 *    (context-quality.ts, беседа 2.4 — TODO(2.4) закрыт); null — по
 *    разделу нет записей context_log (например, импорт).
 *  - subsections — имена data-section внутри HTML. Заполняются через
 *    parseSubsectionsFromHTML (1.4); та требует expected-список, а
 *    buildSubsectionMap тянет Registry+params — TOC (1.6b) нужны
 *    ФАКТИЧЕСКИЕ якоря, поэтому expected выводится из самого HTML
 *    (уникальные имена в порядке появления). НЕТОЧНОСТЬ 07: функция
 *    числится в context-extractor, живёт в generation-service (1.4) —
 *    в патч доков на завершение беседы.
 *  - /:key/context — живой расчёт buildContextForSection (1.3): 03 §2.3
 *    требует contextText («какой контекст БУДЕТ использован»), которого
 *    в context_log нет; формулировка 07 «последняя запись context_log»
 *    неточна — CtxLogDraft билдера и есть источник этих полей (в патч
 *    доков). Беседа 3.1: participants наполняются концепциями-родителями
 *    (loadConceptParticipants) — превью учитывает давление их веса на
 *    бюджет, как и живая генерация.
 */
import { Hono } from "hono";

import { and, asc, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { sections, synthesisLineage } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import { parseSubsectionsFromHTML } from "../services/generation-service.js";
import { getSectionContextQualityMap } from "../services/context-quality.js";
import { loadConceptParticipants } from "../services/meta-synthesis-service.js";
import { buildContextForSection } from "../services/context-builder.js";
import {
  buildEffectiveDeps,
  resolveContextDeps,
} from "../services/synthesis-engine.js";
import { SEC_NAMES } from "../services/section-defs-builder.js";
import { isSectionKey } from "@philosynth/shared/constants/section-labels";
import {
  SubsectionEditError,
  getSubsectionSource,
  lockedSubsectionNames,
  updateSubsection,
} from "../services/element-editor.js";
import { ownerEditGate } from "./elements.js";
import {
  forbiddenJson,
  loadSynthesisForRead,
  notFoundJson,
  showcaseForbiddenJson,
} from "./syntheses.js";

import type { Context } from "hono";
import type {
  SectionContextPreview,
  SectionFull,
  SectionSummary,
  SubsectionSource,
  SubsectionUpdateResult,
} from "@philosynth/shared/types/section";

export const sectionsRoutes = new Hono<AuthEnv>();

/** Имена data-section из HTML — фактические якоря второго уровня. */
function listSubsections(html: string): string[] {
  if (!html) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  const rx = /data-section="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const name = m[1] as string;
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  // Прогон через порт 1.4 (решение аудита: «subsections заполняются
  // parseSubsectionsFromHTML») — канонизация порядка/статусов едина
  // с трекингом генерации
  return parseSubsectionsFromHTML(html, names).map((s) => s.name);
}

type SectionRow = typeof sections.$inferSelect;

/** Порядок sectionOrder; неизвестные ключи — в хвост по sectionNum. */
function sortBySectionOrder(
  rows: SectionRow[],
  order: string[],
): SectionRow[] {
  const idx = new Map(order.map((k, i) => [k, i]));
  return [...rows].sort((a, b) => {
    const ai = idx.has(a.key) ? (idx.get(a.key) as number) : Infinity;
    const bi = idx.has(b.key) ? (idx.get(b.key) as number) : Infinity;
    if (ai !== bi) return ai - bi;
    return a.sectionNum - b.sectionNum;
  });
}

/* ── GET /:id/sections ───────────────────────────────────────────────── */

sectionsRoutes.get("/:id/sections", requireAuth, async (c) => {
  const user = c.get("user");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  // 8.6: витрина невладельцу содержания не отдаёт (scope из loadSynthesisForRead)
  if (res.scope === "showcase") return c.json(showcaseForbiddenJson, 403);

  const rows = await db
    .select()
    .from(sections)
    .where(eq(sections.synthesisId, res.row.id));
  const ordered = sortBySectionOrder(rows, res.row.sectionOrder);

  // Беседа 2.4: TODO(2.4) закрыт — качество контекста одной выборкой
  const quality = await getSectionContextQualityMap(res.row.id);
  const list: SectionSummary[] = ordered.map((s) => ({
    key: s.key,
    sectionNum: s.sectionNum,
    title: s.title,
    isEdited: s.isEdited,
    htmlChars: s.htmlContent.length,
    contextQualityScore: quality.get(s.key)?.score ?? null,
    subsections: listSubsections(s.htmlContent),
    updatedAt: s.updatedAt.toISOString(),
  }));
  return c.json({ sections: list });
});

/* ── GET /:id/sections/:key ──────────────────────────────────────────── */

sectionsRoutes.get("/:id/sections/:key", requireAuth, async (c) => {
  const user = c.get("user");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  // 8.6: витрина невладельцу содержания не отдаёт (scope из loadSynthesisForRead)
  if (res.scope === "showcase") return c.json(showcaseForbiddenJson, 403);

  const key = c.req.param("key");
  const [row] = await db
    .select()
    .from(sections)
    .where(and(eq(sections.synthesisId, res.row.id), eq(sections.key, key)))
    .limit(1);
  if (!row) {
    return c.json({ error: "Раздел не найден", code: "NOT_FOUND" }, 404);
  }

  const section: SectionFull = {
    key: row.key,
    sectionNum: row.sectionNum,
    title: row.title,
    htmlContent: row.htmlContent,
    secContext: row.secContext,
    isEdited: row.isEdited,
    subsections: listSubsections(row.htmlContent),
    // 9.2: вычисляемый заслон — клиент не рисует карандаш у запертых
    lockedSubsections: lockedSubsectionNames(row.key, row.htmlContent),
  };
  return c.json({ section });
});

/* ── Ручная правка подраздела (беседа 9.2) ───────────────────────────── */

/** Ошибки правки подраздела → JSON 03 §4.3; прочее — наверх (500). */
function subsectionError(c: Context, err: unknown): Response {
  if (err instanceof SubsectionEditError) {
    const status =
      err.code === "NOT_FOUND" ? 404 : err.code === "SECTION_TABLE_LOCKED" ? 409 : 400;
    return c.json(
      { error: err.message, code: err.code, ...(err.details ? { details: err.details } : {}) },
      status,
    );
  }
  throw err;
}

// Ключ — по isSectionKey (shared), НЕ по SEC_NAMES: в SEC_NAMES нет «sum»
// (это перечень ВЫБИРАЕМЫХ разделов), а резюме правится наравне с прочими —
// найдено тестом R2 беседы 9.2 на первом же подразделе
const unknownSectionJson = { error: "Неизвестный раздел", code: "NOT_FOUND" } as const;

/** Исходник правки: разметка содержимого подраздела без обёртки и <h4>. */
sectionsRoutes.get("/:id/sections/:key/subsections/:name", requireAuth, async (c) => {
  const user = c.get("user");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  if (res.scope === "showcase") return c.json(showcaseForbiddenJson, 403);
  const key = c.req.param("key");
  if (!isSectionKey(key)) return c.json(unknownSectionJson, 404);
  try {
    const source: SubsectionSource = await getSubsectionSource(
      res.row.id,
      key,
      c.req.param("name"),
    );
    return c.json(source);
  } catch (err) {
    return subsectionError(c, err);
  }
});

/** Правка СОДЕРЖИМОГО подраздела. Только владелец, не под активной операцией. */
sectionsRoutes.patch("/:id/sections/:key/subsections/:name", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const gate = await ownerEditGate(c, id, user.id);
  if (gate) return gate;
  const key = c.req.param("key");
  if (!isSectionKey(key)) return c.json(unknownSectionJson, 404);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = undefined;
  }
  const html =
    body && typeof body === "object" ? (body as { html?: unknown }).html : undefined;
  try {
    const r = await updateSubsection(id, key, c.req.param("name"), html);
    const result: SubsectionUpdateResult = {
      changed: r.changed,
      version: r.version,
      warnings: r.warnings,
      section: {
        key: r.sectionKey,
        htmlContent: r.htmlContent,
        isEdited: r.changed ? true : undefined,
        subsections: listSubsections(r.htmlContent),
        lockedSubsections: lockedSubsectionNames(r.sectionKey, r.htmlContent),
      },
    };
    return c.json(result);
  } catch (err) {
    return subsectionError(c, err);
  }
});

/* ── GET /:id/sections/:key/context — отладочный превью контекста ────── */

sectionsRoutes.get("/:id/sections/:key/context", requireAuth, async (c) => {
  const user = c.get("user");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  // 8.6: витрина невладельцу содержания не отдаёт (scope из loadSynthesisForRead)
  if (res.scope === "showcase") return c.json(showcaseForbiddenJson, 403);
  const row = res.row;

  const key = c.req.param("key");
  if (!(key in SEC_NAMES)) {
    return c.json({ error: "Неизвестный раздел", code: "NOT_FOUND" }, 404);
  }

  try {
    // Параметры p — из строки синтеза (как /estimate); философы — из
    // генеалогии; sec — sectionOrder без sum (контракт resolveContextDeps)
    const phil = (
      await db
        .select({ parentName: synthesisLineage.parentName })
        .from(synthesisLineage)
        .where(eq(synthesisLineage.synthesisId, row.id))
        .orderBy(asc(synthesisLineage.position))
    )
      .map((r) => r.parentName)
      .filter((n): n is string => !!n);

    const p = {
      seed: row.seed,
      phil,
      participants: phil.map((name) => ({
        type: "philosopher" as const,
        name,
      })),
      sec: row.sectionOrder.filter((k) => k !== "sum"),
      method: row.method,
      synthLevel: row.synthLevel,
      depth: row.depth,
      generationOrder: row.generationOrder,
      extGraphMetrics: row.extGraphMetrics,
      ctx: row.context,
      lang: row.lang,
      keepFullBudget: row.keepFullBudget,
    };

    const resolvedDeps = await resolveContextDeps(p);
    const effectiveDeps = await buildEffectiveDeps(
      p.sec,
      resolvedDeps,
      p.generationOrder,
    );
    // 3.1: давление родителей на бюджет — как в живой генерации
    const conceptParticipants = await loadConceptParticipants(row.id);
    const { text, ctxLog } = await buildContextForSection(
      key,
      row.id,
      row.depth,
      effectiveDeps,
      resolvedDeps,
      { participants: conceptParticipants },
    );

    const preview: SectionContextPreview = ctxLog
      ? {
          contextText: text,
          budget: ctxLog.budget,
          rawBaseBudget: ctxLog.rawBaseBudget,
          totalUsed: ctxLog.totalUsed,
          budgetMode: ctxLog.budgetMode,
          parentOverhead: ctxLog.parentOverhead,
          parentSpec: ctxLog.parentSpec,
          reqFound: ctxLog.reqFound,
          reqTotal: ctxLog.reqTotal,
          optIncluded: ctxLog.optIncluded,
          optTotal: ctxLog.optTotal,
          entries: ctxLog.entries,
        }
      : {
          // Раздел без записи в картах зависимостей: контекста нет
          contextText: "",
          budget: 0,
          rawBaseBudget: 0,
          totalUsed: 0,
          budgetMode: "shrink",
          parentOverhead: 0,
          parentSpec: null,
          reqFound: 0,
          reqTotal: 0,
          optIncluded: 0,
          optTotal: 0,
          entries: [],
        };
    return c.json(preview);
  } catch (err) {
    console.warn("[sections] context preview failed:", err);
    return c.json(
      { error: "Превью контекста недоступно", code: "INTERNAL_ERROR" },
      500,
    );
  }
});
