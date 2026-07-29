// Фрагменты philosynth.html (26 024 стр., ревизия 2026-07) для беседы 1.5b-concept-pool
// Сгенерировано extract-fragments.py; при обновлении исходника — перегенерировать.

// ───── [_autoAddCurrentDocToPool] philosynth.html строки 12352–12406 ─────
      function _autoAddCurrentDocToPool() {
        if (!DOC_STATE || !DOC_STATE.sectionOrder || DOC_STATE.sectionOrder.length === 0) {
          return;
        }
        const docNumEl = document.getElementById("docNum");
        const docNum = (docNumEl && docNumEl.textContent ? docNumEl.textContent.trim() : "");
        const filename = (docNum || "generated-" + Date.now()) + ".html";

        // Дедупликация: если запись с таким filename уже есть — no-op.
        if (_loadedConcepts.some(c => c.filename === filename)) return;

        let snap;
        try { snap = snapshotCurrentState(); }
        catch (e) { console.warn("snapshotCurrentState упал:", e); return; }
        if (!snap || !snap.html) return;

        let entry;
        try { entry = parseConceptFile(snap.html, filename); }
        catch (e) { console.warn("parseConceptFile на свежем документе упал:", e); return; }

        if (entry.participant && !entry.participantError) {
          entry.isSynthParticipant = true;
        }
        entry.snapshot = snap;
        entry.isSelected = true;  // связка «в docBodies = в пуле», для синхронизации правок

        // Сбрасываем флаг isSelected у предыдущих записей (должно быть пусто
        // после generateDoc.11474–11485, но на всякий случай).
        for (const c of _loadedConcepts) c.isSelected = false;

        _loadedConcepts.push(entry);
        _selectedConceptId = entry.id;

        renderPoolConcepts();
        updateSectionWarnings();
        updateCostEstimate();
        syncConceptParticipants();

        if (entry.participant) {
          setPoolStatus(
            "✓ Текущая концепция добавлена в пул с ☑ — готова к мета-синтезу " +
            "с будущими импортами",
            "ok"
          );
        } else {
          const reason = entry.participantError
            ? " (" + String(entry.participantError).slice(0, 80) + ")"
            : "";
          setPoolStatus(
            "✓ Текущая концепция добавлена в пул без ☑ — " +
            "не хватает разделов для мета-синтеза" + reason,
            ""
          );
        }
      }

// ───── [addToPool] philosynth.html строки 4676–4687 ─────
      function addToPool(entry) {
        // Проверка дубликатов по имени файла
        if (_loadedConcepts.some(c => c.filename === entry.filename)) {
          setPoolStatus("⚠ Файл «" + entry.filename + "» уже загружен.", "err");
          return false;
        }
        _loadedConcepts.push(entry);
        renderPoolConcepts();
        updateSectionWarnings();
        updateCostEstimate();
        return true;
      }

// ───── [handlePoolFileImport] philosynth.html строки 4949–4977 ─────
      function handlePoolFileImport(input) {
        const files = Array.from(input.files || []);
        input.value = "";
        let loaded = 0, errors = 0;

        for (const file of files) {
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const entry = parseConceptFile(reader.result, file.name);
              if (addToPool(entry)) loaded++;
            } catch (err) {
              errors++;
              console.error("Ошибка импорта «" + file.name + "»:", err);
              setPoolStatus("⚠ " + file.name + ": " + err.message, "err");
            }
            // Итог после всех файлов
            if (loaded + errors === files.length && loaded > 0) {
              setPoolStatus("✓ Загружено: " + loaded +
                (errors ? ", ошибок: " + errors : ""), loaded ? "ok" : "err");
            }
          };
          reader.onerror = () => {
            errors++;
            setPoolStatus("⚠ Не удалось прочитать: " + file.name, "err");
          };
          reader.readAsText(file);
        }
      }

