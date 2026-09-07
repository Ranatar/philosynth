/**
 * EdgeCreateForm — создание новой связи графа. Беседа 7.1 (долг §12 5.4:
 * EdgeEditor правил существующие связи, концы менять было нельзя —
 * «удалить и создать» без «создать»). Функциональности нет в исходнике —
 * новый React-код; транспорт — POST /syntheses/:id/edges (03 §2.4, 7.1).
 *
 * Модалка поверх графовой (те же классы, что у ElementEditor variant=modal:
 * .edit-overlay.element-editor-overlay / .edit-modal). Два select'а концов
 * (категории синтеза) + поля EdgeEditor (тип по каталогу, направление,
 * описание, шесть характеристик; дефолты — как у схемы: 0.5 и
 * innovationDegree 1). Совпадение концов — только при направлении
 * «рефлексивная» (правило сервера; здесь дублируется как подсказка).
 * Ошибки VALIDATION_ERROR раскладываются по полям (details), прочие — общей
 * строкой. После 201 — onCreated(outcome) хозяину (GraphModal → страница
 * перечитает граф и разделы: таблица связей в html_content перерисована).
 */
import type { Category } from "@philosynth/shared/types/graph";
import type { EdgeCreateInput } from "@philosynth/shared/types/elements";
import { useMemo, useState } from "react";

import { ApiError } from "../../api/client";
import { createEdge, type CreateEdgeResponse } from "../../api/elements";
import { EdgeEditor, type EdgeDraft } from "./EdgeEditor";
import { FieldError } from "./ElementEditor";

export const EMPTY_EDGE_DRAFT: EdgeDraft = {
  description: "",
  edgeType: "",
  direction: "однонаправленная",
  strength: 0.5,
  certainty: 0.5,
  historicalSupport: 0.5,
  logicalNecessity: 0.5,
  innovationDegree: 1,
  contextDependency: 0.5,
  typeCatalogId: null,
};

/** Тело POST из черновика (пустой тип не отправляем — дефолт схемы "") */
export function buildEdgeCreateBody(
  sourceId: string,
  targetId: string,
  d: EdgeDraft,
): EdgeCreateInput {
  const body: EdgeCreateInput = {
    sourceId,
    targetId,
    direction: d.direction,
    description: d.description,
    strength: d.strength,
    certainty: d.certainty,
    historicalSupport: d.historicalSupport,
    logicalNecessity: d.logicalNecessity,
    innovationDegree: d.innovationDegree,
    contextDependency: d.contextDependency,
  };
  if (d.edgeType.trim()) body.edgeType = d.edgeType.trim();
  if (d.typeCatalogId) body.typeCatalogId = d.typeCatalogId;
  return body;
}

export interface EdgeCreateFormProps {
  synthesisId: string;
  categories: Category[];
  /** Предвыбранный источник (клик по узлу → «+ Связь») */
  initialSourceId?: string | undefined;
  disabled?: boolean | undefined;
  onCreated: (result: CreateEdgeResponse) => void;
  onClose: () => void;
}

export function EdgeCreateForm({
  synthesisId,
  categories,
  initialSourceId,
  disabled = false,
  onCreated,
  onClose,
}: EdgeCreateFormProps) {
  const sorted = useMemo(
    () => [...categories].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "ru")),
    [categories],
  );
  const [sourceId, setSourceId] = useState<string>(initialSourceId ?? sorted[0]?.id ?? "");
  const [targetId, setTargetId] = useState<string>(
    sorted.find((c) => c.id !== (initialSourceId ?? sorted[0]?.id))?.id ?? sorted[0]?.id ?? "",
  );
  const [draft, setDraft] = useState<EdgeDraft>(EMPTY_EDGE_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const nameOf = (id: string): string | undefined => sorted.find((c) => c.id === id)?.name;
  const sameEnds = sourceId !== "" && sourceId === targetId;
  const endsInvalid = sameEnds && draft.direction !== "рефлексивная";
  const canSave = !disabled && !saving && sourceId && targetId && !endsInvalid;

  async function submit(): Promise<void> {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await createEdge(synthesisId, buildEdgeCreateBody(sourceId, targetId, draft));
      onCreated(res);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "VALIDATION_ERROR" && err.details && typeof err.details === "object") {
          const fe: Record<string, string> = {};
          for (const [k, v] of Object.entries(err.details as Record<string, unknown>))
            fe[k] = typeof v === "string" ? v : JSON.stringify(v);
          setFieldErrors(fe);
        }
        setError(
          err.code === "GENERATION_IN_PROGRESS"
            ? "Идёт генерация — правки заблокированы до её завершения"
            : err.code === "FORBIDDEN"
              ? "Редактировать может только владелец синтеза"
              : err.message,
        );
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="edit-overlay visible element-editor-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="edge-create-form"
    >
      <div className="edit-modal" role="dialog" aria-label="Новая связь">
        <div className="edit-modal-header">
          <div className="edit-modal-title">
            + Новая связь
            {sourceId && targetId ? ` · ${nameOf(sourceId) ?? "?"} → ${nameOf(targetId) ?? "?"}` : ""}
          </div>
          <button type="button" className="raw-close" onClick={onClose} title="Закрыть">
            ✕
          </button>
        </div>
        <div className="edit-modal-body">
          {sorted.length < 1 ? (
            <div className="callout warning">
              <span className="callout-label">Нет категорий</span> Связь соединяет категории графа —
              сначала нужен хотя бы один узел.
            </div>
          ) : (
            <>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="edge-new-source">
                    Источник
                  </label>
                  <select
                    id="edge-new-source"
                    className="form-select"
                    value={sourceId}
                    disabled={disabled || saving}
                    onChange={(e) => setSourceId(e.target.value)}
                    data-testid="edge-new-source"
                  >
                    {sorted.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <FieldError text={fieldErrors.sourceId} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="edge-new-target">
                    Цель
                  </label>
                  <select
                    id="edge-new-target"
                    className="form-select"
                    value={targetId}
                    disabled={disabled || saving}
                    onChange={(e) => setTargetId(e.target.value)}
                    data-testid="edge-new-target"
                  >
                    {sorted.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <FieldError
                    text={
                      fieldErrors.targetId ??
                      (endsInvalid ? "Совпадение концов допустимо только у рефлексивной связи" : undefined)
                    }
                  />
                </div>
              </div>
              <EdgeEditor
                value={draft}
                onChange={setDraft}
                errors={fieldErrors}
                disabled={disabled || saving}
                sourceName={nameOf(sourceId)}
                targetName={nameOf(targetId)}
              />
            </>
          )}
          {error && (
            <div className="pool-status err" style={{ marginTop: 8 }} data-testid="edge-new-error">
              {error}
            </div>
          )}
        </div>
        <div className="edit-modal-footer">
          <button type="button" className="action-btn" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button
            type="button"
            className="action-btn primary"
            onClick={() => void submit()}
            disabled={!canSave}
            data-testid="edge-new-save"
          >
            {saving ? "Создание…" : "Создать связь"}
          </button>
        </div>
      </div>
    </div>
  );
}
