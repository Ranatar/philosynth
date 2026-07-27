#!/usr/bin/env node
/**
 * extract-section-templates.mjs — генератор шаблонов РАЗДЕЛОВ беседы 1.2.
 *
 * Закрывает TODO-3 беседы 0.3: «шаблоны разделов (тела из buildSectionDefs)
 * не сеются — их структуру определяет section-defs-builder (беседа 1.2)».
 *
 * Извлекает ДОСЛОВНО из buildSectionDefs [philosynth.html 10742–11515]
 * (через комплект вложений docs/fragments-for-conversations/1.2-prompt-builder.js)
 * каркасные тексты каждого раздела — преамбулы, intro, тела подразделов,
 * note_after, постамбулы — и эмитит их как seed-шаблоны Prompt Registry
 * со схемой ключей (07, беседа 1.2):
 *
 *   section.{sectionKey}.preamble / .preamble_short / .intro
 *   section.{sectionKey}.postamble / .postamble_short
 *   section.{sectionKey}.sub.{slug}[.{variant}]   — тело подраздела
 *   section.{sectionKey}.sub.{slug}.note          — note_after подраздела
 *   section.{sectionKey}.shared / .bridge         — shared/bridge-блоки
 *
 * Механика фидельности — та же, что в extract-seed-data.mjs (беседа 0.3):
 * buildSectionDefs исполняется в vm со стабами, возвращающими
 * Mustache-плейсхолдеры вместо p-зависимых вставок (словоформы, метки,
 * method/level-фрагменты — они УЖЕ посеяны как method.* и level.* в 0.3 и
 * подставляются рендерером section-defs-builder). Условные ветки текста
 * (кардинальность, мета-синтез, порядок генерации, extGraphMetrics,
 * наличие диалога) покрываются ПРОФИЛЯМИ параметров: каждая ветка
 * эмитится отдельным вариантом шаблона, выбор варианта — в коде
 * section-defs-builder («условия в коде, текст в Registry», 0.3).
 *
 * Дополнительно эмитит server/config/subsection-map.ts — канонические
 * карты подразделов (SUBSECTION_MAP_BASE/GLOSSARY/CRITIQUE_* +
 * _SUM_PORTRAIT_VARIANTS) для конфига subsection_map (01-arch §4.14:
 * «SUBSECTION_MAP в БД хранить в канонических ключах + функция-резолвер
 * заголовка по кардинальности на рендере»; отложено из 0.3 намеренно).
 *
 * Запуск (из корня репозитория):
 *   node scripts/extract-section-templates.mjs
 * При обновлении source/philosynth.html — перегенерировать fragments
 * (extract-fragments.py), затем перезапустить и просмотреть diff.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FRAGMENT = join(
  ROOT,
  "docs/fragments-for-conversations/1.2-prompt-builder.js",
);
const SOURCE = join(ROOT, "source/philosynth.html");
const CONFIG_DIR = join(ROOT, "server/config");

const fragmentText = readFileSync(FRAGMENT, "utf8");
const sourceLines = readFileSync(SOURCE, "utf8").split("\n");

/* ══════════════════ Блоки фрагмента и срезы исходника ══════════════════ */

function splitFragmentBlocks(text) {
  const blocks = new Map();
  const re = /^\/\/ ───── \[([^\]]+)\] philosynth\.html строки ([\d–-]+) ─────$/;
  const lines = text.split("\n");
  let current = null;
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      current = { name: m[1], range: m[2], code: [] };
      if (!blocks.has(m[1])) blocks.set(m[1], current);
      continue;
    }
    if (current) current.code.push(line);
  }
  return blocks;
}

const blocks = splitFragmentBlocks(fragmentText);
function fragmentCode(name) {
  const b = blocks.get(name);
  if (!b) throw new Error(`Блок [${name}] не найден во фрагменте 1.2`);
  return { code: b.code.join("\n"), range: b.range };
}

const buildSectionDefsBlock = fragmentCode("buildSectionDefs");
const serializePartsBlock = fragmentCode("serializeParts");
const portraitBlock = fragmentCode("SUBSECTION_SUM_PORTRAIT");

/** Срез исходника [from..to] (1-based, включительно) в vm без стабов. */
function evalSourceSlice(from, to, returnNames) {
  const code = sourceLines.slice(from - 1, to).join("\n");
  const script = `(() => { ${code}\n; return { ${returnNames.join(", ")} }; })()`;
  return vm.runInNewContext(script, {}, { filename: `source:${from}-${to}` });
}

