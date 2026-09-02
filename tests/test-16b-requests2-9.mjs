/**
 * Беседа 1.6b — тестовые запросы 2–9 протокола (07, «Последующие
 * запросы» беседы 1.6b) одним заходом, по команде пользователя.
 *
 * Харнесс: живой сервер (node --import tsx index.ts, преflight занятости
 * порта — грабля 1.6) на :3000 (vite-прокси захардкожен) + vite dev :5199
 * (CLIENT_ORIGIN на фактический origin — грабля 1.5) + живые PG/Redis +
 * мок Claude API (ANTHROPIC_BASE_URL; здесь нужен ТОЛЬКО как счётчик:
 * R9a доказывает, что открытие страницы generating-синтеза НЕ запускает
 * генерацию — вызовов к моку 0) + puppeteer-core с системным Chromium
 * /opt/google/chrome/chrome (кэш puppeteer в песочнице пуст — грабля 0.6).
 *
 * Данные — ПРЯМЫМИ вставками в БД, а не мок-генерацией: беседе 1.6b
 * нужен готовый контент, а не конвейер; секции собраны руками с
 * data-section / .doc-table / .callout / .risk — детерминированный
 * материал для теста CSS (R3) и якорей (R4).
 *
 * Сверки текста — по textContent/innerText страницы с нормализацией
 * пробелов (toLocaleString("ru") даёт NBSP; uppercase-грабля 1.5 здесь
 * не мешает: сверяемые строки не под text-transform, где под ним
 * (СИНТЕЗ ЗАВЕРШЁН — сам текст уже верхним регистром)).
 *
 * Запуск: node tests/test-16b-requests2-9.mjs (корень репо; PG+Redis
 * подняты, миграции+сиды применены).
 */
import { spawn } from "node:child_process";
import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";
import puppeteer from "puppeteer-core";

const SERVER_PORT = 3000; // vite proxy → :3000
const VITE_PORT = 5199;
const MOCK_PORT = 3993;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const UI = `http://127.0.0.1:${VITE_PORT}`;
const DB_URL = "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const CHROME = "/opt/google/chrome/chrome";

let passed = 0;
let failed = 0;
const fails = [];
function ok(cond, name) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    fails.push(name);
    console.log(`  ✗ ${name}`);
  }
}

/* ════ Мок Claude API — только счётчик вызовов (R9a) ═════════════════ */

const mockStats = { totalCalls: 0 };

function startMock() {
  const srv = http.createServer((req, res) => {
    if (req.url === "/stats") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(mockStats));
      return;
    }
    mockStats.totalCalls++;
    // Если генерация всё же запустилась (провал R9a) — отвечаем пустым
    // стримом, чтобы сервер не завис
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 1 } } })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "message_stop" })}\n\n`);
    res.end();
  });
  return new Promise((r) => srv.listen(MOCK_PORT, "127.0.0.1", () => r(srv)));
}

/* ════ Сервер и vite ═════════════════════════════════════════════════ */

let serverProc, viteProc;
let serverLog = "", viteLog = "";

async function assertPortFree(url, label) {
  try {
    const r = await fetch(url);
    if (r.ok) throw new Error(`${label} уже отвечает — на порту сирота от прошлого прогона (pkill -9 -f "[t]sx"; pkill -9 -f "[v]ite")`);
  } catch (e) {
    if (String(e).includes("сирота")) throw e;
    /* ECONNREFUSED — порт свободен */
  }
}

async function startServer() {
  await assertPortFree(`${API}/health`, "health сервера");
  serverProc = spawn(process.execPath, ["--import", "tsx", "index.ts"], {
    cwd: new URL("../server/", import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
      ANTHROPIC_API_KEY: "mock-key-ok",
      CLIENT_ORIGIN: UI,
      DATABASE_URL: DB_URL,
      REDIS_URL: "redis://localhost:6379",
      // Лимитер per-IP (наблюдение 1.6): браузерный заход даёт десятки
      // запросов с 127.0.0.1 — поднимаем порог, лимитер — предмет 0.2
      RATE_LIMIT_HTTP_PER_MINUTE: "100000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProc.stdout.on("data", (d) => (serverLog += d));
  serverProc.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${API}/health`);
      if (r.ok) return;
    } catch { /* поднимается */ }
    await sleep(300);
  }
  throw new Error("сервер не поднялся:\n" + serverLog.slice(-2000));
}

