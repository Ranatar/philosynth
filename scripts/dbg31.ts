import { resolveParentDeps } from "../server/services/parent-context.js";
import { closeDb } from "../server/db/index.js";
import { closeRedis } from "../server/redis.js";
async function main() {
  const deps = await resolveParentDeps({ synthLevel: "integrative", method: "dialectical" });
  console.log("KEYS:", Object.keys(deps).join(","));
  console.log("ontology:", JSON.stringify((deps as Record<string, unknown>)["ontology"]));
}
main().finally(async () => { await closeDb(); await closeRedis(); });
