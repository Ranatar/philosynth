/**
 * Порт colorizeLog(text) [philosynth.html 23733–24087] — раскраска
 * plain-текста лога контекста в HTML (инлайн-стили, как в исходнике).
 * Беседа 2.4.
 *
 * РАЗМЕЩЕНИЕ (отступление от карты, зафиксировать патчем доков):
 * 04 §3 и 05 кладут colorizeLog на клиент (client/components/logs/
 * colorize-log.ts), но 07 (беседа 2.4, п.1) требует, чтобы СЕРВЕРНЫЙ
 * formatCtxLogHTML возвращал { text, html } — т.е. раскраска нужна и
 * серверу (GET /logs/formatted), и клиенту. Чтобы не дублировать ~150
 * строк паттернов, реализация живёт здесь (shared), а
 * client/components/logs/colorize-log.ts — тонкий реэкспорт
 * (соответствие карте без дублирования — паттерн
 * extractIntraSectionContext, 04 §2.1).
 *
 * Логика — дословный порт; правила «НОВЫЕ ПРАВИЛА» (ТЗ tz_budget_mode
 * 4.8.3) сохранены: «Контекст родителей» золотым, «Режим бюджета …:
 * полный» янтарным, «(сжат родителями на N)» приглушённым,
 * «⚠ … отсутствует обязательное поле» красным, «Опущено: …» мелким
 * серым, «↻ МИГРАЦИЯ СХЕМЫ» фиолетовым.
 */

