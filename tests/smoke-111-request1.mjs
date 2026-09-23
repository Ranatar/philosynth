#!/usr/bin/env node
/**
 * smoke-111-request1.mjs — смоук первого запроса беседы 11.1 (защита
 * машинных значений при нерусской генерации). Чистые функции, без БД и
 * браузера: надстройка lang-templates поверх генерата, снятие отступления
 * для байтовой сверки, направление связи, роли, страховка опознания
 * подраздела по позиции. Запуск: node_modules/.bin/tsx tests/smoke-111-request1.mjs
 */
import {
  LANG_CLOSED_LIST_PHRASES,
  LANG_DATA_SECTION_RULE_MARKER,
  LANG_INSTRUCTION_ADDENDUM,
  LANG_MACHINE_VALUES_RULE_MARKER,
  applyLangTemplateOverrides,
  stripLangInstructionAddendum,
} from "../server/config/lang-templates.ts";
import { SEED_PROMPT_TEMPLATES } from "../server/config/prompt-templates.ts";
import { SEED_SECTION_TEMPLATES } from "../server/config/section-templates.ts";
import {
  RECOMMENDATIONS_TABLE_TEMPLATE_KEY,
  SEED_RECOMMENDATION_TEMPLATES,
  applyRecommendationTemplateOverrides,
} from "../server/config/recommendation-templates.ts";
import {
  EDGE_DIRECTIONS,
  ROLE_MAP,
  normalizeEdgeDirection,
  parseGraphFromHTML,
} from "../server/services/graph-parser.ts";
import { resolveSubsection, findSubsection } from "../server/services/generation-service.ts";
import { parseFragment } from "../server/utils/html-parser.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? "\n    " + detail : ""}`); }
};

/* ── 1. Надстройка поверх генерата ── */
console.log("═══ 1. system.lang_instruction: надстройка ═══");
const gen = SEED_PROMPT_TEMPLATES.find((t) => t.key === "system.lang_instruction");
ok("генерат несёт правило data-section дословно", gen && gen.body.includes(LANG_DATA_SECTION_RULE_MARKER));
ok("генерат НЕ правлен рукой (правила 11.1 в нём нет)", gen && !gen.body.includes(LANG_MACHINE_VALUES_RULE_MARKER));
const seeded = applyLangTemplateOverrides(SEED_PROMPT_TEMPLATES);
const li = seeded.find((t) => t.key === "system.lang_instruction");
ok("посевное тело начинается с прежнего текста дословно", li.body.startsWith(gen.body.replace(/\s*$/, "")));
ok("посевное тело несёт оба правила", li.body.includes(LANG_DATA_SECTION_RULE_MARKER) && li.body.includes(LANG_MACHINE_VALUES_RULE_MARKER));
ok("добавка ровно одна", li.body.split(LANG_INSTRUCTION_ADDENDUM).length === 2);
ok("хвост — те же два перевода строки", li.body.endsWith("\n\n"));
ok("остальные шаблоны генерата не тронуты", seeded.filter((t) => t.key !== "system.lang_instruction").every((t, i) => t === SEED_PROMPT_TEMPLATES.filter((x) => x.key !== "system.lang_instruction")[i]));
ok("идемпотентность applyLangTemplateOverrides", JSON.stringify(applyLangTemplateOverrides(seeded)) === JSON.stringify(seeded));
let threw = false;
try { applyLangTemplateOverrides(SEED_PROMPT_TEMPLATES.filter((t) => t.key !== "system.lang_instruction")); } catch { threw = true; }
ok("без ключа в генерате — исключение, не молчание", threw);
threw = false;
try { applyLangTemplateOverrides([{ key: "system.lang_instruction", body: "чужой текст", description: "" }]); } catch { threw = true; }
ok("без правила data-section в генерате — исключение", threw);
ok("{{lang}} остаётся плейсхолдером в добавке", LANG_INSTRUCTION_ADDENDUM.includes("{{lang}}") && !LANG_INSTRUCTION_ADDENDUM.includes("English"));
for (const ph of LANG_CLOSED_LIST_PHRASES) ok(`правило называет оборот «${ph}»`, LANG_INSTRUCTION_ADDENDUM.includes(ph));
ok("правило покрывает заголовки столбцов и имена категорий в таблице связей",
  /header cells/.test(LANG_INSTRUCTION_ADDENDUM) && /Таблица связей/.test(LANG_INSTRUCTION_ADDENDUM) && /Таблица категорий/.test(LANG_INSTRUCTION_ADDENDUM));

