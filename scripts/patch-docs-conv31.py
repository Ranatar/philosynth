#!/usr/bin/env python3
"""Правки документации по итогам беседы 3.1 (Meta-Synthesis + Lineage).

Идемпотентный apply/skip-скрипт (образец conv24):
 - patch(): замена old → new; повторный прогон видит marker → skip;
 - optional=True — переходник промежуточных состояний.

Запуск из корня репо: python3 scripts/patch-docs-conv31.py
"""
from __future__ import annotations

import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
applied: list[str] = []
skipped: list[str] = []
failed: list[str] = []


def read(rel: str) -> str:
    return io.open(os.path.join(ROOT, rel), encoding="utf-8").read()


def write(rel: str, s: str) -> None:
    io.open(os.path.join(ROOT, rel), "w", encoding="utf-8").write(s)


def patch(name: str, rel: str, old: str, new: str,
          marker: str | None = None, optional: bool = False) -> None:
    s = read(rel)
    mk = marker if marker is not None else new
    if mk in s:
        skipped.append(name)
        return
    if old not in s:
        (skipped if optional else failed).append(
            name + ("" if optional else f": якорь не найден в {rel}"))
        return
    if s.count(old) != 1:
        failed.append(name + f": якорь неоднозначен в {rel} ({s.count(old)})")
        return
    write(rel, s.replace(old, new))
    applied.append(name)


P7 = "docs/07-conversation-protocol.md"
P3 = "docs/03-specification.md"
P4 = "docs/04-code-reuse-map.md"
NC = "NEXT-CONTEXT.md"
RM = "README.md"

# ── 1. 07: ревизионная заметка беседы 3.1 в шапку ─────────────────────
patch("07-revision-note", P7,
    "# PhiloSynth Service — Протокол бесед\n\n>",
    "# PhiloSynth Service — Протокол бесед\n\n"
    "> **Правки 2026-08-20 (итоги беседы 3.1)**: мета-синтез и генеалогия\n"
    "> закрыты (смоук 28 ✓ + тесты 16 ✓ ×2, живой конвейер промпта);\n"
    "> текст 3.1 п.1: список loadConceptContext дополнен до 10 полей\n"
    "> исходника (отсутствовали portraits и dialogueSynthesis — оба в\n"
    "> PARENT_FIELD_ORDER), несуществующий «buildConceptContextBlock»\n"
    "> заменён реальными conceptContextBlockFull/Selective (провайдер\n"
    "> baseCtxParents), в п.1 вписан conceptContextBlockFull (карта 04\n"
    "> §1.10 назначала его сюда, legacy 'monolithic' до миграции требует\n"
    "> монолит; КВИРК исходника сохранён — монолит без portraits и\n"
    "> graphEdges); адрес генеалогических функций — meta-synthesis-service\n"
    "> (спека фрагмента называла lineage-service); отступления: ответ POST\n"
    "> += неблокирующее warnings (M3; контракт §2.2 не имел места для\n"
    "> confirm-предупреждений исходника), hasConceptParticipants гейтится\n"
    "> ФЛАГОМ p.isMetaSynthesis (выставляет buildParams), стык 2.2↔3.1 —\n"
    "> первая перегенерация после миграции схемы шла бы по монолиту\n"
    "> (p собран до апдейта строки; починено); §12 — четыре долга 3.1\n"
    "> закрыты (серверная половина участников-концепций; клиентская — 3.2).\n"
    ">\n"
    ">")

# ── 2. 07: loadConceptContext — 10 полей исходника ────────────────────
patch("07-load-concept-10-fields", P7,
    "     dialogueConcepts (из sections WHERE key='dialogue' → парсинг),\n"
    "     goals, tensions (из sections WHERE key='sum' → парсинг).",
    "     dialogueConcepts (из sections WHERE key='dialogue' → парсинг),\n"
    "     dialogueSynthesis (dialogue:synthesis — аналитический комментарий),\n"
    "     goals, portraits, tensions (из sections WHERE key='sum' → парсинг).\n"
    "     (Ревизия 3.1: исходник извлекает 10 полей — в списке выше\n"
    "     отсутствовали portraits и dialogueSynthesis, оба входят в\n"
    "     PARENT_FIELD_ORDER и уровневые PARENT_DEPS; порт — по исходнику.)")

