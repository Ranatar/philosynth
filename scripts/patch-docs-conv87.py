#!/usr/bin/env python3
"""Патч документации по итогам беседы 8.7 (витрина: стартовая страница,
гостевая шапка и маршруты, режим просмотра, управление публичностью —
клиент; сервер не правился).
Запрос 1 (2026-09-15) — факты, ставшие постоянными, и найденные дыры:
  A  03 §2.2 — превью без четырёх флагов (переключатель берёт их GET /:id);
  A2 03 §2.2 — вариант (б): isPublic снят с сервера/shared целиком (DTO без
     поля, PATCH с isPublic → 400 details.isPublic); заменяет правку A;
     остаток «SynthesisPreviewGuest» снят пересмотром 8.6; §1.2 C2, §2.4,
     §2.7, §2.15 — «is_public / публичный синтез» → модель 8.6 (ступень +
     гейт витрины); §4.3 META_NOT_ALLOWED — как клиент показывает.
  B  04 §4 — строка «Новое» 8.7.
  C  05 — LandingPage, PlansTable, VisibilityControl, utils/visibility-text,
     маршрут /explore, Layout/Header гостя, синоним isPublic с клиента снят.
  D  07 — текст 8.7: п.3 (404 внутри страницы, «*» гостю → «/»), п.4a
     («ничего» — о кнопке, полоса всем невладельцам), п.5 (флаги из
     GET /:id), 0.4 (список маршрутов += «/», «/explore»).
  E  09 §2 — dotfile-грабля ×5: правки .env.example/.gitignore теряются и
     после переименования 8.6.
  H  ЗАВЕРШЕНИЕ (2026-09-15): «По факту 8.7», врезка Фазы 8, §12, 08
     (Часть I и II), 09 §4/§6, 05, README, NEXT-CONTEXT (комплект 8.7 →
     «Что 8.7 оставила знать»).
Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patch-docs-conv87.py
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
applied = skipped = failed = 0


def patch(rel: str, old: str, new: str, label: str, superseded_by: str | None = None) -> None:
    global applied, skipped, failed
    path = ROOT / rel
    if not path.exists():
        failed += 1
        print(f"  fail  {label}: нет файла {rel}")
        return
    text = path.read_text(encoding="utf-8")
    if new in text or (superseded_by is not None and superseded_by in text):
        skipped += 1
        print(f"  skip  {label}")
        return
    if old not in text:
        failed += 1
        print(f"  fail  {label}: не найден исходный фрагмент")
        return
    if text.count(old) != 1:
        failed += 1
        print(f"  fail  {label}: фрагмент встречается {text.count(old)} раз")
        return
    path.write_text(text.replace(old, new), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


P03 = "docs/03-specification.md"
P04 = "docs/04-code-reuse-map.md"
P05 = "docs/05-file-structure.md"
P07 = "docs/07-conversation-protocol.md"
P09 = "docs/09-lessons.md"

# ── A. 03 ────────────────────────────────────────────────────────────────
print("A. 03-specification")
patch(P03,
      "| C2 | Публичный каталог (is_public синтезы всех пользователей) | MVP |",
      "| C2 | Публичный каталог (неприватные ступени visibility всех пользователей — 8.6; гостю с 8.7 на `/explore`) | MVP |",
      "03 §1.2 C2 — is_public → visibility")
patch(P03,
      """                                // GET /:id. Гостю items без totalCostUsd
                                // (SynthesisPreviewGuest); зарегистрированному —
                                // с ним, флагом не управляется. authorName —
                                // при действенном show_author.""",
      """                                // GET /:id. Гостю items без totalCostUsd
                                // (отдельного типа нет — поле опционально,
                                // пересмотр 8.6); зарегистрированному — с ним,
                                // флагом не управляется. authorName — при
                                // действенном show_author. Четырёх сырых
                                // флагов в превью НЕТ (они — состояние
                                // владельца): переключатель публичности в
                                // карточке (8.7) берёт их GET /:id при
                                // открытии панели.""",
      "03 §2.2 GET /public — превью без флагов, тип-остаток снят")
patch(P03,
      """  isPublic: boolean;                    // @deprecated 8.6: производное
                                        // visibility !== 'private' — до
                                        // перевода клиента в 8.7""",
      """  isPublic: boolean;                    // @deprecated 8.6: производное
                                        // visibility !== 'private'. 8.7: клиент
                                        // его не читает и в PATCH не шлёт
                                        // (SynthesisClientPatch без isPublic);
                                        // в DTO и синонимом PATCH остаётся
                                        // для старых тестов (16/52, 5n) —
                                        // снятие с сервера отдельным решением""",
      "03 §2.2 isPublic — клиент 8.7 не использует",
      superseded_by="isPublic снят 8.7 целиком")
patch(P03,
      "                                // Доступ: владелец ИЛИ is_public = true.",
      "                                // Доступ: владелец ИЛИ scope='full' у\n"
      "                                // смотрящего (8.6: requireAuth + гейт\n"
      "                                // витрины → 403; гостю 401).",
      "03 §2.4 categories — доступ по модели 8.6")
