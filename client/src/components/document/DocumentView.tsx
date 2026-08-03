/**
 * Полный документ (аналог #docOutput). Беседа 1.6b (запрос 1, п. 3).
 *
 * Сборка: DocumentHeader → (TableOfContents + разделы) → DocumentFooter.
 * Разделы рендерятся в порядке synthesis.sectionOrder; ключ `capsule`
 * ИСКЛЮЧАЕТСЯ — капсула живёт в шапке (removeCapsuleFromDocBodies
 * исходника; store дополнительно не дотягивает её htmlContent, но
 * фильтр здесь — страховка на случай прямой передачи sections).
 * Разделы вне sectionOrder (не должно случаться) дорисовываются в конце —
 * лучше показать, чем потерять.
 */
import type { SectionFull, SectionSummary } from "@philosynth/shared/types/section";
import type { SynthesisFull } from "@philosynth/shared/types/synthesis";

import { DocumentFooter } from "./DocumentFooter";
import { DocumentHeader } from "./DocumentHeader";
import { SectionView } from "./SectionView";
import { TableOfContents } from "./TableOfContents";

export interface DocumentViewProps {
  synthesis: SynthesisFull;
  /** GET /sections — метаданные + subsections (оглавлению) */
  summaries: readonly SectionSummary[];
  /** Полные разделы с htmlContent */
  sections: readonly SectionFull[];
}

export function DocumentView({
  synthesis,
  summaries,
  sections,
}: DocumentViewProps) {
  const byKey = new Map(
    sections.filter((s) => s.key !== "capsule").map((s) => [s.key, s]),
  );
  const ordered: SectionFull[] = [];
  for (const key of synthesis.sectionOrder) {
    const s = byKey.get(key);
    if (s) {
      ordered.push(s);
      byKey.delete(key);
    }
  }
  ordered.push(...byKey.values()); // разделы вне sectionOrder — в хвост

  return (
    <div>
      <DocumentHeader synthesis={synthesis} />
      <div>
        <TableOfContents
          sectionOrder={synthesis.sectionOrder}
          summaries={summaries}
        />
        {ordered.map((section) => (
          <SectionView key={section.key} section={section} />
        ))}
      </div>
      <DocumentFooter synthesis={synthesis} />
    </div>
  );
}
