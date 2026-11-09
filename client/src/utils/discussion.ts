/**
 * Чистые помощники обсуждения (беседа 16.3): адрес цели по месту в
 * документе, сборка веток из плоского списка, подписи видов/состояний,
 * абзацы пользовательского текста.
 *
 * Тексты пользователей показываются ТОЛЬКО экранированным текстом: тело
 * режется на абзацы по пустой строке (`paragraphsOf`), каждый абзац —
 * <p> с текстовым содержимым (UserText). dangerouslySetInnerHTML в
 * компонентах обсуждения запрещён (сторож 4bo).
 */
import type { AddressKind, AddressState, CommentKind } from "@philosynth/shared/constants/discussion";
import type { AddressCounts, AddressTarget, Comment, DiscussionSummary } from "@philosynth/shared/types/discussion";
import { addressKeyOf, categoryKey, edgeKey, termKey } from "@philosynth/shared/utils/discussion-address";
import { tl } from "@philosynth/shared/i18n/t";

/**
 * Цель обсуждения, найденная по месту в документе. `key` — ключ адреса КАК
 * В СВОДКЕ (нормализованный: им пометка находит свой счётчик), `target` —
 * что уходит серверу (имя категории/термина — как в документе: сервер
 * нормализует сам, 16.1 normalizeTargetKey; у связи — готовый edgeKey, у
 * подраздела — «ключ раздела:data-section»).
 */
export interface MarkTarget {
  kind: AddressKind;
  key: string;
  target: AddressTarget;
  /** Подпись объекта для шапки панели («Категория: Бытие») */
  title: string;
  /** Раздел, в котором объект стоит (для перехода к месту) */
  sectionKey: string | null;
}

export const addressKeyOfTarget = (t: Pick<MarkTarget, "kind" | "key">): string => addressKeyOf(t.kind, t.key);

/** Цель по виду и сырому значению из документа (имя/метка/ячейки строки). */
export function targetOf(kind: AddressKind, raw: string | { source: string; target: string; type: string }, sectionKey: string | null, title: string): MarkTarget {
  switch (kind) {
    case "edge": {
      const e = typeof raw === "string" ? { source: raw, target: "", type: "" } : raw;
      const key = edgeKey(e.source, e.target, e.type);
      return { kind, key, target: { kind, key }, title, sectionKey };
    }
    case "category": {
      const name = String(raw);
      return { kind, key: categoryKey(name), target: { kind, key: name }, title, sectionKey };
    }
    case "glossary_term": {
      const name = String(raw);
      return { kind, key: termKey(name), target: { kind, key: name }, title, sectionKey };
    }
    case "thesis": {
      const label = String(raw).trim();
      return { kind, key: label, target: { kind, key: label }, title, sectionKey };
    }
    case "synthesis": {
      const id = String(raw);
      return { kind, key: id, target: { kind }, title, sectionKey: null };
    }
    default: {
      const key = String(raw);
      return { kind, key, target: { kind, key }, title, sectionKey };
    }
  }
}

/** Цель по адресу записи (переход из вкладки «Обсуждение» или рецензии):
 *  серверу уходит текущий id объекта (переразрешённый) либо id записи, и
 *  ключ — на случай пересоздания (findTarget 16.1: id, затем ключ). */
export function targetFromAddress(
  rec: { address: { kind: AddressKind; key: string; id: string | null }; resolution: { currentId: string | null } },
  sectionTitles?: Readonly<Record<string, string>>,
): MarkTarget {
  const { kind, key } = rec.address;
  const id = rec.resolution.currentId ?? rec.address.id;
  const target: AddressTarget = kind === "synthesis" ? { kind } : id ? { kind, id, key } : { kind, key };
  const sectionKey = kind === "section" ? key : kind === "subsection" ? (key.split(":")[0] ?? null) : null;
  return { kind, key, target, title: addressLabel(rec.address, sectionTitles), sectionKey };
}

/** Сводка → карта «вид:ключ» → счётчики. */
export function summaryMap(summary: DiscussionSummary | null): Map<string, AddressCounts> {
  const m = new Map<string, AddressCounts>();
  for (const row of summary?.byAddress ?? []) m.set(addressKeyOf(row.kind, row.key), row);
  return m;
}

/* ── Ветки ───────────────────────────────────────────────────────────── */

export interface Thread {
  root: Comment;
  replies: Comment[];
}