patch(P03,
      """                                // Чтение обоих GET — владелец ИЛИ
                                // публичный синтез""",
      """                                // Чтение обоих GET — владелец ИЛИ
                                // scope='full' у зарегистрированного
                                // (8.6: витрина → 403, гость → 401)""",
      "03 §2.7 modes — доступ по модели 8.6")
patch(P03,
      """                                // История трансформаций (новые первыми;
                                // владелец ИЛИ публичный синтез — правило 1.6)""",
      """                                // История трансформаций (новые первыми;
                                // владелец ИЛИ scope='full' у
                                // зарегистрированного — правило 1.6 в
                                // модели 8.6: витрина → 403, гость → 401)""",
      "03 §2.15 transforms — доступ по модели 8.6")
patch(P03,
      """                      title } (8.6). Своя концепция годится всегда.
```""",
      """                      title } (8.6). Своя концепция годится всегда.
                      Клиент (8.7): форма создания показывает details.title
                      и причину «автор не разрешил» (metaNotAllowedText).
```""",
      "03 §4.3 META_NOT_ALLOWED — показ в форме")

# ── A2. 03 — вариант (б): isPublic снят с сервера и shared целиком ──────
# (решение пользователя 2026-09-15 после запроса 1; §12 после 8.6 велел
# снять в 8.7). Заменяет правку выше «клиент 8.7 не использует».
print("A2. 03-specification — isPublic снят целиком")
patch(P03,
      """  isPublic: boolean;                    // @deprecated 8.6: производное
                                        // visibility !== 'private'. 8.7: клиент
                                        // его не читает и в PATCH не шлёт
                                        // (SynthesisClientPatch без isPublic);
                                        // в DTO и синонимом PATCH остаётся
                                        // для старых тестов (16/52, 5n) —
                                        // снятие с сервера отдельным решением
""",
      """  // isPublic снят 8.7 целиком (был @deprecated производным 8.6):
  // «публична» = visibility !== 'private' (shared isPublicOf)
""",
      "03 §2.2 SynthesisFull — isPublic снят 8.7 целиком",
      superseded_by="isPublic снят 8.7 целиком (был")
patch(P03,
      """                                // чтении). isPublic принимается устаревшим
                                // СИНОНИМОМ (true → 'full', false → 'private';
                                // вместе с visibility → 400) — клиент до 8.7
                                // шлёт именно его; в ответах isPublic —
                                // производное visibility !== 'private'.""",
      """                                // чтении). Синоним isPublic (8.6) СНЯТ 8.7:
                                // тело с isPublic → 400 VALIDATION_ERROR с
                                // details.isPublic («снят в 8.7 — используйте
                                // visibility»); в ответах поля isPublic нет.""",
      "03 §2.2 PATCH — синоним isPublic снят")
patch(P03,
      "`/public` поля нет); `isPublic` в нём — тоже производное (@deprecated).",
      "`/public` поля нет); поля `isPublic` в нём с 8.7 нет.",
      "03 §2.2 SynthesisPreview — без isPublic")
patch(P03,
      "                                // только title/isPublic/extGraphMetrics",
      "                                // только title/visibility+флаги/extGraphMetrics (8.6; isPublic снят 8.7)",
      "03 §2.x — упоминание PATCH title/isPublic")

# ── B. 04 ────────────────────────────────────────────────────────────────
print("B. 04-code-reuse-map")
patch(P04,
      "| `optionalAuth`/`viewerOf` в `server/middleware/auth.ts`;",
      "| `LandingPage` (`client/src/pages/LandingPage.tsx`), `PlansTable` "
      "(`components/billing/PlansTable.tsx` — вынос разметки тарифов из BillingPage 6.2), "
      "`VisibilityControl` (`components/catalog/`), `utils/visibility-text.ts` "
      "(`audienceText`/`flagsShownFor`); маршрут `/explore`; `summariesFromSections` в "
      "synthesis-store | НОВОЕ (8.7): в одностраничнике нет ни гостя, ни каталога, ни "
      "публикации — стартовая страница с живой витриной и ценами, гостевая шапка без меню, "
      "режим просмотра документа по смотрящему (полоса, врезка витрины, кнопки по "
      "`effectiveFlags`, разделы из ответа `GET /:id`), переключатель ступени с галочками "
      "вместо «Опубликовать». Клиент больше не шлёт `isPublic`. Сервер не правился |\n"
      "| `optionalAuth`/`viewerOf` в `server/middleware/auth.ts`;",
      "04 §4 — строка 8.7")

# ── C. 05 ────────────────────────────────────────────────────────────────
print("C. 05-file-structure")
patch(P05,
      """│   │   │   ├── CatalogPage.tsx         # Каталог (свои + публичные)""",
      """│   │   │   ├── LandingPage.tsx         # 8.7: стартовая «/» для гостя — что это, живая
│   │   │   │                           #  витрина (GET /syntheses/public, 4 карточки), цены
│   │   │   │                           #  (PlansTable), крупная «Создать аккаунт»; вошедшего → /catalog
│   │   │   ├── CatalogPage.tsx         # Каталог (свои + публичные); 8.7: publicOnly — «/explore»
│   │   │   │                           #  (гостю; без «Мои», «Новый синтез» и LineageSearch);
│   │   │   │                           #  публичность карточки — один PATCH { visibility, флаги }""",
      "05 — LandingPage, CatalogPage publicOnly")
