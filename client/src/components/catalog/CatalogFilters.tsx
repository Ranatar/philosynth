/**
 * Панель фильтров каталога. Беседа 18.2 (п. 2; 05 числил модуль с 1.6b,
 * требование C5 — 03 §1.2).
 *
 * Фильтры маршрута поиска 18.1 (03 §2.21), все сочетаются через «и»:
 *  - философы с подсказками по списку PHILOSOPHERS (datalist), режим «все /
 *    любой», область «прямые участники / вся родословная». Это прежний
 *    «Поиск по генеалогии» (LineageSearch, 3.2): область «вся родословная» +
 *    режим «все» отбирают то же, что `/lineage/search`. Отдельной кнопки и
 *    отдельной выдачи у него больше нет — решение пользователя 18.2;
 *  - эпоха философов (PHILOSOPHER_EPOCHS) — в той же области, что философы;
 *  - метод, уровень синтеза, язык генерации, мета-синтез да/нет;
 *  - потомки концепции X — на месте прежней плашки `?descendantsOf=` (3.2):
 *    задаётся ссылкой «Потомки этой концепции» со страницы концепции, здесь
 *    показан и снимается;
 *  - статус и дата создания — только в списке «Мои» (сервер принимает их
 *    везде; ограничение — дело интерфейса, пометка «От 18.1» в 07).
 *
 * Панель только сообщает правку состояния хозяину (CatalogPage): адресную
 * строку и запрос ведёт он. Значение datalist — МАШИННОЕ имя философа (оно
 * уходит в запрос к родословной), перевод — подписью и чипом (сторож 4ay).
 */
import { useState } from "react";
import { Link } from "react-router-dom";

import { DL, ML, SL } from "@philosynth/shared/constants/labels";
import { PHILOSOPHERS, PHILOSOPHER_EPOCHS } from "@philosynth/shared/constants/philosophers";
import {
  SEARCH_PHILOSOPHERS_MAX,
  type SearchPhilArea,
  type SearchPhilMode,
} from "@philosynth/shared/constants/search";
import { tData } from "@philosynth/shared/i18n/data";
import { LANG_CUSTOM_VALUE, LANG_OPTIONS } from "@philosynth/shared/i18n/locales";
import { tl } from "@philosynth/shared/i18n/t";

import { CATALOG_STATUSES, activeFilterCount, type CatalogSearchState } from "../../utils/catalog-search";
import { synthesisStatusLabel } from "./SynthesisCard";

export interface CatalogFiltersProps {
  state: CatalogSearchState;
  onChange: (patch: Partial<CatalogSearchState>) => void;
  onReset: () => void;
  /** Название концепции X фильтра потомков; null — не известно (ещё
   *  грузится либо концепция недоступна) */
  descendantsTitle: string | null;
}

const DATALIST_ID = "catalog-filter-philosophers";

