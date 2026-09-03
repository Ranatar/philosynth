/**
 * VersionHistory — версии элемента, diff, откат. Беседа 5.2 (запрос 1,
 * п. 5). Новый код; оформление — блок 5 UI-кита (.version-*, .diff*).
 *
 * Транспорт: GET /elements/:type/:id/versions (version DESC), POST
 * …/rollback { version } → { element, version, impact, htmlSync }
 * (03 §2.4). Семантика версии (02 §2.12): data — снимок элемента ДО
 * изменения; сама текущая строка БД версии не имеет — она показана
 * первой как «текущее состояние» (.version-item.current) из пропа
 * currentData.
 *
 * Diff: сравнение по полям двух снимков (выбранный ↔ соседний более
 * новый, для самой новой версии — ↔ текущее состояние). Служебные поля
 * (id, synthesisId, createdAt, updatedAt, position) не сравниваются.
 * Массивы/объекты сериализуются JSON.
 *
 * Откат — только для владельца при status≠generating (гейты сервера
 * 5.1); после успеха хозяин перечитывает элемент и разделы (impact +
 * htmlSync приходят как у PATCH — ElementEditor показывает их тем же
 * блоком).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ChangeSource,
  ElementVersion,
  VersionedElementType,
} from "@philosynth/shared/types/elements";

import { ApiError } from "../../api/client";
import {
  getVersionHistory,
  rollbackToVersion,
  type RollbackResponse,
} from "../../api/elements";

const SOURCE_LABELS: Record<ChangeSource, string> = {
  manual: "правка вручную",
  regenerated: "перегенерация",
  cascade: "каскад",
  auto_rename: "автозамена имени",
  rollback: "откат",
};

const HIDDEN_FIELDS = new Set([
  "id",
  "synthesisId",
  "synthesis_id",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "position",
  "typeCatalogId",
  "type_catalog_id",
]);

const FIELD_LABELS: Record<string, string> = {
  name: "Название",
  type: "Тип",
  definition: "Определение",
  centrality: "Центральность",
  certainty: "Определённость",
  origin: "Происхождение",
  formulation: "Формулировка",
  justification: "Обоснование",
  thesisType: "Тип тезиса",
  noveltyDegree: "Степень новизны",
  relatedCategories: "Связанные категории",
  term: "Термин",
  extraColumns: "Столбцы уровня",
  termCategory: "Категория термина",
  description: "Описание связи",
  edgeType: "Тип связи",
  direction: "Направление",
  strength: "Сила",
  htmlContent: "HTML раздела",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours(),
  )}:${p(d.getMinutes())}`;
}

function scalar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/** Однострочное превью снимка: первое «главное» текстовое поле */
export function versionPreview(data: Record<string, unknown>): string {
  for (const k of ["name", "formulation", "term", "description", "htmlContent"]) {
    const v = data[k];
    if (typeof v === "string" && v.trim()) {
      const s = v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return s.length > 90 ? s.slice(0, 89) + "…" : s;
    }
  }
  return "—";
}

export interface DiffLine {
  kind: "ctx" | "del" | "add";
  text: string;
}

