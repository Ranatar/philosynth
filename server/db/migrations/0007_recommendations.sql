CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"position" integer NOT NULL,
	"num" text NOT NULL,
	"address_subsection" text DEFAULT '' NOT NULL,
	"address_section" text,
	"element" text,
	"element_kind" text,
	"element_id" uuid,
	"op" text DEFAULT '' NOT NULL,
	"replacement" text,
	"rationale" text DEFAULT '' NOT NULL,
	"severity" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"invalid_reason" text,
	"source_hash" text,
	"round_hash" text NOT NULL,
	"plan_id" uuid,
	"step_index" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendations_status_check" CHECK ("recommendations"."status" IN ('new','planned','done','rejected','invalid','stale'))
);
--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_plan_id_edit_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."edit_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_recommendations_round_position" ON "recommendations" USING btree ("synthesis_id","round","position");--> statement-breakpoint
CREATE INDEX "idx_recommendations_round_num" ON "recommendations" USING btree ("synthesis_id","round","num");--> statement-breakpoint
CREATE INDEX "idx_recommendations_status" ON "recommendations" USING btree ("synthesis_id","status");