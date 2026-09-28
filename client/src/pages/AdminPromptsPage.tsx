/**
 * Админка Prompt Registry (беседа 6.2, запрос 1, п. 2; 03-spec §1.10
 * P1–P3, P5, §2.9). Полностью новый код — в исходнике промпты захардкожены.
 * Маршрут /admin/prompts под RequireAdmin (App.tsx, п. 5).
 *
 * Две вкладки:
 *  - «Шаблоны»: дерево ключей (группа = ключ без последнего сегмента:
 *    method.dialectical → graph/theses/…), поиск по подстроке ключа,
 *    фильтр activeOnly; редактор — textarea тела, счётчик и список
 *    плейсхолдеров {{…}} (.placeholder-chip), предпросмотр с тестовыми
 *    подстановками (SAMPLE_VALUES; неизвестные — сиреневые чипы без
 *    .filled), «Сохранить как черновик» (POST → новая неактивная версия)
 *    и «Активировать» (POST /activate; при несохранённых правках —
 *    «Сохранить и активировать»); история версий — список, diff двух
 *    версий (построчный, utils/text-diff), «Откатить» = активировать
 *    старую версию.
 *  - «Конфиги» (synthesis_configs): список ключей, JSON-редактор
 *    (.code-editor; валидация JSON.parse с текстом ошибки, .invalid),
 *    версии/diff/активация симметрично шаблонам.
 *
 *  - «Каталоги» (7.1, долг §12 5.4): типы категорий и связей из
 *    element-taxonomy — таблица (.data-table), системные только на
 *    чтение, пользовательские — правка nameRu/description/направления по
 *    месту и удаление (PATCH/DELETE §2.13; удаление отвязывает
 *    typeCatalogId у элементов, текст типа остаётся — unlinked в ответе).
 *
 *  - «Доступ» (8.1): поиск пользователей по email/имени (GET /auth/users),
 *    список с ролью, переключение роли с window.confirm (POST
 *    /auth/users/:id/role; свою роль менять нельзя — 409 SELF_ROLE_CHANGE,
 *    кнопка у себя не рисуется), последние 50 строк admin_audit (GET
 *    /auth/audit). Статус успеха ставится ПОСЛЕ перечитывания списка и
 *    журнала (грабля 6.2 п.7); клики тестов — через el.click().
 *
 * Тела версий: с 7.1 /versions отдаёт тела и value напрямую (обход 6.2
 * через listPrompts({prefix}) снят). Подсветка синтаксиса JSON —
 * без библиотеки (решение 6.2: .code-editor даёт раму и .invalid; тяжёлая
 * зависимость ради админской textarea не оправдана).
 *
 * Оформление — классы исходника (.input-form, .form-*, .action-btn,
 * .pool-status) + блоки 5–6 UI-кита (5 — с 5.2, 6 — перенесён этой
 * беседой в globals.css часть 3).
 */
import type { AdminAuditEntry, AdminUserRow, UserRole } from "@philosynth/shared/types/admin";
import type { PromptTemplate, SynthesisConfig } from "@philosynth/shared/types/prompts";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getAuditLog, listUsers, setUserRole } from "../api/admin";
import { ApiError } from "../api/client";
import {
  type CatalogType,
  type RelationshipDirection,
  type TaxonomyKind,
  deleteCustomType,
  getCategoryTypes,
  getRelationshipTypes,
  updateCustomType,
} from "../api/taxonomy";
import {
  activateConfigVersion,
  activateVersion,
  createVersion,
  getConfigVersionsFull,
  getTemplateVersions,
  listConfigs,
  listPrompts,
  updateConfig,
} from "../api/prompts";
import { useAuthStore } from "../stores/auth-store";
import { fmtDateShort } from "../utils/format";
import {
  extractPlaceholders,
  missingPlaceholders,
  previewParts,
} from "../utils/template-placeholders";
import { diffLines, diffStats } from "../utils/text-diff";
import { tl } from "@philosynth/shared/i18n/t";
import { tData } from "@philosynth/shared/i18n/data";

/* ── Общее ───────────────────────────────────────────────────────────── */

type StatusMsg = { text: string; kind: "ok" | "err" } | null;

function errText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "FORBIDDEN") return tl("adminPromptsPage.adminRequired", "Требуются права администратора");
    if (err.details && typeof err.details === "object") {
      const first = Object.values(err.details as Record<string, unknown>).find(
        (v) => typeof v === "string",
      );
      if (typeof first === "string") return `${err.message}: ${first}`;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : fallback;
}

function Status({ msg }: { msg: StatusMsg }) {
  if (!msg) return null;
  return (
    <div className={["pool-status", msg.kind].join(" ")} role={msg.kind === "err" ? "alert" : "status"}>
      {msg.text}
    </div>
  );
}

/** Группа дерева: ключ без последнего сегмента («system» → «system») */
export function keyGroup(key: string): string {
  const i = key.lastIndexOf(".");
  return i < 0 ? key : key.slice(0, i);
}

