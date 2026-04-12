import "dotenv/config";

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env variable: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  // Server
  PORT: Number(optional("PORT", "3000")),
  NODE_ENV: optional("NODE_ENV", "development") as
    | "development"
    | "production"
    | "test",
  LOG_LEVEL: optional("LOG_LEVEL", "info"),

  // PostgreSQL
  DATABASE_URL: required("DATABASE_URL"),

  // Redis
  REDIS_URL: optional("REDIS_URL", "redis://localhost:6379"),

  // Auth
  SESSION_SECRET: required("SESSION_SECRET"),

  // Claude API (server-side, for service billing mode)
  ANTHROPIC_API_KEY: optional("ANTHROPIC_API_KEY", ""),

  // Encryption key for user API keys (AES-256, 32 bytes hex)
  API_KEY_ENCRYPTION_SECRET: required("API_KEY_ENCRYPTION_SECRET"),

  // Stripe (optional, for service billing)
  STRIPE_SECRET_KEY: optional("STRIPE_SECRET_KEY", ""),
  STRIPE_WEBHOOK_SECRET: optional("STRIPE_WEBHOOK_SECRET", ""),

  // CORS
  CLIENT_URL: optional("CLIENT_URL", "http://localhost:5173"),
} as const;
