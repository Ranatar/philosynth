/**
 * Recommendation Planner (беседа 10.2; НОВОЕ) — перевод выбранных
 * рекомендаций критики в черновик плана правок.
 *
 *   buildPlanDraft(synthesisId, userId, nums[], fields?) → черновик EditPlan
 *
 * ПЛАНИРОВЩИК НЕ ВЫБИРАЕТ ЗА ЧЕЛОВЕКА. Рекомендации называются поштучно:
 * пустой список — отказ, «все разом» службой не исполняется и входа для
 * этого нет (рекомендации пишет модель о собственном тексте, и сплошная
 * самошлифовка стирает ровно те шероховатости, ради которых концепция
 * задумывалась). Развилка «5а / 5б»: в план идёт только названный вариант;
 * оба варианта сразу — 400; голое «5» у рекомендации-развилки — тоже 400.
 *
 * Правила перевода строки в действие плана (по порядку):
 *   1. «удалить»                          → отклонена: шага удаления элемента
 *      или подраздела у планов нет (delete адресует раздел и результат
 *      режима), а пустая правка удалением не является;
 *   2. есть «Готовая замена» и элемент    → edit_element (бесплатно);
 *   3. элемент задан, замены нет          → refine_element, довод — в контекст;
 *   4. элемента нет, «перегенерировать»   → regen РАЗДЕЛА адреса (у «sum» —
 *      regen_subsection: раздел sum планом целиком не перегенерируется);
 *   5. элемента нет, прочие операции      → regen_subsection
 *      «sectionKey:Адрес», довод — пожеланием шага. Замена без элемента
 *      дописывается в довод: вписать её в поле некуда.
 * Свёртка: строки об одном подразделе дают ОДИН шаг с общим доводом; если
 * раздел тем же планом перегенерируется целиком, его подразделы вливаются в
 * довод раздела, а правки его элементов отклоняются (перегенерация заменит
 * строки элементов). Два шага на одно поле одного элемента не ставятся.
 *
 * УСТАРЕВАНИЕ. Между разбором (10.1) и постановкой плана подраздел могли
 * поправить руками (9.2) или исполнить соседнюю рекомендацию. Перед сборкой
 * хэш источника пересчитывается против живого документа (sourceHashFor):
 * разошёлся → 'stale' («текст изменился»; перечитайте рекомендации), адресата
 * больше нет → 'invalid' («адрес не найден»). Ни то ни другое в план не идёт.
 *
 * ПОЛЕ ЭЛЕМЕНТА (беседа 10.3, долг §12 беседы 10.2). Таблица рекомендаций не
 * называет, какое поле элемента править, и шаг брал поле по умолчанию
 * (определение / формулировка) — рекомендация «развить аргументацию тезиса»
 * исполнялась бы не в то поле. Поле выбирает ЧЕЛОВЕК в панели: `fields` —
 * карта «id строки рекомендации → поле» из белого списка ELEMENT_STEP_FIELDS
 * вида элемента. Строка не среди выбранных, без элемента либо поле вне списка
 * — 400 (details.fields): молча взять поле по умолчанию значило бы исполнить
 * не то, что человек решил. Карты нет — прежнее поведение.
 *
 * Каскад — обычный createPlan: считается от разделов-хозяев, по тем же
 * зависимостям, что всегда. Перегенерацию критики он добавляет САМ; руками
 * она не дописывается: в этом модуле нет ни одного упоминания раздела
 * critique среди действий плана — только чтение прозы ради довода.
 */
import { and, asc, eq, inArray } from "drizzle-orm";

import {
  RECOMMENDATIONS_PROSE_SUBSECTION,
  RECOMMENDATIONS_SECTION_KEY,
  RECOMMENDATION_NUM_RE,
  normalizeRecommendationText as norm,
} from "@philosynth/shared/constants/recommendations";
import {
  ELEMENT_STEP_FIELDS,
  ELEMENT_STEP_FIELD_LABELS,
  ELEMENT_STEP_HOST,
} from "@philosynth/shared/constants/edit-steps";
import { KEY_LABELS, isSectionKey } from "@philosynth/shared/constants/section-labels";

