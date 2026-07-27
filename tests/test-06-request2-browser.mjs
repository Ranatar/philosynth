/**
 * Беседа 0.6, тестовый запрос (часть B — браузер) — ProfilePage:
 *   - вход формой, клик по имени в шапке → /profile;
 *   - форма «Данные»: email read-only; смена displayName → «Сохранено»,
 *     имя в ШАПКЕ обновилось (user в store); ошибка длины у поля;
 *   - форма «Смена пароля»: неверный текущий → ошибка у поля БЕЗ разлогина
 *     (проверка skipUnauthorizedHandler в реальном браузере); несовпадение
 *     повтора; короткий новый → details; успех → уведомление + очистка полей;
 *   - logout → вход НОВЫМ паролем через форму.
 *
 * Паттерн test-04-*: puppeteer-core + системный Chromium; сервер+vite
 * должны быть подняты (гонится одним bash-вызовом). Самоочистка — снаружи
 * (psql в обвязке). Запуск: node test-06-request2-browser.mjs <email> <pass>
 */
import puppeteer from "puppeteer-core";

const BASE = "http://localhost:5173";
const EMAIL = process.argv[2];
const PASSWORD = process.argv[3];
const NEW_PASSWORD = "browser-new-pass-1";
const CHROME = "/opt/google/chrome/chrome";

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function textOf(page, selector) {
  return page.$eval(selector, (el) => el.textContent?.trim() ?? "").catch(() => null);
}

/**
 * Установить значение контролируемого React-инпута детерминированно.
 * ГРАБЛЯ: click×3 + Backspace + type ненадёжно чистит поле (остаток
 * старого значения → ложные расхождения паролей); нативный setter +
 * событие input — React-совместимый способ.
 */
