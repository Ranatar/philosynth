// Фрагмент philosynth.html (26025 строк) — собран
// scripts/extract-by-name.py по спецификации 2.4-logs.spec.
//
// Номера строк ниже — РЕЗУЛЬТАТ поиска по именам, а не входные
// данные: при правке исходника достаточно перезапустить сборку,
// спецификация не устаревает. Имена берутся из
// docs/04-code-reuse-map.md.

// ───── Форматирование лога (server/services/log-formatter.ts) · js:formatCtxLog
// philosynth.html строки 23318–23727 ─────

        function formatCtxLog() {
          if (genLog.length === 0 && ctxLog.length === 0)
            return "Лог пуст. Сгенерируйте документ.";
        
          const num = n => (n == null ? "—" : n.toLocaleString("ru"));
          const lines = [];
          lines.push("PHILOSYNTH PRO — ЛОГ КОНТЕКСТА И ГЕНЕРАЦИИ");
          lines.push("Дата: " + new Date().toLocaleString("ru-RU"));
          const verStr = formatVersion(DOC_STATE.docVersion);
          if (verStr !== "v1") {
            lines.push("Текущая версия: " + verStr);
          }
          lines.push("═".repeat(70));
        
          // --- Общие элементы промпта (с разбивкой родительского контекста) ---
          if (genCommon) {
            lines.push("");
            lines.push("ОБЩИЕ ЭЛЕМЕНТЫ ПРОМПТА:");
            lines.push("  Системный промпт          " + num(genCommon.sysChars).padStart(7) + " симв.  (одинаков для всех)");
            if (genCommon.rulesChars > 0) {
              lines.push("  Правила форматирования    " + num(genCommon.rulesChars).padStart(7) + " симв.");
              lines.push("  Требования к качеству     " + num(genCommon.qualityChars).padStart(7) + " симв.");
            } else if (genCommon.qualityChars > 0) {
              lines.push("  (вкл. форматирование в системном промпте)");
              lines.push("  Требования к качеству     " + num(genCommon.qualityChars).padStart(7) + " симв.");
            } else {
              lines.push("  (вкл. форматирование и требования к качеству)");
            }
            // Новый формат: статическая часть + родители отдельно
            const _hasParents = (genCommon.totalConceptOverhead || 0) > 0 ||
                                (genCommon.parentSpecBySection && Object.keys(genCommon.parentSpecBySection).length > 0);
            if (_hasParents && typeof genCommon.baseCharsWithoutConcepts === "number") {
              lines.push("  Параметры синтеза (статика)" + num(genCommon.baseCharsWithoutConcepts).padStart(7) + " симв.  (одинаковы для всех)");
              const specMap = genCommon.parentSpecBySection || {};
              const keysForSpec = Object.keys(specMap).filter(k => specMap[k]);
              if (keysForSpec.length > 0) {
                lines.push("  Контекст родителей (варьируется по разделам):");
                let totalSum = 0, maxSum = 0, maxKey = "";
                for (const sk of keysForSpec) {
                  const spec = specMap[sk];
                  const firstKey = String(sk).split("+")[0].split(":")[0];
                  const label = (KEY_LABELS[firstKey] || firstKey).padEnd(10);
                  const fieldsUsed = (spec.perParent[0] && spec.perParent[0].includedFields) || [];
                  lines.push("    " + label + num(spec.totalChars).padStart(7) +
                    " симв.  (" + fieldsUsed.join(", ") + ")");
                  totalSum += spec.totalChars;
                  if (spec.totalChars > maxSum) { maxSum = spec.totalChars; maxKey = firstKey; }
                }
                const avg = Math.round(totalSum / Math.max(keysForSpec.length, 1));
                lines.push("    Средний вес:     " + num(avg).padStart(7) + " симв.   Максимум: " +
                  num(maxSum) + " (" + (KEY_LABELS[maxKey] || maxKey) + ")");
              } else {
                lines.push("  Контекст родителей (монолит): " + num(genCommon.totalConceptOverhead || 0) + " симв.");
              }
              // Per-parent breakdown (ТЗ tz_budget_mode 2.2.А) — полный вес каждого родителя
              const cbs = genCommon.conceptBlockSizes || [];
              if (cbs.length > 0) {
                const totalCbs = cbs.reduce((s, x) => s + (x.chars || 0), 0);
                lines.push("  Участники (полный вес, для справки):");
                for (const pp of cbs) {
                  const nm = ("«" + pp.name + "»").padEnd(40);
                  lines.push("    " + nm + num(pp.chars).padStart(7) + " симв.");
                }
                lines.push("    " + "Σ всего полного веса".padEnd(40) +
                  num(totalCbs).padStart(7) + " симв. (" + cbs.length + " концепции)");
              }
            } else {
              lines.push("  Параметры синтеза          " + num(genCommon.baseChars).padStart(7) + " симв.  (одинаковы для всех)");
            }
            lines.push("  Служебный каркас          " + num(genCommon.scaffoldChars).padStart(7) + " симв.");
            if (_hasParents) {
              const modeLabel = (genCommon.budgetMode === 'full')
                ? "полный (без ужимания)"
                : "ужатый (под давлением родителей)";
              lines.push("  Режим бюджета секций:     " + modeLabel);
            }
            lines.push("─".repeat(70));
          }
        
          const ctxByKey = {};
          for (const pass of ctxLog) ctxByKey[pass.sectionKey] = pass;
        
          for (const g of genLog) {

            // ── Маркер версии ──
            if (g.type === "version-marker") {
              lines.push("");
              lines.push("═".repeat(70));
              const dt = g.timestamp
                ? new Date(g.timestamp).toLocaleString("ru-RU")
                : "";
              const gv = typeof g.version === "string" ? g.version : formatVersion(g.version);
              lines.push("  ВЕРСИЯ " + gv + (dt ? "  ·  " + dt : ""));
              const acts = g.actions || {};
              if (acts.regen?.length) lines.push("  Перегенерировано: " + acts.regen.join(", "));
              if (acts.remove?.length) lines.push("  Удалено: " + acts.remove.join(", "));
              if (acts.add?.length) lines.push("  Добавлено: " + acts.add.join(", "));
              lines.push("═".repeat(70));
              continue;
            }

            // ── Маркер паузы ──
            if (g.type === "pause-marker") {
              const dt = g.timestamp
                ? new Date(g.timestamp).toLocaleString("ru-RU")
                : "";
              const kindLabel = {
                "auth": "Ошибка авторизации",
                "billing": "Баланс API исчерпан",
                "pre-stream": "Ошибка сети",
                "partial": "Обрыв стрима",
                "stuck": "Таймаут (стрим завис)",
                "max-tokens": "Превышен лимит max_tokens" +
                  (g.maxTokensUsed ? " (" + g.maxTokensUsed.toLocaleString("ru") + ")" : ""),
                "user-abort": "Остановка пользователем",
                "context-error": "Ошибка построения контекста",
              }[g.reasonKind] || g.reasonKind;
              lines.push("");
              lines.push("─".repeat(70));
              lines.push("  ⏸  ПАУЗА" + (dt ? "  ·  " + dt : ""));
              lines.push("    Раздел: " + (g.sectionLabel || "?"));
              lines.push("    Причина: " + kindLabel);
              if (g.reason) lines.push("    Детали: " + g.reason);
              if (g.isPartial) lines.push("    Частичное содержимое сохранено");
              lines.push("─".repeat(70));
              continue;
            }

            // ── Маркер возобновления ──
            if (g.type === "resume-marker") {
              const dt = g.timestamp
                ? new Date(g.timestamp).toLocaleString("ru-RU")
                : "";
              const modeLabel = {
                "retry": "Перегенерация раздела",
                "skip": "Пропуск раздела",
                "stop": "Остановка с сохранением",
                "fill-missing-subs": "Догенерация недостающих подразделов",
              }[g.mode] || g.mode;
              lines.push("");
              lines.push("─".repeat(70));
              lines.push("  ▶  ВОЗОБНОВЛЕНИЕ" + (dt ? "  ·  " + dt : ""));
              lines.push("    Действие: " + modeLabel);
              if (g.sectionLabel) lines.push("    Раздел: " + g.sectionLabel);
              if (g.opDescription) lines.push("    Шаг плана: " + g.opDescription);
              lines.push("─".repeat(70));
              continue;
            }

            // ── Маркер действия пользователя ──
            if (g.type === "user-action-marker") {
              const dt = g.timestamp
                ? new Date(g.timestamp).toLocaleString("ru-RU")
                : "";
              const actionLabel = {
                "abort": "Остановлена текущая генерация",
                "api-key-updated": "Обновлён API-ключ",
              }[g.action] || g.action;
              lines.push("");
              lines.push("─".repeat(70));
              lines.push("  👤  ДЕЙСТВИЕ ПОЛЬЗОВАТЕЛЯ" + (dt ? "  ·  " + dt : ""));
              lines.push("    " + actionLabel);
              lines.push("─".repeat(70));
              continue;
            }

            // ── Маркер миграции схемы (ТЗ selective-parent-context 10.2) ──
            if (g.type === "schema-migration-marker") {
              const dt = g.timestamp
                ? new Date(g.timestamp).toLocaleString("ru-RU")
                : "";
              lines.push("");
              lines.push("─".repeat(70));
              lines.push("  ↻  МИГРАЦИЯ СХЕМЫ" + (dt ? "  ·  " + dt : ""));
              lines.push("    " + (g.fromSchema || "?") + " → " + (g.toSchema || "?"));
              if (g.sectionLabel) {
                lines.push("    при перегенерации раздела: " + g.sectionLabel);
              }
              lines.push("─".repeat(70));
              continue;
            }

            // ── Маркер удаления ──
            if (g.type === "deletion-marker") {
              lines.push("");
              lines.push("─".repeat(70));
              const dt = g.timestamp
                ? new Date(g.timestamp).toLocaleString("ru-RU")
                : "";
              lines.push("  ✗ УДАЛЁН: § " + (g.sectionNum || "?") +
                " — " + g.sectionLabel + (dt ? "  ·  " + dt : ""));
              lines.push("─".repeat(70));
              continue;
            }

            const keys = g.sectionKey.split("+");
        
            lines.push("");
            lines.push("═══ " + g.sectionLabel.toUpperCase() + " ═══");
        
            // --- Состав входа ---
            lines.push("");
            lines.push("ВХОД:");
            const isMode = g.sectionKey?.startsWith("mode:");
            const commonChars = isMode
              ? (genCommon?.sysChars || 0)
              : (genCommon ? genCommon.totalChars : 0);

            // Если в записи genEntry есть per-section parentOverhead — показываем
            // статику отдельно от родителей. Иначе — legacy-одиночная строка.
            const _parentOv = (typeof g.parentOverheadChars === "number")
              ? g.parentOverheadChars : null;
            const _fieldsUsed = Array.isArray(g.parentFieldsUsed) ? g.parentFieldsUsed : null;
            if (!isMode && _parentOv !== null && genCommon && typeof genCommon.baseCharsWithoutConcepts === "number") {
              // Общие = sys + qualRules + статика + скаффолд (без родителей)
              const staticCommon = genCommon.sysChars + (genCommon.qualityChars || 0) +
                (genCommon.baseCharsWithoutConcepts || 0) + (genCommon.scaffoldChars || 0) +
                (genCommon.rulesChars || 0);
              lines.push("  Общие элементы             " + num(staticCommon).padStart(7) + " симв.");
              lines.push("  Контекст родителей         " + num(_parentOv).padStart(7) + " симв." +
                (_fieldsUsed && _fieldsUsed.length ? "  (" + _fieldsUsed.join(", ") + ")" : ""));
              // Опущенные поля + предупреждения — из parentSpec в ctxLog
              const _ctxForSpec = ctxByKey[g.sectionKey] || (keys.length ? ctxByKey[keys[0]] : null);
              const _pspec = _ctxForSpec && _ctxForSpec.parentSpec;
              if (_pspec && Array.isArray(_pspec.perParent) && _pspec.perParent.length > 0) {
                // Опущенные поля: берём из первого родителя (они одинаковы для всех при per-section)
                const _omitted = _pspec.perParent[0].omittedFields || [];
                if (_omitted.length > 0) {
                  lines.push("    Опущено: " + _omitted.join(", "));
                }
                // Предупреждения о missingRequired (по каждому родителю)
                for (const pp of _pspec.perParent) {
                  if (pp.missingRequired && pp.missingRequired.length > 0) {
                    lines.push("    ⚠ «" + pp.name + "»: отсутствует обязательное поле: " +
                      pp.missingRequired.join(", "));
                  }
                }
              }
              if (g.budgetMode && (g.budgetMode === 'full')) {
                lines.push("  Режим бюджета: полный (без ужимания)");
              }
            } else {
              lines.push("  Общие элементы             " + num(commonChars).padStart(7) + " симв.");
            }
        
            if (g.priorChars > 0) {
              lines.push("  Контекст пред. разделов   " + num(g.priorChars).padStart(7) + " симв.");
        
              for (const k of keys) {
                const ctx = ctxByKey[k];
                if (!ctx) continue;
        
                if (ctx.type === "intra-section") {
                  const parentKey = k.split(":")[0];
                  const parentLabel = KEY_LABELS[parentKey] || parentKey;
                  lines.push("    Контекст подразделов «" + parentLabel + "»: " + num(ctx.totalUsed) + " симв.");
                } else {
                  const _raw = ctx.rawBaseBudget || 0;
                  const _applied = ctx.conceptOverheadApplied || 0;
                  const _usedPct = Math.round(ctx.totalUsed / Math.max(ctx.budget, 1) * 100);
                  if (_raw && _applied > 0) {
                    lines.push("    Бюджет: " + num(ctx.budget) + " из " + num(_raw) + " симв. " +
                      "(сжат родителями на " + num(_applied) + "), " +
                      "использовано: " + num(ctx.totalUsed) + " (" + _usedPct + "%)");
                  } else if (_raw && ctx.budgetMode === 'full') {
                    lines.push("    Бюджет: " + num(ctx.budget) + " симв. (полный, без ужимания), " +
                      "использовано: " + num(ctx.totalUsed) + " (" + _usedPct + "%)");
                  } else {
                    lines.push("    Бюджет: " + num(ctx.budget) + " симв., " +
                      "использовано: " + num(ctx.totalUsed) + " (" + _usedPct + "%)");
                  }
                }
        
                const reqEntries = ctx.entries.filter(e => e.priority === "required");
                if (reqEntries.length) {
                  lines.push("    Обязательный:");
                  for (const e of reqEntries) {
                    const intraSec = k.split(":")[0]; const lbl = (CTX_LABELS[e.key] || (e.key.startsWith("intra:") ? (KEY_LABELS[intraSec] || intraSec) + " → " + e.key.slice(6) : e.key)).padEnd(42);
                    if (e.status === "found") {
                        const subMark = e.isSubstitute ? " [замена]" : "";
                        lines.push("      ✓ " + lbl + num(e.len).padStart(7) + " симв." + subMark);
                    } else if (e.status === "dropped") {
                      lines.push("      ✗ " + lbl + "утрачён [" + (e.note || "") + "]");
                    } else {
                      lines.push("      ✗ " + lbl + "НЕ НАЙДЕН");
                    }
                  }
                }
        
                const optEntries = ctx.entries.filter(e => e.priority === "optional");
                if (optEntries.length) {
                  lines.push("    Опциональный:");
                  for (const e of optEntries) {
                    const intraSec = k.split(":")[0]; const lbl = (CTX_LABELS[e.key] || (e.key.startsWith("intra:") ? (KEY_LABELS[intraSec] || intraSec) + " → " + e.key.slice(6) : e.key)).padEnd(42);
                    if (e.status === "found") {
                      const subMark = e.isSubstitute ? " [замена]" : "";
                      lines.push("      ✓ " + lbl + num(e.len).padStart(7) + " симв." + subMark);
                    } else if (e.status === "truncated") {
                      lines.push("      ◦ " + lbl + num(e.len).padStart(7) + " симв. [" + (e.note || "") + "]");
                    } else if (e.status === "skipped_budget") {
                      lines.push("      ◌ " + lbl + "пропущен [" + (e.note || "бюджет исчерпан") + "]");
                    } else if (e.status === "dropped") {
                      lines.push("      ✗ " + lbl + "утрачён [" + (e.note || "") + "]");
                    } else {
                      lines.push("      ✗ " + lbl + "не найден");
                    }
                  }
                }
              }
            } else {
              lines.push("  Контекст пред. разделов           — (первый раздел)");
            }

            // ── Дополнительные метаданные перегенерации ──
            if (g.hasCurrentContent) {
              lines.push("  Текущее содержимое подраздела " + num(g.currentContentChars).padStart(7) + " симв. [включено]");
            }
            if (g.secCtxChars > 0) {
              lines.push("  Доп. контекст раздела      " + num(g.secCtxChars).padStart(7) + " симв.");
              if (g.secCtxPreview) {
                lines.push("    «" + g.secCtxPreview + "»");
              }
            }
            if (g.ctxChars > 0 && isMode) {
              lines.push("  Контекст режима            " + num(g.ctxChars).padStart(7) + " симв.");
            }
        
            lines.push("  Задание секции             " + num(g.taskChars).padStart(7) + " симв.");
            lines.push("                       ИТОГО " + num(g.inputChars).padStart(7) + " симв. → " +
              num(g.inputTokens) + " токенов" +
              (g.inputChars > 0 && g.inputTokens > 0
                ? " (" + (g.inputChars / g.inputTokens).toFixed(1) + " с/т)"
                : ""));
        
            // --- Выход ---
            lines.push("");
            if (g.status === "streaming") {
              lines.push("ВЫХОД: " + num(g.outputChars) + " симв. ⟳ генерация...");
            } else if (g.status === "error") {
              lines.push("ВЫХОД: ⚠ ОШИБКА: " + g.error);
            } else {
              lines.push("ВЫХОД:");
              lines.push("  " + num(g.outputChars) + " симв. → " +
                num(g.outputTokens) + " токенов" +
                (g.outputChars > 0 && g.outputTokens > 0
                  ? " (" + (g.outputChars / g.outputTokens).toFixed(1) + " с/т)"
                  : ""));
              lines.push("  Стоимость: $" + g.cost.toFixed(4) +
                " (" + (g.cost * 100).toFixed(2) + "¢)");
              if (g.error) {
                lines.push("  ⚠ ОШИБКА: " + g.error);
              }
            }
            // Посекционная разбивка (plaintext)
            const subs = g.subsections || [];
            const expected = g.expectedSubsections || [];
            if (expected.length > 0) {
              lines.push("");
              lines.push("  СЕКЦИИ:");

              const foundMap = {};
              for (const s of subs) foundMap[s.name] = s;

              for (const secName of expected) {
                const s = foundMap[secName];
                const lbl = secName.padEnd(42);
                if (s) {
                  if (s.status === "streaming") {
                    lines.push("    ⟳ " + lbl + num(s.chars).padStart(7) + " симв.  генерация");
                  } else {
                    lines.push("    ✓ " + lbl + num(s.chars).padStart(7) + " симв.");
                  }
                } else {
                  lines.push("    ◌ " + lbl + "     —");
                }
              }
            }
            lines.push("─".repeat(70));
          }
        
          // --- Итоги ---
          const doneEntries = genLog.filter(g =>
            g.type !== "version-marker" &&
            g.type !== "deletion-marker" &&
            g.type !== "pause-marker" &&
            g.type !== "resume-marker" &&
            g.type !== "user-action-marker" &&
            g.type !== "schema-migration-marker" &&
            (g.status === "done" || g.status === "error" || !g.status)
          );
          if (doneEntries.length > 0) {
            const t = doneEntries.reduce((a, g) => ({
              inC: a.inC + g.inputChars, outC: a.outC + g.outputChars,
              inT: a.inT + g.inputTokens, outT: a.outT + g.outputTokens,
              cost: a.cost + g.cost,
            }), { inC: 0, outC: 0, inT: 0, outT: 0, cost: 0 });
        
            lines.push("");
            lines.push("═══ ИТОГО ═══");
            lines.push("Разделов: " + doneEntries.length + " из " + genLog.length);
            lines.push("Вход:  " + num(t.inC) + " симв. → " + num(t.inT) + " токенов");
            lines.push("Выход: " + num(t.outC) + " симв. → " + num(t.outT) + " токенов");
            lines.push("Стоимость: $" + t.cost.toFixed(4) +
              " (" + (t.cost * 100).toFixed(2) + "¢)");
            lines.push("═".repeat(70));
          }
        
          return lines.join("\n");
        }

