/**
 * Дымовой прогон беседы 18.2, первый запрос (поиск в каталоге — клиент):
 *   A — чистые функции client/src/utils/catalog-search: разбор адреса,
 *       единственный сериализатор (адрес и запрос), круг без потерь,
 *       умолчания, прощающее чтение, статус и дата только на «моих»,
 *       запертый список «/explore», счёт и сброс фильтров, подсказки
 *       пустой выдачи, ссылка к термину;
 *   B — подсветка: SearchFragmentView рисует куски ТЕКСТОМ (разметка в
 *       куске экранируется, совпадение — в <mark>), «похожее» помечено;
 *   C — живьём: НАСТОЯЩАЯ функция клиента api/search.searchSyntheses
 *       (fetch подменён на app.request) против маршрута 18.1 — каждое
 *       состояние, которое умеет собрать панель, сервер принимает (200) и
 *       понимает так же (эхо `query` ≡ состоянию); три вкладки; гость на
 *       «/explore»; фрагмент и термин в выдаче; пустая выдача; ссылка,
 *       поправленная руками, до сервера за 400 не доходит;
 *   D — переход к термину: ссылка карточки несёт id и ключ имени, ключ
 *       находит строку в таблице определений образца.
 *
 * Запуск (из корня, PG/Redis подняты, миграции до 0020, сиды на месте):
 *   node_modules/.bin/tsx tests/smoke-182-request1.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { Hono } from "hono";

const ROOT = new URL("../", import.meta.url).pathname;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
process.env.NODE_ENV = "development";
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 1500) : ""}`); }
}
const TAG = "s182" + Math.random().toString(36).slice(2, 7);
const rd = (rel) => readFileSync(ROOT + rel, "utf8");

const SI = await import("../server/services/search-index.ts");
const IS = await import("../server/services/import-service.ts");
const RS = await import("../server/routes/syntheses.ts");
const LOC = await import("../server/i18n/locale.ts");
const { searchRoutes } = await import("../server/routes/search.ts");
const { membersRoutes } = await import("../server/routes/members.ts");
const { closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");

// клиентские модули (после них — снова серверный провайдер каталога, 09 §4 14.2)
const C = await import("../client/src/api/client.ts");
const CS = await import("../client/src/utils/catalog-search.ts");
const AS = await import("../client/src/api/search.ts");
const SF = await import("../client/src/components/catalog/SearchFragment.tsx");
const CP = await import("../client/src/pages/CatalogPage.tsx");
const GL = await import("../packages/shared/utils/discussion-address.ts");
const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
// tsx транспилирует JSX клиента классически (React.createElement) — под Node имя нужно в глобальной области
globalThis.React = React;
LOC.installServerCatalogProvider();

const MINE = { defaultScope: "mine", lockScope: false };
const EXPLORE = { defaultScope: "public", lockScope: true };
const parse = (qs, ctx = MINE) => CS.parseCatalogSearch(new URLSearchParams(qs), ctx);
const LIM = `limit=${CS.CATALOG_PAGE_LIMIT}`;

console.log("\n■ A. Состояние поиска ↔ адрес ↔ запрос");
{
  const full = "scope=shared&q=%D1%80%D0%B0%D0%B7%D0%BB%D0%BE%D0%BC&field=seed&philosopher=%D0%9A%D0%B0%D0%BD%D1%82&philosopher=%D0%93%D0%B5%D0%B3%D0%B5%D0%BB%D1%8C&philMode=any&philArea=lineage&epoch=1&epoch=4&method=dialectical&synthLevel=generative&depth=exhaustive&lang=German&meta=false&descendantsOf=11111111-2222-3333-4444-555555555555&sort=updatedAt&order=asc&page=2";
  const st = parse(full);
  ok(CS.catalogSearchString(st, MINE) === full && CS.searchQueryString(st) === `${full}&${LIM}`, "A1 круг: адрес → состояние → адрес без потерь; запрос ≡ адресу + limit", CS.catalogSearchString(st, MINE));
  ok(J(st.philosophers) === J(["Кант", "Гегель"]) && J(st.epochs) === J([1, 4]) && st.meta === false && st.sort === "updatedAt" && st.order === "asc" && st.page === 2, "A2 повторяемые параметры — массивами, порядок сохранён", st);
  const e = parse("");
  ok(CS.catalogSearchString(e, MINE) === "" && CS.searchQueryString(e) === `scope=mine&${LIM}` && J(e) === J(CS.emptySearchState("mine")), "A3 пустой адрес — список по умолчанию; умолчания в адрес не пишутся");
  ok(CS.catalogSearchString(parse("scope=public"), MINE) === "scope=public" && CS.catalogSearchString(parse("scope=mine"), MINE) === "", "A4 вкладка — в адресе, вкладка по умолчанию — нет");
  const ex = parse("scope=mine&q=x&status=ready", EXPLORE);
  ok(ex.scope === "public" && ex.status === null && CS.catalogSearchString(ex, EXPLORE) === "q=x" && CS.searchQueryString(ex) === `scope=public&q=x&${LIM}`, "A5 «/explore»: список заперт — scope и статус из адреса не читаются", CS.searchQueryString(ex));
  const mine = parse("status=draft&dateFrom=2026-01-01&dateTo=2026-12-31");
  const pub = parse("scope=public&status=draft&dateFrom=2026-01-01&dateTo=2026-12-31");
  ok(mine.status === "draft" && mine.dateFrom === "2026-01-01" && mine.dateTo === "2026-12-31" && pub.status === null && pub.dateFrom === null && pub.dateTo === null && CS.searchQueryString(pub) === `scope=public&${LIM}`, "A6 статус и дата — только на «моих»");
  const moved = CS.withScope(parse("q=a&field=content&method=creative&status=draft&dateFrom=2026-01-01&page=5"), "public");
  ok(moved.scope === "public" && moved.q === "a" && moved.field === "content" && moved.method === "creative" && moved.status === null && moved.dateFrom === null && moved.page === 1, "A7 смена вкладки: текст и общие фильтры остаются, статус/дата/страница сброшены", moved);
  const bad = parse("scope=all&field=theses&philMode=z&philArea=q&epoch=99&epoch=x&epoch=2&epoch=2&method=m&synthLevel=l&meta=да&descendantsOf=нет&status=gone&dateFrom=2026-13-40&dateTo=2026-02-31&sort=cost&order=up&page=-3");
  ok(CS.searchQueryString(bad) === `scope=mine&epoch=2&${LIM}` && CS.isDay("2024-02-29") && !CS.isDay("2026-02-29") && !CS.isDay("2026-1-1"), "A8 негодное в адресе отброшено (до сервера за 400 не доходит); эпоха — без повторов", CS.searchQueryString(bad));
  const fld = parse("field=term");
  ok(CS.catalogSearchString(fld, MINE) === "field=term" && CS.searchQueryString(fld) === `scope=mine&${LIM}` && CS.searchQueryString(parse("q=dasein&field=term")) === `scope=mine&q=dasein&field=term&${LIM}`, "A9 поле без текста хранится в адресе, в запрос идёт только с текстом");
  ok(CS.searchQueryString(parse("q=dasein")) === `scope=mine&q=dasein&${LIM}` && CS.catalogSearchString(parse("q=dasein&field=title"), MINE) === "q=dasein", "A10 поле по умолчанию (название) не пишется ни в адрес, ни в запрос — умолчание сервера то же");
  const long = parse(`q=${"я".repeat(500)}&${Array.from({ length: 30 }, (_, i) => `philosopher=P${i}`).join("&")}`);
  ok(long.q.length === 200 && long.philosophers.length === 20, "A11 пределы маршрута: текст ≤ 200, философов ≤ 20", [long.q.length, long.philosophers.length]);
  const f = parse("q=a&philosopher=Кант&philMode=any&epoch=0&method=creative&synthLevel=generative&depth=deep&lang=English&meta=true&descendantsOf=11111111-2222-3333-4444-555555555555&status=ready&dateFrom=2026-01-01");
  const r = CS.resetFilters(f);
  ok(CS.activeFilterCount(f) === 10 && CS.activeFilterCount(r) === 0 && r.q === "a" && r.scope === "mine" && CS.hasSearchCriteria(r) && !CS.hasSearchCriteria(CS.emptySearchState("mine")) && CS.activeFilterCount(parse("philMode=any&philArea=lineage")) === 0, "A12 счёт фильтров (режим без философов фильтром не считается) и сброс: текст и вкладка остаются", [CS.activeFilterCount(f), CS.activeFilterCount(r)]);
  const h = CS.relaxHints(parse("q=a&philosopher=A&philosopher=B&dateFrom=2026-01-01&method=creative"), MINE);
  const hTerm = CS.relaxHints(parse("q=a&field=term", EXPLORE), EXPLORE);
  const hAny = CS.relaxHints(parse("q=a&field=content&philosopher=A&philosopher=B&philMode=any&philArea=lineage"), MINE);
  ok(J(h) === J(["philAny", "philLineage", "fieldContent", "dates", "fewerFilters", "otherScope"]) && J(hTerm) === J(["termExact"]) && !hAny.includes("philAny") && !hAny.includes("philLineage") && !hAny.includes("fieldContent"), "A13 подсказки пустой выдачи — по состоянию: уже ослабленное не предлагается, в запертом списке нет «другой вкладки»", [h, hTerm, hAny]);
  ok(CS.relaxHints(parse("q=a&field=title"), MINE).every((x) => typeof CP.relaxHintText(x) === "string" && CP.relaxHintText(x).length > 10) && ["philAny", "philLineage", "fieldContent", "termExact", "dates", "fewerFilters", "otherScope"].every((x) => CP.relaxHintText(x).length > 10), "A14 у каждой подсказки есть фраза");
  ok(CS.termLinkOf("s1", { id: "t1", key: "dasein" }) === "/synthesis/s1?term=t1&termKey=dasein" && new URLSearchParams(CS.termLinkOf("s1", { id: "t1", key: "вот-бытие & ко" }).split("?")[1]).get("termKey") === "вот-бытие & ко", "A15 ссылка к термину: id и ключ имени, ключ экранирован");
  const stD = parse("descendantsOf=11111111-2222-3333-4444-555555555555");
  const e403 = CP.searchErrorText(new C.ApiError("x", "FORBIDDEN", 403), stD), e404 = CP.searchErrorText(new C.ApiError("x", "NOT_FOUND", 404), stD), eNet = CP.searchErrorText(new Error("сеть"), stD);
  ok(e403.length > 10 && e404.length > 10 && eNet.length > 3 && e403 !== eNet && e404 !== eNet, "A16 ошибки поиска — фразами (403/404 фильтра потомков отдельно от прочего)", [e403, e404, eNet]);
}

console.log("\n■ B. Подсветка — текстом, не HTML");
{
  const frag = { source: "capsule", parts: [{ text: "до <b>жирного</b> & " }, { text: '<img src=x onerror="alert(1)">', hit: true }, { text: " после" }] };
  const html = renderToStaticMarkup(React.createElement(SF.SearchFragmentView, { fragment: frag, fuzzy: false }));
  ok(!/<img|<b>/.test(html) && html.includes("&lt;b&gt;жирного&lt;/b&gt; &amp; ") && /<mark class="search-hit" data-testid="search-hit">&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;<\/mark>/.test(html), "B1 разметка в куске фрагмента экранируется; совпадение — в <mark>", html);
  ok(/data-testid="card-fragment"/.test(html) && /data-source="capsule"/.test(html) && html.includes(SF.fragmentSourceLabel("capsule")), "B2 фрагмент назван источником (капсула)", html);
  const fz = renderToStaticMarkup(React.createElement(SF.SearchFragmentView, { fragment: { source: "title", parts: [{ text: "Диалектика", hit: true }, { text: " разлома" }] }, fuzzy: true }));
  ok(/<mark class="search-hit fuzzy"/.test(fz) && (fz.match(/<mark/g) ?? []).length === 1, "B3 «похожее» совпадение помечено своим классом; кусок без hit — не в <mark>", fz);
  ok(["title", "seed", "capsule", "category", "term"].every((s) => SF.fragmentSourceLabel(s).length > 2) && new Set(["title", "seed", "capsule", "category", "term"].map((s) => SF.fragmentSourceLabel(s))).size === 5, "B4 у каждого источника фрагмента своё имя");
  const src = rd("client/src/components/catalog/SearchFragment.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  ok(!/dangerouslySetInnerHTML|__html|innerHTML/.test(src), "B5 в модуле подсветки нет вставки HTML");
}

console.log("\n■ C. Живьём: функция клиента против маршрута 18.1");
const userIds = [];
const app = new Hono();
for (const r of [membersRoutes, searchRoutes, RS.synthesesRoutes]) app.route("/syntheses", r);
async function mkUser(name) {
  const [u] = await sql`insert into users (email, password_hash, display_name) values (${`${TAG}-${name}@s.local`}, 'x', ${name}) returning id`;
  userIds.push(u.id);
  const token = `${TAG}-${name}-${Date.now()}`;
  await sql`insert into sessions (id, user_id, expires_at) values (${createHash("sha256").update(token).digest("hex")}, ${u.id}, now() + interval '1 hour')`;
  return { id: u.id, name, cookie: `philosynth_session=${token}` };
}
async function mkSynth(userId, o) {
  const [s] = await sql`insert into syntheses (user_id, title, seed, lang, method, synth_level, status, visibility, capsule_html, created_at)
    values (${userId}, ${o.title}, ${o.seed ?? ""}, ${o.lang ?? "Russian"}, ${o.method ?? "dialectical"}, ${o.level ?? "comparative"}, ${o.status ?? "ready"}, ${o.visibility ?? "private"},
            ${o.capsule ? `<div data-section="Капсула"><h4>Капсула</h4><p>${o.capsule}</p></div>` : ""}, ${o.createdAt ?? new Date().toISOString()}::timestamptz) returning id`;
  let pos = 0;
  for (const name of o.philosophers ?? []) await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${s.id}, 'philosopher', ${name}, ${pos++})`;
  for (const pid of o.parents ?? []) await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${s.id}, 'synthesis', ${pid}, ${pos++})`;
  pos = 0;
  for (const name of o.categories ?? []) await sql`insert into categories (synthesis_id, name, position) values (${s.id}, ${name}, ${pos++})`;
  pos = 0;
  for (const [term, definition] of o.terms ?? []) await sql`insert into glossary_terms (synthesis_id, term, definition, position) values (${s.id}, ${term}, ${definition}, ${pos++})`;
  await SI.reindexSynthesis(s.id);
  return s.id;
}
let who = null;
let lastUrl = "";
globalThis.fetch = (url, init = {}) => {
  lastUrl = String(url);
  return app.request(String(url).replace(/^\/api\/v1/, ""), { ...init, headers: { ...(init.headers ?? {}), ...(who ? { cookie: who.cookie } : {}) } });
};
const as = async (user, fn) => { who = user; try { return await fn(); } finally { who = null; } };
const caught = async (p) => { try { await p; return null; } catch (e) { return e; } };
const find = (user, qs, ctx = MINE) => as(user, () => AS.searchSyntheses(parse(qs, ctx)));
const ids = (r) => r.items.map((i) => i.id);
/** Эхо сервера ≡ состоянию клиента (то, как сервер понял запрос) */
function echoMatches(st, q) {
  const same = (a, b) => J(a) === J(b);
  return q.scope === st.scope && (q.q ?? "") === st.q && (st.q ? q.field === st.field : true) &&
    same(q.philosophers ?? [], st.philosophers) && (st.philosophers.length ? q.philMode === st.philMode : true) && q.philArea === st.philArea &&
    same(q.epochs ?? [], st.epochs) && (q.method ?? null) === st.method && (q.synthLevel ?? null) === st.synthLevel && (q.depth ?? null) === st.depth &&
    (q.meta ?? null) === st.meta && (q.descendantsOf ?? null) === st.descendantsOf && (q.status ?? null) === st.status &&
    (q.dateFrom ?? null) === st.dateFrom && (q.dateTo ?? null) === st.dateTo && q.order === st.order && q.page === st.page && q.limit === CS.CATALOG_PAGE_LIMIT &&
    (st.sort ? q.sort === st.sort : true);
}