// ───── [handlePoolUrlImport] philosynth.html строки 4979–5007 ─────
      async function handlePoolUrlImport() {
        const input = document.getElementById("poolUrlInput");
        const rawUrl = input?.value?.trim();
        if (!rawUrl) { setPoolStatus("⚠ Введите URL", "err"); return; }

        let url;
        try {
          url = new URL(rawUrl);
          if (!["http:", "https:"].includes(url.protocol)) throw new Error();
        } catch {
          setPoolStatus("⚠ Некорректный URL", "err"); return;
        }

        setPoolStatus("Загрузка...", "");
        const filename = url.pathname.split("/").pop() || "import.html";

        try {
          const htmlString = await fetchWithFallback(url.href,
            document.getElementById("poolStatus"));
          if (!htmlString || !htmlString.includes("<"))
            throw new Error("Ответ не содержит HTML.");
          const entry = parseConceptFile(htmlString, filename);
          addToPool(entry);
          setPoolStatus("✓ Загружено: " + filename, "ok");
          input.value = "";
        } catch (err) {
          setPoolStatus("⚠ " + err.message, "err");
        }
      }

// ───── [poolIdx] philosynth.html строки 13081–13112 ─────
// ⚠ ЛОЖНОЕ СРАБАТЫВАНИЕ extract-fragments: этот блок — dash-пул
// СТИЛЕЙ РЁБЕР ГРАФА, к Unified Concept Pool отношения не имеет.
// Оставлен для истории; НЕ портировать в рамках 1.5b.
        let poolIdx = 0;      // счётчик пула dash (только для типов без dash-сида)
        for (const stem of arr) {
          // ── Hue ──
          let bestHue = null;
          for (const [k, h] of Object.entries(_EC_HUE_SEEDS)) {
            if (stem.includes(k)) { bestHue = h; break; }
          }
          let h;
          if (bestHue != null) {
            h = bestHue;
          } else {
            do { h = (freeHueIdx++ * 137.508 + 30) % 360; }
            while (usedHues.some(uh => Math.abs(((uh - h + 540) % 360) - 180) < 12));
          }
          while (usedHues.some(uh => Math.abs(((uh - h + 540) % 360) - 180) < 12)) h = (h + 19) % 360;
          usedHues.push(h);
          const hex = _hslToHex({ h, s: 0.55, l: 0.48 });

          // ── Dash + приоритет ──
          let dashInfo = null;  // { dash, pri }
          for (const [k, info] of Object.entries(_EC_DASH_SEEDS)) {
            if (stem.includes(k)) { dashInfo = info; break; }
          }
          const dash = dashInfo ? dashInfo.dash : null;
          const dashPri = dashInfo ? dashInfo.pri : 0;

          _edgeStyleMap.set(stem, {
            color: "#" + hex.toString(16).padStart(6, "0"),
            dash,
            dashPri,
          });
        }

// ───── [refreshPoolParticipant] philosynth.html строки 4904–4935 ─────
      function refreshPoolParticipant(concept) {
        if (!concept) return;
        // Определяем HTML для парсинга:
        // - если концепция сейчас отображается — используем полный snapshot
        //   (включает #philosynth-state с capsuleHTML, modes, и т.д.)
        // - если есть snapshot — берём его
        // - иначе — rawHTML (без изменений)
        let html;
        if (concept.isSelected && DOC_STATE.ready) {
          html = snapshotCurrentState().html;
        } else if (concept.snapshot) {
          html = concept.snapshot.html;
        } else {
          return; // rawHTML не менялся — participant актуален
        }
        try {
          const updated = importConceptAsParticipant(html, concept.filename);
          if (updated) {
            // Сохраняем имя (мог быть переименован пользователем)
            updated.name = concept.participant?.name || updated.name;
            concept.participant = updated;
            // Обновляем источники для карточки
            concept.sources = [];
            if (updated.graphNodes) concept.sources.push("граф");
            if (updated.dialogueConcepts) concept.sources.push("диалог");
            if (updated.glossaryCompact) concept.sources.push("глоссарий");
            if (updated.thesesSummary) concept.sources.push("тезисы");
          }
        } catch (err) {
          console.warn("Не удалось обновить participant для «" + concept.name + "»:", err.message);
        }
      }