// ───── Форматирование лога (server/services/log-formatter.ts) · js:formatCtxLogHTML
// philosynth.html строки 24090–24095 ─────
      function formatCtxLogHTML() {
        const plain = formatCtxLog();
        if (plain === "Лог пуст. Сгенерируйте документ.")
          return '<span style="color:#8a8278">' + plain + '</span>';
        return colorizeLog(plain);
      }

// ───── Раскраска (client/components/logs/colorize-log.ts) · js:colorizeLog
// philosynth.html строки 23733–24087 ─────
        function colorizeLog(text) {
          const e = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

          // ── Цветовая палитра (из старой formatCtxLogHTML) ──
          const C = {
            gold:      "#d4a017",
            blue:      "#7ba7e8",
            green:     "#4db87a",
            red:       "#e06060",
            dim:       "#888888",
            dimmer:    "#777777",
            muted:     "#555555",
            label:     "#aaa",
            violet:    "#9b59b6",
          };

          // ── Хелперы инлайн-раскраски ──

          /** Раскрашивает числа с единицами: "12 345 симв.", "1 024 ток." */
          function colorNums(s, color) {
            return s.replace(/([\d\s,.]+)\s*(симв\.|ток(?:енов)?)/g,
              '<span style="color:' + color + '">$1 $2</span>');
          }

          /** Раскрашивает процент: "(85%)" */
          function colorPct(s) {
            return s.replace(/\((\d+)%\)/g,
              '<span style="color:' + C.dim + '">($1%)</span>');
          }

          /** Раскрашивает соотношение с/т: "(3.2 с/т)" */
          function colorRatio(s) {
            return s.replace(/\(([\d.]+)\s*с\/т\)/g,
              '<span style="color:' + C.dim + '">($1 с/т)</span>');
          }

          /** Раскрашивает стоимость: "$0.0234", "2.34¢" */
          function colorCost(s) {
            s = s.replace(/(\$[\d.,]+)/g,
              '<span style="color:' + C.gold + ';font-weight:600">$1</span>');
            s = s.replace(/([\d.,]+¢)/g,
              '<span style="color:' + C.gold + '">$1</span>');
            return s;
          }

          /** Раскрашивает "→ 1 234 токенов" */
          function colorArrow(s, color) {
            return s.replace(/(→)\s*([\d\s,.]+)\s*(ток(?:енов)?)/g,
              '$1 <span style="color:' + color + ';font-weight:600">$2 $3</span>');
          }

          return e(text).split("\n").map(l => {

            // ════ ПОЛНОСТРОЧНЫЕ ПАТТЕРНЫ (возвращают сразу) ════

            // ═══ Заголовки разделов ═══  (включая ═══ ИТОГО ═══)
            if (/^═{3,}\s.+\s═{3,}$/.test(l))
              return '<span style="color:' + C.gold + ';font-weight:600">' + l + '</span>';

            // Линии-разделители
            if (/^[═]{10,}$/.test(l))
              return '<span style="color:' + C.gold + ';font-weight:600">' + l + '</span>';
            if (/^[─]{10,}$/.test(l))
              return '<span style="color:' + C.muted + '">' + l + '</span>';

            // Шапка документа "PHILOSYNTH PRO — ЛОГ КОНТЕКСТА И ГЕНЕРАЦИИ"
            if (/^PHILOSYNTH PRO/.test(l))
              return '<span style="color:' + C.gold + ';font-weight:700">' + l + '</span>';

            // "Текущая версия: vN"
            if (/^Текущая версия:/.test(l)) {
              return l.replace(/(v\d+)/,
                '<span style="color:' + C.gold + ';font-weight:600">$1</span>');
            }

            // Маркер версии: "  ВЕРСИЯ v2  ·  01.04.2026, 14:30"
            // Золотой для "ВЕРСИЯ vN", приглушённый для " · дата"
            if (/ВЕРСИЯ\s+v\d/.test(l)) {
              return l.replace(/^(\s*ВЕРСИЯ\s+v\d+)(.*)?$/,
                '<span style="color:' + C.gold + ';font-weight:700;font-size:13px">$1</span>' +
                '<span style="color:' + C.dim + '">$2</span>');
            }

            // Маркер удаления: "  ✗ УДАЛЁН: § 2 — Историческая справка  ·  дата"
            if (/УДАЛЁН:/.test(l)) {
              l = l.replace(/(✗|✘)/,
                '<span style="color:' + C.red + '">$1</span>');
              l = l.replace(/(УДАЛЁН:)/,
                '<span style="color:' + C.red + ';font-weight:600">$1</span>');
              l = l.replace(/(·\s*.+)$/,
                '<span style="color:' + C.dim + '">$1</span>');
              return l;
            }

            // Ошибки (полная строка с ⚠)
            if (/⚠\s*ОШИБКА/.test(l))
              return '<span style="color:' + C.red + ';font-weight:600">' + l + '</span>';

            // Действия в маркерах версии
            if (/^\s*Перегенерировано:/.test(l))
              return l.replace(/^(\s*Перегенерировано:)/,
                '<span style="color:' + C.blue + '">$1</span>');
            if (/^\s*Удалено:/.test(l))
              return l.replace(/^(\s*Удалено:)/,
                '<span style="color:' + C.red + '">$1</span>');
            if (/^\s*Добавлено:/.test(l))
              return l.replace(/^(\s*Добавлено:)/,
                '<span style="color:' + C.green + '">$1</span>');

            // "— (первый раздел)"
            if (/—\s*\(первый раздел\)/.test(l))
              return '<span style="color:' + C.dim + '">' + l + '</span>';

            // ════ БЛОЧНЫЕ МЕТКИ ════

            // "ОБЩИЕ ЭЛЕМЕНТЫ ПРОМПТА (одинаковы для всех запросов):"
            // Заголовок #aaa, скобочная часть #888888 — как в оригинале
            if (/^ОБЩИЕ ЭЛЕМЕНТЫ ПРОМПТА/.test(l)) {
              return l.replace(
                /^(ОБЩИЕ ЭЛЕМЕНТЫ ПРОМПТА)(\s*\([^)]*\))?(:?)/,
                '<span style="color:' + C.label + ';font-weight:500">$1</span>' +
                '<span style="color:' + C.dim + '">$2$3</span>'
              );
            }

            // "ВХОД:" / "ВЫХОД:" / "  СЕКЦИИ:"
            // Обёртка \s* позволяет поймать "  СЕКЦИИ:" с отступом
            if (/^\s*(ВХОД|ВЫХОД|СЕКЦИИ):/.test(l)) {
              l = l.replace(/^(\s*)(ВХОД:|ВЫХОД:|СЕКЦИИ:)/,
                '$1<span style="color:' + C.label + ';font-weight:500">$2</span>');

              // Если ВЫХОД содержит числа — раскрасить inline
              if (/ВЫХОД/.test(l)) {
                if (/⟳/.test(l)) {
                  // Streaming: "ВЫХОД: 123 симв. ⟳ генерация..."
                  l = colorNums(l, C.blue);
                  l = l.replace(/(⟳\s*генерация\.{0,3})/g,
                    '<span style="color:' + C.blue + '">$1</span>');
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
            if (/^\s{2}(Системный промпт|Параметры синтеза|Правила форматирования|Требования к качеству|Служебный каркас)/.test(l)) {
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
              l = l.replace(/(ИТОГО)/,
                '<span style="font-weight:600">$1</span>');
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
              return '<span style="color:' + C.dim + '">' + l + '</span>';
            }

            // "    Обязательный:" / "    Опциональный:"
            if (/^\s{4}(Обязательный|Опциональный):/.test(l)) {
              return '<span style="color:' + C.dim + '">' + l + '</span>';
            }

            // ════ ЗАПИСИ КОНТЕКСТА (с ✓ ✗ ◦ ◌) — отступ 6 пробелов ════

            // "      ✓ Граф → Таблица категорий        1 234 симв."
            if (/^\s{6}✓/.test(l)) {
              l = l.replace(/✓/, '<span style="color:' + C.green + '">✓</span>');
              l = colorNums(l, C.green);
              l = l.replace(/(\[замена\])/g,
                '<span style="color:' + C.violet + ';font-size:9px">$1</span>');
              return l;
            }

            // "      ✗ ... утрачён [...] / НЕ НАЙДЕН / не найден"
            if (/^\s{6}✗/.test(l)) {
              l = l.replace(/✗/, '<span style="color:' + C.red + '">✗</span>');
              l = l.replace(/(НЕ НАЙДЕН)/g,
                '<span style="color:' + C.red + ';font-weight:600">$1</span>');
              l = l.replace(/(утрачён)/g,
                '<span style="color:' + C.red + '">$1</span>');
              l = l.replace(/(не найден)/g,
                '<span style="color:' + C.dim + '">$1</span>');
              l = l.replace(/\[([^\]]*)\]/g,
                '<span style="color:' + C.dimmer + '">[$1]</span>');
              return l;
            }

            // "      ◦ ... 1 234 симв. [обрезан с 5000 до 3000]"
            if (/^\s{6}◦/.test(l)) {
              l = l.replace(/◦/, '<span style="color:' + C.gold + '">◦</span>');
              l = colorNums(l, C.gold);
              l = l.replace(/(\[замена\])/g,
                '<span style="color:' + C.violet + ';font-size:9px">$1</span>');
              l = l.replace(/\[([^\]]*)\]/g,
                '<span style="color:' + C.dim + '">[$1]</span>');
              return l;
            }

            // "      ◌ ... пропущен [бюджет исчерпан]"
            if (/^\s{6}◌/.test(l)) {
              l = l.replace(/◌/, '<span style="color:' + C.dim + '">◌</span>');
              l = l.replace(/(пропущен)/g,
                '<span style="color:' + C.dim + '">$1</span>');
              l = l.replace(/\[([^\]]*)\]/g,
                '<span style="color:' + C.dimmer + '">[$1]</span>');
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
              l = l.replace(/(генерация)/g,
                '<span style="color:' + C.blue + ';font-size:9px">$1</span>');
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
                l = l.replace(/(⟳\s*генерация\.{0,3})/g,
                  '<span style="color:' + C.blue + '">$1</span>');
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
              l = l.replace(/(полный[^$]*)/,
                '<span style="color:' + C.gold + ';font-weight:600">$1</span>');
              return l;
            }
            // «(сжат родителями на N)» — приглушённый
            if (/\(сжат родителями на/.test(l)) {
              l = colorNums(l, C.gold);
              l = l.replace(/\(сжат родителями на ([\d\s,.]+)\)/,
                '<span style="color:' + C.dim + '">(сжат родителями на $1)</span>');
              return l;
            }
            // «⚠ отсутствует обязательное поле» — красный
            if (/⚠[^$]*отсутствует обязательное поле/.test(l)) {
              l = l.replace(/⚠/, '<span style="color:' + C.red + '">⚠</span>');
              l = l.replace(/(отсутствует обязательное поле[^$]*)/,
                '<span style="color:' + C.red + '">$1</span>');
              return l;
            }
            // «Опущено: ...» — мелкий серый
            if (/^\s{4}Опущено:/.test(l)) {
              return '<span style="color:' + C.dim + ';font-size:10px">' + l + '</span>';
            }
            // «↻  МИГРАЦИЯ СХЕМЫ» — фиолетовый
            if (/↻\s+МИГРАЦИЯ СХЕМЫ/.test(l)) {
              l = l.replace(/↻/, '<span style="color:' + C.violet + '">↻</span>');
              l = l.replace(/(МИГРАЦИЯ СХЕМЫ)/,
                '<span style="color:' + C.violet + ';font-weight:600">$1</span>');
              return l;
            }

            // ════ FALLBACK: минимальная раскраска ════
            l = colorCost(l);
            l = l.replace(/(\[замена\])/g,
              '<span style="color:' + C.violet + ';font-size:9px">$1</span>');

            return l;
          }).join("\n");
        }

