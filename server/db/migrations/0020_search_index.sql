-- Беседа 18.1 (Фаза 18 «Поиск и похожие концепции»): индекс поиска концепций.
--
-- SQL написан рукой: tsvector и GIN drizzle-kit не знает (как gin_trgm_ops
-- в 0000); снимок meta/0020_snapshot.json — генерат по schema.ts, после этой
-- миграции `drizzle-kit generate` обязан отвечать «No schema changes».
--
-- synthesis_search — одна строка на синтез. Четыре tsvector (словарь языка
-- генерации + simple): название, зерно, капсула без разметки и содержание
-- целиком (капсула + имена категорий + термины и определения глоссария).
-- ТЕЗИСЫ И ТЕКСТЫ РАЗДЕЛОВ В ИНДЕКС НЕ ВХОДЯТ (решение пользователя,
-- врезка «Фаза 18» в 07). Капсула отдельной колонкой: витрина ищется по
-- ней, но не по категориям и терминам.
--
-- Строки пишет только reindexSynthesis (server/services/search-index.ts) —
-- её зовут все писатели названия, зерна, капсулы, категорий и терминов
-- сразу после своей записи. ТРИГГЕРОВ НЕТ. Начального наполнения здесь тоже
-- нет: его делает `npm run search:reindex` той же функцией (одна реализация
-- сборки документа индекса; текст капсулы из разметки снимает сервер, а не
-- SQL) — шаг после миграции, см. deploy/*.
CREATE TABLE "synthesis_search" (
	"synthesis_id" uuid PRIMARY KEY NOT NULL,
	"config" text DEFAULT 'simple' NOT NULL,
	"title_tsv" "tsvector" NOT NULL,
	"seed_tsv" "tsvector" NOT NULL,
	"capsule_tsv" "tsvector" NOT NULL,
	"content_tsv" "tsvector" NOT NULL,
	"capsule_text" text DEFAULT '' NOT NULL,
	"elements_text" text DEFAULT '' NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "synthesis_search_config_check" CHECK ("synthesis_search"."config" IN ('russian', 'english', 'german', 'simple'))
);
--> statement-breakpoint
ALTER TABLE "synthesis_search" ADD CONSTRAINT "synthesis_search_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Полнотекстовый поиск: GIN по каждому tsvector
CREATE INDEX "idx_synthesis_search_title" ON "synthesis_search" USING gin ("title_tsv");--> statement-breakpoint
CREATE INDEX "idx_synthesis_search_seed" ON "synthesis_search" USING gin ("seed_tsv");--> statement-breakpoint
CREATE INDEX "idx_synthesis_search_capsule" ON "synthesis_search" USING gin ("capsule_tsv");--> statement-breakpoint
CREATE INDEX "idx_synthesis_search_content" ON "synthesis_search" USING gin ("content_tsv");--> statement-breakpoint
-- Запасной ход по опечаткам: триграммы (word_similarity) по текстам индекса
CREATE INDEX "idx_synthesis_search_capsule_trgm" ON "synthesis_search" USING gin ("capsule_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_synthesis_search_elements_trgm" ON "synthesis_search" USING gin ("elements_text" gin_trgm_ops);--> statement-breakpoint
-- Точный термин глоссария без регистра (поле `term` поиска) и имя термина
-- без хвостовой скобки-пояснения («Имя (пояснение)» — одна ячейка документа)
CREATE INDEX "idx_glossary_term_lower" ON "glossary_terms" USING btree (lower("term"));--> statement-breakpoint
CREATE INDEX "idx_glossary_term_base" ON "glossary_terms" USING btree (lower(btrim(regexp_replace("term", '[[:space:]]*[(][^()]*[)][[:space:]]*$', ''))));--> statement-breakpoint
-- Триграммы зерна (название — idx_syntheses_title_trgm из 0000)
CREATE INDEX "idx_syntheses_seed_trgm" ON "syntheses" USING gin ("seed" gin_trgm_ops);
