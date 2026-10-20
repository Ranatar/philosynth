/**
 * Адрес клиента запроса (беседа 13.2, Д-67) — ЕДИНСТВЕННОЕ место сервера,
 * где читаются заголовки X-Forwarded-For / X-Real-IP.
 *
 * До 13.2 лимитер (rate-limiter 0.2) и журнал администратора (admin-audit
 * 8.1) брали первый адрес из X-Forwarded-For без оглядки на то, стоит ли
 * перед сервером доверенный прокси. За Caddy (deploy/philosynth-hosting.md)
 * первый адрес верен; при прямом обращении к порту сервера заголовок
 * пишет сам клиент — и подменяет им ключ лимитера и строку журнала.
 *
 * Правило: заголовки прокси читаются ТОЛЬКО при TRUST_PROXY=true
 * (env.trustProxy; по умолчанию выключен — .env.example; в установщике
 * публичного размещения включён, потому что там сервер слушает петлю за
 * Caddy). Иначе — адрес соединения (getConnInfo), и только он.
 *
 * Для приложения на этом правиле строятся: clientIdentity лимитера (ключ
 * `ip:`), clientIpOf журнала admin_audit.
 */
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

import { env } from "../env.js";

/** Первый адрес списка X-Forwarded-For («клиент, прокси1, …»); пусто → null. */
export function firstForwardedAddress(header: string | undefined): string | null {
  if (!header) return null;
  const first = header.split(",")[0]?.trim();
  return first ? first : null;
}

/** Адрес соединения из сокета; вне node-server (тесты на app.request) — null. */
export function socketAddressOf(c: Context): string | null {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

/**
 * Адрес клиента: под TRUST_PROXY — X-Forwarded-For (первый) → X-Real-IP →
 * адрес соединения; без него — только адрес соединения. null — адреса нет
 * (запрос без сокета, например app.request в сторожах).
 */
export function clientAddressOf(c: Context): string | null {
  if (env.trustProxy) {
    const fwd = firstForwardedAddress(c.req.header("x-forwarded-for"));
    if (fwd) return fwd;
    const real = c.req.header("x-real-ip")?.trim();
    if (real) return real;
  }
  return socketAddressOf(c);
}