patch(P05,
      """│   │   │   ├── SynthesisPage.tsx       # Просмотр синтеза""",
      """│   │   │   ├── SynthesisPage.tsx       # Просмотр синтеза; 8.7: режим просмотра — маршрут вне
│   │   │   │                           #  RequireAuth, полоса невладельца, гейты по effectiveFlags и
│   │   │   │                           #  смотрящему, WS/modes/lineage только вошедшему, 403 гостю → «приватна»""",
      "05 — SynthesisPage режим просмотра")
patch(P05,
      """│   │   │   ├── layout/
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Layout.tsx""",
      """│   │   │   ├── layout/
│   │   │   │   ├── Header.tsx              # 8.7: гостю «Войти · Регистрация», бренд → «/», выход → «/»
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Layout.tsx              # 8.7: общий каркас гостя и вошедшего; меню/бургер — только вошедшему;
│   │   │   │                               #  RequireAuth стоит на страницах, не на каркасе (гость → «/» со state.from)""",
      "05 — layout гостя")
patch(P05,
      """│   │   │   ├── catalog/
│   │   │   │   ├── SynthesisList.tsx       # Список карточек синтезов (8.4: проброс actions)
│   │   │   │   ├── SynthesisCard.tsx       # Карточка синтеза в каталоге; 8.4: строка действий
│   │   │   │   │                           # владельца (Опубликовать · Переименовать по месту ·
│   │   │   │   │                           # Дублировать · Удалить вторым шагом с числом потомков)""",
      """│   │   │   ├── billing/
│   │   │   │   └── PlansTable.tsx          # 8.7: таблица тарифов — вынос из BillingPage 6.2, одна на
│   │   │   │                               #  /billing и LandingPage; столбец действия — слот renderAction
│   │   │   ├── catalog/
│   │   │   │   ├── SynthesisList.tsx       # Список карточек синтезов (8.4: проброс actions; 8.7: visibility)
│   │   │   │   ├── SynthesisCard.tsx       # Карточка синтеза в каталоге; 8.4: строка действий
│   │   │   │   │                           # владельца (Переименовать по месту · Дублировать · Удалить
│   │   │   │   │                           # вторым шагом с числом потомков); 8.7: «Публичность» вместо
│   │   │   │   │                           # «Опубликовать» → VisibilityControl; бейджи ступени и автора
│   │   │   │   ├── VisibilityControl.tsx   # 8.7: три ступени + галочки по ступеням (витрина — только
│   │   │   │   │                           #  авторство, остальные спрятаны со строкой-пояснением), флаги
│   │   │   │   │                           #  из GET /:id, ОДИН PATCH по «Сохранить», подпись audienceText""",
      "05 — PlansTable, VisibilityControl, карточка")
patch(P05,
      """│   │       ├── capsule-html.ts             # 8.4: пересборка HTML капсулы из текста""",
      """│   │       ├── visibility-text.ts          # 8.7: тексты ступеней/галочек, flagsShownFor,
│   │       │                               #  audienceText (через effectiveFlags shared), visibilityBadge
│   │       ├── capsule-html.ts             # 8.4: пересборка HTML капсулы из текста""",
      "05 — utils/visibility-text")

# ── D. 07 — текст 8.7 и 0.4 ─────────────────────────────────────────────
print("D. 07-conversation-protocol")
patch(P07,
      """   RequireAuth — вынести из-под него и решать доступ по ответу сервера:
   403 → страница «концепция приватна» со ссылкой на вход, 404 →
   NotFound. Гость на любом другом маршруте — редирект на '/'.
""",
      """   RequireAuth — вынести из-под него и решать доступ по ответу сервера:
   403 → страница «концепция приватна» со ссылкой на вход, 404 →
   NotFound. Гость на любом другом маршруте — редирект на '/'.
   <!-- 8.7, запрос 1 (2026-09-15): трактовка. «404 → NotFound» — ответ
        сервера на несуществующий id рисуется страницей 404 ВНУТРИ
        Layout (PageError 1.6b), как и 403; маршрут «*» гостю — редирект
        на «/» (правило «любой другой маршрут»), вошедшему — NotFoundPage.
        RequireAuth уводит гостя на «/» (не на /login) со state.from —
        LandingPage передаёт его в «Войти», LoginPage возвращает как
        прежде. -->
""",
      "07 8.7 п.3 — трактовка 404 / «*»")
patch(P07,
      """   a. полоса вверху документа: «Вы смотрите публичную концепцию» +
      кнопка «Создать аккаунт» (гостю) / ничего (зарегистрированному);""",
      """   a. полоса вверху документа: «Вы смотрите публичную концепцию» +
      кнопка «Создать аккаунт» (гостю) / ничего (зарегистрированному);
      <!-- 8.7, запрос 1: «ничего» — о кнопке; полоса рисуется всякому
           невладельцу (и зарегистрированному), у неё же — ступень и
           authorName. -->""",
      "07 8.7 п.4a — «ничего» о кнопке")
