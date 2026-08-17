/**
 * Качество контекста раздела (беседа 2.4; 01-arch §4.15 п.3, 04 §2.1).
 * Порт getSectionContextQuality(sectionKey) [philosynth.html 5571] —
 * дыра доков, найденная беседой 1.3: модуль не создавался ни одной
 * беседой до правки 07/F.
 *
 * Адаптация DOM→БД: вместо фильтра глобального массива ctxLog — выборка
 * из context_log по (synthesis_id, section_key); «последняя запись» =
 * последняя по created_at (при перегенерациях строк несколько).
 *
 * Формула — ДОСЛОВНО исходник (а не упрощение из 07, у которого не
 * оговорены края reqTotal=0 и budget=0):
 *   reqScore    = reqTotal > 0 ? reqFound / reqTotal : 1
 *   budgetUsage = budget  > 0 ? min(1, totalUsed / budget) : 0
 *   score       = round(reqScore × 70 + budgetUsage × 30)
 *
 * Возвращаемый тип — shared SectionContextQuality { score, issues }:
 * исходник дополнительно возвращает reqFound/reqTotal/optIncluded/
 * optTotal, но потребитель (бейдж в EditSectionCard, беседа 2.3, и
 * SectionSummary.contextQualityScore) использует только score+issues —
 * лишние поля контрактом 03 §2.3 не предусмотрены.
 *
 * Потребители: routes/sections.ts (contextQualityScore — метка
 * TODO(2.4) снимается этой беседой), EditSectionCard.tsx (2.3).
 */
import { asc, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { contextLog } from "../db/schema.js";

import { CTX_LABELS } from "@philosynth/shared/constants/ctx-keys";

import type {
  ContextEntry,
  SectionContextQuality,
} from "@philosynth/shared/types/generation";

/** Строка context_log в объёме, нужном оценке качества. */
interface QualityRow {
  sectionKey: string;
  budget: number;
  totalUsed: number;
  reqFound: number;
  reqTotal: number;
  entries: ContextEntry[];
}

/** Ядро оценки — порт тела getSectionContextQuality [5571] без выборки. */
function computeQuality(entry: QualityRow): SectionContextQuality {
  const issues: string[] = [];

  // Отсутствующие обязательные
  const missingReq = entry.entries.filter(
    (e) =>
      e.priority === "required" &&
      (e.status === "missing" || e.status === "dropped"),
  );
  if (missingReq.length > 0) {
    const names = missingReq.map(
      (e) => (CTX_LABELS as Record<string, string>)[e.key] ?? e.key,
    );
    issues.push("Отсутствовали обязательные: " + names.join(", "));
  }

  // Пропущенные из-за бюджета
  const skipped = entry.entries.filter((e) => e.status === "skipped_budget");
  if (skipped.length > 0) {
    issues.push(skipped.length + " контекст(ов) пропущено из-за бюджета");
  }

  // Обрезанные
  const truncated = entry.entries.filter((e) => e.status === "truncated");
  if (truncated.length > 0) {
    issues.push(truncated.length + " контекст(ов) обрезано");
  }

  // Заменители
  const substitutes = entry.entries.filter(
    (e) => e.isSubstitute && e.status === "found",
  );
  if (substitutes.length > 0) {
    issues.push(substitutes.length + " подстановок(ки)");
  }

  // Общий score: 0-100
  const reqScore = entry.reqTotal > 0 ? entry.reqFound / entry.reqTotal : 1;
  const budgetUsage =
    entry.budget > 0 ? Math.min(1, entry.totalUsed / entry.budget) : 0;
  const score = Math.round(reqScore * 70 + budgetUsage * 30);

  return { score, issues };
}

/**
 * Качество контекста ОДНОГО раздела — по последней записи context_log.
 * null — записей по разделу нет (раздел не генерировался с контекстом,
 * например импорт без ctxLog).
 */
export async function getSectionContextQuality(
  synthesisId: string,
  sectionKey: string,
): Promise<SectionContextQuality | null> {
  const rows = await db
    .select({
      sectionKey: contextLog.sectionKey,
      budget: contextLog.budget,
      totalUsed: contextLog.totalUsed,
      reqFound: contextLog.reqFound,
      reqTotal: contextLog.reqTotal,
      entries: contextLog.entries,
      createdAt: contextLog.createdAt,
    })
    .from(contextLog)
    .where(eq(contextLog.synthesisId, synthesisId))
    .orderBy(asc(contextLog.createdAt));
  const mine = rows.filter((r) => r.sectionKey === sectionKey);
  const last = mine[mine.length - 1];
  return last ? computeQuality(last) : null;
}

/**
 * Качество ВСЕХ разделов одной выборкой (для GET /syntheses/:id/sections —
 * без N+1). Ключи карты — section_key как есть; подраздельные записи
 * («graph:Подраздел», беседа 2.2) остаются под своими составными ключами
 * и на ключи разделов не влияют. Last-win по created_at — семантика
 * «последней записи» исходника.
 */
export async function getSectionContextQualityMap(
  synthesisId: string,
): Promise<Map<string, SectionContextQuality>> {
  const rows = await db
    .select({
      sectionKey: contextLog.sectionKey,
      budget: contextLog.budget,
      totalUsed: contextLog.totalUsed,
      reqFound: contextLog.reqFound,
      reqTotal: contextLog.reqTotal,
      entries: contextLog.entries,
    })
    .from(contextLog)
    .where(eq(contextLog.synthesisId, synthesisId))
    .orderBy(asc(contextLog.createdAt));
  const map = new Map<string, SectionContextQuality>();
  for (const r of rows) map.set(r.sectionKey, computeQuality(r)); // last-win
  return map;
}
