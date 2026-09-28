/**
 * Панель совместимости параметров (Advisor v2). Беседа 1.5
 * (01 §4.15 п.2; NEXT-CONTEXT глава 1.1: рендер и CSS-классы чипов —
 * клиент; icon/title приходят с сервера).
 *
 * Референс — #compatPanel исходника: заголовок с иконкой severity и
 * сворачиванием (toggleCompatPanel), описание, чипы по разделам
 * (chipClassForRating), советы.
 *
 * Беседа 3.2 — закрыт долг §12 (applyReplacement / updateCompatAdvisor /
 * toggleCompatPanel, заведён 1.1):
 *  - кнопки «Рекомендуемые замены» (рендер replacements из updateCompatAdvisor
 *    [7499–7517]: «СОХРАНИТЬ УРОВЕНЬ → ЗАМЕНИТЬ МЕТОД» / «СОХРАНИТЬ МЕТОД →
 *    ЗАМЕНИТЬ УРОВЕНЬ», label + rating); клик — onApplyReplacement(param,
 *    value): форма меняет method/synthLevel, пересчёт advice/warnings/
 *    estimate идёт автоматически через deps эффектов (React-аналог цепочки
 *    applyReplacement → updateCompatAdvisor → updateSectionWarnings);
 *  - блок рекомендации порядка генерации (orderAdvice [7454–7476]):
 *    «⚠ Рекомендуется … порядок» / «ℹ Может помочь …» + кнопка
 *    переключения; при совпадении — «✓ Текущий порядок … оптимален»;
 *  - автораскрытие панели при conflict/hard-conflict [7521–7523]
 *    (toggleCompatPanel = сворачивание вручную; смена entry с конфликтом
 *    разворачивает заново).
 *
 * Правка 2026-09-02 (единство стилей с исходником): разметка приведена
 * к #compatPanel [4075–4098] — .compat-panel[data-severity] → .compat-header
 * (.compat-badge + .compat-icon + .compat-toggle) → .compat-body >
 * .compat-body-inner (.compat-desc, .compat-section-chips/.compat-chip,
 * .compat-section-advice/.advice-label, .compat-replacements/
 * .compat-replace-btn/.replace-rating). Раскрытие — класс .open на панели,
 * как в toggleCompatPanel.
 */
import { useEffect, useState } from "react";

import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";

import type { CompatEntryDto } from "../../api/syntheses";
import { tl } from "@philosynth/shared/i18n/t";
import { tData } from "@philosynth/shared/i18n/data";

/** chipClassForRating [7325] — дословно */
function chipCls(rating: string): string {
  if (rating === "★★★" || rating === "★★") return "chip-synergy";
  if (rating === "★") return "chip-ok";
  if (rating === "≈") return "chip-tension";
  if (rating === "✗") return "chip-conflict";
  if (rating === "✗✗") return "chip-hard-conflict";
  return "chip-ok";
}

export interface CompatAdvisorProps {
  entry: CompatEntryDto | null;
  /** Показывать чипы только выбранных разделов */
  selectedSections: readonly string[];
  /** Текущий порядок генерации — для orderAdvice (беседа 3.2) */
  generationOrder?: string | undefined;
  /** applyReplacement [7365]: param 'method'|'level' → смена значения
   *  формы; 'order' — переключение порядка генерации (кнопка orderAdvice).
   *  Не передан — кнопки не рисуются (обратная совместимость). */
  onApplyReplacement?:
    | ((param: "method" | "level" | "order", value: string) => void)
    | undefined;
}

