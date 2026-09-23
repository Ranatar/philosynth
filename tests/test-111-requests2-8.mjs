/**
 * Беседа 11.1 — тестовые запросы R2–R8 (защита машинных значений при нерусской
 * генерации). Живой сервер :3000 + мок Claude :3921; браузер не нужен (беседа
 * серверная). Нужны PG и Redis. Запуск ИЗ КОРНЯ через tsx:
 *   node_modules/.bin/tsx tests/test-111-requests2-8.mjs
 *
 *  R2 надстройка: система приведена к состоянию «до 11.1» (у system.lang_instruction
 *     одна v1 с телом генерата) → seed:prompts даёт updated=1, v2 активна с обоими
 *     правилами, v1 цела → повтор — одни skip; генерат не изменён (git diff пуст,
 *     smoke-12 зелёный).
 *  R3 рендер на живом пути: синтез с lang=English → системный промпт, который получает
 *     мок, несёт правило закрытых списков; lang=Russian → языковой инструкции нет вовсе.
 *  R4 разбор на моке: раздел графа с английскими направлениями («bidirectional»,
 *     «reflexive») → предупреждения с номерами строк в генлоге, рёбра сохранены
 *     «однонаправленными»; тот же раздел с русскими значениями → ни одного предупреждения.
 *  R5 роль «Central» вместо «центральная» → предупреждение, роль не потеряна молча
 *     (остальные роли строки прочитаны).
 *  R6 лог: предупреждения разбора видны в GET /logs/formatted (2.4).
 *  R7 страховка: раздел графа с пятью переведёнными атрибутами data-section →
 *     перегенерация подраздела «Таблица связей» находит его по позиции, в генлоге
 *     предупреждение с обоими именами, атрибут после врезки русский; раздел с четырьмя
 *     подразделами → отказ с предупреждением о несовпадении числа (подраздел дописан в
 *     конец, как и прежде).
 *  R8 сторож: из активной версии снято правило закрытых списков → check:integration
 *     красный с указанием, какого правила нет; версия восстановлена.
 */
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import postgres from "postgres";

