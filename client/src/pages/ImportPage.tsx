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
 *
 * Беседа 8.5 — блок предложения родителя. Файлы одностраничника UUID не
 * несут, сервер сопоставляет концепцию-родителя ПО ИМЕНИ среди синтезов
 * владельца и отдаёт lineageCandidates; связь создаёт ТОЛЬКО человек:
 *  - на каждого родителя с совпадениями — свой блок (.callout.note):
 *    «В файле указана концепция-родитель „X“. В базе найдено:» + список
 *    (название · дата) с «Связать» / «Пропустить»; блоки решаются
 *    независимо;
 *  - «Связать» — ВТОРЫМ ШАГОМ кнопок («Точно связать?» / «Отмена», клик мимо
 *    блока сбрасывает — правило 8.4): отвязки родителя нет, действие
 *    необратимо;
 *  - родитель без совпадений блока не получает — о нём говорит
 *    предупреждение сервера (ветка из файла — снимком в древе);
 *  - когда все блоки решены и хотя бы один связан — переход к синтезу
 *    (дерево уже рисуется: isMetaSynthesis по parentSyntheses, 3.2);
 *    иначе остаётся кнопка «Перейти к синтезу».
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import { importFile } from "../api/import";
import { linkParent } from "../api/lineage";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";

import type { LineageCandidate } from "@philosynth/shared/types/lineage";
import type { ImportWarning } from "@philosynth/shared/types/synthesis";

type Phase = "idle" | "uploading" | "done";

/** Состояние одного блока предложения родителя (8.5) */
type CandidateState =
  | { kind: "pending"; arm: string | null; busy: boolean; error: string | null }
  | { kind: "linked"; matchId: string }
  | { kind: "skipped" };

function linkErrorText(err: unknown): string {
  if (!(err instanceof ApiError)) return "Связать не удалось. Попробуйте ещё раз.";
  switch (err.code) {
    case "LINEAGE_SELF":
      return "Концепция не может быть собственным родителем.";
    case "LINEAGE_CYCLE":
      return "Эта концепция — потомок импортированной: связь замкнула бы родословную в цикл.";
    case "LINEAGE_EXISTS":
      return "Эта концепция уже указана родителем.";
    case "FORBIDDEN":
      return "Концепция принадлежит другому пользователю — в родители не идёт.";
    case "NOT_FOUND":
      return "Концепция-родитель не найдена (удалена?).";
    default:
      return err.message;
  }
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
}

interface CandidateBlockProps {
  candidate: LineageCandidate;
  state: CandidateState;
  onLink: (matchId: string) => Promise<void>;
  onSkip: () => void;
  onArm: (matchId: string | null) => void;
}

