/** Смоук WS-пути беседы 0.4: браузер → vite-прокси /ws → Hono handler (0.2), ping→pong. */
import puppeteer from "puppeteer-core";
// Chrome 131 из кэша puppeteer — ПЕРВЫМ (09 §4: иные версии дают расхождения); CHROME_PATH и
// системный /opt/google/chrome/chrome — запасные: в песочнице оба ведут на Chrome 153 (правка после L.2)
const CHROME = [`${process.env.HOME}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`, process.env.CHROME_PATH, "/opt/google/chrome/chrome"].find((p) => p && process.getBuiltinModule("node:fs").existsSync(p));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.goto("http://localhost:5173/login", { waitUntil: "networkidle0" });
await page.evaluate(async () => {
  const mod = await import("/src/stores/auth-store.ts");
  await mod.useAuthStore.getState().login("test04@philosynth.dev", "password-04");
});
const result = await page.evaluate(() => new Promise((resolve) => {
  const ws = new WebSocket(`ws://${location.host}/ws`); // как defaultUrl() хука
  const t = setTimeout(() => resolve({ ok: false, why: "timeout" }), 6000);
  ws.onopen = () => ws.send(JSON.stringify({ type: "ping" }));
  ws.onmessage = (e) => { clearTimeout(t); resolve({ ok: true, frame: String(e.data) }); };
  ws.onerror = () => { clearTimeout(t); resolve({ ok: false, why: "error" }); };
}));
await browser.close();
console.log(JSON.stringify(result));
process.exit(result.ok && result.frame.includes("pong") ? 0 : 1);