// SEC_NAMES [9291–9303]; карты подразделов [9314–9434]; варианты портрета [9746–9752]
const { SEC_NAMES } = evalSourceSlice(9291, 9303, ["SEC_NAMES"]);
const {
  SUBSECTION_MAP_BASE,
  SUBSECTION_MAP_GLOSSARY,
  SUBSECTION_CRITIQUE_NOVELTY,
  SUBSECTION_CRITIQUE_CHECK,
} = evalSourceSlice(9314, 9428, [
  "SUBSECTION_MAP_BASE",
  "SUBSECTION_MAP_GLOSSARY",
  "SUBSECTION_CRITIQUE_NOVELTY",
  "SUBSECTION_CRITIQUE_CHECK",
]);
const { _SUM_PORTRAIT_VARIANTS } = evalSourceSlice(9746, 9752, [
  "_SUM_PORTRAIT_VARIANTS",
]);
const SUM_PORTRAIT_VARIANTS = [..._SUM_PORTRAIT_VARIANTS];

/* ══════════════════ Стабы и профили ══════════════════ */

/** Прокси-словарь: любой ключ → фиксированный плейсхолдер. */
const PROXY = (ph) => new Proxy({}, { get: () => ph });

/** «Массив философов» для строковых подстановок: [0]/join/length. */
const PHIL = (n) => ({
  0: "{{philosopher}}",
  length: n,
  join: () => "{{philosophers}}",
});

const FULLSEC = [
  "graph",
  "glossary",
  "theses",
  "name",
  "history",
  "origin",
  "practical",
  "dialogue",
  "evolution",
  "critique",
  "capsule",
];
const NO_DIALOGUE = FULLSEC.filter((k) => k !== "dialogue");

const baseP = {
  method: "dialectical",
  synthLevel: "comparative",
  depth: "standard",
  generationOrder: "architectural",
  extGraphMetrics: false,
  seed: "",
  ctx: "",
};

/**
 * Профили параметров — по одному на покрываемую ветку buildSectionDefs.
 * card/meta задают ветвление кардинальности/мета-синтеза (стабы
 * participantCardinality / hasConceptParticipants / hasNoParticipants).
 */
const PROFILES = {
  base: { card: "multi", meta: false, p: { ...baseP, phil: PHIL(2), sec: FULLSEC } },
  nodialogue: {
    card: "multi",
    meta: false,
    p: { ...baseP, phil: PHIL(2), sec: NO_DIALOGUE },
  },
  none: { card: "none", meta: false, p: { ...baseP, phil: [], sec: FULLSEC } },
  none_nodialogue: {
    card: "none",
    meta: false,
    p: { ...baseP, phil: [], sec: NO_DIALOGUE },
  },
  single: { card: "single", meta: false, p: { ...baseP, phil: PHIL(1), sec: FULLSEC } },
  meta_single: {
    card: "single",
    meta: true,
    p: { ...baseP, phil: [], participants: [{ type: "concept", name: "X" }], sec: FULLSEC },
  },
  meta_multi: {
    card: "multi",
    meta: true,
    p: { ...baseP, phil: PHIL(1), participants: [{ type: "concept", name: "X" }], sec: FULLSEC },
  },
  genetic: {
    card: "multi",
    meta: false,
    p: { ...baseP, phil: PHIL(2), sec: FULLSEC, generationOrder: "genetic" },
  },
  ext: {
    card: "multi",
    meta: false,
    p: { ...baseP, phil: PHIL(2), sec: FULLSEC, extGraphMetrics: true },
  },
};

