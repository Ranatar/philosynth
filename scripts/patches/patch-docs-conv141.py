#!/usr/bin/env python3
"""Патч документации по беседе 14.1 (довершение локализации сервера: Д-51,
Д-52, Д-53, Д-56, Д-58, Д-60, Д-61; только сервер, оснастка i18n и deploy/*).
ЧАСТЬ I — ПЕРВЫЙ ЗАПРОС (2026-10-20):
  A  07 — блок «По факту 14.1 (первый запрос)» после текста беседы: сверка
     текста с кодом (п.0) с перечнем расхождений, счёт описи ДО/ПОСЛЕ по
     долгам и файлам, белый список с доводами, решения по каждому долгу,
     найденное сверх текста (WS вне контекста языка, Stripe без Checkout);
     §12 — две новые строки с адресатом 14.2 (Д-76 плашка строки-места на
     клиенте, Д-77 locale Stripe Elements).
  B  03 §2.1 — язык ответов: письма под языком получателя, обработчики WS,
     notFound/onError, PNG — единственная выгрузка на языке запроса,
     описание продукта Stripe — английское.
  C  02 §2.31 — mail_outbox: тело хранится собранным под языком получателя.
  D  04 — строка 14.1: sanitizeWarnings/report, фабрики подсказок,
     MailRecipient.uiLocale, tableLockHint, stripeProductDescriptionFor,
     updateProduct, preferred_locales.
  E  05 — дерево: smoke-141-request1, пометки templates.ts/html-parser.ts/
     png-exporter.ts/stripe-create-prices.ts.
  F  NEXT-CONTEXT — первый запрос 14.1 исполнен, что осталось.
  Часть II (H–J, 2026-10-20) — тестовые запросы 2–5 одним заходом: 07 «По факту»,
     05, NEXT-CONTEXT. Часть III (K–O, 2026-10-20) — завершение: 07 §12 строки сняты → 08 Часть IV;
     08 Части I/II; README (14.1 закрыта); 09 §2/§4/§7; NEXT-CONTEXT (ближайшая — 14.2).
Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ; блоки «По факту» —
по marker). Запуск из корня:
    python3 scripts/patches/patch-docs-conv141.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
applied = skipped = failed = 0


def patch(rel: str, old: str, new: str, label: str, marker: str | None = None) -> None:
    global applied, skipped, failed
    path = ROOT / rel
    if not path.exists():
        failed += 1
        print(f"  fail  {label}: нет файла {rel}")
        return
    text = path.read_text(encoding="utf-8")
    if new in text or (marker is not None and marker in text):
        skipped += 1
        print(f"  skip  {label}")
        return
    if text.count(old) != 1:
        failed += 1
        print(f"  fail  {label}: якорь встречается {text.count(old)} раз")
        return
    path.write_text(text.replace(old, new), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


# ── A. 07 «По факту 14.1 (первый запрос)» ────────────────────────────────
PF141 = """
**По факту 14.1 (первый запрос — 2026-10-20).** Вход: HEAD dd1b1e0,
`check:dotfiles` чист, `npm install` в самом клоне, PG 16 и Redis в
песочнице, `i18n:check --strict` на чистом клоне зелёный (1961 ключ, 2371
строка таблицы). Порядок — п.0 сверка, затем Д-58 → Д-52 → Д-53 → Д-60 →
Д-51 → Д-56 → Д-61 → сторож.

0. **Сверка текста с кодом** (grep по каждой названной функции, до правок).
   Совпало: `details.email = "Обязательное поле"` и соседи в шести роутах и
   трёх сервисах; `LAST_ADMIN_MESSAGE`, `TABLE_LOCK_HINT`, `CAPSULE_LOCK_HINT`
   — константы модуля; `notFound`/`onError` в `index.ts` вне `SCOPE` описи;
   письма — голые шаблонные строки с `hoursPhrase` по остатку от деления;
   `html-parser` — `sanitizeWarningsRu`, `subsectionPlaceholder`, отказы
   `SubsectionHtmlError`; PNG — `secTitle("ТИПЫ КАТЕГОРИЙ")`, `"Кластер " +
   n`, `"другое"`, подсказка направлений; `ensureProduct` — `findProduct →
   return found`. Расхождения с текстом беседы: (а) **шестой слепой вид
   описи, не названный строкой Д-58**: `super("…")` в подклассах `Error`
   (`prompt-registry.ts` — `RegistryNotFoundError`, `TemplateRenderError`;
   сообщения уходят в `error` админ-роутов) — добавлен к пяти названным;
   (б) **Checkout у службы нет**: подписка оформляется `default_incomplete`
   + Stripe Elements на клиенте (7.1), так что «locale Checkout по языку
   покупателя» неисполним дословно; серверный эквивалент —
   `preferred_locales` у Customer (по нему Stripe переводит счета,
   квитанции и письма), `locale` Elements — клиент, строка Д-77 → 14.2;
   (в) **обработчики WebSocket живут вне `requestLocale`** (`onMessage`/
   `onOpen` — события сокета, не цепочка Hono): уже существовавшие `tl()`
   в `ws/handler.ts` отвечали по-русски любому пользователю — не названо ни
   одной строкой §12; закрыто здесь (`runWithLocale(user.uiLocale, …)` вокруг
   `handleMessage` и `handleResume`), потому что иначе три запасных текста
   Д-53 в том же файле переводились бы впустую; (г) **клиентские
   `PLACEHOLDER_RE`/`PLACEHOLDER_NAME_RE`** (`subsection-rich-editor.ts`)
   разбирают русский машинный префикс `подраздел N:` и отрезают только
   русский хвост `— правится отдельно…`: префикс оставлен машинным токеном на
   обеих сторонах (разбор — по номеру, старые черновики сохраняются),
   переводится только хвост; плашка клиента при en/de покажет имя вместе с
   переведённым хвостом до 14.2 — строка Д-76; (д) `validationJson(c,
   {type: "…"})` в `routes/enrichment.ts` был невидим описи даже после
   расширения (`MSG_CALLS` искал `.json`, а не суффикс `Json`) — добавлены
   `Json`, `fillText`, `strokeText` (последние два — надписи легенды PNG);
   (е) **сверх текста** найдено русское время ответа:
   `validateConceptForMetaSynthesis` (3 текста) и `unsuitableConceptMessage`
   (межфайловая константа в `details.participants`), `plan_steps_added.reason`
   в `plan-executor.ts` (2; клиент не показывает — переведено ради нуля в
   описи), сообщения `prompt-registry.ts` (5) — переведены; (ж) **белый
   список по праву**, записи `names.json` с `id: null`: `server/utils/
   crypto.ts` ×3 (ошибки конфигурации `API_KEY_ENCRYPTION_SECRET`/AES — консоль
   и 500 без текста), `html-parser.ts:143/278` («не удалось создать контейнер
   фрагмента» — недостижимая внутренняя ошибка linkedom), `parent-context.ts:290`
   (`validateParentDeps` — самопроверка констант в консоль), `import-service.ts:1196`
   («Импортированный документ» — значение по умолчанию `syntheses.title`, не
   надпись), `mode-service.ts:316` (`КОНТЕКСТ КОНЦЕПЦИИ:` — текст промпта,
   пойман по свойству `text`), описания `MODE_CONFIG.desc` ×3 (зеркало
   `MODE_UI`, пойманы по новому `desc` в `MSG_PROPS`) — им заведены строки
   таблицы `server.modeService.*Description` с отметкой `data` и переводами,
   уже утверждёнными для `modes.modeModal.*` (тот же русский текст);
   (з) `lookupWarnings` в `recommendations.ts` никто не читает (мёртвый
   массив) — не трогалось; `bad` в `element-step.ts` и хранится, и бросается
   (двойное назначение) — 14.2 (Д-62).
