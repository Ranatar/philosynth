/**
 * scripts/stripe-create-prices.ts — заведение Product и Price в Stripe по
 * каждому тарифу из server/config/plans.ts ключом ВЛАДЕЛЬЦА службы
 * (беседа 8.3, запрос 1, п. 4). Второй из двух шагов заведения тарифов:
 * описание — в коде (plans.ts), Price — только в аккаунте Stripe.
 *
 * Идемпотентность — через lookup_key = stripeLookupKeyFor(name)
 * ('philosynth_starter' и т. д.): Stripe хранит его сам и не даёт двух цен
 * с одним ключом (resource_already_exists). Повторный запуск находит
 * price_… по GET /v1/prices?lookup_keys[]=… и НЕ создаёт дубликата, а
 * сообщает найденный id (skip). Product ищется по metadata.philosynth_plan
 * среди активных продуктов; нет — создаётся.
 *
 * Цена в Stripe неизменяема (сумма/валюта/период). Если найденная по
 * lookup_key цена расходится с plans.ts → fail с объяснением; с флагом
 * --transfer заводится НОВАЯ цена с transfer_lookup_key=true (ключ
 * переезжает на неё), прежняя деактивируется (active=false — на уже
 * оформленные подписки не влияет, они привязаны к Price). Живые подписки
 * в БД при смене Price ловит уже заслон seed-plans, не этот скрипт.
 *
 * В конце печатаются готовые строки STRIPE_PRICE_<NAME>=price_… для
 * вставки в .env (п. 4b) — их читает npm run seed:plans.
 *
 * Пустой STRIPE_SECRET_KEY → внятный отказ ДО первого запроса (п. 4c), а не
 * 503 STRIPE_UNAVAILABLE из недр клиента. Ключ и база API берутся из
 * env.ts (читается один раз при импорте — 09 §5 6.1: переменные задавать
 * до запуска, не внутри процесса). STRIPE_API_BASE ≠ api.stripe.com
 * печатается явно: так виден запуск против мока 8.2 (tools/stripe-mock.mjs).
 *
 * Запуск: STRIPE_SECRET_KEY=sk_… npm run stripe:create-prices [-- --transfer]
 *   (или: npx tsx scripts/stripe-create-prices.ts). Код возврата: 1 при fail.
 * БД скрипту не нужна.
 */
import {
  PLANS,
  priceEnvVarFor,
  stripeIntervalFor,
  stripeLookupKeyFor,
  stripeProductNameFor,
  type PlanDefinition,
} from "../server/config/plans.js";
import { env } from "../server/env.js";
import {
  StripeError,
  isStripeConfigured,
  stripe,
  type StripePrice,
  type StripeProduct,
} from "../server/services/stripe-client.js";

export type PriceOutcome = "created" | "skip" | "fail";

export interface PlanPriceResult {
  name: string;
  outcome: PriceOutcome;
  envVar: string;
  priceId?: string;
  productId?: string;
  /** created с --transfer: прежняя цена, деактивированная */
  replacedPriceId?: string;
  error?: string;
}

export interface CreatePricesReport {
  results: PlanPriceResult[];
  counts: Record<PriceOutcome, number>;
  apiBase: string;
}

export interface CreatePricesOptions {
  /** Заводить новую цену при расхождении с найденной (ключ переезжает) */
  transfer?: boolean;
  plans?: readonly PlanDefinition[];
}

export const STRIPE_PRODUCT_META_KEY = "philosynth_plan";

/** Цена плана в центах (NUMERIC(10,2) → целое). */
export function priceCents(plan: PlanDefinition): number {
  return Math.round(plan.priceUsd * 100);
}

/** Совпадает ли Price с описанием тарифа (сумма, валюта, период). */
export function priceMatchesPlan(price: StripePrice, plan: PlanDefinition): boolean {
  return (
    price.unit_amount === priceCents(plan) &&
    price.currency.toLowerCase() === "usd" &&
    price.recurring !== null &&
    price.recurring.interval === stripeIntervalFor(plan.billingPeriod) &&
    (price.recurring.interval_count ?? 1) === 1
  );
}

