#!/usr/bin/env node
/**
 * Мок Stripe REST — оснастка стенда биллинга (беседа 8.2).
 *
 * Вынесен из tests/test-61-requests2-11.mjs без изменения поведения;
 * до 8.2 та же копия жила в test-62 и test-71 (три экземпляра). Сервер
 * говорит с ним через STRIPE_API_BASE (stripe-client.ts 6.1) — приём тот
 * же, что ANTHROPIC_BASE_URL у мока Claude.
 *
 * Маршруты (из 6.1/7.1):
 *   POST /v1/payment_intents         → PaymentIntent; status — из опции
 *                                       paymentIntentStatus (test-61 держал
 *                                       'requires_payment_method' и переводил
 *                                       в succeeded руками; test-62/71 и стенд
 *                                       — сразу 'succeeded', иначе dev-режим
 *                                       BillingPage не подтвердит платёж)
 *   GET  /v1/payment_intents/:id
 *   POST /v1/customers
 *   POST /v1/subscriptions           → status 'incomplete' + latest_invoice.
 *                                       payment_intent (default_incomplete);
 *                                       active его делает ТОЛЬКО webhook —
 *                                       на стенде его шлёт tools/stripe-emit.mjs
 *   GET  /v1/subscriptions/:id
 *   POST /v1/subscriptions/:id       (cancel_at_period_end)
 * Новое под 8.3 (тарифы):
 *   POST /v1/products, GET /v1/products/:id, GET /v1/products
 *   POST /v1/prices  (product, unit_amount, currency, recurring[interval],
 *                      lookup_key [+ transfer_lookup_key])
 *   GET  /v1/prices/:id, GET /v1/prices?lookup_keys[]=…&active=…&product=…
 *   POST /v1/prices/:id  (active, lookup_key)
 * Служебное (вне /v1, без Bearer): GET /__mock/health.
 *
 * Тело запросов Stripe — application/x-www-form-urlencoded с ключами
 * `a[b][c]` (09 §4, 6.1) — parseForm раскладывает их в объект; списки
 * приходят как `items[0][price]` → { items: { "0": { price } } } — форма
 * сохранена как в тестах (test-61 читает `items["0"].price`).
 *
 * Как модуль:
 *   import { createStripeMock } from "../tools/stripe-mock.mjs";
 *   const mock = createStripeMock({ port, bearer, paymentIntentStatus });
 *   const srv = await mock.start(); … mock.state.pis.get(id).status = "succeeded";
 * Как процесс:
 *   node tools/stripe-mock.mjs [--verbose] [--port N] [--bearer KEY]
 *                              [--pi-status succeeded|requires_payment_method]
 *   [--id-tag МЕТКА]   (метка в id объектов; пустая — голые pi_1/cus_1, как до 8.2)
 *   Умолчания — из переменных окружения STRIPE_MOCK_PORT (3866),
 *   STRIPE_MOCK_SECRET_KEY (sk_test_mock — это и есть ожидаемый Bearer, тот же
 *   ключ кладётся в STRIPE_SECRET_KEY сервера), STRIPE_MOCK_PI_STATUS
 *   (succeeded), STRIPE_MOCK_ID_TAG (уникальная метка запуска). Флаг --verbose
 *   печатает принятые запросы.
 *
 * Чем мок НЕ равен Stripe — docs/09-lessons.md, раздел «Стенд биллинга».
 */
import http from "node:http";
import { pathToFileURL } from "node:url";

export const DEFAULT_PORT = 3866;
export const DEFAULT_BEARER = "sk_test_mock";
export const DEFAULT_PI_STATUS = "succeeded";
/** Метка запуска в id объектов (`pi_<метка>_1`): у настоящего Stripe id
 *  глобально уникальны, у мока счётчики начинаются с 1 в каждом процессе —
 *  при персистентной БД повтор `cus_1` бьёт в UNIQUE users.stripe_customer_id
 *  (23505; пойман прогоном test-71 после test-62 на одной базе). */
export const defaultIdTag = () => Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 4);
export const PI_STATUSES = ["succeeded", "requires_payment_method"];

const J = (x) => JSON.stringify(x);
export const nowSec = () => Math.floor(Date.now() / 1000);

