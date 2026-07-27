// Фрагменты philosynth.html (26 024 стр., ревизия 2026-07) для беседы 4.3-import-service
// Сгенерировано extract-fragments.py; при обновлении исходника — перегенерировать.

// ───── [importHTML] philosynth.html строки 21282–21351 ─────
      function importHTML(htmlString, filename) {
        // ── 1. Парсинг HTML ──
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, "text/html");

        // Проверка: это PhiloSynth-документ?
        const docOutput = doc.getElementById("docOutput") || doc.querySelector("#docOutput");
        if (!docOutput) {
          throw new Error("Не найден элемент #docOutput. Это не файл PhiloSynth.");
        }

        // ── 2. Извлечение метаданных из шапки ──
        const meta = extractMetadata(doc);

        // ── 3. Извлечение разделов ──
        const sections = extractSections(doc);
        if (sections.length === 0) {
          throw new Error("В файле не найдено ни одного раздела (.doc-section).");
        }

        // ── 4. Извлечение встроенного состояния (если есть) ──
        const embeddedState = extractEmbeddedState(doc);

        // ── 2b. Валидация метаданных ──
        const metaWarnings = validateImportMeta(meta, embeddedState);
        const hasCritical = metaWarnings.some(w => w.critical);

        if (metaWarnings.length > 0) {
          let warnMsg = "Импорт: обнаружены проблемы с метаданными:\n\n";
          for (const w of metaWarnings) {
            warnMsg += (w.critical ? "⚠ КРИТИЧНО: " : "⚡ Внимание: ") + w.message + "\n";
          }

          if (hasCritical) {
            warnMsg += "\nКритические поля отсутствуют. Документ будет отображён, " +
              "но редактирование (перегенерация разделов) заблокировано.\n" +
              "Заполните недостающие поля в форме ввода и нажмите «Изменить» повторно.\n\n" +
              "Продолжить импорт?";
            if (!confirm(warnMsg)) {
              throw new Error("Импорт отменён пользователем.");
            }
          } else {
            // Некритичные — информируем, не блокируем
            alert(warnMsg + "\nЗначения по умолчанию подставлены. Проверьте форму ввода.");
          }
        }

        // ── 5. Заполнение DOM ──
        populateFromImport(docOutput, meta, sections, embeddedState, filename);

        // ── 6. Парсинг графа ──
        const docBodies = document.getElementById("docBodies");
        if (docBodies) {
          try {
            G = parseGraph(docBodies);
            if (G.nodes.length > 0) {
              document.getElementById("btnGraph").style.display = "";
            }
          } catch (e) {
            console.warn("Не удалось распарсить граф при импорте:", e);
          }
        }

        // ── 7. Построение DOC_STATE ──
        buildDocStateFromImport(meta, sections, embeddedState, doc);

        console.log("Импорт завершён:", filename,
          "разделов:", sections.length,
          "состояние:", embeddedState ? "восстановлено" : "реконструировано");
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