1. **Д-58.** Опись `ui-strings-lib.mjs` (режим `msg`): `SCOPE` += группа
   `server-messages` (`server/` целиком; вне — `server/config`, `server/db`,
   `env.ts`, `audit.mts`, `integration-check.mts`); правила (1) присваивание
   `details.x`/`d[field]`/`dd["x"]` (`DETAILS_IDS`), (2) литерал по имени —
   `literalsByName`: константы модуля, локальные переменные, параметры
   функций, чей довод уходит в контекст сообщения (`collectParamSinks`),
   глубина ≤ 4, (3) `server/index.ts` и утилиты через `SCOPE`, (4) свойство
   `subject`/`desc` и сокращённая запись `{ subject }`, (5) `X.push(…)` для
   `warnings`/`reasons`/`errors`/… (`PUSH_TARGETS`), (6) `super(…)` в классе
   `*Error`, (7) `MSG_CALLS` += `Json`, `fillText`, `strokeText`. Машинные
   значения (сравнение, `case`, matcher, объект вызова метода) — по-прежнему
   вне описи (проба 4bg/A2). `i18n-check` делит красное на безымянные и
   «хранимые тексты сервера» — `STORED_TEXT_EXCLUSIONS` в `i18n-core.mjs`
   (блоки `parseTopology…hasGraph` и `resolveSubsection…removeSubsectionHtml`
   — Д-55; «метки тезисов» — Д-55; «Ошибка контекста» — Д-54; тексты
   `element-step` — Д-62), печатаются не красным, с номером долга; полный
   список — `I18N_CHECK_FULL=1`. **Счёт ДО правок** (опись после расширения,
   код до перевода): 190 записей msg-режима, из них красных 150 (140
   безымянных + 10 с ключом в `names.json`, codemod не применён), хранимых
   23. По долгам: Д-51 — 13 (`mail/templates.ts`); Д-52 — 84 (`routes/auth`
   6, `billing` 1, `enrichment` 2, `lineage` 2, `syntheses` 22, `taxonomy`
   10, `element-editor` 18, `element-enrichment` 5, `edit-planner` 18); Д-53
   — 12 (`account-deletion` 1, `element-editor` подсказки 6, `index.ts` 2,
   `ws/handler` 3; запасной текст `routes/syntheses` — в счёте Д-52); Д-60 —
   7 (`html-parser` отказы и строки-места; ещё 2 — внутренние, белый список);
   Д-56 — 12 (`png-exporter`); сверх текста — 10 переведено (`meta-synthesis`
   3, `plan-executor` 2, `prompt-registry` 5) и 12 в белый список (п.0ж).
   **ПОСЛЕ**: безымянных 0, с ключом 0, хранимых 23, `data` 41, `--strict`
   зелёный; `data-keys.ts` не изменился.
2. **Д-52.** Все тексты `details` — `tl()` под языком запроса (121 новый ключ
   беседы в сумме, см. п.8); `validationJson` в `routes/taxonomy.ts` — умолчание
   `error` вычисляется в точке ответа (`error ?? tl("common.invalidData")`),
   не в сигнатуре (иначе `static`); `edit-planner` — имена разделов через
   `secLabel(k) = isSectionKey(k) ? tData(KEY_LABELS[k]) : k`;
   `unsuitableConceptMessage` — `tl()` + `tData(KEY_LABELS[…])`;
   `element-editor` — `{options}` для «одно из: …», `{lo}–{hi}`, `{max}`.
   Ключи с тем же русским текстом, что у утверждённых строк, получили те же
   переводы (`requiredField`, `nonEmptyString`, `startFailed`, легенда).
3. **Д-53.** `lastAdminMessage()`, `tableLockHint(table)` (`switch` по
   `RenderableTable`), `capsuleLockHint()` — фабрики; сторож 4ar переведён на
   новое имя. `index.ts`: `notFound`/`onError` через `tl()` — compose Hono
   зовёт оба внутри цепочки `next()`, т.е. в контексте `requestLocale`
   (живьём 5aq/B4–B5: `/api/v1/нет` под en → «Resource not found», вне
   `/api/v1/*` — по-русски). Запасные «Не удалось запустить/возобновить…» —
   `tl()`; WS — п.0в.
4. **Д-60.** `sanitizeWarnings(report)` в `html-parser.ts` — тот же отчёт
   `SanitizeReport`, фразы `tl()`; `sanitizeSectionHtml` отдаёт и `warnings`
   (язык запроса — ответы правки, импорта), и `report` — `cleanModelHtml`
   пишет в генлог `sanitizeWarningsRu(r.report)` (хранимая русская форма,
   Д-54 не задет); отказы `SubsectionHtmlError` — `tl()`. Строка-места:
   `<!-- подраздел N: <видимый заголовок h4> — <tl хвост> -->` —
   `visibleSubsectionTitle(el)` берёт текст `<h4>` (при отсутствии — ключ
   `data-section`), префикс `подраздел N` остаётся машинным (п.0г); разбор по
   номеру — старый русский черновик под en сохраняется (A11, B8–B10).
5. **Д-51.** `MailRecipient.uiLocale`; `queueTokenMail` собирает письмо под
   `runWithLocale(user.uiLocale ?? currentLocale())` внутри точки сохранения
   — тело в `mail_outbox` лежит уже на языке получателя (работник почты
   языка не знает); три места постановки в `routes/auth.ts`: регистрация —
   `{ ...created, uiLocale: currentLocale() }` (у нового пользователя выбора
   ещё нет), `email/verify/request` — `user.uiLocale`, `password-reset` —
   `uiLocale` в выборке. Шаблоны: все фразы `tl()`, часы — плюрал
   `{n, plural, one {# час} few {# часа} many {# часов} other {# часа}}`,
   `<html lang="${currentLocale()}">`, `{service}` подстановкой. Русский
   текст проверен побайтно против шаблонов HEAD на 11 значениях часов × 3
   вида имени × 2 письма — тождествен.
6. **Д-56.** Легенда PNG: заголовки, описания маркеров, «Кластер {n}»,
   «другое», подсказка направлений — `tl()` (тексты — из утверждённых
   `graph.graphLegend.*`); типы категорий и связей — `tDataLoose(t)` (без
   ключа — как есть; «другое» не прогоняется через `tData`). Сторожа: 4ay —
   зеркала HTML/MD/MMD/JSON без `tData`, PNG обязан звать `tDataLoose`; 4y —
   кириллический литерал в `secTitle`/`fillText` PNG запрещён. Проба 5aq —
   шпион `CanvasRenderingContext2D.prototype.fillText`: под en кириллицы нет
   (кроме типа без ключа), под ru — как прежде.
7. **Д-61.** `stripeProductDescriptionFor(plan)` — английское описание, одно
   на все языки (`PhiloSynth "Pro" subscription: N syntheses, …`);
   `ensureProduct` приводит описание и имя найденного продукта
   (`stripe.updateProduct`, новый метод клиента) и зовётся **и при skip
   найденной цены** — прежде при skip продукт не трогался вовсе; в отчёте
   `skip … (описание продукта обновлено)`, поле `productUpdated`.
   `ensureStripeCustomer` создаёт Customer с `preferred_locales:
   [ui_locale | язык запроса]`; мок — `preferred_locales` у клиента,
   маршрут `POST /v1/products/:id` был с 8.3 (комментарий дополнен).
   `deploy/philosynth-hosting.md`, `philosynth-ubuntu.md` — пересев после
   обновления обязателен (цены не трогаются).
