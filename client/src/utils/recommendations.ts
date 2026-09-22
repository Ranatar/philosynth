/**
 * Панель рекомендаций критики (беседа 10.3) — чистые функции: группировка
 * строк, развилка, пометка «стоит ли это денег», оценка ДО сборки плана,
 * проза рекомендации, тексты отказов.
 *
 * В одностраничнике прародителя нет: рекомендации там — только проза.
 *
 * Правила перевода строки в действие ЗЕРКАЛЯТ серверный планировщик
 * (server/services/recommendation-planner.ts, rowsToPlanActions) — клиент их
 * не исполняет, а лишь предсказывает, чтобы человек до выбора видел, что
 * бесплатно, что стоит обращения к модели, а что планом не исполняется:
 *   «удалить»                        → вручную (шага удаления у планов нет);
 *   готовая замена + найденный элемент → правка, бесплатно (edit_element);
 *   найденный элемент без замены     → генерация в элемент (refine_element);
 *   без элемента, «перегенерировать» → перегенерация раздела (у sum — подраздела);
 *   без элемента, прочее             → перегенерация подраздела.
 * Дрейф с сервером сторожит integration-check (4au).
 *
 * НИ ОДНА функция здесь не выбирает «все строки»: выбор — поштучный, набор
 * выбранного приходит аргументом от человека.
 */
import {
  RECOMMENDATIONS_PROSE_SUBSECTION,
  normalizeRecommendationText as norm,
} from "@philosynth/shared/constants/recommendations";
import {
  ELEMENT_STEP_FIELDS,
  ELEMENT_STEP_FIELD_LABELS,
  ELEMENT_STEP_HOST,
  ELEMENT_STEP_KIND_LABELS,
} from "@philosynth/shared/constants/edit-steps";
import type {
  Recommendation,
  RecommendationDecline,
} from "@philosynth/shared/types/recommendations";

import { ApiError } from "../api/client";

/* ══ Номер и развилка ═════════════════════════════════════════════════ */

/** «5а» → { base: "5", variant: "а" } — копия splitNum планировщика. */
export function splitNum(num: string): { base: string; variant: string } {
  const n = norm(num).replace(/\s+/g, "");
  const m = /^(\d+)(.*)$/.exec(n);
  return m ? { base: m[1] as string, variant: m[2] ?? "" } : { base: n, variant: "" };
}

/** Ключ номера, которым строки сводятся в одну рекомендацию. */
export const numKey = (num: string): string => norm(num).replace(/\s+/g, "");

/* ══ Вид исполнения строки ════════════════════════════════════════════ */

/** free — правка готовым текстом; paid — обращение к модели; manual — планом
 *  не исполняется (долг §12 беседы 10.2: показывать как исполняемое вручную). */
export type RecommendationCostKind = "free" | "paid" | "manual";

const OP_DELETE = "удалить";
const OP_REGENERATE = "перегенерировать";

export function costKindOf(row: Recommendation): RecommendationCostKind {
  if (norm(row.op) === OP_DELETE) return "manual";
  return row.elementId && row.elementKind && row.replacement ? "free" : "paid";
}

/** Что именно сделает план со строкой — подпись под пометкой. */
export function actionTextOf(row: Recommendation): string {
  const kind = costKindOf(row);
  if (kind === "manual")
    return row.elementId
      ? "планом не исполняется: удаление элемента — вручную либо перегенерацией подраздела"
      : "планом не исполняется: удаление подраздела — вручную";
  if (kind === "free") return "готовая замена будет вписана в поле элемента";
  if (row.elementId && row.elementKind) return "новое значение поля напишет модель";
  if (norm(row.op) === OP_REGENERATE && row.addressSection && row.addressSection !== "sum")
    return "раздел будет перегенерирован целиком";
  return "подраздел будет перегенерирован";
}

export const COST_KIND_LABEL: Record<RecommendationCostKind, string> = {
  free: "правка · бесплатно",
  paid: "генерация",
  manual: "вручную",
};

/** Выбирать можно только то, что план исполнит: годные строки вне работы. */
export function isSelectableRow(row: Recommendation): boolean {
  return (row.status === "new" || row.status === "rejected") && costKindOf(row) !== "manual";
}

/* ══ Группы панели ════════════════════════════════════════════════════ */

