#!/usr/bin/env python3
"""Патч документации по беседе 16.1 (адреса, участники и права, комментарии
и рецензии — серверный слой обсуждения; Фаза 16).
ЧАСТЬ I — ПЕРВЫЙ ЗАПРОС (2026-11-08):
  A  07 — блок «По факту 16.1 (первый запрос)» после текста беседы: п.0
     сверка (ownerEditGate ×4, не ×3; ownerGate + встроенная проверка
     /subsection-impact; ownerReadGate; ws ×4; сервисы; места пересоздания
     элементов), решения (капабилити одним модулем, editGate, участник
     читает любую ступень, адреса, плоские ветки, мягкое удаление, скрытие,
     редакции рецензий, «удалённый пользователь», код CONFLICT), пп.1–8,
     сторож 2bb/4bm/5aw, смоук.
  B  02 — ER-диаграмма += synthesis_members / comments / reviews /
     review_revisions / review_findings; §2.33–2.37 — пять таблиц.
  C  03 §2.2 — loadSynthesisForRead через capabilities (участник на любой
     ступени), SynthesisFull.capabilities; §2.17 — маршруты обсуждения;
     §4.3 — CONFLICT.
  D  04 §4 — строка 16.1.
  E  05 — capabilities.ts, edit-gate.ts, discussion*.ts, миграция 0017,
     shared discussion*, smoke-161, patches (последний — conv161).
  F  NEXT-CONTEXT — первый запрос 16.1 исполнен; серия 2bb/4bm/5aw и
     миграция 0017 заняты (следующие — 2bc/4bn/5ax, 0018).
  G  09 §3 — уроки 16.1: курсор по created_at теряет микросекунды;
     postgres.js не принимает Date в sql``-параметре drizzle.
ЧАСТЬ II (H–M, 2026-11-08) — тестовые запросы 2–4 одним заходом
  (test-161-requests2-4: R2 права живьём на private/showcase/full, R3 адреса
  на моке Claude, R4 комментарии/рецензии/удаление аккаунта по HTTP) и
  сверка доков после сжатия контекста:
  H  07 «По факту 16.1 (тестовые запросы 2–4)»: 61 ✓ ×2; регресс 13.2/15.x
     (smoke-132 42, test-132 38, smoke-151 24, test-151 42, smoke-152 44,
     test-152 75, smoke-153 34, test-153 51, smoke-154 47, test-154 49);
     два харнесса починены (test-151 R3(б) ждал «последняя миграция —
     0014»; smoke-154 A7 — «журнал = 17»); переводы утверждены.
  I  01 «Авторизация ресурсов» — пункты 16.1 (участники, один модуль прав).
  J  03 §2.16 — `ownerEditGate` → `editGate`.
  K  05 — test-161-requests2-4; deploy/* — миграций восемнадцать (0000…0017).
  L  NEXT-CONTEXT — тестовые запросы исполнены; черновиков 0.
  M  09 §4 — уроки харнессов 16.1.
ЧАСТЬ III (N–T, 2026-11-09) — завершение беседы: 07 «По факту 16.1
  (завершение)»; врезка «Фаза 16» — 16.1 закрыта; §12 журнал (долгов нет);
  08 Части I/II; README (строка Фазы 16 — 16.1 закрыта); NEXT-CONTEXT
  перезаписан (состояние; комплект ближайшей — 16.2; 16.1 — в историю);
  09 §2 — урок патча (часть II переписала текст части I — блок вставился
  дважды; marker на блок состояния).
Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ; блок «По факту» — по
marker). Запуск из корня:
    python3 scripts/patches/patch-docs-conv161.py
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


D02 = "docs/02-data-model.md"
D03 = "docs/03-specification.md"
D04 = "docs/04-code-reuse-map.md"
D05 = "docs/05-file-structure.md"
D07 = "docs/07-conversation-protocol.md"
D09 = "docs/09-lessons.md"
NXT = "NEXT-CONTEXT.md"

print("ЧАСТЬ I — первый запрос 16.1")

# ── A. 07 «По факту 16.1 (первый запрос)» ──────────────────────────────
FACT_161_R1 = """
**По факту 16.1 (первый запрос — 2026-11-08).** Исполнено целиком
(пп. 0–8), одним заходом; тестовые запросы и завершение — следующими
запросами. Вход: HEAD 1a42224 (15.4 закрыта), `check:dotfiles` OK,
`npm install` в клоне, `typecheck` чистый до правок.

0. Сверка текста с кодом (до правок). «Владелец ли это» на сервере:
   `ownerEditGate` — **четыре** копии, не три (`elements.ts` — экспорт, им
   пользовались `sections.ts` и `recommendations.ts`; свои копии в
   `enrichment.ts`, `modes.ts`, `transforms.ts`), `ownerGate` в
   `generation.ts` + встроенная проверка в `/subsection-impact`,
   `ownerReadGate` в `recommendations.ts` (без гейта активной операции);
   `ws/handler.ts` ×4 (subscribe_generation, handleResume,
   start_enrichment, start_transform); сервисы — `edit-planner.createPlan`,
   `pause-resume-service` ×2, `generation-service.generateSynthesis` /
   `resumeGenerationFrom`; роуты — `plans.ts` (`/plans/impact`),
   `lineage.ts` ×4 (link ×2, candidates, DELETE link), `syntheses.ts`
   (`loadSynthesisForRead`, `buildSynthesisFull`, PATCH/DELETE/duplicate);
   `export.ts` и `logs.ts` читают `viewer === "owner"`. НЕ владение (в
   белом списке сторожа): `plan-executor.confirmStep` и
   `edit-planner.loadPlanRow` (автор плана), `generation-service.activeRuns`
   (кто запустил), `billing-service` (metadata PaymentIntent). Клиентский
   `isOwner` — только перечислен: `SynthesisPage.tsx` ×31,
   `DocumentHeader.tsx` ×5, `DocumentView.tsx` ×2, `ElementEditor.tsx`,
   `api/recommendations.ts` — не тронут. Пересоздание элементов с новыми id:
   `graph-parser.saveGraphToDb` (DELETE категорий/рёбер/кластеров +
   INSERT; зовут проход генерации, `applySectionSideEffects` при
   regenerateSection/Subsection/addSection, импорт, `representation-
   transformer` тезисы→граф), `element-parser.saveElementsToDb` (тезисы,
   термины — те же вызывающие), `representation-transformer.rollbackTransform`
   (восстанавливает ПРЕЖНИЕ id), `deleteSection` (граф — только DELETE),
   `element-editor.deleteElement`/`deleteCategoryEdge`, `POST /edges`,
   `duplicate` (новый синтез). Разделы: `upsertSection` — onConflictDoUpdate,
   id разделов устойчивы; подразделы id не имеют (адрес — ключ раздела +
   `data-section`).
1. Миграция `0017_discussion` (drizzle-kit, тег переименован в файле и
   журнале, «No schema changes» после): `synthesis_members` (role ∈ reviewer
   | editor, status ∈ invited | active, `invited_by` SET NULL,
   UNIQUE(synthesis_id, user_id), CHECK), `comments`, `reviews`,
   `review_revisions`, `review_findings` — все CASCADE по синтезу,
   `author_id` SET NULL (строка `users` при 7.1 остаётся — срабатывает
   только при физическом удалении). Схема — 37 таблиц. shared:
   `constants/discussion.ts` (роли, статусы, виды адресов и замечаний, поля
   рецензии, пределы: выдержка 300, комментарий 10 000, поле рецензии
   20 000, заголовок 300, страница 50/200), `types/discussion.ts`
   (`Capabilities`, `DiscussionAddress`, `Comment`, `Review`,
   `ReviewRevision`, `ReviewFinding`, `DiscussionSummary` …).
2. Одна проверка прав — `server/services/capabilities.ts`: единственное
   сравнение `row.userId === userId` (приватный `isOwner`);
   `capabilitiesFor(row, userId, membership)` → `{ read, discuss, edit,
   manage, role }` (role ∈ owner | reviewer | editor | reader | guest);
   `editCapability(owner, role)` возвращает `owner` — **17.1 меняет только
   её**; `canEditSynthesis`/`canManageSynthesis`/`canDiscussSynthesis`,
   `loadMembership`/`loadCapabilities`/`capabilitiesOfRow`. Гейт правки —
   один `routes/edit-gate.ts: editGate(c, id, userId, { activeOp? })` с
   прежним порядком 404 (не-UUID до БД) → 404 → 403 → 409; четыре
   `ownerEditGate`, `ownerGate`, `ownerReadGate` (= `editGate` с `activeOp:
   false`) сняты; `/subsection-impact`, `plans/impact`, ws ×4, сервисы —
   `canEditSynthesis`; lineage, PATCH/DELETE/duplicate — `canManageSynthesis`.
   `loadSynthesisForRead`: `capabilities = capabilitiesOfRow(row, userId)`;
   владелец → owner/full; `!read` → forbidden; участник (reviewer/editor)
   → `viewer: 'user'`, `scope: 'full'` на ЛЮБОЙ ступени (приватная и
   витрина — целиком; стоимость/токены видны как любому зарегистрированному,
   логи — по-прежнему флагами 8.6); чужой — как прежде. `ReadAccess` и
   `SynthesisFull` += `capabilities` (рядом с `isOwner = role === "owner"`);
   `audit.mts` знает поле как typeOnly. Поведение владельца и чужих —
   побайтно прежнее (сторожа 4ab/4ac/4ad/4af/4ai/4an/4ar/4as/4bb/4bi/4bj/4u/4x
   переписаны на новые имена, смысл тот же).
