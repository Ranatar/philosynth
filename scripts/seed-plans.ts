/**
 * scripts/seed-plans.ts — ЧЕТВЁРТЫЙ сид: тарифы subscription_plans из
 * server/config/plans.ts (беседа 8.3, запрос 1, п. 2; 02-data-model §2.22,
 * 03-specification §2.10). До него таблица не сеялась ничем — раздел
 * «Подписка» BillingPage был пуст на любой свежей базе.
 *
 * Откуда что берётся:
 *   - displayName / priceUsd / billingPeriod / квоты — из PLANS (код);
 *   - stripe_price_id — ТОЛЬКО из окружения: STRIPE_PRICE_<NAME_UPPER>
 *     (STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO, STRIPE_PRICE_ACADEMIC —
 *     priceEnvVarFor). Price существует лишь в аккаунте Stripe владельца;
 *     заводит его scripts/stripe-create-prices.ts и печатает эти строки.
 *
 * Переменной нет → план заводится/остаётся с is_active=false и ГРОМКИМ
 * предупреждением в выводе (п. 2b): молча неактивный план неотличим от
 * «скрипт не запускали». Уже сохранённый stripe_price_id при этом НЕ
 * затирается (колонка NOT NULL; знание не уничтожается забывчивостью
 * одного запуска) — но плана в GET /billing/plans не будет, пока
 * переменная не вернётся.
 *
 * Идемпотентность (образцы seed-taxonomy / bootstrap-admin — created /
 * updated / skip / fail; повторный прогон — skip). Ключ — name (UNIQUE):
 *   - строки нет                                   → created;
 *   - расходятся displayName/цена/период/квоты/активность/price → updated;
 *   - всё совпадает                                → skip;
 *   - stripe_price_id меняется у плана с ДЕЙСТВУЮЩИМИ подписками (статус
 *     любой, кроме canceled — incomplete тоже ждёт оплаты по прежнему
 *     Price)                                       → fail с объяснением:
 *     сменить Price у живой подписки нельзя, FK user_subscriptions →
 *     subscription_plans (09 §3, 6.1) держит план на месте; заводите
 *     новый план либо дождитесь окончания подписок;
 *   - квоты дороже цены при текущем BILLING_MARKUP (assertPlanEconomics,
 *     plans.ts) → fail, строка не пишется и не правится.
 *
 * Каждая created/updated — строка admin_audit plan.seeded (actor_id NULL:
 * действие скрипта; детали — outcome и изменённые поля) той же
 * транзакцией (8.1: журнал и дело неразделимы); skip строки не даёт.
 *
 * Запуск: STRIPE_PRICE_STARTER=price_… … npm run seed:plans
 *   (или: npx tsx scripts/seed-plans.ts). Код возврата: 1 при любом fail.
 * Переменные читаются из process.env в момент запуска (не через env.ts —
 * 09 §5 6.1: тот читается один раз при импорте), наценка — env.stripe.billingMarkup.
 */
import { and, eq, ne } from "drizzle-orm";

import {
  PLANS,
  PlanEconomicsError,
  assertPlanEconomics,
  priceEnvVarFor,
  validatePlanDefinition,
  type PlanDefinition,
} from "../server/config/plans.js";
import { closeDb, db, schema } from "../server/db/index.js";
import { env } from "../server/env.js";
import { ADMIN_ACTIONS, writeAudit } from "../server/services/admin-audit.js";

const { subscriptionPlans, userSubscriptions } = schema;

export type SeedOutcome = "created" | "updated" | "skip" | "fail";

export interface PlanSeedResult {
  name: string;
  outcome: SeedOutcome;
  /** Поля, которые изменились (updated) */
  changed?: string[];
  /** Причина fail */
  error?: string;
  /** Переменная STRIPE_PRICE_* не задана → план неактивен */
  priceMissing: boolean;
  isActive: boolean;
  stripePriceId: string;
}

export interface SeedPlansReport {
  results: PlanSeedResult[];
  /** Планы без переменной окружения — для громкого предупреждения */
  missingPriceVars: { name: string; envVar: string }[];
  counts: Record<SeedOutcome, number>;
  markup: number;
}

export interface SeedPlansOptions {
  /** Источник STRIPE_PRICE_* (по умолчанию process.env) */
  envSource?: NodeJS.ProcessEnv;
  /** Наценка для проверки экономики (по умолчанию env.stripe.billingMarkup) */
  markup?: number;
  /** Описание тарифов (по умолчанию PLANS; тестам — подмена) */
  plans?: readonly PlanDefinition[];
}

