/**
 * Element Parser (беседа 1.4; 02-data-model §3, 05-file-structure).
 *
 * Извлечение тезисов и терминов глоссария из HTML-ответа Claude → запись в
 * гранулярные таблицы theses / glossary_terms. Точных функций-прародителей
 * в исходнике НЕТ (там гранулярного хранения нет — только компактные
 * извлечения extractThesesSummary [8057] / extractGlossaryCompact [8021]
 * для контекста); модуль построен по СТРУКТУРАМ ТАБЛИЦ, которые предписывают
 * промпты Registry (сверено с section-templates беседы 1.2):
 *
 *  - «Сводная таблица тезисов» (section.theses.sub.table):
 *    № | Формулировка тезиса | Тип (онтол./эпистем./этич.) | Степень
 *    новизны | Связанные категории;
 *  - «Таблица определений» (section.glossary.sub.table):
 *    Термин | Принятое определение | {{glossary_col}} — доп. столбцы
 *    зависят от synth_level и складываются в extra_columns (JSONB);
 *    заголовки берутся из thead фактического HTML.
 *
 * Приёмы поиска таблиц — из extract-прародителей: тезисы — секция
 * [data-section*="Сводная таблица"] (регистронезависимо, как [8058]);
 * глоссарий — первая таблица, чей первый th содержит «термин» [8027].
 *
 * Адаптации (задокументированные отступления):
 *  - theses.justification: в сводной таблице обоснований нет (они в
 *    текстовых подразделах); заполняется best-effort. ДВЕ модели абзаца:
 *    первая — «<strong>формулировка</strong> обоснование» одним абзацем,
 *    сопоставление по формулировке; вторая (12.2, Д-36 — так пишет живой
 *    документ) — блок «<h5>Тезис О-1 (…)</h5>, абзац из одной жирной
 *    формулировки, абзац «<strong>Обоснование.</strong> …»», сопоставление по
 *    МЕТКЕ тезиса в <h5> (формулировка в прозе бывает переписана
 *    относительно таблицы). Блок по метке ищется первым; иначе "";
 *  - glossary_terms.term_category: определяется best-effort по вхождению
 *    термина в категорийные подразделы после таблицы («Переопределённые
 *    термины» → 'redefined' и т.д.); не найден — '' (дефолт схемы);
 *  - saveElementsToDb — семантика ЗАМЕНЫ (как у graph-parser): прежние
 *    generated-строки синтеза удаляются; ручное редактирование — Фаза 2.
 */
import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { glossaryTerms, theses } from "../db/schema.js";
import {
  findThesisBlocks,
  innerTextTrimmed,
  parseFragment,
  thesisLabelIndex,
  type HtmlElement,
  type ThesisBlock,
} from "../utils/html-parser.js";

/* ── Типы черновиков (строки таблиц ещё без id/createdAt) ────────────── */

export type ParsedThesisType = "ontological" | "epistemological" | "ethical";

export interface ParsedThesis {
  thesisNum: number;
  /** 12.1 (Д-1): первая ячейка строки сводной таблицы, если она НЕ равна
   *  номеру («О-1», «Э-2», «1.»); null — метка совпадает с номером */
  label?: string | null | undefined;
  formulation: string;
  justification: string;
  thesisType: ParsedThesisType;
  noveltyDegree: string;
  relatedCategories: string[];
}

export interface ParsedGlossaryTerm {
  term: string;
  definition: string;
  extraColumns: Record<string, string>;
  termCategory: string;
  position: number;
}

/* ── Тезисы ──────────────────────────────────────────────────────────── */

/** «Тип (онтол./эпистем./этич.)» свободного текста → enum схемы. */
function mapThesisType(raw: string): ParsedThesisType {
  const s = raw.toLowerCase();
  if (s.includes("эпист") || s.includes("гносеол")) return "epistemological";
  if (s.includes("этич") || s.includes("аксиол")) return "ethical";
  return "ontological";
}

/** Разбор «Связанные категории»: разделители , ; / (внутри имён категорий
 *  запятых промпт не предписывает). */
