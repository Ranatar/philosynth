/**
 * Unified Concept Pool — блок «Загруженные Концепции» в SynthesisForm.
 * Беседа 1.5b (запрос 1, п. 1, 3, 6).
 *
 * Порты (якоря philosynth.html):
 *  - handlePoolFileImport [4949–4977] — multiple files через FileReader;
 *  - handlePoolUrlImport [4979–5007] — fetchWithFallback + CORS-прокси;
 *  - togglePoolUrlRow [5009], setPoolStatus [5014] (в сторе);
 *  - renderPoolConcepts [5025–5103] — список карточек + саммари
 *    «N из M для мета-синтеза · ◉ имя — просмотр»;
 *  - renamePoolConcept [4715] — prompt() здесь, запись имени — в сторе.
 *
 * ПРОСМОТР (◉, план беседы п. 2): в standalone selectForViewing грузил
 * концепцию в #docOutput через importHTML/restoreFromPoolSnapshot; в
 * сервисе страница создания документа не содержит — просмотр выполнен
 * read-only предпросмотром: innerHTML #docOutput выбранной концепции
 * рендерится в сворачиваемом блоке под пулом (dangerouslySetInnerHTML;
 * <script> при вставке через innerHTML не исполняются). Индикатор
 * «◉ имя» — в шапке блока. Полноценный просмотр импортированного
 * документа — беседы 1.6b (SynthesisPage, клиент) + 4.3 (серверный
 * импорт).
 */
import { useMemo, useRef, useState } from "react";

import { usePoolStore } from "../../stores/pool-store";
import {
  fetchWithFallback,
  parseConceptFile,
} from "../../utils/concept-file";
import { PoolCard } from "./PoolCard";

