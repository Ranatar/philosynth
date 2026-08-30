/**
 * Смоук чистых ядер import-service (беседа 4.3, запрос 1; без БД).
 * Проверяет разбор ОБОИХ входных форматов:
 *  (A) standalone-стиль — шапка с id (#docTitle/#docMethod/#docHeaderExtras),
 *      embedded state c legacy-полями (cost, type: 'version-marker');
 *  (B) стиль серверного экспорта 4.2 — шапка по классам
 *      (.doc-title/.doc-meta-grid), participants type='synthesis'.
 * Запуск: node_modules/.bin/tsx tests/smoke-43-request1.mjs
 * (npx tsx в этом контейнере лезет в сеть и виснет — грабля 4.2)
 */
import {
  extractEmbeddedState,
  extractMetadata,
  extractModesFromHTML,
  extractSections,
  isPlaceholderConceptName,
  normalizeGenealogyNames,
  reconstructGenealogy,
  resolveConceptName,
  restoreCapsulesFromHTML,
  titleToKey,
  validateImportMeta,
} from "../server/services/import-service.ts";
import { parseDocument } from "../server/utils/html-parser.ts";

let n = 0;
let failed = 0;
function check(name, cond) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

/* ── (A) standalone-стиль ────────────────────────────────────────────── */

const stateA = {
  version: 2,
  parentContextSchema: "selective-v1",
  genLog: [
    {
      sectionKey: "sum",
      sectionLabel: "Резюме",
      status: "done",
      source: "initial",
      inputTokens: 100,
      outputTokens: 200,
      cost: 0.0123,
      secCtxPreview: "превью…",
      subsections: ["Портрет"],
    },
    { type: "version-marker", version: "v2", timestamp: "2026-08-01T10:00:00Z" },
  ],
  ctxLog: [
    {
      sectionKey: "graph",
      budget: 9000,
      totalUsed: 4000,
      reqFound: 2,
      reqTotal: 2,
      optIncluded: 1,
      optTotal: 3,
      budgetMode: "shrink",
      entries: [{ key: "sum:goals", status: "found", len: 500, priority: "required" }],
      parentSpec: { required: [], optional: [], perParent: [], totalChars: 0 },
    },
  ],
  genCommon: { sysChars: 3000 },
  params: {
    seed: "зерно А",
    phil: ["Кант", "Гегель"],
    sec: ["graph"],
    method: "dialectical",
    depth: "standard",
    synthLevel: "comparative",
    ctx: "",
    secCtx: { graph: "контекст графа из params" },
    lang: "Russian",
  },
  sectionOrder: ["sum", "graph"],
  editedSections: ["graph"],
  docVersion: { base: 2, sub: 1, modes: 0, modeRegen: 0 },
  participants: [
    { type: "philosopher", name: "Кант" },
    { type: "philosopher", name: "Гегель" },
  ],
  genealogy: null,
  structureSections: null,
  pausedState: null,
};

const htmlA = `<!DOCTYPE html><html><body>
<div id="docOutput">
  <div id="docTitle">Синтез Философской Концепции</div>
  <div id="docSubtitle">На основе: Кант, Гегель</div>
  <span id="docNum">PS-1234-ABCD</span>
  <span id="docMethod">Диалектический</span>
  <span id="docDepth">Стандартная</span>
  <span id="docSynthLevel">Сравнительный</span>
  <div id="docHeaderExtras">
    <details class="header-disclosure"><summary>Зерно концепции</summary><div class="disclosure-body">зерно А</div></details>
    <details class="header-disclosure-capsule"><summary>◈ Капсула</summary><div class="disclosure-body">Текст капсулы</div></details>
  </div>
  <div id="docBodies">
    <div class="doc-body" data-section-key="sum">
      <div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">Исполнительное резюме синтеза</div>
        <div class="doc-content"><p>Резюме</p></div></div>
    </div>
    <div class="doc-body" data-section-key="graph">
      <details class="sec-disclosure"><summary>Контекст</summary><div class="disclosure-body">secCtx из файла</div></details>
      <div class="doc-section"><div class="section-num">§ 2</div><div class="section-title">Граф категорий</div><div class="doc-content"></div></div>
    </div>
    <div class="doc-body" data-section-key="name">
      <div class="doc-section"><div class="section-num">§ 3</div><div class="section-title">Название концепции и его анализ</div>
        <div class="doc-content"><div data-section="Итоговая рекомендация"><strong>«Диалектика горизонта»</strong></div></div></div>
    </div>
    <div class="doc-section"><div class="section-num">§ 4</div><div class="section-title">Неизвестный раздел XYZ</div></div>
  </div>
  <span id="footerPhil">Кант, Гегель</span>
</div>
<div id="philosynth-modes" style="display:none">
  <div class="philosynth-mode" data-mode-key="adversarial" data-mode-param="Ницше" data-mode-timestamp="2026-08-02T12:00:00Z">
    <div class="philosynth-mode-body"><p>Критика Ницше</p></div>
  </div>
</div>
<script type="application/json" id="philosynth-state">${JSON.stringify(stateA)}</script>
</body></html>`;

