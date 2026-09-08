/**
 * Смоук беседы 8.1 (запрос 1; без сервера, БД и браузера):
 *  - shared/constants/auth.ts: правила едины — routes/auth.ts, bootstrap-admin,
 *    RegisterPage берут константы оттуда, локальных копий не осталось;
 *  - миграция 0004_admin_audit: таблица, FK SET NULL, два индекса, тег в
 *    журнале переименован (не *_strange_*), снапшот на месте;
 *  - schema.adminAudit; shared/types/admin.ts ↔ ADMIN_ACTIONS (замороженный,
 *    9 действий, ровно те же строки);
 *  - точки записи: prompt-registry (4 функции, writeAudit ВНУТРИ tx, актор
 *    активации — параметр, роуты передают user.id), element-taxonomy
 *    (update/delete в транзакциях), routes/auth (смена роли под advisory-lock),
 *    account-deletion (LAST_ADMIN дважды, account.deleted, actor_id → NULL);
 *  - роуты GET /users, POST /users/:id/role, GET /audit под requireAdmin;
 *    коды в client/api/client.ts; client/api/admin.ts ×3; вкладка «Доступ»;
 *  - bootstrap-admin: readBootstrapEnv — нет пароля/короткий/невалидный
 *    email → отказ; валидный набор → ok; npm-скрипт seed:admin;
 *  - 03 §4.3 / 02 §2.29 / 05 после патча conv81.
 * Запуск: node_modules/.bin/tsx tests/smoke-81-request1.mjs
 */
import { readFileSync, readdirSync } from "node:fs";

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`, extra === undefined ? "" : JSON.stringify(extra)); }
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

console.log("── 1. Единый свод правил аккаунта ──");
const authConst = await import("../packages/shared/constants/auth.ts");
check("PASSWORD_MIN_LENGTH = 8", authConst.PASSWORD_MIN_LENGTH === 8);
check("EMAIL_RE — RegExp", authConst.EMAIL_RE instanceof RegExp && authConst.EMAIL_RE.test("a@b.co"));
check("DISPLAY_NAME_MAX_LENGTH = 100", authConst.DISPLAY_NAME_MAX_LENGTH === 100);
const routesAuth = read("server/routes/auth.ts");
const routesAuthCode = stripComments(routesAuth);
check("routes/auth импортирует правила из shared", /from "@philosynth\/shared\/constants\/auth"/.test(routesAuth));
check("routes/auth: локальной const PASSWORD_MIN_LENGTH нет", !/const PASSWORD_MIN_LENGTH\s*=/.test(routesAuthCode));
check("routes/auth: локальной const EMAIL_RE нет", !/const EMAIL_RE\s*=/.test(routesAuthCode));
check("RegisterPage берёт PASSWORD_MIN_LENGTH из shared", /constants\/auth"/.test(read("client/src/pages/RegisterPage.tsx")));

console.log("── 2. Миграция 0004 и схема ──");
const migDir = readdirSync(new URL("../server/db/migrations", import.meta.url));
check("файл 0004_admin_audit.sql", migDir.includes("0004_admin_audit.sql"), migDir);
check("случайного тега drizzle-kit не осталось", !migDir.some((f) => /^0004_/.test(f) && f !== "0004_admin_audit.sql"));
const journal = JSON.parse(read("server/db/migrations/meta/_journal.json"));
const e4 = journal.entries.find((e) => e.idx === 4);
check("журнал: idx 4 → tag 0004_admin_audit", e4?.tag === "0004_admin_audit", e4);
check("снапшот 0004 на месте", readdirSync(new URL("../server/db/migrations/meta", import.meta.url)).includes("0004_snapshot.json"));
const sql = read("server/db/migrations/0004_admin_audit.sql");
check("CREATE TABLE admin_audit", /CREATE TABLE "admin_audit"/.test(sql));
for (const col of ["actor_id\" uuid", "action\" text NOT NULL", "target_type\" text NOT NULL", "target_id\" text", "details\" jsonb DEFAULT '{}'::jsonb NOT NULL", "ip\" text", "created_at\" timestamp with time zone DEFAULT now() NOT NULL"])
  check(`колонка ${col.split('"')[0]}`, sql.includes(`"${col}`));
