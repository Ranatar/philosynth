#!/usr/bin/env python3
"""Патч документации по итогам беседы 8.6 (модель публичности и гостевой
доступ — бэкенд; миграция 0005).
Запрос 1 (2026-09-15) — факты, ставшие постоянными:
  A  02 §2.3 — syntheses: is_public → visibility + четыре флага, индекс
     idx_syntheses_visibility, CHECK; §2.4 — pruneInvisible на visibility.
  B  03 §2.2 — GET /public и GET /:id гостевые (optionalAuth), правила
     смотрящего, PATCH с visibility/флагами (isPublic — синоним),
     SynthesisFull += visibility/флаги/authorName/scope, гостевой тип;
     §2.8 lineage — витрина проходит как метаданные; §2.10 GET /plans без
     входа; §2.11 экспорт — витрина 403, лог по show_logs; §2.12 логи —
     гейт effectiveFlags; §4.3 — META_NOT_ALLOWED.
  C  01 §6 — авторизация ресурсов на ступенях.
  D  04 §4 — строка «Новое» 8.6.
  E  05 — миграция 0005, optionalAuth, shared/utils/visibility.ts,
     env.local.example и dev-billing-state/ (без ведущей точки).
  F  07 — текст 8.6: п.1 «02 §2.4» → §2.3 (syntheses), примечание о
     SynthesisFullGuest и синониме isPublic.
Блок «По факту 8.6», 08, 09, README, §12, NEXT-CONTEXT — на ЗАВЕРШЕНИИ
беседы отдельными patch() в этом же скрипте.
Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patch-docs-conv86.py
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
applied = skipped = failed = 0


def patch(rel: str, old: str, new: str, label: str, superseded_by: str | None = None) -> None:
    """superseded_by — фрагмент более поздней правки (блок G), заменившей `new`
    этой: если он уже в тексте, правка считается применённой (skip), а не
    потерянной (fail). Применённые правки не редактируются (09 §2, 8.1)."""
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


P01 = "docs/01-architecture.md"
P02 = "docs/02-data-model.md"
P03 = "docs/03-specification.md"
P04 = "docs/04-code-reuse-map.md"
P05 = "docs/05-file-structure.md"
P07 = "docs/07-conversation-protocol.md"

# ── A. 02 ────────────────────────────────────────────────────────────────
patch(
    P02,
    """  status           TEXT NOT NULL DEFAULT 'draft',
    -- 'draft'|'generating'|'paused'|'ready'|'error'  -- 'paused' добавлен в v11
  is_public        BOOLEAN NOT NULL DEFAULT false,
""",
    """  status           TEXT NOT NULL DEFAULT 'draft',
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
""",
    "02 §2.3 колонки visibility/show_*/allow_meta",
)
patch(
    P02,
    """CREATE INDEX idx_syntheses_public ON syntheses(is_public) WHERE is_public = true;
""",
    """CREATE INDEX idx_syntheses_visibility ON syntheses(visibility) WHERE visibility <> 'private';
  -- 8.6: публичный каталог и pruneInvisible фильтруют по ступени (прежний
  -- idx_syntheses_public по is_public снят миграцией 0005)
""",
    "02 §2.3 индекс visibility",
)
patch(
    P02,
    """> **8.5 (2026-09-14):** у строк `parent_type='synthesis'` колонка""",
    """> **8.6 (2026-09-15):** «виден» для узла-концепции в дереве потомков
> (`pruneInvisible`, `/lineage/search`) = владелец ИЛИ `visibility <>
> 'private'` — витрина видна как узел (генеалогия есть метаданные), её
> содержание закрыто своими роутами. Владение обоих синтезов у `POST
> /lineage/link` осталось владельческим: публичность любой ступени правом
> не является.
>
> **8.5 (2026-09-14):** у строк `parent_type='synthesis'` колонка""",
    "02 §2.4 видимость узлов на visibility",
)

# ── B. 03 ────────────────────────────────────────────────────────────────
patch(
    P03,
    """Все ответы в формате JSON. Ошибки: `{ error: string, code: string, details?: any }`.
Аутентификация: cookie-based сессия (Lucia Auth). Все эндпоинты кроме auth требуют авторизации.
""",
    """Все ответы в формате JSON. Ошибки: `{ error: string, code: string, details?: any }`.
Аутентификация: cookie-based сессия (Lucia Auth). Все эндпоинты кроме auth требуют авторизации.

> **8.6 (2026-09-15) — гостевые пути.** Без сессии (`optionalAuth`: cookie
> валидируется, если есть; мёртвая/просроченная сессия = гость, не 401)
> доступны ровно ТРИ пути: `GET /syntheses/public`, `GET /syntheses/:id`,
> `GET /billing/plans`. Гостю никогда не отдаются стоимость, токены, логи,
> запросы и состояние паузы — это потолок, не настройка автора. Всё
> остальное (разделы, элементы, режимы, преобразования, экспорт, генерация,
> импорт, правка) — под `requireAuth`, как прежде.
""",
    "03 §2 преамбула — гостевые пути",
)
patch(
    P03,
    """GET    /syntheses/public       ?page=1&limit=20&search=...&philosopher=Кант
                                → { items: SynthesisPreview[], total: number }
""",
    """GET    /syntheses/public       ?page=1&limit=20&search=...&philosopher=Кант
                                → { items: SynthesisPreview[], total: number }
                                // 8.6: ГОСТЕВОЙ путь (optionalAuth). Каталог =
                                // все неприватные ступени (visibility <>
                                // 'private'): витрина тоже в списке — капсула и
                                // метаданные суть её смысл, содержание закрыто
                                // GET /:id. Гостю items без totalCostUsd
                                // (SynthesisPreviewGuest); зарегистрированному —
                                // с ним, флагом не управляется. authorName —
                                // при действенном show_author.
""",
    "03 §2.2 GET /public гостевой",
)
patch(
    P03,
    """GET    /syntheses/:id          → { synthesis: SynthesisFull }
                                // Доступ: владелец ИЛИ is_public = true
                                // (каталог «Публичные» ведёт на чужой
                                // /synthesis/:id). Иначе 403 FORBIDDEN;
                                // несуществующий id → 404 NOT_FOUND.
                                // Реализация — беседа 1.6 (сервер).
