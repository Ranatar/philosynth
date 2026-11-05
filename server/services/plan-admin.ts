/**
 * Plan Admin Service — тарифы админкой и редакциями (беседа 15.4, Д-74;
 * решение владельца 2026-10-14 «источник истины — БД»; 02 §2.22, 03 §2.10).
 *
 *  - listPlansForAdmin(): все редакции (и закрытые) с числом ЖИВЫХ подписок
 *    (status ≠ canceled — заслон 8.3 По факту: incomplete/past_due тоже
 *    держат план);
 *  - updatePlan(id, input, actor): правка НА МЕСТЕ. Название и «открыт для
 *    покупки» (is_active) — всегда; цена, период, квоты — только без живых
 *    подписок (иначе 409 PLAN_HAS_SUBSCRIPTIONS с details.lockedFields —
 *    клиент запирает эти поля с подсказкой). Новая цена/период → новый
 *    Price через stripe-client (lookup_key редакции переносится), прежний
 *    выключается; is_active=true требует непустого stripe_price_id;
 *  - createPlanEdition(id, input, actor): «новая редакция» — новая строка
 *    (edition = max+1 в семействе, name = `<family>-v<edition>`), новый
 *    Price с lookup_key редакции, прежняя редакция is_active=false. Квоты
 *    и plan_id действующих подписчиков НЕ меняются (они дорабатывают на
 *    своей редакции; prior Price в Stripe не выключается — по нему
 *    продлеваются); Product — один на семейство;
 *  - createPlanFamily(input, actor): новое семейство (редакция 1) — Product
 *    + Price; для сида plans.ts это не нужно, для админки — да.
 *
 * Экономика (квоты не дороже цены при BILLING_MARKUP) и структура —
 * ОДНОЙ функцией с сидом: config/plan-economics.ts (assertPlanEconomics,
 * validatePlanSpec). След — admin_audit той же транзакцией, что и строка
 * (8.1): plan.created / plan.updated / plan.edition.
 *
 * Порядок с внешней системой (Stripe не откатывается транзакцией): сначала
 * Price в Stripe, затем транзакция БД под FOR UPDATE строки с повторной
 * проверкой живых подписок; если транзакция отказала — созданный Price
 * выключается (best effort). Прежний Price выключается ПОСЛЕ успешной
 * транзакции; отказ там — предупреждение в журнал, retiredPriceId: null.
 */
import { and, eq, ne, sql as dsql } from "drizzle-orm";

import type {
  AdminPlanResult,
  AdminPlanRow,
  PlanCreateInput,
  PlanEditionInput,
  PlanUpdateInput,
} from "@philosynth/shared/types/billing";
import { tl } from "@philosynth/shared/i18n/t";

import {
  assertPlanEconomics,
  PLAN_QUOTA_FIELDS,
  PlanEconomicsError,
  type PlanSpec,
  validatePlanSpec,
} from "../config/plan-economics.js";
import { db, schema } from "../db/index.js";
import { env } from "../env.js";
import { ADMIN_ACTIONS, writeAudit } from "./admin-audit.js";
import { createPriceForPlan, ensureProductForFamily, retirePrice } from "./plan-stripe.js";
import { toPlanDto } from "./subscription-service.js";

const { subscriptionPlans, userSubscriptions } = schema;

type PlanRow = typeof subscriptionPlans.$inferSelect;
type Exec = Parameters<typeof writeAudit>[0];

export interface PlanActor {
  id: string;
  ip?: string | null;
}

