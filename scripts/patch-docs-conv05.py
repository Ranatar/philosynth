#!/usr/bin/env python3
"""Правка доков по итогам беседы 0.5 — закрытие дыры A3.

Дыра (итоги 0.5): 03-spec §1.1 A3 (MVP) включает смену отображаемого
имени, но §2.1 не имел эндпоинта; UI профиля (включая клиентскую форму
password-change) отсутствовал в 05 и 07.

Закрытие: §2.1 += PATCH /auth/me; 05 += ProfilePage.tsx; 07 += беседа 0.6
(PATCH /auth/me + ProfilePage) + ветка в графе §11; шапки 03/07 дополнены.

Идемпотентен: applied / skip (new уже в файле) / fail (old не найден).
Только точечные str.replace (урок 0.3: НИКАКОГО re.sub). Общих замен нет.
Запуск: python3 scripts/patch-docs-conv05.py (из корня репо).
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

# (файл, id, old, new) — new обязан содержать old-контекст, чтобы skip
# определялся вхождением уникальной части new.
PATCHES: list[tuple[Path, str, str, str]] = []


def patch(path: Path, pid: str, old: str, new: str) -> None:
    PATCHES.append((path, pid, old, new))


# ── 03-specification.md ──────────────────────────────────────────────

patch(
    DOCS / "03-specification.md",
    "03-header-2026-07-24",
    """> **Правка 2026-07-23 (итоги Фазы 0)**: §1.1 A2 разделён (сброс пароля →
> Фаза 3), §2.1 дополнен password-change/password-reset и формами 401/409
> (дыра, зафиксированная в 0.2).""",
    """> **Правка 2026-07-23 (итоги Фазы 0)**: §1.1 A2 разделён (сброс пароля →
> Фаза 3), §2.1 дополнен password-change/password-reset и формами 401/409
> (дыра, зафиксированная в 0.2).
>
> **Правка 2026-07-24 (итоги 0.5)**: §2.1 дополнен PATCH /auth/me (смена
> displayName) — закрытие дыры A3 «отображаемое имя»; UI профиля
> (displayName + форма смены пароля) — новая беседа 0.6 в 07.""",
)

patch(
    DOCS / "03-specification.md",
    "03-s21-patch-me",
    """GET    /auth/me                → { user: { id, email, displayName, role, balanceUsd } }

POST   /auth/password-change""",
    """GET    /auth/me                → { user: { id, email, displayName, role, balanceUsd } }

PATCH  /auth/me                { displayName }
                                → { user: { id, email, displayName, role, balanceUsd } }
                                // Смена отображаемого имени (A3, беседа 0.6).
                                // Требует сессии. trim; пустая строка → null;
                                // длина > 100 → VALIDATION_ERROR +
                                // details.displayName

POST   /auth/password-change""",
)

# ── 05-file-structure.md ─────────────────────────────────────────────

patch(
    DOCS / "05-file-structure.md",
    "05-profile-page",
    """│   │   │   ├── BillingPage.tsx
│   │   │   └── AdminPromptsPage.tsx""",
    """│   │   │   ├── BillingPage.tsx
│   │   │   ├── ProfilePage.tsx         # Профиль: displayName + смена пароля (A3, беседа 0.6)
│   │   │   └── AdminPromptsPage.tsx""",
)

# ── 07-conversation-protocol.md ──────────────────────────────────────

patch(
    DOCS / "07-conversation-protocol.md",
    "07-header-2026-07-24",
    """> useWebSocket; чек CSS-переменных 0.4 приведён к исходнику; в 5.3 добавлен
> routes/taxonomy.ts (дыра 0.3b).""",
    """> useWebSocket; чек CSS-переменных 0.4 приведён к исходнику; в 5.3 добавлен
> routes/taxonomy.ts (дыра 0.3b).
>
> **Правка 2026-07-24 (итоги 0.5)**: добавлена беседа 0.6 (PATCH /auth/me +
> ProfilePage) — закрытие дыры A3 «отображаемое имя» и клиентского UI
> смены пароля; ветка в графе §11.""",
)

patch(
    DOCS / "07-conversation-protocol.md",
    "07-conv-0.6",
    """**Завершение беседы:**
