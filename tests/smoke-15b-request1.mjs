/**
 * Смоук запроса 1 беседы 1.5b (без БД и браузера).
 *
 * Байтовая сверка клиентского порта client/src/utils/concept-file.ts с
 * функциями исходника (vm-исполнение) на синтетическом концепт-файле.
 * DOM для ОБЕИХ сторон — linkedom (грабля 1.3: linkedom-innerText ≈
 * textContent; стороны в равных условиях, браузерная семантика detached
 * innerText тоже = textContent по спецификации).
 *
 * Стабы vm: reconstructGenealogy → null, restoreCapsulesFromHTML → noop
 * (отступление 1 порта — генеалогия отложена к 3.1/3.2; сверяем при
 * одинаковом стабе), confirm → управляемый.
 *
 * Запуск: npx tsx tests/smoke-15b-request1.mjs
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { DOMParser, parseHTML } from "linkedom";

let pass = 0,
  fail = 0;
function check(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log("  ✓ " + name);
  } else {
    fail++;
    console.log("  ✗ " + name + (extra ? " — " + extra : ""));
  }
}
function eq(name, a, b) {
  const ok = a === b;
  check(name, ok, ok ? "" : JSON.stringify({ port: a, src: b }).slice(0, 300));
}

/* ── Глобали для клиентского модуля (браузерные API) ── */
const { document: liveDoc, window: liveWin } = parseHTML(
  "<html><body></body></html>",
);
globalThis.DOMParser = DOMParser;
globalThis.document = liveDoc;
globalThis.window = liveWin;
let confirmAnswer = true;
liveWin.confirm = () => confirmAnswer;
globalThis.window.confirm = liveWin.confirm;

/* ── Порт ── */
const port = await import("../client/src/utils/concept-file.ts");

/* ── Исходник через vm ── */
const src = readFileSync(new URL("../source/philosynth.html", import.meta.url), "utf8");
const lines = src.split("\n");
const slice = (a, b) => lines.slice(a - 1, b).join("\n");

// Диапазоны сверены с баннерами фрагмента 1.5b и grep-якорями
const code = [
  slice(5413, 5466), // TITLE_TO_KEY + titleToKey
  slice(7953, 8149), // extractSection … extractGraphEdgesTable (+ tableToText, truncateText, extractNameTitle, компакт-варианты)
  slice(8150, 8271), // extractContextFragment
  slice(11720, 11739), // extractCapsuleText
  slice(21356, 21543), // extractMetadata … extractEmbeddedState
  slice(4617, 4671), // parseConceptFile
  slice(22009, 22176), // importConceptAsParticipant
].join("\n");

const { REVERSE_ML, REVERSE_DL, REVERSE_SL } = await import(
  "../packages/shared/constants/labels.ts"
);
const { KEY_LABELS } = await import(
  "../packages/shared/constants/section-labels.ts"
);

const ctx = {
  console,
  Date,
  Math,
  JSON,
  Array,
  Object,
  Set,
  URL,
  parseFloat,
  parseInt,
  DOMParser,
  document: liveDoc,
  confirm: (msg) => confirmAnswer,
  alert: () => {},
  REVERSE_ML,
  REVERSE_DL,
  REVERSE_SL,
  KEY_LABELS,
  DOC_STATE: { capsuleHTML: "" }, // ветка capsule:full не задействуется
  reconstructGenealogy: () => null, // стаб (см. шапку)
  restoreCapsulesFromHTML: () => {},
};
vm.createContext(ctx);
new vm.Script(code, { filename: "philosynth-slice.js" }).runInContext(ctx);

