/**
 * Таблица тарифов. Беседа 8.7 (п. 1c): разметка вынесена из секции
 * «Подписка» BillingPage (6.2) — одна таблица на два экрана, чтобы
 * стартовая страница не изобретала вторую. GET /billing/plans с 8.6 —
 * гостевой путь: цена службы видна до регистрации.
 *
 * 0021 (кредиты, решение пользователя 2026-11-17): тариф несёт одну квоту —
 * кредиты; столбцы раскладки показывают, на сколько операций каждого вида
 * их хватит, если тратить только на этот вид (floor(кредиты / вес)). Под
 * таблицей — веса операций (CreditWeightsTable): что сколько стоит.
 *
 * Данные грузит хозяин (getPlansWithCredits): null — «Загрузка…», [] —
 * «тарифов нет» (посев без STRIPE_PRICE_* или пустая таблица — 03 §2.10, НЕ
 * ошибка). Столбец действия — слот renderAction(plan): BillingPage ставит
 * «Оформить», LandingPage — ничего (столбца нет вовсе, а не пустая ячейка).
 * Оформление — .data-table кита (блок 3, часть 3 globals.css с 6.2).
 */
import type { CreditInfo, CreditOp, SubscriptionPlan } from "@philosynth/shared/types/billing";

import { fmtInt, fmtMoney } from "../../utils/format";
import { tl } from "@philosynth/shared/i18n/t";

export function periodWord(p: SubscriptionPlan["billingPeriod"]): string {
  return p === "year" ? tl("billing.plansTable.year", "год") : tl("billing.plansTable.month", "месяц");
}

/** Столбцы раскладки — по видам операций (порядок CREDIT_OPS). */
const BREAKDOWN_LABELS = (): Record<CreditOp, string> => ({
  synthesis: tl("billing.plansTable.syntheses", "Концепций"),
  section: tl("billing.plansTable.sections", "Разделов"),
  subsection: tl("billing.plansTable.subsections", "Подразделов"),
  mode: tl("billing.plansTable.modes", "Режимов"),
  enrichment: tl("billing.plansTable.enrichments", "Обогащений"),
});

const OPS: readonly CreditOp[] = ["synthesis", "section", "subsection", "mode", "enrichment"];

export interface PlansTableProps {
  /** null — ещё грузятся */
  plans: SubscriptionPlan[] | null;
  /** Веса операций (GET /billing/plans .credits); нет — без раскладки */
  credits?: CreditInfo | null | undefined;
  /** Столбец действия по тарифу (BillingPage: «Оформить»); нет — столбца нет */
  renderAction?: ((plan: SubscriptionPlan) => React.ReactNode) | undefined;
  /** data-testid обёртки таблицы */
  testId?: string | undefined;
}

export function PlansTable({ plans, credits, renderAction, testId }: PlansTableProps) {
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
  const labels = BREAKDOWN_LABELS();
  return (
    <>
      <div className="data-table-wrap" style={{ overflowX: "auto" }} data-testid={testId}>
        <table className="data-table">
          <thead>
            <tr>
              <th>{tl("billing.plansTable.plan", "Тариф")}</th>
              <th className="num">{tl("billing.plansTable.price", "Цена")}</th>
              <th className="num">{tl("billing.plansTable.credits", "Кредиты")}</th>
              {credits && OPS.map((op) => <th key={op} className="num">{labels[op]}</th>)}
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
                <td className="num" data-testid={testId ? `${testId}-credits-${p.name}` : undefined}>
                  {fmtInt(p.quotaCredits)}
                </td>
                {credits &&
                  OPS.map((op) => (
                    <td key={op} className="num">
                      ≈ {fmtInt(Math.floor(p.quotaCredits / Math.max(1, credits.weights[op])))}
                    </td>
                  ))}
                {renderAction && <td>{renderAction(p)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {credits && (
        <div className="form-sublabel" data-testid={testId ? `${testId}-breakdown-note` : undefined}>
          {tl("billing.plansTable.breakdownNote", "Раскладка — сколько операций одного вида покрывают кредиты тарифа, если тратить их только на этот вид; на деле виды смешиваются.")}
        </div>
      )}
      {credits && <CreditWeightsTable credits={credits} testId={testId ? `${testId}-weights` : undefined} />}
      {credits && credits.trialBalanceUsd > 0 && (
        <div className="form-sublabel" data-testid={testId ? `${testId}-trial-note` : undefined}>
          {tl(
            "billing.plansTable.trialNote",
            "Без подписки и своего ключа: при подтверждении почты на баланс один раз начисляется {amount} — примерно одна концепция на пробу.",
            { amount: "$" + credits.trialBalanceUsd.toFixed(2) },
          )}
        </div>
      )}
    </>
  );
}

/** Что сколько стоит в кредитах — по видам операций (0021). */
export function CreditWeightsTable({ credits, testId }: { credits: CreditInfo; testId?: string | undefined }) {
  const rows: { op: CreditOp; what: string; note?: string }[] = [
    {
      op: "synthesis",
      what: tl("billing.weights.synthesis", "Синтез концепции, мета-синтез"),
      note: tl("billing.weights.synthesisNote", "по оценке состава и глубины; число — 8 разделов стандартной глубины"),
    },
    { op: "section", what: tl("billing.weights.section", "Перегенерация или добавление раздела, преобразование граф ↔ тезисы") },
    { op: "subsection", what: tl("billing.weights.subsection", "Перегенерация подраздела, таблица рекомендаций") },
    { op: "mode", what: tl("billing.weights.mode", "Запуск или перегенерация режима") },
    { op: "enrichment", what: tl("billing.weights.enrichment", "Обогащение элемента, обоснование характеристики, точечная правка элемента") },
  ];
  return (
    <div className="data-table-wrap" style={{ marginTop: 12 }} data-testid={testId}>
      <table className="data-table">
        <thead>
          <tr>
            <th>{tl("billing.weights.operation", "Операция")}</th>
            <th className="num">{tl("billing.weights.credits", "Кредитов")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.op}>
              <td>
                {r.what}
                {r.note && <div className="form-sublabel">{r.note}</div>}
              </td>
              <td className="num">
                {r.op === "synthesis" ? "≈ " : ""}
                {fmtInt(credits.weights[r.op])}
              </td>
            </tr>
          ))}
          <tr>
            <td>{tl("billing.weights.resume", "Доработка после сбоя службы или API (обрыв, лимит, зависший ответ)")}</td>
            <td className="num">0</td>
          </tr>
        </tbody>
      </table>
      <div className="form-sublabel">
        {tl("billing.weights.footnote", "Кредит — {creditUsd} себестоимости вызовов модели. Когда кредиты кончаются, операции идут с баланса по себестоимости с наценкой.", { creditUsd: "$" + credits.creditUsd.toFixed(2) })}
      </div>
    </div>
  );
}
