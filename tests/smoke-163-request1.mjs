/**
 * Дымовой прогон беседы 16.3, первый запрос (обсуждение и рецензии в
 * документе — клиент):
 *   A — исходники и чистые функции: компоненты обсуждения без
 *       dangerouslySetInnerHTML, ссылка { __html } SectionView прежняя и
 *       пометки — наложением (.doc-body-host), гейты canDiscuss на вкладках/
 *       панели/кнопке, MARK_TABLES ≡ TABLE_SUBSECTIONS рендерера, маршрут
 *       рецензии под RequireAuth, CSS-блок (палитра/углы/тени), ключи en/de;
 *       threadsOf/orderThreads, paragraphsOf, targetOf ≡ ключам shared,
 *       recommendationsAt/findingsAt — только по адресу;
 *   B — живьём по HTTP (PG + Redis, app.request без порта, импорт образца
 *       владельцем, участник строкой synthesis_members): гейты сводки
 *       401/404/403; ключи клиента (targetOf) находят объекты сервера —
 *       категория, связь, тезис, термин, подраздел, раздел, концепция;
 *       сводка byAddress под теми же ключами; черновик рецензии →
 *       замечание по адресу категории («в мою рецензию») → публикация →
 *       findings в сводке, totals.reviews; чужой черновик — 404.
 *
 * Запуск (из корня, PG/Redis подняты, миграции до 0018, сиды на месте):
 *   npx tsx tests/smoke-163-request1.mjs
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 900) : ""}`); }
}
const TAG = "s163-" + Math.random().toString(36).slice(2, 7);
const rd = (rel) => readFileSync(ROOT + rel, "utf8");
const strip = (src) => src.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

const LOC = await import("../server/i18n/locale.ts");
LOC.installServerCatalogProvider();
const DA = await import("@philosynth/shared/utils/discussion-address");
const ER = await import("../server/services/element-renderer.ts");
const IS = await import("../server/services/import-service.ts");
const RS = await import("../server/routes/syntheses.ts");
const { discussionRoutes } = await import("../server/routes/discussion.ts");
const { closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");
// чистые функции клиента (TS через tsx; shared — по алиасу пакета)
const U = await import("../client/src/utils/discussion.ts");
const DP = await import("../client/src/components/discussion/DiscussionPanel.tsx");
const AM = await import("../client/src/components/discussion/AddressMarks.tsx");

console.log("\n■ A. Исходники и чистые функции");
{
  const files = ["client/src/components/discussion/AddressMarks.tsx", "client/src/components/discussion/CommentThread.tsx", "client/src/components/discussion/DiscussionPanel.tsx", "client/src/components/discussion/DiscussionTab.tsx", "client/src/components/discussion/ReviewsTab.tsx", "client/src/components/discussion/UserText.tsx", "client/src/pages/ReviewPage.tsx", "client/src/utils/discussion.ts", "client/src/api/discussion.ts"];
  const bad = files.filter((f) => /dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML/.test(strip(rd(f))));
  ok(bad.length === 0, "A1 компоненты обсуждения и рецензий без dangerouslySetInnerHTML / innerHTML", bad);
  const mutators = files.filter((f) => /api\/(sections|elements|plans|transforms|enrichment|modes|generation)"|updateSubsection|createPlan|planRecommendations|regenerate/.test(strip(rd(f))));
  ok(mutators.length === 0, "A2 из обсуждения документ не меняется — транспортов правки нет (Фаза 17)", mutators);
  const sv = strip(rd("client/src/components/document/SectionView.tsx"));
  ok(/const innerHtmlProp = useMemo\(\(\) => \(\{ __html: enrichedHtml \}\), \[enrichedHtml\]\);/.test(sv) && /<div className="doc-body-host" ref=\{hostRef\}>/.test(sv) && /\{marks\?\.\(\{ host: hostRef, html: enrichedHtml \}\)\}/.test(sv) && !/addr-mark/.test(sv) && !/useEffect|useLayoutEffect/.test(sv), "A3 SectionView: ссылка { __html } прежняя, пометки — сосед в .doc-body-host, без эффектов");
  const am = strip(rd("client/src/components/discussion/AddressMarks.tsx"));
  ok(/\n  useEffect\(\(\) => \{\s*const el = host\.current;/.test(am) && /getBoundingClientRect\(\)/.test(am) && /new ResizeObserver\(/.test(am) && !/innerHTML|appendChild|insertBefore|createElement/.test(am), "A4 AddressMarks измеряет DOM в useEffect (ref хозяина) и не пишет в тело раздела");
  const T = ER.TABLE_SUBSECTIONS;
  ok(AM.MARK_TABLES[T.categories] === "category" && AM.MARK_TABLES[T.edges] === "edge" && AM.MARK_TABLES[T.theses] === "thesis" && AM.MARK_TABLES[T.glossary] === "glossary_term" && Object.keys(AM.MARK_TABLES).length === 4, "A5 MARK_TABLES ≡ TABLE_SUBSECTIONS рендерера (4 таблицы)", AM.MARK_TABLES);
  const sp = strip(rd("client/src/pages/SynthesisPage.tsx"));
  ok(/const canDiscuss = synthesis\?\.capabilities\?\.discuss \?\? false;/.test(sp) && /\{\(isOwner \|\| canDiscuss\) && \(\s*<div className="actions-bar page-tabs"/.test(sp) && /\{canDiscuss && pageTab === "discussion" && \(\s*<DiscussionTab/.test(sp) && /\{canDiscuss && pageTab === "reviews" && <ReviewsTab/.test(sp) && /\{canDiscuss && discussTarget && \(\s*<DiscussionPanel/.test(sp) && /sectionMarksFor=\{\s*canDiscuss\s*\?/.test(sp) && /recommendations=\{isOwner \? recRows : null\}/.test(sp), "A6 SynthesisPage: вкладки/панель/пометки под canDiscuss, критика в панель — владельцу");
  ok(/path="\/synthesis\/:id\/reviews\/:rid"[\s\S]{0,80}<RequireAuth>\s*<ReviewPage \/>/.test(rd("client/src/App.tsx")), "A7 маршрут /synthesis/:id/reviews/:rid под RequireAuth");
  const css = rd("client/src/globals.css");
  const block = css.split("Беседа 16.3 — обсуждение и рецензии")[1]?.split("/* Утилиты Tailwind")[0] ?? "";
  ok(block.length > 0 && !/#[0-9a-fA-F]{3,8}\b/.test(block) && !/border-radius|box-shadow/.test(block) && [".doc-body-host", ".addr-mark", ".discuss-dock", ".user-text p", ".review-finding"].every((c) => block.includes(c)), "A8 CSS-блок 16.3: закрытая палитра, без скруглений и теней");
  const STR = JSON.parse(rd("packages/shared/i18n/strings.json")).strings;
  const keys = ["synthesisPage.tabDiscussion", "synthesisPage.tabReviews", "discussion.discussionPanel.toReview", "discussion.discussionTab.title", "discussion.reviewsTab.start", "reviewPage.publish", "utils.discussion.stateOutdated"];
  ok(keys.every((k) => STR[k]?.en && STR[k]?.de), "A9 ключи 16.3 с en/de");
  // чистые функции
  const mk = (id, parentId, status, at, extra = {}) => ({ id, parentId, status, createdAt: at, address: { kind: "category", key: "x", id: null }, author: { id: "u" }, ...extra });
  const flat = [mk("r1", null, "resolved", "1"), mk("a1", "r1", "open", "2"), mk("r2", null, "open", "3"), mk("a2", "r2", "open", "4"), mk("orphan", "zzz", "open", "5")];
  const threads = U.threadsOf(flat);
  const ordered = U.orderThreads(threads);
  ok(threads.length === 2 && threads[0].replies.length === 1 && threads[1].replies[0].id === "a2" && ordered[0].root.id === "r2" && ordered[1].root.id === "r1", "A10 threadsOf собирает ветки по parentId (сирота отброшена), orderThreads — открытые первыми");
  ok(J(U.paragraphsOf("a\r\nb\n\n\n c \n\nd")) === J(["a\nb", "c", "d"]) && U.paragraphsOf("").length === 0, "A11 paragraphsOf — абзацы по пустой строке, переводы внутри абзаца целы");
  const cat = U.targetOf("category", "«Бытие» (сущее)", "graph", "t");
  const edge = U.targetOf("edge", { source: "Бытие", target: "Ничто", type: "Противоречие" }, "graph", "t");
  const sub = U.targetOf("subsection", DA.subsectionKey("sum", "Таблица категорий"), "sum", "t");
  const th = U.targetOf("thesis", " Т1 ", "theses", "t");
  const term = U.targetOf("glossary_term", "Логос", "glossary", "t");
  ok(cat.key === DA.categoryKey("«Бытие» (сущее)") && cat.target.key === "«Бытие» (сущее)" && edge.key === DA.edgeKey("Бытие", "Ничто", "Противоречие") && edge.target.key === edge.key && sub.key === "sum:Таблица категорий" && th.key === "Т1" && term.key === DA.termKey("Логос") && U.addressKeyOfTarget(cat) === DA.addressKeyOf("category", cat.key), "A12 targetOf: ключ сводки ≡ ключам shared, серверу — имя как в документе (категория/термин), связь — готовый edgeKey");
  const tfa = U.targetFromAddress({ address: { kind: "category", key: "бытие", id: "old" }, resolution: { currentId: "new" } });
  ok(tfa.target.id === "new" && tfa.target.key === "бытие" && tfa.kind === "category", "A13 targetFromAddress — серверу текущий id + ключ");
  const recs = [
    { id: "1", addressSection: "sum", addressSubsection: "Таблица категорий", elementId: null, elementKind: null, element: null },
    { id: "2", addressSection: "graph", addressSubsection: "Описание", elementId: "c1", elementKind: "category", element: "Бытие" },
    { id: "3", addressSection: "theses", addressSubsection: "Сводная таблица тезисов", elementId: "t1", elementKind: "thesis", element: "Тезис Т1" },
    { id: "4", addressSection: "sum", addressSubsection: "Другое", elementId: null, elementKind: null, element: null },
  ];
  ok(J(DP.recommendationsAt(recs, sub).map((r) => r.id)) === J(["1"]) && J(DP.recommendationsAt(recs, U.targetOf("category", "Бытие", null, "")).map((r) => r.id)) === J(["2"]) && J(DP.recommendationsAt(recs, th).map((r) => r.id)) === J(["3"]) && DP.recommendationsAt(recs, edge).length === 0 && DP.recommendationsAt(recs, U.targetOf("section", "sum", "sum", "")).length === 2, "A14 recommendationsAt — только по адресу строки (подраздел/элемент/раздел), связь — пусто");
  const reviews = [
    { status: "published", findings: [{ id: "f1", address: { kind: "category", key: cat.key } }, { id: "f2", address: { kind: "thesis", key: "Т1" } }] },
    { status: "draft", findings: [{ id: "f3", address: { kind: "category", key: cat.key } }] },
    { status: "withdrawn", findings: [{ id: "f4", address: { kind: "category", key: cat.key } }] },
  ];
  ok(J(DP.findingsAt(reviews, cat).map((x) => x.finding.id)) === J(["f1"]), "A15 findingsAt — замечания только опубликованных и только этого адреса");
  const sm = U.summaryMap({ byAddress: [{ kind: "category", key: "a", openComments: 2, findings: 1 }], totals: { openComments: 2, findings: 1, reviews: 1 } });
  ok(sm.get("category:a")?.openComments === 2 && U.summaryMap(null).size === 0, "A16 summaryMap — карта «вид:ключ»");
}

console.log("\n■ B. Живьём по HTTP");
const userIds = [];
const app = new Hono();
app.route("/syntheses", RS.synthesesRoutes);
app.route("/syntheses", discussionRoutes);
async function mkUser(name) {
  const [u] = await sql`insert into users (email, password_hash, display_name) values (${`${TAG}-${name}@s.local`}, 'x', ${name}) returning id`;
  userIds.push(u.id);
  const token = `${TAG}-${name}-${Date.now()}`;
  await sql`insert into sessions (id, user_id, expires_at) values (${createHash("sha256").update(token).digest("hex")}, ${u.id}, now() + interval '1 hour')`;
  return { id: u.id, cookie: `philosynth_session=${token}` };
}
const call = async (method, path, body, who) => {
  const r = await app.request(path, { method, headers: { "content-type": "application/json", ...(who ? { cookie: who.cookie } : {}) }, body: body === undefined ? undefined : J(body) });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
};
let S = null;
try {
  const owner = await mkUser("owner"), rev = await mkUser("rev"), str = await mkUser("str");
  const sampleFile = readdirSync(ROOT + "sample").find((f) => f.endsWith(".html"));
  ({ synthesisId: S } = await IS.importHTML(rd("sample/" + sampleFile), owner.id, sampleFile));
  ok(!!S, "B0 импорт образца владельцем");
  await sql`insert into synthesis_members (synthesis_id, user_id, role, status, invited_by, accepted_at) values (${S}, ${rev.id}, 'reviewer', 'active', ${owner.id}, now())`;

  // B1 гейты сводки и capabilities
  const g401 = await call("GET", `/syntheses/${S}/discussion/summary`);
  const gStr = await call("GET", `/syntheses/${S}/discussion/summary`, undefined, str);
  const gRev = await call("GET", `/syntheses/${S}/discussion/summary`, undefined, rev);
  const full = await call("GET", `/syntheses/${S}`, undefined, rev);
  const fullStr = await call("GET", `/syntheses/${S}`, undefined, str);
  ok(g401.status === 401 && [403, 404].includes(gStr.status) && gRev.status === 200 && J(gRev.json.totals) === J({ openComments: 0, findings: 0, reviews: 0 }), "B1a сводка: 401 гость, 403/404 чужой, участнику — пустые totals", { g401: g401.status, gStr: gStr.status, gRev: gRev.json });
  ok(full.status === 200 && full.json.synthesis.capabilities.discuss === true && full.json.synthesis.capabilities.manage === false && [403, 404].includes(fullStr.status), "B1b capabilities.discuss участнику true, manage false; чужому приватная закрыта (вкладок у него нет)");

  // B2 ключи клиента находят объекты сервера
  const [cat] = await sql`select id, name from categories where synthesis_id=${S} order by name limit 1`;
  const [edgeRow] = await sql`select s.name as src, t.name as tgt, e.edge_type as type from category_edges e join categories s on s.id=e.source_id join categories t on t.id=e.target_id where e.synthesis_id=${S} limit 1`;
  const [th] = await sql`select label, thesis_num from theses where synthesis_id=${S} order by thesis_num limit 1`;
  const [term] = await sql`select term from glossary_terms where synthesis_id=${S} limit 1`;
  const secs = await sql`select key, html_content from sections where synthesis_id=${S} and html_content like '%data-section="%' order by key`;
  const sec = secs[0];
  const subName = sec.html_content.match(/data-section="([^"]+)"/)[1];
  const tCat = U.targetOf("category", cat.name, "graph", "");
  const tEdge = U.targetOf("edge", { source: edgeRow.src, target: edgeRow.tgt, type: edgeRow.type }, "graph", "");
  const tTh = U.targetOf("thesis", DA.thesisKey(th.label, th.thesis_num), "theses", "");
  const tTerm = U.targetOf("glossary_term", term.term, "glossary", "");
  const tSub = U.targetOf("subsection", DA.subsectionKey(sec.key, subName), sec.key, "");
  const tSec = U.targetOf("section", sec.key, sec.key, "");
  const tSyn = U.targetOf("synthesis", S, null, "");
  const made = {};
  for (const [name, t] of Object.entries({ cat: tCat, edge: tEdge, th: tTh, term: tTerm, sub: tSub, sec: tSec, syn: tSyn })) {
    made[name] = await call("POST", `/syntheses/${S}/comments`, { target: t.target, body: `${name} ${TAG}`, kind: name === "cat" ? "objection" : null }, rev);
  }
  const statuses = Object.fromEntries(Object.entries(made).map(([k, v]) => [k, v.status]));
  ok(Object.values(statuses).every((s) => s === 201), "B2a семь адресов по ключам клиента → 201 (категория, связь, тезис, термин, подраздел, раздел, концепция)", { statuses, errors: Object.fromEntries(Object.entries(made).filter(([, v]) => v.status !== 201).map(([k, v]) => [k, v.json])) });
  ok(made.cat.json?.address?.key === tCat.key && made.edge.json?.address?.key === tEdge.key && made.th.json?.address?.key === tTh.key && made.term.json?.address?.key === tTerm.key && made.sub.json?.address?.key === tSub.key && made.sec.json?.address?.key === tSec.key && made.syn.json?.address?.key === S, "B2b ключи адресов в ответе ≡ ключам клиента (пометка найдёт свой счётчик)", { got: Object.fromEntries(Object.entries(made).map(([k, v]) => [k, v.json?.address?.key])), want: { cat: tCat.key, edge: tEdge.key } });
  ok(made.cat.json?.kind === "objection" && made.cat.json?.resolution?.state === "current" && made.cat.json?.excerpt?.length > 0, "B2c вид комментария, состояние current, выдержка записана");

  // B3 сводка под теми же ключами; ответ не считается; решённая ветка выпадает
  await call("POST", `/syntheses/${S}/comments`, { parentId: made.cat.json.id, body: "ответ владельца" }, owner);
  const sum1 = await call("GET", `/syntheses/${S}/discussion/summary`, undefined, owner);
  const m1 = U.summaryMap(sum1.json);
  ok(sum1.json.totals.openComments === 7 && m1.get(U.addressKeyOfTarget(tCat))?.openComments === 1 && m1.get(U.addressKeyOfTarget(tEdge))?.openComments === 1 && m1.get(U.addressKeyOfTarget(tSub))?.openComments === 1, "B3a сводка: 7 открытых веток, ответ не считается, ключи ≡ addressKeyOfTarget", sum1.json);
  const list = await call("GET", `/syntheses/${S}/comments?kind=category&key=${encodeURIComponent(tCat.key)}`, undefined, rev);
  const thr = U.threadsOf(list.json.comments);
  ok(list.status === 200 && thr.length === 1 && thr[0].replies.length === 1 && thr[0].root.id === made.cat.json.id, "B3b список по адресу (как панель) → одна ветка с ответом");
  const res = await call("POST", `/syntheses/${S}/comments/${made.edge.json.id}/resolve`, undefined, owner);
  const sum2 = await call("GET", `/syntheses/${S}/discussion/summary`, undefined, owner);
  ok(res.status === 200 && res.json.status === "resolved" && sum2.json.totals.openComments === 6 && !U.summaryMap(sum2.json).has(U.addressKeyOfTarget(tEdge)), "B3c решённая владельцем ветка связи выпала из сводки");
  const hid = await call("POST", `/syntheses/${S}/comments/${made.th.json.id}/hide`, undefined, owner);
  const hidRev = await call("POST", `/syntheses/${S}/comments/${made.term.json.id}/hide`, undefined, rev);
  const sum3 = await call("GET", `/syntheses/${S}/discussion/summary`, undefined, owner);
  ok(hid.status === 200 && hid.json.hidden === true && hidRev.status === 403 && sum3.json.totals.openComments === 5, "B3d скрытие — владельцу 200, участнику 403; скрытая ветка не в сводке");

  // B4 рецензия: черновик → замечание по адресу («в мою рецензию») → публикация → findings в сводке
  const draft = await call("POST", `/syntheses/${S}/reviews`, {}, rev);
  const listO = await call("GET", `/syntheses/${S}/reviews`, undefined, owner);
  const getO = await call("GET", `/syntheses/${S}/reviews/${draft.json?.id}`, undefined, owner);
  ok(draft.status === 201 && draft.json.status === "draft" && listO.json.length === 0 && getO.status === 404, "B4a черновик участника: владельцу не виден (список пуст, GET 404)", { draft: draft.status, listO: listO.json?.length, getO: getO.status });
  const f1 = await call("POST", `/syntheses/${S}/reviews/${draft.json.id}/findings`, { target: tCat.target, body: "замечание из панели", kind: "unclear" }, rev);
  const upd = await call("PATCH", `/syntheses/${S}/reviews/${draft.json.id}`, { title: `Рецензия ${TAG}`, summary: "абзац один\n\nабзац два" }, rev);
  ok(f1.status === 201 && f1.json.findings.length === 1 && f1.json.findings[0].address.key === tCat.key && upd.status === 200 && upd.json.title === `Рецензия ${TAG}`, "B4b замечание по ключу категории + поля черновика");
  const sumD = await call("GET", `/syntheses/${S}/discussion/summary`, undefined, owner);
  ok(sumD.json.totals.findings === 0 && sumD.json.totals.reviews === 0, "B4c до публикации замечание черновика в сводке не считается");
  const pub = await call("POST", `/syntheses/${S}/reviews/${draft.json.id}/publish`, undefined, rev);
  const sumP = await call("GET", `/syntheses/${S}/discussion/summary`, undefined, owner);
  const mP = U.summaryMap(sumP.json);
  ok(pub.status === 200 && pub.json.status === "published" && pub.json.revision === 1 && sumP.json.totals.findings === 1 && sumP.json.totals.reviews === 1 && mP.get(U.addressKeyOfTarget(tCat))?.findings === 1, "B4d публикация → findings=1 у адреса категории, reviews=1", sumP.json);
  const listO2 = await call("GET", `/syntheses/${S}/reviews`, undefined, owner);
  const beside = DP.findingsAt(listO2.json, tCat);
  ok(listO2.json.length === 1 && beside.length === 1 && beside[0].finding.body === "замечание из панели" && DP.findingsAt(listO2.json, tEdge).length === 0, "B4e владелец видит опубликованную; findingsAt для панели — замечание рядом только у своего адреса");
  const revs = await call("GET", `/syntheses/${S}/reviews/${draft.json.id}/revisions`, undefined, owner);
  const wd = await call("POST", `/syntheses/${S}/reviews/${draft.json.id}/withdraw`, undefined, rev);
  const sumW = await call("GET", `/syntheses/${S}/discussion/summary`, undefined, owner);
  ok(revs.status === 200 && revs.json.length === 1 && wd.status === 200 && wd.json.status === "withdrawn" && sumW.json.totals.findings === 0, "B4f редакция записана; отзыв убирает findings из сводки");
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
} finally {
  console.log(`\nИТОГ: ${passed} ✓, ${failed} ✗${fails.length ? "\n  " + fails.join("\n  ") : ""}`);
  try {
    if (S) await sql`delete from syntheses where id=${S}`;
    for (const id of userIds) await sql`delete from sessions where user_id=${id}`;
    for (const id of userIds) await sql`delete from users where id=${id}`;
  } catch (e2) { console.error("уборка:", e2); }
  await Promise.race([Promise.all([closeDb(), closeRedis()]), sleep(2000)]);
  await Promise.race([sql.end(), sleep(2000)]);
  process.exit(failed ? 1 : 0);
}
