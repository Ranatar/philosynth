/**
 * Дымовой прогон беседы 18.3, первый запрос (похожие концепции):
 *   A — чистое ядро меры: веса, Жаккар, привязки ступеней, несравнимые
 *       признаки выбывают, текст при `textComparable = false` не читается,
 *       метод/уровень/эпохи сами по себе в выдачу не выводят;
 *   B — Д-88 и Д-91: один обход родословной (строки БД + дерево файла,
 *       правило приоритета 15.1) — `/lineage/search`, фильтр поиска,
 *       сходство и пересечения участников мета-синтеза дают один ответ;
 *   C — маршрут живьём (app.request): порядок, слова меры, причины
 *       (философы прямые и через предков, термины и категории именами
 *       исходной, общий предок со ссылкой и снимок файла без ссылки,
 *       прямое родство), числа меры в ответе нет, limit, потолок;
 *   D — видимость и содержание: чужое приватное не кандидат; участник его
 *       видит, приглашённый — нет; гость — только публичное; у витрины
 *       термины и категории не сравниваются (ни кандидатом, ни исходной);
 *       через границу языков — тоже; имя невидимого предка не раскрыто.
 *
 * Запуск (из корня, PG/Redis подняты, миграции до 0020, сиды на месте):
 *   node_modules/.bin/tsx tests/smoke-183-request1.mjs
 */
import { createHash } from "node:crypto";
import postgres from "postgres";
import { Hono } from "hono";

