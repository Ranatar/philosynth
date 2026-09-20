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
 *
 * Беседа 9.2 — ручная правка подраздела (единица правки — ПОДРАЗДЕЛ;
 * функции на тело раздела целиком нет, как нет и маршрута):
 *  - getSubsectionSource → GET …/sections/:key/subsections/:name →
 *      SubsectionSource (разметка содержимого без обёртки и <h4>, замок);
 *  - updateSubsection → PATCH тот же путь { html } → SubsectionUpdateResult.
 */
import type {
  SectionContextPreview,
  SectionFull,
  SectionSummary,
  SubsectionSource,
  SubsectionUpdateResult,
} from "@philosynth/shared/types/section";

import { apiGet, apiPatch } from "./client";

function subsectionPath(synthesisId: string, key: string, name: string): string {
  return `/syntheses/${encodeURIComponent(synthesisId)}/sections/${encodeURIComponent(key)}/subsections/${encodeURIComponent(name)}`;
}

export function getSubsectionSource(
  synthesisId: string,
  key: string,
  name: string,
): Promise<SubsectionSource> {
  return apiGet<SubsectionSource>(subsectionPath(synthesisId, key, name));
}

export function updateSubsection(
  synthesisId: string,
  key: string,
  name: string,
  html: string,
): Promise<SubsectionUpdateResult> {
  return apiPatch<SubsectionUpdateResult>(subsectionPath(synthesisId, key, name), { html });
}

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
