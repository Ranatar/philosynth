/**
 * Смоук запроса 1 беседы 8.6 (модель публичности и гостевой доступ, бэкенд) —
 * без сервера, БД и браузера: чистые ядра (effectiveFlags, projectSynthesis,
 * projectPreview, metaAllowedFor, logsAllowed) + текстовые контракты
 * (миграция 0005, схема, optionalAuth, порядок роутов, гейты витрины,
 * доки, dotfile-грабля). Запуск из корня:  npx tsx tests/smoke-86-request1.mjs
 * (routes/* импортируют db — соединение открывается только при запросе,
 * 09 §4 беседа 5.3; в finally — process.exit).
 */
import { readFileSync, existsSync } from "node:fs";

import { effectiveFlags, isPublicOf } from "../packages/shared/utils/visibility.ts";
import { SYNTHESIS_VISIBILITIES } from "../packages/shared/types/synthesis.ts";
import {
  loadSynthesisForRead,
  metaAllowedFor,
  metaNotAllowedJson,
  projectPreview,
  projectSynthesis,
  showcaseForbiddenJson,
} from "../server/routes/syntheses.ts";
import { logsAllowed } from "../server/routes/logs.ts";
import { optionalAuth, requireAuth, viewerOf } from "../server/middleware/auth.ts";

let ok = 0, bad = 0;
const t = (cond, msg) => { if (cond) { ok++; console.log("  ✓", msg); } else { bad++; console.log("  ✗", msg); } };
const rd = (p) => readFileSync(p, "utf8");
// Стрип комментариев: СТРОЧНЫЕ первыми (09 §3, беседа 8.4), `[^:]` бережёт https://
const code = (src) => src.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

