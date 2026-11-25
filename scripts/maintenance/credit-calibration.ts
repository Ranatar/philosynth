/**
 * credit-calibration.ts — сверка весов кредитов с фактическими расходами
 * (2026-11-25, вне бесед; решение пользователя по тарифной сетке).
 *
 * Вес операции в кредитах (CREDIT_WEIGHTS, config/plan-economics.ts) —
 * ВЕРХНЯЯ оценка её себестоимости: у каждого прохода после первого — весь
 * бюджет контекста, выход раздела — по формуле оценщика 1.1. Скрипт берёт
 * фактические расходы из api_usage и показывает, во сколько раз факт
 * дешевле (или дороже) весов. По этому числу решают, сдвигать ли веса и
 * квоты тарифов; сам скрипт ничего не пишет.
 *
 * Разбор строк api_usage по section_key:
 *   - «ключ» или «ключ+ключ» — проход раздела: первое появление ключа в
 *     синтезе — часть исходной генерации (синтез), повторное — перегенерация
 *     раздела;
 *   - «ключ:Подраздел» — подраздел; «mode:…» — режим; «enrich:…» —
 *     обогащение; прочее (уточнение, преобразование, _genCommon) — в «прочее».
 * Синтез сравнивается с опорной себестоимостью ЕГО состава и глубины
 * (referenceSynthesisCostUsd), раздел — с опорной перегенерацией того же
 * ключа (referenceSectionCostUsd), подраздел/режим/обогащение — с весом.
 * В синтез идут только синтезы, у которых в api_usage не меньше трёх
 * разделов исходной генерации (оборванные исказили бы среднее).
 *
 * Запуск ИЗ КОРНЯ репозитория (DATABASE_URL — из окружения, как у сидов):
 *   npm run billing:calibrate
 *   npm run billing:calibrate -- --since 2026-11-01   # с даты
 *   npm run billing:calibrate -- --mode byo           # один режим оплаты
 *
 * Модуль вне описи i18n: его строки — вывод консоли оператора.
 */
import { sql } from "drizzle-orm";

import {
  CREDIT_USD,
  CREDIT_WEIGHTS,
  expectedSectionOutputTokens,
  referenceSectionCostUsd,
  referenceSynthesisCostUsd,
} from "../../server/config/plan-economics.js";
import { closeDb, db } from "../../server/db/index.js";
import { SECTION_OUTPUT_MULT } from "../../server/services/cost-estimator.js";

type Op = "synthesis" | "section" | "subsection" | "mode" | "enrichment" | "other";

interface UsageRow {
  synthesis_id: string | null;
  section_key: string | null;
  depth: string | null;
  billing_mode: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: string;
  created_at: string;
}

interface Bucket {
  n: number;
  actualUsd: number;
  referenceUsd: number;
  inTokens: number;
  outTokens: number;
}

const SECTION_KEYS = new Set(Object.keys(SECTION_OUTPUT_MULT).filter((k) => k !== "_default"));

const OP_LABELS: Record<Op, string> = {
  synthesis: "синтез",
  section: "раздел",
  subsection: "подраздел",
  mode: "режим",
  enrichment: "обогащение",
  other: "прочее",
};

function parseArgs(argv: string[]): { since: string | null; mode: string | null } {
  let since: string | null = null;
  let mode: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--since") since = argv[++i] ?? null;
    else if (a === "--mode") mode = argv[++i] ?? null;
    else throw new Error(`неизвестный довод: ${a} (есть --since ГГГГ-ММ-ДД, --mode byo|subscription|balance)`);
  }
  if (since !== null && !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error(`--since: ожидается ГГГГ-ММ-ДД, получено ${since}`);
  if (mode !== null && !["byo", "subscription", "balance"].includes(mode)) throw new Error(`--mode: byo|subscription|balance, получено ${mode}`);
  return { since, mode };
}

function sectionKeysOf(key: string): string[] | null {
  const parts = key.split("+");
  return parts.every((p) => SECTION_KEYS.has(p)) ? parts : null;
}

