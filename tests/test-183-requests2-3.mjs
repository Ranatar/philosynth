/**
 * Беседа 18.3 — тестовые запросы 2–3 одним заходом (похожие концепции).
 *
 *  R2 (07): «Протестируй живьём: две концепции с общими философами на
 *      разных языках — похожи по философам, термины не сравниваются; две на
 *      одном языке с общими терминами — термины в причинах; приватная чужая
 *      не появляется; витрина — без терминов в причинах».
 *      Живой сервер :3000, всё по HTTP, как клиент: регистрация, импорт,
 *      приглашения, смена ступени, удаление термина, запрос похожих.
 *  R3 (07): «Протестируй в браузере (Chrome 131, сборка клиента): блок на
 *      странице концепции, причины, переход; у концепции без соседей —
 *      понятное пустое состояние». Клиент — vite build + preview.
 *
 * Документы: живой импорт файла-образца sample/*.html (русский мета-синтез
 * с деревом файла: «Юнг» и концепция-предок с вложенными философами) и его
 * вариантов — русского (другое название, один термин и одна категория
 * переименованы) и английского (язык генерации English; термины ОСТАЮТСЯ
 * русскими строками — проверка, что через границу языков не сравниваются
 * и одинаковые строки). Концепции без документа (SQL) — для чистых случаев
 * философов и предка со строкой в БД.
 *
 *  R2.1 общий обход на живом импорте (Д-88): философ вложенного узла файла
 *       находит концепцию и /lineage/search, и фильтром поиска;
 *  R2.2 один язык, общие термины: термины и категории в причинах, именами
 *       исходной; переименованные — не общие; общие предки-снимки файла;
 *  R2.3 разные языки, общие философы: похожи по философам и предкам,
 *       термины не сравниваются, хотя строки те же; порядок — сравнённое
 *       выше несравненного;
 *  R2.4 чужая приватная не появляется; участник её видит, приглашённый —
 *       нет; гость — только публичное; чужая приватная исходная — 403;
 *  R2.5 витрина: кандидатом — без терминов в причинах; исходной — её
 *       термины не сравниваются ни с кем; владельцу витрины — сравниваются;
 *  R2.6 мера на запрос: удаление термина, смена ступени и языка видны
 *       следующим же запросом; в БД ничего не записано;
 *  R2.7 форма ответа: мера словами, числа нет; limit; предок со строкой в
 *       БД — со ссылкой, невидимый — только счёт; без соседей — пусто.
 *  R3.1 блок на странице концепции, порядок, слова меры, причины;
 *  R3.2 иноязычная и витрина — строка «не сравнивались» с причиной;
 *  R3.3 переходы: к концепции (блок перечитан), философ → каталог с
 *       фильтром родословной, эпоха → каталог, предок → его потомки;
 *  R3.4 без соседей — пустое состояние; витрина-исходная — пометка;
 *  R3.5 гость: блок, только публичное, ссылки на /explore и переход по ним;
 *  R3.6 язык интерфейса en и de — без русских подписей; узкое окно.
 *
 * Запуск (≈ 2 мин; из корня; PG/Redis подняты, порты 3000 и 5284 свободны):
 *   node_modules/.bin/tsx tests/test-183-requests2-3.mjs [R2 R3]
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import postgres from "postgres";

const ONLY = process.argv.slice(2);
const want = (r) => ONLY.length === 0 || ONLY.includes(r);
const ROOT = new URL("../", import.meta.url).pathname;
const FILE = ROOT + "sample/" + readdirSync(ROOT + "sample").find((f) => f.endsWith(".html"));
const PORT = 3000, UI_PORT = 5284;
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
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 1400) : ""}`); }
}
const TAG = Math.random().toString(36).slice(2, 7).replace(/[0-9]/g, "x");
const PW = "password-183";

const { SIMILARITY_GRADES, SIMILAR_LIMIT_MAX, SIMILAR_REASON_ITEMS_MAX } = await import("@philosynth/shared/constants/similarity");

const procs = [];
function sp(args, cwd, env, logFile) {
  const log = openSync(logFile, "w");
  const p = spawn(process.execPath, args, { cwd, detached: true, stdio: ["ignore", log, log], env: { ...process.env, ...env } });
  procs.push(p);
  return p;
}
async function isUp(url) { try { return (await fetch(url)).status < 500; } catch { return false; } }
async function waitUp(url, what) { for (let i = 0; i < 120; i++) { if (await isUp(url)) return; await sleep(500); } throw new Error(`${what} не поднялся: ${url}`); }

function client(cookie) {
  const api = async (method, p, body) => {
    const headers = cookie ? { Cookie: cookie } : {};
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
    const r = await fetch(BASE + p, { method, headers, body: payload });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  };
  return { api, cookie };
}
const similar = (user, id, q = "") => user.api("GET", `/syntheses/${id}/similar${q}`);
const idsOf = (r) => (r.json?.items ?? []).map((i) => i.id);
const item = (r, id) => (r.json?.items ?? []).find((i) => i.id === id);
const sim = (r, id) => item(r, id)?.similarity;

const userIds = [];
async function account(tag, name) {
  const email = `t183-${tag}-${TAG}-${Date.now()}@example.com`;
  const reg = await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: PW, displayName: name ?? tag }) });
  if (reg.status !== 201) throw new Error("регистрация: " + (await reg.text()).slice(0, 200));
  const [u] = await sql`update users set email_verified_at=now() where email=${email} returning id`;
  userIds.push(u.id);
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: PW }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  return { ...client(cookie), id: u.id, email, name: name ?? tag };
}
async function importHtml(user, html, name) {
  const fd = new FormData(); fd.append("file", new Blob([html], { type: "text/html" }), name);
  const imp = await user.api("POST", "/syntheses/import", fd);
  if (imp.status !== 200 && imp.status !== 201) throw new Error("импорт: " + imp.text.slice(0, 300));
  return imp.json.id;
}
/** Вариант образца — заменой текста; каждая замена обязана сработать. */
function variant(html, lang, pairs) {
  let out = html;
  if (lang) {
    if (out.split('"lang": "Russian"').length !== 2) throw new Error("в образце нет единственной отметки языка");
    out = out.replace('"lang": "Russian"', `"lang": "${lang}"`);
  }
  for (const [from, to] of pairs) {
    if (!out.includes(from)) throw new Error(`в образце нет «${from.slice(0, 50)}»`);
    out = out.split(from).join(to);
  }
  return out;
}
/** Концепция без документа (SQL: генерация не нужна) — философы, предки, термины. */
async function bare(user, o) {
  const [s] = await sql`insert into syntheses (user_id, title, lang, method, synth_level, status, visibility, capsule_html)
    values (${user.id}, ${`${o.title} ${TAG}`}, ${o.lang ?? "Russian"}, ${o.method ?? "dialectical"}, ${o.level ?? "comparative"}, 'ready', ${o.visibility ?? "private"},
            ${`<div data-section="Капсула"><h4>Капсула</h4><p>Капсула концепции «${o.title}».</p></div>`}) returning id`;
  let pos = 0;
  for (const n of o.philosophers ?? []) await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${s.id}, 'philosopher', ${n}, ${pos++})`;
  for (const p of o.parents ?? []) await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${s.id}, 'synthesis', ${p}, ${pos++})`;
  pos = 0;
  for (const t of o.terms ?? []) await sql`insert into glossary_terms (synthesis_id, term, definition, position) values (${s.id}, ${t}, 'определение', ${pos++})`;
  pos = 0;
  for (const c of o.categories ?? []) await sql`insert into categories (synthesis_id, name, position) values (${s.id}, ${c}, ${pos++})`;
  return s.id;
}
const baseTerm = (t) => t.replace(/\s*\([^()]*\)\s*$/, "").trim();
const sorted = (a) => [...a].sort((x, y) => x.localeCompare(y, "ru"));

