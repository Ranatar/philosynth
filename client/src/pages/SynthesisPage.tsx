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
 * - Беседа 8.7 (п. 4): РЕЖИМ ПРОСМОТРА. Страница больше не рассчитана
 *   только на своего: GET /syntheses/:id — гостевой путь (8.6), маршрут
 *   вынесен из-под RequireAuth. Смотрящий — по ответу сервера:
 *   isOwner / зарегистрированный (auth-store) / гость; scope 'full' или
 *   'showcase'. У невладельца: полоса «Вы смотрите публичную концепцию»
 *   (гостю — с кнопкой «Создать аккаунт»); при scope='showcase' DocumentView
 *   рисует врезку вместо разделов; кнопок графа/правки/режимов/экспорта у
 *   гостя нет (их пути под requireAuth), у зарегистрированного на витрине —
 *   тоже (403); «◈ Лог» и «⤓ Скачать промпты» — по effectiveFlags
 *   (shared/utils/visibility), а не по 403 постфактум; стоимость и токены
 *   гостю в ответе НЕ приходят — футер их не рисует (8.6). WS-подписка,
 *   GET /modes, GET /lineage/ancestors — только зарегистрированному (пути
 *   под requireAuth). 403 у гостя → страница «концепция приватна» со
 *   ссылкой на вход (state.from — возврат сюда после входа). Истёкшая на
 *   открытом документе сессия (401 → auth-store 'anonymous') перечитывает
 *   документ гостем: полоса меняется, страница не падает.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { effectiveFlags } from "@philosynth/shared/utils/visibility";

import { getCategories, getGlossary, getTheses } from "../api/elements";
import { getSynthesis } from "../api/syntheses";
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
import { TransformPanel } from "../components/edit/TransformPanel";
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
import { useAuthStore } from "../stores/auth-store";
import { useSynthesisStore } from "../stores/synthesis-store";
import { visibilityBadge } from "../utils/visibility-text";
import { getSubsectionSource, updateSubsection } from "../api/sections";
import {
  subsectionErrorText,
  type SubsectionEditState,
  type SubsectionRef,
} from "../utils/subsection-edit";

import type { GraphData } from "@philosynth/shared/types/graph";
import type { TransformDirection } from "@philosynth/shared/types/elements";
import type { ModeKey } from "@philosynth/shared/types/modes";
import {
  lineageNodeToGenealogy,
  type GenealogyNode,
} from "../utils/genealogy";

