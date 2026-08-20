/**
 * Meta-Synthesis Service (беседа 3.1; 01-architecture §5.2/§4.13,
 * 03-specification §1.6, карта 04 §1.10/§2.6).
 *
 * Портированные функции исходника (якоря philosynth.html):
 *  - importConceptAsParticipant [22009] → loadConceptContext: наполнение
 *    полей концепции-участника — ИЗ БД (createDbContextSource +
 *    extractContextFragment по тем же 10 ключам, что файловый порт 1.5b:
 *    capsule:full, sum:goals/portraits/tensions, graph:nodes_top (top-7),
 *    graph:edges, dialogue:new_concepts/synthesis, glossary:table,
 *    theses:summary);
 *  - проверка обязательных разделов [22032–22057] →
 *    validateConceptForMetaSynthesis (confirm-диалог мягких предупреждений
 *    исходника → массив warnings: клиент 3.2 решает сам);
 *  - checkGenealogyOverlaps [22467] — тексты предупреждений 1:1;
 *    предки — из synthesis_lineage (рекурсивный CTE), а не из объекта
 *    genealogy концепт-файла;
 *  - collectPhilosopherAncestors [22451] — АДАПТАЦИЯ: в исходнике обходит
 *    УЗЕЛ генеалогии рекурсией по объекту; здесь принимает synthesisId и
 *    считает рекурсивным CTE по 02-data-model §2.4 (глубина ≤ 10);
 *  - conceptContextBlockFull [10232] — legacy-монолит, порт 1:1
 *    (КВИРК ИСХОДНИКА СОХРАНЁН: перечень полей монолита НЕ включает
 *    portraits и graphEdges — короче PARENT_FIELD_ORDER);
 *  - conceptContextBlockSelective [10259] — селективный блок; spec — через
 *    resolveParentDeps/resolveParentDepsForSubsection (parent-context,
 *    беседа 1.3), карты полей — из Registry.
 *
 * Новое (нет прародителя в исходнике):
 *  - isAncestor — рекурсивная проверка предка через lineage CTE;
 *  - loadConceptParticipants — участники-концепции синтеза из
 *    synthesis_lineage (parent_type='synthesis') с наполнением полей;
 *  - buildMetaParentContext — реализация ParentContextProvider
 *    (разъём setParentContextProvider, стаб беседы 1.4 заменяется в
 *    generation-service): monolithic-схема → Full, иначе Selective
 *    (+ intra-spec подраздела), паритет baseCtxParents [10371] и
 *    ТЗ 4.13 п.10.2 (legacy до миграции — монолит).
 *
 * Рассогласования доков, найденные при порте (в патч на завершение):
 *  - 07 (запрос 1) перечисляет 8 полей loadConceptContext — исходник
 *    извлекает 10 (нет dialogueSynthesis и portraits, оба входят в
 *    PARENT_FIELD_ORDER и в PARENT_DEPS_LEVEL) — порт по исходнику;
 *  - 07 называет «buildConceptContextBlock» — функции с таким именем в
 *    исходнике нет (conceptContextBlockFull/Selective);
 *  - спека фрагмента кладёт генеалогические функции в lineage-service.ts,
 *    07 — сюда; следуем 07 (lineage-service — только CTE-навигация).
 *
 * Циклы ESM: этот модуль НЕ импортирует generation-service (тот импортирует
 *  нас — регистрация провайдера); только db / context-extractor /
 *  parent-context / shared.
 */

import { and, eq } from "drizzle-orm";

import { db, sql } from "../db/index.js";
import { sections, syntheses, synthesisLineage } from "../db/schema.js";
import { ML, SL } from "@philosynth/shared/constants/labels";
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";

import {
  createDbContextSource,
  extractContextFragment,
} from "./context-extractor.js";
import {
  getParentFieldLabels,
  getParentFieldOrder,
  isConceptParticipant,
  normalizeSectionKey,
  parentFieldValue,
  resolveParentDeps,
  resolveParentDepsForSubsection,
  type ConceptParticipant,
  type ParentDepsParams,
} from "./parent-context.js";
import type { SectionDeps } from "../utils/deep-merge.js";

