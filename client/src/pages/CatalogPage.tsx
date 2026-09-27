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
 * Беседа 8.7 (п. 3): проп publicOnly — режим «/explore»: только публичный
 * каталог (GET /syntheses/public — гостевой путь 8.6), без вкладки «Мои»,
 * кнопки «Новый синтез» и поиска по генеалогии (/lineage/search под
 * requireAuth). Гостю доступен без входа; зарегистрированному — тот же
 * список, что вкладка «Публичные».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { LineageNode } from "@philosynth/shared/types/lineage";
import type { SynthesisPreview } from "@philosynth/shared/types/synthesis";

import { ApiError } from "../api/client";
import { getDescendants } from "../api/lineage";
import {
  deleteSynthesis,
  duplicateSynthesis,
  getSynthesis,
  listPublicSyntheses,
  listSyntheses,
  renameSynthesis,
  updateSynthesis,
} from "../api/syntheses";
import type {
  SynthesisCardActions,
  SynthesisCardVisibility,
} from "../components/catalog/SynthesisCard";
import { SynthesisList } from "../components/catalog/SynthesisList";
import { LineageSearch } from "../components/lineage/LineageSearch";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";
import { useAuthStore } from "../stores/auth-store";
import { tl } from "@philosynth/shared/i18n/t";

const PAGE_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 400;

type CatalogTab = "mine" | "public";

/** Собрать id всех узлов-концепций из леса потомков (беседа 3.2) */
function collectDescendantIds(nodes: readonly LineageNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: readonly LineageNode[]) => {
    for (const n of list) {
      if (n.type === "synthesis" && n.synthesisId) ids.add(n.synthesisId);
      walk(n.children);
    }
  };
  walk(nodes);
  return ids;
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

export interface CatalogPageProps {
  /** Беседа 8.7: режим «/explore» — только публичный каталог, без «Мои» */
  publicOnly?: boolean | undefined;
}