/* ── 2. Снятие отступления (для smoke-12) ── */
console.log("\n═══ 2. stripLangInstructionAddendum ═══");
const rendered = li.body.split("{{lang}}").join("English") + "ЯДРО";
const st = stripLangInstructionAddendum(rendered, "English");
ok("снимается ровно и на месте", st.departed && st.text === gen.body.split("{{lang}}").join("English") + "ЯДРО");
ok("без отступления — departed:false и текст цел", !stripLangInstructionAddendum("нет добавки", "English").departed);

/* ── 3. Покрытие строгих шаблонов ── */
console.log("\n═══ 3. Обороты «СТРОГО» в section.* ═══");
const bodies = [...applyRecommendationTemplateOverrides(SEED_SECTION_TEMPLATES), ...SEED_RECOMMENDATION_TEMPLATES]
  .filter((t) => t.key.startsWith("section."))
  .filter((t) => /СТРОГО/.test(t.body));
ok(`строгих шаблонов ≥ 6 (найдено ${bodies.length})`, bodies.length >= 6);
const uncovered = [];
for (const t of bodies) for (const line of t.body.match(/[^\n]*СТРОГО[^\n]*/g) ?? []) {
  if (!LANG_CLOSED_LIST_PHRASES.some((ph) => line.includes(ph)) && !/СТРОГОЕ СООТВЕТСТВИЕ|Оформить строго/.test(line)) uncovered.push(`${t.key}: ${line.trim().slice(0, 60)}`);
}
ok("каждый оборот закрытого списка покрыт правилом", uncovered.length === 0, uncovered.join("\n    "));
const recTable = SEED_RECOMMENDATION_TEMPLATES.find((t) => t.key === RECOMMENDATIONS_TABLE_TEMPLATE_KEY).body;
ok("оговорка 10.1 на месте и не противоречит общему правилу", /машинные ключи[^\n]*при любом языке документа/.test(recTable));

/* ── 4. Направление и роли ── */
console.log("\n═══ 4. graph-parser: направление, роли ═══");
ok("EDGE_DIRECTIONS — три русских значения контракта", EDGE_DIRECTIONS.join("|") === "однонаправленная|двунаправленная|рефлексивная");
ok("русские значения опознаются", ["Однонаправленная", "двунаправленная ", "рефлексивная (петля)"].every((s) => normalizeEdgeDirection(s).recognized));
ok("bidirectional → не опознано, fallback однонаправленная", !normalizeEdgeDirection("bidirectional").recognized && normalizeEdgeDirection("bidirectional").dir === "однонаправленная");
ok("пустая ячейка → не опознано", !normalizeEdgeDirection("").recognized);
ok("в ROLE_MAP нет латинских ключей", Object.keys(ROLE_MAP).every((k) => !/[a-z]/i.test(k)));

