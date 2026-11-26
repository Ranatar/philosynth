-- 2026-11-26 (вне бесед): языки генерации одной таблицей (shared/i18n/locales
-- GEN_LANGS) — словари поиска французского, итальянского, испанского,
-- португальского и арабского.
--
-- До 0025 морфологию в индексе имели только русский, английский и немецкий;
-- документы прочих языков индексировались словарём `simple`. Проверка
-- synthesis_search.config расширяется до SEARCH_TS_CONFIGS
-- (shared/constants/search).
--
-- Строки индекса документов на этих пяти языках, собранные словарём
-- `simple`, снимаются: перестроить tsvector в SQL нельзя (капсулу из
-- разметки снимает сервер — та же причина, по которой 0020 индекс не
-- наполняла). Их возвращает шаг после миграций `npm run search:reindex --
-- --missing` (установочные скрипты зовут его сами; на базе, обновлённой
-- вручную, — выполнить один раз). До него такие концепции находятся
-- фильтрами и по подстроке названия, но не по тексту.
ALTER TABLE "synthesis_search" DROP CONSTRAINT "synthesis_search_config_check";--> statement-breakpoint
ALTER TABLE "synthesis_search" ADD CONSTRAINT "synthesis_search_config_check" CHECK ("synthesis_search"."config" IN ('russian', 'english', 'german', 'french', 'italian', 'spanish', 'portuguese', 'arabic', 'simple'));--> statement-breakpoint
DELETE FROM "synthesis_search" ss USING "syntheses" s
  WHERE ss."synthesis_id" = s."id"
    AND ss."config" = 'simple'
    AND lower(btrim(s."lang")) IN ('french', 'italian', 'spanish', 'portuguese', 'arabic');
