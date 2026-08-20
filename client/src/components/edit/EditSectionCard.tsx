/**
 * Карточка раздела в модалке редактирования. Беседа 2.3 (запрос 1, п. 3).
 *
 * Порт карточки renderEditSections [18398–18658]:
 *  - заголовок «§ N — Метка» + «⟳ » при isEdited (индикатор «изменён»);
 *  - бейдж качества контекста: score из SectionSummary.contextQualityScore
 *    (живой после 2.4: getSectionContextQualityMap в GET /sections);
 *    пороги исходника ≥90 зелёный / ≥60 золотой / < 60 красный; null →
 *    бейдж НЕ рисуется (состояние «нет оценки» — 07);
 *  - предупреждение о деградации при score < 70 (адаптация: issues в
 *    SectionSummary не передаются — доступны в превью контекста ниже;
 *    текст сокращён до счётной части);
 *  - поле secCtx (textarea) — значение поднято в EditModal (уйдёт в
 *    regenContexts плана / инициализировано из SectionFull.secContext);
 *  - превью контекста генерации: disclosure «Контекст генерации» →
 *    GET /sections/:key/context (SectionContextPreview; потребитель по
 *    03 §2.3 — именно эта карточка), лениво по первому открытию;
 *  - чекбоксы Перегенерировать/Удалить — взаимоисключающие
 *    (onEditCheckChange [18661]: отметка одного дизейблит другой);
 *  - для graph — чекбокс extGraphMetrics (пишет тот же флаг синтеза:
 *    PATCH /syntheses/:id — транспорт добавлен 2.3);
 *  - подразделы для точечной перегенерации: кнопки «⟳ имя» (список —
 *    фактические SectionSummary.subsections вместо buildSubsectionMap
 *    исходника: карта на сервере, а фактические имена уже приходят) —
 *    панель SubsectionRegenPanel открывает родитель.
 */
import { useCallback, useState } from "react";

import type { SectionSummary } from "@philosynth/shared/types/section";
import type { SectionContextPreview } from "@philosynth/shared/types/section";

import { getSectionContext } from "../../api/sections";

export interface EditSectionCardProps {
  synthesisId: string;
  summary: SectionSummary;
  label: string;
  regenChecked: boolean;
  removeChecked: boolean;
  onToggleRegen: (checked: boolean) => void;
  onToggleRemove: (checked: boolean) => void;
  secCtx: string;
  onSecCtxChange: (value: string) => void;
  /** Только для key='graph' */
  extGraphMetrics?: boolean | undefined;
  onToggleExtGraphMetrics?: ((checked: boolean) => void) | undefined;
  /** Открыть панель подраздельной перегенерации на подразделе */
  onOpenSubRegen?: ((subsectionName: string) => void) | undefined;
  /** Идёт исполнение плана/перегенерация — чекбоксы заблокированы */
  disabled?: boolean | undefined;
}

function badgeColor(score: number): string {
  if (score >= 90) return "var(--green-check)";
  if (score >= 60) return "var(--gold)";
  return "var(--red)";
}

