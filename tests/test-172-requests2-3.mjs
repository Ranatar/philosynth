/**
 * Беседа 17.2, тестовые запросы 2–3 — двое (и трое) в браузере
 * (Chrome 131, СБОРКА клиента под vite preview :5233; сервер :3000; мок
 * Claude :3972 — только для подраздельной перегенерации редактора):
 *
 *   R2 «редактор правит тезис и перегенерирует подраздел; владелец
 *      одновременно правит тот же тезис → конфликт с понятным выбором;
 *      история показывает исполнителей»:
 *      а) владелец открыл форму тезиса и набрал обоснование (не сохранил);
 *      б) редактор в своём браузере правит формулировку ТОГО ЖЕ тезиса —
 *         сохранено, версия записала исполнителем редактора;
 *      в) редактор перегенерирует подраздел из «✎ Изменить» (мок модели):
 *         строка журнала — с исполнителем-редактором, номер документа sub+1;
 *      г) владелец жмёт «Сохранить» → сообщение о конфликте в ЕГО браузере:
 *         что разошлось, текущая версия, запись не сделана, одна кнопка
 *         действия; перечитка называет поле, изменённое другим; повтор
 *         проходит — обе правки на месте;
 *      д) настоящая одновременность: оба жмут «Сохранить» у ВТОРОГО тезиса
 *         в один миг (Promise.all) — записана ровно одна версия, у другого
 *         конфликт; перечитал — повторил;
 *      е) история версий тезиса у владельца — «исполнил: <редактор>»;
 *         журнал — «Запустил: <редактор>» (владельцу — в окне лога и по
 *         API; рецензенту имён журнала без флага автора не видно).
 *   R3 «рецензент предлагает замену термина из комментария; владелец видит
 *      разницу и каскад, принимает — план исполняется, версия „принято
 *      предложение“; второе предложение по тому же термину стало
 *      устаревшим — „Новое поверх текущего“; отклонение со вторым шагом».
 *
 * Запуск (из корня; PG/Redis подняты, порты 3000, 5233, 3972 свободны):
 *   node_modules/.bin/tsx tests/test-172-requests2-3.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, readdirSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import postgres from "postgres";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5233, MOCK_PORT = 3972;
const BASE = `http://127.0.0.1:${PORT}/api/v1`, UI = `http://127.0.0.1:${UI_PORT}`;
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
const TAG = "t172b-" + Math.random().toString(36).slice(2, 6);
const PW = "password-172";
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
async function account(tag) {
  const email = `${TAG}-${tag}@example.com`;
  const reg = await call("/auth/register", { body: { email, password: PW, displayName: "Тест " + tag } });
  if (reg.status !== 201) throw new Error("регистрация: " + reg.text.slice(0, 200));
  const [u] = await sql`update users set email_verified_at=now() where email=${email} returning id`;
  userIds.push(u.id);
  const lr = await call("/auth/login", { body: { email, password: PW } });
  return { id: u.id, email, cookie: lr.cookie, name: "Тест " + tag };
}
let browser = null;
async function newPage(who) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setUserAgentOverride", { userAgent: await browser.userAgent(), acceptLanguage: "ru-RU,ru" });
  page.errors = [];
  page.confirms = 0;
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("dialog", (d) => { page.confirms++; void d.accept(); });
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  return page;
}
const exists = async (page, sel) => (await page.$(sel)) !== null;
const click = (page, sel) => page.$eval(sel, (el) => el.click());
const text = (page, sel) => page.$eval(sel, (el) => el.textContent ?? "");
const waitSel = (page, sel, ms = 20000) => page.waitForSelector(sel, { timeout: ms });
const waitGone = (page, sel, ms = 20000) => page.waitForSelector(sel, { hidden: true, timeout: ms });
const count = (page, sel) => page.$$eval(sel, (els) => els.length);
/** Значение контролируемого поля React — нативным сеттером + событие input */
const setValue = (page, sel, value) =>
  page.$eval(sel, (el, v) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  }, value);


/* ── Мок Claude: один заданный ответ (mock.reply), иначе — заглушка ── */
const mock = { calls: 0, reply: null };
const mockSrv = http.createServer((req, res) => {
  let body = ""; req.on("data", (d) => (body += d));
  req.on("end", () => {
    mock.calls++;
    const answer = mock.reply ?? "<p>МОК 172: ответ без задания.</p>";
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (o) => res.write(`data: ${J(o)}\n\n`);
    send({ type: "message_start", message: { usage: { input_tokens: 1000 } } });
    send({ type: "content_block_delta", delta: { type: "text_delta", text: answer } });
    send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 500 } });
    send({ type: "message_stop" }); res.end();
  });
});
await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));

