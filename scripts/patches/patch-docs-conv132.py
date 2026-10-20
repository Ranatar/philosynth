#!/usr/bin/env python3
"""Патч документации по беседе 13.2 (утечки и лимитер запросов: Д-65, Д-66,
Д-67; только сервер и deploy/*).
ЧАСТЬ I — ПЕРВЫЙ ЗАПРОС (2026-10-20):
  A  07 — блок «По факту 13.2 (первый запрос)» после текста беседы: сверка
     текста с кодом (п.0), найденный сверх текста второй путь утечки Д-65
     (params встроенного состояния), недостижимость цикла при импорте,
     выбор «лимитер после optionalAuth» с доводом, HOST, отчёт без снятия.
  B  03 §2.2 — GET /:id: pausedState/pauseEstimates только владельцу;
     импорт — ветка UUID по правилу metaParentAllowed и isDescendantOf;
     §2.11 — выгрузка невладельца без pausedState и содержимого родителей;
     §3.4 — лимитер по проверенной сессии, TRUST_PROXY.
  C  01 §6 — авторизация ресурсов: пауза только владельцу; одно правило
     родителя мета-синтеза; лимитер и адрес клиента (TRUST_PROXY, HOST).
  D  02 — paused_state: отдаётся только владельцу; synthesis_lineage:
     ветка UUID импорта по правилу 13.2, отчёт о записанном.
  E  04 — строки: metaParentAllowed, client-address, clientIdentity,
     stripParentContent, resolveSession, отчёт о связях.
  F  05 — дерево: utils/client-address.ts, maintenance/lineage-parent-
     access-report.ts, пометки env.ts/index.ts/.env.example/check-dotfiles.
  G  NEXT-CONTEXT — первый запрос 13.2 исполнен, что осталось.
  Часть II (H–J) — тестовые запросы 2–4: 07 «По факту», 05, NEXT-CONTEXT.
  Часть III (K–O) — завершение: 07 §12 строки Д-65…Д-67 сняты → 08 Часть IV;
     08 Части I/II; README (Фаза 13 закрыта); 09 §2/§4/§7 + снят дубль урока
     13.1 в §6; NEXT-CONTEXT переписан (ближайшая — 14.1).
Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ; блоки «По факту» —
по marker, 09 §2 12.3). Запуск из корня:
    python3 scripts/patches/patch-docs-conv132.py
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


# ── A. 07 «По факту 13.2 (первый запрос)» ────────────────────────────────
PF132 = """
**По факту 13.2 (первый запрос — 2026-10-20).** Вход: HEAD d90441c,
`check:dotfiles` чист, `npm install` в самом клоне, PG 16 и Redis в
песочнице. Порядок — п.0 сверка, затем Д-65 → Д-66 → Д-67 → сторож.

0. **Сверка текста с кодом** (grep по каждой названной функции, до правок).
   Совпало: `projectSynthesis` обнуляла паузу только при `scope='showcase'`
   и чужому зарегистрированному на `'full'` отдавала её целиком (шапка
   функции утверждала обратное); `html-exporter` писал `pausedState:
   row.pausedState` в `philosynth-state` для любого выгружающего; ветка UUID
   импорта проверяла только существование строки; `clientIdentity` строил
   ключ `s:` из SHA-256 ЛЮБОЙ cookie (лимитер стоял до аутентификации, ветка
   `u:` мертва); `x-forwarded-for` читался без условия и в лимитере, и в
   `clientIpOf` журнала admin_audit. Расхождения с текстом беседы:
   (а) **второй путь утечки Д-65, не названный текстом**: встроенное
   состояние выгрузки несёт `params` из `buildParams`, а те — `participants`
   и `conceptParticipants` с ПОЛНЫМ содержимым родительских концепций
   (`ConceptParticipantFull`: capsule, goals, portraits, tensions, graph*,
   dialogue*, glossaryCompact, thesesSummary); в файле одностраничника `params`
   участников не несёт вовсе, а импорт 4.3 читает из `params` лишь
   `participants[].type/name`, `phil`, `seed`, `secCtx` — закрыто вместе с
   паузой (п.1); (б) **проверка цикла при импорте структурно недостижима**:
   строка `syntheses` только что создана, потомков у неё нет, и
   `isDescendantOf(новый, родитель)` всегда ложна — заслон оставлен как у
   `POST /lineage/link` (цена — один CTE на UUID-родителя), тестовый запрос
   R3 «своего потомка (цикл)» в этом месте проверяет лишь, что заслон зовётся,
   а связь пишется; (в) **`clientIpOf` журнала admin_audit (8.1)** читал
   `x-forwarded-for` тем же способом — текст беседы называл только лимитер;
   закрыто тем же правилом: единственный читатель заголовков прокси —
   `server/utils/client-address.ts`; (г) **`deploy/philosynth-hosting.md`
   §10** утверждал «Почты нет вовсе» — устарело с 9.1, поправлено попутно;
   (д) клиент сверен без правок: `GenerationProgress` (бейдж паузы) и
   `PauseModal` стоят под `isOwner`, WS-пауза идёт по userId владельца —
   невладельцу `pausedState` не нужен нигде.
1. **Д-65.** `projectSynthesis`: `pausedState`/`pauseEstimates` → `null`
   каждому невладельцу сразу после ветки владельца (витрина, `'full'`,
   гость — одинаково); `buildSynthesisFull` читает паузу и считает оценки
   (`computePauseEstimates` собирает промпты из содержимого родителей) только
   владельцу; шапка файла и комментарий функции приведены к коду. Выгрузка:
   `exportHTML(id, { includeLogs, ownerView })` — `routes/export.ts` передаёт
   `ownerView = viewer === 'owner'`; невладельцу `pausedState: null` и
   `params` через `stripParentContent` (у участников-концепций остаётся
   идентичность — type/synthesisId/name/method/synthLevel/seed, как в
   `participants`); выгрузка владельца — байт в байт как прежде (умолчание
   опции). 03 §2.2/§2.11 — строки о полях по ступеням.
2. **Д-66.** Правило родителя мета-синтеза вынесено в shared —
   `metaParentAllowed(row, viewerUserId)` (`shared/utils/visibility.ts`:
   своя — всегда; чужая — только при действенном `allow_meta`; витрина и
   приватная — никогда; гостю — только чужая full+allow_meta); `metaAllowedFor`
   routes/syntheses делегирует ему (4ao «роуты читают сырые флаги» цел). Ветка
   UUID импорта: строка найдена → `metaParentAllowed(parent, userId) &&
   !isDescendantOf(synthesisId, sid)` → связь; иначе та же дорога, что у
   родителя без UUID (кандидат по имени среди своих, связь не пишется) с
   предупреждением `server.importService.parentNotAllowed` — одной фразой на
   все причины (приватная, витрина, allow_meta снят, цикл): различать их
   значило бы выдавать состояние чужой концепции по идентификатору из файла;
   название чужой приватной в предупреждение не попадает (имя — из файла).
   Позиции связей по-прежнему идут общим счётом participants файла. Отчёт
   `scripts/maintenance/lineage-parent-access-report.ts` (`npm run
   report:lineage-parents [-- --json]`): все связи с живым чужим родителем
   против того же правила (смотрящий — владелец ребёнка), строка — ребёнок,
   родитель, владельцы, visibility, allow_meta, причина; **снимать строки
   скрипт не умеет вовсе** (`--dry` принимается ради единства с
   `sanitize:stored-html`, иной ключ — отказ): решение по отчёту — за
   пользователем, снятие родителя — 15.1 (Д-69, `LINEAGE_GENERATED`).
