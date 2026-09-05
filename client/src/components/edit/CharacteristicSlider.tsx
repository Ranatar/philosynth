/**
 * CharacteristicSlider — слайдер числовой характеристики элемента графа с
 * кнопкой «?» (обоснование через Claude). Беседа 5.4 (запрос 1, п. 1).
 * Функциональности нет в исходнике — новый React-код; оформление — блок 1
 * UI-кита фаз 5–6 (.char-slider / .char-slider-label / -value / -why /
 * -ticks / .char-justification), перенесённый в часть 3 globals.css.
 *
 * Источник истины по характеристикам — shared/constants/characteristics
 * (5.3): 8 у категорий (centrality … applicability 0–1, innovation_degree
 * 1–5 целое), 6 у связей. Слайдер параметризуется CharacteristicSpec:
 * min/max из спеки, step — 1 для целых (дискретный слайдер с засечками,
 * .discrete), 0.05 для REAL (шаг RangeField 5.2). Подпись — labelRu.
 *
 * Два режима записи:
 *  - onChange — по ходу движения (черновик формы CategoryEditor/EdgeEditor:
 *    PATCH шлёт «Сохранить» хозяина);
 *  - onCommit — по отпусканию ползунка (NodePanel: немедленный PATCH
 *    одного поля). Хозяин передаёт нужный из двух (или оба).
 *
 * «?» — обоснование характеристики (justifyCharacteristic, 03 §2.14):
 * АДАПТАЦИЯ против буквы запроса («popover/tooltip») — по правилу
 * UI-кита блок раскрывается ПОД слайдером (.char-justification): в
 * документе всплывашке негде разместиться, на узких экранах она ломается.
 * Первое раскрытие показывает последнее сохранённое обоснование этой
 * характеристики (GET /justifications), если оно есть; «Обосновать» /
 * «Заново» запускает новый запрос с ТЕКУЩИМ значением слайдера (в форме —
 * несохранённым: вопрос «почему centrality=0.9?» относится к оценке,
 * которую пользователь рассматривает, сервер проверяет только диапазон).
 * Результат: три колонки (основания / ограничения / альтернативы) —
 * парсинг сервера 5.3, стриминг — сырой текст с кареткой.
 *
 * readOnly (владелец при status='generating') — слайдер заблокирован
 * (.readonly; edge case протокола), «?» показывает только сохранённые
 * обоснования, новый запрос не запускается.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CHARACTERISTICS_BY_TYPE,
  type CharacteristicElementType,
  type CharacteristicSpec,
} from "@philosynth/shared/constants/characteristics";
import type { CharacteristicJustification } from "@philosynth/shared/types/elements";

import { messageOfEnrichmentError, type EnrichmentStream } from "../../hooks/useEnrichmentStream";

/** Шаг ползунка REAL-характеристик (как RangeField 5.2) */
export const REAL_STEP = 0.05;

export function characteristicStep(spec: CharacteristicSpec): number {
  return spec.integer ? 1 : REAL_STEP;
}

