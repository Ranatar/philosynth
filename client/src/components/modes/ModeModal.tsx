/**
 * Модальное окно режима. Беседа 4.1 (запрос 1, п. 4).
 * React-порт openModeModal/runMode(UI-часть)/switchModeTab/
 * removeModeResult/closeModeModal [22896–23163] + разметки #modeOverlay
 * [4330–4363] (CSS .mode-* — в globals.css дословно).
 *
 * Устройство:
 *  - открытие → GET /modes/:modeKey ({ results, warnings, estimate } —
 *    аддитивный транспорт 4.1) → последняя вкладка либо пусто;
 *  - предупреждения checkModeDeps: ⚠ .sec-warning-item /
 *    💡 .sec-recommend-item (классы 1.5, как в исходнике [22983]);
 *  - оценка стоимости: «≈ $X.XXXX (~NK вх. + ~MK вых.)» [23071];
 *  - запуск: WS start_mode по собственному соединению useWebSocket
 *    (доставка по userId — дельты этого прогона приходят сюда);
 *    закрытый сокет → fallback POST /run (api/modes) — стрим догонит
 *    по mode_done/refetch. Вкладка ⟳ .adding, контент растёт по
 *    stream_delta (sectionKey "mode:{modeKey}"), кнопка
 *    «Генерация... N симв.» — порт runText [23103];
 *  - mode_done → refetch результатов (единый источник — БД, правило
 *    1.6b), активная вкладка — новая; футер «N вх. + M вых. · $c»;
 *  - stream_error режима → callout warning в контенте (порт [23125]),
 *    ⟳-вкладка снимается, возврат к последней (порт [23146–23153]);
 *  - ⏹ «Остановить» при генерации → WS cancel (user-abort слота;
 *    у режимов паузы нет — придёт stream_error);
 *  - удаление вкладки: confirm «Удалить результат «param»?» → DELETE →
 *    refetch, активная min(index, len-1) (порт removeModeResult);
 *  - «Скопировать»: текст контента в буфер (copyModeContent —
 *    адаптация: plain text из HTML).
 *
 * Клиентская копия статики MODE_CONFIG (MODE_UI/MODE_ORDER) — тексты
 * дословно из исходника [22578]; дрейф-контроль клиент↔сервер — секция
 * integration-check беседы (блок завершения). Кнопкам SynthesisPage
 * отсюда экспортируются MODE_ORDER/MODE_UI.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ModeCostEstimate,
  ModeDepsWarning,
  ModeKey,
  ModeResult,
} from "@philosynth/shared/types/modes";
import type { WsServerMessage } from "@philosynth/shared/types/ws-messages";

import { deleteMode, getModeResults, runMode as runModeApi } from "../../api/modes";
import { useWebSocket } from "../../hooks/useWebSocket";
import { ModeContent } from "./ModeContent";
import { ModeTabBar } from "./ModeTabBar";

/* ── Клиентская статика MODE_CONFIG [22578] (дословно) ─────────────── */

export interface ModeUiConfig {
  title: string;
  desc: string;
  paramLabel: string;
  paramPlaceholder: string;
  suggestions: string[];
}

export const MODE_UI: Readonly<Record<ModeKey, ModeUiConfig>> = {
  adversarial: {
    title: "⚔ Оппонент",
    desc: "Генерирует контр-документ от лица философа или традиции, несовместимой с синтезом.",
    paramLabel: "Философ или традиция-оппонент",
    paramPlaceholder: "Например: Кант, логический позитивизм, буддийская Абхидхарма...",
    suggestions: ["Кант", "Логический позитивизм", "Буддийская Абхидхарма", "Маркс", "Постмодернизм"],
  },
  translator: {
    title: "🔄 Переводчик",
    desc: "Переформулирует концепцию в терминах другой философской традиции.",
    paramLabel: "Целевая традиция",
    paramPlaceholder: "Например: аналитическая философия разума, буддийская Абхидхарма...",
    suggestions: ["Аналитическая ФР", "Буддийская Абхидхарма", "Феноменология Гуссерля", "Прагматизм"],
  },
  timeslice: {
    title: "⏳ Временной срез",
    desc: "Проецирует концепцию в конкретный исторический период.",
    paramLabel: "Исторический период",
    paramPlaceholder: "Например: Афины V в. до н.э., Средневековый Париж XIII в....",
    suggestions: ["Афины V в. до н.э.", "Париж XIII в.", "Вена 1920-х", "Киото XVII в."],
  },
} as const;

export const MODE_ORDER: readonly ModeKey[] = [
  "adversarial",
  "translator",
  "timeslice",
];

/* ── Компонент ─────────────────────────────────────────────────────── */

export interface ModeModalProps {
  open: boolean;
  synthesisId: string;
  modeKey: ModeKey | null;
  onClose: () => void;
  /** Счётчик результатов изменился (кнопки SynthesisPage) */
  onResultsChanged?: ((modeKey: ModeKey, count: number) => void) | undefined;
}

