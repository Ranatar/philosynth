CREATE TABLE "proposal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_events_type_check" CHECK ("proposal_events"."type" IN ('created','plan_drafted','plan_released','accepted','rejected','withdrawn','closed','rebased'))
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"author_id" uuid,
	"address" jsonb NOT NULL,
	"address_kind" text NOT NULL,
	"address_key" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"base" jsonb NOT NULL,
	"source" text DEFAULT 'direct' NOT NULL,
	"source_id" uuid,
	"source_review_id" uuid,
	"kind" text NOT NULL,
	"field" text,
	"value" text,
	"rationale" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"plan_id" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"note" text DEFAULT '' NOT NULL,
	"close_reason" text,
	"superseded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_source_check" CHECK ("proposals"."source" IN ('direct','comment','review_finding','recommendation')),
	CONSTRAINT "proposals_kind_check" CHECK ("proposals"."kind" IN ('replace','note')),
	CONSTRAINT "proposals_status_check" CHECK ("proposals"."status" IN ('open','accepted','rejected','withdrawn','closed')),
	CONSTRAINT "proposals_close_reason_check" CHECK ("proposals"."close_reason" IS NULL OR "proposals"."close_reason" IN ('member_removed','superseded','outdated','manual'))
);
--> statement-breakpoint
ALTER TABLE "element_versions" ADD COLUMN "actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_log" ADD COLUMN "actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "proposal_events" ADD CONSTRAINT "proposal_events_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_events" ADD CONSTRAINT "proposal_events_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_events" ADD CONSTRAINT "proposal_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_plan_id_edit_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."edit_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_proposal_events_proposal" ON "proposal_events" USING btree ("proposal_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_proposals_synthesis_created" ON "proposals" USING btree ("synthesis_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_proposals_address" ON "proposals" USING btree ("synthesis_id","address_kind","address_key");--> statement-breakpoint
CREATE INDEX "idx_proposals_author" ON "proposals" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_proposals_plan" ON "proposals" USING btree ("plan_id");--> statement-breakpoint
ALTER TABLE "element_versions" ADD CONSTRAINT "element_versions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_log" ADD CONSTRAINT "generation_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;