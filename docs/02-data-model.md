# PhiloSynth Service — Модель данных

> **Ревизия 2026-07-22**: схема дополнена под подсистемы v11 —
> pause/resume, селективный родительский контекст, режим бюджета,
> кардинальность/свободный синтез. Спецификации — 01-architecture, §4.12–4.15.

## 1. ER-диаграмма (текстовая)

```
users ─────────────┐
  │                 │
  ├── syntheses ────┤
  │     │           │
  │     ├── sections              (HTML-блоб + метаданные раздела)
  │     │     │
  │     │     ├── categories       (гранулярные элементы графа)
  │     │     ├── category_edges
  │     │     ├── theses
  │     │     ├── glossary_terms
  │     │     └── dialogue_turns
  │     │
  │     ├── synthesis_lineage     (граф наследования: parent ← child)
  │     ├── edit_plans
  │     │     └── edit_plan_steps
  │     ├── mode_results
  │     ├── generation_log
  │     └── context_log
  │
  ├── api_keys (encrypted)
  ├── transactions
  ├── api_usage
  ├── auth_tokens (одноразовые доводы из писем; CASCADE; 9.1;
  │                16.2: довод приглашения member_invite — на приглашающего,
  │                адрес в new_email, synthesis_id → syntheses CASCADE)
  ├── admin_audit (actor_id → users, SET NULL; 8.1)
  ├── notifications (16.2: получатель user_id CASCADE; actor_id SET NULL;
  │                  synthesis_id CASCADE; при 7.1 — снимаются явно)
  ├── notification_settings (16.2: user_id PK, CASCADE; при 7.1 — явно)
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

mail_outbox ───────── (очередь писем; с пользователем НЕ связана; 9.1)
  
prompt_templates ──── (глобальные, не привязаны к пользователю)
synthesis_configs ─── (глобальные)
```

## 2. Таблицы

### 2.1. users

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
  balance_usd   NUMERIC(10, 4) NOT NULL DEFAULT 0,
  stripe_customer_id TEXT UNIQUE,  -- 7.1 (миграция 0003): один Stripe Customer на пользователя,
                                   -- создаётся при первом topup/подписке (ensureStripeCustomer)
  email_verified_at TIMESTAMPTZ,   -- 9.1 (миграция 0006): NULL — адрес не подтверждён
  ui_locale     TEXT,              -- 11.2 (миграция 0010): язык интерфейса 'ru'|'en'|'de'
                                   -- (UI_LOCALES, shared/i18n/locales); NULL — не выбирал:
                                   -- язык запроса по cookie ui_locale и Accept-Language.
                                   -- Проверяется кодом, не CHECK (список растёт без миграции)
  gen_lang      TEXT,              -- 11.2 (миграция 0010): язык генерации по умолчанию
                                   -- (значение syntheses.lang). PATCH /auth/me {uiLocale}
                                   -- переписывает его правилом genLangForUi (интерфейс →
                                   -- генерация); {genLang} меняет только его. NULL — не выбирал
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> **7.1:** удаление аккаунта (`DELETE /auth/me`) НЕ удаляет строку — RESTRICT
> `api_usage`/`transactions.user_id` (§2.20–2.21) сохраняет финансовую
> историю; строка анонимизируется (email `deleted-<id>@deleted.invalid`,
> случайный password_hash, display_name/stripe_customer_id → NULL,
> role → 'user'); сессии, api_keys, syntheses удаляются, подписки → canceled.
>
> **8.1:** роли по-прежнему две (решение при заведении Фазы 8, 07 §8).
> Первый `admin` заводится только скриптом `scripts/bootstrap-admin.ts`
> (`npm run seed:admin`), дальнейшие — `POST /auth/users/:id/role`.
> Единственный администратор не может ни понизить себя (409
> SELF_ROLE_CHANGE — свою роль не меняет никто), ни удалить аккаунт (409
> LAST_ADMIN); проверки идут под `pg_advisory_xact_lock` в одной транзакции
> с действием. Поскольку строка users при удалении анонимизируется, а не
> удаляется, `admin_audit.actor_id … ON DELETE SET NULL` (§2.29) сам не
> срабатывает — `account-deletion` обнуляет `actor_id` строк этого
> пользователя явно, той же транзакцией: след действий остаётся,
> привязка к личности снимается.

> **9.1:** `email_verified_at` ставит переход по ссылке из письма — `POST
> /auth/email/verify/confirm` либо успешный `POST /auth/password-reset/confirm`
> (ссылка сброса пришла на тот же ящик). Колонка пока НЕ ограничивает ничего:
> у всех пользователей до 9.1 она пуста, и запрет входа вышвырнул бы их
> разом; решение о том, что закрывать неподтверждённым, — отдельное. При
> удалении аккаунта (7.1, анонимизация) доводы `auth_tokens` пользователя
> удаляются явно, той же транзакцией: CASCADE на живой строке не срабатывает
> (тот же урок, что `admin_audit.actor_id` 8.1).

### 2.2. sessions

```sql
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
```

Истёкшие строки снимаются при обращении (`middleware/auth.ts`) и, с 15.3
(Д-72), проходом чистки работника почты (`services/mail/maintenance.ts`,
§2.31) — иначе строки гостей, не вернувшихся за 30 дней, копились бы вечно.

### 2.3. syntheses

Центральная таблица. Каждая запись — один синтез.

```sql
CREATE TABLE syntheses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Параметры синтеза (аналог DOC_STATE.params)
  -- v11: участники (философы/концепции) ОПЦИОНАЛЬНЫ — 0 участников =
  -- свободный синтез из зерна (participantCardinality = 'none')
  seed             TEXT NOT NULL DEFAULT '',
  method           TEXT NOT NULL DEFAULT 'dialectical',
    -- 'dialectical'|'integrative'|'deconstructive'|'hermeneutical'|'analytical'|'creative'
  synth_level      TEXT NOT NULL DEFAULT 'comparative',
    -- 'comparative'|'transformative'|'generative'
  depth            TEXT NOT NULL DEFAULT 'standard',
    -- 'overview'|'standard'|'deep'|'exhaustive'
  generation_order TEXT NOT NULL DEFAULT 'architectural',
    -- 'architectural'|'genetic'
  ext_graph_metrics BOOLEAN NOT NULL DEFAULT false,  -- расширенные характеристики графа (v10)
  keep_full_budget  BOOLEAN NOT NULL DEFAULT false,  -- не ужимать бюджет секций под давлением родителей (v11, tz_budget_mode)
  context          TEXT NOT NULL DEFAULT '',  -- доп. контекст пользователя
  lang             TEXT NOT NULL DEFAULT 'Russian',
  
  -- Состояние
  title            TEXT NOT NULL DEFAULT 'Синтез Философской Концепции',
  doc_num          TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'draft',
    -- 'draft'|'generating'|'paused'|'ready'|'error'  -- 'paused' добавлен в v11
  -- Публичность (8.6, миграция 0005 — вместо булева is_public; перенос
  -- данных в той же миграции: is_public=true → 'full', иначе 'private'):
  visibility       TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private','showcase','full')),
    -- 'private'  — только владелец;
    -- 'showcase' — витрина: капсула, метаданные, философы, даты; тела
    --              разделов и элементы НЕ отдаются (контент-роуты → 403);
    -- 'full'     — произведение целиком.
  show_author      BOOLEAN NOT NULL DEFAULT false, -- имя автора (display_name);
                                                  -- действует на ОБЕИХ неприватных ступенях
  show_logs        BOOLEAN NOT NULL DEFAULT true,  -- логи generation/context/formatted
                                                  -- чужому зарегистрированному; ТОЛЬКО при 'full'
  show_prompts     BOOLEAN NOT NULL DEFAULT false, -- дамп запросов /logs/prompts; ТОЛЬКО при 'full'
  allow_meta       BOOLEAN NOT NULL DEFAULT true,  -- участие в чужом мета-синтезе; ТОЛЬКО при 'full'
    -- Действенность трёх флагов решает effectiveFlags при чтении
    -- (shared/utils/visibility.ts): сырые значения при понижении ступени
    -- НЕ сбрасываются. Стоимость и токены флагом не управляются: гостю не
    -- отдаются никогда, зарегистрированному — у любой неприватной.
  
  -- Порядок разделов (массив ключей: ["sum","graph","glossary",...])
  section_order    JSONB NOT NULL DEFAULT '["sum"]',
  
  -- Версионирование (аналог DOC_STATE.docVersion)
  structure_sections JSONB,  -- снимок sectionOrder для «Структура документа» (v10, nullable)
  parent_context_schema TEXT NOT NULL DEFAULT 'selective-v1',
    -- 'selective-v1' | 'monolithic' (legacy-импорт; мигрирует при первой
    -- перегенерации с маркером schema_migration_marker в generation_log)
  paused_state     JSONB,  -- персистентное состояние паузы (v11, nullable):
    -- kind 'gen': { passIdx, sectionKeys, isPartial, partialSubsections,
    --   expectedSubsections, completedPasses, genParams, reasonKind,
    --   rawMessage?, maxTokensUsed?, stuckSec?, reason?, timestamp }
    -- kind 'plan': { stepIdx, totalSteps, failedOp, remainingOps, plan,
    --   regenCtx, addCtx, reasonKind, rawMessage?, maxTokensUsed?, stuckSec?,
    --   reason?, timestamp }
    -- 14.2 (Д-54): причина — ПОЛЯМИ (shared PauseReasonFields): reasonKind,
    --   rawMessage (сырое сообщение API/службы — как есть), числа
    --   (maxTokensUsed, stuckSec); готовую фразу (reason) новые паузы НЕ
    --   пишут — её собирает клиент по reasonKind; reason остаётся у пауз,
    --   записанных до 14.2 (и из выгрузки) — показывается как есть.
    --   pause_marker.metadata несёт те же поля (reason — только у старых)
    -- reasonKind: 'auth'|'billing'|'pre-stream'|'max-tokens'|'partial'|'stuck'|'user-abort'
    --   |'context-error' (сбой ПОСТРОЕНИЯ контекста/промпта, outer catch
    --   _runGenPassesFromIdx [~25842]; найдено беседой 1.4 — kind'ом стрима не является)
    -- 13.2 (Д-65): отдаётся ТОЛЬКО владельцу (GET /:id — projectSynthesis;
    --   HTML-выгрузка — exportHTML ownerView): genParams несут зерно, secCtx и
    --   conceptParticipants — содержимое родительских концепций, в том числе
    --   приватных родителей владельца; невладельцу на любой ступени — null
  version_base     INT NOT NULL DEFAULT 1,
  version_sub      INT NOT NULL DEFAULT 0,
  version_modes    INT NOT NULL DEFAULT 0,
  version_mode_regen INT NOT NULL DEFAULT 0,
  
  -- Капсула (HTML, хранится отдельно от секций); 13.1: как html_content —
  -- только после санитайзера (PATCH капсулы, импорт, откат, генерация)
  capsule_html     TEXT NOT NULL DEFAULT '',

  -- Дерево генеалогии импортированного файла (FileGenealogyNode, миграция
  -- 0008): снимок предков, которых нет в synthesis_lineage; NULL — не из файла.
  -- 14.2 (Д-57): безымянный узел — { type, name: "", unnamed: true } (до 14.2 —
  --   русская заглушка «[безымянная концепция]» / «[безымянный философ]»;
  --   читатели распознают её как пустое имя). Подстановка имени — при чтении
  --   на языке запроса (lineage-service fileNodeName → tl()); выгрузка пишет
  --   русскую заглушку (зеркало 11.4), импорт её снимает санацией
  file_genealogy   JSONB,
  
  -- Статистика
  total_input_tokens  INT NOT NULL DEFAULT 0,
  total_output_tokens INT NOT NULL DEFAULT 0,
  total_cost_usd      NUMERIC(10, 6) NOT NULL DEFAULT 0,
  
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_syntheses_user ON syntheses(user_id);
CREATE INDEX idx_syntheses_status ON syntheses(status);
CREATE INDEX idx_syntheses_visibility ON syntheses(visibility) WHERE visibility <> 'private';
  -- 8.6: публичный каталог и pruneInvisible фильтруют по ступени (прежний
  -- idx_syntheses_public по is_public снят миграцией 0005)
CREATE INDEX idx_syntheses_paused ON syntheses(status) WHERE status = 'paused';
CREATE INDEX idx_syntheses_title_trgm ON syntheses USING gin(title gin_trgm_ops);
```

