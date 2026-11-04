/**
 * smoke-152-request1 — первый запрос беседы 15.2 (удаление элементов и
 * подразделов — вручную и по рекомендации; Д-71, попутно Д-78, Д-79). Живая
 * БД в процессе (PG16 + Redis), сервер и браузер не нужны — браузерные
 * проверки — тестовые запросы 2–5 беседы.
 *
 *   A. Чистые функции и исходники: типы шагов shared (DELETE_STEP_TYPES ⊆
 *      FREE_STEP_TYPES, parseSubsectionStepTarget), removeExactSubsectionHtml
 *      (точное имя, нечёткое — null, вложенные перечислены), общий помощник
 *      subsectionNamesOf (Д-79) ≡ прежним копиям, клиентское зеркало
 *      (costKindOf / isSelectableRow / estimateSelection / actionTextOf),
 *      один pause_marker плана (Д-78, по исходникам), EditPlanPanel знает
 *      новые типы.
 *   B. Живая БД: deleteElement категории — рёбра FK, has_reflexive,
 *      related_categories, кластеры, обогащения, рекомендации (new/stale →
 *      invalid, planned — ссылка), снимок версии; тезис, термин; маршруты
 *      DELETE (401/403/404/200); deleteSubsection (замок, точное имя,
 *      вложенные, версия 'section'), маршрут DELETE подраздела (409/200);
 *      планировщик рекомендаций «удалить» → delete_element /
 *      delete_subsection; createPlan/updatePlan; исполнение плана с двумя
 *      шагами удаления (бесплатный слот) — элемент и подраздел ушли,
 *      рекомендации done, версии с origin.stepType delete_*; конфликты
 *      нормализатора.
 *
 * Запуск из корня:  node_modules/.bin/tsx tests/smoke-152-request1.mjs
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { Hono } from "hono";

const ROOT = new URL("../", import.meta.url).pathname;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 900) : ""}`); }
}
const TAG = Math.random().toString(36).slice(2, 8);
const codeOf = async (p) => { try { await p; return null; } catch (e) { return e?.code ?? String(e); } };

/* ── Модули в процессе ───────────────────────────────────────────────── */
const LOC = await import("../server/i18n/locale.ts");
LOC.installServerCatalogProvider();
const S = await import("../packages/shared/constants/edit-steps.ts");
const HP = await import("../server/utils/html-parser.ts");
const GEN = await import("../server/services/generation-service.ts");
const EE = await import("../server/services/element-editor.ts");
const EP = await import("../server/services/edit-planner.ts");
const RP = await import("../server/services/recommendation-planner.ts");
const PX = await import("../server/services/plan-executor.ts");
const RE = await import("../server/routes/elements.ts");
const RSec = await import("../server/routes/sections.ts");
const U = await import("../client/src/utils/recommendations.ts");
const { closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");
LOC.installServerCatalogProvider(); // клиентские модули подменяют провайдер (14.2)

const userIds = [];
async function mkUser(tag) {
  const [u] = await sql`insert into users (email, password_hash) values (${`s152-${tag}-${TAG}@example.com`}, 'x') returning id`;
  userIds.push(u.id);
  return u.id;
}
async function sessionFor(userId) {
  const token = `s152-${TAG}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await sql`insert into sessions (id, user_id, expires_at) values (${createHash("sha256").update(token).digest("hex")}, ${userId}, now() + interval '1 hour')`;
  return { cookie: `philosynth_session=${token}` };
}

const sub = (n, b) => `<div data-section="${n}"><h4>${n}</h4>${b}</div>`;
const wrap = (b) => `<div class="doc-section"><div class="section-title">T</div><div class="doc-content">${b}</div></div>`;

try {
  /* ══ A. Чистые функции и исходники ══════════════════════════════════ */
  console.log("A. Чистые функции и исходники");
  ok(J([...S.DELETE_STEP_TYPES]) === J(["delete_element", "delete_subsection"]) && S.DELETE_STEP_TYPES.every((t) => S.isFreeStepType(t)) && S.isElementStepType("delete_element") && !S.isElementStepType("delete_subsection"), "A1 DELETE_STEP_TYPES — два новых типа, оба бесплатны; delete_element адресует элемент");
  ok(J(S.parseSubsectionStepTarget("graph:Топология: частный случай")) === J({ sectionKey: "graph", subsectionName: "Топология: частный случай" }) && S.parseSubsectionStepTarget("graph") === null && S.parseSubsectionStepTarget("graph:") === null, "A2 parseSubsectionStepTarget — делит по первому «:», пустые части — null");
  ok(S.isDeletableElementKind("category") && S.isDeletableElementKind("glossary_term") && !S.isDeletableElementKind("edge") && !S.isDeletableElementKind("x"), "A3 isDeletableElementKind — три вида, связь не удаляется планом");
  const html = wrap(sub("Анализ", "<p>а</p>" + sub("Внутренний", "<p>в</p>")) + sub("Анализ рисков", "<p>р</p>"));
  const r1 = HP.removeExactSubsectionHtml(html, "Анализ");
  ok(r1 && J(r1.removedNested) === J(["Внутренний"]) && !/data-section="Анализ"/.test(r1.html) && /data-section="Анализ рисков"/.test(r1.html), "A4 removeExactSubsectionHtml — точное имя, вложенный перечислен, «Анализ рисков» цел", r1);
  ok(HP.removeExactSubsectionHtml(html, "Анал") === null && HP.removeSubsectionHtml(html, "Анал").removed === true, "A5 нечёткое имя: точное удаление — null (старый removeSubsectionHtml снял бы «похожий»)");
  const legacy = (h) => { const names = []; const seen = new Set(); const rx = /data-section="([^"]+)"/g; let m; while ((m = rx.exec(h)) !== null) if (!seen.has(m[1])) { seen.add(m[1]); names.push(m[1]); } return GEN.parseSubsectionsFromHTML(h, names).map((x) => x.name); };
  ok(J(HP.subsectionNamesOf(html, GEN.parseSubsectionsFromHTML)) === J(legacy(html)) && HP.subsectionNamesOf("", GEN.parseSubsectionsFromHTML).length === 0, "A6 (Д-79) subsectionNamesOf ≡ прежним копиям listSubsections / subsectionNamesOf");
  const secSrc = readFileSync(ROOT + "server/routes/sections.ts", "utf8"), synSrc = readFileSync(ROOT + "server/routes/syntheses.ts", "utf8");
  ok(!/data-section="\(\[\^"\]\+\)"/.test(secSrc) && !/data-section="\(\[\^"\]\+\)"/.test(synSrc) && /subsectionNamesOf\(html, parseSubsectionsFromHTML\)/.test(secSrc) && /subsectionNamesOfHtml\(html, parseSubsectionsFromHTML\)/.test(synSrc), "A7 (Д-79) в роутах своей регулярки нет — обе на общем помощнике");
  const pxSrc = readFileSync(ROOT + "server/services/plan-executor.ts", "utf8"), prSrc = readFileSync(ROOT + "server/services/pause-resume-service.ts", "utf8");
  ok(!/logPauseEvent/.test(pxSrc) && (prSrc.match(/logPauseEvent\(synthesisId, "pause_marker"/g) ?? []).length === 2, "A8 (Д-78) pause_marker плана пишет только createPausedState — у исполнителя второго вызова нет");
  const row = (o) => ({ id: "i" + o.num, synthesisId: "s", round: 1, roundHash: "h", position: Number(o.num), num: o.num, addressSubsection: "П", addressSection: "graph", element: null, elementKind: null, elementId: null, op: "развить", replacement: null, rationale: "", severity: "", status: "new", invalidReason: null, sourceHash: null, planId: null, stepIndex: null, createdAt: new Date(), ...o });
  const delEl = row({ num: "1", op: "Удалить", element: "A", elementKind: "category", elementId: "a" });
  const delSub = row({ num: "2", op: "удалить", addressSubsection: "Хвост" });
  ok(U.costKindOf(delEl) === "free" && U.costKindOf(delSub) === "free" && U.isSelectableRow(delEl) && U.isSelectableRow(delSub) && U.isDeleteRow(delEl) && /удал/i.test(U.costLabelOf(delEl)), "A9 зеркало клиента: «удалить» — бесплатно и выбираемо, пометка «удаление · бесплатно»");
  ok(/элемент будет удалён/.test(U.actionTextOf(delEl)) && /подраздел будет удалён/.test(U.actionTextOf(delSub)), "A10 actionTextOf — подписи удаления");
  const est = U.estimateSelection([delEl, delSub, row({ num: "3", addressSubsection: "Хвост" })], new Set(["1", "2", "3"]));
  ok(est.free === 1 && est.paid === 1 && est.conflicts.length === 1, "A11 estimateSelection: удаление элемента — бесплатно; удаление и перегенерация одного подраздела — конфликт", est);
  const draftA = RP.rowsToPlanActions([delEl, delSub, row({ num: "3", addressSubsection: "Хвост" })], () => null, ["sum", "graph"]);
  ok(draftA.body.elementDeletes.length === 1 && draftA.body.subsectionDeletes.length === 0 && draftA.declined.length === 1 && draftA.declined[0].code === "same_target", "A12 планировщик ≡ зеркалу на том же наборе (отказ same_target у удаления перегенерируемого подраздела)", draftA.declined);
  const eppSrc = readFileSync(ROOT + "client/src/components/edit/EditPlanPanel.tsx", "utf8");
  ok(/delete_element: tl\(/.test(eppSrc) && /delete_subsection: tl\(/.test(eppSrc) && /plan-step-delete/.test(eppSrc), "A13 EditPlanPanel — строки новых шагов");

  /* ══ B. Живая БД ════════════════════════════════════════════════════ */
  console.log("B. Живая БД");
  const owner = await mkUser("o"), stranger = await mkUser("s");
  const graphHtml = wrap(sub("Таблица категорий", `<table class="doc-table"><thead><tr><th>Категория</th><th>Тип</th><th>Определение</th></tr></thead><tbody><tr><td>Alpha ${TAG}</td><td>т</td><td>д</td></tr><tr><td>Beta</td><td>т</td><td>д</td></tr></tbody></table>`) + sub("Описание", `<p>Alpha ${TAG} и Beta.</p>` + sub("Вложенный", "<p>внутри</p>")) + sub("Хвост", "<p>конец</p>"));
  const [syn] = await sql`insert into syntheses (user_id, seed, title, status, section_order) values (${owner}, ${"зерно " + TAG}, ${"S " + TAG}, 'ready', ${sql.json(["sum", "graph", "theses"])}) returning id`;
  const sid = syn.id;
  await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values
    (${sid}, 'sum', 0, 'Резюме', ${wrap(sub("Итог", `<p>Категория Alpha ${TAG} важна; термин Квант тоже.</p>`))}),
    (${sid}, 'graph', 1, 'Граф', ${graphHtml}),
    (${sid}, 'theses', 2, 'Тезисы', ${wrap(sub("Онтологические тезисы", "<p>Т1. ф</p>") + sub("Сводная таблица тезисов", `<table class="doc-table"><thead><tr><th>№</th><th>Формулировка</th></tr></thead><tbody><tr><td>Т1</td><td>ф</td></tr></tbody></table>`))})`;
  const cat = async (name, ci) => (await sql`insert into categories (synthesis_id, name, type, definition, cluster_indices) values (${sid}, ${name}, 'т', 'д', ${sql.json(ci)}) returning id`)[0].id;
  const A = await cat(`Alpha ${TAG}`, [0, 1]), B = await cat("Beta", [1]), C = await cat("Gamma", [1]);
  await sql`insert into category_edges (synthesis_id, source_id, target_id, edge_type, direction, description) values (${sid}, ${A}, ${B}, 'т', 'рефлексивная', ''), (${sid}, ${B}, ${C}, 'т', 'однонаправленная', '')`;
  await sql`update categories set has_reflexive=true where id in (${A}, ${B})`;
  await sql`insert into cluster_labels (synthesis_id, cluster_index, label) values (${sid}, 0, 'K0'), (${sid}, 1, 'K1')`;
  const [t1] = await sql`insert into theses (synthesis_id, thesis_num, formulation, justification, thesis_type, related_categories) values (${sid}, 1, 'ф', 'о', 'ontological', ${sql.json([`ALPHA ${TAG}`, "Beta"])}) returning id`;
  const [g1] = await sql`insert into glossary_terms (synthesis_id, term, definition) values (${sid}, 'Квант', 'д') returning id`;
  const edges = await sql`select id from category_edges where synthesis_id=${sid} and (source_id=${A} or target_id=${A})`;
  await sql`insert into element_enrichments (synthesis_id, element_id, element_type, enrichment_type, prompt_key, content) values (${sid}, ${A}, 'category', 'description', 'k', 'c'), (${sid}, ${edges[0].id}, 'edge', 'description', 'k', 'c')`;
  await sql`insert into characteristic_justifications (synthesis_id, element_id, element_type, characteristic, value, justification) values (${sid}, ${A}, 'category', 'centrality', 0.5, 'x')`;
  const rec = async (num, status, elementId, extra = {}) => (await sql`insert into recommendations (synthesis_id, round, position, num, address_subsection, address_section, element, element_kind, element_id, op, rationale, severity, status, round_hash, source_hash)
    values (${sid}, 1, ${Number(num)}, ${num}, ${extra.sub ?? "Описание"}, ${extra.sec ?? "graph"}, ${elementId ? "Alpha" : null}, ${elementId ? "category" : null}, ${elementId}, ${extra.op ?? "удалить"}, '', '', ${status}, 'h', ${elementId ? "s" : null}) returning id`)[0].id;
  const rNew = await rec("1", "new", A), rStale = await rec("2", "stale", A), rPlanned = await rec("3", "planned", A), rOther = await rec("4", "new", null);

  // B1 маршруты DELETE: без сессии 401, чужой 403, не-UUID 404
  const app = new Hono();
  app.route("/syntheses", RE.elementsRoutes);
  app.route("/syntheses", RSec.sectionsRoutes);
  const ownerH = await sessionFor(owner), strangerH = await sessionFor(stranger);
  const st = async (path, headers) => (await app.request(path, { method: "DELETE", headers })).status;
  ok((await st(`/syntheses/${sid}/categories/${A}`, {})) === 401 && (await st(`/syntheses/${sid}/categories/${A}`, strangerH)) === 403 && (await st(`/syntheses/${sid}/categories/not-a-uuid`, ownerH)) === 404 && (await st(`/syntheses/${sid}/theses/${A}`, ownerH)) === 404, "B1 DELETE элемента: 401 без сессии, 403 чужому, 404 не-UUID / чужая таблица");
  // B2 удаление категории маршрутом — ответ и каскад
  const resA = await app.request(`/syntheses/${sid}/categories/${A}`, { method: "DELETE", headers: ownerH });
  const bodyA = await resA.json();
  ok(resA.status === 200 && bodyA.ok === true && bodyA.version?.elementId === A && bodyA.version.changeSource === "manual", "B2 DELETE категории — 200, ok, версия-снимок manual", { status: resA.status, bodyA });
  ok(J(bodyA.cascade) === J({ edgesDeleted: 1, thesesUnlinked: 1, clusterLabelsDeleted: 1, recommendationsDetached: 3, enrichmentsDeleted: 3 }), "B3 каскад: 1 ребро, 1 тезис, 1 метка кластера, 3 рекомендации, 3 обогащения/обоснования", bodyA.cascade);
  ok(bodyA.impact.severity === "high" && bodyA.htmlSync.rendered.length >= 1, "B4 отчёт влияния: упоминание в «sum» → high; таблица категорий перерисована", { impact: bodyA.impact, sync: bodyA.htmlSync });
  const [gsec] = await sql`select html_content from sections where synthesis_id=${sid} and key='graph'`;
  ok(!new RegExp(`<td>Alpha ${TAG}</td>`).test(gsec.html_content) && new RegExp(`Alpha ${TAG} и Beta`).test(gsec.html_content), "B5 таблица без удалённой строки, проза раздела не тронута (упоминание осталось)");
  const [sumSec] = await sql`select html_content from sections where synthesis_id=${sid} and key='sum'`;
  ok(new RegExp(`Alpha ${TAG}`).test(sumSec.html_content), "B6 упоминание в другом разделе не вычищено (правило беседы)");
  // B7 по перечню п.0 — висячих ссылок нет
  const catsLeft = await sql`select id, name, has_reflexive from categories where synthesis_id=${sid}`;
  const edgesLeft = await sql`select source_id, target_id from category_edges where synthesis_id=${sid}`;
  const [th] = await sql`select related_categories from theses where id=${t1.id}`;
  const labels = await sql`select cluster_index from cluster_labels where synthesis_id=${sid} order by cluster_index`;
  const enr = await sql`select count(*)::int as n from element_enrichments where synthesis_id=${sid}`;
  const jus = await sql`select count(*)::int as n from characteristic_justifications where synthesis_id=${sid}`;
  const recs = await sql`select id, status, element_id, issues, invalid_reason from recommendations where synthesis_id=${sid} order by position`;
  ok(!catsLeft.some((c) => c.id === A) && edgesLeft.length === 1 && !edgesLeft.some((e) => e.source_id === A || e.target_id === A), "B7a строка и её рёбра ушли");
  ok(catsLeft.find((c) => c.name === "Beta").has_reflexive === false, "B7b has_reflexive соседа пересчитан");
  ok(J(th.related_categories) === J(["Beta"]), "B7c related_categories тезиса без имени (сравнение без регистра)", th.related_categories);
  ok(labels.map((l) => l.cluster_index).join() === "1", "B7d метка кластера без членов снята, живая осталась", labels);
  ok(enr[0].n === 0 && jus[0].n === 0, "B7e обогащения и обоснования элемента и его ребра удалены");
  const byId = Object.fromEntries(recs.map((r) => [r.id, r]));
  ok(recs.every((r) => r.element_id === null) && byId[rNew].status === "invalid" && byId[rStale].status === "invalid" && byId[rPlanned].status === "planned" && byId[rOther].status === "new", "B7f рекомендации: element_id → null; new/stale → invalid, planned — только ссылка, чужая не тронута", recs.map((r) => r.status));
  ok(J(byId[rNew].issues).includes("target_element_gone") && /удал/.test(byId[rNew].invalid_reason ?? ""), "B7g негодная строка — код target_element_gone + русская фраза", byId[rNew]);
  const vA = await sql`select version, change_source from element_versions where element_id=${A} and element_type='category'`;
  const vT = await sql`select change_source from element_versions where element_id=${t1.id} and element_type='thesis'`;
  ok(vA.length === 1 && vT.length === 1 && vT[0].change_source === "cascade", "B8 версии: снимок удалённой категории остался; у тезиса — версия 'cascade'");
  ok((await codeOf(EE.deleteElement(sid, "category", A))) === "NOT_FOUND" && (await st(`/syntheses/${sid}/categories/${A}`, ownerH)) === 404, "B9 повторное удаление — NOT_FOUND / 404");
  // B10 тезис и термин маршрутами
  const rT = await app.request(`/syntheses/${sid}/theses/${t1.id}`, { method: "DELETE", headers: ownerH });
  const rG = await app.request(`/syntheses/${sid}/glossary/${g1.id}`, { method: "DELETE", headers: ownerH });
  const jT = await rT.json(), jG = await rG.json();
  ok(rT.status === 200 && rG.status === 200 && jT.version.elementType === "thesis" && jG.version.elementType === "glossary_term" && jG.impact.severity === "high", "B10 DELETE тезиса и термина — 200; термин упомянут в «sum» → high", { t: jT.impact, g: jG.impact });
  const [thSec] = await sql`select html_content from sections where synthesis_id=${sid} and key='theses'`;
  ok(!/<td>Т1<\/td>/.test(thSec.html_content) && /Т1\. ф/.test(thSec.html_content), "B11 сводная таблица тезисов перерисована, абзац тезиса в прозе остался");

  // B12 подраздел: запертый — 409, нечёткое — 404, точное — 200 с вложенными
  // (после B2 рендерер 5.1 дорисовал в разделе «Таблица связей» и «Топологическая
  // таблица» — состав раздела проверяется по вхождению, не списком)
  const dsPath = (name) => `/syntheses/${sid}/sections/graph/subsections/${encodeURIComponent(name)}`;
  ok((await st(dsPath("Таблица категорий"), ownerH)) === 409 && (await st(dsPath("Описан"), ownerH)) === 404 && (await st(dsPath("Описание"), strangerH)) === 403 && (await st(`/syntheses/${sid}/sections/capsule/subsections/%D0%9A%D0%B0%D0%BF%D1%81%D1%83%D0%BB%D0%B0`, ownerH)) === 409, "B12 DELETE подраздела: таблица → 409, нечёткое имя → 404, чужой → 403, капсула → 409");
  const dsRes = await app.request(dsPath("Описание"), { method: "DELETE", headers: ownerH });
  const ds = await dsRes.json();
  ok(dsRes.status === 200 && ds.ok === true && J(ds.removedNested) === J(["Вложенный"]) && ds.version.elementType === "section" && ds.section.isEdited === true && ds.section.subsections.includes("Хвост") && !ds.section.subsections.includes("Описание") && ds.section.lockedSubsections.includes("Таблица категорий") && !ds.section.lockedSubsections.includes("Хвост"), "B13 DELETE подраздела — 200: вложенный перечислен, версия 'section', состав и замки раздела после", { status: dsRes.status, nested: ds.removedNested, vt: ds.version?.elementType, isEdited: ds.section?.isEdited, subs: ds.section?.subsections, locked: ds.section?.lockedSubsections });
  const [gsec2] = await sql`select html_content, is_edited from sections where synthesis_id=${sid} and key='graph'`;
  ok(gsec2.is_edited && !/data-section="Описание"|data-section="Вложенный"/.test(gsec2.html_content) && /data-section="Хвост"/.test(gsec2.html_content), "B14 HTML раздела без подраздела и вложенного, остальное цело, раздел помечен изменённым");

  // B15 планировщик рекомендаций и план: «удалить» → шаги; исполнение
  await sql`update recommendations set status='done' where id=${rPlanned}`;
  const rDelB = await rec("5", "new", B, { sub: "Таблица категорий" }), rDelSub = await rec("6", "new", null, { sub: "Хвост" });
  const rowsNow = await sql`select * from recommendations where synthesis_id=${sid} and id in (${rDelB}, ${rDelSub})`;
  const toRow = (r) => ({ id: r.id, synthesisId: r.synthesis_id, round: r.round, roundHash: r.round_hash, position: r.position, num: r.num, addressSubsection: r.address_subsection, addressSection: r.address_section, element: r.element, elementKind: r.element_kind, elementId: r.element_id, op: r.op, replacement: r.replacement, rationale: r.rationale, severity: r.severity, status: r.status, invalidReason: r.invalid_reason, sourceHash: r.source_hash, planId: r.plan_id, stepIndex: r.step_index, createdAt: r.created_at });
  const draft = RP.rowsToPlanActions(rowsNow.map(toRow), () => null, ["sum", "graph", "theses"]);
  ok(draft.body.elementDeletes.length === 1 && draft.body.elementDeletes[0].elementId === B && draft.body.subsectionDeletes.length === 1 && draft.body.subsectionDeletes[0].target === "graph:Хвост" && draft.declined.length === 0 && draft.plannedIds.length === 2, "B15 rowsToPlanActions: «удалить» → elementDeletes + subsectionDeletes, отказов нет", draft);
  const plan = await EP.createPlan(sid, owner, draft.body, { trustRecommendationRefs: true });
  const types = plan.steps.map((s) => s.type);
  ok(types[0] === "delete_element" && types.includes("delete_subsection") && plan.costBreakdown.free.steps === 2 && plan.estimatedCost === 0 && plan.steps.filter((s) => !s.cascadeGenerated).every((s) => s.recommendations?.length === 1), "B16 createPlan: шаги удаления первыми, бесплатны, несут рекомендации", { types, cb: plan.costBreakdown });
  const recAfterPlan = await sql`select id, status, plan_id from recommendations where id in (${rDelB}, ${rDelSub})`;
  ok(recAfterPlan.every((r) => r.status === "planned" && r.plan_id === plan.id), "B17 рекомендации шагов удаления → planned");
  const upd = await EP.updatePlan(sid, plan.id, owner, { steps: [{ index: 0, status: "skipped" }] });
  ok(upd.steps.filter((s) => s.type === "delete_element").length === 1 && upd.steps[0].status === "skipped" && upd.steps.some((s) => s.type === "delete_subsection"), "B18 updatePlan переносит шаги удаления и решение по ним");
  await EP.updatePlan(sid, plan.id, owner, { steps: [{ index: 0, status: "confirmed" }] });
  await PX.executePlan(sid, plan.id, owner);
  for (let i = 0; i < 100; i++) { const [p] = await sql`select status from edit_plans where id=${plan.id}`; if (p.status !== "executing" && p.status !== "draft") break; await sleep(100); }
  const [planRow] = await sql`select status, steps from edit_plans where id=${plan.id}`;
  const stepStatuses = planRow.steps.filter((s) => !s.cascadeGenerated).map((s) => `${s.type}:${s.status}`);
  ok(planRow.status === "done" && stepStatuses.every((x) => x.endsWith(":done")), "B19 план с двумя шагами удаления исполнен под бесплатным слотом", { status: planRow.status, stepStatuses });
  const [bLeft] = await sql`select count(*)::int as n from categories where id=${B}`;
  const [gsec3] = await sql`select html_content from sections where synthesis_id=${sid} and key='graph'`;
  ok(bLeft.n === 0 && !/data-section="Хвост"/.test(gsec3.html_content), "B20 элемент и подраздел ушли шагами плана");
  const recDone = await sql`select status from recommendations where id in (${rDelB}, ${rDelSub})`;
  ok(recDone.every((r) => r.status === "done"), "B21 рекомендации «удалить» → done");
  const vB = await sql`select change_source, origin from element_versions where element_id=${B} and element_type='category'`;
  const vSec = await sql`select change_source, origin from element_versions ev join sections s on s.id=ev.element_id where ev.element_type='section' and s.synthesis_id=${sid} and s.key='graph' order by ev.version desc limit 1`;
  ok(vB.length === 1 && vB[0].change_source === "recommendation" && vB[0].origin?.stepType === "delete_element" && vB[0].origin?.num === "5" && vSec[0]?.change_source === "recommendation" && vSec[0].origin?.stepType === "delete_subsection", "B22 версии шагов плана — 'recommendation' с origin.stepType delete_element / delete_subsection", { vB, vSec });
  const [usage] = await sql`select count(*)::int as n from api_usage where user_id=${owner}`;
  ok(usage.n === 0, "B23 модель не звалась — следа в api_usage нет");
  // B24 конфликты нормализатора
  ok((await codeOf(EP.createPlan(sid, owner, { regen: [], remove: [], add: [], elementDeletes: [{ kind: "category", elementId: C }], elementEdits: [{ kind: "category", elementId: C, value: "x" }] }))) === "VALIDATION_ERROR"
    && (await codeOf(EP.createPlan(sid, owner, { regen: ["graph"], remove: [], add: [], elementDeletes: [{ kind: "category", elementId: C }] }))) === "VALIDATION_ERROR"
    && (await codeOf(EP.createPlan(sid, owner, { regen: [], remove: [], add: [], subsectionDeletes: [{ target: "graph:Таблица категорий" }], regenSubsections: [{ target: "graph:Таблица категорий" }] }))) === "VALIDATION_ERROR"
    && (await codeOf(EP.createPlan(sid, owner, { regen: [], remove: [], add: [], elementDeletes: [{ kind: "edge", elementId: C }] }))) === "VALIDATION_ERROR", "B24 нормализатор: правка+удаление элемента, удаление в перегенерируемом разделе, удаление+перегенерация подраздела, связь — отказ");
  // B25 запертый подраздел шагом плана — шаг падает, план на паузе с ОДНИМ pause_marker (Д-78)
  const planL = await EP.createPlan(sid, owner, { regen: [], remove: [], add: [], subsectionDeletes: [{ target: "graph:Таблица категорий" }] });
  await PX.executePlan(sid, planL.id, owner);
  for (let i = 0; i < 100; i++) { const [p] = await sql`select status from edit_plans where id=${planL.id}`; if (p.status !== "executing" && p.status !== "draft") break; await sleep(100); }
  const [planLRow] = await sql`select status from edit_plans where id=${planL.id}`;
  const markers = await sql`select metadata from generation_log where synthesis_id=${sid} and log_type='pause_marker'`;
  ok(planLRow.status === "paused" && markers.length === 1 && markers[0].metadata.kind === "plan" && typeof markers[0].metadata.reasonKind === "string" && markers[0].metadata.reason === undefined, "B25 (Д-78) шаг удаления запертого подраздела падает → пауза плана с ОДНИМ pause_marker (поля причины, без фразы)", { status: planLRow.status, markers: markers.map((m) => m.metadata) });
  await sql`update syntheses set status='ready', paused_state=null where id=${sid}`;
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
} finally {
  console.log(`\nИТОГ: ${passed} ✓, ${failed} ✗${fails.length ? "\n  " + fails.join("\n  ") : ""}`);
  try {
    for (const id of userIds) await sql`delete from sessions where user_id=${id}`;
    for (const id of userIds) await sql`delete from syntheses where user_id=${id}`;
    for (const id of userIds) await sql`delete from users where id=${id}`;
  } catch (e2) { console.error("уборка:", e2); }
  await Promise.race([Promise.all([closeDb(), closeRedis()]), sleep(2000)]);
  await Promise.race([sql.end(), sleep(2000)]);
  process.exit(failed ? 1 : 0);
}
