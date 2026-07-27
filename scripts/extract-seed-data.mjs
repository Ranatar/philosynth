#!/usr/bin/env node
/**
 * extract-seed-data.mjs — генератор seed-данных беседы 0.3.
 *
 * Извлекает ДОСЛОВНО из philosynth.html (через готовый комплект вложений
 * docs/fragments-for-conversations/0.3-seed-prompts-configs.js и сам исходник):
 *
 *   1. Конфиг-объекты (CONTEXT_DEPS_*, SUBSTITUTION_MAP*, COMPAT_MATRIX_COMPACT,
 *      INTRA_DEPS, SUBSECTION_TO_CTX_KEYS, TOPOLOGY_ROLES_PROCEDURAL,
 *      FRAGMENT_SHARE, CONTEXT_BUDGET, PARENT_*, MD_BY_CARD, SD_BY_CARD,
 *      MODE_DEPS, _EXTRA_*) → server/config/*.ts (11 модулей, 05-file-structure).
 *
 *   2. Промптовые шаблоны (buildSYS, buildQualityReinforcement, STOP_SIGNAL,
 *      METHOD_SUM…METHOD_DIALOGUE, METHOD_CRITIQUE, LEVEL_*, MODE_CONFIG)
 *      → server/config/prompt-templates.ts.
 *
 * Механика фидельности: фабрики промптов (p) => {...} исполняются в vm
 * со стабами словоформ, возвращающими Mustache-плейсхолдеры:
 *   participantsForPrompt → {{participants}}
 *   participantWord       → {{participant_word}}
 *   participantWordSg     → {{participant_word_sg}}
 *   eachParticipant       → {{each_participant}}
 *   mw                    → {{min_words}}
 * Результат — байт-в-байт текст исходника, где p-зависимые вставки заменены
 * плейсхолдерами («кардинальные фрагменты подставляются рендерером»,
 * 01-architecture §4.1 v11). Логика остаётся в коде (prompt-builder, беседа 1.2),
 * в шаблонах — только текст.
 *
 * Запуск (из корня репозитория):
 *   node scripts/extract-seed-data.mjs
 * При обновлении source/philosynth.html — перезапустить и просмотреть diff.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FRAGMENT = join(
  ROOT,
  "docs/fragments-for-conversations/0.3-seed-prompts-configs.js",
);
const SOURCE = join(ROOT, "source/philosynth.html");
const CONFIG_DIR = join(ROOT, "server/config");

const fragmentText = readFileSync(FRAGMENT, "utf8");
const sourceLines = readFileSync(SOURCE, "utf8").split("\n");

/* ══════════════════ 1. Конфиг-блоки из фрагмента ══════════════════ */

/** Разбивает файл-комплект по баннерам «// ───── [NAME] … ─────». */
function splitFragmentBlocks(text) {
  const blocks = new Map(); // name → { code, sourceRange }
  const re = /^\/\/ ───── \[([^\]]+)\] philosynth\.html строки ([\d–-]+) ─────$/;
  const lines = text.split("\n");
  let current = null;
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      current = { name: m[1], range: m[2], code: [] };
      // первый баннер с данным именем выигрывает (дубликаты игнорируем)
      if (!blocks.has(m[1])) blocks.set(m[1], current);
      else current = { name: m[1], range: m[2], code: [] }; // сирота
      continue;
    }
    if (current) current.code.push(line);
  }
  return blocks;
}

/** Исполняет блок «const NAME = …;» в чистом vm и возвращает значение NAME. */
function evalBlock(name, code) {
  const script = `(() => { ${code}\n; return ${name}; })()`;
  return vm.runInNewContext(script, {}, { filename: `fragment:${name}` });
}

const blocks = splitFragmentBlocks(fragmentText);

function requireConfig(name) {
  const b = blocks.get(name);
  if (!b) throw new Error(`Блок [${name}] не найден во фрагменте`);
  const value = evalBlock(name, b.code.join("\n"));
  return { value, range: b.range };
}