/* ── Синтетический концепт-файл ── */
const catRows = [];
for (let i = 1; i <= 9; i++) {
  const cen = (0.15 + 0.09 * i).toFixed(2); // разные центральности → top-7
  catRows.push(
    `<tr><td>Категория ${i}</td><td>онтологическая</td><td>Определение категории ${i}, весьма содержательное.</td><td>${cen}</td><td>0.5</td></tr>`,
  );
}
const conceptHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
<div id="docOutput">
  <h1 id="docTitle">Хронотопика обязательства</h1>
  <div id="docSubtitle">На основе: Кант, Гегель</div>
  <span id="docMethod">Диалектический</span>
  <span id="docDepth">Стандартная</span>
  <span id="docSynthLevel">Сравнительный</span>
  <span id="docNum">SYN-001</span>
  <div id="docHeaderExtras">
    <details class="header-disclosure"><summary>Зерно</summary><div class="disclosure-body">время как ткань обязательств</div></details>
    <details class="header-disclosure"><summary>Контекст</summary><div class="disclosure-body">фокус на этике</div></details>
    <details class="header-disclosure header-disclosure-capsule"><summary>◈ Капсула концепции</summary><div class="disclosure-body">Капсула Хронотопика связывает время и долг в единую ткань.</div></details>
  </div>
  <div id="docBodies">
    <div class="doc-body" data-section-key="sum">
      <div class="doc-section"><span class="section-num">§ 1</span><span class="section-title">Исполнительное резюме синтеза</span>
        <div data-section="Цели и метод"><h4>Цели и метод</h4><p>Цель — синтезировать темпоральную этику.</p></div>
        <div data-section="Портрет каждого философа"><h4>Портреты</h4><p>Кант: долг. Гегель: развитие.</p></div>
        <div data-section="Ключевые напряжения"><h4>Напряжения</h4><p>Формализм против историзма.</p></div>
      </div>
    </div>
    <div class="doc-body" data-section-key="graph">
      <div class="doc-section"><span class="section-num">§ 2</span><span class="section-title">Граф категорий</span>
        <table class="doc-table"><thead><tr><th>Категория</th><th>Тип</th><th>Определение</th><th>Центральность</th><th>Определённость</th></tr></thead>
        <tbody>${catRows.join("")}</tbody></table>
        <table class="doc-table"><thead><tr><th>Источник</th><th>Цель</th><th>Тип связи</th><th>Направление</th></tr></thead>
        <tbody><tr><td>Категория 1</td><td>Категория 2</td><td>диалектическая</td><td>однонаправленная</td></tr></tbody></table>
      </div>
    </div>
    <div class="doc-body" data-section-key="glossary">
      <div class="doc-section"><span class="section-num">§ 3</span><span class="section-title">Глоссарий терминов</span>
        <table class="doc-table"><thead><tr><th>Термин</th><th>Определение</th><th>Статус</th></tr></thead>
        <tbody><tr><td>Хронотоп</td><td>Единство времени и места обязательства</td><td>new</td></tr>
        <tr><td>Долг</td><td>Темпорально протяжённое требование</td><td>redefined</td></tr></tbody></table>
      </div>
    </div>
    <div class="doc-body" data-section-key="theses">
      <div class="doc-section"><span class="section-num">§ 4</span><span class="section-title">Корпус тезисов</span>
        <div data-section="Сводная таблица тезисов"><h4>Сводная таблица</h4>
          <table class="doc-table"><thead><tr><th>№</th><th>Тезис</th></tr></thead>
          <tbody><tr><td>1.</td><td>Время конституируется обязательством.</td></tr>
          <tr><td>2.</td><td>Обязательство темпорально.</td></tr></tbody></table>
        </div>
      </div>
    </div>
    <div class="doc-body" data-section-key="dialogue">
      <div class="doc-section"><span class="section-num">§ 5</span><span class="section-title">Диалог между традициями</span>
        <div data-section="Итоговая таблица диалога"><h4>Итоговая таблица</h4>
          <table class="doc-table"><thead><tr><th>Понятие</th><th>Автор</th></tr></thead>
          <tbody><tr><td>Темпоральный долг</td><td>Кант*</td></tr></tbody></table>
        </div>
        <div data-section="Аналитический комментарий"><h4>Аналитический комментарий</h4><p>Диалог выявил сдвиг от формы к истории.</p></div>
      </div>
    </div>
    <div class="doc-body" data-section-key="critique">
      <div class="doc-section"><span class="section-num">§ 6</span><span class="section-title">Критический анализ</span><p>Слабое место — эмпирика.</p></div>
    </div>
  </div>
