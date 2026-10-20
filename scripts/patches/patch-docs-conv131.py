#!/usr/bin/env python3
"""Патч документации по беседе 13.1 (безопасность входящего HTML и
полнотекстовая правка подраздела: Д-63, Д-64).
ЧАСТЬ I — ПЕРВЫЙ ЗАПРОС (2026-10-14):
  A  07 — блок «По факту 13.1 (первый запрос)» после текста беседы:
     опись входов HTML (п.0, с найденным сверх текста), выбор движка
     редактора (п.6), состав CSP, адаптация харнессов 9.2/10.3/12.4.
  B  03 §2.3 — санитайзер сужен до набора раздела «ФОРМАТИРОВАНИЕ»
     (b/i → strong/em, прочее — текст), общее ядро; §2.4 — PATCH капсулы
     чистит и отдаёт warnings; импорт — предупреждения поля sections.
  C  01 §5.4 — редактор 13.1 и санитайзер на всех входах; новый §6a
     «Заголовки безопасности» (CSP в трёх копиях); §8.2 — блок 13.1.
  D  02 — пометки у html_content / capsule_html / mode_results /
     element_versions / element_enrichments: что хранится ПОСЛЕ чистки.
  E  04 — строки: общий модуль разметки, ядро санитайзера, html-parser
     на ядре, клиентский редактор, security-headers, скрипт чистки.
  F  05 — дерево: doc-markup.ts, doc-markup-sanitize.ts,
     subsection-rich-editor.ts, security-headers.ts, scripts/maintenance/,
     smoke-131-request1, пометки у subsection-edit/html-parser/vite.config.
  G  09 — §4 (харнессы 9.2 под двумя видами формы; CAPSULE-фикстура),
     §6 (contenteditable: чистка под кареткой, defaultParagraphSeparator,
     nbsp; поле-зеркало).
  H  NEXT-CONTEXT — комплект 13.1: первый запрос исполнен, что осталось.
ЧАСТЬ II — ТЕСТОВЫЕ ЗАПРОСЫ 2–5 (2026-10-20):
  I  07 — «По факту 13.1 (тестовые запросы 2–5)»: харнесс test-131, два
     дефекта редактора, найденных им (Enter у края блока, <p><ul>), пробел
     в class у linkedom; черновики en/de утверждены.
  J  05 — test-131-requests2-8 в дереве tests; 09 §6 — уроки Enter/списков.
  K  NEXT-CONTEXT — тестовые запросы исполнены; осталось завершение.
ЧАСТЬ III — ЗАВЕРШЕНИЕ (2026-10-20): L 07 «По факту 13.1 (завершение)»,
§11 узел, §12 — строки Д-63/Д-64 сняты, преамбула; M 08 Часть I строка,
Часть II глава, Часть IV две строки; N README таблица фаз; O NEXT-CONTEXT
— состояние, ближайшая 13.2, «что 13.1 оставила знать», комплект 13.1
закрыт.
Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patches/patch-docs-conv131.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
applied = skipped = failed = 0


def patch(rel: str, old: str, new: str, label: str, marker: str | None = None) -> None:
    """marker — признак «уже применено», когда позднейший патч (часть II)
    меняет текст внутри new и сам new в файле больше не встречается."""
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


# ── A. 07 «По факту 13.1 (первый запрос)» ────────────────────────────────
PF131 = """
**По факту 13.1 (первый запрос — 2026-10-14).** Десять пунктов, порядок —
«сначала безопасность (1–5), затем редактор (6–10)»:

0. **Опись входов HTML** (grep по каждой названной функции, до правок).
   Пишут в `sections.html_content`: `upsertSection` (generation-service —
   успех прохода и частичный html при обрыве потока, `regenerateSection`,
   `addSection`), `spliceSubsectionHtml` (`regenerateSubsection`),
   `renumberSectionRefs` (только текст §-ссылок), `writeSectionHtml`
   (representation-transformer — поток и откат снимка), `insertSubsectionAfter`
   (recommendations — через `replaceSubsectionContent`, уже с санитайзером
   9.2), `replaceDocTable` (element-renderer — ячейки `esc`), `updateSubsection`
   (санитайзер 9.2), `updateCapsule`, `autoRenameReferences`, откат
   `element-versioning`, импорт (`import-service`), `removeSubsectionHtml`
   (pause-resume — только убирает). В `syntheses.capsule_html`: побочный
   эффект `upsertSection` для capsule, `updateCapsule`, `autoRenameReferences`,
   импорт, откат. В `mode_results.html_content`: `runMode`,
   `regenerateModeSilent`, импорт. Снимки `element_versions` (section):
   `data.htmlContent` — пишутся ДО правки, читаются откатом. **Сверх текста
   беседы** найдены три входа: `element_enrichments.content` (ответ модели,
   `EnrichmentPanel` рисует через `dangerouslySetInnerHTML` любому читателю
   концепции), `autoRenameReferences` (новое имя элемента подставлялось в
   html_content без экранирования и через `$`-шаблон `replace`) и текстовые
   строки капсулы при импорте (`meta.capsuleText` → `<p>` без `esc`). Все
   три закрыты.
1. **Общий модуль** `packages/shared/constants/doc-markup.ts`:
   `CONTENT_TAGS`/`STRUCTURE_TAGS`/классы выносок, меток, структурных div,
   `TABLE_CLASS`, `TAG_REWRITES {b→strong, i→em}`, `DROPPED_TAGS`,
   `EDITOR_TOOLS` (13 кнопок), `parsePromptFormatting(systemBody)` — разбор
   строк «- <…>» между «ФОРМАТИРОВАНИЕ» и «ТРЕБОВАНИЯ К КАЧЕСТВУ»,
   `moduleMarkupSpec()`, `diffMarkupSpecs()`. Сторож 2at: разница пуста;
   текст промпта не менялся.
2. **Ядро санитайзера** `packages/shared/utils/doc-markup-sanitize.ts` —
   одно на сервер (linkedom) и клиент (DOMParser), интерфейс узла
   минимальный (`SanitizableElement`); режимы `subsection` (содержимое) и
   `section` (плюс обёртка раздела, `data-section`/`<h4>`, якоря оглавления
   12.2; комментарии снимаются — в html_content их не бывает, ссылки
   вложенных подразделов живут только в черновике правки). Сужение:
   `b/i → strong/em`; `sup/sub/blockquote/br/caption/tfoot/a` и всё вне
   набора — текст без тега (`<br>` → пробел, `<caption>` → `<p>` перед
   таблицей); `img/script/style/iframe/object/embed/form/…` — с содержимым;
   атрибуты — только `class` из набора, `colspan/rowspan`, в режиме section
   `data-section`/`id` якоря/`href` кнопки ⏫; таблице возвращается
   `doc-table`. `sanitizeWarningsRu(report)` — русские фразы по видам
   (перевод — Фаза 14). `server/utils/html-parser.ts` локальные списки
   снял, `sanitizeTree` 9.2 зовёт ядро, новая `sanitizeSectionHtml(html)
   → { html, warnings, changed }` (чистый вход — побайтно, `changed=false`;
   идемпотентна).
3. **Санитайзер на всех входах**: `cleanModelHtml(html, genEntryId)`
   (generation-service, экспорт) — чистит и дописывает предупреждения в
   `parseWarnings` генлога с префиксом «чистка разметки ответа модели: »;
   зовётся на успехе прохода, частичном html при обрыве, `regenerateSection`,
   `regenerateSubsection`, `addSection`, `runMode`, `regenerateModeSilent`,
   потоке трансформации. `sanitizeSectionHtml` напрямую: откат снимка
   трансформации, оба отката `element-versioning`, `updateCapsule` (ответ
   `+ warnings`), обогащение (предупреждения — в консоль: строки генлога у
   него нет), импорт (разделы — `warnings` ответа полем `sections` с ключом
   раздела, результаты режимов — полем `modes`). `autoRenameReferences` —
   `esc(n)` и функция-замена.
4. **Скрипт** `scripts/maintenance/sanitize-stored-html.ts` (`npm run
   sanitize:stored-html [-- --dry] [--synthesis <uuid>]`): пять таблиц из
   п.0 построчно, отчёт по видам предупреждений, повтор — 0 строк. Шаг
   после обновления — в обоих deploy-руководствах.
5. **CSP** `server/security-headers.ts`: `script-src 'self'
   https://js.stripe.com; object-src 'none'; base-uri 'none';
   frame-ancestors 'none'` (+ `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: same-origin`); js.stripe.com — Stripe.js вставляется
   `<script src>` в BillingPage; `default-src` не задан намеренно (шрифты
   Google, Stripe, API). Копии дословно: middleware на все ответы
   `server/index.ts`, `preview.headers` в `client/vite.config.ts` (сборка
   под харнессами; `vite dev` без CSP — react-refresh встроенный модуль),
   блок `header` Caddy в `deploy/philosynth-hosting.md`; сторож 4be сверяет
   три копии. Выгрузка — вложение (`Content-Disposition: attachment`), под
   CSP страницы не попадает; сборка клиента под CSP открывается без
   нарушений (смоук D).