const CONFIG_NAMES = [
  "CONTEXT_DEPS_BASE",
  "CONTEXT_DEPS_GENETIC",
  "CONTEXT_DEPS_LEVEL",
  "CONTEXT_DEPS_LEVEL_GENETIC",
  "CONTEXT_DEPS_METHOD",
  "SUBSTITUTION_MAP",
  "SUBSTITUTION_MAP_GENETIC",
  "COMPAT_MATRIX_COMPACT",
  "COMPAT_SEC_LABELS",
  "INTRA_DEPS",
  "SUBSECTION_TO_CTX_KEYS",
  "TOPOLOGY_ROLES_PROCEDURAL",
  "FRAGMENT_SHARE",
  "CONTEXT_BUDGET",
  "PARENT_FIELD_ORDER",
  "PARENT_FIELD_LABELS",
  "PARENT_DEPS_BASE",
  "PARENT_DEPS_GENETIC",
  "PARENT_DEPS_LEVEL",
  "PARENT_DEPS_LEVEL_GENETIC",
  "PARENT_DEPS_METHOD",
  "PARENT_INTRA_DEPS",
  "MD_BY_CARD",
  "SD_BY_CARD",
  "MODE_DEPS",
  "_EXTRA_CATEGORY_TYPES",
  "_EXTRA_EDGE_TYPES",
  "_SYNTH_LEVEL_TYPE_PHRASING",
];

const cfg = {};
for (const name of CONFIG_NAMES) cfg[name] = requireConfig(name);

/* ══════════════════ 2. Промпт-фабрики из исходника ══════════════════ */

/** Стабы словоформ: вместо вычисления по p возвращают плейсхолдеры. */
const stubs = {
  participantsForPrompt: () => "{{participants}}",
  participantWord: () => "{{participant_word}}",
  participantWordSg: () => "{{participant_word_sg}}",
  eachParticipant: () => "{{each_participant}}",
  mw: () => "{{min_words}}",
  console, // _validate-подобные предупреждения, если встретятся
};

/** Исполняет срез исходника [from..to] (1-based, включительно) в vm со стабами
 *  и возвращает запрошенные имена. */
function evalSourceSlice(from, to, returnNames) {
  const code = sourceLines.slice(from - 1, to).join("\n");
  const script = `(() => { ${code}\n; return { ${returnNames.join(", ")} }; })()`;
  return vm.runInNewContext(script, { ...stubs }, { filename: `source:${from}-${to}` });
}

// buildSYS(8590) … SEC_NAMES (закрывается на 9303); METHOD_CRITIQUE — до 9290
const promptFns = evalSourceSlice(8590, 9304, [
  "buildSYS",
  "buildQualityReinforcement",
  "METHOD_SUM",
  "METHOD_GRAPH",
  "METHOD_TOPOLOGY",
  "METHOD_GLOSSARY",
  "METHOD_THESES",
  "METHOD_DIALOGUE",
  "METHOD_CRITIQUE",
  "LEVEL_GRAPH_METHODOLOGY",
  "LEVEL_GRAPH_METHODOLOGY_GENETIC",
  "LEVEL_GRAPH_LAST_COL_NAME",
  "LEVEL_GRAPH_LAST_COL_SPEC",
  "LEVEL_TOPOLOGY_NOTE",
  "LEVEL_SUM_PORTRAITS",
  "LEVEL_GLOSSARY_COL",
  "LEVEL_GLOSSARY_SEC",
  "LEVEL_THESES_CONTRIB",
  "LEVEL_THESES_NOVELTY",
  "LEVEL_DIALOGUE_STRUCT",
  "LEVEL_DIALOGUE_STRUCT_GENETIC",
  "LEVEL_DIALOGUE_TABLE",
  "LEVEL_DIALOGUE_TABLE_GENETIC",
  "LEVEL_DIALOGUE_COMMENT",
  "LEVEL_DIALOGUE_COMMENT_GENETIC",
  "LEVEL_CRITIQUE_NOVELTY",
  "LEVEL_CRITIQUE_CHECK",
]);

