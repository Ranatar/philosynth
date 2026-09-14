/**
 * Список карточек синтезов. Беседа 1.6b (запрос 1, п. 5).
 * Пустое состояние — текстом; фильтры (CatalogFilters) — Фаза 2 (C5),
 * поиск живёт в CatalogPage. Беседа 8.4: проброс действий владельца
 * (actions) в карточки — только на вкладке «Мои».
 */
import type { SynthesisPreview } from "@philosynth/shared/types/synthesis";

import { SynthesisCard, type SynthesisCardActions } from "./SynthesisCard";

export interface SynthesisListProps {
  items: readonly SynthesisPreview[];
  emptyText: string;
  onTogglePublic?: ((s: SynthesisPreview) => void) | undefined;
  togglingId?: string | null | undefined;
  /** Беседа 8.4: действия владельца (переименовать/дублировать/удалить) */
  actions?: SynthesisCardActions | undefined;
}

export function SynthesisList({
  items,
  emptyText,
  onTogglePublic,
  togglingId,
  actions,
}: SynthesisListProps) {
  if (items.length === 0) {
    return <p className="pool-status" style={{ textAlign: "center", padding: "32px 0" }}>{emptyText}</p>;
  }
  return (
    <div className="catalog-list">
      {items.map((s) => (
        <SynthesisCard
          key={s.id}
          synthesis={s}
          onTogglePublic={onTogglePublic}
          togglingId={togglingId}
          actions={actions}
        />
      ))}
    </div>
  );
}