3. Реестр адресов. `packages/shared/utils/discussion-address.ts` (чистый):
   ключи — `categoryKey`/`termKey` (normalizeName → схлопнуть пробелы →
   нижний регистр), `edgeKey` = `src→tgt|type`, `thesisKey` = `label ??
   thesis_num`, `subsectionKey` = `sectionKey:dataSection`; `canonicalJson`
   (ключи по алфавиту, undefined выпадает) → `sha256Hex` (WebCrypto) =
   `contentHash` (у synthesis — пустой: концепция «в целом» не устаревает);
   `excerptOf` ≤ 300 с «…»; `plainText` (CRLF→LF, управляющие сняты,
   хвостовые пробелы и 3+ пустых строк схлопнуты; **разметка не трогается**
   — «<» в философском тексте законен, экранирует показ клиент);
   `buildAddress(obj)` → `{ kind, key, id, hash, version }`,
   `resolutionOf(addr, current)` → current | outdated | deleted.
   `server/services/discussion-address.ts`: `loadAddressIndex(synthesisId)`
   — один проход по разделам, категориям, рёбрам, тезисам, терминам и
   `max(version)` `element_versions`; `subsectionsOf` — лениво через
   `listSubsectionNames`/`readSubsectionSource`; `findTarget` (id → ключ),
   `addressOf` (адрес + выдержка на момент записи), `resolveAddress` (id →
   ключ → deleted). Полезная нагрузка хэша: раздел — `html`, категория —
   name/type/definition/origin, ребро — source/target/type/direction/
   description, тезис — label/formulation/justification, термин —
   term/definition/extraColumns.
4. Комментарии — `services/discussion.ts` + `routes/discussion.ts` (03
   §2.17). Ветки ПЛОСКИЕ: `parent_id` — только корень (ответ на ответ →
   400), ответ наследует адрес корня; статус (open | resolved | hidden) и
   `resolved_by/at` — у корня; список — плоский по времени с курсором (id
   последней строки; `(created_at, id) > (select …)` в PG — JS `Date` режет
   микросекунды, 09 §3), фильтры kind+key / status / author. Правка и
   удаление — автор (скрытый владельцем не правится, 409); удаление корня с
   ответами — заглушка (`deleted_at`, тело стёрто, `deleted: true`), без
   ответов и у ответов — физически; заглушка без живых ответов из списка
   выпадает. resolve/reopen — автор ветки или владелец; hide/unhide —
   владелец (`manage`), скрытый виден всем как `hidden` с пустым телом,
   тело — автору и владельцу; ответ в скрытую/удалённую ветку — 409;
   возврат из скрытого — resolved, если `resolved_at` стоит, иначе open.
   Автор — `{ id, name (display_name | email), deleted, isOwner }`;
   удалённый (7.1, `email = deleted-<id>@deleted.invalid`) — `id: null`,
   `name: tl("удалённый пользователь")` на языке запроса.
5. Рецензии: `reviews` (версия документа — четыре `version_*` на момент
   создания, обновляются при публикации; семь текстовых полей; status;
   `revision`), `review_revisions` (снимок полей + версии документа +
   замечаний БЕЗ состояния адреса), `review_findings` (адрес, выдержка,
   body, kind?, position). Черновик — виден только автору (чужому **404**,
   не 403: наличие черновика не раскрывается), правится на месте, удаляется;
   publish → редакция 1 (повторная публикация отозванной — следующая);
   любая правка опубликованной (поля, добавить/править/удалить замечание)
   — редакция N+1 в той же транзакции, прежние целы; withdraw — остаётся
   видимой с `withdrawnAt`, не правится; опубликованную удалить нельзя
   (409 — отзывают). Список: опубликованные и отозванные всем с `discuss`,
   черновики — автору.
6. Сводка `GET /:id/discussion/summary` — два сгруппированных запроса по
   `(address_kind, address_key)`: открытые корни (не удалённые) и замечания
   ОПУБЛИКОВАННЫХ рецензий; `totals` += число опубликованных рецензий.
7. Удаление аккаунта (`account-deletion.ts`): `synthesis_members`
   пользователя снимаются явно той же транзакцией (анонимизация — CASCADE
   молчит, урок 8.1/9.1); комментарии и рецензии остаются (принадлежат
   концепции). Удаление синтеза — CASCADE уносит участников, комментарии,
   рецензии, редакции, замечания (проверено живьём).
8. Сторож 2bb/4bm/5aw. 2bb — экспорты семи модулей, матрица прав
   (редактор без edit, публичная без discuss, приглашённый ≠ участник).
   4bm — ни одного прямого сравнения владельца вне `capabilities.ts`
   (белый список с доводом: edit-planner, plan-executor — автор плана;
   generation-service — кто запустил; billing-service — PaymentIntent),
   `isOwner` одно, `editCapability` = `owner`, порядок `editGate`, импорт
   `editGate` в семи роутерах, `loadSynthesisForRead`/`buildSynthesisFull`/
   PATCH-DELETE-duplicate через модуль, участник со scope full, ws ×4,
   `SynthesisFull.capabilities`; 18 маршрутов обсуждения ровно по 03 §2.17
   и все под `requireAuth` + `handler` (гейт синтеза: 404 → 403 по
   `discuss`), hide/unhide под `manage`, без `isGenerationActive`/`editGate`;
   обсуждение не импортирует `html-parser`/санитайзер и не пишет в документ
   (`discussion-address.ts` — только чтение), `plainText` не режет разметку,
   `contentHash = sha256(canonicalJson)`; пять таблиц в схеме и 0017 (CASCADE
   ×≥8, SET NULL по автору), журнал — 0017 на месте 17; `account-deletion`
   снимает участие и не трогает комментарии; «удалённый пользователь» по
   анонимизированному email; ключи с en/de. 5aw живьём: импорт образца
   `sample/` владельцем, участник reviewer active — права на приватной;
   комментарий по ключу → `address.id` категории; правка определения →
   outdated; `saveGraphToDb(parseGraphFromHTML(раздел graph))` — категория
   пересоздана с новым id, адрес нашёл её по ключу (current, `currentId`
   новый; `findTarget` с прежним id и ключом → новая, без ключа → null);
   редактор без edit; черновик чужому 404; publish → 1, замечание → 2 с
   двумя редакциями; сводка; `deleteAccount` участника → членство снято,
   комментарий под «удалённый пользователь»; `sections.html_content` до и
   после — побайтно равны; удаление синтеза — каскад. Негативный прогон
   (`editCapability` → `owner || editor`) красит 2bb, 4bm и 5aw. Перегенерация
   графа «на моке» заменена прямым `saveGraphToDb` того же HTML — тот же
   путь DELETE + INSERT без обращения к модели. Переписаны под новые имена:
   4as, 4u, 4ab, 4ad, 4af (×2), 4ai, 4an, 4ar, 4bb, 4bi (×2), 4bj (×2), 4ac,
   4x; 4bl — журнал «≥ 17» (0017 — восемнадцатая, держит 4bm). 40 новых
   ключей `server.discussion.*` — черновики en/de (`i18n:import --draft`),
   `i18n:check --strict` зелёный; клиентский `ApiErrorCode` += `CONFLICT`
   (тип, по правилу сторожа 4e «коды §4.3 известны клиенту»; интерфейс — 16.3). Смоук `tests/smoke-161-request1.mjs` — 58 ✓ (A1–A13 чистые
   функции и исходники; B0–B8 живьём через `app.request`: матрица прав на
   private/full/showcase, паритет гейта правки, 401/403/404 обсуждения,
   комментарии и ветки, курсор, статусы, скрытие, удаление с заглушкой,
   адреса outdated/current/deleted, рёбра и тезисы, рецензии/редакции/
   отзыв, сводка, удаление аккаунта и синтеза). INTEGRATION OK (16.1:
   2bb/4bm/5aw), `typecheck`, `audit`, `check:dotfiles` зелёные.
   Новый код ошибки — `CONFLICT` (409, 03 §4.3): обсуждению хватило одного
   общего 409 с объясняющим `error`; отдельных кодов на каждый случай не
   заведено нарочно (клиент 16.3 показывает текст).
   Не сделано нарочно (протокол): приглашения, уведомления, интерфейс
   (16.2/16.3); права редактора (17.1); реакции/упоминания/подписки;
   обсуждения не в выгрузках и не в копии синтеза.

---

### Беседа 16.2:"""

patch(
    D07,
    """- Новые таблицы и маршруты — в 02 и 03 этой же беседой; закрытие — 08 Часть II, урок — 09, NEXT-CONTEXT перезаписать (07 §10)

---

### Беседа 16.2:""",
    """- Новые таблицы и маршруты — в 02 и 03 этой же беседой; закрытие — 08 Часть II, урок — 09, NEXT-CONTEXT перезаписать (07 §10)
""" + FACT_161_R1,
    "A 07: «По факту 16.1 (первый запрос)»",
    marker="По факту 16.1 (первый запрос",
)

# ── B. 02 — ER-диаграмма и таблицы §2.33–2.37 ───────────────────────────
patch(
    D02,
    """  ├── auth_tokens (одноразовые доводы из писем; CASCADE; 9.1)
  └── admin_audit (actor_id → users, SET NULL; 8.1)
""",
    """  ├── auth_tokens (одноразовые доводы из писем; CASCADE; 9.1)
  ├── admin_audit (actor_id → users, SET NULL; 8.1)
  │
  ├── synthesis_members (16.1: участники синтеза — reviewer | editor;
  │                      CASCADE по синтезу и пользователю; при 7.1 —
  │                      снимаются явно)
  ├── comments          (16.1: author_id → users SET NULL; CASCADE по
  │     └── comments    синтезу; parent_id → корень ветки, CASCADE)
  └── reviews           (16.1: author_id → users SET NULL; CASCADE по синтезу)
        ├── review_revisions   (снимки редакций; CASCADE)
        └── review_findings    (замечания с адресами; CASCADE по рецензии
                                и синтезу)
""",
    "B1 02 §1: ER += обсуждение",
)