/* ── браузер ── */
let browser = null;
async function newPage(who, width = 1400) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setUserAgentOverride", { userAgent: await browser.userAgent(), acceptLanguage: "ru-RU,ru" });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  return page;
}
/** Снимок блока для глаз: SHOTS=<папка> — необязательный, проверок не несёт */
const shot = async (page, name) => { if (process.env.SHOTS) { const el = await page.$(T("similar-block")); await (el ?? page).screenshot({ path: `${process.env.SHOTS}/${name}.png` }); } };
const cards = (page) => page.$$eval(T("similar-card"), (els) => els.map((el) => ({
  id: el.getAttribute("data-synthesis-id"),
  grade: el.getAttribute("data-grade"),
  gradeText: el.querySelector('[data-testid="similar-grade"]')?.textContent ?? "",
  title: el.querySelector('[data-testid="similar-card-title"]')?.textContent ?? "",
  reasons: Object.fromEntries([...el.querySelectorAll('[data-testid^="similar-reason-"]')].map((r) => [r.getAttribute("data-testid").replace("similar-reason-", ""), r.querySelector(".similar-reason-val")?.textContent ?? ""])),
  keys: [...el.querySelectorAll(".similar-reason-key")].map((k) => k.textContent ?? ""),
  skip: el.querySelector('[data-testid="similar-skip"]')?.getAttribute("data-reason") ?? null,
  skipText: el.querySelector('[data-testid="similar-skip"]')?.textContent ?? "",
  text: el.textContent ?? "",
  links: [...el.querySelectorAll("a")].map((a) => a.getAttribute("href")),
})));
/**
 * Блок в конечном состоянии ДЛЯ ЭТОЙ концепции: адрес — её, загрузки нет,
 * есть список, пустое состояние либо ошибка. При переходе между концепциями
 * прежний блок размонтируется вместе со страницей; `expectId` (карточка,
 * которой у прежней концепции быть не могло) страхует от чтения старого.
 */
async function block(page, synthesisId, expectId = null) {
  await page.waitForFunction((sid, eid) => {
    if (location.pathname !== `/synthesis/${sid}`) return false;
    const b = document.querySelector('[data-testid="similar-block"]');
    if (!b || b.querySelector('[data-testid="similar-loading"]')) return false;
    if (eid) return !!b.querySelector(`[data-testid="similar-card"][data-synthesis-id="${eid}"]`);
    return !!b.querySelector('[data-testid="similar-list"], [data-testid="similar-empty"], [data-testid="similar-error"]');
  }, { timeout: 25000 }, synthesisId, expectId);
}
/** Выдача каталога показана И принадлежит текущему адресу (data-query, 09 §4 18.2). */
async function catalogShown(page, path) {
  const h = await page.waitForFunction((path) => {
    if (location.pathname !== path) return null;
    const q = document.querySelector('[data-testid="catalog-results"]')?.dataset.query ?? "";
    if (!q) return null;
    const have = new URLSearchParams(q), addr = new URLSearchParams(location.search);
    for (const [k, v] of addr) if (!have.getAll(k).includes(v)) return null;
    return { search: location.search, ids: [...document.querySelectorAll(".catalog-card")].map((e) => e.dataset.synthesisId) };
  }, { timeout: 25000 }, path);
  return h.jsonValue();
}

