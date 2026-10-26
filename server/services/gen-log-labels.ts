/**
 * Подписи и ошибки записей журнала генерации — кодом в БД, фразой при
 * чтении (беседа 14.2, Д-62).
 *
 * ЧТО БЫЛО. Писатели журнала (`generation-service`, `element-step`,
 * `mode-service`, `plan-executor`, `recommendations`,
 * `representation-transformer`) клали в `generation_log.section_label`
 * готовую русскую подпись («Резюме + Граф», «… [перегенерация]», «[точечная
 * правка]», «[по рекомендации N, раунд M]», «[трансформация …]», «[каскад]»,
 * «[подраздел]», «Критический анализ → … [повтор: …]»), а в `error_message` —
 * фразы службы («модель вернула пустой ответ»); `log-formatter` показывал их
 * как есть при любом языке — а при флаге showLogs (8.6) лог открыт любому
 * читателю концепции.
 *
 * ЧТО СТАЛО. Каждый писатель кладёт в `metadata.logLabel` код подписи с
 * параметрами (shared `GenLogLabel`: ключи разделов, имя подраздела, вид
 * операции) и в `metadata.error` код ошибки службы (`GenLogError`);
 * `section_label` и `error_message` пишутся как прежде — русская запасная
 * строка для старых читателей и выгрузки. `log-formatter` собирает подпись
 * по коду под языком запроса (`tData(KEY_LABELS)` + `tl()`); запись без
 * кода (до 14.2, журнал из выгрузки) — `section_label` как есть. Сообщения
 * API Anthropic (`error.raw`) — как есть: это сырые данные.
 *
 * Модуль чистый (без БД).
 */
import { ELEMENT_STEP_FIELD_LABELS, ELEMENT_STEP_KIND_LABELS } from "@philosynth/shared/constants/edit-steps";
import { KEY_LABELS, isSectionKey } from "@philosynth/shared/constants/section-labels";
import { tData } from "@philosynth/shared/i18n/data";
import { tl } from "@philosynth/shared/i18n/t";

import { env } from "../env.js";

import type { ElementStepKind } from "@philosynth/shared/types/edit-plan";
import type { GenLogError, GenLogLabel } from "@philosynth/shared/types/generation";
import type { StreamError } from "./streaming-manager.js";

/** Метка раздела на языке запроса; не ключ раздела — как есть (режимы, «mode:…»). */
export function sectionLabelOf(key: string): string {
  return isSectionKey(key) ? tData(KEY_LABELS[key]) : key;
}

/** Подпись записи по коду на языке текущего запроса (вне запроса — по-русски). */
export function renderLogLabel(l: GenLogLabel): string {
  switch (l.kind) {
    case "pass": {
      const base = l.sections.map(sectionLabelOf).join(" + ");
      return l.resume ? base + tl("server.genLogLabels.resumeSuffix", " [возобновление]") : base;
    }
    case "common":
      return tl("server.genLogLabels.commonElements", "Общие элементы");
    case "section":
      return sectionLabelOf(l.section);
    case "regen":
      return tl("server.genLogLabels.regen", "{section} [перегенерация]", { section: sectionLabelOf(l.section) });
    case "added":
      return tl("server.genLogLabels.added", "{section} [добавлен]", { section: sectionLabelOf(l.section) });
    case "subsection":
      return tl("server.genLogLabels.subsection", "{section} → {subsection} [подраздел]", {
        section: sectionLabelOf(l.section), subsection: l.subsection,
      });
    case "element_step": {
      const head = tl("server.genLogLabels.elementStepHead", "{section} → {elementKind} «{elementName}», {field}", {
        section: sectionLabelOf(l.section),
        elementKind: tData(ELEMENT_STEP_KIND_LABELS[l.elementKind as ElementStepKind] ?? l.elementKind),
        elementName: l.elementName,
        field: tData(ELEMENT_STEP_FIELD_LABELS[l.field] ?? l.field),
      });
      return l.recNum
        ? head + tl("server.genLogLabels.byRecommendation", " [по рекомендации {num}, раунд {round}]", { num: l.recNum, round: l.recRound ?? 0 })
        : head + tl("server.genLogLabels.pointEdit", " [точечная правка]");
    }
    case "mode": {
      const base = `${tData(l.modeTitle)} · ${l.param}`;
      return l.cascade ? base + tl("server.genLogLabels.cascadeSuffix", " [каскад]") : base;
    }
    case "transform":
      return l.direction === "graph_to_theses"
        ? tl("server.genLogLabels.transformGraphToTheses", "{section} [трансформация граф → тезисы]", { section: sectionLabelOf(l.section) })
        : tl("server.genLogLabels.transformThesesToGraph", "{section} [трансформация тезисы → граф]", { section: sectionLabelOf(l.section) });
    case "table_retry":
      return l.gap === "missing"
        ? tl("server.genLogLabels.tableRetryMissing", "{critique} → {table} [повтор: пропущена моделью]", tableParams())
        : tl("server.genLogLabels.tableRetryBad", "{critique} → {table} [повтор: негодна]", tableParams());
    case "table_compose":
      return tl("server.genLogLabels.tableCompose", "{critique} → {table} [по готовой прозе]", tableParams());
    case "version":
      return tl("server.genLogLabels.documentVersion", "Версия документа");
    default:
      return String((l as { kind: unknown }).kind);
  }
}