async function startVite() {
  await assertPortFree(UI + "/", "vite");
  viteProc = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort"], {
    cwd: new URL("../client/", import.meta.url).pathname,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  viteProc.stdout.on("data", (d) => (viteLog += d));
  viteProc.stderr.on("data", (d) => (viteLog += d));
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(UI + "/");
      if (r.ok) return;
    } catch { /* поднимается */ }
    await sleep(300);
  }
  throw new Error("vite не поднялся:\n" + viteLog.slice(-2000));
}

/* ════ API-хелперы ═══════════════════════════════════════════════════ */

async function makeUser(tag) {
  const email = `t16b-${tag}-${Date.now()}@test.local`;
  const password = "Passw0rd!16b";
  let r = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, displayName: `T16b ${tag}` }),
  });
  if (!r.ok) throw new Error("register: " + (await r.text()));
  return { email, password };
}

/* ════ Данные: прямые вставки ════════════════════════════════════════ */

const CAPSULE_TEXT =
  "Синтез соединяет критическую строгость Канта с диалектическим движением Гегеля в единую концепцию исторического априори.";

function secWrap(num, title, inner) {
  return (
    `<div class="doc-section">` +
    `<div class="section-num">РАЗДЕЛ ${num}</div>` +
    `<div class="section-title">${title}</div>` +
    `<div class="doc-content">${inner}</div>` +
    `</div>`
  );
}

const SUM_HTML = secWrap(
  1,
  "Резюме синтеза",
  `<div data-section="Цели и задачи"><h4>Цели и задачи</h4><p>Цель — соединить традиции. <em>Ключевое напряжение</em> сохраняется.</p></div>` +
  `<div data-section="Точки напряжения"><h4>Точки напряжения</h4><p>Конечность рассудка против тотальности духа.</p>` +
  `<div class="callout warning"><span class="callout-label">Предупреждение</span>Напряжение неустранимо полностью.</div>` +
  `<div class="callout note"><span class="callout-label">Заметка</span>Опосредование смягчает разрыв.</div>` +
  `<div class="callout gold"><span class="callout-label">Акцент</span>Историчность априори — ядро синтеза.</div>` +
  `<p>Риски: <span class="risk high">high</span> <span class="risk medium">medium</span> <span class="risk low">low</span></p></div>`,
);

const GRAPH_HTML = secWrap(
  2,
  "Граф категорий",
  `<div data-section="Таблица категорий"><h4>Таблица категорий</h4>` +
  `<table class="doc-table"><thead><tr><th>Категория</th><th>Тип</th><th>Определение</th></tr></thead>` +
  `<tbody><tr><td>Историческое априори</td><td>Онтологическая</td><td>Ядро синтеза.</td></tr>` +
  `<tr><td>Опосредование</td><td>Эпистемологическая</td><td>Механизм связи.</td></tr>` +
  `<tr><td>Снятие</td><td>Диалектическая</td><td>Форма движения.</td></tr></tbody></table></div>` +
  `<div data-section="Таблица связей"><h4>Таблица связей</h4><p>Связи описаны попарно.</p></div>`,
);

const GLOSSARY_HTML = secWrap(
  3,
  "Глоссарий",
  `<div data-section="Таблица определений"><h4>Таблица определений</h4>` +
  `<table class="doc-table"><thead><tr><th>Термин</th><th>Определение</th></tr></thead>` +
  `<tbody><tr><td>Априори</td><td>Историзованное условие опыта.</td></tr></tbody></table></div>`,
);

