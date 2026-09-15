/**
 * Тестовые запросы 2–14 беседы 8.6 (модель публичности и гостевой доступ,
 * бэкенд) — одним заходом против ЖИВОГО сервера на ОТДЕЛЬНОЙ пустой БД
 * philosynth_t86 (пересоздаётся, миграции 0000–0005 drizzle-kit), живой
 * PG16/Redis; браузера нет (все запросы API-уровня), моки Claude/Stripe не
 * нужны: генерация мета-синтеза R11 стартует фоном и падает о мёртвый
 * ANTHROPIC_BASE_URL (проверяются создание строки и lineage), Stripe пуст.
 *  R2  Миграция 0005 на базе с публичными/приватными синтезами (отдельная БД
 *      philosynth_t86mig: 0000–0004 → строки is_public → 0005): visibility
 *      'full'/'private', is_public снят, allow_meta=true у всех.
 *  R3  Гость: GET /public → 200 без totalCostUsd; GET /:id публичной → 200
 *      без стоимости/токенов, с sections; приватной → 403; /billing/plans → 200.
 *  R4  Витрина: гость и чужой зарегистрированный получают капсулу и
 *      метаданные, разделов нет (scope 'showcase', /sections → 403);
 *      владелец получает всё.
 *  R5  Авторство: show_author=false → нет authorName даже зарегистрированному;
 *      true → имя; пустой display_name → поля нет.
 *  R6  Логи: чужой при show_logs=true → /logs/context 200, false → 403;
 *      /logs/prompts при show_prompts=false → 403, true → 200; владелец — всё.
 *  R7  Гашение витриной: showcase со ВСЕМИ флагами true → чужому 403 на
 *      context/prompts, в участники → 403 META_NOT_ALLOWED, authorName отдаётся.
 *  R8  Сохранность флагов: full+все флаги → showcase → обратно: в БД не
 *      сброшены, действуют снова.
 *  R9  PATCH без порядка: show_prompts=true + visibility='showcase' одним
 *      запросом → 200, сохранено, действие погашено.
 *  R10 Стоимость: зарегистрированный видит totalCostUsd у витрины и публичной
 *      при любых флагах; гость — нигде.
 *  R11 Мета-синтез: чужая с allow_meta=true → создан + lineage; с false →
 *      403 META_NOT_ALLOWED с названием; своя с false → создаётся.
 *  R12 PATCH: владелец меняет visibility и флаги → отражено; чужой → 403;
 *      visibility='mine' → 400 details.visibility; синоним isPublic.
 *  R13 Экспорт: невладелец при недейственном show_logs — файл без лога, но со
 *      стоимостью; при scope='showcase' → 403.
 *  R14 Edge: гость на любом пути кроме трёх → 401; cookie просроченной сессии
 *      на гостевом пути → гость (200), не 401.
 * Запуск из корня: node_modules/.bin/tsx tests/test-86-requests2-14.mjs
 */
import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";

const SERVER_PORT = 3186;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const PG_BASE = "postgres://philosynth:philosynth_dev@localhost:5432";
const DB_NAME = "philosynth_t86";
const MIG_DB = "philosynth_t86mig";
const DB_URL = `${PG_BASE}/${DB_NAME}`;
const ROOT = new URL("../", import.meta.url).pathname;
const COOKIE = "philosynth_session";

process.env.DATABASE_URL = DB_URL;
process.env.REDIS_URL ??= "redis://localhost:6379";

let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
const J = (x) => JSON.stringify(x);

async function recreateDb(name) {
  const admin = postgres(`${PG_BASE}/postgres`, { max: 1 });
  await admin`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${name} AND pid <> pg_backend_pid()`;
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`);
  await admin.unsafe(`CREATE DATABASE ${name}`);
  await admin.end();
  const fresh = postgres(`${PG_BASE}/${name}`, { max: 1 });
  await fresh`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
  await fresh.end();
}
async function applySqlFile(sqlc, file) {
  const src = readFileSync(join(ROOT, "server/db/migrations", file), "utf8");
  for (const stmt of src.split("--> statement-breakpoint")) {
    const s = stmt.trim();
    if (s) await sqlc.unsafe(s);
  }
}

