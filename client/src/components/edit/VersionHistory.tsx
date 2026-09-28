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
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

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
import { tl } from "@philosynth/shared/i18n/t";

const SOURCE_LABELS = (): Record<ChangeSource, string> => ({
  manual: tl("edit.versionHistory.sourceManual", "правка вручную"),
  regenerated: tl("edit.versionHistory.sourceRegeneration", "перегенерация"),
  cascade: tl("edit.versionHistory.sourceCascade", "каскад"),
  auto_rename: tl("edit.versionHistory.sourceRename", "автозамена имени"),
  rollback: tl("edit.versionHistory.sourceRollback", "откат"),
  recommendation: tl("edit.versionHistory.sourceRecommendation", "по рекомендации критики"), // 10.2; «почему» (origin) — ниже, 10.3
});

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

const FIELD_LABELS = (): Record<string, string> => ({
  name: tl("common.title", "Название"),
  type: tl("common.type", "Тип"),
  definition: tl("common.definition", "Определение"),
  centrality: tl("common.centrality", "Центральность"),
  certainty: tl("common.certainty", "Определённость"),
  origin: tl("common.origin", "Происхождение"),
  formulation: tl("common.formulation", "Формулировка"),
  justification: tl("common.justification", "Обоснование"),
  thesisType: tl("common.thesisType", "Тип тезиса"),
  noveltyDegree: tl("common.noveltyDegree", "Степень новизны"),
  relatedCategories: tl("edit.versionHistory.relatedCategories", "Связанные категории"),
  term: tl("common.term", "Термин"),
  extraColumns: tl("edit.versionHistory.levelColumns", "Столбцы уровня"),
  termCategory: tl("edit.versionHistory.termCategory", "Категория термина"),
  description: tl("edit.versionHistory.edgeDescription", "Описание связи"),
  edgeType: tl("common.edgeType", "Тип связи"),
  direction: tl("common.direction", "Направление"),
  strength: tl("edit.versionHistory.strength", "Сила"),
  htmlContent: tl("edit.versionHistory.sectionHtml", "HTML раздела"),
});

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
      const ai = Object.keys(FIELD_LABELS()).indexOf(a);
      const bi = Object.keys(FIELD_LABELS()).indexOf(b);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
  const out: DiffLine[] = [];
  let same = 0;
  for (const k of keys) {
    const a = scalar(older[k]);
    const b = scalar(newer[k]);
    const label = FIELD_LABELS()[k] ?? k;
    if (a === b) {
      same++;
      continue;
    }
    out.push({ kind: "ctx", text: `${label}:` });
    if (a) out.push({ kind: "del", text: a });
    if (b) out.push({ kind: "add", text: b });
  }
  if (!out.length) out.push({ kind: "ctx", text: tl("edit.versionHistory.noFieldDiffs", "Различий по полям нет") });
  else if (same) out.push({ kind: "ctx", text: tl("edit.versionHistory.unchangedFields", "(без изменений: {same} полей)", { same }) });
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
        setError(err instanceof ApiError ? err.message : tl("edit.versionHistory.historyLoadFailed", "Не удалось загрузить историю"));
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
        tl("edit.versionHistory.confirmRollbackLead", "Откатить элемент к версии v{selected}? Текущее состояние сохранится ", { selected }) +
          tl("edit.versionHistory.confirmRollbackTail", "новой версией (источник «откат»)."),
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await rollbackToVersion(synthesisId, elementType, elementId, selected);
      onRolledBack?.(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tl("edit.versionHistory.rollbackFailed", "Откат не выполнен"));
    } finally {
      setBusy(false);
    }
  }, [selected, busy, synthesisId, elementType, elementId, onRolledBack]);

  return (
    <div data-version-history>
      <div className="form-label">{tl("edit.versionHistory.title", "История версий")}</div>
      {versions === null ? (
        <div className="version-meta" style={{ padding: "6px 0" }}>
          {tl("edit.versionHistory.loading", "загрузка…")}
        </div>
      ) : (
        <div className="version-list">
          <div className="version-item current" title={tl("edit.versionHistory.currentState", "Текущее состояние элемента")}>
            <span className="version-num">
              {tl("edit.versionHistory.versionLabel", "v{version}", { version: (versions[0]?.version ?? 0) + 1 })}
            </span>
            <span className="version-preview">{versionPreview(currentData)}</span>
            <span className="version-meta">{tl("edit.versionHistory.currentStateLower", "текущее состояние")}</span>
          </div>
          {versions.map((v) => (
            <Fragment key={v.id}>
            <div
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
              <span className="version-num">{tl("edit.versionHistory.versionLabel", "v{version}", { version: v.version })}</span>
              <span className="version-preview">{versionPreview(v.data)}</span>
              <span className="version-meta">
                {fmtDate(v.createdAt)} · {SOURCE_LABELS()[v.changeSource] ?? v.changeSource}
              </span>
            </div>
            {/* 10.3: «почему изменилось» — снимок рекомендации, породившей правку
                (origin 10.2). Снимок, а не ссылка: переживает перечитку таблицы
                и удаление плана */}
            {v.origin?.kind === "recommendation" && (
              <div className="version-origin" data-testid="version-origin">
                {tl("edit.versionHistory.whyRecommendation", "Почему: рекомендация № {num} критики (раунд {origin}) — {op}", { num: v.origin.num, origin: v.origin.round, op: v.origin.op })}
                {v.origin.rationale ? tl("edit.versionHistory.problemIn", "; проблема установлена в «{rationale}»", { rationale: v.origin.rationale }) : ""}
                {" · "}
                {v.origin.stepType === "edit_element"
                  ? tl("edit.versionHistory.replacementInserted", "вписана готовая замена")
                  : tl("edit.versionHistory.valueByModel", "значение написано моделью")}
              </div>
            )}
            </Fragment>
          ))}
          {versions.length === 0 && (
            <div className="version-meta" style={{ padding: "8px 12px" }}>
              {tl("edit.versionHistory.noEditsYet", "правок ещё не было")}
            </div>
          )}
        </div>
      )}

      {diff && selected !== null && (
        <>
          <div className="form-sublabel" style={{ marginTop: 8 }}>
            {tl("edit.versionHistory.compare", "Сравнение: v{selected} →", { selected })}
            {versions && versions[0]?.version === selected
              ? tl("edit.versionHistory.currentStateLower", "текущее состояние")
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
              {busy ? tl("edit.versionHistory.rollingBack", "Откат…") : tl("edit.versionHistory.rollbackTo", "Откатить к v{selected}", { selected })}
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
