/**
 * Письма службы (беседа 9.1, запрос 1, п. 3b): подтверждение адреса и сброс
 * пароля — текст и HTML. Оба письма ОПЕРАЦИОННЫЕ: ответ на действие самого
 * пользователя, поэтому без отписки, List-Unsubscribe и рекламного тона —
 * тон как у документов службы. О доставке модуль не знает ничего.
 *
 * HTML самодостаточен: без внешних ресурсов (картинок, шрифтов, стилей) —
 * почтовые клиенты их режут, а трекинг-пиксели службе не нужны. Палитра —
 * значения :root клиента (ink/gold/off), вписанные литералами: CSS-переменных
 * в письме нет.
 */
import { esc } from "@philosynth/shared/utils/escape";
import { tl } from "@philosynth/shared/i18n/t";
import { currentLocale } from "../../i18n/locale.js";

export interface Letter {
  subject: string;
  text: string;
  html: string;
}

export interface LetterInput {
  /** Отображаемое имя адресата; пусто — обращение без имени */
  displayName?: string | null | undefined;
  /** Полная ссылка с доводом */
  link: string;
  /** Срок жизни ссылки, часов */
  ttlHours: number;
}

const SERVICE_NAME = "PhiloSynth";

/* 14.1 (Д-51): все фразы письма — tl() под языком ПОЛУЧАТЕЛЯ: сборку
 * оборачивает runWithLocale(user.uiLocale) в queueTokenMail (auth-tokens.ts),
 * тело в очереди хранится уже собранным — это и есть язык чтения для одного
 * адресата. Вне контекста языка (тесты, сиды) — русский текст, как прежде. */

function greeting(displayName: string | null | undefined): string {
  const name = (displayName ?? "").trim();
  return name
    ? tl("server.mail.templates.greetingNamed", "Здравствуйте, {name}.", { name })
    : tl("server.mail.templates.greeting", "Здравствуйте.");
}

/** «N час / часа / часов» — плюралом каталога (ru: one/few/many; en/de: one/other). */
function hoursPhrase(h: number): string {
  const n = Math.round(h);
  return tl("server.mail.templates.hours", "{n, plural, one {# час} few {# часа} many {# часов} other {# часа}}", { n });
}

function htmlShell(title: string, paragraphs: string[], link: string, linkLabel: string, footer: string[]): string {
  const p = (t: string) =>
    `<p style="margin:0 0 14px;font:15px/1.6 Georgia,'Times New Roman',serif;color:#1a1814;">${t}</p>`;
  const small = (t: string) =>
    `<p style="margin:0 0 8px;font:12px/1.5 Georgia,'Times New Roman',serif;color:#8a8278;">${t}</p>`;
  return [
    "<!doctype html>",
    `<html lang="${esc(currentLocale())}"><head><meta charset="utf-8"><title>${esc(title)}</title></head>`,
    `<body style="margin:0;padding:24px;background:#f2f0eb;">`,
    `<div style="max-width:560px;margin:0 auto;padding:28px 32px;background:#ffffff;border:1px solid #d9d4c5;">`,
    `<div style="margin:0 0 20px;padding:0 0 12px;border-bottom:2px solid #b8860b;font:700 20px/1.2 Georgia,'Times New Roman',serif;color:#1a1814;">${SERVICE_NAME}</div>`,
    ...paragraphs.map(p),
    `<p style="margin:0 0 18px;"><a href="${esc(link)}" style="display:inline-block;padding:10px 18px;background:#1a1814;color:#ffffff;text-decoration:none;font:13px/1 'Courier New',monospace;letter-spacing:1px;text-transform:uppercase;">${esc(linkLabel)}</a></p>`,
    small(tl("server.mail.templates.copyLinkHint", "Если кнопка не открывается, скопируйте ссылку в адресную строку:")),
    `<p style="margin:0 0 18px;font:12px/1.5 'Courier New',monospace;color:#1a1814;word-break:break-all;">${esc(link)}</p>`,
    ...footer.map(small),
    "</div></body></html>",
  ].join("\n");
}

/** Письмо с подтверждением адреса (регистрация и «отправить ещё раз»). */
export function verifyEmailLetter(input: LetterInput): Letter {
  const ttl = hoursPhrase(input.ttlHours);
  const subject = tl("server.mail.templates.verifySubject", "{service}: подтверждение адреса", { service: SERVICE_NAME });
  const lead = tl("server.mail.templates.verifyLead", "Этот адрес указан при регистрации в службе {service}. Чтобы подтвердить, что он ваш, перейдите по ссылке:", { service: SERVICE_NAME });
  const tail = [
    tl("server.mail.templates.verifyTtl", "Ссылка действует {ttl} и срабатывает один раз. Новое письмо с подтверждением делает прежнюю ссылку недействительной.", { ttl }),
    tl("server.mail.templates.verifyIgnore", "Если вы не регистрировались в {service}, ничего делать не нужно: без перехода по ссылке адрес останется неподтверждённым.", { service: SERVICE_NAME }),
  ];
  const text = [greeting(input.displayName), "", lead, "", input.link, "", ...tail, "", `— ${SERVICE_NAME}`].join("\n");
  const html = htmlShell(subject, [esc(greeting(input.displayName)), esc(lead)], input.link, tl("server.mail.templates.verifyButton", "Подтвердить адрес"), tail);
  return { subject, text, html };
}

/** Письмо со ссылкой сброса пароля. */
export function passwordResetLetter(input: LetterInput): Letter {
  const ttl = hoursPhrase(input.ttlHours);
  const subject = tl("server.mail.templates.resetSubject", "{service}: сброс пароля", { service: SERVICE_NAME });
  const lead = tl("server.mail.templates.resetLead", "Для учётной записи с этим адресом запрошен сброс пароля. Чтобы задать новый пароль, перейдите по ссылке:");
  const tail = [
    tl("server.mail.templates.resetTtl", "Ссылка действует {ttl} и срабатывает один раз. После смены пароля все сеансы входа будут завершены.", { ttl }),
    tl("server.mail.templates.resetIgnore", "Если вы не запрашивали сброс, ничего делать не нужно: пароль останется прежним."),
  ];
  const text = [greeting(input.displayName), "", lead, "", input.link, "", ...tail, "", `— ${SERVICE_NAME}`].join("\n");
  const html = htmlShell(subject, [esc(greeting(input.displayName)), esc(lead)], input.link, tl("server.mail.templates.resetButton", "Задать новый пароль"), tail);
  return { subject, text, html };
}