type PlanRow = typeof subscriptionPlans.$inferSelect;

/** Цена в форме колонки NUMERIC(10,2) */
function priceString(usd: number): string {
  return usd.toFixed(2);
}

/** Расхождения строки с описанием (имена полей DTO). */
function diffFields(
  row: PlanRow,
  plan: PlanDefinition,
  stripePriceId: string,
  isActive: boolean,
): string[] {
  const changed: string[] = [];
  if (row.displayName !== plan.displayName) changed.push("displayName");
  if (Number(row.priceUsd) !== plan.priceUsd) changed.push("priceUsd");
  if (row.billingPeriod !== plan.billingPeriod) changed.push("billingPeriod");
  if (row.quotaSyntheses !== plan.quotaSyntheses) changed.push("quotaSyntheses");
  if (row.quotaRegenerations !== plan.quotaRegenerations) changed.push("quotaRegenerations");
  if (row.quotaModes !== plan.quotaModes) changed.push("quotaModes");
  if (row.quotaEnrichments !== plan.quotaEnrichments) changed.push("quotaEnrichments");
  if (row.stripePriceId !== stripePriceId) changed.push("stripePriceId");
  if (row.isActive !== isActive) changed.push("isActive");
  return changed;
}

/** Число подписок плана, кроме canceled — те, что держат Price. */
async function countLiveSubscriptions(planId: string): Promise<number> {
  const rows = await db
    .select({ id: userSubscriptions.id })
    .from(userSubscriptions)
    .where(and(eq(userSubscriptions.planId, planId), ne(userSubscriptions.status, "canceled")));
  return rows.length;
}

async function seedOne(
  plan: PlanDefinition,
  envSource: NodeJS.ProcessEnv,
  markup: number,
): Promise<PlanSeedResult> {
  const envVar = priceEnvVarFor(plan.name);
  const priceFromEnv = (envSource[envVar] ?? "").trim();
  const priceMissing = priceFromEnv === "";

  const base = { name: plan.name, priceMissing };

  const structural = validatePlanDefinition(plan);
  if (structural.length) {
    return { ...base, outcome: "fail", error: `описание невалидно: ${structural.join("; ")}`, isActive: false, stripePriceId: "" };
  }
  try {
    assertPlanEconomics(plan, markup);
  } catch (err) {
    if (err instanceof PlanEconomicsError) {
      return { ...base, outcome: "fail", error: err.message, isActive: false, stripePriceId: "" };
    }
    throw err;
  }

  const [existing] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.name, plan.name))
    .limit(1);

  // Без переменной сохранённый Price остаётся, активность снимается.
  const stripePriceId = priceMissing ? existing?.stripePriceId ?? "" : priceFromEnv;
  const isActive = !priceMissing;

  const values = {
    displayName: plan.displayName,
    priceUsd: priceString(plan.priceUsd),
    billingPeriod: plan.billingPeriod,
    quotaSyntheses: plan.quotaSyntheses,
    quotaRegenerations: plan.quotaRegenerations,
    quotaModes: plan.quotaModes,
    quotaEnrichments: plan.quotaEnrichments,
    stripePriceId,
    isActive,
  };

  if (!existing) {
    await db.transaction(async (tx) => {
      await tx.insert(subscriptionPlans).values({ name: plan.name, ...values });
      await writeAudit(tx, {
        actorId: null,
        action: ADMIN_ACTIONS.PLAN_SEEDED,
        targetType: "subscription_plan",
        targetId: plan.name,
        details: { outcome: "created", isActive, priceMissing },
      });
    });
    return { ...base, outcome: "created", isActive, stripePriceId };
  }

  const changed = diffFields(existing, plan, stripePriceId, isActive);
  if (changed.length === 0) {
    return { ...base, outcome: "skip", isActive, stripePriceId };
  }

  // Заслон: Price у плана с действующими подписками не меняется.
  if (changed.includes("stripePriceId") && existing.stripePriceId !== "") {
    const live = await countLiveSubscriptions(existing.id);
    if (live > 0) {
      return {
        ...base,
        outcome: "fail",
        isActive: existing.isActive,
        stripePriceId: existing.stripePriceId,
        error:
          `stripe_price_id плана «${plan.name}» уже ${existing.stripePriceId}, а ${envVar}=${stripePriceId}; ` +
          `на плане ${live} действующих подписок (статус ≠ canceled) — сменить Price у живой подписки нельзя ` +
          `(Stripe тарифицирует по Price подписки, FK user_subscriptions → subscription_plans держит план). ` +
          `Дождитесь окончания подписок либо заведите новый тариф с другим name; строка не тронута.`,
      };
    }
  }

  await db.transaction(async (tx) => {
    await tx.update(subscriptionPlans).set(values).where(eq(subscriptionPlans.id, existing.id));
    await writeAudit(tx, {
      actorId: null,
      action: ADMIN_ACTIONS.PLAN_SEEDED,
      targetType: "subscription_plan",
      targetId: plan.name,
      details: { outcome: "updated", changed, isActive, priceMissing },
    });
  });
  return { ...base, outcome: "updated", changed, isActive, stripePriceId };
}