export function CompatAdvisor({
  entry,
  selectedSections,
  generationOrder,
  onApplyReplacement,
}: CompatAdvisorProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Автораскрытие при конфликтах [7521]: смена entry с severity
  // conflict/hard-conflict разворачивает панель (ручное сворачивание
  // toggleCompatPanel при спокойных severity сохраняется)
  const severity = entry?.severity ?? null;
  useEffect(() => {
    if (severity === "conflict" || severity === "hard-conflict")
      setCollapsed(false);
  }, [severity]);

  if (!entry) return null;

  const chips = selectedSections
    .map((key) => ({
      key,
      label: tData((KEY_LABELS as Record<string, string>)[key] ?? key),
      rating: entry.sections[key] ?? "★",
    }))
    .filter((c) => c.key !== "sum");

  const repl = entry.replacements;
  const hasReplacements = !!(
    repl &&
    ((repl.keepLevel && repl.keepLevel.length) ||
      (repl.keepMethod && repl.keepMethod.length))
  );

  // orderAdvice [7454]: несовпадение текущего порядка с рекомендованным
  const oa = entry.orderAdvice;
  const orderMismatch =
    !!oa && !!generationOrder && generationOrder !== oa.recommended;
  const orderLabel =
    oa?.recommended === "genetic" ? tl("synthesis.compatAdvisor.genetic", "генетический") : tl("synthesis.compatAdvisor.architectural", "архитектурный");

  return (
    <div
      data-block="compat-panel"
      data-severity={entry.severity}
      className={collapsed ? "compat-panel" : "compat-panel open"}
    >
      <div
        className="compat-header"
        onClick={() => setCollapsed((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setCollapsed((v) => !v);
        }}
      >
        <div className="compat-badge">
          <span className="compat-icon">{entry.icon}</span>
          <span>{entry.title}</span>
          <span className="replace-rating">{entry.rating}</span>
        </div>
        <span className="compat-toggle">▼</span>
      </div>

      <div className="compat-body">
        <div className="compat-body-inner">
          <div className="compat-desc">{tData(entry.desc)}</div>

          {chips.length > 0 && (
            <div className="compat-section-chips">
              {chips.map((c) => (
                <span
                  key={c.key}
                  className={`compat-chip ${chipCls(c.rating)}`}
                  title={`${c.label}: ${c.rating}`}
                >
                  {c.rating} {c.label}
                </span>
              ))}
            </div>
          )}

          {entry.advice && (
            <div className="compat-section-advice">
              <span className="advice-label">{tl("synthesis.compatAdvisor.sectionAdvice", "Совет по разделам")}</span>
              <span>{tData(entry.advice)}</span>
            </div>
          )}

          {/* Рекомендация порядка генерации (orderAdvice [7454], 3.2) */}
          {oa && (
            <div className="compat-section-advice">
              <span className="advice-label">{tl("synthesis.compatAdvisor.generationOrder", "Порядок генерации")}</span>
              {orderMismatch ? (
                <span>
                  <span style={{ color: "var(--gold)" }}>
                    {oa.strength === "recommended" ? tl("synthesis.compatAdvisor.recommended", "⚠ Рекомендуется") : tl("synthesis.compatAdvisor.mayHelp", "ℹ Может помочь")}{" "}
                    <strong>{orderLabel}</strong> {tl("synthesis.compatAdvisor.orderSuffix", "порядок.")}
                  </span>{" "}
                  {oa.text}
                  {onApplyReplacement && (
                    <button
                      type="button"
                      className="compat-replace-btn"
                      style={{ marginLeft: 8 }}
                      onClick={() => onApplyReplacement("order", oa.recommended)}
                    >
                      {tl("synthesis.compatAdvisor.switchTo", "Переключить на {orderLabel}", { orderLabel })}
                    </button>
                  )}
                </span>
              ) : (
                <span>
                  {tl("synthesis.compatAdvisor.orderOptimal", "✓ Текущий порядок ({orderLabel}) оптимален для этой комбинации. {text}", { orderLabel, text: oa.text })}
                </span>
              )}
            </div>
          )}

          {/* Кнопки замен (replacements [7499], 3.2) */}
          {hasReplacements && onApplyReplacement && (
            <div className="compat-replacements">
              <div className="compat-replacements-title">
                {tl("synthesis.compatAdvisor.recommendedReplacements", "Рекомендуемые замены")}
              </div>
              {repl?.keepLevel && repl.keepLevel.length > 0 && (
                <>
                  <div className="compat-replacements-title">
                    {tl("synthesis.compatAdvisor.keepLevelChangeMethod", "СОХРАНИТЬ УРОВЕНЬ → ЗАМЕНИТЬ МЕТОД:")}
                  </div>
                  <div>
                    {repl.keepLevel.map((r) => (
                      <button
                        key={r.param + r.value}
                        type="button"
                        className="compat-replace-btn"
                        onClick={() =>
                          onApplyReplacement(
                            r.param === "level" ? "level" : "method",
                            r.value,
                          )
                        }
                      >
                        {r.label}
                        <span className="replace-rating">{r.rating}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {repl?.keepMethod && repl.keepMethod.length > 0 && (
                <>
                  <div className="compat-replacements-title">
                    {tl("synthesis.compatAdvisor.keepMethodChangeLevel", "СОХРАНИТЬ МЕТОД → ЗАМЕНИТЬ УРОВЕНЬ:")}
                  </div>
                  <div>
                    {repl.keepMethod.map((r) => (
                      <button
                        key={r.param + r.value}
                        type="button"
                        className="compat-replace-btn"
                        onClick={() =>
                          onApplyReplacement(
                            r.param === "level" ? "level" : "method",
                            r.value,
                          )
                        }
                      >
                        {r.label}
                        <span className="replace-rating">{r.rating}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