// STOP_SIGNAL [~10511]
const { STOP_SIGNAL } = evalSourceSlice(10510, 10514, ["STOP_SIGNAL"]);

// MODE_CONFIG [~22579]
const { MODE_CONFIG } = evalSourceSlice(22579, 22650, ["MODE_CONFIG"]);

/* ══════════════════ 3. Сборка списка шаблонов ══════════════════ */

const METHODS = [
  "dialectical",
  "integrative",
  "deconstructive",
  "hermeneutical",
  "analytical",
  "creative",
];
const LEVELS = ["comparative", "transformative", "generative"];

/** @type {{key:string, body:string, description:string}[]} */
const templates = [];
const push = (key, body, description) => {
  if (typeof body !== "string")
    throw new Error(`Шаблон ${key}: тело не строка (${typeof body})`);
  templates.push({ key, body, description });
};

/* ── system: разложение buildSYS на инвариантное ядро + 3 подшаблона ── */
{
  const pSys = { phil: ["__PHILS__"], lang: "__LANG__" };
  const full = promptFns.buildSYS(pSys, { outputMode: "full" });
  const sub = promptFns.buildSYS(pSys, { outputMode: "subsection" });
  const mode = promptFns.buildSYS(pSys, { outputMode: "mode" });

  // Общий префикс трёх вариантов = ядро до хвоста output-mode
  let cp = 0;
  while (cp < full.length && full[cp] === sub[cp] && full[cp] === mode[cp]) cp++;
  const head = full.slice(0, cp);
  const tails = {
    full: full.slice(cp),
    subsection: sub.slice(cp),
    mode: mode.slice(cp),
  };

  const CORE_START = "Ты — ведущий специалист";
  const coreIdx = head.indexOf(CORE_START);
  if (coreIdx < 0) throw new Error("buildSYS: не найдено начало ядра");
  const langInstruction = head.slice(0, coreIdx);
  if (!langInstruction.includes("__LANG__"))
    throw new Error("buildSYS: langInstruction не содержит маркер языка");

  const PHIL_NOTE_MARKER = "__PHILS__";
  let core = head.slice(coreIdx);
  const noteStart = core.indexOf("\n- Каждый участник (");
  if (noteStart < 0) throw new Error("buildSYS: не найдена participants-заметка");
  const noteEnd = core.indexOf("без искажения его позиции", noteStart);
  if (noteEnd < 0) throw new Error("buildSYS: не найден конец заметки");
  const noteText = core.slice(
    noteStart,
    noteEnd + "без искажения его позиции".length,
  );
  core =
    core.slice(0, noteStart) +
    "{{participants_note}}" +
    core.slice(noteStart + noteText.length);

  push(
    "system",
    "{{lang_instruction}}" + core + "{{output_mode_instruction}}",
    "buildSYS: инвариантное ядро системного промпта [philosynth.html ~8590]. " +
      "Плейсхолдеры собираются prompt-builder'ом: lang_instruction — " +
      "рендер system.lang_instruction при lang≠Russian, иначе ''; " +
      "participants_note — рендер system.participants_note при непустом " +
      "списке философов, иначе ''; output_mode_instruction — " +
      "system.output_mode.{full|subsection|mode}.",
  );
  push(
    "system.lang_instruction",
    langInstruction.replaceAll("__LANG__", "{{lang}}"),
    "buildSYS: языковая инструкция (включается только при lang ≠ Russian) [~8597]",
  );
  push(
    "system.participants_note",
    noteText.replaceAll(PHIL_NOTE_MARKER, "{{philosophers}}"),
    "buildSYS: пункт качества про участников (включается при непустом p.phil) [~8636]",
  );
  for (const [k, v] of Object.entries(tails)) {
    push(
      `system.output_mode.${k}`,
      v,
      `buildSYS: инструкция формата вывода outputMode=${k} [~8640]`,
    );
  }
}

