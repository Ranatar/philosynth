/**
 * Панель рекомендаций критики. Беседа 10.3 (запрос 1, п. 3–7).
 *
 * Единственное место, где человек решает, что из критики исполнять. В
 * одностраничнике прародителя нет: рекомендации там читались глазами и
 * переносились в правку вручную.
 *
 * НЕТ И НЕ ДОЛЖНО БЫТЬ «выбрать все» и «исполнить все» — ни кнопкой, ни
 * галочкой в шапке, ни сочетанием клавиш: рекомендации пишет модель о
 * собственном тексте, и сплошная самошлифовка стирает ровно то, ради чего
 * концепция задумывалась. Выбор — поштучный, по одной рекомендации; сервер
 * пустой и «полный» выбор не отличает от обычного и входа «все» не имеет
 * (сторож 4at-а), панель — тоже (сторож 4au).
 *
 * Поток:
 *  - открытие: GET строк последнего раунда; если раунд НЕ в работе — разбор
 *    (POST parse; идемпотентен в пределах раунда, а сменившаяся критика
 *    открывает новый раунд — панель всегда показывает действующий текст);
 *    раунд в работе (есть 'planned' с живым планом) — разбор НЕ зовётся, и
 *    это объясняется ДО отказа сервера (409 ROUND_IN_PROGRESS);
 *  - таблицы нет (концепция создана до 10.1) — не пустота, а предложение
 *    составить таблицу по имеющейся прозе (ретрофит, одно обращение к модели);
 *  - выбор → оценка «N бесплатно, M платно» → «Собрать план» → POST plan →
 *    управление ПЕРЕДАЁТСЯ существующей модалке правок 2.3 (onPlanReady):
 *    второй панели плана нет, каскад, подтверждение шагов и исполнение — там;
 *  - негодные строки — отдельной группой с причиной сторожа, без выбора, и
 *    кнопка правки таблицы вручную (правка подраздела 9.2: «Таблица
 *    рекомендаций» замком не заперта);
 *  - прошлые раунды — свёрнутыми списками с номером раунда.
 *
 * Долги §12 беседы 10.2, закрытые здесь: выбор поля элемента (селект в
 * развороте строки; уходит в `fields` постановки плана), строки «удалить» —
 * как исполняемые вручную, без выбора; вид найденного сторожем элемента —
 * рядом с адресом, расхождение с разделом адреса выделено.
 *
 * Заслон от повторного нажатия — ref, не состояние (09 §6, 9.1).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  RECOMMENDATIONS_SECTION_KEY,
  RECOMMENDATIONS_TABLE_SUBSECTION,
} from "@philosynth/shared/constants/recommendations";
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";
import type { EditPlan } from "@philosynth/shared/types/edit-plan";
import type {
  Recommendation,
  RecommendationsResponse,
} from "@philosynth/shared/types/recommendations";

import { deletePlan, getPlan } from "../../api/plans";
import {
  extractRecommendations,
  listRecommendations,
  parseRecommendations,
  planRecommendations,
  withBusyRetry,
} from "../../api/recommendations";
import { useSynthesisStore } from "../../stores/synthesis-store";
import {
  COST_KIND_LABEL,
  actionTextOf,
  costKindOf,
  elementKindText,
  estimateSelection,
  estimateText,
  fieldOptionsOf,
  groupForPanel,
  isSelectableRow,
  kindMismatchText,
  leftoversOfError,
  notFoundReasonOf,
  numKey,
  recommendationProseOf,
  recommendationsErrorText,
  severityChipOf,
  toggleSelection,
  type PlanLeftovers,
  type RecommendationItem,
  type RetrofitReason,
} from "../../utils/recommendations";

const labelOf = (key: string): string =>
  (KEY_LABELS as Record<string, string>)[key] ?? key;

const STATUS_LABEL: Record<Recommendation["status"], string> = {
  new: "ждёт решения",
  planned: "в плане",
  done: "исполнена",
  rejected: "отклонена",
  invalid: "негодна",
  stale: "текст изменился",
};

export interface RecommendationsPanelProps {
  open: boolean;
  synthesisId: string;
  onClose: () => void;
  /** Черновик плана собран — управление уходит модалке правок 2.3.
   *  names: id элемента → имя (шаг плана несёт только «kind:id») */
  onPlanReady: (plan: EditPlan, names: Record<string, string>) => void;
  /** «Править таблицу рекомендаций вручную» — правка подраздела 9.2 */
  onEditTable: () => void;
  /** Строки раунда изменились — хозяин обновляет число на кнопке входа */
  onRowsChanged?: ((rows: readonly Recommendation[]) => void) | undefined;
}