TABLES_161 = """### 2.33. synthesis_members

Участники синтеза (беседа 16.1, миграция `0017_discussion`; врезка «Фаза
16» в 07). Владелец — `syntheses.user_id`, строки у него нет. Роль `editor`
заведена сразу, права её действуют с Фазы 17 (в 16.x редактор = рецензент).
Приглашения и принятие (`status`) — беседа 16.2; в 16.1 строки заводит
только оснастка/тесты. Права по строке считает ОДИН модуль —
`server/services/capabilities.ts` (`{ read, discuss, edit, manage, role }`):
активный участник читает концепцию на любой ступени видимости и обсуждает;
приглашённый (`invited`) — как читатель.

```sql
CREATE TABLE synthesis_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id  UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('reviewer', 'editor')),
  status        TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active')),
  invited_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_synthesis_members_pair UNIQUE (synthesis_id, user_id)
);
CREATE INDEX idx_synthesis_members_user ON synthesis_members(user_id);
```

**Удаление аккаунта (7.1)** анонимизирует строку `users` — CASCADE не
срабатывает, поэтому `account-deletion` удаляет строки участия явно той же
транзакцией. Удаление синтеза — каскад.

### 2.34. comments

Комментарии к концепции и её элементам (беседа 16.1). Документ ими не
меняется: ни одна функция обсуждения не пишет в `sections` и гранулярные
таблицы. Тексты — обычный текст (`plainText`: переводы строк LF,
управляющие сняты, разметка НЕ разбирается и не вырезается — экранирует
показ клиент).

```sql
CREATE TABLE comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id  UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  author_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  address       JSONB NOT NULL,          -- DiscussionAddress: { kind, key, id, hash, version }
  address_kind  TEXT NOT NULL,           -- копия address.kind — для индексов и сводки
  address_key   TEXT NOT NULL,           -- копия address.key
  excerpt       TEXT NOT NULL DEFAULT '',-- выдержка объекта на момент записи (≤ 300)
  parent_id     UUID REFERENCES comments(id) ON DELETE CASCADE, -- ТОЛЬКО корень ветки
  kind          TEXT CHECK (kind IN ('question', 'objection', 'source', 'unclear')), -- NULL — без вида
  body          TEXT NOT NULL,           -- ≤ 10 000; у удалённой заглушки — ''
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'hidden')),
  resolved_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at   TIMESTAMPTZ,
  hidden_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  hidden_at     TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ,             -- заглушка: корень удалён автором, ответы живы
  edited_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_synthesis_created ON comments(synthesis_id, created_at);
CREATE INDEX idx_comments_address ON comments(synthesis_id, address_kind, address_key);
CREATE INDEX idx_comments_parent ON comments(parent_id);
CREATE INDEX idx_comments_author ON comments(author_id);
```

**Адрес** (`packages/shared/utils/discussion-address.ts`): вид ∈ synthesis |
section | subsection | category | edge | thesis | glossary_term; ключ —
устойчивое имя (категория/термин — `normalizeName` в нижнем регистре, ребро
— `src→tgt|type`, тезис — `label ?? thesis_num`, подраздел —
`sectionKey:dataSection`, раздел — ключ, синтез — id); `id` — строка на
момент записи; `hash` — sha256 канонического содержимого (у synthesis —
пустой); `version` — `max(element_versions.version)` на момент записи.
Состояние адреса **вычисляется при чтении** (`resolveAddress`: id → ключ →
нет): `current` (хэш сошёлся — и после пересоздания с новым id), `outdated`
(объект на месте, содержимое иное: «относится к прежней версии»),
`deleted`. В БД состояние не хранится; комментарий никуда не переносится.

**Ветки плоские**: `parent_id` указывает только на корень (ответ на ответ
— 400); ответ наследует адрес корня; статус — у корня. **Удаление
автором**: корень с живыми ответами → заглушка (`deleted_at`, `body = ''`);
без ответов и любой ответ → строка удаляется; заглушка, у которой не
осталось живых ответов, в списке не отдаётся. **Скрытие владельцем** —
`status = 'hidden'` (`hidden_by/at`): виден всем как «скрыто владельцем» с
пустым телом, тело — автору и владельцу; возврат — `resolved`, если
`resolved_at` стоит, иначе `open`. Автор удалённого аккаунта (7.1,
`email = deleted-<id>@deleted.invalid`) показывается как «удалённый
пользователь» (`author.id = null`, `deleted: true`).

### 2.35. reviews

Рецензии (беседа 16.1). Версия документа — четыре `version_*` синтеза на
момент создания черновика, **обновляются при публикации**. Семь текстовых
полей — обычный текст (`title` ≤ 300, прочие ≤ 20 000).

```sql
CREATE TABLE reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id      UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  author_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  version_base      INTEGER NOT NULL,
  version_sub       INTEGER NOT NULL,
  version_modes     INTEGER NOT NULL,
  version_mode_regen INTEGER NOT NULL,
  title             TEXT NOT NULL DEFAULT '',
  summary           TEXT NOT NULL DEFAULT '',
  strengths         TEXT NOT NULL DEFAULT '',
  objections        TEXT NOT NULL DEFAULT '',
  minor             TEXT NOT NULL DEFAULT '',
  questions         TEXT NOT NULL DEFAULT '',
  conclusion        TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'withdrawn')),
  revision          INTEGER NOT NULL DEFAULT 0,  -- 0 у черновика; publish → 1; правка опубликованной → +1
  published_at      TIMESTAMPTZ,
  withdrawn_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reviews_synthesis ON reviews(synthesis_id, created_at);
CREATE INDEX idx_reviews_author ON reviews(author_id);
```

**Жизненный цикл.** `draft` — виден и правится только автором (чужому —
**404**, наличие черновика не раскрывается), удаляется; `publish` →
`published`, редакция 1 (повторная публикация отозванной — следующая);
любая правка опубликованной — полей или замечаний — новая редакция той же
транзакцией, прежняя сохраняется; `withdraw` → `withdrawn` — остаётся
видимой с пометкой, не правится; опубликованную удалить нельзя (409 —
отзывают). Удаление аккаунта автора рецензию не трогает.

### 2.36. review_revisions

Снимки редакций опубликованной рецензии (беседа 16.1): поля, версия
документа и замечания (без состояния адреса — оно вычисляется при чтении
живой рецензии, а снимок — история).

```sql
CREATE TABLE review_revisions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id    UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  revision     INTEGER NOT NULL,
  doc_version  JSONB NOT NULL,           -- { base, sub, modes, modeRegen }
  fields       JSONB NOT NULL,           -- ReviewFields (семь текстов)
  findings     JSONB NOT NULL DEFAULT '[]', -- ReviewFinding[] без resolution
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_review_revisions_review_revision UNIQUE (review_id, revision)
);
```

### 2.37. review_findings

Замечания рецензии с адресами (беседа 16.1). Живут у рецензии (не у
редакции): правка замечания опубликованной рецензии = новая редакция.
Адрес, выдержка и состояние — как у комментариев (§2.34).

```sql
CREATE TABLE review_findings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id     UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  synthesis_id  UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  address       JSONB NOT NULL,
  address_kind  TEXT NOT NULL,
  address_key   TEXT NOT NULL,
  excerpt       TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL,           -- ≤ 10 000
  kind          TEXT CHECK (kind IN ('question', 'objection', 'source', 'unclear')),
  position      INTEGER NOT NULL DEFAULT 0,  -- порядок в рецензии (max + 1 при добавлении)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_review_findings_review ON review_findings(review_id, position);
CREATE INDEX idx_review_findings_address ON review_findings(synthesis_id, address_kind, address_key);
```

**Сводка для документа** (`GET /syntheses/:id/discussion/summary`, 03
§2.17) считает по `(address_kind, address_key)` открытые корни комментариев
(не удалённые) и замечания ОПУБЛИКОВАННЫХ рецензий — двумя сгруппированными
запросами; для пометок у элементов в 16.3.

## 3. Извлечение гранулярных элементов из HTML
"""

patch(
    D02,
    """исполняющий шаг (сам `delete_element` по этой рекомендации) переведёт её в
`done`.

## 3. Извлечение гранулярных элементов из HTML
""",
    """исполняющий шаг (сам `delete_element` по этой рекомендации) переведёт её в
`done`.

""" + TABLES_161,
    "B2 02 §2.33–2.37: пять таблиц обсуждения",
    marker="### 2.33. synthesis_members",
)

# ── C. 03 — §2.2 (права), §2.17 (маршруты), §4.3 (CONFLICT) ─────────────
patch(
    D03,
    """                                //   'full' → ok со scope 'full';
                                //   userId=null → viewer 'guest'.
                                // Отсечение полей — ОДНОЙ функцией""",
    """                                //   'full' → ok со scope 'full';
                                //   userId=null → viewer 'guest'.
                                // 16.1: решает ОДИН модуль прав
                                // services/capabilities (capabilitiesOfRow →
                                // { read, discuss, edit, manage, role }):
                                // активный участник (synthesis_members
                                // reviewer | editor) → ok, viewer 'user',
                                // scope 'full' на ЛЮБОЙ ступени (приватная
                                // и витрина — целиком; стоимость/токены как
                                // любому зарегистрированному, логи — флагами
                                // 8.6); приглашённый (invited) — как чужой.
                                // Ответ несёт capabilities рядом с isOwner.
                                // Отсечение полей — ОДНОЙ функцией""",
    "C1 03 §2.2: loadSynthesisForRead через модуль прав",
)
patch(
    D03,
    """  isOwner: boolean;                     // 5.2 («По факту 5.2»): текущий
                                        // пользователь — владелец; клиентские
                                        // гейты правок (✎, «Изменить», режимы)
                                        // вместо оптимизма «403 решит».
                                        // Флаг, а не userId — публичный
                                        // синтез владельца не раскрывает
""",
    """  isOwner: boolean;                     // 5.2 («По факту 5.2»): текущий
                                        // пользователь — владелец; клиентские
                                        // гейты правок (✎, «Изменить», режимы)
                                        // вместо оптимизма «403 решит».
                                        // Флаг, а не userId — публичный
                                        // синтез владельца не раскрывает
  capabilities: Capabilities;           // 16.1: { read, discuss, edit, manage,
                                        // role: owner | reviewer | editor |
                                        // reader | guest } — права смотрящего
                                        // из services/capabilities; isOwner =
                                        // role === 'owner'. В 16.1 edit = owner
                                        // (редактор получает его в 17.1);
                                        // клиент переходит на поле в 16.3/17.2.
""",
    "C2 03 §2.2: SynthesisFull.capabilities",
)