console.log("── (A) standalone-стиль ──");
const docA = parseDocument(htmlA);
check("docOutput найден", docA.getElementById("docOutput") !== null);

const metaA = extractMetadata(docA);
check("phil из footerPhil", metaA.phil.join(",") === "Кант,Гегель");
check("method обратным маппингом", metaA.method === "dialectical");
check("depth/synthLevel", metaA.depth === "standard" && metaA.synthLevel === "comparative");
check("seed из disclosure", metaA.seed === "зерно А");
check("капсула из header-disclosure-capsule", metaA.capsuleText === "Текст капсулы");
check("docNum по id", metaA.docNum === "PS-1234-ABCD");

const warnA = [];
const secsA = extractSections(docA, warnA);
check("извлечено 3 раздела (XYZ пропущен)", secsA.length === 3);
check("пропуск XYZ дал предупреждение", warnA.some((w) => w.field === "sections"));
check("ключи по titleToKey", secsA.map((s) => s.key).join(",") === "sum,graph,name");
check("html = outerHTML .doc-section (без sec-disclosure)",
  secsA[1].html.includes('class="doc-section"') && !secsA[1].html.includes("sec-disclosure"));
check("secCtx из sec-disclosure родителя", secsA[1].secCtx === "secCtx из файла");
check("сортировка по §", secsA[0].num === 1 && secsA[1].num === 2);

const embA = extractEmbeddedState(docA);
check("embedded state распарсен", embA !== null && embA.version === 2);

const vwA = validateImportMeta(metaA, embA);
check("валидных метаданных — 0 предупреждений", vwA.length === 0);

const modesA = extractModesFromHTML(docA);
check("режим adversarial из формата 2", modesA.adversarial?.length === 1
  && modesA.adversarial[0].param === "Ницше"
  && modesA.adversarial[0].html.includes("Критика Ницше"));

const genA = reconstructGenealogy(metaA, embA, docA);
check("генеалогия из participants embedded state", genA.participants?.length === 2
  && genA.participants.every((p) => p.type === "philosopher"));
check("имя корня из раздела name (плейсхолдер docTitle)",
  genA.name === "Диалектика горизонта");

/* ── (B) стиль серверного экспорта 4.2 (классы, type='synthesis') ───── */

const stateB = {
  ...stateA,
  params: { ...stateA.params, phil: ["Кант"] },
  participants: [
    { type: "philosopher", name: "Кант" },
    { type: "synthesis", name: "Родительская концепция", synthesisId: "11111111-2222-3333-4444-555555555555", genealogy: null },
  ],
  genealogy: {
    type: "concept", name: "Импортированный документ", method: "dialectical",
    synthLevel: "comparative", seed: "s",
    participants: [
      { type: "philosopher", name: "Кант" },
      { type: "concept", name: "?", synthesisId: "11111111-2222-3333-4444-555555555555" },
    ],
  },
};