### 2.4. synthesis_lineage

Граф наследования. Каждая запись = «концепция X имеет родителя Y».

```sql
CREATE TABLE synthesis_lineage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  parent_type TEXT NOT NULL,  -- 'philosopher' | 'synthesis'
  parent_name TEXT,           -- имя философа (если parent_type = 'philosopher')
  parent_synthesis_id UUID REFERENCES syntheses(id) ON DELETE SET NULL,
    -- id концепции-родителя (если parent_type = 'synthesis')
  position    INT NOT NULL DEFAULT 0  -- порядок среди родителей
);

CREATE INDEX idx_lineage_synthesis ON synthesis_lineage(synthesis_id);
CREATE INDEX idx_lineage_parent_synth ON synthesis_lineage(parent_synthesis_id);
CREATE INDEX idx_lineage_parent_name ON synthesis_lineage(parent_name) 
  WHERE parent_type = 'philosopher';
-- 15.1 (Д-70), миграция 0014_lineage_parent_unique: одна пара «ребёнок —
-- родитель-концепция»; философы и строки с удалённым родителем (NULL) не
-- ограничены. Миграция сначала снимает дубли (остаётся строка с меньшей
-- position, при равных — меньший id).
CREATE UNIQUE INDEX uq_lineage_parent_pair
  ON synthesis_lineage(synthesis_id, parent_synthesis_id)
  WHERE parent_type = 'synthesis' AND parent_synthesis_id IS NOT NULL;
```

> **15.1 (Д-68, Д-69, Д-70; 2026-10-27):** `linkParent` переводит нарушение
> `uq_lineage_parent_pair` (23505) в тот же `LINEAGE_EXISTS` — гонка двух
> привязок даёт одну строку. `POST /lineage/link` принимает `position`
> узла файла (связь ставится на ЭТОТ узел, он обязан быть свободной
> концепцией). **Отвязка** (`DELETE …/lineage/link/:parentSynthesisId`)
> снимает строку `parent_type='synthesis'` ТОЛЬКО если на её `position` в
> `file_genealogy` стоит узел-концепция — он снова проступает по ПРАВИЛУ
> ПРИОРИТЕТА; строку без узла файла (родитель генерации; связь за
> пределами `participants`) снять нельзя — 409 `LINEAGE_GENERATED`;
> потомки, тексты и журнал не трогаются. Копия синтеза переносит
> `file_genealogy` вместе со строками (иначе их позиции ничего не
> перекрывали). **Одно правило «мета-синтез»** (`isMetaSynthesisRows`,
> lineage-service): живая связь-концепция (`parent_synthesis_id` не NULL)
> ЛИБО неперекрытый узел-концепция дерева файла; им живут бейдж каталога
> (`loadConceptParentFlags`) и страница (`parentSyntheses` ∪
> `fileConceptParents`). Строка с удалённым родителем (SET NULL) сама по
> себе «мета» не даёт — её не видят древо, контекст генерации,
> восстановление промпта и выгрузка.

> **8.6 (2026-09-15):** «виден» для узла-концепции в дереве потомков
> (`pruneInvisible`, `/lineage/search`) = владелец ИЛИ `visibility <>
> 'private'` — витрина видна как узел (генеалогия есть метаданные), её
> содержание закрыто своими роутами. Владение обоих синтезов у `POST
> /lineage/link` осталось владельческим: публичность любой ступени правом
> не является.
>
> **8.5 (2026-09-14):** у строк `parent_type='synthesis'` колонка
> `parent_name` остаётся NULL и при привязке через `POST
> /syntheses/:id/lineage/link` — имя родителя из файла в БД не пишется,
> имя даёт JOIN с `syntheses.title`. Импорт файлов одностраничника
> (без UUID) строк `synthesis` не создаёт вовсе: родителя выбирает человек по
> предложению `lineageCandidates` (03 §2.2/§2.8), `position` у такой строки —
> `max(position)+1` среди родителей синтеза.

> **13.2 (Д-66):** строка `parent_type='synthesis'` при импорте по UUID из
> файла пишется ТОЛЬКО по правилу родителя мета-синтеза (`metaParentAllowed`,
> shared: своя — всегда; чужая — при действенном `allow_meta`; витрина и
> приватная — никогда) и без цикла (`isDescendantOf`); до 13.2 — при одном
> существовании строки. Записанные до 13.2 связи с чужим негодным родителем
> перечисляет `npm run report:lineage-parents` (только отчёт; снятие — решение
> пользователя, отвязка — 15.1).
>
> **Дерево файла (2026-09-21, вне бесед):** импорт файла пишет дерево
> `genealogy` файла целиком в `syntheses.file_genealogy` (миграция
> `0008_file_genealogy`); индекс в `participants` корня = `position` строки
> synthesis_lineage, которую импорт создал бы для этого родителя. ПРАВИЛО
> ПРИОРИТЕТА: действующая строка (философ с именем или концепция с живым
> `parent_synthesis_id`) на позиции i перекрывает узел файла с индексом i;
> узел файла виден только там, где связи нет или её родитель удалён (SET
> NULL). Подшивка — одна, в `getAncestors` (lineage-service); оттуда берут
> дерево страница синтеза и экспорт. Правило 8.5 «`position` —
> `max(position)+1`» ЗАМЕНЕНО: `linkParent` ставит связь на позицию
> неперекрытого узла файла с тем же (нормализованным) именем (с 15.1 — по
> явному `position`); узла нет — отказ `LINEAGE_NODE_UNAVAILABLE` (15.1,
> Д-80; до того — «за пределы и связей, и `participants` файла»). Инвариант:
> строка `parent_type='synthesis'` либо стоит на узле-концепции файла
> (поставлена человеком, отвязывается), либо узла не имеет (генерация или
> импорт по UUID — не отвязывается).

**Рекурсивный запрос — все предки концепции:**
```sql
WITH RECURSIVE ancestors AS (
  SELECT parent_type, parent_name, parent_synthesis_id, 1 AS depth
  FROM synthesis_lineage WHERE synthesis_id = $1
  
  UNION ALL
  
  SELECT sl.parent_type, sl.parent_name, sl.parent_synthesis_id, a.depth + 1
  FROM synthesis_lineage sl
  JOIN ancestors a ON sl.synthesis_id = a.parent_synthesis_id
  WHERE a.parent_type = 'synthesis' AND a.depth < 10
)
SELECT * FROM ancestors;
```

### 2.5. sections

Разделы синтеза. Хранят HTML-контент и метаданные.