3. **Д-67.** Выбор — **лимитер после optionalAuth**, не проверка сессии
   внутри: глобальный `optionalAuth` на `/api/v1/*` ставится в index.ts между
   `requestLocale` и `rateLimiter()`, а роутовые `requireAuth`/`optionalAuth`
   через общий `resolveSession` переиспользуют уже проверенную сессию
   (`c.get("user") !== undefined`) — один запрос к БД на запрос с cookie, как
   и до 13.2 (роут проверял её сам); проверка внутри лимитера стоила бы
   второго запроса на каждый аутентифицированный вызов. Роутеры, смонтированные
   без глобального прохода (сторожа и тесты на `app.request`), проверяют
   сессию сами, как прежде. `clientIdentity` экспортирован: `u:{userId}`
   проверенной сессии (все сессии пользователя делят квоту — снята половина
   Огр-10), иначе `ip:{адрес}`; cookie в лимитере не читается вовсе.
   `server/utils/client-address.ts` — `clientAddressOf(c)`: `X-Forwarded-For`
   (первый) → `X-Real-IP` только при `env.trustProxy`, иначе адрес соединения;
   `TRUST_PROXY` (умолчание false) и `HOST` (адрес прослушивания; пусто —
   все интерфейсы, как прежде) в `env.ts`, `.env.example`, `env.local.example`
   (false — стенд без прокси), `check-dotfiles`; `deploy/philosynth-hosting.md`
   — `HOST=127.0.0.1` + `TRUST_PROXY=true` за Caddy (`reverse_proxy
   127.0.0.1:3000`) с абзацем, почему одно без другого небезопасно; при
   `TRUST_PROXY=true` без петли сервер предупреждает при старте; установщики
   ubuntu/termux дописывают `TRUST_PROXY=false`/`HOST=` в `.env`, созданный до
   13.2. `mailLimiter` — тот же `rateLimiter`, стоит после глобального
   `optionalAuth` — правило то же.
4. **Сторож** `integration-check` 2au/4bf/5ap: экспорты и таблица истинности
   `metaParentAllowed`; текстом — обнуление паузы каждому невладельцу,
   `ownerView` в экспорте и `stripParentContent`, правило и цикл в ветке UUID,
   `clientIdentity` без cookie/заголовков, заголовки прокси только в
   client-address под `env.trustProxy` и ни в одном роуте/middleware, порядок
   middleware index.ts, `resolveSession` в обоих middleware, dotfile и
   установщики, отчёт без записи в БД, строки 03; живьём (5ap, до `closeDb`):
   пауза и `params` выгрузки владельцу/невладельцу на концепции с приватным
   родителем, импорт файла с пятью UUID (чужая приватная, витрина, full без
   allow_meta, full с allow_meta, своя) — связаны две, три отклонены с
   предупреждением и кандидатами, название чужой приватной не раскрыто,
   позиции по индексам файла; отчёт находит строку до 13.2 и ничего не
   меняет; ключ лимитера одинаков у разных непроверенных cookie, `u:` у
   проверенной сессии, `X-Forwarded-For` влияет только под `TRUST_PROXY`.
   Один новый ключ `tl()` с черновиками en/de (`i18n:import --draft`),
   `i18n:check --strict` зелёный; `typecheck` 0.
"""

patch(
    "docs/07-conversation-protocol.md",
    """- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10); Фаза 13 закрыта (если 13.1 закрыта), строка в README

---

### Фаза 14 (добавлена 2026-10-13): довершение локализации""",
    """- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10); Фаза 13 закрыта (если 13.1 закрыта), строка в README
"""
    + PF132
    + """
---

### Фаза 14 (добавлена 2026-10-13): довершение локализации""",
    "A  07: «По факту 13.2 (первый запрос)»",
    marker="**По факту 13.2 (первый запрос — 2026-10-20).**",
)

# ── B. 03 ────────────────────────────────────────────────────────────────
patch(
    "docs/03-specification.md",
    """                                //   guest: без totalCostUsd/totalInputTokens/
                                //   totalOutputTokens и без pausedState/
                                //   pauseEstimates; при scope='full' документ
                                //   ОДНИМ ответом — sections: SectionFull[]
                                //   (гостю /sections недоступен);
                                //   user: стоимость и токены видны всегда;
                                //   scope='showcase' (любой невладелец):
                                //   sections не отдаются, pausedState/
                                //   pauseEstimates → null; capsuleHtml,
                                //   метаданные, философы, даты — отдаются;""",
    """                                //   13.2 (Д-65): pausedState/pauseEstimates — ТОЛЬКО владельцу
                                //   на ЛЮБОЙ ступени; каждому невладельцу (user,
                                //   guest; 'full' и витрина) оба поля null —
                                //   genParams паузы несут зерно, secCtx и
                                //   содержимое РОДИТЕЛЬСКИХ концепций (в том
                                //   числе приватных родителей владельца);
                                //   оценки паузы невладельцу не считаются;
                                //   guest: без totalCostUsd/totalInputTokens/
                                //   totalOutputTokens; при scope='full' документ
                                //   ОДНИМ ответом — sections: SectionFull[]
                                //   (гостю /sections недоступен);
                                //   user: стоимость и токены видны всегда;
                                //   scope='showcase' (любой невладелец):
                                //   sections не отдаются; capsuleHtml,
                                //   метаданные, философы, даты — отдаются;""",
    "B1 03 §2.2: GET /:id — пауза только владельцу",
)

patch(
    "docs/03-specification.md",
    """                                // интерфейса привязки после импорта нет). Файлы
                                // экспорта 4.2 (с UUID) связываются прежней
                                // веткой, lineageCandidates для них пуст.""",
    """                                // интерфейса привязки после импорта нет). Файлы
                                // экспорта 4.2 (с UUID) связываются веткой UUID.
                                // 13.2 (Д-66): ветка UUID идёт ПО ПРАВИЛУ
                                // POST /syntheses — metaParentAllowed
                                // (shared/utils/visibility: своя концепция —
                                // всегда; чужая — только при действенном
                                // allow_meta; витрина и приватная — никогда)
                                // плюс заслон цикла isDescendantOf (у новой
                                // строки потомков нет — заслон структурный, как
                                // у /lineage/link). Не прошла — та же дорога,
                                // что у родителя без UUID: кандидат по имени
                                // среди своих, связь не пишется, предупреждение
                                // lineage одной фразой на все причины (состояние
                                // чужой концепции по идентификатору из файла не
                                // раскрывается). До 13.2 проверялось лишь
                                // существование строки. Записанное до 13.2 —
                                // отчётом npm run report:lineage-parents
                                // (строки не снимаются — решение пользователя).""",
    "B2 03 §2.2: импорт — ветка UUID по правилу",
)

patch(
    "docs/03-specification.md",
    """> генерации» нет), итоговая стоимость остаётся в ФУТЕРЕ документа — она не
> под флагом (`exportHTML(id, { includeLogs })`).
>""",
    """> генерации» нет), итоговая стоимость остаётся в ФУТЕРЕ документа — она не
> под флагом (`exportHTML(id, { includeLogs })`).
>
> **13.2 (Д-65):** выгрузка НЕвладельца — `exportHTML(id, { includeLogs,
> ownerView: false })`: во встроенном состоянии `pausedState: null` и `params`
> без содержимого родительских концепций (`stripParentContent`: у
> участников-концепций остаётся идентичность — type/synthesisId/name/method/
> synthLevel/seed, как в `participants`); импорт 4.3 читает из `params` лишь
> type/name участников, `phil`, `seed`, `secCtx` — файл невладельца
> импортируется как прежде. Выгрузка владельца не меняется.
>""",
    "B3 03 §2.11: выгрузка невладельца",
)