/** `a[b][c]=v` → { a: { b: { c: "v" } } } (парсер из test-61 дословно). */
export function parseForm(body) {
  const out = {};
  for (const [k, v] of new URLSearchParams(body)) {
    const path = k.replace(/\]/g, "").split("[");
    let cur = out;
    path.forEach((p, i) => { if (i === path.length - 1) cur[p] = v; else cur = cur[p] ??= {}; });
  }
  return out;
}

/** Значения query-параметра в обеих записях Stripe: `k[]=a&k[]=b` и `k[0]=a&k[1]=b`. */
function queryList(sp, name) {
  const out = [];
  for (const [k, v] of sp) if (k === name || k === `${name}[]` || k.startsWith(`${name}[`)) out.push(v);
  return out;
}

export function createStripeMock(options = {}) {
  const port = Number(options.port ?? process.env.STRIPE_MOCK_PORT ?? DEFAULT_PORT);
  const host = options.host ?? "127.0.0.1";
  const bearer = options.bearer ?? process.env.STRIPE_MOCK_SECRET_KEY ?? DEFAULT_BEARER;
  const piStatus = options.paymentIntentStatus ?? process.env.STRIPE_MOCK_PI_STATUS ?? DEFAULT_PI_STATUS;
  if (!PI_STATUSES.includes(piStatus)) {
    throw new Error(`stripe-mock: paymentIntentStatus должен быть одним из ${PI_STATUSES.join("|")}, получено: ${piStatus}`);
  }
  const verbose = Boolean(options.verbose);
  const idTag = options.idTag ?? process.env.STRIPE_MOCK_ID_TAG ?? defaultIdTag();
  const mkId = (prefix, n) => (idTag ? `${prefix}_${idTag}_${n}` : `${prefix}_${n}`);
  const log = options.log ?? ((...a) => console.log("[stripe-mock]", ...a));

  const state = {
    pis: new Map(), subs: new Map(), customers: [], requests: [],
    products: new Map(), prices: new Map(),
  };

  function handler(req, res) {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const auth = req.headers.authorization;
      const form = parseForm(body);
      // test-61 хранил { method, url, auth }, test-71 — { method, url, form }: объединение
      state.requests.push({ method: req.method, url: req.url, auth, form });
      const send = (code, obj) => {
        if (verbose) log(`${req.method} ${req.url} → ${code}${body ? " " + body.slice(0, 300) : ""}`);
        res.writeHead(code, { "content-type": "application/json" });
        res.end(J(obj));
      };
      const u = req.url;
      const url = new URL(u, "http://mock");
      const p = url.pathname;

      if (req.method === "GET" && p === "/__mock/health") {
        return send(200, { ok: true, port, paymentIntentStatus: piStatus, counts: {
          paymentIntents: state.pis.size, subscriptions: state.subs.size, customers: state.customers.length,
          products: state.products.size, prices: state.prices.size, requests: state.requests.length,
        } });
      }
      if (auth !== `Bearer ${bearer}`) return send(401, { error: { message: "bad key" } });

      /* ── PaymentIntents ─────────────────────────────────────────────── */
      if (req.method === "POST" && p === "/v1/payment_intents") {
        const id = mkId("pi", state.pis.size + 1);
        const pi = { id, object: "payment_intent", amount: Number(form.amount), currency: form.currency,
          customer: form.customer ?? null, status: piStatus, client_secret: `${id}_secret`, metadata: form.metadata ?? {} };
        state.pis.set(id, pi); return send(200, pi);
      }
      let m;
      if (req.method === "GET" && (m = p.match(/^\/v1\/payment_intents\/([^/]+)$/))) {
        const pi = state.pis.get(m[1]);
        return pi ? send(200, pi) : send(404, { error: { message: "No such payment_intent", code: "resource_missing" } });
      }

      /* ── Customers ──────────────────────────────────────────────────── */
      if (req.method === "POST" && p === "/v1/customers") {
        const c = { id: mkId("cus", state.customers.length + 1), object: "customer", email: form.email, metadata: form.metadata ?? {} };
        state.customers.push(c); return send(200, c);
      }

      /* ── Subscriptions ──────────────────────────────────────────────── */
      if (req.method === "POST" && p === "/v1/subscriptions") {
        const id = mkId("sub", state.subs.size + 1);
        const s = { id, object: "subscription", customer: form.customer, status: "incomplete",
          current_period_start: nowSec(), current_period_end: nowSec() + 30 * 86400,
          cancel_at_period_end: false, metadata: form.metadata ?? {}, items: form.items,
          latest_invoice: { id: `in_${id}`, object: "invoice", subscription: id,
            payment_intent: { id: `pi_${id}`, object: "payment_intent", status: "requires_payment_method", client_secret: `pi_${id}_secret` } } };
        state.subs.set(id, s); return send(200, s);
      }
      if ((m = p.match(/^\/v1\/subscriptions\/([^/]+)$/))) {
        const s = state.subs.get(m[1]);
        if (!s) return send(404, { error: { message: "No such subscription", code: "resource_missing" } });
        if (req.method === "POST" && form.cancel_at_period_end !== undefined) s.cancel_at_period_end = form.cancel_at_period_end === "true";
        return send(200, s);
      }

      /* ── Products (8.3) ─────────────────────────────────────────────── */
      if (req.method === "POST" && p === "/v1/products") {
        if (!form.name) return send(400, { error: { message: "Missing required param: name.", code: "parameter_missing", param: "name" } });
        const id = form.id ?? mkId("prod", state.products.size + 1);
        if (state.products.has(id)) return send(400, { error: { message: `Product already exists: ${id}`, code: "resource_already_exists" } });
        const prod = { id, object: "product", name: form.name, active: form.active === undefined ? true : form.active === "true",
          description: form.description ?? null, metadata: form.metadata ?? {}, created: nowSec() };
        state.products.set(id, prod); return send(200, prod);
      }
      if (req.method === "GET" && p === "/v1/products") {
        let data = [...state.products.values()];
        const active = url.searchParams.get("active");
        if (active !== null) data = data.filter((x) => x.active === (active === "true"));
        const ids = queryList(url.searchParams, "ids");
        if (ids.length) data = data.filter((x) => ids.includes(x.id));
        return send(200, { object: "list", url: "/v1/products", has_more: false, data });
      }
      if ((m = p.match(/^\/v1\/products\/([^/]+)$/))) {
        const prod = state.products.get(m[1]);
        if (!prod) return send(404, { error: { message: `No such product: '${m[1]}'`, code: "resource_missing" } });
        if (req.method === "POST") {
          if (form.name !== undefined) prod.name = form.name;
          if (form.active !== undefined) prod.active = form.active === "true";
          if (form.description !== undefined) prod.description = form.description;
          if (form.metadata !== undefined) prod.metadata = { ...prod.metadata, ...form.metadata };
        }
        return send(200, prod);
      }

      /* ── Prices (8.3) ───────────────────────────────────────────────── */
      if (req.method === "POST" && p === "/v1/prices") {
        if (!form.currency) return send(400, { error: { message: "Missing required param: currency.", code: "parameter_missing", param: "currency" } });
        if (!form.product) return send(400, { error: { message: "Missing required param: product.", code: "parameter_missing", param: "product" } });
        if (!state.products.has(form.product)) return send(400, { error: { message: `No such product: '${form.product}'`, code: "resource_missing", param: "product" } });
        if (form.lookup_key) {
          const clash = [...state.prices.values()].find((x) => x.lookup_key === form.lookup_key);
          if (clash) {
            if (form.transfer_lookup_key === "true") clash.lookup_key = null;
            else return send(400, { error: { message: `A price with lookup_key '${form.lookup_key}' already exists (${clash.id}). Pass transfer_lookup_key=true to move it.`, code: "resource_already_exists", param: "lookup_key" } });
          }
        }
        const id = mkId("price", state.prices.size + 1);
        const price = { id, object: "price", active: form.active === undefined ? true : form.active === "true",
          currency: form.currency, product: form.product,
          unit_amount: form.unit_amount === undefined ? null : Number(form.unit_amount),
          recurring: form.recurring ? { interval: form.recurring.interval, interval_count: Number(form.recurring.interval_count ?? 1) } : null,
          type: form.recurring ? "recurring" : "one_time", lookup_key: form.lookup_key ?? null,
          nickname: form.nickname ?? null, metadata: form.metadata ?? {}, created: nowSec() };
        state.prices.set(id, price); return send(200, price);
      }
      if (req.method === "GET" && p === "/v1/prices") {
        let data = [...state.prices.values()];
        const keys = queryList(url.searchParams, "lookup_keys");
        if (keys.length) data = data.filter((x) => x.lookup_key && keys.includes(x.lookup_key));
        const active = url.searchParams.get("active");
        if (active !== null) data = data.filter((x) => x.active === (active === "true"));
        const product = url.searchParams.get("product");
        if (product) data = data.filter((x) => x.product === product);
        return send(200, { object: "list", url: "/v1/prices", has_more: false, data });
      }
      if ((m = p.match(/^\/v1\/prices\/([^/]+)$/))) {
        const price = state.prices.get(m[1]);
        if (!price) return send(404, { error: { message: `No such price: '${m[1]}'`, code: "resource_missing" } });
        if (req.method === "POST") {
          if (form.active !== undefined) price.active = form.active === "true";
          if (form.nickname !== undefined) price.nickname = form.nickname;
          if (form.metadata !== undefined) price.metadata = { ...price.metadata, ...form.metadata };
          if (form.lookup_key !== undefined) {
            const clash = [...state.prices.values()].find((x) => x !== price && x.lookup_key === form.lookup_key);
            if (clash) {
              if (form.transfer_lookup_key === "true") clash.lookup_key = null;
              else return send(400, { error: { message: `A price with lookup_key '${form.lookup_key}' already exists (${clash.id}).`, code: "resource_already_exists", param: "lookup_key" } });
            }
            price.lookup_key = form.lookup_key || null;
          }
        }
        return send(200, price);
      }

      send(404, { error: { message: `unknown ${u}` } });
    });
  }

  let server = null;
  return {
    port, host, bearer, paymentIntentStatus: piStatus, idTag, state,
    /** Поднимает http-сервер; резолвится самим сервером (как startStripeMock тестов). */
    start() {
      if (server) return Promise.resolve(server);
      server = http.createServer(handler);
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve(server));
      });
    },
    stop() {
      if (!server) return Promise.resolve();
      const s = server; server = null;
      return new Promise((resolve) => { s.closeAllConnections?.(); s.close(() => resolve()); });
    },
    get server() { return server; },
  };
}

