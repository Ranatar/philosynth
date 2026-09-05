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
 *   экспорт — 4.2) появятся в своих беседах — заглушек с мёртвыми
 *   обработчиками не рисуем.
 * - Беседа 4.1: кнопки режимов «◈ Оппонент / ◈ Переводчик / ◈ Временной
 *   срез» + ModeModal. Видимость — порт updateModeButtons [11799]:
 *   только при капсуле (sectionOrder содержит capsule И capsuleHtml
 *   непуст); счётчик результатов « (N)» — GET /modes при загрузке,
 *   обновление через onResultsChanged модалки.
 * - Беседа 5.2: ручное редактирование элементов — ✎ на строках таблиц
 *   тезисов/глоссария (SectionView → ElementEditor по месту) и в
 *   NodePanel графа (CategoryEditor поверх GraphModal); после правки
 *   разделы перечитываются транспортом чтения, граф — GET /categories;
 *   «Перегенерировать затронутые» открывает EditModal с предотмеченными
 *   разделами (единственный путь — планы §2.6).
 */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";

import { getCategories, getGlossary, getTheses } from "../api/elements";
import {
  ElementEditor,
  type EditableElement,
  type SaveOutcome,
} from "../components/edit/ElementEditor";
import type { EditableRowRef } from "../components/document/SectionView";
import { getAncestors } from "../api/lineage";
import { DocumentView } from "../components/document/DocumentView";
import { GenealogyTree } from "../components/lineage/GenealogyTree";
import { EditModal } from "../components/edit/EditModal";
import { ContextLogViewer } from "../components/logs/ContextLogViewer";
import GraphModal from "../components/graph/GraphModal";
import { downloadExport, EXPORT_FORMATS } from "../api/export";
import {
  MODE_ORDER,
  MODE_UI,
  ModeModal,
} from "../components/modes/ModeModal";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";
import { GenerationProgress } from "../components/synthesis/GenerationProgress";
import { PauseModal } from "../components/synthesis/PauseModal";
import { useStreamingGeneration } from "../hooks/useStreamingGeneration";
import { getModes } from "../api/modes";
import { useSynthesisStore } from "../stores/synthesis-store";

