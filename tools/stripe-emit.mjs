#!/usr/bin/env node
/**
 * Отправщик webhook-событий Stripe на локальный стенд (беседа 8.2).
 *
 * На стенде подписка после POST /billing/subscribe висит в 'incomplete':
 * мок Stripe (tools/stripe-mock.mjs) событий не шлёт, а активной её делает
 * ТОЛЬКО webhook invoice.paid (subscription-service.handleStripeWebhook,
 * 6.1). Этот скрипт и есть «Stripe, который прислал событие».
 *
 *   node tools/stripe-emit.mjs invoice.paid                  <sub_…>
 *   node tools/stripe-emit.mjs customer.subscription.updated <sub_…> [--status active] [--cancel-at-period-end]
 *   node tools/stripe-emit.mjs customer.subscription.deleted <sub_…>
 *   node tools/stripe-emit.mjs payment_intent.succeeded      <pi_…>   (сервер отвечает 200 handled:false —
 *                                                                        пополнение подтверждает /topup/confirm, а не webhook)
 *
 * Опции: --url <webhook>   (умолчание http://127.0.0.1:${PORT-3000}/api/v1/billing/webhook, либо WEBHOOK_URL)
 *        --period-days N   (invoice.paid / subscription.*: current_period = [now, now+N сут], умолчание 30)
 *        --period-start S --period-end S   (unix-секунды, перебивают --period-days)
 *        --status S        (subscription.updated: active|past_due|canceled|trialing|incomplete|unpaid; умолчание active)
 *        --cancel-at-period-end            (subscription.updated: флаг true)
 *        --dry-run         (напечатать тело и подпись, не отправлять)
 *
 * Подпись Stripe-Signature ставится, если задан STRIPE_WEBHOOK_SECRET
 * (та же схема, что signWebhookPayload в stripe-client.ts: HMAC-SHA256 от
 * `${t}.${body}`), и НЕ ставится иначе — при пустом секрете вне production
 * constructWebhookEvent (stripe-client.ts:274–281) подпись не проверяет.
 * В production пустой секрет → 400, стенд туда не ходит.
 *
 * Тело собирается по образцу мока: у invoice — subscription + lines[0].period
 * (это читает invoicePeriod сервера), у subscription — status,
 * current_period_*, cancel_at_period_end. Несуществующий id → сервер
 * отвечает 200 { handled:false } — как настоящий Stripe получает 200 на
 * событие, которое службе неинтересно.
 */
