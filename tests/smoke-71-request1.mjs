/**
 * Смоук беседы 7.1 (запрос 1; без сервера, БД и браузера):
 *  - миграция 0003: SET NULL для created_by ×3 и type_catalog_id ×2,
 *    users.stripe_customer_id (колонка + unique), журнал/снапшот;
 *  - schema.ts: onDelete set null там же; stripeCustomerId у users;
 *  - subscription-service.ensureStripeCustomer, createTopup/createSubscription
 *    на нём; stripe-client.createPaymentIntent с customer;
 *  - prompt-registry.listVersions/listConfigVersions — с телами/value;
 *    client/api/prompts без обхода ?prefix=;
 *  - element-taxonomy.updateCustomType/deleteCustomType + PATCH/DELETE роуты
 *    под requireAdmin; client/api/taxonomy ×2; вкладка «Каталоги»;
 *  - element-editor.createCategoryEdge + POST /:id/edges; shared
 *    EdgeCreateInput; client createEdge; EdgeCreateForm/GraphModal/NodePanel;
 *  - SynthesisForm: гейт файловых концепций снят, importFile + attachSynthesisId;
 *  - routes/syntheses: estimateSynthesisCost общий для /estimate и гейта POST;
 *    GenerateSynthesisOptions.estimatedCostUsd → слот;
 *  - account-deletion + DELETE /auth/me; auth-store.deleteAccount; ProfilePage;
 *  - typecheck:scripts включён в корневой typecheck; smoke-1.4b без
 *    кросс-мирового статического импорта.
 * Запуск: node_modules/.bin/tsx tests/smoke-71-request1.mjs
 */
