#!/usr/bin/env python3
"""Патч документации по правкам 2026-11-25 (тарифная сетка; вне бесед).

Идемпотентный: каждая правка проверяет наличие нового текста (marker) и
уходит в skip при повторном прогоне. Отчёт applied/skip/fail.
Запуск из корня репозитория:
    python3 scripts/patches/patch-docs-plan-grid.py

Правки:
  PG/A  01: §биллинг — порог тарифа PLAN_MIN_MARKUP отдельно от наценки
        баланса BILLING_MARKUP; пробный подарок; сверка весов.
  PG/B  02: §2.20 — тип 'bonus', индекс uq_transactions_trial (0023).
  PG/C  03: GET /billing/plans — credits.trialBalanceUsd; подтверждение
        почты и сброс пароля начисляют подарок.
  PG/D  08: Часть III — врезка «Правки 2026-11-25».
  PG/E  09: §10 — «Что оставили правки 2026-11-25».
  PG/F  NEXT-CONTEXT: дополнение (миграция 0023, следующая — 0024).
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
applied = skipped = failed = 0


def patch(path: Path, old: str, new: str, label: str, marker: str | None = None) -> None:
    """Заменяет old → new; идемпотентность — по marker (или new) в тексте."""
    global applied, skipped, failed
    text = path.read_text(encoding="utf-8")
    probe = marker if marker is not None else new
    if probe in text:
        print(f"  skip  {label}")
        skipped += 1
        return
    if text.count(old) != 1:
        print(f"  FAIL  {label}: якорь встречается {text.count(old)} раз")
        failed += 1
        return
    path.write_text(text.replace(old, new), encoding="utf-8")
    print(f"  ok    {label}")
    applied += 1


# ── PG/A  01 ────────────────────────────────────────────────────────────
patch(
    DOCS / "01-architecture.md",
    """Экономика тарифа (квоты не дороже цены при `BILLING_MARKUP`) — одна функция
для сида и сервера (`config/plan-economics.ts`).
""",
    """Экономика тарифа (квоты не дороже цены при `PLAN_MIN_MARKUP`; до
2026-11-25 — при `BILLING_MARKUP`) — одна функция для сида и сервера
(`config/plan-economics.ts`).

**ФАКТ 2026-11-25 (вне бесед; решение пользователя по тарифной сетке).**
Наценка баланса и порог тарифа разведены: `BILLING_MARKUP` (по умолчанию
2.5) — наценка режима 'balance', самый дорогой кредит; `PLAN_MIN_MARKUP`
(1.5) — нижний порог действующей наценки тарифа (цена / себестоимость
квоты), им проверяют сид и админка. При общем числе кредит подписки не мог
быть дешевле кредита баланса, и подписка не давала выгоды. Посев: Starter
$9.99 / 450 кредитов (×2.22), Pro $24.99 / 1250 (×2.0), Academic $59.99 /
3300 (×1.82) — скидка растёт с тарифом (сторож 4al); сид предупреждает о
тарифе дороже баланса (`planBeatsBalance`). Строки БД сид не трогает:
действующие тарифы правятся админкой; переименование и «открыт» экономику
не проверяют (тарифы прежнего порога ×1.28–1.32 правятся на месте).
Пробный подарок: при первом подтверждении почты (или сбросе пароля,
который подтверждает адрес) — `TRIAL_BALANCE_USD` (6) на баланс, строка
`transactions` типа 'bonus', одна на пользователя (миграция 0023). Сверка
весов с фактом — `npm run billing:calibrate` (api_usage против опорной
модели того же состава и глубины); модель не меняли — у другой модели
другие расход токенов и цены, оценщик пришлось бы калибровать заново.
""",
    "PG/A 01 §биллинг",
    marker="**ФАКТ 2026-11-25 (вне бесед; решение пользователя по тарифной сетке).**",
)

# ── PG/B  02 ────────────────────────────────────────────────────────────
patch(
    DOCS / "02-data-model.md",
    """  type          TEXT NOT NULL,  -- 'topup'|'usage'|'refund'
