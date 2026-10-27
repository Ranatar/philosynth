-- 15.1 (Д-70): целостность пары «ребёнок → концепция-родитель».
-- Чистка дублей, оставленных параллельными POST /lineage/link (linkParent
-- искал дубликат вне транзакции): у пары остаётся строка с НАИМЕНЬШЕЙ
-- позицией (первая записанная; при равных — с меньшим id), остальные
-- снимаются. Строк философов и строк с удалённым родителем чистка не касается.
DELETE FROM "synthesis_lineage" a
USING "synthesis_lineage" b
WHERE a."parent_type" = 'synthesis'
  AND b."parent_type" = 'synthesis'
  AND a."synthesis_id" = b."synthesis_id"
  AND a."parent_synthesis_id" IS NOT NULL
  AND a."parent_synthesis_id" = b."parent_synthesis_id"
  AND (a."position" > b."position" OR (a."position" = b."position" AND a."id" > b."id"));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_lineage_parent_pair" ON "synthesis_lineage" USING btree ("synthesis_id","parent_synthesis_id") WHERE "synthesis_lineage"."parent_type" = 'synthesis' AND "synthesis_lineage"."parent_synthesis_id" IS NOT NULL;