8. **Сторож и переводы.** `check:integration`: 2av (экспорты), 4bg
   (проба описи на временном файле — шесть видов + машинные значения вне;
   текстовые контракты всех пунктов; README инструментов), 5aq (живьём:
   письма в `mail_outbox` под языком получателя при чужом языке запроса,
   `notFound`/`onError` на мини-Hono с настоящим `requestLocale`, PNG под
   en/ru); 4bb — список `MSG_CALLS` проверяется по именам 12.3, не дословно;
   4an/4ao/4ar — якоря переведены на `tl()`/фабрики. 121 новый ключ:
   `names.json` дополнен (позиционные `{0}` + `params`), таблица — `i18n:export`,
   черновики en/de — `i18n:import --draft` (отметка `draft`; утверждает
   владелец), `i18n:split`; `scripts/i18n/README.md` — раздел «Какие строки
   сервера видит опись» переписан, добавлен «Язык получателя, а не запроса».
   `tests/smoke-141-request1.mjs` — 33 проверки (в процессе + живой сервер
   :3141 + мок Stripe в процессе). Миграций нет. Клиент не тронут.
"""

patch(
    "docs/07-conversation-protocol.md",
    """- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10)

---

### Беседа 14.2: Хранимые тексты и их показ (бэкенд + клиент)""",
    """- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10)
"""
    + PF141
    + """
---

### Беседа 14.2: Хранимые тексты и их показ (бэкенд + клиент)""",
    "A  07: «По факту 14.1 (первый запрос)»",
    marker="**По факту 14.1 (первый запрос — 2026-10-20).**",
)

patch(
    "docs/07-conversation-protocol.md",
    """| Д-75 | дефект | **Подписка расходится с тарифом.**""",
    """| Д-76 | недоделка | **Плашка строки-места в редакторе подраздела показывает переведённый хвост.** `client/src/utils/subsection-rich-editor.ts` — `PLACEHOLDER_NAME_RE` отрезает только русский хвост `— правится отдельно…`; с 14.1 сервер пишет хвост строки-места на языке запроса (`server.utils.htmlParser.placeholderTail`), и при en/de плашка «▣ Вложенный подраздел «…»» несёт имя вместе с хвостом. Машинный префикс `подраздел N:` на обеих сторонах остаётся (разбор по номеру). Путь: клиент режет хвост по `—` либо по переводу того же ключа; заодно — имя из видимого `<h4>` уже приходит с сервера | 14.1 (первый запрос) | 14.2 | открыт |
| Д-77 | недоделка | **Stripe Elements на клиенте без `locale`.** Checkout у службы нет (подписка `default_incomplete` + Elements, 7.1); сервер с 14.1 задаёт язык покупателя через `preferred_locales` Customer (счета, квитанции, письма Stripe), а форма карты на `BillingPage` рисуется Elements с умолчанием `auto` (язык браузера, не интерфейса). Путь: `loadStripe`/`Elements` с `locale` из хранилища языка 11.3 (ru/en/de; иначе `auto`) | 14.1 (первый запрос) | 14.2 | открыт |
| Д-75 | дефект | **Подписка расходится с тарифом.**""",
    "A2 07 §12: строки Д-76, Д-77 (адресат 14.2)",
    marker="| Д-76 | недоделка |",
)

patch(
    "docs/07-conversation-protocol.md",
    """- `07-conversation-protocol.md` §12 — строки с адресатом 14.2 (Д-54, Д-55, Д-57, Д-59, Д-62);""",
    """- `07-conversation-protocol.md` §12 — строки с адресатом 14.2 (Д-54, Д-55, Д-57, Д-59, Д-62; из 14.1 — Д-76 плашка строки-места, Д-77 `locale` Stripe Elements);""",
    "A3 07: шапка 14.2 — строки Д-76/Д-77",
    marker="из 14.1 — Д-76 плашка строки-места",
)

# ── B. 03 §2.1 ───────────────────────────────────────────────────────────
patch(
    "docs/03-specification.md",
    """// перевода → русский текст. Коды ошибок (code) и машинные значения языком
// не меняются — клиент ветвится по code, не по тексту.
""",
    """// перевода → русский текст. Коды ошибок (code) и машинные значения языком
// не меняются — клиент ветвится по code, не по тексту.
// 14.1: тексты проверки полей (details), подсказки заслона подраздела
// (lock.hint), отказ LAST_ADMIN, notFound/onError (404/500 вне роутов —
// внутри той же цепочки compose, т.е. под requestLocale; вне /api/v1/* —
// ru), предупреждения чистки и отказы ручной правки подраздела — тем же
// tl() на языке запроса. Обработчики WebSocket (вне цепочки Hono) ставят
// язык пользователя сами (runWithLocale(user.uiLocale)). ПИСЬМА службы
// (подтверждение адреса, сброс пароля) собираются под языком ПОЛУЧАТЕЛЯ
// (users.ui_locale; при регистрации — язык запроса) в момент постановки в
// mail_outbox. PNG-выгрузка — единственная выгрузка на языке запроса
// (легенда); HTML/MD/MMD/JSON — русские зеркала документа. Описание
// продукта Stripe — английское, одно на все языки; язык покупателя
// Stripe узнаёт из preferred_locales Customer. Хранимые тексты (причина
// паузы, parseWarnings, журнал, родословная файла) — по-прежнему русские
// (14.2).
""",
    "B  03 §2.1: язык ответов — 14.1",
    marker="// 14.1: тексты проверки полей (details), подсказки заслона подраздела",
)

# ── C. 02 §2.31 ──────────────────────────────────────────────────────────
patch(
    "docs/02-data-model.md",
    """**Постановка — в транзакции действия** (`enqueue(exec, letter)`, образец —
`writeAudit` 8.1):""",
    """**Язык письма (14.1, Д-51).** `subject`/`body_text`/`body_html` хранятся
уже собранными под языком ПОЛУЧАТЕЛЯ (`users.ui_locale`; при регистрации —
язык запроса): `queueTokenMail` оборачивает сборку в `runWithLocale`, работник
почты языка не знает и не должен — у одного адресата один язык чтения.
`<html lang>` письма — тот же язык.

**Постановка — в транзакции действия** (`enqueue(exec, letter)`, образец —
`writeAudit` 8.1):""",
    "C  02 §2.31: язык письма",
    marker="**Язык письма (14.1, Д-51).**",
)

# ── D. 04 ────────────────────────────────────────────────────────────────
patch(
    "docs/04-code-reuse-map.md",
    """| `metaParentAllowed` в `packages/shared/utils/visibility.ts`;""",
    """| `sanitizeWarnings(report)` и `SanitizeHtmlResult.report` в `server/utils/html-parser.ts`; `visibleSubsectionTitle`; фабрики `lastAdminMessage()` (`account-deletion.ts`), `tableLockHint(table)`/`capsuleLockHint()` (`element-editor.ts`); `MailRecipient.uiLocale` и `runWithLocale` в `queueTokenMail` (`auth-tokens.ts`); `secLabel` (`edit-planner.ts`); `stripeProductDescriptionFor` (`scripts/seed/stripe-create-prices.ts`), `stripe.updateProduct`, `createCustomer({ preferredLocales })`; опись — `DETAILS_IDS`, `PUSH_TARGETS`, `literalsByName`, `STORED_TEXT_EXCLUSIONS` | НОВОЕ (14.1; Д-51, Д-52, Д-53, Д-56, Д-58, Д-60, Д-61 — прародителей нет): всё, что сервер СОБИРАЕТ в момент ответа, — на языке запроса (`tl()`), письма — на языке получателя, PNG — единственная выгрузка на языке запроса; хранимое (генлог) по-прежнему русское через `sanitizeWarningsRu(report)`; опись i18n видит шесть прежде слепых видов сообщений и делит красное на безымянное и хранимое (14.2) |
| `metaParentAllowed` в `packages/shared/utils/visibility.ts`;""",
    "D  04: строка 14.1",
    marker="| `sanitizeWarnings(report)` и `SanitizeHtmlResult.report`",
)

