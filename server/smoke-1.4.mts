/**
 * Smoke-тест чистых функций беседы 1.4 (запрос 1) — без PG/Redis/API.
 * Живые проверки стрима/паузы/БД — запрос 7 (пошаговое тестирование).
 * Запуск: npx tsx smoke-1.4.mts
 */
import assert from "node:assert/strict";

import {
  classifyStreamError,
  pauseFriendlyMessage,
  StreamError,
} from "./services/streaming-manager.js";
import { parseGraphFromHTML } from "./services/graph-parser.js";
import {
  parseGlossaryFromHTML,
  parseThesesFromHTML,
} from "./services/element-parser.js";
import {
  buildPromptSkeleton,
  extractTitleFromNameHtml,
  parseSubsectionsFromHTML,
} from "./services/generation-service.js";
import { closeDb } from "./db/index.js";
import { closeRedis } from "./redis.js";

let n = 0;
const ok = (name: string): void => {
  n += 1;
  console.log(`  ✓ ${name}`);
};

try {
  /* ── classifyStreamError ── */
  assert.equal(classifyStreamError({ name: "AbortError", message: "x" }, true).kind, "user-abort");
  assert.equal(
    classifyStreamError({ name: "AbortError", message: "x" }, true, { stuckAbort: true }).kind,
    "stuck",
  );
  assert.equal(classifyStreamError(new Error("401 unauthorized"), false).kind, "auth");
  assert.equal(classifyStreamError(new Error("boom"), true).kind, "partial");
  assert.equal(classifyStreamError(new Error("boom"), false).kind, "pre-stream");
  const mt = new StreamError("x", "max-tokens");
  assert.equal(classifyStreamError(mt, true), mt);
  ok("classifyStreamError: таксономия [12429]");

  /* ── pauseFriendlyMessage ── */
  assert.match(pauseFriendlyMessage(new StreamError("x", "auth")), /API-ключ/);
  const mtErr = new StreamError("x", "max-tokens");
  mtErr.maxTokensUsed = 20000;
  assert.match(pauseFriendlyMessage(mtErr), /20\u00a0000|20 000/);
  assert.match(pauseFriendlyMessage(new StreamError("HTTP 429", "pre-stream")), /429/);
  ok("pauseFriendlyMessage [24653]");

  /* ── parseSubsectionsFromHTML ── */
  const subHtml =
    '<div data-section="Первый">aaa</div><div data-section="Второй">bbb';
  const subs = parseSubsectionsFromHTML(subHtml, ["Первый", "Второй", "Третий"]);
  assert.equal(subs.length, 2);
  assert.equal(subs[0]!.status, "done");
  assert.equal(subs[1]!.status, "streaming");
  assert.ok(subs[0]!.chars > 0);
  ok("parseSubsectionsFromHTML [9795]: статусы done/streaming");

  /* ── buildPromptSkeleton ── */
  const fp =
    "ПАРАМЕТРЫ СИНТЕЗА:\nстатика\n### Контекст раздела «Резюме»\n" +
    "оченьдлинныйконтекст ".repeat(50) +
    "\n\nЗАДАНИЕ: составь ТОЛЬКО следующие разделы\n\n§ 1 — РЕЗЮМЕ\nпромпт";
  const skel = buildPromptSkeleton(fp);
  assert.ok(skel.includes("симв.]"));
  assert.ok(skel.length < fp.length);
  ok("buildPromptSkeleton [8506]: контекст свёрнут");

  /* ── extractTitleFromNameHtml ── */
  const nameHtml =
    '<div data-section="Итоговая рекомендация"><p><strong>«Плерома различия»</strong></p></div>';
  assert.equal(extractTitleFromNameHtml(nameHtml), "Плерома различия");
  assert.equal(
    extractTitleFromNameHtml("<p><strong>Название концепции: Плерома: очерк</strong></p>"),
    "Плерома",
  );
  assert.equal(extractTitleFromNameHtml("<p>без strong</p>"), null);
  ok("extractTitleFromNameHtml [11871]: кавычки, префикс, подзаголовок");

  /* ── parseGraphFromHTML ── */
  const graphHtml = `
  <div data-section="Таблица категорий"><table class="doc-table"><tbody>
    <tr><td>Бытие</td><td>Онтологическая</td><td>опр</td><td>0.9</td><td>0.8</td><td>Гегель</td></tr>
    <tr><td>Ничто</td><td>Онтологическая</td><td>опр</td><td>0.7</td><td>0.6</td><td>Гегель</td></tr>
  </tbody></table></div>
  <div data-section="Таблица связей"><table class="doc-table"><tbody>
    <tr><td>Бытие</td><td>переходит</td><td>Ничто</td><td>диалектическая</td><td>Двунаправленная</td><td>0.9</td></tr>
    <tr><td>Бытие</td><td>чужое</td><td>Фантом</td><td>x</td><td>однонаправленная</td><td>0.5</td></tr>
  </tbody></table></div>
  <div data-section="Топология графа"><div data-section="Топологическая таблица">
  <table class="doc-table"><tbody>
    <tr><td>Бытие</td><td>I — Основания / Мост</td><td>центральная</td><td>тезис</td></tr>
    <tr><td>Ничто</td><td>Основания</td><td>периферийная</td><td>антитезис</td></tr>
  </tbody></table></div></div>`;
  const g = parseGraphFromHTML(graphHtml);
  assert.equal(g.nodes.length, 2);
  assert.equal(g.edges.length, 2);
  assert.equal(g.topology.clusterLabels.length, 1); // «Основания» слился с «I — Основания»
  assert.deepEqual(g.topology.clusters["Бытие"], [0]);
  assert.deepEqual(g.topology.roles.structural["Бытие"]?.sort(), ["bridge", "central"]);
  assert.deepEqual(g.topology.roles.procedural["Ничто"], ["antithesis"]);
  assert.equal(g.nodes[0]!.cen, 0.9);
  ok("parseGraphFromHTML [12696/12925]: узлы, рёбра, кластеры, роли");

  /* ── parseThesesFromHTML ── */
  const thesesHtml = `
  <div data-section="Онтологические тезисы"><p><strong>Бытие есть различие.</strong> Потому что так.</p></div>
  <div data-section="Сводная таблица тезисов"><table class="doc-table">
  <thead><tr><th>№</th><th>Формулировка</th><th>Тип</th><th>Новизна</th><th>Категории</th></tr></thead>
  <tbody>
    <tr><td>1</td><td>Бытие есть различие.</td><td>онтол.</td><td>высокая</td><td>Бытие, Различие</td></tr>
    <tr><td>2</td><td>Знание процессуально.</td><td>эпистем.</td><td>средняя</td><td>Знание</td></tr>
  </tbody></table></div>`;
  const th = parseThesesFromHTML(thesesHtml);
  assert.equal(th.length, 2);
  assert.equal(th[0]!.thesisType, "ontological");
  assert.equal(th[1]!.thesisType, "epistemological");
  assert.deepEqual(th[0]!.relatedCategories, ["Бытие", "Различие"]);
  assert.match(th[0]!.justification, /Потому что/);
  ok("parseThesesFromHTML: сводная таблица + best-effort обоснование");

  /* ── parseGlossaryFromHTML ── */
  const glossHtml = `
  <table class="doc-table"><thead><tr><th>Термин</th><th>Принятое определение</th><th>Трансформация значения</th></tr></thead>
  <tbody>
    <tr><td>Плерома</td><td>полнота различий</td><td>из гнозиса в онтологию</td></tr>
    <tr><td>Зазор</td><td>место события</td><td></td></tr>
  </tbody></table>
  <div data-section="Новые термины"><p>Зазор — введён впервые.</p></div>`;
  const gl = parseGlossaryFromHTML(glossHtml);
  assert.equal(gl.length, 2);
  assert.equal(gl[0]!.extraColumns["Трансформация значения"], "из гнозиса в онтологию");
  assert.equal(gl[1]!.termCategory, "new");
  assert.equal(gl[0]!.termCategory, "");
  ok("parseGlossaryFromHTML [8027]: extraColumns + term_category");

  console.log(`\nSmoke 1.4: ${n} блоков проверок пройдено ✓`);
} finally {
  await closeDb().catch(() => {});
  await closeRedis().catch(() => {});
}
