/**
 * Поиск концепций — запрос (беседа 18.1; врезка «Фаза 18» в 07; 03 §2.21).
 *
 * Один запрос на три списка каталога (`mine` | `shared` | `public`):
 * структурные фильтры + текст в одном из четырёх полей. Права смотрящего —
 * SQL-зеркало модуля прав (`searchScopeSql`, `searchReadLevelSql` из
 * services/capabilities) — вычисляются по строкам syntheses и
 * synthesis_members В МОМЕНТ ЗАПРОСА; в индексе (`synthesis_search`) прав
 * нет, и строка индекса сама ничего не открывает.
 *
 * Что открыто тексту — по уровню чтения концепции (shared
 * SEARCH_FIELDS_BY_LEVEL):
 *   full     — название, зерно, содержание (капсула + категории + термины),
 *              точный термин;
 *   showcase — название, зерно, капсула: ВИТРИНА ПО КАТЕГОРИЯМ И ТЕРМИНАМ
 *              НЕ ИЩЕТСЯ (иначе поиск — обход закрытого содержания);
 *   none     — только название (приглашённый в приватную концепцию).
 *
 * Текст ищется словарями: запрос разбирается ВСЕМИ словарями поиска
 * (russian, english, german, simple) и объединяется через «или» — язык
 * запроса неизвестен, а каждый документ несёт лексемы своего словаря и
 * simple. Словарь ничего не нашёл — запасной ход по триграммам
 * (`word_similarity`, опечатки). Поле `term` — точное совпадение без
 * регистра с термином глоссария либо с его именем без хвостовой скобки.
 *
 * Тезисы и тексты разделов не ищутся: их нет в индексе (search-index.ts),
 * и этот модуль таблиц тезисов и разделов не читает (сторож 4br).
 */
import { sql } from "../db/index.js";
import {
  searchReadLevelSql,
  searchScopeSql,
  type SqlFragment,
} from "./capabilities.js";
import {
  HIT_START,
  HIT_STOP,
  clipParts,
  escapeLike,
  fuzzyParts,
  hasHit,
  queryWords,
  splitHeadline,
  substringParts,
} from "../utils/search-text.js";
import {
  SEARCH_FUZZY_THRESHOLD,
  SEARCH_TS_CONFIGS,
  type SearchField,
  type SearchMatchKind,
  type SearchPhilArea,
  type SearchPhilMode,
  type SearchReadLevel,
  type SearchScope,
  type SearchSort,
} from "@philosynth/shared/constants/search";
import type { MemberRole, MemberStatus } from "@philosynth/shared/constants/discussion";
import type { SearchFragment, SearchTermHit } from "@philosynth/shared/types/search";

/** Разобранные и проверенные параметры поиска (проверяет роут). */
export interface SearchParams {
  scope: SearchScope;
  /** Текст запроса (обрезан, без краевых пробелов); пусто — только фильтры */
  q: string;
  field: SearchField;
  philosophers: string[];
  philMode: SearchPhilMode;
  philArea: SearchPhilArea;
  /** Имена философов выбранных эпох (объединение); пусто — фильтра нет */
  epochPhilosophers: string[];
  method: string | null;
  synthLevel: string | null;
  /** Глубина проработки (18.2, Д-89); null — фильтра нет */
  depth: string | null;
  lang: string | null;
  meta: boolean | null;
  /** id видимых потомков концепции X; null — фильтра нет */
  descendantIds: string[] | null;
  status: string | null;
  /** Границы created_at: ISO-строки (to — исключающая) */
  dateFrom: string | null;
  dateTo: string | null;
  sort: SearchSort;
  orderDesc: boolean;
  page: number;
  limit: number;
}

/** Что найдено по одной концепции. */
export interface SearchHit {
  id: string;
  level: SearchReadLevel;
  fragment?: SearchFragment;
  term?: SearchTermHit;
  myRole?: MemberRole;
  myStatus?: MemberStatus;
}

export interface SearchResult {
  /** Найденные концепции страницы — в порядке выдачи */
  hits: SearchHit[];
  total: number;
  match: SearchMatchKind | null;
}

