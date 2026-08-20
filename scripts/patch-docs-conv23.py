#!/usr/bin/env python3
"""Правки документации по итогам беседы 2.3 (Edit Modal + Cascade Panel).

Идемпотентный apply/skip-скрипт (образец conv22/conv24):
 - patch(): замена old → new; повторный прогон видит marker → skip;
 - optional=True — переходник промежуточных состояний.

Закрываемые дыры (собраны в беседе, одобрены пользователем):
 1. Live-каскад без транспорта → POST /syntheses/:id/plans/impact (03 §2.6).
 2. SubsectionRegenPanel без данных → POST /syntheses/:id/subsection-impact
    (03 §2.5).
 3. Долг §12 «внутрисекционный каскад по affectedSubs» неисполним буквально
    (роут отвечает { ok:true } фоном) → переформулирован на превью; закрыт.
 4. extGraphMetrics некуда писать → PATCH /syntheses/:id (03 §2.2).
 5. Карточки режимов в модалке → TODO(4.1) (нет routes/modes и данных).
 6. Гейты openEditModal (API_KEY / DOC_STATE.incomplete) → 6.1/4.3.
 7. Стоимость футера — серверная оценка (превью) вместо клиентской.
 Плюс мелочь тестов: фактический downstream graph = glossary+theses+dialogue
 (07 называл только theses, dialogue); индикатор isEdited — «⟳ », не
 «✓ изменён»; статус готового синтеза — "ready".

Запуск из корня репо: python3 scripts/patch-docs-conv23.py
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
        failed.append(f"{name}: якорь встречается {s.count(old)} раз в {rel}")
        return
    write(rel, s.replace(old, new))
    applied.append(name)


D03 = "docs/03-specification.md"
D04 = "docs/04-code-reuse-map.md"
D05 = "docs/05-file-structure.md"
D07 = "docs/07-conversation-protocol.md"

# ══ 03 §2.2: PATCH /syntheses/:id += extGraphMetrics (дыра 4) ══════════

patch(
    "03/A: PATCH syntheses += extGraphMetrics",
    D03,
    """PATCH  /syntheses/:id          { title?, isPublic? }
                                → { synthesis: SynthesisFull }
                                // Только владелец. Единственный способ
                                // опубликовать синтез — без него вкладка
                                // «Публичные» недостижима из UI.""",
    """PATCH  /syntheses/:id          { title?, isPublic?, extGraphMetrics? }
                                → { synthesis: SynthesisFull }
                                // Только владелец. Единственный способ
                                // опубликовать синтез — без него вкладка
                                // «Публичные» недостижима из UI.
                                // extGraphMetrics добавлен беседой 2.3 —
                                // транспорт чекбокса «Расширенные
                                // характеристики» на карточке graph в
                                // EditModal (исходник писал
                                // DOC_STATE.params напрямую [18475]).""",
    marker="{ title?, isPublic?, extGraphMetrics? }",
)

# ══ 03 §2.6: POST /plans/impact (дыра 1 + 7) ═══════════════════════════

patch(
    "03/B: POST /syntheses/:id/plans/impact",
    D03,
    """### 2.6. Edit Plans

```
POST   /syntheses/:id/plans    {""",
    """### 2.6. Edit Plans

```
POST   /syntheses/:id/plans/impact
                                { regen: string[], remove: string[],
                                  add: string[], modeRegen?: [string, number][] }
                                → { impact: CascadeImpactDto, estimatedCost }
                                // Беседа 2.3: read-only превью каскада для
                                // живой CascadePanel (прецеденты класса —
                                // /syntheses/advice 1.5, /:key/context 1.6).
                                // impact — серверный analyzeImpact (до этого
                                // роута CascadeImpact не был доступен клиенту
                                // вообще); estimatedCost — паритет футера
                                // updateEditPlanUI [19085]: только выбранные
                                // действия (delete = 0), fail-open 0. Только
                                // владелец; НИЧЕГО не персистит (решение
                                // беседы: превью надёжнее черновик-плана на
                                // каждый клик — без мусора в edit_plans).

POST   /syntheses/:id/plans    {""",
    marker="POST   /syntheses/:id/plans/impact",
)

# ══ 03 §2.5: POST /subsection-impact (дыры 2–3) ════════════════════════