- Стандартный блок (компиляция, интеграция, ревью)

---

## 3. Протокол Фазы 1: MVP""",
    """**Завершение беседы:**
- Стандартный блок (компиляция, интеграция, ревью)

---

### Беседа 0.6: Профиль пользователя (A3: отображаемое имя + UI смены пароля)

> Добавлена правкой 2026-07-24: серверная половина A3 (password-change)
> реализована в 0.5, но смена displayName не имела эндпоинта в §2.1,
> а клиентский UI профиля — включая форму смены пароля — отсутствовал
> в 05/07 (дыра, зафиксирована в итогах 0.5).

**Контекст:**
- `03-specification.md` §2.1 (PATCH /auth/me, POST /auth/password-change)
- Из предыдущих бесед: `server/routes/auth.ts` (0.2/0.5),
  `server/middleware/auth.ts` (0.2); клиент 0.4: `api/client.ts`,
  `stores/auth-store.ts`, `App.tsx`, `components/layout/*` (ссылка на
  профиль), Login/RegisterPage как образец форм
- Исходник: НЕ НУЖЕН

**Первый запрос:**
```
1. Добавь в routes/auth.ts эндпоинт PATCH /auth/me { displayName }:
   requireAuth; displayName — строка, trim; пустая строка → null;
   длина > 100 → VALIDATION_ERROR + details.displayName;
   → { user } (полный, как GET /auth/me)
2. Создай client/src/pages/ProfilePage.tsx (маршрут /profile;
   ссылка — имя/email пользователя в Header):
   секция «Профиль» — email (read-only), displayName + «Сохранить»;
   секция «Смена пароля» — currentPassword/newPassword/повтор,
   POST /auth/password-change; отображение details по полям,
   401 → «Неверный текущий пароль»; при успехе — уведомление
   «Пароль изменён; прочие сессии завершены»
3. Расширь stores/auth-store.ts: updateProfile(displayName),
   changePassword(current, next) — user в store обновляется
```

**Последующие запросы:**
- «Протестируй PATCH /auth/me: смена displayName видна в GET /auth/me;
  пустая строка → null; длина > 100 → VALIDATION_ERROR + details;
  без сессии → 401»
- «Браузерный тест ProfilePage (по паттерну test-04-*): обе формы
  работают, ошибки полей отображаются, user в шапке обновился»

**Завершение беседы:**
- Стандартный блок (компиляция, интеграция, ревью)

---

## 3. Протокол Фазы 1: MVP""",
)

patch(
    DOCS / "07-conversation-protocol.md",
    "07-graph-0.6",
    """ │    └── 0.5 (password-change; A2a reset — Фаза 3)
 ├── 0.3 (seed-prompts, seed-configs, prompt-registry)""",
    """ │    └── 0.5 (password-change; A2a reset — Фаза 3)
 │         └── 0.6 (PATCH /auth/me + ProfilePage — требует также 0.4)
 ├── 0.3 (seed-prompts, seed-configs, prompt-registry)""",
)


def main() -> int:
    applied = skip = fail = 0
    for path, pid, old, new in PATCHES:
        text = path.read_text(encoding="utf-8")
        # маркер применённости — уникальный хвост new, отсутствующий в old
        marker = new.replace(old.split("\n")[0], "", 1)
        if new in text:
            print(f"skip    {pid}")
            skip += 1
            continue
        if old not in text:
            print(f"FAIL    {pid}: old-фрагмент не найден в {path.name}")
            fail += 1
            continue
        if text.count(old) != 1:
            print(f"FAIL    {pid}: old-фрагмент не уникален в {path.name}")
            fail += 1
            continue
        path.write_text(text.replace(old, new, 1), encoding="utf-8")
        print(f"applied {pid}")
        applied += 1
        del marker
    print(f"\nИтог: applied={applied} skip={skip} fail={fail}")
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