ROUTES_161 = """### 2.17. Обсуждение и рецензии (беседа 16.1)

```
GET    /syntheses/:id/comments               ?kind&key&status&author&cursor&limit
                                             → { comments: Comment[], nextCursor }
POST   /syntheses/:id/comments               { target | parentId, body, kind? } → Comment (201)
PATCH  /syntheses/:id/comments/:cid          { body?, kind? } → Comment        (автор)
DELETE /syntheses/:id/comments/:cid          → { ok, removed }                  (автор)
POST   /syntheses/:id/comments/:cid/resolve  → Comment     (автор ветки или владелец)
POST   /syntheses/:id/comments/:cid/reopen   → Comment     (автор ветки или владелец)
POST   /syntheses/:id/comments/:cid/hide     → Comment     (владелец — manage)
POST   /syntheses/:id/comments/:cid/unhide   → Comment     (владелец — manage)
GET    /syntheses/:id/reviews                → Review[]    (черновики — только свои)
POST   /syntheses/:id/reviews                ReviewUpsertInput → Review (201, draft)
GET    /syntheses/:id/reviews/:rid           → Review      (чужой черновик — 404)
PATCH  /syntheses/:id/reviews/:rid           ReviewUpsertInput → Review (автор; опубликованная → новая редакция)
DELETE /syntheses/:id/reviews/:rid           → { ok }      (автор; только черновик, иначе 409)
POST   /syntheses/:id/reviews/:rid/publish   → Review      (редакция 1; версия документа — на момент публикации)
POST   /syntheses/:id/reviews/:rid/withdraw  → Review      (только опубликованную)
GET    /syntheses/:id/reviews/:rid/revisions → ReviewRevision[] (новые первыми)
POST   /syntheses/:id/reviews/:rid/findings  { target, body, kind? } → Review (201)
PATCH  /syntheses/:id/reviews/:rid/findings/:fid  { body?, kind? } → Review
DELETE /syntheses/:id/reviews/:rid/findings/:fid  → Review
GET    /syntheses/:id/discussion/summary     → { byAddress: AddressCounts[],
                                                 totals: { openComments, findings, reviews } }
```

**Доступ — всегда через синтез и модуль прав** (`routes/discussion.ts`,
`discussGate`): гость → 401; не-UUID / нет строки → 404; нет права
`discuss` (владелец или активный участник) → 403 `FORBIDDEN` — и на
публичной концепции: читатель обсуждения не видит (решение 16.1: участники
только по приглашению). Скрытие — право `manage`. Автор ли это — решает
сервис по строке. Активная операция над синтезом обсуждению не мешает
(409 `GENERATION_IN_PROGRESS` нет): документ отсюда не меняется.

**Адрес цели** (`target`): `{ kind, id?, key? }` — `kind` ∈ synthesis |
section | subsection | category | edge | thesis | glossary_term; `id` —
строка таблицы (сначала), `key` — устойчивый ключ (имя категории/термина,
`src→tgt|type`, `label`/номер тезиса, ключ раздела, `sectionKey:dataSection`);
у synthesis ни то, ни другое не нужно. Объекта нет → 404. В ответе адрес
несёт `id`, `key`, `hash`, `version` на момент записи, `excerpt` — выдержку,
`resolution` — вычисленное состояние `{ state: current | outdated |
deleted, currentId, currentHash, currentVersion }` (02 §2.34).

**Тела** — обычный текст (`plainText`), разметка не принимается и не
чистится; пределы: комментарий и замечание ≤ 10 000, поле рецензии
≤ 20 000, заголовок ≤ 300, выдержка ≤ 300. Список комментариев — плоский
по времени (клиент собирает ветки по `parentId`), страница `limit`
1…200 (умолчание 50), `cursor` — непрозрачный (id последней строки).

**Ошибки**: `VALIDATION_ERROR` 400 (`details` по полям: пустое тело,
неизвестный `kind`/вид адреса, ответ на ответ, статус у ответа, негодный
курсор), `NOT_FOUND` 404, `FORBIDDEN` 403 (чужая правка/удаление,
resolve не автором и не владельцем, hide не владельцем), `CONFLICT` 409
(ответ в удалённую/скрытую ветку, правка удалённого/скрытого, повторная
публикация, правка/замечание у отозванной, удаление опубликованной) —
`error` объясняет причину.

**Автор**: `{ id, name, deleted, isOwner }`; удалённый аккаунт (7.1) —
`id: null`, `deleted: true`, `name` = «удалённый пользователь» на языке
запроса. `isOwner` автора — через модуль прав.

---

## 3. WebSocket-протокол
"""

patch(
    D03,
    """плана (`declined[].reason`) и подсказка `hint` — тоже на языке запроса,
метка раздела — `tData(KEY_LABELS[…])`.

---

## 3. WebSocket-протокол
""",
    """плана (`declined[].reason`) и подсказка `hint` — тоже на языке запроса,
метка раздела — `tData(KEY_LABELS[…])`.

---

""" + ROUTES_161,
    "C3 03 §2.17: маршруты обсуждения",
    marker="### 2.17. Обсуждение и рецензии",
)
patch(
    D03,
    """LAST_ADMIN          — понижение или удаление аккаунта последнего администратора —
                      409 (8.1; подсказка «сначала назначьте второго»)""",
    """LAST_ADMIN          — понижение или удаление аккаунта последнего администратора —
                      409 (8.1; подсказка «сначала назначьте второго»)
CONFLICT            — обсуждение (16.1, §2.17): действие против состояния
                      строки — ответ в удалённую/скрытую ветку, правка
                      удалённого/скрытого комментария, повторная публикация,
                      правка или замечание у отозванной рецензии, удаление
                      опубликованной — 409; один код, причина — в error""",
    "C4 03 §4.3: CONFLICT",
)

# ── D. 04 §4 — строка 16.1 ───────────────────────────────────────────────
patch(
    D04,
    """| `metaParentAllowed` в `packages/shared/utils/visibility.ts`;""",
    """| `capabilitiesFor`, `canEditSynthesis`, `canManageSynthesis`, `canDiscussSynthesis`, `loadCapabilities`, `capabilitiesOfRow` в `server/services/capabilities.ts`; `editGate` в `server/routes/edit-gate.ts` (вместо четырёх `ownerEditGate`, `ownerGate`, `ownerReadGate`); `categoryKey`/`edgeKey`/`thesisKey`/`termKey`/`subsectionKey`, `canonicalJson`, `contentHash`, `plainText`, `excerptOf`, `buildAddress`, `resolutionOf` в `packages/shared/utils/discussion-address.ts`; `loadAddressIndex`, `findTarget`, `addressOf`, `resolveAddress` в `server/services/discussion-address.ts`; комментарии/рецензии/редакции/замечания/сводка в `server/services/discussion.ts`, маршруты `server/routes/discussion.ts` (03 §2.17); миграция `0017_discussion` (пять таблиц); shared `constants/discussion.ts`, `types/discussion.ts` (`Capabilities`, `DiscussionAddress`, `Comment`, `Review` …); `SynthesisFull.capabilities` | НОВОЕ (16.1; в исходнике социального слоя нет): один модуль прав (edit = владелец до 17.1), участник читает любую ступень, устойчивые адреса (вид + ключ + id + хэш; current/outdated/deleted при чтении), плоские ветки, редакции рецензий, «удалённый пользователь» |
| `metaParentAllowed` в `packages/shared/utils/visibility.ts`;""",
    "D 04 §4: строка 16.1",
)

