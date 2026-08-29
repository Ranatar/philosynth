/**
 * API экспорта (беседа 4.2, п. 7 первого запроса; 03 §2.11).
 *
 * В отличие от прочих api/* здесь нет fetch-обёрток: экспорт — скачивание
 * файла. Сервер отвечает Content-Disposition: attachment с готовым именем
 * (getDocFilename), поэтому клиенту достаточно перейти по URL — сессионная
 * кука уходит сама (same-origin), браузер сохраняет файл. Скачивание —
 * триггером скрытой ссылки (downloadExport), как downloadFile исходника
 * [16345] через <a>.click().
 */
const BASE_URL = "/api/v1";

export type ExportFormat = "html" | "md" | "mmd" | "png" | "json";

/** Человеческие подписи пунктов меню экспорта (порядок меню). */
export const EXPORT_FORMATS: readonly {
  fmt: ExportFormat;
  label: string;
}[] = [
  { fmt: "html", label: "HTML" },
  { fmt: "md", label: "Markdown" },
  { fmt: "mmd", label: "Mermaid" },
  { fmt: "png", label: "PNG" },
  { fmt: "json", label: "JSON" },
];

export function exportUrl(synthesisId: string, fmt: ExportFormat): string {
  return `${BASE_URL}/syntheses/${synthesisId}/export/${fmt}`;
}

/** Скачивание: скрытая ссылка (имя файла даёт Content-Disposition). */
export function downloadExport(synthesisId: string, fmt: ExportFormat): void {
  const a = document.createElement("a");
  a.href = exportUrl(synthesisId, fmt);
  a.download = ""; // имя возьмётся из Content-Disposition
  document.body.appendChild(a);
  a.click();
  a.remove();
}
