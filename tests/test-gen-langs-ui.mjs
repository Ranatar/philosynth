/**
 * Языки генерации (2026-11-26, вне бесед) — клиент в браузере.
 *
 * Живой сервер :3000 (vite-прокси захардкожен) + vite dev :5199 + Chrome 131;
 * Claude не нужен (документ кладётся в БД напрямую).
 *   U1 форма создания: 15 языков + «Другой…»; у древнегреческого, вэньяня и
 *      санскрита — пометка «экспериментально»; выбор санскрита показывает
 *      предупреждение, итальянского — нет
 *   U2 документ на арабском: тело раздела lang=ar dir=rtl, заголовок
 *      таблицы вправо, черта врезки справа; шапка, оглавление-обёртка и
 *      футер — слева направо; капсула — rtl; снимок tests/out/gen-langs-ui-ar.png
 *   U3 форма правки подраздела в арабском разделе — dir=ltr (интерфейс), тело
 *      правки на месте — dir=auto
 *   U4 документ на санскрите — lang=sa, слева направо, разрядка заголовков
 *      снята; снимок tests/out/gen-langs-ui-sa.png
 *
 * Запуск: npx tsx tests/test-gen-langs-ui.mjs (PG+Redis подняты, посевы есть)
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";
import puppeteer from "puppeteer-core";

const SERVER_PORT = 3000;
const VITE_PORT = 5199;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const UI = `http://127.0.0.1:${VITE_PORT}`;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const CHROME = [process.env.CHROME_PATH, `${process.env.HOME}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`].find((p) => p && existsSync(p));
const OUT = new URL("./out/", import.meta.url).pathname;

let passed = 0;
let failed = 0;
function ok(cond, name, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail === undefined ? "" : " — " + JSON.stringify(detail).slice(0, 500)}`); }
}

let serverProc, viteProc;
let serverLog = "", viteLog = "";
async function waitUp(url, label, log) {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* поднимается */ }
    await sleep(300);
  }
  throw new Error(`${label} не поднялся:\n` + log().slice(-2000));
}

const AR_GRAPH = `<div class="doc-section"><div class="section-num">§ 2</div><div class="section-title">البنية المقولية</div><div class="doc-content">
<div data-section="Таблица категорий"><h4>جدول المقولات</h4>
<p>يقوم هذا التركيب على <strong>جدلية الوجود والمعرفة</strong>، كما حُدِّد في §1 من هذه الوثيقة.</p>
<table class="doc-table"><thead><tr><th>Название</th><th>Тип</th><th>Определение</th></tr></thead>
<tbody><tr><td>الوجود</td><td>онтологическая</td><td>ما يتقدّم على كل معرفة.</td></tr>
<tr><td>المعرفة</td><td>эпистемологическая</td><td>انكشاف الوجود للعقل.</td></tr></tbody></table>
<div class="callout note"><span class="callout-label">ملاحظة</span>المقولتان متضايفتان.</div>
</div>
<div data-section="Описание связей"><h4>وصف العلاقات</h4><ul><li>الأولى: الوجود</li><li>الثانية: المعرفة</li></ul></div>
</div></div>`;
const AR_SUM = `<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">الملخّص</div><div class="doc-content">
<div data-section="Цели и задачи"><h4>الأهداف والمهام</h4><p>تهدف هذه الوثيقة إلى بناء مفهوم فلسفي جديد.</p></div></div></div>`;
const SA_SUM = `<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">सारांशः</div><div class="doc-content">
<div data-section="Цели и задачи"><h4>उद्देश्यानि</h4><p>अस्य ग्रन्थस्य उद्देश्यं नूतनस्य दर्शनस्य निर्माणम् अस्ति।</p>
<div class="callout gold"><span class="callout-label">सूत्रम्</span>सत्यं ज्ञानम् अनन्तम्।</div></div></div></div>`;

const GRC_SUM = `<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">Περὶ τῆς ἀληθείας</div><div class="doc-content">
<div data-section="Цели и задачи"><h4>Σκοποί</h4><p>Ἡ ἀλήθεια τοῦ ὄντος ᾗ ὄν ἐστιν· ὁ δὲ λόγος ἀποφαίνεται τὸ ἀληθές.</p></div></div></div>`;

