/**
 * API-функции /syntheses/:id/sections. Беседа 1.6b (запрос 1, п. 6).
 *
 * Контракт: 03-specification §2.3 + server/routes/sections.ts (беседа 1.6):
 *  - getSections → GET /syntheses/:id/sections → { sections: SectionSummary[] }
 *      (порядок sectionOrder; subsections из HTML — якоря второго уровня
 *       для TableOfContents; contextQualityScore = null до беседы 2.4);
 *  - getSection  → GET /syntheses/:id/sections/:key → { section: SectionFull }
 *      (htmlContent — весь <div class="doc-section"> с section-num и
 *       section-title внутри).
 *
 * getSectionContext → GET /syntheses/:id/sections/:key/context →
 * SectionContextPreview (беседа 2.3: превью «какой контекст будет
 * использован» в EditSectionCard; сервер — живой buildContextForSection).
 */
import type {
  SectionContextPreview,
  SectionFull,
  SectionSummary,
} from "@philosynth/shared/types/section";

import { apiGet } from "./client";

export function getSections(synthesisId: string): Promise<SectionSummary[]> {
  return apiGet<{ sections: SectionSummary[] }>(
    `/syntheses/${encodeURIComponent(synthesisId)}/sections`,
  ).then((r) => r.sections);
}

export function getSection(
  synthesisId: string,
  key: string,
): Promise<SectionFull> {
  return apiGet<{ section: SectionFull }>(
    `/syntheses/${encodeURIComponent(synthesisId)}/sections/${encodeURIComponent(key)}`,
  ).then((r) => r.section);
}

export function getSectionContext(
  synthesisId: string,
  key: string,
): Promise<SectionContextPreview> {
  return apiGet<SectionContextPreview>(
    `/syntheses/${encodeURIComponent(synthesisId)}/sections/${encodeURIComponent(key)}/context`,
  );
}
