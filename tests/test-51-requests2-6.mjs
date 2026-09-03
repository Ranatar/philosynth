/**
 * Тестовые запросы 2–6 беседы 5.1 (Element Editor + Versioning, бэкенд).
 *  R2  PATCH category name → element_versions хранит старое значение,
 *      impact содержит затронутые секции; таблицы графа перерисованы.
 *  R3  autoRenameReferences «Бытие» → «Существование»: html_content всех
 *      разделов + related_categories тезисов, версии auto_rename.
 *  R4  rollback: v1 → изменение (v2) → rollback к 1 → данные восстановлены,
 *      версия 3 changeSource='rollback'.
 *  R5  computeElementImpact: категория, упомянутая в тезисах и глоссарии
 *      → severity='high'; без упоминаний → не 'high'.
 *  R6  edge case: удаление связи → impact на потребителей «Таблица связей»,
 *      таблица связей перерисована без ребра, has_reflexive пересчитан.
 *  + HTTP-смоук §2.4: PATCH/GET тезисов и глоссария, htmlSync абзаца
 *    тезиса, капсула, 400/403/404, версии.
 *
 * Стенд: PG16 + Redis, миграции 0000+0001, три сида. Живой сервер
 * (node_modules/.bin/tsx server/index.ts); фикстуры пишутся в БД напрямую
 * — HTML разделов моделирует ответ Claude (каркас doc-section +
 * <div data-section> с таблицами), гранулярные таблицы наполняются ТЕМИ
 * ЖЕ парсерами 1.4, что при генерации (saveGraphToDb/saveElementsToDb),
 * чтобы правки шли против согласованного состояния HTML ↔ БД.
 * Запуск: node_modules/.bin/tsx tests/test-51-requests2-6.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

process.env.DATABASE_URL ??=
  "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-secret-51";
process.env.ANTHROPIC_API_KEY ??= "sk-test-not-used";

const SERVER_PORT = 3151;
const BASE = `http://127.0.0.1:${SERVER_PORT}/api/v1`;

let passed = 0;
let failed = 0;
const fails = [];
function ok(cond, name, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    fails.push(name);
    console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`);
  }
}
const J = (x) => JSON.stringify(x);

const { db, closeDb } = await import("../server/db/index.js");
const schema = await import("../server/db/schema.js");
const { closeRedis } = await import("../server/redis.js");
const { saveGraphToDb, parseGraphFromHTML } = await import("../server/services/graph-parser.js");
const { saveElementsToDb, parseThesesFromHTML, parseGlossaryFromHTML } = await import(
  "../server/services/element-parser.js"
);
const ee = await import("../server/services/element-editor.js");
const ev = await import("../server/services/element-versioning.js");
const { and, asc, eq } = await import("drizzle-orm");
const {
  users, syntheses, synthesisLineage, sections, categories, categoryEdges,
  theses, glossaryTerms, elementVersions, modeResults,
} = schema;

/* ══ Фикстура: HTML «как от Claude» ═══════════════════════════════════ */

const secWrap = (num, title, inner) =>
  `<div class="doc-section"><div class="section-num">§ ${num}</div>` +
  `<div class="section-title">${title}</div><div class="doc-content">${inner}</div></div>`;