/* ══ Ошибки ═══════════════════════════════════════════════════════════ */

/** Коды — подмножество 03 §4.3 (NOT_FOUND / FORBIDDEN / VALIDATION_ERROR). */
export class MetaSynthesisError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MetaSynthesisError";
    this.code = code;
  }
}

/* ══ Типы ═════════════════════════════════════════════════════════════ */

/**
 * Концепция-участник с наполненными полями — серверный аналог результата
 * importConceptAsParticipant [22160–22175]. type='synthesis' (форма API;
 * isConceptParticipant принимает и его, и 'concept' исходника).
 */
export interface ConceptParticipantFull extends ConceptParticipant {
  type: "synthesis";
  synthesisId: string;
  name: string;
  method: string;
  synthLevel: string;
  seed: string;
  capsule: string;
  goals: string;
  portraits: string;
  tensions: string;
  graphNodes: string;
  graphEdges: string;
  dialogueConcepts: string;
  dialogueSynthesis: string;
  glossaryCompact: string;
  thesesSummary: string;
}

/** Результат validateConceptForMetaSynthesis (07, запрос 1). */
export interface ConceptValidation {
  valid: boolean;
  /** Ключи недостающих разделов; составное требование — строкой
   *  «graph или dialogue» (как в missing исходника [22036]) */
  missing: string[];
  /** Мягкие предупреждения [22052]: «нет графа категорий», «нет диалога» */
  warnings: string[];
}

/** Предупреждение генеалогических пересечений (checkGenealogyOverlaps). */
export interface GenealogyWarning {
  level: "info" | "warn";
  text: string;
}

/** Участник для checkGenealogyOverlaps: философ по имени либо концепция
 *  по id (предки читаются из lineage; name — для текста предупреждения). */
export type OverlapParticipant =
  | { type: "philosopher"; name: string }
  | { type: "synthesis"; synthesisId: string; name?: string | undefined };

/* ══ loadConceptContext — importConceptAsParticipant из БД ════════════ */

/** Ключи extractContextFragment по полям участника — 1:1 с [22120–22141]
 *  (graph:nodes_top = top-7 по центральности [8232], как на клиенте 1.5b). */
const FIELD_TO_CTX_KEY: ReadonlyArray<
  readonly [keyof ConceptParticipantFull & string, string]
> = [
  ["capsule", "capsule:full"],
  ["goals", "sum:goals"],
  ["portraits", "sum:portraits"],
  ["tensions", "sum:tensions"],
  ["graphNodes", "graph:nodes_top"],
  ["graphEdges", "graph:edges"],
  ["dialogueConcepts", "dialogue:new_concepts"],
  ["dialogueSynthesis", "dialogue:synthesis"],
  ["glossaryCompact", "glossary:table"],
  ["thesesSummary", "theses:summary"],
];

/**
 * Загрузка концепции-участника из БД — серверный аналог
 * importConceptAsParticipant [22009] (файловый сценарий портирован 1.5b в
 * client/utils/concept-file.ts; здесь источник — гранулярные таблицы и
 * html_content через ContextSource, а не DOM файла).
 *
 * Пригодность НЕ проверяет (валидация — validateConceptForMetaSynthesis,
 * вызывается роутом ДО генерации); отсутствующие фрагменты дают "".
 */
export async function loadConceptContext(
  synthesisId: string,
): Promise<ConceptParticipantFull> {
  const [row] = await db
    .select({
      id: syntheses.id,
      title: syntheses.title,
      method: syntheses.method,
      synthLevel: syntheses.synthLevel,
      seed: syntheses.seed,
    })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  if (!row) {
    throw new MetaSynthesisError(
      "NOT_FOUND",
      `Концепция-участник ${synthesisId} не найдена`,
    );
  }

  const src = createDbContextSource(synthesisId);
  const participant: ConceptParticipantFull = {
    type: "synthesis",
    synthesisId,
    name: row.title,
    method: row.method,
    synthLevel: row.synthLevel,
    seed: row.seed ?? "",
    capsule: "",
    goals: "",
    portraits: "",
    tensions: "",
    graphNodes: "",
    graphEdges: "",
    dialogueConcepts: "",
    dialogueSynthesis: "",
    glossaryCompact: "",
    thesesSummary: "",
  };
  for (const [field, ctxKey] of FIELD_TO_CTX_KEY) {
    // Сбой одного фрагмента не должен ронять весь мета-синтез: поле
    // остаётся пустым (missingRequired поймает buildParentSpecForLog).
    try {
      participant[field] = (await extractContextFragment(ctxKey, src)) ?? "";
    } catch (err) {
      console.warn(
        `[meta-synthesis] loadConceptContext(${synthesisId}): ${ctxKey}:`,
        err,
      );
      participant[field] = "";
    }
  }
  return participant;
}