/** Контекст vm для профиля: стабы-плейсхолдеры + ветвление по профилю. */
function makeContext(profile) {
  return {
    console,
    // словоформы и числа (плейсхолдеры — подставляет section-defs-builder)
    participantsForPrompt: () => "{{participants}}",
    participantWord: () => "{{participant_word}}",
    participantWordSg: () => "{{participant_word_sg}}",
    eachParticipant: () => "{{each_participant}}",
    mw: () => "{{min_words}}",
    philNames: () => ({ join: () => "{{philosophers}}", length: 1 }),
    conceptNames: () => ({ join: () => "{{concepts}}", length: 1 }),
    // метки и описания метода/уровня
    ML: PROXY("{{method_label}}"),
    SL: PROXY("{{level_label}}"),
    mdText: () => "{{method_desc}}",
    sdText: () => "{{level_desc}}",
    // method-фрагменты (посеяны в 0.3 как method.{method}.{section})
    METHOD_SUM: () => PROXY("{{method_sum}}"),
    METHOD_GRAPH: () => PROXY("{{__METHOD_GRAPH__}}"),
    METHOD_TOPOLOGY: PROXY("{{method_topology}}"),
    METHOD_GLOSSARY: PROXY("{{__METHOD_GLOSSARY__}}"),
    METHOD_THESES: () => PROXY("{{method_theses}}"),
    METHOD_DIALOGUE: PROXY("{{method_dialogue}}"),
    METHOD_CRITIQUE: () => PROXY("{{method_critique}}"),
    // level-фрагменты (level.{level}.{aspect}); выбор *_GENETIC — в билдере
    LEVEL_SUM_PORTRAITS: () => PROXY("{{sum_portrait_extra}}"),
    LEVEL_GRAPH_METHODOLOGY: () => PROXY("{{graph_methodology}}"),
    LEVEL_GRAPH_METHODOLOGY_GENETIC: () => PROXY("{{graph_methodology}}"),
    LEVEL_GRAPH_LAST_COL_NAME: PROXY("{{graph_last_col_name}}"),
    LEVEL_GRAPH_LAST_COL_SPEC: () => PROXY("{{graph_last_col_spec}}"),
    LEVEL_TOPOLOGY_NOTE: () => PROXY("{{topology_note}}"),
    LEVEL_GLOSSARY_COL: () => PROXY("{{glossary_col}}"),
    LEVEL_THESES_CONTRIB: () => PROXY("{{theses_contrib}}"),
    LEVEL_THESES_NOVELTY: PROXY("{{theses_novelty}}"),
    LEVEL_DIALOGUE_STRUCT: () => PROXY("{{dialogue_struct}}"),
    LEVEL_DIALOGUE_STRUCT_GENETIC: () => PROXY("{{dialogue_struct}}"),
    LEVEL_DIALOGUE_TABLE: () => PROXY("{{dialogue_table}}"),
    LEVEL_DIALOGUE_TABLE_GENETIC: () => PROXY("{{dialogue_table}}"),
    LEVEL_DIALOGUE_COMMENT: PROXY("{{dialogue_comment}}"),
    LEVEL_DIALOGUE_COMMENT_GENETIC: PROXY("{{dialogue_comment}}"),
    LEVEL_CRITIQUE_NOVELTY: () => PROXY("{{critique_novelty}}"),
    LEVEL_CRITIQUE_CHECK: () => PROXY("{{critique_check}}"),
    // прочие словари
    TOPOLOGY_ROLES_PROCEDURAL: PROXY("{{topology_roles}}"),
    _buildExtraTypesBlock: (_m, _l, kind) =>
      kind === "category" ? "{{extra_category_types}}" : "{{extra_edge_types}}",
    SEC_NAMES, // реальный: список «Структура документа» вырезается пост-заменой
    SUBSECTION_CRITIQUE_NOVELTY, // реальные (имена подразделов, не тела)
    SUBSECTION_CRITIQUE_CHECK,
    // glossary level-подразделы билдер парсит из рендера level.*.glossary_sec
    parseGlossarySubsections: () => [],
    // ветвление кардинальности/мета — по профилю
    participantCardinality: () => profile.card,
    hasConceptParticipants: () => profile.meta,
    hasNoParticipants: () => profile.card === "none",
  };
}

/** Исполняет buildSectionDefs фрагмента под профилем → Map(sectionKey → def). */
function runProfile(name) {
  const profile = PROFILES[name];
  const script = `(() => {
${serializePartsBlock.code}
${portraitBlock.code}
${buildSectionDefsBlock.code}
; return buildSectionDefs(__P__); })()`;
  const ctx = makeContext(profile);
  ctx.__P__ = profile.p;
  const defs = vm.runInNewContext(script, ctx, {
    filename: `fragment:buildSectionDefs:${name}`,
  });
  const map = new Map();
  for (const def of defs) map.set(def.key, def);
  return map;
}

const runs = {};
for (const name of Object.keys(PROFILES)) runs[name] = runProfile(name);

/* ══════════════════ Спецификация шаблонов ══════════════════ */

const A = buildSectionDefsBlock.range; // «10742–11515»

/** Извлекает часть def по локатору. */
function pick(def, kind, name) {
  const subs = def.parts.subsections;
  const bySub = (n) => {
    const s = subs.find((x) => x.name === n);
    if (!s) throw new Error(`Подраздел «${n}» не найден в ${def.key}`);
    return s;
  };
  switch (kind) {
    case "preamble":
    case "preamble_short":
    case "intro":
    case "postamble":
    case "postamble_short":
      return def.parts[kind];
    case "sub":
      return bySub(name).body;
    case "subnote":
      return bySub(name).note_after;
    case "shared": {
      const s = subs.find((x) => x.type === "shared");
      if (!s) throw new Error(`shared-блок не найден в ${def.key}`);
      return s.body;
    }
    case "bridge": {
      const s = subs.find((x) => x.type === "bridge");
      if (!s) throw new Error(`bridge-блок не найден в ${def.key}`);
      return s.body;
    }
    case "portrait": {
      const s = subs.find((x) => _SUM_PORTRAIT_VARIANTS.has(x.name));
      if (!s) throw new Error(`портретный подраздел не найден в ${def.key}`);
      return s.body;
    }
    default:
      throw new Error(`Неизвестный локатор ${kind}`);
  }
}

/**
 * SPEC: key → [profile, sectionKey, kind, subName?, описание условий].
 * Вариантные ключи (…​.none, .ext, .genetic, …) выбирает section-defs-builder.
 */
const S = (key, profile, section, kind, name, cond) => ({
  key,
  profile,
  section,
  kind,
  name,
  cond,
});

