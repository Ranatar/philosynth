/**
 * Текстовые утилиты контекстной подсистемы.
 * truncateText — дословный порт из philosynth.html [~8051].
 * tableToText [~7994] — порт с типизацией через минимальный структурный
 * DOM-интерфейс: работает и с браузерным DOM, и с linkedom/cheerio-обёрткой
 * (server/utils/html-parser.ts, будущая беседа), без зависимости от lib.dom.
 */

/** Сокращение длинного текста: середина заменяется маркером */
export function truncateText(
  text: string | null | undefined,
  maxLen: number,
): string {
  if (!text || text.length <= maxLen) return text || "";
  const half = Math.floor(maxLen / 2);
  return text.slice(0, half) + "\n[...сокращено...]\n" + text.slice(-half);
}

/** Минимальный срез DOM-элемента, достаточный для tableToText */
export interface TableLikeElement {
  querySelectorAll(selector: string): Iterable<TableLikeElement>;
  textContent: string | null;
}

/** Таблица → текст «Заголовок | Заголовок / --- | --- / ячейки» */
export function tableToText(table: TableLikeElement): string {
  const rows: string[] = [];
  const ths = Array.from(table.querySelectorAll("thead th")).map((th) =>
    (th.textContent ?? "").trim(),
  );
  if (ths.length) {
    rows.push(ths.join(" | "));
    rows.push(ths.map(() => "---").join(" | "));
  }
  for (const tr of table.querySelectorAll("tbody tr")) {
    const cells = Array.from(tr.querySelectorAll("td")).map((td) =>
      (td.textContent ?? "").trim().replace(/\n+/g, " ").replace(/\s{2,}/g, " "),
    );
    rows.push(cells.join(" | "));
  }
  return rows.join("\n");
}
