/**
 * TransformPanel — трансформация представлений graph↔theses.
 * Беседа 5.5 (запрос 1, п. 5). В исходнике подсистемы нет — новый
 * React-код; оформление — блок 9 UI-кита (.transform-row / .transform-arrow /
 * .transform-warn, перенесён в часть 3 globals.css этой беседой) + классы
 * исходника: модальное окно .edit-overlay/.edit-modal (таблица
 * соответствий кита), .action-btn, .edit-regen-progress (индикатор
 * стриминга), .cascade-panel (summary), .pool-status.
 *
 * Поведение:
 *  - две кнопки направления «Граф → Тезисы» / «Тезисы → Граф»; начальное
 *    направление задаёт хозяин (кнопка «→ Тезисы» в GraphModal, «→ Граф» у
 *    раздела тезисов);
 *  - предупреждение о перезаписи и превью потерь — счётчики текущих
 *    тезисов / категорий и связей (GET /theses, GET /categories при
 *    открытии); пустой источник — кнопка «Преобразовать» заблокирована
 *    с пояснением (сервер и так ответит 400);
 *  - подтверждение — явный второй шаг («Преобразовать»), не window.confirm:
 *    решение о перезаписи целого раздела заслуживает видимого
 *    предупреждения (правило кита — раскрывать по месту);
 *  - прогресс: transform_started → «генерируется… N симв.» с живым
 *    предпросмотром HTML (doc-content), финал — summary «создано N,
 *    удалено M» из transform_done, история (TransformHistory compact)
 *    обновляется, хозяин перечитывает разделы и граф (onTransformed);
 *  - только владелец при status≠generating (гейт хозяина: панель не
 *    открывается иначе); при активном стриме закрытие блокировано —
 *    операция на сервере всё равно доведётся, но пользователь потерял бы
 *    финал.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type { TransformDirection } from "@philosynth/shared/types/elements";

import { getCategories, getTheses } from "../../api/elements";
import { useTransformStream, type TransformDoneEvent } from "../../hooks/useTransformStream";
import { DIRECTION_LABELS, TransformHistory, summaryText } from "./TransformHistory";

export const TARGET_SECTION_TITLES: Readonly<Record<TransformDirection, string>> = {
  graph_to_theses: "Корпус тезисов",
  theses_to_graph: "Граф категорий",
};

export interface TransformCounts {
  theses: number;
  categories: number;
  edges: number;
}

/** Что будет заменено (текст превью потерь) — экспорт для смоука. */
export function lossPreviewText(direction: TransformDirection, counts: TransformCounts): string {
  if (direction === "graph_to_theses")
    return counts.theses > 0
      ? `Будут заменены текущие тезисы: ${counts.theses}.`
      : "Тезисов в документе ещё нет — раздел будет создан из графа.";
  return counts.categories > 0
    ? `Будут заменены текущие категории: ${counts.categories} и связи: ${counts.edges}.`
    : "Графа в документе ещё нет — он будет построен из тезисов.";
}

/** Пусто ли представление-источник (кнопка заблокирована) — экспорт для смоука. */
export function sourceEmptyText(direction: TransformDirection, counts: TransformCounts): string | null {
  if (direction === "graph_to_theses" && counts.categories === 0)
    return "Нет графа — трансформировать нечего. Сначала сгенерируйте раздел «Граф категорий».";
  if (direction === "theses_to_graph" && counts.theses === 0)
    return "Нет тезисов — трансформировать нечего. Сначала сгенерируйте раздел «Корпус тезисов».";
  return null;
}

export interface TransformPanelProps {
  open: boolean;
  synthesisId: string;
  /** Направление, с которым панель открыта (переключается внутри) */
  initialDirection: TransformDirection;
  /** Операции недоступны (не владелец / генерация) */
  disabled?: boolean | undefined;
  /** После transform_done и после отката — хозяин перечитывает документ */
  onTransformed?: ((ev: TransformDoneEvent | { direction: TransformDirection; rollback: true }) => void) | undefined;
  onClose: () => void;
}

