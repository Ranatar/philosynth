/**
 * Фрагмент выдачи поиска с подсветкой совпадения. Беседа 18.2 (п. 3).
 *
 * Сервер (18.1) отдаёт фрагмент КУСКАМИ ТЕКСТА `{ text, hit? }`, не
 * разметкой. Здесь каждый кусок — текстовый узел React (экранируется сам);
 * совпадение — в <mark>. Вставки произвольного HTML нет и быть не должно:
 * в капсуле, термине и определении лежит текст документа, а его пишут
 * модель и пользователи (сторож 4bs; урок 9.2).
 */
import type { SearchFragmentSource } from "@philosynth/shared/constants/search";
import type { SearchFragment } from "@philosynth/shared/types/search";
import { tl } from "@philosynth/shared/i18n/t";

/** Откуда взят фрагмент — подписью */
export function fragmentSourceLabel(source: SearchFragmentSource): string {
  switch (source) {
    case "title":
      return tl("catalog.searchFragment.sourceTitle", "название");
    case "seed":
      return tl("catalog.searchFragment.sourceSeed", "зерно");
    case "capsule":
      return tl("catalog.searchFragment.sourceCapsule", "капсула");
    case "category":
      return tl("catalog.searchFragment.sourceCategory", "категория");
    case "term":
      return tl("catalog.searchFragment.sourceTerm", "термин");
  }
}

export interface SearchFragmentViewProps {
  fragment: SearchFragment;
  /** Найдено запасным ходом (опечатка): совпадение — «похожее», не точное */
  fuzzy?: boolean | undefined;
}

export function SearchFragmentView({ fragment, fuzzy = false }: SearchFragmentViewProps) {
  const hitCls = fuzzy ? "search-hit fuzzy" : "search-hit";
  return (
    <div className="search-fragment" data-testid="card-fragment" data-source={fragment.source}>
      <span className="search-fragment-source">
        {fragmentSourceLabel(fragment.source)}
        {fuzzy ? tl("catalog.searchFragment.fuzzySuffix", " · похожее") : ""}
      </span>
      <span className="search-fragment-text" dir="auto">
        {fragment.parts.map((part, i) =>
          part.hit ? (
            <mark key={i} className={hitCls} data-testid="search-hit">
              {part.text}
            </mark>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </span>
    </div>
  );
}
