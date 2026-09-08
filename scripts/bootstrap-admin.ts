/**
 * scripts/bootstrap-admin.ts — ПЕРВЫЙ АДМИНИСТРАТОР, только из командной
 * строки (беседа 8.1, запрос 1, п. 2). Роль 'admin' иначе недостижима:
 * регистрация даёт 'user', а POST /auth/users/:id/role требует уже
 * существующего администратора.
 *
 * Вход — переменные окружения (довод командной строки виден в списке
 * процессов и остаётся в истории оболочки):
 *   BOOTSTRAP_ADMIN_EMAIL     обязателен
 *   BOOTSTRAP_ADMIN_PASSWORD  обязателен; нет переменной → внятный отказ и
 *                             exit 1, небезопасного умолчания нет
 *   BOOTSTRAP_ADMIN_NAME      необязателен (display_name)
 *   DATABASE_URL              как у сервера (server/db/index.ts)
 *
 * Правила пароля/email/имени — те же, что у POST /auth/register:
 * @philosynth/shared/constants/auth (п. 1). Хэш — hashPassword из
 * middleware/auth.ts (bcrypt).
 *
 * Идемпотентность в терминах остальных скриптов (created / updated / skip /
 * fail — образец seed-taxonomy.ts):
 *   - администратор с таким email уже есть           → skip (пароль НЕ трогаем);
 *   - пользователь есть, роль 'user'                 → updated (повышение;
 *                                                       пароль НЕ трогаем);
 *   - никого нет                                     → created.
 *   ЗАСЛОН: в базе уже есть администратор с ДРУГИМ email → fail с подсказкой
 *   «второго назначайте POST /auth/users/:id/role». Открытая ветка «кто
 *   запустил скрипт, тот и админ» на живой базе — способ потерять службу.
 *
 * Всё — одной транзакцией под pg_advisory_xact_lock(ADMIN_SET_LOCK_KEY)
 * (тот же ключ, что у смены роли и удаления аккаунта): гонка двух запусков
 * или запуска с параллельной сменой роли не даёт двух «первых». Строка
 * admin_audit user.bootstrapped (actor_id = самому себе, details.source =
 * 'bootstrap', outcome) — в той же транзакции. pg-код 23505 (гонка по
 * UNIQUE email) читается из err.cause.code (DrizzleQueryError, 09 §3 0.2).
 *
 * Запуск: BOOTSTRAP_ADMIN_EMAIL=… BOOTSTRAP_ADMIN_PASSWORD=… npm run seed:admin
 * Код возврата: 0 — created/updated/skip; 1 — fail.
 */
import {
  DISPLAY_NAME_MAX_LENGTH,
  EMAIL_RE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_TOO_SHORT_MESSAGE,
} from "@philosynth/shared/constants/auth";
import { and, eq, ne, sql } from "drizzle-orm";

import { closeDb, db, schema } from "../server/db/index.js";
import { hashPassword } from "../server/middleware/auth.js";
import {
  ADMIN_ACTIONS,
  ADMIN_SET_LOCK_KEY,
  writeAudit,
} from "../server/services/admin-audit.js";

const { users } = schema;

export type BootstrapOutcome = "created" | "updated" | "skip" | "fail";

export interface BootstrapResult {
  outcome: BootstrapOutcome;
  email: string;
  userId?: string;
  error?: string;
}

export interface BootstrapInput {
  email: string;
  password: string;
  displayName?: string | undefined;
}

/** Разбор и проверка окружения — те же правила, что у регистрации. */
export function readBootstrapEnv(
  envSource: NodeJS.ProcessEnv = process.env,
): { ok: true; value: BootstrapInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const emailRaw = envSource.BOOTSTRAP_ADMIN_EMAIL;
  const password = envSource.BOOTSTRAP_ADMIN_PASSWORD;
  const nameRaw = envSource.BOOTSTRAP_ADMIN_NAME;

  const email = (emailRaw ?? "").trim().toLowerCase();
  if (!emailRaw || !email) errors.push("BOOTSTRAP_ADMIN_EMAIL не задан");
  else if (!EMAIL_RE.test(email)) errors.push("BOOTSTRAP_ADMIN_EMAIL: невалидный email");

  if (password === undefined || password === "") {
    errors.push(
      "BOOTSTRAP_ADMIN_PASSWORD не задан — передайте пароль переменной окружения " +
        "(не доводом командной строки); небезопасного умолчания нет",
    );
  } else if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`BOOTSTRAP_ADMIN_PASSWORD: ${PASSWORD_TOO_SHORT_MESSAGE}`);
  }

  let displayName: string | undefined;
  if (nameRaw !== undefined) {
    const t = nameRaw.trim();
    if (t.length > DISPLAY_NAME_MAX_LENGTH)
      errors.push(`BOOTSTRAP_ADMIN_NAME: максимальная длина — ${DISPLAY_NAME_MAX_LENGTH} символов`);
    else displayName = t || undefined;
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { email, password: password!, displayName } };
}