/**
 * Имя термина без хвостовой скобки-пояснения, в нижнем регистре — то же
 * выражение, что индекс `idx_glossary_term_base` (schema.ts, миграция
 * 0020; сторож 4br сверяет три места). Документ пишет «Имя (пояснение)»
 * одной ячейкой, человек ищет по имени.
 */
export const GLOSSARY_TERM_BASE_SQL =
  "lower(btrim(regexp_replace(g.term, '[[:space:]]*[(][^()]*[)][[:space:]]*$', '')))";

/** Параметры `ts_headline`: маркеры-управляющие символы, один отрывок. */
const HEADLINE_OPTS = `StartSel=${HIT_START}, StopSel=${HIT_STOP}, MaxWords=34, MinWords=14, ShortWord=2, MaxFragments=1`;
const HEADLINE_ALL = `StartSel=${HIT_START}, StopSel=${HIT_STOP}, HighlightAll=true`;

const and = (conds: SqlFragment[]): SqlFragment =>
  conds.length === 0 ? sql`true` : conds.reduce((a, b) => sql`${a} AND ${b}`);
const or = (conds: SqlFragment[]): SqlFragment =>
  conds.length === 0 ? sql`false` : conds.reduce((a, b) => sql`${a} OR ${b}`);

/** Действующая строка родословной на позиции (правило приоритета 15.1). */
const LIVE_ROW = sql`((l.parent_type = 'philosopher' AND coalesce(l.parent_name, '') <> '') OR (l.parent_type = 'synthesis' AND l.parent_synthesis_id IS NOT NULL))`;

/**
 * «Мета-синтез» — SQL-зеркало ОДНОГО правила `isMetaSynthesisRows`
 * (lineage-service, 15.1): живая связь-концепция в БД ЛИБО неперекрытый
 * узел-концепция верхнего уровня дерева файла. Сторож 5az сверяет с
 * `loadConceptParentFlags` на живых строках.
 */
export const META_SYNTHESIS_SQL = sql`(
  EXISTS (SELECT 1 FROM synthesis_lineage l
          WHERE l.synthesis_id = s.id AND l.parent_type = 'synthesis' AND l.parent_synthesis_id IS NOT NULL)
  OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(s.file_genealogy -> 'participants') = 'array'
                THEN s.file_genealogy -> 'participants' ELSE '[]'::jsonb END
         ) WITH ORDINALITY AS fp(node, ord)
    WHERE fp.node ->> 'type' = 'concept'
      AND NOT EXISTS (SELECT 1 FROM synthesis_lineage l
                      WHERE l.synthesis_id = s.id AND l.position = fp.ord - 1 AND ${LIVE_ROW})
  )
)`;

/**
 * Пары «концепция — философ-предок» по всей родословной (транзитивно,
 * глубина ≤ 10) — тот же обход, что `searchByPhilosophers`
 * (`/lineage/search`, 3.1): строки synthesis_lineage; дерево
 * импортированного файла (`file_genealogy`) обход не видит, как и там.
 */
const ANC_CTE = sql`anc AS (
  SELECT sl.synthesis_id AS root_id, sl.parent_type, sl.parent_name, sl.parent_synthesis_id, 1 AS depth
  FROM synthesis_lineage sl
  UNION ALL
  SELECT a.root_id, sl.parent_type, sl.parent_name, sl.parent_synthesis_id, a.depth + 1
  FROM synthesis_lineage sl
  JOIN anc a ON sl.synthesis_id = a.parent_synthesis_id
  WHERE a.parent_type = 'synthesis' AND a.depth < 10
)`;

/** Условие «среди философов концепции есть названные». */
function philosophersCond(names: string[], mode: SearchPhilMode, area: SearchPhilArea): SqlFragment {
  const uniq = [...new Set(names)];
  if (uniq.length === 0) return sql`true`;
  if (area === "lineage") {
    const having = mode === "all" ? sql`count(DISTINCT a.parent_name) = ${uniq.length}` : sql`count(DISTINCT a.parent_name) >= 1`;
    return sql`s.id IN (
      SELECT a.root_id FROM anc a
      WHERE a.parent_type = 'philosopher' AND a.parent_name IN ${sql(uniq)}
      GROUP BY a.root_id HAVING ${having})`;
  }
  const direct = (list: string[]): SqlFragment => sql`EXISTS (
    SELECT 1 FROM synthesis_lineage l
    WHERE l.synthesis_id = s.id AND l.parent_type = 'philosopher' AND l.parent_name IN ${sql(list)})`;
  if (mode === "any") return direct(uniq);
  return and(uniq.map((n) => direct([n])));
}

