/**
 * Смоук запроса 1 беседы 1.4b (без БД/Redis):
 *  A. БАЙТОВАЯ сверка портов с исходником (vm-исполнение philosynth.html):
 *     - serializeSubsectionRegen [10654] + extractPreambleConstraints
 *       [10727] (section-defs-builder) — 8 комбинаций parts/opts;
 *     - _fmtCost [24634] ↔ fmtCost (client/PauseModal) — семантика
 *       форматирования оценок на кнопках.
 *  B. Врезка подраздела (html-parser): spliceSubsectionHtml (замена /
 *     нечёткая замена / append при отсутствии / «модель не обернула»),
 *     removeSubsectionHtml.
 * Запуск: npx tsx server/smoke-1.4b.mts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

import {
  extractPreambleConstraints,
  serializeSubsectionRegen,
  type SectionParts,
} from "./services/section-defs-builder.js";
import {
  removeSubsectionHtml,
  spliceSubsectionHtml,
} from "./utils/html-parser.js";

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = join(here, "..", "source", "philosynth.html");
const src = readFileSync(srcPath, "utf-8").split("\n");

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra?: string): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ""}`);
  }
}

/** Извлечение строк [from..to] (1-based, включительно) */
function slice(from: number, to: number): string {
  return src.slice(from - 1, to).join("\n");
}

/* ── A1. serializeSubsectionRegen + extractPreambleConstraints ──────── */

console.log("A1. serializeSubsectionRegen [10654] — байтовая сверка");
// [10654 .. строка перед `function buildSectionDefs(p) {` 10742]
const serializeCode = slice(10654, 10741);
const ctx: Record<string, unknown> = {};
vm.createContext(ctx);
vm.runInContext(serializeCode, ctx, { filename: "serializeSubsectionRegen" });
type JsSerialize = (
  parts: unknown,
  subsectionName: string,
  intraSectionCtx: string,
  opts?: unknown,
) => string;
type JsExtract = (preamble: string) => string;
const jsSerialize = ctx.serializeSubsectionRegen as JsSerialize;
const jsExtract = ctx.extractPreambleConstraints as JsExtract;

const partsFull: SectionParts = {
  preamble:
    "Составь § — ГРАФ.\nСТРОГО соблюдай формат таблиц.\nОбычная строка.\nКРИТИЧЕСКИ важно: не выдумывай.",
  preamble_short: "Раздел «Граф». Педантичный тон.",
  intro: "Оформи секции:",
  subsections: [
    { name: "Таблица категорий", body: "Категории: имя, тип.", note_after: "Мост к связям." },
    { type: "shared", scope: ["Таблица связей", "Топология"], body: "ОБЩИЙ БЛОК: держи имена согласованными." },
    { name: "Таблица связей", body: "Связи: источник, цель.", note_after: null },
    { type: "bridge", body: "BRIDGE: после связей переходи к топологии." },
    { name: "Топология", body: "Кластеры и роли.", note_after: null },
  ],
  postamble: "Полная постамбула.",
  postamble_short: "Отвечай ТОЛЬКО HTML секции.",
};
const partsNoShort: SectionParts = {
  ...partsFull,
  preamble_short: "",
  postamble_short: "",
};
const partsNoConstraints: SectionParts = {
  ...partsNoShort,
  preamble: "Первое предложение преамбулы. Второе предложение! Третье?",
};

const cases: Array<{
  name: string;
  parts: SectionParts;
  sub: string;
  intra: string;
  opts: Record<string, unknown>;
}> = [
  { name: "базовый (перегенерируй)", parts: partsFull, sub: "Таблица связей", intra: "", opts: {} },
  { name: "с intra-контекстом", parts: partsFull, sub: "Таблица связей", intra: "[Таблица категорий]\nтекст", opts: {} },
  { name: "shared в scope + note_after предыдущего", parts: partsFull, sub: "Таблица связей", intra: "", opts: { userNote: "Учти замечание." } },
  { name: "bridge перед топологией", parts: partsFull, sub: "Топология", intra: "", opts: {} },
  { name: "первый подраздел (без prevNote)", parts: partsFull, sub: "Таблица категорий", intra: "", opts: {} },
  { name: "доработай (currentContent)", parts: partsFull, sub: "Таблица связей", intra: "", opts: { currentContent: "старый текст" } },
  { name: "заверши (resumeFromInterruption)", parts: partsFull, sub: "Таблица связей", intra: "x", opts: { currentContent: "обрывок", resumeFromInterruption: true, userNote: "нота" } },
  { name: "фолбэки: constraints + дефолт постамбулы", parts: partsNoShort, sub: "Топология", intra: "", opts: {} },
  { name: "фолбэк: 2 предложения преамбулы", parts: partsNoConstraints, sub: "Таблица категорий", intra: "", opts: {} },
];
for (const c of cases) {
  const expected = jsSerialize(c.parts, c.sub, c.intra, c.opts);
  const actual = serializeSubsectionRegen(c.parts, c.sub, c.intra, c.opts);
  check(
    c.name,
    actual === expected,
    actual === expected
      ? undefined
      : `expected(${expected.length}) != actual(${actual.length})`,
  );
}
// Ошибка на неизвестном подразделе — одинаковый текст
let jsErr = "";
let tsErr = "";
try {
  jsSerialize(partsFull, "Нет такого", "", {});
} catch (e) {
  jsErr = (e as Error).message;
}
try {
  serializeSubsectionRegen(partsFull, "Нет такого", "", {});
} catch (e) {
  tsErr = (e as Error).message;
}
check("ошибка «не найден в parts» совпадает", jsErr !== "" && jsErr === tsErr);
check(
  "extractPreambleConstraints: строки-ограничения",
  extractPreambleConstraints(partsFull.preamble) === jsExtract(partsFull.preamble),
);
check(
  "extractPreambleConstraints: фолбэк 2 предложений",
  extractPreambleConstraints(partsNoConstraints.preamble) ===
    jsExtract(partsNoConstraints.preamble),
);

