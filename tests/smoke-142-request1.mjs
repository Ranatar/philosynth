/**
 * smoke-142-request1 — первый запрос беседы 14.2 (хранимые тексты и их показ:
 * Д-54 причина паузы полями, Д-55 parseWarnings кодами, Д-57 родословная без
 * заглушек, Д-59 видимые заголовки подразделов, Д-62 подписи журнала кодами;
 * из 14.1 — Д-76 плашка, Д-77 locale Stripe; клиент — чистые помощники).
 * Живой сервер :3142 + PG16/Redis; мок Claude и браузер не нужны (браузерные
 * проверки — запросы 6–7 беседы).
 *
 *   A. В процессе: parse-warnings (русская сборка ≡ фразам 11.1/11.2/12.3/14.1,
 *      en без кириллицы, строка как есть, via-префиксы, коды чистки, разбор
 *      metadata); gen-log-labels (подписи и ошибки под ru/en, запись без кода как
 *      есть); pauseReasonFields (max-tokens/stuck/pre-stream); lineage —
 *      санация без заглушек, fileNodeName под en/de/ru, выгрузка — русская
 *      заглушка; sectionTitlesOf на образце с ⏫ и якорями; клиентские чистые
 *      помощники — pauseReasonText (новая/старая пауза), subsectionTitleFrom,
 *      documentSectionTitle, placeholderNameOf (ru/en/без хвоста), stripeLocale.
 *   B. Живой сервер: генлог с новой записью (коды) и старой (фразы) → GET
 *      /logs/formatted под en: английские подпись/ошибка/предупреждение и старая
 *      запись как есть; под ru — побайтно прежние русские фразы; GET /sections и
 *      /sections/:key несут sectionTitle/subsectionTitles без ⏫, parseWarnings —
 *      фразы на языке запроса; PATCH подраздела отдаёт subsectionTitles; пауза
 *      createPausedState(pauseReasonFields) → GET /:id без reason, с числом;
 *      старая пауза с reason — читается как прежде.
 *
 * Запуск из корня:  node_modules/.bin/tsx tests/smoke-142-request1.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { openSync } from "node:fs";
import postgres from "postgres";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3142;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CYR = /[А-Яа-яЁё]/;
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 900) : ""}`); }
}
const TAG = Math.random().toString(36).slice(2, 8);

/* ── Модули в процессе ───────────────────────────────────────────────── */
const LOC = await import("../server/i18n/locale.ts");
LOC.installServerCatalogProvider();
const PW = await import("../server/services/parse-warnings.ts");
const GL = await import("../server/services/gen-log-labels.ts");
const SM = await import("../server/services/streaming-manager.ts");
const LS = await import("../server/services/lineage-service.ts");
const HP = await import("../server/utils/html-parser.ts");
const GS = await import("../server/services/generation-service.ts");
const PM = await import("../client/src/components/synthesis/PauseModal.tsx");
const ST = await import("../client/src/utils/subsection-titles.ts");
const RE = await import("../client/src/utils/subsection-rich-editor.ts");
const STR = await import("../client/src/utils/stripe.ts");
const I18N = await import("../client/src/i18n/i18n-store.ts");
// клиентское хранилище языка ставит СВОЙ провайдер каталога при импорте — вернуть серверный (ALS)
LOC.installServerCatalogProvider();
const ru = (f) => LOC.runWithLocale("ru", f);
const en = (f) => LOC.runWithLocale("en", f);
const de = (f) => LOC.runWithLocale("de", f);

const procs = [];
function sp(args, cwd, env, logFile) {
  const log = openSync(logFile, "w");
  const p = spawn(process.execPath, args, { cwd, detached: true, stdio: ["ignore", log, log], env: { ...process.env, ...env } });
  procs.push(p);
  return p;
}
async function isUp(url) { try { return (await fetch(url)).status < 500; } catch { return false; } }
async function waitUp(url, what) { for (let i = 0; i < 120; i++) { if (await isUp(url)) return; await sleep(500); } throw new Error(`${what} не поднялся`); }