export function TransformPanel({
  open,
  synthesisId,
  initialDirection,
  disabled = false,
  onTransformed,
  onClose,
}: TransformPanelProps) {
  const [direction, setDirection] = useState<TransformDirection>(initialDirection);
  const [counts, setCounts] = useState<TransformCounts | null>(null);
  const [countsError, setCountsError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const stream = useTransformStream({ synthesisId, enabled: open });

  useEffect(() => {
    if (open) {
      setDirection(initialDirection);
      setArmed(false);
      stream.clearError();
      stream.clearDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDirection]);

  const loadCounts = useCallback(async () => {
    try {
      const [theses, graph] = await Promise.all([getTheses(synthesisId), getCategories(synthesisId)]);
      setCounts({ theses: theses.length, categories: graph.categories.length, edges: graph.edges.length });
      setCountsError(null);
    } catch (err) {
      setCounts(null);
      setCountsError(err instanceof Error ? err.message : "Не удалось загрузить счётчики");
    }
  }, [synthesisId]);

  useEffect(() => {
    if (!open) return;
    setCounts(null);
    void loadCounts();
  }, [open, loadCounts]);

  // Финал: счётчики и история перечитываются, хозяин уведомляется
  useEffect(
    () =>
      stream.onDone((ev) => {
        setArmed(false);
        setHistoryKey((k) => k + 1);
        void loadCounts();
        onTransformed?.(ev);
      }),
    [stream, loadCounts, onTransformed],
  );

  const busy = stream.active !== null;
  const emptyText = counts ? sourceEmptyText(direction, counts) : null;
  const canRun = !disabled && !busy && counts !== null && emptyText === null;

  const handleRun = useCallback(async () => {
    if (!canRun) return;
    await stream.start(direction);
  }, [canRun, stream, direction]);

  const handleRolledBack = useCallback(() => {
    void loadCounts();
    onTransformed?.({ direction, rollback: true });
  }, [loadCounts, onTransformed, direction]);

  const livePreview = useMemo(() => stream.liveHtml.slice(-4000), [stream.liveHtml]);
  const g2tClass = "action-btn" + (direction === "graph_to_theses" ? " primary" : "");
  const t2gClass = "action-btn" + (direction === "theses_to_graph" ? " primary" : "");

  if (!open) return null;

  const done = stream.lastDone;

  return (
    <div
      className="edit-overlay visible"
      data-testid="transform-panel"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="edit-modal">
        <div className="edit-modal-header">
          <div className="edit-modal-title">⇄ Трансформация представлений</div>
          <button
            type="button"
            className="raw-close"
            onClick={onClose}
            disabled={busy}
            title={busy ? "Дождитесь завершения трансформации" : "Закрыть"}
          >
            ✕
          </button>
        </div>

        <div className="edit-modal-body">
          <div className="transform-row">
            <button
              type="button"
              className={g2tClass}
              disabled={busy}
              onClick={() => { setDirection("graph_to_theses"); setArmed(false); }}
              data-direction="graph_to_theses"
            >
              Граф → Тезисы
            </button>
            <span className="transform-arrow">⇄</span>
            <button
              type="button"
              className={t2gClass}
              disabled={busy}
              onClick={() => { setDirection("theses_to_graph"); setArmed(false); }}
              data-direction="theses_to_graph"
            >
              Тезисы → Граф
            </button>
            <span className="submit-note" style={{ maxWidth: "none" }}>
              Прямая конверсия: источник — единственный вход, контекст остальных разделов не используется.
            </span>
          </div>

          <div className="transform-warn" data-testid="transform-warn">
            Раздел «{TARGET_SECTION_TITLES[direction]}» будет перезаписан.{" "}
            {counts ? lossPreviewText(direction, counts) : countsError ?? "Загрузка счётчиков…"}{" "}
            Текущая версия сохранится в истории и доступна для отката.
          </div>

          {emptyText && (
            <div className="pool-status err" data-testid="transform-empty">{emptyText}</div>
          )}
          {stream.error && (
            <div className="pool-status err" role="alert" data-testid="transform-error">{stream.error}</div>
          )}

          {!busy && !done && (
            <div className="actions-bar-btns" style={{ marginTop: 12 }}>
              {!armed ? (
                <button
                  type="button"
                  className="action-btn primary"
                  disabled={!canRun}
                  onClick={() => setArmed(true)}
                  data-testid="transform-arm"
                >
                  Преобразовать
                </button>
              ) : (
                <>
                  <span className="form-sublabel" style={{ alignSelf: "center" }}>
                    Подтвердите: {DIRECTION_LABELS[direction]}, раздел будет заменён целиком.
                  </span>
                  <button
                    type="button"
                    className="action-btn primary"
                    disabled={!canRun}
                    onClick={() => void handleRun()}
                    data-testid="transform-confirm"
                  >
                    Да, преобразовать
                  </button>
                  <button type="button" className="action-btn" onClick={() => setArmed(false)}>
                    Отмена
                  </button>
                </>
              )}
            </div>
          )}

          {busy && (
            <div className="edit-regen-progress active" data-testid="transform-progress">
              <span className="edit-regen-spinner" />
              <span>
                {stream.started
                  ? `${DIRECTION_LABELS[direction]}: генерируется… ${stream.liveChars.toLocaleString("ru")} симв.`
                  : `${DIRECTION_LABELS[direction]}: запуск…`}
              </span>
            </div>
          )}
          {busy && livePreview && (
            <div
              className="doc-content transform-live"
              data-testid="transform-live"
              dangerouslySetInnerHTML={{ __html: livePreview }}
            />
          )}

          {done && !busy && (
            <div className="cascade-panel visible transform-summary" data-testid="transform-summary">
              <div className="cascade-title">✓ {DIRECTION_LABELS[done.direction]} — выполнено</div>
              <div className="cascade-desc">{summaryText(done.summary)}</div>
              <div className="form-sublabel">
                {done.usage.inputTokens.toLocaleString("ru")} вх. + {done.usage.outputTokens.toLocaleString("ru")} вых. · $
                {done.usage.costUsd.toFixed(4)}
              </div>
              <div className="actions-bar-btns" style={{ marginTop: 8 }}>
                <button type="button" className="action-btn" onClick={() => stream.clearDone()}>
                  Ещё одна трансформация
                </button>
                <button type="button" className="action-btn primary" onClick={onClose}>
                  К документу
                </button>
              </div>
            </div>
          )}

          <div className="form-label" style={{ marginTop: 16 }}>История трансформаций</div>
          <TransformHistory
            synthesisId={synthesisId}
            refreshKey={historyKey}
            disabled={disabled || busy}
            onRolledBack={handleRolledBack}
            compact
          />
        </div>
      </div>
    </div>
  );
}
