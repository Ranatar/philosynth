/**
 * Section Defs Builder (беседа 1.2; 01-architecture §4.2, карта 04 §1.9/§2.2).
 *
 * Порт buildSectionDefs [philosynth.html 10742–11515] с ключевым изменением
 * протокола (07, беседа 1.2): ~500 строк захардкоженных промптов заменены
 * чтением из Prompt Registry. Схема ключей:
 *  - каркасы разделов: section.{key}.preamble / .preamble_short / .intro /
 *    .postamble / .postamble_short / .sub.{slug}[.{variant}] /
 *    .sub.{slug}.note / .shared / .bridge
 *    (посеяны в этой беседе; генератор — scripts/extract-section-templates.mjs);
 *  - method-фрагменты: method.{method}.{sum|graph|topology|glossary|theses|
 *    dialogue|critique} (посеяны в 0.3);
 *  - level-фрагменты: level.{level}.{aspect} (посеяны в 0.3).
 * Выбор ВАРИАНТА шаблона (.none / .ext / .genetic / .meta_* / .dialogue /
 * .interlayer) и вычисление плейсхолдеров — здесь: «условия в коде,
 * текст в Registry» (NEXT-CONTEXT 0.3).
 *
 * Также портированы (якоря исходника):
 *  - serializeParts [10623] — сборка parts в строку промпта;
 *  - groupPasses [11588] — группировка defs в проходы (по одному);
 *  - patchPromptsWithSecCtx [11570] — дозапись пользовательского secCtx;
 *  - parseGlossarySubsections [11532] — парсинг level-подразделов глоссария
 *    (адаптация: принимает УЖЕ ОТРЕНДЕРЕННЫЙ текст level.{level}.glossary_sec
 *    вместо чтения LEVEL_GLOSSARY_SEC(p) из замыкания);
 *  - SUBSECTION_SUM_PORTRAIT [9438] — заголовок портретного подраздела по
 *    кардинальности («единая точка истины», v11 01-arch §4.14);
 *  - buildSubsectionMap [9455] — полная карта подразделов; канонические
 *    карты — конфиг subsection_map из Registry (сеется этой беседой,
 *    отложено из 0.3 намеренно);
 *  - SEC_NAMES [9291] — имена разделов для «Структуры документа».
 *
 * Ветвление buildSectionDefs начинается с participantCardinality(p)
 * (v11, 01-arch §4.14): кардинальные словари формулировок (MD_BY_CARD/
 * SD_BY_CARD) подставляются через mdText/sdText (prompt-builder) в
 * {{method_desc}}/{{level_desc}}, кардинальные ветки текстов — вариантами
 * section-шаблонов.
 */

import type { SynthLevel } from "@philosynth/shared/types/synthesis";
import type { SectionDef } from "@philosynth/shared/types/section";
import { ML, SL } from "@philosynth/shared/constants/labels";
import {
  hasConceptParticipants,
  participantCardinality,
} from "@philosynth/shared/utils/cardinality";

import { getConfig, renderTemplate } from "./prompt-registry.js";
import {
  buildExtraTypesBlock,
  conceptNames,
  mdText,
  participantVars,
  philNames,
  type PromptParams,
  sdText,
} from "./prompt-builder.js";

/* ── Типы parts (структура buildSectionDefs) ─────────────────────────── */

/** Подраздел parts: именованный, либо shared/bridge-блок. */
export interface SectionSubsectionPart {
  name?: string | undefined;
  /** "shared" | "bridge" — блоки без собственного data-section */
  type?: "shared" | "bridge" | undefined;
  /** Для type="shared" — имена подразделов, к которым блок относится */
  scope?: string[] | undefined;
  body: string;
  note_after?: string | null | undefined;
}

/** parts раздела (совместимо с EstimateSectionParts cost-estimator'а). */
export interface SectionParts {
  preamble: string;
  preamble_short: string;
  intro: string;
  subsections: SectionSubsectionPart[];
  postamble: string;
  postamble_short: string;
}

/** Полное определение раздела: SectionDef + parts. */
export interface SectionDefFull extends SectionDef {
  parts: SectionParts;
}

/* ── SEC_NAMES [9291] ────────────────────────────────────────────────── */