function splitRelatedCategories(raw: string): string[] {
  return raw
    .split(/[,;/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * parseThesesFromHTML(html) → ParsedThesis[].
 * Секция «Сводная таблица тезисов» ищется как в extractThesesSummary
 * [8058]: [data-section*="Сводная таблица"] в обоих регистрах; внутри —
 * первая table.doc-table (fallback — любая table).
 */
export function parseThesesFromHTML(html: string): ParsedThesis[] {
  const ct = parseFragment(html);
  const sec =
    ct.querySelector('[data-section*="Сводная таблица"]') ||
    ct.querySelector('[data-section*="сводная таблица"]');
  if (!sec) return [];
  const table = sec.querySelector("table.doc-table") || sec.querySelector("table");
  if (!table) return [];

  // Индекс обоснований: <strong>формулировка</strong> текст-обоснование —
  // из тезисных подразделов (best-effort, см. шапку модуля).
  const justificationOf = buildJustificationIndex(ct);

  const result: ParsedThesis[] = [];
  let fallbackNum = 0;
  for (const tr of table.querySelectorAll("tbody tr")) {
    const td = Array.from(tr.querySelectorAll("td")).map((c) =>
      (c.textContent ?? "").trim().replace(/\s+/g, " "),
    );
    if (td.length < 2) continue;
    fallbackNum += 1;
    const formulation = td[1] || "";
    if (!formulation) continue;
    const thesisNum = parseInt(td[0] ?? "", 10) || fallbackNum;
    const label = thesisLabelOf(td[0] ?? "", thesisNum);
    result.push({
      thesisNum,
      label,
      formulation,
      justification: justificationOf(formulation, label ?? String(thesisNum)),
      thesisType: mapThesisType(td[2] || ""),
      noveltyDegree: td[3] || "",
      relatedCategories: splitRelatedCategories(td[4] || ""),
    });
  }
  return result;
}

/**
 * Метка тезиса (12.1, Д-1): документ нумерует тезисы как хочет — «О-1»,
 * «Э-2» (так пишет модель и в одностраничнике, и в службе), «1.»; parseInt
 * даёт NaN → порядковый номер либо число без хвоста. Метка хранится, только
 * когда она НЕ равна номеру: у документов с целой нумерацией колонка
 * остаётся NULL, и рендерер рисует номер, как прежде.
 */
export function thesisLabelOf(rawCell: string, thesisNum: number): string | null {
  const raw = rawCell.trim().replace(/\s+/g, " ");
  if (!raw || raw === String(thesisNum)) return null;
  return raw;
}

/** Абзац тезиса в прозе. Первая модель: «<strong>формулировка</strong>
 *  обоснование»; вторая (12.2, Д-36): блок под <h5> с меткой тезиса. */
export interface ThesisParagraph {
  /** Текст <strong>/<b> как в документе (пробелы схлопнуты); у второй модели —
   *  текст абзаца формулировки ("" — такого абзаца в блоке нет) */
  formulation: string;
  /** Текст родительского блока за вычетом формулировки; "" — блок из одной
   *  формулировки. У второй модели — абзац «Обоснование.» без жирного начала */
  justification: string;
  /** ТОЛЬКО вторая модель: текст <h5> блока — несёт метку тезиса, по ней
   *  абзац сводится с тезисом (thesisLabelIndex) */
  heading?: string | undefined;
}

/**
 * Абзацы тезисов фрагмента в порядке документа (12.1, Д-3) — модель индекса
 * обоснований 1.4, но строже: жирный фрагмент (≥ 8 знаков), С КОТОРОГО
 * НАЧИНАЕТСЯ блок, — формулировка, остальной текст блока — обоснование; один
 * блок — один абзац (выделение внутри обоснования формулировкой не считается);
 * таблицы пропускаются — их рисует рендерер 5.1. Значение обоснования
 * совпадает с тем, что для такого абзаца дал бы разбор 1.4
 * (buildJustificationIndex) — сведение после ручной правки и повторный разбор
 * не расходятся. Чистая функция.
 *
 * 12.2 (Д-36): блок ВТОРОЙ модели (под <h5>, с абзацем «Обоснование.») даёт
 * ОДИН абзац с `heading`; прочие жирные начала того же блока («Ограничения…»,
 * «Степень новизны:») абзацами тезиса не считаются — их правка ни с чем не
 * сводится и предупреждений не даёт.
 */
export function parseThesisParagraphs(html: string): ThesisParagraph[] {
  const ct = parseFragment(html);
  const out: ThesisParagraph[] = [];
  const seenParents = new Set<unknown>();
  const blocks = findThesisBlocks(ct);
  const emitted = new Set<ThesisBlock>();
  /** Блок второй модели, которому принадлежит узел (по предкам до корня) */
  const blockOf = (start: unknown): ThesisBlock | null => {
    for (
      let el = start as { parentElement?: unknown } | null | undefined;
      el && el !== (ct as unknown);
      el = el.parentElement as { parentElement?: unknown } | null | undefined
    ) {
      const hit = blocks.find((b) => b.members.has(el));
      if (hit) return hit.block;
    }
    return null;
  };
  for (const strong of ct.querySelectorAll("strong, b")) {
    const block = blocks.length ? blockOf(strong) : null;
    if (block) {
      if (!emitted.has(block)) {
        emitted.add(block);
        out.push({
          formulation: block.formulation,
          justification: block.justification,
          heading: block.heading,
        });
      }
      continue;
    }
    const formulation = (strong.textContent ?? "").trim().replace(/\s+/g, " ");
    if (formulation.length < 8) continue;
    const node = strong as unknown as {
      parentElement?: HtmlElement;
      closest(sel: string): unknown;
    };
    const parent = node.parentElement;
    if (!parent || parent === ct) continue;
    if (node.closest("table")) continue;
    if (seenParents.has(parent)) continue;
    const full = innerTextTrimmed(parent).replace(/\s+/g, " ");
    if (!full.startsWith(formulation)) continue;
    seenParents.add(parent);
    out.push({ formulation, justification: full.slice(formulation.length).trim() });
  }
  return out;
}

/**
 * Индекс «формулировка → обоснование» по <strong> тезисных подразделов
 * (Онтологические/Эпистемологические/Этические тезисы). Сопоставление —
 * нечёткое (вхождение нормализованных строк в обе стороны), в духе
 * matchNodeName graph-parser'а. 12.2 (Д-36): ПЕРВЫМ — блок второй модели по
 * метке тезиса; первая модель — как прежде, если блока с обоснованием нет.
 */
function buildJustificationIndex(
  ct: HtmlElement,
): (formulation: string, label: string) => string {
  // 12.2 (Д-36): блоки второй модели тезисных подразделов — по метке в <h5>
  const blocks: ThesisBlock[] = findThesisBlocks(ct).map((b) => b.block);
  const byLabel = (label: string): string => {
    let best = "";
    let bestIdx = Infinity;
    for (const b of blocks) {
      const i = thesisLabelIndex(b.heading, label);
      if (i >= 0 && i < bestIdx && b.justification) {
        best = b.justification;
        bestIdx = i;
      }
    }
    return best;
  };
  const pairs: { key: string; text: string }[] = [];
  for (const strong of ct.querySelectorAll(
    '[data-section*="тезисы"] strong, [data-section*="Тезисы"] strong, ' +
      '[data-section*="тезисы"] b, [data-section*="Тезисы"] b',
  )) {
    const key = (strong.textContent ?? "").trim().replace(/\s+/g, " ");
    if (key.length < 8) continue;
    // Обоснование — текст родительского блока за вычетом формулировки
    const parent = (strong as unknown as { parentElement?: HtmlElement })
      .parentElement;
    if (!parent) continue;
    const full = innerTextTrimmed(parent).replace(/\s+/g, " ");
    const text = full.startsWith(key) ? full.slice(key.length).trim() : full;
    if (text) pairs.push({ key: key.toLowerCase(), text });
  }
  return (formulation: string, label: string): string => {
    const fromBlock = byLabel(label);
    if (fromBlock) return fromBlock;
    const norm = formulation.toLowerCase().replace(/\s+/g, " ");
    const hit = pairs.find(
      (p) => p.key.includes(norm) || norm.includes(p.key),
    );
    return hit ? hit.text : "";
  };
}

/* ── Глоссарий ───────────────────────────────────────────────────────── */

/** Категорийные подразделы глоссария → term_category (схема 02 §2.10;
 *  generative-пары — по SUBSECTION_MAP_GLOSSARY [9394]). */
const GLOSSARY_CATEGORY_SECTIONS: ReadonlyArray<[string, string]> = [
  ["Переопределённые термины", "redefined"],
  ["Заимствованные термины", "borrowed"],
  ["Новые термины", "new"],
  ["Преобразованные термины", "transformed"],
  ["Эмерджентные термины", "emergent"],
  ["Термины, преодолевающие ограничения", "limit_overcoming"],
  ["Термины, порождённые проблемой", "problem_generated"],
];

/** data-section подраздела-хозяина таблицы глоссария (section.glossary.sub.table). */
export const GLOSSARY_TABLE_SECTION = "Таблица определений";

/**
 * parseGlossaryFromHTML(html) → ParsedGlossaryTerm[].
 * Таблица ищется как в extractGlossaryCompact [8027]: первая
 * table.doc-table, чей ПЕРВЫЙ th содержит «термин». Столбцы ≥2 сверх
 * «Термин | Определение» уходят в extraColumns под фактическими
 * заголовками thead (их состав задаёт level.{level}.glossary_col).
 *
 * Беседа 5.5 (долг §12, заведён 5.1): при lang ≠ Russian заголовки
 * переведены и «термин» не найдётся — поиск унифицирован с рендерером 5.1
 * (element-renderer TABLE_SUBSECTIONS.glossary): СНАЧАЛА первая таблица внутри
 * [data-section="Таблица определений"] (атрибут — константа шаблона, язык
 * его не меняет), затем прежний путь по th «термин» как запасной.
 */
export function parseGlossaryFromHTML(html: string): ParsedGlossaryTerm[] {
  const ct = parseFragment(html);
  const thsOf = (t: HtmlElement): string[] =>
    Array.from(t.querySelectorAll("thead th")).map((th) => (th.textContent ?? "").trim());
  let table: HtmlElement | null = null;
  let headers: string[] = [];
  const host = ct.querySelector(`[data-section="${GLOSSARY_TABLE_SECTION}"]`);
  const hosted = host?.querySelector("table.doc-table") ?? null;
  if (hosted && thsOf(hosted).length >= 2) {
    table = hosted;
    headers = thsOf(hosted);
  } else {
    for (const t of Array.from(ct.querySelectorAll("table.doc-table"))) {
      const ths = thsOf(t);
      if (ths.length >= 2 && (ths[0] ?? "").toLowerCase().includes("термин")) {
        table = t;
        headers = ths;
        break;
      }
    }
  }
  if (!table) return [];

  const categoryOf = buildTermCategoryIndex(ct);

  const result: ParsedGlossaryTerm[] = [];
  let position = 0;
  for (const tr of table.querySelectorAll("tbody tr")) {
    const td = Array.from(tr.querySelectorAll("td")).map((c) =>
      (c.textContent ?? "").trim().replace(/\n+/g, " ").replace(/\s{2,}/g, " "),
    );
    if (td.length < 2) continue;
    const term = td[0] || "";
    if (!term) continue;
    const extraColumns: Record<string, string> = {};
    for (let i = 2; i < td.length; i++) {
      const header = headers[i] || `col_${i}`;
      const value = td[i] || "";
      if (value) extraColumns[header] = value;
    }
    result.push({
      term,
      definition: td[1] || "",
      extraColumns,
      termCategory: categoryOf(term),
      position: position++,
    });
  }
  return result;
}

/** Индекс «термин → категория» по категорийным подразделам глоссария. */
function buildTermCategoryIndex(ct: HtmlElement): (term: string) => string {
  const buckets: { category: string; text: string }[] = [];
  for (const [sectionName, category] of GLOSSARY_CATEGORY_SECTIONS) {
    const sec = ct.querySelector(`[data-section*="${sectionName}"]`);
    if (!sec) continue;
    buckets.push({ category, text: innerTextTrimmed(sec).toLowerCase() });
  }
  return (term: string): string => {
    const norm = term.toLowerCase().trim();
    if (!norm) return "";
    const hit = buckets.find((b) => b.text.includes(norm));
    return hit ? hit.category : "";
  };
}

/* ── Запись в БД ─────────────────────────────────────────────────────── */

export interface ParsedElements {
  theses?: ParsedThesis[] | undefined;
  glossaryTerms?: ParsedGlossaryTerm[] | undefined;
}

export interface SaveElementsResult {
  thesesInserted: number;
  glossaryInserted: number;
}

/**
 * saveElementsToDb(synthesisId, sectionKey, elements): транзакционная
 * замена гранулярных элементов синтеза (по типам, присутствующим в
 * elements). sectionKey — для симметрии с 07 и будущей селективности;
 * тезисы и глоссарий в схеме привязаны к synthesisId.
 */
export async function saveElementsToDb(
  synthesisId: string,
  sectionKey: string,
  elements: ParsedElements,
): Promise<SaveElementsResult> {
  void sectionKey; // тезисы/глоссарий привязаны к синтезу (см. JSDoc)
  return db.transaction(async (tx) => {
    let thesesInserted = 0;
    if (elements.theses) {
      await tx.delete(theses).where(eq(theses.synthesisId, synthesisId));
      if (elements.theses.length > 0) {
        const rows = await tx
          .insert(theses)
          .values(
            elements.theses.map((t) => ({
              synthesisId,
              thesisNum: t.thesisNum,
              label: t.label ?? null,
              formulation: t.formulation,
              justification: t.justification,
              thesisType: t.thesisType,
              noveltyDegree: t.noveltyDegree,
              relatedCategories: t.relatedCategories,
              source: "generated",
            })),
          )
          .returning({ id: theses.id });
        thesesInserted = rows.length;
      }
    }

    let glossaryInserted = 0;
    if (elements.glossaryTerms) {
      await tx
        .delete(glossaryTerms)
        .where(eq(glossaryTerms.synthesisId, synthesisId));
      if (elements.glossaryTerms.length > 0) {
        const rows = await tx
          .insert(glossaryTerms)
          .values(
            elements.glossaryTerms.map((g) => ({
              synthesisId,
              term: g.term,
              definition: g.definition,
              extraColumns: g.extraColumns,
              termCategory: g.termCategory,
              source: "generated",
              position: g.position,
            })),
          )
          .returning({ id: glossaryTerms.id });
        glossaryInserted = rows.length;
      }
    }

    return { thesesInserted, glossaryInserted };
  });
}
