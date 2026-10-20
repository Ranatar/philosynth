/**
 * sanitize-stored-html.ts — одноразовая чистка УЖЕ СОХРАНЁННОЙ разметки
 * (беседа 13.1, Д-63).
 *
 * До 13.1 чистился только вход ручной правки подраздела (9.2); ответы модели,
 * импорт, PATCH капсулы и откат версий входили в документ как есть, и в базе
 * может лежать разметка вне набора документа — вплоть до `<img onerror>`
 * (живая проба 2026-10-13). Скрипт прогоняет санитайзер раздела целиком
 * (`server/utils/html-parser.ts` → `sanitizeSectionHtml`, общий модуль
 * `packages/shared/constants/doc-markup.ts`) по всему, что документ показывает
 * разметкой:
 *   - sections.html_content;
 *   - syntheses.capsule_html;
 *   - mode_results.html_content;
 *   - element_versions (element_type = 'section') — поле data.htmlContent
 *     снимка: откат возвращает его в документ, старый снимок может нести то,
 *     что было до чистки (сам откат с 13.1 тоже чистит — страховка вторая);
 *   - element_enrichments.content — показывается разметкой в EnrichmentPanel
 *     читателям публичной концепции (вход модели, не названный в тексте
 *     беседы; найден сверкой п.0).
 *
 * Запуск ИЗ КОРНЯ репозитория (сервер можно не останавливать: записи
 * обновляются построчно, без транзакции на весь прогон; DATABASE_URL — из
 * окружения, как у сидов):
 *   npm run sanitize:stored-html -- --dry        # только отчёт, записи не меняются
 *   npm run sanitize:stored-html                 # чистка с записью
 *   … -- --synthesis <uuid>                      # одна концепция
 *
 * Отчёт — по таблицам: сколько строк просмотрено, сколько изменено и ЧЕМ
 * (теги удалены / сняты / переименованы, классы, атрибуты — сводом по видам).
 * Повторный прогон после чистки меняет 0 строк (санитайзер идемпотентен).
 * Модуль вне описи i18n (scripts/i18n/ui-strings-lib SCOPE): его строки —
 * вывод консоли оператора, не интерфейс. deploy/*: шаг после обновления.
 */
import { and, eq } from "drizzle-orm";

import { closeDb, db } from "../../server/db/index.js";
import {
  elementEnrichments,
  elementVersions,
  modeResults,
  sections,
  syntheses,
} from "../../server/db/schema.js";
import { sanitizeSectionHtml } from "../../server/utils/html-parser.js";

interface TableReport {
  seen: number;
  changed: number;
  /** предупреждение санитайзера → сколько строк его дали */
  kinds: Map<string, number>;
}

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const synthIdx = args.indexOf("--synthesis");
const ONLY_SYNTHESIS = synthIdx >= 0 ? (args[synthIdx + 1] ?? "") : "";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function newReport(): TableReport {
  return { seen: 0, changed: 0, kinds: new Map() };
}

function note(rep: TableReport, warnings: readonly string[]): void {
  rep.changed += 1;
  for (const w of warnings) {
    // Вид предупреждения — до двоеточия («Удалены вместе с содержимым»), сами теги —
    // отдельными ключами, чтобы отчёт показывал, ЧТО именно встречалось
    const kind = w.split(":")[0] ?? w;
    rep.kinds.set(kind, (rep.kinds.get(kind) ?? 0) + 1);
    const tail = w.slice(kind.length + 1).trim();
    for (const item of tail.split(",").map((t) => t.trim()).filter(Boolean)) {
      const key = `  ${kind} → ${item}`;
      rep.kinds.set(key, (rep.kinds.get(key) ?? 0) + 1);
    }
  }
}

