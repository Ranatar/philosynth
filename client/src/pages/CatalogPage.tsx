/**
 * Каталог концепций. Беседа 1.6b (запрос 1, п. 4; заглушка 0.4 заменена).
 *
 * - Вкладки: «Мои» (GET /syntheses) / «Публичные» (GET /syntheses/public) —
 *   транспорт 1.6.
 * - Поиск СЕРВЕРНЫЙ: параметр ?search= (ILIKE по title, gin_trgm);
 *   клиент ничего не фильтрует сам — только дебаунс ввода 400 мс
 *   (по образцу дебаунса совета в SynthesisForm, 1.5).
 * - Публичность (8.7, п. 5; прежде — переключатель PATCH { isPublic }
 *   1.6b): VisibilityControl в карточке — только на вкладке «Мои»; сырые
 *   флаги для него берутся GET /syntheses/:id (превью их не несёт), ОДИН
 *   PATCH { visibility, showAuthor, showLogs, showPrompts, allowMeta },
 *   после — тихая перечитка списка (грабля 6.2: статус после перечитки).
 * - Пагинация: limit 20 (default сервера), кнопки ← / → по total.
 *
 * CatalogFilters (метод/уровень/философы) — C5, Фаза 2.
 *
 * Беседа 3.2 (п. 5 + п. 3):
 *  - фильтр «Потомки концепции X» — параметр URL ?descendantsOf=<id>
 *    (вход — ссылка из секции генеалогии SynthesisPage): потомки берутся
 *    ОТДЕЛЬНЫМ запросом GET /lineage/descendants, каталог отображает
 *    ПЕРЕСЕЧЕНИЕ текущего списка с множеством потомков (решение аудита
 *    2026-07-30: параметра у GET /syntheses нет и не нужно). Чужие
 *    приватные поддеревья уже отсечены сервером (pruneInvisible);
 *  - бейдж «мета-синтез» в карточке — SynthesisPreview.hasConceptParents
 *    (аддитивное поле транспорта, беседа 3.2);
 *  - блок «Поиск по генеалогии» (LineageSearch) — сворачиваемый, под
 *    строкой поиска.
 *
 * Беседа 8.4 (п. 2–5): действия владельца в карточке — только на
 * вкладке «Мои» (как переключатель публикации):
 *  - переименование → renameSynthesis (PATCH title); 400 → details.title
 *    строкой под полем карточки, прочие ошибки — сообщением;
 *  - дублирование → duplicateSynthesis → список ПЕРЕЧИТЫВАЕТСЯ, копия
 *    встаёт по своему createdAt; автоперехода на копию нет (решение
 *    протокола: пользователь остаётся в каталоге и выбирает сам);
 *  - удаление → deleteSynthesis после второго шага в карточке; число
 *    прямых потомков для подтверждения — GET /lineage/descendants?depth=1
 *    (только они теряют parent_synthesis_id — SET NULL, 02 §2.4; чужие
 *    приватные потомки сервером отсечены — число «видимых»); 409
 *    GENERATION_IN_PROGRESS — строкой в карточке, карточка остаётся;
 *    после успеха список перечитывается (грабля 6.2: статус — после
 *    перечитки, не до).
 *
 * Беседа 16.2 (п. 3): вкладка «Со мной поделились» — GET /syntheses/shared
 * (концепции, где я участник или приглашён), бейдж роли/статуса в карточке
 * (проп badgeOf списка); карточка приглашённого ведёт на концепцию — доступ
 * решает сервер (приглашённый ещё читатель), принять — со страницы
 * приглашения (ссылка из письма или колокольчика).
 *
 * Беседа 8.7 (п. 3): проп publicOnly — режим «/explore»: только публичный
 * каталог (GET /syntheses/public — гостевой путь 8.6), без вкладки «Мои»,
 * кнопки «Новый синтез» и поиска по генеалогии (/lineage/search под
 * requireAuth). Гостю доступен без входа; зарегистрированному — тот же
 * список, что вкладка «Публичные».
 *
 * Беседа 18.2 — поиск в каталоге (сервер — 18.1, 03 §2.21). Всё, что выше
 * сказано о транспорте списков, ЗАМЕНЕНО: три вкладки ходят в ОДИН маршрут
 * `GET /syntheses/search` (список = вкладка), прежние `GET /syntheses`,
 * `/public`, `/shared` каталогу больше не нужны (их зовут пул, биллинг и
 * стартовая страница).
 *  - Строка поиска с выбором поля (название / зерно / содержание / термин)
 *    — на всех трёх вкладках и на «/explore»; дебаунс ввода прежний, 400 мс.
 *  - СОСТОЯНИЕ ПОИСКА — В АДРЕСНОЙ СТРОКЕ (ссылкой можно поделиться):
 *    вкладка, текст, поле, фильтры, страница. Читает и пишет его один
 *    модуль `utils/catalog-search` — тем же сериализатором, что строит
 *    запрос; имена параметров адреса ≡ параметрам маршрута (сторож 4bs).
 *    Локального состояния у поиска нет, кроме набираемого текста до
 *    дебаунса и раскрытости панели.
 *  - Панель фильтров (CatalogFilters): философы (все / любой; прямые /
 *    родословная), эпоха, метод, уровень, язык, мета, потомки концепции,
 *    статус и дата — только на «Мои»; сброс. Прежние отдельная кнопка
 *    «Генеалогия» с блоком LineageSearch (3.2) и плашка `?descendantsOf=`
 *    с клиентским пересечением СНЯТЫ: родословная — фильтр панели (область
 *    «вся родословная»), потомков отбирает сервер. Ссылка
 *    `/catalog?descendantsOf=<id>` со страницы концепции работает как
 *    прежде — параметр тот же.
 *  - Выдача: карточка + фрагмент с подсветкой (куски текста, не разметка);
 *    у найденного термина карточка ведёт прямо к термину в документе.
 *    Находки запасного хода (`match: 'fuzzy'`, опечатка) названы «похожими».
 *    Пустая выдача при заданных условиях — сообщение с подсказками, чем
 *    ослабить поиск, и кнопкой сброса.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { SearchField, SearchMatchKind, SearchScope } from "@philosynth/shared/constants/search";
import type { SynthesisSearchItem } from "@philosynth/shared/types/search";
import type { SynthesisPreview } from "@philosynth/shared/types/synthesis";
import type { SharedSynthesisPreview } from "@philosynth/shared/types/notifications";

import { ApiError } from "../api/client";
import { getDescendants } from "../api/lineage";
import { searchSyntheses } from "../api/search"; // 18.2
import {
  deleteSynthesis,
  duplicateSynthesis,
  getSynthesis,
  renameSynthesis,
  updateSynthesis,
} from "../api/syntheses";
import { CatalogFilters } from "../components/catalog/CatalogFilters"; // 18.2
import { CatalogSearchBar } from "../components/catalog/CatalogSearchBar"; // 18.2
import type {
  SynthesisCardActions,
  SynthesisCardVisibility,
} from "../components/catalog/SynthesisCard";
import { SynthesisList } from "../components/catalog/SynthesisList";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";
import { memberStatusLabel, roleLabel } from "../components/synthesis/MembersPanel"; // 16.2
import { useAuthStore } from "../stores/auth-store";
import {
  CATALOG_PAGE_LIMIT,
  activeFilterCount,
  catalogSearchString,
  hasSearchCriteria,
  parseCatalogSearch,
  relaxHints,
  resetFilters,
  searchQueryString,
  withScope,
  type CatalogSearchContext,
  type CatalogSearchState,
  type RelaxHint,
} from "../utils/catalog-search"; // 18.2
import { tl } from "@philosynth/shared/i18n/t";

const PAGE_LIMIT = CATALOG_PAGE_LIMIT;
const SEARCH_DEBOUNCE_MS = 400;

type CatalogTab = SearchScope;

/** 16.2: роль/статус участия по карточке вкладки «Со мной поделились» */
function sharedBadge(s: SynthesisPreview): React.ReactNode {
  const sh = s as SharedSynthesisPreview;
  if (!sh.myRole) return null;
  return (
    <span className={sh.myStatus === "active" ? "cert-badge gold" : "cert-badge"} data-testid="card-my-role">
      {sh.myStatus === "active" ? roleLabel(sh.myRole) : `${memberStatusLabel("invited")} · ${roleLabel(sh.myRole)}`}
    </span>
  );
}