patch(P07,
      """   c. галочки уезжают одним PATCH со ступенью, отдельных запросов не
      плодить;""",
      """   c. галочки уезжают одним PATCH со ступенью, отдельных запросов не
      плодить;
      <!-- 8.7, запрос 1: сырых флагов в SynthesisPreview нет (03 §2.2) —
           черновик панели заполняется GET /syntheses/:id при открытии;
           сервер не правился (решаемо клиентом одним чтением). -->""",
      "07 8.7 п.5c — флаги из GET /:id")
patch(P07,
      """4. React Router: маршруты Login, Register, Catalog, CreateSynthesis, 
   Synthesis/:id, Import, Billing, AdminPrompts""",
      """4. React Router: маршруты Login, Register, Catalog, CreateSynthesis, 
   Synthesis/:id, Import, Billing, AdminPrompts
   <!-- 8.7: += «/» (LandingPage) и «/explore» — гостевые, вне RequireAuth;
        «/synthesis/:id» тоже вынесен из-под RequireAuth (8.7 п.3) -->""",
      "07 0.4 п.4 — маршруты += «/», «/explore»")

# ── E. 09 §2 — dotfile ×5 ─────────────────────────────────────────────────
print("E. 09-lessons")
patch(P09,
      "## 3.",
      """**Пятый раз (8.7, 2026-09-15).** Переименование 8.6 спасло `env.local.example`
и `dev-billing-state/`, но правки ДРУГИХ dotfile той же выкладкой потеряны:
`.env.example` в HEAD 3555048 снова без `STRIPE_PRICE_*`, `.gitignore` без
`dev-billing-state/` — `check:integration` (4ak/4al/4ao) на чистом клоне
падает, хотя 8.6 их правила. Вывод: теряются не файлы с точкой, а ПРАВКИ в
файлах с точкой — переименовать можно только те, что не читают инструменты.
Воссозданы в 8.7 (запрос 1). Решение для 8.8/9.x: `scripts/check-dotfiles.mjs`
(или секция интеграции), которая падает на клоне при отсутствии строк —
чтобы потеря обнаруживалась выкладкой, а не следующей беседой.

## 3.""",
      "09 §2 — dotfile ×5")

# ── H. ЗАВЕРШЕНИЕ беседы 8.7 (2026-09-15): «По факту 8.7», врезка Фазы 8,
#      §12, 08 (Часть I и II), 09, 05, README, NEXT-CONTEXT ─────────────────
print("H. завершение 8.7")
P08 = "docs/08-history.md"
PREADME = "README.md"
PNEXT = "NEXT-CONTEXT.md"