/* ── quality_reinforcement, stop_signal ── */
push(
  "quality_reinforcement",
  promptFns.buildQualityReinforcement({ depth: "standard" }),
  "buildQualityReinforcement [~8649]; {{min_words}} = mw(p) по depth " +
    "(overview 150 / standard 250 / deep 400 / exhaustive 600)",
);
push(
  "stop_signal",
  STOP_SIGNAL,
  "STOP_SIGNAL (v10) [~10511]: добавляется в конец итогового задания " +
    "раздела(ов) — ${sp}${quality}${STOP_SIGNAL} в исходнике",
);

/* ── method.{method}.{section} ── */
const methodDicts = {
  sum: promptFns.METHOD_SUM({}),
  graph: promptFns.METHOD_GRAPH({}),
  topology: promptFns.METHOD_TOPOLOGY,
  glossary: promptFns.METHOD_GLOSSARY,
  theses: promptFns.METHOD_THESES({}),
  dialogue: promptFns.METHOD_DIALOGUE,
  critique: promptFns.METHOD_CRITIQUE({}),
};
const methodAnchors = {
  sum: "~8661",
  graph: "~8707",
  topology: "~8763",
  glossary: "~8819",
  theses: "~8835",
  dialogue: "~8878",
  critique: "~9241",
};
for (const [section, dict] of Object.entries(methodDicts)) {
  for (const method of METHODS) {
    if (!(method in dict))
      throw new Error(`METHOD_${section}: нет метода ${method}`);
    push(
      `method.${method}.${section}`,
      dict[method],
      `METHOD_${section.toUpperCase()}.${method} [philosynth.html ${methodAnchors[section]}]`,
    );
  }
}

/* ── level.{level}.{aspect} ── */
const levelDicts = {
  graph_methodology: [promptFns.LEVEL_GRAPH_METHODOLOGY({}), "~8900"],
  graph_methodology_genetic: [
    promptFns.LEVEL_GRAPH_METHODOLOGY_GENETIC({}),
    "~8922",
  ],
  graph_last_col_name: [promptFns.LEVEL_GRAPH_LAST_COL_NAME, "~8990"],
  graph_last_col_spec: [promptFns.LEVEL_GRAPH_LAST_COL_SPEC({}), "~8995"],
  topology_note: [promptFns.LEVEL_TOPOLOGY_NOTE({}), "~9009"],
  sum_portraits: [promptFns.LEVEL_SUM_PORTRAITS({}), "~9028"],
  glossary_col: [promptFns.LEVEL_GLOSSARY_COL({}), "~9044"],
  glossary_sec: [promptFns.LEVEL_GLOSSARY_SEC({}), "~9057"],
  theses_contrib: [promptFns.LEVEL_THESES_CONTRIB({}), "~9107"],
  theses_novelty: [promptFns.LEVEL_THESES_NOVELTY, "~9122"],
  dialogue_struct: [promptFns.LEVEL_DIALOGUE_STRUCT({}), "~9132"],
  dialogue_struct_genetic: [promptFns.LEVEL_DIALOGUE_STRUCT_GENETIC({}), "~9159"],
  dialogue_table: [promptFns.LEVEL_DIALOGUE_TABLE({}), "~9183"],
  dialogue_table_genetic: [promptFns.LEVEL_DIALOGUE_TABLE_GENETIC({}), "~9192"],
  dialogue_comment: [promptFns.LEVEL_DIALOGUE_COMMENT, "~9200"],
  dialogue_comment_genetic: [promptFns.LEVEL_DIALOGUE_COMMENT_GENETIC, "~9206"],
  critique_novelty: [promptFns.LEVEL_CRITIQUE_NOVELTY({}), "~9213"],
  critique_check: [promptFns.LEVEL_CRITIQUE_CHECK({}), "~9228"],
};
for (const [aspect, [dict, anchor]] of Object.entries(levelDicts)) {
  for (const level of LEVELS) {
    if (!(level in dict))
      throw new Error(`LEVEL_${aspect}: нет уровня ${level}`);
    push(
      `level.${level}.${aspect}`,
      dict[level],
      `LEVEL_${aspect.toUpperCase()}.${level} [philosynth.html ${anchor}]`,
    );
  }
}

