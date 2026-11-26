/**
 * Снимки страниц клиента при заданном направлении интерфейса (2026-11-26,
 * вне бесед) — прибор для правок, которые не должны менять вид слева
 * направо (логические свойства CSS) и должны зеркалить его справа налево.
 *
 * Живой сервер :3000 + vite dev :5199 + Chrome 131; Claude не нужен
 * (документ кладётся в БД напрямую). Анимации и каретка выключены, чтобы
 * два прогона одного дерева давали одинаковые файлы.
 *
 *   npx tsx tests/dir-snapshots.mjs --out tests/out/dir-before
 *   …правка…
 *   npx tsx tests/dir-snapshots.mjs --out tests/out/dir-after
 *   python3 scripts/checks/png-diff.py tests/out/dir-before tests/out/dir-after
 *
 *   --dir rtl   после загрузки страницы поставить <html dir="rtl"> (языка
 *               интерфейса справа налево пока нет — направление навязано)
 *   --lang en   язык интерфейса (cookie ui_locale; по умолчанию ru)
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";
import puppeteer from "puppeteer-core";

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const OUT = resolve(arg("out", "tests/out/dir-snapshots")) + "/";
const DIR = arg("dir", "ltr");
const LANG = arg("lang", "ru");

const SERVER_PORT = 3000;
const VITE_PORT = 5199;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const UI = `http://127.0.0.1:${VITE_PORT}`;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const CHROME = [process.env.CHROME_PATH, `${process.env.HOME}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`].find((p) => p && existsSync(p));
if (!CHROME) { console.error("нет Chrome 131 (chrome/README.md)"); process.exit(1); }

let serverProc, viteProc;
let serverLog = "", viteLog = "";
async function waitUp(url, label, log) {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* поднимается */ }
    await sleep(300);
  }
  throw new Error(`${label} не поднялся:\n` + log().slice(-2000));
}

const SUM = `<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">Резюме</div><div class="doc-content">
<div data-section="Цели и задачи"><h4>Цели и задачи</h4><p>Документ строит концепцию <strong>вмещающего разлома</strong>; <em>предостережение</em> — ниже.</p>
<h5>Подпункт</h5><ol><li>Первое положение</li><li>Второе положение</li></ol></div></div></div>`;
const GRAPH = `<div class="doc-section"><div class="section-num">§ 2</div><div class="section-title">Категориальная структура</div><div class="doc-content">
<div data-section="Таблица категорий"><h4>Таблица категорий</h4>
<table class="doc-table"><thead><tr><th>Название</th><th>Тип</th><th>Определение</th></tr></thead>
<tbody><tr><td>Бытие</td><td>онтологическая</td><td>То, что предшествует всякому знанию.</td></tr>
<tr><td>Знание</td><td>эпистемологическая</td><td>Раскрытость бытия разуму.</td></tr></tbody></table>
<div class="callout note"><span class="callout-label">Примечание</span>Категории соотносительны.</div>
<div class="callout warning"><span class="callout-label">Внимание</span>Риск: <span class="risk high">ВЫСОКИЙ</span></div>
<div class="callout gold"><span class="callout-label">Рекомендация</span>Развести уровни.</div>
</div>
<div data-section="Описание связей"><h4>Описание связей</h4><ul><li>Первая: бытие</li><li>Вторая: знание</li></ul></div>
</div></div>`;

