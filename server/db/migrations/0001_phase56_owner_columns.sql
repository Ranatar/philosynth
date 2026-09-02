ALTER TABLE "characteristic_justifications" ADD COLUMN "synthesis_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "element_versions" ADD COLUMN "synthesis_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "characteristic_justifications" ADD CONSTRAINT "characteristic_justifications_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "element_versions" ADD CONSTRAINT "element_versions_synthesis_id_syntheses_id_fk" FOREIGN KEY ("synthesis_id") REFERENCES "public"."syntheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_justifications_synthesis" ON "characteristic_justifications" USING btree ("synthesis_id");--> statement-breakpoint
CREATE INDEX "idx_versions_synthesis" ON "element_versions" USING btree ("synthesis_id");