/* ── mode.{modeKey} ── */
for (const [modeKey, conf] of Object.entries(MODE_CONFIG)) {
  push(
    `mode.${modeKey}`,
    conf.buildPrompt("{{param}}", "{{context}}"),
    `MODE_CONFIG.${modeKey}.buildPrompt [philosynth.html ~22579]; ` +
      `{{param}} — параметр режима, {{context}} — buildModeContext`,
  );
}

/* ══════════════════ 4. Эмиссия TS-модулей ══════════════════ */

mkdirSync(CONFIG_DIR, { recursive: true });

const GEN_NOTE = (what, ranges) =>
  `/**
 * ${what}
 * СГЕНЕРИРОВАНО scripts/extract-seed-data.mjs из philosynth.html
 * (ревизия 2026-07, 26 024 стр.; строки: ${ranges}).
 * НЕ ПРАВИТЬ ВРУЧНУЮ — перегенерировать при обновлении исходника.
 */
`;

const emit = (v) => JSON.stringify(v, null, 2);

/** Пишет модуль server/config/<file>: набор export const. */
function writeConfigModule(file, what, entries) {
  const ranges = entries
    .map(([, name]) => cfg[name]?.range)
    .filter(Boolean)
    .join("; ");
  let out = GEN_NOTE(what, ranges || "см. описания экспортов");
  for (const [exportName, srcName, extra] of entries) {
    const value = cfg[srcName]?.value ?? extra;
    out += `\n/** ${srcName} [philosynth.html строки ${cfg[srcName]?.range ?? "—"}] */\n`;
    out += `export const ${exportName} = ${emit(value)} as const;\n`;
  }
  writeFileSync(join(CONFIG_DIR, file), out);
  console.log(`✓ server/config/${file}`);
}

writeConfigModule(
  "context-deps.ts",
  "Карты межсекционных зависимостей CONTEXT_DEPS (seed → synthesis_configs).",
  [
    ["CONTEXT_DEPS_BASE", "CONTEXT_DEPS_BASE"],
    ["CONTEXT_DEPS_GENETIC", "CONTEXT_DEPS_GENETIC"],
    ["CONTEXT_DEPS_LEVEL", "CONTEXT_DEPS_LEVEL"],
    ["CONTEXT_DEPS_LEVEL_GENETIC", "CONTEXT_DEPS_LEVEL_GENETIC"],
    ["CONTEXT_DEPS_METHOD", "CONTEXT_DEPS_METHOD"],
  ],
);
writeConfigModule(
  "substitution-map.ts",
  "Карты подстановок контекстных фрагментов (seed → synthesis_configs).",
  [
    ["SUBSTITUTION_MAP", "SUBSTITUTION_MAP"],
    ["SUBSTITUTION_MAP_GENETIC", "SUBSTITUTION_MAP_GENETIC"],
  ],
);
writeConfigModule(
  "compat-matrix.ts",
  "Матрица совместимости уровень:метод (Advisor v2, entry-модель) + метки секций.",
  [
    ["COMPAT_MATRIX_COMPACT", "COMPAT_MATRIX_COMPACT"],
    ["COMPAT_SEC_LABELS", "COMPAT_SEC_LABELS"],
  ],
);
writeConfigModule(
  "intra-deps.ts",
  "Зависимости подразделов внутри раздела (канонические ключи заголовков).",
  [["INTRA_DEPS", "INTRA_DEPS"]],
);
writeConfigModule(
  "subsection-ctx-keys.ts",
  "Карта подраздел → потребляемые ctx-ключи (канонические ключи заголовков).",
  [["SUBSECTION_TO_CTX_KEYS", "SUBSECTION_TO_CTX_KEYS"]],
);
writeConfigModule(
  "topology-roles.ts",
  "Процессуальные роли топологии по методам синтеза.",
  [["TOPOLOGY_ROLES_PROCEDURAL", "TOPOLOGY_ROLES_PROCEDURAL"]],
);
writeConfigModule(
  "fragment-share.ts",
  "Доли контекстного бюджета по фрагментам + базовый бюджет по глубине.",
  [
    ["FRAGMENT_SHARE", "FRAGMENT_SHARE"],
    ["CONTEXT_BUDGET", "CONTEXT_BUDGET"],
  ],
);
writeConfigModule(
  "cardinality-prompts.ts",
  "Кардинальные словари промптов: метод × {multi|single|none}, уровень × {…} (v11, 01-arch §4.14).",
  [
    ["MD_BY_CARD", "MD_BY_CARD"],
    ["SD_BY_CARD", "SD_BY_CARD"],
  ],
);
writeConfigModule(
  "mode-deps.ts",
  "Декларативные зависимости режимов MODE_DEPS (v11, 01-arch §4.15 п.6).",
  [["MODE_DEPS", "MODE_DEPS"]],
);