const sql = postgres(DB_URL, { max: 2, onnotice: () => {} });
const tag = "dsn" + Math.random().toString(36).slice(2, 6);
let browser, userId, shots = 0;
try {
  serverProc = spawn(process.execPath, ["--import", "tsx", "index.ts"], {
    cwd: new URL("../server/", import.meta.url).pathname,
    env: { ...process.env, PORT: String(SERVER_PORT), CLIENT_ORIGIN: UI, DATABASE_URL: DB_URL, REDIS_URL: "redis://localhost:6379", RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProc.stdout.on("data", (d) => (serverLog += d));
  serverProc.stderr.on("data", (d) => (serverLog += d));
  await waitUp(`${API}/health`, "сервер", () => serverLog);
  viteProc = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort", "--host", "127.0.0.1"], {
    cwd: new URL("../client/", import.meta.url).pathname, env: process.env, stdio: ["ignore", "pipe", "pipe"],
  });
  viteProc.stdout.on("data", (d) => (viteLog += d));
  viteProc.stderr.on("data", (d) => (viteLog += d));
  await waitUp(`${UI}/`, "vite", () => viteLog);

  // почта и номер документа — постоянные: они попадают на снимки
  const email = "dir-snapshots@test.local", password = "Passw0rd!ds";
  await sql`DELETE FROM users WHERE email = ${email}`;
  const reg = await fetch(`${API}/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, displayName: "Снимки" }) });
  if (!reg.ok) throw new Error("register: " + (await reg.text()));
  [{ id: userId }] = await sql`UPDATE users SET email_verified_at = now(), created_at = '2026-01-01', balance_usd = 5 WHERE email = ${email} RETURNING id`;
  const [{ id: DOC }] = await sql`
    INSERT INTO syntheses (user_id, title, status, doc_num, method, synth_level, depth, generation_order, lang, section_order, structure_sections, capsule_html, created_at, updated_at)
    VALUES (${userId}, 'Вмещающий разлом', 'ready', 'PS-DIRSNAP', 'dialectical', 'transformative', 'standard', 'architectural', 'Russian', ${sql.json(["capsule", "sum", "graph"])}, ${sql.json(["capsule", "sum", "graph"])},
            '<div data-section="Капсула"><h4>Капсула</h4><p>Диалектический синтез бытия и знания.</p></div>', '2026-01-02', '2026-01-02')
    RETURNING id`;
  await sql`INSERT INTO sections (synthesis_id, key, section_num, title, html_content) VALUES (${DOC}, 'sum', 1, 'Резюме', ${SUM}), (${DOC}, 'graph', 2, 'Категориальная структура', ${GRAPH})`;

  browser = await puppeteer.launch({ executablePath: CHROME, args: ["--no-sandbox", "--font-render-hinting=none"], headless: true });
  const page = await browser.newPage();
  await page.setCookie({ name: "ui_locale", value: LANG, url: UI });
  mkdirSync(OUT, { recursive: true });

  async function shot(name, path, { width = 1280, before } = {}) {
    await page.setViewport({ width, height: 900 });
    await page.goto(`${UI}${path}`, { waitUntil: "networkidle0", timeout: 60000 });
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
    if (DIR === "rtl") await page.evaluate(() => document.documentElement.setAttribute("dir", "rtl"));
    if (before) await before();
    await page.evaluate(() => document.fonts.ready);
    await sleep(400);
    await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
    shots++;
    console.log(`  · ${name}`);
  }

  await shot("01-landing", "/");
  await shot("02-login", "/login");
  await shot("03-register", "/register");
  await shot("04-explore", "/explore");
  await shot("05-landing-mobile", "/", { width: 400 });

  await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
  const fill = async (sel, v) => { await page.waitForSelector(sel); await page.$eval(sel, (el, x) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, x); el.dispatchEvent(new Event("input", { bubbles: true })); }, v); };
  await fill("input[type=email]", email);
  await fill("input[type=password]", password);
  await page.click("button[type=submit]");
  await page.waitForFunction(() => location.pathname !== "/login", { timeout: 20000 });

  await shot("10-catalog", "/catalog");
  await shot("11-new-synthesis", "/synthesis/new");
  await shot("12-document", `/synthesis/${DOC}`);
  await shot("13-document-mobile", `/synthesis/${DOC}`, { width: 400 });
  await shot("14-import", "/import");
  await shot("15-billing", "/billing");
  await shot("16-profile", "/profile");
  await shot("17-catalog-mobile", "/catalog", { width: 400 });
  // вкладки документа и окна над ним
  for (const [name, testid] of [["20-document-discussion", "tab-discussion"], ["21-document-reviews", "tab-reviews"], ["22-document-proposals", "tab-proposals"], ["23-document-members", "tab-members"]]) {
    await shot(name, `/synthesis/${DOC}`, { before: async () => { const el = await page.$(`[data-testid="${testid}"]`); if (el) { await el.click(); await sleep(700); } } });
  }
  await shot("30-document-notifications", `/synthesis/${DOC}`, { before: async () => { const el = await page.$('[data-testid="notification-toggle"]'); if (el) { await el.click(); await sleep(500); } } });
} catch (e) {
  console.error("СБОЙ:", e);
  console.error("--- server ---\n" + serverLog.slice(-1500));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (userId) {
    await sql`DELETE FROM syntheses WHERE user_id = ${userId}`;
    await sql`DELETE FROM users WHERE id = ${userId}`.catch(() => {});
  }
  await sql.end();
  serverProc?.kill("SIGKILL");
  viteProc?.kill("SIGKILL");
}
console.log(`снимков: ${shots} → ${OUT} (dir=${DIR}, lang=${LANG})`);
process.exit(process.exitCode ?? 0);
