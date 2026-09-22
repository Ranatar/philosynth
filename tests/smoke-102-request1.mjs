/**
 * Смоук беседы 10.2 (запрос 1). Часть A — без БД: чистые функции; часть B —
 * живой файл одностраничника (T102_FILE; нет файла или БД — пропуск).
 *  A. validateSelection (пусто → отказ: «все разом» входа не имеет; развилка:
 *     оба варианта, голый номер; неизвестный номер; повтор), rowsToPlanActions
 *     (замена → edit_element; элемент без замены → refine_element с доводом и
 *     подразделом; «добавить»/«развить» без элемента → regen_subsection
 *     «sectionKey:Адрес»; «перегенерировать» без элемента → regen раздела, у
 *     sum — подраздел; «удалить» → отклонена; два подраздела одного адреса →
 *     один шаг; подраздел вливается в regen своего раздела; элемент раздела,
 *     идущего на regen, отклонён; один элемент дважды → второй отклонён;
 *     critique в действия НЕ попадает ни при каком входе), cleanModelFieldValue,
 *     planCostBreakdown, countBillableSteps / slotBillingFor, шаблон refine ↔
 *     buildRefineVars (дрейф в обе стороны).
 *  B. живой файл: таблица рекомендаций вписана рукой (семь рекомендаций
 *     файла) → parse → план ['2'] = ОДИН базовый шаг edit_element, бесплатно,
 *     а перегенерация критики в плане ЕСТЬ и добавлена КАСКАДОМ
 *     (cascadeGenerated, pending); исполнение без источника оплаты при
 *     BILLING_ENFORCE → определение изменено, версия 'recommendation' с origin
 *     (№ и раунд), квота и стоимость не тронуты, строка 'done'; соседняя
 *     строка о том же элементе → 'stale', после перечитки снова годна;
 *     удаление плана возвращает 'planned' → 'new'; ROUND_IN_PROGRESS.
 * Запуск: T102_FILE=… node_modules/.bin/tsx tests/smoke-102-request1.mjs
 */
import { existsSync, readFileSync } from "node:fs";

let ok = 0, bad = 0;
const t = (name, cond, extra = "") => { if (cond) { ok++; console.log(`  ✓ ${name}`); } else { bad++; console.log(`  ✗ ${name} ${extra}`); } };
const throwsCode = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const planner = await import("../server/services/recommendation-planner.ts");
const estep = await import("../server/services/element-step.ts");
const steps = await import("../packages/shared/constants/edit-steps.ts");
const exec = await import("../server/services/plan-executor.ts");
const tpl = await import("../server/config/recommendation-templates.ts");