""",
    """GET    /syntheses/:id          → { synthesis: SynthesisFull | SynthesisFullGuest }
                                // 8.6: ГОСТЕВОЙ путь (optionalAuth). Правило
                                // чтения одно на весь транспорт —
                                // loadSynthesisForRead(id, userId | null) →
                                // { access:'ok', row, viewer:'owner'|'user'|
                                // 'guest', scope:'full'|'showcase' }:
                                //   владелец → всегда ok/owner/full;
                                //   visibility='private' и не владелец → 403;
                                //   'showcase' → ok со scope 'showcase';
                                //   'full' → ok со scope 'full';
                                //   userId=null → viewer 'guest'.
                                // Отсечение полей — ОДНОЙ функцией
                                // projectSynthesis(full, viewer, flags):
                                //   guest: без totalCostUsd/totalInputTokens/
                                //   totalOutputTokens и без pausedState/
                                //   pauseEstimates; при scope='full' документ
                                //   ОДНИМ ответом — sections: SectionFull[]
                                //   (гостю /sections недоступен);
                                //   user: стоимость и токены видны всегда;
                                //   scope='showcase' (любой невладелец):
                                //   sections не отдаются, pausedState/
                                //   pauseEstimates → null; capsuleHtml,
                                //   метаданные, философы, даты — отдаются;
                                //   authorName — только при действенном
                                //   show_author и непустом display_name.
                                // Несуществующий id → 404 NOT_FOUND.
                                // Реализация — беседа 1.6 (сервер), модель
                                // смотрящего — 8.6.
""",
    "03 §2.2 GET /:id по смотрящему",
    superseded_by="GET    /syntheses/:id          → { synthesis: SynthesisFull }\n                                // 8.6: ГОСТЕВОЙ путь",
)
patch(
    P03,
    """PATCH  /syntheses/:id          { title?, isPublic?, extGraphMetrics? }
                                → { synthesis: SynthesisFull }
""",
    """PATCH  /syntheses/:id          { title?, extGraphMetrics?,
                                 visibility?: 'private'|'showcase'|'full',
                                 showAuthor?, showLogs?, showPrompts?,
                                 allowMeta? }
                                → { synthesis: SynthesisFull }
                                // 8.6: visibility и четыре флага ВМЕСТО
                                // isPublic; значение вне перечисления → 400
                                // VALIDATION_ERROR с details.visibility. Флаг,
                                // присланный вместе с витриной, ПРИНИМАЕТСЯ и
                                // хранится (порядок правки не важен;
                                // действенность решает effectiveFlags при
                                // чтении). isPublic принимается устаревшим
                                // СИНОНИМОМ (true → 'full', false → 'private';
                                // вместе с visibility → 400) — клиент до 8.7
                                // шлёт именно его; в ответах isPublic —
                                // производное visibility !== 'private'.
""",
    "03 §2.2 PATCH visibility",
)
patch(
    P03,
    """                                // Только владелец. Единственный способ
                                // опубликовать синтез — без него вкладка
                                // «Публичные» недостижима из UI.""",
    """                                // Только владелец. Единственный способ
                                // опубликовать синтез — без него вкладка
                                // «Публичные» недостижима из UI (8.7 ставит
                                // переключатель ступени на место
                                // «Опубликовать»).""",
    "03 §2.2 PATCH — ссылка на 8.7",
)
patch(
    P03,
    """                                // Решения 1.6: доступ — только владелец;
                                // новый doc_num, title += « (копия)»,
                                // is_public=false; копируются разделы,""",
    """                                // Решения 1.6: доступ — только владелец;
                                // новый doc_num, title += « (копия)»,
                                // visibility='private' (8.6; флаги —
                                // дефолты схемы); копируются разделы,""",
    "03 §2.2 duplicate — visibility",
)
patch(
    P03,
    """  pauseEstimates: PauseEstimates | null; // v11: оценки действий паузы —""",
    """  // 8.6 — публичность (миграция 0005):
  visibility: 'private' | 'showcase' | 'full';
  showAuthor: boolean;  showLogs: boolean;   // сырые флаги, как в БД
  showPrompts: boolean; allowMeta: boolean;  // (действенность — effectiveFlags)
  authorName?: string;  // ТОЛЬКО при действенном show_author и непустом
                        // display_name; иначе поля нет
  scope: 'full' | 'showcase';  // чем смотрящему отдан документ
  pauseEstimates: PauseEstimates | null; // v11: оценки действий паузы —""",
    "03 §2.2 SynthesisFull += поля 8.6",
)
patch(
    P03,
    """  isPublic: boolean;
  isOwner: boolean;                     // 5.2 («По факту 5.2»): текущий""",
    """  isPublic: boolean;                    // @deprecated 8.6: производное
                                        // visibility !== 'private' — до
                                        // перевода клиента в 8.7
  isOwner: boolean;                     // 5.2 («По факту 5.2»): текущий""",
    "03 §2.2 SynthesisFull.isPublic deprecated",
)
patch(
    P03,
    """  philosophers: string[];
  parentSyntheses: { id: string, title: string }[];
  childSyntheses: { id: string, title: string }[];
}
```

### 2.3. Sections""",
    """  philosophers: string[];
  parentSyntheses: { id: string, title: string }[];
  childSyntheses: { id: string, title: string }[];
}
```

**SynthesisFullGuest** (8.6, ответ GET /syntheses/:id гостю):
```typescript
Omit<SynthesisFull, 'totalCostUsd' | 'totalInputTokens' | 'totalOutputTokens'>
  & { sections?: SectionFull[] }   // тела разделов при scope='full' —
                                   // документ одним ответом
```
Отдельный тип, а не необязательные поля в SynthesisFull: клиент до 8.7
читает cost-поля как обязательные (DocumentFooter); 8.7 учит клиент гостю.
SynthesisPreview += `visibility`, `authorName?`; `isPublic` в нём — тоже
производное (@deprecated). **SynthesisPreviewGuest** = Omit<SynthesisPreview,
'totalCostUsd'>.

### 2.3. Sections""",
    "03 §2.2 SynthesisFullGuest",
    superseded_by="**Гость в SynthesisFull** (8.6)",
)
patch(
    P03,
    """GET    /syntheses/:id/sections
                                → { sections: SectionSummary[] }
""",
    """GET    /syntheses/:id/sections
                                → { sections: SectionSummary[] }
                                // 8.6: контент-роуты (разделы, элементы, граф,
                                // тезисы, глоссарий, режимы, преобразования,
                                // обогащения, экспорт) невладельцу при
                                // scope='showcase' → 403 FORBIDDEN («концепция
                                // открыта витриной») — иначе витрина течёт
                                // боковым ходом. Гейт после стандартных
                                // 404/403 loadSynthesisForRead.
""",
    "03 §2.3 контент-роуты и витрина",
)
patch(
    P03,
    """GET    /syntheses/:id/lineage/ancestors?depth=10
                                → { tree: LineageNode }
""",
    """GET    /syntheses/:id/lineage/ancestors?depth=10
                                → { tree: LineageNode }
                                // 8.6: генеалогия — метаданные: витрина
                                // ПРОХОДИТ (как parentSyntheses в
                                // SynthesisFull); pruneInvisible потомков —
                                // владелец ИЛИ visibility <> 'private'.
""",
    "03 §2.8 lineage и витрина",
)
patch(
    P03,
    """GET    /billing/plans            → { plans: SubscriptionPlan[] }
                                // Только is_active = true, по возрастанию""",
    """GET    /billing/plans            → { plans: SubscriptionPlan[] }
                                // 8.6: БЕЗ ВХОДА (optionalAuth) — цена службы
                                // видна до регистрации; единственный
                                // billing-путь вне requireAuth сверх webhook.
                                // Только is_active = true, по возрастанию""",
    "03 §2.10 GET /plans гостю",
)
patch(
    P03,
    """GET    /syntheses/:id/export/md     → text/markdown
```
""",
    """GET    /syntheses/:id/export/md     → text/markdown
```

> **8.6:** экспорт под `requireAuth`, как прежде. Невладельцу: при
> `scope='showcase'` → 403; при недейственном `show_logs` выгрузка HTML идёт
> БЕЗ лога (embedded `genLog`/`ctxLog` пусты, блока «◈ Лог контекста и
> генерации» нет; формат файла тот же), стоимость в шапке/футере остаётся —
> она не под флагом (`exportHTML(id, { includeLogs })`).
""",
    "03 §2.11 экспорт и флаги",
    superseded_by="**Футер в экспорте (найдено 8.6, утрачено 4.2).**",
)
patch(
    P03,
    """                                       // Аналог formatCtxLog() и colorizeLog()
```
""",
    """                                       // Аналог formatCtxLog() и colorizeLog()
```

> **8.6 — гейт логов (`logsAllowed`, routes/logs.ts, все четыре пути):**
> viewer `owner` → всегда, при любых флагах и ступени; `user` →
> generation/context/formatted при действенном `show_logs`, prompts при
> действенном `show_prompts`, иначе 403 (на витрине оба погашены → 403);
> `guest` → 403 всегда (роуты под `requireAuth`, но гейт стоит — маршрут
> может открыться позже). Стоимость и токены (SynthesisFull) сюда не
> относятся — они флагом не управляются.
""",
    "03 §2.12 гейт логов",
)
patch(
    P03,
    """LINEAGE_EXISTS      — POST /lineage/link: такая пара уже есть — 409, идемпотентный
                      отказ без дубликата строки (8.5; код не назван текстом
                      беседы — заведён по образцу пары выше)
```""",
    """LINEAGE_EXISTS      — POST /lineage/link: такая пара уже есть — 409, идемпотентный
                      отказ без дубликата строки (8.5; код не назван текстом
                      беседы — заведён по образцу пары выше)
META_NOT_ALLOWED    — POST /syntheses: чужая концепция в участниках без
                      ДЕЙСТВЕННОГО allow_meta (visibility='full' && allow_meta;
                      витрина — никогда) — 403; details: { participants: id,
                      title } (8.6). Своя концепция годится всегда.
```""",
    "03 §4.3 META_NOT_ALLOWED",
)
patch(
    P03,
    """                                // 3.1: participants принимает {type:'synthesis',
                                //   synthesisId} — доступ (владелец ИЛИ публичный,
                                //   403) и пригодность (validateConceptForMeta-""",
    """                                // 3.1: participants принимает {type:'synthesis',
                                //   synthesisId} — доступ (владелец ИЛИ неприватная,
                                //   403; 8.6: чужая — только при действенном
                                //   allow_meta, иначе 403 META_NOT_ALLOWED с
                                //   названием) и пригодность (validateConceptForMeta-""",
    "03 §2.2 POST participants — allow_meta",
)

