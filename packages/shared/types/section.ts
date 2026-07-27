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

/**
 * GET /syntheses/:id/sections/:key/context — отладочный эндпоинт (03-spec §2.3).
 *
 * ИСПРАВЛЕНО в беседе 1.3 вслед за правкой 03/I: поле называлось contextHtml,
 * хотя buildContextForSection возвращает ПЛОСКИЙ ТЕКСТ блока «КОНТЕКСТ ИЗ
 * ПРЕДЫДУЩИХ РАЗДЕЛОВ …»; отсутствовали поля v11 (режим бюджета, вес
 * родительского контекста, spec родителей, счётчики). Состав приведён к
 * CtxLogDraft, который отдаёт buildContextForSection.
 */
export interface SectionContextPreview {
  /** Готовый блок для промпта; "" — контекста нет */
  contextText: string;
  /** Эффективный бюджет после applyBudgetPressure */
  budget: number;
  /** Базовый бюджет ДО давления родителей (с критиковым ×1.5) */
  rawBaseBudget: number;
  /** Σ длин включённых фрагментов */
  totalUsed: number;
  budgetMode: import("./generation.js").BudgetMode;
  /** Сырой вес родительского контекста раздела, симв. */
  parentOverhead: number;
  parentSpec: import("./generation.js").ParentSpecLog | null;
  reqFound: number;
  reqTotal: number;
  optIncluded: number;
  optTotal: number;
  entries: import("./generation.js").ContextEntry[];
}