/** Текст ошибки действия карточки (8.4): 400 с details[field] → сама
 *  подсказка сервера; 409 GENERATION_IN_PROGRESS и 403 — по коду;
 *  прочее — сообщение ApiError либо запасной текст. */
export function actionErrorText(
  err: unknown,
  field: string | null,
  fallback: string,
): string {
  if (!(err instanceof ApiError)) return fallback;
  if (err.code === "VALIDATION_ERROR" && field) {
    const d = err.details as Record<string, unknown> | undefined;
    const v = d && typeof d === "object" ? d[field] : undefined;
    if (typeof v === "string") return tl("catalogPage.titleValue", "Название: {title}", { title: v });
  }
  if (err.code === "GENERATION_IN_PROGRESS")
    return tl("catalogPage.generationRunning", "Генерация ещё идёт — дождитесь завершения или остановите её.");
  if (err.code === "FORBIDDEN") return tl("catalogPage.ownerOnlyAction", "Действие доступно только владельцу.");
  return err.message || fallback;
}

/** Текст ошибки сохранения публичности (8.7): details.visibility у 400,
 *  403 — только владелец, прочее — сообщение сервера */
export function visibilityErrorText(err: unknown): string {
  if (!(err instanceof ApiError)) return tl("catalogPage.visibilityChangeFailed", "Не удалось изменить публичность.");
  if (err.code === "VALIDATION_ERROR") {
    const d = err.details as Record<string, unknown> | undefined;
    const v = d && typeof d === "object" ? d.visibility : undefined;
    if (typeof v === "string") return tl("catalogPage.visibilityValue", "Публичность: {visibility}", { visibility: v });
  }
  if (err.code === "FORBIDDEN") return tl("catalogPage.visibilityOwnerOnly", "Публичность меняет только владелец.");
  return err.message || tl("catalogPage.visibilityChangeFailed", "Не удалось изменить публичность.");
}