# ── E. 05 — файлы ─────────────────────────────────────────────────────────
patch(
    D05,
    """│       │   ├── phil-filename.ts        # PHIL_FILENAME (PHIL_FILENAME)
""",
    """│       │   ├── phil-filename.ts        # PHIL_FILENAME (PHIL_FILENAME)
│       │   ├── discussion.ts           # 16.1: MEMBER_ROLES/STATUSES, ADDRESS_KINDS/STATES, COMMENT_KINDS/
│       │   │                           #  STATUSES, REVIEW_STATUSES, REVIEW_TEXT_FIELDS, пределы текстов и страниц
""",
    "E1 05: shared/constants/discussion.ts",
)
patch(
    D05,
    """│       │   ├── lineage.ts              # LineageNode, ParticipantInput
""",
    """│       │   ├── lineage.ts              # LineageNode, ParticipantInput
│       │   ├── discussion.ts           # 16.1: Capabilities, SynthesisRole, DiscussionAddress/Resolution,
│       │   │                           #  Comment*, Review*, ReviewRevision, ReviewFinding, DiscussionSummary
""",
    "E2 05: shared/types/discussion.ts",
)
patch(
    D05,
    """│           └── visibility.ts           # 8.6: effectiveFlags(row) — ОДНА функция действенности""",
    """│           ├── discussion-address.ts   # 16.1: ключи адресов (categoryKey, edgeKey, thesisKey, termKey,
│           │                           #  subsectionKey), canonicalJson → sha256 contentHash, plainText,
│           │                           #  excerptOf, buildAddress, resolutionOf (current|outdated|deleted)
│           └── visibility.ts           # 8.6: effectiveFlags(row) — ОДНА функция действенности""",
    "E3 05: shared/utils/discussion-address.ts",
)
patch(
    D05,
    """│   │       │                           #  edition (DEFAULT 1), UNIQUE (family, edition); рукой, снимок генератом
│   │       └── meta/""",
    """│   │       │                           #  edition (DEFAULT 1), UNIQUE (family, edition); рукой, снимок генератом
│   │       ├── 0017_discussion.sql     # 16.1: synthesis_members, comments, reviews, review_revisions,
│   │       │                           #  review_findings (CASCADE по синтезу, author_id SET NULL); drizzle-kit,
│   │       │                           #  тег переименован
│   │       └── meta/""",
    "E4 05: миграция 0017",
)
patch(
    D05,
    """│   │   ├── elements.ts                 # GET/PATCH categories, theses, glossary
""",
    """│   │   ├── elements.ts                 # GET/PATCH categories, theses, glossary
│   │   ├── edit-gate.ts                # 16.1: editGate(c, id, userId, { activeOp? }) — ОДИН гейт правки
│   │   │                               #  (404 до БД → 404 → 403 по capabilities.edit → 409) вместо четырёх
│   │   │                               #  ownerEditGate, ownerGate, ownerReadGate (= activeOp: false)
│   │   ├── discussion.ts               # 16.1: 18 маршрутов /syntheses/:id/comments|reviews|discussion/summary
│   │   │                               #  (03 §2.17) под requireAuth + discussGate (404 → 403 по discuss);
│   │   │                               #  hide/unhide — manage; DiscussionError → 400/403/404/409
""",
    "E5 05: routes/edit-gate.ts, routes/discussion.ts",
)
patch(
    D05,
    """│   │   ├── edit-planner.ts             # createPlan, updatePlan, addCascadeSteps
""",
    """│   │   ├── edit-planner.ts             # createPlan, updatePlan, addCascadeSteps
│   │   ├── capabilities.ts             # 16.1: ЕДИНСТВЕННОЕ сравнение «владелец ли это» (isOwner);
│   │   │                               #  capabilitiesFor(row, userId, membership) → { read, discuss, edit,
│   │   │                               #  manage, role }; editCapability = owner (17.1 меняет здесь);
│   │   │                               #  canEdit/canManage/canDiscussSynthesis, loadMembership,
│   │   │                               #  loadCapabilities, capabilitiesOfRow
│   │   ├── discussion-address.ts       # 16.1: индекс адресуемых объектов концепции (loadAddressIndex —
│   │   │                               #  разделы, категории, рёбра, тезисы, термины, max element_versions;
│   │   │                               #  подразделы лениво через html-parser), findTarget (id → ключ),
│   │   │                               #  addressOf, resolveAddress; только чтение
│   │   ├── discussion.ts               # 16.1: комментарии (плоские ветки, курсор, resolve/hide, мягкое
│   │   │                               #  удаление), рецензии (draft → publish → редакции → withdraw),
│   │   │                               #  замечания, сводка по адресам; plainText; автор «удалённый
│   │   │                               #  пользователь» по анонимизированному email 7.1; в документ не пишет
""",
    "E6 05: services/capabilities.ts, discussion-address.ts, discussion.ts",
)
patch(
    D05,
    """│   │   │                               # 8.1: заслон LAST_ADMIN, строка account.deleted, actor_id → NULL
│   │   ├── admin-audit.ts""",
    """│   │   │                               # 8.1: заслон LAST_ADMIN, строка account.deleted, actor_id → NULL
│   │   │                               # 16.1: synthesis_members снимаются явно; комментарии/рецензии остаются
│   │   ├── admin-audit.ts""",
    "E7 05: account-deletion 16.1",
)
patch(
    D05,
    """    │                                   # smoke-154-request1 — 15.4: экономика одной функцией, схема/0016, сид без""",
    """    │                                   # smoke-161-request1 — 16.1: матрица прав (capabilitiesFor), ключи и хэши
    │                                   #  адресов, plainText/excerpt, сравнения владельца только в белом списке,
    │                                   #  журнал 0017; живьём через app.request (импорт sample/ владельцем):
    │                                   #  владелец/рецензент/редактор/приглашённый/чужой/гость на private, full,
    │                                   #  showcase; участник не правит (403); 401/403/404 обсуждения; комментарии,
    │                                   #  ветки, курсор, статусы, скрытие, удаление с заглушкой; адреса
    │                                   #  outdated → saveGraphToDb → current с новым id → deleted; ребро, тезис;
    │                                   #  рецензии/редакции/отзыв/сводка; deleteAccount участника; каскад синтеза
    │                                   # smoke-154-request1 — 15.4: экономика одной функцией, схема/0016, сид без""",
    "E8 05: smoke-161",
)
patch(
    D05,
    """на беседу, patch-docs-conv<NNN>.py; последний — conv154)""",
    """на беседу, patch-docs-conv<NNN>.py; последний — conv161)""",
    "E9 05: последний патч — conv161",
)

# ── F. NEXT-CONTEXT ──────────────────────────────────────────────────────
patch(
    NXT,
    """## Состояние на 2026-11-05, вечер (заведены Фазы 16 и 17; ближайшая — 16.1)
""",
    """## Состояние на 2026-11-08 (16.1 — ПЕРВЫЙ ЗАПРОС ИСПОЛНЕН; тестовые запросы и завершение впереди)

**16.1 (адреса, участники и права, комментарии и рецензии — бэкенд): код
первого запроса (пп. 0–8) на месте, «По факту 16.1 (первый запрос)» в 07.**
Инварианты с 16.1: «владелец ли это» решает ОДИН модуль
`server/services/capabilities.ts` (`capabilitiesFor` → `{ read, discuss,
edit, manage, role }`; `editCapability = owner` — 17.1 меняет только её);
гейт правки один — `routes/edit-gate.ts: editGate` (прежние `ownerEditGate`
×4, `ownerGate`, `ownerReadGate` сняты; 4bm запрещает прямые сравнения
вне модуля, белый список — авторство плана и запуска, PaymentIntent);
активный участник (`synthesis_members`, reviewer | editor) читает
концепцию на любой ступени (`viewer 'user'`, `scope 'full'`) и обсуждает,
но не правит; `SynthesisFull.capabilities` рядом с `isOwner`. Адреса —
`packages/shared/utils/discussion-address.ts` (вид + ключ + id + sha256
канонического содержимого + версия; состояние current | outdated | deleted
вычисляется при чтении `resolveAddress`, объект после пересоздания
находится по ключу). Обсуждение (`services/discussion.ts`,
`routes/discussion.ts`, 03 §2.17; 02 §2.33–2.37): плоские ветки, мягкое
удаление корня с ответами, скрытие владельцем, рецензии draft → publish
(редакция 1) → правка = новая редакция → withdraw; сводка по адресам;
тексты — `plainText`, без HTML; код `CONFLICT` 409; «удалённый
пользователь» по анонимизированному email. Удаление аккаунта снимает
`synthesis_members` явно. **Сторож 2bb/4bm/5aw ЗАНЯТ (следующая серия —
2bc/4bn/5ax); миграция 0017 ЗАНЯТА (следующая — 0018)**; 40 ключей
`server.discussion.*` — черновики en/de (снимает пользователь); смоук
`tests/smoke-161-request1.mjs` 58 ✓; INTEGRATION OK. Клиент не тронут,
кроме типа `ApiErrorCode` += `CONFLICT` (интерфейс — 16.3). Дальше по 07: тестовые запросы
16.1 (права живьём, адреса, комментарии/рецензии), завершение (`typecheck`,
`check:integration` на свежем клоне, ревью TODO), доки — части II/III
`patch-docs-conv161.py`.

## Состояние на 2026-11-05, вечер (заведены Фазы 16 и 17; ближайшая — 16.1)
""",
    "F NEXT-CONTEXT: первый запрос 16.1 исполнен",
    marker="Сторож 2bb/4bm/5aw ЗАНЯТ",  # есть и в блоке 11-08, и в блоке закрытия (часть III)
)

patch(
    NXT,
    """15.4 — 0016 `plan_editions` (family/edition); следующая — 0017), единственный""",
    """15.4 — 0016 `plan_editions` (family/edition); 16.1 — 0017 `discussion` (+ synthesis_members, comments, reviews, review_revisions, review_findings — 37 таблиц); следующая — 0018), единственный""",
    "F2 NEXT-CONTEXT: универсальный минимум — 0017, 37 таблиц",
)

# ── G. 09 §3 — уроки 16.1 ────────────────────────────────────────────────
patch(
    D09,
    """2. **Значение колонки jsonb проверять по форме при чтении**: незнакомый код
   отбрасывать, а не показывать — строку могла записать более новая версия.

## 4. Тесты, харнессы, браузер""",
    """2. **Значение колонки jsonb проверять по форме при чтении**: незнакомый код
   отбрасывать, а не показывать — строку могла записать более новая версия.

### Беседа 16.1 — курсор по времени, Date в sql``, индекс адресов

1. **Курсор страницы «(created_at, id) > (ts, id)» с датой из JS теряет
   микросекунды**: `timestamptz` хранит `…:39.461287`, `Date` отдаёт
   `…:39.461` — строка курсора проходит условие «>» снова и повторяется на
   следующей странице (smoke-161 B4g). Курсор — id последней строки,
   сравнение кортежем **в PG**: `(created_at, id) > (select created_at, id
   from t where id = $cursor)`.
2. **`sql\\`\\`` drizzle с `Date` в параметре падает в postgres.js**
   (`ERR_INVALID_ARG_TYPE … Received an instance of Date` при Bind):
   операторы `gt`/`eq` по колонке `timestamp` кодируют дату сами, сырой
   шаблон — нет. Даты — только через операторы drizzle либо строкой ISO.
3. **`findTarget` по одному id не ищет по ключу** — ключа в цели нет; это
   `resolveAddress` падает с id на ключ, потому что адрес несёт оба.
   Сторож переразрешения проверять через `resolveAddress`/`getComment`, а
   «старый id + ключ» — отдельной строкой (5aw).
4. **Выдержка `≤ N` с многоточием — резать до `N − 1`**: `slice(0, N) + "…"`
   даёт N + 1 (A8 смоука поймал).
5. **Новые ключи `common.*` заводить только для строк из трёх и более
   мест** (README i18n): `i18n:export` принимает любой ключ молча, и
   «обязательное поле» в одном сервисе уехало в `common.requiredField` —
   возвращено в `server.discussion.*` с `--prune` (снимает obsolete целиком
   — перед ним убедиться, что других obsolete нет: «удалено 2»).

## 4. Тесты, харнессы, браузер""",
    "G 09 §3: уроки 16.1",
    marker="### Беседа 16.1 — курсор по времени",
)

print("ЧАСТЬ II — тестовые запросы 2–4 16.1")