/* ── CLI ─────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const o = { verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--verbose" || a === "-v") o.verbose = true;
    else if (a === "--port") o.port = Number(argv[++i]);
    else if (a.startsWith("--port=")) o.port = Number(a.slice(7));
    else if (a === "--bearer") o.bearer = argv[++i];
    else if (a.startsWith("--bearer=")) o.bearer = a.slice(9);
    else if (a === "--pi-status") o.paymentIntentStatus = argv[++i];
    else if (a.startsWith("--pi-status=")) o.paymentIntentStatus = a.slice(12);
    else if (a === "--id-tag") o.idTag = argv[++i];
    else if (a.startsWith("--id-tag=")) o.idTag = a.slice(9);
    else if (a === "--help" || a === "-h") { o.help = true; }
    else { console.error(`stripe-mock: неизвестный аргумент ${a}`); process.exit(2); }
  }
  return o;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Мок Stripe REST для стенда биллинга.
  node tools/stripe-mock.mjs [--verbose] [--port N] [--bearer KEY] [--pi-status succeeded|requires_payment_method] [--id-tag МЕТКА]
  Переменные окружения: STRIPE_MOCK_PORT (${DEFAULT_PORT}), STRIPE_MOCK_SECRET_KEY (${DEFAULT_BEARER}), STRIPE_MOCK_PI_STATUS (${DEFAULT_PI_STATUS}), STRIPE_MOCK_ID_TAG (метка запуска в id; пустая — pi_1/cus_1).
  Серверу: STRIPE_SECRET_KEY=<тот же KEY>, STRIPE_API_BASE=http://127.0.0.1:<порт>.`);
    process.exit(0);
  }
  let mock;
  try { mock = createStripeMock(args); } catch (err) { console.error(`[stripe-mock] ${err.message}`); process.exit(2); }
  mock.start().then(() => {
    console.log(`[stripe-mock] слушает http://${mock.host}:${mock.port} · Bearer ${mock.bearer} · PaymentIntent → ${mock.paymentIntentStatus} · id вида pi_${mock.idTag ? mock.idTag + "_" : ""}N${args.verbose ? " · verbose" : ""}`);
    const bye = () => mock.stop().then(() => process.exit(0));
    process.on("SIGINT", bye); process.on("SIGTERM", bye);
  }, (err) => {
    console.error(`[stripe-mock] не поднялся на :${mock.port}: ${err.message}`);
    process.exit(1);
  });
}
