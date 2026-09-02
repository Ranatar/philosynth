/**
 * Беседа 0.4, запрос 2: браузерная проверка каркаса клиента.
 * Не входит в кодовую базу проекта — временный тест-скрипт (/tmp).
 *
 * Проверяет:
 *  1) неавторизованный вход на / → redirect на /login, форма рендерится;
 *  2) вход через форму (пользователь создан curl'ом);
 *  3) Layout: Header (вордмарк, email, «Выйти»), Sidebar, двойная линейка;
 *  4) навигация Sidebar'ом по всем страницам + /synthesis/:id + 404;
 *  5) ошибки консоли браузера и упавшие запросы.
 */
import puppeteer from "puppeteer-core";

const CHROME =
  "/opt/google/chrome/chrome";
const BASE = "http://localhost:5173";
const EMAIL = "test04@philosynth.dev";
const PASSWORD = "password-04";

const consoleErrors = [];
const failedRequests = [];
let failures = 0;

function check(name, cond, extra = "") {
  const mark = cond ? "✓" : "✗";
  if (!cond) failures++;
  console.log(`${mark} ${name}${extra ? ` — ${extra}` : ""}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("requestfailed", (req) => {
  failedRequests.push(`${req.method()} ${req.url()} → ${req.failure()?.errorText}`);
});

/* 1. Неавторизованный вход → redirect на /login */
await page.goto(BASE + "/", { waitUntil: "networkidle0" });
check("redirect на /login без сессии", page.url().endsWith("/login"), page.url());
const hasLoginForm = await page.$('input[type="email"]');
check("форма входа рендерится", !!hasLoginForm);
await page.screenshot({ path: "/tmp/shot-1-login.png" });

/* 2. Вход через форму */
await page.type('input[type="email"]', EMAIL);
await page.type('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
// SPA: pushState "/" → мгновенный replace на /catalog — ждём конечного состояния
await page.waitForFunction(
  () => location.pathname === "/catalog",
  { timeout: 8000 },
).catch(() => {});
await page.waitForSelector("header", { timeout: 8000 }).catch(() => {});
check("после входа → /catalog", page.url().endsWith("/catalog"), page.url());

/* 3. Layout */
const layout = await page.evaluate(() => {
  const text = (sel) => document.querySelector(sel)?.textContent ?? "";
  return {
    header: !!document.querySelector("header"),
    wordmark: text("header").includes("PhiloSynth"),
    userShown: text("header").includes("Тест 0.4"),
    logoutBtn: [...document.querySelectorAll("header button")].some((b) =>
      b.textContent.includes("Выйти"),
    ),
    sidebar: !!document.querySelector("aside nav"),
    sidebarLinks: [...document.querySelectorAll("aside nav a")].map((a) =>
      a.textContent.trim(),
    ),
    /* Правка 2026-09-02 (единство стилей с исходником): служебная
       «двойная линейка» сервиса заменена контрактом исходника —
       .site-header с нижней границей 3px var(--blue-corp) [3540]. */
    headerRule: (() => {
      const sh = document.querySelector(".site-header");
      if (!sh) return "нет .site-header";
      const cs = getComputedStyle(sh);
      return cs.borderBottomWidth + " " + cs.borderBottomColor;
    })(),
    h1: text("main h1"),
    /* Шапка теперь двухчастная (исходник): .topbar на --blue-corp
       и .site-header на --paper */
    topbarBg: (() => {
      const t = document.querySelector(".topbar");
      return t ? getComputedStyle(t).backgroundColor : "нет .topbar";
    })(),
    paperBg: (() => {
      const h = document.querySelector(".site-header");
      return h ? getComputedStyle(h).backgroundColor : "нет .site-header";
    })(),
  };
});
check("Header присутствует", layout.header);
check("вордмарк PhiloSynth", layout.wordmark);
check("пользователь в шапке", layout.userShown);
check("кнопка «Выйти»", layout.logoutBtn);
check("Sidebar с навигацией", layout.sidebar, layout.sidebarLinks.join(", "));
check(
  "линейка шапки исходника (.site-header, 3px --blue-corp)",
  layout.headerRule === "3px rgb(26, 40, 85)",
  layout.headerRule,
);
check("заглушка каталога (h1)", layout.h1.includes("Каталог"), layout.h1);
check(
  "фон .topbar = --blue-corp (#1a2855)",
  layout.topbarBg === "rgb(26, 40, 85)",
  layout.topbarBg,
);
check(
  "фон .site-header = --paper (#fffef9)",
  layout.paperBg === "rgb(255, 254, 249)",
  layout.paperBg,
);
check(
  "«Промпты» скрыт для role=user",
  !layout.sidebarLinks.includes("Промпты"),
);
await page.screenshot({ path: "/tmp/shot-2-catalog.png" });

/* 4. Навигация Sidebar'ом */
const navTargets = [
  ["Новый синтез", "/synthesis/new", "Новый синтез"],
  ["Импорт", "/import", "Импорт"],
  ["Биллинг", "/billing", "Биллинг"],
  ["Каталог", "/catalog", "Каталог"],
];
for (const [label, path, h1part] of navTargets) {
  await page.evaluate((l) => {
    const link = [...document.querySelectorAll("aside nav a")].find(
      (a) => a.textContent.trim() === l,
    );
    link?.click();
  }, label);
  await sleep(300);
  const url = new URL(page.url()).pathname;
  const h1 = await page.evaluate(
    () => document.querySelector("main h1")?.textContent ?? "",
  );
  check(`навигация «${label}»`, url === path && h1.includes(h1part), `${url}; h1=${h1}`);
}

/* Правка 2026-09-02 (ревизия устаревших ожиданий): заглушек страниц уже
   нет — /synthesis/:id стал настоящей страницей документа (беседа 1.6b).
   Для несуществующего id она показывает карточку ошибки, оставаясь на
   маршруте. Здесь же добавлено ожидание h1: после жёсткого перехода
   RequireAuth сперва рисует «проверка сессии…», и чтение сразу после
   networkidle0 давало пустой h1 (давний флак этого теста). */
const h1Text = async () => {
  await page
    .waitForFunction(() => !!document.querySelector("main h1"), { timeout: 8000 })
    .catch(() => {});
  return page.evaluate(() => document.querySelector("main h1")?.textContent ?? "");
};

await page.goto(BASE + "/synthesis/test-id-123", { waitUntil: "networkidle0" });
const synthInfo = await page.evaluate(() => ({
  path: location.pathname,
  text: document.querySelector("main")?.innerText ?? "",
}));
check(
  "/synthesis/:id: маршрут жив, показана ошибка вместо белого экрана",
  synthInfo.path === "/synthesis/test-id-123" && synthInfo.text.trim().length > 0,
  synthInfo.text.trim().slice(0, 60).replace(/\n/g, " "),
);

/* /admin/prompts для обычного пользователя: маршрут есть, страница рендерится */
await page.goto(BASE + "/admin/prompts", { waitUntil: "networkidle0" });
const adminH1 = await h1Text();
check("/admin/prompts — страница рендерится (не белый экран)",
  adminH1.includes("Промпты"), adminH1);

/* Неизвестный маршрут → 404-страница внутри Layout */
await page.goto(BASE + "/no-such-route", { waitUntil: "networkidle0" });
const nfH1 = await h1Text();
check("404 внутри Layout (не белый экран)", nfH1.includes("не найдена"), nfH1);
await page.screenshot({ path: "/tmp/shot-3-404.png" });

/* 5. Ошибки.
   Правка 2026-09-02: из шума отфильтрованы (а) ответы 4xx/5xx на
   ЗАВЕДОМО несуществующий /synthesis/test-id-123 — они часть сценария,
   (б) блокировка fonts.googleapis.com — ограничение песочницы (egress),
   а не дефект клиента. */
const IGNORED_CONSOLE = /Failed to load resource|WebSocket connection to/i;
const IGNORED_REQUESTS = /fonts\.googleapis\.com|fonts\.gstatic\.com/i;
const realConsoleErrors = consoleErrors.filter((e) => !IGNORED_CONSOLE.test(e));
const realFailedRequests = failedRequests.filter((r) => !IGNORED_REQUESTS.test(r));
check("ошибок консоли нет (кроме ожидаемых 4xx/5xx сценария)",
  realConsoleErrors.length === 0, realConsoleErrors.join(" | "));
check(
  "упавших запросов нет (кроме заблокированных шрифтов Google)",
  realFailedRequests.length === 0,
  realFailedRequests.join(" | "),
);

await browser.close();
console.log(failures === 0 ? "\nИТОГ: все проверки пройдены" : `\nИТОГ: ПРОВАЛОВ ${failures}`);
process.exit(failures === 0 ? 0 : 1);
