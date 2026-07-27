/**
 * Беседа 0.4, запрос 5: runtime-проверка CSS-переменных.
 * Временный тест-скрипт. Сервер не нужен — только Vite (страница /login).
 *
 * Проверяет вычисленные значения :root-переменных и то, что
 * Tailwind-классы (bg-*, text-*) реально резолвятся в эти переменные.
 */
import puppeteer from "puppeteer-core";

const CHROME =
  "/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome";

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
await page.goto("http://localhost:5173/login", { waitUntil: "networkidle0" });

const r = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();

  // Тестовые элементы с Tailwind-классами — резолвятся ли в переменные
  const probe = document.createElement("div");
  probe.innerHTML =
    '<span class="text-gold">g</span><span class="text-ink">i</span>' +
    '<span class="bg-parchment">p</span><span class="text-violet">v</span>' +
    '<span class="text-gold-light">gl</span>';
  document.body.appendChild(probe);
  const [g, i, p, vio, gl] = probe.children;
  const out = {
    vars: {
      gold: v("--gold"),
      goldLight: v("--gold-light"),
      ink: v("--ink"),
      off: v("--off"),
      parchment: v("--parchment"),
      violet: v("--violet"),
    },
    tw: {
      textGold: getComputedStyle(g).color,
      textInk: getComputedStyle(i).color,
      bgParchment: getComputedStyle(p).backgroundColor,
      textViolet: getComputedStyle(vio).color,
      textGoldLight: getComputedStyle(gl).color,
    },
  };
  probe.remove();
  return out;
});

/* Переменные определены и с какими значениями */
check("--ink = #1a1814 (совпадает с проверкой протокола и исходником)",
  r.vars.ink === "#1a1814", r.vars.ink);
check("--violet = #6b00aa (совпадает с проверкой протокола и исходником)",
  r.vars.violet === "#6b00aa", r.vars.violet);
check("--parchment вычисляется в #f2f0eb (алиас --off)",
  r.vars.parchment === "#f2f0eb" ||
    (r.vars.parchment === "var(--off)" && r.vars.off === "#f2f0eb"),
  `--parchment=${r.vars.parchment}; --off=${r.vars.off}`);
check("--gold = #b8860b (ИСХОДНИК; протокол ждёт #d4a017 — см. отчёт)",
  r.vars.gold === "#b8860b", r.vars.gold);
check("#d4a017 присутствует как --gold-light (дословно из исходника)",
  r.vars.goldLight === "#d4a017", r.vars.goldLight);

/* Tailwind-классы резолвятся в переменные */
check("text-ink → rgb(26,24,20)", r.tw.textInk === "rgb(26, 24, 20)", r.tw.textInk);
check("text-violet → rgb(107,0,170)", r.tw.textViolet === "rgb(107, 0, 170)", r.tw.textViolet);
check("bg-parchment → rgb(242,240,235)", r.tw.bgParchment === "rgb(242, 240, 235)", r.tw.bgParchment);
check("text-gold → rgb(184,134,11) (#b8860b)", r.tw.textGold === "rgb(184, 134, 11)", r.tw.textGold);
check("text-gold-light → rgb(212,160,23) (#d4a017)", r.tw.textGoldLight === "rgb(212, 160, 23)", r.tw.textGoldLight);

await browser.close();
console.log(failures === 0 ? "\nИТОГ: все проверки пройдены" : `\nИТОГ: ПРОВАЛОВ ${failures}`);
process.exit(failures === 0 ? 0 : 1);
