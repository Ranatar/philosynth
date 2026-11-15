#!/usr/bin/env python3
"""Патч документации по итогам беседы 17.1 (совместная правка — бэкенд).

Часть I — первый запрос (2026-11-15); часть II — тестовые запросы и долги
Д-83…Д-85, закрытые той же беседой (2026-11-15). Идемпотентный: каждая правка
проверяет наличие нового текста (marker) и уходит в skip при повторном
прогоне. Отчёт applied/skip/fail. Запуск из корня репозитория:
    python3 scripts/patches/patch-docs-conv171.py

Правки части I:
  171/A  02: §2.12 element_versions (+ actor_user_id, change_source
         'proposal', origin предложения), §2.15 generation_log
         (+ actor_user_id), новые §2.40 proposals и §2.41 proposal_events.
  171/B  03: capabilities.edit редактору (§2.2), expectedHash / hash у
         подраздела (§2.3), expectedVersion у элементов и expectedHash у
         капсулы (§2.4), subsectionEdits / expected у планов (§2.6),
         исполнитель и стоимость в журнале (§2.12), правило исключения
         (§2.18), уведомления proposal_* (§2.19), новый §2.20 «Предложения»,
         коды VERSION_CONFLICT и PROPOSAL_STALE (§4.3).
  171/C  01: права редактора (один модуль прав).
  171/D  04: строка новых модулей.
  171/E  05: файлы беседы.
  171/F  07: блок «По факту 17.1 (первый запрос)»; реестр §12 — Д-81…Д-86.
  171/G  (NEXT-CONTEXT — в части III.)
  171/H  deploy/*: двадцать миграций (0000…0019).

Правки части II:
  171/I  03: общее правило «только владелец на путях правки = право правки»
         (§2), пауза редактору (§2.2).
  171/J  07: блок «По факту 17.1 (тестовые запросы)».
  171/K  08 Часть IV: Д-83, Д-84, Д-85 — заведены и закрыты беседой 17.1.

Правки части III (завершение беседы, 2026-11-15):
  171/L  07: «По факту 17.1 (завершение)»; врезка «Фаза 17» — 17.1 закрыта;
         §12 — журнал закрытия; долги 17.2 вписаны в её текст.
  171/M  08: Часть I (строка) и Часть II (глава 17.1).
  171/N  09: уроки (§2 сжатие контекста, §3 миграция, §4 харнессы, §7 права
         и исполнитель).
  171/O  README: строка Фазы 17.
  171/P  NEXT-CONTEXT: состояние (17.1 закрыта) и комплект 17.2.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
P01 = ROOT / "docs" / "01-architecture.md"
P02 = ROOT / "docs" / "02-data-model.md"
P03 = ROOT / "docs" / "03-specification.md"
P04 = ROOT / "docs" / "04-code-reuse-map.md"
P05 = ROOT / "docs" / "05-file-structure.md"
P07 = ROOT / "docs" / "07-conversation-protocol.md"
P08 = ROOT / "docs" / "08-history.md"
P09 = ROOT / "docs" / "09-lessons.md"
README = ROOT / "README.md"
NEXT = ROOT / "NEXT-CONTEXT.md"
DEPLOY = ROOT / "deploy"

applied = 0
skipped = 0
failed = 0


def patch(path: Path, old: str, new: str, label: str, marker: str | None = None,
          optional: bool = False) -> None:
    """Заменяет old → new; идемпотентность — по marker (или new) в тексте."""
    global applied, skipped, failed
    text = path.read_text(encoding="utf-8")
    probe = marker if marker is not None else new
    if probe in text:
        print(f"  skip  {label}")
        skipped += 1
        return
    if optional and old not in text:
        print(f"  skip  {label} (переходное состояние не встретилось)")
        skipped += 1
        return
    if text.count(old) != 1:
        print(f"  FAIL  {label}: якорь встречается {text.count(old)} раз")
        failed += 1
        return
    path.write_text(text.replace(old, new), encoding="utf-8")
    print(f"  applied  {label}")
    applied += 1


# ══ 171/A: 02 — модель данных ════════════════════════════════════════════
patch(
    P02,
    "    -- 'manual'|'regenerated'|'cascade'|'auto_rename'|'rollback'|'recommendation'\n"
    "    -- (текст без CHECK; 'recommendation' — 10.2: правка исполнила рекомендацию критики)\n",
    "    -- 'manual'|'regenerated'|'cascade'|'auto_rename'|'rollback'|'recommendation'|'proposal'\n"
    "    -- (текст без CHECK; 'recommendation' — 10.2: правка исполнила рекомендацию критики;\n"
    "    --  'proposal' — 17.1: шаг плана исполнил принятое предложение участника, §2.40)\n",
    "171/A1 02 §2.12 change_source += proposal",
    marker="'proposal' — 17.1: шаг плана исполнил принятое предложение участника",
)
patch(
    P02,
    "                                -- пересобираются, план может быть удалён — ответ на\n"
    "                                -- «почему» обязан пережить и то и другое\n"
    "  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()\n",
    "                                -- пересобираются, план может быть удалён — ответ на\n"
    "                                -- «почему» обязан пережить и то и другое.\n"
    "                                -- 17.1: либо снимок ПРЕДЛОЖЕНИЯ — { kind:'proposal',\n"
    "                                -- proposalId, authorId, source, sourceId, proposalKind,\n"
    "                                -- rationale, planId, stepIndex, stepType: edit_element |\n"
    "                                -- edit_subsection | refine_element } (shared ProposalOrigin;\n"
    "                                -- VersionOrigin — объединение, различать по kind)\n"
    "  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,\n"
    "                                -- 17.1 (миграция 0019): ИСПОЛНИТЕЛЬ правки — чей запрос\n"
    "                                -- (HTTP / WS / слот генерации) записал версию. NULL — строка\n"
    "                                -- до Фазы 17 либо импорт: исполнитель — владелец. Пишет\n"
    "                                -- createVersion из контекста запроса (services/\n"
    "                                -- actor-context.ts, AsyncLocalStorage) — вызывающие его не\n"
    "                                -- передают. Имя отдаётся участникам и только у строк\n"
    "                                -- не-владельца (ElementVersion.actor, services/log-audience)\n"
    "  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()\n",
    "171/A2 02 §2.12 origin предложения + actor_user_id",
    marker="17.1 (миграция 0019): ИСПОЛНИТЕЛЬ правки — чей запрос",
)
patch(
    P02,
    "  --   { kind: 'pass', sections }\n"
    "  metadata       JSONB NOT NULL DEFAULT '{}',\n"
    "  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()\n",
    "  --   { kind: 'pass', sections }\n"
    "  -- 17.1: version_marker плана с шагами по предложениям несёт metadata.proposals\n"
    "  --   [{ id, authorId, source }] — ссылки, без текста\n"
    "  metadata       JSONB NOT NULL DEFAULT '{}',\n"
    "  -- 17.1 (миграция 0019): ИСПОЛНИТЕЛЬ строки — кто запустил генерацию / план /\n"
    "  -- возобновление (он же плательщик: слот withGenerationSlot берётся на него).\n"
    "  -- NULL — строка до Фазы 17 либо импорт: исполнитель — владелец. Каждая вставка\n"
    "  -- несёт ...genLogActor() (сторож 4bp). Показ: «Запустил: X» и GenLogEntry.actor —\n"
    "  -- только у строк не-владельца и только участникам (читателю по show_logs имён\n"
    "  -- нет, выгрузки имён не несут); стоимость такой строки — владельцу и самому\n"
    "  -- исполнителю, остальным скрыта (costHidden)\n"
    "  actor_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,\n"
    "  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()\n",
    "171/A3 02 §2.15 actor_user_id",
    marker="17.1 (миграция 0019): ИСПОЛНИТЕЛЬ строки — кто запустил генерацию",
)
patch(
    P02,
    "помечаются вошедшими — иначе держали бы получателя кандидатом).\n"
    "\n"
    "## 3. Извлечение гранулярных элементов из HTML\n",
    "помечаются вошедшими — иначе держали бы получателя кандидатом).\n"
    "\n"
    "### 2.40. proposals\n"
    "\n"
    "Предложения изменений (беседа 17.1, миграция 0019): адресованное (адрес\n"
    "Фазы 16, §2.34) изменение документа от участника с правом обсуждения.\n"
    "Исполняет предложение ТОЛЬКО план правок (§2.13): принятие создаёт\n"
    "черновик плана со ссылкой в шаге и ставит `plan_id`; `accepted` пишет\n"
    "исполнитель плана после успешного шага.\n"
    "\n"
    "```sql\n"
    "CREATE TABLE proposals (\n"
    "  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n"
    "  synthesis_id     UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,\n"
    "  author_id        UUID REFERENCES users(id) ON DELETE SET NULL,\n"
    "  address          JSONB NOT NULL,   -- DiscussionAddress на момент записи\n"
    "  address_kind     TEXT NOT NULL,    -- section | subsection | category | edge | thesis |\n"
    "                                     -- glossary_term (документу целиком — комментарий, не предложение)\n"
    "  address_key      TEXT NOT NULL,\n"
    "  excerpt          TEXT NOT NULL DEFAULT '',\n"
    "  base             JSONB NOT NULL,   -- { version, hash } адресата на момент записи.\n"
    "                                     -- «Устарело» (stale) НЕ хранится: вычисляется при чтении у\n"
    "                                     -- открытого предложения. У ЭЛЕМЕНТА основа — номер версии\n"
    "                                     -- (любая правка элемента после записи, и другого поля тоже);\n"
    "                                     -- у раздела и подраздела — хэш содержимого; адресат удалён —\n"
    "                                     -- устарело (proposal-links.baseIsCurrent — одно место правила)\n"
    "  source           TEXT NOT NULL DEFAULT 'direct',\n"
    "                                     -- direct | comment | review_finding | recommendation\n"
    "  source_id        UUID,             -- id комментария / замечания рецензии / рекомендации\n"
    "                                     -- (проверяется в этом синтезе при создании; без FK —\n"
    "                                     -- источник может быть удалён, предложение живёт)\n"
    "  source_review_id UUID,             -- рецензия замечания-источника (снимок id)\n"
    "  kind             TEXT NOT NULL,    -- replace (готовое значение) | note (только обоснование)\n"
    "  field            TEXT,             -- replace у элемента: правимое поле (белый список 10.2)\n"
    "  value            TEXT,             -- replace: значение поля либо разметка содержимого\n"
    "                                     -- подраздела (чистится sanitizeSectionHtml при записи)\n"
    "  rationale        TEXT NOT NULL DEFAULT '',   -- обычный текст (plainText 16.1)\n"
    "  status           TEXT NOT NULL DEFAULT 'open',\n"
    "                                     -- open | accepted | rejected | withdrawn | closed\n"
    "  plan_id          UUID REFERENCES edit_plans(id) ON DELETE SET NULL,\n"
    "                                     -- черновик плана, в котором предложение стоит; у\n"
    "                                     -- accepted — исполнивший план\n"
    "  decided_by       UUID REFERENCES users(id) ON DELETE SET NULL,\n"
    "  decided_at       TIMESTAMPTZ,\n"
    "  note             TEXT NOT NULL DEFAULT '',   -- слово решившего (отклонение, закрытие)\n"
    "  close_reason     TEXT,             -- member_removed | superseded | outdated | manual\n"
    "  superseded_by    UUID,             -- новое предложение поверх текущего, заведённое взамен\n"
    "  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),\n"
    "  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),\n"
    "  CONSTRAINT proposals_source_check CHECK (source IN ('direct','comment','review_finding','recommendation')),\n"
    "  CONSTRAINT proposals_kind_check   CHECK (kind IN ('replace','note')),\n"
    "  CONSTRAINT proposals_status_check CHECK (status IN ('open','accepted','rejected','withdrawn','closed')),\n"
    "  CONSTRAINT proposals_close_reason_check CHECK (close_reason IS NULL OR close_reason IN\n"
    "    ('member_removed','superseded','outdated','manual'))\n"
    ");\n"
    "CREATE INDEX idx_proposals_synthesis_created ON proposals(synthesis_id, created_at);\n"
    "CREATE INDEX idx_proposals_address ON proposals(synthesis_id, address_kind, address_key);\n"
    "CREATE INDEX idx_proposals_author ON proposals(author_id);\n"
    "CREATE INDEX idx_proposals_plan ON proposals(plan_id);\n"
    "```\n"
    "\n"
    "Переходы статуса: `open → accepted` — только `settleProposalStep`\n"
    "(исполнитель плана, после шага; решивший — исполнитель); `open → rejected`\n"
    "— только действие человека с правом правки (`rejectProposal`; машина не\n"
    "отклоняет); `open → withdrawn` — автор; `open → closed` — правящий\n"
    "(`manual` | `outdated`), исключение участника или удаление его аккаунта\n"
    "(`member_removed`, той же транзакцией), «новое поверх текущего»\n"
    "(`superseded` + `superseded_by`). Шаг плана не состоялся (план удалён или\n"
    "остановлен, шаг снят человеком либо исполнителем из-за устаревания) —\n"
    "статус НЕ меняется, `plan_id` обнуляется, событие `plan_released`.\n"
    "\n"
    "### 2.41. proposal_events\n"
    "\n"
    "Журнал событий предложения (беседа 17.1): кто и что с ним сделал. Пишется\n"
    "той же транзакцией, что смена состояния. Фраза не хранится (правило 14.2)\n"
    "— код `type` и параметры `payload`.\n"
    "\n"
    "```sql\n"
    "CREATE TABLE proposal_events (\n"
    "  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n"
    "  proposal_id  UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,\n"
    "  synthesis_id UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,\n"
    "  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,\n"
    "  type         TEXT NOT NULL,\n"
    "    -- created | plan_drafted { planId, method } | plan_released { planId?, reason:\n"
    "    --   plan_deleted | plan_stopped | step_skipped | step_failed | stale | not_open |\n"
    "    --   member_removed } | accepted { planId, stepIndex, stepType } | rejected |\n"
    "    --   withdrawn | closed { reason, to? } | rebased { from }\n"
    "  payload      JSONB NOT NULL DEFAULT '{}',\n"
    "  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),\n"
    "  CONSTRAINT proposal_events_type_check CHECK (type IN\n"
    "    ('created','plan_drafted','plan_released','accepted','rejected','withdrawn','closed','rebased'))\n"
    ");\n"
    "CREATE INDEX idx_proposal_events_proposal ON proposal_events(proposal_id, created_at);\n"
    "```\n"
    "\n"
    "## 3. Извлечение гранулярных элементов из HTML\n",
    "171/A4 02 §2.40 proposals + §2.41 proposal_events",
    marker="### 2.40. proposals",
)

# ══ 171/B: 03 — спецификация ═════════════════════════════════════════════
patch(
    P03,
    "                                        // role === 'owner'. В 16.1 edit = owner\n"
    "                                        // (редактор получает его в 17.1);\n",
    "                                        // role === 'owner'. С 17.1 edit = owner |\n"
    "                                        // действующий редактор; manage — только\n"
    "                                        // владелец;\n",
    "171/B1 03 §2.2 capabilities.edit редактору",
    marker="role === 'owner'. С 17.1 edit = owner |",
)
patch(
    P03,
    "PATCH  /syntheses/:id/sections/:key/subsections/:name   { html }\n"
    "                                → SubsectionUpdateResult\n",
    "PATCH  /syntheses/:id/sections/:key/subsections/:name   { html, expectedHash? }\n"
    "                                → SubsectionUpdateResult\n"
    "                                // 17.1: ожидаемая версия — expectedHash = поле hash\n"
    "                                // исходника (GET того же пути отдаёт { …, hash }:\n"
    "                                // sha256 разметки подраздела, тот же, что у адреса\n"
    "                                // 16.1 — shared subsectionContentHash). Не совпал с\n"
    "                                // текущим → 409 VERSION_CONFLICT, details: { target:\n"
    "                                // 'раздел:подраздел', expected: { hash }, current:\n"
    "                                // { hash } }, запись не делается. Без expectedHash —\n"
    "                                // как прежде (старые клиенты); клиент 17.2 шлёт всегда.\n"
    "                                // Право — capabilities.edit (владелец | редактор).\n",
    "171/B2 03 §2.3 expectedHash подраздела",
    marker="PATCH  /syntheses/:id/sections/:key/subsections/:name   { html, expectedHash? }",
)
patch(
    P03,
    "PATCH  /syntheses/:id/capsule   { html: string }\n"
    "                                → { capsuleHtml: string, version,\n"
    "                                    warnings: string[] }\n",
    "PATCH  /syntheses/:id/capsule   { html: string, expectedHash?: string }\n"
    "                                → { capsuleHtml: string, version,\n"
    "                                    warnings: string[] }\n"
    "                                // 17.1: expectedHash — sha256 содержимого капсулы,\n"
    "                                // к которому писалась правка (shared\n"
    "                                // sectionContentHash(capsuleHtml)); не совпал → 409\n"
    "                                // VERSION_CONFLICT (details.target 'capsule').\n"
    "\n"
    "// 17.1 — ОЖИДАЕМАЯ ВЕРСИЯ ЭЛЕМЕНТА. Все четыре PATCH элемента\n"
    "// (/categories/:catId, /edges/:edgeId, /theses/:thesisId, /glossary/:termId)\n"
    "// принимают в теле expectedVersion: целое ≥ 0 — номер последней версии\n"
    "// элемента (max element_versions.version; 0 — версий не было; клиент берёт его\n"
    "// из GET …/versions либо из ответа прошлого PATCH: version.version). Сверка —\n"
    "// в транзакции правки под блокировкой элемента: две одновременные правки с\n"
    "// одним ожиданием не проходят обе. Не совпало → 409 VERSION_CONFLICT,\n"
    "// details: { target: 'вид:id', expected: { version }, current: { version } },\n"
    "// запись не делается («последний перезаписал» исключён, обходного force нет).\n"
    "// Негодное ожидание (не целое ≥ 0) → 400 VALIDATION_ERROR. Без expectedVersion\n"
    "// — как прежде. Право правки на всех путях §2.4 — capabilities.edit (владелец |\n"
    "// действующий редактор); версия записывает исполнителя (actor_user_id), история\n"
    "// версий отдаёт участникам ElementVersion.actor { id, name, isOwner } — только\n"
    "// у правок не-владельца.\n",
    "171/B3 03 §2.4 expectedVersion / expectedHash",
    marker="// 17.1 — ОЖИДАЕМАЯ ВЕРСИЯ ЭЛЕМЕНТА.",
)
patch(
    P03,
    "                                // ОТБРАСЫВАЮТСЯ — их ставит только служба 10.2.\n",
    "                                // ОТБРАСЫВАЮТСЯ — их ставит только служба 10.2.\n"
    "                                // 17.1: + subsectionEdits?: { target: 'раздел:подраздел',\n"
    "                                // html }[] — шаг edit_subsection (ручная правка\n"
    "                                // подраздела планом; бесплатный, исполняется тем же\n"
    "                                // updateSubsection, что карточка правки 9.2; тот же\n"
    "                                // подраздел этим же планом не перегенерируется и не\n"
    "                                // удаляется). + expected?: { target, version? | hash? }[]\n"
    "                                // — ожидаемые версии адресатов: 'вид:id' (version),\n"
    "                                // 'раздел', 'раздел:подраздел', 'capsule' (hash);\n"
    "                                // расхождения → 409 VERSION_CONFLICT, details.conflicts\n"
    "                                // — ВСЕ разошедшиеся с текущими значениями, план не\n"
    "                                // создаётся. Поля proposals шагов и regenProposals из\n"
    "                                // тела запроса ОТБРАСЫВАЮТСЯ — их ставит только служба\n"
    "                                // предложений (§2.20). План принадлежит автору\n"
    "                                // (владелец или редактор): читает, исполняет и\n"
    "                                // оплачивает его он; автор, потерявший право\n"
    "                                // правки, свой план не читает. Чужой план: владельцу\n"
    "                                // концепции открыт на ЧТЕНИЕ и УДАЛЕНИЕ (GET, DELETE),\n"
    "                                // исполнять, править и продолжать его может только\n"
    "                                // автор (403); прочим — 403.\n",
    "171/B4 03 §2.6 subsectionEdits / expected",
    marker="// 17.1: + subsectionEdits?: { target: 'раздел:подраздел',",
)
patch(
    P03,
    "GET    /syntheses/:id/logs/generation  → { entries: GenerationLogEntry[] }\n",
    "GET    /syntheses/:id/logs/generation  → { entries: GenerationLogEntry[] }\n"
    "                                       // 17.1: журнал и запросы открыты редактору по праву\n"
    "                                       // правки (как владельцу); рецензенту и читателю — по\n"
    "                                       // флагам автора (8.6). Строка, запущенная НЕ\n"
    "                                       // владельцем: entry.actor { id, name, isOwner:false }\n"
    "                                       // и «Запустил: X» в /formatted — только участникам\n"
    "                                       // (читателю по show_logs имён нет); её стоимость —\n"
    "                                       // владельцу и самому исполнителю, остальным\n"
    "                                       // costUsd: 0 + costHidden: true и «Стоимость: скрыта».\n"
    "                                       // Выгрузка HTML (§2.11) имён исполнителей не несёт\n"
    "                                       // никому; стоимость строк не-владельца во встроенном\n"
    "                                       // журнале и видимом логе — по выгружающему (то же\n"
    "                                       // правило: владелец и сам исполнитель).\n",
    "171/B5 03 §2.12 исполнитель и стоимость в журнале",
    marker="// 17.1: журнал и запросы открыты редактору по праву",
)
patch(
    P03,
    "**Правило для 17.1**: открытые предложения исключённого закрываются с\n"
    "причиной «участник исключён» той же транзакцией (`removeMember`; метка\n"
    "в коде). Отзыв приглашённого (строка invited) уведомления не даёт.\n",
    "**Предложения исключённого (17.1)**: его открытые предложения закрываются\n"
    "(`closed`, причина `member_removed`, решивший — владелец) той же\n"
    "транзакцией (`removeMember` → `closeProposalsOfMember`); чужие предложения,\n"
    "стоявшие в его черновиках планов, освобождаются (`plan_released`); принятые\n"
    "и отклонённые остаются историей. То же делает удаление аккаунта участника.\n"
    "Исключённый редактор свои планы больше не читает и не исполняет; понижение\n"
    "редактора до рецензента освобождает предложения из его черновиков планов\n"
    "(его собственные предложения остаются открытыми). Отзыв приглашённого\n"
    "(строка invited) уведомления не даёт.\n",
    "171/B6 03 §2.18 правило исключения — факт",
    marker="**Предложения исключённого (17.1)**",
)
patch(
    P03,
    "proposal_created / proposal_decided — заведены, пишет 17.1. Актор своего\n",
    "proposal_created (тем, кто решает: владельцу и действующим редакторам;\n"
    "payload: excerpt, kind, rebasedFrom?), proposal_decided (автору: payload\n"
    "decision accepted | rejected | closed, planId у accepted) — 17.1. Актор своего\n",
    "171/B7 03 §2.19 уведомления proposal_*",
    marker="proposal_created (тем, кто решает: владельцу и действующим редакторам;",
)
patch(
    P03,
    "(02 §2.39). Страница ≤ 200 (умолчание 30), курсор — id последней строки.\n"
    "\n"
    "---\n"
    "\n"
    "## 3. WebSocket-протокол\n",
    "(02 §2.39). Страница ≤ 200 (умолчание 30), курсор — id последней строки.\n"
    "\n"
    "### 2.20. Предложения изменений (беседа 17.1)\n"
    "\n"
    "```\n"
    "GET    /syntheses/:id/proposals              ?status=&addressKind=&addressKey=&mine=1\n"
    "                                             → { proposals: Proposal[] }   (новые сверху, ≤ 200)\n"
    "POST   /syntheses/:id/proposals              ProposalCreateInput { target?: { kind, id?, key? },\n"
    "                                             kind: 'replace' | 'note', field?, value?, rationale?,\n"
    "                                             source?: 'direct' | 'comment' | 'review_finding' |\n"
    "                                             'recommendation', sourceId? } → 201 Proposal\n"
    "GET    /syntheses/:id/proposals/:pid         → ProposalDetail (Proposal + events: ProposalEvent[])\n"
    "POST   /syntheses/:id/proposals/:pid/accept  ProposalAcceptInput { method?, field?, value? }\n"
    "                                             → 201 { proposal: Proposal, plan: EditPlan }\n"
    "POST   /syntheses/:id/proposals/:pid/reject  { note? } → Proposal\n"
    "POST   /syntheses/:id/proposals/:pid/close   { reason?: 'manual' | 'outdated', note? } → Proposal\n"
    "POST   /syntheses/:id/proposals/:pid/withdraw → Proposal\n"
    "POST   /syntheses/:id/proposals/:pid/rebase  { value?, rationale? } → 201 Proposal (новое)\n"
    "```\n"
    "\n"
    "Все маршруты — под `requireAuth` и гейтом ОБСУЖДЕНИЯ (`capabilities.discuss`:\n"
    "владелец и действующие участники; не-UUID / нет синтеза → 404, нет права →\n"
    "403); активной операцией не гейтятся — документ они не меняют.\n"
    "\n"
    "`Proposal { id, synthesisId, author: DiscussionAuthor, address, resolution:\n"
    "{ state: current | outdated | deleted, currentId, currentHash, currentVersion },\n"
    "excerpt, base: { version, hash }, stale, source, sourceId, sourceReviewId, kind,\n"
    "field, value, rationale, status: open | accepted | rejected | withdrawn | closed,\n"
    "planId, decidedBy, decidedAt, note, closeReason, supersededBy, createdAt,\n"
    "updatedAt }`. **`stale` вычисляется при чтении** и нигде не хранится:\n"
    "открытое предложение, чья основа разошлась с адресатом. Основа элемента —\n"
    "НОМЕР ВЕРСИИ (любая правка элемента после записи предложения, и другого поля\n"
    "тоже, делает его устаревшим); основа раздела и подраздела — хэш содержимого;\n"
    "удалённый адресат — устарело.\n"
    "\n"
    "**Создать** — любой с правом обсуждения. Адресат: раздел, подраздел, элемент\n"
    "(категория, связь, тезис, термин); документу целиком — комментарий (400).\n"
    "`replace` — готовое значение: поле элемента (белый список полей шага 10.2,\n"
    "≤ 4000 знаков) либо разметка содержимого НЕзапертого подраздела (чистится\n"
    "`sanitizeSectionHtml`, ≤ 200 000); разделу целиком замену предложить нельзя\n"
    "(400). `note` — только обоснование (обязательно). Из источника (`comment`,\n"
    "`review_finding`) адрес берётся от источника и разрешается ЗАНОВО (основа —\n"
    "текущая); источник не из этого синтеза, удалённый, скрытый или чужой черновик\n"
    "— 404; объект источника удалён — 409 CONFLICT. `recommendation` — только с\n"
    "правом правки (403). Уведомление `proposal_created` — владельцу и редакторам.\n"
    "\n"
    "**Принять** (`capabilities.edit`) — НЕ исполняет: собирает ЧЕРНОВИК плана\n"
    "правок (§2.6) с шагом, несущим ссылку на предложение; документ не меняется,\n"
    "предложение остаётся `open` и получает `planId` (событие `plan_drafted`).\n"
    "Дальше — обычный путь плана: предпросмотр с каскадом, подтверждение,\n"
    "исполнение под слотом и квотой ИСПОЛНИТЕЛЯ (принявшего). `accepted` пишет\n"
    "исполнитель плана после успешного шага; версия шага — `change_source\n"
    "'proposal'` с происхождением (`ProposalOrigin`: предложение, его автор,\n"
    "источник — комментарий либо замечание и его рецензия `reviewId`, план, шаг),\n"
    "автору — `proposal_decided`. Перегенерация раздела и подраздела версий не\n"
    "пишет (так с 2.2): у regen-шагов связь с предложением — событие `accepted`\n"
    "и `metadata.proposals` маркера версии.\n"
    "Второго пути исполнения нет. Способ: у `replace` он определён адресатом\n"
    "(элемент → `edit_element`, подраздел → `edit_subsection`) и не выбирается,\n"
    "значение при принятии не подменяется (400); у `note` способ называет\n"
    "принимающий — `method`: элемент → `edit_element` (нужен `value`) |\n"
    "`refine_element`; подраздел → `edit_subsection` (нужен `value`) |\n"
    "`regen_subsection`; раздел → `regen`. Модель замечание как разрешение\n"
    "переписать документ не толкует: текст `note` уходит в шаг лишь доводом\n"
    "(контекстом) названного человеком способа. Предложение уже в черновике\n"
    "плана / не открыто → 409 CONFLICT.\n"
    "\n"
    "**Устаревшее принять нельзя**: основа разошлась с адресатом → 409\n"
    "`PROPOSAL_STALE` (details: state, base, current). То же правило держит\n"
    "исполнитель плана: если документ изменили, пока план лежал черновиком, шаг\n"
    "по предложению НЕ исполняется — снимается (`status 'skipped'`, `skipReason\n"
    "'proposal_stale' | 'proposal_not_open'`), предложение освобождается\n"
    "(`plan_released`) и ждёт решения. Автоматического перебазирования нет:\n"
    "**«новое поверх текущего»** (`rebase`) заводит ЧЕЛОВЕК — автор устаревшего\n"
    "предложения: новое предложение с текущей основой (значение и обоснование\n"
    "можно поправить), прежнее — `closed` / `superseded` со ссылкой\n"
    "`supersededBy`. Не устаревшее заново не заводится (409).\n"
    "\n"
    "**Отклонить** — только действие человека с правом правки (`reject`, слово\n"
    "решившего — `note`); машина предложение не отклоняет: пропуск шага, удаление\n"
    "или остановка плана его лишь освобождают. **Снять** (`withdraw`) — автор.\n"
    "**Закрыть** (`close`) — правящий, причина `manual` | `outdated`. Исключение\n"
    "участника — §2.18. Решения шлют автору `proposal_decided`.\n"
    "\n"
    "`ProposalEvent { id, type, actor, payload, createdAt }` — журнал (02 §2.41):\n"
    "`created`, `plan_drafted`, `plan_released`, `accepted`, `rejected`,\n"
    "`withdrawn`, `closed`, `rebased`; фраз в БД нет — клиент собирает их по коду.\n"
    "Клиент — 17.2. Сторож 4bp.\n"
    "\n"
    "---\n"
    "\n"
    "## 3. WebSocket-протокол\n",
    "171/B8 03 §2.20 предложения",
    marker="### 2.20. Предложения изменений (беседа 17.1)",
)
patch(
    P03,
    "CONFLICT            — обсуждение (16.1, §2.17): действие против состояния\n",
    "VERSION_CONFLICT    — ожидаемая версия не совпала (17.1): правка элемента\n"
    "                      (expectedVersion), подраздела и капсулы (expectedHash),\n"
    "                      создание плана (expected[]) — 409; запись не делается;\n"
    "                      details: { target, expected, current } либо у плана\n"
    "                      { conflicts: […] } — текущие значения для перечитки\n"
    "PROPOSAL_STALE      — принятие предложения, чей адресат изменён или удалён\n"
    "                      после его записи (17.1, §2.20) — 409; details: state,\n"
    "                      base, current; выход — «новое поверх текущего» автором\n"
    "CONFLICT            — обсуждение (16.1, §2.17): действие против состояния\n",
    "171/B9 03 §4.3 VERSION_CONFLICT / PROPOSAL_STALE",
    marker="VERSION_CONFLICT    — ожидаемая версия не совпала (17.1)",
)

# ══ 171/C: 01 — права редактора ══════════════════════════════════════════
patch(
    P01,
    "  и витрину) и обсуждает; права на правку у редактора появляются в 17.1.\n",
    "  и витрину) и обсуждает. С 17.1 действующий редактор ПРАВИТ наравне с\n"
    "  владельцем (`capabilities.edit` = владелец | редактор: элементы,\n"
    "  подразделы, капсула, планы, режимы, обогащение, трансформация,\n"
    "  перегенерация, рекомендации, пауза и возобновление); `manage`\n"
    "  (участники, видимость, удаление, копия, родословная) — только владелец.\n"
    "  Платит ИСПОЛНИТЕЛЬ: слот генерации, квота и BYO-ключ — того, кто нажал;\n"
    "  исполнитель записан в версии и строке журнала (`actor_user_id`,\n"
    "  контекст запроса `services/actor-context.ts`). Правка несёт ожидаемую\n"
    "  версию (409 `VERSION_CONFLICT` вместо «последний перезаписал»).\n"
    "  Предложение участника исполняет только план правок (03 §2.20).\n",
    "171/C1 01 права редактора с 17.1",
    marker="С 17.1 действующий редактор ПРАВИТ наравне с",
)

# ══ 171/D: 04 — карта кода ═══════════════════════════════════════════════
_p04 = P04.read_text(encoding="utf-8")
_anchor04 = next((ln for ln in _p04.split("\n") if ln.startswith("| `client/src/api/discussion.ts` (18 маршрутов §2.17")), None)
if _anchor04 is None:
    print("  FAIL  171/D1 04: строка 16.3 (якорь) не найдена")
    failed += 1
else:
    patch(
        P04,
        _anchor04 + "\n",
        _anchor04 + "\n"
        "| `canEditSynthesisOf` в `server/services/capabilities.ts`; `server/services/actor-context.ts` "
        "(`runWithActor`, `currentActorId`, `genLogActor`); `server/services/expected-version.ts` "
        "(`assertElementVersion`, `assertContentHash`, `assertPlanExpectations`, `VersionConflictError`); "
        "`packages/shared/utils/expected-version.ts` (`sectionContentHash`, `subsectionContentHash`); "
        "`server/services/proposals.ts`, `proposal-links.ts`, `routes/proposals.ts`; "
        "`server/services/log-audience.ts`; шаг `edit_subsection` в `edit-planner.ts` / `plan-executor.ts` "
        "| НОВОЕ (17.1; в исходнике совместной правки нет): право правки редактору одной функцией "
        "`editCapability`; исполнитель запроса — AsyncLocalStorage (писатели версий и журнала его не "
        "передают); ожидаемая версия на четырёх путях правки; предложения исполняет только план правок "
        "(`acceptProposal` → `createPlan` с `trustProposalRefs`, `accepted` — `settleProposalStep` "
        "исполнителя); имена исполнителей и стоимость чужих строк — по смотрящему |\n",
        "171/D1 04 строка модулей 17.1",
        marker="| `canEditSynthesisOf` в `server/services/capabilities.ts`; `server/services/actor-context.ts`",
    )

# ══ 171/E: 05 — структура файлов ═════════════════════════════════════════
patch(
    P05,
    "│       │   ├── notifications.ts        # 16.2: NOTIFICATION_TYPES (11) / CATEGORIES (5) / CATEGORY_OF, REF_KINDS,\n",
    "│       │   ├── proposals.ts            # 17.1: PROPOSAL_SOURCES / KINDS / STATUSES / CLOSE_REASONS /\n"
    "│       │   │                           #  EVENT_TYPES / ACCEPT_METHODS, пределы текстов и страницы\n"
    "│       │   ├── notifications.ts        # 16.2: NOTIFICATION_TYPES (11) / CATEGORIES (5) / CATEGORY_OF, REF_KINDS,\n",
    "171/E1 05 shared/constants/proposals.ts",
    marker="│       │   ├── proposals.ts            # 17.1: PROPOSAL_SOURCES / KINDS / STATUSES",
)
patch(
    P05,
    "│       │   ├── notifications.ts        # 16.2: MemberView, PendingInvitation, MembersView, MemberInviteResult,\n",
    "│       │   ├── proposals.ts            # 17.1: Proposal, ProposalBase, ProposalEvent, ProposalDetail,\n"
    "│       │   │                           #  ProposalCreateInput, ProposalAcceptInput/Result; в edit-plan.ts —\n"
    "│       │   │                           #  шаг edit_subsection, StepProposalRef, PlanExpectation, skipReason;\n"
    "│       │   │                           #  в elements.ts — ChangeSource 'proposal', ProposalOrigin, ActorRef\n"
    "│       │   ├── notifications.ts        # 16.2: MemberView, PendingInvitation, MembersView, MemberInviteResult,\n",
    "171/E2 05 shared/types/proposals.ts",
    marker="│       │   ├── proposals.ts            # 17.1: Proposal, ProposalBase, ProposalEvent",
)
patch(
    P05,
    "│           ├── discussion-address.ts   # 16.1: ключи адресов (categoryKey, edgeKey, thesisKey, termKey,\n",
    "│           ├── expected-version.ts     # 17.1: ожидаемая версия правки — sectionContentHash /\n"
    "│           │                           #  subsectionContentHash (≡ хэшу адреса 16.1), VersionConflictDetails\n"
    "│           ├── discussion-address.ts   # 16.1: ключи адресов (categoryKey, edgeKey, thesisKey, termKey,\n",
    "171/E3 05 shared/utils/expected-version.ts",
    marker="│           ├── expected-version.ts     # 17.1: ожидаемая версия правки — sectionContentHash",
)
patch(
    P05,
    "│   │       ├── 0018_members_notifications.sql  # 16.2: notifications, notification_settings; auth_tokens +=\n",
    "│   │       ├── 0019_proposals_actor.sql  # 17.1: proposals, proposal_events; actor_user_id в\n"
    "│   │       │                           #  element_versions и generation_log (SET NULL); drizzle-kit, тег\n"
    "│   │       │                           #  переименован; только добавления\n"
    "│   │       ├── 0018_members_notifications.sql  # 16.2: notifications, notification_settings; auth_tokens +=\n",
    "171/E4 05 миграция 0019",
    marker="│   │       ├── 0019_proposals_actor.sql  # 17.1: proposals, proposal_events",
)
patch(
    P05,
    "│   │   ├── members.ts                  # 16.2: 11 маршрутов участников (03 §2.18): GET /shared (ДО /:id),\n",
    "│   │   ├── proposals.ts                # 17.1: 8 маршрутов /syntheses/:id/proposals (03 §2.20) под\n"
    "│   │   │                               #  requireAuth + гейт обсуждения; принятие отдаёт черновик плана\n"
    "│   │   ├── members.ts                  # 16.2: 11 маршрутов участников (03 §2.18): GET /shared (ДО /:id),\n",
    "171/E5 05 routes/proposals.ts",
    marker="│   │   ├── proposals.ts                # 17.1: 8 маршрутов /syntheses/:id/proposals",
)
patch(
    P05,
    "│   │   ├── discussion-address.ts       # 16.1: индекс адресуемых объектов концепции (loadAddressIndex —\n",
    "│   │   ├── actor-context.ts            # 17.1: исполнитель запроса (AsyncLocalStorage): runWithActor —\n"
    "│   │   │                               #  middleware/auth, ws/handler, withGenerationSlot; currentActorId —\n"
    "│   │   │                               #  createVersion; genLogActor — каждая вставка generation_log\n"
    "│   │   ├── expected-version.ts         # 17.1: assertElementVersion (в транзакции, под блокировкой\n"
    "│   │   │                               #  элемента), assertContentHash, assertPlanExpectations,\n"
    "│   │   │                               #  VersionConflictError → 409 VERSION_CONFLICT\n"
    "│   │   ├── proposals.ts                # 17.1: предложения — создать (discuss), принять (edit) =\n"
    "│   │   │                               #  ЧЕРНОВИК плана (planBodyFor, createPlan с trustProposalRefs),\n"
    "│   │   │                               #  отклонить / закрыть (edit), снять и «новое поверх текущего»\n"
    "│   │   │                               #  (автор); stale вычисляется; документ не пишет\n"
    "│   │   ├── proposal-links.ts           # 17.1: связь предложение ↔ план без зависимости от\n"
    "│   │   │                               #  планировщика: события, releaseProposalsOfPlan,\n"
    "│   │   │                               #  proposalStepBlockers (заслон устаревшего), settleProposalStep\n"
    "│   │   │                               #  (единственное место 'accepted'), closeProposalsOfMember\n"
    "│   │   ├── log-audience.ts             # 17.1: кто смотрит журнал и версии — audienceOf, shownActor\n"
    "│   │   │                               #  (имя — участникам, у строк не-владельца), costVisible\n"
    "│   │   ├── discussion-address.ts       # 16.1: индекс адресуемых объектов концепции (loadAddressIndex —\n",
    "171/E6 05 services 17.1",
    marker="│   │   ├── actor-context.ts            # 17.1: исполнитель запроса (AsyncLocalStorage)",
)
patch(
    P05,
    "    │                                   # smoke-163-request1 — 16.3: исходники (компоненты обсуждения без\n",
    "    │                                   # smoke-171-request1 — 17.1: чистые функции (editCapability, хэши\n"
    "    │                                   #  ожидаемой версии ≡ адресам, planBodyFor, способы по адресату);\n"
    "    │                                   #  живьём по HTTP: права редактора, VERSION_CONFLICT на четырёх\n"
    "    │                                   #  путях, исполнитель в версии и журнале (имена/стоимость по\n"
    "    │                                   #  смотрящему), пауза редактору; предложения — принять = черновик,\n"
    "    │                                   #  исполнение планом, устаревшее, отклонение человеком, «новое\n"
    "    │                                   #  поверх текущего», исключение участника (59 ✓)\n"
    "    │                                   # test-171-requests2-5 — 17.1, тестовые запросы: живой сервер под\n"
    "    │                                   #  BILLING_ENFORCE=true + мок Claude; R2 права и плательщик (квота\n"
    "    │                                   #  редактора, отказ биллинга ему, 403 рецензенту на 30 путях,\n"
    "    │                                   #  manage), R3 происхождение (журнал, выгрузка, номер документа),\n"
    "    │                                   #  R4 одновременные правки, R5 предложения (50 ✓ ×3)\n"
    "    │                                   # smoke-163-request1 — 16.3: исходники (компоненты обсуждения без\n",
    "171/E7 05 smoke-171-request1",
    marker="    │                                   # smoke-171-request1 — 17.1: чистые функции",
)

# ══ 171/F: 07 — «По факту 17.1 (первый запрос)» и реестр §12 ═════════════
patch(
    P07,
    "- не давать редактору manage.\n"
    "```\n"
    "\n"
    "**Последующие запросы:**\n"
    "- «Протестируй права и плательщика живьём:",
    "- не давать редактору manage.\n"
    "```\n"
    "\n"
    "**По факту 17.1 (первый запрос — 2026-11-15).** Исполнено целиком\n"
    "(пп. 0–6), одним заходом; тестовые запросы и завершение — следующими\n"
    "запросами. Вход: HEAD 68c8784 (16.3 закрыта), `check:dotfiles` OK,\n"
    "`npm install` в клоне, `typecheck` чистый до правок; миграции 0000…0018\n"
    "+ четыре сида на свежей базе.\n"
    "\n"
    "0. **Сверка (п.0) — что оказалось не так, как в тексте запроса.**\n"
    "   (а) Плательщик уже исполнитель: во ВСЕХ HTTP-роутах и в WS в\n"
    "   `withGenerationSlot` / `resolveBilling` / `billingCheck` приходит\n"
    "   `user.id` запроса, `row.userId` синтеза туда не идёт нигде — мешал\n"
    "   только гейт права. (б) «17.1 меняет только `editCapability`» (16.1) —\n"
    "   неверно: одиннадцать мест звали двухдоводный синхронный\n"
    "   `canEditSynthesis(row, userId)` БЕЗ участия (pause-resume ×2,\n"
    "   generation-service ×2, `createPlan`, ws ×4, `/plans/impact`,\n"
    "   `/subsection-impact`) — редактор получил бы там отказ при открытом\n"
    "   `editGate`. Заведена `canEditSynthesisOf(row, userId)` (грузит участие);\n"
    "   двухдоводный вызов вне модуля прав красит сторож 4bp. (в) Шага «ручная\n"
    "   правка подраздела» у планов не было — заведён тип `edit_subsection`\n"
    "   (бесплатный, тот же `updateSubsection`, что карточка 9.2): без него\n"
    "   предложение-замену подраздела пришлось бы исполнять мимо плана. (г)\n"
    "   `projectSynthesis` и `logsAllowed` отдавали паузу и журнал только\n"
    "   владельцу — редактор не смог бы ни возобновить, ни разобрать обрыв.\n"
    "\n"
    "1. **Права.** `editCapability(owner, role) = owner || role === 'editor'`\n"
    "   (действующий; приглашённый — нет); `manage` — только владелец (одно\n"
    "   `manage: true` в модуле). План принадлежит автору (владелец или\n"
    "   редактор): `loadPlanRow` требует авторства И права правки СЕЙЧАС —\n"
    "   исключённый или пониженный редактор свой план не читает и не исполняет\n"
    "   (предложения из его черновиков освобождаются); остановить чужой\n"
    "   плановый обрыв (`resume … stop`) может любой правящий. Пауза\n"
    "   редактору отдаётся БЕЗ `genParams` (Д-65: в них содержимое родительских\n"
    "   концепций владельца) — возобновление читает их на сервере. Журнал и\n"
    "   запросы редактору открыты по праву правки; рецензенту — по флагам 8.6.\n"
    "\n"
    "2. **Плательщик и исполнитель.** Слот берётся на `user.id`; `fn` слота\n"
    "   исполняется под `runWithActor(userId)`. Исполнитель — контекст запроса\n"
    "   (`services/actor-context.ts`, AsyncLocalStorage): его ставят\n"
    "   `requireAuth` / `optionalAuth`, обе точки WS и слот; `createVersion`\n"
    "   пишет `actor_user_id` сам, каждая вставка `generation_log` несёт\n"
    "   `...genLogActor()` (18 мест; импорт — NULL = владелец). Сигнатуры\n"
    "   писателей не менялись. Номер документа (`formatVersion`, правила роста)\n"
    "   не тронут: `edit_subsection` версию не поднимает, как `edit_element`.\n"
    "\n"
    "3. **Журнал.** «Запустил: X» (`/logs/formatted`) и `GenLogEntry.actor` /\n"
    "   `ElementVersion.actor` — только у строк не-владельца и только\n"
    "   участникам (`services/log-audience.ts`); читателю по `show_logs` имён\n"
    "   нет; выгрузки зовут форматтер с `EXPORT_AUDIENCE` (без имён).\n"
    "   Стоимость строки не-владельца — владельцу и самому исполнителю,\n"
    "   остальным `costHidden` и «Стоимость: скрыта»; итог считается без\n"
    "   скрытых с пометкой.\n"
    "\n"
    "4. **Ожидаемая версия.** Элемент — `expectedVersion` (номер последней\n"
    "   версии, 0 — не было), сверка в транзакции правки под\n"
    "   `pg_advisory_xact_lock` по id элемента; подраздел и капсула —\n"
    "   `expectedHash` (sha256 содержимого, ТОТ ЖЕ, что у адреса 16.1; исходник\n"
    "   подраздела отдаёт `hash`); план — `expected[]`, расхождения отдаются\n"
    "   все разом. Не совпало — 409 `VERSION_CONFLICT` с текущим значением,\n"
    "   записи нет; без ожидания — как прежде. Обходного force нет.\n"
    "\n"
    "5. **Предложения** (02 §2.40–2.41, 03 §2.20). Принятие = ЧЕРНОВИК плана\n"
    "   (`createPlan` с `trustProposalRefs`; из тела HTTP ссылки отбрасываются),\n"
    "   документ не меняется, предложение остаётся `open` с `plan_id`.\n"
    "   `accepted` пишется в ОДНОМ месте — `settleProposalStep` после успешного\n"
    "   шага. Основа: у элемента — номер версии, у раздела и подраздела — хэш\n"
    "   (`baseIsCurrent`). Устаревшее не принимает ни служба (409 `PROPOSAL_STALE`), ни\n"
    "   исполнитель плана: шаг снимается с `skipReason`, предложение\n"
    "   освобождается, НЕ отклоняется. Отклонение — только `rejectProposal`\n"
    "   человеком с правом правки. «Новое поверх текущего» — действием автора\n"
    "   (`rebase`), автоматического перебазирования нет. `note` принимается\n"
    "   способом, который называет принимающий; модель получает текст лишь\n"
    "   доводом шага. Исключение участника и удаление аккаунта закрывают его\n"
    "   открытые предложения (`member_removed`). Версии шагов `edit_element` /\n"
    "   `refine_element` / `edit_subsection` по предложению — `'proposal'` с\n"
    "   `ProposalOrigin` (с рецензией замечания-источника); перегенерация\n"
    "   версий раздела не пишет вовсе (так с 2.2), у regen-шагов связь —\n"
    "   событие `accepted` и `metadata.proposals` маркера версии (Д-86).\n"
    "\n"
    "6. **Сторож** — серия 2be/4bp/5ay; перевёрнуты под новое правило 2bb,\n"
    "   4bm (правило edit, ws), 5aw, 4bn (метка → вызов), ослаблены\n"
    "   альтернацией 4at, 4u, 4ad, 4af, 4ar, 4bb, 4bf, 4bg, 4bj. Клиент: только\n"
    "   исчерпывающие подписи (`edit_subsection`, источник `proposal`) и два\n"
    "   кода в `ApiErrorCode` — интерфейс предложений и перевод правки на\n"
    "   `capabilities.edit` — 17.2. Строк en/de — 38 (утверждены пользователем\n"
    "   2026-11-15).\n"
    "\n"
    "   Проверки: `tests/smoke-171-request1.mjs` 59 ✓; `typecheck`,\n"
    "   `check:integration`, `i18n:check --strict`, `check:dotfiles`.\n"
    "   Не сделанное и найденное — Д-81…Д-86 (Д-83…Д-85 закрыты тестовыми\n"
    "   запросами этой же беседы; в §12 — Д-81, Д-82, Д-86).\n"
    "\n"
    "**Последующие запросы:**\n"
    "- «Протестируй права и плательщика живьём:",
    "171/F1 07 «По факту 17.1 (первый запрос)»",
    marker="**По факту 17.1 (первый запрос — 2026-11-15).**",
)
patch(
    P07,
    "| № | Вид | Долг | Где найдено | Адресат | Состояние |\n"
    "|---|---|---|---|---|---|\n"
    "\n"
    "> Реестр пуст с 2026-11-05 (закрытие 15.4 и Фазы 15): все строки Д-1…Д-80\n"
    "> — в 08 Часть IV; остались только ограничения «Огр-N» ниже.\n",
    "| № | Вид | Долг | Где найдено | Адресат | Состояние |\n"
    "|---|---|---|---|---|---|\n"
    "| Д-81 | недоделка | Клиент не шлёт ожидаемую версию: `expectedVersion` (PATCH элементов), `expectedHash` (подраздел, капсула), `expected[]` (план) и не разбирает 409 `VERSION_CONFLICT`. Номера версии элемента в DTO элемента нет — берётся из `GET …/versions` либо из ответа PATCH; решить, нужен ли он в DTO | 17.1, первый запрос, п.4 | 17.2 | открыт |\n"
    "| Д-82 | недоделка | Пути правки на клиенте гейтятся `isOwner` (16.3 оставила): редактор сервером допущен, интерфейсом — нет; интерфейса предложений (создать, принять → план, отклонить, снять, «новое поверх текущего», события), подписи шага `edit_subsection` с разворотом разметки и карточки происхождения `proposal` в истории версий нет | 17.1, первый запрос, п.6 | 17.2 | открыт |\n"
    "| Д-86 | недоделка | Шаги `regen` / `regen_subsection` по предложению не оставляют «почему» у раздела: перегенерация версий раздела не пишет вовсе (так с 2.2), связь с предложением — только событие `accepted` (planId, stepIndex) и `metadata.proposals` маркера версии; клиенту нужно решить, где это показать | 17.1, первый запрос, п.5 | 17.2 | открыт |\n",
    "171/F2 07 §12 Д-81…Д-86",
    marker="| Д-81 | недоделка | Клиент не шлёт ожидаемую версию",
)
patch(
    P07,
    "   При закрытии 16.3 (2026-11-09) новых долгов и ограничений нет, строк\n"
    "   «не назначен» нет; реестр пуст — Фаза 16 закрыта.\n",
    "   При закрытии 16.3 (2026-11-09) новых долгов и ограничений нет, строк\n"
    "   «не назначен» нет; реестр пуст — Фаза 16 закрыта.\n"
    "   Первым запросом 17.1 (2026-11-15) заведены Д-81, Д-82, Д-86 (адресат\n"
    "   17.2) и Д-83, Д-84, Д-85 — последние три сделаны тестовыми запросами\n"
    "   той же беседы по решению пользователя (в 08 Часть IV); строк «не\n"
    "   назначен» нет.\n",
    "171/F3 07 §12 правило 3 — запись 17.1",
    marker="   Первым запросом 17.1 (2026-11-15) заведены Д-81, Д-82, Д-86",
)

# ══ 171/G: NEXT-CONTEXT — пишется частью III (завершение беседы) ═══════

# ══ 171/H: deploy/* — двадцать миграций ══════════════════════════════════
for name in ("philosynth-ubuntu.sh", "philosynth-termux.sh"):
    patch(
        DEPLOY / name,
        "#  - миграций ДЕВЯТНАДЦАТЬ (0000…0018; 0018 — участники и уведомления:",
        "#  - миграций ДВАДЦАТЬ (0000…0019; 0019 — предложения и исполнитель: proposals, proposal_events,"
        " actor_user_id в element_versions и generation_log, 17.1; 0018 — участники и уведомления:",
        f"171/H {name} шапка",
        marker="#  - миграций ДВАДЦАТЬ (0000…0019; 0019 — предложения и исполнитель",
    )
    patch(
        DEPLOY / name,
        'ok "миграции применены — 0000_initial … 0018 (drizzle ведёт',
        'ok "миграции применены — 0000_initial … 0019 (drizzle ведёт',
        f"171/H {name} сообщение",
    )
patch(
    DEPLOY / "philosynth-ubuntu.md",
    "Миграций девятнадцать (0000…0018), `drizzle-kit` ведёт их учёт сам, повторный прогон — no-op:\n",
    "Миграций двадцать (0000…0019), `drizzle-kit` ведёт их учёт сам, повторный прогон — no-op:\n",
    "171/H ubuntu.md счёт",
)
_umd = (DEPLOY / "philosynth-ubuntu.md").read_text(encoding="utf-8")
_line18 = next((ln for ln in _umd.split("\n") if ln.startswith("- `0018_members_notifications` — ")), None)
if _line18 is None:
    print("  FAIL  171/H ubuntu.md: строка 0018 (якорь) не найдена")
    failed += 1
else:
    _idx = _umd.index(_line18)
    _end = _umd.index("\n\n", _idx)
    _block18 = _umd[_idx:_end]
    patch(
        DEPLOY / "philosynth-ubuntu.md",
        _block18 + "\n",
        _block18.rstrip(".").rstrip(";") + ";\n"
        "- `0019_proposals_actor` — предложения изменений и исполнитель: `proposals`,\n"
        "  `proposal_events`, колонка `actor_user_id` в `element_versions` и\n"
        "  `generation_log` (беседа 17.1).\n",
        "171/H ubuntu.md строка 0019",
        marker="- `0019_proposals_actor` — предложения изменений и исполнитель",
    )
patch(
    DEPLOY / "philosynth-termux.md",
    "девятнадцать миграций (0000…0018; последние — `0016_plan_editions`, редакции\n"
    "тарифов 15.4, `0017_discussion`, обсуждение и рецензии 16.1, и\n"
    "`0018_members_notifications`, участники и уведомления 16.2) и четыре сида.\n",
    "двадцать миграций (0000…0019; последние — `0016_plan_editions`, редакции\n"
    "тарифов 15.4, `0017_discussion`, обсуждение и рецензии 16.1,\n"
    "`0018_members_notifications`, участники и уведомления 16.2, и\n"
    "`0019_proposals_actor`, предложения и исполнитель 17.1) и четыре сида.\n",
    "171/H termux.md счёт",
    marker="двадцать миграций (0000…0019; последние — `0016_plan_editions`",
)

# ══════════════════════════ ЧАСТЬ II (2026-11-15) ════════════════════════
# ══ 171/I: 03 — общее правило права правки, пауза редактору ══════════════
patch(
    P03,
    "> **9.1 (2026-09-19).** «Три пути» — о СОДЕРЖАНИИ службы.",
    "> **17.1 (2026-11-15) — право правки.** Всюду ниже, где о пути ПРАВКИ\n"
    "> документа сказано «только владелец» (элементы и связи §2.4, подразделы и\n"
    "> капсула §2.3–2.4, планы §2.6, перегенерация §2.5, режимы §2.7,\n"
    "> обогащение §2.14, трансформация §2.15, рекомендации §2.16, удаления 15.2,\n"
    "> пауза и её возобновление, подписка на генерацию по WebSocket), читать:\n"
    "> **`capabilities.edit` — владелец либо действующий редактор** (один модуль\n"
    "> прав, §2.17). «Только владелец» в прямом смысле осталось за УПРАВЛЕНИЕМ\n"
    "> (`capabilities.manage`): участники и приглашения, видимость и флаги,\n"
    "> название, удаление концепции, копия, привязка и отвязка родословной.\n"
    "> Платит и записывается исполнителем тот, кто нажал: слот генерации,\n"
    "> квота подписки и BYO-ключ — его; отказ биллинга (403 с кодом\n"
    "> `QUOTA_EXCEEDED` / `INSUFFICIENT_BALANCE` / `BILLING_REQUIRED`, как с 6.1)\n"
    "> получает он, подписка владельца за редактора не подставляется. На платных\n"
    "> маршрутах право правки проверяется ДО биллинга (`editRightFirst`):\n"
    "> участник без права получает 403 `FORBIDDEN`, а не отказ биллинга.\n"
    "> Отменить идущую операцию (WS `cancel`) может запустивший и владелец\n"
    "> концепции.\n"
    ">\n"
    "> **9.1 (2026-09-19).** «Три пути» — о СОДЕРЖАНИИ службы.",
    "171/I1 03 §2 общее правило права правки",
    marker="> **17.1 (2026-11-15) — право правки.**",
)
patch(
    P03,
    "                                //   оценки паузы невладельцу не считаются;\n",
    "                                //   оценки паузы невладельцу не считаются;\n"
    "                                //   17.1: РЕДАКТОРУ (capabilities.edit) пауза\n"
    "                                //   отдаётся — он её возобновляет, — но БЕЗ\n"
    "                                //   genParams (у kind 'gen' — пустой объект);\n"
    "                                //   оценки паузы ему считаются;\n",
    "171/I2 03 §2.2 пауза редактору",
    marker="//   17.1: РЕДАКТОРУ (capabilities.edit) пауза",
)

# ══ 171/J: 07 — «По факту 17.1 (тестовые запросы)» ═══════════════════════
patch(
    P07,
    "отклонение и закрытие при исключении участника различаются»\n",
    "отклонение и закрытие при исключении участника различаются»\n"
    "\n"
    "**По факту 17.1 (тестовые запросы — 2026-11-15).** Все четыре — одним\n"
    "заходом по слову пользователя; тем же заходом — долги Д-83…Д-85 (решение\n"
    "пользователя: объём мал, делать здесь) и утверждение 38 строк en/de.\n"
    "Харнесс — `tests/test-171-requests2-5.mjs` (живой сервер :3000 под\n"
    "`BILLING_ENFORCE=true`, мок Claude в процессе, живой импорт образца):\n"
    "50 ✓ ×3.\n"
    "\n"
    "1. **Текст запроса против кода.** (а) «402 исполнителю» — оговорка\n"
    "   текста: по контракту 6.1 ВСЕ отказы биллинга идут 403 с кодом\n"
    "   (`QUOTA_EXCEEDED`, `INSUFFICIENT_BALANCE`, `BILLING_REQUIRED`); статуса\n"
    "   402 у службы нет. Проверено: отказ получает редактор, по ЕГО квоте\n"
    "   (`details.quota` — его), подписка владельца не подставляется. (б)\n"
    "   «Номер документа растёт по прежним правилам» — правила такие:\n"
    "   отдельная перегенерация РАЗДЕЛА номер не меняет, подраздела — `sub + 1`,\n"
    "   план с перегенерацией — `base + 1`, `sub = 0`; бесплатный план\n"
    "   (`edit_element`, `edit_subsection`) — без изменений. Кто исполнял, на\n"
    "   номер не влияет. (в) Перечитка врезки «Фаза 17» после первого запроса\n"
    "   нашла два расхождения с ним, оба исправлены: основа предложения у\n"
    "   ЭЛЕМЕНТА — номер версии (первый запрос сверял только хэш адреса: правка\n"
    "   другого поля не делала предложение устаревшим), и `origin` обязан нести\n"
    "   рецензию замечания-источника (`reviewId`; ссылка шага её не несла).\n"
    "\n"
    "2. **Д-83** (право правки до биллинга): `editRightFirst` между\n"
    "   `requireAuth` и `billingCheck` на десяти платных маршрутах (генерация\n"
    "   ×2, режимы ×2, обогащение ×3, трансформация ×2, ретрофит рекомендаций):\n"
    "   рецензент и посторонний без оплаты получают 403 `FORBIDDEN`. Дефект\n"
    "   старше 17.1 (посторонний получал отказ биллинга с 6.1), вскрыт ею.\n"
    "   **Д-84**: владелец останавливает чужой запуск на своей концепции (WS\n"
    "   `cancel` → `cancelAsManager`), читает и удаляет чужой черновик плана\n"
    "   (`loadPlanRow(…, { manager: true })` — только `getPlan` и `deletePlan`);\n"
    "   исполнять и править чужой план нельзя — платит автор. **Д-85**:\n"
    "   выгрузка HTML — имена исполнителей выключены всегда, стоимость строк\n"
    "   не-владельца во встроенном журнале и видимом логе — по выгружающему.\n"
    "\n"
    "3. **Найдено прогоном.** Редактор, пониженный до рецензента, оставлял\n"
    "   предложения в своих черновиках планов (никто не мог ни исполнить, ни\n"
    "   принять заново) — `changeMemberRole` их освобождает. Шаг, снятый\n"
    "   исполнителем из-за устаревшего предложения, слал `plan_step_done` —\n"
    "   убрано, статус и `skipReason` приходят с `plan_updated`. Удаление\n"
    "   аккаунта участника закрывает его открытые предложения, как исключение.\n"
    "\n"
    "4. **Прежние харнессы под новое правило.** `smoke-161` (4 утверждения),\n"
    "   `test-161-requests2-4` (2), `smoke-162` (счёт миграций — `≥ 19`),\n"
    "   `test-162-requests2-4` (право редактора; и устаревшее С 16.3\n"
    "   утверждение «у участника нет вкладок» — вкладки обсуждения участнику\n"
    "   дала 16.3, проверяется отсутствие «Участники»). Прогоны: smoke-161\n"
    "   58 ✓, smoke-162 49 ✓, smoke-163 32 ✓, test-161 61 ✓, test-163 (браузер,\n"
    "   Chrome 131 из `chrome/`, сборка клиента) 49 ✓ (первый прогон — 48:\n"
    "   гонка «категория пересоздана» сразу за перегенерацией, повтор чист);\n"
    "   test-162 (браузер) 72 ✓ — после правки проверки «вкладка „Участники“\n"
    "   пуста», стоявшей без ожидания ответа (гонка отрисовки в харнессе).\n"
    "   Сторож: 4bp += порядок `editRightFirst`, выгрузка, чужой план,\n"
    "   отмена владельцем, понижение редактора.\n",
    "171/J1 07 «По факту 17.1 (тестовые запросы)»",
    marker="**По факту 17.1 (тестовые запросы — 2026-11-15).**",
)

# ══ 171/K: 08 Часть IV — Д-83, Д-84, Д-85 ════════════════════════════════
_p08 = P08.read_text(encoding="utf-8")
_row80 = next((ln for ln in _p08.split("\n") if ln.startswith("| Д-80 — ")), None)
if _row80 is None:
    print("  FAIL  171/K1 08: строка Д-80 (якорь) не найдена")
    failed += 1
else:
    patch(
        P08,
        _row80 + "\n",
        _row80 + "\n"
        "| Д-83 — Предпроверка биллинга стояла раньше проверки права правки | 17.1 | 17.1 (первый запрос) | ЗАКРЫТ 17.1 (2026-11-15, та же беседа): `editRightFirst` в `routes/edit-gate.ts` между `requireAuth` и `billingCheck` на десяти платных маршрутах — участник без права правки получает 403 `FORBIDDEN`, а не отказ биллинга; сторож 4bp, `test-171` R2 |\n"
        "| Д-84 — Чужой запуск и чужой черновик плана владельцу недоступны | 17.1 | 17.1 (первый запрос) | ЗАКРЫТ 17.1 (2026-11-15, та же беседа; решение пользователя «делать здесь»): WS `cancel` владельца останавливает запуск редактора (`cancelAsManager`); чужой план владельцу открыт на чтение и удаление (`loadPlanRow` с `manager`), исполнение и правка — только автору; сторож 4bp, `test-171` R2 |\n"
        "| Д-85 — Выгрузка не скрывала стоимость строк не-владельца | 17.1 | 17.1 (первый запрос) | ЗАКРЫТ 17.1 (2026-11-15, та же беседа; решение пользователя «делать здесь»): `exportHTML` принимает аудиторию — имена исполнителей выключены всегда, стоимость чужих строк во встроенном журнале и видимом логе видят владелец и сам исполнитель; сторож 4bp, `test-171` R3 |\n",
        "171/K1 08 Часть IV — Д-83…Д-85",
        marker="| Д-83 — Предпроверка биллинга стояла раньше проверки права правки",
    )

# ══════════════════════════ ЧАСТЬ III (2026-11-15) ═══════════════════════
# ══ 171/L: 07 — завершение ═══════════════════════════════════════════════
patch(
    P07,
    "**Завершение беседы:**\n"
    "- «Скомпилируй проект (`npm run typecheck`) — покажи и исправь все type errors, не меняя логику»\n"
    "- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, `audit`»\n"
    "- «Ревью: перечисли оставшиеся TODO и заглушки»\n"
    "- 02/03 — поля, коды, маршруты; 08 Часть II, 09, NEXT-CONTEXT (07 §10)\n",
    "**По факту 17.1 (завершение — 2026-11-15).** Компиляция: `typecheck` 0\n"
    "ошибок (shared, сервер, клиент, сторож, скрипты), `vite build` проходит.\n"
    "Интеграция: `check:integration` INTEGRATION OK (2be/4bp/5ay) на свежем\n"
    "клоне (`git clone` локального репозитория + свой `npm install`, миграции\n"
    "0000…0019), `check:dotfiles` OK, `i18n:check --strict` чист (38 ключей\n"
    "утверждены, черновиков 0), `audit` без расхождений. Ревью: TODO и заглушек\n"
    "в коде 17.1 нет. 02/03 — поля, коды и маршруты внесены частью I–II патча\n"
    "(02 §2.12, §2.15, §2.40–2.41; 03 §2, §2.2–2.4, §2.6, §2.12, §2.18–2.20,\n"
    "§4.3). Долги: в §12 — Д-81, Д-82, Д-86 (адресат 17.2, вписаны в её\n"
    "текст); Д-83…Д-85 заведены и закрыты здесь же (08 Часть IV); ограничений\n"
    "не добавлено. Клиент совместной правки и предложений — 17.2. 08 Части\n"
    "I/II, 09, врезка «Фаза 17», README, NEXT-CONTEXT (ближайшая — 17.2; серия\n"
    "сторожей 2bf/4bq/5az, миграция 0020). Вся беседа — один коммит.\n"
    "\n"
    "**Завершение беседы:**\n"
    "- «Скомпилируй проект (`npm run typecheck`) — покажи и исправь все type errors, не меняя логику»\n"
    "- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, `audit`»\n"
    "- «Ревью: перечисли оставшиеся TODO и заглушки»\n"
    "- 02/03 — поля, коды, маршруты; 08 Часть II, 09, NEXT-CONTEXT (07 §10)\n",
    "171/L1 07 «По факту 17.1 (завершение)»",
    marker="**По факту 17.1 (завершение — 2026-11-15).**",
)
patch(
    P07,
    "> **Две беседы, порядок ЖЁСТКИЙ: 17.1 → 17.2**, после Фазы 16.\n",
    "> **Две беседы, порядок ЖЁСТКИЙ: 17.1 → 17.2**, после Фазы 16.\n"
    "> **17.1 закрыта 2026-11-15** (сервер: редактор правит, платит и записан\n"
    "> исполнителем тот, кто нажал; ожидаемая версия → 409 `VERSION_CONFLICT`;\n"
    "> предложения исполняет только план правок; миграция 0019\n"
    "> `proposals_actor`; сторож 2be/4bp/5ay; долги 17.2 — Д-81, Д-82, Д-86).\n"
    "> Ближайшая — 17.2.\n",
    "171/L2 07 врезка «Фаза 17» — 17.1 закрыта",
    marker="> **17.1 закрыта 2026-11-15** (сервер: редактор правит",
)
patch(
    P07,
    "   той же беседы по решению пользователя (в 08 Часть IV); строк «не\n"
    "   назначен» нет.\n",
    "   той же беседы по решению пользователя (в 08 Часть IV); строк «не\n"
    "   назначен» нет.\n"
    "   При закрытии 17.1 (2026-11-15) в реестре — Д-81, Д-82, Д-86 (все —\n"
    "   17.2, вписаны в её текст); ограничений не добавлено; строк «не\n"
    "   назначен» нет.\n",
    "171/L3 07 §12 — журнал закрытия 17.1",
    marker="   При закрытии 17.1 (2026-11-15) в реестре — Д-81, Д-82, Д-86",
)
patch(
    P07,
    "### Беседа 17.2: Решение по предложению, соавторство в интерфейсе (клиент)\n",
    "### Беседа 17.2: Решение по предложению, соавторство в интерфейсе (клиент)\n"
    "\n"
    "> **Долги 17.1 с адресатом 17.2 (§12):** Д-81 — клиент шлёт ожидаемую\n"
    "> версию на всех четырёх путях и разбирает 409 `VERSION_CONFLICT`\n"
    "> (решить, нужен ли номер версии в DTO элемента); Д-82 — правка на клиенте\n"
    "> переводится с `isOwner` на `capabilities.edit`, интерфейс предложений,\n"
    "> шаг `edit_subsection` и карточка происхождения `proposal`; Д-86 — где\n"
    "> показать «почему» у перегенерации по предложению. Сервер 17.1 — «По\n"
    "> факту 17.1» (три блока) и 03 §2.20.\n",
    "171/L4 07 — долги 17.1 в тексте 17.2",
    marker="> **Долги 17.1 с адресатом 17.2 (§12):**",
)

# ══ 171/M: 08 — Часть I и Часть II ═══════════════════════════════════════
patch(
    P08,
    "Беседа 16.3 (обсуждение и рецензии в документе — клиент; Фаза 16)\n"
    "ЗАКРЫТА 2026-11-09, **Фаза 16 закрыта**.",
    "Беседа 17.1 (предложения, права редактора, происхождение, ожидаемая\n"
    "версия — бэкенд; Фаза 17) ЗАКРЫТА 2026-11-15. Редактор правит на всех\n"
    "путях (`editCapability = owner || role === 'editor'`, проверка с участием\n"
    "— `canEditSynthesisOf`), `manage` — только владелец; платит и записан\n"
    "исполнителем тот, кто нажал (`services/actor-context.ts`, `actor_user_id`\n"
    "в `element_versions` и `generation_log`, миграция 0019\n"
    "`proposals_actor`); имена исполнителей — участникам, стоимость чужой\n"
    "строки — владельцу и исполнителю; ожидаемая версия на правке элемента,\n"
    "подраздела, капсулы и при создании плана → 409 `VERSION_CONFLICT`;\n"
    "предложения (`proposals`, `proposal_events`, 03 §2.20) — принятие даёт\n"
    "черновик плана, `accepted` пишет исполнитель плана, устаревшее не\n"
    "принимается и машиной не отклоняется, «новое поверх текущего» — человеком;\n"
    "шаг плана `edit_subsection`. Д-83…Д-85 заведены и закрыты той же беседой.\n"
    "38 ключей (утверждены), сторож 2be/4bp/5ay, smoke-171 59 ✓,\n"
    "test-171-requests2-5 50 ✓ ×3 (живой сервер под `BILLING_ENFORCE=true`, мок\n"
    "Claude); регресс 16.1–16.3 под новое правило; сверка после сжатия\n"
    "контекста нашла и закрыла два расхождения; доки — patch-docs-conv171.py\n"
    "(три части); долги 17.2 — Д-81, Д-82, Д-86; ближайшая — 17.2.\n"
    "Беседа 16.3 (обсуждение и рецензии в документе — клиент; Фаза 16)\n"
    "ЗАКРЫТА 2026-11-09, **Фаза 16 закрыта**.",
    "171/M1 08 Часть I — 17.1",
    marker="Беседа 17.1 (предложения, права редактора, происхождение, ожидаемая\nверсия — бэкенд; Фаза 17) ЗАКРЫТА 2026-11-15.",
)
patch(
    P08,
    "### Беседа 16.3 — Обсуждение и рецензии в документе (клиент) [ЗАКРЫТА 2026-11-09; Фаза 16 закрыта]\n",
    "### Беседа 17.1 — Предложения, права редактора, происхождение, ожидаемая версия (бэкенд) [ЗАКРЫТА 2026-11-15]\n"
    "\n"
    "**Вход:** HEAD 68c8784 (16.3 закрыта), `check:dotfiles` чист, `npm install`\n"
    "в самом клоне; песочница без БД — роль/база, `db:migrate` 0000…0018,\n"
    "четыре сида. Первая беседа Фазы 17 по врезке и решениям пользователя:\n"
    "участники только приглашённые; обсуждение документ не меняет; квоту и\n"
    "BYO-ключ расходует тот, кто нажал; предложение принимается только через\n"
    "черновик плана, предпросмотр и подтверждение — второго исполнителя нет,\n"
    "модель замечание как разрешение не толкует; устаревшее принять нельзя,\n"
    "отклоняет только человек; `formatVersion` не трогать, исполнитель и\n"
    "источник — признаки версии; ожидаемая версия вместо «последний\n"
    "перезаписал»; недостающее — строкой §12 с адресатом. Все запросы беседы\n"
    "(первый, тестовые, завершение) — в один день, тремя заходами.\n"
    "\n"
    "**Ход.** П.0: плательщик уже был исполнителем (в `resolveBilling` везде\n"
    "шёл `user.id`), мешал гейт; «17.1 меняет только `editCapability`» (16.1)\n"
    "неверно — одиннадцать мест звали `canEditSynthesis` без участия (заведена\n"
    "`canEditSynthesisOf`); шага ручной правки подраздела у планов не было\n"
    "(`edit_subsection`); пауза и журнал отдавались только владельцу. Права:\n"
    "одна функция правила, `manage` — владельцу; план принадлежит автору\n"
    "(владельцу открыт на чтение и удаление), автор обязан иметь право правки\n"
    "сейчас; пауза редактору без `genParams`. Исполнитель — AsyncLocalStorage\n"
    "(`runWithActor` в auth-middleware, двух точках WS и слоте генерации):\n"
    "`createVersion` и 18 вставок `generation_log` пишут его без смены\n"
    "сигнатур. Журнал и версии по смотрящему (`log-audience.ts`): «Запустил:\n"
    "X» у строк не-владельца участникам, стоимость чужой строки — владельцу и\n"
    "исполнителю, выгрузка без имён. Ожидаемая версия (`expected-version.ts`):\n"
    "номер версии элемента под `pg_advisory_xact_lock`, хэш содержимого\n"
    "подраздела и капсулы (тот же, что у адреса 16.1), `expected[]` плана.\n"
    "Предложения: `proposals.ts` (создать, принять = `createPlan` с\n"
    "`trustProposalRefs`, отклонить, закрыть, снять, «новое поверх текущего»),\n"
    "`proposal-links.ts` (события, заслон исполнителя `proposalStepBlockers`,\n"
    "единственное место `accepted` — `settleProposalStep`, закрытие при\n"
    "исключении участника); основа элемента — номер версии, раздела и\n"
    "подраздела — хэш (`baseIsCurrent`). Миграция 0019 (drizzle-kit, тег\n"
    "переименован; только добавления). Сторож 2be/4bp/5ay; перевёрнуты 2bb,\n"
    "4bm, 5aw, 4bn, ослаблены альтернацией двенадцать прежних. Клиент — только\n"
    "исчерпывающие подписи и два кода ошибок.\n"
    "\n"
    "**Тестовые запросы** (один заход): «402» текста — оговорка (отказ\n"
    "биллинга с 6.1 — 403 с кодом); правила роста номера документа выписаны\n"
    "(раздел — без изменений, подраздел — `sub + 1`, план — `base + 1`).\n"
    "Сверка после сжатия контекста по врезке «Фаза 17» нашла два расхождения\n"
    "первого запроса — основа элемента сверялась хэшем, а не номером версии;\n"
    "`origin` не нёс рецензию замечания — оба исправлены. Закрыты Д-83\n"
    "(`editRightFirst`: право правки до биллинга на десяти платных маршрутах),\n"
    "Д-84 (владелец останавливает чужой запуск, читает и удаляет чужой\n"
    "черновик плана), Д-85 (выгрузка: без имён, стоимость по выгружающему).\n"
    "Прогоном найдены: предложения в черновиках пониженного редактора,\n"
    "`plan_step_done` у снятого шага, открытые предложения удалённого аккаунта.\n"
    "\n"
    "**Тесты.** smoke-171 59 ✓ (чистые функции; живьём через `app.request`:\n"
    "права, четыре пути ожидаемой версии, исполнитель, пауза редактору,\n"
    "предложения от создания до исключения участника); test-171-requests2-5\n"
    "50 ✓ ×3 (живой сервер под `BILLING_ENFORCE=true` + мок Claude: квота\n"
    "редактора, отказ биллинга ему, 403 рецензенту на 30 путях, manage;\n"
    "журнал и выгрузка; одновременные правки; предложения). Регресс под новое\n"
    "правило: smoke-161 58 ✓, test-161 61 ✓, smoke-162 49 ✓, smoke-163 32 ✓,\n"
    "test-162-requests2-4 72 ✓ и test-163-requests2-3 49 ✓ (браузер, Chrome 131\n"
    "из `chrome/`, сборка клиента). Уроки — 09 §2 (сжатие контекста после\n"
    "кода), §3 (`git mv -k` и журнал миграций), §4 (правило сменилось —\n"
    "прежние харнессы красные по делу; проверка без ожидания; слово маркера\n"
    "в тексте документа), §7 (правило в одной функции против вызовов мимо\n"
    "загрузки участия; исполнитель контекстом запроса).\n"
    "\n"
    "**Завершение.** Регрессия на свежем клоне зелёная; TODO и заглушек нет;\n"
    "долги 17.2 — Д-81, Д-82, Д-86; доки — `patch-docs-conv171.py` (три\n"
    "части); один коммит. Ближайшая — 17.2.\n"
    "\n"
    "### Беседа 16.3 — Обсуждение и рецензии в документе (клиент) [ЗАКРЫТА 2026-11-09; Фаза 16 закрыта]\n",
    "171/M2 08 Часть II — глава 17.1",
    marker="### Беседа 17.1 — Предложения, права редактора, происхождение, ожидаемая версия (бэкенд)",
)

# ══ 171/N: 09 — уроки ════════════════════════════════════════════════════
patch(
    P09,
    "\n## 3. PostgreSQL, Drizzle, данные\n",
    "\n### Беседа 17.1 — сжатие контекста ПОСЛЕ кода: сверка нашла расхождения\n"
    "\n"
    "1. **Сводка сжатого контекста помнит решения, но не формулировки\n"
    "   первоисточника.** В 17.1 сжатие случилось посреди первого запроса;\n"
    "   работа была доделана по сводке и прошла все проверки. Перечитка текста\n"
    "   запроса и врезки фазы ПОСЛЕ кода нашла два расхождения, которых не\n"
    "   ловил ни один тест: основа предложения у элемента — номер версии (а\n"
    "   сверялся хэш), и `origin` обязан нести рецензию замечания. Правило:\n"
    "   после сжатия — перечитать текст запроса, врезку фазы и «чего не\n"
    "   делать» и сверить по пунктам ДО отчёта, даже если всё зелёное; тесты,\n"
    "   написанные по той же сводке, расхождение с первоисточником не увидят.\n"
    "2. **Доки беседы до коммита — одним прогоном патча от HEAD.** Пока ничего\n"
    "   не закоммичено, правка уже применённого блока делается так: `git\n"
    "   checkout docs deploy NEXT-CONTEXT.md README.md`, правка текста в\n"
    "   скрипте, прогон заново (и три прогона на чистой копии). Править разом\n"
    "   скрипт и применённый документ — источник рассогласований.\n"
    "\n## 3. PostgreSQL, Drizzle, данные\n",
    "171/N1 09 §2 — сжатие контекста после кода",
    marker="### Беседа 17.1 — сжатие контекста ПОСЛЕ кода: сверка нашла расхождения",
)
patch(
    P09,
    "\n## 4. Тесты, харнессы, браузер\n",
    "\n### Беседа 17.1 — переименование миграции и журнал\n"
    "\n"
    "1. **`git mv -k` на НЕотслеживаемом файле молча ничего не делает** (код\n"
    "   возврата 0). Свежую миграцию drizzle-kit переименовывать обычным `mv`,\n"
    "   затем тег в `meta/_journal.json`; иначе журнал уже указывает на новое\n"
    "   имя, файла с ним нет, и `db:migrate` падает на чтении.\n"
    "2. **Колонка `text({ enum })` без CHECK миграции не требует**: новое\n"
    "   значение `change_source` — только в схеме и shared-типе (`audit`\n"
    "   сверяет их); `drizzle-kit generate` после правки обязан ответить «No\n"
    "   schema changes».\n"
    "\n## 4. Тесты, харнессы, браузер\n",
    "171/N2 09 §3 — миграция",
    marker="### Беседа 17.1 — переименование миграции и журнал",
)
patch(
    P09,
    "\n## 5. Node, TypeScript, сборка\n",
    "\n### Беседа 17.1 — смена правила, гонки проверок, слово маркера в документе\n"
    "\n"
    "1. **Беседа, меняющая правило, красит прежние харнессы ПО ДЕЛУ** — их\n"
    "   утверждения («редактор edit=false», «PATCH редактора → 403», счёт\n"
    "   миграций `=== 19`) правятся в той же беседе, а не оставляются\n"
    "   «устаревшими»; счётчики писать `>=`, а не `===`.\n"
    "2. **Проверка интерфейса сразу за `waitSel` панели — гонка**: панель уже\n"
    "   в DOM, ответ ещё не пришёл (`members-empty` в test-162). Ждать сам\n"
    "   проверяемый элемент. Так же — чтение БД сразу за перегенерацией\n"
    "   (test-163 «категория пересоздана» упал один раз из трёх).\n"
    "3. **Искомое слово может стоять в тексте документа.** «скрыта» из строки\n"
    "   журнала нашлось в прозе выгруженной концепции — проверять полную\n"
    "   фразу («Стоимость: скрыта»), а имена — с подписью («Запустил: »).\n"
    "4. **Отказ биллинга — 403 с кодом, не 402** (контракт 6.1): харнесс под\n"
    "   `BILLING_ENFORCE=true` проверяет `code` и чьи цифры в `details`.\n"
    "   Подписка в тесте — строкой `subscription_plans` + `user_subscriptions`\n"
    "   (образец test-123), уборка — и планов тоже.\n"
    "5. **Одновременность проверяется `Promise.all` запросов с одним\n"
    "   ожиданием** — ровно один 200, остальные 409, записана одна версия;\n"
    "   последовательные запросы гонку блокировки не показывают.\n"
    "\n## 5. Node, TypeScript, сборка\n",
    "171/N3 09 §4 — харнессы",
    marker="### Беседа 17.1 — смена правила, гонки проверок, слово маркера в документе",
)
patch(
    P09,
    "\n## 8. Прочее\n",
    "\n### Беседа 17.1 — правило в одной функции и вызовы мимо неё\n"
    "\n"
    "1. **«Правило живёт в одной функции» не значит «достаточно поменять\n"
    "   функцию».** `editCapability` была одна, но одиннадцать мест звали\n"
    "   проверку без загрузки участия — правило туда не доходило. Перед\n"
    "   сменой правила — grep ВСЕХ входов в модуль (и синхронных обёрток), а\n"
    "   сторожу — запрет обходного входа, а не только форма правила.\n"
    "2. **«Кто это сделал» — контекст запроса, а не довод функций.**\n"
    "   AsyncLocalStorage (`actor-context.ts`): ставится в middleware, в\n"
    "   точках WS и в слоте генерации; писатели читают его сами. Фоновая\n"
    "   работа (`void executePlan(...)`) контекст наследует, но слот ставит\n"
    "   его явно — на случай запуска не из запроса.\n"
    "3. **Предпроверка оплаты стоит ПОСЛЕ проверки права**, иначе чужой\n"
    "   получает «пополните баланс» вместо 403 — и узнаёт, что путь есть.\n"
    "4. **Принятие чужого предложения исполняет только общий исполнитель**:\n"
    "   служба предложений не импортирует ни одной функции правки, статус\n"
    "   `accepted` пишется в одном месте, ссылки на предложения из тела\n"
    "   запроса отбрасываются (доверие — флагом вызывающей службы), а заслон\n"
    "   «устарело» стоит и в принятии, и перед шагом исполнителя — план мог\n"
    "   пролежать черновиком.\n"
    "\n## 8. Прочее\n",
    "171/N4 09 §7 — права и исполнитель",
    marker="### Беседа 17.1 — правило в одной функции и вызовы мимо неё",
)

# ══ 171/O: README — строка Фазы 17 ═══════════════════════════════════════
patch(
    README,
    "ожидаемая версия; снимает Огр-5; после Фазы 16 |",
    "ожидаемая версия; снимает Огр-5; после Фазы 16; 17.1 (сервер: редактор правит, платит и записан исполнителем тот, кто нажал, 409 `VERSION_CONFLICT`, предложения только через план правок, миграция 0019) — закрыта 11-15; ближайшая — 17.2 (клиент) |",
    "171/O1 README — строка Фазы 17",
)

# ══ 171/P: NEXT-CONTEXT — состояние и комплект 17.2 ══════════════════════
patch(
    NEXT,
    "## Состояние на 2026-11-09 (16.3 ЗАКРЫТА 2026-11-09; ФАЗА 16 ЗАКРЫТА; ближайшая — 17.1)\n",
    "## Состояние на 2026-11-15 (17.1 ЗАКРЫТА 2026-11-15; Фаза 17 открыта; ближайшая — 17.2)\n"
    "\n"
    "**17.1 (предложения, права редактора, происхождение, ожидаемая версия —\n"
    "бэкенд) ЗАКРЫТА 2026-11-15.** В реестре §12 — Д-81, Д-82, Д-86, все с\n"
    "адресатом 17.2 (вписаны в её текст); ограничений не добавлено.\n"
    "Инварианты с 17.1: право правки — `capabilities.edit` = владелец |\n"
    "ДЕЙСТВУЮЩИЙ редактор (`editCapability` в `services/capabilities.ts`;\n"
    "проверка с участием — `canEditSynthesisOf` либо `editGate`; двухдоводный\n"
    "`canEditSynthesis` вне модуля запрещён сторожем 4bp — запись 16.1 «17.1\n"
    "меняет только `editCapability`» была неверна); `manage` — только\n"
    "владелец. Платит и записан исполнителем тот, кто нажал: слот на\n"
    "`user.id`, исполнитель — контекст запроса (`services/actor-context.ts`:\n"
    "`runWithActor` в auth-middleware, двух точках WS и слоте;\n"
    "`createVersion` и каждая вставка `generation_log` с `...genLogActor()`),\n"
    "колонки `actor_user_id` (NULL = владелец). Отказ биллинга — 403 с кодом\n"
    "(не 402), право правки проверяется ДО биллинга (`editRightFirst`). Имена\n"
    "исполнителей и стоимость чужих строк — по смотрящему\n"
    "(`services/log-audience.ts`: имена — участникам и только у строк\n"
    "не-владельца; стоимость — владельцу и исполнителю; выгрузка без имён).\n"
    "Ожидаемая версия (`services/expected-version.ts`): `expectedVersion` у\n"
    "элемента, `expectedHash` у подраздела и капсулы (хэш ≡ адресу 16.1;\n"
    "исходник подраздела отдаёт `hash`), `expected[]` у плана → 409\n"
    "`VERSION_CONFLICT` с текущим значением; без ожидания — как прежде\n"
    "(клиент 17.2 шлёт всегда — Д-81). Предложения (`services/proposals.ts`,\n"
    "`proposal-links.ts`; 02 §2.40–2.41, 03 §2.20): принятие = ЧЕРНОВИК плана\n"
    "(`createPlan` с `trustProposalRefs`), `accepted` — только\n"
    "`settleProposalStep` исполнителя плана; основа элемента — НОМЕР ВЕРСИИ,\n"
    "раздела и подраздела — хэш (`baseIsCurrent`); устаревшее не принимают ни\n"
    "служба (409 `PROPOSAL_STALE`), ни исполнитель (шаг снят, `skipReason`),\n"
    "машина не отклоняет; «новое поверх текущего» — действием автора;\n"
    "исключение, понижение и удаление аккаунта участника закрывают либо\n"
    "освобождают его предложения. План принадлежит автору (владельцу открыт\n"
    "на чтение и удаление); шаг `edit_subsection` бесплатный. Номер документа:\n"
    "раздел — без изменений, подраздел — `sub + 1`, план с перегенерацией —\n"
    "`base + 1`; исполнитель на номер не влияет. Пауза редактору — без\n"
    "`genParams`. **Сторож 2be/4bp/5ay ЗАНЯТ (следующая серия — 2bf/4bq/5az);\n"
    "миграция 0019 ЗАНЯТА (следующая — 0020)**; 38 ключей утверждены;\n"
    "smoke-171 59 ✓, test-171-requests2-5 50 ✓ ×3 (живой сервер под\n"
    "`BILLING_ENFORCE=true`, мок Claude); прежние харнессы 16.x приведены к\n"
    "новому правилу (smoke-161, test-161, smoke-162, test-162). Клиент 17.1 не\n"
    "менялся, кроме исчерпывающих подписей (`edit_subsection`, источник\n"
    "`proposal`) и двух кодов в `ApiErrorCode`: правка в интерфейсе всё ещё\n"
    "под `isOwner` (Д-82). Доки — `patch-docs-conv171.py` (три части).\n"
    "\n"
    "## Состояние на 2026-11-09 (16.3 ЗАКРЫТА 2026-11-09; ФАЗА 16 ЗАКРЫТА)\n",
    "171/P1 NEXT-CONTEXT — состояние: 17.1 закрыта",
    marker="## Состояние на 2026-11-15 (17.1 ЗАКРЫТА 2026-11-15; Фаза 17 открыта; ближайшая — 17.2)",
)
_nx = NEXT.read_text(encoding="utf-8")
_kit = next((ln for ln in _nx.split("\n") if ln.startswith("## Комплект ближайшей беседы — 17.1 (")), None)
if _kit is None and "## Комплект ближайшей беседы — 17.2 (" not in _nx:
    print("  FAIL  171/P2 NEXT-CONTEXT: заголовок комплекта 17.1 (якорь) не найден")
    failed += 1
else:
    patch(
        NEXT,
        (_kit or "") + "\n",
        "## Комплект ближайшей беседы — 17.2 (решение по предложению, соавторство в интерфейсе: клиент)\n"
        "\n"
        "Сверх универсального минимума (по тексту 17.2 в 07 «Фаза 17»): врезки\n"
        "«Фаза 16» и «Фаза 17» целиком; «По факту» 2.3, 5.2, 9.2, 10.3, 13.1,\n"
        "16.3, 17.1 (три блока: первый запрос, тестовые запросы, завершение);\n"
        "`03` (§2 — правило «право правки» 17.1, §2.3–2.4 и §2.6 — ожидаемая\n"
        "версия, §2.12 — исполнитель и стоимость, §2.20 — предложения, §4.3 —\n"
        "`VERSION_CONFLICT`, `PROPOSAL_STALE`), `01` §8, `05`; строки §12 Д-81,\n"
        "Д-82, Д-86. Сервер 17.1 как контракт (не править без нужды):\n"
        "`routes/proposals.ts`, `services/proposals.ts` (`acceptMethodsFor`,\n"
        "`planBodyFor` — какой способ у какого адресата), `services/\n"
        "expected-version.ts`, shared `utils/expected-version.ts`\n"
        "(`subsectionContentHash`, `sectionContentHash` — клиент считает хэш ими\n"
        "же), `types/proposals.ts`, `constants/proposals.ts`, `types/edit-plan.ts`\n"
        "(шаг `edit_subsection`, `StepProposalRef`, `skipReason`,\n"
        "`PlanExpectation`), `types/elements.ts` (`ProposalOrigin`, `ActorRef`),\n"
        "`types/generation.ts` (`actor`, `costHidden`). Клиент: `pages/\n"
        "SynthesisPage.tsx` (гейты `isOwner` → `capabilities.edit`; `canDiscuss` /\n"
        "`canManage` уже есть), `components/edit/*` (редакторы, `EditModal`,\n"
        "`EditPlanPanel` — подпись `edit_subsection` заведена, карточки шага нет,\n"
        "`VersionHistory` — подпись источника `proposal` заведена, карточки\n"
        "происхождения нет, `RecommendationsPanel`), `components/document/\n"
        "SectionView.tsx` (правка подраздела 13.1 — сюда `expectedHash`),\n"
        "`components/discussion/*` (панель адреса — место кнопки «Предложить» и\n"
        "списка предложений по адресу), `components/logs/*` (`actor`,\n"
        "`costHidden`), `components/synthesis/PauseModal.tsx` (редактор получает\n"
        "паузу без `genParams`), `api/client.ts` (коды заведены), `utils/\n"
        "notification-text.ts` (`proposal_created` / `proposal_decided`, payload\n"
        "`decision`, `kind`, `rebasedFrom`). Харнессы-образцы: `tests/\n"
        "test-171-requests2-5.mjs` (сервер под `BILLING_ENFORCE=true` + мок),\n"
        "`tests/test-163-requests2-3.mjs` (мок + браузер), `tests/\n"
        "test-124-requests2-8.mjs` (Chrome 131 на сборке). Исходник не нужен;\n"
        "дизайн-набор — `5-6-ui-kit.*` (панель решения, разница версий). Серия\n"
        "сторожей — 2bf/4bq/5az, миграция (если понадобится) — 0020.\n"
        "\n"
        "## Беседа 17.1 (ЗАКРЫТА 2026-11-15) — что было комплектом\n",
        "171/P2 NEXT-CONTEXT — комплект 17.2",
        marker="## Комплект ближайшей беседы — 17.2 (решение по предложению, соавторство в интерфейсе: клиент)",
    )

print(f"\nИтого: applied={applied}, skip={skipped}, fail={failed}")
sys.exit(1 if failed else 0)
