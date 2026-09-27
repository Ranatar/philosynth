/**
 * Таблица тарифов. Беседа 8.7 (п. 1c): разметка вынесена из секции
 * «Подписка» BillingPage (6.2) — одна таблица на два экрана, чтобы
 * стартовая страница не изобретала вторую. GET /billing/plans с 8.6 —
 * гостевой путь: цена службы видна до регистрации.
 *
 * Данные грузит хозяин (getPlans): null — «Загрузка…», [] — «тарифов нет»
 * (посев без STRIPE_PRICE_* или пустая таблица — 03 §2.10, НЕ ошибка).
 * Столбец действия — слот renderAction(plan): BillingPage ставит «Оформить»,
 * LandingPage — ничего (столбца нет вовсе, а не пустая ячейка).
 * Оформление — .data-table кита (блок 3, часть 3 globals.css с 6.2).
 */
import type { SubscriptionPlan } from "@philosynth/shared/types/billing";

import { fmtInt, fmtMoney } from "../../utils/format";
import { tl } from "@philosynth/shared/i18n/t";

export function periodWord(p: SubscriptionPlan["billingPeriod"]): string {
  return p === "year" ? tl("billing.plansTable.year", "год") : tl("billing.plansTable.month", "месяц");
}

export interface PlansTableProps {
  /** null — ещё грузятся */
  plans: SubscriptionPlan[] | null;
  /** Столбец действия по тарифу (BillingPage: «Оформить»); нет — столбца нет */
  renderAction?: ((plan: SubscriptionPlan) => React.ReactNode) | undefined;
  /** data-testid обёртки таблицы */
  testId?: string | undefined;
}

export function PlansTable({ plans, renderAction, testId }: PlansTableProps) {
  if (plans === null) {
    return <div className="pool-status">{tl("billing.plansTable.loadingPlans", "Загрузка тарифов…")}</div>;
  }
  if (plans.length === 0) {
    return (
      <div className="data-table-empty" data-testid={testId ? `${testId}-empty` : undefined}>
        {tl("billing.plansTable.noPlans", "тарифов нет")}
      </div>
    );
  }
  return (
    <div className="data-table-wrap" style={{ overflowX: "auto" }} data-testid={testId}>
      <table className="data-table">
        <thead>
          <tr>
            <th>{tl("billing.plansTable.plan", "Тариф")}</th>
            <th className="num">{tl("billing.plansTable.price", "Цена")}</th>
            <th className="num">{tl("billing.plansTable.syntheses", "Синтезы")}</th>
            <th className="num">{tl("billing.plansTable.regenerations", "Перегенерации")}</th>
            <th className="num">{tl("billing.plansTable.modes", "Режимы")}</th>
            <th className="num">{tl("billing.plansTable.enrichments", "Обогащения")}</th>
            {renderAction && <th />}
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id} data-testid={testId ? `${testId}-row-${p.name}` : undefined}>
              <td>{p.displayName}</td>
              <td className="num">
                {fmtMoney(p.priceUsd)} / {periodWord(p.billingPeriod)}
              </td>
              <td className="num">{fmtInt(p.quotaSyntheses)}</td>
              <td className="num">{fmtInt(p.quotaRegenerations)}</td>
              <td className="num">{fmtInt(p.quotaModes)}</td>
              <td className="num">{fmtInt(p.quotaEnrichments)}</td>
              {renderAction && <td>{renderAction(p)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