// ───── [removeFromPool] philosynth.html строки 4692–4710 ─────
      function removeFromPool(id) {
        const idx = _loadedConcepts.findIndex(c => c.id === id);
        if (idx === -1) return;
        const concept = _loadedConcepts[idx];

        // Если она сейчас выбрана для просмотра — сбросить
        if (concept.isSelected) {
          _selectedConceptId = null;
          // Скрываем документ (или оставляем, но снимаем индикатор)
          const indicator = document.getElementById("importIndicator");
          if (indicator) indicator.classList.remove("visible");
        }

        _loadedConcepts.splice(idx, 1);
        syncConceptParticipants();
        renderPoolConcepts();
        updateSectionWarnings();
        updateCostEstimate();
      }

// ───── [renamePoolConcept] philosynth.html строки 4715–4726 ─────
      function renamePoolConcept(id) {
        const concept = _loadedConcepts.find(c => c.id === id);
        if (!concept) return;
        const raw = concept.realName || concept.name.replace(/^«|»$/g, "");
        const newName = prompt("Новое название концепции:", raw);
        if (newName?.trim() && newName.trim() !== raw) {
          concept.realName = newName.trim();
          concept.name = "«" + newName.trim() + "»";
          if (concept.participant) concept.participant.name = newName.trim();
          renderPoolConcepts();
        }
      }

// ───── [renderPoolConcepts] philosynth.html строки 5025–5103 ─────
      function renderPoolConcepts() {
        const list = document.getElementById("poolList");
        if (!list) return;

        if (_loadedConcepts.length === 0) {
          list.innerHTML = "";
          const summary = document.getElementById("poolSummary");
          if (summary) summary.style.display = "none";
          return;
        }

        list.innerHTML = _loadedConcepts.map(c => {
          const methodLabel = ML[c.method] || c.method || "?";
          const levelLabel = SL[c.synthLevel] || c.synthLevel || "?";
          const orderLabel = ORDER_LABELS[c.generationOrder] || "";
          const sourcesStr = c.sources.length ? c.sources.join(", ") : "только капсула";

          const synthDisabled = !c.participant ? "disabled" : "";
          const synthChecked = c.isSynthParticipant ? "checked" : "";
          const viewChecked = c.isSelected ? "checked" : "";
          const cardClass = "pool-card" +
            (c.isSelected ? " selected" : "") +
            (c.isSynthParticipant ? " synth-on" : "");

          // Предупреждение о непригодности к синтезу
          let warnHTML = "";
          if (c.participantError && !c.participant) {
            warnHTML = '<div class="pool-card-synth-warn">⚠ ' +
              esc(c.participantError.slice(0, 120)) + '</div>';
          }

          return '<div class="' + cardClass + '">' +
            // Колонка 1: чекбокс синтеза
            '<div class="pool-card-controls">' +
              '<input type="checkbox" title="Участник мета-синтеза" ' +
                synthChecked + ' ' + synthDisabled +
                ' onchange="toggleSynthParticipant(\'' + c.id + '\')">' +
              '<label>Синтез</label>' +
            '</div>' +
            // Колонка 2: радио просмотра
            '<div class="pool-card-controls">' +
              '<input type="radio" name="poolView" title="Просмотр и редактирование" ' +
                viewChecked +
                ' onclick="selectForViewing(\'' + c.id + '\')">' +
              '<label>Просм.</label>' +
            '</div>' +
            // Колонка 3: информация
            '<div class="pool-card-info">' +
              '<div class="pool-card-name">' + esc(c.name) + '</div>' +
              (c.subtitle && c.subtitle !== "—"
                ? '<div class="pool-card-basis">' + esc(c.subtitle) + '</div>'
                : '') +
              '<div class="pool-card-meta">' +
                esc(methodLabel) + ' × ' + esc(levelLabel) +
                (orderLabel ? ' · ' + orderLabel : '') +
                ' · ' + sourcesStr +
              '</div>' +
            '</div>' +
            // Колонка 4: кнопки
            '<div class="pool-card-btns">' +
              '<button class="pool-card-btn" onclick="renamePoolConcept(\'' + c.id + '\')" title="Переименовать">✎</button>' +
              '<button class="pool-card-btn remove" onclick="removeFromPool(\'' + c.id + '\')" title="Удалить из пула">✕</button>' +
            '</div>' +
            warnHTML +
          '</div>';
        }).join("");

        // Саммари
        const synthCount = _loadedConcepts.filter(c => c.isSynthParticipant).length;
        const viewName = _loadedConcepts.find(c => c.isSelected)?.name;
        const summary = document.getElementById("poolSummary");
        if (summary) {
          const parts = [];
          parts.push(synthCount + " из " + _loadedConcepts.length + " для мета-синтеза");
          if (viewName) parts.push("◉ " + viewName + " — просмотр");
          summary.textContent = parts.join(" · ");
          summary.style.display = "";
        }
      }

