/**
 * Чистка отработавшего (беседа 15.3, Д-72 п.1; 02 §2.2, §2.30, §2.31).
 *
 * Три таблицы копили строки, которые никому больше не нужны:
 *   - mail_outbox: 'sent'/'failed' с затёртыми телами — след отправки; старше
 *     MAIL_RETENTION_DAYS смысла не имеет (разобрать отказ за месяц успели);
 *   - auth_tokens: погашенные (used_at) и просроченные (expires_at < now):
 *     consumeToken их никогда не примет, строка — только след выдачи; старше
 *     AUTH_TOKEN_RETENTION_DAYS снимается;
 *   - sessions: истёкшие удалялись лишь ЛЕНИВО — при обращении с этой cookie
 *     (validateSessionToken); сессия, с которой больше не приходят, лежала
 *     вечно. Здесь — все с expires_at < now, без срока хранения: истёкшая
 *     сессия не след, а мусор.
 *
 * Проход зовёт работник почты (worker.ts) РЕЖЕ основного цикла — раз в
 * env.mail.maintenanceIntervalMs (умолчание — час) на очередном тике; своего
 * таймера у чистки нет, второй процесс не нужен. Сбой прохода сервер не
 * роняет (fail-open, как сам работник): следующий проход попробует снова.
 *
 * Срок сверяется с now() БАЗЫ (урок 9.1: микросекунды DEFAULT now() против
 * миллисекунд Date), кроме явного now для проверок.
 */
import { and, inArray, lt, or, isNotNull, sql, type SQL } from "drizzle-orm";

import { db, schema } from "../../db/index.js";
import { env } from "../../env.js";

const { mailOutbox, authTokens, sessions } = schema;

export interface MaintenanceResult {
  /** Удалено строк mail_outbox ('sent'/'failed' старше срока) */
  mailDeleted: number;
  /** Удалено доводов auth_tokens (погашенных/просроченных старше срока) */
  tokensDeleted: number;
  /** Удалено истёкших сессий */
  sessionsDeleted: number;
}

export interface MaintenanceOptions {
  /** «Сейчас» прохода; без него — now() базы */
  now?: Date;
  /** Сроки хранения, сут. (умолчания — env) */
  mailRetentionDays?: number;
  tokenRetentionDays?: number;
}

/** Порог «старше N суток» от now (Date) либо от now() базы. */
function olderThan(column: { getSQL(): SQL }, days: number, now?: Date): SQL {
  const col = column.getSQL();
  if (now) return sql`${col} < ${new Date(now.getTime() - days * 86_400_000)}`;
  return sql`${col} < now() - make_interval(days => ${days})`;
}

/**
 * Один проход чистки. Три DELETE идут независимо — сбой одного не
 * отменяет остальные (каждый — своя строка отчёта в логе работника).
 */
export async function runMaintenance(opts: MaintenanceOptions = {}): Promise<MaintenanceResult> {
  const mailDays = Math.max(0, opts.mailRetentionDays ?? env.mail.retentionDays);
  const tokenDays = Math.max(0, opts.tokenRetentionDays ?? env.auth.tokenRetentionDays);
  const nowSql = opts.now ? sql`${opts.now}` : sql`now()`;

  // Письмо считается «старым» по моменту исхода: sent_at у отправленных,
  // next_attempt_at (последняя попытка) у похороненных; created_at — страховка
  const mail = await db
    .delete(mailOutbox)
    .where(
      and(
        inArray(mailOutbox.status, ["sent", "failed"]),
        olderThan(sql`coalesce(${mailOutbox.sentAt}, ${mailOutbox.nextAttemptAt}, ${mailOutbox.createdAt})`, mailDays, opts.now),
      ),
    )
    .returning({ id: mailOutbox.id });

  const tokens = await db
    .delete(authTokens)
    .where(
      and(
        or(isNotNull(authTokens.usedAt), lt(authTokens.expiresAt, opts.now ?? sql`now()`)),
        olderThan(sql`coalesce(${authTokens.usedAt}, ${authTokens.expiresAt})`, tokenDays, opts.now),
      ),
    )
    .returning({ id: authTokens.id });

  const expired = await db
    .delete(sessions)
    .where(sql`${sessions.expiresAt} < ${nowSql}`)
    .returning({ id: sessions.id });

  return { mailDeleted: mail.length, tokensDeleted: tokens.length, sessionsDeleted: expired.length };
}

/** Пора ли чистке: прошло ≥ интервала с прошлого прохода (0 — ещё не было). */
export function maintenanceDue(lastRunAt: number, now: number, intervalMs: number = env.mail.maintenanceIntervalMs): boolean {
  return now - lastRunAt >= Math.max(1_000, intervalMs);
}
