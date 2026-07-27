/**
 * Беседа 0.4, запрос 6: responsive-проверка Layout.
 * Временный тест-скрипт (корень репо, не входит в кодовую базу).
 *
 * Мобильный вьюпорт 375×667 (< 768px = брейкпоинт md):
 *  - постоянный Sidebar скрыт, бургер в Header виден;
 *  - клик по бургеру → выдвижная панель + подложка;
 *  - клик по ссылке панели → навигация + панель закрывается;
 *  - клик по подложке закрывает панель; кнопка ✕ есть;
 *  - Header: email пользователя скрыт (< sm), нет горизонтального скролла.
 * Desktop 1280×800: бургер скрыт, Sidebar виден, email показан.
 */
import puppeteer from "puppeteer-core";

const CHROME =
  "/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome";
const BASE = "http://localhost:5173";
const EMAIL = "test04@philosynth.dev";
const PASSWORD = "password-04";

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Видим ли элемент фактически (display/visibility/размер/сдвиг за экран) */
const visibleFn = `(el) => {
  if (!el) return false;
  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden") return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth;
}`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();

/* Вход и переход в Layout */
await page.setViewport({ width: 1280, height: 800 });
await page.goto(BASE + "/login", { waitUntil: "networkidle0" });
await page.evaluate(
  async (email, password) => {
    const mod = await import("/src/stores/auth-store.ts");
    await mod.useAuthStore.getState().login(email, password);
  },
  EMAIL,
  PASSWORD,
);
await page.goto(BASE + "/catalog", { waitUntil: "networkidle0" });

/* ── Desktop 1280×800 ───────────────────────────────────────────────── */
let d = await page.evaluate((vf) => {
  const visible = eval(vf);
  const burger = document.querySelector('header button[aria-label="Открыть меню"]');
  const desktopAside = [...document.querySelectorAll("aside")].find((a) =>
    a.className.includes("md:block"),
  );
  const email = [...document.querySelectorAll("header span")].find((s) =>
    s.textContent.includes("Тест 0.4"),
  );
  return {
    burgerVisible: visible(burger),
    sidebarVisible: visible(desktopAside),
    emailVisible: visible(email),
    hOverflow: document.documentElement.scrollWidth > innerWidth,
  };
}, visibleFn);
check("desktop: постоянный Sidebar виден", d.sidebarVisible);
check("desktop: бургер скрыт", !d.burgerVisible);
check("desktop: имя пользователя в Header видно", d.emailVisible);
check("desktop: нет горизонтального скролла", !d.hOverflow);

/* ── Mobile 375×667 ─────────────────────────────────────────────────── */
await page.setViewport({ width: 375, height: 667 });
await sleep(300);

let m = await page.evaluate((vf) => {
  const visible = eval(vf);
  const burger = document.querySelector('header button[aria-label="Открыть меню"]');
  const desktopAside = [...document.querySelectorAll("aside")].find((a) =>
    a.className.includes("md:block"),
  );
  const mobileAside = [...document.querySelectorAll("aside")].find((a) =>
    a.className.includes("md:hidden"),
  );
  const email = [...document.querySelectorAll("header span")].find((s) =>
    s.textContent.includes("Тест 0.4"),
  );
  return {
    burgerVisible: visible(burger),
    desktopSidebarVisible: visible(desktopAside),
    mobilePanelVisible: visible(mobileAside),
    mobilePanelAriaHidden: mobileAside?.getAttribute("aria-hidden"),
    emailVisible: visible(email),
    logoutVisible: visible(
      [...document.querySelectorAll("header button")].find((b) =>
        b.textContent.includes("Выйти"),
      ),
    ),
    wordmarkVisible: visible(
      [...document.querySelectorAll("header span")].find((s) =>
        s.textContent.includes("PhiloSynth"),
      ),
    ),
    hOverflow: document.documentElement.scrollWidth > innerWidth,
  };
}, visibleFn);
check("mobile: постоянный Sidebar скрыт", !m.desktopSidebarVisible);
check("mobile: бургер-кнопка видна", m.burgerVisible);
check("mobile: выдвижная панель закрыта (за экраном, aria-hidden=true)",
  !m.mobilePanelVisible && m.mobilePanelAriaHidden === "true",
  `aria-hidden=${m.mobilePanelAriaHidden}`);
