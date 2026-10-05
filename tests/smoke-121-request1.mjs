/**
 * Смоук беседы 12.1 (запрос 1) — правка документа и импорт: долги Д-1, Д-3,
 * Д-4, Д-5, Д-8, Д-14, Д-31. Часть A — без БД (чистые функции); часть B —
 * живая БД (свои строки, чужого не трогаем); часть C — живой файл концепции
 * (T121_FILE; без файла — пропуск).
 *  A. Д-1: thesisLabelOf, parseThesesFromHTML (метка ≠ номер → label, целая
 *     нумерация → null), renderThesesTable (label ?? thesisNum), круг
 *     parse(render) сохраняет и метку, и номер, thesisLabelsByNum (страховка
 *     по числу строк). Д-3: parseThesisParagraphs, planThesisProseSync (все
 *     правила: обоснование, формулировка по месту, нечёткое совпадение,
 *     нетронутый абзац при разошедшейся БД, пропавший, новый, несведённый).
 *     Д-8: splitHeaderParticipants, extractMetadata (футер и подзаголовок обеих
 *     линий файлов, «свободный синтез» — не философ), importParticipants,
 *     validateImportMeta (критично только без участников И без зерна),
 *     reconstructGenealogy (концепции шапки — узлы-концепции).
 *  B. Д-1: метка в колонке после разбора, правка тезиса не стирает метки из
 *     таблицы, сторож сводит «Э-2» по колонке, откат версии тезиса метку
 *     сохраняет, копия (POST duplicate) метку несёт, дозаливка у строк без
 *     метки (концепция до миграции 0011), документ с целой нумерацией — как
 *     прежде, контекст theses:summary называет тезисы метками. Д-3: правка
 *     подраздела theses → theses.justification, версия 'manual', затем правка
 *     редактором не возвращает старый текст; формулировка → таблица. Д-4:
 *     название из name — обновлено / после переименования не тронуто. Д-14:
 *     откат капсулы со строкой sections и БЕЗ неё (импорт) возвращает
 *     syntheses.capsule_html, признак в ответе. Д-5: GET sum/context → 200.
 *     Д-31: parseWarnings — владельцу и при действенном show_logs.
 *     Д-8: экспорт свободного синтеза → импорт без критичных предупреждений.
 *  C. живой файл: импорт — метки «О-1»… в колонке, критичных нет; правка
 *     тезиса «Э-2» — буквенные метки в таблице на месте; вариант файла «как у
 *     одностраничника» (концепция в ёлочках в футере и params.phil, без
 *     genealogy) — концепция не философ, а предложение родителя.
 * Запуск: T121_FILE=… node_modules/.bin/tsx tests/smoke-121-request1.mjs
 */
import { existsSync, readFileSync } from "node:fs";

let ok = 0, bad = 0;
const t = (name, cond, extra = "") => { if (cond) { ok++; console.log(`  ✓ ${name}`); } else { bad++; console.log(`  ✗ ${name} ${extra}`); } };
const J = (v) => JSON.stringify(v);

const parser = await import("../server/services/element-parser.ts");
const renderer = await import("../server/services/element-renderer.ts");
const editor = await import("../server/services/element-editor.ts");
const imp = await import("../server/services/import-service.ts");
const hp = await import("../server/utils/html-parser.ts");

const tbl = (h, rows) => `<table class="doc-table"><thead><tr>${h.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const sub = (n, b) => `<div data-section="${n}"><h4>${n}</h4>${b}</div>`;
const wrap = (title, b) => `<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">${title}</div><div class="doc-content">${b}</div></div>`;
const TH = ["№", "Формулировка тезиса", "Тип", "Степень новизны", "Связанные категории"];
const thesesHtml = (labels) => wrap("Корпус тезисов",
  sub("Онтологические тезисы",
    "<p><strong>Бытие есть событие различия</strong> Потому что различие первично относительно тождества (§ Граф).</p>" +
    "<p><strong>Ничто не предшествует бытию</strong> Обоснование второго тезиса.</p>") +
  sub("Эпистемологические тезисы",
    "<p><strong>Познание есть участие в событии</strong> Обоснование третьего тезиса, со <strong>вставкой</strong> внутри.</p>") +
  sub("Сводная таблица тезисов", tbl(TH, [
    [labels[0], "Бытие есть событие различия", "Онтологический", "высокая", "Бытие, Различие"],
    [labels[1], "Ничто не предшествует бытию", "Онтологический", "средняя", "Ничто"],
    [labels[2], "Познание есть участие в событии", "Эпистемологический", "высокая", "Познание"],
  ])));

