/**
 * Беседа 15.1 — тестовые запросы 2–4 одним харнессом (родословная после
 * импорта: Д-68, Д-69, Д-70). Живой сервер :3000 (прокси preview) + PG16/
 * Redis + СБОРКА клиента (vite build) под vite preview :5227 + Chrome 131
 * (CHROME_PATH). Модель не нужна: документы сеются в БД и ходят через
 * выгрузку → импорт самой службы (живой импорт, как у человека).
 *
 *  R2  Д-68/Д-69 живьём: ребёнок импортирован РАНЬШЕ родителя (узел файла
 *      — снимок, в /lineage/search и «Потомках» его нет) → родитель
 *      импортирован → кандидаты узла его находят (по имени и по подстроке)
 *      → привязка → узел кликабелен (synthesisId, coversFileNode), ребёнок
 *      в «Потомках» родителя и в /lineage/search по философу родителя →
 *      отвязка → узел файла снова снимок, «Потомки» без ребёнка; отвязка
 *      родителя мета-синтеза (без дерева файла) → 409 LINEAGE_GENERATED.
 *  R3  Д-70: два одновременных POST /lineage/link → одна строка, второй —
 *      409 LINEAGE_EXISTS; миграция на КОПИИ БД (pg_dump → philosynth_t151)
 *      с откатом 0014 и подсаженным дублем → дубль снят (осталась меньшая
 *      позиция), индекс создан, журнал миграций вырос на одну; копия
 *      импортированного синтеза (POST /:id/duplicate) несёт file_genealogy
 *      и узлы файла в древе; удалённый родитель — бейдж каталога
 *      (hasConceptParents) и шапка концепции (parentSyntheses ∪
 *      fileConceptParents) согласны в обе стороны.
 *  R4  Браузер (Chrome 131, сборка клиента): связать узел через кандидата
 *      и — другой узел — через поиск; второй шаг обязателен (один клик
 *      строки не пишет); отвязать; у родителя без узла файла действия нет.
 *
 * Запуск (≈ 1.5 мин): node_modules/.bin/tsx tests/test-151-requests2-4.mjs [R2 R3 R4]
 * Предпосылки: PG16 + Redis, миграции и сиды; pg_dump/psql/createdb в PATH
 * (R3); `npm i --no-save puppeteer-core@23`; Chrome 131 в
 * ~/.cache/puppeteer/chrome/linux-131.0.6778.204/ либо CHROME_PATH;
 * лог сервера — /tmp/t151-server.log.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import { homedir } from "node:os";
import postgres from "postgres";

const ONLY = process.argv.slice(2);
const want = (r) => ONLY.length === 0 || ONLY.includes(r);
const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5227;
const BASE = `http://127.0.0.1:${PORT}/api/v1`, UI = `http://127.0.0.1:${UI_PORT}`;
const CHROME = [process.env.CHROME_PATH, `${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`].find((p) => p && existsSync(p));
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
const COPY_DB = "philosynth_t151";
const COPY_URL = DB_URL.replace(/\/[^/?]+(\?|$)/, `/${COPY_DB}$1`);
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (id) => `[data-testid="${id}"]`;
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 900) : ""}`); }
}
const TAG = Math.random().toString(36).slice(2, 7);

/* ── Процессы ────────────────────────────────────────────────────────── */
const procs = [];
function sp(args, cwd, env, logFile) {
  const log = openSync(logFile, "w");
  const p = spawn(process.execPath, args, { cwd, detached: true, stdio: ["ignore", log, log], env: { ...process.env, ...env } });
  procs.push(p);
  return p;
}
async function isUp(url) { try { return (await fetch(url)).status < 500; } catch { return false; } }
async function waitUp(url, what) { for (let i = 0; i < 120; i++) { if (await isUp(url)) return; await sleep(500); } throw new Error(`${what} не поднялся: ${url}`); }