export class PlanAdminError extends Error {
  code: "NOT_FOUND" | "VALIDATION_ERROR" | "PLAN_HAS_SUBSCRIPTIONS";
  details?: unknown;
  constructor(code: PlanAdminError["code"], message: string, details?: unknown) {
    super(message);
    this.name = "PlanAdminError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function planAdminErrorStatus(code: PlanAdminError["code"]): 400 | 404 | 409 {
  return code === "NOT_FOUND" ? 404 : code === "PLAN_HAS_SUBSCRIPTIONS" ? 409 : 400;
}

/** Поля, запертые при живых подписках (цена, период, квоты). */
export const PLAN_LOCKED_FIELDS = ["priceUsd", "billingPeriod", ...PLAN_QUOTA_FIELDS] as const;
export type PlanLockedField = (typeof PLAN_LOCKED_FIELDS)[number];

/* ── Чтение ──────────────────────────────────────────────────────────── */

/** Живые подписки плана: status ≠ canceled (8.3 По факту, заслон). */
export async function countLiveSubscriptions(exec: Exec, planId: string): Promise<number> {
  const [r] = await exec
    .select({ n: dsql<number>`count(*)::int` })
    .from(userSubscriptions)
    .where(and(eq(userSubscriptions.planId, planId), ne(userSubscriptions.status, "canceled")));
  return Number(r?.n ?? 0);
}

export async function listPlansForAdmin(): Promise<AdminPlanRow[]> {
  const rows = await db
    .select({
      plan: subscriptionPlans,
      live: dsql<number>`count(${userSubscriptions.id})::int`,
    })
    .from(subscriptionPlans)
    .leftJoin(
      userSubscriptions,
      and(eq(userSubscriptions.planId, subscriptionPlans.id), ne(userSubscriptions.status, "canceled")),
    )
    .groupBy(subscriptionPlans.id)
    .orderBy(subscriptionPlans.family, subscriptionPlans.edition);
  return rows.map((r) => ({ ...toPlanDto(r.plan), liveSubscriptions: Number(r.live ?? 0) }));
}

async function loadPlan(id: string): Promise<PlanRow> {
  const [row] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).limit(1);
  if (!row) throw new PlanAdminError("NOT_FOUND", tl("server.services.planAdmin.notFound", "Тариф не найден"));
  return row;
}

/* ── Проверки ─────────────────────────────────────────────────────────── */

function specOf(row: PlanRow): PlanSpec {
  return {
    name: row.name,
    displayName: row.displayName,
    priceUsd: Number(row.priceUsd),
    billingPeriod: row.billingPeriod,
    quotaSyntheses: row.quotaSyntheses,
    quotaRegenerations: row.quotaRegenerations,
    quotaModes: row.quotaModes,
    quotaEnrichments: row.quotaEnrichments,
  };
}

/** Структура + экономика одной функцией с сидом; нарушения → 400. */
export function assertPlanSpec(spec: PlanSpec): void {
  const issues = validatePlanSpec(spec);
  if (issues.length) {
    throw new PlanAdminError(
      "VALIDATION_ERROR",
      tl("server.services.planAdmin.invalidSpec", "Описание тарифа невалидно"),
      Object.fromEntries(issues.map((i) => [i.field, i.text])),
    );
  }
  try {
    assertPlanEconomics(spec, env.stripe.billingMarkup);
  } catch (err) {
    if (err instanceof PlanEconomicsError) {
      throw new PlanAdminError(
        "VALIDATION_ERROR",
        tl("server.services.planAdmin.economics", "Квоты дороже цены при текущей наценке: уменьшите квоты или поднимите цену"),
        { economics: err.message, markup: err.markup },
      );
    }
    throw err;
  }
}

function priceString(usd: number): string {
  return usd.toFixed(2);
}

