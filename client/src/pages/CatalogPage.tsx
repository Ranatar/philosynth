/**
 * Каталог концепций. Беседа 1.6b (запрос 1, п. 4; заглушка 0.4 заменена).
 *
 * - Вкладки: «Мои» (GET /syntheses) / «Публичные» (GET /syntheses/public) —
 *   транспорт 1.6.
 * - Поиск СЕРВЕРНЫЙ: параметр ?search= (ILIKE по title, gin_trgm);
 *   клиент ничего не фильтрует сам — только дебаунс ввода 400 мс
 *   (по образцу дебаунса совета в SynthesisForm, 1.5).
 * - Переключатель публикации: PATCH /syntheses/:id { isPublic } — только
 *   на вкладке «Мои» (403 у чужого всё равно не даст, но кнопку чужим
 *   не показываем: во вкладке «Публичные» есть и чужие синтезы).
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
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { LineageNode } from "@philosynth/shared/types/lineage";
import type { SynthesisPreview } from "@philosynth/shared/types/synthesis";

import { ApiError } from "../api/client";
import { getDescendants } from "../api/lineage";
import {
  listPublicSyntheses,
  listSyntheses,
  updateSynthesis,
} from "../api/syntheses";
import { SynthesisList } from "../components/catalog/SynthesisList";
import { LineageSearch } from "../components/lineage/LineageSearch";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";

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

export function CatalogPage() {
  const [tab, setTab] = useState<CatalogTab>("mine");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<SynthesisPreview[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

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
  const fetchList = useCallback(async () => {
    const seq = ++reqSeq.current;
    setLoading(true);
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
        err instanceof ApiError ? err.message : "Не удалось загрузить каталог.",
      );
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [tab, search, page]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  // PATCH { isPublic } — единственный способ опубликовать синтез (03 §2.2)
  const handleTogglePublic = async (s: SynthesisPreview) => {
    setTogglingId(s.id);
    try {
      const updated = await updateSynthesis(s.id, { isPublic: !s.isPublic });
      setItems((prev) =>
        prev.map((it) =>
          it.id === s.id ? { ...it, isPublic: updated.isPublic } : it,
        ),
      );
    } catch (err) {
      alert(
        err instanceof ApiError && err.code === "FORBIDDEN"
          ? "Публиковать синтез может только владелец."
          : "Не удалось изменить публикацию.",
      );
    } finally {
      setTogglingId(null);
    }
  };

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
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="meta-label">каталог</div>
          <h1 className="mt-1 text-2xl">Каталог концепций</h1>
        </div>
        <Link to="/synthesis/new" className="action-btn primary hover:no-underline">
          Новый синтез
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {tabBtn("mine", "Мои")}
          {tabBtn("public", "Публичные")}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="action-btn"
            onClick={() => setLineageSearchOpen((v) => !v)}
            title="Поиск концепций по философам-предкам"
          >
            {lineageSearchOpen ? "▾" : "▸"} Генеалогия
          </button>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Поиск по названию…"
            className="w-64 rounded border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-blue-corp"
          />
        </div>
      </div>

      {/* Беседа 3.2 (п. 3): поиск по философам-предкам */}
      {lineageSearchOpen && (
        <div className="mt-3">
          <LineageSearch />
        </div>
      )}

      {/* Беседа 3.2 (п. 5): баннер фильтра потомков */}
      {descendantsOf && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-gold bg-gold/5 px-3 py-2">
          <span className="font-mono text-[11px] text-ink-mid">
            {descendantsError
              ? "⚠ Не удалось загрузить потомков — фильтр не применён."
              : descendantIds === null
                ? "Загрузка потомков…"
                : descendantIds.size === 0
                  ? "У этой концепции нет потомков (видимых вам)."
                  : "Показаны только потомки концепции (" +
                    descendantIds.size +
                    ") — пересечение с текущей вкладкой."}{" "}
            <Link
              to={`/synthesis/${descendantsOf}`}
              className="text-gold hover:no-underline"
            >
              ◈ к концепции
            </Link>
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
            ✕ Сбросить фильтр
          </button>
        </div>
      )}

      <div className="mt-4">
        {loading ? (
          <LoadingSpinner label="загрузка каталога…" />
        ) : error ? (
          <div className="rounded border border-red bg-red/5 p-3 text-sm text-red">
            {error}
          </div>
        ) : (
          <SynthesisList
            items={visibleItems}
            emptyText={
              descendantsOf && descendantIds !== null && !descendantsError
                ? "На этой вкладке потомков выбранной концепции нет."
                : search
                  ? "Ничего не найдено по запросу."
                  : tab === "mine"
                    ? "У вас пока нет синтезов — начните с «Новый синтез»."
                    : "Публичных синтезов пока нет."
            }
            onTogglePublic={tab === "mine" ? handleTogglePublic : undefined}
            togglingId={togglingId}
          />
        )}
      </div>

      {!loading && !error && total > PAGE_LIMIT && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            className="action-btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Назад
          </button>
          <span className="font-mono text-xs text-ink-dim">
            стр. {page} / {totalPages} · всего {total}
          </span>
          <button
            type="button"
            className="action-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Вперёд →
          </button>
        </div>
      )}
    </div>
  );
}