</div>
<script type="application/json" id="philosynth-state">{"version":2,"params":{"generationOrder":"genetic"},"capsuleHTML":"<div data-section=\\"Капсула\\"><h4>Капсула</h4><p>Хронотопика связывает время и долг в единую ткань обязательств.</p></div>"}</script>
</body></html>`;

/* ── 1. parseConceptFile: порт vs исходник ── */
console.log("1. parseConceptFile (порт vs исходник)");
confirmAnswer = true;
const pPort = port.parseConceptFile(conceptHTML, "concept-1.html");
const pSrc = ctx.parseConceptFile(conceptHTML, "concept-1.html");
eq("name", pPort.name, pSrc.name);
eq("realName≠default", pPort.realName, "Хронотопика обязательства");
eq("subtitle", pPort.subtitle, pSrc.subtitle);
eq("method", pPort.method, pSrc.method);
eq("synthLevel", pPort.synthLevel, pSrc.synthLevel);
eq("generationOrder (embedded)", pPort.generationOrder, "genetic");
eq("sources", pPort.sources.join(","), pSrc.sources.join(","));
check("participant есть у обоих", !!pPort.participant && !!pSrc.participant);
check(
  "participantError null у обоих",
  pPort.participantError === null && pSrc.participantError === null,
);

/* ── 2. importConceptAsParticipant: побайтово по полям ── */
console.log("2. importConceptAsParticipant (побайтово)");
const a = pPort.participant, b = pSrc.participant;
for (const f of [
  "capsule", "graphNodes", "graphEdges", "dialogueConcepts",
  "dialogueSynthesis", "glossaryCompact", "thesesSummary",
  "goals", "tensions", "portraits", "method", "synthLevel", "seed",
]) eq(f, a[f], b[f]);
eq("_nodeCount", a._nodeCount, b._nodeCount);
eq("_thesesCount", a._thesesCount, b._thesesCount);
check("капсула из embeddedState (приоритет 1)", a.capsule.includes("единую ткань обязательств"));
check("graphNodes = top-7 (9 строк → 7 данных + 3 заголовка)",
  a.graphNodes.split("\n").length === 10,
  String(a.graphNodes.split("\n").length));
check("top-7 отсортирован по центральности (первая — Категория 9)",
  (a.graphNodes.split("\n")[3] ?? "").startsWith("Категория 9"));
check("genealogy=null (отступление 1)", a.genealogy === null && b.genealogy === null);

/* ── 3. Непригодный файл (без glossary) ── */
console.log("3. Непригодность: без глоссария");
const badHTML = conceptHTML.replace('data-section-key="glossary"', 'data-section-key="glossary-removed"')
  .replace("Глоссарий терминов", "Прочее ненужное");
let errPort = null, errSrc = null;
try { port.importConceptAsParticipant(badHTML, "bad.html"); } catch (e) { errPort = e.message; }
try { ctx.importConceptAsParticipant(badHTML, "bad.html"); } catch (e) { errSrc = e.message; }
eq("текст ошибки совпадает", errPort, errSrc);
check("ошибка называет глоссарий", (errPort ?? "").includes("не пригодна"));
const pBad = port.parseConceptFile(badHTML, "bad.html");
check("parseConceptFile: participant=null + participantError", pBad.participant === null && !!pBad.participantError);

/* ── 4. Мягкие предупреждения: confirm-отмена ── */
console.log("4. Мягкие предупреждения (нет диалога) + отмена confirm");
const noDlg = conceptHTML
  .replace('data-section-key="dialogue"', 'data-section-key="dlg-removed"')
  .replace("Диалог между традициями", "Беседа сторон о прочем");
confirmAnswer = false;
const rPort = port.importConceptAsParticipant(noDlg, "nodlg.html");
const rSrc = ctx.importConceptAsParticipant(noDlg, "nodlg.html");
check("отмена → null у обоих", rPort === null && rSrc === null);
confirmAnswer = true;
const okPort = port.importConceptAsParticipant(noDlg, "nodlg.html");
const okSrc = ctx.importConceptAsParticipant(noDlg, "nodlg.html");
check("подтверждение → участник у обоих", !!okPort && !!okSrc);
eq("dialogueConcepts пуст (нет диалога)", okPort?.dialogueConcepts ?? "", okSrc?.dialogueConcepts ?? "");

/* ── 5. titleToKey выборочно ── */
console.log("5. titleToKey");
for (const [t, k] of [
  ["§ 3 — Глоссарий терминов", "glossary"],
  ["Исполнительное резюме синтеза", "sum"],
  ["Некий критический разбор", "critique"],
  ["Совсем непонятный заголовок", null],
]) eq(`"${t}" → ${k}`, port.titleToKey(t), ctx.titleToKey(t));

console.log(`\nИтого: ${pass} ✓, ${fail} ✗`);
process.exit(fail ? 1 : 0);
