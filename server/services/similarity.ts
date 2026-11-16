/**
 * Похожие концепции — сервис (беседа 18.3; 03 §2.22).
 *
 * Считает НА ЗАПРОС: признаки концепции → предотбор кандидатов одним
 * запросом → точная мера по не более чем SIMILAR_CANDIDATE_CAP кандидатам
 * (ядро — services/similarity-score.ts) → N лучших с причинами. Попарные
 * меры в БД не хранятся; эмбеддингов и переводов терминов нет.
 *
 * ПРАВА. Кандидаты — концепции, видимые смотрящему по правилам поиска 18.1:
 * три списка (`searchScopeSql`: свои, «со мной», публичные) и уровень
 * чтения (`searchReadLevelSql`) — обе функции из services/capabilities,
 * своих сравнений с владельцем здесь нет. Уровень `none` (приглашённый, не
 * принявший приглашение) кандидатом не становится: концепцию он ещё не
 * читает.
 *
 * СОДЕРЖАНИЕ. Термины и категории читаются только у концепций, чьё
 * содержание смотрящему открыто (уровень `full`), и только одного языка
 * генерации с исходной. У витрины — и у кандидата, и у самой исходной
 * концепции — эти таблицы НЕ ЧИТАЮТСЯ вовсе: запросы к `glossary_terms` и
 * `categories` идут по спискам id, куда витрина не попадает. Тезисы и
 * разделы не читаются ни у кого (решение 18.1: в поиск входят капсула,
 * имена категорий и термины).
 *
 * КЛЮЧ ТЕРМИНА И КАТЕГОРИИ — лексемы имени словарём языка документа
 * (`searchTsConfigFor`, тот же словарь, что строит индекс 18.1): «Бытие» и
 * «бытия» сходятся, порядок слов не важен. Имя термина — без хвостовой
 * скобки-пояснения (`GLOSSARY_TERM_BASE_SQL`, как поиск по термину).
 * Лексемы берутся из таблиц элементов, а не из tsvector индекса: в индексе
 * имена категорий, термины и определения слиты в один вектор и по
 * элементам неразличимы.
 *
 * РОДОСЛОВНАЯ — общим обходом Д-88 (services/lineage-walk через
 * `loadLineageWalk` и те же выражения ключа): строки БД и дерево файла с
 * правилом приоритета 15.1.
 */
import type postgres from "postgres";

import { sql } from "../db/index.js";
import { searchReadLevelSql, searchScopeSql } from "./capabilities.js";
import {
  LINEAGE_WALK_KEY_SQL,
  LINEAGE_WALK_NAMED_SQL,
  loadLineageWalk,
  type LineageWalkRow,
} from "./lineage-service.js";
import { lineageWalkCte } from "./lineage-walk.js";
import { GLOSSARY_TERM_BASE_SQL } from "./search.js";
import { scoreSimilarity, type SimilarityFeatures } from "./similarity-score.js";
import { PHILOSOPHER_EPOCHS } from "@philosynth/shared/constants/philosophers";
import { searchTsConfigFor } from "@philosynth/shared/constants/search";
import {
  SIMILAR_CANDIDATE_CAP,
  SIMILAR_REASON_ITEMS_MAX,
  similarityGradeOf,
  type SimilarityGrade,
  type SimilarityTextSkipReason,
} from "@philosynth/shared/constants/similarity";
import type { SimilarAncestor, SimilarityReasons } from "@philosynth/shared/types/similarity";

type SqlFragment = postgres.PendingQuery<postgres.Row[]>;

/** Исходная концепция — то, что маршрут уже прочёл и проверил. */
export interface SimilarSource {
  id: string;
  lang: string;
  method: string;
  synthLevel: string;
  /** Содержание смотрящему открыто (не витрина) */
  contentOpen: boolean;
}

export interface SimilarHit {
  id: string;
  grade: SimilarityGrade;
  reasons: SimilarityReasons;
  textCompared: boolean;
  textSkipped?: SimilarityTextSkipReason;
}

export interface SimilarResult {
  /** По убыванию меры */
  hits: SimilarHit[];
  capped: boolean;
}

/* ── эпохи философов ─────────────────────────────────────────────────── */

let epochIndex: Map<string, number[]> | null = null;
function epochsOf(names: Iterable<string>): Set<number> {
  if (!epochIndex) {
    epochIndex = new Map();
    PHILOSOPHER_EPOCHS.forEach((e, i) => {
      for (const p of e.philosophers) epochIndex!.set(p, [...(epochIndex!.get(p) ?? []), i]);
    });
  }
  const out = new Set<number>();
  for (const n of names) for (const i of epochIndex.get(n) ?? []) out.add(i);
  return out;
}