function hasOwn(o: object, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

/** Какие запертые поля input меняет относительно строки. */
export function changedLockedFields(row: PlanRow, input: PlanUpdateInput): PlanLockedField[] {
  const cur = specOf(row);
  const out: PlanLockedField[] = [];
  for (const f of PLAN_LOCKED_FIELDS) {
    if (!hasOwn(input, f) || input[f] === undefined) continue;
    if (input[f] !== cur[f]) out.push(f);
  }
  return out;
}

async function retireQuietly(priceId: string, why: string): Promise<string | null> {
  try {
    await retirePrice(priceId);
    return priceId;
  } catch (err) {
    console.warn(`[plan-admin] Price ${priceId} не выключен (${why}): ${(err as Error).message}`);
    return null;
  }
}

/* ── Правка на месте ─────────────────────────────────────────────────── */

export async function updatePlan(id: string, input: PlanUpdateInput, actor: PlanActor): Promise<AdminPlanResult> {
  const row = await loadPlan(id);
  const locked = changedLockedFields(row, input);
  const liveBefore = await countLiveSubscriptions(db, id);
  if (locked.length && liveBefore > 0) {
    throw new PlanAdminError(
      "PLAN_HAS_SUBSCRIPTIONS",
      tl("server.services.planAdmin.hasSubscriptions", "У тарифа есть живые подписки: цена, период и квоты правятся новой редакцией"),
      { lockedFields: locked, liveSubscriptions: liveBefore },
    );
  }

  const next: PlanSpec = {
    ...specOf(row),
    ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
    ...(input.priceUsd !== undefined ? { priceUsd: input.priceUsd } : {}),
    ...(input.billingPeriod !== undefined ? { billingPeriod: input.billingPeriod } : {}),
    ...Object.fromEntries(PLAN_QUOTA_FIELDS.filter((k) => input[k] !== undefined).map((k) => [k, input[k]])),
  };
  assertPlanSpec(next);
  const isActive = input.isActive ?? row.isActive;

  // Цена/период изменились → новый Price (lookup_key редакции переносится)
  const priceChanged = locked.includes("priceUsd") || locked.includes("billingPeriod");
  let newPriceId: string | null = null;
  if (priceChanged) {
    const { product } = await ensureProductForFamily(row.family, next);
    const price = await createPriceForPlan(product.id, next, { transfer: row.stripePriceId !== "", family: row.family });
    newPriceId = price.id;
  }
  const stripePriceId = newPriceId ?? row.stripePriceId;
  if (isActive && !stripePriceId) {
    throw new PlanAdminError(
      "VALIDATION_ERROR",
      tl("server.services.planAdmin.activeNeedsPrice", "Открыть тариф для покупки нельзя: у него нет Stripe Price — задайте цену"),
      { isActive: tl("server.services.planAdmin.activeNeedsPriceField", "нет Stripe Price") },
    );
  }

  let updated: PlanRow;
  try {
    updated = await db.transaction(async (tx) => {
      const [cur] = await tx.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).for("update").limit(1);
      if (!cur) throw new PlanAdminError("NOT_FOUND", tl("server.services.planAdmin.notFound", "Тариф не найден"));
      if (locked.length) {
        const live = await countLiveSubscriptions(tx, id);
        if (live > 0) {
          throw new PlanAdminError(
            "PLAN_HAS_SUBSCRIPTIONS",
            tl("server.services.planAdmin.hasSubscriptions", "У тарифа есть живые подписки: цена, период и квоты правятся новой редакцией"),
            { lockedFields: locked, liveSubscriptions: live },
          );
        }
      }
      const [u] = await tx
        .update(subscriptionPlans)
        .set({
          displayName: next.displayName,
          priceUsd: priceString(next.priceUsd),
          billingPeriod: next.billingPeriod,
          quotaSyntheses: next.quotaSyntheses,
          quotaRegenerations: next.quotaRegenerations,
          quotaModes: next.quotaModes,
          quotaEnrichments: next.quotaEnrichments,
          stripePriceId,
          isActive,
        })
        .where(eq(subscriptionPlans.id, id))
        .returning();
      await writeAudit(tx, {
        actorId: actor.id,
        action: ADMIN_ACTIONS.PLAN_UPDATED,
        targetType: "subscription_plan",
        targetId: cur.name,
        details: {
          planId: id,
          changed: diffSpec(specOf(cur), next, cur.isActive, isActive),
          ...(newPriceId ? { previousPriceId: cur.stripePriceId, stripePriceId: newPriceId } : {}),
        },
        ip: actor.ip ?? null,
      });
      return u!;
    });
  } catch (err) {
    if (newPriceId) await retireQuietly(newPriceId, "откат после отказа транзакции");
    throw err;
  }

  let retiredPriceId: string | null = null;
  if (newPriceId && row.stripePriceId && row.stripePriceId !== newPriceId) {
    retiredPriceId = await retireQuietly(row.stripePriceId, "прежний Price после смены цены");
  }
  return {
    plan: { ...toPlanDto(updated), liveSubscriptions: await countLiveSubscriptions(db, id) },
    ...(retiredPriceId ? { retiredPriceId } : {}),
  };
}

function diffSpec(a: PlanSpec, b: PlanSpec, activeA: boolean, activeB: boolean): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ["displayName", "priceUsd", "billingPeriod", ...PLAN_QUOTA_FIELDS] as const) {
    if (a[k] !== b[k]) out[k] = { from: a[k], to: b[k] };
  }
  if (activeA !== activeB) out.isActive = { from: activeA, to: activeB };
  return out;
}

/* ── Новая редакция ──────────────────────────────────────────────────── */

export function editionName(family: string, edition: number): string {
  return `${family}-v${edition}`;
}

