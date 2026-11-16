/**
 * Индекс поиска концепций — пересчёт (беседа 18.1; врезка «Фаза 18» в 07;
 * 02 §2.42).
 *
 * ОДНА функция свежести — `reindexSynthesis(id)`: собирает документ индекса
 * из текущего состояния базы (название, зерно, язык, капсула, имена
 * категорий, термины и определения глоссария) и переписывает строку
 * `synthesis_search`. Её зовут ВСЕ писатели этих данных сразу после своей
 * записи (перечень — «По факту 18.1» п.0, сторож 4br сверяет); триггеров
 * по документу нет — решение пользователя.
 *
 * Тезисы и тексты разделов в индекс НЕ входят (решение пользователя):
 * `INDEXED_TABLES` ниже — закрытый список источников, сторож 4br красит
 * любое упоминание таблиц тезисов и разделов в этом модуле.
 *
 * Почему «сразу после записи», а не в транзакции писателя:
 *  - писатели разнородны: часть пишет без транзакции (проход генерации,
 *    побочные эффекты раздела, импорт с ручным откатом), часть — своей
 *    транзакцией внутри чужого конвейера (`saveGraphToDb`); общего
 *    исполнителя, которому можно передать индекс, у них нет;
 *  - пересчёт читает ИТОГ и идемпотентен: любой следующий вызов (или
 *    `npm run search:reindex`) приводит строку к состоянию базы, порядок
 *    вызовов не важен;
 *  - сбой пересчёта не должен ронять правку: внутри транзакции любая
 *    ошибка INSERT переводит её в aborted (09 §3, 9.1) — понадобилась бы
 *    точка сохранения в каждом из двух десятков мест.
 * Цена: между фиксацией записи и пересчётом поиск миг видит прежнее
 * состояние, а при падении процесса в этот миг — до следующей записи в ту
 * же концепцию либо до `npm run search:reindex`.
 *
 * `reindexSynthesis` НИКОГДА не бросает: сбой — строка журнала сервера
 * (`[search-index]`) и ответ `false`.
 *
 * Лист графа импортов: только db и html-parser — писатели любого слоя
 * (graph-parser, element-parser, element-editor, generation-service, роуты)
 * импортируют его без циклов.
 */
import { sql } from "../db/index.js";
import { innerTextTrimmed, parseFragment } from "../utils/html-parser.js";
import {
  searchTsConfigFor,
  type SearchTsConfig,
} from "@philosynth/shared/constants/search";

/** Таблицы-источники индекса (закрытый список; сторож 4br). Тезисы и
 *  разделы сюда не входят намеренно. */
export const INDEXED_TABLES = ["syntheses", "categories", "glossary_terms"] as const;

/** Что читается из базы для документа индекса. */
export interface SearchIndexSource {
  title: string;
  seed: string;
  lang: string;
  capsuleHtml: string;
  /** Имена категорий в порядке таблицы */
  categories: string[];
  /** Термины глоссария в порядке таблицы */
  terms: { term: string; definition: string }[];
}

/** Документ индекса: тексты, из которых SQL строит tsvector. */
export interface SearchIndexDocument {
  config: SearchTsConfig;
  title: string;
  seed: string;
  /** Капсула без разметки и без заголовка раздела */
  capsuleText: string;
  /** Имена категорий, по строке на категорию */
  categoriesText: string;
  /** Термины (без определений), по строке на термин */
  termsText: string;
  /** Определения терминов, по строке на термин */
  definitionsText: string;
  /** Имена категорий и «термин — определение» — для фрагмента и триграмм */
  elementsText: string;
}

/** Управляющие символы (в том числе маркеры подсветки \u0001–\u0003 и NUL,
 *  которого PostgreSQL в тексте не принимает) → пробел; пробельные серии
 *  внутри строки схлопываются. Переводы строк сохраняются — по ним текст
 *  делится на элементы. */
