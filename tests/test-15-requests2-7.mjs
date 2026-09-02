/**
 * Беседа 1.5, тестовые запросы 2–7 (одним заходом, по команде):
 *   R2 — полный UI-цикл: /synthesis/new → зерно, 2 философа, 3 секции,
 *        метод dialectical → CostEstimate → «Генерировать» → шаги ◯/⟳/✓
 *   R3 — PhilosopherPicker: эпохи (Античность Пифагор→Плотин,
 *        Средневековье Августин→Кузанский), выбор/снятие, счётчик
 *   R4 — SectionPicker: secCtx-поле graph появляется/скрывается;
 *        extGraphMetrics sync с графом; creative + [evolution] →
 *        SectionWarnings ⚠ + CompatAdvisor-панель
 *   R5 — GenerationProgress на живой (мок) генерации: шаги по мере
 *        стриминга, счётчик символов растёт в реальном времени,
 *        redirect на /synthesis/:id после завершения
 *   R6 — валидация v11: 0 участников+0 зерна → ошибка; участники без
 *        зерна → допускается (полный цикл); 0 секций → ошибка;
 *        keepFullBudget скрыт без концепций в пуле
 *   R7 — responsive 375px: философы в 2 колонки, секции в 1, кнопка
 *        «Синтезировать» видна
 *
 * Инфраструктура: мок Claude SSE (порт 3987, контент по сниффингу
 * промпта — паттерн test-14), реальный сервер (tsx index.ts, порт 3000 —
 * vite-прокси захардкожен на :3000), vite dev (порт 5199), puppeteer-core
 * с системным Chromium /opt/google/chrome/chrome (грабля 0.6: .cache
 * puppeteer не переживает сессии). Контролируемые input'ы заполняются
 * нативным setter'ом (грабля 0.6).
 *
 * Требует: PG16+Redis подняты, миграции + 3 сида применены.
 * Запуск: node tests/test-15-requests2-7.mjs (из корня репо).
 */
import http from "node:http";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";

const CHROME = "/opt/google/chrome/chrome";
const MOCK_PORT = 3987;
const SERVER_PORT = 3000; // vite proxy → :3000
const VITE_PORT = 5199;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const UI = `http://127.0.0.1:${VITE_PORT}`;
const DB_URL =
  process.env.DATABASE_URL ??
  "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;
const fails = [];
function check(name, cond) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    fails.push(name);
    console.log(`  ✗ ${name}`);
  }
}

/* ════ Мок Claude API (сниффинг промпта — паттерн test-14) ═══════════ */

