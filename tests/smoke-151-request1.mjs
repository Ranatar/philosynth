/**
 * smoke-151-request1 — первый запрос беседы 15.1 (родословная после импорта:
 * Д-70 целостность — уникальный индекс пары и LINEAGE_EXISTS из гонки, копия
 * с file_genealogy, одно правило «мета»; Д-68 кандидаты узла файла и привязка
 * по явной позиции; Д-69 отвязка только поверх узла файла). Живая БД в
 * процессе (PG16), сервер и браузер не нужны — браузерные проверки и живой
 * импорт файла — тестовые запросы 2–4 беседы.
 *
 *   A. Чистые функции: fileNodeAt (free / covered / not_concept / missing),
 *      isMetaSynthesisRows (живая связь, мёртвая строка, узел файла),
 *      unlinkedFileParents, клиент — lineageActionFor и
 *      lineageNodeToGenealogy (position / coversFileNode); миграция 0014 на
 *      своём месте журнала, DELETE дублей + частичный уникальный индекс,
 *      индекс в схеме.
 *   B. Живая БД: кандидаты узла (по имени и по подстроке; философ / нет
 *      позиции / перекрыт → LINEAGE_NODE_UNAVAILABLE), привязка по позиции →
 *      coversFileNode в древе, гонка двух привязок → одна строка и
 *      LINEAGE_EXISTS, отвязка → узел проступает (revealed), родитель за
 *      пределами дерева файла → LINEAGE_GENERATED, не связанный →
 *      LINEAGE_NOT_LINKED, безымянный узел — по позиции; одно правило «мета»
 *      (удалённый родитель: бейдж каталога ≡ страница); копия синтеза
 *      (POST …/duplicate через app.request) несёт file_genealogy и строки с
 *      позициями; повтор UUID в participants файла не пишется второй строкой.
 *
 * Запуск из корня:  node_modules/.bin/tsx tests/smoke-151-request1.mjs
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import postgres from "postgres";

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

/* ── Модули в процессе ───────────────────────────────────────────────── */
const LOC = await import("../server/i18n/locale.ts");
LOC.installServerCatalogProvider();
const LS = await import("../server/services/lineage-service.ts");
const RS = await import("../server/routes/syntheses.ts");
const CG = await import("../client/src/utils/genealogy.ts");
const LA = await import("../client/src/components/lineage/LineageNodeActions.tsx");
const { db, closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");
// клиентские модули могли подменить провайдер каталога — вернуть серверный (14.2)
LOC.installServerCatalogProvider();
const en = (f) => LOC.runWithLocale("en", f);
const ru = (f) => LOC.runWithLocale("ru", f);

const userIds = [];
async function mkUser(tag) {
  const [u] = await sql`insert into users (email, password_hash) values (${`s151-${tag}-${TAG}@example.com`}, 'x') returning id`;
  userIds.push(u.id);
  return u.id;
}
async function mkSynth(userId, title, extra = {}) {
  const [row] = await sql`insert into syntheses (user_id, seed, title, status, section_order, file_genealogy)
    values (${userId}, ${"зерно " + TAG}, ${title}, 'ready', ${sql.json(["sum"])}, ${extra.fileGenealogy ? sql.json(extra.fileGenealogy) : null}) returning id`;
  return row.id;
}
async function rowsOf(id) {
  return sql`select parent_type, parent_name, parent_synthesis_id, position from synthesis_lineage where synthesis_id=${id} order by position`;
}
const codeOf = async (p) => { try { await p; return null; } catch (e) { return e?.code ?? String(e); } };

try {
  /* ══ A. Чистые функции ══════════════════════════════════════════════ */
  console.log("A. Чистые функции");
  const tree = { type: "concept", name: "root", participants: [
    { type: "concept", name: "Alpha" }, { type: "philosopher", name: "Кант" }, { type: "concept", name: "", unnamed: true }, { type: "concept", name: "Delta" },
  ] };
  const live = { position: 0, parentType: "synthesis", parentName: null, parentSynthesisId: "x" };
  const dead = { position: 3, parentType: "synthesis", parentName: null, parentSynthesisId: null };
  const phil = { position: 1, parentType: "philosopher", parentName: "Кант", parentSynthesisId: null };
  ok(LS.fileNodeAt(tree, [live, phil, dead], 0).state === "covered" && LS.fileNodeAt(tree, [live, phil, dead], 1).state === "covered" && LS.fileNodeAt(tree, [], 1).state === "not_concept"
    && LS.fileNodeAt(tree, [live, phil, dead], 2).state === "free" && LS.fileNodeAt(tree, [live, phil, dead], 3).state === "free"
    && LS.fileNodeAt(tree, [], 4).state === "missing" && LS.fileNodeAt(null, [], 0).state === "missing" && LS.fileNodeAt(tree, [], -1).state === "missing", "A1 fileNodeAt: covered (и строкой-философом) / not_concept / free (мёртвая строка не перекрывает) / missing");
  ok(LS.isMetaSynthesisRows([live], null) === true && LS.isMetaSynthesisRows([dead], null) === false && LS.isMetaSynthesisRows([phil], null) === false
    && LS.isMetaSynthesisRows([dead], tree) === true && LS.isMetaSynthesisRows([], { type: "concept", name: "r", participants: [{ type: "philosopher", name: "Кант" }] }) === false
    && LS.isMetaSynthesisRows([live], { type: "concept", name: "r", participants: [{ type: "concept", name: "A" }] }) === true, "A2 isMetaSynthesisRows: живая связь | неперекрытый узел-концепция файла; мёртвая строка и философы — нет");
  ok(J(LS.unlinkedFileParents(tree, [live, phil, dead]).map((f) => f.position)) === "[2,3]", "A3 unlinkedFileParents: мёртвая строка на позиции 3 узел не перекрывает");
  const node = (o) => ({ type: "synthesis", name: "n", depth: 1, children: [], ...o });
  const g1 = CG.lineageNodeToGenealogy(node({ fromFile: true, position: 2, children: [node({ fromFile: true, position: 0, depth: 2 })] }));
  const g2 = CG.lineageNodeToGenealogy(node({ synthesisId: "p1", position: 0, coversFileNode: true }));
  const g3 = CG.lineageNodeToGenealogy(node({ synthesisId: "p2", position: 5 }));
  ok(g1.position === 2 && g1.fromFile === true && g1.participants?.[0]?.position === 0 && g2.coversFileNode === true && g2.position === 0 && g3.coversFileNode === undefined, "A4 lineageNodeToGenealogy несёт position / coversFileNode");
  ok(LA.lineageActionFor(g1, 1) === "link" && LA.lineageActionFor(g2, 1) === "unlink" && LA.lineageActionFor(g3, 1) === null
    && LA.lineageActionFor(g1, 2) === null && LA.lineageActionFor({ type: "philosopher", name: "Кант", position: 1 }, 1) === null
    && LA.lineageActionFor({ type: "concept", name: "x", fromFile: true }, 1) === null, "A5 lineageActionFor: link у узла файла верхнего уровня, unlink у перекрывающей связи, иначе ничего");
  const journal = JSON.parse(readFileSync(ROOT + "server/db/migrations/meta/_journal.json", "utf8"));
  const mig = readFileSync(ROOT + "server/db/migrations/0014_lineage_parent_unique.sql", "utf8");
  const schema = readFileSync(ROOT + "server/db/schema.ts", "utf8");
  ok(journal.entries[14]?.tag === "0014_lineage_parent_unique" && /DELETE FROM "synthesis_lineage" a[\s\S]*USING "synthesis_lineage" b/.test(mig)
    && /CREATE UNIQUE INDEX "uq_lineage_parent_pair" ON "synthesis_lineage"[^;]*WHERE "synthesis_lineage"\."parent_type" = 'synthesis' AND "synthesis_lineage"\."parent_synthesis_id" IS NOT NULL/.test(mig)
    && /uniqueIndex\("uq_lineage_parent_pair"\)/.test(schema), "A6 миграция 0014 на месте журнала: чистка дублей + частичный уникальный индекс; индекс в схеме");

  /* ══ B. Живая БД ═══════════════════════════════════════════════════ */
  console.log("\nB. Живая БД");
  const [{ n: idxN }] = await sql`select count(*)::int as n from pg_indexes where indexname='uq_lineage_parent_pair'`;
  ok(idxN === 1, "B0 уникальный индекс в живой БД (миграция применена)");
  const owner = await mkUser("owner");
  const other = await mkUser("other");
  const P1 = await mkSynth(owner, `Alpha ${TAG}`);
  const P2 = await mkSynth(owner, `Gamma-concept ${TAG}`);
  const P3 = await mkSynth(owner, `Omega ${TAG}`);
  const foreign = await mkSynth(other, `Alpha ${TAG}`); // одноимённая чужая — в кандидаты не идёт
  const fileTree = { type: "concept", name: "child", participants: [
    { type: "concept", name: `«Alpha ${TAG}»`, seed: "s" }, { type: "philosopher", name: "Кант" }, { type: "concept", name: "", unnamed: true },
  ] };
  const C = await mkSynth(owner, `Child ${TAG}`, { fileGenealogy: fileTree });
  await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${C}, 'philosopher', 'Кант', 1)`;

  // B1 кандидаты узла 0: по имени (ёлочки сняты, чужая одноимённая не идёт), по подстроке
  const c0 = await LS.fileNodeCandidates(C, owner, 0, "gamma");
  ok(c0.node.position === 0 && c0.node.name === `«Alpha ${TAG}»` && c0.matches.length === 1 && c0.matches[0].id === P1
    && c0.search.length === 1 && c0.search[0].id === P2 && c0.query === "gamma", "B1 кандидаты узла: совпадение по имени — только своя Alpha; поиск по подстроке — Gamma", c0);
  const cEmpty = await LS.fileNodeCandidates(C, owner, 0);
  ok(cEmpty.search.length === 0 && cEmpty.query === "" && (await LS.fileNodeCandidates(C, owner, 0, "%")).search.length === 0, "B2 пустой запрос — пустой поиск; «%» экранирован");
  const e1 = await (async () => { try { await LS.fileNodeCandidates(C, owner, 1); return null; } catch (e) { return e; } })();
  const e7 = await (async () => { try { await LS.fileNodeCandidates(C, owner, 7); return null; } catch (e) { return e; } })();
  ok(e1?.code === "LINEAGE_NODE_UNAVAILABLE" && e1.details?.reason === "covered" && e7?.code === "LINEAGE_NODE_UNAVAILABLE" && e7.details?.reason === "missing", "B3 философ со строкой (covered) / нет позиции (missing) → LINEAGE_NODE_UNAVAILABLE с reason", [e1?.details, e7?.details]);

  // B4 привязка по явной позиции → древо: узел БД с coversFileNode; кандидаты → covered
  const rec = await LS.linkParent(C, P1, "какое угодно имя", { position: 0 });
  const anc = await LS.getAncestors(C, 5);
  const k0 = anc.children.find((n) => n.position === 0);
  ok(rec.position === 0 && k0?.synthesisId === P1 && k0.coversFileNode === true && k0.fromFile === undefined
    && anc.children.find((n) => n.position === 1)?.type === "philosopher" && anc.children.find((n) => n.position === 2)?.fromFile === true, "B4 linkParent по позиции: связь на 0, узел древа coversFileNode, узел 2 — снимок файла", anc.children);
  ok((await codeOf(LS.fileNodeCandidates(C, owner, 0))) === "LINEAGE_NODE_UNAVAILABLE" && (await codeOf(LS.linkParent(C, P3, "x", { position: 0 }))) === "LINEAGE_NODE_UNAVAILABLE", "B5 перекрытый узел: кандидаты и привязка по позиции → LINEAGE_NODE_UNAVAILABLE");
  ok((await codeOf(LS.linkParent(C, P1, "x"))) === "LINEAGE_EXISTS", "B6 повторная привязка той же пары → LINEAGE_EXISTS (предварительная проверка)");

  // B7 гонка: снять связь, две одновременные привязки → одна строка, второй — LINEAGE_EXISTS из индекса
  await sql`delete from synthesis_lineage where synthesis_id=${C} and parent_synthesis_id=${P1}`;
  const race = await Promise.allSettled([LS.linkParent(C, P1, "x", { position: 0 }), LS.linkParent(C, P1, "x", { position: 0 })]);
  const okCount = race.filter((r) => r.status === "fulfilled").length;
  const exists = race.filter((r) => r.status === "rejected" && r.reason?.code === "LINEAGE_EXISTS").length;
  const rowsAfter = await rowsOf(C);
  ok(okCount === 1 && exists === 1 && rowsAfter.filter((r) => r.parent_synthesis_id === P1).length === 1, "B7 гонка двух привязок: одна строка, второй — LINEAGE_EXISTS", race.map((r) => r.status === "fulfilled" ? "ok" : r.reason?.code ?? String(r.reason)));

  // B8 отвязка: узел файла проступает
  const un = await en(() => LS.unlinkParent(C, P1));
  const anc2 = await LS.getAncestors(C, 5);
  const k0b = anc2.children.find((n) => n.position === 0);
  ok(un.ok === true && un.record.parentSynthesisId === P1 && un.revealed.position === 0 && un.revealed.name === `«Alpha ${TAG}»`
    && k0b?.fromFile === true && (await rowsOf(C)).every((r) => r.parent_synthesis_id !== P1), "B8 unlinkParent: строка снята, узел файла снова снимком, revealed — имя узла", { un, k0b });
  ok((await codeOf(LS.unlinkParent(C, P1))) === "LINEAGE_NOT_LINKED", "B9 повторная отвязка → LINEAGE_NOT_LINKED");

  // B10 родитель за пределами дерева файла (по имени без совпадения) → отвязать нельзя
  const beyond = await codeOf(LS.linkParent(C, P2, "нет такого узла"));
  await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${C}, 'synthesis', ${P2}, 3)`; // строка генерации без узла файла
  ok(beyond === "LINEAGE_NODE_UNAVAILABLE" && (await codeOf(LS.unlinkParent(C, P2))) === "LINEAGE_GENERATED", "B10 (Д-80) привязка по имени без узла файла → LINEAGE_NODE_UNAVAILABLE; строка без узла файла → LINEAGE_GENERATED при отвязке", beyond);
  // B11 синтез сервиса без дерева файла (мета-синтез генерацией) — тоже LINEAGE_GENERATED
  const G = await mkSynth(owner, `Generated ${TAG}`);
  await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${G}, 'synthesis', ${P1}, 0)`;
  ok((await codeOf(LS.unlinkParent(G, P1))) === "LINEAGE_GENERATED", "B11 родитель мета-синтеза без дерева файла → LINEAGE_GENERATED");

  // B12 безымянный узел — только по позиции; при чтении подстановка на языке запроса
  const recU = await LS.linkParent(C, P3, "[unnamed concept]", { position: 2 });
  const cands2 = await codeOf(LS.fileNodeCandidates(C, owner, 2));
  const unU = await en(() => LS.unlinkParent(C, P3));
  ok(recU.position === 2 && cands2 === "LINEAGE_NODE_UNAVAILABLE" && unU.revealed.unnamed === true && unU.revealed.name === "[unnamed concept]"
    && (await ru(() => LS.unlinkParent(C, P3)).catch((e) => e.code)) === "LINEAGE_NOT_LINKED", "B12 безымянный узел: привязка по позиции 2, отвязка возвращает подстановку на языке запроса", { recU, unU });
  const cU = await en(() => LS.fileNodeCandidates(C, owner, 2));
  ok(cU.node.unnamed === true && cU.node.name === "[unnamed concept]" && cU.matches.length === 0, "B13 кандидаты безымянного узла: имя — подстановка, совпадений по имени нет");

  // B14 одно правило «мета»: удалённый родитель — бейдж каталога ≡ страница
  const G2 = await mkSynth(owner, `Gen2 ${TAG}`);
  const Ptmp = await mkSynth(owner, `Tmp ${TAG}`);
  await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${G2}, 'synthesis', ${Ptmp}, 0)`;
  const I = await mkSynth(owner, `Imported ${TAG}`, { fileGenealogy: { type: "concept", name: "i", participants: [{ type: "concept", name: "Tmp" }] } });
  await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${I}, 'synthesis', ${Ptmp}, 0)`;
  const before = await RS.loadConceptParentFlags([G2, I, C, G]);
  await sql`delete from syntheses where id=${Ptmp}`; // SET NULL у строк G2 и I
  const after = await RS.loadConceptParentFlags([G2, I, C, G]);
  const [g2rows, irows] = [await rowsOf(G2), await rowsOf(I)];
  // правило страницы: parentSyntheses (живые) непусты ИЛИ fileConceptParents непусты
  const pageRule = (rows, fg) => rows.some((r) => r.parent_type === "synthesis" && r.parent_synthesis_id) || LS.unlinkedFileParents(fg, rows.map((r) => ({ position: r.position, parentType: r.parent_type, parentName: r.parent_name, parentSynthesisId: r.parent_synthesis_id }))).some((f) => f.node.type === "concept");
  ok(before.has(G2) && before.has(I) && before.has(C) && before.has(G) && g2rows[0].parent_synthesis_id === null && irows[0].parent_synthesis_id === null
    && !after.has(G2) && after.has(I) && after.has(C) && after.has(G)
    && pageRule(g2rows, null) === false && pageRule(irows, { type: "concept", name: "i", participants: [{ type: "concept", name: "Tmp" }] }) === true, "B14 удалённый родитель: без дерева файла — не мета ни в каталоге, ни на странице; с узлом файла — мета в обоих");

  // B15 копия синтеза несёт file_genealogy и строки с позициями (POST /:id/duplicate через app.request)
  const { Hono } = await import("hono");
  const app = new Hono();
  app.route("/syntheses", RS.synthesesRoutes);
  const token = "s151-" + TAG + "-" + Date.now(); // в БД — SHA-256(token) в hex (middleware/auth.ts)
  await sql`insert into sessions (id, user_id, expires_at) values (${createHash("sha256").update(token).digest("hex")}, ${owner}, now() + interval '1 hour')`;
  const dupRes = await app.request(`/syntheses/${C}/duplicate`, { method: "POST", headers: { cookie: `philosynth_session=${token}` } });
  const dupJson = await dupRes.json();
  if (dupRes.status !== 201) { ok(false, "B15 копия: POST /duplicate", { status: dupRes.status, dupJson }); throw new Error("duplicate failed"); }
  const [copy] = await sql`select file_genealogy from syntheses where id=${dupJson.id}`;
  const copyRows = await rowsOf(dupJson.id);
  ok(dupRes.status === 201 && copy.file_genealogy?.participants?.length === 3 && copy.file_genealogy.participants[0].name === fileTree.participants[0].name && copy.file_genealogy.participants[2].unnamed === true && copyRows.length === 2 && copyRows[0].parent_name === "Кант" && copyRows[0].position === 1 && copyRows[1].parent_synthesis_id === P2 && copyRows[1].position === 3
    && (await RS.loadConceptParentFlags([dupJson.id])).has(dupJson.id), "B15 копия: file_genealogy перенесён, строки с теми же позициями, бейдж «мета»", { status: dupRes.status, copyRows, fg: copy.file_genealogy, meta: (await RS.loadConceptParentFlags([dupJson.id])).has(dupJson.id) });
  const ancCopy = await LS.getAncestors(dupJson.id, 3);
  ok(ancCopy.children.filter((n) => n.fromFile).length === 2 && ancCopy.children.find((n) => n.synthesisId === P2)?.coversFileNode === undefined, "B16 у копии узлы файла на месте (0 и 2 — снимки), связь 3 — без узла файла");

  // B17 импорт: повтор UUID родителя в participants файла — вторая строка не пишется, узел снимком
  const IS = await import("../server/services/import-service.ts");
  const src = readFileSync(ROOT + "server/services/import-service.ts", "utf8");
  ok(/const repeated = !!sid && lineageRows\.some\(\(r\) => r\.parentSynthesisId === sid\);/.test(src) && /server\.importService\.parentRepeated/.test(src) && typeof IS.titleToKey === "function", "B17 import-service: повтор UUID в participants не даёт второй строки (иначе 23505 уронил бы импорт)");
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
