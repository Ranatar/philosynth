/**
 * Беседа 12.1 — тестовые запросы 2–5 одним харнессом.
 * Живой сервер :3121 + PG16/Redis + мок Claude :3921, только HTTP (беседа
 * серверная, клиент не правился — браузер не нужен). Документы:
 *  - ЖИВОЙ файл концепции (T121_FILE; без файла — пропуск): импорт 4.3 →
 *    ретрофит 10.1 (мок отдаёт таблицу рекомендаций);
 *  - «живая концепция без файла» (урок 9.2): фикстура строками sections →
 *    GET export/html → POST import — гранулярные таблицы наполняют парсеры 1.4.
 *
 *  R2  Д-1 на живом файле (как R8 test-103, ПОВТОРНЫЙ круг): правка тезиса
 *      «Э-2» → сводная таблица сохранила буквенные метки → перегенерация
 *      критики → повторный разбор находит рекомендацию к «Э-3»; документ с
 *      целой нумерацией — метки целые, как прежде
 *  R3  Д-3/Д-4: правка подраздела тезисов меняет обоснование в прозе →
 *      theses.justification, версия 'manual'; правка того же тезиса редактором
 *      не возвращает старый текст; правка раздела name → название обновлено;
 *      после переименования ✎ — не тронуто
 *  R4  Д-5/Д-14/Д-31: GET …/sections/sum/context → 200; откат версии капсулы
 *      (без строки sections — импорт, и со строкой — генерация) → шапка
 *      документа отдаёт прежнюю капсулу, ответ несёт признак; parseWarnings —
 *      владельцу и при флаге логов, чужому без флага поля нет
 *  R5  Д-8: экспорт свободного синтеза → импорт → ни одного критичного
 *      предупреждения; живой файл в записи одностраничника (концепция в
 *      ёлочках в футере и params.phil) — концепция не числится философом
 *
 * Запуск (≈ 1 мин, в фоне): T121_FILE=… node_modules/.bin/tsx tests/test-121-requests2-5.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, openSync, readFileSync } from "node:fs";
import http from "node:http";
import { parseHTML } from "linkedom";
import postgres from "postgres";

const FILE = process.env.T121_FILE;
if (!FILE || !existsSync(FILE)) { console.log("T121_FILE не задан или файла нет — ПРОПУСК"); process.exit(0); }
const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3121;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const sql = postgres(process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth");
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
function ok(cond, name, extra) { if (cond) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 600) : ""}`); } }

const RAW = readFileSync(FILE, "utf8");
const PROSE = "Рекомендации по улучшению", TABLE = "Таблица рекомендаций";
const HEAD = ["№", "Адрес", "Элемент", "Операция", "Готовая замена", "Основание", "Важность"];
const ROWS = [
  ["1", "Таблица категорий", "Индивидуация-как-практика", "уточнить формулировку", "", "Верность методу синтеза", "существенная"],
  ["2", "Эпистемологические тезисы", "Э-3", "развить", "", "Слепые пятна", "существенная"],
  ["3", "Новизна и ценность", "", "уточнить формулировку", "", "Сохранение ценных аспектов", "косметическая"],
];
const tableHtml = (rows) => `<table class="doc-table"><thead><tr>${HEAD.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const wrapped = (inner) => `<div data-section="${TABLE}"><h4>${TABLE}</h4>\n${inner}\n</div>`;

/* ── Мок Claude: ретрофит таблицы и перегенерация критики из живого файла ── */
const MOCK_PORT = 3921;
const { document: liveDoc } = parseHTML(RAW);
const liveCritiqueEl = [...liveDoc.querySelectorAll(".doc-section")].find((el) => [...el.querySelectorAll("[data-section]")].some((x) => x.getAttribute("data-section") === PROSE));
for (const junk of liveCritiqueEl.querySelectorAll('a[id^="subsec-"], a[id^="sec-"], .toc-back-btn, details.sec-disclosure')) junk.remove();
const liveCritiqueHtml = liveCritiqueEl.outerHTML.replace(/<\/(p|div|table|ul|ol|h4|h5)>/g, "</$1>\n");
function critiqueAnswer() {
  const html = liveCritiqueHtml.replace("<strong>Рекомендация 1:", "<strong>Рекомендация 1 (вторая редакция):");
  const { document: d } = parseHTML(`<div id="r">${html}</div>`);
  for (const old of [...d.querySelectorAll("[data-section]")].filter((x) => x.getAttribute("data-section") === TABLE)) old.remove();
  const prose = [...d.querySelectorAll("[data-section]")].find((x) => x.getAttribute("data-section") === PROSE);
  // 12.2: в файле без абзацев «Рекомендация N:» (рекомендации в прозе — таблицей) метка редакции
  // ставится в первый абзац подраздела; иначе ответ мока равен прежнему разделу и раунд 2 не открыть
  if (!html.includes("вторая редакция")) prose.querySelector("p")?.insertAdjacentHTML("afterbegin", "(вторая редакция) ");
  prose.insertAdjacentHTML("afterend", "\n\n" + wrapped(tableHtml(ROWS)) + "\n");
  return d.getElementById("r").innerHTML;
}
const mock = { calls: 0, picked: [], critiquePrompt: "" };
const mockSrv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    mock.calls++;
    let prompt = "";
    try { const j = JSON.parse(body); const c = j.messages?.[0]?.content; prompt = typeof c === "string" ? c : J(c); } catch {}
    let text;
    if (prompt.includes("ПЕРЕЛОЖИТЬ в таблицу")) { mock.picked.push("(ретрофит)"); text = wrapped(tableHtml(ROWS)); }
    else { mock.picked.push("(критика)"); mock.critiquePrompt = prompt; text = critiqueAnswer(); }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (o) => res.write(`data: ${J(o)}\n\n`);
    send({ type: "message_start", message: { usage: { input_tokens: 1000 } } });
    for (let i = 0; i < text.length; i += 1500) send({ type: "content_block_delta", delta: { type: "text_delta", text: text.slice(i, i + 1500) } });
    send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2000 } });
    send({ type: "message_stop" });
    res.end();
  });
});
await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));

