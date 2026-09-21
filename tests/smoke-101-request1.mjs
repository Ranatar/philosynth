/**
 * Смоук беседы 10.1 (запрос 1). Часть A — без БД: чистые функции; часть B —
 * живая БД с посевами (нет БД — часть B пропускается); часть C — живой файл
 * одностраничника (T101_FILE; нет файла — пропуск).
 *  A. контракт: шаблон собран из shared-констант (столбцы, закрытые списки,
 *     запреты, правило пустой ячейки, полнота, назначение), надстройки над
 *     генератами идемпотентны и генерат не трогают; parseRecommendationsTable
 *     (семь столбцов; перестановка столбцов; без <thead>; отказ с названием
 *     ненайденного заголовка; нет подраздела; нет таблицы; нет строк);
 *     guardRows (адрес с «§», кавычками и «Раздел →»; несуществующий адрес;
 *     подраздел критики; операция «улучшить»; важность; элемент в ёлочках и
 *     с двойным пробелом; тезис по метке «Э-2»; категория против термина по
 *     разделу адреса; развилка 5а/5б; один номер — два адреса; повтор строки;
 *     хэш источника — по элементу либо по подразделу); insertSubsectionAfter
 *     (после названного, с якорем и ⏫ по образцу соседа и без них; второй раз —
 *     замена, не дубль; нет соседа → null; <h4> в присланном → отказ);
 *     ручная правка 9.2 таблицы → разбор находит её по-прежнему; замок 9.2
 *     подраздел не запирает; critique:final_table не хватает таблицу
 *     рекомендаций запасным ходом.
 *  B. сиды: шаблоны и три конфига в Registry; buildSubsectionMap не теряет
 *     подраздел на всех трёх уровнях; buildSectionDefs ставит таблицу ПОСЛЕ
 *     прозы, список адресов закрыт и без критики/капсулы; шаблон ретрофита
 *     рендерится без дыр.
 *  C. живой файл: таблицы нет → parse говорит no_table; проза на месте;
 *     insertSubsectionAfter даёт якорь и ⏫ как у соседей; после вставки
 *     подразделов на один больше и порядок прежний.
 * Запуск: node_modules/.bin/tsx tests/smoke-101-request1.mjs
 */
import { existsSync, readFileSync } from "node:fs";