/** Текст ошибки поиска (18.2). Концепция X фильтра потомков обязана быть
 *  читаема смотрящим: 404 — её нет, 403 — она закрыта (03 §2.21). */
export function searchErrorText(err: unknown, state: CatalogSearchState): string {
  if (!(err instanceof ApiError)) return tl("catalogPage.catalogLoadFailed", "Не удалось загрузить каталог.");
  if (state.descendantsOf && err.code === "NOT_FOUND")
    return tl("catalogPage.descendantsNotFound", "Концепция, потомков которой вы ищете, не найдена — снимите фильтр потомков.");
  if (state.descendantsOf && err.code === "FORBIDDEN")
    return tl("catalogPage.descendantsForbidden", "Концепция, потомков которой вы ищете, вам недоступна — снимите фильтр потомков.");
  return err.message || tl("catalogPage.catalogLoadFailed", "Не удалось загрузить каталог.");
}

/** Подсказка, чем ослабить поиск (18.2, п. 3) */
export function relaxHintText(hint: RelaxHint): string {
  switch (hint) {
    case "philAny":
      return tl("catalogPage.relaxPhilAny", "искать любого из названных философов, а не всех сразу");
    case "philLineage":
      return tl("catalogPage.relaxPhilLineage", "искать философов и эпохи во всей родословной, а не только среди прямых участников");
    case "fieldContent":
      return tl("catalogPage.relaxFieldContent", "искать текст в содержании (капсула, категории, термины), а не только в названии или зерне");
    case "termExact":
      return tl("catalogPage.relaxTermExact", "поле «термин» ищет термин целиком — попробуйте поле «содержание»: оно находит словоформы и определения");
    case "dates":
      return tl("catalogPage.relaxDates", "расширить промежуток дат");
    case "fewerFilters":
      return tl("catalogPage.relaxFewerFilters", "снять часть фильтров — они сочетаются через «и»");
    case "otherScope":
      return tl("catalogPage.relaxOtherScope", "посмотреть на другой вкладке каталога");
  }
}

