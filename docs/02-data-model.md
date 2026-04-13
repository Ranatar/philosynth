# PhiloSynth Service — Модель данных

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
  └── api_usage
  
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
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.2. sessions

```sql
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
```

### 2.3. syntheses

Центральная таблица. Каждая запись — один синтез.

```sql
CREATE TABLE syntheses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Параметры синтеза (аналог DOC_STATE.params)
  seed             TEXT NOT NULL DEFAULT '',
  method           TEXT NOT NULL DEFAULT 'dialectical',
    -- 'dialectical'|'integrative'|'deconstructive'|'hermeneutical'|'analytical'|'creative'
  synth_level      TEXT NOT NULL DEFAULT 'comparative',
    -- 'comparative'|'transformative'|'generative'
  depth            TEXT NOT NULL DEFAULT 'standard',
    -- 'overview'|'standard'|'deep'|'exhaustive'
  generation_order TEXT NOT NULL DEFAULT 'architectural',
    -- 'architectural'|'genetic'
  context          TEXT NOT NULL DEFAULT '',  -- доп. контекст пользователя
  lang             TEXT NOT NULL DEFAULT 'Russian',
  
  -- Состояние
  title            TEXT NOT NULL DEFAULT 'Синтез Философской Концепции',
  doc_num          TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'draft',
    -- 'draft'|'generating'|'ready'|'error'
  is_public        BOOLEAN NOT NULL DEFAULT false,
  
  -- Порядок разделов (массив ключей: ["sum","graph","glossary",...])
  section_order    JSONB NOT NULL DEFAULT '["sum"]',
  
  -- Версионирование (аналог DOC_STATE.docVersion)
  version_base     INT NOT NULL DEFAULT 1,
  version_sub      INT NOT NULL DEFAULT 0,
  version_modes    INT NOT NULL DEFAULT 0,
  version_mode_regen INT NOT NULL DEFAULT 0,
  
  -- Капсула (HTML, хранится отдельно от секций)
  capsule_html     TEXT NOT NULL DEFAULT '',
  
  -- Статистика
  total_input_tokens  INT NOT NULL DEFAULT 0,
  total_output_tokens INT NOT NULL DEFAULT 0,
  total_cost_usd      NUMERIC(10, 6) NOT NULL DEFAULT 0,
  
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_syntheses_user ON syntheses(user_id);
CREATE INDEX idx_syntheses_status ON syntheses(status);
CREATE INDEX idx_syntheses_public ON syntheses(is_public) WHERE is_public = true;
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
```

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
  html_content  TEXT NOT NULL DEFAULT '',
  sec_context   TEXT NOT NULL DEFAULT '',  -- доп. контекст раздела (secCtx)
  is_edited     BOOLEAN NOT NULL DEFAULT false,
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
  type_catalog_id  UUID REFERENCES category_type_catalog(id),  -- ссылка на каталог типов (нормализованный)
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
  type_catalog_id    UUID REFERENCES relationship_type_catalog(id),
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
  element_id   UUID NOT NULL,
  element_type TEXT NOT NULL,  -- 'category'|'edge'|'thesis'|'glossary_term'|'dialogue_turn'|'section'
  version      INT NOT NULL,
  data         JSONB NOT NULL,  -- полный снимок элемента до изменения
  change_source TEXT NOT NULL DEFAULT 'manual',
    -- 'manual'|'regenerated'|'cascade'|'auto_rename'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_versions_element ON element_versions(element_id, element_type);
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
  steps         JSONB NOT NULL DEFAULT '[]',  -- массив EditStep
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

### 2.15. generation_log

Аналог массива `genLog` из исходника.

```sql
CREATE TABLE generation_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id   UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  section_key    TEXT NOT NULL,
  section_label  TEXT NOT NULL DEFAULT '',
  log_type       TEXT NOT NULL DEFAULT 'generation',
    -- 'generation'|'version_marker'|'deletion_marker'
  source         TEXT NOT NULL DEFAULT 'initial',
    -- 'initial'|'edit'|'edit_add'|'cascade'|'subsection_regen'|'mode'|'mode_cascade'
  status         TEXT NOT NULL DEFAULT 'done',
  prior_chars    INT NOT NULL DEFAULT 0,
  task_chars     INT NOT NULL DEFAULT 0,
  input_chars    INT NOT NULL DEFAULT 0,
  output_chars   INT NOT NULL DEFAULT 0,
  input_tokens   INT NOT NULL DEFAULT 0,
  output_tokens  INT NOT NULL DEFAULT 0,
  cost_usd       NUMERIC(10, 6) NOT NULL DEFAULT 0,
  error_message  TEXT,
  -- Метаданные (secCtxPreview, modeParam, subsections и т.д.)
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
  entries       JSONB NOT NULL DEFAULT '[]',  -- массив { key, status, len, priority, ... }
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ctxlog_synthesis ON context_log(synthesis_id);
```

