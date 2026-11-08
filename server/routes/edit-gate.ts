/**
 * Гейт правки синтеза в роутах — ОДНА функция (беседа 16.1) вместо четырёх
 * копий `ownerEditGate` (elements 5.1, enrichment 5.3, modes 4.1,
 * transforms 5.5), `ownerGate` (generation 2.2) и `ownerReadGate`
 * (recommendations 10.1). Порядок проверок и ответы — побайтно прежние:
 *   не-UUID → 404 (правило 4aa: до запроса к PG); строки нет → 404;
 *   права edit нет → 403 FORBIDDEN; активная операция → 409
 *   GENERATION_IN_PROGRESS (если activeOp не выключен — у чтения
 *   рекомендаций его не было).
 * Кто имеет право edit, решает модуль прав (services/capabilities): в 16.1
 * — владелец, с 17.1 — и редактор; сюда это не возвращается.
 */
import type { Context } from "hono";
import { eq } from "drizzle-orm";

import { db, schema } from "../db/index.js";
import { capabilitiesOfRow } from "../services/capabilities.js";
import { isGenerationActive } from "../services/generation-service.js";
import { forbiddenJson, isUuid, notFoundJson } from "./syntheses.js";
import { tl } from "@philosynth/shared/i18n/t";

const { syntheses } = schema;

export interface EditGateOptions {
  /** Отказывать 409 при активной операции над синтезом (умолчание — да) */
  activeOp?: boolean;
}

/** null — гейты пройдены; иначе готовый ответ. */
export async function editGate(
  c: Context,
  id: string,
  userId: string,
  opts: EditGateOptions = {},
): Promise<Response | null> {
  if (!isUuid(id)) return c.json(notFoundJson, 404);
  const [row] = await db
    .select({ id: syntheses.id, userId: syntheses.userId, visibility: syntheses.visibility })
    .from(syntheses)
    .where(eq(syntheses.id, id))
    .limit(1);
  if (!row) return c.json(notFoundJson, 404);
  const caps = await capabilitiesOfRow(row, userId);
  if (!caps.edit) return c.json(forbiddenJson, 403);
  if (opts.activeOp !== false && isGenerationActive(id))
    return c.json(
      { error: tl("common.generationInProgress", "Генерация уже идёт"), code: "GENERATION_IN_PROGRESS" },
      409,
    );
  return null;
}
