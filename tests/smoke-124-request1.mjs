/**
 * Смоук беседы 12.4 (запрос 1) — чистые функции, без БД и браузера.
 *  A. Д-35: findThesisByLabel / thesisLabelOf (SynthesisPage) — метка первой
 *     ячейки побеждает индекс строки; номер — у тезиса без метки; индекс —
 *     только запасной ход.
 *  B. Д-34: subsectionEditNotes (utils/subsection-edit) — заметки о новом
 *     названии и сведённых тезисах; без следствий — пусто.
 *  C. Д-41: бейдж схемы — клиентский schemaBadgeText (под ru-провайдером —
 *     русский текст) ≡ серверному schemaBadgeTextRu; renderSchemaBadge —
 *     только при концепции среди участников; isMetaSynthesisOf — связь БД
 *     либо узел дерева файла.
 *  D. Д-14: diffSnapshots (VersionHistory) на снимках раздела — htmlContent
 *     сравнивается текстом, key/sectionNum не показываются; versionPreview
 *     снимка раздела — текст без тегов.
 *  E. Д-19: estimateSynthesisFull/estimateSynthesis — одна точка запроса
 *     (estimateSynthesis — обёртка над полным ответом): подмена fetch.
 *  F. Д-17: useSecondStep — модуль импортируется, экспорт на месте (сам хук
 *     проверяется в браузере, тестовые запросы).
 *  G. Д-7/Д-44/Д-48 — текстовые контракты (как в стороже 4bc): футер без
 *     «(оценка — с ними)», панель читает issues[].level, вводная без
 *     «Документ цел».
 * Запуск: node_modules/.bin/tsx tests/smoke-124-request1.mjs
 */
import { readFile } from "node:fs/promises";

let ok = 0, bad = 0;
const t = (name, cond, extra = "") => { if (cond) { ok++; console.log(`  ✓ ${name}`); } else { bad++; console.log(`  ✗ ${name} ${extra}`); } };
const J = (o) => JSON.stringify(o);
const rd = (rel) => readFile(new URL(rel, import.meta.url), "utf8");
const strip = (src) => src.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

console.log("A. Д-35: тезис по метке");
const SP = await import("../client/src/pages/SynthesisPage.tsx");
const th = [
  { label: "О-1", thesisNum: 1 },
  { label: "Э-2", thesisNum: 2 },
  { label: null, thesisNum: 3 },
  { label: "Э-3", thesisNum: 4 },
];
t("thesisLabelOf: метка либо номер", SP.thesisLabelOf(th[0]) === "О-1" && SP.thesisLabelOf(th[2]) === "3");
t("по метке «Э-2» при индексе строки 0", SP.findThesisByLabel(th, "Э-2", 0)?.thesisNum === 2);
t("по метке «Э-3» (не по номеру 3)", SP.findThesisByLabel(th, "Э-3", 0)?.thesisNum === 4);
t("регистр и пробелы схлопнуты", SP.findThesisByLabel(th, "  о-1 ", 3)?.thesisNum === 1);
t("число — по номеру тезиса без метки", SP.findThesisByLabel(th, "3", 0)?.thesisNum === 3);
t("метка не сошлась → индекс строки (документ без меток / таблица правлена)", SP.findThesisByLabel(th, "нет такой", 1)?.thesisNum === 2);
t("пустая ячейка → индекс", SP.findThesisByLabel(th, "", 3)?.thesisNum === 4);
t("пусто и индекс вне таблицы → undefined", SP.findThesisByLabel(th, "", 9) === undefined);

