/**
 * Беседа 1.5b, тестовые запросы 2–5 (одним заходом, по команде):
 *   R2 — загрузить 2 файла → оба в пуле → ☑ один → ◉ другой →
 *        документ отображается (предпросмотр) → переключить просмотр →
 *        контент переключился; повторный клик ◉ — деселект.
 *        АДАПТАЦИЯ формулировки 07 «снимок сохранён, новый загружен»:
 *        в сервисе снимки не создаются (локальных правок нет,
 *        pool-store шапка) — проверяется переключение предпросмотра
 *        и индикатора. Дыра формулировки — в патч доков (завершение).
 *   R3 — ☑ непригодную концепцию (без glossary): в исходнике [5258]
 *        и в порте чекбокс «Синтез» у непригодной DISABLED, поэтому
 *        alert-ветка toggleSynthParticipant [4738] из UI НЕДОСТИЖИМА
 *        (дыра формулировки 07 «alert с ошибкой» — в патч).
 *        Проверяется фактическая защита: чекбокс disabled, ⚠ строка
 *        с причиной, клик не меняет счётчик, alert не всплывает.
 *   R4 — «перед генерацией refreshAllSynthParticipants обновляет
 *        participant из снимка»: снимков нет (см. R2) — сервисная
 *        проекция: (а) сабмит с ☑-концепциями БЛОКИРУЕТСЯ формой
 *        (план 1.5b п. 4), POST не уходит; (б) без ☑ сабмит уходит,
 *        prepareForGeneration (refreshAll + сброс индикатора ◉)
 *        отработал ДО POST; серверный отказ (API_KEY_MISSING без
 *        ключа) показан у кнопки — генерация тесту не нужна.
 *   R5 — удалить концепцию из пула → карточка исчезла, индикатор ◉
 *        сброшен, саммари/_conceptParticipants обновлены (проекция:
 *        блок keepFullBudget скрылся).
 *
 * Попутно: CostEstimate среда-независимо — на посеянном Registry
 * показывает «≈ $…», на пустом грациозно деградирует в «оценка
 * недоступна»; тесту валидны обе ветки.
 *
 * Инфраструктура: реальный сервер (tsx index.ts, :3000), vite dev
 * (:5199), puppeteer-core + системный Chromium /opt/google/chrome/chrome.
 * Требует: PG16+Redis подняты, миграции применены. Сиды опциональны.
 * Запуск: node tests/test-15b-requests2-5.mjs (из корня репо).
 */
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";

const CHROME = "/opt/google/chrome/chrome";
const SERVER_PORT = 3000;
const VITE_PORT = 5199;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const UI = `http://127.0.0.1:${VITE_PORT}`;
const DB_URL =
  process.env.DATABASE_URL ??
  "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const EMAIL = `t15b-${Date.now()}@example.com`;
const PASSWORD = "correct-horse-15b";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
const fails = [];
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}

/* ════ Фикстуры: концепт-файлы ═══════════════════════════════════════ */

