/**
 * scripts/seed-plans.ts — ЧЕТВЁРТЫЙ сид: НАЧАЛЬНЫЙ посев тарифов
 * subscription_plans из server/config/plans.ts (беседа 8.3, запрос 1, п. 2;
 * 02-data-model §2.22, 03-specification §2.10).
 *
 * 15.4 (Д-74, Д-75 п.1; решение пользователя 2026-10-14 «источник истины —
 * БД»): сид СОЗДАЁТ отсутствующие планы и НЕ ПЕРЕПИСЫВАЕТ существующие.
 * До 15.4 расхождение строки с plans.ts давало `updated` — новые квоты
 * действовали для всех подписчиков посреди оплаченного периода, цена в БД
 * менялась, а Stripe списывал по прежнему Price (Д-75). Теперь строка,
 * которая уже есть, — skip при любом расхождении; расхождение печатается
 * ПРЕДУПРЕЖДЕНИЕМ (поле, в БД, в plans.ts) — править тариф после первого
 * посева надо админкой (вкладка «Тарифы»: правка на месте без живых
 * подписок, иначе новая редакция). Исхода `updated` у сида больше нет.
 *
 * Откуда что берётся у СОЗДАВАЕМОЙ строки:
 *   - family = name (редакция 1 семейства), edition = 1;
 *   - displayName / priceUsd / billingPeriod / квоты — из PLANS (код);
 *   - stripe_price_id — ТОЛЬКО из окружения: STRIPE_PRICE_<NAME_UPPER>
 *     (STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO, STRIPE_PRICE_ACADEMIC —
 *     priceEnvVarFor). Price существует лишь в аккаунте Stripe владельца;
 *     заводит его scripts/stripe-create-prices.ts и печатает эти строки.
 *
 * Переменной нет → план заводится с is_active=false (пустой
 * stripe_price_id) и ГРОМКИМ предупреждением в выводе (п. 2b): молча
 * неактивный план неотличим от «скрипт не запускали». Существующую строку
 * без переменной сид с 15.4 НЕ трогает (ни price, ни is_active) —
 * открывает/закрывает тариф админка.
 *
 * Идемпотентность (образцы seed-taxonomy / bootstrap-admin — created /
 * skip / fail; повторный прогон — skip). Ключ — name (UNIQUE):
 *   - строки нет                                   → created;
 *   - строка есть (совпадает или расходится)       → skip (+ предупреждение
 *     о расхождениях; «расходятся» считаются displayName/цена/период/квоты/
 *     stripe_price_id/активность);
 *   - описание невалидно / квоты дороже цены при текущем BILLING_MARKUP
 *     (общий модуль plan-economics) → fail, строка не пишется.
 *
 * Каждая created — строка admin_audit plan.seeded (actor_id NULL: действие
 * скрипта) той же транзакцией (8.1: журнал и дело неразделимы); skip и
 * fail строк не дают.
 *
 * Запуск: STRIPE_PRICE_STARTER=price_… … npm run seed:plans
 *   (или: npx tsx scripts/seed/seed-plans.ts). Код возврата: 1 при любом fail.
 * Переменные читаются из process.env в момент запуска (не через env.ts —
 * 09 §5 6.1: тот читается один раз при импорте), наценка — env.stripe.billingMarkup.
 */
import { eq } from "drizzle-orm";

import {
  PLANS,
  PlanEconomicsError,
  assertPlanEconomics,
  priceEnvVarFor,
  validatePlanDefinition,
  type PlanDefinition,
} from "../../server/config/plans.js";
import { closeDb, db, schema } from "../../server/db/index.js";
import { env } from "../../server/env.js";
import { ADMIN_ACTIONS, writeAudit } from "../../server/services/admin-audit.js";

const { subscriptionPlans } = schema;

export type SeedOutcome = "created" | "skip" | "fail";

/** Расхождение существующей строки с описанием посева (skip с предупреждением). */
export interface PlanDivergence {
  field: string;
  inDb: string;
  inCode: string;
}

export interface PlanSeedResult {
  name: string;
  outcome: SeedOutcome;
  /** skip: чем строка БД расходится с plans.ts (пусто — совпадает) */
  diverged?: PlanDivergence[];
  /** Причина fail */
  error?: string;
  /** Переменная STRIPE_PRICE_* не задана → созданный план неактивен */
  priceMissing: boolean;
  isActive: boolean;
  stripePriceId: string;
}

