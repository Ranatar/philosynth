/**
 * Коды методов для нумерации документов (METHOD_CODE, строки 13615–13622).
 * Используются в docNum: "ФС-Д-С-С-001" → метод Диалектический, уровень Сравнительный, ...
 */
export const METHOD_CODE: Record<string, string> = {
  dialectical: "Д",
  integrative: "И",
  deconstructive: "Дк",
  hermeneutical: "Г",
  analytical: "А",
  creative: "Тв",
};

/**
 * Коды уровней синтеза (LEVEL_CODE, строки 13623–13627).
 */
export const LEVEL_CODE: Record<string, string> = {
  comparative: "С",
  transformative: "Т",
  generative: "Гн",
};

/**
 * Коды глубины (DEPTH_CODE).
 */
export const DEPTH_CODE: Record<string, string> = {
  overview: "О",
  standard: "С",
  deep: "Гл",
  exhaustive: "Исч",
};

/**
 * Коды порядка генерации (ORDER_CODE, строки 13628–13632).
 */
export const ORDER_CODE: Record<string, string> = {
  architectural: "А",
  genetic: "Г",
};

/**
 * Формирует номер документа.
 * Формат: ФС-{METHOD}-{LEVEL}-{DEPTH}-{NNN}
 * Пример: "ФС-Д-С-С-001"
 */
export function buildDocNum(
  method: string,
  level: string,
  depth: string,
  seqNum: number,
): string {
  const m = METHOD_CODE[method] ?? "?";
  const l = LEVEL_CODE[level] ?? "?";
  const d = DEPTH_CODE[depth] ?? "?";
  const n = String(seqNum).padStart(3, "0");
  return `ФС-${m}-${l}-${d}-${n}`;
}

/**
 * Парсит номер документа обратно в компоненты.
 * Возвращает null если формат не распознан.
 */
export function parseDocNum(docNum: string): {
  method: string;
  level: string;
  depth: string;
  seqNum: number;
} | null {
  const match = docNum.match(/^ФС-(.+?)-(.+?)-(.+?)-(\d+)$/);
  if (!match) return null;

  const reverseMethod = Object.fromEntries(
    Object.entries(METHOD_CODE).map(([k, v]) => [v, k]),
  );
  const reverseLevel = Object.fromEntries(
    Object.entries(LEVEL_CODE).map(([k, v]) => [v, k]),
  );
  const reverseDepth = Object.fromEntries(
    Object.entries(DEPTH_CODE).map(([k, v]) => [v, k]),
  );

  const method = reverseMethod[match[1]!];
  const level = reverseLevel[match[2]!];
  const depth = reverseDepth[match[3]!];
  const seqNum = parseInt(match[4]!, 10);

  if (!method || !level || !depth) return null;
  return { method, level, depth, seqNum };
}
