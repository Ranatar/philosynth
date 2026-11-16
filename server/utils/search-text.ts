/**
 * Чистые функции текста поиска (беседа 18.1): слова запроса, разбор
 * подсветки `ts_headline` в куски, подсветка подстроки и «похожих» слов
 * (запасной ход по триграммам), обрезка фрагмента вокруг совпадения.
 *
 * Фрагмент выдачи — массив кусков `{ text, hit? }`, НЕ разметка: клиент
 * рисует его экранированным текстом (09 §2, 9.2). Маркеры подсветки в SQL —
 * управляющие символы \u0001 / \u0002: в индексируемых текстах их нет
 * (`cleanIndexText`), из названия и зерна они снимаются перед `ts_headline`.
 */
import {
  SEARCH_FRAGMENT_CHARS,
  SEARCH_FUZZY_MIN_WORD,
  SEARCH_FUZZY_THRESHOLD,
} from "@philosynth/shared/constants/search";
import type { SearchFragmentPart } from "@philosynth/shared/types/search";

/** Маркеры начала и конца совпадения в ответе `ts_headline`. */
export const HIT_START = "\u0001";
export const HIT_STOP = "\u0002";

/** Слова запроса для запасного хода: буквы и цифры любого алфавита, в
 *  нижнем регистре, без повторов, не короче SEARCH_FUZZY_MIN_WORD. */
export function queryWords(q: string): string[] {
  const words = (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (w) => w.length >= SEARCH_FUZZY_MIN_WORD,
  );
  return [...new Set(words)];
}

/** Экранирование % и _ для ILIKE по подстроке (образец — lineage-service). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => "\\" + ch);
}

/** Слить соседние куски одного рода, выбросить пустые. */
function compact(parts: SearchFragmentPart[]): SearchFragmentPart[] {
  const out: SearchFragmentPart[] = [];
  for (const p of parts) {
    if (!p.text) continue;
    const last = out[out.length - 1];
    if (last && !!last.hit === !!p.hit) last.text += p.text;
    else out.push(p.hit ? { text: p.text, hit: true } : { text: p.text });
  }
  return out;
}

/**
 * Ответ `ts_headline` с маркерами → куски. Маркеры могут быть вложены
 * (подсветка идёт двумя проходами — словарём документа и `simple`):
 * совпадение — всё, что внутри хотя бы одной пары. Непарный маркер снят.
 */
export function splitHeadline(headline: string): SearchFragmentPart[] {
  const parts: SearchFragmentPart[] = [];
  let depth = 0;
  let buf = "";
  const flush = (hit: boolean): void => {
    if (buf) parts.push(hit ? { text: buf, hit: true } : { text: buf });
    buf = "";
  };
  for (const ch of headline) {
    if (ch === HIT_START) {
      if (depth === 0) flush(false);
      depth += 1;
    } else if (ch === HIT_STOP) {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0) flush(true);
      }
    } else buf += ch;
  }
  flush(false); // незакрытый маркер — текст без подсветки
  return compact(parts);
}

/** Есть ли в кусках хоть одно совпадение. */
export function hasHit(parts: readonly SearchFragmentPart[]): boolean {
  return parts.some((p) => p.hit === true);
}

/** Подсветка всех вхождений подстроки без учёта регистра. */
export function substringParts(text: string, needle: string): SearchFragmentPart[] {
  const n = needle.trim().toLowerCase();
  if (!n) return compact([{ text }]);
  const low = text.toLowerCase();
  // toLowerCase может менять длину строки у редких символов — тогда индексы
  // не переносятся на исходник; подсветки нет, текст цел
  if (low.length !== text.length) return compact([{ text }]);
  const parts: SearchFragmentPart[] = [];
  let from = 0;
  for (;;) {
    const i = low.indexOf(n, from);
    if (i < 0) break;
    parts.push({ text: text.slice(from, i) });
    parts.push({ text: text.slice(i, i + n.length), hit: true });
    from = i + n.length;
  }
  parts.push({ text: text.slice(from) });
  return compact(parts);
}

/** Триграммы слова по правилу pg_trgm: два пробела спереди, один сзади. */
export function trigramsOf(word: string): Set<string> {
  const padded = `  ${word.toLowerCase()} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/**
 * Сходство слова запроса со словом текста — доля триграмм запроса, найденных
 * в слове (приближение `word_similarity` pg_trgm на уровне одного слова:
 * им помечается, КАКОЕ слово текста показать совпавшим; находит строки сам
 * PostgreSQL).
 */
export function wordSimilarity(queryWord: string, textWord: string): number {
  const a = trigramsOf(queryWord);
  const b = trigramsOf(textWord);
  if (a.size === 0) return 0;
  let common = 0;
  for (const t of a) if (b.has(t)) common += 1;
  return common / a.size;
}

/** Подсветка слов текста, похожих на слова запроса (запасной ход). */
export function fuzzyParts(
  text: string,
  words: readonly string[],
  threshold: number = SEARCH_FUZZY_THRESHOLD,
): SearchFragmentPart[] {
  if (words.length === 0) return compact([{ text }]);
  const parts: SearchFragmentPart[] = [];
  let from = 0;
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const w = m[0];
    const i = m.index ?? 0;
    if (w.length < SEARCH_FUZZY_MIN_WORD) continue;
    if (!words.some((q) => wordSimilarity(q, w) >= threshold)) continue;
    parts.push({ text: text.slice(from, i) });
    parts.push({ text: w, hit: true });
    from = i + w.length;
  }
  parts.push({ text: text.slice(from) });
  return compact(parts);
}

/**
 * Обрезать фрагмент до окна вокруг ПЕРВОГО совпадения (≈ maxChars знаков,
 * по границам слов), с многоточиями на срезах. Совпадений нет — начало
 * текста.
 */
export function clipParts(
  parts: readonly SearchFragmentPart[],
  maxChars: number = SEARCH_FRAGMENT_CHARS,
): SearchFragmentPart[] {
  const total = parts.reduce((n, p) => n + p.text.length, 0);
  if (total <= maxChars) return compact(parts.map((p) => ({ ...p })));
  let hitAt = 0;
  let pos = 0;
  let found = false;
  for (const p of parts) {
    if (p.hit) {
      hitAt = pos;
      found = true;
      break;
    }
    pos += p.text.length;
  }
  const full = parts.map((p) => p.text).join("");
  let start = found ? Math.max(0, hitAt - Math.floor(maxChars / 3)) : 0;
  let end = Math.min(total, start + maxChars);
  if (end - start < maxChars) start = Math.max(0, end - maxChars);
  // к границам слов: начало — после пробела, конец — перед пробелом
  if (start > 0) {
    const sp = full.indexOf(" ", start);
    if (sp >= 0 && sp < (found ? hitAt : start + 40)) start = sp + 1;
  }
  if (end < total) {
    const sp = full.lastIndexOf(" ", end);
    if (sp > start + Math.floor(maxChars / 2)) end = sp;
  }
  const out: SearchFragmentPart[] = [];
  if (start > 0) out.push({ text: "… " });
  let at = 0;
  for (const p of parts) {
    const a = Math.max(at, start);
    const b = Math.min(at + p.text.length, end);
    if (b > a) {
      const text = p.text.slice(a - at, b - at);
      out.push(p.hit ? { text, hit: true } : { text });
    }
    at += p.text.length;
  }
  if (end < total) out.push({ text: " …" });
  return compact(out);
}
