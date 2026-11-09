/**
 * Тестовые запросы 2–4 беседы 16.2 одним заходом — живой сервер :3000
 * (почта в консоль, работник раз в секунду, проход уведомлений раз в
 * секунду, сводка раз в час), сборка клиента под vite preview :5231,
 * Chrome 131 (кэш puppeteer; CHROME_PATH — запасной).
 *
 *   R2 — приглашения живьём: существующий пользователь (ui_locale de) —
 *        письмо ПО-НЕМЕЦКИ со ссылкой на страницу принятия, принятие,
 *        доступ к приватной концепции; новый адрес — письмо со ссылкой
 *        на регистрацию, GET /auth/invitations/:token, регистрация с
 *        inviteToken → участие invited → принятие; отзыв приглашённого,
 *        смена роли, исключение (комментарий и рецензия остаются
 *        «бывшим участником»), повторное приглашение участника — 409,
 *        владельца — 409; повтор письма (аккаунт и адрес без аккаунта:
 *        прежняя ссылка гаснет).
 *   R3 — уведомления: каждое событие п.4 — строка получателю и НЕ автору
 *        (member_invited / accepted / declined / role_changed / removed,
 *        comment_new, comment_reply, review_published, finding_outdated —
 *        последнее ПРОХОДОМ РАБОТНИКА после правки категории владельцем
 *        через PATCH /categories/:id); счётчик, read, «прочитать всё»;
 *        сводка по почте за период — одна, под языком получателя,
 *        отключённая категория в сводку не входит, повтора в интервале нет.
 *   R4 — браузер: вкладка «Участники» (приглашение, 409 под формой, роль,
 *        второй шаг исключения), страница принятия из колокольчика,
 *        «Со мной поделились» с бейджем, колокольчик («Прочитать всё»),
 *        профиль «Уведомления», регистрация по ссылке.
 *
 * Запуск: npx tsx tests/test-162-requests2-4.mjs [R2|R3|R4]
 * Лог сервера — /tmp/t162-server.log.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import postgres from "postgres";

const ONLY = process.argv.slice(2);
const want = (r) => ONLY.length === 0 || ONLY.includes(r);
const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5231; // preview проксирует /api на :3000 (vite.config server.proxy)
const BASE = `http://127.0.0.1:${PORT}/api/v1`, UI = `http://127.0.0.1:${UI_PORT}`;
const CHROME = [`${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`, process.env.CHROME_PATH].find((p) => p && existsSync(p));
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (id) => `[data-testid="${id}"]`;
const SERVER_LOG = "/tmp/t162-server.log";
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 900) : ""}`); }
}
const TAG = "t162-" + Math.random().toString(36).slice(2, 6);
const PW = "password-162";
const FILE = ROOT + "sample/" + readdirSync(ROOT + "sample").find((f) => f.endsWith(".html"));

/* ── Процессы ─────────────────────────────────────────────────────────── */
const procs = [];
function sp(args, cwd, env, logFile) {
  const log = openSync(logFile, "w");
  const p = spawn(process.execPath, args, { cwd, detached: true, stdio: ["ignore", log, log], env: { ...process.env, ...env } });
  procs.push(p);
  return p;
}
async function isUp(url) { try { return (await fetch(url)).status < 500; } catch { return false; } }
async function waitUp(url, what) { for (let i = 0; i < 120; i++) { if (await isUp(url)) return; await sleep(500); } throw new Error(`${what} не поднялся: ${url}`); }
const serverLog = () => { try { return readFileSync(SERVER_LOG, "utf8"); } catch { return ""; } };
const SERVER_ENV = {
  PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", RATE_LIMIT_MAIL_PER_HOUR: "1000",
  MAIL_TRANSPORT: "console", MAIL_WORKER_INTERVAL_MS: "1000", NOTIFY_SCAN_INTERVAL_MS: "1000", NOTIFY_DIGEST_INTERVAL_HOURS: "1",
  BILLING_ENFORCE: "false", MAIL_PUBLIC_BASE_URL: UI,
};

/* ── Письма режима console из лога сервера ──────────────────────────── */
function lettersInLog() {
  const out = [];
  const re = /──────── \[mail:console\] письмо ────────\n([\s\S]*?)\n──────── \[mail:console\] конец/g;
  for (const m of serverLog().matchAll(re)) {
    const block = m[1];
    out.push({
      to: (block.match(/^To: (.*)$/m) ?? [])[1],
      subject: (block.match(/^Subject: (.*)$/m) ?? [])[1],
      text: block,
      inviteLink: (block.match(/https?:\/\/\S+\/invitations\/[0-9a-f-]+/) ?? [])[0] ?? null,
      registerToken: (block.match(/\/register\?invite=([A-Za-z0-9_-]+)/) ?? [])[1] ?? null,
    });
  }
  return out;
}
async function waitLetters(to, pred, n = 1, { timeout = 10000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const found = lettersInLog().filter((l) => l.to === to && pred(l));
    if (found.length >= n) return found;
    await sleep(200);
  }
  return lettersInLog().filter((l) => l.to === to && pred(l));
}

