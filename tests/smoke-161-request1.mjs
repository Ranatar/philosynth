/**
 * Дымовой прогон беседы 16.1, первый запрос (серверный слой обсуждения):
 *   A — чистые функции (модуль прав, адреса, plainText) и исходники;
 *   B — живьём (PG + Redis, app.request без порта): матрица прав
 *       владелец / участник / приглашённый / чужой / гость на private,
 *       showcase, full; паритет гейта правки (участник НЕ правит);
 *       комментарии (ветки, статусы, скрытие, удаление с заглушкой);
 *       адреса: правка → outdated, пересоздание через saveGraphToDb →
 *       current с новым id; рецензии (черновик → публикация → редакции →
 *       отзыв); сводка; удаление аккаунта участника.
 *
 * Запуск (из корня, PG/Redis подняты, миграции до 0017, сиды на месте):
 *   npx tsx tests/smoke-161-request1.mjs
 * Образец концепции — sample/*.html (импорт через importHTML напрямую).
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { Hono } from "hono";

const ROOT = new URL("../", import.meta.url).pathname;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
process.env.NODE_ENV = "development";
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 900) : ""}`); }
}
const TAG = "s161-" + Math.random().toString(36).slice(2, 7);
const rd = (rel) => readFileSync(ROOT + rel, "utf8");
const strip = (src) => src.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

const LOC = await import("../server/i18n/locale.ts");
LOC.installServerCatalogProvider();
const CAP = await import("../server/services/capabilities.ts");
const ADDR = await import("@philosynth/shared/utils/discussion-address");
const DA = await import("../server/services/discussion-address.ts");
const GP = await import("../server/services/graph-parser.ts");
const IS = await import("../server/services/import-service.ts");
const AD = await import("../server/services/account-deletion.ts");
const RS = await import("../server/routes/syntheses.ts");
const { elementsRoutes } = await import("../server/routes/elements.ts");
const { sectionsRoutes } = await import("../server/routes/sections.ts");
const { discussionRoutes } = await import("../server/routes/discussion.ts");
const { closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");

console.log("\n■ A. Чистые функции и исходники");
{
  const row = { userId: "U1", visibility: "private" };
  const g = CAP.capabilitiesFor(row, null);
  const o = CAP.capabilitiesFor(row, "U1");
  const s = CAP.capabilitiesFor(row, "U2");
  const r = CAP.capabilitiesFor(row, "U2", { role: "reviewer", status: "active" });
  const e = CAP.capabilitiesFor(row, "U2", { role: "editor", status: "active" });
  const inv = CAP.capabilitiesFor(row, "U2", { role: "reviewer", status: "invited" });
  ok(!g.read && g.role === "guest" && o.read && o.discuss && o.edit && o.manage && o.role === "owner" && !s.read && s.role === "reader", "A1 права: гость/владелец/чужой на private");
  ok(r.read && r.discuss && !r.edit && !r.manage && r.role === "reviewer" && e.read && e.discuss && !e.edit && !e.manage && e.role === "editor", "A2 участник читает и обсуждает; редактор БЕЗ права edit до 17.1");
  ok(!inv.read && inv.role === "reader" && CAP.capabilitiesFor({ userId: "U1", visibility: "full" }, null).read && !CAP.capabilitiesFor({ userId: "U1", visibility: "showcase" }, "U2").discuss, "A3 приглашённый (не принял) — как читатель; публичная даёт read, но не discuss");
  ok(CAP.canManageSynthesis(row, "U1") && !CAP.canManageSynthesis(row, "U2") && !CAP.canManageSynthesis(row, null) && CAP.canEditSynthesis(row, "U1") && !CAP.canEditSynthesis(row, "U2", { role: "editor", status: "active" }), "A4 canManage/canEdit");
  ok(ADDR.categoryKey("  Бытие  ") === ADDR.categoryKey("бытие") && ADDR.edgeKey("A", "B", "Причинность") === "a→b|причинность" && ADDR.thesisKey("T1.2", 5) === "T1.2" && ADDR.thesisKey(null, 5) === "5" && ADDR.subsectionKey("graph", "x:y") === "graph:x:y" && ADDR.parseSubsectionKey("graph:x:y")?.dataSection === "x:y", "A5 ключи адресов");
  ok(ADDR.canonicalJson({ b: 1, a: { d: [2, { z: 1, y: undefined }], c: "x" } }) === ADDR.canonicalJson({ a: { c: "x", d: [2, { z: 1 }] }, b: 1 }), "A6 canonicalJson — порядок ключей не влияет, undefined выпадает");
  const h1 = await ADDR.contentHash("category", { name: "A", definition: "d" }), h2 = await ADDR.contentHash("category", { definition: "d", name: "A" }), h3 = await ADDR.contentHash("category", { name: "A", definition: "e" });
  ok(h1 === h2 && h1 !== h3 && /^[0-9a-f]{64}$/.test(h1) && (await ADDR.contentHash("synthesis", { any: 1 })) === "", "A7 contentHash: sha256 hex, synthesis — пусто");
  ok(ADDR.plainText("a\r\n\n\n\nb \u0007 c  ") === "a\n\nb  c" && ADDR.plainText("<b>x</b>") === "<b>x</b>" && ADDR.excerptOf("x".repeat(400)).length <= 300, "A8 plainText не трогает разметку (экранирует клиент), чистит управляющие; excerpt ≤ 300");
  const addr = { kind: "category", key: "a", id: "old", hash: h1, version: 1 };
  ok(ADDR.resolutionOf(addr, null).state === "deleted" && ADDR.resolutionOf(addr, { id: "new", hash: h1, version: 1 }).state === "current" && ADDR.resolutionOf(addr, { id: "old", hash: h3, version: 2 }).state === "outdated", "A9 resolutionOf: deleted / current (новый id) / outdated");
  const disc = strip(rd("server/services/discussion.ts")) + strip(rd("server/routes/discussion.ts"));
  const daddr = strip(rd("server/services/discussion-address.ts"));
  ok(!/html-parser|sanitiz/.test(disc) && !/sanitiz/.test(daddr) && !/\.update\(|\.insert\(|\.delete\(/.test(daddr) && !/\.update\(sections\)|\.insert\(sections\)|capsuleHtml|\.update\(categories\)|\.insert\(categories\)|\.delete\(categories\)/.test(disc), "A10 обсуждение не импортирует разбор/чистку HTML (адресный индекс лишь читает подразделы) и не пишет в документ");
  const files = ["server/routes/elements.ts", "server/routes/enrichment.ts", "server/routes/modes.ts", "server/routes/transforms.ts", "server/routes/generation.ts", "server/routes/recommendations.ts", "server/routes/sections.ts", "server/routes/plans.ts", "server/routes/lineage.ts", "server/routes/syntheses.ts", "server/ws/handler.ts", "server/services/edit-planner.ts", "server/services/pause-resume-service.ts", "server/services/generation-service.ts", "server/services/plan-executor.ts", "server/routes/discussion.ts", "server/services/discussion.ts"];
  const direct = files.filter((f) => /\.userId\s*!==\s*(user\.id|userId)\b|\.userId\s*===\s*(user\.id|userId)\b/.test(strip(rd(f))));
  ok(direct.length === 3 && direct.includes("server/services/plan-executor.ts") && direct.includes("server/services/edit-planner.ts") && direct.includes("server/services/generation-service.ts"), "A11 прямых сравнений userId вне capabilities — только авторство плана (edit-planner, plan-executor) и запуска (activeRuns)", direct);
  ok(/function isOwner\(/.test(rd("server/services/capabilities.ts")) && !/ownerEditGate\(|ownerGate\(|ownerReadGate\(/.test(files.map((f) => strip(rd(f))).join("")), "A12 ownerEditGate/ownerGate/ownerReadGate больше нет; isOwner живёт в capabilities.ts");
  const journal = JSON.parse(rd("server/db/migrations/meta/_journal.json"));
  ok(journal.entries.length >= 18 && journal.entries[17].tag === "0017_discussion" && /synthesis_members/.test(rd("server/db/migrations/0017_discussion.sql")), "A13 миграция 0017_discussion восемнадцатая");
}

console.log("\n■ B. Живьём");
const userIds = [];
const app = new Hono();
app.route("/syntheses", RS.synthesesRoutes);
app.route("/syntheses", elementsRoutes);
app.route("/syntheses", sectionsRoutes);
app.route("/syntheses", discussionRoutes);
async function mkUser(name) {
  const [u] = await sql`insert into users (email, password_hash, display_name) values (${`${TAG}-${name}@s.local`}, 'x', ${name}) returning id`;
  userIds.push(u.id);
  const token = `${TAG}-${name}-${Date.now()}`;
  await sql`insert into sessions (id, user_id, expires_at) values (${createHash("sha256").update(token).digest("hex")}, ${u.id}, now() + interval '1 hour')`;
  return { id: u.id, cookie: `philosynth_session=${token}` };
}
const call = async (method, path, body, who) => {
  const r = await app.request(path, { method, headers: { "content-type": "application/json", ...(who ? { cookie: who.cookie } : {}) }, body: body === undefined ? undefined : J(body) });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
};
try {
  const owner = await mkUser("owner"), rev = await mkUser("rev"), rev2 = await mkUser("rev2"), stranger = await mkUser("str"), invited = await mkUser("inv");
  const sampleFile = readdirSync(ROOT + "sample").find((f) => f.endsWith(".html"));
  const { synthesisId: S } = await IS.importHTML(rd("sample/" + sampleFile), owner.id, sampleFile);
  ok(!!S, "B0 импорт образца владельцем");
  await sql`insert into synthesis_members (synthesis_id, user_id, role, status, invited_by, accepted_at) values (${S}, ${rev.id}, 'reviewer', 'active', ${owner.id}, now()), (${S}, ${rev2.id}, 'editor', 'active', ${owner.id}, now()), (${S}, ${invited.id}, 'reviewer', 'invited', ${owner.id}, null)`;

  // B1 матрица чтения на private
  const secR = await call("GET", `/syntheses/${S}/sections`, undefined, rev), secS = await call("GET", `/syntheses/${S}/sections`, undefined, stranger);
  const gO = await call("GET", `/syntheses/${S}`, undefined, owner), gR = await call("GET", `/syntheses/${S}`, undefined, rev), gE = await call("GET", `/syntheses/${S}`, undefined, rev2), gS = await call("GET", `/syntheses/${S}`, undefined, stranger), gI = await call("GET", `/syntheses/${S}`, undefined, invited), gG = await call("GET", `/syntheses/${S}`);
  ok(gO.status === 200 && gO.json.synthesis.isOwner === true && gO.json.synthesis.capabilities?.role === "owner" && gO.json.synthesis.capabilities.manage && gO.json.synthesis.capabilities.edit, "B1a владелец: isOwner, capabilities owner", { status: gO.status, isOwner: gO.json?.synthesis?.isOwner, caps: gO.json?.synthesis?.capabilities, keys: Object.keys(gO.json ?? {}).slice(0, 12) });
  ok(gR.status === 200 && gR.json.synthesis.isOwner === false && gR.json.synthesis.capabilities?.role === "reviewer" && gR.json.synthesis.capabilities.discuss && !gR.json.synthesis.capabilities.edit && secR.status === 200 && (secR.json.sections ?? secR.json).length > 0, "B1b рецензент читает ПРИВАТНУЮ (и разделы), isOwner false, edit false", { caps: gR.json?.synthesis?.capabilities, secR: secR.status });
  ok(gE.status === 200 && gE.json.synthesis.capabilities?.role === "editor" && !gE.json.synthesis.capabilities.edit, "B1c редактор: role editor, edit false (до 17.1)");
  ok([403, 404].includes(gS.status) && [403, 404].includes(gI.status) && [401, 403, 404].includes(gG.status) && [403, 404].includes(secS.status), "B1d чужой, приглашённый и гость приватную не видят (и разделы)", { gS: gS.status, gI: gI.status, gG: gG.status, secS: secS.status });

  // B2 паритет гейта правки: участники не правят
  const [cat] = await sql`select id, name, definition from categories where synthesis_id=${S} order by name limit 1`;
  ok(!!cat, "B2a в образце есть категории");
  const pR = await call("PATCH", `/syntheses/${S}/categories/${cat.id}`, { definition: "x" }, rev), pE = await call("PATCH", `/syntheses/${S}/categories/${cat.id}`, { definition: "x" }, rev2), pS = await call("PATCH", `/syntheses/${S}/categories/${cat.id}`, { definition: "x" }, stranger);
  ok(pR.status === 403 && pE.status === 403 && pS.status === 403 && pR.json.code === "FORBIDDEN", "B2b PATCH категории: рецензент, редактор, чужой → 403 FORBIDDEN", { pR: pR.status, pE: pE.status, pS: pS.status });
  const mR = await call("PATCH", `/syntheses/${S}`, { title: "x" }, rev);
  ok(mR.status === 403, "B2c PATCH /syntheses/:id рецензентом → 403");
  const bad = await call("GET", `/syntheses/${S}/comments`, undefined, { cookie: owner.cookie });
  ok(bad.status === 200, "B2d GET comments владельцем → 200");

  // B3 доступ к обсуждению
  const cG = await call("GET", `/syntheses/${S}/comments`), cS = await call("GET", `/syntheses/${S}/comments`, undefined, stranger), cI = await call("GET", `/syntheses/${S}/comments`, undefined, invited), cR = await call("GET", `/syntheses/${S}/comments`, undefined, rev), cX = await call("GET", `/syntheses/00000000-0000-0000-0000-000000000000/comments`, undefined, rev), cY = await call("GET", `/syntheses/not-uuid/comments`, undefined, rev);
  ok(cG.status === 401 && cS.status === 403 && cI.status === 403 && cR.status === 200 && cR.json.comments.length === 0 && cX.status === 404 && cY.status === 404, "B3a comments: 401 гость, 403 чужой/приглашённый, 200 участник, 404 нет/не-UUID", { cG: cG.status, cS: cS.status, cI: cI.status, cX: cX.status, cY: cY.status });
  await sql`update syntheses set visibility='full' where id=${S}`;
  const cS2 = await call("GET", `/syntheses/${S}/comments`, undefined, stranger), gS2 = await call("GET", `/syntheses/${S}`, undefined, stranger);
  ok(cS2.status === 403 && gS2.status === 200 && gS2.json.synthesis.capabilities?.role === "reader" && gS2.json.synthesis.capabilities.read && !gS2.json.synthesis.capabilities.discuss, "B3b публичная: чужой читает (reader), обсуждение — 403");
  await sql`update syntheses set visibility='showcase' where id=${S}`;
  const gS3 = await call("GET", `/syntheses/${S}`, undefined, stranger), secS3 = await call("GET", `/syntheses/${S}/sections`, undefined, stranger), secR3 = await call("GET", `/syntheses/${S}/sections`, undefined, rev);
  ok(gS3.status === 200 && secS3.status === 403 && secR3.status === 200 && (secR3.json.sections ?? secR3.json).length > 0, "B3c витрина: чужому шапка без разделов (403 на /sections), участнику — целиком", { gS3: gS3.status, secS3: secS3.status, secR3: secR3.status });
  await sql`update syntheses set visibility='private' where id=${S}`;

  // B4 комментарии
  const c1 = await call("POST", `/syntheses/${S}/comments`, { target: { kind: "category", key: cat.name }, body: "  Первое <b>замечание</b>\r\n\r\n\r\n\r\nк категории ", kind: "question" }, rev);
  ok(c1.status === 201 && c1.json.address.kind === "category" && c1.json.address.id === cat.id && c1.json.address.key === ADDR.categoryKey(cat.name) && /^[0-9a-f]{64}$/.test(c1.json.address.hash) && c1.json.resolution.state === "current" && c1.json.body === "Первое <b>замечание</b>\n\nк категории" && c1.json.kind === "question" && c1.json.author.name === "rev" && c1.json.author.isOwner === false && c1.json.excerpt.length > 0, "B4a создание по ключу: адрес с id/хэшем, текст как есть (без чистки разметки), автор", c1.json);
  const cid1 = c1.json.id;
  const c1b = await call("POST", `/syntheses/${S}/comments`, { target: { kind: "category", id: cat.id }, body: "по id" }, owner);
  ok(c1b.status === 201 && c1b.json.address.key === c1.json.address.key && c1b.json.author.isOwner === true, "B4b создание по id — тот же ключ; владелец помечен");
  const cSyn = await call("POST", `/syntheses/${S}/comments`, { target: { kind: "synthesis" }, body: "в целом" }, rev2);
  const [sec] = await sql`select id, key from sections where synthesis_id=${S} order by section_num limit 1`;
  const cSec = await call("POST", `/syntheses/${S}/comments`, { target: { kind: "section", key: sec.key }, body: "о разделе" }, rev2);
  ok(cSyn.status === 201 && cSyn.json.address.hash === "" && cSec.status === 201 && cSec.json.address.id === sec.id, "B4c адреса synthesis (хэш пуст) и section");
  const vBad = await Promise.all([
    call("POST", `/syntheses/${S}/comments`, { target: { kind: "category", key: cat.name } }, rev),
    call("POST", `/syntheses/${S}/comments`, { target: { kind: "category", key: cat.name }, body: "   " }, rev),
    call("POST", `/syntheses/${S}/comments`, { target: { kind: "category", key: cat.name }, body: "x", kind: "like" }, rev),
    call("POST", `/syntheses/${S}/comments`, { target: { kind: "nope", key: "a" }, body: "x" }, rev),
    call("POST", `/syntheses/${S}/comments`, { target: { kind: "category", key: "нет такой категории " + TAG }, body: "x" }, rev),
    call("POST", `/syntheses/${S}/comments`, { target: { kind: "category", key: cat.name }, body: "x".repeat(10001) }, rev),
  ]);
  ok(vBad.slice(0, 4).every((r) => r.status === 400 && r.json.code === "VALIDATION_ERROR") && vBad[4].status === 404 && vBad[5].status === 400, "B4d валидация: пустое тело, неизвестный вид, неизвестный kind адреса → 400; нет объекта → 404; длиннее предела → 400", vBad.map((r) => r.status));
  const r1 = await call("POST", `/syntheses/${S}/comments`, { parentId: cid1, body: "ответ владельца" }, owner);
  const r2 = await call("POST", `/syntheses/${S}/comments`, { parentId: r1.json?.id, body: "ответ на ответ" }, rev);
  ok(r1.status === 201 && r1.json.parentId === cid1 && r1.json.address.key === c1.json.address.key && r2.status === 400, "B4e ответ наследует адрес корня; ответ на ответ → 400 (плоские ветки)");
  const list = await call("GET", `/syntheses/${S}/comments?kind=category&key=${encodeURIComponent(c1.json.address.key)}`, undefined, rev2);
  ok(list.status === 200 && list.json.comments.length === 3 && list.json.comments.find((c) => c.id === cid1)?.replyCount === 1 && list.json.nextCursor === null, "B4f список по адресу: 2 корня + ответ, replyCount", list.json?.comments?.map((c) => [c.parentId, c.replyCount]));
  const pg = await call("GET", `/syntheses/${S}/comments?limit=2`, undefined, rev);
  const pg2 = pg.json?.nextCursor ? await call("GET", `/syntheses/${S}/comments?limit=2&cursor=${encodeURIComponent(pg.json.nextCursor)}`, undefined, rev) : null;
  ok(pg.status === 200 && pg.json.comments.length === 2 && pg.json.nextCursor && pg2?.status === 200 && pg2.json.comments.length >= 1 && !pg2.json.comments.some((c) => pg.json.comments.some((d) => d.id === c.id)), "B4g курсорная страница без повторов", { pg: pg.status, n: pg.json?.comments?.length, cur: pg.json?.nextCursor, pg2: pg2?.status, pg2j: pg2?.json });
  const uOther = await call("PATCH", `/syntheses/${S}/comments/${cid1}`, { body: "чужая правка" }, owner);
  const uMine = await call("PATCH", `/syntheses/${S}/comments/${cid1}`, { body: "поправлено", kind: null }, rev);
  ok(uOther.status === 403 && uMine.status === 200 && uMine.json.body === "поправлено" && uMine.json.edited === true && uMine.json.kind === null, "B4h правка: чужую → 403; свою — edited, kind снят");
  const resS = await call("POST", `/syntheses/${S}/comments/${cid1}/resolve`, undefined, rev2);
  const resO = await call("POST", `/syntheses/${S}/comments/${cid1}/resolve`, undefined, owner);
  const resReply = await call("POST", `/syntheses/${S}/comments/${r1.json.id}/resolve`, undefined, owner);
  ok(resS.status === 403 && resO.status === 200 && resO.json.status === "resolved" && resO.json.resolvedAt && resReply.status === 400, "B4i решить ветку: другой участник → 403, владелец → resolved; у ответа статуса нет");
  const reo = await call("POST", `/syntheses/${S}/comments/${cid1}/reopen`, undefined, rev);
  ok(reo.status === 200 && reo.json.status === "open" && reo.json.resolvedAt === null, "B4j автор переоткрывает");
  const hR = await call("POST", `/syntheses/${S}/comments/${cid1}/hide`, undefined, rev2), hO = await call("POST", `/syntheses/${S}/comments/${cid1}/hide`, undefined, owner);
  const seenBy2 = await call("GET", `/syntheses/${S}/comments?status=hidden`, undefined, rev2), seenByAuthor = await call("GET", `/syntheses/${S}/comments?status=hidden`, undefined, rev);
  const replyHidden = await call("POST", `/syntheses/${S}/comments`, { parentId: cid1, body: "в скрытую" }, rev2);
  ok(hR.status === 403 && hO.status === 200 && hO.json.hidden && hO.json.body !== "" && seenBy2.json.comments[0]?.hidden && seenBy2.json.comments[0].body === "" && seenByAuthor.json.comments[0].body === "поправлено" && replyHidden.status === 409, "B4k скрытие: только владелец; тело скрыто от третьих, видно автору/владельцу; ответ в скрытую → 409");
  const unh = await call("POST", `/syntheses/${S}/comments/${cid1}/unhide`, undefined, owner);
  ok(unh.status === 200 && unh.json.status === "open" && !unh.json.hidden, "B4l возврат из скрытого → open");
  const dOther = await call("DELETE", `/syntheses/${S}/comments/${cid1}`, undefined, owner), dMine = await call("DELETE", `/syntheses/${S}/comments/${cid1}`, undefined, rev);
  const afterDel = await call("GET", `/syntheses/${S}/comments?kind=category&key=${encodeURIComponent(c1.json.address.key)}`, undefined, rev2);
  const stub = afterDel.json.comments.find((c) => c.id === cid1);
  ok(dOther.status === 403 && dMine.status === 200 && dMine.json.removed === false && stub && stub.deleted && stub.body === "" && afterDel.json.comments.some((c) => c.parentId === cid1), "B4m удаление корня с ответами — заглушка, ответ на месте");
  const dReply = await call("DELETE", `/syntheses/${S}/comments/${r1.json.id}`, undefined, owner);
  const afterDel2 = await call("GET", `/syntheses/${S}/comments?kind=category&key=${encodeURIComponent(c1.json.address.key)}`, undefined, rev2);
  ok(dReply.json?.removed === true && !afterDel2.json.comments.some((c) => c.id === cid1) && !afterDel2.json.comments.some((c) => c.id === r1.json.id), "B4n удаление последнего ответа — и заглушка корня исчезает из списка");

  // B5 адреса: правка → outdated; пересоздание → current с новым id
  const cAddr = await call("POST", `/syntheses/${S}/comments`, { target: { kind: "category", key: cat.name }, body: "про определение" }, rev);
  await sql`update categories set definition = definition || ' (правка)' where id=${cat.id}`;
  const outd = await call("GET", `/syntheses/${S}/comments?kind=category&key=${encodeURIComponent(cAddr.json.address.key)}`, undefined, rev);
  const o1 = outd.json.comments.find((c) => c.id === cAddr.json.id);
  ok(o1?.resolution.state === "outdated" && o1.resolution.currentId === cat.id && o1.resolution.currentHash !== cAddr.json.address.hash, "B5a правка категории → outdated (id тот же, хэш иной)", o1?.resolution);
  await sql`update categories set definition = replace(definition, ' (правка)', '') where id=${cat.id}`;
  const [graphSec] = await sql`select html_content as html from sections where synthesis_id=${S} and key='graph'`;
  const parsed = GP.parseGraphFromHTML(graphSec.html);
  await GP.saveGraphToDb(S, parsed);
  const [catNew] = await sql`select id from categories where synthesis_id=${S} and name=${cat.name}`;
  const re = await call("GET", `/syntheses/${S}/comments?kind=category&key=${encodeURIComponent(cAddr.json.address.key)}`, undefined, rev);
  const o2 = re.json.comments.find((c) => c.id === cAddr.json.id);
  ok(catNew && catNew.id !== cat.id && o2?.resolution.state === "current" && o2.resolution.currentId === catNew.id && o2.address.id === cat.id, "B5b saveGraphToDb пересоздал категорию: адрес нашёл её по ключу — current, currentId новый, в адресе прежний id", { old: cat.id, now: catNew?.id, res: o2?.resolution });
  const cEdge = await sql`select ce.id, cs.name as src, ct.name as tgt, ce.edge_type as type from category_edges ce join categories cs on cs.id=ce.source_id join categories ct on ct.id=ce.target_id where ce.synthesis_id=${S} limit 1`;
  if (cEdge[0]) {
    const ce = await call("POST", `/syntheses/${S}/comments`, { target: { kind: "edge", id: cEdge[0].id }, body: "о связи" }, rev);
    ok(ce.status === 201 && ce.json.address.key === ADDR.edgeKey(cEdge[0].src, cEdge[0].tgt, cEdge[0].type), "B5c адрес связи — src→tgt|type");
  }
  await sql`delete from categories where id=${catNew.id}`;
  const gone = await call("GET", `/syntheses/${S}/comments?kind=category&key=${encodeURIComponent(cAddr.json.address.key)}`, undefined, rev);
  ok(gone.json.comments.find((c) => c.id === cAddr.json.id)?.resolution.state === "deleted", "B5d удалённая категория → deleted (комментарий остаётся)");
  const [th] = await sql`select id, label, thesis_num from theses where synthesis_id=${S} limit 1`;
  if (th) {
    const ct = await call("POST", `/syntheses/${S}/comments`, { target: { kind: "thesis", id: th.id }, body: "о тезисе" }, owner);
    ok(ct.status === 201 && ct.json.address.key === ADDR.thesisKey(th.label, th.thesis_num), "B5e адрес тезиса");
  }

  // B6 рецензии
  const rv0 = await call("POST", `/syntheses/${S}/reviews`, { title: "Черновик", summary: "кратко" }, rev);
  const R = rv0.json?.id;
  const lsO = await call("GET", `/syntheses/${S}/reviews`, undefined, owner), lsR = await call("GET", `/syntheses/${S}/reviews`, undefined, rev), gO2 = await call("GET", `/syntheses/${S}/reviews/${R}`, undefined, owner);
  ok(rv0.status === 201 && rv0.json.status === "draft" && rv0.json.revision === 0 && typeof rv0.json.docVersion?.base === "number" && lsO.json.length === 0 && lsR.json.length === 1 && gO2.status === 404, "B6a черновик виден только автору (другим — 404)", { lsO: lsO.json?.length, gO2: gO2.status });
  const strRv = await call("POST", `/syntheses/${S}/reviews`, { title: "x" }, stranger);
  ok(strRv.status === 403, "B6b чужой рецензию не создаёт");
  const [thAny] = await sql`select id from theses where synthesis_id=${S} limit 1`;
  const f1 = await call("POST", `/syntheses/${S}/reviews/${R}/findings`, { target: thAny ? { kind: "thesis", id: thAny.id } : { kind: "section", key: sec.key }, body: "замечание 1", kind: "objection" }, rev);
  ok(f1.status === 201 && f1.json.findings.length === 1 && f1.json.findings[0].position === 1 && f1.json.revision === 0, "B6c замечание в черновике — без редакций");
  const revs0 = await call("GET", `/syntheses/${S}/reviews/${R}/revisions`, undefined, rev);
  const pub = await call("POST", `/syntheses/${S}/reviews/${R}/publish`, undefined, rev);
  const pubAgain = await call("POST", `/syntheses/${S}/reviews/${R}/publish`, undefined, rev);
  const revs1 = await call("GET", `/syntheses/${S}/reviews/${R}/revisions`, undefined, owner);
  ok(revs0.json.length === 0 && pub.status === 200 && pub.json.status === "published" && pub.json.revision === 1 && pub.json.publishedAt && pubAgain.status === 409 && revs1.status === 200 && revs1.json.length === 1 && revs1.json[0].revision === 1 && revs1.json[0].fields.title === "Черновик" && revs1.json[0].findings.length === 1 && !("resolution" in revs1.json[0].findings[0]), "B6d публикация → редакция 1 со снимком полей и замечаний; повторная → 409");
  const lsO2 = await call("GET", `/syntheses/${S}/reviews`, undefined, owner);
  ok(lsO2.json.length === 1 && lsO2.json[0].findings.length === 1 && lsO2.json[0].author.name === "rev", "B6e опубликованная видна владельцу с замечаниями");
  const up = await call("PATCH", `/syntheses/${S}/reviews/${R}`, { title: "Опубликованная", objections: "возражения" }, rev);
  const fAdd = await call("POST", `/syntheses/${S}/reviews/${R}/findings`, { target: { kind: "section", key: sec.key }, body: "замечание 2" }, rev);
  const fUp = await call("PATCH", `/syntheses/${S}/reviews/${R}/findings/${fAdd.json?.findings?.[1]?.id}`, { body: "замечание 2 (правка)" }, rev);
  const fDel = await call("DELETE", `/syntheses/${S}/reviews/${R}/findings/${fAdd.json?.findings?.[0]?.id}`, undefined, rev);
  const revs2 = await call("GET", `/syntheses/${S}/reviews/${R}/revisions`, undefined, owner);
  ok(up.json?.revision === 2 && fAdd.json?.revision === 3 && fUp.json?.revision === 4 && fDel.json?.revision === 5 && fDel.json.findings.length === 1 && fDel.json.findings[0].body === "замечание 2 (правка)" && revs2.json.length === 5 && revs2.json[0].revision === 5 && revs2.json[4].fields.title === "Черновик" && revs2.json[3].fields.title === "Опубликованная", "B6f каждая правка опубликованной — новая редакция; прежние целы", { up: up.json?.revision, fAdd: fAdd.json?.revision, fUp: fUp.json?.revision, fDel: fDel.json?.revision, n: revs2.json?.length });
  const upO = await call("PATCH", `/syntheses/${S}/reviews/${R}`, { title: "чужая" }, owner), delPub = await call("DELETE", `/syntheses/${S}/reviews/${R}`, undefined, rev);
  ok(upO.status === 403 && delPub.status === 409, "B6g чужую не правят (403); опубликованную не удаляют (409)");
  const sum1 = await call("GET", `/syntheses/${S}/discussion/summary`, undefined, rev2);
  const wd = await call("POST", `/syntheses/${S}/reviews/${R}/withdraw`, undefined, rev);
  const upW = await call("PATCH", `/syntheses/${S}/reviews/${R}`, { title: "после отзыва" }, rev);
  const sum2 = await call("GET", `/syntheses/${S}/discussion/summary`, undefined, rev2);
  ok(sum1.json.totals.reviews === 1 && sum1.json.totals.findings === 1 && sum1.json.totals.openComments >= 3 && sum1.json.byAddress.some((a) => a.kind === "section" && a.key === sec.key && a.findings === 1) && wd.json.status === "withdrawn" && wd.json.withdrawnAt && upW.status === 409 && sum2.json.totals.reviews === 0 && sum2.json.totals.findings === 0, "B6h сводка: по адресам и итоги; отзыв убирает рецензию из сводки, правка после отзыва → 409", { sum1: sum1.json?.totals, sum2: sum2.json?.totals });
  const lsAfter = await call("GET", `/syntheses/${S}/reviews`, undefined, owner);
  ok(lsAfter.json.length === 1 && lsAfter.json[0].status === "withdrawn" && lsAfter.json[0].revision === 5, "B6i отозванная остаётся видимой с пометкой");
  const draft2 = await call("POST", `/syntheses/${S}/reviews`, {}, rev2);
  const delDraft = await call("DELETE", `/syntheses/${S}/reviews/${draft2.json?.id}`, undefined, rev2);
  ok(draft2.status === 201 && delDraft.status === 200 && (await call("GET", `/syntheses/${S}/reviews/${draft2.json.id}`, undefined, rev2)).status === 404, "B6j черновик удаляется автором");
  const vb = await call("PATCH", `/syntheses/${S}/reviews/${R}`, { title: "x".repeat(301) }, rev2);
  ok(vb.status === 403 || vb.status === 400, "B6k лишняя длина/чужая → отказ");

  // B7 удаление аккаунта участника: членство снято, комментарии остались
  const beforeM = await sql`select count(*)::int as n from synthesis_members where user_id=${rev.id}`;
  await AD.deleteAccount(rev.id);
  const afterM = await sql`select count(*)::int as n from synthesis_members where user_id=${rev.id}`;
  const afterC = await call("GET", `/syntheses/${S}/comments`, undefined, owner);
  const byDeleted = afterC.json.comments.filter((c) => c.author.deleted);
  const [cntRows] = await sql`select count(*)::int as n from comments where author_id=${rev.id}`;
  ok(beforeM[0].n === 1 && afterM[0].n === 0 && cntRows.n > 0 && byDeleted.length === cntRows.n - (await sql`select count(*)::int as n from comments where author_id=${rev.id} and deleted_at is not null and not exists (select 1 from comments r where r.parent_id=comments.id)`)[0].n && byDeleted.every((c) => c.author.id === null && c.author.name === "удалённый пользователь") && (await call("GET", `/syntheses/${S}/comments`, undefined, rev)).status === 401, "B7a удаление аккаунта: членство снято, комментарии под «удалённый пользователь», сессия мертва", { beforeM, afterM, byDeleted: byDeleted.length, rows: cntRows.n });
  const lsDel = await call("GET", `/syntheses/${S}/reviews`, undefined, owner);
  ok(lsDel.json.length === 1 && lsDel.json[0].author.deleted && lsDel.json[0].findings.length === 1, "B7b рецензия удалённого автора остаётся с замечаниями");

  // B8 удаление синтеза — CASCADE уносит обсуждение
  const dupR = await call("DELETE", `/syntheses/${S}`, undefined, rev2);
  const delS = await call("DELETE", `/syntheses/${S}`, undefined, owner);
  const [left] = await sql`select (select count(*) from comments where synthesis_id=${S})::int as c, (select count(*) from reviews where synthesis_id=${S})::int as r, (select count(*) from review_findings where synthesis_id=${S})::int as f, (select count(*) from synthesis_members where synthesis_id=${S})::int as m`;
  ok(dupR.status === 403 && [200, 204].includes(delS.status) && left.c === 0 && left.r === 0 && left.f === 0 && left.m === 0, "B8 DELETE синтеза: участник → 403; владелец — CASCADE уносит комментарии, рецензии, замечания, участников", { dupR: dupR.status, delS: delS.status, left });
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
} finally {
  console.log(`\nИТОГ: ${passed} ✓, ${failed} ✗${fails.length ? "\n  " + fails.join("\n  ") : ""}`);
  try {
    for (const id of userIds) await sql`delete from sessions where user_id=${id}`;
    for (const id of userIds) await sql`delete from syntheses where user_id=${id}`;
    for (const id of userIds) await sql`delete from comments where author_id=${id}`;
    for (const id of userIds) await sql`delete from reviews where author_id=${id}`;
    for (const id of userIds) await sql`delete from users where id=${id}`;
  } catch (e2) { console.error("уборка:", e2); }
  await Promise.race([Promise.all([closeDb(), closeRedis()]), sleep(2000)]);
  await Promise.race([sql.end(), sleep(2000)]);
  process.exit(failed ? 1 : 0);
}