/* ══ Участники-концепции синтеза (из lineage) ═════════════════════════ */

/**
 * Концепции-родители синтеза: строки synthesis_lineage
 * parent_type='synthesis' (в порядке position) с наполнением полей.
 * Потребитель — generation-service (buildParams / провайдер / genCommon).
 * Родитель, удалённый из БД (SET NULL), молча пропускается.
 */
export async function loadConceptParticipants(
  synthesisId: string,
): Promise<ConceptParticipantFull[]> {
  const rows = await db
    .select({
      parentSynthesisId: synthesisLineage.parentSynthesisId,
    })
    .from(synthesisLineage)
    .where(
      and(
        eq(synthesisLineage.synthesisId, synthesisId),
        eq(synthesisLineage.parentType, "synthesis"),
      ),
    )
    .orderBy(synthesisLineage.position);

  const out: ConceptParticipantFull[] = [];
  for (const r of rows) {
    if (!r.parentSynthesisId) continue; // родитель удалён (ON DELETE SET NULL)
    out.push(await loadConceptContext(r.parentSynthesisId));
  }
  return out;
}

/* ══ validateConceptForMetaSynthesis ══════════════════════════════════ */

/**
 * Проверка пригодности концепции как участника — порт проверки разделов
 * importConceptAsParticipant [22032–22057]: обязательны sum, glossary,
 * theses, critique, (graph ИЛИ dialogue), capsule. Мягкие предупреждения
 * (нет графа / нет диалога) не блокируют — confirm исходника заменён
 * массивом warnings (решает клиент, беседа 3.2).
 */
export async function validateConceptForMetaSynthesis(
  synthesisId: string,
): Promise<ConceptValidation> {
  const [row] = await db
    .select({ id: syntheses.id, capsuleHtml: syntheses.capsuleHtml })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  if (!row) {
    throw new MetaSynthesisError(
      "NOT_FOUND",
      `Концепция-участник ${synthesisId} не найдена`,
    );
  }

  const secRows = await db
    .select({ key: sections.key })
    .from(sections)
    .where(eq(sections.synthesisId, synthesisId));
  const sectionKeys = new Set(secRows.map((s) => s.key));

  const required = ["sum", "glossary", "theses", "critique"];
  const missing = required.filter((k) => !sectionKeys.has(k));

  const hasGraph = sectionKeys.has("graph");
  const hasDialogue = sectionKeys.has("dialogue");
  if (!hasGraph && !hasDialogue) missing.push("graph или dialogue");

  // Капсула: в сервисе живёт в syntheses.capsule_html (беседа 1.4) —
  // ветки embeddedState/.header-disclosure-capsule исходника вырождены.
  if (!row.capsuleHtml || !row.capsuleHtml.trim()) missing.push("capsule");

  const warnings: string[] = [];
  if (!hasGraph) warnings.push("нет графа категорий");
  if (!hasDialogue) warnings.push("нет диалога");

  return { valid: missing.length === 0, missing, warnings };
}

/** Текст ошибки непригодности — формулировка [22040] (для details роута). */
export function unsuitableConceptMessage(
  name: string,
  missing: string[],
): string {
  return (
    `Концепция «${name}» не пригодна для мета-синтеза. ` +
    "Отсутствуют разделы: " +
    missing
      .map((k) => "«" + (KEY_LABELS[k as keyof typeof KEY_LABELS] ?? k) + "»")
      .join(", ")
  );
}

