/**
 * Коды методов для имени файла (METHOD_CODE, строка 13615).
 * Используются в getDocFilename(): PS-1234-G9OL-Kant-Hegel-lcA2.html
 */
export const METHOD_CODE: Record<string, string> = {
  dialectical: "l",
  integrative: "t",
  deconstructive: "c",
  hermeneutical: "m",
  analytical: "n",
  creative: "r",
};

/**
 * Коды уровней синтеза (LEVEL_CODE).
 */
export const LEVEL_CODE: Record<string, string> = {
  comparative: "c",
  transformative: "t",
  generative: "g",
};

/**
 * Коды глубины (DEPTH_CODE).
 */
export const DEPTH_CODE: Record<string, string> = {
  overview: "1",
  standard: "2",
  deep: "3",
  exhaustive: "4",
};

/**
 * Коды порядка генерации (ORDER_CODE).
 */
export const ORDER_CODE: Record<string, string> = {
  architectural: "A",
  genetic: "G",
};

/**
 * Генерирует номер документа (docNum).
 * Формат: PS-{4 случайные цифры}-{4 символа base36 от timestamp}
 * Пример: "PS-3950-G9OL"
 */
export function buildDocNum(): string {
  const rand = Math.floor(Math.random() * 9000 + 1000);
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  return `PS-${rand}-${ts}`;
}

/**
 * Строит суффикс параметров для имени файла.
 * Пример: "lcA2" (dialectical + comparative + architectural + standard)
 */
export function buildParamCode(
  method: string,
  level: string,
  order: string,
  depth: string,
): string {
  return [
    METHOD_CODE[method] ?? "",
    LEVEL_CODE[level] ?? "",
    ORDER_CODE[order] ?? "",
    DEPTH_CODE[depth] ?? "",
  ]
    .filter(Boolean)
    .join("");
}