export function ConceptPool() {
  const concepts = usePoolStore((s) => s.concepts);
  const status = usePoolStore((s) => s.status);
  const setPoolStatus = usePoolStore((s) => s.setPoolStatus);
  const addToPool = usePoolStore((s) => s.addToPool);
  const removeFromPool = usePoolStore((s) => s.removeFromPool);
  const renamePoolConcept = usePoolStore((s) => s.renamePoolConcept);
  const toggleSynthParticipant = usePoolStore((s) => s.toggleSynthParticipant);
  const selectForViewing = usePoolStore((s) => s.selectForViewing);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [urlRowOpen, setUrlRowOpen] = useState(false); // togglePoolUrlRow
  const [urlValue, setUrlValue] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);

  // handlePoolFileImport [4949–4977]
  const handleFileImport = (input: HTMLInputElement) => {
    const files = Array.from(input.files || []);
    input.value = "";
    let loaded = 0,
      errors = 0;

    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const entry = parseConceptFile(String(reader.result), file.name);
          if (addToPool(entry)) loaded++;
        } catch (err) {
          errors++;
          console.error("Ошибка импорта «" + file.name + "»:", err);
          setPoolStatus(
            "⚠ " +
              file.name +
              ": " +
              (err instanceof Error ? err.message : String(err)),
            "err",
          );
        }
        // Итог после всех файлов
        if (loaded + errors === files.length && loaded > 0) {
          setPoolStatus(
            "✓ Загружено: " + loaded + (errors ? ", ошибок: " + errors : ""),
            loaded ? "ok" : "err",
          );
        }
      };
      reader.onerror = () => {
        errors++;
        setPoolStatus("⚠ Не удалось прочитать: " + file.name, "err");
      };
      reader.readAsText(file);
    }
  };

  // handlePoolUrlImport [4979–5007]
  const handleUrlImport = async () => {
    const rawUrl = urlValue.trim();
    if (!rawUrl) {
      setPoolStatus("⚠ Введите URL", "err");
      return;
    }

    let url: URL;
    try {
      url = new URL(rawUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      setPoolStatus("⚠ Некорректный URL", "err");
      return;
    }

    setPoolStatus("Загрузка...", "");
    setUrlBusy(true);
    const filename = url.pathname.split("/").pop() || "import.html";

    try {
      const htmlString = await fetchWithFallback(url.href, (t) =>
        setPoolStatus(t, ""),
      );
      if (!htmlString || !htmlString.includes("<"))
        throw new Error("Ответ не содержит HTML.");
      const entry = parseConceptFile(htmlString, filename);
      addToPool(entry);
      setPoolStatus("✓ Загружено: " + filename, "ok");
      setUrlValue("");
    } catch (err) {
      setPoolStatus(
        "⚠ " + (err instanceof Error ? err.message : String(err)),
        "err",
      );
    } finally {
      setUrlBusy(false);
    }
  };

  // renamePoolConcept [4715–4726]: prompt здесь, запись — в сторе
  const handleRename = (id: string) => {
    const concept = concepts.find((c) => c.id === id);
    if (!concept) return;
    const raw = concept.realName || concept.name.replace(/^«|»$/g, "");
    const newName = window.prompt("Новое название концепции:", raw);
    if (newName?.trim() && newName.trim() !== raw) {
      renamePoolConcept(id, newName);
    }
  };

  // Саммари [5308–5318 renderPoolConcepts, хвост]
  const synthCount = concepts.filter((c) => c.isSynthParticipant).length;
  const viewing = concepts.find((c) => c.isSelected);

  // Предпросмотр ◉ (адаптация — см. шапку): innerHTML #docOutput
  const previewHtml = useMemo(() => {
    if (!viewing) return null;
    try {
      const doc = new DOMParser().parseFromString(
        viewing.rawHTML,
        "text/html",
      );
      return doc.getElementById("docOutput")?.innerHTML ?? null;
    } catch {
      return null;
    }
  }, [viewing]);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-sm font-semibold text-ink">
            Загруженные Концепции
          </span>
          {/* Индикатор «◉ имя» (importIndicator исходника) */}
          {viewing && (
            <span className="ml-2 font-mono text-[11px] text-gold">
              ◉ {viewing.name}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded border border-rule px-2 py-1 text-xs text-ink-mid hover:border-rule-strong hover:text-ink"
          >
            + Загрузить из файла
          </button>
          <button
            type="button"
            onClick={() => setUrlRowOpen((v) => !v)}
            className="rounded border border-rule px-2 py-1 text-xs text-ink-mid hover:border-rule-strong hover:text-ink"
          >
            + Загрузить по URL
          </button>
        </div>
      </div>
      <div className="mt-0.5 font-mono text-[10px] leading-relaxed text-ink-dim">
        Единый пул: ☑ — участник мета-синтеза, ◉ — просмотр. Файлы —
        сохранённые HTML-документы PhiloSynth.
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".html,text/html"
        multiple
        className="hidden"
        onChange={(e) => handleFileImport(e.currentTarget)}
      />

      {/* Строка URL (togglePoolUrlRow) */}
      {urlRowOpen && (
        <div className="mt-2 flex gap-2">
          <input
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="https://example.com/concept.html"
            className="w-full rounded border border-rule bg-white p-1.5 font-mono text-xs text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
          />
          <button
            type="button"
            disabled={urlBusy}
            onClick={() => void handleUrlImport()}
            className="shrink-0 rounded border border-gold px-3 py-1 text-xs text-gold hover:bg-gold hover:text-white disabled:opacity-50"
          >
            {urlBusy ? "…" : "Загрузить"}
          </button>
        </div>
      )}

      {/* Статус (poolStatus) */}
      {status && status.text && (
        <div
          className={
            "mt-2 font-mono text-[11px] leading-relaxed " +
            (status.cls === "ok"
              ? "text-green-700"
              : status.cls === "err"
                ? "text-red"
                : "text-ink-dim")
          }
        >
          {status.text}
        </div>
      )}

      {/* Список карточек (renderPoolConcepts) */}
      {concepts.length > 0 && (
        <div className="mt-2 space-y-2">
          {concepts.map((c) => (
            <PoolCard
              key={c.id}
              concept={c}
              onToggleSynth={toggleSynthParticipant}
              onSelectForViewing={selectForViewing}
              onRename={handleRename}
              onRemove={removeFromPool}
            />
          ))}
        </div>
      )}

      {/* Саммари (poolSummary) */}
      {concepts.length > 0 && (
        <div className="mt-2 font-mono text-[11px] text-ink-mid">
          {synthCount} из {concepts.length} для мета-синтеза
          {viewing ? " · ◉ " + viewing.name + " — просмотр" : ""}
        </div>
      )}

      {/* Предпросмотр ◉ (адаптация selectForViewing — см. шапку) */}
      {viewing && previewHtml && (
        <div className="mt-3 rounded border border-rule bg-white">
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className="w-full px-3 py-2 text-left font-mono text-[11px] text-ink-mid hover:text-ink"
          >
            {previewOpen ? "▾" : "▸"} Предпросмотр: {viewing.name}{" "}
            <span className="text-ink-dim">(read-only)</span>
          </button>
          {previewOpen && (
            <div
              className="max-h-[420px] overflow-auto border-t border-rule p-4 text-sm"
              // <script> через innerHTML не исполняются; контент — файл,
              // который пользователь сам загрузил в свой браузер
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          )}
        </div>
      )}
    </div>
  );
}