/** Имена разделов для перечня «Структура документа» (без sum — он в
 *  перечне первой строкой особым текстом). Значения совпадают с
 *  KEY_LABELS shared/constants/section-labels (сверено). */
export const SEC_NAMES: Readonly<Record<string, string>> = {
  graph: "Граф категорий",
  glossary: "Глоссарий терминов",
  theses: "Корпус тезисов",
  history: "Историческая контекстуализация",
  name: "Анализ названия",
  practical: "Практическое применение",
  dialogue: "Диалог между традициями",
  evolution: "Эволюция и перспективы",
  critique: "Критический анализ",
  origin: "Анализ происхождения",
  capsule: "Капсула концепции",
} as const;

/* ── SUBSECTION_SUM_PORTRAIT [9438] и карта подразделов [9455] ───────── */

/**
 * Порт SUBSECTION_SUM_PORTRAIT(p): заголовок портретного подраздела sum
 * по кардинальности и наличию концепций-участников. «Единая точка истины»
 * (авторский JSDoc): используется в buildSectionDefs, buildSubsectionMap,
 * INTRA_DEPS, SUBSECTION_TO_CTX_KEYS.
 */
export function SUBSECTION_SUM_PORTRAIT(p: PromptParams): string {
  const card = participantCardinality(p);
  if (card === "none") return "Портрет зерна концепции";
  if (hasConceptParticipants(p))
    return card === "single"
      ? "Портрет концепции-родителя"
      : "Портрет каждого участника синтеза";
  return card === "single" ? "Портрет философа" : "Портрет каждого философа";
}

/** Форма конфига subsection_map (сеется из server/config/subsection-map.ts). */
export interface SubsectionMapConfig {
  /** SUBSECTION_MAP_BASE — канонические ключи (портрет = «Портрет каждого философа») */
  base: Record<string, string[]>;
  /** SUBSECTION_MAP_GLOSSARY — по synthLevel */
  glossary: Record<string, string[]>;
  /** SUBSECTION_CRITIQUE_NOVELTY — имя пункта 2 критики по synthLevel */
  critiqueNovelty: Record<string, string>;
  /** SUBSECTION_CRITIQUE_CHECK — имя пункта 3 критики по synthLevel */
  critiqueCheck: Record<string, string>;
  /** _SUM_PORTRAIT_VARIANTS — все варианты портретного заголовка */
  sumPortraitVariants: string[];
}

/**
 * Порт buildSubsectionMap(p) [9455]: полная карта секций для данных
 * параметров. Канонические карты — из Registry (конфиг subsection_map);
 * пункты 2–3 критики вставляются после пункта 1, портретный заголовок sum
 * резолвится по кардинальности.
 */
export async function buildSubsectionMap(
  p: PromptParams,
): Promise<Record<string, string[]>> {
  const level = p?.synthLevel || "comparative";
  const cfg = await getConfig<SubsectionMapConfig>("subsection_map");

  const critiqueBase = cfg.base.critique;
  if (!critiqueBase || critiqueBase.length === 0)
    throw new Error("subsection_map: base.critique пуст или отсутствует");
  const critique = [
    critiqueBase[0] as string, // Внутренняя когерентность
    cfg.critiqueNovelty[level] || "Оценка новизны", // пункт 2
    cfg.critiqueCheck[level] || "Верность источникам", // пункт 3
    ...critiqueBase.slice(1), // Верность методу синтеза, Сохранение…, и т.д.
  ];

  const sumBase = cfg.base.sum ?? [];
  const portraitTitle = SUBSECTION_SUM_PORTRAIT(p);
  const sum = sumBase.map((name) =>
    name === "Портрет каждого философа" ? portraitTitle : name,
  );

  return {
    ...cfg.base,
    sum,
    glossary: cfg.glossary[level] || cfg.glossary.comparative || [],
    critique,
  };
}

/* ── serializeParts [10623] ──────────────────────────────────────────── */

/** Порт serializeParts: собирает parts в единую строку промпта. */
export function serializeParts(
  parts: SectionParts | null | undefined,
): string {
  if (!parts) return "";
  const blocks: string[] = [];
  for (const item of parts.subsections) {
    if (item.type === "shared" || item.type === "bridge") {
      blocks.push(item.body);
    } else {
      let block = `«${item.name}»\n${item.body}`;
      if (item.note_after) block += "\n\n" + item.note_after;
      blocks.push(block);
    }
  }
  return [parts.preamble, parts.intro, blocks.join("\n\n"), parts.postamble]
    .filter(Boolean)
    .join("\n\n");
}

