// Фрагмент philosynth.html (26025 строк) — собран
// scripts/extract-by-name.py по спецификации 4.1-mode-service.spec.
//
// Номера строк ниже — РЕЗУЛЬТАТ поиска по именам, а не входные
// данные: при правке исходника достаточно перезапустить сборку,
// спецификация не устаревает. Имена берутся из
// docs/04-code-reuse-map.md.

// ───── Конфигурация режимов и их зависимости · var:MODE_CONFIG
// philosynth.html строки 22578–22648 ─────

      const MODE_CONFIG = {
        adversarial: {
          title: "⚔ Оппонент",
          desc: "Генерирует контр-документ от лица философа или традиции, несовместимой с синтезом.",
          paramLabel: "Философ или традиция-оппонент",
          paramPlaceholder: "Например: Кант, логический позитивизм, буддийская Абхидхарма...",
          suggestions: ["Кант", "Логический позитивизм", "Буддийская Абхидхарма", "Маркс", "Постмодернизм"],
          buildPrompt(paramValue, ctx) {
            return `Ты — философ-оппонент, представляющий позицию: ${paramValue}.

      ЗАДАЧА: Составь полноценный контр-документ к следующей концепции. НЕ «найди слабые места», а ОПРОВЕРГНИ синтез изнутри системы (${paramValue}). Покажи, почему эта концепция несостоятельна с точки зрения данной традиции.

      ${ctx}

      СТРУКТУРА ОТВЕТА:
      1. Фундаментальное расхождение — в чём позиция (${paramValue}) принципиально несовместима с данным синтезом
      2. Критика категорий — какие категории синтеза невозможны или бессмысленны с позиции оппонента
      3. Контр-тезисы — альтернативные утверждения по каждому ключевому тезису
      4. Итоговый вердикт — почему данный синтез не выдерживает критики

      Отвечай HTML: <div class="doc-content">...</div>`;
          },
        },
        translator: {
          title: "🔄 Переводчик",
          desc: "Переформулирует концепцию в терминах другой философской традиции.",
          paramLabel: "Целевая традиция",
          paramPlaceholder: "Например: аналитическая философия разума, буддийская Абхидхарма...",
          suggestions: ["Аналитическая ФР", "Буддийская Абхидхарма", "Феноменология Гуссерля", "Прагматизм"],
          buildPrompt(paramValue, ctx) {
            return `Ты — специалист по (${paramValue}), глубоко понимающий и эту традицию, и традиции исходного синтеза.

      ЗАДАЧА: Переведи данную концепцию в словарь и категориальный аппарат (${paramValue}). Для КАЖДОГО узла графа и КАЖДОГО термина — найди аналог или объясни, почему аналога нет.

      ${ctx}

      СТРУКТУРА ОТВЕТА:
      1. Таблица перевода терминов: Термин синтеза | Аналог в (${paramValue}) | Точность (1–10) | Что теряется
      2. Граф в переводе — как перестраиваются связи
      3. Непереводимые элементы — что принципиально непереводимо и почему
      4. Обнаруженные контакты — где перевод оказался точнее оригинала

      Отвечай HTML: <div class="doc-content">...</div>`;
          },
        },
        timeslice: {
          title: "⏳ Временной срез",
          desc: "Проецирует концепцию в конкретный исторический период.",
          paramLabel: "Исторический период",
          paramPlaceholder: "Например: Афины V в. до н.э., Средневековый Париж XIII в....",
          suggestions: ["Афины V в. до н.э.", "Париж XIII в.", "Вена 1920-х", "Киото XVII в."],
          buildPrompt(paramValue, ctx) {
            return `Ты — историк философии, специализирующийся на периоде: ${paramValue}.

      ЗАДАЧА: Спроецируй данную концепцию назад во времени. Как бы она была принята и интерпретирована в (${paramValue})?

      ${ctx}

      СТРУКТУРА ОТВЕТА:
      1. Первая реакция — как мыслители (${paramValue}) восприняли бы концепцию
      2. Понятное и непонятное — что доступно пониманию, что вне горизонта эпохи
      3. Переименование — в каких терминах эпохи концепцию описали бы
      4. Подлинная новизна — что действительно ново (не могло быть понято до XXI века)

      Если в контексте присутствуют расширенные характеристики категорий (историческая значимость, степень инновации) — используй их: категории с высокой исторической значимостью скорее всего имеют аналоги в целевом периоде; категории с высокой инновацией — скорее всего непонятны.

      Отвечай HTML: <div class="doc-content">...</div>`;
          },
        },
      };