const SPEC = [
  /* ── sum ── */
  S("section.sum.preamble", "base", "sum", "preamble", null, ""),
  S("section.sum.preamble_short", "base", "sum", "preamble_short", null, ""),
  S("section.sum.intro", "base", "sum", "intro", null, ""),
  S("section.sum.postamble", "base", "sum", "postamble", null, ""),
  S("section.sum.postamble_short", "base", "sum", "postamble_short", null, ""),
  S("section.sum.sub.goals", "base", "sum", "sub", "Цели и метод", "при участниках"),
  S("section.sum.sub.goals.none", "none", "sum", "sub", "Цели и метод", "свободный синтез"),
  S("section.sum.sub.portrait.multi", "base", "sum", "portrait", null, "≥2 философов, без концепций"),
  S("section.sum.sub.portrait.single", "single", "sum", "portrait", null, "один философ, без концепций"),
  S("section.sum.sub.portrait.none", "none", "sum", "portrait", null, "свободный синтез"),
  S("section.sum.sub.portrait.meta_single", "meta_single", "sum", "portrait", null, "мета-синтез, один участник"),
  S("section.sum.sub.portrait.meta_multi", "meta_multi", "sum", "portrait", null, "мета-синтез, ≥2 участников"),
  S("section.sum.sub.novelty", "base", "sum", "sub", "Новизна и ценность", "при участниках"),
  S("section.sum.sub.novelty.none", "none", "sum", "sub", "Новизна и ценность", "свободный синтез"),
  S("section.sum.sub.structure", "base", "sum", "sub", "Структура документа", "архитектурный порядок"),
  S("section.sum.sub.structure.genetic", "genetic", "sum", "sub", "Структура документа", "генетический порядок"),
  S("section.sum.sub.coherence", "base", "sum", "sub", "Индекс когерентности", "при участниках"),
  S("section.sum.sub.coherence.none", "none", "sum", "sub", "Индекс когерентности", "свободный синтез"),
  S("section.sum.sub.tensions", "nodialogue", "sum", "sub", "Точки напряжения", "участники, без раздела dialogue"),
  S("section.sum.sub.tensions.dialogue", "base", "sum", "sub", "Точки напряжения", "участники, dialogue включён"),
  S("section.sum.sub.tensions.none", "none_nodialogue", "sum", "sub", "Точки напряжения", "свободный синтез, без dialogue"),
  S("section.sum.sub.tensions.none_dialogue", "none", "sum", "sub", "Точки напряжения", "свободный синтез, dialogue включён"),
  S("section.sum.sub.complexity", "base", "sum", "sub", "Оценка сложности", ""),
  S("section.sum.sub.complexity.note", "base", "sum", "subnote", "Оценка сложности", "note_after"),

  /* ── graph ── */
  S("section.graph.preamble", "base", "graph", "preamble", null, ""),
  S("section.graph.preamble_short", "base", "graph", "preamble_short", null, ""),
  S("section.graph.intro", "base", "graph", "intro", null, ""),
  S("section.graph.postamble", "base", "graph", "postamble", null, ""),
  S("section.graph.postamble_short", "base", "graph", "postamble_short", null, ""),
  S("section.graph.sub.methodology", "base", "graph", "sub", "Методология построения графа", ""),
  S("section.graph.sub.categories", "base", "graph", "sub", "Таблица категорий", "extGraphMetrics=false"),
  S("section.graph.sub.categories.ext", "ext", "graph", "sub", "Таблица категорий", "extGraphMetrics=true"),
  S("section.graph.sub.edges", "base", "graph", "sub", "Таблица связей", "extGraphMetrics=false"),
  S("section.graph.sub.edges.ext", "ext", "graph", "sub", "Таблица связей", "extGraphMetrics=true"),
  S("section.graph.sub.topology", "base", "graph", "sub", "Топология графа", ""),
  S("section.graph.sub.topology_table", "base", "graph", "sub", "Топологическая таблица", ""),
  S("section.graph.sub.topology_table.note", "base", "graph", "subnote", "Топологическая таблица", "note_after"),

  /* ── glossary ── */
  S("section.glossary.preamble", "base", "glossary", "preamble", null, ""),
  S("section.glossary.preamble_short", "base", "glossary", "preamble_short", null, ""),
  S("section.glossary.intro", "base", "glossary", "intro", null, ""),
  S("section.glossary.postamble", "base", "glossary", "postamble", null, ""),
  S("section.glossary.postamble_short", "base", "glossary", "postamble_short", null, ""),
  S("section.glossary.sub.table", "base", "glossary", "sub", "Таблица определений", ""),
  S("section.glossary.sub.table.note", "base", "glossary", "subnote", "Таблица определений", "note_after"),

  /* ── theses ── */
  S("section.theses.preamble", "base", "theses", "preamble", null, ""),
  S("section.theses.preamble_short", "base", "theses", "preamble_short", null, ""),
  S("section.theses.intro", "base", "theses", "intro", null, ""),
  S("section.theses.postamble", "base", "theses", "postamble", null, ""),
  S("section.theses.postamble_short", "base", "theses", "postamble_short", null, ""),
  S("section.theses.shared", "base", "theses", "shared", null, "общие требования трёх групп тезисов"),
  S("section.theses.sub.ontological", "base", "theses", "sub", "Онтологические тезисы", ""),
  S("section.theses.sub.epistemological", "base", "theses", "sub", "Эпистемологические тезисы", ""),
  S("section.theses.sub.ethical", "base", "theses", "sub", "Этические и аксиологические тезисы", ""),
  S("section.theses.sub.table", "base", "theses", "sub", "Сводная таблица тезисов", ""),

  /* ── name ── */
  S("section.name.preamble", "base", "name", "preamble", null, ""),
  S("section.name.preamble_short", "base", "name", "preamble_short", null, ""),
  S("section.name.intro", "base", "name", "intro", null, ""),
  S("section.name.postamble", "base", "name", "postamble", null, ""),
  S("section.name.postamble_short", "base", "name", "postamble_short", null, ""),
  S("section.name.sub.variants", "base", "name", "sub", "Таблица вариантов названия", ""),
  S("section.name.sub.comparison", "base", "name", "sub", "Сравнительный анализ вариантов", ""),
  S("section.name.sub.recommendation", "base", "name", "sub", "Итоговая рекомендация", ""),

  /* ── history ── */
  S("section.history.preamble", "base", "history", "preamble", null, ""),
  S("section.history.preamble_short", "base", "history", "preamble_short", null, ""),
  S("section.history.intro", "base", "history", "intro", null, ""),
  S("section.history.postamble", "base", "history", "postamble", null, ""),
  S("section.history.postamble_short", "base", "history", "postamble_short", null, ""),
  S("section.history.sub.context", "base", "history", "sub", "Исторический контекст", ""),
  S("section.history.sub.influence", "base", "history", "sub", "Источники влияния", ""),
  S("section.history.sub.genealogy", "base", "history", "sub", "Генеалогия идей", "extGraphMetrics=false"),
  S("section.history.sub.genealogy.ext", "ext", "history", "sub", "Генеалогия идей", "extGraphMetrics=true"),
  S("section.history.sub.modern", "base", "history", "sub", "Современные концепции", ""),
  S("section.history.sub.impact", "base", "history", "sub", "Потенциальное влияние", ""),
  S("section.history.sub.title_in_history", "base", "history", "sub", "Название в историческом контексте", ""),

  /* ── origin ── */
  S("section.origin.preamble", "base", "origin", "preamble", null, ""),
  S("section.origin.preamble_short", "base", "origin", "preamble_short", null, ""),
  S("section.origin.intro", "base", "origin", "intro", null, ""),
  S("section.origin.postamble", "base", "origin", "postamble", null, ""),
  S("section.origin.postamble_short", "base", "origin", "postamble_short", null, ""),
  S("section.origin.sub.parent_traditions", "base", "origin", "sub", "Идентификация родительских традиций", ""),
  S("section.origin.sub.decomposition", "base", "origin", "sub", "Элементная декомпозиция", "extGraphMetrics=false"),
  S("section.origin.sub.decomposition.ext", "ext", "origin", "sub", "Элементная декомпозиция", "extGraphMetrics=true"),
  S("section.origin.sub.originality", "base", "origin", "sub", "Оценка оригинальности", "extGraphMetrics=false"),
  S("section.origin.sub.originality.ext", "ext", "origin", "sub", "Оценка оригинальности", "extGraphMetrics=true"),
  S("section.origin.sub.objections", "base", "origin", "sub", "Потенциальные возражения", "философы, без концепций"),
  S("section.origin.sub.objections.meta", "meta_multi", "origin", "sub", "Потенциальные возражения", "мета-синтез"),
  S("section.origin.sub.objections.none", "none", "origin", "sub", "Потенциальные возражения", "свободный синтез"),

  /* ── practical ── */
  S("section.practical.preamble", "base", "practical", "preamble", null, ""),
  S("section.practical.preamble_short", "base", "practical", "preamble_short", null, ""),
  S("section.practical.intro", "base", "practical", "intro", null, ""),
  S("section.practical.postamble", "base", "practical", "postamble", null, ""),
  S("section.practical.postamble_short", "base", "practical", "postamble_short", null, ""),
  S("section.practical.shared", "base", "practical", "shared", null, "5 обязательных подпунктов каждой области"),
  S("section.practical.sub.education", "base", "practical", "sub", "Образование", ""),
  S("section.practical.sub.ethics", "base", "practical", "sub", "Этика и принятие решений", ""),
  S("section.practical.sub.psychology", "base", "practical", "sub", "Психология и личностное развитие", ""),
  S("section.practical.sub.social", "base", "practical", "sub", "Социальные институты", ""),
  S("section.practical.sub.intercultural", "base", "practical", "sub", "Межкультурный диалог", ""),
  S("section.practical.sub.table", "base", "practical", "sub", "Сводная таблица", "extGraphMetrics=false"),
  S("section.practical.sub.table.ext", "ext", "practical", "sub", "Сводная таблица", "extGraphMetrics=true"),

  /* ── dialogue ── */
  S("section.dialogue.preamble", "base", "dialogue", "preamble", null, "есть участники"),
  S("section.dialogue.preamble.none", "none", "dialogue", "preamble", null, "свободный синтез"),
  S("section.dialogue.preamble_short", "base", "dialogue", "preamble_short", null, "есть участники"),
  S("section.dialogue.preamble_short.none", "none", "dialogue", "preamble_short", null, "свободный синтез"),
  S("section.dialogue.intro", "base", "dialogue", "intro", null, ""),
  S("section.dialogue.postamble", "base", "dialogue", "postamble", null, ""),
  S("section.dialogue.postamble_short", "base", "dialogue", "postamble_short", null, ""),
  S("section.dialogue.sub.dialogue", "base", "dialogue", "sub", "Межфилософский диалог", ""),
  S("section.dialogue.bridge", "base", "dialogue", "bridge", null, "мост перед итоговыми секциями"),
  S("section.dialogue.sub.table", "base", "dialogue", "sub", "Итоговая таблица диалога", ""),
  S("section.dialogue.sub.comment", "base", "dialogue", "sub", "Аналитический комментарий", "архитектурный порядок"),
  S("section.dialogue.sub.comment.genetic", "genetic", "dialogue", "sub", "Аналитический комментарий", "генетический порядок"),

  /* ── evolution ── */
  S("section.evolution.preamble", "base", "evolution", "preamble", null, ""),
  S("section.evolution.preamble_short", "base", "evolution", "preamble_short", null, ""),
  S("section.evolution.intro", "base", "evolution", "intro", null, ""),
  S("section.evolution.postamble", "base", "evolution", "postamble", null, ""),
  S("section.evolution.postamble_short", "base", "evolution", "postamble_short", null, ""),
  S("section.evolution.sub.directions", "base", "evolution", "sub", "Направления развития", "extGraphMetrics=false"),
  S("section.evolution.sub.directions.ext", "ext", "evolution", "sub", "Направления развития", "extGraphMetrics=true"),
  S("section.evolution.sub.graph_changes", "base", "evolution", "sub", "Предлагаемые изменения графа", ""),
  S("section.evolution.sub.title_evolution", "base", "evolution", "sub", "Эволюция названия", ""),
  S("section.evolution.sub.science", "base", "evolution", "sub", "Интеграция с современной наукой", ""),
  S("section.evolution.sub.timeline", "base", "evolution", "sub", "Временная карта развития", ""),

  /* ── critique ── */
  S("section.critique.preamble", "base", "critique", "preamble", null, ""),
  S("section.critique.preamble_short", "base", "critique", "preamble_short", null, ""),
  S("section.critique.intro", "base", "critique", "intro", null, ""),
  S("section.critique.postamble", "base", "critique", "postamble", null, ""),
  S("section.critique.postamble_short", "base", "critique", "postamble_short", null, ""),
  S("section.critique.sub.coherence", "base", "critique", "sub", "Внутренняя когерентность", ""),
  S("section.critique.sub.interlayer", "base", "critique", "sub", "Межслойная согласованность", "dialogue + формальные разделы"),
  S("section.critique.sub.novelty", "base", "critique", "sub", SUBSECTION_CRITIQUE_NOVELTY.comparative, "имя подраздела — по уровню (subsection_map)"),
  S("section.critique.sub.check", "nodialogue", "critique", "sub", SUBSECTION_CRITIQUE_CHECK.comparative, "без dialogue"),
  S("section.critique.sub.check.dialogue", "base", "critique", "sub", SUBSECTION_CRITIQUE_CHECK.comparative, "dialogue включён"),
  S("section.critique.sub.method", "base", "critique", "sub", "Верность методу синтеза", ""),
  S("section.critique.sub.preservation", "base", "critique", "sub", "Сохранение ценных аспектов", ""),
  S("section.critique.sub.resolution", "base", "critique", "sub", "Разрешение противоречий", ""),
  S("section.critique.sub.blindspots", "base", "critique", "sub", "Слепые пятна", ""),
  S("section.critique.sub.final", "nodialogue", "critique", "sub", "Итоговая оценка", "без критерия межслойной согласованности"),
  S("section.critique.sub.final.interlayer", "base", "critique", "sub", "Итоговая оценка", "dialogue + формальные разделы"),
  S("section.critique.sub.recommendations", "base", "critique", "sub", "Рекомендации по улучшению", ""),

  /* ── capsule ── */
  S("section.capsule.preamble", "base", "capsule", "preamble", null, ""),
  S("section.capsule.preamble_short", "base", "capsule", "preamble_short", null, ""),
  S("section.capsule.intro", "base", "capsule", "intro", null, ""),
  S("section.capsule.postamble", "base", "capsule", "postamble", null, ""),
  S("section.capsule.postamble_short", "base", "capsule", "postamble_short", null, ""),
  S("section.capsule.sub.capsule", "base", "capsule", "sub", "Капсула", ""),
];