import {
  RECOMMENDATIONS_PROSE_SUBSECTION as PROSE,
  RECOMMENDATIONS_TABLE_SUBSECTION as TABLE,
  RECOMMENDATION_COLUMNS,
  RECOMMENDATION_FORBIDDEN_OPS,
  RECOMMENDATION_HEADERS_LINE,
  RECOMMENDATION_OPS,
  RECOMMENDATION_SEVERITIES,
  RECOMMENDATION_STATUSES,
} from "../packages/shared/constants/recommendations.ts";
import {
  RECOMMENDATIONS_EXTRACT_PLACEHOLDERS,
  RECOMMENDATIONS_PROSE_ADDENDUM,
  RECOMMENDATIONS_TABLE_PLACEHOLDERS,
  SEED_RECOMMENDATION_TEMPLATES,
  applyRecommendationTemplateOverrides,
  withRecommendationsCtxKeys,
  withRecommendationsIntraDeps,
  withRecommendationsSubsectionMap,
} from "../server/config/recommendation-templates.ts";
import { SEED_SECTION_TEMPLATES } from "../server/config/section-templates.ts";
import { SUBSECTION_MAP_BASE } from "../server/config/subsection-map.ts";
import { INTRA_DEPS } from "../server/config/intra-deps.ts";
import { SUBSECTION_TO_CTX_KEYS } from "../server/config/subsection-ctx-keys.ts";
import {
  insertSubsectionAfter,
  listSubsectionNames,
  replaceSubsectionContent,
  readSubsectionSource,
} from "../server/utils/html-parser.ts";

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}${extra !== undefined ? " — " + JSON.stringify(extra) : ""}`); }
}
const thrown = (fn) => { try { fn(); return null; } catch (e) { return e; } };

/* ── фикстура ─────────────────────────────────────────────────────────── */
const HEAD = RECOMMENDATION_COLUMNS.map((c) => c.header);
const tableHtml = (headers, rows, { thead = true } = {}) =>
  `<table class="doc-table">${thead ? "<thead>" : ""}<tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>${thead ? "</thead>" : ""}<tbody>${rows
    .map((r) => `<tr>${headers.map((h) => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const row = (num, address, element, op, replacement, rationale, severity) => ({
  "№": num, "Адрес": address, "Элемент": element, "Операция": op,
  "Готовая замена": replacement, "Основание": rationale, "Важность": severity,
});
const ROWS = [
  row("1", "Таблица определений", "Самость-как-вмещение", "переопределить", "", "Верность методу синтеза", "существенная"),
  row("2", "§ «Граф → Таблица категорий»", "«Индивидуация-как-практика»", "уточнить формулировку", "нарушение грамматики, произведённое в ответ на присутствие содержания", "Верность методу синтеза", "косметическая"),
  row("3", "Эпистемологические тезисы", "Э-2", "развить", "", "Слепые пятна", "существенная"),
  row("5а", "Таблица категорий", "Энантиодромия  разлома", "удалить", "", "Верность методу синтеза", "блокирующая"),
  row("5б", "Таблица категорий", "Энантиодромия разлома", "переопределить", "", "Верность методу синтеза", "блокирующая"),
  row("6", "Новизна и ценность", "", "развить", "", "Сохранение ценных аспектов", "косметическая"),
  row("6", "Аналитический комментарий", "", "развить", "", "Сохранение ценных аспектов", "косметическая"),
];
const critique = (inner) =>
  `<div class="doc-section"><div class="section-num">§ 11</div><div class="section-title">Критический Анализ</div><div class="doc-content">` +
  `<div data-section="Верность методу синтеза"><h4>Верность методу синтеза</h4><p>Текст.</p></div>` +
  `<div data-section="Итоговая оценка"><h4>Итоговая оценка</h4><table class="doc-table"><thead><tr><th>Критерий</th><th>Оценка</th></tr></thead><tbody><tr><td>новизна</td><td>7</td></tr></tbody></table></div>` +
  `<div data-section="${PROSE}"><h4>${PROSE}</h4><p><strong>Рекомендация 1.</strong> Текст.</p></div>${inner}</div></div>`;
const withTable = (t) => critique(`<div data-section="${TABLE}"><h4>${TABLE}</h4>${t}</div>`);

const DOC = {
  subsectionsBySection: {
    sum: ["Цели и метод", "Новизна и ценность"],
    graph: ["Таблица категорий", "Таблица связей", "Топология графа", "Топологическая таблица"],
    glossary: ["Таблица определений"],
    theses: ["Онтологические тезисы", "Эпистемологические тезисы", "Сводная таблица тезисов"],
    dialogue: ["Аналитический комментарий"],
    practical: ["Сводная таблица"],
    critique: ["Верность методу синтеза", "Слепые пятна", "Итоговая оценка", PROSE, TABLE],
    capsule: ["Капсула"],
  },
  categories: [
    { id: "c1", name: "Индивидуация-как-практика", value: "v-c1" },
    { id: "c2", name: "Энантиодромия разлома", value: "v-c2" },
    { id: "c3", name: "Самость-как-вмещение", value: "v-c3" },
  ],
  theses: [
    { id: "t1", labels: ["О-1", "1"], formulation: "Архетип является разломной матрицей", value: "v-t1" },
    { id: "t2", labels: ["Э-2", "6"], formulation: "Семантическое эго есть точка уязвимости", value: "v-t2" },
  ],
  terms: [{ id: "g1", term: "Самость-как-вмещение", value: "v-g1" }],
  subsectionSource: (k, name) => `src:${k}:${name}`,
};

const { parseRecommendationsTable, guardRows, cleanAddress, roundHashOf, innerHtmlFromModelAnswer, buildExtractVars, RecommendationsError } =
  await import("../server/services/recommendations.ts");

/* ══ A1. Контракт и надстройки ════════════════════════════════════════ */
console.log("A1. контракт и надстройки");
{
  const tpl = SEED_RECOMMENDATION_TEMPLATES.find((t) => t.key === "section.critique.sub.recommendations_table");
  const b = tpl?.body ?? "";
  check("шаблон таблицы заведён один, не по методам", SEED_RECOMMENDATION_TEMPLATES.filter((t) => t.key.startsWith("section.")).length === 1);
  check("обязательная таблица doc-table", /ОБЯЗАТЕЛЬНАЯ итоговая таблица/.test(b) && b.includes('<table class="doc-table">'));
  check("«Столбцы СТРОГО» ≡ shared", b.includes(`Столбцы СТРОГО: ${RECOMMENDATION_HEADERS_LINE}`) && RECOMMENDATION_HEADERS_LINE === "№ | Адрес | Элемент | Операция | Готовая замена | Основание | Важность");
  check("закрытый список операций ≡ shared", b.includes(`"${RECOMMENDATION_OPS.join(" | ")}"`) && RECOMMENDATION_OPS.length === 6);
  check("закрытый список важности ≡ shared", b.includes(`"${RECOMMENDATION_SEVERITIES.join(" | ")}"`) && RECOMMENDATION_SEVERITIES.length === 3);
  check("слова-пожелания запрещены поимённо", RECOMMENDATION_FORBIDDEN_OPS.every((w) => b.toLowerCase().includes(w)) && /это не операции, а пожелания/.test(b));
  check("требование полноты", /Каждая рекомендация — ОБЯЗАТЕЛЬНО в отдельной строке\. Пропуски недопустимы/.test(b));
  check("правило пустой ячейки (элемент, замена)", (b.match(/ячейку оставить пустой/g) ?? []).length === 2);
  check("запреты: пересказ, чужие названия, метки контекста", /Пересказ вместо дословного текста — ЗАПРЕЩЁН/.test(b) && /Названия, которых в списке нет, — ЗАПРЕЩЕНЫ/.test(b) && /Метки контекста/.test(b));
  check("примеры адреса — настоящие подразделы, не метки контекста", b.includes("«Таблица определений»") && !/Например:[^\n]*Тезисы \(полные\)/.test(b));
  check("одна строка — один адрес; развилка 5а/5б; выбор за человеком", /ОДНА СТРОКА — ОДИН АДРЕС/.test(b) && /«5а» и «5б»/.test(b) && /Выбор делает человек/.test(b));
  check("назначение названо", /используется инструментом реализации рекомендаций/.test(b));
  check("машинные ключи не переводятся", /при любом языке документа/.test(b));
  const ph = [...b.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map((m) => m[1]);
  check("плейсхолдеры шаблона таблицы ≡ объявленным", JSON.stringify(ph) === JSON.stringify([...RECOMMENDATIONS_TABLE_PLACEHOLDERS]), ph);
  const ex = SEED_RECOMMENDATION_TEMPLATES.find((t) => t.key === "recommendations.extract")?.body ?? "";
  const exPh = [...new Set([...ex.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map((m) => m[1]))].sort();
  check("плейсхолдеры шаблона ретрофита ≡ объявленным", JSON.stringify(exPh) === JSON.stringify([...RECOMMENDATIONS_EXTRACT_PLACEHOLDERS].sort()), exPh);
  check("'stale' заведён в статусах сразу", RECOMMENDATION_STATUSES.includes("stale") && RECOMMENDATION_STATUSES.length === 6);

  const before = JSON.stringify(SEED_SECTION_TEMPLATES);
  const over = applyRecommendationTemplateOverrides(SEED_SECTION_TEMPLATES);
  const prose = over.find((t) => t.key === "section.critique.sub.recommendations");
  const gen = SEED_SECTION_TEMPLATES.find((t) => t.key === "section.critique.sub.recommendations");
  check("проза: исходное тело + одно требование", prose.body === gen.body + RECOMMENDATIONS_PROSE_ADDENDUM && prose.body.startsWith("Конкретные, операционализируемые шаги"));
  check("надстройка не трогает генерат и прочие шаблоны", JSON.stringify(SEED_SECTION_TEMPLATES) === before && over.filter((t, i) => t !== SEED_SECTION_TEMPLATES[i]).length === 1 && over.length === 146);
  check("надстройка идемпотентна", JSON.stringify(applyRecommendationTemplateOverrides(over)) === JSON.stringify(over));

  const map = withRecommendationsSubsectionMap(SUBSECTION_MAP_BASE);
  const i = map.critique.indexOf(PROSE);
  check("subsection_map: таблица сразу ПОСЛЕ прозы", map.critique[i + 1] === TABLE && map.critique.length === SUBSECTION_MAP_BASE.critique.length + 1);
  check("subsection_map: прочие разделы прежние, генерат цел", Object.keys(map).every((k) => k === "critique" || JSON.stringify(map[k]) === JSON.stringify(SUBSECTION_MAP_BASE[k])) && !SUBSECTION_MAP_BASE.critique.includes(TABLE));
  check("subsection_map: идемпотентно", JSON.stringify(withRecommendationsSubsectionMap(map)) === JSON.stringify(map));
  const intra = withRecommendationsIntraDeps(INTRA_DEPS);
  check("intra_deps: таблица ← проза", JSON.stringify(intra.critique[TABLE]) === JSON.stringify([PROSE]) && !(TABLE in INTRA_DEPS.critique));
  const ctx = withRecommendationsCtxKeys(SUBSECTION_TO_CTX_KEYS);
  check("subsection_ctx_keys: таблица → []", Array.isArray(ctx.critique[TABLE]) && ctx.critique[TABLE].length === 0 && JSON.stringify(ctx.graph) === JSON.stringify(SUBSECTION_TO_CTX_KEYS.graph));
}

/* ══ A2. Разбор ═══════════════════════════════════════════════════════ */
console.log("A2. разбор таблицы");
{
  const rows = parseRecommendationsTable(withTable(tableHtml(HEAD, ROWS)));
  check("семь строк, семь полей", rows.length === 7 && Object.keys(rows[0]).length === 8);
  check("строка с готовой заменой отличима от строк без неё", rows.filter((r) => r.replacement).length === 1 && rows[1].replacement.startsWith("нарушение грамматики"));
  check("position — место в таблице с 1", rows.map((r) => r.position).join() === "1,2,3,4,5,6,7");

  const shuffled = ["Важность", "Готовая замена", "Операция", "№", "Основание", "Элемент", "Адрес"];
  const again = parseRecommendationsTable(withTable(tableHtml(shuffled, ROWS)));
  check("перестановка столбцов: результат тот же", JSON.stringify(again) === JSON.stringify(rows));
  const noThead = parseRecommendationsTable(withTable(tableHtml(HEAD, ROWS, { thead: false })));
  check("без <thead> (ручная правка): заголовок — первая строка", JSON.stringify(noThead) === JSON.stringify(rows));
  const cased = parseRecommendationsTable(withTable(tableHtml(HEAD.map((h) => ` ${h.toUpperCase()} `), ROWS.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [` ${k.toUpperCase()} `, v]))))));
  check("регистр и пробелы заголовков не мешают", cased.length === 7);

  const renamed = HEAD.map((h) => (h === "Операция" ? "Действие" : h));
  const e1 = thrown(() => parseRecommendationsTable(withTable(tableHtml(renamed, []))));
  check("переименованный столбец → отказ с ЕГО названием", e1 instanceof RecommendationsError && e1.code === "RECOMMENDATIONS_TABLE_INVALID" && e1.message.includes("«Операция»") && e1.details.missing.join() === "Операция" && e1.details.found.includes("Действие"), e1?.message);
  const e2 = thrown(() => parseRecommendationsTable(withTable(tableHtml(HEAD.slice(0, 5), []))));
  check("два отсутствующих столбца названы оба", e2?.details?.missing?.join() === "Основание,Важность");
  const e3 = thrown(() => parseRecommendationsTable(critique("")));
  check("подраздела нет → NOT_FOUND no_table с подсказкой про extract", e3?.code === "NOT_FOUND" && e3.details.reason === "no_table" && /recommendations\/extract/.test(e3.message) && e3.details.available.includes(PROSE));
  const e4 = thrown(() => parseRecommendationsTable(withTable("<p>таблицы нет</p>")));
  check("подраздел без таблицы → no_table_element", e4?.details?.problem === "no_table_element");
  const e5 = thrown(() => parseRecommendationsTable(withTable(tableHtml(HEAD, [row("", "", "", "", "", "", "")]))));
  check("одни пустые строки → no_rows", e5?.details?.problem === "no_rows");
}

/* ══ A3. Сторож ═══════════════════════════════════════════════════════ */
console.log("A3. сторож адресов");
{
  check("cleanAddress: §, кавычки и «Раздел →» сняты", cleanAddress("§ «Граф → Таблица категорий»") === "Таблица категорий" && cleanAddress("Глоссарий -> Таблица определений") === "Таблица определений");
  const g = guardRows(parseRecommendationsTable(withTable(tableHtml(HEAD, ROWS))), DOC);
  check("все семь строк годны", g.every((r) => r.status === "new" && r.invalidReason === null), g.filter((r) => r.status !== "new").map((r) => r.invalidReason));
  check("адрес найден, раздел определён", g[1].addressSubsection === "Таблица категорий" && g[1].addressSection === "graph" && g[5].addressSection === "sum");
  check("элемент в ёлочках найден среди категорий", g[1].elementKind === "category" && g[1].elementId === "c1");
  check("элемент с двойным пробелом найден", g[3].elementId === "c2" && g[3].element === "Энантиодромия разлома");
  check("тезис по метке документа «Э-2»", g[2].elementKind === "thesis" && g[2].elementId === "t2");
  check("имя категории ≡ термину: решает раздел адреса", g[0].elementKind === "glossary_term" && g[0].elementId === "g1");
  check("развилка: «5а» и «5б» — две строки, обе new", g[3].num === "5а" && g[4].num === "5б" && g[3].status === "new" && g[4].status === "new" && g[3].position !== g[4].position);
  check("один номер — два адреса: обе строки годны", g[5].num === "6" && g[6].num === "6" && g[5].addressSection === "sum" && g[6].addressSection === "dialogue");
  check("хэш источника: элемент → по элементу, без подраздела", g[3].sourceHash === g[4].sourceHash && g[3].sourceHash !== g[1].sourceHash && /^[0-9a-f]{64}$/.test(g[1].sourceHash));
  check("хэш источника: без элемента → по подразделу", /^[0-9a-f]{64}$/.test(g[5].sourceHash) && g[5].sourceHash !== g[6].sourceHash);
  const docChanged = { ...DOC, subsectionSource: (k, name) => `src2:${k}:${name}` };
  const g2 = guardRows(parseRecommendationsTable(withTable(tableHtml(HEAD, ROWS))), docChanged);
  check("правка подраздела меняет хэш строки без элемента и НЕ меняет хэш строки с элементом", g2[5].sourceHash !== g[5].sourceHash && g2[1].sourceHash === g[1].sourceHash);

  const bad = guardRows(parseRecommendationsTable(withTable(tableHtml(HEAD, [
    row("1", "Определения", "", "развить", "", "Слепые пятна", "существенная"),
    row("2", "Таблица категорий", "Индивидуация-как-практика", "улучшить", "", "Слепые пятна", "существенная"),
    row("3", "Таблица категорий", "Несуществующая категория", "удалить", "", "Слепые пятна", "важная"),
    row("4", "Итоговая оценка", "", "развить", "", "Слепые пятна", "косметическая"),
    row("пятая", "", "", "развить", "", "", "косметическая"),
    row("6", "Таблица связей", "", "перегенерировать", "", "Слепые пятна", "блокирующая"),
    row("6", "Таблица связей", "", "перегенерировать", "", "Слепые пятна", "блокирующая"),
  ]))), DOC);
  check("несуществующий подраздел → invalid, причина называет адрес и похожие", bad[0].status === "invalid" && bad[0].invalidReason.includes("«Определения»") && bad[0].invalidReason.includes("«Таблица определений»"), bad[0].invalidReason);
  check("операция «улучшить» → invalid с указанием на закрытый список", bad[1].status === "invalid" && bad[1].invalidReason.includes("«улучшить»") && bad[1].invalidReason.includes(RECOMMENDATION_OPS.join(" | ")) && bad[1].elementId === "c1");
  check("неизвестный элемент и важность — обе причины разом", bad[2].invalidReason.includes("«Несуществующая категория»") && bad[2].invalidReason.includes("«важная»"));
  check("подраздел самой критики адресом быть не может", bad[3].status === "invalid" && /самой критики/.test(bad[3].invalidReason));
  check("не-номер и пустой адрес", /не номер рекомендации/.test(bad[4].invalidReason) && /адрес пуст/.test(bad[4].invalidReason));
  check("негодные строки не роняют разбор: годная рядом разобрана", bad[5].status === "new" && bad[5].op === "перегенерировать");
  check("полный повтор строки → invalid", bad[6].status === "invalid" && /повторяет/.test(bad[6].invalidReason));
  const paren = guardRows([{ position: 1, num: "1", address: "Таблица определений", element: "Архетипический разлом", op: "развить", replacement: "", rationale: "", severity: "косметическая" }],
    { ...DOC, terms: [{ id: "g9", term: "Архетипический разлом (гипотетически незамкнутый неологизм)", value: "v" }] });
  check("термин с пояснением в скобках (живая концепция) найден без него", paren[0].status === "new" && paren[0].elementKind === "glossary_term" && paren[0].elementId === "g9", paren[0].invalidReason);
  const both = guardRows([{ position: 1, num: "1", address: "Таблица определений", element: "Архетипический разлом", op: "развить", replacement: "", rationale: "", severity: "косметическая" }],
    { ...DOC, categories: [{ id: "c9", name: "Архетипический разлом", value: "vc" }], terms: [{ id: "g9", term: "Архетипический разлом (гипотетически незамкнутый неологизм)", value: "v" }] });
  check("точное совпадение категории не заслоняет термин со скобкой: решает раздел адреса", both[0].elementKind === "glossary_term" && both[0].elementId === "g9", both[0]);
  const amb = guardRows([{ position: 1, num: "1", address: "Сводная таблица", element: "", op: "развить", replacement: "", rationale: "", severity: "косметическая" }],
    { ...DOC, subsectionsBySection: { ...DOC.subsectionsBySection, evolution: ["Сводная таблица"] } });
  check("адрес, одноимённый в двух разделах → invalid «неоднозначен»", amb[0].status === "invalid" && /неоднозначен/.test(amb[0].invalidReason));
}

/* ══ A4. Вставка подраздела, ручная правка, замок, контекст ═══════════ */
console.log("A4. insertSubsectionAfter и соседи по коду");
{
  const T = tableHtml(HEAD, ROWS);
  const plain = critique("");
  const ins = insertSubsectionAfter(plain, PROSE, TABLE, T);
  const names = listSubsectionNames(ins.html);
  check("подраздел добавлен сразу ПОСЛЕ прозы", ins.outcome === "inserted" && names[names.indexOf(PROSE) + 1] === TABLE && names.length === listSubsectionNames(plain).length + 1);
  check("обёртка с data-section и <h4>; якоря нет — у соседа его нет", ins.html.includes(`<div data-section="${TABLE}">`) && ins.html.includes(`<h4>${TABLE}</h4>`) && !/subsec-/.test(ins.html));
  check("прежние подразделы не тронуты", ins.html.includes(`<div data-section="${PROSE}"><h4>${PROSE}</h4><p><strong>Рекомендация 1.</strong> Текст.</p></div>`));
  check("вставленное разбирается", parseRecommendationsTable(ins.html).length === 7);

  const again = insertSubsectionAfter(ins.html, PROSE, TABLE, tableHtml(HEAD, ROWS.slice(0, 2)));
  check("уже есть → второй не заводится, содержимое заменено", again.outcome === "replaced" && listSubsectionNames(again.html).filter((x) => x === TABLE).length === 1 && parseRecommendationsTable(again.html).length === 2 && (again.html.match(new RegExp(`data-section="${TABLE}"`, "g")) ?? []).length === 1);

  const imported = plain.replace(`<div data-section="${PROSE}"><h4>${PROSE}</h4>`, `<div data-section="${PROSE}"><a id="subsec-critique-Рекомендации_по_улучшению"></a>\n<h4>${PROSE}<a href="#docTOC" class="toc-back-btn" title="К содержанию">⏫</a></h4>`);
  const ins2 = insertSubsectionAfter(imported, PROSE, TABLE, T);
  check("по образцу соседа: якорь subsec-critique-* и ⏫ в <h4>", ins2.html.includes('<a id="subsec-critique-Таблица_рекомендаций"></a>') && /<h4>Таблица рекомендаций<a href="#docTOC" class="toc-back-btn"/.test(ins2.html));
  check("исходник правки 9.2 якоря и <h4> не несёт", !/subsec-|<h4/.test(readSubsectionSource(ins2.html, TABLE).html));
  check("нет подраздела-соседа → null", insertSubsectionAfter(plain, "Нет такого", TABLE, T) === null);
  const eh = thrown(() => insertSubsectionAfter(plain, PROSE, TABLE, `<h4>${TABLE}</h4>${T}`));
  check("<h4> в присланном → отказ санитайзера 9.2, документ цел", eh?.name === "SubsectionHtmlError" && eh.problem === "heading");
  const dirty = insertSubsectionAfter(plain, PROSE, TABLE, T.replace('class="doc-table"', 'class="x" onclick="a()"') + "<script>1</script>");
  check("чистка: class=doc-table возвращён, script снят с предупреждением", dirty.html.includes(`<h4>${TABLE}</h4>`) && /<table class="doc-table">/.test(dirty.html.slice(dirty.html.indexOf(TABLE))) && !/script|onclick/.test(dirty.html) && dirty.warnings.length === 1);

  // Таблицу правят руками (п.5г): правка 9.2 → разбор находит её по-прежнему
  const src = readSubsectionSource(ins.html, TABLE).html;
  const edited = replaceSubsectionContent(ins.html, TABLE, src.replace("<td>переопределить</td>", "<td>удалить</td>").replace('class="doc-table"', ""));
  const afterEdit = parseRecommendationsTable(edited.html);
  check("ручная правка ячейки (и потеря class) разбор переживает", edited.changed && afterEdit.length === 7 && afterEdit[0].op === "удалить" && /<table class="doc-table">/.test(edited.html));
  check("ключ раунда — проза: правка таблицы его НЕ меняет, правка прозы — меняет", roundHashOf(edited.html) === roundHashOf(ins.html) && roundHashOf(ins.html.replace("Рекомендация 1.", "Рекомендация 1!")) !== roundHashOf(ins.html));

  const { lockedSubsectionsOf } = await import("../server/services/element-renderer.ts");
  check("вычисляемый замок 9.2 подраздел НЕ запирает", lockedSubsectionsOf("critique", ins.html).length === 0);

  check("ответ модели: обёртка снята, markdown-ограда снята", innerHtmlFromModelAnswer("```html\n<div data-section=\"" + TABLE + "\"><h4>" + TABLE + "</h4>" + T + "</div>\n```")?.startsWith("<table") && innerHtmlFromModelAnswer("<p>не могу</p>") === null);
  const vars = buildExtractVars({ prose: "П", critiqueSubsections: DOC.subsectionsBySection.critique, doc: DOC, tableContract: "К" });
  check("переменные ретрофита: основание без прозы и самой таблицы; тезисы с метками", !vars.critique_subsections.includes(PROSE) && !vars.critique_subsections.includes(TABLE) && vars.theses.includes("Э-2 — Семантическое эго") && Object.keys(vars).sort().join() === [...RECOMMENDATIONS_EXTRACT_PLACEHOLDERS].sort().join());

  // critique:final_table — запасной ход «последняя doc-table» (нет «Итоговой оценки»)
  const { extractContextFragment } = await import("../server/services/context-extractor.ts");
  const { parseFragment } = await import("../server/utils/html-parser.ts");
  const noFinal = ins.html.replace('data-section="Итоговая оценка"', 'data-section="Оценки"').replace("<h4>Итоговая оценка</h4>", "<h4>Оценки</h4>");
  const srcStub = { getSectionElement: async (k) => (k === "critique" ? parseFragment(noFinal) : null) };
  let ft = null, ftErr = null;
  try { ft = await extractContextFragment("critique:final_table", srcStub); } catch (e) { ftErr = String(e); }
  check("final_table запасным ходом берёт оценки, а не рекомендации", typeof ft === "string" && ft.includes("новизна") && !ft.includes("Готовая замена"), ftErr ?? ft);
}