// ───── Конфигурация режимов и их зависимости · var:MODE_DEPS
// philosynth.html строки 22543–22556 ─────
      const MODE_DEPS = {
        adversarial: {
          required: ["capsule:full", "theses:summary", "critique:final_table"],
          optional: ["graph:nodes", "theses:full"],
        },
        translator: {
          required: ["capsule:full", "graph:nodes", "glossary:table"],
          optional: ["theses:summary"],
        },
        timeslice: {
          required: ["capsule:full"],
          optional: ["history:genealogy", "history:contemporary"],
        },
      };

// ───── Ядро (server/services/mode-service.ts) · js:buildModeContext
// philosynth.html строки 22651–22741 ─────
      function buildModeContext(modeKey) {
        const deps = getEffectiveModeDeps(modeKey, DOC_STATE.params);
        if (!deps) return "";

        const generated = {};

        // Строим маппинг по реальным DOM-атрибутам data-section-key,
        // а не по sectionDbIdx, который может быть рассинхронизирован
        // после частичной генерации поверх импорта.
        const docBodies = document.getElementById("docBodies");
        if (docBodies) {
          const bodyEls = docBodies.querySelectorAll(".doc-body[data-section-key]");
          for (const el of bodyEls) {
            if (!el.querySelector(".doc-section")) continue;
            const keys = el.getAttribute("data-section-key").split("+");
            for (const key of keys) {
              if (key === "capsule") continue;
              generated[key] = el;
            }
          }
        }

        console.log("[buildModeContext]", modeKey,
          "generated keys:", Object.keys(generated),
          "sectionOrder:", DOC_STATE.sectionOrder,
          "sectionDbIdx:", JSON.stringify(DOC_STATE.sectionDbIdx));

        const parts = [];
        const logEntries = [];
        const budget = 12000;
        let used = 0;

        for (const ctxKey of deps.required) {
          try {
            const text = extractContextFragment(ctxKey, generated);
            if (text) {
              parts.push("### " + (CTX_LABELS[ctxKey] || ctxKey) + "\n" + text);
              logEntries.push({ key: ctxKey, status: "found", len: text.length, priority: "required" });
              used += text.length;
            } else {
              console.warn("[buildModeContext] required key missing:", ctxKey);
              logEntries.push({ key: ctxKey, status: "missing", len: 0, priority: "required" });
            }
          } catch (err) {
            console.error("[buildModeContext] error extracting", ctxKey, err);
            logEntries.push({ key: ctxKey, status: "error", len: 0, priority: "required", note: err.message });
          }
        }

        for (const ctxKey of deps.optional) {
          if (used >= budget) {
            logEntries.push({ key: ctxKey, status: "skipped_budget", len: 0, priority: "optional", note: "бюджет исчерпан" });
            continue;
          }
          try {
            const text = extractContextFragment(ctxKey, generated);
            if (text) {
              const truncated = text.length + used > budget
                ? truncateText(text, budget - used) : text;
              parts.push("### " + (CTX_LABELS[ctxKey] || ctxKey) + "\n" + truncated);
              logEntries.push({ key: ctxKey, status: truncated.length < text.length ? "truncated" : "found",
                                len: truncated.length, priority: "optional" });
              used += truncated.length;
            } else {
              logEntries.push({ key: ctxKey, status: "missing", len: 0, priority: "optional" });
            }
          } catch (err) {
            console.error("[buildModeContext] error extracting", ctxKey, err);
            logEntries.push({ key: ctxKey, status: "error", len: 0, priority: "optional", note: err.message });
          }
        }

        console.log("[buildModeContext] result:", parts.length, "parts,", used, "chars,",
          logEntries.filter(e => e.status === "error").length, "errors");

        // Логируем в ctxLog
        ctxLog.push({
          sectionKey: "mode:" + modeKey,
          budget,
          entries: logEntries,
          totalUsed: used,
          reqFound: logEntries.filter(e => e.priority === "required" && e.status === "found").length,
          reqTotal: deps.required.length,
          optIncluded: logEntries.filter(e => e.priority === "optional" && (e.status === "found" || e.status === "truncated")).length,
          optTotal: deps.optional.length,
        });

        return parts.length > 0
          ? "КОНТЕКСТ КОНЦЕПЦИИ:\n\"\"\"\n" + parts.join("\n\n") + "\n\"\"\""
          : "";
      }