const ROOT = new URL("../", import.meta.url).pathname;
const BASE = "http://127.0.0.1:3000/api/v1";
const MOCK_PORT = 3921;
const sql = postgres(process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth");
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
function ok(cond, name, extra) { if (cond) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 700) : ""}`); } }

const KEY = "system.lang_instruction";
const RULE = "CRITICAL MACHINE-VALUE RULE";
const ORDER = ["Методология построения графа", "Таблица категорий", "Таблица связей", "Топология графа", "Топологическая таблица"];
const EN_NAMES = ["Methodology", "Category Table", "Edge Table", "Graph Topology", "Topology Table"];

/* ── HTML графа, как его отдаёт «модель» ── */
const tbl = (h, rows) => `<table class="doc-table"><thead><tr>${h.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>\n${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("\n")}\n</tbody></table>`;
const sub = (n, b) => `<div data-section="${n}"><h4>${n}</h4>\n${b}\n</div>`;
const catsTable = () => tbl(["Категория", "Тип", "Определение", "Центральность", "Определённость", "Происхождение"],
  [["Бытие", "онтологическая", "Есть.", "0.9", "0.8", "Парменид"], ["Ничто", "онтологическая", "Не есть.", "0.5", "0.5", "Гегель"], ["Становление", "онтологическая", "Переход.", "0.7", "0.6", "Гегель"]]);
const edgesTable = (dirs) => tbl(["Источник", "Описание связи", "Цель", "Тип", "Направление", "Сила"],
  [["Бытие", "снимается в", "Ничто", "диалектическая", dirs[0], "0.8"], ["Ничто", "возвращается к себе", "Ничто", "рефлексия", dirs[1], "0.3"], ["Становление", "синтезирует", "Бытие", "эмерджентность", dirs[2], "0.6"]]);
const topoTable = (roles) => tbl(["Категория", "Кластер", "Структурные роли", "Процессуальные роли", "Рефлексивная связь"],
  [["Бытие", "Ядро", roles[0], roles[1], ""], ["Ничто", "Ядро", roles[2], "антитезис", "да"], ["Становление", "Ядро", "мост", "синтез", ""]]);
function graphSection(dirs, roles, names = ORDER) {
  const bodies = ["<p>Методология.</p>", catsTable(), edgesTable(dirs), "<p>Топология: ядро.</p>", topoTable(roles)];
  return `<div class="doc-section"><div class="section-num">§ 2</div><div class="section-title">Граф категорий</div><div class="doc-content">\n${names.map((n, i) => sub(n, bodies[i])).join("\n")}\n</div></div>`;
}
const RU = { dirs: ["однонаправленная", "рефлексивная", "двунаправленная"], roles: ["центральная", "тезис", "периферийная"] };
const EN = { dirs: ["unidirectional", "reflexive", "bidirectional"], roles: ["Central", "Thesis", "периферийная"] };

/* ── Мок Claude: полный раздел графа либо один подраздел «Таблица связей» ── */
const mock = { mode: RU, calls: [], lastSys: "" };
const mockSrv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    let prompt = "", sys = "";
    try { const j = JSON.parse(body); const c = j.messages?.[0]?.content; prompt = typeof c === "string" ? c : J(c); sys = typeof j.system === "string" ? j.system : J(j.system); } catch {}
    mock.lastSys = sys;
    const subsectionMode = sys.includes("одного именованного подраздела");
    let html;
    if (subsectionMode) html = sub("Таблица связей", edgesTable(mock.mode.dirs));
    else html = graphSection(mock.mode.dirs, mock.mode.roles);
    mock.calls.push({ subsectionMode, sysHasRule: sys.includes(RULE), sysHasLang: sys.includes("CRITICAL OUTPUT LANGUAGE") });
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (o) => res.write(`data: ${J(o)}\n\n`);
    send({ type: "message_start", message: { usage: { input_tokens: 500 } } });
    for (let i = 0; i < html.length; i += 1200) send({ type: "content_block_delta", delta: { type: "text_delta", text: html.slice(i, i + 1200) } });
    send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 800 } });
    send({ type: "message_stop" });
    res.end();
  });
});
await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));

let srv = null;
function startServer() {
  srv = spawn(process.execPath, ["--import", "tsx", "index.ts"], { cwd: ROOT + "server", detached: true, stdio: "ignore", env: { ...process.env, PORT: "3000", RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-111", STREAM_RETRY_DELAYS: "50" } });
}
function stopServer() { try { if (srv) process.kill(-srv.pid, "SIGKILL"); } catch {} srv = null; }
async function waitHealth() { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/health`)).ok) return true; } catch {} await sleep(500); } return false; }
let cookie = "";
async function api(method, path, body) {
  const headers = { Cookie: cookie };
  let payload;
  if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
  const r = await fetch(BASE + path, { method, headers, body: payload });
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function account() {
  const email = `t111-${Date.now()}@example.com`;
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-111" }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-111" }) });
  cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  return u.id;
}
const seed = () => { const r = spawnSync("npm", ["run", "seed:prompts"], { cwd: ROOT, encoding: "utf8" }); const m = /Итог: created=(\d+), updated=(\d+), skip=(\d+), fail=(\d+)/.exec(r.stdout ?? ""); return m ? { created: +m[1], updated: +m[2], skip: +m[3], fail: +m[4] } : { error: (r.stdout ?? "").slice(-300) + (r.stderr ?? "").slice(-300) }; };
const redisFlush = () => spawnSync("redis-cli", ["flushall"], { encoding: "utf8" });

