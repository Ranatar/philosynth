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
    <div className="pool-block lineage-search">
      <div className="pool-block-title">Поиск по генеалогии</div>
      <div className="pool-block-desc">
        Концепции, в генеалогии которых присутствуют ВСЕ указанные философы
        (включая предков через мета-синтез).
      </div>

      <div className="pool-url-row visible">
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
          className="import-url-input"
        />
        <datalist id="lineage-search-philosophers">
          {PHILOSOPHERS.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={addName}
          className="import-url-btn"
        >
          + Добавить
        </button>
        <button
          type="button"
          disabled={loading || selected.length === 0}
          onClick={() => void handleSearch()}
          className="action-btn primary"
        >
          {loading ? "…" : "Найти"}
        </button>
      </div>

      {/* Чипы выбранных */}
      {selected.length > 0 && (
        <div className="compat-section-chips">
          {selected.map((name) => (
            <span
              key={name}
              className="compat-chip chip-tension"
            >
              {name}
              <button
                type="button"
                onClick={() => removeName(name)}
                aria-label={"Убрать " + name}
                className="pool-card-btn remove"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="pool-status err">{error}</div>
      )}

      {/* Результаты */}
      {results !== null && !loading && (
        <div className="lineage-results">
          {results.length === 0 ? (
            <div className="pool-status">
              Концепций с философами {selected.join(", ")} в генеалогии не
              найдено.
            </div>
          ) : (
            <div className="catalog-list">
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
