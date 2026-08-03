/**
 * Карточка синтеза в каталоге. Беседа 1.6b (запрос 1, п. 5).
 *
 * Превью SynthesisPreview (транспорт 1.6): название, метод × уровень
 * (метки ML/SL), философы через запятую (или «свободный синтез»),
 * дата создания, статус, начало капсулы. Клик по карточке —
 * навигация на /synthesis/:id.
 *
 * На вкладке «Мои» показывается переключатель публикации
 * (PATCH /syntheses/:id { isPublic } — единственный способ попасть во
 * вкладку «Публичные», 03 §2.2); обработчик передаёт CatalogPage.
 */
import { Link } from "react-router-dom";

import { ML, SL } from "@philosynth/shared/constants/labels";
import type { SynthesisPreview } from "@philosynth/shared/types/synthesis";

const STATUS_LABELS: Record<string, string> = {
  draft: "черновик",
  generating: "генерируется…",
  paused: "на паузе",
  ready: "готов",
  error: "ошибка",
};

export interface SynthesisCardProps {
  synthesis: SynthesisPreview;
  /** Есть только на вкладке «Мои»: переключатель публикации */
  onTogglePublic?: ((s: SynthesisPreview) => void) | undefined;
  /** id синтеза, чей PATCH публикации сейчас в полёте */
  togglingId?: string | null | undefined;
}

export function SynthesisCard({
  synthesis,
  onTogglePublic,
  togglingId,
}: SynthesisCardProps) {
  const phil =
    synthesis.philosophers.length > 0
      ? synthesis.philosophers.join(", ")
      : "свободный синтез";
  const date = new Date(synthesis.createdAt).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <Link
      to={`/synthesis/${synthesis.id}`}
      className="block rounded border border-rule bg-paper p-4 transition-colors hover:border-blue-corp hover:no-underline"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-serif text-lg text-blue-corp">
          {synthesis.title}
        </h3>
        <span className="meta-label shrink-0">
          {STATUS_LABELS[synthesis.status] ?? synthesis.status}
        </span>
      </div>

      <div className="mt-1 font-mono text-xs text-gold">
        {ML[synthesis.method]} × {SL[synthesis.synthLevel]}
      </div>

      <div className="mt-2 text-sm text-ink-mid">{phil}</div>

      {synthesis.capsulePreview && (
        <p className="mt-2 line-clamp-2 text-xs text-ink-dim">
          {synthesis.capsulePreview}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-ink-dim">{date}</span>
        {onTogglePublic && (
          <button
            type="button"
            className="action-btn"
            style={{ padding: "4px 12px" }}
            disabled={togglingId === synthesis.id}
            onClick={(e) => {
              // Клик по кнопке не должен открывать /synthesis/:id
              e.preventDefault();
              e.stopPropagation();
              onTogglePublic(synthesis);
            }}
          >
            {synthesis.isPublic ? "Скрыть" : "Опубликовать"}
          </button>
        )}
      </div>
    </Link>
  );
}
