/**
 * Беседа 18.2, первый запрос — проба поиска каталога в браузере
 * (Chrome 131, СБОРКА клиента под vite preview; сервер :3000 без мока —
 * все шаги пробы бесплатные):
 *   U1 строка поиска с выбором поля — на трёх вкладках; набор → дебаунс →
 *      параметр q адреса; выдача с фрагментом и подсветкой <mark>;
 *      разметка в тексте документа не становится разметкой страницы;
 *   U2 опечатка → находки названы «похожими»;
 *   U3 поле «содержание» и поле «термин»: карточка ведёт прямо к термину —
 *      страница концепции прокручена к строке, строка в рамке;
 *   U4 панель фильтров: философ с подсказками, все/любой, прямые/
 *      родословная (прежний LineageSearch — отдельной кнопки нет), эпоха,
 *      метод, уровень, язык, мета; статус и дата — только на «моих»;
 *      счёт фильтров и сброс;
 *   U5 состояние — в адресной строке: ссылка открывается тем же поиском в
 *      новой вкладке браузера, «назад» возвращает прежний поиск;
 *   U6 потомки концепции: ссылка со страницы концепции → фильтр панели с
 *      названием и ✕ (плашки нет);
 *   U7 пустая выдача — сообщение с подсказками и сбросом;
 *   U8 гость на «/explore»: поиск и фильтр родословной работают, вкладок
 *      и статуса нет; ссылка с scope=mine гостя не роняет;
 *   U9 «Со мной поделились» — тем же маршрутом, с бейджем роли.
 *
 * Запуск (из корня; PG/Redis подняты, порты 3000 и 5282 свободны):
 *   node_modules/.bin/tsx tests/test-182-request1-ui.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import postgres from "postgres";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5282;
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
const TAG = "t182-" + Math.random().toString(36).slice(2, 6);
const PW = "password-182";
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


const synthIds = [];
const SI = await import("../server/services/search-index.ts");
async function mkSynth(userId, o) {
  const [s] = await sql`insert into syntheses (user_id, title, seed, lang, method, synth_level, status, visibility, capsule_html, created_at)
    values (${userId}, ${o.title}, ${o.seed ?? ""}, ${o.lang ?? "Russian"}, ${o.method ?? "dialectical"}, ${o.level ?? "comparative"}, ${o.status ?? "ready"}, ${o.visibility ?? "private"},
            ${o.capsule ? `<div data-section="Капсула"><h4>Капсула</h4><p>${o.capsule}</p></div>` : ""}, ${o.createdAt ?? new Date().toISOString()}::timestamptz) returning id`;
  synthIds.push(s.id);
  let pos = 0;
  for (const name of o.philosophers ?? []) await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${s.id}, 'philosopher', ${name}, ${pos++})`;
  for (const pid of o.parents ?? []) await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${s.id}, 'synthesis', ${pid}, ${pos++})`;
  pos = 0;
  for (const name of o.categories ?? []) await sql`insert into categories (synthesis_id, name, position) values (${s.id}, ${name}, ${pos++})`;
  pos = 0;
  for (const [term, definition] of o.terms ?? []) await sql`insert into glossary_terms (synthesis_id, term, definition, position) values (${s.id}, ${term}, ${definition}, ${pos++})`;
  await SI.reindexSynthesis(s.id);
  return s.id;
}
const cardIds = (page) => page.$$eval(".catalog-card", (els) => els.map((e) => e.dataset.synthesisId));
const qsOf = (page) => page.evaluate(() => location.search.replace(/^\?/, ""));
/** Дождаться, пока каталог покажет ответ на текущий адрес (карточки, пусто либо ошибка) */
async function settled(page, pred, what, ms = 15000, loose = false) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < ms) {
    last = await page.evaluate((loose) => ({
      qs: location.search.replace(/^\?/, ""),
      // выдача показана И принадлежит текущему адресу (каждая пара адреса есть в строке её запроса)
      shown: (() => {
        const q = document.querySelector('[data-testid="catalog-results"]')?.dataset.query ?? "";
        if (!q) return false;
        if (loose) return true;
        const have = new URLSearchParams(q);
        const addr = new URLSearchParams(location.search);
        // поле без текста живёт только в адресе (в запрос идёт вместе с q)
        for (const [k, v] of addr) if (!(k === "field" && !addr.has("q")) && !have.getAll(k).includes(v)) return false;
        for (const k of have.keys()) if (k !== "scope" && k !== "limit" && !new URLSearchParams(location.search).has(k)) return false;
        return true;
      })(),
      ids: [...document.querySelectorAll(".catalog-card")].map((e) => e.dataset.synthesisId),
      empty: !!document.querySelector('[data-testid="catalog-empty-search"], [data-testid="catalog-empty"]'),
      found: document.querySelector('[data-testid="catalog-found"]')?.dataset.total ?? null,
      match: document.querySelector('[data-testid="catalog-found"]')?.dataset.match ?? null,
    }), loose);
    // выдача принадлежит текущему адресу: data-query пуст, пока каталог ждёт ответа
    if (last.shown && pred(last)) return last;
    await sleep(100);
  }
  throw new Error(`не дождался: ${what} — ${J(last)}`);
}
/** Снимок для глаз: SHOTS=<папка> — необязательный, проверок не несёт */
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };
const typeInto = async (page, sel, value) => { await page.click(sel, { clickCount: 3 }); await page.keyboard.press("Backspace"); if (value) await page.type(sel, value, { delay: 15 }); };

