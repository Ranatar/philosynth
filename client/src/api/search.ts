/**
 * API поиска концепций. Беседа 18.2 (клиент маршрута 18.1, 03 §2.21).
 *
 *  - searchSyntheses → GET /syntheses/search — один маршрут на три списка
 *    каталога (свои / со мной поделились / публичные): текст в одном из
 *    четырёх полей, фильтры, страницы. Путь ГОСТЕВОЙ в пределах списка
 *    `public` (optionalAuth; гость с иным списком → 401).
 *
 * Строку запроса собирает сериализатор состояния каталога
 * (`utils/catalog-search.searchQueryString`) — тот же, что пишет адресную
 * строку: параметры повторяются (`philosopher`, `epoch`), поэтому словарь
 * `query` обёртки `apiGet` сюда не годится.
 */
import type { SynthesisSearchResponse } from "@philosynth/shared/types/search";

import { searchQueryString, type CatalogSearchState } from "../utils/catalog-search";
import { apiGet } from "./client";

export function searchSyntheses(state: CatalogSearchState): Promise<SynthesisSearchResponse> {
  return apiGet<SynthesisSearchResponse>(`/syntheses/search?${searchQueryString(state)}`);
}