console.log("A. чистые функции");
{
  const round = ["1", "2", "3", "4", "5а", "5б", "6", "7", "7"];
  const sel = (n) => planner.validateSelection(n, round);
  let e = await throwsCode(() => sel([]));
  t("пустой nums → отказ (входа «все разом» нет)", e?.code === "VALIDATION_ERROR" && /поштучно/.test(e.message));
  e = await throwsCode(() => sel(undefined));
  t("nums отсутствует → отказ", e?.code === "VALIDATION_ERROR");
  e = await throwsCode(() => sel(["all"]));
  t("«all» — не номер", e?.code === "VALIDATION_ERROR");
  e = await throwsCode(() => sel(["5а", "5б"]));
  t("оба варианта развилки → 400 с пояснением", e?.code === "VALIDATION_ERROR" && /исключают/.test(e.message) && e.details.fork.length === 2);
  e = await throwsCode(() => sel(["5"]));
  t("голый номер развилки → «назовите вариант»", e?.code === "VALIDATION_ERROR" && /развилка/.test(e.message));
  e = await throwsCode(() => sel(["9"]));
  t("неизвестный номер → отказ со списком", e?.code === "VALIDATION_ERROR" && Array.isArray(e.details.available));
  t("«5А» латиницей-регистром и повтор сводятся", JSON.stringify(sel(["5А", "5а", "2"]).nums) === JSON.stringify(["5а", "2"]));

  const row = (o) => ({ id: `id-${o.position}`, synthesisId: "s", round: 1, position: 1, num: "1", addressSubsection: "Таблица категорий", addressSection: "graph", element: null, elementKind: null, elementId: null, op: "уточнить формулировку", replacement: null, rationale: "Верность методу синтеза", severity: "существенная", status: "new", invalidReason: null, sourceHash: "h", roundHash: "r", planId: null, stepIndex: null, createdAt: new Date(), ...o });
  const order = ["sum", "graph", "glossary", "theses", "dialogue", "critique"];
  const act = (rows) => planner.rowsToPlanActions(rows, (n) => `Рекомендация ${n}: текст довода.`, order);

  let a = act([row({ position: 1, num: "2", element: "Индивидуация", elementKind: "category", elementId: "c1", replacement: "новый текст" })]);
  t("замена + элемент → edit_element", a.body.elementEdits.length === 1 && a.body.elementEdits[0].value === "новый текст" && a.body.elementRefines.length === 0);
  t("… со снимком рекомендации (№, раунд)", a.body.elementEdits[0].recommendations[0].num === "2" && a.body.elementEdits[0].recommendations[0].round === 1);

  a = act([row({ position: 2, num: "4", addressSubsection: "Эпистемологические тезисы", addressSection: "theses", element: "Э-3", elementKind: "thesis", elementId: "t3", op: "развить" })]);
  t("элемент без замены → refine_element", a.body.elementRefines.length === 1 && a.body.elementEdits.length === 0);
  t("… довод рекомендации уходит в контекст шага", /Операция: развить/.test(a.body.elementRefines[0].note) && /текст довода/.test(a.body.elementRefines[0].note) && /Верность методу/.test(a.body.elementRefines[0].note));
  t("… и подраздел адреса", a.body.elementRefines[0].subsection === "theses:Эпистемологические тезисы");

  a = act([row({ position: 3, num: "3", addressSubsection: "Онтологические тезисы", addressSection: "theses", op: "добавить" })]);
  t("«добавить» без элемента → regen_subsection «sectionKey:Адрес»", a.body.regenSubsections.length === 1 && a.body.regenSubsections[0].target === "theses:Онтологические тезисы" && a.body.regen.length === 0);
  t("… довод — пожеланием шага", /Операция: добавить/.test(a.body.regenSubsections[0].note));

  a = act([row({ position: 4, num: "6", addressSubsection: "Определения", addressSection: "glossary", op: "перегенерировать" })]);
  t("«перегенерировать» без элемента → regen раздела", JSON.stringify(a.body.regen) === '["glossary"]' && a.body.regenSubsections.length === 0 && /перегенерировать/.test(a.body.regenContexts.glossary));
  a = act([row({ position: 4, num: "7", addressSubsection: "Новизна и ценность", addressSection: "sum", op: "перегенерировать" })]);
  t("… у sum — подраздел (раздел sum планом не перегенерируется)", a.body.regen.length === 0 && a.body.regenSubsections[0].target === "sum:Новизна и ценность");

  a = act([row({ position: 5, num: "5а", element: "Энантиодромия", elementKind: "category", elementId: "c5", op: "удалить" })]);
  t("«удалить» с элементом → отклонена с причиной, шага нет", a.plannedIds.length === 0 && a.declined[0].code === "delete_element" && /пустая правка удалением не является/.test(a.declined[0].reason));
  a = act([row({ position: 5, num: "8", op: "удалить" })]);
  t("«удалить» без элемента → отклонена", a.declined[0]?.code === "delete_subsection");

  a = act([row({ position: 6, num: "3", addressSection: "theses", addressSubsection: "X", op: "развить" }), row({ position: 7, num: "4", addressSection: "theses", addressSubsection: "X", op: "добавить" })]);
  t("две строки об одном подразделе → ОДИН шаг с обеими рекомендациями", a.body.regenSubsections.length === 1 && a.body.regenSubsections[0].recommendations.length === 2 && a.plannedIds.length === 2);

  a = act([row({ position: 8, num: "6", addressSection: "glossary", addressSubsection: "Определения", op: "перегенерировать" }), row({ position: 9, num: "1", addressSection: "glossary", addressSubsection: "Таблица определений", op: "добавить" }), row({ position: 10, num: "9", addressSection: "glossary", element: "Разлом", elementKind: "glossary_term", elementId: "g1" })]);
  t("подраздел вливается в regen своего раздела", a.body.regen.length === 1 && a.body.regenSubsections.length === 0 && a.body.regenRecommendations.glossary.length === 2);
  t("элемент раздела, идущего на regen, отклонён", a.declined.some((d) => d.code === "section_regenerated") && a.body.elementRefines.length === 0);

  a = act([row({ position: 11, num: "2", element: "К", elementKind: "category", elementId: "c1", replacement: "т" }), row({ position: 12, num: "3", element: "К", elementKind: "category", elementId: "c1" })]);
  t("один элемент дважды → второй отклонён (исполнять по очереди)", a.body.elementEdits.length === 1 && a.declined[0]?.code === "same_target");

  const everything = act([1, 2, 3, 4, 5, 6].map((i) => row({ position: 20 + i, num: String(i), addressSection: ["graph", "theses", "glossary", "dialogue", "sum", "graph"][i - 1], addressSubsection: `П${i}`, op: i % 2 ? "развить" : "перегенерировать" })));
  const blob = JSON.stringify(everything.body);
  t("critique среди действий плана НЕ появляется (каскад — не рука)", !/"critique/.test(blob) && !everything.body.regen.includes("critique"));
  const src = readFileSync(new URL("../server/services/recommendation-planner.ts", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  t("в коде планировщика critique — только чтение прозы", (src.match(/RECOMMENDATIONS_SECTION_KEY/g) ?? []).length === 2 && !/regen\.push\((?!sec\))/.test(src));
  t("в роутах нет пути «исполнить все»", !/execute-all|executeAll|\/all["'`]/.test(readFileSync(new URL("../server/routes/recommendations.ts", import.meta.url), "utf8") + readFileSync(new URL("../server/routes/plans.ts", import.meta.url), "utf8")));

  const c = estep.cleanModelFieldValue;
  t("cleanModelFieldValue: голый текст как есть", c("конститутивное нарушение") === "конститутивное нарушение");
  t("… снимает ограду, теги, ярлык и обрамляющие ёлочки", c("```html\n<p>Новое определение: «текст  поля»</p>\n```") === "текст поля");
  t("… внутренние кавычки не трогает", c("«а» и «б»") === "«а» и «б»");
  t("… пустой ответ → null", c("  \n ") === null && c("<p></p>") === null);

  const st = (type, status = "confirmed") => ({ type, target: "x", status, cascadeGenerated: false });
  const br = steps.planCostBreakdown([st("edit_element"), st("edit_element"), st("refine_element"), st("edit_element", "skipped")], 0.0123);
  t("оценка: два edit_element — отдельной строкой, стоимость 0", br.free.steps === 2 && br.free.costUsd === 0 && br.paid.steps === 1 && br.paid.costUsd === 0.0123);
  t("countBillableSteps: edit_element и delete бесплатны, ноль — законный", exec.countBillableSteps([st("edit_element"), st("delete")]) === 0 && exec.countBillableSteps([st("edit_element"), st("refine_element"), st("regen")]) === 2);
  t("slotBillingFor: без платных шагов — бесплатный слот", exec.slotBillingFor([st("edit_element")]).free === true && exec.slotBillingFor([st("refine_element")]).units === 1);

  const body = tpl.SEED_RECOMMENDATION_TEMPLATES.find((x) => x.key === tpl.RECOMMENDATIONS_REFINE_TEMPLATE_KEY).body;
  const used = [...new Set([...body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].sort();
  const vars = Object.keys(estep.buildRefineVars({ element: { kind: "category", id: "i", name: "N", fields: { definition: "d", type: "t" } }, field: "definition", subsectionName: "S", subsectionContent: "C", note: "n" })).sort();
  t("шаблон refine ↔ buildRefineVars: плейсхолдеры сходятся в обе стороны", JSON.stringify(used) === JSON.stringify(vars) && JSON.stringify(vars) === JSON.stringify([...tpl.RECOMMENDATIONS_REFINE_PLACEHOLDERS].sort()), `${used} / ${vars}`);
  t("шаблон требует голый текст и запрещает пояснения", /ТОЛЬКО новый текст поля/.test(body) && /ЗАПРЕЩЕНЫ/.test(body));
}

const FILE = process.env.T102_FILE;
if (!FILE || !existsSync(FILE)) {
  console.log("B. живой файл — ПРОПУСК (T102_FILE не задан)");
} else {
  console.log("B. живой файл");
  const { db, closeDb, sql } = await import("../server/db/index.ts");
  const schema = await import("../server/db/schema.ts");
  const { eq, and } = await import("drizzle-orm");
  const { env } = await import("../server/env.ts");
  const { importHTML } = await import("../server/services/import-service.ts");
  const recs = await import("../server/services/recommendations.ts");
  const ep = await import("../server/services/edit-planner.ts");
  const { insertSubsectionAfter } = await import("../server/utils/html-parser.ts");
  const { getVersionHistory } = await import("../server/services/element-versioning.ts");
  const { updateCategory } = await import("../server/services/element-editor.ts");
  const tag = `t102-${Date.now().toString(36)}`;
  const [user] = await db.insert(schema.users).values({ email: `${tag}@example.test`, passwordHash: "x" }).returning();
  let synthesisId = null;
  try {
    const imp = await importHTML(readFileSync(FILE, "utf8"), user.id, "live.html");
    synthesisId = imp.synthesisId;
    const [crit] = await db.select().from(schema.sections).where(and(eq(schema.sections.synthesisId, synthesisId), eq(schema.sections.key, "critique")));
    const cats = await db.select().from(schema.categories).where(eq(schema.categories.synthesisId, synthesisId));
    const indiv = cats.find((x) => /Индивидуация-как-практика/i.test(x.name));
    t("в живом файле есть категория «Индивидуация-как-практика»", !!indiv);
    const REPL = "конститутивное нарушение грамматики, произведённое в ответ на присутствие нередуцируемого содержания";
    const rowsHtml = [
      ["1", "Таблица определений", "Самость-как-вмещение", "переопределить", "", "Новизна по отношению к источникам", "существенная"],
      ["2", "Таблица категорий", indiv.name, "уточнить формулировку", REPL, "Верность методу синтеза", "существенная"],
      ["3", "Таблица категорий", indiv.name, "развить", "", "Верность методу синтеза", "косметическая"],
      ["5а", "Таблица категорий", "Энантиодромия разлома", "удалить", "", "Верность методу синтеза", "существенная"],
      ["5б", "Таблица категорий", "Энантиодромия разлома", "переопределить", "", "Верность методу синтеза", "существенная"],
      ["7", "Новизна и ценность", "", "добавить", "", "Сохранение ценных аспектов", "косметическая"],
    ].map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("");
    const table = `<table class="doc-table"><thead><tr><th>№</th><th>Адрес</th><th>Элемент</th><th>Операция</th><th>Готовая замена</th><th>Основание</th><th>Важность</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
    const ins = insertSubsectionAfter(crit.htmlContent, "Рекомендации по улучшению", "Таблица рекомендаций", table);
    await db.update(schema.sections).set({ htmlContent: ins.html }).where(eq(schema.sections.id, crit.id));
    const parsed = await recs.parseAndStore(synthesisId);
    t("таблица разобрана, раунд 1, негодных нет", parsed.round === 1 && parsed.invalidCount === 0, JSON.stringify(parsed.rows.filter((r) => r.status === "invalid").map((r) => r.invalidReason)));

    t("довод рекомендации 2 найден в прозе", /телеологическ/i.test(planner.recommendationProseOf(crit.htmlContent, "2") ?? ""));

    // ── план из рекомендации с готовой заменой
    const res = await planner.buildPlanDraft(synthesisId, user.id, ["2"]);
    const base = res.plan.steps.filter((s) => !s.cascadeGenerated);
    t("план ['2']: один базовый шаг edit_element, confirmed", base.length === 1 && base[0].type === "edit_element" && base[0].status === "confirmed" && base[0].target === `category:${indiv.id}` && base[0].value === REPL);
    const crq = res.plan.steps.find((s) => s.type === "regen" && s.target === "critique");
    t("перегенерацию критики добавил КАСКАД сам (cascadeGenerated, pending)", !!crq && crq.cascadeGenerated === true && crq.status === "pending", JSON.stringify(res.plan.steps.map((s) => `${s.type}:${s.target}:${s.cascadeGenerated}`)));
    t("… и ровно один раз", res.plan.steps.filter((s) => s.target === "critique").length === 1);
    t("сам раздел-хозяин (graph) на перегенерацию не поставлен", !res.plan.steps.some((s) => s.type === "regen" && s.target === "graph"));
    t("бесплатное показано отдельно: free.steps=1, costUsd=0", res.plan.costBreakdown.free.steps === 1 && res.plan.costBreakdown.free.costUsd === 0);
    t("строка 2 → 'planned' с planId и stepIndex", res.planned.length === 1 && res.planned[0].status === "planned" && res.planned[0].planId === res.plan.id && res.planned[0].stepIndex === res.plan.steps.indexOf(base[0]));

    // ── PATCH в панели каскада: новые типы шагов переживают пересборку
    const idx = res.plan.steps.indexOf(base[0]);
    let upd = await ep.updatePlan(synthesisId, res.plan.id, user.id, { steps: [{ index: idx, status: "skipped" }] });
    const kept = upd.steps.find((s) => s.type === "edit_element");
    t("updatePlan: шаг edit_element пережил пересборку (значение, поле, рекомендация)", !!kept && kept.value === REPL && kept.field === "definition" && kept.recommendations?.[0]?.num === "2" && kept.status === "skipped");
    let [r2] = await db.select().from(schema.recommendations).where(eq(schema.recommendations.id, res.planned[0].id));
    t("снятый в панели шаг → рекомендация 'rejected'", r2.status === "rejected");
    t("снят единственный базовый шаг → каскад (критика) из плана ушёл", !upd.steps.some((s) => s.target === "critique"));
    upd = await ep.updatePlan(synthesisId, res.plan.id, user.id, { steps: [{ index: upd.steps.indexOf(kept), status: "confirmed" }] });
    [r2] = await db.select().from(schema.recommendations).where(eq(schema.recommendations.id, r2.id));
    t("снова подтверждён → 'planned', критика вернулась каскадом", r2.status === "planned" && upd.steps.some((s) => s.target === "critique" && s.cascadeGenerated));

    // ── раунд в работе
    const proseTouched = ins.html.replace("Следующие рекомендации являются", "Нижеследующие рекомендации являются");
    await db.update(schema.sections).set({ htmlContent: proseTouched }).where(eq(schema.sections.id, crit.id));
    const e = await throwsCode(() => recs.parseAndStore(synthesisId));
    t("проза сменилась при 'planned' → ROUND_IN_PROGRESS с планом и номерами", e?.code === "ROUND_IN_PROGRESS" && e.details.planIds[0] === res.plan.id && e.details.nums.includes("2"));
    await db.update(schema.sections).set({ htmlContent: ins.html }).where(eq(schema.sections.id, crit.id));

    // ── исполнение БЕЗ источника оплаты при принуждении
    const before = await db.select().from(schema.syntheses).where(eq(schema.syntheses.id, synthesisId));
    const enforceWas = env.billing.enforce;
    env.billing.enforce = true;
    try {
      await exec.executePlan(synthesisId, res.plan.id, user.id);
    } finally { env.billing.enforce = enforceWas; }
    const [cat] = await db.select().from(schema.categories).where(eq(schema.categories.id, indiv.id));
    t("исполнено без ключа/подписки/баланса при BILLING_ENFORCE: определение изменено", cat.definition === REPL);
    const [graph] = await db.select().from(schema.sections).where(and(eq(schema.sections.synthesisId, synthesisId), eq(schema.sections.key, "graph")));
    t("таблица категорий в документе перерисована", graph.htmlContent.includes("произведённое в ответ на присутствие"));
    const vers = await getVersionHistory(synthesisId, "category", indiv.id);
    t("версия: источник 'recommendation', origin несёт № и раунд, снимок — прежнее определение", vers[0]?.changeSource === "recommendation" && vers[0].origin?.num === "2" && vers[0].origin?.round === 1 && vers[0].origin?.stepType === "edit_element" && vers[0].origin?.planId === res.plan.id && /ради/.test(String(vers[0].data.definition)));
    const after = await db.select().from(schema.syntheses).where(eq(schema.syntheses.id, synthesisId));
    t("стоимость документа не тронута", after[0].totalCostUsd === before[0].totalCostUsd && after[0].totalInputTokens === before[0].totalInputTokens);
    const usage = await db.select().from(schema.apiUsage).where(eq(schema.apiUsage.userId, user.id));
    t("api_usage пуст — модель не звалась", usage.length === 0);
    const [planRow] = await db.select().from(schema.editPlans).where(eq(schema.editPlans.id, res.plan.id));
    const done = planRow.steps.find((s) => s.type === "edit_element");
    t("шаг done со стоимостью 0; критика осталась pending (её решает человек)", done.status === "done" && done.result.costUsd === 0 && planRow.steps.find((s) => s.target === "critique")?.status === "pending");
    [r2] = await db.select().from(schema.recommendations).where(eq(schema.recommendations.id, r2.id));
    t("рекомендация 2 → 'done'", r2.status === "done");

    // ── устаревание: строка 3 о том же элементе
    const e3 = await throwsCode(() => planner.buildPlanDraft(synthesisId, user.id, ["3"]));
    t("рекомендация 3 (тот же элемент, текст изменился) → 'stale' с предложением перечитать", e3?.code === "RECOMMENDATIONS_NOT_PLANNABLE" && e3.details.stale[0]?.num === "3" && /Перечитайте/.test(e3.message));
    let [r3] = await db.select().from(schema.recommendations).where(and(eq(schema.recommendations.synthesisId, synthesisId), eq(schema.recommendations.num, "3")));
    t("… статус в БД 'stale' (не 'invalid')", r3.status === "stale");
    const re = await recs.parseAndStore(synthesisId);
    t("после перечитки строка 3 снова 'new', раунд прежний, 2 осталась 'done'", re.newRound === false && re.rows.find((r) => r.num === "3").status === "new" && re.rows.find((r) => r.num === "2").status === "done");

    // ── удаление плана освобождает рекомендации; развилка
    const p5 = await planner.buildPlanDraft(synthesisId, user.id, ["5б", "7"]);
    t("['5б','7']: refine_element + regen_subsection «sum:Новизна и ценность»", p5.plan.steps.some((s) => s.type === "refine_element") && p5.plan.steps.some((s) => s.type === "regen_subsection" && s.target === "sum:Новизна и ценность" && !s.cascadeGenerated));
    t("… шаг элемента стоит ПЕРВЫМ", p5.plan.steps[0].type === "refine_element");
    t("… 5а не тронута: 'planned' только выбранный вариант", (await db.select().from(schema.recommendations).where(and(eq(schema.recommendations.synthesisId, synthesisId), eq(schema.recommendations.num, "5а"))))[0].status === "new");
    t("… оценка платного > 0, бесплатных шагов 0", p5.plan.costBreakdown.paid.steps >= 2 && p5.plan.estimatedCost > 0 && p5.plan.costBreakdown.free.steps === 0);
    await ep.deletePlan(synthesisId, p5.plan.id, user.id);
    const back = await db.select().from(schema.recommendations).where(eq(schema.recommendations.synthesisId, synthesisId));
    t("удаление плана: 'planned' → 'new', planId снят", back.filter((r) => ["5б", "7"].includes(r.num)).every((r) => r.status === "new" && r.planId === null));

    // ── элемент удалён между разбором и постановкой
    await db.delete(schema.categories).where(eq(schema.categories.id, cats.find((x) => /Энантиодромия/i.test(x.name)).id));
    const e5 = await throwsCode(() => planner.buildPlanDraft(synthesisId, user.id, ["5б"]));
    t("элемент удалён → шаг не создан, строка 'invalid' с причиной", e5?.code === "RECOMMENDATIONS_NOT_PLANNABLE" && /удалён из концепции/.test(e5.details.invalid[0]?.reason ?? ""));
    void updateCategory; void sql;
  } catch (err) {
    bad++;
    console.log("  ✗ исключение части B:", err?.stack ?? err);
  } finally {
    if (synthesisId) await db.delete(schema.syntheses).where(eq(schema.syntheses.id, synthesisId));
    await db.delete(schema.editPlans).where(eq(schema.editPlans.userId, user.id)).catch(() => {});
    await db.delete(schema.users).where(eq(schema.users.id, user.id)).catch((e) => console.log("уборка users:", e?.cause?.code ?? e));
  }
}

console.log(`\nИТОГ smoke-102: ${ok} ✓ / ${bad} ✗`);
try { const { closeDb } = await import("../server/db/index.ts"); await closeDb(); } catch {}
try { const { closeRedis } = await import("../server/redis.ts"); await closeRedis(); } catch {}
process.exit(bad ? 1 : 0);
