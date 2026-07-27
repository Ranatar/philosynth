/**
 * scripts/test-normalize-0.3b.ts — тесты normalizeType по протоколу
 * беседы 0.3b (запросы 3–4). Кейс выбирается аргументом:
 *   npx tsx scripts/test-normalize-0.3b.ts dialectical
 *   npx tsx scripts/test-normalize-0.3b.ts causal
 *   npx tsx scripts/test-normalize-0.3b.ts unknown
 */
import { closeDb } from "../server/db/index.js";
import { closeRedis } from "../server/redis.js";
import { normalizeType } from "../server/services/element-taxonomy.js";

const CASES: Record<
  string,
  { text: string; kind: "category" | "relationship"; expectKey: string | null }
> = {
  dialectical: { text: "диалектическая", kind: "relationship", expectKey: "dialectical" },
  causal: { text: "причинно-следственная", kind: "relationship", expectKey: "causal" },
  unknown: { text: "странный_тип_42", kind: "category", expectKey: null },
};

async function main(): Promise<void> {
  const name = process.argv[2] ?? "dialectical";
  const c = CASES[name];
  if (!c) throw new Error(`неизвестный кейс: ${name}`);

  const result = await normalizeType(c.text, c.kind);
  console.log(`normalizeType(${JSON.stringify(c.text)}, "${c.kind}") →`);
  console.log(JSON.stringify(result, null, 2));

  const ok =
    c.expectKey === null
      ? result.match === null && result.suggestions.length > 0
      : result.match?.key === c.expectKey;
  console.log(
    ok
      ? `\nOK: ожидание ${c.expectKey === null ? "match=null + suggestions" : `match.key=${c.expectKey}`} выполнено`
      : `\nFAIL: ожидалось ${c.expectKey === null ? "match=null" : `match.key=${c.expectKey}`}, получено ${result.match?.key ?? "null"}`,
  );
  if (!ok) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("test-normalize: фатальная ошибка:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeRedis();
    await closeDb();
  });