# ── E. 05 ────────────────────────────────────────────────────────────────
patch(
    "docs/05-file-structure.md",
    """    │                                   # smoke-132-request1 — 13.2: metaParentAllowed, stripParentContent,""",
    """    │                                   # smoke-141-request1 — 14.1: опись msg-режима на пробе, i18n:check
    │                                   # --strict, письма под языком получателя (ru побайтно), строки-места
    │                                   # и предупреждения чистки под en/de, PNG (шпион fillText), сид цен
    │                                   # на моке Stripe (описание существующего продукта), preferred_locales;
    │                                   # живой сервер :3141 — details en/de, 404, LAST_ADMIN, PATCH подраздела
    │                                   # с <script>, письмо en-пользователю под ru-запросом
    │                                   # smoke-132-request1 — 13.2: metaParentAllowed, stripParentContent,""",
    "E  05: smoke-141-request1",
    marker="# smoke-141-request1 — 14.1:",
)

patch(
    "docs/05-file-structure.md",
    """│   │   │   ├── templates.ts            # два письма, текст и HTML: подтверждение адреса, сброс пароля""",
    """│   │   │   ├── templates.ts            # два письма, текст и HTML: подтверждение адреса, сброс пароля
│   │   │   │                           # (14.1: все фразы tl() под языком ПОЛУЧАТЕЛЯ — runWithLocale в
│   │   │   │                           # queueTokenMail; часы — плюрал; <html lang> по языку)""",
    "E2 05: templates.ts",
    marker="# (14.1: все фразы tl() под языком ПОЛУЧАТЕЛЯ",
)

patch(
    "docs/05-file-structure.md",
    """│   │       ├── png-exporter.ts         # exportPNG — node-canvas (exportPNG())""",
    """│   │       ├── png-exporter.ts         # exportPNG — node-canvas (exportPNG()); 14.1: единственная
│   │       │                           # выгрузка на языке запроса — легенда tl(), типы tDataLoose""",
    "E3 05: png-exporter.ts",
    marker="# выгрузка на языке запроса — легенда tl(), типы tDataLoose",
)

patch(
    "docs/05-file-structure.md",
    """│   │   └── stripe-create-prices.ts     # 8.3: Product+Price в Stripe ключом владельца,
│   │                                   # идемпотентно по lookup_key philosynth_<name>""",
    """│   │   └── stripe-create-prices.ts     # 8.3: Product+Price в Stripe ключом владельца,
│   │                                   # идемпотентно по lookup_key philosynth_<name>;
│   │                                   # 14.1: описание продукта английское, у найденного
│   │                                   # продукта приводится (updateProduct) и при skip цены""",
    "E4 05: stripe-create-prices.ts",
    marker="# 14.1: описание продукта английское, у найденного",
)

# ── F. NEXT-CONTEXT ──────────────────────────────────────────────────────
patch(
    "NEXT-CONTEXT.md",
    """## Ближайшая беседа — 14.1 (опись и сообщения ответа; бэкенд)
""",
    """## Ближайшая беседа — 14.1 (опись и сообщения ответа; бэкенд)

**Первый запрос 14.1 ИСПОЛНЕН 2026-10-20** («По факту 14.1 (первый запрос)»
в 07): опись msg-режима видит шесть прежде слепых видов (details[…], литерал
по имени, `server/` целиком, `subject`/`desc`, `push`, `super`) — красных
ДО 150, ПОСЛЕ 0, хранимые (14.2) отделены `STORED_TEXT_EXCLUSIONS`; тексты
проверки полей, фабрики подсказок/LAST_ADMIN, `notFound`/`onError`, WS,
предупреждения чистки и строки-места правки подраздела — `tl()` на языке
запроса; письма — под языком ПОЛУЧАТЕЛЯ (`MailRecipient.uiLocale`,
`runWithLocale` в `queueTokenMail`, плюрал часов, `<html lang>`), ru побайтно
как прежде; PNG — легенда `tl()`, типы `tDataLoose` (сторожа 4ay/4y — явное
исключение); Stripe — английское описание продукта, `updateProduct` при
skip, `preferred_locales` Customer; сторож 2av/4bg/5aq; 121 ключ с
черновиками en/de (`draft`, утверждает владелец); `tests/smoke-141-request1.mjs`.
Новые строки §12: Д-76 (плашка строки-места на клиенте), Д-77 (`locale`
Stripe Elements) — обе 14.2. Осталось: тестовые запросы 2–5 (по одному) и
завершение. Миграций нет. Клиент не тронут.
""",
    "F  NEXT-CONTEXT: первый запрос 14.1 исполнен",
    # часть III (O3) заменяет этот блок комплектом 14.2 — на повторном прогоне маркер держит skip
    marker="## Ближайшая беседа — 14.2 (хранимые тексты и их показ; бэкенд + клиент)",
)

