/**
 * Смоук беседы 8.3 (запрос 1; без сервера, БД и браузера — мок Stripe 8.2
 * поднимается процессом смоука для stripe-create-prices):
 *  - server/config/plans.ts: три тарифа без stripe_price_id, имена env-
 *    переменных и lookup_key, опорные стоимости выводятся из констант
 *    cost-estimator (не вписаны числами), assertPlanEconomics: все три
 *    проходят при BILLING_MARKUP=1.2 и падают при ×3; убыточный план →
 *    PlanEconomicsError с объяснением; валидность описания (79.99 не
 *    ловится как «не две цифры»);
 *  - stripe-client: createProduct / listProducts / createPrice / updatePrice
 *    / listPrices; query lookup_keys[0]=… (та запись, что понимает мок);
 *  - stripe-create-prices против tools/stripe-mock.mjs: первый запуск
 *    создаёт Product+Price ×3, второй находит по lookup_key (skip ×3) и не
 *    создаёт дубликатов; расхождение цены → fail; --transfer → новая цена,
 *    ключ переехал, прежняя inactive; envLines → STRIPE_PRICE_*; пустой
 *    ключ → StripeError STRIPE_UNAVAILABLE до запроса (счётчик мока не растёт);
 *  - seed-plans (текст, без БД): STRIPE_PRICE_* из envSource, без переменной
 *    is_active=false + предупреждение, заслон живых подписок (≠ canceled),
 *    admin_audit plan.seeded в транзакции, экспорт seedPlans без запуска main;
 *  - ADMIN_ACTIONS ↔ union AdminAction; target_type subscription_plan;
 *  - package.json seed:plans / stripe:create-prices; .env.example и
 *    .env.local.example с STRIPE_PRICE_*; termux-скрипт зовёт seed:plans;
 *    dev-billing.sh зовёт seed:plans при наличии скрипта;
 *  - доки после patch-docs-conv83 (02 §2.22, 03 §2.10, 04, 05, README).
 * Запуск: STRIPE_SECRET_KEY=sk_test_mock STRIPE_API_BASE=http://127.0.0.1:3893 \
 *           node_modules/.bin/tsx tests/smoke-83-request1.mjs
 *   (env — до импорта: env.ts читается один раз; смоук сам проверяет, что
 *    переменные заданы, и поднимает мок на STRIPE_API_BASE)
 */
import { readFileSync } from "node:fs";