// ───── Ядро (server/services/mode-service.ts) · js:checkModeDeps
// philosynth.html строки 22782–22804 ─────
      function checkModeDeps(modeKey) {
        const deps = getEffectiveModeDeps(modeKey, DOC_STATE.params);
        if (!deps) return [];

        const warnings = [];
        const available = new Set(DOC_STATE.sectionOrder);

        for (const ctxKey of deps.required) {
          const src = sourceOf(ctxKey);
          if (src !== "sum" && !available.has(src)) {
            warnings.push({ level: "error", text: "Обязательный контекст «" + (CTX_LABELS[ctxKey] || ctxKey) + "» недоступен (раздел «" + (KEY_LABELS[src] || src) + "» не сгенерирован)." });
          }
        }

        for (const ctxKey of deps.optional) {
          const src = sourceOf(ctxKey);
          if (src !== "sum" && !available.has(src)) {
            warnings.push({ level: "info", text: "Дополнительный контекст «" + (CTX_LABELS[ctxKey] || ctxKey) + "» недоступен — качество может быть снижено." });
          }
        }

        return warnings;
      }

// ───── Ядро (server/services/mode-service.ts) · js:getEffectiveModeDeps
// philosynth.html строки 22557–22577 ─────

      function getEffectiveModeDeps(modeKey, p) {
        const base = MODE_DEPS[modeKey];
        if (!base) return { required: [], optional: [] };

        if (p?.generationOrder === "genetic") {
          // Заменяем graph:nodes на dialogue:new_concepts, если графа нет
          const hasGraph = DOC_STATE.sectionOrder?.includes("graph");
          const mapKey = (k) => {
            if (k === "graph:nodes" && !hasGraph) return "dialogue:new_concepts";
            if (k === "graph:edges" && !hasGraph) return "dialogue:turning_points";
            return k;
          };
          return {
            required: base.required.map(mapKey),
            optional: base.optional.map(mapKey),
          };
        }

        return base;
      }

// ───── Ядро (server/services/mode-service.ts) · js:getAffectedModes
// philosynth.html строки 22814–22867 ─────
      function getAffectedModes(changedSections, changedSubsections) {
        const affected = [];

        for (const [modeKey, results] of Object.entries(DOC_STATE.modes || {})) {
          if (!Array.isArray(results)) continue;
          const deps = getEffectiveModeDeps(modeKey, DOC_STATE.params);
          if (!deps) continue;
          const config = MODE_CONFIG[modeKey];
          const allCtxKeys = [...(deps.required || []), ...(deps.optional || [])];

          for (let i = 0; i < results.length; i++) {
            if (!results[i]?.html) continue;
            let found = false;

            // Проверяем разделы
            for (const ctxKey of allCtxKeys) {
              const src = sourceOf(ctxKey);
              if (changedSections.includes(src)) {
                affected.push({
                  modeKey,
                  index: i,
                  param: results[i].param,
                  title: (config?.title || modeKey) + " · " + results[i].param,
                  reason: "Изменён раздел «" + (KEY_LABELS[src] || src) + "» (контекст: " + (CTX_LABELS[ctxKey] || ctxKey) + ")",
                });
                found = true;
                break;
              }
            }

            // Проверяем подразделы (через SUBSECTION_TO_CTX_KEYS)
            if (!found && changedSubsections) {
              for (const subId of changedSubsections) {
                const [secKey, subName] = subId.split(":");
                const canonSub = canonicalSubsectionKey(secKey, subName);
                const ctxKeys = (SUBSECTION_TO_CTX_KEYS[secKey] || {})[canonSub] || [];
                const overlap = ctxKeys.filter(k => allCtxKeys.includes(k));
                if (overlap.length > 0) {
                  affected.push({
                    modeKey,
                    index: i,
                    param: results[i].param,
                    title: (config?.title || modeKey) + " · " + results[i].param,
                    reason: "Изменён подраздел «" + subName + "» в «" + (KEY_LABELS[secKey] || secKey) + "»",
                  });
                  break;
                }
              }
            }
          }
        }

        return affected;
      }