patch(
    "03/C: POST /syntheses/:id/subsection-impact",
    D03,
    """POST   /syntheses/:id/regenerate-subsection
                                { sectionKey: string, subsectionName: string,
                                  userNote?: string, includeCurrentContent?: boolean }
                                → { ok: true }
                                // Стриминг через WebSocket""",
    """POST   /syntheses/:id/subsection-impact
                                { sectionKey: string, subsectionName: string }
                                → { intraDependents, crossDependents,
                                    affectedModes, estimate|null }
                                // Беседа 2.3: read-only превью подраздельной
                                // перегенерации для SubsectionRegenPanel —
                                // порт расчётной части showSubsectionRegenUI
                                // [18686] (intra → cross по всем изменяемым с
                                // dedup и фильтрами присутствия → режимы →
                                // estimateSubsectionCost fail-open null).
                                // Только владелец; БЕЗ гейта активной
                                // генерации. Закрывает транспорт долга
                                // «внутрисекционный каскад»: зависимые
                                // вычислимы по картам ДО перегенерации, а
                                // /regenerate-subsection отвечает { ok:true }
                                // фоном и вернуть affectedSubs не может.

POST   /syntheses/:id/regenerate-subsection
                                { sectionKey: string, subsectionName: string,
                                  userNote?: string, includeCurrentContent?: boolean }
                                → { ok: true }
                                // Стриминг через WebSocket""",
    marker="POST   /syntheses/:id/subsection-impact",
)

# ══ 05: состав client/components/edit + api/plans + hooks ══════════════

patch(
    "05/A: ФАКТ-пометка беседы 2.3 в дереве edit/",
    D05,
    """│   │   │   ├── edit/
│   │   │   │   ├── EditModal.tsx           # Модальное окно редактирования""",
    """│   │   │   ├── edit/                       # Шесть верхних файлов — беседа 2.3 (ФАКТ):
│   │   │   │                               # плюс client/api/plans.ts и
│   │   │   │                               # client/hooks/useEditPlan.ts (zustand-store
│   │   │   │                               # внутри хука); CSS .edit-*/.cascade-* —
│   │   │   │                               # в globals.css; ElementEditor и ниже — 3.x
│   │   │   │   ├── EditModal.tsx           # Модальное окно редактирования""",
    marker="Шесть верхних файлов — беседа 2.3 (ФАКТ)",
)

# ══ 07: беседа 2.3 — транспортная врезка и формулировки ════════════════

patch(
    "07/A: врезка «Транспорт готов» дополнена превью-эндпоинтами",
    D07,
    "> **Транспорт готов** (аудит 2026-07-30): `server/routes/plans.ts`",
    """> **ФАКТ 2.3 (2026-08-20)**: врезка ниже оказалась неполной — live-каскаду
> и панели подраздела транспорта НЕ хватало (CascadeImpact и
> getIntraDependents/getCrossSecDependents/estimateSubsectionCost не были
> доступны клиенту), а extGraphMetrics было некуда писать. Беседа 2.3
> добавила read-only превью POST /plans/impact и POST /subsection-impact
> (03 §2.6/§2.5) и расширила PATCH /syntheses/:id полем extGraphMetrics —
> из вилки «черновик-план на каждый клик vs превью» выбрано превью
> (надёжнее: без мусора в edit_plans и гонок). Карточки результатов
> режимов в модалке опущены до 4.1 (нет routes/modes и данных); гейты
> openEditModal (API_KEY / DOC_STATE.incomplete) — до 6.1/4.3.
>
> **Транспорт готов** (аудит 2026-07-30): `server/routes/plans.ts`""",
    marker="ФАКТ 2.3 (2026-08-20)",
)

patch(
    "07/B: индикатор isEdited — «⟳ », не «✓ изменён»",
    D07,
    '   - Индикатор: "✓ изменён" если раздел был отредактирован',
    '   - Индикатор изменённости: ФАКТ — префикс «⟳ » в заголовке карточки\n'
    '     (renderEditSections [18521]: `${isEdited ? "⟳ " : ""}`; формулировка\n'
    '     «✓ изменён» была приблизительной)',
)

patch(
    "07/C: фактический downstream graph в тесте потока",
    D07,
    "«Протестируй поток: открыть EditModal → отметить graph для перегенерации → CascadePanel должен показать downstream (theses, dialogue)",
    "«Протестируй поток: открыть EditModal → отметить graph для перегенерации → CascadePanel должен показать downstream (ФАКТ по конфигам: glossary, theses, dialogue)",
)

patch(
    "07/D: двухшаговый workflow вместо «нажать ▶»",
    D07,
    "- «Протестируй исполнение: нажать ▶ → EditPlanPanel показывает прогресс шагов → по завершении все шаги ✓»",
    "- «Протестируй исполнение: «▶ Составить план» (draft, шаги ●) → «▶ Исполнить» → EditPlanPanel показывает прогресс шагов → по завершении все шаги ✓» — ФАКТ 2.3: двухшаговый workflow 01 §4.5 вместо цепочки confirm() исходника (одобрено)",
)

