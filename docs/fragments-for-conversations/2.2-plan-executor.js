// Фрагмент philosynth.html (26025 строк) — собран
// scripts/extract-by-name.py по спецификации 2.2-plan-executor.spec.
//
// Номера строк ниже — РЕЗУЛЬТАТ поиска по именам, а не входные
// данные: при правке исходника достаточно перезапустить сборку,
// спецификация не устаревает. Имена берутся из
// docs/04-code-reuse-map.md.

// ───── Исполнение плана (server/services/plan-executor.ts) · js:executeEditPlan
// philosynth.html строки 19514–19861 ─────
      async function executeEditPlan() {
        // Защита от двойного запуска: если план уже выполняется — игнорируем повторный вызов
        if (window._editPlanRunning) {
          console.warn("executeEditPlan: план уже выполняется, повторный запуск отклонён");
          return;
        }
        // Синхронизируем keepFullBudget из чекбокса (ТЗ tz_budget_mode 5.3)
        if (DOC_STATE.params) {
          DOC_STATE.params.keepFullBudget = _currentKeepFullBudget();
        }
        const plan = { ..._editPlan };
        const total = plan.regen.length + plan.remove.length + plan.add.length
            + (plan.modeRegen?.length || 0)
            + (plan.modeRemove?.length || 0);
        if (total === 0) return;
        if (DOC_STATE.incomplete) {
          alert("Редактирование заблокировано: не все параметры восстановлены.");
          return;
        }
        window._editPlanRunning = true;

        // Собираем доп. контексты
        const regenCtx = {};
        for (const key of plan.regen) {
          const field = document.getElementById("editCtx-" + key);
          regenCtx[key] = field ? field.value.trim() : (DOC_STATE.params.secCtx[key] || "");
        }
        const addCtx = {};
        for (const key of plan.add) {
          const field = document.getElementById("editAddCtx-" + key);
          addCtx[key] = field ? field.value.trim() : "";
        }

        // Блокируем UI
        const runBtn = document.getElementById("editRunBtn");
        const progress = document.getElementById("editPlanProgress");
        const progressText = document.getElementById("editPlanProgressText");
        if (runBtn) runBtn.disabled = true;
        if (progress) progress.classList.add("active");
        closeEditModal();

        // Показываем панель прогресса основного интерфейса
        const mainProgress = document.getElementById("progressPanel");
        const mainSteps = document.getElementById("progressSteps");
        if (mainProgress && mainSteps) {
          mainSteps.innerHTML = "";
          const sectionOpsPreview = buildPlanOrder(plan);
          const allSteps = [
            ...plan.remove.map(k => ({ key: k, label: "Удаление: " + (KEY_LABELS[k] || k) })),
            ...sectionOpsPreview.map(op => ({
              key: op.key,
              label: (op.action === "add" ? "Добавление: " : "Перегенерация: ") + (KEY_LABELS[op.key] || op.key),
            })),
          ];
          allSteps.forEach((s, i) => {
            const d = document.createElement("div");
            d.className = "progress-step";
            d.id = "editPs" + i;
            d.innerHTML = `<span class="step-icon">◯</span> ${s.label}`;
            mainSteps.appendChild(d);
          });
          mainProgress.classList.add("visible");
        }

        let step = 0;
        let _planPollInterval = null;

        const updateProgress = (text) => {
          step++;
          if (progressText) progressText.textContent = `[${step}/${total}] ${text}`;

          // Обновляем шаг в основной панели прогресса
          const prevStep = document.getElementById("editPs" + (step - 2));
          const curStep  = document.getElementById("editPs" + (step - 1));
          if (prevStep) {
            prevStep.className = "progress-step done";
            prevStep.querySelector(".step-icon").textContent = "✓";
          }
          if (curStep) {
            curStep.className = "progress-step active";
            curStep.querySelector(".step-icon").textContent = "⟳";
          }

          // Live-обновление символов
          clearInterval(_planPollInterval);
          _planPollInterval = setInterval(() => {
            if (!genLog.length) return;
            const last = genLog[genLog.length - 1];
            if (last.status === "streaming" && last.outputChars > 0 && curStep) {
              curStep.title = last.outputChars.toLocaleString("ru") + " симв.";
            }
          }, 300);
        };

        // Подсчёт подразделов в плане
        const subsectionCount = (plan.modeRegen?.length || 0);
        // Примечание: подразделы в executeEditPlan — это modeRegen
        // (подразделовые перегенерации через Edit Modal обрабатываются
        // через отдельные вызовы executeSubsectionRegen, не через план)

        const v = typeof DOC_STATE.docVersion === "object"
          ? { ...DOC_STATE.docVersion }
          : parseVersion(DOC_STATE.docVersion);

        // Есть ли разделовые изменения?
        const hasSectionChanges = plan.regen.length > 0 ||
                                  plan.remove.length > 0 ||
                                  plan.add.length > 0;

        if (hasSectionChanges) {
          v.base += 1;
          v.sub = 0; // сброс при инкременте base
        }

        // Режимы: перегенерация
        if (plan.modeRegen?.length > 0) {
          v.modeRegen += plan.modeRegen.length;
        }

        DOC_STATE.docVersion = v;

        genLog.push({
          type: "version-marker",
          version: formatVersion(v),
          timestamp: new Date().toISOString(),
          actions: {
            regen: plan.regen.map(k => KEY_LABELS[k] || k),
            remove: plan.remove.map(k => KEY_LABELS[k] || k),
            add: plan.add.map(k => KEY_LABELS[k] || k),
          },
        });

        // Собираем все операции в единый массив для возможного возобновления
        const sectionOps = buildPlanOrder(plan);
        let currentOp = null;
        let currentOpIdx = -1;
        // Для pausedPlan: список всех операций и индекс, на котором упали
        const allOpsForResume = [
          ...plan.remove.map(k => ({ action: "remove", key: k })),
          ...sectionOps,
        ];

        try {
          // ── 1. Удаления ──
          for (let removeIdx = 0; removeIdx < plan.remove.length; removeIdx++) {
            const key = plan.remove[removeIdx];
            currentOp = { action: "remove", key };
            currentOpIdx = removeIdx;
            updateProgress("Удаление: " + (KEY_LABELS[key] || key));
            deleteSection(key); // синхронная
          }

          // ── 2. Добавления + перегенерации (единый топологический порядок) ──
          for (let opIdx = 0; opIdx < sectionOps.length; opIdx++) {
            const op = sectionOps[opIdx];
            currentOp = op;
            currentOpIdx = plan.remove.length + opIdx;
            if (op.action === "add") {
              updateProgress("Добавление: " + (KEY_LABELS[op.key] || op.key));
              await addSection(op.key, addCtx[op.key], { fromPlan: true });
            } else {
              if (!DOC_STATE.sectionOrder.includes(op.key)) continue; // мог быть удалён
              updateProgress("Генерация: " + (KEY_LABELS[op.key] || op.key));
              await regenerateSection(op.key, regenCtx[op.key], { fromPlan: true });
            }
          }
          // Успешно до конца — помечаем currentOp как null
          currentOp = null;

          // ── 2b. Пост-план: TOC + каскады (один раз) ──
          buildTableOfContents();

          // Предложить обновить «Структура документа» если добавлялись/удалялись разделы
          if ((plan.add.length > 0 || plan.remove.length > 0) &&
              DOC_STATE.sectionOrder.includes("sum")) {
            const sumDef = DOC_STATE.sectionDefs["sum"];
            if (sumDef?.parts) {
              const costEst = typeof estimateSubsectionCost === "function"
                ? estimateSubsectionCost("sum", "Структура документа") : null;
              const costHint = costEst ? " (≈ $" + costEst.cost.toFixed(4) + ")" : "";
              const doUpdate = confirm(
                "План выполнен. Подраздел «Структура документа» в Исполнительном резюме может быть устаревшим.\n\n" +
                "Обновить его?" + costHint
              );
              if (doUpdate) {
                updateProgress("Обновление: Структура документа");
                await regenerateSubsection("sum", "Структура документа").catch(err =>
                  console.warn("Не удалось обновить «Структура документа»:", err)
                );
                buildTableOfContents();
              }
            }
          }

          // Предложить каскад для downstream-разделов, затронутых планом
          if (plan.add.length > 0) {
            const newDependents = computeDependents(DOC_STATE.effectiveDeps);
            const planKeys = new Set([...plan.add, ...plan.regen, ...plan.remove]);
            const downstream = new Set();
            for (const key of plan.add) {
              for (const dep of (newDependents[key] || new Set())) {
                if (dep !== "sum" && !planKeys.has(dep) && DOC_STATE.sectionOrder.includes(dep)) {
                  downstream.add(dep);
                }
              }
            }
            if (downstream.size > 0) {
              const labels = [...downstream].map(k => "«" + (KEY_LABELS[k] || k) + "»").join(", ");
              const est = typeof estimateCost === "function"
                ? estimateCost({ sections: [...downstream] }) : null;
              const hint = est ? " (≈ $" + est.cost.toFixed(4) + ")" : "";
              const doCascade = confirm(
                "План выполнен.\n\n" +
                "Добавленные разделы затрагивают контекст: " + labels + ".\n" +
                "Перегенерация улучшит их качество.\n\n" +
                "Перегенерировать?" + hint
              );
              if (doCascade) {
                const sorted = sortInTopoOrder([...downstream]);
                for (const depKey of sorted) {
                  try {
                    updateProgress("Каскад: " + (KEY_LABELS[depKey] || depKey));
                    await cascadeRegenerateOne(depKey);
                  } catch (err) {
                    console.warn("Каскад после плана: ошибка для", depKey, err);
                  }
                }
                buildTableOfContents();
              }
            }
          }

          // Удаление режимов (в обратном порядке индексов, чтобы не сбивать нумерацию)
          const sortedRemoves = [...plan.modeRemove].sort((a, b) => b[1] - a[1]);
          for (const [modeKey, idx] of sortedRemoves) {
            DOC_STATE.modes[modeKey]?.splice(idx, 1);
            if (DOC_STATE.modes[modeKey]?.length === 0) delete DOC_STATE.modes[modeKey];
          }

          // Перегенерация режимов — считаем успехи/ошибки для сводки
          let modeOk = 0, modeErr = 0;
          const modeErrorList = [];
          for (const [modeKey, idx] of (plan.modeRegen || [])) {
            // Размер genLog до вызова
            const beforeLen = genLog.length;
            await regenerateModeSilent(modeKey, idx);
            // Последняя запись — результат этого вызова
            const entry = genLog[genLog.length - 1];
            if (entry && entry.sectionKey === "mode:" + modeKey) {
              if (entry.status === "error") {
                modeErr++;
                modeErrorList.push({
                  modeKey, idx,
                  label: MODE_CONFIG?.[modeKey]?.title || modeKey,
                  error: entry.error,
                });
              } else if (entry.status === "done") {
                modeOk++;
              }
            }
          }
          // Если были ошибки в режимах — показываем сводку
          if (modeErr > 0) {
            const errDetails = modeErrorList
              .map(e => "• " + e.label + " (индекс " + e.idx + "): " + (e.error || "неизвестно"))
              .join("\n");
            // alert, а не confirm — это информирование, план уже выполнен
            setTimeout(() => {
              alert(
                "Режимы: " + modeOk + " успешно, " + modeErr + " с ошибками.\n\n" +
                "Ошибки:\n" + errDetails + "\n\n" +
                "Вы можете перегенерировать их вручную через соответствующие кнопки режимов."
              );
            }, 100);
          }

          if (progressText) progressText.textContent = "✓ Выполнено" +
            (modeErr > 0 ? " (режимы: " + modeOk + " ок, " + modeErr + " с ошибками)" : "");
        } catch (err) {
          console.error("Ошибка выполнения плана:", err);
          const friendlyMsg = _pauseFriendlyMessage(err);
          if (progressText) progressText.textContent = "⚠ Ошибка: " + friendlyMsg;

          if (step === 0) {
            // Откат версии только если ни один шаг не начинался
            const v = DOC_STATE.docVersion;
            if (typeof v === "object") {
              v.base = Math.max(1, (v.base || 1) - 1);
              v.sub = 0;
            } else {
              DOC_STATE.docVersion = Math.max(1, (v || 1) - 1);
            }
            const marker = genLog[genLog.length - 1];
            if (marker && marker.type === "version-marker") genLog.pop();
          }

          // Сохраняем pausedState = kind:"plan" с остатком шагов для возобновления
          if (currentOp !== null && currentOpIdx >= 0) {
            const remainingOps = allOpsForResume.slice(currentOpIdx + 1);
            DOC_STATE.pausedState = {
              kind: "plan",
              stepIdx: currentOpIdx,
              totalSteps: allOpsForResume.length,
              failedOp: currentOp,
              remainingOps,
              plan: {
                regen: [...plan.regen],
                remove: [...plan.remove],
                add: [...plan.add],
                modeRegen: [...(plan.modeRegen || [])],
                modeRemove: [...(plan.modeRemove || [])],
              },
              regenCtx: { ...regenCtx },
              addCtx: { ...addCtx },
              reason: friendlyMsg,
              reasonKind: err.kind || "unknown",
              timestamp: new Date().toISOString(),
            };
            _logPauseEvent("pause-marker", {
              kind: "plan",
              reasonKind: err.kind || "unknown",
              reason: friendlyMsg,
              opDescription: currentOp?.description || null,
              stepIdx: currentOpIdx,
              totalSteps: allOpsForResume.length,
            });
            _showPauseBadge(true);
            showPauseModal();
          }
        } finally {
          clearInterval(_planPollInterval);
          // Помечаем последний шаг
          const lastStep = document.getElementById("editPs" + (step - 1));
          if (lastStep) {
            lastStep.className = "progress-step done";
            lastStep.querySelector(".step-icon").textContent = "✓";
          }
          setTimeout(() => {
            if (progress) progress.classList.remove("active");
            if (runBtn) runBtn.disabled = false;
            renderEditSections(); // перерисовать с новым состоянием
            // Снимаем lock, следующий запуск плана теперь возможен
            window._editPlanRunning = false;
          }, 2000);
          // TOC уже перестроено в try-блоке; повторяем на случай ошибки
          if (step > 0) buildTableOfContents();
        }
      }

