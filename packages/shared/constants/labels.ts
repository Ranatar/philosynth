/**
 * Русские метки параметров синтеза и обратные словари.
 * ML/SL/DL — дословный порт из philosynth.html (~4415–4530).
 * REVERSE_* — инверсии (русская метка → ключ); в исходнике определены
 * рядом с прямыми словарями, здесь строятся программно из тех же данных,
 * что исключает расхождение пар.
 *
 * ВАЖНО: описания методов/уровней (MD_BY_CARD, SD_BY_CARD) — НЕ здесь:
 * это промптовые словари, они уезжают в synthesis_configs
 * (server/config/cardinality-prompts.ts → БД, 04-map §1.9).
 */

import type {
  Depth,
  SynthesisMethod,
  SynthLevel,
} from "../types/synthesis.js";

/** Методы синтеза → русские метки */
export const ML: Readonly<Record<SynthesisMethod, string>> = {
  dialectical: "Диалектический",
  integrative: "Интегративный",
  deconstructive: "Деконструктивный",
  hermeneutical: "Герменевтический",
  analytical: "Аналитический",
  creative: "Творческий",
} as const;

/** Глубина проработки → русские метки */
export const DL: Readonly<Record<Depth, string>> = {
  overview: "Обзорная",
  standard: "Стандартная",
  deep: "Глубокая",
  exhaustive: "Исчерпывающая",
} as const;

/** Уровни синтеза → русские метки */
export const SL: Readonly<Record<SynthLevel, string>> = {
  comparative: "Сравнительный",
  transformative: "Преобразующий",
  generative: "Порождающий",
} as const;

function invert<K extends string>(
  obj: Readonly<Record<K, string>>,
): Readonly<Record<string, K>> {
  const out: Record<string, K> = {};
  for (const k of Object.keys(obj) as K[]) out[obj[k]] = k;
  return out;
}

/** Русская метка метода → ключ */
export const REVERSE_ML: Readonly<Record<string, SynthesisMethod>> =
  invert(ML);

/** Русская метка глубины → ключ */
export const REVERSE_DL: Readonly<Record<string, Depth>> = invert(DL);

/** Русская метка уровня → ключ */
export const REVERSE_SL: Readonly<Record<string, SynthLevel>> = invert(SL);
