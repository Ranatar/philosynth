// ─── Row type (matches schema.ts sections table) ──────────────────────────

export interface Section {
  id: string;
  synthesisId: string;
  /** Ключ раздела: 'sum'|'graph'|'glossary'|'theses'|'critique'|'dialogue'|... */
  key: string;
  sectionNum: number;
  title: string;
  htmlContent: string;
  /** Дополнительный контекст раздела (secCtx) */
  secContext: string;
  isEdited: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Generation pipeline types ─────────────────────────────────────────────

/**
 * Определение раздела для генерации.
 * Формируется из Prompt Registry (buildSectionDefs).
 */
export interface SectionDef {
  key: string;
  label: string;
  /** Тело промпта (шаблон с {{плейсхолдерами}}) */
  promptBody: string;
  /** Части промпта (аналог serializeParts) */
  parts: SectionPart[];
  /** Требуемые контекстные ключи */
  requiredCtxKeys: string[];
  /** Опциональные контекстные ключи */
  optionalCtxKeys: string[];
  /** Ожидаемые подразделы (для трекинга стриминга) */
  expectedSubsections: string[];
  /** Ожидаемый объём вывода (символов) */
  estimatedOutputChars: number;
}

/** Часть промпта раздела (method / level / topology / preamble и т.д.) */
export interface SectionPart {
  type: string;
  content: string;
}

// ─── Projections ───────────────────────────────────────────────────────────

/** Сокращённая информация о разделе для списков */
export interface SectionSummary {
  id: string;
  key: string;
  sectionNum: number;
  title: string;
  isEdited: boolean;
  /** Длина HTML-контента (символов) */
  contentLength: number;
  updatedAt: Date;
}

/** Полный раздел с опциональными извлечёнными элементами */
export interface SectionFull extends Section {
  /** Заполняется на клиенте или при детальном запросе */
  subsections?: string[];
}