patch(P07,
      "\n---\n\n## 9. Ситуативные шаблоны запросов",
      """
**По факту 8.7 (2026-09-15) — отступления от буквы запроса и найденное:**

1. **Сервер всё-таки правился — в одном месте и по решению пользователя.**
   §12 после 8.6 велел «снять `isPublic` в DTO и синоним PATCH в 8.7»; запрос
   1 запрещал трогать сервер. Клиент снят в запросе 1, сервер — после выбора
   пользователя между (а) оставить синоним совместимостью и (б) снять: принят
   вариант (б). Итог: поля `isPublic` нет ни в `SynthesisFull`, ни в
   `SynthesisPreview`, ни в `SynthesisPatchInput`; тело PATCH с `isPublic` →
   400 `details.isPublic: «снят в 8.7 — используйте visibility»` (не
   молчаливый no-op — старый клиент увидит ошибку); `isPublicOf` в shared
   остался единственным местом схлопывания ступени в булево. Переписаны
   integration 5n/5ac/4p/4ao, smoke-86, test-86 R3/R12 (102 → 101 ✓).
2. **Разделы гостю — из ответа GET /:id, последовательной загрузкой.**
   synthesis-store 1.6b звал `Promise.all([GET /:id, GET /sections])`; гостю
   /sections — 401, витрине — 403, и весь load падал. Порядок стал
   последовательным, источник разделов решает ответ: `synthesis.sections`
   (гость, 'full') → оттуда с сводками для оглавления из тел; `scope ===
   'showcase'` → разделов нет ПО ПРАВУ, /sections не зовётся; иначе — как
   прежде. `reloadSections` гостя перечитывает GET /:id (`sectionsEmbedded`).
3. **Сырых флагов в SynthesisPreview нет** (03 §2.2 их не обещает) —
   переключатель в карточке дотягивает их `GET /syntheses/:id` при открытии
   панели (владельцу отдаются все поля). Сервер под это не правился.
4. **Кнопки логов/запросов — по `effectiveFlags`, а не «по 403 постфактум»**
   (п.4d): `logsAvailable = isOwner || (!isGuest && eff.showLogs)`,
   `promptsAvailable` — так же по showPrompts (`ContextLogViewer.promptsAvailable`
   прячет «⤓ Скачать промпты»); граф и экспорт — `contentAvailable = isOwner ||
   (!isGuest && scope === 'full')` (их пути под requireAuth с гейтом витрины).
   Гостю также не открываются WS, GET /modes, GET /lineage/ancestors.
5. **Полоса режима просмотра** рисуется всякому невладельцу (п.4a «ничего
   зарегистрированному» — о кнопке): текст, ступень, authorName; гостю —
   «Создать аккаунт». Владельцу полосы нет.
6. **RequireAuth уводит гостя на «/», не на /login** (п.3 «гость на любом
   другом маршруте — редирект на '/'»); исходный путь уезжает в `state.from`,
   LandingPage передаёт его «Войти», LoginPage возвращает как прежде. Маршрут
   `*` гостю — тоже «/», вошедшему — NotFoundPage; 404 сервера на
   несуществующий id — страница 404 ВНУТРИ Layout (PageError 1.6b), как и 403.
7. **Истёкшая сессия на открытом документе**: 401 на любом запросе (например
   «◈ Лог») → auth-store 'anonymous' → SynthesisPage перечитывает документ
   гостем (`prevAuthRef`; 'restoring' переходом не считается) — полоса
   становится гостевой, кнопки владельца исчезают, страница не падает.
8. **PlansTable вынесена из BillingPage** (п.1c): одна таблица на /billing и
   стартовую, столбец действия — слот `renderAction` (на стартовой столбца
   нет вовсе). `periodWord` уехал туда же.
9. **Dotfile-грабля ПЯТЫЙ раз** (HEAD 3555048: `.env.example` без
   STRIPE_PRICE_*, `.gitignore` без dev-billing-state/) — переименование 8.6
   спасло только переименованное; теряются ПРАВКИ файлов с точкой. Воссозданы;
   заведён `scripts/check-dotfiles.mjs` (`npm run check:dotfiles`) — падает за
   секунду без БД, первый шаг после `git clone` (долг закрыт в этой же беседе).
10. **Стенд 8.7** — браузер (puppeteer-core + Chrome 131 из
    `~/.cache/puppeteer`, vite :5199 + сервер :3000 + мок Claude + PG16/Redis,
    БД philosynth с посевами и `price_mock_*`), фикстуры SQL как в test-86.
    Грабли прогона: `setCookie` второго пользователя вытесняет сессию первого
    во всём браузере — чужой смотрящий в `createBrowserContext()`; `innerText`
    кнопок капителью (CSS text-transform) — сравнения без учёта регистра;
    каталожная запись входит в пул уже ☑ (клик снимал участие); PG/Redis в
    песочнице гаснут между заходами. 101 ✓ ×2.
11. **Устаревшие тесты**: test-16b (кнопка «Опубликовать», PATCH { isPublic })
    и SQL-вставки `is_public` в test-16b/17/52 мертвы с 8.6 — не переписаны
    (их предмет покрыт test-86/87), в §12 не заводятся: беседы закрыты.

---

## 9. Ситуативные шаблоны запросов""",
      "07 — блок «По факту 8.7»")

patch(P07,
      "витрина) добавлены 2026-09-14; 8.6 проведена 2026-09-15, 8.7 — следующая.",
      "витрина) добавлены 2026-09-14; 8.6 и 8.7 проведены 2026-09-15 — фаза\n> закрыта целиком.",
      "07 врезка Фазы 8 — 8.7 проведена")

patch(P07,
      """редакторов нет («чего не делать» 8.6).
""",
      """редакторов нет («чего не делать» 8.6).

Беседа 8.7 (2026-09-15) долгов не оставила: реестр пуст. Ограничение
«`isPublic` в DTO и синоним в PATCH» СНЯТО в 8.7 (вариант б — с сервера и
shared целиком, PATCH с isPublic → 400). Сторож dotfile
`scripts/check-dotfiles.mjs` заведён этой же беседой (не долг). Остаются
ограничения без адресата: pausedState чужому зарегистрированному на 'full';
отвязки родителя нет; админского UI тарифов нет; `gm-hint` без CSS-правила;
устаревшие test-16b/17/52 (is_public) не переписаны.
""",
      "07 §12 — итог 8.7")

# 08 Часть I
patch(P08,
      "scripts/patch-docs-conv86.py. Реестр §12 пуст; следующая — 8.7.\n",
      """scripts/patch-docs-conv86.py. Реестр §12 пуст; следующая — 8.7.
Беседа 8.7 (витрина — стартовая страница, гостевая шапка и маршруты, режим
просмотра, управление публичностью; клиент) ЗАКРЫТА 2026-09-15: LandingPage на
«/» гостю (четыре опоры языком документа, живая витрина из GET /syntheses/public
×4, цены через PlansTable — вынос из BillingPage, крупная «Создать аккаунт» в
теле); Layout вне RequireAuth, защита на страницах, гостевые «/», «/explore»,
«/synthesis/:id», гость на прочем → «/» со state.from; шапка гостя «Войти ·
Регистрация» без меню; режим просмотра документа по смотрящему (полоса
невладельца, разделы из ответа GET /:id последовательной загрузкой, витрина без
разделов и без /sections, кнопки по effectiveFlags и смотрящему, WS/modes/
lineage только вошедшему, 403 гостю → «приватна» + вход с возвратом, перечитка
при смене сессии, authorName в шапке); VisibilityControl вместо «Опубликовать»
(три ступени, галочки по ступеням — на витрине только авторство со
строкой-пояснением, флаги из GET /:id, ОДИН PATCH, подпись audienceText);
META_NOT_ALLOWED — названием и причиной в форме; CSS-блок 8.7 без новых hex;
по решению пользователя (вариант б) isPublic снят с сервера и shared целиком
(PATCH с isPublic → 400). Dotfile-грабля ×5 — воссозданы + scripts/check-
dotfiles.mjs. Смоук 120 ✓, tests/test-87-requests2-12.mjs 101 ✓ ×2 в браузере,
test-86 101 ✓, check:integration += 2ae/4ap; доки — scripts/patch-docs-conv87.py.
Реестр §12 пуст; Фаза 8 закрыта целиком; следующая беседа не назначена.
""",
      "08 Часть I — 8.7")