# ── C. 01 ────────────────────────────────────────────────────────────────
patch(
    P01,
    """**Авторизация ресурсов:**
- Синтез принадлежит пользователю (`syntheses.userId`)
- Публичные синтезы: `syntheses.isPublic` — доступны для просмотра и мета-синтеза всем
- Приватные — только владельцу
- Элементы синтеза наследуют доступ от синтеза""",
    """**Авторизация ресурсов** (модель 8.6, миграция 0005):
- Синтез принадлежит пользователю (`syntheses.userId`); владелец видит и
  правит всё при любой ступени
- Ступень видимости `syntheses.visibility`: `private` — только владелец;
  `showcase` — витрина (капсула, метаданные, философы, даты; содержание
  закрыто); `full` — произведение целиком
- Четыре флага автора: `show_author` (обе неприватные ступени),
  `show_logs`, `show_prompts`, `allow_meta` (только при `full` —
  действенность решает `effectiveFlags`, сырые значения не сбрасываются)
- Гость (без сессии, `optionalAuth`): ровно три пути — публичный каталог,
  документ, тарифы; стоимость/токены/логи/запросы/пауза — никогда
- Зарегистрированный: стоимость и токены у любой неприватной концепции
  (флагом не управляются); логи и запросы — по флагам автора
- Мета-синтез с чужой концепцией — только при действенном `allow_meta`
  (`META_NOT_ALLOWED`); витрина в участники не годится
- Элементы синтеза наследуют доступ от синтеза; витрина невладельцу на
  контент-роутах → 403""",
    "01 §6 авторизация ресурсов 8.6",
)

# ── D. 04 ────────────────────────────────────────────────────────────────
patch(
    P04,
    """| `scripts/bootstrap-admin.ts`, `packages/shared/constants/auth.ts` | НОВОЕ (8.1):""",
    """| `optionalAuth`/`viewerOf` в `server/middleware/auth.ts`; `loadSynthesisForRead(id, userId \\| null)` → `{ viewer, scope }`, `projectSynthesis`/`projectPreview`, `loadAuthorNamesFor`, `metaAllowedFor`, `showcaseForbiddenJson`/`metaNotAllowedJson` в `server/routes/syntheses.ts`; `logsAllowed` в `routes/logs.ts`; `exportHTML(id, { includeLogs })`; `effectiveFlags`/`isPublicOf` в `packages/shared/utils/visibility.ts`; миграция `0005_visibility` | НОВОЕ (8.6): в одностраничнике публикации нет вовсе — ступень видимости вместо булева `is_public` (перенос данных в миграции), гостевые пути (`GET /syntheses/public`, `GET /syntheses/:id`, `GET /billing/plans`) под `optionalAuth`, отсечение полей по смотрящему одной функцией (гость без стоимости/токенов/паузы, витрина без содержания), гейт логов/запросов и пригодности к мета-синтезу через одну `effectiveFlags`, витрина невладельцу на контент-роутах → 403. `isPublic` в DTO — производное (@deprecated до 8.7), в PATCH — синоним |
| `scripts/bootstrap-admin.ts`, `packages/shared/constants/auth.ts` | НОВОЕ (8.1):""",
    "04 §4 строка 8.6",
    superseded_by="`renderDocFooter` (зеркало DocumentFooter [4202]",
)

