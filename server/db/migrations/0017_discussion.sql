-- 16.1 (Фаза 16): социальный слой — участники синтеза (synthesis_members), комментарии
-- (comments; ветка плоская, parent_id → корень), рецензии (reviews) с редакциями
-- (review_revisions) и замечаниями (review_findings). Адрес — jsonb DiscussionAddress
-- + address_kind/address_key колонками (отбор, сводка). Генерат drizzle-kit, тег
-- переименован; снапшот — генерат.
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"author_id" uuid,
	"address" jsonb NOT NULL,
	"address_kind" text NOT NULL,
	"address_key" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"parent_id" uuid,
	"kind" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"hidden_by" uuid,
	"hidden_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_status_check" CHECK ("comments"."status" IN ('open','resolved','hidden')),
	CONSTRAINT "comments_kind_check" CHECK ("comments"."kind" IS NULL OR "comments"."kind" IN ('question','objection','source','unclear'))
);
--> statement-breakpoint
CREATE TABLE "review_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"address" jsonb NOT NULL,
	"address_kind" text NOT NULL,
	"address_key" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"kind" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_findings_kind_check" CHECK ("review_findings"."kind" IS NULL OR "review_findings"."kind" IN ('question','objection','source','unclear'))
);
--> statement-breakpoint
CREATE TABLE "review_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"doc_version" jsonb NOT NULL,
	"fields" jsonb NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"author_id" uuid,
	"version_base" integer DEFAULT 1 NOT NULL,
	"version_sub" integer DEFAULT 0 NOT NULL,
	"version_modes" integer DEFAULT 0 NOT NULL,
	"version_mode_regen" integer DEFAULT 0 NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"strengths" text DEFAULT '' NOT NULL,
	"objections" text DEFAULT '' NOT NULL,
	"minor" text DEFAULT '' NOT NULL,
	"questions" text DEFAULT '' NOT NULL,
	"conclusion" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_status_check" CHECK ("reviews"."status" IN ('draft','published','withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "synthesis_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synthesis_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invited_by" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "synthesis_members_role_check" CHECK ("synthesis_members"."role" IN ('reviewer','editor')),
	CONSTRAINT "synthesis_members_status_check" CHECK ("synthesis_members"."status" IN ('invited','active'))
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_revisions" ADD CONSTRAINT "review_revisions_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthesis_members" ADD CONSTRAINT "synthesis_members_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthesis_members" ADD CONSTRAINT "synthesis_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthesis_members" ADD CONSTRAINT "synthesis_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_comments_synthesis_created" ON "comments" USING btree ("synthesis_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_comments_address" ON "comments" USING btree ("synthesis_id","address_kind","address_key");--> statement-breakpoint
CREATE INDEX "idx_comments_parent" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_comments_author" ON "comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_review_findings_review" ON "review_findings" USING btree ("review_id","position");--> statement-breakpoint
CREATE INDEX "idx_review_findings_address" ON "review_findings" USING btree ("synthesis_id","address_kind","address_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_review_revisions_review_revision" ON "review_revisions" USING btree ("review_id","revision");--> statement-breakpoint
CREATE INDEX "idx_reviews_synthesis" ON "reviews" USING btree ("synthesis_id","status");--> statement-breakpoint
CREATE INDEX "idx_reviews_author" ON "reviews" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_synthesis_members_pair" ON "synthesis_members" USING btree ("synthesis_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_synthesis_members_user" ON "synthesis_members" USING btree ("user_id");