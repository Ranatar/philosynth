/**
 * EnrichmentPanel — точечное обогащение элемента через Claude и история
 * обогащений. Беседа 5.4 (запрос 1, п. 2). Функциональности нет в
 * исходнике — новый React-код; оформление — блок 8 UI-кита (.enrich-card
 * (.streaming) / .enrich-card-head / -type / -body) + .actions-bar-btns /
 * .action-btn исходника. Стриминг — каретка .enrich-card.streaming (кит),
 * индикатор .edit-regen-progress не дублируется.
 *
 * Типы обогащения — канон 03 §2.14: категория — description | evolution |
 * justification, связь — justification | counterarguments. Кнопка
 * «Обогатить» раскрывает выбор типа; запуск — REST POST через
 * useEnrichmentStream (п.5 03 §3.1: HTTP создаёт операцию), результат —
 * WS enrichment_delta → enrichment_done с enrichmentId/content («По факту
 * 5.3»): финал добавляется в историю без повторного GET, история же
 * при монтировании читается GET /enrichments/:elementId.
 *
 * Карточка: тип, дата, стоимость, контент (HTML ответа Claude — как
 * html_content разделов, через dangerouslySetInnerHTML); карточки
 * истории сворачиваемы (первая раскрыта), стриминговая — всегда раскрыта.
 * readOnly (не владелец / генерация) — история видна, кнопок запуска нет.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CategoryEnrichmentType,
  EdgeEnrichmentType,
  ElementEnrichment,
} from "@philosynth/shared/types/elements";

import {
  messageOfEnrichmentError,
  type EnrichmentDoneEvent,
  type EnrichmentStream,
} from "../../hooks/useEnrichmentStream";
import type { EnrichableElementKind } from "../../api/enrichment";
import { tl } from "@philosynth/shared/i18n/t";

export const CATEGORY_ENRICHMENT_OPTIONS: readonly {
  type: CategoryEnrichmentType;
  label: string;
  hint: string;
}[] = [
  { type: "description", label: tl("common.description", "Описание"), hint: tl("edit.enrichmentPanel.extendedDescription", "расширенное описание, трактовки, аналоги") },
  { type: "evolution", label: tl("edit.enrichmentPanel.evolution", "Эволюция"), hint: tl("edit.enrichmentPanel.evolutionHint", "как категория может измениться в свете современных тенденций") },
  { type: "justification", label: tl("common.justification", "Обоснование"), hint: tl("edit.enrichmentPanel.categoryGrounds", "философские основания категории и её места в графе") },
];

export const EDGE_ENRICHMENT_OPTIONS: readonly {
  type: EdgeEnrichmentType;
  label: string;
  hint: string;
}[] = [
  { type: "justification", label: tl("common.justification", "Обоснование"), hint: tl("edit.enrichmentPanel.edgeGrounds", "философское обоснование связи") },
  { type: "counterarguments", label: tl("edit.enrichmentPanel.counterarguments", "Контраргументы"), hint: tl("edit.enrichmentPanel.counterargumentsHint", "возражения против связи, аналоги в других системах") },
];

/** Подпись типа обогащения (в т.ч. 'characteristic' для общей истории) */
export const ENRICHMENT_TYPE_LABELS: Record<string, string> = {
  description: tl("common.description", "Описание"),
  evolution: tl("edit.enrichmentPanel.evolution", "Эволюция"),
  justification: tl("common.justification", "Обоснование"),
  counterarguments: tl("edit.enrichmentPanel.counterarguments", "Контраргументы"),
  characteristic: tl("edit.enrichmentPanel.characteristicJustification", "Обоснование характеристики"),
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("ru-RU");
}

export interface EnrichmentPanelProps {
  stream: EnrichmentStream;
  elementType: EnrichableElementKind;
  elementId: string;
  /** Подпись элемента в заголовке («Бытие», «Бытие → Ничто») */
  elementLabel?: string | undefined;
  readOnly?: boolean | undefined;
  /** Ключ перечитки истории хозяином */
  refreshKey?: number | undefined;
  onEnriched?: ((ev: EnrichmentDoneEvent) => void) | undefined;
}

