-- 0023 (2026-11-25, вне бесед): пробный подарок на баланс — transactions.type
-- 'bonus' (значение enum в коде, CHECK в БД нет — как у прочих типов).
-- Не больше одного подарка на пользователя: начисление идёт
-- INSERT … ON CONFLICT DO NOTHING по этому индексу (billing-service
-- grantTrialBalance), повторное подтверждение почты второго не даст.
CREATE UNIQUE INDEX "uq_transactions_trial" ON "transactions" USING btree ("user_id") WHERE "transactions"."type" = 'bonus';