/* ── видимость: правила поиска 18.1 ──────────────────────────────────── */

/** Условие на `syntheses s`: концепция смотрящему видна (см. шапку). */
function visibleSql(userId: string | null): SqlFragment {
  return sql`(${searchScopeSql("mine", userId)} OR ${searchScopeSql("shared", userId)} OR ${searchScopeSql("public", userId)})
    AND (${searchReadLevelSql(userId)}) <> 'none'`;
}

/* ── признаки текста ─────────────────────────────────────────────────── */

/** Лексемы строки словарём `cfg` одной строкой — ключ сравнения. */
const lexKey = (cfg: string, text: SqlFragment): SqlFragment =>
  sql`array_to_string(tsvector_to_array(to_tsvector(${cfg}::regconfig, ${text})), ' ')`;
const TERM_BASE = sql.unsafe(GLOSSARY_TERM_BASE_SQL) as unknown as SqlFragment;
const TERM_LABEL = sql`btrim(regexp_replace(g.term, '[[:space:]]*[(][^()]*[)][[:space:]]*$', ''))`;
const CATEGORY_BASE = sql`lower(btrim(cat.name))`;

interface TextKeys {
  /** ключ → имя для показа */
  terms: Map<string, string>;
  categories: Map<string, string>;
}

/**
 * Ключи терминов и имён категорий концепций `ids` словарём `cfg`.
 * Вызывающий обязан передать ТОЛЬКО концепции с открытым содержанием
 * (сторож 4bt/5ba): у витрины эти таблицы не читаются.
 */
async function loadTextKeys(ids: readonly string[], cfg: string): Promise<Map<string, TextKeys>> {
  const out = new Map<string, TextKeys>();
  if (ids.length === 0) return out;
  const rows = await sql<{ id: string; kind: "t" | "c"; key: string; label: string }[]>`
    SELECT g.synthesis_id AS id, 't' AS kind, ${lexKey(cfg, TERM_BASE)} AS key, min(${TERM_LABEL}) AS label
    FROM glossary_terms g WHERE g.synthesis_id IN ${sql([...ids])}
    GROUP BY 1, 3
    UNION ALL
    SELECT cat.synthesis_id, 'c', ${lexKey(cfg, CATEGORY_BASE)}, min(btrim(cat.name))
    FROM categories cat WHERE cat.synthesis_id IN ${sql([...ids])}
    GROUP BY 1, 3`;
  for (const r of rows) {
    if (!r.key) continue; // одни стоп-слова — сравнивать нечем
    let e = out.get(r.id);
    if (!e) out.set(r.id, (e = { terms: new Map(), categories: new Map() }));
    (r.kind === "t" ? e.terms : e.categories).set(r.key, r.label);
  }
  return out;
}

/* ── признаки родословной ────────────────────────────────────────────── */

interface LineageFeatures {
  philDirect: Set<string>;
  philLineage: Set<string>;
  kin: Set<string>;
  /** ключ предка-концепции → строка обхода (имя, id) */
  ancestors: Map<string, LineageWalkRow>;
}

const selfKeyOf = (id: string): string => `id:${id}`;

function lineageFeatures(id: string, rows: readonly LineageWalkRow[]): LineageFeatures {
  const f: LineageFeatures = {
    philDirect: new Set(),
    philLineage: new Set(),
    kin: new Set([selfKeyOf(id)]),
    ancestors: new Map(),
  };
  for (const r of rows) {
    if (r.kind === "philosopher") {
      f.philLineage.add(r.key);
      if (r.depth === 1) f.philDirect.add(r.key);
    } else {
      f.kin.add(r.key);
      f.ancestors.set(r.key, r);
    }
  }
  return f;
}

function groupByRoot(rows: readonly LineageWalkRow[]): Map<string, LineageWalkRow[]> {
  const m = new Map<string, LineageWalkRow[]>();
  for (const r of rows) {
    const list = m.get(r.rootId);
    if (list) list.push(r);
    else m.set(r.rootId, [r]);
  }
  return m;
}

/* ── предотбор кандидатов ────────────────────────────────────────────── */

interface CandidateRow {
  id: string;
  lvl: "full" | "showcase";
  same_lang: boolean;
  method: string;
  synth_level: string;
}

const textArray = (xs: Iterable<string>): SqlFragment => sql`${sql.array([...xs])}::text[]`;

/**
 * Кандидаты: видимые смотрящему концепции, у которых с исходной есть хотя
 * бы один общий содержательный элемент (философ родословной, предок либо
 * прямое родство, термин, категория), — не более `cap + 1` с наибольшим
 * числом общего. Термины и категории здесь сравниваются только у
 * кандидатов уровня `full` того же языка — и только когда содержание
 * исходной открыто (`text` передан).
 */
