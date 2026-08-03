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
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { SynthesisPreview } from "@philosynth/shared/types/synthesis";

import { ApiError } from "../api/client";
import {
  listPublicSyntheses,
  listSyntheses,
  updateSynthesis,
} from "../api/syntheses";
import { SynthesisList } from "../components/catalog/SynthesisList";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";

const PAGE_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 400;

type CatalogTab = "mine" | "public";

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
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Поиск по названию…"
          className="w-64 rounded border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-blue-corp"
        />
      </div>

      <div className="mt-4">
        {loading ? (
          <LoadingSpinner label="загрузка каталога…" />
        ) : error ? (
          <div className="rounded border border-red bg-red/5 p-3 text-sm text-red">
            {error}
          </div>
        ) : (
          <SynthesisList
            items={items}
            emptyText={
              search
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
