/**
 * Язык генерации — защита машинных значений документа (беседа 11.1).
 * Рукописная НАДСТРОЙКА над генератом `server/config/prompt-templates.ts`
 * (образец — recommendation-templates.ts 10.1).
 *
 * ПОЧЕМУ НЕ ПРАВКА prompt-templates.ts. Он ГЕНЕРАТ из philosynth.html («НЕ
 * ПРАВИТЬ ВРУЧНУЮ»): правка рукой пропала бы при первом `npm run extract:seed`,
 * а байтовая сверка buildSYS с исходником (smoke-12, lang=English) перестала бы
 * сходиться. Поэтому отступление службы живёт ЗДЕСЬ: сид накладывает его
 * поверх генерата (`applyLangTemplateOverrides`), smoke-12 снимает его перед
 * сравнением (`stripLangInstructionAddendum`) и отдельно проверяет, что
 * отступление ровно такое.
 *
 * ЧТО ЗАЩИЩАЕТСЯ. Исходная инструкция (портирована дословно) бережёт от
 * перевода только значения атрибута data-section и одновременно требует
 * «ALL your output … including tables» на {{lang}}. Парсеры же читают русские
 * значения в ЯЧЕЙКАХ таблиц: роли топологии (ROLE_MAP graph-parser),
 * направление связи («однонаправленная | двунаправленная | рефлексивная»),
 * типы категорий/связей (каталог таксономии), тип тезиса, операцию и важность
 * рекомендаций (10.1), заголовки столбцов. Надстройка объявляет ВСЕ значения
 * из закрытых списков заданий машинными ключами и требует писать их
 * по-русски при любом языке документа; прежнее правило о data-section
 * сохранено ДОСЛОВНО — добавка идёт после него.
 *
 * Оговорка 10.1 в section.critique.sub.recommendations_table («Заголовки
 * столбцов и значения столбцов «Операция» и «Важность» — машинные ключи …
 * при любом языке документа») — частный случай общего правила и ему не
 * противоречит: те же слова (заголовки столбцов, значения закрытых списков,
 * «при любом языке документа»).
 *
 * Синонимов машинных значений на других языках здесь НЕТ и быть не должно:
 * путь один — модель пишет ключи по-русски, парсер громко сообщает, когда
 * она не смогла (graph-parser 11.1: warnings вместо молчаливой подстановки).
 */
import type { SeedPromptTemplate } from "./prompt-templates.js";

export const LANG_INSTRUCTION_TEMPLATE_KEY = "system.lang_instruction";

/** Фрагмент прежнего правила о data-section — обязан остаться дословно. */
export const LANG_DATA_SECTION_RULE_MARKER =
  "The data-section attribute values MUST remain EXACTLY as specified in this prompt (in Russian).";

/** Заголовок правила закрытых списков — по нему сторож узнаёт надстройку. */
export const LANG_MACHINE_VALUES_RULE_MARKER =
  "CRITICAL MACHINE-VALUE RULE";

/**
 * Обороты заданий разделов, которыми вводятся закрытые списки
 * (section-templates.ts: graph.sub.categories/edges/topology_table,
 * critique.sub.recommendations_table 10.1 и др.). Надстройка обязана
 * называть каждый из них — сторож 4av сверяет, что все обороты, встречающиеся
 * в активных шаблонах section.*, покрыты правилом.
 */
export const LANG_CLOSED_LIST_PHRASES = [
  "СТРОГО одно из",
  "Столбцы СТРОГО",
  "СТРОГО из списка",
  "Тип:",
] as const;

/**
 * Добавка к system.lang_instruction (текст на языке инструкции — английском,
 * как и сама инструкция исходника). Содержит {{lang}}: рендерится тем же
 * вызовом renderTemplate, что и основное тело.
 */