# ── 3. 07: conceptContextBlockFull рядом с Selective ──────────────────
patch("07-full-block-in-request", P7,
    "   - conceptContextBlockSelective(p, sectionKey, explicitSpec?):",
    "   - conceptContextBlockFull(p): legacy-монолит для документов со\n"
    "     схемой 'monolithic' до миграции (карта 04 §1.10; ревизия 3.1 —\n"
    "     в запросе отсутствовал; КВИРК исходника: без portraits/graphEdges).\n"
    "   - conceptContextBlockSelective(p, sectionKey, explicitSpec?):")

# ── 4. 07: buildConceptContextBlock не существует ─────────────────────
patch("07-no-buildconceptcontextblock", P7,
    "     вызвать loadConceptContext для каждого, добавить в промпт через \n"
    "     buildConceptContextBlock, записать synthesis_lineage.",
    "     вызвать loadConceptContext для каждого, добавить в промпт через\n"
    "     провайдер baseCtxParents (conceptContextBlockFull для legacy\n"
    "     'monolithic', иначе conceptContextBlockSelective; функции\n"
    "     «buildConceptContextBlock» в исходнике нет — ревизия 3.1),\n"
    "     записать synthesis_lineage.")

# ── 5–8. 07 §12: четыре долга 3.1 закрыты ─────────────────────────────
patch("12-provider-closed", P7,
    "| `registerParentContextProvider` — реальный провайдер | 3.1 | 1.4 "
    "| внесён 2026-07-31 |",
    "| `registerParentContextProvider` — реальный провайдер | 3.1 | 1.4 "
    "| ЗАКРЫТ 3.1 (2026-08-20): стаб заменён buildMetaParentContext "
    "(meta-synthesis-service): 'monolithic' → Full, иначе Selective "
    "+ intra-spec подраздела |")
patch("12-gencommon-closed", P7,
    "| `parentFieldsUsed` / `conceptBlockSizes` / `parentSpecBySection` "
    "| 3.1 | 1.4 | внесён 2026-07-31 |",
    "| `parentFieldsUsed` / `conceptBlockSizes` / `parentSpecBySection` "
    "| 3.1 | 1.4 | ЗАКРЫТ 3.1 (2026-08-20): genCommon и проходы наполнены "
    "реальными участниками (loadConceptParticipants) |")
patch("12-server-concepts-closed", P7,
    "| Серверные участники-концепции (снятие гейта мета-синтеза) "
    "| 3.1 + 3.2 | 1.5b | внесён 2026-07-31 |",
    "| Серверные участники-концепции (снятие гейта мета-синтеза) "
    "| 3.1 + 3.2 | 1.5b | серверная половина ЗАКРЫТА 3.1 (2026-08-20): "
    "POST принимает type='synthesis' с валидацией и генеалогией; "
    "клиентская (гейт SynthesisForm) — за 3.2 |")
patch("12-estimate-diff-closed", P7,
    "| Данные для `estimate-diff` | 3.1 | 1.5b | внесён 2026-07-31 |",
    "| Данные для `estimate-diff` | 3.1 | 1.5b | ЗАКРЫТ 3.1 (2026-08-20): "
    "/estimate принимает участников-концепций, вес родителей — колбэком "
    "parentOverheadForSection; отрисовка разницы — 3.2 |")

# ── 9. 03 §2.2: POST — участники-концепции и warnings ─────────────────
patch("03-post-warnings", P3,
    "                                // v11: philosophers и participants опциональны —\n"
    "                                // оба пусты = свободный синтез (обязателен seed;\n"
    "                                //   иначе 400 NO_PARTICIPANTS_SEED_REQUIRED, §4.3)\n"
    "                                → { id: string, status: \"generating\" }",
    "                                // v11: philosophers и participants опциональны —\n"
    "                                // оба пусты = свободный синтез (обязателен seed;\n"
    "                                //   иначе 400 NO_PARTICIPANTS_SEED_REQUIRED, §4.3)\n"
    "                                // 3.1: participants принимает {type:'synthesis',\n"
    "                                //   synthesisId} — доступ (владелец ИЛИ публичный,\n"
    "                                //   403) и пригодность (validateConceptForMeta-\n"
    "                                //   Synthesis: sum/glossary/theses/critique,\n"
    "                                //   graph|dialogue, capsule → 400 c missing);\n"
    "                                //   дубликаты id → 400\n"
    "                                → { id: string, status: \"generating\",\n"
    "                                    warnings?: {level:'info'|'warn', text}[] }\n"
    "                                // warnings (3.1, аддитивно): неблокирующие\n"
    "                                // генеалогические пересечения (M3 §1.6;\n"
    "                                // confirm исходника жил на клиенте)")

