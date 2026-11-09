/**
 * Браузерный прогон беседы 16.2, первый запрос — интерфейс на СБОРКЕ
 * клиента (vite build → vite preview :5231) под Chrome 131 (CHROME_PATH
 * либо ~/.cache/puppeteer/chrome/linux-131.0.6778.204), сервер :3000 с
 * почтой в консоль:
 *   U1 вкладка «Участники» владельца: приглашение аккаунта (строка invited),
 *      409 строкой под формой, смена роли, второй шаг исключения (взвод →
 *      отмена → взвод → исключить), приглашение адреса без аккаунта;
 *   U2 колокольчик приглашённого: счётчик, список, переход на страницу
 *      принятия, «Принять» → открыть концепцию (баннер роли);
 *   U3 каталог «Со мной поделились» с бейджем роли;
 *   U4 профиль: раздел «Уведомления», переключатель категории и сводки;
 *   U5 регистрация по ссылке /register?invite=… — врезка, запертый адрес,
 *      после регистрации — страница принятия.
 * Запуск: npx tsx tests/test-162-request1-ui.mjs   (PG/Redis подняты)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import postgres from "postgres";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5231; // preview проксирует /api на :3000 (vite.config server.proxy)
const BASE = `http://127.0.0.1:${PORT}/api/v1`, UI = `http://127.0.0.1:${UI_PORT}`;
// Сначала Chrome 131 из кэша puppeteer (09 §4: иные версии дают расхождения), CHROME_PATH — запасной:
// в песочнице CHROME_PATH указывал на системный Chrome 153 (грабля 16.2)
const CHROME = [`${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`, process.env.CHROME_PATH].find((p) => p && existsSync(p));
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (id) => `[data-testid="${id}"]`;
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 900) : ""}`); }
}
const TAG = "t162-" + Math.random().toString(36).slice(2, 6);
const PW = "password-162";
const FILE = ROOT + "sample/" + readdirSync(ROOT + "sample").find((f) => f.endsWith(".html"));

const procs = [];
function sp(args, cwd, env, logFile) {
  const log = openSync(logFile, "w");
  const p = spawn(process.execPath, args, { cwd, detached: true, stdio: ["ignore", log, log], env: { ...process.env, ...env } });
  procs.push(p);
  return p;
}
async function isUp(url) { try { return (await fetch(url)).status < 500; } catch { return false; } }
async function waitUp(url, what) { for (let i = 0; i < 120; i++) { if (await isUp(url)) return; await sleep(500); } throw new Error(`${what} не поднялся: ${url}`); }
async function call(p, { method = "POST", body, cookie } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const r = await fetch(BASE + p, { method, headers, body: body instanceof FormData ? body : body !== undefined ? J(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] || null };
}
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
async function typeInto(page, sel, value) { await page.$eval(sel, (el) => { el.value = ""; }); await page.focus(sel); await page.keyboard.type(value); }
const count = (page, sel) => page.$$eval(sel, (els) => els.length);

let S = null;
try {
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);
  if (!CHROME) throw new Error("браузер не найден — задайте CHROME_PATH (Chrome 131)");
  console.log("■ Сборка клиента (vite build)");
  const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8", env: { ...process.env, VITE_STRIPE_PUBLISHABLE_KEY: "" } });
  ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t162-preview.log");
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", RATE_LIMIT_MAIL_PER_HOUR: "1000", MAIL_TRANSPORT: "console", BILLING_ENFORCE: "false", NOTIFY_SCAN_INTERVAL_MS: "600000" }, "/tmp/t162-server.log");
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "preview");
  const puppeteer = (await import("puppeteer-core")).default;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
  console.log(`  (браузер: ${await browser.version()}; клиент — сборка под vite preview)`);

  const owner = await account("owner"), rev = await account("rev");
  const fd = new FormData(); fd.append("file", new Blob([readFileSync(FILE, "utf8")], { type: "text/html" }), `${TAG}.html`);
  const imp = await call("/syntheses/import", { body: fd, cookie: owner.cookie });
  S = imp.json?.id;
  ok(!!S, "импорт образца владельцем (POST /syntheses/import)", imp.text.slice(0, 200));

  /* ── U1: вкладка «Участники» ── */
  console.log("\n■ U1: вкладка «Участники» владельца");
  const po = await newPage(owner);
  await po.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
  await waitSel(po, T("page-tabs"));
  ok(await exists(po, T("tab-members")) && !(await exists(po, T("view-banner"))), "владельцу — вкладки «Документ | Участники», полосы просмотра нет");
  await click(po, T("tab-members"));
  await waitSel(po, T("members-panel"));
  await waitSel(po, T("members-empty")); // список приезжает отдельным запросом — ждать элемент фазы, не контейнер (09 §4 16.2)
  ok(await exists(po, T("members-empty")) && await exists(po, T("invite-form")), "вкладка «Участники»: форма приглашения, список пуст");
  await typeInto(po, T("invite-email"), rev.email);
  await po.select(T("invite-role"), "reviewer");
  await click(po, T("invite-submit"));
  await waitSel(po, T("member-row"));
  ok(/приглашён/.test(await text(po, T("member-status"))) && /Приглашение отправлено/.test(await text(po, T("invite-note"))), "приглашение аккаунта: строка «приглашён», заметка об отправке", await text(po, T("members-panel")));
  await typeInto(po, T("invite-email"), rev.email);
  await click(po, T("invite-submit"));
  await waitSel(po, T("invite-error"));
  ok(/уже приглашён/.test(await text(po, T("invite-error"))), "повторное приглашение — 409 строкой под формой", await text(po, T("invite-error")));
  ok(await exists(po, T("member-resend")) && await exists(po, T("member-revoke")) && !(await exists(po, T("member-exclude"))), "у приглашённого — «Письмо ещё раз» и «Отозвать», исключения нет");
  await typeInto(po, T("invite-email"), `${TAG}-noacc@example.com`);
  await po.select(T("invite-role"), "editor");
  await click(po, T("invite-submit"));
  await waitSel(po, T("invitation-row"));
  ok(/ссылка отправлена/.test(await text(po, T("invitation-status"))) && await exists(po, T("invitation-resend")) && await exists(po, T("invitation-revoke")), "адрес без аккаунта — строка «ссылка отправлена» с повтором и отзывом");
  const regLink = (await sql`select body_text from mail_outbox where to_email=${`${TAG}-noacc@example.com`} order by created_at desc limit 1`)[0]?.body_text.match(/\/register\?invite=[A-Za-z0-9_-]+/)?.[0];
  ok(!!regLink, "письмо адресу без аккаунта несёт ссылку /register?invite=");

  /* ── U2: колокольчик и страница принятия ── */
  console.log("\n■ U2: колокольчик приглашённого, принятие");
  const pr = await newPage(rev);
  await pr.goto(`${UI}/catalog`, { waitUntil: "networkidle0" });
  await waitSel(pr, T("notification-bell"));
  await waitText(pr, T("notification-count"), /^1$/);
  ok((await text(pr, T("notification-count"))) === "1", "колокольчик: счётчик 1 после приглашения");
  await click(pr, T("notification-toggle"));
  await waitSel(pr, T("notification-item"));
  const itemText = await text(pr, T("notification-item"));
  ok(/приглашает вас в концепцию/.test(itemText) && /рецензент/.test(itemText) && (await pr.$eval(T("notification-item"), (el) => el.dataset.read)) === "0", "список: фраза приглашения с ролью, непрочитано", itemText);
  await click(pr, `${T("notification-item")} button`);
  await waitSel(pr, T("invitation-lead"));
  ok(pr.url().endsWith(`/invitations/${S}`) && /приглашает вас/.test(await text(pr, T("invitation-lead"))) && await exists(pr, T("invitation-accept")), "переход на страницу принятия; текст приглашения, кнопки", await text(pr, T("invitation-page")));
  await click(pr, T("invitation-accept"));
  await waitSel(pr, T("invitation-open"));
  await waitText(pr, T("invitation-lead"), /Вы участник/);
  ok(/Вы участник этой концепции/.test(await text(pr, T("invitation-lead"))), "после «Принять» — «вы участник», кнопка «Открыть концепцию»");
  await waitText(pr, T("notification-bell"), /./);
  ok(!(await exists(pr, T("notification-count"))), "счётчик колокольчика обнулился (клик по строке пометил прочитанным)");
  await click(pr, T("invitation-open"));
  await waitSel(pr, T("view-banner"));
  ok((await pr.$eval(T("view-banner"), (el) => el.dataset.viewer)) === "member" && /роль: рецензент/.test(await text(pr, T("view-banner"))) && !(await exists(pr, T("tab-members"))), "страница концепции участнику: полоса «Вы участник · роль: рецензент», вкладки «Участники» нет (16.3: свои вкладки участника — есть)");

  /* ── U1b: владелец видит участника, меняет роль, исключает со вторым шагом ── */
  console.log("\n■ U1b: роль и исключение со вторым шагом");
  await po.reload({ waitUntil: "networkidle0" });
  await click(po, T("tab-members"));
  await waitSel(po, T("member-row"));
  await waitText(po, T("member-status"), /участник/);
  ok(/участник/.test(await text(po, T("member-status"))) && await exists(po, T("member-exclude")), "у владельца строка стала «участник», есть «Исключить»");
  await po.select(T("member-role"), "editor");
  await sleep(800);
  ok((await po.$eval(T("member-role"), (el) => el.value)) === "editor" && (await sql`select role from synthesis_members where synthesis_id=${S} and user_id=${rev.id}`)[0]?.role === "editor", "смена роли через <select> — PATCH сразу");
  await click(po, T("member-exclude"));
  await waitSel(po, T("member-exclude-confirm"));
  ok(await exists(po, T("member-exclude-warn")) && await exists(po, T("member-exclude-cancel")), "второй шаг: «Точно исключить?», «Отмена», предупреждение");
  await click(po, T("member-exclude-cancel"));
  ok(!(await exists(po, T("member-exclude-confirm"))) && await exists(po, T("member-exclude")), "«Отмена» возвращает первый шаг");
  await click(po, T("member-exclude"));
  await waitSel(po, T("member-exclude-confirm"));
  await click(po, T("member-exclude-confirm"));
  await po.waitForFunction((s) => document.querySelectorAll(s).length === 0, { timeout: 20000 }, T("member-row"));
  ok((await sql`select count(*)::int as n from synthesis_members where synthesis_id=${S} and user_id=${rev.id}`)[0].n === 0, "исключение исполнено — строки участника нет");
  ok(po.errors.length === 0, "страница владельца без ошибок JS", po.errors);

  /* ── U3: «Со мной поделились» ── */
  console.log("\n■ U3: каталог «Со мной поделились»");
  const rev2 = await account("rev2");
  await call(`/syntheses/${S}/members`, { body: { email: rev2.email, role: "editor" }, cookie: owner.cookie });
  const p2 = await newPage(rev2);
  await p2.goto(`${UI}/catalog`, { waitUntil: "networkidle0" });
  await waitSel(p2, T("catalog-tabs"));
  const tabs = await p2.$$eval(`${T("catalog-tabs")} button`, (bs) => bs.map((b) => b.textContent));
  ok(tabs.some((t) => /Со мной поделились/.test(t)), "вкладка «Со мной поделились» есть", tabs);
  await p2.$$eval(`${T("catalog-tabs")} button`, (bs) => bs.find((b) => /Со мной поделились/.test(b.textContent ?? "")).click());
  await waitSel(p2, T("card-my-role"));
  ok(/приглашён · редактор/.test(await text(p2, T("card-my-role"))), "карточка с бейджем «приглашён · редактор»", await text(p2, T("card-my-role")));
  await call(`/syntheses/${S}/membership/accept`, { cookie: rev2.cookie });
  await p2.reload({ waitUntil: "networkidle0" });
  await p2.$$eval(`${T("catalog-tabs")} button`, (bs) => bs.find((b) => /Со мной поделились/.test(b.textContent ?? "")).click());
  await waitSel(p2, T("card-my-role"));
  ok((await text(p2, T("card-my-role"))) === "редактор", "после принятия бейдж — «редактор»");

  /* ── U4: профиль — уведомления ── */
  console.log("\n■ U4: профиль — раздел «Уведомления»");
  await p2.goto(`${UI}/profile`, { waitUntil: "networkidle0" });
  await waitSel(p2, T("notif-cat-comments"));
  ok((await count(p2, `${T("profile-notifications")} input[type=checkbox]`)) === 6 && (await p2.$eval(T("notif-cat-comments"), (el) => el.dataset.enabled)) === "1", "раздел: 5 категорий + сводка, все включены");
  await click(p2, `${T("notif-cat-comments")} input`);
  await p2.waitForFunction((s) => document.querySelector(s)?.dataset.enabled === "0", { timeout: 10000 }, T("notif-cat-comments"));
  // PATCH первого переключателя ещё в пути (чекбоксы disabled, busy): второй клик — только после его ответа
  await p2.waitForFunction((s) => !document.querySelector(`${s} input`)?.disabled, { timeout: 10000 }, T("notif-digest"));
  await click(p2, `${T("notif-digest")} input`);
  await p2.waitForFunction((s) => document.querySelector(s)?.dataset.enabled === "0", { timeout: 10000 }, T("notif-digest"));
  // data-enabled меняется оптимистично до ответа сервера — БД читать после снятия busy (чекбокс снова enabled)
  await p2.waitForFunction((s) => !document.querySelector(`${s} input`)?.disabled, { timeout: 10000 }, T("notif-digest"));
  const [st] = await sql`select muted_categories, email_digest from notification_settings where user_id=${rev2.id}`;
  ok(J(st?.muted_categories) === '["comments"]' && st?.email_digest === false, "переключатели сохранены сервером (muted comments, сводка выключена)", st);
  ok(p2.errors.length === 0 && pr.errors.length === 0, "страницы участников без ошибок JS", [...p2.errors, ...pr.errors]);

  /* ── U5: регистрация по приглашению ── */
  console.log("\n■ U5: регистрация по ссылке из письма");
  const pg = await newPage(null);
  await pg.goto(UI + regLink, { waitUntil: "networkidle0" });
  await waitSel(pg, T("register-invite"));
  ok(/приглашает вас в концепцию/.test(await text(pg, T("register-invite"))) && /редактор/.test(await text(pg, T("register-invite"))), "врезка приглашения с ролью", await text(pg, T("register-invite")));
  ok((await pg.$eval("input[type=email]", (el) => el.value)) === `${TAG}-noacc@example.com` && (await pg.$eval("input[type=email]", (el) => el.readOnly)), "адрес подставлен и заперт");
  await pg.focus("input[type=password]");
  await pg.keyboard.type(PW);
  await pg.$eval("button[type=submit]", (el) => el.click());
  await waitSel(pg, T("invitation-accept"));
  ok(pg.url().endsWith(`/invitations/${S}`), "после регистрации — страница принятия с «Принять»");
  const [nu] = await sql`select id from users where email=${`${TAG}-noacc@example.com`}`;
  if (nu) userIds.push(nu.id);
  ok(pg.errors.length === 0, "страница регистрации без ошибок JS", pg.errors);
  // недействительная ссылка
  const pb = await newPage(null);
  await pb.goto(`${UI}/register?invite=${"x".repeat(40)}`, { waitUntil: "networkidle0" });
  await waitSel(pb, T("register-invite-invalid"));
  ok(!(await pb.$eval("input[type=email]", (el) => el.readOnly)), "негодная ссылка — предупреждение, адрес свободен");
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch {} }
  try {
    if (S) await sql`delete from syntheses where id=${S}`;
    for (const id of userIds) await sql`delete from users where id=${id}`;
    await sql`delete from mail_outbox where to_email like ${TAG + "-%"}`;
  } catch (e) { console.error("уборка:", e); }
  await sql.end({ timeout: 2 });
}
console.log(`\nИТОГ test-162 (первый запрос, интерфейс): ${passed} ✓ / ${failed} ✗${fails.length ? "\n  провалы: " + fails.join(" | ") : ""}`);
process.exit(failed ? 1 : 0);
