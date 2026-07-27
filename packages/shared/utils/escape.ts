/**
 * HTML-экранирование.
 * Дословный порт полной версии esc() из philosynth.html [~18390]
 * (в исходнике есть и урезанная локальная esc [~16422], экранирующая
 * только кавычки, — здесь каноническая полная).
 */

export function esc(s: unknown): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