/* parent-deps.ts — с константами схемы */
{
  const entries = [
    ["PARENT_FIELD_ORDER", "PARENT_FIELD_ORDER"],
    ["PARENT_FIELD_LABELS", "PARENT_FIELD_LABELS"],
    ["PARENT_DEPS_BASE", "PARENT_DEPS_BASE"],
    ["PARENT_DEPS_GENETIC", "PARENT_DEPS_GENETIC"],
    ["PARENT_DEPS_LEVEL", "PARENT_DEPS_LEVEL"],
    ["PARENT_DEPS_LEVEL_GENETIC", "PARENT_DEPS_LEVEL_GENETIC"],
    ["PARENT_DEPS_METHOD", "PARENT_DEPS_METHOD"],
    ["PARENT_INTRA_DEPS", "PARENT_INTRA_DEPS"],
  ];
  const ranges = entries.map(([, n]) => cfg[n].range).join("; ");
  let out = GEN_NOTE(
    "Селективный родительский контекст: словарь полей, 4-слойная карта " +
      "зависимостей, intra-карта (v11, 01-arch §4.13).",
    ranges,
  );
  for (const [exportName, srcName] of entries) {
    out += `\n/** ${srcName} [philosynth.html строки ${cfg[srcName].range}] */\n`;
    out += `export const ${exportName} = ${emit(cfg[srcName].value)} as const;\n`;
  }
  out += `
/** Версионирование схемы родительского контекста [philosynth.html ~10052] */
export const PARENT_CONTEXT_SCHEMA_VERSION = 1 as const;
export const PARENT_CONTEXT_SCHEMA_ID = "selective-v1" as const;
`;
  writeFileSync(join(CONFIG_DIR, "parent-deps.ts"), out);
  console.log("✓ server/config/parent-deps.ts");
}

