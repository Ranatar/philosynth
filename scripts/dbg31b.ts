import { eq, asc } from "drizzle-orm";
import { db, closeDb } from "../server/db/index.js";
import { closeRedis } from "../server/redis.js";
import { syntheses, synthesisLineage } from "../server/db/schema.js";
import { loadConceptParticipants } from "../server/services/meta-synthesis-service.js";
import { buildParams, registerParentContextProvider } from "../server/services/generation-service.js";
import { baseCtx } from "../server/services/prompt-builder.js";
async function main() {
  registerParentContextProvider();
  // Последний мета-синтез из прогона тестов
  const [metaRow] = await db.select().from(syntheses)
    .where(eq(syntheses.seed, "Опыт как забота"))
    .orderBy(asc(syntheses.createdAt));
  if (!metaRow) throw new Error("нет меты");
  const phils = (await db.select().from(synthesisLineage)
    .where(eq(synthesisLineage.synthesisId, metaRow.id)))
    .filter(r => r.parentType === "philosopher").map(r => r.parentName as string);
  const concepts = await loadConceptParticipants(metaRow.id);
  console.log("капсула A (поле):", JSON.stringify(concepts[0]?.capsule ?? "").slice(0, 200));
  const p = buildParams(metaRow, phils, {}, concepts);
  const ctx = await baseCtx(p);
  const i = ctx.indexOf("КОНТЕКСТ КОНЦЕПЦИЙ");
  console.log("── хвост baseCtx (блок родителей) ──");
  console.log(ctx.slice(i, i + 900));
}
main().finally(async () => { await closeDb(); await closeRedis(); });
