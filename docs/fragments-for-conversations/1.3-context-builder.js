// Фрагменты philosynth.html (26 024 стр., ревизия 2026-07) для беседы 1.3-context-builder
// Сгенерировано extract-fragments.py; при обновлении исходника — перегенерировать.

// ───── [extractAllTablesAsText] philosynth.html строки 8010–8013 ─────
      function extractAllTablesAsText(containerEl) {
        const tables = containerEl.querySelectorAll("table.doc-table");
        return Array.from(tables).map(t => tableToText(t)).join("\n\n");
      }

// ───── [extractCapsuleText] philosynth.html строки 11720–11739 ─────
      function extractCapsuleText(capsuleHTML) {
        if (!capsuleHTML) return "";
        const tmp = document.createElement("div");
        tmp.innerHTML = capsuleHTML;
        
        // Целимся в содержимое, минуя section-num и section-title
        const target = tmp.querySelector('[data-section="Капсула"]')
                    || tmp.querySelector('.doc-content')
                    || tmp;
        
        const clone = target.cloneNode(true);
        const h4 = clone.querySelector("h4");
        if (h4) h4.remove();
        
        return (clone.innerText || "")
          .replace(/^\s*Капсула\s*/i, "")
          .replace(/\n\s+/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }

// ───── [extractContextFragment] philosynth.html строки 8150–8270 ─────
      function extractContextFragment(contextKey, generated) {
        const [section] = contextKey.split(":");
        const el = generated[section];
        // Капсула хранится в DOC_STATE, не в DOM — обрабатываем до проверки el
        if (contextKey === "capsule:full") {
          if (!DOC_STATE.capsuleHTML) return null;
          return extractCapsuleText(DOC_STATE.capsuleHTML) || null;
        }
        if (!el) return null;
        switch (contextKey) {
          case "sum:goals":      return extractSection(el, "цели и метод") || extractSection(el, "цели");
          case "sum:portraits":  return extractSection(el, "портрет");
          case "sum:novelty":    return extractSection(el, "новизн");
          case "sum:tensions":   return extractSection(el, "напряжени");
          case "sum:coherence":  return extractSection(el, "когерентност");
          case "sum:difficulty": return extractSection(el, "сложност");
          case "graph:nodes":    return extractGraphNodesTable(el);
          case "graph:nodes_compact": return extractGraphNodesCompact(el);
          case "graph:edges":    return extractGraphEdgesTable(el);
          case "graph:topology": return extractSection(el, "тополог");
          case "glossary:table": return extractGlossaryCompact(el);
          case "theses:full":    return truncateText(el.innerText?.trim() || "", 6000);
          case "theses:summary": return extractThesesSummary(el);
          case "name:title": {
            // Приоритет 1: из раздела «Анализ названия» (если сгенерирован)
            if (el) {
              const fromSection = extractNameTitle(el);
              if (fromSection) return fromSection;
            }
            // Приоритет 2: из docTitle (задан вручную или сохранён от предыдущей генерации)
            const docTitle = document.getElementById("docTitle")?.textContent?.trim();
            if (docTitle && docTitle !== "Синтез Философской Концепции") {
              return "НАЗВАНИЕ КОНЦЕПЦИИ: «" + docTitle + "»";
            }
            return null;
          }
          case "name:full":      return truncateText(el.innerText?.trim() || "", 4000);
          case "dialogue:synthesis": return extractSection(el, "аналитическ");
          case "dialogue:new_concepts": {
            // Ищем понятия, введённые в диалоге — обычно выделены <strong> или <em>
            // Или берём из «Итоговая таблица диалога»
            const table = extractSection(el, "итогов");
            if (table) return "ПОНЯТИЯ ИЗ ДИАЛОГА:\n" + truncateText(table, 4000);
            // Фолбэк: ищем все <strong> в диалоге
            const strongs = el.querySelectorAll("strong");
            const concepts = Array.from(strongs)
              .map(s => s.textContent.trim())
              .filter(t => t.length > 5 && t.length < 100);
            if (concepts.length > 0) {
              return "ПОНЯТИЯ ИЗ ДИАЛОГА:\n" + [...new Set(concepts)].join("\n");
            }
            return truncateText(el.innerText?.trim() || "", 3000);
          }

          case "dialogue:tensions_discovered": {
            // Напряжения, обнаруженные в диалоге
            const comment = extractSection(el, "аналитическ");
            if (comment) return "НАПРЯЖЕНИЯ (из диалога):\n" + truncateText(comment, 3000);
            return null;
          }

          case "dialogue:turning_points": {
            // Переломные моменты — из аналитического комментария или таблицы
            const table = extractSection(el, "итогов");
            const comment = extractSection(el, "аналитическ");
            const parts = [];
            if (table) parts.push(truncateText(table, 2000));
            if (comment) parts.push(truncateText(comment, 2000));
            return parts.length ? "КЛЮЧЕВЫЕ МОМЕНТЫ ДИАЛОГА:\n" + parts.join("\n") : null;
          }
          case "origin:genealogy":     return extractSection(el, "идентификац");
          case "origin:decomposition":  return truncateText(extractSection(el, "декомпозиц") || "", 5000);
          case "origin:novelty":        return extractSection(el, "оригинальност");
          case "history:full":   return truncateText(el.innerText?.trim() || "", 4000);
          case "history:contemporary":  return extractSection(el, "современн");
          case "history:genealogy":     return extractSection(el, "генеалог");
          case "history:influence":     return extractSection(el, "потенциальное влиян");
          case "history:name_context":  return extractSection(el, "название историчес") || extractSection(el, "соответствие назван");
          case "practical:summary": {
            const tables = el.querySelectorAll("table.doc-table");
            const last = tables[tables.length - 1];
            return last ? "ТАБЛИЦА ПРИМЕНЕНИЯ:\n" + tableToText(last) : null;
          }
          case "evolution:directions":    return extractSection(el, "направления развития");
          case "evolution:graph_changes": return extractSection(el, "изменения графа");
          case "evolution:name_evolution":return extractSection(el, "эволюция названия");
          case "evolution:science":       return extractSection(el, "современной науке");
          case "critique:full": return truncateText(el.innerText?.trim() || "", 6000);
          case "critique:final_table": {
            const sec = el.querySelector('[data-section*="Итоговая оценка"]')
                      || el.querySelector('[data-section*="итогов"]');
            if (sec) {
              const table = sec.querySelector("table.doc-table");
              if (table) return "ИТОГОВАЯ ОЦЕНКА:\n" + tableToText(table);
              return truncateText(sec.innerText?.trim() || "", 2000);
            }
            const tables = el.querySelectorAll("table.doc-table");
            const last = tables[tables.length - 1];
            return last ? "ИТОГОВАЯ ОЦЕНКА:\n" + tableToText(last) : null;
          }

          case "graph:nodes_top": {
            const fullTable = extractGraphNodesTable(el);
            if (!fullTable) return null;
            const rows = fullTable.split("\n");
            if (rows.length <= 3) return fullTable;
            const header = rows.slice(0, 3);   
            const dataRows = rows.slice(3); 
            const parsed = dataRows.map(row => {
              const cols = row.split(" | ");
              const cen = parseFloat(cols[3]) || 0;
              return { row, cen };
            });
            parsed.sort((a, b) => b.cen - a.cen);
            const top = parsed.slice(0, 7).map(p => p.row);
            return header.concat(top).join("\n");
          }

          default: return null;
        }
      }

// ───── [extractEmbeddedState] philosynth.html строки 21534–21543 ─────
      function extractEmbeddedState(doc) {
        const stateEl = doc.getElementById("philosynth-state");
        if (!stateEl) return null;
        try {
          return JSON.parse(stateEl.textContent);
        } catch (e) {
          console.warn("Не удалось распарсить встроенное состояние:", e);
          return null;
        }
      }

// ───── [extractGlossaryCompact] philosynth.html строки 8021–8049 ─────
      function extractGlossaryCompact(containerEl) {
        const tables = containerEl.querySelectorAll("table.doc-table");
        for (const t of tables) {
          const ths = Array.from(t.querySelectorAll("thead th"))
            .map(th => th.textContent.trim().toLowerCase());
          // Ищем таблицу, у которой первый столбец содержит "термин"
          if (ths.length >= 2 && ths[0].includes("термин")) {
            const rows = [];
            const h0 = t.querySelectorAll("thead th")[0]?.textContent.trim() || "Термин";
            const h1 = t.querySelectorAll("thead th")[1]?.textContent.trim() || "Определение";
            rows.push(h0 + " | " + h1);
            rows.push("--- | ---");
            t.querySelectorAll("tbody tr").forEach(tr => {
              const tds = tr.querySelectorAll("td");
              if (tds.length >= 2) {
                const c0 = tds[0].textContent.trim().replace(/\n+/g, " ");
                const c1 = tds[1].textContent.trim().replace(/\n+/g, " ").replace(/\s{2,}/g, " ");
                rows.push(c0 + " | " + c1);
              }
            });
            return "ГЛОССАРИЙ (термины и определения):\n" + rows.join("\n");
          }
        }
        // Фолбэк: если таблица с "термин" не найдена, берём первую таблицу компактно
        if (tables.length > 0) {
          return "ГЛОССАРИЙ:\n" + tableToText(tables[0]);
        }
        return null;
      }

// ───── [extractGraphEdgesTable] philosynth.html строки 8137–8148 ─────
      function extractGraphEdgesTable(containerEl) {
        const tables = containerEl.querySelectorAll("table.doc-table");
        for (const t of tables) {
          const ths = Array.from(t.querySelectorAll("thead th"))
            .map(h => h.textContent.toLowerCase());
          if (ths.some(h => h.includes("источник")) &&
              ths.some(h => h.includes("цел") || h.includes("направлен"))) {
            return "ТАБЛИЦА СВЯЗЕЙ:\n" + tableToText(t);
          }
        }
        return null;
      }

// ───── [extractGraphNodesCompact] philosynth.html строки 8109–8135 ─────
      function extractGraphNodesCompact(containerEl) {
        const tables = containerEl.querySelectorAll("table.doc-table");
        for (const t of tables) {
          const ths = Array.from(t.querySelectorAll("thead th"))
            .map(th => th.textContent.trim().toLowerCase());
          if (ths.some(h => h.includes("категори")) &&
              ths.some(h => h.includes("центральност"))) {
            const rows = [];
            // Заголовок: берём первые 3 столбца
            const headers = Array.from(t.querySelectorAll("thead th"))
              .map(th => th.textContent.trim());
            rows.push([headers[0], headers[1], headers[2]].join(" | "));
            rows.push("--- | --- | ---");
            t.querySelectorAll("tbody tr").forEach(tr => {
              const tds = tr.querySelectorAll("td");
              if (tds.length >= 3) {
                const c0 = tds[0].textContent.trim().replace(/\n+/g, " ");
                const c1 = tds[1].textContent.trim().replace(/\n+/g, " ");
                const c2 = tds[2].textContent.trim().replace(/\n+/g, " ").replace(/\s{2,}/g, " ");
                rows.push(c0 + " | " + c1 + " | " + c2);
              }
            });
            return "ТАБЛИЦА КАТЕГОРИЙ (компактная):\n" + rows.join("\n");
          }
        }
        return null;
      }

// ───── [extractGraphNodesTable] philosynth.html строки 8092–8103 ─────
      function extractGraphNodesTable(containerEl) {
        const tables = containerEl.querySelectorAll("table.doc-table");
        for (const t of tables) {
          const ths = Array.from(t.querySelectorAll("thead th"))
            .map(h => h.textContent.toLowerCase());
          if (ths.some(h => h.includes("категори")) &&
              ths.some(h => h.includes("центральност"))) {
            return "ТАБЛИЦА КАТЕГОРИЙ:\n" + tableToText(t);
          }
        }
        return null;
      }

// ───── [extractIntraSectionContext] philosynth.html строки 19866–19885 ─────
      function extractIntraSectionContext(container, excludeName) {
        const sections = container.querySelectorAll("[data-section]");
        const parts = [];
        for (const sec of sections) {
          const name = sec.getAttribute("data-section");
          if (name === excludeName) continue;
          // Для таблиц — структурированное извлечение
          const tables = sec.querySelectorAll("table.doc-table");
          if (tables.length > 0) {
            const tableParts = Array.from(tables).map(t => tableToText(t));
            const nonTableText = sec.innerText?.trim()
              .replace(/\n{3,}/g, "\n\n") || "";
            parts.push(`[${name}]\n${truncateText(nonTableText, 1500)}\n${tableParts.join("\n")}`);
          } else {
            const text = sec.innerText?.trim();
            if (text) parts.push(`[${name}]\n${truncateText(text, 2000)}`);
          }
        }
        return parts.join("\n\n");
      }

// ───── [extractMetadata] philosynth.html строки 21356–21407 ─────
      function extractMetadata(doc) {
        const getText = (id) => {
          const el = doc.getElementById(id);
          return el ? el.textContent.trim() : "";
        };

        // Философы: из footerPhil или из docSubtitle
        let phil = [];
        const footerPhil = getText("footerPhil");
        if (footerPhil && footerPhil !== "—") {
          phil = footerPhil.split(/\s*,\s*/).filter(Boolean);
        } else {
          const subtitle = getText("docSubtitle");
          const m = subtitle.match(/На основе:\s*(.+)/i);
          if (m) phil = m[1].split(/\s*,\s*/).filter(Boolean);
        }

        // Метод, глубина, уровень — обратный маппинг
        const methodDisplay = getText("docMethod");
        const depthDisplay = getText("docDepth");
        const synthDisplay = getText("docSynthLevel");

        const method = REVERSE_ML[methodDisplay] || "dialectical";
        const depth = REVERSE_DL[depthDisplay] || "standard";
        const synthLevel = REVERSE_SL[synthDisplay] || "comparative";

        // Зерно и общий контекст — из <details class="header-disclosure">
        let seed = "", ctx = "";
        const headerExtras = doc.getElementById("docHeaderExtras");
        if (headerExtras) {
          headerExtras.querySelectorAll("details.header-disclosure").forEach(det => {
            const summaryText = det.querySelector("summary")?.textContent?.trim()?.toLowerCase() || "";
            const bodyText = det.querySelector(".disclosure-body")?.textContent?.trim() || "";
            if (summaryText.includes("зерно")) seed = bodyText;
            else if (summaryText.includes("контекст")) ctx = bodyText;
          });
        }

        // Капсула — из header-disclosure-capsule
        let capsuleText = "";
        const capsuleDisc = headerExtras?.querySelector(".header-disclosure-capsule");
        if (capsuleDisc) {
          capsuleText = capsuleDisc.querySelector(".disclosure-body")?.textContent?.trim() || "";
        }

        const docNum = getText("docNum");

        return {
          phil, method, depth, synthLevel, seed, ctx, docNum, capsuleText,
          _raw: { methodDisplay, depthDisplay, synthDisplay },
        };
      }

// ───── [extractModesFromHTML] philosynth.html строки 21550–21586 ─────
      function extractModesFromHTML(doc) {
        const modes = {};
        
        // Формат 1 (новый, §5): данные в <script> как DOC_STATE.modes = {...}
        const scripts = doc.querySelectorAll("script");
        for (const s of scripts) {
          const match = s.textContent.match(/DOC_STATE\s*=\s*\{\s*modes:\s*(\{[\s\S]*?\})\s*\}/);
          if (match) {
            try {
              const parsed = JSON.parse(match[1]);
              for (const [key, results] of Object.entries(parsed)) {
                modes[key] = Array.isArray(results) ? results : [];
              }
              return modes;
            } catch (e) { console.warn("Не удалось распарсить DOC_STATE.modes:", e); }
          }
        }
        
        // Формат 2 (§3+§5): <div class="philosynth-mode"> или <details class="philosynth-mode"> с data-атрибутами
        const details = doc.querySelectorAll(".philosynth-mode[data-mode-key]");
        for (const det of details) {
          const key = det.getAttribute("data-mode-key");
          if (!key) continue;
          if (!modes[key]) modes[key] = [];
          const body = det.querySelector(".philosynth-mode-body");
          modes[key].push({
            html: body ? body.innerHTML : det.innerHTML,
            param: det.getAttribute("data-mode-param") || "",
            timestamp: det.getAttribute("data-mode-timestamp") || "",
          });
        }
        if (Object.keys(modes).length > 0) return modes;
        
        // Формат 3 (старый): обычные <details> без атрибутов — не парсятся,
        // данные берутся из JSON-состояния в buildDocStateFromImport
        return modes;
      }

// ───── [extractNameTitle] philosynth.html строки 8068–8090 ─────
      function extractNameTitle(containerEl) {
        // Ищем секцию "Итоговая рекомендация" (новый формат промпта)
        const recSection = (() => {
          const divs = containerEl.querySelectorAll("div[data-section]");
          for (const div of divs) {
            const sec = div.getAttribute("data-section").toLowerCase();
            if (sec.includes("итогов") || sec.includes("рекоменд")) return div;
          }
          return null;
        })();
        // Берём strong из секции рекомендации; фолбэк — первый strong вообще (старый формат)
        const strong = recSection
          ? recSection.querySelector("strong")
          : containerEl.querySelector("strong");
        const title = strong?.textContent?.trim();
        const rationale = recSection
          ? recSection.innerText?.trim()
          : extractSection(containerEl, "обоснован");
        let result = "";
        if (title) result += "НАЗВАНИЕ КОНЦЕПЦИИ: «" + title + "»";
        if (rationale) result += "\n" + rationale;
        return result || truncateText(containerEl.innerText?.trim() || "", 1500);
      }

// ───── [extractPreambleConstraints] philosynth.html строки 10727–10740 ─────
      function extractPreambleConstraints(preamble) {
        if (!preamble) return "";
        const keywords = ["ОБЯЗАН", "КРИТИЧЕСК", "ЗАПРЕЩЕН", "СТРОГО", "ТРЕБОВАН"];
        const lines = preamble.split("\n");
        const constraints = lines.filter(line => {
          const upper = line.toUpperCase();
          return keywords.some(kw => upper.includes(kw));
        });
        if (constraints.length === 0) {
          const sentences = preamble.split(/(?<=[.!?])\s+/);
          return sentences.slice(0, 2).join(" ");
        }
        return constraints.join("\n");
      }

// ───── [extractRelevantIntraSectionContext] philosynth.html строки 19894–19945 ─────
      function extractRelevantIntraSectionContext(container, sectionKey, subsectionName) {
        const deps = INTRA_DEPS[sectionKey] || {};
        // Канонизируем: в DOM имя может быть локализовано (например,
        // «Портрет философа» вместо канона «Портрет каждого философа»),
        // а в INTRA_DEPS — всегда канон.
        const canonName = canonicalSubsectionKey(sectionKey, subsectionName);
        const directDeps = deps[canonName];

        // Если у подраздела нет записи в INTRA_DEPS — он «корневой»,
        // отправляем все подразделы (консервативный фолбэк)
        if (!directDeps || directDeps.length === 0) {
          return extractIntraSectionContext(container, subsectionName);
        }

        // Транзитивное замыкание ВВЕРХ: собираем все подразделы,
        // от которых текущий зависит прямо или через цепочку
        const needed = new Set();
        const queue = [...directDeps];
        while (queue.length > 0) {
          const current = queue.shift();
          if (needed.has(current)) continue;
          needed.add(current);
          const parentDeps = deps[current];
          if (parentDeps) {
            for (const p of parentDeps) {
              if (!needed.has(p)) queue.push(p);
            }
          }
        }

        // Извлекаем только нужные подразделы
        const sections = container.querySelectorAll("[data-section]");
        const parts = [];
        for (const sec of sections) {
          const name = sec.getAttribute("data-section");
          if (name === subsectionName) continue;  // себя не включаем
          // Канонизируем имя из DOM перед сверкой с needed (канон).
          const canonOfName = canonicalSubsectionKey(sectionKey, name);
          if (!needed.has(canonOfName)) continue;
          const tables = sec.querySelectorAll("table.doc-table");
          if (tables.length > 0) {
            const tableParts = Array.from(tables).map(t => tableToText(t));
            const nonTableText = sec.innerText?.trim()
              .replace(/\n{3,}/g, "\n\n") || "";
            parts.push(`[${name}]\n${truncateText(nonTableText, 1500)}\n${tableParts.join("\n")}`);
          } else {
            const text = sec.innerText?.trim();
            if (text) parts.push(`[${name}]\n${truncateText(text, 2000)}`);
          }
        }
        return parts.join("\n\n");
      }

// ───── [extractSection] philosynth.html строки 7953–7992 ─────
      function extractSection(containerEl, keyword) {
        const kw = keyword.toLowerCase();

        // Приоритет 1: ищем <div data-section="..."> с подходящим именем
        const divs = containerEl.querySelectorAll("div[data-section]");
        for (const div of divs) {
          if (div.getAttribute("data-section").toLowerCase().includes(kw)) {
            // Возвращаем весь текстовый контент div-а, включая вложенные h4
            const parts = [];
            for (const child of div.children) {
              if (child.tagName === "TABLE") {
                parts.push(tableToText(child));
              } else {
                const t = child.innerText?.trim();
                if (t) parts.push(t);
              }
            }
            return parts.filter(Boolean).join("\n") || div.innerText?.trim() || null;
          }
        }

        // Фолбэк: старая логика через h4 (для обратной совместимости)
        const h4s = containerEl.querySelectorAll("h4");
        for (const h4 of h4s) {
          if (!h4.textContent.toLowerCase().includes(kw)) continue;
          const parts = [h4.textContent.trim()];
          let next = h4.nextElementSibling;
          while (next && next.tagName !== "H4" && !next.hasAttribute("data-section")) {
            if (next.tagName === "TABLE") {
              parts.push(tableToText(next));
            } else {
              const t = next.innerText?.trim();
              if (t) parts.push(t);
            }
            next = next.nextElementSibling;
          }
          return parts.filter(Boolean).join("\n");
        }
        return null;
      }

// ───── [extractSections] philosynth.html строки 21484–21529 ─────
      function extractSections(doc) {
        const sections = [];

        // Ищем все .doc-body контейнеры внутри #docBodies (или потомки #docOutput)
        const docBodies = doc.getElementById("docBodies") || doc.getElementById("docOutput");
        if (!docBodies) return sections;

        // Контейнеры могут быть .doc-body или непосредственно .doc-section
        const sectionEls = docBodies.querySelectorAll(".doc-section");

        sectionEls.forEach((secEl) => {
          const numText = secEl.querySelector(".section-num")?.textContent?.trim() || "";
          const titleText = secEl.querySelector(".section-title")?.textContent?.trim() || "";
          const numMatch = numText.match(/§\s*(\d+)/);
          const num = numMatch ? parseInt(numMatch[1], 10) : 0;

          const key = titleToKey(titleText);
          if (!key) {
            console.warn("Импорт: не удалось определить ключ для раздела «" + titleText + "» — пропущен.");
            return;
          }

          // Извлекаем доп. контекст раздела (если есть <details class="sec-disclosure">)
          let secCtx = "";
          // Ищем в родительском .doc-body
          const parentBody = secEl.closest(".doc-body") || secEl.parentElement;
          if (parentBody) {
            const disc = parentBody.querySelector("details.sec-disclosure");
            if (disc) {
              secCtx = disc.querySelector(".disclosure-body")?.textContent?.trim() || "";
            }
          }

          // HTML всего контейнера (.doc-body), включая disclosure
          const containerHTML = parentBody
            ? parentBody.innerHTML
            : secEl.outerHTML;

          sections.push({ key, num, title: titleText, html: containerHTML, secCtx });
        });

        // Сортируем по номеру §
        sections.sort((a, b) => a.num - b.num);

        return sections;
      }

// ───── [extractSubsectionContent] philosynth.html строки 19950–19964 ─────
      function extractSubsectionContent(container, subsectionName) {
        const sec = container.querySelector(`[data-section="${subsectionName}"]`);
        if (!sec) return null;

        const parts = [];
        for (const child of sec.children) {
          if (child.tagName === "TABLE") {
            parts.push(tableToText(child));
          } else {
            const t = child.innerText?.trim();
            if (t) parts.push(t);
          }
        }
        return parts.filter(Boolean).join("\n") || sec.innerText?.trim() || null;
      }

// ───── [extractThesesSummary] philosynth.html строки 8057–8066 ─────
      function extractThesesSummary(containerEl) {
        const sec = containerEl.querySelector('[data-section*="Сводная таблица"]')
                 || containerEl.querySelector('[data-section*="сводная таблица"]');
        if (sec) {
          const table = sec.querySelector("table.doc-table") || sec.querySelector("table");
          if (table) return "СВОДКА ТЕЗИСОВ:\n" + tableToText(table);
          // Секция есть, но таблицы нет — берём текст секции
          return "СВОДКА ТЕЗИСОВ:\n" + truncateText(sec.innerText?.trim() || "", 3000);
        }
      }

// ───── [extractedKeys] philosynth.html строки 21755–21762 ─────
        const extractedKeys = new Set(sections.map(s => s.key));
        extractedKeys.add("sum"); // sum всегда присутствует
        // Капсула хранится в шапке документа, а не в #docBodies,
        // поэтому extractSections её не находит. Добавляем вручную,
        // если капсула существует в метаданных или во встроённом состоянии.
        if (meta.capsuleText || embeddedState?.capsuleHTML) {
          extractedKeys.add("capsule");
        }

// ───── [buildContextForSection] philosynth.html строки 8313–8499 ─────
      function buildContextForSection(sectionKey, generated, depth, effectiveDepsMap, resolvedDeps) {
        const depsSource = resolvedDeps ?? CONTEXT_DEPS_BASE;
        const deps = effectiveDepsMap?.[sectionKey] ?? depsSource[sectionKey];
        if (!deps) return "";
        const _origDeps = depsSource[sectionKey];
        const _origAllKeys = new Set([
          ...(_origDeps?.required || []),
          ...(_origDeps?.optional || []),
        ]);
        const baseBudget = CONTEXT_BUDGET[depth] || 12000;

      // Per-section formula через applyBudgetPressure.
      // Унифицировано: critique × 1.5 применяется ДО давления.
      const _keepFullBudget = !!((DOC_STATE.params && DOC_STATE.params.keepFullBudget)
        || _currentKeepFullBudget());
      const _participantsForBudget = (DOC_STATE.participants && DOC_STATE.participants.length)
        ? DOC_STATE.participants
        : ((typeof _conceptParticipants !== "undefined") ? _conceptParticipants : []);
      const _genOrder = (DOC_STATE.params && DOC_STATE.params.generationOrder) || "architectural";
      const _synthLevel = (DOC_STATE.params && DOC_STATE.params.synthLevel) || "comparative";
      const _method = (DOC_STATE.params && DOC_STATE.params.method) || "dialectical";
      const _parentOverhead = parentOverheadForSection(
        _participantsForBudget, sectionKey, _genOrder, _synthLevel, _method
      );
      const _baseWithCritic = (sectionKey === "critique") ? Math.floor(baseBudget * 1.5) : baseBudget;
      const _pressure = applyBudgetPressure(_baseWithCritic, _parentOverhead, _keepFullBudget);
      const totalBudget = _pressure.effectiveBudget;
      const _rawBaseBudget = _baseWithCritic;
      const _conceptOverheadApplied = _pressure.applied;
      const _budgetModeForLog = _pressure.mode;

        // 1. Обязательный контекст
        const requiredParts = [];
        const logEntries = [];
        for (const key of deps.required) {
          const text = extractContextFragment(key, generated);
          if (text) {
            requiredParts.push({ key, text });
            logEntries.push({ key, status: "found", len: text.length, priority: "required", 
              isSubstitute: !_origAllKeys.has(key) 
            });
          } else {
            logEntries.push({ key, status: "missing", len: 0, priority: "required",
              isSubstitute: !_origAllKeys.has(key) 
            });
          }
        }

        // 2. Остаток бюджета
        const requiredLen = requiredParts.reduce((sum, p) => sum + p.text.length, 0);
        let remainingBudget = totalBudget - requiredLen;

        // 3. Опциональный контекст
        const optionalParts = [];
        if (remainingBudget > 500) {
          for (const key of deps.optional) {
            if (remainingBudget <= 300) {
              logEntries.push({ key, status: "skipped_budget", len: 0, priority: "optional", note: "бюджет исчерпан: осталось " + remainingBudget + " симв.",
              isSubstitute: !_origAllKeys.has(key) 
              });
              continue;
            }
            const text = extractContextFragment(key, generated);
            if (!text) {
              logEntries.push({ key, status: "missing", len: 0, priority: "optional",
                isSubstitute: !_origAllKeys.has(key) 
              });
              continue;
            }
            if (text.length <= remainingBudget) {
              optionalParts.push({ key, text });
              remainingBudget -= text.length;
              logEntries.push({ key, status: "found", len: text.length, priority: "optional",
                isSubstitute: !_origAllKeys.has(key) 
              });
            } else {
              const truncLen = remainingBudget - 50;
              optionalParts.push({ key, text: truncateText(text, truncLen) });
              logEntries.push({ key, status: "truncated", len: truncLen, priority: "optional",
                note: "обрезан с " + text.length + " до " + truncLen,
                isSubstitute: !_origAllKeys.has(key) 
              });
              remainingBudget = 0;
              // Не обрываем цикл: остаток опциональных ключей должен
              // залогироваться как skipped_budget (условие в начале
              // следующей итерации это обеспечивает). Иначе записи о
              // полностью пропущенных опциональных контекстах вообще
              // не попадают в ctxLog.
            }
          }
        } else {
          for (const key of deps.optional) {
            logEntries.push({ key, status: "skipped_budget", len: 0, priority: "optional",
              note: "бюджет исчерпан: осталось " + remainingBudget + " симв.",
              isSubstitute: !_origAllKeys.has(key) 
            });
          }
        }

        // 4. Если обязательный контекст сильно превышает бюджет — обрезаем
        //    наименее критичные, но ТАБЛИЦЫ ГРАФА и ЦЕЛИ не трогаем
        if (requiredLen > totalBudget * 1.5) {
          const UNTOUCHABLE = new Set(["graph:nodes", "graph:edges", "sum:goals", "sum:tensions"]);
          for (let j = requiredParts.length - 1; j >= 0; j--) {
            const currentTotal = requiredParts.reduce((s, p) => s + p.text.length, 0);
            if (currentTotal <= totalBudget * 1.3) break;
            if (UNTOUCHABLE.has(requiredParts[j].key)) continue;
            requiredParts[j].text = truncateText(requiredParts[j].text,
              Math.max(500, Math.floor(requiredParts[j].text.length * 0.5)));
          }
        }

        // 4b. Логируем утраченные ключи из оригинальных зависимостей
        const effectiveAllKeys = new Set([...deps.required, ...deps.optional]);
        if (_origDeps) {
          const available = new Set(["sum", ...Object.keys(effectiveDepsMap || {})]);

          for (const tier of ["required", "optional"]) {
            for (const origKey of (_origDeps[tier] || [])) {
              if (effectiveAllKeys.has(origKey)) continue;

              const src = sourceOf(origKey);
              const sub = findSubstitute(origKey, available, sectionKey);
              let note, status;

              if (sub && effectiveAllKeys.has(sub)) {
                // Случай 1: заменитель найден И присутствует в effective deps.
                // Он уже залогирован как обычный found/truncated — 
                // не дублируем, просто пропускаем.
                continue;
              } else if (sub) {
                // Случай 2: заменитель существовал, но был удалён 
                // (например, resolveCircularDeps отрезал ребро)
                status = "dropped";
                note = "замена " + (CTX_LABELS[sub] || sub) +
                       " удалена при разрешении цикла";
              } else if (!available.has(src)) {
                // Случай 3: раздел-источник не выбран, замены нет
                status = "dropped";
                note = "раздел-источник не выбран, замена не найдена";
              } else {
                // Случай 4: источник доступен, но ключ всё равно 
                // отсутствует (удалён resolveCircularDeps напрямую)
                status = "dropped";
                note = "удалён при разрешении цикла зависимостей";
              }

              logEntries.push({
                key: origKey,
                status,
                len: 0,
                priority: tier,
                isSubstitute: false,
                note,
              });
            }
          }
        }

        // 5. Сохраняем лог
        const totalUsed = requiredParts.reduce((s, p) => s + p.text.length, 0)
                        + optionalParts.reduce((s, p) => s + p.text.length, 0);
        ctxLog.push({
          sectionKey,
          rawBaseBudget: _rawBaseBudget,
          conceptOverheadApplied: _conceptOverheadApplied,
          budgetMode: _budgetModeForLog,
          budget: totalBudget,
          entries: logEntries,
          totalUsed,
          reqFound: logEntries.filter(e => e.priority === "required" && e.status === "found").length,
          reqTotal: deps.required.length,
          optIncluded: logEntries.filter(e => e.priority === "optional" && (e.status === "found" || e.status === "truncated")).length,
          optTotal: deps.optional.length,
          parentSpec: buildParentSpecForLog(_participantsForBudget, sectionKey, _genOrder, _synthLevel, _method),
        });

        // 6. Форматируем
        const allParts = [...requiredParts, ...optionalParts];
        if (allParts.length === 0) return "";
        const formatted = allParts.map(p => {
          const label = CTX_LABELS[p.key] || p.key;
          return "### " + label + "\n" + p.text;
        }).join("\n\n");

       return "\n\nКОНТЕКСТ ИЗ ПРЕДЫДУЩИХ РАЗДЕЛОВ (используй термины, §§ и названия категорий; не повторяй содержание):\n\"\"\"\n" + formatted + "\n\"\"\"";
      }

// ───── [parentOverheadForSection] philosynth.html строки 10150–10180 ─────
      function parentOverheadForSection(participants, sectionKey, order, synthLevel, method, subsectionName) {
        if (!participants || !participants.length) return 0;
        const key = String(sectionKey || "").split("+")[0].split(":")[0];
        // Для подраздельной регенерации — используем intra-спец.
        // Для section-уровня — полный патч-резолвер (учитывает LEVEL/METHOD).
        let fields;
        if (subsectionName) {
          const spec = resolveParentDepsForSubsection(
            { generationOrder: order, synthLevel, method }, key, subsectionName
          );
          fields = spec
            ? new Set([...(spec.required || []), ...(spec.optional || [])])
            : new Set(["capsule"]);
        } else {
          const deps = resolveParentDeps({ generationOrder: order, synthLevel, method });
          const spec = deps[key];
          fields = spec
            ? new Set([...(spec.required || []), ...(spec.optional || [])])
            : new Set(["capsule"]);
        }
        let total = 0;
        for (const c of participants) {
          if (!c || c.type !== "concept") continue;
          for (const fld of fields) {
            const val = c[fld];
            if (val) total += val.length;
          }
          total += 200;
        }
        return total;
      }

// ───── [applyBudgetPressure] philosynth.html строки 10141–10148 ─────
      function applyBudgetPressure(baseBudget, conceptOverhead, keepFullBudget) {
        if (keepFullBudget || !conceptOverhead) {
          return { effectiveBudget: baseBudget, applied: 0,
                   mode: keepFullBudget ? 'full' : 'shrink' };
        }
        const effective = Math.max(baseBudget - conceptOverhead, Math.floor(baseBudget * 0.4));
        return { effectiveBudget: effective, applied: baseBudget - effective, mode: 'shrink' };
      }

// ───── [computeConceptOverhead] philosynth.html строки 10133–10139 ─────
      function computeConceptOverhead(participants) {
        if (!participants) return 0;
        return participants.filter(x => x && x.type === "concept").reduce((sum, c) =>
          sum + (c.capsule?.length || 0) + (c.graphNodes?.length || 0) +
                (c.glossaryCompact?.length || 0) + (c.thesesSummary?.length || 0) +
                (c.goals?.length || 0) + (c.tensions?.length || 0), 0);
      }

// ───── [getSectionContextQuality] philosynth.html строки 5571–5621 ─────
      function getSectionContextQuality(sectionKey) {
        // Ищем последний ctxLog для этого раздела (может быть несколько при перегенерациях)
        const entries = ctxLog.filter(e => e.sectionKey === sectionKey);
        if (!entries.length) return null;

        const entry = entries[entries.length - 1]; // последний
        const issues = [];

        // Отсутствующие обязательные
        const missingReq = entry.entries.filter(e =>
          e.priority === "required" && (e.status === "missing" || e.status === "dropped")
        );
        if (missingReq.length > 0) {
          const names = missingReq.map(e => CTX_LABELS[e.key] || e.key);
          issues.push("Отсутствовали обязательные: " + names.join(", "));
        }

        // Пропущенные из-за бюджета
        const skipped = entry.entries.filter(e => e.status === "skipped_budget");
        if (skipped.length > 0) {
          issues.push(skipped.length + " контекст(ов) пропущено из-за бюджета");
        }

        // Обрезанные
        const truncated = entry.entries.filter(e => e.status === "truncated");
        if (truncated.length > 0) {
          issues.push(truncated.length + " контекст(ов) обрезано");
        }

        // Заменители
        const substitutes = entry.entries.filter(e => e.isSubstitute && e.status === "found");
        if (substitutes.length > 0) {
          issues.push(substitutes.length + " подстановок(ки)");
        }

        // Общий score: 0-100
        const reqScore = entry.reqTotal > 0 ? (entry.reqFound / entry.reqTotal) : 1;
        const budgetUsage = entry.budget > 0 ? Math.min(1, entry.totalUsed / entry.budget) : 0;
        const score = Math.round(reqScore * 70 + budgetUsage * 30);

        return {
          score,
          reqFound: entry.reqFound,
          reqTotal: entry.reqTotal,
          optIncluded: entry.optIncluded,
          optTotal: entry.optTotal,
          budgetUsed: entry.totalUsed,
          budget: entry.budget,
          issues,
        };
      }

// ───── [buildParentSpecForLog] philosynth.html строки 10197–10231 ─────
      function buildParentSpecForLog(participants, sectionKey, order, synthLevel, method, subsectionName) {
        const concepts = (participants || []).filter(x => x && x.type === "concept");
        if (concepts.length === 0) return null;
        const key = String(sectionKey || "").split("+")[0].split(":")[0];
        const spec = subsectionName
          ? resolveParentDepsForSubsection(
              { generationOrder: order, synthLevel, method }, key, subsectionName
            )
          : (resolveParentDeps({ generationOrder: order, synthLevel, method })[key]);
        const required = (spec && spec.required) || ["capsule"];
        const optional = (spec && spec.optional) || [];
        const allAllowed = new Set([...required, ...optional]);

        const perParent = concepts.map(c => {
          const included = [], omitted = [], missingRequired = [];
          for (const fld of PARENT_FIELD_ORDER) {
            if (allAllowed.has(fld)) {
              if (c[fld]) included.push(fld);
              else if (required.includes(fld)) missingRequired.push(fld);
            } else {
              if (c[fld]) omitted.push(fld);
            }
          }
          let chars = 0;
          for (const fld of included) {
            chars += (c[fld] || "").length;
            chars += (PARENT_FIELD_LABELS[fld] || fld).length + 4;
          }
          chars += 90 + (c.name || "").length;
          return { name: c.name, includedFields: included, omittedFields: omitted,
                   missingRequired, chars };
        });
        const totalChars = perParent.reduce((s, pp) => s + pp.chars, 0);
        return { required, optional, perParent, totalChars };
      }
