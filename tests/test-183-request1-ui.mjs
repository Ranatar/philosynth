/**
 * Беседа 18.3, первый запрос — проба блока «Похожие концепции» в браузере
 * (Chrome 131, СБОРКА клиента под vite preview; сервер :3000 без мока —
 * все шаги пробы бесплатные):
 *   U1 блок под документом: карточки по убыванию меры, мера СЛОВАМИ
 *      («сильно / заметно / слабо похожа»), числа нет; причины строками;
 *      разметка в имени термина не становится разметкой страницы;
 *   U2 иноязычная концепция и витрина: строка «термины и категории не
 *      сравнивались» с причиной, терминов в причинах нет;
 *   U3 ссылка философа ведёт в каталог с фильтром родословной (адрес
 *      собран сериализатором каталога) — каталог открывается с выдачей;
 *   U4 название карточки ведёт к концепции; блок перечитывается для неё;
 *   U5 концепция без соседей — понятное пустое состояние;
 *   U6 гость на публичной концепции: блок есть, кандидаты — только
 *      публичные, ссылки причин ведут на /explore.
 *
 * Запуск (из корня; PG/Redis подняты, порты 3000 и 5283 свободны):
 *   node_modules/.bin/tsx tests/test-183-request1-ui.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync } from "node:fs";
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
const TAG = "t183-" + Math.random().toString(36).slice(2, 6);
const PW = "password-183";

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
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(BASE + p, { method, headers, body: body !== undefined ? J(body) : undefined });
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
  return { id: u.id, email, cookie: lr.cookie };
}
const synthIds = [];
async function mkSynth(userId, o) {
  const [s] = await sql`insert into syntheses (user_id, title, lang, method, synth_level, status, visibility, capsule_html)
    values (${userId}, ${`${o.title} ${TAG}`}, ${o.lang ?? "Russian"}, ${o.method ?? "dialectical"}, ${o.level ?? "comparative"}, 'ready', ${o.visibility ?? "private"},
            ${`<div data-section="Капсула"><h4>Капсула</h4><p>Капсула концепции «${o.title}».</p></div>`}) returning id`;
  synthIds.push(s.id);
  let pos = 0;
  for (const name of o.philosophers ?? []) await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${s.id}, 'philosopher', ${name}, ${pos++})`;
  for (const pid of o.parents ?? []) await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${s.id}, 'synthesis', ${pid}, ${pos++})`;
  pos = 0;
  for (const name of o.categories ?? []) await sql`insert into categories (synthesis_id, name, position) values (${s.id}, ${name}, ${pos++})`;
  pos = 0;
  for (const term of o.terms ?? []) await sql`insert into glossary_terms (synthesis_id, term, definition, position) values (${s.id}, ${term}, 'определение', ${pos++})`;
  return s.id;
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
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  return page;
}
const waitSel = (page, sel, ms = 20000) => page.waitForSelector(sel, { timeout: ms });
/** Снимок для глаз: SHOTS=<папка> — необязательный, проверок не несёт */
const shot = async (page, name) => { if (process.env.SHOTS) { const el = await page.$(T("similar-block")); await (el ?? page).screenshot({ path: `${process.env.SHOTS}/${name}.png` }); } };
/** Карточки блока: id, слово меры, причины по testid, строка «не сравнивались» */
const cards = (page) => page.$$eval(T("similar-card"), (els) => els.map((el) => ({
  id: el.getAttribute("data-synthesis-id"),
  grade: el.getAttribute("data-grade"),
  gradeText: el.querySelector('[data-testid="similar-grade"]')?.textContent ?? "",
  title: el.querySelector('[data-testid="similar-card-title"]')?.textContent ?? "",
  reasons: Object.fromEntries([...el.querySelectorAll('[data-testid^="similar-reason-"]')].map((r) => [r.getAttribute("data-testid").replace("similar-reason-", ""), r.querySelector(".similar-reason-val")?.textContent ?? ""])),
  skip: el.querySelector('[data-testid="similar-skip"]')?.getAttribute("data-reason") ?? null,
  text: el.textContent ?? "",
  links: [...el.querySelectorAll("a")].map((a) => a.getAttribute("href")),
})));
/** Дождаться блока в конечном состоянии (список либо пусто) */
async function block(page) {
  await waitSel(page, T("similar-block"));
  await page.waitForFunction(() => !document.querySelector('[data-testid="similar-loading"]') && (document.querySelector('[data-testid="similar-list"]') || document.querySelector('[data-testid="similar-empty"]') || document.querySelector('[data-testid="similar-error"]')), { timeout: 20000 });
}

