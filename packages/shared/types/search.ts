/**
 * Поиск концепций (беседа 18.1) — DTO маршрута `GET /syntheses/search`
 * (03 §2.21). Клиент — беседа 18.2.
 */
import type { MemberRole, MemberStatus } from "../constants/discussion.js";
import type {
  SearchField,
  SearchFragmentSource,
  SearchMatchKind,
  SearchPhilArea,
  SearchPhilMode,
  SearchScope,
  SearchSort,
} from "../constants/search.js";
import type { SynthesisPreview } from "./synthesis.js";

/**
 * Кусок фрагмента: обычный текст; `hit` — совпадение (клиент рисует его
 * подсветкой). HTML здесь нет и быть не должно: фрагмент показывается
 * экранированным текстом (09 §2, 9.2).
 */
export interface SearchFragmentPart {
  text: string;
  hit?: true;
}

/** Фрагмент выдачи с местом совпадения. */
export interface SearchFragment {
  source: SearchFragmentSource;
  parts: SearchFragmentPart[];
}

/** Найденный термин глоссария — для перехода прямо к нему в документе. */
export interface SearchTermHit {
  id: string;
  term: string;
}

/** Строка выдачи: превью каталога + где и как найдено. */
export interface SynthesisSearchItem extends SynthesisPreview {
  /** Фрагмент с совпадением; без текста запроса поля нет */
  fragment?: SearchFragment;
  /** Термин глоссария: у поля `term` — найденный точно; у поля `content` —
   *  когда совпадение пришлось на термин либо его определение */
  term?: SearchTermHit;
  /** Только в списке `shared`: моя роль и статус участия (как у
   *  `GET /syntheses/shared`, 16.2) */
  myRole?: MemberRole;
  myStatus?: MemberStatus;
}

/** Параметры запроса так, как их понял сервер (эхо — для адресной строки
 *  клиента 18.2 и для отладки). */
export interface SynthesisSearchQueryEcho {
  scope: SearchScope;
  q: string;
  field: SearchField | null;
  philosophers: string[];
  philMode: SearchPhilMode;
  philArea: SearchPhilArea;
  epochs: number[];
  method: string | null;
  synthLevel: string | null;
  /** Глубина проработки (18.2, Д-89) */
  depth: string | null;
  lang: string | null;
  meta: boolean | null;
  descendantsOf: string | null;
  status: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  sort: SearchSort;
  order: "asc" | "desc";
  page: number;
  limit: number;
}

/** Ответ `GET /syntheses/search`. */
export interface SynthesisSearchResponse {
  items: SynthesisSearchItem[];
  total: number;
  /** Как найдено; null — текста в запросе нет (только фильтры) */
  match: SearchMatchKind | null;
  query: SynthesisSearchQueryEcho;
}
