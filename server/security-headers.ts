/**
 * Заголовки безопасности ответов сервера (беседа 13.1, Д-63).
 *
 * Документ рисуется разметкой (`SectionView` — dangerouslySetInnerHTML), и
 * санитайзер на входах — первый рубеж; CSP — второй: даже если какой-то вход
 * пропустит встроенный обработчик (`onerror=`), `javascript:`-ссылку или
 * `<script>`, браузер не исполнит их без `'unsafe-inline'`. Политика одна
 * на весь сервис, объявлена здесь константой и повторена дословно:
 *  - у ответов сервера (`server/index.ts`, middleware на все пути — JSON API
 *    политика не мешает, а экспортированный HTML уходит вложением
 *    Content-Disposition: attachment и под CSP страницы не попадает);
 *  - у `vite preview` (`client/vite.config.ts`) — сборка клиента под CSP для
 *    браузерных харнессов и локальной пробы;
 *  - у Caddy для `client/dist` (`deploy/philosynth-hosting.md`) — настоящая
 *    защита страницы в production: статику отдаёт ставень, не сервер.
 *
 * Состав: script-src 'self' плюс js.stripe.com (Stripe.js вставляется
 * `<script src>` в BillingPage, `client/src/utils/stripe.ts`; его iframe
 * frame-src не ограничен — default-src не задан намеренно, чтобы шрифты
 * Google и запросы к Stripe/API не ломались); object-src 'none'; base-uri
 * 'none'; frame-ancestors 'none' (страницу не встраивают). `vite dev`
 * (react-refresh вставляет встроенный модуль) под эту политику НЕ ставится —
 * только сборка.
 */

export const CONTENT_SECURITY_POLICY =
  "script-src 'self' https://js.stripe.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

/** Заголовки, которые получает каждый ответ сервера. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
};
