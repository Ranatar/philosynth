/**
 * Выбор разделов документа. Беседа 1.5 (запрос 1, п. 4).
 *
 * Референс — блок #sectionsRow исходника: чекбокс раздела + кнопка «+»
 * (toggleSecCtx) + скрытое textarea secCtx-{key}; под «Граф категорий» —
 * чекбокс «Расширенные характеристики» (v10, extGraphMetrics), видимый
 * ТОЛЬКО при выбранном графе (sync с secGraph — 07, тест 5).
 *
 * Порядок и метки — SECTION_CHECKBOX_IDS / SECTION_LABELS / SEC_ID_TO_KEY
 * (shared, дословно из исходника). Раздел sum чекбокса не имеет — он
 * обязателен и добавляется сервером первым в sectionOrder.
 *
 * «◈ Пригодность к дальнейшему синтезу» (secSynthReady) добавлен беседой
 * 1.5b (закрыт TODO(1.5b) главы 1.5 NEXT-CONTEXT): чекбокс + подсказка
 * synthReadyHint [5116–5142]; автовключение SYNTH_READY_SECTIONS при
 * включении делает SynthesisForm (владелец sections) — onSynthReadyChange.
 * Подсказка про «Анализ названия» рендерится здесь: selected уже в пропсах.
 *
 * Правка 2026-09-02 (единство стилей с исходником): разметка приведена
 * к классам исходника — .checkboxes-row.sections-row → .sec-item-wrap →
 * .sec-item-row (.checkbox-item + .sec-ctx-btn) + .sec-ctx-field.
 * Состояние «выбран» в исходнике ставит класс ._checked на обёртку и
 * на .checkbox-item (updateCheckboxState), кнопка контекста получает
 * .open — здесь то же самое делает React по selected/openCtx.
 */
import { useState } from "react";

import {
  SEC_ID_TO_KEY,
  SECTION_CHECKBOX_IDS,
  SECTION_LABELS,
  type SectionKey,
} from "@philosynth/shared/constants/section-labels";

export type PickableSectionKey = Exclude<SectionKey, "sum">;

/** SYNTH_READY_SECTIONS [5114] — дословно */
export const SYNTH_READY_SECTIONS: readonly PickableSectionKey[] = [
  "graph",
  "glossary",
  "theses",
  "dialogue",
  "critique",
  "capsule",
];

export interface SectionPickerProps {
  selected: readonly PickableSectionKey[];
  onChange: (next: PickableSectionKey[]) => void;
  /** Доп. контекст per-section (secCtx) — только непустые уходят в POST */
  sectionContexts: Readonly<Record<string, string>>;
  onSectionContextChange: (key: PickableSectionKey, value: string) => void;
  extGraphMetrics: boolean;
  onExtGraphMetricsChange: (value: boolean) => void;
  /** ◈ Пригодность к дальнейшему синтезу (secSynthReady, беседа 1.5b) */
  synthReady: boolean;
  onSynthReadyChange: (checked: boolean) => void;
}

export function SectionPicker({
  selected,
  onChange,
  sectionContexts,
  onSectionContextChange,
  extGraphMetrics,
  onExtGraphMetricsChange,
  synthReady,
  onSynthReadyChange,
}: SectionPickerProps) {
  const selectedSet = new Set(selected);
  /** Какие secCtx-поля раскрыты (аналог toggleSecCtx исходника) */
  const [openCtx, setOpenCtx] = useState<Set<PickableSectionKey>>(new Set());

  const toggleSection = (key: PickableSectionKey) => {
    if (selectedSet.has(key)) {
      onChange(selected.filter((k) => k !== key));
    } else {
      onChange([...selected, key]);
    }
  };

  const toggleCtx = (key: PickableSectionKey) => {
    setOpenCtx((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="form-group full">
      <div className="form-label">Разделы Документа</div>
      <div className="form-sublabel">
        Выберите, какие разделы включить в итоговый документ. Исполнительное
        резюме включается всегда.
      </div>

      <div className="checkboxes-row sections-row">
        {SECTION_CHECKBOX_IDS.map((id) => {
          const key = SEC_ID_TO_KEY[id];
          const checked = selectedSet.has(key);
          const ctxOpen = openCtx.has(key);
          const ctxValue = sectionContexts[key] ?? "";
          const isCapsule = key === "capsule";
          return (
            <div
              key={id}
              className={[
                "sec-item-wrap",
                checked ? "_checked" : "",
                isCapsule ? "capsule-check" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="sec-item-row">
                <label
                  className={[
                    "checkbox-item",
                    isCapsule ? "capsule-check-item" : "",
                    checked ? "_checked" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSection(key)}
                  />
                  {SECTION_LABELS[id]}
                </label>
                <button
                  type="button"
                  title="Доп. контекст для раздела"
                  onClick={() => toggleCtx(key)}
                  className={ctxOpen ? "sec-ctx-btn open" : "sec-ctx-btn"}
                >
                  {ctxOpen ? "−" : "+"}
                </button>
              </div>

              {/* v10: extGraphMetrics — под «Граф категорий», виден только
                  при выбранном графе */}
              {key === "graph" && checked && (
                <div
                  className="sec-item-row"
                  style={{ marginLeft: 28, marginTop: 2 }}
                >
                  <label
                    className="checkbox-item"
                    style={{ fontSize: 11, color: "var(--ink-dim)" }}
                  >
                    <input
                      type="checkbox"
                      checked={extGraphMetrics}
                      onChange={(e) => onExtGraphMetricsChange(e.target.checked)}
                    />
                    Расширенные характеристики
                  </label>
                </div>
              )}

              <textarea
                value={ctxValue}
                onChange={(e) => onSectionContextChange(key, e.target.value)}
                placeholder={`Особые требования, акценты, ограничения для «${SECTION_LABELS[id]}»...`}
                className={ctxOpen ? "sec-ctx-field open" : "sec-ctx-field"}
              />
            </div>
          );
        })}
      </div>

      {/* ◈ Пригодность к дальнейшему синтезу (secSynthReady, 1.5b).
          Включение гарантирует комплект разделов мета-синтеза —
          автовключение делает форма (onSynthReadyChange [5116]) */}
      <div className="synth-ready-row">
        <label
          className={
            synthReady ? "checkbox-item _checked" : "checkbox-item"
          }
        >
          <input
            type="checkbox"
            checked={synthReady}
            onChange={(e) => onSynthReadyChange(e.target.checked)}
          />
          ◈ Пригодность к дальнейшему синтезу
        </label>
        <div className="form-sublabel">
          Включает разделы, обязательные для использования концепции как
          участника мета-синтеза (граф, глоссарий, тезисы, диалог, критика,
          капсула).
        </div>
        {/* synthReadyHint [5580–5589]: совет про «Анализ названия» */}
        {synthReady && !selectedSet.has("name") && (
          <div className="sec-recommendations">
            <div className="sec-recommend-item">
              <span className="rec-icon">ℹ</span>
              <span>
                Совет: для качественной капсулы полезен раздел «Анализ
                названия». Если он не выбран, задайте название вручную
                (кнопка ✎ в шапке) после генерации.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
