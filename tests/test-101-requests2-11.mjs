/**
 * Беседа 10.1 — тестовые запросы R2–R11 (контракт рекомендаций и разбор).
 * Живой файл одностраничника задаётся T101_FILE (как T92_FILE в 9.2); без него — пропуск:
 * живых концепций в репозитории нет. Нужны PG и Redis; сервер :3000 поднимается сам.
 *   T101_FILE=/path/PS-….html node_modules/.bin/tsx tests/test-101-requests2-11.mjs
 * (tsx, не node: R2 читает сгенерированные конфиги server/config/*.ts как прежние значения)
 *
 *  R2  сиды на базе С ПРЕЖНИМИ версиями (путь обновления, не свежая база): новый шаблон
 *      заведён, прозаический шаблон и три конфига ОБНОВЛЕНЫ (v2 активна, v1 цела),
 *      повторный прогон — одни skip; активация версии сбрасывает кэш реестра (видно по
 *      промпту, который получает мок модели).
 *  R3  генерация критики службой на моке Claude: задание несёт контракт и закрытый список
 *      адресов ЭТОГО документа; в разделе — «Таблица рекомендаций» с table.doc-table,
 *      проза на месте и идёт ПЕРЕД ней; разбор даёт строки.
 *  R4  разбор: семь столбцов → строки в БД со всеми полями; «Готовая замена» отличима.
 *  R5  перестановка столбцов: разбор тот же.
 *  R6  сторож: несуществующий подраздел / «улучшить» → invalid с причиной; остальные годны.
 *  R7  нормализация: элемент с двойным пробелом и в ёлочках найден среди категорий.
 *  R8  развилка «5а»/«5б»: две строки new; один номер на два адреса — уникальность цела.
 *  R9  раунд: повторный parse раунд не увеличивает; перегенерация критики → round+1,
 *      прежние строки остались с прежним раундом.
 *  R10 ретрофит на ЖИВОЙ концепции: таблицы нет → extract → подраздел появился, все
 *      рекомендации прозы разобраны, одна с готовой заменой, одна развилкой; круг
 *      экспорт → импорт подраздел сохраняет.
 *  R11 края: чужой → 403; нет критики → 404 с внятным текстом; занятый слот → 409; ответ
 *      модели без таблицы / без столбца → 422 и документ цел; обрыв модели → 502.
 *
 * Мок Claude узнаёт вызов по тексту задания: ретрофит — по фразе шаблона
 * recommendations.extract; раздел — по именам подразделов в хвосте от «ЗАДАНИЕ» (приём
 * test-92). Критику мок отдаёт как модель, СЛЕДУЮЩАЯ контракту: критика живого файла +
 * подраздел-таблица после прозы.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { parseHTML } from "linkedom";
import postgres from "postgres";

const FILE = process.env.T101_FILE;
if (!FILE || !existsSync(FILE)) { console.log("T101_FILE не задан или файла нет — пропуск"); process.exit(0); }
const ROOT = new URL("../", import.meta.url).pathname;
const BASE = "http://127.0.0.1:3000/api/v1";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth");
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
function ok(cond, name, extra) { if (cond) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 600) : ""}`); } }

const PROSE = "Рекомендации по улучшению", TABLE = "Таблица рекомендаций";
const T_KEY = "section.critique.sub.recommendations_table", P_KEY = "section.critique.sub.recommendations", X_KEY = "recommendations.extract";
const HEAD = ["№", "Адрес", "Элемент", "Операция", "Готовая замена", "Основание", "Важность"];
const REPLACEMENT = "конститутивное нарушение грамматики, произведённое в ответ на присутствие нередуцируемого содержания";
/** Семь рекомендаций живой концепции, как их переложила бы в таблицу модель (пятая — развилкой). */
const LIVE_ROWS = [
  ["1", "Таблица определений", "Самость-как-вмещение", "переопределить", "", "Верность методу синтеза", "существенная"],
  ["2", "Таблица категорий", "Индивидуация-как-практика", "уточнить формулировку", REPLACEMENT, "Верность методу синтеза", "существенная"],
  ["3", "Сводная таблица тезисов", "", "добавить", "", "Верность уровню синтеза", "существенная"],
  ["4", "Эпистемологические тезисы", "Э-3", "развить", "", "Слепые пятна", "существенная"],
  ["5а", "Таблица категорий", "Энантиодромия разлома", "удалить", "", "Верность методу синтеза", "блокирующая"],
  ["5б", "Таблица категорий", "Энантиодромия разлома", "переопределить", "", "Верность методу синтеза", "блокирующая"],
  ["6", "Таблица определений", "Архетипический разлом", "развить", "", "Сохранение ценных аспектов", "косметическая"],
  ["7", "Новизна и ценность", "", "уточнить формулировку", "", "Сохранение ценных аспектов", "косметическая"],
];
const tableHtml = (rows, headers = HEAD) => {
  const at = headers.map((h) => HEAD.indexOf(h));
  return `<table class="doc-table">\n<thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>\n<tbody>\n${rows.map((r) => `<tr>${at.map((i) => `<td>${r[i]}</td>`).join("")}</tr>`).join("\n")}\n</tbody></table>`;
};
const wrapped = (inner) => `<div data-section="${TABLE}"><h4>${TABLE}</h4>\n${inner}\n</div>`;