check("mobile: Header адаптивен — email скрыт (< sm)", !m.emailVisible);
check("mobile: вордмарк и «Выйти» видны", m.wordmarkVisible && m.logoutVisible);
check("mobile: нет горизонтального скролла", !m.hOverflow);
await page.screenshot({ path: "/tmp/shot-4-mobile-closed.png" });

/* Открытие бургером */
await page.click('header button[aria-label="Открыть меню"]');
await sleep(400);
m = await page.evaluate((vf) => {
  const visible = eval(vf);
  const mobileAside = [...document.querySelectorAll("aside")].find((a) =>
    a.className.includes("md:hidden"),
  );
  const overlay = document.querySelector(".fixed.inset-0.z-40");
  const closeBtn = mobileAside?.querySelector('button[aria-label="Закрыть меню"]');
  return {
    panelVisible: visible(mobileAside),
    ariaHidden: mobileAside?.getAttribute("aria-hidden"),
    overlayVisible: visible(overlay),
    closeBtnVisible: visible(closeBtn),
    links: mobileAside
      ? [...mobileAside.querySelectorAll("nav a")].map((a) => a.textContent.trim())
      : [],
  };
}, visibleFn);
check("mobile: клик по бургеру открыл панель (aria-hidden=false)",
  m.panelVisible && m.ariaHidden === "false");
check("mobile: подложка показана", m.overlayVisible);
check("mobile: кнопка ✕ есть", m.closeBtnVisible);
check("mobile: панель содержит навигацию", m.links.length >= 4, m.links.join(", "));
await page.screenshot({ path: "/tmp/shot-5-mobile-open.png" });

/* Навигация из панели → переход + автозакрытие */
await page.evaluate(() => {
  const aside = [...document.querySelectorAll("aside")].find((a) =>
    a.className.includes("md:hidden"),
  );
  [...aside.querySelectorAll("nav a")]
    .find((a) => a.textContent.trim() === "Импорт")
    ?.click();
});
await sleep(400);
m = await page.evaluate((vf) => {
  const visible = eval(vf);
  const mobileAside = [...document.querySelectorAll("aside")].find((a) =>
    a.className.includes("md:hidden"),
  );
  return {
    path: location.pathname,
    h1: document.querySelector("main h1")?.textContent ?? "",
    panelVisible: visible(mobileAside),
  };
}, visibleFn);
check("mobile: ссылка панели ведёт на /import",
  m.path === "/import" && m.h1.includes("Импорт"), `${m.path}; h1=${m.h1}`);
check("mobile: панель закрылась после перехода", !m.panelVisible);

/* Закрытие подложкой */
await page.click('header button[aria-label="Открыть меню"]');
await sleep(300);
// клик по видимой части подложки: панель w-64 (256px, z-50) перекрывает
// центр экрана (187px) — кликаем правее панели
await page.mouse.click(330, 300);
await sleep(400);
const overlayClosed = await page.evaluate((vf) => {
  const visible = eval(vf);
  const mobileAside = [...document.querySelectorAll("aside")].find((a) =>
    a.className.includes("md:hidden"),
  );
  return !visible(mobileAside);
}, visibleFn);
check("mobile: клик по подложке закрывает панель", overlayClosed);

/* Возврат на desktop: панель не мешает, Sidebar снова виден */
await page.setViewport({ width: 1280, height: 800 });
await sleep(300);
d = await page.evaluate((vf) => {
  const visible = eval(vf);
  const desktopAside = [...document.querySelectorAll("aside")].find((a) =>
    a.className.includes("md:block"),
  );
  const burger = document.querySelector('header button[aria-label="Открыть меню"]');
  return { sidebar: visible(desktopAside), burger: visible(burger) };
}, visibleFn);
check("возврат на desktop: Sidebar виден, бургер скрыт", d.sidebar && !d.burger);

await browser.close();
console.log(failures === 0 ? "\nИТОГ: все проверки пройдены" : `\nИТОГ: ПРОВАЛОВ ${failures}`);
process.exit(failures === 0 ? 0 : 1);