/* ── parseGlossarySubsections [11532] ────────────────────────────────── */

/**
 * Порт parseGlossarySubsections. Адаптация: в исходнике —
 * (level, p) => парсинг LEVEL_GLOSSARY_SEC(p)[level]; здесь текст
 * подаётся аргументом — отрендеренный шаблон level.{level}.glossary_sec.
 */
export function parseGlossarySubsections(
  raw: string | undefined,
): SectionSubsectionPart[] {
  if (!raw) return [];

  const result: SectionSubsectionPart[] = [];
  const blocks = raw.split(/\n\n+/);
  let currentName: string | null = null;
  let currentBody: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    // FIX исходника: проверяется только первая строка, а не весь блок
    const firstLine = (trimmed.split("\n")[0] ?? "").trim();
    const nameMatch = firstLine.match(/^«(.+?)»$/);
    if (nameMatch) {
      if (currentName) {
        result.push({
          name: currentName,
          body: currentBody.join("\n\n"),
          note_after: null,
        });
      }
      currentName = nameMatch[1] as string;
      const bodyLines = trimmed.split("\n").slice(1).join("\n").trim();
      currentBody = bodyLines ? [bodyLines] : [];
    } else if (currentName) {
      currentBody.push(trimmed);
    }
  }
  if (currentName) {
    result.push({
      name: currentName,
      body: currentBody.join("\n\n"),
      note_after: null,
    });
  }

  return result;
}

/* ── buildSectionDefs [10742] ────────────────────────────────────────── */

/**
 * Порт buildSectionDefs(p): определения разделов с промптами. Каждый
 * текст — из Registry; логика ветвления и порядок разделов — 1:1 с
 * исходником (sum всегда первый; далее graph, glossary, theses, name,
 * history, origin, practical, dialogue, evolution, critique, capsule —
 * по p.sec).
 */