/** «Критический анализ» — ключ раздела critique; «Таблица рекомендаций» — имя подраздела (данные). */
function tableParams(): { critique: string; table: string } {
  return { critique: sectionLabelOf("critique"), table: "Таблица рекомендаций" };
}

/**
 * Текст ошибки записи на языке запроса: сырое сообщение API — как есть;
 * обрывы, классифицированные службой (max-tokens, stuck, user-abort), и
 * ошибки службы — фразой по коду. Без кода — сохранённый `error_message`.
 */
export function renderLogError(err: GenLogError | null, stored: string | null): string | null {
  if (!err) return stored;
  switch (err.code) {
    case "stream":
      if (err.raw) return err.raw;
      if (err.kind === "max-tokens")
        return (
          tl("server.streamingManager.truncatedByMaxTokens", "Ответ оборван по лимиту токенов (max_tokens = {maxTokens}). ", { maxTokens: (err.maxTokensUsed ?? 0).toLocaleString("ru") }) +
          tl("server.streamingManager.sectionTooLarge", "Раздел слишком объёмный для одного запроса.")
        );
      if (err.kind === "stuck")
        return tl("server.genLogLabels.streamStuck", "Нет ответа от API более {stuckSec} секунд (стрим «завис»)", { stuckSec: err.stuckSec ?? 0 });
      if (err.kind === "user-abort") return tl("server.streamingManager.generationStopped", "Генерация остановлена");
      return stored ?? err.kind ?? "";
    case "element_empty_response":
      return tl("server.genLogLabels.elementEmptyResponse", "модель вернула пустой ответ");
    case "element_too_long":
      return tl("server.genLogLabels.elementTooLong", "ответ модели длиннее {maxChars} знаков", { maxChars: err.maxChars ?? 0 });
    default:
      return stored;
  }
}

/**
 * Код ошибки обрыва стрима для `metadata.error`: сырое сообщение API
 * сохраняется только там, где оно сырое (auth, billing, pre-stream, partial);
 * у обрывов, чьё сообщение собрала служба (max-tokens, stuck, user-abort),
 * хранятся вид и числа — фразу соберёт читатель.
 */
export function streamLogError(e: StreamError): GenLogError {
  if (e.kind === "max-tokens") return { code: "stream", kind: e.kind, maxTokensUsed: e.maxTokensUsed || env.anthropic.maxTokens };
  if (e.kind === "stuck") return { code: "stream", kind: e.kind, stuckSec: Math.round(env.streaming.stuckMs / 1000) };
  if (e.kind === "user-abort") return { code: "stream", kind: e.kind };
  const raw = (e.message || "").trim();
  return raw ? { code: "stream", kind: e.kind, raw } : { code: "stream", kind: e.kind };
}

const LABEL_KINDS = new Set<string>([
  "pass", "common", "section", "regen", "added", "subsection", "element_step",
  "mode", "transform", "table_retry", "table_compose", "version",
]);

/** `metadata.logLabel` из jsonb с проверкой формы; нет/негодно — null (подпись как есть). */
export function logLabelFromMetadata(meta: Record<string, unknown> | null | undefined): GenLogLabel | null {
  const raw = meta?.["logLabel"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const kind = (raw as { kind?: unknown }).kind;
  if (typeof kind !== "string" || !LABEL_KINDS.has(kind)) return null;
  return raw as GenLogLabel;
}

/** `metadata.error` из jsonb с проверкой формы; нет — null (`error_message` как есть). */
export function logErrorFromMetadata(meta: Record<string, unknown> | null | undefined): GenLogError | null {
  const raw = meta?.["error"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const code = (raw as { code?: unknown }).code;
  if (code !== "stream" && code !== "element_empty_response" && code !== "element_too_long") return null;
  return raw as GenLogError;
}

/** Подпись записи для показа: по коду на языке запроса, без кода — `section_label` как есть. */
export function logLabelText(meta: Record<string, unknown> | null | undefined, sectionLabel: string): string {
  const l = logLabelFromMetadata(meta);
  return l ? renderLogLabel(l) : sectionLabel;
}

/** Текст ошибки записи для показа (см. renderLogError). */
export function logErrorText(meta: Record<string, unknown> | null | undefined, stored: string | null): string | null {
  return renderLogError(logErrorFromMetadata(meta), stored);
}
