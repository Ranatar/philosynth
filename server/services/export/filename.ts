/**
 * filename — getDocFilename() [17477–17529] (беседа 4.2; карта 04 §1.8,
 * NEXT-CONTEXT гл. 0.1: «по плану — беседа 4.2; все словари-коды готовы
 * и сверены»). Пример результата исходника:
 * PS-3950-G9OL-Kant-Heidegger-hm-t-2-v3-2m4-1.html
 *
 * АДАПТАЦИИ DOM→БД:
 *  - document.getElementById("docNum"/"docTitle") → syntheses.doc_num/title;
 *  - DOC_STATE.participants/_conceptParticipants → философы и
 *    концепции-родители из synthesis_lineage (счётчики те же);
 *  - фолбэки на значения формы (getPhil()/select.value) вырождены: на
 *    сервере параметры всегда в строке syntheses;
 *  - GEN_LANG (глобал вкладки) → syntheses.lang.
 */
import { METHOD_CODE, LEVEL_CODE, ORDER_CODE, DEPTH_CODE } from "@philosynth/shared/constants/methods";
import { PHIL_FILENAME } from "@philosynth/shared/constants/phil-filename";
import { transliterate } from "@philosynth/shared/utils/transliterate";
import { formatVersionFilename } from "@philosynth/shared/utils/version";

import type { DocVersion } from "@philosynth/shared/types/synthesis";

export interface DocFilenameInput {
  docNum: string;
  title: string;
  /** Философы-родители (имена, порядок position) */
  philosophers: string[];
  /** Число концепций-родителей (parent_type='synthesis') */
  conceptParentCount: number;
  method: string;
  synthLevel: string;
  generationOrder: string;
  depth: string;
  version: DocVersion;
  lang: string;
}

/** Дефолтный заголовок исходника — не годится в имя файла [17488]. */
const DEFAULT_TITLE = "Синтез Философской Концепции";

export function getDocFilename(input: DocFilenameInput, ext?: string): string {
  const num = input.docNum.trim() || "synthesis";

  // ── Участники ──
  const isMeta = input.conceptParentCount > 0;

  let namePart: string;
  if (isMeta) {
    const title = input.title.trim();
    if (title && title !== DEFAULT_TITLE) {
      namePart = transliterate(title).slice(0, 60);
    } else {
      const pc = input.conceptParentCount;
      const pp = input.philosophers.length;
      namePart = "meta-" + pc + "c" + (pp > 0 ? pp + "p" : "");
    }
  } else {
    namePart = input.philosophers
      .map((p) => (PHIL_FILENAME as Record<string, string>)[p] || p)
      .join("-");
  }

  // ── Параметры синтеза ──
  const paramCode = [
    (METHOD_CODE as Record<string, string>)[input.method] || "",
    (LEVEL_CODE as Record<string, string>)[input.synthLevel] || "",
    (ORDER_CODE as Record<string, string>)[input.generationOrder] || "",
    (DEPTH_CODE as Record<string, string>)[input.depth] || "",
  ]
    .filter(Boolean)
    .join("");

  // ── Версия ──
  const verStr = formatVersionFilename(input.version);
  const ver = verStr !== "v1" ? "-" + verStr : "";

  // ── Сборка ──
  const docLang = input.lang || "Russian";
  const langSuffix =
    docLang === "Russian" ? "" : "-" + docLang.slice(0, 2).toLowerCase();
  const parts = [num, namePart, paramCode].filter(Boolean);
  return parts.join("-") + ver + langSuffix + (ext ? "." + ext : "");
}