function LineageCandidateBlock({
  candidate,
  state,
  onLink,
  onSkip,
  onArm,
}: CandidateBlockProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Второй шаг сбрасывается кликом МИМО блока (правило кита / 8.4)
  useEffect(() => {
    if (state.kind !== "pending" || !state.arm || state.busy) return;
    const onDown = (ev: MouseEvent) => {
      const el = ref.current;
      if (el && ev.target instanceof Node && !el.contains(ev.target)) onArm(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [state, onArm]);

  const label = `Концепция-родитель „${candidate.parentName}“`;

  if (state.kind === "linked") {
    const m = candidate.matches.find((x) => x.id === state.matchId);
    return (
      <div className="callout gold" data-testid="lineage-candidate" data-state="linked">
        <span className="callout-label">{label}</span>
        Связана с «{m?.title ?? "…"}».
      </div>
    );
  }
  if (state.kind === "skipped") {
    return (
      <div className="callout" data-testid="lineage-candidate" data-state="skipped">
        <span className="callout-label">{label}</span>
        Пропущено — связь не создана; ветка родителя показывается в древе снимком из файла.
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="callout note"
      data-testid="lineage-candidate"
      data-state="pending"
      data-parent-name={candidate.parentName}
    >
      <span className="callout-label">{label}</span>
      В файле указана концепция-родитель „{candidate.parentName}“. В базе найдено:
      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
        {candidate.matches.map((m) => {
          const armed = state.arm === m.id;
          return (
            <li key={m.id} data-testid="lineage-match" data-match-id={m.id}>
              <span>
                {m.title} · {fmtDate(m.createdAt)}
              </span>{" "}
              {armed ? (
                <>
                  <button
                    type="button"
                    className="action-btn primary"
                    disabled={state.busy}
                    onClick={() => void onLink(m.id)}
                    data-testid="lineage-link-confirm"
                  >
                    Точно связать?
                  </button>{" "}
                  <button
                    type="button"
                    className="action-btn"
                    disabled={state.busy}
                    onClick={() => onArm(null)}
                    data-testid="lineage-link-cancel"
                  >
                    Отмена
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="action-btn primary"
                    disabled={state.busy || state.arm !== null}
                    onClick={() => onArm(m.id)}
                    data-testid="lineage-link"
                  >
                    Связать
                  </button>{" "}
                  <button
                    type="button"
                    className="action-btn"
                    disabled={state.busy || state.arm !== null}
                    onClick={onSkip}
                    data-testid="lineage-skip"
                  >
                    Пропустить
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {state.error && (
        <div role="alert" className="sec-warning-item" style={{ marginTop: 6 }}>
          <span className="warn-icon">⚠</span>
          <span>{state.error}</span>
        </div>
      )}
    </div>
  );
}

export function ImportPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);
  const [resultId, setResultId] = useState<string | null>(null);
  // 8.5: предложения родителя (только с совпадениями) и их состояния
  const [candidates, setCandidates] = useState<LineageCandidate[]>([]);
  const [candStates, setCandStates] = useState<CandidateState[]>([]);

  function pick(f: File | null | undefined) {
    setError(null);
    setWarnings([]);
    setResultId(null);
    setCandidates([]);
    setCandStates([]);
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
    setCandidates([]);
    setCandStates([]);
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function confirmImport() {
    if (!file) return;
    setPhase("uploading");
    setError(null);
    try {
      const { id, warnings: w, lineageCandidates } = await importFile(file);
      const withMatches = lineageCandidates.filter((c) => c.matches.length > 0);
      if (w.length === 0 && withMatches.length === 0) {
        // Без предупреждений и предложений — сразу к документу
        navigate(`/synthesis/${id}`);
        return;
      }
      setResultId(id);
      setWarnings(w);
      setCandidates(withMatches);
      setCandStates(
        withMatches.map(() => ({ kind: "pending", arm: null, busy: false, error: null })),
      );
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

  const setCand = (i: number, upd: (s: CandidateState) => CandidateState) =>
    setCandStates((list) => list.map((s, j) => (j === i ? upd(s) : s)));

  async function linkCandidate(i: number, matchId: string) {
    const cand = candidates[i];
    if (!resultId || !cand) return;
    setCand(i, (s) => (s.kind === "pending" ? { ...s, busy: true, error: null } : s));
    try {
      await linkParent(resultId, cand.parentName, matchId);
      setCand(i, () => ({ kind: "linked", matchId }));
    } catch (err) {
      // LINEAGE_EXISTS — пара уже есть: цель достигнута, считаем связанной
      if (err instanceof ApiError && err.code === "LINEAGE_EXISTS") {
        setCand(i, () => ({ kind: "linked", matchId }));
        return;
      }
      setCand(i, (s) =>
        s.kind === "pending" ? { ...s, busy: false, arm: null, error: linkErrorText(err) } : s,
      );
    }
  }

  // Все блоки решены и хотя бы один связан → к синтезу (п.5 запроса)
  useEffect(() => {
    if (phase !== "done" || !resultId || candStates.length === 0) return;
    const allDecided = candStates.every((s) => s.kind !== "pending");
    const anyLinked = candStates.some((s) => s.kind === "linked");
    if (allDecided && anyLinked) navigate(`/synthesis/${resultId}`);
  }, [phase, resultId, candStates, navigate]);

  return (
    <div className="input-form">
      <h1 className="form-section-title">Импорт HTML-файла PhiloSynth</h1>

      {phase === "uploading" && (
        <LoadingSpinner label="Загрузка и разбор файла…" />
      )}

      {phase === "done" && resultId && (
        <div className="form-group full">
          <div className="submit-note">
            {warnings.length > 0
              ? "Импорт завершён. Обнаружены проблемы с метаданными — документ отображается, проверьте параметры перед перегенерацией."
              : "Импорт завершён."}
          </div>
          {candidates.map((cand, i) => {
            const st = candStates[i];
            return st ? (
              <LineageCandidateBlock
                key={`${cand.parentName}#${cand.position}`}
                candidate={cand}
                state={st}
                onArm={(matchId) =>
                  setCand(i, (s) => (s.kind === "pending" ? { ...s, arm: matchId, error: null } : s))
                }
                onLink={(matchId) => linkCandidate(i, matchId)}
                onSkip={() => setCand(i, () => ({ kind: "skipped" }))}
              />
            ) : null;
          })}
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