/* extra-types.ts — данные + порт _buildExtraTypesBlock */
{
  let out = GEN_NOTE(
    "Расширенные типы категорий/связей по методу × уровню (v10) + " +
      "_buildExtraTypesBlock (порт).",
    [
      cfg._EXTRA_CATEGORY_TYPES.range,
      cfg._EXTRA_EDGE_TYPES.range,
      cfg._SYNTH_LEVEL_TYPE_PHRASING.range,
    ].join("; "),
  );
  out += `
/** _EXTRA_CATEGORY_TYPES [philosynth.html строки ${cfg._EXTRA_CATEGORY_TYPES.range}] */
export const EXTRA_CATEGORY_TYPES = ${emit(cfg._EXTRA_CATEGORY_TYPES.value)} as const;

/** _EXTRA_EDGE_TYPES [philosynth.html строки ${cfg._EXTRA_EDGE_TYPES.range}] */
export const EXTRA_EDGE_TYPES = ${emit(cfg._EXTRA_EDGE_TYPES.value)} as const;

/** _SYNTH_LEVEL_TYPE_PHRASING [philosynth.html строки ${cfg._SYNTH_LEVEL_TYPE_PHRASING.range}] */
export const SYNTH_LEVEL_TYPE_PHRASING = ${emit(cfg._SYNTH_LEVEL_TYPE_PHRASING.value)} as const;

/**
 * Порт _buildExtraTypesBlock(method, synthLevel, kind) [philosynth.html ~8977].
 * Генерирует добавку к списку допустимых типов в промпте графа.
 * Дословная логика исходника; типы аргументов сужены до известных ключей,
 * неизвестные значения дают "" (как в исходнике через map[method] || []).
 */
export function buildExtraTypesBlock(
  method: string,
  synthLevel: string,
  kind: "category" | "edge",
): string {
  const map: Record<string, readonly string[]> =
    kind === "category" ? EXTRA_CATEGORY_TYPES : EXTRA_EDGE_TYPES;
  const extra = map[method] || [];
  if (!extra.length) return "";
  const phrasing = (
    SYNTH_LEVEL_TYPE_PHRASING as Record<string, string>
  )[synthLevel];
  if (phrasing === undefined) return "";
  if (synthLevel === "generative") {
    // На порождающем уровне: просто добавляем в список через « / »
    return " / " + extra.join(" / ");
  }
  return "\\n" + phrasing + extra.join(" / ");
}
`;
  writeFileSync(join(CONFIG_DIR, "extra-types.ts"), out);
  console.log("✓ server/config/extra-types.ts");
}

/* prompt-templates.ts */
{
  let out = GEN_NOTE(
    "Начальные промптовые шаблоны Prompt Registry (seed → prompt_templates). " +
      "Плейсхолдеры {{…}} — Mustache-подобная подстановка без логики " +
      "(01-architecture §4.1); p-зависимые словоформы подставляет " +
      "prompt-builder через shared/utils/cardinality.",
    "8590–9310, 10511, 22579–22650",
  );
  out += `
export interface SeedPromptTemplate {
  key: string;
  body: string;
  description: string;
}

export const SEED_PROMPT_TEMPLATES: SeedPromptTemplate[] = ${emit(templates)};
`;
  writeFileSync(join(CONFIG_DIR, "prompt-templates.ts"), out);
  console.log(
    `✓ server/config/prompt-templates.ts (${templates.length} шаблонов)`,
  );
}

/* ══════════════════ 5. QC ══════════════════ */

const keys = templates.map((t) => t.key);
if (new Set(keys).size !== keys.length)
  throw new Error("Дубликаты ключей шаблонов!");
const empty = templates.filter((t) => t.body === "");
console.log(
  `\nИтог: ${templates.length} шаблонов ` +
    `(method: ${keys.filter((k) => k.startsWith("method.")).length}, ` +
    `level: ${keys.filter((k) => k.startsWith("level.")).length}, ` +
    `system*: ${keys.filter((k) => k.startsWith("system")).length}, ` +
    `mode: ${keys.filter((k) => k.startsWith("mode.")).length}, ` +
    `прочие: ${keys.filter((k) => !/^(method|level|system|mode)/.test(k)).length}); ` +
    `пустых тел: ${empty.length} (${empty.map((t) => t.key).join(", ") || "—"})`,
);
const unresolvedDollar = templates.filter((t) => t.body.includes("${"));
if (unresolvedDollar.length)
  throw new Error(
    "Неразрешённые ${…} в шаблонах: " +
      unresolvedDollar.map((t) => t.key).join(", "),
  );
console.log(`Конфигов извлечено: ${CONFIG_NAMES.length}`);