// ───── Ядро (server/services/mode-service.ts) · js:runMode
// philosynth.html строки 23020–23157 ─────

      async function runMode() {
        const config = MODE_CONFIG[_currentMode];
        if (!config) return;

        const paramValue = document.getElementById("modeParamInput")?.value?.trim();
        if (!paramValue) { alert("Заполните параметр."); return; }
        if (!API_KEY) { alert("API-ключ не задан."); return; }

        const btn = document.getElementById("modeRunBtn");
        const spinner = document.getElementById("modeSpinner");
        const runText = document.getElementById("modeRunText");
        btn.disabled = true;
        spinner.style.display = "block";
        runText.textContent = "Генерация...";
        // Показываем кнопку отмены (скроем в finally)
        const modeAbortBtn = document.getElementById("modeAbortBtn");
        if (modeAbortBtn) modeAbortBtn.classList.add("visible");

        // Инициализируем массив для этого режима, если его нет
        if (!DOC_STATE.modes[_currentMode]) {
          DOC_STATE.modes[_currentMode] = [];
        }

        // Создаём новую вкладку со спиннером
        const newIndex = DOC_STATE.modes[_currentMode].length;
        addModeTab(_currentMode, paramValue, newIndex);

        const content = document.getElementById("modeContent");
        content.innerHTML = "";

        try {
          const ctx = buildModeContext(_currentMode);
          const prompt = config.buildPrompt(paramValue, ctx);
          const SYS = buildSYS(DOC_STATE.params, { outputMode: "mode" });

          // GenLog запись
          const genEntry = {
            sectionKey: "mode:" + _currentMode,
            sectionLabel: config.title + " · " + paramValue,
            priorChars: ctx.length,
            taskChars: prompt.length - ctx.length,  
            inputChars: SYS.length + prompt.length, 
            outputChars: 0, 
            inputTokens: 0, 
            outputTokens: 0,
            cost: 0, 
            error: null, 
            status: "streaming",
            source: "mode",
            expectedSubsections: [], 
            subsections: [],
            _sys: SYS,
            _promptSkeleton: buildPromptSkeleton(prompt),
            modeParam: paramValue,
            ctxChars: ctx.length,
          };
          genLog.push(genEntry);
          refreshCtxLogIfOpen();

          const usage = await streamResp(prompt, content, SYS, (chars) => {
            runText.textContent = "Генерация... " + chars + " симв.";
            genEntry.outputChars = chars;
          });

          totalInputTokens += usage.input_tokens;
          totalOutputTokens += usage.output_tokens;
          updateFooterCost();

          genEntry.inputTokens = usage.input_tokens;
          genEntry.outputTokens = usage.output_tokens;
          genEntry.outputChars = content.innerHTML.length;
          genEntry.cost = usage.input_tokens * PRICE_IN + usage.output_tokens * PRICE_OUT;
          genEntry.status = "done";
          refreshCtxLogIfOpen();

          const cost = genEntry.cost;
          document.getElementById("modeInfo").textContent =
            usage.input_tokens.toLocaleString("ru") + " вх. + " +
            usage.output_tokens.toLocaleString("ru") + " вых. · $" + cost.toFixed(4);

          // Сохраняем результат — push в массив, не перезапись
          DOC_STATE.modes[_currentMode].push({
            html: content.innerHTML,
            param: paramValue,
            timestamp: new Date().toISOString(),
          });

          const v = typeof DOC_STATE.docVersion === "object"
            ? DOC_STATE.docVersion
            : parseVersion(DOC_STATE.docVersion);
          v.modes += 1;
          DOC_STATE.docVersion = v;

          // Финализируем вкладку
          finalizeModeTab(_currentMode, newIndex);

        } catch (err) {
          content.innerHTML = `<div class="callout warning"><span class="callout-label">⚠ Ошибка</span>${err.message}</div>`;
          const lastEntry = genLog[genLog.length - 1];
          if (lastEntry && lastEntry.sectionKey === "mode:" + _currentMode) {
            lastEntry.status = "error";
            lastEntry.error = err.message;
            // Если max-tokens — токены реально потрачены, учитываем через err._usage
            if (err._usage) {
              totalInputTokens += err._usage.input_tokens || 0;
              totalOutputTokens += err._usage.output_tokens || 0;
              lastEntry.inputTokens = err._usage.input_tokens || 0;
              lastEntry.outputTokens = err._usage.output_tokens || 0;
              lastEntry.cost = (err._usage.input_tokens || 0) * PRICE_IN
                             + (err._usage.output_tokens || 0) * PRICE_OUT;
              lastEntry.outputChars = content.innerHTML.length;
              updateFooterCost();
            }
          }
          refreshCtxLogIfOpen();

          // Убираем вкладку со спиннером — результата нет
          const bar = document.getElementById("modeTabsBar");
          const addingTab = bar?.querySelector(".mode-tab.adding");
          if (addingTab) addingTab.remove();

          // Переключаемся на предыдущую вкладку, если есть
          const results = DOC_STATE.modes[_currentMode] || [];
          if (results.length > 0) {
            buildModeTabsBar(_currentMode, results);
            switchModeTab(_currentMode, results.length - 1);
          } else {
            buildModeTabsBar(_currentMode, []);
          }
        } finally {
          btn.disabled = false;
          spinner.style.display = "none";
          runText.textContent = "Генерировать";
          // Скрываем кнопку отмены
          if (modeAbortBtn) modeAbortBtn.classList.remove("visible");
        }
      }