import { readFileSync, readdirSync } from "node:fs";

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`, extra === undefined ? "" : JSON.stringify(extra)); }
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const has = (src, re) => (re instanceof RegExp ? re.test(src) : src.includes(re));

console.log("── 1. Миграция 0003 и схема ──");
const migDir = readdirSync(new URL("../server/db/migrations", import.meta.url));
const mig = migDir.find((f) => f.startsWith("0003_"));
check("файл миграции 0003 есть", !!mig, migDir);
const migSql = read(`server/db/migrations/${mig}`);
for (const t of ["prompt_templates", "category_type_catalog", "relationship_type_catalog"])
  check(`${t}.created_by → ON DELETE set null`, new RegExp(`"${t}_created_by_users_id_fk"[^;]*ON DELETE set null`).test(migSql));
check("categories.type_catalog_id → set null", /categories_type_catalog_id_category_type_catalog_id_fk"[^;]*ON DELETE set null/.test(migSql));
check("category_edges.type_catalog_id → set null", /category_edges_type_catalog_id_relationship_type_catalog_id_fk"[^;]*ON DELETE set null/.test(migSql));
check("users.stripe_customer_id + UNIQUE", has(migSql, 'ADD COLUMN "stripe_customer_id" text') && has(migSql, "users_stripe_customer_id_unique"));
check("synthesis_configs НЕ трогается (created_by у неё нет — ошибка доков 6.2)", !has(migSql, "synthesis_configs"));
const journal = JSON.parse(read("server/db/migrations/meta/_journal.json"));
check("журнал: idx 3 = тег файла", journal.entries[3]?.idx === 3 && journal.entries[3].tag === mig.replace(/\.sql$/, ""));
check("снапшот 0003", migDir.includes("meta") && readdirSync(new URL("../server/db/migrations/meta", import.meta.url)).includes("0003_snapshot.json"));
const schemaSrc = read("server/db/schema.ts");
check("schema: stripeCustomerId unique", /stripeCustomerId: text\("stripe_customer_id"\)\.unique\(\)/.test(schemaSrc));
check("schema: created_by set null ×3", (schemaSrc.match(/created_by"\)\.references\(\(\) => users\.id, \{\s*onDelete: "set null",\s*\}\)/g) ?? []).length === 3);
check("schema: type_catalog_id set null ×2", (schemaSrc.match(/type_catalog_id"\)\.references\(\s*\(\) => (categoryTypeCatalog|relationshipTypeCatalog)\.id,\s*\{ onDelete: "set null" \},/g) ?? []).length === 2);
const subSrc = read("server/services/subscription-service.ts");
check("ensureStripeCustomer экспортирован и пишет условным UPDATE", /export async function ensureStripeCustomer/.test(subSrc) && /IS NULL/.test(subSrc));
check("createSubscription через ensureStripeCustomer", /const customerId = await ensureStripeCustomer\(userId\);\s*const sub = await stripe\.createSubscription\(\{\s*customerId,/.test(subSrc));
const billSrc = read("server/services/billing-service.ts");
check("createTopup через ensureStripeCustomer + customerId в PaymentIntent", /ensureStripeCustomer\(userId\);\s*pi = await stripe\.createPaymentIntent\(\{[^}]*customerId,/.test(billSrc));
check("stripe-client: customer в payment_intents", /customerId \? \{ customer: params\.customerId \}/.test(read("server/services/stripe-client.ts")));

console.log("── 2. Prompt Registry: тела в /versions ──");
const regSrc = read("server/services/prompt-registry.ts");
check("listVersions отдаёт body", /export async function listVersions[\s\S]*?body: r\.body,[\s\S]*?\n\}/.test(regSrc));
check("listConfigVersions отдаёт value", /export async function listConfigVersions[\s\S]*?value: r\.value,/.test(regSrc));
check("shared: PromptVersion = PromptTemplate, ConfigVersion = SynthesisConfig", /export type PromptVersion = PromptTemplate;/.test(read("packages/shared/types/prompts.ts")) && /export type ConfigVersion = SynthesisConfig;/.test(read("packages/shared/types/prompts.ts")));
const apiP = read("client/src/api/prompts.ts");
const apiPCode = apiP.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
check("client/api/prompts: обход ?prefix= снят (в коде, не в комментариях)", !/prefix: key, activeOnly: false/.test(apiPCode) && !/listConfigs\(false\)/.test(apiPCode));
check("getTemplateVersions/getConfigVersionsFull делегируют /versions", /return getVersions\(key\);/.test(apiP) && /return getConfigVersions\(key\);/.test(apiP));

console.log("── 3. Каталоги типов ──");
const taxSvc = read("server/services/element-taxonomy.ts");
check("updateCustomType/deleteCustomType/TaxonomyAccessError", ["export async function updateCustomType", "export async function deleteCustomType", "export class TaxonomyAccessError"].every((s) => taxSvc.includes(s)));
check("is_system → FORBIDDEN", /row\.isSystem[\s\S]*?"FORBIDDEN"/.test(taxSvc));
check("удаление считает unlinked по typeCatalogId", /count\(\)[\s\S]*?eq\(categories\.typeCatalogId, id\)/.test(taxSvc) && /eq\(categoryEdges\.typeCatalogId, id\)/.test(taxSvc));
const taxRoutes = read("server/routes/taxonomy.ts");
for (const [m, p] of [["patch", "category-types/:id"], ["delete", "category-types/:id"], ["patch", "relationship-types/:id"], ["delete", "relationship-types/:id"]])
  check(`${m.toUpperCase()} /taxonomy/${p} под requireAdmin`, new RegExp(`taxonomyRoutes\\.${m}\\("/${p.replace("/", "\\/")}", requireAuth, requireAdmin`).test(taxRoutes));
check("403/404 маппинг TaxonomyAccessError", /err\.code === "FORBIDDEN" \? 403 : 404/.test(taxRoutes));
const apiT = read("client/src/api/taxonomy.ts");
check("client/api/taxonomy: updateCustomType + deleteCustomType (PATCH/DELETE)", /export function updateCustomType[\s\S]*?method: "PATCH"/.test(apiT) && /export function deleteCustomType[\s\S]*?method: "DELETE"/.test(apiT));
const adminSrc = read("client/src/pages/AdminPromptsPage.tsx");
check("AdminPromptsPage: вкладка «Каталоги» + CatalogTable ×2", /data-testid="tab-catalogs"/.test(adminSrc) && /<CatalogTable kind="category" \/>/.test(adminSrc) && /<CatalogTable kind="relationship" \/>/.test(adminSrc));
check("системные типы без кнопок правки", /\{!t\.isSystem && \(/.test(adminSrc));
check("литералы классов вне JSX (originClass/tabClass)", /function originClass\(system: boolean\): string/.test(adminSrc));

console.log("── 4. Связи: POST /edges ──");
const edSrc = read("server/services/element-editor.ts");
check("createCategoryEdge экспортирован", /export async function createCategoryEdge/.test(edSrc));
check("концы — категории синтеза (inArray + synthesisId)", /eq\(categories\.synthesisId, synthesisId\),\s*inArray\(categories\.id, \[sourceId!, targetId!\]\)/.test(edSrc));
check("совпадение концов только у рефлексивной", /sourceId === targetId && direction !== "рефлексивная"/.test(edSrc));
check("position = max+1, sourceOrigin manual", /position: \(last\?\.position \?\? -1\) \+ 1,\s*sourceOrigin: "manual"/.test(edSrc));
check("has_reflexive пересчитывается при рефлексивной", /direction === "рефлексивная"\s*\? await recomputeReflexive/.test(edSrc));
const elRoutes = read("server/routes/elements.ts");
check("POST /:id/edges → 201 под ownerEditGate", /elementsRoutes\.post\("\/:id\/edges", requireAuth[\s\S]*?ownerEditGate[\s\S]*?createCategoryEdge\(id, await readJson\(c\)\);\s*return c\.json\(result, 201\)/.test(elRoutes));
check("shared EdgeCreateInput extends EdgeUpdateInput", /export interface EdgeCreateInput extends EdgeUpdateInput \{\s*sourceId: string;\s*targetId: string;/.test(read("packages/shared/types/elements.ts")));
check("client createEdge → POST /edges", /export function createEdge[\s\S]*?apiPost<CreateEdgeResponse>\(`\$\{base\(synthesisId\)\}\/edges`, body\)/.test(read("client/src/api/elements.ts")));
const { buildEdgeCreateBody, EMPTY_EDGE_DRAFT } = await import("../client/src/components/edit/EdgeCreateForm.tsx");
const body = buildEdgeCreateBody("s1", "t1", { ...EMPTY_EDGE_DRAFT, edgeType: " диалектическая ", typeCatalogId: "c1" });
check("buildEdgeCreateBody: концы, дефолты, trim типа, typeCatalogId", body.sourceId === "s1" && body.targetId === "t1" && body.strength === 0.5 && body.innovationDegree === 1 && body.edgeType === "диалектическая" && body.typeCatalogId === "c1" && body.direction === "однонаправленная");
const body2 = buildEdgeCreateBody("s", "t", EMPTY_EDGE_DRAFT);
check("пустой тип/каталог не отправляются", !("edgeType" in body2) && !("typeCatalogId" in body2));
const gm = read("client/src/components/graph/GraphModal.tsx");
check("GraphModal: «+ Связь» в тулбаре + EdgeCreateForm + onAddEdge узла", /data-testid="gm-add-edge-btn"/.test(gm) && /<EdgeCreateForm/.test(gm) && /onAddEdge=\{/.test(gm));
check("NodePanel: onAddEdge", /onAddEdge\?: \(\(\) => void\) \| undefined;/.test(read("client/src/components/graph/NodePanel.tsx")));
check("SaveOutcome.version необязателен", /version\?: ElementMutationMeta\["version"\] \| undefined;/.test(read("client/src/components/edit/ElementEditor.tsx")));

console.log("── 5. Форма: авто-импорт файловых концепций ──");
const formSrc = read("client/src/components/synthesis/SynthesisForm.tsx");
check("гейт «Файловые концепции пока не поддержаны» снят", !/Файловые концепции пока не поддержаны/.test(formSrc));
check("importFile + attachSynthesisId при сабмите", /importFile\(file\)/.test(formSrc) && /attachSynthesisId\(entry\.id, res\.id\)/.test(formSrc));
check("buildInput читает свежий стор", /usePoolStore\s*\.getState\(\)\s*\.conceptParticipants\.filter\(\(p\) => p\.synthesisId\)/.test(formSrc));
check("ошибка импорта останавливает сабмит", /Импорт файловой концепции «" \+ entry\.name \+ "» не удался/.test(formSrc));
check("pool-store.attachSynthesisId", /attachSynthesisId: \(id, synthesisId\) =>/.test(read("client/src/stores/pool-store.ts")));

console.log("── 6. Биллинг: точный гейт и удаление аккаунта ──");
const synRoutes = read("server/routes/syntheses.ts");
check("estimateSynthesisCost вынесен и зовётся из /estimate и POST", (synRoutes.match(/estimateSynthesisCost\(user\.id, \{/g) ?? []).length === 2 && /async function estimateSynthesisCost\(/.test(synRoutes));
check("гейт только для balance+enforced, сверка resolveBilling(estimatedCostUsd)", /billingCtx\?\.billingMode === "balance" && billingCtx\.enforced/.test(synRoutes) && /resolveBilling\(user\.id, \{\s*quota: "syntheses",\s*estimatedCostUsd: estimatedChargeUsd,\s*consume: false,/.test(synRoutes));
check("оценка → слот (estimatedCostUsd в generateSynthesis)", /generateSynthesis\(synthesisId, user\.id, \{\s*sectionContexts,\s*estimatedCostUsd: estimatedChargeUsd,/.test(synRoutes));
const genSrc = read("server/services/generation-service.ts");
check("GenerateSynthesisOptions.estimatedCostUsd → withGenerationSlot", /estimatedCostUsd\?: number \| undefined;/.test(genSrc) && /\{ quota: "syntheses", estimatedCostUsd: opts\.estimatedCostUsd \}/.test(genSrc));
check("hasActiveGenerationForUser экспортирован", /export function hasActiveGenerationForUser/.test(genSrc));
const accSrc = read("server/services/account-deletion.ts");
check("account-deletion: анонимизация, не DELETE users", /update\(users\)[\s\S]*?email: anonymizedEmail,[\s\S]*?stripeCustomerId: null,/.test(accSrc) && !/delete\(users\)/.test(accSrc));
check("удаляет синтезы/ключи/сессии, подписки → canceled", /delete\(syntheses\)/.test(accSrc) && /delete\(apiKeys\)/.test(accSrc) && /delete\(sessions\)/.test(accSrc) && /status: "canceled"/.test(accSrc));
check("активная генерация → GENERATION_IN_PROGRESS", /hasActiveGenerationForUser\(userId\)[\s\S]*?"GENERATION_IN_PROGRESS"/.test(accSrc));
const authRoutes = read("server/routes/auth.ts");
check("DELETE /auth/me: пароль → 401 единым ответом, clearSessionCookie", /authRoutes\.delete\("\/me", requireAuth[\s\S]*?"AUTH_REQUIRED" \}, 401\)[\s\S]*?deleteAccount\(user\.id\);\s*clearSessionCookie\(c\);/.test(authRoutes));
check("409 при GENERATION_IN_PROGRESS", /err\.code === "GENERATION_IN_PROGRESS" \? 409 : 404/.test(authRoutes));
check("auth-store.deleteAccount (DELETE, skipUnauthorizedHandler)", /async deleteAccount\(password\)[\s\S]*?method: "DELETE"[\s\S]*?skipUnauthorizedHandler: true/.test(read("client/src/stores/auth-store.ts")));
check("ProfilePage: секция удаления с confirm", /data-testid="delete-account-form"/.test(read("client/src/pages/ProfilePage.tsx")) && /window\.confirm\(/.test(read("client/src/pages/ProfilePage.tsx")));

console.log("── 7. Инструменты ──");
const pkg = JSON.parse(read("package.json"));
check("typecheck включает typecheck:scripts", /typecheck:scripts/.test(pkg.scripts.typecheck));
check("smoke-1.4b: клиентский импорт — путь переменной", /const pauseModalPath = /.test(read("tests/smoke-1.4b.mts")));
for (const f of ["scripts/test-31-requests2-4.ts", "scripts/smoke-31.ts"])
  check(`${f}: synthLevel из enum схемы, status из enum`, !/synthLevel: "integrative"/.test(read(f)) && !/status: "created"/.test(read(f)));

console.log(`\nИТОГ: ${n - failed}/${n} ✓${failed ? `, ${failed} ✗` : ""}`);
process.exit(failed ? 1 : 0);
