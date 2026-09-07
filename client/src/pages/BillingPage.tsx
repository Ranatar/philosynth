/**
 * Страница биллинга (беседа 6.2, запрос 1, п. 1 + 5b; 03-spec §1.11 B1–B6,
 * §2.10). Полностью новый код — в исходнике биллинга нет (свой ключ в
 * поле формы и стоимость в футере).
 *
 * Секции:
 *  - «API-ключ» (BYO-Key): активный ключ prefix + маска, удаление, форма
 *    добавления (input type=password); статус «Активен» / «Не задан».
 *    Активный ключ один (6.1) — список показывает только его.
 *  - «Баланс сервиса»: balanceUsd из auth-store (GET /auth/me — источник
 *    правды после пополнения), выбор суммы $1/$5/$10/своя → POST /topup →
 *    Stripe Payment Element (VITE_STRIPE_PUBLISHABLE_KEY задан) →
 *    confirmPayment → POST /topup/confirm. Без publishable key —
 *    dev-режим: кнопка «Подтвердить платёж» зовёт /topup/confirm напрямую
 *    (мок-Stripe test-61 отдаёт PaymentIntent succeeded).
 *  - «Подписка» (п. 5b): план/статус/период, счётчики против квот,
 *    выбор тарифа → POST /subscribe → оплата первого инвойса в Elements;
 *    статус incomplete до webhook invoice.paid — кнопка «Обновить»;
 *    отмена (cancel_at_period_end) и возобновление.
 *  - «История использования»: таблица api_usage с фильтрами период /
 *    синтез, итоги (totals — БЕЗ строк byo, 02 §2.21) и разбивка byMode.
 *  - «Транзакции»: таблица с пагинацией (GET /transactions ?page&limit).
 *
 * Оформление — классы исходника (.input-form, .form-*, .action-btn,
 * .pool-status, .cert-badge) + блоки 3–4 UI-кита (перенесены в
 * globals.css часть 3 этой беседой). Названия разделов в истории —
 * KEY_LABELS, для служебных ключей (mode:…, enrich:…, transform:…) — как есть.
 */
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";
import type {
  ApiKeyInfo,
  ApiUsage,
  BillingMode,
  SubscriptionOverview,
  SubscriptionPlan,
  Transaction,
  TransactionType,
  UsageHistory,
} from "@philosynth/shared/types/billing";
import type { SynthesisPreview } from "@philosynth/shared/types/synthesis";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  confirmTopup,
  createTopup,
  deleteApiKey,
  getTransactionHistory,
  getUsageHistory,
  listApiKeys,
  storeApiKey,
} from "../api/billing";
import { ApiError } from "../api/client";
import {
  cancelSubscription,
  getPlans,
  getSubscription,
  resumeSubscription,
  subscribe,
} from "../api/subscription";
import { listSyntheses } from "../api/syntheses";
import { useAuthStore } from "../stores/auth-store";
import { fmtDateLong, fmtDateShort, fmtInt, fmtMoney, fmtUsd, toIsoDate } from "../utils/format";
import {
  getStripe,
  STRIPE_APPEARANCE,
  stripeConfigured,
  type StripeElements,
} from "../utils/stripe";

const LABELS = KEY_LABELS as Record<string, string>;

/* ── Общие мелочи ────────────────────────────────────────────────────── */

type StatusMsg = { text: string; kind: "ok" | "err" } | null;