import { db } from "../db/index.js";
import { recommendations, sections, syntheses } from "../db/schema.js";
import { innerTextTrimmed, parseFragment, type HtmlElement } from "../utils/html-parser.js";
import { truncateText } from "../utils/text.js";
import { PlanError, createPlan } from "./edit-planner.js";
import {
  RecommendationsError,
  loadDocumentIndex,
  sourceHashFor,
  toRecommendationDto,
} from "./recommendations.js";

import type {
  CreatePlanRequest,
  ElementEditAction,
  ElementRefineAction,
  StepRecommendationRef,
  SubsectionRegenAction,
} from "@philosynth/shared/types/edit-plan";
import type {
  RecommendationDecline,
  RecommendationsPlanResponse,
} from "@philosynth/shared/types/recommendations";

type RecRow = typeof recommendations.$inferSelect;

/* ══ Номера и развилка (чистые функции) ═══════════════════════════════ */

/** «5а» → { base: "5", variant: "а" }; «5» → { base: "5", variant: "" }. */
export function splitNum(num: string): { base: string; variant: string } {
  const n = norm(num).replace(/\s+/g, "");
  const m = /^(\d+)(.*)$/.exec(n);
  return m ? { base: m[1] as string, variant: m[2] ?? "" } : { base: n, variant: "" };
}

export interface NumSelection {
  /** Нормализованные номера в порядке запроса, без повторов */
  nums: string[];
}

/**
 * Проверка выбора ПРОТИВ номеров раунда. Отказы (details по полю nums):
 * пусто; не номер; номера нет в раунде; оба варианта развилки; голый номер у
 * рекомендации-развилки.
 */
export function validateSelection(
  requested: unknown,
  roundNums: readonly string[],
): NumSelection {
  const fail = (msg: string, extra: Record<string, unknown> = {}): never => {
    throw new RecommendationsError("VALIDATION_ERROR", msg, { nums: msg, ...extra });
  };
  if (!Array.isArray(requested) || requested.length === 0)
    fail(
      "Назовите рекомендации поштучно: nums — непустой список номеров («2», «5а»). " +
        "Исполнить все разом нельзя намеренно.",
    );
  const known = new Map<string, string>(); // нормализованный → как в таблице
  for (const n of roundNums) known.set(norm(n).replace(/\s+/g, ""), n);
  const variantsOf = new Map<string, string[]>();
  for (const k of known.keys()) {
    const { base, variant } = splitNum(k);
    if (variant) variantsOf.set(base, [...(variantsOf.get(base) ?? []), k]);
  }

  const out: string[] = [];
  for (const raw of requested as unknown[]) {
    if (typeof raw !== "string" || !RECOMMENDATION_NUM_RE.test(raw.trim()))
      fail(`«${String(raw)}» — не номер рекомендации (ожидается «2» или «5а»)`);
    const k = norm(raw as string).replace(/\s+/g, "");
    if (!known.has(k)) {
      const { base, variant } = splitNum(k);
      const forks = variantsOf.get(base);
      if (!variant && forks?.length)
        fail(
          `Рекомендация ${base} — развилка: назовите вариант (${forks.join(" или ")}). ` +
            "Выбор между вариантами делает человек, не служба.",
          { fork: forks },
        );
      fail(`Рекомендации «${String(raw)}» в текущем раунде нет`, { available: [...known.values()] });
    }
    if (!out.includes(k)) out.push(k);
  }
  const chosenVariants = new Map<string, string[]>();
  for (const k of out) {
    const { base, variant } = splitNum(k);
    if (variant) chosenVariants.set(base, [...(chosenVariants.get(base) ?? []), k]);
  }
  for (const [base, vs] of chosenVariants)
    if (vs.length > 1)
      fail(
        `Рекомендация ${base} — развилка, её варианты (${vs.join(", ")}) исключают друг друга: выберите один`,
        { fork: vs },
      );
  return { nums: out };
}