/* ── HTTP ─────────────────────────────────────────────────────────────── */
async function call(p, { method = "POST", body, cookie } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const r = await fetch(BASE + p, { method, headers, body: body instanceof FormData ? body : body !== undefined ? J(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] || null };
}
const GET = (p, cookie) => call(p, { method: "GET", cookie });
const PATCH = (p, body, cookie) => call(p, { method: "PATCH", body, cookie });
const DEL = (p, cookie) => call(p, { method: "DELETE", cookie });
const userIds = [];
async function account(tag, uiLocale = null) {
  const email = `${TAG}-${tag}@example.com`;
  const reg = await call("/auth/register", { body: { email, password: PW, displayName: "Тест " + tag } });
  if (reg.status !== 201) throw new Error("регистрация: " + reg.text.slice(0, 200));
  const [u] = await sql`update users set email_verified_at=now(), ui_locale=coalesce(${uiLocale}, ui_locale) where email=${email} returning id`;
  userIds.push(u.id);
  const lr = await call("/auth/login", { body: { email, password: PW } });
  return { id: u.id, email, cookie: lr.cookie };
}
async function importSample(who) {
  const fd = new FormData(); fd.append("file", new Blob([readFileSync(FILE, "utf8")], { type: "text/html" }), `${TAG}-${Math.random().toString(36).slice(2, 5)}.html`);
  const imp = await call("/syntheses/import", { body: fd, cookie: who.cookie });
  if (!imp.json?.id) throw new Error("импорт: " + imp.text.slice(0, 200));
  return imp.json.id;
}
const typesOf = async (who, unreadOnly = false) => (await GET(`/notifications?limit=200${unreadOnly ? "&unread=1" : ""}`, who.cookie)).json.items.map((n) => n.type);
const has = (arr, t) => arr.includes(t);
async function waitType(who, type, { timeout = 8000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (has(await typesOf(who), type)) return true; await sleep(300); }
  return false;
}

/* ── Браузер ──────────────────────────────────────────────────────────── */
let browser = null;
async function newPage(who) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setUserAgentOverride", { userAgent: await browser.userAgent(), acceptLanguage: "ru-RU,ru" });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("dialog", (d) => void d.accept());
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  return page;
}
const exists = async (page, sel) => (await page.$(sel)) !== null;
const click = (page, sel) => page.$eval(sel, (el) => el.click());
const text = (page, sel) => page.$eval(sel, (el) => el.textContent ?? "");
const waitSel = (page, sel, ms = 20000) => page.waitForSelector(sel, { timeout: ms });
const waitText = (page, sel, re, ms = 20000) => page.waitForFunction((s, r) => new RegExp(r).test(document.querySelector(s)?.textContent ?? ""), { timeout: ms }, sel, re.source);
const waitGone = (page, sel, ms = 20000) => page.waitForFunction((s) => document.querySelectorAll(s).length === 0, { timeout: ms }, sel);
async function typeInto(page, sel, value) { await page.$eval(sel, (el) => { el.value = ""; }); await page.focus(sel); await page.keyboard.type(value); }
const count = (page, sel) => page.$$eval(sel, (els) => els.length);