export function SynthesisPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  // Беседа 8.7: смотрящий. Гость = нет сессии в auth-store; владение —
  // из ответа сервера (isOwner, 5.2). 'restoring' считаем гостем для UI
  // (кнопок под requireAuth не рисуем), документ при этом уже грузится —
  // cookie уходит с запросом независимо от состояния store.
  const authStatus = useAuthStore((s) => s.status);
  const isGuest = authStatus !== "authenticated";

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

  // 8.7 (edge case): смена смотрящего на открытом документе — сессия
  // истекла (401 → 'anonymous') или человек вошёл — перечитать документ
  // тем, кем он теперь является; 'restoring' переходом не считается
  const prevAuthRef = useRef(authStatus);
  useEffect(() => {
    const prev = prevAuthRef.current;
    prevAuthRef.current = authStatus;
    if (authStatus === "restoring" || prev === "restoring") return;
    if (prev !== authStatus && id) void load(id);
  }, [authStatus, id, load]);

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

  /* ── Беседа 9.2: ручная правка подраздела. Карандаш у заголовка →
     исходник с сервера (GET …/subsections/:name: разметка содержимого без
     обёртки и <h4>) → поле на месте подраздела → PATCH { html } →
     перечитка разделов (пометка «⟳» у раздела — is_edited из summaries).
     Правка одна на документ; заслоны от повторного нажатия — ref'ы, не
     состояние (09 §6, 9.1). Клиент разметку не собирает и не чистит —
     это делает сервер по белому списку. ── */
  const [subEdit, setSubEdit] = useState<SubsectionEditState | null>(null);
  const subEditBusyRef = useRef(false);
  const openSubsectionEdit = useCallback(
    async (ref: SubsectionRef) => {
      if (!id || subEditBusyRef.current) return;
      subEditBusyRef.current = true;
      setInlineEdit(null);
      const base: SubsectionEditState = {
        ...ref,
        phase: "loading",
        draft: "",
        nested: [],
        error: null,
        warnings: [],
      };
      setSubEdit(base);
      try {
        const src = await getSubsectionSource(id, ref.sectionKey, ref.name);
        // Замок мог появиться после загрузки страницы (правка графа перенесла
        // таблицу): поле не открываем, говорим, чем править
        setSubEdit(
          src.lock
            ? { ...base, error: src.lock.hint }
            : { ...base, phase: "ready", draft: src.html, nested: src.nested },
        );
      } catch (err) {
        setSubEdit({ ...base, error: subsectionErrorText(err) });
      } finally {
        subEditBusyRef.current = false;
      }
    },
    [id],
  );
  const cancelSubsectionEdit = useCallback(() => {
    if (subEditBusyRef.current) return;
    setSubEdit(null);
  }, []);
  const saveSubsectionEdit = useCallback(
    async (html: string) => {
      const cur = subEdit;
      if (!id || !cur || cur.phase !== "ready" || subEditBusyRef.current) return;
      subEditBusyRef.current = true;
      // draft = набранное: строка формы пересобирается, поле неуправляемое
      setSubEdit({ ...cur, phase: "saving", draft: html, error: null });
      try {
        const res = await updateSubsection(id, cur.sectionKey, cur.name, html);
        await reloadSections(); // статус — после перечитки (09 §2, 6.2 п.4)
        setSubEdit(
          res.warnings.length
            ? { ...cur, phase: "saved", draft: html, warnings: res.warnings }
            : null,
        );
      } catch (err) {
        setSubEdit({ ...cur, phase: "ready", draft: html, error: subsectionErrorText(err) });
      } finally {
        subEditBusyRef.current = false;
      }
    },
    [id, subEdit, reloadSections],
  );
  // Фокус в поле, когда исходник приехал (поле — часть строки HTML раздела)
  const subEditReadyKey =
    subEdit && subEdit.phase === "ready" && !subEdit.error
      ? `${subEdit.sectionKey}:${subEdit.name}`
      : null;
  useEffect(() => {
    if (!subEditReadyKey || typeof document === "undefined") return;
    const area = document.querySelector<HTMLTextAreaElement>(
      "textarea[data-subsection-source]",
    );
    area?.focus();
  }, [subEditReadyKey]);

  /* ── Беседа 5.5 (п. 7): трансформация представлений graph↔theses.
     Вход — «→ Тезисы» в тулбаре GraphModal (модалка графа закрывается,
     открывается TransformPanel) и «→ Граф» над разделом тезисов. После
     transform_done / отката перечитываются разделы (html_content раздела
     заменён), граф (категории/связи) и сам синтез (total_cost_usd — в
     футере; трансформация входит в стоимость документа). ── */
  const [transformDir, setTransformDir] = useState<TransformDirection | null>(null);
  const openTransform = useCallback((direction: TransformDirection) => {
    setGraphOpen(false);
    setInlineEdit(null);
    setTransformDir(direction);
  }, []);
  // НЕРАЗРУШАЮЩЕЕ обновление синтеза (грабля R3 EditModal 2.3: store.load
  // переключает loading → спиннер → TransformPanel размонтируется и теряет
  // summary) — reloadSections + точечный applySynthesis
  const applySynthesis = useSynthesisStore((s) => s.applySynthesis);
  const handleTransformed = useCallback(() => {
    void reloadSections();
    void refreshGraphData();
    if (id) void getSynthesis(id).then(applySynthesis).catch(() => {});
  }, [reloadSections, refreshGraphData, id, applySynthesis]);

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
  const isOwnerForModes = synthesis?.isOwner ?? false;
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
    // 8.7: GET /modes — под requireAuth; кнопки режимов и так только
    // владельцу — счётчики гоняем только ему
    if (!synthesisIdForModes || !hasCapsule || !isOwnerForModes) return;
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
  }, [synthesisIdForModes, hasCapsule, editOpen, isOwnerForModes]);

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
    // 8.7: /lineage/ancestors под requireAuth — гостю дерево не грузим,
    // остаётся список родителей из SynthesisFull (метаданные витрины)
    if (!synthesisIdLoaded || !isMetaSynthesis || isGuest) return;
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
  }, [synthesisIdLoaded, isMetaSynthesis, isGuest]);

  const live = synthesis?.status === "generating" || synthesis?.status === "paused";
  // Беседа 5.2 («По факту 5.2»): владение — из SynthesisFull.isOwner
  // (оптимизм «покажем всем, 403 решит» 2.3/4.1 снят тем же флагом)
  const isOwner = synthesis?.isOwner ?? false;
  // 8.7: что доступно смотрящему. Контент-роуты (граф, экспорт, /sections)
  // — под requireAuth и с гейтом витрины (8.6 «По факту» п.3):
  // зарегистрированному на 'full' — да, гостю и на витрине — нет.
  const scopeFull = synthesis?.scope === "full";
  const contentAvailable = isOwner || (!isGuest && scopeFull);
  // Логи и запросы — по действенности флагов, а не по 403 постфактум
  const eff = synthesis ? effectiveFlags(synthesis) : null;
  const logsAvailable = isOwner || (!isGuest && !!eff?.showLogs);
  const promptsAvailable = isOwner || (!isGuest && !!eff?.showPrompts);

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
    // 8.7: WS — только зарегистрированному (гостю сокет закрыт сессией);
    // события своего прогона доходят по userId и так (1.6)
    synthesisId: !isGuest ? (id ?? null) : null,
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
    // 8.7 (п. 3): гостю — «концепция приватна» со ссылкой на вход и
    // возвратом сюда (state.from, как у RequireAuth); зарегистрированному
    // — прежний текст (чужая приватная)
    return (
      <PageError
        code="403"
        text={
          isGuest
            ? "Эта концепция приватна: автор не открыл её посторонним."
            : "Этот синтез приватный: доступен только владельцу."
        }
        testId="forbidden-page"
      >
        {isGuest && (
          <p className="submit-note" style={{ maxWidth: "100%", textAlign: "center" }}>
            Если это ваша концепция —{" "}
            <Link
              to="/login"
              state={{ from: location.pathname + location.search }}
              data-testid="forbidden-login"
            >
              войдите
            </Link>
            . Иначе — <Link to="/explore">публичный каталог</Link>.
          </p>
        )}
      </PageError>
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
      {/* Беседа 8.7 (п. 4a): полоса режима просмотра у невладельца */}
      {!isOwner && (
        <div className="app-view-banner" data-testid="view-banner" data-viewer={isGuest ? "guest" : "user"}>
          <span className="app-view-banner-text">
            Вы смотрите публичную концепцию
            {synthesis.scope === "showcase" ? " (витрина)" : ""}
            {synthesis.authorName ? ` · автор: ${synthesis.authorName}` : ""}
          </span>
          {isGuest && (
            <Link to="/register" className="action-btn primary" data-testid="view-banner-register">
              Создать аккаунт
            </Link>
          )}
        </div>
      )}

      {/* actions-bar [4134] — минимум 1.6b; 8.7: у гостя и на витрине
          кнопок под requireAuth/гейтом витрины нет (не рисуем неработающие) */}
      <div className="actions-bar">
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--ink-dim)",
            letterSpacing: 1,
          }}
        >
          {isOwner
            ? live
              ? "ГЕНЕРАЦИЯ ДОКУМЕНТА"
              : "ДОКУМЕНТ СГЕНЕРИРОВАН"
            : `РЕЖИМ ПРОСМОТРА · ${visibilityBadge(synthesis.visibility).toUpperCase()}`}
        </div>
        <div className="actions-bar-btns">
          {contentAvailable && (
            <button
              type="button"
              className="action-btn"
              onClick={() => void handleOpenGraph()}
              disabled={graphLoading}
            >
              {graphLoading ? "Загрузка…" : "◈ Граф"}
            </button>
          )}
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
          {/* Беседа 4.2: экспорт (скачивание с сервера, 03 §2.11);
              8.7: под requireAuth, витрина → 403 — только при contentAvailable */}
          {contentAvailable && (
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
          )}
          <button
            type="button"
            className="action-btn"
            onClick={() => window.print()}
          >
            Распечатать
          </button>
        </div>
      </div>

      {live && isOwner && (
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
        onOpenLog={logsAvailable ? () => setLogOpen(true) : undefined}
        editable={isOwner && !live}
        onRowEdit={(row) => void openInlineEditor(row)}
        subsectionEditable={isOwner && !live}
        subsectionEdit={isOwner && !live ? subEdit : null}
        onSubsectionEdit={(ref) => void openSubsectionEdit(ref)}
        onSubsectionSave={(html) => void saveSubsectionEdit(html)}
        onSubsectionCancel={cancelSubsectionEdit}
        sectionActionsFor={(key) =>
          key === "theses" && isOwner && !live ? (
            <button
              type="button"
              className="action-btn"
              onClick={() => openTransform("theses_to_graph")}
              title="Трансформировать тезисы в граф (Representation Transformer)"
              data-testid="theses-transform-btn"
            >
              → Граф
            </button>
          ) : undefined
        }
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
                {/* 8.7: фильтр потомков зовёт /lineage/descendants (requireAuth) */}
                {!isGuest && (
                  <div className="doc-meta-key" style={{ marginTop: 8 }}>
                    <Link to={`/catalog?descendantsOf=${synthesis.id}`}>
                      ◈ Потомки этой концепции в каталоге
                    </Link>
                  </div>
                )}
              </div>
            </details>
          ) : undefined
        }
      />

      {/* Беседа 2.4: лог контекста. Live-обновление — refreshKey растёт по
          УЖЕ существующим событиям завершения раздела (section_done через
          doneCount, generation_complete через stream.complete); новых
          WS-сообщений про лог нет (аудит 2026-07-30). */}
      {id && logsAvailable && (
        <ContextLogViewer
          open={logOpen}
          synthesisId={id}
          docNum={synthesis.docNum}
          title={synthesis.title}
          refreshKey={doneCount + (stream.complete ? 100000 : 0)}
          promptsAvailable={promptsAvailable}
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
        open={pauseModalOpen && paused && isOwner}
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
        onTransform={openTransform}
      />

      {/* Беседа 5.5: панель трансформации представлений */}
      {transformDir && (
        <TransformPanel
          open
          synthesisId={synthesis.id}
          initialDirection={transformDir}
          disabled={!isOwner || live}
          onTransformed={handleTransformed}
          onClose={() => setTransformDir(null)}
        />
      )}
    </div>
  );
}

function PageError({
  code,
  text,
  testId,
  children,
}: {
  code: string;
  text: string;
  testId?: string | undefined;
  children?: React.ReactNode;
}) {
  return (
    <div className="input-form" style={{ textAlign: "center" }} data-testid={testId}>
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
      {children}
    </div>
  );
}
