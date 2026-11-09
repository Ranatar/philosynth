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

/** HTML-оболочка письма; link = null — письмо без кнопки и ссылки (15.3:
 *  уведомление на прежний адрес — довода в нём нет и быть не должно). */
function htmlShell(title: string, paragraphs: string[], link: string | null, linkLabel: string, footer: string[]): string {
  const p = (t: string) =>
    `<p style="margin:0 0 14px;font:15px/1.6 Georgia,'Times New Roman',serif;color:#1a1814;">${t}</p>`;
  const small = (t: string) =>
    `<p style="margin:0 0 8px;font:12px/1.5 Georgia,'Times New Roman',serif;color:#8a8278;">${t}</p>`;
  const linkBlock = link === null
    ? []
    : [
        `<p style="margin:0 0 18px;"><a href="${esc(link)}" style="display:inline-block;padding:10px 18px;background:#1a1814;color:#ffffff;text-decoration:none;font:13px/1 'Courier New',monospace;letter-spacing:1px;text-transform:uppercase;">${esc(linkLabel)}</a></p>`,
        small(tl("server.mail.templates.copyLinkHint", "Если кнопка не открывается, скопируйте ссылку в адресную строку:")),
        `<p style="margin:0 0 18px;font:12px/1.5 'Courier New',monospace;color:#1a1814;word-break:break-all;">${esc(link)}</p>`,
      ];
  return [
    "<!doctype html>",
    `<html lang="${esc(currentLocale())}"><head><meta charset="utf-8"><title>${esc(title)}</title></head>`,
    `<body style="margin:0;padding:24px;background:#f2f0eb;">`,
    `<div style="max-width:560px;margin:0 auto;padding:28px 32px;background:#ffffff;border:1px solid #d9d4c5;">`,
    `<div style="margin:0 0 20px;padding:0 0 12px;border-bottom:2px solid #b8860b;font:700 20px/1.2 Georgia,'Times New Roman',serif;color:#1a1814;">${SERVICE_NAME}</div>`,
    ...paragraphs.map(p),
    ...linkBlock,
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

/* 15.3 (Д-73): смена адреса — два письма. Первое уходит на НОВЫЙ адрес и несёт
 * ссылку-довод: только переход с этого ящика доказывает, что он свой. Второе —
 * уведомление на ПРЕЖНИЙ адрес после подтверждения, без ссылки: человек,
 * потерявший доступ к учётной записи, узнаёт о смене и может обратиться к
 * владельцу службы (запасной ход — scripts/seed/reset-password.ts). */

export interface EmailChangeLetterInput extends LetterInput {
  /** Новый адрес — он и адресат; в тексте называется явно */
  newEmail: string;
}

/** Письмо на НОВЫЙ адрес со ссылкой подтверждения смены. */
export function emailChangeLetter(input: EmailChangeLetterInput): Letter {
  const ttl = hoursPhrase(input.ttlHours);
  const subject = tl("server.mail.templates.changeSubject", "{service}: подтверждение нового адреса", { service: SERVICE_NAME });
  const lead = tl("server.mail.templates.changeLead", "Для учётной записи в службе {service} запрошена смена адреса на {newEmail}. Чтобы подтвердить, что этот ящик ваш, перейдите по ссылке:", { service: SERVICE_NAME, newEmail: input.newEmail });
  const tail = [
    tl("server.mail.templates.changeTtl", "Ссылка действует {ttl} и срабатывает один раз. Новый запрос смены делает прежнюю ссылку недействительной.", { ttl }),
    tl("server.mail.templates.changeIgnore", "Если вы не запрашивали смену адреса, ничего делать не нужно: без перехода по ссылке адрес останется прежним."),
  ];
  const text = [greeting(input.displayName), "", lead, "", input.link, "", ...tail, "", `— ${SERVICE_NAME}`].join("\n");
  const html = htmlShell(subject, [esc(greeting(input.displayName)), esc(lead)], input.link, tl("server.mail.templates.changeButton", "Подтвердить новый адрес"), tail);
  return { subject, text, html };
}

export interface EmailChangedNoticeInput {
  displayName?: string | null | undefined;
  /** Адрес, на который учётная запись переведена */
  newEmail: string;
}

/** Уведомление на ПРЕЖНИЙ адрес: смена состоялась; ссылок и доводов нет. */
export function emailChangedNoticeLetter(input: EmailChangedNoticeInput): Letter {
  const subject = tl("server.mail.templates.changedSubject", "{service}: адрес учётной записи изменён", { service: SERVICE_NAME });
  const lead = tl("server.mail.templates.changedLead", "Адрес учётной записи в службе {service} изменён на {newEmail}. Письма службы теперь приходят туда; этот адрес к учётной записи больше не привязан.", { service: SERVICE_NAME, newEmail: input.newEmail });
  const tail = [
    tl("server.mail.templates.changedIgnore", "Если смену запрашивали вы, ничего делать не нужно."),
    tl("server.mail.templates.changedAlert", "Если смену запрашивали не вы, учётная запись могла быть доступна постороннему: обратитесь к владельцу службы — вход и сброс пароля по этому адресу уже невозможны."),
  ];
  const text = [greeting(input.displayName), "", lead, "", ...tail, "", `— ${SERVICE_NAME}`].join("\n");
  const html = htmlShell(subject, [esc(greeting(input.displayName)), esc(lead)], null, "", tail.map(esc));
  return { subject, text, html };
}

/* 16.2: участники и уведомления — три письма. Приглашение адресу С аккаунтом
 * ведёт на страницу принятия (/invitations/:synthesisId, под входом); адресу
 * БЕЗ аккаунта — на регистрацию с доводом в ссылке (ссылка одноразовая,
 * 72 ч). Сводка непрочитанного — один список строк, собранный под языком
 * ПОЛУЧАТЕЛЯ при постановке (services/notifications.ts), без ссылок на
 * отдельные объекты — одна ссылка на концепцию у каждой строки. */

/** Название роли для письма (тексты интерфейса — те же слова). */
export function memberRoleLabel(role: "reviewer" | "editor"): string {
  return role === "editor"
    ? tl("server.mail.templates.roleEditor", "редактор")
    : tl("server.mail.templates.roleReviewer", "рецензент");
}

export interface MemberInviteLetterInput {
  displayName?: string | null | undefined;
  inviterName: string;
  synthesisTitle: string;
  role: "reviewer" | "editor";
  /** Ссылка на страницу принятия (/invitations/:synthesisId) */
  link: string;
}

/** Приглашение адресу С аккаунтом: принять или отклонить — на странице под входом. */
export function memberInviteLetter(input: MemberInviteLetterInput): Letter {
  const subject = tl("server.mail.templates.inviteSubject", "{service}: приглашение в концепцию «{title}»", { service: SERVICE_NAME, title: input.synthesisTitle });
  const lead = tl("server.mail.templates.inviteLead", "{inviter} приглашает вас участвовать в обсуждении концепции «{title}» в роли «{role}». Принять или отклонить приглашение можно на странице:", { inviter: input.inviterName, title: input.synthesisTitle, role: memberRoleLabel(input.role) });
  const tail = [
    tl("server.mail.templates.inviteTail", "Участник видит концепцию целиком, в том числе приватную, и может комментировать и рецензировать её; документ обсуждением не меняется."),
    tl("server.mail.templates.inviteIgnore", "Если приглашение вам не нужно, ничего делать не обязательно — его можно отклонить на той же странице."),
  ];
  const text = [greeting(input.displayName), "", lead, "", input.link, "", ...tail, "", `— ${SERVICE_NAME}`].join("\n");
  const html = htmlShell(subject, [esc(greeting(input.displayName)), esc(lead)], input.link, tl("server.mail.templates.inviteButton", "Открыть приглашение"), tail);
  return { subject, text, html };
}

export interface MemberInviteRegisterLetterInput {
  inviterName: string;
  synthesisTitle: string;
  role: "reviewer" | "editor";
  /** Ссылка на регистрацию с доводом (/register?invite=…) */
  link: string;
  ttlHours: number;
}

/** Приглашение адресу БЕЗ аккаунта: регистрация по одноразовой ссылке. */
export function memberInviteRegisterLetter(input: MemberInviteRegisterLetterInput): Letter {
  const ttl = hoursPhrase(input.ttlHours);
  const subject = tl("server.mail.templates.inviteSubject", "{service}: приглашение в концепцию «{title}»", { service: SERVICE_NAME, title: input.synthesisTitle });
  const lead = tl("server.mail.templates.inviteRegisterLead", "{inviter} приглашает вас участвовать в обсуждении концепции «{title}» в службе {service} в роли «{role}». Учётной записи на этот адрес ещё нет — зарегистрируйтесь по ссылке, и приглашение будет ждать вас в каталоге:", { inviter: input.inviterName, title: input.synthesisTitle, service: SERVICE_NAME, role: memberRoleLabel(input.role) });
  const tail = [
    tl("server.mail.templates.inviteRegisterTtl", "Ссылка действует {ttl} и срабатывает один раз. Новое приглашение на этот адрес делает прежнюю ссылку недействительной.", { ttl }),
    tl("server.mail.templates.inviteRegisterIgnore", "Если вы не ждёте приглашения, ничего делать не нужно: без регистрации по ссылке участие не возникает."),
  ];
  const text = [greeting(null), "", lead, "", input.link, "", ...tail, "", `— ${SERVICE_NAME}`].join("\n");
  const html = htmlShell(subject, [esc(greeting(null)), esc(lead)], input.link, tl("server.mail.templates.inviteRegisterButton", "Зарегистрироваться по приглашению"), tail);
  return { subject, text, html };
}

export interface DigestLine {
  /** Готовая фраза уведомления на языке получателя */
  text: string;
  /** Ссылка на концепцию */
  link: string;
}

export interface DigestLetterInput {
  displayName?: string | null | undefined;
  lines: DigestLine[];
  /** Сколько непрочитанного всего (больше, чем строк, если список обрезан) */
  unreadTotal: number;
  /** Ссылка на список уведомлений в приложении */
  link: string;
}

/** Сводка непрочитанных уведомлений — не чаще раза в N часов одному получателю. */
export function notificationDigestLetter(input: DigestLetterInput): Letter {
  const n = input.unreadTotal;
  const subject = tl("server.mail.templates.digestSubject", "{service}: {n, plural, one {# новое уведомление} few {# новых уведомления} many {# новых уведомлений} other {# новых уведомления}}", { service: SERVICE_NAME, n });
  const lead = tl("server.mail.templates.digestLead", "Пока вас не было, в концепциях, где вы участвуете, произошло следующее:");
  const more = input.unreadTotal > input.lines.length
    ? [tl("server.mail.templates.digestMore", "…и ещё {n, plural, one {# уведомление} few {# уведомления} many {# уведомлений} other {# уведомления}} — все в приложении.", { n: input.unreadTotal - input.lines.length })]
    : [];
  const tail = [
    tl("server.mail.templates.digestTail", "Сводка приходит не чаще раза в несколько часов и только при непрочитанном; отключить её или отдельные категории можно в профиле."),
  ];
  const text = [
    greeting(input.displayName), "", lead, "",
    ...input.lines.map((l) => `— ${l.text}\n  ${l.link}`),
    ...more.map((m) => `\n${m}`),
    "", input.link, "", ...tail, "", `— ${SERVICE_NAME}`,
  ].join("\n");
  // Каждая строка сводки — свой абзац (htmlShell оборачивает в <p>; список
  // внутри <p> был бы невалидной разметкой)
  const items = input.lines.map(
    (l) => `— ${esc(l.text)} — <a href="${esc(l.link)}" style="color:#1a1814;">${esc(tl("server.mail.templates.digestOpen", "открыть"))}</a>`,
  );
  const html = htmlShell(subject, [esc(greeting(input.displayName)), esc(lead), ...items, ...more.map(esc)], input.link, tl("server.mail.templates.digestButton", "Открыть уведомления"), tail);
  return { subject, text, html };
}