# ══ 07 §12: закрытие долгов 2.3 ════════════════════════════════════════

patch(
    "07/E: долг affectedSubs переформулирован и закрыт",
    D07,
    "| Внутрисекционный каскад по `affectedSubs` (regenerateSubsection возвращает зависимые подразделы; предложение/исполнение — UI) | 2.3 | 2.2 | внесён 2026-08-09 |",
    "| Внутрисекционный каскад по `affectedSubs` (regenerateSubsection возвращает зависимые подразделы; предложение/исполнение — UI) | 2.3 | 2.2 | ЗАКРЫТ 2.3 (2026-08-20) с переформулировкой: буквально неисполним — роут отвечает { ok:true } фоном; зависимые вычислимы по картам ДО перегенерации → превью POST /subsection-impact + чекбоксы волны и очередь последовательных запусков по section_done в SubsectionRegenPanel |",
)

patch(
    "07/F: долг бейджа качества закрыт",
    D07,
    "| Бейдж качества контекста (`contextQualityScore`) | 2.3 | 1.3 | серверная половина закрыта 2.4 (2026-08-17): score живой в GET /sections; осталась UI-половина (EditSectionCard) |",
    "| Бейдж качества контекста (`contextQualityScore`) | 2.3 | 1.3 | ЗАКРЫТ 2.3 (2026-08-20): бейдж на EditSectionCard, пороги исходника ≥90/≥60 [18497], null → бейдж не рисуется |",
)

patch(
    "07/G: долг makeSectionCtxDisclosure закрыт",
    D07,
    "| `makeSectionCtxDisclosure` — disclosure секционного контекста в документе (sec_context отдаётся в SectionFull, UI не показывает) | 2.3 | 1.6b | внесён 2026-08-03 |",
    "| `makeSectionCtxDisclosure` — disclosure секционного контекста в документе (sec_context отдаётся в SectionFull, UI не показывает) | 2.3 | 1.6b | ЗАКРЫТ 2.3 (2026-08-20): details.sec-disclosure в SectionView при непустом secContext |",
)

# ══ 04: ФАКТ-пометки к строкам карты ═══════════════════════════════════

patch(
    "04/A: updateLiveCascade — транспорт результата",
    D04,
    "| `updateLiveCascade()` | Каскадный анализ → серверный, результат → через API | `server/services/cascade-analyzer.ts` |",
    "| `updateLiveCascade()` | Каскадный анализ → серверный, результат → через API — ФАКТ (2.3): транспорт = read-only POST /plans/impact (03 §2.6), отрисовка E1–E5 1:1 — `client/components/edit/CascadePanel.tsx`, запрос с debounce 400мс — EditModal | `server/services/cascade-analyzer.ts` + `client/components/edit/CascadePanel.tsx` |",
)

patch(
    "04/B: openEditModal/renderEditSections — ФАКТ",
    D04,
    "| `openEditModal()`, `renderEditSections()` | `client/components/EditModal.tsx` |",
    "| `openEditModal()`, `renderEditSections()` | `client/components/edit/EditModal.tsx` + `EditSectionCard.tsx`/`AddSectionPanel.tsx`/`EditPlanPanel.tsx` — ФАКТ (2.3): двухшаговый workflow §4.5 («Составить план» → просмотр → «Исполнить») вместо цепочки confirm(); карточка «Структура устарела» — сравнение structureSections↔sectionOrder на клиенте; гейты API_KEY/incomplete не переносятся (6.1/4.3); карточки результатов режимов — TODO(4.1) |",
)

patch(
    "04/C: UI подразделовой перегенерации — ФАКТ",
    D04,
    "| UI подразделовой перегенерации | `client/components/SubsectionRegenPanel.tsx` |",
    "| UI подразделовой перегенерации | `client/components/edit/SubsectionRegenPanel.tsx` — ФАКТ (2.3): зависимые/оценка — превью POST /subsection-impact; каскад = чекбоксы волны (intra+cross) + ОЧЕРЕДЬ последовательных запусков по section_done (stream_error останавливает); капсула-квирк «подраздел капсулы → весь раздел» сохранён; «третья волна» и каскад режимов не переносятся (повторного превью после волны нет; режимы — 4.1) |",
)

# ══ Итог ═══════════════════════════════════════════════════════════════

print("Применено:", len(applied))
for n in applied:
    print("  +", n)
print("Пропущено (уже применено/optional):", len(skipped))
for n in skipped:
    print("  =", n)
if failed:
    print("ПРОВАЛЕНО:", len(failed))
    for n in failed:
        print("  !", n)
    raise SystemExit(1)
