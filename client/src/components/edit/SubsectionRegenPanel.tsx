/**
 * Панель подраздельной перегенерации. Беседа 2.3 (запрос 1, п. 4).
 *
 * Порт showSubsectionRegenUI/hideSubsectionRegenUI/toggleSubRegenInclude/
 * executeSubsectionRegen [18686–19050], с адаптациями сервис-модели:
 *  - зависимости и оценка — POST /subsection-impact (превью считает
 *    сервер ДО запуска; транспорт добавлен 2.3 — /regenerate-subsection
 *    отвечает { ok:true } фоном и affectedSubs вернуть не может, долг
 *    §12 «внутрисекционный каскад» закрывается превью);
 *  - показ зависимых: intra («Также будут предложены…»), cross
 *    («Затронуты в других разделах», группировка по разделу, капсула —
 *    весь раздел), режимы — тексты 1:1 [18700–18760];
 *  - чекбокс «Включить текущее содержимое» появляется при непустой
 *    инструкции (toggleSubRegenInclude);
 *  - КАСКАД: вместо цепочки confirm() исходника — чекбоксы волны
 *    (intra + cross) прямо в панели; исполнение очередью
 *    ПОСЛЕДОВАТЕЛЬНЫХ POST'ов: следующий уходит по section_done
 *    предыдущего (проп sectionEvent из WS-соединения useEditPlan;
 *    параллельные запуски невозможны — сервер держит один слот,
 *    409 GENERATION_IN_PROGRESS). stream_error останавливает очередь.
 *    Каскад «третьей волны» [19870+] и каскад режимов НЕ переносятся:
 *    первая — по данным превью не вычислима без повторного запроса
 *    после каждой волны (осознанное упрощение, зафиксировать в ревью),
 *    вторые — очередь запусков runMode после волны: инфраструктура
 *    есть с 4.1 (mode-service + POST /modes/:key/run), сам каскад не
 *    портирован — долг §12 за 4.1 (довыполнение по команде).
 *  - Подраздел капсулы каскада → перегенерация ВСЕГО раздела
 *    (POST /regenerate/:key) — квирк исходника сохранён.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CrossSectionDepDto,
  SubsectionImpactResponse,
} from "@philosynth/shared/types/edit-plan";

import { apiPost } from "../../api/client";
import { getModeResults, regenerateModeResult } from "../../api/modes";
import { getSubsectionImpact, regenerateSubsection } from "../../api/plans";
import type { SectionEvent } from "../../hooks/useEditPlan";

export interface SubsectionRegenPanelProps {
  synthesisId: string;
  sectionKey: string;
  subsectionName: string;
  labels: (key: string) => string;
  /** Последнее WS-событие завершения/ошибки раздела (очередь каскада) */
  sectionEvent: SectionEvent | null;
  onClose: () => void;
  /** Волна запущена/завершена — родителю для блокировок */
  onBusyChange?: ((busy: boolean) => void) | undefined;
}

type QueueItem =
  | { kind: "sub"; section: string; subsection: string }
  | { kind: "section"; section: string }
  /* Каскад режимов (долг §12 закрыт): section = "mode:{modeKey}" —
   * унифицирует матчинг с mode_done/stream_error в очереди */
  | { kind: "mode"; section: string; modeKey: string;
      index: number; title: string };

