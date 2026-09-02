/**
 * Импорт HTML-файла PhiloSynth (беседа 4.3; 03-spec §1.9 I1/I3).
 * Заглушка 0.4 заменена реальной страницей.
 *
 * Порт клиентского сценария: в исходнике импорт шёл через Unified
 * Concept Pool (handlePoolFileImport [4948]) с confirm() при критических
 * предупреждениях [21327]. Здесь:
 *  - drag & drop зона + выбор файла;
 *  - «Подтвердить импорт» / «Отмена» — подтверждение ДО отправки
 *    (confirm исходника показывал предупреждения до заливки в DOC_STATE;
 *    сервер валидирует на своей стороне и возвращает warnings ответом —
 *    адаптация 3 import-service);
 *  - индикатор загрузки ИНДЕТЕРМИНИРОВАННЫЙ (fetch не отдаёт
 *    upload-progress; файлы ~1–2 МБ — стадия разбора длиннее заливки);
 *  - предупреждения ответа: критические ⚠ красным, прочие ⚡;
 *  - redirect на /synthesis/:id — сразу при пустых warnings, иначе по
 *    кнопке «Перейти к синтезу».
 * I2 (импорт по URL с CORS-прокси) — Фаза 2, здесь не реализуется.
 */
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import { importFile } from "../api/import";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";

import type { ImportWarning } from "@philosynth/shared/types/synthesis";

type Phase = "idle" | "uploading" | "done";

export function ImportPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);
  const [resultId, setResultId] = useState<string | null>(null);

  function pick(f: File | null | undefined) {
    setError(null);
    setWarnings([]);
    setResultId(null);
    if (!f) return;
    if (!/\.html?$/i.test(f.name)) {
      setError("Ожидается HTML-файл PhiloSynth (.html)");
      setFile(null);
      return;
    }
    setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    pick(e.dataTransfer.files?.[0]);
  }

  function reset() {
    setFile(null);
    setError(null);
    setWarnings([]);
    setResultId(null);
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function confirmImport() {
    if (!file) return;
    setPhase("uploading");
    setError(null);
    try {
      const { id, warnings: w } = await importFile(file);
      if (w.length === 0) {
        // Без предупреждений — сразу к документу
        navigate(`/synthesis/${id}`);
        return;
      }
      setResultId(id);
      setWarnings(w);
      setPhase("done");
    } catch (err) {
      setPhase("idle");
      setError(
        err instanceof ApiError
          ? err.message
          : "Импорт не удался. Попробуйте ещё раз.",
      );
    }
  }

  const criticals = warnings.filter((w) => w.critical);
  const infos = warnings.filter((w) => !w.critical);

  return (
    <div className="input-form">
      <h1 className="form-section-title">Импорт HTML-файла PhiloSynth</h1>

      {phase === "uploading" && (
        <LoadingSpinner label="Загрузка и разбор файла…" />
      )}

      {phase === "done" && resultId && (
        <div className="form-group full">
          <div className="submit-note">
            Импорт завершён. Обнаружены проблемы с метаданными — документ
            отображается, проверьте параметры перед перегенерацией.
          </div>
          {criticals.length > 0 && (
            <div className="sec-warnings">
              {criticals.map((w, i) => (
                <div key={`c${i}`} role="alert" className="sec-warning-item">
                  <span className="warn-icon">⚠</span>
                  <span>КРИТИЧНО: {w.message}</span>
                </div>
              ))}
            </div>
          )}
          {infos.length > 0 && (
            <div className="sec-recommendations">
              {infos.map((w, i) => (
                <div key={`i${i}`} className="sec-recommend-item">
                  <span className="rec-icon">⚡</span>
                  <span>Внимание: {w.message}</span>
                </div>
              ))}
            </div>
          )}
          <div className="actions-bar-btns" style={{ marginTop: 14 }}>
            <button
              type="button"
              onClick={() => navigate(`/synthesis/${resultId}`)}
              className="action-btn primary"
            >
              Перейти к синтезу
            </button>
            <button type="button" onClick={reset} className="action-btn">
              Импортировать ещё
            </button>
          </div>
        </div>
      )}

      {phase === "idle" && (
        <div className="form-group full">
          <div
            role="button"
            tabIndex={0}
            aria-label="Зона загрузки файла"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={
              "edit-add-panel import-dropzone" + (dragOver ? " over" : "")
            }
          >
            <span style={{ fontSize: 30 }} aria-hidden>
              ⇪
            </span>
            <p className="submit-note">
              Перетащите сюда HTML-файл PhiloSynth
              <br />
              или нажмите, чтобы выбрать
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".html,.htm,text/html"
              style={{ display: "none" }}
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </div>

          {file && (
            <div className="pool-card">
              <div className="pool-card-info">
                <div className="pool-card-name">{file.name}</div>
                <div className="pool-card-meta">
                  {(file.size / 1024).toFixed(0)} КБ
                </div>
              </div>
              <div className="pool-card-btns">
                <button
                  type="button"
                  onClick={() => void confirmImport()}
                  className="action-btn primary"
                >
                  Подтвердить импорт
                </button>
                <button type="button" onClick={reset} className="action-btn">
                  Отмена
                </button>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="callout warning">
              <span className="callout-label">Ошибка импорта</span>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
