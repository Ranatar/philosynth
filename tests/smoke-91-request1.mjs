/**
 * Смоук беседы 9.1 (запрос 1; без сервера, сети и браузера; БД — только в
 * разделе 5, и тот пропускается, если PostgreSQL недоступен):
 *  1. env.ts: MAIL_TRANSPORT, умолчания, production с пустым SMTP_HOST /
 *     MAIL_FROM → отказ при импорте с внятным текстом (дочерние процессы —
 *     env читается один раз, 09 §5); .env.example и сторож dotfiles;
 *  2. миграция 0006_mail (тег переименован, снапшот, CHECK, индексы) и schema;
 *  3. mail/transport (console-формат, classifySendError — два рода отказа,
 *     EAUTH/CONN временные), mail/templates (два письма, текст+HTML, без
 *     внешних ресурсов и отписки), mail/worker.decideRetry (шесть попыток);
 *  4. auth-tokens: довод ≠ хэш, сроки 72/1, ссылки на клиентские маршруты;
 *     routes/auth: четыре маршрута, транзакция регистрации, все сессии при
 *     сбросе, единый ответ, TOKEN_INVALID одним кодом; account-deletion;
 *     index.ts: запуск и остановка работника;
 *  5. ЖИВАЯ БД: enqueue в транзакции (откат уносит письмо), точка сохранения
 *     (сбой постановки не губит внешнюю транзакцию), issue/consume
 *     (однократность, прежние гасятся, срок), processOutbox с разъёмом send:
 *     sent / постоянный → failed без повторов / временный → attempts и
 *     next_attempt_at, шестая попытка → failed;
 *  6. клиент: маршруты, страницы, ссылка, полоса, стор, код ошибки;
 *  7. README и доки после patch-docs-conv91.
 * Запуск из корня: node_modules/.bin/tsx tests/smoke-91-request1.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`, extra === undefined ? "" : JSON.stringify(extra)); }
}
const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
// строчные комментарии первыми (09 §3, 8.4)
const strip = (s) => s.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

console.log("── 1. Окружение ──");
function envProbe(vars) {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME ?? "", ...vars };
  const r = spawnSync(process.execPath, ["--import", "tsx", "-e",
    'import("./server/env.ts").then(m => console.log(JSON.stringify(m.env.mail)))'],
    { cwd: new URL(".", ROOT).pathname, env, encoding: "utf8" });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr };
}
{
  const dev = envProbe({});
  const mail = dev.code === 0 ? JSON.parse(dev.out) : null;
  check("вне production умолчание — 'console'", mail?.transport === "console", dev.err.slice(0, 300));
  check("PUBLIC_BASE_URL по умолчанию = CLIENT_ORIGIN, без хвостового /", mail?.publicBaseUrl === "http://localhost:5173");
  check("задержки повторов: 1 мин, 5, 15, 60, 6 ч", JSON.stringify(mail?.retryDelaysMs) === "[60000,300000,900000,3600000,21600000]");
  const custom = envProbe({ PUBLIC_BASE_URL: "https://ps.example.org/", CLIENT_ORIGIN: "http://x" });
  check("PUBLIC_BASE_URL берётся из окружения", custom.code === 0 && JSON.parse(custom.out).publicBaseUrl === "https://ps.example.org");
  const emptyBase = envProbe({ PUBLIC_BASE_URL: "", CLIENT_ORIGIN: "http://localhost:5199" });
  check("ПУСТОЙ PUBLIC_BASE_URL → CLIENT_ORIGIN (не ссылки без узла)", emptyBase.code === 0 && JSON.parse(emptyBase.out).publicBaseUrl === "http://localhost:5199");
  const prodBase = { NODE_ENV: "production", DATABASE_URL: "postgres://u:p@h/db", REDIS_URL: "redis://h" };
  const prod = envProbe(prodBase);
  check("production + пустой SMTP_HOST → отказ при импорте", prod.code !== 0 && /SMTP_HOST/.test(prod.err) && /не запускается/.test(prod.err), prod.err.slice(0, 200));
  const prodConsole = envProbe({ ...prodBase, MAIL_TRANSPORT: "console" });
  check("…и MAIL_TRANSPORT=console в production его не спасает", prodConsole.code !== 0 && /SMTP_HOST/.test(prodConsole.err));
  const prodNoFrom = envProbe({ ...prodBase, SMTP_HOST: "smtp.example.org" });
  check("production без MAIL_FROM → отказ", prodNoFrom.code !== 0 && /MAIL_FROM/.test(prodNoFrom.err));
  const prodOk = envProbe({ ...prodBase, SMTP_HOST: "smtp.example.org", MAIL_FROM: "PS <a@example.org>" });
  check("production с SMTP_HOST и MAIL_FROM стартует, транспорт 'smtp'", prodOk.code === 0 && JSON.parse(prodOk.out).transport === "smtp", prodOk.err.slice(0, 200));
  const smtpNoHost = envProbe({ MAIL_TRANSPORT: "smtp" });
  check("MAIL_TRANSPORT=smtp без SMTP_HOST → отказ и вне production", smtpNoHost.code !== 0 && /SMTP_HOST/.test(smtpNoHost.err));
  const bogus = envProbe({ MAIL_TRANSPORT: "sendgrid" });
  check("неизвестный MAIL_TRANSPORT → отказ", bogus.code !== 0 && /MAIL_TRANSPORT/.test(bogus.err));
  const envEx = read(".env.example");
  for (const v of ["MAIL_TRANSPORT", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_SECURE", "MAIL_FROM", "PUBLIC_BASE_URL"])
    check(`.env.example: ${v}=`, new RegExp(`^${v}=`, "m").test(envEx));
  check("сторож dotfiles знает переменные почты", /MAIL_TRANSPORT/.test(read("scripts/checks/check-dotfiles.mjs")));
  check("env.local.example: MAIL_TRANSPORT=console", /^MAIL_TRANSPORT=console$/m.test(read("env.local.example")));
  const pkg = JSON.parse(read("server/package.json"));
  check("nodemailer в зависимостях сервера, @types/nodemailer — нет", !!pkg.dependencies.nodemailer && !pkg.devDependencies["@types/nodemailer"]);
}

console.log("── 2. Миграция и схема ──");
{
  const journal = JSON.parse(read("server/db/migrations/meta/_journal.json"));
  const last = journal.entries.at(-1);
  check("журнал: idx 6, тег 0006_mail (переименован из генерата)", last.idx === 6 && last.tag === "0006_mail");
  check("файл миграции и снапшот на месте", existsSync(new URL("server/db/migrations/0006_mail.sql", ROOT)) && existsSync(new URL("server/db/migrations/meta/0006_snapshot.json", ROOT)));
  const sqlText = read("server/db/migrations/0006_mail.sql");
  check("users.email_verified_at timestamptz NULL", /ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;/.test(sqlText));
  check("auth_tokens: CHECK purpose, FK CASCADE", /CHECK \("auth_tokens"\."purpose" IN \('email_verify','password_reset'\)\)/.test(sqlText) && /"auth_tokens_user_id_users_id_fk"[^;]*ON DELETE cascade/.test(sqlText));
  check("auth_tokens: индексы (user_id, purpose) и token_hash", /"idx_auth_tokens_user_purpose"[^;]*\("user_id","purpose"\)/.test(sqlText) && /"idx_auth_tokens_hash"[^;]*\("token_hash"\)/.test(sqlText));
  check("mail_outbox: индекс (status, next_attempt_at)", /"idx_mail_outbox_status_next"[^;]*\("status","next_attempt_at"\)/.test(sqlText));
  check("в таблице доводов нет колонки с самим доводом", !/"token" text/.test(sqlText) && /"token_hash" text NOT NULL/.test(sqlText));
  const schema = await import("../server/db/schema.ts");
  check("schema: authTokens, mailOutbox, users.emailVerifiedAt", !!schema.authTokens && !!schema.mailOutbox && "emailVerifiedAt" in schema.users);
}

console.log("── 3. Транспорт, шаблоны, решение о повторе ──");
const transport = await import("../server/services/mail/transport.ts");
const templates = await import("../server/services/mail/templates.ts");
const worker = await import("../server/services/mail/worker.ts");
{
  const c = transport.classifySendError;
  check("550 → постоянный", c({ responseCode: 550, message: "No such user" }).permanent === true);
  check("EENVELOPE (негодный адрес) → постоянный", c({ code: "EENVELOPE", message: "No recipients defined" }).permanent === true);
  check("451 на RCPT TO (EENVELOPE с кодом ответа) → временный", c({ code: "EENVELOPE", responseCode: 451, command: "RCPT TO" }).permanent === false);
  check("550 на RCPT TO (EENVELOPE с кодом ответа) → постоянный", c({ code: "EENVELOPE", responseCode: 550, command: "RCPT TO" }).permanent === true);
  check("451 → временный", c({ responseCode: 451, message: "try later" }).permanent === false);
  check("сеть/таймаут → временный", c({ code: "ETIMEDOUT" }).permanent === false && c({ code: "ECONNECTION" }).permanent === false && c(new Error("x")).permanent === false);
  check("EAUTH 535 → временный (беда настройки, не адресата)", c({ code: "EAUTH", responseCode: 535 }).permanent === false);
  check("отказ на стадии соединения (554 CONN) → временный", c({ responseCode: 554, command: "CONN" }).permanent === false);
  check("текст ошибки несёт код ответа", /550/.test(c({ responseCode: 550, message: "No such user" }).error));
  const printed = transport.formatConsoleMail({ to: "a@b.co", subject: "S", text: "T http://x/verify-email/abc", html: "<p>h</p>" }, "PS <f@x>");
  check("console: блок с границами, To/Subject и текстовой версией", printed.startsWith(transport.CONSOLE_MAIL_BEGIN) && printed.endsWith(transport.CONSOLE_MAIL_END) && /^To: a@b\.co$/m.test(printed) && /^Subject: S$/m.test(printed) && printed.includes("http://x/verify-email/abc"));
  check("транспорт о содержании писем не знает (не импортирует templates)", !/templates/.test(strip(read("server/services/mail/transport.ts"))));
  const src = strip(read("server/services/mail/templates.ts"));
  check("шаблоны о доставке не знают (ни nodemailer, ни db, ни env)", !/nodemailer|db\/index|env\.js/.test(src));

  const link = "https://ps.example.org/verify-email/TOK_en-1";
  const v = templates.verifyEmailLetter({ displayName: "Ада <b>", link, ttlHours: 72 });
  const r = templates.passwordResetLetter({ displayName: null, link: link.replace("verify-email", "reset-password"), ttlHours: 1 });
  check("подтверждение: тема, ссылка в тексте и в HTML, срок «72 часа»", /подтверждение адреса/.test(v.subject) && v.text.includes(link) && v.html.includes(link) && /72 часа/.test(v.text));
  check("сброс: тема, ссылка, срок «1 час», слова о завершении сеансов", /сброс пароля/.test(r.subject) && r.text.includes("/reset-password/") && / 1 час /.test(r.text) && /сеансы входа будут завершены/.test(r.text));
  check("имя адресата экранируется в HTML, в тексте — как есть", v.html.includes("Ада &lt;b&gt;") && !v.html.includes("Ада <b>") && v.text.includes("Ада <b>"));
  check("без имени — обращение без имени", r.text.startsWith("Здравствуйте.\n"));
  check("HTML без внешних ресурсов (img, link, script, url())", !/<img|<link|<script|url\(/i.test(v.html + r.html));
  check("операционные письма: ни отписки, ни List-Unsubscribe", !/отпис|unsubscribe/i.test(v.text + v.html + r.text + r.html));

  const delays = [60000, 300000, 900000, 3600000, 21600000];
  const seq = [0, 1, 2, 3, 4, 5].map((a) => worker.decideRetry(a, delays));
  check("попытки 1–5 → pending с задержками 1/5/15/60 мин/6 ч", seq.slice(0, 5).every((d, i) => d.status === "pending" && d.delayMs === delays[i] && d.attempts === i + 1));
  check("шестая неудачная попытка → failed", seq[5].status === "failed" && seq[5].attempts === 6);
}

console.log("── 4. Доводы, роуты, работник в index.ts ──");
const tokens = await import("../server/services/auth-tokens.ts");
{
  const t = tokens.generateAuthToken();
  check("довод — 32 байта base64url; хэш — sha256 hex, не равен доводу", /^[A-Za-z0-9_-]{43}$/.test(t) && /^[0-9a-f]{64}$/.test(tokens.hashAuthToken(t)) && tokens.hashAuthToken(t) !== t);
  check("сроки: подтверждение 72 ч, сброс 1 ч", tokens.TOKEN_TTL_HOURS.email_verify === 72 && tokens.TOKEN_TTL_HOURS.password_reset === 1);
  check("ссылки ведут на клиентские маршруты", tokens.tokenLink("email_verify", "abc") === "http://localhost:5173/verify-email/abc" && tokens.tokenLink("password_reset", "abc") === "http://localhost:5173/reset-password/abc");
  const tokSrc = strip(read("server/services/auth-tokens.ts"));
  check("в БД пишется только tokenHash", /tokenHash: hashAuthToken\(token\)/.test(tokSrc) && !/\btoken: token\b|values\(\{[^}]*\btoken,/.test(tokSrc));
  check("issueToken гасит прежние того же назначения", /async function issueToken[\s\S]*?\.update\(authTokens\)\s*\.set\(\{ usedAt: now \}\)[\s\S]*?eq\(authTokens\.purpose, purpose\), isNull\(authTokens\.usedAt\)[\s\S]*?\.insert\(authTokens\)/.test(tokSrc));
  check("consumeToken — один условный UPDATE … RETURNING", /async function consumeToken[\s\S]*?\.update\(authTokens\)[\s\S]*?isNull\(authTokens\.usedAt\),\s*gt\(authTokens\.expiresAt, now\)[\s\S]*?\.returning\(/.test(tokSrc));
  check("довод + письмо — под точкой сохранения", /underSavepoint\(exec,[\s\S]*?issueToken\(sp,[\s\S]*?enqueue\(sp,/.test(tokSrc));

  const routes = strip(read("server/routes/auth.ts"));
  for (const [m, p] of [["post", "/email/verify/request"], ["post", "/email/verify/confirm"], ["post", "/password-reset/request"], ["post", "/password-reset/confirm"]])
    check(`роут ${m.toUpperCase()} /auth${p}`, routes.includes(`authRoutes.${m}("${p}"`));
  check("verify/request под requireAuth и лимитом 'mail'", /authRoutes\.post\("\/email\/verify\/request", mailLimiter, requireAuth,/.test(routes));
  check("password-reset/request БЕЗ requireAuth, под лимитом 'mail'", /authRoutes\.post\("\/password-reset\/request", mailLimiter, async/.test(routes));
  check("confirm-роуты без requireAuth (ссылку открывают без входа)", /authRoutes\.post\("\/email\/verify\/confirm", async/.test(routes) && /authRoutes\.post\("\/password-reset\/confirm", async/.test(routes));
  const reg = routes.slice(routes.indexOf('authRoutes.post("/register"'), routes.indexOf('authRoutes.post("/login"'));
  check("регистрация: пользователь и письмо — одной транзакцией", /db\.transaction\(async \(tx\) => \{[\s\S]*?tx\s*\.insert\(schema\.users\)[\s\S]*?queueVerificationMail\(tx, created!\)/.test(reg));
  const reqBlock = routes.slice(routes.indexOf('"/password-reset/request"'), routes.indexOf('"/password-reset/confirm"'));
  check("сброс/запрос: один ответ на оба случая (единственный c.json с ok)", (reqBlock.match(/ok: true/g) ?? []).length === 1 && /message: PASSWORD_RESET_REQUESTED_MESSAGE/.test(reqBlock));
  const confBlock = routes.slice(routes.indexOf('"/password-reset/confirm"'), routes.indexOf("Управление доступом"));
  check("сброс/подтверждение: PASSWORD_MIN_LENGTH из shared → details.newPassword", /newPassword\.length < PASSWORD_MIN_LENGTH[\s\S]*?details\.newPassword = PASSWORD_TOO_SHORT_MESSAGE/.test(confBlock) && !/const PASSWORD_MIN_LENGTH\s*=/.test(routes));
  check("пароль проверяется ДО довода", confBlock.indexOf("PASSWORD_TOO_SHORT_MESSAGE") < confBlock.indexOf("isTokenUsable"));
  check("завершаются ВСЕ сессии (без ne(текущая))", /tx\.delete\(schema\.sessions\)\.where\(eq\(schema\.sessions\.userId, userId\)\)/.test(confBlock) && !/ne\(/.test(confBlock));
  check("вариант (а): сброс подтверждает адрес, если он не подтверждён", /emailVerifiedAt: sql`coalesce\(/.test(confBlock));
  check("TOKEN_INVALID — один код и один текст", (routes.match(/code: "TOKEN_INVALID"/g) ?? []).length === 1 && /TOKEN_INVALID_MESSAGE/.test(routes));
  const login = routes.slice(routes.indexOf('authRoutes.post("/login"'), routes.indexOf('authRoutes.post("/logout"'));
  check("вход НЕ смотрит на подтверждение адреса", !/emailVerified/i.test(login));
  check("AuthUser.emailVerified на сервере и в GET /auth/me", /emailVerified: boolean/.test(read("server/middleware/auth.ts")) && /emailVerified: user\.emailVerified/.test(routes));
  check("account-deletion удаляет доводы явно", /tx\.delete\(authTokens\)\.where\(eq\(authTokens\.userId, userId\)\)/.test(strip(read("server/services/account-deletion.ts"))));
  const idx = strip(read("server/index.ts"));
  check("index.ts: startMailWorker при старте, stopMailWorker до closeDb", /startMailWorker\(\);/.test(idx) && idx.indexOf("await stopMailWorker()") > 0 && idx.indexOf("await stopMailWorker()") < idx.indexOf("await closeDb()"));
  check("reset-password.ts не удалён (запасной ход владельца)", existsSync(new URL("scripts/seed/reset-password.ts", ROOT)));
}

console.log("── 5. Живая БД: очередь, доводы, работник ──");
{
  const { db, schema, closeDb } = await import("../server/db/index.ts");
  const outbox = await import("../server/services/mail/outbox.ts");
  const { eq, inArray } = await import("drizzle-orm");
  let up = true;
  try { await db.execute("select 1"); } catch { up = false; }
  if (!up) console.log("  … PostgreSQL недоступен — раздел пропущен");
  else {
    const TAG = `s91-${Date.now()}`;
    const mk = (i) => ({ to: `${TAG}-${i}@example.org`, subject: `${TAG} ${i}`, text: "t", html: "<p>h</p>" });
    const rowsOf = () => db.select().from(schema.mailOutbox).where(inArray(schema.mailOutbox.toEmail, [0, 1, 2, 3, 4, 5].map((i) => `${TAG}-${i}@example.org`)));
    const [user] = await db.insert(schema.users).values({ email: `${TAG}@example.org`, passwordHash: "x" }).returning();
    try {
      // откат действия уносит письмо
      await db.transaction(async (tx) => { await outbox.enqueue(tx, mk(0)); throw new Error("rollback"); }).catch(() => {});
      check("откат транзакции не оставляет письма в очереди", (await rowsOf()).length === 0);
      // сбой постановки под savepoint не губит внешнюю транзакцию
      const origErr = console.error; console.error = () => {};
      let outerOk = false;
      await db.transaction(async (tx) => {
        const id = await outbox.tryEnqueue(tx, { ...mk(1), subject: null });
        if (id !== null) throw new Error("ожидался сбой постановки");
        await tx.update(schema.users).set({ displayName: "жив" }).where(eq(schema.users.id, user.id));
        outerOk = true;
      });
      console.error = origErr;
      const [u2] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
      check("сбой постановки письма не отменяет внешнее действие", outerOk && u2.displayName === "жив" && (await rowsOf()).length === 0);

      // доводы
      const t1 = await tokens.issueToken(db, user.id, "password_reset");
      const t2 = await tokens.issueToken(db, user.id, "password_reset");
      check("ссылка, выданная раньше новой, мертва", (await tokens.consumeToken(db, t1, "password_reset")) === null);
      check("довод чужого назначения не годится", (await tokens.consumeToken(db, t2, "email_verify")) === null);
      check("живой довод гасится и отдаёт userId", (await tokens.consumeToken(db, t2, "password_reset")) === user.id);
      check("повторное погашение → null", (await tokens.consumeToken(db, t2, "password_reset")) === null);
      const t3 = await tokens.issueToken(db, user.id, "password_reset");
      await db.update(schema.authTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.authTokens.tokenHash, tokens.hashAuthToken(t3)));
      check("просроченный довод → null", (await tokens.isTokenUsable(db, t3, "password_reset")) === false && (await tokens.consumeToken(db, t3, "password_reset")) === null);
      const stored = await db.select().from(schema.authTokens).where(eq(schema.authTokens.userId, user.id));
      check("в таблице нет ни одного довода в открытом виде", stored.length === 3 && stored.every((r) => ![t1, t2, t3].includes(r.tokenHash) && /^[0-9a-f]{64}$/.test(r.tokenHash)));
      const sentOk = await tokens.queueVerificationMail(db, { id: user.id, email: `${TAG}-5@example.org`, displayName: null });
      const q = (await rowsOf()).find((r) => r.toEmail === `${TAG}-5@example.org`);
      check("queueVerificationMail: довод выдан, письмо pending со ссылкой", sentOk && q?.status === "pending" && /\/verify-email\/[A-Za-z0-9_-]{43}/.test(q.bodyText));
      await db.delete(schema.mailOutbox).where(eq(schema.mailOutbox.id, q.id));

      // работник: три письма, три исхода
      const ids = [];
      for (const i of [2, 3, 4]) ids.push(await outbox.enqueue(db, mk(i)));
      const send = async (m) => m.to.includes("-2@") ? { ok: true } : m.to.includes("-3@") ? { ok: false, permanent: true, error: "550 No such user" } : { ok: false, permanent: false, error: "451 try later" };
      const origWarn = console.warn; console.warn = () => {};
      const before = Date.now();
      // чужие письма общей БД не трогаем: проход ограничен своими строками (onlyIds)
      await worker.processOutbox({ send, onlyIds: ids });
      let rs = await rowsOf();
      const by = (i) => rs.find((r) => r.toEmail === `${TAG}-${i}@example.org`);
      check("тела письма затёрты у 'sent' и у 'failed' (живая ссылка в очереди не остаётся)", by(2).bodyText === "" && by(2).bodyHtml === "" && by(3).bodyText === "" && by(4).bodyText !== "");
      check("успех → sent, attempts=1, sent_at", by(2).status === "sent" && by(2).attempts === 1 && by(2).sentAt !== null);
      check("постоянный отказ → failed сразу, last_error, повторов нет", by(3).status === "failed" && by(3).attempts === 1 && /550/.test(by(3).lastError));
      check("временный отказ → pending, attempts=1, next_attempt_at ≈ +1 мин", by(4).status === "pending" && by(4).attempts === 1 && /451/.test(by(4).lastError) && Math.abs(by(4).nextAttemptAt.getTime() - before - 60000) < 5000);
      // ещё пять проходов для временного: сдвигаем next_attempt_at в прошлое
      const nexts = [];
      for (let k = 2; k <= 6; k++) {
        await db.update(schema.mailOutbox).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(schema.mailOutbox.id, by(4).id));
        const t0 = Date.now();
        await worker.processOutbox({ send, onlyIds: ids });
        rs = await rowsOf();
        nexts.push(by(4).nextAttemptAt.getTime() - t0);
      }
      console.warn = origWarn;
      check("задержка растёт: 5, 15, 60 мин, 6 ч", [300000, 900000, 3600000, 21600000].every((d, i) => Math.abs(nexts[i] - d) < 5000), nexts);
      check("после шестой попытки → failed", by(4).status === "failed" && by(4).attempts === 6);
      await db.update(schema.mailOutbox).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(inArray(schema.mailOutbox.id, [by(3).id, by(4).id]));
      const again = await worker.processOutbox({ send: async () => ({ ok: true }), onlyIds: ids });
      rs = await rowsOf();
      check("failed больше не берётся", again.taken === 0 && by(3).attempts === 1 && by(4).attempts === 6, again);
      const counts = await outbox.getOutboxCounts();
      check("счётчики очереди считаются", typeof counts.pending === "number" && counts.failed >= 2);
    } finally {
      await db.delete(schema.mailOutbox).where(inArray(schema.mailOutbox.toEmail, [0, 1, 2, 3, 4, 5].map((i) => `${TAG}-${i}@example.org`)));
      await db.delete(schema.users).where(eq(schema.users.id, user.id));
    }
  }
  await closeDb();
}

console.log("── 6. Клиент ──");
{
  const app = strip(read("client/src/App.tsx"));
  for (const p of ["/reset-password", "/reset-password/:token", "/verify-email/:token"]) check(`маршрут ${p}`, app.includes(`path="${p}"`));
  const guestPart = app.slice(app.indexOf('path="/login"'), app.indexOf("<Route element={<Layout />}>"));
  check("три маршрута почты гостевые (вне RequireAuth и Layout)", ["/reset-password\"", "/reset-password/:token", "/verify-email/:token"].every((p) => guestPart.includes(p)) && !/RequireAuth/.test(guestPart));
  const login = strip(read("client/src/pages/LoginPage.tsx"));
  check("LoginPage: «Забыли пароль?» рядом с регистрацией + notice", /to="\/register"[\s\S]{0,200}to="\/reset-password"/.test(login) && /Забыли пароль\?/.test(login) && /navState\?\.notice/.test(login));
  const reset = strip(read("client/src/pages/ResetPasswordPage.tsx"));
  check("форма сброса показывает ответ сервера, не различая исход", /setDone\(result\.message\)/.test(reset));
  check("после смены — на /login с пояснением о сессиях", /navigate\("\/login", \{ replace: true, state: \{ notice: PASSWORD_RESET_DONE_NOTICE \} \}\)/.test(reset) && /сессии завершены/.test(read("client/src/pages/ResetPasswordPage.tsx")));
  const verify = strip(read("client/src/pages/VerifyEmailPage.tsx"));
  check("подтверждение гасит довод один раз (ref-заслон), затем каталог", /started\.current = true/.test(verify) && /navigate\("\/catalog"/.test(verify));
  const header = strip(read("client/src/components/layout/Header.tsx"));
  check("полоса только при строгом emailVerified === false", /user && user\.emailVerified === false && <UnverifiedEmailBanner/.test(header));
  check("защита от повторного нажатия", /if \(busy\.current \|\| phase !== "idle"\) return;/.test(header) && /busy\.current = true;/.test(header) && /disabled=\{phase === "pending"\}/.test(header));
  check("полоса — классами 8.7, новых правил CSS нет", /className="app-view-banner"/.test(header) && !/9\.1/.test(read("client/src/globals.css")));
  const store = strip(read("client/src/stores/auth-store.ts"));
  for (const ep of ["/auth/email/verify/request", "/auth/email/verify/confirm", "/auth/password-reset/request", "/auth/password-reset/confirm"]) check(`auth-store зовёт ${ep}`, store.includes(`"${ep}"`));
  check("клиентский AuthUser несёт emailVerified", /emailVerified\?: boolean/.test(store));
  check("ApiErrorCode += TOKEN_INVALID", /\| "TOKEN_INVALID"/.test(read("client/src/api/client.ts")));
}

console.log("── 7. README и документация ──");
{
  const readme = read("README.md");
  const mailSec = readme.slice(readme.indexOf("## Почта"), readme.indexOf("## Регрессионные проверки"));
  check("README: раздел «Почта» с переменными и режимом console", mailSec.length > 500 && /MAIL_TRANSPORT/.test(mailSec) && /PUBLIC_BASE_URL/.test(mailSec) && /Режим `console`/.test(mailSec));
  check("README: SPF, DKIM и DMARC — отдельной строкой, забота владельца", /^\*\*SPF, DKIM и DMARC[^\n]*настраивает владелец службы\.\*\*/m.test(mailSec) && /не дефект\s+кода/.test(mailSec));
  const d03 = read("docs/03-specification.md");
  check("03 §2.1: четыре маршрута почты, заглушка «A2a, Фаза 3» снята", d03.includes("POST   /auth/email/verify/request") && d03.includes("POST   /auth/email/verify/confirm") && !d03.includes("// A2a, Фаза 3"));
  check("03 §4.3: TOKEN_INVALID; /auth/me с emailVerified", /^TOKEN_INVALID\s+—/m.test(d03) && /balanceUsd,\s*emailVerified/.test(d03));
  const d02 = read("docs/02-data-model.md");
  check("02: email_verified_at, §2.30 auth_tokens, §2.31 mail_outbox", /email_verified_at TIMESTAMPTZ/.test(d02) && /### 2\.30\. auth_tokens/.test(d02) && /### 2\.31\. mail_outbox/.test(d02));
  const d05 = read("docs/05-file-structure.md");
  check("05: mail/, auth-tokens.ts, 0006_mail, страницы", ["transport.ts", "templates.ts", "outbox.ts", "worker.ts", "auth-tokens.ts", "0006_mail.sql", "ResetPasswordPage.tsx", "VerifyEmailPage.tsx"].every((f) => d05.includes(f)));
  check("04 §4 и 01 §6 — строки 9.1", read("docs/04-code-reuse-map.md").includes("НОВОЕ (9.1)") && read("docs/01-architecture.md").includes("**Почта (беседа 9.1).**"));
}

console.log(`\nИТОГ: ${n - failed} ✓ / ${failed} ✗ из ${n}`);
process.exit(failed ? 1 : 0);
