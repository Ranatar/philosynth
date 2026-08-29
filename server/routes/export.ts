/**
 * Роуты экспорта (беседа 4.2; 03-spec §2.11):
 *
 *   GET /syntheses/:id/export/html → text/html      (автономный документ)
 *   GET /syntheses/:id/export/md   → text/markdown  (saveMD)
 *   GET /syntheses/:id/export/mmd  → text/plain     (Mermaid-диаграмма)
 *   GET /syntheses/:id/export/png  → image/png      (Canvas-рендер графа)
 *   GET /syntheses/:id/export/json → application/json (граф-структура)
 *
 * Решения:
 *  - Доступ на чтение — владелец ИЛИ is_public (loadSynthesisForRead,
 *    паттерн транспорта чтения 1.6); 403/404 по §4.3.
 *  - Content-Disposition: attachment с именем getDocFilename (кириллица
 *    в названиях мета-синтезов → RFC 5987 filename*=UTF-8''…; в filename=
 *    без звёздочки — транслит-безопасная часть уже латиницей).
 *  - ExportError NO_GRAPH (mmd/png/json синтеза без графа) → 400
 *    VALIDATION_ERROR — edge case протокола 4.2 (alert исходника).
 *  - json сериализуется JSON.stringify(_, null, 2) — как downloadFile
 *    исходника [17342].
 */
import { Hono } from "hono";

import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import {
  ExportError,
  exportFilename,
  loadExportSynthesis,
} from "../services/export/common.js";
import { exportHTML } from "../services/export/html-exporter.js";
import { exportJSON } from "../services/export/json-exporter.js";
import { exportMD } from "../services/export/md-exporter.js";
import { exportMMD } from "../services/export/mmd-exporter.js";
import { exportPNG } from "../services/export/png-exporter.js";
import { forbiddenJson, loadSynthesisForRead, notFoundJson } from "./syntheses.js";

import type { Context } from "hono";

export const exportRoutes = new Hono<AuthEnv>();
exportRoutes.use("*", requireAuth);

/** Заголовок скачивания: ASCII-fallback + RFC 5987 для не-ASCII имён. */
function contentDisposition(filename: string): string {
  // eslint-disable-next-line no-control-regex
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

type ExportFormat = "html" | "md" | "mmd" | "png" | "json";

const CONTENT_TYPE: Record<ExportFormat, string> = {
  html: "text/html; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  mmd: "text/plain; charset=utf-8",
  png: "image/png",
  json: "application/json; charset=utf-8",
};

async function handleExport(
  c: Context<AuthEnv>,
  fmt: ExportFormat,
): Promise<Response> {
  const user = c.get("user");
  const id = c.req.param("id") ?? "";
  const access = await loadSynthesisForRead(id, user.id);
  if (access.access === "notfound") return c.json(notFoundJson, 404);
  if (access.access === "forbidden") return c.json(forbiddenJson, 403);

  try {
    const s = await loadExportSynthesis(id);
    let body: string | Buffer;
    switch (fmt) {
      case "html":
        body = await exportHTML(id);
        break;
      case "md":
        body = await exportMD(id);
        break;
      case "mmd":
        body = await exportMMD(id);
        break;
      case "png":
        body = await exportPNG(id);
        break;
      case "json":
        body = JSON.stringify(
          await exportJSON(id, { docNum: s.row.docNum, title: s.row.title }),
          null,
          2,
        );
        break;
    }
    const filename = exportFilename(s, fmt);
    c.header("Content-Type", CONTENT_TYPE[fmt]);
    c.header("Content-Disposition", contentDisposition(filename));
    return c.body(
      typeof body === "string" ? body : new Uint8Array(body),
      200,
    );
  } catch (err) {
    if (err instanceof ExportError) {
      if (err.code === "NOT_FOUND") return c.json(notFoundJson, 404);
      // NO_GRAPH: «Нет графа.» исходника → 400 (edge case протокола 4.2)
      return c.json(
        { error: err.message, code: "VALIDATION_ERROR" },
        400,
      );
    }
    throw err;
  }
}

exportRoutes.get("/:id/export/html", (c) => handleExport(c, "html"));
exportRoutes.get("/:id/export/md", (c) => handleExport(c, "md"));
exportRoutes.get("/:id/export/mmd", (c) => handleExport(c, "mmd"));
exportRoutes.get("/:id/export/png", (c) => handleExport(c, "png"));
exportRoutes.get("/:id/export/json", (c) => handleExport(c, "json"));