# 08 Часть II — глава 8.7 перед 8.6 (новые сверху)
patch(P08,
      "### Беседа 8.6 — Модель публичности и гостевой доступ (бэкенд) [ЗАКРЫТА 2026-09-15]",
      """### Беседа 8.7 — Витрина: стартовая страница и управление публичностью (клиент) [ЗАКРЫТА 2026-09-15]

> Запрос 1 целиком (App/Layout/Header, LandingPage, PlansTable,
> VisibilityControl + visibility-text, SynthesisCard/List, CatalogPage
> publicOnly, synthesis-store последовательная загрузка, SynthesisPage режим
> просмотра, DocumentView/Header, ContextLogViewer.promptsAvailable,
> CreateSynthesisPage.metaNotAllowedText, CSS-блок 8.7, dotfile воссозданы,
> scripts/patch-docs-conv87.py) → патч philosynth-8.7-request1.patch; смоук
> tests/smoke-87-request1.mjs 119 → 120 ✓; по выбору пользователя вариант (б):
> isPublic снят с сервера/shared, PATCH с isPublic → 400 (integration 5n/5ac/
> 4p/4ao/4t, smoke-86, test-86 переписаны — 101 ✓); тестовые запросы R2–R12
> одним заходом tests/test-87-requests2-12.mjs 101 ✓ ×2 (браузер, ~90 с);
> завершение: tsc -b 0, typecheck:checks/scripts 0, audit ✓, check-map 0,
> css-parity 0/586 (C — gm-hint), check:integration += 2ae/4ap → INTEGRATION
> OK, `npm run check:dotfiles`. Полный текст решений — «По факту 8.7» в 07.

#### Что создано / изменено

- `client/src/pages/LandingPage.tsx` (новый) — «/» гостю; вошедшего → /catalog
- `client/src/components/billing/PlansTable.tsx` (новый) — вынос из BillingPage
- `client/src/components/catalog/VisibilityControl.tsx` (новый) — ступени + галочки, один PATCH
- `client/src/utils/visibility-text.ts` (новый) — тексты ступеней, `flagsShownFor`, `audienceText`
- `client/src/App.tsx` — Layout вне RequireAuth, гостевые маршруты, гость → «/»
- `client/src/components/layout/Layout.tsx`, `Header.tsx` — гостевая шапка, меню вошедшему
- `client/src/pages/CatalogPage.tsx` (publicOnly, visibilityErrorText, один PATCH), `SynthesisCard.tsx`, `SynthesisList.tsx`
- `client/src/stores/synthesis-store.ts` — последовательная загрузка, `summariesFromSections`, `sectionsEmbedded`
- `client/src/pages/SynthesisPage.tsx` — полоса, гейты по effectiveFlags, WS/modes/lineage вошедшему, 403 гостю, перечитка при смене сессии
- `client/src/components/document/DocumentView.tsx` (витрина), `DocumentHeader.tsx` (authorName), `logs/ContextLogViewer.tsx` (promptsAvailable)
- `client/src/pages/CreateSynthesisPage.tsx` — `metaNotAllowedText`; `BillingPage.tsx` — PlansTable; Login/Register/NotFound — «на главную»
- `client/src/api/syntheses.ts` — `SynthesisClientPatch`, комментарии 8.6/8.7
- `client/src/globals.css` — блок 8.7 в части 3
- `packages/shared/types/synthesis.ts`, `utils/visibility.ts`; `server/routes/syntheses.ts`, `server/audit.mts` — isPublic снят (вариант б)
- `server/integration-check.mts` — 5n/5ac/4p/4ao/4t правки, += 2ae/4ap
- `tests/smoke-87-request1.mjs`, `tests/test-87-requests2-12.mjs`; `tests/smoke-86-request1.mjs`, `tests/test-86-requests2-14.mjs` под (б)
- `scripts/check-dotfiles.mjs` + `npm run check:dotfiles`; `.env.example`, `.gitignore` воссозданы
- `scripts/patch-docs-conv87.py`

#### Открытые TODO после 8.7

Нет. Реестр §12 пуст. Фаза 8 закрыта целиком.

### Беседа 8.6 — Модель публичности и гостевой доступ (бэкенд) [ЗАКРЫТА 2026-09-15]""",
      "08 Часть II — глава 8.7")