# ── 10. 03 §2.2: /estimate с участниками-концепциями ──────────────────
patch("03-estimate-concepts", P3,
    "                                // копия» выбран сервер — копия дрейфовала бы от\n"
    "                                // Registry (fragment_share/context_budget).",
    "                                // копия» выбран сервер — копия дрейфовала бы от\n"
    "                                // Registry (fragment_share/context_budget).\n"
    "                                // 3.1: участники type='synthesis' учитываются —\n"
    "                                // вес родителей parentOverheadForSection-колбэком\n"
    "                                // (baseCtxStatic вместо baseCtx); недоступные id\n"
    "                                // для оценки молча пропускаются (оценка — не гейт).\n"
    "                                // estimate-diff: клиент зовёт /estimate дважды\n"
    "                                // (с концепциями и без); отрисовка разницы — 3.2.")

# ── 11. 04 §1.10: генеалогические функции ─────────────────────────────
patch("04-genealogy-row", P4,
    "| `conceptContextBlockFull()`, `conceptContextBlockSelective()` | "
    "`server/services/meta-synthesis-service.ts` |",
    "| `conceptContextBlockFull()`, `conceptContextBlockSelective()` | "
    "`server/services/meta-synthesis-service.ts` |\n"
    "| `checkGenealogyOverlaps()`, `collectPhilosopherAncestors()`, "
    "`isAncestor()` | `server/services/meta-synthesis-service.ts` (3.1; "
    "АДАПТАЦИЯ: предки — рекурсивный CTE по `synthesis_lineage`, в "
    "исходнике — обход объекта genealogy; тексты предупреждений 1:1) |")

# ── 12. README: статус ────────────────────────────────────────────────
patch("readme-status", RM,
    "## Статус: Фазы 0–2 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3)",
    "## Статус: Фазы 0–2 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3); "
    "Фаза 3 — беседа 3.1 закрыта")

# ── 13. README: запись беседы 3.1 ─────────────────────────────────────
patch("readme-conv31-entry", RM,
    "статуса). Доки пропатчены scripts/patch-docs-conv23.py.\n",
    "статуса). Доки пропатчены scripts/patch-docs-conv23.py.\n"
    "\n"
    "- **3.1 — Meta-Synthesis + Lineage (бэкенд).**\n"
    "  services/meta-synthesis-service.ts (loadConceptContext — 10 полей\n"
    "  через extractContextFragment, validateConceptForMetaSynthesis,\n"
    "  checkGenealogyOverlaps с текстами 1:1, collectPhilosopherAncestors/\n"
    "  isAncestor на CTE, conceptContextBlockFull [квирк: без portraits/\n"
    "  graphEdges] / Selective, провайдер buildMetaParentContext),\n"
    "  services/lineage-service.ts (getAncestors/getDescendants/\n"
    "  searchByPhilosophers с HAVING-пересечением/createLineageRecords),\n"
    "  routes/lineage.ts (§2.8: ancestors/descendants под\n"
    "  loadSynthesisForRead + pruneInvisible приватных поддеревьев,\n"
    "  /lineage/search по видимым). Интеграция: стаб провайдера 1.4\n"
    "  заменён (долг §12), buildParams сливает концепции и выставляет\n"
    "  флаг isMetaSynthesis, загрузка участников ВНУТРИ\n"
    "  runGenerationPasses/buildEditInfra (сигнатуры прежние — pause-\n"
    "  resume/планы/перегенерации получили мета-контекст без правок),\n"
    "  POST принимает type='synthesis' (+ аддитивное warnings M3),\n"
    "  /estimate с весом родителей (estimate-diff), /:key/context с\n"
    "  участниками; стык 2.2↔3.1: миграция схемы переводит и p (первая\n"
    "  перегенерация шла бы по монолиту). Тесты: scripts/smoke-31.ts\n"
    "  28 ✓ + scripts/test-31-requests2-4.ts 16 ✓ ×2 (живой конвейер\n"
    "  промпта: обе капсулы в baseCtx). Доки пропатчены\n"
    "  scripts/patch-docs-conv31.py.\n")