try {
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);
  if (!CHROME) throw new Error("браузер не найден — соберите Chrome 131 по chrome/README.md");
  console.log("■ Сборка клиента (vite build)");
  const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8", env: { ...process.env, VITE_STRIPE_PUBLISHABLE_KEY: "" } });
  ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t182-preview.log");
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", RATE_LIMIT_MAIL_PER_HOUR: "1000", MAIL_TRANSPORT: "console", BILLING_ENFORCE: "false", NOTIFY_SCAN_INTERVAL_MS: "600000" }, "/tmp/t182-server.log");
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "preview");
  const puppeteer = (await import("puppeteer-core")).default;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
  const ver = await browser.version();
  ok(/131\.0\.6778/.test(ver), `браузер Chrome 131 (${ver})`);

  const owner = await account("owner"), other = await account("other");
  const fd = new FormData(); fd.append("file", new Blob([readFileSync(FILE, "utf8")], { type: "text/html" }), `${TAG}.html`);
  const imp = await call("/syntheses/import", { body: fd, cookie: owner.cookie });
  const RU = imp.json?.id;
  ok(!!RU, "импорт образца владельцем", imp.text.slice(0, 200));
  synthIds.push(RU);
  const [ruRow] = await sql`select title from syntheses where id=${RU}`;
  const ruTerms = await sql`select id, term from glossary_terms where synthesis_id=${RU} order by position`;
  const EN = await mkSynth(owner.id, { title: `The Thinking Reed ${TAG}`, seed: "How does finitude ground human freedom?", lang: "English", visibility: "full", method: "hermeneutical", level: "generative",
    capsule: "Freedom emerges from the <b>boundaries</b> of finite existence.", categories: ["Finitude", "Thrownness"], terms: [["Boundary situation", "A limit that reveals existence"]], philosophers: ["Хайдеггер", "Ясперс"], createdAt: "2026-03-10T12:00:00Z" });
  const META = await mkSynth(owner.id, { title: `Meta reed ${TAG}`, lang: "English", visibility: "full", capsule: "A second-order synthesis.", philosophers: ["Платон"], parents: [EN], status: "draft" });
  const SHARED = await mkSynth(other.id, { title: `Общая монада ${TAG}`, visibility: "private", capsule: "Разделённая с рецензентом энтелехия.", philosophers: ["Лейбниц"] });
  await sql`insert into synthesis_members (synthesis_id, user_id, role, status, invited_by, accepted_at) values (${SHARED}, ${owner.id}, 'reviewer', 'active', ${other.id}, now())`;

  /* ── U1 ── */
  console.log("\n■ U1: строка поиска с выбором поля, дебаунс, адрес, подсветка");
  const p = await newPage(owner);
  await p.goto(`${UI}/catalog`, { waitUntil: "networkidle0" });
  await waitSel(p, T("catalog-search-input"));
  let s = await settled(p, (x) => x.ids.includes(RU) && x.ids.includes(EN), "список «Мои»");
  const fieldOpts = await p.$$eval(`${T("catalog-search-field")} option`, (els) => els.map((e) => e.value));
  ok(J(fieldOpts) === J(["title", "seed", "content", "term"]) && s.qs === "" && s.ids.includes(META) && !s.ids.includes(SHARED), "«Мои»: строка поиска с выбором поля (название / зерно / содержание / термин); адрес чист", [fieldOpts, s.qs]);
  ok(!(await p.evaluate(() => [...document.querySelectorAll("button")].some((b) => /Генеалогия/.test(b.textContent ?? "")))) && (await exists(p, T("catalog-filters-toggle"))), "отдельной кнопки «Генеалогия» нет; есть «Фильтры»");
  for (const tab of ["public", "shared", "mine"]) {
    await click(p, T(`catalog-tab-${tab}`));
    await settled(p, (x) => (tab === "mine" ? x.qs === "" : x.qs === `scope=${tab}`), `вкладка ${tab}`);
    if (!(await exists(p, T("catalog-search-input"))) || !(await exists(p, T("catalog-search-field")))) ok(false, `строка поиска на вкладке ${tab}`);
  }
  ok(true, "строка поиска и выбор поля — на всех трёх вкладках; вкладка — в адресе (scope)");
  await typeInto(p, T("catalog-search-input"), "разломы вмещающие");
  const early = await qsOf(p);
  s = await settled(p, (x) => /(^|&)q=/.test(x.qs) && x.found !== null, "поиск по названию");
  const hit = await p.$$eval(`.catalog-card[data-synthesis-id="${RU}"] ${T("search-hit")}`, (els) => els.map((e) => e.textContent));
  const src = await p.$eval(`.catalog-card[data-synthesis-id="${RU}"] ${T("card-fragment")}`, (el) => el.dataset.source).catch(() => null);
  ok(early === "" && new URLSearchParams(s.qs).get("q") === "разломы вмещающие" && !/field=/.test(s.qs), "набор → дебаунс → параметр q адреса (до паузы адрес не менялся; поле по умолчанию не пишется)", [early, s.qs]);
  ok(J(s.ids) === J([RU]) && s.match === "fts" && src === "title" && hit.length > 0 && hit.every((h) => /азлом|мещающ/i.test(h)), "выдача: карточка + фрагмент названия с подсветкой словоформ в <mark>", [s, src, hit]);
  const hitStyle = await p.$eval(T("search-hit"), (el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, color: c.color, radius: c.borderRadius }; });
  ok(hitStyle.bg !== "rgb(255, 255, 0)" && hitStyle.radius === "0px", "подсветка — в палитре кита (не жёлтый UA-mark, углы прямые)", hitStyle);

  // разметка в тексте документа не становится разметкой страницы
  await p.select(T("catalog-search-field"), "content");
  await typeInto(p, T("catalog-search-input"), "boundary");
  s = await settled(p, (x) => x.qs.includes("q=boundary") && x.qs.includes("field=content") && x.ids.includes(EN), "поиск по содержанию");
  const fr = await p.$eval(`.catalog-card[data-synthesis-id="${EN}"] ${T("card-fragment")}`, (el) => ({ source: el.dataset.source, text: el.textContent, tags: [...el.querySelectorAll("*")].map((e) => e.tagName).filter((t) => !["SPAN", "MARK"].includes(t)), marks: [...el.querySelectorAll("mark")].map((m) => m.textContent) }));
  await shot(p, "1-content");
  ok(fr.source === "capsule" && fr.marks.some((m) => /boundaries/i.test(m)) && fr.tags.length === 0, "содержание: фрагмент капсулы, boundary → boundaries; внутри фрагмента только текст и <mark>", fr);

  /* ── U2 ── */
  console.log("\n■ U2: опечатка — «похожие»");
  await p.select(T("catalog-search-field"), "title");
  await typeInto(p, T("catalog-search-input"), "вмищающий розлом");
  s = await settled(p, (x) => x.match === "fuzzy", "запасной ход");
  await shot(p, "2-fuzzy");
  const fuzzyCls = await p.$eval(`.catalog-card[data-synthesis-id="${RU}"] ${T("search-hit")}`, (el) => el.className);
  ok(s.ids.includes(RU) && (await exists(p, T("catalog-fuzzy"))) && /fuzzy/.test(fuzzyCls), "точного совпадения нет → находки названы «похожими» (полоса + свой вид подсветки)", [s, fuzzyCls]);

  /* ── U3 ── */
  console.log("\n■ U3: поле «термин» → переход прямо к термину");
  const target = ruTerms[Math.min(ruTerms.length - 1, Math.floor(ruTerms.length / 2))];
  const base = target.term.replace(/\s*\([^()]*\)\s*$/, "");
  await p.select(T("catalog-search-field"), "term");
  await typeInto(p, T("catalog-search-input"), base);
  s = await settled(p, (x) => x.qs.includes("field=term") && x.match === "exact" && x.ids.includes(RU), "поиск термина");
  const termLine = await p.$eval(`.catalog-card[data-synthesis-id="${RU}"] ${T("card-term")}`, (el) => ({ id: el.dataset.termId, text: el.textContent }));
  const href = await p.$eval(`.catalog-card[data-synthesis-id="${RU}"]`, (el) => el.getAttribute("href"));
  ok(termLine.id === target.id && termLine.text.includes(target.term) && href.startsWith(`/synthesis/${RU}?term=${target.id}&termKey=`), "карточка называет найденный термин и ведёт к нему (id и ключ имени в ссылке)", [termLine, href]);
  const backQs = await qsOf(p);
  await click(p, `.catalog-card[data-synthesis-id="${RU}"]`);
  await waitSel(p, T("term-focus"), 30000);
  await sleep(1200);
  const tf = await p.evaluate(() => {
    const f = document.querySelector('[data-testid="term-focus"]');
    const r = f.getBoundingClientRect();
    const rows = [...document.querySelectorAll("tr")].filter((tr) => { const b = tr.getBoundingClientRect(); return b.height > 0 && Math.abs(b.top - r.top) < 6 && Math.abs(b.height - r.height) < 12; });
    return { key: f.dataset.termKey, top: r.top, h: r.height, w: r.width, vh: innerHeight, rowText: rows[0]?.querySelector("td")?.textContent ?? null, pe: getComputedStyle(f).pointerEvents };
  });
  await shot(p, "3-term-focus");
  ok(tf.top >= 0 && tf.top + tf.h <= tf.vh && tf.w > 200 && tf.h > 10 && tf.pe === "none", "страница концепции прокручена к термину: рамка в окне и не перехватывает клики", tf);
  ok((tf.rowText ?? "").trim() === target.term, "рамка стоит на строке именно найденного термина", [tf.rowText, target.term]);
  ok(!(await exists(p, T("term-focus-missing"))) && p.errors.length === 0, "выноски «термин не найден» нет; ошибок страницы нет", p.errors);
  await p.goBack({ waitUntil: "networkidle0" });
  s = await settled(p, (x) => x.ids.includes(RU) && x.match === "exact", "возврат в каталог");
  ok(s.qs === backQs && (await p.$eval(T("catalog-search-input"), (el) => el.value)) === base && (await p.$eval(T("catalog-search-field"), (el) => el.value)) === "term", "«назад» возвращает прежний поиск (текст, поле, выдача)", [s.qs, backQs]);
  // термина больше нет → выноска, а не тихая пустота
  await p.goto(`${UI}/synthesis/${RU}?term=00000000-0000-4000-8000-000000000000&termKey=${encodeURIComponent("нет такого термина")}`, { waitUntil: "networkidle0" });
  await waitSel(p, T("term-focus-missing"), 30000);
  ok(!(await exists(p, T("term-focus"))), "термина из ссылки в документе нет → выноска, рамки нет");

  /* ── U4 ── */
  console.log("\n■ U4: панель фильтров");
  await p.goto(`${UI}/catalog`, { waitUntil: "networkidle0" });
  await settled(p, (x) => x.ids.includes(RU), "каталог");
  await click(p, T("catalog-filters-toggle"));
  await waitSel(p, T("catalog-filters"));
  const organs = {};
  for (const id of ["filter-phil-input", "filter-phil-mode", "filter-phil-area", "filter-epochs", "filter-method", "filter-level", "filter-depth", "filter-lang", "filter-meta", "filter-status", "filter-date-from", "filter-date-to", "filters-reset"]) organs[id] = await exists(p, T(id));
  ok(Object.values(organs).every(Boolean), "панель: философы, все/любой, прямые/родословная, эпоха, метод, уровень, язык, мета, статус, дата, сброс", organs);
  const dl = await p.$eval(T("filter-phil-input"), (el) => { const d = document.getElementById(el.getAttribute("list")); return { n: d?.querySelectorAll("option").length ?? 0, has: [...(d?.querySelectorAll("option") ?? [])].some((o) => o.value === "Хайдеггер") }; });
  ok(dl.n > 50 && dl.has, "философы — с подсказками (datalist, значения — машинные имена)", dl);
  await p.type(T("filter-phil-input"), "Хайдеггер");
  await p.keyboard.press("Enter");
  s = await settled(p, (x) => x.qs.includes("philosopher="), "фильтр философа");
  ok(new URLSearchParams(s.qs).get("philosopher") === "Хайдеггер" && s.ids.includes(EN) && !s.ids.includes(META), "философ (прямые участники): находит концепцию с Хайдеггером, мета-синтез — нет", s);
  await p.select(T("filter-phil-area"), "lineage");
  s = await settled(p, (x) => x.qs.includes("philArea=lineage") && x.ids.includes(META), "родословная");
  ok(s.ids.includes(META) && s.ids.includes(EN), "область «родословная»: мета-синтез находится по философу родителя — прежний поиск по генеалогии стал фильтром", s);
  await p.type(T("filter-phil-input"), "Платон");
  await click(p, T("filter-phil-add"));
  s = await settled(p, (x) => (x.qs.match(/philosopher=/g) ?? []).length === 2 && !x.ids.includes(EN), "два философа, все");
  ok(J(s.ids) === J([META]) && (await count(p, `${T("filter-phil-chips")} button`)) === 2, "два философа, режим «все»: только концепция, в чьей родословной оба", s);
  await p.select(T("filter-phil-mode"), "any");
  s = await settled(p, (x) => x.qs.includes("philMode=any") && x.ids.includes(EN), "любой");
  await shot(p, "4-filters");
  ok(s.ids.includes(EN) && s.ids.includes(META), "режим «любой» шире", s);
  const active1 = await p.$eval(T("filters-active-count"), (el) => el.textContent);
  await click(p, T("filters-reset"));
  s = await settled(p, (x) => x.qs === "" && x.ids.includes(RU), "сброс");
  ok(/1/.test(active1) && (await count(p, `${T("filter-phil-chips")} button`).catch(() => 0)) === 0, "счёт активных фильтров (философы — один фильтр) и сброс возвращает чистый адрес", [active1, s.qs]);
  await p.select(T("filter-method"), "hermeneutical");
  s = await settled(p, (x) => x.qs === "method=hermeneutical", "метод");
  const m1 = s.ids;
  await p.select(T("filter-level"), "generative");
  await p.select(T("filter-lang"), "English");
  await p.select(T("filter-meta"), "false");
  s = await settled(p, (x) => x.qs === "method=hermeneutical&synthLevel=generative&lang=English&meta=false", "метод+уровень+язык+мета");
  ok(J(m1) === J([EN]) && J(s.ids) === J([EN]), "метод, уровень, язык, мета — вместе; имена параметров адреса — как у маршрута", s);
  await click(p, T("filters-reset"));
  await settled(p, (x) => x.qs === "", "сброс 2");
  await p.select(T("filter-status"), "draft");
  s = await settled(p, (x) => x.qs === "status=draft", "статус");
  ok(J(s.ids) === J([META]), "статус (на «моих»): черновик", s);
  await click(p, T("filters-reset"));
  await settled(p, (x) => x.qs === "", "сброс 3");
  await setValue(p, T("filter-date-from"), "2026-03-10");
  await setValue(p, T("filter-date-to"), "2026-03-10");
  s = await settled(p, (x) => x.qs === "dateFrom=2026-03-10&dateTo=2026-03-10", "дата");
  ok(J(s.ids) === J([EN]), "дата создания (на «моих»), обе границы включены", s);
  const epochBoxes = await count(p, `${T("filter-epochs")} input[type="checkbox"]`);
  await click(p, T("filters-reset"));
  await settled(p, (x) => x.qs === "", "сброс 4");
  const idxAnt = await p.$$eval(`${T("filter-epochs")} label`, (els) => els.findIndex((l) => /Антич/i.test(l.textContent ?? "")));
  await p.$$eval(`${T("filter-epochs")} input[type="checkbox"]`, (els, i) => els[i < 0 ? 0 : i].click(), idxAnt);
  s = await settled(p, (x) => /^epoch=\d+$/.test(x.qs), "эпоха");
  ok(epochBoxes >= 5 && s.ids.includes(META) && !s.ids.includes(EN), "эпоха: концепция с философом эпохи среди прямых участников (Платон → мета-синтез)", [epochBoxes, s]);
  // статус и дата — только на «моих»
  await click(p, T("catalog-tab-public"));
  s = await settled(p, (x) => x.qs.startsWith("scope=public"), "публичные");
  ok(!(await exists(p, T("filter-status"))) && !(await exists(p, T("filter-date-from"))) && (await exists(p, T("filter-method"))) && /epoch=/.test(s.qs), "на «Публичных» статуса и даты в панели нет; общий фильтр (эпоха) пережил смену вкладки", s.qs);

  /* ── U5 ── */
  console.log("\n■ U5: состояние поиска — в адресной строке");
  const share = `${UI}/catalog?q=freedom&field=content&philosopher=${encodeURIComponent("Ясперс")}&method=hermeneutical&lang=English`;
  const p2 = await newPage(owner);
  await p2.goto(share, { waitUntil: "networkidle0" });
  let s2 = await settled(p2, (x) => x.found !== null, "поиск по ссылке");
  const ui2 = await p2.evaluate(() => ({ q: document.querySelector('[data-testid="catalog-search-input"]').value, field: document.querySelector('[data-testid="catalog-search-field"]').value, toggle: document.querySelector('[data-testid="catalog-filters-toggle"]').textContent, panel: !!document.querySelector('[data-testid="catalog-filters"]') }));
  ok(J(s2.ids) === J([EN]) && ui2.q === "freedom" && ui2.field === "content" && /· 3/.test(ui2.toggle), "ссылка открывает тот же поиск: текст, поле, выдача; кнопка «Фильтры» называет число активных", [s2, ui2]);
  if (!ui2.panel) await click(p2, T("catalog-filters-toggle"));
  await waitSel(p2, T("catalog-filters"));
  const ui3 = await p2.evaluate(() => ({ method: document.querySelector('[data-testid="filter-method"]').value, lang: document.querySelector('[data-testid="filter-lang"]').value, chips: [...document.querySelectorAll('[data-testid="filter-phil-chips"] [data-philosopher]')].map((b) => b.dataset.philosopher) }));
  ok(ui3.method === "hermeneutical" && ui3.lang === "English" && J(ui3.chips) === J(["Ясперс"]), "органы панели показывают состояние из адреса", ui3);
  await click(p2, T("catalog-tab-public"));
  await settled(p2, (x) => x.qs.startsWith("scope=public") && x.found !== null, "вкладка");
  await p2.goBack();
  s2 = await settled(p2, (x) => !x.qs.includes("scope=") && x.found !== null, "назад");
  ok(s2.qs === share.split("?")[1] && J(s2.ids) === J([EN]), "«назад» возвращает прежний поиск", s2.qs);
  await p2.goto(`${UI}/catalog?field=theses&q=reed&epoch=99&meta=${encodeURIComponent("да")}&sort=cost&dateFrom=2026-13-40`, { waitUntil: "networkidle0" });
  s2 = await settled(p2, (x) => x.found !== null, "ссылка с мусором", 15000, true);
  ok(s2.ids.includes(EN) && !(await exists(p2, T("catalog-error"))), "ссылка, поправленная руками, не роняет каталог (негодное отброшено)", s2);

  /* ── U6 ── */
  console.log("\n■ U6: потомки концепции — фильтр панели");
  await p2.goto(`${UI}/catalog?descendantsOf=${EN}`, { waitUntil: "networkidle0" });
  s2 = await settled(p2, (x) => x.ids.length > 0, "потомки");
  if (!(await exists(p2, T("catalog-filters")))) await click(p2, T("catalog-filters-toggle"));
  await waitSel(p2, T("filter-descendants-chip"));
  let chip = "";
  for (let i = 0; i < 50; i++) { chip = await text(p2, T("filter-descendants-chip")); if (chip.includes("Thinking Reed")) break; await sleep(100); }
  ok(J(s2.ids) === J([META]) && chip.includes(`The Thinking Reed ${TAG}`) && !(await exists(p2, ".catalog-filter-bar")), "ссылка «Потомки в каталоге»: выдача — потомки, фильтр назван именем концепции; прежней плашки нет", [s2.ids, chip]);
  await click(p2, T("filter-descendants-remove"));
  s2 = await settled(p2, (x) => x.qs === "" && x.ids.includes(EN), "фильтр снят");
  ok(!(await exists(p2, T("filter-descendants-chip"))), "✕ снимает фильтр потомков");

  /* ── U7 ── */
  console.log("\n■ U7: пустая выдача");
  await p2.goto(`${UI}/catalog?q=${encodeURIComponent("кантианство платонизм")}&philosopher=${encodeURIComponent("Гегель")}&philosopher=${encodeURIComponent("Кант")}&method=creative`, { waitUntil: "networkidle0" });
  await waitSel(p2, T("catalog-empty-search"));
  const empty = await p2.$eval(T("catalog-empty-search"), (el) => ({ text: el.textContent, hints: el.querySelectorAll("li").length, btns: [...el.querySelectorAll("button")].map((b) => b.dataset.testid) }));
  ok(empty.hints >= 4 && /любого/.test(empty.text) && /родословн/.test(empty.text) && empty.btns.includes("catalog-empty-reset") && empty.btns.includes("catalog-empty-clear-text"), "пустая выдача: сообщение с подсказками, чем ослабить условия, и кнопками сброса", empty);
  await shot(p2, "7-empty");
  await click(p2, T("catalog-empty-reset"));
  s2 = await settled(p2, (x) => !x.qs.includes("philosopher") && !x.qs.includes("method"), "сброс из пустой выдачи");
  ok(new URLSearchParams(s2.qs).get("q") === "кантианство платонизм", "«Сбросить фильтры» из пустой выдачи: фильтры сняты, текст остался", s2.qs);
  ok(p2.errors.length === 0 && p.errors.length === 0, "ошибок страницы нет", [...p.errors, ...p2.errors]);

  /* ── U8 ── */
  console.log("\n■ U8: гость на «/explore»");
  const g = await newPage(null);
  await g.goto(`${UI}/explore?scope=mine&status=draft`, { waitUntil: "networkidle0" });
  let sg = await settled(g, (x) => x.ids.includes(EN), "витрина гостя", 15000, true);
  ok(!sg.ids.includes(RU) && (await count(g, '[data-testid^="catalog-tab-"]')) === 0 && (await exists(g, T("catalog-search-input"))) && !(await exists(g, T("catalog-error"))), "гость: публичное показано, вкладок нет, строка поиска есть; scope=mine из адреса не прочитан (401 нет)", sg);
  await click(g, T("catalog-filters-toggle"));
  await waitSel(g, T("catalog-filters"));
  ok(!(await exists(g, T("filter-status"))) && !(await exists(g, T("filter-date-from"))) && (await exists(g, T("filter-phil-area"))), "гостю в панели — общие фильтры без статуса и даты");
  await g.type(T("filter-phil-input"), "Платон");
  await g.keyboard.press("Enter");
  await g.select(T("filter-phil-area"), "lineage");
  sg = await settled(g, (x) => x.qs.includes("philArea=lineage") && x.ids.includes(META), "родословная гостю");
  ok(sg.ids.includes(META), "фильтр родословной работает и гостю", sg);
  await click(g, T("filters-reset"));
  await g.select(T("catalog-search-field"), "content");
  await typeInto(g, T("catalog-search-input"), "boundary");
  sg = await settled(g, (x) => x.qs.includes("q=boundary") && x.found !== null, "поиск гостя по содержанию");
  ok(sg.ids.includes(EN) && (await count(g, T("search-hit"))) > 0 && g.errors.length === 0, "гость ищет по содержанию публичного, фрагмент с подсветкой", [sg, g.errors]);

  /* ── U9 ── */
  console.log("\n■ U9: «Со мной поделились»");
  await p.goto(`${UI}/catalog?scope=shared`, { waitUntil: "networkidle0" });
  s = await settled(p, (x) => x.ids.includes(SHARED), "поделились");
  const role = await text(p, `.catalog-card[data-synthesis-id="${SHARED}"] ${T("card-my-role")}`);
  ok(J(s.ids) === J([SHARED]) && role.length > 2 && !(await exists(p, `.catalog-card[data-synthesis-id="${SHARED}"] ${T("card-actions")}`)), "вкладка «Со мной поделились» — тем же маршрутом, с бейджем роли и без действий владельца", [s.ids, role]);
  await typeInto(p, T("catalog-search-input"), "монада");
  s = await settled(p, (x) => x.qs.includes("q=") && x.found !== null, "поиск в «поделились»");
  ok(J(s.ids) === J([SHARED]) && (await count(p, T("search-hit"))) > 0, "поиск работает и на «Со мной поделились»", s);
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
} finally {
  console.log(`\nИТОГ: ${passed} ✓, ${failed} ✗${fails.length ? "\n  " + fails.join("\n  ") : ""}`);
  try { await browser?.close(); } catch {}
  for (const p of procs) { try { process.kill(-p.pid, "SIGKILL"); } catch {} }
  try {
    for (const id of synthIds) await sql`delete from syntheses where id=${id}`;
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