const synthIds = [];
try {
  if (!existsSync(FILE)) throw new Error("файл-образец не найден: " + FILE);
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], ...(want("R3") ? [[UI, `preview :${UI_PORT}`]] : [])]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);
  if (want("R3")) {
    if (!CHROME) throw new Error("браузер не найден — соберите Chrome 131 по chrome/README.md");
    console.log("■ Сборка клиента (vite build)");
    const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8", env: { ...process.env, VITE_STRIPE_PUBLISHABLE_KEY: "" } });
    ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
    sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t183-preview.log");
  }
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", RATE_LIMIT_MAIL_PER_HOUR: "1000", MAIL_TRANSPORT: "console", BILLING_ENFORCE: "false", NOTIFY_SCAN_INTERVAL_MS: "600000" }, "/tmp/t183-server.log");
  await waitUp(`${BASE}/health`, "сервер");

  /* ════ Подготовка: всё по HTTP, кроме концепций без документа ════ */
  const O = await account("owner", "Владелец"), X = await account("str", "Чужой"), M = await account("mem", "Участник"), I = await account("inv", "Приглашённый");
  const G = client(null);
  const html = readFileSync(FILE, "utf8");
  const termBase = "Матричная готовность к разрыву", catName = "Онтологическое насилие";
  const [probe] = [html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ""];
  const RU = await importHtml(O, html, `t183-ru-${TAG}.html`);
  const [ru] = await sql`select title, seed, lang, method, synth_level from syntheses where id=${RU}`;
  if (!html.includes(termBase) || !html.includes(catName)) throw new Error("образец изменился: нет термина либо категории для вариантов" + probe.slice(0, 0));
  const NEW_TERM = "Решётчатая пригодность к обрыву", NEW_CAT = "Топологическая уступчивость";
  if (html.includes(NEW_TERM) || html.includes(NEW_CAT)) throw new Error("слова пробы встречаются в образце");
  const T_B = `Разлом вмещающий, редакция вторая ${TAG}`, T_EN = `The Containing Rift ${TAG}`, T_XP = `Чужой приватный разлом ${TAG}`, T_XS = `Витринный разлом ${TAG}`, T_XF = `Открытый разлом ${TAG}`;
  const RU_B = await importHtml(O, variant(html, null, [[ru.title, T_B], [termBase, NEW_TERM], [catName, NEW_CAT]]), `t183-rub-${TAG}.html`);
  const ENG = await importHtml(O, variant(html, "English", [[ru.title, T_EN]]), `t183-en-${TAG}.html`);
  const X_PRIV = await importHtml(X, variant(html, null, [[ru.title, T_XP]]), `t183-xp-${TAG}.html`);
  const X_SHOW = await importHtml(X, variant(html, null, [[ru.title, T_XS]]), `t183-xs-${TAG}.html`);
  const X_FULL = await importHtml(X, variant(html, null, [[ru.title, T_XF]]), `t183-xf-${TAG}.html`);
  synthIds.push(RU, RU_B, ENG, X_PRIV, X_SHOW, X_FULL);
  const setVis = async (user, id, visibility) => { const r = await user.api("PATCH", `/syntheses/${id}`, { visibility }); if (r.status !== 200) throw new Error(`ступень ${visibility}: ${r.text.slice(0, 200)}`); };
  await setVis(X, X_SHOW, "showcase");
  await setVis(X, X_FULL, "full");
  // чистые случаи без документа
  // слова разметки-ловушки свои: разметку разборщик словаря отбрасывает, и ключ термина — его слова
  const EVIL = `Аффинность <img src=x onerror="window.__pwned=1"> умозрения`;
  const KANT_RU = await bare(O, { title: "Критика русская", philosophers: ["Кант", "Гегель"], terms: ["Вещь в себе (Ding an sich)", "Трансцендентальное единство", EVIL], categories: ["Свобода"] });
  const KANT_RU2 = await bare(O, { title: "Критика вторая", philosophers: ["Кант", "Фихте"], terms: ["Вещи в себе", "Интеллектуальное созерцание", EVIL], categories: ["свободы", "Разум"], method: "analytical" });
  const KANT_EN = await bare(X, { title: "Critique in English", lang: "English", visibility: "full", philosophers: ["Кант", "Гегель"], terms: ["Вещь в себе (Ding an sich)", "Трансцендентальное единство"], categories: ["Свобода"] });
  const GP = await bare(O, { title: "Общий предок", philosophers: ["Спиноза"] });
  const A1 = await bare(O, { title: "Ветвь первая", visibility: "full", philosophers: ["Лейбниц"], parents: [GP] });
  const A2 = await bare(O, { title: "Ветвь вторая", visibility: "full", philosophers: ["Юм"], parents: [GP], method: "creative" });
  const LONE = await bare(O, { title: "Одиночка", philosophers: [], terms: [`Неповторимость${TAG}`] });
  synthIds.push(KANT_RU, KANT_RU2, KANT_EN, GP, A1, A2, LONE);
  const inv1 = await X.api("POST", `/syntheses/${X_PRIV}/members`, { email: M.email, role: "reviewer" });
  const inv2 = await X.api("POST", `/syntheses/${X_PRIV}/members`, { email: I.email, role: "editor" });
  if (inv1.status !== 201 || inv2.status !== 201) throw new Error("приглашение: " + inv1.text.slice(0, 200) + inv2.text.slice(0, 200));
  const acc = await M.api("POST", `/syntheses/${X_PRIV}/membership/accept`);
  if (acc.status !== 200) throw new Error("принятие приглашения: " + acc.text.slice(0, 200));
  const sample = [RU, RU_B, ENG, X_PRIV, X_SHOW, X_FULL];
  const langs = Object.fromEntries((await sql`select id, lang, visibility from syntheses where id in ${sql(sample)}`).map((r) => [r.id, `${r.lang}/${r.visibility}`]));
  ok(langs[RU] === "Russian/private" && langs[RU_B] === "Russian/private" && langs[ENG] === "English/private" && langs[X_PRIV] === "Russian/private" && langs[X_SHOW] === "Russian/showcase" && langs[X_FULL] === "Russian/full", "подготовка: шесть импортов образца — языки и ступени те, что задуманы", langs);
  const ruTerms = (await sql`select term from glossary_terms where synthesis_id=${RU}`).map((r) => baseTerm(r.term));
  const ruCats = (await sql`select name from categories where synthesis_id=${RU}`).map((r) => r.name.trim());
  const enTerms = (await sql`select term from glossary_terms where synthesis_id=${ENG}`).map((r) => baseTerm(r.term));
  ok(ruTerms.length >= 5 && ruCats.length >= 3 && ruTerms.includes(termBase) && sorted(enTerms).join("|") === sorted(ruTerms).join("|"), "подготовка: у английского варианта те же строки терминов, что у русского образца (ловушка границы языков)", [ruTerms.length, ruCats.length, enTerms.length]);

  /* ════ R2: живой сервер ════ */
  if (want("R2")) {
    console.log("\n■ R2.1. Общий обход родословной на живом импорте (Д-88)");
    const lin = async (name) => (await O.api("GET", `/lineage/search?philosopher=${encodeURIComponent(name)}`)).json?.syntheses?.map((s) => s.id) ?? [];
    const flt = async (name, area) => idsOf(await O.api("GET", `/syntheses/search?scope=mine&philosopher=${encodeURIComponent(name)}&philArea=${area}&limit=100`));
    const deep = await lin("Левинас"), deepF = await flt("Левинас", "lineage"), deepD = await flt("Левинас", "direct"), top = await flt("Юнг", "direct");
    ok(deep.includes(RU) && deepF.includes(RU) && !deepD.includes(RU) && top.includes(RU), "философ ВЛОЖЕННОГО узла дерева файла («Левинас») находит импорт и /lineage/search, и фильтром родословной; среди прямых участников его нет, «Юнг» — есть", [deep.includes(RU), deepF.includes(RU), deepD.includes(RU), top.includes(RU)]);
    const mineS = [RU, RU_B, ENG];
    ok(J(sorted(deep.filter((x) => mineS.includes(x)))) === J(sorted(deepF.filter((x) => mineS.includes(x)))) && deepF.filter((x) => mineS.includes(x)).length === 3, "оба пути дают один ответ на всех трёх импортах владельца", [deep.length, deepF.length]);

    console.log("\n■ R2.2. Один язык, общие термины — термины в причинах");
    const r = await similar(O, RU);
    const own = idsOf(r).filter((x) => sample.includes(x));
    const b = sim(r, RU_B);
    ok(r.status === 200 && own[0] === X_FULL && own[1] === RU_B && r.json.sourceContentOpen === true && r.json.capped === false, "первой — открытая копия со ВСЕМИ терминами, второй — редакция, где один термин и одна категория переименованы", [r.status, own.map((x) => ({ [RU_B]: "RU_B", [ENG]: "ENG", [X_SHOW]: "X_SHOW", [X_FULL]: "X_FULL", [X_PRIV]: "X_PRIV" })[x])]);
    ok(b?.grade === "strong" && b.textCompared === true && !("textSkipped" in b) && b.reasons.termsTotal >= ruTerms.length - 2 && b.reasons.termsTotal < ruTerms.length + 1 && b.reasons.terms.length === Math.min(b.reasons.termsTotal, SIMILAR_REASON_ITEMS_MAX) && b.reasons.terms.every((t) => ruTerms.includes(t)), "термины в причинах: названы именами исходной (без скобки-пояснения), не больше шести, общий счёт — отдельно", b?.reasons);
    const allB = sim(await similar(O, RU, "?limit=20"), RU_B).reasons;
    ok(!allB.terms.includes(termBase) && !allB.terms.includes(NEW_TERM) && allB.termsTotal === new Set(ruTerms).size - 1 && allB.categoriesTotal === new Set(ruCats.map((c) => c.toLowerCase())).size - 1 && !allB.categories.includes(catName) && !allB.categories.includes(NEW_CAT), "переименованные в редакции термин и категория общими не считаются: общих — на один меньше, чем у исходной", [allB.termsTotal, new Set(ruTerms).size, allB.categoriesTotal, ruCats.length]);
    ok(J(b.reasons.philosophers) === J(["Юнг"]) && J(sorted(b.reasons.lineagePhilosophers)) === J(sorted(["Витгенштейн", "Шестов", "Парменид", "Левинас"])) && b.reasons.ancestorsTotal === 3 && J(sorted(b.reasons.ancestors.map((a) => a.title))) === J(sorted(["Грамматика самоотрицания", "Экзистенциальная грамматика", "Онтология самоотрицания"])) && b.reasons.ancestors.every((a) => !("id" in a)) && b.reasons.kin === null && b.reasons.method && b.reasons.synthLevel, "философы прямые и по родословной; общие предки — снимки дерева файла, названы без ссылки; метод и уровень совпали", b.reasons);
    const k = await similar(O, KANT_RU);
    const k2 = sim(k, KANT_RU2);
    ok(k2?.textCompared && J(k2.reasons.philosophers) === J(["Кант"]) && J(sorted(k2.reasons.terms)) === J(sorted(["Вещь в себе", EVIL])) && J(k2.reasons.categories) === J(["Свобода"]) && k2.reasons.method === false && J(k2.reasons.epochs) === J([3]), "словоформы сходятся («Вещи в себе» — «Вещь в себе», «свободы» — «Свобода»), имя — исходной; разметка в имени термина — данные как есть", k2?.reasons);

    console.log("\n■ R2.3. Разные языки, общие философы — термины не сравниваются");
    const e = sim(r, ENG);
    ok(e && e.textCompared === false && e.textSkipped === "language" && e.reasons.termsTotal === 0 && e.reasons.categoriesTotal === 0 && e.reasons.terms.length === 0 && e.reasons.categories.length === 0, "английский вариант образца: строки терминов те же, а в причинах их нет — не сравнивались (другой язык генерации)", e);
    ok(J(e.reasons.philosophers) === J(["Юнг"]) && e.reasons.lineagePhilosophers.length === 4 && e.reasons.ancestorsTotal === 3 && e.reasons.method && e.reasons.synthLevel && SIMILARITY_GRADES.includes(e.grade), "похожи по философам, предкам, методу и уровню — через границу языков", e.reasons);
    ok(own.indexOf(RU_B) < own.indexOf(ENG), "порядок: концепция со сравнённым и совпавшим текстом выше той, у которой текст не сравнивался", own.length);
    const ke = sim(k, KANT_EN);
    ok(ke && ke.grade === "strong" && ke.textSkipped === "language" && J(ke.reasons.philosophers) === J(["Гегель", "Кант"]) && ke.reasons.termsTotal === 0 && ke.reasons.categoriesTotal === 0 && J(ke.reasons.epochs) === J([3]), "две концепции с общими философами на разных языках: «сильно похожа» по философам, термины и категории не сравнивались", ke);
    const back = sim(await similar(X, KANT_EN), X_FULL);
    ok(back === undefined, "обратная проверка не слепа: у английской концепции одноязычных соседей по тексту нет");

    console.log("\n■ R2.4. Видимость кандидатов");
    ok(!idsOf(r).includes(X_PRIV) && !idsOf(await similar(O, RU, "?limit=20")).includes(X_PRIV), "чужая приватная не появляется (хотя совпадает с исходной во всём)");
    const mv = await similar(M, X_FULL, "?limit=20"), iv = await similar(I, X_FULL, "?limit=20"), ov = await similar(O, X_FULL, "?limit=20");
    ok(idsOf(mv).includes(X_PRIV) && sim(mv, X_PRIV).textCompared === true && sim(mv, X_PRIV).reasons.termsTotal > 0, "участник, принявший приглашение, видит приватную кандидатом — и с терминами", sim(mv, X_PRIV));
    ok(!idsOf(iv).includes(X_PRIV) && !idsOf(ov).includes(X_PRIV), "приглашённый, не принявший приглашение, и посторонний её не видят");
    const gv = await similar(G, X_FULL, "?limit=20");
    const gIds = idsOf(gv);
    const gVis = gIds.length ? await sql`select id, visibility from syntheses where id in ${sql(gIds)}` : [];
    ok(gv.status === 200 && gIds.includes(X_SHOW) && gVis.every((v) => v.visibility !== "private") && !gIds.some((x) => [RU, RU_B, ENG, X_PRIV].includes(x)) && !gv.text.includes("totalCostUsd"), "гость: кандидаты только публичные, превью без стоимости", [gv.status, gIds.length]);
    const g403 = await similar(G, RU), s403 = await similar(X, RU), i403 = await similar(I, X_PRIV);
    ok(g403.status === 403 && s403.status === 403 && i403.status === 403, "похожие для чужой приватной концепции: гостю, постороннему и не принявшему приглашение — 403", [g403.status, s403.status, i403.status]);
    const mOwn = await similar(M, X_PRIV, "?limit=20");
    ok(mOwn.status === 200 && mOwn.json.sourceContentOpen === true && idsOf(mOwn).includes(X_FULL) && !idsOf(mOwn).includes(RU), "участник запрашивает похожие для приватной, где он участник: содержание открыто, чужих приватных среди кандидатов нет", [mOwn.status, idsOf(mOwn).length]);

    console.log("\n■ R2.5. Витрина");
    const s = sim(r, X_SHOW), f = sim(r, X_FULL);
    ok(s && s.textCompared === false && s.textSkipped === "closed" && s.reasons.termsTotal === 0 && s.reasons.categoriesTotal === 0 && s.reasons.terms.length === 0 && s.reasons.categories.length === 0 && J(s.reasons.philosophers) === J(["Юнг"]) && s.reasons.ancestorsTotal === 3, "витрина-кандидат: без терминов и категорий в причинах; философы и предки — есть", s);
    ok(f && f.textCompared === true && f.reasons.termsTotal === new Set(ruTerms).size && item(r, X_SHOW).visibility === "showcase", "та же концепция на ступени «публичная» — с терминами (проверка витрины не слепа)", f?.reasons.termsTotal);
    ok(own.indexOf(X_FULL) < own.indexOf(X_SHOW), "открытая с общими терминами — выше витрины с теми же философами");
    const viaShow = await similar(O, X_SHOW, "?limit=20");
    ok(viaShow.status === 200 && viaShow.json.sourceContentOpen === false && viaShow.json.items.length > 0 && viaShow.json.items.every((i) => i.similarity.textCompared === false && i.similarity.textSkipped && i.similarity.reasons.termsTotal === 0 && i.similarity.reasons.categoriesTotal === 0), "витрина-исходная: её термины и категории не сравниваются ни с кем — и с открытой одноязычной", [viaShow.status, viaShow.json?.sourceContentOpen, viaShow.json?.items?.length]);
    const ownShow = await similar(X, X_SHOW, "?limit=20");
    ok(ownShow.json.sourceContentOpen === true && sim(ownShow, X_FULL)?.reasons.termsTotal === new Set(ruTerms).size && sim(ownShow, X_PRIV)?.textCompared === true, "владельцу витрины её содержание открыто: термины сравниваются, своя приватная — кандидат");
    const noText = await similar(O, KANT_RU, "?limit=20");
    const SHOW_TXT = await bare(X, { title: "Витрина только с текстом", visibility: "showcase", philosophers: ["Нагарджуна"], terms: ["Вещь в себе", "Трансцендентальное единство"], categories: ["Свобода"] });
    const FULL_TXT = await bare(X, { title: "Открытая только с текстом", visibility: "full", philosophers: ["Нагарджуна"], terms: ["Вещь в себе", "Трансцендентальное единство"], categories: ["Свобода"] });
    synthIds.push(SHOW_TXT, FULL_TXT);
    const withText = await similar(O, KANT_RU, "?limit=20");
    ok(!idsOf(noText).includes(SHOW_TXT) && !idsOf(withText).includes(SHOW_TXT) && idsOf(withText).includes(FULL_TXT) && sim(withText, FULL_TXT).reasons.termsTotal === 2, "витрина, общая с исходной ТОЛЬКО терминами и категориями, в выдачу не попадает (содержание не прочитано); открытый двойник — попадает", [idsOf(withText).includes(SHOW_TXT), idsOf(withText).includes(FULL_TXT)]);

    console.log("\n■ R2.6. Мера считается на запрос");
    const gl = (await O.api("GET", `/syntheses/${RU_B}/glossary`)).json;
    const glTerms = Array.isArray(gl) ? gl : gl.terms ?? gl.items ?? [];
    const victim = glTerms.find((t) => allB.terms.includes(baseTerm(t.term)));
    const del = victim ? await O.api("DELETE", `/syntheses/${RU_B}/glossary/${victim.id}`) : { status: 0, text: "общий термин не найден в глоссарии" };
    const afterDel = sim(await similar(O, RU, "?limit=20"), RU_B)?.reasons;
    ok(del.status === 200 && afterDel.termsTotal === allB.termsTotal - 1 && !afterDel.terms.includes(baseTerm(victim.term)), "удалён общий термин — следующим же запросом общих на один меньше", [del.status, del.text?.slice(0, 120), afterDel?.termsTotal, allB.termsTotal]);
    await setVis(X, X_FULL, "private");
    const hid = await similar(O, RU, "?limit=20");
    await setVis(X, X_FULL, "showcase");
    const shw = sim(await similar(O, RU, "?limit=20"), X_FULL);
    await setVis(X, X_FULL, "full");
    const opn = sim(await similar(O, RU, "?limit=20"), X_FULL);
    ok(!idsOf(hid).includes(X_FULL) && shw?.textSkipped === "closed" && shw.reasons.termsTotal === 0 && opn?.textCompared === true && opn.reasons.termsTotal > 0, "смена ступени видна сразу: приватная — исчезла, витрина — без терминов, публичная — снова с терминами", [idsOf(hid).includes(X_FULL), shw?.textSkipped, opn?.reasons.termsTotal]);
    const tbl = await sql`select count(*)::int n from information_schema.tables where table_schema='public' and table_name ~ 'similar'`;
    const ixBefore = await sql`select count(*)::int n from synthesis_search`;
    await similar(O, RU); await similar(G, X_FULL);
    const ixAfter = await sql`select count(*)::int n from synthesis_search`;
    ok(tbl[0].n === 0 && ixBefore[0].n === ixAfter[0].n, "в БД запрос похожих ничего не пишет: таблиц сходства нет, индекс поиска не тронут");

    console.log("\n■ R2.7. Форма ответа");
    const all = [r, k, mv, gv, viaShow];
    ok(all.every((x) => x.json.items.every((i) => SIMILARITY_GRADES.includes(i.similarity.grade) && J(Object.keys(i.similarity).sort()) === J(i.similarity.textSkipped ? ["grade", "reasons", "textCompared", "textSkipped"] : ["grade", "reasons", "textCompared"]))) && !all.some((x) => /"score"|"measure"|"weight"|"similarityScore"/.test(x.text)) && !all.some((x) => /\d\.\d{3,}/.test(J(x.json.items.map((i) => i.similarity)))), "мера — только ступенью («strong / notable / weak»), числа в ответе нет", all.map((x) => x.json.items.length));
    const grades = r.json.items.map((i) => SIMILARITY_GRADES.indexOf(i.similarity.grade));
    ok(grades.every((g, i) => i === 0 || g >= grades[i - 1]) && r.json.items.length <= 6, "выдача — по убыванию меры (ступени не возрастают), по умолчанию не больше шести", grades);
    const l2 = await similar(O, RU, "?limit=2"), l0 = await similar(O, RU, "?limit=0"), lBig = await similar(O, RU, `?limit=${SIMILAR_LIMIT_MAX + 1}`), lBad = await similar(O, RU, "?limit=abc");
    ok(l2.json.items.length === 2 && J(idsOf(l2)) === J(idsOf(r).slice(0, 2)) && [l0, lBig, lBad].every((x) => x.status === 400 && x.json.code === "VALIDATION_ERROR" && x.json.details?.limit), "limit: 2 — два лучших; 0, сверх предела и не число — 400 с details.limit", [l2.json.items.length, l0.status, lBig.status, lBad.status]);
    const a = sim(await similar(O, A1), A2), ax = sim(await similar(X, A1), A2), ag = sim(await similar(G, A1), A2);
    ok(a && J(a.reasons.ancestors) === J([{ id: GP, title: `Общий предок ${TAG}` }]) && a.reasons.ancestorsTotal === 1 && J(a.reasons.lineagePhilosophers) === J(["Спиноза"]), "общий предок со строкой в БД: назван со ссылкой, его философ — в причинах", a?.reasons);
    ok(ax && ag && [ax, ag].every((z) => z.reasons.ancestors.length === 0 && z.reasons.ancestorsTotal === 1 && !J(z).includes("Общий предок")), "тот же предок постороннему и гостю (он приватный): сосчитан, но не назван", [ax?.reasons, ag?.reasons]);
    const kin = sim(await similar(O, GP), A1), kinBack = sim(await similar(O, A1), GP);
    ok(kin?.reasons.kin === "descendant" && kinBack?.reasons.kin === "ancestor", "прямое родство названо с обеих сторон: потомок и предок", [kin?.reasons.kin, kinBack?.reasons.kin]);
    const lone = await similar(O, LONE);
    const nf = await similar(O, "00000000-0000-4000-8000-000000000000"), nu = await similar(O, "not-a-uuid");
    ok(lone.status === 200 && lone.json.items.length === 0 && lone.json.capped === false && nf.status === 404 && nu.status === 404, "концепция без соседей — пустая выдача; нет концепции — 404", [lone.status, lone.json?.items?.length, nf.status, nu.status]);
    const full = await O.api("GET", `/syntheses/${RU}`);
    ok(full.status === 200 && (full.json.id ?? full.json.synthesis?.id) === RU, "маршрут похожих не перехватил GET /syntheses/:id");
    // вернуть удалённый термин нечем (Огр-13) — R3 считает общие термины заново
  }

  /* ════ R3: браузер на сборке ════ */
  if (want("R3")) {
    await waitUp(UI, "preview");
    const puppeteer = (await import("puppeteer-core")).default;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
    const ver = await browser.version();
    ok(/131\.0\.6778/.test(ver), `браузер Chrome 131 (${ver})`);
    const api = await similar(O, RU);

    console.log("\n■ R3.1. Блок на странице концепции");
    const p = await newPage(O);
    await p.goto(`${UI}/synthesis/${RU}`, { waitUntil: "networkidle0" });
    await block(p, RU);
    let cs = await cards(p);
    await shot(p, "r3-1-owner");
    ok(J(cs.map((c) => c.id)) === J(idsOf(api)) && cs[0].id === X_FULL && cs[1].id === RU_B, "карточки блока — выдача сервера, в том же порядке: открытая копия, затем одноязычная редакция", [cs.map((c) => c.title), idsOf(api).length]);
    const below = await p.evaluate(() => { const b = document.querySelector('[data-testid="similar-block"]'); const secs = [...document.querySelectorAll("[data-section-key], .doc-section, section")].filter((s) => !b.contains(s) && !s.contains(b)); return secs.length > 0 && secs.every((s) => !(s.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING)); });
    ok(below, "блок стоит под документом");
    const word = { strong: "сильно похожа", notable: "заметно похожа", weak: "слабо похожа" };
    ok(cs.every((c) => c.gradeText === word[c.grade] && c.grade === sim(api, c.id).grade), "мера — словами, та же ступень, что отдал сервер", cs.map((c) => [c.grade, c.gradeText]));
    ok(cs.every((c) => !/\d[.,]\d|\d\s?%/.test(c.text.replace(c.title, ""))), "числа меры в карточках нет");
    const cb = cs.find((c) => c.id === RU_B), rb = sim(api, RU_B).reasons;
    ok(/Юнг/.test(cb.reasons.philosophers ?? "") && ["Витгенштейн", "Шестов", "Парменид", "Левинас"].every((n) => (cb.reasons.lineage ?? "").includes(n)) && rb.terms.every((t) => (cb.reasons.terms ?? "").includes(t)) && (rb.termsTotal > rb.terms.length ? new RegExp(`и ещё ${rb.termsTotal - rb.terms.length}`).test(cb.reasons.terms) : true) && rb.categories.every((t) => (cb.reasons.categories ?? "").includes(t)) && /Грамматика самоотрицания/.test(cb.reasons.ancestors ?? "") && /метод синтеза, уровень синтеза/.test(cb.reasons.same ?? ""), "причины одноязычной редакции: философы, родословная, термины («и ещё N» сверх шести), категории, общие предки, метод и уровень", cb.reasons);
    ok(!cs.some((c) => c.id === X_PRIV || c.id === RU), "чужой приватной и самой концепции среди карточек нет");

    console.log("\n■ R3.2. Другой язык и витрина");
    const ce = cs.find((c) => c.id === ENG), cx = cs.find((c) => c.id === X_SHOW);
    ok(ce?.skip === "language" && /разные языки генерации/.test(ce.skipText) && !("terms" in ce.reasons) && !("categories" in ce.reasons) && /Юнг/.test(ce.reasons.philosophers ?? ""), "иноязычная: «не сравнивались: разные языки генерации», терминов и категорий в причинах нет, философы есть", ce);
    ok(cx?.skip === "closed" && /витриной/.test(cx.skipText) && !("terms" in cx.reasons) && !("categories" in cx.reasons) && /витрина/i.test(cx.text), "витрина: «не сравнивались: содержание открыто только витриной», терминов нет, бейдж ступени", cx);
    ok(/одного языка генерации/.test(await p.$eval(T("similar-foot"), (el) => el.textContent ?? "")) && /среди ваших, доступных вам и публичных/.test(await p.$eval(".similar-note", (el) => el.textContent ?? "")), "подвал объясняет счёт, заголовок — среди чего искали");

    console.log("\n■ R3.3. Переходы");
    await p.$eval(`${T("similar-card")}[data-synthesis-id="${RU_B}"] ${T("similar-card-title")}`, (el) => el.click());
    await block(p, RU_B, RU);
    cs = await cards(p);
    ok(cs.some((c) => c.id === RU) && !cs.some((c) => c.id === RU_B) && (await p.$eval("h1, .doc-title", (el) => el.textContent ?? "").catch(() => "")).length >= 0, "название карточки ведёт к концепции; блок перечитан для неё (исходная теперь среди похожих, её самой нет)", cs.map((c) => c.title));
    await p.goBack();
    await block(p, RU, RU_B);
    ok((await cards(p))[1].id === RU_B, "«назад» возвращает к прежней концепции с её блоком");
    // философ → каталог, фильтр родословной
    const philHref = await p.$eval(`${T("similar-card")}[data-synthesis-id="${RU_B}"] ${T("similar-reason-lineage")} a`, (el) => [el.getAttribute("href"), el.textContent]);
    await p.$eval(`${T("similar-card")}[data-synthesis-id="${RU_B}"] ${T("similar-reason-lineage")} a`, (el) => el.click());
    let cat = await catalogShown(p, "/catalog");
    const sp1 = new URLSearchParams(cat.search);
    const srv1 = idsOf(await O.api("GET", `/syntheses/search?scope=mine&${cat.search.replace(/^\?/, "")}&limit=100`));
    ok(philHref[0] === `/catalog?philosopher=${encodeURIComponent(philHref[1])}&philArea=lineage` && sp1.get("philArea") === "lineage" && J(sorted(cat.ids)) === J(sorted(srv1)) && [RU, RU_B, ENG].every((x) => cat.ids.includes(x)) && !cat.ids.includes(KANT_RU), "ссылка философа родословной → каталог «Мои» с фильтром всей родословной: выдача ≡ ответу сервера, импорты найдены по философу вложенного узла файла", [philHref, cat.ids.length, srv1.length]);
    await p.goBack();
    await block(p, RU, RU_B);
    // эпоха → каталог
    await p.$eval(`${T("similar-card")}[data-synthesis-id="${RU_B}"] ${T("similar-reason-epochs")} a`, (el) => el.click());
    cat = await catalogShown(p, "/catalog");
    const sp2 = new URLSearchParams(cat.search);
    ok(sp2.has("epoch") && sp2.get("philArea") === "lineage" && cat.ids.includes(RU), "ссылка эпохи → каталог с фильтром эпохи по всей родословной", [cat.search, cat.ids.length]);
    // предок со строкой в БД → его потомки
    await p.goto(`${UI}/synthesis/${A1}`, { waitUntil: "networkidle0" });
    await block(p, A1, A2);
    const ca = (await cards(p)).find((c) => c.id === A2);
    ok(/Общий предок/.test(ca.reasons.ancestors ?? "") && ca.links.includes(`/synthesis/${GP}`) && ca.links.includes(`/catalog?descendantsOf=${GP}`), "общий предок со строкой в БД: название — ссылка на концепцию, рядом — «потомки в каталоге»", [ca.reasons, ca.links]);
    await p.$eval(`${T("similar-card")}[data-synthesis-id="${A2}"] ${T("similar-descendants-link")}`, (el) => el.click());
    cat = await catalogShown(p, "/catalog");
    ok(J(sorted(cat.ids)) === J(sorted([A1, A2])), "ссылка «потомки в каталоге» → каталог с потомками предка", cat);
    const pk = await newPage(O);
    await pk.goto(`${UI}/synthesis/${GP}`, { waitUntil: "networkidle0" });
    await block(pk, GP, A1);
    ok(/потомок этой концепции/.test((await cards(pk)).find((c) => c.id === A1).reasons.kin ?? ""), "прямое родство названо словами («потомок этой концепции»)");
    await pk.close();

    console.log("\n■ R3.4. Без соседей; витрина-исходная; разметка в данных");
    await p.goto(`${UI}/synthesis/${LONE}`, { waitUntil: "networkidle0" });
    await block(p, LONE);
    const empty = await p.$eval(T("similar-empty"), (el) => el.textContent ?? "").catch(() => null);
    await shot(p, "r3-4-empty");
    ok(!!empty && /Похожих концепций не нашлось/.test(empty) && (await p.$$(T("similar-card"))).length === 0 && (await p.$(T("similar-error"))) === null && (await p.$(T("similar-foot"))) === null, "пустое состояние названо словами; ни карточек, ни ошибки", empty);
    await p.goto(`${UI}/synthesis/${X_SHOW}`, { waitUntil: "networkidle0" });
    await block(p, X_SHOW);
    const sc = await cards(p);
    ok(sc.length > 0 && sc.every((c) => c.skip !== null && !("terms" in c.reasons)) && /открыта вам витриной/.test(await p.$eval(T("similar-foot"), (el) => el.textContent ?? "")), "витрина-исходная: ни у одной карточки нет терминов, подвал говорит почему", sc.map((c) => [c.title, c.skip]));
    await p.goto(`${UI}/synthesis/${KANT_RU}`, { waitUntil: "networkidle0" });
    await block(p, KANT_RU, KANT_RU2);
    const ck = (await cards(p)).find((c) => c.id === KANT_RU2);
    const inj = await p.evaluate(() => ({ pwned: window.__pwned === 1, img: document.querySelectorAll('[data-testid="similar-block"] img').length }));
    ok(!inj.pwned && inj.img === 0 && /<img src=x onerror=/.test(ck.reasons.terms ?? ""), "разметка в имени общего термина показана текстом: элемент не создан, обработчик не сработал", [inj, ck.reasons.terms]);
    ok(p.errors.length === 0, "ошибок страницы нет (вошедший)", p.errors);

    console.log("\n■ R3.5. Гость");
    const g = await newPage(null);
    await g.goto(`${UI}/synthesis/${X_FULL}`, { waitUntil: "networkidle0" });
    await block(g, X_FULL);
    const gs = await cards(g);
    await shot(g, "r3-5-guest");
    const gApi = await similar(G, X_FULL);
    ok(J(gs.map((c) => c.id)) === J(idsOf(gApi)) && gs.some((c) => c.id === X_SHOW) && !gs.some((c) => [RU, RU_B, ENG, X_PRIV].includes(c.id)), "гость на публичной концепции: блок есть, карточки — гостевая выдача сервера, приватных нет", gs.map((c) => c.title));
    const gl = gs.flatMap((c) => c.links).filter((h) => h && !h.startsWith("/synthesis/"));
    ok(gl.length > 0 && gl.every((h) => h.startsWith("/explore?")) && /среди публичных концепций/.test(await g.$eval(".similar-note", (el) => el.textContent ?? "")), "ссылки причин гостя ведут на /explore; сказано, среди чего искали", gl.slice(0, 3));
    await g.$eval(`${T("similar-card")}[data-synthesis-id="${X_SHOW}"] ${T("similar-phil-link")}`, (el) => el.click());
    const gcat = await catalogShown(g, "/explore");
    const gv = gcat.ids.length ? await sql`select visibility from syntheses where id in ${sql(gcat.ids)}` : [];
    ok(gcat.ids.includes(X_SHOW) && gcat.ids.includes(X_FULL) && gv.every((v) => v.visibility !== "private") && new URLSearchParams(gcat.search).get("philArea") === "lineage", "переход гостя по ссылке философа: /explore с фильтром родословной, в выдаче только публичное", [gcat.search, gcat.ids.length]);
    const g2 = await newPage(null);
    await g2.goto(`${UI}/synthesis/${RU}`, { waitUntil: "networkidle0" });
    await sleep(800);
    ok((await g2.$(T("similar-card"))) === null && g.errors.length === 0 && g2.errors.length === 0, "чужая приватная гостю: карточек похожих нет; ошибок страницы нет (гость)", [g.errors, g2.errors]);

    console.log("\n■ R3.6. Язык интерфейса и узкое окно");
    const langBad = [];
    for (const [loc, title, strong, philKey] of [["en", "Similar concepts", "strongly similar", "Shared philosophers"], ["de", "Ähnliche Konzepte", "stark ähnlich", "Gemeinsame Philosophen"]]) {
      await sql`update users set ui_locale=${loc} where id=${O.id}`;
      const pl = await newPage(O);
      await pl.setExtraHTTPHeaders({ "Accept-Language": loc });
      await pl.setCookie({ name: "ui_locale", value: loc, url: UI });
      await pl.goto(`${UI}/synthesis/${RU}`, { waitUntil: "networkidle0" });
      await block(pl, RU, RU_B);
      const lc = await cards(pl);
      const tx = await pl.evaluate(() => ({ title: document.querySelector(".similar-title")?.textContent ?? "", note: document.querySelector(".similar-note")?.textContent ?? "", foot: document.querySelector('[data-testid="similar-foot"]')?.textContent ?? "" }));
      // подписи блока — без кириллицы; имена философов, названия и термины — данные документа
      const labels = [tx.title, tx.note, tx.foot, ...lc.flatMap((c) => [c.gradeText, c.skipText, ...c.keys, c.reasons.same ?? "", c.reasons.kin ?? ""])].join(" ");
      if (tx.title !== title || lc[0].gradeText !== strong || !lc[0].keys.includes(philKey) || /[А-Яа-яЁё]/.test(labels)) langBad.push([loc, tx.title, lc[0].gradeText, lc[0].keys, labels.match(/[А-Яа-яЁё][^.]{0,40}/)?.[0]]);
      if (pl.errors.length) langBad.push([loc, pl.errors]);
      if (loc === "de") await shot(pl, "r3-6-de");
      await pl.close();
    }
    await sql`update users set ui_locale=null where id=${O.id}`;
    ok(langBad.length === 0, "блок на en и de: заголовок, мера, подписи причин, пояснения — без русских подписей (переводы утверждены)", langBad);
    const pm = await newPage(O, 480);
    await pm.goto(`${UI}/synthesis/${RU}`, { waitUntil: "networkidle0" });
    await block(pm, RU, RU_B);
    const narrow = await pm.evaluate(() => { const r = document.querySelector(".similar-reason"); const b = document.querySelector('[data-testid="similar-block"]'); return { cols: getComputedStyle(r).gridTemplateColumns.split(" ").length, overflow: b.scrollWidth > b.clientWidth + 1, pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 }; });
    await shot(pm, "r3-6-narrow");
    ok(narrow.cols === 1 && !narrow.overflow, "узкое окно (480): причины — в один столбец, блок не вылезает по ширине", narrow);
  }
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
} finally {
  console.log(`\nИТОГ: ${passed} ✓, ${failed} ✗${fails.length ? "\n  " + fails.join("\n  ") : ""}`);
  try { await browser?.close(); } catch {}
  for (const p of procs) { try { process.kill(-p.pid, "SIGKILL"); } catch {} }
  try {
    for (const id of userIds) await sql`update users set ui_locale=null where id=${id}`;
    for (const id of synthIds) await sql`delete from syntheses where id=${id}`;
    for (const id of userIds) {
      await sql`delete from syntheses where user_id=${id}`;
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