/* ── Сервер и клиенты ────────────────────────────────────────────────── */
let srv = null;
try { if ((await fetch(`${BASE}/health`)).ok) { console.log(`На :${PORT} уже отвечает чужой сервер — стоп (сироты: ps aux | grep '[i]ndex.ts')`); process.exit(2); } } catch {}
const srvLog = openSync("/tmp/t121-server.log", "w"); // сервер не слепой (09 §4, 11.2 п.2)
srv = spawn(process.execPath, ["--import", "tsx", "index.ts"], { cwd: ROOT + "server", detached: true, stdio: ["ignore", srvLog, srvLog], env: { ...process.env, PORT: String(PORT), RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-121", STREAM_RETRY_DELAYS: "50", BILLING_ENFORCE: "false" } });
async function waitHealth() { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/health`)).ok) return true; } catch {} await sleep(500); } return false; }

function client(cookie) {
  const api = async (method, path, body) => {
    const headers = cookie ? { Cookie: cookie } : {};
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
    const r = await fetch(BASE + path, { method, headers, body: payload });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  };
  return { api };
}
async function account(tag) {
  const email = `t121-${tag}-${Date.now()}@example.com`;
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-121" }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-121" }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  return { ...client(cookie), email, id: u.id };
}
const ids = [];
async function importFile(user, html, name = "live.html") {
  const fd = new FormData(); fd.append("file", new Blob([html], { type: "text/html" }), name);
  const imp = await user.api("POST", "/syntheses/import", fd);
  if (imp.status !== 200 && imp.status !== 201) throw new Error("импорт: " + J(imp.json));
  ids.push(imp.json.id);
  return imp.json;
}
const S = (id, tail = "") => `/syntheses/${id}${tail}`;
/** SynthesisFull: GET /syntheses/:id отвечает { synthesis } */
const full = async (user, id) => { const r = await user.api("GET", S(id)); const j = r.json; return j?.synthesis ?? (j && !("id" in j) && Object.keys(j).length === 1 ? Object.values(j)[0] : j); };
const thesesOf = (id) => sql`select * from theses where synthesis_id=${id} order by thesis_num`;
const secHtml = async (id, key) => (await sql`select html_content h from sections where synthesis_id=${id} and key=${key}`)[0]?.h ?? "";
const tableLabels = (html) => [...(/data-section="Сводная таблица тезисов"[\s\S]*$/.exec(html)?.[0] ?? "").matchAll(/<tr>\s*<td>([^<]+)<\/td>/g)].map((m) => m[1]);
const subUrl = (id, key, name) => S(id, `/sections/${key}/subsections/${encodeURIComponent(name)}`);
/** Повтор на 409: статус в БД пишется раньше освобождения слота (09 §4, 10.2 п.1). */
async function retry409(fn) { for (let i = 0; i < 40; i++) { const r = await fn(); if (r.status !== 409) return r; await sleep(300); } return fn(); }

/* ── Фикстуры «как даёт генерация» ───────────────────────────────────── */
const tbl = (h, rows) => `<table class="doc-table"><thead><tr>${h.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const sub = (n, b) => `<div data-section="${n}"><h4>${n}</h4>${b}</div>`;
const wrap = (num, title, b) => `<div class="doc-section"><div class="section-num">§ ${num}</div><div class="section-title">${title}</div><div class="doc-content">${b}</div></div>`;
const TH = ["№", "Формулировка тезиса", "Тип (онтол./эпистем./этич.)", "Степень новизны", "Связанные категории"];
const OLD_J = "Потому что различие первично относительно тождества (§ Граф категорий).";
const NEW_J = "Потому что различие ПЕРВИЧНО, а тождество производно — исправлено рукой.";
const fixtureSections = (title) => [
  { key: "sum", num: 1, title: "Исполнительное резюме", html: wrap(1, "Исполнительное резюме", sub("Цели и метод", "<p>Цель синтеза — прояснить паузу.</p>")) },
  { key: "theses", num: 2, title: "Корпус тезисов", html: wrap(2, "Корпус тезисов",
      sub("Онтологические тезисы", `<p><strong>Бытие есть событие различия</strong> ${OLD_J}</p><p><strong>Ничто не предшествует бытию</strong> Обоснование второго тезиса.</p>`) +
      sub("Эпистемологические тезисы", "<p><strong>Познание есть участие в событии</strong> Обоснование третьего тезиса.</p>") +
      sub("Сводная таблица тезисов", tbl(TH, [["О-1", "Бытие есть событие различия", "Онтологический", "высокая", "Бытие, Различие"], ["О-2", "Ничто не предшествует бытию", "Онтологический", "средняя", "Ничто"], ["Э-1", "Познание есть участие в событии", "Эпистемологический", "высокая", "Познание"]]))) },
  { key: "name", num: 3, title: "Анализ названия", html: wrap(3, "Анализ названия",
      sub("Варианты названия", "<p><strong>Первый вариант</strong> — черновой.</p>") +
      sub("Итоговая рекомендация", `<p><strong>Итоговая рекомендация: ${title}: опыт медленной онтологии</strong> Довод в пользу названия.</p>`)) },
];
async function seedDoc(userId, { title, seed, philosophers }) {
  const [s] = await sql`insert into syntheses (user_id, seed, title, status, section_order, doc_num) values (${userId}, ${seed}, ${title}, 'ready', ${sql.json(["sum", "theses", "name"])}, ${"T121-" + Math.random().toString(36).slice(2, 7)}) returning id`;
  ids.push(s.id);
  for (const x of fixtureSections(title)) await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${s.id}, ${x.key}, ${x.num}, ${x.title}, ${x.html})`;
  let pos = 0;
  for (const name of philosophers) await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${s.id}, 'philosopher', ${name}, ${pos++})`;
  return s.id;
}

try {
  if (!(await waitHealth())) throw new Error("сервер не поднялся (см. /tmp/t121-server.log)");
  const A = await account("a"), C = await account("c");
  const guest = client(null);

  /* ════ R2: Д-1 на живом файле ════ */
  console.log("\n■ R2: Д-1 — метки тезисов на живом файле, повторный круг");
  const live = await importFile(A, RAW);
  const L = live.id;
  {
    ok(live.warnings.every((w) => !w.critical), "импорт живого файла без критичных предупреждений", live.warnings.filter((w) => w.critical));
    let th = await thesesOf(L);
    const labels0 = th.map((x) => x.label);
    console.log(`    · тезисов ${th.length}: ${labels0.join(", ")}`);
    ok(th.length > 0 && labels0.every((l) => /^[А-ЯЁ]+-\d+$/.test(l ?? "")), "метки тезисов записаны в theses.label при импорте", labels0);
    ok(J(tableLabels(await secHtml(L, "theses"))) === J(labels0), "сводная таблица файла несёт те же метки");
    const ex = await A.api("POST", S(L, "/recommendations/extract"));
    ok(ex.status === 200, "ретрофит таблицы рекомендаций (мок) → 200", ex.json);
    let recs = await sql`select * from recommendations where synthesis_id=${L} order by round, position`;
    const e3 = th.find((x) => x.label === "Э-3"), e2 = th.find((x) => x.label === "Э-2");
    ok(!!e2 && !!e3, "в файле есть тезисы «Э-2» и «Э-3»");
    ok(recs.find((r) => r.element === "Э-3")?.status === "new" && recs.find((r) => r.element === "Э-3")?.element_id === e3.id, "раунд 1: рекомендация к «Э-3» сведена с тезисом", recs.map((r) => [r.num, r.element, r.status, r.invalid_reason]));
    // правка тезиса «Э-2» редактором
    const p = await A.api("PATCH", S(L, `/theses/${e2.id}`), { noveltyDegree: (e2.novelty_degree || "высокая") + " (уточнено)" });
    ok(p.status === 200 && p.json.thesis.label === "Э-2" && p.json.htmlSync.rendered.length === 1, "PATCH тезиса «Э-2» → 200, DTO несёт label, таблица перерисована", p.json?.htmlSync ?? p.json);
    const labels1 = tableLabels(await secHtml(L, "theses"));
    ok(J(labels1) === J(labels0), "после правки тезиса сводная таблица сохранила буквенные метки", labels1);
    ok((await secHtml(L, "theses")).includes("(уточнено)"), "… и несёт новое значение поля");
    // перегенерация критики (мок: вторая редакция прозы + таблица) → повторный разбор
    const rg = await retry409(() => A.api("POST", S(L, "/regenerate/critique"), {}));
    ok(rg.status === 200, "перегенерация критики запущена", rg.json);
    let regenerated = false;
    for (let i = 0; i < 150 && !regenerated; i++) { regenerated = (await secHtml(L, "critique")).includes("вторая редакция"); if (!regenerated) await sleep(200); }
    ok(regenerated, "критика перегенерирована (вторая редакция прозы)", mock.picked);
    if (mock.critiquePrompt.includes("СВОДКА ТЕЗИСОВ")) ok(/Э-2 \| /.test(mock.critiquePrompt) && /О-1 \| /.test(mock.critiquePrompt), "контекст критики называет тезисы метками документа («Э-2 | …»)", mock.critiquePrompt.slice(mock.critiquePrompt.indexOf("СВОДКА ТЕЗИСОВ"), mock.critiquePrompt.indexOf("СВОДКА ТЕЗИСОВ") + 200));
    else console.log("    · сводка тезисов в контекст критики этой конфигурации не входит — проверка меток в контексте пропущена");
    const parse = await retry409(() => A.api("POST", S(L, "/recommendations/parse")));
    ok(parse.status === 200, "повторный разбор критики → 200", parse.json);
    recs = await sql`select * from recommendations where synthesis_id=${L} order by round, position`;
    const round2 = recs.filter((r) => r.round === 2);
    const r3 = round2.find((r) => r.element === "Э-3");
    ok(round2.length === ROWS.length, "открыт раунд 2", recs.map((r) => [r.round, r.num, r.status]));
    ok(r3?.status === "new" && r3?.element_kind === "thesis" && r3?.element_id === e3.id && !r3?.invalid_reason, "раунд 2: рекомендация к «Э-3» найдена (не 'invalid') — метка пережила правку соседнего тезиса", r3 && [r3.status, r3.element_kind, r3.invalid_reason]);
    th = await thesesOf(L);
    ok(J(th.map((x) => x.label)) === J(labels0) && J(tableLabels(await secHtml(L, "theses"))) === J(labels0), "после круга правка → перегенерация → разбор метки целы и в БД, и в таблице");

    // документ с целой нумерацией: как прежде
    let n = 0;
    const plainHtml = RAW.replace(/(data-section="Сводная таблица тезисов"[\s\S]*?<\/table>)/, (m) => m.replace(/<td>[А-ЯЁ]+-\d+<\/td>/g, () => `<td>${++n}</td>`));
    const plain = await importFile(A, plainHtml, "plain.html");
    let pt = await thesesOf(plain.id);
    ok(n === pt.length && pt.every((x) => x.label === null) && J(pt.map((x) => x.thesis_num)) === J(pt.map((_x, i) => i + 1)), "документ с целой нумерацией: label NULL, номера 1…N", pt.map((x) => [x.thesis_num, x.label]));
    const pp = await A.api("PATCH", S(plain.id, `/theses/${pt[1].id}`), { noveltyDegree: "средняя (уточнено)" });
    ok(pp.status === 200 && pp.json.thesis.label === null && J(tableLabels(await secHtml(plain.id, "theses"))) === J(pt.map((x) => String(x.thesis_num))), "… после правки тезиса в таблице целые номера, как прежде", tableLabels(await secHtml(plain.id, "theses")));
  }

  /* ════ R3: Д-3 / Д-4 ════ */
  console.log("\n■ R3: Д-3 — проза тезиса; Д-4 — название из раздела name");
  const seeded = await seedDoc(A.id, { title: "Онтология паузы", seed: "Что есть пауза?", philosophers: ["Кант", "Гегель"] });
  const exp = await A.api("GET", S(seeded, "/export/html"));
  const F = (await importFile(A, exp.text, "fixture.html")).id;
  {
    let th = await thesesOf(F);
    ok(exp.status === 200 && th.length === 3 && J(th.map((x) => x.label)) === J(["О-1", "О-2", "Э-1"]) && th[0].justification === OLD_J, "фикстура через экспорт → импорт: тезисы, метки и обоснования разобраны парсером 1.4", th.map((x) => [x.label, x.justification.slice(0, 30)]));
    const src = await A.api("GET", subUrl(F, "theses", "Онтологические тезисы"));
    ok(src.status === 200 && src.json.lock === null && src.json.html.includes(OLD_J), "исходник подраздела «Онтологические тезисы» отдан, не заперт");
    const r = await A.api("PATCH", subUrl(F, "theses", "Онтологические тезисы"), { html: src.json.html.replace(OLD_J, NEW_J) });
    ok(r.status === 200 && r.json.changed === true, "PATCH подраздела тезисов → 200", r.json);
    ok(r.json.thesesUpdated?.length === 1 && r.json.thesesUpdated[0].id === th[0].id && r.json.thesesUpdated[0].label === "О-1" && J(r.json.thesesUpdated[0].fields) === J(["justification"]) && r.json.warnings.length === 0, "ответ называет обновлённый тезис «О-1» и поле justification, предупреждений нет", [r.json.thesesUpdated, r.json.warnings]);
    const th1 = await thesesOf(F);
    ok(th1[0].justification === NEW_J && th1[1].justification === "Обоснование второго тезиса." && th1[0].source === "manual", "theses.justification обновлён у своего тезиса, соседний не тронут", th1.map((x) => x.justification));
    ok(J(th1.map((x) => x.id)) === J(th.map((x) => x.id)), "строки тезисов не заменены (id прежние)");
    const vs = await A.api("GET", S(F, `/elements/thesis/${th[0].id}/versions`));
    ok(vs.status === 200 && vs.json.versions.length === 1 && vs.json.versions[0].changeSource === "manual" && vs.json.versions[0].data.justification === OLD_J, "версия тезиса 'manual' со снимком ДО", vs.json?.versions?.map((v) => v.changeSource));
    const sv = await A.api("GET", S(F, `/elements/section/${(await sql`select id from sections where synthesis_id=${F} and key='theses'`)[0].id}/versions`));
    ok(sv.status === 200 && sv.json.versions.length === 1 && sv.json.versions[0].changeSource === "manual", "версия раздела 'manual' (9.2) создана, как прежде");
    // правка того же тезиса редактором не возвращает старый текст
    const pe = await A.api("PATCH", S(F, `/theses/${th[0].id}`), { formulation: "Бытие есть событие различия (редактор)" });
    const html = await secHtml(F, "theses");
    ok(pe.status === 200 && pe.json.htmlSync.patched.includes("thesis.justification"), "правка формулировки редактором 5.2 → абзац прозы перезаписан точечно", pe.json?.htmlSync);
    ok(html.includes(NEW_J) && !html.includes(OLD_J) && html.includes("<strong>Бытие есть событие различия (редактор)</strong>"), "… и НЕ вернула старое обоснование: в прозе ручной текст");
    ok(J(tableLabels(html)) === J(["О-1", "О-2", "Э-1"]), "метки сводной таблицы на месте");
    // новый абзац — предупреждение
    const src2 = await A.api("GET", subUrl(F, "theses", "Эпистемологические тезисы"));
    const r2 = await A.api("PATCH", subUrl(F, "theses", "Эпистемологические тезисы"), { html: src2.json.html + "\n<p><strong>Новый тезис, дописанный рукой</strong> Его обоснование.</p>" });
    ok(r2.status === 200 && r2.json.warnings.some((w) => /Новый тезис, дописанный рукой/.test(w)) && (await thesesOf(F)).length === 3 && r2.json.thesesUpdated === undefined, "несведённый абзац — предупреждение в ответе, строки theses не заведены и не удалены", r2.json?.warnings);

    // Д-4
    let syn = (await full(A, F));
    ok(syn.title === "Онтология паузы", "название концепции после импорта — из шапки файла", syn.title);
    const ns = await A.api("GET", subUrl(F, "name", "Итоговая рекомендация"));
    const n1 = await A.api("PATCH", subUrl(F, "name", "Итоговая рекомендация"), { html: ns.json.html.replace("Онтология паузы", "Онтология промедления") });
    syn = (await full(A, F));
    ok(n1.status === 200 && n1.json.titleUpdated === "Онтология промедления" && syn.title === "Онтология промедления", "правка раздела name → название концепции обновлено, ответ несёт titleUpdated", [n1.json?.titleUpdated, syn.title, n1.json?.warnings]);
    const ren = await A.api("PATCH", S(F), { title: "Моё название" });
    ok(ren.status === 200, "ручное переименование ✎ (PATCH /syntheses/:id)");
    const ns2 = await A.api("GET", subUrl(F, "name", "Итоговая рекомендация"));
    const n2 = await A.api("PATCH", subUrl(F, "name", "Итоговая рекомендация"), { html: ns2.json.html.replace("Онтология промедления", "Онтология задержки") });
    syn = (await full(A, F));
    ok(n2.status === 200 && n2.json.titleUpdated === undefined && syn.title === "Моё название", "после переименования ✎ название НЕ тронуто", [n2.json?.titleUpdated, syn.title]);
    ok(n2.json.warnings.some((w) => /Онтология задержки/.test(w) && /Моё название/.test(w)), "… и человеку сказано, почему", n2.json?.warnings);
    const ns3 = await A.api("GET", subUrl(F, "name", "Варианты названия"));
    const n3 = await A.api("PATCH", subUrl(F, "name", "Варианты названия"), { html: ns3.json.html.replace("черновой", "отвергнутый") });
    ok(n3.status === 200 && n3.json.titleUpdated === undefined && n3.json.warnings.length === 0, "правка name, не меняющая итоговое название, — тихо", n3.json?.warnings);
  }

  /* ════ R4: Д-5 / Д-14 / Д-31 ════ */
  console.log("\n■ R4: Д-5 — sum/context; Д-14 — откат капсулы; Д-31 — parseWarnings");
  {
    const c1 = await A.api("GET", S(L, "/sections/sum/context"));
    ok(c1.status === 200 && typeof c1.json.contextText === "string" && Array.isArray(c1.json.entries), "GET …/sections/sum/context → 200 на живом файле (было 404)", c1.json);
    console.log(`    · sum: budget=${c1.json?.budget}, записей ${c1.json?.entries?.length}, текст ${c1.json?.contextText?.length} симв.`);
    const c2 = await A.api("GET", S(L, "/sections/critique/context"));
    ok(c2.status === 200 && c2.json.entries.length > 0, "прочие разделы отдают контекст, как прежде", c2.json?.entries?.length);
    ok((await A.api("GET", S(L, "/sections/nosuch/context"))).status === 404, "неизвестный ключ — 404");

    // Д-14 (а): импортированная концепция — строки sections 'capsule' нет
    const before = (await full(A, L)).capsuleHtml;
    ok(before.length > 100 && (await sql`select 1 from sections where synthesis_id=${L} and key='capsule'`).length === 0, "у импортированной концепции капсула в шапке есть, строки sections 'capsule' нет");
    const edited = '<div class="doc-section"><div class="doc-content"><div data-section="Капсула"><p>Капсула, переписанная рукой.</p></div></div></div>';
    const pc = await A.api("PATCH", S(L, "/capsule"), { html: edited });
    ok(pc.status === 200 && (await full(A, L)).capsuleHtml === edited, "правка капсулы ✎ → шапка отдаёт новую");
    const cv = await A.api("GET", S(L, `/elements/section/${L}/versions`));
    ok(cv.status === 200 && cv.json.versions.length === 1 && cv.json.versions[0].data.htmlContent === before, "версия капсулы — на id синтеза, снимок ДО правки");
    const rb = await A.api("POST", S(L, `/elements/section/${L}/rollback`), { version: 1 });
    ok(rb.status === 200, "откат версии капсулы импортированной концепции → 200 (было 404 «Элемент не найден»)", rb.json);
    ok(rb.json?.capsuleUpdated === true && rb.json?.capsuleHtml === before, "ответ отката несёт признак capsuleUpdated и прежнюю капсулу");
    ok((await full(A, L)).capsuleHtml === before, "шапка документа (GET /syntheses/:id) показывает прежнюю капсулу");
    const expL = await A.api("GET", S(L, "/export/html"));
    ok(expL.status === 200 && !expL.text.includes("Капсула, переписанная рукой.") && expL.text.includes("header-disclosure-capsule"), "экспорт несёт прежнюю капсулу");
    // Д-14 (б): концепция со строкой sections 'capsule' (как после генерации 1.4)
    const capOld = '<div class="doc-section"><div class="doc-content"><div data-section="Капсула"><p>Капсула генерации.</p></div></div></div>';
    await sql`update syntheses set capsule_html=${capOld}, section_order=${sql.json(["sum", "theses", "name", "capsule"])} where id=${F}`;
    const [capRow] = await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${F}, 'capsule', 4, 'Капсула концепции', ${capOld}) returning id`;
    await A.api("PATCH", S(F, "/capsule"), { html: edited });
    ok((await secHtml(F, "capsule")) === edited && (await full(A, F)).capsuleHtml === edited, "правка капсулы со строкой sections: обе точки обновлены");
    const rb2 = await A.api("POST", S(F, `/elements/section/${capRow.id}/rollback`), { version: 1 });
    ok(rb2.status === 200 && rb2.json.capsuleUpdated === true && (await secHtml(F, "capsule")) === capOld && (await full(A, F)).capsuleHtml === capOld, "откат версии капсулы: строка sections И syntheses.capsule_html вернулись вместе", [rb2.status, rb2.json?.capsuleUpdated]);
    const thSec = (await sql`select id from sections where synthesis_id=${F} and key='theses'`)[0].id;
    const rb3 = await A.api("POST", S(F, `/elements/section/${thSec}/rollback`), { version: 1 });
    ok(rb3.status === 200 && rb3.json.capsuleUpdated === false && (await full(A, F)).capsuleHtml === capOld, "откат версии обычного раздела: признак false, капсула не тронута");
    ok((await C.api("POST", S(L, `/elements/section/${L}/rollback`), { version: 1 })).status === 403, "чужой откатить капсулу не может (403)");

    // Д-31
    await sql`insert into generation_log (synthesis_id, section_key, section_label, log_type, source, status, metadata) values (${F}, 'theses', 'Тезисы', 'generation', 'edit', 'done', ${sql.json({ parseWarnings: ["строка 2: направление связи подставлено"] })})`;
    const own = await A.api("GET", S(F, "/sections/theses"));
    ok(own.status === 200 && J(own.json.section.parseWarnings) === J(["строка 2: направление связи подставлено"]), "владельцу parseWarnings отдаются", own.json?.section?.parseWarnings);
    ok((await C.api("GET", S(F, "/sections/theses"))).status === 403, "приватная концепция чужому не отдаётся вовсе (403)");
    const v1 = await A.api("PATCH", S(F), { visibility: "full", showLogs: true });
    const withFlag = await C.api("GET", S(F, "/sections/theses"));
    ok(v1.status === 200 && withFlag.status === 200 && J(withFlag.json.section.parseWarnings) === J(["строка 2: направление связи подставлено"]), "чужому при флаге логов — поле есть", [v1.status, withFlag.status, withFlag.json?.section?.parseWarnings]);
    await A.api("PATCH", S(F), { showLogs: false });
    const noFlag = await C.api("GET", S(F, "/sections/theses"));
    ok(noFlag.status === 200 && !("parseWarnings" in noFlag.json.section) && noFlag.json.section.htmlContent.length > 0, "чужому без флага логов — поля НЕТ, сам раздел отдан", Object.keys(noFlag.json?.section ?? {}));
    ok((await C.api("GET", S(F, "/logs/generation"))).status === 403, "… и /logs/generation ему же закрыт: гейт один");
    ok(J((await A.api("GET", S(F, "/sections/theses"))).json.section.parseWarnings) === J(["строка 2: направление связи подставлено"]), "владельцу поле отдаётся и при снятом флаге");
    ok((await guest.api("GET", S(F, "/sections/theses"))).status === 401, "гостю маршрут раздела закрыт (401), как прежде");
    const gFull = await full(guest, F);
    ok(Array.isArray(gFull?.sections) && gFull.sections.length > 0 && gFull.sections.every((s) => !("parseWarnings" in s)), "гость получает разделы одним ответом — без parseWarnings", gFull && Object.keys(gFull));
  }

  /* ════ R5: Д-8 ════ */
  console.log("\n■ R5: Д-8 — импорт без ложной критичности");
  {
    const free = await seedDoc(A.id, { title: "Свободная концепция", seed: "Что есть пауза, если её никто не держит?", philosophers: [] });
    const fx = await A.api("GET", S(free, "/export/html"));
    ok(fx.status === 200 && fx.text.includes("Свободный синтез (на основе зерна)") && /id="footerPhil">—</.test(fx.text), "экспорт свободного синтеза: подпись в подзаголовке, «—» в футере");
    const fi = await importFile(A, fx.text, "free.html");
    ok(fi.warnings.every((w) => !w.critical), "импорт свободного синтеза — ни одного критичного предупреждения (было: «Список философов не найден»)", fi.warnings);
    const fs = (await full(A, fi.id));
    ok(fs.philosophers.length === 0 && fs.seed === "Что есть пауза, если её никто не держит?", "после круга философов нет, зерно на месте", [fs.philosophers, fs.seed]);

    // живой файл в записи одностраничника: концепция в ёлочках в футере и params.phil
    const STATE_RE = /(<script type="application\/json" id="philosynth-state">)([\s\S]*?)(<\/script>)/;
    const st = JSON.parse(STATE_RE.exec(RAW)[2]);
    st.params.phil = ["Юнг", "«Грамматика самоотрицания»"];
    const onePager = RAW.replace(STATE_RE, (_m, a, _b, c) => a + J(st) + c).replace(/(<span id="footerPhil">)[^<]*(<\/span>)/, "$1Юнг, «Грамматика самоотрицания»$2");
    ok(onePager.includes('id="footerPhil">Юнг, «Грамматика самоотрицания»<'), "вариант файла «как у одностраничника» построен");
    const o1 = await importFile(A, onePager, "onepager.html");
    const os = (await full(A, o1.id));
    ok(o1.warnings.every((w) => !w.critical) && J(os.philosophers) === J(["Юнг"]), "импорт: критичных нет, философ — только Юнг (концепция в ёлочках философом не числится)", [os.philosophers, o1.warnings.filter((w) => w.critical)]);
    // тот же файл без встроенной генеалогии — философов даёт шапка
    const st2 = { ...st }; delete st2.genealogy; delete st2.participants;
    const noGen = onePager.replace(STATE_RE, (_m, a, _b, c) => a + J(st2) + c);
    const o2 = await importFile(A, noGen, "onepager-nogen.html");
    const os2 = (await full(A, o2.id));
    const lin = await sql`select parent_type, parent_name from synthesis_lineage where synthesis_id=${o2.id} order by position`;
    ok(J(os2.philosophers) === J(["Юнг"]) && J(lin.map((l) => [l.parent_type, l.parent_name])) === J([["philosopher", "Юнг"]]), "без встроенной генеалогии: «Грамматика самоотрицания» НЕ стала строкой-философом", lin);
    ok(o2.lineageCandidates.some((c) => c.parentName === "Грамматика самоотрицания") && o2.warnings.every((w) => !w.critical), "… а ушла предложением родителя (8.5), критичных нет", o2.lineageCandidates);
    // мета-синтез из одних концепций: подзаголовок «На основе: A, B», футер «—», зерна нет
    const st3 = { ...st, params: { ...st.params, phil: ["«Грамматика самоотрицания»"], seed: "", participants: [{ type: "concept", name: "Грамматика самоотрицания" }] }, participants: [{ type: "concept", name: "Грамматика самоотрицания" }], genealogy: { ...st.genealogy, participants: st.genealogy.participants.filter((p) => p.type !== "philosopher") } };
    const metaOnly = RAW.replace(STATE_RE, (_m, a, _b, c) => a + J(st3) + c).replace(/(<span id="footerPhil">)[^<]*(<\/span>)/, "$1—$2").replace(/<details class="header-disclosure"><summary>Зерно концепции<\/summary>[\s\S]*?<\/details>/, "");
    const o3 = await importFile(A, metaOnly, "meta-only.html");
    ok(o3.warnings.every((w) => !w.critical) && (await full(A, o3.id)).philosophers.length === 0, "мета-синтез из одних концепций без философов и зерна — не критичен", o3.warnings.filter((w) => w.critical));
  }
  console.log(`\nмок Claude: обращений ${mock.calls} — ${mock.picked.join(", ")}`);
} catch (e) { failed++; console.log("СБОЙ:", e?.stack ?? e); }
finally {
  for (const id of ids) await sql`delete from syntheses where id=${id}`.catch(() => {});
  await sql`delete from api_usage where user_id in (select id from users where email like 't121-%@example.com')`.catch(() => {});
  await sql`delete from transactions where user_id in (select id from users where email like 't121-%@example.com')`.catch(() => {});
  await sql`delete from users where email like 't121-%@example.com'`.catch((e) => console.log("уборка users:", e?.code ?? e));
  try { if (srv) process.kill(-srv.pid, "SIGKILL"); } catch {}
  mockSrv.closeAllConnections?.(); mockSrv.close();
  await Promise.race([sql.end({ timeout: 2 }), sleep(3000)]);
}
console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗`);
process.exit(failed ? 1 : 0);
