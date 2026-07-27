/**
 * Коды параметров для имён файлов экспорта (getDocFilename).
 * Всё ниже — дословный порт из philosynth.html (сверено по полному
 * исходнику 26 024 стр., ревизия 2026-07):
 *   METHOD_CODE  [~17434], LEVEL_CODE [~17442],
 *   DEPTH_CODE   [~17445], ORDER_CODE [~17448].
 */

import type {
  Depth,
  GenerationOrder,
  SynthesisMethod,
  SynthLevel,
} from "../types/synthesis.js";

/** Код метода в имени файла */
export const METHOD_CODE: Readonly<Record<SynthesisMethod, string>> = {
  dialectical: "l",
  integrative: "t",
  deconstructive: "c",
  hermeneutical: "m",
  analytical: "n",
  creative: "r",
} as const;

/** Код уровня синтеза */
export const LEVEL_CODE: Readonly<Record<SynthLevel, string>> = {
  comparative: "c",
  transformative: "t",
  generative: "g",
} as const;

/** Код порядка генерации (заглавные — как в исходнике) */
export const ORDER_CODE: Readonly<Record<GenerationOrder, string>> = {
  architectural: "A",
  genetic: "G",
} as const;

/** Код глубины — ЦИФРЫ "1"–"4" (не буквы) */
export const DEPTH_CODE: Readonly<Record<Depth, string>> = {
  overview: "1",
  standard: "2",
  deep: "3",
  exhaustive: "4",
} as const;
