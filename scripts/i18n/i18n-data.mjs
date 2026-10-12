/**
 * Значения файлов-данных против мастер-таблицы (беседа 12.5, Д-33).
 *
 * Файлы-данных (isDataFile: packages/shared/*, конфиг матрицы совместимости,
 * сид каталогов типов) codemod не переписывает — их значения читают и
 * промпты, и разбор документа, а переводятся они ПО МЕСТУ ПОКАЗА (11.4):
 * tData(value) находит ключ по карте «русское значение → ключ», ключ — строку
 * таблицы, строка — перевод. Строки data заводятся В ТАБЛИЦЕ, а не из кода:
 * i18n:export сверяет только вызовы tl(), и новое значение файла-данных
 * (тип каталога в seed-taxonomy, метка в shared/constants/*, текст матрицы)
 * без строки таблицы tData молча возвращал русским — сторож 4ay проверял
 * лишь, что data-строки ТАБЛИЦЫ есть в карте, а не что все значения
 * ФАЙЛОВ есть в таблице («По факту 11.4» п.15).
 *
 * scanDataValues(root, table, names) → по каждому значению описи
 * файлов-данных:
 *   present  — строка таблицы есть и её ru равен значению;
 *   missing  — строки нет: ключ известен из names.json (`key`) либо нет
 *              (`key: null` — дополнить names.json); i18n:export --data
 *              заводит строки с известным ключом, i18n:check --strict красит
 *              обе группы;
 *   mismatch — строка есть, но ru таблицы ≠ значению файла (текст данных
 *              изменился, таблица отстала; export --data обновляет ru);
 *   excluded — значение исключено (id: null в names.json — промпт, образец,
 *              сопоставитель) либо совпадает с текстом записи
 *              MIRROR_EXCLUSIONS (машинное значение — не переводится).
 *
 * Сопоставление ключа: запись names.json своего пространства имён, затем
 * common; если имени нет — строка таблицы с тем же ru (значение, уже
 * заведённое под другим ключом, ошибкой не считается). Подстановки описи
 * ({0},{1}) приводятся к именам таблицы (toNamed по row.params) перед
 * сравнением ru — шаблоны shared с {подстановками} (11.4) сходятся.
 */

import { extractProject, namespaceOf, isDataFile } from "./ui-strings-lib.mjs";
import { loadNames, resolveName, toNamed, MIRROR_EXCLUSIONS } from "./i18n-core.mjs";

/** Тексты записей MIRROR_EXCLUSIONS, заданных текстом (машинные значения). */
export function mirrorTexts() {
  return new Set(MIRROR_EXCLUSIONS.filter((x) => x.text !== undefined).map((x) => x.text));
}

/** Ключ таблицы с тем же русским текстом (предпочтение shared.* → data.* → прочие → server.*). */
function keyByRu(S, ru) {
  const rank = (k) => (k.startsWith("shared.") ? 0 : k.startsWith("data.") ? 1 : k.startsWith("server.") ? 3 : 2);
  let best = null;
  for (const [k, row] of Object.entries(S)) {
    if (row.obsolete || row.ru !== ru) continue;
    if (best === null || rank(k) < rank(best) || (rank(k) === rank(best) && k < best)) best = k;
  }
  return best;
}

/**
 * @param {string} root корень репозитория
 * @param {{strings: Record<string, any>}} table мастер-таблица
 * @param {Map} [names] разобранный names.json (loadNames)
 * @param {{project?: object}} [opts] готовая опись (extractProject), чтобы не разбирать проект дважды
 */
export function scanDataValues(root, table, names = loadNames(root), opts = {}) {
  const S = table.strings;
  const mirrors = mirrorTexts();
  const project = opts.project ?? extractProject(root, { withWarnings: false });
  const res = { present: [], missing: [], mismatch: [], excluded: [] };
  const seen = new Set();
  for (const f of project.files) {
    if (!isDataFile(f.rel)) continue;
    const ns = namespaceOf(f.rel);
    for (const e of f.entries) {
      const where = `${f.rel}:${e.line}`;
      const r = resolveName(names, ns, e);
      if (r?.exclude || mirrors.has(e.text)) { res.excluded.push({ where, text: e.text }); continue; }
      let key = r?.key ?? null;
      let row = key ? S[key] : undefined;
      if (!row || row.obsolete) {
        // значение могло быть заведено под другим ключом (например, и надписью) — ищем по ru
        const byRu = keyByRu(S, e.text);
        if (byRu) { key = byRu; row = S[byRu]; }
      }
      if (!row || row.obsolete) {
        const id = `${key ?? "?"}\u0000${e.text}`;
        if (!seen.has(id)) { seen.add(id); res.missing.push({ where, text: e.text, key, ns, args: e.args ?? null, params: r?.params ?? null, en: r?.en ?? null }); }
        continue;
      }
      const named = toNamed(e.text, Object.keys(row.params ?? {}));
      if (row.ru !== named && row.ru !== e.text) {
        res.mismatch.push({ where, text: named, key, ru: row.ru });
        continue;
      }
      res.present.push({ where, text: e.text, key });
    }
  }
  return res;
}

/** Строки отчёта (для i18n:check и сторожа). */
export function formatDataProblems(scan) {
  const out = [];
  for (const m of scan.missing) out.push(`${m.where} ${m.key ? m.key : "(нет имени в names.json)"} «${m.text}»`);
  return out;
}

export { isDataFile };