6. **Движок редактора — собственный contenteditable** поверх общего ядра,
   не ProseMirror/TipTap. Доводы: набор конструкций закрыт и мал (13
   кнопок) — схема библиотеки повторила бы его вторым описанием; правка
   идёт НА МЕСТЕ подраздела в типографике документа внутри строки
   `dangerouslySetInnerHTML` (приём 1.6b/9.2) — библиотечному редактору
   нужны свой корень и портал; вставка проходит через то же ядро, что
   сервер; ноль зависимостей (TipTap с таблицами ~300 КБ); отмена — набор
   и `execCommand` (жирный, курсив, списки, formatBlock, insertHTML) в
   родном стеке Ctrl+Z, перестройки таблиц/выноски/метки — прямые правки
   DOM вне него (слабое место названо в шапке модуля). Модуль
   `client/src/utils/subsection-rich-editor.ts` (чистые функции над DOM:
   `fillEditable`, `readEditorHtml`, `applyTool`, `applyTableOp`,
   `sanitizePasted`/`insertPasted`, `isPlaceholderDeletion`, плашки ↔
   комментарии, `normalizeBlocks`, `prettyMarkup`). Форма 9.2 получила два
   вида (`SubsectionEditState.view`: `rich` по умолчанию / `markup`):
   панель из `EDITOR_TOOLS` + строки/столбцы + переключатель
   «Разметка/Текст»; `<textarea>` есть в обоих видах — в rich скрыта и
   ЗЕРКАЛИТ редактор после каждого ввода/кнопки/вставки, сохранение читает
   поле (черновик один, харнессы 9.2–12.x живы). Содержимое редактора
   кладётся в строку HTML при сборке (`fillEditable` в DOMParser-документе).
   Найдено пробой: чистка живого дерева после каждой кнопки (замена `<b>` →
   `<strong>` под кареткой) уводила набор в конец блока — живое дерево не
   чистится, следы `execCommand` снимает ядро при сборке на клоне; Chrome
   без `defaultParagraphSeparator` ставит `<div>`, набор после таблицы —
   голым текстом: `normalizeBlocks` укладывает строчные пробеги и `<div>`
   без класса в `<p>`, хвостовые `<br>` и nbsp-заглушки снимает.
7. **Вставка** — `onPaste` делегированием: буфер (`text/html`, иначе
   `text/plain` абзацами по пустой строке) через ядро в режиме subsection
   + `normalizeBlocks`, в место каретки через `insertHTML`; `drop` — так же.
   Смоук: `<meta><div style><b><i><img onerror><script><a javascript:>
   <sup><span class=MsoNormal>` → `<p><strong>…</strong> <em>…</em> текст</p>`,
   `document.title` не менялся.
8. **Таблицы**: ячейки правятся на месте; «+ строка» после текущей (после
   строки заголовков — первой в tbody), «− строка» (не заголовки, не
   последняя строка тела), «+ столбец» после текущего во всех строках,
   «− столбец» (не последний); каретка — в новую ячейку. Запертые таблицы —
   заслон сервера 9.2 не тронут (карандаша нет).
9. **Плашки** вложенных подразделов: `.rich-placeholder` с
   `contenteditable="false"`, видимым названием и подсказкой; Backspace/
   Delete у края соседнего блока, выделение, вырезание и перетаскивание
   через плашку гасятся; при сборке плашка возвращается комментарием
   дословно (`data-placeholder-src`); сервер по-прежнему отвергает
   пропавшую строку (второй рубеж). `<h4>` вне редактора.
10. **Сторож** `integration-check` 2at/4be/5ao: модуль ≡ промпт; кнопки ⊆
    CONTENT_TAGS без структурных заголовков; `sanitizeSectionHtml` чистит
    пробу и идемпотентна; санитайзер статически на каждом входе п.0
    (счётчики по файлам); `autoRenameReferences` с `esc`; CSP без
    unsafe-*, три копии равны, middleware в index.ts; панель клиента ⊆
    `EDITOR_TOOL_IDS`, `onPaste` через `sanitizePasted`, гашение у плашек,
    два вида формы; CSS 9.2 с переносом/шириной/высотой; скрипт обходит
    пять таблиц; живьём (5ao, до `closeDb`): `updateCapsule` и `importHTML`
    с `<img onerror>`/`javascript:` — в БД чисто, предупреждения на месте.
    Смоук `tests/smoke-131-request1.mjs` (55 ✓): ядро (A), живые входы и
    заголовки сервера/preview/трёх копий (B), скрипт `--dry`/запись/повтор
    (C), редактор в сборке под Chrome 131 (D: панель, зеркало, плашка,
    набор + Ж/К, вставка, строка/столбец, Backspace/Delete у плашки,
    «Разметка» ↔ «Текст» без потерь, Ctrl+Enter → БД).