function printReport(name: string, rep: TableReport): void {
  console.log(`${name}: просмотрено ${rep.seen}, ${DRY ? "изменилось бы" : "изменено"} ${rep.changed}`);
  for (const [k, n] of [...rep.kinds.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"))) {
    console.log(`  ${k}: ${n}`);
  }
}

async function main(): Promise<void> {
  if (ONLY_SYNTHESIS && !UUID_RE.test(ONLY_SYNTHESIS)) {
    console.error("--synthesis ждёт UUID концепции");
    process.exitCode = 1;
    return;
  }
  console.log(`sanitize-stored-html: ${DRY ? "ПРОБНЫЙ прогон (--dry), записи не меняются" : "чистка с записью"}${ONLY_SYNTHESIS ? `, концепция ${ONLY_SYNTHESIS}` : ""}`);

  // ── sections.html_content ──
  const secRep = newReport();
  const secRows = await db
    .select({ id: sections.id, key: sections.key, synthesisId: sections.synthesisId, html: sections.htmlContent })
    .from(sections)
    .where(ONLY_SYNTHESIS ? eq(sections.synthesisId, ONLY_SYNTHESIS) : undefined);
  for (const r of secRows) {
    secRep.seen += 1;
    const res = sanitizeSectionHtml(r.html);
    if (!res.changed) continue;
    note(secRep, res.warnings);
    if (!DRY)
      await db.update(sections).set({ htmlContent: res.html, updatedAt: new Date() }).where(eq(sections.id, r.id));
  }
  printReport("sections.html_content", secRep);

  // ── syntheses.capsule_html ──
  const capRep = newReport();
  const capRows = await db
    .select({ id: syntheses.id, html: syntheses.capsuleHtml })
    .from(syntheses)
    .where(ONLY_SYNTHESIS ? eq(syntheses.id, ONLY_SYNTHESIS) : undefined);
  for (const r of capRows) {
    capRep.seen += 1;
    const res = sanitizeSectionHtml(r.html);
    if (!res.changed) continue;
    note(capRep, res.warnings);
    if (!DRY)
      await db.update(syntheses).set({ capsuleHtml: res.html, updatedAt: new Date() }).where(eq(syntheses.id, r.id));
  }
  printReport("syntheses.capsule_html", capRep);

  // ── mode_results.html_content ──
  const modeRep = newReport();
  const modeRows = await db
    .select({ id: modeResults.id, html: modeResults.htmlContent })
    .from(modeResults)
    .where(ONLY_SYNTHESIS ? eq(modeResults.synthesisId, ONLY_SYNTHESIS) : undefined);
  for (const r of modeRows) {
    modeRep.seen += 1;
    const res = sanitizeSectionHtml(r.html);
    if (!res.changed) continue;
    note(modeRep, res.warnings);
    if (!DRY) await db.update(modeResults).set({ htmlContent: res.html }).where(eq(modeResults.id, r.id));
  }
  printReport("mode_results.html_content", modeRep);

  // ── element_versions (section) — снимок data.htmlContent ──
  const verRep = newReport();
  const verRows = await db
    .select({ id: elementVersions.id, data: elementVersions.data })
    .from(elementVersions)
    .where(
      ONLY_SYNTHESIS
        ? and(eq(elementVersions.elementType, "section"), eq(elementVersions.synthesisId, ONLY_SYNTHESIS))
        : eq(elementVersions.elementType, "section"),
    );
  for (const r of verRows) {
    verRep.seen += 1;
    const data = (r.data ?? {}) as Record<string, unknown>;
    const html = data["htmlContent"];
    if (typeof html !== "string") continue;
    const res = sanitizeSectionHtml(html);
    if (!res.changed) continue;
    note(verRep, res.warnings);
    if (!DRY)
      await db.update(elementVersions).set({ data: { ...data, htmlContent: res.html } }).where(eq(elementVersions.id, r.id));
  }
  printReport("element_versions (section).data.htmlContent", verRep);

  // ── element_enrichments.content ──
  const enrRep = newReport();
  const enrRows = await db
    .select({ id: elementEnrichments.id, content: elementEnrichments.content })
    .from(elementEnrichments)
    .where(ONLY_SYNTHESIS ? eq(elementEnrichments.synthesisId, ONLY_SYNTHESIS) : undefined);
  for (const r of enrRows) {
    enrRep.seen += 1;
    const res = sanitizeSectionHtml(r.content);
    if (!res.changed) continue;
    note(enrRep, res.warnings);
    if (!DRY) await db.update(elementEnrichments).set({ content: res.html }).where(eq(elementEnrichments.id, r.id));
  }
  printReport("element_enrichments.content", enrRep);

  const total = secRep.changed + capRep.changed + modeRep.changed + verRep.changed + enrRep.changed;
  console.log(`ИТОГ: ${DRY ? "изменилось бы" : "изменено"} записей — ${total}${DRY && total ? " (повторите без --dry, чтобы записать)" : ""}`);
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("/sanitize-stored-html.ts");
if (isDirectRun) {
  main()
    .catch((err) => {
      console.error("sanitize-stored-html: фатальная ошибка:", err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