// ───── Исполнение плана (server/services/plan-executor.ts) · js:resumePlan
// philosynth.html строки 25916–26019 ─────

      async function resumePlan(mode) {
        const ps = DOC_STATE.pausedState;
        if (!ps || ps.kind !== "plan") {
          console.warn("resumePlan: нет pausedState для plan");
          return;
        }
        closePauseModal();
        _logPauseEvent("resume-marker", {
          kind: "plan",
          mode,
          opIdx: ps.currentOpIdx,
          opDescription: ps.currentOp?.description || null,
        });

        if (mode === "stop") {
          _clearPausedState();
          return;
        }

        // Восстанавливаем контексты
        const regenCtx = ps.regenCtx || {};
        const addCtx = ps.addCtx || {};

        // Собираем операции для возобновления
        let opsToRun;
        if (mode === "retry") {
          opsToRun = [ps.failedOp, ...(ps.remainingOps || [])];
        } else if (mode === "skip") {
          opsToRun = [...(ps.remainingOps || [])];
        } else {
          return;
        }

        if (opsToRun.length === 0) {
          _clearPausedState();
          alert("Все шаги выполнены.");
          return;
        }

        _clearPausedState();

        // UI: прогресс-текст
        const progressText = document.getElementById("editPlanProgressText");
        const progress = document.getElementById("editPlanProgress");
        if (progress) progress.classList.add("active");

        let stepIdx = ps.stepIdx + (mode === "skip" ? 1 : 0);
        const totalSteps = ps.totalSteps;
        let currentOp = null;
        let currentOpIdx = stepIdx - 1;

        try {
          for (let j = 0; j < opsToRun.length; j++) {
            currentOp = opsToRun[j];
            currentOpIdx = stepIdx + j;

            const label = (currentOp.action === "add" ? "Добавление: " :
                           currentOp.action === "remove" ? "Удаление: " :
                           "Генерация: ") + (KEY_LABELS[currentOp.key] || currentOp.key);
            if (progressText) {
              progressText.textContent = `[${currentOpIdx + 1}/${totalSteps}] ${label}`;
            }

            if (currentOp.action === "remove") {
              deleteSection(currentOp.key);
            } else if (currentOp.action === "add") {
              await addSection(currentOp.key, addCtx[currentOp.key] || "", { fromPlan: true });
            } else { // regen
              if (!DOC_STATE.sectionOrder.includes(currentOp.key)) continue;
              await regenerateSection(currentOp.key, regenCtx[currentOp.key] || "", { fromPlan: true });
            }
          }

          // Успешно до конца
          buildTableOfContents();
          if (progressText) progressText.textContent = "✓ Возобновление завершено";
          setTimeout(() => {
            if (progress) progress.classList.remove("active");
          }, 2000);
        } catch (err) {
          console.error("resumePlan: ошибка:", err);
          const friendlyMsg = _pauseFriendlyMessage(err);
          if (progressText) progressText.textContent = "⚠ Ошибка: " + friendlyMsg;

          // Сохраняем новый pausedState
          const remainingOps = opsToRun.slice(currentOpIdx - stepIdx + 1);
          DOC_STATE.pausedState = {
            kind: "plan",
            stepIdx: currentOpIdx,
            totalSteps,
            failedOp: currentOp,
            remainingOps,
            plan: ps.plan,
            regenCtx,
            addCtx,
            reason: friendlyMsg,
            reasonKind: err.kind || "unknown",
            timestamp: new Date().toISOString(),
          };
          _showPauseBadge(true);
          showPauseModal();
        }
      }