async function preselect(
  source: SimilarSource,
  userId: string | null,
  lin: LineageFeatures,
  text: { cfg: string; keys: TextKeys } | null,
  cap: number,
): Promise<CandidateRow[]> {
  const kinKeys = textArray(lin.kin);
  const phils = textArray(lin.philLineage);
  const txt: SqlFragment =
    text && (text.keys.terms.size > 0 || text.keys.categories.size > 0)
      ? sql`
        SELECT x.id, count(DISTINCT x.kind || ':' || x.key)::int AS n
        FROM (
          SELECT g.synthesis_id AS id, 't' AS kind, ${lexKey(text.cfg, TERM_BASE)} AS key
          FROM glossary_terms g JOIN cand c ON c.id = g.synthesis_id
          WHERE c.lvl = 'full' AND c.same_lang
          UNION ALL
          SELECT cat.synthesis_id, 'c', ${lexKey(text.cfg, CATEGORY_BASE)}
          FROM categories cat JOIN cand c ON c.id = cat.synthesis_id
          WHERE c.lvl = 'full' AND c.same_lang
        ) x
        WHERE (x.kind = 't' AND x.key = ANY(${textArray(text.keys.terms.keys())}))
           OR (x.kind = 'c' AND x.key = ANY(${textArray(text.keys.categories.keys())}))
        GROUP BY x.id`
      : sql`SELECT NULL::uuid AS id, 0 AS n WHERE false`;
  return sql<CandidateRow[]>`
    WITH RECURSIVE cand AS MATERIALIZED (
      SELECT s.id, s.method::text AS method, s.synth_level::text AS synth_level,
             (${searchReadLevelSql(userId)}) AS lvl,
             (lower(btrim(s.lang)) = lower(btrim(${source.lang}))) AS same_lang
      FROM syntheses s
      WHERE s.id <> ${source.id} AND ${visibleSql(userId)}
    ),
    ${lineageWalkCte(sql`s.id IN (SELECT id FROM cand)`)},
    lin AS (
      SELECT w.root_id AS id, count(DISTINCT w.kind || ':' || ${LINEAGE_WALK_KEY_SQL})::int AS n
      FROM walk w
      WHERE w.depth > 0 AND ${LINEAGE_WALK_NAMED_SQL}
        AND ((w.kind = 'philosopher' AND w.name = ANY(${phils}))
          OR (w.kind = 'concept' AND ${LINEAGE_WALK_KEY_SQL} = ANY(${kinKeys})))
      GROUP BY w.root_id
    ),
    txt AS (${txt})
    SELECT c.id, c.lvl, c.same_lang, c.method, c.synth_level
    FROM cand c
    LEFT JOIN lin ON lin.id = c.id
    LEFT JOIN txt ON txt.id = c.id
    CROSS JOIN LATERAL (
      SELECT coalesce(lin.n, 0) + coalesce(txt.n, 0)
             + CASE WHEN ('id:' || c.id::text) = ANY(${kinKeys}) THEN 1 ELSE 0 END AS n
    ) common
    WHERE common.n > 0
    ORDER BY common.n DESC, c.id
    LIMIT ${cap + 1}`;
}

/** Какие из концепций `ids` смотрящему видны (для ссылок на предков). */
async function visibleAmong(ids: readonly string[], userId: string | null): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await sql<{ id: string }[]>`
    SELECT s.id FROM syntheses s WHERE s.id IN ${sql([...ids])} AND ${visibleSql(userId)}`;
  return new Set(rows.map((r) => r.id));
}

/* ── выдача ──────────────────────────────────────────────────────────── */

const EMPTY_TEXT: TextKeys = { terms: new Map(), categories: new Map() };