function conceptFile({ title, marker, withGlossary = true }) {
  const catRows = [];
  for (let i = 1; i <= 8; i++) {
    catRows.push(
      `<tr><td>Категория ${i}</td><td>онтологическая</td><td>Опр. ${i} (${title}).</td><td>0.${9 - (i % 5)}</td><td>0.5</td></tr>`,
    );
  }
  const glossary = withGlossary
    ? `<div class="doc-body" data-section-key="glossary">
        <div class="doc-section"><span class="section-num">§ 3</span><span class="section-title">Глоссарий терминов</span>
          <table class="doc-table"><thead><tr><th>Термин</th><th>Определение</th></tr></thead>
          <tbody><tr><td>Термин-${marker}</td><td>Определение термина (${title}).</td></tr></tbody></table>
        </div></div>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
<div id="docOutput">
  <h1 id="docTitle">${title}</h1>
  <div id="docSubtitle">На основе: Кант, Гегель</div>
  <span id="docMethod">Диалектический</span><span id="docDepth">Стандартная</span><span id="docSynthLevel">Сравнительный</span>
  <div id="docHeaderExtras">
    <details class="header-disclosure"><summary>Зерно</summary><div class="disclosure-body">зерно (${title})</div></details>
    <details class="header-disclosure header-disclosure-capsule"><summary>◈ Капсула концепции</summary><div class="disclosure-body">Капсула концепции «${title}».</div></details>
  </div>
  <div id="docBodies">
    <div class="doc-body" data-section-key="sum">
      <div class="doc-section"><span class="section-num">§ 1</span><span class="section-title">Исполнительное резюме синтеза</span>
        <div data-section="Цели и метод"><h4>Цели</h4><p>Цель (${title}). ${marker}</p></div>
        <div data-section="Ключевые напряжения"><h4>Напряжения</h4><p>Напряжение (${title}).</p></div>
      </div></div>
    <div class="doc-body" data-section-key="graph">
      <div class="doc-section"><span class="section-num">§ 2</span><span class="section-title">Граф категорий</span>
        <table class="doc-table"><thead><tr><th>Категория</th><th>Тип</th><th>Определение</th><th>Центральность</th><th>Определённость</th></tr></thead><tbody>${catRows.join("")}</tbody></table>
        <table class="doc-table"><thead><tr><th>Источник</th><th>Цель</th><th>Тип</th><th>Направление</th></tr></thead>
        <tbody><tr><td>Категория 1</td><td>Категория 2</td><td>диалектическая</td><td>однонаправленная</td></tr></tbody></table>
      </div></div>
    ${glossary}
    <div class="doc-body" data-section-key="theses">
      <div class="doc-section"><span class="section-num">§ 4</span><span class="section-title">Корпус тезисов</span>
        <div data-section="Сводная таблица тезисов"><h4>Сводная таблица</h4>
          <table class="doc-table"><thead><tr><th>№</th><th>Тезис</th></tr></thead>
          <tbody><tr><td>1.</td><td>Тезис первый (${title}).</td></tr></tbody></table>
        </div></div></div>
    <div class="doc-body" data-section-key="dialogue">
      <div class="doc-section"><span class="section-num">§ 5</span><span class="section-title">Диалог между традициями</span>
        <div data-section="Итоговая таблица диалога"><h4>Итоговая</h4>
          <table class="doc-table"><thead><tr><th>Понятие</th><th>Автор</th></tr></thead>
          <tbody><tr><td>Понятие-${marker}</td><td>Кант*</td></tr></tbody></table></div>
        <div data-section="Аналитический комментарий"><h4>Аналитический комментарий</h4><p>Комментарий (${title}).</p></div>
      </div></div>
    <div class="doc-body" data-section-key="critique">
      <div class="doc-section"><span class="section-num">§ 6</span><span class="section-title">Критический анализ</span><p>Критика (${title}).</p></div>
    </div>
  </div>
</div>
<script type="application/json" id="philosynth-state">{"version":2,"params":{"generationOrder":"architectural"}}</script>
</body></html>`;
}

/* ════ Процессы ══════════════════════════════════════════════════════ */

let serverProc = null, viteProc = null;
let serverLog = "", viteLog = "";