type Phase = "loading" | "ready" | "retrofit" | "failed";

export function RecommendationsPanel({
  open,
  synthesisId,
  onClose,
  onPlanReady,
  onEditTable,
  onRowsChanged,
}: RecommendationsPanelProps) {
  const sections = useSynthesisStore((s) => s.sections);
  const reloadSections = useSynthesisStore((s) => s.reloadSections);

  const critique = useMemo(
    () => sections.find((s) => s.key === RECOMMENDATIONS_SECTION_KEY) ?? null,
    [sections],
  );
  const hasTableSubsection =
    critique?.subsections.includes(RECOMMENDATIONS_TABLE_SUBSECTION) ?? false;

  const [phase, setPhase] = useState<Phase>("loading");
  const [current, setCurrent] = useState<RecommendationsResponse | null>(null);
  const [past, setPast] = useState<RecommendationsResponse[]>([]);
  const [retrofitReason, setRetrofitReason] = useState<RetrofitReason>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fields, setFields] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [leftovers, setLeftovers] = useState<PlanLeftovers | null>(null);
  const [busy, setBusy] = useState<null | "parse" | "extract" | "plan" | "open-plan" | "delete-plan">(null);
  const [confirmDeletePlan, setConfirmDeletePlan] = useState<string | null>(null);
  const busyRef = useRef(false);
  const seqRef = useRef(0);
  const onRowsChangedRef = useRef(onRowsChanged);
  onRowsChangedRef.current = onRowsChanged;

  const applyCurrent = useCallback((res: RecommendationsResponse) => {
    setCurrent(res);
    onRowsChangedRef.current?.(res.rows);
    // Выбор переживает перечитку только для строк, которые всё ещё выбираемы
    const alive = new Set(res.rows.filter(isSelectableRow).map((r) => numKey(r.num)));
    setSelected((prev) => new Set([...prev].filter((k) => alive.has(k))));
  }, []);

  const loadPast = useCallback(
    async (latestRound: number, seq: number) => {
      const list: RecommendationsResponse[] = [];
      for (let round = latestRound - 1; round >= 1; round -= 1) {
        try {
          list.push(await listRecommendations(synthesisId, round));
        } catch {
          /* прошлый раунд — справка; сбой чтения списка не роняет панель */
        }
      }
      if (seq === seqRef.current) setPast(list);
    },
    [synthesisId],
  );

  /** Чтение строк; reparse — звать ли разбор (при раунде в работе — нет). */
  const refresh = useCallback(
    async (options: { reparse: boolean }) => {
      const seq = ++seqRef.current;
      setError(null);
      try {
        let res = await listRecommendations(synthesisId);
        const inWork = res.rows.some((r) => r.status === "planned" && r.planId);
        if (options.reparse && !inWork) {
          try {
            res = await parseRecommendations(synthesisId);
          } catch (err) {
            const reason = notFoundReasonOf(err);
            if (reason) {
              if (seq !== seqRef.current) return;
              setRetrofitReason(reason);
              setPhase("retrofit");
              applyCurrent(res);
              return;
            }
            // Разбор не удался — показываем прочитанное и причину
            if (seq === seqRef.current) setError(recommendationsErrorText(err));
          }
        }
        if (seq !== seqRef.current) return;
        applyCurrent(res);
        setPhase("ready");
        if (res.latestRound > 1) void loadPast(res.latestRound, seq);
        else setPast([]);
      } catch (err) {
        if (seq !== seqRef.current) return;
        const reason = notFoundReasonOf(err);
        if (reason) {
          setRetrofitReason(reason);
          setPhase("retrofit");
          return;
        }
        setError(recommendationsErrorText(err));
        setPhase("failed");
      }
    },
    [synthesisId, applyCurrent, loadPast],
  );

  // Открытие панели — свежее состояние; одноразово на открытие (StrictMode
  // двоит эффект: второй вызов безвреден — разбор идемпотентен, seq отсекает)
  useEffect(() => {
    if (!open) return;
    setPhase("loading");
    setCurrent(null);
    setPast([]);
    setSelected(new Set());
    setFields({});
    setExpanded(new Set());
    setLeftovers(null);
    setNote(null);
    setRetrofitReason(null);
    setConfirmDeletePlan(null);
    void refresh({ reparse: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, synthesisId]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Второй шаг кнопок «Удалить план» сбрасывается кликом мимо (8.4)
  useEffect(() => {
    if (!confirmDeletePlan) return;
    const onDown = (e: MouseEvent): void => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest("[data-rec-plan-actions]")) setConfirmDeletePlan(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [confirmDeletePlan]);

  const rows = useMemo(() => current?.rows ?? [], [current]);
  const groups = useMemo(() => groupForPanel(rows), [rows]);
  const estimate = useMemo(() => estimateSelection(rows, selected), [rows, selected]);
  const plannedByPlan = useMemo(() => {
    const map = new Map<string, Recommendation[]>();
    for (const r of groups.planned)
      if (r.planId) map.set(r.planId, [...(map.get(r.planId) ?? []), r]);
    return map;
  }, [groups.planned]);
  const roundInWork = plannedByPlan.size > 0;

  const proseOf = useCallback(
    (num: string): string | null =>
      critique ? recommendationProseOf(critique.htmlContent, num) : null,
    [critique],
  );

  const namesOf = (list: readonly Recommendation[]): Record<string, string> => {
    const names: Record<string, string> = {};
    for (const r of list) if (r.elementId && r.element) names[r.elementId] = r.element;
    return names;
  };

  /** Одна операция за раз; ref — синхронный заслон от двойного клика. */
  const guarded = async (
    kind: NonNullable<typeof busy>,
    run: () => Promise<void>,
  ): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      await run();
    } catch (err) {
      setError(recommendationsErrorText(err));
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const handleReparse = (): void =>
    void guarded("parse", async () => {
      setLeftovers(null);
      await refresh({ reparse: true });
    });

  const handleExtract = (): void =>
    void guarded("extract", async () => {
      const res = await extractRecommendations(synthesisId);
      await reloadSections(); // в документе появился подраздел — прежде статуса (09 §2, 6.2 п.4)
      applyCurrent(res);
      setPhase("ready");
      setRetrofitReason(null);
      setNote(
        `Таблица составлена: строк — ${res.rows.length}` +
          (res.invalidCount ? `, негодных — ${res.invalidCount}` : "") +
          ` · $${res.usage.costUsd.toFixed(4)}` +
          (res.warnings.length ? ` · снято при чистке разметки: ${res.warnings.join("; ")}` : ""),
      );
    });

  const handleBuildPlan = (): void =>
    void guarded("plan", async () => {
      // Номера — как записаны в таблице, в порядке таблицы; только отмеченные
      const nums: string[] = [];
      for (const r of rows) {
        const k = numKey(r.num);
        if (selected.has(k) && isSelectableRow(r) && !nums.includes(r.num)) nums.push(r.num);
      }
      if (nums.length === 0) return;
      const chosenIds = new Set(
        rows.filter((r) => selected.has(numKey(r.num))).map((r) => r.id),
      );
      const fieldChoices: Record<string, string> = {};
      for (const [id, f] of Object.entries(fields)) if (chosenIds.has(id)) fieldChoices[id] = f;
      try {
        const res = await planRecommendations(synthesisId, {
          nums,
          ...(Object.keys(fieldChoices).length ? { fields: fieldChoices } : {}),
        });
        onPlanReady(res.plan, namesOf(rows));
      } catch (err) {
        const left = leftoversOfError(err);
        if (left) {
          setLeftovers(left);
          await refresh({ reparse: false }); // строки могли стать 'stale' / 'invalid'
        }
        throw err;
      }
    });

  const handleOpenPlan = (planId: string): void =>
    void guarded("open-plan", async () => {
      const plan = await getPlan(synthesisId, planId);
      if (plan.status === "done" || plan.status === "failed") {
        setNote("План уже завершён — строки перечитаны.");
        await refresh({ reparse: true });
        return;
      }
      onPlanReady(plan, namesOf(rows));
    });

  const handleDeletePlan = (planId: string): void =>
    void guarded("delete-plan", async () => {
      setConfirmDeletePlan(null);
      await withBusyRetry(() => deletePlan(synthesisId, planId));
      setNote("План удалён — его рекомендации снова ждут решения.");
      await refresh({ reparse: true });
    });

  if (!open) return null;

  const toggleExpanded = (key: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const round = current?.round ?? 0;
  const title = round > 0 ? `◈ Рекомендации критики · раунд ${round}` : "◈ Рекомендации критики";
  const controlsDisabled = busy !== null;
  const reparseBlocked = roundInWork || controlsDisabled;
  const leftoverOf = (r: Recommendation): string | null =>
    leftovers?.declined.find((d) => d.id === r.id)?.reason ?? null;

  /* ── Строка рекомендации ── */
  const renderRow = (r: Recommendation, item: RecommendationItem | null): React.ReactNode => {
    const kind = costKindOf(r);
    const costClass = "rec-cost " + kind;
    const kindText = elementKindText(r);
    const mismatch = kindMismatchText(r, labelOf);
    const options = fieldOptionsOf(r);
    const canChooseField = options.length > 1 && item !== null && isSelectableRow(r);
    const declinedReason = leftoverOf(r);
    return (
      <div className="rec-row" key={r.id} data-testid="rec-row" data-rec-num={r.num} data-rec-status={r.status} data-rec-cost={kind}>
        <div className="rec-row-line">
          <span className="rec-address" data-testid="rec-address">
            {r.addressSection ? `${labelOf(r.addressSection)} → ` : ""}«{r.addressSubsection}»
          </span>
          {r.element && (
            <span className="rec-element" data-testid="rec-element">
              {r.element}
              {kindText && <span className="rec-element-kind" data-testid="rec-element-kind">{kindText}</span>}
            </span>
          )}
          <span className="rec-op">{r.op}</span>
          <span className={costClass} data-testid="rec-cost" title={actionTextOf(r)}>
            {COST_KIND_LABEL[kind]}
          </span>
        </div>
        {mismatch && (
          <div className="rec-mismatch" data-testid="rec-kind-mismatch">
            <span className="dep-icon">⚠</span> {mismatch}
          </div>
        )}
        {r.status === "stale" && (
          <div className="rec-mismatch" data-testid="rec-stale">
            <span className="dep-icon">↻</span> Текст адресата изменился после разбора — довод
            мог обессмыслиться. Перечитайте рекомендации и решите заново.
          </div>
        )}
        {declinedReason && (
          <div className="rec-mismatch" data-testid="rec-declined">
            <span className="dep-icon">✗</span> {declinedReason}
          </div>
        )}
        {item && expanded.has(item.key) && (
          <div className="rec-row-detail">
            <div className="rec-action-text">{actionTextOf(r)}</div>
            {r.replacement && (
              <div className="rec-replacement" data-testid="rec-replacement">
                <span className="form-label">Готовая замена</span>
                <div>{r.replacement}</div>
              </div>
            )}
            {canChooseField && (
              <label className="rec-field" data-testid="rec-field">
                <span className="form-label">Какое поле править</span>
                <select
                  className="form-select"
                  value={fields[r.id] ?? options[0]?.field ?? ""}
                  disabled={controlsDisabled}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFields((prev) => {
                      const next = { ...prev };
                      if (value === options[0]?.field) delete next[r.id];
                      else next[r.id] = value;
                      return next;
                    });
                  }}
                >
                  {options.map((o, i) => (
                    <option key={o.field} value={o.field}>
                      {o.label}
                      {i === 0 ? " (по умолчанию)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </div>
    );
  };

  /* ── Рекомендация (все строки одного номера) ── */
  const renderItem = (item: RecommendationItem, fork: boolean): React.ReactNode => {
    const first = item.rows[0] as Recommendation;
    const isOpen = expanded.has(item.key);
    const checked = selected.has(item.key);
    const prose = isOpen ? proseOf(item.num) : null;
    const itemClass = "rec-item" + (checked ? " selected" : "") + (item.selectable ? "" : " inert");
    const stale = item.rows.some((r) => r.status === "stale");
    const manualOnly = item.costKinds.every((k) => k === "manual");
    return (
      <div className={itemClass} key={item.key} data-testid="rec-item" data-rec-num={item.num}>
        <div className="rec-item-head">
          <label className="rec-pick" title={item.selectable ? "Взять в план" : "В план не берётся"}>
            <input
              type={fork ? "radio" : "checkbox"}
              name={fork ? `rec-fork-${item.base}` : undefined}
              data-testid="rec-pick"
              checked={checked}
              disabled={!item.selectable || controlsDisabled || roundInWork}
              onChange={(e) => setSelected((prev) => toggleSelection(prev, item, e.target.checked))}
              onClick={() => {
                // радио само не снимается: повторный клик по выбранному варианту — снять
                if (fork && checked) setSelected((prev) => toggleSelection(prev, item, false));
              }}
            />
            <span className="rec-num">№ {item.num}</span>
          </label>
          <span className={"compat-chip " + severityChipOf(first.severity)} data-testid="rec-severity">
            {first.severity || "—"}
          </span>
          {first.status === "rejected" && <span className="cert-badge">отклонялась</span>}
          {stale && <span className="cert-badge gold">текст изменился</span>}
          {manualOnly && <span className="cert-badge">исполняется вручную</span>}
          <button
            type="button"
            className="rec-toggle"
            data-testid="rec-toggle"
            aria-expanded={isOpen}
            onClick={() => toggleExpanded(item.key)}
          >
            {isOpen ? "▾ свернуть" : "▸ довод"}
          </button>
        </div>
        {item.rows.map((r) => renderRow(r, item))}
        {isOpen && (
          <div className="rec-body" data-testid="rec-body">
            <div className="form-label">Рекомендация</div>
            <div className="rec-prose" data-testid="rec-prose">
              {prose ?? "Текст рекомендации в прозе не найден — см. подраздел «Рекомендации по улучшению»."}
            </div>
            <div className="form-label">Основание</div>
            <div className="rec-rationale" data-testid="rec-rationale">
              {first.rationale
                ? `Проблема установлена в подразделе критики «${first.rationale}».`
                : "Подраздел критики не назван."}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPlainRow = (r: Recommendation): React.ReactNode => (
    <div className="rec-past-row" key={r.id} data-testid="rec-past-row">
      <span className="rec-num">№ {r.num}</span>
      <span className="rec-address">
        {r.addressSection ? `${labelOf(r.addressSection)} → ` : ""}«{r.addressSubsection}»
        {r.element ? ` · ${r.element}` : ""}
      </span>
      <span className="rec-op">{r.op}</span>
      <span className="rec-status">{STATUS_LABEL[r.status]}</span>
    </div>
  );

  return (
    <div
      className="edit-overlay visible"
      data-testid="rec-panel"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busyRef.current) onClose();
      }}
    >
      <div className="edit-modal rec-modal">
        <div className="edit-modal-header">
          <div className="edit-modal-title" data-testid="rec-title">{title}</div>
          <button type="button" className="raw-close" onClick={onClose} disabled={controlsDisabled}>
            ✕ Закрыть
          </button>
        </div>

        <div className="edit-modal-body">
          {phase === "loading" && (
            <div className="edit-regen-progress active">
              <span className="edit-regen-spinner" /> Читаю рекомендации…
            </div>
          )}

          {error && (
            <div className="edit-dep-warn danger rec-gap" data-testid="rec-error">
              <span className="dep-icon">⚠</span>
              <span>{error}</span>
            </div>
          )}
          {note && (
            <div className="pool-status ok rec-gap" data-testid="rec-note">
              {note}
            </div>
          )}

          {/* ── Ретрофит: таблицы нет, рекомендации есть в прозе ── */}
          {phase === "retrofit" && (
            <div className="callout note rec-gap" data-testid="rec-retrofit">
              <span className="callout-label">Таблицы рекомендаций нет</span>
              {retrofitReason === "no_table" ? (
                <>
                  <p>
                    Концепция создана до того, как критика стала писать машиночитаемую таблицу:
                    рекомендации есть в прозе, но исполнять их пока нечем. Можно составить таблицу
                    по имеющимся рекомендациям — текст критики при этом не меняется, в документ
                    добавляется подраздел «{RECOMMENDATIONS_TABLE_SUBSECTION}».
                  </p>
                  <p className="rec-retrofit-cost" data-testid="rec-retrofit-cost">
                    Цена — одно обращение к модели: единица квоты перегенераций по подписке либо
                    списание с баланса по факту (порядка нескольких центов); стоимость войдёт в
                    итог документа и будет показана здесь.
                  </p>
                  <button
                    type="button"
                    className="edit-sec-btn primary"
                    data-testid="rec-retrofit-run"
                    onClick={handleExtract}
                    disabled={controlsDisabled}
                  >
                    {busy === "extract" ? "Составляю таблицу…" : "Составить таблицу по имеющимся рекомендациям"}
                  </button>
                </>
              ) : retrofitReason === "no_prose" ? (
                <p>
                  В разделе критики нет подраздела «Рекомендации по улучшению» — составлять таблицу
                  не по чему. Перегенерируйте раздел «{labelOf(RECOMMENDATIONS_SECTION_KEY)}».
                </p>
              ) : (
                <p>В документе нет раздела «{labelOf(RECOMMENDATIONS_SECTION_KEY)}».</p>
              )}
            </div>
          )}

          {/* ── Раунд в работе ── */}
          {phase === "ready" && roundInWork && (
            <div className="callout warning rec-gap" data-testid="rec-round-in-work">
              <span className="callout-label">Раунд {round} в работе</span>
              <p>
                Часть рекомендаций стоит в плане правок. Пока план не исполнен и не удалён, новый
                выбор и разбор заново недоступны: сменившаяся критика открыла бы новый раунд и
                оставила бы план без рекомендаций, которые его породили.
              </p>
              {[...plannedByPlan.entries()].map(([planId, list]) => (
                <div className="rec-plan-line" key={planId} data-rec-plan-actions>
                  <span>
                    В плане: {[...new Set(list.map((r) => `№ ${r.num}`))].join(", ")}
                  </span>
                  <button
                    type="button"
                    className="edit-sec-btn primary"
                    data-testid="rec-open-plan"
                    onClick={() => handleOpenPlan(planId)}
                    disabled={controlsDisabled}
                  >
                    Открыть план
                  </button>
                  {confirmDeletePlan === planId ? (
                    <>
                      <button
                        type="button"
                        className="edit-sec-btn danger"
                        data-testid="rec-delete-plan-confirm"
                        onClick={() => handleDeletePlan(planId)}
                        disabled={controlsDisabled}
                      >
                        Точно удалить?
                      </button>
                      <button
                        type="button"
                        className="edit-sec-btn"
                        onClick={() => setConfirmDeletePlan(null)}
                      >
                        Отмена
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="edit-sec-btn"
                      data-testid="rec-delete-plan"
                      onClick={() => setConfirmDeletePlan(planId)}
                      disabled={controlsDisabled}
                    >
                      Удалить план
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Ждут решения ── */}
          {phase === "ready" && groups.open.length === 0 && !roundInWork && groups.invalid.length === 0 && (
            <div className="rec-empty" data-testid="rec-empty">
              {groups.done.length > 0
                ? "Все рекомендации этого раунда исполнены."
                : "В таблице рекомендаций нет строк."}
            </div>
          )}
          {phase === "ready" &&
            groups.open.map((g) =>
              g.fork ? (
                <div className="rec-fork" key={g.base} data-testid="rec-fork" data-rec-base={g.base}>
                  <div className="rec-fork-title">
                    Рекомендация {g.base} — развилка: варианты исключают друг друга, выберите не
                    более одного
                  </div>
                  {g.items.map((item) => renderItem(item, true))}
                </div>
              ) : (
                g.items.map((item) => renderItem(item, false))
              ),
            )}

          {/* ── Исполнено в этом раунде ── */}
          {phase === "ready" && groups.done.length > 0 && (
            <details className="sec-disclosure rec-gap" data-testid="rec-done">
              <summary>
                Раунд {round} · исполнено: {new Set(groups.done.map((r) => numKey(r.num))).size}
              </summary>
              <div className="disclosure-body">{groups.done.map(renderPlainRow)}</div>
            </details>
          )}

          {/* ── Негодные: отдельной группой внизу, без выбора ── */}
          {phase === "ready" && groups.invalid.length > 0 && (
            <div className="rec-invalid" data-testid="rec-invalid">
              <div className="rec-invalid-title">
                Негодные строки · {groups.invalid.length} — в план не берутся
              </div>
              {groups.invalid.map((r) => (
                <div className="rec-invalid-row" key={r.id} data-testid="rec-invalid-row" data-rec-num={r.num}>
                  <div className="rec-row-line">
                    <span className="rec-num">№ {r.num}</span>
                    <span className="rec-address">«{r.addressSubsection}»</span>
                    {r.element && <span className="rec-element">{r.element}</span>}
                    <span className="rec-op">{r.op}</span>
                  </div>
                  <div className="rec-invalid-reason" data-testid="rec-invalid-reason">
                    {r.invalidReason ?? "причина не названа"}
                  </div>
                </div>
              ))}
            </div>
          )}
          {(phase === "ready" || phase === "failed") && hasTableSubsection && (groups.invalid.length > 0 || phase === "failed" || error) && (
            <div className="rec-table-edit">
              <span>
                Подраздел «{RECOMMENDATIONS_TABLE_SUBSECTION}» замком не заперт: адрес или элемент
                можно поправить руками, затем перечитать.
              </span>
              <button
                type="button"
                className="edit-sec-btn"
                data-testid="rec-edit-table"
                onClick={onEditTable}
                disabled={controlsDisabled}
              >
                ✎ Править таблицу рекомендаций вручную
              </button>
            </div>
          )}

          {/* ── Прошлые раунды: свёрнуто, с номером раунда ── */}
          {past.map((p) => {
            const count = (status: Recommendation["status"]): number =>
              new Set(p.rows.filter((r) => r.status === status).map((r) => numKey(r.num))).size;
            return (
              <details className="sec-disclosure rec-gap" key={p.round} data-testid="rec-past-round" data-rec-round={p.round}>
                <summary>
                  Раунд {p.round} · исполнено: {count("done")} · отклонено: {count("rejected")}
                </summary>
                <div className="disclosure-body">{p.rows.map(renderPlainRow)}</div>
              </details>
            );
          })}
        </div>

        <div className="edit-modal-footer">
          <div className="rec-footer-info">
            <div className="rec-estimate" data-testid="rec-estimate">
              {phase === "ready" ? estimateText(estimate) : ""}
            </div>
            {estimate.conflicts.map((c) => (
              <div className="rec-estimate-conflict" key={c} data-testid="rec-estimate-conflict">
                {c}
              </div>
            ))}
            {phase === "ready" && estimate.free + estimate.paid > 0 && (
              <div className="rec-estimate-hint">
                Каскадные шаги (в том числе перегенерацию критики) добавит план — их можно будет
                подтвердить или пропустить.
              </div>
            )}
          </div>
          {phase === "ready" && (
            <button
              type="button"
              className="edit-sec-btn"
              data-testid="rec-reparse"
              onClick={handleReparse}
              disabled={reparseBlocked}
              title={
                roundInWork
                  ? "Раунд в работе: сначала исполните либо удалите план"
                  : "Прочитать таблицу рекомендаций заново"
              }
            >
              {busy === "parse" ? "Перечитываю…" : "↻ Перечитать"}
            </button>
          )}
          {phase === "ready" && (
            <button
              type="button"
              className="edit-sec-btn primary rec-build"
              data-testid="rec-build-plan"
              onClick={handleBuildPlan}
              disabled={controlsDisabled || roundInWork || estimate.free + estimate.paid === 0}
            >
              {busy === "plan" ? "Собираю…" : "▶ Собрать план"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
