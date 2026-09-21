/**
 * Контракт рекомендаций критики — шаблоны Registry и надстройки конфигов
 * (беседа 10.1). НОВЫЕ тексты, НЕ из исходника: в одностраничнике
 * рекомендации — одна строка прозаического задания, инструмента нет.
 * Модуль рукописный (как enrichment-templates 5.3 и transform-templates 5.5).
 *
 * ПОЧЕМУ НЕ ПРАВКА section-templates.ts / subsection-map.ts / intra-deps.ts /
 * subsection-ctx-keys.ts. Все четыре — ГЕНЕРАТЫ из philosynth.html
 * («НЕ ПРАВИТЬ ВРУЧНУЮ»): правка рукой пропала бы при первом же
 * `npm run extract:sections` / `extract:seed`, а байтовая сверка с
 * исходником (smoke-12, секция 2g integration-check — «146 шаблонов
 * section.*») перестала бы сходиться. Поэтому отступления службы от
 * исходника живут ЗДЕСЬ надстройками, которые сиды накладывают поверх
 * генератов:
 *   - applyRecommendationTemplateOverrides — прозаический шаблон
 *     section.critique.sub.recommendations += одно требование (п.3 беседы);
 *   - withRecommendationsSubsectionMap / …IntraDeps / …CtxKeys — три правки
 *     конфигов (п.1 беседы).
 * В БД правки попадают ТОЛЬКО через сиды (seed:prompts, seed:configs).
 *
 * Тексты контракта собираются из packages/shared/constants/recommendations —
 * того же источника, по которому работает разбор: «шаблон требует одно,
 * разбор ждёт другое» исключено по построению.
 */
import {
  RECOMMENDATIONS_PROSE_SUBSECTION,
  RECOMMENDATIONS_TABLE_SUBSECTION,
  RECOMMENDATION_FORBIDDEN_OPS,
  RECOMMENDATION_HEADERS_LINE,
  RECOMMENDATION_OPS,
  RECOMMENDATION_SEVERITIES,
} from "@philosynth/shared/constants/recommendations";

import type { SeedPromptTemplate } from "./prompt-templates.js";

export const RECOMMENDATIONS_TABLE_TEMPLATE_KEY =
  "section.critique.sub.recommendations_table";
export const RECOMMENDATIONS_PROSE_TEMPLATE_KEY =
  "section.critique.sub.recommendations";
export const RECOMMENDATIONS_EXTRACT_TEMPLATE_KEY = "recommendations.extract";

const q = (list: readonly string[]): string => `"${list.join(" | ")}"`;
const guillemets = (list: readonly string[]): string =>
  list.map((w) => `«${w.charAt(0).toUpperCase()}${w.slice(1)}»`).join(", ");

/**
 * Шаблон подраздела «Таблица рекомендаций» — по образцу
 * section.graph.sub.topology_table, той же строгости: обязательная таблица,
 * строгие столбцы, закрытые списки, явные запреты, правило пустой ячейки,
 * требование полноты; назначение названо прямо, как в
 * section.theses.sub.table.
 *
 * Плейсхолдер {{document_subsections}} — закрытый список адресов ЭТОГО
 * документа (раздел: его подразделы). Без него запрет «названия, которых в
 * документе нет» невыполним: модель видит документ через блоки контекста,
 * подписанные МЕТКАМИ КОНТЕКСТА («Глоссарий → Определения», «Тезисы
 * (полные)»), и цитирует именно их — в живой концепции так записаны все семь
 * адресов, а подразделов с такими именами в документе нет. Образец приёма —
 * {{topology_roles}} у топологической таблицы.
 */
