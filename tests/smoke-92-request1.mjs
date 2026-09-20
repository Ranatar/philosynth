/**
 * Смоук беседы 9.2 (запрос 1; без сервера, БД и браузера — DOM из linkedom):
 *  - html-parser: readSubsectionSource (без обёртки и <h4>, вложенный
 *    подраздел — строкой-ссылкой, таблица построчно), replaceSubsectionContent
 *    (обёртка, data-section и <h4> целы; белый список тегов; class таблицы
 *    возвращается; вложенный подраздел возвращается нетронутым; отказы
 *    heading / anchor / placeholder / empty / too_long; неизменённое → changed
 *    false), locateDocTableHost, listSubsectionNames;
 *  - element-renderer: lockedSubsectionsOf — ВЫЧИСЛЯЕМЫЙ заслон: graph запирает
 *    три таблицы, «Топология графа» и «Методология» свободны; без
 *    «Топологической таблицы» запасной локатор запирает «Топологию графа»;
 *    theses — только «Сводная таблица тезисов»; glossary — только «Таблица
 *    определений»; critique с восемью прозаическими таблицами — НИЧЕГО;
 *  - element-editor: subsectionLockOf (капсула по ключу и по имени, подсказка
 *    «чем править»), lockedSubsectionNames;
 *  - сохранность для потребителей: после правки подраздел находится по тому
 *    же data-section (findSubsection 2.2), parseSubsectionsFromHTML даёт те же
 *    имена, <strong>формулировка</strong> тезиса цел (replaceThesisParagraph);
 *  - клиент: enrichSectionHtml — карандаш только у незапертых, у запертых нет
 *    вовсе, форма на месте подраздела под <h4>, при форме карандашей нет,
 *    разметка в textarea экранирована; subsectionErrorText по кодам;
 *  - текстовые контракты: в routes/sections.ts НЕТ маршрута на тело раздела,
 *    PATCH под ownerEditGate, код SECTION_TABLE_LOCKED на сервере и в
 *    ApiErrorCode, applySectionSideEffects не вызывается, SectionView без
 *    useEffect (4p), каждый класс блока 9.2 имеет правило, новых hex нет.
 * Запуск: node_modules/.bin/tsx tests/smoke-92-request1.mjs
 */
import { readFileSync } from "node:fs";

import { DOMParser } from "linkedom";

