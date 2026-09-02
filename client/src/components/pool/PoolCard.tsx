/**
 * Карточка концепции в Unified Concept Pool. Беседа 1.5b (запрос 1, п. 2).
 *
 * Референс — разметка renderPoolConcepts [5025–5103]: 4 колонки
 * (чекбокс ☑ «Синтез», радио ◉ «Просм.», инфо, кнопки ✎/✕) + строка
 * предупреждения о непригодности. Метки метода/уровня — ML/SL (shared),
 * порядок — ORDER_LABELS (локальная копия константы [5023] — двухзначный
 * словарь UI-меток, в shared не выносился).
 *
 * esc() исходника не нужен: React экранирует текст сам.
 *
 * Правка 2026-09-02 (единство стилей с исходником): классы .pool-card
 * (.selected/.synth-on), .pool-card-controls, .pool-card-info,
 * .pool-card-name/-basis/-meta, .pool-card-btns/.pool-card-btn.remove,
 * .pool-card-synth-warn — как в renderPoolConcepts [5056–5089].
 */
import { Link } from "react-router-dom";

import { ML, SL } from "@philosynth/shared/constants/labels";

import type { PoolConceptEntry } from "../../utils/concept-file";

/** ORDER_LABELS [5023] — дословно */
const ORDER_LABELS: Readonly<Record<string, string>> = {
  genetic: "генетич.",
  architectural: "архитект.",
};

export interface PoolCardProps {
  concept: PoolConceptEntry;
  onToggleSynth: (id: string) => void;
  onSelectForViewing: (id: string) => void;
  onRename: (id: string) => void;
  onRemove: (id: string) => void;
}

export function PoolCard({
  concept: c,
  onToggleSynth,
  onSelectForViewing,
  onRename,
  onRemove,
}: PoolCardProps) {
  const methodLabel =
    (ML as Record<string, string>)[c.method] || c.method || "?";
  const levelLabel =
    (SL as Record<string, string>)[c.synthLevel] || c.synthLevel || "?";
  const orderLabel = ORDER_LABELS[c.generationOrder] ?? "";
  const sourcesStr = c.sources.length ? c.sources.join(", ") : "только капсула";

  const synthDisabled = !c.participant;
  const showWarn = !!c.participantError && !c.participant;

  return (
    <div
      className={[
        "pool-card",
        c.isSelected ? "selected" : "",
        c.isSynthParticipant ? "synth-on" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Колонка 1: чекбокс синтеза */}
      <div className="pool-card-controls">
        <input
          type="checkbox"
          title="Участник мета-синтеза"
          checked={c.isSynthParticipant}
          disabled={synthDisabled}
          onChange={() => onToggleSynth(c.id)}
        />
        <label>Синтез</label>
      </div>

      {/* Колонка 2: радио просмотра. Каталожная запись (беседа 3.2):
          rawHTML="" — предпросмотра нет, вместо ◉ ссылка на страницу
          синтеза (полный просмотр там) */}
      <div className="pool-card-controls">
        {c.synthesisId ? (
          <Link to={`/synthesis/${c.synthesisId}`} title="Открыть страницу синтеза">
            ↗<label>Открыть</label>
          </Link>
        ) : (
          <>
            <input
              type="radio"
              name="poolView"
              title="Просмотр и редактирование"
              checked={c.isSelected}
              onClick={() => onSelectForViewing(c.id)}
              onChange={() => {
                /* toggle в onClick — как в исходнике (повторный клик = деселект) */
              }}
            />
            <label>Просм.</label>
          </>
        )}
      </div>

      {/* Колонка 3: информация */}
      <div className="pool-card-info">
        <div className="pool-card-name">{c.name}</div>
        {c.subtitle && c.subtitle !== "—" && (
          <div className="pool-card-basis">{c.subtitle}</div>
        )}
        <div className="pool-card-meta">
          {methodLabel} × {levelLabel}
          {orderLabel ? " · " + orderLabel : ""} · {sourcesStr}
        </div>
      </div>

      {/* Колонка 4: кнопки */}
      <div className="pool-card-btns">
        <button
          type="button"
          onClick={() => onRename(c.id)}
          title="Переименовать"
          className="pool-card-btn"
        >
          ✎
        </button>
        <button
          type="button"
          onClick={() => onRemove(c.id)}
          title="Удалить из пула"
          className="pool-card-btn remove"
        >
          ✕
        </button>
      </div>

      {/* Предупреждение о непригодности к синтезу [5051–5055] */}
      {showWarn && (
        <div className="pool-card-synth-warn">
          ⚠ {String(c.participantError).slice(0, 120)}
        </div>
      )}
    </div>
  );
}