// ───── [buildDocStateFromImport] philosynth.html строки 21661–21863 ─────
      function buildDocStateFromImport(meta, sections, embeddedState, doc) {
        resetDocState();

        // ── Восстанавливаем логи ──
        if (embeddedState) {
          if (embeddedState.genLog)    genLog = embeddedState.genLog;
          if (embeddedState.ctxLog)    ctxLog = embeddedState.ctxLog;
          if (embeddedState.genCommon) genCommon = embeddedState.genCommon;
        } else {
          genLog = [];
          ctxLog = [];
          genCommon = null;
        }

        // ── Порядок разделов ──
        // Если есть встроенный порядок — используем его,
        // иначе реконструируем из извлечённых секций
        let sectionOrder;
        if (embeddedState?.sectionOrder) {
          sectionOrder = embeddedState.sectionOrder;
        } else {
          sectionOrder = ["sum", ...sections.map(s => s.key).filter(k => k !== "sum")];
        }

        // ── Параметры ──
        const secCtxMap = {};
        sections.forEach(s => { if (s.secCtx) secCtxMap[s.key] = s.secCtx; });

        const params = embeddedState?.params || {
          seed: meta.seed,
          phil: meta.phil,
          sec: sectionOrder.filter(k => k !== "sum"),
          method: meta.method,
          depth: meta.depth,
          synthLevel: meta.synthLevel,
          ctx: meta.ctx,
          secCtx: secCtxMap,
          lang: "Russian",
        };
        // Гарантируем, что secCtx содержит контексты из файла
        // (даже если params загружен из embedded state, файл мог быть отредактирован)
        for (const s of sections) {
          if (s.secCtx && !params.secCtx[s.key]) {
            params.secCtx[s.key] = s.secCtx;
          }
        }

        DOC_STATE.participants = embeddedState?.participants || [];
        DOC_STATE.genealogy = embeddedState?.genealogy || null;
        // ТЗ selective-parent-context 10.2: запомнить схему файла
        DOC_STATE._parentContextSchema = (embeddedState && embeddedState.parentContextSchema)
          || "monolithic";

        // Восстанавливаем капсулы из HTML-дерева генеалогии
        if (DOC_STATE.genealogy) {
          restoreCapsulesFromHTML(DOC_STATE.genealogy, doc);
        }

        // Если есть генеалогия — показать в шапке
        if (DOC_STATE.genealogy) {
          setTimeout(updateGenealogyInHeader, 200);
        }

        if (DOC_STATE.participants.some(x => x.type === "concept")) {
          _conceptParticipants = DOC_STATE.participants.filter(x => x.type === "concept");
          renderConceptParticipants();
          showConceptParticipantsBlock();
        }

        // ── Зависимости ──
        const resolvedDeps = resolveContextDeps(params);
        const currentSections = sectionOrder.filter(k => k !== "sum");
        const effectiveDeps = buildEffectiveDeps(currentSections, resolvedDeps, params.generationOrder);

        // ── Defs: реконструируем из params ──
        const allDefs = buildSectionDefs(params);
        patchPromptsWithSecCtx(allDefs, params.secCtx);
        const defsMap = Object.fromEntries(allDefs.map(d => [d.key, d]));

        // Номера назначаем по порядку sectionOrder
        let num = 1;
        for (const key of sectionOrder) {
          if (defsMap[key]) defsMap[key].num = num++;
        }

        // ── Заполняем DOC_STATE ──
        // Проверяем полноту: если критические поля отсутствуют — DOC_STATE.ready,
        // но DOC_STATE.incomplete = true → openEditModal покажет предупреждение
        const metaWarnings = validateImportMeta(meta, embeddedState);
        const hasCritical = metaWarnings.some(w => w.critical);
        DOC_STATE.ready = true;
        DOC_STATE.incomplete = hasCritical;
        DOC_STATE.importWarnings = metaWarnings;
        DOC_STATE.params = params;
        const extractedKeys = new Set(sections.map(s => s.key));
        extractedKeys.add("sum"); // sum всегда присутствует
        // Капсула хранится в шапке документа, а не в #docBodies,
        // поэтому extractSections её не находит. Добавляем вручную,
        // если капсула существует в метаданных или во встроённом состоянии.
        if (meta.capsuleText || embeddedState?.capsuleHTML) {
          extractedKeys.add("capsule");
        }
        DOC_STATE.sectionOrder = sectionOrder.filter(k => extractedKeys.has(k));
        DOC_STATE.resolvedDeps = resolvedDeps;
        DOC_STATE.effectiveDeps = effectiveDeps;
        DOC_STATE.factualDeps = buildFactualDepsMap(ctxLog);
        DOC_STATE.docNum = meta.docNum;
        DOC_STATE.editedSections = new Set(embeddedState?.editedSections || []);
        DOC_STATE.docVersion = parseVersion(embeddedState?.docVersion);

        // ── db-маппинг и HTML-кэш ──
        DOC_STATE.sectionDbIdx = {};
        DOC_STATE.sectionDefs = {};

        sections.forEach((sec, i) => {
          DOC_STATE.sectionDbIdx[sec.key] = i;
          DOC_STATE.sectionDefs[sec.key] = defsMap[sec.key] ? { ...defsMap[sec.key] } : { key: sec.key, num: i + 1, title: sec.title, prompt: "" };
          const el = document.getElementById("db" + i);
        });

        // Капсула не извлекается extractSections (хранится в шапке, не в #docBodies).
        // Создаём def вручную, если capsule есть в sectionOrder.
        if (DOC_STATE.sectionOrder.includes("capsule") && !DOC_STATE.sectionDefs["capsule"]) {
          const capsuleDef = defsMap["capsule"];
          DOC_STATE.sectionDefs["capsule"] = capsuleDef
            ? { ...capsuleDef }
            : { key: "capsule", num: DOC_STATE.sectionOrder.length, title: "Капсула Концепции", parts: null, prompt: "" };
        }

        // Восстанавливаем капсулу из шапки импортированного документа
        // Приоритет: embedded state (полный HTML) > meta.capsuleText (текст из шапки)
        if (meta.capsuleText) {
          DOC_STATE.capsuleHTML = '<div class="doc-section"><div class="doc-content"><div data-section="Капсула"><p>' +
            meta.capsuleText.split("\n").map(l => l.trim()).filter(Boolean).join("</p><p>") +
            '</p></div></div></div>';
        } else {
          DOC_STATE.capsuleHTML = "";
        }
        setTimeout(() => {
          updateCapsuleInHeader();
          updateModeButtons();
        }, 150);

        // Приоритет режимов: JSON (обратная совместимость) → MODES_DATA в скрипте → <details>
        if (embeddedState?.modes && Object.keys(embeddedState.modes).length > 0) {
          // Старый формат JSON: конвертируем одиночные объекты в массивы
          const raw = embeddedState.modes;
          for (const [k, v] of Object.entries(raw)) {
            if (!Array.isArray(v)) raw[k] = v?.html ? [v] : [];
          }
          DOC_STATE.modes = raw;
        } else {
          DOC_STATE.modes = extractModesFromHTML(doc);
        }

        // graphBodyIdx
        graphBodyIdx = DOC_STATE.sectionDbIdx["graph"] ?? -1;

        // Обновляем def резюме (актуальный список разделов в «Структура документа»)
        refreshSumDef();

        // Снимок перечня разделов для «Структура документа»
        // null = старый файл без этого поля → «актуальность не определена»
        DOC_STATE.structureSections = embeddedState?.structureSections || null;

        // ── Восстановление pausedState (если документ был экспортирован в паузе) ──
        if (embeddedState?.pausedState) {
          DOC_STATE.pausedState = embeddedState.pausedState;

          // Вариант А: при импорте файла в паузе участники-концепции с ПОЛНЫМ
          // контекстом лежат в pausedState.genParams.participants (cleanParticipants
          // к pausedState не применяется). В отличие от DOC_STATE.participants
          // (которые при экспорте обрезаются до метаданных), здесь доступен
          // capsule, graphNodes, dialogueConcepts и т.д. Перезаписываем
          // _conceptParticipants и DOC_STATE.participants полной версией, чтобы:
          //   1. UI пула метасинтеза показывал корректных участников до «Возобновить».
          //   2. Если пользователь закроет модалку и начнёт новый синтез через
          //      обычный UI — метасинтез будет работать с полным контекстом.
          //   3. Модалка паузы и resumeGeneration продолжат работать как раньше.
          const pausedParticipants = embeddedState.pausedState.genParams?.participants;
          if (Array.isArray(pausedParticipants) && pausedParticipants.length > 0) {
            const hasConcepts = pausedParticipants.some(x => x.type === "concept");
            if (hasConcepts) {
              DOC_STATE.participants = pausedParticipants;
              _conceptParticipants = pausedParticipants.filter(x => x.type === "concept");
              if (typeof renderConceptParticipants === "function") {
                try { renderConceptParticipants(); } catch (_) {}
              }
              if (typeof showConceptParticipantsBlock === "function") {
                try { showConceptParticipantsBlock(); } catch (_) {}
              }
            }
          }

          _showPauseBadge(true);
          // Показываем модалку с задержкой, чтобы UI успел отрисоваться
          setTimeout(() => {
            showPauseModal();
          }, 600);
        }

        setTimeout(buildTableOfContents, 100);
      }