/* ══ Поле элемента (беседа 10.3) ══════════════════════════════════════ */

/**
 * Проверка карты «id строки → поле» ПРОТИВ выбранных строк. Отказы
 * (details.fields): не объект; id не среди выбранных; у строки нет найденного
 * элемента; поле вне белого списка вида. Возвращает чистую карту.
 */
export function validateFieldChoices(
  requested: unknown,
  chosen: readonly Pick<RecRow, "id" | "num" | "elementId" | "elementKind">[],
): Map<string, string> {
  const out = new Map<string, string>();
  if (requested === undefined || requested === null) return out;
  const fail = (msg: string, extra: Record<string, unknown> = {}): never => {
    throw new RecommendationsError("VALIDATION_ERROR", msg, { fields: msg, ...extra });
  };
  if (typeof requested !== "object" || Array.isArray(requested))
    fail("fields — объект «id строки рекомендации → поле элемента»");
  const byId = new Map(chosen.map((r) => [r.id, r]));
  for (const [id, field] of Object.entries(requested as Record<string, unknown>)) {
    const row = byId.get(id);
    if (!row) fail(`Строки «${id}» нет среди выбранных рекомендаций`);
    const r = row as (typeof chosen)[number];
    if (!r.elementId || !r.elementKind)
      fail(`У рекомендации ${r.num} нет найденного элемента — поле выбирать не у чего`);
    const allowed = ELEMENT_STEP_FIELDS[r.elementKind as NonNullable<RecRow["elementKind"]>];
    if (typeof field !== "string" || !allowed.includes(field))
      fail(
        `Поле «${String(field)}» у рекомендации ${r.num} недопустимо: ` +
          allowed.map((f) => `${f} (${ELEMENT_STEP_FIELD_LABELS[f] ?? f})`).join(", "),
        { allowed: [...allowed] },
      );
    out.set(id, field as string);
  }
  return out;
}

/* ══ Довод рекомендации ═══════════════════════════════════════════════ */

/**
 * Текст рекомендации №N из прозы «Рекомендации по улучшению»: блок (абзац
 * или пункт списка), начинающийся с «Рекомендация N» / «N.» / «N)»; нет —
 * N-й пункт единственного списка; нет — null. Таблица несёт только название
 * подраздела критики («Основание»), сам довод живёт в прозе.
 */
export function recommendationProseOf(critiqueHtml: string, num: string): string | null {
  const { base } = splitNum(num);
  if (!/^\d+$/.test(base)) return null;
  const root = parseFragment(critiqueHtml);
  let host: HtmlElement | null = null;
  for (const el of root.querySelectorAll("[data-section]"))
    if ((el.getAttribute("data-section") ?? "") === RECOMMENDATIONS_PROSE_SUBSECTION) host = el;
  if (!host) return null;
  const head = new RegExp(`^(?:рекомендация\\s*)?№?\\s*${base}(?:[а-яёa-z])?\\s*[.:)\\u2014-]`, "i");
  const blocks = Array.from(host.querySelectorAll("p, li"));
  for (const b of blocks) {
    const t = innerTextTrimmed(b);
    if (t && head.test(t)) return t;
  }
  const items = Array.from(host.querySelectorAll("ol > li"));
  const byIndex = items[Number(base) - 1];
  return byIndex ? innerTextTrimmed(byIndex) || null : null;
}

const NOTE_PROSE_MAX = 2500;

/** Довод шага: операция, основание, текст рекомендации (и замена, если есть). */
export function buildStepNote(row: RecRow, prose: string | null): string {
  const lines = [
    `Рекомендация ${row.num} критического анализа (раунд ${row.round}).`,
    `Операция: ${row.op}.`,
    ...(row.element ? [`Элемент: «${row.element}».`] : []),
    ...(row.rationale ? [`Проблема установлена в подразделе критики «${row.rationale}».`] : []),
    ...(prose ? [`Текст рекомендации: ${truncateText(prose, NOTE_PROSE_MAX)}`] : []),
    ...(row.replacement && !row.elementId
      ? [`Готовая формулировка из рекомендации (использовать дословно): ${row.replacement}`]
      : []),
  ];
  return lines.join("\n");
}

