/**
 * Страница создания синтеза. Беседа 1.5 (запрос 1, п. 1; заглушка 0.4
 * заменена).
 *
 * Поток: SynthesisForm → POST /syntheses → GenerationProgress (WebSocket,
 * useStreamingGeneration) → по generation_complete redirect на
 * /synthesis/:id (07, тест 4). Форма остаётся видимой и блокируется на
 * время генерации (как submitBtn.disabled исходника).
 *
 * Интеграция PauseModal/PauseBadge (TODO(1.5) из 1.4b — закрыт):
 * generation_paused открывает модалку; закрытие оставляет бейдж в шапке
 * прогресса (клик — открыть заново, как _showPauseBadge). Вопрос о
 * деградации зависимостей при skip [25686] задаёт ТОЛЬКО PauseModal
 * (resumeGenConfirmed с точным списком skipDegrades сервера, 2.2); прежний
 * второй вопрос страницы общим текстом (адаптация 1.5) снят 12.4 (Д-2).
 *
 * cancel (§3.1): user-abort финализирует частичное по правилам stop БЕЗ
 * паузы — текст предупреждения скорректирован против исходника [24681],
 * где abort вёл в модалку паузы; подтверждение — второй шаг кнопок в
 * GenerationProgress (12.4, Д-17), не window.confirm.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import {
  createSynthesis,
  type CreateSynthesisInput,
  type GenealogyWarningDto,
} from "../api/syntheses";
import { GenerationProgress } from "../components/synthesis/GenerationProgress";
import { PauseModal } from "../components/synthesis/PauseModal";
import { SynthesisForm } from "../components/synthesis/SynthesisForm";
import {
  useStreamingGeneration,
} from "../hooks/useStreamingGeneration";
import { usePoolStore } from "../stores/pool-store";
import { tl } from "@philosynth/shared/i18n/t";

const REDIRECT_DELAY_MS = 1200;

/** 8.7 (п. 6): 403 META_NOT_ALLOWED — название концепции и причина
 *  словами, а не общий текст ошибки; details = { participants: id, title }
 *  (03 §4.3, metaNotAllowedJson 8.6) */
export function metaNotAllowedText(details: unknown): string {
  const d = details && typeof details === "object"
    ? (details as Record<string, unknown>)
    : {};
  const title = typeof d.title === "string" && d.title.trim() ? d.title.trim() : null;
  return title
    ? tl("createSynthesisPage.metaForbiddenTitled", "Концепция «{title}»: автор не разрешил брать её в мета-синтез — уберите её из участников.", { title })
    : tl("createSynthesisPage.metaForbidden", "Автор одной из концепций-участников не разрешил брать её в мета-синтез.");
}

export function serverErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "META_NOT_ALLOWED") return metaNotAllowedText(err.details);
    const details =
      err.details && typeof err.details === "object"
        ? Object.entries(err.details as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join("; ")
        : "";
    return details ? `${err.message} (${details})` : err.message;
  }
  return err instanceof Error ? err.message : tl("createSynthesisPage.startFailed", "Не удалось запустить генерацию");
}