let exitCode = 0;
try {
  const owner = await mkUser("owner"), stranger = await mkUser("stranger");
  const sampleFile = readdirSync(ROOT + "sample").find((f) => f.endsWith(".html"));
  const { synthesisId: RU } = await IS.importHTML(rd("sample/" + sampleFile), owner.id, sampleFile);
  const EN = await mkSynth(owner.id, { title: `The Thinking Reed ${TAG}`, seed: "How does finitude ground human freedom?", lang: "English", visibility: "full", method: "hermeneutical", level: "generative",
    capsule: "Freedom emerges from the boundaries of finite existence.", categories: ["Finitude", "Thrownness"], terms: [["Boundary situation", "A limit that reveals existence"]], philosophers: ["Хайдеггер", "Ясперс"], createdAt: "2026-03-10T12:00:00Z" });
  const META = await mkSynth(owner.id, { title: `Meta reed ${TAG}`, lang: "English", visibility: "full", capsule: "A second-order synthesis.", philosophers: ["Платон"], parents: [EN], status: "draft" });
  const PRIV = await mkSynth(stranger.id, { title: `Тайная монада ${TAG}`, seed: "Возможен ли апокатастасис?", visibility: "private", capsule: "Сокровенная энтелехия.", terms: [["Метемпсихоз", "Странствие души"]], philosophers: ["Лейбниц"] });
  const SHARED = await mkSynth(stranger.id, { title: `Общая монада ${TAG}`, visibility: "private", capsule: "Разделённая с рецензентом энтелехия.", philosophers: ["Лейбниц"] });
  await sql`insert into synthesis_members (synthesis_id, user_id, role, status, invited_by, accepted_at) values (${SHARED}, ${owner.id}, 'reviewer', 'active', ${stranger.id}, now())`;
  const ruTerms = await sql`select id, term from glossary_terms where synthesis_id=${RU} order by position`;

  // каждое состояние, которое умеет собрать панель, сервер принимает и понимает так же
  const { PHILOSOPHER_EPOCHS } = await import("@philosynth/shared/constants/philosophers");
  const eHeid = PHILOSOPHER_EPOCHS.findIndex((e) => e.philosophers.includes("Хайдеггер"));
  const panelStates = [
    "", "scope=public", "scope=shared", "q=reed", "q=freedom&field=seed", "q=boundary&field=content", "q=Boundary+situation&field=term",
    "philosopher=Хайдеггер", "philosopher=Хайдеггер&philosopher=Ясперс&philMode=any", "philosopher=Платон&philArea=lineage", `epoch=${eHeid}`, `epoch=0&epoch=${eHeid}&philArea=lineage`,
    "method=hermeneutical", "synthLevel=generative", "depth=overview", "depth=exhaustive&method=hermeneutical", "lang=English", "meta=true", "meta=false", `descendantsOf=${EN}`,
    "status=draft", "dateFrom=2026-03-10&dateTo=2026-03-10", "dateFrom=2026-03-10", "sort=title&order=asc", "page=2",
    `scope=public&q=freedom&field=content&philosopher=Ясперс&method=hermeneutical&synthLevel=generative&lang=English&meta=false`,
  ];
  const wrong = [];
  for (const qs of panelStates) {
    const st = parse(qs);
    const err = await caught(as(owner, () => AS.searchSyntheses(st)).then((r) => { if (!echoMatches(st, r.query)) wrong.push([qs, r.query]); }));
    if (err) wrong.push([qs, String(err.code ?? err.message)]);
  }
  ok(wrong.length === 0, `C1 ${panelStates.length} состояний панели: сервер принимает каждое и понимает так же (эхо ≡ состоянию)`, wrong);
  await find(owner, "q=reed&field=content&philosopher=Кант&epoch=1");
  ok(/^\/api\/v1\/syntheses\/search\?scope=mine&q=reed&field=content&philosopher=%D0%9A%D0%B0%D0%BD%D1%82&epoch=1&limit=\d+$/.test(lastUrl), "C2 клиент зовёт один маршрут — GET /syntheses/search, строкой сериализатора", lastUrl);

  const mine = await find(owner, "");
  const pub = await find(owner, "scope=public");
  const shared = await find(owner, "scope=shared");
  ok([RU, EN, META].every((x) => ids(mine).includes(x)) && !ids(mine).includes(SHARED) && ids(pub).includes(EN) && !ids(pub).includes(RU) && !ids(pub).includes(PRIV) && J(ids(shared)) === J([SHARED]) && shared.items[0].myRole === "reviewer" && shared.items[0].myStatus === "active" && mine.match === null, "C3 три вкладки — три списка одного маршрута; «со мной поделились» несёт роль для бейджа", [ids(mine).length, ids(pub).length, shared.items[0]]);

  const t = await find(owner, "q=разломы вмещающие");
  const tItem = t.items.find((i) => i.id === RU);
  ok(t.match === "fts" && tItem?.fragment?.source === "title" && tItem.fragment.parts.some((p) => p.hit) && tItem.fragment.parts.every((p) => typeof p.text === "string"), "C4 название: карточка получает фрагмент кусками текста с отметками", tItem?.fragment);
  const fz = await find(owner, "q=вмищающий розлом");
  ok(fz.match === "fuzzy" && ids(fz).includes(RU), "C5 опечатка: match 'fuzzy' — каталог назовёт находки «похожими»", fz.match);
  const c = await find(owner, "q=boundary&field=content");
  ok(c.items.find((i) => i.id === EN)?.fragment?.source === "capsule", "C6 содержание: фрагмент из капсулы", c.items[0]?.fragment);
  const tm = await find(owner, "q=boundary SITUATION&field=term");
  const tmItem = tm.items.find((i) => i.id === EN);
  const [enTerm] = await sql`select id, term from glossary_terms where synthesis_id=${EN}`;
  const link = tmItem?.term ? CS.termLinkOf(tmItem.id, { id: tmItem.term.id, key: GL.termKey(tmItem.term.term) }) : "";
  ok(tm.match === "exact" && tmItem?.term?.id === enTerm.id && link === `/synthesis/${EN}?term=${enTerm.id}&termKey=boundary+situation`, "C7 термин: точное совпадение → id термина → ссылка карточки прямо к термину", [tm.match, link]);

  const lin = await find(owner, "philosopher=Хайдеггер&philosopher=Платон&philArea=lineage");
  const dir = await find(owner, "philosopher=Хайдеггер&philosopher=Платон");
  const anyP = await find(owner, "philosopher=Хайдеггер&philosopher=Платон&philMode=any");
  ok(ids(lin).includes(META) && !ids(lin).includes(EN) && dir.total === 0 && ids(anyP).includes(EN) && ids(anyP).includes(META), "C8 генеалогия — фильтр панели: «родословная» находит мета-синтез по философам родителя (прежний LineageSearch); «любой» шире «всех»", [ids(lin).length, dir.total, ids(anyP).length]);
  const desc = await find(owner, `descendantsOf=${EN}`);
  const dForeign = await caught(find(owner, `descendantsOf=${PRIV}`));
  ok(J(ids(desc)) === J([META]) && dForeign instanceof C.ApiError && dForeign.status === 403 && CP.searchErrorText(dForeign, parse(`descendantsOf=${PRIV}`)).length > 5, "C9 потомки концепции — сервером; чужая приватная → 403 фразой", [ids(desc), dForeign?.status]);
  const st = await find(owner, "status=draft");
  const dt = await find(owner, "dateFrom=2026-03-10&dateTo=2026-03-10");
  ok(ids(st).includes(META) && !ids(st).includes(EN) && J(ids(dt)) === J([EN]), "C10 статус и дата — на «моих»", [ids(st), ids(dt)]);
  await sql`update syntheses set depth='exhaustive' where id=${META}`;
  const dp = await find(owner, "depth=exhaustive"), dpNone = await find(owner, "depth=exhaustive&status=ready"), dpBad = parse("depth=bottomless");
  ok(ids(dp).includes(META) && !ids(dp).includes(EN) && !ids(dpNone).includes(META) && dpBad.depth === null && dp.query.depth === "exhaustive", "C10a глубина (Д-89): фильтр работает, сочетается со статусом; негодное значение адреса отброшено; эхо несёт depth", [ids(dp).length, dp.query.depth]);
  const pubSt = await find(owner, "scope=public&status=draft&dateFrom=2030-01-01");
  ok(ids(pubSt).includes(EN) && pubSt.query.status === null && pubSt.query.dateFrom === null, "C11 в публичном списке статус и дата из адреса не действуют", pubSt.query);

  const none = await find(owner, "q=кантианство платонизм&field=content&philosopher=Гегель&method=creative");
  const hints = CS.relaxHints(parse("q=кантианство платонизм&field=content&philosopher=Гегель&method=creative"), MINE);
  ok(none.total === 0 && none.items.length === 0 && hints.includes("fewerFilters") && hints.includes("philLineage") && hints.includes("otherScope"), "C12 пустая выдача — 200 с нулём; каталог покажет подсказки ослабить условия", hints);

  const guest = await find(null, "q=reed", EXPLORE);
  const guestMine = await caught(as(null, () => AS.searchSyntheses(parse("q=reed"))));
  ok(ids(guest).includes(EN) && !ids(guest).includes(RU) && guest.items.every((i) => i.cost === undefined || i.cost === null || !("totalCostUsd" in i)) && guestMine instanceof C.ApiError && guestMine.status === 401, "C13 гость на «/explore»: запертый public работает; «свои» без сессии — 401 (поэтому scope адреса там и не читается)", [ids(guest).length, guestMine?.status]);
  const guestLin = await find(null, "philosopher=Платон&philArea=lineage", EXPLORE);
  ok(ids(guestLin).includes(META), "C14 фильтр родословной доступен и гостю (прежний /lineage/search был под сессией)", ids(guestLin));

  const handEdited = await caught(find(owner, "field=theses&q=x&epoch=99&meta=да&dateFrom=2026-13-40&sort=cost&philMode=z"));
  ok(handEdited === null, "C15 ссылка, поправленная руками, не роняет каталог в 400", handEdited && String(handEdited.code));
  const p1 = await find(owner, "sort=title&order=asc"), p9 = await find(owner, "page=99");
  ok(p1.total === mine.total && p9.items.length === 0 && p9.total === mine.total, "C16 страница за пределами выдачи — пусто, total на месте (пагинация каталога)", [p1.total, p9.total]);

  console.log("\n■ D. Переход к термину");
  {
    const TF = await import("../client/src/components/document/TermFocus.tsx");
    const AM = await import("../client/src/components/discussion/AddressMarks.tsx").catch(() => null);
    const [row] = await sql`select html_content as html from sections where synthesis_id=${RU} and key=${TF.TERM_SECTION_KEY}`;
    ok(TF.TERM_SECTION_KEY === "glossary" && typeof TF.findTermRow === "function" && typeof TF.TermFocus === "function", "D1 рамка термина живёт в разделе глоссария");
    const first = ruTerms[0];
    const found = await find(owner, `q=${encodeURIComponent(first.term)}&field=term`);
    const item = found.items.find((i) => i.id === RU);
    const key = item?.term ? GL.termKey(item.term.term) : "";
    const link2 = item?.term ? CS.termLinkOf(RU, { id: item.term.id, key }) : "";
    const back = new URLSearchParams(link2.split("?")[1] ?? "");
    ok(item?.term?.id === first.id && back.get("term") === first.id && back.get("termKey") === key && key.length > 0, "D2 термин образца: выдача → ссылка → параметры страницы концепции (id и ключ имени)", [first.term, link2]);
    // ключ имени находит строку таблицы определений в HTML раздела (тем же termKey, что у страницы)
    const html = row?.html ?? "";
    const cells = [...html.matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim());
    ok(html.length > 0 && cells.some((c2) => GL.termKey(c2) === key), "D3 ключ имени совпадает со строкой таблицы определений раздела", [key, cells.slice(0, 3), AM ? "marks ok" : "no marks"]);
  }
} catch (e) {
  failed++;
  fails.push("исключение: " + (e?.stack ?? e));
  console.log("  ✗ ИСКЛЮЧЕНИЕ", e?.stack ?? e);
} finally {
  if (userIds.length) await sql`delete from users where id in ${sql(userIds)}`;
  console.log(`\n${failed === 0 ? "SMOKE OK" : "SMOKE FAIL"}: ${passed} ✓, ${failed} ✗`);
  for (const f of fails) console.log("   ✗ " + f.slice(0, 600));
  exitCode = failed === 0 ? 0 : 1;
  await sql.end();
  await closeDb();
  await closeRedis();
  process.exit(exitCode);
}
