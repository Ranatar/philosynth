/**
 * Строка поиска каталога с выбором поля. Беседа 18.2 (п. 1).
 *
 * Поле текста — одно из четырёх (маршрут 18.1): название / зерно /
 * содержание (капсула, имена категорий, термины с определениями; тезисов и
 * текстов разделов в индексе нет) / термин глоссария (точно, без регистра).
 * Компонент — только ввод: дебаунс и адресную строку ведёт CatalogPage.
 */
import { SEARCH_FIELDS, SEARCH_QUERY_MAX, type SearchField } from "@philosynth/shared/constants/search";
import { tl } from "@philosynth/shared/i18n/t";

/** Подпись поля поиска */
export function searchFieldLabel(field: SearchField): string {
  switch (field) {
    case "title":
      return tl("catalog.catalogSearchBar.fieldTitle", "название");
    case "seed":
      return tl("catalog.catalogSearchBar.fieldSeed", "зерно");
    case "content":
      return tl("catalog.catalogSearchBar.fieldContent", "содержание");
    case "term":
      return tl("catalog.catalogSearchBar.fieldTerm", "термин");
  }
}

/** Подсказка в строке ввода — что именно ищет выбранное поле */
export function searchFieldPlaceholder(field: SearchField): string {
  switch (field) {
    case "title":
      return tl("catalog.catalogSearchBar.placeholderTitle", "Поиск по названию…");
    case "seed":
      return tl("catalog.catalogSearchBar.placeholderSeed", "Поиск по зерну концепции…");
    case "content":
      return tl("catalog.catalogSearchBar.placeholderContent", "Капсула, категории, термины и их определения…");
    case "term":
      return tl("catalog.catalogSearchBar.placeholderTerm", "Термин глоссария целиком…");
  }
}

export interface CatalogSearchBarProps {
  /** Набранный текст (до дебаунса) */
  value: string;
  field: SearchField;
  onValue: (value: string) => void;
  onField: (field: SearchField) => void;
}

export function CatalogSearchBar({ value, field, onValue, onField }: CatalogSearchBarProps) {
  return (
    <div className="catalog-search" data-testid="catalog-search">
      <select
        className="form-select catalog-search-field"
        value={field}
        onChange={(e) => onField(e.target.value as SearchField)}
        aria-label={tl("catalog.catalogSearchBar.fieldAria", "Где искать")}
        data-testid="catalog-search-field"
      >
        {SEARCH_FIELDS.map((f) => (
          <option key={f} value={f}>
            {searchFieldLabel(f)}
          </option>
        ))}
      </select>
      <input
        type="search"
        className="form-input catalog-search-input"
        value={value}
        maxLength={SEARCH_QUERY_MAX}
        onChange={(e) => onValue(e.target.value)}
        placeholder={searchFieldPlaceholder(field)}
        aria-label={tl("catalog.catalogSearchBar.inputAria", "Текст поиска")}
        data-testid="catalog-search-input"
      />
    </div>
  );
}
