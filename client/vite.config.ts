import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Dev-прокси: клиент ходит на same-origin /api и /ws, Vite проксирует
 * на Hono-сервер (server/env.ts: PORT=3000). В production клиент
 * раздаётся тем же origin'ом, что и API, — прокси не нужен.
 *
 * Беседа 13.1 (Д-63): СБОРКА под `vite preview` получает те же заголовки
 * безопасности, что ответы сервера (server/security-headers.ts) и Caddy для
 * client/dist (deploy/philosynth-hosting.md) — политика повторена дословно,
 * равенство трёх копий сторожит check:integration (4be). На `vite dev` CSP
 * не ставится: react-refresh вставляет встроенный модуль, который
 * script-src 'self' запретил бы.
 */
const CONTENT_SECURITY_POLICY =
  "script-src 'self' https://js.stripe.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: false,
      },
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
  preview: {
    headers: {
      "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
    },
  },
});