// ───── Ядро (server/services/mode-service.ts) · js:regenerateModeSilent
// philosynth.html строки 23165–23222 ─────
      async function regenerateModeSilent(modeKey, index) {
        const results = DOC_STATE.modes[modeKey];
        if (!Array.isArray(results) || !results[index]) return;
        const modeData = results[index];
        const config = MODE_CONFIG[modeKey];
        if (!config) return;
        const p = DOC_STATE.params; 

        const ctx = buildModeContext(modeKey);
        const prompt = config.buildPrompt(modeData.param, ctx);
        const SYS = buildSYS(p, { outputMode: "mode" });
        const tempContainer = document.createElement("div");
        tempContainer.style.display = "none";
        document.body.appendChild(tempContainer);

        const genEntry = {
          sectionKey: "mode:" + modeKey,
          sectionLabel: config.title + " · " + modeData.param + " [каскад]",
          priorChars: ctx.length, taskChars: prompt.length,
          inputChars: SYS.length + prompt.length,
          outputChars: 0, inputTokens: 0, outputTokens: 0,
          cost: 0, error: null, status: "streaming", source: "mode-cascade",
          expectedSubsections: [], subsections: [],
        };
        genLog.push(genEntry);

        try {
          const usage = await streamResp(prompt, tempContainer, SYS, (chars) => {
            genEntry.outputChars = chars;
          });
          totalInputTokens += usage.input_tokens;
          totalOutputTokens += usage.output_tokens;
          genEntry.inputTokens = usage.input_tokens;
          genEntry.outputTokens = usage.output_tokens;
          genEntry.outputChars = tempContainer.innerHTML.length;
          genEntry.cost = usage.input_tokens * PRICE_IN + usage.output_tokens * PRICE_OUT;
          genEntry.status = "done";
          results[index] = {
            html: tempContainer.innerHTML,
            param: modeData.param,
            timestamp: new Date().toISOString(),
          };

          const v = typeof DOC_STATE.docVersion === "object"
            ? DOC_STATE.docVersion
            : parseVersion(DOC_STATE.docVersion);
          v.modeRegen += 1;
          DOC_STATE.docVersion = v;

          refreshCtxLogIfOpen();
          updateFooterCost();
        } catch (err) {
          genEntry.status = "error";
          genEntry.error = err.message;
        } finally {
          tempContainer.remove();
        }
      }

// ───── здесь как референс вызова · js:estimateModeCost
// philosynth.html строки 22748–22779 ─────
      function estimateModeCost(modeKey) {
        const deps = getEffectiveModeDeps(modeKey, DOC_STATE.params);
        if (!deps) return null;
        const p = DOC_STATE.params;
        if (!p) return null;

        // Входные: sys + промпт режима + контекст
        // SYS для режима чуть короче (mode-режим), учитываем в оценке.
        const sysChars = genCommon?.sysChars || buildSYS(p, { outputMode: "mode" }).length;
        const promptBaseChars = 800; // фиксированная часть промпта режима

        // Контекст: оценка по зависимостям
        let ctxEstimate = 0;
        for (const ctxKey of [...deps.required, ...deps.optional]) {
          const src = sourceOf(ctxKey);
          const share = FRAGMENT_SHARE[ctxKey] ?? 0.25;
          const srcMult = SECTION_OUTPUT_MULT[src] ?? SECTION_OUTPUT_MULT._default;
          const srcOutput = mw(p) * srcMult * WORDS_TO_CHARS * HTML_OVERHEAD;
          ctxEstimate += Math.round(srcOutput * share);
        }
        ctxEstimate = Math.min(ctxEstimate, 12000); // бюджет режима

        const totalInChars = sysChars + promptBaseChars + ctxEstimate;

        // Выход: режим ≈ средний раздел
        const totalOutChars = Math.round(mw(p) * 3.5 * WORDS_TO_CHARS * HTML_OVERHEAD);

        const inTokens = Math.ceil(totalInChars / CHARS_PER_TOKEN);
        const outTokens = Math.ceil(totalOutChars / CHARS_PER_TOKEN);
        const cost = inTokens * PRICE_IN + outTokens * PRICE_OUT;
        return { inTokens, outTokens, cost };
      }

