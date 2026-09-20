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
  /** Имена data-section внутри HTML — якоря второго уровня для
   *  TableOfContents (беседа 1.6b); parseSubsectionsFromHTML (1.4) */
  subsections: string[];
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
  /** 9.2: подразделы, запертые для ручной правки (таблицы, которые служба
   *  рисует из БД, и капсула) — вычисляются против текущего HTML. Поле
   *  несёт GET /sections/:key; во вложенных sections гостя его нет */
  lockedSubsections?: string[] | undefined;
}

/** 9.2: почему подраздел заперт и чем его править вместо ручной правки */
export interface SubsectionLock {
  reason: "table" | "capsule";
  table?: "categories" | "edges" | "topology" | "theses" | "glossary" | undefined;
  hint: string;
}

/** 9.2: GET /syntheses/:id/sections/:key/subsections/:name */
export interface SubsectionSource {
  sectionKey: string;
  name: string;
  /** Разметка содержимого без обёртки data-section и без <h4> */
  html: string;
  /** Вложенные подразделы, стоящие в html комментариями-ссылками */
  nested: string[];
  lock: SubsectionLock | null;
}

/** 9.2: ответ PATCH /syntheses/:id/sections/:key/subsections/:name */
export interface SubsectionUpdateResult {
  /** false — присланное совпало с текущим: версии нет, раздел не тронут */
  changed: boolean;
  version: import("./elements.js").ElementVersion | null;
  /** Что сервер убрал из присланной разметки (теги вне набора документа) */
  warnings: string[];
  section: {
    key: string;
    htmlContent: string;
    isEdited?: boolean | undefined;
    subsections: string[];
    lockedSubsections: string[];
  };
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
