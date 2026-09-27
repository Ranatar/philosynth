/**
 * Панель каскада зависимостей. Беседа 2.3 (запрос 1, п. 5).
 *
 * Порт РЕНДЕРА updateLiveCascade [19139] (секции E1–E5); расчёт —
 * серверный analyzeImpact через POST /plans/impact (данные приходят
 * пропом impact, запрос делает EditModal с debounce). Разметка и тексты
 * — 1:1 с исходником:
 *  E1 downstream: затронутые вне плана, topo-порядок (сервер),
 *     весовые подсказки factualWeights, кнопка «отметить ↑»;
 *  E2 upstream: жёсткие потери (красные .sec-warning-item, кнопки «+»);
 *  E3 активные подстановки (.sec-substituted-item, качество словами);
 *  E4 рекомендации по optional (.sec-recommend-item, «добавить ↓»);
 *  E5 затронутые режимы (наполняется с 4.1: getAffectedModes сервера
 *     видит строки mode_results — до первого запуска режима пусто).
 * Заголовок панели — три варианта, как в исходнике; невидимость при
 * пустом импакте (ветка D).
 *
 * Адаптация: covered/exposed для E1 исходник читал из чекбоксов DOM —
 * здесь по Set regen из пропов; номер раздела § — из summaries.
 */
import type {
  CascadeImpactDto,
} from "@philosynth/shared/types/edit-plan";
import { tl } from "@philosynth/shared/i18n/t";

export interface CascadePanelProps {
  impact: CascadeImpactDto | null;
  loading: boolean;
  /** Отмеченные к перегенерации (covered-состояние E1) */
  regenChecked: ReadonlySet<string>;
  /** key → номер раздела (для «§ N — Метка») */
  sectionNums: ReadonlyMap<string, number>;
  /** key → метка раздела */
  labels: (key: string) => string;
  onMarkRegen: (key: string) => void;
  onMarkAdd: (key: string) => void;
  /** Отмеченные к перегенерации пары `modeKey:index` (E5, с 4.1) */
  modeRegenChecked: ReadonlySet<string>;
  /** Кнопка «отметить ↑» E5 [19483–19493] — ставит чекбокс карточки */
  onMarkModeRegen: (modeKey: string, index: number) => void;
}

const QUALITY_LABEL: Record<number, string> = {
  3: tl("edit.cascadePanel.equivalentReplacement", "равноценная замена"),
  2: tl("edit.cascadePanel.partialReplacement", "частичная замена"),
};