/* ── HTTP-клиенты ────────────────────────────────────────────────────── */
function client(cookie) {
  const api = async (method, p, body) => {
    const headers = cookie ? { Cookie: cookie } : {};
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
    const r = await fetch(BASE + p, { method, headers, body: payload });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  };
  return { api, cookie };
}
const userIds = [];
async function account(tag) {
  const email = `t151-${tag}-${Date.now()}@example.com`, password = "password-151";
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password, displayName: "Проверяющий" }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  userIds.push(u.id);
  return { ...client(cookie), id: u.id };
}
const wrap = (num, title, b) => `<div class="doc-section">\n<div class="section-num">§ ${num}</div>\n<div class="section-title">${title}</div>\n<div class="doc-content">\n${b}\n</div>\n</div>`;
async function seedDoc(userId, title, { lineage = [], fileGenealogy = null } = {}) {
  const [s] = await sql`insert into syntheses (user_id, seed, title, status, section_order, doc_num, method, synth_level, depth, file_genealogy)
    values (${userId}, ${"зерно 15.1 " + TAG}, ${title}, 'ready', ${sql.json(["sum"])}, ${"T151-" + Math.random().toString(36).slice(2, 7)}, 'dialectical', 'comparative', 'overview', ${fileGenealogy ? sql.json(fileGenealogy) : null}) returning id`;
  await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${s.id}, 'sum', 1, 'Резюме', ${wrap(1, "Исполнительное Резюме Синтеза", `<p>Текст ${title}.</p>`)})`;
  let pos = 0;
  for (const l of lineage) await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${s.id}, 'philosopher', ${l}, ${pos++})`;
  return s.id;
}
const rowsOf = (id) => sql`select parent_type, parent_name, parent_synthesis_id, position from synthesis_lineage where synthesis_id=${id} order by position`;
/** Живой импорт: выгрузка посеянного документа → правка встроенного состояния → POST /syntheses/import */
async function importVia(user, srcId, mutate) {
  const e = await user.api("GET", `/syntheses/${srcId}/export/html`);
  if (e.status !== 200) throw new Error(`export ${e.status}`);
  const m = e.text.match(/<script type="application\/json" id="philosynth-state">\s*([\s\S]*?)\s*<\/script>/);
  const st = JSON.parse(m[1]);
  mutate(st);
  const file = e.text.replace(/(<script type="application\/json" id="philosynth-state">\s*)[\s\S]*?(\s*<\/script>)/, (_m, a, b) => `${a}${J(st)}${b}`);
  const fd = new FormData();
  fd.append("file", new Blob([file], { type: "text/html" }), `t151-${TAG}-${Math.random().toString(36).slice(2, 6)}.html`);
  const ir = await user.api("POST", "/syntheses/import", fd);
  if (ir.status !== 200 && ir.status !== 201) throw new Error(`import ${ir.status}: ${ir.text.slice(0, 300)}`);
  return ir.json;
}
const kidsOf = async (user, id) => (await user.api("GET", `/syntheses/${id}/lineage/ancestors?depth=5`)).json?.tree?.children ?? [];
const descOf = async (user, id) => (await user.api("GET", `/syntheses/${id}/lineage/descendants?depth=5`)).json?.children ?? [];
const searchIds = async (user, phil) => ((await user.api("GET", `/lineage/search?philosopher=${encodeURIComponent(phil)}`)).json?.syntheses ?? []).map((s) => s.id);

/* ── Браузер ─────────────────────────────────────────────────────────── */
let browser = null, lastPage = null;
async function newPage(who) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("dialog", (d) => void d.accept());
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  lastPage = page;
  return page;
}
const exists = async (page, sel) => (await page.$(sel)) !== null;
const click = (page, sel) => page.$eval(sel, (el) => el.click());
const waitSel = (page, sel, ms = 20000) => page.waitForSelector(sel, { timeout: ms });
async function openDoc(page, id) {
  await page.goto(`${UI}/synthesis/${id}`, { waitUntil: "networkidle0" });
  await waitSel(page, ".doc-section");
  await waitSel(page, ".gen-card");
}
const cards = (page) => page.$$eval(".gen-tree .gen-card", (els) => els.map((el) => ({
  name: (el.querySelector(".gen-card-name")?.textContent ?? "").trim().slice(0, 60),
  fromFile: el.hasAttribute("data-from-file"),
  link: !!el.querySelector('[data-testid="lineage-node-link"]'),
  unlink: !!el.querySelector('[data-testid="lineage-node-unlink"]'),
  pos: el.querySelector('[data-testid="lineage-node-actions"]')?.getAttribute("data-position") ?? el.querySelector('[data-testid="lineage-node-actions"]')?.getAttribute("data-parent-id") ?? null,
})));