// ───── [restoreFromPoolSnapshot] philosynth.html строки 4874–4876 ─────
      function restoreFromPoolSnapshot(snapshot, filename) {
        importHTML(snapshot.html, filename || "snapshot");
      }

// ───── [setPoolStatus] philosynth.html строки 5014–5019 ─────
      function setPoolStatus(text, cls) {
        const el = document.getElementById("poolStatus");
        if (!el) return;
        el.textContent = text;
        el.className = "pool-status" + (cls ? " " + cls : "");
      }

// ───── [togglePoolUrlRow] philosynth.html строки 5009–5012 ─────
      function togglePoolUrlRow() {
        const row = document.getElementById("poolUrlRow");
        row.classList.toggle("visible");
      }

// ───── [parseConceptFile] philosynth.html строки 4617–4671 ─────
      function parseConceptFile(htmlString, filename) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, "text/html");
        if (!doc.getElementById("docOutput"))
          throw new Error("Не найден #docOutput. Это не файл PhiloSynth.");

        const meta = extractMetadata(doc);
        const sections = extractSections(doc);
        const embeddedState = extractEmbeddedState(doc);
        const subtitle = doc.getElementById("docSubtitle")?.textContent?.trim() || "";

        let realName = doc.getElementById("docTitle")?.textContent?.trim() || "";
        const isDefaultTitle = !realName || realName === "Синтез Философской Концепции";
        const displayName = isDefaultTitle ? "Концепция" : ("«" + realName + "»");

        const generationOrder = embeddedState?.params?.generationOrder || "";

        // Проверяем пригодность к мета-синтезу
        let participant = null;
        let participantError = null;
        try {
          const result = importConceptAsParticipant(htmlString, filename);
          if (result) participant = result;
          else participantError = "Импорт для синтеза отменён";
        } catch (err) {
          participantError = err.message;
        }

        // Источники контекста для мета-строки карточки
        const sources = [];
        if (participant) {
          if (participant.graphNodes) sources.push("граф");
          if (participant.dialogueConcepts) sources.push("диалог");
          if (participant.glossaryCompact) sources.push("глоссарий");
          if (participant.thesesSummary) sources.push("тезисы");
        }

        return {
          id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
          filename,
          rawHTML: htmlString,
          name: displayName,
          realName,
          subtitle,
          method: meta.method,
          synthLevel: meta.synthLevel,
          generationOrder,
          sources,
          participant,
          participantError,
          isSelected: false,
          isSynthParticipant: false,
          snapshot: null,
        };
      }

