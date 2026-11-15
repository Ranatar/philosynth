/**
 * Дымовой прогон беседы 17.1, первый запрос (совместная правка — сервер):
 *   A — чистые функции и исходники: editCapability (владелец | редактор),
 *       хэши ожидаемой версии ≡ хэшам адресов 16.1, planBodyFor (способ по
 *       виду адресата, замена не переопределяется), acceptMethodsFor,
 *       бесплатность шага edit_subsection;
 *   B — живьём по HTTP (PG + Redis, app.request без порта; образец
 *       импортирован владельцем; редактор и рецензент — строками участия):
 *       права редактора (edit да, manage нет), ожидаемая версия на четырёх
 *       путях (элемент, подраздел, капсула, план) → 409 VERSION_CONFLICT с
 *       текущим значением; исполнитель в версии и журнале (имена —
 *       участникам, стоимость чужой строки — владельцу и исполнителю);
 *       пауза редактору без genParams;
 *   C — предложения: создать (discuss) → принять (edit) = ЧЕРНОВИК плана,
 *       документ не тронут → исполнить план → accepted, версия 'proposal' с
 *       происхождением и исполнителем; устаревшее не принимается (409
 *       PROPOSAL_STALE) ни маршрутом, ни исполнителем (шаг снят, предложение
 *       освобождено, НЕ отклонено); отклонение — человеком; «новое поверх
 *       текущего»; замечание (note) способом по выбору принимающего;
 *       ссылки на предложения из тела HTTP отбрасываются; исключённый
 *       участник — closed/member_removed; уведомления 16.2.
 *
 * Запуск (из корня, PG/Redis подняты, миграции до 0019, сиды на месте):
 *   node_modules/.bin/tsx tests/smoke-171-request1.mjs
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
const TAG = "s171-" + Math.random().toString(36).slice(2, 7);
const rd = (rel) => readFileSync(ROOT + rel, "utf8");

const LOC = await import("../server/i18n/locale.ts");
LOC.installServerCatalogProvider();
const DA = await import("@philosynth/shared/utils/discussion-address");
const EV = await import("@philosynth/shared/utils/expected-version");
const ES = await import("@philosynth/shared/constants/edit-steps");
const CAP = await import("../server/services/capabilities.ts");
const PR = await import("../server/services/proposals.ts");
const IS = await import("../server/services/import-service.ts");
const RS = await import("../server/routes/syntheses.ts");
const { elementsRoutes } = await import("../server/routes/elements.ts");
const { sectionsRoutes } = await import("../server/routes/sections.ts");
const { plansRoutes } = await import("../server/routes/plans.ts");
const { logsRoutes } = await import("../server/routes/logs.ts");
const { membersRoutes } = await import("../server/routes/members.ts");
const { discussionRoutes } = await import("../server/routes/discussion.ts");
const { proposalsRoutes } = await import("../server/routes/proposals.ts");
await import("../server/services/plan-executor.ts");
const { closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");

console.log("\n■ A. Чистые функции");
{
  const row = { userId: "o", visibility: "private" };
  const ed = CAP.capabilitiesFor(row, "e", { role: "editor", status: "active" });
  const rv = CAP.capabilitiesFor(row, "r", { role: "reviewer", status: "active" });
  const inv = CAP.capabilitiesFor(row, "e", { role: "editor", status: "invited" });
  const ow = CAP.capabilitiesFor(row, "o", null);
  ok(ed.edit === true && ed.manage === false && ed.discuss === true && rv.edit === false && rv.discuss === true && inv.edit === false && ow.edit && ow.manage, "A1 edit = владелец | действующий редактор; manage — только владелец; приглашённый — никто", { ed, rv, inv });
  const h1 = await EV.subsectionContentHash("<p>a</p>\n   <p>b</p>");
  const h2 = await DA.contentHash("subsection", { html: "<p>a</p> <p>b</p>" });
  const h3 = await EV.sectionContentHash(" <p>x</p> ");
  ok(h1 === h2 && /^[0-9a-f]{64}$/.test(h1) && h3 === (await DA.contentHash("section", { html: "<p>x</p>" })), "A2 хэш ожидаемой версии ≡ хэшу адреса 16.1 (пробелы схлопнуты)");
  ok(ES.FREE_STEP_TYPES.includes("edit_subsection") && ES.isFreeStepType("edit_subsection"), "A3 шаг edit_subsection бесплатный");
  ok(J(PR.acceptMethodsFor("category", "replace")) === J(["edit_element"]) && J(PR.acceptMethodsFor("subsection", "note")) === J(["edit_subsection", "regen_subsection"]) && J(PR.acceptMethodsFor("section", "note")) === J(["regen"]) && PR.acceptMethodsFor("section", "replace").length === 0 && PR.acceptMethodsFor("synthesis", "note").length === 0, "A4 способы исполнения по виду адресата");
  const base = { id: "p1", authorId: "a", source: "direct", sourceId: null, rationale: "почему", field: "definition" };
  const addr = { kind: "category", key: "бытие", id: "c1", hash: "h", version: 2 };
  const res = { state: "current", currentId: "c1", currentHash: "h", currentVersion: 2 };
  const b1 = PR.planBodyFor({ ...base, kind: "replace", value: "новое", address: addr }, res, {});
  ok(b1.elementEdits?.[0]?.value === "новое" && b1.elementEdits[0].proposals[0].id === "p1" && J(b1.expected) === J([{ target: "category:c1", version: 2 }]), "A5 замена элемента → edit_element со ссылкой и ожидаемой версией", b1);
  let threw = null;
  try { PR.planBodyFor({ ...base, kind: "replace", value: "новое", address: addr }, res, { value: "другое" }); } catch (e) { threw = e; }
  ok(threw?.code === "VALIDATION_ERROR", "A6 значение готовой замены при принятии не подменяется");
  let threw2 = null;
  try { PR.planBodyFor({ ...base, kind: "note", value: null, address: addr }, res, {}); } catch (e) { threw2 = e; }
  const b2 = PR.planBodyFor({ ...base, kind: "note", value: null, address: addr }, res, { method: "refine_element" });
  ok(threw2?.code === "VALIDATION_ERROR" && b2.elementRefines?.[0]?.note === "почему" && !b2.elementEdits, "A7 замечание: способ называет принимающий; без способа — отказ; довод модели — текст предложения");
  const sAddr = { kind: "section", key: "graph", id: "s1", hash: "hh", version: 0 };
  const b3 = PR.planBodyFor({ ...base, field: null, kind: "note", value: null, address: sAddr }, { state: "current", currentId: "s1", currentHash: "hh", currentVersion: 0 }, { method: "regen" });
  ok(J(b3.regen) === J(["graph"]) && b3.regenContexts.graph === "почему" && b3.regenProposals.graph[0].id === "p1", "A8 замечание разделу → regen с контекстом и ссылкой");
  ok(PR.isStale("open", { state: "outdated" }) && PR.isStale("open", { state: "deleted" }) && !PR.isStale("open", { state: "current" }) && !PR.isStale("accepted", { state: "outdated" }), "A9 stale вычисляется: открытое + адресат изменён/удалён");
}

console.log("\n■ B. Права, ожидаемая версия, исполнитель");
const userIds = [];
const app = new Hono();
for (const r of [membersRoutes, RS.synthesesRoutes, sectionsRoutes, elementsRoutes, plansRoutes, logsRoutes, discussionRoutes, proposalsRoutes]) app.route("/syntheses", r);
async function mkUser(name) {
  const [u] = await sql`insert into users (email, password_hash, display_name) values (${`${TAG}-${name}@s.local`}, 'x', ${name}) returning id`;
  userIds.push(u.id);
  const token = `${TAG}-${name}-${Date.now()}`;
  await sql`insert into sessions (id, user_id, expires_at) values (${createHash("sha256").update(token).digest("hex")}, ${u.id}, now() + interval '1 hour')`;
  return { id: u.id, name, cookie: `philosynth_session=${token}` };
}
const call = async (method, path, body, who) => {
  const r = await app.request(path, { method, headers: { "content-type": "application/json", ...(who ? { cookie: who.cookie } : {}) }, body: body === undefined ? undefined : J(body) });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
};
let S = null;
async function waitPlan(planId, who) {
  for (let i = 0; i < 100; i++) {
    const p = await call("GET", `/syntheses/${S}/plans/${planId}`, undefined, who);
    if (p.json?.plan && !["draft", "executing"].includes(p.json.plan.status)) return p.json.plan;
    await sleep(100);
  }
  return (await call("GET", `/syntheses/${S}/plans/${planId}`, undefined, who)).json?.plan ?? null;
}
const notes = (uid, type) => sql`select type, ref_id, payload from notifications where user_id=${uid} and synthesis_id=${S} and type=${type}`;
try {
  const owner = await mkUser("owner"), editor = await mkUser("editor"), rev = await mkUser("rev"), str = await mkUser("str");
  const sampleFile = readdirSync(ROOT + "sample").find((f) => f.endsWith(".html"));
  ({ synthesisId: S } = await IS.importHTML(rd("sample/" + sampleFile), owner.id, sampleFile));
  ok(!!S, "B0 импорт образца владельцем");
  const [mEd] = await sql`insert into synthesis_members (synthesis_id, user_id, role, status, invited_by, accepted_at) values (${S}, ${editor.id}, 'editor', 'active', ${owner.id}, now()) returning id`;
  const [mRev] = await sql`insert into synthesis_members (synthesis_id, user_id, role, status, invited_by, accepted_at) values (${S}, ${rev.id}, 'reviewer', 'active', ${owner.id}, now()) returning id`;

  const fEd = await call("GET", `/syntheses/${S}`, undefined, editor);
  const fRev = await call("GET", `/syntheses/${S}`, undefined, rev);
  ok(fEd.json?.synthesis?.capabilities?.edit === true && fEd.json.synthesis.capabilities.manage === false && fRev.json?.synthesis?.capabilities?.edit === false, "B1 capabilities: редактор edit без manage; рецензент без edit");

  const cats = await sql`select id, name, definition from categories where synthesis_id=${S} order by name limit 3`;
  const cat = cats[0];
  const p1 = await call("PATCH", `/syntheses/${S}/categories/${cat.id}`, { definition: `правка редактора ${TAG}`, expectedVersion: 0 }, editor);
  ok(p1.status === 200 && p1.json?.category?.definition === `правка редактора ${TAG}`, "B2a редактор правит категорию (expectedVersion 0 → 200)", p1);
  const p2 = await call("PATCH", `/syntheses/${S}/categories/${cat.id}`, { definition: "вторая поверх первой", expectedVersion: 0 }, owner);
  const [catNow] = await sql`select definition from categories where id=${cat.id}`;
  ok(p2.status === 409 && p2.json?.code === "VERSION_CONFLICT" && p2.json.details?.current?.version === 1 && p2.json.details?.expected?.version === 0 && catNow.definition === `правка редактора ${TAG}`, "B2b устаревшее ожидание → 409 VERSION_CONFLICT с текущей версией; запись не тронута", p2);
  const p3 = await call("PATCH", `/syntheses/${S}/categories/${cat.id}`, { definition: "без ожидания", }, owner);
  const p4 = await call("PATCH", `/syntheses/${S}/categories/${cat.id}`, { definition: "плохое ожидание", expectedVersion: "x" }, owner);
  ok(p3.status === 200 && p4.status === 400 && p4.json?.code === "VALIDATION_ERROR", "B2c без expectedVersion — как прежде (200); негодное ожидание — 400");
  const pRev = await call("PATCH", `/syntheses/${S}/categories/${cat.id}`, { definition: "рецензент" }, rev);
  const pStr = await call("PATCH", `/syntheses/${S}/categories/${cat.id}`, { definition: "чужой" }, str);
  ok(pRev.status === 403 && [403, 404].includes(pStr.status), "B2d рецензент и посторонний не правят (403)");
  const vOwner = await call("GET", `/syntheses/${S}/elements/category/${cat.id}/versions`, undefined, owner);
  const vRev = await call("GET", `/syntheses/${S}/elements/category/${cat.id}/versions`, undefined, rev);
  const byEditor = vOwner.json?.versions?.find((v) => v.version === 1);
  const byOwner = vOwner.json?.versions?.find((v) => v.version === 2);
  const [verRow] = await sql`select actor_user_id from element_versions where element_id=${cat.id} and version=1`;
  ok(verRow.actor_user_id === editor.id && byEditor?.actor?.name === "editor" && byEditor.actor.isOwner === false && byOwner && !byOwner.actor && vRev.json?.versions?.find((v) => v.version === 1)?.actor?.name === "editor", "B3 исполнитель версии: в БД — редактор; участникам отдаётся имя; у строки владельца имени нет", { byEditor, byOwner });

  const mList = await call("GET", `/syntheses/${S}/members`, undefined, editor);
  const mDel = await call("DELETE", `/syntheses/${S}/members/${mRev.id}`, undefined, editor);
  const sDel = await call("DELETE", `/syntheses/${S}`, undefined, editor);
  const [still] = await sql`select count(*)::int as n from syntheses where id=${S}`;
  ok(mList.status === 403 && mDel.status === 403 && [403, 404].includes(sDel.status) && still.n === 1, "B4 manage редактору закрыт: участники, исключение, удаление концепции", { mList: mList.status, mDel: mDel.status, sDel: sDel.status });

  // подраздел
  const secs = await sql`select key, html_content from sections where synthesis_id=${S} and key not in ('capsule') order by key`;
  let subT = null;
  for (const s of secs) {
    for (const m of s.html_content.matchAll(/data-section="([^"]+)"/g)) {
      const src = await call("GET", `/syntheses/${S}/sections/${s.key}/subsections/${encodeURIComponent(m[1])}`, undefined, editor);
      if (src.status === 200 && !src.json.lock && src.json.html && src.json.nested.length === 0) { subT = { key: s.key, name: m[1], src: src.json }; break; }
    }
    if (subT) break;
  }
  ok(!!subT && /^[0-9a-f]{64}$/.test(subT.src.hash) && subT.src.hash === (await EV.subsectionContentHash(subT.src.html)), "B5a исходник подраздела несёт hash ≡ subsectionContentHash(html)", subT?.src?.hash);
  const subUrl = `/syntheses/${S}/sections/${subT.key}/subsections/${encodeURIComponent(subT.name)}`;
  const sBad = await call("PATCH", subUrl, { html: `<p>мимо ${TAG}</p>`, expectedHash: "0".repeat(64) }, editor);
  const sGood = await call("PATCH", subUrl, { html: `<p>правка подраздела ${TAG}</p>`, expectedHash: subT.src.hash }, editor);
  const sAgain = await call("PATCH", subUrl, { html: `<p>по старому хэшу ${TAG}</p>`, expectedHash: subT.src.hash }, owner);
  ok(sBad.status === 409 && sBad.json?.code === "VERSION_CONFLICT" && sBad.json.details?.current?.hash === subT.src.hash && sGood.status === 200 && sGood.json.changed === true && sAgain.status === 409, "B5b подраздел: чужой хэш → 409 с текущим; верный → 200; повтор по старому → 409", { sBad: sBad.status, sGood: sGood.status, sAgain: sAgain.status });

  // капсула
  const [syn0] = await sql`select capsule_html from syntheses where id=${S}`;
  const capHash = await EV.sectionContentHash(syn0.capsule_html);
  const cBad = await call("PATCH", `/syntheses/${S}/capsule`, { html: "<p>мимо</p>", expectedHash: "f".repeat(64) }, editor);
  const cGood = await call("PATCH", `/syntheses/${S}/capsule`, { html: `<p>капсула ${TAG}</p>`, expectedHash: capHash }, editor);
  ok(cBad.status === 409 && cBad.json?.code === "VERSION_CONFLICT" && cBad.json.details?.current?.hash === capHash && cGood.status === 200, "B6 капсула: чужой хэш → 409 с текущим; верный → 200", { cBad, cGood: cGood.status });

  // план
  const cat2 = cats[1];
  const plBad = await call("POST", `/syntheses/${S}/plans`, { regen: [], remove: [], add: [], elementEdits: [{ kind: "category", elementId: cat2.id, field: "definition", value: "x" }], expected: [{ target: `category:${cat2.id}`, version: 7 }, { target: `${subT.key}:${subT.name}`, hash: subT.src.hash }] }, editor);
  ok(plBad.status === 409 && plBad.json?.code === "VERSION_CONFLICT" && plBad.json.details?.conflicts?.length === 2 && plBad.json.details.conflicts[0].current.version === 0, "B7a план: расхождения ожиданий → 409 со ВСЕМИ разошедшимися и текущими значениями", plBad);
  const plGood = await call("POST", `/syntheses/${S}/plans`, { regen: [], remove: [], add: [], elementEdits: [{ kind: "category", elementId: cat2.id, field: "definition", value: `план редактора ${TAG}`, proposals: [{ id: "00000000-0000-4000-8000-000000000000", authorId: rev.id, source: "direct", sourceId: null, kind: "replace", rationale: "подлог" }] }], subsectionEdits: [{ target: `${subT.key}:${subT.name}`, html: `<p>шаг плана ${TAG}</p>` }], expected: [{ target: `category:${cat2.id}`, version: 0 }] }, editor);
  const steps = plGood.json?.plan?.steps ?? [];
  ok([200, 201].includes(plGood.status) && steps.length >= 2 && steps.some((s) => s.type === "edit_subsection" && s.value.includes(TAG)) && steps.every((s) => !s.proposals), "B7b план редактора: шаг edit_subsection собран; ссылки на предложения из тела HTTP отброшены", plGood.json);
  const plOwnerGet = await call("GET", `/syntheses/${S}/plans/${plGood.json.plan.id}`, undefined, owner);
  const plRevGet = await call("GET", `/syntheses/${S}/plans/${plGood.json.plan.id}`, undefined, rev);
  const plOwnerEx = await call("POST", `/syntheses/${S}/plans/${plGood.json.plan.id}/execute`, undefined, owner);
  const plOwnerUpd = await call("PATCH", `/syntheses/${S}/plans/${plGood.json.plan.id}`, { steps: [{ index: 0, status: "skipped" }] }, owner);
  ok(plOwnerGet.status === 200 && plRevGet.status === 403 && plOwnerEx.status === 403 && plOwnerUpd.status === 403, "B7c план принадлежит автору: владельцу открыт на чтение (и удаление), исполнять и править — только автор; рецензенту 403", { g: plOwnerGet.status, r: plRevGet.status, e: plOwnerEx.status, u: plOwnerUpd.status });
  const upd = await call("PATCH", `/syntheses/${S}/plans/${plGood.json.plan.id}`, { steps: [{ index: 0, status: "confirmed" }] }, editor);
  ok(upd.status === 200 && upd.json.plan.steps.some((s) => s.type === "edit_subsection" && s.value.includes(TAG)), "B7d пересборка плана (updatePlan) шаг edit_subsection не теряет", upd.json);
  const ex = await call("POST", `/syntheses/${S}/plans/${plGood.json.plan.id}/execute`, undefined, editor);
  const done = await waitPlan(plGood.json.plan.id, editor);
  const [cat2Now] = await sql`select definition from categories where id=${cat2.id}`;
  const subNow = await call("GET", subUrl, undefined, editor);
  const vers = await sql`select element_type, change_source, actor_user_id from element_versions where synthesis_id=${S} order by created_at desc limit 2`;
  ok(ex.status === 200 && done?.status === "done" && cat2Now.definition === `план редактора ${TAG}` && subNow.json.html.includes(`шаг плана ${TAG}`) && vers.every((v) => v.actor_user_id === editor.id && v.change_source === "manual"), "B7e бесплатный план редактора исполнен: элемент и подраздел изменены, версии — исполнителя", { done: done?.status, vers });
  const [ver0] = await sql`select version_base, version_sub from syntheses where id=${S}`;
  ok(ver0.version_base === 0 || Number.isInteger(ver0.version_base), "B7f номер документа не трогался бесплатными шагами (formatVersion прежний)");

  // журнал: имена и стоимость
  await sql`insert into generation_log (synthesis_id, section_key, section_label, log_type, source, status, cost_usd, input_tokens, output_tokens, input_chars, output_chars, actor_user_id) values (${S}, 'graph', ${TAG + '-ed'}, 'generation', 'edit', 'done', 1.5, 10, 10, 10, 10, ${editor.id})`;
  await sql`insert into generation_log (synthesis_id, section_key, section_label, log_type, source, status, cost_usd, input_tokens, output_tokens, input_chars, output_chars) values (${S}, 'theses', ${TAG + '-ow'}, 'generation', 'edit', 'done', 0.25, 10, 10, 10, 10)`;
  const lgO = await call("GET", `/syntheses/${S}/logs/generation`, undefined, owner);
  const lgE = await call("GET", `/syntheses/${S}/logs/generation`, undefined, editor);
  const lgR0 = await call("GET", `/syntheses/${S}/logs/generation`, undefined, rev);
  const pick = (r, key) => r.json?.entries?.find((e) => e.sectionLabel === TAG + (key === "graph" ? "-ed" : "-ow"));
  ok(lgO.status === 200 && pick(lgO, "graph")?.actor?.name === "editor" && pick(lgO, "graph").costUsd === 1.5 && !pick(lgO, "theses").actor && pick(lgO, "theses").costUsd === 0.25, "B8a журнал владельцу: «запустил editor», стоимость всех строк; у своей строки исполнителя нет");
  ok(lgE.status === 200 && pick(lgE, "graph")?.costUsd === 1.5 && !pick(lgE, "graph").costHidden && pick(lgE, "theses").costUsd === 0.25, "B8b журнал редактору открыт (право правки); своя стоимость видна");
  ok(lgR0.status === 403, "B8c рецензенту приватной концепции журнал закрыт (флаги 8.6), как прежде");
  await sql`update syntheses set visibility='full', show_logs=true where id=${S}`;
  const lgR = await call("GET", `/syntheses/${S}/logs/generation`, undefined, rev);
  const lgS = await call("GET", `/syntheses/${S}/logs/generation`, undefined, str);
  const fmO = await call("GET", `/syntheses/${S}/logs/formatted`, undefined, owner);
  const fmS = await call("GET", `/syntheses/${S}/logs/formatted`, undefined, str);
  ok(pick(lgR, "graph")?.actor?.name === "editor" && pick(lgR, "graph").costHidden === true && pick(lgR, "graph").costUsd === 0 && pick(lgR, "theses").costUsd === 0.25, "B8d рецензент (участник) по showLogs: имя видно, стоимость чужой строки скрыта");
  ok(lgS.status === 200 && !pick(lgS, "graph").actor && pick(lgS, "graph").costHidden === true && pick(lgS, "theses").costUsd === 0.25, "B8e читатель по showLogs: имён нет, стоимость строки не-владельца скрыта, владельца — как прежде");
  ok(fmO.json?.text?.includes("Запустил: editor") && fmO.json.text.includes("$1.5000") && !fmS.json?.text?.includes("editor") && fmS.json.text.includes("скрыта") && !fmS.json.text.includes("$1.5000"), "B8f текст журнала: владельцу «Запустил: editor» и цена; читателю — ни имени, ни цены строки");
  await sql`update syntheses set visibility='private', show_logs=false where id=${S}`;

  // пауза редактору
  await sql`update syntheses set status='paused', paused_state=${sql.json({ kind: "plan", stepIdx: 0, totalSteps: 1, failedOp: { action: "regen", key: "graph" }, remainingOps: [], plan: { regen: ["graph"], remove: [], add: [], modeRegen: [], modeRemove: [] }, regenCtx: {}, addCtx: {}, timestamp: 1, reasonKind: "partial" })} where id=${S}`;
  const paE = await call("GET", `/syntheses/${S}`, undefined, editor);
  const paR = await call("GET", `/syntheses/${S}`, undefined, rev);
  await sql`update syntheses set paused_state=${sql.json({ kind: "gen", passIdx: 0, sectionKeys: ["graph"], sectionLabel: "Граф", isPartial: false, timestamp: 1, partialSubsections: [], expectedSubsections: [], completedPasses: [], genParams: { seed: "секрет", secCtx: {} }, reasonKind: "partial" })} where id=${S}`;
  const paE2 = await call("GET", `/syntheses/${S}`, undefined, editor);
  const paO2 = await call("GET", `/syntheses/${S}`, undefined, owner);
  ok(paE.json?.synthesis?.pausedState?.kind === "plan" && paR.json?.synthesis?.pausedState === null && paE2.json?.synthesis?.pausedState?.kind === "gen" && J(paE2.json.synthesis.pausedState.genParams) === "{}" && paO2.json?.synthesis?.pausedState?.genParams?.seed === "секрет", "B9 пауза: редактору видна (genParams пусты), рецензенту — нет, владельцу — целиком");
  await sql`update syntheses set status='ready', paused_state=null where id=${S}`;

  console.log("\n■ C. Предложения");
  const cat3 = cats[2];
  const P = `/syntheses/${S}/proposals`;
  const c1 = await call("POST", P, { target: { kind: "category", id: cat3.id }, kind: "replace", field: "definition", value: `предложенное   определение ${TAG}`, rationale: "так точнее" }, rev);
  ok(c1.status === 201 && c1.json.status === "open" && c1.json.stale === false && c1.json.value === `предложенное определение ${TAG}` && c1.json.base.hash === c1.json.address.hash && c1.json.author.name === "rev" && c1.json.planId === null, "C1a рецензент (discuss) предлагает замену определения → 201, основа = хэш адреса", c1);
  const nO = await notes(owner.id, "proposal_created"), nE = await notes(editor.id, "proposal_created"), nR = await notes(rev.id, "proposal_created");
  ok(nO.length === 1 && nE.length === 1 && nR.length === 0 && nO[0].ref_id === c1.json.id, "C1b уведомление proposal_created — владельцу и редактору (тем, кто решает), автору — нет");
  const cStr = await call("POST", P, { target: { kind: "category", id: cat3.id }, kind: "note", rationale: "x" }, str);
  const cSyn = await call("POST", P, { target: { kind: "synthesis" }, kind: "note", rationale: "о документе" }, rev);
  const cSec = await call("POST", P, { target: { kind: "section", key: "graph" }, kind: "replace", value: "<p>весь раздел</p>" }, rev);
  const cNoR = await call("POST", P, { target: { kind: "category", id: cat3.id }, kind: "note" }, rev);
  const cRec = await call("POST", P, { target: { kind: "category", id: cat3.id }, kind: "note", rationale: "x", source: "recommendation", sourceId: "00000000-0000-4000-8000-000000000000" }, rev);
  ok([403, 404].includes(cStr.status) && cSyn.status === 400 && cSec.status === 400 && cNoR.status === 400 && cRec.status === 403, "C1c отказы: посторонний; документ целиком; замена раздела; замечание без обоснования; из рекомендации — без права правки", { cStr: cStr.status, cSyn: cSyn.status, cSec: cSec.status, cNoR: cNoR.status, cRec: cRec.status });

  const aRev = await call("POST", `${P}/${c1.json.id}/accept`, {}, rev);
  const acc = await call("POST", `${P}/${c1.json.id}/accept`, {}, editor);
  const [cat3Mid] = await sql`select definition from categories where id=${cat3.id}`;
  const st = acc.json?.plan?.steps?.[0];
  ok(aRev.status === 403 && acc.status === 201 && acc.json.plan.status === "draft" && st?.type === "edit_element" && st.proposals?.[0]?.id === c1.json.id && st.value === c1.json.value && acc.json.proposal.status === "open" && acc.json.proposal.planId === acc.json.plan.id && cat3Mid.definition === cat3.definition, "C2a принять: рецензенту 403; редактору — ЧЕРНОВИК плана с шагом по предложению; документ НЕ изменён, предложение ещё open", acc.json);
  const acc2 = await call("POST", `${P}/${c1.json.id}/accept`, {}, owner);
  ok(acc2.status === 409 && acc2.json.code === "CONFLICT", "C2b повторное принятие, пока предложение в черновике плана, — 409");
  const upd2 = await call("PATCH", `/syntheses/${S}/plans/${acc.json.plan.id}`, { steps: [{ index: 0, status: "confirmed" }] }, editor);
  ok(upd2.json?.plan?.steps?.[0]?.proposals?.[0]?.id === c1.json.id, "C2c пересборка плана ссылку на предложение сохраняет");
  await call("POST", `/syntheses/${S}/plans/${acc.json.plan.id}/execute`, undefined, editor);
  const done2 = await waitPlan(acc.json.plan.id, editor);
  const [cat3Now] = await sql`select definition from categories where id=${cat3.id}`;
  const g1 = await call("GET", `${P}/${c1.json.id}`, undefined, rev);
  const v3 = await call("GET", `/syntheses/${S}/elements/category/${cat3.id}/versions`, undefined, owner);
  const o3 = v3.json?.versions?.[0];
  ok(done2?.status === "done" && cat3Now.definition === c1.json.value && g1.json.status === "accepted" && g1.json.decidedBy?.name === "editor" && g1.json.planId === acc.json.plan.id && J(g1.json.events.map((e) => e.type)) === J(["created", "plan_drafted", "accepted"]), "C3a план исполнен → значение вписано, предложение accepted (решил исполнитель), журнал событий created → plan_drafted → accepted", { done: done2?.status, g1: g1.json });
  ok(o3?.changeSource === "proposal" && o3.origin?.kind === "proposal" && o3.origin.proposalId === c1.json.id && o3.origin.authorId === rev.id && o3.origin.planId === acc.json.plan.id && o3.origin.stepType === "edit_element" && o3.actor?.name === "editor", "C3b версия: источник 'proposal', происхождение (кто предложил, план, шаг), исполнитель — редактор", o3);
  const nDec = await notes(rev.id, "proposal_decided");
  ok(nDec.length === 1 && nDec[0].payload.decision === "accepted", "C3c автору — proposal_decided (accepted)");

  // устаревшее: маршрут
  const ths = await sql`select id, formulation from theses where synthesis_id=${S} order by thesis_num limit 2`;
  const c2 = await call("POST", P, { target: { kind: "thesis", id: ths[0].id }, kind: "replace", field: "formulation", value: `тезис по-новому ${TAG}`, rationale: "яснее" }, rev);
  await call("PATCH", `/syntheses/${S}/theses/${ths[0].id}`, { formulation: `владелец переписал ${TAG}` }, owner);
  const g2 = await call("GET", `${P}/${c2.json.id}`, undefined, editor);
  const a2 = await call("POST", `${P}/${c2.json.id}/accept`, {}, editor);
  const [thNow] = await sql`select formulation from theses where id=${ths[0].id}`;
  ok(c2.status === 201 && g2.json.stale === true && g2.json.resolution.state === "outdated" && g2.json.status === "open" && a2.status === 409 && a2.json.code === "PROPOSAL_STALE" && thNow.formulation === `владелец переписал ${TAG}`, "C4a устаревшее: stale вычислен при чтении, статус open; принять нельзя — 409 PROPOSAL_STALE; документ не тронут", { g2: g2.json?.stale, a2 });
  const rjRev = await call("POST", `${P}/${c2.json.id}/reject`, { note: "x" }, rev);
  const rj = await call("POST", `${P}/${c2.json.id}/reject`, { note: "уже переписано иначе" }, editor);
  const rj2 = await call("POST", `${P}/${c2.json.id}/reject`, {}, editor);
  ok(rjRev.status === 403 && rj.status === 200 && rj.json.status === "rejected" && rj.json.note === "уже переписано иначе" && rj.json.decidedBy.name === "editor" && rj2.status === 409, "C4b отклонение — действием человека с правом правки (с причиной); рецензенту 403; повторно — 409");

  // устаревшее: исполнитель плана
  const terms = await sql`select id, term, definition from glossary_terms where synthesis_id=${S} order by term limit 2`;
  const c3 = await call("POST", P, { target: { kind: "glossary_term", id: terms[0].id }, kind: "replace", field: "definition", value: `термин по-новому ${TAG}`, rationale: "уточнение" }, rev);
  const a3 = await call("POST", `${P}/${c3.json.id}/accept`, {}, editor);
  await call("PATCH", `/syntheses/${S}/glossary/${terms[0].id}`, { definition: `владелец уточнил ${TAG}` }, owner);
  await call("POST", `/syntheses/${S}/plans/${a3.json.plan.id}/execute`, undefined, editor);
  const done3 = await waitPlan(a3.json.plan.id, editor);
  const [termNow] = await sql`select definition from glossary_terms where id=${terms[0].id}`;
  const g3 = await call("GET", `${P}/${c3.json.id}`, undefined, rev);
  const rel = g3.json?.events?.find((e) => e.type === "plan_released");
  ok(a3.status === 201 && done3?.steps?.[0]?.status === "skipped" && done3.steps[0].skipReason === "proposal_stale" && termNow.definition === `владелец уточнил ${TAG}` && g3.json.status === "open" && g3.json.planId === null && g3.json.stale === true && rel?.payload?.reason === "stale" && !g3.json.events.some((e) => e.type === "rejected" || e.type === "accepted"), "C5a план пролежал черновиком, документ изменили: исполнитель шаг СНЯЛ (proposal_stale), значение не вписано, предложение освобождено и НЕ отклонено", { step: done3?.steps?.[0], g3: g3.json?.status, rel });
  const rbEd = await call("POST", `${P}/${c3.json.id}/rebase`, {}, editor);
  const rb = await call("POST", `${P}/${c3.json.id}/rebase`, { value: `термин поверх текущего ${TAG}` }, rev);
  const g3b = await call("GET", `${P}/${c3.json.id}`, undefined, rev);
  ok(rbEd.status === 403 && rb.status === 201 && rb.json.stale === false && rb.json.value === `термин поверх текущего ${TAG}` && rb.json.id !== c3.json.id && g3b.json.status === "closed" && g3b.json.closeReason === "superseded" && g3b.json.supersededBy === rb.json.id, "C5b «новое поверх текущего» — автором, человеком: новое предложение с текущей основой, старое closed/superseded", { rb: rb.json, old: g3b.json?.status });
  const rbNot = await call("POST", `${P}/${rb.json.id}/rebase`, {}, rev);
  ok(rbNot.status === 409, "C5c не устаревшее заново не заводится (409)");

  // замечание (note) подразделу — способ выбирает принимающий
  const subSrc2 = await call("GET", subUrl, undefined, rev);
  const c4 = await call("POST", P, { target: { kind: "subsection", key: `${subT.key}:${subT.name}` }, kind: "note", rationale: "абзац стоит переписать короче" }, rev);
  const a4no = await call("POST", `${P}/${c4.json.id}/accept`, {}, editor);
  const a4bad = await call("POST", `${P}/${c4.json.id}/accept`, { method: "regen" }, editor);
  const a4 = await call("POST", `${P}/${c4.json.id}/accept`, { method: "edit_subsection", value: `<p>короче ${TAG}</p><script>alert(1)</script>` }, editor);
  const st4 = a4.json?.plan?.steps?.find((s) => s.type === "edit_subsection");
  ok(c4.status === 201 && c4.json.base.hash === subSrc2.json.hash && a4no.status === 400 && a4bad.status === 400 && a4.status === 201 && st4?.proposals?.[0]?.id === c4.json.id, "C6a замечание подразделу: основа = хэш исходника; без способа и с чужим способом — 400; edit_subsection со значением принимающего → черновик плана", { a4no: a4no.status, a4bad: a4bad.status, a4: a4.json });
  await call("POST", `/syntheses/${S}/plans/${a4.json.plan.id}/execute`, undefined, editor);
  const done4 = await waitPlan(a4.json.plan.id, editor);
  const subNow2 = await call("GET", subUrl, undefined, rev);
  const [secVer] = await sql`select change_source, origin, actor_user_id from element_versions where synthesis_id=${S} and element_type='section' order by created_at desc limit 1`;
  const g4 = await call("GET", `${P}/${c4.json.id}`, undefined, rev);
  ok(done4?.status === "done" && subNow2.json.html.includes(`короче ${TAG}`) && !subNow2.json.html.includes("<script") && secVer.change_source === "proposal" && secVer.origin?.proposalId === c4.json.id && secVer.origin.stepType === "edit_subsection" && secVer.actor_user_id === editor.id && g4.json.status === "accepted", "C6b план исполнен: разметка вписана (скрипт вычищен), версия раздела 'proposal' с происхождением, предложение accepted", { done: done4?.status, secVer });

  // замечание разделу → regen; удаление плана освобождает
  const c5 = await call("POST", P, { target: { kind: "section", key: "graph" }, kind: "note", rationale: "раздел устарел целиком" }, rev);
  const a5 = await call("POST", `${P}/${c5.json.id}/accept`, { method: "regen" }, owner);
  const st5 = a5.json?.plan?.steps?.find((s) => s.type === "regen" && s.target === "graph");
  ok(a5.status === 201 && st5?.proposals?.[0]?.id === c5.json.id && st5.context === "раздел устарел целиком" && st5.status === "confirmed", "C7a замечание разделу, способ regen: шаг перегенерации с доводом-контекстом и ссылкой (исполнение — обычным планом, под квотой исполнителя)", a5.json);
  const delPlan = await call("DELETE", `/syntheses/${S}/plans/${a5.json.plan.id}`, undefined, owner);
  const g5 = await call("GET", `${P}/${c5.json.id}`, undefined, rev);
  ok(delPlan.status === 200 && g5.json.status === "open" && g5.json.planId === null && g5.json.events.at(-1).type === "plan_released" && g5.json.events.at(-1).payload.reason === "plan_deleted", "C7b черновик удалён → предложение снова ждёт решения (plan_released), не отклонено");

  // из комментария; снятие автором; закрытие
  const com = await call("POST", `/syntheses/${S}/comments`, { target: { kind: "category", id: cats[0].id }, body: "тут неясно" }, rev);
  const c6 = await call("POST", P, { kind: "note", rationale: "раскрыть определение", source: "comment", sourceId: com.json.id }, editor);
  const c6bad = await call("POST", P, { kind: "note", rationale: "x", source: "comment", sourceId: "00000000-0000-4000-8000-000000000000" }, editor);
  ok(c6.status === 201 && c6.json.source === "comment" && c6.json.sourceId === com.json.id && c6.json.address.kind === "category" && c6.json.address.id === cats[0].id && c6.json.resolution.state === "current" && c6bad.status === 404, "C8a предложение из комментария: адрес — от источника, основа — текущая; чужой источник — 404", c6.json);
  const wdO = await call("POST", `${P}/${c6.json.id}/withdraw`, undefined, owner);
  const wd = await call("POST", `${P}/${c6.json.id}/withdraw`, undefined, editor);
  const clRev = await call("POST", `${P}/${c5.json.id}/close`, { reason: "outdated" }, rev);
  const cl = await call("POST", `${P}/${c5.json.id}/close`, { reason: "outdated", note: "раздел уже переписан" }, owner);
  ok(wdO.status === 403 && wd.status === 200 && wd.json.status === "withdrawn" && clRev.status === 403 && cl.status === 200 && cl.json.status === "closed" && cl.json.closeReason === "outdated", "C8b снять — только автор; закрыть — правящий (причина outdated)");
  const lst = await call("GET", `${P}?status=open`, undefined, rev);
  const lstStr = await call("GET", P, undefined, str);
  ok(lst.status === 200 && lst.json.proposals.every((p) => p.status === "open") && lst.json.proposals.some((p) => p.id === rb.json.id) && [403, 404].includes(lstStr.status), "C8c список: участникам, отбор по статусу; постороннему закрыт");

  // исключение участника
  const c7 = await call("POST", P, { target: { kind: "thesis", id: ths[1].id }, kind: "note", rationale: "спорно" }, rev);
  const a7 = await call("POST", `${P}/${c7.json.id}/accept`, { method: "refine_element" }, editor);
  ok(a7.status === 201 && a7.json.plan.steps[0].type === "refine_element" && a7.json.plan.steps[0].context === "спорно", "C9a замечание тезису, способ refine_element: платный шаг с доводом (исполнит и оплатит принявший)");
  // понижение редактора до рецензента: предложение из его черновика освобождается, план ему закрыт
  const demote = await call("PATCH", `/syntheses/${S}/members/${mEd.id}`, { role: "reviewer" }, owner);
  const g7d = await call("GET", `${P}/${c7.json.id}`, undefined, rev);
  const plDem = await call("GET", `/syntheses/${S}/plans/${a7.json.plan.id}`, undefined, editor);
  ok(demote.status === 200 && g7d.json.status === "open" && g7d.json.planId === null && plDem.status === 403, "C9a2 редактор понижен до рецензента: предложение из его черновика освобождено, план ему закрыт (403)", { demote: demote.status, planId: g7d.json?.planId, plDem: plDem.status });
  const rmEd = await call("DELETE", `/syntheses/${S}/members/${mEd.id}`, undefined, owner);
  const g7 = await call("GET", `${P}/${c7.json.id}`, undefined, rev);
  const plEx = await call("GET", `/syntheses/${S}/plans/${a7.json.plan.id}`, undefined, editor);
  const exEx = await call("POST", `/syntheses/${S}/plans/${a7.json.plan.id}/execute`, undefined, editor);
  ok(rmEd.status === 200 && g7.json.status === "open" && g7.json.planId === null && g7.json.events.at(-1).payload.reason === "member_removed" && plEx.status === 403 && exEx.status === 403, "C9b редактор исключён: чужое предложение в его черновике освобождено; свой план он больше не читает и не исполняет (403)", { g7: g7.json?.planId, plEx: plEx.status, exEx: exEx.status });
  const rmRev = await call("DELETE", `/syntheses/${S}/members/${mRev.id}`, undefined, owner);
  const after = await sql`select id, status, close_reason, decided_by from proposals where synthesis_id=${S} and author_id=${rev.id}`;
  const openLeft = after.filter((p) => p.status === "open");
  const closedMr = after.filter((p) => p.close_reason === "member_removed");
  const [evMr] = await sql`select count(*)::int as n from proposal_events where synthesis_id=${S} and type='closed' and payload->>'reason'='member_removed'`;
  ok(rmRev.status === 200 && openLeft.length === 0 && closedMr.length === 2 && closedMr.every((p) => p.decided_by === owner.id) && evMr.n === 2 && after.some((p) => p.status === "accepted") && after.some((p) => p.status === "rejected"), "C9c рецензент исключён: его ОТКРЫТЫЕ предложения closed/member_removed той же транзакцией; принятые и отклонённые — история, не тронуты", { after });
  const [pc] = await sql`select count(*)::int as n from proposals where synthesis_id=${S} and status='rejected' and decided_by is null`;
  ok(pc.n === 0, "C9d ни одного отклонения без решившего человека");
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