/* ══ Прогон ═════════════════════════════════════════════════════════════ */
let copyMade = false;
try {
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);
  if (want("R4")) {
    if (!CHROME) throw new Error("браузер не найден — задайте CHROME_PATH (Chrome 131)");
    console.log("■ Сборка клиента (vite build)");
    const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8" });
    ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
    sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t151-preview.log");
  }
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", ANTHROPIC_API_KEY: "mock-key-151" }, "/tmp/t151-server.log");
  await waitUp(`${BASE}/health`, "сервер");
  if (want("R4")) {
    await waitUp(UI, "preview");
    const puppeteer = (await import("puppeteer-core")).default;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
    console.log(`  (браузер: ${await browser.version()}; клиент — сборка под vite preview)`);
  }
  const A = await account("a");

  /* ════ R2: Д-68/Д-69 живьём ════ */
  if (want("R2")) {
    console.log("\n■ R2: Д-68/Д-69 — ребёнок импортирован раньше родителя");
    const SRC = await seedDoc(A.id, `Исходник ${TAG}`, { lineage: ["Гегель"] });
    const PNAME = `Родитель ${TAG}`;
    // ребёнок: в файле родитель-концепция «Родитель TAG» (без UUID) с философом Кантом внутри, плюс философ Гегель
    const child = await importVia(A, SRC, (st) => {
      st.genealogy.participants = [
        { type: "concept", name: PNAME, seed: "зерно родителя", participants: [{ type: "philosopher", name: "Кант" }] },
        { type: "philosopher", name: "Гегель" },
      ];
    });
    const C = child.id;
    const rowsC0 = await rowsOf(C);
    ok(rowsC0.length === 1 && rowsC0[0].parent_type === "philosopher" && rowsC0[0].position === 1 && (child.lineageCandidates ?? []).length === 1 && child.lineageCandidates[0].position === 0 && child.lineageCandidates[0].matches.length === 0,
      "импорт ребёнка: строка только у философа (позиция 1), кандидат узла 0 без совпадений — родителя ещё нет", { rowsC0, cands: child.lineageCandidates });
    const kids0 = await kidsOf(A, C);
    ok(kids0.length === 2 && kids0[0].fromFile === true && kids0[0].position === 0 && !kids0[0].synthesisId && kids0[0].children?.[0]?.name === "Кант", "древо: узел 0 — снимок файла (не кликабелен), внутри Кант", kids0);
    ok(!(await searchIds(A, "Кант")).includes(C), "/lineage/search?philosopher=Кант ребёнка НЕ находит (узел файла в поиске не участвует)");
    // родитель импортируется ПОЗЖЕ — живым импортом своего файла с тем же именем
    const PSRC = await seedDoc(A.id, PNAME, { lineage: ["Кант"] });
    const parent = await importVia(A, PSRC, () => {});
    const P = parent.id;
    const [prow] = await sql`select title from syntheses where id=${P}`;
    ok(prow.title === PNAME, "родитель импортирован с именем узла", prow);
    ok((await descOf(A, P)).length === 0, "«Потомки» родителя пусты до привязки");
    const cand = await A.api("GET", `/syntheses/${C}/lineage/file-node/0/candidates?q=${encodeURIComponent("родител")}`);
    const candIds = (cand.json?.matches ?? []).map((m) => m.id);
    ok(cand.status === 200 && candIds.includes(P) && !candIds.includes(PSRC) === false && (cand.json.search ?? []).some((s) => s.id === P), "кандидаты узла 0 находят импортированного родителя — по имени и по подстроке", cand.json);
    // по имени найдутся и посеянный PSRC (одноимённый) — выбор человека; связываем импортированного
    const link = await A.api("POST", `/syntheses/${C}/lineage/link`, { parentName: PNAME, parentSynthesisId: P, position: 0 });
    ok(link.status === 200 && link.json?.record?.position === 0, "привязка по позиции 0", link.json);
    const kids1 = await kidsOf(A, C);
    ok(kids1[0]?.synthesisId === P && kids1[0].coversFileNode === true && !kids1[0].fromFile && kids1[0].children?.[0]?.name === "Кант", "узел кликабелен: synthesisId родителя, coversFileNode, его родословная из БД", kids1[0]);
    ok((await descOf(A, P)).some((d) => d.synthesisId === C), "ребёнок в «Потомках» родителя");
    ok((await searchIds(A, "Кант")).includes(C), "/lineage/search?philosopher=Кант теперь находит ребёнка (транзитивно через родителя)");
    const g1 = await A.api("GET", `/syntheses/${C}`);
    ok(g1.json?.synthesis?.parentSyntheses?.some((p) => p.id === P) && (g1.json.synthesis.fileConceptParents ?? []).length === 0, "GET /:id: родитель в parentSyntheses, fileConceptParents пуст");
    // отвязка
    const un = await A.api("DELETE", `/syntheses/${C}/lineage/link/${P}`);
    const kids2 = await kidsOf(A, C);
    ok(un.status === 200 && un.json?.revealed?.position === 0 && un.json.revealed.name === PNAME, "DELETE link → 200, revealed — узел файла", un.json);
    ok(kids2[0]?.fromFile === true && !kids2[0].synthesisId && kids2[0].children?.[0]?.name === "Кант", "узел файла снова снимок со своей веткой", kids2[0]);
    ok(!(await descOf(A, P)).some((d) => d.synthesisId === C), "«Потомки» родителя без ребёнка");
    ok(!(await searchIds(A, "Кант")).includes(C), "/lineage/search по Канту ребёнка снова не находит");
    const g2 = await A.api("GET", `/syntheses/${C}`);
    ok((g2.json?.synthesis?.parentSyntheses ?? []).length === 0 && J(g2.json?.synthesis?.fileConceptParents) === J([PNAME]), "GET /:id после отвязки: fileConceptParents — узел файла");
    const [sec] = await sql`select html_content from sections where synthesis_id=${C} and key='sum'`;
    ok(/Исходник/.test(sec.html_content), "текст раздела ребёнка не переписан");
    // родитель мета-синтеза (без дерева файла) → LINEAGE_GENERATED
    const G = await seedDoc(A.id, `Мета ${TAG}`);
    await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${G}, 'synthesis', ${P}, 0)`;
    const unG = await A.api("DELETE", `/syntheses/${G}/lineage/link/${P}`);
    ok(unG.status === 409 && unG.json?.code === "LINEAGE_GENERATED" && (await rowsOf(G)).length === 1, "отвязка родителя мета-синтеза → 409 LINEAGE_GENERATED, строка на месте", unG.json);
    ok((await descOf(A, P)).some((d) => d.synthesisId === G), "мета-синтез остался в «Потомках» родителя");
  }

  /* ════ R3: Д-70 ════ */
  if (want("R3")) {
    console.log("\n■ R3: Д-70 — гонка, миграция на копии БД, копия синтеза, удалённый родитель");
    const P1 = await seedDoc(A.id, `Альфа ${TAG}`);
    const fileTree = { type: "concept", name: `Дитя ${TAG}`, participants: [{ type: "concept", name: `«Альфа ${TAG}»` }, { type: "philosopher", name: "Кант" }] };
    const C = await seedDoc(A.id, `Дитя ${TAG}`, { fileGenealogy: fileTree });
    await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${C}, 'philosopher', 'Кант', 1)`;
    // (а) гонка: два одновременных POST
    const body = { parentName: `Альфа ${TAG}`, parentSynthesisId: P1, position: 0 };
    const [ra, rb] = await Promise.all([A.api("POST", `/syntheses/${C}/lineage/link`, body), A.api("POST", `/syntheses/${C}/lineage/link`, body)]);
    const codes = [ra, rb].map((r) => r.status === 200 ? "ok" : r.json?.code);
    const rowsC = await rowsOf(C);
    ok(codes.filter((c) => c === "ok").length === 1 && codes.includes("LINEAGE_EXISTS") && rowsC.filter((r) => r.parent_synthesis_id === P1).length === 1, "два одновременных POST /lineage/link → одна строка, второй — 409 LINEAGE_EXISTS", { codes, rowsC });
    ok(rowsC.filter((r) => r.parent_synthesis_id === P1)[0].position === 0, "строка гонки на позиции узла файла (0)");

    // (б) миграция на копии БД: откат 0014 + подсаженный дубль → дубль снят
    const pg = (args, env = {}) => spawnSync(args[0], args.slice(1), { encoding: "utf8", env: { ...process.env, ...env } });
    const u = new URL(DB_URL);
    const PGENV = { PGHOST: u.hostname, PGPORT: u.port || "5432", PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password) };
    pg(["dropdb", "--if-exists", COPY_DB], PGENV);
    const cr = pg(["createdb", COPY_DB], PGENV);
    copyMade = cr.status === 0;
    const dump = spawnSync("sh", ["-c", `pg_dump "${DB_URL}" | psql -q -v ON_ERROR_STOP=0 "${COPY_URL}" > /tmp/t151-copy.log 2>&1`], { encoding: "utf8" });
    ok(copyMade && dump.status === 0, "копия БД снята (pg_dump → philosynth_t151)", (cr.stderr ?? "") + (dump.stderr ?? ""));
    const csql = postgres(COPY_URL, { onnotice: () => {} });
    try {
      // откат 0014: снять индекс и последнюю запись журнала drizzle; подсадить дубль и ещё один дубль с бо́льшей позицией
      await csql`drop index if exists uq_lineage_parent_pair`;
      const [last] = await csql`select id from drizzle.__drizzle_migrations order by id desc limit 1`;
      await csql`delete from drizzle.__drizzle_migrations where id=${last.id}`;
      const [{ n: journalBefore }] = await csql`select count(*)::int as n from drizzle.__drizzle_migrations`;
      await csql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${C}, 'synthesis', ${P1}, 7), (${C}, 'synthesis', ${P1}, 9)`;
      // две строки философа с одним именем — не пара, миграция их не трогает
      await csql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${C}, 'philosopher', 'Кант', 11)`;
      const [{ n: before }] = await csql`select count(*)::int as n from synthesis_lineage where synthesis_id=${C} and parent_synthesis_id=${P1}`;
      const mig = spawnSync(ROOT + "node_modules/.bin/drizzle-kit", ["migrate"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, DATABASE_URL: COPY_URL } });
      const [{ n: after }] = await csql`select count(*)::int as n from synthesis_lineage where synthesis_id=${C} and parent_synthesis_id=${P1}`;
      const kept = await csql`select position from synthesis_lineage where synthesis_id=${C} and parent_synthesis_id=${P1}`;
      const [{ n: idx }] = await csql`select count(*)::int as n from pg_indexes where indexname='uq_lineage_parent_pair'`;
      const [{ n: journalAfter }] = await csql`select count(*)::int as n from drizzle.__drizzle_migrations`;
      const [{ n: phils }] = await csql`select count(*)::int as n from synthesis_lineage where synthesis_id=${C} and parent_type='philosopher'`;
      ok(mig.status === 0 && before === 3 && after === 1 && kept[0]?.position === 0 && idx === 1 && journalAfter === journalBefore + 1 && phils === 2,
        "миграция 0014 на копии: 3 строки пары → 1 (позиция 0), индекс создан, журнал +1, строки философов не тронуты", { status: mig.status, before, after, kept, idx, journalBefore, journalAfter, phils, out: (mig.stdout + mig.stderr).slice(-300) });
      const dupTry = await csql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${C}, 'synthesis', ${P1}, 5)`.then(() => null).catch((e) => e.code);
      ok(dupTry === "23505", "после миграции дубль пары в копии отвергается 23505");
    } finally { await csql.end({ timeout: 2 }); }

    // (в) копия импортированного синтеза несёт file_genealogy
    const SRC = await seedDoc(A.id, `Импорт-исходник ${TAG}`, { lineage: ["Кант"] });
    const imp = await importVia(A, SRC, (st) => { st.genealogy.participants = [{ type: "concept", name: `Узел ${TAG}`, participants: [{ type: "philosopher", name: "Платон" }] }, { type: "philosopher", name: "Кант" }]; });
    const I = imp.id;
    const dup = await A.api("POST", `/syntheses/${I}/duplicate`);
    const D = dup.json?.id;
    const [drow] = await sql`select file_genealogy from syntheses where id=${D}`;
    const kidsD = await kidsOf(A, D);
    ok(dup.status === 201 && drow?.file_genealogy?.participants?.[0]?.name === `Узел ${TAG}` && kidsD.length === 2 && kidsD[0].fromFile === true && kidsD[0].children?.[0]?.name === "Платон" && kidsD[1].name === "Кант",
      "копия импортированного синтеза: file_genealogy перенесён, древо копии — узел файла с веткой и Кант", { status: dup.status, fg: drow?.file_genealogy, kidsD });
    const list1 = await A.api("GET", `/syntheses?limit=100`);
    const prevD = (list1.json?.items ?? []).find((s) => s.id === D);
    ok(prevD?.hasConceptParents === true, "бейдж «мета» у копии в каталоге (узел файла)", prevD);

    // (г) удалённый родитель: каталог ≡ шапка
    const Ptmp = await seedDoc(A.id, `Временный ${TAG}`);
    const G2 = await seedDoc(A.id, `Генерат ${TAG}`); // мета-синтез «генерацией» — без дерева файла
    await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${G2}, 'synthesis', ${Ptmp}, 0)`;
    const I2 = await seedDoc(A.id, `Импортный ${TAG}`, { fileGenealogy: { type: "concept", name: "i", participants: [{ type: "concept", name: `Временный ${TAG}` }] } });
    await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${I2}, 'synthesis', ${Ptmp}, 0)`;
    const agree = async (id) => {
      const list = await A.api("GET", `/syntheses?limit=100`);
      const badge = !!(list.json?.items ?? []).find((s) => s.id === id)?.hasConceptParents;
      const g = (await A.api("GET", `/syntheses/${id}`)).json?.synthesis;
      const head = (g?.parentSyntheses?.length ?? 0) > 0 || (g?.fileConceptParents?.length ?? 0) > 0;
      return { badge, head };
    };
    const b1 = await agree(G2), b2 = await agree(I2);
    ok(b1.badge && b1.head && b2.badge && b2.head, "до удаления родителя: бейдж и шапка — «мета» у обоих", { b1, b2 });
    const del = await A.api("DELETE", `/syntheses/${Ptmp}`);
    ok(del.status === 200 || del.status === 204, "родитель удалён через API", del.status);
    const rG = await rowsOf(G2);
    const a1 = await agree(G2), a2 = await agree(I2);
    ok(rG.length === 1 && rG[0].parent_synthesis_id === null, "строка связи осталась с NULL (SET NULL)", rG);
    ok(a1.badge === false && a1.head === false, "мета-синтез без дерева файла после удаления родителя: ни бейджа, ни шапки", a1);
    ok(a2.badge === true && a2.head === true, "импортированный с узлом файла на той позиции: бейдж и шапка согласны — «мета» (узел проступил)", a2);
    const g3 = (await A.api("GET", `/syntheses/${I2}`)).json?.synthesis;
    ok(J(g3?.fileConceptParents) === J([`Временный ${TAG}`]) && (g3?.parentSyntheses ?? []).length === 0, "шапка импортированного: родитель файла снимком", g3?.fileConceptParents);
  }

  /* ════ R4: браузер ════ */
  if (want("R4")) {
    console.log("\n■ R4: браузер — связать через кандидата и через поиск, второй шаг, отвязать, родитель без узла");
    const PA = await seedDoc(A.id, `Бета ${TAG}`);
    const PS = await seedDoc(A.id, `Совсем иное имя ${TAG}`);
    const PX = await seedDoc(A.id, `Икс ${TAG}`);
    const tree = { type: "concept", name: `Дитя-б ${TAG}`, participants: [
      { type: "concept", name: `«Бета ${TAG}»` }, { type: "concept", name: `Безвестный ${TAG}` }, { type: "philosopher", name: "Кант" },
    ] };
    const C = await seedDoc(A.id, `Дитя-б ${TAG}`, { fileGenealogy: tree, lineage: [] });
    await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${C}, 'philosopher', 'Кант', 2)`;
    await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${C}, 'synthesis', ${PX}, 3)`; // за пределами дерева файла
    const page = await newPage(A);
    await openDoc(page, C);
    const c0 = await cards(page);
    ok(c0.filter((c) => c.link).length === 2 && c0.filter((c) => c.unlink).length === 0 && !c0.find((c) => c.name.includes("Икс"))?.link && !c0.find((c) => c.name.includes("Икс"))?.unlink,
      "два узла файла с «Связать…», у родителя без узла файла (Икс) действий нет", c0);
    // узел 0 — через кандидата по имени; один клик по строке не пишет
    await click(page, `${T("lineage-node-actions")}[data-position="0"] ${T("lineage-node-link")}`);
    await waitSel(page, T("lineage-link-matches") + " " + T("lineage-node-link-pick"));
    await click(page, T("lineage-link-matches") + " " + T("lineage-node-link-pick"));
    await sleep(500);
    ok((await rowsOf(C)).every((r) => r.parent_synthesis_id !== PA) && (await exists(page, T("lineage-node-link-confirm"))), "первый клик «Связать» строки не пишет — ждёт второго шага");
    // клик мимо панели сбрасывает второй шаг (хук слушает mousedown — настоящая мышь, не el.click())
    { const box = await (await page.$(".doc-section")).boundingBox(); await page.mouse.click(box.x + 20, box.y + 20); }
    await sleep(300);
    ok(!(await exists(page, T("lineage-node-link-confirm"))), "клик мимо панели снимает второй шаг");
    await click(page, T("lineage-link-matches") + " " + T("lineage-node-link-pick"));
    await waitSel(page, T("lineage-node-link-confirm"));
    await click(page, T("lineage-node-link-confirm"));
    await waitSel(page, T("lineage-node-unlink"));
    await sleep(300);
    ok((await rowsOf(C)).some((r) => r.parent_synthesis_id === PA && r.position === 0), "узел 0 связан через кандидата (позиция 0)");
    // узел 1 — через поиск (имя не совпадает ни с чем)
    await click(page, `${T("lineage-node-actions")}[data-position="1"] ${T("lineage-node-link")}`);
    await waitSel(page, T("lineage-link-panel"));
    await sleep(400);
    ok(!(await exists(page, T("lineage-link-matches"))), "у узла без одноимённых — совпадений по имени нет");
    await page.type(T("lineage-link-search"), "иное имя");
    await waitSel(page, T("lineage-link-search-results") + " " + T("lineage-node-link-pick"));
    await click(page, T("lineage-link-search-results") + " " + T("lineage-node-link-pick"));
    await waitSel(page, T("lineage-node-link-confirm"));
    await click(page, T("lineage-node-link-confirm"));
    await sleep(800);
    const rows2 = await rowsOf(C);
    const c2 = await cards(page);
    ok(rows2.some((r) => r.parent_synthesis_id === PS && r.position === 1) && c2.filter((c) => c.unlink).length === 2 && c2.filter((c) => c.link).length === 0, "узел 1 связан через поиск (позиция 1); у обоих — «Отвязать», у Икса — ничего", { rows2, c2 });
    // отвязать узел 1 вторым шагом
    await click(page, `${T("lineage-node-actions")}[data-parent-id="${PS}"] ${T("lineage-node-unlink")}`);
    await waitSel(page, T("lineage-node-unlink-confirm"));
    await click(page, T("lineage-node-unlink-confirm"));
    await sleep(800);
    const rows3 = await rowsOf(C);
    const c3 = await cards(page);
    ok(rows3.every((r) => r.parent_synthesis_id !== PS) && c3.filter((c) => c.link).length === 1 && c3.filter((c) => c.unlink).length === 1 && c3.find((c) => c.name.includes("Безвестный"))?.fromFile === true, "узел 1 отвязан — снова снимок файла с «Связать…»; узел 0 остался связью", { rows3, c3 });
    ok(!c3.find((c) => c.name.includes("Икс"))?.unlink && rows3.some((r) => r.parent_synthesis_id === PX), "у родителя без узла файла по-прежнему нет действий, его строка цела");
    ok(page.errors.length === 0, "без ошибок страницы", page.errors);
  }
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
  if (lastPage) await lastPage.screenshot({ path: "/tmp/t151-fail.png" }).catch(() => {});
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch {} }
  for (const id of userIds) await sql`delete from syntheses where user_id=${id}`.catch(() => {});
  for (const id of userIds) await sql`delete from users where id=${id}`.catch(() => {});
  await sql.end({ timeout: 2 });
  if (copyMade) { const u = new URL(DB_URL); spawnSync("dropdb", ["--if-exists", COPY_DB], { env: { ...process.env, PGHOST: u.hostname, PGPORT: u.port || "5432", PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password) } }); }
}
console.log(`\nИТОГ test-151 (запросы 2–4): ${passed} ✓ / ${failed} ✗${fails.length ? "\n  провалы: " + fails.join(" | ") : ""}`);
process.exit(failed ? 1 : 0);
