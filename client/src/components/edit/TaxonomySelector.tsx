/**
 * TaxonomySelector — выбор типа категории/связи из каталога 0.3b с
 * автокомплитом, нормализацией свободного текста и созданием нового типа.
 * Беседа 5.4 (запрос 1, п. 3). Функциональности нет в исходнике — новый
 * React-код; оформление — блок 2 UI-кита (.combobox / .combobox-list /
 * .combobox-item(.active/.create) / .combobox-item-code / .type-origin
 * (.catalog/.free)) поверх .form-input исходника.
 *
 * Значение — пара { type, typeCatalogId } (03 §2.4 п.11: PATCH принимает
 * typeCatalogId ЛИБО свободный type; ответ несёт оба поля, по ним
 * рисуется индикатор «из каталога» (зелёный) / «свободный текст»
 * (серый)). Выбор строки каталога пишет type = name_ru в написании
 * документа (строчная первая буква — так парсер 1.4 хранит типы из
 * таблиц Claude: «онтологическая») и typeCatalogId = id строки; ввод
 * руками сбрасывает typeCatalogId в null.
 *
 * Список: локальный фильтр каталога по подстроке name_ru/key + результат
 * POST /taxonomy/normalize (debounce 300 мс): match поднимается первым и
 * помечается «≈», suggestions добавляются после локальных. Если match
 * нет и текст не совпадает ни с одной строкой каталога — строка
 * «+ Создать тип «…»» → форма (key латиницей из transliterate, name_ru,
 * описание, для связей — направление по умолчанию) → POST
 * /taxonomy/{kind}-types → новый тип сразу выбран.
 *
 * ФАКТ (найден 5.4): typeCatalogId у сгенерированных элементов всегда
 * null — graph-parser 1.4 нормализацию на каталог (01 §4.8, T3) не
 * делает, только lower-case текста. Поэтому при открытии селектора с
 * непустым свободным type и без typeCatalogId выполняется normalize и при
 * match предлагается привязка «≈ каталог: …» (индикатор остаётся
 * «свободный текст» до сохранения). Дыра доков — в патч завершения.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { transliterate } from "@philosynth/shared/utils/transliterate";
import type { TypeMatch } from "@philosynth/shared/types/elements";

import { ApiError } from "../../api/client";
import {
  createCustomType,
  getCatalog,
  normalizeType,
  type CatalogType,
  type RelationshipDirection,
  type TaxonomyKind,
} from "../../api/taxonomy";

export interface TaxonomyValue {
  type: string;
  typeCatalogId: string | null;
}

export interface TaxonomySelectorProps {
  kind: TaxonomyKind;
  value: TaxonomyValue;
  onChange: (next: TaxonomyValue) => void;
  disabled?: boolean | undefined;
  /** Скрыть строку «Создать тип» */
  allowCreate?: boolean | undefined;
  id?: string | undefined;
  error?: string | undefined;
  placeholder?: string | undefined;
  /** Тёмный контекст (панель графа) — только для тестов/стилей */
  compact?: boolean | undefined;
}

const NORMALIZE_DEBOUNCE_MS = 300;
const LIST_LIMIT = 12;

/** name_ru → написание документа («Онтологическая» → «онтологическая») */
export function typeTextFromCatalog(nameRu: string): string {
  return nameRu ? nameRu.charAt(0).toLocaleLowerCase("ru") + nameRu.slice(1) : nameRu;
}

/** Предложение ключа латиницей из русского названия */
export function suggestTypeKey(nameRu: string): string {
  return transliterate(nameRu)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 64);
}

interface ListItem {
  key: string;
  nameRu: string;
  id: string | null;
  /** Из normalize (≈) */
  fuzzy?: boolean;
  score?: number;
}

const DIRECTION_LABELS: Record<RelationshipDirection, string> = {
  unidirectional: "однонаправленная",
  bidirectional: "двунаправленная",
  reflexive: "рефлексивная",
};