export function EditSectionCard({
  synthesisId,
  summary,
  label,
  regenChecked,
  removeChecked,
  onToggleRegen,
  onToggleRemove,
  secCtx,
  onSecCtxChange,
  extGraphMetrics,
  onToggleExtGraphMetrics,
  onOpenSubRegen,
  disabled,
}: EditSectionCardProps) {
  const { key, sectionNum, isEdited, contextQualityScore, subsections } =
    summary;

  // Превью контекста генерации — лениво по первому открытию disclosure
  const [preview, setPreview] = useState<SectionContextPreview | null>(null);
  const [previewState, setPreviewState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");

  const loadPreview = useCallback(() => {
    if (previewState !== "idle") return;
    setPreviewState("loading");
    getSectionContext(synthesisId, key)
      .then((p) => {
        setPreview(p);
        setPreviewState("ready");
      })
      .catch(() => setPreviewState("error"));
  }, [previewState, synthesisId, key]);

  const score = contextQualityScore;

  return (
    <div className="edit-sec-card" id={"editCard-" + key}>
      <div className="edit-sec-card-header">
        <div className="edit-sec-title">
          {isEdited ? "⟳ " : ""}§ {sectionNum} — {label}
          {score !== null && (
            <span
              title={`Качество контекста генерации: ${score}%`}
              style={{
                fontFamily: "var(--mono)",
                fontSize: 9,
                color: badgeColor(score),
                border: `1px solid ${badgeColor(score)}`,
                padding: "1px 5px",
                marginLeft: 6,
                cursor: "help",
                verticalAlign: "middle",
              }}
            >
              {score}%
            </span>
          )}
        </div>
        <div className="edit-sec-num">{key}</div>
      </div>

      {score !== null && score < 70 && (
        <div className="edit-dep-warn caution" style={{ marginTop: 6 }}>
          <span className="dep-icon">⚡</span>
          <span>
            Сгенерирован с неполным контекстом ({score}%) — подробности в
            «Контексте генерации» ниже.
          </span>
        </div>
      )}

      <div className="edit-sec-ctx-row">
        <div className="edit-sec-ctx-label">Дополнительный контекст раздела</div>
        <textarea
          className="edit-sec-ctx-field"
          value={secCtx}
          placeholder="Особые требования, акценты, ограничения..."
          onChange={(e) => onSecCtxChange(e.target.value)}
          disabled={disabled}
        />
      </div>

      {/* Превью «какой контекст будет использован» — GET /:key/context */}
      <details
        className="sec-disclosure"
        style={{ marginTop: 6 }}
        onToggle={(e) => {
          if ((e.target as HTMLDetailsElement).open) loadPreview();
        }}
      >
        <summary>Контекст генерации</summary>
        <div className="disclosure-body">
          {previewState === "loading" && "Загрузка…"}
          {previewState === "error" && "Не удалось загрузить превью контекста."}
          {previewState === "ready" && preview && (
            <div style={{ fontFamily: "var(--mono)", fontSize: 10 }}>
              <div style={{ color: "var(--ink-mid)", marginBottom: 4 }}>
                Обязательных: {preview.reqFound}/{preview.reqTotal} · опц.:{" "}
                {preview.optIncluded}/{preview.optTotal} · бюджет:{" "}
                {preview.totalUsed.toLocaleString("ru")}/
                {preview.budget.toLocaleString("ru")} симв.
                {preview.budgetMode === "shrink" &&
                  preview.parentOverhead > 0 &&
                  ` (сжат родителями)`}
              </div>
              {preview.contextText ? (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    maxHeight: 180,
                    overflowY: "auto",
                    margin: 0,
                    fontSize: 9,
                    color: "var(--ink-dim)",
                  }}
                >
                  {preview.contextText}
                </pre>
              ) : (
                <span style={{ color: "var(--ink-dim)" }}>
                  Межсекционный контекст для этого раздела пуст.
                </span>
              )}
            </div>
          )}
        </div>
      </details>

      {key === "graph" && onToggleExtGraphMetrics && (
        <div style={{ margin: "6px 0 0 2px" }}>
          <label
            className="edit-sec-check"
            style={{ fontSize: 10, color: "var(--ink-dim)" }}
          >
            <input
              type="checkbox"
              checked={!!extGraphMetrics}
              onChange={(e) => onToggleExtGraphMetrics(e.target.checked)}
              disabled={disabled}
            />
            Расширенные характеристики
          </label>
        </div>
      )}

      <div className="edit-sec-checks">
        <label className="edit-sec-check">
          <input
            type="checkbox"
            checked={regenChecked}
            disabled={disabled || removeChecked}
            onChange={(e) => onToggleRegen(e.target.checked)}
          />
          Перегенерировать
        </label>
        <label className="edit-sec-check delete-check">
          <input
            type="checkbox"
            checked={removeChecked}
            disabled={disabled || regenChecked}
            onChange={(e) => onToggleRemove(e.target.checked)}
          />
          Удалить
        </label>
      </div>

      {/* Подразделы для точечной перегенерации (>1 — паритет исходника) */}
      {onOpenSubRegen && subsections.length > 1 && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px dashed var(--rule)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 9,
              letterSpacing: 1,
              color: "var(--ink-dim)",
              marginBottom: 6,
            }}
          >
            ПОДРАЗДЕЛЫ (точечная перегенерация)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {subsections.map((name) => (
              <button
                key={name}
                type="button"
                className="edit-sec-btn"
                style={{ fontSize: 9, padding: "4px 10px" }}
                onClick={() => onOpenSubRegen(name)}
                disabled={disabled}
              >
                ⟳ {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
