/**
 * Смоук беседы 10.3 (запрос 1) — чистые функции, без БД и браузера.
 *  A. client/utils/recommendations.ts: costKindOf (замена + элемент →
 *     бесплатно; элемент без замены → генерация; «удалить» → вручную),
 *     isSelectableRow (invalid/planned/done/manual — нет), groupForPanel
 *     (порядок таблицы, развилка по всем строкам раунда, негодные отдельно),
 *     toggleSelection (вариант развилки снимает соседний; выбор всегда
 *     поштучный — функции «выбрать все» в модуле НЕТ), estimateSelection
 *     (строки об одном подразделе → один шаг; подраздел вливается в regen
 *     раздела; второй шаг на элемент — конфликт), estimateText («N бесплатно,
 *     M платно» числом), fieldOptionsOf / kindMismatchText, pendingCount,
 *     recommendationProseOf (linkedom как DOMParser), leftoversOfError.
 *  B. Дрейф-контроль клиента с сервером: costKindOf ↔ rowsToPlanActions на
 *     одном наборе строк (free ⇔ elementEdits, paid ⇔ refine/regen, manual ⇔
 *     declined delete_*).
 *  C. Сервер (правка 10.3 по решению пользователя): validateFieldChoices —
 *     чужой id, строка без элемента, поле вне списка → VALIDATION_ERROR
 *     (details.fields); годная карта → field в elementEdits / elementRefines;
 *     без карты — field не задан (поведение 10.2).
 * Запуск: node_modules/.bin/tsx tests/smoke-103-request1.mjs
 */
import { parseHTML } from "linkedom";

let ok = 0, bad = 0;
const t = (name, cond, extra = "") => { if (cond) { ok++; console.log(`  ✓ ${name}`); } else { bad++; console.log(`  ✗ ${name} ${extra}`); } };
const J = (o) => JSON.stringify(o);
const throws = (fn) => { try { fn(); return null; } catch (e) { return e; } };

// DOMParser для recommendationProseOf — linkedom (браузера в смоуке нет)
globalThis.DOMParser = class { parseFromString(html) { return parseHTML(html).document; } };

const u = await import("../client/src/utils/recommendations.ts");
const planner = await import("../server/services/recommendation-planner.ts");

const row = (num, over = {}) => ({
  id: "id-" + num, synthesisId: "s", round: 1, num, addressSubsection: "Таблица категорий", addressSection: "graph",
  element: "Кат-" + num, elementKind: "category", elementId: "el-" + num, op: "переопределить", replacement: null,
  rationale: "Слепые пятна", severity: "существенная", status: "new", invalidReason: null, planId: null, stepIndex: null,
  createdAt: "2026-09-21T00:00:00Z", ...over,
});
const R = [
  row("1", { addressSubsection: "Таблица определений", addressSection: "glossary" }), // адрес — глоссарий, найдена категория
  row("2", { replacement: "готовый текст", op: "уточнить формулировку" }),
  row("3", { element: null, elementKind: null, elementId: null, op: "добавить", addressSubsection: "Онтологические тезисы", addressSection: "theses" }),
  row("3", { id: "id-3b", element: null, elementKind: null, elementId: null, op: "добавить", addressSubsection: "Онтологические тезисы", addressSection: "theses" }),
  row("4", { elementKind: "thesis", elementId: "th-4", element: "Э-3", op: "развить", addressSubsection: "Эпистемологические тезисы", addressSection: "theses" }),
  row("5а", { op: "удалить", element: "Энантиодромия", elementId: "el-5" }),
  row("5б", { op: "переопределить", element: "Энантиодромия", elementId: "el-5" }),
  row("6", { element: null, elementKind: null, elementId: null, op: "перегенерировать", addressSubsection: "Аналитический комментарий", addressSection: "dialogue" }),
  row("7", { element: null, elementKind: null, elementId: null, op: "развить", addressSubsection: "Новизна", addressSection: "dialogue" }),
  row("8", { status: "invalid", invalidReason: "адрес не найден", addressSection: null }),
  row("9", { status: "done" }),
];

console.log("A. чистые функции панели");
t("замена + элемент → free", u.costKindOf(R[1]) === "free");
t("элемент без замены → paid", u.costKindOf(R[0]) === "paid");
t("без элемента → paid", u.costKindOf(R[2]) === "paid");
t("«удалить» → manual", u.costKindOf(R[5]) === "manual");
t("manual не выбирается", !u.isSelectableRow(R[5]));
t("invalid/done не выбираются", !u.isSelectableRow(R[9]) && !u.isSelectableRow(R[10]));
t("new выбирается", u.isSelectableRow(R[1]));
t("«выбрать все» в модуле нет", !Object.keys(u).some((k) => /all|every/i.test(k)));

