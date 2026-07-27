/**
 * Беседа 0.4, запрос 7: все маршруты имеют заглушки (не белый экран).
 * Временный тест-скрипт (корень репо, не входит в кодовую базу).
 *
 * Каждый маршрут открывается ПРЯМОЙ ссылкой (page.goto = полная загрузка):
 * это проверяет и заглушку, и deep-linking через RequireAuth/restore().
 * «Не белый экран» = #root не пуст, есть видимый текст и ожидаемый
 * заголовок/форма конкретного маршрута.
 *
 * /login и /register проверяются анонимно; остальные шесть — с сессией.
 * Дополнительно: /login и /register при УЖЕ живой сессии не должны
 * давать белый экран (рендерят форму — редирект залогиненных с /login
 * в 0.4 не специфицирован, фиксируем фактическое поведение).
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

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

/** Снимок состояния маршрута после полной загрузки */
async function loadRoute(path) {
  await page.goto(BASE + path, { waitUntil: "networkidle0" });
  // дождаться конца restore (иначе поймаем «проверка сессии…»)
  await page
    .waitForFunction(async () => {
      const mod = await import("/src/stores/auth-store.ts");
      return mod.useAuthStore.getState().status !== "restoring";
    }, { timeout: 8000 })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
  return page.evaluate(() => {
    const root = document.getElementById("root");
    const text = (root?.innerText ?? "").trim();
    return {
      path: location.pathname,
      rootChildren: root?.children.length ?? 0,
      textLen: text.length,
      h1: document.querySelector("h1")?.textContent?.trim() ?? "",
      hasEmailInput: !!document.querySelector('input[type="email"]'),
      hasLayout: !!document.querySelector("header") && !!document.querySelector("main"),
      snippet: text.slice(0, 80).replace(/\n/g, " · "),
    };
  });
}

function assertNotBlank(name, r) {
  check(`${name}: не белый экран (root не пуст, есть текст)`,
    r.rootChildren > 0 && r.textLen > 20, `children=${r.rootChildren}, text=${r.textLen}`);
}

/* ── Анонимно: /login, /register ────────────────────────────────────── */
let r = await loadRoute("/login");
assertNotBlank("/login", r);
check("/login: форма входа (email-input, h1 PhiloSynth)",
  r.hasEmailInput && r.h1.includes("PhiloSynth"), r.snippet);

r = await loadRoute("/register");
assertNotBlank("/register", r);
check("/register: форма регистрации", r.hasEmailInput && r.path === "/register", r.snippet);

/* Анонимный прямой заход на защищённый — не белый экран, а redirect */
r = await loadRoute("/billing");
check("/billing анонимно: redirect на /login (не белый экран)",
  r.path === "/login" && r.hasEmailInput, r.path);

/* ── Вход ───────────────────────────────────────────────────────────── */
await page.evaluate(
  async (email, password) => {
    const mod = await import("/src/stores/auth-store.ts");
    await mod.useAuthStore.getState().login(email, password);
  },
  EMAIL,
  PASSWORD,
);

/* ── С сессией: шесть защищённых маршрутов прямыми ссылками ─────────── */
const protectedRoutes = [
  ["/catalog", "Каталог"],
  ["/synthesis/new", "Новый синтез"],
  ["/synthesis/abc-123", "Синтез"],
  ["/import", "Импорт"],
  ["/billing", "Биллинг"],
  ["/admin/prompts", "Промпты"],
];
for (const [path, h1part] of protectedRoutes) {
  r = await loadRoute(path);
  assertNotBlank(path, r);
  check(`${path}: остался на маршруте, Layout, h1 «${h1part}»`,
    r.path === path && r.hasLayout && r.h1.includes(h1part),
    `path=${r.path}; h1=${r.h1}`);
}
/* :id из URL пробрасывается в заглушку */
r = await loadRoute("/synthesis/abc-123");
const hasId = await page.evaluate(() =>
  (document.querySelector("main")?.innerText ?? "").includes("abc-123"),
);
check("/synthesis/:id: параметр id отображён", hasId);

/* ── /login и /register при живой сессии — не белый экран ───────────── */
r = await loadRoute("/login");
assertNotBlank("/login (с сессией)", r);
r = await loadRoute("/register");
assertNotBlank("/register (с сессией)", r);

/* ── Корень и произвольный маршрут ──────────────────────────────────── */
r = await loadRoute("/");
check("/: redirect на /catalog", r.path === "/catalog" && r.h1.includes("Каталог"), r.path);
r = await loadRoute("/does/not/exist");
assertNotBlank("неизвестный маршрут", r);
check("неизвестный маршрут: 404 внутри Layout",
  r.hasLayout && r.h1.includes("не найдена"), r.h1);

await browser.close();
console.log(failures === 0 ? "\nИТОГ: все проверки пройдены" : `\nИТОГ: ПРОВАЛОВ ${failures}`);
process.exit(failures === 0 ? 0 : 1);