/* ── A2. _fmtCost ↔ fmtCost (клиент) ────────────────────────────────── */

console.log("A2. _fmtCost [24634] ↔ fmtCost (PauseModal)");
const fmtCode = slice(24634, 24639);
const ctx2: Record<string, unknown> = {};
vm.createContext(ctx2);
vm.runInContext(fmtCode, ctx2, { filename: "_fmtCost" });
const jsFmt = ctx2._fmtCost as (c: unknown) => string;
const { fmtCost } = await import(
  "../client/src/components/synthesis/PauseModal.js"
);
for (const v of [null, undefined, 0, 0.0042, 0.009999, 0.01, 0.1234, 1.5]) {
  check(`fmtCost(${String(v)}) = «${jsFmt(v)}»`, fmtCost(v as number) === jsFmt(v));
}

/* ── B. Врезка подраздела (html-parser) ─────────────────────────────── */

console.log("B. spliceSubsectionHtml / removeSubsectionHtml");
const sectionHtml =
  '<div class="doc-section"><div data-section="Цели и метод"><p>Цели.</p></div>' +
  '<div data-section="Портрет каждого философа"><p>Портреты…</p></div></div>';

// Замена: результат обёрнут в data-section
const gen1 = '<div data-section="Портрет каждого философа"><p>НОВОЕ</p></div>';
const out1 = spliceSubsectionHtml(sectionHtml, "Портрет каждого философа", gen1);
check(
  "замена по точному имени",
  out1.includes("НОВОЕ") && !out1.includes("Портреты…") && out1.includes("Цели."),
);
check(
  "ровно один div подраздела после замены",
  (out1.match(/data-section="Портрет каждого философа"/g) ?? []).length === 1,
);

// «Модель не обернула в data-section» → вставка сырого HTML на место
const out2 = spliceSubsectionHtml(sectionHtml, "Портрет каждого философа", "<p>ГОЛЫЙ</p>");
check(
  "не обёрнутый результат вставлен, старый удалён",
  out2.includes("ГОЛЫЙ") && !out2.includes("Портреты…"),
);

// Нечёткое совпадение имени (взаимное включение)
const out3 = spliceSubsectionHtml(
  sectionHtml,
  "Портрет",
  '<div data-section="Портрет"><p>ФАЗЗИ</p></div>',
);
check("нечёткая замена по включению", out3.includes("ФАЗЗИ") && !out3.includes("Портреты…"));

// Подраздела нет → append в конец контейнера
const out4 = spliceSubsectionHtml(
  sectionHtml,
  "Новый подраздел",
  '<div data-section="Новый подраздел"><p>ДОБАВЛЕН</p></div>',
);
check(
  "append при отсутствии старого",
  out4.includes("ДОБАВЛЕН") && out4.includes("Портреты…") && out4.includes("Цели."),
);

// removeSubsectionHtml
const rm = removeSubsectionHtml(sectionHtml, "Цели и метод");
check("удаление обрывочного дива", rm.removed && !rm.html.includes("Цели.") && rm.html.includes("Портреты…"));
const rmNo = removeSubsectionHtml(sectionHtml, "Нет такого вообще-вообще");
check("удаление отсутствующего — no-op", !rmNo.removed && rmNo.html === sectionHtml);

console.log(`\nИтог: ${passed} ✓, ${failed} ✗`);
if (failed > 0) process.exit(1);