const tbl = (h, rows) => `<table class="doc-table"><thead><tr>${h.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const sub = (n, b) => `<div data-section="${n}"><h4>${n}</h4>${b}</div>`;
const graphHtml = (dirs, roles) =>
  sub("Таблица категорий", tbl(["Категория", "Тип", "Определение", "Центральность", "Определённость", "Происхождение"], [["Бытие", "онтологическая", "d", "0.9", "0.8", ""], ["Ничто", "онтологическая", "d", "0.5", "0.5", ""]]))
  + sub("Таблица связей", tbl(["Источник", "Описание связи", "Цель", "Тип", "Направление", "Сила"], [["Бытие", "d", "Ничто", "диалектическая", dirs[0], "0.7"], ["Ничто", "d", "Ничто", "рефлексия", dirs[1], "0.3"]]))
  + sub("Топология графа", "<p>проза</p>" + sub("Топологическая таблица", tbl(["Категория", "Кластер", "Структурные роли", "Процессуальные роли", "Рефлексивная связь"], [["Бытие", "Ядро", roles[0], roles[1], ""], ["Ничто", "Ядро", roles[2], "", ""]])));
const en = parseGraphFromHTML(graphHtml(["bidirectional", "reflexive"], ["Central", "Thesis", "мост, Bridge"]));
ok(`английские значения → 5 предупреждений (получено ${en.warnings.length})`, en.warnings.length === 5, en.warnings.join("\n    "));
ok("рёбра сохранены «однонаправленными» С ПОМЕТКОЙ и сырым значением", en.edges.length === 2 && en.edges.every((e) => e.dir === "однонаправленная" && e.dirSubstituted) && en.edges[0].dirRaw === "bidirectional");
ok("предупреждение о направлении несёт строку и значение", /таблица связей, строка 2 \(«Ничто» → «Ничто»\): направление «reflexive»/.test(en.warnings[1] ?? ""));
ok("предупреждение о роли несёт строку, категорию, столбец и значение", en.warnings.some((w) => /строка 1 \(«Бытие»\), столбец «Процессуальные роли»: роль «Thesis» не опознана/.test(w)));
ok("узнанная роль рядом с неопознанной не теряется", (en.topology.roles.structural["Ничто"] ?? []).join() === "bridge");
const ru = parseGraphFromHTML(graphHtml(["двунаправленная", "рефлексивная"], ["центральная", "тезис", "мост"]));
ok("русские значения → ни одного предупреждения", ru.warnings.length === 0, ru.warnings.join(" | "));
ok("русские направления канонизированы без пометки", ru.edges[0].dir === "двунаправленная" && !ru.edges[0].dirSubstituted && ru.edges[1].dir === "рефлексивная");
ok("роли по-прежнему читаются", ru.topology.roles.structural["Бытие"]?.join() === "central" && ru.topology.roles.procedural["Бытие"]?.join() === "thesis");

/* ── 5. Страховка опознания подраздела по позиции ── */
console.log("\n═══ 5. resolveSubsection / findSubsection ═══");
const order = ["Методология построения графа", "Таблица категорий", "Таблица связей", "Топология графа", "Топологическая таблица"];
const enNames = ["Methodology", "Category Table", "Edge Table", "Graph Topology", "Topology Table"];
const mk = (names) => parseFragment(names.map((n) => `<div data-section="${n}"><h4>${n}</h4><p>${n}</p></div>`).join(""));
const r1 = resolveSubsection(mk(enNames), "Таблица связей", order);
ok("все атрибуты переведены, число совпадает → опознан по месту", r1.el && r1.byPosition && r1.actualName === "Edge Table", JSON.stringify(r1));
ok("предупреждение несёт оба имени и номер", /подраздел 3 опознан по месту: атрибут "Edge Table" вместо "Таблица связей"/.test(r1.warning ?? ""), r1.warning);
ok("findSubsection-обёртка отдаёт тот же элемент", findSubsection(mk(enNames), "Таблица связей", order)?.getAttribute("data-section") === "Edge Table");
const r2 = resolveSubsection(mk(enNames.slice(0, 4)), "Таблица связей", order);
ok("число не совпадает → честный отказ с причиной", !r2.el && !r2.byPosition && /в разделе 4 подраздел\(ов\), в карте 5/.test(r2.warning ?? ""), r2.warning);
const r3 = resolveSubsection(mk(order), "Таблица связей", order);
ok("точное имя → без предупреждений, не по месту", r3.el && !r3.byPosition && r3.warning === null && r3.actualName === "Таблица связей");
const r4 = resolveSubsection(mk(["Методология построения графа", "таблица категорий (Category Table)"]), "Таблица категорий", order);
ok("нечёткое совпадение по имени — прежде позиции и без предупреждения", r4.el && !r4.byPosition && r4.warning === null && r4.actualName === "таблица категорий (Category Table)");
const r5 = resolveSubsection(mk(enNames), "Таблица связей");
ok("без ожидаемого порядка — отказ с причиной", !r5.el && /ожидаемый порядок не передан/.test(r5.warning ?? ""));
const r6 = resolveSubsection(mk(enNames), "Чужой подраздел", order);
ok("имени нет в карте — отказ с причиной", !r6.el && /отсутствует в ожидаемом порядке карты/.test(r6.warning ?? ""));
ok("findSubsection без порядка совместима с прежней сигнатурой (null)", findSubsection(mk(enNames), "Таблица связей") === null);

console.log(`\nИтог: ${pass} ✓, ${fail} ✗`);
process.exit(fail ? 1 : 0);
