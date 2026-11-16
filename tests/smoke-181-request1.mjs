/**
 * Дымовой прогон беседы 18.1, первый запрос (сервер поиска концепций):
 *   A — чистые функции: документ индекса (без тезисов, капсула без
 *       разметки), разбор подсветки, подстрока, «похожие» слова, обрезка;
 *   B — поля и языки живьём (app.request): словоформы русского, английского
 *       и немецкого, опечатка по триграммам, точный термин с id (и имя
 *       термина без скобки-пояснения), фрагменты;
 *   C — фильтры: философы all/any × direct/lineage, эпоха, метод, уровень,
 *       язык, мета, потомки X, статус, дата, порядок и страницы, негодные
 *       параметры;
 *   D — видимость: чужое приватное не находится ни одним полем; участник
 *       находит приватное; приглашённый — только по названию; витрина —
 *       по названию, зерну и капсуле, но не по категории и термину; гость —
 *       только публичное, без стоимости;
 *   E — свежесть: правка названия, категории, термина, удаление термина
 *       видны поиску сразу; сбой пересчёта (подменённая функция) правку не
 *       роняет; прежние списки каталога отвечают как раньше.
 *
 * Запуск (из корня, PG/Redis подняты, миграции до 0020, сиды на месте):
 *   node_modules/.bin/tsx tests/smoke-181-request1.mjs
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
const TAG = "s181" + Math.random().toString(36).slice(2, 7);
const rd = (rel) => readFileSync(ROOT + rel, "utf8");

const SI = await import("../server/services/search-index.ts");
const ST = await import("../server/utils/search-text.ts");
const IS = await import("../server/services/import-service.ts");
const EE = await import("../server/services/element-editor.ts");
const RS = await import("../server/routes/syntheses.ts");
const { searchRoutes } = await import("../server/routes/search.ts");
const { membersRoutes } = await import("../server/routes/members.ts");
const { lineageSearchRoutes } = await import("../server/routes/lineage.ts");
const { closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");

console.log("\n■ A. Чистые функции");
{
  const doc = SI.buildSearchDocument({
    title: " Имя \u0001концепции ", seed: "зерно\nвторая строка", lang: "German",
    capsuleHtml: '<div data-section="Капсула"><h4>Капсула</h4><p>Суть <b>концепции</b> &amp; мир.</p></div>',
    categories: ["Бытие", " "], terms: [{ term: "Dasein (присутствие)", definition: "вот-бытие" }, { term: "Пусто", definition: "" }],
  });
  ok(doc.config === "german" && doc.title === "Имя концепции" && doc.capsuleText === "Суть концепции & мир." && doc.categoriesText === "Бытие" && doc.elementsText === "Бытие\nDasein (присутствие) — вот-бытие\nПусто", "A1 документ индекса: словарь по языку, капсула без разметки и заголовка, элементы построчно", doc);
  ok(!("theses" in doc) && !J(Object.keys(doc)).includes("thes") && J(SI.INDEXED_TABLES) === J(["syntheses", "categories", "glossary_terms"]), "A2 тезисов в документе индекса нет");
  const parts = ST.splitHeadline(`до ${ST.HIT_START}слово${ST.HIT_STOP} после ${ST.HIT_START}ещё${ST.HIT_STOP}`);
  ok(J(parts) === J([{ text: "до " }, { text: "слово", hit: true }, { text: " после " }, { text: "ещё", hit: true }]) && J(ST.splitHeadline(`хвост ${ST.HIT_START}без пары`)) === J([{ text: "хвост без пары" }]), "A3 разбор подсветки ts_headline в куски; непарный маркер снят", parts);
  ok(J(ST.substringParts("Вмещающий Разлом", "разл")) === J([{ text: "Вмещающий " }, { text: "Разл", hit: true }, { text: "ом" }]) && ST.escapeLike("50%_a\\") === "50\\%\\_a\\\\", "A4 подстрока без регистра; экранирование ILIKE");
  const fz = ST.fuzzyParts("Диалектика разлома и вмещения", ST.queryWords("диолектика розлом"));
  ok(fz.filter((p) => p.hit).map((p) => p.text).join("|") === "Диалектика|разлома" && J(ST.queryWords("И я, Кант! кант 12")) === J(["кант"]), "A5 «похожие» слова помечены; слова запроса — без коротких и повторов", fz);
  const long = [{ text: "а ".repeat(300) }, { text: "цель", hit: true }, { text: " б".repeat(300) }];
  const cl = ST.clipParts(long, 120);
  ok(cl.some((p) => p.hit && p.text === "цель") && cl[0].text.startsWith("… ") && cl.at(-1).text.endsWith(" …") && cl.reduce((n, p) => n + p.text.length, 0) <= 130, "A6 обрезка — окно вокруг совпадения с многоточиями", cl.map((p) => p.text.length));
}

const userIds = [];
const app = new Hono();
for (const r of [membersRoutes, searchRoutes, RS.synthesesRoutes]) app.route("/syntheses", r);
app.route("/lineage", lineageSearchRoutes);
async function mkUser(name) {
  const [u] = await sql`insert into users (email, password_hash, display_name) values (${`${TAG}-${name}@s.local`}, 'x', ${name}) returning id`;
  userIds.push(u.id);
  const token = `${TAG}-${name}-${Date.now()}`;
  await sql`insert into sessions (id, user_id, expires_at) values (${createHash("sha256").update(token).digest("hex")}, ${u.id}, now() + interval '1 hour')`;
  return { id: u.id, name, cookie: `philosynth_session=${token}` };
}
const qs = (o) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) u.append(k, String(x));
  return u.toString();
};
async function call(user, path, init = {}) {
  const res = await app.request(path, { ...init, headers: { ...(init.headers ?? {}), ...(user ? { cookie: user.cookie } : {}) } });
  let body = null;
  try { body = await res.json(); } catch { /* пусто */ }
  return { status: res.status, body };
}
const search = (user, o) => call(user, `/syntheses/search?${qs(o)}`);
const ids = (r) => (r.body?.items ?? []).map((i) => i.id);
const hitText = (item) => (item?.fragment?.parts ?? []).filter((p) => p.hit).map((p) => p.text).join("|");

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

