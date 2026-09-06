ALTER TABLE "api_usage" DROP CONSTRAINT "api_usage_synthesis_id_syntheses_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_synthesis_id_syntheses_id_fk";
--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE set null ON UPDATE no action;