globalThis.DOMParser = DOMParser;

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}${extra !== undefined ? " — " + JSON.stringify(extra) : ""}`); }
}
const rd = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const throwsWith = (fn, problem) => { try { fn(); return false; } catch (e) { return e?.problem === problem; } };

const hp = await import("../server/utils/html-parser.ts");
const er = await import("../server/services/element-renderer.ts");
const ee = await import("../server/services/element-editor.ts");
const gs = await import("../server/services/generation-service.ts");

const tbl = (h, r) => `<table class="doc-table"><thead><tr>${h.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody><tr>${r.map((x) => `<td>${x}</td>`).join("")}</tr></tbody></table>`;
const sec = (num, title, body) => `<div class="doc-section"><div class="section-num">§ ${num}</div><div class="section-title">${title}</div><div class="doc-content">${body}</div></div>`;
const sub = (name, body) => `<div data-section="${name}"><h4>${name}</h4>${body}</div>`;

const GRAPH = sec(2, "Граф", [
  sub("Методология построения графа", "<p>Первый <strong>абзац</strong>.</p><ul><li>раз</li><li>два</li></ul>"),
  sub("Таблица категорий", tbl(["Категория", "Тип"], ["Бытие", "онт."])),
  sub("Таблица связей", tbl(["Источник", "Цель"], ["A", "B"])),
  sub("Топология графа", "<p>Проза о кластерах.</p>" + sub("Топологическая таблица", tbl(["Категория", "Кластер"], ["Бытие", "1"])) + "<p>Хвост.</p>"),
].join("\n"));
const GRAPH_FALLBACK = sec(2, "Граф", [
  sub("Таблица категорий", tbl(["Категория"], ["Бытие"])),
  sub("Топология графа", "<p>Проза.</p>" + tbl(["Категория", "Кластер"], ["Бытие", "1"])),
].join(""));
const THESES = sec(4, "Тезисы", [
  sub("Онтологические тезисы", "<p><strong>Бытие есть становление</strong> Обоснование с опечаткой.</p>"),
  sub("Сводная таблица тезисов", tbl(["№", "Формулировка тезиса"], ["1", "Бытие есть становление"])),
].join(""));
const GLOSSARY = sec(3, "Глоссарий", [
  sub("Таблица определений", tbl(["Термин", "Принятое определение"], ["Бытие", "…"])),
  sub("Новые термины", "<p>Проза о новых терминах.</p>"),
].join(""));
const CRITIQUE = sec(9, "Критика", Array.from({ length: 8 }, (_, i) =>
  sub(`Возражение ${i + 1}`, `<p>Проза ${i + 1}.</p>` + tbl(["Довод", "Ответ"], ["x", "y"]))).join(""));

console.log("— html-parser: исходник правки —");
{
  const s = hp.readSubsectionSource(GRAPH, "Методология построения графа");
  check("исходник без обёртки и <h4>", s && !s.html.includes("<h4") && !s.html.includes("data-section"), s?.html);
  check("блок на строку", s.html.split("\n")[0] === "<p>Первый <strong>абзац</strong>.</p>");
  const t = hp.readSubsectionSource(GRAPH, "Топология графа");
  check("вложенный подраздел — строкой-ссылкой", t.nested.length === 1 && t.nested[0] === "Топологическая таблица" && /<!-- подраздел 1: Топологическая таблица/.test(t.html));
  check("таблицы вложенного в исходнике внешнего нет", !t.html.includes("<table"));
  check("таблица — построчно", hp.readSubsectionSource(CRITIQUE, "Возражение 1").html.includes("\n  <tr>"));
  const IMPORTED = sec(1, "Резюме", '<div data-section="Цели"><a id="subsec-sum-цели"></a><h4>Цели<a class="toc-back-btn" href="#docTOC" title="К содержанию">⏫</a></h4><p>Текст.</p></div>');
  const is = hp.readSubsectionSource(IMPORTED, "Цели");
  check("импорт одностраничника: якорь оглавления перед <h4> и ⏫ в исходник не попадают", is.html === "<p>Текст.</p>", is.html);
  const ir = hp.replaceSubsectionContent(IMPORTED, "Цели", "<p>Текст правленый.</p>");
  check("…и после правки якорь и ⏫ на месте, предупреждений нет", ir.html.includes('<a id="subsec-sum-цели"></a><h4>Цели<a class="toc-back-btn"') && ir.warnings.length === 0 && ir.html.includes("<p>Текст правленый.</p>"), ir.html);
  check("точное имя: «Топология» не находит «Топология графа»", hp.readSubsectionSource(GRAPH, "Топология") === null);
  check("listSubsectionNames — все пять, с вложенным", hp.listSubsectionNames(GRAPH).length === 5);
}

console.log("— html-parser: врезка —");
{
  const src = hp.readSubsectionSource(GRAPH, "Топология графа");
  const edited = src.html.replace("Проза о кластерах.", "Проза о <em>кластерах</em>.<script>alert(1)</script><a href=\"x\">ссылка</a>")
    + "\n<table><thead><tr><th style=\"color:red\">К</th></tr></thead><tbody><tr><td onclick=\"x()\" colspan=\"2\">v</td></tr></tbody></table>";
  const r = hp.replaceSubsectionContent(GRAPH, "Топология графа", edited);
  check("changed", r.changed === true);
  check("обёртка и <h4> на месте", r.html.includes('<div data-section="Топология графа"><h4>Топология графа</h4>'));
  check("вложенный подраздел возвращён нетронутым", r.html.includes(sub("Топологическая таблица", tbl(["Категория", "Кластер"], ["Бытие", "1"]))));
  check("script удалён с содержимым, <a> снят с сохранением текста", !r.html.includes("alert(1)") && !r.html.includes("<a ") && r.html.includes("ссылка"));
  check("атрибуты вне белого списка сняты, colspan цел", !r.html.includes("onclick") && !r.html.includes("style=") && r.html.includes('colspan="2"'));
  check("новой таблице возвращён class doc-table", (r.html.match(/<table class="doc-table">/g) ?? []).length === 4);
  check("предупреждения названы", r.warnings.length === 2);
  check("состав подразделов не изменился", JSON.stringify(hp.listSubsectionNames(r.html)) === JSON.stringify(hp.listSubsectionNames(GRAPH)));
  check("прочие подразделы побайтно целы", r.html.includes(sub("Таблица связей", tbl(["Источник", "Цель"], ["A", "B"]))));
  check("неизменённое → changed=false, HTML тот же", (() => { const x = hp.replaceSubsectionContent(GRAPH, "Топология графа", src.html + "\n"); return x.changed === false && x.html === GRAPH; })());
  check("нет подраздела → null", hp.replaceSubsectionContent(GRAPH, "Нет такого", "<p>x</p>") === null);
  check("<h4> → отказ heading", throwsWith(() => hp.replaceSubsectionContent(GRAPH, "Методология построения графа", "<h4>x</h4><p>y</p>"), "heading"));
  check("data-section → отказ anchor", throwsWith(() => hp.replaceSubsectionContent(GRAPH, "Методология построения графа", '<div data-section="Новый"><p>y</p></div>'), "anchor"));
  check("пропала строка-ссылка → отказ placeholder", throwsWith(() => hp.replaceSubsectionContent(GRAPH, "Топология графа", "<p>без ссылки</p>"), "placeholder"));
  check("строка-ссылка дважды → отказ placeholder", throwsWith(() => hp.replaceSubsectionContent(GRAPH, "Топология графа", src.html + "\n" + hp.subsectionPlaceholder(1, "x")), "placeholder"));
  check("чужая строка-ссылка → отказ placeholder", throwsWith(() => hp.replaceSubsectionContent(GRAPH, "Методология построения графа", "<p>x</p>" + hp.subsectionPlaceholder(3, "x")), "placeholder"));
  check("пусто → отказ empty", throwsWith(() => hp.replaceSubsectionContent(GRAPH, "Методология построения графа", "  <p> </p> "), "empty"));
  check("длиннее предела → отказ too_long", throwsWith(() => hp.replaceSubsectionContent(GRAPH, "Методология построения графа", "<p>" + "я".repeat(hp.SUBSECTION_HTML_MAX) + "</p>"), "too_long"));
  const c = hp.replaceSubsectionContent(GRAPH, "Методология построения графа", '<div class="callout warning evil"><span class="callout-label">МЕТКА</span>текст</div><div class="callout note"><span class="risk high">ВЫСОКИЙ</span></div>');
  check("классы документа целы, чужой класс снят", c.html.includes('<div class="callout note"><span class="risk high">') && c.html.includes("<div><span class=\"callout-label\">"));
}

console.log("— правится разметка: битый ввод, голый текст, устойчивость круга —");
{
  const M = "Методология построения графа";
  const put = (h) => hp.replaceSubsectionContent(GRAPH, M, h);
  const inner = (h) => { const x = h.slice(h.indexOf(`<div data-section="${M}">`)); return x.slice(0, x.indexOf('<div data-section="Таблица категорий"')); };
  const bare = put("Первый абзац без тегов.\n\nВторой абзац, a < b & c.");
  check("текст без тегов → абзацы по пустой строке, спецзнаки экранированы", inner(bare.html).includes("<p>Первый абзац без тегов.</p>\n<p>Второй абзац, a &lt; b &amp; c.</p>"), inner(bare.html));
  const mixed = put("<p>в теге</p>\nхвост без тега");
  check("смешанный ввод: блок цел, хвост обёрнут в <p>", inner(mixed.html).includes("<p>в теге</p>\n<p>хвост без тега</p>"));
  const broken = put("<p>незакрытый <strong>жирный<p>второй</p><ul><li>раз<li>два</ul>");
  const bi = inner(broken.html);
  check("незакрытые теги закрыты разбором, обёртка подраздела не сломана", bi.trimEnd().endsWith("</div>") && bi.includes("<li>раз</li>") && bi.includes("<li>два</li>") && JSON.stringify(hp.listSubsectionNames(broken.html)) === JSON.stringify(hp.listSubsectionNames(GRAPH)), bi);
  check("после битого ввода соседние подразделы и замки на месте", er.lockedSubsectionsOf("graph", broken.html).length === 3);
  const esc = put("<p>текст</p></div></div><div data-x=\"1\">побег</div>");
  check("лишние </div> из обёртки не выводят: состав подразделов прежний", JSON.stringify(hp.listSubsectionNames(esc.html)) === JSON.stringify(hp.listSubsectionNames(GRAPH)) && !esc.html.includes("data-x"));
  check("набранное ПОСЛЕ лишнего </div> не пропадает", inner(esc.html).includes("<p>текст</p>") && inner(esc.html).includes("<div>побег</div>"), inner(esc.html));
  check("</textarea> и форма в разметке безвредны", !/<textarea|<form/i.test(put("<p>x</p></textarea><form><input></form><textarea>y</textarea>").html));
  // устойчивость круга: прочитал → сохранил → прочитал
  for (const [h, name] of [[GRAPH, "Топология графа"], [CRITIQUE, "Возражение 3"], [THESES, "Онтологические тезисы"]]) {
    const s1 = hp.readSubsectionSource(h, name).html;
    const r1 = hp.replaceSubsectionContent(h, name, s1.replace("</p>", " (правка)</p>"));
    const s2 = hp.readSubsectionSource(r1.html, name).html;
    const r2 = hp.replaceSubsectionContent(r1.html, name, s2);
    check(`круг устойчив: «${name}» — повторное сохранение прочитанного ничего не меняет`, r2.changed === false && s2 === s1.replace("</p>", " (правка)</p>"), s2);
  }
}

console.log("— вычисляемый заслон —");
{
  const names = (k, h) => er.lockedSubsectionsOf(k, h).map((l) => l.subsection);
  check("graph: три таблицы заперты", JSON.stringify(names("graph", GRAPH)) === JSON.stringify(["Таблица категорий", "Таблица связей", "Топологическая таблица"]), names("graph", GRAPH));
  check("graph: «Топология графа» и «Методология» свободны", !names("graph", GRAPH).includes("Топология графа") && !names("graph", GRAPH).includes("Методология построения графа"));
  check("запасной локатор: без «Топологической таблицы» заперта «Топология графа»", names("graph", GRAPH_FALLBACK).includes("Топология графа"));
  check("theses: только «Сводная таблица тезисов»", JSON.stringify(names("theses", THESES)) === JSON.stringify(["Сводная таблица тезисов"]));
  check("glossary: только «Таблица определений»", JSON.stringify(names("glossary", GLOSSARY)) === JSON.stringify(["Таблица определений"]));
  check("critique: восемь таблиц — не заперт НИ ОДИН", names("critique", CRITIQUE).length === 0);
  check("локаторы чужого раздела не действуют (graph-HTML под ключом critique)", names("critique", GRAPH).length === 0);
  check("заслон ≡ рендеру: locateDocTableHost по locatorsFor", hp.locateDocTableHost(GRAPH, er.locatorsFor("topology")) === "Топологическая таблица");
  const lk = ee.subsectionLockOf("theses", THESES, "Сводная таблица тезисов");
  check("замок таблицы говорит, чем править", lk?.reason === "table" && lk.table === "theses" && /карандаш/i.test(lk.hint));
  check("замок графа указывает на панель графа", /панел/i.test(ee.subsectionLockOf("graph", GRAPH, "Таблица связей").hint));
  check("проза не заперта", ee.subsectionLockOf("theses", THESES, "Онтологические тезисы") === null);
  check("капсула заперта по имени и по ключу, путь /capsule назван", ee.subsectionLockOf("sum", "", "Капсула")?.reason === "capsule" && /\/capsule/.test(ee.subsectionLockOf("capsule", "", "x").hint));
  check("lockedSubsectionNames(graph)", ee.lockedSubsectionNames("graph", GRAPH).length === 3);
}

console.log("— сохранность для потребителей —");
{
  const src = hp.readSubsectionSource(THESES, "Онтологические тезисы");
  const r = hp.replaceSubsectionContent(THESES, "Онтологические тезисы", src.html.replace("с опечаткой", "без опечатки"));
  const root = hp.parseFragment(r.html);
  check("findSubsection (2.2) находит по прежнему data-section", gs.findSubsection(root, "Онтологические тезисы") !== null);
  check("parseSubsectionsFromHTML — те же имена", JSON.stringify(gs.parseSubsectionsFromHTML(r.html, ["Онтологические тезисы", "Сводная таблица тезисов"]).map((s) => s.name)) === JSON.stringify(["Онтологические тезисы", "Сводная таблица тезисов"]));
  check("<strong>формулировка</strong> цел — replaceThesisParagraph находит абзац", hp.replaceThesisParagraph(r.html, "Бытие есть становление", "Бытие есть становление", "новое") !== null);
  check("extractSubsectionContent отдаёт новый текст", (gs.extractSubsectionContent(root, "Онтологические тезисы") ?? "").includes("без опечатки"));
}

console.log("— клиент —");
{
  const sv = await import("../client/src/components/document/SectionView.tsx");
  const se = await import("../client/src/utils/subsection-edit.ts");
  const { ApiError } = await import("../client/src/api/client.ts");
  const names = hp.listSubsectionNames(GRAPH);
  const locked = ee.lockedSubsectionNames("graph", GRAPH);
  const html = sv.enrichSectionHtml(GRAPH, "graph", names, { subsectionPencils: { locked } });
  const pencils = [...html.matchAll(/data-edit-subsection="([^"]+)"/g)].map((m) => m[1]);
  check("карандаш — только у незапертых", JSON.stringify(pencils) === JSON.stringify(["Методология построения графа", "Топология графа"]), pencils);
  check("карандаш — .inline-edit-btn на .inline-edit-host", /<h4 class="inline-edit-host">/.test(html) && /class="inline-edit-btn subsection-edit-btn"/.test(html));
  check("без subsectionPencils карандашей нет (гость, невладелец)", !sv.enrichSectionHtml(GRAPH, "graph", names).includes("data-edit-subsection"));
  const edit = { sectionKey: "graph", name: "Методология построения графа", phase: "ready", draft: "<p>Первый <strong>абзац</strong>.</p>", nested: [], error: null, warnings: [] };
  const eh = sv.enrichSectionHtml(GRAPH, "graph", names, { subsectionPencils: { locked }, subsectionEdit: edit });
  check("форма на месте подраздела, сразу под его <h4>", /<div data-section="Методология построения графа">(<a id="[^"]+"><\/a>)?<h4[^>]*>.*?<\/h4><div [^>]*class="inline-edit-form subsection-edit-form"/.test(eh));
  check("разметка в поле экранирована", eh.includes("&lt;p&gt;Первый &lt;strong&gt;абзац"));
  check("содержимое подраздела с экрана убрано, соседние целы", !eh.includes("<li>раз</li>") && eh.includes("<td>Бытие</td>"));
  check("при открытой форме карандашей нет", !eh.includes("data-edit-subsection"));
  check("«Сохранить» и «Отмена»", eh.includes('data-subsection-action="save"') && eh.includes('data-subsection-action="cancel"'));
  const ehErr = sv.enrichSectionHtml(GRAPH, "graph", names, { subsectionEdit: { ...edit, phase: "loading", error: "заперт" } });
  check("исходник не приехал: поля и «Сохранить» нет, отказ и «Отмена» есть", !ehErr.includes("<textarea") && !ehErr.includes('"save"') && ehErr.includes("заперт") && ehErr.includes('"cancel"'));
  const ehSaving = sv.enrichSectionHtml(GRAPH, "graph", names, { subsectionEdit: { ...edit, phase: "saving" } });
  check("сохранение: поле и кнопки погашены", (ehSaving.match(/disabled/g) ?? []).length >= 3);
  check("текст отказа SECTION_TABLE_LOCKED — сообщение сервера", se.subsectionErrorText(new ApiError("правьте карандашом в строке", "SECTION_TABLE_LOCKED", 409)) === "правьте карандашом в строке");
  check("текст отказа 409 генерации", /генерац/i.test(se.subsectionErrorText(new ApiError("x", "GENERATION_IN_PROGRESS", 409))));
  check("текст отказа разметки — details.html", se.subsectionErrorText(new ApiError("x", "VALIDATION_ERROR", 400, { html: "h4 нельзя" })).includes("h4 нельзя"));
}

console.log("— текстовые контракты —");
{
  const strip = (s) => s.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
  const routes = strip(rd("server/routes/sections.ts"));
  const writes = [...routes.matchAll(/sectionsRoutes\.(patch|post|put|delete)\(\s*"([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
  check("единственный пишущий маршрут — PATCH подраздела; маршрута на тело раздела НЕТ", JSON.stringify(writes) === JSON.stringify(["patch /:id/sections/:key/subsections/:name"]), writes);
  check("PATCH под requireAuth и ownerEditGate", /patch\("\/:id\/sections\/:key\/subsections\/:name", requireAuth[\s\S]*?ownerEditGate\(c, id, user\.id\)/.test(routes));
  check("SECTION_TABLE_LOCKED → 409", /SECTION_TABLE_LOCKED" \? 409/.test(routes));
  const editor = strip(rd("server/services/element-editor.ts"));
  const fn = editor.slice(editor.indexOf("export async function updateSubsection"));
  check("updateSubsection: версия section/manual со снимком ДО, is_edited, одна транзакция", /db\.transaction/.test(fn) && /createVersion\(\s*synthesisId,\s*row\.id,\s*"section",\s*snapshotOf\(row\),\s*"manual",\s*tx/.test(fn) && /isEdited: true/.test(fn));
  check("updateSubsection не зовёт applySectionSideEffects и spliceSubsectionHtml", !/applySectionSideEffects|spliceSubsectionHtml/.test(fn));
  check("заслон вычисляется, а не перечисляется: TABLE_SUBSECTIONS в правке подраздела не читается", !/TABLE_SUBSECTIONS/.test(fn) && !/TABLE_SUBSECTIONS/.test(strip(rd("server/services/element-renderer.ts")).split("export function lockedSubsectionsOf")[1].split("export interface ApplyResult")[0]));
  check("linkedom — только в html-parser", !/from "linkedom"/.test(editor) && !/from "linkedom"/.test(rd("server/services/element-renderer.ts")));
  check("ApiErrorCode клиента несёт SECTION_TABLE_LOCKED", rd("client/src/api/client.ts").includes('"SECTION_TABLE_LOCKED"'));
  const svSrc = strip(rd("client/src/components/document/SectionView.tsx"));
  check("SectionView без useEffect (4p)", !/useEffect/.test(svSrc));
  const css = rd("client/src/globals.css");
  const block = css.slice(css.indexOf("Беседа 9.2"), css.indexOf("Беседа 6.2 — биллинг"));
  check("блок 9.2 в части 3, до @tailwind utilities", block.length > 200 && css.indexOf("Беседа 9.2") < css.lastIndexOf("@tailwind utilities"));
  check("новых hex в блоке 9.2 нет", !/#[0-9a-fA-F]{3,8}\b/.test(block));
  const used = [...new Set([...rd("client/src/components/document/SectionView.tsx").replace(/"data-testid", "[^"]+"/g, "").matchAll(/"((?:[a-z][a-z0-9-]* ?)+)"/g)].flatMap((m) => m[1].split(" ")).filter((c) => /^subsection-edit-/.test(c)))];
  check("у каждого класса subsection-edit-* есть правило", used.length >= 5 && used.every((c) => block.includes("." + c)), used.filter((c) => !block.includes("." + c)));
  check("палитра закрыта: border-radius и box-shadow в блоке нет", !/border-radius|box-shadow/.test(block));
}

console.log(`\nИТОГ: ${n - failed} ✓ / ${failed} ✗ из ${n}`);
process.exit(failed ? 1 : 0);
