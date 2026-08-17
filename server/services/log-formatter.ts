/**
 * Форматирование лога контекста и генерации (беседа 2.4; 04 §3, 05,
 * 03-spec §2.12). Серверные порты:
 *
 *  - formatCtxLog(synthesisId)      [23318–23727] — plain-текст лога;
 *  - formatCtxLogHTML(synthesisId)  [24090–24095] — { text, html }
 *    (адаптация: исходник возвращал только html; { text, html } — форма
 *    07/03 §2.12, текст нужен кнопке «Скопировать»);
 *  - formatPromptsForExport(synthesisId) [24352–24478] — текстовый дамп
 *    промптов (GET /logs/prompts).
 *
 * Адаптации DOM→БД (источники вместо глобальных массивов исходника):
 *  - genLog   → строки generation_log (порядок created_at asc);
 *  - ctxLog   → строки context_log (last-win по section_key — семантика
 *    перезаписи ctxByKey исходника);
 *  - genCommon → metadata.genCommon служебной строки sectionKey='_genCommon'
 *    (status='common', 02 §2.15) — из цикла записей исключается;
 *  - DOC_STATE.docVersion → syntheses.version_* через formatVersion;
 *  - g.type исходника ('version-marker') → log_type схемы
 *    ('version_marker'); g.source 'subsection-regen'/'cascade-regen' →
 *    'subsection_regen'/'cascade'|'mode_cascade';
 *  - rawBaseBudget / conceptOverheadApplied колонок не имеют (02 §2.16) и
 *    восстанавливаются: raw = context_budget[depth] × (critique ? 1.5 : 1),
 *    applied = max(0, raw − budget) при budget_mode='shrink';
 *  - intra-записи ctxLog (в исходнике ctx.type === 'intra-section')
 *    распознаются по составному section_key «раздел:Подраздел» (так их
 *    пишет подраздельная перегенерация 2.2); mode:-ключи исключены;
 *  - маркер версии: plan-executor (2.2) пишет metadata.actions плоскими
 *    строками «тип: метка» (не acts.regen/remove/add исходника) — они
 *    группируются обратно; строка версии — metadata.version (дописана в
 *    bumpVersionsForPlan этой беседой; у строк без неё номер опускается).
 *
 * По 07 (беседа 2.4): fallback reconstructSkeleton НЕ реализуется —
 * prompt-reconstruction.ts создаёт беседа 4.2; записи без
 * metadata.promptSkeleton помечаются «промпт недоступен (импортированная
 * запись)». TODO(4.2): подключить реконструкцию (сделает сама 4.2).
 */
