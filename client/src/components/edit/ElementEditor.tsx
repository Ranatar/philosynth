/**
 * ElementEditor — ручное редактирование элемента синтеза по месту.
 * Беседа 5.2 (запрос 1, п. 1). Функциональности нет в исходнике — новый
 * React-код; оформление — классы исходника (.form-*, .action-btn,
 * .cascade-panel, .callout, .edit-overlay/.edit-modal) + блок 7 UI-кита
 * (.inline-edit-*).
 *
 * Устройство:
 *  - режим «просмотр» (сводка полей) ↔ «редактирование» (форма
 *    специализированного редактора: CategoryEditor / ThesisEditor /
 *    GlossaryTermEditor — контролируемые, состояние здесь);
 *  - «Сохранить» шлёт PATCH ТОЛЬКО изменившихся полей (diff-функции
 *    редакторов); 400 VALIDATION_ERROR раскладывается в ошибки по полям
 *    (details сервера 5.1), 409 GENERATION_IN_PROGRESS / 403 FORBIDDEN —
 *    строкой над кнопками;
 *  - после сохранения — блок анализа влияния: ImpactAnalysis (разделы /
 *    подразделы / режимы / severity) и htmlSync («По факту 5.1» п.6):
 *    rendered — что перерисовано в документе; pending и sectionMissing —
 *    ПРЕДУПРЕЖДЕНИЕ «поле не отражено в документе, раздел требует
 *    перегенерации» (долг §12 за 5.2 — закрыт здесь);
 *  - действия: «Перегенерировать затронутые» — ТОЛЬКО через планы (03
 *    §2.6): колбэк onRegenerateAffected(keys) → хозяин открывает
 *    EditModal 2.3 с предотмеченными разделами (createPlan/useEditPlan);
 *    второго пути запуска перегенерации нет. «Автозамена имён» — только
 *    после смены имени категории: POST /elements/auto-rename (E8).
 *    «Ничего» — закрыть блок;
 *  - «История версий» — VersionHistory (versions/rollback); откат даёт тот
 *    же ответ (impact + htmlSync) и показывается тем же блоком.
 *
 * Блокировка: disabled (status='generating' — сервер ответит 409). Вход в
 * редактор показывается только владельцу — SynthesisFull.isOwner («По
 * факту 5.2»: до того владение было оптимистичным, 403 решал сервер).
 *
 * Варианты размещения: inline (в теле документа, .inline-edit-form) и
 * modal (поверх графовой модалки: .edit-overlay.element-editor-overlay с
 * z-index выше .gm-overlay — правило в части 3 globals.css).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";
import type { Category } from "@philosynth/shared/types/graph";
import type {
  AutoRenameResult,
  GlossaryTerm,
  HtmlSyncInfo,
  ImpactAnalysis,
  Thesis,
  VersionedElementType,
} from "@philosynth/shared/types/elements";

import { ApiError } from "../../api/client";
import {
  autoRename,
  updateCategory,
  updateGlossaryTerm,
  updateThesis,
  type ElementMutationMeta,
  type RollbackResponse,
} from "../../api/elements";
import {
  CategoryEditor,
  categoryDiff,
  categoryToDraft,
  type CategoryDraft,
} from "./CategoryEditor";
import {
  GlossaryTermEditor,
  glossaryDiff,
  glossaryToDraft,
  type GlossaryDraft,
} from "./GlossaryTermEditor";
import { ThesisEditor, thesisDiff, thesisToDraft, type ThesisDraft } from "./ThesisEditor";
import { VersionHistory } from "./VersionHistory";

/* ── Общие мелочи для редакторов ─────────────────────────────────────── */

/** Ошибка поля (details ответа 400) */
export function FieldError({ text }: { text?: string | undefined }) {
  if (!text) return null;
  return (
    <div className="pool-status err" style={{ marginTop: 4 }}>
      {text}
    </div>
  );
}

/** Число как в таблицах Claude: до 2 знаков, без хвостовых нулей
 *  (клиентский двойник fmtNum element-renderer 5.1) */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 100) / 100);
}

/* ── Цель редактирования ─────────────────────────────────────────────── */

export type EditableElement =
  | { kind: "category"; element: Category }
  | { kind: "thesis"; element: Thesis }
  | { kind: "glossary_term"; element: GlossaryTerm; columnKeys?: readonly string[] };

export type EditableKind = EditableElement["kind"];

/** Раздел-хозяин таблицы элемента (element-renderer 5.1: TABLES_BY_TYPE) */
export const HOST_SECTION: Record<EditableKind, string> = {
  category: "graph",
  thesis: "theses",
  glossary_term: "glossary",
};

