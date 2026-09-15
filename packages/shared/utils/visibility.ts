/**
 * Действенность флагов публичности (беседа 8.6) — ОДНА функция на весь
 * сервис и клиент; все проверки логов, запросов, авторства и пригодности к
 * мета-синтезу идут только через неё.
 *
 * Правила (решения, принятые до беседы):
 *   showLogs    = row.showLogs    && visibility === 'full'
 *   showPrompts = row.showPrompts && visibility === 'full'
 *   allowMeta   = row.allowMeta   && visibility === 'full'
 *   showAuthor  = row.showAuthor  && visibility !== 'private'
 * Сырые значения в БД при понижении ступени НЕ сбрасываются: временная
 * витрина не должна стирать настройки — действенность решается при чтении.
 * showAuthor у приватной концепции неотличим от false: приватную видит
 * только владелец, а ему авторство и так известно.
 */

import type {
  EffectiveFlags,
  VisibilityFlags,
} from "../types/synthesis.js";

export function effectiveFlags(row: VisibilityFlags): EffectiveFlags {
  const full = row.visibility === "full";
  return {
    showAuthor: row.showAuthor && row.visibility !== "private",
    showLogs: row.showLogs && full,
    showPrompts: row.showPrompts && full,
    allowMeta: row.allowMeta && full,
  };
}

/** «Не приватна» — единственное место, где ступень схлопывается в булево
 *  (списки, гейты). Производного поля isPublic в DTO с 8.7 нет. */
export function isPublicOf(visibility: VisibilityFlags["visibility"]): boolean {
  return visibility !== "private";
}