function emptyBucket(): Bucket {
  return { n: 0, actualUsd: 0, referenceUsd: 0, inTokens: 0, outTokens: 0 };
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const usd = (x: number): string => "$" + x.toFixed(x < 1 ? 4 : 2);
const ratio = (a: number, b: number): string => (b > 0 ? (a / b).toFixed(2) : "—");

async function main(): Promise<void> {
  const { since, mode } = parseArgs(process.argv.slice(2));
  const res = await db.execute(sql`
    SELECT u.synthesis_id, u.section_key, s.depth, u.billing_mode,
           u.input_tokens, u.output_tokens, u.cost_usd, u.created_at
      FROM api_usage u
      LEFT JOIN syntheses s ON s.id = u.synthesis_id
     WHERE (${since}::date IS NULL OR u.created_at >= ${since}::date)
       AND (${mode}::text IS NULL OR u.billing_mode = ${mode}::text)
     ORDER BY u.synthesis_id, u.created_at`);
  const rows = (res as unknown as { rows?: UsageRow[] }).rows ?? (res as unknown as UsageRow[]);

  const buckets: Record<Op, Bucket> = {
    synthesis: emptyBucket(),
    section: emptyBucket(),
    subsection: emptyBucket(),
    mode: emptyBucket(),
    enrichment: emptyBucket(),
    other: emptyBucket(),
  };
  /** Выход раздела: факт / оценщик, по ключу */
  const outRatios = new Map<string, number[]>();

  interface SynthAcc { depth: string; keys: string[]; actual: number; inT: number; outT: number }
  const synth = new Map<string, SynthAcc>();
  const seen = new Map<string, Set<string>>();

  for (const r of rows) {
    const key = r.section_key ?? "";
    const cost = Number(r.cost_usd);
    const depth = r.depth ?? "standard";
    const add = (op: Op, ref: number) => {
      const b = buckets[op];
      b.n += 1;
      b.actualUsd += cost;
      b.referenceUsd += ref;
      b.inTokens += r.input_tokens;
      b.outTokens += r.output_tokens;
    };

    const keys = sectionKeysOf(key);
    if (keys && r.synthesis_id) {
      const seenKeys = seen.get(r.synthesis_id) ?? new Set<string>();
      seen.set(r.synthesis_id, seenKeys);
      const expectedOut = keys.reduce((s, k) => s + expectedSectionOutputTokens(k, depth), 0);
      if (expectedOut > 0 && r.output_tokens > 0) {
        const list = outRatios.get(key) ?? [];
        list.push(r.output_tokens / expectedOut);
        outRatios.set(key, list);
      }
      if (keys.some((k) => seenKeys.has(k))) {
        add("section", keys.reduce((s, k) => s + referenceSectionCostUsd(k, depth), 0));
      } else {
        keys.forEach((k) => seenKeys.add(k));
        const acc = synth.get(r.synthesis_id) ?? { depth, keys: [], actual: 0, inT: 0, outT: 0 };
        acc.keys.push(...keys);
        acc.actual += cost;
        acc.inT += r.input_tokens;
        acc.outT += r.output_tokens;
        synth.set(r.synthesis_id, acc);
      }
      continue;
    }
    const head = key.split(":")[0] ?? "";
    if (key.startsWith("mode:")) add("mode", CREDIT_WEIGHTS.mode * CREDIT_USD);
    else if (key.startsWith("enrich:")) add("enrichment", CREDIT_WEIGHTS.enrichment * CREDIT_USD);
    else if (key.includes(":") && SECTION_KEYS.has(head)) add("subsection", CREDIT_WEIGHTS.subsection * CREDIT_USD);
    else add("other", 0);
  }

  let skippedSynth = 0;
  for (const acc of synth.values()) {
    if (acc.keys.length < 3) {
      skippedSynth += 1;
      continue;
    }
    const b = buckets.synthesis;
    b.n += 1;
    b.actualUsd += acc.actual;
    b.referenceUsd += referenceSynthesisCostUsd(acc.keys, acc.depth);
    b.inTokens += acc.inT;
    b.outTokens += acc.outT;
  }

  console.log(
    `Сверка весов кредитов с фактом: ${rows.length} строк api_usage` +
      `${since ? ` с ${since}` : ""}${mode ? `, режим ${mode}` : ""}; кредит по весам — ${usd(CREDIT_USD)}`,
  );
  if (rows.length === 0) {
    console.log("Расходов нет — сверять не с чем.");
    return;
  }
  console.log("");
  console.log("операция      шт.   факт, ср.   по весу, ср.   факт/вес   вход/выход, тыс. ток. ср.");
  let totalActual = 0;
  let totalRef = 0;
  for (const op of ["synthesis", "section", "subsection", "mode", "enrichment"] as const) {
    const b = buckets[op];
    if (b.n === 0) continue;
    totalActual += b.actualUsd;
    totalRef += b.referenceUsd;
    console.log(
      `${OP_LABELS[op].padEnd(12)} ${String(b.n).padStart(4)}   ${usd(b.actualUsd / b.n).padStart(9)}   ` +
        `${usd(b.referenceUsd / b.n).padStart(12)}   ${ratio(b.actualUsd, b.referenceUsd).padStart(8)}   ` +
        `${(b.inTokens / b.n / 1000).toFixed(1)} / ${(b.outTokens / b.n / 1000).toFixed(1)}`,
    );
  }
  if (buckets.other.n) console.log(`прочее (без веса): ${buckets.other.n} строк, ${usd(buckets.other.actualUsd)}`);
  if (skippedSynth) console.log(`синтезов пропущено (меньше трёх разделов исходной генерации): ${skippedSynth}`);

  const outLines = [...outRatios.entries()]
    .filter(([, xs]) => xs.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([k, xs]) => `${k} ×${median(xs).toFixed(2)} (${xs.length})`);
  if (outLines.length) {
    console.log("");
    console.log("Выход раздела, факт / оценщик (медиана, шт.):");
    console.log("  " + outLines.join("; "));
  }

  if (totalRef > 0) {
    const k = totalActual / totalRef;
    console.log("");
    console.log(
      `Итого: факт ${usd(totalActual)} против ${usd(totalRef)} по весам — коэффициент ${k.toFixed(2)}; ` +
        `кредит по факту ≈ ${usd(CREDIT_USD * k)} себестоимости.`,
    );
    console.log(
      k < 1
        ? `Веса завышены: действующая наценка тарифов на ${((1 / k - 1) * 100).toFixed(0)}% выше расчётной. ` +
            `Чтобы отдать запас пользователю, веса можно умножить на ${k.toFixed(2)} (квоты в кредитах — те же).`
        : `Веса занижены: тарифы зарабатывают меньше расчётного — веса стоит умножить на ${k.toFixed(2)} или поднять цены.`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
