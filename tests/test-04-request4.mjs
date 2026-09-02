/**
 * Беседа 0.4, запрос 4: тест api/client.ts.
 * Временный тест-скрипт (корень репо, не входит в кодовую базу).
 *
 * Проверки (формулировка запроса протокола):
 *  A. Запрос с сессией → данные.
 *  B. Ответ 500 (JSON-тело)   → ApiError, приложение не падает.
 *  C. Ответ 500 (не-JSON тело) → ApiError c fallback-сообщением, не crash.
 *  D. Сетевой сбой             → ApiError NETWORK_ERROR (доп. ветка).
 *  E. Запрос к защищённому эндпоинту без сессии → 401 → сброс user
 *     в auth-store → RequireAuth redirect на /login.
 *
 * 500 мокается перехватом puppeteer: реального 500-эндпоинта в 0.2 нет,
 * а валить живой сервер — недетерминированно (Vite-прокси даёт свой 500).
 * unhandledrejection на странице отслеживается: «не crash» = ошибки
 * пойманы вызывающим кодом, приложение живо и интерактивно.
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

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();

/* Мок-перехват: /api/v1/mock-500-json, /api/v1/mock-500-text, /api/v1/mock-netfail */
await page.setRequestInterception(true);
page.on("request", (req) => {
  const u = req.url();
  if (u.includes("/api/v1/mock-500-json")) {
    void req.respond({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Внутренняя ошибка сервера", code: "INTERNAL_ERROR" }),
    });
  } else if (u.includes("/api/v1/mock-500-text")) {
    void req.respond({
      status: 500,
      contentType: "text/html",
      body: "<html>Proxy error</html>",
    });
  } else if (u.includes("/api/v1/mock-netfail")) {
    void req.abort("connectionrefused");
  } else {
    void req.continue();
  }
});

/* Фиксация unhandledrejection на странице (признак «crash» обработки) */
await page.evaluateOnNewDocument(() => {
  window.__unhandled = [];
  window.addEventListener("unhandledrejection", (e) => {
    window.__unhandled.push(String(e.reason));
  });
});

/** Вызов api-клиента из страницы; ошибки сериализуются */
async function callApi(fn, path) {
  return page.evaluate(
    async (f, p) => {
      const mod = await import("/src/api/client.ts");
      try {
        const data = await mod[f](p);
        return { ok: true, data };
      } catch (err) {
        return {
          ok: false,
          name: err?.name,
          isApiError: err instanceof mod.ApiError,
          code: err?.code,
          status: err?.status,
          message: err?.message,
        };
      }
    },
    fn,
    path,
  );
}

/* ── Вход (предусловие) ─────────────────────────────────────────────── */
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
check("предусловие: сессия установлена, /catalog", page.url().endsWith("/catalog"), page.url());

/* ── A. Запрос с сессией → данные ───────────────────────────────────── */
const withSession = await callApi("apiGet", "/auth/me");
check("A: apiGet('/auth/me') с сессией вернул данные",
  withSession.ok === true && withSession.data?.user?.email === EMAIL,
  JSON.stringify(withSession.data ?? withSession));

/* ── B. 500 c JSON-телом ────────────────────────────────────────────── */
const j500 = await callApi("apiGet", "/mock-500-json");
check("B: 500(JSON) → отклонение, не crash", j500.ok === false);
check("B: это ApiError", j500.isApiError === true && j500.name === "ApiError");
check("B: code/status/message из тела ответа",
  j500.code === "INTERNAL_ERROR" && j500.status === 500 &&
    j500.message === "Внутренняя ошибка сервера",
  `${j500.code}/${j500.status}/${j500.message}`);

/* ── C. 500 c не-JSON телом (прокси/nginx) ──────────────────────────── */
const t500 = await callApi("apiGet", "/mock-500-text");
check("C: 500(text) → ApiError, парсер не упал",
  t500.ok === false && t500.isApiError === true);
check("C: fallback-сообщение и код",
  t500.code === "INTERNAL_ERROR" && t500.status === 500 &&
    t500.message === "Ошибка запроса (HTTP 500)",
  `${t500.code}/${t500.status}/${t500.message}`);

/* ── D. Сетевой сбой ────────────────────────────────────────────────── */
const nf = await callApi("apiGet", "/mock-netfail");
check("D: сетевой сбой → ApiError NETWORK_ERROR (status 0)",
  nf.ok === false && nf.isApiError === true && nf.code === "NETWORK_ERROR" && nf.status === 0,
  `${nf.code}/${nf.status}/${nf.message}`);

/* Приложение живо после трёх ошибок: header на месте, unhandled нет, URL не сменился */
const alive = await page.evaluate(() => ({
  header: !!document.querySelector("header"),
  unhandled: window.__unhandled,
  path: location.pathname,
}));
check("после B/C/D приложение живо (header, /catalog)",
  alive.header && alive.path === "/catalog", alive.path);
check("unhandledrejection не было", alive.unhandled.length === 0,
  alive.unhandled.join(" | "));

/* ── E. Защищённый эндпоинт без сессии → redirect на /login ─────────── */
const cdp = await page.createCDPSession();
await cdp.send("Network.clearBrowserCookies"); // сессионная cookie снята «на клиенте»
const noSession = await callApi("apiGet", "/auth/me");
check("E: без сессии → ApiError AUTH_REQUIRED (401)",
  noSession.ok === false && noSession.code === "AUTH_REQUIRED" && noSession.status === 401,
  `${noSession.code}/${noSession.status}`);
await page
  .waitForFunction(() => location.pathname === "/login", { timeout: 8000 })
  .catch(() => {});
const st = await page.evaluate(async () => {
  const mod = await import("/src/stores/auth-store.ts");
  const s = mod.useAuthStore.getState();
  return { user: s.user, status: s.status, path: location.pathname };
});
check("E: 401-обработчик сбросил user (status=anonymous)",
  st.user === null && st.status === "anonymous", `status=${st.status}`);
check("E: RequireAuth сделал redirect на /login", st.path === "/login", st.path);

await browser.close();
console.log(failures === 0 ? "\nИТОГ: все проверки пройдены" : `\nИТОГ: ПРОВАЛОВ ${failures}`);
process.exit(failures === 0 ? 0 : 1);
