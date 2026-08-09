/**
 * Structure Tracker (беседа 2.2; 04-code-reuse-map §4 «Новое», 05):
 * refreshSumDef() [5808], regenStructureFromEditModal() (клиентская кнопка —
 * беседа 2.3; её серверная часть = regenerateSubsection("sum",
 * "Структура документа")), отслеживание structureSections (v10).
 *
 * Адаптации DOM/DOC_STATE → сервис (задокументированные отступления):
 *  - В исходнике sectionDefs живут в DOC_STATE и устаревают после
 *    add/delete — refreshSumDef пересобирает def «sum», чтобы подраздел
 *    «Структура документа» содержал актуальный перечень разделов. На
 *    сервере defs НЕ персистятся: каждая (пере)генерация строит их заново
 *    из текущего syntheses.section_order, поэтому «Структура документа»
 *    актуальна автоматически. refreshSumDef здесь — явная функция
 *    соответствия карте 04: возвращает свежий def «sum» по текущему
 *    состоянию (потребители: regenerateSubsection("sum", …) через
 *    штатную пересборку infra, тесты).
 *  - DOC_STATE.structureSections → syntheses.structure_sections (02 §2.3):
 *    снимок пишется при генерации (беседа 1.4/1.6 — при создании) и при
 *    перегенерации подраздела «Структура документа» [20461]
 *    (updateStructureSections — вызов из regenerateSubsection, 2.2).
 *  - Карточка «Структура устарела» [18410]: sectionOrder ≠
 *    structureSections — сравнение перенесено в isStructureOutdated;
 *    отрисовка и confirm — клиент (2.3), данные уже в SynthesisFull (1.6).
 */
import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { syntheses } from "../db/schema.js";

import {
  buildSectionDefs,
  patchPromptsWithSecCtx,
  type SectionDefFull,
} from "./section-defs-builder.js";

import type { PromptParams } from "./prompt-builder.js";

/** Имя подраздела-снимка (дословно из исходника). */
export const STRUCTURE_SUBSECTION = "Структура документа";

/**
 * Порт refreshSumDef() [5808]: свежий def «sum» по текущему перечню
 * разделов. p.sec обязан быть УЖЕ без «sum» (fullP исходника:
 * sectionOrder.filter(k => k !== "sum")); номер сохраняется вызывающим
 * (исходник: newSumDef.num = старый num).
 */
export async function refreshSumDef(
  p: PromptParams & { secCtx?: Record<string, string> | undefined },
  keepNum?: number,
): Promise<SectionDefFull | null> {
  const defs = await buildSectionDefs(p);
  patchPromptsWithSecCtx(defs, p.secCtx ?? {});
  const sumDef = defs.find((d) => d.key === "sum") ?? null;
  if (sumDef && keepNum !== undefined) sumDef.num = keepNum;
  return sumDef;
}

/**
 * Снимок structureSections [20461]: перегенерация «Структура документа»
 * фиксирует текущий sectionOrder.
 */
export async function updateStructureSections(
  synthesisId: string,
  sectionOrder: readonly string[],
): Promise<void> {
  await db
    .update(syntheses)
    .set({ structureSections: [...sectionOrder], updatedAt: new Date() })
    .where(eq(syntheses.id, synthesisId));
}

/**
 * Порт проверки «Структура устарела» [18410–18412]: null = неизвестно
 * (документ без снимка — тоже «устарела» с пометкой isUnknown у клиента),
 * иначе — покомпонентное сравнение с sectionOrder.
 */
export function isStructureOutdated(
  structureSections: readonly string[] | null,
  sectionOrder: readonly string[],
): boolean {
  if (structureSections === null) return true;
  return JSON.stringify(structureSections) !== JSON.stringify(sectionOrder);
}