export function ModeModal({
  open,
  synthesisId,
  modeKey,
  onClose,
  onResultsChanged,
}: ModeModalProps) {
  const [results, setResults] = useState<ModeResult[]>([]);
  const [warnings, setWarnings] = useState<ModeDepsWarning[]>([]);
  const [estimate, setEstimate] = useState<ModeCostEstimate | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [param, setParam] = useState("");
  const [running, setRunning] = useState(false);
  const [runChars, setRunChars] = useState(0);
  const [liveHtml, setLiveHtml] = useState("");
  const [runError, setRunError] = useState<string | null>(null);
  /** Футер после завершения генерации: «N вх. + M вых. · $c» [23100] */
  const [doneInfo, setDoneInfo] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const runningRef = useRef(false);
  runningRef.current = running;
  const modeKeyRef = useRef<ModeKey | null>(modeKey);
  modeKeyRef.current = modeKey;

  const ui = modeKey ? MODE_UI[modeKey] : null;
  const streamKey = modeKey ? `mode:${modeKey}` : "";

  const refetch = useCallback(
    async (selectIndex?: number) => {
      if (!modeKeyRef.current) return;
      const mk = modeKeyRef.current;
      try {
        const res = await getModeResults(synthesisId, mk);
        setResults(res.results);
        setWarnings(res.warnings);
        setEstimate(res.estimate);
        setActiveIndex(
          res.results.length === 0
            ? -1
            : Math.min(selectIndex ?? res.results.length - 1, res.results.length - 1),
        );
        onResultsChanged?.(mk, res.results.length);
      } catch {
        // 403/404/сеть — модалка показывает пустое состояние
        setResults([]);
        setWarnings([]);
        setEstimate(null);
        setActiveIndex(-1);
      }
    },
    [synthesisId, onResultsChanged],
  );

  // Открытие/смена режима: сброс + загрузка (порт openModeModal).
  // refetch — через ref, НЕ в deps: его идентичность зависит от
  // onResultsChanged родителя, и колбэк в deps зациклил бы сброс
  // (обновление счётчика → новый refetch → сброс → refetch → …) —
  // грабля R3 беседы 2.3 (цикл ремаунтов от нестабильных ссылок).
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  useEffect(() => {
    if (!open || !modeKey) return;
    setParam("");
    setRunning(false);
    setRunChars(0);
    setLiveHtml("");
    setRunError(null);
    setDoneInfo(null);
    void refetchRef.current();
    // Фокус в поле параметра (setTimeout 100 исходника)
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [open, modeKey, synthesisId]);

  /* ── Собственное WS-соединение (доставка по userId) ── */
  const handleMessage = useCallback(
    (msg: WsServerMessage) => {
      const mk = modeKeyRef.current;
      if (!mk) return;
      const key = `mode:${mk}`;
      switch (msg.type) {
        case "stream_delta":
          if (msg.synthesisId !== synthesisId || msg.sectionKey !== key) return;
          if (!runningRef.current) return;
          setRunChars(msg.totalChars);
          setLiveHtml((prev) => prev + msg.delta);
          break;
        case "mode_done": {
          if (msg.synthesisId !== synthesisId || msg.modeKey !== mk) return;
          setRunning(false);
          setLiveHtml("");
          setRunChars(0);
          setDoneInfo(
            msg.usage.inputTokens.toLocaleString("ru") + " вх. + " +
              msg.usage.outputTokens.toLocaleString("ru") + " вых. · $" +
              msg.usage.costUsd.toFixed(4),
          );
          void refetch(msg.index);
          break;
        }
        case "stream_error":
          if (msg.synthesisId !== synthesisId || msg.sectionKey !== key) return;
          if (!runningRef.current) return;
          // [23125]: callout в контенте; ⟳-вкладка снимается, возврат
          // к последней готовой (refetch по текущему activeIndex)
          setRunning(false);
          setLiveHtml("");
          setRunChars(0);
          setRunError(msg.error);
          break;
        default:
          break;
      }
    },
    [synthesisId, refetch],
  );

  const ws = useWebSocket({ autoConnect: open, onMessage: handleMessage });

  /* ── Запуск (порт runMode, UI-часть [23020]) ── */
  const handleRun = useCallback(() => {
    const mk = modeKeyRef.current;
    if (!mk || runningRef.current) return;
    const value = param.trim();
    if (!value) {
      // alert("Заполните параметр.") исходника
      (globalThis as { alert?: (m: string) => void }).alert?.("Заполните параметр.");
      return;
    }
    setRunning(true);
    setRunChars(0);
    setLiveHtml("");
    setRunError(null);
    setDoneInfo(null);
    const sent = ws.send({
      type: "start_mode",
      synthesisId,
      modeKey: mk,
      param: value,
    });
    if (!sent) {
      // Сокет закрыт → REST-запуск §2.7; события догонят по WS/refetch
      runModeApi(synthesisId, mk, value).catch((err: unknown) => {
        setRunning(false);
        setRunError(err instanceof Error ? err.message : String(err));
      });
    }
  }, [param, synthesisId, ws]);

  /** ⏹ Остановить (userAbortGeneration → WS cancel; у режимов паузы нет) */
  const handleAbort = useCallback(() => {
    ws.send({ type: "cancel", synthesisId });
  }, [ws, synthesisId]);

  /* ── Удаление (порт removeModeResult [22937]) ── */
  const handleRemove = useCallback(
    (index: number) => {
      const mk = modeKeyRef.current;
      if (!mk) return;
      const target = results[index];
      if (!target) return;
      const confirmFn = (globalThis as {
        confirm?: (m: string) => boolean;
      }).confirm;
      if (confirmFn && !confirmFn(`Удалить результат «${target.paramValue}»?`)) {
        return;
      }
      deleteMode(synthesisId, mk, index)
        .then(() => refetch(Math.min(index, results.length - 2)))
        .catch(() => void refetch());
    },
    [results, synthesisId, refetch],
  );

  /* ── «Скопировать» (copyModeContent — адаптация: plain text) ── */
  const handleCopy = useCallback(() => {
    const html =
      running ? liveHtml : (results[activeIndex]?.htmlContent ?? "");
    if (!html) return;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const text = doc.body.textContent ?? "";
    void navigator.clipboard?.writeText(text);
  }, [running, liveHtml, results, activeIndex]);

  if (!open || !modeKey || !ui) return null;

  const active = activeIndex >= 0 ? results[activeIndex] : undefined;
  // Футер (порт switchModeTab [22909] / modeInfo после генерации)
  const footerInfo = doneInfo
    ? doneInfo
    : active
      ? `${ui.desc} · ${active.paramValue} · ${new Date(active.createdAt).toLocaleString("ru-RU")}`
      : ui.desc || "—";

  const contentHtml = running
    ? liveHtml
    : runError
      ? `<div class="callout warning"><span class="callout-label">⚠ Ошибка</span>${escapeHtml(runError)}</div>`
      : (active?.htmlContent ?? "");

  return (
    <div
      className="mode-overlay visible"
      id="modeOverlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mode-modal">
        <div className="mode-modal-header">
          <div className="mode-modal-title" id="modeTitle">
            {ui.title}
          </div>
          <button type="button" className="mode-modal-close" onClick={onClose}>
            ✕ Закрыть
          </button>
        </div>

        <div className="mode-modal-params">
          <div className="form-group" id="modeParamsGroup">
            <div className="form-label">
              {ui.paramLabel}
            </div>
            <input
              ref={inputRef}
              id="modeParamInput"
              className="form-input"
              style={{ width: "100%" }}
              placeholder={ui.paramPlaceholder}
              value={param}
              onChange={(e) => setParam(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRun();
              }}
            />
          </div>
          <div
            id="modeSuggestions"
            style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}
          >
            {ui.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="edit-sec-btn"
                style={{ fontSize: 9, padding: "3px 8px" }}
                onClick={() => setParam(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div id="modeDepsWarnings" style={{ marginTop: 8 }}>
            {warnings.map((w, i) => (
              <div
                key={i}
                className={
                  w.level === "error" ? "sec-warning-item" : "sec-recommend-item"
                }
                style={{ marginBottom: 4 }}
              >
                <span className="warn-icon">{w.level === "error" ? "⚠" : "💡"}</span>
                <span>{w.text}</span>
              </div>
            ))}
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}
          >
            <button
              type="button"
              className="submit-btn"
              style={{ padding: "10px 24px" }}
              id="modeRunBtn"
              disabled={running}
              onClick={handleRun}
            >
              {running
                ? `Генерация... ${runChars > 0 ? `${runChars} симв.` : ""}`
                : "Генерировать"}
            </button>
            {running && (
              <button
                type="button"
                className="action-btn"
                id="modeAbortBtn"
                title="Остановить генерацию режима"
                style={{ marginLeft: 4 }}
                onClick={handleAbort}
              >
                ⏹ Остановить
              </button>
            )}
            <div
              id="modeCostEstimate"
              style={{
                fontFamily: "var(--mono)",
                fontSize: 9,
                color: "var(--ink-dim)",
                letterSpacing: "0.5px",
              }}
            >
              {estimate
                ? "≈ $" + estimate.cost.toFixed(4) + " (~" +
                  Math.round(estimate.inTokens / 1000) + "K вх. + ~" +
                  Math.round(estimate.outTokens / 1000) + "K вых.)"
                : ""}
            </div>
          </div>
        </div>

        <ModeTabBar
          tabs={results.map((r) => ({ param: r.paramValue, timestamp: r.createdAt }))}
          activeIndex={activeIndex}
          addingParam={running ? param.trim() : null}
          onSwitch={(i) => {
            setRunError(null);
            setDoneInfo(null);
            setActiveIndex(i);
          }}
          onRemove={handleRemove}
        />

        <div className="mode-modal-body" id="modeBody">
          <ModeContent html={contentHtml} />
        </div>

        <div className="mode-modal-footer">
          <div className="mode-modal-info" id="modeInfo">
            {footerInfo}
          </div>
          <button type="button" className="mode-modal-copy" onClick={handleCopy}>
            Скопировать
          </button>
        </div>
      </div>
    </div>
  );
}

/** Минимальное HTML-экранирование текста ошибки для callout */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
