/**
 * Типизированные env-переменные (см. .env.example).
 * Валидация — при старте сервера; отсутствие критичной переменной
 * в production роняет процесс сразу, а не при первом обращении.
 */
function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Отсутствует обязательная переменная окружения: ${name}`);
  }
  return v;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Переменная ${name} должна быть числом, получено: ${raw}`);
  }
  return n;
}

const isProd = process.env.NODE_ENV === "production";

/**
 * Почта (беседа 9.1). MAIL_TRANSPORT: 'smtp' — отправка через nodemailer;
 * 'console' — письмо печатается в вывод вместо отправки (стенд и разработка
 * обязаны работать БЕЗ почтового узла — тот же приём, каким
 * tools/stripe-mock.mjs снимает нужду в аккаунте Stripe). Умолчание вне
 * production — 'console', в production — 'smtp'.
 *
 * В production пустой SMTP_HOST (или пустой MAIL_FROM) — ОТКАЗ ПРИ ЗАПУСКЕ,
 * при любом MAIL_TRANSPORT: сервер, который стартовал и молча теряет письма
 * о сбросе пароля, хуже сервера, который не стартовал. Модуль читается один
 * раз при импорте (09 §5, 6.1) — переменные задавать ДО импорта.
 */
type MailTransportKind = "smtp" | "console";
function mailTransportKind(): MailTransportKind {
  const raw = (process.env.MAIL_TRANSPORT ?? "").trim().toLowerCase();
  if (raw === "") return isProd ? "smtp" : "console";
  if (raw === "smtp" || raw === "console") return raw;
  throw new Error(
    `Переменная MAIL_TRANSPORT должна быть 'smtp' или 'console', получено: ${raw}`,
  );
}
const mailTransport = mailTransportKind();
const smtpHost = (process.env.SMTP_HOST ?? "").trim();
const mailFrom = (process.env.MAIL_FROM ?? "").trim();
if (isProd && !smtpHost) {
  throw new Error(
    "Почта не настроена: в production переменная SMTP_HOST обязательна. " +
      "Без неё письма о подтверждении адреса и сбросе пароля терялись бы молча — " +
      "сервер не запускается. Задайте SMTP_HOST, SMTP_PORT, SMTP_USER, " +
      "SMTP_PASSWORD, MAIL_FROM (README, раздел «Почта»).",
  );
}
if (isProd && !mailFrom) {
  throw new Error(
    "Почта не настроена: в production переменная MAIL_FROM обязательна " +
      "(адрес отправителя; README, раздел «Почта»).",
  );
}
if (mailTransport === "smtp" && !smtpHost) {
  throw new Error(
    "MAIL_TRANSPORT='smtp' требует SMTP_HOST; для работы без почтового узла " +
      "задайте MAIL_TRANSPORT='console' (письма печатаются в вывод).",
  );
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd,
  port: num("PORT", 3000),
  clientOrigin: req("CLIENT_ORIGIN", "http://localhost:5173"),

  databaseUrl: req(
    "DATABASE_URL",
    isProd
      ? undefined
      : "postgres://philosynth:philosynth_dev@localhost:5432/philosynth",
  ),
  redisUrl: req("REDIS_URL", isProd ? undefined : "redis://localhost:6379"),

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
    maxTokens: num("ANTHROPIC_MAX_TOKENS", 20_000),
    /** База API (беседа 1.4): подмена в тестах (мок-SSE) и при прокси;
     *  штатное значение — облако Anthropic. */
    baseUrl: process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
  },

  /** AES-256 ключ шифрования пользовательских API-ключей (32 байта hex) */
  apiKeyEncryptionSecret: process.env.API_KEY_ENCRYPTION_SECRET ?? "",

  session: {
    cookieName: process.env.SESSION_COOKIE_NAME ?? "philosynth_session",
    cookieSecure: process.env.SESSION_COOKIE_SECURE === "true",
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    billingMarkup: num("BILLING_MARKUP", 1.2),
    /** База REST API Stripe (беседа 6.1): мок в тестах — тот же приём,
     *  что ANTHROPIC_BASE_URL. */
    apiBase: process.env.STRIPE_API_BASE ?? "https://api.stripe.com",
  },

  billing: {
    /**
     * Принуждение биллинга (беседа 6.1). true — запрос без BYO-Key,
     * подписки с квотой и достаточного баланса отклоняется
     * (BILLING_REQUIRED / QUOTA_EXCEEDED / INSUFFICIENT_BALANCE).
     * false (дефолт вне production) — при отсутствии источника оплаты
     * операция идёт серверным ключом в режиме 'balance' и списывается с
     * баланса, который при этом уходит в минус: учёт честный, гейта нет.
     * Иначе двадцать тестовых стендов бесед 1.4–5.5 (пользователи с
     * нулевым балансом, мок Claude) потребовали бы пополнения.
     */
    enforce:
      process.env.BILLING_ENFORCE !== undefined
        ? process.env.BILLING_ENFORCE === "true"
        : isProd,
    /** Минимальный резерв баланса, ниже которого операция в режиме
     *  'balance' не запускается (гейт «баланс > estimatedCost» — точная
     *  оценка есть только у POST /syntheses; для прочих операций порог). */
    minReserveUsd: num("BILLING_MIN_RESERVE_USD", 0.05),
  },

  mail: {
    /** 'smtp' | 'console' — см. комментарий к mailTransportKind выше */
    transport: mailTransport,
    smtp: {
      host: smtpHost,
      port: num("SMTP_PORT", 587),
      user: process.env.SMTP_USER ?? "",
      password: process.env.SMTP_PASSWORD ?? "",
      /** true — TLS с первого байта (обычно порт 465); false — STARTTLS */
      secure: process.env.SMTP_SECURE === "true",
    },
    from: mailFrom || "PhiloSynth <no-reply@philosynth.localhost>",
    /** База ссылок в письмах — адрес КЛИЕНТА (страницы /verify-email/:token
     *  и /reset-password/:token живут в SPA); умолчание — CLIENT_ORIGIN */
    // ПУСТАЯ строка — тоже «не задано» (строка `PUBLIC_BASE_URL=` из
    // .env.example): с `??` ссылки в письмах выходили без узла — найдено
    // харнессом 9.1
    publicBaseUrl: (
      (process.env.PUBLIC_BASE_URL ?? "").trim() ||
      (process.env.CLIENT_ORIGIN ?? "").trim() ||
      "http://localhost:5173"
    ).replace(/\/+$/, ""),
    /** Период разбора очереди писем работником, мс */
    workerIntervalMs: num("MAIL_WORKER_INTERVAL_MS", 5_000),
    /** Задержки повторов при ВРЕМЕННОМ отказе, мс (1 мин, 5, 15, 60, 6 ч);
     *  попыток всего = задержек + 1, после последней — 'failed'.
     *  Переменная — для стендов (приём STREAM_RETRY_DELAYS 1.4) */
    retryDelaysMs: (process.env.MAIL_RETRY_DELAYS ?? "60000,300000,900000,3600000,21600000")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0),
  },

  rateLimit: {
    /** Запросов, порождающих письмо (регистрация не в счёт), в час на
     *  сессию/IP (беседа 9.1): форма сброса без авторизации — иначе ею
     *  можно засыпать чужой ящик */
    mailRequestsPerHour: num("RATE_LIMIT_MAIL_PER_HOUR", 10),
    concurrentGenerations: num("RATE_LIMIT_CONCURRENT_GENERATIONS", 3),
    wsMessagesPerMinute: num("RATE_LIMIT_WS_MESSAGES_PER_MINUTE", 60),
    /** HTTP-запросов в минуту на пользователя/IP (беседа 0.2) */
    httpRequestsPerMinute: num("RATE_LIMIT_HTTP_PER_MINUTE", 60),
  },

  streaming: {
    /** err.kind = 'stuck' при отсутствии токенов дольше этого времени, мс */
    stuckMs: num("STREAM_STUCK_MS", 45_000),
    /** Задержки ретраев pre-stream, мс */
    retryDelays: (process.env.STREAM_RETRY_DELAYS ?? "1000,3000,8000")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  },
} as const;

export type Env = typeof env;