const SAVE = (kind) => `[data-element-editor="${kind}"] .inline-edit-actions .action-btn.primary`;
const clickSave = (page, kind) => page.$$eval(SAVE(kind), (els) => els[els.length - 1].click());
const saveDisabled = (page, kind) => page.$$eval(SAVE(kind), (els) => els[els.length - 1].disabled);
/** Открыть инлайн-редактор n-го тезиса и дождаться формы */
async function openThesis(page, n) {
  await waitSel(page, 'button[data-edit-kind="thesis"]');
  await page.$$eval('button[data-edit-kind="thesis"]', (els, i) => els[i].click(), n);
  await waitSel(page, '[data-element-editor="thesis"] #th-ed-form');
}
async function untilRow(fn, pred, tries = 80) { let r = null; for (let i = 0; i < tries; i++) { r = await fn(); if (pred(r)) return r; await sleep(150); } return r; }

let S = null;
try {
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);
  if (!CHROME) throw new Error("браузер не найден — соберите Chrome 131 по chrome/README.md");
  console.log("■ Сборка клиента (vite build)");
  const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8", env: { ...process.env, VITE_STRIPE_PUBLISHABLE_KEY: "" } });
  ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t172b-preview.log");
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", RATE_LIMIT_MAIL_PER_HOUR: "1000", MAIL_TRANSPORT: "console", BILLING_ENFORCE: "false", NOTIFY_SCAN_INTERVAL_MS: "600000", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-172", STREAM_RETRY_DELAYS: "50" }, "/tmp/t172b-server.log");
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "preview");
  const puppeteer = (await import("puppeteer-core")).default;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
  const ver = await browser.version();
  ok(/131\.0\.6778/.test(ver), `браузер Chrome 131 (${ver})`);

  const owner = await account("owner"), editor = await account("editor"), rev = await account("rev");
  const fd = new FormData(); fd.append("file", new Blob([readFileSync(FILE, "utf8")], { type: "text/html" }), `${TAG}.html`);
  const imp = await call("/syntheses/import", { body: fd, cookie: owner.cookie });
  S = imp.json?.id;
  ok(!!S, "импорт образца владельцем", imp.text.slice(0, 200));
  for (const [who, role] of [[editor, "editor"], [rev, "reviewer"]]) {
    const inv = await call(`/syntheses/${S}/members`, { body: { email: who.email, role }, cookie: owner.cookie });
    const acc = await call(`/syntheses/${S}/membership/accept`, { cookie: who.cookie });
    if (inv.status !== 201 || acc.status !== 200) throw new Error(`участник ${role}: ${inv.status}/${acc.status} ${inv.text.slice(0, 200)}`);
  }
  const theses = await sql`select id, formulation, justification from theses where synthesis_id=${S} order by thesis_num`;
  const [T1, T2] = theses;
  if (!T1 || !T2) throw new Error("в образце меньше двух тезисов");

  /* ════ R2: двое в браузере ═══════════════════════════════════════════ */
  console.log("\n■ R2-а: владелец открыл форму тезиса и набрал обоснование (не сохранил)");
  const po = await newPage(owner);
  await po.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
  await openThesis(po, 0);
  ok((await po.$eval("#th-ed-form", (el) => el.value)) === T1.formulation, "владелец: форма первого тезиса открыта");
  const OWN_JUST = `обоснование владельца ${TAG}`;
  await setValue(po, "#th-ed-just", OWN_JUST);

  console.log("\n■ R2-б: редактор правит формулировку того же тезиса");
  const pe = await newPage(editor);
  await pe.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
  await openThesis(pe, 0);
  const ED_FORM = `формулировка редактора ${TAG}`;
  await setValue(pe, "#th-ed-form", ED_FORM);
  await clickSave(pe, "thesis");
  const rowB = await untilRow(async () => (await sql`select formulation, justification from theses where id=${T1.id}`)[0], (r) => r.formulation === ED_FORM);
  const [v1] = await sql`select version, change_source, actor_user_id from element_versions where element_id=${T1.id} order by version desc limit 1`;
  ok(rowB.formulation === ED_FORM && rowB.justification === T1.justification && v1?.version === 1 && v1.change_source === "manual" && v1.actor_user_id === editor.id && !(await exists(pe, T("version-conflict"))), "редактор сохранил формулировку: версия 1, исполнитель версии — редактор", { rowB, v1 });

  console.log("\n■ R2-в: редактор перегенерирует подраздел (мок модели)");
  const secs = (await call(`/syntheses/${S}/sections`, { method: "GET", cookie: editor.cookie })).json.sections;
  const plain = secs.filter((s) => !["sum", "capsule", "graph", "theses", "glossary", "critique"].includes(s.key) && s.subsections.length > 1);
  const sec = plain[0] ?? secs.find((s) => s.subsections.length > 1);
  if (!sec) throw new Error("нет раздела с подразделами");
  const subName = sec.subsections[sec.subsections.length - 1];
  const subTitle = sec.subsectionTitles?.[subName] ?? subName;
  const MARK = `МОК 172: подраздел перегенерирован редактором ${TAG}`;
  mock.reply = `<div data-section="${subName}"><h4>${subName}</h4>\n<p>${MARK}</p>\n</div>`;
  const [ver0] = await sql`select version_base b, version_sub s from syntheses where id=${S}`;
  const t0 = new Date();
  await click(pe, T("edit-open"));
  await waitSel(pe, `.edit-modal #editCard-${sec.key}`);
  const opened = await pe.$$eval(`#editCard-${sec.key} button.edit-sec-btn`, (els, title) => { const b = els.find((e) => (e.textContent ?? "").replace(/^\s*⟳\s*/, "").trim() === title); b?.click(); return !!b; }, subTitle);
  ok(opened, `в модалке правок у редактора есть кнопка подраздела «${subTitle}» раздела ${sec.key}`);
  await pe.waitForFunction(() => [...document.querySelectorAll(".edit-modal button.edit-sec-btn.primary")].some((b) => /перегенерировать/i.test(b.textContent ?? "") && !b.disabled), { timeout: 20000 });
  // волны каскада не берём: снимаем отмеченные галочки панели (перегенерируется один подраздел)
  await pe.$$eval(".edit-modal button.edit-sec-btn.primary", (els) => {
    const run = els.find((b) => /перегенерировать/i.test(b.textContent ?? ""));
    const panel = run.parentElement.parentElement;
    for (const cb of panel.querySelectorAll('label.edit-sec-check input[type="checkbox"]')) if (cb.checked) cb.click();
  });
  await sleep(200);
  await pe.$$eval(".edit-modal button.edit-sec-btn.primary", (els) => els.find((b) => /перегенерировать/i.test(b.textContent ?? "")).click());
  const logRow = await untilRow(async () => (await sql`select section_key, status, actor_user_id from generation_log where synthesis_id=${S} and log_type='generation' and section_key=${sec.key + ":" + subName} and created_at >= ${t0.toISOString()} order by created_at desc limit 1`)[0], (r) => !!r && r.status !== "streaming", 200);
  // строка журнала закрывается раньше, чем раздел и номер документа записаны, — ждать сам предмет
  const htmlAfter = await untilRow(async () => (await sql`select html_content h from sections where synthesis_id=${S} and key=${sec.key}`)[0].h, (h) => h.includes(MARK), 100);
  const ver1 = await untilRow(async () => (await sql`select version_base b, version_sub s from syntheses where id=${S}`)[0], (v) => v.s !== ver0.s || v.b !== ver0.b, 60);
  ok(logRow?.status === "done" && logRow.actor_user_id === editor.id && htmlAfter.includes(MARK) && mock.calls >= 1, "подраздел перегенерирован: текст мока в документе, строка журнала — с исполнителем-редактором", { logRow, calls: mock.calls });
  ok(ver1.b === ver0.b && ver1.s === ver0.s + 1, "номер документа вырос по прежним правилам (sub + 1) — исполнитель на него не влияет", { ver0, ver1 });
  mock.reply = null;
  await untilRow(async () => (await call(`/syntheses/${S}`, { method: "GET", cookie: owner.cookie })).json?.synthesis?.status, (s) => s === "ready");
  await sleep(900); // слот операции освобождается после статуса (09 §4, 10.2)

  console.log("\n■ R2-г: владелец сохраняет — конфликт в его браузере");
  ok((await po.$eval("#th-ed-just", (el) => el.value)) === OWN_JUST, "набранное владельцем пережило чужую правку и перегенерацию (форма не пересоздана)");
  await clickSave(po, "thesis");
  await waitSel(po, T("version-conflict"));
  const cText = await text(po, T("version-conflict"));
  const btns = await po.$$eval(`${T("version-conflict")} button`, (els) => els.map((e) => e.dataset.testid));
  const rowG0 = (await sql`select formulation, justification from theses where id=${T1.id}`)[0];
  ok(/версия 0/.test(cText) && /сейчас — 1/.test(cText) && /не сделана|не записан/i.test(cText), "сообщение понятно: писали к версии 0, сейчас — 1, запись не сделана", cText);
  ok(J(btns) === J(["version-conflict-reread", "version-conflict-dismiss"]) && !/перезапис/i.test(cText) && (await saveDisabled(po, "thesis")) === true && rowG0.justification === T1.justification, "выбор один — «Перечитать и повторить» (+ «Отмена»); «перезаписать» нет, «Сохранить» закрыто, в БД правки владельца нет", { btns });
  await click(po, T("version-conflict-reread"));
  await waitSel(po, `${T("version-conflict")}[data-reread="1"]`);
  const changed = await po.$$eval("[data-conflict-field]", (els) => els.map((e) => e.dataset.conflictField));
  ok((await po.$eval("#th-ed-form", (el) => el.value)) === ED_FORM && (await po.$eval("#th-ed-just", (el) => el.value)) === OWN_JUST && J(changed) === J(["formulation"]), "перечитка: формулировка — редактора (поле названо изменённым другим), обоснование владельца цело", { changed });
  await clickSave(po, "thesis");
  await waitGone(po, T("version-conflict"));
  const rowG = await untilRow(async () => (await sql`select formulation, justification from theses where id=${T1.id}`)[0], (r) => r.justification === OWN_JUST);
  const versG = await sql`select version, actor_user_id from element_versions where element_id=${T1.id} order by version`;
  ok(rowG.formulation === ED_FORM && rowG.justification === OWN_JUST && versG.length === 2 && versG[0].actor_user_id === editor.id && versG[1].actor_user_id === owner.id, "повтор прошёл: обе правки на месте, версии 1 (редактор) и 2 (владелец)", { rowG, versG });

  console.log("\n■ R2-е: история показывает исполнителей");
  await po.waitForFunction(() => [...document.querySelectorAll('[data-element-editor="thesis"] .action-btn')].some((b) => /история версий/i.test(b.textContent ?? "")), { timeout: 20000 });
  await po.$$eval('[data-element-editor="thesis"] .action-btn', (els) => els.find((b) => /история версий/i.test(b.textContent ?? ""))?.click());
  await waitSel(po, T("version-actor"));
  const actors = await po.$$eval(T("version-actor"), (els) => els.map((e) => e.textContent ?? ""));
  ok(actors.length === 1 && actors[0].includes(editor.name), "история версий тезиса у владельца: «исполнил: <редактор>» у версии редактора; у своей версии подписи нет", actors);
  const logOwner = await call(`/syntheses/${S}/logs/formatted`, { method: "GET", cookie: owner.cookie });
  const logEditor = await call(`/syntheses/${S}/logs/formatted`, { method: "GET", cookie: editor.cookie });
  const logRev = await call(`/syntheses/${S}/logs/formatted`, { method: "GET", cookie: rev.cookie });
  ok(logOwner.status === 200 && logOwner.json.text.includes(`Запустил: ${editor.name}`) && logEditor.status === 200 && logEditor.json.text.includes(`Запустил: ${editor.name}`), "журнал генерации владельцу и редактору: «Запустил: <редактор>»");
  ok(logRev.status === 403, "журнал рецензенту без флага автора закрыт (403)", logRev.status);
  // автор открывает журнал флагом: участник (рецензент) видит имя исполнителя, читатель — нет
  const stranger = await account("reader");
  const vis = await call(`/syntheses/${S}`, { method: "PATCH", body: { visibility: "full", showLogs: true }, cookie: owner.cookie });
  const logRev2 = await call(`/syntheses/${S}/logs/formatted`, { method: "GET", cookie: rev.cookie });
  const logReader = await call(`/syntheses/${S}/logs/formatted`, { method: "GET", cookie: stranger.cookie });
  ok(vis.status === 200 && logRev2.status === 200 && logRev2.json.text.includes(`Запустил: ${editor.name}`) && logReader.status === 200 && !logReader.json.text.includes(editor.name) && !/Запустил:/.test(logReader.json.text), "при show_logs: участнику имя исполнителя видно, читателю — нет («Запустил» без имён не показывается)", { rev: logRev2.status, reader: logReader.status });
  const back = await call(`/syntheses/${S}`, { method: "PATCH", body: { visibility: "private", showLogs: false }, cookie: owner.cookie });
  if (back.status !== 200) throw new Error("возврат видимости: " + back.text.slice(0, 200));
  let logShown = false;
  try {
    await po.$$eval('[data-element-editor="thesis"] .action-btn', (els) => els.find((b) => /закрыть|отмена/i.test(b.textContent ?? ""))?.click());
    const hasBtn = await po.$$eval("button", (els) => { const b = els.find((e) => /◈\s*лог/i.test(e.textContent ?? "")); b?.click(); return !!b; });
    if (hasBtn) { await po.waitForFunction((n) => (document.body.textContent ?? "").includes("Запустил: " + n), { timeout: 15000 }, editor.name); logShown = true; }
  } catch {}
  ok(logShown, "окно лога у владельца показывает «Запустил: <редактор>»");
  await po.keyboard.press("Escape");

  console.log("\n■ R2-д: настоящая одновременность — оба жмут «Сохранить» у второго тезиса");
  const pe2 = await newPage(editor), po2 = await newPage(owner);
  await Promise.all([pe2.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" }), po2.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" })]);
  await openThesis(pe2, 1); await openThesis(po2, 1);
  const SIM_E = `одновременно: редактор ${TAG}`, SIM_O = `одновременно: владелец ${TAG}`;
  await setValue(pe2, "#th-ed-form", SIM_E);
  await setValue(po2, "#th-ed-just", SIM_O);
  await Promise.all([clickSave(pe2, "thesis"), clickSave(po2, "thesis")]);
  const settle = async () => {
    for (let i = 0; i < 100; i++) {
      const [ce, co] = [await exists(pe2, T("version-conflict")), await exists(po2, T("version-conflict"))];
      const [n] = await sql`select count(*)::int as n from element_versions where element_id=${T2.id}`;
      if (n.n >= 1 && (ce || co)) return { ce, co, n: n.n };
      await sleep(150);
    }
    return { ce: await exists(pe2, T("version-conflict")), co: await exists(po2, T("version-conflict")), n: (await sql`select count(*)::int as n from element_versions where element_id=${T2.id}`)[0].n };
  };
  const sim = await settle();
  await sleep(600);
  const simN = (await sql`select count(*)::int as n from element_versions where element_id=${T2.id}`)[0].n;
  ok(simN === 1 && sim.ce !== sim.co, "одновременные «Сохранить»: записана ровно одна версия, у второго — конфликт (ни одна правка не потеряна молча)", { ...sim, simN });
  const loser = sim.ce ? pe2 : po2;
  await click(loser, T("version-conflict-reread"));
  await waitSel(loser, `${T("version-conflict")}[data-reread="1"]`);
  await clickSave(loser, "thesis");
  await waitGone(loser, T("version-conflict"));
  const rowD = await untilRow(async () => (await sql`select formulation, justification from theses where id=${T2.id}`)[0], (r) => r.formulation === SIM_E && r.justification === SIM_O);
  const versD = await sql`select actor_user_id from element_versions where element_id=${T2.id} order by version`;
  ok(rowD.formulation === SIM_E && rowD.justification === SIM_O && versD.length === 2 && new Set(versD.map((v) => v.actor_user_id)).size === 2, "проигравший перечитал и повторил: обе правки на месте, две версии двух исполнителей", { rowD, n: versD.length });
  ok([po, pe, po2, pe2].every((p) => p.errors.length === 0 && p.confirms === 0), "R2: четыре страницы без ошибок JS и без window.confirm", [po, pe, po2, pe2].flatMap((p) => p.errors));
  await pe2.close(); await po2.close();

  /* ════ R3: предложения ═══════════════════════════════════════════════ */
  console.log("\n■ R3-а: рецензент предлагает замену термина ИЗ КОММЕНТАРИЯ");
  const pr = await newPage(rev);
  await pr.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
  const termMark = `${T("addr-mark")}[data-address^="glossary_term:"]`;
  await waitSel(pr, termMark);
  await click(pr, termMark);
  await waitSel(pr, T("discussion-panel"));
  await setValue(pr, T("discussion-input"), `определение стоит уточнить ${TAG}`);
  await click(pr, T("discussion-send"));
  await waitSel(pr, T("thread"));
  await waitSel(pr, T("thread-propose"));
  await click(pr, T("thread-propose"));
  await waitSel(pr, T("propose-form"));
  await pr.waitForFunction((s) => (document.querySelector(s)?.value ?? "").length > 0, { timeout: 20000 }, T("propose-value"));
  const cur0 = await pr.$eval(T("propose-value"), (el) => el.value);
  const term = (await sql`select id, term, definition from glossary_terms where synthesis_id=${S}`).find((t) => t.definition === cur0);
  if (!term) throw new Error("термин по заполненному определению не найден");
  const NEW1 = `${cur0} — замена из комментария ${TAG}`;
  await setValue(pr, T("propose-value"), NEW1);
  await setValue(pr, T("propose-rationale"), `так точнее ${TAG}`);
  await click(pr, T("propose-submit"));
  await pr.waitForFunction((s) => document.querySelectorAll(s).length === 1, { timeout: 20000 }, T("discussion-proposal"));
  // второе предложение к тому же термину (напрямую) — до принятия первого
  await click(pr, T("discussion-propose"));
  await waitSel(pr, T("propose-form"));
  await pr.waitForFunction((s) => (document.querySelector(s)?.value ?? "").length > 0, { timeout: 20000 }, T("propose-value"));
  const NEW2 = `${cur0} — второй вариант ${TAG}`;
  await setValue(pr, T("propose-value"), NEW2);
  await click(pr, T("propose-submit"));
  await pr.waitForFunction((s) => document.querySelectorAll(s).length === 2, { timeout: 20000 }, T("discussion-proposal"));
  const props = await sql`select id, kind, field, value, status, source, source_id, base from proposals where synthesis_id=${S} order by created_at`;
  const [cmt] = await sql`select id from comments where synthesis_id=${S} and author_id=${rev.id} order by created_at limit 1`;
  ok(props.length === 2 && props[0].source === "comment" && props[0].source_id === cmt.id && props[0].kind === "replace" && props[0].field === "definition" && props[0].value === NEW1 && props[1].source === "direct" && (await sql`select definition from glossary_terms where id=${term.id}`)[0].definition === cur0, "предложение из комментария записано (source comment → id комментария), второе — напрямую; документ не изменён", props.map((p) => [p.source, p.source_id]));
  const notif = await sql`select user_id, type from notifications where synthesis_id=${S} and type='proposal_created'`;
  ok(notif.filter((n) => n.user_id === owner.id).length === 2 && notif.filter((n) => n.user_id === editor.id).length === 2 && !notif.some((n) => n.user_id === rev.id), "уведомление proposal_created — тем, кто решает (владельцу и редактору), не автору");

  console.log("\n■ R3-б: владелец видит разницу и каскад, принимает — план исполняется");
  const po3 = await newPage(owner);
  await po3.goto(`${UI}/synthesis/${S}?proposal=${props[0].id}`, { waitUntil: "networkidle0" });
  await waitSel(po3, T("proposal-panel"));
  await waitSel(po3, T("proposal-diff"));
  const delTxt = await po3.$$eval(`${T("proposal-diff")} .diff-line.del`, (els) => els.map((e) => e.textContent).join("\n"));
  const addTxt = await po3.$$eval(`${T("proposal-diff")} .diff-line.add`, (els) => els.map((e) => e.textContent).join("\n"));
  const srcTxt = await text(po3, T("proposal-source"));
  ok(delTxt.includes(cur0.slice(0, 40)) && addTxt.includes(`замена из комментария ${TAG}`) && (await text(po3, T("proposal-author"))).includes(rev.name) && /комментари/i.test(srcTxt), "панель решения по ссылке ?proposal=: разница «сейчас → предлагается», автор, источник — комментарий", srcTxt);
  await click(po3, T("proposal-accept"));
  await waitSel(po3, ".edit-modal");
  await waitSel(po3, T("plan-step-proposal"));
  const steps = await po3.$$eval(T("plan-step"), (els) => els.map((e) => ({ type: e.dataset.stepType, text: e.textContent ?? "" })));
  const cascadeSteps = steps.filter((s) => /каскад/i.test(s.text));
  const [planRow] = await sql`select p.status, p.steps from edit_plans p join proposals r on r.plan_id = p.id where r.id=${props[0].id}`;
  const dbCascade = (planRow?.steps ?? []).filter((s) => s.cascadeGenerated).length;
  ok(steps[0]?.type === "edit_element" && /№ 1/.test(steps[0].text) && steps[0].text.includes(rev.name) && planRow?.status === "draft" && cascadeSteps.length === dbCascade, `план-черновик в модалке правок: шаг по предложению № 1 и каскад предпросмотром (${dbCascade} каскадных шагов видны)`, { n: steps.length, dbCascade, shown: cascadeSteps.length });
  ok(dbCascade > 0, "каскад у правки термина есть (зависимые разделы показаны шагами, ждут решения)", dbCascade);
  ok((await sql`select definition from glossary_terms where id=${term.id}`)[0].definition === cur0 && (await sql`select status from proposals where id=${props[0].id}`)[0].status === "open", "до «Исполнить» документ не тронут, предложение open (принять ≠ исполнить)");
  await click(po3, T("edit-footer-run"));
  const pEnd = await untilRow(async () => (await sql`select status, decided_by from proposals where id=${props[0].id}`)[0], (r) => r.status === "accepted", 120);
  const [verT] = await sql`select version, change_source, origin, actor_user_id from element_versions where element_id=${term.id} order by version desc limit 1`;
  ok(pEnd.status === "accepted" && pEnd.decided_by === owner.id && (await sql`select definition from glossary_terms where id=${term.id}`)[0].definition === NEW1 && verT.change_source === "proposal" && verT.origin?.kind === "proposal" && verT.origin?.proposalId === props[0].id && verT.actor_user_id === owner.id, "план исполнен: термин заменён, предложение accepted, версия 'proposal' с происхождением", { pEnd, cs: verT?.change_source });
  const decided = await sql`select user_id, payload from notifications where synthesis_id=${S} and type='proposal_decided'`;
  ok(decided.length === 1 && decided[0].user_id === rev.id && decided[0].payload?.decision === "accepted", "автору — уведомление proposal_decided (accepted)", decided);
  await po3.waitForFunction(() => /·\s*done/i.test(document.querySelector(".edit-modal")?.textContent ?? ""), { timeout: 20000 });
  await sleep(300);
  await po3.$$eval(".edit-modal .raw-close, .edit-modal-header button", (els) => els[0]?.click());
  await waitGone(po3, ".edit-modal");
  // версия «принято предложение» — в истории термина
  await click(po3, T("tab-document"));
  await waitSel(po3, 'button[data-edit-kind="glossary_term"]');
  const idx = await po3.$$eval('button[data-edit-kind="glossary_term"]', (els, t) => els.findIndex((b) => (b.closest("tr")?.textContent ?? "").includes(t)), term.term);
  await po3.$$eval('button[data-edit-kind="glossary_term"]', (els, i) => els[i].click(), idx);
  await waitSel(po3, '[data-element-editor="glossary_term"] #gl-ed-def');
  await setValue(po3, "#gl-ed-def", NEW1 + " (правка владельца)");
  await clickSave(po3, "glossary_term");
  await po3.waitForFunction(() => [...document.querySelectorAll('[data-element-editor="glossary_term"] .action-btn')].some((b) => /история версий/i.test(b.textContent ?? "")), { timeout: 20000 });
  await po3.$$eval('[data-element-editor="glossary_term"] .action-btn', (els) => els.find((b) => /история версий/i.test(b.textContent ?? ""))?.click());
  await waitSel(po3, `${T("version-origin")}[data-origin-kind="proposal"]`);
  const originTxt = await text(po3, `${T("version-origin")}[data-origin-kind="proposal"]`);
  ok(/принято предложение № 1/i.test(originTxt) && originTxt.includes(rev.name), "история версий термина: «принято предложение № 1 пользователя <рецензент>»", originTxt.slice(0, 200));

  console.log("\n■ R3-в: второе предложение устарело — «Новое поверх текущего»");
  await click(po3, T("tab-proposals"));
  await po3.waitForFunction((s) => document.querySelectorAll(s).length === 1, { timeout: 20000 }, `${T("proposal-row")}[data-proposal-group="stale"]`);
  await click(po3, `${T("proposal-row")}[data-proposal-id="${props[1].id}"]`);
  await waitSel(po3, `${T("proposal-panel")}[data-proposal-stale="1"]`);
  const acc2 = await call(`/syntheses/${S}/proposals/${props[1].id}/accept`, { body: {}, cookie: owner.cookie });
  ok(!(await exists(po3, T("proposal-accept"))) && (await exists(po3, T("proposal-stale-note"))) && acc2.status === 409 && acc2.json?.code === "PROPOSAL_STALE", "устаревшее: кнопки «Принять» нет, сервер на принятие отвечает 409 PROPOSAL_STALE", acc2.text.slice(0, 160));
  await pr.goto(`${UI}/synthesis/${S}?proposal=${props[1].id}`, { waitUntil: "networkidle0" });
  await waitSel(pr, `${T("proposal-panel")}[data-proposal-stale="1"]`);
  await click(pr, T("proposal-rebase"));
  await waitSel(pr, T("proposal-rebase-form"));
  const NEW3 = `${NEW1} — поверх текущего ${TAG}`;
  await setValue(pr, T("proposal-rebase-value"), NEW3);
  await click(pr, T("proposal-rebase-submit"));
  const after = await untilRow(async () => await sql`select id, status, close_reason, superseded_by, base, value from proposals where synthesis_id=${S} order by created_at`, (r) => r.length === 3);
  const [curVer] = await sql`select max(version) as mx from element_versions where element_id=${term.id}`;
  ok(after.length === 3 && after[1].status === "closed" && after[1].close_reason === "superseded" && after[1].superseded_by === after[2].id && after[2].status === "open" && after[2].value === NEW3 && after[2].base?.version === curVer.mx, "«Новое поверх текущего» (автор): прежнее закрыто superseded, новое — с ТЕКУЩЕЙ основой", { base: after[2]?.base, cur: curVer.mx });

  console.log("\n■ R3-г: отклонение со вторым шагом");
  await po3.goto(`${UI}/synthesis/${S}?proposal=${after[2].id}`, { waitUntil: "networkidle0" });
  await waitSel(po3, `${T("proposal-panel")}[data-proposal-id="${after[2].id}"]`);
  await waitSel(po3, T("proposal-reject"));
  await click(po3, T("proposal-reject"));
  await waitSel(po3, T("proposal-reject-confirm"));
  ok((await sql`select status from proposals where id=${after[2].id}`)[0].status === "open", "первый клик «Отклонить» ничего не отклоняет — появился второй шаг");
  await po3.mouse.click(5, 5);
  await waitGone(po3, T("proposal-reject-confirm"));
  ok((await sql`select status from proposals where id=${after[2].id}`)[0].status === "open", "клик мимо сбрасывает второй шаг");
  await click(po3, T("proposal-reject"));
  await waitSel(po3, T("proposal-reject-confirm"));
  await setValue(po3, ".proposal-reject-note", `не подходит ${TAG}`);
  await click(po3, T("proposal-reject-confirm"));
  const rej = await untilRow(async () => (await sql`select status, decided_by, note from proposals where id=${after[2].id}`)[0], (r) => r.status === "rejected");
  const defEnd = (await sql`select definition from glossary_terms where id=${term.id}`)[0].definition;
  const dec2 = await sql`select payload from notifications where synthesis_id=${S} and type='proposal_decided' and user_id=${rev.id} order by created_at`;
  ok(rej.status === "rejected" && rej.decided_by === owner.id && rej.note === `не подходит ${TAG}` && defEnd === NEW1 + " (правка владельца)" && dec2.some((d) => d.payload?.decision === "rejected"), "второй шаг отклонил: rejected со словом решившего, документ не тронут, автору — proposal_decided", { rej, n: dec2.length });
  await po3.waitForFunction((s) => document.querySelector(s)?.dataset.proposalStatus === "rejected", { timeout: 20000 }, T("proposal-panel"));
  ok(!(await exists(po3, T("proposal-accept"))) && !(await exists(po3, T("proposal-reject"))), "отклонённое — в «Решённых», кнопок решения больше нет");
  ok([po3, pr].every((p) => p.errors.length === 0) && po3.confirms === 0, "R3: страницы без ошибок JS и без window.confirm", [...po3.errors, ...pr.errors]);
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
} finally {
  console.log(`\nИТОГ test-172 (тестовые запросы 2–3): ${passed} ✓ / ${failed} ✗${fails.length ? "\n  " + fails.join("\n  ") : ""}`);
  try { await browser?.close(); } catch {}
  for (const p of procs) { try { process.kill(-p.pid, "SIGKILL"); } catch {} }
  try { mockSrv.closeAllConnections?.(); mockSrv.close(); } catch {}
  try {
    if (S) await sql`delete from syntheses where id=${S}`;
    for (const id of userIds) {
      await sql`delete from notifications where user_id=${id}`;
      await sql`delete from sessions where user_id=${id}`;
      await sql`delete from api_usage where user_id=${id}`;
      await sql`delete from transactions where user_id=${id}`;
      await sql`delete from users where id=${id}`;
    }
  } catch (e2) { console.error("уборка:", e2); }
  await Promise.race([sql.end(), sleep(2000)]);
  process.exit(failed ? 1 : 0);
}