""",
    """  type          TEXT NOT NULL,  -- 'topup'|'usage'|'refund'|'bonus' (2026-11-25: пробный подарок)
""",
    "PG/B 02 §2.20 type",
)
patch(
    DOCS / "02-data-model.md",
    """CREATE INDEX idx_transactions_user ON transactions(user_id);
```
""",
    """CREATE INDEX idx_transactions_user ON transactions(user_id);
-- 0023 (2026-11-25): пробный подарок — не больше одного на пользователя;
-- начисление INSERT … ON CONFLICT DO NOTHING (billing-service grantTrialBalance)
CREATE UNIQUE INDEX uq_transactions_trial ON transactions(user_id) WHERE type = 'bonus';
```
""",
    "PG/B 02 §2.20 индекс",
)

# ── PG/C  03 ────────────────────────────────────────────────────────────
patch(
    DOCS / "03-specification.md",
    """GET    /billing/plans            → { plans: SubscriptionPlan[], credits: CreditInfo, markup }
""",
    """GET    /billing/plans            → { plans: SubscriptionPlan[], credits: CreditInfo, markup }
                                // 2026-11-25: markup — наценка БАЛАНСА
                                // (BILLING_MARKUP); credits.trialBalanceUsd —
                                // пробный подарок (0 — выключен), PlansTable
                                // пишет о нём под тарифами
""",
    "PG/C 03 /billing/plans",
)
patch(
    DOCS / "03-specification.md",
    """POST   /auth/email/verify/confirm    { token }              // БЕЗ сессии
                                → { ok: true }
""",
    """POST   /auth/email/verify/confirm    { token }              // БЕЗ сессии
                                → { ok: true }
                                // 2026-11-25: в той же транзакции —
                                // пробный подарок TRIAL_BALANCE_USD на
                                // баланс (один на пользователя; так же
                                // password-reset/confirm)
""",
    "PG/C 03 verify/confirm",
)

# ── PG/D  08 ────────────────────────────────────────────────────────────
patch(
    DOCS / "08-history.md",
    """> **Правки 2026-11-17 (вне бесед — кредиты и их проверка)**: три коммита
""",
    """> **Правки 2026-11-25 (вне бесед — тарифная сетка)**: после стресс-теста
> пользователь сравнил подписку со своим ключом (концепция из 11 разделов —
> около $2.2) и попросил реалистичную сетку. Причина бессмысленности
> подписки — один порог на оба режима: кредит тарифа не мог стоить дешевле
> кредита баланса (×1.2), а тариф зарабатывал ~16% до налогов. Разведены
> `BILLING_MARKUP` (баланс, 2.5) и `PLAN_MIN_MARKUP` (порог тарифа, 1.5);
> посев — $9.99/450, $24.99/1250, $59.99/3300; пробный подарок $6 при
> подтверждении почты (миграция 0023, `transactions.type = 'bonus'`);
> `npm run billing:calibrate` — сверка весов с api_usage (на стенде с
> симулятором — ×0.79; цифра пользователя против опорной модели 11
> разделов — ×0.82). Смену модели (Sonnet 5.5 и т. п.) пользователь
> отложил: другой расход токенов и цены — пересчёт оценщика и параметров
> генерации. Попутно: правка названия/«открыт» у тарифа перестала
> проверять экономику (иначе тарифы прежнего порога не переименовать);
> test-154 сверял квоты посева ценой из plans.ts при квоте из БД.
> Проверки: typecheck, audit, check:integration (4al), test-trial-bonus
> 12 ✓, test-credits-repair 18 ✓, test-61 111 ✓, test-62 101 ✓, test-154
> 49 ✓, smoke-83 62/8 (как до правок). Доки —
> `scripts/patches/patch-docs-plan-grid.py`.