export async function buildSectionDefs(
  p: PromptParams,
): Promise<SectionDefFull[]> {
  const d: SectionDefFull[] = [];
  let n = 1;

  const card = participantCardinality(p);
  const meta = hasConceptParticipants(p);
  const none = card === "none";
  const level: SynthLevel = p.synthLevel || "comparative";
  const genetic = p.generationOrder === "genetic";
  const ext = !!p.extGraphMetrics;
  const hasSec = (k: string): boolean => p.sec.includes(k);

  // Переменные подстановки, общие для всех шаблонов этого вызова.
  // philosophers: в мета-шаблонах портрета — по philNames (participants),
  // в остальных — по p.phil (как в соответствующих ветках исходника);
  // семантика совпадает: вне мета-синтеза philNames(p) === p.phil.
  const philosophers = meta
    ? philNames(p).join(", ") || "—"
    : (p.phil ?? []).join(", ");
  const vars: Record<string, string | number> = {
    ...participantVars(p),
    method_label: ML[p.method],
    level_label: SL[level],
    method_desc: await mdText(p, p.method),
    level_desc: await sdText(p, level),
    philosophers,
    philosopher: (p.phil ?? [])[0] || "—",
    concepts: conceptNames(p).join(", "),
  };
  const r = (
    key: string,
    extra?: Record<string, string | number>,
  ): Promise<string> =>
    renderTemplate(key, extra ? { ...vars, ...extra } : vars);
  /** method-фрагмент раздела (0.3): method.{method}.{aspect} */
  const rm = (aspect: string): Promise<string> =>
    r(`method.${p.method}.${aspect}`);
  /** level-фрагмент раздела (0.3): level.{level}.{aspect} */
  const rl = (aspect: string): Promise<string> => r(`level.${level}.${aspect}`);

  // ═══════════════════════════════════════
  // SUM — всегда первый
  // ═══════════════════════════════════════
  {
    const methodSum = await rm("sum");
    const portraitVariant = meta
      ? card === "single"
        ? "meta_single"
        : "meta_multi"
      : none
        ? "none"
        : card === "single"
          ? "single"
          : "multi";
    const secNames = [
      "Исполнительное резюме (данный раздел)",
      ...p.sec.map((k) => SEC_NAMES[k] || k),
    ];
    const sectionList = secNames
      .map((nm, i) => i + 1 + ". " + nm)
      .join("\n");
    const tensionsKey = none
      ? hasSec("dialogue")
        ? "section.sum.sub.tensions.none_dialogue"
        : "section.sum.sub.tensions.none"
      : hasSec("dialogue")
        ? "section.sum.sub.tensions.dialogue"
        : "section.sum.sub.tensions";

    const sumParts: SectionParts = {
      preamble: await r("section.sum.preamble"),
      preamble_short: await r("section.sum.preamble_short"),
      intro: await r("section.sum.intro"),
      subsections: [
        {
          name: "Цели и метод",
          body: await r(
            none ? "section.sum.sub.goals.none" : "section.sum.sub.goals",
            { method_sum: methodSum || "" },
          ),
          note_after: null,
        },
        {
          name: SUBSECTION_SUM_PORTRAIT(p),
          body: await r(`section.sum.sub.portrait.${portraitVariant}`, {
            sum_portrait_extra: (await rl("sum_portraits")) || "",
          }),
          note_after: null,
        },
        {
          name: "Новизна и ценность",
          body: await r(
            none ? "section.sum.sub.novelty.none" : "section.sum.sub.novelty",
          ),
          note_after: null,
        },
        {
          name: "Структура документа",
          body: await r(
            genetic
              ? "section.sum.sub.structure.genetic"
              : "section.sum.sub.structure",
            { section_list: sectionList },
          ),
          note_after: null,
        },
        {
          name: "Индекс когерентности",
          body: await r(
            none
              ? "section.sum.sub.coherence.none"
              : "section.sum.sub.coherence",
          ),
          note_after: null,
        },
        {
          name: "Точки напряжения",
          body: await r(tensionsKey),
          note_after: null,
        },
        {
          name: "Оценка сложности",
          body: await r("section.sum.sub.complexity"),
          note_after: await r("section.sum.sub.complexity.note"),
        },
      ],
      postamble: await r("section.sum.postamble"),
      postamble_short: await r("section.sum.postamble_short"),
    };
    d.push({
      key: "sum",
      num: n++,
      title: "Исполнительное Резюме Синтеза",
      parts: sumParts,
      prompt: serializeParts(sumParts),
    });
  }

  // ═══════════════════════════════════════
  // GRAPH
  // ═══════════════════════════════════════
  if (hasSec("graph")) {
    const methodGraph = await rm("graph");
    const graphVars = {
      graph_methodology: await rl(
        genetic ? "graph_methodology_genetic" : "graph_methodology",
      ),
      method_graph_block: methodGraph ? methodGraph + "\n\n" : "",
      graph_last_col_name: await rl("graph_last_col_name"),
      graph_last_col_spec: await rl("graph_last_col_spec"),
      extra_category_types: await buildExtraTypesBlock(
        p.method,
        level,
        "category",
      ),
      extra_edge_types: await buildExtraTypesBlock(p.method, level, "edge"),
      method_topology: await rm("topology"),
      topology_roles:
        (await getConfig<Record<string, string>>("topology_roles"))[
          p.method
        ] ?? "",
      topology_note: (await rl("topology_note")) || "",
    };
    const graphParts: SectionParts = {
      preamble: await r("section.graph.preamble"),
      preamble_short: await r("section.graph.preamble_short"),
      intro: await r("section.graph.intro"),
      subsections: [
        {
          name: "Методология построения графа",
          body: await r("section.graph.sub.methodology", graphVars),
          note_after: null,
        },
        {
          name: "Таблица категорий",
          body: await r(
            ext
              ? "section.graph.sub.categories.ext"
              : "section.graph.sub.categories",
            graphVars,
          ),
          note_after: null,
        },
        {
          name: "Таблица связей",
          body: await r(
            ext ? "section.graph.sub.edges.ext" : "section.graph.sub.edges",
            graphVars,
          ),
          note_after: null,
        },
        {
          name: "Топология графа",
          body: await r("section.graph.sub.topology", graphVars),
          note_after: null,
        },
        {
          name: "Топологическая таблица",
          body: await r("section.graph.sub.topology_table", graphVars),
          note_after: await r("section.graph.sub.topology_table.note"),
        },
      ],
      postamble: await r("section.graph.postamble"),
      postamble_short: await r("section.graph.postamble_short"),
    };
    d.push({
      key: "graph",
      num: n++,
      title: "Граф Категорий Концепции",
      parts: graphParts,
      prompt: serializeParts(graphParts),
    });
  }

  // ═══════════════════════════════════════
  // GLOSSARY
  // ═══════════════════════════════════════
  if (hasSec("glossary")) {
    const methodGlossary = await rm("glossary");
    const glossaryParts: SectionParts = {
      preamble: await r("section.glossary.preamble"),
      preamble_short: await r("section.glossary.preamble_short"),
      intro: await r("section.glossary.intro"),
      subsections: [
        {
          name: "Таблица определений",
          body: await r("section.glossary.sub.table", {
            glossary_col: await rl("glossary_col"),
            method_glossary_block: methodGlossary
              ? "\n" + methodGlossary
              : "",
          }),
          note_after: await r("section.glossary.sub.table.note"),
        },
        ...parseGlossarySubsections(await rl("glossary_sec")),
      ],
      postamble: await r("section.glossary.postamble"),
      postamble_short: await r("section.glossary.postamble_short"),
    };
    d.push({
      key: "glossary",
      num: n++,
      title: "Глоссарий Категорий И Определений",
      parts: glossaryParts,
      prompt: serializeParts(glossaryParts),
    });
  }

  // ═══════════════════════════════════════
  // THESES — со shared-блоком
  // ═══════════════════════════════════════
  if (hasSec("theses")) {
    const methodTheses = await rm("theses");
    const thesesParts: SectionParts = {
      preamble: await r("section.theses.preamble"),
      preamble_short: await r("section.theses.preamble_short"),
      intro: await r("section.theses.intro"),
      subsections: [
        {
          type: "shared",
          body: await r("section.theses.shared", {
            theses_contrib: await rl("theses_contrib"),
            method_theses: methodTheses || "",
            theses_novelty: await rl("theses_novelty"),
          }),
          scope: [
            "Онтологические тезисы",
            "Эпистемологические тезисы",
            "Этические и аксиологические тезисы",
          ],
        },
        {
          name: "Онтологические тезисы",
          body: await r("section.theses.sub.ontological"),
          note_after: null,
        },
        {
          name: "Эпистемологические тезисы",
          body: await r("section.theses.sub.epistemological"),
          note_after: null,
        },
        {
          name: "Этические и аксиологические тезисы",
          body: await r("section.theses.sub.ethical"),
          note_after: null,
        },
        {
          name: "Сводная таблица тезисов",
          body: await r("section.theses.sub.table"),
          note_after: null,
        },
      ],
      postamble: await r("section.theses.postamble"),
      postamble_short: await r("section.theses.postamble_short"),
    };
    d.push({
      key: "theses",
      num: n++,
      title: "Корпус Тезисов",
      parts: thesesParts,
      prompt: serializeParts(thesesParts),
    });
  }

  // ═══════════════════════════════════════
  // NAME
  // ═══════════════════════════════════════
  if (hasSec("name")) {
    const nameParts: SectionParts = {
      preamble: await r("section.name.preamble"),
      preamble_short: await r("section.name.preamble_short"),
      intro: await r("section.name.intro"),
      subsections: [
        {
          name: "Таблица вариантов названия",
          body: await r("section.name.sub.variants"),
          note_after: null,
        },
        {
          name: "Сравнительный анализ вариантов",
          body: await r("section.name.sub.comparison"),
          note_after: null,
        },
        {
          name: "Итоговая рекомендация",
          body: await r("section.name.sub.recommendation"),
          note_after: null,
        },
      ],
      postamble: await r("section.name.postamble"),
      postamble_short: await r("section.name.postamble_short"),
    };
    d.push({
      key: "name",
      num: n++,
      title: "Название Концепции и Его Анализ",
      parts: nameParts,
      prompt: serializeParts(nameParts),
    });
  }

  // ═══════════════════════════════════════
  // HISTORY
  // ═══════════════════════════════════════
  if (hasSec("history")) {
    const historyParts: SectionParts = {
      preamble: await r("section.history.preamble"),
      preamble_short: await r("section.history.preamble_short"),
      intro: await r("section.history.intro"),
      subsections: [
        {
          name: "Исторический контекст",
          body: await r("section.history.sub.context"),
          note_after: null,
        },
        {
          name: "Источники влияния",
          body: await r("section.history.sub.influence"),
          note_after: null,
        },
        {
          name: "Генеалогия идей",
          body: await r(
            ext
              ? "section.history.sub.genealogy.ext"
              : "section.history.sub.genealogy",
          ),
          note_after: null,
        },
        {
          name: "Современные концепции",
          body: await r("section.history.sub.modern"),
          note_after: null,
        },
        {
          name: "Потенциальное влияние",
          body: await r("section.history.sub.impact"),
          note_after: null,
        },
        {
          name: "Название в историческом контексте",
          body: await r("section.history.sub.title_in_history"),
          note_after: null,
        },
      ],
      postamble: await r("section.history.postamble"),
      postamble_short: await r("section.history.postamble_short"),
    };
    d.push({
      key: "history",
      num: n++,
      title: "Историческая Контекстуализация",
      parts: historyParts,
      prompt: serializeParts(historyParts),
    });
  }

  // ═══════════════════════════════════════
  // ORIGIN
  // ═══════════════════════════════════════
  if (hasSec("origin")) {
    const objectionsKey = meta
      ? "section.origin.sub.objections.meta"
      : none
        ? "section.origin.sub.objections.none"
        : "section.origin.sub.objections";
    const originParts: SectionParts = {
      preamble: await r("section.origin.preamble"),
      preamble_short: await r("section.origin.preamble_short"),
      intro: await r("section.origin.intro"),
      subsections: [
        {
          name: "Идентификация родительских традиций",
          body: await r("section.origin.sub.parent_traditions"),
          note_after: null,
        },
        {
          name: "Элементная декомпозиция",
          body: await r(
            ext
              ? "section.origin.sub.decomposition.ext"
              : "section.origin.sub.decomposition",
          ),
          note_after: null,
        },
        {
          name: "Оценка оригинальности",
          body: await r(
            ext
              ? "section.origin.sub.originality.ext"
              : "section.origin.sub.originality",
          ),
          note_after: null,
        },
        {
          name: "Потенциальные возражения",
          body: await r(objectionsKey),
          note_after: null,
        },
      ],
      postamble: await r("section.origin.postamble"),
      postamble_short: await r("section.origin.postamble_short"),
    };
    d.push({
      key: "origin",
      num: n++,
      title: "Анализ Происхождения",
      parts: originParts,
      prompt: serializeParts(originParts),
    });
  }

  // ═══════════════════════════════════════
  // PRACTICAL — со shared-блоком
  // ═══════════════════════════════════════
  if (hasSec("practical")) {
    const practicalParts: SectionParts = {
      preamble: await r("section.practical.preamble"),
      preamble_short: await r("section.practical.preamble_short"),
      intro: await r("section.practical.intro"),
      subsections: [
        {
          type: "shared",
          body: await r("section.practical.shared"),
          scope: [
            "Образование",
            "Этика и принятие решений",
            "Психология и личностное развитие",
            "Социальные институты",
            "Межкультурный диалог",
          ],
        },
        {
          name: "Образование",
          body: await r("section.practical.sub.education"),
          note_after: null,
        },
        {
          name: "Этика и принятие решений",
          body: await r("section.practical.sub.ethics"),
          note_after: null,
        },
        {
          name: "Психология и личностное развитие",
          body: await r("section.practical.sub.psychology"),
          note_after: null,
        },
        {
          name: "Социальные институты",
          body: await r("section.practical.sub.social"),
          note_after: null,
        },
        {
          name: "Межкультурный диалог",
          body: await r("section.practical.sub.intercultural"),
          note_after: null,
        },
        {
          name: "Сводная таблица",
          body: await r(
            ext
              ? "section.practical.sub.table.ext"
              : "section.practical.sub.table",
          ),
          note_after: null,
        },
      ],
      postamble: await r("section.practical.postamble"),
      postamble_short: await r("section.practical.postamble_short"),
    };
    d.push({
      key: "practical",
      num: n++,
      title: "Практическое Применение",
      parts: practicalParts,
      prompt: serializeParts(practicalParts),
    });
  }

  // ═══════════════════════════════════════
  // DIALOGUE — с bridge-блоком
  // ═══════════════════════════════════════
  if (hasSec("dialogue")) {
    const dialogueVars = {
      method_dialogue: (await rm("dialogue")) || "",
      dialogue_struct: await rl(
        genetic ? "dialogue_struct_genetic" : "dialogue_struct",
      ),
      dialogue_table: await rl(
        genetic ? "dialogue_table_genetic" : "dialogue_table",
      ),
      dialogue_comment: await rl(
        genetic ? "dialogue_comment_genetic" : "dialogue_comment",
      ),
    };
    const dialogueParts: SectionParts = {
      preamble: await r(
        none ? "section.dialogue.preamble.none" : "section.dialogue.preamble",
      ),
      preamble_short: await r(
        none
          ? "section.dialogue.preamble_short.none"
          : "section.dialogue.preamble_short",
      ),
      intro: await r("section.dialogue.intro"),
      subsections: [
        {
          name: "Межфилософский диалог",
          body: await r("section.dialogue.sub.dialogue", dialogueVars),
          note_after: null,
        },
        {
          type: "bridge",
          body: await r("section.dialogue.bridge"),
        },
        {
          name: "Итоговая таблица диалога",
          body: await r("section.dialogue.sub.table", dialogueVars),
          note_after: null,
        },
        {
          name: "Аналитический комментарий",
          body: await r(
            genetic
              ? "section.dialogue.sub.comment.genetic"
              : "section.dialogue.sub.comment",
            dialogueVars,
          ),
          note_after: null,
        },
      ],
      postamble: await r("section.dialogue.postamble"),
      postamble_short: await r("section.dialogue.postamble_short"),
    };
    d.push({
      key: "dialogue",
      num: n++,
      title: "Диалог Между Традициями",
      parts: dialogueParts,
      prompt: serializeParts(dialogueParts),
    });
  }

  // ═══════════════════════════════════════
  // EVOLUTION
  // ═══════════════════════════════════════
  if (hasSec("evolution")) {
    const evolutionParts: SectionParts = {
      preamble: await r("section.evolution.preamble"),
      preamble_short: await r("section.evolution.preamble_short"),
      intro: await r("section.evolution.intro"),
      subsections: [
        {
          name: "Направления развития",
          body: await r(
            ext
              ? "section.evolution.sub.directions.ext"
              : "section.evolution.sub.directions",
          ),
          note_after: null,
        },
        {
          name: "Предлагаемые изменения графа",
          body: await r("section.evolution.sub.graph_changes"),
          note_after: null,
        },
        {
          name: "Эволюция названия",
          body: await r("section.evolution.sub.title_evolution"),
          note_after: null,
        },
        {
          name: "Интеграция с современной наукой",
          body: await r("section.evolution.sub.science"),
          note_after: null,
        },
        {
          name: "Временная карта развития",
          body: await r("section.evolution.sub.timeline"),
          note_after: null,
        },
      ],
      postamble: await r("section.evolution.postamble"),
      postamble_short: await r("section.evolution.postamble_short"),
    };
    d.push({
      key: "evolution",
      num: n++,
      title: "Эволюция и Перспективы",
      parts: evolutionParts,
      prompt: serializeParts(evolutionParts),
    });
  }

  // ═══════════════════════════════════════
  // CRITIQUE — динамические подразделы по synthLevel
  // ═══════════════════════════════════════
  if (hasSec("critique")) {
    const subCfg = await getConfig<SubsectionMapConfig>("subsection_map");
    const hasDialogue = hasSec("dialogue");
    const hasFormal =
      hasSec("graph") || hasSec("glossary") || hasSec("theses");
    const interlayer = hasDialogue && hasFormal;

    const critiqueSubsections: SectionSubsectionPart[] = [
      {
        name: "Внутренняя когерентность",
        body: await r("section.critique.sub.coherence"),
        note_after: null,
      },
      // ── Адаптивная секция: только если есть и диалог, и формальные разделы
      ...(interlayer
        ? [
            {
              name: "Межслойная согласованность",
              body: await r("section.critique.sub.interlayer"),
              note_after: null,
            } satisfies SectionSubsectionPart,
          ]
        : []),
      {
        name: subCfg.critiqueNovelty[level] || "Оценка новизны",
        body: await r("section.critique.sub.novelty", {
          critique_novelty: await rl("critique_novelty"),
        }),
        note_after: null,
      },
      {
        name: subCfg.critiqueCheck[level] || "Верность источникам",
        body: await r(
          hasDialogue
            ? "section.critique.sub.check.dialogue"
            : "section.critique.sub.check",
          { critique_check: await rl("critique_check") },
        ),
        note_after: null,
      },
      {
        name: "Верность методу синтеза",
        body: await r("section.critique.sub.method", {
          method_critique: (await rm("critique")) || "",
        }),
        note_after: null,
      },
      {
        name: "Сохранение ценных аспектов",
        body: await r("section.critique.sub.preservation"),
        note_after: null,
      },
      {
        name: "Разрешение противоречий",
        body: await r("section.critique.sub.resolution"),
        note_after: null,
      },
      {
        name: "Слепые пятна",
        body: await r("section.critique.sub.blindspots"),
        note_after: null,
      },
      {
        name: "Итоговая оценка",
        body: await r(
          interlayer
            ? "section.critique.sub.final.interlayer"
            : "section.critique.sub.final",
        ),
        note_after: null,
      },
      {
        name: "Рекомендации по улучшению",
        body: await r("section.critique.sub.recommendations"),
        note_after: null,
      },
    ];

    const critiqueParts: SectionParts = {
      preamble: await r("section.critique.preamble"),
      preamble_short: await r("section.critique.preamble_short"),
      intro: await r("section.critique.intro"),
      subsections: critiqueSubsections,
      postamble: await r("section.critique.postamble"),
      postamble_short: await r("section.critique.postamble_short"),
    };
    d.push({
      key: "critique",
      num: n++,
      title: "Критический Анализ",
      parts: critiqueParts,
      prompt: serializeParts(critiqueParts),
    });
  }

  // ═══════════════════════════════════════
  // CAPSULE
  // ═══════════════════════════════════════
  if (hasSec("capsule")) {
    const capsuleParts: SectionParts = {
      preamble: await r("section.capsule.preamble"),
      preamble_short: await r("section.capsule.preamble_short"),
      intro: await r("section.capsule.intro"),
      subsections: [
        {
          name: "Капсула",
          body: await r("section.capsule.sub.capsule"),
          note_after: null,
        },
      ],
      postamble: await r("section.capsule.postamble"),
      postamble_short: await r("section.capsule.postamble_short"),
    };
    d.push({
      key: "capsule",
      num: n++,
      title: "Капсула Концепции",
      parts: capsuleParts,
      prompt: serializeParts(capsuleParts),
    });
  }

  return d;
}