const sub = (name, inner) => `<div data-section="${name}"><h4>${name}</h4>${inner}</div>`;
const tbl = (heads, rows) =>
  `<table class="doc-table"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead>` +
  `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

const GRAPH_HTML = secWrap(2, "Граф категорий",
  sub("Методология построения графа", "<p>Граф строится диалектически.</p>") +
  sub("Таблица категорий",
    "<p>Ниже — категории.</p>" +
    tbl(["Категория", "Тип", "Определение", "Центральность", "Определённость", "Происхождение"], [
      ["Бытие", "онтологическая", "То, что есть", "0.9", "0.8", "Парменид"],
      ["Становление", "метафизическая", "Переход", "0.7", "0.6", "Гераклит"],
      ["Отшельник", "экзистенциальная", "Категория, которую никто не упоминает", "0.2", "0.3", "—"],
    ]) + "<p>Комментарий после таблицы категорий.</p>") +
  sub("Таблица связей",
    tbl(["Источник", "Описание связи", "Цель", "Тип", "Направление", "Сила"], [
      ["Бытие", "порождает", "Становление", "диалектическая", "однонаправленная", "0.8"],
      ["Бытие", "само-полагание", "Бытие", "рефлексия", "рефлексивная", "0.3"],
    ])) +
  sub("Топология графа", "<p>Кластер «Онтологическое ядро» объединяет Бытие и Становление.</p>") +
  sub("Топологическая таблица",
    tbl(["Категория", "Кластер", "Структурные роли", "Процессуальные роли", "Рефлексивная связь"], [
      ["Бытие", "Онтологическое ядро", "центральная, ядро", "тезис", "да"],
      ["Становление", "Онтологическое ядро", "мост", "антитезис", ""],
      ["Отшельник", "", "периферийная", "", ""],
    ])));

const THESES_HTML = secWrap(3, "Тезисы",
  sub("Онтологические тезисы", "<p><strong>Бытие есть становление</strong> Потому что так учил Гераклит.</p>") +
  sub("Эпистемологические тезисы", "<p><strong>Познание опосредовано</strong> Обоснование два.</p>") +
  sub("Сводная таблица тезисов",
    tbl(["№", "Формулировка тезиса", "Тип (онтол./эпистем./этич.)", "Степень новизны", "Связанные категории"], [
      ["1", "Бытие есть становление", "онтологический", "высокая", "Бытие, Становление"],
      ["2", "Познание опосредовано", "эпистемологический", "средняя", "Становление"],
    ])));

const GLOSSARY_HTML = secWrap(4, "Глоссарий терминов",
  sub("Таблица определений",
    tbl(["Термин", "Принятое определение в данной концепции", "Традиционное понимание у Парменида, Гераклита", "Почему принятое определение предпочтительнее"], [
      ["Бытие", "Всё сущее как становящееся", "неподвижное у Парменида", "снимает статику"],
      ["Становление", "Переход как основа", "поток у Гераклита", "обобщает"],
    ])) +
  sub("Переопределённые термины", "<p>Бытие — переопределено относительно Парменида.</p>"));

const CRITIQUE_HTML = secWrap(5, "Критический анализ",
  sub("Слабые места", "<p>Категория «Бытие» перегружена; «Становление» — недоопределено.</p>"));

/* ══ Пользователь + синтез (HTTP-сессия) ══════════════════════════════ */

const server = spawn("node_modules/.bin/tsx", ["server/index.ts"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(SERVER_PORT), RATE_LIMIT_HTTP_PER_MINUTE: "100000" }, // per-IP лимитер — грабля 1.6
  stdio: ["ignore", "pipe", "pipe"],
  // ГРАБЛЯ 5.1: tsx — обёртка над дочерним node; SIGKILL обёртке оставляет
  // сервер живым на порту, и следующий прогон бьёт в СТАРЫЙ код. Гасим
  // группу процессов целиком.
  detached: true,
});
const killServer = () => {
  try { process.kill(-server.pid, "SIGKILL"); } catch {}
  try { server.kill("SIGKILL"); } catch {}
};
let srvLog = "";
server.stdout.on("data", (d) => (srvLog += d));
server.stderr.on("data", (d) => (srvLog += d));

try {
  let up = false;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) { up = true; break; }
    } catch {}
  }
  ok(up, "сервер поднялся");
  if (!up) throw new Error("сервер не поднялся: " + srvLog.slice(-800));

  async function makeSession(tag) {
    const email = `t51-${tag}-${Date.now()}@x.ru`;
    const pw = "секрет-51-длинный";
    const reg = await fetch(`${BASE}/auth/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pw }),
    });
    const rb = await reg.json();
    const login = await fetch(`${BASE}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pw }),
    });
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    return { userId: rb.user.id, auth: { Cookie: cookie, "Content-Type": "application/json" } };
  }
  const owner = await makeSession("owner");
  const stranger = await makeSession("stranger");
  ok(!!owner.userId && !!owner.auth.Cookie, "владелец и чужой залогинены");

  const api = async (method, path, body, who = owner) => {
    const r = await fetch(`${BASE}${path}`, {
      method, headers: who.auth, body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await r.json(); } catch {}
    return { status: r.status, json };
  };

  const SECTION_ORDER = ["sum", "graph", "theses", "glossary", "critique"];
  async function makeSynthesis(userId) {
    const [s] = await db.insert(syntheses).values({
      userId, seed: "тестовое зерно 5.1", sectionOrder: SECTION_ORDER, status: "ready",
      capsuleHtml: "<p>Капсула: Бытие как становление.</p>", synthLevel: "comparative",
    }).returning();
    await db.insert(synthesisLineage).values(
      ["Парменид", "Гераклит"].map((name, i) => ({ synthesisId: s.id, parentType: "philosopher", parentName: name, position: i })),
    );
    const rows = [
      ["sum", 1, "Исполнительное резюме", secWrap(1, "Исполнительное резюме", sub("Цели и метод", "<p>Синтез Бытия и Становления.</p>"))],
      ["graph", 2, "Граф категорий", GRAPH_HTML],
      ["theses", 3, "Тезисы", THESES_HTML],
      ["glossary", 4, "Глоссарий терминов", GLOSSARY_HTML],
      ["critique", 5, "Критический анализ", CRITIQUE_HTML],
    ];
    await db.insert(sections).values(rows.map(([key, sectionNum, title, htmlContent]) => ({ synthesisId: s.id, key, sectionNum, title, htmlContent })));
    // Гранулярные таблицы — теми же парсерами, что при генерации (1.4)
    const g = await saveGraphToDb(s.id, parseGraphFromHTML(GRAPH_HTML));
    await saveElementsToDb(s.id, "theses", { theses: parseThesesFromHTML(THESES_HTML) });
    await saveElementsToDb(s.id, "glossary", { glossaryTerms: parseGlossaryFromHTML(GLOSSARY_HTML) });
    // Результат режима-оппонента (зависит от graph:nodes → затрагивается правкой графа)
    await db.insert(modeResults).values({ synthesisId: s.id, modeKey: "adversarial", paramValue: "Юм", htmlContent: "<div>возражения Юма</div>" });
    return { s, g };
  }
  const { s: synth, g } = await makeSynthesis(owner.userId);
  const sid = synth.id;
  ok(g.categoriesInserted === 3 && g.edgesInserted === 2 && g.clustersInserted === 1, "фикстура: граф 3/2/1", J(g));

  const catRows = await db.select().from(categories).where(eq(categories.synthesisId, sid)).orderBy(asc(categories.position));
  const byName = Object.fromEntries(catRows.map((c) => [c.name, c]));
  const bytie = byName["Бытие"];
  const otshelnik = byName["Отшельник"];
  ok(!!bytie && !!otshelnik && bytie.hasReflexive === true, "фикстура: категории, has_reflexive у Бытия", J(catRows.map((c) => [c.name, c.hasReflexive])));
  const secHtml = async (key) => (await db.select({ h: sections.htmlContent }).from(sections).where(and(eq(sections.synthesisId, sid), eq(sections.key, key))))[0].h;

  /* ══ R2: PATCH category name ══════════════════════════════════════════ */
  console.log("\nR2. PATCH /categories/:catId name=«Новое имя»");
  const r2 = await api("PATCH", `/syntheses/${sid}/categories/${bytie.id}`, { name: "Новое имя", centrality: 0.95 });
  ok(r2.status === 200, "PATCH → 200", `${r2.status} ${J(r2.json)}`);
  ok(r2.json?.category?.name === "Новое имя" && r2.json.category.centrality === 0.95, "ответ: category с новыми полями");
  ok(r2.json?.category?.source === "manual", "source → 'manual'");
  ok(r2.json?.version?.version === 1 && r2.json.version.data?.name === "Бытие" && r2.json.version.changeSource === "manual", "версия 1: снимок ДО изменения (name=«Бытие»)", J(r2.json?.version));
  const vers = await db.select().from(elementVersions).where(and(eq(elementVersions.elementId, bytie.id), eq(elementVersions.elementType, "category")));
  ok(vers.length === 1 && vers[0].data.name === "Бытие" && vers[0].data.centrality === 0.9 && vers[0].synthesisId === sid, "element_versions: 1 строка, старое значение, synthesis_id", J(vers.map((v) => [v.version, v.data.name])));
  const imp2 = r2.json?.impact;
  ok(Array.isArray(imp2?.affectedSections) && imp2.affectedSections.includes("theses"), "impact.affectedSections ∋ theses (downstream graph)", J(imp2));
  ok(imp2?.affectedSubsections?.some((x) => x.startsWith("theses:")), "impact.affectedSubsections — подразделы theses через graph:nodes", J(imp2?.affectedSubsections));
  ok(imp2?.affectedModes?.some((m) => m.modeKey === "adversarial" && m.index === 0), "impact.affectedModes ∋ adversarial#0", J(imp2?.affectedModes));
  ok(imp2?.severity === "high", "severity='high' (имя упомянуто в тезисах/глоссарии/критике)", imp2?.severity);
  ok(J(r2.json?.htmlSync?.rendered) === J(["graph:Таблица категорий", "graph:Таблица связей", "graph:Топологическая таблица"]), "htmlSync.rendered — три таблицы графа (смена имени)", J(r2.json?.htmlSync));
  const gh2 = await secHtml("graph");
  ok(gh2.includes("<td>Новое имя</td><td>онтологическая</td><td>То, что есть</td><td>0.95</td>"), "html_content: строка категории перерисована");
  ok(!gh2.includes("<td>Бытие</td>"), "html_content: старое имя исчезло из всех таблиц графа");
  ok(gh2.includes("<td>Новое имя</td><td>порождает</td><td>Становление</td>"), "таблица связей показывает новое имя источника");
  ok(gh2.includes("<h4>Таблица категорий</h4><p>Ниже — категории.</p>") && gh2.includes("<p>Комментарий после таблицы категорий.</p>"), "h4 и проза подраздела сохранены");
  ok(gh2.includes("<p>Граф строится диалектически.</p>") && gh2.includes("объединяет Бытие и Становление"), "соседние подразделы (проза) не тронуты");
  const th2 = await secHtml("theses");
  ok(th2.includes("Бытие, Становление"), "theses html без auto-rename ещё несёт старое имя (правка — отдельный шаг)");
  const isEdited = (await db.select({ e: sections.isEdited }).from(sections).where(and(eq(sections.synthesisId, sid), eq(sections.key, "graph"))))[0].e;
  ok(isEdited === true, "sections.is_edited = true");
  // Round-trip после правки: парсер читает то же, что лежит в БД
  const reparsed = parseGraphFromHTML(gh2);
  ok(reparsed.nodes.length === 3 && reparsed.nodes[0].name === "Новое имя" && reparsed.nodes[0].cen === 0.95 && reparsed.edges[0].src === "Новое имя", "round-trip: parseGraph(html_content) ≡ БД", J(reparsed.nodes[0]));
  ok(J(reparsed.topology.roles.structural["Новое имя"]) === J(["central", "core"]) && J(reparsed.topology.clusterLabels) === J(["Онтологическое ядро"]), "round-trip: топология сохранена", J(reparsed.topology));

  // Валидация и доступ
  const bad = await api("PATCH", `/syntheses/${sid}/categories/${bytie.id}`, { centrality: 1.5, innovationDegree: 2.5 });
  ok(bad.status === 400 && bad.json?.code === "VALIDATION_ERROR" && bad.json.details?.centrality && bad.json.details?.innovationDegree, "400 VALIDATION_ERROR с details по полям", J(bad.json));
  const empty = await api("PATCH", `/syntheses/${sid}/categories/${bytie.id}`, {});
  ok(empty.status === 400, "пустой PATCH → 400");
  const forb = await api("PATCH", `/syntheses/${sid}/categories/${bytie.id}`, { name: "Чужое" }, stranger);
  ok(forb.status === 403, "чужой → 403");
  const nf = await api("PATCH", `/syntheses/${sid}/categories/00000000-0000-4000-8000-000000000000`, { name: "Нет" });
  ok(nf.status === 404, "несуществующая категория → 404");
  const bogus = await api("PATCH", `/syntheses/${sid}/categories/not-a-uuid`, { name: "Нет" });
  ok(bogus.status === 404, "не-UUID → 404 до PG");
  const noChange = await db.select().from(categories).where(eq(categories.id, bytie.id));
  ok(noChange[0].name === "Новое имя" && noChange[0].centrality === 0.95, "отказы не меняют БД");
  const vAfterFail = await db.select().from(elementVersions).where(eq(elementVersions.elementId, bytie.id));
  ok(vAfterFail.length === 1, "отказы не создают версий");
  const getOne = await api("GET", `/syntheses/${sid}/categories/${bytie.id}`);
  ok(getOne.status === 200 && getOne.json?.category?.name === "Новое имя", "GET /categories/:catId");
  const getOneStranger = await api("GET", `/syntheses/${sid}/categories/${bytie.id}`, undefined, stranger);
  ok(getOneStranger.status === 403, "GET чужого непубличного → 403");
  // typeCatalogId (п.11)
  const [ont] = await db.select().from(schema.categoryTypeCatalog).where(eq(schema.categoryTypeCatalog.key, "ontological"));
  const tc = await api("PATCH", `/syntheses/${sid}/categories/${bytie.id}`, { typeCatalogId: ont.id });
  ok(tc.status === 200 && tc.json.category.typeCatalogId === ont.id, "typeCatalogId из каталога принят");
  const tcBad = await api("PATCH", `/syntheses/${sid}/categories/${bytie.id}`, { typeCatalogId: "00000000-0000-4000-8000-000000000000" });
  ok(tcBad.status === 400 && tcBad.json.details?.typeCatalogId, "typeCatalogId вне каталога → 400");
  const tcNull = await api("PATCH", `/syntheses/${sid}/categories/${bytie.id}`, { typeCatalogId: null, type: "свободный тип" });
  ok(tcNull.status === 200 && tcNull.json.category.typeCatalogId === null && tcNull.json.category.type === "свободный тип", "typeCatalogId=null + свободный type");
  // Вернём имя и тип для R3 (через PATCH — ещё версии)
  const back = await api("PATCH", `/syntheses/${sid}/categories/${bytie.id}`, { name: "Бытие", type: "онтологическая" });
  ok(back.status === 200 && (await secHtml("graph")).includes("<td>Бытие</td><td>онтологическая</td>"), "имя возвращено к «Бытие» (подготовка R3)");

  /* ══ R3: autoRenameReferences ═════════════════════════════════════════ */
  console.log("\nR3. POST /elements/auto-rename «Бытие» → «Существование»");
  const catRename = await api("PATCH", `/syntheses/${sid}/categories/${bytie.id}`, { name: "Существование" });
  ok(catRename.status === 200, "сначала PATCH имени категории");
  const r3 = await api("POST", `/syntheses/${sid}/elements/auto-rename`, { oldName: "Бытие", newName: "Существование" });
  ok(r3.status === 200, "auto-rename → 200", `${r3.status} ${J(r3.json)}`);
  ok(J([...(r3.json?.affectedSections ?? [])].sort()) === J(["capsule", "critique", "glossary", "graph", "theses"].sort()), "affectedSections: graph (проза топологии)/theses/glossary/critique + capsule; sum («Бытия» — не целое слово) нет", J(r3.json?.affectedSections));
  ok(r3.json?.affectedTheses === 1, "affectedTheses = 1 (related_categories тезиса 1)", J(r3.json));
  const allSecs = await db.select().from(sections).where(eq(sections.synthesisId, sid));
  ok(allSecs.every((s) => !/(?<![\p{L}\p{N}])Бытие(?![\p{L}\p{N}])/u.test(s.htmlContent)), "ни один раздел не содержит слова «Бытие»");
  const thHtml3 = await secHtml("theses");
  ok(thHtml3.includes("<strong>Существование есть становление</strong>") && thHtml3.includes("<td>Существование, Становление</td>"), "theses: заменено и в абзаце, и в таблице");
  ok((await secHtml("glossary")).includes("<td>Существование</td>"), "glossary: термин переименован в таблице");
  ok((await db.select().from(syntheses).where(eq(syntheses.id, sid)))[0].capsuleHtml.includes("Существование как становление"), "капсула (syntheses.capsule_html) переименована");
  const thRows3 = await db.select().from(theses).where(eq(theses.synthesisId, sid)).orderBy(asc(theses.thesisNum));
  ok(J(thRows3[0].relatedCategories) === J(["Существование", "Становление"]) && J(thRows3[1].relatedCategories) === J(["Становление"]), "theses.related_categories обновлены только у затронутого", J(thRows3.map((t) => t.relatedCategories)));
  const arVers = await db.select().from(elementVersions).where(and(eq(elementVersions.synthesisId, sid), eq(elementVersions.changeSource, "auto_rename")));
  ok(arVers.filter((v) => v.elementType === "section").length === 4 && arVers.filter((v) => v.elementType === "thesis").length === 1 && arVers.filter((v) => v.elementType === "glossary_term").length === 1, "версии auto_rename: 4 section + 1 thesis + 1 glossary_term", J(arVers.map((v) => [v.elementType, v.version])));
  ok(thRows3[0].formulation === "Существование есть становление", "theses.formulation переписана (расширение против буквы §2.4 — иначе рассинхрон БД↔HTML)");
  ok((await db.select().from(glossaryTerms).where(and(eq(glossaryTerms.synthesisId, sid), eq(glossaryTerms.term, "Существование")))).length === 1, "glossary_terms.term переписан");
  ok(arVers.find((v) => v.elementType === "thesis")?.data.relatedCategories?.[0] === "Бытие", "снимок тезиса хранит прежние related_categories");
  // Граница слова: «Бытием»/«Небытие» не задеты
  await db.update(sections).set({ htmlContent: (await secHtml("critique")) + "<p>Бытием и Небытие — не трогать; Бытие — трогать.</p>" }).where(and(eq(sections.synthesisId, sid), eq(sections.key, "critique")));
  const r3b = await api("POST", `/syntheses/${sid}/elements/auto-rename`, { oldName: "Бытие", newName: "Существование" });
  const crit3 = await secHtml("critique");
  ok(r3b.json?.affectedSections?.length === 1 && crit3.includes("Бытием и Небытие — не трогать; Существование — трогать."), "замена только целого слова (кириллица, lookaround)", crit3.slice(-120));
  const r3same = await api("POST", `/syntheses/${sid}/elements/auto-rename`, { oldName: "X", newName: "X" });
  ok(r3same.status === 400, "oldName === newName → 400");
  const r3none = await api("POST", `/syntheses/${sid}/elements/auto-rename`, { oldName: "Такого-нет", newName: "Y" });
  ok(r3none.status === 200 && r3none.json.affectedSections.length === 0 && r3none.json.affectedTheses === 0, "нет упоминаний → пустой результат");

  /* ══ R4: rollback ═════════════════════════════════════════════════════ */
  console.log("\nR4. rollback: v1 → изменение → v2 → rollback к 1 → v3 'rollback'");
  const [term1] = await db.select().from(glossaryTerms).where(and(eq(glossaryTerms.synthesisId, sid), eq(glossaryTerms.term, "Становление")));
  ok(!!term1, "термин «Становление» есть");
  const p1 = await api("PATCH", `/syntheses/${sid}/glossary/${term1.id}`, { definition: "Определение v2" });
  ok(p1.status === 200 && p1.json.version.version === 1 && p1.json.version.data.definition === "Переход как основа", "PATCH #1 → версия 1 (снимок исходного)", J(p1.json?.version));
  const p2 = await api("PATCH", `/syntheses/${sid}/glossary/${term1.id}`, { definition: "Определение v3", extraColumns: { ...term1.extraColumns, "Почему принятое определение предпочтительнее": "иначе" } });
  ok(p2.status === 200 && p2.json.version.version === 2 && p2.json.version.data.definition === "Определение v2", "PATCH #2 → версия 2");
  const hist = await api("GET", `/syntheses/${sid}/elements/glossary_term/${term1.id}/versions`);
  ok(hist.status === 200 && J(hist.json.versions.map((v) => v.version)) === J([2, 1]), "GET versions: [2, 1] (DESC)", J(hist.json?.versions?.map((v) => v.version)));
  const rb = await api("POST", `/syntheses/${sid}/elements/glossary_term/${term1.id}/rollback`, { version: 1 });
  ok(rb.status === 200, "rollback → 200", `${rb.status} ${J(rb.json)}`);
  ok(rb.json?.element?.definition === "Переход как основа" && rb.json.element.extraColumns["Почему принятое определение предпочтительнее"] === "обобщает", "данные восстановлены из версии 1 (definition + extraColumns)", J(rb.json?.element));
  ok(rb.json?.version?.version === 3 && rb.json.version.changeSource === "rollback" && rb.json.version.data.definition === "Определение v3", "создана версия 3 changeSource='rollback' со снимком ДО отката", J(rb.json?.version));
  const [term1db] = await db.select().from(glossaryTerms).where(eq(glossaryTerms.id, term1.id));
  ok(term1db.definition === "Переход как основа", "БД: definition восстановлен");
  ok((await secHtml("glossary")).includes("<td>Становление</td><td>Переход как основа</td>") && !(await secHtml("glossary")).includes("Определение v3"), "html_content глоссария перерисован по восстановленным данным");
  ok(J(rb.json?.htmlSync?.rendered) === J(["glossary:Таблица определений"]), "htmlSync.rendered = таблица определений");
  const hist2 = await api("GET", `/syntheses/${sid}/elements/glossary_term/${term1.id}/versions`);
  ok(J(hist2.json.versions.map((v) => [v.version, v.changeSource])) === J([[3, "rollback"], [2, "manual"], [1, "manual"]]), "история линейна: 3/rollback, 2/manual, 1/manual");
  const rbBad = await api("POST", `/syntheses/${sid}/elements/glossary_term/${term1.id}/rollback`, { version: 42 });
  ok(rbBad.status === 404, "несуществующая версия → 404");
  const rbType = await api("POST", `/syntheses/${sid}/elements/widget/${term1.id}/rollback`, { version: 1 });
  ok(rbType.status === 400 && rbType.json.code === "VALIDATION_ERROR", "неизвестный elementType → 400");
  const rbNoV = await api("POST", `/syntheses/${sid}/elements/glossary_term/${term1.id}/rollback`, {});
  ok(rbNoV.status === 400, "без version → 400");
  const histStranger = await api("GET", `/syntheses/${sid}/elements/glossary_term/${term1.id}/versions`, undefined, stranger);
  ok(histStranger.status === 403, "versions чужого → 403");
  // Откат категории восстанавливает и таблицу связей/топологии (имя)
  const catHist = await api("GET", `/syntheses/${sid}/elements/category/${bytie.id}/versions`);
  const firstCatV = catHist.json.versions.at(-1);
  ok(firstCatV.version === 1 && firstCatV.data.name === "Бытие", "версия 1 категории — исходное «Бытие»");
  const rbCat = await api("POST", `/syntheses/${sid}/elements/category/${bytie.id}/rollback`, { version: 1 });
  ok(rbCat.status === 200 && rbCat.json.element.name === "Бытие" && rbCat.json.element.centrality === 0.9, "rollback категории → имя и центральность версии 1", J(rbCat.json?.element));
  const gh4 = await secHtml("graph");
  ok(gh4.includes("<td>Бытие</td><td>порождает</td>") && gh4.includes("<td>Бытие</td><td>Онтологическое ядро</td>"), "таблицы связей и топологии перерисованы под откат");
  ok(rbCat.json.impact.severity === "low" || rbCat.json.impact.severity === "none" || rbCat.json.impact.severity === "high", "impact после отката посчитан");

  /* ══ R5: computeElementImpact — severity ══════════════════════════════ */
  console.log("\nR5. computeElementImpact: упоминания → severity");
  const impHigh = await ee.computeElementImpact("category", bytie.id, sid, "Бытие");
  // после auto-rename в тексте «Существование», но БД-имя снова «Бытие» после отката; проверим по имени «Становление», которое везде
  const stan = byName["Становление"];
  const impStan = await ee.computeElementImpact("category", stan.id, sid, "Становление");
  ok(impStan.severity === "high", "«Становление» (в тезисах, глоссарии, критике) → 'high'", J(impStan));
  ok(impStan.affectedSections.includes("theses") && impStan.affectedSubsections.length > 0 && impStan.affectedModes.length === 1, "структурные зависимые тоже есть");
  const impNone = await ee.computeElementImpact("category", otshelnik.id, sid, "Отшельник");
  ok(impNone.severity === "low", "«Отшельник» (нигде не упомянут, но граф — источник контекста) → 'low'", J(impNone));
  ok(impHigh.severity === "low" || impHigh.severity === "high", "impact для «Бытие» посчитан", J(impHigh));
  // glossary_term: глоссарий — потребляется critique (glossary:table)
  const impTerm = await ee.computeElementImpact("glossary_term", term1.id, sid, "Становление");
  ok(impTerm.severity === "high" && impTerm.affectedSubsections.every((x) => !x.startsWith("glossary:")), "термин: 'high', зависимые вне glossary", J(impTerm));
  // Раздел-хозяин отсутствует → пусто
  const [orphan] = await db.insert(syntheses).values({ userId: owner.userId, seed: "x", sectionOrder: ["sum"], status: "ready" }).returning();
  const [orphanCat] = await db.insert(categories).values({ synthesisId: orphan.id, name: "Сирота", position: 0 }).returning();
  const impOrphan = await ee.computeElementImpact("category", orphanCat.id, orphan.id, "Сирота");
  ok(impOrphan.severity === "none" && impOrphan.affectedSections.length === 0, "нет раздела graph в документе → severity 'none'", J(impOrphan));

  /* ══ R6: удаление связи ═══════════════════════════════════════════════ */
  console.log("\nR6. edge case: DELETE /edges/:edgeId (impact на потребителей «Таблица связей»)");
  const edges6 = await db.select().from(categoryEdges).where(eq(categoryEdges.synthesisId, sid)).orderBy(asc(categoryEdges.position));
  const reflexEdge = edges6.find((e) => e.direction === "рефлексивная");
  const plainEdge = edges6.find((e) => e.direction !== "рефлексивная");
  ok(!!reflexEdge && !!plainEdge, "две связи на месте");
  // PATCH связи: направление → перерасчёт has_reflexive и топологии
  const pe = await api("PATCH", `/syntheses/${sid}/edges/${plainEdge.id}`, { strength: 0.55, description: "порождает и снимает" });
  ok(pe.status === 200 && pe.json.edge.strength === 0.55 && pe.json.version.version === 1 && pe.json.version.data.strength === 0.8, "PATCH edge: значение и версия", J(pe.json?.version));
  ok((await secHtml("graph")).includes("<td>порождает и снимает</td><td>Становление</td><td>диалектическая</td><td>однонаправленная</td><td>0.55</td>"), "таблица связей перерисована");
  ok(J(pe.json.htmlSync.rendered) === J(["graph:Таблица связей"]), "без смены направления перерисована только таблица связей");
  const peDir = await api("PATCH", `/syntheses/${sid}/edges/${plainEdge.id}`, { direction: "боком" });
  ok(peDir.status === 400 && peDir.json.details?.direction, "невалидное направление → 400");
  const del = await api("DELETE", `/syntheses/${sid}/edges/${reflexEdge.id}`);
  ok(del.status === 200 && del.json.ok === true, "DELETE → 200 { ok }", `${del.status} ${J(del.json)}`);
  ok((await db.select().from(categoryEdges).where(eq(categoryEdges.id, reflexEdge.id))).length === 0, "ребро удалено из БД");
  const [bytieAfter] = await db.select().from(categories).where(eq(categories.id, bytie.id));
  ok(bytieAfter.hasReflexive === false, "has_reflexive у «Бытие» пересчитан → false");
  const gh6 = await secHtml("graph");
  ok(!gh6.includes("само-полагание") && (gh6.match(/<td>рефлексивная<\/td>/g) ?? []).length === 0, "таблица связей без рефлексивного ребра");
  ok(gh6.includes("<td>Бытие</td><td>Онтологическое ядро</td><td>центральная, ядро</td><td>тезис</td><td></td>"), "топологическая таблица: «Рефлексивная связь» у «Бытие» очищена");
  ok(J(del.json.htmlSync.rendered) === J(["graph:Таблица связей", "graph:Топологическая таблица"]), "htmlSync: связи + топология");
  ok(del.json.impact.affectedSubsections.some((x) => x.startsWith("theses:")), "impact: потребители graph:edges — подразделы theses", J(del.json.impact));
  ok(del.json.impact.severity === "low", "severity 'low' (у связи нет имени для текстовых упоминаний)", del.json.impact.severity);
  const delVers = await db.select().from(elementVersions).where(and(eq(elementVersions.elementId, reflexEdge.id), eq(elementVersions.elementType, "edge")));
  ok(delVers.length === 1 && delVers[0].data.direction === "рефлексивная", "снимок удалённого ребра сохранён в версиях");
  const del404 = await api("DELETE", `/syntheses/${sid}/edges/${reflexEdge.id}`);
  ok(del404.status === 404, "повторное удаление → 404");
  ok(parseGraphFromHTML(gh6).edges.length === 1, "round-trip: parseGraph видит одно ребро");

  /* ══ Тезисы + капсула + списки (HTTP §2.4) ════════════════════════════ */
  console.log("\nHTTP §2.4: тезисы, глоссарий, капсула");
  const thList = await api("GET", `/syntheses/${sid}/theses`);
  ok(thList.status === 200 && thList.json.theses.length === 2 && thList.json.theses[0].thesisNum === 1, "GET /theses");
  const glList = await api("GET", `/syntheses/${sid}/glossary`);
  ok(glList.status === 200 && glList.json.terms.length === 2, "GET /glossary");
  const t1 = thList.json.theses[0];
  const pt = await api("PATCH", `/syntheses/${sid}/theses/${t1.id}`, { justification: "Новое обоснование тезиса.", noveltyDegree: "революционная" });
  ok(pt.status === 200 && pt.json.thesis.justification === "Новое обоснование тезиса.", "PATCH thesis → 200");
  const th7 = await secHtml("theses");
  ok(th7.includes("<p><strong>Существование есть становление</strong> Новое обоснование тезиса.</p>"), "абзац тезиса перерисован точечно (поле вне таблицы)", th7.slice(0, 400));
  ok(th7.includes("<td>революционная</td>") && th7.includes("<td>Существование, Становление</td>"), "сводная таблица тезисов перерисована");
  ok(J(pt.json.htmlSync) === J({ rendered: ["theses:Сводная таблица тезисов"], patched: ["thesis.justification"], pending: [], sectionMissing: false }), "htmlSync: rendered + patched, pending пуст", J(pt.json.htmlSync));
  const ptType = await api("PATCH", `/syntheses/${sid}/theses/${t1.id}`, { thesisType: "ethical" });
  ok(ptType.status === 200 && (await secHtml("theses")).includes("<td>этический</td>"), "thesisType → метка в таблице");
  ok(parseThesesFromHTML(await secHtml("theses"))[0].thesisType === "ethical", "round-trip: парсер читает 'ethical'");
  const ptBad = await api("PATCH", `/syntheses/${sid}/theses/${t1.id}`, { thesisType: "мистический" });
  ok(ptBad.status === 400, "невалидный thesisType → 400");
  // Тезис без абзаца → pending
  const [t3] = await db.insert(theses).values({ synthesisId: sid, thesisNum: 3, formulation: "Тезис без абзаца", thesisType: "ethical" }).returning();
  const pt3 = await api("PATCH", `/syntheses/${sid}/theses/${t3.id}`, { justification: "нигде не лежит" });
  ok(pt3.status === 200 && J(pt3.json.htmlSync.pending) === J(["thesis.justification"]), "обоснование без абзаца → htmlSync.pending (не теряется молча)", J(pt3.json?.htmlSync));
  // termCategory → pending
  const ptc = await api("PATCH", `/syntheses/${sid}/glossary/${term1.id}`, { termCategory: "new" });
  ok(ptc.status === 200 && ptc.json.htmlSync.pending.includes("glossary_term.termCategory"), "termCategory (проза категорийных подразделов) → pending");
  // Капсула
  const pc = await api("PATCH", `/syntheses/${sid}/capsule`, { html: "<p>Новая капсула.</p>" });
  ok(pc.status === 200 && pc.json.capsuleHtml === "<p>Новая капсула.</p>" && pc.json.version.changeSource === "manual", "PATCH /capsule → 200 + версия", J(pc.json));
  ok((await db.select().from(syntheses).where(eq(syntheses.id, sid)))[0].capsuleHtml === "<p>Новая капсула.</p>", "syntheses.capsule_html обновлён");
  const pcBad = await api("PATCH", `/syntheses/${sid}/capsule`, { html: "   " });
  ok(pcBad.status === 400, "пустая капсула → 400");
  const vEmpty = await api("GET", `/syntheses/${sid}/elements/category/${otshelnik.id}/versions`);
  ok(vEmpty.status === 200 && vEmpty.json.versions.length === 0, "versions нетронутого элемента → пустой список (не 404)");
  const vGhost = await api("GET", `/syntheses/${sid}/elements/category/00000000-0000-4000-8000-000000000000/versions`);
  ok(vGhost.status === 404, "versions несуществующего элемента → 404");
  // Уборка: удаление синтеза уносит версии CASCADE (п.3)
  const nV = (await db.select().from(elementVersions).where(eq(elementVersions.synthesisId, sid))).length;
  ok(nV > 10, `версий накоплено: ${nV}`);
  await db.delete(syntheses).where(eq(syntheses.id, sid));
  ok((await db.select().from(elementVersions).where(eq(elementVersions.synthesisId, sid))).length === 0, "DELETE синтеза → версии ушли CASCADE (element_versions.synthesis_id)");
  await db.delete(syntheses).where(eq(syntheses.id, orphan.id));
} catch (err) {
  failed++;
  fails.push("EXCEPTION");
  console.error("EXCEPTION:", err);
  console.error("server log tail:", srvLog.slice(-1500));
} finally {
  killServer();
}

console.log(`\n${passed} ✓ / ${failed} ✗`);
if (fails.length) console.log("Провалы:", fails);
await closeDb();
await closeRedis();
process.exit(failed ? 1 : 0);