const ids = [];
const userIds = [];
async function api(path, init = {}, cookie, lang) {
  const headers = { ...(init.headers ?? {}) };
  if (cookie) headers.cookie = cookie;
  if (lang) headers["accept-language"] = lang;
  const r = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}
async function account(tag, uiLocale = null) {
  const email = `s142-${tag}-${Date.now()}@example.com`, password = "password-142";
  const rr = await api("/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password, displayName: "Проверяющий" }) });
  if (rr.status !== 201 && rr.status !== 200) throw new Error(`register ${rr.status}: ${rr.text}`);
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  userIds.push(u.id);
  if (uiLocale) await sql`update users set ui_locale=${uiLocale} where id=${u.id}`;
  return { cookie, email, password, id: u.id };
}
const SEC = (title, subs) =>
  `<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">${title}<a href="#docTOC" class="toc-back-btn" title="К содержанию">⏫</a></div><div class="doc-content">${subs.map(([k, h]) => `<div data-section="${k}"><a id="subsec-sum-${k.replace(/\W/g, "_")}"></a>${h ? `<h4>${h}<a href="#docTOC" class="toc-back-btn">⏫</a></h4>` : ""}<p>text ${k}</p></div>`).join("")}</div></div>`;
async function mkSynth(userId, title, sectionHtml, order = ["sum"]) {
  const [row] = await sql`insert into syntheses (user_id, seed, title, status, section_order)
    values (${userId}, ${"зерно " + TAG}, ${title}, 'ready', ${sql.json(order)}) returning id`;
  ids.push(row.id);
  await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${row.id}, 'sum', 1, 'Резюме', ${sectionHtml})`;
  return row.id;
}

try {
  /* ══ A. В процессе ══════════════════════════════════════════════════ */
  console.log("A. В процессе");

  // A1–A6: parse-warnings (Д-55)
  const byPos = PW.pw("subsection_by_position", { index: 2, attr: "Summary", name: "Сводная таблица" });
  ok(PW.renderParseWarningsRu([byPos])[0] === 'подраздел 2 опознан по месту: атрибут "Summary" вместо "Сводная таблица"', "A1 subsection_by_position под ru ≡ фразе 11.2");
  const byPosEn = en(() => PW.renderParseWarning(byPos));
  ok(!CYR.test(byPosEn.replace(/Сводная таблица/g, "")) && /Summary/.test(byPosEn), "A2 subsection_by_position под en — переводом, параметры как есть", byPosEn);
  ok(en(() => PW.renderParseWarning("старая строка")) === "старая строка" && ru(() => PW.renderParseWarningsRu([PW.withVia(byPos, "intra")])[0]).startsWith("intra-контекст: "), "A3 строка как есть; via=intra даёт префикс");
  const missing = PW.pw("subsections_missing", { names: ["Второй подраздел"], expected: 3, marked: 2 });
  ok(PW.renderParseWarningsRu([missing])[0] === "модель завершила ответ, не написав подраздел «Второй подраздел» (ожидалось подразделов: 3, размечено: 2). Раздел сохранён как есть — перегенерируйте его, если подраздел нужен"
    && !CYR.test(en(() => PW.renderParseWarning(missing)).replace(/Второй подраздел/g, "")), "A4 subsections_missing: ru ≡ фразе 12.3, en — переводом");
  const note = GS.missingSubsectionsNote('<div data-section="A"><h4>A</h4></div><div data-section="C"><h4>C</h4></div>', ["A", "B", "C"]);
  ok(note && note.code === "subsections_missing" && J(note.params.names) === '["B"]' && GS.missingSubsectionsNote('<div data-section="A"></div>', ["A"]) === null, "A5 missingSubsectionsNote отдаёт код с параметрами", note);
  const san = PW.sanitizeParseWarnings({ dropped: ["script"], unwrapped: ["font"], renamed: ["b→strong"], classesStripped: ["p.x"], attrsStripped: ["onclick"], changed: true });
  const sanRu = PW.renderParseWarningsRu(san);
  ok(san.length === 5 && sanRu[0] === "чистка разметки ответа модели: Удалены вместе с содержимым: <script>" && sanRu[2] === "чистка разметки ответа модели: Заменены тегами набора: <b> → <strong>" && en(() => PW.renderParseWarnings(san)).every((w) => !CYR.test(w)), "A6 коды чистки: ru ≡ фразам 14.1 с префиксом, en — переводом", sanRu);
  const fromMeta = PW.parseWarningsFromMetadata(["старая", { code: "graph_parse_failed", params: { message: "x" } }, { code: "unknown_future" }, 7, null]);
  ok(fromMeta.length === 3 && fromMeta[0] === "старая" && fromMeta[1].code === "graph_parse_failed" && en(() => PW.renderParseWarning(fromMeta[2])) === "unknown_future", "A7 parseWarningsFromMetadata: строки, коды, неизвестный код — самим кодом, мусор отброшен");

  // A8–A10: gen-log-labels (Д-62)
  ok(GL.renderLogLabel({ kind: "regen", section: "graph" }) === "Граф категорий [перегенерация]" && en(() => GL.renderLogLabel({ kind: "regen", section: "graph" })) === "Category graph [regeneration]"
    && GL.renderLogLabel({ kind: "pass", sections: ["sum", "graph"], resume: true }) === "Исполнительное резюме + Граф категорий [возобновление]", "A8 подписи журнала по коду: ru/en");
  const step = { kind: "element_step", section: "theses", elementKind: "thesis", elementName: "Т-1", field: "formulation", recNum: "5", recRound: 2 };
  ok(GL.renderLogLabel(step) === "Корпус тезисов → тезис «Т-1», формулировка [по рекомендации 5, раунд 2]" && !CYR.test(en(() => GL.renderLogLabel(step)).replace(/Т-1/g, ""))
    && en(() => GL.renderLogLabel({ kind: "mode", modeKey: "adversarial", modeTitle: "⚔ Оппонент", param: "Кант", cascade: true })) === "⚔ Opponent · Кант [cascade]", "A9 шаг элемента и режим: вид/поле/название режима — данными (tData), параметры как есть");
  ok(GL.logLabelText({}, "старая подпись") === "старая подпись" && GL.logLabelText({ logLabel: { kind: "nope" } }, "как есть") === "как есть"
    && GL.renderLogError({ code: "element_too_long", maxChars: 400 }, null) === "ответ модели длиннее 400 знаков" && en(() => GL.renderLogError({ code: "element_empty_response" }, null)) === "the model returned an empty response"
    && GL.renderLogError({ code: "stream", kind: "pre-stream", raw: "overloaded_error" }, "x") === "overloaded_error" && GL.renderLogError(null, "старая ошибка") === "старая ошибка", "A10 запись без кода / неизвестный код — как есть; ошибки службы по коду; сырое API как есть");

  // A11: pauseReasonFields (Д-54)
  const eMax = new SM.StreamError("Ответ оборван по лимиту токенов", "max-tokens"); eMax.maxTokensUsed = 12000;
  const fMax = SM.pauseReasonFields(eMax), fPre = SM.pauseReasonFields(new SM.StreamError("overloaded_error: 529", "pre-stream")), fStuck = SM.pauseReasonFields(new SM.StreamError("This operation was aborted", "stuck"));
  ok(J(fMax) === J({ reasonKind: "max-tokens", maxTokensUsed: 12000 }) && J(fPre) === J({ reasonKind: "pre-stream", rawMessage: "overloaded_error: 529" }) && fStuck.reasonKind === "stuck" && typeof fStuck.stuckSec === "number" && fStuck.rawMessage === undefined && !("reason" in fMax), "A11 pauseReasonFields: числа и сырое сообщение полями, фразы нет", { fMax, fPre, fStuck });

  // A12–A14: lineage (Д-57)
  const tree = LS.sanitizeFileGenealogy({ type: "concept", name: "Корень", participants: [{ type: "concept" }, { type: "concept", name: "[безымянная концепция]" }, { type: "philosopher", name: "Кант" }, { type: "philosopher", name: " " }] });
  const parts = tree.participants;
  ok(parts.length === 4 && parts[0].name === "" && parts[0].unnamed === true && parts[1].unnamed === true && parts[2].name === "Кант" && !parts[2].unnamed && parts[3].unnamed === true && !J(tree).includes("безымянн"), "A12 sanitizeFileGenealogy: пустое имя + unnamed, старая заглушка снята", parts);
  ok(en(() => LS.fileNodeName(parts[0])) === "[unnamed concept]" && de(() => LS.fileNodeName(parts[3])) === "[unbenannter Philosoph]" && ru(() => LS.fileNodeName(parts[1])) === "[безымянная концепция]" && LS.fileNodeNameRu(parts[0]) === "[безымянная концепция]", "A13 fileNodeName: подстановка на языке запроса; fileNodeNameRu — русская заглушка для выгрузки");
  const exp = LS.lineageTreeToFileGenealogy({ type: "synthesis", name: "x", depth: 0, children: [{ type: "synthesis", name: "[unnamed concept]", unnamed: true, depth: 1, children: [], fromFile: true }, { type: "philosopher", name: "Кант", depth: 1, children: [] }] });
  ok(exp.participants[0].name === "[безымянная концепция]" && exp.participants[1].name === "Кант", "A14 lineageTreeToFileGenealogy (выгрузка): безымянный → русская заглушка", exp.participants);

  // A15: sectionTitlesOf (Д-59)
  const t = HP.sectionTitlesOf(SEC("Executive summary", [["Цели и метод", "Goals and method"], ["Без заголовка", ""]]));
  ok(t.sectionTitle === "Executive summary" && t.subsectionTitles["Цели и метод"] === "Goals and method" && t.subsectionTitles["Без заголовка"] === "Без заголовка" && !/⏫/.test(J(t)) && HP.sectionTitlesOf("").sectionTitle === null, "A15 sectionTitlesOf: .section-title и <h4> без ⏫/якорей; без <h4> — ключ", t);

  // A16–A20: клиентские чистые помощники
  void I18N;
  const psNew = { kind: "gen", passIdx: 0, sectionKeys: ["graph"], sectionLabel: "Граф", isPartial: false, reasonKind: "max-tokens", maxTokensUsed: 8000, timestamp: 1, partialSubsections: [], expectedSubsections: [], completedPasses: [], genParams: {} };
  const psOld = { ...psNew, reasonKind: "max-tokens", reason: "Старая фраза паузы как есть" };
  const psRaw = { ...psNew, reasonKind: "pre-stream", maxTokensUsed: undefined, rawMessage: "HTTP 529 overloaded" };
  const rNew = PM.pauseReasonText(psNew), rOld = PM.pauseReasonText(psOld), rRaw = PM.pauseReasonText(psRaw);
  ok(/^Ответ оборван по лимиту токенов \(max_tokens = 8.000\)\. Раздел слишком объёмный\.$/.test(rNew.text) && rNew.detail === null, "A16 pauseReasonText(max-tokens): фраза по reasonKind с числом подстановкой", rNew);
  ok(rOld.text === "Старая фраза паузы как есть" && rOld.detail === null, "A17 старая пауза (reason без новых полей) — текст как есть", rOld);
  ok(rRaw.text === "Сбой сервера API." && rRaw.detail === "HTTP 529 overloaded", "A18 pre-stream с 5xx: фраза + сырое сообщение деталью", rRaw);
  ok(ST.subsectionTitleFrom({ "Цели и метод": "Goals and method" }, "Цели и метод") === "Goals and method" && ST.subsectionTitleFrom({}, "Ключ") === "Ключ" && ST.subsectionTitleFrom(undefined, "Ключ") === "Ключ"
    && ST.documentSectionTitle({ key: "sum", sectionTitle: "Executive summary", title: "x" }) === "Executive summary" && ST.documentSectionTitle({ key: "sum", sectionTitle: null, title: "x" }) === "Исполнительное резюме", "A19 subsectionTitleFrom / documentSectionTitle: заголовок либо ключ / tData(KEY_LABELS)");
  ok(RE.placeholderNameOf("подраздел 1: § 1.1 Вложенный — правится отдельно, строку не удалять") === "§ 1.1 Вложенный"
    && RE.placeholderNameOf("подраздел 2: Nested — edited separately, do not delete this line") === "Nested"
    && RE.placeholderNameOf("подраздел 3: Критика — границы — wird separat bearbeitet, Zeile nicht löschen") === "Критика — границы"
    && RE.placeholderNameOf("подраздел 4: Без хвоста") === "Без хвоста", "A20 placeholderNameOf: русский хвост, en-хвост, de-хвост (по последнему тире, тире в имени целое), без хвоста");
  ok(["ru", "en", "de"].includes(STR.stripeLocale()), "A21 stripeLocale — язык хранилища интерфейса (ru/en/de)", STR.stripeLocale());

  /* ══ B. Живой сервер ════════════════════════════════════════════════ */
  console.log("\nB. Живой сервер");
  spawnSync("sh", ["-c", `ps -eo pid,args | awk '/[s]erver\\/index|tsx index.ts/ && /${PORT}/ {print $1}' | xargs -r kill -9`]);
  if (await isUp(`${BASE}/health`)) throw new Error(`порт ${PORT} занят чужим сервером`);
  sp(["--import", "tsx", "index.ts"], ROOT + "server", {
    PORT: String(PORT), RATE_LIMIT_HTTP_PER_MINUTE: "600", RATE_LIMIT_MAIL_PER_HOUR: "20", TRUST_PROXY: "false", HOST: "",
    MAIL_TRANSPORT: "console", ANTHROPIC_API_KEY: "", BILLING_ENFORCE: "false", API_KEY_ENCRYPTION_SECRET: "s142-" + "s".repeat(40),
    CLIENT_ORIGIN: "http://127.0.0.1:5199", STRIPE_SECRET_KEY: "", STRIPE_API_BASE: "https://api.stripe.com",
  }, "/tmp/s142-server.log");
  await waitUp(`${BASE}/health`, "сервер");
  spawnSync("sh", ["-c", "redis-cli --scan --pattern 'rate_limit:*' | xargs -r redis-cli del >/dev/null"]);

  const owner = await account("owner", "en");
  const sid = await mkSynth(owner.id, `S-${TAG}`, SEC("Executive summary", [["Цели и метод", "Goals and method"], ["Без заголовка", ""]]), ["sum", "graph"]);
  const base = Date.now() - 60_000;
  await sql`insert into generation_log (synthesis_id, section_key, section_label, log_type, source, status, error_message, metadata, created_at) values
    (${sid}, 'graph', 'Граф Категорий Концепции [перегенерация]', 'generation', 'edit', 'error', 'модель вернула пустой ответ',
     ${sql.json({ logLabel: { kind: "regen", section: "graph" }, error: { code: "element_empty_response" }, parseWarnings: [{ code: "subsections_missing", params: { names: ["Topology table"], expected: 3, marked: 2 } }], expectedSubsections: [], subsections: [] })}, ${new Date(base)}),
    (${sid}, 'sum', 'Старая подпись 11.1', 'generation', 'edit', 'error', 'старая ошибка как есть',
     ${sql.json({ parseWarnings: ["старое предупреждение как есть"], expectedSubsections: [], subsections: [] })}, ${new Date(base + 1000)})`;

  // B1–B3: /logs/formatted под en и ru (Д-62/Д-55)
  const logEn = await api(`/syntheses/${sid}/logs/formatted`, {}, owner.cookie, "en");
  const tEn = logEn.json?.text ?? "";
  ok(logEn.status === 200 && tEn.includes("═══ CATEGORY GRAPH [REGENERATION] ═══") && tEn.includes("the model returned an empty response") && /without writing subsection “Topology table”/.test(tEn), "B1 /logs/formatted en-владельцу: подпись, ошибка, предупреждение новой записи — по кодам, по-английски", tEn.slice(0, 600));
  ok(tEn.includes("═══ СТАРАЯ ПОДПИСЬ 11.1 ═══") && tEn.includes("старая ошибка как есть") && tEn.includes("старое предупреждение как есть"), "B2 старая запись без кода — как есть при en");
  await sql`update users set ui_locale='ru' where id=${owner.id}`;
  const logRu = await api(`/syntheses/${sid}/logs/formatted`, {}, owner.cookie, "ru");
  const tRu = logRu.json?.text ?? "";
  ok(tRu.includes("═══ ГРАФ КАТЕГОРИЙ [ПЕРЕГЕНЕРАЦИЯ] ═══") && tRu.includes("ОШИБКА: модель вернула пустой ответ") && tRu.includes("не написав подраздел «Topology table» (ожидалось подразделов: 3, размечено: 2). Раздел сохранён как есть — перегенерируйте его, если подраздел нужен") && tRu.includes("═══ СТАРАЯ ПОДПИСЬ 11.1 ═══"), "B3 под ru — русские фразы по кодам дословно 12.3/прежние, старая запись как есть", tRu.slice(0, 600));
  await sql`update users set ui_locale='en' where id=${owner.id}`;

  // B4–B6: /sections и /sections/:key (Д-59, Д-55)
  const list = await api(`/syntheses/${sid}/sections`, {}, owner.cookie, "en");
  const sum = list.json?.sections?.find((s) => s.key === "sum");
  ok(list.status === 200 && sum && sum.sectionTitle === "Executive summary" && sum.subsectionTitles?.["Цели и метод"] === "Goals and method" && sum.subsectionTitles?.["Без заголовка"] === "Без заголовка" && J(sum.subsections) === J(["Цели и метод", "Без заголовка"]) && !/⏫/.test(J(sum)), "B4 GET /sections: sectionTitle и subsectionTitles без ⏫, ключи subsections не тронуты", sum);
  const full = await api(`/syntheses/${sid}/sections/graph`, {}, owner.cookie, "en").then(async (r) => r.status === 404 ? await api(`/syntheses/${sid}/sections/sum`, {}, owner.cookie, "en") : r);
  const fullSum = await api(`/syntheses/${sid}/sections/sum`, {}, owner.cookie, "en");
  ok(fullSum.status === 200 && fullSum.json?.section?.sectionTitle === "Executive summary" && fullSum.json?.section?.subsectionTitles?.["Цели и метод"] === "Goals and method" && Array.isArray(fullSum.json?.section?.parseWarnings) && fullSum.json.section.parseWarnings[0] === "старое предупреждение как есть", "B5 GET /sections/sum: заголовки + parseWarnings старой записи как есть", fullSum.json?.section && { ...fullSum.json.section, htmlContent: "…" });
  void full;
  await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${sid}, 'graph', 2, 'Граф', ${SEC("Category graph", [["Таблица категорий", "Category table"]])})`;
  const fullGraphEn = await api(`/syntheses/${sid}/sections/graph`, {}, owner.cookie, "en");
  await sql`update users set ui_locale='ru' where id=${owner.id}`;
  const fullGraphRu = await api(`/syntheses/${sid}/sections/graph`, {}, owner.cookie, "ru");
  await sql`update users set ui_locale='en' where id=${owner.id}`;
  const pwEn = fullGraphEn.json?.section?.parseWarnings ?? [], pwRu = fullGraphRu.json?.section?.parseWarnings ?? [];
  ok(pwEn.length === 1 && /without writing subsection “Topology table”/.test(pwEn[0]) && pwRu[0] === "модель завершила ответ, не написав подраздел «Topology table» (ожидалось подразделов: 3, размечено: 2). Раздел сохранён как есть — перегенерируйте его, если подраздел нужен", "B6 parseWarnings по коду: en — переводом, ru — дословно 12.3", { pwEn, pwRu });

  // B7: PATCH подраздела — ответ несёт subsectionTitles (Д-59)
  const src = await api(`/syntheses/${sid}/sections/sum/subsections/${encodeURIComponent("Цели и метод")}`, {}, owner.cookie, "en");
  const patch = await api(`/syntheses/${sid}/sections/sum/subsections/${encodeURIComponent("Цели и метод")}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: J({ html: (src.json?.html ?? "").replace("text Цели и метод", "edited") }) }, owner.cookie, "en");
  ok(src.status === 200 && patch.status === 200 && patch.json?.changed === true && patch.json?.section?.subsectionTitles?.["Цели и метод"] === "Goals and method" && J(patch.json?.section?.subsections) === J(["Цели и метод", "Без заголовка"]), "B7 PATCH подраздела: section.subsectionTitles рядом с subsections", patch.json?.section && { ...patch.json.section, htmlContent: "…" });

  // B8–B9: пауза полями и старая пауза (Д-54)
  const PR = await import("../server/services/pause-resume-service.ts");
  const e = new SM.StreamError("Ответ оборван по лимиту токенов (max_tokens = 8 000).", "max-tokens"); e.maxTokensUsed = 8000;
  await PR.createPausedState(sid, "gen", { passIdx: 1, sectionKeys: ["graph"], sectionLabel: "Граф Категорий Концепции", isPartial: false, ...SM.pauseReasonFields(e), partialSubsections: [], expectedSubsections: [], completedPasses: [["sum"]], genParams: {} });
  const got = await api(`/syntheses/${sid}`, {}, owner.cookie, "en");
  const ps = got.json?.synthesis?.pausedState ?? got.json?.pausedState;
  ok(got.status === 200 && ps && ps.reason === undefined && ps.reasonKind === "max-tokens" && ps.maxTokensUsed === 8000 && J(ps.sectionKeys) === J(["graph"]), "B8 GET /:id владельцу: pausedState без reason, с reasonKind и числом", ps);
  const [mk] = await sql`select metadata from generation_log where synthesis_id=${sid} and log_type='pause_marker'`;
  ok(mk && mk.metadata.reason === undefined && mk.metadata.maxTokensUsed === 8000 && J(mk.metadata.logLabel) === J({ kind: "pass", sections: ["graph"] }), "B9 pause_marker: без фразы, с числом и кодом подписи", mk?.metadata);
  await sql`update syntheses set paused_state=${sql.json({ ...ps, reason: "Старая фраза паузы как есть" })} where id=${sid}`;
  const gotOld = await api(`/syntheses/${sid}`, {}, owner.cookie, "en");
  const psOld2 = gotOld.json?.synthesis?.pausedState ?? gotOld.json?.pausedState;
  ok(psOld2?.reason === "Старая фраза паузы как есть" && PM.pauseReasonText(psOld2).text === "Старая фраза паузы как есть", "B10 старая пауза с reason читается как прежде и показывается как есть", psOld2);
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
} finally {
  console.log(`\nИТОГ: ${passed} ✓, ${failed} ✗${fails.length ? "\n  " + fails.join("\n  ") : ""}`);
  try {
    for (const id of ids) await sql`delete from syntheses where id=${id}`;
    for (const id of userIds) await sql`delete from syntheses where user_id=${id}`;
    for (const id of userIds) await sql`delete from mail_outbox where to_email in (select email from users where id=${id})`;
    for (const id of userIds) await sql`delete from users where id=${id}`;
  } catch (e2) { console.error("уборка:", e2); }
  for (const p of procs) { try { process.kill(-p.pid, "SIGKILL"); } catch {} }
  await Promise.race([sql.end(), sleep(2000)]);
  process.exit(failed ? 1 : 0);
}