patch(
    "docs/03-specification.md",
    """> Примечание (наблюдение беседы 1.6): HTTP-лимитер middleware (0.2)
> фактически ключуется по IP и для аутентифицированных запросов —
> requireAuth срабатывает в роутах ПОСЛЕ него, поэтому identity на
> момент подсчёта всегда IP. «Per-user» HTTP-лимитирование потребует
> переноса подсчёта после auth — долг внесён в реестр 07 §12,
> адресат 6.1 (вместе с billing-service).""",
    """> Примечание (наблюдение беседы 1.6): HTTP-лимитер middleware (0.2)
> фактически ключуется по IP и для аутентифицированных запросов —
> requireAuth срабатывает в роутах ПОСЛЕ него, поэтому identity на
> момент подсчёта всегда IP. «Per-user» HTTP-лимитирование потребует
> переноса подсчёта после auth — долг внесён в реестр 07 §12,
> адресат 6.1 (вместе с billing-service).
>
> **13.2 (Д-67).** Решение 6.1 (ключ — SHA-256 cookie сессии ДО проверки)
> обходилось случайной cookie на каждый запрос. С 13.2 сессия проверяется
> ОДИН раз глобальным `optionalAuth` на `/api/v1/*` ДО лимитера (роутовые
> `requireAuth`/`optionalAuth` результат переиспользуют — `resolveSession`),
> и ключ — `u:{userId}` ПРОВЕРЕННОЙ сессии (все сессии одного пользователя
> делят квоту; снята половина Огр-10), иначе `ip:{адрес клиента}`;
> значение cookie без проверки квоты не даёт. Адрес клиента —
> `server/utils/client-address.ts`: `X-Forwarded-For` (первый адрес) →
> `X-Real-IP` ТОЛЬКО при `TRUST_PROXY=true` (env; умолчание false; за Caddy
> публичного размещения — true вместе с `HOST=127.0.0.1`), иначе адрес
> соединения. Тем же правилом живёт IP строки `admin_audit`. `mailLimiter`
> (9.1) — тот же механизм.""",
    "B4 03 §3.4: лимитер 13.2",
)

# ── C. 01 §6 ─────────────────────────────────────────────────────────────
patch(
    "docs/01-architecture.md",
    """- Гость (без сессии, `optionalAuth`): ровно три пути — публичный каталог,
  документ, тарифы; стоимость/токены/логи/запросы/пауза — никогда
- Зарегистрированный: стоимость и токены у любой неприватной концепции
  (флагом не управляются); логи и запросы — по флагам автора
- Мета-синтез с чужой концепцией — только при действенном `allow_meta`
  (`META_NOT_ALLOWED`); витрина в участники не годится
- Элементы синтеза наследуют доступ от синтеза; витрина невладельцу на
  контент-роутах → 403""",
    """- Гость (без сессии, `optionalAuth`): ровно три пути — публичный каталог,
  документ, тарифы; стоимость/токены/логи/запросы/пауза — никогда
- Зарегистрированный: стоимость и токены у любой неприватной концепции
  (флагом не управляются); логи и запросы — по флагам автора
- Пауза генерации (`pausedState`, `pauseEstimates`) — ТОЛЬКО владельцу, на
  любой ступени и в HTML-выгрузке тоже (беседа 13.2, Д-65): `genParams`
  паузы несут зерно, `secCtx` и содержимое родительских концепций, в том
  числе приватных родителей владельца; выгрузка невладельца идёт и без
  содержимого родителей в `params` встроенного состояния
- Мета-синтез с чужой концепцией — только при действенном `allow_meta`
  (`META_NOT_ALLOWED`); витрина в участники не годится. Правило ОДНО —
  `metaParentAllowed` (shared/utils/visibility; беседа 13.2, Д-66): им
  живут `POST /syntheses`, `/estimate` и ветка UUID импорта (до 13.2 файл с
  вписанным UUID связывал с любым чужим синтезом)
- Элементы синтеза наследуют доступ от синтеза; витрина невладельцу на
  контент-роутах → 403

**Лимит запросов и адрес клиента (беседа 13.2, Д-67).** Сессия проверяется
ОДИН раз на запрос — глобальный `optionalAuth` на `/api/v1/*` стоит до
`rateLimiter` (`server/index.ts`), роутовые `requireAuth`/`optionalAuth`
результат переиспользуют. Ключ лимитера — пользователь ПРОВЕРЕННОЙ сессии
(`u:{userId}`; все его сессии делят квоту), без неё — адрес клиента;
значение cookie без проверки квоты не даёт (до 13.2 ключом был хэш любой
cookie, и случайная cookie на запрос снимала и общий лимит, и `mailLimiter`,
и защиту входа от перебора). Адрес клиента — `server/utils/client-address.ts`,
единственный читатель `X-Forwarded-For`/`X-Real-IP`: заголовки принимаются
только при `TRUST_PROXY=true` (env, по умолчанию выключен; за Caddy
публичного размещения — включён вместе с `HOST=127.0.0.1`, чтобы порт
сервера не был доступен мимо прокси), иначе берётся адрес соединения. Тем
же правилом пишется IP в `admin_audit`.""",
    "C  01 §6: пауза владельцу, одно правило родителя, лимитер и адрес",
)

# ── D. 02 ────────────────────────────────────────────────────────────────
patch(
    "docs/02-data-model.md",
    """    -- reasonKind: 'auth'|'billing'|'pre-stream'|'max-tokens'|'partial'|'stuck'|'user-abort'
    --   |'context-error' (сбой ПОСТРОЕНИЯ контекста/промпта, outer catch
    --   _runGenPassesFromIdx [~25842]; найдено беседой 1.4 — kind'ом стрима не является)
  version_base     INT NOT NULL DEFAULT 1,""",
    """    -- reasonKind: 'auth'|'billing'|'pre-stream'|'max-tokens'|'partial'|'stuck'|'user-abort'
    --   |'context-error' (сбой ПОСТРОЕНИЯ контекста/промпта, outer catch
    --   _runGenPassesFromIdx [~25842]; найдено беседой 1.4 — kind'ом стрима не является)
    -- 13.2 (Д-65): отдаётся ТОЛЬКО владельцу (GET /:id — projectSynthesis;
    --   HTML-выгрузка — exportHTML ownerView): genParams несут зерно, secCtx и
    --   conceptParticipants — содержимое родительских концепций, в том числе
    --   приватных родителей владельца; невладельцу на любой ступени — null
  version_base     INT NOT NULL DEFAULT 1,""",
    "D1 02 §2.3: paused_state только владельцу",
)

patch(
    "docs/02-data-model.md",
    """> **Дерево файла (2026-09-21, вне бесед):** импорт файла пишет дерево""",
    """> **13.2 (Д-66):** строка `parent_type='synthesis'` при импорте по UUID из
> файла пишется ТОЛЬКО по правилу родителя мета-синтеза (`metaParentAllowed`,
> shared: своя — всегда; чужая — при действенном `allow_meta`; витрина и
> приватная — никогда) и без цикла (`isDescendantOf`); до 13.2 — при одном
> существовании строки. Записанные до 13.2 связи с чужим негодным родителем
> перечисляет `npm run report:lineage-parents` (только отчёт; снятие — решение
> пользователя, отвязка — 15.1).
>
> **Дерево файла (2026-09-21, вне бесед):** импорт файла пишет дерево""",
    "D2 02 §2.4: ветка UUID импорта по правилу",
)

