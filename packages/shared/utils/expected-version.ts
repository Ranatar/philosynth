/**
 * Ожидаемая версия правки (беседа 17.1; врезка «Фаза 17»): клиент шлёт, к
 * какому состоянию объекта он писал правку; сервер сверяет и при расхождении
 * отвечает 409 VERSION_CONFLICT с текущим значением — «последний
 * перезаписал» исключён.
 *
 * У элемента (категория, связь, тезис, термин) ожидание — НОМЕР ВЕРСИИ
 * (`max(element_versions.version)`, 0 — версий не было). У раздела,
 * подраздела и капсулы — ХЭШ СОДЕРЖИМОГО, тот же, что у адреса Фазы 16
 * (`contentHash` от разметки со схлопнутыми пробелами): клиент считает его
 * этой же функцией от текста, который показал человеку (исходник правки
 * подраздела, `capsuleHtml`), сервер — от сохранённого.
 */
import { contentHash } from "./discussion-address.js";

/** Разметка для хэша: пробельные серии — один пробел (как у адресов 16.1). */
export function normalizeHtmlForHash(html: string): string {
  return html.replace(/\s+/g, " ").trim();
}

/** Хэш содержимого раздела / капсулы (вид адреса `section`). */
export function sectionContentHash(html: string): Promise<string> {
  return contentHash("section", { html: normalizeHtmlForHash(html) });
}

/** Хэш содержимого подраздела: разметка БЕЗ обёртки data-section и без <h4>
 *  — то, что отдаёт GET …/subsections/:name (вид адреса `subsection`). */
export function subsectionContentHash(sourceHtml: string): Promise<string> {
  return contentHash("subsection", { html: normalizeHtmlForHash(sourceHtml) });
}

/** Что сервер кладёт в details ответа 409 VERSION_CONFLICT. */
export interface VersionConflictDetails {
  /** "kind:elementId" | "sectionKey" | "sectionKey:подраздел" | "capsule" */
  target: string;
  expected: { version?: number; hash?: string };
  current: { version?: number; hash?: string | null };
}