/* ══ Генеалогия: предки и пересечения ═════════════════════════════════ */

/**
 * АДАПТАЦИЯ collectPhilosopherAncestors [22451]: вместо рекурсии по узлу
 * genealogy — рекурсивный CTE по synthesis_lineage (02-data-model §2.4,
 * глубина ≤ 10). Возвращает Set имён философов-предков (включая
 * непосредственных родителей-философов).
 */
export async function collectPhilosopherAncestors(
  synthesisId: string,
): Promise<Set<string>> {
  const rows = await sql<{ parent_name: string | null }[]>`
    WITH RECURSIVE ancestors AS (
      SELECT parent_type, parent_name, parent_synthesis_id, 1 AS depth
      FROM synthesis_lineage WHERE synthesis_id = ${synthesisId}

      UNION ALL

      SELECT sl.parent_type, sl.parent_name, sl.parent_synthesis_id, a.depth + 1
      FROM synthesis_lineage sl
      JOIN ancestors a ON sl.synthesis_id = a.parent_synthesis_id
      WHERE a.parent_type = 'synthesis' AND a.depth < 10
    )
    SELECT DISTINCT parent_name FROM ancestors
    WHERE parent_type = 'philosopher' AND parent_name IS NOT NULL
  `;
  const out = new Set<string>();
  for (const r of rows) if (r.parent_name) out.add(r.parent_name);
  return out;
}

/**
 * Рекурсивная проверка «A — предок B» через lineage CTE (07, запрос 1).
 * Глубина ≤ 10 — как у рекурсии 02 §2.4.
 */