```sql
CREATE TABLE sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id  UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,  -- 'sum'|'graph'|'glossary'|'theses'|...
  section_num   INT NOT NULL,
  title         TEXT NOT NULL,
  html_content  TEXT NOT NULL DEFAULT '',  -- 13.1 (Д-63): только ПОСЛЕ санитайзера
                                          -- (shared/utils/doc-markup-sanitize, режим
                                          -- section) — на всех входах; старое —
                                          -- npm run sanitize:stored-html
  sec_context   TEXT NOT NULL DEFAULT '',  -- доп. контекст раздела (secCtx)
  is_edited     BOOLEAN NOT NULL DEFAULT false,  -- true после перегенерации (2.2), врезки таблицы
                                                 -- рендерером (5.1) и ручной правки подраздела (9.2)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(synthesis_id, key)
);

CREATE INDEX idx_sections_synthesis ON sections(synthesis_id);
```

### 2.6. categories

Гранулярные элементы графа категорий. Извлекаются из HTML при генерации раздела «Граф».

```sql
CREATE TABLE categories (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id   UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT '',  -- 'онтологическая', 'эпистемологическая', ...
  definition     TEXT NOT NULL DEFAULT '',
  centrality     REAL NOT NULL DEFAULT 0.5,
  certainty      REAL NOT NULL DEFAULT 0.5,
  historical_significance REAL NOT NULL DEFAULT 0.5,  -- историческая значимость (0–1)
  innovation_degree       INT NOT NULL DEFAULT 1,     -- уровень инновационности (1–5)
  clarity            REAL NOT NULL DEFAULT 0,       -- ясность (0–1, v10)
  breadth            REAL NOT NULL DEFAULT 0,       -- широта (0–1, v10)
  depth_score        REAL NOT NULL DEFAULT 0,       -- глубина (0–1, v10; «depth_score» чтобы не конфликтовать с SQL)
  applicability      REAL NOT NULL DEFAULT 0,       -- применимость (0–1, v10)
  type_catalog_id  UUID REFERENCES category_type_catalog(id) ON DELETE SET NULL,  -- ссылка на каталог типов (нормализованный); SET NULL — миграция 0003 (7.1)
  origin         TEXT NOT NULL DEFAULT '',  -- столбец «Происхождение/Генеалогия/Преодолённые ограничения»
  
  -- Топология (из parseTopology)
  cluster_indices  JSONB NOT NULL DEFAULT '[]',   -- [0, 2] — индексы кластеров
  structural_roles JSONB NOT NULL DEFAULT '[]',   -- ["central", "bridge"]
  procedural_roles JSONB NOT NULL DEFAULT '[]',   -- ["synthesis", "thesis"]
  has_reflexive    BOOLEAN NOT NULL DEFAULT false,
  
  position       INT NOT NULL DEFAULT 0,  -- порядок в таблице
  source         TEXT NOT NULL DEFAULT 'generated',  -- 'generated'|'manual'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_synthesis ON categories(synthesis_id);
```

### 2.7. category_edges

```sql
CREATE TABLE category_edges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id  UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  source_id     UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  target_id     UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  description   TEXT NOT NULL DEFAULT '',
  edge_type     TEXT NOT NULL DEFAULT '',  -- 'иерархическая', 'диалектическая', ...
  direction     TEXT NOT NULL DEFAULT 'однонаправленная',
    -- 'однонаправленная'|'двунаправленная'|'рефлексивная'
  strength      REAL NOT NULL DEFAULT 0.5,
  certainty          REAL NOT NULL DEFAULT 0.5,  -- определённость/спорность связи
  historical_support REAL NOT NULL DEFAULT 0.5,  -- историческая поддержка
  logical_necessity  REAL NOT NULL DEFAULT 0.5,  -- логическая необходимость
  innovation_degree  INT NOT NULL DEFAULT 1,        -- степень инновации связи (1–5, v10)
  context_dependency REAL NOT NULL DEFAULT 0.5,     -- контекстозависимость (0–1, v10)
  type_catalog_id    UUID REFERENCES relationship_type_catalog(id) ON DELETE SET NULL,  -- SET NULL — миграция 0003 (7.1)
  position      INT NOT NULL DEFAULT 0,
  source_origin TEXT NOT NULL DEFAULT 'generated',  -- 'generated'|'manual'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_edges_synthesis ON category_edges(synthesis_id);
CREATE INDEX idx_edges_source ON category_edges(source_id);
CREATE INDEX idx_edges_target ON category_edges(target_id);
```

### 2.8. cluster_labels

```sql
CREATE TABLE cluster_labels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  cluster_index INT NOT NULL,
  label        TEXT NOT NULL,
  
  UNIQUE(synthesis_id, cluster_index)
);
```

### 2.9. theses

```sql
CREATE TABLE theses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id    UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  thesis_num      INT NOT NULL,
  label           TEXT,           -- 12.1 (Д-1, миграция 0011): метка тезиса так, как её записал
                                  -- документ в первой ячейке сводной таблицы («О-1», «Э-2»);
                                  -- NULL — метка равна номеру. Пишет разбор 1.4 (им же пользуется
                                  -- импорт), рисует рендерер 5.1 (label ?? thesis_num), по ней
                                  -- сводит сторож рекомендаций 10.1; у строк до миграции 0011
                                  -- дозаливается из текущей таблицы перед перерисовкой
  formulation     TEXT NOT NULL,  -- текст тезиса (жирный)
  justification   TEXT NOT NULL DEFAULT '',  -- обоснование
  thesis_type     TEXT NOT NULL DEFAULT 'ontological',
    -- 'ontological'|'epistemological'|'ethical'
  novelty_degree  TEXT NOT NULL DEFAULT '',
  related_categories JSONB NOT NULL DEFAULT '[]',  -- имена категорий
  source          TEXT NOT NULL DEFAULT 'generated',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_theses_synthesis ON theses(synthesis_id);
```

### 2.10. glossary_terms

```sql
CREATE TABLE glossary_terms (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id      UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  term              TEXT NOT NULL,
  definition        TEXT NOT NULL,
  -- Дополнительные столбцы зависят от synth_level, хранятся как JSON
  extra_columns     JSONB NOT NULL DEFAULT '{}',
  term_category     TEXT NOT NULL DEFAULT '',  -- 'redefined'|'borrowed'|'new'|'transformed'|'emergent'|...
  source            TEXT NOT NULL DEFAULT 'generated',
  position          INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_glossary_synthesis ON glossary_terms(synthesis_id);
```

### 2.11. dialogue_turns

```sql
CREATE TABLE dialogue_turns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id  UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  part_number   INT NOT NULL,     -- часть диалога (1–5)
  turn_number   INT NOT NULL,     -- номер реплики внутри части
  speaker       TEXT NOT NULL,    -- имя участника
  content       TEXT NOT NULL,    -- текст реплики
  new_concepts  JSONB NOT NULL DEFAULT '[]',  -- понятия, введённые в этой реплике
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dialogue_synthesis ON dialogue_turns(synthesis_id);
```

### 2.12. element_versions

Версионирование любого гранулярного элемента при ручном или авто-редактировании.

```sql
CREATE TABLE element_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Владелец версии (правка 2026-09-02, аудит фаз 5–6, п.3).
  -- Нужен для двух вещей: проверка доступа в /syntheses/:id/elements/...
  -- одним WHERE вместо JOIN по пяти таблицам с ветвлением по element_type,
  -- и каскадная уборка — без него версии переживали удаление синтеза
  -- (element_id полиморфный, FK на элемент невозможен).
  -- Устройство зеркалит element_enrichments (§2.26).
  synthesis_id UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  element_id   UUID NOT NULL,
  element_type TEXT NOT NULL,  -- 'category'|'edge'|'thesis'|'glossary_term'|'dialogue_turn'|'section'
                               -- 'section': element_id = sections.id, data — снимок строки раздела ДО
                               -- правки; пишут updateCapsule (5.1) и updateSubsection (9.2, ручная
                               -- правка подраздела, change_source 'manual'). Откат возвращает
                               -- html_content и is_edited из снимка. Панель VersionHistory (5.2)
                               -- версии разделов НЕ показывает — только API (находка 9.2).
                               -- 15.2 (Д-71): deleteSubsection пишет такую же версию перед
                               -- удалением подраздела (откат вернёт его); deleteElement — снимок
                               -- удалённой категории/тезиса/термина (как ребро с 5.1): строка
                               -- версии переживает элемент, восстановления из неё НЕТ (Огр-13 —
                               -- откат пишет UPDATE в живую строку); тезис, у которого удаление
                               -- категории сняло имя из related_categories, получает версию
                               -- 'cascade'
  version      INT NOT NULL,
  data         JSONB NOT NULL,  -- полный снимок элемента до изменения
  change_source TEXT NOT NULL DEFAULT 'manual',
    -- 'manual'|'regenerated'|'cascade'|'auto_rename'|'rollback'|'recommendation'
    -- (текст без CHECK; 'recommendation' — 10.2: правка исполнила рекомендацию критики)
  origin       JSONB,           -- 10.2 (миграция 0009): «почему изменилось» — снимок
                                -- рекомендации, породившей версию: { kind:'recommendation',
                                -- recommendationId, round, num, op, rationale, planId,
                                -- stepIndex, stepType }. NULL — правка не по рекомендации.
                                -- Снимок, а не FK: строки 'new' при перечитке таблицы
                                -- пересобираются, план может быть удалён — ответ на
                                -- «почему» обязан пережить и то и другое
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_versions_element ON element_versions(element_id, element_type);
CREATE INDEX idx_versions_synthesis ON element_versions(synthesis_id);
```

### 2.13. edit_plans

```sql
CREATE TABLE edit_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id  UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'draft',
    -- 'draft'|'executing'|'paused'|'done'|'failed'
  current_step  INT NOT NULL DEFAULT 0,
  steps         JSONB NOT NULL DEFAULT '[]',  -- массив EditStep; с 10.2 — и шаги мельче
                                              -- раздела: edit_element / refine_element
                                              -- (target «kind:elementId», field, value |
                                              -- context, subsection, recommendations[]);
                                              -- с 15.2 — delete_element («kind:elementId»)
                                              -- и delete_subsection («sectionKey:имя»),
                                              -- бесплатные; черновик с шагом по уже
                                              -- удалённому элементу не правится — шаг
                                              -- падает NOT_FOUND при исполнении
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plans_synthesis ON edit_plans(synthesis_id);
```

