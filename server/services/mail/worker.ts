/**
 * Работник очереди писем (беседа 9.1, запрос 1, п. 3d; 02 §2.31).
 *
 * ДВА РОДА ОТКАЗА:
 *   ПОСТОЯННЫЙ (5xx SMTP, негодный адрес) → status='failed', last_error,
 *     больше не пробовать;
 *   ВРЕМЕННЫЙ (4xx, сеть, таймаут) → attempts+1, next_attempt_at с растущей
 *     задержкой env.mail.retryDelaysMs (1 мин, 5, 15, 60, 6 ч); после
 *     последней попытки (задержек + 1 = шестой) → 'failed'.
 * Довод за разделение: регистрация открытая, значит опечатка в адресе или
 * бот дают постоянный отказ. Если повторять и такие письма, счётчик
 * неотправленных забьётся мёртвыми — а он единственный признак того, что
 * работник отстал.
 *
 * Захват строк — АРЕНДОЙ, без долгой транзакции: одним UPDATE … WHERE id IN
 * (SELECT … FOR UPDATE SKIP LOCKED) next_attempt_at сдвигается на LEASE_MS
 * вперёд, строка возвращается работнику; SMTP-разговор идёт вне транзакции.
 * Два процесса одно письмо не возьмут; умерший посреди отправки процесс
 * вернёт письмо в очередь по истечении аренды (доставка «не менее раза»).
 * attempts считает ИСХОДЫ, а не захваты.
 *
 * Запуск — интервалом из index.ts (startMailWorker), остановка по SIGTERM
 * (stopMailWorker дожидается идущего прохода). Проходы не накладываются.
 */
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";

import { db, schema } from "../../db/index.js";
import { env } from "../../env.js";
import { sendMail, type OutgoingMail, type SendResult } from "./transport.js";

const { mailOutbox } = schema;

/** Аренда захваченной строки: дольше таймаутов транспорта (15+15+30 с) */
export const LEASE_MS = 120_000;
/** Писем за проход */
export const BATCH_SIZE = 20;

/**
 * Тело письма несёт ЖИВОЙ довод (ссылку): auth_tokens хранит его хэшем как
 * раз затем, чтобы утечка таблицы не давала ни входа, ни подтверждения, — и
 * mail_outbox не должен сводить это на нет. Как только письмо покинуло
 * очередь ('sent') или похоронено ('failed'), тела затираются; остаются
 * адресат, тема, исход и ошибка — их хватает, чтобы разобрать отказ.
 * В 'pending' ссылка лежит неизбежно — секунды до прохода работника.
 */
const SCRUBBED = { bodyText: "", bodyHtml: "" } as const;

export type MailSender = (mail: OutgoingMail) => Promise<SendResult>;

export type RetryDecision =
  | { status: "failed"; attempts: number }
  | { status: "pending"; attempts: number; delayMs: number };

/**
 * Решение после ВРЕМЕННОГО отказа. Чистая функция: attemptsBefore — число
 * уже состоявшихся исходов; delays — env.mail.retryDelaysMs.
 * Попытка №k (k = attemptsBefore + 1) неудачна → ждать delays[k-1]; если
 * задержки кончились (k > delays.length) — 'failed'.
 */
export function decideRetry(attemptsBefore: number, delays: readonly number[]): RetryDecision {
  const attempts = attemptsBefore + 1;
  const delayMs = delays[attempts - 1];
  if (delayMs === undefined) return { status: "failed", attempts };
  return { status: "pending", attempts, delayMs };
}

export interface PassResult {
  taken: number;
  sent: number;
  retried: number;
  failed: number;
}

/**
 * Один проход очереди. send — разъём для проверок (по умолчанию настоящий
 * транспорт); now — «сейчас» прохода; onlyIds — ограничить проход этими
 * строками (проверки на ОБЩЕЙ базе не должны трогать чужие письма).
 */