function describePrice(price: StripePrice): string {
  const amount = price.unit_amount === null ? "—" : `$${(price.unit_amount / 100).toFixed(2)}`;
  const period = price.recurring ? `/${price.recurring.interval}` : " (one_time)";
  return `${price.id}: ${amount} ${price.currency.toUpperCase()}${period}${price.active ? "" : ", inactive"}`;
}

async function findProduct(plan: PlanDefinition): Promise<StripeProduct | undefined> {
  const list = await stripe.listProducts({ active: true, limit: 100 });
  return list.data.find((p) => p.metadata?.[STRIPE_PRODUCT_META_KEY] === plan.name);
}

async function ensureProduct(plan: PlanDefinition): Promise<StripeProduct> {
  const found = await findProduct(plan);
  if (found) return found;
  return stripe.createProduct({
    name: stripeProductNameFor(plan),
    description:
      `Подписка PhiloSynth «${plan.displayName}»: ${plan.quotaSyntheses} синтезов, ` +
      `${plan.quotaRegenerations} перегенераций, ${plan.quotaModes} режимов, ` +
      `${plan.quotaEnrichments} обогащений за ${plan.billingPeriod === "month" ? "месяц" : "год"}`,
    metadata: { [STRIPE_PRODUCT_META_KEY]: plan.name },
  });
}

async function ensurePrice(plan: PlanDefinition, transfer: boolean): Promise<PlanPriceResult> {
  const envVar = priceEnvVarFor(plan.name);
  const lookupKey = stripeLookupKeyFor(plan.name);

  const existing = await stripe.listPrices({ lookupKeys: [lookupKey], limit: 10 });
  // lookup_key уникален в Stripe — больше одной быть не должно; берём активную, иначе любую
  const found = existing.data.find((p) => p.active) ?? existing.data[0];

  if (found) {
    if (priceMatchesPlan(found, plan)) {
      return { name: plan.name, outcome: "skip", envVar, priceId: found.id, productId: found.product };
    }
    if (!transfer) {
      return {
        name: plan.name,
        outcome: "fail",
        envVar,
        priceId: found.id,
        productId: found.product,
        error:
          `цена с lookup_key '${lookupKey}' уже есть (${describePrice(found)}), но расходится с plans.ts ` +
          `($${plan.priceUsd.toFixed(2)} USD/${plan.billingPeriod}). Price в Stripe неизменяем: запустите с --transfer — ` +
          `будет заведена новая цена, ключ переедет на неё, прежняя станет inactive (оформленные подписки не тронуты).`,
      };
    }
    const fresh = await stripe.createPrice({
      productId: found.product,
      unitAmountCents: priceCents(plan),
      currency: "usd",
      interval: stripeIntervalFor(plan.billingPeriod),
      lookupKey,
      transferLookupKey: true,
      nickname: plan.displayName,
      metadata: { [STRIPE_PRODUCT_META_KEY]: plan.name },
    });
    if (found.active) await stripe.updatePrice(found.id, { active: false });
    return {
      name: plan.name,
      outcome: "created",
      envVar,
      priceId: fresh.id,
      productId: fresh.product,
      replacedPriceId: found.id,
    };
  }

  const product = await ensureProduct(plan);
  const price = await stripe.createPrice({
    productId: product.id,
    unitAmountCents: priceCents(plan),
    currency: "usd",
    interval: stripeIntervalFor(plan.billingPeriod),
    lookupKey,
    nickname: plan.displayName,
    metadata: { [STRIPE_PRODUCT_META_KEY]: plan.name },
  });
  return { name: plan.name, outcome: "created", envVar, priceId: price.id, productId: product.id };
}

/**
 * Заведение целиком — экспортировано отдельно от main() для тестов (мок 8.2).
 * Не проверяет ключ: это делает main до первого запроса; при пустом ключе
 * клиент бросит StripeError STRIPE_UNAVAILABLE на первом же вызове.
 */