console.log("B. Д-34: заметки о следствиях правки");
const SE = await import("../client/src/utils/subsection-edit.ts");
t("нет следствий → пусто", SE.subsectionEditNotes({}).length === 0 && SE.subsectionEditNotes({ thesesUpdated: [] }).length === 0);
const n1 = SE.subsectionEditNotes({ titleUpdated: "Онтология паузы" });
t("название обновлено — одна заметка с названием", n1.length === 1 && n1[0].includes("«Онтология паузы»"), J(n1));
const n2 = SE.subsectionEditNotes({ thesesUpdated: [{ id: "a", label: "Э-2", fields: ["formulation", "justification"] }, { id: "b", label: "4", fields: ["justification"] }] });
t("тезисы сведены — метки и поля", n2.length === 1 && n2[0].includes("Э-2 (формулировка, обоснование)") && n2[0].includes("4 (обоснование)"), J(n2));
t("оба следствия — две заметки, название первой", SE.subsectionEditNotes({ titleUpdated: "X", thesesUpdated: [{ id: "a", label: "1", fields: ["formulation"] }] }).length === 2);

console.log("C. Д-41: бейдж схемы родительского контекста");
const DH = await import("../client/src/components/document/DocumentHeader.tsx");
const HX = await import("../server/services/export/html-exporter.ts");
for (const sch of ["selective-v1", "monolithic"]) t(`текст бейджа клиент ≡ выгрузка (${sch})`, DH.schemaBadgeText(sch) === HX.schemaBadgeTextRu(sch), `${DH.schemaBadgeText(sch)} ≠ ${HX.schemaBadgeTextRu(sch)}`);
t("неизвестная схема — как есть", DH.schemaBadgeText("v9") === "◈ родительский контекст: v9" && HX.schemaBadgeTextRu("v9") === "◈ родительский контекст: v9");
t("isMetaSynthesisOf: философы — нет", !DH.isMetaSynthesisOf({ parentSyntheses: [], fileConceptParents: [] }));
t("isMetaSynthesisOf: связь БД — да", DH.isMetaSynthesisOf({ parentSyntheses: [{ id: "p", title: "Р" }], fileConceptParents: [] }));
t("isMetaSynthesisOf: узел дерева файла — да", DH.isMetaSynthesisOf({ parentSyntheses: [], fileConceptParents: ["Р"] }));
const rootPhil = { type: "concept", name: "r", participants: [{ type: "philosopher", name: "Кант" }] };
const rootMeta = { type: "concept", name: "r", participants: [{ type: "philosopher", name: "Кант" }, { type: "concept", name: "Р", participants: [] }] };
t("renderSchemaBadge: без дерева / одни философы — пусто", HX.renderSchemaBadge("selective-v1", null) === "" && HX.renderSchemaBadge("selective-v1", rootPhil) === "");
const b = HX.renderSchemaBadge("monolithic", rootMeta);
t("renderSchemaBadge: мета-синтез — span.header-schema-badge с русским текстом", /^<span class="header-schema-badge" style="[^"]+">◈ родительский контекст: монолитный \(legacy\)<\/span>$/.test(b), b);
t("renderSchemaBadge экранирует значение схемы", HX.renderSchemaBadge("<x>", rootMeta).includes("&lt;x&gt;"));

console.log("D. Д-14: снимок раздела в diff");
const VH = await import("../client/src/components/edit/VersionHistory.tsx");
const older = { id: "s1", synthesisId: "x", key: "sum", sectionNum: 1, title: "Резюме", htmlContent: "<div data-section=\"Цели\"><h4>Цели</h4><p>Было   так.</p></div>", secContext: "", isEdited: false, createdAt: "2026-10-01T00:00:00Z" };
const newer = { ...older, htmlContent: "<div data-section=\"Цели\"><h4>Цели</h4><p>Стало так.</p></div>", isEdited: true };
const diff = VH.diffSnapshots(older, newer);
const texts = diff.map((l) => `${l.kind}:${l.text}`);
t("htmlContent сравнивается текстом (тегов нет)", texts.includes("del:Цели Было так.") && texts.includes("add:Цели Стало так."), J(texts));
t("key/sectionNum/служебные не показываются", !texts.some((x) => /\bkey\b|sectionNum|synthesisId|createdAt/.test(x)), J(texts));
t("isEdited подписана", texts.some((x) => x.startsWith("ctx:Пометка «изменён»:")), J(texts));
t("versionPreview снимка раздела — текст без тегов", VH.versionPreview(older) === "Цели Было так.");