// ───── UI режимов (вкладки и модалка) · js:buildModeTabsBar
// philosynth.html строки 22874–22893 ─────
      function buildModeTabsBar(modeKey, results) {
        const bar = document.getElementById("modeTabsBar");
        if (!results || !results.length) {
          bar.style.display = "none";
          bar.innerHTML = "";
          return;
        }
        bar.style.display = "flex";
        bar.innerHTML = results.map((r, i) => {
          const label = truncLabel(r.param, 24);
          const date = new Date(r.timestamp).toLocaleDateString("ru-RU");
          return `<button class="mode-tab" data-index="${i}"
                    onclick="switchModeTab('${modeKey}',${i})">
              ${esc(label)}
              <span class="mode-tab-date">${date}</span>
              <span class="mode-tab-close"
                    onclick="event.stopPropagation();removeModeResult('${modeKey}',${i})">×</span>
            </button>`;
        }).join("");
      }

// ───── UI режимов (вкладки и модалка) · js:switchModeTab
// philosynth.html строки 22896–22912 ─────
      function switchModeTab(modeKey, index) {
        const results = DOC_STATE.modes[modeKey];
        if (!results || index < 0 || index >= results.length) return;

        // Подсветка
        const tabs = document.querySelectorAll("#modeTabsBar .mode-tab");
        tabs.forEach((t, i) => t.classList.toggle("active", i === index));

        // Содержимое
        document.getElementById("modeContent").innerHTML = results[index].html;

        // Footer
        const config = MODE_CONFIG[modeKey];
        document.getElementById("modeInfo").textContent =
          (config?.desc || "") + " · " + results[index].param +
          " · " + new Date(results[index].timestamp).toLocaleString("ru-RU");
      }

// ───── UI режимов (вкладки и модалка) · js:addModeTab
// philosynth.html строки 22915–22927 ─────
      function addModeTab(modeKey, param, index) {
        const bar = document.getElementById("modeTabsBar");
        bar.style.display = "flex";

        // Снять active с остальных
        bar.querySelectorAll(".mode-tab").forEach(t => t.classList.remove("active"));

        const tab = document.createElement("button");
        tab.className = "mode-tab active adding";
        tab.dataset.index = index;
        tab.innerHTML = `⟳ ${esc(truncLabel(param, 24))}`;
        bar.appendChild(tab);
      }

// ───── UI режимов (вкладки и модалка) · js:finalizeModeTab
// philosynth.html строки 22930–22934 ─────
      function finalizeModeTab(modeKey, index) {
        const results = DOC_STATE.modes[modeKey] || [];
        buildModeTabsBar(modeKey, results);
        switchModeTab(modeKey, index);
      }

// ───── UI режимов (вкладки и модалка) · js:removeModeResult
// philosynth.html строки 22937–22954 ─────
      function removeModeResult(modeKey, index) {
        const results = DOC_STATE.modes[modeKey];
        if (!results || !results[index]) return;
        if (!confirm("Удалить результат «" + results[index].param + "»?")) return;

        results.splice(index, 1);

        if (results.length === 0) {
          delete DOC_STATE.modes[modeKey];
          document.getElementById("modeContent").innerHTML = "";
          document.getElementById("modeInfo").textContent = MODE_CONFIG[modeKey]?.desc || "—";
        }

        buildModeTabsBar(modeKey, results);
        if (results.length > 0) {
          switchModeTab(modeKey, Math.min(index, results.length - 1));
        }
      }

// ───── UI режимов (вкладки и модалка) · js:openModeModal
// philosynth.html строки 22955–23014 ─────

      function openModeModal(mode) {
        _currentMode = mode;
        const config = MODE_CONFIG[mode];
        if (!config) return;

        document.getElementById("modeTitle").textContent = config.title;
        document.getElementById("modeInfo").textContent = config.desc;

        // Параметры
        const paramsGroup = document.getElementById("modeParamsGroup");
        paramsGroup.innerHTML = `
          <div class="form-label">${esc(config.paramLabel)}</div>
          <input class="form-input" id="modeParamInput" placeholder="${esc(config.paramPlaceholder)}"
                 onkeydown="if(event.key==='Enter')runMode()">
        `;

        // Кнопки-подсказки
        const sugEl = document.getElementById("modeSuggestions");
        sugEl.innerHTML = (config.suggestions || []).map(s =>
          `<button class="edit-sec-btn" style="font-size:9px;padding:3px 8px"
                   onclick="document.getElementById('modeParamInput').value='${esc(s)}'">${esc(s)}</button>`
        ).join("");

        // Предупреждения о зависимостях
        const warnings = checkModeDeps(mode);
        const warnEl = document.getElementById("modeDepsWarnings");
        warnEl.innerHTML = warnings.map(w => {
          const cls = w.level === "error" ? "sec-warning-item" : "sec-recommend-item";
          const icon = w.level === "error" ? "⚠" : "💡";
          return `<div class="${cls}" style="margin-bottom:4px"><span class="warn-icon">${icon}</span><span>${esc(w.text)}</span></div>`;
        }).join("");

        // Вкладки с результатами
        const results = DOC_STATE.modes[mode] || [];
        buildModeTabsBar(mode, results);

        // Показать последнюю вкладку или пустое содержимое
        const content = document.getElementById("modeContent");
        if (results.length > 0) {
          switchModeTab(mode, results.length - 1);
        } else {
          content.innerHTML = "";
        }

        document.getElementById("modeOverlay").classList.add("visible");
        document.body.style.overflow = "hidden";
        setTimeout(() => document.getElementById("modeParamInput")?.focus(), 100);

        // Оценка стоимости
        const costEst = estimateModeCost(mode);
        const costEl = document.getElementById("modeCostEstimate");
        if (costEl) {
          costEl.textContent = costEst
            ? "≈ $" + costEst.cost.toFixed(4) + " (~" +
              Math.round(costEst.inTokens / 1000) + "K вх. + ~" +
              Math.round(costEst.outTokens / 1000) + "K вых.)"
            : "";
        }
      }