/** Фильтры и список — условия на `syntheses s` (без текста). */
function baseConditions(p: SearchParams, userId: string | null): SqlFragment {
  const conds: SqlFragment[] = [searchScopeSql(p.scope, userId)];
  if (p.philosophers.length > 0) conds.push(philosophersCond(p.philosophers, p.philMode, p.philArea));
  // эпоха: у концепции есть хотя бы один философ выбранных эпох (в той же области)
  if (p.epochPhilosophers.length > 0) conds.push(philosophersCond(p.epochPhilosophers, "any", p.philArea));
  if (p.method) conds.push(sql`s.method = ${p.method}`);
  if (p.synthLevel) conds.push(sql`s.synth_level = ${p.synthLevel}`);
  if (p.depth) conds.push(sql`s.depth = ${p.depth}`);
  if (p.lang) conds.push(sql`lower(s.lang) = lower(${p.lang})`);
  if (p.status) conds.push(sql`s.status = ${p.status}`);
  if (p.meta !== null) conds.push(p.meta ? META_SYNTHESIS_SQL : sql`NOT ${META_SYNTHESIS_SQL}`);
  if (p.descendantIds !== null) {
    conds.push(p.descendantIds.length > 0 ? sql`s.id IN ${sql(p.descendantIds)}` : sql`false`);
  }
  if (p.dateFrom) conds.push(sql`s.created_at >= ${p.dateFrom}::timestamptz`);
  if (p.dateTo) conds.push(sql`s.created_at < ${p.dateTo}::timestamptz`);
  return and(conds);
}

/** Запрос всеми словарями поиска, объединённый «или» (язык запроса неизвестен). */
function unionTsQuery(q: string): SqlFragment {
  return SEARCH_TS_CONFIGS.map((cfg) => sql`websearch_to_tsquery(${cfg}::regconfig, ${q})`).reduce(
    (a, b) => sql`${a} || ${b}`,
  );
}

type MatchMode = "none" | "fts" | "fuzzy" | "exact";

/** Условие текста и вес совпадения для поля и способа поиска. Работает над
 *  `base b` (строка syntheses + `lvl`), `synthesis_search ss` и `q.tsq`. */