try {
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);
  if (!CHROME) throw new Error("браузер не найден — соберите Chrome 131 по chrome/README.md");
  console.log("■ Сборка клиента (vite build)");
  const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8", env: { ...process.env, VITE_STRIPE_PUBLISHABLE_KEY: "" } });
  ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t183-preview.log");
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", RATE_LIMIT_MAIL_PER_HOUR: "1000", MAIL_TRANSPORT: "console", BILLING_ENFORCE: "false", NOTIFY_SCAN_INTERVAL_MS: "600000" }, "/tmp/t183-server.log");
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "preview");
  const puppeteer = (await import("puppeteer-core")).default;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
  const ver = await browser.version();
  ok(/131\.0\.6778/.test(ver), `браузер Chrome 131 (${ver})`);

  const owner = await account("owner"), other = await account("other");
  const EVIL = "Снятие <img src=x onerror=\"window.__pwned=1\">";
  const SRC = await mkSynth(owner.id, { title: "Исходная", philosophers: ["Кант", "Гегель"], terms: ["Бытие (Sein)", EVIL, "Абсолютный дух"], categories: ["Свобода", "Время"] });
  const TWIN = await mkSynth(owner.id, { title: "Близнец", philosophers: ["Кант", "Гегель"], terms: ["Бытия", EVIL, "Воля"], categories: ["свободы"] });
  const EN = await mkSynth(other.id, { title: "English twin", lang: "English", visibility: "full", philosophers: ["Кант", "Гегель"], terms: ["Бытие"], categories: ["Свобода"] });
  const SHOW = await mkSynth(other.id, { title: "Витрина", visibility: "showcase", method: "analytical", philosophers: ["Кант"], terms: ["Бытие", "Абсолютный дух"], categories: ["Свобода"] });
  const PRIV = await mkSynth(other.id, { title: "Чужая приватная", philosophers: ["Кант", "Гегель"], terms: ["Бытие"] });
  const CHILD = await mkSynth(owner.id, { title: "Потомок", philosophers: ["Платон"], parents: [SRC], method: "creative", level: "generative" });
  const LONE = await mkSynth(owner.id, { title: "Одиночка", terms: [`Неповторимость${TAG.replace("-", "")}`] });
  const mine = [SRC, TWIN, EN, SHOW, PRIV, CHILD, LONE];

  console.log("■ U1. Блок под документом");
  let p = await newPage(owner);
  await p.goto(`${UI}/synthesis/${SRC}`, { waitUntil: "networkidle0" });
  await block(p);
  let cs = (await cards(p)).filter((c) => mine.includes(c.id));
  await shot(p, "u1-owner-block");
  ok(cs.length >= 4 && cs[0].id === TWIN && !cs.some((c) => c.id === PRIV || c.id === SRC || c.id === LONE), "карточки есть; близнец первым; чужой приватной, самой концепции и одиночки нет", cs.map((c) => c.title));
  const tw = cs.find((c) => c.id === TWIN);
  ok(tw?.grade === "strong" && tw.gradeText === "сильно похожа" && cs.every((c) => ["сильно похожа", "заметно похожа", "слабо похожа"].includes(c.gradeText)), "мера — словами", cs.map((c) => c.gradeText));
  ok(cs.every((c) => !/\d[.,]\d|\d\s?%/.test(c.text.replace(c.title, ""))), "числа меры в карточках нет", cs.map((c) => c.text.slice(0, 160)));
  ok(/Гегель/.test(tw?.reasons.philosophers ?? "") && /Кант/.test(tw?.reasons.philosophers ?? "") && /Бытие/.test(tw?.reasons.terms ?? "") && /Свобода/.test(tw?.reasons.categories ?? "") && /метод синтеза/.test(tw?.reasons.same ?? "") && /уровень синтеза/.test(tw?.reasons.same ?? ""), "причины близнеца: философы, термины именами исходной, категория, метод и уровень", tw?.reasons);
  const injected = await p.evaluate(() => ({ pwned: window.__pwned === 1, img: document.querySelectorAll('[data-testid="similar-block"] img').length }));
  ok(!injected.pwned && injected.img === 0 && /<img src=x/.test(tw?.reasons.terms ?? ""), "разметка в имени общего термина осталась текстом", [injected, tw?.reasons.terms]);
  const ch = cs.find((c) => c.id === CHILD);
  ok(/потомок этой концепции/.test(ch?.reasons.kin ?? "") && /Кант/.test(ch?.reasons.lineage ?? ""), "потомок: родство и философы через родословную", ch?.reasons);

  console.log("■ U2. Другой язык и витрина");
  const en = cs.find((c) => c.id === EN), sh = cs.find((c) => c.id === SHOW);
  ok(en?.skip === "language" && !("terms" in en.reasons) && !("categories" in en.reasons) && /Кант/.test(en.reasons.philosophers ?? ""), "иноязычная: «не сравнивались — разные языки», терминов в причинах нет, философы есть", en);
  ok(sh?.skip === "closed" && !("terms" in sh.reasons) && !("categories" in sh.reasons) && /витрина/.test(sh.text), "витрина: «не сравнивались — содержание закрыто», терминов нет, бейдж витрины", sh);
  ok(/одного языка генерации/.test(await p.$eval(T("similar-foot"), (el) => el.textContent ?? "")), "подвал объясняет, как считается сходство");

  console.log("■ U3. Ссылка философа → каталог");
  const href = tw.links.find((h) => h?.startsWith("/catalog?"));
  ok(href === `/catalog?philosopher=${encodeURIComponent("Гегель")}&philArea=lineage`, "адрес ссылки — список «Мои», философ, вся родословная", href);
  await p.$eval(`${T("similar-card")}[data-synthesis-id="${TWIN}"] ${T("similar-phil-link")}`, (el) => el.click());
  // карточки каталога, а не карточки блока прежней страницы (у тех тот же атрибут)
  await p.waitForFunction(() => location.pathname === "/catalog" && document.querySelectorAll(".catalog-card[data-synthesis-id]").length > 0, { timeout: 20000 });
  const found = await p.$$eval(".catalog-card[data-synthesis-id]", (els) => els.map((e) => e.getAttribute("data-synthesis-id")));
  ok(new URL(p.url()).searchParams.get("philArea") === "lineage" && found.includes(SRC) && found.includes(TWIN) && found.includes(CHILD) && !found.includes(LONE), "каталог открылся с фильтром родословной: исходная, близнец и потомок найдены", [p.url(), found.length]);

  console.log("■ U4. Переход к концепции");
  await p.goBack({ waitUntil: "networkidle0" });
  await block(p);
  await p.$eval(`${T("similar-card")}[data-synthesis-id="${TWIN}"] ${T("similar-card-title")}`, (el) => el.click());
  await p.waitForFunction((id) => location.pathname === `/synthesis/${id}`, { timeout: 20000 }, TWIN);
  await p.waitForFunction((id) => !!document.querySelector(`[data-testid="similar-card"][data-synthesis-id="${id}"]`), { timeout: 20000 }, SRC);
  cs = await cards(p);
  ok(cs.some((c) => c.id === SRC) && !cs.some((c) => c.id === TWIN), "название ведёт к концепции; блок перечитан для неё (исходная теперь среди похожих)", cs.map((c) => c.title));

  console.log("■ U5. Без соседей");
  await p.goto(`${UI}/synthesis/${LONE}`, { waitUntil: "networkidle0" });
  await block(p);
  const empty = await p.$eval(T("similar-empty"), (el) => el.textContent ?? "").catch(() => null);
  await shot(p, "u5-empty");
  ok(!!empty && /Похожих концепций не нашлось/.test(empty) && (await p.$$(T("similar-card"))).length === 0, "пустое состояние названо словами", empty);
  ok(p.errors.length === 0, "ошибок страницы нет (вошедший)", p.errors);

  console.log("■ U6. Гость");
  const g = await newPage(null);
  await g.goto(`${UI}/synthesis/${EN}`, { waitUntil: "networkidle0" });
  await block(g);
  const gs = await cards(g);
  await shot(g, "u6-guest");
  const vis = gs.length ? await sql`select id, visibility from syntheses where id in ${sql(gs.map((c) => c.id))}` : [];
  ok(gs.some((c) => c.id === SHOW) && vis.every((v) => v.visibility !== "private") && !gs.some((c) => [SRC, TWIN, PRIV, CHILD].includes(c.id)), "гость: блок есть, кандидаты только публичные", gs.map((c) => c.title));
  const gl = gs.flatMap((c) => c.links).filter((h) => h && !h.startsWith("/synthesis/"));
  ok(gl.length > 0 && gl.every((h) => h.startsWith("/explore?")), "ссылки причин гостя ведут на /explore", gl.slice(0, 3));
  ok(/среди публичных концепций/.test(await g.$eval(".similar-note", (el) => el.textContent ?? "")) && g.errors.length === 0, "гостю сказано, среди чего искали; ошибок страницы нет", g.errors);
  const g403 = await newPage(null);
  await g403.goto(`${UI}/synthesis/${SRC}`, { waitUntil: "networkidle0" });
  ok((await g403.$(T("similar-card"))) === null, "чужая приватная гостю: карточек похожих нет");
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