# ── 14. README: «Не сделано» — гейт снят наполовину ───────────────────
patch("readme-not-done", RM,
    "Не сделано (Фаза 2+): applyReplacement (3.2), мета-синтез (3.1 — снимет\n"
    "гейт ☑-концепций в форме и\n"
    "даст estimate-diff превью бюджета), полный пул с деревом (3.2), режимы",
    "Не сделано (Фаза 2+): applyReplacement (3.2), клиентская половина\n"
    "мета-синтеза (3.2: снятие гейта ☑-концепций в SynthesisForm и\n"
    "отрисовка estimate-diff; сервер готов с 3.1), полный пул с деревом\n"
    "(3.2), режимы")

# ── 15. README: охват integration-check ───────────────────────────────
patch("readme-coverage", RM,
    "SynthesisPage, «TODO(2.4)»-walker). Сейчас покрывает 0.1–0.6,\n"
    "1.1–1.7 и 2.1–2.4 целиком;",
    "SynthesisPage, «TODO(2.4)»-walker); 3.1 — 2p/4v/5r: мета-синтез\n"
    "(модули, провайдер вместо стаба, квирк Full-блока, живые CTE\n"
    "генеалогии и Selective-блок). Сейчас покрывает 0.1–0.6, 1.1–1.7,\n"
    "2.1–2.4 и 3.1 целиком;")

# ── 16. NEXT-CONTEXT: глава беседы 3.1 ────────────────────────────────
nc = read(NC)
CH = "# Беседа 3.1 — Meta-Synthesis + Lineage (бэкенд) [ЗАКРЫТА]"
if CH in nc:
    skipped.append("nc-chapter-31")
