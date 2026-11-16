/**
 * reindex-search.ts — полный пересчёт индекса поиска концепций (беседа 18.1;
 * врезка «Фаза 18» в 07; таблица `synthesis_search`, 02 §2.42).
 *
 * Зачем скрипт, а не наполнение в миграции 0020. Документ индекса собирает
 * ОДНА функция — `writeSearchIndex` (`server/services/search-index.ts`), её
 * же через `reindexSynthesis` зовут все писатели названия, зерна, капсулы,
 * категорий и терминов. Текст капсулы она снимает с разметки серверным
 * разбором (linkedom), а не SQL; копия этой сборки в миграции разошлась бы
 * с ней при первой же правке. Поэтому миграция заводит только таблицу и
 * индексы, а строки пишет этот скрипт — той же функцией:
 *   - начальное наполнение после миграции 0020 (концепции, созданные до
 *     18.1, без него находятся только по названию);
 *   - починка после сбоя пересчёта (строка `[search-index]` в журнале
 *     сервера) и после правок базы мимо службы.
 *
 * Запуск ИЗ КОРНЯ репозитория (сервер останавливать не нужно: запись
 * построчная, идемпотентная; DATABASE_URL — из окружения, как у сидов):
 *   npm run search:reindex                       # все концепции
 *   npm run search:reindex -- --missing          # только без строки индекса
 *   npm run search:reindex -- --dry              # только посчитать
 *   npm run search:reindex -- --synthesis <uuid> # одна концепция
 *
 * Код возврата 1 — если хотя бы одна концепция не пересчитана. Повторный
 * прогон безопасен. Модуль вне описи i18n (scripts/i18n/ui-strings-lib
 * SCOPE): его строки — вывод консоли оператора, не интерфейс. deploy/*: шаг
 * после обновления до 18.1.
 */
import { closeDb } from "../../server/db/index.js";
import { reindexAll } from "../../server/services/search-index.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const known = new Set(["--dry", "--missing", "--synthesis"]);
  const synthIdx = args.indexOf("--synthesis");
  const only = synthIdx >= 0 ? (args[synthIdx + 1] ?? "") : "";
  const unknown = args.filter((a, i) => !known.has(a) && !(synthIdx >= 0 && i === synthIdx + 1));
  if (unknown.length > 0) {
    console.error(`Неизвестные ключи: ${unknown.join(" ")}. Допустимы --dry, --missing, --synthesis <uuid>.`);
    process.exitCode = 2;
    return;
  }
  if (synthIdx >= 0 && !UUID_RE.test(only)) {
    console.error("--synthesis ждёт UUID концепции");
    process.exitCode = 2;
    return;
  }
  const dry = args.includes("--dry");
  const onlyMissing = args.includes("--missing");
  console.log(
    `search:reindex: ${dry ? "ПРОБНЫЙ прогон (--dry), строки индекса не меняются" : "пересчёт индекса поиска"}` +
      (onlyMissing ? ", только концепции без строки индекса" : "") +
      (only ? `, концепция ${only}` : ""),
  );
  const res = await reindexAll({ dry, onlyMissing, ...(only ? { synthesisId: only } : {}) });
  console.log(
    `концепций: ${res.total}, ${dry ? "было бы пересчитано" : "пересчитано"}: ${res.indexed}, пропущено: ${res.skipped}, не удалось: ${res.failed.length}`,
  );
  for (const f of res.failed) console.error(`  ✗ ${f.id}: ${f.message}`);
  if (res.orphans > 0) console.warn(`строк индекса без концепции: ${res.orphans} (CASCADE их не оставляет — проверьте базу)`);
  if (res.failed.length > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Пересчёт индекса поиска не выполнен:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
