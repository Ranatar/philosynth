/**
 * Беседа 9.2 — проверка ручной правки подраздела на ЖИВОМ файле одностраничника.
 * Файл задаётся T92_FILE (без него — пропуск, как T85_FILE у test-85): в репозитории
 * живых концепций нет. Сервер :3000 поднимается сам; нужны PG и Redis.
 *   T92_FILE=/path/PS-….html node tests/test-92-live-file.mjs
 * Что проверяется на КАЖДОМ подразделе документа: замки ≡ ожиданию беседы; исходник
 * без обёртки/<h4>/якорей оглавления; сохранение прочитанного — не правка; настоящая
 * правка проходит БЕЗ предупреждений (белый список покрывает всё, что даёт генерация) и
 * меняет только свой подраздел; в конце — круг экспорт → импорт находит те же подразделы.
 *
 * ДВЕ ФАЗЫ — два происхождения документа (вопрос пользователя: живой файл породил
 * одностраничник, а не служба — не иначе ли размечает служба?):
 *  A. ИМПОРТ файла (4.3): html_content — разметка одностраничника после его DOM-обработки
 *     (якоря оглавления перед <h4>, ⏫ в заголовках).
 *  B. ГЕНЕРАЦИЯ СЛУЖБОЙ: мок Claude отдаёт разделы живого файла как ОТВЕТ МОДЕЛИ (сняв
 *     то, что дописал одностраничник), и документ строит настоящий конвейер службы —
 *     POST /syntheses → стрим → upsertSection (html_content = ответ модели ДОСЛОВНО, без
 *     прохода через DOM) → saveGraphToDb/saveElementsToDb. Раздел мок узнаёт по именам
 *     подразделов в хвосте промпта от «ЗАДАНИЕ» (приём test-16/22).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { parseHTML } from "linkedom";
import postgres from "postgres";

const FILE = process.env.T92_FILE;
if (!FILE || !existsSync(FILE)) { console.log("T92_FILE не задан или файла нет — пропуск"); process.exit(0); }
const ROOT = new URL("../", import.meta.url).pathname;
const BASE = "http://127.0.0.1:3000/api/v1";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth");
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
function ok(cond, name, extra) { if (cond) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${extra !== undefined ? " — " + String(extra).slice(0, 500) : ""}`); } }

/* ── «Ответы модели» из живого файла: раздел без того, что дописал одностраничник ── */
const MOCK_PORT = 3893;
const { document: liveDoc } = parseHTML(readFileSync(FILE, "utf8"));
const modelSections = [...liveDoc.querySelectorAll(".doc-section")].map((el) => {
  const names = [...el.querySelectorAll("[data-section]")].map((x) => x.getAttribute("data-section"));
  for (const junk of el.querySelectorAll('a[id^="subsec-"], a[id^="sec-"], .toc-back-btn, details.sec-disclosure')) junk.remove();
  // как у настоящей модели: переводы строк между блоками, без прохода через DOM браузера
  return { names, html: el.outerHTML.replace(/<\/(p|div|table|ul|ol|h4|h5)>/g, "</$1>\n") };
}).filter((x) => x.names.length > 0);
const mock = { calls: 0, picked: [] };
function pickSection(prompt) {
  const task = prompt.slice(Math.max(0, prompt.lastIndexOf("ЗАДАНИЕ")));
  let best = null, bestHits = 0;
  // 10.1: задание критики несёт закрытый список адресов — имена подразделов ВСЕХ разделов
  // документа («Таблица категорий», «Таблица определений»…), поэтому критика узнаётся ПЕРВОЙ,
  // по собственному подразделу, которого нет ни в одном другом задании.
  if (task.includes("Таблица рекомендаций")) return modelSections.find((x) => x.names.includes("Рекомендации по улучшению")) ?? null;
  for (const sct of modelSections) {
    const hits = sct.names.filter((n) => task.includes(n)).length / sct.names.length;
    if (hits > bestHits) { best = sct; bestHits = hits; }
  }
  return best;
}
const mockSrv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", async () => {
    mock.calls++;
    let prompt = "";
    try { const c = JSON.parse(body).messages?.[0]?.content; prompt = typeof c === "string" ? c : J(c); } catch {}
    const sct = pickSection(prompt);
    mock.picked.push(sct ? sct.names[0] : "(не узнан)");
    const html = sct ? sct.html : '<div class="doc-section"><div class="doc-content"><p>Раздел не узнан моком.</p></div></div>';
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (o) => res.write(`data: ${J(o)}\n\n`);
    send({ type: "message_start", message: { usage: { input_tokens: 1000 } } });
    for (let i = 0; i < html.length; i += 1500) send({ type: "content_block_delta", delta: { type: "text_delta", text: html.slice(i, i + 1500) } });
    send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2000 } });
    send({ type: "message_stop" });
    res.end();
  });
});
await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));

