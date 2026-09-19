/**
 * Очередь исходящих писем — постановка (беседа 9.1, запрос 1, п. 3c;
 * 02 §2.31 mail_outbox).
 *
 * enqueue(exec, letter) пишет строку ТЕМ ИСПОЛНИТЕЛЕМ, который дали — db или
 * транзакцией вызывающего (образец — writeAudit 8.1). Смысл — в обе стороны:
 *   — падение ПОЧТЫ не отменяет уже совершённое действие: отправка отделена
 *     от действия очередью, SMTP к транзакции не прикасается;
 *   — откат ДЕЙСТВИЯ не оставляет письма: строка откатывается вместе с ним.
 *
 * tryEnqueue — то же под SAVEPOINT (вложенная транзакция drizzle): сбой
 * самой постановки откатывает только её, а внешняя транзакция живёт. Без
 * точки сохранения любая ошибка INSERT переводит транзакцию PostgreSQL в
 * aborted, и «письмо не встало в очередь» стоило бы человеку регистрации.
 */
import { and, count, eq, lte } from "drizzle-orm";

import { db, schema } from "../../db/index.js";

const { mailOutbox } = schema;

/** db либо транзакция drizzle (как DbExecutor admin-audit 8.1). */
export type MailDbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface OutboxLetter {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Постановка письма в очередь исполнителем exec. Возвращает id строки.
 *  Ошибок не глотает — вызывающий решает, под savepoint ли он. */
export async function enqueue(exec: MailDbExecutor, letter: OutboxLetter): Promise<string> {
  const [row] = await exec
    .insert(mailOutbox)
    .values({
      toEmail: letter.to,
      subject: letter.subject,
      bodyText: letter.text,
      bodyHtml: letter.html,
    })
    .returning({ id: mailOutbox.id });
  return row!.id;
}

/**
 * Исполнить fn под точкой сохранения: сбой откатывает только сделанное в
 * fn, внешняя транзакция (или её отсутствие) не страдает. null — сбой
 * (записан в лог с меткой what).
 */
export async function underSavepoint<T>(
  exec: MailDbExecutor,
  what: string,
  fn: (sp: MailDbExecutor) => Promise<T>,
): Promise<T | null> {
  try {
    return await exec.transaction(async (sp) => fn(sp));
  } catch (err) {
    const e = err as { message?: string; cause?: { message?: string } };
    console.error(`[mail] ${what}: ${e.cause?.message ?? e.message ?? String(err)}`);
    return null;
  }
}

/** enqueue под точкой сохранения; null — письмо в очередь не встало. */
export function tryEnqueue(exec: MailDbExecutor, letter: OutboxLetter): Promise<string | null> {
  return underSavepoint(exec, `постановка письма «${letter.subject}» не удалась`, (sp) =>
    enqueue(sp, letter),
  );
}

export interface OutboxCounts {
  /** 'pending' всего */
  pending: number;
  /** 'pending' с уже наступившим next_attempt_at — работник отстал */
  overdue: number;
  failed: number;
}

/** Счётчики очереди: overdue > 0 дольше периода разбора — работник отстал. */
export async function getOutboxCounts(now: Date = new Date()): Promise<OutboxCounts> {
  const [[p], [o], [f]] = await Promise.all([
    db.select({ n: count() }).from(mailOutbox).where(eq(mailOutbox.status, "pending")),
    db
      .select({ n: count() })
      .from(mailOutbox)
      .where(and(eq(mailOutbox.status, "pending"), lte(mailOutbox.nextAttemptAt, now))),
    db.select({ n: count() }).from(mailOutbox).where(eq(mailOutbox.status, "failed")),
  ]);
  return { pending: Number(p?.n ?? 0), overdue: Number(o?.n ?? 0), failed: Number(f?.n ?? 0) };
}