// ───── Исполнение плана (server/services/plan-executor.ts) · var:_planPollInterval
// philosynth.html строки 19579–19579 ─────
        let _planPollInterval = null;

// ───── Операции над разделами (server/services/generation-service.ts (расширение; факт 05/07)) · js:regenerateSection
// philosynth.html строки 19971–20227 ─────
      async function regenerateSection(sectionKey, newCtx, opts = {}) {
        const p = DOC_STATE.params;
        if (!p) return;

        // Синхронизируем keepFullBudget из текущего чекбокса (ТЗ tz_budget_mode 5.3):
        // если пользователь переключил чекбокс, это решение должно примениться.
        DOC_STATE.params.keepFullBudget = _currentKeepFullBudget();

        // ТЗ selective-parent-context 10.2: маркер миграции схемы при
        // перегенерации раздела в legacy-документе (без parentContextSchema).
        // После первой перегенерации документ переходит на селективную схему.
        const _hasConcepts = (DOC_STATE.participants || []).some(x => x && x.type === "concept");
        if (_hasConcepts && DOC_STATE._parentContextSchema === "monolithic") {
          genLog.push({
            type: "schema-migration-marker",
            timestamp: new Date().toISOString(),
            fromSchema: "monolithic",
            toSchema: PARENT_CONTEXT_SCHEMA_ID,
            sectionKey,
            sectionLabel: KEY_LABELS[sectionKey] || sectionKey,
          });
          DOC_STATE._parentContextSchema = PARENT_CONTEXT_SCHEMA_ID;
          try { updateSchemaBadgeInHeader(PARENT_CONTEXT_SCHEMA_ID); } catch (_) {}
        }

        // ── 1. Блокируем UI ──
        const card = document.getElementById("editCard-" + sectionKey);
        const btn = document.getElementById("editRegenBtn-" + sectionKey);
        const progress = document.getElementById("editProgress-" + sectionKey);
        const progressText = document.getElementById("editProgressText-" + sectionKey);
        if (btn) btn.disabled = true;
        if (progress) progress.classList.add("active");

        let container;
        try {
          // ── 2. Обновляем контекст в DOC_STATE ──
          if (newCtx) {
            DOC_STATE.params.secCtx[sectionKey] = newCtx;
          } else {
            delete DOC_STATE.params.secCtx[sectionKey];
          }

          // ── 3. Пересобираем промпт для этого раздела ──
          // Берём текущие параметры и строим def заново
          const fullP = { ...p, secCtx: { ...DOC_STATE.params.secCtx } };
          const allDefs = buildSectionDefs(fullP);
          patchPromptsWithSecCtx(allDefs, fullP.secCtx);
          const defsMap = Object.fromEntries(allDefs.map(d => [d.key, d]));
          const def = defsMap[sectionKey];
          if (!def) throw new Error("Раздел «" + sectionKey + "» не найден в определениях.");

          // Сохраняем оригинальный номер из текущего состояния
          const existingDef = DOC_STATE.sectionDefs[sectionKey];
          if (existingDef) def.num = existingDef.num;

          if (sectionKey === "capsule") {
            // Капсула не имеет DOM-контейнера в docBodies — используем временный
            container = document.createElement("div");
            container.style.display = "none";
            document.body.appendChild(container);
          } else {
            const dbIdx = DOC_STATE.sectionDbIdx[sectionKey];
            container = document.getElementById("db" + dbIdx);
            if (!container) throw new Error("DOM-контейнер db" + dbIdx + " не найден.");
          }

          // ── 4. Собираем контекст из ранее сгенерированных разделов ──
          if (progressText) progressText.textContent = "Построение контекста...";

          const generated = {};
          for (const key of DOC_STATE.sectionOrder) {
            if (key === sectionKey) continue; // пропускаем себя
            const idx = DOC_STATE.sectionDbIdx[key];
            const el = document.getElementById("db" + idx);
            if (el && el.querySelector(".doc-section")) {
              generated[key] = el;
            }
          }

          let prior = "";
          if (sectionKey !== "sum") {
            try {
              prior = buildContextForSection(
                sectionKey, generated, fullP.depth,
                DOC_STATE.effectiveDeps,
                DOC_STATE.resolvedDeps
              );
            } catch (ctxErr) {
              console.warn("Ошибка построения контекста при перегенерации", sectionKey, ctxErr);
            }
          }

          // ── 5. Собираем финальный промпт ──
          const SYS = buildSYS(fullP);
          const _partStatic10a = baseCtxStatic(fullP);
          const _partParents10a = baseCtxParents(fullP, sectionKey);
          const partBase = _partStatic10a + _partParents10a;
          if (!genCommon) {
            const scaffoldLen = `ПАРАМЕТРЫ СИНТЕЗА:\n\n\nЗАДАНИЕ:...\n\n\n`.length;
            genCommon = {
              sysChars: SYS.length, 
              baseChars: partBase.length,
              baseCharsWithoutConcepts: _partStatic10a.length,
              totalConceptOverhead: _partParents10a.length,
              budgetMode: (fullP.keepFullBudget || (DOC_STATE.params && DOC_STATE.params.keepFullBudget)) ? 'full' : 'shrink',
              parentSpecBySection: buildParentSpecBySection(fullP, [sectionKey]),
              rulesChars: 0, 
              qualityChars: 0,
              scaffoldChars: scaffoldLen,
              totalChars: SYS.length + partBase.length + scaffoldLen,
              conceptBlockSizes: computeFullConceptBlockSizes(fullP),
            };
          }
          const sp = `§ ${def.num} — ${def.title.toUpperCase()}\n${def.prompt}`;
          const fp = `ПАРАМЕТРЫ СИНТЕЗА:\n${partBase}${prior}\n\nЗАДАНИЕ: составь ТОЛЬКО следующие разделы (строго в указанном порядке, без добавления других):\n\n${sp}${buildQualityReinforcement(p)}${STOP_SIGNAL}`;

          // ── 6. Записываем предварительный genLog ──
          // Карта ожидаемых секций для трекинга
          const subsecMap = buildSubsectionMap(fullP);
          const expectedSubs = subsecMap[sectionKey] || [];

          const genEntry = {
            __augmentCtx: { p: fullP, sectionKey, parentsLen: (typeof _partParents10a !== 'undefined' ? _partParents10a.length : 0) },
            sectionKey: sectionKey,
            sectionLabel: def.title + " [перегенерация]",
            priorChars: prior.length,
            taskChars: sp.length,
            inputChars: SYS.length + fp.length,
            outputChars: 0,
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            error: null,
            status: "streaming",
            source: "edit",
            secCtxPreview: newCtx
              ? newCtx.slice(0, 120) + (newCtx.length > 120 ? "…" : "")
              : null,
            secCtxChars: newCtx ? newCtx.length : 0,
            expectedSubsections: expectedSubs,
            subsections: [],
            _sys: SYS,
            _promptSkeleton: buildPromptSkeleton(fp),
          };
          if (genEntry.__augmentCtx) { _augmentGenEntry(genEntry, genEntry.__augmentCtx.p, genEntry.__augmentCtx.sectionKey, genEntry.__augmentCtx.parentsLen); delete genEntry.__augmentCtx; }
        genLog.push(genEntry);

          // ── 7. Стримим ответ в DOM-контейнер ──
          if (progressText) progressText.textContent = "Генерация...";

          container.innerHTML = "";

          let lastLogRefresh = 0;
          const onDelta = (charsSoFar, htmlSoFar) => {
            genEntry.outputChars = charsSoFar;
            if (htmlSoFar && expectedSubs.length > 0) {
              genEntry.subsections = parseSubsectionsFromHTML(htmlSoFar, expectedSubs);
            }
            if (progressText) progressText.textContent = "Генерация... " + charsSoFar + " симв.";
          };

          const usage = await streamResp(fp, container, SYS, onDelta);

          // ── 8. Финализируем genLog ──
          totalInputTokens += usage.input_tokens;
          totalOutputTokens += usage.output_tokens;

          genEntry.outputChars = container.innerHTML.length;
          if (expectedSubs.length > 0) {
            genEntry.subsections = parseSubsectionsFromHTML(container.innerHTML, expectedSubs);
            genEntry.subsections.forEach(s => { s.status = "done"; });
          }
          genEntry.inputTokens = usage.input_tokens;
          genEntry.outputTokens = usage.output_tokens;
          genEntry.cost = usage.input_tokens * 3 / 1e6 + usage.output_tokens * 15 / 1e6;
          genEntry.status = "done";

          // ── 9. Вставляем <details> для доп. контекста раздела ──
          if (newCtx) {
            const disc = makeSectionCtxDisclosure(newCtx);
            container.insertBefore(disc, container.firstChild);
          }

          // ── 10. Обновляем docTitle из раздела name ──
          if (sectionKey === "name") {
            updateDocTitleFromName(container);
          }

          // ── 11. Если это граф — перепарсить G ──
          if (sectionKey === "graph") {
            try {
              G = parseGraph(container);
              if (G.nodes.length > 0) {
                document.getElementById("btnGraph").style.display = "";
              }
            } catch (e) {
              console.warn("Graph re-parse after edit:", e);
            }
          }

          // Пересобираем фактическую карту зависимостей
          DOC_STATE.factualDeps = buildFactualDepsMap(ctxLog);

          // ── 12. Обновляем DOC_STATE ──
          if (sectionKey === "capsule") {
            // regenerateSection стримит во временный контейнер (container),
            // затем обновляем шапку и capsuleHTML. DOM-контейнер не сохраняется.
            DOC_STATE.capsuleHTML = container.innerHTML;
            updateCapsuleInHeader();
            // container удаляется в finally-блоке regenerateSection
            updateModeButtons();
          }
          DOC_STATE.sectionDefs[sectionKey] = { ...def };
          DOC_STATE.editedSections.add(sectionKey);

          // ── 13. Обновляем стоимость в футере ──
          updateFooterCost();

          // ── 14. Обновляем UI модального окна ──
          if (progressText) progressText.textContent = "✓ Готово";
          if (progress) {
            progress.querySelector(".edit-regen-spinner")?.remove();
          }

          // Обновляем счётчик в футере модалки
          const infoEl = document.getElementById("editFooterInfo");
          if (infoEl) {
            const order = DOC_STATE.sectionOrder.filter(k => k !== "sum");
            infoEl.textContent = order.length + " разделов · " +
              DOC_STATE.editedSections.size + " изменено";
          }

        } catch (err) {
          console.error("Ошибка перегенерации раздела:", sectionKey, err);
          if (progressText) progressText.textContent = "⚠ Ошибка: " + err.message;
          const genEntry = genLog[genLog.length - 1];
          if (genEntry && genEntry.sectionKey === sectionKey) {
            genEntry.status = "error";
            genEntry.error = err.message;
          }
          // Если вызов из плана — пробрасываем, чтобы executeEditPlan
          // мог зафиксировать pausedPlan и показать модалку.
          // При ручной перегенерации — глотаем (UI уже показал ошибку в карточке).
          if (opts.fromPlan) {
            throw err;
          }
        } finally {
          if (btn) btn.disabled = false;
          setTimeout(() => {
            if (progress) progress.classList.remove("active");
          }, 3000);
          if (sectionKey === "capsule" && container?.parentNode) {
            container.remove(); // убираем временный контейнер
          }
          if (!opts.fromPlan) buildTableOfContents();
        }
      }

