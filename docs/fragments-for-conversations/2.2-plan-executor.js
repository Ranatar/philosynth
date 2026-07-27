// Фрагменты philosynth.html (26 024 стр., ревизия 2026-07) для беседы 2.2-plan-executor
// Сгенерировано extract-fragments.py; при обновлении исходника — перегенерировать.

// ───── [executeEditPlan] philosynth.html строки 19514–19861 ─────
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

// ───── [addSection] philosynth.html строки 20922–20922 ─────
      async function addSection(sectionKey, newCtx, opts = {}) {

// ───── [deleteSection] philosynth.html строки 20806–20899 ─────
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

// ───── [regenerateSection] philosynth.html строки 19971–19971 ─────
      async function regenerateSection(sectionKey, newCtx, opts = {}) {

// ───── [regenerateSubsection] philosynth.html строки 20236–20236 ─────
      async function regenerateSubsection(sectionKey, subsectionName, opts = {}) {

// ───── [buildDeletionReplacements] philosynth.html строки 20759–20801 ─────
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

// ───── [getAvailableSectionsToAdd] philosynth.html строки 20912–20915 ─────
      function getAvailableSectionsToAdd() {
        const current = new Set(DOC_STATE.sectionOrder);
        return ALL_SECTION_KEYS.filter(k => !current.has(k));
      }

// ───── [resumePlan] philosynth.html строки 25917–26019 ─────
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
