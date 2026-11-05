/**
 * Product и Price тарифов в Stripe — общий слой сида цен
 * (scripts/seed/stripe-create-prices.ts, 8.3) и админки тарифов
 * (services/plan-admin.ts, 15.4 Д-74). До 15.4 логика жила в скрипте;
 * серверу (новая цена при правке, Price новой редакции, Product нового
 * семейства) нужна та же, и копия в продукте разошлась бы с сидом.
 *
 * Устройство (решения 8.3 и 15.4):
 *  - Product — ОДИН на семейство тарифа; ищется среди активных продуктов по
 *    metadata.philosynth_plan = family (у посеянных 8.3 там стоит name —
 *    у редакции 1 это и есть семейство); имя и описание приводятся к
 *    открытой редакции (14.1, Д-61: описание английское, одно на все языки);
 *  - Price — на редакцию; lookup_key = philosynth_<name редакции>
 *    (stripeLookupKeyFor); Price в Stripe неизменяем — новая цена или период
 *    означают новый Price, прежний выключается (active=false: оформленные
 *    подписки он не трогает — они привязаны к Price);
 *  - ошибки Stripe (StripeError) пробрасываются вызывающему.
 */
import {
  stripeIntervalFor,
  stripeLookupKeyFor,
  stripeProductNameFor,
} from "../config/plans.js";
import type { PlanSpec } from "../config/plan-economics.js";
import { stripe, type StripePrice, type StripeProduct } from "./stripe-client.js";

/** Ключ metadata Product, по которому семейство находится повторно. */
export const STRIPE_PRODUCT_META_KEY = "philosynth_plan";

/** Цена плана в центах (NUMERIC(10,2) → целое). */
export function priceCents(plan: Pick<PlanSpec, "priceUsd">): number {
  return Math.round(plan.priceUsd * 100);
}

/** Совпадает ли Price с описанием тарифа (сумма, валюта, период). */
export function priceMatchesPlan(price: StripePrice, plan: Pick<PlanSpec, "priceUsd" | "billingPeriod">): boolean {
  return (
    price.unit_amount === priceCents(plan) &&
    price.currency.toLowerCase() === "usd" &&
    price.recurring !== null &&
    price.recurring.interval === stripeIntervalFor(plan.billingPeriod) &&
    (price.recurring.interval_count ?? 1) === 1
  );
}

/**
 * 14.1 (Д-61): описание продукта — АНГЛИЙСКОЕ, одно на все языки (решение
 * владельца 2026-10-13): у Stripe одно описание на продукт, его видит любой
 * покупатель на странице оплаты и в счетах; tl() здесь неуместен — это не
 * текст ответа, а значение в чужой системе.
 */
export function stripeProductDescriptionFor(plan: PlanSpec): string {
  return (
    `PhiloSynth "${plan.displayName}" subscription: ${plan.quotaSyntheses} syntheses, ` +
    `${plan.quotaRegenerations} regenerations, ${plan.quotaModes} modes, ` +
    `${plan.quotaEnrichments} enrichments per ${plan.billingPeriod}`
  );
}

/** Product семейства среди активных продуктов (metadata.philosynth_plan). */
export async function findProductForFamily(family: string): Promise<StripeProduct | undefined> {
  const list = await stripe.listProducts({ active: true, limit: 100 });
  return list.data.find((p) => p.metadata?.[STRIPE_PRODUCT_META_KEY] === family);
}

/**
 * Product семейства: найден — имя и описание приводятся к spec открытой
 * редакции (POST /v1/products/:id; прежде найденный продукт пропускался
 * целиком, и русское описание 8.3 оставалось в Stripe навсегда — 14.1,
 * Д-61); нет — создаётся с metadata.philosynth_plan = family.
 */
export async function ensureProductForFamily(
  family: string,
  spec: PlanSpec,
): Promise<{ product: StripeProduct; updated: boolean; created: boolean }> {
  const found = await findProductForFamily(family);
  const name = stripeProductNameFor(spec);
  const description = stripeProductDescriptionFor(spec);
  if (found) {
    if (found.description === description && found.name === name) return { product: found, updated: false, created: false };
    return { product: await stripe.updateProduct(found.id, { name, description }), updated: true, created: false };
  }
  const product = await stripe.createProduct({
    name,
    description,
    metadata: { [STRIPE_PRODUCT_META_KEY]: family },
  });
  return { product, updated: false, created: true };
}

/** Новый Price редакции под продуктом семейства; lookup_key — по name
 *  редакции (transfer переносит ключ с прежней цены того же name — сид 8.3
 *  с --transfer). */
export function createPriceForPlan(
  productId: string,
  spec: PlanSpec,
  opts: { transfer?: boolean; family?: string } = {},
): Promise<StripePrice> {
  return stripe.createPrice({
    productId,
    unitAmountCents: priceCents(spec),
    currency: "usd",
    interval: stripeIntervalFor(spec.billingPeriod),
    lookupKey: stripeLookupKeyFor(spec.name),
    ...(opts.transfer ? { transferLookupKey: true } : {}),
    nickname: spec.displayName,
    metadata: { [STRIPE_PRODUCT_META_KEY]: opts.family ?? spec.name },
  });
}

/** Выключить прежний Price (оформленные подписки не трогает). Уже
 *  выключенный — не трогается; отказ Stripe пробрасывается. */
export async function retirePrice(priceId: string): Promise<boolean> {
  const price = await stripe.retrievePrice(priceId);
  if (!price.active) return false;
  await stripe.updatePrice(priceId, { active: false });
  return true;
}