function textMatch(p: SearchParams, mode: MatchMode): { cond: SqlFragment; rank: SqlFragment } {
  if (mode === "none") return { cond: sql`true`, rank: sql`0::real` };
  if (mode === "exact") {
    const lq = p.q.toLowerCase();
    return {
      // точный термин — только там, где глоссарий смотрящему открыт
      cond: sql`b.lvl = 'full' AND EXISTS (
        SELECT 1 FROM glossary_terms g
        WHERE g.synthesis_id = b.id AND (lower(g.term) = ${lq} OR ${sql.unsafe(GLOSSARY_TERM_BASE_SQL)} = ${lq}))`,
      rank: sql`1::real`,
    };
  }
  if (mode === "fts") {
    switch (p.field) {
      case "title": {
        const like = `%${escapeLike(p.q)}%`;
        return {
          // словарь ИЛИ подстрока названия (прежний смысл ?search= каталогов);
          // подстрока работает и без строки индекса
          cond: sql`(ss.title_tsv @@ q.tsq OR b.title ILIKE ${like})`,
          rank: sql`(coalesce(ts_rank(ss.title_tsv, q.tsq), 0) + CASE WHEN b.title ILIKE ${like} THEN 0.5 ELSE 0 END)::real`,
        };
      }
      case "seed":
        return {
          cond: sql`b.lvl <> 'none' AND ss.seed_tsv @@ q.tsq`,
          rank: sql`coalesce(ts_rank(ss.seed_tsv, q.tsq), 0)::real`,
        };
      case "content":
        return {
          // витрина — только капсула; категории и термины — при полном чтении
          cond: sql`((b.lvl = 'full' AND ss.content_tsv @@ q.tsq) OR (b.lvl = 'showcase' AND ss.capsule_tsv @@ q.tsq))`,
          rank: sql`coalesce(ts_rank(CASE WHEN b.lvl = 'full' THEN ss.content_tsv ELSE ss.capsule_tsv END, q.tsq), 0)::real`,
        };
      default:
        return { cond: sql`false`, rank: sql`0::real` };
    }
  }
  // fuzzy: каждое слово запроса похоже на какое-то место текста
  const words = queryWords(p.q);
  if (words.length === 0) return { cond: sql`false`, rank: sql`0::real` };
  const sum = (exprs: SqlFragment[]): SqlFragment => exprs.reduce((a, b) => sql`${a} + ${b}`);
  switch (p.field) {
    case "title":
      return {
        cond: and(words.map((w) => sql`${w} <% b.title`)),
        rank: sql`(${sum(words.map((w) => sql`word_similarity(${w}, b.title)`))})::real`,
      };
    case "seed":
      return {
        cond: sql`b.lvl <> 'none' AND ${and(words.map((w) => sql`${w} <% b.seed`))}`,
        rank: sql`(${sum(words.map((w) => sql`word_similarity(${w}, b.seed)`))})::real`,
      };
    case "content":
      return {
        cond: and(
          words.map(
            (w) => sql`((b.lvl IN ('full', 'showcase') AND ${w} <% ss.capsule_text) OR (b.lvl = 'full' AND ${w} <% ss.elements_text))`,
          ),
        ),
        rank: sql`(${sum(
          words.map(
            (w) => sql`greatest(word_similarity(${w}, coalesce(ss.capsule_text, '')), CASE WHEN b.lvl = 'full' THEN word_similarity(${w}, coalesce(ss.elements_text, '')) ELSE 0 END)`,
          ),
        )})::real`,
      };
    default:
      return { cond: sql`false`, rank: sql`0::real` };
  }
}

const SORT_SQL: Record<Exclude<SearchSort, "relevance">, SqlFragment> = {
  createdAt: sql`b.created_at`,
  updatedAt: sql`b.updated_at`,
  title: sql`b.title`,
  method: sql`b.method`,
  status: sql`b.status`,
};

interface PageRow {
  id: string;
  lvl: SearchReadLevel;
  total: number;
}

type Runner = typeof sql;

/** Одна попытка: страница + общее число. */
async function runPage(
  run: Runner,
  p: SearchParams,
  userId: string | null,
  mode: MatchMode,
): Promise<{ rows: PageRow[]; total: number }> {
  const m = textMatch(p, mode);
  const dir = p.orderDesc ? sql`DESC` : sql`ASC`;
  const order =
    p.sort === "relevance"
      ? mode === "none"
        ? sql`b.created_at DESC, b.id`
        : sql`rank DESC, b.created_at DESC, b.id`
      : sql`${SORT_SQL[p.sort]} ${dir}, b.id`;
  const from = sql`
    FROM base b
    LEFT JOIN synthesis_search ss ON ss.synthesis_id = b.id
    CROSS JOIN q
    WHERE ${m.cond}`;
  const withs = sql`
    WITH RECURSIVE ${ANC_CTE},
    q AS (SELECT ${mode === "fts" ? unionTsQuery(p.q) : sql`''::tsquery`} AS tsq),
    base AS (
      SELECT s.id, s.title, s.seed, s.method, s.status, s.created_at, s.updated_at,
             ${searchReadLevelSql(userId)} AS lvl
      FROM syntheses s
      WHERE ${baseConditions(p, userId)}
    )`;
  const rows = await run<PageRow[]>`
    ${withs}
    SELECT b.id, b.lvl, ${m.rank} AS rank, (count(*) OVER ())::int AS total
    ${from}
    ORDER BY ${order}
    LIMIT ${p.limit} OFFSET ${(p.page - 1) * p.limit}`;
  if (rows.length > 0) return { rows: [...rows], total: rows[0]?.total ?? rows.length };
  if (p.page === 1) return { rows: [], total: 0 };
  // страница за пределами выдачи: общее число — отдельным счётом
  const [cnt] = await run<{ n: number }[]>`${withs} SELECT count(*)::int AS n ${from}`;
  return { rows: [], total: cnt?.n ?? 0 };
}

