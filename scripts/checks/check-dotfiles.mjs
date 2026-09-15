#!/usr/bin/env node
/**
 * Сторож dotfile (беседа 8.7; 09 §2 «dotfile-грабля ×5»). Выкладка
 * репозитория пять раз теряла ПРАВКИ файлов с ведущей точкой, а не сами
 * файлы: `.env.example` без STRIPE_PRICE_*, `.gitignore` без папки состояния
 * стенда. Обнаруживалось это следующей беседой, на чистом клоне, падением
 * check:integration (4ak/4al/4ao). Этот скрипт делает то же за секунду и без
 * БД — годен как первый шаг после `git clone` и в любой CI.
 * Запуск из корня: node scripts/check-dotfiles.mjs
 */
import { existsSync, readFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);
const rd = (rel) => readFileSync(new URL(rel, ROOT), "utf8");
const errs = [];
const envEx = rd(".env.example");
for (const v of ["STRIPE_PRICE_STARTER", "STRIPE_PRICE_PRO", "STRIPE_PRICE_ACADEMIC"]) {
  if (!new RegExp(`^${v}=`, "m").test(envEx)) errs.push(`.env.example без ${v}= (8.3)`);
}
if (!/^dev-billing-state\/$/m.test(rd(".gitignore"))) errs.push(".gitignore без dev-billing-state/ (8.6)");
if (!existsSync(new URL("env.local.example", ROOT))) errs.push("нет env.local.example (8.6, без точки)");
if (existsSync(new URL(".env.local.example", ROOT))) errs.push("в дереве старый .env.local.example (8.6)");
const envLoc = existsSync(new URL("env.local.example", ROOT)) ? rd("env.local.example") : "";
for (const n of ["starter", "pro", "academic"]) {
  if (!new RegExp(`^STRIPE_PRICE_${n.toUpperCase()}=price_mock_${n}$`, "m").test(envLoc)) errs.push(`env.local.example без STRIPE_PRICE_${n.toUpperCase()}=price_mock_${n} (8.3)`);
}
if (errs.length) {
  console.error("DOTFILES: правки потеряны выкладкой —\n - " + errs.join("\n - "));
  process.exit(1);
}
console.log("DOTFILES OK: .env.example, .gitignore, env.local.example на месте");