const htmlB = `<!DOCTYPE html><html><body><div id="docOutput">
  <div class="doc-header">
    <div class="doc-type">PhiloSynth Pro™</div>
    <div class="doc-title">Мета-синтез Б</div>
    <div class="doc-subtitle">На основе: Кант + Родительская концепция</div>
    <details class="header-disclosure"><summary>Зерно концепции</summary><div class="disclosure-body">зерно Б</div></details>
    <div class="doc-meta-grid">
      <div class="doc-meta-item"><span class="doc-meta-key">Документ №</span><span class="doc-meta-val">PS-9999-ZZZZ</span></div>
      <div class="doc-meta-item"><span class="doc-meta-key">Метод синтеза</span><span class="doc-meta-val gold">Диалектический</span></div>
      <div class="doc-meta-item"><span class="doc-meta-key">Глубина</span><span class="doc-meta-val gold">Стандартная</span></div>
      <div class="doc-meta-item"><span class="doc-meta-key">Уровень синтеза</span><span class="doc-meta-val gold">Сравнительный</span></div>
    </div>
  </div>
  <div class="doc-body"><a id="sec-sum"></a><div class="doc-section">
    <div class="section-num">§ 1</div><div class="section-title">Исполнительное резюме синтеза</div><div class="doc-content"><p>Т</p></div>
  </div></div>
  <div class="gen-card"><span class="gen-card-name">◈ Родительская концепция</span><div class="gen-card-capsule-body">Капсула родителя</div></div>
</div>
<script type="application/json" id="philosynth-state">${JSON.stringify(stateB)}</script>
</body></html>`;

console.log("── (B) экспорт сервиса 4.2 ──");
const docB = parseDocument(htmlB);
const metaB = extractMetadata(docB);
check("phil из .doc-subtitle (нет footerPhil; КВИРК исходника: split по запятой не режет « + » мета-синтеза — при импорте перекрывается params.phil)",
  metaB.phil.length === 1 && metaB.phil[0] === "Кант + Родительская концепция");
check("method из .doc-meta-grid", metaB.method === "dialectical");
check("depth/synthLevel из meta-grid", metaB.depth === "standard" && metaB.synthLevel === "comparative");
check("docNum из meta-grid", metaB.docNum === "PS-9999-ZZZZ");
check("seed из disclosure в .doc-header", metaB.seed === "зерно Б");
check("валидация B без ложных предупреждений",
  validateImportMeta(metaB, stateB).length === 0);

const secsB = extractSections(docB, []);
check("раздел sum извлечён; html без якоря sec-*",
  secsB.length === 1 && !secsB[0].html.includes('id="sec-sum"'));

// reconstructGenealogy при stateB.genealogy = null: участники 'synthesis'
const genB = reconstructGenealogy(metaB, { ...stateB, genealogy: null }, docB);
check("участник type='synthesis' распознан концепцией (адаптация 4)",
  genB.participants?.some((p) => p.type !== "philosopher" && p.synthesisId === "11111111-2222-3333-4444-555555555555"));
check("имя корня — .doc-title (не плейсхолдер)", genB.name === "Мета-синтез Б");

// normalize + капсулы из .gen-card
const norm = normalizeGenealogyNames(stateB.genealogy, "Мета-синтез Б");
check("normalizeGenealogyNames: '?' → «[безымянная концепция]»",
  norm.participants[1].name === "[безымянная концепция]");
restoreCapsulesFromHTML(stateB.genealogy, docB);
check("restoreCapsulesFromHTML: капсула из .gen-card",
  stateB.genealogy.participants[1].capsule === undefined /* имя '?' ≠ имени карточки */);
const genTree = { type: "concept", name: "x", participants: [{ type: "concept", name: "Родительская концепция" }] };
restoreCapsulesFromHTML(genTree, docB);
check("restoreCapsulesFromHTML: совпадение имени → капсула заполнена",
  genTree.participants[0].capsule === "Капсула родителя");

// Мелкие ядра
check("titleToKey: ключевые слова", titleToKey("§ 4 — Корпус тезисов концепции") === "theses");
check("isPlaceholderConceptName", isPlaceholderConceptName("Импортированный документ")
  && !isPlaceholderConceptName("Диалектика горизонта"));
check("resolveConceptName fallback по .section-title (без data-section-key)",
  resolveConceptName(parseDocument(`<html><body><div id="docOutput"><div class="doc-title">—</div>
  <div class="doc-body"><div class="doc-section"><div class="section-title">Название концепции и его анализ</div>
  <div data-section="Итоговая рекомендация"><strong>«Имя Б»</strong></div></div></div></div></body></html>`)) === "Имя Б");

console.log(`\nИтог: ${n - failed}/${n} ✓${failed ? `, ${failed} ✗` : ""}`);
process.exit(failed ? 1 : 0);