/** Diff двух снимков по полям: ctx — неизменённые (свёрнуто), del/add */
export function diffSnapshots(
  older: Record<string, unknown>,
  newer: Record<string, unknown>,
): DiffLine[] {
  const keys = [...new Set([...Object.keys(older), ...Object.keys(newer)])]
    .filter((k) => !HIDDEN_FIELDS.has(k))
    .sort((a, b) => {
      const ai = Object.keys(FIELD_LABELS).indexOf(a);
      const bi = Object.keys(FIELD_LABELS).indexOf(b);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
  const out: DiffLine[] = [];
  let same = 0;
  for (const k of keys) {
    const a = scalar(older[k]);
    const b = scalar(newer[k]);
    const label = FIELD_LABELS[k] ?? k;
    if (a === b) {
      same++;
      continue;
    }
    out.push({ kind: "ctx", text: `${label}:` });
    if (a) out.push({ kind: "del", text: a });
    if (b) out.push({ kind: "add", text: b });
  }
  if (!out.length) out.push({ kind: "ctx", text: "Различий по полям нет" });
  else if (same) out.push({ kind: "ctx", text: `(без изменений: ${same} полей)` });
  return out;
}

export interface VersionHistoryProps {
  synthesisId: string;
  elementType: VersionedElementType;
  elementId: string;
  /** Текущее состояние элемента (строка «текущее» в списке и правая
   *  сторона diff для самой новой версии) */
  currentData: Record<string, unknown>;
  /** Инкремент — перечитать историю (после сохранения/отката) */
  refreshKey?: number | undefined;
  /** Откат недоступен (не владелец / генерация / занято) */
  disabled?: boolean | undefined;
  onRolledBack?: ((res: RollbackResponse) => void) | undefined;
}

export function VersionHistory({
  synthesisId,
  elementType,
  elementId,
  currentData,
  refreshKey = 0,
  disabled = false,
  onRolledBack,
}: VersionHistoryProps) {
  const [versions, setVersions] = useState<ElementVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getVersionHistory(synthesisId, elementType, elementId)
      .then((v) => {
        if (cancelled) return;
        setVersions(v);
        setSelected((s) => (s !== null && v.some((x) => x.version === s) ? s : null));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setVersions([]);
        setError(err instanceof ApiError ? err.message : "Не удалось загрузить историю");
      });
    return () => {
      cancelled = true;
    };
  }, [synthesisId, elementType, elementId, refreshKey]);

  // Версии приходят DESC: соседняя более новая — предыдущий элемент
  const diff = useMemo<DiffLine[] | null>(() => {
    if (!versions || selected === null) return null;
    const idx = versions.findIndex((v) => v.version === selected);
    if (idx < 0) return null;
    const older = versions[idx]!.data;
    const newer = idx === 0 ? currentData : versions[idx - 1]!.data;
    return diffSnapshots(older, newer);
  }, [versions, selected, currentData]);

  const doRollback = useCallback(async () => {
    if (selected === null || busy) return;
    if (
      !window.confirm(
        `Откатить элемент к версии v${selected}? Текущее состояние сохранится ` +
          "новой версией (источник «откат»).",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await rollbackToVersion(synthesisId, elementType, elementId, selected);
      onRolledBack?.(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Откат не выполнен");
    } finally {
      setBusy(false);
    }
  }, [selected, busy, synthesisId, elementType, elementId, onRolledBack]);

  return (
    <div data-version-history>
      <div className="form-label">История версий</div>
      {versions === null ? (
        <div className="version-meta" style={{ padding: "6px 0" }}>
          загрузка…
        </div>
      ) : (
        <div className="version-list">
          <div className="version-item current" title="Текущее состояние элемента">
            <span className="version-num">
              v{(versions[0]?.version ?? 0) + 1}
            </span>
            <span className="version-preview">{versionPreview(currentData)}</span>
            <span className="version-meta">текущее состояние</span>
          </div>
          {versions.map((v) => (
            <div
              key={v.id}
              className={"version-item" + (selected === v.version ? " selected" : "")}
              role="button"
              tabIndex={0}
              onClick={() => setSelected((s) => (s === v.version ? null : v.version))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected((s) => (s === v.version ? null : v.version));
                }
              }}
            >
              <span className="version-num">v{v.version}</span>
              <span className="version-preview">{versionPreview(v.data)}</span>
              <span className="version-meta">
                {fmtDate(v.createdAt)} · {SOURCE_LABELS[v.changeSource] ?? v.changeSource}
              </span>
            </div>
          ))}
          {versions.length === 0 && (
            <div className="version-meta" style={{ padding: "8px 12px" }}>
              правок ещё не было
            </div>
          )}
        </div>
      )}

      {diff && selected !== null && (
        <>
          <div className="form-sublabel" style={{ marginTop: 8 }}>
            Сравнение: v{selected} →{" "}
            {versions && versions[0]?.version === selected
              ? "текущее состояние"
              : `v${selected + 1}`}
          </div>
          <div className="diff" style={{ marginTop: 4 }}>
            {diff.map((l, i) => (
              <span key={i} className={`diff-line ${l.kind}`}>
                {l.text}
              </span>
            ))}
          </div>
          <div className="actions-bar-btns" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="action-btn"
              disabled={disabled || busy}
              onClick={() => void doRollback()}
            >
              {busy ? "Откат…" : `Откатить к v${selected}`}
            </button>
          </div>
        </>
      )}
      {error && (
        <div className="pool-status err" style={{ marginTop: 6 }}>
          {error}
        </div>
      )}
    </div>
  );
}