// ───── диапазонном комплекте их не было: срез обрывался на строке 24088 · js:viewCtxLog
// philosynth.html строки 24096–24104 ─────

      function viewCtxLog() {
        document.getElementById("ctxLogContent").innerHTML = formatCtxLogHTML();
        const plainText = formatCtxLog();
        document.getElementById("ctxLogInfo").textContent =
          genLog.length + " разделов · " + plainText.split("\n").length + " строк";
        document.getElementById("ctxLogOverlay").classList.add("visible");
        document.body.style.overflow = "hidden";
      }

// ───── диапазонном комплекте их не было: срез обрывался на строке 24088 · js:closeCtxLog
// philosynth.html строки 24105–24109 ─────

      function closeCtxLog() {
        document.getElementById("ctxLogOverlay").classList.remove("visible");
        document.body.style.overflow = "";
      }

// ───── диапазонном комплекте их не было: срез обрывался на строке 24088 · js:copyCtxLog
// philosynth.html строки 24110–24118 ─────

      function copyCtxLog() {
        navigator.clipboard.writeText(formatCtxLog()).then(() => {
          const b = document.querySelector("#ctxLogOverlay .raw-copy");
          const o = b.textContent;
          b.textContent = "\u2713 Скопировано";
          setTimeout(() => (b.textContent = o), 2000);
        });
      }