const refOf = (r: RecRow): StepRecommendationRef => ({
  id: r.id,
  round: r.round,
  num: r.num,
  op: r.op,
  rationale: r.rationale,
});

/* ══ Перевод строк в действия (чистая функция) ════════════════════════ */

export interface DraftActions {
  body: CreatePlanRequest;
  /** id строк, вошедших в тело плана */
  plannedIds: string[];
  declined: RecommendationDecline[];
}

const OP_DELETE = "удалить";
const OP_REGENERATE = "перегенерировать";

/**
 * Годные (не stale, не invalid, не в работе) строки → тело createPlan.
 * `proseOf` даёт текст рекомендации по номеру; `sectionOrder` — разделы
 * документа (regen раздела возможен только для них и не для «sum»).
 */
export function rowsToPlanActions(
  rows: readonly RecRow[],
  proseOf: (num: string) => string | null,
  sectionOrder: readonly string[],
  fields: ReadonlyMap<string, string> = new Map(),
): DraftActions {
  const declined: RecommendationDecline[] = [];
  const decline = (r: RecRow, code: string, reason: string): void => {
    declined.push({ id: r.id, num: r.num, position: r.position, code, reason });
  };

  const sectionRegen = new Map<string, RecRow[]>();
  const subRegen = new Map<string, RecRow[]>();
  const elementRows: { row: RecRow; type: "edit" | "refine" }[] = [];

  for (const r of rows) {
    const op = norm(r.op);
    const sec = r.addressSection;
    if (op === OP_DELETE) {
      decline(
        r,
        r.elementId ? "delete_element" : "delete_subsection",
        r.elementId
          ? `Удаление элемента планом не исполняется: у планов нет шага удаления ${r.elementKind === "category" ? "категории" : r.elementKind === "thesis" ? "тезиса" : "термина"} ` +
              "(за ним тянутся связи, роли и ссылки), а пустая правка удалением не является. " +
              `Перегенерируйте подраздел «${r.addressSubsection}» с этим доводом либо удалите вручную.`
          : `Удаление подраздела планом не исполняется. Поправьте «${r.addressSubsection}» вручную либо перегенерируйте раздел.`,
      );
      continue;
    }
    if (!sec) {
      decline(r, "no_address", "У строки нет раздела-адресата — перечитайте рекомендации");
      continue;
    }
    if (r.elementId && r.elementKind) {
      elementRows.push({ row: r, type: r.replacement ? "edit" : "refine" });
      continue;
    }
    if (op === OP_REGENERATE && sec !== "sum" && sectionOrder.includes(sec)) {
      sectionRegen.set(sec, [...(sectionRegen.get(sec) ?? []), r]);
      continue;
    }
    const target = `${sec}:${r.addressSubsection}`;
    subRegen.set(target, [...(subRegen.get(target) ?? []), r]);
  }

  // Свёртка: подразделы раздела, который перегенерируется целиком, — в его довод
  for (const [target, rs] of [...subRegen]) {
    const sec = target.slice(0, target.indexOf(":"));
    if (!sectionRegen.has(sec)) continue;
    sectionRegen.set(sec, [...(sectionRegen.get(sec) as RecRow[]), ...rs]);
    subRegen.delete(target);
  }

  const elementEdits: ElementEditAction[] = [];
  const elementRefines: ElementRefineAction[] = [];
  const takenFields = new Map<string, string>(); // kind:id → № рекомендации
  const plannedIds: string[] = [];
  for (const { row: r, type } of elementRows) {
    const kind = r.elementKind as NonNullable<RecRow["elementKind"]>;
    const host = ELEMENT_STEP_HOST[kind];
    if (sectionRegen.has(host)) {
      decline(
        r,
        "section_regenerated",
        `Раздел «${isSectionKey(host) ? KEY_LABELS[host] : host}» этим же планом перегенерируется целиком — ` +
          "правка его элемента была бы стёрта. Исполните рекомендации по очереди.",
      );
      continue;
    }
    const key = `${kind}:${r.elementId as string}`;
    const holder = takenFields.get(key);
    if (holder !== undefined) {
      decline(
        r,
        "same_target",
        `Тот же элемент уже правит рекомендация ${holder} этого плана: вторая правка шла бы по устаревшему тексту. ` +
          "Исполните их по очереди.",
      );
      continue;
    }
    takenFields.set(key, r.num);
    plannedIds.push(r.id);
    const field = fields.get(r.id); // 10.3: поле выбрал человек; нет — умолчание
    if (type === "edit")
      elementEdits.push({
        kind,
        elementId: r.elementId as string,
        ...(field ? { field } : {}),
        value: r.replacement as string,
        recommendations: [refOf(r)],
      });
    else
      elementRefines.push({
        kind,
        elementId: r.elementId as string,
        ...(field ? { field } : {}),
        note: buildStepNote(r, proseOf(r.num)),
        ...(r.addressSection ? { subsection: `${r.addressSection}:${r.addressSubsection}` } : {}),
        recommendations: [refOf(r)],
      });
  }

  const joinNotes = (rs: readonly RecRow[]): string =>
    rs.map((r) => buildStepNote(r, proseOf(r.num))).join("\n\n");

  const regenSubsections: SubsectionRegenAction[] = [];
  for (const [target, rs] of subRegen) {
    regenSubsections.push({ target, note: joinNotes(rs), recommendations: rs.map(refOf) });
    plannedIds.push(...rs.map((r) => r.id));
  }
  const regen: string[] = [];
  const regenContexts: Record<string, string> = {};
  const regenRecommendations: Record<string, StepRecommendationRef[]> = {};
  for (const [sec, rs] of sectionRegen) {
    regen.push(sec);
    regenContexts[sec] = joinNotes(rs);
    regenRecommendations[sec] = rs.map(refOf);
    plannedIds.push(...rs.map((r) => r.id));
  }

  return {
    body: {
      regen,
      remove: [],
      add: [],
      regenContexts,
      regenSubsections,
      elementEdits,
      elementRefines,
      regenRecommendations,
    },
    plannedIds,
    declined,
  };
}

