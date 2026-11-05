-- 15.4 (Д-74): редакции тарифов. У строки плана — семейство (family) и номер
-- редакции (edition); name остаётся уникальным идентификатором редакции.
-- Существующие планы — редакция 1 своего семейства: family = name (посев 8.3
-- заводил по строке на тариф). Перенос данных между ADD и SET NOT NULL
-- написан рукой (09 §3, 8.6); снапшот — генерат drizzle-kit, тег переименован.
ALTER TABLE "subscription_plans" ADD COLUMN "family" text;--> statement-breakpoint
UPDATE "subscription_plans" SET "family" = "name" WHERE "family" IS NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" ALTER COLUMN "family" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "edition" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_subscription_plans_family_edition" ON "subscription_plans" USING btree ("family","edition");