const ids = [];
/** Синтез с готовым разделом графа (HTML — как из «модели»). */
async function synthWithGraph(userId, { lang = "Russian", html = graphSection(RU.dirs, RU.roles) } = {}) {
  const [syn] = await sql`insert into syntheses (user_id, seed, title, status, section_order, lang, doc_num, method, synth_level, depth)
    values (${userId}, 'зерно 11.1', 'T111', 'ready', ${sql.json(["sum", "graph"])}, ${lang}, 'PS-0111-T111', 'dialectical', 'comparative', 'overview') returning id`;
  ids.push(syn.id);
  await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${syn.id}, 'sum', 1, 'Резюме', ${'<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">Резюме</div><div class="doc-content"><div data-section="Цели и метод"><h4>Цели и метод</h4><p>Цель.</p></div></div></div>'})`;
  await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${syn.id}, 'graph', 2, 'Граф категорий', ${html})`;
  return syn.id;
}
/** Ждать строку генлога раздела/подраздела со статусом done|error, появившуюся после метки. */
async function waitGen(synthesisId, sectionKey, sinceMs) {
  for (let i = 0; i < 120; i++) {
    const [g] = await sql`select id, status, error_message, metadata from generation_log where synthesis_id=${synthesisId} and section_key=${sectionKey} and log_type='generation' and created_at > ${new Date(sinceMs)} order by created_at desc limit 1`;
    if (g && g.status !== "streaming") return g;
    await sleep(250);
  }
  return null;
}
const warningsOf = (g) => (g?.metadata?.parseWarnings ?? []);
const regenGraph = async (id) => { const since = Date.now() - 50; const r = await api("POST", `/syntheses/${id}/regenerate/graph`, {}); if (r.status !== 200) throw new Error("regenerate: " + J(r)); await sleep(300); return waitGen(id, "graph", since); };
const regenSub = async (id, name) => { const since = Date.now() - 50; const r = await api("POST", `/syntheses/${id}/regenerate-subsection`, { sectionKey: "graph", subsectionName: name }); if (r.status !== 200) throw new Error("regenerate-subsection: " + J(r)); await sleep(300); return waitGen(id, `graph:${name}`, since); };