# ── E. 05 ────────────────────────────────────────────────────────────────
patch(
    P05,
    """├── .env.local.example              # 8.2: окружение ЛОКАЛЬНОГО СТЕНДА биллинга""",
    """├── env.local.example               # 8.2: окружение ЛОКАЛЬНОГО СТЕНДА биллинга.
│                                   # 8.6: ИМЯ БЕЗ ВЕДУЩЕЙ ТОЧКИ (было .env.local.example):
│                                   # загрузка «Add files via upload» четыре раза подряд
│                                   # (83aaf2b, 8f9bae0, cd46374, 32171a9) теряла dotfile;
│                                   # dev-billing.sh и 4ak переведены на новое имя, старое
│                                   # в дереве — ошибка 4ak. Прежнее описание:""",
    "05 env.local.example без точки",
)
patch(
    P05,
    """│                                   # и В ТРЕТИЙ РАЗ воссоздан 8.5 — HEAD cd46374, вместе с
│                                   # .dev-billing/ в .gitignore и STRIPE_PRICE_* в .env.example)""",
    """│                                   # и В ТРЕТИЙ РАЗ воссоздан 8.5 — HEAD cd46374, вместе с
│                                   # .dev-billing/ в .gitignore и STRIPE_PRICE_* в .env.example;
│                                   # в ЧЕТВЁРТЫЙ — 8.6, HEAD 32171a9, после чего переименован)
├── dev-billing-state/              # 8.6: pid-файлы и логи стенда (в .gitignore; было
│                                   # .dev-billing/ — строка .gitignore терялась при выкладке,
│                                   # папка без точки переживает её)""",
    "05 dev-billing-state/",
)
patch(
    P05,
    """│   │       ├── 0004_admin_audit.sql    # 8.1: таблица admin_audit (тег переименован из генерата)""",
    """│   │       ├── 0004_admin_audit.sql    # 8.1: таблица admin_audit (тег переименован из генерата)
│   │       ├── 0005_visibility.sql     # 8.6: syntheses.visibility + show_author/show_logs/
│   │       │                           #  show_prompts/allow_meta, ПЕРЕНОС is_public → visibility,
│   │       │                           #  DROP is_public, idx_syntheses_visibility, CHECK; SQL и
│   │       │                           #  снапшот написаны рукой (generate спрашивал о переименовании
│   │       │                           #  интерактивно), `drizzle-kit generate` после — «No schema changes»""",
    "05 миграция 0005",
)
patch(
    P05,
    """│   │   ├── auth.ts                     # Lucia Auth: проверка сессии""",
    """│   │   ├── auth.ts                     # Lucia Auth: проверка сессии
│   │   │                               # 8.6: + optionalAuth (сессия, если есть; иначе гость,
│   │   │                               #  не 401) и viewerOf(c) для гостевых роутов""",
    "05 optionalAuth",
)
patch(
    P05,
    """│           └── colorize-log.ts         # colorizeLog() — единая реализация (2.4;
│                                       # клиент реэкспортирует)""",
    """│           ├── colorize-log.ts         # colorizeLog() — единая реализация (2.4;
│           │                           # клиент реэкспортирует)
│           └── visibility.ts           # 8.6: effectiveFlags(row) — ОДНА функция действенности
│                                       # флагов публичности (сервер и клиент 8.7); isPublicOf""",
    "05 shared/utils/visibility.ts",
)
patch(
    P05,
    """│   ├── syntheses.ts                # CRUD /syntheses, /syntheses/:id""",
    """│   ├── syntheses.ts                # CRUD /syntheses, /syntheses/:id
│   │                               # 8.6: loadSynthesisForRead → viewer/scope, projectSynthesis/
│   │                               #  projectPreview, гостевые GET /public и GET /:id (optionalAuth),
│   │                               #  PATCH visibility + флаги, META_NOT_ALLOWED в участниках""",
    "05 routes/syntheses 8.6",
)
patch(
    P05,
    """│   │                                   # (создаёт беседа 2.4; /logs/prompts —
│   │                                   #  без skeleton-fallback до 4.2)""",
    """│   │                                   # (создаёт беседа 2.4; /logs/prompts —
│   │                                   #  без skeleton-fallback до 4.2)
│   │                                   # 8.6: logsAllowed — гейт по effectiveFlags на четырёх путях""",
    "05 routes/logs 8.6",
)
patch(
    P05,
    """│   │                               #  13 эндпоинтов §2.10; /webhook вне requireAuth)""",
    """│   │                               #  13 эндпоинтов §2.10; /webhook вне requireAuth;
│   │                               #  8.6: GET /plans под optionalAuth — тарифы гостю)""",
    "05 routes/billing 8.6",
)

# ── F. 07 — текст 8.6 ────────────────────────────────────────────────────
patch(
    P07,
    """   g. Индекс по visibility (публичный каталог фильтрует по нему).
   Разделы 02 §2.4 и 03 §2.2 переписать под новую модель.
""",
    """   g. Индекс по visibility (публичный каталог фильтрует по нему).
   Разделы 02 §2.4 и 03 §2.2 переписать под новую модель.
   (Уточнение 8.6: таблица syntheses — 02 §2.3, §2.4 — synthesis_lineage;
   в §2.4 правится только примечание о видимости узлов pruneInvisible.)
""",
    "07 8.6 п.1 адрес 02 §2.3",
)
patch(
    P07,
    """   Типы в packages/shared править аккуратно: поля становятся
   необязательными, а не исчезают.
""",
    """   Типы в packages/shared править аккуратно: поля становятся
   необязательными, а не исчезают.
   (По факту 8.6: cost-поля в SynthesisFull/SynthesisPreview остались
   обязательными — клиент до 8.7 читает их как число (DocumentFooter), а
   client/ беседа не правит; гостевая проекция описана отдельными типами
   SynthesisFullGuest/SynthesisPreviewGuest = Omit<…>. isPublic в DTO —
   производное visibility !== 'private' (@deprecated), в PATCH — синоним;
   иначе «Опубликовать» в каталоге сломался бы на живом сервере до 8.7.)
""",
    "07 8.6 п.5 отступление типов",
    superseded_by="(По факту 8.6: сделано по букве",
)

