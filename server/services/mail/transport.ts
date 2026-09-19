/**
 * Почтовый транспорт (беседа 9.1, запрос 1, п. 3a). ТОЛЬКО отправка:
 * о содержании писем модуль не знает ничего — получает готовые тему, текст
 * и HTML (templates.ts), отдаёт исход.
 *
 * Два режима (env.mail.transport):
 *   'smtp'    — nodemailer, соединение создаётся лениво при первом письме;
 *   'console' — письмо печатается в вывод процесса вместо отправки. Стенд и
 *               разработка обязаны работать БЕЗ почтового узла — тем же
 *               приёмом, каким tools/stripe-mock.mjs (8.2) снимает нужду в
 *               аккаунте Stripe. Печатается ТЕКСТОВАЯ версия (ссылка в ней
 *               читается глазами и харнессом), HTML — только длиной.
 *
 * Исход отправки — не исключение, а значение с РОДОМ отказа (п. 3d):
 *   permanent: true  — 5xx SMTP, негодный адрес: повторять бессмысленно;
 *   permanent: false — 4xx, сеть, таймаут, отказ авторизации у узла:
 *                      повторить позже.
 * Отказ АВТОРИЗАЦИИ (EAUTH, 535) и отказ на стадии СОЕДИНЕНИЯ считаются
 * временными вопреки коду 5xx: это беда настройки службы, а не адресата —
 * иначе опечатка в SMTP_PASSWORD разом похоронила бы всю очередь.
 */
import { createTransport, type Transporter } from "nodemailer";

import { env } from "../../env.js";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SendResult =
  | { ok: true }
  | { ok: false; permanent: boolean; error: string };

/** Граница блока письма в выводе режима 'console' (по ней режут харнессы). */
export const CONSOLE_MAIL_BEGIN = "──────── [mail:console] письмо ────────";
export const CONSOLE_MAIL_END = "──────── [mail:console] конец ─────────";

let smtp: Transporter | null = null;

function smtpTransporter(): Transporter {
  if (!smtp) {
    const { host, port, user, password, secure } = env.mail.smtp;
    smtp = createTransport({
      host,
      port,
      secure,
      ...(user ? { auth: { user, pass: password } } : {}),
      // Работник не должен висеть на мёртвом узле дольше периода разбора
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
  }
  return smtp;
}

/** Текст письма для вывода — отдельной функцией, чтобы смоук сверял форму. */
export function formatConsoleMail(mail: OutgoingMail, from: string): string {
  return [
    CONSOLE_MAIL_BEGIN,
    `From: ${from}`,
    `To: ${mail.to}`,
    `Subject: ${mail.subject}`,
    "",
    mail.text,
    "",
    `(HTML-версия: ${mail.html.length} симв.)`,
    CONSOLE_MAIL_END,
  ].join("\n");
}

interface SmtpLikeError {
  message?: string;
  code?: string;
  responseCode?: number;
  command?: string;
}

/**
 * Род отказа по ошибке nodemailer. Чистая функция — проверяется смоуком
 * без сети.
 */
export function classifySendError(err: unknown): { permanent: boolean; error: string } {
  const e = (err ?? {}) as SmtpLikeError;
  const parts = [e.code, e.responseCode ? String(e.responseCode) : "", e.message ?? String(err)];
  const error = parts.filter(Boolean).join(" ").slice(0, 1000);

  // Беда настройки службы, а не адресата — повторять
  if (e.code === "EAUTH" || e.command === "CONN" || e.command === "AUTH") {
    return { permanent: false, error };
  }
  // Код ответа узла решает ПЕРВЫМ: отказ RCPT TO nodemailer помечает
  // EENVELOPE при ЛЮБОМ коде, и 451 на адресате — временный, а не «негодный
  // адрес» (найдено тестом R7 на моке SMTP)
  const rc = e.responseCode;
  if (typeof rc === "number" && rc >= 500 && rc < 600) return { permanent: true, error };
  if (typeof rc === "number" && rc >= 400 && rc < 500) return { permanent: false, error };
  // Негодный адрес/конверт БЕЗ ответа узла — nodemailer отказал до разговора
  if (e.code === "EENVELOPE") return { permanent: true, error };
  // сеть, таймаут, DNS, неизвестное — временный
  return { permanent: false, error };
}

export async function sendMail(mail: OutgoingMail): Promise<SendResult> {
  if (env.mail.transport === "console") {
    console.log(formatConsoleMail(mail, env.mail.from));
    return { ok: true };
  }
  try {
    await smtpTransporter().sendMail({
      from: env.mail.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, ...classifySendError(err) };
  }
}

/** Закрытие SMTP-соединения (graceful shutdown; в 'console' — no-op). */
export function closeTransport(): void {
  if (smtp) {
    smtp.close();
    smtp = null;
  }
}