// ───── [importConceptAsParticipant] philosynth.html строки 22009–22176 ─────
      function importConceptAsParticipant(htmlString, filename) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, "text/html");

        // ── 1. Проверка: это PhiloSynth-документ ──
        const docOutput = doc.getElementById("docOutput");
        if (!docOutput) throw new Error("Не найден #docOutput. Это не файл PhiloSynth.");

        // ── 2. Извлечение метаданных и embedded state ──
        const meta = extractMetadata(doc);
        const embeddedState = extractEmbeddedState(doc);

        // ── 3. Извлечение разделов ──
        const sections = extractSections(doc);
        const sectionKeys = new Set(sections.map(s => s.key));

        // ── 4. Проверка обязательных разделов ──
        const required = ["sum", "glossary", "theses", "critique"];
        const missing = required.filter(k => !sectionKeys.has(k));

        const hasGraph = sectionKeys.has("graph");
        const hasDialogue = sectionKeys.has("dialogue");
        if (!hasGraph && !hasDialogue) {
          missing.push("graph или dialogue");
        }

        const hasCapsule = !!(
          meta.capsuleText ||
          embeddedState?.capsuleHTML ||
          doc.querySelector(".header-disclosure-capsule")
        );
        if (!hasCapsule) missing.push("capsule");

        if (missing.length > 0) {
          throw new Error(
            "Концепция не пригодна для мета-синтеза. Отсутствуют разделы: " +
            missing.map(k => "«" + (KEY_LABELS[k] || k) + "»").join(", ") +
            ". Откройте документ, добавьте недостающие разделы и сохраните заново."
          );
        }

        // Мягкие предупреждения (не блокируют импорт)
        const warnings = [];
        if (!hasGraph) warnings.push("нет графа категорий");
        if (!hasDialogue) warnings.push("нет диалога");

        if (warnings.length > 0) {
          const ok = confirm(
            "Концепция импортируется с неполным набором разделов:\n" +
            "— " + warnings.join("\n— ") + "\n\n" +
            "Для максимального качества мета-синтеза рекомендуется " +
            "включить галочку «Пригодность к синтезу» и догенерировать " +
            "недостающие разделы.\n\nИмпортировать как есть?"
          );
          if (!ok) return null;
        }


        // ── 5. Извлечение контекста для промптов ──
        const docBodies = doc.getElementById("docBodies") || docOutput;

        // Строим маппинг секция → DOM-элемент
        const generated = {};
        const bodyEls = docBodies.querySelectorAll(".doc-body[data-section-key]");
        for (const el of bodyEls) {
          const keys = el.getAttribute("data-section-key").split("+");
          for (const key of keys) {
            generated[key] = el;
          }
        }
        // Если нет data-section-key, пробуем через .doc-section
        if (Object.keys(generated).length === 0) {
          for (const sec of sections) {
            const els = docBodies.querySelectorAll(".doc-section");
            for (const el of els) {
              const title = el.querySelector(".section-title")?.textContent || "";
              if (titleToKey(title) === sec.key) {
                generated[sec.key] = el.closest(".doc-body") || el;
              }
            }
          }
        }

        // Извлечение конкретных фрагментов
        const capsuleText = (() => {
          // Приоритет 1: embedded state содержит полный HTML капсулы
          if (embeddedState?.capsuleHTML) {
            return extractCapsuleText(embeddedState.capsuleHTML);
          }
          // Приоритет 2: meta.capsuleText — уже текст из disclosure-body шапки
          if (meta.capsuleText) {
            return meta.capsuleText
              .replace(/^\s*Капсула\s*/i, "")
              .replace(/\n\s+/g, "\n")
              .replace(/\n{3,}/g, "\n\n")
              .trim();
          }
          // Приоритет 3: disclosure-body в шапке импортируемого документа
          const capsuleDisc = doc.querySelector(".header-disclosure-capsule .disclosure-body");
          if (capsuleDisc) {
            return capsuleDisc.textContent
              .replace(/^\s*Капсула\s*/i, "")
              .trim();
          }
          return "";
        })();

        // Граф (если есть)
        const graphNodes = extractContextFragment("graph:nodes_top", generated) || "";
        const graphEdges = extractContextFragment("graph:edges", generated) || "";

        // Диалог (если есть)
        const dialogueConcepts = extractContextFragment("dialogue:new_concepts", generated) || "";
        const dialogueSynthesis = extractContextFragment("dialogue:synthesis", generated) || "";

        // Общие (всегда)
        const glossaryCompact = extractContextFragment("glossary:table", generated) || "";
        const thesesSummary = extractContextFragment("theses:summary", generated) || "";
        const goals = extractContextFragment("sum:goals", generated) || "";
        const tensions = extractContextFragment("sum:tensions", generated) || "";
        const portraits = extractContextFragment("sum:portraits", generated) || "";

        // Подсчёт статистик для карточки
        const nodeCount = (graphNodes.match(/\n/g) || []).length - 1; // строки минус заголовок
        const thesesCount = (thesesSummary.match(/^\d+\./gm) || []).length;

        // ── 6. Извлечение названия ──
        const nameEl = doc.getElementById("docTitle");
        let conceptName = nameEl?.textContent?.trim() || "";
        if (conceptName === "Синтез Философской Концепции") conceptName = "";
        // Пустое имя — не ошибка; запросим при добавлении

        // ── 7. Реконструкция генеалогии ──
        const genealogy = reconstructGenealogy(meta, embeddedState, doc);

        // Восстанавливаем капсулы всех не-корневых узлов из отрендеренного
        // HTML-дерева генеалогии импортируемого документа. Без этого капсулы
        // дальних предков теряются при метасинтезе 3-го уровня и глубже:
        // в embeddedState.genealogy они уже сняты через
        // stripCapsulesFromGenealogy, а .gen-card-capsule-body в HTML остаются.
        if (genealogy) {
          restoreCapsulesFromHTML(genealogy, doc);
        }

        // ── 8. Сборка участника ──
        return {
          type: "concept",
          name: conceptName,
          capsule: capsuleText,
          graphNodes,
          graphEdges,
          dialogueConcepts,  
          dialogueSynthesis,
          glossaryCompact,
          thesesSummary,
          goals,
          tensions,
          portraits,
          method: meta.method,
          synthLevel: meta.synthLevel,
          seed: meta.seed || "",
          genealogy,
          // Мета для UI
          _filename: filename,
          _nodeCount: nodeCount,
          _thesesCount: thesesCount,
        };
      }

