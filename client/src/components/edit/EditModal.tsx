/**
 * Модальное окно редактирования. Беседа 2.3 (запрос 1, п. 2).
 *
 * Порт разметки #editOverlay [4294–4327] и openEditModal/closeEditModal/
 * renderEditSections/onEditCheckChange/updateEditPlanUI/recalcEditPlan
 * [18340–19136] на React поверх сервис-модели планов (01-arch §4.5).
 *
 * Состав (сверху вниз): CascadePanel (live, стоит первой — как
 * #cascadePanel исходника) → карточка «Структура документа устарела» →
 * EditPlanPanel (после создания плана) → карточки разделов
 * (EditSectionCard + встроенная SubsectionRegenPanel) → AddSectionPanel;
 * футер: количество действий · оценка стоимости · ▶.
 *
 * Адаптации DOM/DOC_STATE → сервис:
 *  - план чекбоксов (аналог _editPlan / recalcEditPlan) — React-state
 *    (Set'ы regen/remove/add + secCtx/addCtx), взаимоисключение — в
 *    EditSectionCard;
 *  - живой каскад: POST /plans/impact с debounce 400 мс (серверный
 *    analyzeImpact; транспорт добавлен этой беседой) вместо клиентского
 *    updateLiveCascade; оттуда же estimatedCost футера (паритет
 *    updateEditPlanUI: только выбранные действия, delete бесплатно);
 *  - «▶ Пуск» исходника исполнял цепочкой confirm() — здесь двухшаговый
 *    workflow §4.5: «▶ Составить план» (POST /plans, сервер добавляет
 *    каскадные pending-шаги) → просмотр EditPlanPanel → «▶ Исполнить»
 *    (POST /execute, прогресс по WS через useEditPlan);
 *  - гейты openEditModal (API_KEY, DOC_STATE.incomplete) не переносятся:
 *    ключ серверный до 6.1, incomplete — атрибут импорта 4.3;
 *  - карточка «Структура устарела»: сравнение structureSections против
 *    sectionOrder ИЗ SynthesisFull (снимок пишут 1.6/2.2); null →
 *    «актуальность не определена»; «Обновить» →
 *    POST /regenerate-subsection {sum, «Структура документа»}
 *    (= серверная половина regenStructureFromEditModal, 2.2);
 *  - чекбокс extGraphMetrics на карточке graph пишет флаг синтеза
 *    сразу (PATCH /syntheses/:id — исходник писал DOC_STATE.params);
 *  - карточки РЕЗУЛЬТАТОВ РЕЖИМОВ [18560–18630] НЕ перенесены:
 *    транспорт есть с 4.1 (GET /modes + mode-service), сами карточки —
 *    открытый долг §12 за 4.1 (довыполнение по команде);
 *  - обновление документа после исполнения: onPlanFinished →
 *    reloadSections + applySynthesis (НЕ store.load: тот переключает
 *    loading, страница рендерит спиннер и размонтирует модалку —
 *    цикл ремаунтов, пойман браузерным тестом R3).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";
import type { CascadeImpactDto } from "@philosynth/shared/types/edit-plan";
import type { ModeResult } from "@philosynth/shared/types/modes";

import { getPlanImpact, regenerateSubsection } from "../../api/plans";
import { getSynthesis, updateSynthesis } from "../../api/syntheses";
import { useEditPlan, type SectionEvent } from "../../hooks/useEditPlan";
import { useSynthesisStore } from "../../stores/synthesis-store";
import { getModes } from "../../api/modes";

import { AddSectionPanel } from "./AddSectionPanel";
import { CascadePanel } from "./CascadePanel";
import { EditPlanPanel } from "./EditPlanPanel";
import { EditSectionCard } from "./EditSectionCard";
import { ModeResultsPanel } from "./ModeResultsPanel";
import { SubsectionRegenPanel } from "./SubsectionRegenPanel";

/** ALL_SECTION_KEYS [20906] без «sum» — клиентская копия перечня
 *  (серверный getAvailableSectionsToAdd клиенту недоступен; источник
 *  истины один — ключи KEY_LABELS минус sum) */
const ADDABLE_KEYS = Object.keys(KEY_LABELS).filter((k) => k !== "sum");

const STRUCTURE_SUBSECTION = "Структура документа";

const labelOf = (key: string): string =>
  (KEY_LABELS as Record<string, string>)[key] ?? key;