/** Группировка ключей в дерево: [группа, ключи[]] в алфавитном порядке */
export function groupKeys(keys: string[]): [string, string[]][] {
  const map = new Map<string, string[]>();
  for (const k of [...keys].sort()) {
    const g = keyGroup(k);
    const arr = map.get(g);
    if (arr) arr.push(k);
    else map.set(g, [k]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

interface KeyTreeProps {
  keys: string[];
  meta: (key: string) => string;
  selected: string | null;
  onSelect: (key: string) => void;
  testId: string;
}

function KeyTree({ keys, meta, selected, onSelect, testId }: KeyTreeProps) {
  const groups = useMemo(() => groupKeys(keys), [keys]);
  if (keys.length === 0) return <div className="data-table-empty">{tl("adminPromptsPage.noKeys", "ключей нет")}</div>;
  return (
    <div className="key-tree" data-testid={testId}>
      {groups.map(([group, items]) => (
        <div key={group}>
          <div className="key-tree-group">{group}</div>
          {items.map((k) => (
            <div
              key={k}
              className={["key-tree-item", k === selected ? "active" : ""].join(" ").trim()}
              onClick={() => onSelect(k)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(k);
              }}
              data-key={k}
            >
              <span>{k}</span>
              <span className="version-meta">{meta(k)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

interface VersionRow {
  version: number;
  isActive: boolean;
  description: string;
  createdAt: string;
  preview: string;
}

interface VersionListProps {
  versions: VersionRow[];
  selected: number | null;
  compareWith: number | null;
  onSelect: (v: number) => void;
  onCompare: (v: number | null) => void;
  onRollback: (v: number) => void;
  pending: boolean;
}

function VersionList({
  versions,
  selected,
  compareWith,
  onSelect,
  onCompare,
  onRollback,
  pending,
}: VersionListProps) {
  return (
    <div className="version-list" data-testid="version-list">
      {versions.map((v) => (
        <div
          key={v.version}
          className={[
            "version-item",
            v.isActive ? "current" : "",
            v.version === selected ? "selected" : "",
          ]
            .join(" ")
            .trim()}
          onClick={() => onSelect(v.version)}
          data-version={v.version}
        >
          <span className="version-num">{tl("adminPromptsPage.versionLabel", "v{version}", { version: v.version })}</span>
          <span className="version-preview" title={v.description || undefined}>
            {v.description ? `${v.description} — ` : ""}
            {v.preview}
          </span>
          <span className="version-meta" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {v.isActive ? tl("adminPromptsPage.activePrefix", "активна · ") : ""}
            {fmtDateShort(v.createdAt)}
            <button
              type="button"
              className={["action-btn", v.version === compareWith ? "active" : ""].join(" ").trim()}
              style={{ padding: "1px 6px" }}
              title={tl("adminPromptsPage.compareWithSelected", "Сравнить с выбранной версией")}
              onClick={(e) => {
                e.stopPropagation();
                onCompare(v.version === compareWith ? null : v.version);
              }}
              data-testid={`compare-v${v.version}`}
            >
              ⇄
            </button>
            {!v.isActive && (
              <button
                type="button"
                className="action-btn"
                style={{ padding: "1px 6px" }}
                disabled={pending}
                title={tl("adminPromptsPage.activateVersionHint", "Активировать эту версию (откат)")}
                onClick={(e) => {
                  e.stopPropagation();
                  onRollback(v.version);
                }}
                data-testid={`rollback-v${v.version}`}
              >
                {tl("adminPromptsPage.rollback", "Откатить")}
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function DiffView({ older, newer, olderLabel, newerLabel }: { older: string; newer: string; olderLabel: string; newerLabel: string }) {
  const lines = useMemo(() => diffLines(older, newer), [older, newer]);
  const stats = diffStats(lines);
  return (
    <div className="form-group full" data-testid="diff-view">
      <div className="form-label">
        {tl("adminPromptsPage.compare", "Сравнение: {olderLabel} → {newerLabel}", { olderLabel, newerLabel })}
        <span className="version-meta">
          (+{stats.added} / −{stats.removed})
        </span>
      </div>
      <div className="diff">
        {lines.map((l, i) => (
          <span key={i} className={`diff-line ${l.kind}`}>
            {l.text || " "}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Вкладка «Шаблоны» ───────────────────────────────────────────────── */

function bodyPreview(body: string): string {
  const s = body.replace(/\s+/g, " ").trim();
  return s.length > 80 ? `${s.slice(0, 79)}…` : s;
}

function TemplatesTab() {
  const [activeOnly, setActiveOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [templates, setTemplates] = useState<PromptTemplate[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [versions, setVersions] = useState<PromptTemplate[] | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [compareWith, setCompareWith] = useState<number | null>(null);
  const [body, setBody] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<StatusMsg>(null);

  const loadList = useCallback(async () => {
    try {
      setTemplates(await listPrompts({ activeOnly }));
    } catch (err) {
      setStatus({ text: errText(err, tl("adminPromptsPage.templatesLoadFailed", "Не удалось загрузить шаблоны")), kind: "err" });
    }
  }, [activeOnly]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  /** Уникальные ключи списка (при activeOnly=false один ключ — несколько строк) */
  const keys = useMemo(() => {
    const set = new Set<string>();
    for (const t of templates ?? []) set.add(t.key);
    const q = search.trim().toLowerCase();
    return [...set].filter((k) => !q || k.toLowerCase().includes(q));
  }, [templates, search]);

  const metaOf = useCallback(
    (key: string): string => {
      const rows = (templates ?? []).filter((t) => t.key === key);
      const active = rows.find((t) => t.isActive);
      const maxV = rows.reduce((m, t) => Math.max(m, t.version), 0);
      if (active) return maxV > active.version ? tl("adminPromptsPage.activeWithDraft", "v{version} · черновик v{maxV}", { version: active.version, maxV }) : `v${active.version}`;
      return rows.length ? tl("adminPromptsPage.noActive", "нет активной · v{maxV}", { maxV }) : "";
    },
    [templates],
  );

  const loadVersions = useCallback(async (key: string, preferVersion?: number) => {
    setVersions(null);
    try {
      const rows = await getTemplateVersions(key);
      setVersions(rows);
      const pick =
        rows.find((r) => r.version === preferVersion) ??
        rows.find((r) => r.isActive) ??
        rows[0] ??
        null;
      setSelectedVersion(pick?.version ?? null);
      setBody(pick?.body ?? "");
      setDescription("");
      setCompareWith(null);
    } catch (err) {
      setStatus({ text: errText(err, tl("adminPromptsPage.versionsLoadFailed", "Не удалось загрузить версии")), kind: "err" });
    }
  }, []);

  function selectKey(key: string): void {
    setSelectedKey(key);
    setStatus(null);
    void loadVersions(key);
  }

  const current = versions?.find((v) => v.version === selectedVersion) ?? null;
  const dirty = current !== null && body !== current.body;
  const placeholders = useMemo(() => extractPlaceholders(body), [body]);
  const missing = useMemo(() => missingPlaceholders(body), [body]);
  const preview = useMemo(() => previewParts(body), [body]);

  async function saveDraft(): Promise<PromptTemplate | null> {
    if (!selectedKey) return null;
    if (!body.trim()) {
      setStatus({ text: tl("adminPromptsPage.templateBodyEmpty", "Тело шаблона пусто"), kind: "err" });
      return null;
    }
    return createVersion(selectedKey, body, description.trim());
  }

  async function handleSaveDraft(): Promise<void> {
    if (!selectedKey) return;
    setPending(true);
    setStatus(null);
    try {
      const created = await saveDraft();
      await loadList();
      if (created) {
        await loadVersions(selectedKey, created.version);
        setStatus({ text: tl("adminPromptsPage.draftSaved", "Черновик сохранён как v{version} (не активен)", { version: created.version }), kind: "ok" });
      }
    } catch (err) {
      setStatus({ text: errText(err, tl("adminPromptsPage.draftSaveFailed", "Не удалось сохранить черновик")), kind: "err" });
    } finally {
      setPending(false);
    }
  }

  async function activate(version: number): Promise<void> {
    if (!selectedKey) return;
    const t = await activateVersion(selectedKey, version);
    await loadList();
    await loadVersions(selectedKey, t.version);
    setStatus({ text: tl("adminPromptsPage.templateActivated", "Версия v{version} шаблона «{key}» активирована; кэш реестра сброшен", { version: t.version, key: t.key }), kind: "ok" });
  }

  async function handleActivate(): Promise<void> {
    if (!selectedKey || selectedVersion === null) return;
    setPending(true);
    setStatus(null);
    try {
      if (dirty) {
        const created = await saveDraft();
        if (created) await activate(created.version);
      } else {
        await activate(selectedVersion);
      }
    } catch (err) {
      setStatus({ text: errText(err, tl("adminPromptsPage.activateFailed", "Не удалось активировать")) , kind: "err" });
    } finally {
      setPending(false);
    }
  }

  async function handleRollback(version: number): Promise<void> {
    if (!selectedKey) return;
    if (!window.confirm(tl("adminPromptsPage.confirmActivateTemplate", "Активировать версию v{version} шаблона «{selectedKey}»?", { version, selectedKey }))) return;
    setPending(true);
    setStatus(null);
    try {
      await activate(version);
    } catch (err) {
      setStatus({ text: errText(err, tl("adminPromptsPage.rollbackFailed", "Не удалось откатить")), kind: "err" });
    } finally {
      setPending(false);
    }
  }

  const compareRow = versions?.find((v) => v.version === compareWith) ?? null;

  return (
    <div className="form-grid" data-testid="templates-tab">
      {/* ── Левая колонка: дерево ── */}
      <div className="form-group">
        <div className="form-label">{tl("adminPromptsPage.templateKeys", "Ключи шаблонов")}</div>
        <input
          className="form-input"
          placeholder={tl("adminPromptsPage.searchKeyPlaceholder", "поиск по ключу…")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={tl("adminPromptsPage.searchKey", "Поиск по ключу")}
          data-testid="template-search"
        />
        <label className="form-sublabel" style={{ display: "flex", gap: 6, alignItems: "center", margin: "6px 0" }}>
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            data-testid="template-active-only"
          />
          {tl("adminPromptsPage.activeOnly", "только активные версии")}
        </label>
        {templates === null ? (
          <div className="pool-status">{tl("common.loading", "Загрузка…")}</div>
        ) : (
          <KeyTree keys={keys} meta={metaOf} selected={selectedKey} onSelect={selectKey} testId="template-tree" />
        )}
        <div className="version-meta" style={{ marginTop: 4 }}>
          {tl("adminPromptsPage.keysCount", "{keysCount} ключей", { keysCount: keys.length })}
        </div>
      </div>

      {/* ── Правая колонка: редактор ── */}
      <div className="form-group">
        {!selectedKey ? (
          <div className="data-table-empty">{tl("adminPromptsPage.chooseKeyLeft", "выберите ключ слева")}</div>
        ) : versions === null ? (
          <div className="pool-status">{tl("adminPromptsPage.loadingVersions", "Загрузка версий…")}</div>
        ) : (
          <>
            <div className="form-label">
              {selectedKey}{" "}
              <span className="version-meta">
                {current ? `v${current.version}${current.isActive ? tl("adminPromptsPage.activeSuffix", " · активна") : tl("adminPromptsPage.draftSuffix", " · черновик")}` : ""}
                {dirty ? tl("adminPromptsPage.modifiedSuffix", " · изменено") : ""}
              </span>
            </div>
            <textarea
              className="code-editor"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck={false}
              aria-label={tl("adminPromptsPage.templateBody", "Тело шаблона")}
              data-testid="template-body"
            />
            <div className={["code-status", missing.length ? "err" : "ok"].join(" ")} data-testid="placeholder-status">
              {placeholders.length === 0
                ? tl("adminPromptsPage.noPlaceholders", "плейсхолдеров нет")
                : tl("adminPromptsPage.placeholdersRecognized", "✓ плейсхолдеры распознаны: {placeholdersCount}{missingCount}", { placeholdersCount: placeholders.length, missingCount: missing.length ? tl("adminPromptsPage.withoutTestValue", " · без тестового значения: {missingCount}", { missingCount: missing.length }) : "" })}
            </div>
            {placeholders.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} data-testid="placeholder-chips">
                {placeholders.map((p) => (
                  <span key={p} className={["placeholder-chip", missing.includes(p) ? "" : "filled"].join(" ").trim()}>
                    {`{{${p}}}`}
                  </span>
                ))}
              </div>
            )}
            <input
              className="form-input"
              placeholder={tl("adminPromptsPage.versionDescriptionPlaceholder", "описание версии (необязательно)")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ marginTop: 8 }}
              aria-label={tl("adminPromptsPage.versionDescription", "Описание версии")}
              data-testid="template-description"
            />
            <div className="inline-edit-actions">
              <button type="button" className="action-btn" disabled={pending || !body.trim()} onClick={() => void handleSaveDraft()} data-testid="template-save-draft">
                {tl("adminPromptsPage.saveDraft", "Сохранить как черновик")}
              </button>
              <button
                type="button"
                className="action-btn primary"
                disabled={pending || !body.trim() || (!dirty && current?.isActive === true)}
                onClick={() => void handleActivate()}
                data-testid="template-activate"
              >
                {dirty ? tl("adminPromptsPage.saveAndActivate", "Сохранить и активировать") : tl("adminPromptsPage.activate", "Активировать")}
              </button>
              {dirty && <span className="inline-edit-dirty">{tl("adminPromptsPage.notSaved", "не сохранено")}</span>}
            </div>

            <div className="form-label" style={{ marginTop: 12 }}>
              {tl("adminPromptsPage.previewTestValues", "Предпросмотр (тестовые значения)")}
            </div>
            <div className="doc-content" style={{ fontSize: 12, whiteSpace: "pre-wrap", border: "1px solid var(--rule)", padding: "8px 12px", background: "var(--white)" }} data-testid="template-preview">
              {preview.map((p, i) =>
                p.kind === "text" ? (
                  <span key={i}>{p.text}</span>
                ) : (
                  <span key={i} className={["placeholder-chip", p.kind === "filled" ? "filled" : ""].join(" ").trim()} title={p.name}>
                    {p.text}
                  </span>
                ),
              )}
            </div>

            <div className="form-label" style={{ marginTop: 12 }}>
              {tl("adminPromptsPage.versions", "Версии")}
            </div>
            <VersionList
              versions={versions.map((v) => ({
                version: v.version,
                isActive: v.isActive,
                description: v.description,
                createdAt: v.createdAt,
                preview: bodyPreview(v.body),
              }))}
              selected={selectedVersion}
              compareWith={compareWith}
              onSelect={(v) => {
                if (dirty && !window.confirm(tl("adminPromptsPage.unsavedLost", "Несохранённые правки будут потеряны. Перейти к версии?"))) return;
                const row = versions.find((r) => r.version === v);
                setSelectedVersion(v);
                setBody(row?.body ?? "");
              }}
              onCompare={setCompareWith}
              onRollback={(v) => void handleRollback(v)}
              pending={pending}
            />
            {compareRow && current && compareRow.version !== current.version && (
              <DiffView
                older={compareRow.version < current.version ? compareRow.body : current.body}
                newer={compareRow.version < current.version ? current.body : compareRow.body}
                olderLabel={`v${Math.min(compareRow.version, current.version)}`}
                newerLabel={`v${Math.max(compareRow.version, current.version)}`}
              />
            )}
            {compareRow && current && compareRow.version === current.version && (
              <div className="pool-status">{tl("adminPromptsPage.chooseOtherVersion", "Для сравнения выберите другую версию (⇄)")}</div>
            )}
          </>
        )}
        <Status msg={status} />
      </div>
    </div>
  );
}

/* ── Вкладка «Конфиги» ───────────────────────────────────────────────── */

export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "";
}

/** Позиция → «строка N, столбец M» */
function lineCol(text: string, pos: number): string {
  const before = text.slice(0, Math.max(0, pos));
  const line = before.split("\n").length;
  const col = pos - before.lastIndexOf("\n");
  return tl("adminPromptsPage.lineColumn", "строка {line}, столбец {col}", { line, col });
}

/**
 * Результат проверки JSON: значение либо текст ошибки с позицией.
 * V8 до 2023 писал «… at position N», новые Chrome/Node — «Unexpected
 * token ',', ..."фрагмент"... is not valid JSON» без позиции: тогда
 * фрагмент ищется в тексте, и позиция — его начало (+ смещение первого
 * вхождения токена внутри фрагмента).
 */
export function validateJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (!text.trim()) return { ok: false, error: tl("adminPromptsPage.emptyJson", "пустой JSON") };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const short = raw.replace(/^JSON\.parse:\s*/i, "").replace(/\s*is not valid JSON$/i, "");
    const lc = /\(line (\d+) column (\d+)\)/i.exec(raw);
    if (lc) {
      return { ok: false, error: tl("adminPromptsPage.jsonErrorAt", "{message} (строка {line}, столбец {column})", { message: short.replace(/\s*\(line \d+ column \d+\)/i, ""), line: lc[1], column: lc[2] }) };
    }
    const posMatch = /position (\d+)/i.exec(raw);
    if (posMatch) {
      return { ok: false, error: `${short} (${lineCol(text, Number(posMatch[1]))})` };
    }
    const snippet = /\.\.\."([^"]*)"|"([^"]*)"\.\.\./.exec(raw);
    const frag = snippet?.[1] ?? snippet?.[2];
    if (frag) {
      const start = text.indexOf(frag);
      if (start >= 0) {
        const tok = /Unexpected token '(.)'/.exec(raw)?.[1];
        const inner = tok ? frag.indexOf(tok) : -1;
        return { ok: false, error: `${short.replace(/,\s*\.\.\..*$/, "")} (${lineCol(text, start + Math.max(0, inner))})` };
      }
    }
    return { ok: false, error: short };
  }
}

function ConfigsTab() {
  const [configs, setConfigs] = useState<SynthesisConfig[] | null>(null);
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [versions, setVersions] = useState<SynthesisConfig[] | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [compareWith, setCompareWith] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<StatusMsg>(null);

  const loadList = useCallback(async () => {
    try {
      setConfigs(await listConfigs(true));
    } catch (err) {
      setStatus({ text: errText(err, tl("adminPromptsPage.configsLoadFailed", "Не удалось загрузить конфиги")), kind: "err" });
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const keys = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...new Set((configs ?? []).map((c) => c.key))].filter((k) => !q || k.toLowerCase().includes(q));
  }, [configs, search]);

  const metaOf = useCallback(
    (key: string): string => {
      const c = (configs ?? []).find((x) => x.key === key && x.isActive);
      return c ? `v${c.version}` : "";
    },
    [configs],
  );

  const loadVersions = useCallback(async (key: string, preferVersion?: number) => {
    setVersions(null);
    try {
      const rows = await getConfigVersionsFull(key);
      setVersions(rows);
      const pick = rows.find((r) => r.version === preferVersion) ?? rows.find((r) => r.isActive) ?? rows[0] ?? null;
      setSelectedVersion(pick?.version ?? null);
      setText(pick ? prettyJson(pick.value) : "");
      setDescription("");
      setCompareWith(null);
    } catch (err) {
      setStatus({ text: errText(err, tl("adminPromptsPage.versionsLoadFailed", "Не удалось загрузить версии")), kind: "err" });
    }
  }, []);

  function selectKey(key: string): void {
    setSelectedKey(key);
    setStatus(null);
    void loadVersions(key);
  }

  const current = versions?.find((v) => v.version === selectedVersion) ?? null;
  const parsed = useMemo(() => validateJson(text), [text]);
  const dirty = current !== null && (!parsed.ok || prettyJson(parsed.value) !== prettyJson(current.value));

  async function saveDraft(): Promise<SynthesisConfig | null> {
    if (!selectedKey) return null;
    if (!parsed.ok) {
      setStatus({ text: tl("adminPromptsPage.jsonInvalid", "JSON невалиден: {error}", { error: parsed.error }), kind: "err" });
      return null;
    }
    return updateConfig(selectedKey, parsed.value, description.trim());
  }

  async function handleSaveDraft(): Promise<void> {
    if (!selectedKey) return;
    setPending(true);
    setStatus(null);
    try {
      const created = await saveDraft();
      await loadList();
      if (created) {
        await loadVersions(selectedKey, created.version);
        setStatus({ text: tl("adminPromptsPage.draftSaved", "Черновик сохранён как v{version} (не активен)", { version: created.version }), kind: "ok" });
      }
    } catch (err) {
      setStatus({ text: errText(err, tl("adminPromptsPage.draftSaveFailed", "Не удалось сохранить черновик")), kind: "err" });
    } finally {
      setPending(false);
    }
  }

  async function activate(version: number): Promise<void> {
    if (!selectedKey) return;
    const c = await activateConfigVersion(selectedKey, version);
    await loadList();
    await loadVersions(selectedKey, c.version);
    setStatus({ text: tl("adminPromptsPage.configActivated", "Версия v{version} конфига «{key}» активирована; кэш сброшен", { version: c.version, key: c.key }), kind: "ok" });
  }

  async function handleActivate(): Promise<void> {
    if (!selectedKey || selectedVersion === null) return;
    setPending(true);
    setStatus(null);
    try {
      if (dirty) {
        const created = await saveDraft();
        if (created) await activate(created.version);
      } else {
        await activate(selectedVersion);
      }
    } catch (err) {
      setStatus({ text: errText(err, tl("adminPromptsPage.activateFailed", "Не удалось активировать")), kind: "err" });
    } finally {
      setPending(false);
    }
  }

  async function handleRollback(version: number): Promise<void> {
    if (!selectedKey) return;
    if (!window.confirm(tl("adminPromptsPage.confirmActivateConfig", "Активировать версию v{version} конфига «{selectedKey}»?", { version, selectedKey }))) return;
    setPending(true);
    setStatus(null);
    try {
      await activate(version);
    } catch (err) {
      setStatus({ text: errText(err, tl("adminPromptsPage.rollbackFailed", "Не удалось откатить")), kind: "err" });
    } finally {
      setPending(false);
    }
  }

  const compareRow = versions?.find((v) => v.version === compareWith) ?? null;

  return (
    <div className="form-grid" data-testid="configs-tab">
      <div className="form-group">
        <div className="form-label">{tl("adminPromptsPage.configKeys", "Ключи конфигов")}</div>
        <input
          className="form-input"
          placeholder={tl("adminPromptsPage.searchKeyPlaceholder", "поиск по ключу…")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={tl("adminPromptsPage.searchConfigKey", "Поиск по ключу конфига")}
          data-testid="config-search"
        />
        {configs === null ? (
          <div className="pool-status" style={{ marginTop: 8 }}>
            {tl("common.loading", "Загрузка…")}
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <KeyTree keys={keys} meta={metaOf} selected={selectedKey} onSelect={selectKey} testId="config-tree" />
          </div>
        )}
      </div>

      <div className="form-group">
        {!selectedKey ? (
          <div className="data-table-empty">{tl("adminPromptsPage.chooseConfigLeft", "выберите конфиг слева")}</div>
        ) : versions === null ? (
          <div className="pool-status">{tl("adminPromptsPage.loadingVersions", "Загрузка версий…")}</div>
        ) : (
          <>
            <div className="form-label">
              {selectedKey}{" "}
              <span className="version-meta">
                {current ? `v${current.version}${current.isActive ? tl("adminPromptsPage.activeSuffix", " · активна") : tl("adminPromptsPage.draftSuffix", " · черновик")}` : ""}
                {dirty ? tl("adminPromptsPage.modifiedSuffix", " · изменено") : ""}
              </span>
            </div>
            <textarea
              className={["code-editor", parsed.ok ? "" : "invalid"].join(" ").trim()}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              aria-label={tl("adminPromptsPage.configJson", "JSON конфига")}
              data-testid="config-json"
            />
            <div className={["code-status", parsed.ok ? "ok" : "err"].join(" ")} data-testid="config-json-status">
              {parsed.ok ? tl("adminPromptsPage.jsonValid", "✓ JSON валиден") : `✗ JSON: ${parsed.error}`}
            </div>
            <input
              className="form-input"
              placeholder={tl("adminPromptsPage.versionDescriptionPlaceholder", "описание версии (необязательно)")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ marginTop: 8 }}
              aria-label={tl("adminPromptsPage.configVersionDescription", "Описание версии конфига")}
              data-testid="config-description"
            />
            <div className="inline-edit-actions">
              <button type="button" className="action-btn" disabled={pending || !parsed.ok} onClick={() => void handleSaveDraft()} data-testid="config-save-draft">
                {tl("adminPromptsPage.saveDraft", "Сохранить как черновик")}
              </button>
              <button
                type="button"
                className="action-btn primary"
                disabled={pending || !parsed.ok || (!dirty && current?.isActive === true)}
                onClick={() => void handleActivate()}
                data-testid="config-activate"
              >
                {dirty ? tl("adminPromptsPage.saveAndActivate", "Сохранить и активировать") : tl("adminPromptsPage.activate", "Активировать")}
              </button>
              <button type="button" className="action-btn" disabled={!parsed.ok} onClick={() => parsed.ok && setText(prettyJson(parsed.value))}>
                {tl("adminPromptsPage.format", "Форматировать")}
              </button>
              {dirty && <span className="inline-edit-dirty">{tl("adminPromptsPage.notSaved", "не сохранено")}</span>}
            </div>

            <div className="form-label" style={{ marginTop: 12 }}>
              {tl("adminPromptsPage.versions", "Версии")}
            </div>
            <VersionList
              versions={versions.map((v) => ({
                version: v.version,
                isActive: v.isActive,
                description: v.description,
                createdAt: v.createdAt,
                preview: bodyPreview(JSON.stringify(v.value) ?? ""),
              }))}
              selected={selectedVersion}
              compareWith={compareWith}
              onSelect={(v) => {
                if (dirty && !window.confirm(tl("adminPromptsPage.unsavedLost", "Несохранённые правки будут потеряны. Перейти к версии?"))) return;
                const row = versions.find((r) => r.version === v);
                setSelectedVersion(v);
                setText(row ? prettyJson(row.value) : "");
              }}
              onCompare={setCompareWith}
              onRollback={(v) => void handleRollback(v)}
              pending={pending}
            />
            {compareRow && current && compareRow.version !== current.version && (
              <DiffView
                older={prettyJson(compareRow.version < current.version ? compareRow.value : current.value)}
                newer={prettyJson(compareRow.version < current.version ? current.value : compareRow.value)}
                olderLabel={`v${Math.min(compareRow.version, current.version)}`}
                newerLabel={`v${Math.max(compareRow.version, current.version)}`}
              />
            )}
          </>
        )}
        <Status msg={status} />
      </div>
    </div>
  );
}

/* ── Вкладка «Каталоги» (7.1) ────────────────────────────────────────── */

const DIRECTIONS: RelationshipDirection[] = ["unidirectional", "bidirectional", "reflexive"];
const DIRECTION_LABELS = (): Record<RelationshipDirection, string> => ({
  unidirectional: tl("common.directionOneWay", "однонаправленная"),
  bidirectional: tl("common.directionTwoWay", "двунаправленная"),
  reflexive: tl("common.directionReflexive", "рефлексивная"),
});

function directionOf(t: CatalogType): RelationshipDirection | null {
  const d = (t as { defaultDirection?: string }).defaultDirection;
  return d && (DIRECTIONS as string[]).includes(d) ? (d as RelationshipDirection) : null;
}

/** Класс строки-бейджа происхождения типа (литералы — вне JSX, см. tabClass) */
function originClass(system: boolean): string {
  return system ? "cert-badge" : "cert-badge gold";
}

interface CatalogEditState {
  id: string;
  nameRu: string;
  description: string;
  defaultDirection: RelationshipDirection | null;
}

function CatalogTable({ kind }: { kind: TaxonomyKind }) {
  const [rows, setRows] = useState<CatalogType[] | null>(null);
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<CatalogEditState | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<StatusMsg>(null);
  const isRel = kind === "relationship";

  const load = useCallback(async () => {
    try {
      setRows(isRel ? await getRelationshipTypes() : await getCategoryTypes());
    } catch (err) {
      setStatus({ text: errText(err, tl("adminPromptsPage.catalogLoadFailed", "Не удалось загрузить каталог")), kind: "err" });
    }
  }, [isRel]);

  useEffect(() => {
    setEdit(null);
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter(
      (t) => !q || t.key.toLowerCase().includes(q) || t.nameRu.toLowerCase().includes(q),
    );
  }, [rows, search]);

  function startEdit(t: CatalogType): void {
    setStatus(null);
    setEdit({ id: t.id, nameRu: t.nameRu, description: t.description, defaultDirection: directionOf(t) });
  }

  async function saveEdit(): Promise<void> {
    if (!edit) return;
    if (!edit.nameRu.trim()) {
      setStatus({ text: tl("adminPromptsPage.russianNameRequired", "Русское название типа обязательно"), kind: "err" });
      return;
    }
    setPending(true);
    setStatus(null);
    try {
      const t = await updateCustomType(kind, edit.id, {
        nameRu: edit.nameRu.trim(),
        description: edit.description.trim(),
        ...(isRel && edit.defaultDirection ? { defaultDirection: edit.defaultDirection } : {}),
      });
      await load();
      setEdit(null);
      setStatus({ text: tl("adminPromptsPage.typeSaved", "Тип «{key}» сохранён; кэш каталога сброшен", { key: t.key }), kind: "ok" });
    } catch (err) {
      setStatus({ text: errText(err, tl("adminPromptsPage.typeSaveFailed", "Не удалось сохранить тип")), kind: "err" });
    } finally {
      setPending(false);
    }
  }

  async function remove(t: CatalogType): Promise<void> {
    if (
      !window.confirm(
        tl("adminPromptsPage.confirmDeleteType", "Удалить тип «{key}» ({nameRu})? Ссылающиеся {isRel} сохранят текст типа, но потеряют привязку к каталогу.", { key: t.key, nameRu: t.nameRu, isRel: isRel ? tl("adminPromptsPage.edgesWord", "связи") : tl("adminPromptsPage.categoriesWord", "категории") }),
      )
    )
      return;
    setPending(true);
    setStatus(null);
    try {
      const r = await deleteCustomType(kind, t.id);
      await load();
      if (edit?.id === t.id) setEdit(null);
      setStatus({
        text: tl("adminPromptsPage.typeDeleted", "Тип «{key}» удалён; отвязано {isRel}: {unlinked}", { key: t.key, isRel: isRel ? tl("adminPromptsPage.edgesGen", "связей") : tl("adminPromptsPage.categoriesGen", "категорий"), unlinked: r.unlinked }),
        kind: "ok",
      });
    } catch (err) {
      setStatus({ text: errText(err, tl("adminPromptsPage.typeDeleteFailed", "Не удалось удалить тип")), kind: "err" });
    } finally {
      setPending(false);
    }
  }

  const testId = isRel ? "catalog-relationship" : "catalog-category";

  return (
    <div className="data-table-wrap" data-testid={testId}>
      <div className="data-table-toolbar">
        <input
          className="form-input"
          placeholder={tl("adminPromptsPage.searchCatalogPlaceholder", "поиск по ключу или названию…")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={tl("adminPromptsPage.searchCatalog", "Поиск по каталогу")}
          data-testid={`${testId}-search`}
        />
        <span className="form-sublabel">
          {rows ? tl("adminPromptsPage.typesCount", "{rowsCount} типов, системных: {isSystemCount}", { rowsCount: rows.length, isSystemCount: rows.filter((t) => t.isSystem).length }) : ""}
        </span>
      </div>
      {status && (
        <div className={status.kind === "ok" ? "pool-status ok" : "pool-status err"} data-testid={`${testId}-status`}>
          {status.text}
        </div>
      )}
      {rows === null ? (
        <div className="pool-status">{tl("common.loading", "Загрузка…")}</div>
      ) : visible.length === 0 ? (
        <div className="data-table-empty">{tl("adminPromptsPage.noTypes", "типов нет")}</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{tl("adminPromptsPage.key", "Ключ")}</th>
              <th>{tl("common.title", "Название")}</th>
              <th>{tl("common.description", "Описание")}</th>
              {isRel && <th>{tl("common.direction", "Направление")}</th>}
              <th>{tl("common.origin", "Происхождение")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((t) =>
              edit && edit.id === t.id ? (
                <tr key={t.id} data-testid={`${testId}-row-${t.key}`} data-editing="true">
                  <td>
                    <code>{t.key}</code>
                  </td>
                  <td>
                    <input
                      className="form-input"
                      value={edit.nameRu}
                      onChange={(e) => setEdit({ ...edit, nameRu: e.target.value })}
                      aria-label={tl("adminPromptsPage.typeName", "Название типа")}
                      data-testid={`${testId}-edit-name`}
                    />
                  </td>
                  <td>
                    <input
                      className="form-input"
                      value={edit.description}
                      onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                      aria-label={tl("adminPromptsPage.typeDescription", "Описание типа")}
                      data-testid={`${testId}-edit-description`}
                    />
                  </td>
                  {isRel && (
                    <td>
                      <select
                        className="form-select"
                        value={edit.defaultDirection ?? "unidirectional"}
                        onChange={(e) =>
                          setEdit({ ...edit, defaultDirection: e.target.value as RelationshipDirection })
                        }
                        aria-label={tl("adminPromptsPage.defaultDirection", "Направление по умолчанию")}
                        data-testid={`${testId}-edit-direction`}
                      >
                        {DIRECTIONS.map((d) => (
                          <option key={d} value={d}>
                            {DIRECTION_LABELS()[d]}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td>
                    <span className={originClass(t.isSystem)}>{t.isSystem ? tl("adminPromptsPage.system", "системный") : tl("adminPromptsPage.custom", "пользовательский")}</span>
                  </td>
                  <td className="num">
                    <button
                      type="button"
                      className="action-btn primary"
                      disabled={pending}
                      onClick={() => void saveEdit()}
                      data-testid={`${testId}-edit-save`}
                    >
                      {tl("common.save", "Сохранить")}
                    </button>{" "}
                    <button type="button" className="action-btn" disabled={pending} onClick={() => setEdit(null)}>
                      {tl("common.cancel", "Отмена")}
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={t.id} data-testid={`${testId}-row-${t.key}`}>
                  <td>
                    <code>{t.key}</code>
                  </td>
                  <td>{t.isSystem ? tData(t.nameRu) : t.nameRu}</td>
                  <td>{t.isSystem ? tData(t.description) : t.description}</td>
                  {isRel && <td>{(() => { const d = directionOf(t); return d ? DIRECTION_LABELS()[d] : ""; })()}</td>}
                  <td>
                    <span className={originClass(t.isSystem)}>{t.isSystem ? tl("adminPromptsPage.system", "системный") : tl("adminPromptsPage.custom", "пользовательский")}</span>
                  </td>
                  <td className="num">
                    {!t.isSystem && (
                      <>
                        <button
                          type="button"
                          className="action-btn"
                          disabled={pending}
                          onClick={() => startEdit(t)}
                          data-testid={`${testId}-edit-${t.key}`}
                        >
                          {tl("adminPromptsPage.editIcon", "✎ Изменить")}
                        </button>{" "}
                        <button
                          type="button"
                          className="action-btn"
                          disabled={pending}
                          onClick={() => void remove(t)}
                          data-testid={`${testId}-delete-${t.key}`}
                        >
                          {tl("adminPromptsPage.deleteIcon", "✕ Удалить")}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CatalogsTab() {
  return (
    <div className="form-grid" data-testid="catalogs-tab">
      <div className="form-group full">
        <div className="form-label">{tl("adminPromptsPage.categoryTypes", "Типы категорий")}</div>
        <div className="form-sublabel">
          {tl("adminPromptsPage.typesNote", "Системные типы (посев 0.3b) неизменяемы; пользовательские — созданные из TaxonomySelector — можно переименовать или удалить. Ключ типа не меняется: на него завязаны алиасы нормализации.")}
        </div>
        <CatalogTable kind="category" />
      </div>
      <div className="form-group full">
        <div className="form-label">{tl("adminPromptsPage.edgeTypes", "Типы связей")}</div>
        <CatalogTable kind="relationship" />
      </div>
    </div>
  );
}

/* ── Вкладка «Доступ» (8.1) ──────────────────────────────────────────── */

const AUDIT_LIMIT = 50;
const USERS_PAGE = 50;

const ROLE_LABELS = (): Record<UserRole, string> => ({ user: tl("adminPromptsPage.roleUser", "пользователь"), admin: tl("adminPromptsPage.roleAdmin", "администратор") });

const ACTION_LABELS = (): Record<string, string> => ({
  "prompt.version.created": tl("adminPromptsPage.auditTemplateCreated", "версия шаблона создана"),
  "prompt.version.activated": tl("adminPromptsPage.auditTemplateActivated", "версия шаблона активирована"),
  "config.version.created": tl("adminPromptsPage.auditConfigCreated", "версия конфига создана"),
  "config.version.activated": tl("adminPromptsPage.auditConfigActivated", "версия конфига активирована"),
  "taxonomy.type.updated": tl("adminPromptsPage.auditTypeChanged", "тип каталога изменён"),
  "taxonomy.type.deleted": tl("adminPromptsPage.auditTypeDeleted", "тип каталога удалён"),
  "user.role.changed": tl("adminPromptsPage.auditRoleChanged", "роль изменена"),
  "user.bootstrapped": tl("adminPromptsPage.auditFirstAdmin", "первый администратор заведён"),
  "account.deleted": tl("adminPromptsPage.auditAccountDeleted", "аккаунт удалён"),
});

/** Класс бейджа роли (литералы вне JSX — css-parity-audit) */
function roleClass(role: UserRole): string {
  return role === "admin" ? "cert-badge gold" : "cert-badge";
}

function auditDetails(e: AdminAuditEntry): string {
  const d = e.details ?? {};
  const parts: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === null || v === undefined) continue;
    parts.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  return parts.join(" · ");
}

function actorLabel(e: AdminAuditEntry): string {
  if (!e.actorId) return tl("adminPromptsPage.accountDeletedDash", "— (аккаунт удалён)");
  return e.actorEmail ?? e.actorId.slice(0, 8) + "…";
}

function AccessTab() {
  const me = useAuthStore((s) => s.user);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [audit, setAudit] = useState<AdminAuditEntry[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMsg>(null);

  const loadUsers = useCallback(async (q: string) => {
    const r = await listUsers({ query: q, limit: USERS_PAGE });
    setUsers(r.users);
    setTotal(r.total);
  }, []);
  const loadAudit = useCallback(async () => {
    setAudit(await getAuditLog(AUDIT_LIMIT));
  }, []);

  // Поиск — с задержкой 300 мс, чтобы не бить API каждой буквой
  useEffect(() => {
    const q = search.trim();
    const t = setTimeout(() => {
      loadUsers(q).catch((err) =>
        setStatus({ text: errText(err, tl("adminPromptsPage.usersLoadFailed", "Не удалось загрузить пользователей")), kind: "err" }),
      );
    }, 300);
    return () => clearTimeout(t);
  }, [search, loadUsers]);

  useEffect(() => {
    loadAudit().catch((err) =>
      setStatus({ text: errText(err, tl("adminPromptsPage.auditLoadFailed", "Не удалось загрузить журнал")), kind: "err" }),
    );
  }, [loadAudit]);

  async function toggleRole(u: AdminUserRow): Promise<void> {
    const to: UserRole = u.role === "admin" ? "user" : "admin";
    const verb = to === "admin" ? tl("adminPromptsPage.makeAdmin", "Назначить администратором") : tl("adminPromptsPage.revokeAdminFrom", "Снять права администратора у");
    if (
      !window.confirm(
        `${verb} ${u.email}? ${
          to === "admin"
            ? tl("adminPromptsPage.adminNote", "Администратор правит шаблоны промптов — активированная версия меняет генерацию у всех.")
            : tl("adminPromptsPage.revokeNote", "Пользователь потеряет доступ к админке; синтезы и баланс не затрагиваются.")
        }`,
      )
    )
      return;
    setPending(u.id);
    setStatus(null);
    try {
      const r = await setUserRole(u.id, to);
      // Статус — ПОСЛЕ перечитывания (грабля 6.2 п.7)
      await Promise.all([loadUsers(search.trim()), loadAudit()]);
      setStatus({
        text: r.changed
          ? tl("adminPromptsPage.roleNow", "{email}: роль теперь «{role}»", { email: r.user.email, role: ROLE_LABELS()[r.user.role] })
          : tl("adminPromptsPage.roleAlready", "{email}: роль уже была «{role}»", { email: r.user.email, role: ROLE_LABELS()[r.user.role] }),
        kind: "ok",
      });
    } catch (err) {
      setStatus({ text: errText(err, tl("adminPromptsPage.roleChangeFailed", "Не удалось изменить роль")), kind: "err" });
    } finally {
      setPending(null);
    }
  }

  const admins = (users ?? []).filter((u) => u.role === "admin").length;

  return (
    <div className="form-grid" data-testid="access-tab">
      <div className="form-group full">
        <div className="form-label">{tl("adminPromptsPage.usersAndRoles", "Пользователи и роли")}</div>
        <div className="form-sublabel">
          {tl("adminPromptsPage.rolesNote", "Ролей две: пользователь и администратор. Свою роль изменить нельзя — единственный администратор не может понизить сам себя; последнего администратора не понизит никто. Первый администратор заводится только скриптом")} <code>{tl("adminPromptsPage.seedAdminCommand", "npm run seed:admin")}</code>.
        </div>
        <div className="data-table-wrap" data-testid="access-users">
          <div className="data-table-toolbar">
            <input
              className="form-input"
              placeholder={tl("adminPromptsPage.searchUsersPlaceholder", "поиск по email или имени…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={tl("adminPromptsPage.searchUsers", "Поиск пользователей")}
              data-testid="access-search"
            />
            <span className="form-sublabel" data-testid="access-users-count">
              {users ? tl("adminPromptsPage.shownOf", "показано {usersCount} из {total}, администраторов в выдаче: {admins}", { usersCount: users.length, total, admins }) : ""}
            </span>
          </div>
          {status && (
            <div
              className={status.kind === "ok" ? "pool-status ok" : "pool-status err"}
              role={status.kind === "err" ? "alert" : "status"}
              data-testid="access-status"
            >
              {status.text}
            </div>
          )}
          {users === null ? (
            <div className="pool-status">{tl("common.loading", "Загрузка…")}</div>
          ) : users.length === 0 ? (
            <div className="data-table-empty">{tl("adminPromptsPage.noUsers", "пользователей нет")}</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tl("common.email", "Email")}</th>
                  <th>{tl("adminPromptsPage.name", "Имя")}</th>
                  <th>{tl("adminPromptsPage.role", "Роль")}</th>
                  <th>{tl("adminPromptsPage.registered", "Зарегистрирован")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isMe = me?.id === u.id;
                  return (
                    <tr key={u.id} data-testid={`access-row-${u.email}`} data-role={u.role}>
                      <td>
                        <code>{u.email}</code>
                        {isMe && <span className="form-sublabel"> {tl("adminPromptsPage.you", "(вы)")}</span>}
                      </td>
                      <td>{u.displayName ?? ""}</td>
                      <td>
                        <span className={roleClass(u.role)}>{ROLE_LABELS()[u.role]}</span>
                      </td>
                      <td>{fmtDateShort(u.createdAt)}</td>
                      <td className="num">
                        {!isMe && (
                          <button
                            type="button"
                            className="action-btn"
                            disabled={pending !== null}
                            onClick={() => void toggleRole(u)}
                            data-testid={`access-toggle-${u.email}`}
                          >
                            {u.role === "admin" ? tl("adminPromptsPage.revoke", "↓ Снять права") : tl("adminPromptsPage.makeAdminIcon", "↑ Назначить администратором")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="form-group full">
        <div className="form-label">{tl("adminPromptsPage.auditLog", "Журнал действий")}</div>
        <div className="form-sublabel">
          {tl("adminPromptsPage.auditNote", "Последние {limit} строк admin_audit: версии шаблонов и конфигов, правки каталогов, смены ролей, удаления аккаунтов. Строка пишется той же транзакцией, что и действие.", { limit: AUDIT_LIMIT })}
        </div>
        <div className="data-table-wrap" data-testid="access-audit">
          {audit === null ? (
            <div className="pool-status">{tl("common.loading", "Загрузка…")}</div>
          ) : audit.length === 0 ? (
            <div className="data-table-empty">{tl("adminPromptsPage.auditEmpty", "журнал пуст")}</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tl("adminPromptsPage.when", "Когда")}</th>
                  <th>{tl("adminPromptsPage.who", "Кто")}</th>
                  <th>{tl("adminPromptsPage.action", "Действие")}</th>
                  <th>{tl("adminPromptsPage.target", "Цель")}</th>
                  <th>{tl("adminPromptsPage.details", "Подробности")}</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((e) => (
                  <tr key={e.id} data-testid="access-audit-row" data-action={e.action}>
                    <td>{fmtDateShort(e.createdAt)}</td>
                    <td>{actorLabel(e)}</td>
                    <td>{ACTION_LABELS()[e.action] ?? e.action}</td>
                    <td>
                      <code>
                        {e.targetType}
                        {e.targetId ? `:${e.targetId}` : ""}
                      </code>
                    </td>
                    <td>{auditDetails(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Страница ────────────────────────────────────────────────────────── */

type Tab = "templates" | "configs" | "catalogs" | "access";

/** Класс кнопки-вкладки (литералы вне className — css-parity-audit ловит
 *  строки внутри выражения className как имена классов) */
function tabClass(active: boolean): string {
  return active ? "action-btn primary" : "action-btn";
}

export function AdminPromptsPage() {
  const [tab, setTab] = useState<Tab>("templates");
  const isTemplates = tab === "templates";
  const isConfigs = tab === "configs";
  const isCatalogs = tab === "catalogs";
  const isAccess = tab === "access";
  return (
    <div className="input-form" data-testid="admin-prompts-page">
      <h1 className="form-section-title">{tl("adminPromptsPage.promptRegistry", "Prompt Registry")}</h1>
      <div className="actions-bar-btns" style={{ display: "flex", gap: 8, marginBottom: 12 }} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={isTemplates}
          className={tabClass(isTemplates)}
          onClick={() => setTab("templates")}
          data-testid="tab-templates"
        >
          {tl("adminPromptsPage.tabTemplates", "Шаблоны")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isConfigs}
          className={tabClass(isConfigs)}
          onClick={() => setTab("configs")}
          data-testid="tab-configs"
        >
          {tl("adminPromptsPage.tabConfigs", "Конфиги")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isCatalogs}
          className={tabClass(isCatalogs)}
          onClick={() => setTab("catalogs")}
          data-testid="tab-catalogs"
        >
          {tl("adminPromptsPage.tabCatalogs", "Каталоги")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isAccess}
          className={tabClass(isAccess)}
          onClick={() => setTab("access")}
          data-testid="tab-access"
        >
          {tl("adminPromptsPage.tabAccess", "Доступ")}
        </button>
      </div>
      {!isCatalogs && !isAccess && (
        <div className="form-sublabel" style={{ marginBottom: 10 }}>
          {tl("adminPromptsPage.registryNote", "Сохранение создаёт новую версию-черновик; генерация использует только активную. Активация сбрасывает кэш реестра — следующая генерация берёт новый текст.")}
        </div>
      )}
      {isTemplates ? (
        <TemplatesTab />
      ) : isConfigs ? (
        <ConfigsTab />
      ) : isCatalogs ? (
        <CatalogsTab />
      ) : (
        <AccessTab />
      )}
    </div>
  );
}