// ───── [restoreCapsulesFromHTML] philosynth.html строки 11745–11770 ─────
      function restoreCapsulesFromHTML(node, doc) {
        if (!node || node.type === "philosopher") return;

        // Находим все карточки концепций в дереве
        const cards = doc.querySelectorAll(".gen-card");
        const capsuleMap = {};
        for (const card of cards) {
          const nameEl = card.querySelector(".gen-card-name");
          const capsuleBody = card.querySelector(".gen-card-capsule-body");
          if (nameEl && capsuleBody) {
            // Имя без префикса "◈ "
            const name = nameEl.textContent.replace(/^◈\s*/, "").trim();
            capsuleMap[name] = capsuleBody.textContent;
          }
        }

        // Рекурсивно заполняем узлы
        function fill(n) {
          if (!n || n.type === "philosopher") return;
          if (!n.capsule && capsuleMap[n.name]) {
            n.capsule = capsuleMap[n.name];
          }
          if (n.participants) n.participants.forEach(fill);
        }
        if (node.participants) node.participants.forEach(fill);
      }

// ───── [updateSchemaBadgeInHeader] philosynth.html строки 10421–10445 ─────
      function updateSchemaBadgeInHeader(schemaId) {
        const container = document.getElementById("docHeaderExtras");
        if (!container) return;
        // Удаляем старый бейдж
        const old = container.querySelector(".header-schema-badge");
        if (old) old.remove();
        // Показываем только для мета-синтеза (когда есть концепции-родители)
        const hasConcepts = (DOC_STATE.participants || []).some(x => x && x.type === "concept")
          || (DOC_STATE.genealogy && (DOC_STATE.genealogy.participants || []).some(p => p.type === "concept"));
        if (!hasConcepts) return;
        const id = schemaId || PARENT_CONTEXT_SCHEMA_ID;
        const label = id === "selective-v1"
          ? "родительский контекст: селективный v1"
          : (id === "monolithic"
             ? "родительский контекст: монолитный (legacy)"
             : "родительский контекст: " + id);
        const span = document.createElement("span");
        span.className = "header-schema-badge";
        span.style.cssText = "display:inline-block; margin:4px 8px; padding:2px 8px; " +
          "font-family:'IBM Plex Mono',monospace; font-size:10px; " +
          "color:var(--ink-dim, #8a8278); border:1px solid var(--ink-line, #d8d4cc); " +
          "border-radius:2px; background:rgba(0,0,0,0.02);";
        span.textContent = "◈ " + label;
        container.appendChild(span);
      }

// ───── [normalizeGenealogyNames] philosynth.html строки 22298–22315 ─────
      function normalizeGenealogyNames(node, fallbackName) {
        if (!node) return null;
        if (node.type === "philosopher") return { ...node };
        const copy = { ...node };
        if (isPlaceholderConceptName(copy.name)) {
          copy.name = (fallbackName && !isPlaceholderConceptName(fallbackName))
            ? fallbackName
            : "[безымянная концепция]";
        }
        if (copy.participants) {
          copy.participants = copy.participants.map(p =>
            p && p.type === "philosopher"
              ? { ...p }
              : normalizeGenealogyNames(p, null)
          );
        }
        return copy;
      }