/* ── patchPromptsWithSecCtx [11570] ──────────────────────────────────── */

/**
 * Порт patchPromptsWithSecCtx(defs, secCtx): дописывает пользовательский
 * доп. контекст в промпты разделов (мутация def.prompt). Вставка — перед
 * последним «\n\nМ» (постамбула «Мин./Минимум … слов»), иначе — в конец.
 */
export function patchPromptsWithSecCtx(
  defs: SectionDef[],
  secCtx?: Record<string, string> | null,
): void {
  if (!secCtx) return;
  for (const def of defs) {
    const extra = secCtx[def.key];
    if (!extra) continue;
    const marker = def.prompt.lastIndexOf("\n\nМ");
    if (marker !== -1) {
      def.prompt =
        def.prompt.slice(0, marker) +
        `\n\nДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ К ЭТОМУ РАЗДЕЛУ (от пользователя):\n${extra}` +
        def.prompt.slice(marker);
    } else {
      def.prompt += `\n\nДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ К ЭТОМУ РАЗДЕЛУ (от пользователя):\n${extra}`;
    }
  }
}

/* ── groupPasses [11588] ─────────────────────────────────────────────── */

/** Порт groupPasses(d): проходы генерации — по одному разделу на проход. */
export function groupPasses<T>(d: T[]): T[][] {
  const passes: T[][] = [];
  for (let i = 0; i < d.length; i += 1) passes.push(d.slice(i, i + 1));
  return passes;
}