export interface CatalogPageProps {
  /** Беседа 8.7: режим «/explore» — только публичный каталог, без «Мои» */
  publicOnly?: boolean | undefined;
}

export function CatalogPage({ publicOnly = false }: CatalogPageProps) {
  const authenticated = useAuthStore((s) => s.status === "authenticated");

  // 18.2: состояние поиска — адресная строка (вкладка, текст, поле, фильтры,
  // страница); читает и пишет его один модуль utils/catalog-search
  const [searchParams, setSearchParams] = useSearchParams();
  const searchCtx = useMemo<CatalogSearchContext>(
    () => ({ defaultScope: publicOnly ? "public" : "mine", lockScope: publicOnly }),
    [publicOnly],
  );
  const state = useMemo(() => parseCatalogSearch(searchParams, searchCtx), [searchParams, searchCtx]);
  // stateRef — состояние, от которого считается СЛЕДУЮЩЕЕ действие. Роутер
  // применяет новый адрес переходом (startTransition): между записью адреса
  // и отрисовкой проходит время, и второе быстрое действие (философ, сразу
  // за ним область) взяло бы прежнее состояние и стёрло первое. Поэтому
  // запись адреса сразу кладёт записанное сюда (applyState), а отрисовка
  // перекладывает разобранное из адреса только при его действительной смене.
  const stateRef = useRef(state);
  const seenParams = useRef(searchParams);
  if (seenParams.current !== searchParams) {
    seenParams.current = searchParams;
    stateRef.current = state;
  }
  const tab: CatalogTab = state.scope;
  const page = state.page;
  const search = state.q;

  /** Записать состояние в адресную строку. replace — правка того же
   *  поиска (набор текста); без него — новый шаг истории (вкладка, фильтр,
   *  страница): «назад» возвращает прежний поиск. */
  const applyState = useCallback(
    (next: CatalogSearchState, opts: { replace?: boolean } = {}) => {
      stateRef.current = next;
      setSearchParams(new URLSearchParams(catalogSearchString(next, searchCtx)), { replace: opts.replace === true });
    },
    [setSearchParams, searchCtx],
  );
  const patchState = useCallback(
    (patch: Partial<CatalogSearchState>) => applyState({ ...stateRef.current, ...patch, page: 1 }),
    [applyState],
  );

  // Набираемый текст: до дебаунса живёт здесь, после — в адресе (q)
  const [searchInput, setSearchInput] = useState(state.q);
  // адрес сменился извне («назад», ссылка, сброс) — строка ввода следует за ним
  useEffect(() => {
    setSearchInput((cur) => (cur.trim() === search ? cur : search));
  }, [search]);
  // Дебаунс поиска: ввод → 400 мс тишины → параметр q адреса
  useEffect(() => {
    const t = setTimeout(() => {
      const q = searchInput.trim();
      if (q !== stateRef.current.q) applyState({ ...stateRef.current, q, page: 1 }, { replace: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput, applyState]);

  const [items, setItems] = useState<SynthesisSearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [match, setMatch] = useState<SearchMatchKind | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Какому запросу принадлежит показанная выдача: между сменой адреса и
  // стартом запроса (эффект — после отрисовки) прежние карточки не должны
  // мелькнуть под новыми условиями и счётом «Найдено N»
  const [resultKey, setResultKey] = useState<string | null>(null);

  // Панель фильтров: раскрыта, если ссылка уже несёт фильтры
  const [filtersOpen, setFiltersOpen] = useState(() => activeFilterCount(state) > 0);
  const filterCount = activeFilterCount(state);

  // Название концепции X фильтра потомков — для строки панели
  const descendantsOf = state.descendantsOf;
  const [descendantsTitle, setDescendantsTitle] = useState<string | null>(null);
  useEffect(() => {
    setDescendantsTitle(null);
    if (!descendantsOf) return;
    let cancelled = false;
    getSynthesis(descendantsOf)
      .then((full) => {
        if (!cancelled) setDescendantsTitle(full.title);
      })
      .catch(() => {
        /* недоступна — причину назовёт сам поиск (searchErrorText) */
      });
    return () => {
      cancelled = true;
    };
  }, [descendantsOf]);

  // Запрос — по строке запроса состояния: одинаковое состояние не
  // перезапрашивается, как бы ни пересобирался объект
  const queryKey = searchQueryString(state);
  // запрос идёт по ОТРИСОВАННОМУ состоянию (stateRef может уже нести следующее)
  const shownState = useRef(state);
  shownState.current = state;
  const reqSeq = useRef(0);
  // silent (8.4): перечитка после действия карточки — без спиннера, чтобы
  // список не «мигал» и соседние карточки не размонтировались
  const fetchList = useCallback(async (opts: { silent?: boolean } = {}) => {
    const seq = ++reqSeq.current;
    const st = shownState.current;
    if (!opts.silent) setLoading(true);
    setError(null);
    try {
      const result = await searchSyntheses(st);
      if (seq !== reqSeq.current) return;
      setItems(result.items);
      setTotal(result.total);
      setMatch(result.match);
      setResultKey(searchQueryString(st));
    } catch (err) {
      if (seq !== reqSeq.current) return;
      setItems([]);
      setTotal(0);
      setMatch(null);
      setError(searchErrorText(err, st));
      setResultKey(searchQueryString(st));
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);
  const pending = loading || resultKey !== queryKey;

  // Беседа 8.7 (п. 5): управление публичностью — ОДИН PATCH со ступенью и
  // флагами (updateSynthesis), затем тихая перечитка списка; сырые флаги
  // для черновика — GET /syntheses/:id (владельцу отдаются все поля)
  const cardVisibility = useMemo<SynthesisCardVisibility>(
    () => ({
      loadFlags: async (id) => {
        const full = await getSynthesis(id);
        return {
          visibility: full.visibility,
          showAuthor: full.showAuthor,
          showLogs: full.showLogs,
          showPrompts: full.showPrompts,
          allowMeta: full.allowMeta,
        };
      },
      onSave: async (id, flags) => {
        try {
          await updateSynthesis(id, {
            visibility: flags.visibility,
            showAuthor: flags.showAuthor,
            showLogs: flags.showLogs,
            showPrompts: flags.showPrompts,
            allowMeta: flags.allowMeta,
          });
          await fetchList({ silent: true });
          return null;
        } catch (err) {
          return visibilityErrorText(err);
        }
      },
    }),
    [fetchList],
  );

  // Беседа 8.4: действия владельца. Каждый обработчик отдаёт текст
  // ошибки либо null — карточка показывает его сама, без alert.
  const cardActions = useMemo<SynthesisCardActions>(
    () => ({
      onRename: async (s, title) => {
        try {
          const updated = await renameSynthesis(s.id, title);
          setItems((prev) =>
            prev.map((it) =>
              it.id === s.id ? { ...it, title: updated.title } : it,
            ),
          );
          return null;
        } catch (err) {
          return actionErrorText(err, "title", tl("catalogPage.renameFailed", "Не удалось переименовать."));
        }
      },
      onDuplicate: async (s) => {
        try {
          await duplicateSynthesis(s.id);
          await fetchList({ silent: true });
          return null;
        } catch (err) {
          return actionErrorText(err, null, tl("catalogPage.copyFailed", "Не удалось создать копию."));
        }
      },
      onDelete: async (s) => {
        try {
          await deleteSynthesis(s.id);
          await fetchList({ silent: true });
          return null;
        } catch (err) {
          return actionErrorText(err, null, tl("catalogPage.deleteFailed", "Не удалось удалить концепцию."));
        }
      },
      countDescendants: async (s) => {
        try {
          const children = await getDescendants(s.id, 1);
          return children.filter((n) => n.type === "synthesis").length;
        } catch {
          return null;
        }
      },
    }),
    [fetchList],
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const criteria = hasSearchCriteria(state);
  const fuzzy = match === "fuzzy";
  const hints = useMemo(() => relaxHints(state, searchCtx), [state, searchCtx]);

  const tabBtn = (key: CatalogTab, label: string) => (
    <button
      type="button"
      className="action-btn"
      data-testid={`catalog-tab-${key}`}
      style={
        tab === key
          ? {
              background: "var(--blue-corp)",
              color: "#fff",
              borderColor: "var(--blue-corp)",
            }
          : undefined
      }
      onClick={() => applyState(withScope(stateRef.current, key))}
    >
      {label}
    </button>
  );

  const emptyDefault =
    tab === "mine"
      ? tl("catalogPage.noSynthesesYet", "У вас пока нет синтезов — начните с «Новый синтез».")
      : tab === "shared"
        ? tl("catalogPage.noShared", "С вами пока никто не делился концепциями — участие возникает по приглашению владельца.")
        : tl("catalogPage.noPublicSyntheses", "Публичных синтезов пока нет.");

  return (
    <div>
      <div className="actions-bar">
        <h1 className="form-section-title" style={{ margin: 0, border: "none" }}>
          {publicOnly ? tl("catalogPage.publicConcepts", "Публичные концепции") : tl("catalogPage.conceptCatalog", "Каталог концепций")}
        </h1>
        {publicOnly ? (
          authenticated ? (
            <Link to="/catalog" className="action-btn">
              {tl("catalogPage.myCatalog", "Мой каталог")}
            </Link>
          ) : (
            <Link to="/register" className="action-btn primary" data-testid="explore-register">
              {tl("common.createAccount", "Создать аккаунт")}
            </Link>
          )
        ) : (
          <Link to="/synthesis/new" className="action-btn primary">
            {tl("catalogPage.newSynthesis", "Новый синтез")}
          </Link>
        )}
      </div>

      <div className="actions-bar" data-testid="catalog-tabs">
        <div className="actions-bar-btns">
          {!publicOnly && tabBtn("mine", tl("catalogPage.tabMine", "Мои"))}
          {!publicOnly && tabBtn("public", tl("catalogPage.tabPublic", "Публичные"))}
          {!publicOnly && tabBtn("shared", tl("catalogPage.tabShared", "Со мной поделились"))}
        </div>
        <div className="actions-bar-btns">
          {/* 18.2: строка поиска с выбором поля — на всех вкладках и гостю */}
          <CatalogSearchBar
            value={searchInput}
            field={state.field}
            onValue={setSearchInput}
            onField={(field: SearchField) => patchState({ field })}
          />
          <button
            type="button"
            className="action-btn"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
            data-testid="catalog-filters-toggle"
          >
            {tl("catalogPage.filtersToggle", "{arrow} Фильтры{count}", {
              arrow: filtersOpen ? "▾" : "▸",
              count: filterCount > 0 ? ` · ${filterCount}` : "",
            })}
          </button>
        </div>
      </div>

      {/* 18.2 (п. 2): панель фильтров; родословная и потомки — её фильтры */}
      {filtersOpen && (
        <CatalogFilters
          state={state}
          onChange={patchState}
          onReset={() => applyState(resetFilters(stateRef.current))}
          descendantsTitle={descendantsTitle}
        />
      )}

      <div data-testid="catalog-results" data-query={pending ? "" : queryKey}>
        {pending ? (
          <LoadingSpinner label={tl("catalogPage.loadingCatalog", "загрузка каталога…")} />
        ) : error ? (
          <div className="callout warning" data-testid="catalog-error">
            <span className="callout-label">{tl("common.error", "Ошибка")}</span>
            {error}{" "}
            {descendantsOf && (
              <button
                type="button"
                className="action-btn"
                onClick={() => patchState({ descendantsOf: null })}
                data-testid="catalog-error-reset-descendants"
              >
                {tl("catalogPage.resetDescendants", "✕ Снять фильтр потомков")}
              </button>
            )}
          </div>
        ) : items.length === 0 && criteria ? (
          /* 18.2 (п. 3): пустая выдача — чем ослабить поиск */
          <div className="catalog-empty" data-testid="catalog-empty-search">
            <p className="catalog-empty-title">{tl("catalogPage.nothingFound", "Ничего не найдено по запросу.")}</p>
            {hints.length > 0 && (
              <>
                <p className="catalog-empty-lead">{tl("catalogPage.relaxLead", "Попробуйте ослабить условия:")}</p>
                <ul className="catalog-empty-hints">
                  {hints.map((h) => (
                    <li key={h} data-hint={h}>
                      {relaxHintText(h)}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="catalog-empty-actions">
              {filterCount > 0 && (
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => applyState(resetFilters(stateRef.current))}
                  data-testid="catalog-empty-reset"
                >
                  {tl("catalogPage.resetFilters", "✕ Сбросить фильтры")}
                </button>
              )}
              {search && (
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => {
                    setSearchInput("");
                    patchState({ q: "" });
                  }}
                  data-testid="catalog-empty-clear-text"
                >
                  {tl("catalogPage.clearText", "✕ Очистить текст поиска")}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {criteria && (
              <div className="catalog-found" data-testid="catalog-found" data-match={match ?? ""} data-total={total}>
                {tl("catalogPage.foundTotal", "{n, plural, one {Найдена # концепция} few {Найдено # концепции} many {Найдено # концепций} other {Найдено # концепции}}", { n: total })}
              </div>
            )}
            {fuzzy && (
              <div className="callout note catalog-fuzzy" data-testid="catalog-fuzzy">
                <span className="callout-label">{tl("catalogPage.fuzzyLabel", "Похожие")}</span>
                {tl("catalogPage.fuzzyNote", "Точных совпадений нет — показаны концепции с похожими словами (возможна опечатка в запросе).")}
              </div>
            )}
            <SynthesisList
              items={items}
              emptyText={emptyDefault}
              visibility={tab === "mine" ? cardVisibility : undefined}
              actions={tab === "mine" ? cardActions : undefined}
              badgeOf={tab === "shared" ? sharedBadge : undefined}
              fuzzy={fuzzy}
            />
          </>
        )}
      </div>

      {!pending && !error && total > PAGE_LIMIT && (
        <div className="actions-bar" style={{ justifyContent: "center", gap: 16 }}>
          <button
            type="button"
            className="action-btn"
            disabled={page <= 1}
            onClick={() => applyState({ ...stateRef.current, page: Math.max(1, page - 1) })}
            data-testid="catalog-page-prev"
          >
            {tl("catalogPage.back", "← Назад")}
          </button>
          <span className="pool-summary" style={{ margin: 0, border: "none", padding: 0 }}>
            {tl("catalogPage.pageOfTotal", "стр. {page} / {totalPages} · всего {total}", { page, totalPages, total })}
          </span>
          <button
            type="button"
            className="action-btn"
            disabled={page >= totalPages}
            onClick={() => applyState({ ...stateRef.current, page: page + 1 })}
            data-testid="catalog-page-next"
          >
            {tl("catalogPage.forward", "Вперёд →")}
          </button>
        </div>
      )}
    </div>
  );
}