export function colorizeLog(text: string): string {
  const e = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // ── Цветовая палитра (из старой formatCtxLogHTML) ──
  const C = {
    gold: "#d4a017",
    blue: "#7ba7e8",
    green: "#4db87a",
    red: "#e06060",
    dim: "#888888",
    dimmer: "#777777",
    muted: "#555555",
    label: "#aaa",
    violet: "#9b59b6",
  };

  // ── Хелперы инлайн-раскраски ──

  /** Раскрашивает числа с единицами: "12 345 симв.", "1 024 ток." */
  function colorNums(s: string, color: string): string {
    return s.replace(
      /([\d\s,.]+)\s*(симв\.|ток(?:енов)?)/g,
      '<span style="color:' + color + '">$1 $2</span>',
    );
  }

  /** Раскрашивает процент: "(85%)" */
  function colorPct(s: string): string {
    return s.replace(
      /\((\d+)%\)/g,
      '<span style="color:' + C.dim + '">($1%)</span>',
    );
  }

  /** Раскрашивает соотношение с/т: "(3.2 с/т)" */
  function colorRatio(s: string): string {
    return s.replace(
      /\(([\d.]+)\s*с\/т\)/g,
      '<span style="color:' + C.dim + '">($1 с/т)</span>',
    );
  }

  /** Раскрашивает стоимость: "$0.0234", "2.34¢" */
  function colorCost(s: string): string {
    s = s.replace(
      /(\$[\d.,]+)/g,
      '<span style="color:' + C.gold + ';font-weight:600">$1</span>',
    );
    s = s.replace(
      /([\d.,]+¢)/g,
      '<span style="color:' + C.gold + '">$1</span>',
    );
    return s;
  }

  /** Раскрашивает "→ 1 234 токенов" */
  function colorArrow(s: string, color: string): string {
    return s.replace(
      /(→)\s*([\d\s,.]+)\s*(ток(?:енов)?)/g,
      '$1 <span style="color:' + color + ';font-weight:600">$2 $3</span>',
    );
  }

  return e(text)
    .split("\n")
    .map((l) => {
      // ════ ПОЛНОСТРОЧНЫЕ ПАТТЕРНЫ (возвращают сразу) ════

      // ═══ Заголовки разделов ═══  (включая ═══ ИТОГО ═══)
      if (/^═{3,}\s.+\s═{3,}$/.test(l))
        return (
          '<span style="color:' + C.gold + ';font-weight:600">' + l + "</span>"
        );

      // Линии-разделители
      if (/^[═]{10,}$/.test(l))
        return (
          '<span style="color:' + C.gold + ';font-weight:600">' + l + "</span>"
        );
      if (/^[─]{10,}$/.test(l))
        return '<span style="color:' + C.muted + '">' + l + "</span>";

      // Шапка документа "PHILOSYNTH PRO — ЛОГ КОНТЕКСТА И ГЕНЕРАЦИИ"
      if (/^PHILOSYNTH PRO/.test(l))
        return (
          '<span style="color:' + C.gold + ';font-weight:700">' + l + "</span>"
        );

      // "Текущая версия: vN"
      if (/^Текущая версия:/.test(l)) {
        return l.replace(
          /(v\d+)/,
          '<span style="color:' + C.gold + ';font-weight:600">$1</span>',
        );
      }

      // Маркер версии: "  ВЕРСИЯ v2  ·  01.04.2026, 14:30"
      // Золотой для "ВЕРСИЯ vN", приглушённый для " · дата"
      if (/ВЕРСИЯ\s+v\d/.test(l)) {
        return l.replace(
          /^(\s*ВЕРСИЯ\s+v\d+)(.*)?$/,
          '<span style="color:' +
            C.gold +
            ';font-weight:700;font-size:13px">$1</span>' +
            '<span style="color:' +
            C.dim +
            '">$2</span>',
        );
      }

      // Маркер удаления: "  ✗ УДАЛЁН: § 2 — Историческая справка  ·  дата"
      if (/УДАЛЁН:/.test(l)) {
        l = l.replace(
          /(✗|✘)/,
          '<span style="color:' + C.red + '">$1</span>',
        );
        l = l.replace(
          /(УДАЛЁН:)/,
          '<span style="color:' + C.red + ';font-weight:600">$1</span>',
        );
        l = l.replace(
          /(·\s*.+)$/,
          '<span style="color:' + C.dim + '">$1</span>',
        );
        return l;
      }

      // Ошибки (полная строка с ⚠)
      if (/⚠\s*ОШИБКА/.test(l))
        return (
          '<span style="color:' + C.red + ';font-weight:600">' + l + "</span>"
        );

      // Действия в маркерах версии
      if (/^\s*Перегенерировано:/.test(l))
        return l.replace(
          /^(\s*Перегенерировано:)/,
          '<span style="color:' + C.blue + '">$1</span>',
        );
      if (/^\s*Удалено:/.test(l))
        return l.replace(
          /^(\s*Удалено:)/,
          '<span style="color:' + C.red + '">$1</span>',
        );
      if (/^\s*Добавлено:/.test(l))
        return l.replace(
          /^(\s*Добавлено:)/,
          '<span style="color:' + C.green + '">$1</span>',
        );

      // "— (первый раздел)"
      if (/—\s*\(первый раздел\)/.test(l))
        return '<span style="color:' + C.dim + '">' + l + "</span>";

      // ════ БЛОЧНЫЕ МЕТКИ ════

      // "ОБЩИЕ ЭЛЕМЕНТЫ ПРОМПТА (одинаковы для всех запросов):"
      // Заголовок #aaa, скобочная часть #888888 — как в оригинале
      if (/^ОБЩИЕ ЭЛЕМЕНТЫ ПРОМПТА/.test(l)) {
        return l.replace(
          /^(ОБЩИЕ ЭЛЕМЕНТЫ ПРОМПТА)(\s*\([^)]*\))?(:?)/,
          '<span style="color:' +
            C.label +
            ';font-weight:500">$1</span>' +
            '<span style="color:' +
            C.dim +
            '">$2$3</span>',
        );
      }

      // "ВХОД:" / "ВЫХОД:" / "  СЕКЦИИ:"
      // Обёртка \s* позволяет поймать "  СЕКЦИИ:" с отступом
      if (/^\s*(ВХОД|ВЫХОД|СЕКЦИИ):/.test(l)) {
        l = l.replace(
          /^(\s*)(ВХОД:|ВЫХОД:|СЕКЦИИ:)/,
          '$1<span style="color:' + C.label + ';font-weight:500">$2</span>',
        );

        // Если ВЫХОД содержит числа — раскрасить inline
        if (/ВЫХОД/.test(l)) {
          if (/⟳/.test(l)) {
            // Streaming: "ВЫХОД: 123 симв. ⟳ генерация..."
            l = colorNums(l, C.blue);
            l = l.replace(
              /(⟳\s*генерация\.{0,3})/g,
              '<span style="color:' + C.blue + '">$1</span>',
            );
          } else {
            // Done: числа зелёные (когда на той же строке, теоретически)
            l = colorNums(l, C.green);
            l = colorArrow(l, C.green);
            l = colorRatio(l);
          }
        }

        return l;
      }

      // ════ СТРОКИ С ЧИСЛОВЫМИ ДАННЫМИ ════

      // "  Системный промпт / Параметры синтеза / ..." — в блоке ОБЩИЕ, цвет синий
      if (
        /^\s{2}(Системный промпт|Параметры синтеза|Правила форматирования|Требования к качеству|Служебный каркас)/.test(
          l,
        )
      ) {
        return colorNums(l, C.blue);
      }

      // "  Общие элементы   N симв." — в блоке ВХОД, цвет приглушённый (#888888)
      if (/^\s{2}Общие элементы\s/.test(l)) {
        return colorNums(l, C.dim);
      }

      // "  Контекст пред. разделов    5 678 симв."
      if (/^\s{2}Контекст пред\. разделов/.test(l)) {
        return colorNums(l, C.gold);
      }

      // "  Задание секции              1 234 симв."
      if (/^\s{2}Задание секции/.test(l)) {
        return colorNums(l, C.blue);
      }

      // "                       ИТОГО  12 345 симв. → 4 567 токенов (3.1 с/т)"
      if (/ИТОГО/.test(l)) {
        l = l.replace(/(ИТОГО)/, '<span style="font-weight:600">$1</span>');
        l = colorNums(l, C.blue);
        l = colorArrow(l, C.blue);
        l = colorRatio(l);
        return l;
      }

      // "  Стоимость: $0.0234 (2.34¢)"  — с отступом, внутри блока секции
      if (/^\s{2}Стоимость:/.test(l)) {
        return colorCost(l);
      }

      // "  1 234 симв. → 567 токенов (3.1 с/т)" — строка выхода без метки ВЫХОД
      if (/^\s{2}\d/.test(l) && /симв\./.test(l) && /ток/.test(l)) {
        l = colorNums(l, C.green);
        l = colorArrow(l, C.green);
        l = colorRatio(l);
        return l;
      }

      // ════ БЮДЖЕТ И КОНТЕКСТ ════

      // "    Бюджет: 48 000 симв., использовано: 32 000 (67%)"
      if (/^\s{4}Бюджет:/.test(l)) {
        l = colorNums(l, C.dim);
        l = colorPct(l);
        return '<span style="color:' + C.dim + '">' + l + "</span>";
      }

      // "    Обязательный:" / "    Опциональный:"
      if (/^\s{4}(Обязательный|Опциональный):/.test(l)) {
        return '<span style="color:' + C.dim + '">' + l + "</span>";
      }

      // ════ ЗАПИСИ КОНТЕКСТА (с ✓ ✗ ◦ ◌) — отступ 6 пробелов ════

      // "      ✓ Граф → Таблица категорий        1 234 симв."
      if (/^\s{6}✓/.test(l)) {
        l = l.replace(/✓/, '<span style="color:' + C.green + '">✓</span>');
        l = colorNums(l, C.green);
        l = l.replace(
          /(\[замена\])/g,
          '<span style="color:' + C.violet + ';font-size:9px">$1</span>',
        );
        return l;
      }

      // "      ✗ ... утрачён [...] / НЕ НАЙДЕН / не найден"
      if (/^\s{6}✗/.test(l)) {
        l = l.replace(/✗/, '<span style="color:' + C.red + '">✗</span>');
        l = l.replace(
          /(НЕ НАЙДЕН)/g,
          '<span style="color:' + C.red + ';font-weight:600">$1</span>',
        );
        l = l.replace(
          /(утрачён)/g,
          '<span style="color:' + C.red + '">$1</span>',
        );
        l = l.replace(
          /(не найден)/g,
          '<span style="color:' + C.dim + '">$1</span>',
        );
        l = l.replace(
          /\[([^\]]*)\]/g,
          '<span style="color:' + C.dimmer + '">[$1]</span>',
        );
        return l;
      }

      // "      ◦ ... 1 234 симв. [обрезан с 5000 до 3000]"
      if (/^\s{6}◦/.test(l)) {
        l = l.replace(/◦/, '<span style="color:' + C.gold + '">◦</span>');
        l = colorNums(l, C.gold);
        l = l.replace(
          /(\[замена\])/g,
          '<span style="color:' + C.violet + ';font-size:9px">$1</span>',
        );
        l = l.replace(
          /\[([^\]]*)\]/g,
          '<span style="color:' + C.dim + '">[$1]</span>',
        );
        return l;
      }

      // "      ◌ ... пропущен [бюджет исчерпан]"
      if (/^\s{6}◌/.test(l)) {
        l = l.replace(/◌/, '<span style="color:' + C.dim + '">◌</span>');
        l = l.replace(
          /(пропущен)/g,
          '<span style="color:' + C.dim + '">$1</span>',
        );
        l = l.replace(
          /\[([^\]]*)\]/g,
          '<span style="color:' + C.dimmer + '">[$1]</span>',
        );
        return l;
      }

      // ════ СЕКЦИИ (подразделы) — отступ 4 пробела ════

      // "    ✓ Таблица категорий                     1 234 симв."
      if (/^\s{4}✓/.test(l)) {
        l = l.replace(/✓/, '<span style="color:' + C.green + '">✓</span>');
        l = colorNums(l, C.green);
        return l;
      }

      // "    ⟳ Таблица связей                        567 симв.  генерация"
      if (/^\s{4}⟳/.test(l)) {
        l = l.replace(/⟳/, '<span style="color:' + C.blue + '">⟳</span>');
        l = colorNums(l, C.blue);
        l = l.replace(
          /(генерация)/g,
          '<span style="color:' + C.blue + ';font-size:9px">$1</span>',
        );
        return l;
      }

      // "    ◌ Топология графа                       —"
      if (/^\s{4}◌/.test(l)) {
        l = l.replace(/◌/, '<span style="color:' + C.muted + '">◌</span>');
        l = l.replace(/(—)/, '<span style="color:' + C.muted + '">$1</span>');
        return l;
      }

      // ════ ИТОГИ ════

      // "Разделов: 5 из 8"
      if (/^Разделов:/.test(l)) {
        if (/⟳/.test(l)) {
          l = l.replace(
            /(⟳\s*генерация\.{0,3})/g,
            '<span style="color:' + C.blue + '">$1</span>',
          );
        }
        return l;
      }

      // "Вход:  12 345 симв. → 4 567 токенов"
      if (/^Вход:/.test(l)) {
        l = colorNums(l, C.blue);
        l = colorArrow(l, C.blue);
        return l;
      }

      // "Выход: 8 000 симв. → 2 345 токенов"
      if (/^Выход:/.test(l)) {
        l = colorNums(l, C.green);
        l = colorArrow(l, C.green);
        return l;
      }

      // "Стоимость: $0.1234 (12.34¢)"  — без отступа, итоговая строка
      if (/^Стоимость:/.test(l)) {
        return colorCost(l);
      }

      // ════ НОВЫЕ ПРАВИЛА (ТЗ tz_budget_mode 4.8.3) ════
      // «Контекст родителей» (строка в «Общих элементах» или в «ВХОД»)
      if (/Контекст родителей/.test(l)) {
        l = colorNums(l, C.gold);
        return l;
      }
      // «Режим бюджета секций: полный» — янтарный акцент
      if (/Режим бюджета (секций|): полный/.test(l)) {
        l = l.replace(
          /(полный[^$]*)/,
          '<span style="color:' + C.gold + ';font-weight:600">$1</span>',
        );
        return l;
      }
      // «(сжат родителями на N)» — приглушённый
      if (/\(сжат родителями на/.test(l)) {
        l = colorNums(l, C.gold);
        l = l.replace(
          /\(сжат родителями на ([\d\s,.]+)\)/,
          '<span style="color:' + C.dim + '">(сжат родителями на $1)</span>',
        );
        return l;
      }
      // «⚠ отсутствует обязательное поле» — красный
      if (/⚠[^$]*отсутствует обязательное поле/.test(l)) {
        l = l.replace(/⚠/, '<span style="color:' + C.red + '">⚠</span>');
        l = l.replace(
          /(отсутствует обязательное поле[^$]*)/,
          '<span style="color:' + C.red + '">$1</span>',
        );
        return l;
      }
      // «Опущено: ...» — мелкий серый
      if (/^\s{4}Опущено:/.test(l)) {
        return (
          '<span style="color:' + C.dim + ';font-size:10px">' + l + "</span>"
        );
      }
      // «↻  МИГРАЦИЯ СХЕМЫ» — фиолетовый
      if (/↻\s+МИГРАЦИЯ СХЕМЫ/.test(l)) {
        l = l.replace(/↻/, '<span style="color:' + C.violet + '">↻</span>');
        l = l.replace(
          /(МИГРАЦИЯ СХЕМЫ)/,
          '<span style="color:' + C.violet + ';font-weight:600">$1</span>',
        );
        return l;
      }

      // ════ FALLBACK: минимальная раскраска ════
      l = colorCost(l);
      l = l.replace(
        /(\[замена\])/g,
        '<span style="color:' + C.violet + ';font-size:9px">$1</span>',
      );

      return l;
    })
    .join("\n");
}