export async function createPrices(opts: CreatePricesOptions = {}): Promise<CreatePricesReport> {
  const plans = opts.plans ?? PLANS;
  const transfer = opts.transfer ?? false;
  const results: PlanPriceResult[] = [];
  for (const plan of plans) {
    try {
      results.push(await ensurePrice(plan, transfer));
    } catch (err) {
      const e = err as StripeError;
      const msg =
        err instanceof StripeError
          ? `${e.code}${e.status ? ` ${e.status}` : ""}${e.stripeCode ? ` (${e.stripeCode})` : ""}: ${e.message}`
          : (err as Error).message ?? String(err);
      results.push({ name: plan.name, outcome: "fail", envVar: priceEnvVarFor(plan.name), error: msg });
    }
  }
  const counts: Record<PriceOutcome, number> = { created: 0, skip: 0, fail: 0 };
  for (const r of results) counts[r.outcome] += 1;
  return { results, counts, apiBase: env.stripe.apiBase };
}

/** Строки для .env — по всем тарифам, у которых Price известен. */
export function envLines(report: CreatePricesReport): string[] {
  return report.results
    .filter((r) => r.priceId)
    .map((r) => `${r.envVar}=${r.priceId}`);
}

function parseArgs(argv: string[]): CreatePricesOptions {
  const o: CreatePricesOptions = {};
  for (const a of argv) {
    if (a === "--transfer") o.transfer = true;
    else if (a === "-h" || a === "--help") {
      console.log(
        "stripe-create-prices: заводит Product и Price в Stripe по тарифам server/config/plans.ts.\n" +
          "  STRIPE_SECRET_KEY=sk_… npm run stripe:create-prices [-- --transfer]\n" +
          "  --transfer  при расхождении найденной цены с plans.ts завести новую и перенести lookup_key",
      );
      process.exit(0);
    } else {
      console.error(`Неизвестный аргумент: ${a} (см. --help)`);
      process.exit(2);
    }
  }
  return o;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (!isStripeConfigured()) {
    console.error(
      "stripe-create-prices: STRIPE_SECRET_KEY пуст — заводить Prices нечем.\n" +
        "  Возьмите секретный ключ владельца в Dashboard Stripe (Developers → API keys) и запустите:\n" +
        "    STRIPE_SECRET_KEY=sk_… npm run stripe:create-prices\n" +
        "  Ни одного запроса к Stripe не сделано.",
    );
    process.exitCode = 1;
    return;
  }

  const keyKind = env.stripe.secretKey.startsWith("sk_live_")
    ? "LIVE"
    : env.stripe.secretKey.startsWith("sk_test_")
      ? "test"
      : "нестандартный";
  console.log(
    `Заведение Prices: ${PLANS.length} тарифов · Stripe API ${env.stripe.apiBase}` +
      `${env.stripe.apiBase.includes("api.stripe.com") ? "" : " (НЕ api.stripe.com — мок/прокси)"} · ключ ${keyKind}` +
      `${opts.transfer ? " · --transfer" : ""}`,
  );

  const report = await createPrices(opts);
  const c = report.counts;
  console.log(`\nprices: created=${c.created}, skip=${c.skip}, fail=${c.fail}`);
  for (const r of report.results) {
    if (r.outcome === "fail") console.error(`  FAIL    ${r.name}: ${r.error}`);
    else if (r.outcome === "created")
      console.log(
        `  created ${r.name}: ${r.priceId} (product ${r.productId})` +
          (r.replacedPriceId ? ` — заменил ${r.replacedPriceId}, тот деактивирован` : ""),
      );
    else console.log(`  skip    ${r.name}: найден ${r.priceId} по lookup_key ${stripeLookupKeyFor(r.name)}`);
  }

  const lines = envLines(report);
  if (lines.length) {
    console.log("\nСтроки для .env (их читает npm run seed:plans):");
    for (const l of lines) console.log(`  ${l}`);
    if (c.fail === 0) console.log("\nДальше: вставьте строки в .env и выполните npm run seed:plans");
  }
  if (c.fail > 0) process.exitCode = 1;
}

// Импорт из тестов не должен запускать main (образец bootstrap-admin)
const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/stripe-create-prices.ts");
if (isDirectRun) {
  main().catch((err) => {
    console.error("stripe-create-prices: фатальная ошибка:", err);
    process.exitCode = 1;
  });
}