/* ══════════════════ Пост-замены ══════════════════ */

// Полный перечень «Структура документа» профилей (реальный SEC_NAMES) →
// плейсхолдер {{section_list}} (список секций p-зависим).
const secListStr = ["Исполнительное резюме (данный раздел)", ...FULLSEC.map((k) => SEC_NAMES[k] || k)]
  .map((n, i) => `${i + 1}. ${n}`)
  .join("\n");

/** key → [ [from, to], … ]; `first:` — заменить только первое вхождение. */
const POST = {
  "section.graph.sub.methodology": [["{{__METHOD_GRAPH__}}\n\n", "{{method_graph_block}}"]],
  "section.glossary.sub.table": [["\n{{__METHOD_GLOSSARY__}}", "{{method_glossary_block}}"]],
  "section.history.sub.influence": [
    ["first:{{participant_word_sg}}", "{{participant_word_sg_cap}}"],
  ],
  "section.sum.sub.structure": [[secListStr, "{{section_list}}"]],
  "section.sum.sub.structure.genetic": [[secListStr, "{{section_list}}"]],
};

function applyPost(key, body) {
  const rules = POST[key];
  if (!rules) return body;
  let out = body;
  for (const [fromRaw, to] of rules) {
    const first = fromRaw.startsWith("first:");
    const from = first ? fromRaw.slice("first:".length) : fromRaw;
    if (!out.includes(from))
      throw new Error(`Пост-замена ${key}: фрагмент не найден`);
    out = first ? out.replace(from, to) : out.split(from).join(to);
  }
  return out;
}