// ───── Операции над разделами (server/services/generation-service.ts (расширение; факт 05/07)) · js:regenerateSubsection
// philosynth.html строки 20236–20476 ─────
      async function regenerateSubsection(sectionKey, subsectionName, opts = {}) {
        const p = DOC_STATE.params;
        if (!p) return [];

        const def = DOC_STATE.sectionDefs[sectionKey];
        if (!def?.parts) {
          throw new Error("Раздел «" + sectionKey + "» не имеет структурированных parts.");
        }

        const dbIdx = DOC_STATE.sectionDbIdx[sectionKey];
        const container = document.getElementById("db" + dbIdx);
        if (!container) throw new Error("DOM-контейнер не найден.");

        // ── 1. Контексты ──
        const intraSectionCtx = extractRelevantIntraSectionContext(
          container, sectionKey, subsectionName
        );

        // Логируем внутрисекционный контекст (поподраздельно)
        if (intraSectionCtx) {
          // Парсим маркеры [Название подраздела] для поэлементного логирования
          const intraParts = [];
          const regex = /\[([^\]]+)\]\n/g;
          let m, lastIdx = 0;
          while ((m = regex.exec(intraSectionCtx)) !== null) {
            if (intraParts.length > 0) {
              intraParts[intraParts.length - 1].len = m.index - intraParts[intraParts.length - 1]._start;
            }
            intraParts.push({ name: m[1], _start: m.index });
            lastIdx = m.index;
          }
          if (intraParts.length > 0) {
            intraParts[intraParts.length - 1].len = intraSectionCtx.length - intraParts[intraParts.length - 1]._start;
          }

          // Фильтруем артефакты truncateText (маркеры «...сокращено...»)
          // И любые ложноположительные срабатывания regex внутри содержимого
          // подразделов (когда сам текст содержит паттерн [X]\n): оставляем
          // только записи, имя которых совпадает с реальным data-section в DOM.
          // Длину отброшенных записей сливаем в предшествующую реальную запись,
          // чтобы итог по подразделам соответствовал totalUsed контекста.
          const realSubsectionNames = new Set(
            Array.from(container.querySelectorAll("[data-section]"))
              .map(el => el.getAttribute("data-section"))
          );
          const cleanParts = [];
          for (const p of intraParts) {
            if (realSubsectionNames.has(p.name)) {
              cleanParts.push(p);
            } else if (cleanParts.length > 0) {
              cleanParts[cleanParts.length - 1].len += p.len;
            }
          }

          const entries = cleanParts.length > 0
            ? cleanParts.map(p => ({
                key: "intra:" + p.name,
                status: "found",
                len: p.len,
                priority: "required",
              }))
            : [{ key: "intra:" + sectionKey, status: "found", len: intraSectionCtx.length, priority: "required" }];

          ctxLog.push({
            sectionKey: sectionKey + ":" + subsectionName,
            type: "intra-section",
            budget: intraSectionCtx.length,
            entries,
            totalUsed: intraSectionCtx.length,
            reqFound: entries.length,
            reqTotal: entries.length,
            optIncluded: 0,
            optTotal: 0,
          });
        }

        let currentContent = null;
        if (opts.includeCurrentContent) {
          currentContent = extractSubsectionContent(container, subsectionName);
        }

        const generated = {};
        for (const key of DOC_STATE.sectionOrder) {
          if (key === sectionKey) continue;
          const idx = DOC_STATE.sectionDbIdx[key];
          const el = document.getElementById("db" + idx);
          if (el && el.querySelector(".doc-section")) generated[key] = el;
        }

        let priorCtx = "";
        if (sectionKey !== "sum") {
          try {
            priorCtx = buildContextForSection(
              sectionKey, generated, p.depth,
              DOC_STATE.effectiveDeps, DOC_STATE.resolvedDeps
            );
          } catch (e) { console.warn("Subsection regen context error:", e); }
        }

        // ── 2. Промпт ──
        const subPrompt = serializeSubsectionRegen(
          def.parts, subsectionName, intraSectionCtx,
          { userNote: opts.userNote || "", currentContent,
            resumeFromInterruption: !!opts.resumeFromInterruption }
        );

        const SYS = buildSYS(p, { outputMode: "subsection" });
        const _partP10d = { ...p, secCtx: { ...p.secCtx } };
        const _partStatic10d = baseCtxStatic(_partP10d);
        const _partParents10d = baseCtxParents(_partP10d, sectionKey, subsectionName);
        const partBase = _partStatic10d + _partParents10d;
        const fp = `ПАРАМЕТРЫ СИНТЕЗА:\n${partBase}${priorCtx}\n\n${subPrompt}`;

        // ── 3. GenLog ──
        const genEntry = {
          __augmentCtx: { p, sectionKey, parentsLen: (typeof _partParents10d !== 'undefined' ? _partParents10d.length : 0), subsectionName },
          sectionKey: sectionKey + ":" + subsectionName,
          sectionLabel: def.title + " → " + subsectionName + " [подраздел]",
          priorChars: priorCtx.length, 
          taskChars: subPrompt.length,
          inputChars: SYS.length + fp.length,
          outputChars: 0, 
          inputTokens: 0, 
          outputTokens: 0,
          cost: 0, 
          error: null, 
          status: "streaming",
          source: "subsection-regen",
          expectedSubsections: [subsectionName], 
          subsections: [],
          _sys: SYS,
          _promptSkeleton: buildPromptSkeleton(fp),
          intraSectionChars: intraSectionCtx ? intraSectionCtx.length : 0,
            hasUserNote: !!(opts.userNote),
            userNotePreview: opts.userNote
              ? opts.userNote.slice(0, 120) + (opts.userNote.length > 120 ? "…" : "")
              : null,
            hasCurrentContent: !!(opts.includeCurrentContent && currentContent),
            currentContentChars: currentContent ? currentContent.length : 0,
        };
        if (genEntry.__augmentCtx) { _augmentGenEntry(genEntry, genEntry.__augmentCtx.p, genEntry.__augmentCtx.sectionKey, genEntry.__augmentCtx.parentsLen, genEntry.__augmentCtx.subsectionName); delete genEntry.__augmentCtx; }
        genLog.push(genEntry);

        // ── 4. Стриминг — прямо в DOM, на место старого подраздела ──
        try {
          const progress = document.getElementById("subProgress-" + sectionKey);
          const progressText = document.getElementById("subProgressText-" + sectionKey);
          if (progress) progress.classList.add("active");

          // Находим старый подраздел и заменяем на контейнер стриминга
          const oldSubDiv = container.querySelector(`[data-section="${subsectionName}"]`)
            || (() => {
              // Нечёткий поиск
              const allSubs = container.querySelectorAll("[data-section]");
              for (const sub of allSubs) {
                const name = sub.getAttribute("data-section");
                if (name.toLowerCase().includes(subsectionName.toLowerCase()) ||
                    subsectionName.toLowerCase().includes(name.toLowerCase())) {
                  return sub;
                }
              }
              return null;
            })();

          const streamTarget = document.createElement("div");
          streamTarget.style.cssText =
            "border-left:3px solid var(--blue-corp);padding-left:12px;margin:12px 0;min-height:40px";

          if (oldSubDiv) {
            oldSubDiv.replaceWith(streamTarget);
          } else {
            const docContent = container.querySelector(".doc-content");
            if (docContent) docContent.appendChild(streamTarget);
          }

          // Прокрутка к месту генерации
          streamTarget.scrollIntoView({ behavior: "smooth", block: "nearest" });

          let lastLogRefresh = 0;
          const usage = await streamResp(fp, streamTarget, SYS, (chars, html) => {
            genEntry.outputChars = chars;
            if (progressText) progressText.textContent = "Генерация «" + subsectionName + "»... " + chars + " симв.";
            // Live-обновление лога
            const now = Date.now();
            if (now - lastLogRefresh > 300) {
              lastLogRefresh = now;
              refreshCtxLogIfOpen();
            }
          });

          totalInputTokens += usage.input_tokens;
          totalOutputTokens += usage.output_tokens;
          genEntry.inputTokens = usage.input_tokens;
          genEntry.outputTokens = usage.output_tokens;
          genEntry.outputChars = streamTarget.innerHTML.length;
          genEntry.cost = usage.input_tokens * 3 / 1e6 + usage.output_tokens * 15 / 1e6;
          genEntry.subsections = [{ name: subsectionName, chars: genEntry.outputChars, status: "done" }];
          genEntry.status = "done";
          refreshCtxLogIfOpen();

          // ── 5. Извлечь data-section из результата и заменить обёртку ──
          const newSubDiv = streamTarget.querySelector(`[data-section="${subsectionName}"]`)
                         || streamTarget.querySelector(`[data-section]`);

          if (newSubDiv) {
            streamTarget.replaceWith(newSubDiv);
          } else {
            // Модель не обернула в data-section — убираем стиль обёртки, содержимое уже на месте
            streamTarget.style.cssText = "";
          }

          // ── 6. Состояние ──
          DOC_STATE.editedSections.add(sectionKey);

          if (sectionKey === "graph") {
            try { G = parseGraph(container); if (G.nodes.length > 0) document.getElementById("btnGraph").style.display = ""; } catch (e) {}
          }
          if (sectionKey === "name") updateDocTitleFromName(container);
          if (sectionKey === "capsule") { DOC_STATE.capsuleHTML = container.innerHTML; updateCapsuleInHeader(); }

          DOC_STATE.factualDeps = buildFactualDepsMap(ctxLog);
          updateFooterCost();

          // Обновляем снимок перечня разделов при перегенерации «Структура документа»
          if (sectionKey === "sum" && subsectionName === "Структура документа") {
            DOC_STATE.structureSections = [...DOC_STATE.sectionOrder];
          }

          // ── 7. Возвращаем зависимых для каскада ──
          // Включаем все подразделы (в т.ч. отсутствующие в DOM — они будут
          // сгенерированы заново при каскадном вызове regenerateSubsection).
          return getIntraDependents(sectionKey, subsectionName);

        } catch (err) {
          genEntry.status = "error";
          genEntry.error = err.message;
          throw err;
        } finally {
          buildTableOfContents();
        }
      }

