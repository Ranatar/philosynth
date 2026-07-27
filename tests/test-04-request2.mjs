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
  "/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome";
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
    doubleRule: !!document.querySelector(".double-rule"),
    h1: text("main h1"),
    paperBg: (() => {
      const h = document.querySelector("header");
      return h ? getComputedStyle(h).backgroundColor : "нет header";
    })(),
  };
});
check("Header присутствует", layout.header);
check("вордмарк PhiloSynth", layout.wordmark);
check("пользователь в шапке", layout.userShown);
check("кнопка «Выйти»", layout.logoutBtn);
check("Sidebar с навигацией", layout.sidebar, layout.sidebarLinks.join(", "));
check("двойная линейка (мотив шапки исходника)", layout.doubleRule);
check("заглушка каталога (h1)", layout.h1.includes("Каталог"), layout.h1);
check(
  "фон Header = --paper (#fffef9)",
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

/* /synthesis/:id (прямой переход SPA-роутером недоступен извне — goto) */
await page.goto(BASE + "/synthesis/test-id-123", { waitUntil: "networkidle0" });
const synthInfo = await page.evaluate(() => ({
  h1: document.querySelector("main h1")?.textContent ?? "",
  id: [...document.querySelectorAll("main p")].map((p) => p.textContent).join(" "),
}));
check(
  "/synthesis/:id рендерит заглушку с id",
  synthInfo.h1.includes("Синтез") && synthInfo.id.includes("test-id-123"),
  synthInfo.id.trim().slice(0, 60),
);

/* /admin/prompts для обычного пользователя: маршрут есть, заглушка рендерится */
await page.goto(BASE + "/admin/prompts", { waitUntil: "networkidle0" });
const adminH1 = await page.evaluate(
  () => document.querySelector("main h1")?.textContent ?? "",
);
check("/admin/prompts — заглушка (не белый экран)", adminH1.includes("Промпты"), adminH1);

/* Неизвестный маршрут → 404-страница внутри Layout */
await page.goto(BASE + "/no-such-route", { waitUntil: "networkidle0" });
const nfH1 = await page.evaluate(
  () => document.querySelector("main h1")?.textContent ?? "",
);
check("404 внутри Layout (не белый экран)", nfH1.includes("не найдена"), nfH1);
await page.screenshot({ path: "/tmp/shot-3-404.png" });

/* 5. Ошибки */
check("ошибок консоли нет", consoleErrors.length === 0, consoleErrors.join(" | "));
check(
  "упавших запросов нет",
  failedRequests.length === 0,
  failedRequests.join(" | "),
);

await browser.close();
console.log(failures === 0 ? "\nИТОГ: все проверки пройдены" : `\nИТОГ: ПРОВАЛОВ ${failures}`);
process.exit(failures === 0 ? 0 : 1);