# ── G. Пересмотр после обсуждения запроса 1 (2026-09-15): типы — по букве
#      беседы (cost-поля необязательны, гостевых типов нет; правка
#      DocumentFooter — устранение рассогласования, не витрина); футер в
#      экспорте восстановлен (утрачен 4.2). Отдельными patch(): применённые
#      правки не редактируются (09 §2, 8.1). ────────────────────────────
patch(
    P03,
    """**SynthesisFullGuest** (8.6, ответ GET /syntheses/:id гостю):
```typescript
Omit<SynthesisFull, 'totalCostUsd' | 'totalInputTokens' | 'totalOutputTokens'>
  & { sections?: SectionFull[] }   // тела разделов при scope='full' —
                                   // документ одним ответом
```
Отдельный тип, а не необязательные поля в SynthesisFull: клиент до 8.7
читает cost-поля как обязательные (DocumentFooter); 8.7 учит клиент гостю.
SynthesisPreview += `visibility`, `authorName?`; `isPublic` в нём — тоже
производное (@deprecated). **SynthesisPreviewGuest** = Omit<SynthesisPreview,
'totalCostUsd'>.
""",
    """**Гость в SynthesisFull** (8.6): `totalCostUsd`, `totalInputTokens`,
`totalOutputTokens` — необязательные поля (гостю сервер их не отдаёт
никогда; зарегистрированному — всегда у неприватной); `sections?:
SectionFull[]` — тела разделов ТОЛЬКО гостю при scope='full' (документ одним
ответом). Отдельного гостевого типа нет: клиентский `DocumentFooter`
рисует строку стоимости только при определённых значениях (единственная
правка client/ в 8.6 — устранение рассогласования типов, не витрина).
SynthesisPreview += `visibility`, `authorName?`, `totalCostUsd?` (гостю в
`/public` поля нет); `isPublic` в нём — тоже производное (@deprecated).
""",
    "03 §2.2 гость — необязательные поля вместо Guest-типов",
)
patch(
    P03,
    """GET    /syntheses/:id          → { synthesis: SynthesisFull | SynthesisFullGuest }""",
    """GET    /syntheses/:id          → { synthesis: SynthesisFull }""",
    "03 §2.2 GET /:id — один тип ответа",
)
patch(
    P03,
    """> **8.6:** экспорт под `requireAuth`, как прежде. Невладельцу: при
> `scope='showcase'` → 403; при недейственном `show_logs` выгрузка HTML идёт
> БЕЗ лога (embedded `genLog`/`ctxLog` пусты, блока «◈ Лог контекста и
> генерации» нет; формат файла тот же), стоимость в шапке/футере остаётся —
> она не под флагом (`exportHTML(id, { includeLogs })`).
""",
    """> **8.6:** экспорт под `requireAuth`, как прежде. Невладельцу: при
> `scope='showcase'` → 403; при недейственном `show_logs` выгрузка HTML идёт
> БЕЗ лога (embedded `genLog`/`ctxLog` пусты, блока «◈ Лог контекста и
> генерации» нет), итоговая стоимость остаётся в ФУТЕРЕ документа — она не
> под флагом (`exportHTML(id, { includeLogs })`).
>
> **Футер в экспорте (найдено 8.6, утрачено 4.2).** В исходнике `#docFooter`
> лежал внутри `#docOutput` и уезжал в файл вместе с `footerCost`; 4.2
> собрала документ как шапку-зеркало DocumentHeader плюс разделы — без
> футера, и стоимость в файле сервиса жила только в записях `genLog`
> embedded state. 8.6 восстановила зеркало DocumentFooter
> (`renderDocFooter`: «Токены: N вх. + M вых. · Стоимость: $X.XXXX (Y¢)» из
> строки syntheses, сессия = docNum, `#footerPhil` — философы или «—»);
> импорт 4.3 читает философов из `#footerPhil` первым источником.
""",
    "03 §2.11 футер экспорта",
)
patch(
    P07,
    """   (По факту 8.6: cost-поля в SynthesisFull/SynthesisPreview остались
   обязательными — клиент до 8.7 читает их как число (DocumentFooter), а
   client/ беседа не правит; гостевая проекция описана отдельными типами
   SynthesisFullGuest/SynthesisPreviewGuest = Omit<…>. isPublic в DTO —
   производное visibility !== 'private' (@deprecated), в PATCH — синоним;
   иначе «Опубликовать» в каталоге сломался бы на живом сервере до 8.7.)
""",
    """   (По факту 8.6: сделано по букве — cost-поля и sections необязательны;
   единственная правка client/ — DocumentFooter рисует стоимость только при
   определённых значениях: устранение рассогласования типов, не витрина.
   Первая редакция заводила гостевые Omit-типы, посчитав запрет жёстче, чем
   он есть, — снята по обсуждению. isPublic в DTO — производное
   visibility !== 'private' (@deprecated), в PATCH — синоним; иначе
   «Опубликовать» в каталоге сломался бы на живом сервере до 8.7 — а его
   замена на переключатель ступени и есть предмет 8.7.)
""",
    "07 8.6 п.5 — пересмотр отступления типов",
)
patch(
    P07,
    """10. Экспорт (routes/export.ts) — под requireAuth, как сейчас; но для
    невладельца: при scope='showcase' → 403; при недейственном show_logs
    убрать из выгрузки лог (стоимость остаётся: она не под флагом).
    Формат файла не менять.
""",
    """10. Экспорт (routes/export.ts) — под requireAuth, как сейчас; но для
    невладельца: при scope='showcase' → 403; при недейственном show_logs
    убрать из выгрузки лог (стоимость остаётся: она не под флагом).
    Формат файла не менять.
    (По факту 8.6: «стоимость остаётся» было неисполнимо — экспорт 4.2
    потерял футер документа, и стоимость в файле жила только в genLog.
    Восстановлено зеркало DocumentFooter в html-exporter (renderDocFooter):
    итог из строки syntheses, как в исходнике [4202]; из трёх мест
    стоимости в файле (записи лога, итог лога, футер) флаг закрывает
    только лог.)
""",
    "07 8.6 п.10 — футер экспорта",
)
patch(
    P05,
    """│   │       ├── html-exporter.ts        # saveHTML + buildGraphExportSection + buildModesExportSection
│   │       │                           # (saveHTML + buildGraphExportSection)""",
    """│   │       ├── html-exporter.ts        # saveHTML + buildGraphExportSection + buildModesExportSection
│   │       │                           # (saveHTML + buildGraphExportSection)
│   │       │                           # 8.6: + renderDocFooter (зеркало DocumentFooter — утрачено
│   │       │                           #  4.2) и exportHTML(id, { includeLogs }) — выгрузка без лога""",
    "05 html-exporter футер",
)
patch(
    P05,
    """│   │   │   │   └── DocumentFooter.tsx      # Футер (стоимость, участники)""",
    """│   │   │   │   └── DocumentFooter.tsx      # Футер (стоимость, участники); 8.6: строка стоимости
│   │   │   │                               #  только при определённых totalCostUsd/токенах (гостю их нет)""",
    "05 DocumentFooter 8.6",
)
patch(
    P04,
    """`exportHTML(id, { includeLogs })`; `effectiveFlags`/`isPublicOf` в `packages/shared/utils/visibility.ts`; миграция `0005_visibility` | НОВОЕ (8.6):""",
    """`exportHTML(id, { includeLogs })` + `renderDocFooter` (зеркало DocumentFooter [4202] — утрачено 4.2); `effectiveFlags`/`isPublicOf` в `packages/shared/utils/visibility.ts`; миграция `0005_visibility` | НОВОЕ (8.6):""",
    "04 §4 renderDocFooter",
)

