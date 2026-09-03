/**
 * Смоук чистых ядер беседы 5.2 (запрос 1; без БД и браузера):
 *  - enrichSectionHtml({editButtons}) добавляет столбец ✎ на строки
 *    «Сводной таблицы тезисов» и «Таблицы определений» (и только их),
 *    сохраняя якоря/кнопки ⏫ 1.6b; без флага — разметка как раньше;
 *  - diff-функции редакторов отдают ТОЛЬКО изменившиеся поля;
 *  - diffSnapshots / versionPreview VersionHistory.
 * DOMParser — из linkedom (единственная точка linkedom сервера не
 * затрагивается: тест подменяет глобал только у себя).
 * Запуск: node_modules/.bin/tsx tests/smoke-52-request1.mjs
 */
import { DOMParser } from "linkedom";
globalThis.DOMParser = DOMParser;

import { enrichSectionHtml } from "../client/src/components/document/SectionView.tsx";
import { categoryDiff, categoryToDraft } from "../client/src/components/edit/CategoryEditor.tsx";
import { thesisDiff, thesisToDraft } from "../client/src/components/edit/ThesisEditor.tsx";
import { glossaryDiff, glossaryToDraft } from "../client/src/components/edit/GlossaryTermEditor.tsx";
import { diffSnapshots, versionPreview } from "../client/src/components/edit/VersionHistory.tsx";
import { HOST_SECTION } from "../client/src/components/edit/ElementEditor.tsx";

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`, extra === undefined ? "" : JSON.stringify(extra)); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const count = (s, re) => (s.match(re) || []).length;

console.log("── enrichSectionHtml: кнопки ✎ ──");
const thesesHtml = `<div class="doc-section"><div class="section-title">Тезисы</div>
<div class="doc-content">
<div data-section="Развёрнутые тезисы"><h4>Развёрнутые тезисы</h4><p><strong>Бытие есть.</strong> Обоснование.</p></div>
<div data-section="Сводная таблица тезисов"><h4>Сводная таблица тезисов</h4>
<table class="doc-table"><thead><tr><th>№</th><th>Формулировка тезиса</th><th>Тип</th><th>Степень новизны</th><th>Связанные категории</th></tr></thead>
<tbody><tr><td>1</td><td>Бытие есть.</td><td>онтологический</td><td>высокая</td><td>Бытие</td></tr>
<tr><td>2</td><td>Ничто ничтожит.</td><td>онтологический</td><td>средняя</td><td>Ничто</td></tr></tbody></table></div></div></div>`;
const plain = enrichSectionHtml(thesesHtml, "theses", ["Развёрнутые тезисы", "Сводная таблица тезисов"]);
check("без флага — кнопок ✎ нет", !plain.includes("inline-edit-btn"));
check("без флага — якоря 1.6b есть", plain.includes('id="subsec-theses-'));
const ed = enrichSectionHtml(thesesHtml, "theses", ["Развёрнутые тезисы", "Сводная таблица тезисов"], { editButtons: true });
check("две кнопки ✎ на две строки", count(ed, /data-edit-kind="thesis"/g) === 2);
check("индексы строк 0 и 1", ed.includes('data-edit-row="0"') && ed.includes('data-edit-row="1"'));
check("th .inline-edit-cell добавлен в thead", count(ed, /<th[^>]*class="inline-edit-cell"/g) === 1);
check("якоря и ⏫ 1.6b сохранены", ed.includes('id="subsec-theses-') && ed.includes("toc-back-btn"));
check("абзац развёрнутого тезиса не тронут", ed.includes("<strong>Бытие есть.</strong> Обоснование."));
const ed2 = enrichSectionHtml(ed, "theses", [], { editButtons: true });
check("идемпотентно: повторное обогащение не дублирует столбец", count(ed2, /data-edit-kind="thesis"/g) === 2);

const glossHtml = `<div class="doc-section"><div class="doc-content"><div data-section="Таблица определений"><h4>Таблица определений</h4>
<table class="doc-table"><thead><tr><th>Термин</th><th>Принятое определение</th><th>Источник</th></tr></thead>
<tbody><tr><td>Бытие</td><td>Всё, что есть</td><td>Парменид</td></tr></tbody></table></div>
<div data-section="Переопределённые термины"><h4>Переопределённые термины</h4><table class="doc-table"><thead><tr><th>Понятие</th><th>Было</th></tr></thead><tbody><tr><td>x</td><td>y</td></tr></tbody></table></div></div></div>`;
const gl = enrichSectionHtml(glossHtml, "glossary", [], { editButtons: true });
check("глоссарий: одна кнопка glossary_term", count(gl, /data-edit-kind="glossary_term"/g) === 1);
check("прочие таблицы раздела без ✎", count(gl, /inline-edit-btn/g) === 1);
const glossByTh = glossHtml.replace('data-section="Таблица определений"', 'data-section="Определения"');
check("глоссарий по th «Термин» (fallback парсера 1.4)", count(enrichSectionHtml(glossByTh, "glossary", [], { editButtons: true }), /data-edit-kind="glossary_term"/g) === 1);
const graphHtml = `<div data-section="Таблица категорий"><table class="doc-table"><thead><tr><th>Категория</th></tr></thead><tbody><tr><td>Бытие</td></tr></tbody></table></div>`;
check("таблица категорий без ✎ (правка — через NodePanel)", !enrichSectionHtml(graphHtml, "graph", [], { editButtons: true }).includes("inline-edit-btn"));

console.log("── diff-функции редакторов ──");
const cat = { id: "c1", synthesisId: "s", name: "Бытие", type: "онтологическая", definition: "d", centrality: 0.9, certainty: 0.5, historicalSignificance: 0.5, innovationDegree: 1, clarity: 0, breadth: 0, depthScore: 0, applicability: 0, typeCatalogId: null, origin: "o", clusterIndices: [], structuralRoles: [], proceduralRoles: [], hasReflexive: false, position: 0, source: "generated", createdAt: "", updatedAt: "" };
const cd = categoryToDraft(cat);
check("категория: без правок — пустое тело", eq(categoryDiff(cd, cd), {}));
check("категория: только name (trim)", eq(categoryDiff(cd, { ...cd, name: " Сущее " }), { name: "Сущее" }));
check("категория: centrality", eq(categoryDiff(cd, { ...cd, centrality: 0.7 }), { centrality: 0.7 }));
const th = { id: "t1", synthesisId: "s", thesisNum: 1, formulation: "Бытие есть.", justification: "j", thesisType: "ontological", noveltyDegree: "высокая", relatedCategories: ["Бытие"], source: "generated", createdAt: "", updatedAt: "" };
const td = thesisToDraft(th);
check("тезис: только justification", eq(thesisDiff(td, { ...td, justification: "j2" }), { justification: "j2" }));
check("тезис: thesisType", eq(thesisDiff(td, { ...td, thesisType: "ethical" }), { thesisType: "ethical" }));
const g = { id: "g1", synthesisId: "s", term: "Бытие", definition: "Всё", extraColumns: { Источник: "Парменид" }, termCategory: "", source: "generated", position: 0, createdAt: "", updatedAt: "" };
const gd = glossaryToDraft(g);
check("глоссарий: extraColumns целиком при смене одного столбца", eq(glossaryDiff(gd, { ...gd, extraColumns: { Источник: "Платон" } }), { extraColumns: { Источник: "Платон" } }));
check("глоссарий: одинаковые столбцы — без правок", eq(glossaryDiff(gd, { ...gd, extraColumns: { ...gd.extraColumns } }), {}));
check("раздел-хозяин по типу", HOST_SECTION.category === "graph" && HOST_SECTION.thesis === "theses" && HOST_SECTION.glossary_term === "glossary");

console.log("── VersionHistory: diff/preview ──");
const d = diffSnapshots({ name: "Бытие", type: "онтологическая", id: "x", updatedAt: "1" }, { name: "Сущее", type: "онтологическая", id: "y", updatedAt: "2" });
check("служебные поля не сравниваются", !d.some((l) => /\bid\b|updatedAt|^[12]$/.test(l.text)));
check("del/add по изменённому полю", eq(d.filter((l) => l.kind !== "ctx").map((l) => [l.kind, l.text]), [["del", "Бытие"], ["add", "Сущее"]]));
check("ctx: подпись поля + свёртка неизменённых", d[0].text === "Название:" && d.at(-1).text.includes("без изменений: 1"));
check("нет различий — одна ctx-строка", eq(diffSnapshots({ a: 1 }, { a: 1 }), [{ kind: "ctx", text: "Различий по полям нет" }]));
check("preview: имя категории", versionPreview({ name: "Бытие", definition: "…" }) === "Бытие");
check("preview: html без тегов, обрезка", versionPreview({ htmlContent: "<p>" + "а".repeat(200) + "</p>" }).length === 90);

console.log(`\n${failed ? "✗" : "✓"} ${n - failed}/${n}`);
process.exit(failed ? 1 : 0);
