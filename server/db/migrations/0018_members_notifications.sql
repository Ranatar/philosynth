-- 16.2 (Фаза 16): участники, приглашения, уведомления. notifications — строка
-- КОДОМ события + ссылки + параметры (фраза — при чтении, 14.2); частичный
-- уникальный индекс dedupe_key — одно уведомление finding_outdated на одну смену
-- содержимого; notification_settings — отключённые категории и сводка по почте.
-- auth_tokens: назначение member_invite (довод приглашения адреса БЕЗ аккаунта:
-- user_id — пригласивший, new_email — адрес) + synthesis_id (CASCADE) и
-- member_role; пара DROP/ADD CONSTRAINT purpose_check (09 §3). Генерат drizzle-kit,
-- тег переименован; снапшот — генерат.
CREATE TABLE "notification_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"muted_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"email_digest" boolean DEFAULT true NOT NULL,
	"digest_sent_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"actor_id" uuid,
	"address" jsonb,
	"ref_kind" text,
	"ref_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" IN ('member_invited','member_accepted','member_declined','member_role_changed','member_removed','comment_new','comment_reply','review_published','finding_outdated','proposal_created','proposal_decided')),
	CONSTRAINT "notifications_ref_kind_check" CHECK ("notifications"."ref_kind" IS NULL OR "notifications"."ref_kind" IN ('member','comment','review','finding','proposal'))
);
--> statement-breakpoint
ALTER TABLE "auth_tokens" DROP CONSTRAINT "auth_tokens_purpose_check";--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD COLUMN "synthesis_id" uuid;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD COLUMN "member_role" text;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_notifications_user_created" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_unread" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_notifications_synthesis" ON "notifications" USING btree ("synthesis_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notifications_dedupe" ON "notifications" USING btree ("dedupe_key") WHERE "notifications"."dedupe_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_auth_tokens_synthesis" ON "auth_tokens" USING btree ("synthesis_id");--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_member_role_check" CHECK ("auth_tokens"."member_role" IS NULL OR "auth_tokens"."member_role" IN ('reviewer','editor'));--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_purpose_check" CHECK ("auth_tokens"."purpose" IN ('email_verify','password_reset','email_change','member_invite'));