console.log("A. чистые функции");
{
  // ── Д-1
  t("thesisLabelOf: «О-1» при номере 1 → метка", parser.thesisLabelOf("О-1", 1) === "О-1");
  t("thesisLabelOf: «3» при номере 3 → null (метка = номер)", parser.thesisLabelOf(" 3 ", 3) === null);
  t("thesisLabelOf: пустая ячейка → null", parser.thesisLabelOf("", 2) === null);
  t("thesisLabelOf: «2.» ≠ «2» → метка как в документе", parser.thesisLabelOf("2.", 2) === "2.");
  const lettered = parser.parseThesesFromHTML(thesesHtml(["О-1", "О-2", "Э-1"]));
  t("разбор буквенных меток: номера порядковые, метки сохранены", J(lettered.map((x) => [x.thesisNum, x.label])) === J([[1, "О-1"], [2, "О-2"], [3, "Э-1"]]), J(lettered.map((x) => [x.thesisNum, x.label])));
  const plain = parser.parseThesesFromHTML(thesesHtml(["1", "2", "3"]));
  t("разбор целой нумерации: label null у всех", plain.every((x) => x.label === null) && J(plain.map((x) => x.thesisNum)) === J([1, 2, 3]));
  const asRow = (x, i) => ({ id: `t${i}`, synthesisId: "s", thesisNum: x.thesisNum, label: x.label ?? null, formulation: x.formulation, justification: x.justification, thesisType: x.thesisType, noveltyDegree: x.noveltyDegree, relatedCategories: x.relatedCategories, source: "generated", createdAt: new Date(), updatedAt: new Date() });
  const rendered = renderer.renderThesesTable(lettered.map(asRow));
  t("рендерер рисует метку, а не номер", rendered.includes("<td>О-1</td>") && rendered.includes("<td>Э-1</td>") && !/<td>1<\/td>/.test(rendered), rendered.slice(0, 200));
  t("рендерер без метки рисует номер, как прежде", /<td>2<\/td>/.test(renderer.renderThesesTable(plain.map(asRow))));
  const round = parser.parseThesesFromHTML(wrap("T", sub("Сводная таблица тезисов", rendered)));
  t("круг parse(render(x)): метки и номера те же", J(round.map((x) => [x.thesisNum, x.label, x.formulation])) === J(lettered.map((x) => [x.thesisNum, x.label, x.formulation])));
  const byNum = renderer.thesisLabelsByNum(thesesHtml(["О-1", "О-2", "Э-1"]), 3);
  t("thesisLabelsByNum: номер → метка", byNum.get(1) === "О-1" && byNum.get(3) === "Э-1" && byNum.size === 3);
  t("thesisLabelsByNum: число строк не совпало → пусто (таблица и БД разошлись)", renderer.thesisLabelsByNum(thesesHtml(["О-1", "О-2", "Э-1"]), 4).size === 0);
  t("thesisLabelsByNum: целая нумерация → меток нет", renderer.thesisLabelsByNum(thesesHtml(["1", "2", "3"]), 3).size === 0);

  // ── Д-3
  const paras = parser.parseThesisParagraphs(
    "<p><strong>Бытие есть событие различия</strong> Потому что так.</p>" +
    "<p>Вводный текст с <strong>выделением посреди абзаца</strong> — не тезис.</p>" +
    "<p><strong>Познание есть участие</strong> Обоснование со <strong>вставкой длиннее восьми</strong>.</p>" +
    "<p><strong>Коротко</strong> слишком короткая формулировка.</p>" +
    tbl(["a"], [["<strong>Жирное в таблице не тезис</strong> хвост"]]));
  t("parseThesisParagraphs: только блоки, начинающиеся с жирной формулировки", J(paras.map((p) => p.formulation)) === J(["Бытие есть событие различия", "Познание есть участие"]), J(paras));
  t("parseThesisParagraphs: обоснование — остаток блока", paras[0]?.justification === "Потому что так." && paras[1]?.justification === "Обоснование со вставкой длиннее восьми.");
  const row = (id, num, label, formulation, justification) => ({ id, thesisNum: num, label, formulation, justification });
  const rows = [row("a", 1, "О-1", "Бытие есть событие различия", "Старое обоснование."), row("b", 2, "О-2", "Ничто не предшествует бытию", "Обоснование второго."), row("c", 3, null, "Познание есть участие в событии", "Третье.")];
  const P = (f, j) => ({ formulation: f, justification: j });
  const before = [P("Бытие есть событие различия", "Старое обоснование."), P("Ничто не предшествует бытию", "Обоснование второго.")];
  let plan = editor.planThesisProseSync(rows, before, [P("Бытие есть событие различия", "Новое обоснование."), before[1]]);
  t("обоснование изменено → обновляется только оно, у своего тезиса", plan.updates.length === 1 && plan.updates[0].row.id === "a" && plan.updates[0].justification === "Новое обоснование." && plan.updates[0].formulation === undefined && plan.warnings.length === 0, J(plan));
  plan = editor.planThesisProseSync(rows, before, [P("Бытие есть событие различия и повторения", "Старое обоснование."), before[1]]);
  t("формулировка изменена (точное совпадение до правки) → сведена по месту, обновлена", plan.updates.length === 1 && plan.updates[0].formulation === "Бытие есть событие различия и повторения" && plan.updates[0].justification === undefined && plan.warnings.length === 0, J(plan));
  plan = editor.planThesisProseSync(rows, [P("Тезис О-1. Бытие есть событие различия", "Старое обоснование."), before[1]], [P("Тезис О-1. Бытие есть событие", "Новое."), before[1]]);
  t("нечёткое совпадение + смена формулировки → предупреждение, обоснование перенесено", plan.updates.length === 1 && plan.updates[0].formulation === undefined && plan.updates[0].justification === "Новое." && plan.warnings.length === 1 && /О-1/.test(plan.warnings[0]) && /нечётко/.test(plan.warnings[0]), J(plan));
  plan = editor.planThesisProseSync([row("a", 1, "О-1", "Бытие есть событие различия", "Правка редактора, не отражённая в прозе."), rows[1]], before, [before[0], P("Ничто не предшествует бытию", "Обоснование второго, исправленное.")]);
  t("нетронутый абзац при разошедшейся БД НЕ сверяется (правка редактора не затёрта старой прозой)", plan.updates.length === 1 && plan.updates[0].row.id === "b", J(plan));
  plan = editor.planThesisProseSync(rows, before, [before[1]]);
  t("абзац тезиса пропал → предупреждение, тезис не удалён и не изменён", plan.updates.length === 0 && plan.warnings.length === 1 && /О-1/.test(plan.warnings[0]) && /не найден/.test(plan.warnings[0]), J(plan));
  plan = editor.planThesisProseSync(rows, before, [...before, P("Совсем новый тезис человека", "Его обоснование.")]);
  t("новый абзац → предупреждение, строка theses не заводится", plan.updates.length === 0 && plan.warnings.length === 1 && /Совсем новый тезис/.test(plan.warnings[0]) && /не попал/.test(plan.warnings[0]), J(plan));
  plan = editor.planThesisProseSync(rows, [P("Обоснование. отдельным абзацем", "Текст."), ...before], [P("Обоснование. отдельным абзацем", "Текст исправлен."), ...before]);
  t("изменён абзац без тезиса → предупреждение «не сведён»", plan.updates.length === 0 && plan.warnings.length === 1 && /не сведён/.test(plan.warnings[0]), J(plan));
  plan = editor.planThesisProseSync(rows, before, before);
  t("правка вне абзацев тезисов → ни обновлений, ни предупреждений", plan.updates.length === 0 && plan.warnings.length === 0);
  plan = editor.planThesisProseSync(rows, [P("Познание есть участие в событии", "Третье.")], [P("Познание есть участие в событии", "Третье, уточнённое.")]);
  t("тезис без метки называется номером", plan.updates.length === 1 && plan.updates[0].row.id === "c");

  // ── Д-8
  const sp = imp.splitHeaderParticipants;
  t("футер одностраничника: концепция в ёлочках — не философ", J(sp("Юнг, «Грамматика самоотрицания»")) === J({ phil: ["Юнг"], concepts: ["Грамматика самоотрицания"] }), J(sp("Юнг, «Грамматика самоотрицания»")));
  t("подзаголовок «философы + концепции»: не один элемент", J(sp("Кант, Гегель + «Бытие, время и ничто», «Г»")) === J({ phil: ["Кант", "Гегель"], concepts: ["Бытие, время и ничто", "Г"] }), J(sp("Кант, Гегель + «Бытие, время и ничто», «Г»")));
  t("подзаголовок экспорта службы (без ёлочек): правее плюса — концепции", J(sp("Юнг + Грамматика самоотрицания")) === J({ phil: ["Юнг"], concepts: ["Грамматика самоотрицания"] }));
  t("обычный список философов — как прежде", J(sp("Кант, Гегель")) === J({ phil: ["Кант", "Гегель"], concepts: [] }));
  const docOf = (subtitle, footer, seed = "Зерно") => hp.parseDocument(
    `<html><body><div id="docOutput"><div class="doc-header"><div class="doc-title">Т</div><div class="doc-subtitle" id="docSubtitle">${subtitle}</div>` +
    (seed ? `<details class="header-disclosure"><summary>Зерно концепции</summary><div class="disclosure-body">${seed}</div></details>` : "") +
    `</div><div class="doc-footer">Философы: <span id="footerPhil">${footer}</span></div></div></body></html>`);
  let meta = imp.extractMetadata(docOf("Свободный синтез (на основе зерна)", "свободный синтез"));
  t("свободный синтез одностраничника: «свободный синтез» — не философ", meta.phil.length === 0 && meta.concepts.length === 0 && meta.freeSynthesis === true, J(meta));
  t("… и не критичен (зерно есть)", imp.validateImportMeta(meta, { params: { seed: "Зерно" } }).every((w) => !w.critical));
  meta = imp.extractMetadata(docOf("Свободный синтез (на основе зерна)", "—"));
  t("свободный синтез экспорта службы (футер «—»): не критичен", meta.phil.length === 0 && meta.freeSynthesis && imp.validateImportMeta(meta, null).every((w) => !w.critical), J(imp.validateImportMeta(meta, null)));
  meta = imp.extractMetadata(docOf("", "—", ""));
  t("ни участников, ни зерна → критично (перегенерация невозможна)", imp.validateImportMeta(meta, null).some((w) => w.critical && w.field === "phil"));
  meta = imp.extractMetadata(docOf("На основе: Юнг + «Грамматика самоотрицания»", "Юнг, «Грамматика самоотрицания»"));
  t("мета-синтез одностраничника: философ один, концепция одна", J(meta.phil) === J(["Юнг"]) && J(meta.concepts) === J(["Грамматика самоотрицания"]), J(meta));
  meta = imp.extractMetadata(docOf("На основе: Грамматика самоотрицания, Онтология паузы", "—", ""));
  const stateConcepts = { params: { phil: ["«Грамматика самоотрицания»", "«Онтология паузы»"], seed: "" }, genealogy: { type: "concept", name: "Т", participants: [{ type: "concept", name: "Грамматика самоотрицания" }, { type: "synthesis", name: "Онтология паузы" }] } };
  const who = imp.importParticipants(meta, stateConcepts);
  t("params.phil в ёлочках, совпавшие с концепциями genealogy, — не философы", who.philosophers.length === 0 && J(who.concepts) === J(["Грамматика самоотрицания", "Онтология паузы"]), J(who));
  t("мета-синтез из одних концепций без зерна — не критичен", imp.validateImportMeta(meta, stateConcepts).every((w) => !w.critical));
  t("ёлочки в params.phil БЕЗ совпадения с концепцией остаются философом (по букве запроса)", J(imp.importParticipants(imp.extractMetadata(docOf("", "—")), { params: { phil: ["Кант", "«Неизвестная»"] } }).philosophers) === J(["Кант", "«Неизвестная»"]));
  meta = imp.extractMetadata(docOf("На основе: Юнг + «Грамматика самоотрицания»", "Юнг, «Грамматика самоотрицания»"));
  const gen = imp.reconstructGenealogy(meta, null, docOf("", ""));
  t("запасная генеалогия (нет встроенного состояния): концепция — узел-концепция, не философ", J(gen.participants.map((p) => [p.type, p.name])) === J([["philosopher", "Юнг"], ["concept", "Грамматика самоотрицания"]]), J(gen.participants));
}

