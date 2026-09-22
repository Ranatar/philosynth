/**
 * Беседа 10.3 — тестовые запросы 2–9 (панель рекомендаций критики) в Chrome 131
 * на ЖИВОМ файле одностраничника (T103_FILE; без файла — пропуск).
 * Стенд: сервер :3000 + vite :5199 + мок Claude :3913 + PG/Redis; puppeteer-core
 * 23 (PUPPETEER_CORE), CHROME_PATH — как у test-92. Один прогон ≈ 3 мин, в фоне:
 *   T103_FILE=… node_modules/.bin/tsx tests/test-103-requests2-9.mjs [R2 …]
 *
 *  R2 вход — кнопка у раздела критики с числом ждущих решения у владельца
 *     (развилка — одна рекомендация, негодная не считается); у чужого
 *     зарегистрированного на 'full' и у гостя кнопки нет; GET чужому 403, гостю 401.
 *  R3 список — семь рекомендаций живого файла (восемь строк: развилка 5а/5б)
 *     с адресами «Раздел → «Подраздел»»; строка с готовой заменой — «правка ·
 *     бесплатно», остальные — «генерация»; «удалить» (5а) — «вручную», без выбора
 *     (долг §12); у рекомендации 1 показано расхождение «адрес — глоссарий, найдена
 *     категория» (долг §12); разворот — проза и основание; «выбрать все» нет.
 *  R4 развилка — выбор 5а снимает 5б и наоборот; оба одновременно невозможны
 *     (radio одной группы); оценка считает один шаг; сервер на оба — 400.
 *  R5 негодные — строка с несуществующим адресом в отдельной группе с причиной
 *     сторожа, без чекбокса; «Править таблицу рекомендаций вручную» открывает
 *     подраздел «Таблица рекомендаций» в правке по месту 9.2; починка адреса
 *     рукой → перечитка: строка годна, раунд тот же (ключ раунда — проза).
 *  R6 ретрофит — у концепции без таблицы панель предлагает составить её с ценой;
 *     после составления — список наполнен, подраздел появился в документе,
 *     стоимость обращения показана, число на кнопке обновилось.
 *  R7 оценка и передача — выбрать № 2 и № 4, у № 4 выбрать поле «обоснование» →
 *     «2 шага: 1 бесплатно, 1 платно» → «Собрать план» → панель закрывается,
 *     открыт EditModal с EditPlanPanel: шаг готовой замены (имя, «бесплатно»,
 *     № 2), шаг тезиса с полем «обоснование», перегенерация критики — каскадным
 *     pending-шагом; в БД field=justification, строки 2 и 4 — 'planned'.
 *  R8 раунд — заголовок называет номер; при идущем раунде разбор недоступен с
 *     объяснением, «Открыть план» возвращает в модалку; исполнение плана (только
 *     взятые шаги) → строка done, версия с origin; перегенерация критики (мок —
 *     вторая редакция прозы) → панель: раунд 2, прошлый раунд свёрнут
 *     «Раунд 1 · исполнено: 1», статусы не наследуются.
 *  R9 css-parity после блока 10.3: разделы A и B нулевые, классов беседы без
 *     правил нет, блок отдельный, без скруглений, теней и новых hex.
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import { parseHTML } from "linkedom";
import postgres from "postgres";

const FILE = process.env.T103_FILE;
if (!FILE || !existsSync(FILE)) { console.log("T103_FILE не задан или файла нет — ПРОПУСК"); process.exit(0); }
const ONLY = new Set(process.argv.slice(2));
const run = (name) => ONLY.size === 0 || ONLY.has(name);
const ROOT = new URL("../", import.meta.url).pathname;
const API = "http://127.0.0.1:3000/api/v1", UI = "http://127.0.0.1:5199", MOCK_PORT = 3913;
const CHROME = [process.env.CHROME_PATH, `${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`, "/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome"].find((p) => p && existsSync(p));
const sql = postgres(process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth");
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
const ok = (c, name, extra) => { if (c) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${extra !== undefined ? " — " + J(extra) : ""}`); } };
const T = (id) => `[data-testid="${id}"]`;

/* ── Таблицы рекомендаций мока ── */
const PROSE = "Рекомендации по улучшению", TABLE = "Таблица рекомендаций";
const HEAD = ["№", "Адрес", "Элемент", "Операция", "Готовая замена", "Основание", "Важность"];
const REPL2 = "конститутивное нарушение грамматики, произведённое в ответ на присутствие нередуцируемого содержания";
/** Семь рекомендаций живого файла (восемь строк: развилка) + негодная № 8. */
const ROWS = [
  ["1", "Таблица определений", "Самость-как-вмещение", "переопределить", "", "Верность методу синтеза", "существенная"],
  ["2", "Таблица категорий", "Индивидуация-как-практика", "уточнить формулировку", REPL2, "Верность методу синтеза", "существенная"],
  ["3", "Онтологические тезисы", "", "добавить", "", "Верность уровню синтеза", "существенная"],
  ["4", "Эпистемологические тезисы", "Э-3", "развить", "", "Слепые пятна", "существенная"],
  ["5а", "Таблица категорий", "Энантиодромия разлома", "удалить", "", "Верность методу синтеза", "блокирующая"],
  ["5б", "Таблица категорий", "Энантиодромия разлома", "переопределить", "", "Верность методу синтеза", "блокирующая"],
  ["6", "Новизна и ценность", "", "уточнить формулировку", "", "Сохранение ценных аспектов", "косметическая"],
  ["7", "Аналитический комментарий", "", "перегенерировать", "", "Разрешение противоречий", "косметическая"],
  ["8", "Несуществующий подраздел", "", "развить", "", "Слепые пятна", "косметическая"],
];
/** Для R4: оба варианта развилки выбираемы (в живом файле 5а — «удалить», вручную). */
const ROWS_FORK = ROWS.map((r) => (r[0] === "5а" ? ["5а", r[1], r[2], "развить", "", r[5], r[6]] : r));
const tableHtml = (rows) => `<table class="doc-table"><thead><tr>${HEAD.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const wrapped = (rows) => `<div data-section="${TABLE}"><h4>${TABLE}</h4>\n${tableHtml(rows)}\n</div>`;

/* ── Мок Claude: ретрофит → таблица; критика → раздел живого файла с таблицей и вариантом прозы ── */
const { document: liveDoc } = parseHTML(readFileSync(FILE, "utf8"));
const liveSections = [...liveDoc.querySelectorAll(".doc-section")].map((el) => {
  const names = [...el.querySelectorAll("[data-section]")].map((x) => x.getAttribute("data-section"));
  for (const junk of el.querySelectorAll('a[id^="subsec-"], a[id^="sec-"], .toc-back-btn, details.sec-disclosure')) junk.remove();
  return { names, html: el.outerHTML.replace(/<\/(p|div|table|ul|ol|h4|h5)>/g, "</$1>\n") };
}).filter((x) => x.names.length > 0);
const liveCritique = liveSections.find((s) => s.names.includes(PROSE));
function critiqueAnswer(variant, rows) {
  let html = liveCritique.html;
  if (variant === 2) html = html.replace("<strong>Рекомендация 1:", "<strong>Рекомендация 1 (вторая редакция):");
  const { document: d } = parseHTML(`<div id="r">${html}</div>`);
  const prose = [...d.querySelectorAll("[data-section]")].find((x) => x.getAttribute("data-section") === PROSE);
  prose.insertAdjacentHTML("afterend", "\n\n" + wrapped(rows) + "\n");
  return d.getElementById("r").innerHTML;
}
const mock = { rows: ROWS, critiqueVariant: 1, calls: 0, picked: [] };
const mockSrv = http.createServer((req, res) => {
  let body = ""; req.on("data", (d) => (body += d));
  req.on("end", () => {
    mock.calls++;
    let prompt = "";
    try { const j = JSON.parse(body); const c = j.messages?.[0]?.content; prompt = typeof c === "string" ? c : J(c); } catch {}
    let text;
    if (prompt.includes("ТОЧЕЧНАЯ ПРАВКА ОДНОГО ЭЛЕМЕНТА")) { mock.picked.push("refine"); text = "```\nОбоснование, развитое моделью по рекомендации критики.\n```"; }
    else if (prompt.includes("ПЕРЕЛОЖИТЬ в таблицу")) { mock.picked.push("extract"); text = wrapped(mock.rows); }
    else if (prompt.includes(`Столбцы СТРОГО: ${HEAD.join(" | ")}`)) { mock.picked.push("critique"); text = critiqueAnswer(mock.critiqueVariant, mock.rows); }
    else { mock.picked.push("?"); text = "<p>Раздел не узнан моком.</p>"; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (o) => res.write(`data: ${J(o)}\n\n`);
    send({ type: "message_start", message: { usage: { input_tokens: 1000 } } });
    for (let i = 0; i < text.length; i += 2000) send({ type: "content_block_delta", delta: { type: "text_delta", text: text.slice(i, i + 2000) } });
    send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2000 } });
    send({ type: "message_stop" }); res.end();
  });
});
await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));

/* ── Стенд и помощники ── */
const kids = [];
const sp = (args, cwd, env) => { const k = spawn(process.execPath, args, { cwd, detached: true, stdio: "ignore", env: { ...process.env, ...env } }); kids.push(k); return k; };
const waitUp = async (url) => { for (let i = 0; i < 120; i++) { try { if ((await fetch(url)).status < 500) return; } catch {} await sleep(500); } throw new Error("не поднялся " + url); };
async function account(tag) {
  const email = `t103-${tag}-${Date.now()}@example.com`;
  const h = { "Content-Type": "application/json" };
  await fetch(`${API}/auth/register`, { method: "POST", headers: h, body: J({ email, password: "password-103" }) });
  const lr = await fetch(`${API}/auth/login`, { method: "POST", headers: h, body: J({ email, password: "password-103" }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const api = async (method, path, body) => {
    const headers = { Cookie: cookie }; let payload;
    if (body instanceof FormData) payload = body; else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
    const r = await fetch(API + path, { method, headers, body: payload });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  const [u] = await sql`select id from users where email=${email}`;
  return { email, cookie, api, id: u.id };
}
const ids = [];
async function importLive(user) {
  const fd = new FormData(); fd.append("file", new Blob([readFileSync(FILE, "utf8")], { type: "text/html" }), "live.html");
  const imp = await user.api("POST", "/syntheses/import", fd);
  if (imp.status !== 200 && imp.status !== 201) throw new Error("импорт: " + J(imp));
  ids.push(imp.json.id); return imp.json.id;
}
/** Концепция с таблицей рекомендаций (ретрофит через API). */
async function withTable(user, rows = ROWS) {
  const id = await importLive(user);
  mock.rows = rows;
  const ex = await user.api("POST", `/syntheses/${id}/recommendations/extract`);
  if (ex.status !== 200) throw new Error("ретрофит: " + J(ex));
  return id;
}
let browser;
async function pageAs(ctx, user) {
  const page = await ctx.newPage(); await page.setViewport({ width: 1280, height: 900 });
  page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e)));
  if (user) { const [cn, cv] = user.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  return page;
}
const text = (page, sel) => page.$eval(sel, (el) => el.textContent ?? "");
const click = (page, sel) => page.$eval(sel, (el) => el.click());
const gone = (page, sel, ms = 20000) => page.waitForFunction((s) => !document.querySelector(s), { timeout: ms }, sel);
const item = (num) => `${T("rec-item")}[data-rec-num="${num}"]`;
const pick = (page, num) => page.$eval(`${item(num)} ${T("rec-pick")}`, (el) => el.click());
const picked = (page, num) => page.$eval(`${item(num)} ${T("rec-pick")}`, (el) => ({ checked: el.checked, disabled: el.disabled, type: el.type, name: el.name }));
const noSelectAll = (page, scope) => page.evaluate((s) => ![...document.querySelectorAll(`${s} button, ${s} label, ${s} summary`)].some((b) => /выбрать вс|исполнить вс|отметить вс/i.test(b.textContent ?? "")), scope);
async function openPanel(page, id) {
  await page.goto(`${UI}/synthesis/${id}`, { waitUntil: "networkidle0" });
  await page.waitForSelector(T("recommendations-btn"), { timeout: 20000 });
  await click(page, T("recommendations-btn"));
  await page.waitForSelector(T("rec-panel"), { timeout: 20000 });
}
const waitPlan = async (planId, pred, ms = 40000) => { const t0 = Date.now(); for (;;) { const [p] = await sql`select * from edit_plans where id=${planId}`; if (p && pred(p)) return p; if (Date.now() - t0 > ms) throw new Error("план не дождался: " + J(p && { status: p.status })); await sleep(300); } };

try {
  if (!CHROME) throw new Error("Chrome 131 не найден — CHROME_PATH");
  try { if ((await fetch(`${API}/health`)).ok) throw new Error("на :3000 чужой сервер — сироты: ps aux | grep 'tsx.*[i]ndex'"); } catch (e) { if (/чужой/.test(String(e.message))) throw e; }
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: "3000", CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-103", STREAM_RETRY_DELAYS: "50" });
  sp([ROOT + "node_modules/vite/bin/vite.js", "--port", "5199", "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {});
  await waitUp(`${API}/health`); await waitUp(UI);
  let puppeteer;
  try { puppeteer = (await import("puppeteer-core")).default; }
  catch { const dir = process.env.PUPPETEER_CORE ?? [`${homedir()}/.npm-global`, "/home/claude/.npm-global"].map((p) => `${p}/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer-core`).find((p) => existsSync(p)); puppeteer = (await import(`${dir}/lib/esm/puppeteer/puppeteer-core.js`)).default; }
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  console.log(`  (браузер: ${await browser.version()})`);
  const owner = await account("owner");
  const other = await account("other");
  const page = await pageAs(browser.defaultBrowserContext(), owner);

  /* ═══ R2. Вход ═══ */
  if (run("R2")) {
    console.log("\n■ R2 — вход: кнопка у раздела критики");
    const id = await importLive(owner);
    const pub = await owner.api("PATCH", `/syntheses/${id}`, { visibility: "full" });
    ok(pub.status === 200, "концепция переведена в 'full'", pub.status);
    await page.goto(`${UI}/synthesis/${id}`, { waitUntil: "networkidle0" });
    await page.waitForSelector(T("recommendations-btn"), { timeout: 20000 });
    const btnHost = await page.$eval(T("recommendations-btn"), (el) => { const body = el.closest(".doc-body"); return (body?.querySelector("a[id^=sec-]")?.id ?? "") + " " + (body?.querySelector(".section-title")?.textContent ?? ""); });
    ok(/sec-critique/.test(btnHost) && /критическ/i.test(btnHost), "кнопка стоит у раздела «Критический анализ»", btnHost);
    ok((await page.$$(T("recommendations-btn"))).length === 1, "кнопка одна — у прочих разделов её нет");
    const before = await text(page, T("recommendations-btn"));
    ok(/рекомендации/i.test(before) && !/·\s*\d/.test(before), "до разбора подпись без числа", before);
    mock.rows = ROWS;
    const ex = await owner.api("POST", `/syntheses/${id}/recommendations/extract`);
    ok(ex.status === 200 && ex.json.rows.length === ROWS.length, "ретрофит по API: девять строк", ex.status);
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction((s) => /·\s*\d+/.test(document.querySelector(s)?.textContent ?? ""), { timeout: 20000 }, T("recommendations-btn"));
    ok(/·\s*7\b/.test(await text(page, T("recommendations-btn"))), "число ждущих решения — 7 (развилка — одна, негодная не считается)", await text(page, T("recommendations-btn")));
    const plan = await owner.api("POST", `/syntheses/${id}/recommendations/plan`, { nums: ["2"] });
    ok(plan.status === 200, "план из № 2 поставлен через API", plan.status);
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction((s) => /·\s*6\b/.test(document.querySelector(s)?.textContent ?? ""), { timeout: 20000 }, T("recommendations-btn"));
    ok(true, "после постановки № 2 в план — 6");
    await owner.api("DELETE", `/syntheses/${id}/plans/${plan.json.plan.id}`);
    ok(page.errors.length === 0, "ошибок страницы у владельца нет", page.errors);

    const ctxB = await browser.createBrowserContext();
    const pageB = await pageAs(ctxB, other);
    await pageB.goto(`${UI}/synthesis/${id}`, { waitUntil: "networkidle0" });
    await pageB.waitForSelector(".doc-section", { timeout: 20000 });
    ok((await pageB.$$(".doc-section")).length > 5, "чужому на 'full' документ виден");
    ok((await pageB.$(T("recommendations-btn"))) === null, "у чужой концепции кнопки «Рекомендации» нет");
    ok((await other.api("GET", `/syntheses/${id}/recommendations`)).status === 403, "GET рекомендаций чужому — 403");
    ok(pageB.errors.length === 0, "ошибок страницы у чужого нет", pageB.errors);
    await ctxB.close();
    const ctxG = await browser.createBrowserContext();
    const pageG = await pageAs(ctxG, null);
    await pageG.goto(`${UI}/synthesis/${id}`, { waitUntil: "networkidle0" });
    await pageG.waitForSelector(".doc-section", { timeout: 20000 });
    ok((await pageG.$(T("recommendations-btn"))) === null, "у гостя кнопки «Рекомендации» нет");
    ok((await fetch(`${API}/syntheses/${id}/recommendations`)).status === 401, "GET рекомендаций гостю — 401");
    await ctxG.close();
    await owner.api("PATCH", `/syntheses/${id}`, { visibility: "showcase" });
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector(T("recommendations-btn"), { timeout: 20000 });
    ok(true, "у владельца кнопка есть при любой ступени (витрина)");
  }

  /* ═══ R3. Список ═══ */
  if (run("R3")) {
    console.log("\n■ R3 — список рекомендаций живой концепции");
    const id = await withTable(owner);
    await openPanel(page, id);
    await page.waitForSelector(T("rec-item"), { timeout: 20000 });
    const items = await page.$$eval(T("rec-item"), (els) => els.map((e) => e.getAttribute("data-rec-num")));
    ok(J(items) === J(["1", "2", "3", "4", "5а", "5б", "6", "7"]), "семь рекомендаций, восемь строк с развилкой, в порядке таблицы", items);
    const rows = await page.$$eval(T("rec-row"), (els) => els.map((e) => ({ num: e.getAttribute("data-rec-num"), cost: e.getAttribute("data-rec-cost"), addr: e.querySelector('[data-testid="rec-address"]')?.textContent ?? "" })));
    ok(rows.every((r) => /→ «.+»/.test(r.addr)), "у каждой строки адрес «Раздел → «Подраздел»»", rows.map((r) => r.addr));
    ok(rows.find((r) => r.num === "1")?.addr.includes("Таблица определений") && rows.find((r) => r.num === "7")?.addr.includes("Аналитический комментарий"), "адреса — из таблицы");
    ok(rows.find((r) => r.num === "2")?.cost === "free", "строка с готовой заменой (№ 2) — «правка · бесплатно»");
    ok(rows.filter((r) => !["2", "5а"].includes(r.num)).every((r) => r.cost === "paid"), "остальные — «генерация»", rows);
    ok(rows.find((r) => r.num === "5а")?.cost === "manual" && (await picked(page, "5а")).disabled, "5а «удалить» — «вручную», выбор недоступен (долг §12)");
    const cost2 = await text(page, `${item("2")} ${T("rec-cost")}`);
    ok(/правка/i.test(cost2) && /бесплатно/i.test(cost2), "подпись пометки читается: «правка · бесплатно»", cost2);
    ok((await page.$$(`${item("1")} ${T("rec-kind-mismatch")}`)).length === 1 && /глоссар/i.test(await text(page, `${item("1")} ${T("rec-kind-mismatch")}`)), "у № 1 показано расхождение: адрес — глоссарий, найдена категория (долг §12)");
    ok((await text(page, `${item("1")} ${T("rec-element-kind")}`)).trim() === "категория", "вид найденного элемента рядом с адресом — «категория»");
    ok((await text(page, `${item("4")} ${T("rec-element-kind")}`)).trim() === "тезис", "у № 4 — «тезис»");
    const sev = await page.$$eval(T("rec-severity"), (els) => els.map((e) => e.textContent.trim().toLowerCase()));
    ok(sev[0] === "существенная" && sev[4] === "блокирующая" && sev[6] === "косметическая", "важность у каждой рекомендации", sev);
    await click(page, `${item("2")} ${T("rec-toggle")}`);
    await page.waitForSelector(`${item("2")} ${T("rec-prose")}`);
    ok(/рекомендация 2/i.test(await text(page, `${item("2")} ${T("rec-prose")}`)), "разворот — проза рекомендации из документа");
    ok(/верность методу синтеза/i.test(await text(page, `${item("2")} ${T("rec-rationale")}`)), "и основание — подраздел критики");
    ok((await text(page, `${item("2")} ${T("rec-replacement")}`)).includes(REPL2), "готовая замена показана дословно");
    ok((await page.$$(T("rec-invalid-row"))).length === 1, "негодная строка в списке не участвует — отдельная группа (R5)");
    ok(await noSelectAll(page, T("rec-panel")), "«выбрать все» / «исполнить все» в панели нет");
    ok(/раунд 1/i.test(await text(page, T("rec-title"))), "заголовок — раунд 1");
    ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
  }

  /* ═══ R4. Развилка ═══ */
  if (run("R4")) {
    console.log("\n■ R4 — развилка");
    const id = await withTable(owner, ROWS_FORK);
    await openPanel(page, id);
    await page.waitForSelector(T("rec-fork"), { timeout: 20000 });
    const forkText = await text(page, T("rec-fork"));
    ok(/развилка/i.test(forkText) && /не более одного/i.test(forkText), "пара показана с объяснением: выбрать не более одного");
    const a0 = await picked(page, "5а"), b0 = await picked(page, "5б");
    ok(a0.type === "radio" && b0.type === "radio" && a0.name === b0.name && a0.name !== "", "варианты — radio одной группы");
    await pick(page, "5а");
    ok((await picked(page, "5а")).checked && !(await picked(page, "5б")).checked, "выбор 5а — 5б не выбран");
    ok(/1 шаг/.test(await text(page, T("rec-estimate"))), "оценка — один шаг", await text(page, T("rec-estimate")));
    await pick(page, "5б");
    ok(!(await picked(page, "5а")).checked && (await picked(page, "5б")).checked, "выбор 5б снимает 5а");
    ok(/1 шаг/.test(await text(page, T("rec-estimate"))), "оценка по-прежнему один шаг — оба выбрать невозможно");
    await pick(page, "5б");
    ok(!(await picked(page, "5б")).checked && /ничего не выбрано/i.test(await text(page, T("rec-estimate"))), "повторный клик снимает вариант");
    ok(await page.$eval(T("rec-build-plan"), (el) => el.disabled), "без выбора «Собрать план» недоступна");
    const both = await owner.api("POST", `/syntheses/${id}/recommendations/plan`, { nums: ["5а", "5б"] });
    ok(both.status === 400 && /вариант/i.test(both.json.error), "сервер на оба варианта отвечает 400 (панель до этого не доводит)", both.status);
    ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
  }

  /* ═══ R5. Негодные + правка таблицы вручную ═══ */
  if (run("R5")) {
    console.log("\n■ R5 — негодные строки и правка таблицы вручную");
    const id = await withTable(owner);
    await openPanel(page, id);
    await page.waitForSelector(T("rec-invalid"), { timeout: 20000 });
    ok((await page.$$(T("rec-invalid-row"))).length === 1 && (await page.$eval(T("rec-invalid-row"), (el) => el.getAttribute("data-rec-num"))) === "8", "строка № 8 (несуществующий адрес) — в отдельной группе");
    const invalidBelow = await page.evaluate((a, b) => { const x = document.querySelector(a), y = document.querySelector(b); return !!(x && y && (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_PRECEDING)); }, T("rec-invalid"), item("7"));
    ok(invalidBelow, "группа негодных стоит ПОСЛЕ рекомендаций (внизу)");
    const reason = await text(page, T("rec-invalid-reason"));
    ok(/несуществующий подраздел|не найден|нет в документе|нет такого/i.test(reason), "причина от сторожа названа", reason);
    ok((await page.$(`${T("rec-invalid")} input`)) === null, "выбора у негодной строки нет");
    ok(/негодн/i.test(await text(page, T("rec-invalid"))) && /в план не берутся/i.test(await text(page, T("rec-invalid"))), "группа подписана: в план не берутся");
    await click(page, T("rec-edit-table"));
    await gone(page, T("rec-panel"));
    await page.waitForSelector("textarea[data-subsection-source]", { timeout: 20000 });
    const src = await page.$eval("textarea[data-subsection-source]", (el) => el.value);
    ok(/<table class="doc-table">/.test(src) && src.includes("Несуществующий подраздел"), "открыта правка по месту подраздела «Таблица рекомендаций» с разметкой таблицы");
    const host = await page.$eval("textarea[data-subsection-source]", (el) => el.closest("[data-section]")?.getAttribute("data-section") ?? "");
    ok(host === TABLE, "поле стоит на месте подраздела «Таблица рекомендаций» (замка нет)", host);
    ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
    const fixed = src.replace("Несуществующий подраздел", "Новизна и ценность");
    await page.$eval("textarea[data-subsection-source]", (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }, fixed);
    await page.focus("textarea[data-subsection-source]");
    await page.keyboard.down("Control"); await page.keyboard.press("Enter"); await page.keyboard.up("Control");
    await page.waitForFunction(() => !document.querySelector("textarea[data-subsection-source]"), { timeout: 20000 });
    const [sec] = await sql`select html_content from sections where synthesis_id=${id} and key='critique'`;
    ok(!sec.html_content.includes("Несуществующий подраздел") && sec.html_content.includes("Новизна и ценность"), "починка адреса сохранена в документе (9.2)");
    await click(page, T("recommendations-btn"));
    await page.waitForSelector(T("rec-item"), { timeout: 20000 });
    ok((await page.$(T("rec-invalid"))) === null, "после починки адреса вручную негодных нет");
    ok(/раунд 1/i.test(await text(page, T("rec-title"))), "раунд остался первым — ручная починка таблицы раунд не открывает");
    ok((await page.$$(T("rec-item"))).length === 9, "№ 8 встала в список годных");
    await click(page, ".edit-modal .raw-close");
    await gone(page, T("rec-panel"));
  }

  /* ═══ R6. Ретрофит ═══ */
  if (run("R6")) {
    console.log("\n■ R6 — ретрофит");
    const id = await importLive(owner);
    mock.rows = ROWS;
    const noTable = await owner.api("GET", `/syntheses/${id}/sections/critique`);
    ok(!noTable.json.section.subsections.includes(TABLE), "у живого файла подраздела «Таблица рекомендаций» нет");
    await openPanel(page, id);
    await page.waitForSelector(T("rec-retrofit"), { timeout: 20000 });
    ok((await page.$(T("rec-item"))) === null && (await page.$(T("rec-empty"))) === null, "панель не пуста и не показывает пустой список");
    ok(/составить таблицу по имеющимся рекомендациям/i.test(await text(page, T("rec-retrofit-run"))), "предложение составить таблицу по имеющимся рекомендациям");
    const costText = await text(page, T("rec-retrofit-cost"));
    ok(/одно обращение к модели/i.test(costText) && /квот|баланс/i.test(costText), "цена: одно обращение к модели, квота либо баланс");
    const calls0 = mock.calls;
    await click(page, T("rec-retrofit-run"));
    await page.waitForSelector(T("rec-item"), { timeout: 60000 });
    ok(mock.calls === calls0 + 1 && mock.picked.at(-1) === "extract", "одно обращение к модели — ретрофит");
    ok((await page.$$(T("rec-item"))).length === 8, "список наполнился: восемь строк-рекомендаций");
    const note = await text(page, T("rec-note"));
    ok(/таблица составлена/i.test(note) && /\$\d/.test(note), "показана стоимость обращения", note);
    ok((await page.$(T("rec-retrofit"))) === null, "предложения ретрофита больше нет");
    const withT = await owner.api("GET", `/syntheses/${id}/sections/critique`);
    ok(withT.json.section.subsections.includes(TABLE), "подраздел появился в документе");
    await click(page, ".edit-modal .raw-close");
    await gone(page, T("rec-panel"));
    ok((await page.$$(`[data-section="${TABLE}"]`)).length === 1, "и виден на странице после перечитки разделов");
    ok(/·\s*7\b/.test(await text(page, T("recommendations-btn"))), "число на кнопке обновилось — 7", await text(page, T("recommendations-btn")));
    ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
  }

  /* ═══ R7. Оценка и передача плана ═══ */
  let r7 = null;
  if (run("R7") || run("R8")) {
    console.log("\n■ R7 — оценка и передача CascadePanel/EditModal");
    const id = await withTable(owner);
    await openPanel(page, id);
    await page.waitForSelector(T("rec-item"), { timeout: 20000 });
    ok(/ничего не выбрано/i.test(await text(page, T("rec-estimate"))), "до выбора — «Ничего не выбрано»");
    await pick(page, "2");
    ok(/1 шаг: 1 бесплатно, 0 платно/.test(await text(page, T("rec-estimate"))), "№ 2 → «1 бесплатно, 0 платно»", await text(page, T("rec-estimate")));
    await click(page, `${item("4")} ${T("rec-toggle")}`);
    await page.waitForSelector(`${item("4")} ${T("rec-field")} select`);
    const opts = await page.$$eval(`${item("4")} ${T("rec-field")} option`, (els) => els.map((o) => o.value));
    ok(J(opts) === J(["formulation", "justification"]), "у тезиса выбор поля: формулировка / обоснование (долг §12)", opts);
    await page.select(`${item("4")} ${T("rec-field")} select`, "justification");
    await pick(page, "4");
    ok(/2 шага: 1 бесплатно, 1 платно/.test(await text(page, T("rec-estimate"))), "№ 2 + № 4 → «1 бесплатно, 1 платно» — числом", await text(page, T("rec-estimate")));
    ok(/каскадн/i.test(await text(page, T("rec-panel"))), "оговорка: каскадные шаги добавит план");
    await click(page, T("rec-build-plan"));
    await page.waitForSelector(T("plan-step"), { timeout: 30000 });
    ok((await page.$(T("rec-panel"))) === null, "панель рекомендаций закрылась — второй панели плана нет");
    ok(/редактирование разделов/i.test(await text(page, ".edit-modal-title")), "открыта модалка правок 2.3");
    const steps = await page.$$eval(T("plan-step"), (els) => els.map((e) => ({ type: e.getAttribute("data-step-type"), text: e.textContent ?? "" })));
    ok(steps.some((s) => s.type === "edit_element" && /индивидуация-как-практика/i.test(s.text) && /бесплатно/i.test(s.text) && /№ 2/.test(s.text)), "шаг готовой замены: имя элемента, «бесплатно», № рекомендации", steps.map((s) => s.text.slice(0, 80)));
    ok(steps.some((s) => s.type === "refine_element" && /обоснование/i.test(s.text) && /№ 4/.test(s.text)), "шаг тезиса правит ОБОСНОВАНИЕ — поле выбрал человек");
    const critStep = steps.find((s) => s.type === "regen" && /критическ/i.test(s.text));
    ok(critStep && /каскад/i.test(critStep.text), "перегенерация критики — каскадным шагом");
    ok(steps.some((s) => s.type === "regen" && /каскад/i.test(s.text) && /подтвердить/i.test(s.text)), "каскадные шаги ждут решения человека (подтвердить / пропустить)");
    const footer = await text(page, ".edit-modal-footer");
    ok(/1 бесплатно · 1 платно/.test(footer) && /каскадных ждут решения/.test(footer), "футер модалки: взятое — «1 бесплатно · 1 платно», каскадные отдельно", footer);
    const [planRow] = await sql`select * from edit_plans where synthesis_id=${id} order by created_at desc limit 1`;
    ok(planRow.steps.find((s) => s.type === "refine_element")?.field === "justification", "в БД у шага field = justification");
    ok(planRow.steps.find((s) => s.type === "edit_element")?.value === REPL2, "в БД у шага готовая замена дословно");
    const planned = await sql`select num from recommendations where synthesis_id=${id} and status='planned' order by position`;
    ok(J(planned.map((r) => r.num)) === J(["2", "4"]), "строки 2 и 4 — 'planned'", planned);
    ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
    r7 = { id, planId: planRow.id };
  }

  /* ═══ R8. Раунд ═══ */
  if (run("R8") && r7) {
    console.log("\n■ R8 — раунд");
    const { id, planId } = r7;
    await click(page, ".edit-modal .raw-close");
    await gone(page, ".edit-modal");
    await page.waitForFunction((s) => /·\s*5\b/.test(document.querySelector(s)?.textContent ?? ""), { timeout: 20000 }, T("recommendations-btn"));
    ok(true, "число на кнопке после постановки двух в план — 5");
    await click(page, T("recommendations-btn"));
    await page.waitForSelector(T("rec-round-in-work"), { timeout: 20000 });
    ok(/раунд 1/i.test(await text(page, T("rec-title"))), "заголовок называет раунд 1");
    const work = await text(page, T("rec-round-in-work"));
    ok(/раунд 1 в работе/i.test(work) && /№ 2, № 4/.test(work), "врезка «раунд в работе» с номерами в плане", work.slice(0, 120));
    ok((await page.$eval(T("rec-reparse"), (el) => el.disabled)) && /раунд в работе/i.test(await page.$eval(T("rec-reparse"), (el) => el.title)), "разбор недоступен с объяснением");
    ok((await page.$eval(T("rec-build-plan"), (el) => el.disabled)) && (await page.$$eval(T("rec-pick"), (els) => els.every((e) => e.disabled))), "новый выбор заблокирован");
    const inProse = await owner.api("POST", `/syntheses/${id}/recommendations/parse`);
    ok(inProse.status === 200 && inProse.json.newRound === false, "перечитка ТОГО ЖЕ текста по API проходит (раунд прежний)");
    await click(page, T("rec-open-plan"));
    await page.waitForSelector(T("plan-step"), { timeout: 20000 });
    ok((await page.$(T("rec-panel"))) === null && (await page.$$(T("plan-step"))).length >= 3, "«Открыть план» возвращает в модалку правок с этим планом");
    await click(page, ".edit-modal-footer .edit-sec-btn.primary");
    const done = await waitPlan(planId, (p) => p.status === "done" || p.status === "failed", 90000);
    ok(done.status === "done", "план исполнен", done.status);
    ok(done.steps.find((s) => s.type === "edit_element")?.status === "done", "шаг готовой замены — done");
    const [cat] = await sql`select id, definition from categories where synthesis_id=${id} and name='Индивидуация-как-практика'`;
    ok(cat?.definition === REPL2, "определение категории — готовая замена");
    const st = await sql`select num, status from recommendations where synthesis_id=${id} and num in ('2','4') order by num`;
    ok(st.find((r) => r.num === "2")?.status === "done", "строка № 2 — 'done'", st);
    const [ver] = await sql`select origin, change_source from element_versions where synthesis_id=${id} and element_type='category' order by created_at desc limit 1`;
    ok(ver?.change_source === "recommendation" && ver.origin?.num === "2" && ver.origin?.round === 1, "версия — 'recommendation' с origin (№ 2, раунд 1)");
    await sleep(800); // статус done пишется ДО освобождения слота («По факту 10.2» п.15)
    await click(page, ".edit-modal .raw-close");
    await gone(page, ".edit-modal");
    await click(page, T("recommendations-btn"));
    await page.waitForSelector(T("rec-done"), { timeout: 20000 });
    const doneSummary = await text(page, `${T("rec-done")} summary`);
    ok(/раунд 1 · исполнено: 2/i.test(doneSummary) && !(await page.$eval(T("rec-done"), (el) => el.open)), "исполненные (оба взятых шага) — свёрнутым списком с номером раунда", doneSummary);
    ok(mock.picked.includes("refine") && st.find((r) => r.num === "4")?.status === "done", "точечная правка тезиса исполнена моделью — строка № 4 'done'");
    ok(/·\s*5\b/.test(await text(page, T("recommendations-btn"))), "число на кнопке — 5 (исполненные не считаются)");
    await click(page, ".edit-modal .raw-close");
    await gone(page, T("rec-panel"));
    mock.critiqueVariant = 2; mock.rows = ROWS;
    const rg = await owner.api("POST", `/syntheses/${id}/regenerate/critique`, {});
    ok(rg.status === 200, "перегенерация критики запущена", rg.json);
    for (let i = 0; i < 200; i++) { const cr = await owner.api("GET", `/syntheses/${id}/sections/critique`); if (cr.json?.section?.htmlContent.includes("вторая редакция")) break; await sleep(250); }
    await sleep(1000);
    await page.reload({ waitUntil: "networkidle0" });
    await click(page, T("recommendations-btn"));
    await page.waitForFunction((s) => /раунд 2/i.test(document.querySelector(s)?.textContent ?? ""), { timeout: 30000 }, T("rec-title"));
    ok(true, "после перегенерации критики панель открыла раунд 2");
    await page.waitForSelector(T("rec-past-round"), { timeout: 20000 });
    const pastSummary = await text(page, `${T("rec-past-round")} summary`);
    ok((await page.$eval(T("rec-past-round"), (el) => el.getAttribute("data-rec-round"))) === "1" && /раунд 1 · исполнено: 2/i.test(pastSummary), "прошлый раунд свёрнут: «Раунд 1 · исполнено: 2»", pastSummary);
    // НАХОДКА (сервер, 5.1 ↔ 10.1; здесь не чинится — «По факту 10.3»): правка
    // тезиса перерисовывает сводную таблицу тезисов из БД, где thesis_num —
    // целое; буквенные метки живого файла («Э-3») в таблице пропадают, сторож
    // 10.1 берёт метки из неё — рекомендация к «Э-3» в новом раунде негодна.
    const [thHtml] = await sql`select html_content from sections where synthesis_id=${id} and key='theses'`;
    const labels = (thHtml.html_content.match(/<td>\s*([ОЭ]-?\d+|\d+)\s*<\/td>/g) ?? []).slice(0, 3);
    ok(labels.every((l) => /<td>\s*\d+\s*<\/td>/.test(l)), "НАХОДКА: после правки тезиса метки сводной таблицы — целые (буквенные метки живого файла потеряны рендерером 5.1)", labels);
    const r2rows = await sql`select num, status, invalid_reason from recommendations where synthesis_id=${id} and round=2 order by position`;
    ok(r2rows.find((r) => r.num === "4")?.status === "invalid" && /Э-3/.test(r2rows.find((r) => r.num === "4")?.invalid_reason ?? ""), "…и рекомендация к «Э-3» в раунде 2 негодна — сторож не нашёл элемент (следствие находки)");
    const r2items = await page.$$eval(T("rec-item"), (els) => els.map((e) => e.getAttribute("data-rec-num") + ":" + (e.querySelector('[data-testid="rec-pick"]')?.disabled ? "x" : "o")));
    ok(r2items.length === 7 && r2items.filter((x) => x.endsWith(":o")).length === 6 && r2rows.filter((r) => r.status === "new").length === 7, "новый раунд — прочие строки снова ждут решения (статусы не наследуются)", r2items);
    ok((await page.$$(T("rec-invalid-row"))).length === 2, "негодных в раунде 2 две: № 8 (адрес) и № 4 (находка)");
    ok((await page.$(T("rec-done"))) === null, "исполненных в раунде 2 нет — они в прошлом раунде");
    ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
    await click(page, ".edit-modal .raw-close");
    await gone(page, T("rec-panel"));
    const vers = await owner.api("GET", `/syntheses/${id}/elements/category/${cat.id}/versions`);
    ok(vers.json.versions[0]?.origin?.kind === "recommendation", "GET versions отдаёт origin — VersionHistory рисует «почему»");
  }

  /* ═══ R9. css-parity ═══ */
  if (run("R9")) {
    console.log("\n■ R9 — css-parity");
    const out = execFileSync("python3", ["scripts/checks/css-parity-audit.py"], { cwd: ROOT, encoding: "utf8" });
    ok(/итого правил с расхождениями: 0/.test(out), "раздел B — 0 расхождений");
    ok(/непокрытых правил 0 из/.test(out), "раздел A — 0 непокрытых");
    const noRules = out.split("═══ C.")[1]?.split("═══ D.")[0] ?? "";
    ok(!/\brec-|plan-step-|version-origin/.test(noRules), "классов беседы 10.3 без правил нет", noRules.trim().split("\n").slice(0, 4));
    ok(/совпадает с блоком <style> исходника/.test(out), "раздел D — CSS экспорта побайтно прежний");
    const css = readFileSync(ROOT + "client/src/globals.css", "utf8");
    const block = css.split("Беседа 10.3")[1]?.split("Утилиты Tailwind")[0] ?? "";
    const hexes = [...new Set((block.match(/#[0-9a-f]{3,6}\b/gi) ?? []).map((h) => h.toLowerCase()))];
    ok(block.length > 1000 && hexes.every((h) => ["#f0fff4", "#fffbee", "#fff5f5"].includes(h)), "блок 10.3 отдельный, новых hex нет (только фоны исходника)", hexes);
    ok(!/border-radius|box-shadow/.test(block), "скруглений и теней нет");
  }
} catch (e) { failed++; console.log("СБОЙ:", e?.stack ?? e); }

console.log(`\nИТОГ test-103: ${passed} ✓ / ${failed} ✗`);
try { await Promise.race([browser?.close(), sleep(3000)]); } catch {}
for (const k of kids) { try { process.kill(-k.pid, "SIGKILL"); } catch {} }
mockSrv.closeAllConnections?.(); mockSrv.close();
try { for (const id of ids) await sql`delete from syntheses where id=${id}`; } catch {}
await Promise.race([sql.end(), sleep(2000)]);
process.exit(failed ? 1 : 0);
