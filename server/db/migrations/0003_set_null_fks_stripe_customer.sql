ALTER TABLE "categories" DROP CONSTRAINT "categories_type_catalog_id_category_type_catalog_id_fk";
--> statement-breakpoint
ALTER TABLE "category_edges" DROP CONSTRAINT "category_edges_type_catalog_id_relationship_type_catalog_id_fk";
--> statement-breakpoint
ALTER TABLE "category_type_catalog" DROP CONSTRAINT "category_type_catalog_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "prompt_templates" DROP CONSTRAINT "prompt_templates_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "relationship_type_catalog" DROP CONSTRAINT "relationship_type_catalog_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_type_catalog_id_category_type_catalog_id_fk" FOREIGN KEY ("type_catalog_id") REFERENCES "public"."category_type_catalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_edges" ADD CONSTRAINT "category_edges_type_catalog_id_relationship_type_catalog_id_fk" FOREIGN KEY ("type_catalog_id") REFERENCES "public"."relationship_type_catalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_type_catalog" ADD CONSTRAINT "category_type_catalog_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_type_catalog" ADD CONSTRAINT "relationship_type_catalog_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id");