/**
 * Поиск концепций по философам-предкам. Беседа 3.2 (запрос 1, п. 3).
 *
 * GET /lineage/search?philosopher=…×N (беседа 3.1): концепции, в
 * генеалогии которых есть ВСЕ указанные философы — транзитивно (CTE);
 * только видимые (свои ИЛИ публичные — паритет каталога).
 *
 * Мульти-селект: ввод с подсказкой по списку 106 философов (datalist) +
 * выбранные — чипы с ✕; кнопка «Найти» дёргает API (не живой поиск:
 * CTE-запрос тяжелее ILIKE каталога, дебаунс-стрельба по каждому чипу
 * была бы расточительной). Результаты — карточки SynthesisCard
 * (переключателя публикации нет: в выдаче есть и чужие публичные).
 */
import { useState } from "react";

import { PHILOSOPHERS } from "@philosynth/shared/constants/philosophers";
import type { SynthesisPreview } from "@philosynth/shared/types/synthesis";

import { ApiError } from "../../api/client";
import { searchByPhilosophers } from "../../api/lineage";
import { SynthesisCard } from "../catalog/SynthesisCard";

export function LineageSearch() {
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<SynthesisPreview[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addName = () => {
    const name = input.trim();
    if (!name) return;
    if (!selected.includes(name)) setSelected((prev) => [...prev, name]);
    setInput("");
  };

  const removeName = (name: string) => {
    setSelected((prev) => prev.filter((n) => n !== name));
  };

  const handleSearch = async () => {
    if (selected.length === 0) {
      setError("Добавьте хотя бы одного философа.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setResults(await searchByPhilosophers(selected));
    } catch (err) {
      setResults(null);
      setError(
        err instanceof ApiError
          ? err.message
          : "Не удалось выполнить поиск по генеалогии.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded border border-rule bg-paper p-4">
      <div className="text-sm font-semibold text-ink">Поиск по генеалогии</div>
      <div className="mt-0.5 font-mono text-[10px] leading-relaxed text-ink-dim">
        Концепции, в генеалогии которых присутствуют ВСЕ указанные философы
        (включая предков через мета-синтез).
      </div>

      <div className="mt-2 flex gap-2">
        <input
          list="lineage-search-philosophers"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addName();
            }
          }}
          placeholder="Имя философа (напр. Кант)"
          className="w-full rounded border border-rule bg-white p-1.5 text-sm text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
        />
        <datalist id="lineage-search-philosophers">
          {PHILOSOPHERS.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={addName}
          className="shrink-0 rounded border border-rule px-3 py-1 text-xs text-ink-mid hover:border-rule-strong hover:text-ink"
        >
          + Добавить
        </button>
        <button
          type="button"
          disabled={loading || selected.length === 0}
          onClick={() => void handleSearch()}
          className="shrink-0 rounded border border-gold px-3 py-1 text-xs text-gold hover:bg-gold hover:text-white disabled:opacity-50"
        >
          {loading ? "…" : "Найти"}
        </button>
      </div>

      {/* Чипы выбранных */}
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((name) => (
            <span
              key={name}
              className="flex items-center gap-1 rounded border border-gold px-1.5 py-0.5 font-mono text-[11px] text-gold"
            >
              {name}
              <button
                type="button"
                onClick={() => removeName(name)}
                aria-label={"Убрать " + name}
                className="text-ink-dim hover:text-red"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-2 font-mono text-[11px] text-red">{error}</div>
      )}

      {/* Результаты */}
      {results !== null && !loading && (
        <div className="mt-3">
          {results.length === 0 ? (
            <div className="font-mono text-[11px] text-ink-dim">
              Концепций с философами {selected.join(", ")} в генеалогии не
              найдено.
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((s) => (
                <SynthesisCard key={s.id} synthesis={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
