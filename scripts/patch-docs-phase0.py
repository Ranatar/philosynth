#!/usr/bin/env python3
"""
patch-docs-phase0.py — правки документации по дырам/недочётам, накопленным
в NEXT-CONTEXT.md за Фазу 0 (беседы 0.1–0.4). Идемпотентен: повторный
прогон даёт skip по всем пунктам. Только str.replace (re.sub запрещён —
урок актуализации: интерпретирует \\n в заменах).

Закрываемые пункты (источник — главы NEXT-CONTEXT):
  0.1/TODO-8: дубль блока «Беседа 1.4b» в 07 (второй вариант ссылался на
              несуществующий docs/tz/) — удалить второй блок.
  0.2/TODO-3: A2/A3 (сброс/смена пароля, MVP §1.1) без эндпоинтов в §2.1 —
              §1.1 A2 разделён (reset → Фаза 3: нужна почта), §2.1 дополнен
              password-change (+reset, Фаза 3), в 07 добавлена беседа 0.5.
  0.2/знание-3: формы 401/409 (анти-enumeration) — задокументированы в §2.1.
  0.3b/TODO-1: routes/taxonomy.ts (§2.13) ничьей беседой не создавался —
              добавлен в задачи беседы 5.3.
  0.4/TODO-4: чек CSS-переменных беседы 0.4 расходился с исходником
              (--gold #d4a017 = --gold-light; «parchment» = --off) — исправлен.
  0.4/зазор:  useWebSocket отсутствовал в задачах 0.4, хотя 1.4/1.5 ждут его
              «из 0.4» — добавлен пунктом 9 и в граф §11.
  04+05:      устаревшее примечание «в репо пока 74 — обновить» (философов
              106 с беседы 0.1).
"""
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"
applied, skipped, failed = [], [], []