export interface SeedPlansReport {
  results: PlanSeedResult[];
  /** Планы, СОЗДАННЫЕ без переменной окружения — для громкого предупреждения */
  missingPriceVars: { name: string; envVar: string }[];
  counts: Record<SeedOutcome, number>;
  /** Число skip с расхождениями */
  divergedCount: number;
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

/** Расхождения строки с описанием (имена полей DTO) — только отчёт. */
export function diffFields(row: PlanRow, plan: PlanDefinition, priceFromEnv: string): PlanDivergence[] {
  const d: PlanDivergence[] = [];
  const cmp = (field: string, inDb: unknown, inCode: unknown) => {
    if (String(inDb) !== String(inCode)) d.push({ field, inDb: String(inDb), inCode: String(inCode) });
  };
  cmp("displayName", row.displayName, plan.displayName);
  cmp("priceUsd", Number(row.priceUsd), plan.priceUsd);
  cmp("billingPeriod", row.billingPeriod, plan.billingPeriod);
  cmp("quotaSyntheses", row.quotaSyntheses, plan.quotaSyntheses);
  cmp("quotaRegenerations", row.quotaRegenerations, plan.quotaRegenerations);
  cmp("quotaModes", row.quotaModes, plan.quotaModes);
  cmp("quotaEnrichments", row.quotaEnrichments, plan.quotaEnrichments);
  if (priceFromEnv !== "") cmp("stripePriceId", row.stripePriceId, priceFromEnv);
  cmp("isActive", row.isActive, priceFromEnv !== "");
  return d;
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

  if (existing) {
    // 15.4: существующее не переписывается — только отчёт о расхождениях
    return {
      ...base,
      outcome: "skip",
      diverged: diffFields(existing, plan, priceFromEnv),
      isActive: existing.isActive,
      stripePriceId: existing.stripePriceId,
    };
  }

  const stripePriceId = priceFromEnv;
  const isActive = !priceMissing;
  await db.transaction(async (tx) => {
    await tx.insert(subscriptionPlans).values({
      name: plan.name,
      family: plan.name,
      edition: 1,
      displayName: plan.displayName,
      priceUsd: priceString(plan.priceUsd),
      billingPeriod: plan.billingPeriod,
      quotaSyntheses: plan.quotaSyntheses,
      quotaRegenerations: plan.quotaRegenerations,
      quotaModes: plan.quotaModes,
      quotaEnrichments: plan.quotaEnrichments,
      stripePriceId,
      isActive,
    });
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
  const counts: Record<SeedOutcome, number> = { created: 0, skip: 0, fail: 0 };
  for (const r of results) counts[r.outcome] += 1;
  const missingPriceVars = results
    .filter((r) => r.outcome === "created" && r.priceMissing)
    .map((r) => ({ name: r.name, envVar: priceEnvVarFor(r.name) }));
  const divergedCount = results.filter((r) => r.outcome === "skip" && (r.diverged?.length ?? 0) > 0).length;
  return { results, missingPriceVars, counts, divergedCount, markup };
}

const BOLD = "\x1b[1m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

export function printReport(report: SeedPlansReport): void {
  const c = report.counts;
  console.log(
    `subscription_plans: created=${c.created}, skip=${c.skip}` +
      `${report.divergedCount ? ` (расходятся с plans.ts: ${report.divergedCount})` : ""}, fail=${c.fail}` +
      ` (BILLING_MARKUP=${report.markup})`,
  );
  for (const r of report.results) {
    const active = r.isActive ? "active" : "INACTIVE";
    const price = r.stripePriceId || "—";
    switch (r.outcome) {
      case "created":
        console.log(`  created ${r.name}: ${active}, stripe_price_id=${price}`);
        break;
      case "skip":
        console.log(`  skip    ${r.name}: ${active}, stripe_price_id=${price}${r.diverged?.length ? "; расходится с plans.ts — см. ниже" : ""}`);
        break;
      case "fail":
        console.error(`  ${RED}FAIL${RESET}    ${r.name}: ${r.error}`);
        break;
    }
  }
  const diverged = report.results.filter((r) => r.outcome === "skip" && r.diverged?.length);
  if (diverged.length) {
    console.warn("");
    console.warn(
      `${BOLD}${YELLOW}ПРЕДУПРЕЖДЕНИЕ: ${diverged.length} из ${report.results.length} тарифов в БД расходятся с server/config/plans.ts — ` +
        `строки НЕ переписаны: источник истины — БД (15.4).${RESET}`,
    );
    for (const r of diverged) {
      for (const d of r.diverged ?? []) {
        console.warn(`${YELLOW}  ${r.name}.${d.field}: в БД ${d.inDb}, в plans.ts ${d.inCode}${RESET}`);
      }
    }
    console.warn(
      `${YELLOW}  Тариф после первого посева правится админкой (вкладка «Тарифы»): название и «открыт для покупки» — на месте, ` +
        `цена/период/квоты — на месте без живых подписок, иначе новой редакцией. plans.ts — только начальный посев.${RESET}`,
    );
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
        `STRIPE_PRICE_* для .env; затем откройте тариф в админке («Тарифы» → цена Price, «открыт для покупки») либо удалите строку и повторите посев. ` +
        `Пока этого нет, раздел «Подписка» показывает «тарифов нет» — это НЕ означает, что посев не запускался.${RESET}`,
    );
  }
}

async function main(): Promise<void> {
  console.log(`Посев тарифов: ${PLANS.length} планов из server/config/plans.ts (создаются отсутствующие; существующие не переписываются)…`);
  const report = await seedPlans();
  printReport(report);
  const total = await db.$count(subscriptionPlans);
  console.log(`\nВ БД: subscription_plans=${total} (из них по описанию посева: ${PLANS.length})`);
  if (report.counts.fail > 0) process.exitCode = 1;
}

// Импорт из тестов не должен запускать main (образец bootstrap-admin)
const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("/seed-plans.ts");
if (isDirectRun) {
  main()
    .catch((err) => {
      console.error("seed-plans: фатальная ошибка:", err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
