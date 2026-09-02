/**
 * Беседа 0.4, запрос 3: тест auth-store.
 * Временный тест-скрипт (корень репо, не входит в кодовую базу).
 *
 * Доступ к store — напрямую: Vite dev отдаёт /src/stores/auth-store.ts
 * как ES-модуль, динамический import из контекста страницы возвращает
 * ТОТ ЖЕ синглтон, что использует приложение (одинаковый URL модуля).
 *
 * Проверки (формулировка запроса протокола):
 *  A. login(bad) → POST /auth/login → false; error в store; user = null
 *  B. login(ok)  → POST /auth/login → true; user в store (+role из /auth/me)
 *  C. перезагрузка страницы → GET /auth/me восстанавливает сессию
 *     (user в store БЕЗ повторного POST /auth/login)
 *  D. logout() → POST /auth/logout → user = null, status anonymous
 *  E. после logout перезагрузка НЕ восстанавливает сессию (cookie снята)
 */
import puppeteer from "puppeteer-core";

const CHROME =
  "/opt/google/chrome/chrome";
const BASE = "http://localhost:5173";
const EMAIL = "test04@philosynth.dev";
const PASSWORD = "password-04";

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

/** Журнал auth-запросов: [{method, path, status}] */
const authCalls = [];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
page.on("response", (res) => {
  const u = new URL(res.url());
  if (u.pathname.startsWith("/api/v1/auth/")) {
    authCalls.push({
      method: res.request().method(),
      path: u.pathname.replace("/api/v1", ""),
      status: res.status(),
    });
  }
});
const callsSince = (mark) => authCalls.slice(mark);
const fmt = (calls) =>
  calls.map((c) => `${c.method} ${c.path}→${c.status}`).join(", ");

/** Доступ к состоянию store из страницы */
async function storeState() {
  return page.evaluate(async () => {
    const mod = await import("/src/stores/auth-store.ts");
    const s = mod.useAuthStore.getState();
    return {
      user: s.user,
      status: s.status,
      error: s.error,
      pending: s.pending,
    };
  });
}
async function storeCall(action, ...args) {
  return page.evaluate(
    async (a, argList) => {
      const mod = await import("/src/stores/auth-store.ts");
      return mod.useAuthStore.getState()[a](...argList);
    },
    action,
    args,
  );
}

/* ── Инициализация: чистая анонимная сессия ─────────────────────────── */
await page.goto(BASE + "/login", { waitUntil: "networkidle0" });
let st = await storeState();
check("исходно: user=null, status=anonymous", st.user === null && st.status === "anonymous",
  `status=${st.status}`);

/* ── A. login с неверным паролем ────────────────────────────────────── */
let mark = authCalls.length;
const badResult = await storeCall("login", EMAIL, "wrong-password");
st = await storeState();
const badCalls = callsSince(mark);
check("A: login(bad) вернул false", badResult === false);
check("A: был POST /auth/login → 401",
  badCalls.some((c) => c.method === "POST" && c.path === "/auth/login" && c.status === 401),
  fmt(badCalls));
check("A: error в store", typeof st.error === "string" && st.error.length > 0, st.error ?? "");
check("A: user остался null, status=anonymous",
  st.user === null && st.status === "anonymous");
check("A: pending сброшен", st.pending === false);

/* ── B. login с верными кредами ─────────────────────────────────────── */
mark = authCalls.length;
const okResult = await storeCall("login", EMAIL, PASSWORD);
st = await storeState();
const okCalls = callsSince(mark);
check("B: login(ok) вернул true", okResult === true);
check("B: был POST /auth/login → 200",
  okCalls.some((c) => c.method === "POST" && c.path === "/auth/login" && c.status === 200),
  fmt(okCalls));
check("B: user сохранён в store", st.user?.email === EMAIL, JSON.stringify(st.user));
check("B: полный профиль дотянут (role из GET /auth/me)",
  st.user?.role === "user" &&
    okCalls.some((c) => c.method === "GET" && c.path === "/auth/me" && c.status === 200),
  `role=${st.user?.role}`);
check("B: status=authenticated, error=null",
  st.status === "authenticated" && st.error === null);

/* ── C. Перезагрузка страницы → restore() по cookie ─────────────────── */
mark = authCalls.length;
await page.goto(BASE + "/catalog", { waitUntil: "networkidle0" });
await page.waitForFunction(async () => {
  const mod = await import("/src/stores/auth-store.ts");
  return mod.useAuthStore.getState().status !== "restoring";
});
st = await storeState();
const restoreCalls = callsSince(mark);
check("C: после перезагрузки user восстановлен", st.user?.email === EMAIL,
  JSON.stringify(st.user));
check("C: восстановление шло через GET /auth/me → 200",
  restoreCalls.some((c) => c.method === "GET" && c.path === "/auth/me" && c.status === 200),
  fmt(restoreCalls));
check("C: БЕЗ повторного POST /auth/login",
  !restoreCalls.some((c) => c.path === "/auth/login"));
check("C: страница осталась на /catalog (RequireAuth пропустил)",
  page.url().endsWith("/catalog"), page.url());

/* ── D. logout() ────────────────────────────────────────────────────── */
mark = authCalls.length;
await storeCall("logout");
st = await storeState();
const logoutCalls = callsSince(mark);
check("D: был POST /auth/logout → 200",
  logoutCalls.some((c) => c.method === "POST" && c.path === "/auth/logout" && c.status === 200),
  fmt(logoutCalls));
check("D: user = null, status=anonymous",
  st.user === null && st.status === "anonymous");

/* ── E. Перезагрузка после logout — сессия НЕ восстанавливается ─────── */
mark = authCalls.length;
await page.goto(BASE + "/catalog", { waitUntil: "networkidle0" });
await page.waitForFunction(async () => {
  const mod = await import("/src/stores/auth-store.ts");
  return mod.useAuthStore.getState().status !== "restoring";
});
st = await storeState();
const afterCalls = callsSince(mark);
check("E: GET /auth/me → 401 (cookie снята сервером)",
  afterCalls.some((c) => c.method === "GET" && c.path === "/auth/me" && c.status === 401),
  fmt(afterCalls));
check("E: user=null, redirect на /login",
  st.user === null && page.url().endsWith("/login"), page.url());

await browser.close();
console.log(failures === 0 ? "\nИТОГ: все проверки пройдены" : `\nИТОГ: ПРОВАЛОВ ${failures}`);
process.exit(failures === 0 ? 0 : 1);