/* ── «Ответы модели» из живого файла ─────────────────────────────────── */
const MOCK_PORT = 3911;
const { document: liveDoc } = parseHTML(readFileSync(FILE, "utf8"));
const modelSections = [...liveDoc.querySelectorAll(".doc-section")].map((el) => {
  const names = [...el.querySelectorAll("[data-section]")].map((x) => x.getAttribute("data-section"));
  for (const junk of el.querySelectorAll('a[id^="subsec-"], a[id^="sec-"], .toc-back-btn, details.sec-disclosure')) junk.remove();
  return { names, html: el.outerHTML.replace(/<\/(p|div|table|ul|ol|h4|h5)>/g, "</$1>\n") };
}).filter((x) => x.names.length > 0);
const liveCritique = modelSections.find((s) => s.names.includes(PROSE));
const liveRecCount = (liveCritique.html.match(/<strong>Рекомендация \d+/g) ?? []).length;
/** Критика, как её вернула бы модель по новому контракту: таблица сразу после прозы. */
function critiqueAnswer(variant) {
  let html = liveCritique.html;
  if (variant === 2) html = html.replace("<strong>Рекомендация 1:", "<strong>Рекомендация 1 (вторая редакция):");
  const { document: d } = parseHTML(`<div id="r">${html}</div>`);
  const prose = [...d.querySelectorAll("[data-section]")].find((x) => x.getAttribute("data-section") === PROSE);
  const rows = variant === 2 ? LIVE_ROWS.filter((r) => r[0] !== "7") : LIVE_ROWS;
  prose.insertAdjacentHTML("afterend", "\n\n" + wrapped(tableHtml(rows)) + "\n");
  return d.getElementById("r").innerHTML;
}
const mock = { calls: 0, picked: [], prompts: [], extractAnswer: null, extractMode: "ok", critiqueVariant: 1, lastExtractPrompt: "", lastCritiquePrompt: "", lastSys: "" };
const mockSrv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", async () => {
    mock.calls++;
    let prompt = "", sys = "";
    try { const j = JSON.parse(body); const c = j.messages?.[0]?.content; prompt = typeof c === "string" ? c : J(c); sys = typeof j.system === "string" ? j.system : J(j.system); } catch {}
    let html;
    if (prompt.includes("ПЕРЕЛОЖИТЬ в таблицу")) {
      mock.lastExtractPrompt = prompt; mock.lastSys = sys; mock.picked.push("(ретрофит)");
      if (mock.extractMode === "http500") { res.writeHead(500, { "content-type": "application/json" }); res.end(J({ type: "error", error: { type: "api_error", message: "mock 500" } })); return; }
      if (mock.extractMode === "slow") await sleep(2500);
      html = mock.extractAnswer ?? wrapped(tableHtml(LIVE_ROWS));
    } else {
      const task = prompt.slice(Math.max(0, prompt.lastIndexOf("ЗАДАНИЕ")));
      let best = null, bestHits = 0;
      // Задание критики несёт закрытый список адресов — имена подразделов ВСЕХ разделов
      // документа, и подсчёт совпадений узнал бы в нём диалог (3 из 3). Критику выдаёт
      // её собственный подраздел, которого нет ни в одном другом задании.
      if (task.includes(`Столбцы СТРОГО: ${HEAD.join(" | ")}`)) { best = liveCritique; bestHits = 2; }
      for (const sct of modelSections) { const hits = sct.names.filter((n) => task.includes(n)).length / sct.names.length; if (hits > bestHits) { best = sct; bestHits = hits; } }
      mock.picked.push(best ? best.names[0] : "(не узнан)");
      if (best === liveCritique) { mock.lastCritiquePrompt = prompt; html = critiqueAnswer(mock.critiqueVariant); }
      else html = best ? best.html : '<div class="doc-section"><div class="doc-content"><p>Раздел не узнан моком.</p></div></div>';
    }
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