/* ── Фрагменты выдачи ────────────────────────────────────────────────── */

interface FtsFragRow {
  id: string;
  headline: string | null;
  capsule_hit: boolean | null;
  capsule_headline: string | null;
  term_id: string | null;
  term: string | null;
  term_headline: string | null;
  category_headline: string | null;
}

/**
 * Подсветка в два прохода: словарём документа (он же выбирает отрывок), затем
 * `simple` поверх готового отрывка. Одного словаря мало: стеммер сводит не все
 * формы слова к одной основе («разлом» → «разл», «разломы» → «разлом»), и
 * строку находит пересечение основы запроса с точной формой документа —
 * подсветить его может только второй проход.
 */
function headline(cfg: SqlFragment, text: SqlFragment, opts: string): SqlFragment {
  return sql`ts_headline('simple', ts_headline(${cfg}, ${text}, q.tsq, ${opts}), q.tsq, ${HEADLINE_ALL})`;
}

/** Снять маркеры подсветки из исходного текста (в названии и зерне их быть
 *  не должно, но текст пользовательский). */
const unmarked = (col: SqlFragment): SqlFragment => sql`translate(${col}, ${HIT_START + HIT_STOP}, '  ')`;

async function ftsFragments(
  run: Runner,
  p: SearchParams,
  rows: PageRow[],
): Promise<Map<string, { fragment?: SearchFragment; term?: SearchTermHit }>> {
  const out = new Map<string, { fragment?: SearchFragment; term?: SearchTermHit }>();
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return out;
  const levels = new Map(rows.map((r) => [r.id, r.lvl]));
  const cfg = sql`coalesce(ss.config, 'simple')::regconfig`;
  const q = sql`(SELECT ${unionTsQuery(p.q)} AS tsq) q`;

  if (p.field === "title" || p.field === "seed") {
    const col = p.field === "title" ? sql`s.title` : sql`s.seed`;
    const opts = p.field === "title" ? HEADLINE_ALL : HEADLINE_OPTS;
    const frs = await run<{ id: string; headline: string | null; raw: string }[]>`
      SELECT s.id, ${headline(cfg, unmarked(col), opts)} AS headline, ${col} AS raw
      FROM syntheses s LEFT JOIN synthesis_search ss ON ss.synthesis_id = s.id CROSS JOIN ${q}
      WHERE s.id IN ${sql(ids)}`;
    for (const f of frs) {
      let parts = splitHeadline(f.headline ?? f.raw);
      // в названии есть сам запрос подстрокой (прежний ?search=) — показать её
      if (p.field === "title") {
        const sub = substringParts(f.raw, p.q);
        if (hasHit(sub)) parts = sub;
      }
      out.set(f.id, { fragment: { source: p.field, parts: clipParts(parts) } });
    }
    return out;
  }

  // content: капсула → термин (с определением) → имя категории; термин и
  // категория — только при полном чтении (витрине — одна капсула)
  const full = ids.filter((id) => levels.get(id) === "full");
  const fullIds = full.length > 0 ? sql`s.id IN ${sql(full)}` : sql`false`;
  const termVec = (text: SqlFragment): SqlFragment =>
    sql`(to_tsvector(${cfg}, ${text}) || to_tsvector('simple', ${text}))`;
  const frs = await run<FtsFragRow[]>`
    SELECT s.id,
           NULL::text AS headline,
           (ss.capsule_tsv @@ q.tsq) AS capsule_hit,
           CASE WHEN ss.capsule_tsv @@ q.tsq
                THEN ${headline(cfg, sql`ss.capsule_text`, HEADLINE_OPTS)} END AS capsule_headline,
           t.id AS term_id, t.term AS term, t.headline AS term_headline,
           c.headline AS category_headline
    FROM syntheses s
    LEFT JOIN synthesis_search ss ON ss.synthesis_id = s.id
    CROSS JOIN ${q}
    LEFT JOIN LATERAL (
      SELECT g.id, g.term,
             ${headline(cfg, sql`g.term || ' — ' || g.definition`, HEADLINE_OPTS)} AS headline
      FROM glossary_terms g
      WHERE ${fullIds} AND g.synthesis_id = s.id
        AND ${termVec(sql`g.term || ' ' || g.definition`)} @@ q.tsq
      ORDER BY (${termVec(sql`g.term`)} @@ q.tsq) DESC, g.position, g.id
      LIMIT 1
    ) t ON true
    LEFT JOIN LATERAL (
      SELECT ${headline(cfg, sql`cat.name`, HEADLINE_ALL)} AS headline
      FROM categories cat
      WHERE ${fullIds} AND cat.synthesis_id = s.id AND ${termVec(sql`cat.name`)} @@ q.tsq
      ORDER BY cat.position, cat.id
      LIMIT 1
    ) c ON true
    WHERE s.id IN ${sql(ids)}`;
  for (const f of frs) {
    const term: SearchTermHit | undefined = f.term_id && f.term ? { id: f.term_id, term: f.term } : undefined;
    if (f.capsule_hit && f.capsule_headline) {
      out.set(f.id, { fragment: { source: "capsule", parts: clipParts(splitHeadline(f.capsule_headline)) } });
    } else if (term && f.term_headline) {
      out.set(f.id, { fragment: { source: "term", parts: clipParts(splitHeadline(f.term_headline)) }, term });
    } else if (f.category_headline) {
      out.set(f.id, { fragment: { source: "category", parts: clipParts(splitHeadline(f.category_headline)) } });
    }
  }
  return out;
}