// ───── UI режимов (вкладки и модалка) · js:closeModeModal
// philosynth.html строки 23015–23019 ─────

      function closeModeModal() {
        document.getElementById("modeOverlay").classList.remove("visible");
        document.body.style.overflow = "";
      }

// ───── UI режимов (вкладки и модалка) · js:updateModeButtons
// philosynth.html строки 11799–11815 ─────
      function updateModeButtons() {
        const hasCapsule = DOC_STATE.sectionOrder.includes("capsule") && DOC_STATE.capsuleHTML;
        const d = hasCapsule ? "" : "none";
        for (const id of ["btnAdversarial", "btnTranslator", "btnTimeSlice"]) {
          const el = document.getElementById(id);
          if (!el) continue;
          el.style.display = d;
          // Показать кол-во результатов, если есть
          if (hasCapsule) {
            const modeKey = { btnAdversarial: "adversarial", btnTranslator: "translator", btnTimeSlice: "timeslice" }[id];
            const count = (DOC_STATE.modes[modeKey] || []).length;
            if (count > 0) {
              el.textContent = el.textContent.replace(/\s*\(\d+\)$/, "") + " (" + count + ")";
            }
          }
        }
      }

// ───── Статическая разметка модалки режимов и панели вкладок · html:#modeOverlay
// philosynth.html строки 4330–4363 ─────
    <div class="mode-overlay" id="modeOverlay" onclick="if(event.target===this)closeModeModal()">
      <div class="mode-modal">
        <div class="mode-modal-header">
          <div class="mode-modal-title" id="modeTitle">Режим</div>
          <button class="mode-modal-close" onclick="closeModeModal()">✕ Закрыть</button>
        </div>
        <div class="mode-modal-params">
          <div class="form-group" id="modeParamsGroup"></div>
          <div id="modeSuggestions" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px"></div>
          <div id="modeDepsWarnings" style="margin-top:8px"></div>
          <div style="display:flex;align-items:center;gap:12px;margin-top:12px">
            <button class="submit-btn" style="padding:10px 24px" id="modeRunBtn" onclick="runMode()">
              <div class="spinner" id="modeSpinner"></div>
              <span id="modeRunText">Генерировать</span>
            </button>
            <button class="progress-abort-btn" id="modeAbortBtn"
                    onclick="userAbortGeneration()"
                    title="Остановить генерацию режима"
                    style="margin-left:4px">
              ⏹ Остановить
            </button>
            <div id="modeCostEstimate" style="font-family:var(--mono);font-size:9px;color:var(--ink-dim);letter-spacing:0.5px"></div>
          </div>
        </div>
        <div id="modeTabsBar"></div>
        <div class="mode-modal-body" id="modeBody">
          <div id="modeContent" class="doc-content"></div>
        </div>
        <div class="mode-modal-footer">
          <div class="mode-modal-info" id="modeInfo">—</div>
          <button class="mode-modal-copy" onclick="copyModeContent()">Скопировать</button>
        </div>
      </div>
    </div>