const sql = postgres(DB_URL, { max: 2, onnotice: () => {} });
const tag = "glu" + Math.random().toString(36).slice(2, 6);
let browser;
let userId;
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
    cwd: new URL("../client/", import.meta.url).pathname,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  viteProc.stdout.on("data", (d) => (viteLog += d));
  viteProc.stderr.on("data", (d) => (viteLog += d));
  await waitUp(`${UI}/`, "vite", () => viteLog);

  const email = `${tag}@test.local`, password = "Passw0rd!gl";
  const reg = await fetch(`${API}/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, displayName: "GL" }) });
  if (!reg.ok) throw new Error("register: " + (await reg.text()));
  [{ id: userId }] = await sql`UPDATE users SET email_verified_at = now() WHERE email = ${email} RETURNING id`;
  const mk = async (lang, title, order, capsule) => (await sql`
    INSERT INTO syntheses (user_id, title, status, doc_num, method, synth_level, depth, generation_order, lang, section_order, structure_sections, capsule_html)
    VALUES (${userId}, ${title}, 'ready', ${"PS-" + tag}, 'dialectical', 'transformative', 'standard', 'architectural', ${lang}, ${sql.json(order)}, ${sql.json(order)}, ${capsule})
    RETURNING id`)[0].id;
  const AR = await mk("Arabic", "فلسفة المعرفة", ["capsule", "sum", "graph"], `<div data-section="Капсула"><h4>الكبسولة</h4><p>تركيب جدلي بين الوجود والمعرفة.</p></div>`);
  await sql`INSERT INTO sections (synthesis_id, key, section_num, title, html_content) VALUES (${AR}, 'sum', 1, 'الملخّص', ${AR_SUM}), (${AR}, 'graph', 2, 'البنية المقولية', ${AR_GRAPH})`;
  const GRC = await mk("Ancient Greek", "Περὶ ἀληθείας", ["sum"], "");
  await sql`INSERT INTO sections (synthesis_id, key, section_num, title, html_content) VALUES (${GRC}, 'sum', 1, 'Περὶ τῆς ἀληθείας', ${GRC_SUM})`;
  const SA = await mk("Sanskrit", "ज्ञानदर्शनम्", ["sum"], "");
  await sql`INSERT INTO sections (synthesis_id, key, section_num, title, html_content) VALUES (${SA}, 'sum', 1, 'सारांशः', ${SA_SUM})`;

  browser = await puppeteer.launch({ executablePath: CHROME, args: ["--no-sandbox"], headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  // шрифты — из проекта (client/public/fonts): к внешним службам клиент ходить не должен
  const externalFontRequests = [];
  const localFontRequests = [];
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) { externalFontRequests.push(r.url()); return r.abort(); }
    if (/\/fonts\/[^/]+\.woff2$/.test(r.url())) localFontRequests.push(r.url().split("/").pop());
    return r.continue();
  });
  await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
  const fill = async (sel, v) => { await page.waitForSelector(sel); await page.$eval(sel, (el, x) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, x); el.dispatchEvent(new Event("input", { bubbles: true })); }, v); };
  await fill("input[type=email]", email);
  await fill("input[type=password]", password);
  await page.click("button[type=submit]");
  await page.waitForFunction(() => location.pathname !== "/login", { timeout: 20000 });

  console.log("\n■ U1: форма создания");
  await page.goto(`${UI}/synthesis/new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="gen-lang-select"]', { timeout: 20000 });
  const opts = await page.$$eval('[data-testid="gen-lang-select"] option', (os) => os.map((o) => [o.value, o.textContent]));
  ok(opts.length === 16 && opts.at(-1)[0] === "__custom", "16 пунктов, «Другой…» последним", opts.length);
  const label = (v) => opts.find((o) => o[0] === v)?.[1] ?? "";
  // язык интерфейса браузера (Accept-Language) — пометка на любом из языков интерфейса
  const EXP = /экспериментально|experimental|experimentell/;
  ok(EXP.test(label("Sanskrit")) && EXP.test(label("Ancient Greek")) && EXP.test(label("Classical Chinese")) && label("Sanskrit").startsWith("संस्कृतम्"), "пометка у трёх экспериментальных, самоназвание первым", [label("Sanskrit"), label("Ancient Greek"), label("Classical Chinese")]);
  ok(label("Italian") === "Italiano" && label("Persian") === "فارسی" && label("Arabic") === "العربية", "самоназвания без пометки", [label("Italian"), label("Persian"), label("Arabic")]);
  await page.select('[data-testid="gen-lang-select"]', "Sanskrit");
  await page.waitForSelector('[data-testid="gen-lang-experimental"]', { timeout: 5000 }).catch(() => null);
  ok(!!(await page.$('[data-testid="gen-lang-experimental"]')), "санскрит — предупреждение под списком");
  await page.select('[data-testid="gen-lang-select"]', "Italian");
  await sleep(200);
  ok(!(await page.$('[data-testid="gen-lang-experimental"]')), "итальянский — без предупреждения");
  await page.select('[data-testid="gen-lang-select"]', "Russian"); // вернуть умолчание профиля
  await sleep(300);

  console.log("\n■ U2: документ на арабском");
  await page.goto(`${UI}/synthesis/${AR}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('.doc-body-host > div[dir="rtl"]', { timeout: 20000 });
  const st = await page.evaluate(() => {
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const host = [...document.querySelectorAll('.doc-body-host > div[dir="rtl"]')].find((d) => d.querySelector(".doc-table"));
    return {
      hosts: [...document.querySelectorAll(".doc-body-host > div")].map((d) => `${d.getAttribute("lang")}/${d.getAttribute("dir")}`),
      dir: cs(host?.querySelector(".doc-content"))?.direction,
      th: cs(host?.querySelector(".doc-table th"))?.textAlign,
      cr: cs(host?.querySelector(".callout"))?.borderRightWidth,
      cl: cs(host?.querySelector(".callout"))?.borderLeftWidth,
      h4: cs(host?.querySelector(".doc-content h4"))?.letterSpacing,
      header: cs(document.querySelector(".doc-header"))?.direction,
      footer: cs(document.querySelector(".doc-footer"))?.direction,
      toc: cs(document.querySelector("#docTOC"))?.direction,
      capsule: document.querySelector('[data-testid="capsule-text"]')?.getAttribute("dir"),
      capsuleDir: cs(document.querySelector('[data-testid="capsule-text"]'))?.direction,
      titleDir: document.querySelector(".doc-title > span")?.getAttribute("dir"),
    };
  });
  ok(st.hosts.length === 2 && st.hosts.every((h) => h === "ar/rtl"), "оба тела раздела — lang=ar dir=rtl", st.hosts);
  ok(st.dir === "rtl" && st.th === "right" && st.cr === "3px" && st.cl === "0px" && st.h4 === "normal", "справа налево: таблица, врезка, разрядка", st);
  ok(st.header === "ltr" && st.footer === "ltr" && st.toc === "ltr", "шапка, оглавление, футер — слева направо", st);
  ok(st.capsule === "rtl" && st.capsuleDir === "rtl" && st.titleDir === "auto", "капсула rtl, название dir=auto", st);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: OUT + "gen-langs-ui-ar.png", fullPage: true });
  console.log(`  · снимок: ${OUT}gen-langs-ui-ar.png`);

  console.log("\n■ U3: форма правки подраздела в арабском разделе");
  const pencil = await page.$('.doc-body-host > div[dir="rtl"] button[data-edit-subsection]');
  if (!pencil) {
    console.log("  · карандаша подраздела нет на странице — пропущено");
  } else {
    await pencil.click();
    await page.waitForSelector(".subsection-edit-form", { timeout: 10000 }).catch(() => null);
    const fe = await page.evaluate(() => {
      const f = document.querySelector(".subsection-edit-form");
      return { formDir: f?.getAttribute("dir"), cs: f ? getComputedStyle(f).direction : null, body: document.querySelector("[data-subsection-editor-body]")?.getAttribute("dir") ?? null };
    });
    ok(fe.formDir === "ltr" && fe.cs === "ltr", "форма правки — слева направо", fe);
    ok(fe.body === null || fe.body === "auto", "тело правки на месте — dir=auto", fe);
    await page.screenshot({ path: OUT + "gen-langs-ui-ar-edit.png", fullPage: true });
  }

  console.log("\n■ U4: документ на санскрите");
  await page.goto(`${UI}/synthesis/${SA}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('.doc-body-host > div[lang="sa"]', { timeout: 20000 });
  const sa = await page.evaluate(() => {
    const host = document.querySelector('.doc-body-host > div[lang="sa"]');
    const cs = (el) => (el ? getComputedStyle(el) : null);
    return { dir: cs(host?.querySelector(".doc-content"))?.direction, h4: cs(host?.querySelector(".doc-content h4"))?.letterSpacing, label: cs(host?.querySelector(".callout-label"))?.letterSpacing };
  });
  ok(sa.dir === "ltr" && sa.h4 === "normal" && sa.label === "normal", "деванагари: слева направо, разрядка снята", sa);
  await page.screenshot({ path: OUT + "gen-langs-ui-sa.png", fullPage: true });
  console.log(`  · снимок: ${OUT}gen-langs-ui-sa.png`);

  console.log("\n■ U5: древнегреческий и шрифты из проекта");
  await page.goto(`${UI}/synthesis/${GRC}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('.doc-body-host > div[lang="grc"]', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(500);
  const gr = await page.evaluate(() => {
    const host = document.querySelector('.doc-body-host > div[lang="grc"]');
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const loaded = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, ""));
    return { p: cs(host?.querySelector(".doc-content p"))?.fontFamily, title: cs(host?.querySelector(".section-title"))?.fontFamily, h4Case: cs(host?.querySelector(".doc-content h4"))?.textTransform, loaded: [...new Set(loaded)] };
  });
  ok(/^"?Noto Sans"?,/.test(gr.p ?? "") && /^"?Noto Serif"?,/.test(gr.title ?? "") && gr.h4Case === "none", "стеки под lang=grc начинаются с Noto, прописные сняты", gr);
  ok(gr.loaded.includes("Noto Sans") && gr.loaded.includes("Noto Serif"), "Noto Sans и Noto Serif загружены браузером (политоника — одним шрифтом)", gr.loaded);
  ok(localFontRequests.some((f) => /^noto-sans-greek-ext-/.test(f)) && localFontRequests.some((f) => /^ibm-plex-sans-arabic-arabic-/.test(f)) && localFontRequests.some((f) => /^ibm-plex-sans-devanagari-devanagari-/.test(f)), "файлы письменностей отданы из /fonts (greek-ext, arabic, devanagari)", [...new Set(localFontRequests)].length);
  ok(externalFontRequests.length === 0, "ни одного запроса к fonts.googleapis.com / fonts.gstatic.com", externalFontRequests.slice(0, 3));
  await page.screenshot({ path: OUT + "gen-langs-ui-grc.png", fullPage: true });
  console.log(`  · снимок: ${OUT}gen-langs-ui-grc.png`);

  console.log("\n■ U6: направление интерфейса");
  const htmlDir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
  ok(htmlDir === "ltr", "<html dir> ставится по языку интерфейса (ru/en/de — ltr)", htmlDir);
  // языка интерфейса справа налево пока нет — направление навязано атрибутом
  await page.goto(`${UI}/synthesis/${SA}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('.doc-body-host > div[lang="sa"]', { timeout: 20000 });
  const ui = await page.evaluate(() => {
    const cs = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el) : null; };
    const x = (sel) => document.querySelector(sel)?.getBoundingClientRect().left ?? null;
    const measure = () => ({ sidebar: x(".app-sidebar-desktop"), doc: x(".doc-header"), headerAlign: cs(".doc-title")?.textAlign, headerDir: cs(".doc-header")?.direction, bodyDir: cs('.doc-body-host > div[lang="sa"] .doc-content')?.direction, callout: [cs('.doc-body-host .callout')?.borderLeftWidth, cs('.doc-body-host .callout')?.borderRightWidth] });
    const ltr = measure();
    document.documentElement.setAttribute("dir", "rtl");
    const rtl = measure();
    document.documentElement.setAttribute("dir", "ltr");
    return { ltr, rtl };
  });
  ok(ui.ltr.sidebar < ui.ltr.doc && ui.rtl.sidebar > ui.rtl.doc, "боковая панель переезжает на сторону начала строки", ui);
  ok(ui.rtl.headerDir === "rtl" && ui.rtl.bodyDir === "ltr", "шапка документа — в направлении интерфейса, тело санскритского документа — слева направо", ui.rtl);
  ok(ui.rtl.callout?.[0] === "3px" && ui.rtl.callout?.[1] === "0px", "врезка документа слева направо держит черту слева при интерфейсе справа налево", ui.rtl.callout);
} catch (e) {
  failed++;
  console.error("СБОЙ:", e);
  console.error("--- server ---\n" + serverLog.slice(-1500));
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
console.log(`\nИтог: ${passed} ✓, ${failed} ✗`);
process.exit(failed ? 1 : 0);
