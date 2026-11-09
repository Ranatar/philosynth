/**
 * Дымовой прогон беседы 16.2, первый запрос (участники, приглашения,
 * уведомления — бэкенд + клиент):
 *   A — исходники и чистые функции (константы уведомлений, маршруты под
 *       requireAuth, миграция 0018, env/дотфайлы, CSS-блок, i18n);
 *   B — живьём по HTTP (PG + Redis, app.request без порта): 401/403/404/409
 *       на маршрутах участников; приглашение аккаунта → письмо (en) →
 *       member_invited → принятие → роль → исключение; адрес без аккаунта →
 *       довод → GET /auth/invitations/:token → регистрация с inviteToken →
 *       строка invited; «Со мной поделились»; уведомления: список, курсор,
 *       unread-count, read, read-all, настройки (400 на чужой категории,
 *       отключённая категория не пишется); проход устаревания и сводка.
 *
 * Запуск (из корня, PG/Redis подняты, миграции до 0018, сиды на месте):
 *   npx tsx tests/smoke-162-request1.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { Hono } from "hono";

const ROOT = new URL("../", import.meta.url).pathname;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
process.env.NODE_ENV = "development";
// mailLimiter считает по адресу клиента (app.request — один адрес): в смоуке писем много
process.env.RATE_LIMIT_MAIL_PER_HOUR = process.env.RATE_LIMIT_MAIL_PER_HOUR ?? "1000";
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 900) : ""}`); }
}
const TAG = "s162-" + Math.random().toString(36).slice(2, 7);
const rd = (rel) => readFileSync(ROOT + rel, "utf8");
const strip = (src) => src.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

const LOC = await import("../server/i18n/locale.ts");
LOC.installServerCatalogProvider();
const NC = await import("@philosynth/shared/constants/notifications");
const NT = await import("../server/services/notifications.ts");
const IS = await import("../server/services/import-service.ts");
const RS = await import("../server/routes/syntheses.ts");
const { authRoutes } = await import("../server/routes/auth.ts");
const { membersRoutes } = await import("../server/routes/members.ts");
const { notificationsRoutes } = await import("../server/routes/notifications.ts");
const { discussionRoutes } = await import("../server/routes/discussion.ts");
const { closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");

console.log("\n■ A. Исходники и чистые функции");
{
  ok(NC.NOTIFICATION_TYPES.length === 11 && NC.NOTIFICATION_CATEGORIES.length === 5 && NC.NOTIFICATION_TYPES.every((t) => NC.isNotificationCategory(NC.NOTIFICATION_CATEGORY_OF[t])) && NC.isNotificationType("comment_new") && !NC.isNotificationType("spam"), "A1 типы/категории уведомлений: 11 типов, 5 категорий, каждому типу категория");
  ok(NC.MEMBER_INVITE_TOKEN_PURPOSE === "member_invite" && NC.MEMBER_INVITE_TTL_HOURS === 72 && NC.NOTIFICATIONS_PAGE_MAX === 200, "A2 довод приглашения: purpose member_invite, 72 ч; страница ≤ 200");
  ok(!NT.notifyPassDue(0, 59_000, 60_000) && NT.notifyPassDue(0, 60_000, 60_000) && NT.notifyPassDue(0, 1_000, 10), "A3 notifyPassDue держит интервал (пол 1 с)");
  const mr = strip(rd("server/routes/members.ts"));
  const routes = [...mr.matchAll(/membersRoutes\.(get|post|patch|delete)\(/g)].length;
  const guarded = [...mr.matchAll(/membersRoutes\.(get|post|patch|delete)\(\s*"[^"]+",\s*(?:mailLimiter,\s*)?requireAuth,/g)].length;
  ok(routes === 11 && guarded === 11 && (mr.match(/mailLimiter,/g) ?? []).length === 3, "A4 11 маршрутов участников под requireAuth; три письма под mailLimiter", { routes, guarded });
  const nr = strip(rd("server/routes/notifications.ts"));
  ok([...nr.matchAll(/notificationsRoutes\.(get|post|patch)\(\s*"[^"]+",\s*requireAuth,/g)].length === 6 && [...nr.matchAll(/notificationsRoutes\.(get|post|patch)\(/g)].length === 6, "A5 6 маршрутов уведомлений под requireAuth");
  const ms = strip(rd("server/services/members.ts")), ns = strip(rd("server/services/notifications.ts"));
  ok(!/\.userId\s*(!==|===)\s*(user\.id|userId|ownerId)\b/.test(ms + ns) && /canManageSynthesis\(row, userId\)/.test(ms), "A6 владелец — только через canManageSynthesis (4bm)");
  const journal = JSON.parse(rd("server/db/migrations/meta/_journal.json"));
  const mig = rd("server/db/migrations/0018_members_notifications.sql");
  ok(journal.entries.length === 19 && journal.entries[18].tag === "0018_members_notifications" && /CREATE TABLE "notifications"/.test(mig) && /CREATE TABLE "notification_settings"/.test(mig) && /member_invite/.test(mig), "A7 миграция 0018_members_notifications девятнадцатая; таблицы и purpose");
  ok(/NOTIFY_DIGEST_INTERVAL_HOURS=/.test(rd(".env.example")) && /NOTIFY_SCAN_INTERVAL_MS=/.test(rd(".env.example")) && /NOTIFY_DIGEST_INTERVAL_HOURS=/.test(rd("env.local.example")) && /NOTIFY_DIGEST_INTERVAL_HOURS/.test(rd("scripts/checks/check-dotfiles.mjs")), "A8 env NOTIFY_* в .env.example / env.local.example / check-dotfiles");
  const css = rd("client/src/globals.css");
  const block = css.split("Беседа 16.2 — участники и уведомления")[1]?.split("/* Утилиты Tailwind")[0] ?? "";
  ok(block.length > 0 && !/#[0-9a-fA-F]{3,8}\b/.test(block) && !/border-radius|box-shadow/.test(block) && [".notif-dropdown", ".members-invite-row", ".page-tab.active"].every((c) => block.includes(c)), "A9 CSS-блок 16.2: закрытая палитра, без скруглений и теней");
  const STR = JSON.parse(rd("packages/shared/i18n/strings.json")).strings;
  const keys = ["server.members.ownerOnly", "server.notifications.memberInvited", "server.mail.templates.digestSubject", "members.inviteTitle", "notificationBell.readAll", "catalogPage.tabShared", "invitationPage.accept"];
  ok(keys.every((k) => STR[k]?.en && STR[k]?.de), "A10 ключи 16.2 с en/de");
  ok(/<NotificationBell \/>/.test(rd("client/src/components/layout/Header.tsx")) && /<NotificationSettingsSection \/>/.test(rd("client/src/pages/ProfilePage.tsx")) && /path="\/invitations\/:synthesisId"/.test(rd("client/src/App.tsx")) && /tabBtn\("shared"/.test(rd("client/src/pages/CatalogPage.tsx")), "A11 клиент: колокольчик, настройки, маршрут приглашения, вкладка «Со мной поделились»");
}

console.log("\n■ B. Живьём по HTTP");
const userIds = [];
const app = new Hono();
app.route("/auth", authRoutes);
app.route("/syntheses", membersRoutes);
app.route("/syntheses", RS.synthesesRoutes);
app.route("/syntheses", discussionRoutes);
app.route("/notifications", notificationsRoutes);
async function mkUser(name, uiLocale = null) {
  const [u] = await sql`insert into users (email, password_hash, display_name, ui_locale) values (${`${TAG}-${name}@s.local`}, 'x', ${name}, ${uiLocale}) returning id`;
  userIds.push(u.id);
  const token = `${TAG}-${name}-${Date.now()}`;
  await sql`insert into sessions (id, user_id, expires_at) values (${createHash("sha256").update(token).digest("hex")}, ${u.id}, now() + interval '1 hour')`;
  return { id: u.id, cookie: `philosynth_session=${token}`, email: `${TAG}-${name}@s.local` };
}
const call = async (method, path, body, who) => {
  const r = await app.request(path, { method, headers: { "content-type": "application/json", ...(who ? { cookie: who.cookie } : {}) }, body: body === undefined ? undefined : J(body) });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
};
const mails = async (to) => sql`select subject, body_text from mail_outbox where to_email=${to} order by created_at`;
const guestEmail = `${TAG}-guest@s.local`;
let S = null;
try {
  const owner = await mkUser("owner"), rev = await mkUser("rev", "en"), str = await mkUser("str");
  const sampleFile = readdirSync(ROOT + "sample").find((f) => f.endsWith(".html"));
  ({ synthesisId: S } = await IS.importHTML(rd("sample/" + sampleFile), owner.id, sampleFile));
  ok(!!S, "B0 импорт образца владельцем");

  // B1 гейты
  const g401 = await call("GET", `/syntheses/${S}/members`), g403 = await call("GET", `/syntheses/${S}/members`, undefined, str), g404 = await call("GET", `/syntheses/not-a-uuid/members`, undefined, owner), gOk = await call("GET", `/syntheses/${S}/members`, undefined, owner);
  ok(g401.status === 401 && g403.status === 403 && g403.json.code === "FORBIDDEN" && g404.status === 404 && gOk.status === 200 && gOk.json.members.length === 0 && gOk.json.invitations.length === 0, "B1a GET members: 401 гость, 403 чужой, 404 не-UUID, 200 владелец (пусто)", { g401: g401.status, g403: g403.status, g404: g404.status, gOk: gOk.status });
  const pStr = await call("POST", `/syntheses/${S}/members`, { email: rev.email, role: "reviewer" }, str);
  const pSelf = await call("POST", `/syntheses/${S}/members`, { email: owner.email, role: "reviewer" }, owner);
  const pBad = await call("POST", `/syntheses/${S}/members`, { email: "nope", role: "reviewer" }, owner);
  const pRole = await call("POST", `/syntheses/${S}/members`, { email: rev.email, role: "admin" }, owner);
  ok(pStr.status === 403 && pSelf.status === 409 && pSelf.json.code === "CONFLICT" && pBad.status === 400 && pBad.json.details?.email && pRole.status === 400 && pRole.json.details?.role, "B1b POST members: 403 чужой, 409 владелец сам, 400 адрес/роль", { pStr: pStr.status, pSelf: pSelf.status, pBad: pBad.json, pRole: pRole.json });

  // B2 приглашение аккаунта → письмо под языком получателя → уведомление → 409 повтор
  const inv = await call("POST", `/syntheses/${S}/members`, { email: rev.email.toUpperCase(), role: "reviewer" }, owner);
  ok(inv.status === 201 && inv.json.kind === "member" && inv.json.member.status === "invited" && inv.json.sent === true, "B2a приглашение аккаунта → 201 member invited, письмо поставлено", inv.json);
  const mRev = await mails(rev.email);
  ok(mRev.length === 1 && /invitation to the concept/.test(mRev[0].subject) && /\/invitations\//.test(mRev[0].body_text), "B2b письмо приглашённому — по-английски (ui_locale en), ссылка на страницу принятия", mRev[0]?.subject);
  const uc = await call("GET", `/notifications/unread-count`, undefined, rev);
  const nl = await call("GET", `/notifications`, undefined, rev);
  ok(uc.status === 200 && uc.json.unread === 1 && nl.json.items.length === 1 && nl.json.items[0].type === "member_invited" && nl.json.items[0].payload.role === "reviewer" && nl.json.items[0].actor?.name === "owner" && nl.json.items[0].synthesisTitle, "B2c у приглашённого одно непрочитанное member_invited с актором и названием", nl.json);
  const dup = await call("POST", `/syntheses/${S}/members`, { email: rev.email, role: "editor" }, owner);
  ok(dup.status === 409, "B2d повторное приглашение → 409");
  const mine0 = await call("GET", `/syntheses/${S}/membership`, undefined, rev), mineStr = await call("GET", `/syntheses/${S}/membership`, undefined, str);
  ok(mine0.status === 200 && mine0.json.member.status === "invited" && mine0.json.synthesis.ownerName === "owner" && mineStr.status === 404, "B2e GET membership: приглашённому — invited, чужому — 404");
  const shared0 = await call("GET", `/syntheses/shared`, undefined, rev);
  ok(shared0.status === 200 && shared0.json.items.length === 1 && shared0.json.items[0].id === S && shared0.json.items[0].myRole === "reviewer" && shared0.json.items[0].myStatus === "invited", "B2f GET /shared приглашённому — концепция с ролью и статусом invited", shared0.json);
  const docInv = await call("GET", `/syntheses/${S}`, undefined, rev);
  ok([403, 404].includes(docInv.status), "B2g приглашённый приватную ещё не читает");

  // B3 принятие → доступ, уведомление владельцу; повтор 409; decline активного 409
  const acc = await call("POST", `/syntheses/${S}/membership/accept`, undefined, rev);
  const accAgain = await call("POST", `/syntheses/${S}/membership/accept`, undefined, rev);
  const dec = await call("POST", `/syntheses/${S}/membership/decline`, undefined, rev);
  const accStr = await call("POST", `/syntheses/${S}/membership/accept`, undefined, str);
  ok(acc.status === 200 && acc.json.member.status === "active" && accAgain.status === 409 && dec.status === 409 && accStr.status === 404, "B3a accept → active; повтор/decline → 409; без приглашения → 404", { acc: acc.status, accAgain: accAgain.status, dec: dec.status, accStr: accStr.status });
  const docRev = await call("GET", `/syntheses/${S}`, undefined, rev);
  ok(docRev.status === 200 && docRev.json.synthesis.capabilities.role === "reviewer" && docRev.json.synthesis.capabilities.discuss, "B3b участник читает приватную, role reviewer");
  const ucO = await call("GET", `/notifications?unread=1`, undefined, owner);
  ok(ucO.json.items.length === 1 && ucO.json.items[0].type === "member_accepted" && ucO.json.items[0].actor?.id === rev.id, "B3c владельцу — member_accepted от участника");

  // B4 роль, resend активному 409, список владельца
  const lst = await call("GET", `/syntheses/${S}/members`, undefined, owner);
  const mid = lst.json.members[0]?.id;
  const role = await call("PATCH", `/syntheses/${S}/members/${mid}`, { role: "editor" }, owner);
  const roleBad = await call("PATCH", `/syntheses/${S}/members/${mid}`, { role: "owner" }, owner);
  const roleStr = await call("PATCH", `/syntheses/${S}/members/${mid}`, { role: "editor" }, str);
  const rs = await call("POST", `/syntheses/${S}/members/${mid}/resend`, undefined, owner);
  ok(role.status === 200 && role.json.role === "editor" && roleBad.status === 400 && roleStr.status === 403 && rs.status === 409, "B4a PATCH role → editor; плохая роль 400; чужой 403; resend активному 409", { role: role.status, roleBad: roleBad.status, roleStr: roleStr.status, rs: rs.status });
  const nRev = await call("GET", `/notifications`, undefined, rev);
  ok(nRev.json.items[0].type === "member_role_changed" && nRev.json.items[0].payload.role === "editor" && nRev.json.unread === 2, "B4b участнику — member_role_changed (editor); непрочитанных 2");

  // B5 комментарии → уведомления владельцу/участнику; отключённая категория не пишется
  const [cat] = await sql`select id, name from categories where synthesis_id=${S} order by name limit 1`;
  const c1 = await call("POST", `/syntheses/${S}/comments`, { target: { kind: "category", key: cat.name }, body: "корень участника" }, rev);
  ok(c1.status === 201 && c1.json.author.formerMember === false, "B5a комментарий участника создан; formerMember false");
  const nO = await call("GET", `/notifications?unread=1`, undefined, owner);
  ok(nO.json.items[0].type === "comment_new" && nO.json.items[0].address?.kind === "category" && nO.json.items[0].payload.excerpt === "корень участника", "B5b владельцу — comment_new с адресом и выдержкой");
  const reply = await call("POST", `/syntheses/${S}/comments`, { parentId: c1.json.id, body: "ответ владельца" }, owner);
  const nRev2 = await call("GET", `/notifications`, undefined, rev);
  ok(reply.status === 201 && nRev2.json.items[0].type === "comment_reply" && nRev2.json.unread === 3, "B5c участнику — comment_reply в его ветке");
  const sBad = await call("PATCH", `/notifications/settings`, { mutedCategories: ["spam"] }, rev);
  const sBool = await call("PATCH", `/notifications/settings`, { emailDigest: "yes" }, rev);
  const sOk = await call("PATCH", `/notifications/settings`, { mutedCategories: ["comments"] }, rev);
  const sGet = await call("GET", `/notifications/settings`, undefined, rev);
  ok(sBad.status === 400 && sBad.json.details?.mutedCategories && sBool.status === 400 && sOk.status === 200 && J(sGet.json) === J({ mutedCategories: ["comments"], emailDigest: true }), "B5d настройки: 400 на чужой категории/не-boolean; mutedCategories сохранены", { sBad: sBad.json, sGet: sGet.json });
  await call("POST", `/syntheses/${S}/comments`, { parentId: c1.json.id, body: "ответ при отключённой категории" }, owner);
  const nRev3 = await call("GET", `/notifications`, undefined, rev);
  ok(nRev3.json.unread === 3 && nRev3.json.items.filter((n) => n.type === "comment_reply").length === 1, "B5e отключённая категория comments не записалась");

  // B6 список: курсор, read, read-all
  const p1 = await call("GET", `/notifications?limit=2`, undefined, rev);
  const p2 = await call("GET", `/notifications?limit=2&cursor=${p1.json.nextCursor}`, undefined, rev);
  ok(p1.json.items.length === 2 && p1.json.nextCursor && p2.json.items.length === 1 && !p1.json.items.some((a) => p2.json.items.some((b) => a.id === b.id)) && p2.json.nextCursor === null, "B6a страницы по курсору не пересекаются, конец — null", { p1: p1.json.items.length, p2: p2.json.items.length });
  const rdOther = await call("POST", `/notifications/${p1.json.items[0].id}/read`, undefined, owner);
  const rdOwn = await call("POST", `/notifications/${p1.json.items[0].id}/read`, undefined, rev);
  const rdBad = await call("POST", `/notifications/zzz/read`, undefined, rev);
  const uc2 = await call("GET", `/notifications/unread-count`, undefined, rev);
  ok(rdOther.status === 404 && rdOwn.status === 200 && rdOwn.json.readAt && rdBad.status === 404 && uc2.json.unread === 2, "B6b read: чужая 404, своя 200 с readAt, не-UUID 404; счётчик −1");
  const ra = await call("POST", `/notifications/read-all`, undefined, rev);
  const uc3 = await call("GET", `/notifications/unread-count`, undefined, rev);
  const onlyUnread = await call("GET", `/notifications?unread=1`, undefined, rev);
  ok(ra.json.marked === 2 && uc3.json.unread === 0 && onlyUnread.json.items.length === 0, "B6c read-all пометил 2, непрочитанных 0, ?unread=1 пуст");

  // B7 устаревание и сводка
  await sql`update categories set definition='s162 правка' where id=${cat.id}`;
  const sc1 = await NT.scanOutdatedAddresses({ onlySynthesisIds: [S] });
  const sc2 = await NT.scanOutdatedAddresses({ onlySynthesisIds: [S] });
  const nOut = await call("GET", `/notifications?unread=1`, undefined, rev);
  ok(sc1.notified === 1 && sc2.notified === 0 && nOut.json.items.length === 1 && nOut.json.items[0].type === "finding_outdated" && nOut.json.items[0].refId === c1.json.id, "B7a проход устаревания: одно finding_outdated автору, повтор не дублирует");
  await call("PATCH", `/notifications/settings`, { emailDigest: false }, owner);
  const dg = await NT.runNotificationDigest({ intervalHours: 1 });
  const dg2 = await NT.runNotificationDigest({ intervalHours: 1 });
  const mRev2 = await mails(rev.email);
  const digest = mRev2.filter((m) => /new notification/.test(m.subject));
  ok(dg.queued === 1 && dg2.queued === 0 && digest.length === 1 && /has changed/.test(digest[0].body_text) && (await mails(owner.email)).length === 0, "B7b сводка: одна, по-английски, повтор в интервале нет, владельцу при emailDigest=false — нет", { dg, subjects: mRev2.map((m) => m.subject) });

  // B8 адрес без аккаунта: довод → info → регистрация с inviteToken → invited; список владельца; отзыв
  const gInv = await call("POST", `/syntheses/${S}/members`, { email: guestEmail, role: "reviewer" }, owner);
  ok(gInv.status === 201 && gInv.json.kind === "invitation" && gInv.json.invitation.email === guestEmail && gInv.json.sent, "B8a приглашение адреса без аккаунта → invitation", gInv.json);
  const gDup = await call("POST", `/syntheses/${S}/members`, { email: guestEmail, role: "editor" }, owner);
  ok(gDup.status === 409, "B8b повторное приглашение адреса → 409");
  const gMail = await mails(guestEmail);
  const tok = gMail[0]?.body_text.match(/\/register\?invite=([A-Za-z0-9_-]+)/)?.[1];
  ok(!!tok && /\/register\?invite=/.test(gMail[0].body_text), "B8c письмо с ссылкой на регистрацию");
  const info = await call("GET", `/auth/invitations/${tok}`);
  const infoBad = await call("GET", `/auth/invitations/${"x".repeat(40)}`);
  ok(info.status === 200 && info.json.synthesisId === S && info.json.email === guestEmail && info.json.role === "reviewer" && info.json.inviterName === "owner" && infoBad.status === 400 && infoBad.json.code === "TOKEN_INVALID", "B8d GET /auth/invitations/:token — сведения; негодный → 400 TOKEN_INVALID", { info: info.json, infoBad: infoBad.json });
  const lst2 = await call("GET", `/syntheses/${S}/members`, undefined, owner);
  ok(lst2.json.invitations.length === 1 && lst2.json.invitations[0].email === guestEmail, "B8e ждущее приглашение в списке владельца");
  const rsI = await call("POST", `/syntheses/${S}/invitations/${lst2.json.invitations[0].id}/resend`, undefined, owner);
  const infoOld = await call("GET", `/auth/invitations/${tok}`);
  ok(rsI.status === 200 && rsI.json.invitation.id !== lst2.json.invitations[0].id && infoOld.status === 400, "B8f повтор письма — новый довод, прежняя ссылка мертва");
  const tok2 = (await mails(guestEmail)).at(-1).body_text.match(/\/register\?invite=([A-Za-z0-9_-]+)/)[1];
  const regWrong = await call("POST", `/auth/register`, { email: `${TAG}-wrong@s.local`, password: "password123", inviteToken: tok2 });
  ok(regWrong.status === 201 && regWrong.json.invitation === null, "B8g регистрация на другой адрес с чужим доводом → участия нет (invitation null)", regWrong.json);
  if (regWrong.json?.user?.id) userIds.push(regWrong.json.user.id);
  const reg = await call("POST", `/auth/register`, { email: guestEmail, password: "password123", inviteToken: tok2 });
  ok(reg.status === 201 && reg.json.invitation?.synthesisId === S, "B8h регистрация по приглашению → invitation.synthesisId", reg.json);
  if (reg.json?.user?.id) userIds.push(reg.json.user.id);
  const [gm] = await sql`select status, role from synthesis_members where synthesis_id=${S} and user_id=${reg.json.user.id}`;
  ok(gm?.status === "invited" && gm?.role === "reviewer" && (await call("GET", `/syntheses/${S}/members`, undefined, owner)).json.invitations.length === 0, "B8i строка invited заведена, ждущее приглашение погашено");
  const g2 = await call("POST", `/syntheses/${S}/members`, { email: `${TAG}-g2@s.local`, role: "editor" }, owner);
  ok(g2.status === 201, "B8j0 второе приглашение адреса создано", g2);
  const rv = await call("DELETE", `/syntheses/${S}/invitations/${g2.json.invitation.id}`, undefined, owner);
  const rv2 = await call("DELETE", `/syntheses/${S}/invitations/${g2.json.invitation.id}`, undefined, owner);
  ok(rv.status === 200 && rv2.status === 404, "B8j отзыв ждущего приглашения: 200, повтор 404");

  // B9 исключение участника → member_removed, «бывший участник», доступ закрыт
  const ex = await call("DELETE", `/syntheses/${S}/members/${mid}`, undefined, owner);
  const nRem = await call("GET", `/notifications?unread=1`, undefined, rev);
  const docAfter = await call("GET", `/syntheses/${S}`, undefined, rev);
  const cList = await call("GET", `/syntheses/${S}/comments`, undefined, owner);
  const root = cList.json.comments.find((c) => c.id === c1.json.id);
  ok(ex.status === 200 && ex.json.removed === "active" && nRem.json.items.some((n) => n.type === "member_removed") && [403, 404].includes(docAfter.status) && root?.author.formerMember === true && root.body === "корень участника", "B9 исключение: removed active, member_removed, доступ закрыт, автор — бывший участник", { ex: ex.json, doc: docAfter.status, author: root?.author });
  const shared1 = await call("GET", `/syntheses/shared`, undefined, rev);
  ok(shared1.json.items.length === 0, "B9b «Со мной поделились» у исключённого пуст");
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
} finally {
  console.log(`\nИТОГ: ${passed} ✓, ${failed} ✗${fails.length ? "\n  " + fails.join("\n  ") : ""}`);
  try {
    if (S) await sql`delete from syntheses where id=${S}`;
    for (const id of userIds) await sql`delete from sessions where user_id=${id}`;
    for (const id of userIds) await sql`delete from syntheses where user_id=${id}`;
    await sql`delete from mail_outbox where to_email like ${TAG + "-%"}`;
    for (const id of userIds) await sql`delete from users where id=${id}`;
  } catch (e2) { console.error("уборка:", e2); }
  await Promise.race([Promise.all([closeDb(), closeRedis()]), sleep(2000)]);
  await Promise.race([sql.end(), sleep(2000)]);
  process.exit(failed ? 1 : 0);
}