FACT_161_R24 = """
**По факту 16.1 (тестовые запросы 2–4 — 2026-11-08, одним заходом).**
Харнесс `tests/test-161-requests2-4.mjs` — живой сервер :3000 + мок Claude
в процессе харнесса (перегенерация раздела отдаёт заданный HTML: так граф и
тезисы пересоздаются с новыми id без модели) + живой импорт образца
`sample/`; браузер не нужен (клиент не тронут). **61 ✓ ×2.**

- **R2 (права живьём).** Шесть смотрящих (владелец, рецензент, редактор,
  приглашённый `invited`, чужой зарегистрированный, гость) × три ступени,
  по четырём маршрутам (`GET /:id`, `/sections`, `/categories`,
  `/comments`). private: владелец всё; рецензент и редактор — концепция
  целиком и обсуждение, `isOwner=false`, `edit=false`; приглашённый и
  чужой — 403 везде; гость — 403 документ, 401 на `requireAuth`. showcase:
  чужой — шапка (`role: reader`, `read`, без `discuss`), содержание и
  обсуждение 403; участник — целиком; гость — шапка (`role: guest`). full:
  чужой читает концепцию, обсуждение 403 и рецензию не создаёт; гость —
  документ одним ответом, обсуждение 401. Рецензент приватной комментирует
  категорию по имени; чужой по прямому id комментария (PATCH/DELETE/
  resolve/hide), список, сводка, рецензии — 403; **id комментария под
  СВОИМ синтезом чужого — 404** (объекты обсуждения ищутся только в
  родительском синтезе), комментарий цел. Прочие маршруты: рецензент,
  редактор и чужой — PATCH категории/синтеза, DELETE, duplicate,
  рекомендации, lineage link, перегенерация → 403; логи приватной —
  по флагам 8.6 (участнику 403, владельцу 200); владелец — как до беседы
  (200/201). Копия синтеза — без участников и обсуждения; выгрузка HTML —
  без текстов комментариев. Регресс 13.2/15.x: smoke-132 42 ✓, test-132
  38 ✓, smoke-151 24 ✓, test-151 42 ✓, smoke-152 44 ✓, test-152 75 ✓
  (с браузером R5), smoke-153 34 ✓, test-153 51 ✓ (с браузером), smoke-154
  47 ✓, test-154 49 ✓ (с браузером) — Chrome 131 собран из `chrome/`.
  Починены два харнесса, упавшие не из-за 16.1: test-151 R3(б) снимал
  «последнюю запись журнала drizzle», считая её 0014 (с 15.3 это не так —
  урок 09 §2, 9.1), теперь применяет файл `0014_lineage_parent_unique.sql`
  через `psql` на копии и журнал не трогает; smoke-154 A7 требовал «журнал
  = 17» → «≥ 17, 0016 на месте 17».
- **R3 (адреса).** Пять адресов одной концепции: категория (по имени),
  связь (`src→tgt|type`), тезис (`label`), подраздел (`sum:имя`), раздел
  `graph`. Перегенерация графа на моке с ИЗМЕНЁННЫМ определением
  категории: категория и связи пересозданы (новые id); комментарий к
  категории — `outdated` (`currentId` новый, в адресе прежний id и хэш);
  к связи — `current` с новым `currentId` (найдена по ключу); к разделу —
  `outdated` (id раздела прежний — upsert); тезис и подраздел не задеты.
  Перегенерация с ПРЕЖНИМ текстом: категория снова с новым id, адрес
  `current` (хэш сошёлся), раздел `current`. Перегенерация `theses` прежним
  текстом: тезис с новым id найден по метке. `DELETE /categories/:id` →
  `deleted`, комментарий на месте. Ручная правка подраздела (`PATCH
  …/subsections/:name`, тело — внутреннее содержимое без `<h4>` и
  `data-section`) → `outdated`, **выдержка показывает прежний текст**;
  новый комментарий к нему — `current` с новым хэшем и новой выдержкой.
  Сводка считает по ключу адреса и у удалённого объекта.
- **R4 (комментарии и рецензии по HTTP).** Ветка: два ответа наследуют
  адрес, `replyCount 2`, ответ на ответ 400; правка — автор (edited,
  kind), другой участник и владелец 403; resolve — другой участник 403,
  владелец и автор — да, у ответа 400, автор переоткрывает; скрытие —
  только владелец, третьему тело пусто с `hidden`, автору и владельцу
  видно, правка скрытого 409, решённый корень после hide/unhide остаётся
  resolved; удаление — владелец чужое 403, ответ исчезает, корень с
  ответами — заглушка, ответ в удалённую ветку 409. Рецензия: черновик
  виден только автору (владельцу 404, рецензенту пусто); замечания с
  адресами (позиции 1, 2; нет объекта 404; чужой к черновику 404);
  публикация — редакция 1 со снимком, версия документа текущая; правки
  опубликованной — редакции 2, 3, 4, редакция 1 сохранена; владелец чужую
  не правит, опубликованную не удалить, повторная публикация 409; отзыв —
  видна с пометкой, не правится, из сводки ушла; повторная публикация
  отозванной — редакция 5. Тексты: разметка хранится как текст, длиннее
  предела и пустое — 400 с `details`. `DELETE /auth/me` автора: членство
  снято, комментарии и рецензия с замечанием остались под «удалённый
  пользователь» (de: «gelöschter Benutzer» — фраза на языке запроса),
  сессия мертва; удаление синтеза — каскад (комментарии, рецензии,
  редакции, замечания, участники).
- **Сверка доков после сжатия контекста** (сжатие пришлось на пп. 4–6
  первого запроса; код и сторожа перепроверены прогонами): 01
  «Авторизация ресурсов» не знала участников и модуля прав — дописано;
  03 §2.16 поминал `ownerEditGate` — `editGate`; deploy/* (четыре файла)
  считали миграций семнадцать — восемнадцать (0000…0017), сторож 4bm
  держит; текст 16.1 в 07 («ownerEditGate ×3») оставлен историей — факт
  (×4) в «По факту». 40 переводов `server.discussion.*` **утверждены**
  (`i18n:import` без `--draft`; черновиков 0).
"""

patch(
    D07,
    """   обсуждения не в выгрузках и не в копии синтеза.

---

### Беседа 16.2:""",
    """   обсуждения не в выгрузках и не в копии синтеза.
""" + FACT_161_R24 + """
---

### Беседа 16.2:""",
    "H 07: «По факту 16.1 (тестовые запросы 2–4)»",
    marker="По факту 16.1 (тестовые запросы 2–4",
)

patch(
    "docs/01-architecture.md",
    """- Элементы синтеза наследуют доступ от синтеза; витрина невладельцу на
  контент-роутах → 403
""",
    """- Элементы синтеза наследуют доступ от синтеза; витрина невладельцу на
  контент-роутах → 403
- **Участники и один модуль прав (16.1).** `synthesis_members` (роли
  `reviewer` | `editor`, статус `invited` | `active`; приглашения — 16.2):
  активный участник читает концепцию целиком на ЛЮБОЙ ступени (и приватную,
  и витрину) и обсуждает; права на правку у редактора появляются в 17.1.
  «Владелец ли это» решает ОДИН модуль — `server/services/capabilities.ts`
  (`capabilitiesFor` → `{ read, discuss, edit, manage, role }`), гейт правки
  один — `routes/edit-gate.ts`; прямые сравнения с владельцем вне модуля
  запрещены сторожем 4bm. Обсуждение (комментарии, рецензии) не-участнику не
  показывается вовсе, даже на публичной концепции; доступ к любому объекту
  обсуждения — через родительский синтез на каждом запросе, не по знанию id.
  Документ обсуждением не меняется.
""",
    "I 01: авторизация ресурсов — участники и модуль прав",
)

patch(
    D03,
    """     409 GENERATION_IN_PROGRESS — активная операция (ownerEditGate, как правка 9.2).""",
    """     409 GENERATION_IN_PROGRESS — активная операция (editGate, как правка 9.2;
     до 16.1 — ownerEditGate).""",
    "J 03 §2.16: editGate",
)

patch(
    D05,
    """    │                                   # smoke-161-request1 — 16.1: матрица прав (capabilitiesFor), ключи и хэши""",
    """    │                                   # test-161-requests2-4 — 16.1: живой сервер + мок Claude в процессе (перегенерация
    │                                   #  раздела отдаёт заданный HTML); R2 права шести смотрящих × три ступени, прямой
    │                                   #  id комментария и id под чужим синтезом, прочие маршруты, копия/выгрузка без
    │                                   #  обсуждения; R3 адреса — перегенерация графа (изменённое/прежнее определение),
    │                                   #  theses, удаление, ручная правка подраздела (выдержка прежняя); R4 ветки,
    │                                   #  статусы, скрытие, удаление, рецензии/редакции/отзыв, DELETE /auth/me, каскад
    │                                   # smoke-161-request1 — 16.1: матрица прав (capabilitiesFor), ключи и хэши""",
    "K1 05: test-161-requests2-4",
)

patch(
    NXT,
    """`tests/smoke-161-request1.mjs` 58 ✓; INTEGRATION OK. Клиент не тронут,
кроме типа `ApiErrorCode` += `CONFLICT` (интерфейс — 16.3). Дальше по 07: тестовые запросы
16.1 (права живьём, адреса, комментарии/рецензии), завершение (`typecheck`,
`check:integration` на свежем клоне, ревью TODO), доки — части II/III
`patch-docs-conv161.py`.""",
    """`tests/smoke-161-request1.mjs` 58 ✓; INTEGRATION OK. Клиент не тронут,
кроме типа `ApiErrorCode` += `CONFLICT` (интерфейс — 16.3). **Тестовые
запросы 2–4 исполнены 2026-11-08** (`tests/test-161-requests2-4.mjs` 61 ✓
×2; регресс 13.2/15.x зелёный, два чужих харнесса починены — test-151
R3(б), smoke-154 A7); 40 переводов утверждены (черновиков 0); deploy/* —
миграций восемнадцать (0000…0017). Дальше по 07: завершение беседы
(`typecheck`, `check:integration` на свежем клоне, ревью TODO), доки —
часть III `patch-docs-conv161.py`.""",
    "L NEXT-CONTEXT: тестовые запросы исполнены",
    marker="## Состояние на 2026-11-09 (16.1 ЗАКРЫТА",  # часть III заменила блок целиком
)