export function CascadePanel({
  impact,
  loading,
  regenChecked,
  sectionNums,
  labels,
  onMarkRegen,
  onMarkAdd,
  modeRegenChecked,
  onMarkModeRegen,
}: CascadePanelProps) {
  const affected = impact?.affectedSections ?? [];
  const missingHard = impact?.missingHard ?? [];
  const activeSubs = impact?.activeSubstitutions ?? [];
  const recommendations = impact?.recommendations ?? [];
  const affectedModes = impact?.affectedModes ?? [];

  const hasUpstream =
    missingHard.length > 0 ||
    activeSubs.length > 0 ||
    recommendations.length > 0;
  const visible =
    affected.length > 0 || hasUpstream || affectedModes.length > 0;

  // Ветка D исходника: пустой импакт — панель скрыта
  if (!visible) return null;

  const title =
    hasUpstream && affected.length === 0
      ? tl("edit.cascadePanel.addedSectionDeps", "Зависимости добавляемых разделов")
      : affected.length > 0 && !hasUpstream
        ? tl("edit.cascadePanel.dependencyCascade", "Каскад зависимостей")
        : tl("edit.cascadePanel.cascadeAndDeps", "Каскад и зависимости");

  const descParts: string[] = [];
  if (affected.length > 0) {
    descParts.push(
      tl("edit.cascadePanel.affectedSectionsLead", "Следующие разделы будут затронуты выбранными действиями, ") +
        tl("edit.cascadePanel.affectedSectionsTail", "но не включены в план. Рекомендуется отметить их для перегенерации."),
    );
  }
  if (missingHard.length > 0) {
    descParts.push(
      tl("edit.cascadePanel.requiredDepsMissing", "Обязательные зависимости отсутствуют — качество добавляемых разделов будет снижено."),
    );
  } else if (activeSubs.length > 0) {
    descParts.push(tl("edit.cascadePanel.contextSubstituted", "Недостающий контекст заменён подстановками."));
  }
  if (affectedModes.length > 0) {
    descParts.push(tl("edit.cascadePanel.modesAffected", "Сгенерированные режимы затронуты выбранными действиями."));
  }

  return (
    <div className="cascade-panel visible"
      style={loading ? { opacity: 0.7 } : undefined}>
      <div className="cascade-title">
        <span>⚡</span>
        <span>{title}</span>
      </div>
      {descParts.length > 0 && (
        <div className="cascade-desc">{descParts.join(" ")}</div>
      )}
      <div className="cascade-list">
        {/* E1. Downstream */}
        {affected.map((depKey) => {
          const num = sectionNums.get(depKey) ?? "?";
          const isCovered = regenChecked.has(depKey);
          const weights = impact?.factualWeights[depKey] ?? [];
          return (
            <div
              key={"aff-" + depKey}
              className={
                "cascade-item-info " + (isCovered ? "covered" : "exposed")
              }
            >
              <span>
                {isCovered ? "✓" : "⚡"} § {num} — {labels(depKey)}
                {weights.map((w) => (
                  <span
                    key={w.source}
                    style={{
                      fontSize: 9,
                      color: "var(--gold)",
                      marginLeft: 6,
                    }}
                  >
                    {tl("edit.cascadePanel.charsFrom", "{chars} симв. от {source}", { chars: w.chars.toLocaleString("ru"), source: labels(w.source) })}
                  </span>
                ))}
              </span>
              {!isCovered && (
                <button
                  type="button"
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    border: "1px solid var(--gold)",
                    background: "transparent",
                    color: "var(--gold)",
                    padding: "2px 8px",
                    cursor: "pointer",
                    marginLeft: "auto",
                  }}
                  onClick={() => onMarkRegen(depKey)}
                >
                  {tl("edit.cascadePanel.markUp", "отметить ↑")}
                </button>
              )}
            </div>
          );
        })}

        {/* E2. Upstream: жёсткие потери */}
        {missingHard.map((m) => {
          const srcNames = m.sources.map((s) => `«${s.label}»`).join(", ");
          const seenSrc = new Set<string>();
          return (
            <div
              key={"hard-" + m.consumer}
              className="sec-warning-item"
              style={{
                borderColor: "var(--red)",
                background: "#fff0f0",
                color: "var(--red)",
              }}
            >
              <span className="warn-icon">⚠</span>
              <span>
                {tl("edit.cascadePanel.missingRequiredContext", "«{label}»: отсутствует обязательный контекст {srcNames}.", { label: m.label, srcNames })}
              </span>
              {m.sources
                .filter((s) => {
                  if (seenSrc.has(s.src)) return false;
                  seenSrc.add(s.src);
                  return true;
                })
                .map((s) => (
                  <button
                    key={s.src}
                    type="button"
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 9,
                      border: "1px solid var(--red)",
                      background: "transparent",
                      color: "var(--red)",
                      padding: "2px 6px",
                      cursor: "pointer",
                      marginLeft: 4,
                      flexShrink: 0,
                    }}
                    onClick={() => onMarkAdd(s.src)}
                  >
                    + {labels(s.src)}
                  </button>
                ))}
            </div>
          );
        })}

        {/* E3. Активные подстановки */}
        {activeSubs.map((s, i) => (
          <div key={"sub-" + i} className="sec-substituted-item">
            <span className="rec-icon">⇄</span>
            <span>
              {tl("edit.cascadePanel.contextUsedAs", "«{consumerLabel}»: контекст «{ctxLabel}» используется как", { consumerLabel: s.consumerLabel, ctxLabel: s.ctxLabel })}
              {QUALITY_LABEL[s.quality] ?? tl("edit.cascadePanel.weakReplacement", "слабая замена")} {tl("edit.cascadePanel.forSection", "для «{replacedLabel}».", { replacedLabel: s.replacedLabel })}
            </span>
          </div>
        ))}

        {/* E4. Рекомендации по optional */}
        {recommendations.map((r) => {
          const consumerList = r.consumers.map((c) => `«${c}»`).join(", ");
          const word = r.consumers.length === 1 ? tl("edit.cascadePanel.sectionGen", "раздела") : tl("common.sectionsGen", "разделов");
          return (
            <div key={"rec-" + r.src} className="sec-recommend-item">
              <span className="rec-icon">💡</span>
              <span>
                {tl("edit.cascadePanel.inclusionMayImprove", "Включение «{label}» может улучшить качество {word} {consumerList} (дополнительный контекст).", { label: r.label, word, consumerList })}
              </span>
              <button
                type="button"
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 9,
                  border: "1px solid var(--blue-corp)",
                  background: "transparent",
                  color: "var(--blue-corp)",
                  padding: "2px 8px",
                  cursor: "pointer",
                  marginLeft: "auto",
                  flexShrink: 0,
                }}
                onClick={() => onMarkAdd(r.src)}
              >
                {tl("edit.cascadePanel.addDown", "добавить ↓")}
              </button>
            </div>
          );
        })}

        {/* E5. Затронутые режимы (результаты режимов — с беседы 4.1) */}
        {affectedModes.map((am) => (
          <div
            key={"mode-" + am.modeKey + "-" + am.index}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--mono)",
              fontSize: 10,
              color: "var(--violet)",
              padding: "5px 10px",
              background: "var(--violet-light)",
              border: "1px solid rgba(107,0,170,0.25)",
            }}
          >
            <span>
              ◈ {am.title}: {am.reason}
            </span>
            {!modeRegenChecked.has(am.modeKey + ":" + am.index) && (
              <button
                type="button"
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 9,
                  border: "1px solid var(--violet)",
                  background: "transparent",
                  color: "var(--violet)",
                  padding: "2px 8px",
                  cursor: "pointer",
                  marginLeft: "auto",
                }}
                onClick={() => onMarkModeRegen(am.modeKey, am.index)}
              >
                {tl("edit.cascadePanel.markUp", "отметить ↑")}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