/** Текст ошибки для статуса: message + первое поле details (образец ProfilePage) */
export function billingErrorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "STRIPE_UNAVAILABLE")
      return "Платежи недоступны: Stripe не настроен на сервере.";
    if (err.details && typeof err.details === "object") {
      const first = Object.values(err.details as Record<string, unknown>).find(
        (v) => typeof v === "string",
      );
      if (typeof first === "string") return `${err.message}: ${first}`;
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

function Status({ msg }: { msg: StatusMsg }) {
  if (!msg) return null;
  return (
    <div
      className={["pool-status", msg.kind].join(" ")}
      role={msg.kind === "err" ? "alert" : "status"}
    >
      {msg.text}
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return <div className="pool-status">{text}</div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="form-section-title">{children}</h2>;
}

function sectionLabel(key: string | null): string {
  if (!key) return "—";
  return LABELS[key] ?? key;
}

const MODE_LABELS: Record<BillingMode, string> = {
  byo: "свой ключ",
  subscription: "подписка",
  balance: "баланс",
};

const TX_LABELS: Record<TransactionType, string> = {
  topup: "пополнение",
  usage: "списание",
  refund: "возврат",
};

/** Бейдж режима/типа: gold — баланс/пополнение (литералы вне className —
 *  css-parity-audit считает строки в выражении className классами) */
function badgeClass(gold: boolean): string {
  return gold ? "cert-badge gold" : "cert-badge";
}
const modeBadgeClass = (m: BillingMode): string => badgeClass(m === "balance");
const txBadgeClass = (t: TransactionType): string => badgeClass(t === "topup");

const rowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
};

/* ── Stripe Payment Element ──────────────────────────────────────────── */

interface StripePaymentBoxProps {
  clientSecret: string;
  submitLabel: string;
  onPaid: (paymentIntentId: string) => Promise<void> | void;
  onCancel: () => void;
}

/**
 * Обёртка Payment Element: монтирует элемент в div, подтверждает платёж
 * без redirect (redirect: 'if_required'). Виджет сторонний — оформление
 * через appearance; обёртка — .form-group (кит: «достаточно разместить в
 * .input-form»).
 */
function StripePaymentBox({ clientSecret, submitLabel, onPaid, onCancel }: StripePaymentBoxProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let element: ReturnType<StripeElements["create"]> | null = null;
    void (async () => {
      try {
        const stripe = await getStripe();
        if (cancelled || !hostRef.current) return;
        const elements = stripe.elements({ clientSecret, appearance: STRIPE_APPEARANCE });
        elementsRef.current = elements;
        element = elements.create("payment", { layout: "tabs" });
        element.mount(hostRef.current);
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(billingErrorText(err, "Не удалось загрузить платёжную форму"));
      }
    })();
    return () => {
      cancelled = true;
      try {
        element?.destroy();
      } catch {
        /* элемент уже снят */
      }
    };
  }, [clientSecret]);

  async function handlePay(): Promise<void> {
    if (!elementsRef.current) return;
    setPending(true);
    setError(null);
    try {
      const stripe = await getStripe();
      const result = await stripe.confirmPayment({
        elements: elementsRef.current,
        redirect: "if_required",
      });
      if (result.error) {
        setError(result.error.message ?? "Платёж отклонён");
        return;
      }
      if (!result.paymentIntent || result.paymentIntent.status !== "succeeded") {
        setError(
          `Платёж не завершён (статус: ${result.paymentIntent?.status ?? "неизвестен"})`,
        );
        return;
      }
      await onPaid(result.paymentIntent.id);
    } catch (err) {
      setError(billingErrorText(err, "Ошибка платежа"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="form-group full" data-testid="stripe-payment-box">
      <div ref={hostRef} style={{ minHeight: 120 }} />
      {!ready && !error && <Hint text="Загрузка платёжной формы…" />}
      {error && <Status msg={{ text: error, kind: "err" }} />}
      <div className="inline-edit-actions">
        <button
          type="button"
          className="action-btn primary"
          disabled={!ready || pending}
          onClick={() => void handlePay()}
        >
          {pending ? "Оплата…" : submitLabel}
        </button>
        <button type="button" className="action-btn" disabled={pending} onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}

/* ── Секция «API-ключ» ───────────────────────────────────────────────── */

/** Маска: prefix (первые символы, как хранит сервер) + точки */
export function maskApiKey(prefix: string): string {
  return `${prefix}${"•".repeat(12)}`;
}

function ApiKeySection() {
  const [keys, setKeys] = useState<ApiKeyInfo[] | null>(null);
  const [newKey, setNewKey] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<StatusMsg>(null);

  const reload = useCallback(async () => {
    try {
      setKeys(await listApiKeys());
    } catch (err) {
      setStatus({ text: billingErrorText(err, "Не удалось загрузить ключи"), kind: "err" });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const active = keys?.find((k) => k.isActive) ?? null;

  async function handleStore(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const key = newKey.trim();
    if (!key) {
      setStatus({ text: "Введите ключ", kind: "err" });
      return;
    }
    setPending(true);
    setStatus(null);
    try {
      const stored = await storeApiKey(key);
      setNewKey("");
      setStatus({ text: `Ключ ${stored.prefix}… сохранён и активен`, kind: "ok" });
      await reload();
    } catch (err) {
      setStatus({ text: billingErrorText(err, "Не удалось сохранить ключ"), kind: "err" });
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!active) return;
    if (
      !window.confirm(
        "Удалить активный API-ключ? Генерация пойдёт с подписки или баланса сервиса.",
      )
    )
      return;
    setPending(true);
    setStatus(null);
    try {
      await deleteApiKey(active.id);
      setStatus({ text: "Ключ удалён", kind: "ok" });
      await reload();
    } catch (err) {
      setStatus({ text: billingErrorText(err, "Не удалось удалить ключ"), kind: "err" });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="input-form" data-testid="billing-api-key">
      <SectionTitle>API-ключ Anthropic (BYO-Key)</SectionTitle>
      <div className="form-group full">
        {keys === null ? (
          <Hint text="Загрузка…" />
        ) : active ? (
          <div style={rowStyle}>
            <span className="masked-key" data-testid="api-key-masked">
              {maskApiKey(active.prefix)}
              <span className="masked-key-status active">активен</span>
            </span>
            <span className="version-meta">с {fmtDateShort(active.createdAt)}</span>
            <button
              type="button"
              className="action-btn"
              disabled={pending}
              onClick={() => void handleDelete()}
              data-testid="api-key-delete"
            >
              Удалить
            </button>
          </div>
        ) : (
          <div className="masked-key" data-testid="api-key-absent">
            ключ не задан
            <span className="masked-key-status absent">не задан</span>
          </div>
        )}
        <div className="form-sublabel">
          С собственным ключом запросы к Claude идут через сервер с вашим ключом и не
          списываются с баланса; без ключа — подписка или баланс сервиса (приоритет:
          ключ → подписка → баланс).
        </div>
      </div>
      <form onSubmit={(e) => void handleStore(e)} className="form-group full">
        <label className="form-label" htmlFor="billing-new-key">
          {active ? "Заменить ключ" : "Добавить ключ"}
        </label>
        <div style={{ ...rowStyle, gap: 8 }}>
          <input
            id="billing-new-key"
            type="password"
            autoComplete="off"
            className="form-input"
            placeholder="sk-ant-api03-…"
            style={{ flex: "1 1 260px" }}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            disabled={pending}
          />
          <button
            type="submit"
            className="action-btn primary"
            disabled={pending || !newKey.trim()}
            data-testid="api-key-save"
          >
            Сохранить
          </button>
        </div>
        <div className="form-sublabel">
          Ключ шифруется на сервере (AES-256-GCM) и в открытом виде не хранится; новый
          ключ деактивирует прежний.
        </div>
      </form>
      <Status msg={status} />
    </section>
  );
}

/* ── Секция «Баланс сервиса» ─────────────────────────────────────────── */

const PRESET_AMOUNTS = [1, 5, 10] as const;

interface TopupDraft {
  clientSecret: string;
  paymentIntentId: string;
  amountUsd: number;
}

function BalanceSection({ onBalanceChanged }: { onBalanceChanged: () => void }) {
  const balance = useAuthStore((s) => s.user?.balanceUsd);
  const restore = useAuthStore((s) => s.restore);
  const [preset, setPreset] = useState<number | "custom">(5);
  const [custom, setCustom] = useState("");
  const [intent, setIntent] = useState<TopupDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<StatusMsg>(null);

  const amount = preset === "custom" ? Number(custom.replace(",", ".")) : preset;
  const amountValid = Number.isFinite(amount) && amount >= 1 && amount <= 1000;
  const live = stripeConfigured();

  async function handleCreate(): Promise<void> {
    if (!amountValid) {
      setStatus({ text: "Сумма — от $1 до $1000", kind: "err" });
      return;
    }
    setPending(true);
    setStatus(null);
    try {
      setIntent(await createTopup(Math.round(amount * 100) / 100));
    } catch (err) {
      setStatus({ text: billingErrorText(err, "Не удалось создать платёж"), kind: "err" });
    } finally {
      setPending(false);
    }
  }

  const finish = useCallback(
    async (paymentIntentId: string) => {
      setPending(true);
      try {
        const result = await confirmTopup(paymentIntentId);
        setIntent(null);
        setStatus({
          text: `Баланс пополнен на ${fmtMoney(result.transaction.amountUsd)}; текущий баланс ${fmtMoney(result.balanceUsd)}`,
          kind: "ok",
        });
        await restore(); // balanceUsd в auth-store — из GET /auth/me
        onBalanceChanged();
      } catch (err) {
        setStatus({ text: billingErrorText(err, "Платёж не подтверждён"), kind: "err" });
      } finally {
        setPending(false);
      }
    },
    [onBalanceChanged, restore],
  );

  return (
    <section className="input-form" data-testid="billing-balance">
      <SectionTitle>Баланс сервиса</SectionTitle>
      <div className="stat-row">
        <div>
          <div className="stat-value gold" data-testid="balance-value">
            {balance === undefined ? "—" : fmtMoney(balance)}
          </div>
          <div className="stat-label">баланс</div>
        </div>
      </div>
      {intent ? (
        <>
          <div className="form-sublabel" style={{ marginBottom: 8 }}>
            Платёж на {fmtMoney(intent.amountUsd)} создан.{" "}
            {live
              ? "Введите данные карты и подтвердите оплату."
              : "Stripe.js не настроен (VITE_STRIPE_PUBLISHABLE_KEY) — тестовый режим: подтверждение платежа сервером."}
          </div>
          {live ? (
            <StripePaymentBox
              clientSecret={intent.clientSecret}
              submitLabel={`Оплатить ${fmtMoney(intent.amountUsd)}`}
              onPaid={(id) => finish(id)}
              onCancel={() => setIntent(null)}
            />
          ) : (
            <div className="inline-edit-actions" style={{ borderTop: "none", paddingTop: 0 }}>
              <button
                type="button"
                className="action-btn primary"
                disabled={pending}
                onClick={() => void finish(intent.paymentIntentId)}
                data-testid="topup-confirm-dev"
              >
                {pending ? "Подтверждение…" : "Подтвердить платёж"}
              </button>
              <button
                type="button"
                className="action-btn"
                disabled={pending}
                onClick={() => setIntent(null)}
              >
                Отмена
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="amount-choice" data-testid="amount-choice">
          {PRESET_AMOUNTS.map((v) => (
            <button
              key={v}
              type="button"
              className={["action-btn", preset === v ? "active" : ""].join(" ").trim()}
              onClick={() => setPreset(v)}
              data-testid={`amount-${v}`}
            >
              ${v}
            </button>
          ))}
          <input
            className="form-input"
            placeholder="своя сумма"
            inputMode="decimal"
            style={{ width: 130 }}
            value={custom}
            onFocus={() => setPreset("custom")}
            onChange={(e) => {
              setPreset("custom");
              setCustom(e.target.value);
            }}
            aria-label="Своя сумма пополнения, USD"
            data-testid="amount-custom"
          />
          <button
            type="button"
            className="action-btn primary"
            disabled={pending || !amountValid}
            onClick={() => void handleCreate()}
            data-testid="topup-start"
          >
            {pending ? "…" : `Пополнить${amountValid ? ` на ${fmtMoney(amount)}` : ""}`}
          </button>
        </div>
      )}
      <Status msg={status} />
    </section>
  );
}

/* ── Секция «Подписка» ───────────────────────────────────────────────── */

const SUB_STATUS_LABELS: Record<string, string> = {
  active: "активна",
  trialing: "пробный период",
  past_due: "просрочена оплата",
  canceled: "отменена",
  incomplete: "ожидает оплаты",
};

type QuotaKey = keyof SubscriptionOverview["quotas"];

const QUOTA_LABELS: Record<QuotaKey, string> = {
  syntheses: "синтезы",
  regenerations: "перегенерации",
  modes: "режимы",
  enrichments: "обогащения",
};

function periodWord(p: SubscriptionPlan["billingPeriod"]): string {
  return p === "year" ? "год" : "месяц";
}

function SubscriptionSection() {
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [payment, setPayment] = useState<{ clientSecret: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<StatusMsg>(null);

  const reload = useCallback(async () => {
    try {
      setOverview(await getSubscription());
    } catch (err) {
      setStatus({ text: billingErrorText(err, "Не удалось загрузить подписку"), kind: "err" });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function openPlans(): Promise<void> {
    setChoosing(true);
    if (plans === null) {
      try {
        setPlans(await getPlans());
      } catch (err) {
        setStatus({ text: billingErrorText(err, "Не удалось загрузить тарифы"), kind: "err" });
      }
    }
  }

  async function handleSubscribe(planId: string): Promise<void> {
    setPending(true);
    setStatus(null);
    try {
      const result = await subscribe(planId);
      setChoosing(false);
      if (stripeConfigured() && result.clientSecret) {
        setPayment({ clientSecret: result.clientSecret });
      } else {
        setStatus({
          text: "Подписка создана и ожидает оплаты первого инвойса; после оплаты статус обновится (webhook Stripe).",
          kind: "ok",
        });
      }
      await reload();
    } catch (err) {
      setStatus({ text: billingErrorText(err, "Не удалось оформить подписку"), kind: "err" });
    } finally {
      setPending(false);
    }
  }

  async function handleCancelResume(resume: boolean): Promise<void> {
    setPending(true);
    setStatus(null);
    try {
      await (resume ? resumeSubscription() : cancelSubscription());
      setStatus({
        text: resume ? "Подписка возобновлена" : "Подписка будет отменена в конце периода",
        kind: "ok",
      });
      await reload();
    } catch (err) {
      setStatus({ text: billingErrorText(err, "Не удалось изменить подписку"), kind: "err" });
    } finally {
      setPending(false);
    }
  }

  const sub = overview?.subscription ?? null;
  const plan = overview?.plan ?? null;
  const billable = sub !== null && (sub.status === "active" || sub.status === "trialing");

  return (
    <section className="input-form" data-testid="billing-subscription">
      <SectionTitle>Подписка</SectionTitle>
      {overview === null ? (
        <Hint text="Загрузка…" />
      ) : sub && plan ? (
        <>
          <div className="stat-row">
            <div>
              <div className="stat-value" data-testid="sub-plan">
                {plan.displayName}
              </div>
              <div className="stat-label">
                тариф · {fmtMoney(plan.priceUsd)} / {periodWord(plan.billingPeriod)}
              </div>
            </div>
            <div>
              <div className="stat-value" data-testid="sub-status">
                {SUB_STATUS_LABELS[sub.status] ?? sub.status}
              </div>
              <div className="stat-label">
                статус{sub.cancelAtPeriodEnd ? " · отмена в конце периода" : ""}
              </div>
            </div>
            <div>
              <div className="stat-value" style={{ fontSize: 16 }}>
                {fmtDateLong(sub.currentPeriodStart)} — {fmtDateLong(sub.currentPeriodEnd)}
              </div>
              <div className="stat-label">период</div>
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table" data-testid="sub-quotas">
              <thead>
                <tr>
                  <th>Квота</th>
                  <th className="num">Использовано</th>
                  <th className="num">Лимит</th>
                  <th className="num">Остаток</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(QUOTA_LABELS) as QuotaKey[]).map((q) => (
                  <tr key={q}>
                    <td>{QUOTA_LABELS[q]}</td>
                    <td className="num">{fmtInt(overview.usage[q])}</td>
                    <td className="num">{fmtInt(overview.quotas[q])}</td>
                    <td className="num">
                      {fmtInt(Math.max(0, overview.quotas[q] - overview.usage[q]))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="inline-edit-actions">
            {billable && !sub.cancelAtPeriodEnd && (
              <button
                type="button"
                className="action-btn"
                disabled={pending}
                onClick={() => void handleCancelResume(false)}
                data-testid="sub-cancel"
              >
                Отменить подписку
              </button>
            )}
            {billable && sub.cancelAtPeriodEnd && (
              <button
                type="button"
                className="action-btn primary"
                disabled={pending}
                onClick={() => void handleCancelResume(true)}
                data-testid="sub-resume"
              >
                Возобновить
              </button>
            )}
            {!billable && (
              <button
                type="button"
                className="action-btn primary"
                disabled={pending}
                onClick={() => void openPlans()}
                data-testid="sub-choose"
              >
                Выбрать тариф
              </button>
            )}
            <button
              type="button"
              className="action-btn"
              disabled={pending}
              onClick={() => void reload()}
              data-testid="sub-refresh"
            >
              Обновить
            </button>
          </div>
        </>
      ) : (
        <div className="form-group full">
          <div className="masked-key" data-testid="sub-absent">
            подписки нет
            <span className="masked-key-status absent">не оформлена</span>
          </div>
          <div className="form-sublabel">
            Подписка даёт квоты на период (синтезы, перегенерации, режимы, обогащения);
            при исчерпании квоты операции идут с баланса.
          </div>
          <div className="inline-edit-actions" style={{ borderTop: "none", paddingTop: 0 }}>
            <button
              type="button"
              className="action-btn primary"
              disabled={pending}
              onClick={() => void openPlans()}
              data-testid="sub-choose"
            >
              Выбрать тариф
            </button>
          </div>
        </div>
      )}

      {choosing && (
        <div className="form-group full" data-testid="sub-plans">
          <div className="form-label">Тарифы</div>
          {plans === null ? (
            <Hint text="Загрузка тарифов…" />
          ) : plans.length === 0 ? (
            <div className="data-table-empty">тарифов нет</div>
          ) : (
            <div className="data-table-wrap" style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Тариф</th>
                    <th className="num">Цена</th>
                    <th className="num">Синтезы</th>
                    <th className="num">Перегенерации</th>
                    <th className="num">Режимы</th>
                    <th className="num">Обогащения</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.id}>
                      <td>{p.displayName}</td>
                      <td className="num">
                        {fmtMoney(p.priceUsd)} / {periodWord(p.billingPeriod)}
                      </td>
                      <td className="num">{fmtInt(p.quotaSyntheses)}</td>
                      <td className="num">{fmtInt(p.quotaRegenerations)}</td>
                      <td className="num">{fmtInt(p.quotaModes)}</td>
                      <td className="num">{fmtInt(p.quotaEnrichments)}</td>
                      <td>
                        <button
                          type="button"
                          className="action-btn primary"
                          disabled={pending || (billable && plan?.id === p.id)}
                          onClick={() => void handleSubscribe(p.id)}
                          data-testid={`sub-plan-${p.name}`}
                        >
                          Оформить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="inline-edit-actions" style={{ borderTop: "none", paddingTop: 0 }}>
            <button type="button" className="action-btn" onClick={() => setChoosing(false)}>
              Закрыть
            </button>
          </div>
        </div>
      )}

      {payment && (
        <>
          <div className="form-sublabel">Оплата первого инвойса подписки.</div>
          <StripePaymentBox
            clientSecret={payment.clientSecret}
            submitLabel="Оплатить подписку"
            onPaid={async () => {
              setPayment(null);
              setStatus({
                text: "Оплата принята; статус подписки обновится после подтверждения Stripe.",
                kind: "ok",
              });
              await reload();
            }}
            onCancel={() => setPayment(null)}
          />
        </>
      )}
      <Status msg={status} />
    </section>
  );
}

/* ── Секция «История использования» ──────────────────────────────────── */

type Period = "7d" | "30d" | "all" | "custom";

function UsageSection({ refreshToken }: { refreshToken: number }) {
  const [period, setPeriod] = useState<Period>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [synthesisId, setSynthesisId] = useState("");
  const [syntheses, setSyntheses] = useState<SynthesisPreview[]>([]);
  const [history, setHistory] = useState<UsageHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSyntheses({ limit: 100, sort: "updatedAt", order: "desc" })
      .then((r) => setSyntheses(r.items))
      .catch(() => setSyntheses([]));
  }, []);

  const range = useMemo((): { from?: string; to?: string } => {
    const now = Date.now();
    if (period === "7d") return { from: toIsoDate(new Date(now - 7 * 86400e3)) };
    if (period === "30d") return { from: toIsoDate(new Date(now - 30 * 86400e3)) };
    if (period === "custom") {
      const r: { from?: string; to?: string } = {};
      if (from) r.from = from;
      if (to) r.to = `${to}T23:59:59`;
      return r;
    }
    return {};
  }, [period, from, to]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getUsageHistory({ ...range, ...(synthesisId ? { synthesisId } : {}) })
      .then((h) => {
        if (!cancelled) setHistory(h);
      })
      .catch((err) => {
        if (!cancelled) setError(billingErrorText(err, "Не удалось загрузить историю"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, synthesisId, refreshToken]);

  const titleOf = useMemo(() => {
    const map = new Map(syntheses.map((s) => [s.id, s.title]));
    return (id: string | null): string =>
      id ? (map.get(id) ?? `${id.slice(0, 8)}…`) : "—";
  }, [syntheses]);

  const entries: ApiUsage[] = history?.entries ?? [];
  const byoRequests = history?.byMode.byo.requests ?? 0;

  return (
    <section className="input-form" data-testid="billing-usage">
      <SectionTitle>История использования</SectionTitle>
      <div className="data-table-wrap">
        <div className="data-table-toolbar">
          <div style={{ ...rowStyle, gap: 8 }}>
            <select
              className="form-select"
              style={{ width: 200 }}
              value={synthesisId}
              onChange={(e) => setSynthesisId(e.target.value)}
              aria-label="Фильтр по синтезу"
              data-testid="usage-synthesis-filter"
            >
              <option value="">Все синтезы</option>
              {syntheses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <select
              className="form-select"
              style={{ width: 150 }}
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              aria-label="Период"
              data-testid="usage-period-filter"
            >
              <option value="7d">За неделю</option>
              <option value="30d">За месяц</option>
              <option value="all">За всё время</option>
              <option value="custom">Свой период</option>
            </select>
            {period === "custom" && (
              <>
                <input
                  type="date"
                  className="form-input"
                  style={{ width: 150 }}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-label="С даты"
                />
                <input
                  type="date"
                  className="form-input"
                  style={{ width: 150 }}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  aria-label="По дату"
                />
              </>
            )}
          </div>
          <span className="version-meta" data-testid="usage-count">
            {loading ? "загрузка…" : `${fmtInt(entries.length)} записей`}
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" data-testid="usage-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Синтез</th>
                <th>Раздел</th>
                <th className="num">Вход</th>
                <th className="num">Выход</th>
                <th className="num">Стоимость</th>
                <th>Режим</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((u) => (
                <tr key={u.id}>
                  <td>{fmtDateShort(u.createdAt)}</td>
                  <td>{titleOf(u.synthesisId)}</td>
                  <td>{sectionLabel(u.sectionKey)}</td>
                  <td className="num">{fmtInt(u.inputTokens)}</td>
                  <td className="num">{fmtInt(u.outputTokens)}</td>
                  <td className="num">{fmtUsd(u.costUsd)}</td>
                  <td>
                    <span className={modeBadgeClass(u.billingMode)}>
                      {MODE_LABELS[u.billingMode] ?? u.billingMode}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            {history && entries.length > 0 && (
              <tfoot>
                <tr data-testid="usage-totals">
                  <td colSpan={3}>Итого ({fmtInt(history.totals.requests)} запросов)</td>
                  <td className="num">{fmtInt(history.totals.inputTokens)}</td>
                  <td className="num">{fmtInt(history.totals.outputTokens)}</td>
                  <td className="num">{fmtUsd(history.totals.costUsd)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!loading && entries.length === 0 && !error && (
          <div className="data-table-empty">записей нет</div>
        )}
        {error && <Status msg={{ text: error, kind: "err" }} />}
      </div>
      {history && entries.length > 0 && (
        <div className="form-sublabel" style={{ marginTop: 8 }} data-testid="usage-by-mode">
          По режимам:{" "}
          {(Object.keys(MODE_LABELS) as BillingMode[])
            .filter((m) => history.byMode[m].requests > 0)
            .map(
              (m) =>
                `${MODE_LABELS[m]} — ${fmtInt(history.byMode[m].requests)} запр., ${fmtUsd(history.byMode[m].costUsd)}`,
            )
            .join(" · ")}
          {byoRequests > 0 &&
            " · стоимость запросов со своим ключом — себестоимость, в итог не входит"}
        </div>
      )}
    </section>
  );
}

/* ── Секция «Транзакции» ─────────────────────────────────────────────── */

const TX_PAGE = 20;

function TransactionsSection({ refreshToken }: { refreshToken: number }) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTransactionHistory(page, TX_PAGE)
      .then((h) => {
        if (cancelled) return;
        setItems(h.items);
        setTotal(h.total);
      })
      .catch((err) => {
        if (!cancelled) setError(billingErrorText(err, "Не удалось загрузить транзакции"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, refreshToken]);

  const pages = Math.max(1, Math.ceil(total / TX_PAGE));

  return (
    <section className="input-form" data-testid="billing-transactions">
      <SectionTitle>Транзакции</SectionTitle>
      <div className="data-table-wrap">
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" data-testid="tx-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тип</th>
                <th>Синтез / раздел</th>
                <th className="num">Сумма</th>
                <th className="num">Баланс после</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>{fmtDateShort(t.createdAt)}</td>
                  <td>
                    <span className={txBadgeClass(t.type)}>
                      {TX_LABELS[t.type] ?? t.type}
                    </span>
                  </td>
                  <td>
                    {t.sectionKey
                      ? sectionLabel(t.sectionKey)
                      : t.synthesisId
                        ? `${t.synthesisId.slice(0, 8)}…`
                        : "—"}
                  </td>
                  <td className="num">
                    {fmtUsd(t.type === "usage" ? -Math.abs(t.amountUsd) : t.amountUsd)}
                  </td>
                  <td className="num">{fmtUsd(t.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && items.length === 0 && !error && (
          <div className="data-table-empty">транзакций нет</div>
        )}
        {error && <Status msg={{ text: error, kind: "err" }} />}
        {total > TX_PAGE && (
          <div className="pager" data-testid="tx-pager">
            <button
              type="button"
              className="action-btn"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              ← назад
            </button>
            <span>
              стр. {page} / {pages}
            </span>
            <button
              type="button"
              className="action-btn"
              disabled={page >= pages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              вперёд →
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Страница ────────────────────────────────────────────────────────── */

export function BillingPage() {
  const [refreshToken, setRefreshToken] = useState(0);
  const bump = useCallback(() => setRefreshToken((n) => n + 1), []);

  return (
    <div data-testid="billing-page">
      <ApiKeySection />
      <BalanceSection onBalanceChanged={bump} />
      <SubscriptionSection />
      <UsageSection refreshToken={refreshToken} />
      <TransactionsSection refreshToken={refreshToken} />
    </div>
  );
}