patch(
    D09,
    """   снимок вкладки — часть браузерного теста.

## 5. Node, TypeScript, сборка""",
    """   снимок вкладки — часть браузерного теста.

### Беседа 16.1 — «последняя миграция» в харнессе, мок перегенерации, тело подраздела
1. **Харнесс, снимающий «последнюю запись журнала drizzle» как откат
   миграции N, живёт до следующей миграции**: test-151 R3(б) (15.1) считал
   последней 0014 и с 15.3 падал на повторе 0015+ (CREATE уже есть). Это та
   же грабля, что 09 §2 (9.1) для сторожей. Откат одной миграции на копии
   БД — применять её ФАЙЛ `psql -v ON_ERROR_STOP=1 -f`, журнал не трогать.
   smoke-154 A7 «журнал = 17» — тот же класс; писать «≥ N и тег на месте».
2. **Перегенерация «на моке» без модели** — мок Claude харнесса отдаёт на
   раздел его же `html_content` (или его правку): проход генерации делает
   `saveGraphToDb`/`saveElementsToDb` по-настоящему (DELETE + INSERT, новые
   id), а содержимое управляемо — ровно то, что нужно адресам.
3. **`PATCH …/subsections/:name` принимает ВНУТРЕННЕЕ содержимое подраздела**:
   обёртка `data-section` и `<h4>` в теле — 400 (anchor/heading). Харнесс,
   собравший подраздел целиком «как мок», получил 400 и час выглядел как
   ошибка сервиса.
4. **Валидация тела идёт до проверки прав** у `POST /lineage/link` (400 на
   пустом `parentName` раньше 403 чужому) — паритет гейтов проверять
   корректным телом.

## 5. Node, TypeScript, сборка""",
    "M 09 §4: уроки харнессов 16.1",
    marker="### Беседа 16.1 — «последняя миграция» в харнессе",
)

print("ЧАСТЬ III — завершение 16.1")

FACT_161_END = """
**По факту 16.1 (завершение — 2026-11-09).** Ревью TODO и заглушек: в
файлах беседы новых меток нет; единственная сознательная «заглушка» —
`editCapability(owner, role)` в `capabilities.ts` возвращает `owner`
(точка, которую меняет 17.1; сторож 4bm держит её такой до тех пор).
Завершение: `typecheck` 0 ошибок, `vite build`, `check:dotfiles`,
`i18n:check --strict` (черновиков 0), `audit`, `check:integration`
INTEGRATION OK на свежем клоне (копия дерева без `.git`/`node_modules`,
настоящий `npm install`; 2bb/4bm/5aw); smoke-161 58 ✓, test-161 61 ✓ ×2;
регресс 13.2/15.x зелёный. Новых долгов и ограничений беседа не оставила
(реестр §12 по-прежнему пуст). Вся беседа — одним коммитом по просьбе
пользователя. Ближайшая — 16.2 (серия сторожей 2bc/4bn/5ax, миграция —
следующая свободная, 0018).
"""

patch(
    D07,
    """  (`i18n:import` без `--draft`; черновиков 0).

---

### Беседа 16.2:""",
    """  (`i18n:import` без `--draft`; черновиков 0).
""" + FACT_161_END + """
---

### Беседа 16.2:""",
    "N 07: «По факту 16.1 (завершение)»",
    marker="По факту 16.1 (завершение",
)
patch(
    D07,
    """> клиент обсуждения и рецензий. Миграции — номер следующий свободный на
> момент беседы.

---""",
    """> клиент обсуждения и рецензий. Миграции — номер следующий свободный на
> момент беседы.
>
> **16.1 закрыта 2026-11-09** (миграция 0017 `discussion`; сторож
> 2bb/4bm/5aw; новых долгов нет). Ближайшая — 16.2.

---""",
    "O 07: врезка «Фаза 16» — 16.1 закрыта",
)
patch(
    D07,
    """   При закрытии 15.4 (2026-11-05) сняты Д-74, Д-75 (в 08 Часть IV); новых
   долгов и ограничений нет, строк «не назначен» нет; реестр пуст —
   Фаза 15 закрыта.
""",
    """   При закрытии 15.4 (2026-11-05) сняты Д-74, Д-75 (в 08 Часть IV); новых
   долгов и ограничений нет, строк «не назначен» нет; реестр пуст —
   Фаза 15 закрыта.
   При закрытии 16.1 (2026-11-09) новых долгов и ограничений нет, строк
   «не назначен» нет; реестр пуст.
""",
    "P 07 §12: журнал — закрытие 16.1",
)
patch(
    "docs/08-history.md",
    """patch-docs-conv154.py (три части); запланированных бесед нет.
""",
    """patch-docs-conv154.py (три части); запланированных бесед нет.
Беседа 16.1 (адреса, участники и права, комментарии и рецензии — сервер
основы обсуждения; Фаза 16) ЗАКРЫТА 2026-11-09. Миграция 0017
(`synthesis_members`, `comments`, `reviews`, `review_revisions`,
`review_findings`); один модуль прав `services/capabilities.ts`
(единственное сравнение с владельцем; `editCapability = owner` до 17.1) и
один гейт `routes/edit-gate.ts` вместо четырёх `ownerEditGate`,
`ownerGate`, `ownerReadGate`; участник читает концепцию на любой ступени
и обсуждает, `SynthesisFull.capabilities`; устойчивые адреса (вид + ключ +
id + sha256 канонического содержимого + версия; current/outdated/deleted
при чтении, после пересоздания объект находится по ключу); комментарии
(плоские ветки, resolve/hide, мягкое удаление), рецензии (draft → publish
→ редакции → withdraw), замечания, сводка; тексты — `plainText` без HTML;
код `CONFLICT`; удаление аккаунта снимает участие, «удалённый
пользователь». 40 ключей (утверждены), сторож 2bb/4bm/5aw, smoke-161
58 ✓, test-161 61 ✓ ×2; регресс 13.2/15.x (два чужих харнесса починены);
сверка после сжатия контекста закрыла 01/03/deploy; доки —
patch-docs-conv161.py (три части); долгов нет; ближайшая — 16.2.
""",
    "Q1 08 Часть I: строка 16.1",
)

CH_161 = """### Беседа 16.1 — Адреса, участники и права, комментарии и рецензии (сервер основы обсуждения) [ЗАКРЫТА 2026-11-09]

**Вход:** HEAD 1a42224, `check:dotfiles` чист, `npm install` в самом клоне,
PG 16 и Redis в песочнице (миграции 0000–0017, сиды), Chrome 131 собран из
`chrome/` для регресса. Первая беседа Фазы 16 по врезке «Фаза 16» и
решениям пользователя 2026-11-05 (только приглашённые участники; реакций
нет — вид комментария; обсуждение не меняет документ; квоту расходует
нажавший — 17). Требования пользователя: первый ход — перечень мест
«владелец ли это» и мест пересоздания элементов; права одним модулем при
побайтно прежнем поведении владельца и чужих; редактору прав не давать;
тексты обсуждения — обычный текст без HTML; недостающее — строкой §12, а
не ad-hoc; новые строки `tl()` с черновиками en/de; один протокольный
запрос за раз; доки править там, где нужно беседе.

**Ход.** П.0: `ownerEditGate` — четыре копии (не три), `ownerGate` +
встроенная проверка `/subsection-impact`, `ownerReadGate`, ws ×4, сервисы
(`edit-planner`, `pause-resume`, `generation-service`), роуты `plans`,
`lineage` ×4, `syntheses`; не владение — автор плана (`plan-executor`,
`edit-planner.loadPlanRow`), `activeRuns` (кто запустил), metadata
PaymentIntent; клиентский `isOwner` перечислен, не тронут. Пересоздание
элементов: `saveGraphToDb`, `saveElementsToDb`, `rollbackTransform`,
`deleteSection`, `element-editor`, `POST /edges`, `duplicate`; id разделов
устойчивы (upsert). Решения с доводом: `capabilitiesFor` → `{ read,
discuss, edit, manage, role }`, `editCapability = owner` (17.1 меняет
только её); `editGate(c, id, userId, { activeOp? })` с прежним порядком
404 → 404 → 403 → 409; участник — `viewer 'user'`, `scope 'full'` на любой
ступени (логи — по флагам 8.6); адрес — `kind + key + id + hash +
version`, хэш `sha256(canonicalJson(payload))` (у synthesis пуст),
состояние вычисляется `resolveAddress` (id → ключ → deleted); плоские
ветки (`parent_id` — корень), статус у корня, мягкое удаление корня с
ответами, скрытие статусом `hidden` с телом только автору и владельцу;
рецензии `draft → published → withdrawn`, `review_revisions` при
публикации и при каждой правке опубликованной; чужой черновик — 404;
один код `CONFLICT` 409; «удалённый пользователь» по анонимизированному
email 7.1, фраза на языке запроса; `synthesis_members` при удалении
аккаунта снимаются явно. Сервер: `services/capabilities.ts`,
`routes/edit-gate.ts`, `services/discussion-address.ts`,
`services/discussion.ts`, `routes/discussion.ts` (18 маршрутов под
`requireAuth` + `discussGate`), миграция `0017_discussion`; shared —
`constants/discussion.ts`, `types/discussion.ts`,
`utils/discussion-address.ts`, `SynthesisFull.capabilities`; `audit.mts`
знает поле; клиентский `ApiErrorCode` += `CONFLICT` (тип). Сторож
2bb/4bm/5aw (5aw — живьём на образце: права, outdated → saveGraphToDb →
current с новым id, черновик 404, редакции, удаление аккаунта, документ
побайтно цел, каскад); старые сторожа 4as/4u/4ab/4ad/4af/4ai/4an/4ar/4bb/
4bi/4bj/4ac/4x/4bl/4bk переписаны под новые имена. Сверка после сжатия
контекста (пришлось между п.3 и п.4 первого запроса): код против врезки
«Фаза 16» и текста 16.1 — расхождений нет; доки — 01 «Авторизация
ресурсов» (участники, модуль прав), 03 §2.16 (`editGate`), deploy/* ×4
(миграций восемнадцать), NEXT-CONTEXT («Универсальный минимум»). 40
ключей `server.discussion.*` утверждены.

**Тесты.** smoke-161 58 ✓ (чистые функции, исходники, живьём через
`app.request`: матрица прав на трёх ступенях, паритет гейта правки,
комментарии/ветки/курсор/статусы/скрытие/удаление, адреса
outdated/current/deleted, рецензии/редакции/отзыв, сводка, удаление
аккаунта и синтеза); test-161-requests2-4 61 ✓ ×2 (живой сервер + мок
Claude в процессе: R2 шесть смотрящих × три ступени, прямой id и id под
чужим синтезом, прочие маршруты; R3 перегенерация графа с изменённым и
прежним определением, theses, удаление, ручная правка подраздела с
прежней выдержкой; R4 ветки, статусы, скрытие, удаление, рецензии,
`DELETE /auth/me`, каскад). Регресс 13.2/15.x: smoke-132 42, test-132 38,
smoke-151 24, test-151 42, smoke-152 44, test-152 75, smoke-153 34,
test-153 51, smoke-154 47, test-154 49 — два чужих харнесса починены
(test-151 R3(б) ждал «последняя миграция — 0014»; smoke-154 A7 «журнал =
17»).

**Завершение.** Регрессия на свежем клоне зелёная; новых долгов нет;
доки — `patch-docs-conv161.py` (три части); один коммит. Ближайшая —
16.2.

"""