export async function createPlanEdition(id: string, input: PlanEditionInput, actor: PlanActor): Promise<AdminPlanResult> {
  const prev = await loadPlan(id);
  const [mx] = await db
    .select({ m: dsql<number>`coalesce(max(${subscriptionPlans.edition}), 0)::int` })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.family, prev.family));
  const edition = Number(mx?.m ?? 0) + 1;
  const next: PlanSpec = {
    ...specOf(prev),
    name: editionName(prev.family, edition),
    ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
    ...(input.priceUsd !== undefined ? { priceUsd: input.priceUsd } : {}),
    ...(input.billingPeriod !== undefined ? { billingPeriod: input.billingPeriod } : {}),
    ...Object.fromEntries(PLAN_QUOTA_FIELDS.filter((k) => input[k] !== undefined).map((k) => [k, input[k]])),
  };
  assertPlanSpec(next);

  const { product } = await ensureProductForFamily(prev.family, next);
  const price = await createPriceForPlan(product.id, next, { family: prev.family });

  try {
    const created = await db.transaction(async (tx) => {
      const [cur] = await tx.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).for("update").limit(1);
      if (!cur) throw new PlanAdminError("NOT_FOUND", tl("server.services.planAdmin.notFound", "Тариф не найден"));
      const [ins] = await tx
        .insert(subscriptionPlans)
        .values({
          name: next.name,
          family: cur.family,
          edition,
          displayName: next.displayName,
          priceUsd: priceString(next.priceUsd),
          billingPeriod: next.billingPeriod,
          quotaSyntheses: next.quotaSyntheses,
          quotaRegenerations: next.quotaRegenerations,
          quotaModes: next.quotaModes,
          quotaEnrichments: next.quotaEnrichments,
          stripePriceId: price.id,
          isActive: true,
        })
        .returning();
      await tx.update(subscriptionPlans).set({ isActive: false }).where(eq(subscriptionPlans.id, id));
      await writeAudit(tx, {
        actorId: actor.id,
        action: ADMIN_ACTIONS.PLAN_EDITION,
        targetType: "subscription_plan",
        targetId: next.name,
        details: {
          planId: ins!.id,
          family: cur.family,
          edition,
          previousName: cur.name,
          previousPlanId: cur.id,
          stripePriceId: price.id,
          changed: diffSpec(specOf(cur), next, true, true),
        },
        ip: actor.ip ?? null,
      });
      return ins!;
    });
    const [previous] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).limit(1);
    return {
      plan: { ...toPlanDto(created), liveSubscriptions: 0 },
      ...(previous ? { previous: { ...toPlanDto(previous), liveSubscriptions: await countLiveSubscriptions(db, id) } } : {}),
    };
  } catch (err) {
    await retireQuietly(price.id, "откат после отказа транзакции");
    throw err;
  }
}

/* ── Новое семейство ─────────────────────────────────────────────────── */

export async function createPlanFamily(input: PlanCreateInput, actor: PlanActor): Promise<AdminPlanResult> {
  const next: PlanSpec = {
    name: String(input.name ?? "").trim(),
    displayName: String(input.displayName ?? "").trim(),
    priceUsd: input.priceUsd,
    billingPeriod: input.billingPeriod,
    quotaSyntheses: input.quotaSyntheses,
    quotaRegenerations: input.quotaRegenerations,
    quotaModes: input.quotaModes,
    quotaEnrichments: input.quotaEnrichments,
  };
  assertPlanSpec(next);
  const [dup] = await db
    .select({ id: subscriptionPlans.id })
    .from(subscriptionPlans)
    .where(dsql`${subscriptionPlans.name} = ${next.name} or ${subscriptionPlans.family} = ${next.name}`)
    .limit(1);
  if (dup) {
    throw new PlanAdminError(
      "VALIDATION_ERROR",
      tl("server.services.planAdmin.nameTaken", "Тариф с таким именем уже есть"),
      { name: next.name },
    );
  }

  const { product } = await ensureProductForFamily(next.name, next);
  const price = await createPriceForPlan(product.id, next, { family: next.name });
  try {
    const created = await db.transaction(async (tx) => {
      const [ins] = await tx
        .insert(subscriptionPlans)
        .values({
          name: next.name,
          family: next.name,
          edition: 1,
          displayName: next.displayName,
          priceUsd: priceString(next.priceUsd),
          billingPeriod: next.billingPeriod,
          quotaSyntheses: next.quotaSyntheses,
          quotaRegenerations: next.quotaRegenerations,
          quotaModes: next.quotaModes,
          quotaEnrichments: next.quotaEnrichments,
          stripePriceId: price.id,
          isActive: input.isActive ?? true,
        })
        .returning();
      await writeAudit(tx, {
        actorId: actor.id,
        action: ADMIN_ACTIONS.PLAN_CREATED,
        targetType: "subscription_plan",
        targetId: next.name,
        details: { planId: ins!.id, stripePriceId: price.id, productId: product.id, spec: next },
        ip: actor.ip ?? null,
      });
      return ins!;
    });
    return { plan: { ...toPlanDto(created), liveSubscriptions: 0 } };
  } catch (err) {
    await retireQuietly(price.id, "откат после отказа транзакции");
    throw err;
  }
}