# ── E. 04 ────────────────────────────────────────────────────────────────
patch(
    "docs/04-code-reuse-map.md",
    """| `client/src/utils/subsection-rich-editor.ts`, форма в `SectionView.tsx` (два вида, панель из `EDITOR_TOOLS`, поле-зеркало), `SubsectionEditState.view` |""",
    """| `metaParentAllowed` в `packages/shared/utils/visibility.ts`; `server/utils/client-address.ts` (`clientAddressOf`, `firstForwardedAddress`, `socketAddressOf`); `clientIdentity` (экспорт) в `middleware/rate-limiter.ts`; `resolveSession` в `middleware/auth.ts`; `stripParentContent` и `ExportHTMLOptions.ownerView` в `services/export/html-exporter.ts`; `env.trustProxy`/`env.host`; `scripts/maintenance/lineage-parent-access-report.ts` | НОВОЕ (13.2; Д-65, Д-66, Д-67 — прародителей нет, в одностраничнике ни пользователей, ни сервера): пауза и содержимое родителей в выгрузке — только владельцу (`projectSynthesis` обнуляет каждому невладельцу; `exportHTML(id, { ownerView })`); ОДНО правило родителя мета-синтеза для `POST /syntheses`, `/estimate` и ветки UUID импорта (та зовёт его и `isDescendantOf`); лимитер считает по пользователю проверенной сессии (глобальный `optionalAuth` до `rateLimiter`, роутовые middleware сессию переиспользуют), заголовки прокси — только под `TRUST_PROXY` и только в `client-address` (им же живёт `clientIpOf` журнала 8.1); отчёт о связях, записанных до правила (только читает) |
| `client/src/utils/subsection-rich-editor.ts`, форма в `SectionView.tsx` (два вида, панель из `EDITOR_TOOLS`, поле-зеркало), `SubsectionEditState.view` |""",
    "E  04 §4: строки 13.2",
)

# ── F. 05 ────────────────────────────────────────────────────────────────
patch(
    "docs/05-file-structure.md",
    """│   │   ├── html-parser.ts              # Обёртка над linkedom для серверного DOM-парсинга
│   │   │                               # 13.1: санитайзер на общем ядре shared; sanitizeSectionHtml
│   │   │                               # (раздел целиком) — для всех входов разметки
│   │   └── crypto.ts                   # AES-256-GCM шифрование API-ключей (СДЕЛАНО 6.1:""",
    """│   │   ├── html-parser.ts              # Обёртка над linkedom для серверного DOM-парсинга
│   │   │                               # 13.1: санитайзер на общем ядре shared; sanitizeSectionHtml
│   │   │                               # (раздел целиком) — для всех входов разметки
│   │   ├── client-address.ts           # 13.2 (Д-67): адрес клиента — ЕДИНСТВЕННЫЙ читатель
│   │   │                               # X-Forwarded-For/X-Real-IP, только под TRUST_PROXY; иначе
│   │   │                               # адрес соединения; потребители — rate-limiter, admin-audit
│   │   └── crypto.ts                   # AES-256-GCM шифрование API-ключей (СДЕЛАНО 6.1:""",
    "F1 05: utils/client-address.ts",
)

patch(
    "docs/05-file-structure.md",
    """│   ├── maintenance/                    # 13.1: одноразовые обслуживающие скрипты (tsx, живая БД)
│   │   └── sanitize-stored-html.ts     # Д-63: чистка УЖЕ сохранённой разметки (sections,
│   │                                   # capsule_html, mode_results, снимки element_versions,
│   │                                   # element_enrichments); --dry, --synthesis; идемпотентен;
│   │                                   # npm run sanitize:stored-html — шаг после обновления (deploy/*)""",
    """│   ├── maintenance/                    # 13.1: одноразовые обслуживающие скрипты (tsx, живая БД)
│   │   ├── sanitize-stored-html.ts     # Д-63: чистка УЖЕ сохранённой разметки (sections,
│   │   │                               # capsule_html, mode_results, снимки element_versions,
│   │   │                               # element_enrichments); --dry, --synthesis; идемпотентен;
│   │   │                               # npm run sanitize:stored-html — шаг после обновления (deploy/*)
│   │   └── lineage-parent-access-report.ts  # 13.2 (Д-66): ОТЧЁТ о связях synthesis_lineage, где
│   │                                   # чужой родитель сегодня не годится по правилу metaParentAllowed
│   │                                   # (записаны до 13.2 веткой UUID); только читает — снятие строк
│   │                                   # решает пользователь; npm run report:lineage-parents [-- --json]""",
    "F2 05: maintenance/lineage-parent-access-report.ts",
)

patch(
    "docs/05-file-structure.md",
    """├── .env.example                    # ВСЕ переменные server/env.ts;
│                                   # пароль БД обязан совпадать с дефолтом
│                                   # env.ts — .env читает только drizzle-kit,
│                                   # tsx-скрипты берут process.env.""",
    """├── .env.example                    # ВСЕ переменные server/env.ts;
│                                   # пароль БД обязан совпадать с дефолтом
│                                   # env.ts — .env читает только drizzle-kit,
│                                   # tsx-скрипты берут process.env.
│                                   # 13.2: + TRUST_PROXY=false (заголовки прокси — только за своим
│                                   # Caddy, hosting.md ставит true вместе с HOST=127.0.0.1) и HOST=
│                                   # (адрес прослушивания; пусто — все интерфейсы); оба — в check-dotfiles""",
    "F3 05: .env.example — TRUST_PROXY, HOST",
)

patch(
    "docs/05-file-structure.md",
    """│   ├── index.ts                        # Точка входа: Hono app + WebSocket
│   │                                   # 11.2: requestLocale ДО rate-limiter и роутов,
│   │                                   # installServerCatalogProvider()
│   │                                   # 13.1: SECURITY_HEADERS на каждый ответ""",
    """│   ├── index.ts                        # Точка входа: Hono app + WebSocket
│   │                                   # 11.2: requestLocale ДО rate-limiter и роутов,
│   │                                   # installServerCatalogProvider()
│   │                                   # 13.1: SECURITY_HEADERS на каждый ответ
│   │                                   # 13.2: optionalAuth на /api/v1/* МЕЖДУ requestLocale и
│   │                                   # rateLimiter (лимитер считает по проверенной сессии);
│   │                                   # serve на HOST; предупреждение TRUST_PROXY без петли""",
    "F4 05: index.ts — порядок middleware 13.2",
)

patch(
    "docs/05-file-structure.md",
    """│   ├── env.ts                          # Типизированные env-переменные
│   │
│   ├── db/""",
    """│   ├── env.ts                          # Типизированные env-переменные
│   │                                   # 13.2: trustProxy (TRUST_PROXY, умолчание false), host (HOST)
│   │
│   ├── db/""",
    "F5 05: env.ts — trustProxy/host",
)

patch(
    "docs/05-file-structure.md",
    """    │                                   # smoke-131-request1 — 13.1: ядро санитайзера, живые входы
""",
    """    │                                   # smoke-132-request1 — 13.2: metaParentAllowed, stripParentContent,
    │                                   # clientIdentity/resolveSession (мини-Hono); живой сервер — пауза и
    │                                   # params выгрузки владелец ≠ чужой, импорт трёх UUID (связь только
    │                                   # со своей, отчёт report:lineage-parents), лимитер: случайные cookie,
    │                                   # две сессии = одна квота, X-Forwarded-For без TRUST_PROXY, mailLimiter
    │                                   # smoke-131-request1 — 13.1: ядро санитайзера, живые входы
""",
    "F6 05: tests — smoke-132-request1",
)