const TABLE_BODY = `ОБЯЗАТЕЛЬНАЯ итоговая таблица. Оформить строго как <table class="doc-table">.
Никакого текста в этой секции, кроме таблицы.
Столбцы СТРОГО: ${RECOMMENDATION_HEADERS_LINE}

— №: номер рекомендации из секции «${RECOMMENDATIONS_PROSE_SUBSECTION}».
  Каждая рекомендация — ОБЯЗАТЕЛЬНО в отдельной строке. Пропуски недопустимы.
  Рекомендации, которых в секции «${RECOMMENDATIONS_PROSE_SUBSECTION}» нет, — ЗАПРЕЩЕНЫ.

— Адрес: ТОЧНОЕ название подраздела документа — без «§», без названия раздела, без стрелок, без кавычек, без пояснений.
  СТРОГО из списка подразделов этого документа:
{{document_subsections}}
  Например: «Таблица категорий», «Таблица определений», «Онтологические тезисы».
  Названия, которых в списке нет, — ЗАПРЕЩЕНЫ. Метки контекста («Глоссарий → Определения», «Тезисы (полные)», «Граф → Топология») названиями подразделов НЕ являются и в этом столбце — ЗАПРЕЩЕНЫ.
  Если рекомендация относится к разделу в целом — указать тот его подраздел, в котором изменение должно произойти.
  Пустая ячейка — ЗАПРЕЩЕНА.

— Элемент: ТОЧНОЕ название категории — как в таблице категорий, либо номер тезиса — как он записан в сводной таблице тезисов (например «Э-2»), либо термин — как в таблице определений. Без кавычек, без скобок, без пояснений. Один элемент на строку.
  Если рекомендация о подразделе целиком — ячейку оставить пустой.

— Операция: СТРОГО одно из:
  ${q(RECOMMENDATION_OPS)}
  Слова вне списка — ЗАПРЕЩЕНЫ. ${guillemets(RECOMMENDATION_FORBIDDEN_OPS)} — ЗАПРЕЩЕНЫ: это не операции, а пожелания.

— Готовая замена: ТОЧНЫЙ новый текст, если рекомендация содержит его дословно; иначе — ячейку оставить пустой.
  Пересказ вместо дословного текста — ЗАПРЕЩЁН. Сочинять замену, которой в рекомендации нет, — ЗАПРЕЩЕНО.

— Основание: ТОЧНОЕ название подраздела ЭТОГО раздела (критического анализа), где проблема установлена. Например: «Верность методу синтеза».
  Пустая ячейка — ЗАПРЕЩЕНА.

— Важность: СТРОГО одно из:
  ${q(RECOMMENDATION_SEVERITIES)}
  Слова вне списка — ЗАПРЕЩЕНЫ.

ОДНА СТРОКА — ОДИН АДРЕС: рекомендация, затрагивающая два подраздела, разбивается на две строки с одним номером.
РАЗВИЛКА: если рекомендация предлагает выбор («устранить ИЛИ переопределить»), каждый вариант — отдельной строкой с тем же номером; в столбце № указать «5а» и «5б». Выбор делает человек, не документ.
Заголовки столбцов и значения столбцов «Операция» и «Важность» — машинные ключи: писать их ТОЧНО так, как здесь, на русском языке, при любом языке документа.
Эта таблица используется инструментом реализации рекомендаций.`;

/**
 * Добавка к прозаическому шаблону (п.3 беседы: «свести к минимуму, не
 * переписывать — проза для человека, строгость живёт в таблице»).
 */
export const RECOMMENDATIONS_PROSE_ADDENDUM =
  "\nКаждая рекомендация пронумерована, называет подраздел документа, к которому относится, и ссылается на подраздел этого раздела, где проблема установлена.";

/**
 * Ретрофит (п.7 беседы): ОДНО обращение к модели для концепций, созданных до
 * контракта. SYS — buildSYS(outputMode 'subsection'): ответ — один
 * <div data-section>. Контракт таблицы вставляется {{table_contract}} —
 * отрендеренным шаблоном подраздела, а не копией текста.
 */
const EXTRACT_BODY = `Составь ОДИН недостающий подраздел уже готового документа — «${RECOMMENDATIONS_TABLE_SUBSECTION}» раздела «Критический анализ».

Это НЕ новая критика и не новые рекомендации: рекомендации уже написаны, их нужно ПЕРЕЛОЖИТЬ в таблицу, ничего не добавляя, не опуская и не улучшая.

ИСХОДНЫЙ ТЕКСТ — секция «${RECOMMENDATIONS_PROSE_SUBSECTION}» этого документа:
"""
{{recommendations_prose}}
"""

ПОДРАЗДЕЛЫ КРИТИЧЕСКОГО АНАЛИЗА (для столбца «Основание»):
{{critique_subsections}}

КАТЕГОРИИ ДОКУМЕНТА (таблица категорий):
{{categories}}

ТЕЗИСЫ ДОКУМЕНТА (сводная таблица тезисов: номер — формулировка):
{{theses}}

ТЕРМИНЫ ДОКУМЕНТА (таблица определений):
{{terms}}

Исходный текст называет места документа метками вида «§ „Граф → Таблица категорий“» или «§ „Тезисы (полные)“». В столбец «Адрес» переносится НЕ метка, а подраздел из списка подразделов, которому она соответствует.

ЗАДАНИЕ — секция «${RECOMMENDATIONS_TABLE_SUBSECTION}»:
{{table_contract}}

СТРУКТУРА ОТВЕТА:
<div data-section="${RECOMMENDATIONS_TABLE_SUBSECTION}"><h4>${RECOMMENDATIONS_TABLE_SUBSECTION}</h4><table class="doc-table">…</table></div>`;