### 2.14. mode_results

Результаты режимов (оппонент, переводчик, временной срез).

```sql
CREATE TABLE mode_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id  UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  mode_key      TEXT NOT NULL,  -- 'adversarial'|'translator'|'timeslice'
  param_value   TEXT NOT NULL,  -- «Кант», «Аналитическая ФР», «Афины V в. до н.э.»
  html_content  TEXT NOT NULL,
  input_tokens  INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(10, 6) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_modes_synthesis ON mode_results(synthesis_id);
CREATE INDEX idx_modes_key ON mode_results(synthesis_id, mode_key);
```

По факту 4.1: индекс результата в API (§2.7, DELETE и вкладки UI) —
позиция строки по `created_at` ASC. Тихая перегенерация
(regenerateModeSilent) обновляет строку С СОХРАНЕНИЕМ `created_at` —
отступление от исходника (тот обновлял timestamp, отчего индексы и
порядок вкладок плыли).

### 2.15. generation_log

Аналог массива `genLog` из исходника.

Служебная строка `section_key='_genCommon'`, `status='common'` (беседа 1.4):
объект `genCommon` исходника (sysChars, baseChars, budgetMode,
parentSpecBySection, conceptBlockSizes, …) хранится в `metadata` этой
строки — отдельной колонки не требует; потребители — log-formatter (2.4)
и экспорт промптов (4.2). Статусы строк генерации: 'streaming' (идёт) →
'done'/'error'; 'common' — только у служебной строки.

```sql
CREATE TABLE generation_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id   UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  section_key    TEXT NOT NULL,
  section_label  TEXT NOT NULL DEFAULT '',
  log_type       TEXT NOT NULL DEFAULT 'generation',
    -- 'generation'|'version_marker'|'deletion_marker'
    -- v11: + 'pause_marker'|'resume_marker'|'user_action_marker'|'schema_migration_marker'
    --   (маркеры показываются в «Логе контекста», исключаются из «Лога промптов»)
  source         TEXT NOT NULL DEFAULT 'initial',
    -- 'initial'|'edit'|'edit_add'|'cascade'|'subsection_regen'|'mode'|'mode_cascade'
    --   |'resume' (строки возобновлённой генерации — _runGenPassesFromIdx
    --   [25573] пишет source:'resume'; найдено беседой 1.4b)
  status         TEXT NOT NULL DEFAULT 'done',
  prior_chars    INT NOT NULL DEFAULT 0,
  task_chars     INT NOT NULL DEFAULT 0,
  input_chars    INT NOT NULL DEFAULT 0,
  output_chars   INT NOT NULL DEFAULT 0,
  input_tokens   INT NOT NULL DEFAULT 0,
  output_tokens  INT NOT NULL DEFAULT 0,
  cost_usd       NUMERIC(10, 6) NOT NULL DEFAULT 0,
  error_message  TEXT,
  -- Метаданные (secCtxPreview, modeParam, subsections; v11: promptSkeleton —
  -- скелет промпта пишется при генерации, реконструкция — fallback импорта)
  -- 11.1: + parseWarnings — предупреждения разбора раздела
  --   (подставленное направление связи, роль вне ROLE_MAP, таблица не
  --   найдена по русскому data-section, подраздел опознан по месту /
  --   не опознан). Пишутся jsonb_set с НАКОПЛЕНИЕМ (`||` по верхнему
  --   ключу заменил бы массив); показ — log-formatter «РАЗБОР С ПОТЕРЯМИ».
  --   14.2 (Д-55): элемент — КОД с параметрами (shared ParseWarning
  --   { code, params }, список PARSE_WARNING_CODES) либо строка (записи до
  --   14.2, журнал из выгрузки); фразу собирают читатели под языком запроса
  --   (server/services/parse-warnings.ts), строка — как есть
  -- 14.2 (Д-62): + logLabel (shared GenLogLabel — код подписи записи с
  --   параметрами: ключи разделов прохода, имя подраздела, вид операции,
  --   элемент/поле/№ рекомендации, режим/параметр, направление
  --   трансформации) и error (GenLogError — код ошибки: stream с kind и
  --   сырым raw сообщением API, element_empty_response, element_too_long).
  --   Колонки section_label и error_message пишутся КАК ПРЕЖДЕ (русская
  --   запасная строка для старых читателей и выгрузки); log-formatter собирает
  --   подпись/ошибку по коду под языком запроса (gen-log-labels.ts), запись
  --   без кода — колонки как есть. pause_marker/resume_marker несут logLabel
  --   { kind: 'pass', sections }
  metadata       JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_genlog_synthesis ON generation_log(synthesis_id);
```

### 2.16. context_log

Аналог массива `ctxLog` из исходника.

```sql
CREATE TABLE context_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id  UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  section_key   TEXT NOT NULL,
  budget        INT NOT NULL DEFAULT 0,
  total_used    INT NOT NULL DEFAULT 0,
  req_found     INT NOT NULL DEFAULT 0,
  req_total     INT NOT NULL DEFAULT 0,
  opt_included  INT NOT NULL DEFAULT 0,
  opt_total     INT NOT NULL DEFAULT 0,
  -- v11 (tz_budget_mode / selective-parent-context):
  budget_mode   TEXT NOT NULL DEFAULT 'shrink',  -- 'full'|'shrink'
  parent_overhead INT NOT NULL DEFAULT 0,        -- вес родительского контекста (симв.)
  parent_spec   JSONB,  -- spec родительского контекста РАЗДЕЛА (не карта по
                        -- родителям): { required, optional, perParent[], totalChars },
                        -- где perParent[i] = { name, includedFields, omittedFields,
                        -- missingRequired, chars } — buildParentSpecForLog [~10197]
  -- ПРИМЕЧАНИЕ (беседа 1.3): ctxLog исходника несёт ещё rawBaseBudget и
  -- conceptOverheadApplied. Колонок они НЕ требуют — оба восстановимы:
  --   rawBaseBudget = CONTEXT_BUDGET[depth] × (section_key='critique' ? 1.5 : 1),
  --   conceptOverheadApplied = rawBaseBudget − budget.
  -- parent_overhead хранит СЫРОЙ вес родителей (parentOverheadForSection),
  -- а не величину ужатия — это разные числа.
  entries       JSONB NOT NULL DEFAULT '[]',  -- массив { key, status, len, priority, isSubstitute, ... }
    -- поверх entries вычисляется качество контекста раздела
    -- (getSectionContextQuality → score + issues, бейдж в Edit Modal)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ctxlog_synthesis ON context_log(synthesis_id);
```

### 2.17. prompt_templates

> **7.1 (2026-09-07, миграция 0003):** `created_by … ON DELETE SET NULL` —
> удаление автора черновика больше не падает по FK 23503 (класс миграции
> 0002). Примечание 6.2 ошибочно относило это и к `synthesis_configs` —
> колонки `created_by` там НЕТ (§2.18); зато тот же голый REFERENCES был у
> `category_type_catalog`/`relationship_type_catalog.created_by` — исправлен
> той же миграцией.

```sql
CREATE TABLE prompt_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL,  -- 'system', 'method.dialectical.graph', ...
  version     INT NOT NULL DEFAULT 1,
  body        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  description TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,  -- 7.1, миграция 0003
  
  UNIQUE(key, version)
);

CREATE INDEX idx_prompts_key_active ON prompt_templates(key) WHERE is_active = true;
```

### 2.18. synthesis_configs

```sql
CREATE TABLE synthesis_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL,
    -- 'context_deps.base'|'.genetic'|'.level'|'.level_genetic'|'.method',
    -- 'substitution_map', 'compat_matrix',
    -- v11: 'parent_deps.base'|'.genetic'|'.level'|'.level_genetic'|'.method',
    --      'parent_intra_deps', 'parent_field_order', 'parent_field_labels',
    --      'md_by_card', 'sd_by_card', 'mode_deps', ...
  version     INT NOT NULL DEFAULT 1,
  value       JSONB NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  description TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(key, version)
);

CREATE INDEX idx_configs_key_active ON synthesis_configs(key) WHERE is_active = true;
```

### 2.19. api_keys

```sql
CREATE TABLE api_keys (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_key  BYTEA NOT NULL,         -- AES-256 encrypted
  key_prefix     TEXT NOT NULL,          -- 'sk-ant-api03-...' (первые 14 символов)
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_apikeys_user ON api_keys(user_id);
```

### 2.20. transactions

```sql
CREATE TABLE transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  type          TEXT NOT NULL,  -- 'topup'|'usage'|'refund'
  amount_usd    NUMERIC(10, 6) NOT NULL,
  balance_after NUMERIC(10, 4) NOT NULL,
  synthesis_id  UUID REFERENCES syntheses(id) ON DELETE SET NULL,  -- миграция 0002 (6.1): история переживает удаление синтеза
  section_key   TEXT,
  stripe_id     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_user ON transactions(user_id);
```

### 2.21. api_usage