patch(
    "docs/07-conversation-protocol.md",
    """   Один новый ключ `tl()` с черновиками en/de (`i18n:import --draft`),
   `i18n:check --strict` зелёный; `typecheck` 0.
""",
    """   Один новый ключ `tl()` с черновиками en/de (`i18n:import --draft`),
   `i18n:check --strict` зелёный; `typecheck` 0. Старые сторожа, которые
   13.2 перевернула, переписаны под новое правило, не ослаблены: 4ag требовал
   хэш cookie `s:` (теперь — `u:{userId}` и запрет `createHash`/`getCookie`
   в лимитере), 4ao искал подчистку мёртвого cookie в теле `optionalAuth`
   (теперь — в `resolveSession`, плюс переиспользование `already !==
   undefined`) и `exportHTML(id, { includeLogs })` (теперь с `ownerView`);
   4bf сверяет порядок middleware по сырому index.ts — `strip()` принимает
   `/*` в `"/api/v1/*"` за начало комментария. Смоук
   `tests/smoke-132-request1.mjs` (42 проверки: чистые функции, мини-Hono,
   живой сервер :3132 с `RATE_LIMIT_HTTP_PER_MINUTE=6`) зелёный;
   `check:integration` зелёный.
""",
    "A2 07: По факту — сторожа 4ag/4ao/4bf и смоук",
)

# ── Часть II: тестовые запросы 2–4 (2026-10-20) ─────────────────────────
patch(
    "docs/07-conversation-protocol.md",
    """   живой сервер :3132 с `RATE_LIMIT_HTTP_PER_MINUTE=6`) зелёный;
   `check:integration` зелёный.
""",
    """   живой сервер :3132 с `RATE_LIMIT_HTTP_PER_MINUTE=6`) зелёный;
   `check:integration` зелёный.

**По факту 13.2 (тестовые запросы 2–4 — 2026-10-20, одним заходом по
слову пользователя).** Черновики en/de ключа `parentNotAllowed`
утверждены пользователем (`i18n:import` без `--draft`, черновиков 0).
Харнесс `tests/test-132-requests2-4.mjs` — 38 ✓ ×2: мок Claude отвечает
HTTP 500 → `pre-stream` → ретрай → `status='paused'`, и `paused_state.genParams`
несёт капсулу приватного родителя — ровно то, что до 13.2 уходило чужому.
R2: при `visibility='full'` чужому зарегистрированному `pausedState` и
`pauseEstimates` null (стоимость видна), владельцу — kind='gen' с оценками,
гостю — null без стоимости; выгрузка чужого — без `pausedState` и без
содержимого родителя в `params`, выгрузка владельца — с тем и другим; чтение
паузу не трогает. R3: файл с шестью UUID (чужая приватная, чужая full без
allow_meta, чужая витрина, чужая full+allow_meta, своя, свой потомок) →
связи ровно три (full+allow_meta, своя, потомок — заслон цикла зовётся,
связь пишется, см. «По факту» п.0б), позиции по индексам файла, три
предупреждения с именами ИЗ ФАЙЛА, кандидаты по имени, названия чужих из
БД не раскрыты; отчёт на КОПИИ БД (`pg_dump` → `philosynth_copy_132`) с двумя
«старыми» строками находит обе с причиной и не меняет ни копию, ни рабочую
базу, `--unlink`/`--fix` — отказ. R4: 100 запросов с разной случайной cookie и
случайным `X-Forwarded-For` без `TRUST_PROXY` → 429 после лимита (ключ один —
адрес); две сессии одного пользователя делят квоту `u:` (51-й — 429), квоту
адреса не трогая; форма сброса пароля со случайными cookie упирается в
`mailLimiter` (третий — 429 с часовым `retryAfter`, общий лимит при этом
свеж); с `TRUST_PROXY=true` разные `X-Forwarded-For` — разные квоты, тот же
первый адрес списка — общая, `X-Real-IP` — запасной; `HOST=127.0.0.1` —
без предупреждения, `TRUST_PROXY=true` без `HOST` — предупреждение при
старте. Расхождений с текстом запросов нет; дыр документации сверх
«По факту» п.0 не найдено.
""",
    "H 07: По факту — тестовые запросы 2–4",
)
patch(
    "docs/05-file-structure.md",
    """    │                                   # smoke-132-request1 — 13.2: metaParentAllowed, stripParentContent,
""",
    """    │                                   # test-132-requests2-4 — 13.2: R2 пауза на моке (HTTP 500) у
    │                                   # концепции с приватным родителем — GET/выгрузка владелец ≠ чужой ≠
    │                                   # гость; R3 файл с шестью UUID → три связи, три кандидата, отчёт на
    │                                   # копии БД (pg_dump) со «старыми» строками; R4 100 случайных cookie,
    │                                   # две сессии = одна квота, mailLimiter, X-Forwarded-For без/с TRUST_PROXY
    │                                   # smoke-132-request1 — 13.2: metaParentAllowed, stripParentContent,
""",
    "I 05: tests — test-132-requests2-4",
)
# ── G. NEXT-CONTEXT ──────────────────────────────────────────────────────
patch(
    "NEXT-CONTEXT.md",
    """## Ближайшая беседа — 13.2 (утечки и лимитер запросов; бэкенд)
""",
    """## Ближайшая беседа — 13.2 (утечки и лимитер запросов; бэкенд)

**Первый запрос 13.2 ИСПОЛНЕН 2026-10-20** («По факту 13.2 (первый запрос)»
в 07): пауза и содержимое родителей в выгрузке — только владельцу
(`projectSynthesis`, `exportHTML(id, { ownerView })`, `stripParentContent`);
правило родителя мета-синтеза одно — `metaParentAllowed` (shared), ветка
UUID импорта зовёт его и `isDescendantOf`, отклонённый — кандидатом с
предупреждением `parentNotAllowed`; отчёт `npm run report:lineage-parents`
(только читает); лимитер по проверенной сессии — глобальный `optionalAuth`
до `rateLimiter`, `resolveSession` в middleware/auth, `clientIdentity`
экспортирован; `server/utils/client-address.ts` — единственный читатель
заголовков прокси (`TRUST_PROXY`), `HOST` в `serve`; `.env.example`,
`env.local.example`, `check-dotfiles`, `deploy/*` обновлены; сторож
2au/4bf/5ap; один ключ `tl()` с черновиками en/de. Осталось: тестовые
запросы 2–4 (по одному) и завершение. Миграций нет.
""",
    "G  NEXT-CONTEXT: первый запрос 13.2 исполнен",
    # часть III (O3) заменяет этот блок комплектом 14.1 — на повторном прогоне маркер держит skip
    marker="**13.2 (утечки и лимитер запросов; бэкенд) ЗАКРЫТА 2026-10-20",
)


patch(
    "NEXT-CONTEXT.md",
    """2au/4bf/5ap; один ключ `tl()` с черновиками en/de. Осталось: тестовые
запросы 2–4 (по одному) и завершение. Миграций нет.
""",
    """2au/4bf/5ap; один ключ `tl()`, en/de УТВЕРЖДЕНЫ 2026-10-20 (черновиков
нет). **Тестовые запросы 2–4 ИСПОЛНЕНЫ 2026-10-20** одним заходом
(`tests/test-132-requests2-4.mjs`, 38 ✓ ×2: пауза на моке, импорт шести
UUID, отчёт на копии БД, лимитер без/с TRUST_PROXY). Осталось: завершение
(typecheck, check:integration на свежем клоне, ревью TODO, 08 Часть IV,
README, 09, Фаза 13 закрыта). Миграций нет.
""",
    "J  NEXT-CONTEXT: тестовые запросы исполнены",
    marker="**13.2 (утечки и лимитер запросов; бэкенд) ЗАКРЫТА 2026-10-20",
)

