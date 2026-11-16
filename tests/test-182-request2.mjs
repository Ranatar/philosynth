/**
 * Беседа 18.2, тестовый запрос (07): «Протестируй в браузере (Chrome 131,
 * сборка клиента): каждое поле поиска на трёх вкладках, комбинации
 * фильтров, ссылка с параметрами открывает тот же поиск, переход от
 * найденного термина к термину в документе; гость видит только публичное».
 * Сервер :3000 без мока (все шаги бесплатные), клиент — vite build + preview.
 *
 *   T1 каждое поле (название / зерно / содержание / термин) на каждой из
 *      трёх вкладок: находится своё, фрагмент назван источником, совпадение
 *      подсвечено; чужое приватное не находится нигде; витрина ищется по
 *      названию, зерну и капсуле — не по терминам и определениям;
 *   T2 комбинации фильтров — органами панели и ссылкой: философы
 *      (все/любой, прямые/родословная), эпоха, метод, уровень, глубина
 *      (Д-89), язык, мета, потомки, статус, дата; выдача ≡ ожидаемой и
 *      ≡ ответу сервера на те же параметры; счёт фильтров; пагинация;
 *   T3 ссылка с параметрами открывает тот же поиск: в новой вкладке
 *      браузера, другому пользователю (его списки), гостю на «/explore»;
 *      органы показывают состояние адреса; «назад/вперёд»;
 *   T4 переход к термину: владелец, участник-рецензент, гость на публичной;
 *      устаревший id при верном ключе; термина нет — выноска;
 *   T5 гость видит только публичное: «/explore», все поля, фильтры без
 *      статуса и даты, «/catalog» гостю закрыт, приватное по ссылке — 403;
 *   T6 язык интерфейса: панель на en и de (переводы утверждены).
 *
 * Запуск (из корня; PG/Redis подняты, порты 3000 и 5283 свободны):
 *   node_modules/.bin/tsx tests/test-182-request2.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import postgres from "postgres";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5283;
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
const TAG = "t182b-" + Math.random().toString(36).slice(2, 6);
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
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t182b-preview.log");
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", RATE_LIMIT_MAIL_PER_HOUR: "1000", MAIL_TRANSPORT: "console", BILLING_ENFORCE: "false", NOTIFY_SCAN_INTERVAL_MS: "600000" }, "/tmp/t182b-server.log");
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "preview");
  const puppeteer = (await import("puppeteer-core")).default;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
  const ver = await browser.version();
  ok(/131\.0\.6778/.test(ver), `браузер Chrome 131 (${ver})`);


  const owner = await account("owner"), other = await account("other");
  const importAs = async (who, name) => {
    const fd = new FormData(); fd.append("file", new Blob([readFileSync(FILE, "utf8")], { type: "text/html" }), `${TAG}-${name}.html`);
    const r = await call("/syntheses/import", { body: fd, cookie: who.cookie });
    if (!r.json?.id) throw new Error(`импорт ${name}: ${r.text.slice(0, 200)}`);
    synthIds.push(r.json.id);
    return r.json.id;
  };
  const setDepth = (id, depth) => sql`update syntheses set depth=${depth} where id=${id}`;
  // ── данные ──
  const DOC_MINE = await importAs(owner, "mine");            // приватный полный документ владельца
  const DOC_SHARED = await importAs(other, "shared");        // чужой приватный, владелец пробы — рецензент
  const DOC_PUBLIC = await importAs(other, "public");        // чужой публичный (полный)
  await sql`update syntheses set visibility='full' where id=${DOC_PUBLIC}`;
  await sql`insert into synthesis_members (synthesis_id, user_id, role, status, invited_by, accepted_at) values (${DOC_SHARED}, ${owner.id}, 'reviewer', 'active', ${other.id}, now())`;
  for (const id of [DOC_SHARED, DOC_PUBLIC]) await SI.reindexSynthesis(id);
  const MINE = await mkSynth(owner.id, { title: `Зеркало апорий ${TAG}`, seed: "Может ли сомнение стать основанием?", capsule: "Скепсис оборачивается атараксией.", categories: ["Сомнение"], terms: [["Эпохе", "Воздержание от суждения"]], philosophers: ["Декарт", "Юм"], method: "analytical", level: "transformative", createdAt: "2026-02-02T10:00:00Z" });
  await setDepth(MINE, "deep");
  const OWN_PUB = await mkSynth(owner.id, { title: `The Thinking Reed ${TAG}`, seed: "How does finitude ground human freedom?", lang: "English", visibility: "full", method: "hermeneutical", level: "generative", capsule: "Freedom emerges from the boundaries of finite existence.", terms: [["Boundary situation", "A limit that reveals existence"]], philosophers: ["Хайдеггер", "Ясперс"], createdAt: "2026-03-10T12:00:00Z" });
  await setDepth(OWN_PUB, "overview");
  const META = await mkSynth(owner.id, { title: `Meta reed ${TAG}`, lang: "English", visibility: "full", capsule: "A second-order synthesis.", philosophers: ["Платон"], parents: [OWN_PUB], status: "draft" });
  await setDepth(META, "exhaustive");
  const SH = await mkSynth(other.id, { title: `Общая монада ${TAG}`, seed: "Что связывает монады между собой?", capsule: "Предустановленная гармония субстанций.", terms: [["Энтелехия", "Внутренняя цель вещи"]], philosophers: ["Лейбниц"] });
  await sql`insert into synthesis_members (synthesis_id, user_id, role, status, invited_by, accepted_at) values (${SH}, ${owner.id}, 'reviewer', 'active', ${other.id}, now())`;
  const PUBF = await mkSynth(other.id, { title: `Открытый горизонт ${TAG}`, seed: "Где проходит граница понимания?", visibility: "full", capsule: "Герменевтический круг размыкается.", terms: [["Предпонимание", "Исходное толкование текста"]], philosophers: ["Гадамер"] });
  const SHOW = await mkSynth(other.id, { title: `Витрина логоса ${TAG}`, seed: "Что показывает слово?", visibility: "showcase", capsule: "Логос явлен на витрине.", categories: ["Явленность"], terms: [["Апофансис", "Высказывающая речь"]], philosophers: ["Аристотель"] });
  const PRIV = await mkSynth(other.id, { title: `Тайная монада ${TAG}`, seed: "Возможен ли апокатастасис?", capsule: "Сокровенная энтелехия души.", terms: [["Метемпсихоз", "Странствие души"]], philosophers: ["Лейбниц"] });
  const SERIES = [];
  for (let i = 1; i <= 21; i++) SERIES.push(await mkSynth(owner.id, { title: `Вереница ${TAG} ${String(i).padStart(2, "0")}`, philosophers: ["Спиноза"], createdAt: `2025-01-${String(i).padStart(2, "0")}T00:00:00Z` }));
  const MY = new Set([DOC_MINE, DOC_SHARED, DOC_PUBLIC, MINE, OWN_PUB, META, SH, PUBF, SHOW, PRIV]);
  const NAME = new Map([[DOC_MINE, "DOC_MINE"], [DOC_SHARED, "DOC_SHARED"], [DOC_PUBLIC, "DOC_PUBLIC"], [MINE, "MINE"], [OWN_PUB, "OWN_PUB"], [META, "META"], [SH, "SH"], [PUBF, "PUBF"], [SHOW, "SHOW"], [PRIV, "PRIV"]]);
  /** Имена концепций пробы среди показанных (чужие данные базы и «Вереница» отброшены), по алфавиту */
  const mineOf = (ids) => ids.filter((id) => MY.has(id)).map((id) => NAME.get(id)).sort();
  const same = (ids, expected) => J(mineOf(ids)) === J([...expected].sort());
  const docTerms = await sql`select id, term from glossary_terms where synthesis_id=${DOC_MINE} order by position`;
  const [docRow] = await sql`select title, seed from syntheses where id=${DOC_MINE}`;
  ok(docTerms.length > 3 && !!docRow.title, "образец импортирован трижды (свой, разделённый, публичный); термины на месте", docTerms.length);
  /** Ответ сервера на ту же строку параметров (ожидаемое «по серверу») */
  const serverIds = async (who, qs) => {
    const r = await call(`/syntheses/search?${qs}${qs.includes("limit=") ? "" : "&limit=100"}`, { method: "GET", cookie: who?.cookie });
    return { status: r.status, ids: (r.json?.items ?? []).map((i) => i.id), total: r.json?.total, match: r.json?.match };
  };
  const cardInfo = (page, id) => page.$eval(`.catalog-card[data-synthesis-id="${id}"]`, (el) => ({
    href: el.getAttribute("href"),
    source: el.querySelector('[data-testid="card-fragment"]')?.dataset.source ?? null,
    hits: [...el.querySelectorAll('[data-testid="search-hit"]')].map((m) => m.textContent),
    term: el.querySelector('[data-testid="card-term"]')?.dataset.termId ?? null,
    alien: [...(el.querySelector('[data-testid="card-fragment"]')?.querySelectorAll("*") ?? [])].map((e) => e.tagName).filter((t) => t !== "SPAN" && t !== "MARK"),
  })).catch(() => null);
  const openCatalog = async (page, path, pred = () => true, loose = false) => { await page.goto(`${UI}${path}`, { waitUntil: "networkidle0" }); return settled(page, pred, path, 20000, loose); };

  /* ── T1 ── */
  console.log("\n■ T1: каждое поле поиска на каждой из трёх вкладок");
  const p = await newPage(owner);
  await openCatalog(p, "/catalog");
  // [вкладка, поле, текст, кого найти, чего не должно быть, источник фрагмента, слово подсветки]
  const CELLS = [
    ["mine", "title", "апорий", ["MINE"], ["SH", "PUBF", "PRIV"], "title", /апори/i],
    ["mine", "seed", "сомнение", ["MINE"], ["SH", "PRIV"], "seed", /сомнени/i],
    ["mine", "content", "атараксия", ["MINE"], ["PRIV"], "capsule", /атаракси/i],
    ["mine", "content", "воздержание", ["MINE"], ["PRIV"], "term", /воздержани/i],
    ["mine", "term", "эпохе", ["MINE"], ["PRIV"], "term", /эпохе/i],
    ["shared", "title", "монада", ["SH"], ["PRIV", "MINE"], "title", /монад/i],
    ["shared", "seed", "монады", ["SH"], ["PRIV"], "seed", /монад/i],
    ["shared", "content", "гармония", ["SH"], ["PRIV"], "capsule", /гармони/i],
    ["shared", "content", "энтелехия", ["SH"], ["PRIV"], "term", /энтелехи/i],
    ["shared", "term", "Энтелехия", ["SH"], ["PRIV"], "term", /энтелехи/i],
    ["public", "title", "горизонт", ["PUBF"], ["MINE", "SH", "PRIV"], "title", /горизонт/i],
    ["public", "seed", "понимания", ["PUBF"], ["PRIV"], "seed", /понимани/i],
    ["public", "content", "герменевтический", ["PUBF"], ["PRIV"], "capsule", /герменевтическ/i],
    ["public", "term", "предпонимание", ["PUBF"], ["PRIV"], "term", /предпонимани/i],
    // витрина: название, зерно, капсула — да; термин и определение — нет
    ["public", "title", "логоса", ["SHOW"], ["PRIV"], "title", /логос/i],
    ["public", "seed", "слово", ["SHOW"], ["PRIV"], "seed", /слово/i],
    ["public", "content", "витрине", ["SHOW"], ["PRIV"], "capsule", /витрин/i],
    ["public", "content", "высказывающая", [], ["SHOW", "PRIV"], null, null],
    ["public", "term", "апофансис", [], ["SHOW", "PRIV"], null, null],
    // чужое приватное не находится ни на одной вкладке ни одним полем
    ["mine", "title", "тайная", [], ["PRIV"], null, null],
    ["public", "content", "сокровенная", [], ["PRIV"], null, null],
    ["shared", "term", "метемпсихоз", [], ["PRIV"], null, null],
    ["public", "term", "метемпсихоз", [], ["PRIV"], null, null],
  ];
  let curTab = "mine";
  const cellFails = [];
  for (const [tab, field, textQ, want, never, source, hitRe] of CELLS) {
    if (tab !== curTab) { await click(p, T(`catalog-tab-${tab}`)); curTab = tab; await settled(p, (x) => (tab === "mine" ? !x.qs.includes("scope=") : x.qs.includes(`scope=${tab}`)), `вкладка ${tab}`); }
    if ((await p.$eval(T("catalog-search-field"), (el) => el.value)) !== field) await p.select(T("catalog-search-field"), field);
    await typeInto(p, T("catalog-search-input"), textQ);
    const s = await settled(p, (x) => new URLSearchParams(x.qs).get("q") === textQ && (new URLSearchParams(x.qs).get("field") ?? "title") === field, `${tab}/${field}/${textQ}`);
    const got = mineOf(s.ids);
    const exact = s.match !== "fuzzy";
    const problems = [];
    for (const w of want) if (!got.includes(w)) problems.push(`нет ${w}`);
    for (const n of never) if (got.includes(n)) problems.push(`есть ${n}`);
    // «не находится»: точного совпадения быть не должно (похожее запасного хода — не находка по этому слову)
    if (want.length === 0 && exact && got.length > 0) problems.push(`лишнее ${got.join()}`);
    if (want.length && !exact) problems.push("найдено только «похожее»");
    for (const w of want) {
      const id = [...NAME.entries()].find(([, n]) => n === w)[0];
      const c = await cardInfo(p, id);
      if (!c) { problems.push(`нет карточки ${w}`); continue; }
      if (c.source !== source) problems.push(`источник ${c.source} ≠ ${source}`);
      if (!c.hits.some((h) => hitRe.test(h))) problems.push(`подсветка ${J(c.hits)}`);
      if (c.alien.length) problems.push(`разметка во фрагменте ${c.alien.join()}`);
      if (source === "term" && !c.term) problems.push("карточка без строки термина");
      // совпадение в термине или его определении несёт id термина и при поиске по содержанию — карточка ведёт к нему
      if ((source === "term") !== /[?&]term=/.test(c.href ?? "")) problems.push(`ссылка к термину при источнике ${source}: ${c.href}`);
    }
    // выдача страницы ≡ ответу сервера на её же адрес
    const srv = await serverIds(owner, `scope=${tab}&q=${encodeURIComponent(textQ)}&field=${field}`);
    if (J(mineOf(srv.ids)) !== J(got)) problems.push(`страница ${got.join()} ≠ серверу ${mineOf(srv.ids).join()}`);
    if (problems.length) cellFails.push([tab, field, textQ, ...problems]);
  }
  const cellsOf = (tab) => CELLS.filter((c) => c[0] === tab).length;
  ok(cellFails.filter((c) => c[0] === "mine").length === 0, `«Мои»: ${cellsOf("mine")} клеток — четыре поля находят своё с фрагментом и подсветкой`, cellFails.filter((c) => c[0] === "mine"));
  ok(cellFails.filter((c) => c[0] === "shared").length === 0, `«Со мной поделились»: ${cellsOf("shared")} клеток — четыре поля, рецензенту открыто содержание`, cellFails.filter((c) => c[0] === "shared"));
  ok(cellFails.filter((c) => c[0] === "public").length === 0, `«Публичные»: ${cellsOf("public")} клеток — четыре поля; витрина — название, зерно, капсула, но не термины и определения`, cellFails.filter((c) => c[0] === "public"));
  ok(!cellFails.some((c) => c.some((x) => /есть PRIV/.test(String(x)))), "чужая приватная концепция не найдена ни одним полем ни на одной вкладке");
  // образец: настоящий документ, все четыре поля на «моих»
  await click(p, T("catalog-tab-mine"));
  await settled(p, (x) => !x.qs.includes("scope="), "мои");
  const titleWord = docRow.title.split(/\s+/).filter((w) => w.length > 5)[0];
  const seedWord = (docRow.seed ?? "").split(/[^\p{L}]+/u).filter((w) => w.length > 6)[0];
  const sampleCells = [["title", titleWord], ...(seedWord ? [["seed", seedWord]] : []), ["term", docTerms[1].term.replace(/\s*\([^()]*\)\s*$/, "")]];
  const sampleBad = [];
  for (const [field, textQ] of sampleCells) {
    await p.select(T("catalog-search-field"), field);
    await typeInto(p, T("catalog-search-input"), textQ);
    const s = await settled(p, (x) => new URLSearchParams(x.qs).get("q") === textQ && (new URLSearchParams(x.qs).get("field") ?? "title") === field, `образец ${field}`);
    const c = await cardInfo(p, DOC_MINE);
    if (!s.ids.includes(DOC_MINE) || !c || c.hits.length === 0) sampleBad.push([field, textQ, mineOf(s.ids), c]);
    if (s.ids.includes(DOC_SHARED) || s.ids.includes(DOC_PUBLIC)) sampleBad.push([field, "чужой документ на «моих»"]);
  }
  ok(sampleBad.length === 0, `образец (импортированный документ): ${sampleCells.map((c) => c[0]).join(", ")} — находится, подсвечено`, sampleBad);
  ok(p.errors.length === 0, "T1: ошибок страницы нет", p.errors);

  /* ── T2 ── */
  console.log("\n■ T2: комбинации фильтров");
  // ссылкой: [адрес, ожидаемые концепции пробы, число активных фильтров на кнопке]
  const eOf = async (name) => (await import("@philosynth/shared/constants/philosophers")).PHILOSOPHER_EPOCHS.findIndex((e) => e.philosophers.includes(name));
  const eHeid = await eOf("Хайдеггер"), ePlato = await eOf("Платон"), eDesc = await eOf("Декарт");
  const ph = (n) => `philosopher=${encodeURIComponent(n)}`;
  const COMBOS = [
    [`${ph("Декарт")}&${ph("Юм")}`, ["MINE"], 1],
    [`${ph("Декарт")}&${ph("Хайдеггер")}`, [], 1],
    [`${ph("Декарт")}&${ph("Хайдеггер")}&philMode=any`, ["MINE", "OWN_PUB"], 1],
    [`${ph("Хайдеггер")}`, ["OWN_PUB"], 1],
    [`${ph("Хайдеггер")}&philArea=lineage`, ["OWN_PUB", "META"], 1],
    [`${ph("Хайдеггер")}&${ph("Платон")}&philArea=lineage`, ["META"], 1],
    [`${ph("Хайдеггер")}&philArea=lineage&meta=true`, ["META"], 2],
    [`${ph("Хайдеггер")}&philArea=lineage&meta=false`, ["OWN_PUB"], 2],
    [`epoch=${eHeid}&lang=English`, ["OWN_PUB"], 2],
    [`epoch=${ePlato}&epoch=${eDesc}`, ["META", "MINE"], 1],
    [`epoch=${eHeid}&philArea=lineage&lang=English`, ["OWN_PUB", "META"], 2],
    [`method=analytical&synthLevel=transformative&depth=deep`, ["MINE"], 3],
    [`method=analytical&depth=overview`, [], 2],
    [`depth=overview`, ["OWN_PUB"], 1],
    [`depth=exhaustive&meta=true&status=draft`, ["META"], 3],
    [`lang=English&status=ready`, ["OWN_PUB"], 2],
    [`lang=English&status=draft&depth=exhaustive&${ph("Платон")}`, ["META"], 4],
    [`descendantsOf=${OWN_PUB}`, ["META"], 1],
    [`descendantsOf=${OWN_PUB}&status=ready`, [], 2],
    [`dateFrom=2026-02-02&dateTo=2026-03-10&lang=Russian`, ["MINE"], 2],
    [`dateFrom=2026-02-01&dateTo=2026-03-10&meta=false&method=hermeneutical`, ["OWN_PUB"], 3],
    [`q=reed&lang=English&meta=true`, ["META"], 2],
    [`q=freedom&field=content&${ph("Ясперс")}&depth=overview&synthLevel=generative`, ["OWN_PUB"], 3],
    [`scope=public&${ph("Гадамер")}`, ["PUBF"], 1],
    [`scope=public&lang=English&meta=false&depth=overview`, ["OWN_PUB"], 3],
    [`scope=shared&${ph("Лейбниц")}`, ["SH"], 1],
    [`scope=shared&${ph("Лейбниц")}&q=${encodeURIComponent("гармония")}&field=content`, ["SH"], 1],
  ];
  const comboBad = [];
  for (const [qs, expected, nActive] of COMBOS) {
    const s = await openCatalog(p, `/catalog?${qs}`);
    const got = mineOf(s.ids);
    const srv = await serverIds(owner, qs.includes("scope=") ? qs : `scope=mine&${qs}`);
    const toggle = await text(p, T("catalog-filters-toggle"));
    const problems = [];
    if (J(got) !== J([...expected].sort())) problems.push(`страница ${got.join() || "∅"} ≠ ожидаемому ${expected.join() || "∅"}`);
    if (J(mineOf(srv.ids)) !== J(got)) problems.push(`страница ≠ серверу ${mineOf(srv.ids).join() || "∅"} (HTTP ${srv.status})`);
    if (!new RegExp(`· ${nActive}\\b`).test(toggle)) problems.push(`кнопка «${toggle.trim()}» ≠ ${nActive}`);
    if (!(await exists(p, T("catalog-filters")))) problems.push("панель не раскрыта ссылкой с фильтрами");
    if (expected.length === 0 && s.ids.filter((id) => !SERIES.includes(id)).length === 0 && !(await exists(p, T("catalog-empty-search"))) && s.ids.length === 0) problems.push("пусто без сообщения");
    if (await exists(p, T("catalog-error"))) problems.push("ошибка каталога");
    if (problems.length) comboBad.push([qs, ...problems]);
  }
  ok(comboBad.length === 0, `${COMBOS.length} комбинаций фильтров ссылкой: выдача ≡ ожидаемой и ≡ серверу; счёт фильтров верен; панель раскрыта`, comboBad);

  // органами панели: глубина (Д-89) и её сочетания
  let s = await openCatalog(p, "/catalog");
  await click(p, T("catalog-filters-toggle"));
  await waitSel(p, T("filter-depth"));
  const depthOpts = await p.$$eval(`${T("filter-depth")} option`, (els) => els.map((e) => e.value));
  ok(J(depthOpts) === J(["", "overview", "standard", "deep", "exhaustive"]), "Д-89: в панели есть фильтр «Глубина» с четырьмя значениями", depthOpts);
  await p.select(T("filter-depth"), "deep");
  s = await settled(p, (x) => x.qs === "depth=deep", "глубина");
  ok(same(s.ids, ["MINE"]), "глубина «глубокая»: только концепция этой глубины; параметр адреса — depth", [s.qs, mineOf(s.ids)]);
  await p.select(T("filter-method"), "analytical");
  await p.select(T("filter-level"), "transformative");
  s = await settled(p, (x) => x.qs === "method=analytical&synthLevel=transformative&depth=deep", "метод+уровень+глубина");
  ok(same(s.ids, ["MINE"]) && /· 3/.test(await text(p, T("catalog-filters-toggle"))), "метод + уровень + глубина органами панели; три активных фильтра", [s.qs, mineOf(s.ids)]);
  await p.select(T("filter-depth"), "overview");
  s = await settled(p, (x) => x.qs.includes("depth=overview"), "нет совпадений");
  ok(mineOf(s.ids).length === 0 && (await exists(p, T("catalog-empty-search"))), "сочетание без совпадений → пустая выдача с подсказками");
  await click(p, T("catalog-empty-reset"));
  s = await settled(p, (x) => x.qs === "", "сброс");
  ok(s.ids.includes(MINE) && (await p.$eval(T("filter-depth"), (el) => el.value)) === "", "сброс возвращает список и пустые органы");
  // философ + эпоха + область органами, затем смена вкладки
  await p.type(T("filter-phil-input"), "Платон");
  await p.keyboard.press("Enter");
  await p.select(T("filter-phil-area"), "lineage");
  await p.select(T("filter-meta"), "true");
  await p.select(T("filter-status"), "draft");
  s = await settled(p, (x) => x.qs.includes("status=draft") && x.qs.includes("meta=true") && x.qs.includes("philArea=lineage"), "четыре органа подряд");
  ok(same(s.ids, ["META"]) && s.qs === `${ph("Платон")}&philArea=lineage&status=draft&meta=true`, "четыре органа подряд без пауз: ни одно действие не потеряно; порядок параметров — как у маршрута", s.qs);
  await click(p, T("catalog-tab-public"));
  s = await settled(p, (x) => x.qs.startsWith("scope=public"), "на публичные");
  ok(!s.qs.includes("status=") && s.qs.includes("meta=true") && same(s.ids, ["META"]) && !(await exists(p, T("filter-status"))), "смена вкладки: статус снят (он только на «моих»), общие фильтры остались", s.qs);
  // пагинация
  s = await openCatalog(p, `/catalog?${ph("Спиноза")}`);
  const pg1 = s.ids.filter((id) => SERIES.includes(id)).length;
  await click(p, T("catalog-page-next"));
  s = await settled(p, (x) => x.qs.includes("page=2"), "страница 2");
  const pg2 = s.ids.filter((id) => SERIES.includes(id)).length;
  ok(pg1 === 20 && pg2 === 1 && s.qs === `${ph("Спиноза")}&page=2`, "пагинация: 21 находка — 20 и 1; страница — в адресе", [pg1, pg2, s.qs]);
  await p.select(T("filter-depth"), "standard");
  s = await settled(p, (x) => x.qs.includes("depth=standard"), "фильтр со второй страницы");
  ok(!s.qs.includes("page=") && s.ids.filter((id) => SERIES.includes(id)).length === 20, "новый фильтр возвращает на первую страницу", s.qs);
  ok(p.errors.length === 0, "T2: ошибок страницы нет", p.errors);

  /* ── T3 ── */
  console.log("\n■ T3: ссылка с параметрами открывает тот же поиск");
  await openCatalog(p, "/catalog");
  await p.select(T("catalog-search-field"), "content");
  await typeInto(p, T("catalog-search-input"), "freedom");
  await settled(p, (x) => x.qs.includes("q=freedom"), "текст");
  if (!(await exists(p, T("catalog-filters")))) await click(p, T("catalog-filters-toggle"));
  await p.type(T("filter-phil-input"), "Ясперс");
  await p.keyboard.press("Enter");
  await p.select(T("filter-depth"), "overview");
  await p.select(T("filter-lang"), "English");
  s = await settled(p, (x) => x.qs.includes("lang=English") && x.qs.includes("depth=overview") && x.qs.includes("philosopher="), "состояние собрано органами");
  const link = await p.evaluate(() => location.pathname + location.search);
  const snap = (page) => page.evaluate(() => ({
    q: document.querySelector('[data-testid="catalog-search-input"]')?.value, field: document.querySelector('[data-testid="catalog-search-field"]')?.value,
    depth: document.querySelector('[data-testid="filter-depth"]')?.value, lang: document.querySelector('[data-testid="filter-lang"]')?.value,
    method: document.querySelector('[data-testid="filter-method"]')?.value, mode: document.querySelector('[data-testid="filter-phil-mode"]')?.value,
    chips: [...document.querySelectorAll('[data-testid="filter-phil-chips"] [data-philosopher]')].map((e) => e.dataset.philosopher),
    toggle: document.querySelector('[data-testid="catalog-filters-toggle"]')?.textContent.trim(),
    ids: [...document.querySelectorAll(".catalog-card")].map((e) => e.dataset.synthesisId),
    hits: [...document.querySelectorAll('[data-testid="search-hit"]')].map((e) => e.textContent),
  }));
  const a = await snap(p);
  ok(same(a.ids, ["OWN_PUB"]) && link === `/catalog?q=freedom&field=content&${ph("Ясперс")}&depth=overview&lang=English`, "состояние, собранное органами, целиком в адресе", link);
  const p2 = await newPage(owner);
  await openCatalog(p2, link);
  const b = await snap(p2);
  ok(J(a) === J(b), "та же ссылка в новой вкладке браузера: тот же текст, поле, органы панели, выдача и подсветка", [a, b]);
  // другому пользователю: его «Мои» (там этой концепции нет) — те же условия, его права
  const po = await newPage(other);
  let so = await openCatalog(po, link);
  const c = await snap(po);
  ok(c.q === a.q && c.field === a.field && c.depth === a.depth && J(c.chips) === J(a.chips) && mineOf(c.ids).length === 0, "ссылку открыл другой пользователь: те же условия, его список «Мои» (чужого там нет)", c);
  so = await openCatalog(po, link.replace("/catalog?", "/catalog?scope=public&"));
  ok(same(so.ids, ["OWN_PUB"]), "он же на «Публичных» теми же условиями находит публичную концепцию", mineOf(so.ids));
  // гостю: «/explore» с теми же параметрами
  const g = await newPage(null);
  let sg = await openCatalog(g, link.replace("/catalog?", "/explore?"));
  const d = await snap(g);
  ok(same(sg.ids, ["OWN_PUB"]) && d.q === a.q && d.field === a.field && d.depth === a.depth && J(d.chips) === J(a.chips) && d.hits.length > 0, "гостю на «/explore» та же ссылка открывает тот же поиск по публичному", d);
  // «назад / вперёд» — шаги истории
  await p2.select(T("filter-depth"), "");
  await settled(p2, (x) => !x.qs.includes("depth="), "глубина снята");
  await click(p2, T("catalog-tab-public"));
  await settled(p2, (x) => x.qs.startsWith("scope=public"), "вкладка");
  await p2.goBack(); await settled(p2, (x) => !x.qs.includes("scope=") && !x.qs.includes("depth="), "назад 1");
  await p2.goBack(); const back2 = await settled(p2, (x) => x.qs.includes("depth=overview"), "назад 2");
  const e = await snap(p2);
  await p2.goForward(); const fwd = await settled(p2, (x) => !x.qs.includes("depth="), "вперёд");
  ok(J(e) === J(a) && `/catalog?${back2.qs}` === link && (await p2.$eval(T("filter-depth"), (el) => el.value)) === "" && !fwd.qs.includes("depth"), "«назад» дважды возвращает исходный поиск целиком (органы и выдача), «вперёд» — следующий шаг", [back2.qs, fwd.qs]);
  // ссылка с порядком и страницей; ссылка с мусором
  s = await openCatalog(p2, `/catalog?${ph("Спиноза")}&sort=title&order=asc&page=2`);
  const lastTitle = await p2.$eval(".catalog-card", (el) => el.textContent);
  ok(s.ids.length === 1 && lastTitle.includes(`${TAG} 21`), "ссылка с sort/order/page: вторая страница по названию — последняя из 21", lastTitle.slice(0, 60));
  s = await openCatalog(p2, `/catalog?depth=bottomless&method=magic&epoch=99&field=theses&q=reed&meta=${encodeURIComponent("да")}&philMode=some&page=-2&descendantsOf=x`, () => true, true);
  ok(same(s.ids, ["OWN_PUB", "META"]) && !(await exists(p2, T("catalog-error"))), "ссылка с негодными значениями: негодное отброшено, годное (текст) исполнено, ошибки нет", mineOf(s.ids));
  ok(p2.errors.length === 0 && po.errors.length === 0, "T3: ошибок страницы нет", [...p2.errors, ...po.errors]);

  /* ── T4 ── */
  console.log("\n■ T4: от найденного термина — к термину в документе");
  const focusInfo = (page) => page.evaluate(() => {
    const f = document.querySelector('[data-testid="term-focus"]');
    if (!f) return null;
    const r = f.getBoundingClientRect();
    const row = [...document.querySelectorAll("tr")].find((tr) => { const b = tr.getBoundingClientRect(); return b.height > 0 && Math.abs(b.top - r.top) < 6 && Math.abs(b.height - r.height) < 12; });
    return { top: Math.round(r.top), h: Math.round(r.height), vh: innerHeight, rowTerm: (row?.querySelector("td")?.textContent ?? "").trim(), key: f.dataset.termKey };
  });
  const goTerm = async (page, base, tab, docId, termName) => {
    await openCatalog(page, base);
    if (tab) { await click(page, T(`catalog-tab-${tab}`)); await settled(page, (x) => x.qs.includes(`scope=${tab}`), tab); }
    await page.select(T("catalog-search-field"), "term");
    await typeInto(page, T("catalog-search-input"), termName.replace(/\s*\([^()]*\)\s*$/, ""));
    const st = await settled(page, (x) => x.qs.includes("field=term") && x.match === "exact", `термин ${termName}`);
    const card = await cardInfo(page, docId);
    if (!card) return { found: mineOf(st.ids), card: null };
    await click(page, `.catalog-card[data-synthesis-id="${docId}"]`);
    await waitSel(page, T("term-focus"), 30000);
    await sleep(1300);
    return { found: mineOf(st.ids), card, url: await page.evaluate(() => location.pathname + location.search), focus: await focusInfo(page), missing: await exists(page, T("term-focus-missing")) };
  };
  // строка в окне целиком; строка выше окна (длинное определение) — её начало у верха окна
  const inView = (f) => !!f && f.top >= 0 && (f.h > f.vh * 0.8 ? f.top < f.vh * 0.25 : f.top + f.h <= f.vh);
  // владелец: три разных термина (начало, середина, конец глоссария)
  const picks = [docTerms[0], docTerms[Math.floor(docTerms.length / 2)], docTerms[docTerms.length - 1]];
  const ownBad = [];
  const keyOf = new Map();
  for (const t of picks) {
    const r = await goTerm(p, "/catalog", null, DOC_MINE, t.term);
    keyOf.set(t.id, r.focus?.key ?? "");
    if (!r.card || r.card.term !== t.id || !r.url.includes(`term=${t.id}`) || !inView(r.focus) || r.focus.rowTerm !== t.term || r.missing) ownBad.push([t.term, r]);
  }
  ok(ownBad.length === 0, `владелец: ${picks.length} термина (первый — строка выше окна, средний, последний) — карточка ведёт к термину, строка в рамке и в окне`, ownBad);
  // участник-рецензент: чужой приватный документ со вкладки «Со мной поделились»
  const shTerms = await sql`select id, term from glossary_terms where synthesis_id=${DOC_SHARED} order by position`;
  const rs = await goTerm(p, "/catalog", "shared", DOC_SHARED, shTerms[2].term);
  ok(!!rs.card && rs.card.term === shTerms[2].id && inView(rs.focus) && rs.focus.rowTerm === shTerms[2].term && !rs.missing, "рецензент: термин чужого приватного документа со вкладки «Со мной поделились»", rs);
  // гость: публичный документ с «/explore» (id разрешить негде — работает ключ имени)
  const pubTerms = await sql`select id, term from glossary_terms where synthesis_id=${DOC_PUBLIC} order by position`;
  const rg = await goTerm(g, "/explore", null, DOC_PUBLIC, pubTerms[3].term);
  ok(!!rg.card && inView(rg.focus) && rg.focus.rowTerm === pubTerms[3].term && !rg.missing && !rg.found.includes("DOC_MINE") && !rg.found.includes("DOC_SHARED"), "гость: термин публичного документа с «/explore» (тот же термин есть в приватных копиях — они не найдены)", rg);
  // устаревший id при верном ключе (глоссарий перегенерирован) — рамка по ключу
  await p.goto(`${UI}/synthesis/${DOC_MINE}?term=00000000-0000-4000-8000-000000000000&termKey=${encodeURIComponent(keyOf.get(picks[1].id))}`, { waitUntil: "networkidle0" });
  await waitSel(p, T("term-focus"), 30000).catch(() => {});
  await sleep(1200);
  const stale = await focusInfo(p);
  ok(inView(stale) && stale.rowTerm === picks[1].term, "id термина устарел, ключ имени верен → рамка на строке (по ключу)", stale);
  // имя термина изменилось, id прежний → владельцу рамка по id (текущее имя)
  await p.goto(`${UI}/synthesis/${DOC_MINE}?term=${picks[0].id}&termKey=${encodeURIComponent("прежнее имя термина")}`, { waitUntil: "networkidle0" });
  await waitSel(p, T("term-focus"), 30000).catch(() => {});
  await sleep(1200);
  const byId = await focusInfo(p);
  ok(inView(byId) && byId.rowTerm === picks[0].term, "ключ в ссылке устарел, id верен → владельцу рамка по id (имя берётся у глоссария)", byId);
  // ни id, ни ключа — выноска
  await p.goto(`${UI}/synthesis/${DOC_MINE}?term=00000000-0000-4000-8000-000000000000&termKey=${encodeURIComponent("нет такого")}`, { waitUntil: "networkidle0" });
  await waitSel(p, T("term-focus-missing"), 30000);
  ok(!(await exists(p, T("term-focus"))), "термина нет в документе → выноска, рамки нет");
  // обычная ссылка на документ — без рамки и выноски
  await p.goto(`${UI}/synthesis/${DOC_MINE}`, { waitUntil: "networkidle0" });
  await sleep(1500);
  ok(!(await exists(p, T("term-focus"))) && !(await exists(p, T("term-focus-missing"))), "обычное открытие документа — без рамки и без выноски");
  ok(p.errors.length === 0 && g.errors.length === 0, "T4: ошибок страницы нет", [...p.errors, ...g.errors]);

  /* ── T5 ── */
  console.log("\n■ T5: гость видит только публичное");
  sg = await openCatalog(g, "/explore");
  const PUBLIC_SET = ["DOC_PUBLIC", "META", "OWN_PUB", "PUBF", "SHOW"];
  ok(same(sg.ids, PUBLIC_SET), "«/explore» гостю: все публичные (полные и витрина), ни одной приватной или разделённой", mineOf(sg.ids));
  ok((await count(g, '[data-testid^="catalog-tab-"]')) === 0 && !(await exists(g, T("card-actions"))), "гостю нет вкладок и действий владельца");
  const GUEST = [
    ["title", "горизонт", ["PUBF"]], ["seed", "понимания", ["PUBF"]], ["content", "герменевтический", ["PUBF"]], ["term", "предпонимание", ["PUBF"]],
    ["title", "логоса", ["SHOW"]], ["content", "витрине", ["SHOW"]], ["content", "высказывающая", []], ["term", "апофансис", []],
    ["title", "апорий", []], ["seed", "сомнение", []], ["content", "атараксия", []], ["term", "эпохе", []],
    ["title", "монада", []], ["content", "гармония", []], ["term", "энтелехия", []], ["term", "метемпсихоз", []], ["content", "сокровенная", []],
  ];
  const guestBad = [];
  for (const [field, textQ, want] of GUEST) {
    if ((await g.$eval(T("catalog-search-field"), (el) => el.value)) !== field) await g.select(T("catalog-search-field"), field);
    await typeInto(g, T("catalog-search-input"), textQ);
    const st = await settled(g, (x) => new URLSearchParams(x.qs).get("q") === textQ && (new URLSearchParams(x.qs).get("field") ?? "title") === field, `гость ${field}/${textQ}`);
    const got = mineOf(st.ids);
    const leaked = got.filter((n) => !PUBLIC_SET.includes(n));
    if (leaked.length) guestBad.push([field, textQ, "утечка", leaked]);
    if (want.length ? (st.match === "fuzzy" || !want.every((w) => got.includes(w))) : (st.match !== "fuzzy" && got.length > 0)) guestBad.push([field, textQ, got, st.match]);
  }
  ok(guestBad.length === 0, `гость: ${GUEST.length} поисков всеми полями — публичное находится, приватное и разделённое не находится ни по одному слову; витрина — без терминов`, guestBad);
  await typeInto(g, T("catalog-search-input"), "");
  await settled(g, (x) => !x.qs.includes("q="), "текст снят");
  if (!(await exists(g, T("catalog-filters")))) await click(g, T("catalog-filters-toggle"));
  ok(!(await exists(g, T("filter-status"))) && !(await exists(g, T("filter-date-from"))) && (await exists(g, T("filter-depth"))) && (await exists(g, T("filter-phil-area"))), "гостю в панели — общие фильтры (включая глубину и родословную), статуса и даты нет");
  await g.select(T("filter-depth"), "overview");
  sg = await settled(g, (x) => x.qs.includes("depth=overview"), "глубина гостю");
  ok(same(sg.ids, ["OWN_PUB"]), "фильтр глубины гостю — по публичному", mineOf(sg.ids));
  for (const [qs, what] of [["scope=mine", "scope=mine"], ["scope=shared", "scope=shared"], [`status=draft&dateFrom=2026-01-01`, "статус и дата"], [`descendantsOf=${MINE}`, "потомки чужой приватной"]]) {
    sg = await openCatalog(g, `/explore?${qs}`, () => true, true);
    const leaked = mineOf(sg.ids).filter((n) => !PUBLIC_SET.includes(n));
    const err = await exists(g, T("catalog-error"));
    if (leaked.length || (qs.startsWith("descendantsOf") ? !err && sg.ids.length > 0 : err)) ok(false, `гость, ссылка «${what}»`, [mineOf(sg.ids), err]);
  }
  ok(true, "гостю ссылки со scope=mine / shared / статусом и датой — тот же публичный список без ошибок; потомки чужой приватной — отказ без выдачи");
  // сервер гостю: иные списки — 401; публичный — без приватного
  const g401 = [(await serverIds(null, "scope=mine")).status, (await serverIds(null, "scope=shared")).status];
  const gPub = await serverIds(null, "scope=public");
  ok(J(g401) === J([401, 401]) && gPub.status === 200 && same(gPub.ids, PUBLIC_SET), "сервер гостю: «свои» и «поделились» — 401, публичный — только публичное", [g401, mineOf(gPub.ids)]);
  // «/catalog» гостю закрыт; приватная концепция по прямой ссылке — отказ без содержимого
  await g.goto(`${UI}/catalog?q=${encodeURIComponent("апорий")}`, { waitUntil: "networkidle0" });
  await sleep(600);
  ok((await g.evaluate(() => location.pathname)) === "/" && !(await exists(g, T("catalog-search-input"))) && !(await g.evaluate(() => document.body.innerText)).includes(`Зеркало апорий ${TAG}`), "«/catalog» гостя не пускает (уводит на «/»), поиск по приватному не исполнен", await g.evaluate(() => location.pathname));
  await g.goto(`${UI}/synthesis/${DOC_MINE}?term=${docTerms[0].id}&termKey=x`, { waitUntil: "networkidle0" });
  await sleep(1200);
  const gPriv = await g.evaluate(() => document.body.innerText);
  ok(!gPriv.includes(docTerms[0].term) && !(await exists(g, T("term-focus"))), "приватный документ по ссылке к термину гостю не открыт (ни текста, ни рамки)");
  ok(g.errors.filter((e) => !/403|401/.test(e)).length === 0, "T5: ошибок страницы нет", g.errors);

  /* ── T6 ── */
  console.log("\n■ T6: язык интерфейса (переводы утверждены)");
  const langBad = [];
  for (const [loc, depthLabel, filtersWord, found] of [["en", "Depth", "Filters", /concepts? found/], ["de", "Tiefe", "Filter", /Konzepte? gefunden/]]) {
    await sql`update users set ui_locale=${loc} where id=${owner.id}`;
    const pl = await newPage(owner);
    await pl.setExtraHTTPHeaders({ "Accept-Language": loc });
    await pl.setCookie({ name: "ui_locale", value: loc, url: UI });
    await openCatalog(pl, `/catalog?q=reed&depth=overview`);
    const tx = await pl.evaluate(() => ({ toggle: document.querySelector('[data-testid="catalog-filters-toggle"]')?.textContent ?? "", depth: document.querySelector('label[for="catalog-filter-depth"]')?.textContent ?? "", found: document.querySelector('[data-testid="catalog-found"]')?.textContent ?? "", cyr: /[А-Яа-яЁё]/.test([...document.querySelectorAll('[data-testid="catalog-filters"] label, [data-testid="catalog-filters"] option, [data-testid="catalog-search"] option')].filter((e) => !e.closest("datalist") && !e.closest('[data-testid="filter-epochs"]') && !e.closest('[data-testid="filter-lang"]')).map((e) => e.textContent).join(" ")) }));
    if (!tx.toggle.includes(filtersWord) || tx.depth.trim() !== depthLabel || !found.test(tx.found) || tx.cyr) langBad.push([loc, tx]);
    if (pl.errors.length) langBad.push([loc, pl.errors]);
    await pl.close();
  }
  await sql`update users set ui_locale=null where id=${owner.id}`;
  ok(langBad.length === 0, "панель, строка поиска и счёт выдачи — на en и de без русских подписей", langBad);
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