const CAPSULE_SECTION_HTML =
  `<div class="doc-section"><div class="section-num">КАПСУЛА</div>` +
  `<div class="section-title">Капсула</div>` +
  `<div class="doc-content"><div data-section="Капсула"><h4>Капсула</h4><p>${CAPSULE_TEXT}</p></div></div></div>`;

async function insertSynthesis(sql, userId, over = {}) {
  const o = {
    title: "Синтез",
    status: "ready",
    seed: "",
    context: "",
    isPublic: false,
    docNum: "",
    sectionOrder: ["sum"],
    capsuleHtml: "",
    inTok: 0,
    outTok: 0,
    cost: 0,
    ...over,
  };
  const [row] = await sql`
    INSERT INTO syntheses (user_id, title, status, seed, context, is_public,
      doc_num, method, synth_level, depth, generation_order, lang,
      section_order, structure_sections, capsule_html,
      total_input_tokens, total_output_tokens, total_cost_usd)
    VALUES (${userId}, ${o.title}, ${o.status}, ${o.seed}, ${o.context},
      ${o.isPublic}, ${o.docNum}, 'dialectical', 'transformative', 'standard',
      'architectural', 'Russian', ${sql.json(o.sectionOrder)},
      ${sql.json(o.sectionOrder)}, ${o.capsuleHtml},
      ${o.inTok}, ${o.outTok}, ${o.cost})
    RETURNING id`;
  return row.id;
}

async function insertSection(sql, synthesisId, key, num, title, html) {
  await sql`
    INSERT INTO sections (synthesis_id, key, section_num, title, html_content)
    VALUES (${synthesisId}, ${key}, ${num}, ${title}, ${html})`;
}

/* ════ Браузерные хелперы ════════════════════════════════════════════ */

