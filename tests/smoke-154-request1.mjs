/**
 * smoke-154-request1 — первый запрос беседы 15.4 (тарифы — админка
 * редакциями и согласие подписки с тарифом; Д-74, Д-75). Живая БД в процессе
 * (PG16), мок Stripe в процессе (tools/stripe-mock.mjs), HTTP — Hono
 * app.request без сетевого порта; браузер не нужен (вкладка «Тарифы» —
 * тестовый запрос 4 беседы).
 *
 *   A. Исходники и чистые функции: экономика одной функцией (plans.ts ≡
 *      plan-economics), validatePlanSpec/assertPlanEconomics, схема/миграция
 *      0016 (backfill family = name, unique(family, edition)), сид без
 *      updated, stripe-emit --price, клиент (вкладка, запертые поля,
 *      второй шаг, журнал plan.*), ApiErrorCode, 03 §4.3/§2.10, deploy/*,
 *      CSS-блок 15.4 без новых hex, ключи i18n с en/de.
 *   B. Живьём: GET/POST/PATCH /billing/admin/plans (401/403/200); новое
 *      семейство → Product (metadata) + Price (lookup_key); правка названия
 *      при живой подписке — да, квот — 409 PLAN_HAS_SUBSCRIPTIONS с
 *      lockedFields; is_active=true без Price → 400; новая редакция → строка
 *      -v2, Price редакции, прежняя закрыта, подписчик на прежней; GET
 *      /billing/plans без закрытых; вебхук с Price редакции 2 → plan_id, с
 *      неизвестным — предупреждение; после canceled — цена на месте: новый
 *      Price, прежний active=false; seedPlans на существующей строке — skip +
 *      diverged; admin_audit plan.created/updated/edition с актором.
 *
 * Запуск из корня:  node_modules/.bin/tsx tests/smoke-154-request1.mjs
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { Hono } from "hono";
import { createStripeMock } from "../tools/stripe-mock.mjs";
import { buildEvent } from "../tools/stripe-emit.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
const MOCK_PORT = 3870 + Math.floor(Math.random() * 20);
process.env.STRIPE_SECRET_KEY = "sk_test_smoke154";
process.env.STRIPE_API_BASE = `http://127.0.0.1:${MOCK_PORT}`;
process.env.STRIPE_WEBHOOK_SECRET = "";
process.env.NODE_ENV = "development";
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 900) : ""}`); }
}
const TAG = "s154-" + Math.random().toString(36).slice(2, 7);
const rd = (rel) => readFileSync(ROOT + rel, "utf8");
const strip = (src) => src.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

/* ── Модули в процессе ───────────────────────────────────────────────── */
const LOC = await import("../server/i18n/locale.ts");
LOC.installServerCatalogProvider();
const ECON = await import("../server/config/plan-economics.ts");
const PLANS = await import("../server/config/plans.ts");
const PA = await import("../server/services/plan-admin.ts");
const SS = await import("../server/services/subscription-service.ts");
const SEED = await import("../scripts/seed/seed-plans.ts");
const { billingRoutes } = await import("../server/routes/billing.ts");
const { authRoutes } = await import("../server/routes/auth.ts");
const { hashPassword } = await import("../server/middleware/auth.ts");
const { closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");

const mock = createStripeMock({ port: MOCK_PORT, bearer: "sk_test_smoke154", idTag: "s154", log: () => {} });
await mock.start();

const app = new Hono().route("/auth", authRoutes).route("/billing", billingRoutes);
const cookieOf = (r) => (r.headers.get("set-cookie") ?? "").match(/philosynth_session=[^;]+/)?.[0] ?? null;
const req = (method, path, body, cookie) =>
  app.request(path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : J(body) });
const get = (path, cookie) => app.request(path, { headers: cookie ? { cookie } : {} });