/* ══════════════════ Сборка и QC ══════════════════ */

const KNOWN_PLACEHOLDERS = new Set([
  "method_label",
  "level_label",
  "method_desc",
  "level_desc",
  "min_words",
  "participants",
  "participant_word",
  "participant_word_sg",
  "participant_word_sg_cap",
  "each_participant",
  "philosopher",
  "philosophers",
  "concepts",
  "section_list",
  "method_sum",
  "method_graph_block",
  "method_topology",
  "method_glossary_block",
  "method_theses",
  "method_dialogue",
  "method_critique",
  "graph_methodology",
  "graph_last_col_name",
  "graph_last_col_spec",
  "topology_note",
  "topology_roles",
  "sum_portrait_extra",
  "glossary_col",
  "theses_contrib",
  "theses_novelty",
  "dialogue_struct",
  "dialogue_table",
  "dialogue_comment",
  "critique_novelty",
  "critique_check",
  "extra_category_types",
  "extra_edge_types",
]);

const templates = [];
for (const s of SPEC) {
  const def = runs[s.profile].get(s.section);
  if (!def) throw new Error(`Профиль ${s.profile}: раздел ${s.section} не построен`);
  let body = pick(def, s.kind, s.name);
  if (typeof body !== "string")
    throw new Error(`${s.key}: тело не строка (${typeof body})`);
  body = applyPost(s.key, body);
  const kindLabel =
    s.kind === "sub" || s.kind === "portrait"
      ? `подраздел «${s.name ?? "Портрет …"}»`
      : s.kind === "subnote"
        ? `note_after «${s.name}»`
        : s.kind;
  templates.push({
    key: s.key,
    body,
    description:
      `buildSectionDefs/${s.section}: ${kindLabel}` +
      (s.cond ? ` — ${s.cond}` : "") +
      ` [philosynth.html ${A}]`,
  });
}

