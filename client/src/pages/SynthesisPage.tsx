/**
 * Страница просмотра синтеза. Беседа 1.6b (запрос 1, пп. 2 и 8;
 * заглушка 0.4 заменена).
 *
 * - Загрузка по ID: GET /syntheses/:id + /sections + /sections/:key
 *   (транспорт 1.6) через synthesis-store; NOT_FOUND → 404-состояние,
 *   FORBIDDEN → 403-состояние (чужой непубличный синтез).
 * - Рендер DocumentView (шапка + оглавление + разделы + футер).
 * - status='generating' (п. 8): подписка на WS через
 *   useStreamingGeneration в режиме viewOnly — ОТКРЫТИЕ СТРАНИЦЫ НЕ
 *   ЗАПУСКАЕТ ГЕНЕРАЦИЮ ЗАНОВО (флаг добавлен в ws/handler беседой 1.6);
 *   готовые разделы дотягиваются транспортом чтения по мере section_done
 *   (reloadSections), по generation_complete перезагружается весь синтез.
 * - status='paused': PauseModal с pausedState/pauseEstimates ИЗ
 *   GET /syntheses/:id (закрытие маркера 1.6b «источник pausedState»);
 *   живая WS-пауза текущего прогона перекрывает снапшот из БД.
 * - Минимальный actions-bar (разметка [4134–4168]): «ДОКУМЕНТ
 *   СГЕНЕРИРОВАН» + «◈ Граф» (беседа 1.7: GET /categories по клику →
 *   GraphModal; пустой граф открывает модалку с пустым состоянием) +
 *   «Распечатать»; остальные кнопки (Изменить — 2.3, лог — 2.4,
 *   экспорт — 4.2, режимы — 4.1) появятся в своих беседах — заглушек
 *   с мёртвыми обработчиками не рисуем.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getCategories } from "../api/elements";
import { getAncestors } from "../api/lineage";
import { DocumentView } from "../components/document/DocumentView";
import { GenealogyTree } from "../components/lineage/GenealogyTree";
import { EditModal } from "../components/edit/EditModal";
import { ContextLogViewer } from "../components/logs/ContextLogViewer";
import GraphModal from "../components/graph/GraphModal";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";
import { GenerationProgress } from "../components/synthesis/GenerationProgress";
import { PauseModal } from "../components/synthesis/PauseModal";
import { useStreamingGeneration } from "../hooks/useStreamingGeneration";
import { useSynthesisStore } from "../stores/synthesis-store";

import type { GraphData } from "@philosynth/shared/types/graph";
import {
  lineageNodeToGenealogy,
  type GenealogyNode,
} from "../utils/genealogy";

export function SynthesisPage() {
  const { id } = useParams<{ id: string }>();

  const synthesis = useSynthesisStore((s) => s.synthesis);
  const summaries = useSynthesisStore((s) => s.summaries);
  const sections = useSynthesisStore((s) => s.sections);
  const loading = useSynthesisStore((s) => s.loading);
  const errorCode = useSynthesisStore((s) => s.errorCode);
  const load = useSynthesisStore((s) => s.load);
  const reloadSections = useSynthesisStore((s) => s.reloadSections);
  const clear = useSynthesisStore((s) => s.clear);

  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  // Беседа 2.4: модалка лога контекста
  const [logOpen, setLogOpen] = useState(false);
  // Беседа 2.3: модалка редактирования. Кнопка оптимистична для всех
  // залогиненных (SynthesisFull не несёт userId — 1.6b); не-владельцу
  // сервер ответит 403, модалка покажет ошибку плана.
  const [editOpen, setEditOpen] = useState(false);

  // Беседа 1.7: граф категорий — данные грузятся по клику на кнопку
  const [graphOpen, setGraphOpen] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  const handleOpenGraph = async () => {
    if (!id || graphLoading) return;
    setGraphLoading(true);
    try {
      const data = await getCategories(id);
      setGraphData(data);
      setGraphOpen(true); // пустой граф тоже открывает модалку (пустое состояние)
    } catch {
      // 403/404/сеть — модалку не открываем; страница уже показала доступ
      setGraphData(null);
    } finally {
      setGraphLoading(false);
    }
  };

  useEffect(() => {
    if (id) void load(id);
    return () => clear();
  }, [id, load, clear]);

  /* ── Беседа 3.2 (п. 4): секция «Генеалогия» под шапкой документа ──
     Только для мета-синтезов (есть родители-концепции) — паритет
     updateGenealogyInHeader [22415]: «не показываем, если все участники —
     философы». Дерево — GET /lineage/ancestors (корень depth 0 — сам
     синтез, children — родители); узлы с synthesisId кликабельны.
     Сбой запроса секцию молча скрывает (генеалогия — дополнение, не
     содержимое документа). Перезагрузка по synthesis.id, а не по
     parentSyntheses (ссылка меняется при каждом load). */
  const isMetaSynthesis = (synthesis?.parentSyntheses.length ?? 0) > 0;
  const [genealogyTree, setGenealogyTree] = useState<GenealogyNode | null>(
    null,
  );
  const synthesisIdLoaded = synthesis?.id ?? null;
  useEffect(() => {
    setGenealogyTree(null);
    if (!synthesisIdLoaded || !isMetaSynthesis) return;
    let cancelled = false;
    getAncestors(synthesisIdLoaded)
      .then((tree) => {
        if (!cancelled) setGenealogyTree(lineageNodeToGenealogy(tree));
      })
      .catch(() => {
        if (!cancelled) setGenealogyTree(null);
      });
    return () => {
      cancelled = true;
    };
  }, [synthesisIdLoaded, isMetaSynthesis]);

  const live = synthesis?.status === "generating" || synthesis?.status === "paused";

  // П. 8: подписка «только просмотр» — viewOnly не запускает генерацию.
  // Беседа 2.4: подписка держится и при status='ready' — standalone-
  // перегенерация (POST /regenerate/:key, 2.2) идёт под слотом БЕЗ смены
  // статуса синтеза, и её section_done иначе не дошёл бы до страницы;
  // события обновляют разделы (reloadSections ниже) и открытый лог
  // (refreshKey) — аналог refreshCtxLogIfOpen исходника [23306]
  const stream = useStreamingGeneration({
    synthesisId: id ?? null,
    expectedSections: synthesis?.sectionOrder,
    viewOnly: true,
    onComplete: () => {
      if (id) void load(id);
    },
  });

  // По мере section_done дотягиваем html готовых разделов транспортом
  // чтения (WS отдаёт html, но единый источник контента — БД через REST)
  const doneCount = stream.sections.filter((s) => s.status === "done").length;
  const prevDoneRef = useRef(0);
  useEffect(() => {
    if (doneCount > prevDoneRef.current) void reloadSections();
    prevDoneRef.current = doneCount;
  }, [doneCount, reloadSections]);

  // Пауза: живая (WS, текущий прогон) перекрывает снапшот из GET /:id
  const pausedState =
    stream.pause?.pausedState ?? synthesis?.pausedState ?? null;
  const pauseEstimates =
    stream.pause?.estimates ?? synthesis?.pauseEstimates ?? {};
  const paused = !!pausedState;

  // Новая живая пауза → модалка открывается сама (showPauseModal);
  // снапшот из БД (status='paused' при заходе) модалку не навязывает —
  // доступна по бейджу в GenerationProgress
  const pauseKey = stream.pause?.pausedState.timestamp ?? null;
  useEffect(() => {
    if (pauseKey !== null) setPauseModalOpen(true);
  }, [pauseKey]);

  // Возобновление принято → статус в БД изменился, перечитываем
  const resumedMode = stream.resumedMode;
  useEffect(() => {
    if (resumedMode !== null && id) void load(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumedMode]);

  const handleResumeGeneration = (
    mode: Parameters<typeof stream.resumeGeneration>[0],
  ) => {
    if (mode === "skip") {
      // Адаптация confirm деградации [25686] — как в 1.5 (точный список
      // затронутых требует deps с сервера, расширение /advice — 2.1/2.2)
      const label = pausedState?.kind === "gen" ? pausedState.sectionLabel : "?";
      const ok = window.confirm(
        `Пропуск раздела «${label}» может привести к деградации ` +
          "качества следующих разделов, которые от него зависят " +
          "(для части из них нет замены).\n\nВсё равно продолжить?",
      );
      if (!ok) return;
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

  // Прогресс: предзаполнение из sectionOrder уже в хуке; готовые из БД
  // разделы (заход в середине генерации) отмечаем done
  const progressSections = useMemo(() => {
    if (!synthesis) return stream.sections;
    const loadedKeys = new Set(sections.map((s) => s.key));
    return stream.sections.map((s) =>
      s.status === "pending" && loadedKeys.has(s.key)
        ? { ...s, status: "done" as const }
        : s,
    );
  }, [stream.sections, sections, synthesis]);

  /* ── Состояния страницы ── */

  if (!id) return null;

  if (errorCode === "NOT_FOUND") {
    return (
      <PageError code="404" text="Синтез не найден или был удалён." />
    );
  }
  if (errorCode === "FORBIDDEN") {
    return (
      <PageError
        code="403"
        text="Этот синтез приватный: доступен только владельцу."
      />
    );
  }
  if (errorCode) {
    return <PageError code="Ошибка" text="Не удалось загрузить синтез." />;
  }

  if (loading || !synthesis) {
    return <LoadingSpinner label="загрузка синтеза…" />;
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* actions-bar [4134] — минимум 1.6b */}
      <div className="actions-bar">
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--ink-dim)",
            letterSpacing: 1,
          }}
        >
          {live ? "ГЕНЕРАЦИЯ ДОКУМЕНТА" : "ДОКУМЕНТ СГЕНЕРИРОВАН"}
        </div>
        <div className="actions-bar-btns">
          <button
            type="button"
            className="action-btn"
            onClick={() => void handleOpenGraph()}
            disabled={graphLoading}
          >
            {graphLoading ? "Загрузка…" : "◈ Граф"}
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={() => setEditOpen(true)}
            disabled={live}
          >
            ✎ Изменить
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={() => window.print()}
          >
            Распечатать
          </button>
        </div>
      </div>

      {live && (
        <div className="mb-6">
          <GenerationProgress
            sections={progressSections}
            complete={stream.complete}
            paused={paused}
            onPauseBadgeClick={() => setPauseModalOpen(true)}
            onAbort={handleAbort}
            showAbort={synthesis.status === "generating" && !paused}
          />
          {stream.error && (
            <div className="mt-3 rounded border border-red bg-red/5 p-3 text-sm text-red">
              {stream.error}
            </div>
          )}
        </div>
      )}

      <DocumentView
        synthesis={synthesis}
        summaries={summaries}
        sections={sections}
        onOpenLog={() => setLogOpen(true)}
        afterHeader={
          // Беседа 3.2 (п. 4): «Генеалогическое древо» — только для
          // мета-синтезов; details открыт (updateGenealogyInHeader:
          // details.open = true); дерево в шапке — тёмная схема
          // (light: false, как в исходнике). Ссылки на родителей —
          // parentSyntheses (SynthesisFull) + кликабельные узлы дерева.
          isMetaSynthesis ? (
            <details className="header-disclosure" open>
              <summary>Генеалогическое древо</summary>
              <div
                className="disclosure-body"
                style={{ padding: 16, overflowX: "auto" }}
              >
                {genealogyTree ? (
                  <GenealogyTree node={genealogyTree} light={false} />
                ) : (
                  <div className="font-mono text-[11px] text-ink-dim">
                    Родительские концепции:{" "}
                    {synthesis.parentSyntheses.map((p, i) => (
                      <span key={p.id}>
                        {i > 0 && ", "}
                        <Link to={`/synthesis/${p.id}`}>«{p.title}»</Link>
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2 font-mono text-[10px]">
                  <Link
                    to={`/catalog?descendantsOf=${synthesis.id}`}
                    className="text-ink-dim hover:text-gold"
                  >
                    ◈ Потомки этой концепции в каталоге
                  </Link>
                </div>
              </div>
            </details>
          ) : undefined
        }
      />

      {/* Беседа 2.4: лог контекста. Live-обновление — refreshKey растёт по
          УЖЕ существующим событиям завершения раздела (section_done через
          doneCount, generation_complete через stream.complete); новых
          WS-сообщений про лог нет (аудит 2026-07-30). */}
      {id && (
        <ContextLogViewer
          open={logOpen}
          synthesisId={id}
          docNum={synthesis.docNum}
          title={synthesis.title}
          refreshKey={doneCount + (stream.complete ? 100000 : 0)}
          onClose={() => setLogOpen(false)}
        />
      )}

      {/* Беседа 2.3: модалка редактирования (Edit Modal + Cascade Panel) */}
      <EditModal open={editOpen} onClose={() => setEditOpen(false)} />

      <PauseModal
        open={pauseModalOpen && paused}
        pausedState={pausedState}
        estimates={pauseEstimates}
        onResumeGeneration={handleResumeGeneration}
        onResumePlan={(mode) => {
          // Плановых пауз до plan-executor'а (2.2) на странице просмотра
          // не возникает; planId у страницы нет — заглушка (как в 1.5)
          console.warn("resume_plan из SynthesisPage не поддержан:", mode);
        }}
        onClose={() => setPauseModalOpen(false)}
      />

      {/* Беседа 1.7: модалка графа категорий */}
      <GraphModal
        open={graphOpen}
        data={graphData}
        extGraphMetrics={synthesis.extGraphMetrics}
        onClose={() => setGraphOpen(false)}
      />
    </div>
  );
}

function PageError({ code, text }: { code: string; text: string }) {
  return (
    <div className="mx-auto max-w-3xl py-16 text-center">
      <div className="font-serif text-5xl text-rule-strong">{code}</div>
      <p className="mt-4 text-sm text-ink-mid">{text}</p>
    </div>
  );
}