/** Одна рекомендация (или вариант развилки): все строки одного номера. */
export interface RecommendationItem {
  key: string;
  num: string;
  base: string;
  variant: string;
  rows: Recommendation[];
  /** Хоть одна строка может встать в план */
  selectable: boolean;
  costKinds: RecommendationCostKind[];
}

/** Рекомендация либо развилка из взаимоисключающих вариантов. */
export interface RecommendationGroup {
  base: string;
  /** true — варианты «5а» / «5б»: выбрать можно только ОДИН */
  fork: boolean;
  items: RecommendationItem[];
}

export interface PanelGroups {
  /** Ждут решения: new, rejected и stale — в порядке таблицы */
  open: RecommendationGroup[];
  /** Стоят в плане (раунд в работе) */
  planned: Recommendation[];
  done: Recommendation[];
  /** Сторож не нашёл адрес / элемент — отдельной группой, без выбора */
  invalid: Recommendation[];
}

function toItems(rows: readonly Recommendation[]): RecommendationItem[] {
  const byNum = new Map<string, RecommendationItem>();
  for (const r of rows) {
    const key = numKey(r.num);
    let item = byNum.get(key);
    if (!item) {
      const { base, variant } = splitNum(r.num);
      item = { key, num: r.num, base, variant, rows: [], selectable: false, costKinds: [] };
      byNum.set(key, item);
    }
    item.rows.push(r);
    if (isSelectableRow(r)) item.selectable = true;
    const ck = costKindOf(r);
    if (!item.costKinds.includes(ck)) item.costKinds.push(ck);
  }
  return [...byNum.values()];
}

export function groupForPanel(rows: readonly Recommendation[]): PanelGroups {
  const open = rows.filter(
    (r) => r.status === "new" || r.status === "rejected" || r.status === "stale",
  );
  const groups: RecommendationGroup[] = [];
  const byBase = new Map<string, RecommendationGroup>();
  for (const item of toItems(open)) {
    let g = byBase.get(item.base);
    if (!g) {
      g = { base: item.base, fork: false, items: [] };
      byBase.set(item.base, g);
      groups.push(g);
    }
    g.items.push(item);
  }
  // Развилка определяется по ВСЕМ строкам раунда: вариант мог уйти в работу
  const variantsOfBase = new Map<string, Set<string>>();
  for (const r of rows) {
    const { base, variant } = splitNum(r.num);
    if (!variant) continue;
    variantsOfBase.set(base, (variantsOfBase.get(base) ?? new Set()).add(variant));
  }
  for (const g of groups) g.fork = (variantsOfBase.get(g.base)?.size ?? 0) > 1;
  return {
    open: groups,
    planned: rows.filter((r) => r.status === "planned"),
    done: rows.filter((r) => r.status === "done"),
    invalid: rows.filter((r) => r.status === "invalid"),
  };
}

/** Число на кнопке входа: рекомендации текущего раунда, ждущие решения —
 *  по НОМЕРАМ, не по строкам, и развилка «5а/5б» — ОДНА рекомендация;
 *  негодные и исполненные не считаются. */
export function pendingCount(rows: readonly Recommendation[]): number {
  const bases = new Set<string>();
  for (const r of rows)
    if (r.status === "new" || r.status === "rejected" || r.status === "stale")
      bases.add(splitNum(r.num).base);
  return bases.size;
}

/**
 * Выбор с развилкой: отметить номер — снять прочие варианты той же
 * рекомендации (сервер на оба варианта ответит 400 — доводить незачем).
 */
export function toggleSelection(
  selected: ReadonlySet<string>,
  item: Pick<RecommendationItem, "key" | "base" | "variant">,
  checked: boolean,
): Set<string> {
  const next = new Set(selected);
  if (!checked) {
    next.delete(item.key);
    return next;
  }
  if (item.variant)
    for (const k of [...next]) if (splitNum(k).base === item.base) next.delete(k);
  next.add(item.key);
  return next;
}

/* ══ Оценка ДО сборки плана ═══════════════════════════════════════════ */

export interface SelectionEstimate {
  /** Шаги без модели */
  free: number;
  /** Шаги с обращением к модели (после свёртки строк об одном адресе) */
  paid: number;
  /** Строки, которые сервер отклонит (второй шаг на тот же элемент и т.п.) */
  conflicts: string[];
}