# ── H. ЗАВЕРШЕНИЕ беседы 8.6 (2026-09-15): «По факту 8.6», врезка Фазы 8,
#      §12, 08 (I/II/III), 09 (§2, §3, §5), README ────────────────────────
P08 = "docs/08-history.md"
P09 = "docs/09-lessons.md"
PRM = "README.md"

patch(
    P07,
    """- «Edge case: гость на любом пути кроме трёх открытых → 401; cookie просроченной сессии на гостевом пути → трактуется как гость, не 401»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 8.7:""",
    """- «Edge case: гость на любом пути кроме трёх открытых → 401; cookie просроченной сессии на гостевом пути → трактуется как гость, не 401»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 8.6 (2026-09-15) — отступления от буквы запроса и найденное:**

1. **Запрет «не трогать client/» перечитан вместе с пользователем**: он не
   распространяется на устранение рассогласований документации. Первая
   редакция запроса 1 заводила гостевые Omit-типы (SynthesisFullGuest/
   SynthesisPreviewGuest), чтобы не трогать DocumentFooter, — снята:
   cost-поля и `sections` в SynthesisFull необязательны по букве п.5,
   DocumentFooter рисует строку стоимости только при определённых значениях,
   `ApiErrorCode` += META_NOT_ALLOWED (п.8 велел). Замена «Опубликовать» на
   переключатель ступени остаётся 8.7 — потому `isPublic` в DTO производное
   (`visibility !== 'private'`, @deprecated), а в PATCH — синоним
   (true → 'full', false → 'private'; вместе с visibility → 400).
2. **Экспорт 4.2 потерял футер документа.** В исходнике `#docFooter` лежал
   внутри `#docOutput` и уезжал в файл с `footerCost`; html-exporter собрал
   документ как шапку-зеркало плюс разделы — без футера, и стоимость в файле
   сервиса жила только в записях genLog, отчего п.10 «убрать лог, стоимость
   остаётся» был неисполним. Восстановлено зеркало DocumentFooter
   (`renderDocFooter`: итог из строки syntheses, сессия = docNum,
   `#footerPhil` — философы или «—», без подписи «свободный синтез»: импорт
   4.3 читает философов оттуда первым источником; round-trip проверен). Из
   трёх мест стоимости в файле (записи лога, итог лога, футер) флаг
   `show_logs` закрывает только лог.
3. **Витрина и контент-роуты.** П.5 отсекает разделы только в GET /:id, а
   /sections, /categories, /theses, /glossary, /modes, /transforms,
   /enrichments под requireAuth отдавали чужому зарегистрированному всё —
   витрина текла боковым ходом (тот же довод, что у запроса про логи и
   мета-синтез). Гейт `scope === 'showcase' → 403 showcaseForbiddenJson`
   стоит на 13 точках по числу loadSynthesisForRead (3/5/2/1/2); lineage
   ancestors/descendants витрину пропускают — генеалогия есть метаданные
   (как parentSyntheses в SynthesisFull). Витрина ВХОДИТ в публичный каталог
   (капсула и метаданные — её смысл); текст беседы этого не оговаривал.
4. **pausedState/pauseEstimates** невладельцу на витрине и гостю → null:
   genParams несут зерно и secCtx — рабочее состояние владельца. Чужому
   зарегистрированному на 'full' оставлены как были (не просили).
5. **Миграция 0005 написана рукой** (SQL и снапшот): `drizzle-kit generate`
   спрашивает интерактивно «переименование ли is_public → visibility» и не
   вставит UPDATE между ADD и DROP; после — «No schema changes». Перенос
   проверен живьём на PG16 (pub → full, priv → private, CHECK ловит 'mine').
6. **POST /syntheses отвечает 201**, тестовый запрос R11 кода не называл;
   `/estimate` на БД без посевов Registry падает 500 — стенд проверяет только
   «не 403 META_NOT_ALLOWED» (оценка — не гейт).
7. **Dotfile-грабля ЧЕТВЁРТЫЙ раз** (HEAD 32171a9) — решена переименованием:
   `env.local.example` и `dev-billing-state/` без ведущей точки, 4ak/4al
   переведены, старое имя в дереве — ошибка 4ak.
8. **Дыры комплекта**: текст 8.6 п.1 писал «02 §2.4» для syntheses (верно
   §2.3); блоков «По факту 2.4» и «По факту 3.1» в 07 нет (у 2.4 — «Итоги
   тестов», у 3.1 — только глава 08), хотя их называют NEXT-CONTEXT и
   комплект; NEXT-CONTEXT включал «По факту 6.1», комплект пользователя —
   нет; 03 §2 преамбула «все эндпоинты кроме auth требуют авторизации» и
   01 §6 «syntheses.isPublic доступны всем» устарели — переписаны.
9. **Идемпотентность патч-скриптов**: правка, заменяющая ранее применённый
   `new` (блок G поверх A), ломает более раннюю patch() — та снова находит
   свой `old` и ДУБЛИРУЕТ сноску на повторном прогоне; patch() получил
   `superseded_by`, проверка — чистая копия ×3 и побайтовое равенство
   рабочих доков чистому применению (09 §2).
10. **Стенд 8.6** — живой сервер :3186 на отдельной пустой БД philosynth_t86
    (drizzle-kit migrate 0000–0005) + отдельная philosynth_t86mig для R2
    (0000–0004 руками по statement-breakpoint → строки is_public → 0005);
    все 13 запросов API-уровня, браузер не нужен, моки не нужны (генерация
    R11 бьётся о ANTHROPIC_BASE_URL=127.0.0.1:1 фоном). 102 ✓ ×2.

---

### Беседа 8.7:""",
    "07 «По факту 8.6»",
)
patch(
    P07,
    """> витрина) добавлены 2026-09-14 и не проведены.""",
    """> витрина) добавлены 2026-09-14; 8.6 проведена 2026-09-15, 8.7 — следующая.""",
    "07 врезка Фазы 8 — 8.6 проведена",
)
patch(
    P07,
    """`gm-hint` в GraphModal без CSS-правила предсуществует (чей — решать при
следующем касании GraphModal).
""",
    """`gm-hint` в GraphModal без CSS-правила предсуществует (чей — решать при
следующем касании GraphModal).

Беседа 8.6 (2026-09-15) долгов не оставила: реестр пуст. Ограничения без
адресата (не долги): `isPublic` в DTO и синоним в PATCH — снять в 8.7 вместе
с «Опубликовать» (переключатель ступени); pausedState чужому
зарегистрированному на 'full' отдаётся как до 8.6 (genParams несут зерно —
если прятать, то отдельным решением); правки чужой концепции и ролей
редакторов нет («чего не делать» 8.6).
""",
    "07 §12 — 8.6 без долгов",
)
patch(
    P08,
    """пуст. Первоначальный состав Фазы 8 (8.1–8.5) закрыт; остались 8.6/8.7.
""",
    """пуст. Первоначальный состав Фазы 8 (8.1–8.5) закрыт; остались 8.6/8.7.
Беседа 8.6 (модель публичности и гостевой доступ; бэкенд) ЗАКРЫТА
2026-09-15: миграция 0005 — visibility ('private'|'showcase'|'full') + четыре
флага вместо is_public с переносом данных; effectiveFlags (shared) — одна
точка действенности (logs/prompts/meta только при 'full', автор — на обеих
неприватных); optionalAuth + гостевые пути ровно три (GET /syntheses/public,
GET /syntheses/:id с sections одним ответом, GET /billing/plans); гостю
никогда — стоимость, токены, логи, запросы, пауза; loadSynthesisForRead →
viewer/scope, projectSynthesis — одна точка отсечения; витрина на
контент-роутах → 403, лог по logsAllowed, META_NOT_ALLOWED в участниках,
PATCH visibility + флаги (isPublic — синоним до 8.7); экспорт: витрина 403,
безлоговая выгрузка при недейственном show_logs + восстановлен футер-зеркало
(утрата 4.2); dotfile-грабля ×4 закрыта переименованием (env.local.example,
dev-billing-state/). Смоук 87 ✓, tests/test-86-requests2-14.mjs 102 ✓ ×2 на
отдельной пустой БД, check:integration += 2ad/4ao/5ac; доки —
scripts/patch-docs-conv86.py. Реестр §12 пуст; следующая — 8.7.
""",
    "08 Часть I — 8.6",
)
patch(
    P08,
    """### Беседа 8.5 — Родословная при импорте: сопоставление родителя (бэкенд + клиент) [ЗАКРЫТА 2026-09-14]
""",
    """### Беседа 8.6 — Модель публичности и гостевой доступ (бэкенд) [ЗАКРЫТА 2026-09-15]

> Запрос 1 целиком (миграция 0005 + schema, shared/types/synthesis + shared/
> utils/visibility, middleware/auth optionalAuth, routes/syntheses/logs/export/
> lineage/billing + гейт витрины на 5 контент-роутах, html-exporter
> includeLogs, audit.mts, integration-check 4o/4ak/4al, dotfile → env.local.
> example/dev-billing-state, scripts/patch-docs-conv86.py) → патч
> philosynth-conv86-request1.patch; смоук tests/smoke-86-request1.mjs 87 ✓;
> тестовые запросы R2–R14 одним заходом tests/test-86-requests2-14.mjs 102 ✓ ×2
> (~40 с; сервер :3186 на пустой philosynth_t86 + philosynth_t86mig для
> миграции; моков нет); пересмотр после обсуждения — гостевые Omit-типы сняты,
> DocumentFooter терпит отсутствие cost-полей, футер экспорта восстановлен;
> завершение: typecheck (все конфиги) 0, audit ✓, check-map 0, css-parity
> 0/586, check:integration += 2ad/4ao/5ac → INTEGRATION OK (4ac под сигнатуру
> с гостем). Полный текст решений — «По факту 8.6» в 07.

#### Что создано / изменено

- `server/db/migrations/0005_visibility.sql` + `meta/0005_snapshot.json`
  (рукой; generate → «No schema changes»); `schema.syntheses`: visibility enum
  + showAuthor/showLogs/showPrompts/allowMeta, `idx_syntheses_visibility`
  (partial `<> 'private'`), CHECK.
- `packages/shared/types/synthesis.ts`: SynthesisVisibility, VisibilityFlags,
  EffectiveFlags, SynthesisViewer, SynthesisScope, SynthesisPatchInput;
  SynthesisFull += visibility/флаги/authorName?/scope/sections?, cost-поля
  необязательны; SynthesisPreview += visibility/authorName?, totalCostUsd?;
  isPublic — @deprecated производное. `packages/shared/utils/visibility.ts` —
  effectiveFlags, isPublicOf.
- `server/middleware/auth.ts` += optionalAuth (MiddlewareHandler без Env —
  монтируется на Hono<AuthEnv>), viewerOf(c), OptionalAuthEnv.
- `server/routes/syntheses.ts`: loadSynthesisForRead(id, userId | null) →
  ReadAccess {viewer, scope}; metaAllowedFor; projectSynthesis/projectPreview;
  loadAuthorNamesFor; loadSectionsFull (гостю на 'full'); showcaseForbiddenJson,
  metaNotAllowedJson; GET /public и GET /:id под optionalAuth; PATCH
  visibility + четыре флага + синоним isPublic; META_NOT_ALLOWED в участниках;
  /estimate молча пропускает; duplicate → 'private'.
- `routes/logs.ts` logsAllowed на четырёх путях; `routes/export.ts` витрина
  403 + includeLogs; `services/export/html-exporter.ts` exportHTML(id,
  {includeLogs}) + renderDocFooter; `routes/lineage.ts` pruneInvisible и
  /search на visibility, authorName в превью; `routes/billing.ts` GET /plans
  под optionalAuth до requireAuth; sections/elements/modes/transforms/
  enrichment — гейт витрины после стандартных 404/403.
- Клиент (устранение рассогласований, не витрина): `api/client.ts` +=
  META_NOT_ALLOWED; `DocumentFooter.tsx` — строка стоимости при определённых
  значениях.
- `server/audit.mts` typeOnly += isPublic/authorName/scope/sections;
  `integration-check.mts` 4o → optionalAuth, 4ac под гостя, 4ak/4al → новые
  имена dotfile, += 2ad/4ao/5ac (async-функциями).
- `env.local.example` (без точки), `dev-billing-state/` в .gitignore,
  `tools/dev-billing.sh` на новых именах, `.env.example` += STRIPE_PRICE_*.
- Тесты: tests/smoke-86-request1.mjs, tests/test-86-requests2-14.mjs.

#### Решения/адаптации — «По факту 8.6» п.1–10

#### Открытые TODO после 8.6

- Реестр §12 пуст. Ограничения без адресата — в §12 (запись 8.6).

#### Помодульно: что прикладывать в 8.7

- `packages/shared/types/synthesis.ts` (visibility/флаги/authorName/scope/
  sections?, cost-поля необязательны — гостевой режим клиента),
  `packages/shared/utils/visibility.ts` (effectiveFlags — объяснить в UI, почему
  логи/мета закрыты), `server/routes/syntheses.ts` (контракты GET /public и
  GET /:id по смотрящему, PATCH), `server/routes/billing.ts` (GET /plans гостю),
  `server/middleware/auth.ts` (optionalAuth — что гость получает), `client/src/
  api/client.ts` (401-обработчик: гостю на /catalog и /synthesis/:id 401 не
  штатен), `client/src/pages/CatalogPage.tsx` + `components/catalog/
  SynthesisCard.tsx` (кнопка «Опубликовать» → переключатель ступени +
  четыре флага; синоним isPublic снять), `client/src/components/document/
  DocumentFooter.tsx` + `SynthesisPage.tsx` (режим просмотра гостя:
  документ из sections одного ответа, без /sections и WS), `client/src/App.tsx`,
  `components/layout/Header.tsx` (гостевая шапка и маршруты, LandingPage),
  `client/src/pages/BillingPage.tsx` (разметка тарифов для страницы цен);
  тесты-образцы: tests/test-86-requests2-14.mjs (что гость получает по API),
  tests/test-84-requests2-10.mjs (браузерный стенд каталога).

---

### Беседа 8.5 — Родословная при импорте: сопоставление родителя (бэкенд + клиент) [ЗАКРЫТА 2026-09-14]
""",
    "08 Часть II — глава 8.6",
)
patch(
    P08,
    """> **Правки 2026-09-14 (итоги беседы 8.5)**: родословная при импорте закрыта""",
    """> **Правки 2026-09-15 (итоги беседы 8.6)**: модель публичности и гостевой
> доступ закрыты (запрос 1 + смоук tests/smoke-86-request1.mjs 87 ✓ + все
> тестовые запросы tests/test-86-requests2-14.mjs 102 ✓ ×2 на отдельной пустой
> БД; check:integration += 2ad/4ao/5ac). 02 §2.3 — visibility + четыре флага,
> индекс, CHECK; §2.4 — видимость узлов; 03 — преамбула §2 (гостевые пути),
> §2.2 (GET /public, GET /:id по смотрящему, PATCH, SynthesisFull, гость),
> §2.3 (витрина на контент-роутах), §2.8, §2.10 (GET /plans), §2.11 (экспорт,
> футер), §2.12 (гейт логов), §4.3 (META_NOT_ALLOWED); 01 §6; 04 §4 строка
> 8.6; 05 — миграция 0005, optionalAuth, visibility.ts, env.local.example,
> dev-billing-state/, html-exporter, DocumentFooter; 07 — текст 8.6 (адрес
> 02 §2.3, сноски п.5/п.10), «По факту 8.6», врезка Фазы 8, §12; 09 §2
> (superseded_by патч-скриптов, dotfile ×4 → переименование), §3 (миграция
> рукой при переименовании колонки), §5 (optionalAuth без Env).
>
> **Правки 2026-09-14 (итоги беседы 8.5)**: родословная при импорте закрыта""",
    "08 Часть III — 8.6",
)
patch(
    P09,
    """### Беседа 8.5

- **Dotfile-грабля — ТРЕТИЙ раз подряд** (HEAD cd46374): те же три потери""",
    """### Беседа 8.6

- **Правка, заменяющая уже применённый `new` другой patch(), ломает её
  идемпотентность**: на повторном прогоне ранняя patch() не находит своего
  `new`, но находит `old` — и вставляет сноску ВТОРОЙ раз (07 п.5 и 03 §2.11
  задвоились). Лечение: `patch(..., superseded_by=<фрагмент поздней правки>)`
  — присутствие наследника считается skip. Проверка идемпотентности —
  чистая копия ×3 (39/0/0 → 0/39/0 → 0/39/0) И побайтовое равенство рабочих
  доков чистому применению (`diff -rq`): прогон «повтор skip=N» на уже
  испорченных доках дубликата не покажет.
- **Dotfile-грабля — ЧЕТВЁРТЫЙ раз** (HEAD 32171a9) — закрыта не абзацем, а
  переименованием: `env.local.example` и `dev-billing-state/` без ведущей
  точки; 4ak падает, если в дереве снова появится `.env.local.example`.
  `.env.example` и `.gitignore` остаются dotfile — их правки после выкладки
  всё ещё сверять (`grep STRIPE_PRICE_ .env.example`, `dev-billing-state/`).

### Беседа 8.5

- **Dotfile-грабля — ТРЕТИЙ раз подряд** (HEAD cd46374): те же три потери""",
    "09 §2 — 8.6",
)
patch(
    P09,
    """### Беседа 8.1
- `ON DELETE SET NULL` не срабатывает при ЛОГИЧЕСКОМ удалении: 7.1""",
    """### Беседа 8.6
- **Замена колонки с переносом данных — миграция рукой.** `drizzle-kit
  generate` на паре «снята is_public, добавлена visibility» спрашивает
  интерактивно, не переименование ли это (TTY в песочнице нет), и в любом
  случае не вставит `UPDATE … CASE WHEN is_public` между ADD и DROP. Писать
  SQL и снапшот `meta/NNNN_snapshot.json` рукой (prevId = id прошлого, колонки/
  индексы/checkConstraints как в schema.ts), затем `generate` обязан сказать
  «No schema changes» — это и есть сверка снапшота со схемой; перенос данных
  проверять на отдельной БД: 0000–NNNN-1 по `statement-breakpoint`, строки,
  затем NNNN.
- `check(...)` из drizzle-orm/pg-core попадает в снапшот как
  `checkConstraints`, а `where` частичного индекса — с кавычками таблицы
  (`"syntheses"."visibility" <> 'private'`).

### Беседа 8.1
- `ON DELETE SET NULL` не срабатывает при ЛОГИЧЕСКОМ удалении: 7.1""",
    "09 §3 — миграция рукой",
)
patch(
    P09,
    """### Беседа 7.1
- Статический `await import("../client/…tsx")` в `.mts` под `typecheck:scripts`""",
    """### Беседа 8.6
- Middleware для гостя на роутере `Hono<AuthEnv>`: `MiddlewareHandler<
  OptionalAuthEnv>` (user: AuthUser | null) на него не ляжет по типам —
  объявлять `MiddlewareHandler` без Env и читать смотрящего хелпером
  (`viewerOf(c)`), а `c.get("user")` в гостевых обработчиках не трогать.
- Контракты integration-check, зашитые на сигнатуру (`isOwner: row.userId ===
  viewerUserId`, `get("/:id", requireAuth`), ломаются при смене модели
  доступа — искать по строке-инварианту в старых секциях (4ac, 4o) до прогона,
  а не после 100-секундного падения.

### Беседа 7.1
- Статический `await import("../client/…tsx")` в `.mts` под `typecheck:scripts`""",
    "09 §5 — optionalAuth и контракты",
)
patch(
    PRM,
    """| 8 — пусковая пригодность | 8.1–8.7 | открыта 2026-09-08; 8.1, 8.2 закрыты 2026-09-08; 8.3 закрыта 2026-09-09; 8.4, 8.5 закрыты 2026-09-14; 8.6/8.7 добавлены 2026-09-14, не проведены |""",
    """| 8 — пусковая пригодность | 8.1–8.7 | открыта 2026-09-08; 8.1, 8.2 закрыты 2026-09-08; 8.3 закрыта 2026-09-09; 8.4, 8.5 закрыты 2026-09-14; 8.6 закрыта 2026-09-15; 8.7 — следующая |""",
    "README таблица фаз",
)

print(f"\nИтог: applied={applied}, skip={skipped}, fail={failed}")