async function fuzzyFragments(
  run: Runner,
  p: SearchParams,
  rows: PageRow[],
): Promise<Map<string, { fragment?: SearchFragment }>> {
  const out = new Map<string, { fragment?: SearchFragment }>();
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return out;
  const levels = new Map(rows.map((r) => [r.id, r.lvl]));
  const words = queryWords(p.q);
  const texts = await run<{ id: string; title: string; seed: string; capsule_text: string | null; elements_text: string | null }[]>`
    SELECT s.id, s.title, s.seed, ss.capsule_text, ss.elements_text
    FROM syntheses s LEFT JOIN synthesis_search ss ON ss.synthesis_id = s.id
    WHERE s.id IN ${sql(ids)}`;
  for (const t of texts) {
    const lvl = levels.get(t.id) ?? "none";
    if (p.field === "title") {
      out.set(t.id, { fragment: { source: "title", parts: clipParts(fuzzyParts(t.title, words)) } });
    } else if (p.field === "seed" && lvl !== "none") {
      out.set(t.id, { fragment: { source: "seed", parts: clipParts(fuzzyParts(t.seed, words)) } });
    } else if (p.field === "content" && lvl !== "none") {
      const cap = fuzzyParts(t.capsule_text ?? "", words);
      if (hasHit(cap)) {
        out.set(t.id, { fragment: { source: "capsule", parts: clipParts(cap) } });
      } else if (lvl === "full") {
        // строка элементов с совпадением: «термин — определение» либо имя категории
        const line = (t.elements_text ?? "").split("\n").find((l) => hasHit(fuzzyParts(l, words)));
        if (line !== undefined) {
          out.set(t.id, {
            fragment: { source: line.includes(" — ") ? "term" : "category", parts: clipParts(fuzzyParts(line, words)) },
          });
        }
      }
    }
  }
  return out;
}

