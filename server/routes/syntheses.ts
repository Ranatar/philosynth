/**
 * Роуты /syntheses (беседа 1.4, запрос 2; 03-spec §2.2).
 *
 * Пока ТОЛЬКО POST /syntheses: принимает параметры §2.2, валидирует,
 * создаёт запись syntheses + генеалогию synthesis_lineage (философы),
 * запускает генерацию В ФОНЕ и отвечает { id, status: "generating" } —
 * клиент подключается по WebSocket (subscribe_generation привяжет стрим,
 * но дельты и так идут по userId через connection-manager).
 *
 * Остальные роуты §2.2 (GET-списки, GET/:id, PATCH, DELETE, duplicate,
 * import) — будущие беседы (1.6 каталог/просмотр, 4.3 импорт).
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
import { syntheses, synthesisLineage } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import {
  assertCanStartGeneration,
  generateSynthesis,
  GenerationError,
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
import { eq } from "drizzle-orm";

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

export const synthesesRoutes = new Hono<AuthEnv>();

synthesesRoutes.post("/", requireAuth, async (c) => {
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

  // v11: participants (мета-синтез). Тип "synthesis" — беседа 3.1.
  let participantPhilosophers: string[] = [];
  if (body.participants !== undefined) {
    if (!Array.isArray(body.participants)) {
      details.participants = "массив ParticipantInput";
    } else {
      for (const p of body.participants as Array<Record<string, unknown>>) {
        if (p && p.type === "philosopher" && typeof p.name === "string") {
          participantPhilosophers.push(p.name.trim());
        } else if (p && p.type === "synthesis") {
          details.participants =
            "участники типа synthesis (мета-синтез) — ещё не поддерживаются (беседа 3.1)";
          break;
        } else {
          details.participants = "элементы {type:'philosopher', name}";
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
  if (allPhilosophers.length === 0 && !seed) {
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
      status: "generating",
    })
    .returning({ id: syntheses.id });
  const synthesisId = (row as { id: string }).id;

  if (allPhilosophers.length > 0) {
    await db.insert(synthesisLineage).values(
      allPhilosophers.map((name, position) => ({
        synthesisId,
        parentType: "philosopher" as const,
        parentName: name,
        position,
      })),
    );
  }

  /* ── Запуск генерации в фоне (§2.2: «Генерация начинается, клиент
        подключается по WebSocket») ── */
  void generateSynthesis(synthesisId, user.id, { sectionContexts }).catch(
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

  return c.json({ id: synthesisId, status: "generating" as const }, 201);
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
  // Участники-концепции — беседа 3.1; для оценки принимаем только философов
  const participantPhilosophers: string[] = [];
  if (Array.isArray(body.participants)) {
    for (const p of body.participants as Array<Record<string, unknown>>) {
      if (p && p.type === "philosopher" && typeof p.name === "string") {
        participantPhilosophers.push(p.name.trim());
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

  // Конвейер 1.1/1.2 — как runGenerationPasses [12078–12183], без БД-записей
  const p = {
    seed,
    phil: allPhil,
    participants: allPhil.map((name) => ({
      type: "philosopher" as const,
      name,
    })),
    sec: sections,
    method: method as Parameters<typeof buildSectionDefs>[0]["method"],
    synthLevel:
      synthLevel as Parameters<typeof buildSectionDefs>[0]["synthLevel"],
    depth: depth as Parameters<typeof buildSectionDefs>[0]["depth"],
    generationOrder:
      generationOrder as Parameters<
        typeof buildSectionDefs
      >[0]["generationOrder"],
    extGraphMetrics: body.extGraphMetrics === true,
    ctx: typeof body.context === "string" ? body.context : "",
    lang: typeof body.lang === "string" && body.lang.trim() ? body.lang : "Russian",
    keepFullBudget: body.keepFullBudget === true,
  };

  try {
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
    patchPromptsWithSecCtx(baseDefs, secCtx);
    const defsMap = new Map(baseDefs.map((d) => [d.key, d]));
    const defs = dynamicOrder
      .map((key) => defsMap.get(key))
      .filter((d): d is NonNullable<typeof d> => d !== undefined);
    const passes = groupPasses(defs);

    const SYS = await buildSYS(p);
    // Ориентир 1.1: baseCtxStatic при концепциях-участниках, иначе полный
    // baseCtx; до 3.1 концепций нет — обе ветки эквивалентны (parents = "")
    const baseStatic = hasConceptParticipants(p)
      ? await baseCtxStatic(p)
      : await baseCtx(p);

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