// ───── диапазонном комплекте их не было: срез обрывался на строке 24088 · js:refreshCtxLogIfOpen
// philosynth.html строки 23306–23313 ─────
      function refreshCtxLogIfOpen() {
        const overlay = document.getElementById("ctxLogOverlay");
        if (!overlay || !overlay.classList.contains("visible")) return;
        document.getElementById("ctxLogContent").innerHTML = formatCtxLogHTML();
        const plainText = formatCtxLog();
        document.getElementById("ctxLogInfo").textContent =
          genLog.length + " разделов · " + plainText.split("\n").length + " строк";
      }

// ───── диапазонном комплекте их не было: срез обрывался на строке 24088 · js:downloadPrompts
// philosynth.html строки 24119–24138 ─────

      function downloadPrompts() {
        const text = formatPromptsForExport();
        if (!text) {
          alert("Нет сохранённых промптов. Сгенерируйте хотя бы один раздел.");
          return;
        }
        const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const docNum = document.getElementById("docNum")?.textContent?.trim() || "PS";
        const docTitle = document.getElementById("docTitle")?.textContent?.trim() || "";
        const titleSlug = docTitle && docTitle !== "Синтез Философской Концепции"
          ? "-" + transliterate(docTitle).slice(0, 40)
          : "";
        a.href = url;
        a.download = docNum + titleSlug + "-prompts.md";
        a.click();
        URL.revokeObjectURL(url);
      }

