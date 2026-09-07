/**
 * Плейсхолдеры шаблонов Prompt Registry на клиенте (беседа 6.2:
 * AdminPromptsPage — подсветка и предпросмотр). Чистые функции.
 *
 * Синтаксис — тот же, что у renderTemplate сервера (prompt-registry 0.3):
 * `{{name}}`, имя — [\w.-], пробелы внутри скобок допустимы. Логики в
 * шаблонах нет (01 §4.1): условные части вычисляет вызывающий код.
 *
 * SAMPLE_VALUES — тестовые подстановки предпросмотра. Это НЕ канон
 * словаря (он живёт в NEXT-CONTEXT «Схема ключей» и в prompt-builder /
 * enrichment / transform-сервисах); словарь здесь — иллюстративный, по
 * инвентарю плейсхолдеров server/config/*.ts на 2026-09-07. Неизвестному
 * плейсхолдеру предпросмотр оставляет «{{name}}» (класс .placeholder-chip
 * без .filled) — админ видит, что подстановка не задана.
 */

export const PLACEHOLDER_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

/** Уникальные имена плейсхолдеров в порядке первого появления. */
export function extractPlaceholders(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of body.matchAll(PLACEHOLDER_RE)) {
    const name = m[1]!;
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

export const SAMPLE_VALUES: Record<string, string> = {
  participants: "Кант, Хайдеггер",
  philosophers: "Кант, Хайдеггер",
  participant_word: "философов",
  participant_word_sg: "философа",
  participant_word_sg_cap: "Философа",
  each_participant: "каждого философа",
  participants_note: "Участники синтеза: Кант, Хайдеггер.",
  philosopher: "Кант",
  method_label: "Диалектический",
  method_desc: "снятие противоречий между традициями через новую категорию",
  level_label: "Трансформативный",
  level_desc: "исходные категории переосмысляются в поле напряжения",
  synth_level_desc: "исходные категории переосмысляются в поле напряжения",
  lang: "Russian",
  lang_instruction: "Пиши на русском языке.",
  output_mode_instruction: "Верни раздел целиком.",
  min_words: "1200",
  param: "Ницше",
  context: "[контекст из разделов документа]",
  section_list: "Резюме; Граф категорий; Тезисы",
  section_task: "[задание раздела-цели]",
  synthesis_context: "[базовый контекст синтеза]",
  graph_block: "[таблицы категорий и связей]",
  theses_block: "[сводная таблица тезисов]",
  sum_portrait_extra: "",
  graph_last_col_name: "Происхождение",
  graph_last_col_spec: "из какой традиции категория выросла",
  extra_category_types: "",
  extra_edge_types: "",
  category_name: "Временность долга",
  category_type: "онтологическая",
  category_definition: "Способ, каким долг конституирует горизонт времени.",
  category_origin: "Кант (долг) × Хайдеггер (временность)",
  category_roles: "central, bridge",
  category_metrics: "centrality 0.9 · certainty 0.7",
  source_name: "Долг",
  target_name: "Временность",
  source_definition: "Безусловное требование практического разума.",
  target_definition: "Экстатическое единство будущего, бывшего и настоящего.",
  edge_type: "диалектическая",
  edge_direction: "двунаправленная",
  edge_description: "Долг раскрывает временность как поле ответственности.",
  edge_metrics: "strength 0.8 · certainty 0.6",
  related_edges: "Долг → Свобода (иерархическая)",
  element_kind: "категория",
  element_label: "Временность долга",
  element_summary: "онтологическая категория; centrality 0.9",
  characteristic_key: "centrality",
  characteristic_label: "центральность",
  value: "0.9",
  current_value: "0.9",
  range: "0–1",
  concepts: "долг, временность, забота",
  dialogue_comment: "[аналитический комментарий к диалогу]",
  critique_check: "[проверочные вопросы критики]",
  theses_novelty: "[столбец новизны]",
  theses_contrib: "[столбец вклада]",
  topology_roles: "central, bridge, peripheral",
  topology_note: "",
  method_sum: "[фрагмент метода для резюме]",
  method_graph_block: "[фрагмент метода для графа]",
  method_glossary_block: "[фрагмент метода для глоссария]",
  method_dialogue: "[фрагмент метода для диалога]",
  method_critique: "[фрагмент метода для критики]",
  graph_methodology: "[подраздел «Методология построения графа»]",
  glossary_col: "Происхождение термина",
  dialogue_struct: "[структура диалога: реплики по кругу участников]",
  dialogue_table: "[таблица позиций диалога]",
  critique_novelty: "[подраздел новизны критики]",
  method_topology: "[фрагмент метода для топологии]",
  method_theses: "[фрагмент метода для тезисов]",
};

export interface PreviewPart {
  kind: "text" | "filled" | "missing";
  text: string;
  /** имя плейсхолдера (для kind ≠ text) */
  name?: string;
}

/**
 * Разбивает тело на фрагменты предпросмотра: текст, подставленные значения
 * (filled) и плейсхолдеры без значения (missing — остаются как есть).
 * Рендер — AdminPromptsPage (.placeholder-chip / .placeholder-chip.filled).
 */
export function previewParts(
  body: string,
  values: Record<string, string> = SAMPLE_VALUES,
): PreviewPart[] {
  const parts: PreviewPart[] = [];
  let last = 0;
  for (const m of body.matchAll(PLACEHOLDER_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ kind: "text", text: body.slice(last, idx) });
    const name = m[1]!;
    if (Object.prototype.hasOwnProperty.call(values, name)) {
      parts.push({ kind: "filled", text: values[name]!, name });
    } else {
      parts.push({ kind: "missing", text: m[0], name });
    }
    last = idx + m[0].length;
  }
  if (last < body.length) parts.push({ kind: "text", text: body.slice(last) });
  return parts;
}

/** Плейсхолдеры, для которых у предпросмотра нет значения. */
export function missingPlaceholders(
  body: string,
  values: Record<string, string> = SAMPLE_VALUES,
): string[] {
  return extractPlaceholders(body).filter(
    (n) => !Object.prototype.hasOwnProperty.call(values, n),
  );
}