export function CatalogPage({ publicOnly = false }: CatalogPageProps) {
  const authenticated = useAuthStore((s) => s.status === "authenticated");
  const [tab, setTab] = useState<CatalogTab>(publicOnly ? "public" : "mine");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<SynthesisPreview[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Беседа 3.2: фильтр «Потомки концепции X» (?descendantsOf=<id>)
  const [searchParams, setSearchParams] = useSearchParams();
  const descendantsOf = searchParams.get("descendantsOf");
  const [descendantIds, setDescendantIds] = useState<Set<string> | null>(null);
  const [descendantsError, setDescendantsError] = useState(false);
  useEffect(() => {
    setDescendantIds(null);
    setDescendantsError(false);
    if (!descendantsOf) return;
    let cancelled = false;
    getDescendants(descendantsOf)
      .then((children) => {
        if (!cancelled) setDescendantIds(collectDescendantIds(children));
      })
      .catch(() => {
        if (!cancelled) setDescendantsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [descendantsOf]);

  // Беседа 3.2: сворачиваемый блок «Поиск по генеалогии»
  const [lineageSearchOpen, setLineageSearchOpen] = useState(false);

  // Дебаунс поиска: ввод → 400 мс тишины → серверный ?search=
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const reqSeq = useRef(0);
  // silent (8.4): перечитка после действия карточки — без спиннера, чтобы
  // список не «мигал» и соседние карточки не размонтировались
  const fetchList = useCallback(async (opts: { silent?: boolean } = {}) => {
    const seq = ++reqSeq.current;
    if (!opts.silent) setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        limit: PAGE_LIMIT,
        ...(search ? { search } : {}),
      };
      const result =
        tab === "mine"
          ? await listSyntheses(params)
          : await listPublicSyntheses(params);
      if (seq !== reqSeq.current) return;
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      if (seq !== reqSeq.current) return;
      setItems([]);
      setTotal(0);
      setError(
        err instanceof ApiError ? err.message : tl("catalogPage.catalogLoadFailed", "Не удалось загрузить каталог."),
      );
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [tab, search, page]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

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

  // Беседа 3.2: пересечение текущего списка с множеством потомков
  // (клиентское — «каталог лишь отображает пересечение», аудит 2026-07-30)
  const visibleItems = useMemo(() => {
    if (!descendantsOf || descendantIds === null || descendantsError)
      return items;
    return items.filter((s) => descendantIds.has(s.id));
  }, [items, descendantsOf, descendantIds, descendantsError]);

  const tabBtn = (key: CatalogTab, label: string) => (
    <button
      type="button"
      className="action-btn"
      style={
        tab === key
          ? {
              background: "var(--blue-corp)",
              color: "#fff",
              borderColor: "var(--blue-corp)",
            }
          : undefined
      }
      onClick={() => {
        setTab(key);
        setPage(1);
      }}
    >
      {label}
    </button>
  );

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
        </div>
        <div className="actions-bar-btns">
          {/* Поиск по генеалогии — /lineage/search под requireAuth: гостю
              и в режиме /explore не показывается */}
          {authenticated && !publicOnly && (
            <button
              type="button"
              className="action-btn"
              onClick={() => setLineageSearchOpen((v) => !v)}
              title={tl("catalogPage.lineageSearchHint", "Поиск концепций по философам-предкам")}
            >
              {tl("catalogPage.genealogyToggle", "{lineageSearchOpen} Генеалогия", { lineageSearchOpen: lineageSearchOpen ? "▾" : "▸" })}
            </button>
          )}
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={tl("catalogPage.searchByTitle", "Поиск по названию…")}
            className="form-input"
            style={{ width: 256 }}
          />
        </div>
      </div>

      {/* Беседа 3.2 (п. 3): поиск по философам-предкам */}
      {lineageSearchOpen && authenticated && !publicOnly && (
        <LineageSearch />
      )}

      {/* Беседа 3.2 (п. 5): баннер фильтра потомков */}
      {descendantsOf && (
        <div className="callout gold catalog-filter-bar">
          <span>
            {descendantsError
              ? tl("catalogPage.descendantsLoadFailed", "⚠ Не удалось загрузить потомков — фильтр не применён.")
              : descendantIds === null
                ? tl("catalogPage.loadingDescendants", "Загрузка потомков…")
                : descendantIds.size === 0
                  ? tl("catalogPage.noVisibleDescendants", "У этой концепции нет потомков (видимых вам).")
                  : tl("catalogPage.onlyDescendantsLead", "Показаны только потомки концепции (") +
                    descendantIds.size +
                    tl("catalogPage.onlyDescendantsTail", ") — пересечение с текущей вкладкой.")}{" "}
            <Link to={`/synthesis/${descendantsOf}`}>{tl("catalogPage.toConcept", "◈ к концепции")}</Link>
          </span>
          <button
            type="button"
            className="action-btn"
            style={{ padding: "2px 10px" }}
            onClick={() => {
              searchParams.delete("descendantsOf");
              setSearchParams(searchParams, { replace: true });
            }}
          >
            {tl("catalogPage.resetFilter", "✕ Сбросить фильтр")}
          </button>
        </div>
      )}

      <div>
        {loading ? (
          <LoadingSpinner label={tl("catalogPage.loadingCatalog", "загрузка каталога…")} />
        ) : error ? (
          <div className="callout warning">
            <span className="callout-label">{tl("common.error", "Ошибка")}</span>
            {error}
          </div>
        ) : (
          <SynthesisList
            items={visibleItems}
            emptyText={
              descendantsOf && descendantIds !== null && !descendantsError
                ? tl("catalogPage.noDescendantsInTab", "На этой вкладке потомков выбранной концепции нет.")
                : search
                  ? tl("catalogPage.nothingFound", "Ничего не найдено по запросу.")
                  : tab === "mine"
                    ? tl("catalogPage.noSynthesesYet", "У вас пока нет синтезов — начните с «Новый синтез».")
                    : tl("catalogPage.noPublicSyntheses", "Публичных синтезов пока нет.")
            }
            visibility={tab === "mine" ? cardVisibility : undefined}
            actions={tab === "mine" ? cardActions : undefined}
          />
        )}
      </div>

      {!loading && !error && total > PAGE_LIMIT && (
        <div className="actions-bar" style={{ justifyContent: "center", gap: 16 }}>
          <button
            type="button"
            className="action-btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
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
            onClick={() => setPage((p) => p + 1)}
          >
            {tl("catalogPage.forward", "Вперёд →")}
          </button>
        </div>
      )}
    </div>
  );
}
