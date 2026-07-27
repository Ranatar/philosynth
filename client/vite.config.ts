import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Dev-прокси: клиент ходит на same-origin /api и /ws, Vite проксирует
 * на Hono-сервер (server/env.ts: PORT=3000). В production клиент
 * раздаётся тем же origin'ом, что и API, — прокси не нужен.
 */
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
});