async function startServer() {
  serverProc = spawn("npx", ["tsx", "index.ts"], {
    cwd: new URL("../server/", import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      // ANTHROPIC_API_KEY намеренно НЕ задан: POST /syntheses должен
      // отказать предпроверкой (API_KEY_MISSING) — R4 генерации не ведёт
      CLIENT_ORIGIN: `http://127.0.0.1:${VITE_PORT}`,
      DATABASE_URL: DB_URL,
      REDIS_URL: "redis://localhost:6379",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProc.stdout.on("data", (d) => (serverLog += d));
  serverProc.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`${API}/health`); if (r.ok) return; } catch {}
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
    try { const r = await fetch(UI + "/"); if (r.ok) return; } catch {}
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

const bodyText = (page) => page.evaluate(() => document.body.textContent);

/** Клик по контролу карточки пула, найденной по подстроке имени.
 *  kind: 'synth' (чекбокс), 'view' (радио), 'remove' (✕) */
function poolCardControl(page, nameSub, kind) {
  return page.evaluate(({ nameSub, kind }) => {
    // Якорь — радио poolView (ровно одно на карточку), карточка — его
    // ближайший .pool-card (корень PoolCard, класс исходника; до правки
    // 2026-09-02 это был Tailwind-контейнер div.rounded.border).
    // Детерминировано, в отличие от эвристики «последний матчащий div»
    // (флак R5 первой редакции теста: цеплялся посторонний контейнер).
    const card = [...document.querySelectorAll('input[type="radio"][name="poolView"]')]
      .map((r) => r.closest(".pool-card"))
      .find((c) => c && c.textContent.includes(nameSub));
    if (!card) return { ok: false, why: "card not found" };
    if (kind === "synth") {
      const cb = card.querySelector('input[type="checkbox"]');
      if (!cb) return { ok: false, why: "no checkbox" };
      const disabled = cb.disabled;
      cb.click();
      return { ok: true, disabled, checkedAfter: cb.checked };
    }
    if (kind === "view") {
      const r = card.querySelector('input[type="radio"][name="poolView"]');
      if (!r) return { ok: false, why: "no radio" };
      r.click();
      return { ok: true };
    }
    if (kind === "remove") {
      const btn = [...card.querySelectorAll("button")].find(
        (b) => b.title === "Удалить из пула",
      );
      if (!btn) return { ok: false, why: "no remove btn" };
      btn.click();
      return { ok: true };
    }
    return { ok: false, why: "bad kind" };
  }, { nameSub, kind });
}

/** Клик по контролу карточки с верификацией эффекта по тексту страницы.
 *  До 3 попыток с логом [retry]: страхует инфраструктурную гонку
 *  «клик в окно disabled fieldset» (input внутри disabled fieldset
 *  игнорирует click() при input.disabled===false) и подобные; ретраи
 *  ЛОГИРУЮТСЯ — систематические повторы были бы видны как дефект. */
async function poolAct(page, nameSub, kind, waitText, absent = false) {
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    last = await poolCardControl(page, nameSub, kind);
    const ok = await page
      .waitForFunction(
        (t, abs) => document.body.textContent.includes(t) !== abs,
        { timeout: attempt === 1 ? 5000 : 2500 },
        waitText,
        absent,
      )
      .then(() => true)
      .catch(() => false);
    if (ok) {
      if (attempt > 1)
        console.log(`  [retry] ${kind}@${nameSub}: применилось с попытки ${attempt}`);
      return last;
    }
  }
  throw new Error(
    `${kind}@${nameSub}: эффект «${waitText}» не наступил за 3 попытки; ` +
      `последний клик: ${JSON.stringify(last)}`,
  );
}

/** Чекбокс раздела по метке SECTION_LABELS */
function sectionChecked(page, label) {
  return page.evaluate((label) => {
    const lab = [...document.querySelectorAll("label")].find((l) =>
      l.textContent.trim().startsWith(label),
    );
    return lab ? lab.querySelector('input[type="checkbox"]')?.checked ?? null : null;
  }, label);
}

/* ════ main ══════════════════════════════════════════════════════════ */

async function main() {
  await startServer();
  await startVite();

  const reg = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, displayName: "T15b" }),
  });
  if (!reg.ok) throw new Error("register: " + (await reg.text()));

  // Фикстуры на диск (uploadFile)
  const dir = mkdtempSync(join(tmpdir(), "t15b-"));
  const fA = join(dir, "alpha.html");
  const fB = join(dir, "beta.html");
  const fBad = join(dir, "bad-no-glossary.html");
  writeFileSync(fA, conceptFile({ title: "Альфа-концепция", marker: "MARKER-ALPHA" }));
  writeFileSync(fB, conceptFile({ title: "Бета-концепция", marker: "MARKER-BETA" }));
  writeFileSync(fBad, conceptFile({ title: "Гамма-неполная", marker: "MARKER-GAMMA", withGlossary: false }));

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Диалоги: копим типы (alert НЕ должен всплыть в R3)
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push({ type: d.type(), msg: d.message() }); void d.accept(); });
  page.on("console", (m) => {
    if (m.text().startsWith("[pool]")) console.log("  [browser]", m.text().slice(0, 180));
  });

  // POST /syntheses (создание; НЕ estimate/advice)
  let createPosts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/v1\/syntheses\/?$/.test(r.url())) createPosts++;
  });

  try {
    /* ── Логин через UI ── */
    await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
    await fill(page, "input[type=email]", EMAIL);
    await fill(page, "input[type=password]", PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 20000 });

    await page.goto(`${UI}/synthesis/new`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.body.textContent.includes("Загруженные Концепции"),
      { timeout: 10000 },
    );

    /* ══ R2: 2 файла → пул → ☑/◉ → предпросмотр → переключение ══ */
    console.log("R2: загрузка двух файлов, ☑/◉, переключение просмотра");
    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(fA, fB);
    await page.waitForFunction(
      () => document.body.textContent.includes("«Бета-концепция»"),
      { timeout: 8000 },
    );
    let txt = await bodyText(page);
    check("обе карточки в пуле", txt.toLowerCase().includes("«альфа-концепция»") && txt.toLowerCase().includes("«бета-концепция»"));
    check("статус «✓ Загружено: 2»", txt.toLowerCase().includes("✓ загружено: 2"));
    check("саммари «0 из 2 для мета-синтеза»", txt.toLowerCase().includes("0 из 2 для мета-синтеза"));
    check("keepFullBudget скрыт без ☑", !txt.toLowerCase().includes("сохранять полный бюджет секций"));

    // ☑ Альфа
    const t1 = await poolAct(page, "Альфа-концепция", "synth", "1 из 2 для мета-синтеза");
    check("☑ Альфа кликнут (чекбокс активен)", t1.ok && t1.disabled === false, JSON.stringify(t1));
    txt = await bodyText(page);
    check("статус автовключения разделов", txt.toLowerCase().includes("☑ включены разделы, обязательные для мета-синтеза"));
    check("synthReady включился", await page.evaluate(() => {
      const lab = [...document.querySelectorAll("label")].find((l) =>
        l.textContent.includes("Пригодность к дальнейшему синтезу"));
      return lab?.querySelector("input")?.checked ?? null;
    }) === true);
    check("раздел «Диалог» автовключён", (await sectionChecked(page, "Диалог между традициями")) === true);
    check("раздел «Капсула» автовключён", (await sectionChecked(page, "Капсула концепции")) === true);
    check("keepFullBudget появился", txt.toLowerCase().includes("сохранять полный бюджет секций"));
    check("превью бюджета: «Контекст родителей»", txt.toLowerCase().includes("контекст родителей:"));

    // ◉ Бета → предпросмотр Бета
    await poolAct(page, "Бета-концепция", "view", "Предпросмотр: «Бета-концепция»");
    txt = await bodyText(page);
    check("индикатор «◉ «Бета-концепция»»", txt.toLowerCase().includes("◉ «бета-концепция»"));
    check("предпросмотр содержит контент Беты", txt.toLowerCase().includes("marker-beta"));

    // Переключить ◉ на Альфа (адаптация «снимок сохранён» — см. шапку)
    await poolAct(page, "Альфа-концепция", "view", "Предпросмотр: «Альфа-концепция»");
    txt = await bodyText(page);
    check("просмотр переключился на Альфу", txt.toLowerCase().includes("marker-alpha"));
    check("контент Беты ушёл из предпросмотра", !txt.toLowerCase().includes("marker-beta"));

    // Повторный клик ◉ — деселект
    await poolAct(page, "Альфа-концепция", "view", "Предпросмотр:", true);
    txt = await bodyText(page);
    check("деселект: индикатор ◉ исчез", !txt.toLowerCase().includes("◉ «альфа-концепция» — просмотр") && !txt.toLowerCase().includes("◉ «альфа-концепция»"));

    // Попутно: CostEstimate среда-независимо — на посеянном Registry
    // показывает оценку («≈ $…»), на пустом грациозно деградирует в
    // «оценка недоступна»; обе ветки валидны для 1.5b (дебаунс 600 мс)
    const estState = await page.waitForFunction(
      () => {
        const t = document.body.textContent;
        if (t.includes("оценка недоступна")) return "degraded";
        if (t.includes("≈ $")) return "ok";
        return false;
      },
      { timeout: 8000 },
    ).then((h) => h.jsonValue()).catch(() => null);
    check("CostEstimate отработал (оценка либо деградация)", estState === "ok" || estState === "degraded");

    /* ══ R3: непригодная концепция (без glossary) ══ */
    console.log("R3: непригодная концепция — защита ☑");
    const dlgBefore = dialogs.length;
    await (await page.$('input[type="file"]')).uploadFile(fBad);
    await page.waitForFunction(
      () => document.body.textContent.includes("«Гамма-неполная»"),
      { timeout: 8000 },
    );
    txt = await bodyText(page);
    check("⚠ причина непригодности на карточке", txt.toLowerCase().includes("не пригодна для мета-синтеза"));
    check("причина называет глоссарий", /Отсутствуют разделы:.{0,40}Глоссарий/s.test(txt));
    const t3 = await poolCardControl(page, "Гамма-неполная", "synth");
    check("чекбокс ☑ у непригодной disabled ([5258] — как в исходнике)", t3.ok && t3.disabled === true);
    await sleep(300);
    txt = await bodyText(page);
    check("клик по disabled не меняет счётчик", txt.toLowerCase().includes("1 из 3 для мета-синтеза"));
    check("alert не всплывал (ветка [4738] из UI недостижима — дыра 07)", dialogs.length === dlgBefore);

    /* ══ R4: перед генерацией (сервисная проекция теста 4) ══ */
    console.log("R4: блокировка мета-синтеза + prepareForGeneration");
    await fill(page, "textarea", "зерно для проверки сабмита"); // первая textarea — зерно
    // ☑ Альфа стоит с R2 → сабмит должен быть заблокирован формой
    const postsBefore = createPosts;
    await page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent.includes("Синтезировать Концепцию"))
        .click();
    });
    /* Правка 2026-09-02 (ревизия устаревших ожиданий): гейт 1.5b СУЖЕН
       беседой 3.2 — каталожные концепции сервер принимает, блокируются
       только ФАЙЛОВЫЕ, и текст ошибки стал другим (SynthesisForm [488]).
       Тест грузит два ФАЙЛА, поэтому сабмит по-прежнему блокируется. */
    await page.waitForFunction(
      () =>
        document.body.textContent.includes(
          "Файловые концепции пока не поддержаны как участники мета-синтеза",
        ),
      { timeout: 5000 },
    );
    check("сабмит с ☑-концепциями заблокирован (план п.4)", true);
    check("POST /syntheses НЕ ушёл", createPosts === postsBefore);

    // Снять ☑ с Альфы, включить ◉ на Бете → валидный сабмит
    await poolAct(page, "Альфа-концепция", "synth", "0 из 3 для мета-синтеза");
    txt = await bodyText(page);
    check("снятие последней ☑ → synthReady снят", await page.evaluate(() => {
      const lab = [...document.querySelectorAll("label")].find((l) =>
        l.textContent.includes("Пригодность к дальнейшему синтезу"));
      return lab?.querySelector("input")?.checked ?? null;
    }) === false);
    check("разделы НЕ сняты ([4760] — пользователь сам решит)",
      (await sectionChecked(page, "Диалог между традициями")) === true);
    check("keepFullBudget скрылся", !txt.toLowerCase().includes("сохранять полный бюджет секций"));

    await poolAct(page, "Бета-концепция", "view", "Предпросмотр: «Бета-концепция»");
    await page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent.includes("Синтезировать Концепцию"))
        .click();
    });
    // POST уходит; сервер без ANTHROPIC_API_KEY отказывает предпроверкой
    for (let i = 0; i < 40 && createPosts === postsBefore; i++) await sleep(200);
    await page.waitForFunction(
      () => !document.body.textContent.includes("Предпросмотр:"),
      { timeout: 8000 },
    );
    txt = await bodyText(page);
    check("POST /syntheses ушёл (без ☑ блокировки нет)", createPosts === postsBefore + 1, String(createPosts - postsBefore));
    check("prepareForGeneration: индикатор ◉ сброшен до POST", !txt.toLowerCase().includes("◉ «бета-концепция»"));
    const errShown = await page.waitForFunction(
      () => document.body.textContent.includes("API-ключ"),
      { timeout: 8000 },
    ).then(() => true).catch(() => false);
    check("серверный отказ (API-ключ не задан) показан у кнопки", errShown);
    // Форма разблокирована (submitting=false) — прежде R5 кликов
    await page.waitForFunction(
      () => document.querySelector("fieldset")?.disabled === false,
      { timeout: 5000 },
    );

    /* ══ R5: удаление из пула ══ */
    console.log("R5: удаление концепции из пула");
    // ☑ + ◉ на Альфе, затем ✕
    await poolAct(page, "Альфа-концепция", "synth", "1 из 3 для мета-синтеза");
    await poolAct(page, "Альфа-концепция", "view", "Предпросмотр: «Альфа-концепция»");
    await poolCardControl(page, "Альфа-концепция", "remove");
    await page.waitForFunction(
      () => !document.body.textContent.includes("«Альфа-концепция»"),
      { timeout: 5000 },
    );
    txt = await bodyText(page);
    check("карточка удалена", !txt.toLowerCase().includes("«альфа-концепция»"));
    check("индикатор ◉ сброшен", !txt.toLowerCase().includes("◉ «альфа-концепция»") && !txt.toLowerCase().includes("предпросмотр:"));
    check("саммари пересчитан («0 из 2»)", txt.toLowerCase().includes("0 из 2 для мета-синтеза"));
    check("conceptParticipants обновлён (keepFullBudget скрыт)", !txt.toLowerCase().includes("сохранять полный бюджет секций"));
    check("остальные карточки живы", txt.toLowerCase().includes("«бета-концепция»") && txt.toLowerCase().includes("«гамма-неполная»"));
  } finally {
    await browser.close().catch(() => {});
    serverProc?.kill("SIGKILL");
    viteProc?.kill("SIGKILL");
  }

  console.log(`\nИтого: ${passed} ✓, ${failed} ✗`);
  if (failed) { console.log("Провалы:", fails.join("; ")); process.exit(1); }
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  serverProc?.kill("SIGKILL");
  viteProc?.kill("SIGKILL");
  // утёкший сервер держит :3000 (грабля 1.5)
  process.exit(2);
});
