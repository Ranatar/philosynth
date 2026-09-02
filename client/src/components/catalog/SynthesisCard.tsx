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
      className="catalog-card"
    >
      <div className="catalog-card-head">
        <div className="section-title" style={{ margin: 0, padding: 0, border: "none" }}>
          {synthesis.title}
        </div>
        <span className="header-badges" style={{ flexDirection: "row", gap: 6 }}>
          {/* Беседа 3.2 (п. 5): бейдж мета-синтеза (родители-концепции
              в генеалогии — SynthesisPreview.hasConceptParents) */}
          {synthesis.hasConceptParents && (
            <span className="cert-badge gold">◈ мета-синтез</span>
          )}
          <span className="cert-badge">
            {STATUS_LABELS[synthesis.status] ?? synthesis.status}
          </span>
        </span>
      </div>

      <div className="doc-meta-val gold">
        {ML[synthesis.method]} × {SL[synthesis.synthLevel]}
      </div>

      <div className="doc-content" style={{ marginTop: 6 }}>{phil}</div>

      {synthesis.capsulePreview && (
        <p className="catalog-card-preview">{synthesis.capsulePreview}</p>
      )}

      <div className="catalog-card-foot">
        <span className="doc-footer-left">{date}</span>
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