export async function isAncestor(
  ancestorId: string,
  descendantId: string,
): Promise<boolean> {
  const rows = await sql<{ hit: number }[]>`
    WITH RECURSIVE ancestors AS (
      SELECT parent_type, parent_synthesis_id, 1 AS depth
      FROM synthesis_lineage WHERE synthesis_id = ${descendantId}

      UNION ALL

      SELECT sl.parent_type, sl.parent_synthesis_id, a.depth + 1
      FROM synthesis_lineage sl
      JOIN ancestors a ON sl.synthesis_id = a.parent_synthesis_id
      WHERE a.parent_type = 'synthesis' AND a.depth < 10
    )
    SELECT 1 AS hit FROM ancestors
    WHERE parent_synthesis_id = ${ancestorId}
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Порт checkGenealogyOverlaps [22467]: пересечения философов-предков
 * (1) между концепциями-участниками и (2) концепций с явно выбранными
 * философами. Тексты предупреждений — дословно. Предки концепций — из БД
 * (collectPhilosopherAncestors по synthesisId), имя — из syntheses.title,
 * если не передано.
 */
export async function checkGenealogyOverlaps(
  participants: readonly OverlapParticipant[],
): Promise<GenealogyWarning[]> {
  const warnings: GenealogyWarning[] = [];

  const conceptInputs = participants.filter(
    (p): p is Extract<OverlapParticipant, { type: "synthesis" }> =>
      p.type === "synthesis",
  );
  const ancestorSets: { name: string; ancestors: Set<string> }[] = [];
  for (const cp of conceptInputs) {
    let name = cp.name ?? "";
    if (!name) {
      const [row] = await db
        .select({ title: syntheses.title })
        .from(syntheses)
        .where(eq(syntheses.id, cp.synthesisId))
        .limit(1);
      name = row?.title ?? cp.synthesisId;
    }
    ancestorSets.push({
      name,
      ancestors: await collectPhilosopherAncestors(cp.synthesisId),
    });
  }

  // Пересечение концепций с концепциями [22475]
  for (let i = 0; i < ancestorSets.length; i++) {
    for (let j = i + 1; j < ancestorSets.length; j++) {
      const a = ancestorSets[i] as (typeof ancestorSets)[number];
      const b = ancestorSets[j] as (typeof ancestorSets)[number];
      const overlap = [...a.ancestors].filter((x) => b.ancestors.has(x));
      if (overlap.length > 0) {
        warnings.push({
          level: "info",
          text:
            "Концепции «" + a.name + "» и «" + b.name +
            "» имеют общих предков: " + overlap.join(", ") +
            ". Это может привести к доминированию их позиций.",
        });
      }
    }
  }

  // Пересечение концепций с выбранными философами [22492]
  const selectedPhils = new Set(
    participants
      .filter(
        (p): p is Extract<OverlapParticipant, { type: "philosopher" }> =>
          p.type === "philosopher",
      )
      .map((p) => p.name),
  );
  for (const cs of ancestorSets) {
    const overlap = [...cs.ancestors].filter((a) => selectedPhils.has(a));
    if (overlap.length > 0) {
      warnings.push({
        level: "warn",
        text:
          "Философ(ы) " + overlap.join(", ") +
          " выбран(ы) для синтеза и одновременно присутствуют в генеалогии " +
          "концепции «" + cs.name + "». Их влияние будет удвоено.",
      });
    }
  }

  return warnings;
}

/* ══ Блоки родительского контекста в промпт (01 §4.13 п.5) ════════════ */

/** Срез параметров, достаточный для сборки блоков. Форма participants —
 *  нестрогая ({type; name?}), чтобы PromptParams (prompt-builder) был
 *  контравариантно совместим с ParentContextProvider: интерфейс без
 *  индекс-подписи не присваивается ConceptParticipant напрямую; поля
 *  читаются через parentFieldValue после сужения isConceptParticipant. */
export interface ConceptBlockParams extends ParentDepsParams {
  participants?:
    | readonly { type: string; name?: string | undefined }[]
    | undefined;
  /** Гейт мета-синтеза (hasConceptParticipants исходника) */
  isMetaSynthesis?: boolean | undefined;
  /** Схема родительского контекста строки syntheses (v11 §4.13 п.10) */
  parentContextSchema?: string | undefined;
}

const BLOCK_WRAPPER_HEAD =
  "\n\nКОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ СИНТЕЗА " +
  "(каждая — результат предыдущего синтеза; обращайся с ней " +
  "как с полноценной философской позицией, у которой есть " +
  "собственные категории, тезисы и внутренняя логика):\n\"\"\"\n";

function conceptsOf(p: ConceptBlockParams): ConceptParticipant[] {
  if (!(p.isMetaSynthesis ?? false)) return [];
  // Сужение по типу; каст безопасен: наполненные участники несут поля
  // (loadConceptParticipants), недостающие читаются parentFieldValue → ""
  return (p.participants ?? []).filter(
    isConceptParticipant,
  ) as unknown as ConceptParticipant[];
}

function conceptHeader(c: ConceptParticipant): string[] {
  const method = typeof c.method === "string" ? c.method : "";
  const synthLevel = typeof c.synthLevel === "string" ? c.synthLevel : "";
  const seed = typeof c.seed === "string" ? c.seed : "";
  const parts = [
    "═══ КОНЦЕПЦИЯ-УЧАСТНИК: «" + (c.name ?? "") + "» ═══",
    "Метод: " + ((ML as Record<string, string>)[method] || method) +
      " · Уровень: " + ((SL as Record<string, string>)[synthLevel] || synthLevel),
  ];
  if (seed) parts.push("Зерно: " + seed);
  parts.push("");
  return parts;
}

/**
 * Порт conceptContextBlockFull(p) [10232] — legacy-монолит: все непустые
 * поля каждого родителя. КВИРК ИСХОДНИКА СОХРАНЁН: перечень полей монолита
 * НЕ включает portraits и graphEdges (короче PARENT_FIELD_ORDER) и идёт в
 * зашитом порядке с зашитыми метками — Registry здесь не участвует.
 */
export function conceptContextBlockFull(p: ConceptBlockParams): string {
  const concepts = conceptsOf(p);
  if (concepts.length === 0) return "";
  const blocks = concepts.map((c) => {
    const parts = conceptHeader(c);
    const push = (field: string, label: string, tail = true): void => {
      const v = parentFieldValue(c, field);
      if (!v) return;
      parts.push(label + ":");
      parts.push(v);
      if (tail) parts.push("");
    };
    push("capsule", "КАПСУЛА");
    push("goals", "ЦЕЛИ И МЕТОД");
    push("tensions", "НАПРЯЖЕНИЯ");
    push("graphNodes", "КАТЕГОРИИ (из графа)");
    push("dialogueConcepts", "ПОНЯТИЯ (из диалога)");
    push("glossaryCompact", "ТЕРМИНЫ");
    push("thesesSummary", "ТЕЗИСЫ");
    push("dialogueSynthesis", "АНАЛИТИЧЕСКИЙ КОММЕНТАРИЙ К ДИАЛОГУ", false);
    return parts.join("\n");
  });
  return BLOCK_WRAPPER_HEAD.replace(/^\n\n/, "\n\n") +
    blocks.join("\n\n") + "\n\"\"\"";
}

/**
 * Порт conceptContextBlockSelective(p, sectionKey, explicitSpec) [10259]:
 * включаются только поля spec (required + optional) в каноническом порядке
 * PARENT_FIELD_ORDER с метками PARENT_FIELD_LABELS (из Registry).
 * explicitSpec — например, результат resolveParentDepsForSubsection для
 * подраздельной перегенерации; иначе spec = resolveParentDeps(p)[key]
 * (нет записи → console.warn + минимум capsule, как [10274]).
 */
export async function conceptContextBlockSelective(
  p: ConceptBlockParams,
  sectionKey?: string | undefined,
  explicitSpec?: Partial<SectionDeps> | undefined,
): Promise<string> {
  const concepts = conceptsOf(p);
  if (concepts.length === 0) return "";
  const key = normalizeSectionKey(sectionKey);

  let spec: Partial<SectionDeps> | undefined;
  if (
    explicitSpec &&
    (Array.isArray(explicitSpec.required) || Array.isArray(explicitSpec.optional))
  ) {
    spec = explicitSpec;
  } else {
    const deps = await resolveParentDeps(p);
    spec = deps[key];
    if (!spec) {
      console.warn(
        "PARENT_DEPS: нет записи для «" + key + "» — минимум (capsule).",
      );
    }
  }
  const reqFields = spec?.required ?? ["capsule"];
  const optFields = spec?.optional ?? [];
  const includeSet = new Set([...reqFields, ...optFields]);

  const [order, labels] = await Promise.all([
    getParentFieldOrder(),
    getParentFieldLabels(),
  ]);

  const blocks = concepts.map((c) => {
    const parts = conceptHeader(c);
    for (const fld of order) {
      if (!includeSet.has(fld)) continue;
      const val = parentFieldValue(c, fld);
      if (!val) continue;
      parts.push((labels[fld] ?? fld) + ":");
      parts.push(val);
      parts.push("");
    }
    return parts.join("\n").replace(/\n{3,}/g, "\n\n");
  });
  return BLOCK_WRAPPER_HEAD + blocks.join("\n\n") + "\n\"\"\"";
}

/* ══ Провайдер родительского контекста (разъём 1.2/1.4) ═══════════════ */

/**
 * Реализация ParentContextProvider (prompt-builder.setParentContextProvider):
 * замена стаба беседы 1.4 (registerParentContextProvider в
 * generation-service). Диспетчеризация — паритет baseCtxParents [10371] и
 * ТЗ 4.13 п.10.2:
 *  - schema 'monolithic' (legacy-импорт до миграции) → conceptContextBlockFull;
 *  - иначе → conceptContextBlockSelective; для подраздела explicitSpec =
 *    resolveParentDepsForSubsection (intra-spec только сужает section-spec).
 */
export async function buildMetaParentContext(
  p: ConceptBlockParams,
  sectionKey?: string | undefined,
  subsectionName?: string | undefined,
): Promise<string> {
  if (conceptsOf(p).length === 0) return "";
  if (p.parentContextSchema === "monolithic") {
    return conceptContextBlockFull(p);
  }
  const explicitSpec =
    sectionKey && subsectionName
      ? await resolveParentDepsForSubsection(p, sectionKey, subsectionName)
      : undefined;
  return conceptContextBlockSelective(p, sectionKey, explicitSpec);
}
