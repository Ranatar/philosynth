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

  rateLimit: {
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
