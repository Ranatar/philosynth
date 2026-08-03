/**
 * Список карточек синтезов. Беседа 1.6b (запрос 1, п. 5).
 * Пустое состояние — текстом; фильтры (CatalogFilters) — Фаза 2 (C5),
 * поиск живёт в CatalogPage.
 */
import type { SynthesisPreview } from "@philosynth/shared/types/synthesis";

import { SynthesisCard } from "./SynthesisCard";

export interface SynthesisListProps {
  items: readonly SynthesisPreview[];
  emptyText: string;
  onTogglePublic?: ((s: SynthesisPreview) => void) | undefined;
  togglingId?: string | null | undefined;
}

export function SynthesisList({
  items,
  emptyText,
  onTogglePublic,
  togglingId,
}: SynthesisListProps) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-dim">{emptyText}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((s) => (
        <SynthesisCard
          key={s.id}
          synthesis={s}
          onTogglePublic={onTogglePublic}
          togglingId={togglingId}
        />
      ))}
    </div>
  );
}