const srv = spawn(process.execPath, ["--import", "tsx", "index.ts"], { cwd: ROOT + "server", detached: true, stdio: "ignore", env: { ...process.env, PORT: "3000", RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-92", STREAM_RETRY_DELAYS: "50" } });
let cookie = "";
async function api(method, path, body, raw = false) {
  const headers = { Cookie: cookie };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
  const r = await fetch(BASE + path, { method, headers, body: payload });
  return raw ? { status: r.status, text: await r.text() } : { status: r.status, json: await r.json().catch(() => null) };
}
const subPath = (id, key, name) => `/syntheses/${id}/sections/${key}/subsections/${encodeURIComponent(name)}`;
async function importFile(text) {
  const fd = new FormData();
  fd.append("file", new Blob([text], { type: "text/html" }), "live.html");
  return api("POST", "/syntheses/import", fd);
}
const ids = [];

async function sweep(ID, origin) {

  const sums = (await api("GET", `/syntheses/${ID}/sections`)).json.sections;
  console.log(`   разделы: ${sums.map((s) => `${s.key}(${s.subsections.length})`).join(" ")}`);

  console.log("\n■ Замки на живой концепции");
  const expected = { graph: ["Таблица категорий", "Таблица связей", "Топологическая таблица"], theses: ["Сводная таблица тезисов"], glossary: ["Таблица определений"] };
  const full = {};
  for (const s of sums) full[s.key] = (await api("GET", `/syntheses/${ID}/sections/${s.key}`)).json.section;
  for (const s of sums) {
    const want = (expected[s.key] ?? []).filter((n) => s.subsections.includes(n));
    ok(J([...full[s.key].lockedSubsections].sort()) === J([...want].sort()), `${s.key}: заперто ровно ${want.length ? want.map((n) => `«${n}»`).join(", ") : "ничего"}`, J(full[s.key].lockedSubsections));
  }
  for (const n of ["Топология графа", "Методология построения графа"]) if (full.graph?.subsections.includes(n)) ok(!full.graph.lockedSubsections.includes(n), `graph: «${n}» правится`);
  if (full.critique) console.log(`   critique: таблиц ${(full.critique.htmlContent.match(/<table/g) ?? []).length}, заперто ${full.critique.lockedSubsections.length}`);

  console.log("\n■ Каждый незапертый подраздел: исходник, холостое сохранение, правка");
  const MARK_BASE = " [правка 9.2";
  let total = 0, idleBad = [], warnBad = [], srcBad = [], editBad = [], leakBad = [];
  for (const s of sums) {
    for (const name of s.subsections) {
      if (full[s.key].lockedSubsections.includes(name)) continue;
      total++;
      const MARK = `${MARK_BASE} №${total}]`; // своя метка на подраздел: прежние правки раздела уже в «до»
      const src = (await api("GET", subPath(ID, s.key, name))).json;
      if (!src || src.lock || /<h4|data-section|toc-back-btn|id="subsec-/.test(src.html)) { srcBad.push(`${s.key}:${name}`); continue; }
      const idle = await api("PATCH", subPath(ID, s.key, name), { html: src.html });
      if (idle.status !== 200 || idle.json.changed !== false) idleBad.push(`${s.key}:${name}`);
      const before = (await api("GET", `/syntheses/${ID}/sections/${s.key}`)).json.section.htmlContent;
      const at = src.html.indexOf("</p>");
      const edited = at >= 0 ? src.html.slice(0, at) + MARK + src.html.slice(at) : src.html + `\n<p>${MARK.trim()}</p>`;
      const r = await api("PATCH", subPath(ID, s.key, name), { html: edited });
      if (r.status !== 200 || !r.json.changed) { editBad.push(`${s.key}:${name} → ${r.status} ${J(r.json?.details ?? r.json?.error)}`); continue; }
      if (r.json.warnings.length) warnBad.push(`${s.key}:${name} → ${r.json.warnings.join("; ")}`);
      // правка меняет ТОЛЬКО свой подраздел: без метки HTML раздела обязан совпасть с прежним с точностью до пробелов между блоками
      const norm = (h) => h.replace(/>\s+</g, "><").trim();
      const afterHtml = r.json.section.htmlContent;
      const back = at >= 0 ? afterHtml.replace(MARK, "") : afterHtml.replace(`<p>${MARK.trim()}</p>`, "");
      if (norm(back) !== norm(before)) leakBad.push(`${s.key}:${name}`);
    }
  }
  ok(total > 20, `[${origin}] незапертых подразделов в документе: ${total}`);
  ok(srcBad.length === 0, "исходник каждого — без <h4>, обёртки, якорей и ⏫ оглавления одностраничника", J(srcBad));
  ok(idleBad.length === 0, "сохранение прочитанного исходника нигде не считается правкой", J(idleBad));
  ok(editBad.length === 0, "настоящая правка проходит в каждом подразделе", J(editBad));
  ok(warnBad.length === 0, "НИ ОДНОГО предупреждения чистки: белый список покрывает всё, что дала генерация", J(warnBad));
  ok(leakBad.length === 0, "правка меняет только свой подраздел — остальной HTML раздела прежний", J(leakBad));

  console.log("\n■ После правок");
  const sums2 = (await api("GET", `/syntheses/${ID}/sections`)).json.sections;
  ok(J(sums2.map((s) => [s.key, s.subsections])) === J(sums.map((s) => [s.key, s.subsections])), "состав и порядок подразделов всех разделов прежние");
  let locksSame = true;
  for (const s of sums) if (J((await api("GET", `/syntheses/${ID}/sections/${s.key}`)).json.section.lockedSubsections) !== J(full[s.key].lockedSubsections)) locksSame = false;
  ok(locksSame, "замки прежние");
  const [vc] = await sql`select count(*)::int n from element_versions where synthesis_id=${ID} and element_type='section' and change_source='manual'`;
  ok(vc.n === total, `[${origin}] версий section/manual — по одной на правку (${vc.n}), холостые сохранения версий не дали`);
  const cats = (await api("GET", `/syntheses/${ID}/categories`)).json.categories;
  if (cats?.length) {
    const p = await api("PATCH", `/syntheses/${ID}/categories/${cats[0].id}`, { definition: cats[0].definition + " (уточнено)" });
    const g = (await api("GET", `/syntheses/${ID}/sections/graph`)).json.section.htmlContent;
    ok(p.status === 200 && g.includes("(уточнено)") && g.includes(MARK_BASE.trim()), "перерисовка таблицы категорий (5.1) ручные правки прозы graph не затёрла", J(p.json?.htmlSync));
  }
  const ex = await api("GET", `/syntheses/${ID}/export/html`, undefined, true);
  const re = await importFile(ex.text);
  ok(ex.status === 200 && re.status === 200, "экспорт 4.2 правленого документа собирается, импорт 4.3 его принимает");
  if (re.json?.id) {
    ids.push(re.json.id);
    const sums3 = (await api("GET", `/syntheses/${re.json.id}/sections`)).json.sections;
    ok(J(sums3.map((s) => [s.key, s.subsections])) === J(sums.map((s) => [s.key, s.subsections])), "круг экспорт → импорт: те же разделы и те же подразделы");
  }
}
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/health`)).ok) break; } catch {} await sleep(500); }
  const email = `t92live-${Date.now()}@example.com`;
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-92" }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-92" }) });
  cookie = lr.headers.get("set-cookie").split(";")[0];

  console.log("\n══ ФАЗА A: документ заведён ИМПОРТОМ файла одностраничника ══");
  const im = await importFile(readFileSync(FILE, "utf8"));
  ok(im.status === 200 && !!im.json?.id, "файл заведён импортом 4.3", J(im.json).slice(0, 300));
  ids.push(im.json.id);
  await sweep(im.json.id, "импорт");

  console.log("\n\n══ ФАЗА B: тот же документ строит СЛУЖБА (мок Claude отдаёт разделы файла как ответ модели) ══");
  const wanted = ["graph", "glossary", "theses", "history", "name", "practical", "dialogue", "evolution", "critique", "origin"];
  const created = await api("POST", "/syntheses", { seed: "Живой файл как ответ модели (9.2)", philosophers: ["Кант", "Гегель"], sections: wanted, method: "dialectical", depth: "overview", synthLevel: "comparative" });
  ok(created.status === 201 && !!created.json?.id, "POST /syntheses → 201", J(created.json).slice(0, 300));
  const GEN = created.json.id; ids.push(GEN);
  let st = "";
  for (let i = 0; i < 240; i++) { st = (await sql`select status from syntheses where id=${GEN}`)[0]?.status; if (st === "ready" || st === "error" || st === "paused") break; await sleep(500); }
  ok(st === "ready", `генерация службой завершена (status=${st}, вызовов мока ${mock.calls})`, J(mock.picked));
  ok(!mock.picked.includes("(не узнан)"), "мок узнал раздел в каждом вызове", J(mock.picked));
  const raw = (await sql`select key, html_content from sections where synthesis_id=${GEN}`);
  ok(raw.length >= 10 && raw.every((r) => !/id="subsec-|toc-back-btn/.test(r.html_content)), "html_content службы — ответ модели дословно: якорей оглавления и ⏫ в БД нет (их дорисовывает клиент)");
  ok(raw.some((r) => /<\/p>\n/.test(r.html_content)), "…и с переводами строк между блоками, как пришло от модели (без прохода через DOM)");
  const n = async (t) => (await sql.unsafe(`select count(*)::int n from ${t} where synthesis_id='${GEN}'`))[0].n;
  console.log(`   гранулярные таблицы службы: категорий ${await n("categories")}, связей ${await n("category_edges")}, тезисов ${await n("theses")}, терминов ${await n("glossary_terms")}`);
  ok((await n("categories")) > 0 && (await n("theses")) > 0 && (await n("glossary_terms")) > 0, "гранулярные таблицы наполнены побочными эффектами генерации (не импортом)");
  await sweep(GEN, "генерация службой");
} catch (e) { failed++; console.log("СБОЙ:", e?.stack ?? e); }
finally {
  for (const id of ids) await sql`delete from syntheses where id=${id}`.catch(() => {});
  try { process.kill(-srv.pid, "SIGKILL"); } catch {}
  mockSrv.closeAllConnections?.(); mockSrv.close();
  await Promise.race([sql.end({ timeout: 2 }), sleep(3000)]);
}
console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗`);
process.exit(failed ? 1 : 0);
