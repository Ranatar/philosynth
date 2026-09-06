/**
 * AES-256-GCM шифрование пользовательских API-ключей (беседа 6.1;
 * 02-data-model §2.19 api_keys.encrypted_key BYTEA, 05-file-structure
 * server/utils/crypto.ts).
 *
 * Контракт запроса 1 беседы 6.1:
 *   encrypt(plaintext, key)            → { ciphertext, iv, tag }
 *   decrypt(ciphertext, iv, tag, key)  → plaintext
 *
 * Ключ шифрования — env API_KEY_ENCRYPTION_SECRET (в тексте протокола он
 * назван ENCRYPTION_KEY; имя переменной закреплено env.ts/.env.example
 * беседы 0.1 — оставлено). Материал ключа выводится через SHA-256 из
 * секрета любой длины: 32-байтовый hex из .env.example даёт тот же
 * результат, что и произвольная строка, — оператор не обязан угадывать
 * формат. Пустой секрет — ошибка конфигурации (ключи не шифруем
 * «как получится»).
 *
 * Упаковка для BYTEA (packSecret/unpackSecret): iv(12) ‖ tag(16) ‖
 * ciphertext — одна колонка, без дополнительных полей в схеме.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ALGO = "aes-256-gcm";
export const IV_LENGTH = 12;
export const TAG_LENGTH = 16;

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

export class CryptoConfigError extends Error {
  readonly code = "INTERNAL_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "CryptoConfigError";
  }
}

/** Секрет из env → 32-байтовый ключ AES (SHA-256). */
export function deriveKey(secret: string): Buffer {
  if (!secret || !secret.trim()) {
    throw new CryptoConfigError(
      "API_KEY_ENCRYPTION_SECRET не задан — хранение API-ключей недоступно",
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

/** AES-256-GCM: случайный IV на каждое шифрование. */
export function encrypt(plaintext: string, key: Buffer): EncryptedPayload {
  if (key.length !== 32) {
    throw new CryptoConfigError("Ключ AES-256 должен быть длиной 32 байта");
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

/** Обратная операция; неверный ключ/повреждённые данные → исключение
 *  (auth tag не сходится). */
export function decrypt(
  ciphertext: Buffer,
  iv: Buffer,
  tag: Buffer,
  key: Buffer,
): string {
  if (key.length !== 32) {
    throw new CryptoConfigError("Ключ AES-256 должен быть длиной 32 байта");
  }
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** iv ‖ tag ‖ ciphertext → один Buffer для BYTEA. */
export function packSecret(p: EncryptedPayload): Buffer {
  return Buffer.concat([p.iv, p.tag, p.ciphertext]);
}

export function unpackSecret(packed: Buffer): EncryptedPayload {
  if (packed.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("Повреждённая запись зашифрованного ключа");
  }
  return {
    iv: packed.subarray(0, IV_LENGTH),
    tag: packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH),
    ciphertext: packed.subarray(IV_LENGTH + TAG_LENGTH),
  };
}