patch(
    "docs/08-history.md",
    """### Беседа 15.4 — Тарифы: админка редакциями и согласие подписки с тарифом (бэкенд + клиент) [ЗАКРЫТА 2026-11-05 — Фаза 15 закрыта]""",
    CH_161 + """### Беседа 15.4 — Тарифы: админка редакциями и согласие подписки с тарифом (бэкенд + клиент) [ЗАКРЫТА 2026-11-05 — Фаза 15 закрыта]""",
    "Q2 08 Часть II: глава 16.1",
    marker="### Беседа 16.1 — Адреса, участники и права",
)

patch(
    "README.md",
    """участники по приглашению и права, устойчивые адреса, комментарии, рецензии, уведомления; после Фазы 15 |""",
    """участники по приглашению и права, устойчивые адреса, комментарии, рецензии, уведомления; после Фазы 15. 16.1 (миграция 0017: участники, комментарии, рецензии, редакции, замечания; один модуль прав `capabilities.ts` и один гейт правки; устойчивые адреса; сервер обсуждения — 18 маршрутов) — закрыта 11-09 |""",
    "R README: строка Фазы 16 — 16.1 закрыта",
)

# NEXT-CONTEXT: состояние и комплект — перезапись блоков по границам
def replace_span(rel: str, start: str, end: str, new: str, label: str, marker: str) -> None:
    global applied, skipped, failed
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    if marker in text:
        skipped += 1
        print(f"  skip  {label}")
        return
    i = text.find(start)
    j = text.find(end, i + 1) if i >= 0 else -1
    if i < 0 or j < 0:
        failed += 1
        print(f"  fail  {label}: границы не найдены")
        return
    path.write_text(text[:i] + new + text[j:], encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")

STATE_161 = """## Состояние на 2026-11-09 (16.1 ЗАКРЫТА 2026-11-09; Фаза 16 открыта; ближайшая — 16.2)

**16.1 (адреса, участники и права, комментарии и рецензии — бэкенд)
ЗАКРЫТА 2026-11-09.** Новых долгов и ограничений нет; реестр §12 пуст.
Инварианты с 16.1: «владелец ли это» решает ОДИН модуль
`server/services/capabilities.ts` (`capabilitiesFor` → `{ read, discuss,
edit, manage, role }`; `editCapability = owner` — **17.1 меняет только
её**); гейт правки один — `routes/edit-gate.ts: editGate` (сторож 4bm
запрещает прямые сравнения с владельцем вне модуля; белый список — автор
плана, кто запустил, PaymentIntent); активный участник
(`synthesis_members`, reviewer | editor, status active) читает концепцию
на любой ступени (`viewer 'user'`, `scope 'full'`; логи — по флагам 8.6)
и обсуждает, но не правит; `SynthesisFull.capabilities` рядом с
`isOwner`. Адреса — `packages/shared/utils/discussion-address.ts` (вид +
ключ + id + sha256 канонического содержимого + версия; состояние current
| outdated | deleted вычисляется `resolveAddress`, после пересоздания
объект находится по ключу; выдержка хранится на момент записи).
Обсуждение (`services/discussion.ts`, `routes/discussion.ts` — 18
маршрутов, 03 §2.17; таблицы 02 §2.33–2.37): плоские ветки, мягкое
удаление корня с ответами, скрытие владельцем, рецензии draft → publish
(редакция 1) → правка = новая редакция → withdraw, чужой черновик 404,
сводка по адресам; тексты — `plainText` без HTML; один код `CONFLICT`
409; «удалённый пользователь» по анонимизированному email, фраза на
языке запроса; удаление аккаунта снимает `synthesis_members` явно;
обсуждение не попадает в копию и выгрузки. **Сторож 2bb/4bm/5aw ЗАНЯТ
(следующая серия — 2bc/4bn/5ax); миграция 0017 ЗАНЯТА (следующая —
0018)**; 40 ключей `server.discussion.*` утверждены; smoke-161 58 ✓,
test-161 61 ✓ ×2; регресс 13.2/15.x зелёный (test-151 R3(б) и smoke-154
A7 починены — не считать «последнюю миграцию» фиксированной); Chrome 131
собирается из `chrome/` по README. Доки — `patch-docs-conv161.py` (три
части). Клиент не тронут (кроме типа `ApiErrorCode`): интерфейс
обсуждения — 16.3, участники/приглашения — 16.2.

"""

replace_span(
    NXT,
    "## Состояние на 2026-11-08 (16.1 — ПЕРВЫЙ ЗАПРОС ИСПОЛНЕН",
    "## Состояние на 2026-11-05, вечер",
    STATE_161,
    "S1 NEXT-CONTEXT: состояние — 16.1 закрыта",
    "## Состояние на 2026-11-09 (16.1 ЗАКРЫТА",
)

KIT_162 = """## Комплект ближайшей беседы — 16.2 (участники, приглашения, уведомления: бэкенд + клиент)

Сверх универсального минимума (по тексту 16.2 в 07 «Фаза 16»): врезка
«Фаза 16»; «По факту» 8.1, 9.1, 15.3, 16.1 (все три блока); `02`
(§2.33 `synthesis_members` и таблицы 16.1, `auth_tokens`, `mail_outbox`,
`users`), `03` (§2.17 маршруты 16.1, `/auth/*`), `04`, `05`, `01` §8
(оформление клиента). Сервер: модуль прав `services/capabilities.ts`
(`loadMembership`, `capabilitiesFor` — приглашение меняет `status`
`invited → active`; права участника — только у `active`), `routes/
edit-gate.ts`, `routes/discussion.ts` (образец гейта через синтез —
`discussGate`), `services/auth-tokens.ts` (`issueToken`, `consumeToken`;
новое назначение довода — CHECK миграцией рукой, 09 §3), `services/mail/
{outbox.ts,templates.ts,worker.ts}`, `routes/auth.ts`, `routes/
syntheses.ts` (каталог и фильтры; `loadSynthesisForRead` уже пускает
участника). Клиент: `SynthesisPage.tsx` (шапка; `capabilities` уже в
`SynthesisFull`), `CatalogPage.tsx`, `ProfilePage.tsx`, `VerifyEmailPage`/
`ChangeEmailPage` (страницы по ссылке из письма), `Header.tsx`,
`hooks/useSecondStep.ts`, `api/*`; дизайн-набор 5-6 (панель участников,
колокольчик). Харнессы-образцы: `tests/test-153-*` (почта живьём),
`tests/test-161-requests2-4.mjs` (мок Claude в процессе, права шести
смотрящих), `tests/test-124-requests2-8.mjs` (Chrome 131 на сборке).
Исходник не нужен. Серия сторожей — 2bc/4bn/5ax, миграция — 0018.
Напоминание: `.env.example` новых переменных сверять после выкладки
(dotfile-грабля ×3); браузер — только на СБОРКЕ клиента (vite build +
preview) и только Chrome 131 из `chrome/`.

## Беседа 16.1 (ЗАКРЫТА 2026-11-09) — что было комплектом

Первая беседа Фазы 16 — сервер основы обсуждения. Первый запрос —
2026-11-08 (пп. 0–8: сверка мест «владелец ли это» и пересоздания
элементов, миграция 0017, `capabilities.ts` + `edit-gate.ts`, реестр
адресов, комментарии, рецензии, сводка, обезличивание, сторож
2bb/4bm/5aw, smoke-161 58 ✓). Тестовые запросы 2–4 — 2026-11-08 одним
заходом (test-161-requests2-4 61 ✓ ×2; регресс 13.2/15.x; сверка после
сжатия контекста закрыла 01/03/deploy; переводы утверждены). Завершение
— 2026-11-09: регрессия на свежем клоне, долгов нет, один коммит.
Комплект был: врезка «Фаза 16» целиком; «По факту» 5.1, 8.6, 10.1, 12.1,
13.1, 13.2, 15.1, 15.2; `01`–`05`; все места «владелец ли это» и
пересоздания элементов; `html-parser.ts`; `account-deletion.ts`.

"""

replace_span(
    NXT,
    "## Комплект ближайшей беседы — 16.1 (адреса, участники и права, комментарии и рецензии: бэкенд)",
    "## Ближайшая беседа до 2026-11-05 — не была назначена",
    KIT_162,
    "S2 NEXT-CONTEXT: комплект 16.2; 16.1 — в историю",
    "## Комплект ближайшей беседы — 16.2",
)

patch(
    D09,
    """3. **15.4 — порядок пунктов в списке 09**: часть II вставила уроки
   харнесса якорем «перед пунктом 3» — получилось 1, 2, 4, 5, 6, 3.
   Якорь дописываемого списка — его последняя строка (или заголовок
   следующего раздела), а не «первый пункт, который попался».""",
    """3. **15.4 — порядок пунктов в списке 09**: часть II вставила уроки
   харнесса якорем «перед пунктом 3» — получилось 1, 2, 4, 5, 6, 3.
   Якорь дописываемого списка — его последняя строка (или заголовок
   следующего раздела), а не «первый пункт, который попался».
4. **16.1 — в четвёртый раз, другой механизм**: часть II правила ТЕКСТ
   блока состояния NEXT-CONTEXT, вставленного частью I (`patch` без
   `marker`); на следующем прогоне `new in text` стало ложным, якорь
   (заголовок прежнего состояния) по-прежнему один — блок вставился
   второй раз. Любая вставка блока, который позже дописывается, — с
   `marker` по его заголовку; проверка «применено 0» после каждого
   прогона (там и выплыло «применено 1»).""",
    "T 09 §2: урок патча 16.1",
)

print(f"\nИтог: применено {applied}, пропущено {skipped}, отказов {failed}")
sys.exit(1 if failed else 0)
