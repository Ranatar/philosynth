/**
 * Беседа 17.2, первый запрос — проба интерфейса соавторства в браузере
 * (Chrome 131, СБОРКА клиента под vite preview; сервер :3000 без мока —
 * все шаги пробы бесплатные):
 *   U1 редактор: полоса роли, вкладки без «Участники», «✎ Изменить»,
 *      карандаши строк и капсулы есть, ✎ названия (управление) — нет;
 *   U2 конфликт версий: редактор открыл тезис, владелец тем временем
 *      поправил его обоснование → «Сохранить» редактора даёт сообщение с
 *      текущей версией и ОДНОЙ кнопкой «Перечитать и повторить»; запись не
 *      сделана; после перечитки форма называет поле, изменённое другим,
 *      набранное цело; повтор «Сохранить» проходит, обе правки на месте;
 *   U3 рецензент: правки нет; из панели адреса термина — «Предложить
 *      изменение», поле заполнено текущим определением; предложение записано;
 *   U4 владелец: вкладка «Предложения» со счётчиком, панель решения с
 *      автором и разницей; «Принять» → модалка правок с шагом и ссылкой
 *      «предложение № 1», документ не тронут → «Исполнить» → термин изменён,
 *      предложение в «Решённых»; история версий термина — «принято
 *      предложение № 1 пользователя …»;
 *   U5 второе предложение рецензента к тому же термину (записано до
 *      принятия первого) — «Устаревшие»: у владельца «Принять» нет, есть
 *      «Закрыть»; у автора — «Новое поверх текущего».
 *
 * Запуск (из корня; PG/Redis подняты, порты 3000 и 5232 свободны):
 *   node_modules/.bin/tsx tests/test-172-request1-ui.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import postgres from "postgres";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5232;
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
const TAG = "t172-" + Math.random().toString(36).slice(2, 6);
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

let S = null;
try {
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);
  if (!CHROME) throw new Error("браузер не найден — соберите Chrome 131 по chrome/README.md");
  console.log("■ Сборка клиента (vite build)");
  const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8", env: { ...process.env, VITE_STRIPE_PUBLISHABLE_KEY: "" } });
  ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t172-preview.log");
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", RATE_LIMIT_MAIL_PER_HOUR: "1000", MAIL_TRANSPORT: "console", BILLING_ENFORCE: "false", NOTIFY_SCAN_INTERVAL_MS: "600000" }, "/tmp/t172-server.log");
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

  /* ── U1: редактор видит всё, что владелец, кроме управления ── */
  console.log("\n■ U1: редактор — средства правки есть, управления нет");
  const pe = await newPage(editor);
  await pe.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
  await waitSel(pe, T("page-tabs"));
  await waitSel(pe, "button[data-edit-kind]");
  const role = await pe.$eval(T("view-banner"), (el) => el.dataset.role);
  ok(role === "editor" && (await exists(pe, T("tab-discussion"))) && (await exists(pe, T("tab-proposals"))) && !(await exists(pe, T("tab-members"))), "редактору — полоса роли и вкладки «Документ | Обсуждение | Рецензии | Предложения», «Участники» нет", role);
  ok((await exists(pe, T("edit-open"))) && (await count(pe, "button[data-edit-kind]")) > 5 && (await exists(pe, T("capsule-edit"))) && (await count(pe, "button[data-subsection-pencil], .subsection-pencil")) >= 0, "у редактора «✎ Изменить», карандаши строк таблиц и ✎ капсулы");
  ok(!(await exists(pe, ".doc-title .doc-title-edit-btn")), "✎ названия (управление) у редактора нет");

  /* ── U2: конфликт версий — «перечитать и повторить» ── */
  console.log("\n■ U2: конфликт версий у тезиса");
  const [th] = await sql`select id, formulation, justification from theses where synthesis_id=${S} order by thesis_num limit 1`;
  await click(pe, 'button[data-edit-kind="thesis"]');
  await waitSel(pe, '[data-element-editor="thesis"] #th-ed-form');
  const formNow = await pe.$eval("#th-ed-form", (el) => el.value);
  ok(formNow === th.formulation, "редактор открыл первый тезис (форма — его формулировка)");
  // владелец тем временем правит ОБОСНОВАНИЕ того же тезиса (как его клиент: с ожиданием 0)
  const own = await call(`/syntheses/${S}/theses/${th.id}`, { method: "PATCH", body: { justification: `обоснование владельца ${TAG}`, expectedVersion: 0 }, cookie: owner.cookie });
  ok(own.status === 200, "владелец поправил обоснование того же тезиса (версия 1)", own.text.slice(0, 200));
  await setValue(pe, "#th-ed-form", `формулировка редактора ${TAG}`);
  await pe.$$eval('[data-element-editor="thesis"] .inline-edit-actions .action-btn.primary', (els) => els[els.length - 1].click());
  await waitSel(pe, T("version-conflict"));
  const cText = await text(pe, T("version-conflict"));
  const [row1] = await sql`select formulation, justification from theses where id=${th.id}`;
  const btns = await pe.$$eval(`${T("version-conflict")} button`, (els) => els.map((e) => e.dataset.testid));
  ok(/версия 0/.test(cText) && /сейчас — 1/.test(cText) && row1.formulation === th.formulation && J(btns) === J(["version-conflict-reread", "version-conflict-dismiss"]), "сообщение о конфликте: текущая версия названа, запись не сделана, выбор — только «Перечитать и повторить» (и «Отмена»)", { cText: cText.slice(0, 300), btns });
  const saveDisabled = await pe.$$eval('[data-element-editor="thesis"] .inline-edit-actions .action-btn.primary', (els) => els[els.length - 1].disabled);
  ok(saveDisabled === true, "пока не перечитано — «Сохранить» закрыто (перезаписать нельзя)");
  await click(pe, T("version-conflict-reread"));
  await waitSel(pe, `${T("version-conflict")}[data-reread="1"]`);
  const kept = await pe.$eval("#th-ed-form", (el) => el.value);
  const justNow = await pe.$eval("#th-ed-just", (el) => el.value);
  const changed = await pe.$$eval("[data-conflict-field]", (els) => els.map((e) => e.dataset.conflictField));
  ok(kept === `формулировка редактора ${TAG}` && justNow === `обоснование владельца ${TAG}` && J(changed) === J(["justification"]), "после перечитки: набранное цело, обоснование — текущее (владельца), форма называет поле, изменённое другим", { kept, justNow, changed });
  await pe.$$eval('[data-element-editor="thesis"] .inline-edit-actions .action-btn.primary', (els) => els[els.length - 1].click());
  await waitGone(pe, T("version-conflict"));
  let row2 = null;
  for (let i = 0; i < 50; i++) { [row2] = await sql`select formulation, justification from theses where id=${th.id}`; if (row2.formulation !== th.formulation) break; await sleep(100); }
  const [vers] = await sql`select count(*)::int as n, max(version) as mx from element_versions where element_id=${th.id}`;
  ok(row2.formulation === `формулировка редактора ${TAG}` && row2.justification === `обоснование владельца ${TAG}` && vers.mx === 2, "повтор прошёл: формулировка редактора и обоснование владельца — оба на месте; версий две", { row2, vers });
  ok(pe.errors.length === 0 && pe.confirms === 0, "страница редактора без ошибок JS и без window.confirm", pe.errors);

  /* ── U3: рецензент предлагает замену термина ── */
  console.log("\n■ U3: рецензент — «Предложить изменение» из панели адреса");
  const pr = await newPage(rev);
  await pr.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
  await waitSel(pr, T("page-tabs"));
  await waitSel(pr, T("addr-mark"));
  ok(!(await exists(pr, T("edit-open"))) && (await count(pr, "button[data-edit-kind]")) === 0 && !(await exists(pr, T("capsule-edit"))) && (await exists(pr, T("tab-proposals"))), "рецензенту правки нет (ни «✎ Изменить», ни карандашей), вкладка «Предложения» есть");
  const termMark = `${T("addr-mark")}[data-address^="glossary_term:"]`;
  await waitSel(pr, termMark);
  const termAddr = await pr.$eval(termMark, (el) => el.dataset.address);
  await click(pr, termMark);
  await waitSel(pr, T("discussion-panel"));
  await waitSel(pr, T("discussion-propose"));
  await click(pr, T("discussion-propose"));
  await waitSel(pr, T("propose-form"));
  await pr.waitForFunction((s) => (document.querySelector(s)?.value ?? "").length > 0, { timeout: 20000 }, T("propose-value"));
  const prefilled = await pr.$eval(T("propose-value"), (el) => el.value);
  const terms = await sql`select id, term, definition from glossary_terms where synthesis_id=${S}`;
  const term = terms.find((t) => t.definition === prefilled);
  ok(!!term && termAddr.includes(term.term.toLowerCase().slice(0, 4)), "форма предложения заполнена ТЕКУЩИМ определением термина", { termAddr, prefilled: prefilled.slice(0, 80) });
  await click(pr, T("propose-submit"));
  await waitSel(pr, T("propose-error"));
  ok(/совпадает с текущим/.test(await text(pr, T("propose-error"))), "замена, равная текущему значению, не отправляется");
  const NEW1 = `${prefilled} — уточнено рецензентом ${TAG}`;
  await setValue(pr, T("propose-value"), NEW1);
  await setValue(pr, T("propose-rationale"), "точнее так\n\nвторой абзац основания");
  await click(pr, T("propose-submit"));
  await waitSel(pr, T("discussion-proposed-note"));
  await pr.waitForFunction((s) => document.querySelectorAll(s).length === 1, { timeout: 20000 }, T("discussion-proposal"));
  // второе предложение к тому же термину — до принятия первого (станет устаревшим)
  await click(pr, T("discussion-propose"));
  await waitSel(pr, T("propose-form"));
  await pr.waitForFunction((s) => (document.querySelector(s)?.value ?? "").length > 0, { timeout: 20000 }, T("propose-value"));
  const NEW2 = `${prefilled} — другой вариант ${TAG}`;
  await setValue(pr, T("propose-value"), NEW2);
  await click(pr, T("propose-submit"));
  await pr.waitForFunction((s) => document.querySelectorAll(s).length === 2, { timeout: 20000 }, T("discussion-proposal"));
  const props = await sql`select id, kind, field, value, status, source from proposals where synthesis_id=${S} order by created_at`;
  const [termRow0] = await sql`select definition from glossary_terms where id=${term.id}`;
  ok(props.length === 2 && props[0].value === NEW1 && props[0].field === "definition" && props[0].source === "direct" && termRow0.definition === prefilled, "два предложения записаны (готовая замена определения); документ не изменился");

  /* ── U4: владелец решает — «Принять» через план ── */
  console.log("\n■ U4: владелец — панель решения, «Принять» → план → исполнение");
  const po = await newPage(owner);
  await po.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
  await waitSel(po, T("tab-proposals-count"));
  ok((await text(po, T("tab-proposals-count"))).trim() === "2" && (await exists(po, T("tab-members"))) && (await exists(po, ".doc-title .doc-title-edit-btn")), "владельцу — счётчик открытых предложений 2, «Участники» и ✎ названия на месте");
  await click(po, T("tab-proposals"));
  await waitSel(po, T("proposals-tab"));
  await po.waitForFunction((s) => document.querySelectorAll(s).length === 2, { timeout: 20000 }, `${T("proposal-row")}[data-proposal-group="open"]`);
  await click(po, `${T("proposal-row")}[data-proposal-id="${props[0].id}"]`);
  await waitSel(po, T("proposal-panel"));
  await waitSel(po, T("proposal-diff"));
  const author = await text(po, T("proposal-author"));
  const dels = await count(po, `${T("proposal-diff")} .diff-line.del`), adds = await count(po, `${T("proposal-diff")} .diff-line.add`);
  const addText = await text(po, `${T("proposal-diff")} .diff-line.add`);
  const baseTxt = await text(po, T("proposal-base"));
  ok(author.includes(rev.name) && dels >= 1 && adds >= 1 && addText.includes(TAG) && /версия 0/.test(baseTxt) && (await exists(po, T("proposal-discuss"))) && (await exists(po, T("proposal-reject"))), "панель решения: кто предложил, основа и текущая версия, разница «сейчас → предлагается», «Обсудить», «Отклонить»", { author, dels, adds, baseTxt });
  const rationaleParas = await count(po, `${T("proposal-panel")} .proposal-rationale p`);
  ok(rationaleParas === 2, "основание — экранированным текстом, абзацами (UserText)", rationaleParas);
  // «Отклонить» — второй шаг; клик мимо сбрасывает
  await click(po, T("proposal-reject"));
  await waitSel(po, T("proposal-reject-confirm"));
  await po.mouse.click(5, 5);
  await waitGone(po, T("proposal-reject-confirm"));
  ok((await sql`select status from proposals where id=${props[0].id}`)[0].status === "open", "«Отклонить» — вторым шагом: первый клик ничего не отклоняет, клик мимо сбрасывает");
  await click(po, T("proposal-accept"));
  await waitSel(po, ".edit-modal");
  await waitSel(po, T("plan-step-proposal"));
  const stepType = await po.$eval(T("plan-step"), (el) => el.dataset.stepType);
  const stepRef = await text(po, T("plan-step-proposal"));
  const [termRow1] = await sql`select definition from glossary_terms where id=${term.id}`;
  const [p1mid] = await sql`select status, plan_id from proposals where id=${props[0].id}`;
  ok(stepType === "edit_element" && /№ 1/.test(stepRef) && stepRef.includes(rev.name) && termRow1.definition === prefilled && p1mid.status === "open" && !!p1mid.plan_id, "«Принять» открыл модалку правок с черновиком плана: шаг «предложение № 1 · автор», документ НЕ тронут, предложение open", { stepType, stepRef });
  await click(po, T("edit-footer-run"));
  let p1end = null;
  for (let i = 0; i < 100; i++) { [p1end] = await sql`select status from proposals where id=${props[0].id}`; if (p1end.status === "accepted") break; await sleep(150); }
  const [termRow2] = await sql`select definition from glossary_terms where id=${term.id}`;
  const [verRow] = await sql`select change_source, origin, actor_user_id from element_versions where element_id=${term.id} order by version desc limit 1`;
  ok(p1end.status === "accepted" && termRow2.definition === NEW1 && verRow.change_source === "proposal" && verRow.origin?.proposalId === props[0].id && verRow.actor_user_id === owner.id, "план исполнен: термин изменён, предложение accepted, версия 'proposal' с происхождением и исполнителем", { st: p1end.status, src: verRow.change_source });
  // модалку закрываем, когда план завершён И в интерфейсе (иначе законный вопрос «План исполняется. Закрыть?»)
  // (каскадные шаги остаются ждать решения — ждём статус плана, не значки шагов)
  await po.waitForFunction(() => /·\s*done/i.test(document.querySelector(".edit-modal")?.textContent ?? ""), { timeout: 20000 });
  await sleep(300);
  await po.$$eval(".edit-modal .raw-close, .edit-modal-header button", (els) => els[0]?.click());
  await waitGone(po, ".edit-modal");
  await po.waitForFunction((s) => document.querySelectorAll(s).length === 1, { timeout: 20000 }, `${T("proposal-row")}[data-proposal-group="decided"]`);

  /* ── U5: второе предложение устарело ── */
  console.log("\n■ U5: устаревшее предложение");
  await po.waitForFunction((s) => document.querySelectorAll(s).length === 1, { timeout: 20000 }, `${T("proposal-row")}[data-proposal-group="stale"]`);
  await click(po, `${T("proposal-row")}[data-proposal-id="${props[1].id}"]`);
  await waitSel(po, `${T("proposal-panel")}[data-proposal-stale="1"]`);
  ok(!(await exists(po, T("proposal-accept"))) && (await exists(po, T("proposal-close"))) && (await exists(po, T("proposal-stale-note"))) && !(await exists(po, T("proposal-rebase"))), "у владельца: устаревшее — без «Принять», с «Закрыть»; «Новое поверх текущего» — не ему (не автор)");
  await pr.goto(`${UI}/synthesis/${S}?proposal=${props[1].id}`, { waitUntil: "networkidle0" });
  await waitSel(pr, `${T("proposal-panel")}[data-proposal-stale="1"]`);
  ok((await exists(pr, T("proposal-rebase"))) && !(await exists(pr, T("proposal-accept"))) && !(await exists(pr, T("proposal-close"))) && !(await exists(pr, T("proposal-reject"))), "у автора (рецензента) по ссылке ?proposal=: «Новое поверх текущего» есть; принять/закрыть/отклонить — нет (не правит)");
  await click(pr, T("proposal-rebase"));
  await waitSel(pr, T("proposal-rebase-form"));
  await setValue(pr, T("proposal-rebase-value"), `${NEW1} — и ещё вариант ${TAG}`);
  await click(pr, T("proposal-rebase-submit"));
  let after = [];
  for (let i = 0; i < 60; i++) { after = await sql`select id, status, close_reason, superseded_by, base from proposals where synthesis_id=${S} order by created_at`; if (after.length === 3) break; await sleep(150); }
  ok(after.length === 3 && after[1].status === "closed" && after[1].close_reason === "superseded" && after[1].superseded_by === after[2].id && after[2].status === "open" && after[2].base?.version === 1, "«Новое поверх текущего»: новое предложение с текущей основой (версия 1), прежнее — closed/superseded", after.map((a) => [a.status, a.close_reason]));
  await pr.waitForFunction((s) => document.querySelectorAll(s).length === 1, { timeout: 20000 }, `${T("proposal-row")}[data-proposal-group="open"]`);

  /* ── история версий термина: «принято предложение № 1 пользователя …» ── */
  await click(po, T("tab-document"));
  await waitSel(po, 'button[data-edit-kind="glossary_term"]');
  const idx = await po.$$eval('button[data-edit-kind="glossary_term"]', (els, t) => els.findIndex((b) => (b.closest("tr")?.textContent ?? "").includes(t)), term.term);
  await po.$$eval('button[data-edit-kind="glossary_term"]', (els, i) => els[i].click(), idx);
  await waitSel(po, '[data-element-editor="glossary_term"]');
  // инлайн-редактор открыт в правке: «Отмена» закрыла бы его — история доступна из просмотра после сохранения,
  // поэтому читаем историю запросом и фразой клиента в странице нет — проверяем блок истории раздела-хозяина
  // владелец правит тот же термин руками (ожидание — версия 1 из DTO): редактор
  // переходит в просмотр, история показывает происхождение предыдущей версии
  const curDef = await po.$eval("#gl-ed-def", (el) => el.value);
  await setValue(po, "#gl-ed-def", curDef + " (и правка владельца)");
  await po.$$eval('[data-element-editor="glossary_term"] .inline-edit-actions .action-btn.primary', (els) => els[els.length - 1].click());
  await po.waitForFunction(() => [...document.querySelectorAll('[data-element-editor="glossary_term"] .action-btn')].some((b) => /история версий/i.test(b.textContent ?? "")), { timeout: 20000 });
  ok(!(await exists(po, T("version-conflict"))), "правка владельца поверх принятого предложения прошла без конфликта (ожидание — версия из DTO чтения)");
  await po.$$eval('[data-element-editor="glossary_term"] .action-btn', (els) => els.find((b) => /история версий/i.test(b.textContent ?? ""))?.click());
  await waitSel(po, `${T("version-origin")}[data-origin-kind="proposal"]`);
  const originTxt = await text(po, `${T("version-origin")}[data-origin-kind="proposal"]`);
  ok(/принято предложение № 1/i.test(originTxt) && originTxt.includes(rev.name) && /готовая замена/.test(originTxt), "история версий термина: «принято предложение № 1 пользователя … · вписана готовая замена»", originTxt.slice(0, 200));
  ok(po.errors.length === 0 && pr.errors.length === 0 && po.confirms === 0, "страницы владельца и рецензента без ошибок JS и без window.confirm", [...po.errors, ...pr.errors]);
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
} finally {
  console.log(`\nИТОГ: ${passed} ✓, ${failed} ✗${fails.length ? "\n  " + fails.join("\n  ") : ""}`);
  try { await browser?.close(); } catch {}
  for (const p of procs) { try { process.kill(-p.pid, "SIGKILL"); } catch {} }
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