// ───── Операции над разделами (server/services/generation-service.ts (расширение; факт 05/07)) · js:addSection
// philosynth.html строки 20922–21216 ─────
      async function addSection(sectionKey, newCtx, opts = {}) {
        const p = DOC_STATE.params;
        if (!p) return;

        // ── Блокируем UI ──
        const genBtn = document.getElementById("editAddGenBtn");
        const progress = document.getElementById("editAddProgress");
        const progressText = document.getElementById("editAddProgressText");
        if (genBtn) genBtn.disabled = true;
        if (progress) progress.classList.add("active");

        try {
          // ── 1. Определяем позицию вставки ──
          const insertAfterIdx = findInsertPosition(sectionKey);
          // insertAfterIdx — индекс в DOC_STATE.sectionOrder

          // ── 2. Обновляем DOC_STATE.sectionOrder ──
          DOC_STATE.sectionOrder.splice(insertAfterIdx + 1, 0, sectionKey);

          // ── 3. Сохраняем контекст ──
          if (newCtx) {
            DOC_STATE.params.secCtx[sectionKey] = newCtx;
          }

          // ── 4. Пересчитываем зависимости с новым разделом ──
          recalcDependencies();

          // ── 5. Создаём DOM-контейнер и вставляем в правильное место ──
          const db = document.getElementById("docBodies");
          const newContainer = document.createElement("div");
          newContainer.className = "doc-body";
          newContainer.setAttribute("data-section-key", sectionKey);
          newContainer.style.borderTop = "none";

          // Ищем DOM-элемент раздела, ПОСЛЕ которого вставляем
          const prevKey = DOC_STATE.sectionOrder[insertAfterIdx];
          const prevDbIdx = DOC_STATE.sectionDbIdx[prevKey];
          const prevEl = document.getElementById("db" + prevDbIdx);

          if (prevEl && prevEl.nextSibling) {
            db.insertBefore(newContainer, prevEl.nextSibling);
          } else {
            db.appendChild(newContainer);
          }

          // ── 6. Перестраиваем db-маппинг ──
          rebuildDbMapping();

          // ── 7. Пересчитываем номера §§ ──
          // Сначала создаём def для нового раздела
          const fullP = { ...p, sec: DOC_STATE.sectionOrder.filter(k => k !== "sum"), secCtx: { ...DOC_STATE.params.secCtx } };
          const allDefs = buildSectionDefs(fullP);
          patchPromptsWithSecCtx(allDefs, fullP.secCtx);
          const defsMap = Object.fromEntries(allDefs.map(d => [d.key, d]));
          const newDef = defsMap[sectionKey];
          if (!newDef) throw new Error("Раздел «" + sectionKey + "» не найден в определениях.");

          // Номер будет назначен в recalcSectionNumbers
          DOC_STATE.sectionDefs[sectionKey] = { ...newDef };

          const renumberMap = recalcSectionNumbers();
          // Присваиваем актуальный номер
          newDef.num = DOC_STATE.sectionDefs[sectionKey].num;

          // ── 8. Обновляем ссылки §N в существующих разделах ──
          renumberSectionRefs(renumberMap);

          // ── 9. Собираем контекст и промпт ──
          if (progressText) progressText.textContent = "Построение контекста...";

          const generated = {};
          for (const key of DOC_STATE.sectionOrder) {
            if (key === sectionKey) continue;
            const idx = DOC_STATE.sectionDbIdx[key];
            const el = document.getElementById("db" + idx);
            if (el && el.querySelector(".doc-section")) {
              generated[key] = el;
            }
          }

          let prior = "";
          if (sectionKey !== "sum") {
            try {
              prior = buildContextForSection(
                sectionKey, generated, fullP.depth,
                DOC_STATE.effectiveDeps,
                DOC_STATE.resolvedDeps
              );
            } catch (ctxErr) {
              console.warn("Ошибка контекста при добавлении раздела", sectionKey, ctxErr);
            }
          }

          const SYS = buildSYS(fullP);
          const _partStatic10c = baseCtxStatic(fullP);
          const _partParents10c = baseCtxParents(fullP, sectionKey);
          const partBase = _partStatic10c + _partParents10c;
          if (!genCommon) {
            const scaffoldLen = `ПАРАМЕТРЫ СИНТЕЗА:\n\n\nЗАДАНИЕ:...\n\n\n`.length;
            genCommon = {
              sysChars: SYS.length, 
              baseChars: partBase.length,
              baseCharsWithoutConcepts: _partStatic10c.length,
              totalConceptOverhead: _partParents10c.length,
              budgetMode: (fullP.keepFullBudget || (DOC_STATE.params && DOC_STATE.params.keepFullBudget)) ? 'full' : 'shrink',
              parentSpecBySection: buildParentSpecBySection(fullP, [sectionKey]),
              rulesChars: 0, 
              qualityChars: 0,
              scaffoldChars: scaffoldLen,
              totalChars: SYS.length + partBase.length + scaffoldLen,
              conceptBlockSizes: computeFullConceptBlockSizes(fullP),
            };
          }
          const sp = `§ ${newDef.num} — ${newDef.title.toUpperCase()}\n${newDef.prompt}`;
          const fp = `ПАРАМЕТРЫ СИНТЕЗА:\n${partBase}${prior}\n\nЗАДАНИЕ: составь ТОЛЬКО следующие разделы (строго в указанном порядке, без добавления других):\n\n${sp}${buildQualityReinforcement(p)}${STOP_SIGNAL}`;
          
          // Карта ожидаемых секций для трекинга
          const subsecMap = buildSubsectionMap(fullP);
          const expectedSubs = subsecMap[sectionKey] || [];

          // ── 10. GenLog ──
          const genEntry = {
            __augmentCtx: { p: fullP, sectionKey, parentsLen: (typeof _partParents10c !== 'undefined' ? _partParents10c.length : 0) },
            sectionKey,
            sectionLabel: newDef.title + " [добавлен]",
            priorChars: prior.length,
            taskChars: sp.length,
            inputChars: SYS.length + fp.length,
            outputChars: 0,
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            error: null,
            status: "streaming",
            source: "edit-add",
            expectedSubsections: expectedSubs,
            subsections: [],
          };
          if (genEntry.__augmentCtx) { _augmentGenEntry(genEntry, genEntry.__augmentCtx.p, genEntry.__augmentCtx.sectionKey, genEntry.__augmentCtx.parentsLen); delete genEntry.__augmentCtx; }
        genLog.push(genEntry);

          // ── 11. Стриминг ──
          if (progressText) progressText.textContent = "Генерация...";

          const onDelta = (charsSoFar, htmlSoFar) => {
            genEntry.outputChars = charsSoFar;
            if (htmlSoFar && expectedSubs.length > 0) {
              genEntry.subsections = parseSubsectionsFromHTML(htmlSoFar, expectedSubs);
            }
            if (progressText) progressText.textContent = "Генерация... " + charsSoFar + " симв.";
          };

          const usage = await streamResp(fp, newContainer, SYS, onDelta);

          totalInputTokens += usage.input_tokens;
          totalOutputTokens += usage.output_tokens;

          genEntry.outputChars = newContainer.innerHTML.length;
          
          // Финализация subsections
          if (expectedSubs.length > 0) {
            genEntry.subsections = parseSubsectionsFromHTML(newContainer.innerHTML, expectedSubs);
            genEntry.subsections.forEach(s => { s.status = "done"; });
          }
          
          genEntry.inputTokens = usage.input_tokens;
          genEntry.outputTokens = usage.output_tokens;
          genEntry.cost = usage.input_tokens * 3 / 1e6 + usage.output_tokens * 15 / 1e6;
          genEntry.status = "done";

          // ── 12. Вставляем <details> для контекста ──
          if (newCtx) {
            const disc = makeSectionCtxDisclosure(newCtx);
            newContainer.insertBefore(disc, newContainer.firstChild);
          }

          // ── 13. Обработка особых разделов ──
          if (sectionKey === "name") {
            updateDocTitleFromName(newContainer);
          }
          if (sectionKey === "graph") {
            try {
              G = parseGraph(newContainer);
              if (G.nodes.length > 0) {
                document.getElementById("btnGraph").style.display = "";
              }
            } catch (e) {
              console.warn("Graph parse after add:", e);
            }
          }

          // ── 14. Финализация DOC_STATE ──
          if (sectionKey === "capsule") {
            DOC_STATE.capsuleHTML = newContainer.innerHTML;
            updateCapsuleInHeader();
            // Удаляем из docBodies — капсула живёт только в шапке
            newContainer.remove();
            delete DOC_STATE.sectionDbIdx["capsule"];
            rebuildDbMapping();
            updateModeButtons();
          }
          DOC_STATE.editedSections.add(sectionKey);

          updateFooterCost();

          // ── 15. Перерисовываем модальное окно и показываем каскад ──
          if (progressText) progressText.textContent = "✓ Готово";
          if (!opts.fromPlan) {
            setTimeout(() => renderEditSections(), 1500);
            buildTableOfContents();
          }

          if (!opts.fromPlan && sectionKey !== "sum" && sectionKey !== "capsule" && DOC_STATE.sectionOrder.includes("sum")) {
            const sumDef = DOC_STATE.sectionDefs["sum"];
            if (sumDef?.parts) {
              setTimeout(() => {
                const costEst = estimateSubsectionCost("sum", "Структура документа");
                const costHint = costEst ? " (≈ $" + costEst.cost.toFixed(4) + ")" : "";
                const doUpdate = confirm(
                  "Раздел добавлен. Подраздел «Структура документа» в Исполнительном резюме устарел.\n\n" +
                  "Обновить его?" + costHint
                );
                if (doUpdate) {
                  regenerateSubsection("sum", "Структура документа").catch(err =>
                    console.warn("Не удалось обновить «Структура документа»:", err)
                  );
                }
              }, 500);
            }
          }

          // ── 16. Каскад: предложить перегенерировать разделы, получающие контекст от нового ──
          if (!opts.fromPlan && sectionKey !== "sum" && sectionKey !== "capsule") {
            const newDependents = computeDependents(DOC_STATE.effectiveDeps);
            const downstream = [...(newDependents[sectionKey] || new Set())]
              .filter(k => k !== "sum" && k !== sectionKey && DOC_STATE.sectionOrder.includes(k));

            if (downstream.length > 0) {
              setTimeout(() => {
                const labels = downstream.map(k => "«" + (KEY_LABELS[k] || k) + "»").join(", ");
                const word = downstream.length === 1 ? "раздел зависит" : "разделов зависят";

                let hint = "";
                const est = estimateCost({ sections: downstream });
                if (est) hint = " (≈ $" + est.cost.toFixed(4) + ")";

                const doCascade = confirm(
                  "Раздел «" + (KEY_LABELS[sectionKey] || sectionKey) + "» добавлен.\n\n" +
                  downstream.length + " " + word + " от его контекста: " + labels + ".\n" +
                  "Перегенерация улучшит их качество за счёт нового контекста.\n\n" +
                  "Перегенерировать?" + hint
                );

                if (doCascade) {
                  const sorted = sortInTopoOrder(downstream);
                  (async () => {
                    for (const depKey of sorted) {
                      try {
                        await cascadeRegenerateOne(depKey);
                      } catch (err) {
                        console.warn("Каскад после добавления: ошибка для", depKey, err);
                      }
                    }
                    updateFooterCost();
                    buildTableOfContents();
                  })();
                }
              }, 800); // задержка, чтобы не конфликтовать с предложением «Структура документа»
            }
          }

        } catch (err) {
          console.error("Ошибка добавления раздела:", sectionKey, err);
          if (progressText) progressText.textContent = "⚠ Ошибка: " + err.message;

          // Откатываем: удаляем раздел если он был частично добавлен
          if (DOC_STATE.sectionOrder.includes(sectionKey)) {
            DOC_STATE.sectionOrder = DOC_STATE.sectionOrder.filter(k => k !== sectionKey);
            delete DOC_STATE.sectionDefs[sectionKey];
            delete DOC_STATE.params.secCtx[sectionKey];
            const idx = DOC_STATE.sectionDbIdx[sectionKey];
            const el = document.getElementById("db" + idx);
            if (el) el.remove();
            rebuildDbMapping();
            recalcDependencies();
            const rollbackRenumber = recalcSectionNumbers();
            renumberSectionRefs(rollbackRenumber);
          }
        } finally {
          if (genBtn) genBtn.disabled = false;
          setTimeout(() => {
            if (progress) progress.classList.remove("active");
          }, 3000);
        }
      }