// ───── Дамп промптов (GET /logs/prompts) · js:formatPromptsForExport
// philosynth.html строки 24352–24478 ─────

      function formatPromptsForExport() {
        // Включаем все записи с _promptSkeleton ИЛИ с достаточными данными для реконструкции.
        // Исключаем служебные маркеры, не являющиеся запросами к API.
        const entries = genLog.filter(g =>
          g.type !== "version-marker" &&
          g.type !== "deletion-marker" &&
          g.type !== "pause-marker" &&
          g.type !== "resume-marker" &&
          g.type !== "user-action-marker" &&
          g.type !== "schema-migration-marker" &&
          (g._promptSkeleton || g.sectionKey)
        );
        if (entries.length === 0) return null;
      
        const lines = [];
        const sep = "═".repeat(80);
        const subsep = "─".repeat(80);
      
        // ── Шапка ──
        lines.push("# PHILOSYNTH PRO — ЭКСПОРТ ПРОМПТОВ");
        lines.push("");
        lines.push("Дата: " + new Date().toLocaleString("ru-RU"));
        const p = DOC_STATE.params;
        if (p) {
          lines.push("Метод: " + (ML[p.method] || p.method));
          lines.push("Уровень: " + (SL[p.synthLevel] || p.synthLevel));
          lines.push("Глубина: " + (p.depth || "?"));
          lines.push("Порядок: " + (p.generationOrder === "genetic" ? "генетический" : "архитектурный"));
          if (p.phil?.length) lines.push("Участники: " + p.phil.join(", "));
          if (p.seed) lines.push("Зерно: " + p.seed);
          // ТЗ: режим бюджета + схема селективности родительского контекста
          const _hasMetaP = (p.participants || []).some(x => x && x.type === "concept");
          if (_hasMetaP) {
            const _mode = (p.keepFullBudget || (genCommon && genCommon.budgetMode === 'full'))
              ? "полный (без ужимания)"
              : "ужатый (множитель сжатия 0.4)";
            lines.push("Режим бюджета секций: " + _mode);
            lines.push("Схема родительского контекста: селективная (PARENT_DEPS_BASE, v" +
              (typeof PARENT_CONTEXT_SCHEMA_VERSION !== "undefined" ? PARENT_CONTEXT_SCHEMA_VERSION : 1) + ")");
          }
        }
        lines.push("");
      
        // ── Системный промпт (один раз) ──
        const firstSys = entries.find(g => g._sys)?._sys
          || (p ? buildSYS(p) : null);
        if (firstSys) {
          lines.push(sep);
          lines.push("## СИСТЕМНЫЙ ПРОМПТ");
          lines.push("(одинаков для всех запросов; включает правила форматирования и требования к качеству)");
          lines.push(sep);
          lines.push("");
          lines.push(firstSys);
          lines.push("");
        }

        const firstSkeleton = entries[0]?._promptSkeleton || "";
        const partBaseMatch = firstSkeleton.match(/^ПАРАМЕТРЫ СИНТЕЗА:\n([\s\S]*?)(?=\nКОНТЕКСТ ИЗ ПРЕДЫДУЩИХ|\nКОНТЕКСТ ДРУГИХ|\nЗАДАНИЕ:|\n(?:Перегенерируй|Доработай) ТОЛЬКО)/);
        const baseCtxText = partBaseMatch
          ? partBaseMatch[1].trim()
          : (p ? reconstructBaseCtxSkeleton(p, genCommon) : null);
        if (baseCtxText) {
            lines.push(sep);
            lines.push("## ПАРАМЕТРЫ СИНТЕЗА");
            lines.push("(одинаковы для всех запросов)");
            lines.push(sep);
            lines.push("");
            lines.push(baseCtxText);
            lines.push("");
        }
      
        // ── Промпты по разделам — скелет ──
        for (const g of entries) {
          lines.push(sep);
      
          const isMode = g.sectionKey?.startsWith("mode:");
          const isSubRegen = g.source === "subsection-regen";
          const isCascade = g.source === "cascade-regen";
      
          let title = g.sectionLabel || g.sectionKey;
          if (isSubRegen) title += " [подразделовая перегенерация]";
          if (isCascade) title += " [каскад]";
          if (isMode) title += " [режим]";
      
          lines.push("## " + title.toUpperCase());
          lines.push(sep);
          lines.push("");
      
          // Скелет промпта: из текущей сессии или реконструкция
          let skeleton = g._promptSkeleton || reconstructSkeleton(g) || "";
          skeleton = skeleton.replace(/^ПАРАМЕТРЫ СИНТЕЗА:\n[\s\S]*?(?=\nКОНТЕКСТ ИЗ ПРЕДЫДУЩИХ|\nКОНТЕКСТ ДРУГИХ|\nЗАДАНИЕ:|\n(?:Перегенерируй|Доработай) ТОЛЬКО)/, "");
          lines.push(skeleton.trim());
      
          lines.push("");
          lines.push(subsep);
          lines.push("Вход: " + (g.inputChars || 0).toLocaleString("ru") + " симв. → " +
            (g.inputTokens || 0).toLocaleString("ru") + " токенов");
          lines.push("Выход: " + (g.outputChars || 0).toLocaleString("ru") + " симв. → " +
            (g.outputTokens || 0).toLocaleString("ru") + " токенов");
          lines.push("Стоимость: $" + (g.cost || 0).toFixed(4));
          // ТЗ: информация о родительском контексте и бюджете раздела
          if (typeof g.parentOverheadChars === "number" && g.parentOverheadChars > 0) {
            const fields = Array.isArray(g.parentFieldsUsed) ? g.parentFieldsUsed.join(", ") : "";
            lines.push("Контекст родителей: " + g.parentOverheadChars.toLocaleString("ru") +
              " симв." + (fields ? "  (поля: " + fields + ")" : ""));
          }
          // Бюджет секционного контекста из ctxLog
          if (typeof ctxLog !== "undefined" && Array.isArray(ctxLog)) {
            const _ctx = ctxLog.find(c => c.sectionKey === g.sectionKey);
            if (_ctx && _ctx.rawBaseBudget) {
              const _raw = _ctx.rawBaseBudget;
              const _applied = _ctx.conceptOverheadApplied || 0;
              if (_applied > 0) {
                lines.push("Бюджет секц. контекста: " + _ctx.budget.toLocaleString("ru") +
                  " из " + _raw.toLocaleString("ru") + " симв. [ужато]");
              } else if (_ctx.budgetMode === 'full') {
                lines.push("Бюджет секц. контекста: " + _raw.toLocaleString("ru") + " симв. [полный]");
              }
            }
          }
          if (g.status === "error") lines.push("⚠ ОШИБКА: " + g.error);
          lines.push("");
        }
      
        return lines.join("\n");
      }

