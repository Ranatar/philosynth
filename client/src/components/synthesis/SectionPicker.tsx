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
 * «◈ Пригодность к дальнейшему синтезу» (secSynthReady) осознанно НЕ
 * портируется здесь: гарантия комплекта разделов для мета-синтеза —
 * вместе с Unified Concept Pool (беседа 1.5b/3.2).
 */
import { useState } from "react";

import {
  SEC_ID_TO_KEY,
  SECTION_CHECKBOX_IDS,
  SECTION_LABELS,
  type SectionKey,
} from "@philosynth/shared/constants/section-labels";

export type PickableSectionKey = Exclude<SectionKey, "sum">;

export interface SectionPickerProps {
  selected: readonly PickableSectionKey[];
  onChange: (next: PickableSectionKey[]) => void;
  /** Доп. контекст per-section (secCtx) — только непустые уходят в POST */
  sectionContexts: Readonly<Record<string, string>>;
  onSectionContextChange: (key: PickableSectionKey, value: string) => void;
  extGraphMetrics: boolean;
  onExtGraphMetricsChange: (value: boolean) => void;
}

export function SectionPicker({
  selected,
  onChange,
  sectionContexts,
  onSectionContextChange,
  extGraphMetrics,
  onExtGraphMetricsChange,
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
    <div>
      <div className="text-sm font-semibold text-ink">Разделы документа</div>
      <div className="mt-1 font-mono text-[10px] leading-relaxed text-ink-dim">
        Выберите, какие разделы включить в итоговый документ. Исполнительное
        резюме включается всегда.
      </div>

      {/* responsive: 1 колонка на мобильных, 2 на desktop (07) */}
      <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">
        {SECTION_CHECKBOX_IDS.map((id) => {
          const key = SEC_ID_TO_KEY[id];
          const checked = selectedSet.has(key);
          const ctxOpen = openCtx.has(key);
          const ctxValue = sectionContexts[key] ?? "";
          return (
            <div key={id} className="min-w-0">
              <div className="flex items-center gap-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-xs text-ink-mid hover:text-ink">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSection(key)}
                    className="accent-[var(--gold)]"
                  />
                  <span className="truncate">{SECTION_LABELS[id]}</span>
                </label>
                <button
                  type="button"
                  title="Доп. контекст для раздела"
                  onClick={() => toggleCtx(key)}
                  className={`shrink-0 rounded border px-1.5 font-mono text-[10px] leading-4 ${
                    ctxValue.trim()
                      ? "border-gold text-gold"
                      : "border-rule text-ink-dim hover:border-rule-strong hover:text-ink-mid"
                  }`}
                >
                  {ctxOpen ? "−" : "+"}
                </button>
              </div>

              {/* v10: extGraphMetrics — под «Граф категорий», виден только
                  при выбранном графе */}
              {key === "graph" && checked && (
                <label className="ml-6 mt-0.5 flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-dim hover:text-ink-mid">
                  <input
                    type="checkbox"
                    checked={extGraphMetrics}
                    onChange={(e) => onExtGraphMetricsChange(e.target.checked)}
                    className="accent-[var(--gold)]"
                  />
                  Расширенные характеристики
                </label>
              )}

              {ctxOpen && (
                <textarea
                  value={ctxValue}
                  onChange={(e) => onSectionContextChange(key, e.target.value)}
                  placeholder={`Особые требования, акценты, ограничения для «${SECTION_LABELS[id]}»...`}
                  className="mt-1 h-14 w-full rounded border border-rule bg-white p-2 font-mono text-[11px] text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