/**
 * Сколько шагов даст выбор — «N бесплатно, M платно». Считает ШАГИ, а не
 * строки: строки об одном подразделе сервер сворачивает в один шаг, подраздел
 * раздела, идущего на перегенерацию, вливается в неё. Каскадные шаги сюда не
 * входят — их добавит сервер, и человек увидит их в плане.
 */
export function estimateSelection(
  rows: readonly Recommendation[],
  selected: ReadonlySet<string>,
): SelectionEstimate {
  const chosen = rows.filter((r) => selected.has(numKey(r.num)) && isSelectableRow(r));
  const sectionRegen = new Set<string>();
  const subRegen = new Set<string>();
  const elementRows: Recommendation[] = [];
  for (const r of chosen) {
    if (r.elementId && r.elementKind) elementRows.push(r);
    else if (norm(r.op) === OP_REGENERATE && r.addressSection && r.addressSection !== "sum")
      sectionRegen.add(r.addressSection);
    else subRegen.add(`${r.addressSection ?? ""}:${r.addressSubsection}`);
  }
  for (const t of [...subRegen])
    if (sectionRegen.has(t.slice(0, t.indexOf(":")))) subRegen.delete(t);
  let free = 0;
  let paid = sectionRegen.size + subRegen.size;
  const conflicts: string[] = [];
  const taken = new Map<string, string>();
  for (const r of elementRows) {
    const host = ELEMENT_STEP_HOST[r.elementKind as NonNullable<Recommendation["elementKind"]>];
    if (sectionRegen.has(host)) {
      conflicts.push(`Рекомендация ${r.num}: раздел её элемента этим же выбором перегенерируется целиком — исполните по очереди`);
      continue;
    }
    const key = `${r.elementKind}:${r.elementId}`;
    const holder = taken.get(key);
    if (holder !== undefined) {
      conflicts.push(`Рекомендации ${holder} и ${r.num} правят один элемент — исполните по очереди`);
      continue;
    }
    taken.set(key, r.num);
    if (r.replacement) free += 1;
    else paid += 1;
  }
  return { free, paid, conflicts };
}

const plural = (n: number, one: string, few: string, many: string): string => {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
};

/** «1 бесплатно, 1 платно» — числом, а не «бесплатно/платно» вообще. */
export function estimateText(e: SelectionEstimate): string {
  const steps = e.free + e.paid;
  if (steps === 0) return "Ничего не выбрано";
  return (
    `${steps} ${plural(steps, "шаг", "шага", "шагов")}: ` +
    `${e.free} бесплатно, ${e.paid} платно`
  );
}

/* ══ Поле элемента (долг §12 беседы 10.2) ═════════════════════════════ */

export interface FieldOption {
  field: string;
  label: string;
}

/** Поля, доступные шагу у найденного элемента; первое — поле по умолчанию. */
export function fieldOptionsOf(row: Recommendation): FieldOption[] {
  if (!row.elementId || !row.elementKind) return [];
  return ELEMENT_STEP_FIELDS[row.elementKind].map((f) => ({
    field: f,
    label: ELEMENT_STEP_FIELD_LABELS[f] ?? f,
  }));
}

/** Подпись вида найденного сторожем элемента — рядом с адресом (долг §12). */
export function elementKindText(row: Recommendation): string | null {
  return row.elementKind ? ELEMENT_STEP_KIND_LABELS[row.elementKind] : null;
}

/**
 * Расхождение «адрес говорит об одном разделе, элемент найден в другом»:
 * рекомендация адресована глоссарию, а сторож нашёл одноимённую КАТЕГОРИЮ —
 * шаг поправит категорию. Это должно быть видно человеку до выбора.
 */
export function kindMismatchText(
  row: Recommendation,
  sectionLabel: (key: string) => string,
): string | null {
  if (!row.elementKind || !row.addressSection) return null;
  const host = ELEMENT_STEP_HOST[row.elementKind];
  if (host === row.addressSection) return null;
  return (
    `Адрес указывает на раздел «${sectionLabel(row.addressSection)}», а элемент найден как ` +
    `${ELEMENT_STEP_KIND_LABELS[row.elementKind]} (раздел «${sectionLabel(host)}»): ` +
    "правка попадёт туда."
  );
}

/* ══ Проза рекомендации ═══════════════════════════════════════════════ */

/**
 * Текст рекомендации №N из прозы «Рекомендации по улучшению» — клиентская
 * копия recommendationProseOf планировщика (DOMParser вместо linkedom): блок,
 * начинающийся с «Рекомендация N» / «N.» / «N)»; нет — N-й пункт списка.
 * Таблица несёт лишь НАЗВАНИЕ подраздела критики; сам довод живёт в прозе.
 */