const g = u.groupForPanel(R);
t("группы open — 1,2,3,4,5,6,7 в порядке таблицы", J(g.open.map((x) => x.base)) === J(["1", "2", "3", "4", "5", "6", "7"]), J(g.open.map((x) => x.base)));
t("строки одного номера — один элемент (3 → 2 строки)", g.open[2].items[0].rows.length === 2);
t("развилка 5 — fork с двумя вариантами", g.open[4].fork && g.open[4].items.length === 2);
t("вариант 5а не выбираем, 5б — да", !g.open[4].items[0].selectable && g.open[4].items[1].selectable);
t("негодные — отдельно, done — отдельно", g.invalid.length === 1 && g.done.length === 1);
t("развилка видна и когда один вариант ушёл в работу", u.groupForPanel(R.map((r) => r.num === "5а" ? { ...r, status: "planned", planId: "p" } : r)).open.find((x) => x.base === "5").fork);
t("pendingCount по номерам: 7", u.pendingCount(R) === 7, u.pendingCount(R));

let sel = new Set();
const item = (num) => g.open.flatMap((x) => x.items).find((i) => i.num === num);
sel = u.toggleSelection(sel, item("5б"), true);
sel = u.toggleSelection(sel, { key: "5а", base: "5", variant: "а" }, true);
t("выбор второго варианта снимает первый", sel.has("5а") && !sel.has("5б"));
sel = u.toggleSelection(sel, item("2"), true);
t("обычная рекомендация не трогает развилку", sel.has("2") && sel.has("5а"));
sel = u.toggleSelection(sel, item("2"), false);
t("снятие", !sel.has("2"));

const est = (nums) => u.estimateSelection(R, new Set(nums));
t("оценка: 2 → 1 бесплатно", J(est(["2"])) === J({ free: 1, paid: 0, conflicts: [] }), J(est(["2"])));
t("оценка: 2 + 4 → 1 бесплатно, 1 платно", est(["2", "4"]).free === 1 && est(["2", "4"]).paid === 1);
t("две строки одного подраздела → один платный шаг", est(["3"]).paid === 1);
t("подраздел вливается в regen раздела (6 + 7 → 1)", est(["6", "7"]).paid === 1);
t("текст: «2 шага: 1 бесплатно, 1 платно»", u.estimateText(est(["2", "4"])) === "2 шага: 1 бесплатно, 1 платно", u.estimateText(est(["2", "4"])));
t("пусто — «Ничего не выбрано»", u.estimateText(est([])) === "Ничего не выбрано");
t("5а не считается (manual)", est(["5а"]).free + est(["5а"]).paid === 0);
const e2 = u.estimateSelection([...R, row("10", { elementId: "el-2", element: "Кат-2" })], new Set(["2", "10"]));
t("второй шаг на тот же элемент — конфликт", e2.conflicts.length === 1 && e2.free === 1);

t("поля тезиса: formulation, justification", J(u.fieldOptionsOf(R[4]).map((o) => o.field)) === J(["formulation", "justification"]));
t("поля без элемента — нет", u.fieldOptionsOf(R[2]).length === 0);
t("вид элемента — «категория»", u.elementKindText(R[0]) === "категория");
t("расхождение глоссарий/категория обнаружено", /Глоссарий/.test(u.kindMismatchText(R[0], (k) => ({ glossary: "Глоссарий", graph: "Граф" })[k] ?? k) ?? ""));
t("нет расхождения — null", u.kindMismatchText(R[1], (k) => k) === null);

const critique = `<div data-section="Рекомендации по улучшению"><h4>x</h4><p><strong>Рекомендация 1:</strong> первая.</p><p>Рекомендация 2 — вторая, длинная.</p><ol><li>а</li><li>б</li><li>третья по списку</li></ol></div>`;
t("проза по «Рекомендация 1:»", /первая/.test(u.recommendationProseOf(critique, "1") ?? ""));
t("проза по номеру с тире", /вторая/.test(u.recommendationProseOf(critique, "2") ?? ""));
t("проза N-м пунктом списка", /третья/.test(u.recommendationProseOf(critique, "3") ?? ""));
t("варианта развилки — по базе", /первая/.test(u.recommendationProseOf(critique, "1а") ?? ""));
t("нет — null", u.recommendationProseOf(critique, "9") === null);