async function fill(page, handle, value) {
  await handle.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  try {
    // ── Вход формой ──
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', EMAIL);
    await page.type('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 8000 });
    await page.waitForSelector("header");
    check("вход формой → /catalog + header", true);

    // ── Имя в шапке — ссылка на /profile ──
    const profileLink = await page.waitForSelector('header a[href="/profile"]');
    const headerName0 = await textOf(page, 'header a[href="/profile"]');
    check("в шапке ссылка на /profile с email", headerName0 === EMAIL, `«${headerName0}»`);
    await profileLink.click();
    await page.waitForFunction(() => location.pathname === "/profile", { timeout: 8000 });
    await page.waitForSelector("h1");
    check("клик по имени → /profile, h1 «Профиль»", (await textOf(page, "h1")) === "Профиль");

    // ── Форма «Данные» ──
    const emailDisabled = await page.$eval(
      'input[type="email"]',
      (el) => el.disabled && el.value,
    );
    check("email read-only и заполнен", emailDisabled === EMAIL, `«${emailDisabled}»`);

    const nameInput = await page.waitForSelector('input[autocomplete="name"]');
    await fill(page, nameInput, "Тестовый Профиль");
    const forms = await page.$$("form");
    await forms[0].$eval('button[type="submit"]', (b) => b.click());
    await page.waitForFunction(
      () => !!document.querySelector('[role="status"]'),
      { timeout: 8000 },
    );
    check(
      "сохранение displayName → «Сохранено»",
      (await textOf(page, '[role="status"]')) === "Сохранено",
    );
    check(
      "имя в ШАПКЕ обновилось (user в store)",
      (await textOf(page, 'header a[href="/profile"]')) === "Тестовый Профиль",
      `«${await textOf(page, 'header a[href="/profile"]')}»`,
    );

    // Ошибка длины у поля
    await fill(page, nameInput, "х".repeat(101));
    await forms[0].$eval('button[type="submit"]', (b) => b.click());
    await page.waitForFunction(
      () => !!document.querySelector('form [role="alert"]'),
      { timeout: 8000 },
    );
    const lenErr = await textOf(page, 'form [role="alert"]');
    check(
      "101 символ → ошибка у поля (details.displayName)",
      !!lenErr && /100/.test(lenErr),
      `«${lenErr}»`,
    );
    // Вернуть валидное имя (сбрасывает и ошибку по onChange)
    await fill(page, nameInput, "Тестовый Профиль");

    // ── Форма «Смена пароля» ──
    const pwInputs = await forms[1].$$('input[type="password"]');
    check("три поля пароля", pwInputs.length === 3, `${pwInputs.length}`);
    const [curPw, newPw, repPw] = pwInputs;
    // ГРАБЛЯ: после fill() onChange чистит ошибки, но React ре-рендерит
    // асинхронно — читать алерт сразу после submit можно поймать СТАРЫЙ.
    // Порядок: дождаться исчезновения алерта → submit → дождаться появления.
    const submitPw = async () => {
      await page.waitForFunction(
        (i) => !document.querySelectorAll("form")[i]?.querySelector('[role="alert"]'),
        { timeout: 8000 },
        1,
      );
      await forms[1].$eval('button[type="submit"]', (b) => b.click());
    };
    const pwAlert = async () => {
      await page.waitForFunction(
        (i) => document.querySelectorAll("form")[i]?.querySelector('[role="alert"]'),
        { timeout: 8000 },
        1,
      );
      return page.$$eval("form", (fs) =>
        fs[1].querySelector('[role="alert"]')?.textContent?.trim(),
      );
    };

    // Неверный текущий пароль → ошибка у поля, БЕЗ разлогина
    await fill(page, curPw, "totally-wrong");
    await fill(page, newPw, NEW_PASSWORD);
    await fill(page, repPw, NEW_PASSWORD);
    await submitPw();
    check("неверный текущий → «Неверный текущий пароль»", (await pwAlert()) === "Неверный текущий пароль");
    await sleep(300); // дать сработать возможному (ошибочному) redirect'у
    check(
      "БЕЗ разлогина: остались на /profile, шапка жива (skipUnauthorizedHandler)",
      (await page.evaluate(() => location.pathname)) === "/profile" &&
        !!(await page.$("header")),
    );

    // Повтор не совпадает (клиентская проверка)
    await fill(page, curPw, PASSWORD);
    await fill(page, newPw, NEW_PASSWORD);
    await fill(page, repPw, NEW_PASSWORD + "x");
    await submitPw();
    check("повтор не совпал → «Пароли не совпадают»", (await pwAlert()) === "Пароли не совпадают");

    // Короткий новый пароль → details.newPassword от сервера
    await fill(page, curPw, PASSWORD);
    await fill(page, newPw, "short7!");
    await fill(page, repPw, "short7!");
    await submitPw();
    const shortErr = await pwAlert();
    check("короткий новый → ошибка details у поля", !!shortErr && /8/.test(shortErr), `«${shortErr}»`);

    // Успешная смена
    await fill(page, curPw, PASSWORD);
    await fill(page, newPw, NEW_PASSWORD);
    await fill(page, repPw, NEW_PASSWORD);
    await submitPw();
    await page.waitForFunction(
      () =>
        document.querySelectorAll("form")[1]?.querySelector('[role="status"]'),
      { timeout: 8000 },
    );
    const okMsg = await page.$$eval("form", (fs) =>
      fs[1].querySelector('[role="status"]')?.textContent?.trim(),
    );
    check(
      "успех → «Пароль изменён; прочие сессии завершены»",
      okMsg === "Пароль изменён; прочие сессии завершены",
      `«${okMsg}»`,
    );
    const fieldsCleared = await page.$$eval(
      "form",
      (fs) =>
        [...fs[1].querySelectorAll('input[type="password"]')].every(
          (i) => i.value === "",
        ),
    );
    check("поля пароля очищены", fieldsCleared);

    // ── Logout → вход НОВЫМ паролем ──
    const logoutBtn = await page.$$("header button");
    await logoutBtn[logoutBtn.length - 1].click();
    await page.waitForFunction(() => location.pathname === "/login", { timeout: 8000 });
    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', EMAIL);
    await page.type('input[type="password"]', NEW_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 8000 });
    check("после logout вход НОВЫМ паролем работает", true);
    check(
      "displayName пережил смену пароля (шапка после нового входа)",
      (await textOf(page, 'header a[href="/profile"]')) === "Тестовый Профиль",
    );
  } finally {
    await browser.close();
    console.log(`\nИтог (браузер): ${passed} ✓ / ${failed} ✗`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

main().catch((err) => {
  console.error("необработанная ошибка:", err);
  process.exit(1);
});