try {
  console.log("── A. effectiveFlags — одна функция действенности ──");
  const rowFull = { visibility: "full", showAuthor: true, showLogs: true, showPrompts: true, allowMeta: true };
  const f = effectiveFlags(rowFull);
  t(f.showAuthor && f.showLogs && f.showPrompts && f.allowMeta, "full + все true → все действенны");
  const s = effectiveFlags({ ...rowFull, visibility: "showcase" });
  t(s.showAuthor && !s.showLogs && !s.showPrompts && !s.allowMeta, "showcase гасит logs/prompts/meta, автор виден");
  const p = effectiveFlags({ ...rowFull, visibility: "private" });
  t(!p.showAuthor && !p.showLogs && !p.showPrompts && !p.allowMeta, "private — ничего не действенно");
  t(!effectiveFlags({ ...rowFull, showLogs: false }).showLogs, "full + showLogs=false → нет");
  t(isPublicOf("showcase") && isPublicOf("full") && !isPublicOf("private"), "isPublicOf производный");
  t(SYNTHESIS_VISIBILITIES.join() === "private,showcase,full", "SYNTHESIS_VISIBILITIES — три ступени");

  console.log("── B. projectSynthesis — отсечение по смотрящему ──");
  const full = {
    id: "x", title: "T", totalCostUsd: 1.5, totalInputTokens: 10, totalOutputTokens: 20,
    pausedState: { kind: "gen" }, pauseEstimates: {}, scope: "full", capsuleHtml: "<p>к</p>",
    visibility: "full", showAuthor: true, showLogs: true, showPrompts: false, allowMeta: true, isOwner: false,
  };
  const flagsOn = { showAuthor: true, showLogs: true, showPrompts: false, allowMeta: true };
  const flagsOff = { showAuthor: false, showLogs: true, showPrompts: false, allowMeta: true };
  const own = projectSynthesis(full, "owner", flagsOn, { authorName: "Автор" });
  t(own.totalCostUsd === 1.5 && own.pausedState && own.authorName === "Автор", "owner: всё + authorName");
  const usr = projectSynthesis(full, "user", flagsOn, { authorName: "Автор" });
  t(usr.totalCostUsd === 1.5 && usr.totalInputTokens === 10 && usr.pausedState, "user/full: стоимость, токены, пауза видны");
  const usrNoAuthor = projectSynthesis(full, "user", flagsOff, { authorName: "Автор" });
  t(!("authorName" in usrNoAuthor), "show_author недейственен → поля authorName нет");
  t(!("authorName" in projectSynthesis(full, "user", flagsOn, { authorName: "  " })), "пустое display_name → поля нет");
  const usrShow = projectSynthesis({ ...full, scope: "showcase" }, "user", flagsOn, {});
  t(usrShow.totalCostUsd === 1.5 && usrShow.pausedState === null && usrShow.pauseEstimates === null, "user/showcase: стоимость есть, пауза null");
  const g = projectSynthesis(full, "guest", flagsOn, { sections: [{ key: "sum" }] });
  t(!("totalCostUsd" in g) && !("totalInputTokens" in g) && !("totalOutputTokens" in g), "guest: без стоимости и токенов");
  t(g.pausedState === null && g.pauseEstimates === null, "guest: пауза null");
  t(Array.isArray(g.sections) && g.sections.length === 1, "guest/full: sections вложены (документ одним ответом)");
  const gShow = projectSynthesis({ ...full, scope: "showcase" }, "guest", flagsOn, { sections: [{ key: "sum" }] });
  t(!("sections" in gShow) && gShow.capsuleHtml === "<p>к</p>", "guest/showcase: sections нет, капсула есть");
  t(full.totalCostUsd === 1.5 && full.pausedState !== null, "исходный объект не мутирован");
  const prev = { id: "p", totalCostUsd: 2, visibility: "full" };
  t(!("totalCostUsd" in projectPreview(prev, "guest")) && projectPreview(prev, "user").totalCostUsd === 2, "projectPreview: гость без стоимости");

  console.log("── C. metaAllowedFor / logsAllowed ──");
  const mk = (viewer, row) => ({ access: "ok", row, viewer, scope: row.visibility === "showcase" ? "showcase" : "full" });
  t(metaAllowedFor(mk("owner", { ...rowFull, visibility: "private", allowMeta: false })), "своя — всегда годится");
  t(metaAllowedFor(mk("user", rowFull)), "чужая full + allow_meta → годится");
  t(!metaAllowedFor(mk("user", { ...rowFull, allowMeta: false })), "чужая full без allow_meta → нет");
  t(!metaAllowedFor(mk("user", { ...rowFull, visibility: "showcase" })), "витрина со всеми true → нет");
  const mna = metaNotAllowedJson("Имя", "id1");
  t(mna.code === "META_NOT_ALLOWED" && mna.details.title === "Имя" && mna.details.participants === "id1", "META_NOT_ALLOWED с названием в details");
  t(logsAllowed(mk("owner", { ...rowFull, visibility: "private", showLogs: false, showPrompts: false }), "logs") &&
    logsAllowed(mk("owner", { ...rowFull, visibility: "private", showLogs: false, showPrompts: false }), "prompts"), "owner: логи и запросы всегда");
  t(logsAllowed(mk("user", rowFull), "logs") && logsAllowed(mk("user", rowFull), "prompts"), "user/full/флаги → 200");
  t(!logsAllowed(mk("user", { ...rowFull, showLogs: false }), "logs") && !logsAllowed(mk("user", { ...rowFull, showPrompts: false }), "prompts"), "user без флага → 403");
  t(!logsAllowed(mk("user", { ...rowFull, visibility: "showcase" }), "logs") && !logsAllowed(mk("user", { ...rowFull, visibility: "showcase" }), "prompts"), "витрина гасит оба → 403");
  t(!logsAllowed(mk("guest", rowFull), "logs") && !logsAllowed(mk("guest", rowFull), "prompts"), "guest → 403 всегда");
  t(showcaseForbiddenJson.code === "FORBIDDEN", "showcaseForbiddenJson — код FORBIDDEN");
  const nf = await loadSynthesisForRead("not-a-uuid", null);
  t(nf.access === "notfound", "loadSynthesisForRead: не-uuid → notfound без запроса к PG (гость)");

  console.log("── D. middleware ──");
  t(typeof optionalAuth === "function" && typeof requireAuth === "function" && optionalAuth !== requireAuth, "optionalAuth рядом с requireAuth, отдельная функция");
  const fakeC = { get: () => undefined };
  t(viewerOf(fakeC) === null, "viewerOf без user → null");
  const authSrc = rd("server/middleware/auth.ts");
  t(!/export const requireAuth[\s\S]*?c\.set\("user", null\)/.test(authSrc.split("export const optionalAuth")[0]), "requireAuth не тронут (в нём нет user=null)");
  t(/optionalAuth[\s\S]*clearSessionCookie\(c\)[\s\S]*c\.set\("user", null\)/.test(authSrc), "optionalAuth: мёртвый cookie подчищен, user=null, без 401");
  t(!/optionalAuth[\s\S]*AUTH_REQUIRED/.test(authSrc.split("export const optionalAuth")[1]), "optionalAuth не отвечает AUTH_REQUIRED");

  console.log("── E. миграция 0005 и схема ──");
  const mig = rd("server/db/migrations/0005_visibility.sql");
  const order = ["ADD COLUMN \"visibility\"", "ADD COLUMN \"show_author\"", "ADD COLUMN \"show_logs\"", "ADD COLUMN \"show_prompts\"", "ADD COLUMN \"allow_meta\"",
    "UPDATE \"syntheses\" SET \"visibility\" = CASE WHEN \"is_public\" THEN 'full' ELSE 'private' END", "DROP INDEX \"idx_syntheses_public\"", "DROP COLUMN \"is_public\"", "CREATE INDEX \"idx_syntheses_visibility\"", "syntheses_visibility_check"];
  const idxs = order.map((x) => mig.indexOf(x));
  t(idxs.every((i) => i >= 0) && idxs.every((i, k) => k === 0 || i > idxs[k - 1]), "0005: ADD ×5 → UPDATE перенос → DROP INDEX → DROP is_public → INDEX → CHECK, в этом порядке");
  t(/DEFAULT true NOT NULL/.test(mig.split("allow_meta")[1] ?? "") && /"show_logs" boolean DEFAULT true/.test(mig), "allow_meta и show_logs DEFAULT true (возможность не отнята)");
  t(/"show_author" boolean DEFAULT false/.test(mig) && /"show_prompts" boolean DEFAULT false/.test(mig), "show_author и show_prompts DEFAULT false");
  const journal = JSON.parse(rd("server/db/migrations/meta/_journal.json"));
  t(journal.entries.at(-1).tag === "0005_visibility" && journal.entries.at(-1).idx === 5, "журнал: запись 0005_visibility");
  const snap = JSON.parse(rd("server/db/migrations/meta/0005_snapshot.json"));
  const cols = snap.tables["public.syntheses"].columns;
  t(!cols.is_public && cols.visibility && cols.show_author && cols.show_logs && cols.show_prompts && cols.allow_meta, "снапшот 0005: колонки как в schema.ts");
  t(snap.tables["public.syntheses"].checkConstraints.syntheses_visibility_check && snap.tables["public.syntheses"].indexes.idx_syntheses_visibility, "снапшот 0005: CHECK и индекс");
  t(snap.prevId === JSON.parse(rd("server/db/migrations/meta/0004_snapshot.json")).id, "снапшот 0005 ссылается на 0004");
  const schema = rd("server/db/schema.ts");
  t(!/isPublic|is_public/.test(code(schema)), "schema.ts: is_public нет (вне комментариев)");
  t(/enum: \["private", "showcase", "full"\]/.test(schema) && /check\(\s*"syntheses_visibility_check"/.test(schema), "schema.ts: enum visibility + check");

  console.log("── F. роуты: два источника правды не осталось ──");
  const srvFiles = ["syntheses", "logs", "export", "lineage", "billing", "sections", "elements", "modes", "transforms", "enrichment", "plans", "generation", "import", "auth"];
  // Допустимые остатки isPublic в коде: производное поле DTO (isPublic: isPublicOf),
  // синоним в теле PATCH (body.isPublic / details.isPublic). Колонки — ни одной.
  const leftovers = srvFiles.filter((f) => /\bisPublic\b|is_public/.test(
    code(rd(`server/routes/${f}.ts`)).replace(/isPublic: isPublicOf\(row\.visibility\)/g, "").replace(/body\.isPublic|details\.isPublic/g, "")));
  const synSrc = rd("server/routes/syntheses.ts");
  t(!/row\.isPublic|syntheses\.isPublic|eq\(syntheses\.isPublic/.test(synSrc + rd("server/routes/lineage.ts")), "чтений колонки is_public в роутах нет");
  t(/body\.isPublic[\s\S]*patch\.visibility = body\.isPublic \? "full" : "private"/.test(synSrc), "PATCH: isPublic — синоним ступени");
  t(/isPublic: isPublicOf\(row\.visibility\)/.test(synSrc), "DTO: isPublic производный");
  t(synSrc.indexOf('synthesesRoutes.get("/public", optionalAuth') !== -1 && synSrc.indexOf('synthesesRoutes.get("/:id", optionalAuth') !== -1, "GET /public и GET /:id под optionalAuth");
  t(synSrc.indexOf('synthesesRoutes.get("/public"') < synSrc.indexOf('synthesesRoutes.get("/:id"'), "/public ДО /:id");
  t((code(synSrc).match(/, optionalAuth,/g) ?? []).length === 2, "optionalAuth в syntheses.ts ровно у двух роутов");
  t(/ne\(syntheses\.visibility, "private"\)/.test(synSrc), "публичный каталог — visibility <> 'private'");
  t(/metaAllowedFor\(access\)[\s\S]*metaNotAllowedJson/.test(synSrc), "участники: гейт allow_meta → META_NOT_ALLOWED");
  t(/visibility: "private",/.test(synSrc) && !/isPublic: false/.test(synSrc), "duplicate: visibility='private'");
  const bill = rd("server/routes/billing.ts");
  t(bill.indexOf('billingRoutes.get("/plans", optionalAuth') !== -1 && bill.indexOf('billingRoutes.get("/plans"') < bill.indexOf('billingRoutes.use("*", requireAuth)'), "GET /plans под optionalAuth ДО requireAuth");
  t(bill.indexOf('billingRoutes.post("/webhook"') < bill.indexOf('billingRoutes.use("*", requireAuth)'), "webhook по-прежнему до requireAuth");
  t((code(bill).match(/, optionalAuth,/g) ?? []).length === 1, "в billing optionalAuth только у /plans");
  for (const [f, n] of [["sections", 3], ["elements", 5], ["modes", 2], ["transforms", 1], ["enrichment", 2]]) {
    const src = rd(`server/routes/${f}.ts`);
    t((src.match(/res\.scope === "showcase"\) return c\.json\(showcaseForbiddenJson, 403\)/g) ?? []).length === n, `${f}.ts: гейт витрины ×${n} (по числу loadSynthesisForRead)`);
  }
  const logsSrc = rd("server/routes/logs.ts");
  t((logsSrc.match(/logsAllowed\(res, "logs"\)/g) ?? []).length === 3 && (logsSrc.match(/logsAllowed\(res, "prompts"\)/g) ?? []).length === 1, "logs.ts: гейт на четырёх путях (3 logs + 1 prompts)");
  t((logsSrc.match(/requireAuth/g) ?? []).length >= 5, "logs.ts: requireAuth не ослаблен");
  const exp = rd("server/routes/export.ts");
  t(/access\.scope === "showcase"\) return c\.json\(showcaseForbiddenJson, 403\)/.test(exp) && /exportHTML\(id, \{ includeLogs \}\)/.test(exp), "export: витрина 403 + includeLogs");
  const he = rd("server/services/export/html-exporter.ts");
  t(/includeLogs\s*\?\s*await loadExportLogs/.test(he) && /includeLogs && \(genRows\.length/.test(he), "html-exporter: логи и блок «◈ Лог» под includeLogs");
  const lin = rd("server/routes/lineage.ts");
  t((lin.match(/ne\(syntheses\.visibility, "private"\)/g) ?? []).length === 2, "lineage: pruneInvisible и /search на visibility");
  t(/eq\(parentRow\.userId|parent\.row\.userId|userId !== user\.id/.test(lin) || /владел/i.test(lin), "POST link — владельческий (не тронут)");
  t(leftovers.length === 0, `упоминаний is_public/isPublic как колонки в роутах нет (${leftovers.join(",") || "—"})`);

  console.log("── G. типы, аудит, клиент ──");
  const types = rd("packages/shared/types/synthesis.ts");
  t(!/SynthesisFullGuest|SynthesisPreviewGuest|SynthesisFullResponse/.test(types) && /totalInputTokens\?: number;[\s\S]*totalOutputTokens\?: number;[\s\S]*totalCostUsd\?: number;[\s\S]*sections\?: SectionFull\[\];/.test(types), "shared: cost-поля и sections необязательны, гостевых типов нет (пересмотр)");
  t(/totalCostUsd\?: number;/.test(types.split("export interface SynthesisPreview")[1]), "SynthesisPreview.totalCostUsd необязателен");
  const footer = rd("client/src/components/document/DocumentFooter.tsx");
  t(/hasCost &&/.test(footer) && !/synthesis\.totalInputTokens\.toLocaleString/.test(footer), "DocumentFooter: строка стоимости только при определённых значениях (единственная правка client/)");
  const he2 = rd("server/services/export/html-exporter.ts");
  t(/function renderDocFooter/.test(he2) && /docHTML \+= renderDocFooter\(s\)/.test(he2) && /id="footerCost"[^<]*Токены: /.test(he2) && /id="footerPhil"/.test(he2), "html-exporter: зеркало DocumentFooter восстановлено (futer с footerCost/footerPhil)");
  t(/visibility: SynthesisVisibility;[\s\S]*showAuthor: boolean;[\s\S]*allowMeta: boolean;[\s\S]*authorName\?: string;[\s\S]*scope: SynthesisScope;/.test(types), "SynthesisFull += visibility/флаги/authorName?/scope");
  t(/@deprecated 8\.6/.test(types), "isPublic помечен @deprecated");
  t(/"isPublic", "authorName", "scope", "sections"/.test(rd("server/audit.mts")), "audit.mts: typeOnly += isPublic/authorName/scope/sections");
  t(/"META_NOT_ALLOWED"/.test(rd("client/src/api/client.ts")), "ApiErrorCode += META_NOT_ALLOWED (велено п.8)");
  const clientDiff = ["client/src/components/catalog/SynthesisCard.tsx", "client/src/pages/CatalogPage.tsx", "client/src/components/document/DocumentFooter.tsx"];
  t(clientDiff.every((f) => existsSync(f)), "клиентские потребители isPublic/стоимости на месте (не правились)");

  console.log("── H. доки и dotfile ──");
  const d02 = rd("docs/02-data-model.md"), d03 = rd("docs/03-specification.md");
  t(/visibility\s+TEXT NOT NULL DEFAULT 'private'/.test(d02) && !/is_public\s+BOOLEAN NOT NULL DEFAULT false,\n/.test(d02), "02 §2.3: visibility вместо is_public");
  t(/idx_syntheses_visibility/.test(d02), "02: индекс visibility");
  t(/META_NOT_ALLOWED\s+— POST \/syntheses/.test(d03) && /Гость в SynthesisFull/.test(d03) && !/SynthesisFullGuest/.test(d03) && /GET    \/billing\/plans[\s\S]{0,200}БЕЗ ВХОДА/.test(d03) && /Футер в экспорте/.test(d03), "03: код, гость в SynthesisFull, /plans без входа, футер экспорта");
  t(/optionalAuth/.test(rd("docs/05-file-structure.md")) && /0005_visibility\.sql/.test(rd("docs/05-file-structure.md")), "05: optionalAuth и 0005");
  t(/Ступень видимости `syntheses\.visibility`/.test(rd("docs/01-architecture.md")), "01 §6: авторизация на ступенях");
  t(existsSync("env.local.example") && !existsSync(".env.local.example"), "env.local.example без точки, старого нет");
  t(/^dev-billing-state\/$/m.test(rd(".gitignore")), ".gitignore: dev-billing-state/");
  t(/STRIPE_PRICE_STARTER=/.test(rd(".env.example")), ".env.example: STRIPE_PRICE_*");
  const dev = rd("tools/dev-billing.sh");
  t(/STATE_DIR="\$ROOT\/dev-billing-state"/.test(dev) && /ENV_EXAMPLE="\$ROOT\/env\.local\.example"/.test(dev), "dev-billing.sh на новых именах");
  const ic = rd("server/integration-check.mts");
  t(/rd\("\.\.\/env\.local\.example"\)/.test(ic) && /dev-billing-state/.test(ic) && /existsSync\("\.\.\/\.env\.local\.example"\)/.test(ic), "4ak/4al: новые имена + запрет старого");
  t(/'synthesesRoutes\.get\("\/public", optionalAuth'/.test(ic), "4o переведена на optionalAuth");
} catch (err) {
  bad++;
  console.error("  ✗ исключение:", err);
} finally {
  console.log(`\nИТОГ smoke-86-request1: ${ok} ✓ / ${bad} ✗`);
  process.exit(bad ? 1 : 0);
}