/** Значение как в таблицах: целое — как есть, REAL — два знака */
export function formatCharacteristic(spec: CharacteristicSpec, value: number): string {
  if (!Number.isFinite(value)) return "—";
  return spec.integer ? String(Math.round(value)) : value.toFixed(2);
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export interface CharacteristicJustifyContext {
  stream: EnrichmentStream;
  elementType: CharacteristicElementType;
  elementId: string;
}

export interface CharacteristicSliderProps {
  spec: CharacteristicSpec;
  value: number;
  /** По ходу движения ползунка (черновик формы) */
  onChange?: ((value: number) => void) | undefined;
  /** По отпусканию ползунка (немедленный PATCH) */
  onCommit?: ((value: number) => void) | undefined;
  /** Только чтение: чужой синтез, генерация — слайдер и «?» заблокированы */
  readOnly?: boolean | undefined;
  /** Временная блокировка (идёт сохранение) — без стиля .readonly */
  busy?: boolean | undefined;
  error?: string | undefined;
  /** Контекст обоснования; без него кнопки «?» нет */
  justify?: CharacteristicJustifyContext | undefined;
  id?: string | undefined;
}

export function CharacteristicSlider({
  spec,
  value,
  onChange,
  onCommit,
  readOnly = false,
  busy = false,
  error,
  justify,
  id,
}: CharacteristicSliderProps) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<CharacteristicJustification[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputId = id ?? `char-${spec.key}`;
  const step = characteristicStep(spec);
  const disabled = readOnly || busy;

  const stream = justify?.stream;
  const isStreamingThis =
    !!justify &&
    stream?.active?.kind === "justification" &&
    stream.active.elementId === justify.elementId &&
    stream.active.characteristic === spec.key;

  const latest = useMemo(
    () => history?.find((j) => j.characteristic === spec.key) ?? null,
    [history, spec.key],
  );

  const loadHistory = useCallback(async () => {
    if (!justify) return null;
    setLoading(true);
    setLocalError(null);
    try {
      const list = await justify.stream.loadJustifications(
        justify.elementId,
        justify.elementType,
      );
      setHistory(list);
      return list;
    } catch (err) {
      setLocalError(messageOfEnrichmentError(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, [justify]);

  const request = useCallback(async () => {
    if (!justify) return;
    setLocalError(null);
    await justify.stream.startJustification({
      elementId: justify.elementId,
      elementType: justify.elementType,
      characteristic: spec.key,
      value,
    });
  }, [justify, spec.key, value]);

  // Финал обоснования этой характеристики → перечитать историю
  useEffect(() => {
    if (!justify) return;
    return justify.stream.onDone((ev) => {
      if (
        ev.operation.kind === "justification" &&
        ev.operation.elementId === justify.elementId &&
        ev.operation.characteristic === spec.key
      ) {
        void loadHistory();
      }
    });
  }, [justify, spec.key, loadHistory]);

  // Смена элемента — история другого элемента
  const elementRef = useRef(justify?.elementId);
  useEffect(() => {
    if (elementRef.current !== justify?.elementId) {
      elementRef.current = justify?.elementId;
      setHistory(null);
      setOpen(false);
    }
  }, [justify?.elementId]);

  const toggle = useCallback(async () => {
    if (!justify) return;
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    const list = history ?? (await loadHistory());
    const has = list?.some((j) => j.characteristic === spec.key) ?? false;
    if (!has && !readOnly) void request();
  }, [justify, open, history, loadHistory, spec.key, readOnly, request]);

  const streamError =
    isStreamingThis || !justify ? null : justify.stream.error;
  const shownError = localError ?? error ?? null;

  return (
    <div
      className={
        "char-slider" +
        (spec.integer ? " discrete" : "") +
        (readOnly ? " readonly" : "")
      }
      data-characteristic={spec.key}
    >
      <label className="char-slider-label" htmlFor={inputId}>
        {capitalize(spec.labelRu)}
      </label>
      <span className="char-slider-value">{formatCharacteristic(spec, value)}</span>
      {justify ? (
        <button
          type="button"
          className={"char-slider-why" + (isStreamingThis || loading ? " loading" : "")}
          title={
            open
              ? "Скрыть обоснование"
              : readOnly
                ? "Показать сохранённые обоснования"
                : "Обоснование значения (запрос к Claude)"
          }
          aria-expanded={open}
          onClick={() => void toggle()}
        >
          ?
        </button>
      ) : (
        <span />
      )}
      <input
        id={inputId}
        type="range"
        min={spec.min}
        max={spec.max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={capitalize(spec.labelRu)}
        onChange={(e) => onChange?.(Number(e.target.value))}
        onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => {
          if (
            onCommit &&
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]
              .includes(e.key)
          )
            onCommit(Number((e.target as HTMLInputElement).value));
        }}
      />
      {spec.integer && (
        <div className="char-slider-ticks" aria-hidden="true">
          {Array.from({ length: spec.max - spec.min + 1 }, (_, i) => (
            <span key={i}>{spec.min + i}</span>
          ))}
        </div>
      )}
      {shownError && (
        <div className="pool-status err char-slider-error">{shownError}</div>
      )}
      {open && justify && (
        <JustificationBlock
          spec={spec}
          latest={latest}
          loading={loading}
          streaming={isStreamingThis}
          liveText={isStreamingThis ? justify.stream.liveText : ""}
          error={streamError}
          readOnly={readOnly}
          onRequest={() => void request()}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/* ── Блок обоснования под слайдером ─────────────────────────────────── */

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("ru-RU");
}

function JustificationBlock({
  spec,
  latest,
  loading,
  streaming,
  liveText,
  error,
  readOnly,
  onRequest,
  onClose,
}: {
  spec: CharacteristicSpec;
  latest: CharacteristicJustification | null;
  loading: boolean;
  streaming: boolean;
  liveText: string;
  error: string | null;
  readOnly: boolean;
  onRequest: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className={"char-justification" + (streaming ? " streaming" : "")}
      data-testid="char-justification"
    >
      <div className="char-justification-meta">
        обоснование · {spec.labelRu}
        {latest && !streaming
          ? ` = ${formatCharacteristic(spec, latest.value)} · ${fmtDate(latest.createdAt)} · $${latest.costUsd.toFixed(4)}`
          : streaming
            ? " · генерируется…"
            : loading
              ? " · загрузка…"
              : ""}
      </div>
      {streaming ? (
        <div className="char-justification-live">{liveText || "…"}</div>
      ) : latest ? (
        <>
          <div>{latest.justification}</div>
          {latest.limitations && (
            <div className="char-justification-part">
              <span className="char-justification-part-label">Ограничения</span>
              {latest.limitations}
            </div>
          )}
          {latest.alternativeApproaches && (
            <div className="char-justification-part">
              <span className="char-justification-part-label">Альтернативные подходы</span>
              {latest.alternativeApproaches}
            </div>
          )}
        </>
      ) : error ? null : loading ? null : (
        <div>Обоснований ещё нет.</div>
      )}
      {error && <div className="pool-status err">{error}</div>}
      <div className="actions-bar-btns char-justification-actions">
        {!readOnly && (
          <button
            type="button"
            className="action-btn"
            disabled={streaming || loading}
            onClick={onRequest}
          >
            {latest ? "Обосновать заново" : "Обосновать"}
          </button>
        )}
        <button type="button" className="action-btn" onClick={onClose}>
          Скрыть
        </button>
      </div>
    </div>
  );
}

/* ── Группа слайдеров по типу элемента ──────────────────────────────── */

export type CharacteristicValues = Record<string, number>;

export interface CharacteristicSliderGroupProps {
  elementType: CharacteristicElementType;
  /** Значения по dtoField (Category / CategoryEdge как Record) */
  values: CharacteristicValues;
  onChange?: ((dtoField: string, value: number) => void) | undefined;
  onCommit?: ((dtoField: string, value: number) => void) | undefined;
  readOnly?: boolean | undefined;
  busy?: boolean | undefined;
  errors?: Record<string, string> | undefined;
  justify?: CharacteristicJustifyContext | undefined;
  /** Показать только эти характеристики (по dtoField); по умолчанию все */
  only?: readonly string[] | undefined;
  idPrefix?: string | undefined;
}

/** Все характеристики типа элемента — по CHARACTERISTICS_BY_TYPE */
export function CharacteristicSliderGroup({
  elementType,
  values,
  onChange,
  onCommit,
  readOnly,
  busy,
  errors = {},
  justify,
  only,
  idPrefix = "char",
}: CharacteristicSliderGroupProps) {
  const specs = CHARACTERISTICS_BY_TYPE[elementType].filter(
    (s) => !only || only.includes(s.dtoField),
  );
  return (
    <div className="char-slider-group" data-element-type={elementType}>
      {specs.map((spec) => (
        <CharacteristicSlider
          key={spec.key}
          id={`${idPrefix}-${spec.key}`}
          spec={spec}
          value={values[spec.dtoField] ?? spec.min}
          onChange={onChange ? (v) => onChange(spec.dtoField, v) : undefined}
          onCommit={onCommit ? (v) => onCommit(spec.dtoField, v) : undefined}
          readOnly={readOnly}
          busy={busy}
          error={errors[spec.dtoField]}
          justify={justify}
        />
      ))}
    </div>
  );
}