// ───── Дамп промптов (GET /logs/prompts) · js:buildPromptSkeleton
// philosynth.html строки 8506–8588 ─────
      function buildPromptSkeleton(fp) {
        // 1. Сворачиваем контекстные блоки разделов (### ...)
        let result = fp.replace(
          /(### ([^\n]+))\n([\s\S]*?)(?=\n###\s|\n"""|$)/g,
          (match, headerLine, label, content) => {
            const chars = content.trim().length;
            return "[" + label.trim() + ": " +
              chars.toLocaleString("ru") + " симв.]";
          }
        );

        // 2. Сворачиваем блоки концепций-участников (═══ КОНЦЕПЦИЯ-УЧАСТНИК ... ═══)
        // ТЗ selective-parent-context 6.2: расширенный формат маркера,
        // включающий список использованных полей родителя.
        result = result.replace(
          /(═══ КОНЦЕПЦИЯ-УЧАСТНИК: ([^═]+)═══)\n([\s\S]*?)(?=\n═══ КОНЦЕПЦИЯ-УЧАСТНИК|\n""")/g,
          (match, headerLine, name, content) => {
            const chars = content.trim().length;
            // Извлекаем заголовки полей (напр. "КАПСУЛА:", "ТЕЗИСЫ:")
            // из самого содержимого блока. Работает и для селективных,
            // и для монолитных блоков — ничего не нужно передавать извне.
            const fieldHeaders = [];
            const rx = /^([А-ЯЁ][А-ЯЁ\s()А-ЯЁ]{2,50}):$/gm;
            let m;
            while ((m = rx.exec(content)) !== null) {
              // Игнорируем служебные заголовки-не-поля
              const h = m[1].trim();
              if (h === "МЕТОД" || h === "УРОВЕНЬ" || h === "ЗЕРНО") continue;
              fieldHeaders.push(h);
            }
            const fieldsLabel = (fieldHeaders.length > 0)
              ? ": " + fieldHeaders.join(" + ") + " = "
              : ": ";
            return "[контекст «" + name.trim() + "»" + fieldsLabel +
              chars.toLocaleString("ru") + " симв.]";
          }
        );

        // 3. Сворачиваем блоки в тройных кавычках с предшествующим заголовком
        result = result.replace(
          /((?:КОНТЕКСТ ДРУГИХ ПОДРАЗДЕЛОВ|ТЕКУЩЕЕ СОДЕРЖИМОЕ ПОДРАЗДЕЛА|КОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ)[^\n]*)\n"""\n([\s\S]*?)"""/g,
          (match, header, content) => {
            const chars = content.trim().length;
            // Для блока подразделов — перечисляем каждый с размером
            if (header.includes("КОНТЕКСТ ДРУГИХ ПОДРАЗДЕЛОВ")) {
              const parts = [];
              const rx = /\[([^\]]+)\]\n/g;
              let mm, prevName = null, prevStart = 0;
              while ((mm = rx.exec(content)) !== null) {
                if (prevName && !prevName.includes("сокращено")) {
                  const len = mm.index - prevStart;
                  parts.push("[" + prevName + ": " + len.toLocaleString("ru") + " симв.]");
                }
                prevName = mm[1];
                prevStart = mm.index;
              }
              if (prevName && !prevName.includes("сокращено")) {
                const len = content.length - prevStart;
                parts.push("[" + prevName + ": " + len.toLocaleString("ru") + " симв.]");
              }
              if (parts.length > 0) {
                return parts.join("\n");
              }
            }
            // Для блока концепций-участников — шаг 2 уже свернул в [контекст «...»: N симв.]
            if (header.includes("КОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ")) {
              const conceptLines = content.trim().split("\n").filter(l => l.startsWith("[контекст"));
              if (conceptLines.length > 0) {
                return header + "\n\"\"\"\n" + conceptLines.join("\n") + "\n\"\"\"";
              }
            }
            return "[" + chars.toLocaleString("ru") + " симв.]";
          }
        );

        // 4. Сворачиваем блок ТРЕБОВАНИЯ в конце промпта
        result = result.replace(
          /\n\nТРЕБОВАНИЯ: каждый раздел[^\n]*/g,
          "\n\n[ТРЕБОВАНИЯ К КАЧЕСТВУ: см. общие элементы]"
        );

        return result;
      }

// ───── Дамп промптов (GET /logs/prompts) · js:_logPauseEvent
// philosynth.html строки 24500–24511 ─────
      function _logPauseEvent(type, data) {
        try {
          genLog.push({
            type,
            ...(data || {}),
            timestamp: new Date().toISOString(),
          });
          if (typeof refreshCtxLogIfOpen === "function") refreshCtxLogIfOpen();
        } catch (e) {
          console.warn("_logPauseEvent failed:", e);
        }
      }

// ───── Разметка и стили окна лога (ContextLogViewer) · html:#ctxLogOverlay
// philosynth.html строки 4275–4291 ─────
    <div class="raw-overlay" id="ctxLogOverlay" onclick="if (event.target === this) closeCtxLog();">
      <div class="raw-modal" style="max-width: 1000px">
        <div class="raw-modal-header">
          <div class="raw-modal-title">◈ Лог Контекста</div>
          <button class="raw-close" onclick="closeCtxLog()">✕ Закрыть</button>
        </div>
        <div class="raw-modal-body"><pre id="ctxLogContent" style="font-size: 12px; line-height: 1.6"></pre></div>
        <div class="raw-modal-footer">
          <div class="raw-info" id="ctxLogInfo">—</div>
          <button class="raw-copy" onclick="downloadPrompts()"
                  title="Скачать все промпты за сессию в файл .md">
            ⤓ Скачать промпты
          </button>
          <button class="raw-copy" onclick="copyCtxLog()">Скопировать лог</button>
        </div>
      </div>
    </div>

// ───── Разметка и стили окна лога (ContextLogViewer) · css*:.raw-
// philosynth.html строки 1376–1385 ─────
      .raw-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(10, 10, 15, 0.75);
        z-index: 9999;
        align-items: center;
        justify-content: center;
        padding: 32px;
      }

// ───── Разметка и стили окна лога (ContextLogViewer) · css*:.raw-
// philosynth.html строки 1386–1388 ─────
      .raw-overlay.visible {
        display: flex;
      }

// ───── Разметка и стили окна лога (ContextLogViewer) · css*:.raw-
// philosynth.html строки 1389–1398 ─────
      .raw-modal {
        background: var(--ink);
        border: 1px solid var(--rule-strong);
        border-top: 3px solid var(--gold);
        width: 100%;
        max-width: 900px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
      }

// ───── Разметка и стили окна лога (ContextLogViewer) · css*:.raw-
// philosynth.html строки 1399–1406 ─────
      .raw-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 24px;
        border-bottom: 1px solid #333;
        flex-shrink: 0;
      }

// ───── Разметка и стили окна лога (ContextLogViewer) · css*:.raw-
// philosynth.html строки 1407–1414 ─────
      .raw-modal-title {
        font-family: var(--mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 2.5px;
        text-transform: uppercase;
        color: var(--gold);
      }

// ───── Разметка и стили окна лога (ContextLogViewer) · css*:.raw-
// philosynth.html строки 1415–1426 ─────
      .raw-close {
        font-family: var(--mono);
        font-size: 11px;
        background: transparent;
        border: 1px solid #444;
        color: #999;
        padding: 6px 14px;
        cursor: pointer;
        letter-spacing: 1px;
        text-transform: uppercase;
        transition: all 0.15s;
      }

// ───── Разметка и стили окна лога (ContextLogViewer) · css*:.raw-
// philosynth.html строки 1427–1430 ─────
      .raw-close:hover {
        border-color: var(--red);
        color: var(--red);
      }

// ───── Разметка и стили окна лога (ContextLogViewer) · css*:.raw-
// philosynth.html строки 1431–1435 ─────
      .raw-modal-body {
        overflow-y: auto;
        flex: 1;
        padding: 24px;
      }

// ───── Разметка и стили окна лога (ContextLogViewer) · css*:.raw-
// philosynth.html строки 1436–1444 ─────
      .raw-modal-body pre {
        font-family: var(--mono);
        font-size: 11px;
        line-height: 1.7;
        color: #c8c0b0;
        white-space: pre-wrap;
        word-break: break-all;
        margin: 0;
      }

// ───── Разметка и стили окна лога (ContextLogViewer) · css*:.raw-
// philosynth.html строки 1445–1452 ─────
      .raw-modal-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 24px;
        border-top: 1px solid #333;
        flex-shrink: 0;
      }

// ───── Разметка и стили окна лога (ContextLogViewer) · css*:.raw-
// philosynth.html строки 1453–1458 ─────
      .raw-info {
        font-family: var(--mono);
        font-size: 9px;
        color: #555;
        letter-spacing: 1px;
      }

// ───── Разметка и стили окна лога (ContextLogViewer) · css*:.raw-
// philosynth.html строки 1459–1471 ─────
      .raw-copy {
        font-family: var(--mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        background: var(--gold);
        color: var(--ink);
        border: none;
        padding: 8px 20px;
        cursor: pointer;
        transition: opacity 0.15s;
      }

// ───── Разметка и стили окна лога (ContextLogViewer) · css*:.raw-
// philosynth.html строки 1472–1474 ─────
      .raw-copy:hover {
        opacity: 0.85;
      }
