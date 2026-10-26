/**
 * Видимые заголовки подразделов и разделов (беседа 14.2, Д-59).
 *
 * До 14.2 интерфейс вокруг документа (оглавление, кнопки подразделов карточки
 * раздела, панель точечной перегенерации, «Подраздел …» в редакторе элемента,
 * адреса рекомендаций) показывал имена подразделов ключами `data-section` —
 * по-русски при любом языке генерации, тогда как сам документ несёт видимый
 * `<h4>` на языке генерации. Решение пользователя (2026-10-13 — «как проще и
 * надёжнее»): показывать видимый заголовок самого документа. Сервер отдаёт
 * рядом с `subsections` карту `subsectionTitles` (ключ → текст `<h4>` без ⏫ и
 * якорей; нет `<h4>` — ключ) и `sectionTitle` (текст `.section-title`); этот
 * модуль — единственный путь от ключа к подписи. Ключи остаются машинными:
 * сравнения, адреса, data-атрибуты, якоря (`subsectionSlugId`) не меняются.
 * Перевода ключей по таблице (tData) нет — подпись совпадает с телом документа.
 *
 * Хук `useSubsectionTitle` подписан на сводки хранилища (перерисовка при
 * перезагрузке разделов); `subsectionTitleFrom` — чистая форма для мест, где
 * карта уже под рукой (ответ сервера, пропсы).
 */
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";
import { tData } from "@philosynth/shared/i18n/data";

import { useSynthesisStore } from "../stores/synthesis-store";

import type { SectionFull, SectionSummary } from "@philosynth/shared/types/section";

type TitledSection = Pick<SectionSummary, "key" | "subsectionTitles"> | Pick<SectionFull, "key" | "subsectionTitles">;

/** Подпись подраздела по карте раздела; нет карты или имени в ней — ключ. */
export function subsectionTitleFrom(
  titles: Record<string, string> | null | undefined,
  name: string,
): string {
  const t = titles?.[name];
  return typeof t === "string" && t.trim() ? t : name;
}

/** Подпись подраздела по списку сводок/разделов (ключ раздела + ключ подраздела). */
export function subsectionTitleIn(
  list: readonly TitledSection[],
  sectionKey: string,
  name: string,
): string {
  const s = list.find((x) => x.key === sectionKey);
  return subsectionTitleFrom(s?.subsectionTitles, name);
}

/** Нереактивная форма — для кода вне рендера (обработчики, утилиты). */
export function subsectionTitle(sectionKey: string, name: string): string {
  const st = useSynthesisStore.getState();
  const fromSummaries = st.summaries.find((x) => x.key === sectionKey)?.subsectionTitles;
  const fromSections = st.sections.find((x) => x.key === sectionKey)?.subsectionTitles;
  return subsectionTitleFrom(fromSummaries ?? fromSections, name);
}

/** Хук: (sectionKey, name) → видимый заголовок; подписан на сводки хранилища. */
export function useSubsectionTitle(): (sectionKey: string, name: string) => string {
  const summaries = useSynthesisStore((s) => s.summaries);
  const sections = useSynthesisStore((s) => s.sections);
  return (sectionKey, name) =>
    subsectionTitleFrom(
      summaries.find((x) => x.key === sectionKey)?.subsectionTitles ??
        sections.find((x) => x.key === sectionKey)?.subsectionTitles,
      name,
    );
}

/**
 * Имя раздела для оглавления РЯДОМ С ТЕЛОМ документа: видимый `.section-title`
 * (язык генерации), нет — `tData(KEY_LABELS)` на языке интерфейса, как прежде.
 * Прочий интерфейс (карточки, панели, модалки) остаётся на `tData(KEY_LABELS)`.
 */
export function documentSectionTitle(summary: Pick<SectionSummary, "key" | "sectionTitle" | "title">): string {
  if (summary.sectionTitle && summary.sectionTitle.trim()) return summary.sectionTitle;
  return tData((KEY_LABELS as Record<string, string>)[summary.key] ?? summary.title ?? summary.key);
}