// ───── [onSynthReadyChange] philosynth.html строки 5116–5142 ─────
      function onSynthReadyChange(checked) {
        if (checked) {
          for (const key of SYNTH_READY_SECTIONS) {
            const id = "sec" + key.charAt(0).toUpperCase() + key.slice(1);
            const el = document.getElementById(id);
            if (el && !el.checked) {
              el.checked = true;
              el.dispatchEvent(new Event("change", { bubbles: true }));
              syncCheckedClass(el);
            }
          }

          // Подсказка: название нужно для капсулы
          const nameChk = document.getElementById("secName");
          if (nameChk && !nameChk.checked) {
            const hint = document.getElementById("synthReadyHint");
            if (hint) {
              hint.textContent =
                "Совет: для качественной капсулы полезен раздел «Анализ названия». " +
                "Если он не выбран, задайте название вручную (кнопка ✎ в шапке) после генерации.";
              hint.style.display = "";
            }
          }
        }
        updateSectionWarnings();
        updateCostEstimate();
      }

// ───── [refreshAllSynthParticipants] philosynth.html строки 4940–4945 ─────
      function refreshAllSynthParticipants() {
        for (const c of _loadedConcepts) {
          if (c.isSynthParticipant) refreshPoolParticipant(c);
        }
        syncConceptParticipants();
      }

// ═════ Дописано патчем 1.5b (дыра извлечения: функции заявлены в
// первом запросе беседы, но во фрагмент не попали) ═════
// ───── [toggleSynthParticipant] philosynth.html строки 4731–4771 ─────
      function toggleSynthParticipant(id) {
        const concept = _loadedConcepts.find(c => c.id === id);
        if (!concept) return;

        if (!concept.isSynthParticipant) {
          // Включаем — проверяем пригодность
          if (!concept.participant) {
            alert("Концепция непригодна для мета-синтеза:\n" +
                  (concept.participantError || "Неизвестная ошибка"));
            return;
          }
          concept.isSynthParticipant = true;

          // Автоматически включаем обязательные разделы для мета-синтеза
          const synthReadyEl = document.getElementById("secSynthReady");
          const hasSynthConcepts = _loadedConcepts.some(c => c.isSynthParticipant);
          if (hasSynthConcepts && synthReadyEl && !synthReadyEl.checked) {
            synthReadyEl.checked = true;
            onSynthReadyChange(true);
            setPoolStatus("☑ Включены разделы, обязательные для мета-синтеза " +
                          "(граф, глоссарий, тезисы, диалог, критика, капсула)", "ok");
          }
        } else {
          concept.isSynthParticipant = false;
          // Если больше нет концепций для синтеза — снимаем synthReady
          const remaining = _loadedConcepts.filter(c => c.isSynthParticipant).length;
          if (remaining === 0) {
            const synthReadyEl = document.getElementById("secSynthReady");
            if (synthReadyEl && synthReadyEl.checked) {
              synthReadyEl.checked = false;
              // Не снимаем галочки разделов — пользователь сам решит
              setPoolStatus("Мета-синтез отменён. Галочки разделов можно изменить вручную.", "");
            }
          }
        }

        syncConceptParticipants();
        renderPoolConcepts();
        updateSectionWarnings();
        updateCostEstimate();
      }

