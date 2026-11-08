/**
 * Реестр устойчивых адресов обсуждения (беседа 16.1; врезка «Фаза 16» в 07)
 * — ЧИСТЫЕ функции, общие серверу и клиенту: ключи объектов по виду,
 * канонический хэш содержимого, выдержка «как было», состояние адреса.
 *
 * Зачем. Перегенерация графа (`saveGraphToDb`) и трансформация граф↔тезисы
 * пересоздают категории и связи с новыми id, повторный разбор раздела —
 * тезисы и термины (`saveElementsToDb`): замечание, привязанное к одному id,
 * повисло бы после первой же перегенерации. Поэтому адрес = вид + КЛЮЧ +
 * id на момент записи + хэш канонического содержимого (+ номер версии
 * элемента). После пересоздания объект находится заново по ключу; хэш не
 * совпал — «относится к прежней версии» (outdated ВЫЧИСЛЯЕТСЯ, не
 * ставится); объекта нет ни по id, ни по ключу — «объект удалён». Старое
 * замечание на новую версию не переносится и разрешённым не считается.
 *
 * Ключ по виду (как в DiscussionAddress):
 *   synthesis     — id синтеза;
 *   section       — ключ раздела (sum, graph, …);
 *   subsection    — «ключ раздела:data-section» (data-section — машинный
 *                   ключ подраздела, 14.2);
 *   category      — имя после normalizeName, пробелы схлопнуты, регистр снят;
 *   edge          — «ключ источника→ключ цели|тип» (тип — normalizeType,
 *                   регистр снят);
 *   thesis        — метка `label ?? thesis_num` (12.1: тезис зовётся меткой);
 *   glossary_term — термин (как категория).
 * Хэш — sha256(canonicalJson(payload)) в hex; у synthesis — пустая строка:
 * обсуждение документа «вообще» не устаревает от каждой правки.
 * Хэш считается Web Crypto (`globalThis.crypto.subtle`): модуль общий, и
 * node:crypto в браузер не импортируется. jsonb не хранит порядок ключей
 * (09 §1) — канонизация обязательна.
 */
import { ADDRESS_EXCERPT_MAX, type AddressKind } from "../constants/discussion.js";
import type {
  AddressResolution,
  DiscussionAddress,
} from "../types/discussion.js";
import { normalizeName, normalizeType } from "./normalize.js";

/* ── Ключи ───────────────────────────────────────────────────────────── */

const squash = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Ключ имени (категория, термин): без [сносок], (пояснений), кавычек;
 *  пробелы схлопнуты; регистр снят. */
export function nameKey(name: string): string {
  return squash(normalizeName(name ?? "")).toLowerCase();
}

export function categoryKey(name: string): string {
  return nameKey(name);
}

export function termKey(term: string): string {
  return nameKey(term);
}

export function edgeKey(sourceName: string, targetName: string, edgeType: string): string {
  return `${nameKey(sourceName)}→${nameKey(targetName)}|${squash(normalizeType(edgeType)).toLowerCase()}`;
}

/** Метка тезиса — как её зовёт документ (12.1): label, иначе номер. */
export function thesisKey(label: string | null | undefined, thesisNum: number): string {
  const l = (label ?? "").trim();
  return l || String(thesisNum);
}

export function subsectionKey(sectionKey: string, dataSection: string): string {
  return `${sectionKey}:${dataSection}`;
}

/** Обратное к subsectionKey: первый «:» делит ключ раздела и data-section
 *  (ключи разделов двоеточий не содержат; имя подраздела — может). */
export function parseSubsectionKey(key: string): { sectionKey: string; dataSection: string } | null {
  const i = key.indexOf(":");
  if (i <= 0 || i === key.length - 1) return null;
  return { sectionKey: key.slice(0, i), dataSection: key.slice(i + 1) };
}

/** Ключ группировки адреса (сводка, отбор): «вид:ключ». */
export function addressKeyOf(kind: AddressKind, key: string): string {
  return `${kind}:${key}`;
}

/* ── Канонический хэш ────────────────────────────────────────────────── */

/** JSON с рекурсивно отсортированными ключами объектов (порядок ключей
 *  jsonb не сохраняет — 09 §1). undefined в объектах опускается. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  return v;
}

/** sha256 в hex через Web Crypto (Node ≥ 20 и браузер). */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Хэш канонического содержимого объекта; у synthesis — "" (см. шапку). */
export async function contentHash(kind: AddressKind, payload: unknown): Promise<string> {
  if (kind === "synthesis") return "";
  return sha256Hex(canonicalJson(payload));
}

/* ── Выдержка и обычный текст ────────────────────────────────────────── */

/** HTML → плоский текст: теги снимаются, сущности раскрываются (минимальный
 *  набор), пробелы схлопываются. Для выдержки адреса (раздел, подраздел). */
export function htmlToText(html: string): string {
  return squash(
    (html ?? "")
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|li|tr|h[1-6]|br)\s*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, "&"),
  );
}

/** Выдержка «как было»: обычный текст, не длиннее ADDRESS_EXCERPT_MAX
 *  (обрезка по границе слова, с «…»). */
export function excerptOf(text: string, max: number = ADDRESS_EXCERPT_MAX): string {
  const t = squash(text ?? "");
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}

/**
 * Обычный текст пользователя (комментарий, поле рецензии, замечание):
 * переводы строк — LF, управляющие символы кроме \n и \t сняты, хвостовые
 * пробелы строк и крайние пустые строки сняты, три и более пустых строки
 * схлопнуты до одной (абзацы — по пустой строке). HTML НЕ разбирается и не
 * вырезается: «<» в философском тексте законен, экранирует показ клиент.
 */
export function plainText(input: string): string {
  return (input ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ── Адрес и его состояние ───────────────────────────────────────────── */

/** Объект, как его видит индекс концепции: ключ, id, содержимое, версия. */
export interface AddressableObject {
  kind: AddressKind;
  key: string;
  id: string | null;
  /** Каноническое содержимое — то, что хэшируется */
  payload: unknown;
  /** Текст для выдержки */
  text: string;
  version: number | null;
}

/** Адрес объекта на момент записи. */
export async function buildAddress(obj: AddressableObject): Promise<DiscussionAddress> {
  return {
    kind: obj.kind,
    key: obj.key,
    id: obj.id,
    hash: await contentHash(obj.kind, obj.payload),
    version: obj.version,
  };
}

/** Состояние адреса против найденного ТЕКУЩЕГО объекта (null — не найден
 *  ни по id, ни по ключу). Хэш у synthesis пуст с обеих сторон — current. */
export function resolutionOf(
  addr: DiscussionAddress,
  current: { id: string | null; hash: string; version: number | null } | null,
): AddressResolution {
  if (!current) return { state: "deleted", currentId: null, currentHash: null, currentVersion: null };
  return {
    state: current.hash === addr.hash ? "current" : "outdated",
    currentId: current.id,
    currentHash: current.hash,
    currentVersion: current.version,
  };
}

/** Проверка формы адреса из БД/запроса (jsonb мог записать более новая версия). */
export function isDiscussionAddress(v: unknown): v is DiscussionAddress {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a["kind"] === "string" &&
    typeof a["key"] === "string" &&
    (a["id"] === null || typeof a["id"] === "string") &&
    typeof a["hash"] === "string" &&
    (a["version"] === null || typeof a["version"] === "number")
  );
}