# ══ Часть III: завершение беседы 13.2 (2026-10-20) ═══════════════════════
import re as _re


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
for n in ("65", "66", "67"):
    drop_row("docs/07-conversation-protocol.md", f"| Д-{n} | дефект |", f"K  07 §12: строка Д-{n} снята")

# L1. 08 Часть IV — три строки с датой и итогом
patch(
    "docs/08-history.md",
    """4bc-о перевёрнут; test-125 R4, test-124 120 ✓ |
""",
    """4bc-о перевёрнут; test-125 R4, test-124 120 ✓ |
| Д-65 — `pausedState` уходит чужому: `projectSynthesis` на ступени `'full'` отдавал зарегистрированному невладельцу паузу целиком (genParams с зерном, secCtx и содержимым РОДИТЕЛЬСКИХ концепций), `html-exporter` вшивал `pausedState` в `philosynth-state` любому выгружающему; был Огр-4 | 13.2 | ревизия ограничений 2026-10-14 (код) | ЗАКРЫТ 13.2 (2026-10-20): пауза и `pauseEstimates` — только владельцу на любой ступени (`projectSynthesis`, `buildSynthesisFull` считает оценки только ему); выгрузка `exportHTML(id, { ownerView })` — невладельцу без `pausedState` и без содержимого родителей в `params` (`stripParentContent`, второй путь утечки сверх текста); сторож 2au/4bf/5ap, smoke-132, test-132 R2 (пауза на моке с приватным родителем) |
| Д-66 — импорт связывал с любым синтезом по UUID из файла в обход правила `allow_meta` и заслонов `/lineage/link` | 13.2 | ревизия ограничений 2026-10-14 (код) | ЗАКРЫТ 13.2 (2026-10-20): одно правило `metaParentAllowed` в shared (своя — всегда; чужая — только при действенном allow_meta; витрина и приватная — никогда) для `POST /syntheses` и ветки UUID импорта + `isDescendantOf`; отклонённый — кандидатом по имени с предупреждением `parentNotAllowed` (tl, en/de утверждены), название чужой из БД не раскрывается; отчёт `npm run report:lineage-parents` (только читает, строки не снимает — решение пользователя по отчёту; на стенде 0 связей); test-132 R3 (шесть UUID, отчёт на копии БД) |
| Д-67 — лимитер обходился случайной cookie (ключ — хэш ЛЮБОЙ cookie, лимитер стоял до аутентификации), `x-forwarded-for` принимался без доверенного прокси; был Огр-10 (половина о лимитере) | 13.2 | ревизия ограничений 2026-10-14 (код) | ЗАКРЫТ 13.2 (2026-10-20): глобальный `optionalAuth` на `/api/v1/*` ДО `rateLimiter` (роутовые `requireAuth`/`optionalAuth` переиспользуют сессию через `resolveSession` — один запрос к БД); ключ `u:{userId}` проверенной сессии (сессии пользователя делят квоту) либо `ip:{адрес}`; `server/utils/client-address.ts` — единственный читатель `X-Forwarded-For`/`X-Real-IP`, только под `TRUST_PROXY` (умолчание false; `HOST` для петли за Caddy, предупреждение при `TRUST_PROXY` без петли); `.env.example`, `env.local.example`, `check-dotfiles`, deploy/*; `mailLimiter` — то же правило; test-132 R4 (100 случайных cookie, две сессии, XFF без/с TRUST_PROXY, mailLimiter) |
""",
    "L1 08 Часть IV: строки Д-65…Д-67 закрыты",
)

# L2. 08 Часть II — глава беседы 13.2
patch(
    "docs/08-history.md",
    """### Беседа 13.1 — Безопасность входящего HTML и полнотекстовая правка (бэкенд + клиент) [ЗАКРЫТА 2026-10-20]
""",
    """### Беседа 13.2 — Утечки и лимитер запросов (бэкенд) [ЗАКРЫТА 2026-10-20 — Фаза 13 закрыта]

**Вход:** HEAD d90441c, `check:dotfiles` чист, `npm install` в самом клоне,
PG 16 и Redis в песочнице; браузер не нужен (серверная беседа). Вторая и
последняя беседа Фазы 13; три утечки ревизии ограничений 2026-10-14.
Решения пользователя: уже записанные строки родословной не снимать —
только отчёт; привязка/отвязка родителя — Фаза 15; `TRUST_PROXY` — новая
переменная окружения, в установщиках включена за Caddy; переводы — только
новые строки через `tl()`, черновики утверждает он.

**Сделано (первый запрос, 2026-10-20).** п.0 — сверка («По факту 13.2»
п.0): сверх текста беседы — второй путь утечки родителей через `params`
выгрузки (`participants`/`conceptParticipants` как `ConceptParticipantFull`),
структурно недостижимая проверка цикла при импорте (заслон оставлен),
`clientIpOf` admin-audit с тем же `X-Forwarded-For`, устаревшее «почты
нет» в hosting.md. Д-65 — `projectSynthesis` обнуляет паузу каждому
невладельцу, `buildSynthesisFull` считает оценки только владельцу,
`exportHTML(id, { ownerView })` + `stripParentContent`. Д-66 —
`metaParentAllowed` (shared/utils/visibility) для `POST /syntheses` и ветки
UUID импорта с `isDescendantOf`; отклонённый — кандидатом с предупреждением
`parentNotAllowed`; `scripts/maintenance/lineage-parent-access-report.ts`
(`npm run report:lineage-parents`, только читает). Д-67 — выбор «лимитер
после optionalAuth» (один запрос к БД на запрос с cookie; `resolveSession`
переиспользует сессию в роутовых middleware); `clientIdentity` —
`u:{userId}` либо `ip:`; `server/utils/client-address.ts` под
`env.trustProxy`; `HOST` в `serve` с предупреждением; `.env.example`,
`env.local.example`, `check-dotfiles`, `deploy/*`. Сторож 2au/4bf/5ap
(старые 4ag/4ao/4bf переписаны под новое правило: хэш cookie запрещён,
подчистка cookie — в `resolveSession`, порядок middleware — по сырому
index.ts, так как `strip()` принимает `/*` в `"/api/v1/*"` за комментарий);
смоук `tests/smoke-132-request1.mjs` 42 ✓.

**Тестовые запросы 2–4 (2026-10-20, одним заходом).** Черновики en/de
утверждены. `tests/test-132-requests2-4.mjs` 38 ✓ ×2: пауза получена на
моке (HTTP 500 → ретрай → `paused`, `genParams` с капсулой приватного
родителя) — чужому при `'full'` null, владельцу и гостю как прежде,
выгрузка чужого без паузы и содержимого родителя; файл с шестью UUID —
три связи (своя, свой потомок, чужая full+allow_meta), три кандидата с
предупреждением, отчёт на копии БД (`pg_dump`) находит «старые» строки и
ничего не меняет; 100 случайных cookie → 429 после лимита, две сессии
делят квоту `u:`, `mailLimiter` с часовым `retryAfter`, `X-Forwarded-For`
влияет только под `TRUST_PROXY`, `X-Real-IP` запасной, предупреждение
без `HOST`. Расхождений с текстом запросов нет.

**Завершение (2026-10-20).** typecheck 0; свежее дерево: check:integration
OK, dotfiles, i18n strict; TODO в коде беседы нет. Д-65…Д-67 закрыты,
новых долгов нет; Фаза 13 закрыта. Попутно снят дубль урока 13.1 в 09 §6
(блок «contenteditable внутри dangerouslySetInnerHTML» стоял дважды).
Доки — `patch-docs-conv132.py` (части I–III), уроки — 09 §2, §4, §7.
Ближайшая — 14.1.

---

### Беседа 13.1 — Безопасность входящего HTML и полнотекстовая правка (бэкенд + клиент) [ЗАКРЫТА 2026-10-20]
""",
    "L2 08 Часть II: глава 13.2",
)