/* ══ R2. Миграция 0005 с переносом данных ═════════════════════════════ */
console.log(`── R2: миграция 0005 на базе с данными (${MIG_DB}) ──`);
{
  await recreateDb(MIG_DB);
  const m = postgres(`${PG_BASE}/${MIG_DB}`, { max: 1 });
  for (const f of ["0000_initial.sql", "0001_phase56_owner_columns.sql", "0002_billing_history_set_null.sql", "0003_set_null_fks_stripe_customer.sql", "0004_admin_audit.sql"]) await applySqlFile(m, f);
  await m`INSERT INTO users(id,email,password_hash) VALUES ('11111111-1111-1111-1111-111111111111','mig@x','h')`;
  await m`INSERT INTO syntheses(id,user_id,title,is_public) VALUES
    ('22222222-2222-2222-2222-222222222221','11111111-1111-1111-1111-111111111111','pub',true),
    ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','priv',false),
    ('22222222-2222-2222-2222-222222222223','11111111-1111-1111-1111-111111111111','pub2',true)`;
  await applySqlFile(m, "0005_visibility.sql");
  const rows = await m`SELECT title, visibility, show_author, show_logs, show_prompts, allow_meta FROM syntheses ORDER BY title`;
  ok(rows.find((r) => r.title === "pub")?.visibility === "full" && rows.find((r) => r.title === "pub2")?.visibility === "full", "is_public=true → visibility 'full'");
  ok(rows.find((r) => r.title === "priv")?.visibility === "private", "is_public=false → 'private'");
  ok(rows.every((r) => r.allow_meta === true), "allow_meta=true у всех (возможность не отнята)");
  ok(rows.every((r) => r.show_logs === true && r.show_author === false && r.show_prompts === false), "дефолты флагов: show_logs true, show_author/show_prompts false");
  const cols = await m`SELECT column_name FROM information_schema.columns WHERE table_name='syntheses' AND column_name IN ('is_public','visibility')`;
  ok(cols.length === 1 && cols[0].column_name === "visibility", "колонка is_public снята, visibility есть");
  const idx = await m`SELECT indexname FROM pg_indexes WHERE tablename='syntheses' AND indexname IN ('idx_syntheses_public','idx_syntheses_visibility')`;
  ok(idx.length === 1 && idx[0].indexname === "idx_syntheses_visibility", "индекс переехал на visibility");
  let checkErr = null;
  try { await m`UPDATE syntheses SET visibility='mine' WHERE title='pub'`; } catch (e) { checkErr = e; }
  ok(checkErr?.constraint_name === "syntheses_visibility_check" || /visibility_check/.test(String(checkErr)), "CHECK отвергает 'mine'", String(checkErr));
  await m.end();
}

/* ══ Подготовка рабочей БД и сервера ══════════════════════════════════ */
console.log(`── Подготовка: пустая БД ${DB_NAME}, drizzle-kit migrate 0000–0005 ──`);
await recreateDb(DB_NAME);
{
  const mig = spawnSync("npx", ["drizzle-kit", "migrate"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, DATABASE_URL: DB_URL }, timeout: 120000 });
  ok(mig.status === 0 && /migrations applied successfully/.test(mig.stdout + mig.stderr), "drizzle-kit migrate на пустой БД", (mig.stdout + mig.stderr).slice(-300));
}
const sqlc = postgres(DB_URL, { max: 2 });

let serverProc, serverLog = "";
const SERVER_ENV = {
  PORT: String(SERVER_PORT), DATABASE_URL: DB_URL, REDIS_URL: "redis://localhost:6379",
  CLIENT_ORIGIN: `http://127.0.0.1:${SERVER_PORT}`, RATE_LIMIT_HTTP_PER_MINUTE: "100000",
  ANTHROPIC_API_KEY: "sk-ant-server-key-86", ANTHROPIC_BASE_URL: "http://127.0.0.1:1",
  STREAM_RETRY_DELAYS: "20,20", API_KEY_ENCRYPTION_SECRET: "test-encryption-secret-86",
  STRIPE_SECRET_KEY: "", BILLING_ENFORCE: "false", NODE_ENV: "development",
};
async function startServer() {
  try { if ((await fetch(`${API}/health`)).ok) throw new Error(`на :${SERVER_PORT} уже кто-то отвечает — прогон о чужой сервер`); } catch (e) { if (/чужой/.test(String(e))) throw e; }
  serverProc = spawn(process.execPath, ["--import", "tsx", "index.ts"], {
    cwd: join(ROOT, "server"), env: { ...process.env, ...SERVER_ENV }, stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  serverProc.stdout.on("data", (d) => (serverLog += d));
  serverProc.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`${API}/health`)).ok) return; } catch {} await sleep(300); }
  throw new Error("сервер не поднялся:\n" + serverLog.slice(-3000));
}

