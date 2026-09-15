/**
 * Список карточек синтезов. Беседа 1.6b (запрос 1, п. 5).
 * Пустое состояние — текстом; фильтры (CatalogFilters) — Фаза 2 (C5),
 * поиск живёт в CatalogPage. Беседа 8.4: проброс действий владельца
 * (actions) в карточки — только на вкладке «Мои». Беседа 8.7: вместо
 * переключателя публикации — управление публичностью (visibility), тоже
 * только на «Мои»; без обоих пропов список годится гостю (/explore,
 * LandingPage) — карточки только читают.
 */
import type { SynthesisPreview } from "@philosynth/shared/types/synthesis";

import {
  SynthesisCard,
  type SynthesisCardActions,
  type SynthesisCardVisibility,
} from "./SynthesisCard";

export interface SynthesisListProps {
  items: readonly SynthesisPreview[];
  emptyText: string;
  /** Беседа 8.7: управление публичностью (только на вкладке «Мои») */
  visibility?: SynthesisCardVisibility | undefined;
  /** Беседа 8.4: действия владельца (переименовать/дублировать/удалить) */
  actions?: SynthesisCardActions | undefined;
}

export function SynthesisList({
  items,
  emptyText,
  visibility,
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
          visibility={visibility}
          actions={actions}
        />
      ))}
    </div>
  );
}