```sql
CREATE TABLE api_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),   -- RESTRICT: удаление аккаунта с историей блокируется (долг §12 6.2)
  synthesis_id  UUID REFERENCES syntheses(id) ON DELETE SET NULL,  -- миграция 0002 (6.1)
  section_key   TEXT,
  billing_mode  TEXT NOT NULL,  -- 'byo'|'subscription'|'balance'
    -- Правка 2026-09-02 (аудит фаз 5–6, п.7): три режима по приоритету
    -- 01 §6. Прежний enum 'byo'|'service' не различал подписку и баланс,
    -- отчего история использования (6.2) не могла показать режим.
    -- ВАЖНО: для 'byo' cost_usd несёт СЕБЕСТОИМОСТЬ (списания не было) —
    -- суммировать его с 'balance' в одном итоге нельзя.
  input_tokens  INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(10, 6) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_user ON api_usage(user_id);
CREATE INDEX idx_usage_synthesis ON api_usage(synthesis_id);
```

### 2.22. subscription_plans

Тарифные планы.

> **8.3 (2026-09-09) — откуда берутся строки.** Таблица сеется ТОЛЬКО
> `scripts/seed-plans.ts` (`npm run seed:plans`) из описания
> `server/config/plans.ts` — три тарифа (`starter`, `pro`, `academic`:
> displayName, цена, период, четыре квоты) БЕЗ `stripe_price_id`. Price
> существует лишь в аккаунте Stripe владельца: его заводит
> `scripts/stripe-create-prices.ts` (`npm run stripe:create-prices`,
> идемпотентно по `lookup_key = philosynth_<name>`) и печатает строки
> `STRIPE_PRICE_<NAME_UPPER>=price_…` для `.env`; посев читает их из
> окружения. Переменной нет → строка заводится/остаётся с
> `is_active=false` (сохранённый `stripe_price_id` не затирается — колонка
> NOT NULL, при первом посеве пишется пустая строка) и громким
> предупреждением; в `GET /billing/plans` такой план не попадает.
> Идемпотентность по `name` (UNIQUE): created / updated / skip / fail.
> Заслон: смена `stripe_price_id` у плана с подписками в статусе ≠
> `canceled` (включая `incomplete`) → fail, строка не тронута — Price
> живой подписки в Stripe сменить нельзя, а FK `user_subscriptions.plan_id`
> держит план. Квоты сверяются с ценой: `Σ quota × себестоимость операции
> (ставки cost-estimator 1.1, верхняя модель) × BILLING_MARKUP ≤ price_usd`,
> иначе fail — убыточный тариф не заводится. Каждая created/updated пишет
> `admin_audit` `plan.seeded` (actor_id NULL, §2.29).
>
> **15.4 (2026-11-05, Д-74/Д-75) — источник истины о тарифах — ЭТА ТАБЛИЦА,
> правка админкой и редакциями.** `plans.ts` — только начальный посев: сид
> создаёт отсутствующие строки (`family = name`, `edition = 1`) и
> существующие НЕ переписывает ни при каком расхождении (исхода `updated`
> нет; расхождение — предупреждением по полям). Редакция тарифа — строка:
> `family` — семейство (`starter`), `edition` — номер в семействе (1, 2, …;
> `UNIQUE (family, edition)`), `name` — уникальное имя редакции (редакция 1
> носит имя семейства, следующие — `<family>-v<N>`). Product в Stripe —
> один на семейство (`metadata.philosynth_plan = family`), Price — на
> редакцию (`lookup_key = philosynth_<name>`). Админка (03 §2.10,
> `services/plan-admin.ts`): название и `is_active` («открыт для покупки»)
> правятся на месте; цена, период и квоты — на месте только у редакции без
> живых подписок (`status ≠ canceled`; новая цена/период → новый Price,
> прежний выключается); у редакции с подписками — «новая редакция»: новая
> строка с новым Price, прежняя `is_active=false`, её подписчики
> дорабатывают на своих квотах и цене (`plan_id` не меняется; Price
> прежней редакции в Stripe остаётся активным — по нему продлеваются).
> Экономика и структура — одной функцией с сидом
> (`config/plan-economics.ts`). След — `admin_audit` `plan.created` /
> `plan.updated` / `plan.edition` (§2.29).

```sql
CREATE TABLE subscription_plans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL UNIQUE,   -- имя РЕДАКЦИИ: 'starter' (ред. 1), 'starter-v2' … (15.4)
  family           TEXT NOT NULL,          -- 15.4 (0016): семейство; у строк до миграции = name
  edition          INT  NOT NULL DEFAULT 1, -- 15.4 (0016): номер редакции в семействе
  display_name     TEXT NOT NULL,          -- 'Starter', 'Pro', 'Academic'
  price_usd        NUMERIC(10, 2) NOT NULL,
  billing_period   TEXT NOT NULL DEFAULT 'month',  -- 'month'|'year'
  quota_syntheses     INT NOT NULL,  -- полных синтезов за период
  quota_regenerations INT NOT NULL,  -- перегенераций разделов за период
  quota_modes         INT NOT NULL,  -- запусков режимов за период
  quota_enrichments   INT NOT NULL,  -- обогащений элементов за период
  stripe_price_id  TEXT NOT NULL,    -- Stripe Price ID (Price редакции)
  is_active        BOOLEAN NOT NULL DEFAULT true,  -- «открыт для покупки» (15.4)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_subscription_plans_family_edition ON subscription_plans(family, edition);  -- 15.4
```

### 2.23. user_subscriptions

Активные подписки пользователей.

> **15.4 (Д-75):** `plan_id` следует за Price подписки в Stripe: вебхук
> `customer.subscription.updated` берёт `items.data[0].price.id`, находит
> план по `stripe_price_id` и переносит `plan_id`, если он отличается;
> неизвестный Price — предупреждение в журнал сервера, `plan_id` на месте.
> Новая редакция тарифа (§2.22) подписчиков НЕ переводит — только Stripe.

```sql
CREATE TABLE user_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id                 UUID NOT NULL REFERENCES subscription_plans(id),
  stripe_subscription_id  TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'active',
    -- 'active'|'past_due'|'canceled'|'trialing'|'incomplete'
  current_period_start    TIMESTAMPTZ NOT NULL,
  current_period_end      TIMESTAMPTZ NOT NULL,
  -- Счётчики использования (сбрасываются в начале каждого периода)
  used_syntheses          INT NOT NULL DEFAULT 0,
  used_regenerations      INT NOT NULL DEFAULT 0,
  used_modes              INT NOT NULL DEFAULT 0,
  used_enrichments        INT NOT NULL DEFAULT 0,
  cancel_at_period_end    BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON user_subscriptions(status)
  WHERE status IN ('active', 'trialing');
```

### 2.24. category_type_catalog

Фиксированный каталог типов категорий — слой нормализации.

