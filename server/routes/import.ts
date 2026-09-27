/**
 * Роут импорта (беседа 4.3; 03-spec §2.2):
 *
 *   POST /syntheses/import — multipart/form-data, поле file (HTML)
 *                          → { id, warnings: ImportWarning[],
 *                              lineageCandidates: LineageCandidate[] } (8.5)
 *
 * Решения:
 *  - requireAuth: импорт создаёт синтез владельцем-пользователем сессии.
 *  - Отсутствие поля file / не-файл → 400 VALIDATION_ERROR + details.file.
 *  - ImportError (не PhiloSynth-файл, ни одного раздела) → 400
 *    IMPORT_INVALID (03 §4.3) с текстом исходника.
 *  - Лимит размера: 25 МБ (исходник ~1.3 МБ; потолок с запасом) → 400
 *    VALIDATION_ERROR — защита от залива произвольного файла в память.
 *  - Критические предупреждения НЕ блокируют импорт (confirm исходника —
 *    браузерный; клиент показывает warnings ответа) — адаптация 3
 *    import-service.
 */
import { Hono } from "hono";

import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import { ImportError, importHTML } from "../services/import-service.js";
import { tl } from "@philosynth/shared/i18n/t";

export const importRoutes = new Hono<AuthEnv>();
importRoutes.use("*", requireAuth);

/** 25 МБ — потолок размера импортируемого файла */
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

importRoutes.post("/import", async (c) => {
  const user = c.get("user");

  let body: Record<string, unknown>;
  try {
    body = await c.req.parseBody();
  } catch {
    return c.json(
      {
        error: tl("server.routes.import.multipartReadFailed", "Не удалось прочитать multipart/form-data"),
        code: "VALIDATION_ERROR",
      },
      400,
    );
  }

  const file = body["file"];
  if (!(file instanceof File)) {
    return c.json(
      {
        error: tl("server.routes.import.multipartExpected", "Ожидается multipart/form-data с полем file (HTML-файл)"),
        code: "VALIDATION_ERROR",
        details: { file: tl("server.routes.import.requiredFieldLower", "обязательное поле") },
      },
      400,
    );
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return c.json(
      {
        error: tl("server.routes.import.fileTooLarge", "Файл превышает предел 25 МБ"),
        code: "VALIDATION_ERROR",
        details: { file: tl("server.routes.import.tooLarge", "слишком большой") },
      },
      400,
    );
  }

  const html = await file.text();

  try {
    const { synthesisId, warnings, lineageCandidates } = await importHTML(
      html,
      user.id,
      file.name,
    );
    return c.json({ id: synthesisId, warnings, lineageCandidates });
  } catch (err) {
    if (err instanceof ImportError) {
      return c.json({ error: err.message, code: "IMPORT_INVALID" }, 400);
    }
    throw err;
  }
});