export const LANG_INSTRUCTION_ADDENDUM =
  `${LANG_MACHINE_VALUES_RULE_MARKER}: The document contains MACHINE-READABLE VALUES that the application parses programmatically. ` +
  `They are NOT translated, whatever the document language. Machine-readable values are: ` +
  `(1) every value that a section task prescribes as a CLOSED LIST — introduced by wordings such as «${LANG_CLOSED_LIST_PHRASES[0]}», «${LANG_CLOSED_LIST_PHRASES[1]}», «${LANG_CLOSED_LIST_PHRASES[2]}», «${LANG_CLOSED_LIST_PHRASES[3]} … / …» — ` +
  `e.g. the «Тип» of a category or relation, the «Направление» of a relation («однонаправленная | двунаправленная | рефлексивная»), ` +
  `structural and procedural roles of the topology table, the thesis type, the operation and severity of recommendations; ` +
  `(2) the header cells (<th>) of every mandatory table. ` +
  `Write every such value EXACTLY as it appears in the task, in Russian, even though the rest of the document is in {{lang}}. ` +
  `(3) Category names in the «Таблица связей» (columns «Источник» and «Цель») MUST be written EXACTLY as the same categories are named in the «Таблица категорий» of THIS document — otherwise the relation cannot be matched to its endpoints in any language. ` +
  `Everything else that is visible — names of categories and terms, definitions, descriptions, justifications, explanations, the visible <h4> headings — is written in {{lang}}, as required above.`;

/**
 * Тело надстройки поверх тела генерата: прежний текст ДОСЛОВНО (с его
 * завершающими переводами строки), затем добавка и те же два перевода
 * строки, которыми генерат отделяет инструкцию от ядра system.
 */
export function langInstructionBodyWithAddendum(base: string): string {
  if (base.includes(LANG_INSTRUCTION_ADDENDUM)) return base;
  const trailing = base.match(/\s*$/)?.[0] ?? "";
  const trimmed = base.slice(0, base.length - trailing.length);
  return `${trimmed}\n${LANG_INSTRUCTION_ADDENDUM}${trailing || "\n\n"}`;
}

/**
 * Надстройка над генератом системных шаблонов: system.lang_instruction
 * получает добавку о машинных значениях. Идемпотентна; ключа нет →
 * исключение (генерат сменился — надстройку надо пересмотреть, а не молча
 * потерять). Прежнее правило о data-section обязано уцелеть дословно —
 * иначе тоже исключение.
 */
export function applyLangTemplateOverrides(
  templates: readonly SeedPromptTemplate[],
): SeedPromptTemplate[] {
  let hit = false;
  const out = templates.map((t) => {
    if (t.key !== LANG_INSTRUCTION_TEMPLATE_KEY) return t;
    hit = true;
    if (!t.body.includes(LANG_DATA_SECTION_RULE_MARKER))
      throw new Error(
        `lang-templates: в генерате ${LANG_INSTRUCTION_TEMPLATE_KEY} нет правила о data-section — надстройка не накладывается на незнакомый текст`,
      );
    if (t.body.includes(LANG_INSTRUCTION_ADDENDUM)) return t;
    return {
      ...t,
      body: langInstructionBodyWithAddendum(t.body),
      description: `${t.description}; 11.1: += правило машинных значений (закрытые списки, заголовки столбцов, имена категорий в таблице связей — по-русски при любом языке)`,
    };
  });
  if (!hit)
    throw new Error(
      `lang-templates: в генерате нет шаблона ${LANG_INSTRUCTION_TEMPLATE_KEY}`,
    );
  return out;
}

/**
 * Снять отступление 11.1 из ОТРЕНДЕРЕННОГО системного промпта (для байтовой
 * сверки с исходником в smoke-12). Возвращает текст без добавки и признак,
 * что добавка стояла ровно один раз и ровно там, где её ставит надстройка
 * (после правила о data-section, перед ядром system).
 */
export function stripLangInstructionAddendum(
  sys: string,
  lang: string,
): { text: string; departed: boolean } {
  const rendered = LANG_INSTRUCTION_ADDENDUM.split("{{lang}}").join(lang);
  const first = sys.indexOf(rendered);
  if (first < 0) return { text: sys, departed: false };
  const once = sys.indexOf(rendered, first + 1) < 0;
  const before = sys.slice(0, first);
  const placed = before.endsWith("\n") && before.includes(LANG_DATA_SECTION_RULE_MARKER);
  // Добавка вставлена как "\n" + addendum перед завершающими переводами строки.
  const text = before.slice(0, before.length - 1) + sys.slice(first + rendered.length);
  return { text, departed: once && placed };
}