const { ApiError } = await import("../client/src/api/client.ts");
const notPlannable = new ApiError("нет", "RECOMMENDATIONS_NOT_PLANNABLE", 422, { declined: [{ id: "id-1", num: "1", code: "x", reason: "r" }], stale: [{ num: "2" }], invalid: [] });
const left = u.leftoversOfError(notPlannable);
t("leftovers из 422", left && left.declined.length === 1 && J(left.staleNums) === J(["2"]));
t("leftovers у иной ошибки — null", u.leftoversOfError(new Error("x")) === null);
t("notFoundReasonOf no_table", u.notFoundReasonOf(new ApiError("", "NOT_FOUND", 404, { reason: "no_table" })) === "no_table");
t("severityChipOf блокирующая", u.severityChipOf("Блокирующая") === "chip-hard-conflict");

console.log("B. дрейф клиент ↔ сервер (пометка стоимости против перевода в план)");
const srvRows = R.filter((r) => r.status === "new").map((r) => ({ ...r, position: 1, sourceHash: null, roundHash: "h" }));
const draft = planner.rowsToPlanActions(srvRows, () => null, ["sum", "graph", "theses", "glossary", "dialogue", "critique"]);
const editIds = new Set(draft.body.elementEdits.map((a) => a.recommendations[0].id));
const refineIds = new Set(draft.body.elementRefines.map((a) => a.recommendations[0].id));
const declinedDel = new Set(draft.declined.filter((d) => d.code.startsWith("delete")).map((d) => d.id));
let drift = 0;
for (const r of srvRows) {
  const k = u.costKindOf(r);
  const srv = editIds.has(r.id) ? "free" : refineIds.has(r.id) ? "paid" : declinedDel.has(r.id) ? "manual" : "paid";
  if (k !== srv) drift++;
}
t("пометки клиента совпадают с судьбой строк у планировщика", drift === 0, "расхождений " + drift);
t("оценка клиента = шаги планировщика (без каскада)", u.estimateSelection(srvRows, new Set(srvRows.map((r) => u.numKey(r.num)))).free === draft.body.elementEdits.length && u.estimateSelection(srvRows, new Set(srvRows.map((r) => u.numKey(r.num)))).paid === draft.body.elementRefines.length + draft.body.regenSubsections.length + draft.body.regen.length);

console.log("C. сервер: поле элемента по выбору человека");
const chosen = srvRows;
const bad1 = throws(() => planner.validateFieldChoices({ "чужой": "definition" }, chosen));
t("чужой id → VALIDATION_ERROR details.fields", bad1?.code === "VALIDATION_ERROR" && !!bad1.details?.fields);
const bad2 = throws(() => planner.validateFieldChoices({ "id-3": "definition" }, chosen));
t("строка без элемента → отказ", bad2?.code === "VALIDATION_ERROR");
const bad3 = throws(() => planner.validateFieldChoices({ "id-4": "origin" }, chosen));
t("поле вне списка вида → отказ с allowed", bad3?.code === "VALIDATION_ERROR" && J(bad3.details?.allowed) === J(["formulation", "justification"]));
t("не объект → отказ", throws(() => planner.validateFieldChoices(["x"], chosen))?.code === "VALIDATION_ERROR");
const good = planner.validateFieldChoices({ "id-4": "justification", "id-2": "origin" }, chosen);
t("годная карта принята", good.get("id-4") === "justification" && good.get("id-2") === "origin");
t("undefined → пустая карта", planner.validateFieldChoices(undefined, chosen).size === 0);
const withFields = planner.rowsToPlanActions(srvRows, () => null, ["graph", "theses", "glossary", "dialogue"], good);
t("edit_element получил field=origin", withFields.body.elementEdits.find((a) => a.elementId === "el-2")?.field === "origin");
t("refine_element получил field=justification", withFields.body.elementRefines.find((a) => a.elementId === "th-4")?.field === "justification");
t("без карты field не задан (10.2)", draft.body.elementEdits.every((a) => a.field === undefined) && draft.body.elementRefines.every((a) => a.field === undefined));

console.log(`\nИТОГ smoke-103: ${ok} ✓ / ${bad} ✗`);
process.exit(bad ? 1 : 0);