export async function processOutbox(
  opts: { send?: MailSender; now?: Date; batchSize?: number; onlyIds?: readonly string[] } = {},
): Promise<PassResult> {
  const send = opts.send ?? sendMail;
  const now = opts.now ?? new Date();
  // Без явного now срок сверяется с часами БАЗЫ: next_attempt_at ставит
  // DEFAULT now() с микросекундами, а Date — миллисекунды; только что
  // поставленное письмо оказывалось «в будущем» и ждало лишний проход
  const dueCond = opts.now
    ? lte(mailOutbox.nextAttemptAt, now)
    : sql`${mailOutbox.nextAttemptAt} <= now()`;
  const batch = opts.batchSize ?? BATCH_SIZE;
  const result: PassResult = { taken: 0, sent: 0, retried: 0, failed: 0 };

  // Захват арендой (см. шапку): подзапрос с FOR UPDATE SKIP LOCKED
  const due = db
    .select({ id: mailOutbox.id })
    .from(mailOutbox)
    .where(
      and(
        eq(mailOutbox.status, "pending"),
        dueCond,
        ...(opts.onlyIds ? [inArray(mailOutbox.id, [...opts.onlyIds])] : []),
      ),
    )
    .orderBy(asc(mailOutbox.nextAttemptAt), asc(mailOutbox.createdAt))
    .limit(batch)
    .for("update", { skipLocked: true });
  const rows = await db
    .update(mailOutbox)
    .set({ nextAttemptAt: new Date(now.getTime() + LEASE_MS) })
    .where(inArray(mailOutbox.id, due))
    .returning();
  result.taken = rows.length;

  for (const row of rows) {
    let outcome: SendResult;
    try {
      outcome = await send({
        to: row.toEmail,
        subject: row.subject,
        text: row.bodyText,
        html: row.bodyHtml,
      });
    } catch (err) {
      // Транспорт исключений не бросает; разъём проверки — может
      outcome = { ok: false, permanent: false, error: (err as Error).message ?? String(err) };
    }

    if (outcome.ok) {
      await db
        .update(mailOutbox)
        .set({ status: "sent", attempts: row.attempts + 1, sentAt: new Date(), lastError: null, ...SCRUBBED })
        .where(eq(mailOutbox.id, row.id));
      result.sent++;
      continue;
    }
    if (outcome.permanent) {
      await db
        .update(mailOutbox)
        .set({ status: "failed", attempts: row.attempts + 1, lastError: outcome.error, ...SCRUBBED })
        .where(eq(mailOutbox.id, row.id));
      result.failed++;
      console.warn(`[mail] постоянный отказ, письмо ${row.id} → failed: ${outcome.error}`);
      continue;
    }
    const d = decideRetry(row.attempts, env.mail.retryDelaysMs);
    if (d.status === "failed") {
      await db
        .update(mailOutbox)
        .set({ status: "failed", attempts: d.attempts, lastError: outcome.error, ...SCRUBBED })
        .where(eq(mailOutbox.id, row.id));
      result.failed++;
      console.warn(`[mail] попытки исчерпаны (${d.attempts}), письмо ${row.id} → failed: ${outcome.error}`);
    } else {
      await db
        .update(mailOutbox)
        .set({
          attempts: d.attempts,
          lastError: outcome.error,
          nextAttemptAt: new Date(Date.now() + d.delayMs),
        })
        .where(eq(mailOutbox.id, row.id));
      result.retried++;
    }
  }
  return result;
}

/* ── Интервальный запуск ─────────────────────────────────────────────── */

let timer: NodeJS.Timeout | null = null;
let running: Promise<void> | null = null;
let overdueWarnedAt = 0;

async function tick(): Promise<void> {
  try {
    const r = await processOutbox();
    if (r.taken > 0) {
      console.log(`[mail] проход: взято ${r.taken}, отправлено ${r.sent}, отложено ${r.retried}, отказов ${r.failed}`);
    }
    // Полная пачка — очередь длиннее прохода; раз в 10 минут сказать вслух
    if (r.taken >= BATCH_SIZE && Date.now() - overdueWarnedAt > 600_000) {
      overdueWarnedAt = Date.now();
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(mailOutbox)
        .where(and(eq(mailOutbox.status, "pending"), lte(mailOutbox.nextAttemptAt, new Date())));
      console.warn(`[mail] работник отстаёт: просроченных писем в очереди ${row?.n ?? "?"}`);
    }
  } catch (err) {
    // Сбой БД не должен ронять сервер: следующий проход попробует снова
    console.error("[mail] проход очереди:", (err as Error).message);
  }
}

/** Запуск работника интервалом (идемпотентно). Проходы не накладываются. */
export function startMailWorker(intervalMs: number = env.mail.workerIntervalMs): void {
  if (timer) return;
  const run = () => {
    if (running) return;
    running = tick().finally(() => {
      running = null;
    });
  };
  timer = setInterval(run, Math.max(250, intervalMs));
  timer.unref(); // работник не должен удерживать процесс скриптов и тестов
  run();
  console.log(`[mail] работник очереди запущен: транспорт '${env.mail.transport}', период ${intervalMs} мс`);
}

/** Остановка: новых проходов нет, идущий — дожидаемся. */
export async function stopMailWorker(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (running) await running;
}