Сверх пунктов: (а) харнессы 9.2/10.3/12.4 (`test-92`, `test-103`,
`test-124`) правят ПОЛЕ — после открытия формы переключаются в вид
«Разметка» (три строки в помощниках); `test-92` получил CDP
`acceptLanguage: ru` (с 11.3 открывался по-английски и падал на «✎
Изменить» ещё до 13.1) и допуск «без правил: 0» в C css-parity (gm-hint
покрыт 12.4); фикстура `CAPSULE` в `test-124` — обёртка doc-section
вместо `<div class="capsule">` (класса нет в наборе промпта, откат снимка
теперь чистит его; настоящая капсула — doc-section). Все три зелёные
(36/115/120 ✓). (б) `scripts/i18n/ui-strings-lib.mjs`: два новых модуля
shared в `skip` — их русские строки суть диагностика (предупреждения
чистки, расхождения сторожа), как у html-parser вне охвата; перевод —
Фаза 14 (Д-60). (в) Новые строки редактора — 50 ключей
`utils.richEditor.*` / `document.sectionView.*` с черновиками en/de;
`i18n:check --strict` зелёный. (г) CSS 9.2: поле разметки `width: 100%`,
`height: auto`, `white-space: pre-wrap`, `overflow-wrap: anywhere`; блок
«Беседа 13.1» (панель, кнопки `.rich-editor-btn` по образу
`.inline-edit-btn` кита, тело `.rich-editor-body` в типографике документа с
золотым фокусом, плашка пунктиром `--rule-strong` на `--off`); css-parity
A/B/C = 0. (д) `client/src/api/elements.ts`: `UpdateCapsuleResponse +=
warnings` (у правки текстом из шапки пусто — показа нет). Экспорты и
переводы прочего не тронуты.
"""

patch(
    "docs/07-conversation-protocol.md",
    "- «Протестируй на живом файле одностраничника: правка подраздела с таблицей и подраздела с выноской проходит без потерь разметки; запертые таблицы заперты»\n"
    "\n"
    "**Завершение беседы:**\n"
    "- «Скомпилируй проект (`npm run typecheck`, `vite build`) — покажи и исправь все type errors, не меняя логику»\n"
    "- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, css-parity»\n"
    "- «Ревью: перечисли оставшиеся TODO и заглушки»\n"
    "- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10); строка в README\n",
    "- «Протестируй на живом файле одностраничника: правка подраздела с таблицей и подраздела с выноской проходит без потерь разметки; запертые таблицы заперты»\n"
    "\n"
    "**Завершение беседы:**\n"
    "- «Скомпилируй проект (`npm run typecheck`, `vite build`) — покажи и исправь все type errors, не меняя логику»\n"
    "- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, css-parity»\n"
    "- «Ревью: перечисли оставшиеся TODO и заглушки»\n"
    "- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10); строка в README\n"
    + PF131,
    "A  07 «По факту 13.1 (первый запрос)»",
    marker="**По факту 13.1 (первый запрос — 2026-10-14).**",
)

# ── B. 03 §2.3 санитайзер сужен; §2.4 PATCH капсулы; §2.2 импорт ─────────
patch(
    "docs/03-specification.md",
    "                                // их стёрли бы). Сервер присланному не верит:\n"
    "                                // разбирает linkedom'ом и пропускает теги\n"
    "                                // системного промпта (p, ul/ol/li, strong/em,\n"
    "                                // h5, table…, div.callout, span.risk/.callout-\n"
    "                                // label, br + b/i/sup/sub/blockquote/caption/\n"
    "                                // tfoot); прочие теги снимаются с сохранением\n"
    "                                // текста, script/style/iframe/form… удаляются\n",
    "                                // их стёрли бы). Сервер присланному не верит:\n"
    "                                // разбирает linkedom'ом и пропускает теги\n"
    "                                // системного промпта (p, ul/ol/li, strong/em,\n"
    "                                // h5, table…, div.callout, span.risk/.callout-\n"
    "                                // label). 13.1 (Д-63): набор СУЖЕН до раздела\n"
    "                                // «ФОРМАТИРОВАНИЕ» промпта — общий модуль\n"
    "                                // shared/constants/doc-markup и ядро\n"
    "                                // shared/utils/doc-markup-sanitize (одно на\n"
    "                                // сервер и клиентский редактор): b/i →\n"
    "                                // strong/em; br/sup/sub/blockquote/caption/\n"
    "                                // tfoot/a — текст без тега (caption → <p>\n"
    "                                // перед таблицей); прочие теги снимаются с\n"
    "                                // сохранением текста, img/script/style/iframe/\n"
    "                                // form… удаляются\n",
    "B1 03 §2.3 санитайзер сужен",
)
patch(
    "docs/03-specification.md",
    "PATCH  /syntheses/:id/capsule   { html: string }\n"
    "                                → { capsuleHtml: string }\n",
    "PATCH  /syntheses/:id/capsule   { html: string }\n"
    "                                → { capsuleHtml: string, version,\n"
    "                                    warnings: string[] }\n"
    "                                // 13.1 (Д-63): присланное чистится тем же\n"
    "                                // ядром в режиме «раздел целиком» (обёртка\n"
    "                                // doc-section и <h4> допустимы); что снято —\n"
    "                                // warnings (русские фразы, как у правки\n"
    "                                // подраздела). Санитайзер стоит и на ВСЕХ\n"
    "                                // прочих входах разметки: ответы модели\n"
    "                                // (генерация, перегенерация, режимы,\n"
    "                                // трансформация, обогащение — предупреждения\n"
    "                                // в parseWarnings генлога с префиксом\n"
    "                                // «чистка разметки ответа модели: »), импорт\n"
    "                                // (warnings ответа полем sections/modes),\n"
    "                                // откат снимков версий; уже сохранённое —\n"
    "                                // npm run sanitize:stored-html. Каждый ответ\n"
    "                                // сервера несёт CSP (server/security-headers).\n",
    "B2 03 §2.4 PATCH капсулы warnings + входы",
)

# ── C. 01 §5.4 редактор и входы; §6a заголовки безопасности; §8.2 блок ───
patch(
    "docs/01-architecture.md",
    "текст, — решение пользователя («По факту 9.2» п.1). Открыто: истории версий\n"
    "раздела в интерфейсе нет (07 §12).\n",
    "текст, — решение пользователя («По факту 9.2» п.1). Открыто: истории версий\n"
    "раздела в интерфейсе нет (07 §12).\n"
    "\n"
    "**Беседа 13.1 (Д-63, Д-64).** Шаг 2b опирается на ОБЩИЙ модуль разметки\n"
    "(`packages/shared/constants/doc-markup.ts` — набор ровно по разделу\n"
    "«ФОРМАТИРОВАНИЕ» системного промпта; сторож сверяет модуль с текстом\n"
    "промпта) и общее ядро санитайзера (`shared/utils/doc-markup-sanitize.ts`,\n"
    "linkedom на сервере, DOMParser на клиенте). Тот же санитайзер стоит на\n"
    "КАЖДОМ входе разметки в документ — ответы модели (`cleanModelHtml`:\n"
    "генерация, перегенерация раздела и подраздела, режимы, трансформация,\n"
    "обогащение), импорт, PATCH капсулы, откат снимков версий; уже сохранённое\n"
    "чистит `scripts/maintenance/sanitize-stored-html.ts`. Шаг 1 на клиенте —\n"
    "полнотекстовая правка: contenteditable-блок на месте подраздела в\n"
    "типографике документа с панелью кнопок из `EDITOR_TOOLS` модуля (абзац,\n"
    "h5, strong, em, списки, таблица со строками/столбцами, выноски, метки\n"
    "риска), вставка из буфера через то же ядро, плашки вложенных подразделов\n"
    "(не удаляются, возвращаются комментариями-ссылками), прежнее поле\n"
    "разметки — запасной вид «Разметка». Движок — собственный, без\n"
    "ProseMirror/TipTap («По факту 13.1» п.6). Сервер клиенту по-прежнему не\n"
    "верит — чистит присланное повторно.\n",
    "C1 01 §5.4 — 13.1",
)
patch(
    "docs/01-architecture.md",
    "## 7. Масштабирование\n",
    "### 6a. Заголовки безопасности (беседа 13.1)\n"
    "\n"
    "Документ рисуется разметкой (`dangerouslySetInnerHTML`), и санитайзер на\n"
    "входах — первый рубеж; второй — CSP: `script-src 'self' https://js.stripe.com;\n"
    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'` (плюс\n"
    "`X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`). Без\n"
    "`'unsafe-inline'` встроенный обработчик, `javascript:`-ссылка или `<script>`,\n"
    "если бы они дошли до страницы, не исполнятся. Политика объявлена константой\n"
    "`server/security-headers.ts` и повторена дословно в трёх местах: middleware\n"
    "на все ответы сервера (`server/index.ts`), `preview.headers` в\n"
    "`client/vite.config.ts` (сборка под харнессами и локальной пробой; `vite dev`\n"
    "без CSP — react-refresh вставляет встроенный модуль) и блок `header` Caddy\n"
    "для `client/dist` (`deploy/philosynth-hosting.md` — настоящая защита\n"
    "страницы: статику отдаёт ставень). `integration-check` 4be сверяет три копии.\n"
    "`js.stripe.com` — Stripe.js вставляется `<script src>` в BillingPage;\n"
    "`default-src` не задан намеренно (шрифты Google, Stripe, API). Выгрузка\n"
    "уходит вложением (`Content-Disposition: attachment`) и под CSP страницы не\n"
    "попадает.\n"
    "\n"
    "## 7. Масштабирование\n",
    "C2 01 §6a заголовки безопасности",
)
patch(
    "docs/01-architecture.md",
    "Список выше — состояние на 2026-09-02. Блоки бесед после неё (5.2, 5.4,\n"
    "5.5, 6.2, 8.4, 8.7, 9.2, 10.3 и далее) лежат в части 3 `globals.css` под\n"
    "заголовками «Беседа N» — каждый с доводом, почему класса нет в исходнике.\n"
    "Новая беседа заводит свой блок так же.\n",
    "Список выше — состояние на 2026-09-02. Блоки бесед после неё (5.2, 5.4,\n"
    "5.5, 6.2, 8.4, 8.7, 9.2, 10.3 и далее, 13.1 — панель и тело полнотекстовой\n"
    "правки `.rich-editor-*`, плашка `.rich-placeholder`) лежат в части 3\n"
    "`globals.css` под заголовками «Беседа N» — каждый с доводом, почему класса\n"
    "нет в исходнике. Новая беседа заводит свой блок так же.\n",
    "C3 01 §8.2 блок 13.1",
)

# ── D. 02 пометки о чистке ───────────────────────────────────────────────
patch(
    "docs/02-data-model.md",
    "  html_content  TEXT NOT NULL DEFAULT '',\n"
    "  sec_context   TEXT NOT NULL DEFAULT '',  -- доп. контекст раздела (secCtx)\n",
    "  html_content  TEXT NOT NULL DEFAULT '',  -- 13.1 (Д-63): только ПОСЛЕ санитайзера\n"
    "                                          -- (shared/utils/doc-markup-sanitize, режим\n"
    "                                          -- section) — на всех входах; старое —\n"
    "                                          -- npm run sanitize:stored-html\n"
    "  sec_context   TEXT NOT NULL DEFAULT '',  -- доп. контекст раздела (secCtx)\n",
    "D1 02 sections.html_content",
)
patch(
    "docs/02-data-model.md",
    "  -- Капсула (HTML, хранится отдельно от секций)\n"
    "  capsule_html     TEXT NOT NULL DEFAULT '',\n",
    "  -- Капсула (HTML, хранится отдельно от секций); 13.1: как html_content —\n"
    "  -- только после санитайзера (PATCH капсулы, импорт, откат, генерация)\n"
    "  capsule_html     TEXT NOT NULL DEFAULT '',\n",
    "D2 02 capsule_html",
)

# ── E. 04 строки ─────────────────────────────────────────────────────────
patch(
    "docs/04-code-reuse-map.md",
    "| `server/utils/html-parser.ts` — `insertSubsectionAfter` | НОВОЕ (10.1):",
    "| `packages/shared/constants/doc-markup.ts`, `packages/shared/utils/doc-markup-sanitize.ts` | НОВОЕ (13.1, Д-63): набор разметки документа РОВНО по разделу «ФОРМАТИРОВАНИЕ» системного промпта (`parsePromptFormatting` читает генерат, `diffMarkupSpecs` — сторож 2at), `EDITOR_TOOLS` панели; ядро санитайзера одно на сервер (linkedom) и клиент (DOMParser) — режимы subsection/section, `b/i → strong/em`, прочее — текст, `sanitizeWarningsRu`. `server/utils/html-parser.ts` локальные списки 9.2 снял: `sanitizeTree` зовёт ядро, `sanitizeSectionHtml(html) → {html, warnings, changed}` — раздел целиком, идемпотентна, чистый вход побайтно |\n"
    "| `cleanModelHtml` (generation-service), `sanitizeSectionHtml` в mode-service, representation-transformer, element-enrichment, element-versioning, element-editor (`updateCapsule`, ответ с предупреждениями), import-service; `server/security-headers.ts`; `scripts/maintenance/sanitize-stored-html.ts` | НОВОЕ (13.1, Д-63): санитайзер на КАЖДОМ входе разметки (опись — «По факту 13.1» п.0; сверх текста беседы — обогащение, `autoRenameReferences` с `esc`, текст капсулы импорта); предупреждения ответа модели — в parseWarnings генлога с префиксом; CSP + nosniff + Referrer-Policy на каждом ответе (три копии дословно: index.ts, vite preview, Caddy); одноразовая чистка пяти таблиц с `--dry` |\n"
    "| `client/src/utils/subsection-rich-editor.ts`, форма в `SectionView.tsx` (два вида, панель из `EDITOR_TOOLS`, поле-зеркало), `SubsectionEditState.view` | НОВОЕ (13.1, Д-64): полнотекстовая правка — собственный contenteditable поверх общего ядра (без ProseMirror/TipTap: закрытый набор, правка на месте внутри строки `dangerouslySetInnerHTML`, ноль зависимостей; отмена перестроек таблиц вне родного стека — названо). `fillEditable`/`readEditorHtml` (чистка и `normalizeBlocks` на клоне), `applyTool` (`execCommand` для strong/em/списков/блоков; выноски, метки, таблица — DOM), `applyTableOp`, `sanitizePasted`/`insertPasted`, плашки ↔ комментарии, `isPlaceholderDeletion`. Вид «Разметка» — поле 9.2 на всю ширину с переносом |\n"
    "| `server/utils/html-parser.ts` — `insertSubsectionAfter` | НОВОЕ (10.1):",
    "E  04 строки 13.1",
)

# ── F. 05 дерево ─────────────────────────────────────────────────────────
patch(
    "docs/05-file-structure.md",
    "│       │   └── auth.ts                 # 8.1: PASSWORD_MIN_LENGTH, EMAIL_RE,\n"
    "│       │                               # DISPLAY_NAME_MAX_LENGTH — единый свод правил\n"
    "│       │                               # аккаунта (routes/auth, bootstrap-admin, RegisterPage)\n",
    "│       │   ├── auth.ts                 # 8.1: PASSWORD_MIN_LENGTH, EMAIL_RE,\n"
    "│       │   │                           # DISPLAY_NAME_MAX_LENGTH — единый свод правил\n"
    "│       │   │                           # аккаунта (routes/auth, bootstrap-admin, RegisterPage)\n"
    "│       │   └── doc-markup.ts           # 13.1 (Д-63): набор разметки документа РОВНО по\n"
    "│       │                               # разделу «ФОРМАТИРОВАНИЕ» промпта (parsePromptFormatting\n"
    "│       │                               # читает генерат, diffMarkupSpecs — сторож), EDITOR_TOOLS\n"
    "│       │                               # панели редактора; вне описи i18n (диагностика)\n",
    "F1 05 shared/constants/doc-markup.ts",
)
patch(
    "docs/05-file-structure.md",
    "│           ├── escape.ts               # esc() — HTML-экранирование\n",
    "│           ├── escape.ts               # esc() — HTML-экранирование\n"
    "│           ├── doc-markup-sanitize.ts  # 13.1 (Д-63): ядро санитайзера — одно на сервер\n"
    "│           │                           # (linkedom) и клиент (DOMParser); режимы subsection/\n"
    "│           │                           # section, b/i → strong/em, прочее — текст;\n"
    "│           │                           # sanitizeWarningsRu (перевод — Фаза 14)\n",
    "F2 05 shared/utils/doc-markup-sanitize.ts",
)
patch(
    "docs/05-file-structure.md",
    "│   ├── index.ts                        # Точка входа: Hono app + WebSocket\n"
    "│   │                                   # 11.2: requestLocale ДО rate-limiter и роутов,\n"
    "│   │                                   # installServerCatalogProvider()\n",
    "│   ├── index.ts                        # Точка входа: Hono app + WebSocket\n"
    "│   │                                   # 11.2: requestLocale ДО rate-limiter и роутов,\n"
    "│   │                                   # installServerCatalogProvider()\n"
    "│   │                                   # 13.1: SECURITY_HEADERS на каждый ответ\n"
    "│   ├── security-headers.ts             # 13.1 (Д-63): CONTENT_SECURITY_POLICY (копии дословно:\n"
    "│   │                                   # client/vite.config.ts preview, Caddy в deploy/hosting),\n"
    "│   │                                   # nosniff, Referrer-Policy — сторож 4be сверяет\n",
    "F3 05 server/security-headers.ts",
)
patch(
    "docs/05-file-structure.md",
    "│   │   ├── html-parser.ts              # Обёртка над linkedom для серверного DOM-парсинга\n"
    "│   │   └── crypto.ts",
    "│   │   ├── html-parser.ts              # Обёртка над linkedom для серверного DOM-парсинга\n"
    "│   │   │                               # 13.1: санитайзер на общем ядре shared; sanitizeSectionHtml\n"
    "│   │   │                               # (раздел целиком) — для всех входов разметки\n"
    "│   │   └── crypto.ts",
    "F4 05 html-parser пометка",
)
patch(
    "docs/05-file-structure.md",
    "│   │       ├── subsection-edit.ts          # 9.2: состояние правки подраздела и тексты отказов\n"
    "│   │       │                               # (клиент разметку НЕ собирает и НЕ чистит — сервер)\n",
    "│   │       ├── subsection-edit.ts          # 9.2: состояние правки подраздела и тексты отказов\n"
    "│   │       │                               # (клиент разметку НЕ собирает и НЕ чистит — сервер);\n"
    "│   │       │                               # 13.1: + view 'rich'|'markup'\n"
    "│   │       ├── subsection-rich-editor.ts   # 13.1 (Д-64): полнотекстовая правка — contenteditable\n"
    "│   │       │                               # поверх общего ядра: fillEditable/readEditorHtml,\n"
    "│   │       │                               # applyTool/applyTableOp, sanitizePasted/insertPasted,\n"
    "│   │       │                               # плашки вложенных подразделов ↔ комментарии-ссылки,\n"
    "│   │       │                               # подписи панели (tl); React не знает\n",
    "F5 05 subsection-rich-editor.ts",
)
patch(
    "docs/05-file-structure.md",
    "│   ├── checks/                         # проверки, идущие без браузера\n",
    "│   ├── maintenance/                    # 13.1: одноразовые обслуживающие скрипты (tsx, живая БД)\n"
    "│   │   └── sanitize-stored-html.ts     # Д-63: чистка УЖЕ сохранённой разметки (sections,\n"
    "│   │                                   # capsule_html, mode_results, снимки element_versions,\n"
    "│   │                                   # element_enrichments); --dry, --synthesis; идемпотентен;\n"
    "│   │                                   # npm run sanitize:stored-html — шаг после обновления (deploy/*)\n"
    "│   ├── checks/                         # проверки, идущие без браузера\n",
    "F6 05 scripts/maintenance",
)
patch(
    "docs/05-file-structure.md",
    "    │                                   # smoke-125-request1 — 12.5: Д-43 (столбец «Тип» при перерисовке,\n",
    "    │                                   # smoke-131-request1 — 13.1: ядро санитайзера, живые входы\n"
    "    │                                   # (PATCH капсулы, импорт файла с <img onerror>/javascript:),\n"
    "    │                                   # CSP на сервере/preview/трёх копиях, скрипт чистки --dry,\n"
    "    │                                   # редактор в сборке под Chrome 131 (панель, вставка, таблица,\n"
    "    │                                   # плашка, два вида формы, Ctrl+Enter → БД)\n"
    "    │                                   # smoke-125-request1 — 12.5: Д-43 (столбец «Тип» при перерисовке,\n",
    "F7 05 smoke-131",
)

# ── G. 09 уроки ──────────────────────────────────────────────────────────
patch(
    "docs/09-lessons.md",
    "## 5. Node, TypeScript, сборка\n",
    "### Беседа 13.1 — форма с двумя видами и старые харнессы\n"
    "1. **Новый вид формы поверх старого — старый остаётся в DOM зеркалом**:\n"
    "   поле 9.2 скрыто (`hidden`), но заполняется после каждого ввода редактора,\n"
    "   и сохранение читает его. Харнессы 9.2–12.x, ставящие значение полю и\n"
    "   жмущие «Сохранить», живы; те, что ждут ФОКУСА в поле или `page.focus`\n"
    "   на нём, — переключают вид «Разметка» одной строкой в помощнике\n"
    "   (`openSubEditor`/`waitArea`). Проверка «предмет исчез или ослаблен?»\n"
    "   (12.5) — за ними.\n"
    "2. **Фикстуры харнессов обязаны быть в наборе промпта**: `<div\n"
    "   class=\"capsule\">` test-124 жил, пока санитайзер не стоял на откате —\n"
    "   теперь класс снимается, и «capsule_html прежний» краснел. Настоящая\n"
    "   капсула — обёртка doc-section; фикстура переписана, не сторож.\n"
    "3. **Старый харнесс без CDP `acceptLanguage: ru` падает не на своём\n"
    "   предмете** (test-92 на «✎ Изменить» — страница была по-английски с\n"
    "   11.3): первая красная строка старого харнесса — проверить язык.\n"
    "\n"
    "## 5. Node, TypeScript, сборка\n",
    "G1 09 §4 — 13.1",
)
patch(
    "docs/09-lessons.md",
    "## 7. Сервер: стрим, WS, Redis, Registry\n",
    "### Беседа 13.1 — contenteditable внутри dangerouslySetInnerHTML\n"
    "1. **Живое дерево редактора после команды НЕ чистить**: замена узла под\n"
    "   кареткой (`<b>` → `<strong>`) сбивает выделение — Chrome уносил набор в\n"
    "   конец блока (найдено смоуком: «жирно» оказалось после «курсив»). Следы\n"
    "   `execCommand` снимает ядро при сборке на КЛОНЕ (`readEditorHtml`);\n"
    "   `styleWithCSS=false`, чтобы были `<b>/<i>`, а не `<span style>`.\n"
    "2. **Chrome без `defaultParagraphSeparator` ставит `<div>` на Enter, а\n"
    "   набор после таблицы в конце корня идёт голым текстом** —\n"
    "   `normalizeBlocks`: `<div>` без класса → `<p>`, строчные пробеги\n"
    "   верхнего уровня → `<p>`, хвостовые `<br>`, nbsp-заглушки ячеек и\n"
    "   nbsp набора → пробелы; `prettyMarkup` снимает пробелы ТОЛЬКО рядом с\n"
    "   блочными тегами (`</strong> <em>` цел — `/>\\s*</` стёр бы пробел).\n"
    "3. **Содержимое редактора — в строку HTML при сборке** (`fillEditable`\n"
    "   в документе DOMParser), не эффектом после монтажа: приём 1.6b/9.2 без\n"
    "   второго прохода по DOM. Кнопки панели гасят `mousedown` — фокус и\n"
    "   выделение остаются в редакторе.\n"
    "4. **Плашка вложенного подраздела — `contenteditable=\"false\"` плюс\n"
    "   гашение Backspace/Delete у края соседнего блока, вырезания и drag**:\n"
    "   одного `contenteditable=false` мало — Backspace в начале следующего\n"
    "   блока удаляет её целиком.\n"
    "\n"
    "## 7. Сервер: стрим, WS, Redis, Registry\n",
    "G2 09 §6 — 13.1",
)

# ── H. NEXT-CONTEXT ──────────────────────────────────────────────────────
patch(
    "NEXT-CONTEXT.md",
    "## Комплект ближайшей беседы — 13.1 (безопасность входящего HTML и полнотекстовая правка: бэкенд + клиент)\n",
    "## Комплект ближайшей беседы — 13.1 (безопасность входящего HTML и полнотекстовая правка: бэкенд + клиент) — ПЕРВЫЙ ЗАПРОС ИСПОЛНЕН 2026-10-14\n"
    "\n"
    "Сделано («По факту 13.1 (первый запрос)» в 07): общий модуль разметки и\n"
    "ядро санитайзера в shared, санитайзер на всех входах (+ три найденных\n"
    "сверх текста: обогащение, `autoRenameReferences`, текст капсулы импорта),\n"
    "`npm run sanitize:stored-html`, CSP в трёх копиях, собственный\n"
    "contenteditable-редактор с панелью из `EDITOR_TOOLS` и видом «Разметка»,\n"
    "сторож 2at/4be/5ao, смоук `tests/smoke-131-request1.mjs` (55 ✓), харнессы\n"
    "92/103/124 зелёные, `i18n:check --strict` и css-parity зелёные. Остались\n"
    "последующие запросы беседы (живые пробы по тексту 13.1 — частично покрыты\n"
    "смоуком; правка на живом файле одностраничника) и завершение (08 Часть IV,\n"
    "README). Чтобы редактор стоял на стенде: после `git pull` — `npm run\n"
    "sanitize:stored-html -- --dry`, затем без `--dry`.\n",
    "H  NEXT-CONTEXT комплект 13.1",
    marker="Сделано («По факту 13.1 (первый запрос)» в 07)",
)

# ══ ЧАСТЬ II — тестовые запросы 2–5 (2026-10-20) ═══════════════════════════
PF131B = """
**По факту 13.1 (тестовые запросы 2–5 — 2026-10-20).** Один харнесс
`tests/test-131-requests2-5.mjs` (63 ✓; живой сервер, мок Claude, сборка
клиента под Chrome 131, файл-образец из `sample/`) на четыре запроса:

- **R2 (Д-63 живьём).** PATCH капсулы, импорт файла и ОТВЕТ МОКА (режим
  adversarial) с `<img onerror>`, `<script>`, `<a href="javascript:">`,
  `onclick`/`style` → в БД ничего из этого нет, `b/i → strong/em`, текст
  ссылки и абзаца цел; предупреждение чистки — в `parseWarnings` генлога
  режима с префиксом; выгрузка несёт уже чистую капсулу. Страница с
  «отравленной» строкой (как до 13.1, вставлена SQL в обход API):
  `document.title` не меняется, консоль называет отказ CSP встроенному
  обработчику; скрипт на этой записи — `--dry` называет `<img>`/`<script>`/
  атрибуты и не пишет, без `--dry` чистит (текст и `<h4>` целы), повтор —
  0; CSP у ответа сервера и preview — дословно по п.5.
- **R3 (сужение).** `<b>/<i>` → `<strong>/<em>`; `<sup>`, `<br>`,
  `<blockquote>` — текст без тега; шесть выносок/меток с разрешёнными
  классами — побайтно как есть; чужие классы (`callout danger`, `risk
  extreme`, `badge`, `lead`) сняты, тег остаётся, в warnings названы.
  Найдено: linkedom схлопывает пробелы `class` ещё при разборе, и
  `callout  warning ` ядро считало чистым, а строка возвращалась побайтно
  с пробелами — `sanitizeSectionHtml` теперь считает такой вход изменённым
  (регулярка по `class="…"`), в БД ложится точное значение набора.