const KIND_TITLE: Record<EditableKind, string> = {
  category: "Категория графа",
  thesis: "Тезис",
  glossary_term: "Термин глоссария",
};

const HTML_SYNC_FIELD_LABELS: Record<string, string> = {
  justification: "обоснование тезиса",
  termCategory: "категория термина",
  origin: "происхождение",
  definition: "определение",
};

const labelOf = (key: string): string =>
  (KEY_LABELS as Record<string, string>)[key] ?? key;

export interface SaveOutcome extends ElementMutationMeta {
  kind: EditableKind;
  /** Обновлённый элемент (после PATCH/отката) */
  element: Category | Thesis | GlossaryTerm;
  /** Категория переименована — доступна автозамена */
  renamed?: { oldName: string; newName: string } | undefined;
}

export interface ElementEditorProps {
  synthesisId: string;
  target: EditableElement;
  /** Правки заблокированы (status='generating'); причина — подписью */
  disabled?: boolean | undefined;
  disabledReason?: string | undefined;
  /** Открыть сразу в режиме редактирования */
  startInEditMode?: boolean | undefined;
  /** Фактический заголовок последнего столбца таблицы категорий */
  lastColName?: string | undefined;
  /** После PATCH/отката/автозамены — хозяин перечитывает разделы/граф */
  onSaved?: ((outcome: SaveOutcome) => void) | undefined;
  onAutoRenamed?: ((res: AutoRenameResult) => void) | undefined;
  /** «Перегенерировать затронутые» → план (EditModal 2.3) */
  onRegenerateAffected: (sectionKeys: string[]) => void;
  onClose?: (() => void) | undefined;
  variant?: "inline" | "modal" | undefined;
}

type Draft =
  | { kind: "category"; value: CategoryDraft; base: CategoryDraft }
  | { kind: "thesis"; value: ThesisDraft; base: ThesisDraft }
  | { kind: "glossary_term"; value: GlossaryDraft; base: GlossaryDraft };

function makeDraft(t: EditableElement): Draft {
  switch (t.kind) {
    case "category": {
      const d = categoryToDraft(t.element);
      return { kind: "category", value: d, base: d };
    }
    case "thesis": {
      const d = thesisToDraft(t.element);
      return { kind: "thesis", value: d, base: d };
    }
    case "glossary_term": {
      const d = glossaryToDraft(t.element);
      return { kind: "glossary_term", value: d, base: d };
    }
  }
}

function isDirty(d: Draft): boolean {
  switch (d.kind) {
    case "category":
      return Object.keys(categoryDiff(d.base, d.value)).length > 0;
    case "thesis":
      return Object.keys(thesisDiff(d.base, d.value)).length > 0;
    case "glossary_term":
      return Object.keys(glossaryDiff(d.base, d.value)).length > 0;
  }
}