# 09 — уроки браузерных тестов и клиента
patch(P09,
      "## 5. Node, TypeScript, сборка",
      """**Браузерный стенд с двумя пользователями (8.7).** `page.setCookie` для
второго пользователя перезаписывает cookie сессии ВО ВСЁМ браузере — первый
пользователь на другой вкладке молча становится вторым, и его каталог
«пустеет» (таймаут селектора карточки). Чужой смотрящий живёт в
`browser.createBrowserContext()`. Кнопки с CSS `text-transform: uppercase`
отдают `innerText` капителью («◈ ГРАФ») — сравнивать без учёта регистра или по
`textContent`. Каталожная запись входит в пул уже ☑ участником
(`catalogPreviewToPoolEntry`) — клик по чекбоксу снимает участие. Puppeteer:
`puppeteer-core` в песочнице ставится `npm install --no-save`, Chrome —
`~/.cache/puppeteer/chrome/linux-131…/chrome` (CHROME_PATH).

## 5. Node, TypeScript, сборка""",
      "09 §4 — браузерный стенд 8.7")

patch(P09,
      "## 7. Сервер: стрим, WS, Redis, Registry",
      """**Гость в клиенте, рассчитанном на владельца (8.7).** Параллельная загрузка
`Promise.all([GET /:id, GET /sections])` валит всю страницу, когда второй путь
закрыт смотрящему (гость — 401, витрина — 403): грузить последовательно, а
откуда брать разделы — решать по ответу первого запроса. Кнопки под
`requireAuth` не рисовать неработающими: доступность считать заранее по
`effectiveFlags` и смотрящему, а не ловить 403. `RequireAuth` — на страницах,
не на каркасе: иначе гостевого маршрута внутри общего Layout не построить.
Смена сессии на открытой странице (401 → 'anonymous') — повод перечитать
данные тем, кем человек стал, а 'restoring' — не переход.

## 7. Сервер: стрим, WS, Redis, Registry""",
      "09 §6 — гость в клиенте")

# 05 — тесты и сторож
patch(P05,
      "├── dev-billing-state/              # 8.6: pid-файлы и логи стенда (в .gitignore; было",
      "├── scripts/check-dotfiles.mjs      # 8.7: сторож правок .env.example/.gitignore/env.local.example (npm run check:dotfiles) — dotfile-грабля ×5\n├── dev-billing-state/              # 8.6: pid-файлы и логи стенда (в .gitignore; было",
      "05 — check-dotfiles")

# README
patch(PREADME,
      "npm run typecheck:scripts\n```",
      "npm run typecheck:scripts\nnpm run check:dotfiles                  # правки .env.example/.gitignore не потеряны выкладкой (8.7)\n```",
      "README — check:dotfiles")
patch(PREADME,
      "## Статус: Фазы 0–7 завершены",
      "## Статус: Фазы 0–8 завершены",
      "README — статус")
patch(PREADME,
      "| 8 — пусковая пригодность | 8.1–8.7 | открыта 2026-09-08; 8.1, 8.2 закрыты 2026-09-08; 8.3 закрыта 2026-09-09; 8.4, 8.5 закрыты 2026-09-14; 8.6 закрыта 2026-09-15; 8.7 — следующая |",
      "| 8 — пусковая пригодность | 8.1–8.7 | 2026-09-15 (открыта 2026-09-08; 8.1, 8.2 — 09-08; 8.3 — 09-09; 8.4, 8.5 — 09-14; 8.6, 8.7 — 09-15). Публичная концепция и цены видны гостю: «/», «/explore», «/synthesis/:id» |",
      "README — строка Фазы 8")

# NEXT-CONTEXT — перезапись состояния и комплекта
patch(PNEXT,
      """Фазы 0–7 закрыты. Фаза 8 «Пусковая пригодность»: 8.1–8.6 ЗАКРЫТЫ (8.6 —
модель публичности и гостевой доступ, бэкенд, 2026-09-15; см. «По факту 8.6»
в 07 и главу 8.6 в 08). Осталась 8.7 (витрина — стартовая страница, гостевая
шапка и маршруты, режим просмотра, управление публичностью; клиент) — она
ТОЛЬКО после 8.6 и теперь может идти. Реестр долгов 07 §12 пуст. Ограничения
без адресата: `isPublic` в DTO и синоним в PATCH — снять в 8.7 вместе с
«Опубликовать»; pausedState чужому на 'full' отдаётся как до 8.6; отвязки
родителя нет; `gm-hint` без CSS-правила предсуществует; админского UI
тарифов нет.""",
      """Фазы 0–8 закрыты. Фаза 8 «Пусковая пригодность» закрыта целиком 2026-09-15
беседой 8.7 (витрина — стартовая страница «/», гостевая шапка и маршруты,
режим просмотра, управление публичностью; клиент; см. «По факту 8.7» в 07 и
главу 8.7 в 08). Следующая беседа НЕ НАЗНАЧЕНА: протокол §8 бесед за 8.7 не
содержит, реестр долгов 07 §12 пуст. Ограничения без адресата (не долги):
pausedState чужому зарегистрированному на 'full' отдаётся как до 8.6; отвязки
родителя нет; админского UI тарифов нет; `gm-hint` без CSS-правила
предсуществует; test-16b/17/52 мертвы с 8.6 (is_public) и не переписаны.
Кандидаты для новой фазы — по итогам прогона на чистой машине владельцем.""",
      "NEXT-CONTEXT — состояние")