// QC 1: уникальность ключей
{
  const keys = templates.map((t) => t.key);
  if (new Set(keys).size !== keys.length)
    throw new Error("Дубликаты ключей section-шаблонов!");
}
// QC 2: нет неразрешённых ${…} и служебных токенов
for (const t of templates) {
  if (t.body.includes("${"))
    throw new Error(`Неразрешённые \${…} в ${t.key}`);
  if (t.body.includes("__METHOD"))
    throw new Error(`Служебный токен не заменён в ${t.key}`);
}
// QC 3: инвентарь плейсхолдеров ⊆ известных
const PH_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;
for (const t of templates) {
  for (const m of t.body.matchAll(PH_RE)) {
    if (!KNOWN_PLACEHOLDERS.has(m[1]))
      throw new Error(`Неизвестный плейсхолдер {{${m[1]}}} в ${t.key}`);
  }
}
// QC 4: покрытие — каждая часть каждого раздела base-профиля захвачена
{
  const covered = new Set(
    SPEC.filter((s) => true).map((s) => `${s.section}|${s.kind}|${s.name ?? ""}`),
  );
  // портрет: локатор "portrait" покрывает любой вариант имени
  const portraitCovered = SPEC.some((s) => s.kind === "portrait");
  for (const [secKey, def] of runs.base) {
    for (const part of [
      "preamble",
      "preamble_short",
      "intro",
      "postamble",
      "postamble_short",
    ]) {
      if (
        typeof def.parts[part] === "string" &&
        !covered.has(`${secKey}|${part}|`)
      )
        throw new Error(`Покрытие: ${secKey}.${part} не захвачен`);
    }
    for (const sub of def.parts.subsections) {
      if (sub.type === "shared" || sub.type === "bridge") {
        if (!covered.has(`${secKey}|${sub.type}|`))
          throw new Error(`Покрытие: ${secKey} ${sub.type}-блок не захвачен`);
        continue;
      }
      if (_SUM_PORTRAIT_VARIANTS.has(sub.name)) {
        if (!portraitCovered)
          throw new Error(`Покрытие: портрет не захвачен`);
      } else if (!covered.has(`${secKey}|sub|${sub.name}`)) {
        throw new Error(`Покрытие: ${secKey} подраздел «${sub.name}» не захвачен`);
      }
      if (
        typeof sub.note_after === "string" &&
        sub.note_after &&
        !covered.has(`${secKey}|subnote|${sub.name}`)
      )
        throw new Error(`Покрытие: ${secKey} note_after «${sub.name}» не захвачен`);
    }
  }
}

