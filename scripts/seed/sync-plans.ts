/**
 * sync-plans.ts — привести тарифы УЖЕ РАЗВЁРНУТОЙ службы к посеву
 * server/config/plans.ts (2026-11-25, вне бесед; пересмотр тарифной сетки).
 *
 * Зачем. seed:plans создаёт только отсутствующие планы и существующие не
 * переписывает (15.4, Д-75): на новой службе цены plans.ts ставятся сами, а
 * на развёрнутой остаются прежними. Этот скрипт — те же действия, что
 * админка (вкладка «Тарифы»), но по всем трём семействам одной командой и
 * теми же функциями services/plan-admin.ts:
 *   - у текущей редакции семейства цена/период/кредиты совпадают с
 *     plans.ts → skip;
 *   - живых подписок нет → правка НА МЕСТЕ (updatePlan): при смене цены —
 *     новый Price в Stripe (lookup_key переезжает), прежний выключается;
 *   - живые подписки есть → НОВАЯ РЕДАКЦИЯ (createPlanEdition): новая строка
 *     `<family>-vN` с новым Price, прежняя закрыта для покупки, её
 *     подписчики дорабатывают на своих условиях;
 *   - семейства нет → не трогается (его заводит seed:plans).
 * «Текущая редакция» — открытая для покупки с наибольшим номером; открытой
 * нет — наибольшая. Название и «открыт для покупки» скрипт не меняет.
 * Каждое действие — строка admin_audit (актор NULL: действие скрипта).
 *
 * По умолчанию — только показ, что будет сделано; применяет --apply.
 * Нужен STRIPE_SECRET_KEY: новые цены живут в Stripe. Без ключа скрипт
 * отказывается до первого действия.
 *
 * Запуск ИЗ КОРНЯ репозитория (DATABASE_URL, STRIPE_* — из окружения):
 *   npm run plans:sync              # что будет сделано
 *   npm run plans:sync -- --apply   # сделать
 * Код возврата 1 — если хоть одно семейство не приведено. Повторный прогон
 * после успешного — skip ×3. Модуль вне описи i18n: вывод консоли оператора.
 */
import { desc, eq } from "drizzle-orm";

import { CREDIT_USD } from "../../server/config/plan-economics.js";
import { PLANS, type PlanDefinition } from "../../server/config/plans.js";
import { closeDb, db, schema } from "../../server/db/index.js";
import { env } from "../../server/env.js";
import {
  PlanAdminError,
  countLiveSubscriptions,
  createPlanEdition,
  updatePlan,
} from "../../server/services/plan-admin.js";
import { isStripeConfigured } from "../../server/services/stripe-client.js";

type PlanRow = typeof schema.subscriptionPlans.$inferSelect;

export type SyncAction = "skip" | "update" | "edition" | "missing";

export interface SyncPlanResult {
  family: string;
  action: SyncAction;
  /** Текущая редакция до синхронизации */
  current?: { name: string; priceUsd: number; billingPeriod: string; quotaCredits: number; liveSubscriptions: number };
  target: { priceUsd: number; billingPeriod: string; quotaCredits: number };
  /** После --apply: имя строки, на которой теперь цены plans.ts */
  resultName?: string;
  error?: string;
}

/** Текущая редакция семейства: открытая с наибольшим номером, иначе наибольшая. */
function currentEdition(rows: PlanRow[]): PlanRow | undefined {
  return rows.find((r) => r.isActive) ?? rows[0];
}

function matches(row: PlanRow, plan: PlanDefinition): boolean {
  return Number(row.priceUsd) === plan.priceUsd && row.billingPeriod === plan.billingPeriod && row.quotaCredits === plan.quotaCredits;
}