// ───── [selectForViewing] philosynth.html строки 4776–4828 ─────
      function selectForViewing(id) {
        const concept = _loadedConcepts.find(c => c.id === id);
        if (!concept) return;

        // Если кликнули на уже выбранную — деселект
        if (concept.isSelected) {
          // Сохраняем снимок
          if (DOC_STATE.ready) {
            concept.snapshot = snapshotCurrentState();
            refreshPoolParticipant(concept);
          }
          concept.isSelected = false;
          _selectedConceptId = null;
          const indicator = document.getElementById("importIndicator");
          if (indicator) indicator.classList.remove("visible");
          renderPoolConcepts();
          return;
        }

        // Сохраняем снимок текущей выбранной концепции
        if (_selectedConceptId) {
          const prev = _loadedConcepts.find(c => c.id === _selectedConceptId);
          if (prev) {
            if (DOC_STATE.ready) {
              prev.snapshot = snapshotCurrentState();
              refreshPoolParticipant(prev);
            }
            prev.isSelected = false;
          }
        }

        concept.isSelected = true;
        _selectedConceptId = id;

        // Загружаем
        if (concept.snapshot) {
          restoreFromPoolSnapshot(concept.snapshot, concept.filename);
        } else {
          importHTML(concept.rawHTML, concept.filename);
        }

        // Обновляем индикатор
        const indicator = document.getElementById("importIndicator");
        if (indicator) {
          indicator.textContent = "◉ " + concept.name;
          indicator.classList.add("visible");
        }

        // Восстанавливаем пул-состояние _conceptParticipants
        syncConceptParticipants();
        renderPoolConcepts();
      }


// ───── [snapshotCurrentState] philosynth.html строки 4833–4869 ─────
      function snapshotCurrentState() {
        // Сериализуем состояние (как в saveHTML)
        const stateData = {
          version: 2,
          parentContextSchema: PARENT_CONTEXT_SCHEMA_ID,
          parentContextSchemaVersion: PARENT_CONTEXT_SCHEMA_VERSION,
          genLog: genLog.map(g => {
            const { _sys, _promptSkeleton, ...rest } = g;
            return rest;
          }),
          ctxLog,
          genCommon,
          params: DOC_STATE.params,
          sectionOrder: DOC_STATE.sectionOrder,
          editedSections: [...DOC_STATE.editedSections],
          docVersion: DOC_STATE.docVersion,
          participants: DOC_STATE.participants,
          // Капсулы в state — дубль (они уже живут в HTML-дереве
          // через renderGenealogyTree). Strip закрывает утечку на всех
          // путях, включая снимок → импорт как участник, где
          // restoreCapsulesFromHTML не вызывается.
          genealogy: stripCapsulesFromGenealogy(DOC_STATE.genealogy),
          capsuleHTML: DOC_STATE.capsuleHTML,
          modes: DOC_STATE.modes,
          structureSections: DOC_STATE.structureSections,
        };

        // Строим мини-HTML-документ
        const docOutput = document.getElementById("docOutput");
        const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>' +
          '<div id="docOutput">' + docOutput.innerHTML + '</div>' +
          '<script type="application/json" id="philosynth-state">' +
          JSON.stringify(stateData) +
          '<\/script></body></html>';

        return { html, filename: null };
      }

// ───── [syncConceptParticipants] philosynth.html строки 4881–4897 ─────
      function syncConceptParticipants() {
        const _prev = _conceptParticipants;
        _conceptParticipants = _loadedConcepts
          .filter(c => c.isSynthParticipant && c.participant)
          .map(c => {
            // Переносим generationOrder из объекта пула в participant, чтобы
            // при построении genealogy для участников-концепций без собственной
            // genealogy мы могли использовать известный порядок как fallback.
            return c.generationOrder
              ? { ...c.participant, generationOrder: c.generationOrder }
              : c.participant;
          });
        // Показ/скрытие fullBudgetBlock при смене пула (ТЗ tz_budget_mode).
        try {
          if (typeof renderFullBudgetPreview === "function") renderFullBudgetPreview();
        } catch (_) {}
      }
