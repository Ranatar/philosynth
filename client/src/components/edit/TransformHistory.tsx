/**
 * TransformHistory — история трансформаций graph↔theses с откатом.
 * Беседа 5.5 (запрос 1, п. 6). В исходнике подсистемы нет — новый
 * React-код; оформление — классы исходника (.version-list / .version-item /
 * .version-num / .version-meta блока 5 кита уже в globals.css с 5.2,
 * .action-btn, .pool-status) по правилу «сначала класс исходника».
 *
 * Данные — GET /syntheses/:id/transforms (новые первыми); откат — POST
 * /transforms/:transformId/rollback (синхронный), ответ несёт строку-откат
 * → список пополняется без повторного GET. Confirmation — window.confirm
 * (паритет VersionHistory 5.2): «Восстановить [граф/тезисы] на момент
 * [дата]?». Строки-откаты (resultSummary.rollback=1) откатывать тоже можно
 * — их target_snapshot хранит восстановленное состояние.
 */
import { useCallback, useEffect, useState } from "react";

import type {
  RepresentationTransform,
  TransformDirection,
} from "@philosynth/shared/types/elements";

import { ApiError } from "../../api/client";
import { getTransformHistory, rollbackTransform } from "../../api/transforms";

export const DIRECTION_LABELS: Readonly<Record<TransformDirection, string>> = {
  graph_to_theses: "Граф → Тезисы",
  theses_to_graph: "Тезисы → Граф",
};

/** Что восстановит откат записи данного направления. */
export const ROLLBACK_TARGET_LABELS: Readonly<Record<TransformDirection, string>> = {
  graph_to_theses: "тезисы",
  theses_to_graph: "граф",
};

export function fmtTransformDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("ru", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Человекочитаемое summary (создано N, удалено M …). */
export function summaryText(summary: Record<string, number>): string {
  const parts: string[] = [];
  const s = summary;
  if (s.thesesCreated !== undefined || s.thesesRemoved !== undefined)
    parts.push(`тезисов: создано ${s.thesesCreated ?? 0}, удалено ${s.thesesRemoved ?? 0}`);
  if (s.categoriesCreated !== undefined || s.categoriesRemoved !== undefined)
    parts.push(`категорий: создано ${s.categoriesCreated ?? 0}, удалено ${s.categoriesRemoved ?? 0}`);
  if (s.edgesCreated !== undefined || s.edgesRemoved !== undefined)
    parts.push(`связей: создано ${s.edgesCreated ?? 0}, удалено ${s.edgesRemoved ?? 0}`);
  if (s.categoriesNormalized) parts.push(`типов привязано к каталогу: ${s.categoriesNormalized} + ${s.edgesNormalized ?? 0}`);
  if (s.sectionMissing) parts.push("раздела нет в документе — заменены только таблицы");
  return parts.join(" · ") || "—";
}

export interface TransformHistoryProps {
  synthesisId: string;
  /** Инкремент — перечитать историю (после трансформации) */
  refreshKey?: number | undefined;
  /** Откат недоступен (не владелец / генерация / занято) */
  disabled?: boolean | undefined;
  /** После успешного отката (хозяин перечитывает разделы и граф) */
  onRolledBack?: ((t: RepresentationTransform) => void) | undefined;
  /** Компактный вариант (внутри TransformPanel) */
  compact?: boolean | undefined;
}

export function TransformHistory({
  synthesisId,
  refreshKey = 0,
  disabled = false,
  onRolledBack,
  compact = false,
}: TransformHistoryProps) {
  const [items, setItems] = useState<RepresentationTransform[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    getTransformHistory(synthesisId)
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setItems([]);
          setLoadError(err instanceof ApiError ? err.message : "История не загружена");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [synthesisId, refreshKey]);

  const doRollback = useCallback(
    async (t: RepresentationTransform) => {
      const what = ROLLBACK_TARGET_LABELS[t.direction];
      if (!window.confirm(`Восстановить ${what} на момент ${fmtTransformDate(t.createdAt)}? Текущее состояние сохранится в истории и его тоже можно будет откатить.`))
        return;
      setBusyId(t.id);
      setError(null);
      try {
        const res = await rollbackTransform(synthesisId, t.id);
        setItems((prev) => [res.transform, ...(prev ?? [])]);
        onRolledBack?.(res.transform);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.code === "GENERATION_IN_PROGRESS"
              ? "Идёт другая операция — дождитесь её завершения"
              : err.message
            : "Откат не выполнен",
        );
      } finally {
        setBusyId(null);
      }
    },
    [synthesisId, onRolledBack],
  );

  return (
    <div data-testid="transform-history">
      {!compact && <div className="form-label">История трансформаций</div>}
      {error && (
        <div className="pool-status err" role="alert">{error}</div>
      )}
      {loadError && <div className="pool-status err">{loadError}</div>}
      {items === null ? (
        <div className="form-sublabel">загрузка истории…</div>
      ) : items.length === 0 ? (
        <div className="form-sublabel">Трансформаций ещё не было.</div>
      ) : (
        <div className="version-list">
          {items.map((t) => {
            const isRollback = Boolean(t.resultSummary && (t.resultSummary as Record<string, number>).rollback);
            return (
              <div key={t.id} className="version-item transform-item" data-transform-id={t.id}>
                <div className="version-num">
                  {isRollback ? "↶ откат · " : ""}
                  {DIRECTION_LABELS[t.direction]}
                </div>
                <div className="version-preview">{summaryText(t.resultSummary as Record<string, number>)}</div>
                <div className="version-meta">
                  {fmtTransformDate(t.createdAt)}
                  {t.inputTokens + t.outputTokens > 0 && (
                    <>
                      {" · "}
                      {t.inputTokens.toLocaleString("ru")} вх. + {t.outputTokens.toLocaleString("ru")} вых. · ${t.costUsd.toFixed(4)}
                    </>
                  )}
                </div>
                <div className="actions-bar-btns transform-item-actions">
                  <button
                    type="button"
                    className="action-btn"
                    disabled={disabled || busyId !== null}
                    onClick={() => void doRollback(t)}
                  >
                    {busyId === t.id ? "Откат…" : "Откатить"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
