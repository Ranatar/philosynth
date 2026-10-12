/**
 * Раскладка блока тезиса — НАДСТРОЙКА над генератом section-templates.ts
 * (беседа 12.5, Д-40; образцы — recommendation-templates.ts 10.1,
 * lang-templates.ts 11.1, export-viewer-overrides.ts 12.2).
 *
 * ПОЧЕМУ. Задание раздела тезисов (section.theses.shared) перечисляет пять
 * обязательных пунктов тезиса, но раскладку НЕ предписывает: модель пишет
 * как хочет, а разбор УГАДЫВАЕТ — две модели абзаца (первая 1.4: один абзац
 * «<strong>формулировка</strong> обоснование»; вторая 12.2: блок <h5> +
 * абзац из одной жирной формулировки + абзац «<strong>Обоснование.</strong>»,
 * html-parser scanThesisBlocks). Правка тезиса по месту (element-editor)
 * находит блок по МЕТКЕ в <h5> и переписывает формулировку/обоснование в
 * свои абзацы — когда абзацев нет, поле остаётся «не отражено в документе»
 * (pending). Надстройка требует вторую модель явно: метка <h5> равна первой
 * ячейке строки сводной таблицы, формулировка в прозе ДОСЛОВНО равна
 * формулировке в таблице. Обе модели разбора остаются — документы, написанные
 * до требования, никуда не денутся.
 *
 * ПОЧЕМУ НЕ ПРАВКА section-templates.ts. Он ГЕНЕРАТ из philosynth.html («НЕ
 * ПРАВИТЬ ВРУЧНУЮ»): правка рукой пропала бы при первом `npm run
 * extract:sections`, а байтовая сверка с исходником (smoke-12) перестала бы
 * сходиться. Исходник не правится: в одностраничнике пользователь больше не
 * генерирует. Поэтому отступление живёт ЗДЕСЬ: сид накладывает его поверх
 * генерата (applyThesisLayoutOverrides), smoke-12 снимает перед сравнением
 * (stripThesisLayoutAddendum) и отдельно проверяет, что надстройка ровно одна
 * и на месте; сторож 4bd — генерат не тронут, активный шаблон несёт добавку.
 * Выкатка: `npm run seed:prompts`.
 *
 * Слова «Тезис», «Обоснование.» и метки — машинные значения: их читает
 * разбор (JUSTIFICATION_LEAD_RE, thesisLabelIndex), поэтому они пишутся
 * по-русски при любом языке документа — как и прочие закрытые списки (11.1).
 */
import type { SeedPromptTemplate } from "./prompt-templates.js";

export const THESES_SHARED_TEMPLATE_KEY = "section.theses.shared";

/** Заголовок правила — по нему сторож и smoke-12 узнают надстройку. */
export const THESIS_LAYOUT_MARKER = "РАСКЛАДКА БЛОКА ТЕЗИСА";

/** Жирное начало абзаца обоснования, которое ждёт разбор (html-parser JUSTIFICATION_LEAD_RE). */
export const THESIS_JUSTIFICATION_LEAD = "Обоснование.";

export const THESIS_LAYOUT_ADDENDUM = `

${THESIS_LAYOUT_MARKER} (обязательна у КАЖДОГО тезиса; по ней документ читает инструмент правки):
<h5>Тезис {метка} ({краткое название тезиса})</h5>
<p><strong>{формулировка тезиса}</strong></p>
<p><strong>${THESIS_JUSTIFICATION_LEAD}</strong> {текст обоснования}</p>
— метка в <h5> ТОЧНО равна первой ячейке (столбец «№») строки этого тезиса в сводной таблице тезисов (например «О-1», «Э-2»);
— абзац формулировки состоит из ОДНОЙ жирной формулировки и ничего больше; формулировка ДОСЛОВНО равна формулировке в сводной таблице тезисов — не пересказ;
— абзац обоснования НАЧИНАЕТСЯ жирным словом «${THESIS_JUSTIFICATION_LEAD}»;
— остальные пункты тезиса идут ПОСЛЕ, своими абзацами.
Слова «Тезис», «${THESIS_JUSTIFICATION_LEAD}» и метки — машинные ключи: писать их ТОЧНО так, на русском языке, при любом языке документа.`;

/** Наложить надстройку на генерат: section.theses.shared += раскладка (идемпотентно). */
export function applyThesisLayoutOverrides(
  templates: readonly SeedPromptTemplate[],
): SeedPromptTemplate[] {
  let hit = false;
  const out = templates.map((t) => {
    if (t.key !== THESES_SHARED_TEMPLATE_KEY) return t;
    hit = true;
    if (t.body.endsWith(THESIS_LAYOUT_ADDENDUM)) return t;
    return {
      ...t,
      body: t.body + THESIS_LAYOUT_ADDENDUM,
      description: `${t.description}; 12.5: += раскладка блока тезиса (Д-40)`,
    };
  });
  if (!hit)
    throw new Error(
      `thesis-layout-templates: в генерате нет шаблона ${THESES_SHARED_TEMPLATE_KEY}`,
    );
  return out;
}

/**
 * Снять надстройку с отрендеренного текста (smoke-12: байтовая сверка с
 * исходником). departed — добавка стояла ровно один раз и в самом конце.
 */
export function stripThesisLayoutAddendum(text: string): {
  text: string;
  departed: boolean;
} {
  const count = text.split(THESIS_LAYOUT_MARKER).length - 1;
  if (count === 1 && text.endsWith(THESIS_LAYOUT_ADDENDUM))
    return {
      text: text.slice(0, text.length - THESIS_LAYOUT_ADDENDUM.length),
      departed: true,
    };
  return { text, departed: false };
}
