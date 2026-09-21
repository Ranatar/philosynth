/**
 * Режимы невладельцу — только просмотр (2026-09-21, вне бесед). Против
 * ПОДНЯТОГО стенда (`bash tools/dev-billing.sh`: сервер :3000, vite :5199);
 * без стенда — пропуск. Живой файл — TMR_FILE (по умолчанию
 * /mnt/user-data/uploads/PS-6933-6RIK-…html; без файла — пропуск).
 * Chrome — CHROME_PATH (по умолчанию Chrome 131 из ~/.cache/puppeteer);
 * puppeteer-core — из node_modules либо PUPPETEER_CORE.
 *
 *  R1  владелец: три кнопки режимов, модалка с параметром, «Генерировать» и ×;
 *  R2  чужой на 'full': кнопки ТОЛЬКО режимов с результатами (со счётчиком),
 *      модалка без параметров/генерации/×, вкладки и содержимое на месте;
 *  R3  чужой на 'full': run и DELETE по API → 403, результаты целы;
 *  R4  витрина: кнопок нет, GET /modes → 403;
 *  R5  гость на 'full': кнопок нет.
 * Запуск: node tests/test-modes-readonly.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";

import { RESULTS, withModes } from "./modes-fixture.mjs";

const FILE = process.env.TMR_FILE ?? "/mnt/user-data/uploads/PS-6933-6RIK-vmeschayuschiy-razlom-rgG2.html";
const UI = "http://localhost:5199";
const API = "http://localhost:3000/api/v1";
const CHROME = process.env.CHROME_PATH ??
  `${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`;
if (!existsSync(FILE)) { console.log("TMR_FILE не задан или файла нет — пропуск"); process.exit(0); }
try { if (!(await fetch(`${API}/health`)).ok) throw 0; }
catch { console.log("стенд не поднят (bash tools/dev-billing.sh) — пропуск"); process.exit(0); }
const { default: puppeteer } = await import(process.env.PUPPETEER_CORE ?? "puppeteer-core");

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
}
const J = JSON.stringify;
async function account(tag) {
  const email = `tmr-${tag}-${Date.now()}@example.com`, password = "password-tmr1";
  await fetch(`${API}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  return r.headers.get("set-cookie").split(";")[0];
}
const call = (cookie, method, path, body) =>
  fetch(API + path, { method, headers: { Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? J(body) : undefined });

// Два режима из трёх: у «Временного среза» результатов нет
const SUBSET = RESULTS.filter((r) => r[0] !== "timeslice");
const owner = await account("owner");
const other = await account("other");
const fd = new FormData();
fd.append("file", new Blob([withModes(readFileSync(FILE, "utf8"), SUBSET)], { type: "text/html" }), "tmr.html");
const imp = await (await fetch(`${API}/syntheses/import`, { method: "POST", headers: { Cookie: owner }, body: fd })).json();
const id = imp.id;

const browser = await puppeteer.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const pageErrors = [];
async function openAs(cookie) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  p.on("pageerror", (e) => pageErrors.push(e.message));
  await p.setViewport({ width: 1400, height: 1000 });
  if (cookie) { const [name, value] = cookie.split("="); await p.setCookie({ name, value, url: UI }); }
  await p.goto(`${UI}/synthesis/${id}`, { waitUntil: "networkidle0" });
  await p.waitForSelector(".doc-section, [data-section-key], h1", { timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
  return { p, ctx };
}
const modeButtons = (p) => p.$$eval("button", (bs) =>
  bs.filter((b) => /^◈ (Оппонент|Переводчик|Временной срез)/.test(b.textContent.trim()))
    .map((b) => ({ text: b.textContent.trim(), ro: b.hasAttribute("data-mode-readonly") })));
async function openMode(p, label) {
  await p.evaluate((l) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("◈ " + l)).click(), label);
  await p.waitForSelector("#modeOverlay", { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 800));
  return p.evaluate(() => ({
    input: !!document.getElementById("modeParamInput"),
    run: !!document.getElementById("modeRunBtn"),
    close: document.querySelectorAll("#modeTabsBar .mode-tab-close").length,
    tabs: [...document.querySelectorAll("#modeTabsBar .mode-tab")].map((t) => t.firstChild?.textContent?.trim()),
    tables: document.querySelectorAll("#modeBody table.doc-table").length,
    text: (document.getElementById("modeBody")?.textContent ?? "").trim().slice(0, 60),
    copy: !!document.querySelector(".mode-modal-copy"),
  }));
}

try {
  check("импорт с режимами прошёл", typeof id === "string", imp);

  console.log("── R1 владелец ──");
  {
    const { p, ctx } = await openAs(owner);
    const b = await modeButtons(p);
    check("три кнопки режимов, не только просмотр", b.length === 3 && b.every((x) => !x.ro), b);
    check("счётчики: Оппонент (2), Переводчик (1), Временной срез без счётчика",
      b.map((x) => x.text).join("|") === "◈ Оппонент (2)|◈ Переводчик (1)|◈ Временной срез", b);
    const m = await openMode(p, "Оппонент");
    check("модалка владельца: параметр, «Генерировать», × у вкладок", m.input && m.run && m.close === 2, m);
    await ctx.close();
  }

  console.log("── R2 чужой на 'full' ──");
  const pr = await call(owner, "PATCH", `/syntheses/${id}`, { visibility: "full" });
  check("PATCH visibility=full", pr.ok, await pr.text());
  {
    const { p, ctx } = await openAs(other);
    const b = await modeButtons(p);
    check("кнопки только режимов с результатами, помечены просмотром",
      b.map((x) => x.text).join("|") === "◈ Оппонент (2)|◈ Переводчик (1)" && b.every((x) => x.ro), b);
    const m = await openMode(p, "Оппонент");
    check("модалка без параметра, генерации и ×", !m.input && !m.run && m.close === 0, m);
    check("вкладки по параметрам файла", m.tabs.join("|") === "Кант|Логический позитивизм", m.tabs);
    check("содержимое последней вкладки на месте, «Скопировать» есть", m.text.startsWith("Опровержение") && m.copy, m);
    await p.evaluate(() => document.querySelector("#modeTabsBar .mode-tab")?.click());
    await new Promise((r) => setTimeout(r, 400));
    const t1 = await p.evaluate(() => document.querySelectorAll("#modeBody table.doc-table").length);
    check("переключение вкладки: таблица первой вкладки", t1 === 1);
    await ctx.close();
  }

  console.log("── R3 чужой: запись закрыта ──");
  const run = await call(other, "POST", `/syntheses/${id}/modes/adversarial/run`, { param: "Юм" });
  check("run чужим → 403", run.status === 403, run.status);
  const del = await call(other, "DELETE", `/syntheses/${id}/modes/adversarial/0`);
  check("DELETE чужим → 403", del.status === 403, del.status);
  const left = (await (await call(owner, "GET", `/syntheses/${id}/modes`)).json()).modes;
  check("результаты целы", left.adversarial?.length === 2 && left.translator?.length === 1, left && Object.keys(left));

  console.log("── R4 витрина ──");
  await call(owner, "PATCH", `/syntheses/${id}`, { visibility: "showcase" });
  check("GET /modes чужим на витрине → 403", (await call(other, "GET", `/syntheses/${id}/modes`)).status === 403);
  {
    const { p, ctx } = await openAs(other);
    check("на витрине кнопок режимов нет", (await modeButtons(p)).length === 0);
    await ctx.close();
  }

  console.log("── R5 гость ──");
  await call(owner, "PATCH", `/syntheses/${id}`, { visibility: "full" });
  {
    const { p, ctx } = await openAs(null);
    check("гостю кнопок режимов нет", (await modeButtons(p)).length === 0);
    await ctx.close();
  }
  check("ошибок страницы нет", pageErrors.length === 0, pageErrors);
} catch (e) {
  failed++; console.log("  ✗ КРАХ:", e);
} finally {
  await browser.close();
  if (id) await call(owner, "DELETE", `/syntheses/${id}`);
}
console.log(`\nИТОГ: ${n - failed} ✓ / ${failed} ✗`);
process.exit(failed ? 1 : 0);
