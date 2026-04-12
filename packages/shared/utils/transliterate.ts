/**
 * Транслитерация текста → filename-safe строка (из исходника, строка 13634).
 *
 * 1. Кириллица → латиница
 * 2. Диакритика → базовые латинские (è→e, ü→u)
 * 3. Запрещённые FS-символы → дефис
 * 4. Пробелы → дефис, схлопывание дефисов
 * 5. Обрезка до 80 символов
 */
export function transliterate(text: string): string {
  const cyr: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo",
    ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
    ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };

  // Шаг 1: кириллица → латиница
  let result = text
    .toLowerCase()
    .split("")
    .map((c) => (cyr[c] !== undefined ? cyr[c]! : c))
    .join("");

  // Шаг 2: диакритика → базовые латинские (è→e, ü→u, ñ→n)
  result = result.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Шаг 3–5: FS-safe, дефисы, обрезка
  return result
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