/**
 * Само заведение — экспортировано отдельно от main(), чтобы тесты и
 * харнесс могли звать его без порождения процесса.
 */
export async function bootstrapAdmin(input: BootstrapInput): Promise<BootstrapResult> {
  const { email, password, displayName } = input;
  try {
    return await db.transaction(async (tx): Promise<BootstrapResult> => {
      await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_SET_LOCK_KEY})`);

      const [existing] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
      if (existing?.role === "admin") {
        return { outcome: "skip", email, userId: existing.id };
      }

      // Заслон: другой администратор уже есть → второго назначает он сам
      const others = await tx
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(and(eq(users.role, "admin"), ne(users.email, email)))
        .limit(1);
      if (others.length > 0) {
        return {
          outcome: "fail",
          email,
          error:
            `В базе уже есть администратор (${others[0]!.email}). Второго назначайте ` +
            "POST /auth/users/:id/role от его имени (вкладка «Доступ» админки) — " +
            "скрипт заводит только ПЕРВОГО.",
        };
      }

      if (existing) {
        // Повышение: роль → admin, пароль НЕ переписываем
        await tx
          .update(users)
          .set({ role: "admin", updatedAt: new Date() })
          .where(eq(users.id, existing.id));
        await writeAudit(tx, {
          actorId: existing.id,
          action: ADMIN_ACTIONS.USER_BOOTSTRAPPED,
          targetType: "user",
          targetId: existing.id,
          details: { source: "bootstrap", outcome: "updated", from: existing.role, to: "admin" },
        });
        return { outcome: "updated", email, userId: existing.id };
      }

      const passwordHash = await hashPassword(password);
      const [created] = await tx
        .insert(users)
        .values({ email, passwordHash, displayName: displayName ?? null, role: "admin" })
        .returning({ id: users.id });
      const id = created!.id;
      await writeAudit(tx, {
        actorId: id,
        action: ADMIN_ACTIONS.USER_BOOTSTRAPPED,
        targetType: "user",
        targetId: id,
        details: { source: "bootstrap", outcome: "created" },
      });
      return { outcome: "created", email, userId: id };
    });
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string }; message?: string };
    if (e.code === "23505" || e.cause?.code === "23505") {
      return {
        outcome: "fail",
        email,
        error: "Гонка по UNIQUE(email): пользователь появился параллельно — повторите запуск",
      };
    }
    return { outcome: "fail", email, error: e.message ?? String(err) };
  }
}

async function main(): Promise<void> {
  const parsed = readBootstrapEnv();
  if (!parsed.ok) {
    for (const e of parsed.errors) console.error(`bootstrap-admin: ${e}`);
    console.error(
      "Пример: BOOTSTRAP_ADMIN_EMAIL=admin@example.org BOOTSTRAP_ADMIN_PASSWORD='…' npm run seed:admin",
    );
    process.exitCode = 1;
    return;
  }
  const r = await bootstrapAdmin(parsed.value);
  const counts = { created: 0, updated: 0, skip: 0, fail: 0 };
  counts[r.outcome] = 1;
  console.log(
    `bootstrap-admin (${r.email}): created=${counts.created}, updated=${counts.updated}, ` +
      `skip=${counts.skip}, fail=${counts.fail}`,
  );
  if (r.outcome === "fail") {
    console.error(`  FAIL: ${r.error}`);
    process.exitCode = 1;
  } else if (r.userId) {
    console.log(`  ${r.outcome}: id=${r.userId}, role=admin`);
  }
}

// Импорт из тестов не должен запускать main (образец: тесты зовут bootstrapAdmin)
const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/bootstrap-admin.ts");
if (isDirectRun) {
  main()
    .catch((err) => {
      console.error("bootstrap-admin: фатальная ошибка:", err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