/** Плоский список (корни и ответы по createdAt) → ветки; корни — в порядке
 *  появления, ответы — внутри своей ветки. Ответ без корня в списке
 *  (корень скрыт фильтром) — в ветку-заглушку не собирается: пропускается. */
export function threadsOf(list: readonly Comment[]): Thread[] {
  const byId = new Map<string, Thread>();
  const out: Thread[] = [];
  for (const c of list) {
    if (c.parentId === null) {
      const t = { root: c, replies: [] };
      byId.set(c.id, t);
      out.push(t);
    }
  }
  for (const c of list) {
    if (c.parentId !== null) byId.get(c.parentId)?.replies.push(c);
  }
  return out;
}

export const isOpenThread = (t: Thread): boolean => t.root.status === "open";

/** Открытые — первыми, решённые — за ними (порядок внутри групп прежний). */
export function orderThreads(threads: readonly Thread[]): Thread[] {
  return [...threads.filter(isOpenThread), ...threads.filter((t) => !isOpenThread(t))];
}

/* ── Абзацы ──────────────────────────────────────────────────────────── */

/** Тело → абзацы по пустой строке; одиночные переводы строки — внутри абзаца. */
export function paragraphsOf(body: string): string[] {
  return (body ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/* ── Подписи ─────────────────────────────────────────────────────────── */

export function kindLabel(kind: CommentKind | null | undefined): string {
  switch (kind) {
    case "question":
      return tl("utils.discussion.kindQuestion", "вопрос");
    case "objection":
      return tl("utils.discussion.kindObjection", "возражение");
    case "source":
      return tl("utils.discussion.kindSource", "источник");
    case "unclear":
      return tl("utils.discussion.kindUnclear", "неясность");
    default:
      return "";
  }
}

export function addressKindLabel(kind: AddressKind): string {
  switch (kind) {
    case "synthesis":
      return tl("utils.discussion.addrSynthesis", "Концепция");
    case "section":
      return tl("utils.discussion.addrSection", "Раздел");
    case "subsection":
      return tl("utils.discussion.addrSubsection", "Подраздел");
    case "category":
      return tl("utils.discussion.addrCategory", "Категория");
    case "edge":
      return tl("utils.discussion.addrEdge", "Связь");
    case "thesis":
      return tl("utils.discussion.addrThesis", "Тезис");
    case "glossary_term":
      return tl("utils.discussion.addrTerm", "Термин");
  }
}

export function stateLabel(state: AddressState): string {
  switch (state) {
    case "current":
      return tl("utils.discussion.stateCurrent", "текущая версия");
    case "outdated":
      return tl("utils.discussion.stateOutdated", "относится к прежней версии");
    case "deleted":
      return tl("utils.discussion.stateDeleted", "объект удалён");
  }
}

/** Подпись адреса по данным комментария/замечания (панель, вкладка, рецензия):
 *  вид + ключ человеческим видом (у подраздела — имя после двоеточия, у связи
 *  — «источник → цель»). */
export function addressLabel(addr: { kind: AddressKind; key: string }, sectionTitles?: Readonly<Record<string, string>>): string {
  const kind = addressKindLabel(addr.kind);
  switch (addr.kind) {
    case "synthesis":
      return kind;
    case "section":
      return `${kind}: ${sectionTitles?.[addr.key] ?? addr.key}`;
    case "subsection": {
      const i = addr.key.indexOf(":");
      const sec = i > 0 ? addr.key.slice(0, i) : "";
      const name = i > 0 ? addr.key.slice(i + 1) : addr.key;
      return `${kind}: ${name}${sec ? ` (${sectionTitles?.[sec] ?? sec})` : ""}`;
    }
    case "edge": {
      const [pair, type] = addr.key.split("|");
      return `${kind}: ${(pair ?? addr.key).replace("→", " → ")}${type ? ` (${type})` : ""}`;
    }
    default:
      return `${kind}: ${addr.key}`;
  }
}

/** Дата-время коротко, на языке интерфейса браузера. */
export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Подпись автора: имя + пометки (владелец / бывший участник / удалённый). */
export function authorNote(a: Comment["author"]): string {
  if (a.deleted) return tl("utils.discussion.authorDeleted", "удалённый пользователь");
  if (a.isOwner) return tl("utils.discussion.authorOwner", "владелец");
  if (a.formerMember) return tl("utils.discussion.authorFormer", "бывший участник");
  return "";
}