- **R4 (редактор).** Каждая из 13 кнопок панели даёт свой тег (сверка по
  зеркалу после каждой); вставка `b/i/span style/sup` → `strong/em/текст`;
  ячейка правится на месте, «+ строка»; плашка вложенного подраздела
  переживает Backspace/Delete/набор поверх выделения; «Разметка» — поле на
  всю ширину, `pre-wrap`, без горизонтальной прокрутки, `rows` по
  содержимому; «Текст» ← «Разметка» без потерь; после Ctrl+Enter
  `readSubsectionSource` сервера ≡ зеркалу редактора (пробелы между тегами
  схлопнуты). **Два дефекта редактора нашёл именно этот прогон**: (а) родной
  Enter в конце выноски раздваивал её (`div` с тем же классом без метки), а
  жирный/курсив у края абзаца тянулся в новый абзац (`<p><strong>…`,
  список внутри `<strong>`) — Enter с кареткой в конце абзаца/подзаголовка/
  выноски теперь обрабатывается сам (`enterAtBlockEnd`: чистый `<p>` после
  блока; посреди блока, в списках и таблицах — родной); (б)
  `insertUnorderedList` в абзаце даёт `<p><ul>…</ul></p>` — HTML так не
  разбирается, сервер закрыл бы `<p>` раньше и зеркало расходилось с
  сохранённым: `normalizeBlocks` выносит блочных детей из `<p>`, строчные
  куски — своими абзацами.
- **R5 (живой файл).** Образец импортирован (11 разделов, 56 подразделов);
  незапертые подразделы с таблицей и с выноской открыты в редакторе без
  потерь (число таблиц/строк/выносок/меток/strong/h5/li — прежнее), текст
  правится на месте, после сохранения разметка на сервере та же и ≡
  зеркалу; запертые (`lockedSubsections`) — без карандаша, PATCH → 409
  `SECTION_TABLE_LOCKED`.