// ───── Операции над разделами (server/services/generation-service.ts (расширение; факт 05/07)) · js:deleteSection
// philosynth.html строки 20806–20899 ─────
      function deleteSection(sectionKey) {
        // ── 0. Запоминаем зависимые ДО удаления ──
        const dependentsBefore = computeDependents(DOC_STATE.effectiveDeps);
        const factualDepsBefore = DOC_STATE.factualDeps ? { ...DOC_STATE.factualDeps } : {};

        // ── 1. Удаляем DOM-контейнер ──
        const dbIdx = DOC_STATE.sectionDbIdx[sectionKey];
        const container = document.getElementById("db" + dbIdx);
        if (container) container.remove();

        // ── 1b. Запоминаем номер удалённого раздела ДО очистки ──
        const deletedNum = DOC_STATE.sectionDefs[sectionKey]?.num;

        // ── Запись в лог ──
        genLog.push({
          type: "deletion-marker",
          sectionKey: sectionKey,
          sectionLabel: KEY_LABELS[sectionKey] || sectionKey,
          sectionNum: deletedNum,
          timestamp: new Date().toISOString(),
          status: "done",
          inputChars: 0, outputChars: 0,
          inputTokens: 0, outputTokens: 0,
          cost: 0,
        });
        refreshCtxLogIfOpen();

        // ── 2. Обновляем DOC_STATE ──
        DOC_STATE.sectionOrder = DOC_STATE.sectionOrder.filter(k => k !== sectionKey);
        delete DOC_STATE.sectionDbIdx[sectionKey];
        delete DOC_STATE.sectionDefs[sectionKey];
        delete DOC_STATE.params.secCtx[sectionKey];
        DOC_STATE.editedSections.delete(sectionKey);

        // ── 3. Перестраиваем маппинг db-индексов ──
        rebuildDbMapping();

        // ── 4. Пересчитываем зависимости (без удалённого раздела) ──
        recalcDependencies();

        // ── 5. Пересчитываем номера §§ ──
        //const deletedNum = deletedDef?.num;
        const renumberMap = recalcSectionNumbers();

        // ── 6. Обновляем ссылки §N в тексте (с пометкой удалённого) ──
        renumberSectionRefs(renumberMap, deletedNum ? [deletedNum] : []);

        // ── 8. Если удалили граф — скрываем кнопку графа ──
        if (sectionKey === "graph") {
          G = {
            nodes: [], edges: [],
            topology: { clusters: {}, roles: { structural: {}, procedural: {} }, clusterLabels: [] }
          };
          graphBodyIdx = -1;
          document.getElementById("btnGraph").style.display = "none";
        }

        // ── Если удалили «Название» — вернуть заголовок по умолчанию ──
        if (sectionKey === "name") {
          document.getElementById("docTitle").textContent = "Синтез Философской Концепции";
        }

        // ── Если удалили капсулу — очищаем шапку и кнопки режимов ──
        if (sectionKey === "capsule") {
          DOC_STATE.capsuleHTML = "";
          const capsuleDisc = document.querySelector(".header-disclosure-capsule");
          if (capsuleDisc) capsuleDisc.remove();
          updateModeButtons();
        }

        // ── 9. Перерисовываем модальное окно ──
        renderEditSections();
        buildTableOfContents();

        // ── Предложить обновление «Структура документа» в резюме ──
        if (sectionKey !== "sum" && sectionKey !== "capsule" && DOC_STATE.sectionOrder.includes("sum")) {
          const def = DOC_STATE.sectionDefs["sum"];
          if (def?.parts) {
            setTimeout(() => {
              const costEst = estimateSubsectionCost("sum", "Структура документа");
              const costHint = costEst ? " (≈ $" + costEst.cost.toFixed(4) + ")" : "";
              const doUpdate = confirm(
                "Раздел удалён. Подраздел «Структура документа» в Исполнительном резюме устарел.\n\n" +
                "Обновить его?" + costHint
              );
              if (doUpdate) {
                regenerateSubsection("sum", "Структура документа").catch(err =>
                  console.warn("Не удалось обновить «Структура документа»:", err)
                );
              }
            }, 500);
          }
        }
      }