export function cleanIndexText(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .split("\n")
    .map((line) => line.replace(/[  \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/** Одна строка без переводов строк (имя, термин, определение). */
function oneLine(s: string | null | undefined): string {
  return cleanIndexText(s).replace(/\n+/g, " ");
}

/**
 * Капсула без разметки: текст `[data-section="Капсула"]` (либо
 * `.doc-content`, либо всего фрагмента) без заголовка `<h4>` и ведущего
 * слова «Капсула» — те же правила выбора, что у `extractCapsuleText`
 * (context-extractor, порт исходника [11720]); сюда он не импортируется,
 * чтобы модуль остался листом (тот тянет реестр промптов и Redis).
 */
export function capsulePlainText(capsuleHtml: string | null | undefined): string {
  if (!capsuleHtml || !capsuleHtml.trim()) return "";
  const root = parseFragment(capsuleHtml);
  const target =
    root.querySelector('[data-section="Капсула"]') ??
    root.querySelector(".doc-content") ??
    root;
  const h4 = target.querySelector("h4");
  const h4Text = h4 ? innerTextTrimmed(h4) : "";
  let text = innerTextTrimmed(target);
  if (h4Text && text.startsWith(h4Text)) text = text.slice(h4Text.length);
  return cleanIndexText(text.replace(/^\s*Капсула\s*/i, ""));
}

/** Документ индекса из источника — чистая функция (её сверяет сторож). */
export function buildSearchDocument(src: SearchIndexSource): SearchIndexDocument {
  const categories = src.categories.map(oneLine).filter(Boolean);
  const terms = src.terms
    .map((t) => ({ term: oneLine(t.term), definition: oneLine(t.definition) }))
    .filter((t) => t.term || t.definition);
  const elements = [
    ...categories,
    ...terms.map((t) => (t.definition ? `${t.term} — ${t.definition}` : t.term)),
  ];
  return {
    config: searchTsConfigFor(src.lang),
    title: oneLine(src.title),
    seed: cleanIndexText(src.seed),
    capsuleText: capsulePlainText(src.capsuleHtml),
    categoriesText: categories.join("\n"),
    termsText: terms.map((t) => t.term).filter(Boolean).join("\n"),
    definitionsText: terms.map((t) => t.definition).filter(Boolean).join("\n"),
    elementsText: elements.join("\n"),
  };
}

/** Источник документа из базы; null — синтеза нет. */
export async function loadSearchSource(synthesisId: string): Promise<SearchIndexSource | null> {
  const [row] = await sql<{ title: string; seed: string; lang: string; capsule_html: string }[]>`
    SELECT title, seed, lang, capsule_html FROM syntheses WHERE id = ${synthesisId}
  `;
  if (!row) return null;
  const cats = await sql<{ name: string }[]>`
    SELECT name FROM categories WHERE synthesis_id = ${synthesisId} ORDER BY position, created_at, id
  `;
  const terms = await sql<{ term: string; definition: string }[]>`
    SELECT term, definition FROM glossary_terms WHERE synthesis_id = ${synthesisId} ORDER BY position, created_at, id
  `;
  return {
    title: row.title,
    seed: row.seed,
    lang: row.lang,
    capsuleHtml: row.capsule_html,
    categories: cats.map((c) => c.name),
    terms: terms.map((t) => ({ term: t.term, definition: t.definition })),
  };
}

/**
 * Записать строку индекса: tsvector строит PostgreSQL — словарём документа
 * плюс `simple` (у документа на `simple` — один раз). Веса: имена категорий
 * и термины — A, капсула — B, определения — C; название — A, зерно — B.
 * Синтеза нет (удалён, пока шла запись) — строка индекса снимается.
 * БРОСАЕТ при сбое — для писателей есть `reindexSynthesis`.
 */
export async function writeSearchIndex(synthesisId: string): Promise<"indexed" | "missing"> {
  const src = await loadSearchSource(synthesisId);
  if (!src) {
    await sql`DELETE FROM synthesis_search WHERE synthesis_id = ${synthesisId}`;
    return "missing";
  }
  const d = buildSearchDocument(src);
  /** to_tsvector словарём документа + simple, с весом */
  const vec = (text: string, weight: "A" | "B" | "C") =>
    d.config === "simple"
      ? sql`setweight(to_tsvector('simple', ${text}), ${weight}::"char")`
      : sql`(setweight(to_tsvector(${d.config}::regconfig, ${text}), ${weight}::"char") || setweight(to_tsvector('simple', ${text}), ${weight}::"char"))`;
  await sql`
    INSERT INTO synthesis_search AS ss
      (synthesis_id, config, title_tsv, seed_tsv, capsule_tsv, content_tsv, capsule_text, elements_text, indexed_at)
    SELECT s.id, ${d.config},
           ${vec(d.title, "A")},
           ${vec(d.seed, "B")},
           ${vec(d.capsuleText, "B")},
           ${vec(d.categoriesText, "A")} || ${vec(d.termsText, "A")} || ${vec(d.capsuleText, "B")} || ${vec(d.definitionsText, "C")},
           ${d.capsuleText}, ${d.elementsText}, now()
    FROM syntheses s WHERE s.id = ${synthesisId}
    ON CONFLICT (synthesis_id) DO UPDATE SET
      config = EXCLUDED.config,
      title_tsv = EXCLUDED.title_tsv,
      seed_tsv = EXCLUDED.seed_tsv,
      capsule_tsv = EXCLUDED.capsule_tsv,
      content_tsv = EXCLUDED.content_tsv,
      capsule_text = EXCLUDED.capsule_text,
      elements_text = EXCLUDED.elements_text,
      indexed_at = EXCLUDED.indexed_at
  `;
  return "indexed";
}

/* ── Точка, которую зовут писатели ───────────────────────────────────── */

type IndexWriter = (synthesisId: string) => Promise<unknown>;
let indexWriter: IndexWriter = writeSearchIndex;

/**
 * Разъём для тестов свежести («сбой пересчёта не роняет правку»): подменить
 * исполнителя записи индекса; `null` возвращает настоящий. В службе не
 * зовётся.
 */
export function setSearchIndexWriter(fn: IndexWriter | null): void {
  indexWriter = fn ?? writeSearchIndex;
}

/**
 * Пересчитать индекс поиска концепции. Зовётся писателем СРАЗУ ПОСЛЕ его
 * записи (после фиксации его транзакции). Не бросает: сбой пересчёта
 * операцию писателя не роняет — строка журнала сервера, ответ `false`
 * (поиск до следующего пересчёта видит прежнее состояние концепции; полная
 * починка — `npm run search:reindex`).
 */
export async function reindexSynthesis(synthesisId: string): Promise<boolean> {
  try {
    await indexWriter(synthesisId);
    return true;
  } catch (err) {
    console.error(
      `[search-index] пересчёт индекса поиска концепции ${synthesisId} не удался — правка сохранена, поиск видит прежнее состояние (починка: npm run search:reindex):`,
      err,
    );
    return false;
  }
}

/* ── Полный пересчёт (начальное наполнение и починка) ────────────────── */

export interface ReindexAllOptions {
  /** Только концепции без строки индекса */
  onlyMissing?: boolean;
  /** Ничего не писать — только посчитать */
  dry?: boolean;
  /** Одна концепция */
  synthesisId?: string;
}

export interface ReindexAllResult {
  total: number;
  indexed: number;
  skipped: number;
  failed: { id: string; message: string }[];
  /** Строк индекса у несуществующих концепций (CASCADE их не оставляет —
   *  число для отчёта, всегда 0 на целой базе) */
  orphans: number;
}

/**
 * Пересчитать индекс всех концепций (либо одной / только недостающих) той
 * же функцией, что зовут писатели. Идемпотентен. Используется
 * `scripts/maintenance/reindex-search.ts` (`npm run search:reindex`):
 * начальное наполнение после миграции 0020 и починка после сбоя пересчёта.
 */
export async function reindexAll(opts: ReindexAllOptions = {}): Promise<ReindexAllResult> {
  const rows = opts.synthesisId
    ? await sql<{ id: string; indexed: boolean }[]>`
        SELECT s.id, (ss.synthesis_id IS NOT NULL) AS indexed
        FROM syntheses s LEFT JOIN synthesis_search ss ON ss.synthesis_id = s.id
        WHERE s.id = ${opts.synthesisId}`
    : await sql<{ id: string; indexed: boolean }[]>`
        SELECT s.id, (ss.synthesis_id IS NOT NULL) AS indexed
        FROM syntheses s LEFT JOIN synthesis_search ss ON ss.synthesis_id = s.id
        ORDER BY s.created_at, s.id`;
  const res: ReindexAllResult = { total: rows.length, indexed: 0, skipped: 0, failed: [], orphans: 0 };
  for (const r of rows) {
    if (opts.onlyMissing && r.indexed) {
      res.skipped += 1;
      continue;
    }
    if (opts.dry) {
      res.indexed += 1;
      continue;
    }
    try {
      await writeSearchIndex(r.id);
      res.indexed += 1;
    } catch (err) {
      res.failed.push({ id: r.id, message: err instanceof Error ? err.message : String(err) });
    }
  }
  const [orph] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM synthesis_search ss
    WHERE NOT EXISTS (SELECT 1 FROM syntheses s WHERE s.id = ss.synthesis_id)`;
  res.orphans = orph?.n ?? 0;
  return res;
}