function chunkify(s, n) {
  const out = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

const NODE_NAMES = [
  "Трансцендентальное единство", "Диалектическое снятие", "Категорический императив",
  "Абсолютный дух", "Вещь в себе", "Историчность разума",
  "Синтетическое априори", "Опосредование", "Автономия воли", "Тотальность",
];

function graphHtml() {
  const nodeRows = NODE_NAMES.map((n, i) =>
    `<tr><td>${n}</td><td>${i % 2 ? "Эпистемологическая" : "Онтологическая"}</td>` +
    `<td>Определение категории «${n}».</td><td>0.${9 - (i % 5)}</td><td>0.${8 - (i % 4)}</td>` +
    `<td>${i % 2 ? "Гегель" : "Кант"}</td></tr>`).join("");
  const edges = [];
  for (let i = 0; i < 18; i++) {
    const a = NODE_NAMES[i % 10], b = NODE_NAMES[(i + 3) % 10];
    edges.push(`<tr><td>${a}</td><td>обусловливает</td><td>${b}</td>` +
      `<td>диалектическая</td><td>однонаправленная</td><td>0.${5 + (i % 5)}</td></tr>`);
  }
  const topo = NODE_NAMES.map((n, i) =>
    `<tr><td>${n}</td><td>${i < 5 ? "I — Основания" : "II — Развёртывание"}</td>` +
    `<td>${i === 0 ? "центральная" : "периферийная"}</td><td>${i % 2 ? "антитезис" : "тезис"}</td></tr>`).join("");
  return `<div class="doc-section" data-section="Методология построения графа"><p>Граф построен.</p></div>` +
    `<div class="doc-section" data-section="Таблица категорий"><table class="doc-table"><thead><tr><th>Категория</th><th>Тип</th><th>Определение</th><th>Центральность</th><th>Определённость</th><th>Происхождение</th></tr></thead><tbody>${nodeRows}</tbody></table></div>` +
    `<div class="doc-section" data-section="Таблица связей"><table class="doc-table"><thead><tr><th>Источник</th><th>Описание</th><th>Цель</th><th>Тип</th><th>Направленность</th><th>Сила</th></tr></thead><tbody>${edges.join("")}</tbody></table></div>` +
    `<div class="doc-section" data-section="Топология графа"><div data-section="Топологическая таблица"><table class="doc-table"><thead><tr><th>Категория</th><th>Кластер</th><th>Структурные роли</th><th>Процессуальные роли</th></tr></thead><tbody>${topo}</tbody></table></div></div>`;
}

function glossaryHtml() {
  const terms = NODE_NAMES.map((n, i) =>
    `<tr><td>${n}</td><td>Определение «${n}».</td><td>Трансформация №${i + 1}.</td></tr>`).join("");
  return `<div class="doc-section" data-section="Таблица определений"><table class="doc-table"><thead><tr><th>Термин</th><th>Принятое определение в данной концепции</th><th>Трансформация значения в синтезе</th></tr></thead><tbody>${terms}</tbody></table></div>`;
}

function thesesHtml() {
  const rows = NODE_NAMES.slice(0, 6).map((n, i) =>
    `<tr><td>${i + 1}</td><td>Тезис о том, что ${n.toLowerCase()} образует ядро.</td>` +
    `<td>${["онтол.", "эпистем.", "этич."][i % 3]}</td><td>высокая</td><td>${n}</td></tr>`).join("");
  return `<div class="doc-section" data-section="Сводная таблица тезисов"><table class="doc-table"><thead><tr><th>№</th><th>Формулировка тезиса</th><th>Тип</th><th>Степень новизны</th><th>Связанные категории</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function sumHtml() {
  // Средний объём — чтобы стрим шёл несколько секунд (живой счётчик R5)
  const pad = `<div class="doc-section" data-section="Развёрнутое изложение">${
    `<p>${"Развёртывание синтетической позиции продолжается. ".repeat(10)}</p>`.repeat(6)}</div>`;
  return `<div class="doc-section" data-section="Цели и задачи"><p>Цель синтеза — соединить традиции.</p></div>` +
    `<div class="doc-section" data-section="Точки напряжения"><p>Напряжение между рассудком и духом.</p></div>` + pad;
}

function pickHtml(prompt) {
  // Сниффинг по ХВОСТУ промпта (зона «ЗАДАНИЕ: …»): контекст из
  // предыдущих разделов выше по промпту содержит те же маркеры
  // («Таблица категорий» в контексте глоссария) и ломает наивный
  // includes по всему промпту — grabla этого теста
  const i = prompt.lastIndexOf("ЗАДАНИЕ");
  const task = i >= 0 ? prompt.slice(i) : prompt;
  if (task.includes("Таблица категорий")) return graphHtml();
  if (task.includes("Таблица определений") || task.includes("Термин | Принятое определение"))
    return glossaryHtml();
  if (task.includes("Сводная таблица") && /тезис/i.test(task)) return thesesHtml();
  return sumHtml();
}

function startMock() {
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      let prompt = "";
      try {
        prompt = JSON.parse(body).messages?.[0]?.content ?? "";
      } catch { /* пусто */ }
      const html = pickHtml(prompt);
      const chunks = chunkify(html, 150);
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      send({ type: "message_start", message: { usage: { input_tokens: Math.ceil(prompt.length / 4) } } });
      for (const c of chunks) {
        send({ type: "content_block_delta", delta: { type: "text_delta", text: c } });
        await sleep(45); // ~45 мс/чанк — виден живой рост счётчика (R5)
      }
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: Math.ceil(html.length / 4) } });
      send({ type: "message_stop" });
      res.end();
    });
  });
  return new Promise((r) => srv.listen(MOCK_PORT, "127.0.0.1", () => r(srv)));
}

/* ════ Сервер и vite ═════════════════════════════════════════════════ */

let serverProc, viteProc;
let serverLog = "", viteLog = "";

async function startServer() {
  serverProc = spawn("npx", ["tsx", "index.ts"], {
    cwd: new URL("../server/", import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
      ANTHROPIC_API_KEY: "mock-key-ok",
      CLIENT_ORIGIN: `http://127.0.0.1:${VITE_PORT}`,
      DATABASE_URL: DB_URL,
      REDIS_URL: "redis://localhost:6379",
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
  throw new Error("server не поднялся:\n" + serverLog.slice(-2000));
}

async function startVite() {
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

/** <select>: value + событие change */
async function setSelect(page, matchOptionText, value) {
  await page.evaluate(({ matchOptionText, value }) => {
    const sel = [...document.querySelectorAll("select")].find((s) =>
      [...s.options].some((o) => o.textContent.includes(matchOptionText)),
    );
    if (!sel) throw new Error("select не найден: " + matchOptionText);
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")
      .set.call(sel, value);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, { matchOptionText, value });
}

/** Клик по label с точным текстом чекбокса (философ/раздел) */
async function clickCheckboxLabel(page, text) {
  const ok = await page.evaluate((text) => {
    const label = [...document.querySelectorAll("label")].find(
      (l) => l.textContent.trim() === text && l.querySelector("input[type=checkbox]"),
    );
    if (!label) return false;
    label.querySelector("input[type=checkbox]").click();
    return true;
  }, text);
  if (!ok) throw new Error("чекбокс-label не найден: " + text);
}

async function pageText(page) {
  return page.evaluate(() => document.body.innerText);
}

/* ════ Основной сценарий ═════════════════════════════════════════════ */

const EMAIL = `t15-${Date.now()}@example.com`;
const PASSWORD = "test-pass-15";

async function main() {
  const mock = await startMock();
  await startServer();
  await startVite();

  // Пользователь — через API, вход — через UI-форму
  const reg = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, displayName: "T15" }),
  });
  if (!reg.ok) throw new Error("register: " + (await reg.text()));

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  try {
    /* ── Логин через UI ── */
    await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
    await fill(page, "input[type=email]", EMAIL);
    await fill(page, "input[type=password]", PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 20000 });

    await page.goto(`${UI}/synthesis/new`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes("пифагор"),
      { timeout: 10000 },
    );

    /* ══ R3: PhilosopherPicker ══ */
    console.log("R3: PhilosopherPicker (эпохи, выбор, счётчик)");
    /* Правка 2026-09-02 (единство стилей с исходником): колонка эпохи —
       .phil-col-group, метка .phil-group-label и чекбоксы лежат В НЁМ,
       а не «метка + соседний grid» (разметка #philBox [3651]) */
    const epochs = await page.evaluate(() => {
      const out = {};
      for (const groupLabel of ["Досократики и Античность", "Средневековье"]) {
        const group = [...document.querySelectorAll(".phil-col-group")].find(
          (g) =>
            g.querySelector(".phil-group-label")?.textContent.trim() ===
            groupLabel,
        );
        if (!group) { out[groupLabel] = null; continue; }
        const names = [...group.querySelectorAll("label")].map((l) => l.textContent.trim());
        out[groupLabel] = { first: names[0], last: names[names.length - 1], count: names.length };
      }
      return out;
    });
    check("эпоха «Досократики и Античность»: Пифагор → Плотин",
      epochs["Досократики и Античность"]?.first === "Пифагор" &&
      epochs["Досократики и Античность"]?.last === "Плотин");
    check("эпоха «Средневековье»: Августин → Николай Кузанский",
      epochs["Средневековье"]?.first === "Августин" &&
      epochs["Средневековье"]?.last === "Николай Кузанский");

    check("счётчик: выбрано: 0", (await pageText(page)).toLowerCase().includes("выбрано: 0"));
    await clickCheckboxLabel(page, "Пифагор");
    await clickCheckboxLabel(page, "Гераклит");
    check("после выбора двух: выбрано: 2", (await pageText(page)).toLowerCase().includes("выбрано: 2"));
    await clickCheckboxLabel(page, "Пифагор");
    check("после снятия одного: выбрано: 1", (await pageText(page)).toLowerCase().includes("выбрано: 1"));
    const checkedState = await page.evaluate(() => {
      const find = (t) => [...document.querySelectorAll("label")]
        .find((l) => l.textContent.trim() === t)?.querySelector("input").checked;
      return { p: find("Пифагор"), g: find("Гераклит") };
    });
    check("состояние чекбоксов: Пифагор снят, Гераклит выбран",
      checkedState.p === false && checkedState.g === true);
    await clickCheckboxLabel(page, "Гераклит"); // чистое состояние

    /* ══ R4: SectionPicker + CompatAdvisor/SectionWarnings ══ */
    console.log("R4: SectionPicker (secCtx, extGraphMetrics) + Advisor");
    const ctxSelector = 'textarea[placeholder*="Граф категорий"]';
    /* Правка 2026-09-02: как в исходнике, textarea всегда в DOM и
       скрывается классом (.sec-ctx-field без .open) — проверяем видимость */
    const ctxVisible = async () =>
      page.$eval(ctxSelector, (el) => el.offsetParent !== null).catch(() => false);
    check("secCtx-поле графа скрыто изначально", !(await ctxVisible()));
    // Кнопка «+» строки графа: рядом с label «Граф категорий»
    const clickGraphCtxBtn = () => page.evaluate(() => {
      const label = [...document.querySelectorAll("label")].find(
        (l) => l.textContent.trim() === "Граф категорий" && l.querySelector("input"),
      );
      label.parentElement.querySelector("button[title='Доп. контекст для раздела']").click();
    });
    await clickGraphCtxBtn();
    check("клик «+» → secCtx-поле графа появилось", await ctxVisible());
    await clickGraphCtxBtn();
    check("повторный клик → поле скрылось", !(await ctxVisible()));

    check("extGraphMetrics виден при выбранном графе",
      (await pageText(page)).toLowerCase().includes("расширенные характеристики"));
    await clickCheckboxLabel(page, "Граф категорий");
    check("граф снят → extGraphMetrics скрыт",
      !(await pageText(page)).toLowerCase().includes("расширенные характеристики"));
    await clickCheckboxLabel(page, "Граф категорий");
    check("граф возвращён → extGraphMetrics снова виден",
      (await pageText(page)).toLowerCase().includes("расширенные характеристики"));

    // creative + sections=[evolution]
    await setSelect(page, "Творческий", "creative");
    for (const s of ["Граф категорий", "Глоссарий терминов", "Корпус тезисов",
      "Историческая контекстуализация", "Анализ названия", "Критический анализ"]) {
      await clickCheckboxLabel(page, s);
    }
    await clickCheckboxLabel(page, "Эволюция и перспективы");
    await page.waitForFunction(
      () => {
        const w = document.querySelector('[data-block="section-warnings"]');
        return w && w.innerText.toLowerCase().includes("эволюция и перспективы");
      },
      { timeout: 8000 },
    );
    const warnText = await page.$eval('[data-block="section-warnings"]', (el) => el.innerText);
    check("SectionWarnings: ⚠ о зависимостях evolution",
      warnText.toLowerCase().includes("⚠") && warnText.toLowerCase().includes("без разделов") &&
      warnText.toLowerCase().includes("эволюция и перспективы"));
    const compat = await page.$eval('[data-block="compat-panel"]', (el) => ({
      severity: el.getAttribute("data-severity"),
      text: el.innerText,
    })).catch(() => null);
    check("CompatAdvisor-панель отображается (creative)",
      compat !== null && compat.text.toLowerCase().includes("надёжное качество"));
    check("severity панели = stable (comparative:creative)",
      compat?.severity === "stable");
    check("чип раздела «Эволюция и перспективы» в панели",
      compat?.text.toLowerCase().includes("эволюция и перспективы"));

    /* ══ R6a/c: валидация без POST ══ */
    console.log("R6: валидация формы (v11)");
    await page.goto(`${UI}/synthesis/new`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes("синтезировать концепцию"),
      { timeout: 10000 },
    );
    check("keepFullBudget скрыт без концепций в пуле",
      !(await pageText(page)).toLowerCase().includes("сохранять полный бюджет секций"));

    const clickSubmit = () => page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent.includes("Синтезировать Концепцию")).click();
    });
    await clickSubmit(); // 0 участников, пустое зерно
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes("свободный синтез"),
      { timeout: 5000 },
    );
    check("0 участников + 0 зерна → ошибка «свободный синтез требует зерна»", true);
    check("генерация не стартовала (нет прогресс-панели)",
      !(await pageText(page)).toLowerCase().includes("в процессе"));

    // 0 секций → ошибка (зерно заполнено, участников нет — зерно снимает первую)
    await fill(page, "textarea[placeholder*='время как ткань']", "Зерно для проверки секций");
    for (const s of ["Граф категорий", "Глоссарий терминов", "Корпус тезисов",
      "Историческая контекстуализация", "Анализ названия", "Критический анализ"]) {
      await clickCheckboxLabel(page, s);
    }
    await clickSubmit();
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes("хотя бы один раздел"),
      { timeout: 5000 },
    );
    check("0 секций → ошибка «выберите хотя бы один раздел»", true);

    /* ══ R7: responsive 375px ══ */
    console.log("R7: responsive (мобильная ширина)");
    await page.setViewport({ width: 375, height: 812 });
    await page.goto(`${UI}/synthesis/new`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes("пифагор"),
      { timeout: 10000 },
    );
    /* Сетки исходника: .checkboxes-row — repeat(auto-fill, minmax(152px, 1fr)),
       .checkboxes-row.sections-row — minmax(210px, 1fr). На 375px это даёт
       2 колонки философов и 1 колонку разделов. */
    const cols = await page.evaluate(() => {
      const philGrid = document.querySelector(
        ".checkboxes-row:not(.sections-row)",
      );
      const secGrid = document.querySelector(".checkboxes-row.sections-row");
      const count = (el) =>
        el ? getComputedStyle(el).gridTemplateColumns.split(" ").length : -1;
      const btn = [...document.querySelectorAll("button")].find((x) =>
        x.textContent.includes("Синтезировать"),
      );
      const r = btn?.getBoundingClientRect();
      return {
        philCols: count(philGrid),
        secCols: count(secGrid),
        secW: secGrid?.getBoundingClientRect().width,
        secTpl: secGrid ? getComputedStyle(secGrid).gridTemplateColumns : "нет",
        btnBox: r ? { w: r.width, l: r.left, rr: r.right, iw: innerWidth } : "нет",
      };
    });
    /* Правка 2026-09-02: сетки теперь исходника — repeat(auto-fill,
       minmax(152px, 1fr)) для философов и minmax(210px, 1fr) для
       разделов. На 375px обе дают ОДНУ колонку (в старой Tailwind-сетке
       было жёсткое grid-cols-2). Проверяем поведение исходника. */
    check("PhilosopherPicker: одна колонка на 375px (auto-fill 152px)",
      cols.philCols === 1, `${cols.philCols}`);
    check("SectionPicker: 1 колонка на 375px", cols.secCols === 1,
      `${cols.secTpl} @ ${cols.secW}px; btn=${JSON.stringify(cols.btnBox)}`);
    const btnBox = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")]
        .find((x) => x.textContent.includes("Синтезировать Концепцию"));
      b.scrollIntoView({ block: "center" });
      const r = b.getBoundingClientRect();
      return { w: r.width, h: r.height, inViewport: r.width > 0 && r.left >= 0 && r.right <= innerWidth };
    });
    check("кнопка «Синтезировать» видна и умещается по ширине",
      btnBox.h > 0 && btnBox.inViewport);
    await page.setViewport({ width: 1280, height: 900 });

    /* ══ R2 + R5: полный UI-цикл с живой (мок) генерацией ══ */
    console.log("R2+R5: полный цикл — форма → CostEstimate → генерация → redirect");
    await page.goto(`${UI}/synthesis/new`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes("пифагор"),
      { timeout: 10000 },
    );
    await fill(page, "textarea[placeholder*='время как ткань']", "Тест полного UI-цикла беседы 1.5");
    await clickCheckboxLabel(page, "Кант");
    await clickCheckboxLabel(page, "Гегель");
    check("выбраны 2 философа", (await pageText(page)).toLowerCase().includes("выбрано: 2"));
    // 3 секции: graph, glossary, theses (снимаем history, name, critique)
    for (const s of ["Историческая контекстуализация", "Анализ названия", "Критический анализ"]) {
      await clickCheckboxLabel(page, s);
    }
    // Метод остаётся dialectical (дефолт)
    const methodVal = await page.evaluate(() =>
      [...document.querySelectorAll("select")].find((s) =>
        [...s.options].some((o) => o.value === "dialectical")).value);
    check("метод по умолчанию dialectical", methodVal === "dialectical");

    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes("≈ $"),
      { timeout: 15000 },
    );
    const estText = await page.evaluate(() =>
      document.body.innerText.split("\n").find((l) => l.includes("≈ $")));
    check("CostEstimate показывает оценку (≈ $, проходы, токены)",
      /≈ \$\d/.test(estText) && estText.includes("проход") && estText.includes("токен"));

    await clickSubmit();
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes("в процессе"),
      { timeout: 15000 },
    );
    check("после «Генерировать» появилась прогресс-панель", true);

    // Шаги: 4 позиции (sum + 3 секции), сначала ◯/⟳
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes("⟳"),
      { timeout: 15000 },
    );
    const stepsSnapshot = await pageText(page);
    check("шаги содержат «Исполнительное резюме» и три секции",
      ["Исполнительное резюме", "Граф категорий", "Глоссарий терминов", "Корпус тезисов"]
        .every((l) => stepsSnapshot.includes(l)));
    check("есть ожидающие шаги ◯ и активный ⟳",
      stepsSnapshot.toLowerCase().includes("◯") && stepsSnapshot.toLowerCase().includes("⟳"));

    // R5: живой рост счётчика символов стримящегося шага
    const readChars = () => page.evaluate(() => {
      const m = document.body.innerText.match(/([\d\s\u00a0]+)симв\./);
      return m ? parseInt(m[1].replace(/[\s\u00a0]/g, ""), 10) : 0;
    });
    const c1 = await readChars();
    await sleep(500);
    const c2 = await readChars();
    check(`счётчик символов растёт в реальном времени (${c1} → ${c2})`, c2 > c1 && c1 > 0);

    // Завершение: ✓ на всех шагах, затем redirect (после ~1.2 c)
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes("завершён"),
      { timeout: 90000 },
    );
    const doneText = await pageText(page);
    check("заголовок панели: Завершён", doneText.toLowerCase().includes("✓ синтез философской концепции — завершён"));
    check("нет активных ⟳ после завершения", !doneText.toLowerCase().includes("⟳"));
    await page.waitForFunction(
      () => /^\/synthesis\/[0-9a-f-]{36}$/.test(location.pathname),
      { timeout: 10000 },
    );
    check("redirect на /synthesis/:id после завершения", true);
    /* Правка 2026-09-02 (ревизия устаревших ожиданий): заглушки 1.6 давно
       нет — беседа 1.6b сделала настоящую страницу документа. Проверяем
       её признаки: шапка документа с номером PS-… и тело разделов. */
    await page.waitForSelector(".doc-header", { timeout: 15000 });
    const docText = await pageText(page);
    check("страница синтеза рендерит документ (шапка + разделы)",
      /PS-\d{4}-/.test(docText) &&
      docText.toLowerCase().includes("исполнительное резюме"),
      docText.slice(0, 80).replace(/\n/g, " "));

    // Следы в БД: генерация была НАСТОЯЩЕЙ — граф/глоссарий распарсены
    // в гранулярные таблицы (parseGraph/element-parser, беседа 1.4)
    const synthId = await page.evaluate(() => location.pathname.split("/").pop());
    const pg = (await import("postgres")).default(DB_URL, { max: 1 });
    try {
      const [row] = await pg`SELECT
        (SELECT count(*)::int FROM sections WHERE synthesis_id=${synthId}) AS secs,
        (SELECT count(*)::int FROM categories WHERE synthesis_id=${synthId}) AS cats,
        (SELECT count(*)::int FROM category_edges WHERE synthesis_id=${synthId}) AS edges,
        (SELECT count(*)::int FROM glossary_terms WHERE synthesis_id=${synthId}) AS terms,
        (SELECT count(*)::int FROM generation_log WHERE synthesis_id=${synthId}
           AND log_type='generation' AND status='done') AS gen_done,
        (SELECT status FROM syntheses WHERE id=${synthId}) AS status`;
      check("БД: статус ready, 4 раздела, 4 done-строки генлога",
        row.status === "ready" && row.secs === 4 && row.gen_done >= 4);
      check(`БД: граф распарсен (categories=${row.cats}, edges=${row.edges})`,
        row.cats === 10 && row.edges === 18);
      check(`БД: глоссарий распарсен (terms=${row.terms})`, row.terms === 10);
      const [th] = await pg`SELECT count(*)::int AS n FROM theses WHERE synthesis_id=${synthId}`;
      check(`БД: тезисы распарсены (theses=${th.n})`, th.n === 6);
    } finally {
      await pg.end();
    }

    /* ══ R6b: участники без зерна → допускается (полный мини-цикл) ══ */
    console.log("R6b: участники без зерна допускаются");
    await page.goto(`${UI}/synthesis/new`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes("пифагор"),
      { timeout: 10000 },
    );
    await clickCheckboxLabel(page, "Кант");
    // одна быстрая секция: снимаем 5 из 6 дефолтных, оставляем глоссарий
    for (const s of ["Граф категорий", "Корпус тезисов",
      "Историческая контекстуализация", "Анализ названия", "Критический анализ"]) {
      await clickCheckboxLabel(page, s);
    }
    await clickSubmit(); // зерно ПУСТОЕ — валидация должна пропустить
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes("в процессе"),
      { timeout: 15000 },
    );
    check("участник без зерна: POST принят, генерация пошла", true);
    await page.waitForFunction(
      () => /^\/synthesis\/[0-9a-f-]{36}$/.test(location.pathname),
      { timeout: 90000 },
    );
    check("мини-цикл завершён (redirect)", true);
  } finally {
    await browser.close().catch(() => {});
    serverProc?.kill("SIGKILL");
    viteProc?.kill("SIGKILL");
    mock.close();
  }

  console.log(`\nИтого: ${passed} ✓, ${failed} ✗`);
  if (failed > 0) {
    console.log("Провалы:", fails.join(" | "));
    console.log("--- server log tail ---\n" + serverLog.slice(-1500));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  console.error("--- server log tail ---\n" + serverLog.slice(-2000));
  console.error("--- vite log tail ---\n" + viteLog.slice(-800));
  serverProc?.kill("SIGKILL");
  viteProc?.kill("SIGKILL");
  process.exit(1);
});