/* ══ B. Живая БД с посевами ═══════════════════════════════════════════ */
console.log("B. Registry и билдер (живая БД)");
let dbOk = true;
try {
  const { getTemplate, getConfig, renderTemplate } = await import("../server/services/prompt-registry.ts");
  const { buildSectionDefs, buildSubsectionMap, serializeParts } = await import("../server/services/section-defs-builder.ts");
  let tplBody;
  try { tplBody = await getTemplate("section.critique.sub.recommendations_table"); } catch (e) { dbOk = false; console.log("  · БД/посевы недоступны — часть B пропущена:", String(e.message ?? e).slice(0, 120)); }
  if (dbOk) {
    check("шаблон таблицы посеян", tplBody.includes("Столбцы СТРОГО"));
    check("прозаический шаблон посеян с требованием", (await getTemplate("section.critique.sub.recommendations")).endsWith(RECOMMENDATIONS_PROSE_ADDENDUM));
    const sm = await getConfig("subsection_map");
    check("конфиг subsection_map посеян с таблицей после прозы", sm.base.critique[sm.base.critique.indexOf(PROSE) + 1] === TABLE);
    check("конфиги intra_deps и subsection_ctx_keys посеяны", JSON.stringify((await getConfig("intra_deps")).critique[TABLE]) === JSON.stringify([PROSE]) && JSON.stringify((await getConfig("subsection_ctx_keys")).critique[TABLE]) === "[]");
    const base = { seed: "зерно", phil: ["Кант", "Гегель"], participants: [{ type: "philosopher", name: "Кант" }, { type: "philosopher", name: "Гегель" }], method: "dialectical", depth: "standard", generationOrder: "architectural", extGraphMetrics: false, ctx: "", lang: "Russian", keepFullBudget: false };
    for (const synthLevel of ["comparative", "transformative", "generative"]) {
      const m = await buildSubsectionMap({ ...base, synthLevel, sec: ["graph", "critique"] });
      const c = m.critique;
      check(`buildSubsectionMap (${synthLevel}): пункты 2–3 по уровню на месте, таблица последней после прозы`, c[c.length - 1] === TABLE && c[c.length - 2] === PROSE && c[1] === sm.critiqueNovelty[synthLevel] && c[2] === sm.critiqueCheck[synthLevel], c);
    }
    const p = { ...base, synthLevel: "generative", sec: ["graph", "glossary", "theses", "dialogue", "critique", "capsule"] };
    const defs = await buildSectionDefs(p);
    const cr = defs.find((d) => d.key === "critique");
    const subs = cr.parts.subsections.map((s) => s.name);
    check("buildSectionDefs: таблица — последний подраздел критики, сразу после прозы", subs[subs.length - 1] === TABLE && subs[subs.length - 2] === PROSE, subs);
    const body = cr.parts.subsections[subs.length - 1].body;
    check("список адресов подставлен: разделы документа, без критики и капсулы", body.includes("  Граф категорий: ") && body.includes("Таблица категорий | Таблица связей") && body.includes("  Исполнительное резюме: ") && !/\n  Критический анализ: /.test(body) && !/\n  Капсула концепции: /.test(body) && !/\{\{/.test(body));
    check("список адресов следует уровню синтеза (глоссарий generative)", body.includes("Термины, преодолевающие ограничения"));
    check("промпт раздела сериализован с новым подразделом", cr.prompt === serializeParts(cr.parts) && cr.prompt.includes(TABLE) && cr.prompt.indexOf(PROSE) < cr.prompt.indexOf(`Столбцы СТРОГО: ${RECOMMENDATION_HEADERS_LINE}`));
    const others = defs.filter((d) => d.key !== "critique").map((d) => d.prompt).join("\n");
    check("шаблоны других разделов не задеты", !others.includes(TABLE));
    const rendered = await renderTemplate("recommendations.extract", buildExtractVars({ prose: "ПРОЗА", critiqueSubsections: subs, doc: DOC, tableContract: body }));
    check("шаблон ретрофита рендерится без дыр и несёт контракт", !/\{\{/.test(rendered) && rendered.includes("ПРОЗА") && rendered.includes("Столбцы СТРОГО") && rendered.includes(`<div data-section="${TABLE}"><h4>${TABLE}</h4>`));
  }
} catch (e) {
  failed++; n++;
  console.log("  ✗ часть B упала:", e?.stack ?? e);
}

/* ══ C. Живой файл одностраничника ════════════════════════════════════ */
console.log("C. живой файл (T101_FILE)");
const FILE = process.env.T101_FILE;
if (!FILE || !existsSync(FILE)) console.log("  · T101_FILE не задан или файла нет — пропуск");
else {
  const { parseDocument } = await import("../server/utils/html-parser.ts");
  const doc = parseDocument(readFileSync(FILE, "utf8"));
  let crit = null;
  for (const el of doc.querySelectorAll(".doc-section")) if (el.querySelector(`[data-section="${PROSE}"]`)) crit = el.outerHTML;
  check("в файле есть критика с прозой рекомендаций", !!crit);
  if (crit) {
    const e = thrown(() => parseRecommendationsTable(crit));
    check("таблицы рекомендаций в файле НЕТ → no_table", e?.details?.reason === "no_table");
    const prose = readSubsectionSource(crit, PROSE).html;
    const count = (prose.match(/<strong>Рекомендация \d+/g) ?? []).length;
    check(`проза несёт пронумерованные рекомендации (${count})`, count >= 5);
    const ins = insertSubsectionAfter(crit, PROSE, TABLE, tableHtml(HEAD, ROWS));
    const a = listSubsectionNames(crit), b = listSubsectionNames(ins.html);
    check("вставка: подразделов на один больше, прежний порядок цел, таблица после прозы", b.length === a.length + 1 && JSON.stringify(b.filter((x) => x !== TABLE)) === JSON.stringify(a) && b[b.indexOf(PROSE) + 1] === TABLE);
    check("вставка: якорь оглавления и ⏫ как у соседей", ins.html.includes('<a id="subsec-critique-Таблица_рекомендаций"></a>') && /<h4>Таблица рекомендаций<a [^>]*toc-back-btn/.test(ins.html));
    check("вставка прошла без предупреждений чистки", ins.warnings.length === 0, ins.warnings);
  }
}

console.log(`\nИТОГ: ${n - failed} ✓ / ${failed} ✗ из ${n}`);
try { const { closeDb } = await import("../server/db/index.ts"); await closeDb(); } catch {}
try { const { closeRedis } = await import("../server/redis.ts"); await closeRedis(); } catch {}
process.exit(failed ? 1 : 0);
