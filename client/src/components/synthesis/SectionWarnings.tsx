/**
 * Живые предупреждения зависимостей разделов. Беседа 1.5
 * (01 §4.15 п.1: Section Dependency Warnings; граф §11 числит компонент
 * в 1.5).
 *
 * Референс — три бокса формы исходника: #secWarnings (⚠, янтарный),
 * #secRecommendations (💡), #secSubstitutions (⇄). Данные —
 * computeSectionAdvice с сервера (POST /syntheses/advice): items уже
 * несут {icon, text, severity} — здесь только рендер и стили
 * (NEXT-CONTEXT, глава 1.1: «HTML — клиент, 1.5»).
 */
import type { SectionAdviceDto, SectionAdviceItem } from "../../api/syntheses";

function AdviceBox({
  items,
  boxCls,
}: {
  items: SectionAdviceItem[];
  boxCls: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={`rounded border p-2.5 ${boxCls}`}>
      {items.map((it, i) => (
        <div
          key={i}
          className={`flex gap-1.5 font-mono text-[11px] leading-relaxed ${
            it.severity === "hard-conflict" ? "font-semibold text-red" : ""
          }`}
        >
          <span className="shrink-0">{it.icon}</span>
          <span>{it.text}</span>
        </div>
      ))}
    </div>
  );
}

export interface SectionWarningsProps {
  advice: SectionAdviceDto | null;
}

export function SectionWarnings({ advice }: SectionWarningsProps) {
  if (!advice) return null;
  const empty =
    advice.warnings.length === 0 &&
    advice.recommendations.length === 0 &&
    advice.substitutions.length === 0;
  if (empty) return null;
  return (
    <div className="mt-3 space-y-2" data-block="section-warnings">
      <AdviceBox
        items={advice.warnings}
        boxCls="border-gold-light bg-gold/5 text-ink-mid"
      />
      <AdviceBox
        items={advice.recommendations}
        boxCls="border-rule bg-blue-light/40 text-ink-mid"
      />
      <AdviceBox
        items={advice.substitutions}
        boxCls="border-rule bg-black/[0.02] text-ink-dim"
      />
    </div>
  );
}
