/**
 * Дымовой прогон беседы 17.2, первый запрос (соавторство в интерфейсе):
 *   A — чистые функции клиента: способы принятия ≡ серверу, группы вкладки
 *       «Предложения», разбор 409 VERSION_CONFLICT (conflictsOf / conflictText),
 *       перенос набранного на перечитанный объект (rebaseDraft), хэши
 *       ожиданий плана ≡ хэшам сервера, разница (пополевая, текстовая),
 *       фразы журнала предложения и происхождения версии;
 *   B — живьём, НАСТОЯЩИМИ функциями client/src/api/* (fetch подменён на
 *       app.request, cookie — текущего персонажа): номер версии в DTO чтения
 *       элементов (Д-81); четыре пути записи с ожиданием — элемент, подраздел,
 *       капсула, план: второй пишущий получает 409 с текущим значением,
 *       «перечитать и повторить» проходит, чужая правка не затёрта; редактор
 *       правит и читает рекомендации, рецензент — нет;
 *   C — предложения: рецензент предлагает замену термина (как форма
 *       ProposeForm) → владелец «принимает» = ЧЕРНОВИК плана, документ не
 *       тронут → исполнение плана → accepted, версия 'proposal' → фраза
 *       истории «принято предложение № N пользователя X»; второе предложение
 *       по тому же термину — устарело (группа stale, принять — 409
 *       PROPOSAL_STALE), «новое поверх текущего» автором, отклонение.
 *
 * Запуск (из корня, PG/Redis подняты, миграции до 0019, сиды на месте):
 *   node_modules/.bin/tsx tests/smoke-172-request1.mjs
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
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 1200) : ""}`); }
}
const TAG = "s172-" + Math.random().toString(36).slice(2, 7);
const rd = (rel) => readFileSync(ROOT + rel, "utf8");

const LOC = await import("../server/i18n/locale.ts");
const EV = await import("@philosynth/shared/utils/expected-version");
const PR = await import("../server/services/proposals.ts");
const IS = await import("../server/services/import-service.ts");
const RS = await import("../server/routes/syntheses.ts");
const { elementsRoutes } = await import("../server/routes/elements.ts");
const { sectionsRoutes } = await import("../server/routes/sections.ts");
const { plansRoutes } = await import("../server/routes/plans.ts");
const { membersRoutes } = await import("../server/routes/members.ts");
const { discussionRoutes } = await import("../server/routes/discussion.ts");
const { proposalsRoutes } = await import("../server/routes/proposals.ts");
const { recommendationsRoutes } = await import("../server/routes/recommendations.ts");
await import("../server/services/plan-executor.ts");
const { closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");

// клиентские модули (после них — снова серверный провайдер каталога, 09 §4 14.2)
const C = await import("../client/src/api/client.ts");
const AE = await import("../client/src/api/elements.ts");
const AS = await import("../client/src/api/sections.ts");
const AP = await import("../client/src/api/plans.ts");
const APR = await import("../client/src/api/proposals.ts");
const AR = await import("../client/src/api/recommendations.ts");
const ASY = await import("../client/src/api/syntheses.ts");
const UP = await import("../client/src/utils/proposals.ts");
const VC = await import("../client/src/utils/version-conflict.ts");
const CS = await import("../client/src/stores/collab-store.ts");
const VH = await import("../client/src/components/edit/VersionHistory.tsx");
const SH = await import("../client/src/components/edit/SectionHistory.tsx");
LOC.installServerCatalogProvider();

console.log("\n■ A. Чистые функции клиента");
{
  let same = true;
  for (const a of ["category", "edge", "thesis", "glossary_term", "subsection", "section", "synthesis"])
    for (const k of ["replace", "note"]) if (J(UP.acceptMethodsFor(a, k)) !== J(PR.acceptMethodsFor(a, k))) same = false;
  ok(same, "A1 способы принятия клиента ≡ серверу (7 видов адресата × 2 вида предложения)");
  const g = UP.groupProposals([{ status: "open", stale: false }, { status: "open", stale: true }, { status: "accepted", stale: false }, { status: "rejected", stale: false }, { status: "closed", stale: true }]);
  ok(g.open.length === 1 && g.stale.length === 1 && g.decided.length === 3, "A2 вкладка: открытые / устаревшие / решённые", g);
  const one = new C.ApiError("x", "VERSION_CONFLICT", 409, { target: "thesis:abc", expected: { version: 2 }, current: { version: 3 } });
  const many = new C.ApiError("x", "VERSION_CONFLICT", 409, { conflicts: [{ target: "graph", expected: { hash: "a" }, current: { hash: "b" } }, { target: "sum:Имя", expected: { hash: "a" }, current: { hash: null } }] });
  const other = new C.ApiError("x", "FORBIDDEN", 403);
  const c1 = VC.conflictsOf(one), c2 = VC.conflictsOf(many);
  ok(c1?.length === 1 && c1[0].current.version === 3 && c2?.length === 2 && VC.conflictsOf(other) === null && VC.conflictsOf(new Error("x")) === null, "A3 conflictsOf: один адресат, список плана, не-конфликт → null");
  const t1 = VC.conflictText(c1[0], "Тезис О-1");
  ok(/Тезис О-1/.test(t1) && /2/.test(t1) && /3/.test(t1) && VC.conflictTargetKind("capsule") === "capsule" && VC.conflictTargetKind("sum:Имя") === "subsection" && VC.conflictTargetKind("graph") === "section" && /больше нет/.test(VC.conflictText(c2[1], "Имя")), "A4 фраза конфликта называет объект и ТЕКУЩУЮ версию; удалённый адресат — «больше нет»", t1);
  const r = VC.rebaseDraft({ formulation: "было", justification: "осн", type: "o" }, { formulation: "моё", justification: "осн", type: "o" }, { formulation: "было", justification: "чужое", type: "o" });
  ok(r.value.formulation === "моё" && r.value.justification === "чужое" && J(r.changedByOthers) === J(["justification"]), "A5 перечитка: набранное сохранено, чужая правка соседнего поля не затёрта", r);
  const ex = await VC.sectionExpectations(["graph", "graph", "none"], (k) => (k === "graph" ? "<div>  a\n b </div>" : undefined));
  ok(ex.length === 1 && ex[0].target === "graph" && ex[0].hash === (await EV.sectionContentHash("<div> a b </div>")), "A6 ожидания плана: хэш раздела ≡ серверному, раздел без текста пропущен", ex);
  const fd = UP.fieldDiff("definition", "старое определение", "новое определение");
  const sd = UP.subsectionDiff("<p>один</p><p>два</p>", "<p>один</p><p>три</p><ul><li>пункт</li></ul>");
  ok(!fd.same && fd.lines.some((l) => l.kind === "del") && fd.lines.some((l) => l.kind === "add") && !sd.same && sd.lines.filter((l) => l.kind === "ctx").length === 1 && sd.lines.some((l) => l.kind === "add" && l.text === "пункт") && UP.fieldDiff("term", " a ", "a").same, "A7 разница: пополевая у элемента, текстовая по блокам у подраздела", { fd, sd });
  ok(UP.markupToLines("<p>a &lt;b&gt; &amp; c</p><p></p>") === "a <b> & c", "A8 текст блока — без тегов, сущности раскрыты");
  ok(/план удалён/.test(UP.eventText({ type: "plan_released", payload: { reason: "plan_deleted" } })) && /раздел перегенерирован/.test(UP.eventText({ type: "accepted", payload: { stepType: "regen" } })) && /поверх текущего/.test(UP.eventText({ type: "rebased", payload: {} })), "A9 журнал предложения собирается из кодов (фраз в БД нет)");
  const props = [{ id: "p2", author: { name: "Вера" } }, { id: "p1", author: { name: "Рецензент" } }];
  const o = { kind: "proposal", proposalId: "p1", authorId: "u", source: "review_finding", sourceId: "f", reviewId: "r1", proposalKind: "replace", rationale: "", planId: null, stepIndex: 0, stepType: "edit_element" };
  const txt = VH.proposalOriginText(o, props, { r1: "О методе" });
  const bare = VH.proposalOriginText({ ...o, proposalId: "zz", source: "direct", stepType: "refine_element" }, [], {});
  ok(/№ 1/.test(txt) && /Рецензент/.test(txt) && /«О методе»/.test(txt) && /готовая замена/.test(txt) && /предложение участника/.test(bare) && /моделью/.test(bare) && CS.proposalNumberIn(props, "p2") === 2, "A10 происхождение: «принято предложение № N пользователя X · по рецензии «Y»»; без имён — без них", { txt, bare });
  const acc = SH.acceptedProposalsOf([{ status: "accepted", address: { kind: "section", key: "graph" } }, { status: "accepted", address: { kind: "subsection", key: "graph:Топология" } }, { status: "accepted", address: { kind: "subsection", key: "graphics:X" } }, { status: "open", address: { kind: "section", key: "graph" } }], "graph");
  ok(acc.length === 2, "A11 Д-86: принятые предложения раздела и его подразделов — для истории раздела");
  ok(UP.methodIsPaid("regen") && UP.methodIsPaid("refine_element") && !UP.methodIsPaid("edit_element") && UP.methodNeedsValue("edit_subsection") && !UP.methodNeedsValue("regen_subsection") && J(UP.replaceFieldsFor("thesis")) === J(["formulation", "justification"]) && UP.replaceFieldsFor("subsection").length === 0, "A12 способы: что платно (платит принявший), чему нужно значение; поля замены — белый список шага");
}

console.log("\n■ B. Ожидаемая версия живьём — функциями client/src/api");
const userIds = [];
const app = new Hono();
for (const r of [membersRoutes, RS.synthesesRoutes, sectionsRoutes, elementsRoutes, plansRoutes, discussionRoutes, proposalsRoutes, recommendationsRoutes]) app.route("/syntheses", r);
async function mkUser(name) {
  const [u] = await sql`insert into users (email, password_hash, display_name) values (${`${TAG}-${name}@s.local`}, 'x', ${name}) returning id`;
  userIds.push(u.id);
  const token = `${TAG}-${name}-${Date.now()}`;
  await sql`insert into sessions (id, user_id, expires_at) values (${createHash("sha256").update(token).digest("hex")}, ${u.id}, now() + interval '1 hour')`;
  return { id: u.id, name, cookie: `philosynth_session=${token}` };
}
// fetch клиента → app.request; персонаж — текущий `who`
let who = null;
globalThis.fetch = (url, init = {}) =>
  app.request(String(url).replace(/^\/api\/v1/, ""), { ...init, headers: { ...(init.headers ?? {}), ...(who ? { cookie: who.cookie } : {}) } });
const as = async (user, fn) => { who = user; try { return await fn(); } finally { who = null; } };
const caught = async (p) => { try { await p; return null; } catch (e) { return e; } };
let S = null;
try {
  const owner = await mkUser("owner"), editor = await mkUser("editor"), rev = await mkUser("rev");
  const sampleFile = readdirSync(ROOT + "sample").find((f) => f.endsWith(".html"));
  ({ synthesisId: S } = await IS.importHTML(rd("sample/" + sampleFile), owner.id, sampleFile));
  await sql`insert into synthesis_members (synthesis_id, user_id, role, status, invited_by, accepted_at) values (${S}, ${editor.id}, 'editor', 'active', ${owner.id}, now())`;
  await sql`insert into synthesis_members (synthesis_id, user_id, role, status, invited_by, accepted_at) values (${S}, ${rev.id}, 'reviewer', 'active', ${owner.id}, now())`;

  const sEd = await as(editor, () => ASY.getSynthesis(S));
  const sRev = await as(rev, () => ASY.getSynthesis(S));
  ok(sEd.capabilities.edit === true && sEd.capabilities.manage === false && sEd.isOwner === false && sRev.capabilities.edit === false && sRev.capabilities.discuss === true, "B1 страница берёт права из capabilities: редактор — edit без manage и не isOwner; рецензент — только discuss");

  // DTO чтения несёт номер версии (Д-81)
  const thesesO = await as(owner, () => AE.getTheses(S));
  const gloss = await as(owner, () => AE.getGlossary(S));
  const graph = await as(owner, () => AE.getCategories(S));
  const cat0 = await as(owner, () => AE.getCategory(S, graph.categories[0].id));
  ok(thesesO.length > 0 && thesesO.every((t) => t.version === 0) && gloss.every((t) => t.version === 0) && graph.categories.every((c) => c.version === 0) && graph.edges.every((e) => e.version === 0) && cat0.version === 0, "B2 чтение элементов отдаёт version (0 — версий не было): тезисы, термины, категории, связи, категория по id");

  // двое открыли один тезис; редактор сохранил первым
  const th = thesesO[0];
  const thEd = (await as(editor, () => AE.getTheses(S))).find((t) => t.id === th.id);
  const r1 = await as(editor, () => AE.updateThesis(S, th.id, { justification: `обоснование редактора ${TAG}` }, thEd.version));
  ok(r1.version.version === 1 && r1.thesis.justification === `обоснование редактора ${TAG}`, "B3a редактор правит тезис с ожиданием из DTO; ответ несёт новую версию");
  const e2 = await caught(as(owner, () => AE.updateThesis(S, th.id, { formulation: `формулировка владельца ${TAG}` }, th.version)));
  const cf = VC.conflictsOf(e2);
  const [rowNow] = await sql`select formulation, justification from theses where id=${th.id}`;
  ok(cf?.length === 1 && cf[0].target === `thesis:${th.id}` && cf[0].expected.version === 0 && cf[0].current.version === 1 && rowNow.formulation === th.formulation && rowNow.justification === `обоснование редактора ${TAG}`, "B3b владелец с тем же ожиданием → 409 VERSION_CONFLICT с текущей версией; запись не сделана", { code: e2?.code, cf });
  // «перечитать и повторить»: свежий тезис + перенос набранного
  const fresh = (await as(owner, () => AE.getTheses(S))).find((t) => t.id === th.id);
  const reb = VC.rebaseDraft({ formulation: th.formulation, justification: th.justification }, { formulation: `формулировка владельца ${TAG}`, justification: th.justification }, { formulation: fresh.formulation, justification: fresh.justification });
  const diffBody = {};
  for (const k of ["formulation", "justification"]) if (reb.value[k] !== fresh[k]) diffBody[k] = reb.value[k];
  const r3 = await as(owner, () => AE.updateThesis(S, th.id, diffBody, fresh.version));
  const [rowAfter] = await sql`select formulation, justification from theses where id=${th.id}`;
  ok(fresh.version === 1 && J(reb.changedByOthers) === J(["justification"]) && J(Object.keys(diffBody)) === J(["formulation"]) && r3.version.version === 2 && rowAfter.formulation === `формулировка владельца ${TAG}` && rowAfter.justification === `обоснование редактора ${TAG}`, "B3c перечитать и повторить: правка владельца прошла, правка редактора соседнего поля цела", { diffBody, rowAfter });
  const vs = await as(owner, () => AE.getVersionHistory(S, "thesis", th.id));
  const vEd = vs.find((v) => v.version === 1), vOw = vs.find((v) => v.version === 2);
  ok(vEd?.actor?.name === "editor" && vEd.actor.isOwner === false && !vOw?.actor, "B3d история: исполнитель — у правки редактора, у правки владельца имени нет");
  const eRev = await caught(as(rev, () => AE.updateThesis(S, th.id, { formulation: "рецензент" }, 2)));
  ok(eRev?.code === "FORBIDDEN", "B3e рецензент не правит (403)");

  // подраздел: хэш исходника → expectedHash
  const secs = await sql`select key, html_content from sections where synthesis_id=${S} and key not in ('capsule') order by key`;
  let sub = null;
  for (const s of secs) {
    for (const m of s.html_content.matchAll(/data-section="([^"]+)"/g)) {
      const src = await as(editor, () => AS.getSubsectionSource(S, s.key, m[1])).catch(() => null);
      if (src && !src.lock && src.html && src.nested.length === 0 && src.hash) { sub = { key: s.key, name: m[1], src }; break; }
    }
    if (sub) break;
  }
  const srcOwner = await as(owner, () => AS.getSubsectionSource(S, sub.key, sub.name));
  const u1 = await as(editor, () => AS.updateSubsection(S, sub.key, sub.name, sub.src.html + `<p>абзац редактора ${TAG}</p>`, sub.src.hash));
  const eSub = await caught(as(owner, () => AS.updateSubsection(S, sub.key, sub.name, srcOwner.html + `<p>абзац владельца ${TAG}</p>`, srcOwner.hash)));
  const cfSub = VC.conflictsOf(eSub);
  const srcFresh = await as(owner, () => AS.getSubsectionSource(S, sub.key, sub.name));
  ok(u1.ok !== false && cfSub?.length === 1 && cfSub[0].target === `${sub.key}:${sub.name}` && cfSub[0].current.hash === srcFresh.hash && srcFresh.html.includes(`абзац редактора ${TAG}`) && !srcFresh.html.includes("абзац владельца"), "B4a подраздел: второй пишущий → 409 с текущим хэшем; текст редактора цел", { code: eSub?.code, cfSub });
  const u2 = await as(owner, () => AS.updateSubsection(S, sub.key, sub.name, srcFresh.html + `<p>абзац владельца ${TAG}</p>`, srcFresh.hash));
  const srcBoth = await as(owner, () => AS.getSubsectionSource(S, sub.key, sub.name));
  ok(u2.ok !== false && srcBoth.html.includes(`абзац редактора ${TAG}`) && srcBoth.html.includes(`абзац владельца ${TAG}`) && /абзац редактора/.test(UP.markupToLines(srcFresh.html)), "B4b перечитать и повторить: в подразделе оба абзаца; текущий текст для формы — markupToLines исходника");

  // капсула
  const sOw = await as(owner, () => ASY.getSynthesis(S));
  const capHash = await EV.sectionContentHash(sOw.capsuleHtml);
  const capNew = sOw.capsuleHtml.replace(/<\/p>/, ` ${TAG}-ed</p>`);
  const c1 = await as(editor, () => AE.updateCapsule(S, capNew, capHash));
  const eCap = await caught(as(owner, () => AE.updateCapsule(S, sOw.capsuleHtml.replace(/<\/p>/, ` ${TAG}-ow</p>`), capHash)));
  const cfCap = VC.conflictsOf(eCap);
  ok(c1.capsuleHtml.includes(`${TAG}-ed`) && cfCap?.[0]?.target === "capsule" && cfCap[0].current.hash === (await EV.sectionContentHash(c1.capsuleHtml)), "B5 капсула: ожидание — хэш текста, к которому писали; второй → 409 с текущим хэшем", { code: eCap?.code });

  // план: ожидания по разделам, какими их видит человек
  const secFull = await as(owner, () => AS.getSection(S, sub.key));
  const stale = await VC.sectionExpectations([sub.key], () => secs.find((x) => x.key === sub.key).html_content);
  const freshEx = await VC.sectionExpectations([sub.key], () => secFull.htmlContent);
  const ePlan = await caught(as(owner, () => AP.createPlan(S, { regen: [sub.key], remove: [], add: [], expected: stale })));
  const cfPlan = VC.conflictsOf(ePlan);
  const plan = await as(owner, () => AP.createPlan(S, { regen: [sub.key], remove: [], add: [], expected: freshEx }));
  ok(cfPlan?.length === 1 && cfPlan[0].target === sub.key && cfPlan[0].current.hash === freshEx[0].hash && plan.status === "draft" && plan.steps.some((s) => s.type === "regen" && s.target === sub.key), "B6 план: раздел изменили после загрузки → 409 details.conflicts; с текущим хэшем — черновик создан", { code: ePlan?.code, cfPlan });
  await as(owner, () => AP.deletePlan(S, plan.id));

  // рекомендации: редактору открыты (право правки), рецензенту — нет
  const recEd = await caught(as(editor, () => AR.listRecommendations(S)));
  const recRev = await caught(as(rev, () => AR.listRecommendations(S)));
  ok(!(recEd instanceof Error) && recRev?.code === "FORBIDDEN", "B7 рекомендации критики: редактору — да, рецензенту — 403 (гейт страницы — capabilities.edit)");
  const mEd = await as(editor, async () => (await fetch(`/api/v1/syntheses/${S}/members`)).status);
  const delEd = await caught(as(editor, () => ASY.deleteSynthesis(S)));
  ok(mEd === 403 && [403, 404].includes(delEd?.status), "B8 управление редактору закрыто: участники — 403, удаление концепции — отказ (вкладки «Участники» у него нет)", { mEd, del: delEd?.status });

  console.log("\n■ C. Предложения — функциями client/src/api/proposals");
  const term = gloss[0];
  // как форма ProposeForm из панели адреса: target — ключ «как в документе»
  const p1 = await as(rev, () => APR.createProposal(S, { target: { kind: "glossary_term", key: term.term }, kind: "replace", field: "definition", value: `определение по предложению ${TAG}`, rationale: "точнее так" }));
  const p2 = await as(rev, () => APR.createProposal(S, { target: { kind: "glossary_term", key: term.term }, kind: "replace", field: "definition", value: `другое определение ${TAG}` }));
  const list1 = await as(owner, () => APR.listProposals(S));
  const g1 = UP.groupProposals(list1);
  ok(p1.status === "open" && !p1.stale && list1.length === 2 && g1.open.length === 2 && CS.proposalNumberIn(list1, p1.id) === 1 && CS.proposalNumberIn(list1, p2.id) === 2 && /версия 0/.test(UP.baseLine(p1)), "C1 рецензент предлагает замену; во вкладке — два открытых, номера по порядку создания", { n: list1.length });
  const eAccRev = await caught(as(rev, () => APR.acceptProposal(S, p1.id)));
  ok(eAccRev?.code === "FORBIDDEN", "C2 принять может только правящий (рецензенту — 403)");
  const acc = await as(owner, () => APR.acceptProposal(S, p1.id));
  const [termBefore] = await sql`select definition from glossary_terms where id=${term.id}`;
  const step = acc.plan.steps.find((s) => s.type === "edit_element");
  ok(acc.plan.status === "draft" && step?.value === `определение по предложению ${TAG}` && step.proposals?.[0]?.id === p1.id && acc.proposal.status === "open" && acc.proposal.planId === acc.plan.id && termBefore.definition === term.definition && UP.statusLabel(acc.proposal) === "в черновике плана", "C3 «Принять» = ЧЕРНОВИК плана со ссылкой на предложение; документ не тронут, предложение open", { status: acc.plan.status });
  await as(owner, () => AP.executePlan(S, acc.plan.id));
  let done = null;
  for (let i = 0; i < 100; i++) {
    done = await as(owner, () => AP.getPlan(S, acc.plan.id));
    if (!["draft", "executing"].includes(done.status)) break;
    await sleep(100);
  }
  const [termAfter] = await sql`select definition from glossary_terms where id=${term.id}`;
  const list2 = await as(owner, () => APR.listProposals(S));
  const d1 = await as(owner, () => APR.getProposal(S, p1.id));
  const tv = await as(owner, () => AE.getVersionHistory(S, "glossary_term", term.id));
  const origin = tv[0]?.origin;
  const phrase = origin?.kind === "proposal" ? VH.proposalOriginText(origin, list2, {}) : "";
  ok(done.status === "done" && termAfter.definition === `определение по предложению ${TAG}` && d1.status === "accepted" && d1.events.some((e) => e.type === "accepted") && tv[0].changeSource === "proposal" && /№ 1/.test(phrase) && /rev/.test(phrase) && /готовая замена/.test(phrase), "C4 план исполнен → accepted; версия 'proposal'; история: «принято предложение № 1 пользователя rev»", { st: done.status, phrase });
  const g2 = UP.groupProposals(list2);
  const p2now = list2.find((p) => p.id === p2.id);
  const eStale = await caught(as(owner, () => APR.acceptProposal(S, p2.id)));
  ok(p2now.stale === true && g2.stale.length === 1 && g2.decided.length === 1 && eStale?.code === "PROPOSAL_STALE" && /устарел/.test(UP.proposalErrorText(eStale, "x")) && /версия 0 · сейчас — версия 1/.test(UP.baseLine(p2now)), "C5 второе предложение по тому же термину — устарело: группа «Устаревшие», принять — 409 PROPOSAL_STALE", { code: eStale?.code, base: UP.baseLine(p2now) });
  const eRebOwner = await caught(as(owner, () => APR.rebaseProposal(S, p2.id, {})));
  const p3 = await as(rev, () => APR.rebaseProposal(S, p2.id, { value: `определение поверх текущего ${TAG}`, rationale: "с учётом принятого" }));
  const p2closed = await as(rev, () => APR.getProposal(S, p2.id));
  ok(eRebOwner instanceof Error && p3.status === "open" && !p3.stale && p3.base.version === 1 && p2closed.status === "closed" && p2closed.closeReason === "superseded" && p2closed.supersededBy === p3.id && UP.closeReasonLabel(p2closed.closeReason) !== "", "C6 «Новое поверх текущего» — автором: новое с текущей основой, прежнее closed/superseded; не автору — отказ");
  const rej = await as(editor, () => APR.rejectProposal(S, p3.id, "не согласен"));
  const [termEnd] = await sql`select definition from glossary_terms where id=${term.id}`;
  ok(rej.status === "rejected" && rej.note === "не согласен" && rej.decidedBy?.name === "editor" && termEnd.definition === `определение по предложению ${TAG}`, "C7 отклонение — действием правящего (редактор), со словом решившего; документ не менялся");
  // замечание подразделу: способ выбирает принимающий; шаг edit_subsection несёт текст
  const pn = await as(rev, () => APR.createProposal(S, { target: { kind: "subsection", key: `${sub.key}:${sub.name}` }, kind: "note", rationale: "дописать вывод" }));
  const eNoMethod = await caught(as(owner, () => APR.acceptProposal(S, pn.id, {})));
  const curSub = await as(owner, () => AS.getSubsectionSource(S, sub.key, sub.name));
  const accN = await as(owner, () => APR.acceptProposal(S, pn.id, { method: "edit_subsection", value: curSub.html + `<p>вывод ${TAG}</p>` }));
  const stN = accN.plan.steps.find((s) => s.type === "edit_subsection");
  ok(eNoMethod?.code === "VALIDATION_ERROR" && stN?.value?.includes(`вывод ${TAG}`) && stN.proposals?.[0]?.id === pn.id && /вывод/.test(UP.markupToLines(stN.value)), "C8 замечание: без способа — отказ; «вписать текст» → шаг edit_subsection с текстом и ссылкой на предложение");
  await as(owner, () => AP.deletePlan(S, accN.plan.id));
  const pnAfter = await as(owner, () => APR.getProposal(S, pn.id));
  ok(pnAfter.status === "open" && pnAfter.planId === null && pnAfter.events.some((e) => e.type === "plan_released") && /снова ждёт решения/.test(UP.eventText(pnAfter.events.at(-1))), "C9 черновик удалён — предложение освобождено (не отклонено), событие читается фразой");
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
} finally {
  console.log(`\nИТОГ: ${passed} ✓, ${failed} ✗${fails.length ? "\n  " + fails.join("\n  ") : ""}`);
  try {
    if (S) await sql`delete from syntheses where id=${S}`;
    for (const id of userIds) await sql`delete from notifications where user_id=${id}`;
    for (const id of userIds) await sql`delete from sessions where user_id=${id}`;
    for (const id of userIds) await sql`delete from users where id=${id}`;
  } catch (e2) { console.error("уборка:", e2); }
  await Promise.race([Promise.all([closeDb(), closeRedis()]), sleep(2000)]);
  await Promise.race([sql.end(), sleep(2000)]);
  process.exit(failed ? 1 : 0);
}