/**
 * Посев целиком — экспортирован отдельно от main(), чтобы тесты звали его
 * без порождения процесса (образец bootstrapAdmin 8.1).
 */
export async function seedPlans(opts: SeedPlansOptions = {}): Promise<SeedPlansReport> {
  const envSource = opts.envSource ?? process.env;
  const markup = opts.markup ?? env.stripe.billingMarkup;
  const plans = opts.plans ?? PLANS;

  const results: PlanSeedResult[] = [];
  for (const plan of plans) {
    try {
      results.push(await seedOne(plan, envSource, markup));
    } catch (err) {
      const e = err as { message?: string; cause?: { code?: string; message?: string } };
      results.push({
        name: plan.name,
        outcome: "fail",
        error: e.cause?.message ?? e.message ?? String(err),
        priceMissing: (envSource[priceEnvVarFor(plan.name)] ?? "").trim() === "",
        isActive: false,
        stripePriceId: "",
      });
    }
  }
  const counts: Record<SeedOutcome, number> = { created: 0, updated: 0, skip: 0, fail: 0 };
  for (const r of results) counts[r.outcome] += 1;
  const missingPriceVars = results
    .filter((r) => r.priceMissing)
    .map((r) => ({ name: r.name, envVar: priceEnvVarFor(r.name) }));
  return { results, missingPriceVars, counts, markup };
}

const BOLD = "\x1b[1m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

export function printReport(report: SeedPlansReport): void {
  const c = report.counts;
  console.log(
    `subscription_plans: created=${c.created}, updated=${c.updated}, skip=${c.skip}, fail=${c.fail}` +
      ` (BILLING_MARKUP=${report.markup})`,
  );
  for (const r of report.results) {
    const active = r.isActive ? "active" : "INACTIVE";
    const price = r.stripePriceId || "—";
    switch (r.outcome) {
      case "created":
      case "skip":
        console.log(`  ${r.outcome.padEnd(7)} ${r.name}: ${active}, stripe_price_id=${price}`);
        break;
      case "updated":
        console.log(`  updated ${r.name}: ${active}, stripe_price_id=${price}; изменены: ${(r.changed ?? []).join(", ")}`);
        break;
      case "fail":
        console.error(`  ${RED}FAIL${RESET}    ${r.name}: ${r.error}`);
        break;
    }
  }
  if (report.missingPriceVars.length) {
    console.warn("");
    console.warn(
      `${BOLD}${YELLOW}ВНИМАНИЕ: ${report.missingPriceVars.length} из ${report.results.length} тарифов заведены НЕАКТИВНЫМИ — ` +
        `нет Stripe Price ID в окружении.${RESET}`,
    );
    for (const m of report.missingPriceVars) {
      console.warn(`${YELLOW}  ${m.envVar} не задана → план «${m.name}» is_active=false, в GET /billing/plans не попадёт${RESET}`);
    }
    console.warn(
      `${YELLOW}  Заведите Prices ключом владельца: npm run stripe:create-prices — скрипт напечатает строки ` +
        `STRIPE_PRICE_* для .env; затем повторите npm run seed:plans. Пока этого нет, раздел «Подписка» показывает «тарифов нет» — это НЕ означает, что посев не запускался.${RESET}`,
    );
  }
}

async function main(): Promise<void> {
  console.log(`Посев тарифов: ${PLANS.length} планов из server/config/plans.ts…`);
  const report = await seedPlans();
  printReport(report);
  const total = await db.$count(subscriptionPlans);
  console.log(`\nВ БД: subscription_plans=${total} (из них по описанию: ${PLANS.length})`);
  if (report.counts.fail > 0) process.exitCode = 1;
}

// Импорт из тестов не должен запускать main (образец bootstrap-admin)
const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/seed-plans.ts");
if (isDirectRun) {
  main()
    .catch((err) => {
      console.error("seed-plans: фатальная ошибка:", err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