/* ══════════════════ Эмиссия ══════════════════ */

mkdirSync(CONFIG_DIR, { recursive: true });
const emit = (v) => JSON.stringify(v, null, 2);

{
  let out = `/**
 * Seed-шаблоны РАЗДЕЛОВ Prompt Registry (section.{key}.* → prompt_templates).
 * Каркасные тексты buildSectionDefs; выбор вариантов (.none, .ext,
 * .genetic, .meta_single, .meta_multi, .dialogue) и подстановку плейсхолдеров выполняет
 * server/services/section-defs-builder.ts (беседа 1.2).
 * СГЕНЕРИРОВАНО scripts/extract-section-templates.mjs из philosynth.html
 * (ревизия 2026-07, 26 024 стр.; buildSectionDefs строки ${A}).
 * НЕ ПРАВИТЬ ВРУЧНУЮ — перегенерировать при обновлении исходника.
 */

import type { SeedPromptTemplate } from "./prompt-templates.js";

export const SEED_SECTION_TEMPLATES: SeedPromptTemplate[] = ${emit(templates)};
`;
  writeFileSync(join(CONFIG_DIR, "section-templates.ts"), out);
  console.log(
    `✓ server/config/section-templates.ts (${templates.length} шаблонов)`,
  );
}

{
  let out = `/**
 * Канонические карты подразделов (seed → synthesis_configs, ключ subsection_map).
 * Карта хранится в КАНОНИЧЕСКИХ ключах («Портрет каждого философа»);
 * заголовок портрета по кардинальности резолвит SUBSECTION_SUM_PORTRAIT
 * в section-defs-builder (v11, 01-arch §4.14).
 * СГЕНЕРИРОВАНО scripts/extract-section-templates.mjs из philosynth.html
 * (ревизия 2026-07, 26 024 стр.; строки 9314–9434, 9746–9752).
 * НЕ ПРАВИТЬ ВРУЧНУЮ — перегенерировать при обновлении исходника.
 */

/** SUBSECTION_MAP_BASE [philosynth.html строки 9314–9389] */
export const SUBSECTION_MAP_BASE = ${emit(SUBSECTION_MAP_BASE)} as const;

/** SUBSECTION_MAP_GLOSSARY [philosynth.html строки 9392–9411] */
export const SUBSECTION_MAP_GLOSSARY = ${emit(SUBSECTION_MAP_GLOSSARY)} as const;

/** SUBSECTION_CRITIQUE_NOVELTY [philosynth.html строки 9414–9420] */
export const SUBSECTION_CRITIQUE_NOVELTY = ${emit(SUBSECTION_CRITIQUE_NOVELTY)} as const;

/** SUBSECTION_CRITIQUE_CHECK [philosynth.html строки 9423–9434] */
export const SUBSECTION_CRITIQUE_CHECK = ${emit(SUBSECTION_CRITIQUE_CHECK)} as const;

/** _SUM_PORTRAIT_VARIANTS [philosynth.html строки 9746–9752] */
export const SUM_PORTRAIT_VARIANTS = ${emit(SUM_PORTRAIT_VARIANTS)} as const;
`;
  writeFileSync(join(CONFIG_DIR, "subsection-map.ts"), out);
  console.log("✓ server/config/subsection-map.ts");
}

console.log(
  `\nИтог: ${templates.length} section-шаблонов; ` +
    `профилей исполнено: ${Object.keys(PROFILES).length}; ` +
    `вариантных ключей: ${templates.filter((t) => /\.(none|ext|genetic|meta_\w+|dialogue|none_dialogue|interlayer)$/.test(t.key)).length}`,
);
