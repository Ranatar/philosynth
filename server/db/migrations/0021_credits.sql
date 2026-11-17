-- Единые кредиты вместо четырёх квот подписки (решение пользователя
-- 2026-11-17). До 0021 тариф нёс квоты синтезов, перегенераций, режимов и
-- обогащений, и одна единица «перегенерации» стоила одинаково за раздел
-- (≈ $0.25 себестоимости) и за подраздел (≈ $0.12); теперь тариф несёт одну
-- квоту — кредиты, а операция списывает свой вес (config/plan-economics.ts:
-- CREDIT_USD = $0.01 себестоимости, CREDIT_WEIGHTS по опорным стоимостям).
--
-- Перевод сохраняет ценность для подписчика: квоты и израсходованное
-- умножаются на веса тех операций, которые они оплачивали:
--   синтез 190 · перегенерация (раздел) 26 · режим 8 · обогащение 4.
-- Числа вписаны рукой — они равны CREDIT_WEIGHTS на момент миграции
-- (сторож check:integration сверяет их с legacyQuotasToCredits); позднейшая
-- правка весов эту миграцию не трогает. Строки тарифов переписываются под
-- живыми подписчиками однократно и без потери (правило Д-75 о неприкосновенности
-- редакции касается правки квот, а не смены единицы счёта).
--
-- SQL написан рукой поверх генерата drizzle-kit (ADD + DROP; переименования
-- generate без TTY не спрашивает); снимок meta/0021_snapshot.json — по
-- schema.ts, после миграции `drizzle-kit generate` отвечает «No schema changes».
ALTER TABLE "subscription_plans" ADD COLUMN "quota_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "subscription_plans" SET "quota_credits" =
  "quota_syntheses" * 190 + "quota_regenerations" * 26 + "quota_modes" * 8 + "quota_enrichments" * 4;--> statement-breakpoint
ALTER TABLE "subscription_plans" ALTER COLUMN "quota_credits" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "used_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "user_subscriptions" SET "used_credits" =
  "used_syntheses" * 190 + "used_regenerations" * 26 + "used_modes" * 8 + "used_enrichments" * 4;--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP COLUMN "quota_syntheses";--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP COLUMN "quota_regenerations";--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP COLUMN "quota_modes";--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP COLUMN "quota_enrichments";--> statement-breakpoint
ALTER TABLE "user_subscriptions" DROP COLUMN "used_syntheses";--> statement-breakpoint
ALTER TABLE "user_subscriptions" DROP COLUMN "used_regenerations";--> statement-breakpoint
ALTER TABLE "user_subscriptions" DROP COLUMN "used_modes";--> statement-breakpoint
ALTER TABLE "user_subscriptions" DROP COLUMN "used_enrichments";