# L3. 08 Часть I — хроника
patch(
    "docs/08-history.md",
    """en/de утверждены; доки — patch-docs-conv131.py; ближайшая — 13.2.
""",
    """en/de утверждены; доки — patch-docs-conv131.py; ближайшая — 13.2.
Беседа 13.2 (утечки и лимитер запросов; бэкенд) ЗАКРЫТА 2026-10-20 — Фаза
13 закрыта. Д-65: пауза и содержимое родителей — только владельцу (GET и
`philosynth-state`/`params` выгрузки, `stripParentContent`). Д-66: одно
правило `metaParentAllowed` для участников мета-синтеза и ветки UUID
импорта, отклонённый — кандидатом с предупреждением; отчёт
`report:lineage-parents` (только читает). Д-67: лимитер по проверенной
сессии (`optionalAuth` до `rateLimiter`, `resolveSession`), ключ
`u:{userId}`/`ip:`, заголовки прокси только под `TRUST_PROXY`
(`utils/client-address`), `HOST` за Caddy. Сторож 2au/4bf/5ap, смоук 132
42 ✓, test-132 38 ✓ (пауза на моке, шесть UUID, отчёт на копии БД, 100
случайных cookie); доки — patch-docs-conv132.py; ближайшая — 14.1.
""",
    "L3 08 Часть I: хроника 13.2",
)

# M. README — Фаза 13 закрыта
patch(
    "README.md",
    """полнотекстовый редактор подраздела с панелью по тому же модулю) — 10-20 |
""",
    """полнотекстовый редактор подраздела с панелью по тому же модулю) — 10-20; 13.2 (пауза и содержимое родителей только владельцу, правило `metaParentAllowed` в ветке UUID импорта + отчёт `report:lineage-parents`, лимитер по проверенной сессии с `TRUST_PROXY`/`HOST`) — 10-20; **закрыта 2026-10-20** |
""",
    "M  README: Фаза 13 закрыта",
)

# N1. 09 §2 — сторож текстом и /* в строках
patch(
    "docs/09-lessons.md",
    """## 3. PostgreSQL, Drizzle, данные
""",
    """### Беседа 13.2 — сторож текстом: `/*` в строке, перевёрнутые инварианты
1. **`strip()` сторожа снимает блочные комментарии регуляркой и принимает
   `/*` внутри строкового литерала за их начало** — `"/api/v1/*"` в
   index.ts съедал всё до следующего `*/`, и проверка порядка middleware
   не находила ни одной строки. Проверка текста с такими литералами — по
   сырому исходнику; «якорь не найден» у сторожа — сначала заподозрить
   `strip()`.
2. **Беседа, переворачивающая правило, переписывает старые сторожа под
   новое правило, а не снимает их**: 4ag требовал хэш cookie `s:` (теперь
   требует `u:{userId}` и запрещает `createHash`/`getCookie` в лимитере),
   4ao искал подчистку мёртвого cookie в теле `optionalAuth` (теперь — в
   общем `resolveSession`). Перевёрнутые проверки — списком в «По факту»,
   чтобы следующая беседа не приняла их за ослабление.

## 3. PostgreSQL, Drizzle, данные
""",
    "N1 09 §2: сторож текстом (13.2)",
)

# N2. 09 §4 — лимитер и пауза в харнессе
patch(
    "docs/09-lessons.md",
    """## 5. Node, TypeScript, сборка
""",
    """### Беседа 13.2 — лимитер и пауза в живом харнессе
1. **Лимитер в харнессе — окна минуты и общий Redis**: регистрация и
   вход идут по ключу адреса, и счётчики прошлых прогонов (окно
   `mailLimiter` — час) переживают перезапуск сервера. Перед прогоном —
   `redis-cli --scan --pattern 'rate_limit:*' | xargs redis-cli del`;
   аккаунты заводить ДО потопа и в начале чистого окна (`60000 - Date.now()
   % 60000`); проверять, что отказ — именно того лимитера (у `mail`
   `retryAfter` часовой, общий лимит в новом окне свеж).
2. **Пауза генерации на моке — одним ответом HTTP 500**: `STREAM_RETRY_DELAYS=50`
   → `pre-stream` → ретрай → `status='paused'`, и `paused_state.genParams`
   несёт содержимое родителей — настоящий предмет Д-65, а не вставленная
   рукой строка. Родитель должен пройти `validateConceptForMetaSynthesis`
   (sum/glossary/theses/critique + graph + капсула).
3. **Фикстуры капсулы — без слова «Капсула» в тексте**: `extractCapsuleText`
   снимает ведущее «Капсула», и проверка «капсула несёт „Капсула …“»
   красна при верном коде. Маркер содержимого — своя фраза
   («Содержимое капсулы …»), и он не должен совпадать с текстом ребёнка.
4. **Отчёт на копии БД** — `pg_dump | psql` в `philosynth_copy_132`
   (`createdb -T` не годится: к шаблону подключён сервер); «старые» строки
   вставляются в копию, рабочая база сверяется счётчиком до и после.

## 5. Node, TypeScript, сборка
""",
    "N2 09 §4: лимитер и пауза в харнессе (13.2)",
)

# N3. 09 §7 — порядок middleware как инвариант
patch(
    "docs/09-lessons.md",
    """## 8. Прочее
""",
    """### Беседа 13.2 — лимитер до аутентификации, доверие прокси
1. **Middleware, читающее `c.get("user")`, живёт ПОСЛЕ того, кто его
   ставит** — иначе ветка мертва молча (ветка `u:` лимитера с 6.1 не
   работала ни разу; ключом стал хэш любой cookie). Порядок в index.ts —
   инвариант сторожа, а «сессия один раз на запрос» — общий
   `resolveSession`: глобальный проход кладёт `user` (или `null`),
   роутовые middleware переиспользуют `!== undefined`.
2. **Заголовки прокси — один читатель под флагом**: `X-Forwarded-For`
   без `TRUST_PROXY` подделывается прямым обращением к порту; читает их
   только `utils/client-address.ts`, сторож красит любой другой файл;
   `TRUST_PROXY=true` осмыслен лишь с `HOST=127.0.0.1` — сервер
   предупреждает при старте, установщики дописывают переменные в старый
   `.env`.
3. **Правило доступа к содержимому — одной функцией в shared**
   (`metaParentAllowed`), которую зовут все входы (роут, импорт, отчёт);
   предупреждение об отказе — одной фразой на все причины: различать их
   значило бы выдавать состояние чужой концепции по UUID из файла.

## 8. Прочее
""",
    "N3 09 §7: лимитер и прокси (13.2)",
)

