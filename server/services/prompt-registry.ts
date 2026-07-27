/**
 * Prompt Registry (01-architecture §4.1; беседа 0.3).
 *
 * Два типа хранимых объектов:
 *  - промптовые шаблоны (prompt_templates): тело с Mustache-плейсхолдерами
 *    {{participants}}, {{method_label}}, … — подстановка без логики,
 *    логика (выбор ключей, вычисление словоформ) — в коде вызывающих;
 *  - конфигурации синтеза (synthesis_configs): JSON-значения
 *    (context_deps.*, parent_deps.*, md_by_card, compat_matrix, …).
 *
 * Кэширование: Redis, ключи prompt_cache:{key} / config_cache:{key}
 * (схема — 01-architecture §3 DATA LAYER). TTL бесконечный, инвалидация —
 * при активации новой версии через админ-API. Политика отказа Redis —
 * fail-open (как у rate-limiter, беседа 0.2): при недоступном Redis
 * читаем из БД и не кэшируем.
 *
 * Версионирование: каждая правка — новая строка (key, version),
 * is_active — только у одной версии ключа.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import type {
  PromptTemplate,
  PromptVersion,
  SynthesisConfig,
  SynthesisConfigKey,
} from "@philosynth/shared/types/prompts";

import { db, schema } from "../db/index.js";
import { redis } from "../redis.js";

const { promptTemplates, synthesisConfigs } = schema;

const promptCacheKey = (key: string): string => `prompt_cache:${key}`;
const configCacheKey = (key: string): string => `config_cache:${key}`;

/** Ошибка «ключ не найден» — маппится роутами на 404 NOT_FOUND (03-spec §4.3). */
export class RegistryNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(
    readonly kind: "template" | "config",
    readonly key: string,
    detail?: string,
  ) {
    super(
      kind === "template"
        ? `Промптовый шаблон «${key}» не найден${detail ? `: ${detail}` : " (нет активной версии)"}`
        : `Конфигурация «${key}» не найдена${detail ? `: ${detail}` : " (нет активной версии)"}`,
    );
    this.name = "RegistryNotFoundError";
  }
}

/** Ошибка рендеринга: в шаблоне остались плейсхолдеры без значений. */
export class TemplateRenderError extends Error {
  readonly code = "VALIDATION_ERROR";
  constructor(
    readonly key: string,
    readonly missing: string[],
  ) {
    super(
      `Шаблон «${key}»: нет значений для плейсхолдеров: ${missing.join(", ")}`,
    );
    this.name = "TemplateRenderError";
  }
}

/* ─────────────────────────── Redis (fail-open) ─────────────────────── */

async function cacheGet(cacheKey: string): Promise<string | null> {
  try {
    return await redis.get(cacheKey);
  } catch {
    return null; // Redis недоступен — идём в БД
  }
}

async function cacheSet(cacheKey: string, value: string): Promise<void> {
  try {
    await redis.set(cacheKey, value); // без TTL — инвалидация явная
  } catch {
    /* fail-open: некэшированное чтение не ошибка */
  }
}

async function cacheDel(...cacheKeys: string[]): Promise<void> {
  try {
    await redis.del(...cacheKeys);
  } catch {
    /* fail-open */
  }
}

/* ─────────────────────────────── Шаблоны ───────────────────────────── */

/**
 * Тело активной версии шаблона: Redis-кэш → fallback на БД (+ прогрев кэша).
 * @throws RegistryNotFoundError если активной версии нет.
 */
export async function getTemplate(key: string): Promise<string> {
  const cached = await cacheGet(promptCacheKey(key));
  if (cached !== null) return cached;

  const row = await db.query.promptTemplates.findFirst({
    where: and(eq(promptTemplates.key, key), eq(promptTemplates.isActive, true)),
    columns: { body: true },
  });
  if (!row) throw new RegistryNotFoundError("template", key);

  await cacheSet(promptCacheKey(key), row.body);
  return row.body;
}

/** Плейсхолдер Mustache-вида: {{name}} (имя — слово/точки/дефисы). */
const PLACEHOLDER_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

/**
 * Рендер шаблона: подстановка vars в {{плейсхолдеры}}. Без логики в шаблонах
 * (01-arch §4.1) — все условные части вычисляет вызывающий и передаёт
 * готовыми строками (пустая строка — легитимное значение, например
 * lang_instruction при lang=Russian).
 *
 * strict (по умолчанию true): плейсхолдер без значения в vars — ошибка
 * TemplateRenderError, чтобы порча промпта обнаруживалась сразу.
 * strict=false: отсутствующие заменяются на "" (список — в console.warn).
 */
export async function renderTemplate(
  key: string,
  vars: Record<string, string | number>,
  opts: { strict?: boolean } = {},
): Promise<string> {
  const strict = opts.strict ?? true;
  const body = await getTemplate(key);
  const missing: string[] = [];
  const rendered = body.replace(PLACEHOLDER_RE, (_m, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name))
      return String(vars[name]);
    missing.push(name);
    return "";
  });
  if (missing.length > 0) {
    if (strict) throw new TemplateRenderError(key, missing);
    console.warn(
      `[prompt-registry] шаблон «${key}»: плейсхолдеры без значений → "": ${missing.join(", ")}`,
    );
  }
  return rendered;
}

