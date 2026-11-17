/**
 * Как подписывать стоимость операции этому пользователю (2026-11-17).
 *
 * GET /billing/view отдаёт режим, в котором пойдёт следующая операция
 * (тем же приоритетом, что сервер: BYO-ключ → подписка → баланс), веса
 * операций в кредитах и наценку баланса. Подпись по режиму:
 *  - byo          — себестоимость по ставкам оценщика, USD (счёт у Anthropic);
 *  - balance      — себестоимость × наценка, USD (столько спишется с баланса);
 *  - subscription — кредиты и остаток; не хватает — с баланса (× наценка),
 *                   нет и баланса — «кредитов не хватает»;
 *  - none / ещё не загружено — себестоимость, USD (прежний вид).
 *
 * Ответ кешируется на уровне модуля и делится между всеми подписями экрана;
 * invalidateBillingView() — после операции, сменившей остаток.
 */
import type { BillingView, CreditOp } from "@philosynth/shared/types/billing";
import { useEffect, useState } from "react";

import { apiGet } from "../api/client";
import { tl } from "@philosynth/shared/i18n/t";

let cached: BillingView | null = null;
let inflight: Promise<BillingView | null> | null = null;
const listeners = new Set<(v: BillingView | null) => void>();

function load(): Promise<BillingView | null> {
  if (!inflight) {
    inflight = apiGet<BillingView>("/billing/view")
      .then((v) => {
        cached = v;
        for (const l of listeners) l(v);
        return v;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Сбросить кеш и перечитать (после операции, сменившей остаток или баланс). */
export function invalidateBillingView(): void {
  cached = null;
  void load();
}

export function useBillingView(): BillingView | null {
  const [view, setView] = useState<BillingView | null>(cached);
  useEffect(() => {
    listeners.add(setView);
    if (!cached) void load();
    else setView(cached);
    return () => {
      listeners.delete(setView);
    };
  }, []);
  return view;
}

/** Себестоимость → кредиты: зеркало серверного creditsForCost (plan-economics). */
export function creditsForCost(view: Pick<BillingView, "creditUsd">, costUsd: number): number {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return 1;
  return Math.max(1, Math.ceil(costUsd / view.creditUsd - 1e-9));
}

/** Порт _fmtCost [24666]: доллары для подписи. */
export function fmtUsd(cost: number): string {
  if (cost === 0) return "$0";
  if (cost < 0.01) return "≈ " + (cost * 100).toFixed(2) + "¢";
  return "≈ $" + cost.toFixed(3);
}

export function fmtCredits(n: number): string {
  return tl("billing.cost.credits", "{n, plural, one {# кредит} few {# кредита} many {# кредитов} other {# кредита}}", { n });
}

export interface ChargeInput {
  /** Себестоимость по оценке, USD */
  usd?: number | null | undefined;
  /** Кредиты: явно (сумма шагов плана, оценка синтеза) … */
  credits?: number | null | undefined;
  /** … либо вес операции фиксированного вида */
  op?: CreditOp | undefined;
  /** Доработка после сбоя: подписке и балансу не списывается */
  waived?: boolean | undefined;
}

export interface ChargeText {
  /** Главная часть подписи: «≈ $0.318», «26 кредитов», «без списания» */
  text: string;
  /** Пояснение мелким: «останется 754 из 780», «с баланса: кредитов не хватает» */
  note: string | null;
  /** Операция будет отклонена (нет источника оплаты) */
  blocked: boolean;
}

/**
 * Подпись стоимости. Без usd и без кредитов — null (подписывать нечего).
 * waived — после сбоя службы/API доработка у подписки и баланса бесплатна;
 * BYO-ключ платит Anthropic сам, ему показывается себестоимость.
 */
export function chargeText(view: BillingView | null, input: ChargeInput): ChargeText | null {
  const usd = input.usd ?? null;
  if (!view) return usd === null ? null : { text: fmtUsd(usd), note: null, blocked: false };
  const credits =
    input.credits ?? (input.op ? view.weights[input.op] : usd !== null ? creditsForCost(view, usd) : null);
  switch (view.mode) {
    case "byo":
      return usd === null ? null : { text: fmtUsd(usd), note: tl("billing.cost.byoNote", "по вашему ключу"), blocked: false };
    case "balance":
      if (input.waived) return { text: tl("billing.cost.waived", "без списания"), note: null, blocked: false };
      return usd === null ? null : { text: fmtUsd(usd * view.markup), note: tl("billing.cost.balanceNote", "с баланса"), blocked: false };
    case "subscription": {
      if (input.waived) return { text: tl("billing.cost.waived", "без списания"), note: null, blocked: false };
      if (credits === null) return null;
      const left = view.creditsLeft ?? 0;
      if (credits <= left) {
        return {
          text: fmtCredits(credits),
          note: tl("billing.cost.leftAfter", "останется {left} из {quota}", { left: left - credits, quota: view.creditsQuota ?? 0 }),
          blocked: false,
        };
      }
      if (view.balanceFallback && usd !== null) {
        return {
          text: fmtUsd(usd * view.markup),
          note: tl("billing.cost.fallbackNote", "с баланса: кредитов не хватает ({credits}, осталось {left})", { credits, left }),
          blocked: false,
        };
      }
      return {
        text: fmtCredits(credits),
        note: tl("billing.cost.notEnough", "не хватает: осталось {left}", { left }),
        blocked: true,
      };
    }
    default:
      return usd === null ? null : { text: fmtUsd(usd), note: tl("billing.cost.noSource", "нет источника оплаты"), blocked: true };
  }
}

/** Подпись одной строкой: «26 кредитов · останется 754 из 780». */
export function chargeLine(view: BillingView | null, input: ChargeInput): string {
  const c = chargeText(view, input);
  if (!c) return "";
  return c.note ? `${c.text} · ${c.note}` : c.text;
}