Сверх запросов: черновики en/de 50 строк редактора утверждены (`i18n:import`
без `--draft` — «подтверждено вычиткой 100»); перепрогон после правок:
smoke-131 55 ✓, test-92 99 ✓, `check:integration` OK, `typecheck` 0,
`i18n:check --strict` и css-parity зелёные.
"""
patch(
    "docs/07-conversation-protocol.md",
    "`i18n:check --strict` зелёный. (г) CSS 9.2: поле разметки `width: 100%`,\n"
    "`height: auto`, `white-space: pre-wrap`, `overflow-wrap: anywhere`; блок\n"
    "«Беседа 13.1» (панель, кнопки `.rich-editor-btn` по образу\n"
    "`.inline-edit-btn` кита, тело `.rich-editor-body` в типографике документа с\n"
    "золотым фокусом, плашка пунктиром `--rule-strong` на `--off`); css-parity\n"
    "A/B/C = 0. (д) `client/src/api/elements.ts`: `UpdateCapsuleResponse +=\n"
    "warnings` (у правки текстом из шапки пусто — показа нет). Экспорты и\n"
    "переводы прочего не тронуты.\n",
    "`i18n:check --strict` зелёный. (г) CSS 9.2: поле разметки `width: 100%`,\n"
    "`height: auto`, `white-space: pre-wrap`, `overflow-wrap: anywhere`; блок\n"
    "«Беседа 13.1» (панель, кнопки `.rich-editor-btn` по образу\n"
    "`.inline-edit-btn` кита, тело `.rich-editor-body` в типографике документа с\n"
    "золотым фокусом, плашка пунктиром `--rule-strong` на `--off`); css-parity\n"
    "A/B/C = 0. (д) `client/src/api/elements.ts`: `UpdateCapsuleResponse +=\n"
    "warnings` (у правки текстом из шапки пусто — показа нет). Экспорты и\n"
    "переводы прочего не тронуты.\n"
    + PF131B,
    "I  07 «По факту 13.1 (тестовые запросы 2–5)»",
)
patch(
    "docs/05-file-structure.md",
    "    │                                   # smoke-131-request1 — 13.1: ядро санитайзера, живые входы\n",
    "    │                                   # test-131-requests2-5 — 13.1: тестовые запросы живьём — ответ мока с\n"
    "    │                                   # ядом → mode_results чист + parseWarnings; страница с отравленной\n"
    "    │                                   # строкой под CSP (title не меняется); скрипт чистки; сужение;\n"
    "    │                                   # 13 кнопок редактора, вставка, таблица, плашка, «Разметка»,\n"
    "    │                                   # сервер ≡ зеркалу; живой файл — таблица/выноска без потерь, замки\n"
    "    │                                   # smoke-131-request1 — 13.1: ядро санитайзера, живые входы\n",
    "J1 05 test-131",
)
patch(
    "docs/09-lessons.md",
    "4. **Плашка вложенного подраздела — `contenteditable=\"false\"` плюс\n"
    "   гашение Backspace/Delete у края соседнего блока, вырезания и drag**:\n"
    "   одного `contenteditable=false` мало — Backspace в начале следующего\n"
    "   блока удаляет её целиком.\n",
    "4. **Плашка вложенного подраздела — `contenteditable=\"false\"` плюс\n"
    "   гашение Backspace/Delete у края соседнего блока, вырезания и drag**:\n"
    "   одного `contenteditable=false` мало — Backspace в начале следующего\n"
    "   блока удаляет её целиком.\n"
    "5. **Родной Enter в конце блока — не ваш друг**: выноску (`div` с классом)\n"
    "   Chrome раздваивает с тем же классом и без метки, а жирный/курсив у\n"
    "   края абзаца тянется в новый абзац, и следующий `insertOrderedList`\n"
    "   оказывается внутри `<strong>`. Enter у края абзаца/подзаголовка/выноски\n"
    "   — свой: чистый `<p><br></p>` после блока; посреди блока, в `li` и\n"
    "   ячейках — родной. Каретка «между блоками корня» (`selectNodeContents`\n"
    "   + `collapse`) — отдельный случай: блок — перед ней, `topBlockOf` его\n"
    "   не видит.\n"
    "6. **`insertUnorderedList` в абзаце даёт `<p><ul>…</ul></p>`** — DOM это\n"
    "   терпит, HTML-разбор нет: сервер закроет `<p>` раньше, и «сохранённое ≡\n"
    "   увиденному» расходится. Нормализация при сборке выносит блочных детей\n"
    "   из `<p>`. Проверка «сервер ≡ зеркалу» (readSubsectionSource против\n"
    "   значения поля) ловит такие вещи — держать её в каждом харнессе\n"
    "   редактора.\n",
    "J2 09 §6 — Enter и списки",
)
patch(
    "NEXT-CONTEXT.md",
    "`i18n:check --strict` и css-parity зелёные. Остались\n"
    "последующие запросы беседы (живые пробы по тексту 13.1 — частично покрыты\n"
    "смоуком; правка на живом файле одностраничника) и завершение (08 Часть IV,\n"
    "README). Чтобы редактор стоял на стенде: после `git pull` — `npm run\n"
    "sanitize:stored-html -- --dry`, затем без `--dry`.\n",
    "`i18n:check --strict` и css-parity зелёные. Тестовые запросы 2–5\n"
    "исполнены 2026-10-20 одним харнессом `tests/test-131-requests2-5.mjs`\n"
    "(63 ✓; нашёл и закрыл два дефекта редактора — Enter у края блока и\n"
    "`<p><ul>`; «По факту 13.1 (тестовые запросы 2–5)»); черновики en/de\n"
    "утверждены. Осталось завершение беседы (08 Часть IV, README, ревью TODO).\n"
    "Чтобы редактор стоял на стенде: после `git pull` — `npm run\n"
    "sanitize:stored-html -- --dry`, затем без `--dry`.\n",
    "K  NEXT-CONTEXT тестовые запросы исполнены",
)

# ══ ЧАСТЬ III — завершение беседы 13.1 (2026-10-20) ════════════════════════
CLOSE_MARK_131 = "ЗАКРЫТ 13.1 (2026-10-20)"


def drop_line(rel: str, prefix: str, label: str, gone_marker: str, gone_rel: str) -> None:
    """Снять ОДНУ строку реестра §12 (начинается с prefix); «уже снята» — по
    маркеру закрытия в gone_rel (08 Часть IV)."""
    global applied, skipped, failed
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    hits = [i for i, l in enumerate(lines) if l.startswith(prefix)]
    if not hits:
        if gone_marker in (ROOT / gone_rel).read_text(encoding="utf-8"):
            skipped += 1
            print(f"  skip  {label}")
        else:
            failed += 1
            print(f"  fail  {label}: строки нет, и следа закрытия нет")
        return
    if len(hits) != 1:
        failed += 1
        print(f"  fail  {label}: строк с началом {prefix!r} — {len(hits)}")
        return
    del lines[hits[0]]
    path.write_text("\n".join(lines), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


PF131C = """
**По факту 13.1 (завершение — беседа закрыта 2026-10-20).** Закрыты Д-63 и
Д-64 (строки сняты из §12, в 08 Часть IV с итогом). Завершающий блок:
`npm run typecheck` — 0 ошибок, `vite build` собирает; на свежем дереве
(копия без `node_modules`, свой `npm install`) `check:integration` —
INTEGRATION OK (13.1: 2at/4be/5ao), `check:dotfiles` — OK, `i18n:check
--strict` — зелёный (50 ключей редактора утверждены), css-parity A/B/C = 0;
харнессы: smoke-131 55 ✓, test-131 63 ✓, test-92 99 ✓, test-103 115 ✓,
test-124 120 ✓. Ревью TODO и заглушек: в коде беседы меток TODO нет; все
`TODO(N)` в дереве — исторические упоминания закрытых долгов. Известные
границы, названные в коде и доках, долгами не являются: отмена перестроек
таблиц/выносок/меток в редакторе — вне родного стека Ctrl+Z (выбор движка,
п.6); `vite dev` без CSP (react-refresh); русские фразы предупреждений
чистки — Фаза 14 (Д-60). Долгов беседа не оставила; строк «не назначен»
нет. Миграций нет (следующая — 0014). Единый коммит беседы — под
авторством пользователя; на стенде после выкатки — один прогон
`npm run sanitize:stored-html` (`--dry`, затем запись). Ближайшая — 13.2.
"""
patch(
    "docs/07-conversation-protocol.md",
    "smoke-131 55 ✓, test-92 99 ✓, `check:integration` OK, `typecheck` 0,\n"
    "`i18n:check --strict` и css-parity зелёные.\n",
    "smoke-131 55 ✓, test-92 99 ✓, `check:integration` OK, `typecheck` 0,\n"
    "`i18n:check --strict` и css-parity зелёные.\n"
    + PF131C,
    "L1 07 «По факту 13.1 (завершение)»",
)
patch(
    "docs/07-conversation-protocol.md",
    "- Фаза 13 — 13.1 → 13.2, после закрытия Фазы 12 и ПЕРЕД Фазой 14:\n",
    "- Фаза 13 — 13.1 (ЗАКРЫТА 2026-10-20) → 13.2, после закрытия Фазы 12 и ПЕРЕД Фазой 14:\n",
    "L2 07 §11: 13.1 закрыта",
)
for n in ("63", "64"):
    drop_line("docs/07-conversation-protocol.md", f"| Д-{n} | ", f"L3 07 §12: строка Д-{n} снята", CLOSE_MARK_131, "docs/08-history.md")
patch(
    "docs/07-conversation-protocol.md",
    "   Огр-7 выбыли и не переиспользуются; Огр-5, Огр-8, Огр-9, Огр-11,\n"
    "   Огр-12 и вторая половина Огр-10 остаются ограничениями.\n",
    "   Огр-7 выбыли и не переиспользуются; Огр-5, Огр-8, Огр-9, Огр-11,\n"
    "   Огр-12 и вторая половина Огр-10 остаются ограничениями.\n"
    "   При закрытии 13.1 (2026-10-20) сняты Д-63 и Д-64 (в 08 Часть IV);\n"
    "   новых долгов беседа не оставила, строк «не назначен» нет.\n",
    "L4 07 §12: преамбула — 13.1",
)

# ── M. 08 ─────────────────────────────────────────────────────────────────
patch(
    "docs/08-history.md",
    "patch-docs-conv125.py; ближайшая — не назначена (L.1 или новая фаза).\n",
    "patch-docs-conv125.py; ближайшая — не назначена (L.1 или новая фаза).\n"
    "Беседа 13.1 (безопасность входящего HTML и полнотекстовая правка; бэкенд +\n"
    "клиент) ЗАКРЫТА 2026-10-20 — первая беседа Фазы 13. Д-63: общий модуль\n"
    "разметки по разделу «ФОРМАТИРОВАНИЕ» промпта (`shared/constants/doc-markup`)\n"
    "и ядро санитайзера (`shared/utils/doc-markup-sanitize`, одно на linkedom и\n"
    "DOMParser; b/i → strong/em, прочее — текст, опасное — с содержимым) на\n"
    "ВСЕХ входах документа — ответы модели (`cleanModelHtml`, предупреждения в\n"
    "parseWarnings), режимы, трансформация, обогащение, импорт, PATCH капсулы\n"
    "(ответ += warnings), откаты версий; сверх текста беседы — обогащение,\n"
    "`autoRenameReferences` без `esc`, текст капсулы импорта; одноразовая\n"
    "чистка `npm run sanitize:stored-html` (--dry); CSP в трёх копиях (сервер,\n"
    "vite preview, Caddy) + nosniff/Referrer-Policy. Д-64: собственный\n"
    "contenteditable-редактор на месте подраздела с панелью из `EDITOR_TOOLS`\n"
    "(13 кнопок), строки/столбцы таблиц, плашки вложенных подразделов, вставка\n"
    "через общее ядро, вид «Разметка» (поле 9.2 на всю ширину с переносом);\n"
    "поле — скрытое зеркало, харнессы 9.2–12.x живы. Сторож 2at/4be/5ao, смоук\n"
    "131 55 ✓, test-131 63 ✓ (нашёл Enter у края блока и `<p><ul>`), 50 ключей\n"
    "en/de утверждены; доки — patch-docs-conv131.py; ближайшая — 13.2.\n",
    "M1 08 Часть I: строка 13.1",
)
patch(
    "docs/08-history.md",
    "---\n"
    "\n"
    "### Беседа 12.5 — Харнессы, инструменты переводов, доки [ЗАКРЫТА 2026-10-13]\n",
    "---\n"
    "\n"
    "### Беседа 13.1 — Безопасность входящего HTML и полнотекстовая правка (бэкенд + клиент) [ЗАКРЫТА 2026-10-20]\n"
    "\n"
    "**Вход:** HEAD 5fef8c7, `check:dotfiles` чист, `npm install` в самом клоне,\n"
    "PG 16 и Redis в песочнице, Chrome 131 из `chrome/` (части), файл-образец\n"
    "концепции в `sample/`. Первая беседа Фазы 13; порядок — «сначала\n"
    "безопасность (пп. 1–5), затем редактор (пп. 6–10)». Решения пользователя:\n"
    "кнопки ровно по тегам «ФОРМАТИРОВАНИЯ» внутри подраздела, санитайзер\n"
    "сужается до того же набора (b/i → strong/em, прочее — текст),\n"
    "структурные теги и `<h4>` человеком не правятся.\n"
    "\n"
    "**Сделано (первый запрос, 2026-10-14).** п.0 — опись входов HTML до правок\n"
    "(«По факту 13.1» п.0): сверх текста беседы найдены обогащение элемента\n"
    "(`element_enrichments.content` рисуется `dangerouslySetInnerHTML`),\n"
    "`autoRenameReferences` (имя в html без `esc`, `$`-шаблон `replace`), текст\n"
    "капсулы при импорте. п.1–2 — `packages/shared/constants/doc-markup.ts`\n"
    "(`parsePromptFormatting` читает генерат, `EDITOR_TOOLS`, `diffMarkupSpecs`)\n"
    "и `packages/shared/utils/doc-markup-sanitize.ts` (режимы subsection/section,\n"
    "`sanitizeWarningsRu`); `html-parser` локальные списки снял,\n"
    "`sanitizeSectionHtml` идемпотентна и чистый вход отдаёт побайтно. п.3 —\n"
    "`cleanModelHtml` (генерация ×5, режимы ×2, трансформация), `sanitizeSectionHtml`\n"
    "на откатах, обогащении, `updateCapsule` (+ `warnings`), импорте (поля\n"
    "sections/modes). п.4 — `scripts/maintenance/sanitize-stored-html.ts` (пять\n"
    "таблиц, `--dry`, `--synthesis`), шаг в обоих deploy-руководствах. п.5 —\n"
    "`server/security-headers.ts`: CSP (`script-src 'self' https://js.stripe.com;\n"
    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'`), копии в\n"
    "`vite preview` и Caddy; выгрузка — вложение. п.6 — движок: собственный\n"
    "contenteditable поверх общего ядра (довод — закрытый набор, правка внутри\n"
    "строки `dangerouslySetInnerHTML`, ноль зависимостей; отмена перестроек\n"
    "таблиц вне Ctrl+Z названа); `client/src/utils/subsection-rich-editor.ts`,\n"
    "форма 9.2 с двумя видами (`view: rich | markup`), скрытое поле-зеркало.\n"
    "п.7 — вставка и drop через ядро. п.8 — строки/столбцы таблиц, «Разметка» на\n"
    "всю ширину с переносом (CSS 9.2 исправлен). п.9 — плашки вложенных\n"
    "подразделов с гашением Backspace/Delete/вырезания/drag. п.10 — сторож\n"
    "2at/4be/5ao, смоук `tests/smoke-131-request1.mjs` 55 ✓. Харнессы 92/103/124\n"
    "переведены на два вида формы (test-92: ещё CDP ru и допуск css-parity;\n"
    "test-124: фикстура капсулы — doc-section); `ui-strings-lib` пропускает два\n"
    "модуля диагностики; 50 ключей `utils.richEditor.*`/`document.sectionView.*`.\n"
    "\n"
    "**Тестовые запросы 2–5 (2026-10-20)** — один харнесс\n"
    "`tests/test-131-requests2-5.mjs` (63 ✓): ответ мока с ядом → mode_results\n"
    "чист, предупреждение в parseWarnings; страница со «старой» отравленной\n"
    "строкой под CSP — title не меняется; скрипт чистки; сужение; все 13 кнопок;\n"
    "сервер ≡ зеркалу редактора; живой файл — таблица/выноска без потерь,\n"
    "замки. Нашёл и закрыл два дефекта редактора: родной Enter в конце выноски\n"
    "раздваивал её и тянул жирный/курсив в новый абзац (`enterAtBlockEnd`),\n"
    "`insertUnorderedList` давал `<p><ul>` (`normalizeBlocks`); linkedom\n"
    "схлопывает пробелы `class` при разборе (`sanitizeSectionHtml` считает такой\n"
    "вход изменённым). Черновики en/de утверждены.\n"
    "\n"
    "**Завершение (2026-10-20).** typecheck 0, build, свежее дерево:\n"
    "check:integration OK, dotfiles, i18n strict, css-parity; TODO в коде беседы\n"
    "нет. Д-63 и Д-64 закрыты, новых долгов нет. Доки — `patch-docs-conv131.py`\n"
    "(части I–III), уроки — 09 §4 и §6. Ближайшая — 13.2.\n"
    "\n"
    "---\n"
    "\n"
    "### Беседа 12.5 — Харнессы, инструменты переводов, доки [ЗАКРЫТА 2026-10-13]\n",
    "M2 08 Часть II: глава 13.1",
)
patch(
    "docs/08-history.md",
    "| Д-50 — replay подписки без `skipDegrades`/`sectionKeys`, обход `samePause` | 12.5 | «По факту 12.4 (тестовые)» п.1 | ЗАКРЫТ 12.5 (2026-10-12): replay ",
    "| Д-63 — хранимый XSS: HTML входит в документ без чистки (PATCH капсулы, импорт, ответы модели, откат версий) | 13.1 | живая проба ручной правки 2026-10-13 (браузер) | ЗАКРЫТ 13.1 (2026-10-20): общий модуль разметки по «ФОРМАТИРОВАНИЮ» промпта + ядро санитайзера на всех входах (включая найденные сверх текста: обогащение, `autoRenameReferences`, текст капсулы импорта), `npm run sanitize:stored-html` для сохранённого, CSP в трёх копиях; сторож 2at/4be/5ao, смоук 131, test-131 R2 (ответ мока и страница с отравленной строкой) |\n"
    "| Д-64 — ручная правка подраздела неудобна (поле ≈190 px, без переноса, таблицы вручную) | 13.1 | живая проба ручной правки 2026-10-13 (браузер) | ЗАКРЫТ 13.1 (2026-10-20): собственный contenteditable-редактор на месте подраздела с панелью `EDITOR_TOOLS` (13 кнопок), строки/столбцы таблиц, плашки вложенных подразделов, вставка через общее ядро; вид «Разметка» — поле на всю ширину с переносом и высотой по содержимому; test-131 R4/R5 |\n"
    "| Д-50 — replay подписки без `skipDegrades`/`sectionKeys`, обход `samePause` | 12.5 | «По факту 12.4 (тестовые)» п.1 | ЗАКРЫТ 12.5 (2026-10-12): replay ",
    "M3 08 Часть IV: строки Д-63, Д-64",
)

# ── N. README ─────────────────────────────────────────────────────────────
patch(
    "README.md",
    "| 13 — безопасность и правка документа | 13.1–13.2 | заведена 2026-10-13 живой пробой ручной правки (Д-63 хранимый XSS, Д-64 полнотекстовая правка); 13.2 (утечки и лимитер, Д-65…Д-67) добавлена 2026-10-14; идёт ПЕРЕД Фазой 14 |",
    "| 13 — безопасность и правка документа | 13.1–13.2 | заведена 2026-10-13 живой пробой ручной правки (Д-63 хранимый XSS, Д-64 полнотекстовая правка); 13.2 (утечки и лимитер, Д-65…Д-67) добавлена 2026-10-14; идёт ПЕРЕД Фазой 14. 13.1 (общий модуль разметки по промпту, санитайзер на всех входах, чистка сохранённого `sanitize:stored-html`, CSP; полнотекстовый редактор подраздела с панелью по тому же модулю) — 10-20 |",
    "N1 README: таблица фаз — 13.1",
)

# ── O. NEXT-CONTEXT ───────────────────────────────────────────────────────
patch(
    "NEXT-CONTEXT.md",
    "## Состояние на 2026-10-14 (Фаза 12 «Закрытие долгов» ЗАКРЫТА: 12.1–12.5; заведены Фазы 13, 14 и 15, ближайшая — 13.1)\n",
    "## Состояние на 2026-10-20 (Фаза 13: 13.1 ЗАКРЫТА 2026-10-20, ближайшая — 13.2; Фазы 14 и 15 ждут)\n"
    "\n"
    "**13.1 (безопасность входящего HTML и полнотекстовая правка; бэкенд + клиент)\n"
    "ЗАКРЫТА 2026-10-20.** Закрыты Д-63 и Д-64; новых долгов нет. Д-63: общий\n"
    "модуль разметки `packages/shared/constants/doc-markup.ts` (ровно по разделу\n"
    "«ФОРМАТИРОВАНИЕ» промпта, сторож сверяет), ядро санитайзера\n"
    "`packages/shared/utils/doc-markup-sanitize.ts` (одно на сервер и клиент) на\n"
    "ВСЕХ входах документа — `cleanModelHtml` для ответов модели (предупреждения\n"
    "в parseWarnings с префиксом «чистка разметки ответа модели: »),\n"
    "`sanitizeSectionHtml` на импорте, капсуле (ответ += `warnings`), откатах,\n"
    "обогащении; `npm run sanitize:stored-html [-- --dry]` для сохранённого;\n"
    "CSP (`server/security-headers.ts`, копии в `vite preview` и Caddy, сторож\n"
    "4be сверяет). Д-64: `client/src/utils/subsection-rich-editor.ts` —\n"
    "contenteditable на месте подраздела, панель из `EDITOR_TOOLS`, два вида\n"
    "формы (`SubsectionEditState.view`), поле 9.2 — скрытое зеркало (харнессы,\n"
    "ставящие значение полю, живы; ждущие фокуса в поле — переключают вид\n"
    "«Разметка»). Тесты: smoke-131 55 ✓, test-131 63 ✓, test-92/103/124 зелёные;\n"
    "сторож 2at/4be/5ao; 50 ключей en/de утверждены. Миграций нет. Доки —\n"
    "`patch-docs-conv131.py` (части I–III). На стенде после выкатки —\n"
    "`sanitize:stored-html` один раз.\n",
    "O1 NEXT-CONTEXT: состояние",
)
patch(
    "NEXT-CONTEXT.md",
    "## Ближайшая беседа — не назначена (Фаза 12 закрыта 2026-10-13)\n"
    "\n"
    "Протокол 07 дальше Фазы 12 бесед не заводит. Открытые пути: типовая беседа\n"
    "**L.1** (новый язык интерфейса; после Д-33 п.1 первого запроса — одна команда\n"
    "`npm run i18n:add-lang -- xx`, сторожа и тесты 112–114 языки берут из\n"
    "`UI_LOCALES`) либо новая фаза по решению пользователя (заводится в 07:\n"
    "врезка, тексты бесед, узлы §11; долги — строками §12 с адресатом). Реестр\n"
    "§12 пуст; ограничения «Огр-N» остаются. Миграций — нет (следующая — 0014).\n"
    "Файл концепции для харнессов 101/102/103/121/122/125 — из `T*_FILE`, в\n"
    "репозитории его нет.\n",
    "## Ближайшая беседа — 13.2 (утечки и лимитер запросов; бэкенд)\n"
    "\n"
    "Текст — 07 «Фаза 13», беседа 13.2 (Д-65 пауза генерации чужому в\n"
    "`philosynth-state`/GET, Д-66 ветка UUID импорта в обход `allow_meta`, Д-67\n"
    "лимитер обходится случайной cookie). Комплект: 07 §12 — строки Д-65…Д-67;\n"
    "врезка «Фаза 13»; «По факту» 0.2, 8.5, 8.6, 9.1, 13.1; `01` (безопасность,\n"
    "развёртывание), `02` (`paused_state`, `visibility`, `allow_meta`,\n"
    "`synthesis_lineage`), `03` (§2.1 коды, GET синтеза по ступеням, импорт,\n"
    "`/lineage/link`, `META_NOT_ALLOWED`), `04`, `05`; код по списку в тексте\n"
    "13.2; харнесс-образец живого сервера — `tests/test-125-requests2-9.mjs`\n"
    "(и `tests/test-131-requests2-5.mjs` — мок ответа и страница в сборке).\n"
    "13.2 после 13.1 — обе правят `import-service.ts` (санитайзер стоит на\n"
    "разделах, капсуле и режимах импорта: ветку UUID не обходить мимо него).\n"
    "Исходник и дизайн-набор не нужны. Миграций — нет (следующая — 0014).\n"
    "Файл концепции для харнессов 101/102/103/121/122/125 — из `T*_FILE`; для\n"
    "131 — `sample/` в репозитории.\n"
    "\n"
    "## Что 13.1 оставила знать всем беседам\n"
    "\n"
    "- **Разметка документа имеет один источник правды** —\n"
    "  `shared/constants/doc-markup.ts` по разделу «ФОРМАТИРОВАНИЕ» промпта;\n"
    "  новый тег или класс появляется ТОЛЬКО там и в промпте одновременно\n"
    "  (сторож 2at красит расхождение). Любая новая точка записи HTML в\n"
    "  `sections.html_content`/`capsule_html`/`mode_results`/снимки — через\n"
    "  `sanitizeSectionHtml` (или `cleanModelHtml` для ответа модели), и\n"
    "  счётчик в сторож 4be-б.\n"
    "- **CSP в трёх копиях дословно** (`server/security-headers.ts`,\n"
    "  `client/vite.config.ts`, Caddy в `deploy/philosynth-hosting.md`); новый\n"
    "  внешний скрипт — во все три и в сторож 4be-в. `vite dev` под CSP не\n"
    "  стоит — браузерные проверки на сборке.\n"
    "- **Форма правки подраздела двухвидовая**: поле `textarea[data-subsection-\n"
    "  source]` в rich — скрытое зеркало; харнесс, которому нужно поле, кликает\n"
    "  `button[data-subsection-action=\"view-markup\"]`. Редактор — чистые\n"
    "  функции `subsection-rich-editor.ts`; сравнение «сервер ≡ зеркалу»\n"
    "  (`readSubsectionSource` против поля) — обязательная проверка.\n"
    "- **Предупреждения чистки — русские** (в `parseWarnings` с префиксом и в\n"
    "  `warnings` ответов); перевод — Фаза 14 (Д-60), модули — в `skip`\n"
    "  описи i18n.\n",
    "O2 NEXT-CONTEXT: ближайшая 13.2 и «что оставила»",
)
patch(
    "NEXT-CONTEXT.md",
    "## Комплект ближайшей беседы — 13.1 (безопасность входящего HTML и полнотекстовая правка: бэкенд + клиент) — ПЕРВЫЙ ЗАПРОС ИСПОЛНЕН 2026-10-14\n",
    "## Комплект беседы — 13.1 (безопасность входящего HTML и полнотекстовая правка: бэкенд + клиент) — ИСПОЛНЕН, беседа закрыта 2026-10-20\n",
    "O3 NEXT-CONTEXT: комплект 13.1 закрыт",
    marker="ИСПОЛНЕН, беседа закрыта 2026-10-20",
)

print(f"\nитог: ok {applied}, skip {skipped}, fail {failed}")
sys.exit(1 if failed else 0)
