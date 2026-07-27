CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"encrypted_key" "bytea" NOT NULL,
	"key_prefix" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"synthesis_id" uuid,
	"section_key" text,
	"billing_mode" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"definition" text DEFAULT '' NOT NULL,
	"centrality" real DEFAULT 0.5 NOT NULL,
	"certainty" real DEFAULT 0.5 NOT NULL,
	"historical_significance" real DEFAULT 0.5 NOT NULL,
	"innovation_degree" integer DEFAULT 1 NOT NULL,
	"clarity" real DEFAULT 0 NOT NULL,
	"breadth" real DEFAULT 0 NOT NULL,
	"depth_score" real DEFAULT 0 NOT NULL,
	"applicability" real DEFAULT 0 NOT NULL,
	"type_catalog_id" uuid,
	"origin" text DEFAULT '' NOT NULL,
	"cluster_indices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"structural_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"procedural_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"has_reflexive" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'generated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"edge_type" text DEFAULT '' NOT NULL,
	"direction" text DEFAULT 'однонаправленная' NOT NULL,
	"strength" real DEFAULT 0.5 NOT NULL,
	"certainty" real DEFAULT 0.5 NOT NULL,
	"historical_support" real DEFAULT 0.5 NOT NULL,
	"logical_necessity" real DEFAULT 0.5 NOT NULL,
	"innovation_degree" integer DEFAULT 1 NOT NULL,
	"context_dependency" real DEFAULT 0.5 NOT NULL,
	"type_catalog_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"source_origin" text DEFAULT 'generated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_type_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name_ru" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_type_catalog_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "characteristic_justifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"element_id" uuid NOT NULL,
	"element_type" text NOT NULL,
	"characteristic" text NOT NULL,
	"value" real NOT NULL,
	"justification" text NOT NULL,
	"alternative_approaches" text,
	"limitations" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cluster_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"cluster_index" integer NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"budget" integer DEFAULT 0 NOT NULL,
	"total_used" integer DEFAULT 0 NOT NULL,
	"req_found" integer DEFAULT 0 NOT NULL,
	"req_total" integer DEFAULT 0 NOT NULL,
	"opt_included" integer DEFAULT 0 NOT NULL,
	"opt_total" integer DEFAULT 0 NOT NULL,
	"budget_mode" text DEFAULT 'shrink' NOT NULL,
	"parent_overhead" integer DEFAULT 0 NOT NULL,
	"parent_spec" jsonb,
	"entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dialogue_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"part_number" integer NOT NULL,
	"turn_number" integer NOT NULL,
	"speaker" text NOT NULL,
	"content" text NOT NULL,
	"new_concepts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edit_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "element_enrichments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"element_id" uuid NOT NULL,
	"element_type" text NOT NULL,
	"enrichment_type" text NOT NULL,
	"prompt_key" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "element_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"element_id" uuid NOT NULL,
	"element_type" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"change_source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"section_label" text DEFAULT '' NOT NULL,
	"log_type" text DEFAULT 'generation' NOT NULL,
	"source" text DEFAULT 'initial' NOT NULL,
	"status" text DEFAULT 'done' NOT NULL,
	"prior_chars" integer DEFAULT 0 NOT NULL,
	"task_chars" integer DEFAULT 0 NOT NULL,
	"input_chars" integer DEFAULT 0 NOT NULL,
	"output_chars" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "glossary_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"term" text NOT NULL,
	"definition" text NOT NULL,
	"extra_columns" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"term_category" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'generated' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mode_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"mode_key" text NOT NULL,
	"param_value" text NOT NULL,
	"html_content" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"body" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "relationship_type_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name_ru" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"default_direction" text DEFAULT 'unidirectional' NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_type_catalog_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "representation_transforms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"source_snapshot" jsonb NOT NULL,
	"target_snapshot" jsonb NOT NULL,
	"result_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"key" text NOT NULL,
	"section_num" integer NOT NULL,
	"title" text NOT NULL,
	"html_content" text DEFAULT '' NOT NULL,
	"sec_context" text DEFAULT '' NOT NULL,
	"is_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"price_usd" numeric(10, 2) NOT NULL,
	"billing_period" text DEFAULT 'month' NOT NULL,
	"quota_syntheses" integer NOT NULL,
	"quota_regenerations" integer NOT NULL,
	"quota_modes" integer NOT NULL,
	"quota_enrichments" integer NOT NULL,
	"stripe_price_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "syntheses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"seed" text DEFAULT '' NOT NULL,
	"method" text DEFAULT 'dialectical' NOT NULL,
	"synth_level" text DEFAULT 'comparative' NOT NULL,
	"depth" text DEFAULT 'standard' NOT NULL,
	"generation_order" text DEFAULT 'architectural' NOT NULL,
	"ext_graph_metrics" boolean DEFAULT false NOT NULL,
	"keep_full_budget" boolean DEFAULT false NOT NULL,
	"context" text DEFAULT '' NOT NULL,
	"lang" text DEFAULT 'Russian' NOT NULL,
	"title" text DEFAULT 'Синтез Философской Концепции' NOT NULL,
	"doc_num" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"section_order" jsonb DEFAULT '["sum"]'::jsonb NOT NULL,
	"structure_sections" jsonb,
	"parent_context_schema" text DEFAULT 'selective-v1' NOT NULL,
	"paused_state" jsonb,
	"version_base" integer DEFAULT 1 NOT NULL,
	"version_sub" integer DEFAULT 0 NOT NULL,
	"version_modes" integer DEFAULT 0 NOT NULL,
	"version_mode_regen" integer DEFAULT 0 NOT NULL,
	"capsule_html" text DEFAULT '' NOT NULL,
	"total_input_tokens" integer DEFAULT 0 NOT NULL,
	"total_output_tokens" integer DEFAULT 0 NOT NULL,
	"total_cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synthesis_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"value" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synthesis_lineage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"parent_type" text NOT NULL,
	"parent_name" text,
	"parent_synthesis_id" uuid,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"thesis_num" integer NOT NULL,
	"formulation" text NOT NULL,
	"justification" text DEFAULT '' NOT NULL,
	"thesis_type" text DEFAULT 'ontological' NOT NULL,
	"novelty_degree" text DEFAULT '' NOT NULL,
	"related_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'generated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount_usd" numeric(10, 6) NOT NULL,
	"balance_after" numeric(10, 4) NOT NULL,
	"synthesis_id" uuid,
	"section_key" text,
	"stripe_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"used_syntheses" integer DEFAULT 0 NOT NULL,
	"used_regenerations" integer DEFAULT 0 NOT NULL,
	"used_modes" integer DEFAULT 0 NOT NULL,
	"used_enrichments" integer DEFAULT 0 NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"role" text DEFAULT 'user' NOT NULL,
	"balance_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_type_catalog_id_category_type_catalog_id_fk" FOREIGN KEY ("type_catalog_id") REFERENCES "public"."category_type_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_edges" ADD CONSTRAINT "category_edges_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_edges" ADD CONSTRAINT "category_edges_source_id_categories_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_edges" ADD CONSTRAINT "category_edges_target_id_categories_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_edges" ADD CONSTRAINT "category_edges_type_catalog_id_relationship_type_catalog_id_fk" FOREIGN KEY ("type_catalog_id") REFERENCES "public"."relationship_type_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_type_catalog" ADD CONSTRAINT "category_type_catalog_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_labels" ADD CONSTRAINT "cluster_labels_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_log" ADD CONSTRAINT "context_log_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialogue_turns" ADD CONSTRAINT "dialogue_turns_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_plans" ADD CONSTRAINT "edit_plans_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_plans" ADD CONSTRAINT "edit_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "element_enrichments" ADD CONSTRAINT "element_enrichments_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_log" ADD CONSTRAINT "generation_log_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mode_results" ADD CONSTRAINT "mode_results_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_type_catalog" ADD CONSTRAINT "relationship_type_catalog_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "representation_transforms" ADD CONSTRAINT "representation_transforms_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syntheses" ADD CONSTRAINT "syntheses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthesis_lineage" ADD CONSTRAINT "synthesis_lineage_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthesis_lineage" ADD CONSTRAINT "synthesis_lineage_parent_synthesis_id_syntheses_id_fk" FOREIGN KEY ("parent_synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theses" ADD CONSTRAINT "theses_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_apikeys_user" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_usage_user" ON "api_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_usage_synthesis" ON "api_usage" USING btree ("synthesis_id");--> statement-breakpoint
CREATE INDEX "idx_categories_synthesis" ON "categories" USING btree ("synthesis_id");--> statement-breakpoint
CREATE INDEX "idx_edges_synthesis" ON "category_edges" USING btree ("synthesis_id");--> statement-breakpoint
CREATE INDEX "idx_edges_source" ON "category_edges" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "idx_edges_target" ON "category_edges" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "idx_justifications_element" ON "characteristic_justifications" USING btree ("element_id","element_type");--> statement-breakpoint
CREATE UNIQUE INDEX "cluster_labels_synthesis_cluster_unique" ON "cluster_labels" USING btree ("synthesis_id","cluster_index");--> statement-breakpoint
CREATE INDEX "idx_ctxlog_synthesis" ON "context_log" USING btree ("synthesis_id");--> statement-breakpoint
CREATE INDEX "idx_dialogue_synthesis" ON "dialogue_turns" USING btree ("synthesis_id");--> statement-breakpoint
CREATE INDEX "idx_plans_synthesis" ON "edit_plans" USING btree ("synthesis_id");--> statement-breakpoint
CREATE INDEX "idx_enrichments_element" ON "element_enrichments" USING btree ("element_id","element_type");--> statement-breakpoint
CREATE INDEX "idx_enrichments_synthesis" ON "element_enrichments" USING btree ("synthesis_id");--> statement-breakpoint
CREATE INDEX "idx_versions_element" ON "element_versions" USING btree ("element_id","element_type");--> statement-breakpoint
CREATE INDEX "idx_genlog_synthesis" ON "generation_log" USING btree ("synthesis_id");--> statement-breakpoint
CREATE INDEX "idx_glossary_synthesis" ON "glossary_terms" USING btree ("synthesis_id");--> statement-breakpoint
CREATE INDEX "idx_modes_synthesis" ON "mode_results" USING btree ("synthesis_id");--> statement-breakpoint
CREATE INDEX "idx_modes_key" ON "mode_results" USING btree ("synthesis_id","mode_key");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_templates_key_version_unique" ON "prompt_templates" USING btree ("key","version");--> statement-breakpoint
CREATE INDEX "idx_prompts_key_active" ON "prompt_templates" USING btree ("key") WHERE "prompt_templates"."is_active" = true;--> statement-breakpoint
CREATE INDEX "idx_transforms_synthesis" ON "representation_transforms" USING btree ("synthesis_id");--> statement-breakpoint
CREATE INDEX "idx_transforms_direction" ON "representation_transforms" USING btree ("synthesis_id","direction");--> statement-breakpoint
CREATE INDEX "idx_sections_synthesis" ON "sections" USING btree ("synthesis_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sections_synthesis_key_unique" ON "sections" USING btree ("synthesis_id","key");--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_syntheses_user" ON "syntheses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_syntheses_status" ON "syntheses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_syntheses_public" ON "syntheses" USING btree ("is_public") WHERE "syntheses"."is_public" = true;--> statement-breakpoint
CREATE INDEX "idx_syntheses_paused" ON "syntheses" USING btree ("status") WHERE "syntheses"."status" = 'paused';--> statement-breakpoint
CREATE INDEX "idx_syntheses_title_trgm" ON "syntheses" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "synthesis_configs_key_version_unique" ON "synthesis_configs" USING btree ("key","version");--> statement-breakpoint
CREATE INDEX "idx_configs_key_active" ON "synthesis_configs" USING btree ("key") WHERE "synthesis_configs"."is_active" = true;--> statement-breakpoint
CREATE INDEX "idx_lineage_synthesis" ON "synthesis_lineage" USING btree ("synthesis_id");--> statement-breakpoint
CREATE INDEX "idx_lineage_parent_synth" ON "synthesis_lineage" USING btree ("parent_synthesis_id");--> statement-breakpoint
CREATE INDEX "idx_lineage_parent_name" ON "synthesis_lineage" USING btree ("parent_name") WHERE "synthesis_lineage"."parent_type" = 'philosopher';--> statement-breakpoint
CREATE INDEX "idx_theses_synthesis" ON "theses" USING btree ("synthesis_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_user" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_user" ON "user_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_status" ON "user_subscriptions" USING btree ("status") WHERE "user_subscriptions"."status" IN ('active', 'trialing');