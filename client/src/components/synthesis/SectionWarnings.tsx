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
 *
 * Правка 2026-09-02 (единство стилей с исходником): три бокса рисуются
 * классами исходника — .sec-warnings/.sec-warning-item (+ .warn-icon),
 * .sec-recommendations/.sec-recommend-item и .sec-substitutions/
 * .sec-substituted-item (+ .rec-icon).
 */
import type { SectionAdviceDto, SectionAdviceItem } from "../../api/syntheses";

function AdviceBox({
  items,
  boxCls,
  itemCls,
  iconCls,
}: {
  items: SectionAdviceItem[];
  boxCls: string;
  itemCls: string;
  iconCls: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={boxCls}>
      {items.map((it, i) => (
        <div
          key={i}
          className={itemCls}
          style={
            it.severity === "hard-conflict" ? { fontWeight: 600 } : undefined
          }
        >
          <span className={iconCls}>{it.icon}</span>
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
    <div data-block="section-warnings">
      <AdviceBox
        items={advice.warnings}
        boxCls="sec-warnings"
        itemCls="sec-warning-item"
        iconCls="warn-icon"
      />
      <AdviceBox
        items={advice.recommendations}
        boxCls="sec-recommendations"
        itemCls="sec-recommend-item"
        iconCls="rec-icon"
      />
      <AdviceBox
        items={advice.substitutions}
        boxCls="sec-substitutions"
        itemCls="sec-substituted-item"
        iconCls="rec-icon"
      />
    </div>
  );
}
