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
 * Беседа 4.2: fallback reconstructSkeleton ПОДКЛЮЧЁН
 * (prompt-reconstruction.ts) — для записей без metadata.promptSkeleton
 * скелет восстанавливается из параметров синтеза, ctxLog и определений
 * разделов; метка «промпт недоступен (импортированная запись)» остаётся
 * лишь когда и реконструкция невозможна (нет параметров/строки синтеза).
 */
import { asc, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { contextLog, generationLog, syntheses, synthesisLineage } from "../db/schema.js";
import { getConfig } from "./prompt-registry.js";

import { CTX_LABELS } from "@philosynth/shared/constants/ctx-keys";
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";
import { ML, SL } from "@philosynth/shared/constants/labels";
import { colorizeLog } from "@philosynth/shared/utils/colorize-log";

import {
  buildReconstructionContext,
  reconstructBaseCtxSkeleton,
  reconstructSkeleton,
} from "./prompt-reconstruction.js";
import { formatVersion } from "@philosynth/shared/utils/version";

import type { ContextEntry, ParentSpecLog } from "@philosynth/shared/types/generation";
import { tl } from "@philosynth/shared/i18n/t";

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
  if (!loaded) return tl("server.logFormatter.logEmpty", "Лог пуст. Сгенерируйте документ.");
  const { row, ctxRows, genCommon } = loaded;
  // Служебная строка _genCommon в цикл записей не входит [02 §2.15]
  const genLog = loaded.genRows.filter((g) => g.sectionKey !== "_genCommon");

  if (genLog.length === 0 && ctxRows.length === 0)
    return tl("server.logFormatter.logEmpty", "Лог пуст. Сгенерируйте документ.");

  const lines: string[] = [];
  lines.push(tl("server.logFormatter.logTitle", "PHILOSYNTH PRO — ЛОГ КОНТЕКСТА И ГЕНЕРАЦИИ"));
  lines.push(tl("server.logFormatter.date", "Дата: ") + new Date().toLocaleString("ru-RU"));
  const verStr = formatVersion({
    base: row.versionBase,
    sub: row.versionSub,
    modes: row.versionModes,
    modeRegen: row.versionModeRegen,
  });
  if (verStr !== "v1") {
    lines.push(tl("server.logFormatter.currentVersion", "Текущая версия: ") + verStr);
  }
  lines.push("═".repeat(70));

  // --- Общие элементы промпта (с разбивкой родительского контекста) ---
  if (genCommon) {
    lines.push("");
    lines.push(tl("server.logFormatter.commonElements", "ОБЩИЕ ЭЛЕМЕНТЫ ПРОМПТА:"));
    lines.push(
      tl("server.logFormatter.systemPrompt", "  Системный промпт          ") +
        num(genCommon.sysChars).padStart(7) +
        tl("server.logFormatter.charsSameForAll", " симв.  (одинаков для всех)"),
    );
    if ((genCommon.rulesChars ?? 0) > 0) {
      lines.push(
        tl("server.logFormatter.formattingRules", "  Правила форматирования    ") +
          num(genCommon.rulesChars).padStart(7) +
          tl("server.logFormatter.chars", " симв."),
      );
      lines.push(
        tl("server.logFormatter.qualityRequirements", "  Требования к качеству     ") +
          num(genCommon.qualityChars).padStart(7) +
          tl("server.logFormatter.chars", " симв."),
      );
    } else if ((genCommon.qualityChars ?? 0) > 0) {
      lines.push(tl("server.logFormatter.inclFormatting", "  (вкл. форматирование в системном промпте)"));
      lines.push(
        tl("server.logFormatter.qualityRequirements", "  Требования к качеству     ") +
          num(genCommon.qualityChars).padStart(7) +
          tl("server.logFormatter.chars", " симв."),
      );
    } else {
      lines.push(tl("server.logFormatter.inclFormattingQuality", "  (вкл. форматирование и требования к качеству)"));
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
        tl("server.logFormatter.synthesisParamsStatic", "  Параметры синтеза (статика)") +
          num(genCommon.baseCharsWithoutConcepts).padStart(7) +
          tl("server.logFormatter.charsSameForAllPl", " симв.  (одинаковы для всех)"),
      );
      const specMap = genCommon.parentSpecBySection || {};
      const keysForSpec = Object.keys(specMap).filter((k) => specMap[k]);
      if (keysForSpec.length > 0) {
        lines.push(tl("server.logFormatter.parentContextVarying", "  Контекст родителей (варьируется по разделам):"));
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
              tl("server.logFormatter.charsParenOpen", " симв.  (") +
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
          tl("server.logFormatter.averageWeight", "    Средний вес:     ") +
            num(avg).padStart(7) +
            tl("server.logFormatter.charsMaximum", " симв.   Максимум: ") +
            num(maxSum) +
            " (" +
            labelOf(maxKey) +
            ")",
        );
      } else {
        lines.push(
          tl("server.logFormatter.parentContextMonolith", "  Контекст родителей (монолит): ") +
            num(genCommon.totalConceptOverhead || 0) +
            tl("server.logFormatter.chars", " симв."),
        );
      }
      // Per-parent breakdown (ТЗ tz_budget_mode 2.2.А) — полный вес каждого родителя
      const cbs = genCommon.conceptBlockSizes || [];
      if (cbs.length > 0) {
        const totalCbs = cbs.reduce((s, x) => s + (x.chars || 0), 0);
        lines.push(tl("server.logFormatter.participantsFullWeight", "  Участники (полный вес, для справки):"));
        for (const pp of cbs) {
          const nm = ("«" + pp.name + "»").padEnd(40);
          lines.push("    " + nm + num(pp.chars).padStart(7) + tl("server.logFormatter.chars", " симв."));
        }
        lines.push(
          "    " +
            tl("server.logFormatter.fullWeightTotal", "Σ всего полного веса").padEnd(40) +
            num(totalCbs).padStart(7) +
            tl("server.logFormatter.charsParen", " симв. (") +
            cbs.length +
            tl("server.logFormatter.conceptsParenClose", " концепции)"),
        );
      }
    } else {
      lines.push(
        tl("server.logFormatter.synthesisParams", "  Параметры синтеза          ") +
          num(genCommon.baseChars).padStart(7) +
          tl("server.logFormatter.charsSameForAllPl", " симв.  (одинаковы для всех)"),
      );
    }
    lines.push(
      tl("server.logFormatter.serviceFrame", "  Служебный каркас          ") +
        num(genCommon.scaffoldChars).padStart(7) +
        tl("server.logFormatter.chars", " симв."),
    );
    if (_hasParents) {
      const modeLabel =
        genCommon.budgetMode === "full"
          ? tl("server.logFormatter.budgetFull", "полный (без ужимания)")
          : tl("server.logFormatter.budgetCompressed", "ужатый (под давлением родителей)");
      lines.push(tl("server.logFormatter.budgetMode", "  Режим бюджета секций:     ") + modeLabel);
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
      lines.push(tl("server.logFormatter.versionHeading", "  ВЕРСИЯ") + (gv ? " " + gv : "") + (dt ? "  ·  " + dt : ""));
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
      if (acts.regen.length) lines.push(tl("server.logFormatter.regenerated", "  Перегенерировано: ") + acts.regen.join(", "));
      if (acts.remove.length) lines.push(tl("server.logFormatter.deleted", "  Удалено: ") + acts.remove.join(", "));
      if (acts.add.length) lines.push(tl("server.logFormatter.added", "  Добавлено: ") + acts.add.join(", "));
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
            auth: tl("server.logFormatter.errAuth", "Ошибка авторизации"),
            billing: tl("server.logFormatter.errBilling", "Баланс API исчерпан"),
            "pre-stream": tl("server.logFormatter.errNetwork", "Ошибка сети"),
            partial: tl("server.logFormatter.errPartial", "Обрыв стрима"),
            stuck: tl("server.logFormatter.errStuck", "Таймаут (стрим завис)"),
            "max-tokens":
              tl("server.logFormatter.errMaxTokens", "Превышен лимит max_tokens") +
              (maxTokensUsed ? " (" + maxTokensUsed.toLocaleString("ru") + ")" : ""),
            "user-abort": tl("server.logFormatter.errUserAbort", "Остановка пользователем"),
            "context-error": tl("server.logFormatter.errContext", "Ошибка построения контекста"),
          } as Record<string, string>
        )[reasonKind] ?? reasonKind;
      lines.push("");
      lines.push("─".repeat(70));
      lines.push(tl("server.logFormatter.pauseHeading", "  ⏸  ПАУЗА") + (dt ? "  ·  " + dt : ""));
      lines.push(
        tl("server.logFormatter.pauseSection", "    Раздел: ") +
          (g.sectionLabel || String(meta["sectionLabel"] ?? "") || "?"),
      );
      lines.push(tl("server.logFormatter.pauseCause", "    Причина: ") + kindLabel);
      if (meta["reason"]) lines.push(tl("server.logFormatter.pauseDetails", "    Детали: ") + String(meta["reason"]));
      if (meta["isPartial"]) lines.push(tl("server.logFormatter.partialSaved", "    Частичное содержимое сохранено"));
      lines.push("─".repeat(70));
      continue;
    }

    // ── Маркер возобновления ──
    if (g.logType === "resume_marker") {
      const mode = String(meta["mode"] ?? "");
      const modeLabel =
        (
          {
            retry: tl("server.logFormatter.actionRegenSection", "Перегенерация раздела"),
            skip: tl("server.logFormatter.actionSkipSection", "Пропуск раздела"),
            stop: tl("server.logFormatter.actionStopSave", "Остановка с сохранением"),
            "fill-missing-subs": tl("server.logFormatter.actionFillMissing", "Догенерация недостающих подразделов"),
            // resumePlan (2.2): режимы плана
            skip_step: tl("server.logFormatter.actionSkipStep", "Пропуск шага плана"),
          } as Record<string, string>
        )[mode] ?? mode;
      lines.push("");
      lines.push("─".repeat(70));
      lines.push(tl("server.logFormatter.resumeHeading", "  ▶  ВОЗОБНОВЛЕНИЕ") + (dt ? "  ·  " + dt : ""));
      lines.push(tl("server.logFormatter.resumeAction", "    Действие: ") + modeLabel);
      if (g.sectionLabel) lines.push(tl("server.logFormatter.pauseSection", "    Раздел: ") + g.sectionLabel);
      // Адаптация: opDescription исходника план не пишет; для kind='plan'
      // печатаем шаг из stepIdx/totalSteps (metadata resume_marker 2.2)
      if (typeof meta["opDescription"] === "string") {
        lines.push(tl("server.logFormatter.resumePlanStep", "    Шаг плана: ") + meta["opDescription"]);
      } else if (
        meta["kind"] === "plan" &&
        typeof meta["stepIdx"] === "number" &&
        typeof meta["totalSteps"] === "number"
      ) {
        lines.push(
          tl("server.logFormatter.resumePlanStep", "    Шаг плана: ") +
            ((meta["stepIdx"] as number) + 1) +
            tl("server.logFormatter.of", " из ") +
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
            abort: tl("server.logFormatter.actionStopped", "Остановлена текущая генерация"),
            "api-key-updated": tl("server.logFormatter.actionKeyUpdated", "Обновлён API-ключ"),
          } as Record<string, string>
        )[action] ?? action;
      lines.push("");
      lines.push("─".repeat(70));
      lines.push(tl("server.logFormatter.userActionHeading", "  👤  ДЕЙСТВИЕ ПОЛЬЗОВАТЕЛЯ") + (dt ? "  ·  " + dt : ""));
      lines.push("    " + actionLabel);
      lines.push("─".repeat(70));
      continue;
    }

    // ── Маркер миграции схемы (ТЗ selective-parent-context 10.2) ──
    if (g.logType === "schema_migration_marker") {
      lines.push("");
      lines.push("─".repeat(70));
      lines.push(tl("server.logFormatter.schemaMigrationHeading", "  ↻  МИГРАЦИЯ СХЕМЫ") + (dt ? "  ·  " + dt : ""));
      lines.push(
        "    " +
          String(meta["fromSchema"] ?? "?") +
          " → " +
          String(meta["toSchema"] ?? "?"),
      );
      if (g.sectionLabel) {
        lines.push(tl("server.logFormatter.onSectionRegen", "    при перегенерации раздела: ") + g.sectionLabel);
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
        tl("server.logFormatter.deletedSection", "  ✗ УДАЛЁН: § ") +
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
    lines.push(tl("server.logFormatter.inputHeading", "ВХОД:"));
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
        tl("server.logFormatter.inCommonElements", "  Общие элементы             ") +
          num(staticCommon).padStart(7) +
          tl("server.logFormatter.chars", " симв."),
      );
      lines.push(
        tl("server.logFormatter.inParentContext", "  Контекст родителей         ") +
          num(_parentOv).padStart(7) +
          tl("server.logFormatter.chars", " симв.") +
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
          lines.push(tl("server.logFormatter.omitted", "    Опущено: ") + _omitted.join(", "));
        }
        // Предупреждения о missingRequired (по каждому родителю)
        for (const pp of _pspec.perParent) {
          if (pp.missingRequired && pp.missingRequired.length > 0) {
            lines.push(
              "    ⚠ «" +
                pp.name +
                tl("server.logFormatter.missingRequiredField", "»: отсутствует обязательное поле: ") +
                pp.missingRequired.join(", "),
            );
          }
        }
      }
      if (meta["budgetMode"] === "full") {
        lines.push(tl("server.logFormatter.budgetModeFull", "  Режим бюджета: полный (без ужимания)"));
      }
    } else {
      lines.push(
        tl("server.logFormatter.inCommonElements", "  Общие элементы             ") +
          num(commonChars).padStart(7) +
          tl("server.logFormatter.chars", " симв."),
      );
    }

    if (g.priorChars > 0) {
      lines.push(
        tl("server.logFormatter.prevSectionsContext", "  Контекст пред. разделов   ") +
          num(g.priorChars).padStart(7) +
          tl("server.logFormatter.chars", " симв."),
      );

      for (const k of keys) {
        const ctx = ctxByKey[k];
        if (!ctx) continue;

        if (isIntraCtxKey(k)) {
          const parentKey = k.split(":")[0]!;
          lines.push(
            tl("server.logFormatter.subsectionContextLead", "    Контекст подразделов «") +
              labelOf(parentKey) +
              "»: " +
              num(ctx.totalUsed) +
              tl("server.logFormatter.chars", " симв."),
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
              tl("server.logFormatter.budget", "    Бюджет: ") +
                num(ctx.budget) +
                tl("server.logFormatter.of", " из ") +
                num(_raw) +
                tl("server.logFormatter.charsSpace", " симв. ") +
                tl("server.logFormatter.compressedByParentsBy", "(сжат родителями на ") +
                num(_applied) +
                "), " +
                tl("server.logFormatter.usedLabel", "использовано: ") +
                num(ctx.totalUsed) +
                " (" +
                _usedPct +
                "%)",
            );
          } else if (_raw && ctx.budgetMode === "full") {
            lines.push(
              tl("server.logFormatter.budget", "    Бюджет: ") +
                num(ctx.budget) +
                tl("server.logFormatter.charsFullNoCompression", " симв. (полный, без ужимания), ") +
                tl("server.logFormatter.usedLabel", "использовано: ") +
                num(ctx.totalUsed) +
                " (" +
                _usedPct +
                "%)",
            );
          } else {
            lines.push(
              tl("server.logFormatter.budget", "    Бюджет: ") +
                num(ctx.budget) +
                tl("server.logFormatter.charsComma", " симв., ") +
                tl("server.logFormatter.usedLabel", "использовано: ") +
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
          lines.push(tl("server.logFormatter.required", "    Обязательный:"));
          for (const e of reqEntries) {
            const lbl = ctxLabelOf(e.key, intraSec).padEnd(42);
            if (e.status === "found") {
              const subMark = e.isSubstitute ? tl("server.logFormatter.substitute", " [замена]") : "";
              lines.push(
                "      ✓ " + lbl + num(e.len).padStart(7) + tl("server.logFormatter.chars", " симв.") + subMark,
              );
            } else if (e.status === "dropped") {
              lines.push(
                "      ✗ " + lbl + tl("server.logFormatter.lostBracket", "утрачён [") + String(e["note"] ?? "") + "]",
              );
            } else {
              lines.push("      ✗ " + lbl + tl("server.logFormatter.notFoundUpper", "НЕ НАЙДЕН"));
            }
          }
        }

        const optEntries = entries.filter((e) => e.priority === "optional");
        if (optEntries.length) {
          lines.push(tl("server.logFormatter.optional", "    Опциональный:"));
          for (const e of optEntries) {
            const lbl = ctxLabelOf(e.key, intraSec).padEnd(42);
            if (e.status === "found") {
              const subMark = e.isSubstitute ? tl("server.logFormatter.substitute", " [замена]") : "";
              lines.push(
                "      ✓ " + lbl + num(e.len).padStart(7) + tl("server.logFormatter.chars", " симв.") + subMark,
              );
            } else if (e.status === "truncated") {
              lines.push(
                "      ◦ " +
                  lbl +
                  num(e.len).padStart(7) +
                  tl("server.logFormatter.charsBracket", " симв. [") +
                  String(e["note"] ?? "") +
                  "]",
              );
            } else if (e.status === "skipped_budget") {
              lines.push(
                "      ◌ " +
                  lbl +
                  tl("server.logFormatter.skippedBracket", "пропущен [") +
                  String(e["note"] ?? tl("server.logFormatter.budgetExhausted", "бюджет исчерпан")) +
                  "]",
              );
            } else if (e.status === "dropped") {
              lines.push(
                "      ✗ " + lbl + tl("server.logFormatter.lostBracket", "утрачён [") + String(e["note"] ?? "") + "]",
              );
            } else {
              lines.push("      ✗ " + lbl + tl("server.logFormatter.notFound", "не найден"));
            }
          }
        }
      }
    } else {
      lines.push(tl("server.logFormatter.prevSectionsFirst", "  Контекст пред. разделов           — (первый раздел)"));
    }

    // ── Дополнительные метаданные перегенерации ──
    if (meta["hasCurrentContent"]) {
      lines.push(
        tl("server.logFormatter.currentSubsectionContent", "  Текущее содержимое подраздела ") +
          num(
            typeof meta["currentContentChars"] === "number"
              ? (meta["currentContentChars"] as number)
              : 0,
          ).padStart(7) +
          tl("server.logFormatter.charsIncluded", " симв. [включено]"),
      );
    }
    const secCtxChars =
      typeof meta["secCtxChars"] === "number" ? (meta["secCtxChars"] as number) : 0;
    if (secCtxChars > 0) {
      lines.push(
        tl("server.logFormatter.sectionExtraContext", "  Доп. контекст раздела      ") + num(secCtxChars).padStart(7) + tl("server.logFormatter.chars", " симв."),
      );
      if (typeof meta["secCtxPreview"] === "string" && meta["secCtxPreview"]) {
        lines.push("    «" + meta["secCtxPreview"] + "»");
      }
    }
    const ctxChars =
      typeof meta["ctxChars"] === "number" ? (meta["ctxChars"] as number) : 0;
    if (ctxChars > 0 && isMode) {
      lines.push(
        tl("server.logFormatter.modeContext", "  Контекст режима            ") + num(ctxChars).padStart(7) + tl("server.logFormatter.chars", " симв."),
      );
    }

    lines.push(
      tl("server.logFormatter.sectionTask", "  Задание секции             ") + num(g.taskChars).padStart(7) + tl("server.logFormatter.chars", " симв."),
    );
    lines.push(
      tl("server.logFormatter.total", "                       ИТОГО ") +
        num(g.inputChars).padStart(7) +
        tl("server.logFormatter.charsArrow", " симв. → ") +
        num(g.inputTokens) +
        tl("server.logFormatter.tokens", " токенов") +
        (g.inputChars > 0 && g.inputTokens > 0
          ? " (" + (g.inputChars / g.inputTokens).toFixed(1) + tl("server.logFormatter.charsPerToken", " с/т)")
          : ""),
    );

    // --- Выход ---
    lines.push("");
    const cost = Number(g.costUsd);
    if (g.status === "streaming") {
      lines.push(tl("server.logFormatter.outputPrefix", "ВЫХОД: ") + num(g.outputChars) + tl("server.logFormatter.charsGenerating", " симв. ⟳ генерация..."));
    } else if (g.status === "error") {
      lines.push(tl("server.logFormatter.outputError", "ВЫХОД: ⚠ ОШИБКА: ") + (g.errorMessage ?? ""));
    } else {
      lines.push(tl("server.logFormatter.outputHeading", "ВЫХОД:"));
      lines.push(
        "  " +
          num(g.outputChars) +
          tl("server.logFormatter.charsArrow", " симв. → ") +
          num(g.outputTokens) +
          tl("server.logFormatter.tokens", " токенов") +
          (g.outputChars > 0 && g.outputTokens > 0
            ? " (" + (g.outputChars / g.outputTokens).toFixed(1) + tl("server.logFormatter.charsPerToken", " с/т)")
            : ""),
      );
      lines.push(
        tl("server.logFormatter.costPrefix", "  Стоимость: $") + cost.toFixed(4) + " (" + (cost * 100).toFixed(2) + "¢)",
      );
      if (g.errorMessage) {
        lines.push(tl("server.logFormatter.errorPrefix", "  ⚠ ОШИБКА: ") + g.errorMessage);
      }
    }
    // 11.1: предупреждения разбора (metadata.parseWarnings — generation-service):
    // подставленные направления связей, роли вне ROLE_MAP, рёбра без концов,
    // подраздел, опознанный по месту. Владелец видит, что документ разобран
    // с потерями; в исходнике аналога нет — там это уходило в console.warn.
    const parseWarnings = Array.isArray(meta["parseWarnings"])
      ? (meta["parseWarnings"] as unknown[]).filter((w): w is string => typeof w === "string")
      : [];
    if (parseWarnings.length > 0) {
      lines.push(tl("server.logFormatter.parseWarningsHeader", "  ⚠ РАЗБОР С ПОТЕРЯМИ (") + parseWarnings.length + "):");
      for (const w of parseWarnings) lines.push("    ⚠ " + w);
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
      lines.push(tl("server.logFormatter.sectionsHeading", "  СЕКЦИИ:"));

      const foundMap: Record<string, SubsectionMeta> = {};
      for (const s of subs) foundMap[s.name] = s;

      for (const secName of expected) {
        const s = foundMap[secName];
        const lbl = secName.padEnd(42);
        if (s) {
          if (s.status === "streaming") {
            lines.push(
              "    ⟳ " + lbl + num(s.chars).padStart(7) + tl("server.logFormatter.charsGeneration", " симв.  генерация"),
            );
          } else {
            lines.push("    ✓ " + lbl + num(s.chars).padStart(7) + tl("server.logFormatter.chars", " симв."));
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
    lines.push(tl("server.logFormatter.totalHeading", "═══ ИТОГО ═══"));
    lines.push(tl("server.logFormatter.sectionsCount", "Разделов: ") + doneEntries.length + tl("server.logFormatter.of", " из ") + genLog.length);
    lines.push(tl("server.logFormatter.inputShort", "Вход:  ") + num(t.inC) + tl("server.logFormatter.charsArrow", " симв. → ") + num(t.inT) + tl("server.logFormatter.tokens", " токенов"));
    lines.push(tl("server.logFormatter.outputShort", "Выход: ") + num(t.outC) + tl("server.logFormatter.charsArrow", " симв. → ") + num(t.outT) + tl("server.logFormatter.tokens", " токенов"));
    lines.push(
      tl("server.logFormatter.costShort", "Стоимость: $") +
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
 * Беседа 4.2: записи без metadata.promptSkeleton проходят через
 * reconstructSkeleton (prompt-reconstruction.ts); метка «промпт недоступен
 * (импортированная запись)» — только при невозможной реконструкции.
 * Регулярки среза ПАРАМЕТРОВ несут маркеры
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

  // Беседа 4.2: контекст реконструкции — один раз на экспорт (params из
  // строки syntheses; fail-open: null → реконструкция пропускается)
  const needsReconstruction =
    entries.some(
      (g) => typeof (g.metadata as Record<string, unknown>)["promptSkeleton"] !== "string" ||
        !(g.metadata as Record<string, unknown>)["promptSkeleton"],
    );
  const rc = needsReconstruction
    ? await buildReconstructionContext(synthesisId, ctxRows, genCommon)
    : null;

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
  lines.push(tl("server.logFormatter.exportTitle", "# PHILOSYNTH PRO — ЭКСПОРТ ПРОМПТОВ"));
  lines.push("");
  lines.push(tl("server.logFormatter.date", "Дата: ") + new Date().toLocaleString("ru-RU"));
  lines.push(tl("server.logFormatter.method", "Метод: ") + ((ML as Record<string, string>)[row.method] ?? row.method));
  lines.push(
    tl("server.logFormatter.level", "Уровень: ") + ((SL as Record<string, string>)[row.synthLevel] ?? row.synthLevel),
  );
  lines.push(tl("server.logFormatter.depth", "Глубина: ") + (row.depth || "?"));
  lines.push(
    tl("server.logFormatter.order", "Порядок: ") +
      (row.generationOrder === "genetic" ? tl("server.logFormatter.orderGenetic", "генетический") : tl("server.logFormatter.orderArchitectural", "архитектурный")),
  );
  const lineageRows = await db
    .select()
    .from(synthesisLineage)
    .where(eq(synthesisLineage.synthesisId, synthesisId))
    .orderBy(asc(synthesisLineage.position));
  const phil = lineageRows
    .filter((l) => l.parentType === "philosopher" && l.parentName)
    .map((l) => l.parentName as string);
  if (phil.length) lines.push(tl("server.logFormatter.participants", "Участники: ") + phil.join(", "));
  if (row.seed) lines.push(tl("server.logFormatter.seed", "Зерно: ") + row.seed);
  // ТЗ: режим бюджета + схема селективности родительского контекста
  const _hasMetaP = lineageRows.some((l) => l.parentType === "synthesis");
  if (_hasMetaP) {
    const _mode =
      row.keepFullBudget || genCommon?.budgetMode === "full"
        ? tl("server.logFormatter.budgetFull", "полный (без ужимания)")
        : tl("server.logFormatter.budgetCompressedFactor", "ужатый (множитель сжатия 0.4)");
    lines.push(tl("server.logFormatter.budgetModeLabel", "Режим бюджета секций: ") + _mode);
    lines.push(
      tl("server.logFormatter.parentSchemeLabel", "Схема родительского контекста: ") +
        (row.parentContextSchema === "monolithic"
          ? tl("server.logFormatter.schemeMonolithic", "монолитная (legacy)")
          : tl("server.logFormatter.schemeSelective", "селективная (PARENT_DEPS_BASE, v1)")),
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
    lines.push(tl("server.logFormatter.systemPromptHeading", "## СИСТЕМНЫЙ ПРОМПТ"));
    lines.push(
      tl("server.logFormatter.systemPromptNote", "(одинаков для всех запросов; включает правила форматирования и требования к качеству)"),
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
  // Беседа 4.2: при пустом скелете первый блок восстанавливается
  // реконструкцией (reconstructBaseCtxSkeleton)
  let baseCtxText = partBaseMatch ? partBaseMatch[1]!.trim() : null;
  if (!baseCtxText && rc) {
    const rec = await reconstructBaseCtxSkeleton(rc.params, rc.genCommon);
    baseCtxText = rec.trim() || null;
  }
  if (baseCtxText) {
    lines.push(sep);
    lines.push(tl("server.logFormatter.synthesisParamsHeading", "## ПАРАМЕТРЫ СИНТЕЗА"));
    lines.push(tl("server.logFormatter.sameForAllRequests", "(одинаковы для всех запросов)"));
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
    if (isSubRegen) title += tl("server.logFormatter.tagSubsectionRegen", " [подразделовая перегенерация]");
    if (isCascade) title += tl("server.logFormatter.tagCascade", " [каскад]");
    if (isMode) title += tl("server.logFormatter.tagMode", " [режим]");

    lines.push("## " + title.toUpperCase());
    lines.push(sep);
    lines.push("");

    // Скелет промпта: metadata.promptSkeleton, иначе реконструкция (4.2)
    let skeleton = skeletonOf(g);
    if (!skeleton && rc) {
      skeleton = (await reconstructSkeleton(g, rc)) ?? "";
    }
    if (!skeleton) {
      lines.push(tl("server.logFormatter.promptUnavailable", "[промпт недоступен (импортированная запись)]"));
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
      tl("server.logFormatter.inputPrefix", "Вход: ") +
        (g.inputChars || 0).toLocaleString("ru") +
        tl("server.logFormatter.charsArrow", " симв. → ") +
        (g.inputTokens || 0).toLocaleString("ru") +
        tl("server.logFormatter.tokens", " токенов"),
    );
    lines.push(
      tl("server.logFormatter.outputShort", "Выход: ") +
        (g.outputChars || 0).toLocaleString("ru") +
        tl("server.logFormatter.charsArrow", " симв. → ") +
        (g.outputTokens || 0).toLocaleString("ru") +
        tl("server.logFormatter.tokens", " токенов"),
    );
    lines.push(tl("server.logFormatter.costShort", "Стоимость: $") + Number(g.costUsd).toFixed(4));
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
        tl("server.logFormatter.parentContextPrefix", "Контекст родителей: ") +
          parentOv.toLocaleString("ru") +
          tl("server.logFormatter.chars", " симв.") +
          (fields ? tl("server.logFormatter.fieldsParen", "  (поля: ") + fields + ")" : ""),
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
          tl("server.logFormatter.sectionContextBudget", "Бюджет секц. контекста: ") +
            _ctx.budget.toLocaleString("ru") +
            tl("server.logFormatter.of", " из ") +
            _raw.toLocaleString("ru") +
            tl("server.logFormatter.charsCompressed", " симв. [ужато]"),
        );
      } else if (_ctx.budgetMode === "full") {
        lines.push(
          tl("server.logFormatter.sectionContextBudget", "Бюджет секц. контекста: ") + _raw.toLocaleString("ru") + tl("server.logFormatter.charsFull", " симв. [полный]"),
        );
      }
    }
    if (g.status === "error") lines.push(tl("server.logFormatter.errorWarn", "⚠ ОШИБКА: ") + (g.errorMessage ?? ""));
    lines.push("");
  }

  return lines.join("\n");
}