import type { GraphData } from "@philosynth/shared/types/graph";
import type { ModeKey } from "@philosynth/shared/types/modes";
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
  // Беседа 2.3: модалка редактирования. С 5.2 кнопка — только владельцу
  // (SynthesisFull.isOwner); до того была оптимистична для всех, 403
  // показывался ошибкой плана.
  const [editOpen, setEditOpen] = useState(false);
  // Беседа 5.2: предотмеченные на перегенерацию разделы при открытии
  // EditModal из «Перегенерировать затронутые» ElementEditor
  const [editInitialRegen, setEditInitialRegen] = useState<string[] | undefined>(
    undefined,
  );
  // Беседа 5.2 (п. 7): редактор строки таблицы тезисов/глоссария по месту
  const [inlineEdit, setInlineEdit] = useState<{
    sectionKey: string;
    target: EditableElement;
  } | null>(null);
  const [inlineEditError, setInlineEditError] = useState<string | null>(null);

  // Беседа 1.7: граф категорий — данные грузятся по клику на кнопку
  const [graphOpen, setGraphOpen] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  // Беседа 4.2: выпадающее меню «⤓ Экспорт» (HTML/MD/Mermaid/PNG/JSON)
  const [exportOpen, setExportOpen] = useState(false);

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

  /* ── Беседа 5.2: ручное редактирование элементов ──
     Кнопки ✎ на строках таблиц (SectionView) и «✎ Редактировать» в
     NodePanel (GraphModal). Владение — оптимистично (как «✎ Изменить»
     2.3); блокировка по status='generating'/paused (сервер: 409). */
  const openInlineEditor = useCallback(
    async (row: EditableRowRef) => {
      if (!id) return;
      setInlineEditError(null);
      try {
        if (row.kind === "thesis") {
          const theses = await getTheses(id);
          const num = Number.parseInt(row.cells[0] ?? "", 10);
          const t =
            (Number.isFinite(num) ? theses.find((x) => x.thesisNum === num) : undefined) ??
            theses[row.rowIndex];
          if (!t) throw new Error("Строка тезиса не найдена в данных синтеза");
          setInlineEdit({
            sectionKey: row.sectionKey,
            target: { kind: "thesis", element: t },
          });
        } else {
          const terms = [...(await getGlossary(id))].sort(
            (a, b) => a.position - b.position,
          );
          const byText = terms.find((x) => x.term === (row.cells[0] ?? ""));
          const g = terms[row.rowIndex] ?? byText;
          const chosen =
            g && byText && g.id !== byText.id && g.term !== (row.cells[0] ?? "")
              ? byText
              : g;
          if (!chosen) throw new Error("Строка глоссария не найдена в данных синтеза");
          const columnKeys = [
            ...new Set([
              ...row.headers.slice(2),
              ...terms.flatMap((x) => Object.keys(x.extraColumns)),
            ]),
          ];
          setInlineEdit({
            sectionKey: row.sectionKey,
            target: { kind: "glossary_term", element: chosen, columnKeys },
          });
        }
      } catch (err) {
        setInlineEditError(
          err instanceof Error ? err.message : "Не удалось открыть редактор",
        );
      }
    },
    [id],
  );

  // После PATCH/отката: элемент в редакторе — из ответа, разделы —
  // транспортом чтения (html_content перерисован сервером 5.1)
  const handleInlineSaved = useCallback(
    (outcome: SaveOutcome) => {
      setInlineEdit((cur) =>
        cur
          ? {
              sectionKey: cur.sectionKey,
              target: {
                ...cur.target,
                element: outcome.element,
              } as EditableElement,
            }
          : cur,
      );
      void reloadSections();
    },
    [reloadSections],
  );

  const handleRegenerateAffected = useCallback((keys: string[]) => {
    setInlineEdit(null);
    setGraphOpen(false);
    setEditInitialRegen(keys);
    setEditOpen(true);
  }, []);

  const refreshGraphData = useCallback(async () => {
    if (!id) return;
    try {
      setGraphData(await getCategories(id));
    } catch {
      /* граф — вторичное представление; сбой перечитки не критичен */
    }
  }, [id]);

  const handleGraphElementSaved = useCallback(() => {
    void reloadSections();
    void refreshGraphData();
  }, [reloadSections, refreshGraphData]);

  const handleAutoRenamed = useCallback(() => {
    void reloadSections();
    void refreshGraphData();
  }, [reloadSections, refreshGraphData]);

  /* ── Беседа 4.1: режимы. Видимость кнопок — порт updateModeButtons
     [11799]: hasCapsule = capsule в sectionOrder И capsuleHTML непуст;
     счётчики — GET /modes (по готовности синтеза с капсулой). ── */
  const [modeOpen, setModeOpen] = useState<ModeKey | null>(null);
  const [modeCounts, setModeCounts] = useState<Record<string, number>>({});
  const hasCapsule =
    !!synthesis &&
    (synthesis.sectionOrder ?? []).includes("capsule") &&
    !!synthesis.capsuleHtml;
  const synthesisIdForModes = synthesis?.id ?? null;
  // Стабильная ссылка (грабля R3: инлайн-колбэк в props модалки менял
  // идентичность её refetch каждый рендер); prev при том же счётчике —
  // без нового объекта, чтобы не гонять рендеры по кругу
  const onModeResultsChanged = useCallback(
    (mk: ModeKey, count: number) =>
      setModeCounts((prev) =>
        prev[mk] === count ? prev : { ...prev, [mk]: count },
      ),
    [],
  );
  useEffect(() => {
    setModeCounts({});
    if (!synthesisIdForModes || !hasCapsule) return;
    if (editOpen) return; // пока модалка открыта, счётчики не гоняем
    let cancelled = false;
    getModes(synthesisIdForModes)
      .then((modes) => {
        if (cancelled) return;
        const counts: Record<string, number> = {};
        for (const [k, list] of Object.entries(modes)) counts[k] = list.length;
        setModeCounts(counts);
      })
      .catch(() => {
        /* счётчики — украшение; сбой молча пропускаем */
      });
    return () => {
      cancelled = true;
    };
    // editOpen в deps: план с режимными шагами / подраздельный каскад
    // меняют результаты — закрытие EditModal перечитывает счётчики
    // (паритет updateModeButtons после applyEditPlan исходника)
  }, [synthesisIdForModes, hasCapsule, editOpen]);

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
  // Беседа 5.2 («По факту 5.2»): владение — из SynthesisFull.isOwner
  // (оптимизм «покажем всем, 403 решит» 2.3/4.1 снят тем же флагом)
  const isOwner = synthesis?.isOwner ?? false;

  // Смена синтеза — редактор по месту закрывается
  useEffect(() => {
    setInlineEdit(null);
    setInlineEditError(null);
  }, [id]);

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
    <div>
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
          {isOwner && (
            <button
              type="button"
              className="action-btn"
              onClick={() => setEditOpen(true)}
              disabled={live}
            >
              ✎ Изменить
            </button>
          )}
          {hasCapsule &&
            isOwner &&
            MODE_ORDER.map((mk) => (
              <button
                key={mk}
                type="button"
                className="action-btn"
                onClick={() => setModeOpen(mk)}
                disabled={live}
              >
                ◈ {MODE_UI[mk].title.slice(2)}
                {(modeCounts[mk] ?? 0) > 0 ? ` (${modeCounts[mk]})` : ""}
              </button>
            ))}
          {/* Беседа 4.2: экспорт (скачивание с сервера, 03 §2.11) */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="action-btn"
              onClick={() => setExportOpen((v) => !v)}
              disabled={live}
            >
              ⤓ Экспорт
            </button>
            {exportOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  zIndex: 50,
                  display: "flex",
                  flexDirection: "column",
                  background: "var(--paper, #1a1814)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  minWidth: 130,
                }}
              >
                {EXPORT_FORMATS.map(({ fmt, label }) => (
                  <button
                    key={fmt}
                    type="button"
                    className="action-btn"
                    style={{ border: "none", textAlign: "left" }}
                    onClick={() => {
                      setExportOpen(false);
                      downloadExport(id ?? "", fmt);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
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
        <div style={{ marginBottom: 24 }}>
          <GenerationProgress
            sections={progressSections}
            complete={stream.complete}
            paused={paused}
            onPauseBadgeClick={() => setPauseModalOpen(true)}
            onAbort={handleAbort}
            showAbort={synthesis.status === "generating" && !paused}
          />
          {stream.error && (
            <div className="callout warning">
              <span className="callout-label">Ошибка генерации</span>
              {stream.error}
            </div>
          )}
        </div>
      )}

      {inlineEditError && (
        <div className="callout warning">
          <span className="callout-label">Редактор</span>
          {inlineEditError}
        </div>
      )}

      <DocumentView
        synthesis={synthesis}
        summaries={summaries}
        sections={sections}
        onOpenLog={() => setLogOpen(true)}
        editable={isOwner && !live}
        onRowEdit={(row) => void openInlineEditor(row)}
        inlineEditorFor={(key) =>
          inlineEdit && inlineEdit.sectionKey === key ? (
            <ElementEditor
              key={inlineEdit.target.element.id}
              synthesisId={synthesis.id}
              target={inlineEdit.target}
              disabled={live}
              startInEditMode
              onSaved={handleInlineSaved}
              onAutoRenamed={handleAutoRenamed}
              onRegenerateAffected={handleRegenerateAffected}
              onClose={() => setInlineEdit(null)}
            />
          ) : undefined
        }
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
                  <div className="doc-meta-val">
                    Родительские концепции:{" "}
                    {synthesis.parentSyntheses.map((p, i) => (
                      <span key={p.id}>
                        {i > 0 && ", "}
                        <Link to={`/synthesis/${p.id}`}>«{p.title}»</Link>
                      </span>
                    ))}
                  </div>
                )}
                <div className="doc-meta-key" style={{ marginTop: 8 }}>
                  <Link to={`/catalog?descendantsOf=${synthesis.id}`}>
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
      <EditModal
        open={editOpen}
        initialRegen={editInitialRegen}
        onClose={() => {
          setEditOpen(false);
          setEditInitialRegen(undefined);
        }}
      />

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

      {/* Беседа 4.1: модалка режимов */}
      <ModeModal
        open={modeOpen !== null}
        synthesisId={synthesis.id}
        modeKey={modeOpen}
        onClose={() => setModeOpen(null)}
        onResultsChanged={onModeResultsChanged}
      />

      {/* Беседа 1.7: модалка графа категорий */}
      <GraphModal
        open={graphOpen}
        data={graphData}
        extGraphMetrics={synthesis.extGraphMetrics}
        onClose={() => setGraphOpen(false)}
        synthesisId={synthesis.id}
        editable={isOwner && !live}
        editDisabled={isOwner && live}
        onElementSaved={handleGraphElementSaved}
        onRegenerateAffected={handleRegenerateAffected}
      />
    </div>
  );
}

function PageError({ code, text }: { code: string; text: string }) {
  return (
    <div className="input-form" style={{ textAlign: "center" }}>
      <div
        style={{
          fontFamily: "var(--serif)",
          fontSize: 48,
          color: "var(--rule-strong)",
        }}
      >
        {code}
      </div>
      <div className="submit-note" style={{ maxWidth: "100%" }}>
        {text}
      </div>
    </div>
  );
}