// ───── Операции над разделами (server/services/generation-service.ts (расширение; факт 05/07)) · js:buildDeletionReplacements
// philosynth.html строки 20759–20801 ─────
      function buildDeletionReplacements(deletedKey) {
        // Какие контекстные ключи предоставляет удаляемый раздел?
        // Ищем все ключи вида "deletedKey:*" в SUBSTITUTION_MAP
        const providedKeys = Object.keys(getActiveSubstitutionMap())
          .filter(k => sourceOf(k) === deletedKey);

        if (!providedKeys.length) return [];

        const currentSections = new Set(DOC_STATE.sectionOrder);
        const suggestions = {}; // key → { label, reasons[], maxQ }

        for (const ctxKey of providedKeys) {
          const candidates = getActiveSubstitutionMap()[ctxKey] || [];
          for (const { key: subKey, q } of candidates) {
            const src = sourceOf(subKey);
            // Только разделы, которых НЕТ в документе
            if (currentSections.has(src)) continue;
            if (src === deletedKey) continue;

            if (!suggestions[src]) {
              suggestions[src] = {
                key: src,
                label: KEY_LABELS[src] || src,
                reasons: [],
                maxQ: 0,
              };
            }
            const ctxLabel = CTX_LABELS[ctxKey] || ctxKey;
            const subLabel = CTX_LABELS[subKey] || subKey;
            suggestions[src].reasons.push(`${subLabel} заменяет ${ctxLabel}`);
            suggestions[src].maxQ = Math.max(suggestions[src].maxQ, q);
          }
        }

        return Object.values(suggestions)
          .sort((a, b) => b.maxQ - a.maxQ)
          .map(s => ({
            key: s.key,
            label: s.label,
            reason: s.reasons.slice(0, 2).join("; "),
            quality: s.maxQ,
          }));
      }