export function EnrichmentPanel({
  stream,
  elementType,
  elementId,
  elementLabel,
  readOnly = false,
  refreshKey = 0,
  onEnriched,
}: EnrichmentPanelProps) {
  const [history, setHistory] = useState<ElementEnrichment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const options = elementType === "category" ? CATEGORY_ENRICHMENT_OPTIONS : EDGE_ENRICHMENT_OPTIONS;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await stream.loadEnrichments(elementId, elementType);
      setHistory(list);
      setExpanded((prev) => {
        if (prev.size) return prev;
        const first = list[0];
        return first ? new Set([first.id]) : prev;
      });
    } catch (err) {
      setLoadError(messageOfEnrichmentError(err));
    }
  }, [stream, elementId, elementType]);

  useEffect(() => {
    setHistory(null);
    setExpanded(new Set());
    void load();
  }, [load, refreshKey]);

  // Финал обогащения этого элемента → карточка из enrichment_done (без GET)
  useEffect(
    () =>
      stream.onDone((ev) => {
        if (ev.operation.kind !== "enrichment" || ev.operation.elementId !== elementId) return;
        const row: ElementEnrichment = {
          id: ev.enrichmentId,
          synthesisId: "",
          elementId,
          elementType,
          enrichmentType: ev.enrichmentType as ElementEnrichment["enrichmentType"],
          promptKey: `enrichment.${elementType}.${ev.enrichmentType}`,
          content: ev.content,
          metadata: {},
          inputTokens: ev.usage.inputTokens,
          outputTokens: ev.usage.outputTokens,
          costUsd: ev.usage.costUsd,
          createdAt: new Date().toISOString(),
        };
        setHistory((prev) => [row, ...(prev ?? []).filter((e) => e.id !== row.id)]);
        setExpanded((prev) => new Set([row.id, ...prev]));
        onEnriched?.(ev);
      }),
    [stream, elementId, elementType, onEnriched],
  );

  const streamingHere =
    stream.active?.kind === "enrichment" && stream.active.elementId === elementId
      ? stream.active
      : null;
  const busyElsewhere = !!stream.active && !streamingHere;

  const start = useCallback(
    (type: CategoryEnrichmentType | EdgeEnrichmentType) => {
      setChoosing(false);
      void stream.startEnrichment(elementType, elementId, type);
    },
    [stream, elementType, elementId],
  );

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totalCost = useMemo(
    () => (history ?? []).reduce((s, e) => s + (e.costUsd || 0), 0),
    [history],
  );

  return (
    <div className="enrich-panel" data-enrichment-panel={elementType}>
      <div className="enrich-panel-head">
        <span className="form-label enrich-panel-title">
          {tl("edit.enrichmentPanel.enrichmentTitle", "Обогащение{elementLabel}", { elementLabel: elementLabel ? ` · ${elementLabel}` : "" })}
        </span>
        {history && history.length > 0 && (
          <span className="enrich-panel-total">
            {history.length} · ${totalCost.toFixed(4)}
          </span>
        )}
      </div>

      {!readOnly && (
        <div className="actions-bar-btns enrich-panel-actions">
          <button
            type="button"
            className={"action-btn primary" + (choosing ? " active" : "")}
            disabled={!!streamingHere || busyElsewhere}
            title={
              busyElsewhere
                ? tl("edit.enrichmentPanel.otherOperation", "Идёт другая операция — дождитесь её завершения")
                : tl("edit.enrichmentPanel.pointRequest", "Точечный запрос к Claude по этому элементу")
            }
            onClick={() => setChoosing((v) => !v)}
            data-testid="enrich-button"
          >
            {streamingHere ? tl("edit.enrichmentPanel.enriching", "Обогащение…") : tl("edit.enrichmentPanel.enrich", "Обогатить")}
          </button>
          {choosing &&
            options.map((o) => (
              <button
                key={o.type}
                type="button"
                className="action-btn"
                title={o.hint}
                onClick={() => start(o.type)}
                data-enrichment-type={o.type}
              >
                {o.label}
              </button>
            ))}
        </div>
      )}

      {stream.error && !streamingHere && (
        <div className="pool-status err" role="alert">
          {stream.error}
        </div>
      )}
      {loadError && <div className="pool-status err">{loadError}</div>}

      {streamingHere && (
        <div className="enrich-card streaming" data-testid="enrich-streaming">
          <div className="enrich-card-head">
            <span className="enrich-card-type">
              {ENRICHMENT_TYPE_LABELS[streamingHere.enrichmentType] ?? streamingHere.enrichmentType}
            </span>
            <span>{tl("edit.enrichmentPanel.generatingChars", "генерируется… · {liveChars} симв.", { liveChars: stream.liveChars.toLocaleString("ru") })}</span>
          </div>
          <div className="enrich-card-body">{stream.liveText}</div>
        </div>
      )}

      {history === null && !loadError && (
        <div className="form-sublabel">{tl("edit.enrichmentPanel.loadingHistory", "загрузка истории…")}</div>
      )}
      {history && history.length === 0 && !streamingHere && (
        <div className="form-sublabel">{tl("edit.enrichmentPanel.noEnrichments", "Обогащений ещё нет.")}</div>
      )}
      {history?.map((e) => {
        const isOpen = expanded.has(e.id);
        return (
          <div key={e.id} className="enrich-card" data-enrichment-id={e.id}>
            <div
              className="enrich-card-head enrich-card-toggle"
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => toggle(e.id)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  toggle(e.id);
                }
              }}
            >
              <span className="enrich-card-type">
                {isOpen ? "▾ " : "▸ "}
                {ENRICHMENT_TYPE_LABELS[e.enrichmentType] ?? e.enrichmentType}
              </span>
              <span>
                {tl("edit.enrichmentPanel.usageLine", "{createdAt} · {inputTokens} вх. + {outputTokens} вых. · ${costUsd}", { createdAt: fmtDate(e.createdAt), inputTokens: e.inputTokens.toLocaleString("ru"), outputTokens: e.outputTokens.toLocaleString("ru"), costUsd: e.costUsd.toFixed(4) })}
              </span>
            </div>
            {isOpen && (
              <div
                className="enrich-card-body doc-content"
                dangerouslySetInnerHTML={{ __html: e.content }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
