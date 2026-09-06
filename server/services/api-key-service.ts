/**
 * API Key Service — BYO-Key (беседа 6.1; 01-architecture §6 п.1,
 * 02-data-model §2.19, 03-specification §2.10 /billing/api-key).
 *
 * Полностью новый код (исходник ключ держал в localStorage браузера).
 *
 *  - storeApiKey(userId, apiKey): AES-256-GCM (utils/crypto, секрет из
 *    env), encrypted_key = iv‖tag‖ciphertext, key_prefix — первые 14
 *    символов → { keyId, prefix }. Решение 6.1: активный ключ у
 *    пользователя ОДИН — прежние активные деактивируются в той же
 *    транзакции (getDecryptedKey протокола читает «активный ключ» в
 *    единственном числе; история остаётся строками is_active=false).
 *  - getDecryptedKey(userId): активный ключ → plaintext | null.
 *  - deleteApiKey(keyId, userId): строка удаляется (не деактивируется —
 *    DELETE §2.10); чужой/несуществующий → ApiKeyError NOT_FOUND.
 *  - listApiKeys(userId): id, prefix, isActive, createdAt — без ключа.
 *
 * Валидация формата (VALIDATION_ERROR): непустая строка без пробелов,
 * префикс «sk-ant-» (формат ключей Anthropic), длина ≥ 20; проверка
 * ЖИВОСТИ ключа здесь не делается — её даёт первый стрим (kind='auth' →
 * пауза с рендерером auth, 01 §4.12 п.6).
 */
import { and, desc, eq } from "drizzle-orm";
import type { ApiKeyInfo } from "@philosynth/shared/types/billing";

import { db, schema } from "../db/index.js";
import { env } from "../env.js";
import {
  decrypt,
  deriveKey,
  encrypt,
  packSecret,
  unpackSecret,
} from "../utils/crypto.js";

const { apiKeys } = schema;

/** Длина префикса ключа, хранимого открыто (02 §2.19: «первые 14 символов») */
export const KEY_PREFIX_LENGTH = 14;
export const API_KEY_MIN_LENGTH = 20;
const API_KEY_RE = /^sk-ant-[A-Za-z0-9_-]+$/;

export class ApiKeyError extends Error {
  code: "VALIDATION_ERROR" | "NOT_FOUND";
  details?: unknown;
  constructor(
    code: "VALIDATION_ERROR" | "NOT_FOUND",
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiKeyError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export interface StoredApiKey {
  keyId: string;
  prefix: string;
}

/** Ключ шифрования из env (ошибка конфигурации — CryptoConfigError). */
function encryptionKey(): Buffer {
  return deriveKey(env.apiKeyEncryptionSecret);
}

/** Валидация формата; возвращает нормализованный (trim) ключ. */
export function validateApiKeyFormat(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new ApiKeyError("VALIDATION_ERROR", "Ключ не задан", {
      key: "Введите API-ключ Anthropic",
    });
  }
  const key = raw.trim();
  if (key.length < API_KEY_MIN_LENGTH || !API_KEY_RE.test(key)) {
    throw new ApiKeyError(
      "VALIDATION_ERROR",
      "Неверный формат ключа",
      { key: "Ожидается ключ Anthropic вида sk-ant-…" },
    );
  }
  return key;
}

export function keyPrefixOf(key: string): string {
  return key.slice(0, KEY_PREFIX_LENGTH);
}

/**
 * a. шифрование; b. INSERT (прежние активные → is_active=false);
 * c. { keyId, prefix }.
 */
export async function storeApiKey(
  userId: string,
  apiKey: string,
): Promise<StoredApiKey> {
  const key = validateApiKeyFormat(apiKey);
  const packed = packSecret(encrypt(key, encryptionKey()));
  const prefix = keyPrefixOf(key);
  return db.transaction(async (tx) => {
    await tx
      .update(apiKeys)
      .set({ isActive: false })
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isActive, true)));
    const [row] = await tx
      .insert(apiKeys)
      .values({ userId, encryptedKey: packed, keyPrefix: prefix, isActive: true })
      .returning({ id: apiKeys.id, keyPrefix: apiKeys.keyPrefix });
    const saved = row as { id: string; keyPrefix: string };
    return { keyId: saved.id, prefix: saved.keyPrefix };
  });
}

/** Активный ключ пользователя → plaintext; нет → null. */
export async function getDecryptedKey(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ encryptedKey: apiKeys.encryptedKey })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isActive, true)))
    .orderBy(desc(apiKeys.createdAt))
    .limit(1);
  if (!row) return null;
  const packed = Buffer.isBuffer(row.encryptedKey)
    ? row.encryptedKey
    : Buffer.from(row.encryptedKey as unknown as Uint8Array);
  const { ciphertext, iv, tag } = unpackSecret(packed);
  return decrypt(ciphertext, iv, tag, encryptionKey());
}

/** Есть ли у пользователя активный ключ (без дешифровки). */
export async function hasActiveApiKey(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isActive, true)))
    .limit(1);
  return !!row;
}

export async function deleteApiKey(
  keyId: string,
  userId: string,
): Promise<void> {
  const deleted = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
    .returning({ id: apiKeys.id });
  if (deleted.length === 0) {
    throw new ApiKeyError("NOT_FOUND", "Ключ не найден");
  }
}

export async function listApiKeys(userId: string): Promise<ApiKeyInfo[]> {
  const rows = await db
    .select({
      id: apiKeys.id,
      prefix: apiKeys.keyPrefix,
      isActive: apiKeys.isActive,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));
  return rows.map((r) => ({
    id: r.id,
    prefix: r.prefix,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  }));
}