/** Все версии шаблона по ключу (без тел), новые первыми. */
export async function listVersions(key: string): Promise<PromptVersion[]> {
  const rows = await db
    .select({
      version: promptTemplates.version,
      isActive: promptTemplates.isActive,
      description: promptTemplates.description,
      createdAt: promptTemplates.createdAt,
      createdBy: promptTemplates.createdBy,
    })
    .from(promptTemplates)
    .where(eq(promptTemplates.key, key))
    .orderBy(desc(promptTemplates.version));
  if (rows.length === 0) throw new RegistryNotFoundError("template", key, "нет ни одной версии");
  return rows.map((r) => ({
    version: r.version,
    isActive: r.isActive,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy,
  }));
}

/**
 * Активация версии шаблона: деактивирует прежнюю активную, активирует
 * указанную, инвалидирует кэш. Возвращает активированную версию.
 * @throws RegistryNotFoundError если пары (key, version) нет.
 */
export async function activateVersion(
  key: string,
  version: number,
): Promise<PromptTemplate> {
  const activated = await db.transaction(async (tx) => {
    const target = await tx.query.promptTemplates.findFirst({
      where: and(
        eq(promptTemplates.key, key),
        eq(promptTemplates.version, version),
      ),
    });
    if (!target)
      throw new RegistryNotFoundError("template", key, `версии ${version} нет`);

    await tx
      .update(promptTemplates)
      .set({ isActive: false })
      .where(
        and(eq(promptTemplates.key, key), eq(promptTemplates.isActive, true)),
      );
    await tx
      .update(promptTemplates)
      .set({ isActive: true })
      .where(eq(promptTemplates.id, target.id));
    return target;
  });

  await invalidateCache(key);
  return {
    id: activated.id,
    key: activated.key,
    version: activated.version,
    body: activated.body,
    isActive: true,
    description: activated.description,
    createdAt: activated.createdAt.toISOString(),
    createdBy: activated.createdBy,
  };
}

/* ─────────────────────────────── Конфиги ───────────────────────────── */

/**
 * Значение активной версии конфига: Redis-кэш (JSON) → fallback на БД.
 * @throws RegistryNotFoundError если активной версии нет.
 */
export async function getConfig<T = unknown>(
  key: SynthesisConfigKey,
): Promise<T> {
  const cached = await cacheGet(configCacheKey(key));
  if (cached !== null) {
    try {
      return JSON.parse(cached) as T;
    } catch {
      // повреждённая запись кэша — перечитываем из БД
      await cacheDel(configCacheKey(key));
    }
  }

  const row = await db.query.synthesisConfigs.findFirst({
    where: and(
      eq(synthesisConfigs.key, key),
      eq(synthesisConfigs.isActive, true),
    ),
    columns: { value: true },
  });
  if (!row) throw new RegistryNotFoundError("config", key);

  await cacheSet(configCacheKey(key), JSON.stringify(row.value));
  return row.value as T;
}

/** Все версии конфига (метаданные без значения), новые первыми. */
export async function listConfigVersions(
  key: SynthesisConfigKey,
): Promise<Omit<SynthesisConfig, "value">[]> {
  const rows = await db
    .select({
      id: synthesisConfigs.id,
      key: synthesisConfigs.key,
      version: synthesisConfigs.version,
      isActive: synthesisConfigs.isActive,
      description: synthesisConfigs.description,
      createdAt: synthesisConfigs.createdAt,
    })
    .from(synthesisConfigs)
    .where(eq(synthesisConfigs.key, key))
    .orderBy(desc(synthesisConfigs.version));
  if (rows.length === 0)
    throw new RegistryNotFoundError("config", key, "нет ни одной версии");
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/* ─────────────────────────── Кэш: сброс/прогрев ────────────────────── */

/** Сброс кэша ключа (обе зоны — шаблонов и конфигов; лишний del безвреден). */
export async function invalidateCache(key: string): Promise<void> {
  await cacheDel(promptCacheKey(key), configCacheKey(key));
}

/**
 * Прогрев кэша при старте сервера (01-arch §4.1): все active-шаблоны
 * и конфиги → Redis. Fail-open: при недоступном Redis возвращает нули.
 */
export async function warmCache(): Promise<{
  templates: number;
  configs: number;
}> {
  const [tRows, cRows] = await Promise.all([
    db
      .select({ key: promptTemplates.key, body: promptTemplates.body })
      .from(promptTemplates)
      .where(eq(promptTemplates.isActive, true))
      .orderBy(asc(promptTemplates.key)),
    db
      .select({ key: synthesisConfigs.key, value: synthesisConfigs.value })
      .from(synthesisConfigs)
      .where(eq(synthesisConfigs.isActive, true))
      .orderBy(asc(synthesisConfigs.key)),
  ]);
  let templates = 0;
  let configs = 0;
  try {
    for (const r of tRows) {
      await redis.set(promptCacheKey(r.key), r.body);
      templates++;
    }
    for (const r of cRows) {
      await redis.set(configCacheKey(r.key), JSON.stringify(r.value));
      configs++;
    }
  } catch (err) {
    console.warn(
      `[prompt-registry] прогрев кэша прерван (Redis): ${(err as Error).message}`,
    );
  }
  return { templates, configs };
}