// ───── Статическая разметка модалки режимов и панели вкладок · html:#modeTabsBar
// philosynth.html строки 4354–4354 ─────
        <div id="modeTabsBar"></div>

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1477–1486 ─────
      .mode-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(10, 10, 15, 0.70);
        z-index: 9998;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1487–1489 ─────
      .mode-overlay.visible {
        display: flex;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1490–1499 ─────
      .mode-modal {
        background: var(--paper);
        border: 1px solid var(--rule);
        width: 100%;
        max-width: 900px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 40px rgba(0,0,0,0.25);
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1500–1508 ─────
      .mode-modal-header {
        background: var(--blue-corp);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 24px;
        flex-shrink: 0;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1509–1514 ─────
      .mode-modal-title {
        font-family: var(--serif);
        font-size: 18px;
        font-weight: 700;
        color: #fff;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1515–1526 ─────
      .mode-modal-close {
        font-family: var(--mono);
        font-size: 11px;
        background: transparent;
        border: 1px solid rgba(255,255,255,0.3);
        color: rgba(255,255,255,0.7);
        padding: 5px 12px;
        cursor: pointer;
        letter-spacing: 1px;
        text-transform: uppercase;
        transition: all 0.15s;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1527–1530 ─────
      .mode-modal-close:hover {
        border-color: #fff;
        color: #fff;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1531–1536 ─────
      .mode-modal-params {
        padding: 16px 24px;
        border-bottom: 1px solid var(--rule);
        flex-shrink: 0;
        background: var(--off);
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1537–1542 ─────
      .mode-modal-body {
        overflow-y: auto;
        flex: 1;
        padding: 28px 48px;
        background: var(--paper);
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1544–1548 ─────
      .mode-modal-body .doc-content {
        font-size: 13px;
        line-height: 1.85;
        color: var(--ink-mid);
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1549–1557 ─────
      .mode-modal-body .doc-content h4 {
        font-family: var(--mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: var(--ink);
        margin: 20px 0 8px;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1558–1560 ─────
      .mode-modal-body .doc-content p {
        margin-bottom: 12px;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1561–1566 ─────
      .mode-modal-body .doc-content table {
        width: 100%;
        border-collapse: collapse;
        margin: 14px 0;
        font-size: 12px;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1567–1577 ─────
      .mode-modal-body .doc-content th {
        background: var(--blue-corp);
        color: #fff;
        font-family: var(--mono);
        font-size: 9px;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        padding: 9px 14px;
        text-align: left;
        font-weight: 500;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1578–1584 ─────
      .mode-modal-body .doc-content td {
        padding: 9px 14px;
        border-bottom: 1px solid var(--rule);
        vertical-align: top;
        color: var(--ink-mid);
        line-height: 1.6;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1585–1587 ─────
      .mode-modal-body .doc-content tr:nth-child(even) td {
        background: var(--off);
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1588–1596 ─────
      .mode-modal-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 24px;
        border-top: 1px solid var(--rule);
        flex-shrink: 0;
        background: var(--off);
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1597–1602 ─────
      .mode-modal-info {
        font-family: var(--mono);
        font-size: 9px;
        color: var(--ink-dim);
        letter-spacing: 1px;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1603–1615 ─────
      .mode-modal-copy {
        font-family: var(--mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        background: var(--blue-corp);
        color: #fff;
        border: none;
        padding: 8px 20px;
        cursor: pointer;
        transition: background 0.15s;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1616–1618 ─────
      .mode-modal-copy:hover {
        background: var(--blue-mid);
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1628–1641 ─────
      .mode-tab {
        padding: 8px 16px;
        border: none;
        background: var(--off);
        cursor: pointer;
        font-family: var(--mono);
        font-size: 10px;
        letter-spacing: 0.5px;
        color: var(--ink-mid);
        border-bottom: 2px solid transparent;
        white-space: nowrap;
        transition: all 0.15s;
        position: relative;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1642–1646 ─────
      .mode-tab.active {
        background: var(--paper);
        color: var(--violet);
        border-bottom-color: var(--violet);
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1647–1649 ─────
      .mode-tab:hover {
        color: var(--violet);
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1650–1654 ─────
      .mode-tab-date {
        font-size: 8px;
        color: var(--ink-dim);
        margin-left: 4px;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1655–1662 ─────
      .mode-tab-close {
        font-size: 11px;
        margin-left: 6px;
        opacity: 0;
        cursor: pointer;
        color: var(--red);
        transition: opacity 0.15s;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1663–1665 ─────
      .mode-tab:hover .mode-tab-close {
        opacity: 0.5;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1666–1668 ─────
      .mode-tab-close:hover {
        opacity: 1 !important;
      }

// ───── Стили режимов · css*:.mode-
// philosynth.html строки 1669–1672 ─────
      .mode-tab.adding {
        color: var(--blue-corp);
        animation: pulse-tab 1s infinite;
      }

// ───── escape-последовательность. Область сужена, чтобы взять нужный. · js:truncLabel
// philosynth.html строки 22868–22871 ─────

      function truncLabel(s, max) {
        return s.length > max ? s.slice(0, max - 1) + "…" : s;
      }