export function recommendationProseOf(critiqueHtml: string, num: string): string | null {
  const { base } = splitNum(num);
  if (!/^\d+$/.test(base) || typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(`<div>${critiqueHtml}</div>`, "text/html");
  let host: Element | null = null;
  for (const el of Array.from(doc.querySelectorAll("[data-section]")))
    if ((el.getAttribute("data-section") ?? "") === RECOMMENDATIONS_PROSE_SUBSECTION) host = el;
  if (!host) return null;
  const head = new RegExp(
    `^(?:рекомендация\\s*)?№?\\s*${base}(?:[а-яёa-z])?\\s*[.:)\\u2014-]`,
    "i",
  );
  const textOf = (el: Element): string => (el.textContent ?? "").replace(/\s+/g, " ").trim();
  for (const b of Array.from(host.querySelectorAll("p, li"))) {
    const t = textOf(b);
    if (t && head.test(t)) return t;
  }
  const byIndex = Array.from(host.querySelectorAll("ol > li"))[Number(base) - 1];
  return byIndex ? textOf(byIndex) || null : null;
}

/* ══ Тексты отказов ═══════════════════════════════════════════════════ */

export type RetrofitReason = "no_table" | "no_prose" | "no_critique" | null;

/** Причина 404 разбора: нет таблицы → предложить ретрофит. */
export function notFoundReasonOf(err: unknown): RetrofitReason {
  if (!(err instanceof ApiError) || err.code !== "NOT_FOUND") return null;
  const d = err.details as { reason?: unknown } | undefined;
  const r = d && typeof d === "object" ? d.reason : undefined;
  return r === "no_table" || r === "no_prose" || r === "no_critique" ? r : null;
}

export function recommendationsErrorText(err: unknown): string {
  if (!(err instanceof ApiError)) return "Не удалось выполнить запрос.";
  switch (err.code) {
    case "GENERATION_IN_PROGRESS":
      return "Идёт генерация либо исполнение плана — дождитесь окончания и повторите.";
    case "FORBIDDEN":
      return "Рекомендации доступны только владельцу концепции.";
    case "ROUND_IN_PROGRESS":
      return err.message || "Раунд в работе: сначала исполните либо удалите план.";
    case "RECOMMENDATIONS_TABLE_INVALID":
      return (
        (err.message || "Подраздел «Таблица рекомендаций» не разбирается как таблица.") +
        " Поправьте её вручную и перечитайте."
      );
    case "RECOMMENDATIONS_NOT_PLANNABLE":
      return err.message || "Ни одна из выбранных рекомендаций в план не вошла.";
    case "GENERATION_FAILED":
      return "Обращение к модели оборвалось — документ не тронут, запрос можно повторить.";
    case "QUOTA_EXCEEDED":
    case "BILLING_REQUIRED":
    case "INSUFFICIENT_BALANCE":
    case "API_KEY_MISSING":
    case "API_KEY_INVALID":
      return err.message || "Нет источника оплаты для обращения к модели.";
    default:
      return err.message || "Не удалось выполнить запрос.";
  }
}

/** Судьба строк, не вошедших в план: из ответа 200 либо из details отказа 422. */
export interface PlanLeftovers {
  declined: RecommendationDecline[];
  staleNums: string[];
  invalidNums: string[];
}

export function leftoversOfError(err: unknown): PlanLeftovers | null {
  if (!(err instanceof ApiError) || err.code !== "RECOMMENDATIONS_NOT_PLANNABLE") return null;
  const d = (err.details ?? {}) as {
    declined?: RecommendationDecline[];
    stale?: { num: string }[];
    invalid?: { num: string }[];
  };
  return {
    declined: Array.isArray(d.declined) ? d.declined : [],
    staleNums: Array.isArray(d.stale) ? d.stale.map((r) => r.num) : [],
    invalidNums: Array.isArray(d.invalid) ? d.invalid.map((r) => r.num) : [],
  };
}

export const SEVERITY_CHIP: Record<string, string> = {
  блокирующая: "chip-hard-conflict",
  существенная: "chip-tension",
  косметическая: "chip-inactive",
};

export const severityChipOf = (severity: string): string =>
  SEVERITY_CHIP[norm(severity)] ?? "chip-inactive";