console.log("E. Д-19: /estimate — одна точка запроса");
const API = await import("../client/src/api/syntheses.ts");
const calls = [];
const prevFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), body: init?.body });
  return new Response(JSON.stringify({ estimate: { inTokens: 10, outTokens: 5, cost: 0.01, passes: 1 }, contextBudget: 48000 }), { status: 200, headers: { "content-type": "application/json" } });
};
try {
  const full = await API.estimateSynthesisFull({ seed: "s", sections: ["sum"], method: "dialectical", depth: "standard", synthLevel: "comparative" });
  t("estimateSynthesisFull отдаёт contextBudget", full.contextBudget === 48000 && full.estimate.cost === 0.01, J(full));
  const est = await API.estimateSynthesis({ seed: "s", sections: ["sum"], method: "dialectical", depth: "standard", synthLevel: "comparative" });
  t("estimateSynthesis — только estimate", est.cost === 0.01 && !("contextBudget" in est));
  t("оба идут в POST /syntheses/estimate", calls.length === 2 && calls.every((c) => c.url.endsWith("/syntheses/estimate")), J(calls.map((c) => c.url)));
} finally {
  globalThis.fetch = prevFetch;
}

console.log("F. Д-17: второй шаг кнопок");
const SS = await import("../client/src/hooks/useSecondStep.ts");
t("useSecondStep экспортирован", typeof SS.useSecondStep === "function");
const ssSrc = strip(await rd("../client/src/hooks/useSecondStep.ts"));
t("сброс по mousedown мимо контейнера", /addEventListener\("mousedown", onDown\)/.test(ssSrc) && /!el\.contains\(ev\.target\)/.test(ssSrc));
for (const [rel, re] of [
  ["../client/src/pages/ProfilePage.tsx", /"Точно удалить\?"/],
  ["../client/src/pages/BillingPage.tsx", /"Точно удалить\?"/],
  ["../client/src/pages/AdminPromptsPage.tsx", /"Точно снять права\?"/],
  ["../client/src/components/synthesis/GenerationProgress.tsx", /"Точно остановить\?"/],
]) {
  const src = await rd(rel);
  t(`${rel.split("/").pop()}: второй шаг есть, confirm на необратимом снят`, re.test(src) && /useSecondStep(?:<[^>]*>)?\(/.test(src));
}
const ap = strip(await rd("../client/src/pages/AdminPromptsPage.tsx"));
t("AdminPromptsPage: confirm на обратимых (активация, уход с несохранённого) остался — ровно четыре", (ap.match(/window\.confirm\(/g) ?? []).length === 4);
for (const rel of ["../client/src/pages/SynthesisPage.tsx", "../client/src/pages/CreateSynthesisPage.tsx"]) {
  const src = strip(await rd(rel));
  t(`${rel.split("/").pop()}: window.confirm нет вовсе (Д-2/Д-17)`, !/window\.confirm|\bconfirm\(/.test(src));
}

console.log("G. текстовые контракты Д-7 / Д-44 / Д-48");
const em = strip(await rd("../client/src/components/edit/EditModal.tsx"));
t("футер EditModal без «(оценка — с ними)» и собственного счёта pending", !/оценка — с ними/.test(em) && !/pending \+= 1/.test(em) && /plan\.cascadePending\.costUsd/.test(em));
const rp = strip(await rd("../client/src/components/edit/RecommendationsPanel.tsx"));
t("панель: замечание по issues[].level", /i\.level === "warning"/.test(rp) && /data-testid="rec-warning"/.test(rp));
const sv = await rd("../client/src/components/document/SectionView.tsx");
t("вводная блока предупреждений не обещает «Документ цел»", !/Документ цел/.test(sv) && /пропуски/.test(sv));
t("заголовок блока — «Замечания к последней генерации»", /Замечания к последней генерации/.test(sv) && !/Разобран с потерями/.test(sv));

console.log(`\nИТОГ smoke-124: ${ok} ✓ / ${bad} ✗`);
process.exit(bad ? 1 : 0);