let srv = null;
function startServer() {
  srv = spawn(process.execPath, ["--import", "tsx", "index.ts"], { cwd: ROOT + "server", detached: true, stdio: "ignore", env: { ...process.env, PORT: "3000", RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-101", STREAM_RETRY_DELAYS: "50" } });
}
async function waitHealth() { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/health`)).ok) return true; } catch {} await sleep(500); } return false; }
let cookie = "";
async function api(method, path, body, opts = {}) {
  const headers = { Cookie: opts.cookie ?? cookie };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
  const r = await fetch(BASE + path, { method, headers, body: payload });
  return opts.raw ? { status: r.status, text: await r.text() } : { status: r.status, json: await r.json().catch(() => null) };
}
async function account(tag) {
  const email = `t101-${tag}-${Date.now()}@example.com`;
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-101" }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-101" }) });
  return { email, cookie: lr.headers.get("set-cookie").split(";")[0] };
}
async function importFile(text) { const fd = new FormData(); fd.append("file", new Blob([text], { type: "text/html" }), "live.html"); return api("POST", "/syntheses/import", fd); }
const rec = (id, tail = "") => `/syntheses/${id}/recommendations${tail}`;
const extractWith = async (id, rows, headers) => { mock.extractMode = "ok"; mock.extractAnswer = wrapped(tableHtml(rows, headers)); const r = await api("POST", rec(id, "/extract")); mock.extractAnswer = null; return r; };
const critiqueOf = async (id) => (await api("GET", `/syntheses/${id}/sections/critique`)).json.section;
const fields = (r) => [r.num, r.addressSubsection, r.addressSection, r.element, r.elementKind, r.op, r.replacement, r.rationale, r.severity, r.status];
const seed = (name) => { const r = spawnSync("npm", ["run", name], { cwd: ROOT, encoding: "utf8" }); const m = /Итог: created=(\d+), updated=(\d+), skip=(\d+), fail=(\d+)/.exec(r.stdout ?? ""); return m ? { created: +m[1], updated: +m[2], skip: +m[3], fail: +m[4] } : { error: (r.stdout ?? "").slice(-400) + (r.stderr ?? "").slice(-400) }; };

const ids = [];
const markerVersions = [];
try {
  /* ══ R2. Сиды: путь обновления ══════════════════════════════════════ */
  console.log("\n■ R2. Сиды на базе с прежними версиями (сервер остановлен)");
  {
    // Состояние «до 10.1»: новых ключей нет, у прозы и трёх конфигов — единственная v1 с
    // прежним (сгенерированным из исходника) содержимым.
    const gen = await import("../server/config/section-templates.ts");
    const { SUBSECTION_MAP_BASE, SUBSECTION_MAP_GLOSSARY, SUBSECTION_MAP_CRITIQUE_NOVELTY, SUBSECTION_MAP_CRITIQUE_CHECK, SUBSECTION_SUM_PORTRAIT } = await import("../server/config/subsection-map.ts");
    const { INTRA_DEPS } = await import("../server/config/intra-deps.ts");
    const { SUBSECTION_TO_CTX_KEYS } = await import("../server/config/subsection-ctx-keys.ts");
    const oldProse = gen.SEED_SECTION_TEMPLATES.find((t) => t.key === P_KEY);
    const [smNow] = await sql`select value from synthesis_configs where key='subsection_map' and is_active`;
    const oldMap = { ...smNow.value, base: SUBSECTION_MAP_BASE };
    void SUBSECTION_MAP_GLOSSARY; void SUBSECTION_MAP_CRITIQUE_NOVELTY; void SUBSECTION_MAP_CRITIQUE_CHECK; void SUBSECTION_SUM_PORTRAIT;
    await sql`delete from prompt_templates where key in (${T_KEY}, ${X_KEY}, ${P_KEY})`;
    await sql`insert into prompt_templates (key, version, body, is_active, description) values (${P_KEY}, 1, ${oldProse.body}, true, ${oldProse.description})`;
    for (const [key, value] of [["subsection_map", oldMap], ["intra_deps", INTRA_DEPS], ["subsection_ctx_keys", SUBSECTION_TO_CTX_KEYS]]) {
      await sql`delete from synthesis_configs where key=${key}`;
      await sql`insert into synthesis_configs (key, version, value, is_active, description) values (${key}, 1, ${sql.json(value)}, true, 'до 10.1')`;
    }
    const [pre] = await sql`select (value->'base'->'critique') c from synthesis_configs where key='subsection_map' and is_active`;
    ok(!pre.c.includes(TABLE), "исходное состояние: в subsection_map таблицы рекомендаций нет");

    const sp = seed("seed:prompts");
    ok(sp.created === 2 && sp.updated === 1 && sp.fail === 0, "seed:prompts: два новых шаблона заведены, прозаический обновлён", sp);
    const sc = seed("seed:configs");
    ok(sc.created === 0 && sc.updated === 3 && sc.fail === 0, "seed:configs: три конфига обновлены, остальные не тронуты", sc);
    const pv = await sql`select version, is_active, body from prompt_templates where key=${P_KEY} order by version`;
    ok(pv.length === 2 && !pv[0].is_active && pv[1].is_active && pv[0].body === oldProse.body && pv[1].body.startsWith(oldProse.body) && /называет подраздел документа/.test(pv[1].body), "проза: v2 активна и = v1 + требование; v1 цела и снята с активности");
    const cv = await sql`select key, version, is_active from synthesis_configs where key in ('subsection_map','intra_deps','subsection_ctx_keys') order by key, version`;
    ok(cv.length === 6 && cv.every((r) => r.is_active === (r.version === 2)), "конфиги: у каждого v1 цела, активна v2", cv.map((r) => `${r.key}#${r.version}${r.is_active ? "*" : ""}`));
    const [sm] = await sql`select value from synthesis_configs where key='subsection_map' and is_active`;
    const [idp] = await sql`select value from synthesis_configs where key='intra_deps' and is_active`;
    const [ck] = await sql`select value from synthesis_configs where key='subsection_ctx_keys' and is_active`;
    const c = sm.value.base.critique;
    ok(c[c.indexOf(PROSE) + 1] === TABLE && J(idp.value.critique[TABLE]) === J([PROSE]) && J(ck.value.critique[TABLE]) === "[]", "три правки на месте: подраздел после прозы; таблица ← проза; ctx-ключей нет");
    ok(J(sm.value.critiqueNovelty) === J(oldMap.critiqueNovelty) && J(sm.value.glossary) === J(oldMap.glossary) && Object.keys(sm.value.base).every((k) => k === "critique" || J(sm.value.base[k]) === J(oldMap.base[k])), "прочее в subsection_map прежнее");
    const [tpl] = await sql`select count(*)::int n, bool_and(is_active) a from prompt_templates where key in (${T_KEY}, ${X_KEY})`;
    ok(tpl.n === 2 && tpl.a, "новые шаблоны — по одной активной версии");
    const sp2 = seed("seed:prompts"), sc2 = seed("seed:configs");
    ok(sp2.created === 0 && sp2.updated === 0 && sp2.fail === 0 && sp2.skip > 250, "повторный seed:prompts — одни skip", sp2);
    ok(sc2.created === 0 && sc2.updated === 0 && sc2.fail === 0 && sc2.skip >= 27, "повторный seed:configs — одни skip", sc2);
    const [cnt] = await sql`select count(*)::int n from prompt_templates where key=${P_KEY}`;
    ok(cnt.n === 2, "повтор версий не наплодил");
  }

  startServer();
  ok(await waitHealth(), "сервер поднят (warmCache кладёт в Redis активные версии после посева)");
  const A = await account("owner"), B = await account("other"), ADM = await account("admin");
  cookie = A.cookie;
  await sql`update users set role='admin' where email=${ADM.email}`;

  /* ══ R10. Ретрофит на живой концепции ═══════════════════════════════ */
  console.log("\n■ R10. Ретрофит на ЖИВОЙ концепции");
  const im = await importFile(readFileSync(FILE, "utf8"));
  ok(im.status === 200 && !!im.json?.id, "живой файл заведён импортом 4.3", im.json);
  const LIVE = im.json.id; ids.push(LIVE);
  const c0 = await critiqueOf(LIVE);
  ok(c0.subsections.includes(PROSE) && !c0.subsections.includes(TABLE), "в импортированной критике проза есть, таблицы рекомендаций НЕТ");
  let r = await api("GET", rec(LIVE));
  ok(r.status === 200 && r.json.round === 0 && r.json.latestRound === 0 && r.json.rows.length === 0, "GET до первого разбора: раунд 0, строк нет", r.json);
  r = await api("POST", rec(LIVE, "/parse"));
  ok(r.status === 404 && r.json.code === "NOT_FOUND" && r.json.details?.reason === "no_table" && /recommendations\/extract/.test(r.json.error), "parse без таблицы → 404 no_table с подсказкой про extract", r.json);
  const tot0 = Number((await sql`select total_cost_usd t from syntheses where id=${LIVE}`)[0].t);
  r = await extractWith(LIVE, LIVE_ROWS);
  ok(r.status === 200 && r.json.outcome === "inserted" && r.json.newRound === true && r.json.round === 1, "extract → 200: подраздел добавлен, открыт раунд 1", r.json?.error ?? r.json?.outcome);
  ok(J(r.json.warnings) === "[]", "чистка разметки ответа модели ничего не сняла", r.json.warnings);
  const liveRows = r.json.rows ?? [];
  const nums = [...new Set(liveRows.map((x) => x.num.replace(/[а-яa-z]$/i, "")))];
  ok(nums.length === liveRecCount && liveRecCount === 7, `разобраны все рекомендации прозы (в прозе ${liveRecCount}, номеров в таблице ${nums.length})`, nums);
  ok(liveRows.length === 8 && r.json.invalidCount === 0 && liveRows.every((x) => x.status === "new"), "восемь строк (пятая рекомендация — двумя), негодных нет", liveRows.filter((x) => x.status !== "new").map((x) => x.invalidReason));
  ok(liveRows.filter((x) => x.replacement).length === 1 && liveRows[1].replacement === REPLACEMENT && liveRows[1].elementKind === "category", "одна с готовой заменой — дословно, элемент найден среди категорий");
  ok(liveRows.filter((x) => /^5[аб]$/.test(x.num)).length === 2 && liveRows[4].op === "удалить" && liveRows[5].op === "переопределить" && liveRows[4].elementId === liveRows[5].elementId, "одна развилкой: «5а» удалить / «5б» переопределить, элемент один");
  ok(liveRows[3].elementKind === "thesis" && !!liveRows[3].elementId, "тезис найден по метке документа «Э-3» (в БД thesis_num — целое)");
  ok(liveRows[6].elementKind === "glossary_term", "термин, записанный в глоссарии с пояснением в скобках, найден без него");
  const c1 = await critiqueOf(LIVE);
  ok(c1.subsections[c1.subsections.indexOf(PROSE) + 1] === TABLE && c1.subsections.length === c0.subsections.length + 1 && J(c1.subsections.filter((x) => x !== TABLE)) === J(c0.subsections), "в документе: подраздел сразу после прозы, прежние подразделы и их порядок целы");
  ok(c1.htmlContent.includes('<a id="subsec-critique-Таблица_рекомендаций"></a>') && /<h4>Таблица рекомендаций<a [^>]*toc-back-btn/.test(c1.htmlContent), "обёртка по образцу соседей: якорь оглавления и ⏫");
  ok(c1.isEdited === true && !c1.lockedSubsections.includes(TABLE), "раздел помечен правленым; замок 9.2 подраздел не запирает");
  const p = mock.lastExtractPrompt;
  ok(p.includes("Рекомендация 7") && p.includes("Столбцы СТРОГО: " + HEAD.join(" | ")) && !/\{\{/.test(p), "модели ушли проза и контракт, дыр в промпте нет");
  ok(/\n {2}Граф категорий: [^\n]*Таблица категорий/.test(p) && !/\n {2}Критический анализ: /.test(p) && p.includes("— Верность методу синтеза") && p.includes("— Э-3 — ") && p.includes("— Энантиодромия разлома"), "…и закрытые списки ЭТОГО документа: адреса без критики, подразделы критики, тезисы с метками, категории");
  ok(/ТОЛЬКО HTML одного именованного подраздела/.test(mock.lastSys), "системный промпт — в режиме одного подраздела");
  const tot1 = Number((await sql`select total_cost_usd t from syntheses where id=${LIVE}`)[0].t);
  const [gl] = await sql`select source, status, section_key from generation_log where synthesis_id=${LIVE} order by created_at desc limit 1`;
  const [ver] = await sql`select count(*)::int n from element_versions where synthesis_id=${LIVE} and element_type='section' and change_source='regenerated'`;
  ok(tot1 > tot0 && gl?.status === "done" && gl.section_key === "critique" && ver.n === 1, "учёт: стоимость в итоге документа, строка generation_log done, версия раздела со снимком ДО", [tot0, tot1, gl, ver]);
  const ex = await api("GET", `/syntheses/${LIVE}/export/html`, undefined, { raw: true });
  const re = await importFile(ex.text);
  ok(ex.status === 200 && re.status === 200, "экспорт 4.2 документа с таблицей собирается, импорт 4.3 его принимает");
  if (re.json?.id) {
    ids.push(re.json.id);
    const pr = await api("POST", rec(re.json.id, "/parse"));
    ok(pr.status === 200 && pr.json.rows.length === 8 && pr.json.invalidCount === 0 && pr.json.round === 1, "круг экспорт → импорт: таблица разбирается без ретрофита, те же восемь годных строк", pr.json?.error ?? [pr.json?.rows?.length, pr.json?.invalidCount]);
  }

  /* ══ R4. Разбор: строки в БД ════════════════════════════════════════ */
  console.log("\n■ R4. Разбор: семь столбцов → строки в БД");
  const db1 = await sql`select * from recommendations where synthesis_id=${LIVE} order by position`;
  ok(db1.length === 8 && db1.every((x, i) => x.position === i + 1 && x.round === 1), "восемь строк раунда 1, position — место в таблице");
  ok(J(db1.map((x) => [x.num, x.address_subsection, x.element ?? "", x.op, x.replacement ?? "", x.rationale, x.severity])) === J(LIVE_ROWS), "все семь полей каждой строки дошли до БД дословно");
  ok(J(db1.map((x) => x.address_section)) === J(["glossary", "graph", "theses", "theses", "graph", "graph", "glossary", "sum"]), "раздел адреса определён у каждой строки", db1.map((x) => x.address_section));
  ok(db1.filter((x) => x.replacement !== null).length === 1 && db1.filter((x) => x.replacement === null).length === 7, "«Готовая замена»: строка с ней отличима — у остальных NULL, не пустая строка");
  ok(db1.filter((x) => x.element === null).length === 2 && db1.filter((x) => x.element === null).every((x) => x.element_kind === null && x.element_id === null), "пустой «Элемент» (рекомендация о подразделе) → NULL");
  ok(db1.every((x) => /^[0-9a-f]{64}$/.test(x.source_hash ?? "") && /^[0-9a-f]{64}$/.test(x.round_hash)) && new Set(db1.map((x) => x.round_hash)).size === 1, "хэш источника — у каждой строки; ключ раунда один на раунд");
  ok(db1[4].source_hash === db1[5].source_hash && db1[2].source_hash !== db1[7].source_hash, "хэш строки с элементом — по элементу (5а ≡ 5б); без элемента — по подразделу");
  ok(db1.every((x) => x.plan_id === null && x.step_index === null && x.invalid_reason === null), "plan_id / step_index пусты — их заполнит 10.2");

  /* ══ R5. Перестановка столбцов ══════════════════════════════════════ */
  console.log("\n■ R5. Перестановка столбцов");
  const shuffled = ["Важность", "Готовая замена", "Операция", "№", "Основание", "Элемент", "Адрес"];
  r = await extractWith(LIVE, LIVE_ROWS, shuffled);
  ok(r.status === 200 && r.json.outcome === "replaced" && r.json.newRound === false && r.json.round === 1, "та же таблица, столбцы в другом порядке: подраздел заменён, раунд прежний", r.json?.error);
  ok(J((r.json.rows ?? []).map(fields)) === J(liveRows.map(fields)), "разобрано так же, поле в поле (разбор по заголовкам, не по позиции)");
  ok(J((r.json.rows ?? []).map((x) => x.id)) === J(liveRows.map((x) => x.id)), "id строк при перечитке сохранены");
  const cS = await critiqueOf(LIVE);
  ok(cS.subsections.filter((x) => x === TABLE).length === 1 && /<th>Важность<\/th><th>Готовая замена<\/th>/.test(cS.htmlContent), "в документе один подраздел, столбцы действительно переставлены");

  /* ══ R6. Сторож ═════════════════════════════════════════════════════ */
  console.log("\n■ R6. Сторож адресов");
  const guardRowsIn = [
    ["1", "Определения", "", "развить", "", "Слепые пятна", "существенная"],
    ["2", "Таблица категорий", "Индивидуация-как-практика", "улучшить", "", "Верность методу синтеза", "существенная"],
    ["3", "Таблица категорий", "Несуществующая категория", "удалить", "", "Слепые пятна", "важная"],
    ["4", "Итоговая оценка", "", "развить", "", "Слепые пятна", "косметическая"],
    ["5", "Таблица связей", "", "перегенерировать", "", "Внутренняя когерентность", "блокирующая"],
    ["6", "§ «Граф → Таблица категорий»", "Семантическое эго", "развить", "", "Слепые пятна", "существенная"],
  ];
  r = await extractWith(LIVE, guardRowsIn);
  const g = r.json.rows ?? [];
  ok(r.status === 200 && g.length === 6 && r.json.invalidCount === 4, "негодные строки разбор не роняют: шесть строк, четыре негодных", [r.status, g.length, r.json?.invalidCount]);
  ok(g[0].status === "invalid" && g[0].invalidReason.includes("«Определения»") && g[0].invalidReason.includes("«Таблица определений»") && g[0].addressSection === null, "несуществующий подраздел → invalid, причина называет адрес и похожий подраздел", g[0].invalidReason);
  ok(g[1].status === "invalid" && g[1].invalidReason.includes("«улучшить»") && g[1].invalidReason.includes("переопределить | уточнить формулировку | удалить | добавить | развить | перегенерировать") && !!g[1].elementId, "операция «улучшить» → invalid с закрытым списком; адрес и элемент при этом найдены", g[1].invalidReason);
  ok(g[2].status === "invalid" && g[2].invalidReason.includes("«Несуществующая категория»") && g[2].invalidReason.includes("«важная»"), "две причины одной строки названы обе", g[2].invalidReason);
  ok(g[3].status === "invalid" && /самой критики/.test(g[3].invalidReason), "подраздел самой критики адресом быть не может", g[3].invalidReason);
  ok(g[4].status === "new" && g[4].op === "перегенерировать" && g[4].addressSection === "graph" && g[5].status === "new" && g[5].addressSubsection === "Таблица категорий", "остальные строки разобраны нормально (в т.ч. адрес с «§», ёлочками и «Раздел →»)", [g[4].status, g[5].status, g[5].invalidReason]);
  const dbi = await sql`select status, invalid_reason from recommendations where synthesis_id=${LIVE} and round=1 order by position`;
  ok(dbi.filter((x) => x.status === "invalid").length === 4 && dbi.every((x) => (x.status === "invalid") === (x.invalid_reason !== null)), "в БД: invalid_reason заполнен ровно у негодных");
  // Таблицу правит и человек (п.5г): починка негодной строки правкой 9.2 → parse
  const sp9 = `/syntheses/${LIVE}/sections/critique/subsections/${encodeURIComponent(TABLE)}`;
  const src = (await api("GET", sp9)).json;
  const fix = await api("PATCH", sp9, { html: src.html.replace("<td>Определения</td>", "<td>Таблица определений</td>").replace("<td>улучшить</td>", "<td>уточнить формулировку</td>") });
  r = await api("POST", rec(LIVE, "/parse"));
  ok(src.lock === null && fix.status === 200 && fix.json.changed && r.status === 200 && r.json.newRound === false && r.json.rows[0].status === "new" && r.json.rows[1].status === "new" && r.json.invalidCount === 2, "ручная починка двух строк правкой 9.2 → parse: строки годны, раунд НЕ сменился", [fix.status, r.json?.newRound, r.json?.invalidCount]);

  /* ══ R7. Нормализация ═══════════════════════════════════════════════ */
  console.log("\n■ R7. Нормализация элемента");
  r = await extractWith(LIVE, [
    ["1", "Таблица категорий", "«Энантиодромия&nbsp; разлома»", "удалить", "", "Верность методу синтеза", "блокирующая"],
    ["2", "Таблица категорий", "  индивидуация-как-практика ", "Уточнить  формулировку", "", "Верность методу синтеза", "СУЩЕСТВЕННАЯ"],
    ["3", "таблица определений", "Архетипический разлом", "развить", "", "Слепые пятна", "косметическая"],
    ["4", "Эпистемологические тезисы", "тезис Э-3", "развить", "", "Слепые пятна", "существенная"],
  ]);
  const nr = r.json.rows ?? [];
  const [cat] = await sql`select id from categories where synthesis_id=${LIVE} and name='Энантиодромия разлома'`;
  ok(nr[0]?.status === "new" && nr[0].elementKind === "category" && nr[0].elementId === cat.id, "элемент с двойным пробелом и в ёлочках найден среди категорий", nr[0]);
  ok(nr[1]?.status === "new" && nr[1].elementKind === "category" && nr[1].op === "уточнить формулировку" && nr[1].severity === "существенная", "регистр и пробелы: элемент найден, операция и важность приведены к значениям закрытого списка", nr[1]);
  ok(nr[2]?.status === "new" && nr[2].addressSubsection === "Таблица определений" && nr[2].elementKind === "glossary_term", "адрес в другом регистре приведён к имени подраздела документа; одноимённые категория и термин — по разделу адреса", nr[2]);
  ok(nr[3]?.status === "new" && nr[3].elementKind === "thesis", "«тезис Э-3» ≡ «Э-3»", nr[3]);

  /* ══ R8. Развилка и уникальность ════════════════════════════════════ */
  console.log("\n■ R8. Развилка");
  r = await extractWith(LIVE, [
    LIVE_ROWS[4], LIVE_ROWS[5],
    ["6", "Новизна и ценность", "", "развить", "", "Сохранение ценных аспектов", "косметическая"],
    ["6", "Аналитический комментарий", "", "развить", "", "Сохранение ценных аспектов", "косметическая"],
    ["6", "Аналитический комментарий", "", "развить", "", "Сохранение ценных аспектов", "косметическая"],
  ]);
  const fr = r.json.rows ?? [];
  ok(r.status === 200 && fr[0].num === "5а" && fr[1].num === "5б" && fr[0].status === "new" && fr[1].status === "new" && fr[0].id !== fr[1].id, "«5а» и «5б» разобраны как две строки, обе new; уникальность не нарушена", r.json?.error);
  ok(fr[2].status === "new" && fr[3].status === "new" && fr[2].num === "6" && fr[3].num === "6" && fr[2].addressSection === "sum" && fr[3].addressSection === "dialogue", "один номер на два адреса (как велит шаблон) — две годные строки: номер в раунде не уникален");
  ok(fr[4].status === "invalid" && /повторяет/.test(fr[4].invalidReason), "полный повтор строки → invalid, а не 500 на уникальном индексе");
  const dup = await sql`select count(*)::int n, count(distinct position)::int p from recommendations where synthesis_id=${LIVE} and round=1`;
  ok(dup[0].n === 5 && dup[0].p === 5, "в БД пять строк раунда, position у каждой своя");
  let uq = null;
  try { await sql`insert into recommendations (synthesis_id, round, position, num, round_hash) values (${LIVE}, 1, 1, '9', 'x')`; } catch (e) { uq = e.code; }
  ok(uq === "23505", "уникальный индекс (synthesis_id, round, position) на месте", uq);

  /* ══ R3. Генерация критики службой ══════════════════════════════════ */
  console.log("\n■ R3. Генерация на моке Claude");
  const created = await api("POST", "/syntheses", { seed: "Контракт рекомендаций (10.1)", philosophers: ["Юнг", "Кант"], sections: ["graph", "glossary", "theses", "dialogue", "critique"], method: "dialectical", depth: "overview", synthLevel: "generative" });
  ok(created.status === 201 && !!created.json?.id, "POST /syntheses → 201", created.json);
  const GEN = created.json.id; ids.push(GEN);
  let st = "";
  for (let i = 0; i < 240; i++) { st = (await sql`select status from syntheses where id=${GEN}`)[0]?.status; if (st === "ready" || st === "error" || st === "paused") break; await sleep(500); }
  ok(st === "ready", `генерация службой завершена (status=${st})`, mock.picked);
  const cp = mock.lastCritiquePrompt;
  ok(cp.includes(TABLE) && cp.indexOf(PROSE) < cp.indexOf("Столбцы СТРОГО: " + HEAD.join(" | ")) && !/\{\{/.test(cp), "задание критики несёт новый подраздел ПОСЛЕ прозы и контракт таблицы");
  ok(/называет подраздел документа, к которому относится/.test(cp), "прозаическое задание — с дописанным требованием");
  const addrBlock = cp.slice(cp.indexOf("СТРОГО из списка подразделов этого документа"), cp.indexOf("Например:"));
  ok(/Граф категорий: /.test(addrBlock) && /Глоссарий терминов: /.test(addrBlock) && /Корпус тезисов: /.test(addrBlock) && /Диалог между традициями: /.test(addrBlock) && /Исполнительное резюме: /.test(addrBlock) && !/История|Практическое|Критический|Капсула/.test(addrBlock), "закрытый список адресов — ровно разделы ЭТОГО документа, без критики и капсулы", addrBlock);
  const cg = await critiqueOf(GEN);
  const iP = cg.subsections.indexOf(PROSE), iT = cg.subsections.indexOf(TABLE);
  ok(iP >= 0 && iT === iP + 1, "в разделе «Рекомендации по улучшению» на месте и идут ПЕРЕД «Таблицей рекомендаций»", cg.subsections);
  const { document: cgDoc } = parseHTML(`<div id="r">${cg.htmlContent}</div>`);
  const host = [...cgDoc.querySelectorAll("[data-section]")].find((x) => x.getAttribute("data-section") === TABLE);
  ok(!!host?.querySelector("table.doc-table") && host.querySelectorAll("tbody tr").length === 8, "в подразделе table.doc-table с восемью строками");
  ok(!cg.lockedSubsections.includes(TABLE) && !/id="subsec-/.test(cg.htmlContent), "подраздел не заперт; html_content — ответ модели дословно, без якорей одностраничника");
  const [glc] = await sql`select metadata from generation_log where synthesis_id=${GEN} and section_key='critique' and log_type='generation' order by created_at limit 1`;
  ok((glc?.metadata?.expectedSubsections ?? []).includes(TABLE), "ожидаемые подразделы генерации критики включают таблицу (карта подразделов из Registry)", glc?.metadata?.expectedSubsections);
  r = await api("POST", rec(GEN, "/parse"));
  ok(r.status === 200 && r.json.round === 1 && r.json.rows.length === 8 && r.json.invalidCount === 0, "разбор сгенерированной критики: восемь годных строк, раунд 1", r.json?.error ?? r.json?.rows?.filter((x) => x.status !== "new").map((x) => x.invalidReason));

  /* ══ R9. Раунд ══════════════════════════════════════════════════════ */
  console.log("\n■ R9. Раунд");
  const round1 = r.json.rows;
  r = await api("POST", rec(GEN, "/parse"));
  ok(r.status === 200 && r.json.newRound === false && r.json.round === 1 && J(r.json.rows.map((x) => x.id)) === J(round1.map((x) => x.id)), "повторный parse того же текста: раунд 1, те же строки с теми же id");
  r = await api("POST", rec(GEN, "/parse"));
  ok((await sql`select count(*)::int n from recommendations where synthesis_id=${GEN}`)[0].n === 8, "три разбора подряд — восемь строк, не двадцать четыре");
  await sql`update recommendations set status='done' where synthesis_id=${GEN} and num='2'`;
  mock.critiqueVariant = 2;
  const before = (await sql`select updated_at u from sections where synthesis_id=${GEN} and key='critique'`)[0].u;
  const rg = await api("POST", `/syntheses/${GEN}/regenerate/critique`, {});
  let regenDone = false;
  for (let i = 0; i < 120; i++) { await sleep(500); const [s] = await sql`select updated_at u, html_content h from sections where synthesis_id=${GEN} and key='critique'`; if (s.u > before && s.h.includes("вторая редакция")) { regenDone = true; break; } }
  for (let i = 0; i < 40; i++) { const t = await api("POST", rec(GEN, "/parse")); if (t.status !== 409) { r = t; break; } await sleep(500); }
  ok(rg.status === 200 && regenDone, "критика перегенерирована (проза изменилась)", rg.json);
  ok(r.status === 200 && r.json.newRound === true && r.json.round === 2 && r.json.latestRound === 2 && r.json.rows.length === 7 && r.json.rows.every((x) => x.status === "new"), "parse после перегенерации → раунд 2, строки новые (статусы прошлого раунда не наследуются)", [r.status, r.json?.round, r.json?.rows?.length]);
  const old = await api("GET", rec(GEN, "?round=1"));
  ok(old.status === 200 && old.json.round === 1 && old.json.latestRound === 2 && old.json.rows.length === 8 && J(old.json.rows.map((x) => x.id)) === J(round1.map((x) => x.id)) && old.json.rows[1].status === "done", "прежние строки остались с прежним раундом и прежними статусами");
  const cur = await api("GET", rec(GEN));
  ok(cur.json.round === 2 && cur.json.rows.length === 7, "GET без параметра — последний раунд");
  const byRound = await sql`select round, count(*)::int n from recommendations where synthesis_id=${GEN} group by round order by round`;
  ok(J(byRound.map((x) => [x.round, x.n])) === J([[1, 8], [2, 7]]), "в БД: раунд 1 — 8 строк, раунд 2 — 7", byRound);
  r = await api("GET", rec(GEN, "?round=5")); ok(r.status === 404 && /последний — 2/.test(r.json.error), "несуществующий раунд → 404 с номером последнего");
  r = await api("GET", rec(GEN, "?round=abc")); ok(r.status === 400 && r.json.code === "VALIDATION_ERROR", "round не число → 400");

  /* ══ R2 (вторая половина). Активация версии сбрасывает кэш ══════════ */
  console.log("\n■ R2. Активация версии сбрасывает кэш реестра");
  {
    const [orig] = await sql`select version, body from prompt_templates where key=${T_KEY} and is_active`;
    const MARK = "МЕТКА-КЭША-101";
    await extractWith(LIVE, LIVE_ROWS);
    ok(!mock.lastExtractPrompt.includes(MARK), "до правки шаблона метки в промпте нет (кэш прогрет)");
    const nv = await api("POST", `/prompts/${T_KEY}`, { body: orig.body + "\n" + MARK, description: "тест 10.1" }, { cookie: ADM.cookie });
    ok(nv.status === 201, "админ завёл новую версию шаблона таблицы", nv.json);
    const newVersion = nv.json?.template?.version;
    markerVersions.push(newVersion);
    if (!nv.json?.template?.isActive) await api("POST", `/prompts/${T_KEY}/activate`, { version: newVersion }, { cookie: ADM.cookie });
    await extractWith(LIVE, LIVE_ROWS);
    ok(mock.lastExtractPrompt.includes(MARK), "после активации новая версия в промпте СРАЗУ — кэш реестра сброшен");
    const back = await api("POST", `/prompts/${T_KEY}/activate`, { version: orig.version }, { cookie: ADM.cookie });
    await extractWith(LIVE, LIVE_ROWS);
    ok(back.status === 200 && !mock.lastExtractPrompt.includes(MARK), "активация прежней версии — метка из промпта ушла");
    const forb = await api("POST", `/prompts/${T_KEY}`, { body: "x" });
    ok(forb.status === 403, "не-админу правка шаблона закрыта", forb.status);
  }

  /* ══ R11. Края ══════════════════════════════════════════════════════ */
  console.log("\n■ R11. Края");
  for (const [m, tail] of [["GET", ""], ["POST", "/parse"], ["POST", "/extract"]]) {
    r = await api(m, rec(LIVE, tail), undefined, { cookie: B.cookie });
    ok(r.status === 403 && r.json.code === "FORBIDDEN", `чужой синтез: ${m} …${tail || "/recommendations"} → 403`, r.json);
  }
  await api("PATCH", `/syntheses/${LIVE}`, { visibility: "full" });
  r = await api("GET", rec(LIVE), undefined, { cookie: B.cookie });
  ok(r.status === 403, "чужому — 403 и на публичной концепции: рекомендации касаются правки, а не чтения", r.status);
  r = await fetch(BASE + rec(LIVE)); ok(r.status === 401, "без сессии → 401", r.status);
  r = await api("GET", rec("not-a-uuid")); ok(r.status === 404, "не-UUID → 404");
  r = await api("GET", rec("00000000-0000-4000-8000-000000000000")); ok(r.status === 404, "несуществующий синтез → 404");
  // Критики нет: живой файл без раздела критики
  const { document: noCr } = parseHTML(readFileSync(FILE, "utf8"));
  for (const el of noCr.querySelectorAll(".doc-section")) if (el.querySelector(`[data-section="${PROSE}"]`)) el.remove();
  const im2 = await importFile(noCr.toString());
  ok(im2.status === 200, "концепция без критики заведена", im2.json);
  const NOCR = im2.json.id; ids.push(NOCR);
  for (const [m, tail] of [["GET", ""], ["POST", "/parse"], ["POST", "/extract"]]) {
    r = await api(m, rec(NOCR, tail));
    ok(r.status === 404 && r.json.details?.reason === "no_critique" && /ещё не сгенерирован/.test(r.json.error) && !("rows" in r.json), `критика не сгенерирована: ${m} …${tail || "/recommendations"} → 404 с внятным текстом, не пустой список`, r.json);
  }
  const calls0 = mock.calls;
  await api("POST", rec(NOCR, "/extract"));
  ok(mock.calls === calls0, "…и модель при этом не зовётся");
  // Негодные ответы модели: документ цел
  const htmlBefore = (await critiqueOf(LIVE)).htmlContent;
  const verBefore = (await sql`select count(*)::int n from element_versions where synthesis_id=${LIVE}`)[0].n;
  mock.extractMode = "ok"; mock.extractAnswer = "<p>Извините, составить таблицу не удалось.</p>";
  r = await api("POST", rec(LIVE, "/extract")); mock.extractAnswer = null;
  ok(r.status === 422 && r.json.code === "RECOMMENDATIONS_TABLE_INVALID" && r.json.details?.problem === "model_no_table", "ответ модели без таблицы → 422", r.json);
  r = await extractWith(LIVE, LIVE_ROWS.map((x) => x.slice(0, 6)), HEAD.slice(0, 6));
  ok(r.status === 422 && r.json.details?.problem === "missing_columns" && J(r.json.details.missing) === J(["Важность"]) && r.json.error.includes("«Важность»"), "ответ модели без столбца → 422, ненайденный заголовок назван", r.json);
  mock.extractMode = "http500";
  r = await api("POST", rec(LIVE, "/extract")); mock.extractMode = "ok";
  ok(r.status === 502 && r.json.code === "GENERATION_FAILED", "обрыв обращения к модели → 502", r.json);
  ok((await critiqueOf(LIVE)).htmlContent === htmlBefore && (await sql`select count(*)::int n from element_versions where synthesis_id=${LIVE}`)[0].n === verBefore, "после трёх отказов документ байт в байт прежний, версий не прибавилось");
  ok((await api("POST", rec(LIVE, "/parse"))).status === 200, "слот генерации после отказов освобождён: parse проходит");
  // Занятый слот
  mock.extractMode = "slow";
  const slow = api("POST", rec(LIVE, "/extract"));
  await sleep(700);
  const busyParse = await api("POST", rec(LIVE, "/parse"));
  const busyExtract = await api("POST", rec(LIVE, "/extract"));
  const busyGet = await api("GET", rec(LIVE));
  const slowRes = await slow; mock.extractMode = "ok";
  ok(busyParse.status === 409 && busyParse.json.code === "GENERATION_IN_PROGRESS" && busyExtract.status === 409, "пока идёт ретрофит: parse и второй extract → 409 GENERATION_IN_PROGRESS", [busyParse.status, busyExtract.status]);
  ok(busyGet.status === 200 && slowRes.status === 200, "…а чтение строк идёт; сам ретрофит завершился");
  // Каскадное удаление
  const del = await api("DELETE", `/syntheses/${LIVE}`);
  ok(del.status === 200 && (await sql`select count(*)::int n from recommendations where synthesis_id=${LIVE}`)[0].n === 0, "удаление синтеза уносит рекомендации каскадом");
} catch (e) { failed++; console.log("СБОЙ:", e?.stack ?? e); }
finally {
  for (const id of ids) await sql`delete from syntheses where id=${id}`.catch(() => {});
  // Уборка версии-метки: сначала активна исходная (кэш сброшен активацией выше), затем строка долой
  for (const v of markerVersions) if (v) await sql`delete from prompt_templates where key=${T_KEY} and version=${v} and not is_active`.catch(() => {});
  await sql`delete from users where email like 't101-%@example.com'`.catch(() => {});
  try { if (srv) process.kill(-srv.pid, "SIGKILL"); } catch {}
  mockSrv.closeAllConnections?.(); mockSrv.close();
  await Promise.race([sql.end({ timeout: 2 }), sleep(3000)]);
}
console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗`);
process.exit(failed ? 1 : 0);