let exitCode = 0;
try {
  const owner = await mkUser("owner"), stranger = await mkUser("stranger"), member = await mkUser("member"), invited = await mkUser("invited");
  const sampleFile = readdirSync(ROOT + "sample").find((f) => f.endsWith(".html"));
  const { synthesisId: RU } = await IS.importHTML(rd("sample/" + sampleFile), owner.id, sampleFile);
  const EN = await mkSynth(owner.id, { title: `The Thinking Reed ${TAG}`, seed: "How does finitude ground human freedom?", lang: "English", visibility: "full", method: "hermeneutical", level: "generative",
    capsule: "Freedom emerges from the boundaries of finite existence.", categories: ["Finitude", "Thrownness"], terms: [["Boundary situation", "A limit that reveals existence"]], philosophers: ["Хайдеггер", "Ясперс"], createdAt: "2026-03-10T12:00:00Z" });
  const DE = await mkSynth(stranger.id, { title: `Das unheimliche Sein ${TAG}`, seed: "Wie zeigt sich die Wahrheit des Seins?", lang: "German", visibility: "showcase", method: "analytical",
    capsule: "Die Wahrheit entbirgt sich in den Lichtungen des Seins.", categories: ["Gelassenheit"], terms: [["Ereignis", "Das Geschehen der Zueignung"]], philosophers: ["Хайдеггер", "Кант"], createdAt: "2026-04-20T12:00:00Z" });
  const PRIV = await mkSynth(stranger.id, { title: `Тайная монада ${TAG}`, seed: "Возможен ли апокатастасис всех монад?", visibility: "private",
    capsule: "Сокровенная энтелехия развёртывает предустановленную гармонию.", categories: ["Палингенесия"], terms: [["Метемпсихоз (переселение)", "Странствие души по телам"]], philosophers: ["Лейбниц"] });
  const META = await mkSynth(owner.id, { title: `Meta reed ${TAG}`, lang: "English", visibility: "full", capsule: "A second-order synthesis.", philosophers: ["Платон"], parents: [EN], status: "draft" });
  await sql`insert into synthesis_members (synthesis_id, user_id, role, status, invited_by, accepted_at) values (${PRIV}, ${member.id}, 'reviewer', 'active', ${stranger.id}, now())`;
  await sql`insert into synthesis_members (synthesis_id, user_id, role, status, invited_by) values (${PRIV}, ${invited.id}, 'reviewer', 'invited', ${stranger.id})`;
  const [ruRow] = await sql`select title, lang from syntheses where id=${RU}`;
  const ruTerms = await sql`select id, term, definition from glossary_terms where synthesis_id=${RU} order by position`;
  const ruCats = await sql`select id, name from categories where synthesis_id=${RU} order by position`;

  console.log("\n■ B. Поля и языки");
  {
    const [ix] = await sql`select config, length(capsule_text) cap, length(elements_text) el from synthesis_search where synthesis_id=${RU}`;
    ok(ix?.config === "russian" && ix.cap > 100 && ix.el > 100, "B1 импорт проиндексирован (словарь russian, капсула и элементы на месте)", ix);
    const t = await search(owner, { q: "разломы вмещающие", field: "title" });
    ok(t.status === 200 && ids(t).includes(RU) && t.body.match === "fts" && /азлом/.test(hitText(t.body.items.find((i) => i.id === RU))), "B2 название: русские словоформы («разломы вмещающие» → «Вмещающий разлом»), подсветка", [t.status, t.body?.match, t.body?.items?.[0]?.fragment]);
    const sub = await search(owner, { search: "щающий разл" });
    ok(ids(sub).includes(RU) && hitText(sub.body.items.find((i) => i.id === RU)).toLowerCase() === "щающий разл" && sub.body.query.field === "title", "B3 прежний ?search= — подстрока названия", sub.body?.items?.[0]?.fragment);
    const typo = await search(owner, { q: "вмищающий розлом" });
    ok(ids(typo).includes(RU) && typo.body.match === "fuzzy" && hitText(typo.body.items.find((i) => i.id === RU)).length > 0, "B4 опечатка в названии — запасной ход по триграммам", [typo.body?.match, typo.body?.items?.[0]?.fragment]);
    const [seedRow] = await sql`select seed from syntheses where id=${RU}`;
    const seedWord = (seedRow.seed.match(/[а-яё]{7,}/giu) ?? [])[0];
    const sd = seedWord ? await search(owner, { q: seedWord, field: "seed" }) : null;
    ok(!seedWord || (ids(sd).includes(RU) && sd.body.items.find((i) => i.id === RU).fragment.source === "seed"), "B5 зерно ищется, фрагмент — из зерна", [seedWord, sd?.body?.items?.[0]?.fragment]);
    const c = await search(owner, { q: "архетипами", field: "content" });
    const cItem = c.body.items.find((i) => i.id === RU);
    ok(!!cItem && ["capsule", "term", "category"].includes(cItem.fragment?.source) && hitText(cItem).length > 0, "B6 содержание: русская словоформа, фрагмент с подсветкой", cItem?.fragment);
    const en = await search(owner, { q: "boundary", field: "content", scope: "public" });
    const enItem = en.body.items.find((i) => i.id === EN);
    ok(!!enItem && enItem.fragment.source === "capsule" && /boundaries/i.test(hitText(enItem)), "B7 английский: boundary → boundaries (капсула)", enItem?.fragment);
    const enCat = await search(owner, { q: "thrownness", field: "content" });
    const enDef = await search(owner, { q: "revealing limits", field: "content" });
    ok(enCat.body.items.find((i) => i.id === EN)?.fragment.source === "category" && enDef.body.items.find((i) => i.id === EN)?.term?.term === "Boundary situation", "B8 содержание: имя категории и определение термина (с id термина)", [enCat.body.items[0]?.fragment, enDef.body.items[0]]);
    const de = await search(owner, { q: "Lichtung", field: "content", scope: "public" });
    const deItem = de.body.items.find((i) => i.id === DE);
    ok(!!deItem && /Lichtungen/.test(hitText(deItem)), "B9 немецкий: Lichtung → Lichtungen (капсула витрины)", deItem?.fragment);
    const tm = await search(owner, { q: "boundary SITUATION", field: "term" });
    const [enTerm] = await sql`select id from glossary_terms where synthesis_id=${EN}`;
    ok(tm.body.match === "exact" && tm.body.items.find((i) => i.id === EN)?.term?.id === enTerm.id && (await search(owner, { q: "boundary", field: "term" })).body.total === 0, "B10 термин: точное совпадение без регистра → id термина; часть термина не находит", tm.body?.items?.[0]);
    const bracket = ruTerms.find((t) => /\(.+\)\s*$/.test(t.term));
    if (bracket) {
      const base = bracket.term.replace(/\s*\([^()]*\)\s*$/, "");
      const tb = await search(owner, { q: base, field: "term" });
      const tf = await search(owner, { q: bracket.term, field: "term" });
      ok(tb.body.items.find((i) => i.id === RU)?.term?.id === bracket.id && tf.body.items.find((i) => i.id === RU)?.term?.id === bracket.id, "B11 термин «Имя (пояснение)» находится и целиком, и по имени без скобки", [base, tb.body?.items?.[0]?.term]);
    } else ok(true, "B11 (в образце нет терминов со скобкой — пропуск)");
    const none = await search(owner, { q: "кантианство платонизм", field: "content" });
    ok(none.status === 200 && none.body.total === 0 && none.body.items.length === 0, "B12 постороннее не находится (и запасной ход не шумит)", none.body?.items?.map((i) => i.title));
  }

  console.log("\n■ C. Фильтры");
  {
    const mine = await search(owner, {});
    ok(mine.status === 200 && mine.body.query.scope === "mine" && [RU, EN, META].every((x) => ids(mine).includes(x)) && !ids(mine).includes(DE) && mine.body.match === null && mine.body.items.every((i) => !i.fragment), "C1 без параметров — свои, без текста и фрагментов");
    const all = await search(owner, { scope: "public", philosopher: ["Хайдеггер", "Кант"], philMode: "all" });
    const any = await search(owner, { scope: "public", philosopher: ["Ясперс", "Кант"], philMode: "any" });
    ok(ids(all).includes(DE) && !ids(all).includes(EN) && ids(any).includes(DE) && ids(any).includes(EN) && !ids(any).includes(META), "C2 философы: all — оба, any — любой (прямые участники)", [ids(all).length, ids(any).length]);
    const dir = await search(owner, { philosopher: "Хайдеггер", philArea: "direct" });
    const lin = await search(owner, { philosopher: ["Хайдеггер", "Платон"], philArea: "lineage" });
    ok(ids(dir).includes(EN) && !ids(dir).includes(META) && ids(lin).includes(META) && !ids(lin).includes(EN), "C3 область: direct — свои строки, lineage — вся родословная (мета-синтез наследует философов родителя)");
    const ls = await call(owner, `/lineage/search?${qs({ philosopher: ["Хайдеггер", "Платон"] })}`);
    ok(ls.status === 200 && ls.body.syntheses.some((s) => s.id === META) && !ls.body.syntheses.some((s) => s.id === EN), "C4 /lineage/search — как прежде, и сходится с фильтром lineage+all");
    const { PHILOSOPHER_EPOCHS } = await import("@philosynth/shared/constants/philosophers");
    const eAnt = PHILOSOPHER_EPOCHS.findIndex((e) => e.philosophers.includes("Платон"));
    const ep = await search(owner, { epoch: eAnt });
    const epLin = await search(owner, { epoch: PHILOSOPHER_EPOCHS.findIndex((e) => e.philosophers.includes("Хайдеггер")), philArea: "lineage" });
    ok(ids(ep).includes(META) && !ids(ep).includes(EN) && ids(epLin).includes(META) && ids(epLin).includes(EN), "C5 эпоха: философ эпохи среди прямых / по родословной");
    const f1 = await search(owner, { method: "hermeneutical" });
    const f2 = await search(owner, { synthLevel: "generative", lang: "english" });
    const f3 = await search(owner, { status: "draft" });
    ok(J(ids(f1)) === J([EN]) && J(ids(f2)) === J([EN]) && ids(f3).includes(META) && !ids(f3).includes(EN), "C6 метод, уровень, язык, статус");
    const m1 = await search(owner, { meta: "true" }), m0 = await search(owner, { meta: "false" });
    ok(ids(m1).includes(META) && !ids(m1).includes(EN) && ids(m0).includes(EN) && !ids(m0).includes(META) && m1.body.items.find((i) => i.id === META).hasConceptParents === true, "C7 мета-синтез да / нет (сходится с hasConceptParents превью)");
    const d = await search(owner, { descendantsOf: EN });
    const dForeign = await search(owner, { descendantsOf: PRIV });
    const dBad = await search(owner, { descendantsOf: "нет" });
    ok(J(ids(d)) === J([META]) && dForeign.status === 403 && dBad.status === 404, "C8 потомки X; X чужая приватная → 403, не id → 404", [ids(d), dForeign.status, dBad.status]);
    const dt = await search(owner, { dateFrom: "2026-03-10", dateTo: "2026-03-10" });
    ok(J(ids(dt)) === J([EN]), "C9 дата создания, обе границы включены", ids(dt));
    const combo = await search(owner, { q: "freedom", field: "content", philosopher: "Ясперс", method: "hermeneutical", meta: "false", lang: "English" });
    ok(J(ids(combo)) === J([EN]) && combo.body.items[0].fragment.source === "capsule", "C10 текст и фильтры вместе");
    const p1 = await search(owner, { sort: "title", order: "asc", limit: 2, page: 1 }), p2 = await search(owner, { sort: "title", order: "asc", limit: 2, page: 2 }), p9 = await search(owner, { limit: 2, page: 99 });
    const titles = [...p1.body.items, ...p2.body.items].map((i) => i.title);
    ok(p1.body.items.length === 2 && p1.body.total === mine.body.total && p9.body.items.length === 0 && p9.body.total === mine.body.total && J(titles) === J([...titles].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) && !ids(p1).some((x) => ids(p2).includes(x)), "C11 порядок и страницы; total — и за пределами выдачи", [titles, p9.body]);
    const bad = await search(owner, { scope: "все", field: "тезисы", q: "x", philMode: "z", epoch: 99, method: "m", meta: "да", dateFrom: "2026-13-40", sort: "cost" });
    ok(bad.status === 400 && bad.body.code === "VALIDATION_ERROR" && ["scope", "field", "philMode", "epoch", "method", "meta", "dateFrom", "sort"].every((k) => k in bad.body.details), "C12 негодные параметры → 400 с перечнем", bad.body);
  }

  console.log("\n■ D. Видимость");
  {
    const probes = [
      { q: "вмещающий", field: "title" }, { q: ruRow.title, field: "title" },
      { q: "разлом", field: "seed" }, { q: "архетипами", field: "content" },
      { q: ruCats[0].name, field: "content" }, { q: ruTerms[0].term, field: "term" }, { q: ruTerms[0].term, field: "content" },
    ];
    let leak = null;
    for (const scope of ["mine", "shared", "public"]) for (const p of probes) for (const who of [stranger, member, invited]) {
      const r = await search(who, { ...p, scope });
      if (ids(r).includes(RU)) leak = { scope, p, who: who.name };
    }
    const typoLeak = await search(stranger, { q: "вмищающий розлом", scope: "public" });
    ok(leak === null && !ids(typoLeak).includes(RU), "D1 чужое приватное не находится ни одним полем ни в одном списке (и по опечатке)", leak);
    const own = [];
    for (const p of [{ q: "монада", field: "title" }, { q: "апокатастасис", field: "seed" }, { q: "энтелехии", field: "content" }, { q: "палингенесия", field: "content" }, { q: "метемпсихоз", field: "term" }, { q: "странствия души", field: "content" }])
      own.push(ids(await search(member, { ...p, scope: "shared" })).includes(PRIV));
    const mItem = (await search(member, { q: "метемпсихоз", field: "term", scope: "shared" })).body.items[0];
    ok(own.every(Boolean) && mItem?.myRole === "reviewer" && mItem.myStatus === "active" && !!mItem.term?.id && !ids(await search(member, { q: "монада", scope: "mine" })).includes(PRIV) && !ids(await search(member, { q: "монада", scope: "public" })).includes(PRIV), "D2 участник находит приватное всеми полями — в списке «со мной», с ролью и статусом", [own, mItem]);
    const inv = [];
    for (const p of [{ q: "монада", field: "title" }, { q: "апокатастасис", field: "seed" }, { q: "энтелехия", field: "content" }, { q: "палингенесия", field: "content" }, { q: "метемпсихоз", field: "term" }])
      inv.push(ids(await search(invited, { ...p, scope: "shared" })).includes(PRIV));
    const invList = await search(invited, { scope: "shared" });
    ok(J(inv) === J([true, false, false, false, false]) && invList.body.items.find((i) => i.id === PRIV)?.myStatus === "invited", "D3 приглашённый (не принял): приглашение в списке и находится по названию — зерно и содержание закрыты", inv);
    const sc = {};
    for (const [k, p] of Object.entries({ title: { q: "unheimlich", field: "title" }, seed: { q: "Wahrheit", field: "seed" }, capsule: { q: "Lichtungen", field: "content" }, category: { q: "Gelassenheit", field: "content" }, termDef: { q: "Zueignung", field: "content" }, termName: { q: "Ereignis", field: "content" }, term: { q: "Ereignis", field: "term" }, fuzzyCat: { q: "Gelasenheit", field: "content" } }))
      sc[k] = ids(await search(owner, { ...p, scope: "public" })).includes(DE);
    const scOwn = ids(await search(stranger, { q: "Gelassenheit", field: "content" })).includes(DE) && ids(await search(stranger, { q: "ereignis", field: "term" })).includes(DE);
    ok(J(sc) === J({ title: true, seed: true, capsule: true, category: false, termDef: false, termName: false, term: false, fuzzyCat: false }) && scOwn, "D4 витрина: название, зерно, капсула — да; категория, термин, определение (и по опечатке) — нет; владельцу — всё", sc);
    const g401a = await search(null, { scope: "mine" }), g401b = await search(null, { scope: "shared" });
    const g = await search(null, { q: "reed" });
    const gAll = await search(null, {});
    const gPriv = await search(null, { q: "монада" });
    const gCat = await search(null, { q: "Gelassenheit", field: "content" });
    const gFull = await search(null, { q: "thrownness", field: "content" });
    ok(g401a.status === 401 && g401b.status === 401 && g.body.query.scope === "public" && ids(g).includes(EN) && g.body.items.every((i) => !("totalCostUsd" in i)) && ids(gAll).includes(DE) && !ids(gAll).includes(RU) && !ids(gAll).includes(PRIV) && gPriv.body.total === 0 && !ids(gCat).includes(DE) && ids(gFull).includes(EN), "D5 гость: только публичное, без стоимости; свои и «со мной» → 401; открытая концепция ищется целиком", [g401a.status, g.body?.query?.scope]);
    const uCost = (await search(stranger, { q: "reed", scope: "public" })).body.items.find((i) => i.id === EN);
    ok(uCost && "totalCostUsd" in uCost, "D6 вошедшему стоимость в превью видна (projectPreview как в каталоге)");
  }

  console.log("\n■ E. Свежесть и прежние списки");
  {
    const newTitle = `Палимпсест ${TAG}`;
    const pt = await call(owner, `/syntheses/${RU}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: J({ title: newTitle }) });
    const afterT = await search(owner, { q: "палимпсесты" });
    ok(pt.status === 200 && ids(afterT).includes(RU) && !ids(await search(owner, { q: "вмещающий разлом" })).includes(RU), "E1 правка названия — поиск видит новое и не видит старого", [pt.status, pt.body]);
    await EE.updateCategory(RU, ruCats[0].id, { name: `Ноуменальность ${TAG}` });
    const afterC = await search(owner, { q: "ноуменальности", field: "content" });
    ok(ids(afterC).includes(RU) && afterC.body.items.find((i) => i.id === RU).fragment.source === "category", "E2 правка категории видна сразу", afterC.body?.items?.[0]?.fragment);
    const term = ruTerms[1] ?? ruTerms[0];
    await EE.updateGlossaryTerm(RU, term.id, { term: `Кенозисность` });
    const afterG = await search(owner, { q: `кенозисность`, field: "term" });
    ok(afterG.body.items.find((i) => i.id === RU)?.term?.id === term.id && !ids(await search(owner, { q: term.term, field: "term" })).includes(RU), "E3 правка термина: новый находится точно, старый — нет");
    await EE.deleteElement(RU, "glossary_term", term.id);
    const delT = await search(owner, { q: `кенозисность`, field: "term" }), delC = await search(owner, { q: `кенозисность`, field: "content" });
    ok(delT.body.total === 0 && delC.body.total === 0, "E4 удалённый термин (15.2) из поиска исчез", [delT.body, delC.body?.items?.map((i) => [i.title, i.fragment]), delC.body?.match]);
    const errs = [];
    const origErr = console.error;
    console.error = (...a) => errs.push(a.map(String).join(" "));
    SI.setSearchIndexWriter(async () => { throw new Error("сбой пересчёта (подмена)"); });
    let pf, direct;
    try {
      pf = await call(owner, `/syntheses/${RU}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: J({ title: `Сбойное имя ${TAG}` }) });
      direct = await SI.reindexSynthesis(RU);
    } finally { SI.setSearchIndexWriter(null); console.error = origErr; }
    const [tRow] = await sql`select title from syntheses where id=${RU}`;
    const stale = await search(owner, { q: "палимпсест", field: "title" });
    ok(pf.status === 200 && tRow.title === `Сбойное имя ${TAG}` && direct === false && errs.some((e) => e.includes("[search-index]")) && ids(await search(owner, { search: "Сбойное имя" })).includes(RU), "E5 сбой пересчёта правку не роняет: 200, запись на месте, сбой в журнале; название находится подстрокой и без индекса", [pf.status, errs.length]);
    const fixed = await SI.reindexSynthesis(RU);
    ok(fixed === true && ids(await search(owner, { q: "сбойные имена" })).includes(RU) && (stale.status === 200), "E6 повторный пересчёт чинит индекс");
    const dup = await call(owner, `/syntheses/${EN}/duplicate`, { method: "POST" });
    const dupId = dup.body?.id ?? dup.body?.synthesis?.id;
    const dupFound = await search(owner, { q: "thrownness", field: "content" });
    ok(dup.status < 300 && !!dupId && ids(dupFound).includes(dupId), "E7 копия проиндексирована сразу", [dup.status, dup.body && Object.keys(dup.body)]);
    const [cnt] = await sql`select count(*)::int n from synthesis_search ss join syntheses s on s.id = ss.synthesis_id where s.user_id = ${owner.id}`;
    const [cs] = await sql`select count(*)::int n from syntheses where user_id = ${owner.id}`;
    ok(cnt.n === cs.n, "E8 у каждой концепции владельца есть строка индекса", [cnt.n, cs.n]);
    const l1 = await call(owner, `/syntheses?${qs({ search: "reed", method: "hermeneutical", sort: "title", order: "asc" })}`);
    const l2 = await call(null, `/syntheses/public?${qs({ search: "Sein", philosopher: "Кант" })}`);
    const l3 = await call(member, "/syntheses/shared");
    ok(l1.status === 200 && l1.body.items.some((i) => i.id === EN) && l2.status === 200 && l2.body.items.some((i) => i.id === DE) && l3.status === 200 && l3.body.items.some((i) => i.id === PRIV && i.myRole === "reviewer"), "E9 прежние списки отвечают как раньше (GET /syntheses, /public, /shared)");
    // Д-87: удаление раздела глоссария снимает строки терминов — и из поиска
    const GS = await import("../server/services/generation-service.ts");
    const left = ruTerms.find((t) => t.id !== (ruTerms[1] ?? ruTerms[0]).id);
    const leftBase = left.term.replace(/\s*\([^()]*\)\s*$/, "");
    const beforeDel = ids(await search(owner, { q: leftBase, field: "term" })).includes(RU);
    const lg = console.log; console.log = () => {};
    try { await GS.deleteSection(RU, "glossary"); await GS.deleteSection(RU, "theses"); } finally { console.log = lg; }
    const [cntG] = await sql`select (select count(*)::int from glossary_terms where synthesis_id=${RU}) g, (select count(*)::int from theses where synthesis_id=${RU}) t, (select count(*)::int from categories where synthesis_id=${RU}) c`;
    ok(beforeDel && cntG.g === 0 && cntG.t === 0 && cntG.c > 0 && !ids(await search(owner, { q: leftBase, field: "term" })).includes(RU) && ids(await search(owner, { q: "ноуменальности", field: "content" })).includes(RU), "E9a Д-87: удаление разделов глоссария и тезисов снимает их строки; термины уходят из поиска, категории графа остаются", [beforeDel, cntG]);
    const full = await call(owner, `/syntheses/${EN}`);
    ok(full.status === 200 && (full.body.id ?? full.body.synthesis?.id) === EN, "E10 /search не перехватил GET /syntheses/:id", [full.status, full.body && Object.keys(full.body)]);
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
