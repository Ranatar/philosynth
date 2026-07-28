/**
 * Панель совместимости параметров (Advisor v2). Беседа 1.5
 * (01 §4.15 п.2; NEXT-CONTEXT глава 1.1: рендер и CSS-классы чипов —
 * клиент; icon/title приходят с сервера).
 *
 * Референс — #compatPanel исходника: заголовок с иконкой severity и
 * сворачиванием (toggleCompatPanel), описание, чипы по разделам
 * (chipClassForRating), советы. Кнопки «Рекомендуемые замены»
 * (applyReplacement) — TODO беседы 1.5+: требуют replacements из entry
 * и мутации формы; в первом рендере панель показывает текстовый advice.
 */
import { useState } from "react";

import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";

import type { CompatEntryDto } from "../../api/syntheses";

/** Зеркало chipClassForRating [7325] в терминах Tailwind-токенов */
function chipCls(rating: string): string {
  if (rating === "★★★" || rating === "★★")
    return "border-green-check text-green-check";
  if (rating === "★") return "border-rule-strong text-ink-mid";
  if (rating === "≈") return "border-gold text-gold";
  if (rating === "✗") return "border-red text-red";
  if (rating === "✗✗") return "border-red bg-red/10 font-semibold text-red";
  return "border-rule text-ink-dim";
}

export interface CompatAdvisorProps {
  entry: CompatEntryDto | null;
  /** Показывать чипы только выбранных разделов */
  selectedSections: readonly string[];
}

export function CompatAdvisor({ entry, selectedSections }: CompatAdvisorProps) {
  const [collapsed, setCollapsed] = useState(false);
  if (!entry) return null;

  const chips = selectedSections
    .map((key) => ({
      key,
      label: (KEY_LABELS as Record<string, string>)[key] ?? key,
      rating: entry.sections[key] ?? "★",
    }))
    .filter((c) => c.key !== "sum");

  return (
    <div
      data-block="compat-panel"
      data-severity={entry.severity}
      className="mt-3 rounded border border-rule bg-white"
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm text-ink">
          <span className="font-mono text-gold">{entry.icon}</span>
          <span className="font-semibold">{entry.title}</span>
          <span className="font-mono text-[10px] text-ink-dim">
            ({entry.rating})
          </span>
        </span>
        <span className="font-mono text-xs text-ink-dim">
          {collapsed ? "▲" : "▼"}
        </span>
      </button>

      {!collapsed && (
        <div className="border-t border-rule px-3 py-2.5">
          <div className="text-[12px] leading-relaxed text-ink-mid">
            {entry.desc}
          </div>
          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span
                  key={c.key}
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${chipCls(c.rating)}`}
                  title={`${c.label}: ${c.rating}`}
                >
                  {c.label} {c.rating}
                </span>
              ))}
            </div>
          )}
          {entry.advice && (
            <div className="mt-2 font-mono text-[11px] text-ink-dim">
              Совет: {entry.advice}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