### 2.17. prompt_templates

```sql
CREATE TABLE prompt_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL,  -- 'system', 'method.dialectical.graph', ...
  version     INT NOT NULL DEFAULT 1,
  body        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  description TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID REFERENCES users(id),
  
  UNIQUE(key, version)
);

CREATE INDEX idx_prompts_key_active ON prompt_templates(key) WHERE is_active = true;
```

### 2.18. synthesis_configs

```sql
CREATE TABLE synthesis_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL,  -- 'context_deps.base', 'substitution_map', 'compat_matrix', ...
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
  synthesis_id  UUID REFERENCES syntheses(id),
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
  user_id       UUID NOT NULL REFERENCES users(id),
  synthesis_id  UUID REFERENCES syntheses(id),
  section_key   TEXT,
  billing_mode  TEXT NOT NULL,  -- 'byo'|'service'
  input_tokens  INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(10, 6) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_user ON api_usage(user_id);
CREATE INDEX idx_usage_synthesis ON api_usage(synthesis_id);
```

### 2.22. category_type_catalog

Фиксированный каталог типов категорий — слой нормализации.

```sql
CREATE TABLE category_type_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,   -- 'ontological', 'epistemological', ...
  name_ru     TEXT NOT NULL,          -- 'Онтологическая', 'Эпистемологическая', ...
  description TEXT NOT NULL DEFAULT '',
  is_system   BOOLEAN NOT NULL DEFAULT true,  -- системный (предзаполненный) или пользовательский
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Начальное заполнение: 18 типов из предыдущего проекта (ontological, epistemological, axiological, ethical, aesthetic, metaphysical, logical, practical, political, theological, anthropological, social, linguistic, phenomenological, existential, analytical, hermeneutical, cross_disciplinary).

### 2.23. relationship_type_catalog

Фиксированный каталог типов связей.

```sql
CREATE TABLE relationship_type_catalog (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key              TEXT NOT NULL UNIQUE,  -- 'hierarchical', 'dialectical', ...
  name_ru          TEXT NOT NULL,         -- 'Иерархическая', 'Диалектическая', ...
  description      TEXT NOT NULL DEFAULT '',
  default_direction TEXT NOT NULL DEFAULT 'unidirectional',
  is_system        BOOLEAN NOT NULL DEFAULT true,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Начальное заполнение: 29 типов из предыдущего проекта.

### 2.24. element_enrichments

Результаты точечных Claude-запросов для обогащения отдельных элементов.

```sql
CREATE TABLE element_enrichments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id   UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  element_id     UUID NOT NULL,
  element_type   TEXT NOT NULL,  -- 'category'|'edge'|'thesis'|'glossary_term'
  enrichment_type TEXT NOT NULL,  -- 'description'|'justification'|'evolution'|'characteristic'
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

### 2.25. characteristic_justifications

Философские обоснования числовых характеристик элементов.

```sql
CREATE TABLE characteristic_justifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
```

### 2.26. representation_transforms

История трансформаций graph↔theses — для откатов и аудита.

```sql
CREATE TABLE representation_transforms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesis_id    UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL,  -- 'graph_to_theses' | 'theses_to_graph'
  
  -- Снимки до трансформации (для отката)
  source_snapshot JSONB NOT NULL,  -- граф или тезисы ДО трансформации
  target_snapshot JSONB NOT NULL,  -- граф или тезисы ПОСЛЕ (старые, которые были заменены)
  
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

**Направление записи**: HTML → гранулярные таблицы (при генерации). При ручном редактировании элемента: гранулярная таблица обновляется, HTML в `sections.html_content` перегенерируется из гранулярных данных (server-side template).

## 4. Миграция из standalone-файлов

Импорт существующих HTML-файлов PhiloSynth использует ту же логику, что `importHTML()` (importHTML()) из исходника:

1. `POST /api/syntheses/import` с HTML-файлом
2. Сервер: `extractMetadata()` → `extractSections()` → `extractEmbeddedState()`
3. Создаёт запись в `syntheses`, заполняет `sections`
4. Парсит граф → `categories`, `category_edges`, `cluster_labels`
5. Парсит тезисы → `theses`
6. Парсит глоссарий → `glossary_terms`
7. Восстанавливает `genLog`, `ctxLog` из embedded state
8. Строит `synthesis_lineage` из генеалогии
