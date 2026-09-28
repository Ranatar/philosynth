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
import { tl } from "@philosynth/shared/i18n/t";

export const DIRECTION_LABELS = (): Readonly<Record<TransformDirection, string>> => ({
  graph_to_theses: tl("edit.transformHistory.graphToTheses", "Граф → Тезисы"),
  theses_to_graph: tl("edit.transformHistory.thesesToGraph", "Тезисы → Граф"),
});

/** Что восстановит откат записи данного направления. */
export const ROLLBACK_TARGET_LABELS = (): Readonly<Record<TransformDirection, string>> => ({
  graph_to_theses: tl("common.thesesLower", "тезисы"),
  theses_to_graph: tl("common.graphLower", "граф"),
});

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
    parts.push(tl("edit.transformHistory.thesesCreatedRemoved", "тезисов: создано {thesesCreated}, удалено {thesesRemoved}", { thesesCreated: s.thesesCreated ?? 0, thesesRemoved: s.thesesRemoved ?? 0 }));
  if (s.categoriesCreated !== undefined || s.categoriesRemoved !== undefined)
    parts.push(tl("edit.transformHistory.categoriesCreatedRemoved", "категорий: создано {categoriesCreated}, удалено {categoriesRemoved}", { categoriesCreated: s.categoriesCreated ?? 0, categoriesRemoved: s.categoriesRemoved ?? 0 }));
  if (s.edgesCreated !== undefined || s.edgesRemoved !== undefined)
    parts.push(tl("edit.transformHistory.edgesCreatedRemoved", "связей: создано {edgesCreated}, удалено {edgesRemoved}", { edgesCreated: s.edgesCreated ?? 0, edgesRemoved: s.edgesRemoved ?? 0 }));
  if (s.categoriesNormalized) parts.push(tl("edit.transformHistory.typesLinked", "типов привязано к каталогу: {categoriesNormalized} + {edgesNormalized}", { categoriesNormalized: s.categoriesNormalized, edgesNormalized: s.edgesNormalized ?? 0 }));
  if (s.sectionMissing) parts.push(tl("edit.transformHistory.tablesOnly", "раздела нет в документе — заменены только таблицы"));
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
          setLoadError(err instanceof ApiError ? err.message : tl("edit.transformHistory.historyNotLoaded", "История не загружена"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [synthesisId, refreshKey]);

  const doRollback = useCallback(
    async (t: RepresentationTransform) => {
      const what = ROLLBACK_TARGET_LABELS()[t.direction];
      if (!window.confirm(tl("edit.transformHistory.confirmRestore", "Восстановить {what} на момент {createdAt}? Текущее состояние сохранится в истории и его тоже можно будет откатить.", { what, createdAt: fmtTransformDate(t.createdAt) })))
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
              ? tl("edit.transformHistory.otherOperation", "Идёт другая операция — дождитесь её завершения")
              : err.message
            : tl("edit.transformHistory.rollbackFailed", "Откат не выполнен"),
        );
      } finally {
        setBusyId(null);
      }
    },
    [synthesisId, onRolledBack],
  );

  return (
    <div data-testid="transform-history">
      {!compact && <div className="form-label">{tl("edit.transformHistory.title", "История трансформаций")}</div>}
      {error && (
        <div className="pool-status err" role="alert">{error}</div>
      )}
      {loadError && <div className="pool-status err">{loadError}</div>}
      {items === null ? (
        <div className="form-sublabel">{tl("edit.transformHistory.loadingHistory", "загрузка истории…")}</div>
      ) : items.length === 0 ? (
        <div className="form-sublabel">{tl("edit.transformHistory.noTransformations", "Трансформаций ещё не было.")}</div>
      ) : (
        <div className="version-list">
          {items.map((t) => {
            const isRollback = Boolean(t.resultSummary && (t.resultSummary as Record<string, number>).rollback);
            return (
              <div key={t.id} className="version-item transform-item" data-transform-id={t.id}>
                <div className="version-num">
                  {isRollback ? tl("edit.transformHistory.rollbackLabel", "↶ откат · ") : ""}
                  {DIRECTION_LABELS()[t.direction]}
                </div>
                <div className="version-preview">{summaryText(t.resultSummary as Record<string, number>)}</div>
                <div className="version-meta">
                  {fmtTransformDate(t.createdAt)}
                  {t.inputTokens + t.outputTokens > 0 && (
                    <>
                      {tl("edit.transformHistory.usageLine", "· {inputTokens} вх. + {outputTokens} вых. · ${costUsd}", { inputTokens: t.inputTokens.toLocaleString("ru"), outputTokens: t.outputTokens.toLocaleString("ru"), costUsd: t.costUsd.toFixed(4) })}
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
                    {busyId === t.id ? tl("edit.transformHistory.rollingBack", "Откат…") : tl("edit.transformHistory.rollback", "Откатить")}
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