import { asc, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { contextLog, generationLog, syntheses, synthesisLineage } from "../db/schema.js";
import { getConfig } from "./prompt-registry.js";

import { CTX_LABELS } from "@philosynth/shared/constants/ctx-keys";
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";
import { ML, SL } from "@philosynth/shared/constants/labels";
import { colorizeLog } from "@philosynth/shared/utils/colorize-log";
import { formatVersion } from "@philosynth/shared/utils/version";

import type { ContextEntry, ParentSpecLog } from "@philosynth/shared/types/generation";

/* ── Локальные типы строк/метаданных ─────────────────────────────────── */

type GenRow = typeof generationLog.$inferSelect;
type CtxRow = typeof contextLog.$inferSelect;

/** Подраздел в metadata.subsections (пишет generation-service 1.4/2.2) */
interface SubsectionMeta {
  name: string;
  chars: number;
  status?: string;
}

/** genCommon из metadata строки '_genCommon' (generation-service 1.4) */
interface GenCommonMeta {
  sysChars?: number;
  baseChars?: number;
  baseCharsWithoutConcepts?: number;
  totalConceptOverhead?: number;
  budgetMode?: "full" | "shrink";
  parentSpecBySection?: Record<string, ParentSpecLog | null>;
  rulesChars?: number;
  qualityChars?: number;
  scaffoldChars?: number;
  totalChars?: number;
  conceptBlockSizes?: { name: string; chars: number }[];
}

const num = (n: number | null | undefined): string =>
  n == null ? "—" : n.toLocaleString("ru");

const labelOf = (key: string): string =>
  (KEY_LABELS as Record<string, string>)[key] ?? key;

const ctxLabelOf = (key: string, intraSec: string): string =>
  (CTX_LABELS as Record<string, string>)[key] ??
  (key.startsWith("intra:")
    ? labelOf(intraSec) + " → " + key.slice(6)
    : key);

/** intra-запись ctxLog: составной ключ подраздельной перегенерации. */
const isIntraCtxKey = (k: string): boolean =>
  k.includes(":") && !k.startsWith("mode:");

/** Восстановление rawBaseBudget (примечание 02 §2.16). Фолбэк 12000 [8318]. */
async function rawBudgetFor(depth: string, sectionKey: string): Promise<number> {
  let budgets: Record<string, number> = {};
  try {
    budgets = await getConfig<Record<string, number>>("context_budget");
  } catch {
    /* fail-open: лог не должен падать из-за Registry */
  }
  const base = budgets[depth] || 12000;
  return sectionKey === "critique" ? Math.round(base * 1.5) : base;
}

/** Общая выборка: строка синтеза + genLog + ctxLog + genCommon. */
async function loadLogs(synthesisId: string): Promise<{
  row: typeof syntheses.$inferSelect;
  genRows: GenRow[];
  ctxRows: CtxRow[];
  genCommon: GenCommonMeta | null;
} | null> {
  const [row] = await db
    .select()
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  if (!row) return null;
  const genRows = await db
    .select()
    .from(generationLog)
    .where(eq(generationLog.synthesisId, synthesisId))
    .orderBy(asc(generationLog.createdAt));
  const ctxRows = await db
    .select()
    .from(contextLog)
    .where(eq(contextLog.synthesisId, synthesisId))
    .orderBy(asc(contextLog.createdAt));
  const commonRow = genRows.find((g) => g.sectionKey === "_genCommon");
  const genCommon =
    (commonRow?.metadata as { genCommon?: GenCommonMeta } | undefined)
      ?.genCommon ?? null;
  return { row, genRows, ctxRows, genCommon };
}

/* ══ formatCtxLog [23318] ═════════════════════════════════════════════ */

export async function formatCtxLog(synthesisId: string): Promise<string> {
  const loaded = await loadLogs(synthesisId);
  if (!loaded) return "Лог пуст. Сгенерируйте документ.";
  const { row, ctxRows, genCommon } = loaded;
  // Служебная строка _genCommon в цикл записей не входит [02 §2.15]
  const genLog = loaded.genRows.filter((g) => g.sectionKey !== "_genCommon");

  if (genLog.length === 0 && ctxRows.length === 0)
    return "Лог пуст. Сгенерируйте документ.";

  const lines: string[] = [];
  lines.push("PHILOSYNTH PRO — ЛОГ КОНТЕКСТА И ГЕНЕРАЦИИ");
  lines.push("Дата: " + new Date().toLocaleString("ru-RU"));
  const verStr = formatVersion({
    base: row.versionBase,
    sub: row.versionSub,
    modes: row.versionModes,
    modeRegen: row.versionModeRegen,
  });
  if (verStr !== "v1") {
    lines.push("Текущая версия: " + verStr);
  }
  lines.push("═".repeat(70));

  // --- Общие элементы промпта (с разбивкой родительского контекста) ---
  if (genCommon) {
    lines.push("");
    lines.push("ОБЩИЕ ЭЛЕМЕНТЫ ПРОМПТА:");
    lines.push(
      "  Системный промпт          " +
        num(genCommon.sysChars).padStart(7) +
        " симв.  (одинаков для всех)",
    );
    if ((genCommon.rulesChars ?? 0) > 0) {
      lines.push(
        "  Правила форматирования    " +
          num(genCommon.rulesChars).padStart(7) +
          " симв.",
      );
      lines.push(
        "  Требования к качеству     " +
          num(genCommon.qualityChars).padStart(7) +
          " симв.",
      );
    } else if ((genCommon.qualityChars ?? 0) > 0) {
      lines.push("  (вкл. форматирование в системном промпте)");
      lines.push(
        "  Требования к качеству     " +
          num(genCommon.qualityChars).padStart(7) +
          " симв.",
      );
    } else {
      lines.push("  (вкл. форматирование и требования к качеству)");
    }
    // Новый формат: статическая часть + родители отдельно
    const _hasParents =
      (genCommon.totalConceptOverhead || 0) > 0 ||
      (genCommon.parentSpecBySection &&
        Object.keys(genCommon.parentSpecBySection).length > 0);
    if (
      _hasParents &&
      typeof genCommon.baseCharsWithoutConcepts === "number"
    ) {
      lines.push(
        "  Параметры синтеза (статика)" +
          num(genCommon.baseCharsWithoutConcepts).padStart(7) +
          " симв.  (одинаковы для всех)",
      );
      const specMap = genCommon.parentSpecBySection || {};
      const keysForSpec = Object.keys(specMap).filter((k) => specMap[k]);
      if (keysForSpec.length > 0) {
        lines.push("  Контекст родителей (варьируется по разделам):");
        let totalSum = 0,
          maxSum = 0,
          maxKey = "";
        for (const sk of keysForSpec) {
          const spec = specMap[sk] as ParentSpecLog;
          const firstKey = String(sk).split("+")[0]!.split(":")[0]!;
          const label = labelOf(firstKey).padEnd(10);
          const fieldsUsed =
            (spec.perParent[0] && spec.perParent[0].includedFields) || [];
          lines.push(
            "    " +
              label +
              num(spec.totalChars).padStart(7) +
              " симв.  (" +
              fieldsUsed.join(", ") +
              ")",
          );
          totalSum += spec.totalChars;
          if (spec.totalChars > maxSum) {
            maxSum = spec.totalChars;
            maxKey = firstKey;
          }
        }
        const avg = Math.round(totalSum / Math.max(keysForSpec.length, 1));
        lines.push(
          "    Средний вес:     " +
            num(avg).padStart(7) +
            " симв.   Максимум: " +
            num(maxSum) +
            " (" +
            labelOf(maxKey) +
            ")",
        );
      } else {
        lines.push(
          "  Контекст родителей (монолит): " +
            num(genCommon.totalConceptOverhead || 0) +
            " симв.",
        );
      }
      // Per-parent breakdown (ТЗ tz_budget_mode 2.2.А) — полный вес каждого родителя
      const cbs = genCommon.conceptBlockSizes || [];
      if (cbs.length > 0) {
        const totalCbs = cbs.reduce((s, x) => s + (x.chars || 0), 0);
        lines.push("  Участники (полный вес, для справки):");
        for (const pp of cbs) {
          const nm = ("«" + pp.name + "»").padEnd(40);
          lines.push("    " + nm + num(pp.chars).padStart(7) + " симв.");
        }
        lines.push(
          "    " +
            "Σ всего полного веса".padEnd(40) +
            num(totalCbs).padStart(7) +
            " симв. (" +
            cbs.length +
            " концепции)",
        );
      }
    } else {
      lines.push(
        "  Параметры синтеза          " +
          num(genCommon.baseChars).padStart(7) +
          " симв.  (одинаковы для всех)",
      );
    }
    lines.push(
      "  Служебный каркас          " +
        num(genCommon.scaffoldChars).padStart(7) +
        " симв.",
    );
    if (_hasParents) {
      const modeLabel =
        genCommon.budgetMode === "full"
          ? "полный (без ужимания)"
          : "ужатый (под давлением родителей)";
      lines.push("  Режим бюджета секций:     " + modeLabel);
    }
    lines.push("─".repeat(70));
  }

  // Last-win по section_key — семантика ctxByKey исходника [23412]
  const ctxByKey: Record<string, CtxRow> = {};
  for (const pass of ctxRows) ctxByKey[pass.sectionKey] = pass;

  const rawBudgetCache = new Map<string, number>();
  const rawFor = async (k: string): Promise<number> => {
    if (!rawBudgetCache.has(k))
      rawBudgetCache.set(k, await rawBudgetFor(row.depth, k));
    return rawBudgetCache.get(k)!;
  };

  for (const g of genLog) {
    const meta = g.metadata as Record<string, unknown>;
    const dt = g.createdAt ? g.createdAt.toLocaleString("ru-RU") : "";

    // ── Маркер версии ──
    if (g.logType === "version_marker") {
      lines.push("");
      lines.push("═".repeat(70));
      const gv =
        typeof meta["version"] === "string" ? (meta["version"] as string) : "";
      lines.push("  ВЕРСИЯ" + (gv ? " " + gv : "") + (dt ? "  ·  " + dt : ""));
      // Адаптация 2.2: metadata.actions — плоские строки «тип: метка»;
      // группировка обратно в Перегенерировано/Удалено/Добавлено
      const flat = Array.isArray(meta["actions"])
        ? (meta["actions"] as string[])
        : [];
      const acts = { regen: [] as string[], remove: [] as string[], add: [] as string[] };
      for (const s of flat) {
        const idx = s.indexOf(": ");
        const kind = idx > 0 ? s.slice(0, idx) : s;
        const label = idx > 0 ? s.slice(idx + 2) : s;
        if (kind === "delete") acts.remove.push(label);
        else if (kind === "add") acts.add.push(label);
        else acts.regen.push(label); // regen | regen_subsection | regen_mode
      }
      if (acts.regen.length) lines.push("  Перегенерировано: " + acts.regen.join(", "));
      if (acts.remove.length) lines.push("  Удалено: " + acts.remove.join(", "));
      if (acts.add.length) lines.push("  Добавлено: " + acts.add.join(", "));
      lines.push("═".repeat(70));
      continue;
    }

    // ── Маркер паузы ──
    if (g.logType === "pause_marker") {
      const reasonKind = String(meta["reasonKind"] ?? "");
      const maxTokensUsed =
        typeof meta["maxTokensUsed"] === "number"
          ? (meta["maxTokensUsed"] as number)
          : null;
      const kindLabel =
        (
          {
            auth: "Ошибка авторизации",
            billing: "Баланс API исчерпан",
            "pre-stream": "Ошибка сети",
            partial: "Обрыв стрима",
            stuck: "Таймаут (стрим завис)",
            "max-tokens":
              "Превышен лимит max_tokens" +
              (maxTokensUsed ? " (" + maxTokensUsed.toLocaleString("ru") + ")" : ""),
            "user-abort": "Остановка пользователем",
            "context-error": "Ошибка построения контекста",
          } as Record<string, string>
        )[reasonKind] ?? reasonKind;
      lines.push("");
      lines.push("─".repeat(70));
      lines.push("  ⏸  ПАУЗА" + (dt ? "  ·  " + dt : ""));
      lines.push(
        "    Раздел: " +
          (g.sectionLabel || String(meta["sectionLabel"] ?? "") || "?"),
      );
      lines.push("    Причина: " + kindLabel);
      if (meta["reason"]) lines.push("    Детали: " + String(meta["reason"]));
      if (meta["isPartial"]) lines.push("    Частичное содержимое сохранено");
      lines.push("─".repeat(70));
      continue;
    }

    // ── Маркер возобновления ──
    if (g.logType === "resume_marker") {
      const mode = String(meta["mode"] ?? "");
      const modeLabel =
        (
          {
            retry: "Перегенерация раздела",
            skip: "Пропуск раздела",
            stop: "Остановка с сохранением",
            "fill-missing-subs": "Догенерация недостающих подразделов",
            // resumePlan (2.2): режимы плана
            skip_step: "Пропуск шага плана",
          } as Record<string, string>
        )[mode] ?? mode;
      lines.push("");
      lines.push("─".repeat(70));
      lines.push("  ▶  ВОЗОБНОВЛЕНИЕ" + (dt ? "  ·  " + dt : ""));
      lines.push("    Действие: " + modeLabel);
      if (g.sectionLabel) lines.push("    Раздел: " + g.sectionLabel);
      // Адаптация: opDescription исходника план не пишет; для kind='plan'
      // печатаем шаг из stepIdx/totalSteps (metadata resume_marker 2.2)
      if (typeof meta["opDescription"] === "string") {
        lines.push("    Шаг плана: " + meta["opDescription"]);
      } else if (
        meta["kind"] === "plan" &&
        typeof meta["stepIdx"] === "number" &&
        typeof meta["totalSteps"] === "number"
      ) {
        lines.push(
          "    Шаг плана: " +
            ((meta["stepIdx"] as number) + 1) +
            " из " +
            meta["totalSteps"],
        );
      }
      lines.push("─".repeat(70));
      continue;
    }

    // ── Маркер действия пользователя ──
    if (g.logType === "user_action_marker") {
      const action = String(meta["action"] ?? "");
      const actionLabel =
        (
          {
            abort: "Остановлена текущая генерация",
            "api-key-updated": "Обновлён API-ключ",
          } as Record<string, string>
        )[action] ?? action;
      lines.push("");
      lines.push("─".repeat(70));
      lines.push("  👤  ДЕЙСТВИЕ ПОЛЬЗОВАТЕЛЯ" + (dt ? "  ·  " + dt : ""));
      lines.push("    " + actionLabel);
      lines.push("─".repeat(70));
      continue;
    }

    // ── Маркер миграции схемы (ТЗ selective-parent-context 10.2) ──
    if (g.logType === "schema_migration_marker") {
      lines.push("");
      lines.push("─".repeat(70));
      lines.push("  ↻  МИГРАЦИЯ СХЕМЫ" + (dt ? "  ·  " + dt : ""));
      lines.push(
        "    " +
          String(meta["fromSchema"] ?? "?") +
          " → " +
          String(meta["toSchema"] ?? "?"),
      );
      if (g.sectionLabel) {
        lines.push("    при перегенерации раздела: " + g.sectionLabel);
      }
      lines.push("─".repeat(70));
      continue;
    }

    // ── Маркер удаления ──
    if (g.logType === "deletion_marker") {
      lines.push("");
      lines.push("─".repeat(70));
      const secNum =
        typeof meta["sectionNum"] === "number"
          ? String(meta["sectionNum"])
          : "?";
      lines.push(
        "  ✗ УДАЛЁН: § " +
          secNum +
          " — " +
          g.sectionLabel +
          (dt ? "  ·  " + dt : ""),
      );
      lines.push("─".repeat(70));
      continue;
    }

    const keys = g.sectionKey.split("+");

    lines.push("");
    lines.push("═══ " + g.sectionLabel.toUpperCase() + " ═══");

    // --- Состав входа ---
    lines.push("");
    lines.push("ВХОД:");
    const isMode = g.sectionKey.startsWith("mode:");
    const commonChars = isMode
      ? (genCommon?.sysChars ?? 0)
      : (genCommon ? (genCommon.totalChars ?? 0) : 0);

    // Если в записи genEntry есть per-section parentOverhead — показываем
    // статику отдельно от родителей. Иначе — legacy-одиночная строка.
    const _parentOv =
      typeof meta["parentOverheadChars"] === "number"
        ? (meta["parentOverheadChars"] as number)
        : null;
    const _fieldsUsed = Array.isArray(meta["parentFieldsUsed"])
      ? (meta["parentFieldsUsed"] as string[])
      : null;
    if (
      !isMode &&
      _parentOv !== null &&
      _parentOv > 0 && // адаптация: 0 без родителей = legacy-строка
      genCommon &&
      typeof genCommon.baseCharsWithoutConcepts === "number"
    ) {
      // Общие = sys + qualRules + статика + скаффолд (без родителей)
      const staticCommon =
        (genCommon.sysChars ?? 0) +
        (genCommon.qualityChars || 0) +
        (genCommon.baseCharsWithoutConcepts || 0) +
        (genCommon.scaffoldChars || 0) +
        (genCommon.rulesChars || 0);
      lines.push(
        "  Общие элементы             " +
          num(staticCommon).padStart(7) +
          " симв.",
      );
      lines.push(
        "  Контекст родителей         " +
          num(_parentOv).padStart(7) +
          " симв." +
          (_fieldsUsed && _fieldsUsed.length
            ? "  (" + _fieldsUsed.join(", ") + ")"
            : ""),
      );
      // Опущенные поля + предупреждения — из parentSpec в ctxLog
      const _ctxForSpec =
        ctxByKey[g.sectionKey] ??
        (keys.length ? ctxByKey[keys[0]!] : undefined);
      const _pspec = _ctxForSpec && _ctxForSpec.parentSpec;
      if (_pspec && Array.isArray(_pspec.perParent) && _pspec.perParent.length > 0) {
        // Опущенные поля: берём из первого родителя (они одинаковы для всех при per-section)
        const _omitted = _pspec.perParent[0]!.omittedFields || [];
        if (_omitted.length > 0) {
          lines.push("    Опущено: " + _omitted.join(", "));
        }
        // Предупреждения о missingRequired (по каждому родителю)
        for (const pp of _pspec.perParent) {
          if (pp.missingRequired && pp.missingRequired.length > 0) {
            lines.push(
              "    ⚠ «" +
                pp.name +
                "»: отсутствует обязательное поле: " +
                pp.missingRequired.join(", "),
            );
          }
        }
      }
      if (meta["budgetMode"] === "full") {
        lines.push("  Режим бюджета: полный (без ужимания)");
      }
    } else {
      lines.push(
        "  Общие элементы             " +
          num(commonChars).padStart(7) +
          " симв.",
      );
    }

    if (g.priorChars > 0) {
      lines.push(
        "  Контекст пред. разделов   " +
          num(g.priorChars).padStart(7) +
          " симв.",
      );

      for (const k of keys) {
        const ctx = ctxByKey[k];
        if (!ctx) continue;

        if (isIntraCtxKey(k)) {
          const parentKey = k.split(":")[0]!;
          lines.push(
            "    Контекст подразделов «" +
              labelOf(parentKey) +
              "»: " +
              num(ctx.totalUsed) +
              " симв.",
          );
        } else {
          const _raw = await rawFor(k);
          const _applied =
            ctx.budgetMode === "shrink" ? Math.max(0, _raw - ctx.budget) : 0;
          const _usedPct = Math.round(
            (ctx.totalUsed / Math.max(ctx.budget, 1)) * 100,
          );
          if (_raw && _applied > 0) {
            lines.push(
              "    Бюджет: " +
                num(ctx.budget) +
                " из " +
                num(_raw) +
                " симв. " +
                "(сжат родителями на " +
                num(_applied) +
                "), " +
                "использовано: " +
                num(ctx.totalUsed) +
                " (" +
                _usedPct +
                "%)",
            );
          } else if (_raw && ctx.budgetMode === "full") {
            lines.push(
              "    Бюджет: " +
                num(ctx.budget) +
                " симв. (полный, без ужимания), " +
                "использовано: " +
                num(ctx.totalUsed) +
                " (" +
                _usedPct +
                "%)",
            );
          } else {
            lines.push(
              "    Бюджет: " +
                num(ctx.budget) +
                " симв., " +
                "использовано: " +
                num(ctx.totalUsed) +
                " (" +
                _usedPct +
                "%)",
            );
          }
        }

        const entries = ctx.entries as ContextEntry[];
        const intraSec = k.split(":")[0]!;
        const reqEntries = entries.filter((e) => e.priority === "required");
        if (reqEntries.length) {
          lines.push("    Обязательный:");
          for (const e of reqEntries) {
            const lbl = ctxLabelOf(e.key, intraSec).padEnd(42);
            if (e.status === "found") {
              const subMark = e.isSubstitute ? " [замена]" : "";
              lines.push(
                "      ✓ " + lbl + num(e.len).padStart(7) + " симв." + subMark,
              );
            } else if (e.status === "dropped") {
              lines.push(
                "      ✗ " + lbl + "утрачён [" + String(e["note"] ?? "") + "]",
              );
            } else {
              lines.push("      ✗ " + lbl + "НЕ НАЙДЕН");
            }
          }
        }

        const optEntries = entries.filter((e) => e.priority === "optional");
        if (optEntries.length) {
          lines.push("    Опциональный:");
          for (const e of optEntries) {
            const lbl = ctxLabelOf(e.key, intraSec).padEnd(42);
            if (e.status === "found") {
              const subMark = e.isSubstitute ? " [замена]" : "";
              lines.push(
                "      ✓ " + lbl + num(e.len).padStart(7) + " симв." + subMark,
              );
            } else if (e.status === "truncated") {
              lines.push(
                "      ◦ " +
                  lbl +
                  num(e.len).padStart(7) +
                  " симв. [" +
                  String(e["note"] ?? "") +
                  "]",
              );
            } else if (e.status === "skipped_budget") {
              lines.push(
                "      ◌ " +
                  lbl +
                  "пропущен [" +
                  String(e["note"] ?? "бюджет исчерпан") +
                  "]",
              );
            } else if (e.status === "dropped") {
              lines.push(
                "      ✗ " + lbl + "утрачён [" + String(e["note"] ?? "") + "]",
              );
            } else {
              lines.push("      ✗ " + lbl + "не найден");
            }
          }
        }
      }
    } else {
      lines.push("  Контекст пред. разделов           — (первый раздел)");
    }

    // ── Дополнительные метаданные перегенерации ──
    if (meta["hasCurrentContent"]) {
      lines.push(
        "  Текущее содержимое подраздела " +
          num(
            typeof meta["currentContentChars"] === "number"
              ? (meta["currentContentChars"] as number)
              : 0,
          ).padStart(7) +
          " симв. [включено]",
      );
    }
    const secCtxChars =
      typeof meta["secCtxChars"] === "number" ? (meta["secCtxChars"] as number) : 0;
    if (secCtxChars > 0) {
      lines.push(
        "  Доп. контекст раздела      " + num(secCtxChars).padStart(7) + " симв.",
      );
      if (typeof meta["secCtxPreview"] === "string" && meta["secCtxPreview"]) {
        lines.push("    «" + meta["secCtxPreview"] + "»");
      }
    }
    const ctxChars =
      typeof meta["ctxChars"] === "number" ? (meta["ctxChars"] as number) : 0;
    if (ctxChars > 0 && isMode) {
      lines.push(
        "  Контекст режима            " + num(ctxChars).padStart(7) + " симв.",
      );
    }

    lines.push(
      "  Задание секции             " + num(g.taskChars).padStart(7) + " симв.",
    );
    lines.push(
      "                       ИТОГО " +
        num(g.inputChars).padStart(7) +
        " симв. → " +
        num(g.inputTokens) +
        " токенов" +
        (g.inputChars > 0 && g.inputTokens > 0
          ? " (" + (g.inputChars / g.inputTokens).toFixed(1) + " с/т)"
          : ""),
    );

    // --- Выход ---
    lines.push("");
    const cost = Number(g.costUsd);
    if (g.status === "streaming") {
      lines.push("ВЫХОД: " + num(g.outputChars) + " симв. ⟳ генерация...");
    } else if (g.status === "error") {
      lines.push("ВЫХОД: ⚠ ОШИБКА: " + (g.errorMessage ?? ""));
    } else {
      lines.push("ВЫХОД:");
      lines.push(
        "  " +
          num(g.outputChars) +
          " симв. → " +
          num(g.outputTokens) +
          " токенов" +
          (g.outputChars > 0 && g.outputTokens > 0
            ? " (" + (g.outputChars / g.outputTokens).toFixed(1) + " с/т)"
            : ""),
      );
      lines.push(
        "  Стоимость: $" + cost.toFixed(4) + " (" + (cost * 100).toFixed(2) + "¢)",
      );
      if (g.errorMessage) {
        lines.push("  ⚠ ОШИБКА: " + g.errorMessage);
      }
    }
    // Посекционная разбивка (plaintext)
    const subs = Array.isArray(meta["subsections"])
      ? (meta["subsections"] as SubsectionMeta[])
      : [];
    const expected = Array.isArray(meta["expectedSubsections"])
      ? (meta["expectedSubsections"] as string[])
      : [];
    if (expected.length > 0) {
      lines.push("");
      lines.push("  СЕКЦИИ:");

      const foundMap: Record<string, SubsectionMeta> = {};
      for (const s of subs) foundMap[s.name] = s;

      for (const secName of expected) {
        const s = foundMap[secName];
        const lbl = secName.padEnd(42);
        if (s) {
          if (s.status === "streaming") {
            lines.push(
              "    ⟳ " + lbl + num(s.chars).padStart(7) + " симв.  генерация",
            );
          } else {
            lines.push("    ✓ " + lbl + num(s.chars).padStart(7) + " симв.");
          }
        } else {
          lines.push("    ◌ " + lbl + "     —");
        }
      }
    }
    lines.push("─".repeat(70));
  }

  // --- Итоги ---
  const doneEntries = genLog.filter(
    (g) =>
      g.logType === "generation" &&
      (g.status === "done" || g.status === "error" || !g.status),
  );
  if (doneEntries.length > 0) {
    const t = doneEntries.reduce(
      (a, g) => ({
        inC: a.inC + g.inputChars,
        outC: a.outC + g.outputChars,
        inT: a.inT + g.inputTokens,
        outT: a.outT + g.outputTokens,
        cost: a.cost + Number(g.costUsd),
      }),
      { inC: 0, outC: 0, inT: 0, outT: 0, cost: 0 },
    );

    lines.push("");
    lines.push("═══ ИТОГО ═══");
    lines.push("Разделов: " + doneEntries.length + " из " + genLog.length);
    lines.push("Вход:  " + num(t.inC) + " симв. → " + num(t.inT) + " токенов");
    lines.push("Выход: " + num(t.outC) + " симв. → " + num(t.outT) + " токенов");
    lines.push(
      "Стоимость: $" +
        t.cost.toFixed(4) +
        " (" +
        (t.cost * 100).toFixed(2) +
        "¢)",
    );
    lines.push("═".repeat(70));
  }

  return lines.join("\n");
}

/* ══ formatCtxLogHTML [24090] ═════════════════════════════════════════ */

/**
 * { text, html } — форма 07/03 §2.12 (исходник возвращал только html).
 * Пустой лог — приглушённый span, как в исходнике.
 */
export async function formatCtxLogHTML(
  synthesisId: string,
): Promise<{ text: string; html: string }> {
  const plain = await formatCtxLog(synthesisId);
  if (plain === "Лог пуст. Сгенерируйте документ.")
    return {
      text: plain,
      html: '<span style="color:#8a8278">' + plain + "</span>",
    };
  return { text: plain, html: colorizeLog(plain) };
}

/* ══ formatPromptsForExport [24352] ═══════════════════════════════════ */

/**
 * Текстовый дамп промптов (GET /logs/prompts). null — нет ни одной
 * записи-запроса (клиент показывает «Нет сохранённых промптов»).
 *
 * По 07: fallback reconstructSkeleton НЕ реализуется до 4.2 — записи без
 * metadata.promptSkeleton помечаются «промпт недоступен (импортированная
 * запись)»; TODO(4.2). Регулярки среза ПАРАМЕТРОВ несут маркеры
 * «КОНТЕКСТ ДРУГИХ», «Перегенерируй ТОЛЬКО», «КОНТЕКСТ
 * КОНЦЕПЦИЙ-УЧАСТНИКОВ» — как в исходнике.
 */
export async function formatPromptsForExport(
  synthesisId: string,
): Promise<string | null> {
  const loaded = await loadLogs(synthesisId);
  if (!loaded) return null;
  const { row, ctxRows, genCommon } = loaded;

  // Все записи-запросы: маркеры и служебная '_genCommon' исключены
  const entries = loaded.genRows.filter(
    (g) => g.logType === "generation" && g.sectionKey !== "_genCommon",
  );
  if (entries.length === 0) return null;

  const metaOf = (g: GenRow): Record<string, unknown> =>
    g.metadata as Record<string, unknown>;
  const skeletonOf = (g: GenRow): string =>
    typeof metaOf(g)["promptSkeleton"] === "string"
      ? (metaOf(g)["promptSkeleton"] as string)
      : "";

  const lines: string[] = [];
  const sep = "═".repeat(80);
  const subsep = "─".repeat(80);

  // ── Шапка ──
  lines.push("# PHILOSYNTH PRO — ЭКСПОРТ ПРОМПТОВ");
  lines.push("");
  lines.push("Дата: " + new Date().toLocaleString("ru-RU"));
  lines.push("Метод: " + ((ML as Record<string, string>)[row.method] ?? row.method));
  lines.push(
    "Уровень: " + ((SL as Record<string, string>)[row.synthLevel] ?? row.synthLevel),
  );
  lines.push("Глубина: " + (row.depth || "?"));
  lines.push(
    "Порядок: " +
      (row.generationOrder === "genetic" ? "генетический" : "архитектурный"),
  );
  const lineageRows = await db
    .select()
    .from(synthesisLineage)
    .where(eq(synthesisLineage.synthesisId, synthesisId))
    .orderBy(asc(synthesisLineage.position));
  const phil = lineageRows
    .filter((l) => l.parentType === "philosopher" && l.parentName)
    .map((l) => l.parentName as string);
  if (phil.length) lines.push("Участники: " + phil.join(", "));
  if (row.seed) lines.push("Зерно: " + row.seed);
  // ТЗ: режим бюджета + схема селективности родительского контекста
  const _hasMetaP = lineageRows.some((l) => l.parentType === "synthesis");
  if (_hasMetaP) {
    const _mode =
      row.keepFullBudget || genCommon?.budgetMode === "full"
        ? "полный (без ужимания)"
        : "ужатый (множитель сжатия 0.4)";
    lines.push("Режим бюджета секций: " + _mode);
    lines.push(
      "Схема родительского контекста: " +
        (row.parentContextSchema === "monolithic"
          ? "монолитная (legacy)"
          : "селективная (PARENT_DEPS_BASE, v1)"),
    );
  }
  lines.push("");

  // ── Системный промпт (один раз) ──
  // Адаптация: fallback buildSYS(p) исходника не воспроизводится — sys
  // пишется в metadata каждой записи (1.4); без него секция опускается.
  const firstSys = entries
    .map((g) => metaOf(g)["sys"])
    .find((s): s is string => typeof s === "string" && s.length > 0);
  if (firstSys) {
    lines.push(sep);
    lines.push("## СИСТЕМНЫЙ ПРОМПТ");
    lines.push(
      "(одинаков для всех запросов; включает правила форматирования и требования к качеству)",
    );
    lines.push(sep);
    lines.push("");
    lines.push(firstSys);
    lines.push("");
  }

  const firstSkeleton = entries.map(skeletonOf).find((s) => s) ?? "";
  const partBaseMatch = firstSkeleton.match(
    /^ПАРАМЕТРЫ СИНТЕЗА:\n([\s\S]*?)(?=\nКОНТЕКСТ ИЗ ПРЕДЫДУЩИХ|\nКОНТЕКСТ ДРУГИХ|\nЗАДАНИЕ:|\n(?:Перегенерируй|Доработай) ТОЛЬКО)/,
  );
  // Реконструкция reconstructBaseCtxSkeleton — беседа 4.2; TODO(4.2)
  const baseCtxText = partBaseMatch ? partBaseMatch[1]!.trim() : null;
  if (baseCtxText) {
    lines.push(sep);
    lines.push("## ПАРАМЕТРЫ СИНТЕЗА");
    lines.push("(одинаковы для всех запросов)");
    lines.push(sep);
    lines.push("");
    lines.push(baseCtxText);
    lines.push("");
  }

  const rawBudgetCache = new Map<string, number>();

  // ── Промпты по разделам — скелет ──
  for (const g of entries) {
    lines.push(sep);

    const isMode = g.sectionKey.startsWith("mode:");
    // Адаптация source: 'subsection_regen' | 'cascade'/'mode_cascade'
    // (исходник: 'subsection-regen' / 'cascade-regen')
    const isSubRegen = g.source === "subsection_regen";
    const isCascade = g.source === "cascade" || g.source === "mode_cascade";

    let title = g.sectionLabel || g.sectionKey;
    if (isSubRegen) title += " [подразделовая перегенерация]";
    if (isCascade) title += " [каскад]";
    if (isMode) title += " [режим]";

    lines.push("## " + title.toUpperCase());
    lines.push(sep);
    lines.push("");

    // Скелет промпта: только из metadata; реконструкция — TODO(4.2)
    let skeleton = skeletonOf(g);
    if (!skeleton) {
      lines.push("[промпт недоступен (импортированная запись)]");
    } else {
      skeleton = skeleton.replace(
        /^ПАРАМЕТРЫ СИНТЕЗА:\n[\s\S]*?(?=\nКОНТЕКСТ ИЗ ПРЕДЫДУЩИХ|\nКОНТЕКСТ ДРУГИХ|\nЗАДАНИЕ:|\n(?:Перегенерируй|Доработай) ТОЛЬКО)/,
        "",
      );
      lines.push(skeleton.trim());
    }

    lines.push("");
    lines.push(subsep);
    lines.push(
      "Вход: " +
        (g.inputChars || 0).toLocaleString("ru") +
        " симв. → " +
        (g.inputTokens || 0).toLocaleString("ru") +
        " токенов",
    );
    lines.push(
      "Выход: " +
        (g.outputChars || 0).toLocaleString("ru") +
        " симв. → " +
        (g.outputTokens || 0).toLocaleString("ru") +
        " токенов",
    );
    lines.push("Стоимость: $" + Number(g.costUsd).toFixed(4));
    // ТЗ: информация о родительском контексте и бюджете раздела
    const meta = metaOf(g);
    const parentOv =
      typeof meta["parentOverheadChars"] === "number"
        ? (meta["parentOverheadChars"] as number)
        : 0;
    if (parentOv > 0) {
      const fields = Array.isArray(meta["parentFieldsUsed"])
        ? (meta["parentFieldsUsed"] as string[]).join(", ")
        : "";
      lines.push(
        "Контекст родителей: " +
          parentOv.toLocaleString("ru") +
          " симв." +
          (fields ? "  (поля: " + fields + ")" : ""),
      );
    }
    // Бюджет секционного контекста из ctxLog (last-win, как в formatCtxLog)
    const _ctx = [...ctxRows].reverse().find((c) => c.sectionKey === g.sectionKey);
    if (_ctx && !isIntraCtxKey(_ctx.sectionKey)) {
      if (!rawBudgetCache.has(_ctx.sectionKey))
        rawBudgetCache.set(
          _ctx.sectionKey,
          await rawBudgetFor(row.depth, _ctx.sectionKey),
        );
      const _raw = rawBudgetCache.get(_ctx.sectionKey)!;
      const _applied =
        _ctx.budgetMode === "shrink" ? Math.max(0, _raw - _ctx.budget) : 0;
      if (_applied > 0) {
        lines.push(
          "Бюджет секц. контекста: " +
            _ctx.budget.toLocaleString("ru") +
            " из " +
            _raw.toLocaleString("ru") +
            " симв. [ужато]",
        );
      } else if (_ctx.budgetMode === "full") {
        lines.push(
          "Бюджет секц. контекста: " + _raw.toLocaleString("ru") + " симв. [полный]",
        );
      }
    }
    if (g.status === "error") lines.push("⚠ ОШИБКА: " + (g.errorMessage ?? ""));
    lines.push("");
  }

  return lines.join("\n");
}