import { createHmac, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

const EVENTS = ["invoice.paid", "customer.subscription.updated", "customer.subscription.deleted", "payment_intent.succeeded"];
const SUB_STATUSES = ["active", "past_due", "canceled", "trialing", "incomplete", "incomplete_expired", "unpaid", "paused"];

const nowSec = () => Math.floor(Date.now() / 1000);

/** Симметрично constructWebhookEvent / signWebhookPayload (stripe-client.ts). */
export function signWebhookPayload(rawBody, secret, ts = nowSec()) {
  const v1 = createHmac("sha256", secret).update(`${ts}.${rawBody}`, "utf8").digest("hex");
  return `t=${ts},v1=${v1}`;
}

export function buildEvent(type, id, opts = {}) {
  const start = opts.periodStart ?? nowSec();
  const end = opts.periodEnd ?? start + (opts.periodDays ?? 30) * 86400;
  const evtId = `evt_${randomBytes(8).toString("hex")}`;
  let object;
  switch (type) {
    case "invoice.paid":
      object = { id: `in_${randomBytes(6).toString("hex")}`, object: "invoice", subscription: id, status: "paid",
        period_start: start, period_end: end, lines: { data: [{ period: { start, end } }] } };
      break;
    case "customer.subscription.updated":
      object = { id, object: "subscription", status: opts.status ?? "active", current_period_start: start, current_period_end: end,
        cancel_at_period_end: Boolean(opts.cancelAtPeriodEnd) };
      break;
    case "customer.subscription.deleted":
      object = { id, object: "subscription", status: "canceled", current_period_start: start, current_period_end: end,
        cancel_at_period_end: true };
      break;
    case "payment_intent.succeeded":
      object = { id, object: "payment_intent", status: "succeeded" };
      break;
    default:
      throw new Error(`неизвестное событие ${type}; доступны: ${EVENTS.join(", ")}`);
  }
  return { id: evtId, object: "event", type, created: nowSec(), livemode: false, data: { object } };
}

export async function emit(type, id, opts = {}) {
  const url = opts.url ?? process.env.WEBHOOK_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}/api/v1/billing/webhook`;
  const raw = JSON.stringify(buildEvent(type, id, opts));
  const secret = opts.secret ?? process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const headers = { "content-type": "application/json" };
  if (secret) headers["stripe-signature"] = signWebhookPayload(raw, secret);
  if (opts.dryRun) return { url, raw, headers, status: null, json: null };
  const r = await fetch(url, { method: "POST", headers, body: raw });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* не JSON */ }
  return { url, raw, headers, status: r.status, json, text };
}

function parseArgs(argv) {
  const o = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const take = () => { const v = argv[++i]; if (v === undefined) { console.error(`stripe-emit: у ${a} нет значения`); process.exit(2); } return v; };
    if (a === "--url") o.url = take();
    else if (a === "--period-days") o.periodDays = Number(take());
    else if (a === "--period-start") o.periodStart = Number(take());
    else if (a === "--period-end") o.periodEnd = Number(take());
    else if (a === "--status") o.status = take();
    else if (a === "--cancel-at-period-end") o.cancelAtPeriodEnd = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else if (a.startsWith("--")) { console.error(`stripe-emit: неизвестная опция ${a}`); process.exit(2); }
    else o.positional.push(a);
  }
  return o;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const [type, id] = args.positional;
  if (args.help || !type || !id) {
    console.log(`Отправщик webhook-событий Stripe на стенд.
  node tools/stripe-emit.mjs <событие> <id> [--url …] [--period-days N] [--status S] [--cancel-at-period-end] [--dry-run]
  события: ${EVENTS.join(", ")}
  id: sub_… для invoice/subscription, pi_… для payment_intent
  подпись ставится при непустом STRIPE_WEBHOOK_SECRET; иначе — без подписи (сервер вне production её не требует).`);
    process.exit(args.help ? 0 : 2);
  }
  if (!EVENTS.includes(type)) { console.error(`stripe-emit: неизвестное событие ${type}; доступны: ${EVENTS.join(", ")}`); process.exit(2); }
  if (args.status && !SUB_STATUSES.includes(args.status)) { console.error(`stripe-emit: статус ${args.status} вне ${SUB_STATUSES.join("|")}`); process.exit(2); }
  emit(type, id, args).then((r) => {
    if (args.dryRun) {
      console.log(`[stripe-emit] ${type} → ${r.url} (не отправлено)`);
      console.log(`  headers: ${JSON.stringify(r.headers)}`);
      console.log(`  body:    ${r.raw}`);
      return;
    }
    const signed = r.headers["stripe-signature"] ? "с подписью" : "без подписи (STRIPE_WEBHOOK_SECRET пуст)";
    console.log(`[stripe-emit] ${type} ${id} → ${r.url} (${signed}) → HTTP ${r.status} ${r.json ? JSON.stringify(r.json) : r.text}`);
    if (r.status === 200 && r.json && r.json.handled === false) {
      console.log("  сервер событие принял, но не обработал (handled:false) — подписка с таким id службе неизвестна или событие не из трёх обрабатываемых");
    }
    process.exit(r.status === 200 ? 0 : 1);
  }, (err) => {
    console.error(`[stripe-emit] не отправлено: ${err.message} — сервер на ${args.url ?? "порту " + (process.env.PORT ?? 3000)} поднят?`);
    process.exit(1);
  });
}