console.log("\n■ A. Исходники и чистые функции");
{
  ok(PLANS.assertPlanEconomics === ECON.assertPlanEconomics && PLANS.validatePlanSpec === ECON.validatePlanSpec && PLANS.PlanEconomicsError === ECON.PlanEconomicsError, "A1 plans.ts реэкспортирует экономику plan-economics — одна функция на сид и сервер");
  const pad = strip(rd("server/services/plan-admin.ts")), seedS = strip(rd("scripts/seed/seed-plans.ts"));
  ok(/assertPlanEconomics\(spec, env\.stripe\.billingMarkup\)/.test(pad) && /assertPlanEconomics\(plan, markup\)/.test(seedS) && !/cost-estimator/.test(pad + seedS), "A2 и plan-admin, и сид зовут assertPlanEconomics (не считают сами)");
  const bad = ECON.validatePlanSpec({ name: "Bad Name", displayName: "", priceUsd: 1.234, billingPeriod: "week", quotaSyntheses: -1, quotaRegenerations: 1.5, quotaModes: 0, quotaEnrichments: 0 });
  ok(["name", "displayName", "priceUsd", "billingPeriod", "quotaSyntheses", "quotaRegenerations"].every((f) => bad.some((i) => i.field === f)) && bad.length === 6, "A3 validatePlanSpec ловит имя, пустое название, цену, период, квоты", bad);
  let econErr = null;
  try { ECON.assertPlanEconomics({ ...PLANS.planByName("starter"), quotaSyntheses: 500 }, 1.2); } catch (e) { econErr = e; }
  ok(econErr instanceof ECON.PlanEconomicsError && /убыточен/.test(econErr.message) && econErr.markup === 1.2, "A4 assertPlanEconomics: убыточный тариф → PlanEconomicsError с наценкой");
  const schemaS = rd("server/db/schema.ts"), mig = rd("server/db/migrations/0016_plan_editions.sql");
  ok(/family: text\("family"\)\.notNull\(\)/.test(schemaS) && /edition: integer\("edition"\)\.notNull\(\)\.default\(1\)/.test(schemaS) && /uq_subscription_plans_family_edition/.test(schemaS), "A5 schema: family NOT NULL, edition default 1, unique(family, edition)");
  ok(mig.indexOf('ADD COLUMN "family" text;') < mig.indexOf('SET "family" = "name"') && mig.indexOf('SET "family" = "name"') < mig.indexOf('ALTER COLUMN "family" SET NOT NULL') && /DEFAULT 1 NOT NULL/.test(mig) && /CREATE UNIQUE INDEX "uq_subscription_plans_family_edition"/.test(mig), "A6 миграция 0016: ADD → backfill family = name → NOT NULL; edition; индекс");
  const journal = JSON.parse(rd("server/db/migrations/meta/_journal.json"));
  ok(journal.entries.length === 17 && journal.entries[16].tag === "0016_plan_editions", "A7 журнал миграций — 0016_plan_editions семнадцатой");
  ok(!/outcome: "updated"/.test(seedS) && !/\.update\(subscriptionPlans\)/.test(seedS) && /diverged: diffFields\(/.test(seedS) && /family: plan\.name,\s*edition: 1,/.test(seedS), "A8 сид: без updated, без UPDATE таблицы, diverged в отчёте, family/edition у созданной строки");
  ok(/created=0, skip=/.test(rd("tools/dev-billing.sh")) && !/created=0, updated=0/.test(rd("tools/dev-billing.sh")), "A9 dev-billing.sh ждёт «created=0, skip=» (без updated)");
  const emit = rd("tools/stripe-emit.mjs");
  const evt = buildEvent("customer.subscription.updated", "sub_x", { price: "price_y" });
  ok(/--price/.test(emit) && evt.data.object.items?.data?.[0]?.price?.id === "price_y" && buildEvent("customer.subscription.updated", "sub_x").data.object.items === undefined, "A10 stripe-emit --price кладёт items.data[0].price.id; без опции items нет");
  const wh = strip(rd("server/services/subscription-service.ts"));
  ok(/sub\.items\?\.data\?\.\[0\]\?\.price\?\.id/.test(wh) && /eq\(subscriptionPlans\.stripePriceId, priceId\)/.test(wh) && /family: p\.family,\s*edition: p\.edition,/.test(wh), "A11 вебхук читает Price события и ищет план по stripe_price_id; toPlanDto несёт family/edition");
  const br = rd("server/routes/billing.ts");
  ok(br.indexOf('billingRoutes.use("/admin/*", requireAdmin)') > br.indexOf('billingRoutes.use("*", requireAuth)') && ['get("/admin/plans"', 'post("/admin/plans"', 'patch("/admin/plans/:id"', 'post("/admin/plans/:id/editions"'].every((r) => br.includes(r)), "A12 четыре маршрута /billing/admin/* после requireAuth под requireAdmin");
  const page = rd("client/src/pages/AdminPromptsPage.tsx");
  ok(['data-testid="tab-plans"', "function PlansTab()", "data-locked={isLocked(", "editionStep.armed === true", '"plan.created"', '"plan.updated"', '"plan.edition"', '"plan.seeded"'].every((k) => page.includes(k)), "A13 клиент: вкладка «Тарифы», запертые поля, второй шаг редакции, подписи журнала plan.*");
  ok(/"PLAN_HAS_SUBSCRIPTIONS"/.test(rd("client/src/api/client.ts")) && ["listAdminPlans", "updatePlan", "createPlanEdition", "createPlan"].every((k) => new RegExp(`export function ${k}\\(`).test(rd("client/src/api/admin.ts"))), "A14 ApiErrorCode += PLAN_HAS_SUBSCRIPTIONS; api/admin — четыре вызова");
  const spec = rd("docs/03-specification.md"), dm = rd("docs/02-data-model.md");
  ok(/PLAN_HAS_SUBSCRIPTIONS/.test(spec) && /\/billing\/admin\/plans/.test(spec) && /family/.test(dm.slice(dm.indexOf("### 2.22"), dm.indexOf("### 2.23"))), "A15 03 §4.3/§2.10 и 02 §2.22 знают код, маршруты и family/edition");
  ok(["deploy/philosynth-termux.sh", "deploy/philosynth-ubuntu.sh", "deploy/philosynth-hosting.md", "README.md"].every((f) => /правятся админкой|правятся \*\*админкой\*\*/.test(rd(f))), "A16 deploy/* и README: абзац «тарифы после первого посева правятся админкой»");
  const css = rd("client/src/globals.css");
  const block = css.slice(css.indexOf("Беседа 15.4 — тарифы"), css.indexOf("@media (max-width: 600px)", css.indexOf("Беседа 15.4 — тарифы")));
  ok(block.length > 200 && !/#[0-9a-fA-F]{3,6}\b/.test(strip(block)) && /\.plan-form \{/.test(block) && /\.plan-field-row \{/.test(block), "A17 CSS-блок 15.4: без новых hex, .plan-form/.plan-field-row");
  const STR = JSON.parse(rd("packages/shared/i18n/strings.json")).strings;
  const keys = ["adminPromptsPage.tabPlans", "adminPromptsPage.planLockedHint", "adminPromptsPage.planEditionWarn", "server.services.planAdmin.hasSubscriptions", "server.services.planAdmin.economics", "server.services.planAdmin.activeNeedsPrice"];
  ok(keys.every((k) => STR[k]?.en && STR[k]?.de), "A18 ключи 15.4 в описи с en/de");
}

console.log("\n■ B. Живьём: маршруты, редакции, вебхук, сид");
const PW = "s154-password";
const userIds = [];
try {
  const [adm] = await sql`insert into users (email, password_hash, role) values (${TAG + "-admin@s.local"}, ${await hashPassword(PW)}, 'admin') returning id`;
  const [usr] = await sql`insert into users (email, password_hash) values (${TAG + "-user@s.local"}, ${await hashPassword(PW)}) returning id`;
  userIds.push(adm.id, usr.id);
  const ca = cookieOf(await req("POST", "/auth/login", { email: `${TAG}-admin@s.local`, password: PW }));
  const cu = cookieOf(await req("POST", "/auth/login", { email: `${TAG}-user@s.local`, password: PW }));
  ok(ca && cu, "B0 вход администратора и пользователя");
  // B1 доступ
  ok((await get("/billing/admin/plans")).status === 401 && (await get("/billing/admin/plans", cu)).status === 403 && (await get("/billing/admin/plans", ca)).status === 200, "B1 GET /billing/admin/plans: 401 гостю, 403 пользователю, 200 администратору");
  // B2 новое семейство
  const spec = { name: TAG, displayName: "Smoke 154", priceUsd: 19.99, billingPeriod: "month", quotaSyntheses: 3, quotaRegenerations: 5, quotaModes: 5, quotaEnrichments: 10 };
  const c1r = await req("POST", "/billing/admin/plans", spec, ca);
  const c1 = await c1r.json();
  ok(c1r.status === 201 && c1.plan?.family === TAG && c1.plan.edition === 1 && c1.plan.isActive && c1.plan.liveSubscriptions === 0 && /^price_/.test(c1.plan.stripePriceId), "B2a POST /billing/admin/plans → 201, редакция 1, открыт, Price", c1);
  const prod = [...mock.state.products.values()].find((p) => p.metadata?.philosynth_plan === TAG);
  const price1 = mock.state.prices.get(c1.plan.stripePriceId);
  ok(prod && price1?.lookup_key === `philosynth_${TAG}` && price1.unit_amount === 1999 && price1.product === prod.id && /^PhiloSynth/.test(prod.description) && !/[А-Яа-я]/.test(prod.description), "B2b мок: Product семейства по metadata, Price с lookup_key редакции, описание английское");
  const dup = await req("POST", "/billing/admin/plans", spec, ca);
  ok(dup.status === 400 && (await dup.json()).code === "VALIDATION_ERROR", "B2c повтор имени → 400 VALIDATION_ERROR");
  const lossy = await req("POST", "/billing/admin/plans", { ...spec, name: TAG + "-lossy", quotaSyntheses: 500 }, ca);
  const lossyJ = await lossy.json();
  ok(lossy.status === 400 && lossyJ.code === "VALIDATION_ERROR" && /убыточен/.test(lossyJ.details?.economics ?? ""), "B2d убыточный тариф → 400 с экономикой в details", lossyJ);
  ok(mock.state.prices.size === 1, "B2e отказанные тарифы Price в Stripe не завели");
  // B3 живая подписка (incomplete) — заслон
  const now = Date.now();
  const [sub] = await sql`insert into user_subscriptions (user_id, plan_id, stripe_subscription_id, status, current_period_start, current_period_end) values (${usr.id}, ${c1.plan.id}, ${"sub_" + TAG}, 'incomplete', ${new Date(now - 1000)}, ${new Date(now + 86400000)}) returning id`;
  const list = (await (await get("/billing/admin/plans", ca)).json()).plans;
  const row = list.find((p) => p.id === c1.plan.id);
  ok(row?.liveSubscriptions === 1 && list.every((p) => typeof p.family === "string" && typeof p.edition === "number"), "B3a список: живая подписка incomplete посчитана; family/edition у каждой строки");
  const q = await req("PATCH", `/billing/admin/plans/${c1.plan.id}`, { quotaSyntheses: 4, priceUsd: 19.99 }, ca);
  const qj = await q.json();
  ok(q.status === 409 && qj.code === "PLAN_HAS_SUBSCRIPTIONS" && J(qj.details?.lockedFields) === '["quotaSyntheses"]' && qj.details?.liveSubscriptions === 1, "B3b PATCH квот при живой подписке → 409 PLAN_HAS_SUBSCRIPTIONS, lockedFields только изменённые", qj);
  const nm = await req("PATCH", `/billing/admin/plans/${c1.plan.id}`, { displayName: "Smoke 154 R", isActive: false }, ca);
  const nmj = await nm.json();
  ok(nm.status === 200 && nmj.plan.displayName === "Smoke 154 R" && nmj.plan.isActive === false && nmj.plan.stripePriceId === c1.plan.stripePriceId, "B3c название и «открыт» правятся на месте при живой подписке; Price прежний", nmj);
  ok((await req("PATCH", `/billing/admin/plans/${c1.plan.id}`, { isActive: true }, ca)).status === 200, "B3d открыть обратно — можно (Price есть)");
  ok((await req("PATCH", "/billing/admin/plans/not-a-uuid", { displayName: "x" }, ca)).status === 400 && (await req("PATCH", "/billing/admin/plans/00000000-0000-4000-8000-000000000000", { displayName: "x" }, ca)).status === 404, "B3e PATCH: не UUID → 400, нет такого → 404");
  // B4 новая редакция
  const e2r = await req("POST", `/billing/admin/plans/${c1.plan.id}/editions`, { priceUsd: 24.99, quotaSyntheses: 4 }, ca);
  const e2 = await e2r.json();
  ok(e2r.status === 201 && e2.plan.name === `${TAG}-v2` && e2.plan.edition === 2 && e2.plan.family === TAG && e2.plan.isActive && e2.plan.quotaSyntheses === 4 && e2.plan.quotaEnrichments === 10 && Number(e2.plan.priceUsd) === 24.99, "B4a POST …/editions → 201: -v2, редакция 2, поля предзаполнены прежней", e2);
  ok(e2.previous?.id === c1.plan.id && e2.previous.isActive === false && e2.previous.liveSubscriptions === 1, "B4b previous — прежняя редакция закрыта, живые подписки отданы");
  const price2 = mock.state.prices.get(e2.plan.stripePriceId);
  ok(price2?.lookup_key === `philosynth_${TAG}-v2` && price2.unit_amount === 2499 && price2.product === prod.id && mock.state.prices.get(c1.plan.stripePriceId).active !== false, "B4c Price редакции 2 под тем же Product; Price прежней не выключен (по нему продлеваются)");
  const [subRow] = await sql`select plan_id from user_subscriptions where id=${sub.id}`;
  const [e1row] = await sql`select quota_syntheses, is_active from subscription_plans where id=${c1.plan.id}`;
  ok(subRow.plan_id === c1.plan.id && e1row.quota_syntheses === 3 && e1row.is_active === false, "B4d подписчик остался на редакции 1 с прежними квотами");
  const pub = (await (await get("/billing/plans")).json()).plans;
  ok(!pub.some((p) => p.id === c1.plan.id) && pub.some((p) => p.id === e2.plan.id), "B4e GET /billing/plans (BillingPage): закрытой редакции нет, открытая есть");
  const subFail = await req("POST", "/billing/subscribe", { planId: c1.plan.id }, cu);
  ok(subFail.status === 404, "B4f POST /subscribe на закрытую редакцию → 404");
  // B5 вебхук
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...a) => warns.push(a.join(" "));
  const whU = await req("POST", "/billing/webhook", buildEvent("customer.subscription.updated", "sub_" + TAG, { price: "price_unknown_" + TAG }));
  const whUj = await whU.json();
  const [afterU] = await sql`select plan_id from user_subscriptions where id=${sub.id}`;
  ok(whU.status === 200 && whUj.handled && whUj.action === "updated" && afterU.plan_id === c1.plan.id && warns.some((w) => w.includes("price_unknown_" + TAG)), "B5a вебхук с неизвестным Price: plan_id на месте, предупреждение в журнал", { whUj, warns });
  const wh2 = await req("POST", "/billing/webhook", buildEvent("customer.subscription.updated", "sub_" + TAG, { price: e2.plan.stripePriceId }));
  const wh2j = await wh2.json();
  const [after2] = await sql`select plan_id, status from user_subscriptions where id=${sub.id}`;
  console.warn = origWarn;
  ok(wh2.status === 200 && wh2j.action === "updated_plan" && after2.plan_id === e2.plan.id && after2.status === "active", "B5b вебхук с Price редакции 2 → plan_id перенесён (Д-75 п.2)", wh2j);
  const wh3 = await req("POST", "/billing/webhook", buildEvent("customer.subscription.updated", "sub_" + TAG, { status: "past_due" }));
  const [after3] = await sql`select plan_id, status from user_subscriptions where id=${sub.id}`;
  ok(wh3.status === 200 && after3.plan_id === e2.plan.id && after3.status === "past_due", "B5c вебхук без items — статус обновлён, plan_id не тронут");
  // B6 после canceled — цена на месте
  await sql`update user_subscriptions set status='canceled' where id=${sub.id}`;
  const pr = await req("PATCH", `/billing/admin/plans/${e2.plan.id}`, { priceUsd: 29.99 }, ca);
  const prj = await pr.json();
  const p3 = mock.state.prices.get(prj.plan?.stripePriceId);
  ok(pr.status === 200 && prj.plan.stripePriceId !== e2.plan.stripePriceId && prj.retiredPriceId === e2.plan.stripePriceId && Number(prj.plan.priceUsd) === 29.99 && mock.state.prices.get(e2.plan.stripePriceId).active === false && p3?.lookup_key === `philosynth_${TAG}-v2` && p3.unit_amount === 2999, "B6a без живых подписок цена правится на месте: новый Price, lookup_key переехал, прежний active=false", prj);
  const per = await req("PATCH", `/billing/admin/plans/${e2.plan.id}`, { billingPeriod: "year", priceUsd: 299.99 }, ca);
  const perj = await per.json();
  ok(per.status === 200 && perj.plan.billingPeriod === "year" && mock.state.prices.get(perj.plan.stripePriceId)?.recurring?.interval === "year", "B6b смена периода → Price с interval=year");
  // B7 сид не переписывает
  const [st0] = await sql`select id, quota_syntheses, is_active, display_name from subscription_plans where name='starter'`;
  if (st0) {
    // квота меньше (больше — убыточно при цене starter) и другое название
    const sr = await SEED.seedPlans({ envSource: {}, markup: 1.2, plans: [{ ...PLANS.planByName("starter"), displayName: st0.display_name + " X", quotaSyntheses: Math.max(0, st0.quota_syntheses - 1) }] });
    const [st1] = await sql`select quota_syntheses, is_active, display_name from subscription_plans where id=${st0.id}`;
    ok(sr.counts.skip === 1 && sr.results[0].diverged?.some((d) => d.field === "quotaSyntheses" && d.inDb === String(st0.quota_syntheses)) && sr.results[0].diverged.some((d) => d.field === "displayName") && sr.divergedCount === 1 && st1.quota_syntheses === st0.quota_syntheses && st1.display_name === st0.display_name, "B7a seedPlans на существующем starter с другими квотами/названием → skip + diverged, строка цела", sr.results[0]);
    const sr2 = await SEED.seedPlans({ envSource: {}, markup: 1.2, plans: [PLANS.planByName("starter")] });
    ok(sr2.counts.skip === 1 && sr2.divergedCount === (st0.quota_syntheses === PLANS.planByName("starter").quotaSyntheses && st0.display_name === "Starter" ? 0 : 1) && !("updated" in sr2.counts), "B7b повтор с plans.ts как есть — skip; исхода updated нет");
  } else {
    ok(false, "B7 starter не посеян — npm run seed:plans");
  }
  const sr3 = await SEED.seedPlans({ envSource: {}, markup: 1.2, plans: [{ ...PLANS.planByName("pro"), name: "starter", quotaSyntheses: 500 }] });
  ok(sr3.counts.fail === 1 && /убыточен/.test(sr3.results[0].error ?? ""), "B7c убыточное описание → fail той же функцией экономики");
  // B8 след
  const audit = await sql`select action, actor_id, target_id, details from admin_audit where target_id like ${TAG + "%"} order by created_at`;
  const by = (a) => audit.filter((r) => r.action === a);
  ok(by("plan.created").length === 1 && by("plan.updated").length === 4 && by("plan.edition").length === 1 && audit.every((r) => r.actor_id === adm.id), `B8a admin_audit: plan.created ×1, plan.updated ×4, plan.edition ×1, актор — администратор (${audit.map((r) => r.action).join(",")})`);
  ok(by("plan.edition")[0]?.details?.previousName === TAG && by("plan.edition")[0].details.edition === 2 && by("plan.updated").some((r) => r.details?.changed?.priceUsd?.to === 29.99 && r.details.previousPriceId), "B8b details: у редакции — прежнее имя и номер, у смены цены — changed и previousPriceId");
  const bad = mock.state.requests.filter((r) => !/^\/v1\/(products|prices)/.test(r.url));
  ok(bad.length === 0, "B8c в мок ходили только за Product/Price", bad.map((r) => r.url));
} finally {
  await sql`delete from user_subscriptions where user_id in ${sql(userIds)}`.catch(() => {});
  await sql`delete from admin_audit where target_id like ${TAG + "%"}`;
  await sql`delete from subscription_plans where family like ${TAG + "%"}`;
  if (userIds.length) await sql`delete from users where id in ${sql(userIds)}`;
  await sql.end();
  await mock.stop();
  await closeDb();
  await closeRedis();
}
console.log(`\nИтог: ${passed} ✓, ${failed} ✗${failed ? "\n  " + fails.join("\n  ") : ""}`);
process.exit(failed ? 1 : 0);