/* ══ buildPlanDraft ═══════════════════════════════════════════════════ */

/**
 * Выбранные рекомендации последнего раунда → черновик плана.
 * Бросает RecommendationsError: VALIDATION_ERROR (выбор), NOT_FOUND (нет
 * раунда), RECOMMENDATIONS_NOT_PLANNABLE (ни одна строка в план не вошла —
 * details называет судьбу каждой); PlanError — от createPlan.
 */
export async function buildPlanDraft(
  synthesisId: string,
  userId: string,
  nums: unknown,
  fields?: unknown,
): Promise<RecommendationsPlanResponse> {
  const [synth] = await db
    .select({ sectionOrder: syntheses.sectionOrder })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  if (!synth) throw new RecommendationsError("NOT_FOUND", "Синтез не найден");

  const all = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.synthesisId, synthesisId))
    .orderBy(asc(recommendations.round), asc(recommendations.position));
  const round = all.reduce((m, r) => Math.max(m, r.round), 0);
  if (round === 0)
    throw new RecommendationsError(
      "NOT_FOUND",
      "Рекомендации ещё не разобраны — сначала POST …/recommendations/parse",
      { reason: "no_round" },
    );
  const roundRows = all.filter((r) => r.round === round);
  const selection = validateSelection(nums, roundRows.map((r) => r.num));
  const wanted = new Set(selection.nums);
  // Выбор по номеру берёт ВСЕ строки номера: одна рекомендация — по строке на адрес
  const chosen = roundRows.filter((r) => wanted.has(norm(r.num).replace(/\s+/g, "")));
  const fieldChoices = validateFieldChoices(fields, chosen);

  /* ── Устаревание: сверка с живым документом ── */
  const doc = await loadDocumentIndex(synthesisId);
  const stale: RecRow[] = [];
  const invalid: RecRow[] = [];
  const declined: RecommendationDecline[] = [];
  const eligible: RecRow[] = [];
  for (const r of chosen) {
    if (r.status === "invalid") { invalid.push(r); continue; }
    if (r.status === "stale") { stale.push(r); continue; }
    if (r.status === "planned") {
      declined.push({ id: r.id, num: r.num, position: r.position, code: "already_planned", reason: "Рекомендация уже стоит в плане правок" });
      continue;
    }
    if (r.status === "done") {
      declined.push({ id: r.id, num: r.num, position: r.position, code: "already_done", reason: "Рекомендация уже исполнена" });
      continue;
    }
    const now = sourceHashFor(doc, r);
    if (now === null) {
      const what = r.elementId
        ? `элемент «${r.element ?? ""}» удалён из концепции после разбора`
        : `подраздел «${r.addressSubsection}» исчез из документа после разбора`;
      const [upd] = await db
        .update(recommendations)
        .set({ status: "invalid", invalidReason: `адресат не найден при постановке плана: ${what}` })
        .where(eq(recommendations.id, r.id))
        .returning();
      invalid.push(upd ?? r);
      continue;
    }
    if (r.sourceHash && now !== r.sourceHash) {
      const [upd] = await db
        .update(recommendations)
        .set({ status: "stale" })
        .where(eq(recommendations.id, r.id))
        .returning();
      stale.push(upd ?? r);
      continue;
    }
    eligible.push(r);
  }

  /* ── Перевод и постановка ── */
  const [critique] = await db
    .select({ html: sections.htmlContent })
    .from(sections)
    .where(and(eq(sections.synthesisId, synthesisId), eq(sections.key, RECOMMENDATIONS_SECTION_KEY)))
    .limit(1);
  const proseCache = new Map<string, string | null>();
  const proseOf = (num: string): string | null => {
    if (!proseCache.has(num)) proseCache.set(num, critique ? recommendationProseOf(critique.html, num) : null);
    return proseCache.get(num) ?? null;
  };
  const draft = rowsToPlanActions(eligible, proseOf, synth.sectionOrder ?? [], fieldChoices);
  declined.push(...draft.declined);

  const hintParts: string[] = [];
  if (stale.length)
    hintParts.push(
      `Текст, к которому относились рекомендации ${[...new Set(stale.map((r) => r.num))].join(", ")}, изменился после разбора — ` +
        "довод мог обессмыслиться. Перечитайте рекомендации (POST …/recommendations/parse) и решите заново.",
    );
  if (invalid.length)
    hintParts.push(
      `У рекомендаций ${[...new Set(invalid.map((r) => r.num))].join(", ")} адресат не найден — исполнить их нельзя.`,
    );
  const hint = hintParts.length ? hintParts.join(" ") : null;

  if (draft.plannedIds.length === 0)
    throw new RecommendationsError(
      "RECOMMENDATIONS_NOT_PLANNABLE",
      hint ?? declined[0]?.reason ?? "Ни одна из названных рекомендаций в план не вошла",
      {
        stale: stale.map((r) => ({ id: r.id, num: r.num, position: r.position })),
        invalid: invalid.map((r) => ({ id: r.id, num: r.num, position: r.position, reason: r.invalidReason })),
        declined,
      },
    );

  let plan;
  try {
    plan = await createPlan(synthesisId, userId, draft.body, { trustRecommendationRefs: true });
  } catch (err) {
    if (err instanceof PlanError && err.code === "VALIDATION_ERROR")
      throw new RecommendationsError("VALIDATION_ERROR", err.message, err.details);
    throw err;
  }

  const planned = await db
    .select()
    .from(recommendations)
    .where(and(eq(recommendations.synthesisId, synthesisId), inArray(recommendations.id, draft.plannedIds)))
    .orderBy(asc(recommendations.position));

  return {
    plan,
    round,
    planned: planned.map(toRecommendationDto),
    stale: stale.map(toRecommendationDto),
    invalid: invalid.map(toRecommendationDto),
    declined,
    hint,
  };
}