// ── Часть B: живая БД ──────────────────────────────────────────────────
let dbUp = false;
let db, schema, eq, and, asc;
try {
  ({ db, schema } = await import("../server/db/index.ts"));
  ({ eq, and, asc } = await import("drizzle-orm"));
  await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  dbUp = true;
} catch (e) {
  console.log("B. БД недоступна — пропуск:", e?.cause?.code ?? e?.message);
}

if (dbUp) {
  console.log("B. живая БД");
  const ver = await import("../server/services/element-versioning.ts");
  const recs = await import("../server/services/recommendations.ts");
  const cx = await import("../server/services/context-extractor.ts");
  const auth = await import("../server/middleware/auth.ts");
  const exp = await import("../server/services/export/html-exporter.ts");
  const { Hono } = await import("hono");
  const { sectionsRoutes } = await import("../server/routes/sections.ts");
  const { synthesesRoutes } = await import("../server/routes/syntheses.ts");
  const { elementsRoutes } = await import("../server/routes/elements.ts");
  const { env } = await import("../server/env.ts");
  const app = new Hono();
  app.route("/api/v1/syntheses", synthesesRoutes);
  app.route("/api/v1/syntheses", sectionsRoutes);
  app.route("/api/v1/syntheses", elementsRoutes);

  const tag = "sm121-" + Math.random().toString(36).slice(2, 8);
  const [owner] = await db.insert(schema.users).values({ email: `${tag}-o@sm.local`, passwordHash: "x" }).returning();
  const [other] = await db.insert(schema.users).values({ email: `${tag}-x@sm.local`, passwordHash: "x" }).returning();
  const tokO = (await auth.createSession(owner.id)).token;
  const tokX = (await auth.createSession(other.id)).token;
  const call = async (tok, method, path, body) => {
    const res = await app.request(`/api/v1/syntheses${path}`, {
      method,
      headers: { Cookie: `${env.session.cookieName}=${tok}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, json };
  };
  const ids = [];
  const mkSynth = async (o = {}) => {
    const [s] = await db.insert(schema.syntheses).values({ userId: owner.id, seed: tag, title: tag, status: "ready", sectionOrder: ["sum", "theses", "name"], ...o }).returning();
    ids.push(s.id);
    return s;
  };
  const secRow = async (sid, key) => (await db.select().from(schema.sections).where(and(eq(schema.sections.synthesisId, sid), eq(schema.sections.key, key))))[0];
  const thesesOf = (sid) => db.select().from(schema.theses).where(eq(schema.theses.synthesisId, sid)).orderBy(asc(schema.theses.thesisNum));
  const tableOf = (html) => /data-section="Сводная таблица тезисов"[\s\S]*$/.exec(html)?.[0] ?? "";
  const seedTheses = async (sid, labels) => {
    const html = thesesHtml(labels);
    await db.insert(schema.sections).values({ synthesisId: sid, key: "theses", sectionNum: 2, title: "Корпус тезисов", htmlContent: html });
    await parser.saveElementsToDb(sid, "theses", { theses: parser.parseThesesFromHTML(html) });
    return html;
  };

  try {
    // ── Д-1: метки
    const s1 = await mkSynth();
    await seedTheses(s1.id, ["О-1", "О-2", "Э-1"]);
    let th = await thesesOf(s1.id);
    t("Д-1: разбор 1.4 пишет метку в колонку theses.label", J(th.map((x) => [x.thesisNum, x.label])) === J([[1, "О-1"], [2, "О-2"], [3, "Э-1"]]), J(th.map((x) => [x.thesisNum, x.label])));
    const upd = await editor.updateThesis(s1.id, th[2].id, { noveltyDegree: "очень высокая" });
    let html = (await secRow(s1.id, "theses")).htmlContent;
    t("Д-1: после правки тезиса сводная таблица хранит буквенные метки", /<td>О-1<\/td>/.test(tableOf(html)) && /<td>О-2<\/td>/.test(tableOf(html)) && /<td>Э-1<\/td>/.test(tableOf(html)) && /очень высокая/.test(tableOf(html)), tableOf(html).slice(0, 400));
    t("Д-1: DTO тезиса несёт label", upd.thesis.label === "Э-1");
    // таблица «потеряна»: метки в HTML стёрты руками — сторож обязан свести по колонке
    await db.update(schema.sections).set({ htmlContent: html.replace(/<td>(О-1|О-2|Э-1)<\/td>/g, (_m, l) => `<td>${{ "О-1": 1, "О-2": 2, "Э-1": 3 }[l]}</td>`) }).where(eq(schema.sections.id, (await secRow(s1.id, "theses")).id));
    const doc = await recs.loadDocumentIndex(s1.id);
    t("Д-1: сторож сводит «Э-1» с тезисом ПО КОЛОНКЕ (в таблице HTML метки уже нет)", doc.theses.find((x) => x.id === th[2].id)?.labels.includes("Э-1") && doc.theses.find((x) => x.id === th[2].id)?.labels.includes("3"), J(doc.theses.map((x) => x.labels)));
    const guarded = recs.guardRows([{ position: 1, num: "1", address: "Сводная таблица тезисов", element: "Э-1", op: "уточнить формулировку", replacement: "", rationale: "x", severity: "существенная" }], doc);
    t("Д-1: рекомендация к «Э-1» находит элемент (не 'invalid' из-за метки)", guarded[0]?.elementKind === "thesis" && guarded[0]?.elementId === th[2].id, J(guarded[0]));
    // откат версии тезиса метку сохраняет
    const rb = await editor.rollbackElement(s1.id, "thesis", th[2].id, 1);
    th = await thesesOf(s1.id);
    t("Д-1: откат версии тезиса сохраняет метку (RESTORE_FIELDS), значение возвращено", th[2].label === "Э-1" && th[2].noveltyDegree === "высокая" && rb.capsuleUpdated === false, J([th[2].label, th[2].noveltyDegree]));
    await db.update(schema.theses).set({ label: null }).where(eq(schema.theses.id, th[2].id));
    await ver.restoreElementData(s1.id, "thesis", th[2].id, { thesisNum: 3, label: "Э-1", formulation: th[2].formulation });
    t("Д-1: снимок с меткой возвращает её в строку", (await thesesOf(s1.id))[2].label === "Э-1");
    await ver.restoreElementData(s1.id, "thesis", th[2].id, { thesisNum: 3, formulation: th[2].formulation });
    t("Д-1: снимок БЕЗ ключа label (до миграции 0011) метку не стирает", (await thesesOf(s1.id))[2].label === "Э-1");
    html = (await secRow(s1.id, "theses")).htmlContent;
    t("Д-1: перерисовка при откате вернула метки в таблицу", /<td>Э-1<\/td>/.test(tableOf(html)), tableOf(html).slice(0, 300));
    const frag = await cx.extractContextFragment("theses:summary", cx.createDbContextSource(s1.id));
    t("Д-1: контекст theses:summary называет тезисы метками документа", !!frag && /О-1 \| /.test(frag) && /Э-1 \| /.test(frag), String(frag).slice(0, 200));
    const dup = await call(tokO, "POST", `/${s1.id}/duplicate`);
    if (dup.json?.id) ids.push(dup.json.id);
    t("Д-1: копия концепции несёт метки тезисов", dup.status === 201 && J((await thesesOf(dup.json.id)).map((x) => x.label)) === J(["О-1", "О-2", "Э-1"]), J(dup));

    // концепция «до миграции 0011»: метки только в HTML
    const s2 = await mkSynth();
    await seedTheses(s2.id, ["О-1", "О-2", "Э-1"]);
    await db.update(schema.theses).set({ label: null }).where(eq(schema.theses.synthesisId, s2.id));
    th = await thesesOf(s2.id);
    await editor.updateThesis(s2.id, th[1].id, { formulation: "Ничто не предшествует бытию и не следует за ним" });
    html = (await secRow(s2.id, "theses")).htmlContent;
    th = await thesesOf(s2.id);
    t("Д-1: дозаливка — у концепции без меток в БД правка тезиса НЕ стирает «О-1»/«Э-1»", /<td>О-1<\/td>/.test(tableOf(html)) && /<td>О-2<\/td>/.test(tableOf(html)) && /<td>Э-1<\/td>/.test(tableOf(html)) && /не следует за ним/.test(tableOf(html)), tableOf(html).slice(0, 400));
    t("Д-1: дозаливка записала метки в колонку", J(th.map((x) => x.label)) === J(["О-1", "О-2", "Э-1"]), J(th.map((x) => x.label)));

    // документ с целой нумерацией — как прежде
    const s3 = await mkSynth();
    await seedTheses(s3.id, ["1", "2", "3"]);
    th = await thesesOf(s3.id);
    await editor.updateThesis(s3.id, th[0].id, { noveltyDegree: "низкая" });
    html = (await secRow(s3.id, "theses")).htmlContent;
    t("Д-1: документ службы с целой нумерацией — label NULL, в таблице числа", (await thesesOf(s3.id)).every((x) => x.label === null) && /<td>1<\/td>/.test(tableOf(html)) && /<td>3<\/td>/.test(tableOf(html)));

    // ── Д-3: проза тезиса
    const s4 = await mkSynth();
    await seedTheses(s4.id, ["О-1", "О-2", "Э-1"]);
    th = await thesesOf(s4.id);
    t("Д-3: исходное обоснование разобрано из прозы", th[0].justification.startsWith("Потому что различие первично"));
    let src = await editor.getSubsectionSource(s4.id, "theses", "Онтологические тезисы");
    let r = await editor.updateSubsection(s4.id, "theses", "Онтологические тезисы", src.html.replace("Потому что различие первично относительно тождества (§ Граф).", "Потому что различие ПЕРВИЧНО, а тождество производно (ручная правка)."));
    th = await thesesOf(s4.id);
    t("Д-3: правка подраздела обновила theses.justification своего тезиса", th[0].justification === "Потому что различие ПЕРВИЧНО, а тождество производно (ручная правка)." && th[1].justification === "Обоснование второго тезиса.", J(th.map((x) => x.justification)));
    t("Д-3: ответ называет обновлённый тезис и поле", r.changed && r.thesesUpdated.length === 1 && r.thesesUpdated[0].id === th[0].id && r.thesesUpdated[0].label === "О-1" && J(r.thesesUpdated[0].fields) === J(["justification"]) && r.warnings.length === 0, J([r.thesesUpdated, r.warnings]));
    let hist = await ver.getVersionHistory(s4.id, "thesis", th[0].id);
    t("Д-3: версия тезиса 'manual' со снимком ДО", hist.length === 1 && hist[0].changeSource === "manual" && hist[0].data.justification.startsWith("Потому что различие первично относительно"), J(hist.map((h) => h.changeSource)));
    t("Д-3: строки тезисов НЕ заменены (id прежние — версии и обогащения не осиротели)", J((await thesesOf(s4.id)).map((x) => x.id)) === J(th.map((x) => x.id)));
    await editor.updateThesis(s4.id, th[0].id, { formulation: "Бытие есть событие различия (редактор)" });
    html = (await secRow(s4.id, "theses")).htmlContent;
    t("Д-3: следующая правка тезиса редактором НЕ возвращает старое обоснование в прозу", html.includes("ПЕРВИЧНО, а тождество производно (ручная правка).") && !html.includes("первично относительно тождества") && html.includes("<strong>Бытие есть событие различия (редактор)</strong>"), html.slice(0, 600));
    // формулировка в прозе → строка и сводная таблица
    src = await editor.getSubsectionSource(s4.id, "theses", "Онтологические тезисы");
    r = await editor.updateSubsection(s4.id, "theses", "Онтологические тезисы", src.html.replace("Ничто не предшествует бытию", "Ничто не предшествует бытию, но сопровождает его"));
    th = await thesesOf(s4.id);
    t("Д-3: правка формулировки в прозе обновила theses.formulation", th[1].formulation === "Ничто не предшествует бытию, но сопровождает его" && J(r.thesesUpdated.map((u) => u.fields)) === J([["formulation"]]), J([th[1].formulation, r.thesesUpdated]));
    t("Д-3: … и сводную таблицу (ответ несёт HTML после перерисовки), метки на месте", /сопровождает его/.test(tableOf(r.htmlContent)) && /<td>О-2<\/td>/.test(tableOf(r.htmlContent)) && r.htmlContent === (await secRow(s4.id, "theses")).htmlContent);
    // новый абзац и пропавший
    src = await editor.getSubsectionSource(s4.id, "theses", "Эпистемологические тезисы");
    r = await editor.updateSubsection(s4.id, "theses", "Эпистемологические тезисы", src.html + "\n<p><strong>Новый тезис, дописанный рукой</strong> Его обоснование.</p>");
    t("Д-3: новый абзац — предупреждение в ответе, строк theses по-прежнему три", r.warnings.some((w) => /Новый тезис, дописанный рукой/.test(w)) && (await thesesOf(s4.id)).length === 3 && r.thesesUpdated.length === 0, J(r.warnings));
    src = await editor.getSubsectionSource(s4.id, "theses", "Эпистемологические тезисы");
    r = await editor.updateSubsection(s4.id, "theses", "Эпистемологические тезисы", "<p>Подраздел переписан сплошной прозой без жирных формулировок.</p>");
    t("Д-3: абзац тезиса пропал — предупреждение, тезис не удалён", r.warnings.some((w) => /Э-1/.test(w) && /не найден/.test(w)) && (await thesesOf(s4.id)).length === 3, J(r.warnings));

    // ── Д-4: название из раздела name
    const nameHtml = (title) => wrap("Анализ названия", sub("Варианты названия", "<p><strong>Первый вариант</strong> — черновой.</p>") + sub("Итоговая рекомендация", `<p><strong>Итоговая рекомендация: ${title}: подзаголовок</strong> Довод.</p>`));
    const s5 = await mkSynth({ title: "Онтология паузы" });
    await db.insert(schema.sections).values({ synthesisId: s5.id, key: "name", sectionNum: 3, title: "Анализ названия", htmlContent: nameHtml("Онтология паузы") });
    src = await editor.getSubsectionSource(s5.id, "name", "Итоговая рекомендация");
    r = await editor.updateSubsection(s5.id, "name", "Итоговая рекомендация", src.html.replace("Онтология паузы", "Онтология промедления"));
    let syn = (await db.select().from(schema.syntheses).where(eq(schema.syntheses.id, s5.id)))[0];
    t("Д-4: правка раздела name обновила название концепции", syn.title === "Онтология промедления" && r.titleUpdated === "Онтология промедления", J([syn.title, r.titleUpdated, r.warnings]));
    await db.update(schema.syntheses).set({ title: "Моё название" }).where(eq(schema.syntheses.id, s5.id)); // ✎ 8.4
    src = await editor.getSubsectionSource(s5.id, "name", "Итоговая рекомендация");
    r = await editor.updateSubsection(s5.id, "name", "Итоговая рекомендация", src.html.replace("Онтология промедления", "Онтология задержки"));
    syn = (await db.select().from(schema.syntheses).where(eq(schema.syntheses.id, s5.id)))[0];
    t("Д-4: после отдельного переименования название НЕ тронуто, человеку сказано", syn.title === "Моё название" && r.titleUpdated === undefined && r.warnings.some((w) => /Онтология задержки/.test(w) && /Моё название/.test(w)), J([syn.title, r.warnings]));
    src = await editor.getSubsectionSource(s5.id, "name", "Варианты названия");
    r = await editor.updateSubsection(s5.id, "name", "Варианты названия", src.html.replace("черновой", "отвергнутый"));
    t("Д-4: правка, не меняющая итоговое название, — без обновления и без предупреждений", r.titleUpdated === undefined && r.warnings.length === 0, J(r.warnings));
    const viaRoute = await call(tokO, "PATCH", `/${s5.id}/sections/name/subsections/${encodeURIComponent("Итоговая рекомендация")}`, { html: (await editor.getSubsectionSource(s5.id, "name", "Итоговая рекомендация")).html.replace("Онтология задержки", "Моё название") });
    t("Д-4: роут отдаёт warnings; titleUpdated нет, когда название и так совпало", viaRoute.status === 200 && viaRoute.json.changed === true && viaRoute.json.titleUpdated === undefined && viaRoute.json.warnings.length === 0, J(viaRoute.json).slice(0, 300));

    // ── Д-14: откат капсулы
    const cap = (text) => `<div class="doc-section"><div class="doc-content"><div data-section="Капсула"><p>${text}</p></div></div></div>`;
    const s6 = await mkSynth({ capsuleHtml: cap("Исходная капсула"), sectionOrder: ["sum", "capsule"] });
    await db.insert(schema.sections).values({ synthesisId: s6.id, key: "capsule", sectionNum: 2, title: "Капсула концепции", htmlContent: cap("Исходная капсула") });
    await editor.updateCapsule(s6.id, cap("Правленая капсула"));
    const capRow = await secRow(s6.id, "capsule");
    let back = await call(tokO, "POST", `/${s6.id}/elements/section/${capRow.id}/rollback`, { version: 1 });
    syn = (await db.select().from(schema.syntheses).where(eq(schema.syntheses.id, s6.id)))[0];
    t("Д-14: откат версии капсулы (строка sections есть) вернул syntheses.capsule_html", back.status === 200 && syn.capsuleHtml === cap("Исходная капсула") && (await secRow(s6.id, "capsule")).htmlContent === cap("Исходная капсула"), J([back.status, syn.capsuleHtml.slice(0, 80)]));
    t("Д-14: ответ отката несёт признак и новое значение", back.json?.capsuleUpdated === true && back.json?.capsuleHtml === cap("Исходная капсула"), J(back.json).slice(0, 200));
    const s7 = await mkSynth({ capsuleHtml: cap("Капсула импорта"), sectionOrder: ["sum", "capsule"] }); // после импорта строки sections 'capsule' нет
    const v7 = await editor.updateCapsule(s7.id, cap("Капсула импорта, правка"));
    t("Д-14: версия капсулы без строки sections пишется на id синтеза", v7.version.elementId === s7.id);
    back = await call(tokO, "POST", `/${s7.id}/elements/section/${s7.id}/rollback`, { version: 1 });
    syn = (await db.select().from(schema.syntheses).where(eq(schema.syntheses.id, s7.id)))[0];
    t("Д-14: откат капсулы импортированной концепции работает (было 404 «Элемент не найден»)", back.status === 200 && syn.capsuleHtml === cap("Капсула импорта") && back.json?.capsuleUpdated === true, J([back.status, back.json?.error ?? "", syn.capsuleHtml.slice(60, 120)]));
    hist = await ver.getVersionHistory(s7.id, "section", s7.id);
    t("Д-14: откат записал версию 'rollback' со снимком ДО — откат отката возможен", hist.length === 2 && hist[0].changeSource === "rollback" && hist[0].data.htmlContent === cap("Капсула импорта, правка"), J(hist.map((h) => [h.version, h.changeSource])));
    back = await call(tokO, "POST", `/${s7.id}/elements/section/${s7.id}/rollback`, { version: 2 });
    syn = (await db.select().from(schema.syntheses).where(eq(schema.syntheses.id, s7.id)))[0];
    t("Д-14: откат отката возвращает правку", back.status === 200 && syn.capsuleHtml === cap("Капсула импорта, правка"));
    const th4 = (await secRow(s4.id, "theses"));
    back = await call(tokO, "POST", `/${s4.id}/elements/section/${th4.id}/rollback`, { version: 1 });
    t("Д-14: откат версии обычного раздела — признак false, капсула не тронута", back.status === 200 && back.json?.capsuleUpdated === false && back.json?.capsuleHtml === undefined, J(back.json).slice(0, 160));

    // ── Д-5: sum/context
    const s8 = await mkSynth({ sectionOrder: ["sum", "theses"] });
    await db.insert(schema.sections).values({ synthesisId: s8.id, key: "sum", sectionNum: 1, title: "Резюме", htmlContent: wrap("Исполнительное резюме", sub("Цели и метод", "<p>Цель.</p>")) });
    await seedTheses(s8.id, ["1", "2", "3"]);
    const ctxSum = await call(tokO, "GET", `/${s8.id}/sections/sum/context`);
    t("Д-5: GET …/sections/sum/context → 200 (было 404)", ctxSum.status === 200 && typeof ctxSum.json?.contextText === "string" && Array.isArray(ctxSum.json?.entries), J(ctxSum).slice(0, 200));
    console.log(`    · sum/context: budget=${ctxSum.json?.budget}, req ${ctxSum.json?.reqFound}/${ctxSum.json?.reqTotal}, opt ${ctxSum.json?.optIncluded}/${ctxSum.json?.optTotal}, entries=[${(ctxSum.json?.entries ?? []).map((e) => `${e.key}:${e.status}`).join(", ")}], text ${ctxSum.json?.contextText?.length} симв.`);
    const ctxTh = await call(tokO, "GET", `/${s8.id}/sections/theses/context`);
    t("Д-5: прочие разделы отвечают, как прежде", ctxTh.status === 200);
    const ctxBad = await call(tokO, "GET", `/${s8.id}/sections/nosuch/context`);
    t("Д-5: неизвестный ключ по-прежнему 404", ctxBad.status === 404 && ctxBad.json?.code === "NOT_FOUND");

    // ── Д-31: parseWarnings
    await db.insert(schema.generationLog).values({ synthesisId: s8.id, sectionKey: "theses", sectionLabel: "Тезисы", logType: "generation", source: "initial", status: "done", metadata: { parseWarnings: ["направление связи подставлено"] } });
    const pw = async (tok) => (await call(tok, "GET", `/${s8.id}/sections/theses`));
    let a = await pw(tokO);
    t("Д-31: владельцу parseWarnings отдаются всегда (концепция приватна)", a.status === 200 && J(a.json.section.parseWarnings) === J(["направление связи подставлено"]), J(a.json?.section?.parseWarnings));
    await db.update(schema.syntheses).set({ visibility: "full", showLogs: true }).where(eq(schema.syntheses.id, s8.id));
    a = await pw(tokX);
    t("Д-31: чужому при действенном show_logs — поле есть", a.status === 200 && J(a.json.section.parseWarnings) === J(["направление связи подставлено"]), J(a.json?.section?.parseWarnings));
    await db.update(schema.syntheses).set({ showLogs: false }).where(eq(schema.syntheses.id, s8.id));
    a = await pw(tokX);
    t("Д-31: чужому без флага логов — поля НЕТ в ответе, раздел отдан", a.status === 200 && !("parseWarnings" in a.json.section) && typeof a.json.section.htmlContent === "string", J(Object.keys(a.json?.section ?? {})));
    a = await pw(tokO);
    t("Д-31: владельцу поле отдаётся и при снятом флаге", J(a.json.section.parseWarnings) === J(["направление связи подставлено"]));

    // ── Д-8: экспорт свободного синтеза → импорт
    const s9 = await mkSynth({ seed: "Что есть пауза?", title: "Свободная концепция " + tag, sectionOrder: ["sum", "theses"], method: "dialectical" });
    await db.insert(schema.sections).values({ synthesisId: s9.id, key: "sum", sectionNum: 1, title: "Исполнительное резюме", htmlContent: wrap("Исполнительное резюме", sub("Цели и метод", "<p>Цель.</p>")) });
    await seedTheses(s9.id, ["О-1", "О-2", "Э-1"]);
    const file = await exp.exportHTML(s9.id);
    t("Д-8: экспорт свободного синтеза несёт подпись, а не список философов", /Свободный синтез \(на основе зерна\)/.test(file) && /id="footerPhil">—</.test(file));
    const res = await imp.importHTML(file, owner.id, "free.html");
    ids.push(res.synthesisId);
    t("Д-8: импорт свободного синтеза — ни одного критичного предупреждения", res.warnings.every((w) => !w.critical), J(res.warnings));
    const lin = await db.select().from(schema.synthesisLineage).where(eq(schema.synthesisLineage.synthesisId, res.synthesisId));
    t("Д-8: философов у свободного синтеза после круга нет", lin.length === 0, J(lin.map((l) => l.parentName)));
    t("Д-1: импорт 4.3 заполняет метку тезиса", J((await thesesOf(res.synthesisId)).map((x) => x.label)) === J(["О-1", "О-2", "Э-1"]));

    // ── Часть C: живой файл
    const live = process.env.T121_FILE;
    if (!live || !existsSync(live)) {
      console.log("C. живой файл (T121_FILE) не задан — пропуск");
    } else {
      console.log("C. живой файл");
      const raw = readFileSync(live, "utf8");
      const r1 = await imp.importHTML(raw, owner.id, "live.html");
      ids.push(r1.synthesisId);
      t("C: импорт живого файла — критичных предупреждений нет", r1.warnings.every((w) => !w.critical), J(r1.warnings.filter((w) => w.critical)));
      let lt = await thesesOf(r1.synthesisId);
      console.log(`    · тезисов ${lt.length}; метки: ${lt.map((x) => x.label ?? x.thesisNum).join(", ")}`);
      t("C: метки тезисов живого файла — в колонке («О-1» … «Э-N»)", lt.length > 0 && lt.every((x) => /^[А-ЯЁ]+-\d+$/.test(x.label ?? "")), J(lt.map((x) => x.label)));
      const e2 = lt.find((x) => x.label === "Э-2");
      t("C: тезис «Э-2» в файле есть", !!e2);
      if (e2) {
        await editor.updateThesis(r1.synthesisId, e2.id, { noveltyDegree: e2.noveltyDegree + " (правка)" });
        const lh = (await secRow(r1.synthesisId, "theses")).htmlContent;
        const labelsAfter = [...tableOf(lh).matchAll(/<tr>\s*<td>([^<]+)<\/td>/g)].map((m) => m[1]);
        t("C: после правки тезиса «Э-2» сводная таблица сохранила все буквенные метки", J(labelsAfter) === J(lt.map((x) => x.label)), J(labelsAfter));
        const ld = await recs.loadDocumentIndex(r1.synthesisId);
        const g = recs.guardRows([{ position: 1, num: "1", address: "Сводная таблица тезисов", element: "Э-3", op: "уточнить формулировку", replacement: "", rationale: "x", severity: "существенная" }], ld);
        t("C: сторож находит рекомендацию к «Э-3» после правки соседнего тезиса", g[0]?.elementKind === "thesis" && g[0]?.elementId === lt.find((x) => x.label === "Э-3")?.id, J(g[0]));
      }
      const linLive = await db.select().from(schema.synthesisLineage).where(eq(schema.synthesisLineage.synthesisId, r1.synthesisId));
      t("C: философ живого файла — только Юнг", J(linLive.filter((l) => l.parentType === "philosopher").map((l) => l.parentName)) === J(["Юнг"]), J(linLive.map((l) => [l.parentType, l.parentName])));

      // вариант «как у одностраничника»: концепция в ёлочках в футере и params.phil
      const STATE_RE = /(<script type="application\/json" id="philosynth-state">)([\s\S]*?)(<\/script>)/;
      const st = JSON.parse(STATE_RE.exec(raw)[2]);
      st.params.phil = ["Юнг", "«Грамматика самоотрицания»"];
      const onePager = raw
        .replace(STATE_RE, (_m, a, _b, c) => a + JSON.stringify(st) + c)
        .replace(/(<span id="footerPhil">)[^<]*(<\/span>)/, "$1Юнг, «Грамматика самоотрицания»$2");
      const metaOP = imp.extractMetadata(hp.parseDocument(onePager));
      t("C: шапка «как у одностраничника» — концепция в ёлочках не числится философом", J(metaOP.phil) === J(["Юнг"]) && metaOP.concepts.includes("Грамматика самоотрицания"), J([metaOP.phil, metaOP.concepts]));
      const whoOP = imp.importParticipants(metaOP, st);
      t("C: params.phil с ёлочками — философ один, концепция одна", J(whoOP.philosophers) === J(["Юнг"]) && J(whoOP.concepts) === J(["Грамматика самоотрицания"]), J(whoOP));
      // без встроенной genealogy и participants — запасная реконструкция из шапки
      const st2 = { ...st };
      delete st2.genealogy;
      delete st2.participants;
      const noGen = onePager.replace(STATE_RE, (_m, a, _b, c) => a + JSON.stringify(st2) + c);
      const r2 = await imp.importHTML(noGen, owner.id, "live-nogen.html");
      ids.push(r2.synthesisId);
      const lin2 = await db.select().from(schema.synthesisLineage).where(eq(schema.synthesisLineage.synthesisId, r2.synthesisId));
      t("C: без встроенной генеалогии концепция в ёлочках НЕ стала строкой-философом", J(lin2.map((l) => [l.parentType, l.parentName])) === J([["philosopher", "Юнг"]]), J(lin2.map((l) => [l.parentType, l.parentName])));
      t("C: … а ушла в предложение родителя (8.5)", r2.lineageCandidates.some((c) => c.parentName === "Грамматика самоотрицания") && r2.warnings.every((w) => !w.critical), J(r2.lineageCandidates));
    }
  } catch (err) {
    bad++;
    console.log("  ✗ исключение части B/C:", err?.stack ?? err);
  } finally {
    for (const id of ids) await db.delete(schema.syntheses).where(eq(schema.syntheses.id, id)).catch(() => {});
    await db.delete(schema.users).where(eq(schema.users.id, owner.id)).catch((e) => console.log("уборка users:", e?.cause?.code ?? e));
    await db.delete(schema.users).where(eq(schema.users.id, other.id)).catch((e) => console.log("уборка users:", e?.cause?.code ?? e));
  }
}

console.log(`\nИТОГ smoke-121: ${ok} ✓ / ${bad} ✗`);
try { const { closeDb } = await import("../server/db/index.ts"); await closeDb(); } catch {}
try { const { closeRedis } = await import("../server/redis.ts"); await closeRedis(); } catch {}
process.exit(bad ? 1 : 0);