// ───── Операции над разделами (server/services/generation-service.ts (расширение; факт 05/07)) · js:getAvailableSectionsToAdd
// philosynth.html строки 20912–20915 ─────
      function getAvailableSectionsToAdd() {
        const current = new Set(DOC_STATE.sectionOrder);
        return ALL_SECTION_KEYS.filter(k => !current.has(k));
      }

// ───── но её текст лежал только в комплекте 4.3. · js:refreshSumDef
// philosynth.html строки 5808–5820 ─────
      function refreshSumDef() {
        const p = DOC_STATE.params;
        if (!p || !DOC_STATE.sectionDefs["sum"]) return;
        const fullP = { ...p, sec: DOC_STATE.sectionOrder.filter(k => k !== "sum") };
        const allDefs = buildSectionDefs(fullP);
        patchPromptsWithSecCtx(allDefs, fullP.secCtx || {});
        const newSumDef = allDefs.find(d => d.key === "sum");
        if (newSumDef) {
          // Сохраняем номер из текущего состояния
          newSumDef.num = DOC_STATE.sectionDefs["sum"].num;
          DOC_STATE.sectionDefs["sum"] = newSumDef;
        }
      }

// ───── вызывает она. UI-порт — беседа 2.3, здесь как референс контракта. · js:regenStructureFromEditModal
// philosynth.html строки 18369–18388 ─────
      async function regenStructureFromEditModal() {
        const card = document.getElementById("structureOutdatedCard");
        const btn = card?.querySelector("button");
        if (btn) { btn.disabled = true; btn.textContent = "Генерация..."; }
        try {
          await regenerateSubsection("sum", "Структура документа");
          // structureSections обновляется внутри regenerateSubsection
          if (card) {
            card.style.borderColor = "var(--green-check)";
            card.style.background = "#f0fff4";
            card.innerHTML =
              '<div style="font-family:var(--mono);font-size:10px;color:var(--green-check);letter-spacing:0.3px">' +
              '<span style="margin-right:6px">✓</span>Подраздел «Структура документа» обновлён.</div>';
            setTimeout(() => card.remove(), 3000);
          }
        } catch (err) {
          if (btn) { btn.disabled = false; btn.textContent = "Обновить"; }
          alert("Ошибка: " + err.message);
        }
      }