async function exactTermHits(
  run: Runner,
  p: SearchParams,
  rows: PageRow[],
): Promise<Map<string, { fragment?: SearchFragment; term?: SearchTermHit }>> {
  const out = new Map<string, { fragment?: SearchFragment; term?: SearchTermHit }>();
  const ids = rows.filter((r) => r.lvl === "full").map((r) => r.id);
  if (ids.length === 0) return out;
  const lq = p.q.toLowerCase();
  const terms = await run<{ synthesis_id: string; id: string; term: string; definition: string }[]>`
    SELECT DISTINCT ON (g.synthesis_id) g.synthesis_id, g.id, g.term, g.definition
    FROM glossary_terms g
    WHERE g.synthesis_id IN ${sql(ids)}
      AND (lower(g.term) = ${lq} OR ${sql.unsafe(GLOSSARY_TERM_BASE_SQL)} = ${lq})
    ORDER BY g.synthesis_id, (lower(g.term) = ${lq}) DESC, g.position, g.id`;
  for (const t of terms) {
    const head = substringParts(t.term, p.q);
    const parts = clipParts([
      ...(hasHit(head) ? head : [{ text: t.term, hit: true as const }]),
      ...(t.definition ? [{ text: ` — ${t.definition}` }] : []),
    ]);
    out.set(t.synthesis_id, { fragment: { source: "term", parts }, term: { id: t.id, term: t.term } });
  }
  return out;
}

/** Мои участия в найденных концепциях (список `shared`). */
async function membershipsOf(
  run: Runner,
  ids: string[],
  userId: string,
): Promise<Map<string, { role: MemberRole; status: MemberStatus }>> {
  const out = new Map<string, { role: MemberRole; status: MemberStatus }>();
  if (ids.length === 0) return out;
  const ms = await run<{ synthesis_id: string; role: MemberRole; status: MemberStatus }[]>`
    SELECT m.synthesis_id, m.role, m.status FROM synthesis_members m
    WHERE m.user_id = ${userId} AND m.synthesis_id IN ${sql(ids)}`;
  for (const m of ms) out.set(m.synthesis_id, { role: m.role, status: m.status });
  return out;
}

/**
 * Поиск концепций. `userId = null` — гость (ему открыт только список
 * `public`; роут отвечает 401 на прочие раньше, а `searchScopeSql` на
 * всякий случай отдаёт гостю пустое множество).
 */
export async function searchSyntheses(p: SearchParams, userId: string | null): Promise<SearchResult> {
  const hasText = p.q.length > 0;
  let match: SearchMatchKind | null = null;
  let page: { rows: PageRow[]; total: number };
  let extras = new Map<string, { fragment?: SearchFragment; term?: SearchTermHit }>();

  if (!hasText) {
    page = await runPage(sql, p, userId, "none");
  } else if (p.field === "term") {
    match = "exact";
    page = await runPage(sql, p, userId, "exact");
    extras = await exactTermHits(sql, p, page.rows);
  } else {
    match = "fts";
    page = await runPage(sql, p, userId, "fts");
    if (page.total > 0) {
      extras = await ftsFragments(sql, p, page.rows);
    } else if (queryWords(p.q).length > 0) {
      // словарь не нашёл ничего — запасной ход по триграммам; порог сходства —
      // настройка сеанса, поэтому в своей транзакции (SET LOCAL)
      const fuzzy = await sql.begin(async (tx) => {
        await tx`SELECT set_config('pg_trgm.word_similarity_threshold', ${String(SEARCH_FUZZY_THRESHOLD)}, true)`;
        const run = tx as unknown as Runner;
        const pg = await runPage(run, p, userId, "fuzzy");
        return { pg, ex: await fuzzyFragments(run, p, pg.rows) };
      });
      if (fuzzy.pg.total > 0) {
        match = "fuzzy";
        page = fuzzy.pg;
        extras = fuzzy.ex;
      }
    }
  }

  const ids = page.rows.map((r) => r.id);
  const mine = p.scope === "shared" && userId ? await membershipsOf(sql, ids, userId) : null;
  const hits: SearchHit[] = page.rows.map((r) => {
    const ex = extras.get(r.id);
    const m = mine?.get(r.id);
    return {
      id: r.id,
      level: r.lvl,
      ...(ex?.fragment ? { fragment: ex.fragment } : {}),
      ...(ex?.term ? { term: ex.term } : {}),
      ...(m ? { myRole: m.role, myStatus: m.status } : {}),
    };
  });
  return { hits, total: page.total, match };
}
