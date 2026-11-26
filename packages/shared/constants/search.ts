/**
 * Поиск концепций (беседа 18.1; врезка «Фаза 18» в 07) — закрытые списки и
 * пределы, общие серверу и клиенту 18.2.
 *
 * Один маршрут `GET /syntheses/search` на три списка каталога (свои / со
 * мной поделились / публичные). Текст ищется в одном из четырёх полей;
 * содержание — капсула, имена категорий и термины глоссария с определениями
 * (тезисы и тексты разделов в индекс НЕ входят — решение пользователя).
 */
import { GEN_LANGS, genLangInfo, type GenLangSearchConfig } from "../i18n/locales.js";

/** Список каталога, в котором идёт поиск. Гостю — только `public`. */
export const SEARCH_SCOPES = ["mine", "shared", "public"] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];
export const isSearchScope = (v: unknown): v is SearchScope =>
  typeof v === "string" && (SEARCH_SCOPES as readonly string[]).includes(v);

/**
 * Поле текста: название / зерно / содержание (капсула + категории + термины)
 * / точный термин глоссария (без регистра; переход прямо к термину).
 */
export const SEARCH_FIELDS = ["title", "seed", "content", "term"] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];
export const isSearchField = (v: unknown): v is SearchField =>
  typeof v === "string" && (SEARCH_FIELDS as readonly string[]).includes(v);

/** Поле по умолчанию, когда текст задан, а поле — нет. */
export const SEARCH_DEFAULT_FIELD: SearchField = "title";

/** Философы: все названные / любой из названных. */
export const SEARCH_PHIL_MODES = ["all", "any"] as const;
export type SearchPhilMode = (typeof SEARCH_PHIL_MODES)[number];

/** Философы: прямые участники синтеза / вся родословная (транзитивно). */
export const SEARCH_PHIL_AREAS = ["direct", "lineage"] as const;
export type SearchPhilArea = (typeof SEARCH_PHIL_AREAS)[number];

/**
 * Сортировки: пять прежних колонок каталога (`GET /syntheses`, 1.6) плюс
 * `relevance` — по весу совпадения; без текста `relevance` ≡ `createdAt`.
 */
export const SEARCH_SORTS = ["relevance", "createdAt", "updatedAt", "title", "method", "status"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

/**
 * Как найдено: `fts` — словарём (словоформы), `fuzzy` — запасным ходом по
 * триграммам (опечатки), когда словарь не нашёл ничего; `exact` — точный
 * термин. Без текста — null.
 */
export const SEARCH_MATCH_KINDS = ["fts", "fuzzy", "exact"] as const;
export type SearchMatchKind = (typeof SEARCH_MATCH_KINDS)[number];

/** Откуда взят фрагмент выдачи. */
export const SEARCH_FRAGMENT_SOURCES = ["title", "seed", "capsule", "category", "term"] as const;
export type SearchFragmentSource = (typeof SEARCH_FRAGMENT_SOURCES)[number];

/**
 * Что смотрящему открыто для поиска ПО ТЕКСТУ в данной концепции:
 *  - `full`     — владелец, действующий участник либо ступень `full`: все поля;
 *  - `showcase` — витрина невладельцу: название, зерно и капсула (их отдаёт
 *                 `GET /syntheses/:id`); категории и термины закрыты;
 *  - `none`     — приватная концепция приглашённому, ещё не принявшему
 *                 приглашение (он есть в «Со мной поделились»): только название.
 */
export const SEARCH_READ_LEVELS = ["full", "showcase", "none"] as const;
export type SearchReadLevel = (typeof SEARCH_READ_LEVELS)[number];

/** Поля текста, открытые на каждом уровне чтения. */
export const SEARCH_FIELDS_BY_LEVEL: Readonly<Record<SearchReadLevel, readonly SearchField[]>> = {
  full: ["title", "seed", "content", "term"],
  showcase: ["title", "seed", "content"],
  none: ["title"],
};

/**
 * Словарь полнотекстового поиска PostgreSQL по языку генерации
 * (`syntheses.lang`). С 2026-11-26 выводится из таблицы языков генерации
 * (shared/i18n/locales GEN_LANGS, поле `search`): морфология snowball есть у
 * русского, английского, немецкого, французского, итальянского, испанского,
 * португальского и арабского; у прочих (китайский, японский, фарси, латынь,
 * древнегреческий, вэньянь, санскрит) — только `simple` (слова как есть).
 * Каждый документ индекса несёт лексемы СВОЕГО словаря плюс `simple`;
 * запрос разбирается всеми словарями (язык запроса неизвестен).
 */
export const SEARCH_TS_CONFIGS = [
  "russian",
  "english",
  "german",
  "french",
  "italian",
  "spanish",
  "portuguese",
  "arabic",
  "simple",
] as const;
export type SearchTsConfig = (typeof SEARCH_TS_CONFIGS)[number];
export const SEARCH_TS_FALLBACK: SearchTsConfig = "simple";

/** Таблица GEN_LANGS не может назвать словарь, которого нет в SEARCH_TS_CONFIGS. */
const _searchConfigsCover: GenLangSearchConfig extends SearchTsConfig ? true : never = true;
void _searchConfigsCover;

export const SEARCH_TS_CONFIG_BY_LANG: Readonly<Record<string, SearchTsConfig>> = Object.fromEntries(
  GEN_LANGS.filter((l) => l.search !== null).map((l) => [l.value, l.search as SearchTsConfig]),
);

/** Словарь по языку генерации (без регистра); неизвестный язык — `simple`. */
export function searchTsConfigFor(lang: string | null | undefined): SearchTsConfig {
  return genLangInfo(lang)?.search ?? SEARCH_TS_FALLBACK;
}

/** Пределы запроса. */
export const SEARCH_QUERY_MAX = 200;
export const SEARCH_PHILOSOPHERS_MAX = 20;
export const SEARCH_PAGE_DEFAULT = 20;
export const SEARCH_PAGE_MAX = 100;
/** Знаков текста вокруг совпадения во фрагменте выдачи. */
export const SEARCH_FRAGMENT_CHARS = 220;

/**
 * Порог сходства слова запроса с текстом для запасного хода по триграммам
 * (pg_trgm word_similarity). Умолчание PostgreSQL 0.6 одну опечатку в слове
 * из 8–10 букв с другим окончанием не пропускает («диолектика» против
 * «диалектики» — 0.43); посторонние слова на живом документе дают 0.14–0.17.
 * Запасной ход включается, только когда словарь не нашёл ничего.
 */
export const SEARCH_FUZZY_THRESHOLD = 0.4;
/** Слова короче этого в запасном ходе не участвуют (триграмм слишком мало). */
export const SEARCH_FUZZY_MIN_WORD = 3;