export function TaxonomySelector({
  kind,
  value,
  onChange,
  disabled = false,
  allowCreate = true,
  id,
  error,
  placeholder,
  compact = false,
}: TaxonomySelectorProps) {
  const [catalog, setCatalog] = useState<CatalogType[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [normalized, setNormalized] = useState<{ text: string; match: TypeMatch | null; suggestions: TypeMatch[] } | null>(null);
  const [creating, setCreating] = useState(false);
  const inputId = id ?? `tax-${kind}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const normTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const normSeq = useRef(0);

  // Каталог (кэш на сессию — api/taxonomy)
  useEffect(() => {
    let alive = true;
    getCatalog(kind)
      .then((list) => {
        if (alive) setCatalog(list);
      })
      .catch((err: unknown) => {
        if (alive) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, [kind]);

  const byId = useMemo(() => new Map((catalog ?? []).map((t) => [t.id, t])), [catalog]);
  const byKey = useMemo(() => new Map((catalog ?? []).map((t) => [t.key, t])), [catalog]);
  const catalogRow = value.typeCatalogId ? byId.get(value.typeCatalogId) ?? null : null;
  const fromCatalog = !!catalogRow;

  /** Точное совпадение текста со строкой каталога (без учёта регистра) */
  const exactRow = useMemo(() => {
    const q = value.type.trim().toLocaleLowerCase("ru");
    if (!q || !catalog) return null;
    return catalog.find((t) => t.nameRu.toLocaleLowerCase("ru") === q || t.key === q) ?? null;
  }, [catalog, value.type]);

  // Нормализация свободного текста (debounce); также при открытии с
  // непустым свободным type — предложение привязки
  const runNormalize = useCallback(
    (text: string) => {
      const q = text.trim();
      if (normTimer.current) clearTimeout(normTimer.current);
      if (!q) {
        setNormalized(null);
        return;
      }
      const seq = ++normSeq.current;
      normTimer.current = setTimeout(() => {
        normalizeType(q, kind)
          .then((res) => {
            if (seq === normSeq.current) setNormalized({ text: q, ...res });
          })
          .catch(() => {
            if (seq === normSeq.current) setNormalized({ text: q, match: null, suggestions: [] });
          });
      }, NORMALIZE_DEBOUNCE_MS);
    },
    [kind],
  );

  useEffect(() => {
    if (open && !fromCatalog && value.type.trim() && normalized?.text !== value.type.trim())
      runNormalize(value.type);
  }, [open, fromCatalog, value.type, normalized?.text, runNormalize]);

  // Клик вне — закрыть список
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  /** Список: локальный фильтр + normalize (match первым) */
  const items = useMemo<ListItem[]>(() => {
    const q = value.type.trim().toLocaleLowerCase("ru");
    const list = catalog ?? [];
    const local: ListItem[] = list
      .filter(
        (t) =>
          !q ||
          fromCatalog ||
          t.nameRu.toLocaleLowerCase("ru").includes(q) ||
          t.key.includes(q),
      )
      .map((t) => ({ key: t.key, nameRu: t.nameRu, id: t.id }));
    const out: ListItem[] = [];
    const seen = new Set<string>();
    const push = (it: ListItem) => {
      if (seen.has(it.key)) return;
      seen.add(it.key);
      out.push(it);
    };
    if (normalized && normalized.text === value.type.trim() && !fromCatalog) {
      if (normalized.match) {
        const row = byKey.get(normalized.match.key);
        push({
          key: normalized.match.key,
          nameRu: normalized.match.nameRu,
          id: row?.id ?? null,
          fuzzy: true,
          score: normalized.match.score,
        });
      }
      for (const it of local) push(it);
      for (const s of normalized.suggestions) {
        const row = byKey.get(s.key);
        push({ key: s.key, nameRu: s.nameRu, id: row?.id ?? null, fuzzy: true, score: s.score });
      }
    } else {
      for (const it of local) push(it);
    }
    return out.slice(0, LIST_LIMIT);
  }, [catalog, value.type, fromCatalog, normalized, byKey]);

  const canCreate =
    allowCreate &&
    !disabled &&
    !fromCatalog &&
    value.type.trim().length > 0 &&
    !exactRow &&
    normalized?.text === value.type.trim() &&
    normalized.match === null;

  const pick = useCallback(
    (it: ListItem) => {
      onChange({ type: typeTextFromCatalog(it.nameRu), typeCatalogId: it.id });
      setOpen(false);
      setCreating(false);
      setActiveIdx(-1);
    },
    [onChange],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (!open) return;
    const total = items.length + (canCreate ? 1 : 0);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (total ? (i + 1) % total : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (total ? (i - 1 + total) % total : -1));
    } else if (e.key === "Enter") {
      if (activeIdx >= 0 && activeIdx < items.length) {
        e.preventDefault();
        pick(items[activeIdx]!);
      } else if (activeIdx === items.length && canCreate) {
        e.preventDefault();
        setCreating(true);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setCreating(false);
    }
  };

  return (
    <div
      className={"combobox" + (compact ? " compact" : "")}
      ref={rootRef}
      data-taxonomy-kind={kind}
    >
      <div className="combobox-input-row">
        <input
          id={inputId}
          className="form-input"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={placeholder ?? (kind === "category" ? "тип категории" : "тип связи")}
          value={value.type}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            const text = e.target.value;
            onChange({ type: text, typeCatalogId: null });
            setOpen(true);
            setCreating(false);
            setActiveIdx(-1);
            runNormalize(text);
          }}
          onKeyDown={onKeyDown}
        />
        <span
          className={"type-origin " + (fromCatalog ? "catalog" : "free")}
          title={
            fromCatalog
              ? `Каталог: ${catalogRow?.nameRu} (${catalogRow?.key})`
              : "Тип не привязан к каталогу"
          }
          data-testid="type-origin"
        >
          {fromCatalog ? "из каталога" : "свободный текст"}
        </span>
      </div>
      {loadError && <div className="pool-status err">Каталог недоступен: {loadError}</div>}
      {error && <div className="pool-status err">{error}</div>}

      {open && !disabled && !creating && (items.length > 0 || canCreate || catalog === null) && (
        <div className="combobox-list" role="listbox">
          {catalog === null && !loadError && (
            <div className="combobox-item">
              <span>загрузка каталога…</span>
            </div>
          )}
          {items.map((it, i) => (
            <div
              key={it.key}
              role="option"
              aria-selected={i === activeIdx}
              className={"combobox-item" + (i === activeIdx ? " active" : "")}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => pick(it)}
            >
              <span>
                {it.fuzzy ? "≈ " : ""}
                {it.nameRu}
              </span>
              <span className="combobox-item-code">
                {it.key}
                {it.id === null ? " · нет в каталоге" : ""}
              </span>
            </div>
          ))}
          {canCreate && (
            <div
              role="option"
              aria-selected={activeIdx === items.length}
              className={"combobox-item create" + (activeIdx === items.length ? " active" : "")}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIdx(items.length)}
              onClick={() => setCreating(true)}
              data-testid="taxonomy-create"
            >
              + Создать тип «{value.type.trim()}»
            </div>
          )}
        </div>
      )}

      {creating && (
        <CreateTypeForm
          kind={kind}
          initialNameRu={value.type.trim()}
          onCancel={() => setCreating(false)}
          onCreated={(t) => {
            setCatalog((prev) => (prev ? [...prev, t] : [t]));
            pick({ key: t.key, nameRu: t.nameRu, id: t.id });
          }}
        />
      )}
    </div>
  );
}

/* ── Форма нового типа ───────────────────────────────────────────────── */

function CreateTypeForm({
  kind,
  initialNameRu,
  onCancel,
  onCreated,
}: {
  kind: TaxonomyKind;
  initialNameRu: string;
  onCancel: () => void;
  onCreated: (t: CatalogType) => void;
}) {
  const [nameRu, setNameRu] = useState(initialNameRu);
  const [key, setKey] = useState(suggestTypeKey(initialNameRu));
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [direction, setDirection] = useState<RelationshipDirection>("unidirectional");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setErrors({});
    setError(null);
    try {
      const t = await createCustomType(kind, {
        key: key.trim(),
        nameRu: nameRu.trim(),
        description,
        ...(kind === "relationship" ? { defaultDirection: direction } : {}),
      });
      onCreated(t);
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_ERROR" && err.details && typeof err.details === "object") {
        const d: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.details as Record<string, unknown>))
          d[k] = typeof v === "string" ? v : JSON.stringify(v);
        setErrors(d);
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="combobox-create-form" data-testid="taxonomy-create-form">
      <div className="form-label">Новый тип {kind === "category" ? "категории" : "связи"}</div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label" htmlFor={`newtype-${kind}-name`}>Название</label>
          <input
            id={`newtype-${kind}-name`}
            className="form-input"
            value={nameRu}
            disabled={saving}
            onChange={(e) => {
              setNameRu(e.target.value);
              if (!keyTouched) setKey(suggestTypeKey(e.target.value));
            }}
          />
          {errors.nameRu && <div className="pool-status err">{errors.nameRu}</div>}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={`newtype-${kind}-key`}>Ключ (латиница)</label>
          <input
            id={`newtype-${kind}-key`}
            className="form-input"
            value={key}
            disabled={saving}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(e.target.value);
            }}
          />
          {errors.key && <div className="pool-status err">{errors.key}</div>}
        </div>
      </div>
      <div className="form-group full">
        <label className="form-label" htmlFor={`newtype-${kind}-desc`}>Описание</label>
        <input
          id={`newtype-${kind}-desc`}
          className="form-input"
          value={description}
          disabled={saving}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {kind === "relationship" && (
        <div className="form-group">
          <label className="form-label" htmlFor={`newtype-${kind}-dir`}>Направление по умолчанию</label>
          <select
            id={`newtype-${kind}-dir`}
            className="form-select"
            value={direction}
            disabled={saving}
            onChange={(e) => setDirection(e.target.value as RelationshipDirection)}
          >
            {(Object.keys(DIRECTION_LABELS) as RelationshipDirection[]).map((d) => (
              <option key={d} value={d}>{DIRECTION_LABELS[d]}</option>
            ))}
          </select>
          {errors.defaultDirection && <div className="pool-status err">{errors.defaultDirection}</div>}
        </div>
      )}
      {error && !Object.keys(errors).length && <div className="pool-status err">{error}</div>}
      <div className="actions-bar-btns">
        <button
          type="button"
          className="action-btn primary"
          disabled={saving || !nameRu.trim() || !key.trim()}
          onClick={() => void submit()}
        >
          {saving ? "Создание…" : "Создать"}
        </button>
        <button type="button" className="action-btn" disabled={saving} onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}
