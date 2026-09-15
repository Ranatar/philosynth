-- 0005_visibility (беседа 8.6): управляемая публичность вместо булева
-- is_public — ступень visibility + четыре флага, ПЕРЕНОС ДАННЫХ в той же
-- миграции (is_public=true → 'full', иначе 'private'; allow_meta=true у всех —
-- пригодность к мета-синтезу у существующих публичных не отнимается).
-- Файл написан рукой поверх снапшота 0004 (drizzle-kit generate спрашивал
-- «переименование ли is_public → visibility» интерактивно и не умеет
-- вставить UPDATE между ADD и DROP); 0005_snapshot.json приведён к schema.ts —
-- `drizzle-kit generate` после него сообщает «No schema changes».
ALTER TABLE "syntheses" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "syntheses" ADD COLUMN "show_author" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "syntheses" ADD COLUMN "show_logs" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "syntheses" ADD COLUMN "show_prompts" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "syntheses" ADD COLUMN "allow_meta" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "syntheses" SET "visibility" = CASE WHEN "is_public" THEN 'full' ELSE 'private' END;--> statement-breakpoint
DROP INDEX "idx_syntheses_public";--> statement-breakpoint
ALTER TABLE "syntheses" DROP COLUMN "is_public";--> statement-breakpoint
CREATE INDEX "idx_syntheses_visibility" ON "syntheses" USING btree ("visibility") WHERE "syntheses"."visibility" <> 'private';--> statement-breakpoint
ALTER TABLE "syntheses" ADD CONSTRAINT "syntheses_visibility_check" CHECK ("syntheses"."visibility" IN ('private', 'showcase', 'full'));