export function SubsectionRegenPanel({
  synthesisId,
  sectionKey,
  subsectionName,
  labels,
  sectionEvent,
  onClose,
  onBusyChange,
}: SubsectionRegenPanelProps) {
  const [impact, setImpact] = useState<SubsectionImpactResponse | null>(null);
  const [impactState, setImpactState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [note, setNote] = useState("");
  const [includeContent, setIncludeContent] = useState(false);
  const [cascadeChecked, setCascadeChecked] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState<QueueItem | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);

  // Превью зависимостей/оценки — при открытии и смене цели
  useEffect(() => {
    let alive = true;
    setImpact(null);
    setImpactState("loading");
    setCascadeChecked(new Set());
    setNote("");
    setIncludeContent(false);
    getSubsectionImpact(synthesisId, { sectionKey, subsectionName })
      .then((r) => {
        if (!alive) return;
        setImpact(r);
        setImpactState("ready");
      })
      .catch(() => {
        if (alive) setImpactState("error");
      });
    return () => {
      alive = false;
    };
  }, [synthesisId, sectionKey, subsectionName]);

  const busy = running !== null || queue.length > 0;
  const onBusyChangeRef = useRef(onBusyChange);
  onBusyChangeRef.current = onBusyChange;
  useEffect(() => {
    onBusyChangeRef.current?.(busy);
  }, [busy]);

  const itemKey = (d: CrossSectionDepDto): string =>
    d.section + ":" + (d.subsection ?? "*");

  const startItem = useCallback(
    async (item: QueueItem) => {
      setRunning(item);
      if (item.kind === "mode") {
        // Паритет прогресса исходника [19032]: «Каскад: {title}...»
        setProgressText(`Каскад: ${item.title}…`);
        try {
          await regenerateModeResult(synthesisId, item.modeKey, item.index);
          // Дальше ждём mode_done/stream_error по WS
        } catch (err) {
          setProgressText(
            "⚠ " + (err instanceof Error ? err.message : String(err)),
          );
          setRunning(null);
          setQueue([]);
        }
        return;
      }
      const label =
        item.kind === "sub"
          ? `${labels(item.section)} → ${item.subsection}`
          : labels(item.section);
      setProgressText(`Перегенерация: ${label}…`);
      try {
        if (item.kind === "sub") {
          const isMain =
            item.section === sectionKey && item.subsection === subsectionName;
          await regenerateSubsection(synthesisId, {
            sectionKey: item.section,
            subsectionName: item.subsection,
            ...(isMain && note.trim() ? { userNote: note.trim() } : {}),
            ...(isMain ? { includeCurrentContent: includeContent } : {}),
          });
        } else {
          // Капсула/весь раздел — POST /regenerate/:key (квирк исходника)
          await apiPost<{ ok: true }>(
            `/syntheses/${encodeURIComponent(synthesisId)}/regenerate/${encodeURIComponent(item.section)}`,
            {},
          );
        }
        // Дальше ждём section_done/stream_error по WS
      } catch (err) {
        setProgressText(
          "⚠ " + (err instanceof Error ? err.message : String(err)),
        );
        setRunning(null);
        setQueue([]);
      }
    },
    [synthesisId, sectionKey, subsectionName, note, includeContent, labels],
  );

  /* ── Каскад режимов после волны (долг §12 закрыт) ── */
  const modeCascadeAskedRef = useRef(false);
  const askModeCascade = useCallback(async () => {
    const affected = impact?.affectedModes ?? [];
    if (affected.length === 0) return;
    // Оценка — паритет modeCostTotal исходника [19013–19017]: сумма по
    // каждому затронутому результату; статические estimate — из GET
    // /modes/:modeKey (по одному запросу на уникальный ключ)
    let costTotal = 0;
    try {
      const uniq = [...new Set(affected.map((a) => a.modeKey))];
      const est = new Map<string, number>();
      for (const mk of uniq) {
        const r = await getModeResults(synthesisId, mk);
        est.set(mk, r.estimate?.cost ?? 0);
      }
      for (const a of affected) costTotal += est.get(a.modeKey) ?? 0;
    } catch {
      costTotal = 0; // fail-open — как estimateModeCost → null
    }
    const modeNames = affected.map((a) => a.title).join(", ");
    const costStr =
      costTotal > 0
        ? "\nОценка стоимости: ≈ $" + costTotal.toFixed(4) +
          " (" + (costTotal * 100).toFixed(2) + "¢), " +
          affected.length + " запр."
        : "";
    const doRegen = window.confirm(
      "Подраздел «" + subsectionName + "» обновлён.\n\n" +
      "Затронутые режимы: " + modeNames + "." + costStr + "\n\n" +
      "Перегенерировать их?",
    );
    if (!doRegen) {
      setProgressText("✓ Готово");
      return;
    }
    const [first, ...rest] = affected.map(
      (a): QueueItem => ({
        kind: "mode",
        section: "mode:" + a.modeKey,
        modeKey: a.modeKey,
        index: a.index,
        title: a.title,
      }),
    );
    if (!first) return;
    setQueue(rest);
    void startItem(first);
  }, [impact, synthesisId, subsectionName, startItem]);

  // Очередь: section_done текущего раздела → следующий POST
  const lastEventRef = useRef<SectionEvent | null>(null);
  useEffect(() => {
    if (!sectionEvent || sectionEvent === lastEventRef.current) return;
    lastEventRef.current = sectionEvent;
    if (!running) return;
    if (
      sectionEvent.sectionKey !== null &&
      sectionEvent.sectionKey !== running.section
    )
      return; // чужое событие (например, параллельная вкладка)
    if (sectionEvent.kind === "stream_error") {
      setProgressText("⚠ Перегенерация прервана — очередь остановлена.");
      setRunning(null);
      setQueue([]);
      return;
    }
    const [next, ...rest] = queue;
    if (next) {
      setQueue(rest);
      void startItem(next);
    } else if (
      running.kind !== "mode" &&
      !modeCascadeAskedRef.current &&
      (impact?.affectedModes.length ?? 0) > 0
    ) {
      // Каскад режимов исходника [19007–19036]: после волны — confirm
      // со списком и оценкой, при согласии — перегенерация затронутых.
      // ОТСТУПЛЕНИЕ (задокументировано): исходник звал runMode() с
      // paramValue ИЗ ПОЛЯ МОДАЛКИ («нужен fallback» — его же
      // комментарий); здесь — тихая перегенерация СУЩЕСТВУЮЩИХ
      // результатов с их собственными param (механизм планового
      // каскада [19756]) через POST .../regenerate.
      modeCascadeAskedRef.current = true;
      setRunning(null);
      void askModeCascade();
    } else {
      setProgressText("✓ Готово");
      setRunning(null);
    }
  }, [sectionEvent, running, queue, startItem, impact, askModeCascade]);

  const handleRun = useCallback(() => {
    if (!impact || busy) return;
    const wave: QueueItem[] = [];
    for (const sub of impact.intraDependents) {
      if (cascadeChecked.has(sectionKey + ":" + sub))
        wave.push({ kind: "sub", section: sectionKey, subsection: sub });
    }
    for (const d of impact.crossDependents) {
      if (!cascadeChecked.has(itemKey(d))) continue;
      if (d.subsection && d.section !== "capsule")
        wave.push({ kind: "sub", section: d.section, subsection: d.subsection });
      else wave.push({ kind: "section", section: d.section });
    }
    setQueue(wave);
    modeCascadeAskedRef.current = false;
    void startItem({
      kind: "sub",
      section: sectionKey,
      subsection: subsectionName,
    });
  }, [impact, busy, cascadeChecked, sectionKey, subsectionName, startItem]);

  const toggleCascade = (k: string, checked: boolean) => {
    setCascadeChecked((prev) => {
      const next = new Set(prev);
      if (checked) next.add(k);
      else next.delete(k);
      return next;
    });
  };

  // Группировка cross по разделам (тексты [18744–18760])
  const crossGrouped = new Map<string, CrossSectionDepDto[]>();
  for (const d of impact?.crossDependents ?? []) {
    const list = crossGrouped.get(d.section) ?? [];
    list.push(d);
    crossGrouped.set(d.section, list);
  }

  return (
    <div
      style={{
        marginTop: 8,
        padding: 10,
        border: "1px solid var(--rule)",
        background: "var(--white)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          fontWeight: 600,
          color: "var(--blue-corp)",
          marginBottom: 6,
        }}
      >
        ⟳ {subsectionName}
      </div>

      <textarea
        className="edit-sec-ctx-field"
        style={{ height: 40 }}
        placeholder="Дополнительная инструкция (необязательно)..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={busy}
      />
      {note.trim() && (
        <div style={{ marginTop: 6 }}>
          <label className="edit-sec-check" style={{ fontSize: 10 }}>
            <input
              type="checkbox"
              checked={includeContent}
              onChange={(e) => setIncludeContent(e.target.checked)}
              disabled={busy}
            />
            Включить текущее содержимое подраздела в контекст
          </label>
        </div>
      )}

      {/* Зависимости (превью сервера) */}
      <div
        style={{
          marginTop: 8,
          fontFamily: "var(--mono)",
          fontSize: 9,
          color: "var(--gold)",
          lineHeight: 1.6,
        }}
      >
        {impactState === "loading" && "Анализ зависимостей…"}
        {impactState === "error" && (
          <span style={{ color: "var(--red)" }}>
            Не удалось получить зависимости подраздела.
          </span>
        )}
        {impactState === "ready" && impact && (
          <>
            {impact.intraDependents.length > 0 && (
              <div>
                ⚡ Также будут предложены к перегенерации:{" "}
                {impact.intraDependents.map((d, i) => (
                  <label
                    key={d}
                    className="edit-sec-check"
                    style={{
                      display: "inline-flex",
                      fontSize: 9,
                      color: "var(--gold)",
                      marginLeft: i === 0 ? 4 : 10,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={cascadeChecked.has(sectionKey + ":" + d)}
                      onChange={(e) =>
                        toggleCascade(sectionKey + ":" + d, e.target.checked)
                      }
                      disabled={busy}
                    />
                    «{d}»
                  </label>
                ))}
              </div>
            )}
            {crossGrouped.size > 0 && (
              <div style={{ marginTop: 6 }}>
                <div>⚡ Затронуты в других разделах:</div>
                <div style={{ margin: "4px 0 0 12px", lineHeight: 1.8 }}>
                  {[...crossGrouped.entries()].map(([sec, deps]) => (
                    <div key={sec}>
                      • <b>{labels(sec)}</b>
                      {deps.some((d) => d.subsection && sec !== "capsule")
                        ? ": "
                        : " (весь раздел)"}
                      {deps.map((d) => (
                        <label
                          key={itemKey(d)}
                          className="edit-sec-check"
                          style={{
                            display: "inline-flex",
                            fontSize: 9,
                            color: "var(--gold)",
                            marginRight: 8,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={cascadeChecked.has(itemKey(d))}
                            onChange={(e) =>
                              toggleCascade(itemKey(d), e.target.checked)
                            }
                            disabled={busy}
                          />
                          {d.subsection && sec !== "capsule"
                            ? `«${d.subsection}»`
                            : "весь раздел"}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {impact.affectedModes.length > 0 && (
              <div style={{ marginTop: 6, color: "var(--violet)" }}>
                ⚡ Затронутые режимы:{" "}
                {[...new Set(impact.affectedModes.map((m) => m.title))]
                  .map((n) => `«${n}»`)
                  .join(", ")}
              </div>
            )}
            {impact.estimate && (
              <div style={{ marginTop: 4 }}>
                ≈ ${impact.estimate.cost.toFixed(4)} (~
                {Math.round(impact.estimate.inTokens / 1000)}K вх. + ~
                {Math.round(impact.estimate.outTokens / 1000)}K вых.)
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
        <button
          type="button"
          className="edit-sec-btn primary"
          style={{ fontSize: 9, padding: "5px 14px" }}
          onClick={handleRun}
          disabled={busy || impactState === "loading"}
        >
          ▶ Перегенерировать
        </button>
        <button
          type="button"
          className="edit-sec-btn"
          style={{ fontSize: 9, padding: "5px 14px" }}
          onClick={onClose}
          disabled={busy}
        >
          Отмена
        </button>
      </div>

      <div className={"edit-regen-progress" + (busy || progressText ? " active" : "")}>
        {busy && <div className="edit-regen-spinner" />}
        <span>{progressText ?? ""}</span>
      </div>
    </div>
  );
}