patch(PNEXT,
      """`.gitignore` (`grep dev-billing-state/`) — их ПРАВКИ выкладка всё ещё может
потерять; после каждой выкладки — `git ls-files -- '.*'` и
`check:integration` на свежем клоне.""",
      """`.gitignore` (`grep dev-billing-state/`) — их ПРАВКИ выкладка всё ещё может
потерять (8.7 нашла пятую потерю); после каждой выкладки на свежем клоне —
`npm run check:dotfiles` (секунда, без БД; 8.7), затем `check:integration`.""",
      "NEXT-CONTEXT — dotfile")
patch(PNEXT,
      "(8.4 — 2ab/4am; 8.5 — 2ac/4an/5ab; 8.6 — 2ad/4ao/5ac; следующая серия —\n  2ae/4ap/5ad).",
      "(8.4 — 2ab/4am; 8.5 — 2ac/4an/5ab; 8.6 — 2ad/4ao/5ac; 8.7 — 2ae/4ap;\n  следующая серия — 2af/4aq/5ad).",
      "NEXT-CONTEXT — серии integration")
patch(PNEXT,
      "- `isPublic` в DTO — производное `visibility !== 'private'` (@deprecated), в\n  PATCH — синоним до 8.7; колонки в БД нет.",
      "- `isPublic` снят 8.7 целиком (DTO и PATCH; тело с isPublic → 400\n  details.isPublic); «публична» = `visibility !== 'private'` (`isPublicOf`).",
      "NEXT-CONTEXT — isPublic 8.6-блок")

# Комплект 8.7 → заменить на «Что 8.7 оставила знать»
nx = (ROOT / PNEXT).read_text(encoding="utf-8")
start = nx.find("## Комплект ближайшей беседы — 8.7")
end = nx.find("## Что 8.6 оставила знать всем беседам")
if start != -1 and end != -1 and start < end:
    new_block = """## Комплект ближайшей беседы

Беседа не назначена. Для любой следующей клиентской беседы сверх
универсального минимума: `client/src/App.tsx` (маршруты: Layout общий, защита
на страницах, гостевые «/», «/explore», «/synthesis/:id»),
`components/layout/*`, `stores/auth-store.ts`, `stores/synthesis-store.ts`
(последовательная загрузка по смотрящему), `pages/SynthesisPage.tsx` (гейты по
`effectiveFlags`), `components/catalog/VisibilityControl.tsx` +
`utils/visibility-text.ts`, `components/billing/PlansTable.tsx`; харнессы-
образцы — `tests/test-87-requests2-12.mjs` (браузер, два пользователя в
раздельных контекстах) и `tests/test-86-requests2-14.mjs` (что гость получает
по API).

## Что 8.7 оставила знать всем беседам

- Гость есть в клиенте: `RequireAuth` стоит на страницах, не на каркасе; гостя
  уводит на «/» со `state.from`. Смотрящий в UI — `isOwner` из ответа +
  `auth-store.status`; доступность кнопок считается по `effectiveFlags` и
  scope ЗАРАНЕЕ, не по 403.
- Разделы документа берутся по ответу GET /:id: вложенные `sections` (гость,
  'full') → из них; `scope === 'showcase'` → разделов нет по праву; иначе —
  /sections. Загрузка последовательная, не `Promise.all`.
- `isPublic` больше нет нигде (вариант б): ступень + четыре флага; PATCH с
  `isPublic` → 400. Панель публичности берёт флаги `GET /:id` (превью их не
  несёт) и шлёт ОДИН PATCH по «Сохранить».
- Тарифы рисует одна `PlansTable` (столбец действия — слот); стартовая и
  /billing не расходятся.
- Браузерные тесты с двумя пользователями — второй в
  `browser.createBrowserContext()`; сравнение текстов кнопок без учёта регистра.
- `npm run check:dotfiles` — первый шаг после клона: ловит потерю правок
  `.env.example`/`.gitignore`/`env.local.example` за секунду.

"""
    (ROOT / PNEXT).write_text(nx[:start] + new_block + nx[end:], encoding="utf-8")
    applied += 1
    print("  ok    NEXT-CONTEXT — комплект 8.7 → «Что 8.7 оставила»")
elif "## Что 8.7 оставила знать всем беседам" in nx:
    skipped += 1
    print("  skip  NEXT-CONTEXT — комплект 8.7 → «Что 8.7 оставила»")
else:
    failed += 1
    print("  fail  NEXT-CONTEXT — комплект 8.7: якоря не найдены")

print(f"\nприменено {applied}, пропущено {skipped}, не найдено {failed}")
raise SystemExit(1 if failed else 0)
