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
  3: "равноценная замена",
  2: "частичная замена",
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
      ? "Зависимости добавляемых разделов"
      : affected.length > 0 && !hasUpstream
        ? "Каскад зависимостей"
        : "Каскад и зависимости";

  const descParts: string[] = [];
  if (affected.length > 0) {
    descParts.push(
      "Следующие разделы будут затронуты выбранными действиями, " +
        "но не включены в план. Рекомендуется отметить их для перегенерации.",
    );
  }
  if (missingHard.length > 0) {
    descParts.push(
      "Обязательные зависимости отсутствуют — качество добавляемых разделов будет снижено.",
    );
  } else if (activeSubs.length > 0) {
    descParts.push("Недостающий контекст заменён подстановками.");
  }
  if (affectedModes.length > 0) {
    descParts.push("Сгенерированные режимы затронуты выбранными действиями.");
  }

  return (
    <div className={"cascade-panel visible" + (loading ? " opacity-70" : "")}>
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
                    {w.chars.toLocaleString("ru")} симв. от {labels(w.source)}
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
                  отметить ↑
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
                «{m.label}»: отсутствует обязательный контекст {srcNames}.
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
              «{s.consumerLabel}»: контекст «{s.ctxLabel}» используется как{" "}
              {QUALITY_LABEL[s.quality] ?? "слабая замена"} для «
              {s.replacedLabel}».
            </span>
          </div>
        ))}

        {/* E4. Рекомендации по optional */}
        {recommendations.map((r) => {
          const consumerList = r.consumers.map((c) => `«${c}»`).join(", ");
          const word = r.consumers.length === 1 ? "раздела" : "разделов";
          return (
            <div key={"rec-" + r.src} className="sec-recommend-item">
              <span className="rec-icon">💡</span>
              <span>
                Включение «{r.label}» может улучшить качество {word}{" "}
                {consumerList} (дополнительный контекст).
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
                добавить ↓
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
                отметить ↑
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