/** Контролируемые React-input'ы: нативный setter + событие input (0.6) */
async function fill(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 8000 });
  await page.$eval(selector, (el, v) => {
    const proto = el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function pageText(page) {
  return page.evaluate(() => document.body.innerText);
}

const norm = (s) => s.replace(/\s+/g, " ");

async function waitText(page, substr, timeoutMs = 10000) {
  await page.waitForFunction(
    (s) => document.body.innerText.replace(/\s+/g, " ").includes(s),
    { timeout: timeoutMs },
    norm(substr),
  );
}

/** rgb-строка computed style для селектора */
async function css(page, selector, prop) {
  return page.$eval(selector, (el, p) => getComputedStyle(el)[p], prop);
}

/* ════ Основной сценарий ═════════════════════════════════════════════ */

async function main() {
  const mock = await startMock();
  await startServer();
  await startVite();
  const sql = postgres(DB_URL, { max: 3, onnotice: () => {} });

  /* ── Пользователи и данные ── */
  const A = await makeUser("owner");
  const B = await makeUser("other");
  const [aRow] = await sql`SELECT id FROM users WHERE email = ${A.email}`;
  const [bRow] = await sql`SELECT id FROM users WHERE email = ${B.email}`;

  // S1 — главный документ (R2–R5, R8): 3 раздела + капсула, философы,
  // зерно/контекст (disclosures), нетривиальные токены/стоимость
  const S1 = await insertSynthesis(sql, aRow.id, {
    title: "Синтез критической диалектики",
    docNum: "PS-1234-T16B",
    seed: "Историчность априорных форм познания",
    context: "Учитывать неокантианскую рецепцию",
    sectionOrder: ["sum", "graph", "glossary", "capsule"],
    capsuleHtml: CAPSULE_SECTION_HTML,
    inTok: 111111,
    outTok: 222222,
    cost: 1.2345,
  });
  await insertSection(sql, S1, "sum", 1, "Резюме синтеза", SUM_HTML);
  await insertSection(sql, S1, "graph", 2, "Граф категорий", GRAPH_HTML);
  await insertSection(sql, S1, "glossary", 3, "Глоссарий", GLOSSARY_HTML);
  await insertSection(sql, S1, "capsule", 4, "Капсула", CAPSULE_SECTION_HTML);
  await sql`INSERT INTO synthesis_lineage (synthesis_id, parent_type, parent_name, position)
    VALUES (${S1}, 'philosopher', 'Кант', 0), (${S1}, 'philosopher', 'Гегель', 1)`;

  // S2 — для публикации через UI (R6)
  const S2 = await insertSynthesis(sql, aRow.id, {
    title: "Герменевтика опосредования T16B",
    docNum: "PS-2222-T16B",
    inTok: 10, outTok: 20, cost: 0.01,
  });
  await insertSection(sql, S2, "sum", 1, "Резюме синтеза", SUM_HTML);

  // S_gen — status='generating' БЕЗ активного прогона (R9a)
  const SGEN = await insertSynthesis(sql, aRow.id, {
    title: "Незавершённый синтез T16B",
    docNum: "PS-3333-T16B",
    status: "generating",
    sectionOrder: ["sum", "graph"],
  });
  await insertSection(sql, SGEN, "sum", 1, "Резюме синтеза", SUM_HTML);

  // Чужие: приватный (403) и публичный (вкладка «Публичные»)
  const SPRIVB = await insertSynthesis(sql, bRow.id, {
    title: "Чужой приватный T16B", docNum: "PS-4444-T16B",
  });
  const SPUBB = await insertSynthesis(sql, bRow.id, {
    title: "Чужой публичный T16B", docNum: "PS-5555-T16B", isPublic: true,
  });
  await insertSection(sql, SPUBB, "sum", 1, "Резюме синтеза", SUM_HTML);

  const mock0 = mockStats.totalCalls;

  /* ── Браузер ── */
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push("console: " + m.text());
  });
  let navCount = 0;
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navCount++; });

  // Сниффер серверного поиска (R6)
  const searchRequests = [];
  page.on("request", (req) => {
    const u = req.url();
    if (u.includes("/api/v1/syntheses") && u.includes("search=")) searchRequests.push(u);
  });

  try {
    /* ── Логин A через UI ── */
    await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
    await fill(page, "input[type=email]", A.email);
    await fill(page, "input[type=password]", A.password);
    await page.click("button[type=submit]");
    await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 20000 });

    /* ══ R2: SynthesisPage — шапка, DocumentView, оглавление ══ */
    console.log("R2: SynthesisPage (DocumentHeader, DocumentView, TOC)");
    await page.goto(`${UI}/synthesis/${S1}`, { waitUntil: "domcontentloaded" });
    await waitText(page, "PS-1234-T16B");
    const t2 = norm(await pageText(page));
    ok(t2.includes("Синтез критической диалектики"), "заголовок документа");
    ok(t2.includes("PS-1234-T16B"), "docNum в шапке");
    ok(t2.includes("Диалектический"), "метод (ML) в шапке");
    ok(t2.includes("Преобразующий"), "уровень (SL) в шапке");
    ok(t2.includes("Стандартная"), "глубина (DL) в шапке");
    ok(t2.includes("На основе: Кант, Гегель"), "подзаголовок — философы из lineage");
    ok(
      t2.includes("Резюме синтеза") && t2.includes("Граф категорий") && t2.includes("Глоссарий"),
      "DocumentView рендерит HTML всех разделов",
    );
    ok(t2.includes("Историческое априори"), "содержимое таблицы раздела graph");
    const tocLinks = await page.evaluate(() =>
      [...document.querySelectorAll("#docTOC a")].map((a) => a.getAttribute("href")),
    );
    ok(
      ["#sec-sum", "#sec-graph", "#sec-glossary"].every((h) => tocLinks.includes(h)),
      "TOC содержит якоря на каждый раздел",
    );
    ok(!tocLinks.includes("#sec-capsule"), "capsule в TOC отсутствует");
    ok(
      tocLinks.some((h) => h && h.startsWith("#subsec-sum-")) &&
        tocLinks.some((h) => h && h.startsWith("#subsec-graph-")),
      "TOC содержит ссылки подразделов (subsections из GET /sections)",
    );
    const anchorsExist = await page.evaluate(() =>
      ["sec-sum", "sec-graph", "sec-glossary"].every((id) => !!document.getElementById(id)),
    );
    ok(anchorsExist, "якоря #sec-{key} расставлены на разделах");

    /* ══ R3: CSS документа (computed styles против исходника) ══ */
    console.log("R3: CSS (.doc-table, callout, risk, шапка)");
    ok(
      (await css(page, ".doc-header", "backgroundColor")) === "rgb(26, 40, 85)",
      ".doc-header — фон --blue-corp #1a2855",
    );
    ok(
      (await css(page, ".doc-table th", "backgroundColor")) === "rgb(26, 40, 85)",
      ".doc-table th — фон --blue-corp (рамки-шапка таблицы)",
    );
    const zebra = await page.evaluate(() => {
      const rows = document.querySelectorAll("#sec-graph ~ div .doc-table tbody tr, .doc-table tbody tr");
      if (rows.length < 2) return null;
      return {
        even: getComputedStyle(rows[1].querySelector("td")).backgroundColor,
        oddBorder: getComputedStyle(rows[0].querySelector("td")).borderBottomColor,
      };
    });
    ok(zebra?.even === "rgb(242, 240, 235)", ".doc-table — зебра чётных строк (--off)");
    ok(zebra?.oddBorder === "rgb(216, 212, 204)", ".doc-table td — рамка --rule");
    ok(
      (await css(page, ".callout.warning", "borderLeftColor")) === "rgb(139, 26, 26)",
      ".callout.warning — красная кромка (--red)",
    );
    ok(
      (await css(page, ".callout.note", "backgroundColor")) === "rgb(232, 236, 248)",
      ".callout.note — фон --blue-light",
    );
    ok(
      (await css(page, ".callout.gold", "borderLeftColor")) === "rgb(184, 134, 11)",
      ".callout.gold — золотая кромка (--gold)",
    );
    const riskColors = await page.evaluate(() => ({
      high: getComputedStyle(document.querySelector(".risk.high")).color,
      medium: getComputedStyle(document.querySelector(".risk.medium")).color,
      low: getComputedStyle(document.querySelector(".risk.low")).color,
    }));
    ok(riskColors.high === "rgb(139, 26, 26)", ".risk.high окрашен (--red)");
    ok(riskColors.medium === "rgb(184, 134, 11)", ".risk.medium окрашен (--gold)");
    ok(riskColors.low === "rgb(26, 92, 42)", ".risk.low окрашен (--green-check)");
    ok(
      (await css(page, ".section-title", "color")) === "rgb(26, 40, 85)",
      ".section-title — цвет --blue-corp",
    );

    /* ══ R4: навигация — TOC, якоря подразделов, кнопки ⏫ ══ */
    console.log("R4: навигация (клики TOC, якоря, ⏫)");
    /** Элемент в viewport после smooth-прокрутки: последний раздел
     *  упирается в низ документа, поэтому |top|<ε — неверный ассерт;
     *  критерий — элемент видим и прокрутка ушла вниз */
    const inViewport = (id) =>
      page.evaluate((elId) => {
        const el = document.getElementById(elId);
        if (!el) return { missing: true };
        const r = el.getBoundingClientRect();
        return {
          top: r.top,
          visible: r.top > -60 && r.top < window.innerHeight,
          scrollY: window.scrollY,
        };
      }, id);
    await page.click('#docTOC a[href="#sec-glossary"]');
    await sleep(1000); // scroll-behavior: smooth
    const gl = await inViewport("sec-glossary");
    ok(
      !gl.missing && gl.visible && gl.scrollY > 200,
      `клик TOC → плавная прокрутка к разделу glossary (top=${Math.round(gl.top ?? -1)}, y=${Math.round(gl.scrollY ?? -1)})`,
    );
    const subAnchor = await page.evaluate(() => {
      const a = [...document.querySelectorAll('#docTOC a[href^="#subsec-sum-"]')][0];
      if (!a) return null;
      const id = a.getAttribute("href").slice(1);
      return { id, exists: !!document.getElementById(id) };
    });
    ok(subAnchor?.exists === true, "якорь подраздела существует в теле раздела");
    if (subAnchor?.exists) {
      await page.click(`#docTOC a[href="#${subAnchor.id}"]`);
      await sleep(1000);
      const st = await inViewport(subAnchor.id);
      ok(!st.missing && st.visible, `якорь подраздела работает (top=${Math.round(st.top ?? -1)})`);
    } else {
      ok(false, "якорь подраздела работает (пропущено: якоря нет)");
    }
    const backBtns = await page.evaluate(() => ({
      inTitles: document.querySelectorAll(".section-title .toc-back-btn").length,
      inSubs: document.querySelectorAll("[data-section] h4 .toc-back-btn").length,
    }));
    ok(backBtns.inTitles >= 3, "кнопка ⏫ у каждого заголовка раздела");
    ok(backBtns.inSubs >= 3, "кнопки ⏫ у подразделов (h4)");
    if (backBtns.inTitles > 0) {
      await page.click(".section-title .toc-back-btn");
      await sleep(1000);
      const tocTop = await page.evaluate(
        () => document.getElementById("docTOC")?.getBoundingClientRect().top ?? 9999,
      );
      ok(Math.abs(tocTop) < 250, "⏫ возвращает к оглавлению");
    } else {
      ok(false, "⏫ возвращает к оглавлению (пропущено: кнопок нет)");
    }

    /* ══ R5: капсула — в шапке и не среди тел ══ */
    console.log("R5: капсула (в шапке, без дубля в телах)");
    const capsule = await page.evaluate((capText) => {
      const header = document.querySelector(".doc-header");
      const disc = header?.querySelector(".header-disclosure-capsule");
      const bodyDataSections = [...document.querySelectorAll(".doc-header ~ * [data-section]")]
        .map((el) => el.getAttribute("data-section"));
      return {
        inHeader: !!disc && disc.textContent.includes(capText),
        open: disc?.open === true,
        capsuleInBodies: bodyDataSections.includes("Капсула"),
        occurrences: (document.body.innerText.match(new RegExp(capText.slice(0, 40), "g")) ?? []).length,
      };
    }, CAPSULE_TEXT);
    ok(capsule.inHeader, "капсула показана в шапке (◈, текст)");
    ok(capsule.open, "капсула раскрыта по умолчанию");
    ok(!capsule.capsuleInBodies, "раздел «Капсула» НЕ отрендерен среди тел");
    ok(capsule.occurrences === 1, "текст капсулы встречается ровно один раз");
    // Сверка по textContent: summary под text-transform: uppercase,
    // innerText отдаёт трансформированный текст (грабля 1.5)
    const discSummaries = await page.evaluate(() =>
      [...document.querySelectorAll(".doc-header details summary")].map(
        (s) => s.textContent.trim(),
      ),
    );
    ok(discSummaries.includes("Зерно концепции"), "disclosure «Зерно концепции» в шапке");
    ok(
      discSummaries.includes("Дополнительный контекст"),
      "disclosure «Дополнительный контекст»",
    );

    /* ══ R8 (по порядку страницы): DocumentFooter ══ */
    console.log("R8: DocumentFooter (токены + стоимость как в БД)");
    const footerText = norm(await page.$eval(".doc-footer", (el) => el.innerText));
    ok(
      footerText.includes("Стоимость: $1.2345 (123.45¢)"),
      "стоимость $X.XXXX — ровно totalCostUsd, без пересчёта",
    );
    ok(
      /Токены: 111\s?111 вх\. \+ 222\s?222 вых\./.test(
        footerText.replace(/[\u00A0\u202F]/g, " "),
      ),
      "суммарные токены (input + output) в футере",
    );
    ok(footerText.includes("PS-1234-T16B"), "сессия футера = docNum");
    ok(footerText.includes("СИНТЕЗ ЗАВЕРШЁН"), "validity-stamp у ready-синтеза");
    ok(footerText.includes("Кант, Гегель"), "философы в футере");

    /* ══ R6: CatalogPage ══ */
    console.log("R6: CatalogPage (вкладки, публикация, серверный поиск)");
    await page.goto(`${UI}/catalog`, { waitUntil: "domcontentloaded" });
    await waitText(page, "Синтез критической диалектики");
    let tCat = norm(await pageText(page));
    ok(
      tCat.includes("Синтез критической диалектики") &&
        tCat.includes("Герменевтика опосредования T16B") &&
        tCat.includes("Незавершённый синтез T16B"),
      "вкладка «Мои» — синтезы текущего пользователя",
    );
    ok(!tCat.includes("Чужой публичный T16B"), "чужих синтезов во вкладке «Мои» нет");

    // Публикация S2 через UI
    const patchWait = page.waitForResponse(
      (r) => r.url().includes(`/api/v1/syntheses/${S2}`) && r.request().method() === "PATCH",
      { timeout: 8000 },
    );
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("a button")].find(
        (b) => b.textContent.trim() === "Опубликовать" &&
               b.closest("a").textContent.includes("Герменевтика опосредования"),
      );
      btn.click();
    });
    const patchResp = await patchWait;
    ok(patchResp.ok(), "PATCH /syntheses/:id { isPublic: true } ушёл и успешен");
    const [s2row] = await sql`SELECT is_public FROM syntheses WHERE id = ${S2}`;
    ok(s2row.is_public === true, "публикация видна в БД");

    // Вкладка «Публичные»: свой опубликованный + чужой публичный
    await page.evaluate(() => {
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Публичные").click();
    });
    await waitText(page, "Чужой публичный T16B");
    tCat = norm(await pageText(page));
    ok(tCat.includes("Герменевтика опосредования T16B"), "опубликованный синтез появился в «Публичные»");
    ok(tCat.includes("Чужой публичный T16B"), "чужой публичный синтез виден");
    ok(!tCat.includes("Чужой приватный T16B"), "чужой приватный во вкладке отсутствует");

    // Серверный поиск ?search=
    await page.evaluate(() => {
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Мои").click();
    });
    await waitText(page, "Незавершённый синтез T16B");
    const searchCount0 = searchRequests.length;
    await fill(page, "input[type=search]", "Герменевтика");
    await page.waitForFunction(
      () => !document.body.innerText.includes("Незавершённый синтез T16B") &&
            document.body.innerText.includes("Герменевтика опосредования T16B"),
      { timeout: 8000 },
    );
    ok(true, "поиск отфильтровал список (остался только матч)");
    ok(
      searchRequests.length > searchCount0 &&
        searchRequests.some((u) => u.includes("search=") && decodeURIComponent(u).includes("Герменевтика")),
      "поиск ушёл на сервер параметром ?search=",
    );
    await fill(page, "input[type=search]", "");
    await waitText(page, "Незавершённый синтез T16B");

    /* ══ R7: SynthesisCard ══ */
    console.log("R7: SynthesisCard (содержимое, клик-навигация)");
    const card = await page.evaluate(() => {
      const a = [...document.querySelectorAll("a[href^='/synthesis/']")].find((el) =>
        el.textContent.includes("Синтез критической диалектики"),
      );
      return a ? { text: a.innerText.replace(/\s+/g, " "), href: a.getAttribute("href") } : null;
    });
    ok(!!card, "карточка S1 найдена");
    ok(card.text.includes("Диалектический × Преобразующий"), "метод × уровень на карточке");
    ok(card.text.includes("Кант, Гегель"), "философы через запятую");
    ok(/\d{2} .+ \d{4}/.test(card.text), "дата создания на карточке");
    await page.evaluate(() => {
      [...document.querySelectorAll("a[href^='/synthesis/']")]
        .find((el) => el.textContent.includes("Синтез критической диалектики"))
        .click();
    });
    await page.waitForFunction(
      (id) => location.pathname === `/synthesis/${id}`,
      { timeout: 8000 },
      S1,
    );
    ok(true, "клик по карточке → навигация на /synthesis/:id");
    await waitText(page, "PS-1234-T16B");

    /* ══ R9: edge cases ══ */
    console.log("R9: edge cases (generating без перезапуска, 404, 403)");
    const [glBefore] = await sql`SELECT count(*)::int AS n FROM generation_log WHERE synthesis_id = ${SGEN}`;
    await page.goto(`${UI}/synthesis/${SGEN}`, { waitUntil: "domcontentloaded" });
    await waitText(page, "ГЕНЕРАЦИЯ ДОКУМЕНТА");
    const tGen = norm(await pageText(page));
    ok(
      tGen.includes("Резюме синтеза"),
      "generating: готовые разделы показаны, страница не пустая",
    );
    ok(
      !tGen.includes("СИНТЕЗ ЗАВЕРШЁН"),
      "generating: validity-stamp не показан",
    );
    // Прогресс-панель с шагами (GenerationProgress) на странице.
    // Правка 2026-09-02: .progress-step рисуется капителью исходника,
    // а innerText отдаёт ОТРИСОВАННЫЙ текст — сравниваем без регистра.
    ok(
      tGen.toLowerCase().includes("граф категорий") ||
        tGen.toLowerCase().includes("graph"),
      "generating: шаг ожидаемого раздела в прогрессе",
    );
    await sleep(2500); // время на гипотетический незаконный запуск
    const [glAfter] = await sql`SELECT count(*)::int AS n FROM generation_log WHERE synthesis_id = ${SGEN}`;
    const [sgenRow] = await sql`SELECT status FROM syntheses WHERE id = ${SGEN}`;
    ok(mockStats.totalCalls - mock0 === 0, "вызовов к Claude-моку 0 — генерация НЕ перезапущена");
    ok(glAfter.n === glBefore.n, "generation_log не растёт (viewOnly-подписка)");
    ok(sgenRow.status === "generating", "статус синтеза не изменился");

    // 404
    await page.goto(`${UI}/synthesis/00000000-0000-4000-8000-000000000000`, { waitUntil: "domcontentloaded" });
    await waitText(page, "404");
    ok(norm(await pageText(page)).includes("Синтез не найден"), "несуществующий id → 404-страница");

    // 403 — чужой приватный
    await page.goto(`${UI}/synthesis/${SPRIVB}`, { waitUntil: "domcontentloaded" });
    await waitText(page, "403");
    ok(
      norm(await pageText(page)).includes("доступен только владельцу"),
      "чужой непубличный синтез → 403-страница",
    );

    /* ── pageerror-гигиена: «Failed to load resource» — известные ложные
          (fonts 403 egress, 401 /auth/me до логина StrictMode — грабля
          1.5, здесь же 403/401 нашего теста доступа в R9) ── */
    const realErrors = consoleErrors.filter(
      (e) => !e.includes("favicon") && !e.includes("Failed to load resource"),
    );
    ok(realErrors.length === 0, `ошибок страницы нет (${realErrors.length}): ${realErrors[0] ?? ""}`);
  } finally {
    console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗`);
    if (failed) console.log("Провалы:\n - " + fails.join("\n - "));
    // Явное завершение: browser.close/keep-alive-сокеты мока держали
    // event loop (прогон 3 висел в finally до timeout)
    await Promise.race([browser.close(), sleep(3000)]).catch(() => {});
    await Promise.race([sql.end({ timeout: 2 }), sleep(2500)]).catch(() => {});
    serverProc?.kill("SIGKILL");
    viteProc?.kill("SIGKILL");
    mock.closeAllConnections?.();
    mock.close();
    process.exit(failed ? 1 : 0);
  }
}

main().catch((e) => {
  console.error("ФАТАЛЬНО:", e);
  console.error("--- server log tail ---\n" + serverLog.slice(-1200));
  console.error("--- vite log tail ---\n" + viteLog.slice(-600));
  serverProc?.kill("SIGKILL");
  viteProc?.kill("SIGKILL");
  process.exit(1);
});
