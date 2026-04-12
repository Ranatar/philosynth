# PhiloSynth Service — Итоги сессии 1 (скелет монорепозитория)

## Что сделано

- Монорепозиторий: root workspace + packages/shared + server + client
- TypeScript: base config + per-package configs, компиляция 0 ошибок
- Docker Compose: PostgreSQL 16 + Redis 7 (pg_trgm extension)
- Drizzle ORM: полная схема 26 таблиц, 30 FK, 7 UNIQUE, 33 индекса
- Начальная миграция 0000_initial.sql — протестирована на live PostgreSQL
- shared/types/: 11 файлов, 1113 строк, 111 экспортов — 1:1 со schema.ts
- shared/constants/: 6 файлов, 737 строк — сверены с исходником philosynth.html
  - 74 философа (70 из исходника + Демокрит, Авиценна, Аверроэс, Оккам)
  - 12 разделов (не 7), 34 ctx-ключа (не 19), коды Latin (не Cyrillic)
- scripts/seed-taxonomy.ts: готов (18 типов категорий + 29 типов связей)
- Полная кросс-верификация: schema ↔ types ↔ constants — 0 расхождений

## Оставшиеся TODO

### Категория A: заглушки — код не написан

#### A1. server/config/ — начальные значения для synthesis_configs seed
Данные нужно перенести из исходника philosynth.html (строки 4882–6117).

| Файл | Что содержит | Строки исходника |
|---|---|---|
| server/config/context-deps.ts | CONTEXT_DEPS_BASE, CONTEXT_DEPS_GENETIC | 4882–5126 |
| server/config/substitution-map.ts | SUBSTITUTION_MAP | 5171–5288 |
| server/config/compat-matrix.ts | COMPAT_MATRIX_COMPACT | 5896–6117 |
| server/config/intra-deps.ts | INTRA_DEPS | ? |
| server/config/subsection-ctx-keys.ts | SUBSECTION_TO_CTX_KEYS | ? |
| server/config/topology-roles.ts | TOPOLOGY_ROLES | ? |
| server/config/fragment-share.ts | FRAGMENT_SHARE, CONTEXT_BUDGET | ? |

#### A2. scripts/ — seed-скрипты

| Файл | Что должен делать |
|---|---|
| scripts/seed-prompts.ts | Перенести ~90–100 промптовых шаблонов из исходника в prompt_templates |
| scripts/seed-configs.ts | Записать config/ значения в synthesis_configs (используя A1) |
| scripts/migrate-html-files.ts | Массовый импорт HTML-файлов PhiloSynth в БД |

#### A3. shared/utils/ — минимальные реализации, нужен порт из исходника

| Файл | Что портировать | Статус |
|---|---|---|
| shared/utils/transliterate.ts | transliterate() | ✅ Портировано из исходника |
| shared/utils/normalize.ts | normalizeName, normalizeType | Минимальная реализация, нужен порт (строки 10502–10540) |
| shared/utils/escape.ts | esc() — уже работает, но упрощённый | Достаточно для MVP |

### Категория B: пустые директории — целые подсистемы

#### B1. server/routes/ — HTTP-роутеры (Hono)
16 файлов по 05-file-structure.md: auth, syntheses, sections, elements, transforms, taxonomy, enrichment, generation, plans, modes, lineage, prompts, billing, export, import, logs.

#### B2. server/services/ — бизнес-логика
20+ файлов: synthesis-engine, section-defs-builder, prompt-builder, context-builder, context-extractor, generation-service, streaming-manager, graph-parser, element-parser, cascade-analyzer, edit-planner, plan-executor, compat-advisor, cost-estimator, mode-service, element-editor, element-versioning, element-taxonomy, representation-transformer, element-enrichment, meta-synthesis-service, import-service, prompt-registry, billing-service, api-key-service, lineage-service, log-formatter, export/*.

#### B3. server/middleware/
4 файла: auth.ts, rate-limiter.ts, billing-check.ts, admin-only.ts.

#### B4. server/utils/
6 файлов: deep-merge.ts, topo-sort.ts, text.ts, css-audit.ts, html-parser.ts, crypto.ts.

#### B5. server/ws/
3 файла: handler.ts, connection-manager.ts, stream-state.ts.

#### B6. client/src/ — весь фронтенд
React 19 + Vite + Zustand + D3.js + Three.js: страницы, компоненты, хуки, stores, api-клиент.

### Категория C: server/index.ts — подключение роутов
Строка 26: `// TODO: auth, syntheses, sections, elements, generation, plans, modes, lineage, prompts, billing, export, import, logs`
Будет заполняться по мере создания route-файлов (B1).

---

## Файлы для контекста следующих бесед

### Обязательные (загружать всегда)

```
01-architecture.md          — проектный документ, архитектура
02-data-model.md            — проектный документ, модель данных
05-file-structure.md        — проектный документ, файловая структура
server/db/schema.ts         — Drizzle-схема, 26 таблиц, 928 строк
packages/shared/index.ts    — barrel export
```

### По теме беседы

| Следующая задача | Дополнительный контекст |
|---|---|
| Роуты + сервисы (B1, B2) | shared/types/*.ts, shared/constants/*.ts, server/env.ts, server/index.ts |
| Auth + middleware (B3) | shared/types/synthesis.ts (User, Session), server/env.ts |
| Seed промптов/конфигов (A1, A2) | server/config/*.ts, scripts/seed-*.ts, shared/constants/labels.ts |
| Context builder / extractor | shared/constants/ctx-keys.ts, shared/types/generation.ts |
| Graph parser / taxonomy | shared/types/graph.ts, shared/constants/section-labels.ts |
| Edit planner / cascade | shared/types/edit-plan.ts, shared/constants/ctx-keys.ts |
| WebSocket стриминг (B5) | shared/types/ws-messages.ts |
| Клиент (B6) | shared/types/*.ts, shared/constants/*.ts, client/package.json, client/tsconfig.json |
| Billing / API keys | shared/types/billing.ts, server/env.ts |
| Export/Import | shared/constants/phil-filename.ts, shared/constants/methods.ts |