export async function syncPlans(opts: { apply: boolean; plans?: readonly PlanDefinition[] }): Promise<SyncPlanResult[]> {
  const out: SyncPlanResult[] = [];
  for (const plan of opts.plans ?? PLANS) {
    const target = { priceUsd: plan.priceUsd, billingPeriod: plan.billingPeriod, quotaCredits: plan.quotaCredits };
    const rows = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.family, plan.name))
      .orderBy(desc(schema.subscriptionPlans.edition));
    const cur = currentEdition(rows);
    if (!cur) {
      out.push({ family: plan.name, action: "missing", target });
      continue;
    }
    const live = await countLiveSubscriptions(db, cur.id);
    const current = {
      name: cur.name,
      priceUsd: Number(cur.priceUsd),
      billingPeriod: cur.billingPeriod,
      quotaCredits: cur.quotaCredits,
      liveSubscriptions: live,
    };
    if (matches(cur, plan)) {
      out.push({ family: plan.name, action: "skip", current, target, resultName: cur.name });
      continue;
    }
    const action: SyncAction = live > 0 ? "edition" : "update";
    const r: SyncPlanResult = { family: plan.name, action, current, target };
    out.push(r);
    if (!opts.apply) continue;
    const input = { priceUsd: plan.priceUsd, billingPeriod: plan.billingPeriod, quotaCredits: plan.quotaCredits };
    try {
      try {
        const res = action === "update" ? await updatePlan(cur.id, input, { id: null }) : await createPlanEdition(cur.id, input, { id: null });
        r.resultName = res.plan.name;
      } catch (err) {
        // Подписка оформлена между подсчётом и правкой — тогда редакцией
        if (action === "update" && err instanceof PlanAdminError && err.code === "PLAN_HAS_SUBSCRIPTIONS") {
          r.action = "edition";
          r.resultName = (await createPlanEdition(cur.id, input, { id: null })).plan.name;
        } else throw err;
      }
    } catch (err) {
      const e = err as { message?: string; details?: unknown };
      r.error = (e.message ?? String(err)) + (e.details ? ` ${JSON.stringify(e.details)}` : "");
    }
  }
  return out;
}

const fmt = (p: { priceUsd: number; billingPeriod: string; quotaCredits: number }): string =>
  `$${p.priceUsd.toFixed(2)}/${p.billingPeriod}, ${p.quotaCredits} кредитов`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== "--apply");
  if (unknown.length) {
    console.error(`plans:sync: неизвестный довод ${unknown.join(" ")} (есть только --apply)`);
    process.exitCode = 2;
    return;
  }
  const apply = args.includes("--apply");
  if (!isStripeConfigured()) {
    console.error(
      "plans:sync: STRIPE_SECRET_KEY пуст — новые цены заводятся в Stripe, без ключа их не завести.\n" +
        "  Ни одного изменения не сделано.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Тарифы против server/config/plans.ts · Stripe ${env.stripe.apiBase}` +
      `${env.stripe.apiBase.includes("api.stripe.com") ? "" : " (НЕ api.stripe.com — мок/прокси)"}` +
      `${apply ? " · ПРИМЕНЯЮ" : " · только показ (применить: -- --apply)"}`,
  );
  const results = await syncPlans({ apply });
  let failed = 0;
  for (const r of results) {
    const eff = r.target.priceUsd / (r.target.quotaCredits * CREDIT_USD);
    switch (r.action) {
      case "missing":
        console.log(`  ${r.family}: в базе нет — заведёт npm run seed:plans`);
        break;
      case "skip":
        console.log(`  skip    ${r.family}: ${r.current!.name} уже ${fmt(r.target)}`);
        break;
      default: {
        const how =
          r.action === "update"
            ? "правка на месте (живых подписок нет)"
            : `новая редакция (живых подписок: ${r.current!.liveSubscriptions} — дорабатывают на прежних условиях)`;
        const head = `  ${r.action === "update" ? "update " : "edition"} ${r.family}: ${r.current!.name} ${fmt(r.current!)} → ${fmt(r.target)} (×${eff.toFixed(2)}) — ${how}`;
        if (r.error) {
          failed++;
          console.error(`${head}\n    FAIL: ${r.error}`);
        } else console.log(head + (r.resultName ? ` · теперь ${r.resultName}` : ""));
      }
    }
  }
  if (!apply && results.some((r) => r.action === "update" || r.action === "edition")) {
    console.log("\nНичего не изменено. Применить: npm run plans:sync -- --apply");
  }
  if (failed) process.exitCode = 1;
}

// Импорт из тестов не должен запускать main (образец seed-plans)
const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("/sync-plans.ts");
if (isDirectRun) {
  main()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
