/// <reference types="vite/client" />
// Типы import.meta.env (vite). До беседы 1.5b клиент import.meta.env не
// использовал — файл появился вместе с dev-хуком pool-store.
// Беседа 6.2: publishable key Stripe для utils/stripe.ts (пусто → dev-режим).
interface ImportMetaEnv {
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
}
