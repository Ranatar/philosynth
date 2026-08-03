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
 * прогресса (клик — открыть заново, как _showPauseBadge). Confirm
 * деградации зависимостей при skip [25686] — перед отправкой
 * resume_generation(skip); адаптация: без точного списка затронутых
 * разделов (расчёт требует resolvedDeps/substitution_map с сервера —
 * TODO(2.1): эндпоинт-кандидат — расширение /advice списком
 * затронутых при пропуске), текст обобщён по исходнику.
 *
 * cancel (§3.1): user-abort финализирует частичное по правилам stop БЕЗ
 * паузы — текст confirm скорректирован против исходника [24681], где
 * abort вёл в модалку паузы.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import {
  createSynthesis,
  type CreateSynthesisInput,
} from "../api/syntheses";
import { GenerationProgress } from "../components/synthesis/GenerationProgress";
import { PauseModal } from "../components/synthesis/PauseModal";
import { SynthesisForm } from "../components/synthesis/SynthesisForm";
import {
  useStreamingGeneration,
} from "../hooks/useStreamingGeneration";
import { usePoolStore } from "../stores/pool-store";

const REDIRECT_DELAY_MS = 1200;

function serverErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const details =
      err.details && typeof err.details === "object"
        ? Object.entries(err.details as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join("; ")
        : "";
    return details ? `${err.message} (${details})` : err.message;
  }
  return err instanceof Error ? err.message : "Не удалось запустить генерацию";
}

export function CreateSynthesisPage() {
  const navigate = useNavigate();

  const [synthesisId, setSynthesisId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [expectedSections, setExpectedSections] = useState<string[]>([]);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleComplete = useCallback(() => {
    // Короткая пауза, чтобы пользователь увидел «✓ Завершён» (07, тест 4)
    if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    redirectTimerRef.current = setTimeout(() => {
      setSynthesisId((id) => {
        if (id) navigate(`/synthesis/${id}`);
        return id;
      });
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

  const handleSubmit = async (input: CreateSynthesisInput) => {
    // Пул (1.5b): перед генерацией — refreshAllSynthParticipants [4940]
    // + сброс индикатора просмотра (интеграция из беседы 1.5; снимок
    // текущей — N/A: локальных правок в сервисе нет, см. pool-store)
    usePoolStore.getState().prepareForGeneration();
    setSubmitting(true);
    setServerError(null);
    try {
      const { id } = await createSynthesis(input);
      setExpectedSections(["sum", ...input.sections]);
      setSynthesisId(id);
    } catch (err) {
      setServerError(serverErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResumeGeneration = (
    mode: Parameters<typeof stream.resumeGeneration>[0],
  ) => {
    if (mode === "skip") {
      // Адаптация confirm деградации [25686]: без точного списка
      // затронутых разделов (нужны deps/substitution_map с сервера)
      const label = stream.pause?.pausedState.kind === "gen"
        ? stream.pause.pausedState.sectionLabel
        : "?";
      const ok = window.confirm(
        `Пропуск раздела «${label}» может привести к деградации ` +
          "качества следующих разделов, которые от него зависят " +
          "(для части из них нет замены).\n\nВсё равно продолжить?",
      );
      if (!ok) return; // pausedState цел — модалка остаётся
    }
    setPauseModalOpen(false);
    stream.resumeGeneration(mode);
  };

  const handleAbort = () => {
    const ok = window.confirm(
      "Остановить текущую генерацию?\n\n" +
        "Успевший контент будет зафиксирован как финальное состояние " +
        "документа (без возможности возобновления).",
    );
    if (!ok) return;
    stream.cancel();
  };

  const generating = !!synthesisId && !stream.complete && !stream.error;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="meta-label">генерация</div>
      <h1 className="mt-1 text-2xl">Новый синтез</h1>

      <div className="mt-6 rounded border border-rule bg-paper p-5">
        <SynthesisForm
          onSubmit={handleSubmit}
          busy={submitting || !!synthesisId}
          serverError={serverError}
        />
      </div>

      {synthesisId && (
        <div className="mt-6">
          <GenerationProgress
            sections={stream.sections}
            complete={stream.complete}
            paused={!!stream.pause}
            onPauseBadgeClick={() => setPauseModalOpen(true)}
            onAbort={handleAbort}
            showAbort={generating && !stream.pause}
          />
          {stream.error && (
            <div className="mt-3 rounded border border-red bg-red/5 p-3 text-sm text-red">
              {stream.error}
            </div>
          )}
          {stream.complete && (
            <div className="mt-3 font-mono text-xs text-ink-dim">
              Готово — открываю документ…
            </div>
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