# N4. 09 §6 — дубль блока 13.1 (дыра документации, найдена при завершении)
def dedupe_block(rel: str, heading: str, label: str) -> None:
    global applied, skipped, failed
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    if text.count(heading) < 2:
        skipped += 1
        print(f"  skip  {label}")
        return
    second = text.index(heading, text.index(heading) + 1)
    end = text.index("\n## ", second)
    text = text[:second] + text[end + 1:]
    path.write_text(text, encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


dedupe_block("docs/09-lessons.md", "### Беседа 13.1 — contenteditable внутри dangerouslySetInnerHTML\n", "N4 09 §6: дубль урока 13.1 снят")

# O. NEXT-CONTEXT — перезапись комплекта следующей беседы
patch(
    "NEXT-CONTEXT.md",
    """## Состояние на 2026-10-20 (Фаза 13: 13.1 ЗАКРЫТА 2026-10-20, ближайшая — 13.2; Фазы 14 и 15 ждут)
""",
    """## Состояние на 2026-10-20 (ФАЗА 13 ЗАКРЫТА 2026-10-20: 13.1 и 13.2; ближайшая — 14.1; Фаза 15 ждёт)

**13.2 (утечки и лимитер запросов; бэкенд) ЗАКРЫТА 2026-10-20 — Фаза 13
закрыта.** Закрыты Д-65…Д-67; новых долгов нет; реестр §12 — Д-51…Д-62
(Фаза 14) и Д-68…Д-75 (Фаза 15). Д-65: `projectSynthesis` обнуляет
`pausedState`/`pauseEstimates` каждому невладельцу, `exportHTML(id,
{ ownerView })` невладельцу без паузы и без содержимого родителей в
`params` (`stripParentContent`). Д-66: правило родителя мета-синтеза —
`metaParentAllowed` (shared/utils/visibility) в `POST /syntheses` и ветке
UUID импорта (+ `isDescendantOf`); отклонённый — кандидат по имени с
предупреждением `server.importService.parentNotAllowed`; отчёт
`npm run report:lineage-parents [-- --json]` только читает (на стенде —
0 связей; на бою запустить и решить по отчёту). Д-67: глобальный
`optionalAuth` на `/api/v1/*` ДО `rateLimiter` (`resolveSession` в
middleware/auth), ключ `u:{userId}`/`ip:`; `server/utils/client-address.ts`
— единственный читатель `X-Forwarded-For`/`X-Real-IP` под `TRUST_PROXY`;
`HOST` в `serve`. **На стенде после выкатки:** в `.env` дописать
`TRUST_PROXY=true` и `HOST=127.0.0.1` за Caddy (установщики дописывают
`false`/пусто), `npm run check:dotfiles` (ловит обе переменные), один раз
`npm run report:lineage-parents`. Миграций нет. Тесты: smoke-132 42 ✓,
test-132 38 ✓ ×2; сторож 2au/4bf/5ap; один ключ en/de утверждён. Доки —
`patch-docs-conv132.py` (части I–III).
""",
    "O1 NEXT-CONTEXT: состояние — 13.2 закрыта",
)
patch(
    "NEXT-CONTEXT.md",
    """12.5 — 2as/4bd/5an; следующая серия — 2at/4be/5ao). Секции 5xx с живой БД —""",
    """12.5 — 2as/4bd/5an; 13.1 — 2at/4be/5ao; 13.2 — 2au/4bf/5ap; следующая серия — 2av/4bg/5aq). Секции 5xx с живой БД —""",
    "O2 NEXT-CONTEXT: серии сторожа 13.1/13.2",
)

# O3. Комплект ближайшей беседы — 14.1 вместо 13.2
_nc = ROOT / "NEXT-CONTEXT.md"
_t = _nc.read_text(encoding="utf-8")
_start = _t.find("## Ближайшая беседа — 13.2 (утечки и лимитер запросов; бэкенд)")
_end = _t.find("## Что 13.1 оставила знать всем беседам")
NEW141 = """## Ближайшая беседа — 14.1 (опись и сообщения ответа; бэкенд)

Первая беседа Фазы 14 «Довершение локализации» (07, после Фазы 13):
долги §12 с адресатом 14.1 — Д-51, Д-52, Д-53, Д-56, Д-58, Д-60, Д-61
(письма, тексты проверки полей, сообщения-константы и обработчики
верхнего уровня, PNG, слепые места описи i18n, служебные тексты ручной
правки, описание продукта Stripe); Д-58 (опись) — первой. Хранимые
тексты (причина паузы, parseWarnings, журнал, родословная) и клиент —
14.2. Комплект — по шапке 14.1 в 07: §12 строки 14.1; врезка «Фаза 14»;
«По факту» 9.1, 9.2, 11.2, 11.4, 12.3, 12.5, 13.1 (новый редактор и
санитайзер — их тексты), 13.2 (предупреждение `parentNotAllowed` — уже
через `tl()`; предупреждения чистки 13.1 — русские, модули в `skip` описи);
`03` §2.1, `02` (`mail_outbox`, `users.ui_locale`), `04`, `05`;
`scripts/i18n/README.md` целиком, `ui-strings-lib.mjs`, `i18n-check.mjs`,
`i18n-core.mjs`; код по списку в тексте 14.1; `server/integration-check.mts`
— секции 4aw/4ay/4bd как образцы проверок i18n. Исходник и дизайн-набор
не нужны. Миграций — нет (следующая — 0014). Новые ключи — черновики
`i18n:import --draft`, утверждает владелец.

## Что 13.2 оставила знать всем беседам

- **Пауза генерации и содержимое родительских концепций — только
  владельцу**: `projectSynthesis` — единственная функция отсечения полей
  GET /:id, `exportHTML(id, { ownerView })` — выгрузки; новая точка
  выдачи `pausedState`/`genParams`/`params` невладельцу — через них, и
  в сторож 4bf.
- **Правило «годится ли концепция в родители» — одно**:
  `metaParentAllowed(row, viewerUserId)` в shared; новый вход, создающий
  связь «ребёнок → родитель», зовёт его (и `isDescendantOf`), а не
  читает флаги сам. Уже записанные связи не снимаются беседой —
  `report:lineage-parents` отчитывается, решает пользователь.
- **Сессия проверяется один раз на запрос** глобальным `optionalAuth`
  ДО `rateLimiter`; новое middleware, читающее `c.get("user")`, стоит
  после него, роутовые `requireAuth`/`optionalAuth` переиспользуют
  результат через `resolveSession`. Лимитер cookie не читает: ключ —
  `u:{userId}` либо `ip:{адрес}`.
- **Заголовки прокси читает только `server/utils/client-address.ts`**
  под `TRUST_PROXY` (сторож красит любой другой файл); за Caddy —
  `TRUST_PROXY=true` вместе с `HOST=127.0.0.1`; обе переменные — в
  `check-dotfiles`.
- **Сторож текстом по файлу со строкой `"/api/v1/*"` — по сырому
  исходнику**: `strip()` принимает `/*` в литерале за начало комментария.

"""
if _start >= 0 and _end > _start:
    _nc.write_text(_t[:_start] + NEW141 + _t[_end:], encoding="utf-8")
    applied += 1
    print("  ok    O3 NEXT-CONTEXT: комплект 14.1 вместо 13.2")
elif "## Ближайшая беседа — 14.1 (опись и сообщения ответа; бэкенд)" in _t:
    skipped += 1
    print("  skip  O3 NEXT-CONTEXT: комплект 14.1 вместо 13.2")
else:
    failed += 1
    print("  fail  O3 NEXT-CONTEXT: якоря не найдены")

print(f"\nприменено {applied}, пропущено {skipped}, провалено {failed}")
sys.exit(1 if failed else 0)