try {
  /* ══ R2. Надстройка — путь обновления сида (сервер остановлен) ═════════ */
  console.log("\n■ R2. seed:prompts: обновление system.lang_instruction");
  {
    const { SEED_PROMPT_TEMPLATES } = await import("../server/config/prompt-templates.ts");
    const gen = SEED_PROMPT_TEMPLATES.find((t) => t.key === KEY);
    await sql`delete from prompt_templates where key=${KEY}`;
    await sql`insert into prompt_templates (key, version, body, is_active, description) values (${KEY}, 1, ${gen.body}, true, ${gen.description})`;
    const s1 = seed();
    ok(s1.updated === 1 && s1.created === 0 && s1.fail === 0, "первый прогон: updated=1 (system.lang_instruction), created=0, fail=0", s1);
    const rows = await sql`select version, is_active, body from prompt_templates where key=${KEY} order by version`;
    ok(rows.length === 2 && rows[0].version === 1 && !rows[0].is_active && rows[0].body === gen.body, "v1 цела и неактивна (тело генерата)", rows.map((r) => [r.version, r.is_active, r.body.length]));
    ok(rows[1]?.is_active && rows[1].body.includes(RULE) && rows[1].body.includes("The data-section attribute values MUST remain EXACTLY"), "v2 активна и несёт ОБА правила");
    ok(rows[1]?.body.startsWith(gen.body.replace(/\s*$/, "")), "v2 начинается с прежнего текста инструкции дословно");
    const s2 = seed();
    ok(s2.updated === 0 && s2.created === 0 && s2.skip > 200, "повторный прогон — одни skip", s2);
    const diff = spawnSync("git", ["diff", "--quiet", "--", "server/config/prompt-templates.ts", "server/config/section-templates.ts"], { cwd: ROOT });
    ok(diff.status === 0, "генераты prompt-templates.ts / section-templates.ts не изменены (git diff пуст)");
    redisFlush();
    const sm = spawnSync("node_modules/.bin/tsx", ["tests/smoke-12-request1.mjs"], { cwd: ROOT, encoding: "utf8", timeout: 150000 });
    const m = /Итог: (\d+) ✓, (\d+) ✗/.exec(sm.stdout ?? "");
    ok(m && +m[2] === 0 && +m[1] >= 134, `smoke-12 (байтовая сверка с исходником) зелёный: ${m ? m[0] : (sm.stderr ?? "").slice(-300)}`);
  }

  /* ══ Сервер ══ */
  startServer();
  if (!(await waitHealth())) throw new Error("сервер не поднялся");
  const userId = await account();

  /* ══ R3. Рендер по языку на живом пути ═════════════════════════════════ */
  console.log("\n■ R3. Системный промпт по lang (что получает модель)");
  {
    const en = await synthWithGraph(userId, { lang: "English" });
    mock.mode = RU; mock.calls = [];
    const g = await regenGraph(en);
    ok(g?.status === "done", "перегенерация графа (lang=English) завершена", g?.error_message);
    const c = mock.calls.at(-1);
    ok(c?.sysHasLang && c?.sysHasRule && mock.lastSys.includes("in English"), "lang=English: SYS несёт языковую инструкцию И правило закрытых списков");
    const ru = await synthWithGraph(userId, { lang: "Russian" });
    mock.calls = [];
    const g2 = await regenGraph(ru);
    ok(g2?.status === "done", "перегенерация графа (lang=Russian) завершена", g2?.error_message);
    const c2 = mock.calls.at(-1);
    ok(c2 && !c2.sysHasLang && !c2.sysHasRule, "lang=Russian: языковой инструкции в SYS нет вовсе (как раньше)");
    ok(warningsOf(g2).length === 0, "русские значения → в генлоге нет parseWarnings", warningsOf(g2));
  }

  /* ══ R4. Английские направления ════════════════════════════════════════ */
  console.log("\n■ R4. Разбор: английские направления связей");
  let idEn;
  {
    idEn = await synthWithGraph(userId, { lang: "English" });
    mock.mode = { dirs: EN.dirs, roles: RU.roles };
    const g = await regenGraph(idEn);
    ok(g?.status === "done", "перегенерация графа завершена", g?.error_message);
    const w = warningsOf(g);
    // все три латиницей — ни одно не опознаётся (синонимов нет намеренно)
    ok(w.length === 3 && w.every((x) => /направление «/.test(x)), `предупреждений о направлении — 3 (unidirectional / reflexive / bidirectional): получено ${w.length}`, w);
    const dirWarn = w.filter((x) => /направление «/.test(x));
    ok(dirWarn.some((x) => /таблица связей, строка 3 \(«Становление» → «Бытие»\): направление «bidirectional» не опознано/.test(x)), "предупреждение несёт номер строки, концы и значение «bidirectional»", w);
    const edges = await sql`select c1.name as src, c2.name as tgt, e.direction from category_edges e join categories c1 on c1.id=e.source_id join categories c2 on c2.id=e.target_id where e.synthesis_id=${idEn} order by e.position`;
    ok(edges.length === 3 && edges.every((e) => e.direction === "однонаправленная"), "рёбра сохранены (3), направление подставлено «однонаправленная»", edges);
    const cats = await sql`select name, has_reflexive from categories where synthesis_id=${idEn} order by position`;
    ok(cats.length === 3, "категории на месте", cats);
  }
  console.log("\n  — тот же раздел с русскими направлениями");
  {
    const id = await synthWithGraph(userId);
    mock.mode = RU;
    const g = await regenGraph(id);
    ok(g?.status === "done" && warningsOf(g).length === 0, "русские направления → ни одного предупреждения", warningsOf(g));
    const edges = await sql`select direction from category_edges where synthesis_id=${id} order by position`;
    ok(J(edges.map((e) => e.direction)) === J(RU.dirs), "направления прочитаны как написаны", edges);
    const [n] = await sql`select has_reflexive from categories where synthesis_id=${id} and name='Ничто'`;
    ok(n?.has_reflexive === true, "рефлексивное ребро даёт has_reflexive");
  }

  /* ══ R5. Роль вне ROLE_MAP ════════════════════════════════════════════ */
  console.log("\n■ R5. Роль «Central» вместо «центральная»");
  let idRole;
  {
    idRole = await synthWithGraph(userId);
    mock.mode = { dirs: RU.dirs, roles: EN.roles };
    const g = await regenGraph(idRole);
    const w = warningsOf(g);
    ok(w.some((x) => /топологическая таблица, строка 1 \(«Бытие»\), столбец «Структурные роли»: роль «Central» не опознана/.test(x)), "предупреждение о роли «Central» со строкой, категорией и столбцом", w);
    ok(w.some((x) => /столбец «Процессуальные роли»: роль «Thesis» не опознана/.test(x)), "предупреждение о роли «Thesis»", w);
    ok(!w.some((x) => /направление/.test(x)), "о направлениях предупреждений нет (они русские)", w);
    const [b] = await sql`select structural_roles, procedural_roles from categories where synthesis_id=${idRole} and name='Бытие'`;
    ok(J(b.structural_roles) === "[]" && J(b.procedural_roles) === "[]", "роли «Бытия» не выдуманы (пусто), потеря названа, а не скрыта", b);
    const [s] = await sql`select structural_roles, procedural_roles from categories where synthesis_id=${idRole} and name='Становление'`;
    ok(J(s.structural_roles) === J(["bridge"]) && J(s.procedural_roles) === J(["synthesis"]), "русские роли соседних строк прочитаны", s);
  }

  /* ══ R6. Лог 2.4 ══════════════════════════════════════════════════════ */
  console.log("\n■ R6. Предупреждения в логе генерации");
  {
    const r = await api("GET", `/syntheses/${idEn}/logs/formatted`);
    ok(r.status === 200 && /РАЗБОР С ПОТЕРЯМИ \(\d+\)/.test(r.json?.text ?? ""), "GET /logs/formatted: блок «РАЗБОР С ПОТЕРЯМИ»", (r.json?.text ?? "").slice(0, 200));
    ok(/⚠ таблица связей, строка 3 \(«Становление» → «Бытие»\)/.test(r.json?.text ?? ""), "строка предупреждения о направлении видна в тексте лога");
    ok(/РАЗБОР С ПОТЕРЯМИ/.test(r.json?.html ?? ""), "html-версия лога несёт тот же блок");
    const r2 = await api("GET", `/syntheses/${idRole}/logs/formatted`);
    ok(/роль «Central» не опознана/.test(r2.json?.text ?? ""), "предупреждение о роли видно в логе");
    const g = await api("GET", `/syntheses/${idEn}/logs/generation`);
    const entry = (g.json?.entries ?? []).find((e) => e.sectionKey === "graph" && e.source === "edit");
    ok(Array.isArray(entry?.metadata?.parseWarnings) && entry.metadata.parseWarnings.length > 0, "GET /logs/generation: metadata.parseWarnings строки раздела", entry?.metadata);
  }

  /* ══ R7. Страховка по позиции ═════════════════════════════════════════ */
  console.log("\n■ R7. Переведённые data-section: перегенерация «Таблицы связей»");
  {
    const id5 = await synthWithGraph(userId, { lang: "English", html: graphSection(RU.dirs, RU.roles, EN_NAMES) });
    mock.mode = RU; mock.calls = [];
    const g = await regenSub(id5, "Таблица связей");
    ok(g?.status === "done", "подраздел перегенерирован", g?.error_message);
    ok(mock.calls.at(-1)?.subsectionMode === true, "модель получила SYS одного подраздела");
    const w = warningsOf(g);
    ok(w.some((x) => /подраздел 3 опознан по месту: атрибут "Edge Table" вместо "Таблица связей"/.test(x)), "в генлоге предупреждение с обоими именами", w);
    const [sec] = await sql`select html_content from sections where synthesis_id=${id5} and key='graph'`;
    const names = [...sec.html_content.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1]);
    ok(J(names) === J(["Methodology", "Category Table", "Таблица связей", "Graph Topology", "Topology Table"]), "подраздел заменён НА МЕСТЕ, атрибут после врезки русский, число подразделов прежнее", names);
    ok(!sec.html_content.includes('data-section="Edge Table"'), "старого атрибута «Edge Table» в разделе нет");
    // Граница страховки: «Таблица категорий» в этом документе по-прежнему «Category Table» —
    // парсер её не читает (полная отвязка data-section — не эта фаза), но теперь ГОВОРИТ об этом
    const edges = await sql`select count(*)::int as n from category_edges where synthesis_id=${id5}`;
    ok(edges[0].n === 0 && w.some((x) => /подраздел «Таблица категорий» не найден — категории не разобраны/.test(x)), "граница страховки названа: категории при переведённом атрибуте не разобраны — предупреждение, не молчание", { n: edges[0].n, w });
    ok(w.filter((x) => /направление «|роль «/.test(x)).length === 0, "предупреждений о значениях при русских ячейках нет");
  }
  console.log("\n  — четыре подраздела вместо пяти");
  {
    const html4 = graphSection(RU.dirs, RU.roles, EN_NAMES).replace(/<div data-section="Topology Table">[\s\S]*?<\/div>\n<\/div>/, "</div>");
    const cnt = (html4.match(/data-section=/g) ?? []).length;
    ok(cnt === 4, `фикстура несёт 4 подраздела (${cnt})`);
    const id4 = await synthWithGraph(userId, { lang: "English", html: html4 });
    const g = await regenSub(id4, "Таблица связей");
    ok(g?.status === "done", "перегенерация подраздела завершилась (отказ опознания — не ошибка генерации)", g?.error_message);
    const w = warningsOf(g);
    ok(w.some((x) => /подраздел «Таблица связей» не найден по имени; опознать по месту нельзя: в разделе 4 подраздел\(ов\), в карте 5/.test(x)), "предупреждение о несовпадении числа подразделов", w);
    ok(!w.some((x) => /опознан по месту/.test(x)), "по месту НЕ опознан");
    const [sec] = await sql`select html_content from sections where synthesis_id=${id4} and key='graph'`;
    const names = [...sec.html_content.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1]);
    ok(names.length === 5 && names[4] === "Таблица связей" && names.includes("Edge Table"), "честный отказ: старый «Edge Table» цел, новый подраздел дописан в конец (как прежде)", names);
    const r = await api("GET", `/syntheses/${id4}/logs/formatted`);
    ok(/опознать по месту нельзя/.test(r.json?.text ?? ""), "причина отказа видна в логе");
  }

  /* ══ R8. Сторож ═══════════════════════════════════════════════════════ */
  console.log("\n■ R8. Сторож check:integration при снятом правиле");
  stopServer();
  {
    const [act] = await sql`select id, body from prompt_templates where key=${KEY} and is_active`;
    const cut = act.body.indexOf(RULE);
    const sabotaged = act.body.slice(0, cut).replace(/\n$/, "") + "\n\n";
    ok(!sabotaged.includes(RULE) && sabotaged.includes("The data-section attribute values MUST remain EXACTLY"), "фикстура: правило закрытых списков снято, правило data-section оставлено");
    await sql`update prompt_templates set body=${sabotaged} where id=${act.id}`;
    redisFlush();
    const ic = spawnSync("npm", ["run", "check:integration", "-w", "server"], { cwd: ROOT, encoding: "utf8", timeout: 300000, env: { ...process.env, RATE_LIMIT_HTTP_PER_MINUTE: "100000" } });
    const out = (ic.stdout ?? "") + (ic.stderr ?? "");
    ok(ic.status !== 0, `check:integration красный (код ${ic.status})`);
    ok(/5ai: активный system\.lang_instruction без правила закрытых списков/.test(out), "сторож называет, какого правила нет", out.split("\n").filter((l) => /5ai|4av/.test(l)).join(" | ").slice(0, 600));
    ok(!/INTEGRATION OK/.test(out), "INTEGRATION OK не напечатан");
    await sql`update prompt_templates set body=${act.body} where id=${act.id}`;
    redisFlush();
    const [back] = await sql`select body from prompt_templates where key=${KEY} and is_active`;
    ok(back.body.includes(RULE), "активная версия восстановлена");
  }
} catch (e) {
  failed++;
  console.error("✗ СЦЕНАРИЙ ОБОРВАН:", e);
} finally {
  stopServer();
  try { for (const id of ids) await sql`delete from syntheses where id=${id}`; } catch {}
  try { await sql`delete from users where email like 't111-%@example.com'`; } catch {}
  mockSrv.closeAllConnections?.(); mockSrv.close();
  await sql.end({ timeout: 2 }).catch(() => {});
}
console.log(`\nИТОГ: ${passed} ✓, ${failed} ✗`);
process.exit(failed ? 1 : 0);
