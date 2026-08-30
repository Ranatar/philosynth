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
    <div className="mx-auto max-w-3xl">
      <div className="meta-label">импорт</div>
      <h1 className="mt-1 text-2xl">Импорт HTML-файла PhiloSynth</h1>

      {phase === "uploading" && (
        <div className="mt-6 rounded border border-rule bg-paper p-6">
          <LoadingSpinner label="Загрузка и разбор файла…" />
        </div>
      )}

      {phase === "done" && resultId && (
        <div className="mt-6 flex flex-col gap-4">
          <div className="rounded border border-rule bg-paper p-6">
            <p>
              Импорт завершён. Обнаружены проблемы с метаданными — документ
              отображается, проверьте параметры перед перегенерацией.
            </p>
            <ul className="mt-4 flex flex-col gap-2">
              {criticals.map((w, i) => (
                <li key={`c${i}`} role="alert" className="text-sm text-red">
                  ⚠ КРИТИЧНО: {w.message}
                </li>
              ))}
              {infos.map((w, i) => (
                <li key={`i${i}`} className="text-sm text-ink-mid">
                  ⚡ Внимание: {w.message}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate(`/synthesis/${resultId}`)}
              className="rounded border border-gold px-4 py-2 text-sm text-gold hover:bg-gold hover:text-white"
            >
              Перейти к синтезу
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded border border-rule px-4 py-2 text-sm text-ink-mid hover:border-ink-mid"
            >
              Импортировать ещё
            </button>
          </div>
        </div>
      )}

      {phase === "idle" && (
        <div className="mt-6 flex flex-col gap-4">
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
              "flex cursor-pointer flex-col items-center gap-2 rounded border-2 border-dashed p-10 text-center transition-colors " +
              (dragOver
                ? "border-gold bg-paper"
                : "border-rule bg-paper hover:border-gold")
            }
          >
            <span className="text-3xl" aria-hidden>
              ⇪
            </span>
            <p className="text-ink-mid">
              Перетащите сюда HTML-файл PhiloSynth
              <br />
              или нажмите, чтобы выбрать
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".html,.htm,text/html"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </div>

          {file && (
            <div className="flex items-center justify-between rounded border border-rule bg-paper p-4">
              <div className="min-w-0">
                <div className="truncate font-medium">{file.name}</div>
                <div className="meta-label mt-1">
                  {(file.size / 1024).toFixed(0)} КБ
                </div>
              </div>
              <div className="flex shrink-0 gap-3">
                <button
                  type="button"
                  onClick={() => void confirmImport()}
                  className="rounded border border-gold px-4 py-2 text-sm text-gold hover:bg-gold hover:text-white"
                >
                  Подтвердить импорт
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded border border-rule px-4 py-2 text-sm text-ink-mid hover:border-ink-mid"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