const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
process.env.NODE_ENV = "development";
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 1800) : ""}`); }
}
const TAG = "s183" + Math.random().toString(36).slice(2, 7);

const C = await import("../packages/shared/constants/similarity.ts");
const SC = await import("../server/services/similarity-score.ts");
const SM = await import("../server/services/similarity.ts");
const LS = await import("../server/services/lineage-service.ts");
const SR = await import("../server/services/search.ts");
const SI = await import("../server/services/search-index.ts");
const RS = await import("../server/routes/syntheses.ts");
const { similarRoutes } = await import("../server/routes/similar.ts");
const { searchRoutes } = await import("../server/routes/search.ts");
const { lineageSearchRoutes } = await import("../server/routes/lineage.ts");
const { closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");

console.log("\n■ A. Ядро меры");
{
  const F = (o) => ({
    selfKey: o.self, philDirect: new Set(o.pd ?? []), philLineage: new Set(o.pl ?? o.pd ?? []), kin: new Set([o.self, ...(o.kin ?? [])]),
    terms: new Set(o.terms ?? []), categories: new Set(o.cats ?? []), epochs: new Set(o.ep ?? []), method: o.m ?? "dialectical", synthLevel: o.l ?? "comparative",
  });
  const W = C.SIMILARITY_WEIGHTS;
  ok(Object.values(W).reduce((a, b) => a + b, 0) === 100 && J(Object.keys(W)) === J(C.SIMILARITY_FEATURES) && W.terms > W.categories && W.philLineage > W.philDirect && W.method > W.level, "A1 веса: сумма 100, на каждый признак; термины > категорий, родословная > прямых, метод > уровня", W);
  ok(SC.jaccard(2, 2, 1) === 1 / 3 && SC.jaccard(0, 0, 0) === 0 && SC.jaccard(3, 3, 3) === 1, "A2 Жаккар: |A∩B| / |A∪B|; у двух пустых — 0");
  const same = SC.scoreSimilarity(F({ self: "id:a", pd: ["К", "Г"], ep: [3] }), F({ self: "id:b", pd: ["К", "Г"], ep: [3], l: "generative" }), false);
  ok(Math.abs(same.score - 48 / 86) < 1e-9 && J(same.compared) === J(["philDirect", "philLineage", "terms", "categories", "epochs", "method", "level"]) && C.similarityGradeOf(same.score) === "strong", "A3 те же философы и метод, предков нет, текст не сравнивался: 48/86 — «сильно»; род выбыл, текст остался в знаменателе нулём", [same.score, same.compared]);
  const half = SC.scoreSimilarity(F({ self: "id:a", pd: ["К", "Г"], ep: [3] }), F({ self: "id:b", pd: ["К", "Н"], ep: [3, 4], l: "generative" }), false);
  ok(C.similarityGradeOf(half.score) === "notable" && half.score > 0.24 && half.score < 0.25, "A4 один общий философ из двух и тот же метод — «заметно»", half.score);
  const weak = SC.scoreSimilarity(F({ self: "id:a", pd: ["К", "Г", "Ф"], ep: [3] }), F({ self: "id:b", pd: ["К", "Н", "М"], ep: [3, 4], m: "analytical", l: "generative" }), false);
  ok(C.similarityGradeOf(weak.score) === "weak", "A5 один общий из трёх при разном методе — «слабо»", weak.score);
  const feat = (o) => F({ pd: ["К", "Г"], ep: [3], ...o });
  const noText = SC.scoreSimilarity(feat({ self: "id:a", terms: ["быт", "снят"], cats: ["свобод"] }), feat({ self: "id:b", terms: ["быт", "снят"], cats: ["свобод"] }), false);
  const partText = SC.scoreSimilarity(feat({ self: "id:a", terms: ["быт", "снят"], cats: ["свобод"] }), feat({ self: "id:b", terms: ["быт", "дух"], cats: ["время"] }), true);
  const allText = SC.scoreSimilarity(feat({ self: "id:a", terms: ["быт"], cats: ["свобод"] }), feat({ self: "id:b", terms: ["быт"], cats: ["свобод"] }), true);
  ok(noText.shared.terms.length === 0 && noText.shared.categories.length === 0 && J(partText.shared.terms) === J(["быт"]) && partText.score > noText.score && Math.abs(allText.score - 1) < 1e-9, "A6 текст несравним — термины и категории не читаются и дают ноль; общий термин меру ТОЛЬКО повышает (сравнённое не проигрывает несравненному); всё общее — 1", [noText.score, partText.score, allText.score]);
  const only = SC.scoreSimilarity(F({ self: "id:a", pd: ["Кант"], ep: [3] }), F({ self: "id:b", pd: ["Гегель"], ep: [3] }), false);
  ok(only.evidence === false && only.method && only.synthLevel && J(only.shared.epochs) === J([3]), "A7 метод, уровень и эпоха совпали, общего содержательного нет — не свидетельство", only);
  const kin = SC.scoreSimilarity(F({ self: "id:a", pd: ["К"], kin: ["id:g"] }), F({ self: "id:b", pd: ["Н"], kin: ["id:g"] }), false);
  const parent = SC.scoreSimilarity(F({ self: "id:a", pd: ["К"] }), F({ self: "id:b", pd: ["Н"], pl: ["Н", "К"], kin: ["id:a"] }), false);
  ok(kin.evidence && J(kin.shared.kin) === J(["id:g"]) && kin.compared.includes("kin") && parent.evidence && J(parent.shared.kin) === J(["id:a"]), "A8 род: общий предок и прямое родство — свидетельство", [kin.score, parent.score]);
  ok(C.similarityGradeOf(0.45) === "strong" && C.similarityGradeOf(0.44) === "notable" && C.similarityGradeOf(0.22) === "notable" && C.similarityGradeOf(0.1) === "weak" && C.similarityGradeOf(0.099) === null, "A9 ступени по порогам; ниже «слабо» — не показывается");
}

const userIds = [];
const app = new Hono();
for (const r of [searchRoutes, similarRoutes, RS.synthesesRoutes]) app.route("/syntheses", r);
app.route("/lineage", lineageSearchRoutes);
async function mkUser(name) {
  const [u] = await sql`insert into users (email, password_hash, display_name) values (${`${TAG}-${name}@s.local`}, 'x', ${name}) returning id`;
  userIds.push(u.id);
  const token = `${TAG}-${name}-${Date.now()}`;
  await sql`insert into sessions (id, user_id, expires_at) values (${createHash("sha256").update(token).digest("hex")}, ${u.id}, now() + interval '1 hour')`;
  return { id: u.id, name, cookie: `philosynth_session=${token}` };
}
async function call(user, path) {
  const res = await app.request(path, { headers: user ? { cookie: user.cookie } : {} });
  let body = null;
  try { body = await res.json(); } catch { /* пусто */ }
  return { status: res.status, body };
}
const similar = (user, id, q = "") => call(user, `/syntheses/${id}/similar${q}`);
const idsOf = (r) => (r.body?.items ?? []).map((i) => i.id);
const item = (r, id) => (r.body?.items ?? []).find((i) => i.id === id);

async function mkSynth(userId, o) {
  const [s] = await sql`insert into syntheses (user_id, title, lang, method, synth_level, status, visibility, file_genealogy)
    values (${userId}, ${`${o.title} ${TAG}`}, ${o.lang ?? "Russian"}, ${o.method ?? "dialectical"}, ${o.level ?? "comparative"}, 'ready', ${o.visibility ?? "private"}, ${o.file ? sql.json(o.file) : null}) returning id`;
  let pos = 0;
  for (const name of o.philosophers ?? []) await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${s.id}, 'philosopher', ${name}, ${pos++})`;
  for (const pid of o.parents ?? []) await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${s.id}, 'synthesis', ${pid}, ${pos++})`;
  pos = 0;
  for (const name of o.categories ?? []) await sql`insert into categories (synthesis_id, name, position) values (${s.id}, ${name}, ${pos++})`;
  pos = 0;
  for (const term of o.terms ?? []) await sql`insert into glossary_terms (synthesis_id, term, definition, position) values (${s.id}, ${term}, 'определение', ${pos++})`;
  await SI.reindexSynthesis(s.id);
  return s.id;
}

let exitCode = 0;
try {
  const owner = await mkUser("owner"), stranger = await mkUser("stranger"), member = await mkUser("member"), invited = await mkUser("invited");
  // имена философов с меткой — чтобы прежние данные БД в выдачу не мешались
  const P = (n) => `${n}`;
  const SRC = await mkSynth(owner.id, { title: "Исходная", philosophers: [P("Кант"), P("Гегель")], terms: ["Бытие (Sein)", "Снятие", "Абсолютный дух"], categories: ["Свобода", "Время"] });
  const TWIN = await mkSynth(owner.id, { title: "Близнец", philosophers: ["Кант", "Гегель"], terms: ["Бытия", "Снятия (Aufhebung)", "Воля"], categories: ["свободы"] });
  const PUB_EN = await mkSynth(stranger.id, { title: "English twin", lang: "English", visibility: "full", philosophers: ["Кант", "Гегель"], terms: ["Бытие", "Снятие"], categories: ["Свобода"] });
  const SHOW = await mkSynth(stranger.id, { title: "Витрина", visibility: "showcase", philosophers: ["Кант"], method: "analytical", terms: ["Бытие", "Снятие", "Абсолютный дух"], categories: ["Свобода", "Время"] });
  const PRIV = await mkSynth(stranger.id, { title: "Чужая приватная", philosophers: ["Кант", "Гегель"], terms: ["Бытие"], categories: ["Свобода"] });
  const FAR = await mkSynth(stranger.id, { title: "Далёкая", visibility: "full", philosophers: ["Фихте"], terms: ["Воля к власти"], categories: ["Ресентимент"] });
  const CHILD = await mkSynth(owner.id, { title: "Потомок", philosophers: ["Платон"], parents: [SRC], method: "creative", level: "generative" });
  const GP = await mkSynth(owner.id, { title: "Общий предок", philosophers: ["Спиноза"] });
  const A1 = await mkSynth(owner.id, { title: "Ветвь первая", visibility: "full", philosophers: ["Лейбниц"], parents: [GP] });
  const A2 = await mkSynth(owner.id, { title: "Ветвь вторая", visibility: "full", philosophers: ["Юм"], parents: [GP], method: "creative" });
  const fileTree = (anc, phil) => ({ type: "concept", name: "Файл", participants: [
    { type: "philosopher", name: "Перекрытый" },
    { type: "concept", name: anc, participants: [{ type: "philosopher", name: phil }, { type: "philosopher", name: "", unnamed: true }] },
  ] });
  const F1 = await mkSynth(owner.id, { title: "Из файла один", philosophers: ["Бергсон"], file: fileTree("«Файловый  Предок»", "Плотин"), method: "creative" });
  const F2 = await mkSynth(owner.id, { title: "Из файла два", philosophers: ["Шелер"], file: fileTree("файловый предок", "Плотин"), method: "analytical" });
  await sql`insert into synthesis_members (synthesis_id, user_id, role, status, invited_by, accepted_at) values (${PRIV}, ${member.id}, 'reviewer', 'active', ${stranger.id}, now())`;
  await sql`insert into synthesis_members (synthesis_id, user_id, role, status, invited_by) values (${PRIV}, ${invited.id}, 'reviewer', 'invited', ${stranger.id})`;

  console.log("\n■ B. Д-88: один обход родословной");
  {
    const walk = await LS.loadLineageWalk([F1, CHILD]);
    const of = (id) => walk.filter((r) => r.rootId === id).map((r) => `${r.kind}:${r.key}@${r.depth}`).sort();
    ok(J(of(F1)) === J(["concept:file:файловый предок@1", "philosopher:Бергсон@1", "philosopher:Плотин@2"]), "B1 дерево файла: узел на позиции действующей строки перекрыт, вложенный философ виден, безымянный пропущен, имя приведено", of(F1));
    ok(J(of(CHILD)) === J([`concept:id:${SRC}@1`, "philosopher:Гегель@2", "philosopher:Кант@2", "philosopher:Платон@1"]), "B2 строки БД: предок-концепция и его философы", of(CHILD));
    const filter = async (name) => (await SR.searchSyntheses({ scope: "mine", q: "", field: "title", philosophers: [name], philMode: "all", philArea: "lineage", epochPhilosophers: [], method: null, synthLevel: null, depth: null, lang: null, meta: null, descendantIds: null, status: null, dateFrom: null, dateTo: null, sort: "createdAt", orderDesc: true, page: 1, limit: 100 }, owner.id)).hits.map((h) => h.id);
    const mine = new Set([SRC, TWIN, CHILD, GP, A1, A2, F1, F2]);
    const rows = [];
    let same = true;
    for (const name of ["Кант", "Плотин", "Спиноза", "Перекрытый", "Платон"]) {
      const a = (await LS.searchByPhilosophers([name])).filter((id) => mine.has(id)).sort();
      const b = (await filter(name)).filter((id) => mine.has(id)).sort();
      const all = await LS.loadLineageWalk([...mine]);
      const c = [...new Set(all.filter((r) => r.kind === "philosopher" && r.key === name).map((r) => r.rootId))].sort();
      rows.push([name, a.length, b.length, c.length]);
      if (J(a) !== J(b) || J(a) !== J(c)) same = false;
    }
    ok(same && J(rows.map((r) => r[1])) === J([3, 2, 3, 0, 1]), "B3 три потребителя (/lineage/search, фильтр поиска, обход сходства) дают один ответ; философ узла файла находится, перекрытый — нет", rows);
    // Д-91: четвёртый потребитель — пересечения участников мета-синтеза
    const MS = await import("../server/services/meta-synthesis-service.ts");
    const anc = [...(await MS.collectPhilosopherAncestors(F1))].sort();
    const warn = await MS.checkGenealogyOverlaps([{ type: "synthesis", synthesisId: F1 }, { type: "philosopher", name: "Плотин" }]);
    const warn0 = await MS.checkGenealogyOverlaps([{ type: "synthesis", synthesisId: F1 }, { type: "philosopher", name: "Перекрытый" }]);
    ok(J(anc) === J(["Бергсон", "Плотин"]) && warn.length === 1 && /Плотин/.test(J(warn)) && warn0.length === 0, "B5 (Д-91) collectPhilosopherAncestors идёт тем же обходом: философ узла дерева файла — предок, пересечение с ним названо; перекрытый узел — нет", [anc, warn]);
    const api = await call(owner, `/lineage/search?philosopher=${encodeURIComponent("Плотин")}`);
    ok(api.status === 200 && J(api.body).includes(F1) && J(api.body).includes(F2), "B4 GET /lineage/search находит концепции по философу из дерева файла", [api.status]);
  }

  console.log("\n■ C. Маршрут похожих");
  {
    const r = await similar(owner, SRC);
    const mine = idsOf(r).filter((id) => [TWIN, PUB_EN, SHOW, PRIV, FAR, CHILD].includes(id));
    ok(r.status === 200 && mine[0] === TWIN && mine.includes(PUB_EN) && mine.includes(SHOW) && mine.includes(CHILD) && r.body.sourceContentOpen === true && r.body.capped === false, "C1 выдача: близнец первым; англоязычная, витрина и потомок — в выдаче", [r.status, mine.map((id) => ({ TWIN, PUB_EN, SHOW, CHILD })[id] ?? id), r.body?.items?.map((i) => i.title)]);
    const tw = item(r, TWIN)?.similarity;
    ok(tw?.grade === "strong" && tw.textCompared === true && !("textSkipped" in tw) && J(tw.reasons.philosophers) === J(["Гегель", "Кант"]) && J(tw.reasons.terms.slice().sort()) === J(["Бытие", "Снятие"]) && tw.reasons.termsTotal === 2 && J(tw.reasons.categories) === J(["Свобода"]) && tw.reasons.method && tw.reasons.synthLevel && J(tw.reasons.epochs) === J([3]), "C2 близнец: «сильно», философы, термины по лексемам («Бытия»→«Бытие», скобка снята) именами исходной, категория, метод, уровень, эпоха", tw);
    const txt = J(r.body);
    ok(!/"score"|"measure"|"weight"/.test(txt) && (r.body.items ?? []).every((i) => J(Object.keys(i.similarity).sort()) === J(i.similarity.textSkipped ? ["grade", "reasons", "textCompared", "textSkipped"] : ["grade", "reasons", "textCompared"]) && C.SIMILARITY_GRADES.includes(i.similarity.grade)) && !/\d\.\d{2,}/.test(J((r.body.items ?? []).map((i) => i.similarity))), "C3 числа меры в ответе нет: только ступень словами и причины");
    const ch = item(r, CHILD)?.similarity;
    ok(ch?.reasons.kin === "descendant" && J(ch.reasons.philosophers) === J([]) && J(ch.reasons.lineagePhilosophers) === J(["Гегель", "Кант"]) && ch.reasons.ancestorsTotal === 0, "C4 потомок: прямое родство и философы через предка", ch);
    const back = item(await similar(owner, CHILD), SRC)?.similarity;
    ok(back?.reasons.kin === "ancestor", "C5 обратно: исходная — предок потомка", back);
    const a = item(await similar(owner, A1), A2)?.similarity;
    ok(a && J(a.reasons.ancestors) === J([{ id: GP, title: `Общий предок ${TAG}` }]) && a.reasons.ancestorsTotal === 1 && J(a.reasons.lineagePhilosophers) === J(["Спиноза"]) && a.reasons.kin === null && J(a.reasons.philosophers) === J([]), "C6 общий предок: назван со ссылкой, философ предка — в причинах", a);
    const f = item(await similar(owner, F1), F2)?.similarity;
    ok(f && J(f.reasons.ancestors) === J([{ title: "«Файловый  Предок»" }]) && J(f.reasons.lineagePhilosophers) === J(["Плотин"]), "C7 общий предок-снимок из дерева файла: сошлись по приведённому имени, назван именем исходной, без ссылки", f);
    ok(!idsOf(r).includes(FAR) && !idsOf(r).includes(SRC), "C8 без общего содержательного (только метод и уровень) в выдачу не идёт; сама концепция — тоже");
    const one = await similar(owner, SRC, "?limit=1");
    const bad = await similar(owner, SRC, "?limit=0");
    const big = await similar(owner, SRC, `?limit=${C.SIMILAR_LIMIT_MAX + 1}`);
    ok(one.body.items.length === 1 && one.body.items[0].id === TWIN && bad.status === 400 && bad.body.code === "VALIDATION_ERROR" && big.status === 400, "C9 limit: 1 — лучший; 0 и сверх предела — 400", [one.body?.items?.length, bad.status, big.status]);
    const capped = await SM.findSimilar({ id: SRC, lang: "Russian", method: "dialectical", synthLevel: "comparative", contentOpen: true }, owner.id, 6, 1);
    ok(capped.capped === true && capped.hits.length <= 1 && (capped.hits[0]?.id ?? TWIN) === TWIN, "C10 потолок кандидатов: сработал — capped, в счёт идут кандидаты с наибольшим числом общего", [capped.capped, capped.hits.map((h) => h.id)]);
    const nf = await similar(owner, "00000000-0000-4000-8000-000000000000");
    const nu = await similar(owner, "not-a-uuid");
    const full = await call(owner, `/syntheses/${SRC}`);
    ok(nf.status === 404 && nu.status === 404 && full.status === 200, "C11 нет концепции — 404; маршрут не перехватил GET /syntheses/:id", [nf.status, nu.status, full.status]);
    const prev = item(r, PUB_EN);
    ok(prev && prev.title === `English twin ${TAG}` && Array.isArray(prev.philosophers) && "capsulePreview" in prev && "visibility" in prev, "C12 строка выдачи — превью каталога", prev && Object.keys(prev));
  }

  console.log("\n■ D. Видимость и содержание");
  {
    const r = await similar(owner, SRC);
    ok(!idsOf(r).includes(PRIV), "D1 чужая приватная — не кандидат");
    const en = item(r, PUB_EN)?.similarity;
    ok(en?.textCompared === false && en.textSkipped === "language" && J(en.reasons.terms) === J([]) && en.reasons.termsTotal === 0 && J(en.reasons.categories) === J([]) && J(en.reasons.philosophers) === J(["Гегель", "Кант"]) && en.grade === "strong", "D2 другой язык генерации: термины и категории не сравниваются (хотя строки те же), философы — сравниваются", en);
    const sh = item(r, SHOW)?.similarity;
    ok(sh?.textCompared === false && sh.textSkipped === "closed" && J(sh.reasons.terms) === J([]) && J(sh.reasons.categories) === J([]) && sh.reasons.termsTotal === 0 && sh.reasons.categoriesTotal === 0 && J(sh.reasons.philosophers) === J(["Кант"]), "D3 витрина-кандидат: термины и категории не читаются, только признаки без содержания", sh);
    const viaShow = await similar(owner, SHOW);
    const its = (viaShow.body?.items ?? []).filter((i) => [SRC, TWIN, PUB_EN].includes(i.id));
    ok(viaShow.status === 200 && viaShow.body.sourceContentOpen === false && its.length >= 2 && its.every((i) => i.similarity.textCompared === false && i.similarity.reasons.terms.length === 0 && i.similarity.reasons.categories.length === 0), "D4 витрина-исходная: её термины и категории не сравниваются ни с кем", [viaShow.status, viaShow.body?.sourceContentOpen, its.map((i) => i.similarity)]);
    const st = await similar(stranger, SHOW);
    const stSrc = (st.body?.items ?? []).map((i) => i.id);
    ok(st.body.sourceContentOpen === true && !stSrc.includes(SRC) && !stSrc.includes(TWIN) && stSrc.includes(PRIV) && item(st, PRIV).similarity.textCompared === true && item(st, PRIV).similarity.reasons.terms.length === 1, "D5 владелец витрины: своё содержание открыто, чужие приватные не кандидаты, своя приватная — кандидат с терминами", [stSrc.length, item(st, PRIV)?.similarity]);
    const mem = await similar(member, PUB_EN);
    const inv = await similar(invited, PUB_EN);
    const own = await similar(owner, PUB_EN);
    ok(idsOf(mem).includes(PRIV) && !idsOf(inv).includes(PRIV) && !idsOf(own).includes(PRIV) && item(mem, PRIV).similarity.textSkipped === "language", "D6 участник видит приватную кандидатом; приглашённый, не принявший, и посторонний — нет", [idsOf(mem).includes(PRIV), idsOf(inv).includes(PRIV), idsOf(own).includes(PRIV)]);
    const guest = await similar(null, PUB_EN);
    const gIds = idsOf(guest);
    const vis = gIds.length ? await sql`select id, visibility from syntheses where id in ${sql(gIds)}` : [];
    ok(guest.status === 200 && gIds.includes(SHOW) && vis.every((v) => v.visibility !== "private") && !gIds.includes(SRC) && !gIds.includes(TWIN) && !J(guest.body).includes("totalCostUsd"), "D7 гость: только публичные кандидаты, превью гостевое", [guest.status, gIds.length]);
    const g403 = await similar(null, SRC);
    const s403 = await similar(stranger, SRC);
    ok(g403.status === 403 && s403.status === 403, "D8 чужая приватная исходная: гостю и постороннему — 403", [g403.status, s403.status]);
    const hid = item(await similar(stranger, A1), A2)?.similarity;
    ok(hid && J(hid.reasons.ancestors) === J([]) && hid.reasons.ancestorsTotal === 1 && !J(hid).includes("Общий предок"), "D9 общий предок, смотрящему не видимый: сосчитан, но не назван", hid);
    const stay = await sql`select count(*)::int n from information_schema.tables where table_name like '%similar%'`;
    ok(stay[0].n === 0, "D10 попарные меры в БД не хранятся: таблиц сходства нет");
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