export function CreateSynthesisPage() {
  const navigate = useNavigate();

  const [synthesisId, setSynthesisId] = useState<string | null>(null);
  /* Актуальный id для отложенного редиректа. ПОПУТНАЯ ПОЧИНКА (беседа
     3.2, найдено браузерным тестом test-32): прежний код звал navigate()
     ВНУТРИ функционального апдейтера setSynthesisId — React исполняет
     апдейтеры в рендер-фазе → «Cannot update BrowserRouter while
     rendering CreateSynthesisPage». Читаем из ref, апдейтер не нужен. */
  const synthesisIdRef = useRef<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [expectedSections, setExpectedSections] = useState<string[]>([]);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleComplete = useCallback(() => {
    // Короткая пауза, чтобы пользователь увидел «✓ Завершён» (07, тест 4)
    if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    redirectTimerRef.current = setTimeout(() => {
      const id = synthesisIdRef.current;
      if (id) navigate(`/synthesis/${id}`);
    }, REDIRECT_DELAY_MS);
  }, [navigate]);

  useEffect(
    () => () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    },
    [],
  );

  const stream = useStreamingGeneration({
    synthesisId,
    expectedSections,
    onComplete: handleComplete,
  });

  // Новая пауза → модалка открывается сама (showPauseModal исходника)
  const pauseKey = stream.pause?.pausedState.timestamp ?? null;
  useEffect(() => {
    if (pauseKey !== null) setPauseModalOpen(true);
  }, [pauseKey]);

  // Беседа 3.2: неблокирующие генеалогические предупреждения из ответа
  // POST (аддитивное поле warnings, беседа 3.1 — M3). Предполётный confirm
  // с теми же текстами уже показала форма (checkGenealogyOverlaps на
  // клиенте); серверные рисуем жёлтым боксом над прогрессом — синтез уже
  // создан, отменять нечего.
  const [genWarnings, setGenWarnings] = useState<GenealogyWarningDto[]>([]);

  const handleSubmit = async (input: CreateSynthesisInput) => {
    // Пул (1.5b): перед генерацией — refreshAllSynthParticipants [4940]
    // + сброс индикатора просмотра (интеграция из беседы 1.5; снимок
    // текущей — N/A: локальных правок в сервисе нет, см. pool-store)
    usePoolStore.getState().prepareForGeneration();
    setSubmitting(true);
    setServerError(null);
    setGenWarnings([]);
    try {
      const { id, warnings } = await createSynthesis(input);
      setExpectedSections(["sum", ...input.sections]);
      setGenWarnings(warnings ?? []);
      synthesisIdRef.current = id;
      setSynthesisId(id);
    } catch (err) {
      setServerError(serverErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // 12.4 (Д-2): без второго вопроса — его задаёт PauseModal по skipDegrades
  const handleResumeGeneration = (
    mode: Parameters<typeof stream.resumeGeneration>[0],
  ) => {
    setPauseModalOpen(false);
    stream.resumeGeneration(mode);
  };

  // 12.4 (Д-17): сюда приходит уже подтверждённое вторым шагом кнопок
  const handleAbort = () => {
    stream.cancel();
  };

  const generating = !!synthesisId && !stream.complete && !stream.error;

  return (
    <div>
      {/* Контейнер формы исходника [3628]: .input-form + .form-section-title */}
      <div className="input-form">
        <h1 className="form-section-title">
          {tl("createSynthesisPage.pageTitle", "Новый синтез — § 0, Параметры Синтеза Концепции")}
        </h1>
        <SynthesisForm
          onSubmit={handleSubmit}
          busy={submitting || !!synthesisId}
          serverError={serverError}
        />
      </div>

      {synthesisId && (
        <div>
          {/* Беседа 3.2: серверные генеалогические предупреждения (POST
              warnings, 3.1) — неблокирующе, паритет замысла confirm */}
          {genWarnings.length > 0 && (
            <div className="sec-warnings">
              {genWarnings.map((w, i) => (
                <div key={i} className="sec-warning-item">
                  <span className="warn-icon">
                    {w.level === "warn" ? "⚠" : "ℹ"}
                  </span>
                  <span>{w.text}</span>
                </div>
              ))}
            </div>
          )}
          <GenerationProgress
            sections={stream.sections}
            complete={stream.complete}
            paused={!!stream.pause}
            onPauseBadgeClick={() => setPauseModalOpen(true)}
            onAbort={handleAbort}
            showAbort={generating && !stream.pause}
          />
          {stream.error && (
            <div className="callout warning">
              <span className="callout-label">{tl("createSynthesisPage.generationError", "Ошибка генерации")}</span>
              {stream.error}
            </div>
          )}
          {stream.complete && (
            <div className="pool-status ok">{tl("createSynthesisPage.doneOpening", "Готово — открываю документ…")}</div>
          )}
        </div>
      )}

      <PauseModal
        open={pauseModalOpen && !!stream.pause}
        pausedState={stream.pause?.pausedState ?? null}
        estimates={stream.pause?.estimates}
        onResumeGeneration={handleResumeGeneration}
        onResumePlan={(mode) => {
          // Плановых пауз в потоке создания не возникает до 2.2;
          // planId у клиента здесь нет — заглушка (см. шапку файла)
          console.warn("resume_plan из CreateSynthesisPage не поддержан:", mode);
        }}
        onClose={() => setPauseModalOpen(false)}
      />
    </div>
  );
}
