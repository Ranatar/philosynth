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
import { SEC_NAMES } from "../services/section-defs-builder.js";
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

  // v11: оба списка пусты — свободный синтез, обязателен seed
  if (allPhilosophers.length === 0 && !seed) {
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
      { error: "Невалидные параметры синтеза", code: "VALIDATION_ERROR", details },
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