# ── Часть II: тестовые запросы 2–5 (2026-10-20) ─────────────────────────
PF141_II = """
**По факту 14.1 (тестовые запросы 2–5 — 2026-10-20, одним заходом по
решению пользователя).** `tests/test-141-requests2-5.mjs` — 45 ✓ ×2
(в процессе + живой сервер :3142 + мок Stripe в процессе). Переводы 121
ключа беседы УТВЕРЖДЕНЫ владельцем тем же днём (вливание без `--draft`,
`draft` снят; README инструментов — строка об утверждении).

- **R2 (Д-58).** Расширенная опись (текущие `scripts/i18n/*`) на коде
  `dd1b1e0` в `git worktree`: 140 безымянных + 10 с ключом = 150 красных,
  хранимых 23 — число и раскладка по файлам тождественны «По факту»
  (templates 13, auth 6, syntheses 22, taxonomy 10, enrichment 2, lineage 2,
  billing 1, element-editor 24, element-enrichment 5, edit-planner 18,
  account-deletion 1, index 2, ws/handler 3, png-exporter 12, html-parser 9);
  на текущем коде — 0/0, `--strict` зелёный; временный файл
  `server/routes/__probe141.ts` с `d["field"] = "…"` → `--strict` красный
  строкой `server/routes/__probe141.ts:2 …`. Уточнение к п.1: пять фраз
  `sanitizeWarningsRu` (`packages/shared/utils/doc-markup-sanitize.ts`) в
  счёт описи НЕ входили и не входят — файл в `skip` группы shared как
  ХРАНИМАЯ диагностика (генлог, 14.2/Д-54); фразы ответа правки с 14.1
  собирает `sanitizeWarnings(report)` в `html-parser.ts`, который в охвате;
  комментарий `skip` приведён к этому.
- **R3 (Д-52/Д-53/Д-60).** Регистрация с пустым email под en/de —
  `details.email`/`password` «Required field»/«Pflichtfeld», `error`
  «Invalid data»/«Ungültige Daten»; невалидный email и короткий пароль под
  en — `tl` и `tData` вместе; `/syntheses/estimate` под de — все `details`
  тела по-немецки («unbekannte Methode» и др.); 404 — en/de/ru; единственный
  администратор — 409 `LAST_ADMIN` на языке запроса (en/de/ru); правка
  подраздела de-пользователем под `Accept-Language: en` — язык ПОЛЬЗОВАТЕЛЯ
  первым: строка-место «подраздел 1: § 1.1 Вложенный — wird separat
  bearbeitet, Zeile nicht löschen», warnings чистки по-немецки, сохранение
  проходит, старый русский черновик строки-места тоже, отказы
  `placeholder`/`heading` по-немецки; генлог ручной правкой не трогается.
- **R4 (Д-51).** de-пользователь, сброс пароля под ru-запросом → письмо
  по-немецки: тема «PhiloSynth: Passwort zurücksetzen», обращение, кнопка
  «Neues Passwort festlegen», сноска, `lang="de"`, «1 Stunde» — **TTL
  сброса 1 час (`TOKEN_TTL_HOURS.password_reset`), не 2, как предполагал
  текст запроса**; ru-пользователь под en-запросом — по-русски; оба письма
  под ru побайтно равны шаблонам `dd1b1e0` (15 значений часов × 5 имён × 2
  письма, включая `lang` — он и прежде был `ru`); письмо регистрации — на
  языке запроса регистрации.
- **R5 (Д-56/Д-61).** PNG под en (шпион `fillText`): кириллица только у
  типа и связи без ключа («свой тип», «своя связь»), заголовки, маркеры,
  «Cluster 2», «other», направления — переводом; под ru — как прежде;
  пустой граф — `NO_GRAPH` без кириллицы. Сид цен на моке: первый запуск —
  три продукта с английским описанием; русское описание, подставленное в
  мок, при повторном запуске приведено (`POST /v1/products/:id` ×3, цены
  skip, `productUpdated`); третий запуск — без запросов обновления.
  «Checkout получает locale» — у службы Checkout нет (п.0б): Customer
  получает `preferred_locales` по `ui_locale` (de/en/ru), без него — язык
  запроса; `locale` Elements — Д-77 (14.2).
"""

patch(
    "docs/07-conversation-protocol.md",
    """   :3141 + мок Stripe в процессе). Миграций нет. Клиент не тронут.
""",
    """   :3141 + мок Stripe в процессе). Миграций нет. Клиент не тронут.
"""
    + PF141_II,
    "H  07: «По факту 14.1 (тестовые запросы 2–5)»",
    marker="**По факту 14.1 (тестовые запросы 2–5 — 2026-10-20",
)

patch(
    "docs/05-file-structure.md",
    """    │                                   # smoke-141-request1 — 14.1: опись msg-режима на пробе, i18n:check""",
    """    │                                   # test-141-requests2-5 — 14.1: R2 опись на коде dd1b1e0 (worktree) —
    │                                   # 150 красных как в «По факту», ноль после, красный на временном
    │                                   # литерале; R3 details/404/LAST_ADMIN/правка подраздела под en/de;
    │                                   # R4 письмо сброса de-пользователя, ru побайтно против dd1b1e0;
    │                                   # R5 PNG (шпион fillText), сид цен на моке (обновление описания),
    │                                   # preferred_locales Customer
    │                                   # smoke-141-request1 — 14.1: опись msg-режима на пробе, i18n:check""",
    "I  05: test-141-requests2-5",
    marker="# test-141-requests2-5 — 14.1:",
)

patch(
    "NEXT-CONTEXT.md",
    """Stripe Elements) — обе 14.2. Осталось: тестовые запросы 2–5 (по одному) и
завершение. Миграций нет. Клиент не тронут.
""",
    """Stripe Elements) — обе 14.2. **Тестовые запросы 2–5 ИСПОЛНЕНЫ 2026-10-20
одним заходом** (`tests/test-141-requests2-5.mjs`, 45 ✓ ×2; «По факту 14.1
(тестовые запросы 2–5)»); переводы беседы утверждены владельцем. Осталось:
завершение беседы (typecheck, check:integration на свежем клоне, ревью,
строки §12 → 08 Часть IV). Миграций нет. Клиент не тронут.
""",
    "J  NEXT-CONTEXT: тестовые запросы 14.1 исполнены",
    marker="## Ближайшая беседа — 14.2 (хранимые тексты и их показ; бэкенд + клиент)",
)