```sql
CREATE TABLE category_type_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,   -- 'ontological', 'epistemological', ...
  name_ru     TEXT NOT NULL,          -- 'Онтологическая', 'Эпистемологическая', ...
  description TEXT NOT NULL DEFAULT '',
  is_system   BOOLEAN NOT NULL DEFAULT true,  -- системный (предзаполненный) или пользовательский
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,  -- 7.1, миграция 0003
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Начальное заполнение: 18 типов из предыдущего проекта (ontological, epistemological, axiological, ethical, aesthetic, metaphysical, logical, practical, political, theological, anthropological, social, linguistic, phenomenological, existential, analytical, hermeneutical, cross_disciplinary).

### 2.25. relationship_type_catalog

Фиксированный каталог типов связей.

```sql
CREATE TABLE relationship_type_catalog (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key              TEXT NOT NULL UNIQUE,  -- 'hierarchical', 'dialectical', ...
  name_ru          TEXT NOT NULL,         -- 'Иерархическая', 'Диалектическая', ...
  description      TEXT NOT NULL DEFAULT '',
  default_direction TEXT NOT NULL DEFAULT 'unidirectional',
  is_system        BOOLEAN NOT NULL DEFAULT true,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,  -- 7.1, миграция 0003
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Начальное заполнение: 29 типов из предыдущего проекта.

### 2.26. element_enrichments

Результаты точечных Claude-запросов для обогащения отдельных элементов.

```sql
CREATE TABLE element_enrichments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id   UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  element_id     UUID NOT NULL,
  element_type   TEXT NOT NULL,  -- 'category'|'edge'|'thesis'|'glossary_term'
  enrichment_type TEXT NOT NULL,
    -- 'description'|'justification'|'counterarguments'|'evolution'|'characteristic'
    -- +counterarguments (правка 2026-09-02): 03 §2.14 допускает его для
    -- связей, а enum модели о нём не знал
  prompt_key     TEXT NOT NULL,   -- ключ шаблона в Prompt Registry
  content        TEXT NOT NULL,   -- результат обогащения (текст от Claude)
  metadata       JSONB NOT NULL DEFAULT '{}',  -- доп. структурированные данные
  input_tokens   INT NOT NULL DEFAULT 0,
  output_tokens  INT NOT NULL DEFAULT 0,
  cost_usd       NUMERIC(10, 6) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_enrichments_element ON element_enrichments(element_id, element_type);
CREATE INDEX idx_enrichments_synthesis ON element_enrichments(synthesis_id);
```

### 2.27. characteristic_justifications

Философские обоснования числовых характеристик элементов.

```sql
CREATE TABLE characteristic_justifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Владелец обоснования — см. комментарий в element_versions §2.12
  -- (правка 2026-09-02, аудит фаз 5–6, п.3)
  synthesis_id      UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  element_id        UUID NOT NULL,
  element_type      TEXT NOT NULL,  -- 'category'|'edge'
  characteristic    TEXT NOT NULL,  -- 'centrality'|'certainty'|'historical_significance'|...
  value             REAL NOT NULL,
  justification     TEXT NOT NULL,  -- текст обоснования от Claude
  alternative_approaches TEXT,      -- альтернативные подходы к оценке
  limitations       TEXT,           -- ограничения текущей оценки
  input_tokens      INT NOT NULL DEFAULT 0,
  output_tokens     INT NOT NULL DEFAULT 0,
  cost_usd          NUMERIC(10, 6) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_justifications_element ON characteristic_justifications(element_id, element_type);
CREATE INDEX idx_justifications_synthesis ON characteristic_justifications(synthesis_id);
```

### 2.28. representation_transforms

История трансформаций graph↔theses — для откатов и аудита.

```sql
CREATE TABLE representation_transforms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id    UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL,  -- 'graph_to_theses' | 'theses_to_graph'
  
  -- Снимки до трансформации (для отката)
  source_snapshot JSONB NOT NULL,  -- граф или тезисы ДО трансформации
  target_snapshot JSONB NOT NULL,  -- целевое представление ДО замены
    -- Правка 2026-09-02 (аудит фаз 5–6, п.17): прежнее пояснение «ПОСЛЕ
    -- (старые, которые были заменены)» противоречило само себе.
    -- Семантика: source_snapshot — представление-ИСТОЧНИК на момент
    -- трансформации (для аудита), target_snapshot — представление-ЦЕЛЬ
    -- до того, как его заменили (именно из него делается откат).
    -- Для graph_to_theses: source = граф, target = прежние тезисы.
    -- ФАКТ 5.5 (2026-09-06): форма JSON — GraphSnapshot { kind:'graph',
    -- categories, edges, clusters, sectionHtml } | ThesesSnapshot
    -- { kind:'theses', theses, sectionHtml }: строки БД целиком (с id —
    -- откат восстанавливает прежние id, полиморфные ссылки
    -- element_versions/element_enrichments снова живы) + html_content
    -- раздела-хозяина (null — раздела не было). Строка-откат: тот же
    -- direction, result_summary.rollback = 1, токены 0, source =
    -- восстановленный снимок, target = состояние до отката.
  
  -- Результат
  result_summary  JSONB NOT NULL DEFAULT '{}',
    -- { categoriesCreated, categoriesRemoved, thesesCreated, thesesRemoved, ... }
  
  input_tokens    INT NOT NULL DEFAULT 0,
  output_tokens   INT NOT NULL DEFAULT 0,
  cost_usd        NUMERIC(10, 6) NOT NULL DEFAULT 0,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transforms_synthesis ON representation_transforms(synthesis_id);
CREATE INDEX idx_transforms_direction ON representation_transforms(synthesis_id, direction);
```

### 2.29. admin_audit

Журнал административных действий (беседа 8.1, миграция `0004_admin_audit`).
Пишется только через `server/services/admin-audit.ts` (`writeAudit`) — в
ТОЙ ЖЕ транзакции, что и само действие: журнал, который может разойтись с
делом, хуже отсутствующего.

```sql
CREATE TABLE admin_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    -- SET NULL, а не CASCADE: след действий переживает актора.
    -- 7.1 анонимизирует users вместо удаления — account-deletion обнуляет
    -- actor_id явно (см. примечание 8.1 в §2.1)
  action      TEXT NOT NULL,
    -- ADMIN_ACTIONS (замороженная константа сервиса, не SQL-enum —
    -- пополнение без миграции): prompt.version.created,
    -- prompt.version.activated, config.version.created,
    -- config.version.activated, taxonomy.type.updated,
    -- taxonomy.type.deleted, user.role.changed, user.bootstrapped,
    -- account.deleted, plan.seeded (8.3: посев тарифов, actor_id NULL),
    -- plan.created, plan.updated, plan.edition (15.4: тарифы админкой;
    -- target_id = name редакции; details — changed {поле: {from, to}},
    -- previousPriceId / previousName, edition, stripePriceId)
  target_type TEXT NOT NULL,   -- 'prompt_template'|'synthesis_config'|'taxonomy_type'|'user'
                               -- |'subscription_plan' (8.3; target_id = name плана)
  target_id   TEXT,            -- ключ шаблона/конфига, id типа, id пользователя
  details     JSONB NOT NULL DEFAULT '{}',
    -- { version, previousVersion } у активаций; { from, to, email } у смены
    -- роли; { kind, key, changed | unlinked } у каталогов; { source:
    -- 'bootstrap', outcome } у первого администратора; { deletedSyntheses,
    -- subscriptionCanceled, wasAdmin } у удаления аккаунта.
    -- jsonb не хранит порядок ключей — сверять через canonical() (09 §1)
  ip          TEXT,            -- X-Forwarded-For → X-Real-IP → адрес сокета
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_audit_actor   ON admin_audit(actor_id);
CREATE INDEX idx_admin_audit_created ON admin_audit(created_at);
```

Точки записи: `prompt-registry` (createVersion — актор = автор черновика;
activateVersion / createConfigVersion / activateConfigVersion — актор из
роута, у активации это активировавший, а не автор версии),
`element-taxonomy` (updateCustomType, deleteCustomType), смена роли
(`routes/auth.ts`), `account-deletion.ts`, `scripts/bootstrap-admin.ts`
(actor_id = самому себе). Чтение — `GET /auth/audit?limit=` (03 §2.1);
DTO `AdminAuditEntry` несёт дополнительно `actorEmail` (LEFT JOIN users по
actor_id, не колонка; null у снятого актора) — вкладка «Доступ» показывает
email вместо uuid.

### 2.30. auth_tokens

Одноразовые доводы из писем (беседа 9.1, миграция `0006_mail`): подтверждение
адреса и сброс пароля. Пишется только через `server/services/auth-tokens.ts`.

```sql
CREATE TABLE auth_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('email_verify','password_reset','email_change','member_invite')),
                                 -- email_change — 15.3 (миграция 0015); member_invite — 16.2 (0018)
  token_hash  TEXT NOT NULL,     -- sha256(довод), hex; сам довод — только в письме
  expires_at  TIMESTAMPTZ NOT NULL,  -- email_verify, member_invite: +72 ч; password_reset, email_change: +1 ч
  new_email   TEXT,              -- 15.3: адрес, на который переводится запись (email_change);
                                 -- 16.2: адрес приглашённого без аккаунта (member_invite)
  synthesis_id UUID REFERENCES syntheses(id) ON DELETE CASCADE,  -- 16.2: концепция приглашения (member_invite)
  member_role TEXT CHECK (member_role IS NULL OR member_role IN ('reviewer','editor')),  -- 16.2
  used_at     TIMESTAMPTZ,       -- погашен переходом ЛИБО выдачей следующего
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_tokens_user_purpose ON auth_tokens(user_id, purpose);
CREATE INDEX idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX idx_auth_tokens_synthesis ON auth_tokens(synthesis_id);  -- 16.2
```

**Приглашение адресу без аккаунта (16.2).** `user_id NOT NULL`, а
приглашённого ещё нет — довод `member_invite` висит на ПРИГЛАШАЮЩЕМ
(владельце), адрес — в `new_email`, концепция и роль — в `synthesis_id` /
`member_role`. Выдача — своя (`issueMemberInviteToken`): гасит прежние
непогашенные доводы того же (синтез, адрес), а не (пользователь,
назначение) — владелец зовёт многих; `issueToken` на `member_invite`
бросает. Регистрация с `inviteToken` одной транзакцией гасит довод
(`consumeMemberInviteToken`, один условный UPDATE) и заводит строку
`synthesis_members` 'invited' — только если адрес регистрации совпал с
`new_email`. Ждущие доводы синтеза — «приглашения адресам без аккаунта»
во вкладке «Участники» (отзыв = гашение, повтор письма = новый довод).

В базе лежит ХЭШ, а не довод: утечка таблицы не должна давать ни входа, ни
подтверждения (тот же принцип, что `sessions.id`, 0.2). `issueToken` гасит
прежние непогашенные доводы того же пользователя и назначения — иначе старая
ссылка из почты осталась бы рабочей. `consumeToken` — один условный `UPDATE …
WHERE used_at IS NULL AND expires_at > now() RETURNING user_id`: два
одновременных перехода оба не пройдут; просроченный, использованный и
несуществующий довод неразличимы (03 §4.3 TOKEN_INVALID). Строки не
удаляются по действию (кроме удаления аккаунта, §2.1): погашенные — след
выдачи; с 15.3 (Д-72) погашенные и просроченные старше
`AUTH_TOKEN_RETENTION_DAYS` (30 сут) снимает проход чистки (§2.31).

**Смена адреса (15.3, Д-73).** Довод `email_change` несёт новый адрес в
`new_email`: подтверждение по ссылке с НОВОГО ящика одной транзакцией
гасит довод (`consumeTokenRow` возвращает `user_id` и `new_email`), ставит
`users.email`/`email_verified_at`, гасит ждущие доводы `password_reset` и
`email_verify` и ставит уведомление на прежний адрес. Адрес, занятый к
этому моменту, даёт 23505 на `UPDATE users` — транзакция откатывается,
довод гасится отдельно и ответ тот же TOKEN_INVALID. Сессии не
завершаются: пароль не менялся. `admin_audit` не пишется — действие
пользователя над собой; след — погашенный довод с `new_email`.

### 2.31. mail_outbox

Очередь исходящих писем (беседа 9.1, миграция `0006_mail`). Ставит
`server/services/mail/outbox.ts`, разбирает `mail/worker.ts`.

```sql
CREATE TABLE mail_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email        TEXT NOT NULL,
  subject         TEXT NOT NULL,
  body_text       TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending'|'sent'|'failed'
  attempts        INT NOT NULL DEFAULT 0,           -- состоявшиеся ИСХОДЫ отправки
  last_error      TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ
);

CREATE INDEX idx_mail_outbox_status_next ON mail_outbox(status, next_attempt_at);
```

**Язык письма (14.1, Д-51).** `subject`/`body_text`/`body_html` хранятся
уже собранными под языком ПОЛУЧАТЕЛЯ (`users.ui_locale`; при регистрации —
язык запроса): `queueTokenMail` оборачивает сборку в `runWithLocale`, работник
почты языка не знает и не должен — у одного адресата один язык чтения.
`<html lang>` письма — тот же язык.

**Постановка — в транзакции действия** (`enqueue(exec, letter)`, образец —
`writeAudit` 8.1): падение почты не отменяет совершённого действия (отправка
отделена очередью), откат действия не оставляет письма. Сверх этого довод и
письмо пишутся под ТОЧКОЙ СОХРАНЕНИЯ (`underSavepoint`): сбой самой
постановки откатывает только её — без savepoint любая ошибка INSERT переводит
транзакцию PostgreSQL в aborted, и несостоявшееся письмо стоило бы человеку
регистрации.

**Два рода отказа** (`worker.ts`, род определяет `transport.classifySendError`):
постоянный (5xx SMTP; негодный адрес — `EENVELOPE` БЕЗ ответа узла) → сразу
`failed` с `last_error`, повторов нет (код ответа узла решает ПЕРВЫМ: отказ
`RCPT TO` nodemailer помечает `EENVELOPE` при любом коде, и 451 на адресате —
временный; найдено тестом R7 на моке SMTP); временный (4xx, сеть, таймаут) → `attempts+1` и
`next_attempt_at` с растущей задержкой (1 мин, 5, 15, 60 мин, 6 ч —
`MAIL_RETRY_DELAYS`), после шестой попытки → `failed`. Регистрация открытая:
опечатка в адресе или бот дают постоянный отказ, и если повторять такие
письма, число `pending` с прошедшим `next_attempt_at` — единственный признак
отставшего работника — забьётся мёртвыми. Отказ авторизации у узла (`EAUTH`,
535) и отказ на стадии соединения считаются ВРЕМЕННЫМИ вопреки коду 5xx: это
беда настройки службы, а не адресата.

**Захват — арендой**, без долгой транзакции: `UPDATE … SET next_attempt_at =
now() + 2 мин WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT 20)
RETURNING *`; разговор с узлом идёт вне транзакции. Два процесса одно письмо
не возьмут; процесс, умерший посреди отправки, вернёт письмо в очередь по
истечении аренды (доставка «не менее раза»). С пользователем строка не
связана намеренно: письмо — о совершённом действии.

**Тела затираются.** В `body_text`/`body_html` лежит живая ссылка-довод, а
`auth_tokens` хранит довод хэшем как раз затем, чтобы утечка таблицы ничего не
давала. Поэтому при переходе в `sent` и в `failed` работник записывает в оба
поля пустую строку; остаются адресат, тема, исход и `last_error`. В `pending`
ссылка лежит неизбежно — секунды до прохода работника.

**Чистка (15.3, Д-72).** `services/mail/maintenance.ts` — `runMaintenance`
зовётся на тике работника (`maybeMaintain`) реже основного цикла
(`MAINTENANCE_INTERVAL_MS`, час) под своим `try/catch` — сбой чистки не
ломает разбор очереди: три независимых `DELETE` — `mail_outbox` в
`sent`/`failed` старше `MAIL_RETENTION_DAYS` (30 сут; `pending` — живая
очередь, не трогается), `auth_tokens` (§2.30), истёкшие `sessions` (§2.2).
Вкладка «Почта» админки (03 §2.1 `GET /auth/mail-outbox`) показывает
счётчики `getOutboxCounts` (pending / overdue — ждущие с наступившим
сроком / sent / failed) и последние строки `listOutboxRows` без тел;
повтора отправки нет — тела затёрты.

### 2.32. recommendations

Разобранные строки подраздела «Таблица рекомендаций» раздела `critique`
(беседа 10.1, миграция `0007_recommendations`). Пишет только
`server/services/recommendations.ts`. Источник истины — HTML подраздела;
таблица — его разбор плюс состояние исполнения (статус, план).

```sql
CREATE TABLE recommendations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id       UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  round              INTEGER NOT NULL,        -- какая по счёту критика породила строку
  position           INTEGER NOT NULL,        -- место строки в таблице, с 1
  num                TEXT NOT NULL,           -- строкой: бывает «5а» / «5б» (развилка)
  address_subsection TEXT NOT NULL DEFAULT '',-- подраздел-адресат, имя как в документе
  address_section    TEXT,                    -- раздел, где сторож нашёл подраздел
  element            TEXT,                    -- NULL — рекомендация о подразделе целиком
  element_kind       TEXT,                    -- category | thesis | glossary_term
  element_id         UUID,                    -- строка categories / theses / glossary_terms
  op                 TEXT NOT NULL DEFAULT '',
  replacement        TEXT,                    -- готовая замена дословно; NULL — её нет
  rationale          TEXT NOT NULL DEFAULT '',-- подраздел критики, где проблема установлена
  severity           TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'new',
      -- new | planned | done | rejected | invalid | stale   (CHECK)
  invalid_reason     TEXT,                    -- что именно не сошлось у 'invalid' (русский вид находок)
  warning            TEXT,                    -- 12.3 (миграция 0012): замечание о строке; статус не меняет
  issues             JSONB,                   -- 12.3 (миграция 0013): находки сторожа КОДАМИ;
                                              --   NULL — строка разобрана до 12.3
  source_hash        TEXT,                    -- sha256 адресата на момент разбора
  round_hash         TEXT NOT NULL,           -- ключ раунда
  plan_id            UUID REFERENCES edit_plans(id) ON DELETE SET NULL,  -- заполняет 10.2
  step_index         INTEGER,                                            -- заполняет 10.2
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_recommendations_round_position
  ON recommendations (synthesis_id, round, position);
CREATE INDEX idx_recommendations_round_num ON recommendations (synthesis_id, round, num);
CREATE INDEX idx_recommendations_status    ON recommendations (synthesis_id, status);
```

**Ключ строки — `position`, не `num`.** Контракт таблицы велит рекомендацию,
затрагивающую два подраздела, писать ДВУМЯ строками с одним номером; развилка
даёт «5а»/«5б». Номер в раунде поэтому не уникален: `num` называет
рекомендацию (или вариант развилки), а строк у неё может быть несколько.
Полный повтор (№ + адрес + элемент) сторож помечает 'invalid'.

**Ключ раунда (`round_hash`) — sha256 исходника ПРОЗЫ** «Рекомендации по
улучшению» (`readSubsectionSource`), а не таблицы. Таблицу правят руками
(9.2 это разрешает), и починка негодной строки не должна открывать новый
раунд и терять статусы; проза же меняется при перегенерации критики — это и
есть смена раунда. Прозы нет (вырожденный документ) — ключом служит сама
таблица. Повторный разбор в пределах раунда пересобирает строки по текущей
таблице: `id` узнанных строк (тройка «№ + адрес + элемент») сохраняются, а
строки в работе (`planned`/`done`/`rejected`) сохраняют ещё статус и привязку
к плану; исчезнувшая из таблицы строка в работе дописывается в хвост.
Сравнение идёт с ПОСЛЕДНИМ сохранённым раундом (ограничение Огр-12, 07 §12;
проверено 12.3): проза, вернувшаяся дословно к его редакции, раунда не
открывает — строки раунда и относятся к этому тексту; возврат к редакции
более раннего раунда открывает новый, статусы не наследуются.

**Хэш источника (`source_hash`)**: у строки С ЭЛЕМЕНТОМ — sha256 значения
элемента (категория: name/type/definition/origin; тезис:
formulation/justification; термин: term/definition/extra_columns), БЕЗ
содержимого подраздела: «Таблицу категорий» служба перерисовывает целиком при
правке любой категории (5.1), и исполнение одной рекомендации делало бы
устаревшими все соседние. У строки без элемента — sha256 исходника
подраздела-адресата. Пересчёт против живого документа — `sourceHashFor`
(10.2: разошёлся → 'stale', адресата нет → 'invalid').

**`'stale'` заведён сразу**, хотя ставит его беседа 10.2: «текст изменился»
отдельно от 'invalid' «адрес не найден».

**Находки сторожа — кодами (беседа 12.3; Д-46, Д-21).** `issues` — массив
`{ level: 'invalid' | 'warning', code, params }`; коды — закрытый список
`RECOMMENDATION_ISSUE_CODES` (shared): сторож адресов 10.1 (номер, адрес,
элемент, операция, важность, повтор строки), «адресат исчез» планировщика
10.2, сверка столбца «Основание» 12.3. Фразу для человека собирает служба
ПРИ ЧТЕНИИ под языком запроса (`recommendation-issues.renderIssue`);
параметры — названия из документа и машинные значения контракта — не
переводятся, ключи разделов хранятся ключами. `invalid_reason` и `warning`
пишутся той же функцией (`withIssueTexts`) и несут РУССКИЙ вид тех же
находок при любом языке запроса — для SQL-диагностики и для строк до
миграции 0013: у них `issues IS NULL`, и читается сохранённый текст.
Статус строки определяют только находки уровня `invalid`; `warning`
(основание не названо, названо чужое либо ссылается на сами рекомендации)
статуса и `invalidCount` не меняет — строка ставится в план как обычная.
Перечитка обновляет замечания и у строк в работе; причины негодности у них
прежние.

**Кто ставит статусы (беседа 10.2).** Постановка плана
(`POST …/recommendations/plan`): строка → 'planned', `plan_id`, `step_index`;
хэш источника разошёлся → 'stale', адресата нет → 'invalid' с причиной — ни та
ни другая в план не идёт. Пересборка черновика (`PATCH` плана): шаг снят →
'rejected', снова подтверждён → 'planned'; `step_index` пишется заново — шаги
переставляются (`syncRecommendationSteps`). Исполнение: шаг done → 'done'; шаг
пропущен ЧЕЛОВЕКОМ после паузы (`skip_step`) → 'rejected'; пропущен СЛУЖБОЙ
(раздела больше нет) → снова 'new'. План удалён или остановлен (`stop`) — его
'planned' возвращаются в 'new' (`releaseRecommendations`): FK обнулил бы
`plan_id`, а строка осталась бы 'planned' навсегда. Перечитка того же текста
возвращает 'stale' в 'new' со свежим хэшем.

**Раунд в работе.** Пока в последнем раунде есть 'planned' с живым `plan_id`,
разбор СМЕНИВШЕГОСЯ текста нового раунда не открывает — 409
`ROUND_IN_PROGRESS` (`details`: round, planIds, nums). Перечитка того же
текста при 'planned' проходит. Осиротевшие 'planned' (`plan_id` NULL) раунд
не держат и снимаются тем же разбором.

**Статусы прошлого раунда не наследуются**: новый раунд — новые строки 'new';
строки прежних раундов остаются как были (`GET …/recommendations?round=N`).

**Удаление.** Синтез удаляется — строки уходят каскадом. Строка `users` в
таблице не участвует: `account-deletion` (7.1) удаляет синтезы владельца,
вопрос 9.1 о FK на users снят. План удалён — `plan_id` обнуляется.
**Элемент удалён (15.2, `deleteElement`)** — `element_id` → NULL («ссылка
гаснет», строка остаётся; `element_kind` и текст `element` — как были);
строки `new`/`stale` при этом → `invalid` кодом `target_element_gone` (их
бы и так отверг планировщик — `sourceHashFor` → null, — но без пометки
панель показывала бы их годными); `planned` только теряет ссылку —
исполняющий шаг (сам `delete_element` по этой рекомендации) переведёт её в
`done`.

### 2.33. synthesis_members

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

### 2.38. notifications

Уведомления получателю (беседа 16.2; миграция `0018_members_notifications`).
Пишутся ОДНОЙ точкой `services/notifications.ts: notify` исполнителем
вызывающего под точкой сохранения (сбой записи действие не отменяет);
актор своего события строки не получает; категория, отключённая
получателем (§2.39), не пишется вовсе. Фраза НЕ хранится (правило 14.2):
только код `type`, ссылки и параметры — клиент собирает её `tl()` на
языке интерфейса, сводка по почте — под языком получателя при постановке
письма. Доставка в приложении — опросом `unread-count` (без WebSocket),
по почте — сводкой (проход работника почты, `emailed_at`).

```sql
CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,      -- получатель
  type          TEXT NOT NULL CHECK (type IN ('member_invited','member_accepted','member_declined',
                  'member_role_changed','member_removed','comment_new','comment_reply',
                  'review_published','finding_outdated','proposal_created','proposal_decided')),
  synthesis_id  UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,              -- кто совершил; null — служба
  address       JSONB,                   -- DiscussionAddress объекта (комментарий, замечание)
  ref_kind      TEXT CHECK (ref_kind IS NULL OR ref_kind IN ('member','comment','review','finding','proposal')),
  ref_id        UUID,                    -- id объекта (без FK: объект может исчезнуть)
  payload       JSONB NOT NULL DEFAULT '{}',  -- { role?, excerpt? } — параметры фразы
  dedupe_key    TEXT,                    -- finding_outdated: outdated:<refKind>:<refId>:<hash>:<userId>
  read_at       TIMESTAMPTZ,
  emailed_at    TIMESTAMPTZ,             -- вошла в сводку по почте
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_synthesis ON notifications(synthesis_id);
CREATE UNIQUE INDEX uq_notifications_dedupe ON notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;
```

Категория типа (`NOTIFICATION_CATEGORY_OF`, shared): membership (member_*),
comments (comment_new, comment_reply), reviews (review_published), outdated
(finding_outdated), proposals (proposal_*; пишет 17.1). Список —
новые первыми, курсор — id последней строки, сравнение кортежем
`(created_at, id)` в PG (урок 16.1). «Объект моего открытого замечания
изменился» вычисляется ПРОХОДОМ `scanOutdatedAddresses` (не каждая
мутация документа двигает `syntheses.updated_at`): открытые корни
комментариев и замечания опубликованных рецензий сверяются
`resolveAddress`, у `outdated` — строка автору (если он ещё участник) один
раз на текущий хэш (`ON CONFLICT DO NOTHING` по частичному индексу).
Удаление аккаунта снимает строки получателя явно (7.1: CASCADE при
анонимизации молчит); строки, где удаляемый — актор, остаются.

### 2.39. notification_settings

Настройки получателя (беседа 16.2): отключённые категории и почтовая
сводка. Строки нет — всё включено.

```sql
CREATE TABLE notification_settings (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  muted_categories  JSONB NOT NULL DEFAULT '[]',   -- NotificationCategory[]
  email_digest      BOOLEAN NOT NULL DEFAULT true,
  digest_sent_at    TIMESTAMPTZ,                   -- когда уходила прежняя сводка
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Сводка (`runNotificationDigest`, тик работника почты): получатели — с
непрочитанным и `emailed_at IS NULL`, `email_digest` не выключен,
`digest_sent_at` старше `NOTIFY_DIGEST_INTERVAL_HOURS` (6; 0 — сводок нет);
письмо под языком получателя (до 20 строк + «…и ещё N»), строки помечаются
`emailed_at`, `digest_sent_at` ставится — той же транзакцией, что
постановка письма. Отключённые категории в сводку не входят (и
помечаются вошедшими — иначе держали бы получателя кандидатом).

## 3. Извлечение гранулярных элементов из HTML

При генерации Claude возвращает HTML. Бэкенд:
1. Сохраняет raw HTML в `sections.html_content`
2. Парсит HTML (аналог `parseGraph`, `parseTopology` из исходника) → извлекает элементы
3. Сохраняет в гранулярные таблицы (`categories`, `category_edges`, `theses`, `glossary_terms`)

Парсинг выполняется через `linkedom` (серверный DOM) или `cheerio`. Логика парсинга — прямой порт из исходника:
- `parseGraph()` (parseGraph()) → `categories` + `category_edges`
- `parseTopology()` (parseTopology()) → обновление `categories.cluster_indices`, `structural_roles`, `procedural_roles`; вставка `cluster_labels`
- Парсинг тезисов: таблица «Сводная таблица тезисов» → `theses`
- Парсинг глоссария: таблица «Таблица определений» → `glossary_terms`

**Направление записи**: HTML → гранулярные таблицы (при генерации).

При ручном редактировании элемента (решение 2026-09-02, аудит фаз 5–6,
п.1 вариант «а» в суженной форме): гранулярная таблица обновляется, затем
`element-renderer.ts` перерисовывает ТОЛЬКО затронутую таблицу и врезает
её в `sections.html_content` через `replaceDocTable()` (html-parser,
беседа 5.1: замена ОДНОЙ `table.doc-table` внутри подраздела с сохранением
`<h4>` и прозы; `spliceSubsectionHtml` 1.4b для этого не годится — заменяет
весь подраздел. Правка 2026-09-04, беседа 5.2). linkedom изолирован там же.

**Раздел целиком НЕ перерисовывается.** Гранулярные таблицы покрывают не
весь его текст: `parseThesesFromHTML` берёт формулировку/тип/новизну из
«Сводной таблицы тезисов», а `justification` собирает из прозаических
подразделов по индексу `<strong>формулировка</strong> текст`; у графа
вокруг «Таблицы категорий»/«Таблицы связей»/«Топологической таблицы»
живут преамбула и комментарии к кластерам. Перерисовка раздела стёрла бы
всё это.

Следствия, обязательные к соблюдению:

1. **Рендерер — точное обратное к парсеру.** Приёмка: round-trip
   `parse(render(x)) === x` на всех трёх таблицах графа, тезисах и
   глоссарии.
2. **Рендерер параметризован.** Столбцы глоссария зависят от
   `synth_level` (`extra_columns`), столбцы категорий — от
   `ext_graph_metrics`. Без параметров таблица выйдет не той ширины.
3. **Дрейф-контроль с промптами.** Форма таблиц задана шаблонами Prompt
   Registry (04 §2.3), а их правит админ в беседе 6.2 — пара
   «element-parser ↔ element-renderer» берётся под секцию
   integration-check, как `MODE_UI ↔ MODE_CONFIG` (4x) и
   `graph-style ↔ graph-utils` (4y).
4. **Поля вне таблиц** (обоснование тезиса, происхождение категории,
   прозаические подразделы) рендерером таблицы не покрываются: PATCH по
   ним либо правит абзац точечно, либо помечает раздел как требующий
   перегенерации. Молча терять правку нельзя.

## 4. Миграция из standalone-файлов

Импорт существующих HTML-файлов PhiloSynth использует ту же логику, что `importHTML()` (importHTML()) из исходника:

1. `POST /api/syntheses/import` с HTML-файлом
2. Сервер: `extractMetadata()` → `extractSections()` → `extractEmbeddedState()`
3. Создаёт запись в `syntheses`, заполняет `sections`
4. Парсит граф → `categories`, `category_edges`, `cluster_labels`
5. Парсит тезисы → `theses`
6. Парсит глоссарий → `glossary_terms`
7. Восстанавливает `genLog`, `ctxLog` из embedded state
8. Строит `synthesis_lineage` из генеалогии (с санацией имён:
   `normalizeGenealogyNames` — «[безымянная концепция]» как последний рубеж)
9. v11: читает `parentContextSchema` из embedded state (fallback
   'monolithic' для legacy-файлов) → `syntheses.parent_context_schema`;
   восстанавливает `keepFullBudget` → `syntheses.keep_full_budget`