import { createStripeMock } from "../tools/stripe-mock.mjs";

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`, extra === undefined ? "" : JSON.stringify(extra)); }
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const API_BASE = process.env.STRIPE_API_BASE ?? "";
const KEY = process.env.STRIPE_SECRET_KEY ?? "";
const portMatch = /^http:\/\/127\.0\.0\.1:(\d+)$/.exec(API_BASE);
if (!portMatch || !KEY) {
  console.error("Задайте STRIPE_SECRET_KEY=sk_test_mock STRIPE_API_BASE=http://127.0.0.1:<port> ДО запуска (env.ts читается при импорте)");
  process.exit(2);
}
const mock = createStripeMock({ port: Number(portMatch[1]), bearer: KEY, idTag: "s83" });
await mock.start();

try {
  console.log("── 1. plans.ts ──");
  const plans = await import("../server/config/plans.ts");
  check("PLAN_NAMES = starter/pro/academic", JSON.stringify(plans.PLAN_NAMES) === '["starter","pro","academic"]');
  check("PLANS — три описания, имена совпадают с PLAN_NAMES", plans.PLANS.length === 3 && plans.PLANS.every((p, i) => p.name === plans.PLAN_NAMES[i]));
  check("у описания НЕТ stripe_price_id", plans.PLANS.every((p) => !("stripePriceId" in p) && !("stripe_price_id" in p)));
  check("PLANS заморожен", Object.isFrozen(plans.PLANS));
  check("priceEnvVarFor('starter') = STRIPE_PRICE_STARTER", plans.priceEnvVarFor("starter") === "STRIPE_PRICE_STARTER" && plans.priceEnvVarFor("academic") === "STRIPE_PRICE_ACADEMIC");
  check("stripeLookupKeyFor('pro') = philosynth_pro", plans.stripeLookupKeyFor("pro") === "philosynth_pro");
  check("описания валидны", plans.PLANS.every((p) => plans.validatePlanDefinition(p).length === 0), plans.PLANS.map((p) => plans.validatePlanDefinition(p)));
  check("79.99 не ловится как «не две цифры» (плавающая точка)", plans.validatePlanDefinition({ ...plans.PLANS[0], priceUsd: 79.99 }).length === 0);
  check("цена с тремя знаками → невалидна", plans.validatePlanDefinition({ ...plans.PLANS[0], priceUsd: 9.999 }).length === 1);
  const ref = plans.REFERENCE_OPERATION_COST_USD;
  check("опорные стоимости положительны и упорядочены synthesis > regeneration > mode > enrichment",
    ref.synthesis > ref.regeneration && ref.regeneration > ref.mode && ref.mode > ref.enrichment && ref.enrichment > 0, ref);
  check("синтез в опорной модели — порядка $1–3 (7.1: шесть разделов дороже $1)", ref.synthesis > 1 && ref.synthesis < 3, ref.synthesis);
  const plansSrc = read("server/config/plans.ts");
  check("константы оценщика импортируются, не вписаны", /from "\.\.\/services\/cost-estimator\.js"/.test(plansSrc) && ["CHARS_PER_TOKEN", "PRICE_IN", "PRICE_OUT", "SECTION_OUTPUT_MULT", "OUTPUT_MULTIPLIER", "mw"].every((k) => plansSrc.includes(k)));
  check("CONTEXT_BUDGET из fragment-share", /import \{ CONTEXT_BUDGET \} from "\.\/fragment-share\.js"/.test(plansSrc));
  check("в комментариях нет закрывающего «звёздочка-слеш» посреди текста", !/\/\*\*[^]*?used_\*\/quota/.test(plansSrc));
  const at12 = plans.PLANS.map((p) => plans.computePlanEconomics(p, 1.2));
  check("все три тарифа окупают квоты при BILLING_MARKUP=1.2", at12.every((e) => e.ok), at12.map((e) => e.marginUsd));
  check("запас при 1.2 не отрицателен и не нулевой", at12.every((e) => e.marginUsd > 0));
  const at3 = plans.PLANS.map((p) => plans.computePlanEconomics(p, 3));
  check("при BILLING_MARKUP=3 тарифы убыточны — проверка реагирует на наценку", at3.every((e) => !e.ok));
  let econErr = null;
  try { plans.assertPlanEconomics({ ...plans.PLANS[0], quotaSyntheses: 1000 }, 1.2); } catch (e) { econErr = e; }
  check("убыточный план → PlanEconomicsError с объяснением", econErr instanceof plans.PlanEconomicsError && /убыточен/.test(econErr.message) && /BILLING_MARKUP 1\.2/.test(econErr.message) && econErr.economics.ok === false);
  let markupErr = null;
  try { plans.computePlanEconomics(plans.PLANS[0], 0); } catch (e) { markupErr = e; }
  check("наценка ≤ 0 → RangeError", markupErr instanceof RangeError);
  check("breakdown суммируется в quotaCostUsd", Math.abs(Object.values(at12[0].breakdown).reduce((s, b) => s + b.costUsd, 0) - at12[0].quotaCostUsd) < 1e-9);

  console.log("── 2. stripe-client: Products / Prices ──");
  const sc = await import("../server/services/stripe-client.ts");
  for (const fn of ["createProduct", "listProducts", "createPrice", "updatePrice", "listPrices"])
    check(`stripe.${fn} — функция`, typeof sc.stripe[fn] === "function");
  check("старые шесть вызовов на месте", ["createPaymentIntent", "retrievePaymentIntent", "createCustomer", "createSubscription", "retrieveSubscription", "updateSubscription"].every((f) => typeof sc.stripe[f] === "function"));
  const before = mock.state.requests.length;
  const prod = await sc.stripe.createProduct({ name: "Smoke product", metadata: { philosynth_plan: "smoke" } });
  check("createProduct → prod_…", /^prod_/.test(prod.id) && prod.object === "product" && prod.metadata.philosynth_plan === "smoke");
  const price = await sc.stripe.createPrice({ productId: prod.id, unitAmountCents: 999, interval: "month", lookupKey: "smoke_key", nickname: "Smoke" });
  check("createPrice → recurring month, lookup_key, 999 центов", price.object === "price" && price.recurring?.interval === "month" && price.lookup_key === "smoke_key" && price.unit_amount === 999);
  const priceReq = mock.state.requests.find((r) => r.url === "/v1/prices" && r.method === "POST" && r.form?.lookup_key === "smoke_key");
  check("форма createPrice: recurring[interval]=month, recurring[interval_count]=1", priceReq?.form?.recurring?.interval === "month" && String(priceReq?.form?.recurring?.interval_count) === "1", priceReq?.form);
  const listed = await sc.stripe.listPrices({ lookupKeys: ["smoke_key"] });
  check("listPrices по lookup_keys — список Stripe с одной ценой", listed.object === "list" && listed.data.length === 1 && listed.data[0].id === price.id);
  const listReq = mock.state.requests.find((r) => r.method === "GET" && /^\/v1\/prices\?/.test(r.url) && /lookup_keys/.test(r.url));
  check("GET-запрос кодирует lookup_keys[0]=smoke_key", !!listReq && /lookup_keys%5B0%5D=smoke_key|lookup_keys\[0\]=smoke_key/.test(listReq.url), listReq?.url);
  const products = await sc.stripe.listProducts({ active: true });
  check("listProducts active → содержит созданный", products.data.some((p) => p.id === prod.id));
  const deact = await sc.stripe.updatePrice(price.id, { active: false });
  check("updatePrice active=false", deact.active === false);
  let dup = null;
  try { await sc.stripe.createPrice({ productId: prod.id, unitAmountCents: 1, interval: "month", lookupKey: "smoke_key" }); } catch (e) { dup = e; }
  check("дубликат lookup_key → StripeError STRIPE_ERROR 400 resource_already_exists", dup instanceof sc.StripeError && dup.code === "STRIPE_ERROR" && dup.status === 400 && dup.stripeCode === "resource_already_exists");
  check("все запросы ушли с Bearer ключа", mock.state.requests.slice(before).every((r) => r.auth === `Bearer ${KEY}`));

  console.log("── 3. stripe-create-prices против мока ──");
  const scp = await import("../scripts/stripe-create-prices.ts");
  check("экспорт createPrices/envLines/priceMatchesPlan/priceCents", ["createPrices", "envLines", "priceMatchesPlan", "priceCents"].every((k) => typeof scp[k] === "function"));
  check("main не запустился при импорте (продуктов только smoke)", mock.state.products.size === 1);
  check("priceCents(9.99) = 999, (79.99) = 7999", scp.priceCents(plans.PLANS[0]) === 999 && scp.priceCents(plans.PLANS[2]) === 7999);
  const r1 = await scp.createPrices();
  check("первый запуск: created ×3", r1.counts.created === 3 && r1.counts.skip === 0 && r1.counts.fail === 0, r1.counts);
  check("три продукта с metadata.philosynth_plan и три цены с lookup_key philosynth_*",
    [...mock.state.products.values()].filter((p) => /^(starter|pro|academic)$/.test(p.metadata?.philosynth_plan)).length === 3 &&
    [...mock.state.prices.values()].filter((p) => /^philosynth_(starter|pro|academic)$/.test(p.lookup_key)).length === 3);
  const starterPrice = [...mock.state.prices.values()].find((p) => p.lookup_key === "philosynth_starter");
  check("цена starter: 999 центов, usd, month", starterPrice?.unit_amount === 999 && starterPrice.currency === "usd" && starterPrice.recurring?.interval === "month");
  const lines1 = scp.envLines(r1);
  check("envLines → три строки STRIPE_PRICE_*=price_…", lines1.length === 3 && lines1.every((l) => /^STRIPE_PRICE_(STARTER|PRO|ACADEMIC)=price_/.test(l)), lines1);
  const pricesAfter1 = mock.state.prices.size, productsAfter1 = mock.state.products.size;
  const r2 = await scp.createPrices();
  check("второй запуск: skip ×3, те же id", r2.counts.skip === 3 && r2.counts.created === 0 && JSON.stringify(scp.envLines(r2)) === JSON.stringify(lines1), r2.results);
  check("дубликатов не создано", mock.state.prices.size === pricesAfter1 && mock.state.products.size === productsAfter1);
  const changed = plans.PLANS.map((p) => (p.name === "pro" ? { ...p, priceUsd: 34.99 } : p));
  const r3 = await scp.createPrices({ plans: changed });
  check("цена расходится с plans.ts → fail с подсказкой --transfer, остальные skip", r3.counts.fail === 1 && r3.counts.skip === 2 && /--transfer/.test(r3.results.find((r) => r.name === "pro").error), r3.results);
  check("без --transfer ничего не создано", mock.state.prices.size === pricesAfter1);
  const oldPro = [...mock.state.prices.values()].find((p) => p.lookup_key === "philosynth_pro");
  const r4 = await scp.createPrices({ plans: changed, transfer: true });
  const proRes = r4.results.find((r) => r.name === "pro");
  check("--transfer: created у pro, replacedPriceId = прежняя", proRes?.outcome === "created" && proRes.replacedPriceId === oldPro.id && proRes.priceId !== oldPro.id, proRes);
  const newPro = mock.state.prices.get(proRes.priceId);
  check("lookup_key переехал на новую цену, прежняя inactive без ключа", newPro?.lookup_key === "philosynth_pro" && newPro.unit_amount === 3499 && mock.state.prices.get(oldPro.id).active === false && mock.state.prices.get(oldPro.id).lookup_key === null);
  check("новая цена — на том же продукте", newPro.product === oldPro.product);
  const r5 = await scp.createPrices({ plans: changed, transfer: true });
  check("повтор с --transfer после переезда → skip ×3", r5.counts.skip === 3, r5.counts);
  const scpSrc = read("scripts/stripe-create-prices.ts");
  check("пустой ключ проверяется до первого запроса (isStripeConfigured в main)", /if \(!isStripeConfigured\(\)\)[\s\S]*process\.exitCode = 1;\s*return;/.test(scpSrc));
  check("скрипт не импортирует db", !/server\/db\//.test(scpSrc));
  check("npm-скрипт stripe:create-prices упомянут в отказе", /npm run stripe:create-prices/.test(scpSrc));

  console.log("── 4. seed-plans (текст) ──");
  const seedSrc = read("scripts/seed-plans.ts");
  const seedCode = stripComments(seedSrc);
  const seedMod = await import("../scripts/seed-plans.ts");
  check("экспорт seedPlans/printReport; main не запустился при импорте", typeof seedMod.seedPlans === "function" && typeof seedMod.printReport === "function");
  check("STRIPE_PRICE_* через priceEnvVarFor из envSource (не env.ts)", /envSource\[envVar\]/.test(seedCode) && /priceEnvVarFor\(plan\.name\)/.test(seedCode) && !/env\.STRIPE_PRICE/.test(seedCode));
  check("без переменной → isActive=false, сохранённый price не затирается", /const isActive = !priceMissing;/.test(seedCode) && /priceMissing \? existing\?\.stripePriceId \?\? "" : priceFromEnv/.test(seedCode));
  check("громкое предупреждение с именами переменных", /ВНИМАНИЕ/.test(seedSrc) && /не задана → план/.test(seedSrc) && /stripe:create-prices/.test(seedSrc));
  check("четыре исхода created/updated/skip/fail", ['outcome: "created"', 'outcome: "updated"', 'outcome: "skip"', 'outcome: "fail"'].every((s) => seedCode.includes(s)));
  check("заслон: живые подписки = статус ≠ canceled", /ne\(userSubscriptions\.status, "canceled"\)/.test(seedCode) && /сменить Price у живой подписки нельзя/.test(seedSrc));
  check("заслон только при смене непустого stripe_price_id", /changed\.includes\("stripePriceId"\) && existing\.stripePriceId !== ""/.test(seedCode));
  check("экономика: assertPlanEconomics до записи, наценка из env.stripe.billingMarkup", /assertPlanEconomics\(plan, markup\)/.test(seedCode) && /env\.stripe\.billingMarkup/.test(seedCode));
  check("admin_audit plan.seeded в транзакции с записью (created и updated)", (seedCode.match(/ADMIN_ACTIONS\.PLAN_SEEDED/g) ?? []).length === 2 && /db\.transaction\(async \(tx\) => \{[\s\S]*tx\.insert\(subscriptionPlans\)[\s\S]*writeAudit\(tx,/.test(seedCode));
  check("skip строки журнала не пишет", /if \(changed\.length === 0\) \{\s*return \{ \.\.\.base, outcome: "skip"/.test(seedCode));
  check("closeDb в finally прямого запуска", /\.finally\(\(\) => closeDb\(\)\)/.test(seedCode));

  console.log("── 5. Журнал: ADMIN_ACTIONS ↔ shared ──");
  const aa = await import("../server/services/admin-audit.ts");
  check("ADMIN_ACTIONS.PLAN_SEEDED = plan.seeded", aa.ADMIN_ACTIONS.PLAN_SEEDED === "plan.seeded" && aa.isAdminAction("plan.seeded"));
  const adminTypes = read("packages/shared/types/admin.ts");
  const union = [...adminTypes.matchAll(/^\s*\| "([a-z.]+)"/gm)].map((m) => m[1]);
  check("union AdminAction содержит plan.seeded и ровно значения ADMIN_ACTIONS", union.filter((v) => v.includes(".")).sort().join() === [...aa.ADMIN_ACTION_VALUES].sort().join(), union);
  check("AdminAuditTargetType += subscription_plan", /\| "subscription_plan";/.test(adminTypes));

  console.log("── 6. Обвязка ──");
  const pkg = JSON.parse(read("package.json"));
  check("npm seed:plans → tsx scripts/seed-plans.ts", pkg.scripts["seed:plans"] === "tsx scripts/seed-plans.ts");
  check("npm stripe:create-prices", pkg.scripts["stripe:create-prices"] === "tsx scripts/stripe-create-prices.ts");
  const envEx = read(".env.example");
  check(".env.example: STRIPE_PRICE_STARTER/PRO/ACADEMIC пустые", ["STRIPE_PRICE_STARTER=", "STRIPE_PRICE_PRO=", "STRIPE_PRICE_ACADEMIC="].every((s) => new RegExp(`^${s}$`, "m").test(envEx)));
  const envLocal = read(".env.local.example");
  check(".env.local.example на месте, STRIPE_PRICE_*=price_mock_*, ключ мока, publishable пуст", /^STRIPE_PRICE_STARTER=price_mock_starter$/m.test(envLocal) && /^STRIPE_SECRET_KEY=sk_test_mock$/m.test(envLocal) && /^VITE_STRIPE_PUBLISHABLE_KEY=$/m.test(envLocal) && /^STRIPE_API_BASE=http:\/\/127\.0\.0\.1:3866$/m.test(envLocal));
  check(".env.local.example: BILLING_ENFORCE=true", /^BILLING_ENFORCE=true$/m.test(envLocal));
  const termux = read("scripts/philosynth-termux.sh");
  check("termux-скрипт зовёт seed:plans вместо предупреждения", /npm run seed:plans/.test(termux) && !/не сеется ничем — страница подписок будет пустой/.test(termux));
  check("dev-billing.sh зовёт seed:plans при наличии скрипта", /seed:plans/.test(read("tools/dev-billing.sh")));

  console.log("── 7. Документация (patch-docs-conv83) ──");
  const d02 = read("docs/02-data-model.md");
  check("02 §2.22: откуда строки (seed-plans, STRIPE_PRICE_, заслон)", /8\.3 \(2026-09-09\) — откуда берутся строки/.test(d02) && /is_active=false/.test(d02) && /Σ quota × себестоимость/.test(d02));
  check("02 §2.29: plan.seeded / subscription_plan", /account\.deleted, plan\.seeded/.test(d02) && /'subscription_plan'/.test(d02));
  const d03 = read("docs/03-specification.md");
  check("03 §2.10: GET /billing/plans пустой → { plans: [] }", /→ 200 \{ plans: \[\] \}, НЕ ошибка/.test(d03));
  check("04 §4: строка plans.ts / seed-plans / stripe-create-prices", /`server\/config\/plans\.ts`, `scripts\/seed-plans\.ts`, `scripts\/stripe-create-prices\.ts` \| НОВОЕ \(8\.3\)/.test(read("docs/04-code-reuse-map.md")));
  const d05 = read("docs/05-file-structure.md");
  check("05: plans.ts, seed-plans.ts, stripe-create-prices.ts, STRIPE_PRICE_*", ["plans.ts                   # 8.3", "seed-plans.ts                   # 8.3", "stripe-create-prices.ts         # 8.3", "STRIPE_PRICE_*=price_mock_*"].every((s) => d05.includes(s)));
  const readme = read("README.md");
  check("README: «Как поднять биллинг» из четырёх шагов", /## Как поднять биллинг/.test(readme) && /1\. \*\*Ключи Stripe/.test(readme) && /4\. \*\*`npm run seed:plans`/.test(readme));
  check("README: seed:plans в быстром старте; порядок 8.2/8.3 исправлен", /^npm run seed:plans/m.test(readme) && /8\.2 — локальный стенд биллинга/.test(readme) && !/8\.2 — посев тарифов/.test(readme));
} finally {
  console.log(`\nИТОГ: ${n - failed} ✓ / ${failed} ✗ из ${n}`);
  await mock.stop();
  process.exit(failed ? 1 : 0);
}