export async function findSimilar(
  source: SimilarSource,
  userId: string | null,
  limit: number,
  cap: number = SIMILAR_CANDIDATE_CAP,
): Promise<SimilarResult> {
  const cfg = searchTsConfigFor(source.lang);

  /* 1. признаки исходной концепции */
  const srcLin = lineageFeatures(source.id, await loadLineageWalk([source.id]));
  // содержание исходной закрыто (витрина) — её термины и категории не читаются
  const srcText = source.contentOpen ? ((await loadTextKeys([source.id], cfg)).get(source.id) ?? EMPTY_TEXT) : null;
  const srcFeatures: SimilarityFeatures = {
    selfKey: selfKeyOf(source.id),
    philDirect: srcLin.philDirect,
    philLineage: srcLin.philLineage,
    kin: srcLin.kin,
    terms: new Set(srcText?.terms.keys() ?? []),
    categories: new Set(srcText?.categories.keys() ?? []),
    epochs: epochsOf(srcLin.philLineage),
    method: source.method,
    synthLevel: source.synthLevel,
  };

  /* 2. предотбор */
  const pre = await preselect(source, userId, srcLin, srcText ? { cfg, keys: srcText } : null, cap);
  const capped = pre.length > cap;
  const cands = capped ? pre.slice(0, cap) : pre;
  if (cands.length === 0) return { hits: [], capped };

  /* 3. признаки кандидатов: родословная — у всех; текст — только у тех,
   *    чьё содержание открыто и язык тот же */
  const walks = groupByRoot(await loadLineageWalk(cands.map((c) => c.id)));
  const textOk = (c: CandidateRow): boolean => srcText !== null && c.lvl === "full" && c.same_lang;
  const texts = await loadTextKeys(cands.filter(textOk).map((c) => c.id), cfg);

  /* 4. мера */
  const scored: { cand: CandidateRow; lin: LineageFeatures; res: ReturnType<typeof scoreSimilarity>; grade: SimilarityGrade }[] = [];
  for (const c of cands) {
    const lin = lineageFeatures(c.id, walks.get(c.id) ?? []);
    const comparable = textOk(c);
    const t = comparable ? (texts.get(c.id) ?? EMPTY_TEXT) : EMPTY_TEXT;
    const res = scoreSimilarity(
      srcFeatures,
      {
        selfKey: selfKeyOf(c.id),
        philDirect: lin.philDirect,
        philLineage: lin.philLineage,
        kin: lin.kin,
        terms: new Set(t.terms.keys()),
        categories: new Set(t.categories.keys()),
        epochs: epochsOf(lin.philLineage),
        method: c.method,
        synthLevel: c.synth_level,
      },
      comparable,
    );
    const grade = similarityGradeOf(res.score);
    if (!res.evidence || !grade) continue;
    scored.push({ cand: c, lin, res, grade });
  }
  scored.sort((x, y) => y.res.score - x.res.score || (x.cand.id < y.cand.id ? -1 : 1));
  const top = scored.slice(0, limit);

  /* 5. причины. Предок со строкой в БД называется, только если он
   *    смотрящему виден (как pruneInvisible у родословной): название
   *    чужой приватной концепции причиной не раскрывается */
  const ancestorIds = new Set<string>();
  for (const s of top) {
    for (const k of s.res.shared.kin) {
      const row = srcLin.ancestors.get(k);
      if (row?.synthesisId) ancestorIds.add(row.synthesisId);
    }
  }
  const visible = await visibleAmong([...ancestorIds], userId);

  const hits: SimilarHit[] = top.map(({ cand, lin, res, grade }) => {
    const candKey = selfKeyOf(cand.id);
    const direct = new Set(res.shared.philDirect);
    const common = res.shared.kin.filter((k) => k !== srcFeatures.selfKey && k !== candKey);
    const ancestors: SimilarAncestor[] = [];
    for (const k of common) {
      const row = srcLin.ancestors.get(k);
      if (!row || !row.label) continue;
      if (row.synthesisId) {
        if (visible.has(row.synthesisId)) ancestors.push({ id: row.synthesisId, title: row.label });
      } else {
        ancestors.push({ title: row.label }); // снимок из дерева файла исходной: имя узла, без ссылки
      }
    }
    const textCompared = textOk(cand);
    const termLabels = res.shared.terms.map((k) => srcText?.terms.get(k) ?? "").filter(Boolean);
    const catLabels = res.shared.categories.map((k) => srcText?.categories.get(k) ?? "").filter(Boolean);
    return {
      id: cand.id,
      grade,
      textCompared,
      ...(textCompared ? {} : { textSkipped: cand.same_lang ? ("closed" as const) : ("language" as const) }),
      reasons: {
        philosophers: res.shared.philDirect,
        lineagePhilosophers: res.shared.philLineage.filter((p) => !direct.has(p)),
        ancestors: ancestors.slice(0, SIMILAR_REASON_ITEMS_MAX),
        ancestorsTotal: common.length,
        kin: srcLin.kin.has(candKey) ? "ancestor" : lin.kin.has(srcFeatures.selfKey) ? "descendant" : null,
        terms: termLabels.slice(0, SIMILAR_REASON_ITEMS_MAX),
        termsTotal: termLabels.length,
        categories: catLabels.slice(0, SIMILAR_REASON_ITEMS_MAX),
        categoriesTotal: catLabels.length,
        epochs: res.shared.epochs,
        method: res.method,
        synthLevel: res.synthLevel,
      },
    };
  });
  return { hits, capped };
}