> **Правки 2026-11-17 (вне бесед — кредиты и их проверка)**: три коммита
""",
    "PG/D 08 врезка",
    marker="> **Правки 2026-11-25 (вне бесед — тарифная сетка)**",
)

# ── PG/E  09 ────────────────────────────────────────────────────────────
patch(
    DOCS / "09-lessons.md",
    """### Что оставили правки 2026-11-17 (кредиты; вне бесед)
""",
    """### Что оставили правки 2026-11-25 (тарифная сетка; вне бесед)

- **Две наценки, не одна**: `BILLING_MARKUP` — режим баланса (дороже
  всего), `PLAN_MIN_MARKUP` — нижний порог тарифа. Экономику тарифа
  (`computePlanEconomics`, `assertPlanEconomics`) зовут порогом; наценку
  баланса — только `planBeatsBalance` (предупреждение сида) и сторож 4al.
  Подставить в проверку тарифа `billingMarkup` — снова сделать подписку
  не дешевле баланса.
- **Правка тарифа без цены, периода и квот экономику не проверяет**
  (`assertPlanSpec(next, { economics: false })`): после смены порога старые
  тарифы ниже него, а переименовать их можно.
- **Пробный подарок начисляется только `grantTrialBalance`** в транзакции
  подтверждения адреса; повтор отсекает частичный уникальный индекс
  `uq_transactions_trial`, а не проверка в коде — новый путь подтверждения
  адреса зовёт ту же функцию, второго подарка он не даст.
- **Веса кредитов — верхняя оценка**; насколько, показывает
  `npm run billing:calibrate`. Опорная модель произвольного состава —
  `referenceSynthesisCostUsd`/`referenceSectionCostUsd`; на опорном составе
  они обязаны совпасть с `REFERENCE_OPERATION_COST_USD` (4al).
- **Модель генерации меняется не константой**: `PRICE_IN/OUT`, выход
  разделов (`SECTION_OUTPUT_MULT`, `CHARS_PER_TOKEN`) и бюджеты подобраны
  под Sonnet 4.6; у другой модели — свой расход токенов. Смена — отдельная
  работа с калибровкой оценщика.

### Что оставили правки 2026-11-17 (кредиты; вне бесед)
""",
    "PG/E 09 §10",
    marker="### Что оставили правки 2026-11-25 (тарифная сетка; вне бесед)",
)

# ── PG/F  NEXT-CONTEXT ──────────────────────────────────────────────────
patch(
    ROOT / "NEXT-CONTEXT.md",
    """Хроника — 08 Часть III.

## Универсальный минимум любой серверной беседы
""",
    """Хроника — 08 Часть III.

## Дополнение 2026-11-25 (вне бесед — тарифная сетка)

Миграция 0023 `trial_bonus` (частичный уникальный индекс
`uq_transactions_trial`; таблиц по-прежнему 43) — **следующая миграция —
0024**. Наценки разведены: `BILLING_MARKUP` 2.5 (баланс) и
`PLAN_MIN_MARKUP` 1.5 (порог тарифа); `TRIAL_BALANCE_USD` 6 — подарок при
подтверждении почты. Посев тарифов — $9.99/450, $24.99/1250,
$59.99/3300; строки БД не тронуты (правятся админкой). Новые строки
`billingPage.txBonus`, `billing.plansTable.trialNote` — en/de утверждены.
Новый харнесс `tests/test-trial-bonus.mjs`; сверка весов —
`npm run billing:calibrate`. Серии сторожей не заняты (правлена 4al). 09
§10, «Что оставили правки 2026-11-25».

## Универсальный минимум любой серверной беседы
""",
    "PG/F NEXT-CONTEXT",
    marker="## Дополнение 2026-11-25 (вне бесед — тарифная сетка)",
)

print(f"applied={applied} skip={skipped} fail={failed}")
sys.exit(1 if failed else 0)
