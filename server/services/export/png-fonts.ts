/**
 * Шрифты серверной отрисовки PNG (2026-11-26, вне бесед).
 *
 * node-canvas рисует тем, что видит fontconfig машины: без установленных
 * IBM Plex подписи графа шли системным запасным шрифтом, а арабская вязь,
 * деванагари и политоника древнегреческого на машине без нужных шрифтов
 * падали в «квадраты». Файлы TTF лежат в проекте (server/assets/fonts,
 * лицензия SIL OFL 1.1 — LICENSES.md там же) и регистрируются до первого
 * createCanvas; установка шрифтов в систему больше не нужна.
 *
 * Семейства письменностей стоят в стеке ПОСЛЕ IBM Plex — латиница и
 * кириллица рисуются прежними начертаниями. Китайский и японский — по-
 * прежнему системными шрифтами машины (CJK в проект не внесён: десятки МБ).
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { registerFont } from "canvas";

const FILES: readonly (readonly [file: string, family: string, weight: string])[] = [
  ["IBMPlexMono-Medium.ttf", "IBM Plex Mono", "500"],
  ["IBMPlexMono-SemiBold.ttf", "IBM Plex Mono", "600"],
  ["IBMPlexSans-Medium.ttf", "IBM Plex Sans", "500"],
  ["IBMPlexSansArabic-Medium.ttf", "IBM Plex Sans Arabic", "500"],
  ["IBMPlexSansDevanagari-Medium.ttf", "IBM Plex Sans Devanagari", "500"],
  ["NotoSans-Medium.ttf", "Noto Sans", "500"],
];

/** Запасные семейства письменностей — хвост каждого стека подписей PNG. */
const SCRIPT_FALLBACK = "'IBM Plex Sans Arabic', 'IBM Plex Sans Devanagari', 'Noto Sans'";
export const PNG_MONO = `'IBM Plex Mono', ${SCRIPT_FALLBACK}, monospace`;
export const PNG_SANS = `'IBM Plex Sans', ${SCRIPT_FALLBACK}, sans-serif`;

/** Каталог шрифтов: от исходника (tsx) и от сборки (dist/services/export). */
function fontsDir(): string | null {
  for (const rel of ["../../assets/fonts/", "../../../assets/fonts/"]) {
    const dir = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(dir)) return dir;
  }
  return null;
}

let registered: string[] | null = null;

/** Зарегистрировать шрифты проекта (один раз); возвращает имена файлов. */
export function ensurePngFonts(): readonly string[] {
  if (registered) return registered;
  registered = [];
  const dir = fontsDir();
  if (!dir) {
    console.warn("[png-fonts] каталог server/assets/fonts не найден — подписи PNG пойдут системными шрифтами");
    return registered;
  }
  for (const [file, family, weight] of FILES) {
    try {
      registerFont(dir + file, { family, weight });
      registered.push(file);
    } catch (err) {
      console.warn(`[png-fonts] ${file} не зарегистрирован: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return registered;
}
