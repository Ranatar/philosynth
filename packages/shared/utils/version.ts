/**
 * Версия документа: парсинг/форматирование (v3.2m4.1 ↔ DocVersion).
 * Дословный порт из philosynth.html [~5344–5388].
 */

import type { DocVersion } from "../types/synthesis.js";

export function initialVersion(): DocVersion {
  return { base: 1, sub: 0, modes: 0, modeRegen: 0 };
}

/** Форматирует версию: v3 / v3.2 / v3.2m / v3.2m4.1 */
export function formatVersion(v: DocVersion | number): string {
  if (typeof v === "number") return "v" + v; // обратная совместимость
  let s = "v" + v.base;
  if (v.sub > 0) s += "." + v.sub;
  if (v.modes > 0) {
    s += "m";
    if (v.modes > 1) s += v.modes;
    if (v.modeRegen > 0) s += "." + v.modeRegen;
  }
  return s;
}

/** Форматирует версию для имени файла: v3-2m4-1 */
export function formatVersionFilename(v: DocVersion | number): string {
  return formatVersion(v).replace(/\./g, "-");
}

/** Парсит строку версии обратно в объект (для импорта).
 *  Принимает также число и готовый объект — обратная совместимость. */
export function parseVersion(
  str: string | number | DocVersion | null | undefined,
): DocVersion {
  if (!str) return initialVersion();
  // Обратная совместимость: просто число
  if (typeof str === "number")
    return { base: str, sub: 0, modes: 0, modeRegen: 0 };
  // Уже объект
  if (typeof str === "object" && str.base !== undefined) return str;
  // Строка: "v3.2m4.1"
  const m = String(str).match(/^v?(\d+)(?:\.(\d+))?(?:m(\d*)(?:\.(\d+))?)?$/);
  if (!m) return initialVersion();
  return {
    base: parseInt(m[1] ?? "") || 1,
    sub: parseInt(m[2] ?? "") || 0,
    modes: m[3] === undefined ? 0 : m[3] === "" ? 1 : parseInt(m[3]),
    modeRegen: parseInt(m[4] ?? "") || 0,
  };
}