export interface EditModalProps {
  open: boolean;
  onClose: () => void;
  /** Беседа 5.2: разделы, предотмеченные на перегенерацию при открытии
   *  («Перегенерировать затронутые» ElementEditor → план; единственный
   *  путь запуска перегенерации — планы §2.6). Ключи вне документа
   *  игнорируются. */
  initialRegen?: readonly string[] | undefined;
}

export function EditModal({ open, onClose, initialRegen }: EditModalProps) {
  const synthesis = useSynthesisStore((s) => s.synthesis);
  const summaries = useSynthesisStore((s) => s.summaries);
  const sections = useSynthesisStore((s) => s.sections);
  const reloadSections = useSynthesisStore((s) => s.reloadSections);
  const applySynthesis = useSynthesisStore((s) => s.applySynthesis);

  const synthesisId = synthesis?.id ?? null;

  /* ── План чекбоксов (аналог _editPlan) ── */
  const [regenChecked, setRegenChecked] = useState<Set<string>>(new Set());
  const [removeChecked, setRemoveChecked] = useState<Set<string>>(new Set());
  const [addChecked, setAddChecked] = useState<Set<string>>(new Set());
  const [secCtx, setSecCtx] = useState<Record<string, string>>({});
  const [addCtx, setAddCtx] = useState<Record<string, string>>({});
  /* Режимы (долг §12 закрыт): результаты + отмеченные пары `mk:i` */
  const [modes, setModes] = useState<Record<string, ModeResult[]>>({});
  const [modeRegenChecked, setModeRegenChecked] = useState<Set<string>>(
    new Set(),
  );
  const [modeRemoveChecked, setModeRemoveChecked] = useState<Set<string>>(
    new Set(),
  );
  const [subRegen, setSubRegen] = useState<{
    sectionKey: string;
    subsectionName: string;
  } | null>(null);
  const [subRegenBusy, setSubRegenBusy] = useState(false);
  const [structureBusy, setStructureBusy] = useState(false);
  const [structureDone, setStructureDone] = useState(false);
  const [lastSectionEvent, setLastSectionEvent] =
    useState<SectionEvent | null>(null);

  /* ── План + WS (useEditPlan) ── */
  // НЕРАЗРУШАЮЩЕЕ обновление: store.load() переключает loading и
  // SynthesisPage рендерит спиннер — модалка размонтируется (грабля R3);
  // здесь — reloadSections + точечный applySynthesis
  const onPlanFinished = useCallback(() => {
    if (!synthesisId) return;
    void reloadSections();
    void getSynthesis(synthesisId).then(applySynthesis).catch(() => {});
    void getModes(synthesisId).then(setModes).catch(() => {});
  }, [synthesisId, reloadSections, applySynthesis]);

  const onSectionEvent = useCallback((ev: SectionEvent) => {
    setLastSectionEvent(ev);
    if (ev.kind === "section_done" && ev.sectionKey === "sum")
      setStructureBusy((busy) => {
        if (busy) setStructureDone(true);
        return false;
      });
  }, []);

  const editPlan = useEditPlan({
    synthesisId,
    active: open,
    onSectionEvent,
    onPlanFinished,
  });
  const { plan, isExecuting } = editPlan;

  // Сброс локального состояния при каждом открытии (renderEditSections
  // сбрасывал _editPlan до построения карточек); secCtx — из разделов
  useEffect(() => {
    if (!open) return;
    // 5.2: предотметка затронутых разделов (только присутствующие в документе)
    const present = new Set(sections.map((s) => s.key));
    setRegenChecked(new Set((initialRegen ?? []).filter((k) => present.has(k))));
    setRemoveChecked(new Set());
    setAddChecked(new Set());
    const ctx: Record<string, string> = {};
    for (const s of sections) if (s.secContext) ctx[s.key] = s.secContext;
    setSecCtx(ctx);
    setAddCtx({});
    setSubRegen(null);
    setStructureDone(false);
    setModeRegenChecked(new Set());
    setModeRemoveChecked(new Set());
    setModes({});
    if (synthesisId)
      void getModes(synthesisId).then(setModes).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Блокировка прокрутки body (openEditModal/closeEditModal)
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /* ── Живой каскад: POST /plans/impact с debounce ── */
  const [impact, setImpact] = useState<CascadeImpactDto | null>(null);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [impactLoading, setImpactLoading] = useState(false);
  const impactSeq = useRef(0);

  const regenArr = useMemo(() => [...regenChecked], [regenChecked]);
  const removeArr = useMemo(() => [...removeChecked], [removeChecked]);
  const addArr = useMemo(() => [...addChecked], [addChecked]);
  const toPairs = (set: ReadonlySet<string>): [string, number][] =>
    [...set].map((k) => {
      const i = k.lastIndexOf(":");
      return [k.slice(0, i), Number(k.slice(i + 1))];
    });
  const modeRegenPairs = useMemo(
    () => toPairs(modeRegenChecked),
    [modeRegenChecked],
  );
  const modeRemovePairs = useMemo(
    () => toPairs(modeRemoveChecked),
    [modeRemoveChecked],
  );

  useEffect(() => {
    if (!open || !synthesisId) return;
    const total = regenArr.length + removeArr.length + addArr.length;
    if (total === 0) {
      setImpact(null);
      setEstimatedCost(0);
      return;
    }
    const seq = ++impactSeq.current;
    setImpactLoading(true);
    const timer = setTimeout(() => {
      getPlanImpact(synthesisId, {
        regen: regenArr,
        remove: removeArr,
        add: addArr,
      })
        .then((r) => {
          if (seq !== impactSeq.current) return;
          setImpact(r.impact);
          setEstimatedCost(r.estimatedCost);
        })
        .catch(() => {
          if (seq === impactSeq.current) setImpact(null);
        })
        .finally(() => {
          if (seq === impactSeq.current) setImpactLoading(false);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [open, synthesisId, regenArr, removeArr, addArr]);

  /* ── Обработчики чекбоксов ── */
  const toggleIn = (
    set: Set<string>,
    key: string,
    checked: boolean,
  ): Set<string> => {
    const next = new Set(set);
    if (checked) next.add(key);
    else next.delete(key);
    return next;
  };

  const markRegen = useCallback((key: string) => {
    setRegenChecked((s) => toggleIn(s, key, true));
    setRemoveChecked((s) => toggleIn(s, key, false));
  }, []);
  const markAdd = useCallback((key: string) => {
    setAddChecked((s) => toggleIn(s, key, true));
  }, []);

  /* Чекбоксы карточек режимов: взаимоисключение регенерации/удаления
   * (сервер: VALIDATION_ERROR «modeRegen и modeRemove одновременно») */
  const toggleModeRegen = useCallback(
    (mk: string, i: number, v: boolean) => {
      const key = mk + ":" + i;
      setModeRegenChecked((s) => toggleIn(s, key, v));
      if (v) setModeRemoveChecked((s) => toggleIn(s, key, false));
    },
    [],
  );
  const toggleModeRemove = useCallback(
    (mk: string, i: number, v: boolean) => {
      const key = mk + ":" + i;
      setModeRemoveChecked((s) => toggleIn(s, key, v));
      if (v) setModeRegenChecked((s) => toggleIn(s, key, false));
    },
    [],
  );
  const markModeRegen = useCallback(
    (mk: string, i: number) => toggleModeRegen(mk, i, true),
    [toggleModeRegen],
  );

  /* ── extGraphMetrics (PATCH — транспорт добавлен 2.3) ── */
  const handleExtGraphMetrics = useCallback(
    (checked: boolean) => {
      if (!synthesisId) return;
      updateSynthesis(synthesisId, { extGraphMetrics: checked })
        .then(applySynthesis)
        .catch(() => {
          /* best-effort: чекбокс вернётся к значению из store */
        });
    },
    [synthesisId, applySynthesis],
  );

  /* ── Карточка «Структура документа устарела» ── */
  const structureOutdated =
    !!synthesis &&
    synthesis.sectionOrder.includes("sum") &&
    (synthesis.structureSections === null
      ? true
      : JSON.stringify(synthesis.structureSections) !==
        JSON.stringify(synthesis.sectionOrder));

  const handleRegenStructure = useCallback(() => {
    if (!synthesisId || structureBusy) return;
    setStructureBusy(true);
    regenerateSubsection(synthesisId, {
      sectionKey: "sum",
      subsectionName: STRUCTURE_SUBSECTION,
    }).catch((err) => {
      setStructureBusy(false);
      alert("Ошибка: " + (err instanceof Error ? err.message : String(err)));
    });
  }, [synthesisId, structureBusy]);

  /* ── План: составить / исполнить ── */
  const totalActions =
    regenArr.length + removeArr.length + addArr.length +
    modeRegenPairs.length + modeRemovePairs.length;

  const handleCreatePlan = useCallback(async () => {
    const regenContexts: Record<string, string> = {};
    for (const k of regenArr) if (secCtx[k]?.trim()) regenContexts[k] = secCtx[k] as string;
    const addContexts: Record<string, string> = {};
    for (const k of addArr) if (addCtx[k]?.trim()) addContexts[k] = addCtx[k] as string;
    await editPlan.create({
      regen: regenArr,
      remove: removeArr,
      add: addArr,
      ...(Object.keys(regenContexts).length ? { regenContexts } : {}),
      ...(Object.keys(addContexts).length ? { addContexts } : {}),
      ...(modeRegenPairs.length ? { modeRegen: modeRegenPairs } : {}),
      ...(modeRemovePairs.length ? { modeRemove: modeRemovePairs } : {}),
    });
  }, [
    editPlan, regenArr, removeArr, addArr, secCtx, addCtx,
    modeRegenPairs, modeRemovePairs,
  ]);

  const handleFooterRun = useCallback(() => {
    if (!plan) void handleCreatePlan();
    else if (plan.status === "draft") void editPlan.execute();
  }, [plan, handleCreatePlan, editPlan]);

  const handleDiscardPlan = useCallback(() => {
    void editPlan.discard();
  }, [editPlan]);

  const handleClose = useCallback(() => {
    if (isExecuting) {
      const ok = window.confirm(
        "План исполняется. Закрыть окно? Исполнение продолжится на сервере.",
      );
      if (!ok) return;
    }
    onClose();
  }, [isExecuting, onClose]);

  if (!open || !synthesis || !synthesisId) return null;

  const order = synthesis.sectionOrder.filter((k) => k !== "sum");
  const available = ADDABLE_KEYS.filter(
    (k) => !synthesis.sectionOrder.includes(k),
  );
  const sectionNums = new Map(summaries.map((s) => [s.key, s.sectionNum]));
  const controlsDisabled = !!plan; // после составления плана чекбоксы заморожены

  const footerInfoParts: string[] = [];
  if (regenArr.length) footerInfoParts.push(regenArr.length + " перегенер.");
  if (removeArr.length) footerInfoParts.push(removeArr.length + " удал.");
  if (addArr.length) footerInfoParts.push(addArr.length + " добавл.");
  const modeCount = modeRegenPairs.length + modeRemovePairs.length;
  if (modeCount) footerInfoParts.push(modeCount + " режим.");

  const footerCost =
    plan && plan.estimatedCost > 0
      ? plan.estimatedCost
      : estimatedCost > 0
        ? estimatedCost
        : null;
  const costText =
    footerCost !== null
      ? `≈ $${footerCost.toFixed(4)} (${(footerCost * 100).toFixed(2)}¢)`
      : removeArr.length > 0 && regenArr.length + addArr.length === 0
        ? "Удаление бесплатно"
        : "";

  const runLabel = !plan
    ? "▶ Составить план"
    : plan.status === "draft"
      ? "▶ Исполнить"
      : plan.status === "executing"
        ? "Исполняется…"
        : plan.status;

  return (
    <div
      className="edit-overlay visible"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="edit-modal">
        <div className="edit-modal-header">
          <div className="edit-modal-title">✎ Редактирование Разделов</div>
          <button
            type="button"
            className="raw-close"
            onClick={handleClose}
          >
            ✕ Закрыть
          </button>
        </div>

        <div className="edit-modal-body">
          {/* Каскадная панель — первой (как #cascadePanel исходника) */}
          <CascadePanel
            modeRegenChecked={modeRegenChecked}
            onMarkModeRegen={markModeRegen}
            impact={impact}
            loading={impactLoading}
            regenChecked={regenChecked}
            sectionNums={sectionNums}
            labels={labelOf}
            onMarkRegen={markRegen}
            onMarkAdd={markAdd}
          />

          {/* Карточка «Структура документа устарела» */}
          {structureOutdated && !structureDone && (
            <div
              style={{
                border: "1px solid var(--gold)",
                background: "#fffbee",
                padding: "12px 16px",
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                gap: 12,
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: "var(--gold)",
                  letterSpacing: 0.3,
                }}
              >
                <span style={{ marginRight: 6 }}>⚡</span>
                {synthesis.structureSections === null
                  ? "Актуальность подраздела «Структура документа» в Резюме не определена. Рекомендуется обновить."
                  : "Подраздел «Структура документа» в Резюме устарел (перечень разделов изменился)."}
              </div>
              <button
                type="button"
                className="action-btn"
                style={{
                  borderColor: "var(--gold)",
                  color: "var(--gold)",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
                onClick={handleRegenStructure}
                disabled={structureBusy}
              >
                {structureBusy ? "Генерация..." : "Обновить"}
              </button>
            </div>
          )}
          {structureDone && (
            <div
              style={{
                border: "1px solid var(--green-check)",
                background: "#f0fff4",
                padding: "12px 16px",
                marginBottom: 10,
                fontFamily: "var(--mono)",
                fontSize: 10,
                color: "var(--green-check)",
              }}
            >
              <span style={{ marginRight: 6 }}>✓</span>Подраздел «Структура
              документа» обновлён.
            </div>
          )}

          {/* План (после ▶ Составить план) */}
          {plan && (
            <EditPlanPanel
              plan={plan}
              stepResults={editPlan.stepResults}
              runningStep={editPlan.runningStep}
              isExecuting={isExecuting}
              labels={labelOf}
              onConfirmStep={(i) => void editPlan.confirmStep(i)}
              onSkipStep={(i) => void editPlan.skipStep(i)}
            />
          )}
          {editPlan.error && (
            <div className="edit-dep-warn danger" style={{ marginBottom: 10 }}>
              <span className="dep-icon">⚠</span>
              <span>{editPlan.error}</span>
            </div>
          )}

          {/* Карточки существующих разделов */}
          {order.map((key) => {
            const summary = summaries.find((s) => s.key === key);
            if (!summary) return null;
            return (
              <div key={key}>
                <EditSectionCard
                  synthesisId={synthesisId}
                  summary={summary}
                  label={labelOf(key)}
                  regenChecked={regenChecked.has(key)}
                  removeChecked={removeChecked.has(key)}
                  onToggleRegen={(v) =>
                    setRegenChecked((s) => toggleIn(s, key, v))
                  }
                  onToggleRemove={(v) =>
                    setRemoveChecked((s) => toggleIn(s, key, v))
                  }
                  secCtx={secCtx[key] ?? ""}
                  onSecCtxChange={(v) =>
                    setSecCtx((c) => ({ ...c, [key]: v }))
                  }
                  extGraphMetrics={
                    key === "graph" ? synthesis.extGraphMetrics : undefined
                  }
                  onToggleExtGraphMetrics={
                    key === "graph" ? handleExtGraphMetrics : undefined
                  }
                  onOpenSubRegen={(sub) =>
                    setSubRegen({ sectionKey: key, subsectionName: sub })
                  }
                  disabled={controlsDisabled}
                />
                {subRegen?.sectionKey === key && (
                  <SubsectionRegenPanel
                    synthesisId={synthesisId}
                    sectionKey={key}
                    subsectionName={subRegen.subsectionName}
                    labels={labelOf}
                    sectionEvent={lastSectionEvent}
                    onClose={() => setSubRegen(null)}
                    onBusyChange={setSubRegenBusy}
                  />
                )}
              </div>
            );
          })}

          {/* Панель «РЕЖИМЫ» — карточки результатов [18556–18620] */}
          <ModeResultsPanel
            modes={modes}
            affectedModes={impact?.affectedModes ?? []}
            regenChecked={modeRegenChecked}
            removeChecked={modeRemoveChecked}
            onToggleRegen={toggleModeRegen}
            onToggleRemove={toggleModeRemove}
            disabled={controlsDisabled}
          />

          {/* Панель добавления */}
          <AddSectionPanel
            available={available}
            labels={labelOf}
            checked={addChecked}
            onToggle={(k, v) => setAddChecked((s) => toggleIn(s, k, v))}
            addCtx={addCtx}
            onCtxChange={(k, v) => setAddCtx((c) => ({ ...c, [k]: v }))}
            disabled={controlsDisabled}
          />
        </div>

        <div className="edit-modal-footer">
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 9,
                color: "var(--ink-dim)",
                letterSpacing: 1,
              }}
            >
              {footerInfoParts.length
                ? footerInfoParts.join(" · ")
                : "Выберите действия"}
            </div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                color: "var(--gold)",
                letterSpacing: 0.5,
              }}
            >
              {costText}
            </div>
          </div>
          {plan && plan.status === "draft" && (
            <button
              type="button"
              className="edit-sec-btn"
              onClick={handleDiscardPlan}
            >
              Отменить план
            </button>
          )}
          <button
            type="button"
            className="edit-sec-btn primary"
            style={{ padding: "10px 24px", fontSize: 11, letterSpacing: 2 }}
            onClick={handleFooterRun}
            disabled={
              subRegenBusy ||
              isExecuting ||
              (!plan && totalActions === 0) ||
              (!!plan && plan.status !== "draft")
            }
          >
            {runLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