def patch(path: Path, name: str, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new in text:
        skipped.append(name)
        return
    if old not in text:
        failed.append(f"{name}: old-фрагмент не найден в {path.name}")
        return
    if text.count(old) != 1:
        failed.append(f"{name}: old-фрагмент не уникален в {path.name} ({text.count(old)})")
        return
    path.write_text(text.replace(old, new), encoding="utf-8")
    applied.append(name)


# ══ 07-conversation-protocol.md ══════════════════════════════════════
P07 = DOCS / "07-conversation-protocol.md"

# A. Дубль беседы 1.4b: удалить ВТОРОЙ блок (маркер — ссылка на docs/tz/).
def drop_14b_duplicate() -> None:
    name = "07/A: дубль беседы 1.4b (вариант docs/tz)"
    text = P07.read_text(encoding="utf-8")
    marker = "docs/tz/tz-pause-resume-reconstructed.md"
    if marker not in text:
        skipped.append(name)
        return
    header = "### Беседа 1.4b: Pause / Resume (бэкенд + клиент)"
    m_idx = text.index(marker)
    start = text.rfind(header, 0, m_idx)
    if start == -1:
        failed.append(f"{name}: заголовок перед маркером не найден")
        return
    nxt = text.find("### Беседа 1.5:", m_idx)
    if nxt == -1:
        failed.append(f"{name}: следующая беседа не найдена")
        return
    # хвост блока: разделитель "---" между 1.4b-дублем и 1.5 остаётся один
    sep = text.rfind("---", start, nxt)
    end = sep if sep != -1 else nxt
    P07.write_text(text[:start] + text[end:], encoding="utf-8")
    applied.append(name)


drop_14b_duplicate()

# D1. Контекст беседы 0.4: имена переменных — как в исходнике.
patch(P07, "07/D1: контекст 0.4 — имена переменных палитры",
    "   (см. CSS-фрагмент: --gold, --ink, --parchment, --violet и т.д.)",
    "   (см. CSS-фрагмент: --gold, --gold-light, --ink, --off, --violet и т.д.;\n"
    "   «parchment» проектных доков = --off исходника)")

# D2. Чек CSS-переменных: значения приведены к исходнику.
patch(P07, "07/D2: чек CSS-переменных 0.4",
    "- «Проверь CSS-переменные: цвета --gold (#d4a017), --ink (#1a1814), --parchment (#f2f0eb), --violet (#6b00aa) из исходника присутствуют в globals.css и используются в tailwind.config.ts?»",
    "- «Проверь CSS-переменные: цвета --gold (#b8860b), --gold-light (#d4a017), --ink (#1a1814), --off (#f2f0eb; в доках «parchment» — допустим алиас --parchment: var(--off)), --violet (#6b00aa) из исходника присутствуют в globals.css и используются в tailwind.config.ts?»\n"
    "  <!-- правка 2026-07-23: прежний чек называл #d4a017 «--gold» (это --gold-light)\n"
    "       и требовал --parchment, которого в исходнике нет (= --off) -->")

# D3. Задачи 0.4: пункт 9 — useWebSocket (беседы 1.4/1.5 ждут его «из 0.4»).
patch(P07, "07/D3: задача 9 (useWebSocket) в 0.4",
    "8. api/client.ts: fetch-обёртка с cookie auth, error handling\n",
    "8. api/client.ts: fetch-обёртка с cookie auth, error handling\n"
    "9. hooks/useWebSocket.ts: типизированный WS-хук (shared/types/ws-messages)\n"
    "   с reconnect и keep-alive ping — беседы 1.4/1.5 загружают его «из 0.4»\n")

# C. Беседа 5.3: + routes/taxonomy.ts (дыра 0.3b: §2.13 ничьей беседой не создавался).
patch(P07, "07/C: routes/taxonomy.ts в задачи 5.3",
    "4. Расширение ws/handler.ts:\n"
    "   - Обработка start_enrichment → enrichCategory/enrichEdge\n"
    "   - Отправка enrichment_delta, enrichment_done",
    "4. server/routes/taxonomy.ts (§2.13; дыра доков закрыта 2026-07-23 —\n"
    "   модуль числился в карте 04, но ни одна беседа его не создавала;\n"
    "   тонкие обёртки над element-taxonomy.ts из 0.3b):\n"
    "   - GET/POST /taxonomy/category-types\n"
    "   - GET/POST /taxonomy/relationship-types\n"
    "   - POST /taxonomy/normalize\n"
    "\n"
    "5. Расширение ws/handler.ts:\n"
    "   - Обработка start_enrichment → enrichCategory/enrichEdge\n"
    "   - Отправка enrichment_delta, enrichment_done")

# B3. Новая беседа 0.5 (password-change) перед Фазой 1.
patch(P07, "07/B3: беседа 0.5 (password-change)",
    "## 3. Протокол Фазы 1: MVP",
    """### Беседа 0.5: Смена пароля (A3)

> Добавлена правкой 2026-07-23: требование A3 «смена пароля» (03-spec §1.1,
> MVP) не имело эндпоинта в §2.1 и беседы в протоколе (дыра, зафиксирована
> в итогах 0.2). Сброс пароля по email (A2a) перенесён в Фазу 3 —
> требует почтовой инфраструктуры.

**Контекст:**
- `03-specification.md` §2.1 (POST /auth/password-change)
- Из предыдущих бесед: `server/middleware/auth.ts`, `server/routes/auth.ts` (из 0.2), `server/db/schema.ts`
- Исходник: НЕ НУЖЕН

**Первый запрос:**
```
Добавь в routes/auth.ts эндпоинт POST /auth/password-change
{ currentPassword, newPassword }:
1. requireAuth; verifyPassword(currentPassword) — при несовпадении
   401 AUTH_REQUIRED (единый ответ, анти-enumeration, как в login)
2. newPassword ≥ 8 символов, иначе VALIDATION_ERROR + details
3. Обновить password_hash; инвалидировать все сессии пользователя,
   КРОМЕ текущей (защита от угнанных сессий)
4. → { ok: true }
```

**Последующие запросы:**
- «Протестируй: смена с верным текущим паролем → 200; вход по новому паролю работает, по старому — 401»
- «Протестируй: прочие сессии пользователя инвалидированы, текущая жива»
- «Edge cases: неверный currentPassword → 401; newPassword короче 8 → VALIDATION_ERROR + details»

**Завершение беседы:**
- Стандартный блок (компиляция, интеграция, ревью)

---

## 3. Протокол Фазы 1: MVP""")

# Граф §11: ветка 0.5 под 0.2; useWebSocket в описании 0.4.
patch(P07, "07/граф: 0.5 под 0.2",
    " ├── 0.2 (auth, Hono, WS, rate-limiter)\n",
    " ├── 0.2 (auth, Hono, WS, rate-limiter)\n"
    " │    └── 0.5 (password-change; A2a reset — Фаза 3)\n")
patch(P07, "07/граф: useWebSocket в 0.4",
    " └── 0.4 (клиент каркас, роутинг, stores, api/client)",
    " └── 0.4 (клиент каркас, роутинг, stores, api/client, useWebSocket)")

# Шапка 07: строка ревизии правок Фазы 0.
patch(P07, "07/шапка: ревизия 2026-07-23",
    "> Спецификации подсистем v11 инлайнированы в 01-architecture §4.12–4.15.",
    "> Спецификации подсистем v11 инлайнированы в 01-architecture §4.12–4.15.\n"
    ">\n"
    "> **Правки 2026-07-23 (итоги Фазы 0)**: удалён дубль беседы 1.4b (вариант\n"
    "> docs/tz/); добавлена беседа 0.5 (password-change); в 0.4 добавлена задача\n"
    "> useWebSocket; чек CSS-переменных 0.4 приведён к исходнику; в 5.3 добавлен\n"
    "> routes/taxonomy.ts (дыра 0.3b).")

# ══ 03-specification.md ═════════════════════════════════════════════
P03 = DOCS / "03-specification.md"

# B1. §1.1: A2 разделён — reset ушёл в Фазу 3.
patch(P03, "03/B1: §1.1 A2/A2a",
    "| A2 | Вход / выход / сброс пароля | MVP |",
    "| A2 | Вход / выход | MVP |\n"
    "| A2a | Сброс пароля по email | Фаза 3 |")

# B2. §2.1: password-change (+reset Фаза 3) + примечание о формах 401/409.
patch(P03, "03/B2: §2.1 password-эндпоинты",
    """GET    /auth/me                → { user: { id, email, displayName, role, balanceUsd } }
```""",
    """GET    /auth/me                → { user: { id, email, displayName, role, balanceUsd } }

POST   /auth/password-change   { currentPassword, newPassword }
                                → { ok: true }
                                // Требует сессии (беседа 0.5). Неверный
                                // currentPassword → 401 AUTH_REQUIRED (единый
                                // ответ, анти-enumeration). Все прочие сессии
                                // пользователя инвалидируются, текущая живёт.

POST   /auth/password-reset/request  { email }              // A2a, Фаза 3
                                → { ok: true }              // всегда ok (анти-enumeration)
POST   /auth/password-reset/confirm  { token, newPassword } // A2a, Фаза 3
                                → { ok: true }
```

Формы ошибок auth (зафиксированы в 0.2, вне §4.3): неверные креды login →
401 AUTH_REQUIRED единым ответом (анти-enumeration); занятый email register →
409 VALIDATION_ERROR + details.email.""")

# Шапка 03: строка правки.
patch(P03, "03/шапка: ревизия 2026-07-23",
    "> селективный родительский контекст. Спецификации — 01-architecture, §4.12–4.15.",
    "> селективный родительский контекст. Спецификации — 01-architecture, §4.12–4.15.\n"
    ">\n"
    "> **Правка 2026-07-23 (итоги Фазы 0)**: §1.1 A2 разделён (сброс пароля →\n"
    "> Фаза 3), §2.1 дополнен password-change/password-reset и формами 401/409\n"
    "> (дыра, зафиксированная в 0.2).")

# ══ 04 + 05: устаревшее «74 — обновить» ═════════════════════════════
patch(DOCS / "04-code-reuse-map.md", "04/E1: философы 106",
    "`shared/constants/philosophers.ts` (в репо пока 74 — обновить)",
    "`shared/constants/philosophers.ts` (106, сверено в беседе 0.1)")
patch(DOCS / "05-file-structure.md", "05/E2: философы 106",
    "# Список философов — 106 позиций (+36 в v10; в репо пока 74 — обновить)",
    "# Список философов — 106 позиций (+36 в v10; сверено в беседе 0.1)")

# ══ Отчёт ═══════════════════════════════════════════════════════════
print(f"applied={len(applied)} skip={len(skipped)} fail={len(failed)}")
for a in applied:
    print(f"  + {a}")
for s in skipped:
    print(f"  = {s}")
for f in failed:
    print(f"  ! {f}")
raise SystemExit(1 if failed else 0)