export function CatalogFilters({ state, onChange, onReset, descendantsTitle }: CatalogFiltersProps) {
  const [philInput, setPhilInput] = useState("");
  const mine = state.scope === "mine";
  const philFull = state.philosophers.length >= SEARCH_PHILOSOPHERS_MAX;
  const active = activeFilterCount(state);

  const addPhilosopher = () => {
    const name = philInput.trim();
    if (!name || philFull) return;
    if (!state.philosophers.includes(name)) onChange({ philosophers: [...state.philosophers, name] });
    setPhilInput("");
  };
  const removePhilosopher = (name: string) =>
    onChange({ philosophers: state.philosophers.filter((n) => n !== name) });
  const toggleEpoch = (i: number) =>
    onChange({
      epochs: state.epochs.includes(i)
        ? state.epochs.filter((n) => n !== i)
        : [...state.epochs, i].sort((a, b) => a - b),
    });

  // язык вне списка формы (свой язык генерации) — отдельной строкой списка
  const langKnown = state.lang === null || LANG_OPTIONS.some(([v]) => v === state.lang);
  const areaInUse = state.philosophers.length > 0 || state.epochs.length > 0;
  const metaValue = state.meta === null ? "" : state.meta ? "true" : "false";

  return (
    <div className="catalog-filters" data-testid="catalog-filters">
      <div className="catalog-filters-grid">
        {/* ── философы ── */}
        <div className="catalog-filter wide" data-testid="filter-philosophers">
          <label className="form-label" htmlFor="catalog-filter-phil-input">
            {tl("catalog.catalogFilters.philosophers", "Философы")}
          </label>
          <div className="catalog-filter-row">
            <input
              id="catalog-filter-phil-input"
              list={DATALIST_ID}
              className="form-input"
              value={philInput}
              disabled={philFull}
              onChange={(e) => setPhilInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPhilosopher();
                }
              }}
              placeholder={tl("catalog.catalogFilters.philosopherPlaceholder", "Имя философа (напр. Кант)")}
              data-testid="filter-phil-input"
            />
            <datalist id={DATALIST_ID}>
              {PHILOSOPHERS.map((name) => (
                <option key={name} value={name} label={tData(name)} />
              ))}
            </datalist>
            <button
              type="button"
              className="action-btn"
              disabled={philFull || philInput.trim() === ""}
              onClick={addPhilosopher}
              data-testid="filter-phil-add"
            >
              {tl("catalog.catalogFilters.addPhilosopher", "+ Добавить")}
            </button>
          </div>
          {state.philosophers.length > 0 && (
            <div className="catalog-filter-chips" data-testid="filter-phil-chips">
              {state.philosophers.map((name) => (
                <span key={name} className="compat-chip chip-tension" data-philosopher={name}>
                  {tData(name)}
                  <button
                    type="button"
                    className="pool-card-btn remove"
                    onClick={() => removePhilosopher(name)}
                    aria-label={tl("catalog.catalogFilters.removePhilosopher", "Убрать: {name}", { name: tData(name) })}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="catalog-filter-row">
            <select
              className="form-select"
              value={state.philMode}
              disabled={state.philosophers.length < 2}
              onChange={(e) => onChange({ philMode: e.target.value as SearchPhilMode })}
              aria-label={tl("catalog.catalogFilters.philModeAria", "Как сочетать философов")}
              data-testid="filter-phil-mode"
            >
              <option value="all">{tl("catalog.catalogFilters.philModeAll", "все названные")}</option>
              <option value="any">{tl("catalog.catalogFilters.philModeAny", "любой из названных")}</option>
            </select>
            <select
              className="form-select"
              value={state.philArea}
              disabled={!areaInUse}
              onChange={(e) => onChange({ philArea: e.target.value as SearchPhilArea })}
              aria-label={tl("catalog.catalogFilters.philAreaAria", "Где искать философов")}
              data-testid="filter-phil-area"
            >
              <option value="direct">{tl("catalog.catalogFilters.philAreaDirect", "прямые участники синтеза")}</option>
              <option value="lineage">
                {tl("catalog.catalogFilters.philAreaLineage", "вся родословная (через мета-синтез)")}
              </option>
            </select>
          </div>
        </div>

        {/* ── эпохи ── */}
        <div className="catalog-filter wide" data-testid="filter-epochs">
          <div className="form-label">{tl("catalog.catalogFilters.epochs", "Эпоха философов")}</div>
          <div className="catalog-filter-epochs">
            {PHILOSOPHER_EPOCHS.map((epoch, i) => {
              const checked = state.epochs.includes(i);
              const cls = checked ? "checkbox-item _checked" : "checkbox-item";
              return (
                <label key={epoch.label} className={cls} data-epoch={i}>
                  <input type="checkbox" checked={checked} onChange={() => toggleEpoch(i)} />
                  {tData(epoch.label)}
                </label>
              );
            })}
          </div>
        </div>

        {/* ── метод, уровень, язык, мета ── */}
        <div className="catalog-filter">
          <label className="form-label" htmlFor="catalog-filter-method">
            {tl("catalog.catalogFilters.method", "Метод")}
          </label>
          <select
            id="catalog-filter-method"
            className="form-select"
            value={state.method ?? ""}
            onChange={(e) => onChange({ method: e.target.value || null })}
            data-testid="filter-method"
          >
            <option value="">{tl("catalog.catalogFilters.any", "любой")}</option>
            {Object.entries(ML).map(([k, label]) => (
              <option key={k} value={k}>
                {tData(label)}
              </option>
            ))}
          </select>
        </div>
        <div className="catalog-filter">
          <label className="form-label" htmlFor="catalog-filter-depth">
            {tl("catalog.catalogFilters.depth", "Глубина")}
          </label>
          <select
            id="catalog-filter-depth"
            className="form-select"
            value={state.depth ?? ""}
            onChange={(e) => onChange({ depth: e.target.value || null })}
            data-testid="filter-depth"
          >
            <option value="">{tl("catalog.catalogFilters.any", "любой")}</option>
            {Object.entries(DL).map(([k, label]) => (
              <option key={k} value={k}>
                {tData(label)}
              </option>
            ))}
          </select>
        </div>
        <div className="catalog-filter">
          <label className="form-label" htmlFor="catalog-filter-level">
            {tl("catalog.catalogFilters.synthLevel", "Уровень синтеза")}
          </label>
          <select
            id="catalog-filter-level"
            className="form-select"
            value={state.synthLevel ?? ""}
            onChange={(e) => onChange({ synthLevel: e.target.value || null })}
            data-testid="filter-level"
          >
            <option value="">{tl("catalog.catalogFilters.any", "любой")}</option>
            {Object.entries(SL).map(([k, label]) => (
              <option key={k} value={k}>
                {tData(label)}
              </option>
            ))}
          </select>
        </div>
        <div className="catalog-filter">
          <label className="form-label" htmlFor="catalog-filter-lang">
            {tl("catalog.catalogFilters.lang", "Язык генерации")}
          </label>
          <select
            id="catalog-filter-lang"
            className="form-select"
            value={state.lang ?? ""}
            onChange={(e) => onChange({ lang: e.target.value || null })}
            data-testid="filter-lang"
          >
            <option value="">{tl("catalog.catalogFilters.any", "любой")}</option>
            {LANG_OPTIONS.filter(([v]) => v !== LANG_CUSTOM_VALUE).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
            {!langKnown && state.lang && <option value={state.lang}>{state.lang}</option>}
          </select>
        </div>
        <div className="catalog-filter">
          <label className="form-label" htmlFor="catalog-filter-meta">
            {tl("catalog.catalogFilters.meta", "Мета-синтез")}
          </label>
          <select
            id="catalog-filter-meta"
            className="form-select"
            value={metaValue}
            onChange={(e) => onChange({ meta: e.target.value === "" ? null : e.target.value === "true" })}
            data-testid="filter-meta"
          >
            <option value="">{tl("catalog.catalogFilters.metaAny", "не важно")}</option>
            <option value="true">{tl("catalog.catalogFilters.metaYes", "только мета-синтезы")}</option>
            <option value="false">{tl("catalog.catalogFilters.metaNo", "без мета-синтезов")}</option>
          </select>
        </div>

        {/* ── статус и дата — только «Мои» ── */}
        {mine && (
          <div className="catalog-filter">
            <label className="form-label" htmlFor="catalog-filter-status">
              {tl("catalog.catalogFilters.status", "Статус")}
            </label>
            <select
              id="catalog-filter-status"
              className="form-select"
              value={state.status ?? ""}
              onChange={(e) => onChange({ status: e.target.value || null })}
              data-testid="filter-status"
            >
              <option value="">{tl("catalog.catalogFilters.any", "любой")}</option>
              {CATALOG_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {synthesisStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>
        )}
        {mine && (
          <div className="catalog-filter" data-testid="filter-dates">
            <div className="form-label">{tl("catalog.catalogFilters.created", "Создана: с — по")}</div>
            <div className="catalog-filter-row">
              <input
                type="date"
                className="form-input"
                value={state.dateFrom ?? ""}
                max={state.dateTo ?? undefined}
                onChange={(e) => onChange({ dateFrom: e.target.value || null })}
                aria-label={tl("catalog.catalogFilters.dateFromAria", "Создана не раньше")}
                data-testid="filter-date-from"
              />
              <input
                type="date"
                className="form-input"
                value={state.dateTo ?? ""}
                min={state.dateFrom ?? undefined}
                onChange={(e) => onChange({ dateTo: e.target.value || null })}
                aria-label={tl("catalog.catalogFilters.dateToAria", "Создана не позже")}
                data-testid="filter-date-to"
              />
            </div>
          </div>
        )}

        {/* ── потомки концепции X ── */}
        <div className="catalog-filter wide" data-testid="filter-descendants">
          <div className="form-label">{tl("catalog.catalogFilters.descendants", "Потомки концепции")}</div>
          {state.descendantsOf ? (
            <div className="catalog-filter-chips">
              <span className="compat-chip chip-synergy" data-testid="filter-descendants-chip">
                <Link to={`/synthesis/${state.descendantsOf}`}>
                  {descendantsTitle ?? tl("catalog.catalogFilters.descendantsUnknown", "концепция")}
                </Link>
                <button
                  type="button"
                  className="pool-card-btn remove"
                  onClick={() => onChange({ descendantsOf: null })}
                  aria-label={tl("catalog.catalogFilters.removeDescendants", "Снять фильтр потомков")}
                  data-testid="filter-descendants-remove"
                >
                  ✕
                </button>
              </span>
            </div>
          ) : (
            <div className="catalog-filter-note">
              {tl(
                "catalog.catalogFilters.descendantsHint",
                "Не задано. Фильтр ставит ссылка «Потомки этой концепции в каталоге» на странице концепции.",
              )}
            </div>
          )}
        </div>
      </div>

      <div className="catalog-filters-foot">
        <span className="catalog-filter-note" data-testid="filters-active-count">
          {active > 0
            ? tl(
                "catalog.catalogFilters.activeCount",
                "{n, plural, one {задан # фильтр} few {задано # фильтра} many {задано # фильтров} other {задано # фильтра}}",
                { n: active },
              )
            : tl("catalog.catalogFilters.noneActive", "фильтры не заданы")}
        </span>
        <button
          type="button"
          className="action-btn"
          disabled={active === 0}
          onClick={onReset}
          data-testid="filters-reset"
        >
          {tl("catalog.catalogFilters.reset", "✕ Сбросить фильтры")}
        </button>
      </div>
    </div>
  );
}