/* ══ Хелперы HTTP ═════════════════════════════════════════════════════ */
async function req(method, path, { body, cookie } = {}) {
  const r = await fetch(`${API}${path}`, {
    method, headers: { "content-type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : J(body), redirect: "manual",
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, body: json, text, headers: r.headers };
}
const PASSWORD = "Passw0rd!86";
async function makeUser(email, displayName) {
  const reg = await req("POST", "/auth/register", { body: { email, password: PASSWORD, ...(displayName ? { displayName } : {}) } });
  if (reg.status !== 200 && reg.status !== 201) throw new Error("register " + reg.status + " " + reg.text);
  const login = await req("POST", "/auth/login", { body: { email, password: PASSWORD } });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  if (!cookie) throw new Error("no cookie");
  return { id: reg.body.user.id, email, cookie };
}

/* Прямые вставки пригодной концепции (образец 09 §4, беседа 3.2) */
const SEC_HTML = (key, title, num) => `<div class="doc-section" id="sec-${key}"><span class="section-num">§ ${num}</span><h3 class="section-title">${title}</h3><div class="doc-content"><div data-section="${title}"><p>Текст ${title}.</p></div></div></div>`;
async function makeSynthesis(owner, title, opts = {}) {
  const [row] = await sqlc`INSERT INTO syntheses (user_id, title, status, visibility, show_author, show_logs, show_prompts, allow_meta, section_order, capsule_html, total_input_tokens, total_output_tokens, total_cost_usd, doc_num)
    VALUES (${owner.id}, ${title}, 'ready', ${opts.visibility ?? "private"}, ${opts.showAuthor ?? false}, ${opts.showLogs ?? true}, ${opts.showPrompts ?? false}, ${opts.allowMeta ?? true},
      ${sqlc.json(["sum", "graph", "glossary", "theses", "critique"])}, ${'<div class="doc-section"><div data-section="Капсула"><p>Капсула ' + title + '</p></div></div>'}, 1000, 2000, 1.234567, ${"PS-" + Math.floor(Math.random() * 9000 + 1000) + "-T86"})
    RETURNING id`;
  const id = row.id;
  const secs = [["sum", "Сводка", 1], ["graph", "Граф категорий", 2], ["glossary", "Глоссарий", 3], ["theses", "Корпус тезисов", 4], ["critique", "Критика", 5]];
  for (const [key, t, n] of secs) await sqlc`INSERT INTO sections (synthesis_id, key, section_num, title, html_content) VALUES (${id}, ${key}, ${n}, ${t}, ${SEC_HTML(key, t, n)})`;
  await sqlc`INSERT INTO synthesis_lineage (synthesis_id, parent_type, parent_name, position) VALUES (${id}, 'philosopher', 'Кант', 0)`;
  await sqlc`INSERT INTO generation_log (synthesis_id, section_key, section_label, log_type, source, status, input_tokens, output_tokens, cost_usd, metadata) VALUES (${id}, 'sum', 'Сводка', 'generation', 'initial', 'done', 500, 600, 0.5, ${sqlc.json({ promptSkeleton: "СКЕЛЕТ ПРОМПТА sum" })})`;
  await sqlc`INSERT INTO context_log (synthesis_id, section_key, budget, total_used, req_found, req_total, opt_included, opt_total, entries) VALUES (${id}, 'sum', 1000, 100, 1, 1, 0, 0, ${sqlc.json([])})`;
  return id;
}
async function setVis(id, patch) {
  const keys = Object.keys(patch);
  const sets = keys.map((k) => sqlc`${sqlc(k)} = ${patch[k]}`);
  await sqlc.unsafe(`UPDATE syntheses SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(", ")} WHERE id = $${keys.length + 1}`, [...keys.map((k) => patch[k]), id]);
  void sets;
}
const dbVis = async (id) => (await sqlc`SELECT visibility, show_author, show_logs, show_prompts, allow_meta FROM syntheses WHERE id = ${id}`)[0];
const hasCost = (o) => o && ("totalCostUsd" in o || "totalInputTokens" in o || "totalOutputTokens" in o);

try {
  await startServer();
  ok(true, `сервер :${SERVER_PORT} на ${DB_NAME}`);

  const A = await makeUser("a86@test.local", "Автор А");
  const B = await makeUser("b86@test.local", "Читатель Б");
  const C = await makeUser("c86@test.local"); // без display_name
  const sFull = await makeSynthesis(A, "Публичная 86", { visibility: "full" });
  const sPriv = await makeSynthesis(A, "Приватная 86", { visibility: "private" });
  const sShow = await makeSynthesis(A, "Витрина 86", { visibility: "showcase", showAuthor: true, showLogs: true, showPrompts: true, allowMeta: true });
  const sC = await makeSynthesis(C, "Без имени 86", { visibility: "full", showAuthor: true });

  /* ══ R3 ══ */
  console.log("── R3: гость ──");
  {
    const list = await req("GET", "/syntheses/public");
    ok(list.status === 200 && Array.isArray(list.body?.items), "GET /syntheses/public без cookie → 200");
    const ids = new Set(list.body.items.map((i) => i.id));
    ok(ids.has(sFull) && ids.has(sShow) && !ids.has(sPriv), "в каталоге full и showcase, приватной нет");
    ok(list.body.items.every((i) => !hasCost(i)), "элементы гостю без totalCostUsd");
    ok(list.body.items.every((i) => "visibility" in i && !("isPublic" in i)), "элементы несут visibility, производного isPublic нет (8.7)");
    const g = await req("GET", `/syntheses/${sFull}`);
    ok(g.status === 200 && g.body?.synthesis?.id === sFull, "GET /:id публичной гостю → 200");
    const s = g.body?.synthesis ?? {};
    ok(!hasCost(s), "без totalCostUsd/totalInputTokens/totalOutputTokens");
    ok(Array.isArray(s.sections) && s.sections.length === 5 && s.sections[0].key === "sum" && /Текст Сводка/.test(s.sections[0].htmlContent), "sections вложены (документ одним ответом, порядок sectionOrder)");
    ok(s.scope === "full" && s.isOwner === false && s.pausedState === null && s.pauseEstimates === null, "scope full, isOwner false, пауза null");
    ok(s.capsuleHtml.includes("Капсула") && s.philosophers[0] === "Кант", "капсула и философы на месте");
    const p = await req("GET", `/syntheses/${sPriv}`);
    ok(p.status === 403 && p.body?.code === "FORBIDDEN", "GET приватной гостю → 403 FORBIDDEN");
    const nf = await req("GET", `/syntheses/00000000-0000-0000-0000-000000000000`);
    ok(nf.status === 404, "несуществующий id гостю → 404");
    const plans = await req("GET", "/billing/plans");
    ok(plans.status === 200 && Array.isArray(plans.body?.plans), "GET /billing/plans без cookie → 200 { plans: [] }");
  }

  /* ══ R4 ══ */
  console.log("── R4: витрина ──");
  {
    const g = await req("GET", `/syntheses/${sShow}`);
    ok(g.status === 200 && g.body.synthesis.scope === "showcase" && !("sections" in g.body.synthesis) && g.body.synthesis.capsuleHtml.includes("Витрина 86"), "гость: капсула и метаданные, sections нет");
    ok(g.body.synthesis.title === "Витрина 86" && g.body.synthesis.method && g.body.synthesis.createdAt && g.body.synthesis.philosophers.length === 1, "гость: метаданные, философы, даты");
    const b = await req("GET", `/syntheses/${sShow}`, { cookie: B.cookie });
    ok(b.status === 200 && b.body.synthesis.scope === "showcase" && b.body.synthesis.pausedState === null, "чужой зарегистрированный: scope showcase, пауза null");
    const bs = await req("GET", `/syntheses/${sShow}/sections`, { cookie: B.cookie });
    ok(bs.status === 403 && bs.body.code === "FORBIDDEN", "чужой: GET /sections витрины → 403");
    const bc = await req("GET", `/syntheses/${sShow}/categories`, { cookie: B.cookie });
    const bt = await req("GET", `/syntheses/${sShow}/theses`, { cookie: B.cookie });
    const bgl = await req("GET", `/syntheses/${sShow}/glossary`, { cookie: B.cookie });
    const bm = await req("GET", `/syntheses/${sShow}/modes`, { cookie: B.cookie });
    const btr = await req("GET", `/syntheses/${sShow}/transforms`, { cookie: B.cookie });
    ok([bc, bt, bgl, bm, btr].every((r) => r.status === 403), "чужой: categories/theses/glossary/modes/transforms витрины → 403 ×5");
    const anc = await req("GET", `/syntheses/${sShow}/lineage/ancestors`, { cookie: B.cookie });
    ok(anc.status === 200, "чужой: lineage/ancestors витрины → 200 (метаданные)");
    const a = await req("GET", `/syntheses/${sShow}`, { cookie: A.cookie });
    ok(a.status === 200 && a.body.synthesis.scope === "full" && a.body.synthesis.isOwner === true && hasCost(a.body.synthesis), "владелец: scope full, isOwner, стоимость");
    const as = await req("GET", `/syntheses/${sShow}/sections`, { cookie: A.cookie });
    ok(as.status === 200 && as.body.sections.length === 5, "владелец: GET /sections витрины → 200 (5 разделов)");
  }

  /* ══ R5 ══ */
  console.log("── R5: авторство ──");
  {
    const b0 = await req("GET", `/syntheses/${sFull}`, { cookie: B.cookie });
    ok(b0.status === 200 && !("authorName" in b0.body.synthesis), "show_author=false → нет authorName даже зарегистрированному");
    const g0 = await req("GET", `/syntheses/${sFull}`);
    ok(!("authorName" in g0.body.synthesis), "…и гостю");
    await setVis(sFull, { show_author: true });
    const b1 = await req("GET", `/syntheses/${sFull}`, { cookie: B.cookie });
    ok(b1.body.synthesis.authorName === "Автор А", "show_author=true → authorName 'Автор А'");
    const g1 = await req("GET", `/syntheses/${sFull}`);
    ok(g1.body.synthesis.authorName === "Автор А", "…и гостю (имя не раскрывает содержания)");
    const list = await req("GET", "/syntheses/public");
    ok(list.body.items.find((i) => i.id === sFull)?.authorName === "Автор А" && !("authorName" in (list.body.items.find((i) => i.id === sC) ?? {})), "каталог: authorName у sFull, нет у концепции без display_name");
    const c = await req("GET", `/syntheses/${sC}`, { cookie: B.cookie });
    ok(c.status === 200 && !("authorName" in c.body.synthesis), "пустой display_name при show_author=true → поля нет");
    await setVis(sFull, { show_author: false });
  }

  /* ══ R6 ══ */
  console.log("── R6: логи ──");
  {
    const c1 = await req("GET", `/syntheses/${sFull}/logs/context`, { cookie: B.cookie });
    ok(c1.status === 200 && c1.body.entries.length === 1, "чужой при show_logs=true → /logs/context 200");
    const f1 = await req("GET", `/syntheses/${sFull}/logs/formatted`, { cookie: B.cookie });
    const g1 = await req("GET", `/syntheses/${sFull}/logs/generation`, { cookie: B.cookie });
    ok(f1.status === 200 && g1.status === 200, "…/formatted и /generation тоже 200");
    await setVis(sFull, { show_logs: false });
    const c2 = await req("GET", `/syntheses/${sFull}/logs/context`, { cookie: B.cookie });
    const f2 = await req("GET", `/syntheses/${sFull}/logs/formatted`, { cookie: B.cookie });
    const g2 = await req("GET", `/syntheses/${sFull}/logs/generation`, { cookie: B.cookie });
    ok(c2.status === 403 && f2.status === 403 && g2.status === 403 && c2.body.code === "FORBIDDEN", "show_logs=false → 403 на трёх путях логов");
    const p0 = await req("GET", `/syntheses/${sFull}/logs/prompts`, { cookie: B.cookie });
    ok(p0.status === 403, "show_prompts=false → /logs/prompts 403");
    await setVis(sFull, { show_prompts: true });
    const p1 = await req("GET", `/syntheses/${sFull}/logs/prompts`, { cookie: B.cookie });
    ok(p1.status === 200 && "text" in p1.body, "show_prompts=true → 200 { text }");
    ok((await req("GET", `/syntheses/${sFull}/logs/context`, { cookie: B.cookie })).status === 403, "show_prompts не открывает логи (независимые флаги)");
    for (const path of ["context", "formatted", "generation", "prompts"]) {
      const r = await req("GET", `/syntheses/${sFull}/logs/${path}`, { cookie: A.cookie });
      ok(r.status === 200, `владелец при show_logs=false: /logs/${path} → 200`);
    }
    const priv = await req("GET", `/syntheses/${sPriv}/logs/context`, { cookie: A.cookie });
    ok(priv.status === 200, "владелец приватной: логи 200");
    await setVis(sFull, { show_logs: true, show_prompts: false });
  }

  /* ══ R7 ══ */
  console.log("── R7: гашение флагов витриной ──");
  {
    ok(J(await dbVis(sShow)) === J({ visibility: "showcase", show_author: true, show_logs: true, show_prompts: true, allow_meta: true }), "витрина со ВСЕМИ флагами true в БД");
    const c = await req("GET", `/syntheses/${sShow}/logs/context`, { cookie: B.cookie });
    const p = await req("GET", `/syntheses/${sShow}/logs/prompts`, { cookie: B.cookie });
    ok(c.status === 403 && p.status === 403, "чужому 403 на /logs/context и /logs/prompts");
    const meta = await req("POST", "/syntheses", { cookie: B.cookie, body: { seed: "мета", sections: ["graph"], participants: [{ type: "synthesis", synthesisId: sShow }] } });
    ok(meta.status === 403 && meta.body.code === "META_NOT_ALLOWED" && meta.body.details?.title === "Витрина 86" && meta.body.details?.participants === sShow, "в участники не берётся → 403 META_NOT_ALLOWED с названием", meta.text);
    const g = await req("GET", `/syntheses/${sShow}`, { cookie: B.cookie });
    ok(g.body.synthesis.authorName === "Автор А" && g.body.synthesis.showLogs === true && g.body.synthesis.scope === "showcase", "authorName отдаётся; сырые флаги видны, scope showcase");
  }

  /* ══ R8 ══ */
  console.log("── R8: сохранность флагов при понижении ──");
  {
    await setVis(sFull, { show_author: true, show_logs: true, show_prompts: true, allow_meta: true });
    ok((await req("GET", `/syntheses/${sFull}/logs/prompts`, { cookie: B.cookie })).status === 200, "full + все true: prompts 200");
    const down = await req("PATCH", `/syntheses/${sFull}`, { cookie: A.cookie, body: { visibility: "showcase" } });
    ok(down.status === 200 && down.body.synthesis.visibility === "showcase" && down.body.synthesis.showPrompts === true, "PATCH → showcase; сырые флаги в ответе не сброшены");
    ok(J(await dbVis(sFull)) === J({ visibility: "showcase", show_author: true, show_logs: true, show_prompts: true, allow_meta: true }), "в БД флаги не тронуты");
    ok((await req("GET", `/syntheses/${sFull}/logs/prompts`, { cookie: B.cookie })).status === 403, "на витрине prompts → 403");
    const up = await req("PATCH", `/syntheses/${sFull}`, { cookie: A.cookie, body: { visibility: "full" } });
    ok(up.status === 200 && up.body.synthesis.visibility === "full", "PATCH → full обратно");
    ok((await req("GET", `/syntheses/${sFull}/logs/prompts`, { cookie: B.cookie })).status === 200 && (await req("GET", `/syntheses/${sFull}/logs/context`, { cookie: B.cookie })).status === 200, "флаги действуют снова без перенастройки");
    await setVis(sFull, { show_author: false, show_prompts: false });
  }

  /* ══ R9 ══ */
  console.log("── R9: PATCH без порядка ──");
  {
    const s9 = await makeSynthesis(A, "Порядок 86", { visibility: "full" });
    const r = await req("PATCH", `/syntheses/${s9}`, { cookie: A.cookie, body: { showPrompts: true, visibility: "showcase" } });
    ok(r.status === 200, "show_prompts=true + visibility='showcase' одним запросом → 200", r.text);
    const v = await dbVis(s9);
    ok(v.visibility === "showcase" && v.show_prompts === true, "оба значения сохранены");
    ok((await req("GET", `/syntheses/${s9}/logs/prompts`, { cookie: B.cookie })).status === 403, "действие погашено витриной (403)");
    const r2 = await req("PATCH", `/syntheses/${s9}`, { cookie: A.cookie, body: { visibility: "full" } });
    ok(r2.status === 200 && (await req("GET", `/syntheses/${s9}/logs/prompts`, { cookie: B.cookie })).status === 200, "после подъёма до full ранее поставленная галочка действует");
  }

  /* ══ R10 ══ */
  console.log("── R10: стоимость ──");
  {
    for (const [id, name] of [[sShow, "витрина"], [sFull, "публичная"]]) {
      const b = await req("GET", `/syntheses/${id}`, { cookie: B.cookie });
      ok(b.status === 200 && b.body.synthesis.totalCostUsd > 1.23 && b.body.synthesis.totalInputTokens === 1000 && b.body.synthesis.totalOutputTokens === 2000, `зарегистрированный видит стоимость и токены у ${name}`);
      const g = await req("GET", `/syntheses/${id}`);
      ok(g.status === 200 && !hasCost(g.body.synthesis), `гость не видит у ${name}`);
    }
    await setVis(sShow, { show_logs: false, show_prompts: false, show_author: false, allow_meta: false });
    const b = await req("GET", `/syntheses/${sShow}`, { cookie: B.cookie });
    ok(b.body.synthesis.totalCostUsd > 1.23, "стоимость видна при всех флагах false (флагом не управляется)");
    await setVis(sShow, { show_logs: true, show_prompts: true, show_author: true, allow_meta: true });
    const listB = await req("GET", "/syntheses/public", { cookie: B.cookie });
    const listG = await req("GET", "/syntheses/public");
    ok(listB.body.items.every((i) => typeof i.totalCostUsd === "number") && listG.body.items.every((i) => !("totalCostUsd" in i)), "каталог: зарегистрированному стоимость, гостю нет");
    const mine = await req("GET", "/syntheses", { cookie: A.cookie });
    ok(mine.status === 200 && mine.body.items.every((i) => typeof i.totalCostUsd === "number" && "visibility" in i), "GET /syntheses (свои): стоимость и visibility");
  }

  /* ══ R11 ══ */
  console.log("── R11: мета-синтез и allow_meta ──");
  {
    const body = (pid) => ({ seed: "мета-синтез 86", sections: ["graph"], participants: [{ type: "synthesis", synthesisId: pid }] });
    const r1 = await req("POST", "/syntheses", { cookie: B.cookie, body: body(sFull) });
    ok(r1.status === 201 && r1.body?.id && r1.body.status === "generating", "чужая с allow_meta=true → 201, синтез создан", r1.text);
    const lin = r1.body?.id ? await sqlc`SELECT parent_type, parent_synthesis_id FROM synthesis_lineage WHERE synthesis_id = ${r1.body.id} AND parent_type = 'synthesis'` : [];
    ok(lin.length === 1 && lin[0].parent_synthesis_id === sFull, "строка lineage parent_type='synthesis' есть");
    await setVis(sFull, { allow_meta: false });
    const r2 = await req("POST", "/syntheses", { cookie: B.cookie, body: body(sFull) });
    ok(r2.status === 403 && r2.body.code === "META_NOT_ALLOWED" && r2.body.details.title === "Публичная 86", "с allow_meta=false → 403 META_NOT_ALLOWED с названием");
    const cnt = await sqlc`SELECT count(*)::int AS n FROM syntheses WHERE user_id = ${B.id}`;
    ok(cnt[0].n === 1, "отказ не создал строки");
    const r3 = await req("POST", "/syntheses", { cookie: A.cookie, body: body(sFull) });
    ok(r3.status === 201 && r3.body?.id, "своя с allow_meta=false → 201, создаётся (владельцу не запрещено)", r3.text);
    const est = await req("POST", "/syntheses/estimate", { cookie: B.cookie, body: body(sFull) });
    // На пустой БД без посевов Registry конвейер оценки может упасть (500) —
    // проверяется лишь то, что allow_meta не стал гейтом оценки (не 403)
    ok(est.status !== 403 && est.body?.code !== "META_NOT_ALLOWED", `/estimate с недоступной по allow_meta концепцией — не 403 META_NOT_ALLOWED (оценка — не гейт; статус ${est.status})`);
    const rp = await req("POST", "/syntheses", { cookie: B.cookie, body: body(sPriv) });
    ok(rp.status === 403 && rp.body.code === "FORBIDDEN", "приватная чужая → 403 FORBIDDEN (не META)");
    await setVis(sFull, { allow_meta: true });
    await sleep(800); // фоновые генерации бьются о мёртвый ANTHROPIC_BASE_URL
  }

  /* ══ R12 ══ */
  console.log("── R12: PATCH ──");
  {
    const s12 = await makeSynthesis(A, "Патч 86", { visibility: "private" });
    const r = await req("PATCH", `/syntheses/${s12}`, { cookie: A.cookie, body: { visibility: "full", showAuthor: true, showLogs: false, showPrompts: true, allowMeta: false } });
    ok(r.status === 200 && r.body.synthesis.visibility === "full" && r.body.synthesis.showAuthor === true && r.body.synthesis.showLogs === false && r.body.synthesis.showPrompts === true && r.body.synthesis.allowMeta === false && !("isPublic" in r.body.synthesis) && r.body.synthesis.authorName === "Автор А", "владелец меняет visibility и флаги → отражено (без isPublic — 8.7, authorName)");
    ok(J(await dbVis(s12)) === J({ visibility: "full", show_author: true, show_logs: false, show_prompts: true, allow_meta: false }), "…и в БД");
    const f = await req("PATCH", `/syntheses/${s12}`, { cookie: B.cookie, body: { visibility: "private" } });
    ok(f.status === 403 && f.body.code === "FORBIDDEN", "чужой → 403");
    const bad = await req("PATCH", `/syntheses/${s12}`, { cookie: A.cookie, body: { visibility: "mine" } });
    ok(bad.status === 400 && bad.body.code === "VALIDATION_ERROR" && bad.body.details?.visibility, "visibility='mine' → 400 с details.visibility");
    const badFlag = await req("PATCH", `/syntheses/${s12}`, { cookie: A.cookie, body: { showLogs: "yes" } });
    ok(badFlag.status === 400 && badFlag.body.details?.showLogs, "флаг не boolean → 400 details.showLogs");
    // 8.7 (вариант б): синоним 8.6 снят — 400 details.isPublic, состояние не меняется
    const syn = await req("PATCH", `/syntheses/${s12}`, { cookie: A.cookie, body: { isPublic: false } });
    ok(syn.status === 400 && syn.body.details?.isPublic && (await dbVis(s12)).visibility === "full", "isPublic:false → 400 details.isPublic, ступень не тронута (8.7)");
    const both = await req("PATCH", `/syntheses/${s12}`, { cookie: A.cookie, body: { isPublic: true, visibility: "showcase" } });
    ok(both.status === 400 && both.body.details?.isPublic && (await dbVis(s12)).visibility === "full", "isPublic вместе с visibility → 400, ничего не записано");
    const empty = await req("PATCH", `/syntheses/${s12}`, { cookie: A.cookie, body: {} });
    ok(empty.status === 400, "пустое тело → 400");
    const guest = await req("PATCH", `/syntheses/${s12}`, { body: { visibility: "private" } });
    ok(guest.status === 401, "гость PATCH → 401");
  }

  /* ══ R13 ══ */
  console.log("── R13: экспорт ──");
  {
    await setVis(sFull, { show_logs: false });
    const e1 = await req("GET", `/syntheses/${sFull}/export/html`, { cookie: B.cookie });
    ok(e1.status === 200 && /<!DOCTYPE html>/.test(e1.text), "невладелец при show_logs=false получает файл");
    ok(!/philosynth-log-raw/.test(e1.text) && !/Лог контекста и генерации/.test(e1.text), "…без блока лога");
    const st1 = JSON.parse(e1.text.match(/<script type="application\/json" id="philosynth-state">\n([\s\S]*?)\n<\/script>/)[1]);
    ok(Array.isArray(st1.genLog) && st1.genLog.length === 0 && st1.ctxLog.length === 0 && st1.genCommon === null, "…embedded genLog/ctxLog пусты");
    // 8.6 (пересмотр): футер документа восстановлен в экспорте (утрачен 4.2) —
    // стоимость остаётся в файле и без лога, как велит п.10
    ok(/id="footerCost"[^<]*Токены: 1[\s\u00a0 ]000 вх\. \+ 2[\s\u00a0 ]000 вых\. · Стоимость: \$1\.2346 \(123\.46¢\)/.test(e1.text), "…стоимость и токены в футере остались (не под флагом)", e1.text.match(/id="footerCost"[^<]*/)?.[0]);
    ok(/id="footerPhil">Кант</.test(e1.text) && /СИНТЕЗ ЗАВЕРШЁН/.test(e1.text), "…футер: философы и штамп");
    ok(/PS-\d{4}-T86/.test(e1.text) && /Публичная 86/.test(e1.text) && /Текст Сводка/.test(e1.text), "…документ цел (номер, заголовок, разделы)");
    await setVis(sFull, { show_logs: true });
    const e2 = await req("GET", `/syntheses/${sFull}/export/html`, { cookie: B.cookie });
    const st2 = JSON.parse(e2.text.match(/<script type="application\/json" id="philosynth-state">\n([\s\S]*?)\n<\/script>/)[1]);
    ok(e2.status === 200 && /philosynth-log-raw/.test(e2.text) && st2.genLog.length === 1, "при show_logs=true — файл с логом и genLog");
    const own = await req("GET", `/syntheses/${sFull}/export/html`, { cookie: A.cookie });
    await setVis(sFull, { show_logs: false });
    const own2 = await req("GET", `/syntheses/${sFull}/export/html`, { cookie: A.cookie });
    ok(own.status === 200 && own2.status === 200 && /philosynth-log-raw/.test(own2.text), "владелец получает лог при любом флаге");
    await setVis(sFull, { show_logs: true });
    const sh = await req("GET", `/syntheses/${sShow}/export/html`, { cookie: B.cookie });
    const shmd = await req("GET", `/syntheses/${sShow}/export/md`, { cookie: B.cookie });
    ok(sh.status === 403 && shmd.status === 403, "scope='showcase' → 403 (html и md)");
    ok((await req("GET", `/syntheses/${sShow}/export/md`, { cookie: A.cookie })).status === 200, "владелец экспортирует витрину");
    const g = await req("GET", `/syntheses/${sFull}/export/html`);
    ok(g.status === 401, "гость: экспорт → 401");
  }

  /* ══ R14 ══ */
  console.log("── R14: edge — гость вне трёх путей, просроченная сессия ──");
  {
    const paths = [["GET", "/syntheses"], ["GET", `/syntheses/${sFull}/sections`], ["GET", `/syntheses/${sFull}/categories`], ["GET", `/syntheses/${sFull}/logs/context`], ["GET", `/syntheses/${sFull}/export/json`], ["GET", `/syntheses/${sFull}/lineage/ancestors`], ["POST", "/syntheses"], ["POST", "/syntheses/estimate"], ["GET", "/billing/subscription"], ["GET", "/billing/usage"], ["GET", "/auth/me"], ["POST", `/syntheses/${sFull}/duplicate`], ["DELETE", `/syntheses/${sFull}`]];
    let all401 = true; const wrong = [];
    for (const [m, p] of paths) { const r = await req(m, p, { body: m === "POST" ? {} : undefined }); if (r.status !== 401) { all401 = false; wrong.push(`${m} ${p} → ${r.status}`); } }
    ok(all401, `гость на ${paths.length} путях вне трёх открытых → 401`, wrong.join("; "));
    // просроченная сессия
    const token = randomBytes(32).toString("base64url");
    const sid = createHash("sha256").update(token).digest("hex");
    await sqlc`INSERT INTO sessions (id, user_id, expires_at) VALUES (${sid}, ${B.id}, now() - interval '1 day')`;
    const dead = `${COOKIE}=${token}`;
    const r1 = await req("GET", `/syntheses/${sFull}`, { cookie: dead });
    ok(r1.status === 200 && !hasCost(r1.body.synthesis) && r1.body.synthesis.isOwner === false, "просроченная cookie на GET /:id → 200 как гость (без стоимости), не 401");
    const sc = r1.headers.get("set-cookie") ?? "";
    ok(/philosynth_session=;|Max-Age=0|Expires=Thu, 01 Jan 1970/.test(sc), "мёртвый cookie подчищен (Set-Cookie)");
    const gone = await sqlc`SELECT 1 FROM sessions WHERE id = ${sid}`;
    ok(gone.length === 0, "просроченная сессия удалена из БД");
    const r2 = await req("GET", "/syntheses/public", { cookie: dead });
    ok(r2.status === 200 && r2.body.items.every((i) => !("totalCostUsd" in i)), "просроченная cookie на /public → гостевой список");
    const r3 = await req("GET", "/syntheses", { cookie: dead });
    ok(r3.status === 401, "просроченная cookie на закрытом пути → 401 (requireAuth не тронут)");
    const live = await req("GET", `/syntheses/${sFull}`, { cookie: B.cookie });
    ok(live.status === 200 && hasCost(live.body.synthesis), "живая сессия на гостевом пути распознана (стоимость видна)");
  }
} catch (err) {
  failed++; fails.push("исключение сценария");
  console.error("  ✗ исключение сценария:", err?.stack ?? err);
  console.error("  лог сервера (хвост):", serverLog.slice(-1500));
} finally {
  console.log(`\nИТОГ test-86-requests2-14: ${passed} ✓ / ${failed} ✗${failed ? "\n  " + fails.join("\n  ") : ""}`);
  if (serverProc) { try { process.kill(-serverProc.pid, "SIGKILL"); } catch { try { serverProc.kill("SIGKILL"); } catch {} } }
  try { await sqlc.end({ timeout: 2 }); } catch {}
  setTimeout(() => process.exit(failed ? 1 : 0), 300);
}
