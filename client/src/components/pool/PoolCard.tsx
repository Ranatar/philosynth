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
      className={
        "rounded border p-2 " +
        (c.isSelected
          ? "border-gold bg-gold/5 "
          : "border-rule bg-white ") +
        (c.isSynthParticipant ? "ring-1 ring-gold/40" : "")
      }
    >
      <div className="flex items-center gap-3">
        {/* Колонка 1: чекбокс синтеза */}
        <label
          className={
            "flex shrink-0 flex-col items-center gap-0.5 text-[10px] " +
            (synthDisabled
              ? "cursor-not-allowed text-ink-dim"
              : "cursor-pointer text-ink-mid")
          }
          title="Участник мета-синтеза"
        >
          <input
            type="checkbox"
            checked={c.isSynthParticipant}
            disabled={synthDisabled}
            onChange={() => onToggleSynth(c.id)}
            className="accent-[var(--gold)]"
          />
          Синтез
        </label>

        {/* Колонка 2: радио просмотра. Каталожная запись (беседа 3.2):
            rawHTML="" — предпросмотра нет, вместо ◉ ссылка на страницу
            синтеза (полный просмотр там) */}
        {c.synthesisId ? (
          <Link
            to={`/synthesis/${c.synthesisId}`}
            title="Открыть страницу синтеза"
            className="flex shrink-0 flex-col items-center gap-0.5 text-[10px] text-ink-mid hover:text-gold"
          >
            <span className="font-mono text-sm leading-none">↗</span>
            Открыть
          </Link>
        ) : (
          <label
            className="flex shrink-0 cursor-pointer flex-col items-center gap-0.5 text-[10px] text-ink-mid"
            title="Просмотр и редактирование"
          >
            <input
              type="radio"
              name="poolView"
              checked={c.isSelected}
              onClick={() => onSelectForViewing(c.id)}
              onChange={() => {
                /* toggle в onClick — как в исходнике (повторный клик = деселект) */
              }}
              className="accent-[var(--gold)]"
            />
            Просм.
          </label>
        )}

        {/* Колонка 3: информация */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">
            {c.name}
          </div>
          {c.subtitle && c.subtitle !== "—" && (
            <div className="truncate font-mono text-[10px] text-ink-dim">
              {c.subtitle}
            </div>
          )}
          <div className="truncate font-mono text-[10px] text-ink-mid">
            {methodLabel} × {levelLabel}
            {orderLabel ? " · " + orderLabel : ""} · {sourcesStr}
          </div>
        </div>

        {/* Колонка 4: кнопки */}
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onRename(c.id)}
            title="Переименовать"
            className="rounded border border-rule px-1.5 py-0.5 text-xs text-ink-mid hover:border-rule-strong hover:text-ink"
          >
            ✎
          </button>
          <button
            type="button"
            onClick={() => onRemove(c.id)}
            title="Удалить из пула"
            className="rounded border border-rule px-1.5 py-0.5 text-xs text-red hover:border-red"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Предупреждение о непригодности к синтезу [5051–5055] */}
      {showWarn && (
        <div className="mt-1.5 rounded bg-red/5 px-2 py-1 font-mono text-[10px] leading-relaxed text-red">
          ⚠ {String(c.participantError).slice(0, 120)}
        </div>
      )}
    </div>
  );
}