function detailsToFieldErrors(details: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (details && typeof details === "object") {
    for (const [k, v] of Object.entries(details as Record<string, unknown>)) {
      out[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
  }
  return out;
}

function messageOf(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "GENERATION_IN_PROGRESS")
      return "Идёт генерация — правки заблокированы до её завершения";
    if (err.code === "FORBIDDEN") return "Редактировать может только владелец синтеза";
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

const versionedType = (k: EditableKind): VersionedElementType => k;

/* ── Компонент ───────────────────────────────────────────────────────── */

export function ElementEditor({
  synthesisId,
  target,
  disabled = false,
  disabledReason,
  startInEditMode = false,
  lastColName,
  onSaved,
  onAutoRenamed,
  onRegenerateAffected,
  onClose,
  variant = "inline",
}: ElementEditorProps) {
  const [editing, setEditing] = useState(startInEditMode);
  const [draft, setDraft] = useState<Draft>(() => makeDraft(target));
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);
  const [renameResult, setRenameResult] = useState<AutoRenameResult | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  // Новый элемент (или обновлённый хозяином после PATCH) → свежий черновик
  useEffect(() => {
    setDraft(makeDraft(target));
    setFieldErrors({});
  }, [target]);

  const dirty = isDirty(draft);
  const title = KIND_TITLE[target.kind];
  const elementId = target.element.id;

  const currentData = useMemo(
    () => target.element as unknown as Record<string, unknown>,
    [target.element],
  );

  const cancel = useCallback(() => {
    setDraft(makeDraft(target));
    setFieldErrors({});
    setError(null);
    if (startInEditMode && onClose) onClose();
    else setEditing(false);
  }, [target, startInEditMode, onClose]);

  const save = useCallback(async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      let out: SaveOutcome;
      if (draft.kind === "category") {
        const body = categoryDiff(draft.base, draft.value);
        const res = await updateCategory(synthesisId, elementId, body);
        out = {
          kind: "category",
          element: res.category,
          impact: res.impact,
          version: res.version,
          htmlSync: res.htmlSync,
          renamed:
            body.name !== undefined && body.name !== draft.base.name
              ? { oldName: draft.base.name, newName: res.category.name }
              : undefined,
        };
      } else if (draft.kind === "thesis") {
        const res = await updateThesis(
          synthesisId,
          elementId,
          thesisDiff(draft.base, draft.value),
        );
        out = {
          kind: "thesis",
          element: res.thesis,
          impact: res.impact,
          version: res.version,
          htmlSync: res.htmlSync,
        };
      } else {
        const res = await updateGlossaryTerm(
          synthesisId,
          elementId,
          glossaryDiff(draft.base, draft.value),
        );
        out = {
          kind: "glossary_term",
          element: res.term,
          impact: res.impact,
          version: res.version,
          htmlSync: res.htmlSync,
        };
      }
      setOutcome(out);
      setRenameResult(null);
      setEditing(false);
      setHistoryKey((k) => k + 1);
      onSaved?.(out);
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_ERROR")
        setFieldErrors(detailsToFieldErrors(err.details));
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }, [saving, dirty, draft, synthesisId, elementId, onSaved]);

  const onRolledBack = useCallback(
    (res: RollbackResponse) => {
      const out: SaveOutcome = {
        kind: target.kind,
        element: res.element as Category | Thesis | GlossaryTerm,
        impact: res.impact,
        version: res.version,
        htmlSync: res.htmlSync,
      };
      setOutcome(out);
      setRenameResult(null);
      setHistoryKey((k) => k + 1);
      onSaved?.(out);
    },
    [target.kind, onSaved],
  );

  const doAutoRename = useCallback(async () => {
    if (!outcome?.renamed || renaming) return;
    setRenaming(true);
    setError(null);
    try {
      const res = await autoRename(synthesisId, outcome.renamed);
      setRenameResult(res);
      setHistoryKey((k) => k + 1);
      onAutoRenamed?.(res);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setRenaming(false);
    }
  }, [outcome, renaming, synthesisId, onAutoRenamed]);

  /* Разделы для «Перегенерировать затронутые»: затронутые impact'ом +
     раздел-хозяин, если правка до документа не дошла (pending/sectionMissing) */
  const regenTargets = useMemo(() => {
    if (!outcome) return [];
    const keys = new Set(outcome.impact.affectedSections);
    if (outcome.htmlSync.pending.length && !outcome.htmlSync.sectionMissing)
      keys.add(HOST_SECTION[outcome.kind]);
    return [...keys];
  }, [outcome]);

  /* ── Разметка ── */

  const form =
    draft.kind === "category" ? (
      <CategoryEditor
        value={draft.value}
        onChange={(v) => setDraft({ ...draft, value: v })}
        errors={fieldErrors}
        disabled={disabled || saving}
        lastColName={lastColName}
      />
    ) : draft.kind === "thesis" ? (
      <ThesisEditor
        value={draft.value}
        onChange={(v) => setDraft({ ...draft, value: v })}
        errors={fieldErrors}
        disabled={disabled || saving}
      />
    ) : (
      <GlossaryTermEditor
        value={draft.value}
        onChange={(v) => setDraft({ ...draft, value: v })}
        columnKeys={target.kind === "glossary_term" ? target.columnKeys : undefined}
        errors={fieldErrors}
        disabled={disabled || saving}
      />
    );

  const body = (
    <div data-element-editor={target.kind}>
      {variant === "inline" && (
        <div className="element-editor-head">
          <span className="form-section-title element-editor-title">
            {title}
            {target.kind === "thesis" ? ` №${target.element.thesisNum}` : ""}
          </span>
          {onClose && (
            <button
              type="button"
              className="raw-close"
              title="Закрыть"
              onClick={onClose}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {disabled && (
        <div className="callout note">
          <span className="callout-label">Правки заблокированы</span>
          {disabledReason ?? "Идёт генерация — дождитесь её завершения."}
        </div>
      )}

      {editing ? (
        <>
          {form}
          <div className="inline-edit-actions">
            <button
              type="button"
              className="action-btn primary"
              disabled={disabled || saving || !dirty}
              onClick={() => void save()}
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
            <button
              type="button"
              className="action-btn"
              disabled={saving}
              onClick={cancel}
            >
              Отмена
            </button>
            {dirty && <span className="inline-edit-dirty">есть несохранённые правки</span>}
          </div>
        </>
      ) : (
        <>
          <ElementSummary target={target} lastColName={lastColName} />
          <div className="inline-edit-actions">
            <button
              type="button"
              className="action-btn primary"
              disabled={disabled}
              onClick={() => {
                setOutcome(null);
                setRenameResult(null);
                setEditing(true);
              }}
            >
              ✎ Редактировать
            </button>
            <button
              type="button"
              className={"action-btn" + (historyOpen ? " active" : "")}
              onClick={() => setHistoryOpen((v) => !v)}
            >
              ◷ История версий
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="pool-status err" role="alert" style={{ marginTop: 6 }}>
          {error}
        </div>
      )}

      {outcome && (
        <ImpactPanel
          outcome={outcome}
          renameResult={renameResult}
          renaming={renaming}
          disabled={disabled}
          regenTargets={regenTargets}
          onRegenerate={() => onRegenerateAffected(regenTargets)}
          onAutoRename={() => void doAutoRename()}
          onDismiss={() => {
            setOutcome(null);
            setRenameResult(null);
          }}
        />
      )}

      {historyOpen && (
        <div style={{ marginTop: 12 }}>
          <VersionHistory
            synthesisId={synthesisId}
            elementType={versionedType(target.kind)}
            elementId={elementId}
            currentData={currentData}
            refreshKey={historyKey}
            disabled={disabled || saving || editing}
            onRolledBack={onRolledBack}
          />
        </div>
      )}
    </div>
  );

  if (variant === "modal") {
    return (
      <div
        className="edit-overlay visible element-editor-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
      >
        <div className="edit-modal" role="dialog" aria-label={title}>
          <div className="edit-modal-header">
            <div className="edit-modal-title">
              ✎ {title}
              {target.kind === "category" ? ` · ${target.element.name}` : ""}
            </div>
            <button type="button" className="raw-close" onClick={onClose} title="Закрыть">
              ✕
            </button>
          </div>
          <div className="edit-modal-body">{body}</div>
          <div className="edit-modal-footer">
            <button type="button" className="action-btn" onClick={onClose}>
              Закрыть
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <div className="inline-edit-form">{body}</div>;
}

/* ── Сводка полей в режиме просмотра ─────────────────────────────────── */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="element-summary-row">
      <span className="form-label">{label}</span>
      <span className="element-summary-value">{value || "—"}</span>
    </div>
  );
}

function ElementSummary({
  target,
  lastColName,
}: {
  target: EditableElement;
  lastColName: string | undefined;
}) {
  switch (target.kind) {
    case "category": {
      const c = target.element;
      return (
        <div className="element-summary">
          <Row label="Название" value={c.name} />
          <Row label="Тип" value={c.type} />
          <Row label="Определение" value={c.definition} />
          <Row label="Центральность" value={fmtNum(c.centrality)} />
          <Row label="Определённость" value={fmtNum(c.certainty)} />
          <Row label={lastColName ?? "Происхождение"} value={c.origin} />
        </div>
      );
    }
    case "thesis": {
      const t = target.element;
      const typeLabel =
        t.thesisType === "epistemological"
          ? "эпистемологический"
          : t.thesisType === "ethical"
            ? "этический"
            : "онтологический";
      return (
        <div className="element-summary">
          <Row label="Формулировка" value={t.formulation} />
          <Row label="Обоснование" value={t.justification} />
          <Row label="Тип тезиса" value={typeLabel} />
          <Row label="Степень новизны" value={t.noveltyDegree} />
          <Row label="Связанные категории" value={t.relatedCategories.join(", ")} />
        </div>
      );
    }
    case "glossary_term": {
      const g = target.element;
      return (
        <div className="element-summary">
          <Row label="Термин" value={g.term} />
          <Row label="Определение" value={g.definition} />
          {Object.entries(g.extraColumns).map(([k, v]) => (
            <Row key={k} label={k} value={v} />
          ))}
        </div>
      );
    }
  }
}

/* ── Блок анализа влияния + htmlSync ─────────────────────────────────── */

const SEVERITY_TEXT: Record<ImpactAnalysis["severity"], string> = {
  none: "Другие разделы на элемент не ссылаются — перегенерация не требуется.",
  low: "Затронуты только структурные зависимости (контекст разделов ниже по порядку).",
  high: "Имя элемента упомянуто в других разделах или тезисах — они ссылаются на прежнее состояние.",
};

function htmlSyncFieldLabel(f: string): string {
  const key = f.includes(".") ? f.slice(f.lastIndexOf(".") + 1) : f;
  return HTML_SYNC_FIELD_LABELS[key] ?? key;
}

function ImpactPanel({
  outcome,
  renameResult,
  renaming,
  disabled,
  regenTargets,
  onRegenerate,
  onAutoRename,
  onDismiss,
}: {
  outcome: SaveOutcome;
  renameResult: AutoRenameResult | null;
  renaming: boolean;
  disabled: boolean;
  regenTargets: string[];
  onRegenerate: () => void;
  onAutoRename: () => void;
  onDismiss: () => void;
}) {
  const { impact, htmlSync } = outcome;
  const sync: HtmlSyncInfo = htmlSync;
  return (
    <div className="cascade-panel visible" data-element-impact style={{ marginTop: 12 }}>
      <div className="cascade-title">Анализ влияния</div>
      <div className="cascade-desc">{SEVERITY_TEXT[impact.severity]}</div>

      {sync.rendered.length > 0 && (
        <div className="pool-status ok" style={{ marginBottom: 6 }}>
          ✓ Перерисовано в документе: {sync.rendered.join(", ")}
        </div>
      )}
      {sync.patched.length > 0 && (
        <div className="pool-status ok" style={{ marginBottom: 6 }}>
          ✓ Отражено точечной правкой абзаца:{" "}
          {sync.patched.map(htmlSyncFieldLabel).join(", ")}
        </div>
      )}
      {sync.pending.length > 0 && (
        <div className="callout warning" data-testid="html-sync-pending">
          <span className="callout-label">Не отражено в документе</span>
          Поля {sync.pending.map((f) => `«${htmlSyncFieldLabel(f)}»`).join(", ")} сохранены
          в данных, но в тексте раздела не обновлены — раздел «
          {labelOf(HOST_SECTION[outcome.kind])}» требует перегенерации.
        </div>
      )}
      {sync.sectionMissing && (
        <div className="callout warning" data-testid="html-sync-missing">
          <span className="callout-label">Раздела нет в документе</span>
          Раздел «{labelOf(HOST_SECTION[outcome.kind])}» отсутствует среди разделов
          синтеза — правка сохранена только в таблице данных.
        </div>
      )}

      {(impact.affectedSections.length > 0 ||
        impact.affectedSubsections.length > 0 ||
        impact.affectedModes.length > 0) && (
        <div className="sec-warnings" style={{ marginTop: 8 }}>
          {impact.affectedSections.map((k) => (
            <div className="sec-warning-item" key={`s:${k}`}>
              <span className="warn-icon">⚠</span>
              <span>Раздел «{labelOf(k)}» использует элемент как контекст</span>
            </div>
          ))}
          {impact.affectedSubsections.map((s) => (
            <div className="sec-warning-item" key={`ss:${s}`}>
              <span className="warn-icon">⚠</span>
              <span>Подраздел {s}</span>
            </div>
          ))}
          {impact.affectedModes.map((m) => (
            <div className="sec-warning-item" key={`m:${m.modeKey}:${m.index}`}>
              <span className="warn-icon">⚠</span>
              <span>Режим «{m.title}» (результат {m.index + 1})</span>
            </div>
          ))}
        </div>
      )}

      {renameResult && (
        <div className="pool-status ok" style={{ marginTop: 8 }}>
          ✓ Автозамена выполнена: разделов —{" "}
          {renameResult.affectedSections.map(labelOf).join(", ") || "нет"}; тезисов —{" "}
          {renameResult.affectedTheses}
        </div>
      )}

      <div className="actions-bar-btns" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="action-btn primary"
          disabled={disabled || regenTargets.length === 0}
          title={
            regenTargets.length
              ? "Составить план перегенерации: " + regenTargets.map(labelOf).join(", ")
              : "Затронутых разделов нет"
          }
          onClick={onRegenerate}
        >
          Перегенерировать затронутые
        </button>
        {outcome.renamed && (
          <button
            type="button"
            className="action-btn"
            disabled={disabled || renaming || !!renameResult}
            title={`«${outcome.renamed.oldName}» → «${outcome.renamed.newName}» во всех разделах и тезисах`}
            onClick={onAutoRename}
          >
            {renaming ? "Замена…" : "Автозамена имён"}
          </button>
        )}
        <button type="button" className="action-btn" onClick={onDismiss}>
          Ничего
        </button>
      </div>
    </div>
  );
}