/* ══ Прогон ═════════════════════════════════════════════════════════════ */
const synthIds = [];
try {
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);
  if (want("R4")) {
    if (!CHROME) throw new Error("браузер не найден — Chrome 131 в кэше puppeteer или CHROME_PATH");
    console.log("■ Сборка клиента (vite build)");
    const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8", env: { ...process.env, VITE_STRIPE_PUBLISHABLE_KEY: "" } });
    ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
    sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t162-preview.log");
  }
  sp(["--import", "tsx", "index.ts"], ROOT + "server", SERVER_ENV, SERVER_LOG);
  await waitUp(`${BASE}/health`, "сервер");
  if (want("R4")) {
    await waitUp(UI, "preview");
    const puppeteer = (await import("puppeteer-core")).default;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
    const ver = await browser.version();
    console.log(`  (браузер: ${ver}; клиент — сборка под vite preview)`);
    ok(/131\./.test(ver), "браузер — Chrome 131 (09 §4)", ver);
  }

  /* ════ R2: приглашения живьём ════ */
  if (want("R2") || want("R3")) {
    console.log("\n■ R2: приглашения живьём");
    const owner = await account("owner"), de = await account("de", "de"), rev = await account("rev"), revoked = await account("rvk");
    const S = await importSample(owner); synthIds.push(S);
    ok((await GET(`/syntheses/${S}`, de.cookie)).status === 403, "до приглашения чужой приватную не читает (403)");
    // (а) существующий пользователь с ui_locale=de — письмо по-немецки, ссылка на страницу принятия
    const inv = await call(`/syntheses/${S}/members`, { body: { email: de.email, role: "reviewer" }, cookie: owner.cookie });
    ok(inv.status === 201 && inv.json.kind === "member" && inv.json.member.status === "invited" && inv.json.sent, "приглашение аккаунта → 201, строка invited, письмо поставлено", inv.json);
    const [deLetter] = await waitLetters(de.email, (l) => /Einladung/.test(l.subject));
    ok(!!deLetter && /Einladung zur Konzeption/.test(deLetter.subject) && /Rezensent/.test(deLetter.text) && deLetter.inviteLink?.endsWith(`/invitations/${S}`), "письмо приглашённому с ui_locale=de — по-немецки, роль «Rezensent», ссылка на /invitations/:id", deLetter?.subject);
    ok((await GET(`/syntheses/${S}`, de.cookie)).status === 403 && (await GET(`/syntheses/${S}/comments`, de.cookie)).status === 403, "приглашённый до принятия — читатель: приватная 403, обсуждение 403");
    ok((await call(`/syntheses/${S}/members`, { body: { email: de.email, role: "editor" }, cookie: owner.cookie })).status === 409, "повторное приглашение приглашённого → 409");
    const acc = await call(`/syntheses/${S}/membership/accept`, { cookie: de.cookie });
    const doc = await GET(`/syntheses/${S}`, de.cookie);
    ok(acc.status === 200 && acc.json.member.status === "active" && doc.status === 200 && doc.json.synthesis.capabilities.role === "reviewer" && doc.json.synthesis.capabilities.discuss && !doc.json.synthesis.capabilities.edit, "принятие → доступ к приватной концепции, role reviewer, discuss без edit", { acc: acc.status, doc: doc.status });
    ok((await call(`/syntheses/${S}/members`, { body: { email: de.email, role: "editor" }, cookie: owner.cookie })).status === 409 && (await call(`/syntheses/${S}/members`, { body: { email: owner.email, role: "editor" }, cookie: owner.cookie })).status === 409, "повторное приглашение участника и приглашение владельца → 409");
    ok((await call(`/syntheses/${S}/members`, { body: { email: rev.email, role: "reviewer" }, cookie: de.cookie })).status === 403, "участник приглашать не может (403)");
    // (б) новый адрес — регистрация по ссылке
    const newEmail = `${TAG}-new@example.com`;
    const ginv = await call(`/syntheses/${S}/members`, { body: { email: newEmail, role: "editor" }, cookie: owner.cookie });
    ok(ginv.status === 201 && ginv.json.kind === "invitation" && ginv.json.invitation.role === "editor", "приглашение адреса без аккаунта → invitation editor", ginv.json);
    const [regLetter] = await waitLetters(newEmail, (l) => !!l.registerToken);
    ok(!!regLetter && /приглашение в концепцию/.test(regLetter.subject) && /Учётной записи на этот адрес ещё нет/.test(regLetter.text), "письмо адресу без аккаунта — по-русски (язык запроса), ссылка на регистрацию", regLetter?.subject);
    const info = await GET(`/auth/invitations/${regLetter.registerToken}`);
    ok(info.status === 200 && info.json.synthesisId === S && info.json.email === newEmail && info.json.role === "editor" && info.json.inviterName === "Тест owner", "GET /auth/invitations/:token — сведения для регистрации", info.json);
    // повтор письма адресу — новый довод, прежний мёртв
    const members0 = (await GET(`/syntheses/${S}/members`, owner.cookie)).json;
    const resend = await call(`/syntheses/${S}/invitations/${members0.invitations[0].id}/resend`, { cookie: owner.cookie });
    const regLetters = await waitLetters(newEmail, (l) => !!l.registerToken, 2);
    const tok2 = regLetters.at(-1)?.registerToken;
    ok(resend.status === 200 && regLetters.length === 2 && tok2 && tok2 !== regLetter.registerToken && (await GET(`/auth/invitations/${regLetter.registerToken}`)).status === 400, "повтор письма адресу — второе письмо с новым доводом, прежняя ссылка → TOKEN_INVALID");
    const regWrong = await call("/auth/register", { body: { email: `${TAG}-wrong@example.com`, password: PW, inviteToken: tok2 } });
    if (regWrong.json?.user?.id) userIds.push(regWrong.json.user.id);
    ok(regWrong.status === 201 && regWrong.json.invitation === null && (await GET(`/auth/invitations/${tok2}`)).status === 200, "регистрация другого адреса с этим доводом — участия нет, довод цел");
    const reg = await call("/auth/register", { body: { email: newEmail, password: PW, displayName: "Новый", inviteToken: tok2 } });
    if (reg.json?.user?.id) userIds.push(reg.json.user.id);
    const nu = { id: reg.json?.user?.id, email: newEmail, cookie: (await call("/auth/login", { body: { email: newEmail, password: PW } })).cookie };
    const myInv = await GET(`/syntheses/${S}/membership`, nu.cookie);
    ok(reg.status === 201 && reg.json.invitation?.synthesisId === S && myInv.status === 200 && myInv.json.member.status === "invited" && myInv.json.member.role === "editor" && myInv.json.synthesis.ownerName === "Тест owner", "регистрация по ссылке → участие invited того же синтеза", { reg: reg.json, my: myInv.json });
    ok((await GET(`/syntheses/${S}/members`, owner.cookie)).json.invitations.length === 0, "ждущее приглашение адреса погашено после регистрации");
    const acc2 = await call(`/syntheses/${S}/membership/accept`, { cookie: nu.cookie });
    ok(acc2.status === 200 && (await GET(`/syntheses/${S}`, nu.cookie)).json?.synthesis?.capabilities.role === "editor" && !(await GET(`/syntheses/${S}`, nu.cookie)).json.synthesis.capabilities.edit, "новый участник принял — читает приватную как editor, edit false (до 17.1)");
    // (в) отзыв приглашённого
    const rinv = await call(`/syntheses/${S}/members`, { body: { email: revoked.email, role: "reviewer" }, cookie: owner.cookie });
    const list1 = (await GET(`/syntheses/${S}/members`, owner.cookie)).json.members;
    const rRow = list1.find((m) => m.userId === revoked.id);
    const resendM = await call(`/syntheses/${S}/members/${rRow.id}/resend`, { cookie: owner.cookie });
    const rLetters = await waitLetters(revoked.email, (l) => /приглашение/.test(l.subject), 2);
    ok(rinv.status === 201 && resendM.status === 200 && resendM.json.sent && rLetters.length === 2, "повтор письма приглашённому с аккаунтом — второе письмо");
    const rev1 = await DEL(`/syntheses/${S}/members/${rRow.id}`, owner.cookie);
    ok(rev1.status === 200 && rev1.json.removed === "invited" && (await GET(`/syntheses/${S}/membership`, revoked.cookie)).status === 404 && (await call(`/syntheses/${S}/membership/accept`, { cookie: revoked.cookie })).status === 404, "отзыв приглашения: removed invited, у приглашённого приглашения больше нет (404), принять нельзя");
    ok((await call(`/syntheses/${S}/members`, { body: { email: revoked.email, role: "editor" }, cookie: owner.cookie })).status === 201, "после отзыва приглашение адресу снова возможно");
    // (г) смена роли
    const deRow = (await GET(`/syntheses/${S}/members`, owner.cookie)).json.members.find((m) => m.userId === de.id);
    const chg = await PATCH(`/syntheses/${S}/members/${deRow.id}`, { role: "editor" }, owner.cookie);
    ok(chg.status === 200 && chg.json.role === "editor" && (await GET(`/syntheses/${S}`, de.cookie)).json.synthesis.capabilities.role === "editor", "смена роли → права смотрящего обновились");
    ok((await PATCH(`/syntheses/${S}/members/${deRow.id}`, { role: "owner" }, owner.cookie)).status === 400 && (await PATCH(`/syntheses/${S}/members/${deRow.id}`, { role: "reviewer" }, de.cookie)).status === 403, "роль вне перечня → 400; смена роли не владельцем → 403");
    // (д) исключение: комментарий и рецензия остаются «бывшим участником»
    const [cat] = await sql`select id, name from categories where synthesis_id=${S} order by name limit 1`;
    const c1 = await call(`/syntheses/${S}/comments`, { body: { target: { kind: "category", key: cat.name }, body: "комментарий участника de" }, cookie: de.cookie });
    const rv = await call(`/syntheses/${S}/reviews`, { body: { title: "рецензия de", summary: "итог" }, cookie: de.cookie });
    const pub = await call(`/syntheses/${S}/reviews/${rv.json?.id}/publish`, { cookie: de.cookie });
    ok(c1.status === 201 && pub.status === 200 && c1.json.author.formerMember === false, "участник оставил комментарий и опубликовал рецензию; formerMember false");
    const ex = await DEL(`/syntheses/${S}/members/${deRow.id}`, owner.cookie);
    const cList = (await GET(`/syntheses/${S}/comments`, owner.cookie)).json.comments;
    const rList = (await GET(`/syntheses/${S}/reviews`, owner.cookie)).json;
    const c1a = cList.find((c) => c.id === c1.json.id), rva = rList.find((r) => r.id === rv.json.id);
    ok(ex.status === 200 && ex.json.removed === "active" && (await GET(`/syntheses/${S}`, de.cookie)).status === 403 && (await GET(`/syntheses/${S}/comments`, de.cookie)).status === 403, "исключение: доступ к приватной и обсуждению закрыт");
    ok(c1a?.author.formerMember === true && c1a.body === "комментарий участника de" && !c1a.author.deleted && rva?.author.formerMember === true && rva.status === "published", "комментарий и рецензия исключённого остались с пометкой «бывший участник»", { c: c1a?.author, r: rva?.author });
    ok(cList.every((c) => c.author.id !== owner.id || !c.author.formerMember) && (await GET(`/syntheses/${S}/comments`, nu.cookie)).json.comments.find((c) => c.id === c1.json.id)?.author.formerMember === true, "владелец бывшим не помечен; действующий участник видит ту же пометку");
    ok((await call(`/syntheses/${S}/members`, { body: { email: de.email, role: "reviewer" }, cookie: owner.cookie })).status === 201, "исключённого можно пригласить снова");
    const shared = await GET("/syntheses/shared", nu.cookie);
    ok(shared.status === 200 && shared.json.items.length === 1 && shared.json.items[0].myRole === "editor" && shared.json.items[0].myStatus === "active", "GET /syntheses/shared у действующего участника — концепция с ролью");

    /* ════ R3: уведомления ════ */
    if (want("R3")) {
      console.log("\n■ R3: уведомления — каждое событие получателю, не автору; счётчик; сводка");
      const S2 = await importSample(owner); synthIds.push(S2);
      const en = await account("en", "en"), dig = await account("dig", "en"), decl = await account("decl");
      await PATCH("/notifications/settings", { mutedCategories: ["comments"] }, dig.cookie); // отключённая категория у получателя сводки
      await PATCH("/notifications/settings", { emailDigest: false }, owner.cookie);
      await PATCH("/notifications/settings", { emailDigest: false }, en.cookie);
      // владелец копил непрочитанное ещё в R2 (сводка могла уйти до выключения — это по правилам); считаем от этой точки
      const isDigest = (l) => /new notification|нов(ое|ых) уведомлен/.test(l.subject);
      const digestsOff = () => lettersInLog().filter((l) => (l.to === owner.email || l.to === en.email) && isDigest(l)).length;
      const digestsBefore = digestsOff();
      const before = { owner: await typesOf(owner), en: await typesOf(en), dig: await typesOf(dig) };
      // member_invited — приглашённому, не владельцу
      for (const u of [en, dig, decl]) await call(`/syntheses/${S2}/members`, { body: { email: u.email, role: "reviewer" }, cookie: owner.cookie });
      ok(has(await typesOf(en), "member_invited") && (await typesOf(owner)).filter((t) => t === "member_invited").length === before.owner.filter((t) => t === "member_invited").length, "member_invited — приглашённому, не владельцу");
      // member_accepted — владельцу, не акцептанту
      await call(`/syntheses/${S2}/membership/accept`, { cookie: en.cookie });
      await call(`/syntheses/${S2}/membership/accept`, { cookie: dig.cookie });
      ok(has(await typesOf(owner), "member_accepted") && !has(await typesOf(en), "member_accepted"), "member_accepted — владельцу, не принявшему");
      // member_declined — владельцу
      await call(`/syntheses/${S2}/membership/decline`, { cookie: decl.cookie });
      ok(has(await typesOf(owner), "member_declined") && !has(await typesOf(decl), "member_declined"), "member_declined — владельцу, не отклонившему");
      // member_role_changed — участнику
      const enRow = (await GET(`/syntheses/${S2}/members`, owner.cookie)).json.members.find((m) => m.userId === en.id);
      await PATCH(`/syntheses/${S2}/members/${enRow.id}`, { role: "editor" }, owner.cookie);
      ok(has(await typesOf(en), "member_role_changed") && !has(await typesOf(owner), "member_role_changed"), "member_role_changed — участнику, не владельцу");
      // comment_new — владельцу и другим участникам, не автору; dig отключил comments — не получает
      const [cat2] = await sql`select id, name from categories where synthesis_id=${S2} order by name limit 1`;
      const root = await call(`/syntheses/${S2}/comments`, { body: { target: { kind: "category", key: cat2.name }, body: "корень en" }, cookie: en.cookie });
      ok(has(await typesOf(owner), "comment_new") && !has(await typesOf(en), "comment_new") && !has(await typesOf(dig), "comment_new"), "comment_new — владельцу, не автору; у отключившего категорию строки нет");
      // comment_reply — автору корня, не автору ответа
      await call(`/syntheses/${S2}/comments`, { body: { parentId: root.json.id, body: "ответ владельца" }, cookie: owner.cookie });
      ok(has(await typesOf(en), "comment_reply") && !has(await typesOf(owner), "comment_reply"), "comment_reply — автору ветки, не ответившему");
      // review_published — всем участникам, не автору
      const rv2 = await call(`/syntheses/${S2}/reviews`, { body: { title: "r", summary: "итог рецензии en" }, cookie: en.cookie });
      await call(`/syntheses/${S2}/reviews/${rv2.json.id}/publish`, { cookie: en.cookie });
      ok(has(await typesOf(owner), "review_published") && has(await typesOf(dig), "review_published") && !has(await typesOf(en), "review_published"), "review_published — владельцу и участнику, не автору");
      // finding_outdated — ПРОХОДОМ РАБОТНИКА после правки категории владельцем (PATCH /categories/:id)
      const patchCat = await PATCH(`/syntheses/${S2}/categories/${cat2.id}`, { definition: "правка владельца 16.2" }, owner.cookie);
      ok(patchCat.status === 200, "владелец правит категорию через PATCH /categories/:id", patchCat.json);
      const gotOutdated = await waitType(en, "finding_outdated", { timeout: 12000 });
      const outRows = (await GET("/notifications?limit=200", en.cookie)).json.items.filter((n) => n.type === "finding_outdated");
      ok(gotOutdated && outRows.length === 1 && outRows[0].refId === root.json.id && outRows[0].address?.kind === "category", "finding_outdated автору открытого комментария — проходом работника (≤ 12 с), одна строка", outRows);
      await sleep(2500);
      ok((await GET("/notifications?limit=200", en.cookie)).json.items.filter((n) => n.type === "finding_outdated").length === 1 && !has(await typesOf(owner), "finding_outdated"), "повторные проходы строку не дублируют; владелец (не автор) её не получает");
      // member_removed — исключённому
      await DEL(`/syntheses/${S2}/members/${enRow.id}`, owner.cookie);
      ok(has(await typesOf(en), "member_removed") && !has(await typesOf(owner), "member_removed"), "member_removed — исключённому");
      // счётчик, read, read-all
      const uc = await GET("/notifications/unread-count", en.cookie);
      const list = await GET("/notifications?unread=1&limit=200", en.cookie);
      ok(uc.json.unread === list.json.items.length && uc.json.unread >= 5, `счётчик непрочитанного = длине ?unread=1 (${uc.json.unread})`);
      const rd = await call(`/notifications/${list.json.items[0].id}/read`, { cookie: en.cookie });
      ok(rd.status === 200 && rd.json.readAt && (await GET("/notifications/unread-count", en.cookie)).json.unread === uc.json.unread - 1, "read одной строки — счётчик −1");
      ok((await call(`/notifications/${list.json.items[1].id}/read`, { cookie: owner.cookie })).status === 404, "чужую строку пометить нельзя (404)");
      const ra = await call("/notifications/read-all", { cookie: en.cookie });
      ok(ra.json.marked === uc.json.unread - 1 && (await GET("/notifications/unread-count", en.cookie)).json.unread === 0, "«прочитать всё» — счётчик 0");
      // сводка: dig (en) — member_invited + review_published непрочитаны, comments отключены; владелец и en — сводка выключена
      const [digest] = await waitLetters(dig.email, (l) => /new notification/.test(l.subject), 1, { timeout: 15000 });
      ok(!!digest && /invites you to the concept/.test(digest.text) && /published a review/.test(digest.text) && !/корень en|ответ владельца/.test(digest.text), "сводка по почте участнику под его языком (en): приглашение и рецензия есть, отключённые комментарии — нет", digest?.text.slice(0, 600));
      ok(/2 new notifications/.test(digest?.subject ?? ""), "тема сводки — число непрочитанного (2)", digest?.subject);
      // новое событие — вторая сводка в пределах часа не уходит
      await DEL(`/syntheses/${S2}/members/${(await GET(`/syntheses/${S2}/members`, owner.cookie)).json.members.find((m) => m.userId === dig.id).id}`, owner.cookie);
      await sleep(3500);
      ok(lettersInLog().filter((l) => l.to === dig.email && /new notification/.test(l.subject)).length === 1 && has(await typesOf(dig), "member_removed"), "в пределах интервала вторая сводка не уходит, хотя новое непрочитанное появилось");
      ok(digestsOff() === digestsBefore, "у выключивших сводку новых сводок нет (при непрочитанном у обоих)", { before: digestsBefore, after: digestsOff() });
      const [dl] = await sql`select count(*)::int as n from notifications where user_id=${dig.id} and read_at is null and emailed_at is null and type <> 'member_removed'`;
      ok(dl.n === 0, "строки, вошедшие в сводку, помечены emailed_at");
    }
  }

  /* ════ R4: браузер ════ */
  if (want("R4")) {
    console.log("\n■ R4: браузер — вкладка «Участники», страница принятия, «Со мной поделились», колокольчик");
    const owner = await account("ui-owner"), rev = await account("ui-rev"), rev2 = await account("ui-rev2");
    const S = await importSample(owner); synthIds.push(S);
    const po = await newPage(owner);
    await po.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
    await waitSel(po, T("page-tabs"));
    ok(await exists(po, T("tab-members")) && !(await exists(po, T("view-banner"))), "владельцу — вкладки «Документ | Участники», полосы просмотра нет");
    await click(po, T("tab-members"));
    await waitSel(po, T("members-panel"));
    ok(await exists(po, T("members-empty")), "вкладка «Участники» пуста до приглашений");
    await typeInto(po, T("invite-email"), rev.email);
    await po.select(T("invite-role"), "reviewer");
    await click(po, T("invite-submit"));
    await waitSel(po, T("member-row"));
    ok(/приглашён/.test(await text(po, T("member-status"))) && /Приглашение отправлено/.test(await text(po, T("invite-note"))), "приглашение из формы — строка «приглашён», заметка", await text(po, T("members-panel")));
    await typeInto(po, T("invite-email"), rev.email);
    await click(po, T("invite-submit"));
    await waitSel(po, T("invite-error"));
    ok(/уже приглашён/.test(await text(po, T("invite-error"))), "повтор — 409 строкой под формой");
    await typeInto(po, T("invite-email"), `${TAG}-ui-noacc@example.com`);
    await po.select(T("invite-role"), "editor");
    await click(po, T("invite-submit"));
    await waitSel(po, T("invitation-row"));
    ok(/ссылка отправлена/.test(await text(po, T("invitation-status"))), "адрес без аккаунта — строка «ссылка отправлена»");
    const [uiReg] = await waitLetters(`${TAG}-ui-noacc@example.com`, (l) => !!l.registerToken);
    ok(!!uiReg, "письмо адресу без аккаунта в логе сервера");
    // колокольчик приглашённого → страница принятия
    const pr = await newPage(rev);
    await pr.goto(`${UI}/catalog`, { waitUntil: "networkidle0" });
    await waitSel(pr, T("notification-bell"));
    await waitText(pr, T("notification-count"), /^1$/);
    await click(pr, T("notification-toggle"));
    await waitSel(pr, T("notification-item"));
    ok(/приглашает вас в концепцию/.test(await text(pr, T("notification-item"))), "колокольчик: счётчик 1, строка приглашения");
    await click(pr, `${T("notification-item")} button`);
    await waitSel(pr, T("invitation-lead"));
    ok(pr.url().endsWith(`/invitations/${S}`) && await exists(pr, T("invitation-accept")) && await exists(pr, T("invitation-decline")), "страница принятия: «Принять» / «Отклонить»");
    await click(pr, T("invitation-accept"));
    await waitSel(pr, T("invitation-open"));
    await waitText(pr, T("invitation-lead"), /Вы участник/);
    ok(!(await exists(pr, T("notification-count"))), "после перехода по строке счётчик обнулился");
    await click(pr, T("invitation-open"));
    await waitSel(pr, T("view-banner"));
    ok((await pr.$eval(T("view-banner"), (el) => el.dataset.viewer)) === "member" && /роль: рецензент/.test(await text(pr, T("view-banner"))) && !(await exists(pr, T("page-tabs"))), "концепция участнику: полоса «роль: рецензент», вкладок владельца нет");
    // владелец: роль и второй шаг исключения
    await po.reload({ waitUntil: "networkidle0" });
    await click(po, T("tab-members"));
    await waitSel(po, T("member-row"));
    await waitText(po, T("member-status"), /участник/);
    await po.select(T("member-role"), "editor");
    await sleep(800);
    ok((await sql`select role from synthesis_members where synthesis_id=${S} and user_id=${rev.id}`)[0]?.role === "editor", "смена роли через <select> сохранена");
    await click(po, T("member-exclude"));
    await waitSel(po, T("member-exclude-confirm"));
    ok(await exists(po, T("member-exclude-warn")) && await exists(po, T("member-exclude-cancel")), "исключение — второй шаг: «Точно исключить?», предупреждение, «Отмена»");
    await click(po, T("member-exclude-cancel"));
    ok(!(await exists(po, T("member-exclude-confirm"))), "«Отмена» снимает второй шаг");
    await click(po, T("member-exclude"));
    await waitSel(po, T("member-exclude-confirm"));
    await click(po, T("member-exclude-confirm"));
    await waitGone(po, T("member-row"));
    ok((await sql`select count(*)::int as n from synthesis_members where synthesis_id=${S} and user_id=${rev.id}`)[0].n === 0, "исключение исполнено");
    // колокольчик исключённого: уведомления о роли и исключении, «Прочитать всё»
    await pr.goto(`${UI}/catalog`, { waitUntil: "networkidle0" });
    await waitText(pr, T("notification-count"), /^2$/);
    await click(pr, T("notification-toggle"));
    await waitSel(pr, T("notification-item"));
    const items = await pr.$$eval(T("notification-item"), (els) => els.map((e) => e.dataset.type + ":" + e.dataset.read));
    ok(items[0] === "member_removed:0" && items[1] === "member_role_changed:0", "список: исключение и смена роли непрочитаны, новые первыми", items);
    await click(pr, T("notification-read-all"));
    await pr.waitForFunction((s) => !document.querySelector(s), { timeout: 10000 }, T("notification-count"));
    ok((await pr.$$eval(T("notification-item"), (els) => els.every((e) => e.dataset.read === "1"))) && (await GET("/notifications/unread-count", rev.cookie)).json.unread === 0, "«Прочитать всё» — строки прочитаны, счётчик снят, сервер согласен");
    // «Со мной поделились»
    await call(`/syntheses/${S}/members`, { body: { email: rev2.email, role: "editor" }, cookie: owner.cookie });
    const p2 = await newPage(rev2);
    await p2.goto(`${UI}/catalog`, { waitUntil: "networkidle0" });
    await waitSel(p2, T("catalog-tabs"));
    await p2.$$eval(`${T("catalog-tabs")} button`, (bs) => bs.find((b) => /Со мной поделились/.test(b.textContent ?? "")).click());
    await waitSel(p2, T("card-my-role"));
    ok(/приглашён · редактор/.test(await text(p2, T("card-my-role"))), "«Со мной поделились»: бейдж «приглашён · редактор»");
    await call(`/syntheses/${S}/membership/accept`, { cookie: rev2.cookie });
    await p2.reload({ waitUntil: "networkidle0" });
    await p2.$$eval(`${T("catalog-tabs")} button`, (bs) => bs.find((b) => /Со мной поделились/.test(b.textContent ?? "")).click());
    await waitSel(p2, T("card-my-role"));
    ok((await text(p2, T("card-my-role"))) === "редактор", "после принятия — бейдж «редактор»");
    // профиль — уведомления
    await p2.goto(`${UI}/profile`, { waitUntil: "networkidle0" });
    await waitSel(p2, T("notif-cat-comments"));
    ok((await count(p2, `${T("profile-notifications")} input[type=checkbox]`)) === 6, "профиль: 5 категорий + сводка");
    await click(p2, `${T("notif-cat-outdated")} input`);
    await p2.waitForFunction((s) => document.querySelector(s)?.dataset.enabled === "0", { timeout: 10000 }, T("notif-cat-outdated"));
    const st = (await GET("/notifications/settings", rev2.cookie)).json;
    ok(J(st.mutedCategories) === '["outdated"]' && st.emailDigest === true, "переключатель категории сохранён сервером", st);
    // регистрация по ссылке
    const pg = await newPage(null);
    await pg.goto(`${UI}/register?invite=${uiReg.registerToken}`, { waitUntil: "networkidle0" });
    await waitSel(pg, T("register-invite"));
    ok((await pg.$eval("input[type=email]", (el) => el.value)) === `${TAG}-ui-noacc@example.com` && (await pg.$eval("input[type=email]", (el) => el.readOnly)), "регистрация по ссылке: врезка, адрес заперт");
    await pg.focus("input[type=password]");
    await pg.keyboard.type(PW);
    await pg.$eval("button[type=submit]", (el) => el.click());
    await waitSel(pg, T("invitation-accept"));
    ok(pg.url().endsWith(`/invitations/${S}`), "после регистрации — страница принятия");
    const [nu] = await sql`select id from users where email=${`${TAG}-ui-noacc@example.com`}`;
    if (nu) userIds.push(nu.id);
    ok([po, pr, p2, pg].every((p) => p.errors.length === 0), "страницы без ошибок JS", [po, pr, p2, pg].flatMap((p) => p.errors));
  }
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch {} }
  try {
    for (const id of synthIds) await sql`delete from syntheses where id=${id}`;
    for (const id of userIds) await sql`delete from users where id=${id}`;
    await sql`delete from mail_outbox where to_email like ${TAG + "-%"}`;
  } catch (e) { console.error("уборка:", e); }
  await sql.end({ timeout: 2 });
}
console.log(`\nИТОГ test-162 (запросы 2–4): ${passed} ✓ / ${failed} ✗${fails.length ? "\n  провалы: " + fails.join(" | ") : ""}`);
process.exit(failed ? 1 : 0);
