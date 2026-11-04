-- 15.3 (Д-73): третье назначение довода — смена адреса почты.
-- auth_tokens.purpose += 'email_change' (CHECK пересобирается парой
-- DROP/ADD CONSTRAINT — генерат drizzle-kit, тег переименован); новый адрес
-- живёт в строке довода (new_email, NULL у прочих назначений) — в users до
-- подтверждения ничего не пишется.
ALTER TABLE "auth_tokens" DROP CONSTRAINT "auth_tokens_purpose_check";--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD COLUMN "new_email" text;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_purpose_check" CHECK ("auth_tokens"."purpose" IN ('email_verify','password_reset','email_change'));