else:
    nc = nc.rstrip("\n") + "\n\n" + CH + """

Закрыта 2026-08-20. Смоук scripts/smoke-31.ts 28 ✓; тесты протокола
scripts/test-31-requests2-4.ts 16 ✓ ×2; integration-check += 2p/4v/5r;
audit чист; typecheck server/checks/client — 0. Доки пропатчены
scripts/patch-docs-conv31.py (ревизионная заметка в шапке 07 — полный
список рассогласований).

## Что создано

- `server/services/meta-synthesis-service.ts` — loadConceptContext
  (10 полей через extractContextFragment: capsule:full, sum:goals/
  portraits/tensions, graph:nodes_top/edges, dialogue:new_concepts/
  synthesis, glossary:table, theses:summary; сбой фрагмента → "" с
  warn), loadConceptParticipants (lineage parent_type='synthesis' по
  position; SET NULL пропускается), validateConceptForMetaSynthesis
  (required + «graph или dialogue» строкой + capsule_html; warnings —
  вместо confirm исходника), unsuitableConceptMessage [22040],
  collectPhilosopherAncestors (АДАПТАЦИЯ: CTE вместо обхода объекта
  genealogy), isAncestor, checkGenealogyOverlaps (тексты [22475/22492]
  дословно), conceptContextBlockFull (КВИРК исходника: без portraits и
  graphEdges), conceptContextBlockSelective (spec через
  resolveParentDeps/explicitSpec; Registry-карты полей),
  buildMetaParentContext — провайдер: 'monolithic' → Full, иначе
  Selective + resolveParentDepsForSubsection при subsectionName.
- `server/services/lineage-service.ts` — getAncestors (дерево, корень
  depth 0 — сам синтез), getDescendants (CTE вниз; имя descendants —
  `desc` зарезервировано SQL), searchByPhilosophers (CTE пар
  root×философ + HAVING COUNT(DISTINCT)=n, транзитивно),
  createLineageRecords (сквозные позиции); clampDepth 1..10; циклы в
  данных гасятся path-Set. Доступ НЕ проверяет — слой роутов.
- `server/routes/lineage.ts` — ДВА роутера: lineageRoutes
  (/:id/lineage/ancestors|descendants под requireAuth +
  loadSynthesisForRead; потомки — pruneInvisible: чужой приватный узел
  отсекается С поддеревом) и lineageSearchRoutes (/search?philosopher=…
  ×N; пусто → 400; только видимые; превью через экспортированные
  toPreview/loadPhilosophersFor из routes/syntheses).

## Интеграционные правки

- generation-service: стаб registerParentContextProvider ЗАМЕНЁН
  (долг §12); GenParams += conceptParticipants/parentContextSchema;
  buildParams (ЭКСПОРТИРОВАН) сливает участников и выставляет ФЛАГ
  isMetaSynthesis (hasConceptParticipants — флаг, не подсчёт);
  loadConceptParticipants вызывается ВНУТРИ runGenerationPasses и
  buildEditInfra — сигнатуры прежние, pause-resume (1.4b), планы (2.1/
  2.2), перегенерации и роуты получили мета-контекст без правок;
  genCommon (parentSpecBySection/conceptBlockSizes) и parentFieldsUsed
  наполнены; participants во всех 4 buildContextForSection (давление
  бюджета 01 §4.13 ч. II); стык 2.2↔3.1: после маркера миграции схемы
  p.parentContextSchema тоже переводится — иначе первая перегенерация
  шла бы по монолиту.
- routes/syntheses: POST принимает {type:'synthesis', synthesisId} —
  доступ (403), пригодность (400 + unsuitableConceptMessage +
  details.missing), дубликаты → 400; генеалогия через
  createLineageRecords (философы, затем концепции); ответ POST +=
  аддитивное warnings (M3 — контракт §2.2 не имел места);
  /estimate: участники-концепции + предвычисленный overheadBySection →
  синхронный колбэк parentOverheadForSection в estimateCost;
  недоступные id молча пропускаются (оценка — не гейт).
- routes/sections /:key/context: += participants (пометка «до 3.1»
  закрыта — превью считает давление родителей как живая генерация).
- index.ts: смонтированы оба роутера (/api/v1/syntheses + /api/v1/lineage).

## Знания/грабли, добытые в 3.1

- Контравариантность провайдера: интерфейс без индекс-подписи не
  присваивается ConceptParticipant — ConceptBlockParams.participants
  объявлен нестрогой формой {type; name?}, сужение isConceptParticipant
  + каст; поля читать только через parentFieldValue.
- `desc` — зарезервированное слово: CTE потомков зовётся descendants.
- Колонка `position` в raw SQL работает (col_name_keyword PG).
- postgres.js: список значений в IN — `IN ${sql(uniq)}`.
- Экстрактор capsule:full ОТРЕЗАЕТ ведущее слово «Капсула» — ассерты
  писать по телу капсулы.
- baseCtx без sectionKey → провайдер с key="" → warn + минимум capsule
  (штатный fallback [10274]); живой конвейер всегда передаёт ключ.
- Смоуки в общей БД: изоляция уникальным суффиксом имён (TAG), иначе
  searchByPhilosophers «находит лишнее» из прошлых прогонов.
- Модуль redis — server/redis.ts; в finally смоуков closeDb И closeRedis.

## Ревью по карте 04

§1.10 (conceptContextBlock* → meta-synthesis-service) и §2.6
(importConceptAsParticipant → чтение из БД) — совпали; в §1.10 добавлена
строка генеалогических функций (патч). reconstructGenealogy /
restoreCapsulesFromHTML — клиентские, 3.2 (§12 без изменений).

## Открытые TODO после 3.1

- Клиентская половина мета-синтеза → 3.2: снятие гейта SynthesisForm
  (сабмит с ☑-концепциями), отрисовка estimate-diff в FullBudgetPreview
  (сервер отдаёт обе оценки), панель генеалогии поверх routes/lineage.
- Браузерных тестов в 3.1 нет (бэкенд); харнесс-образец для 3.2 —
  tests/test-23-requests2-5.mjs.

## Помодульно: что прикладывать в 3.2

- services/meta-synthesis-service.ts + routes/lineage.ts (контракты
  ответов), shared/types/lineage.ts;
- клиент: SynthesisForm/pool-store/concept-file (1.5b) — гейт и
  prepareForGeneration; FullBudgetPreview (estimate-diff);
- ответ POST /syntheses с warnings — рисовать подтверждение как
  confirm исходника [22052].
"""
    write(NC, nc + "\n")
    applied.append("nc-chapter-31")

print("applied:", len(applied))
for n in applied: print("  +", n)
print("skipped:", len(skipped))
for n in skipped: print("  ~", n)
print("failed:", len(failed))
for n in failed: print("  !", n)
if failed:
    raise SystemExit(1)
