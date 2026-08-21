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
 */
import { useEffect, useState } from "react";

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

const REPLACE_BTN_CLS =
  "rounded border border-rule px-2 py-1 text-[11px] text-ink-mid " +
  "hover:border-gold hover:text-gold";

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
      label: (KEY_LABELS as Record<string, string>)[key] ?? key,
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
    oa?.recommended === "genetic" ? "генетический" : "архитектурный";

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

          {/* Рекомендация порядка генерации (orderAdvice [7454], 3.2) */}
          {oa && (
            <div className="mt-2 font-mono text-[11px] leading-relaxed">
              <span className="text-[9px] tracking-widest text-ink-dim">
                ПОРЯДОК ГЕНЕРАЦИИ{" "}
              </span>
              {orderMismatch ? (
                <>
                  <span className="text-gold">
                    {oa.strength === "recommended" ? "⚠ Рекомендуется" : "ℹ Может помочь"}{" "}
                    <strong>{orderLabel}</strong> порядок.
                  </span>{" "}
                  <span className="text-ink-mid">{oa.text}</span>
                  {onApplyReplacement && (
                    <button
                      type="button"
                      className={REPLACE_BTN_CLS + " ml-2"}
                      onClick={() =>
                        onApplyReplacement("order", oa.recommended)
                      }
                    >
                      Переключить на {orderLabel}
                    </button>
                  )}
                </>
              ) : (
                <span className="text-ink-mid">
                  ✓ Текущий порядок ({orderLabel}) оптимален для этой
                  комбинации. {oa.text}
                </span>
              )}
            </div>
          )}

          {/* Кнопки замен (replacements [7499], 3.2) */}
          {hasReplacements && onApplyReplacement && (
            <div className="mt-3">
              {repl?.keepLevel && repl.keepLevel.length > 0 && (
                <>
                  <div className="mb-1.5 font-mono text-[9px] tracking-widest text-ink-dim">
                    СОХРАНИТЬ УРОВЕНЬ → ЗАМЕНИТЬ МЕТОД:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {repl.keepLevel.map((r) => (
                      <button
                        key={r.param + r.value}
                        type="button"
                        className={REPLACE_BTN_CLS}
                        onClick={() =>
                          onApplyReplacement(
                            r.param === "level" ? "level" : "method",
                            r.value,
                          )
                        }
                      >
                        {r.label}
                        <span className="ml-1 text-[10px] text-gold">
                          {r.rating}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {repl?.keepMethod && repl.keepMethod.length > 0 && (
                <>
                  <div className="mb-1.5 mt-2 font-mono text-[9px] tracking-widest text-ink-dim">
                    СОХРАНИТЬ МЕТОД → ЗАМЕНИТЬ УРОВЕНЬ:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {repl.keepMethod.map((r) => (
                      <button
                        key={r.param + r.value}
                        type="button"
                        className={REPLACE_BTN_CLS}
                        onClick={() =>
                          onApplyReplacement(
                            r.param === "level" ? "level" : "method",
                            r.value,
                          )
                        }
                      >
                        {r.label}
                        <span className="ml-1 text-[10px] text-gold">
                          {r.rating}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
