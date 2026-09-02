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
import { useEffect, useMemo, useRef, useState } from "react";

import type { SynthesisPreview } from "@philosynth/shared/types/synthesis";

import { listPublicSyntheses, listSyntheses } from "../../api/syntheses";
import { usePoolStore } from "../../stores/pool-store";
import {
  catalogPreviewToPoolEntry,
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

  /* «+ Из каталога» (беседа 3.2, запрос 1, п. 1): каталожные концепции
     представимы участниками {type:'synthesis', synthesisId} — сервер 3.1
     их принимает. Пикер: свои ready-синтезы + публичные (доступ =
     доступу POST: владелец ИЛИ публичный). */
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogItems, setCatalogItems] = useState<SynthesisPreview[] | null>(
    null,
  );
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    if (!catalogOpen || catalogItems !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const [mine, pub] = await Promise.all([
          listSyntheses({ status: "ready", limit: 100 }),
          listPublicSyntheses({ limit: 100 }),
        ]);
        if (cancelled) return;
        // Дедупликация (свой публичный синтез приходит в обоих списках)
        const seen = new Set<string>();
        const merged: SynthesisPreview[] = [];
        for (const s of [...mine.items, ...pub.items]) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          if (s.status === "ready") merged.push(s);
        }
        setCatalogItems(merged);
      } catch {
        if (!cancelled) setCatalogError("Не удалось загрузить каталог.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [catalogOpen, catalogItems]);

  const handleAddFromCatalog = (s: SynthesisPreview) => {
    if (addToPool(catalogPreviewToPoolEntry(s))) {
      setPoolStatus("✓ Из каталога: «" + s.title + "»", "ok");
    }
  };

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
    <div className="form-group full">
      <div className="pool-block">
        <div className="pool-block-title">
          Загруженные Концепции
          {/* Индикатор «◉ имя» (importIndicator исходника) */}
          {viewing && (
            <span className="import-indicator visible">◉ {viewing.name}</span>
          )}
        </div>
        <div className="pool-block-desc">
          Единый пул: ☑ — участник мета-синтеза, ◉ — просмотр. Файлы —
          сохранённые HTML-документы PhiloSynth.
        </div>
        <div className="pool-actions">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="action-btn"
          >
            + Загрузить из файла
          </button>
          <button
            type="button"
            onClick={() => setUrlRowOpen((v) => !v)}
            className="action-btn"
          >
            + Загрузить по URL
          </button>
          {/* Беседа 3.2: каталожные концепции-участники */}
          <button
            type="button"
            onClick={() => setCatalogOpen((v) => !v)}
            className="action-btn"
          >
            + Из каталога
          </button>
        </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".html,text/html"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleFileImport(e.currentTarget)}
      />

      {/* Строка URL (togglePoolUrlRow) */}
      {urlRowOpen && (
        <div className="pool-url-row visible">
          <input
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="https://example.com/concept.html"
            className="import-url-input"
          />
          <button
            type="button"
            disabled={urlBusy}
            onClick={() => void handleUrlImport()}
            className="import-url-btn"
          >
            {urlBusy ? "…" : "↑ Загрузить"}
          </button>
        </div>
      )}

      {/* Пикер «Из каталога» (беседа 3.2) */}
      {catalogOpen && (
        <div className="pool-catalog-picker">
          {catalogError && (
            <div className="pool-status err">{catalogError}</div>
          )}
          {!catalogError && catalogItems === null && (
            <div className="pool-status">Загрузка каталога…</div>
          )}
          {catalogItems !== null && catalogItems.length === 0 && (
            <div className="pool-status">Готовых синтезов в каталоге нет.</div>
          )}
          {catalogItems?.map((s) => {
            const added = concepts.some((c) => c.synthesisId === s.id);
            return (
              <div
                key={s.id}
                className="pool-catalog-row"
              >
                <div className="pool-card-info">
                  <div className="pool-card-name">{s.title}</div>
                  <div className="pool-card-meta">
                    {s.philosophers.length > 0
                      ? s.philosophers.join(", ")
                      : "свободный синтез"}
                    {s.hasConceptParents ? " · мета-синтез" : ""}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={added}
                  onClick={() => handleAddFromCatalog(s)}
                  className="pool-card-btn"
                >
                  {added ? "в пуле" : "+ в пул"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Статус (poolStatus) */}
      {status && status.text && (
        <div
          className={["pool-status", status.cls === "ok" ? "ok" : status.cls === "err" ? "err" : ""]
            .filter(Boolean)
            .join(" ")}
        >
          {status.text}
        </div>
      )}

      {/* Список карточек (renderPoolConcepts) */}
      {concepts.length > 0 && (
        <div className="pool-list">
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
        <div className="pool-summary">
          {synthCount} из {concepts.length} для мета-синтеза
          {viewing ? " · ◉ " + viewing.name + " — просмотр" : ""}
        </div>
      )}

      {/* Предпросмотр ◉ (адаптация selectForViewing — см. шапку) */}
      {viewing && previewHtml && (
        <details
          className="sec-disclosure"
          open={previewOpen}
          onToggle={(e) => setPreviewOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary>
            Предпросмотр: {viewing.name} (read-only)
          </summary>
          {previewOpen && (
            <div
              className="disclosure-body pool-preview-body"
              // <script> через innerHTML не исполняются; контент — файл,
              // который пользователь сам загрузил в свой браузер
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          )}
        </details>
      )}
      </div>
    </div>
  );
}
