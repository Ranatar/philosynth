-- Журнал списаний кредитов подписки (решение пользователя 2026-11-17):
-- строка на операцию, взявшую кредиты под слотом генерации (кто, за какой
-- документ, сколько, вид операции). Генерат drizzle-kit по schema.ts без правок.
CREATE TABLE "credit_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"synthesis_id" uuid,
	"subscription_id" uuid,
	"credits" integer NOT NULL,
	"op" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_charges" ADD CONSTRAINT "credit_charges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_charges" ADD CONSTRAINT "credit_charges_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_charges" ADD CONSTRAINT "credit_charges_subscription_id_user_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."user_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_credit_charges_user" ON "credit_charges" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_credit_charges_synthesis_user" ON "credit_charges" USING btree ("synthesis_id","user_id");