check("FK actor_id → users ON DELETE set null", /admin_audit_actor_id_users_id_fk"[^;]*REFERENCES "public"\."users"\("id"\) ON DELETE set null/.test(sql));
check("индекс по actor_id", /idx_admin_audit_actor"[^;]*\("actor_id"\)/.test(sql));
check("индекс по created_at", /idx_admin_audit_created"[^;]*\("created_at"\)/.test(sql));
const schema = read("server/db/schema.ts");
check("schema.ts: adminAudit", /export const adminAudit = pgTable\(\s*"admin_audit"/.test(schema));
check("schema.ts: actorId set null", /actorId: uuid\("actor_id"\)\.references\(\(\) => users\.id, \{ onDelete: "set null" \}\)/.test(schema));
const s3 = JSON.parse(read("server/db/migrations/meta/0003_snapshot.json"));
check("снапшот 0003 без admin_audit (нет дрейфа)", !("public.admin_audit" in s3.tables));

console.log("── 3. ADMIN_ACTIONS ↔ shared/types/admin ──");
const audit = await import("../server/services/admin-audit.ts");
check("ADMIN_ACTIONS заморожен", Object.isFrozen(audit.ADMIN_ACTIONS));
const expected = [
  "prompt.version.created", "prompt.version.activated", "config.version.created", "config.version.activated",
  "taxonomy.type.updated", "taxonomy.type.deleted", "user.role.changed", "user.bootstrapped", "account.deleted",
];
check("9 действий из текста запроса", JSON.stringify([...audit.ADMIN_ACTION_VALUES].sort()) === JSON.stringify([...expected].sort()), audit.ADMIN_ACTION_VALUES);
const adminTypes = read("packages/shared/types/admin.ts");
const unionVals = [...adminTypes.slice(adminTypes.indexOf("export type AdminAction")).split(";")[0].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
check("union AdminAction ≡ ADMIN_ACTIONS", JSON.stringify(unionVals.sort()) === JSON.stringify([...expected].sort()), unionVals);
check("isAdminAction", audit.isAdminAction("user.role.changed") && !audit.isAdminAction("user.deleted"));
check("ADMIN_SET_LOCK_KEY — целое", Number.isInteger(audit.ADMIN_SET_LOCK_KEY));
check("clientIpOf: X-Forwarded-For первый адрес", audit.clientIpOf({ req: { header: (h) => (h === "x-forwarded-for" ? "10.0.0.1, 10.0.0.2" : undefined) } }) === "10.0.0.1");
check("audit.mts: пара adminAudit ↔ AdminAuditEntry", /adminAudit".*AdminAuditEntry/.test(read("server/audit.mts")));

console.log("── 4. Точки записи ──");
const reg = read("server/services/prompt-registry.ts");
check("prompt-registry импортирует writeAudit", /import \{ ADMIN_ACTIONS, writeAudit \} from "\.\/admin-audit\.js"/.test(reg));
const fnBody = (src, name) => { const i = src.indexOf(`export async function ${name}(`); const j = src.indexOf("\nexport ", i + 1); return src.slice(i, j < 0 ? undefined : j); };
for (const [fn, action] of [["createVersion", "PROMPT_VERSION_CREATED"], ["activateVersion", "PROMPT_VERSION_ACTIVATED"], ["createConfigVersion", "CONFIG_VERSION_CREATED"], ["activateConfigVersion", "CONFIG_VERSION_ACTIVATED"]]) {
  const b = fnBody(reg, fn);
  check(`${fn}: writeAudit(tx, …) внутри db.transaction`, b.indexOf("writeAudit(tx") > b.indexOf("db.transaction(") && b.indexOf("writeAudit(tx") < b.lastIndexOf("});") && b.includes(`ADMIN_ACTIONS.${action}`));
}
check("activateVersion принимает actorId", /export async function activateVersion\([\s\S]*?actorId: string \| null = null/.test(reg));
check("activateConfigVersion принимает actorId", /export async function activateConfigVersion\([\s\S]*?actorId: string \| null = null/.test(reg));
const rp = read("server/routes/prompts.ts");
check("routes/prompts: activateVersion(key, version, user.id)", /activateVersion\(key, version, c\.get\("user"\)\.id\)/.test(rp));
check("routes/prompts: createConfigVersion(…, user.id)", /createConfigVersion\(key, body\.value, description, c\.get\("user"\)\.id\)/.test(rp));
check("routes/prompts: activateConfigVersion(…, user.id)", /activateConfigVersion\(key, version, c\.get\("user"\)\.id\)/.test(rp));
const tax = read("server/services/element-taxonomy.ts");
for (const fn of ["updateCustomType", "deleteCustomType"]) {
  const b = fnBody(tax, fn);
  check(`${fn}: транзакция + writeAudit`, b.includes("db.transaction(") && b.includes("writeAudit(") && /actorId: string \| null = null/.test(b));
}
const rt = read("server/routes/taxonomy.ts");
check("routes/taxonomy передаёт актора ×4", (rt.match(/c\.get\("user"\)\.id,?\s*\)/g) ?? []).length >= 4);
const ad = read("server/services/account-deletion.ts");
check("account-deletion: код LAST_ADMIN", /"GENERATION_IN_PROGRESS" \| "NOT_FOUND" \| "LAST_ADMIN"/.test(ad));
check("account-deletion: заслон ДО отмены подписки", ad.indexOf("assertNotLastAdmin(db, u.role)") < ad.indexOf("cancelSubscription(userId)"));
check("account-deletion: заслон в транзакции под advisory-lock", /db\.transaction\(async \(tx\) => \{\s*\/\/[^\n]*\n\s*await tx\.execute\(sql`select pg_advisory_xact_lock\(\$\{ADMIN_SET_LOCK_KEY\}\)`\);[\s\S]*assertNotLastAdmin\(tx, fresh\.role\)/.test(ad));
check("account-deletion: account.deleted + actor_id → NULL", ad.includes("ADMIN_ACTIONS.ACCOUNT_DELETED") && /update\(adminAudit\)\.set\(\{ actorId: null \}\)\.where\(eq\(adminAudit\.actorId, userId\)\)/.test(ad));
check("routes/auth: LAST_ADMIN → 409 у DELETE /me", /err\.code === "LAST_ADMIN" \? 409/.test(routesAuth));

console.log("── 5. Роуты управления доступом ──");
check("GET /users под requireAuth+requireAdmin", /authRoutes\.get\("\/users", requireAuth, requireAdmin/.test(routesAuth));
check("POST /users/:id/role под requireAuth+requireAdmin", /authRoutes\.post\("\/users\/:id\/role", requireAuth, requireAdmin/.test(routesAuth));
check("GET /audit под requireAuth+requireAdmin", /authRoutes\.get\("\/audit", requireAuth, requireAdmin/.test(routesAuth));
const roleRoute = routesAuth.slice(routesAuth.indexOf('authRoutes.post("/users/:id/role"'), routesAuth.indexOf('authRoutes.get("/audit"'));
check("role: VALIDATION_ERROR с details.role", /code: "VALIDATION_ERROR",\s*details: \{ role:/.test(roleRoute));
check("role: 404 при не-UUID и не найден", (roleRoute.match(/code: "NOT_FOUND" \}, 404\)/g) ?? []).length === 2);
check("role: SELF_ROLE_CHANGE до транзакции", roleRoute.indexOf('"SELF_ROLE_CHANGE"') < roleRoute.indexOf("db.transaction("));
check("role: advisory-lock + FOR UPDATE", roleRoute.includes("pg_advisory_xact_lock") && roleRoute.includes('.for("update")'));
check("role: LAST_ADMIN 409", /code: "LAST_ADMIN",\s*\},\s*409/.test(roleRoute));
check("role: writeAudit user.role.changed {from,to} в tx", /writeAudit\(tx, \{[\s\S]*USER_ROLE_CHANGED[\s\S]*details: \{ from: target\.role, to: role/.test(roleRoute));
check("users: анонимизированные исключены", routesAuth.includes('"deleted-%@deleted.invalid"') && routesAuth.includes("notLike(schema.users.email"));

console.log("── 6. Клиент ──");
const cl = read("client/src/api/client.ts");
check("ApiErrorCode += LAST_ADMIN", /\| "LAST_ADMIN"/.test(cl));
check("ApiErrorCode += SELF_ROLE_CHANGE", /\| "SELF_ROLE_CHANGE"/.test(cl));
const apiAdmin = read("client/src/api/admin.ts");
check("api/admin: listUsers → /auth/users", /export function listUsers[\s\S]*"\/auth\/users"/.test(apiAdmin));
check("api/admin: setUserRole → POST /auth/users/:id/role", /export function setUserRole[\s\S]*\/role`, \{ role \}/.test(apiAdmin));
check("api/admin: getAuditLog → /auth/audit", /export function getAuditLog[\s\S]*"\/auth\/audit"/.test(apiAdmin));
const page = read("client/src/pages/AdminPromptsPage.tsx");
check("вкладка «Доступ» (tab-access)", page.includes('data-testid="tab-access"') && page.includes("Доступ"));
check("AccessTab: поиск, роль с confirm, журнал 50", page.includes("function AccessTab") && page.includes("window.confirm") && /AUDIT_LIMIT = 50/.test(page) && page.includes('data-testid="access-search"'));
check("AccessTab: статус ПОСЛЕ перечитывания (грабля 6.2)", /await Promise\.all\(\[loadUsers\(search\.trim\(\)\), loadAudit\(\)\]\);\s*setStatus/.test(page));
check("AccessTab: своя строка без кнопки", /\{!isMe && \(/.test(page));
check("AccessTab: литералы классов вне JSX (roleClass)", /function roleClass\(role: UserRole\)/.test(page));

console.log("── 7. bootstrap-admin ──");
const boot = await import("../scripts/bootstrap-admin.ts");
const bad1 = boot.readBootstrapEnv({ BOOTSTRAP_ADMIN_EMAIL: "a@b.co" });
check("нет пароля → отказ с внятным текстом", !bad1.ok && bad1.errors.some((e) => /BOOTSTRAP_ADMIN_PASSWORD не задан/.test(e)), bad1);
const bad2 = boot.readBootstrapEnv({ BOOTSTRAP_ADMIN_EMAIL: "a@b.co", BOOTSTRAP_ADMIN_PASSWORD: "short" });
check("короткий пароль → та же формулировка, что у register", !bad2.ok && bad2.errors.some((e) => e.includes(authConst.PASSWORD_TOO_SHORT_MESSAGE)), bad2);
const bad3 = boot.readBootstrapEnv({ BOOTSTRAP_ADMIN_EMAIL: "not-an-email", BOOTSTRAP_ADMIN_PASSWORD: "longenough1" });
check("невалидный email → отказ", !bad3.ok && bad3.errors.some((e) => /невалидный email/.test(e)));
const bad4 = boot.readBootstrapEnv({ BOOTSTRAP_ADMIN_PASSWORD: "longenough1" });
check("нет email → отказ", !bad4.ok && bad4.errors.some((e) => /BOOTSTRAP_ADMIN_EMAIL не задан/.test(e)));
const ok1 = boot.readBootstrapEnv({ BOOTSTRAP_ADMIN_EMAIL: " Admin@Example.org ", BOOTSTRAP_ADMIN_PASSWORD: "longenough1", BOOTSTRAP_ADMIN_NAME: "  " });
check("валидно: email trim+lowercase, пустое имя → undefined", ok1.ok && ok1.value.email === "admin@example.org" && ok1.value.displayName === undefined, ok1);
const bootSrc = read("scripts/bootstrap-admin.ts");
check("bootstrap: пароль не из argv", !/process\.argv\.\w*\[?\d?\]?.*password/i.test(stripComments(bootSrc)) && bootSrc.includes("BOOTSTRAP_ADMIN_PASSWORD"));
check("bootstrap: hashPassword из middleware/auth", /import \{ hashPassword \} from "\.\.\/server\/middleware\/auth\.js"/.test(bootSrc));
check("bootstrap: заслон «другой админ» → fail с подсказкой POST /auth/users/:id/role", /outcome: "fail"[\s\S]*POST \/auth\/users\/:id\/role/.test(bootSrc));
check("bootstrap: skip / updated / created", ['outcome: "skip"', 'outcome: "updated"', 'outcome: "created"'].every((s) => bootSrc.includes(s)));
check("bootstrap: user.bootstrapped, source bootstrap, actor = сам", (bootSrc.match(/USER_BOOTSTRAPPED/g) ?? []).length === 2 && bootSrc.includes('source: "bootstrap"') && /actorId: id,[\s\S]*targetId: id,/.test(bootSrc));
check("bootstrap: 23505 через err.cause.code", /e\.cause\?\.code === "23505"/.test(bootSrc));
check("bootstrap: advisory-lock", bootSrc.includes("pg_advisory_xact_lock(${ADMIN_SET_LOCK_KEY})"));
const pkg = JSON.parse(read("package.json"));
check("npm-скрипт seed:admin рядом с seed:*", pkg.scripts["seed:admin"] === "tsx scripts/bootstrap-admin.ts" && Object.keys(pkg.scripts).indexOf("seed:admin") === Object.keys(pkg.scripts).indexOf("seed:taxonomy") + 1);

console.log("── 8. Документация ──");
const d03 = read("docs/03-specification.md");
check("03 §4.3: LAST_ADMIN и SELF_ROLE_CHANGE", /^LAST_ADMIN\s+—/m.test(d03) && /^SELF_ROLE_CHANGE\s+—/m.test(d03));
check("03 §2.1: три эндпоинта доступа", d03.includes("GET    /auth/users") && d03.includes("POST   /auth/users/:id/role") && d03.includes("GET    /auth/audit"));
check("02 §2.29 admin_audit", /### 2\.29\. admin_audit/.test(read("docs/02-data-model.md")));
const d05 = read("docs/05-file-structure.md");
check("05: admin-audit.ts, bootstrap-admin.ts, api/admin.ts, types/admin.ts, constants/auth.ts", ["admin-audit.ts", "bootstrap-admin.ts", "admin.ts                # 8.1: listUsers", "admin.ts                # 8.1: AdminAction", "auth.ts                 # 8.1: PASSWORD_MIN_LENGTH"].every((s) => d05.includes(s)));

console.log(`\nИТОГ: ${n - failed} ✓ / ${failed} ✗ из ${n}`);
process.exit(failed ? 1 : 0);