# ══ Часть III: завершение беседы 14.1 (2026-10-20) ═══════════════════════
def drop_row(rel: str, prefix: str, label: str) -> None:
    """Удалить строку таблицы, начинающуюся с prefix (идемпотентно)."""
    global applied, skipped, failed
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    hits = [i for i, l in enumerate(lines) if l.startswith(prefix)]
    if not hits:
        skipped += 1
        print(f"  skip  {label}")
        return
    if len(hits) != 1:
        failed += 1
        print(f"  fail  {label}: строка встречается {len(hits)} раз")
        return
    del lines[hits[0]]
    path.write_text("\n".join(lines), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


# K. 07 §12 — закрытые строки уходят в 08 Часть IV
for n, kind in (("51", "недоделка"), ("52", "недоделка"), ("53", "недоделка"), ("56", "недоделка"), ("60", "недоделка"), ("61", "недоделка"), ("58", "оснастка")):
    drop_row("docs/07-conversation-protocol.md", f"| Д-{n} | {kind} |", f"K  07 §12: строка Д-{n} снята")

# L1. 08 Часть IV — семь строк с датой и итогом
patch(
    "docs/08-history.md",
    """`mailLimiter` — то же правило; test-132 R4 (100 случайных cookie, две сессии, XFF без/с TRUST_PROXY, mailLimiter) |
""",
    """`mailLimiter` — то же правило; test-132 R4 (100 случайных cookie, две сессии, XFF без/с TRUST_PROXY, mailLimiter) |
| Д-58 — опись i18n не видела пять видов серверных сообщений (details[…], константа по имени, файлы вне SCOPE, свойство вне MSG_PROPS, push), и Д-51…Д-54, Д-60 проходили `--strict` зелёными | 14.1 | ревизия непереведённого 2026-10-13 (код) | ЗАКРЫТ 14.1 (2026-10-20): `ui-strings-lib.mjs` (msg) — группа `server-messages` на `server/` целиком, `DETAILS_IDS`, `PUSH_TARGETS`, `literalsByName` (константы, переменные, параметры-стоки, глубина ≤ 4), `subject`/`desc`, `super(…)` в `*Error` (шестой вид сверх текста), `MSG_CALLS` += `Json`/`fillText`/`strokeText`; `i18n-check` делит красное на безымянное и хранимое (`STORED_TEXT_EXCLUSIONS` с номерами Д-54/Д-55/Д-62); счёт ДО 150 красных → ПОСЛЕ 0 (test-141 R2 на коде dd1b1e0); белый список — `names.json` `id: null` с доводами в «По факту»; README инструментов переписан; сторож 4bg (проба описи на временном файле) |
| Д-51 — письма службы только по-русски (тема, текст, кнопка, `lang="ru"`, склонение часов) | 14.1 | ревизия непереведённого 2026-10-13 (код) | ЗАКРЫТ 14.1 (2026-10-20): письма собираются под языком ПОЛУЧАТЕЛЯ в момент постановки (`MailRecipient.uiLocale`, `runWithLocale` в `queueTokenMail`; регистрация — язык запроса), все фразы `tl()`, часы — плюрал, `<html lang>` по языку; ru побайтно как прежде (сверено с шаблонами dd1b1e0); 5aq живьём, test-141 R4 |
| Д-52 — тексты проверки полей (`details`) только по-русски в шести роутах и трёх сервисах | 14.1 | ревизия непереведённого 2026-10-13 (код) | ЗАКРЫТ 14.1 (2026-10-20): все `details` — `tl()` под языком запроса, имена разделов — `tData(KEY_LABELS[…])` (`secLabel` в edit-planner, `unsuitableConceptMessage`), умолчание `validationJson` taxonomy — в точке ответа; сверх текста — `validateConceptForMetaSynthesis`, `plan-executor` reasons, `prompt-registry`; test-141 R3 (en/de/ru) |
| Д-53 — `LAST_ADMIN_MESSAGE`, `TABLE_LOCK_HINT`/`CAPSULE_LOCK_HINT`, `notFound`/`onError`, запасные «Не удалось …» без `tl()` | 14.1 | ревизия непереведённого 2026-10-13 (код) | ЗАКРЫТ 14.1 (2026-10-20): фабрики `lastAdminMessage()`, `tableLockHint()`, `capsuleLockHint()`; `index.ts` через `tl()` (compose Hono зовёт notFound/onError в контексте `requestLocale` — проверено живьём, вне `/api/v1/*` — ru); запасные тексты `tl()`; сверх текста — обработчики WebSocket получили язык пользователя (`runWithLocale(user.uiLocale)`); 5aq, test-141 R3 |
| Д-56 — PNG-выгрузка переведена наполовину (заголовки легенды, «Кластер», «другое», направления — русские) | 14.1 | ревизия непереведённого 2026-10-13 (код) | ЗАКРЫТ 14.1 (2026-10-20): легенда — `tl()` (тексты утверждённых `graph.graphLegend.*`), типы — `tDataLoose` (без ключа — как есть); PNG — ЯВНОЕ исключение из правила зеркал: 4ay запрещает `tData` в HTML/MD/MMD/JSON и требует его в PNG, 4y красит кириллический литерал в `secTitle`/`fillText`; 5aq и test-141 R5 — шпион `fillText` под en/ru |
| Д-60 — ручная правка подраздела: предупреждения чистки, отказы строк-мест и сама строка-места по-русски | 14.1 | ревизия непереведённого 2026-10-13 (код) | ЗАКРЫТ 14.1 (2026-10-20): `sanitizeWarnings(report)` в `html-parser` для ответа (язык запроса), `sanitizeWarningsRu(report)` остаётся хранимой формой генлога (`report` в `SanitizeHtmlResult`); отказы `SubsectionHtmlError` — `tl()`; строка-места `<!-- подраздел N: <видимый h4> — <tl хвост> -->` при машинном префиксе `подраздел N` (разбор по номеру, старые черновики сохраняются — проверено); клиентская плашка — Д-76 (14.2); test-141 R3 |
| Д-61 — описание продукта Stripe по-русски; сид не трогал существующий продукт; язык покупателя Stripe не знал | 14.1 | ревизия непереведённого 2026-10-13 (код) | ЗАКРЫТ 14.1 (2026-10-20): `stripeProductDescriptionFor` — английское описание, одно на все языки (решение владельца); `ensureProduct` приводит описание/имя найденного продукта (`stripe.updateProduct`) и при skip цены; Customer — `preferred_locales` по `ui_locale` (Checkout у службы нет — `locale` Elements Д-77, 14.2); deploy/* — пересев; test-141 R5 на моке |
""",
    "L1 08 Часть IV: строки Д-51…Д-61 закрыты",
)

# L2. 08 Часть II — глава беседы 14.1
patch(
    "docs/08-history.md",
    """### Беседа 13.2 — Утечки и лимитер запросов (бэкенд) [ЗАКРЫТА 2026-10-20 — Фаза 13 закрыта]
""",
    """### Беседа 14.1 — Опись и сообщения ответа (бэкенд) [ЗАКРЫТА 2026-10-20]

**Вход:** HEAD dd1b1e0, `check:dotfiles` чист, `npm install` в самом клоне,
PG 16 и Redis в песочнице; браузер не нужен. Первая беседа Фазы 14; семь
долгов ревизии непереведённого 2026-10-13. Решения пользователя: описание
продукта Stripe — английское, одно на все языки; Д-58 (опись) — первым, со
счётом до/после; хранимые тексты и клиент — 14.2; переводы — черновики,
утверждает он (утвердил тем же днём); тестовые запросы — одним заходом.

**Сделано (первый запрос, 2026-10-20).** п.0 — сверка («По факту 14.1»
п.0): сверх текста — `super(…)` в `*Error` как шестой слепой вид описи,
отсутствие Checkout (серверный эквивалент — `preferred_locales`),
обработчики WebSocket вне контекста языка, клиентские регулярки
строки-места, `validationJson` вне `MSG_CALLS`, русское время ответа в
`meta-synthesis`/`plan-executor`/`prompt-registry`. Д-58 — опись видит
`details[…]`, литералы по имени (константы, переменные, параметры-стоки),
`server/` целиком, `subject`/`desc`, `push`, `super`; `i18n-check`
отделяет хранимое (`STORED_TEXT_EXCLUSIONS`); счёт 150 → 0. Д-52/Д-53 —
`tl()` в `details`, фабрики подсказок и `LAST_ADMIN`, `notFound`/`onError`,
WS под `runWithLocale`. Д-60 — `sanitizeWarnings(report)` для ответа при
русской хранимой форме, отказы `tl()`, строка-места с видимым `<h4>` и
переведённым хвостом при машинном префиксе. Д-51 — письма под языком
получателя (`MailRecipient.uiLocale`, плюрал часов, `lang`), ru побайтно.
Д-56 — легенда PNG `tl()`/`tDataLoose`, сторожа 4ay/4y — PNG явное
исключение. Д-61 — английское описание, `updateProduct` и при skip,
`preferred_locales`, пересев в deploy/*. Сторож 2av/4bg/5aq; 121 ключ;
смоук `tests/smoke-141-request1.mjs` 33 ✓. Новые строки §12 — Д-76, Д-77
(14.2).

**Тестовые запросы 2–5 (2026-10-20, одним заходом).** Переводы утверждены.
`tests/test-141-requests2-5.mjs` 45 ✓ ×2: опись на коде dd1b1e0 в
`git worktree` — 150 красных с той же раскладкой по файлам, после — 0,
временный литерал красит `--strict`; details/404/`LAST_ADMIN`/правка
подраздела под en/de (язык пользователя первым); письмо сброса
de-пользователя по-немецки («1 Stunde» — TTL 1 час, не 2, как думал текст
запроса), ru побайтно против dd1b1e0; PNG под en/ru, сид на моке
обновляет описание, `preferred_locales`. Уточнение: фразы
`sanitizeWarningsRu` в shared в счёт описи не входили — хранимая форма.

**Завершение (2026-10-20).** typecheck 0; свежий клон: check:integration
OK, dotfiles, i18n strict; TODO в коде беседы нет. Д-51, Д-52, Д-53, Д-56,
Д-58, Д-60, Д-61 закрыты; новые — Д-76, Д-77 (14.2). Доки —
`patch-docs-conv141.py` (части I–III), уроки — 09 §2, §4, §7. Ближайшая —
14.2.

---

### Беседа 13.2 — Утечки и лимитер запросов (бэкенд) [ЗАКРЫТА 2026-10-20 — Фаза 13 закрыта]
""",
    "L2 08 Часть II: глава 14.1",
)

# L3. 08 Часть I — хроника
patch(
    "docs/08-history.md",
    """случайных cookie); доки — patch-docs-conv132.py; ближайшая — 14.1.
""",
    """случайных cookie); доки — patch-docs-conv132.py; ближайшая — 14.1.
Беседа 14.1 (опись и сообщения ответа; бэкенд) ЗАКРЫТА 2026-10-20. Д-58:
опись i18n видит details[…], литералы по имени, `server/` целиком,
`subject`/`desc`, `push`, `super`; хранимое отделено (14.2); 150 → 0.
Д-52/Д-53: `tl()` в `details`, фабрики подсказок, `notFound`/`onError`,
WS под языком пользователя. Д-60: предупреждения чистки и отказы правки
подраздела `tl()`, строка-места с видимым заголовком. Д-51: письма под
языком получателя. Д-56: PNG — единственная выгрузка на языке запроса.
Д-61: английское описание продукта Stripe, `updateProduct`,
`preferred_locales`. Сторож 2av/4bg/5aq, 121 ключ (en/de утверждены),
смоук 141 33 ✓, test-141 45 ✓; новые Д-76, Д-77 → 14.2; доки —
patch-docs-conv141.py; ближайшая — 14.2.
""",
    "L3 08 Часть I: хроника 14.1",
)

# M. README — Фаза 14: 14.1 закрыта
patch(
    "README.md",
    """| 14 — довершение локализации | 14.1–14.2 | заведена 2026-10-13 ревизией непереведённого (Д-51…Д-62); после Фазы 13 |""",
    """| 14 — довершение локализации | 14.1–14.2 | заведена 2026-10-13 ревизией непереведённого (Д-51…Д-62); после Фазы 13. 14.1 (опись i18n видит все виды серверных сообщений, `details`/подсказки/`notFound`/WS/правка подраздела на языке запроса, письма под языком получателя, PNG на языке запроса, английское описание продукта Stripe; Д-51, Д-52, Д-53, Д-56, Д-58, Д-60, Д-61) — закрыта 10-20; 14.2 — хранимые тексты и клиент (+ Д-76, Д-77) |""",
    "M  README: 14.1 закрыта",
)

# N1. 09 §2 — опись по имени, сторож против обёрнутых литералов
patch(
    "docs/09-lessons.md",
    """## 3. PostgreSQL, Drizzle, данные
""",
    """### Беседа 14.1 — опись по имени, якоря сторожей после обёртки в tl()
1. **Опись сообщений обязана идти ПО ИМЕНИ, а не только по месту
   литерала**: текст, собранный в константу/переменную/параметр и отданный
   свойством (`subject`, `hint: HINT`, `fail({ x: HINT })`), виден только
   разрешением имён на глубину (`literalsByName`, параметры-стоки по
   вызовам внутри файла). Без этого «ноль красных» ничего не значит —
   Д-51…Д-54 прошли `--strict` зелёными три беседы подряд.
2. **Хранимое и ответное — один отчёт, две сборки**: функция чистки отдаёт
   `report`, фразы для ответа собирает `tl()` под языком запроса, для
   генлога — прежняя русская сборка. В описи хранимые тексты отделяются
   списком с номером долга (`STORED_TEXT_EXCLUSIONS`), а не `skip` файла,
   иначе красное и «потом» неразличимы.
3. **Обёртка литерала в `tl()` рвёт якоря старых сторожей** (4an искал
   `= "обязательное поле"`, 4ao — `details.isPublic = "снят…"`, 4ar —
   `CAPSULE_LOCK_HINT`): правятся под новую форму, не снимаются; и ключ
   `tl()` не должен содержать имя снятой колонки (`syntheses.isPublic…`
   ловил 4ao по подстроке — переименован в `publicFlagRemoved`).
4. **`\\b` в JS-регулярке не знает кириллицы**: `/1 час\\b/` ложно красен
   (`с` и пробел оба «не-слово»); граница — явным символом (`/1 час и/`).

## 3. PostgreSQL, Drizzle, данные
""",
    "N1 09 §2: опись по имени (14.1)",
)

# N2. 09 §4 — песочница и демоны, опись «до» через worktree
patch(
    "docs/09-lessons.md",
    """## 5. Node, TypeScript, сборка
""",
    """### Беседа 14.1 — счёт «до» через worktree, шпион canvas, демоны песочницы
1. **Счёт описи «до правок» воспроизводим машинно**: `git worktree add
   <rev>` + копия текущих `scripts/i18n/*` + символическая ссылка на
   `node_modules` — тест сверяет число и раскладку по файлам с «По факту»,
   а не верит записи.
2. **Текст на картинке проверяется шпионом прототипа**:
   `CanvasRenderingContext2D.prototype.fillText` из `canvas` подменяется на
   время `buildPNG` — все надписи легенды в массиве, кириллица под en
   ловится без OCR; вернуть прототип в `finally`.
3. **Песочница останавливает демоны между ходами**: PostgreSQL и Redis,
   поднятые в прошлом ходе, к следующему мертвы (`ECONNREFUSED` на 5432
   без строки остановки в логе) — перед каждым прогоном `pg_ctlcluster 16
   main start` и `redis-server --daemonize yes`; харнесс с `process.exit`
   в `finally` глотает исключение — `catch` с печатью обязателен.
4. **Байт-в-байт против прежней версии — импортом из `git show`**: старый
   модуль пишется во временный `.ts` рядом и импортируется как есть;
   сравнение JSON результатов на сетке входов (часы × имена × письма).

## 5. Node, TypeScript, сборка
""",
    "N2 09 §4: worktree, шпион canvas, демоны (14.1)",
)

# N3. 09 §7 — язык получателя, события вне цепочки Hono
patch(
    "docs/09-lessons.md",
    """## 8. Прочее
""",
    """### Беседа 14.1 — язык получателя и обработчики вне цепочки Hono
1. **Письмо собирается под языком ПОЛУЧАТЕЛЯ, не запроса**: админ или
   форма сброса на одном языке, адресат — на другом; `runWithLocale`
   вокруг сборки в точке постановки, тело в очереди уже собрано — работник
   почты языка не знает. Регистрация — единственный случай «языка запроса»:
   у нового пользователя выбора ещё нет.
2. **Всё, что живёт вне цепочки compose Hono, контекста языка не имеет**:
   `onMessage`/`onOpen` WebSocket — события сокета, их `tl()` отвечали
   по-русски всем с 11.2; `notFound`/`onError` — напротив, внутри цепочки
   (под `requestLocale`). Новый обработчик вне роутов — явный
   `runWithLocale(user.uiLocale, …)`, и проба живьём, не рассуждение.
3. **Константа модуля с текстом — всегда фабрика**: `tl()` в
   инициализаторе вычислится при импорте по-русски и останется таким
   навсегда; `switch` по ключу вместо `Record`.
4. **Выгрузка-картинка — исключение из правила зеркал ЯВНО**: сторож
   требует `tData` в PNG и запрещает его в HTML/MD/MMD/JSON; «исключение по
   недосмотру» однажды уже дало половинчатый перевод (Д-56).

## 8. Прочее
""",
    "N3 09 §7: язык получателя, WS (14.1)",
)

# O. NEXT-CONTEXT — состояние и комплект ближайшей беседы 14.2
patch(
    "NEXT-CONTEXT.md",
    """## Состояние на 2026-10-20 (ФАЗА 13 ЗАКРЫТА 2026-10-20: 13.1 и 13.2; ближайшая — 14.1; Фаза 15 ждёт)
""",
    """## Состояние на 2026-10-20 (Фаза 14: 14.1 ЗАКРЫТА 2026-10-20, ближайшая — 14.2; Фаза 13 закрыта; Фаза 15 ждёт)

**14.1 (опись и сообщения ответа; бэкенд) ЗАКРЫТА 2026-10-20.** Закрыты
Д-51, Д-52, Д-53, Д-56, Д-58, Д-60, Д-61; новые — Д-76 (плашка строки-места
на клиенте), Д-77 (`locale` Stripe Elements) — обе 14.2; реестр §12 —
Д-54, Д-55, Д-57, Д-59, Д-62, Д-76, Д-77 (14.2) и Д-68…Д-75 (Фаза 15).
Опись (`ui-strings-lib.mjs`, msg): `server/` целиком (группа
`server-messages`), `details[…]`, литералы по имени (`literalsByName`),
`subject`/`desc`, `push`, `super(…)`; `i18n-check` печатает «хранимые
тексты сервера» по `STORED_TEXT_EXCLUSIONS` (Д-54/Д-55/Д-62) не красным;
`I18N_CHECK_FULL=1` — полный список. Всё, что сервер собирает в момент
ответа, — `tl()` на языке запроса (details, подсказки заслона,
`LAST_ADMIN`, `notFound`/`onError`, WS под `runWithLocale(user.uiLocale)`,
предупреждения чистки и отказы правки подраздела — `sanitizeWarnings(report)`
при русской хранимой `sanitizeWarningsRu(report)` в генлоге); письма — под
языком получателя (`MailRecipient.uiLocale`); PNG — единственная выгрузка
на языке запроса (4ay/4y); Stripe — английское описание,
`updateProduct` при skip, `preferred_locales`. **На стенде после выкатки:**
`npm run stripe:create-prices` ещё раз (приводит описание продуктов, цены
не трогает). Миграций нет. Тесты: smoke-141 33 ✓, test-141 45 ✓ ×2;
сторож 2av/4bg/5aq; 121 ключ, en/de утверждены. Доки —
`patch-docs-conv141.py` (части I–III).
""",
    "O1 NEXT-CONTEXT: состояние — 14.1 закрыта",
)
patch(
    "NEXT-CONTEXT.md",
    """13.1 — 2at/4be/5ao; 13.2 — 2au/4bf/5ap; следующая серия — 2av/4bg/5aq). Секции 5xx с живой БД —""",
    """13.1 — 2at/4be/5ao; 13.2 — 2au/4bf/5ap; 14.1 — 2av/4bg/5aq; следующая серия — 2aw/4bh/5ar). Секции 5xx с живой БД —""",
    "O2 NEXT-CONTEXT: серия сторожа 14.1",
)

# O3. Комплект ближайшей беседы — 14.2 вместо 14.1
_nc = ROOT / "NEXT-CONTEXT.md"
_t = _nc.read_text(encoding="utf-8")
_start = _t.find("## Ближайшая беседа — 14.1 (опись и сообщения ответа; бэкенд)")
_end = _t.find("## Что 13.2 оставила знать всем беседам")
NEW142 = """## Ближайшая беседа — 14.2 (хранимые тексты и их показ; бэкенд + клиент)

Вторая и последняя беседа Фазы 14: долги §12 с адресатом 14.2 — Д-54
(причина паузы), Д-55 (parseWarnings), Д-57 (родословная файла), Д-59
(видимые заголовки подразделов), Д-62 (журнал генерации) и из 14.1 —
Д-76 (плашка строки-места: клиент режет хвост по `—` либо по переводу
`server.utils.htmlParser.placeholderTail`), Д-77 (`locale` Stripe
Elements из хранилища языка 11.3). Правило — 09 §7 (12.3): хранится КОД с
параметрами, фраза собирается при чтении на языке читателя; образцы —
`recommendation-issues.ts` (`renderIssue`) и 14.1 (`sanitizeWarnings` /
`sanitizeWarningsRu` по одному `report`). Сервер заводит поля, клиент их
рисует в той же беседе. Комплект — по шапке 14.2 в 07: §12 строки 14.2;
врезка «Фаза 14»; «По факту» 1.4b, 2.2, 2.4, 8.5, 8.6, 11.1, 11.3, 12.3,
12.4, 14.1; `02` (`paused_state`, `generation_log`, `file_genealogy`),
`03` (§2.1 язык ответов — абзац 14.1; §2.3 DTO разделов, §3.2
`generation_paused`), `04`, `05`; код по списку в тексте 14.2;
`server/integration-check.mts` — 4aw/4ay и серия 14.1 (4bg — проба
описи, 5aq — живые пробы языка); `scripts/i18n/README.md` («Какие строки
сервера видит опись», `STORED_TEXT_EXCLUSIONS` — после 14.2 записи
Д-54/Д-55/Д-62 из него уходят, и опись обязана остаться зелёной).
Браузер — Chrome 131 из `chrome/` (клиентская часть), харнесс-образец —
`tests/test-124-requests2-8.mjs`. Исходник не нужен; дизайн-набор — только
при новых элементах показа. Миграций — вероятно, нет (следующая — 0014).
Новые ключи — черновики `i18n:import --draft`, утверждает владелец.

## Что 14.1 оставила знать всем беседам

- **Опись i18n видит сообщение по имени**: константа, переменная или
  параметр с русским текстом, уходящий в `Error`/ответ/`details`/`push`,
  — красный `i18n:check --strict`; белый список — только `names.json`
  `id: null` (с доводом в «По факту») и `STORED_TEXT_EXCLUSIONS` (с
  номером долга). Новый хранимый текст — запись в список с номером, а
  не `skip` файла.
- **Всё, что сервер собирает в момент ответа, — на языке запроса**:
  `details`, подсказки, тексты обработчиков верхнего уровня; константа
  модуля с текстом — фабрика. Обработчик вне цепочки Hono (WS, задачи)
  ставит язык сам: `runWithLocale(user.uiLocale, …)`.
- **Письмо — на языке ПОЛУЧАТЕЛЯ** (`MailRecipient.uiLocale`), собирается
  при постановке в `mail_outbox`; новое письмо службы идёт через
  `queueTokenMail`-образец, не через `tl()` в работнике.
- **PNG — единственная выгрузка на языке запроса**; HTML/MD/MMD/JSON —
  русские зеркала (4ay красит `tData` в них, 4y — кириллицу в PNG).
- **Хранимое и ответное — один отчёт, две сборки** (`sanitizeWarnings` /
  `sanitizeWarningsRu`); генлог по-прежнему русский до 14.2.

"""
if _start >= 0 and _end > _start and "## Ближайшая беседа — 14.2 (хранимые тексты и их показ; бэкенд + клиент)" not in _t:
    _nc.write_text(_t[:_start] + NEW142 + _t[_end:], encoding="utf-8")
    applied += 1
    print("  ok    O3 NEXT-CONTEXT: комплект 14.2")
else:
    skipped += 1
    print("  skip  O3 NEXT-CONTEXT: комплект 14.2")

# P. 05 — счётчик патчей давно не ведётся (дыра, найдена при завершении)
patch(
    "docs/05-file-structure.md",
    """│   ├── patches/                        # 51 идемпотентный патч доков по итогам бесед""",
    """│   ├── patches/                        # идемпотентные патчи доков по итогам бесед (по одному
│   │                                   # на беседу, patch-docs-conv<NNN>.py; последний — conv141)""",
    "P  05: patches/ без устаревшего счётчика",
)

print(f"\nприменено {applied}, пропущено {skipped}, ошибок {failed}")
sys.exit(1 if failed else 0)
