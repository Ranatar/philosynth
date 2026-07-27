/**
 * Типы разделов документа.
 * Соответствие: server/db/schema.ts (таблица sections),
 * 03-specification §2.3, buildSectionDefs из исходника.
 */

/** Определение раздела из buildSectionDefs (key, num, title, prompt) */
export interface SectionDef {
  key: string;
  num: number;
  title: string;
  prompt: string;
}

/** GET /syntheses/:id/sections — элемент списка */
export interface SectionSummary {
  key: string;
  sectionNum: number;
  title: string;
  isEdited: boolean;
  /** Длина html_content, симв. */
  htmlChars: number;
  /** Качество контекста генерации (getSectionContextQuality, v11) —
   *  score 0–100 или null, если ctxLog по разделу отсутствует */
  contextQualityScore: number | null;
  updatedAt: string;
}

/** GET /syntheses/:id/sections/:key */
export interface SectionFull {
  key: string;
  sectionNum: number;
  title: string;
  htmlContent: string;
  /** Доп. контекст раздела (secCtx) */
  secContext: string;
  isEdited: boolean;
  /** Имена data-section внутри HTML */
  subsections: string[];
}

/** GET /syntheses/:id/sections/:key/context — отладочный эндпоинт */
export interface SectionContextPreview {
  contextHtml: string;
  budget: number;
  used: number;
  entries: import("./generation.js").ContextEntry[];
}
