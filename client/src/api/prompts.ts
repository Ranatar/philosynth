/**
 * API-функции админки Prompt Registry. Беседа 6.2 (запрос 1, п. 4).
 *
 * Контракт: 03-specification §2.9 и server/routes/prompts.ts (6.1),
 * все роуты — requireAuth + requireAdmin (403 FORBIDDEN обычному
 * пользователю):
 *  - listPrompts      → GET  /prompts ?prefix&activeOnly → { templates }
 *      (activeOnly по умолчанию true на сервере; false — ВСЕ версии
 *      всех ключей, с телами)
 *  - getVersions      → GET  /prompts/:key/versions → { versions }
 *      (метаданные БЕЗ тел; 404 — ключа нет)
 *  - createVersion    → POST /prompts/:key { body, description? } → 201 { template }
 *      (черновик is_active=false — и для первой версии нового ключа;
 *      пустое body → 400; ключ [A-Za-z0-9._:-])
 *  - activateVersion  → POST /prompts/:key/activate { version } → { template }
 *      (сброс prompt_cache — генерация берёт новый шаблон сразу)
 *  - listConfigs      → GET  /configs ?activeOnly → { configs } (значения включены)
 *  - updateConfig     → PUT  /configs/:key { value, description? } → 201 { config }
 *      (черновик, симметрично шаблонам)
 *  - getConfigVersions → GET /configs/:key/versions → { versions } (без value)
 *  - activateConfigVersion → POST /configs/:key/activate { version } → { config }
 *
 * ДЫРА КОНТРАКТА (найдена 6.2): diff двух версий требует ТЕЛ, а
 * /versions отдаёт только метаданные. Без правки сервера тела берутся
 * через listPrompts({ prefix: key, activeOnly: false }) — LIKE 'key%'
 * захватывает и более длинные ключи, поэтому getTemplateVersions
 * фильтрует по точному key на клиенте. Для конфигов — listConfigs(false)
 * с той же фильтрацией. Кандидат в патч доков: GET /prompts/:key/versions
 * → с телами либо GET /prompts/:key/versions/:version.
 */

import type {
  PromptTemplate,
  PromptVersion,
  SynthesisConfig,
} from "@philosynth/shared/types/prompts";

import { api, apiGet, apiPost } from "./client";

const k = (key: string): string => encodeURIComponent(key);

/* ── Шаблоны ─────────────────────────────────────────────────────────── */

export interface ListPromptsQuery {
  prefix?: string;
  /** false — включая неактивные версии (сервер: default true) */
  activeOnly?: boolean;
}

export function listPrompts(query: ListPromptsQuery = {}): Promise<PromptTemplate[]> {
  return apiGet<{ templates: PromptTemplate[] }>("/prompts", {
    prefix: query.prefix || undefined,
    activeOnly: query.activeOnly === undefined ? undefined : query.activeOnly,
  }).then((r) => r.templates);
}

export function getVersions(key: string): Promise<PromptVersion[]> {
  return apiGet<{ versions: PromptVersion[] }>(`/prompts/${k(key)}/versions`).then(
    (r) => r.versions,
  );
}

/** Все версии ключа С ТЕЛАМИ (обход дыры контракта, см. шапку); новые первыми. */
export async function getTemplateVersions(key: string): Promise<PromptTemplate[]> {
  const rows = await listPrompts({ prefix: key, activeOnly: false });
  return rows
    .filter((t) => t.key === key)
    .sort((a, b) => b.version - a.version);
}

export function createVersion(
  key: string,
  body: string,
  description = "",
): Promise<PromptTemplate> {
  return apiPost<{ template: PromptTemplate }>(`/prompts/${k(key)}`, {
    body,
    ...(description ? { description } : {}),
  }).then((r) => r.template);
}

export function activateVersion(key: string, version: number): Promise<PromptTemplate> {
  return apiPost<{ template: PromptTemplate }>(`/prompts/${k(key)}/activate`, {
    version,
  }).then((r) => r.template);
}

/* ── Конфиги ─────────────────────────────────────────────────────────── */

export type ConfigVersion = Omit<SynthesisConfig, "value">;

export function listConfigs(activeOnly = true): Promise<SynthesisConfig[]> {
  return apiGet<{ configs: SynthesisConfig[] }>("/configs", { activeOnly }).then(
    (r) => r.configs,
  );
}

export function updateConfig(
  key: string,
  value: unknown,
  description = "",
): Promise<SynthesisConfig> {
  return api<{ config: SynthesisConfig }>(`/configs/${k(key)}`, {
    method: "PUT",
    body: { value, ...(description ? { description } : {}) },
  }).then((r) => r.config);
}

export function getConfigVersions(key: string): Promise<ConfigVersion[]> {
  return apiGet<{ versions: ConfigVersion[] }>(`/configs/${k(key)}/versions`).then(
    (r) => r.versions,
  );
}

/** Все версии конфига СО ЗНАЧЕНИЯМИ (обход дыры контракта); новые первыми. */
export async function getConfigVersionsFull(key: string): Promise<SynthesisConfig[]> {
  const rows = await listConfigs(false);
  return rows.filter((c) => c.key === key).sort((a, b) => b.version - a.version);
}

export function activateConfigVersion(
  key: string,
  version: number,
): Promise<SynthesisConfig> {
  return apiPost<{ config: SynthesisConfig }>(`/configs/${k(key)}/activate`, {
    version,
  }).then((r) => r.config);
}
