/**
 * Смоук беседы 12.3 (запрос 1) — планы, рекомендации, биллинг, реестр: долги
 * Д-6, Д-7, Д-11, Д-12, Д-13, Д-18, Д-19, Д-20, Д-21, Д-32, Д-46, Д-47. Часть A — без БД
 * (чистые функции); часть B — живая БД и Redis (свои строки, чужого не
 * трогаем), мок Stripe — tools/stripe-mock.mjs в этом же процессе; модель не
 * зовётся нигде.
 *  A. Д-7: isTakenStep / planCostBreakdown / planCascadePending / toApiPlan —
 *     оценка по взятым шагам, pending отдельным полем.
 *     Д-12: isNoSuchCustomerError — только STRIPE_ERROR resource_missing о
 *     customer.
 *     Д-13: critiqueHasInterlayer — условие адаптивного подраздела.
 *     Д-20: estimateExtractFromSizes — вход по размеру запроса, выход — один
 *     подраздел критики.
 *     Д-21: rationaleWarning — годное основание (кавычки, §, несколько
 *     подразделов), чужое, пустое, самоссылка, вырожденная критика.
 *     Д-32: отказы планировщика под ru / en / de — оборот и метка раздела;
 *     опись msg-режима видит довод decline() и addHint(), причины сторожа
 *     (reasons.push — данные БД) не трогает.
 *     Д-46: каждая находка сторожа рендерится на ru / en / de; русский вид
 *     дословно равен фразам 10.1 / 10.2 / 12.3; разбор колонки jsonb
 *     отбрасывает чужое; строка без кодов отдаёт сохранённый текст.
 *     Д-21 (свой повтор): recommendationsTableGap — нет прозы, таблица
 *     пропущена, негодна, пуста, на месте.
 *     Д-47: findMissingSubsections / missingSubsectionsNote — пропуск одного
 *     и двух, skip, опознание по месту (11.1), нечёткое имя, изменённые
 *     названия, раздел без карты.
 *  B. Д-21: разбор — строка с чужим основанием остаётся new, замечание в
 *     warning, строка ставится в план.
 *     Д-46: в БД коды и русский вид; GET под en / de отдаёт фразу на языке
 *     запроса; причина «адресат исчез» планировщика — кодом; замечание
 *     переживает перевод строки в invalid.
 *     Д-11: три сценария ключа раунда — А → А; А → (Б не разобрана) → А;
 *     А → Б (разобрана) → А; А → (Б отклонена 409 при planned) → А.
 *     Д-7 и Д-6: план «1 бесплатно + каскадные» — estimatedCost 0,
 *     cascadePending с оценкой; исполнение — одно plan_updated со статусом
 *     done при СВОБОДНОМ слоте (поддельное WS-соединение).
 *     Д-13: карта подразделов ≡ заданию критики; пропуск адаптивного
 *     подраздела виден учёту подразделов (пауза 1.4b); страховка 11.1 по
 *     позиции работает при составе с диалогом (прежде отключалась).
 *     Д-19: contextBudgetForDepth ≡ активному конфигу context_budget.
 *     Д-20: estimateExtractCost — без следа в api_usage и без слота.
 *     Д-12: мок Stripe — удалить клиента → пополнение проходит, колонка
 *     перезаписана; иной отказ и повторный «No such customer» пробрасываются.
 *     Д-18: resetRegistryCache — ключ кэша сброшен при живом Redis; при
 *     мёртвом — строка «НЕ сброшен», посев не падает (дочерний процесс).
 * Запуск: node_modules/.bin/tsx tests/smoke-123-request1.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.DATABASE_URL ??= "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-secret-123";
process.env.ANTHROPIC_API_KEY ??= "sk-test-not-used";
const STRIPE_PORT = 3923;
process.env.STRIPE_SECRET_KEY = "sk_test_mock123";
process.env.STRIPE_API_BASE = `http://127.0.0.1:${STRIPE_PORT}`;

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let ok = 0, bad = 0;
const t = (name, cond, extra = "") => { if (cond) { ok++; console.log(`  ✓ ${name}`); } else { bad++; console.log(`  ✗ ${name} ${typeof extra === "string" ? extra : JSON.stringify(extra)}`); } };
const J = (v) => JSON.stringify(v);
const CYR = /[А-Яа-яЁё]/;

const ES = await import("@philosynth/shared/constants/edit-steps");
const K = await import("@philosynth/shared/constants/recommendations");
const EP = await import("../server/services/edit-planner.ts");
const PE = await import("../server/services/plan-executor.ts");
const REC = await import("../server/services/recommendations.ts");
const RP = await import("../server/services/recommendation-planner.ts");
const SC = await import("../server/services/stripe-client.ts");
const SUB = await import("../server/services/subscription-service.ts");
const BIL = await import("../server/services/billing-service.ts");
const SDB = await import("../server/services/section-defs-builder.ts");
const CE = await import("../server/services/cost-estimator.ts");
const GEN = await import("../server/services/generation-service.ts");
const HP = await import("../server/utils/html-parser.ts");
const SL = await import("../server/i18n/locale.ts");
const RI = await import("../server/services/recommendation-issues.ts");
const LIB = await import("../scripts/i18n/ui-strings-lib.mjs");
const { createStripeMock } = await import("../tools/stripe-mock.mjs");

/* ══ A. Без БД ═══════════════════════════════════════════════════════════ */
console.log("A. чистые функции");
{
  // Д-7
  const st = (status, type = "regen", target = "graph") => ({ type, target, status, cascadeGenerated: status === "pending" });
  const steps = [st("confirmed", "edit_element", "category:c1"), st("confirmed"), st("pending", "regen", "critique"), st("pending", "regen_mode", "adversarial:0"), st("skipped", "regen", "theses")];
  const bd = ES.planCostBreakdown(steps, 0.42);
  t("Д-7: costBreakdown считает только взятые шаги (1 бесплатно · 1 платно)", bd.free.steps === 1 && bd.free.costUsd === 0 && bd.paid.steps === 1 && bd.paid.costUsd === 0.42, bd);
  const cp = ES.planCascadePending(steps, 0.9);
  t("Д-7: cascadePending — число ждущих шагов и их оценка", cp.steps === 2 && cp.costUsd === 0.9, cp);
  t("Д-7: взятые — confirmed / running / done / failed; не взятые — pending и skipped", ["confirmed", "running", "done", "failed"].every((s) => ES.isTakenStep({ status: s })) && !ES.isTakenStep({ status: "pending" }) && !ES.isTakenStep({ status: "skipped" }) && ES.isPendingStep({ status: "pending" }) && !ES.isPendingStep({ status: "confirmed" }));
  const api = EP.toApiPlan({ id: "p", synthesisId: "s", status: "draft", currentStep: 0, steps, createdAt: new Date(0) }, { taken: 0.42, pending: 0.9 });
  t("Д-7: toApiPlan — estimatedCost по взятым, pending отдельным полем", api.estimatedCost === 0.42 && api.costBreakdown.paid.costUsd === 0.42 && J(api.cascadePending) === J({ steps: 2, costUsd: 0.9 }), api);
  const allDone = steps.map((s) => (s.status === "confirmed" ? { ...s, status: "done" } : s));
  t("Д-7: исполнение прогноз взятого не обнуляет (done остаётся в разбивке)", ES.planCostBreakdown(allDone, 0.42).paid.steps === 1 && ES.planCostBreakdown(allDone, 0.42).free.steps === 1);

  // Д-12
  const E = SC.StripeError;
  t("Д-12: «No such customer» по param", SC.isNoSuchCustomerError(new E("STRIPE_ERROR", "No such customer: 'cus_1'", 400, "resource_missing", "customer")));
  t("Д-12: «No such customer» по тексту (param не пришёл)", SC.isNoSuchCustomerError(new E("STRIPE_ERROR", "No such customer: 'cus_1'", 400, "resource_missing")));
  t("Д-12: иной resource_missing (price) — не он", !SC.isNoSuchCustomerError(new E("STRIPE_ERROR", "No such price: 'p'", 400, "resource_missing", "price")));
  t("Д-12: недоступность Stripe, отказ карты, чужая ошибка — не он", !SC.isNoSuchCustomerError(new E("STRIPE_UNAVAILABLE", "No such customer", 503)) && !SC.isNoSuchCustomerError(new E("STRIPE_ERROR", "Card declined", 402, "card_declined", "customer")) && !SC.isNoSuchCustomerError(new Error("No such customer")));

  // Д-13
  t("Д-13: адаптивный подраздел — при диалоге и хотя бы одном формальном разделе", SDB.critiqueHasInterlayer(["dialogue", "graph"]) && SDB.critiqueHasInterlayer(["dialogue", "glossary"]) && SDB.critiqueHasInterlayer(["theses", "dialogue"]) && !SDB.critiqueHasInterlayer(["dialogue"]) && !SDB.critiqueHasInterlayer(["graph", "theses", "glossary"]) && !SDB.critiqueHasInterlayer([]) && !SDB.critiqueHasInterlayer(null));
  t("Д-13: название — одно на задание и карту", SDB.CRITIQUE_INTERLAYER_SUBSECTION === "Межслойная согласованность");

  // Д-20
  const subs = ["Слепые пятна", K.RECOMMENDATIONS_PROSE_SUBSECTION];
  const e1 = REC.estimateExtractFromSizes({ sysChars: 2000, promptChars: 10000, depth: "standard", critiqueSubsections: subs });
  const e2 = REC.estimateExtractFromSizes({ sysChars: 2000, promptChars: 40000, depth: "standard", critiqueSubsections: subs });
  const e3 = REC.estimateExtractFromSizes({ sysChars: 2000, promptChars: 10000, depth: "standard", critiqueSubsections: [...subs, K.RECOMMENDATIONS_TABLE_SUBSECTION] });
  t("Д-20: оценка ретрофита положительна (вход, выход, цена)", e1.inTokens > 0 && e1.outTokens > 0 && e1.cost > 0, e1);
  t("Д-20: вход растёт с запросом, выход от него не зависит", e2.inTokens > e1.inTokens && e2.cost > e1.cost && e2.outTokens === e1.outTokens, [e1, e2]);
  t("Д-20: таблица в счёте подразделов — один раз (есть она в документе или нет)", e3.outTokens === e1.outTokens);
  t("Д-20: квота ретрофита названа константой", REC.EXTRACT_QUOTA === "regenerations");

  // Д-21
  const crit = ["Внутренняя когерентность", "Слепые пятна", "Итоговая оценка", K.RECOMMENDATIONS_PROSE_SUBSECTION, K.RECOMMENDATIONS_TABLE_SUBSECTION];
  const rw = (x) => REC.rationaleWarning(x, crit);
  t("Д-21: точное название — замечания нет", rw("Слепые пятна") === null);
  t("Д-21: кавычки, «§», регистр — замечания нет", rw("«Слепые пятна»") === null && rw("§ слепые пятна") === null);
  t("Д-21: несколько подразделов («;», «,», союз «и») — замечания нет", rw("Слепые пятна; Итоговая оценка") === null && rw("Слепые пятна, Итоговая оценка") === null && rw("Слепые пятна и Итоговая оценка") === null);
  t("Д-21: чужой подраздел — замечание с его названием и перечнем годных", !!rw("Неизвестный подраздел")?.includes("«Неизвестный подраздел»") && rw("Неизвестный подраздел").includes("«Слепые пятна»") && rw("Неизвестный подраздел").includes("не мешает"), rw("Неизвестный подраздел"));
  t("Д-21: из нескольких названо только чужое", rw("Слепые пятна; Чужой")?.includes("«Чужой»") && !rw("Слепые пятна; Чужой").startsWith("основание «Слепые пятна»"), rw("Слепые пятна; Чужой"));
  t("Д-21: чужое название с запятой или союзом не рвётся на куски", !!rw("Подраздел, которого нет")?.includes("«Подраздел, которого нет»") && !!rw("Форма и содержание")?.includes("«Форма и содержание»"), [rw("Подраздел, которого нет"), rw("Форма и содержание")]);
  t("Д-21: два чужих через «;» названы оба, годный между ними — нет", !!rw("Чужой А; Слепые пятна; Чужой Б")?.includes("«Чужой А», «Чужой Б»"), rw("Чужой А; Слепые пятна; Чужой Б"));
  t("Д-21: пустое основание — замечание", !!rw("")?.includes("не указано") && !!rw("  ")?.includes("не указано"));
  t("Д-21: основанием названы сами рекомендации — замечание", !!rw(K.RECOMMENDATIONS_PROSE_SUBSECTION)?.includes("сами рекомендации"), rw(K.RECOMMENDATIONS_PROSE_SUBSECTION));
  t("Д-21: вырожденная критика (сверять не с чем) — молчит", REC.rationaleWarning("что угодно", []) === null && REC.rationaleWarning("что угодно", [K.RECOMMENDATIONS_PROSE_SUBSECTION]) === null);

  // Д-32
  SL.installServerCatalogProvider();
  const row = (o) => ({ id: "i" + o.position, synthesisId: "s", round: 1, roundHash: "h", num: "1", addressSubsection: "Определения", addressSection: "glossary", element: null, elementKind: null, elementId: null, op: "развить", replacement: null, rationale: "Р", severity: "существенная", status: "new", invalidReason: null, warning: null, sourceHash: "x", planId: null, stepIndex: null, createdAt: new Date(0), ...o });
  const set = [
    row({ position: 1, num: "1", op: "перегенерировать" }),
    row({ position: 2, num: "2", element: "Разлом", elementKind: "glossary_term", elementId: "g1", addressSubsection: "Таблица определений" }),
    row({ position: 3, num: "3", addressSection: "graph", addressSubsection: "Таблица категорий", element: "К", elementKind: "category", elementId: "c1", op: "удалить" }),
    row({ position: 4, num: "4", addressSection: "graph", addressSubsection: "Таблица категорий", element: "М", elementKind: "category", elementId: "c2", replacement: "т" }),
    row({ position: 5, num: "5", addressSection: "graph", addressSubsection: "Таблица категорий", element: "М", elementKind: "category", elementId: "c2" }),
    row({ position: 6, num: "6", addressSection: "theses", addressSubsection: "Онтологические тезисы", op: "удалить" }),
    row({ position: 7, num: "7", addressSection: "theses", addressSubsection: "Сводная таблица тезисов", element: "О-1", elementKind: "thesis", elementId: "t1", op: "удалить" }),
    row({ position: 8, num: "8", addressSection: "glossary", addressSubsection: "Таблица определений", element: "Зазор", elementKind: "glossary_term", elementId: "g2", op: "удалить" }),
    row({ position: 9, num: "9", addressSection: null, addressSubsection: "Нет раздела" }),
  ];
  const order = ["sum", "graph", "theses", "glossary", "critique"];
  const declinedIn = (lang) => (lang === "ru" ? RP.rowsToPlanActions(set, () => null, order) : SL.runWithLocale(lang, () => RP.rowsToPlanActions(set, () => null, order))).declined;
  const ru = declinedIn("ru"), en = declinedIn("en"), de = declinedIn("de");
  const by = (list, code, num) => list.find((x) => x.code === code && (num === undefined || x.num === num))?.reason ?? "";
  t("Д-32: фикстура даёт все пять кодов отказа", J([...new Set(ru.map((x) => x.code))].sort()) === J(["delete_element", "delete_subsection", "no_address", "same_target", "section_regenerated"]), ru.map((x) => x.code));
  t("Д-32: ru — тексты отказов прежние", by(ru, "section_regenerated").includes("Раздел «Глоссарий терминов» этим же планом перегенерируется целиком") && by(ru, "same_target").includes("уже правит рекомендация 4 этого плана") && by(ru, "delete_subsection").includes("Поправьте «Онтологические тезисы» вручную") && by(ru, "no_address").includes("нет раздела-адресата"), ru.map((x) => x.reason));
  t("Д-32: ru — род элемента в отказе удаления: категории / тезиса / термина", by(ru, "delete_element", "3").includes("шага удаления категории") && by(ru, "delete_element", "7").includes("шага удаления тезиса") && by(ru, "delete_element", "8").includes("шага удаления термина"));
  const outsideQuotes = (s) => s.replace(/[«“„][^»”“]*[»”“]/g, "");
  for (const [lang, list] of [["en", en], ["de", de]]) {
    t(`Д-32: ${lang} — набор и порядок отказов тот же`, J(list.map((x) => [x.code, x.num])) === J(ru.map((x) => [x.code, x.num])));
    t(`Д-32: ${lang} — ни один отказ не остался русским (вне названий в кавычках)`, list.every((x, i) => x.reason !== ru[i].reason && !CYR.test(outsideQuotes(x.reason))), list.map((x) => x.reason));
    t(`Д-32: ${lang} — метка раздела переведена (tData по месту показа)`, !by(list, "section_regenerated").includes("Глоссарий") && by(list, "section_regenerated").length > 20, by(list, "section_regenerated"));
  }
  t("Д-32: en — оборот и метка", by(en, "section_regenerated").includes("“Glossary of terms”") && by(en, "delete_element", "3").includes("deleting a category") && by(en, "delete_element", "7").includes("deleting a thesis") && by(en, "delete_element", "8").includes("deleting a term"), en.map((x) => x.reason));
  t("Д-32: de — род элемента в родительном падеже", by(de, "delete_element", "3").includes("Löschen einer Kategorie") && by(de, "delete_element", "7").includes("Löschen einer These") && by(de, "delete_element", "8").includes("Löschen eines Begriffs"), de.map((x) => x.reason));
  t("Д-32: константа KEY_LABELS осталась русской (перевод — только по месту показа)", (await import("@philosynth/shared/constants/section-labels")).KEY_LABELS.glossary === "Глоссарий терминов");

  // Д-46: находки кодами → фраза на языке запроса
  {
    const sample = {
      num_invalid: { num: "х" }, address_empty: {}, address_not_found: { address: "Определения", near: ["Таблица определений"] }, address_in_critique: { address: "Слепые пятна" },
      address_ambiguous: { address: "Введение", sections: ["graph", "theses"] }, element_not_found: { element: "Разлом" }, op_not_allowed: { op: "улучшить", allowed: [...K.RECOMMENDATION_OPS] },
      severity_not_allowed: { severity: "важная", allowed: [...K.RECOMMENDATION_SEVERITIES] }, row_duplicate: {}, target_element_gone: { element: "Разлом" }, target_subsection_gone: { subsection: "Определения" },
      rationale_empty: { subsections: ["Слепые пятна"] }, rationale_self: { names: [K.RECOMMENDATIONS_PROSE_SUBSECTION], subsections: ["Слепые пятна"] }, rationale_unknown: { names: ["Чужой"], subsections: ["Слепые пятна", "Итоговая оценка"] },
    };
    t("Д-46: образцы покрывают все коды находок", J(Object.keys(sample).sort()) === J([...K.RECOMMENDATION_ISSUE_CODES].sort()));
    const ruWant = {
      num_invalid: "№ «х» не номер рекомендации (ожидается «5», «5а», «5б»)",
      address_empty: "адрес пуст: рекомендация обязана называть подраздел документа",
      address_not_found: "подраздела «Определения» в документе нет (похожие: «Таблица определений»)",
      address_in_critique: "«Слепые пятна» — подраздел самой критики: адресом рекомендации он быть не может",
      address_ambiguous: "адрес «Введение» неоднозначен: такой подраздел есть в разделах «Граф категорий» и «Корпус тезисов»",
      element_not_found: "элемент «Разлом» не найден среди категорий, тезисов и терминов концепции",
      op_not_allowed: "операция «улучшить» вне закрытого списка: " + K.RECOMMENDATION_OPS.join(" | "),
      severity_not_allowed: "важность «важная» вне закрытого списка: " + K.RECOMMENDATION_SEVERITIES.join(" | "),
      row_duplicate: "строка повторяет предыдущую (тот же №, адрес и элемент)",
      target_element_gone: "адресат не найден при постановке плана: элемент «Разлом» удалён из концепции после разбора",
      target_subsection_gone: "адресат не найден при постановке плана: подраздел «Определения» исчез из документа после разбора",
      rationale_empty: "основание не указано: контракт требует название подраздела критики, где проблема установлена («Слепые пятна»)",
      rationale_self: "основанием названы сами рекомендации («Рекомендации по улучшению»): проблема устанавливается в подразделах критики до них («Слепые пятна»)",
      rationale_unknown: "основание «Чужой» — не подраздел критики этого документа (есть: «Слепые пятна», «Итоговая оценка»). Исполнению строки это не мешает",
    };
    const levelOf = (code) => (code.startsWith("rationale_") ? "warning" : "invalid");
    const outside = (x) => x.replace(/[«“„][^»”“]*[»”“]/g, "");
    let ruOk = true, trOk = true, ruColumnOk = true;
    const bad = [];
    for (const code of K.RECOMMENDATION_ISSUE_CODES) {
      const it = RI.issue(levelOf(code), code, sample[code]);
      const ru = RI.renderIssue(it);
      if (ru !== ruWant[code]) { ruOk = false; bad.push(`ru ${code}: ${ru}`); }
      for (const lang of ["en", "de"]) {
        const x = SL.runWithLocale(lang, () => RI.renderIssue(it));
        // закрытые списки операций и важности — машинные значения документа: остаются русскими
        const body = code === "op_not_allowed" || code === "severity_not_allowed" ? x.slice(0, x.lastIndexOf(":")) : x;
        if (x === ru || CYR.test(outside(body).replace(/5[аб]/g, "")) || /\{\w+\}/.test(x)) { trOk = false; bad.push(`${lang} ${code}: ${x}`); }
        if (SL.runWithLocale(lang, () => RI.renderIssuesRu([it], it.level)) !== ru) ruColumnOk = false;
      }
    }
    t("Д-46: русский вид каждой находки дословно равен фразам 10.1 / 10.2 / 12.3", ruOk, bad);
    t("Д-46: en и de — фраза переведена, названия из документа и машинные значения целы", trOk, bad);
    t("Д-46: вид для колонок БД — русский при любом языке запроса", ruColumnOk);
    const amb = RI.issue("invalid", "address_ambiguous", sample.address_ambiguous);
    t("Д-46: разделы хранятся ключами, показываются меткой на языке запроса", SL.runWithLocale("en", () => RI.renderIssue(amb)).includes("“Category graph” and “Thesis corpus”") && SL.runWithLocale("de", () => RI.renderIssue(amb)).includes(" und "), SL.runWithLocale("de", () => RI.renderIssue(amb)));
    t("Д-46: несколько находок уровня — через «; », чужой уровень не подмешивается", RI.renderIssues([RI.issue("invalid", "address_empty"), RI.issue("warning", "rationale_empty", { subsections: ["С"] }), RI.issue("invalid", "row_duplicate")], "invalid") === ruWant.address_empty + "; " + ruWant.row_duplicate && RI.renderIssues([RI.issue("invalid", "address_empty")], "warning") === null);
    const col = RI.issuesFromColumn([{ level: "invalid", code: "address_empty", params: {} }, { level: "invalid", code: "нет-такого", params: {} }, { level: "чужой", code: "address_empty" }, null, "x", { level: "warning", code: "rationale_unknown", params: { names: ["Ч", 5], subsections: "С", extra: { a: 1 } } }]);
    t("Д-46: разбор колонки отбрасывает чужие уровни, коды и формы параметров", col.length === 2 && J(col[1].params) === J({ names: ["Ч"], subsections: "С" }) && RI.issuesFromColumn(null).length === 0 && RI.issuesFromColumn("строка").length === 0, col);
    t("Д-46: строка без кодов уровня отдаёт сохранённый текст, с кодами — фразу из кодов", RI.issueTextFor([], "invalid", "прежний текст") === "прежний текст" && RI.issueTextFor([RI.issue("invalid", "address_empty")], "invalid", "прежний текст") === ruWant.address_empty && RI.issueTextFor([], "warning", null) === null);
    // сторож: коды и русский вид согласованы по построению
    const doc = { subsectionsBySection: { graph: ["Таблица категорий"], critique: ["Слепые пятна", K.RECOMMENDATIONS_PROSE_SUBSECTION, K.RECOMMENDATIONS_TABLE_SUBSECTION] }, actualNameOf: (_k, n) => n, lookupWarnings: [], categories: [], theses: [], terms: [], subsectionSource: () => "исходник" };
    const g = REC.guardRows([
      { position: 1, num: "1", address: "Таблица категорий", element: "", op: "развить", replacement: "", rationale: "Слепые пятна", severity: "косметическая" },
      { position: 2, num: "х", address: "", element: "Нет", op: "улучшить", replacement: "", rationale: "Чужой", severity: "важная" },
    ], doc);
    t("Д-46: годная строка — без находок, обе колонки текста пусты", g[0].status === "new" && g[0].issues.length === 0 && g[0].invalidReason === null && g[0].warning === null, g[0]);
    t("Д-46: негодная строка — все причины кодами, замечание рядом; статус решают только причины", g[1].status === "invalid" && J(g[1].issues.map((x) => `${x.level}:${x.code}`)) === J(["invalid:num_invalid", "invalid:address_empty", "invalid:element_not_found", "invalid:op_not_allowed", "invalid:severity_not_allowed", "warning:rationale_unknown"]), g[1].issues.map((x) => x.code));
    t("Д-46: текст колонок — русский вид тех же кодов", g[1].invalidReason === RI.renderIssues(g[1].issues, "invalid") && g[1].warning === RI.renderIssues(g[1].issues, "warning") && g[1].invalidReason.split("; ").length === 5);
  }

  // Д-21 (свой повтор): чего не хватает критике
  {
    const tblOf = (rowsHtml) => `<table class="doc-table"><thead><tr>${K.RECOMMENDATION_COLUMNS.map((c) => `<th>${c.header}</th>`).join("")}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
    const subx = (n, b) => `<div data-section="${n}"><h4>${n}</h4>${b}</div>`;
    const prose = subx(K.RECOMMENDATIONS_PROSE_SUBSECTION, "<p>Рекомендация 1: уточнить.</p>");
    const T = K.RECOMMENDATIONS_TABLE_SUBSECTION;
    const gap = (inner) => REC.recommendationsTableGap(`<div class="doc-section"><div class="doc-content">${inner}</div></div>`);
    const row1 = "<tr><td>1</td><td>Таблица категорий</td><td></td><td>развить</td><td></td><td>Слепые пятна</td><td>косметическая</td></tr>";
    t("Д-21: нет прозы рекомендаций — составлять не из чего", gap(subx("Слепые пятна", "<p>x</p>")) === "no_prose");
    t("Д-21: проза есть, подраздела таблицы нет — «пропущена»", gap(prose) === "missing");
    t("Д-21: подраздел без таблицы и таблица без столбцов контракта — «негодна»", gap(prose + subx(T, "<p>таблицы нет</p>")) === "broken" && gap(prose + subx(T, '<table class="doc-table"><thead><tr><th>№</th><th>Адрес</th></tr></thead><tbody><tr><td>1</td><td>x</td></tr></tbody></table>')) === "broken");
    t("Д-21: пустая таблица с верными столбцами — ответ модели, не пропуск", gap(prose + subx(T, tblOf(""))) === "none");
    t("Д-21: таблица на месте — повтор не нужен", gap(prose + subx(T, tblOf(row1))) === "none");
    t("Д-21: строка генлога таблицы — ключом подраздела", REC.RECOMMENDATIONS_TABLE_LOG_KEY === "critique:Таблица рекомендаций");
  }

  // Д-47: сверка подразделов после удачного ответа
  {
    const subx = (n, b = "<p>текст</p>") => `<div data-section="${n}"><h4>${n}</h4>${b}</div>`;
    const EXP = ["Первый подраздел", "Второй подраздел", "Третий подраздел"];
    const full = EXP.map((n) => subx(n)).join("\n");
    t("Д-47: все подразделы на месте — пропусков нет, пометки нет", GEN.findMissingSubsections(full, EXP).length === 0 && GEN.missingSubsectionsNote(full, EXP) === null);
    const two = subx(EXP[0]) + subx(EXP[2]);
    const n1 = GEN.missingSubsectionsNote(two, EXP);
    t("Д-47: пропущен один — назван он, счёт «ожидалось 3, размечено 2», единственное число", J(GEN.findMissingSubsections(two, EXP)) === J([EXP[1]]) && n1 === "модель завершила ответ, не написав подраздел «Второй подраздел» (ожидалось подразделов: 3, размечено: 2). Раздел сохранён как есть — перегенерируйте его, если подраздел нужен", n1);
    const n2 = GEN.missingSubsectionsNote(subx(EXP[1]), EXP);
    t("Д-47: пропущены два — множественное число, оба названы по порядку карты", !!n2 && n2.includes("не написав подразделы «Первый подраздел», «Третий подраздел» (ожидалось подразделов: 3, размечено: 1)") && n2.endsWith("если подразделы нужны"), n2);
    t("Д-47: skip — о названном подразделе уже сказано другой пометкой", GEN.missingSubsectionsNote(two, EXP, [EXP[1]]) === null && J(GEN.findMissingSubsections(subx(EXP[1]), EXP, [EXP[0]])) === J([EXP[2]]));
    // страховка 11.1: модель перевела атрибуты, число подразделов сошлось — опознаны по месту
    const translated = ["First subsection", "Second subsection", "Third subsection"].map((n) => subx(n)).join("");
    t("Д-47: переведённые названия при совпавшем числе — опознаны по месту, не пропуск", GEN.findMissingSubsections(translated, EXP).length === 0);
    // нечёткое совпадение исходника: «Таблица» ⊂ «Таблица категорий»
    t("Д-47: нечёткое имя (как у всех читателей документа) — не пропуск", GEN.findMissingSubsections(subx("Первый подраздел (уточнённый)") + subx(EXP[1]) + subx(EXP[2]), EXP).length === 0);
    // названия изменены И число не сошлось: подразделы написаны, но служба их не узнаёт
    const renamed = ["First", "Second", "Third", "Fourth"].map((n) => subx(n)).join("");
    const n3 = GEN.missingSubsectionsNote(renamed, EXP);
    t("Д-47: размечено не меньше ожидаемого, но имён нет — «по названию не найдены», без совета перегенерировать", !!n3 && n3.startsWith("модель завершила ответ, но подразделы «Первый подраздел», «Второй подраздел», «Третий подраздел» по названию не найдены (ожидалось подразделов: 3, размечено: 4) — вероятно, названия изменены") && !n3.includes("перегенерируйте"), n3);
    t("Д-47: ни одного размеченного подраздела — названы все", GEN.findMissingSubsections("<p>сплошной текст</p>", EXP).length === 3);
    t("Д-47: раздел без карты подразделов и пустой HTML — сверять нечего", GEN.missingSubsectionsNote(full, []) === null && GEN.missingSubsectionsNote("", EXP) === null);
  }

  // Д-32: опись msg-режима
  const dir = mkdtempSync(join(tmpdir(), "ps123-"));
  try {
    const f = join(dir, "probe.ts");
    writeFileSync(f, [
      "declare function decline(r: unknown, code: string, reason: string): void;",
      "declare function addHint(text: string): void;",
      "declare const reasons: string[];",
      "export function probe(r: unknown): void {",
      '  decline(r, "code", "Русский отказ без tl");',
      '  addHint("Русская подсказка без tl");',
      '  reasons.push("причина сторожа — данные БД");',
      '  const local = "просто строка";',
      "  void local;",
      "}",
    ].join("\n"));
    const texts = LIB.extractFile(f, "msg").entries.map((e) => e.text);
    t("Д-32: опись видит довод decline() сообщением", texts.includes("Русский отказ без tl"), texts);
    t("Д-32: опись видит довод addHint() сообщением", texts.includes("Русская подсказка без tl"), texts);
    t("Д-32: причины сторожа (reasons.push) и прочие строки опись не трогает", !texts.includes("причина сторожа — данные БД") && !texts.includes("просто строка") && !texts.includes("code"), texts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ══ B. Живая БД ═════════════════════════════════════════════════════════ */
console.log("B. живая БД, Redis, мок Stripe");
const { db, schema, closeDb } = await import("../server/db/index.ts");
const { and, eq } = await import("drizzle-orm");
const { getConfig, getTemplate } = await import("../server/services/prompt-registry.ts");
const { connectionManager } = await import("../server/ws/connection-manager.ts");
const redisMod = await import("../server/redis.ts");
const tag = "s123-" + Math.random().toString(36).slice(2, 8);
const tbl = (h, rows) => `<table class="doc-table"><thead><tr>${h.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const sub = (n, b) => `<div data-section="${n}"><h4>${n}</h4>${b}</div>`;
const wrap = (b) => `<div class="doc-section"><div class="section-title">T</div><div class="doc-content">${b}</div></div>`;
const H = K.RECOMMENDATION_COLUMNS.map((c) => c.header);
const ROWS = [
  ["1", "Таблица категорий", "Бытие", "уточнить формулировку", "новое определение бытия", "Слепые пятна", "существенная"],
  ["2", "Методология построения графа", "", "развить", "", "Подраздел, которого нет", "косметическая"],
  ["3", "Методология построения графа", "", "развить", "", "«Слепые пятна»; Итоговая оценка", "косметическая"],
  ["4", "Таблица категорий", "Ничто", "развить", "", "", "косметическая"],
];
const critiqueOf = (lead) => wrap(sub("Слепые пятна", "<p>Проза.</p>") + sub("Итоговая оценка", "<p>Итог.</p>") + sub(K.RECOMMENDATIONS_PROSE_SUBSECTION, `<p>${lead}</p><p><strong>Рекомендация 1:</strong> довод первой.</p>`) + sub(K.RECOMMENDATIONS_TABLE_SUBSECTION, tbl(H, ROWS)));
const GRAPH = wrap(sub("Методология построения графа", "<p>Метод.</p>") + sub("Таблица категорий", tbl(["Категория", "Тип", "Определение"], [["Бытие", "онтологическая", "то, что есть"], ["Ничто", "онтологическая", "то, чего нет"]])));

const [owner] = await db.insert(schema.users).values({ email: `${tag}@smoke.local`, passwordHash: "x" }).returning({ id: schema.users.id });
const ids = [];
const stripeMock = createStripeMock({ port: STRIPE_PORT, bearer: "sk_test_mock123", paymentIntentStatus: "succeeded", log: () => {} });
const fake = { send: () => {}, raw: undefined };
/** Свой синтез с графом и критикой редакции lead. */
async function fresh(lead) {
  const [syn] = await db.insert(schema.syntheses).values({ userId: owner.id, seed: tag, title: tag, status: "ready", sectionOrder: ["graph", "critique"] }).returning({ id: schema.syntheses.id });
  ids.push(syn.id);
  const secs = await db.insert(schema.sections).values([
    { synthesisId: syn.id, key: "graph", sectionNum: 1, title: "Граф", htmlContent: GRAPH },
    { synthesisId: syn.id, key: "critique", sectionNum: 2, title: "Критика", htmlContent: critiqueOf(lead) },
  ]).returning({ id: schema.sections.id, key: schema.sections.key });
  const cats = await db.insert(schema.categories).values([
    { synthesisId: syn.id, name: "Бытие", type: "онтологическая", definition: "то, что есть", position: 0 },
    { synthesisId: syn.id, name: "Ничто", type: "онтологическая", definition: "то, чего нет", position: 1 },
  ]).returning({ id: schema.categories.id });
  const critId = secs.find((x) => x.key === "critique").id;
  return { id: syn.id, catId: cats[0].id, setProse: (l) => db.update(schema.sections).set({ htmlContent: critiqueOf(l) }).where(eq(schema.sections.id, critId)) };
}
const codeOf = async (fn) => { try { await fn(); return ""; } catch (e) { return e?.code ?? String(e); } };

try {
  await redisMod.connectRedis();
  await stripeMock.start();

  /* ── Д-21: основание — замечание, не отказ ── */
  const D = await fresh("Редакция А.");
  const p1 = await REC.parseAndStore(D.id);
  t("Д-21: строка с чужим «Основанием» остаётся new, негодных нет", p1.invalidCount === 0 && p1.rows.every((r) => r.status === "new"), p1.rows.map((r) => [r.num, r.status, r.invalidReason]));
  t("Д-21: замечание — в warning этой строки, с названием и перечнем годных", !!p1.rows[1].warning?.includes("«Подраздел, которого нет»") && p1.rows[1].warning.includes("«Итоговая оценка»") && p1.rows[1].invalidReason === null, p1.rows[1].warning);
  t("Д-21: годное основание (одно и несколько) — warning null", p1.rows[0].warning === null && p1.rows[2].warning === null);
  t("Д-21: пустое основание — замечание, строка годна", !!p1.rows[3].warning?.includes("не указано") && p1.rows[3].status === "new");
  const listed = await REC.listRecommendations(D.id);
  t("Д-21: GET отдаёт то же замечание", listed.rows[1].warning === p1.rows[1].warning);
  const [dbRow] = await db.select().from(schema.recommendations).where(and(eq(schema.recommendations.synthesisId, D.id), eq(schema.recommendations.num, "2")));
  t("Д-21: замечание лежит в колонке warning (миграция 0012), invalid_reason пуст", dbRow.warning === p1.rows[1].warning && dbRow.invalidReason === null);
  // Д-46: коды в БД, фраза на языке запроса
  t("Д-46: находки строки лежат в recommendations.issues кодами", J((dbRow.issues ?? []).map((x) => `${x.level}:${x.code}`)) === J(["warning:rationale_unknown"]) && J(dbRow.issues[0].params.names) === J(["Подраздел, которого нет"]), dbRow.issues);
  for (const lang of ["en", "de"]) {
    const rows = (await SL.runWithLocale(lang, () => REC.listRecommendations(D.id))).rows;
    t(`Д-46: GET под ${lang} — замечание на языке запроса, название подраздела как в документе`, !!rows[1].warning && rows[1].warning !== p1.rows[1].warning && !CYR.test(rows[1].warning.replace(/[«“„][^»”“]*[»”“]/g, "")) && rows[1].warning.includes("Подраздел, которого нет") && rows[1].issues[0]?.code === "rationale_unknown", rows[1].warning);
  }
  t("Д-46: ответ разбора несёт коды рядом с фразой", p1.rows[1].issues.length === 1 && p1.rows[1].issues[0].level === "warning" && p1.rows[0].issues.length === 0);
  const planW = await RP.buildPlanDraft(D.id, owner.id, ["2"]);
  t("Д-21: строка с замечанием исполнима — ставится в план", planW.planned.length === 1 && planW.planned[0].num === "2" && planW.plan.steps.some((s) => s.type === "regen_subsection" && s.target === "graph:Методология построения графа"), planW.declined);
  await EP.deletePlan(D.id, planW.plan.id, owner.id);
  // ручная починка таблицы снимает замечание в том же раунде (warning всегда свежее)
  await db.update(schema.sections).set({ htmlContent: critiqueOf("Редакция А.").replace("<td>Подраздел, которого нет</td>", "<td>Итоговая оценка</td>") }).where(and(eq(schema.sections.synthesisId, D.id), eq(schema.sections.key, "critique")));
  const p1b = await REC.parseAndStore(D.id);
  t("Д-21: починка «Основания» в таблице снимает замечание без нового раунда", !p1b.newRound && p1b.round === 1 && p1b.rows[1].warning === null && p1b.rows[1].id === p1.rows[1].id, [p1b.newRound, p1b.rows[1].warning]);

  /* ── Д-20: оценка ретрофита без модели ── */
  const est = await REC.estimateExtractCost(D.id);
  t("Д-20: оценка ретрофита по живому документу — вход, выход, цена, квота", est.estimate.inTokens > 0 && est.estimate.outTokens > 0 && est.estimate.cost > 0 && est.quota.type === "regenerations" && est.quota.units === 1, est);
  const req = await REC.buildExtractRequest(D.id);
  t("Д-20: вход оценки — точный размер запроса, который ушёл бы модели (SYS + промпт)", est.estimate.inTokens === REC.estimateExtractFromSizes({ sysChars: req.SYS.length, promptChars: req.prompt.length, depth: req.depth, critiqueSubsections: req.critiqueSubsections }).inTokens && req.prompt.includes("ПЕРЕЛОЖИТЬ в таблицу"));
  const usage = await db.select({ id: schema.apiUsage.id }).from(schema.apiUsage).where(eq(schema.apiUsage.userId, owner.id));
  t("Д-20: модель не звана, слот не занят, раунд не тронут", usage.length === 0 && !GEN.isGenerationActive(D.id) && (await REC.listRecommendations(D.id)).round === 1);
  const E0 = await fresh("x");
  await db.delete(schema.sections).where(and(eq(schema.sections.synthesisId, E0.id), eq(schema.sections.key, "critique")));
  t("Д-20: нет критики → тот же отказ, что у ретрофита (NOT_FOUND)", (await codeOf(() => REC.estimateExtractCost(E0.id))) === "NOT_FOUND");

  /* ── Д-11: ключ раунда ── */
  {
    const S1 = await fresh("Редакция А.");
    const a1 = await REC.parseAndStore(S1.id);
    const a2 = await REC.parseAndStore(S1.id);
    t("Д-11 (1) А → А: раунд прежний, строки те же", a1.newRound && a1.round === 1 && !a2.newRound && a2.round === 1 && J(a2.rows.map((r) => r.id)) === J(a1.rows.map((r) => r.id)));
    // (2) Б была в документе, но НЕ разобрана; проза вернулась к А
    await S1.setProse("Редакция Б."); await S1.setProse("Редакция А.");
    const a3 = await REC.parseAndStore(S1.id);
    t("Д-11 (2) А → (Б не разобрана) → А: раунд прежний — сохранённый раунд и есть этот текст", !a3.newRound && a3.round === 1 && J(a3.rows.map((r) => r.id)) === J(a1.rows.map((r) => r.id)), [a3.round, a3.newRound]);
    // (3) Б разобрана: возврат к А открывает третий раунд
    await db.update(schema.recommendations).set({ status: "done" }).where(and(eq(schema.recommendations.synthesisId, S1.id), eq(schema.recommendations.num, "1")));
    await S1.setProse("Редакция Б.");
    const b = await REC.parseAndStore(S1.id);
    await S1.setProse("Редакция А.");
    const a4 = await REC.parseAndStore(S1.id);
    t("Д-11 (3) А → Б (разобрана) → А: Б — раунд 2, возврат к А — раунд 3", b.newRound && b.round === 2 && a4.newRound && a4.round === 3, [b.round, a4.round, a4.newRound]);
    t("Д-11 (3) статусы первого раунда на третий НЕ наследуются (done первой редакции не оживает)", a4.rows.every((r) => r.status === "new") && (await REC.listRecommendations(S1.id, 1)).rows[0].status === "done");
    // (4) Б отклонена 409 (в раунде есть planned), проза вернулась к А
    const S2 = await fresh("Редакция А.");
    await REC.parseAndStore(S2.id);
    const pl = await RP.buildPlanDraft(S2.id, owner.id, ["1"]);
    await S2.setProse("Редакция Б.");
    const refused = await codeOf(() => REC.parseAndStore(S2.id));
    await S2.setProse("Редакция А.");
    const back = await REC.parseAndStore(S2.id);
    t("Д-11 (4) А → (Б отклонена: ROUND_IN_PROGRESS) → А: раунд прежний, planned цел", refused === "ROUND_IN_PROGRESS" && !back.newRound && back.round === 1 && back.rows[0].status === "planned" && back.rows[0].planId === pl.plan.id, [refused, back.round, back.rows[0].status]);
    await EP.deletePlan(S2.id, pl.plan.id, owner.id);
  }

  /* ── Д-46: «адресат исчез» при постановке плана — кодом ── */
  {
    const S = await fresh("Редакция А.");
    await REC.parseAndStore(S.id);
    await db.delete(schema.categories).where(and(eq(schema.categories.synthesisId, S.id), eq(schema.categories.name, "Ничто")));
    let err = null;
    try { await SL.runWithLocale("en", () => RP.buildPlanDraft(S.id, owner.id, ["4"])); } catch (e) { err = e; }
    const [row4] = await db.select().from(schema.recommendations).where(and(eq(schema.recommendations.synthesisId, S.id), eq(schema.recommendations.num, "4")));
    t("Д-46: исчезнувший элемент → отказ постановки, строка invalid", err?.code === "RECOMMENDATIONS_NOT_PLANNABLE" && row4.status === "invalid", [err?.code, row4.status]);
    t("Д-46: причина — кодом target_element_gone; замечание об основании при строке осталось", J(row4.issues.map((x) => `${x.level}:${x.code}`)) === J(["invalid:target_element_gone", "warning:rationale_empty"]) && row4.issues[0].params.element === "Ничто", row4.issues);
    t("Д-46: в колонке invalid_reason — русский вид, хотя запрос шёл под en", row4.invalidReason === "адресат не найден при постановке плана: элемент «Ничто» удалён из концепции после разбора" && !!row4.warning?.startsWith("основание не указано"), row4.invalidReason);
    const reason = err?.details?.invalid?.[0]?.reason ?? "";
    t("Д-46: в ответе отказа причина — на языке запроса", reason.startsWith("the target was not found when the plan was drafted: the element “Ничто”") && !CYR.test(reason.replace(/[«“„][^»”“]*[»”“]/g, "")), reason);
    const ruRow = (await REC.listRecommendations(S.id)).rows.find((r) => r.num === "4");
    t("Д-46: GET по-русски отдаёт ту же причину русской фразой", ruRow.invalidReason === row4.invalidReason && ruRow.status === "invalid");
    // перечитка: строка снова проверяется сторожем — «элемент не найден» кодом сторожа
    const re = await REC.parseAndStore(S.id);
    const again = re.rows.find((r) => r.num === "4");
    t("Д-46: перечитка заменяет причину планировщика причиной сторожа (element_not_found)", again.status === "invalid" && J(again.issues.map((x) => x.code)) === J(["element_not_found", "rationale_empty"]), again.issues);
  }

  /* ── Д-7 и Д-6: оценка без pending; done после слота ── */
  {
    const S = await fresh("Редакция А.");
    await REC.parseAndStore(S.id);
    const res = await RP.buildPlanDraft(S.id, owner.id, ["1"]);
    const pend = res.plan.steps.filter((s) => s.status === "pending");
    t("Д-7: фикстура — бесплатный взятый шаг и каскадный pending критики", res.plan.steps.some((s) => s.type === "edit_element" && s.status === "confirmed") && pend.some((s) => s.target === "critique" && s.cascadeGenerated), res.plan.steps.map((s) => [s.type, s.target, s.status]));
    t("Д-7: estimatedCost = 0 — взят только бесплатный шаг; платных в разбивке нет", res.plan.estimatedCost === 0 && res.plan.costBreakdown.paid.steps === 0 && res.plan.costBreakdown.paid.costUsd === 0 && res.plan.costBreakdown.free.steps === 1, [res.plan.estimatedCost, res.plan.costBreakdown]);
    t("Д-7: cascadePending — столько шагов, сколько ждут решения, и их оценка > 0", res.plan.cascadePending.steps === pend.length && res.plan.cascadePending.costUsd > 0, res.plan.cascadePending);
    const [synRow] = await db.select().from(schema.syntheses).where(eq(schema.syntheses.id, S.id));
    const split = await EP.estimatePlanCostSplit(S.id, synRow, [], res.plan.steps);
    const allConfirmed = res.plan.steps.map((s) => (s.status === "pending" ? { ...s, status: "confirmed" } : s));
    const full = await EP.estimatePlanCostSplit(S.id, synRow, [], allConfirmed);
    t("Д-7: «если подтвердить все» — взятое + pending = оценке плана с подтверждёнными каскадными", Math.abs(split.taken + split.pending - full.taken) < 1e-9 && full.pending === 0 && split.pending === res.plan.cascadePending.costUsd, [split, full]);
    t("Д-7: estimatePlanCost — взятая часть", (await EP.estimatePlanCost(S.id, synRow, [], res.plan.steps)) === split.taken);
    const got = await EP.getPlan(S.id, res.plan.id, owner.id);
    t("Д-7: GET плана отдаёт ту же оценку", J([got.estimatedCost, got.costBreakdown, got.cascadePending]) === J([res.plan.estimatedCost, res.plan.costBreakdown, res.plan.cascadePending]));
    const ci = res.plan.steps.findIndex((s) => s.status === "pending" && s.target === "critique");
    const upd = await EP.updatePlan(S.id, res.plan.id, owner.id, { steps: [{ index: ci, status: "confirmed" }] });
    t("Д-7: подтверждённый каскадный шаг переходит из pending в оценку", upd.estimatedCost > 0 && upd.costBreakdown.paid.steps === 1 && upd.cascadePending.steps === upd.steps.filter((s) => s.status === "pending").length && upd.cascadePending.steps < pend.length, [upd.estimatedCost, upd.costBreakdown, upd.cascadePending]);
    const back = await EP.updatePlan(S.id, res.plan.id, owner.id, { steps: [{ index: upd.steps.findIndex((s) => s.target === "critique"), status: "skipped" }] });
    t("Д-7: снятый шаг — ни в оценке, ни в pending", back.estimatedCost === 0 && back.costBreakdown.paid.steps === 0 && !back.steps.some((s) => s.target === "critique" && s.status === "pending"), [back.estimatedCost, back.cascadePending]);

    // Д-6: исполнение (модель не зовётся — edit_element), plan_updated ловит поддельное соединение
    const seen = [];
    fake.send = (payload) => {
      const m = JSON.parse(payload);
      if (m.type === "plan_updated") seen.push({ status: m.plan.status, active: GEN.isGenerationActive(S.id), cascadePending: m.plan.cascadePending, estimatedCost: m.plan.estimatedCost });
    };
    connectionManager.add(owner.id, fake);
    await PE.executePlan(S.id, res.plan.id, owner.id);
    t("Д-6: исполнение дало ровно одно plan_updated, статус done", seen.length === 1 && seen[0].status === "done", seen);
    t("Д-6: в момент plan_updated слот СВОБОДЕН — следующий запрос под гейтом не получит 409", seen.length > 0 && seen.every((x) => x.active === false), seen);
    t("Д-6: после исполнения слот свободен, план done в БД", !GEN.isGenerationActive(S.id) && (await EP.getPlan(S.id, res.plan.id, owner.id)).status === "done");
    t("Д-7: plan_updated несёт раздельную оценку", seen[0]?.estimatedCost === 0 && typeof seen[0]?.cascadePending?.steps === "number", seen[0]);
    const [after] = await db.select().from(schema.categories).where(eq(schema.categories.id, S.catId));
    t("Д-6: план исполнен (определение изменено), следующий запрос под гейтом проходит", after.definition === "новое определение бытия" && (await codeOf(() => REC.parseAndStore(S.id))) === "");
    connectionManager.remove(fake);
  }

  /* ── Д-13: карта подразделов критики ≡ заданию ── */
  {
    const P = { seed: "s", phil: ["Кант"], participants: [{ type: "philosopher", name: "Кант" }], method: "dialectical", synthLevel: "comparative", depth: "standard", generationOrder: "architectural", extGraphMetrics: false, ctx: "", lang: "Russian", keepFullBudget: false };
    const I = SDB.CRITIQUE_INTERLAYER_SUBSECTION;
    const withDlg = { ...P, sec: ["graph", "dialogue", "critique"] };
    const map = (await SDB.buildSubsectionMap(withDlg)).critique;
    const task = (await SDB.buildSectionDefs(withDlg)).find((x) => x.key === "critique").parts.subsections.map((x) => x.name);
    t("Д-13: при диалоге и графе карта критики ≡ подразделам задания", J(map) === J(task), [map, task]);
    t("Д-13: «Межслойная согласованность» — вторым пунктом, один раз", map[1] === I && map.filter((n) => n === I).length === 1);
    const noDlg = { ...P, sec: ["graph", "critique"] };
    const map0 = (await SDB.buildSubsectionMap(noDlg)).critique;
    t("Д-13: без диалога подраздела нет ни в карте, ни в задании", !map0.includes(I) && J(map0) === J((await SDB.buildSectionDefs(noDlg)).find((x) => x.key === "critique").parts.subsections.map((x) => x.name)));
    t("Д-13: карта с подразделом = карта без него + одна вставка (прочее не тронуто)", J(map.filter((n) => n !== I)) === J(map0));
    const cfg = await getConfig("subsection_map");
    t("Д-13: конфиг subsection_map и генерат не менялись — подраздела в них нет", !J(cfg).includes(I) && !(await import("node:fs")).readFileSync(ROOT + "server/config/subsection-map.ts", "utf8").includes(I));
    // симптом 1 — пауза 1.4b: пропуск подраздела виден учёту подразделов
    const htmlOf = (names) => wrap(names.map((n) => sub(n, "<p>текст</p>")).join(""));
    const seenOf = (html, expected) => GEN.parseSubsectionsFromHTML(html, expected).map((x) => x.name);
    const skipped = htmlOf(map.filter((n) => n !== I));
    const missNew = map.filter((n) => !seenOf(skipped, map).includes(n));
    const missOld = map0.filter((n) => !seenOf(skipped, map0).includes(n));
    t("Д-13: модель пропустила адаптивный подраздел → он среди недостающих (прежняя карта пропуска не видела)", J(missNew) === J([I]) && missOld.length === 0, [missNew, missOld]);
    t("Д-13: подраздел написан → учтён в прогрессе", seenOf(htmlOf(map), map).includes(I) && !seenOf(htmlOf(map), map0).includes(I));
    // симптом 2 — страховка 11.1 по позиции: число подразделов документа и карты теперь сходится
    const translated = HP.parseFragment(htmlOf(map.map((n) => (n === "Слепые пятна" ? "Blind spots" : n))));
    const byNew = HP.resolveSubsection(translated, "Слепые пятна", map);
    const byOld = HP.resolveSubsection(translated, "Слепые пятна", map0);
    t("Д-13: переведённый атрибут опознаётся по месту при составе с диалогом", byNew.el !== null && byNew.byPosition && byNew.actualName === "Blind spots", byNew.warning);
    t("Д-13: с прежней картой опознание по месту отключалось (число не сходилось)", byOld.el === null && /опознать по месту нельзя/.test(byOld.warning ?? ""), byOld.warning);
  }

  /* ── Д-19: бюджет контекста ── */
  {
    const budgets = await getConfig("context_budget");
    const depths = Object.keys(budgets);
    const got = await Promise.all(depths.map((d) => CE.contextBudgetForDepth(d)));
    t("Д-19: contextBudgetForDepth ≡ активному конфигу context_budget по всем глубинам", depths.length >= 3 && depths.every((d, i) => got[i] === budgets[d]), [budgets, got]);
    t("Д-19: неизвестная глубина → запасное значение оценщика", (await CE.contextBudgetForDepth("нет")) === CE.DEFAULT_CONTEXT_BUDGET && CE.DEFAULT_CONTEXT_BUDGET === 48000);
  }

  /* ── Д-12: удалённый в Stripe Customer переоткрывается ── */
  {
    const auth = { authorization: "Bearer sk_test_mock123" };
    const customerOf = async () => (await db.select({ c: schema.users.stripeCustomerId }).from(schema.users).where(eq(schema.users.id, owner.id)))[0].c;
    const first = await BIL.createTopup(owner.id, 5);
    const cus1 = await customerOf();
    t("Д-12: первое пополнение завело Customer и записало колонку", !!first.clientSecret && !!cus1 && stripeMock.state.customers.length === 1, [first, cus1]);
    const del = await fetch(`http://127.0.0.1:${STRIPE_PORT}/v1/customers/${cus1}`, { method: "DELETE", headers: auth });
    const delBody = await del.json();
    t("Д-12: мок — DELETE /v1/customers/:id отвечает deleted: true", del.status === 200 && delBody.deleted === true && stripeMock.state.deletedCustomers.has(cus1), delBody);
    const direct = await fetch(`http://127.0.0.1:${STRIPE_PORT}/v1/payment_intents`, { method: "POST", headers: { ...auth, "content-type": "application/x-www-form-urlencoded" }, body: `amount=500&currency=usd&customer=${cus1}` });
    const directBody = await direct.json();
    t("Д-12: мок — вызов с удалённым клиентом → 400 resource_missing, param customer", direct.status === 400 && directBody.error.code === "resource_missing" && directBody.error.param === "customer" && /No such customer/.test(directBody.error.message), directBody);
    const before = stripeMock.state.requests.length;
    const second = await BIL.createTopup(owner.id, 5);
    const cus2 = await customerOf();
    const trail = stripeMock.state.requests.slice(before).map((r) => `${r.method} ${r.url}`);
    t("Д-12: пополнение после удаления клиента ПРОХОДИТ", !!second.clientSecret && second.paymentIntentId !== first.paymentIntentId, second);
    t("Д-12: колонка перезаписана новым Customer", !!cus2 && cus2 !== cus1 && stripeMock.state.customers.length === 2, [cus1, cus2]);
    t("Д-12: ход — отказ, новый Customer, ОДИН повтор", J(trail) === J(["POST /v1/payment_intents", "POST /v1/customers", "POST /v1/payment_intents"]), trail);
    const pi = [...stripeMock.state.pis.values()].at(-1);
    t("Д-12: PaymentIntent заведён под НОВЫМ клиентом", pi?.customer === cus2, pi);
    // иной отказ — пробрасывается без сброса колонки
    let calls = 0;
    const other = await codeOf(() => SUB.withStripeCustomer(owner.id, async () => { calls++; throw new SC.StripeError("STRIPE_ERROR", "No such price: 'p'", 400, "resource_missing", "price"); }));
    t("Д-12: иной отказ Stripe пробрасывается сразу, колонка цела", other === "STRIPE_ERROR" && calls === 1 && (await customerOf()) === cus2);
    // повторный «No such customer» — один повтор, не цикл
    calls = 0;
    const loop = await codeOf(() => SUB.withStripeCustomer(owner.id, async (id) => { calls++; throw new SC.StripeError("STRIPE_ERROR", `No such customer: '${id}'`, 400, "resource_missing", "customer"); }));
    const cus3 = await customerOf();
    t("Д-12: повторный «No such customer» — ровно один повтор, затем отказ", loop === "STRIPE_ERROR" && calls === 2 && !!cus3 && cus3 !== cus2, [loop, calls]);
    // сброс условный: чужой (уже сменившийся) id колонку не трогает
    t("Д-12: сброс колонки условный — устаревший id её не обнуляет", (await SUB.resetStripeCustomer(owner.id, cus1)) === false && (await customerOf()) === cus3);
    const health = await (await fetch(`http://127.0.0.1:${STRIPE_PORT}/__mock/health`)).json();
    t("Д-12: мок считает удалённых клиентов в health", health.counts?.deletedCustomers === 1, health);
  }

  /* ── Д-18: сиды сбрасывают кэш реестра ── */
  {
    const key = "stop_signal";
    await getTemplate(key); // кладёт ключ в кэш Redis
    const redis = redisMod.redis ?? redisMod.getRedis?.();
    const cacheKey = `prompt_cache:${key}`;
    const had = redis ? await redis.exists(cacheKey) : -1;
    const probe = (extraEnv) => {
      const code = `const m = await import(${J(ROOT + "scripts/seed/cache-reset.ts")}); const r = await m.resetRegistryCache([${J(key)}]); console.log("REPORT " + JSON.stringify(r)); const z = await m.resetRegistryCache([]); console.log("EMPTY " + JSON.stringify(z)); const x = await m.resetTaxonomyCache(0); console.log("TAX0 " + JSON.stringify(x));`;
      const r = spawnSync(ROOT + "node_modules/.bin/tsx", ["--input-type=module", "-e", code], { cwd: ROOT, env: { ...process.env, ...extraEnv }, encoding: "utf8", timeout: 60000 });
      const pick = (label) => { const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith(label + " ")); return line ? JSON.parse(line.slice(label.length + 1)) : null; };
      return { status: r.status, report: pick("REPORT"), empty: pick("EMPTY"), tax0: pick("TAX0"), err: (r.stderr ?? "").slice(-400) };
    };
    const live = probe({});
    const left = redis ? await redis.exists(cacheKey) : -1;
    t("Д-18: при живом Redis ключ кэша реестра сброшен, отчёт говорит об этом", had === 1 && left === 0 && live.status === 0 && live.report?.ok === true && live.report.reset === 1 && /сброшено ключей — 1/.test(live.report.line) && /без перезапуска/.test(live.report.line), [had, left, live]);
    t("Д-18: изменений нет (повторный посев, одни skip) — сбрасывать нечего, Redis не трогается", live.empty?.ok === true && live.empty.reset === 0 && /сбрасывать нечего/.test(live.empty.line) && live.tax0?.ok === true);
    const dead = probe({ REDIS_URL: "redis://127.0.0.1:6399" });
    t("Д-18: при мёртвом Redis посев НЕ падает (fail-open), в отчёте — «НЕ сброшен» и что делать", dead.status === 0 && dead.report?.ok === false && dead.report.reset === 0 && /НЕ сброшен/.test(dead.report.line) && /перезапустите сервер/.test(dead.report.line), dead);
    const fs = await import("node:fs");
    for (const f of ["seed-prompts.ts", "seed-configs.ts", "seed-taxonomy.ts"]) t(`Д-18: ${f} сбрасывает кэш после посева`, /import \{ reset(Registry|Taxonomy)Cache \} from "\.\/cache-reset\.js";/.test(fs.readFileSync(ROOT + "scripts/seed/" + f, "utf8")) && /console\.log\(cache\.line\);/.test(fs.readFileSync(ROOT + "scripts/seed/" + f, "utf8")));
    for (const f of ["philosynth-ubuntu.sh", "philosynth-termux.sh"]) t(`Д-18: deploy/${f} предупреждает о перезапуске только по строке сида «НЕ сброшен»`, /grep -q "НЕ сброшен\\\|НЕ ПОЛНОСТЬЮ" "\$seed_log"/.test(fs.readFileSync(ROOT + "deploy/" + f, "utf8")));
  }
} catch (e) {
  bad++;
  console.log("  ✗ ИСКЛЮЧЕНИЕ:", e?.stack ?? e);
} finally {
  connectionManager.remove(fake);
  for (const id of ids) await db.delete(schema.syntheses).where(eq(schema.syntheses.id, id)).catch(() => {});
  await db.delete(schema.users).where(eq(schema.users.id, owner.id)).catch(() => {});
  await stripeMock.stop().catch(() => {});
}

console.log(`\nИТОГ: ${ok} ✓ / ${bad} ✗`);
try { await closeDb(); } catch {}
try { await redisMod.closeRedis(); } catch {}
process.exit(bad ? 1 : 0);
