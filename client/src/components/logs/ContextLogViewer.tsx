/**
 * Модальное окно «◈ Лог Контекста» (беседа 2.4; 07 п.5).
 * Порт разметки #ctxLogOverlay [4275–4291] и функций viewCtxLog /
 * closeCtxLog / copyCtxLog [24096–24118], downloadPrompts [24119–24138],
 * refreshCtxLogIfOpen [23306–23313]. Стили .raw-* — globals.css.
 *
 * Адаптации DOM→React/REST:
 *  - контент — GET /logs/formatted (сервер форматирует и раскрашивает,
 *    03 §2.12); рендер html через dangerouslySetInnerHTML;
 *  - live-обновление: НОВЫХ WS-сообщений про лог НЕТ (аудит 2026-07-30) —
 *    родитель (SynthesisPage) передаёт refreshKey, растущий по УЖЕ
 *    существующим событиям завершения раздела (section_done /
 *    generation_complete из useStreamingGeneration); смена ключа при
 *    открытом окне → перезапрос (аналог refreshCtxLogIfOpen);
 *  - инфо-строка: исходник считал genLog.length из глобального массива;
 *    здесь разделы считаются по заголовкам «═══ … ═══» текста (минус
 *    ИТОГО) — без второго запроса /logs/generation;
 *  - downloadPrompts: GET /logs/prompts → Blob; имя файла — паритет
 *    исходника: docNum + слаг заголовка (transliterate) + «-prompts.md»;
 *  - блокировка прокрутки body — как viewCtxLog/closeCtxLog.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { getFormattedLog, getPromptsDump } from "../../api/logs";

import { transliterate } from "@philosynth/shared/utils/transliterate";

export interface ContextLogViewerProps {
  open: boolean;
  synthesisId: string;
  /** Шапка документа — для имени файла промптов (downloadPrompts) */
  docNum: string;
  title: string;
  /**
   * Live-обновление: растёт по событиям завершения раздела
   * (section_done/generation_complete); смена при открытом окне →
   * перезапрос /logs/formatted.
   */
  refreshKey?: number;
  onClose: () => void;
}

const DEFAULT_TITLE = "Синтез Философской Концепции";

export function ContextLogViewer({
  open,
  synthesisId,
  docNum,
  title,
  refreshKey = 0,
  onClose,
}: ContextLogViewerProps) {
  const [text, setText] = useState("");
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("Скопировать лог");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFormattedLog(synthesisId);
      setText(data.text);
      setHtml(data.html);
    } catch {
      setError("Не удалось загрузить лог.");
    } finally {
      setLoading(false);
    }
  }, [synthesisId]);

  // viewCtxLog + refreshCtxLogIfOpen: загрузка при открытии и по refreshKey
  useEffect(() => {
    if (open) void load();
  }, [open, refreshKey, load]);

  // Блокировка прокрутки body (viewCtxLog/closeCtxLog)
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  if (!open) return null;

  // Инфо: «N разделов · M строк» (адаптация — счёт по тексту)
  const lineCount = text ? text.split("\n").length : 0;
  const sectionCount = text
    ? (text.match(/^═══ .+ ═══$/gm) ?? []).filter((l) => !l.includes("ИТОГО"))
        .length
    : 0;

  const handleCopy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopyLabel("✓ Скопировано");
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(
        () => setCopyLabel("Скопировать лог"),
        2000,
      );
    });
  };

  const handleDownloadPrompts = async () => {
    const { text: dump } = await getPromptsDump(synthesisId);
    if (!dump) {
      alert("Нет сохранённых промптов. Сгенерируйте хотя бы один раздел.");
      return;
    }
    const blob = new Blob([dump], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const num = docNum.trim() || "PS";
    const titleSlug =
      title && title !== DEFAULT_TITLE
        ? "-" + transliterate(title).slice(0, 40)
        : "";
    a.href = url;
    a.download = num + titleSlug + "-prompts.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="raw-overlay visible"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="raw-modal" style={{ maxWidth: 1000 }}>
        <div className="raw-modal-header">
          <div className="raw-modal-title">◈ Лог Контекста</div>
          <button type="button" className="raw-close" onClick={onClose}>
            ✕ Закрыть
          </button>
        </div>
        <div className="raw-modal-body">
          {loading && !html ? (
            <pre style={{ fontSize: 12, lineHeight: 1.6 }}>Загрузка…</pre>
          ) : error ? (
            <pre style={{ fontSize: 12, lineHeight: 1.6, color: "var(--red)" }}>
              {error}
            </pre>
          ) : (
            <pre
              style={{ fontSize: 12, lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
        <div className="raw-modal-footer">
          <div className="raw-info">
            {text ? `${sectionCount} разделов · ${lineCount} строк` : "—"}
          </div>
          <button
            type="button"
            className="raw-copy"
            onClick={() => void handleDownloadPrompts()}
            title="Скачать все промпты за сессию в файл .md"
          >
            ⤓ Скачать промпты
          </button>
          <button type="button" className="raw-copy" onClick={handleCopy}>
            {copyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