export const SEED_RECOMMENDATION_TEMPLATES: SeedPromptTemplate[] = [
  {
    key: RECOMMENDATIONS_TABLE_TEMPLATE_KEY,
    body: TABLE_BODY,
    description:
      "10.1: подраздел «Таблица рекомендаций» критики — машинный контракт (новый текст, не из исходника; закрытые списки — shared/constants/recommendations)",
  },
  {
    key: RECOMMENDATIONS_EXTRACT_TEMPLATE_KEY,
    body: EXTRACT_BODY,
    description:
      "10.1: ретрофит — составить «Таблицу рекомендаций» по готовой прозе (одно обращение; новый текст, не из исходника)",
  },
];

/** Плейсхолдеры шаблонов — для дрейф-контроля integration-check. */
export const RECOMMENDATIONS_TABLE_PLACEHOLDERS = ["document_subsections"] as const;
export const RECOMMENDATIONS_EXTRACT_PLACEHOLDERS = [
  "recommendations_prose",
  "critique_subsections",
  "categories",
  "theses",
  "terms",
  "table_contract",
] as const;

/**
 * Надстройка над генератом шаблонов разделов: прозаическому шаблону
 * рекомендаций дописывается одно требование. Идемпотентна; ключа нет →
 * исключение (генерат сменился — надстройку надо пересмотреть, а не молча
 * потерять).
 */
export function applyRecommendationTemplateOverrides(
  templates: readonly SeedPromptTemplate[],
): SeedPromptTemplate[] {
  let hit = false;
  const out = templates.map((t) => {
    if (t.key !== RECOMMENDATIONS_PROSE_TEMPLATE_KEY) return t;
    hit = true;
    if (t.body.endsWith(RECOMMENDATIONS_PROSE_ADDENDUM)) return t;
    return {
      ...t,
      body: t.body + RECOMMENDATIONS_PROSE_ADDENDUM,
      description: `${t.description}; 10.1: += требование адреса и основания`,
    };
  });
  if (!hit)
    throw new Error(
      `recommendation-templates: в генерате нет шаблона ${RECOMMENDATIONS_PROSE_TEMPLATE_KEY}`,
    );
  return out;
}

/* ── Надстройки конфигов (п.1 беседы) ────────────────────────────────── */

type SubsectionLists = Readonly<Record<string, readonly string[]>>;

/**
 * subsection_map.base.critique += «Таблица рекомендаций» сразу ПОСЛЕ
 * «Рекомендации по улучшению». Варианты critiqueNovelty / critiqueCheck
 * buildSubsectionMap вставляет после ПЕРВОГО пункта base.critique — хвост
 * (slice(1)) с новым подразделом они не задевают.
 */
export function withRecommendationsSubsectionMap(
  base: SubsectionLists,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(base)) out[k] = [...v];
  const critique = out.critique;
  if (!critique)
    throw new Error("recommendation-templates: в subsection_map.base нет critique");
  if (!critique.includes(RECOMMENDATIONS_TABLE_SUBSECTION)) {
    const at = critique.indexOf(RECOMMENDATIONS_PROSE_SUBSECTION);
    if (at < 0)
      throw new Error(
        `recommendation-templates: в base.critique нет «${RECOMMENDATIONS_PROSE_SUBSECTION}»`,
      );
    critique.splice(at + 1, 0, RECOMMENDATIONS_TABLE_SUBSECTION);
  }
  return out;
}

type NestedLists = Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;

function withCritiqueEntry(
  map: NestedLists,
  value: string[],
): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  for (const [sec, subs] of Object.entries(map)) {
    out[sec] = {};
    for (const [name, list] of Object.entries(subs)) out[sec][name] = [...list];
  }
  const critique = out.critique;
  if (!critique)
    throw new Error("recommendation-templates: в карте нет раздела critique");
  critique[RECOMMENDATIONS_TABLE_SUBSECTION] = value;
  return out;
}

/** intra_deps.critique: таблица составляется ПО прозе, а не независимо от неё. */
export function withRecommendationsIntraDeps(
  intraDeps: NestedLists,
): Record<string, Record<string, string[]>> {
  return withCritiqueEntry(intraDeps, [RECOMMENDATIONS_PROSE_SUBSECTION]);
}

/** subsection_ctx_keys.critique: своих ctx-ключей у таблицы нет. */
export function withRecommendationsCtxKeys(
  ctxKeys: NestedLists,
): Record<string, Record<string, string[]>> {
  return withCritiqueEntry(ctxKeys, []);
}
