// Фрагменты philosynth.html (26 024 стр., ревизия 2026-07) для беседы 1.4b-pause-resume
// Сгенерировано extract-fragments.py; при обновлении исходника — перегенерировать.

// ───── [PAUSE / RESUME / ABORT…конец resumePlan] philosynth.html строки 24482–26019 ─────
      // ═══════════════════════════════════════════════════════════════════
      // PAUSE / RESUME / ABORT — модалка и логика возобновления генерации.
      // CSS-стили и HTML-разметка модалки вставлены статически в <head>/<body>
      // (см. блок P патча). Здесь — только JS-логика.
      // ═══════════════════════════════════════════════════════════════════

      // ═══════════════════════════════════════════════════════════════════
      // Утилиты UI: бейдж, кнопка abort, текст ошибки
      // ═══════════════════════════════════════════════════════════════════

      /**
       * Добавляет в genLog маркер события паузы/возобновления/действия пользователя.
       * Такие записи отображаются в "Логе контекста", но исключаются из "Лога промптов"
       * (formatPromptsForExport), так как не являются запросами к API.
       *
       * @param {string} type — "pause-marker" | "resume-marker" | "user-action-marker"
       * @param {Object} data — произвольные поля события
       */
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

      /**
       * Вычисляет оценки стоимости для различных действий в модалке паузы (gen).
       * Временно подменяет DOC_STATE.{params, sectionDefs, sectionDbIdx, ...}
       * на данные из pausedState, вызывает штатные estimateCost/estimateSubsectionCost,
       * гарантированно откатывает всё через try/finally.
       *
       * @param {Object} ps — pausedState
       * @returns {{fillMissingSubs:?number, wholeSection:?number, wholeSectionLarger:?number, skipRemaining:?number}}
       */
      function _computeGenPauseEstimates(ps) {
        if (!ps || !ps.genParams) return {};
        if (typeof estimateCost !== "function") return {};

        const p = ps.genParams;
        const sectionKey = ps.sectionKeys?.[0];
        if (!sectionKey) return {};

        // Сохраняем исходные значения DOC_STATE (обычно пусто при паузе, но на всякий)
        const saved = {
          params: DOC_STATE.params,
          sectionDefs: DOC_STATE.sectionDefs,
          sectionDbIdx: DOC_STATE.sectionDbIdx,
          sectionOrder: DOC_STATE.sectionOrder,
          effectiveDeps: DOC_STATE.effectiveDeps,
          resolvedDeps: DOC_STATE.resolvedDeps,
        };

        const result = {};

        try {
          // Пересобираем defs/passes как в _resumeFromSubsection
          const resolvedDeps = resolveContextDeps(p);
          const effectiveDeps = buildEffectiveDeps(p.sec, resolvedDeps, p.generationOrder);
          const dynamicOrder = buildDynamicOrder(effectiveDeps, p.sec, resolvedDeps, p.generationOrder)
            .filter(Boolean);
          const baseDefs = buildSectionDefs({ ...p, sec: dynamicOrder.filter(k => k !== "sum") });
          patchPromptsWithSecCtx(baseDefs, p.secCtx);
          const defsMap = Object.fromEntries(baseDefs.map(d => [d.key, d]));
          let secNum = 1;
          const defs = dynamicOrder.map(key => {
            const d = { ...defsMap[key] };
            d.num = secNum++;
            return d;
          });
          const passes = groupPasses(defs);

          // Временно заполняем DOC_STATE
          DOC_STATE.params = p;
          DOC_STATE.sectionOrder = dynamicOrder;
          DOC_STATE.effectiveDeps = effectiveDeps;
          DOC_STATE.resolvedDeps = resolvedDeps;
          DOC_STATE.sectionDefs = {};
          DOC_STATE.sectionDbIdx = {};
          for (let i = 0; i < passes.length; i++) {
            for (const d of passes[i]) {
              DOC_STATE.sectionDefs[d.key] = { ...d };
              DOC_STATE.sectionDbIdx[d.key] = i;
            }
          }

          // 1. Весь раздел заново
          const wholeEst = estimateCost({ sections: [sectionKey] });
          result.wholeSection = wholeEst?.cost ?? null;

          // 2. Догенерация только недостающих подразделов
          const expectedSubs = ps.expectedSubsections || [];
          const doneSubNames = new Set(
            (ps.partialSubsections || []).filter(s => s.status === "done").map(s => s.name)
          );
          const streamingSub = (ps.partialSubsections || []).find(s => s.status !== "done");
          const missingSubs = [];
          if (streamingSub) missingSubs.push(streamingSub.name);
          for (const sub of expectedSubs) {
            if (!doneSubNames.has(sub) && !missingSubs.includes(sub)) missingSubs.push(sub);
          }
          if (missingSubs.length > 0 && typeof estimateSubsectionCost === "function"
              && DOC_STATE.sectionDefs[sectionKey]?.parts) {
            let total = 0;
            let anyOk = false;
            for (const subName of missingSubs) {
              const subEst = estimateSubsectionCost(sectionKey, subName);
              if (subEst && typeof subEst.cost === "number") {
                total += subEst.cost;
                anyOk = true;
              }
            }
            result.fillMissingSubs = anyOk ? total : null;
          } else {
            result.fillMissingSubs = null;
          }

          // 3. Пропустить текущий раздел — стоимость ОСТАЛЬНЫХ разделов
          //    (следующие секции, начиная с passIdx+1).
          const remainingKeys = [];
          for (let i = ps.passIdx + 1; i < passes.length; i++) {
            for (const d of passes[i]) remainingKeys.push(d.key);
          }
          if (remainingKeys.length > 0) {
            const skipEst = estimateCost({ sections: remainingKeys });
            result.skipRemaining = skipEst?.cost ?? null;
          } else {
            result.skipRemaining = 0;
          }
        } catch (e) {
          console.warn("_computeGenPauseEstimates error:", e);
        } finally {
          // Обязательно откатываем
          DOC_STATE.params = saved.params;
          DOC_STATE.sectionDefs = saved.sectionDefs;
          DOC_STATE.sectionDbIdx = saved.sectionDbIdx;
          DOC_STATE.sectionOrder = saved.sectionOrder;
          DOC_STATE.effectiveDeps = saved.effectiveDeps;
          DOC_STATE.resolvedDeps = saved.resolvedDeps;
        }

        return result;
      }

      /**
       * Форматирует число как долларовую оценку для UI кнопки.
       */
      function _fmtCost(cost) {
        if (cost == null) return "";
        if (cost === 0) return "$0";
        if (cost < 0.01) return "≈ " + (cost * 100).toFixed(2) + "¢";
        return "≈ $" + cost.toFixed(3);
      }

      function _showPauseBadge(show) {
        const b = document.getElementById("progressPauseBadge");
        if (!b) return;
        b.classList.toggle("visible", !!show);
      }

      function _showAbortButton(show) {
        const b = document.getElementById("progressAbortBtn");
        if (!b) return;
        b.classList.toggle("visible", !!show);
      }

      function _pauseFriendlyMessage(err) {
        if (!err) return "Неизвестная ошибка";
        const msg = err.message || String(err);
        const kind = err.kind;
        if (kind === "auth") return "API-ключ недействителен или истёк (401).";
        if (kind === "billing") return "Недостаточно средств на балансе API. " +
          "Пополните баланс на console.anthropic.com и нажмите «Продолжить».";
        if (kind === "user-abort") return "Генерация остановлена вручную.";
        if (kind === "stuck") return "Нет ответа от API более 45 секунд (стрим «завис»).";
        if (kind === "max-tokens") {
          const used = err.maxTokensUsed || 20000;
          return "Ответ оборван по лимиту токенов (max_tokens = "
            + used.toLocaleString("ru") + "). Раздел слишком объёмный.";
        }
        if (kind === "pre-stream") {
          if (/429/.test(msg)) return "Превышен лимит запросов (429). " + msg;
          if (/5\d{2}/.test(msg)) return "Сбой сервера API. " + msg;
          return "Сбой до начала стрима: " + msg;
        }
        if (kind === "partial") return "Стрим оборвался в процессе: " + msg;
        return msg;
      }

      function userAbortGeneration() {
        if (!window._genAbortController) {
          alert("Нет активной генерации.");
          return;
        }
        const ok = confirm(
          "Остановить текущую генерацию?\n\n" +
          "Успевший контент будет сохранён в DOM. " +
          "Вы сможете возобновить генерацию через модалку паузы."
        );
        if (!ok) return;
        try {
          window._genAbortController.abort();
          _logPauseEvent("user-action-marker", {
            action: "abort",
            context: "streamResp",
          });
        } catch (_) {}
      }

      // ═══════════════════════════════════════════════════════════════════
      // Открытие/закрытие модалки
      // ═══════════════════════════════════════════════════════════════════

      function showPauseModal() {
        const ps = DOC_STATE.pausedState;
        if (!ps) {
          console.warn("showPauseModal: pausedState пуст");
          return;
        }
        const overlay = document.getElementById("pauseOverlay");
        const titleEl = document.getElementById("pauseModalTitle");
        const bodyEl  = document.getElementById("pauseModalBody");
        const footEl  = document.getElementById("pauseModalFooter");
        if (!overlay || !titleEl || !bodyEl || !footEl) return;

        // Ветка: billing — баланс исчерпан (без формы ключа, просто retry)
        if (ps.reasonKind === "billing") {
          title.textContent = "💳 Баланс API исчерпан";
          body.innerHTML = _renderPauseContent_billing(ps);
          footer.innerHTML = _renderPauseFooter_billing(ps);
          overlay.classList.add("visible");
          return;
        }
        
        // Ветка: 401 auth-ошибка — показываем форму ввода нового ключа
        if (ps.reasonKind === "auth") {
          titleEl.textContent = "🔑 API-ключ недействителен";
          bodyEl.innerHTML = _renderPauseContent_auth(ps);
          footEl.innerHTML = _renderPauseFooter_auth(ps);
        }
        else if (ps.kind === "gen") {
          titleEl.textContent = ps.isPartial
            ? "⏸ Раздел прерван в середине"
            : "⏸ Генерация не началась";
          bodyEl.innerHTML = _renderPauseContent_gen(ps);
          footEl.innerHTML = _renderPauseFooter_gen(ps);
        }
        else if (ps.kind === "plan") {
          titleEl.textContent = "⏸ План редактирования прерван";
          bodyEl.innerHTML = _renderPauseContent_plan(ps);
          footEl.innerHTML = _renderPauseFooter_plan(ps);
        }
        else {
          titleEl.textContent = "⏸ Генерация приостановлена";
          bodyEl.innerHTML = "<p>Неизвестный тип паузы.</p>";
          footEl.innerHTML = "<button class=\"pause-btn\" onclick=\"closePauseModal()\">Закрыть</button>";
        }

        overlay.classList.add("visible");
      }

      function closePauseModal() {
        const overlay = document.getElementById("pauseOverlay");
        if (overlay) overlay.classList.remove("visible");
      }

      function _clearPausedState() {
        DOC_STATE.pausedState = null;
        _showPauseBadge(false);
      }

      function _escapeHtml(s) {
        if (s == null) return "";
        return String(s)
          .replace(/&/g, "&amp;").replace(/</g, "&lt;")
          .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      }

      // ═══════════════════════════════════════════════════════════════════
      // Рендереры: gen — основная генерация прервана
      // ═══════════════════════════════════════════════════════════════════

      function _renderPauseContent_gen(ps) {
        const completedCount = (ps.completedPasses || []).length;
        const reasonHTML = `<div class="pause-reason-box">${_escapeHtml(ps.reason)}</div>`;

        // Список выполненных разделов
        const completedList = (ps.completedPasses || []).map(keys =>
          keys.map(k => KEY_LABELS[k] || k).join(" + ")
        ).join(", ") || "—";

        // Оценка: стоимость догенерации
        const remainingSections = (ps.genParams?.sec || []).length - completedCount;
        let costHint = "";
        try {
          if (typeof estimateCost === "function" && ps.genParams) {
            // Оценка оставшихся разделов
            const est = estimateCost({
              sections: (ps.genParams.sec || []).slice(completedCount),
            });
            if (est && est.cost) {
              costHint = `<div class="pause-subtle" style="margin-top:8px">
                Оценочная стоимость продолжения: <strong>≈ $${est.cost.toFixed(4)}</strong>
              </div>`;
            }
          }
        } catch (_) {}

        if (ps.isPartial) {
          // Partial: есть частичный контент в прерванном разделе.
          // Единая ветка для любых причин обрыва (сеть, max-tokens, stuck),
          // так как основная стратегия одинакова: догенерировать только
          // недостающие подразделы, используя успевшие как контекст.
          const partialInfo = (ps.partialSubsections || [])
            .map(s => `• <strong>${_escapeHtml(s.name)}</strong> — ${s.chars.toLocaleString("ru")} симв.`)
            .join("<br>");
          const expectedCount = (ps.expectedSubsections || []).length;
          const doneCount = (ps.partialSubsections || []).length;

          // Формируем список НЕДОСТАЮЩИХ подразделов для показа пользователю
          const missingSubs = (ps.expectedSubsections || [])
            .filter(s => !(ps.partialSubsections || []).some(p => p.name === s));
          const missingList = missingSubs.length > 0
            ? missingSubs.map(s => "• " + _escapeHtml(s)).join("<br>")
            : "";

          const causeHint = ps.reasonKind === "max-tokens"
            ? " (превышен лимит <code>max_tokens = " + (ps.maxTokensUsed || 20000).toLocaleString("ru") + "</code>)"
            : ps.reasonKind === "stuck"
              ? " (стрим завис без ответа)"
              : "";

          return `
            <p>Генерация раздела <strong>${_escapeHtml(ps.sectionLabel)}</strong>
               оборвалась${causeHint} — успело сгенерироваться
               <strong>${doneCount} из ${expectedCount}</strong> подразделов.</p>
            ${reasonHTML}
            <div class="pause-info-box">
              <strong>Завершено ранее:</strong> ${completedCount} ${completedCount === 1 ? "раздел" : "разделов"}<br>
              ${completedCount > 0 ? "<em style=\"color:var(--ink-dim)\">" + _escapeHtml(completedList) + "</em><br>" : ""}
              <strong>Прервано на:</strong> ${_escapeHtml(ps.sectionLabel)}<br>
              ${partialInfo ? "<strong>Успевшие подразделы:</strong><br>" + partialInfo : ""}
              ${missingList ? "<br><strong>Недостающие:</strong><br>" + missingList : ""}
            </div>
            <p class="pause-subtle">
              Рекомендуется <strong>догенерировать</strong> только недостающие подразделы —
              они будут созданы по очереди с учётом уже готовых подразделов как контекста.
              Это дешевле перегенерации всего раздела.
            </p>
            ${costHint}`;
        } else {
          // Pre-stream: ничего не сгенерировано в прерванном разделе
          return `
            <p>Генерация раздела <strong>${_escapeHtml(ps.sectionLabel)}</strong>
               не смогла начаться — запрос к API не прошёл после 3 попыток.</p>
            ${reasonHTML}
            <div class="pause-info-box">
              <strong>Завершено ранее:</strong> ${completedCount} ${completedCount === 1 ? "раздел" : "разделов"}<br>
              ${completedCount > 0 ? "<em style=\"color:var(--ink-dim)\">" + _escapeHtml(completedList) + "</em><br>" : ""}
              <strong>Прервано на:</strong> ${_escapeHtml(ps.sectionLabel)}
            </div>
            <p class="pause-subtle">
              Возможные причины: перегрузка API, проблемы с сетью, превышение лимита.
              Попробуйте ещё раз через несколько минут.
            </p>
            ${costHint}`;
        }
      }

      function _renderPauseFooter_gen(ps) {
        // Вычисляем оценки стоимости для всех вариантов действий
        const est = _computeGenPauseEstimates(ps);
        const costFill  = _fmtCost(est.fillMissingSubs);
        const costWhole = _fmtCost(est.wholeSection);
        const costSkip  = _fmtCost(est.skipRemaining);

        if (ps.isPartial) {
          // Основная стратегия для любого partial-обрыва (в т.ч. max-tokens):
          // догенерировать только недостающие подразделы, используя готовые как контекст.
          // Для max-tokens это особенно оправдано: каждый подраздел отдельно уложится
          // в штатный лимит 20 000. Дополнительная кнопка «перегенерировать раздел»
          // для случаев, когда уже сгенерированное качество не устраивает.
          return `
            <button class="pause-btn primary" onclick="resumeGeneration('fill-missing-subs')"
                    title="Продолжить раздел с обрывочного подраздела (самое экономное)">
              🎯 Догенерировать недостающие${costFill ? " <span style=\"opacity:0.85\">(" + costFill + ")</span>" : ""}
            </button>
            <button class="pause-btn" onclick="resumeGeneration('retry')"
                    title="Очистить частичный контент и начать раздел заново">
              ↻ Весь раздел заново${costWhole ? " <span style=\"opacity:0.8\">(" + costWhole + ")</span>" : ""}
            </button>
            <button class="pause-btn" onclick="resumeGeneration('skip')"
                    title="Оставить частичный контент, продолжить со следующего раздела (оценка — стоимость оставшихся разделов)">
              ⤴ Пропустить${costSkip ? " <span style=\"opacity:0.7\">(далее " + costSkip + ")</span>" : ""}
            </button>
            <button class="pause-btn danger" onclick="resumeGeneration('stop')"
                    title="Сохранить текущее состояние как финальное, завершить">
              ◼ Остановить
            </button>`;
        } else {
          // Pre-stream: повторить / остановить
          return `
            <button class="pause-btn primary" onclick="resumeGeneration('retry')"
                    title="Повторить запрос на этот раздел">
              ↻ Повторить сейчас${costWhole ? " <span style=\"opacity:0.8\">(" + costWhole + ")</span>" : ""}
            </button>
            <button class="pause-btn" onclick="resumeGeneration('skip')"
                    title="Пропустить этот раздел, продолжить со следующего (оценка — остальные разделы)">
              ⤴ Пропустить${costSkip ? " <span style=\"opacity:0.7\">(далее " + costSkip + ")</span>" : ""}
            </button>
            <button class="pause-btn danger" onclick="resumeGeneration('stop')"
                    title="Сохранить текущее состояние как финальное, завершить">
              ◼ Остановить
            </button>`;
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // Рендереры: plan — план редактирования прерван
      // ═══════════════════════════════════════════════════════════════════

      function _renderPauseContent_plan(ps) {
        const reasonHTML = `<div class="pause-reason-box">${_escapeHtml(ps.reason)}</div>`;
        const op = ps.failedOp;
        const opLabel = op
          ? (op.action === "add" ? "Добавление: " :
             op.action === "remove" ? "Удаление: " :
             "Перегенерация: ") + (KEY_LABELS[op.key] || op.key)
          : "—";

        const remainingCount = (ps.remainingOps || []).length;
        const remainingLabels = (ps.remainingOps || [])
          .slice(0, 5)
          .map(o => (o.action === "add" ? "➕ " : o.action === "remove" ? "✕ " : "↻ ")
                    + (KEY_LABELS[o.key] || o.key))
          .join(", ");
        const moreHint = remainingCount > 5 ? " и ещё " + (remainingCount - 5) : "";

        return `
          <p>План редактирования остановлен на шаге
             <strong>${ps.stepIdx + 1} из ${ps.totalSteps}</strong>.</p>
          ${reasonHTML}
          <div class="pause-info-box">
            <strong>Упавший шаг:</strong> ${_escapeHtml(opLabel)}<br>
            <strong>Осталось:</strong> ${remainingCount} ${remainingCount === 1 ? "шаг" : "шагов"}
            ${remainingCount > 0 ? "<br><em style=\"color:var(--ink-dim)\">"
              + _escapeHtml(remainingLabels) + _escapeHtml(moreHint) + "</em>" : ""}
          </div>
          <p class="pause-subtle">
            Изменения предыдущих шагов уже применены к документу. Выберите действие:
          </p>`;
      }

      function _renderPauseFooter_plan(ps) {
        return `
          <button class="pause-btn primary" onclick="resumePlan('retry')"
                  title="Повторить текущий шаг и продолжить">
            ↻ Повторить шаг
          </button>
          <button class="pause-btn" onclick="resumePlan('skip')"
                  title="Пропустить текущий шаг и продолжить со следующего">
            ⤴ Пропустить шаг
          </button>
          <button class="pause-btn danger" onclick="resumePlan('stop')"
                  title="Остановить план, очистить остаток">
            ◼ Остановить план
          </button>`;
      }

      // ═══════════════════════════════════════════════════════════════════
      // Рендереры: auth — истёкший API-ключ
      // ═══════════════════════════════════════════════════════════════════

      function _renderPauseContent_billing(ps) {
        const completedCount = (ps.completedPasses || []).length;
        const completedList = (ps.completedPasses || [])
          .map(keys => keys.join("+"))
          .join(", ");
        return `
          <p>Генерация приостановлена: <strong>баланс API исчерпан</strong>.</p>
          <div class="pause-reason-box">${_escapeHtml(ps.reason || "credit balance too low")}</div>
          <div class="pause-info-box">
            <strong>Завершено до паузы:</strong> ${completedCount} ${completedCount === 1 ? "раздел" : "разделов"}<br>
            ${completedCount > 0 ? "<em style=\"color:var(--ink-dim)\">" + _escapeHtml(completedList) + "</em><br>" : ""}
            <strong>Прервано на:</strong> ${_escapeHtml(ps.sectionLabel || "?")}
          </div>
          <p class="pause-subtle">
            Пополните баланс на
            <a href="https://console.anthropic.com/settings/billing" target="_blank"
               style="color:var(--gold)">console.anthropic.com</a>,
            затем нажмите <strong>«Продолжить»</strong>.
            API-ключ менять не нужно — он действителен.
          </p>`;
      }

      function _renderPauseFooter_billing(ps) {
        return `
          <button class="pause-btn primary" onclick="resumeGeneration('retry')"
                  title="Повторить запрос после пополнения баланса">
            ▶ Продолжить
          </button>
          <button class="pause-btn" onclick="resumeGeneration('skip')"
                  title="Пропустить текущий раздел">
            ⤴ Пропустить
          </button>
          <button class="pause-btn danger" onclick="resumeGeneration('stop')"
                  title="Сохранить текущее состояние">
            ◼ Остановить
          </button>`;
      }
      
      function _renderPauseContent_auth(ps) {
        const context = ps.kind === "gen"
          ? `на разделе <strong>${_escapeHtml(ps.sectionLabel || "—")}</strong>`
          : ps.kind === "plan"
            ? `на шаге <strong>${ps.stepIdx + 1}</strong> из ${ps.totalSteps}`
            : "";
        return `
          <p>API-ключ Anthropic недействителен или истёк. Генерация остановлена ${context}.</p>
          <div class="pause-reason-box">${_escapeHtml(ps.reason)}</div>
          <p>Введите новый ключ — он будет сохранён, и генерация продолжится с прерванного места:</p>
          <div class="pause-apikey-row">
            <input type="password" id="pauseNewApiKey" placeholder="sk-ant-api..." autocomplete="off" />
          </div>
          <p class="pause-subtle">
            Если у вас нет нового ключа — выберите «Остановить»: текущее состояние будет сохранено,
            и вы сможете возобновить позже.
          </p>`;
      }

      function _renderPauseFooter_auth(ps) {
        return `
          <button class="pause-btn primary" onclick="_resumeWithNewApiKey()"
                  title="Сохранить новый ключ и возобновить">
            ✓ Сохранить и продолжить
          </button>
          <button class="pause-btn danger" onclick="resumeGeneration('stop')"
                  title="Остановить, сохранить текущее состояние">
            ◼ Остановить
          </button>`;
      }

      function _resumeWithNewApiKey() {
        _logPauseEvent("user-action-marker", {
          action: "api-key-updated",
          context: "pause-modal",
        });
        const input = document.getElementById("pauseNewApiKey");
        const newKey = input ? input.value.trim() : "";
        if (!newKey || newKey.length < 10) {
          alert("Введите корректный API-ключ.");
          return;
        }
        // Сохраняем ключ (глобальная переменная API_KEY + localStorage, если используется)
        try {
          API_KEY = newKey;
          if (typeof localStorage !== "undefined") {
            localStorage.setItem("anthropic_api_key", newKey);
          }
          const apiKeyField = document.getElementById("apiKey") || document.getElementById("apiKeyInput");
          if (apiKeyField) apiKeyField.value = newKey;
        } catch (e) {
          console.warn("Не удалось сохранить ключ в localStorage:", e);
        }

        // Сбрасываем auth-reasonKind чтобы следующий вызов прошёл штатно
        const ps = DOC_STATE.pausedState;
        if (ps) {
          ps.reasonKind = ps.kind === "plan" ? "pre-stream" : "pre-stream";
        }
        closePauseModal();

        // Возобновляем
        if (ps?.kind === "plan") {
          resumePlan("retry");
        } else {
          resumeGeneration("retry");
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // Возобновление основной генерации (kind="gen")
      // ═══════════════════════════════════════════════════════════════════
      //
      // mode: "retry" — повторить прерванный pass с нуля
      //       "skip"  — пропустить прерванный pass, начать со следующего
      //       "stop"  — завершить как есть (сохранить текущее состояние)

      async function resumeGeneration(mode) {
        const ps = DOC_STATE.pausedState;
        if (!ps || ps.kind !== "gen") {
          console.warn("resumeGeneration: нет pausedState для gen");
          return;
        }
        closePauseModal();
        _logPauseEvent("resume-marker", {
          kind: "gen",
          mode,
          sectionLabel: ps.sectionLabel,
          passIdx: ps.passIdx,
        });

        // Ветка stop — просто финализируем текущее состояние
        if (mode === "stop") {
          _finalizeAfterStop_gen(ps);
          return;
        }

        // Ветка fill-missing-subs: вызываем специальную функцию,
        // которая догенерит только недостающие подразделы через regenerateSubsection.
        if (mode === "fill-missing-subs") {
          await _resumeFromSubsection(ps);
          return;
        }

        // Пересобираем инфраструктуру из genParams (как в generateDoc)
        const p = ps.genParams;
        if (!p) {
          alert("Невозможно возобновить: параметры генерации утеряны.");
          _clearPausedState();
          return;
        }

        // Восстанавливаем _conceptParticipants (если метасинтез)
        if (p.participants && p.participants.length > 0) {
          _conceptParticipants = p.participants.filter(x => x.type === "concept");
        }

        // Восстанавливаем/перестраиваем порядок и defs
        const resolvedDeps = resolveContextDeps(p);
        const effectiveDeps = buildEffectiveDeps(p.sec, resolvedDeps, p.generationOrder);
        const dynamicOrder = buildDynamicOrder(effectiveDeps, p.sec, resolvedDeps, p.generationOrder)
          .filter(Boolean);
        p.sec = dynamicOrder.filter(k => k !== "sum");

        const baseDefs = buildSectionDefs(p);
        patchPromptsWithSecCtx(baseDefs, p.secCtx);
        const defsMap  = Object.fromEntries(baseDefs.map(d => [d.key, d]));
        let secNum = 1;
        const defs = dynamicOrder.map(key => {
          const d = { ...defsMap[key] };
          d.num = secNum++;
          return d;
        });
        const passes = groupPasses(defs);

        // graphBodyIdx — для раздела graph
        passes.forEach((pass, i) => {
          pass.forEach((d) => { if (d.key === "graph") graphBodyIdx = i; });
        });

        // Убедимся, что progressPanel и шаги существуют (могли быть потеряны при импорте)
        _rebuildProgressPanelForResume(passes, ps.passIdx, mode, ps.completedPasses || []);

        // Убедимся что docBodies содержит контейнеры для всех passes
        _ensureDocBodyContainers(passes);

        // Обновляем UI
        const outputWrap = document.getElementById("outputWrap");
        if (outputWrap) outputWrap.classList.add("visible");
        const progressPanel = document.getElementById("progressPanel");
        if (progressPanel) progressPanel.classList.add("visible");

        const btn = document.getElementById("submitBtn");
        if (btn) {
          btn.disabled = true;
          btn.classList.add("loading");
        }
        const btnText = document.getElementById("btnText");
        if (btnText) btnText.textContent = "Возобновление...";

        // Сбрасываем текущий pausedState — если новая ошибка случится, она запишет новый
        _clearPausedState();

        // Определяем, с какого passIdx начинаем
        let startIdx = ps.passIdx;
        if (mode === "skip") {
          // Предупреждение о зависимостях: какие РАЗДЕЛЫ, идущие дальше,
          // реально зависят от пропускаемых ключей, и есть ли для них substitute?
          const skippedKeys = ps.sectionKeys || [];
          const generationOrder = p.generationOrder;
          const subMap = (generationOrder === "genetic")
            ? SUBSTITUTION_MAP_GENETIC : SUBSTITUTION_MAP;
          const deps = p.resolvedDeps || resolveContextDeps(p);
          // Для каждого ключа в оставшихся passes смотрим его прямые зависимости
          // и проверяем, пересекаются ли они со skippedKeys.
          const affected = []; // [{ key, missingDeps, hasSubstitute }]
          for (let n = ps.passIdx + 1; n < passes.length; n++) {
            for (const d of passes[n]) {
              const directDeps = (deps[d.key] || []).flat ? (deps[d.key] || []).flat() : [];
              const missingDeps = [];
              for (const dep of directDeps) {
                if (typeof dep !== "string") continue;
                const depKey = dep.includes(":") ? dep.split(":")[0] : dep;
                if (skippedKeys.includes(depKey)) {
                  missingDeps.push(dep);
                }
              }
              if (missingDeps.length > 0) {
                // Проверяем, есть ли у каждой недостающей зависимости substitute
                const allSubstitutable = missingDeps.every(dep =>
                  subMap[dep] || subMap[dep.includes(":") ? dep.split(":")[0] : dep]
                );
                affected.push({
                  key: d.key,
                  label: KEY_LABELS[d.key] || d.key,
                  missingDeps,
                  hasSubstitute: allSubstitutable,
                });
              }
            }
          }
          const withoutSubstitute = affected.filter(a => !a.hasSubstitute);
          if (withoutSubstitute.length > 0) {
            const warnLines = withoutSubstitute
              .map(a => "• «" + a.label + "» (зависит от: " + a.missingDeps.join(", ") + ")")
              .join("\n");
            const ok = confirm(
              "Пропуск раздела «" + (ps.sectionLabel || "?") + "» приведёт к деградации " +
              "качества следующих разделов (для них нет substitute):\n\n" +
              warnLines + "\n\n" +
              "Всё равно продолжить?"
            );
            if (!ok) {
              // Пользователь отменил — восстанавливаем pausedState и модалку
              DOC_STATE.pausedState = ps;
              _showPauseBadge(true);
              showPauseModal();
              return;
            }
          }

          // Помечаем прерванный pass как «пропущен»
          const st = document.getElementById("ps" + ps.passIdx);
          if (st) {
            st.className = "progress-step error";
            const ic = st.querySelector(".step-icon");
            if (ic) ic.textContent = "⤴";
            st.title = "Пропущен пользователем";
          }
          startIdx = ps.passIdx + 1;
        } else if (mode === "retry") {
          // Очищаем контейнер прерванного pass
          const ct = document.getElementById("db" + ps.passIdx);
          if (ct) ct.innerHTML = "";
        }

        // Восстанавливаем SYS, partStatic, genCommon
        const SYS = buildSYS(p);
        const partStatic = baseCtxStatic(p);
        // partBase оставляем для визуализации (максимальный — через полный блок)
        const partBase = partStatic + baseCtxParents(p, (passes[startIdx] && passes[startIdx][0] && passes[startIdx][0].key) || null);

        if (!genCommon) {
          const partQuality = buildQualityReinforcement(p);
          const scaffoldLen = `ПАРАМЕТРЫ СИНТЕЗА:\n\n\n\nЗАДАНИЕ: составь ТОЛЬКО следующие разделы (строго в указанном порядке, без добавления других):\n\n\n\n`.length;
          const _sectionKeysForSpec = passes.map(pass => pass.map(d => d.key).join("+"));
          genCommon = {
            sysChars: SYS.length, baseChars: partBase.length,
            baseCharsWithoutConcepts: partStatic.length,
            totalConceptOverhead: partBase.length - partStatic.length,
            budgetMode: (p.keepFullBudget || (DOC_STATE.params && DOC_STATE.params.keepFullBudget)) ? 'full' : 'shrink',
            parentSpecBySection: buildParentSpecBySection(p, _sectionKeysForSpec),
            rulesChars: 0, qualityChars: partQuality.length,
            scaffoldChars: scaffoldLen,
            totalChars: SYS.length + partBase.length + partQuality.length + scaffoldLen,
            conceptBlockSizes: computeFullConceptBlockSizes(p),
          };
        }

        try {
          await _runGenPassesFromIdx({
            p, defs, passes, dynamicOrder, effectiveDeps,
            SYS, partStatic, startIdx, source: "resume",
          });
        } catch (e) {
          // Всё, что нужно — уже записано в pausedState внутри _runGenPassesFromIdx
          console.error("resumeGeneration: outer error", e);
        }

        // Если цикл прервался новой ошибкой — pausedState уже записан,
        // модалка показана. Не финализируем.
        if (DOC_STATE.pausedState && DOC_STATE.pausedState.kind === "gen") {
          return;
        }

        // Успешное завершение — финализируем
        _finalizeGenerationPostloop(p, defs, dynamicOrder, effectiveDeps, passes);
      }

      /**
       * Догенерирует недостающие подразделы прерванного pass, затем продолжает
       * обычным циклом со следующего pass. Экономит токены по сравнению с
       * полной перегенерацией раздела, так как успевшие подразделы используются
       * как контекст (через intraSectionCtx в regenerateSubsection).
       */
      async function _resumeFromSubsection(ps) {
        const p = ps.genParams;
        if (!p) {
          alert("Невозможно возобновить: параметры генерации утеряны.");
          _clearPausedState();
          return;
        }

        // Восстанавливаем _conceptParticipants
        if (p.participants && p.participants.length > 0) {
          _conceptParticipants = p.participants.filter(x => x.type === "concept");
        }

        // Пересобираем инфраструктуру
        const resolvedDeps = resolveContextDeps(p);
        const effectiveDeps = buildEffectiveDeps(p.sec, resolvedDeps, p.generationOrder);
        const dynamicOrder = buildDynamicOrder(effectiveDeps, p.sec, resolvedDeps, p.generationOrder)
          .filter(Boolean);
        p.sec = dynamicOrder.filter(k => k !== "sum");

        const baseDefs = buildSectionDefs(p);
        patchPromptsWithSecCtx(baseDefs, p.secCtx);
        const defsMap = Object.fromEntries(baseDefs.map(d => [d.key, d]));
        let secNum = 1;
        const defs = dynamicOrder.map(key => {
          const d = { ...defsMap[key] };
          d.num = secNum++;
          return d;
        });
        const passes = groupPasses(defs);
        passes.forEach((pass, i) => {
          pass.forEach((d) => { if (d.key === "graph") graphBodyIdx = i; });
        });

        // ── Временно заполняем DOC_STATE, чтобы regenerateSubsection работала ──
        // ВНИМАНИЕ: DOC_STATE.ready остаётся false (документ ещё не полностью сгенерирован);
        // _finalizeGenerationPostloop выполнит полный populateDocState в конце.
        DOC_STATE.params = p;
        DOC_STATE.sectionOrder = dynamicOrder;
        DOC_STATE.effectiveDeps = effectiveDeps;
        DOC_STATE.resolvedDeps = resolvedDeps;
        DOC_STATE.sectionDefs = {};
        DOC_STATE.sectionDbIdx = {};
        for (let i = 0; i < passes.length; i++) {
          for (const d of passes[i]) {
            DOC_STATE.sectionDefs[d.key] = { ...d };
            DOC_STATE.sectionDbIdx[d.key] = i;
          }
        }
        if (!DOC_STATE.editedSections || typeof DOC_STATE.editedSections.add !== "function") {
          DOC_STATE.editedSections = new Set();
        }
        if (!DOC_STATE.factualDeps) DOC_STATE.factualDeps = {};

        // Контейнеры и панели прогресса
        _ensureDocBodyContainers(passes);
        _rebuildProgressPanelForResume(passes, ps.passIdx, "fill-missing-subs", ps.completedPasses || []);
        document.getElementById("progressPanel")?.classList.add("visible");
        document.getElementById("outputWrap")?.classList.add("visible");

        const btn = document.getElementById("submitBtn");
        if (btn) { btn.disabled = true; btn.classList.add("loading"); }
        const btnText = document.getElementById("btnText");
        if (btnText) btnText.textContent = "Догенерация...";

        // ── Находим целевой раздел (у которого есть parts) ──
        // В pass может быть несколько ключей (объединённые разделы), но parts обычно у одного.
        const sectionKeysInPass = ps.sectionKeys || [];
        let targetSectionKey = null;
        for (const k of sectionKeysInPass) {
          if (DOC_STATE.sectionDefs[k]?.parts) { targetSectionKey = k; break; }
        }
        if (!targetSectionKey) {
          // Нет структурированных подразделов — догенерация невозможна,
          // автоматически переходим на retry (полная перегенерация раздела).
          console.warn("_resumeFromSubsection: нет parts, fallback на retry");
          _clearPausedState();
          return resumeGeneration("retry");
        }

        // ── Определяем список недостающих подразделов ──
        const expectedSubs = ps.expectedSubsections || [];
        const doneSubs = (ps.partialSubsections || []).filter(s => s.status === "done");
        const doneSubNames = new Set(doneSubs.map(s => s.name));
        // Обрывочный = partialSubsections с status !== "done" (streaming / partial)
        const streamingSub = (ps.partialSubsections || []).find(s => s.status !== "done");

        // Порядок: сначала обрывочный, затем остальные недостающие — в порядке expectedSubs
        const missingSubs = [];
        if (streamingSub) missingSubs.push(streamingSub.name);
        for (const sub of expectedSubs) {
          if (!doneSubNames.has(sub) && !missingSubs.includes(sub)) {
            missingSubs.push(sub);
          }
        }

        if (missingSubs.length === 0) {
          console.warn("_resumeFromSubsection: недостающих подразделов нет");
          _clearPausedState();
          // Переход к следующему pass
          return _continueAfterFilledSubs(ps, { p, defs, passes, dynamicOrder, effectiveDeps });
        }

        // ── Очищаем DOM: callout с ошибкой + (по условию) обрывочный div ──
        const dbIdx = DOC_STATE.sectionDbIdx[targetSectionKey];
        const ct = document.getElementById("db" + dbIdx);
        const RESUME_CONTINUE_THRESHOLD = 250;
        let streamingContinueMode = false;
        if (ct && streamingSub) {
          const obrivDiv = ct.querySelector(`[data-section="${streamingSub.name}"]`);
          if (obrivDiv) {
            const partialLen = (obrivDiv.innerText || "").trim().length;
            if (partialLen >= RESUME_CONTINUE_THRESHOLD) {
              streamingContinueMode = true;
            } else {
              obrivDiv.remove();
            }
          }
        }
        if (ct) {
          // Удаляем .doc-section, содержащий callout warning «Генерация прервана»
          const warnings = ct.querySelectorAll(".callout.warning");
          warnings.forEach(w => {
            const parent = w.closest(".doc-section");
            if (parent && /Генерация прервана|Ошибка контекста/.test(parent.textContent)) {
              parent.remove();
            }
          });
        }

        // ── Сбрасываем pausedState (если новая ошибка — запишется новый) ──
        _clearPausedState();

        // ── Помечаем прерванный pass как активный ──
        const st = document.getElementById("ps" + ps.passIdx);
        if (st) {
          st.className = "progress-step active";
          const ic = st.querySelector(".step-icon");
          if (ic) ic.textContent = "⟳";
          st.title = "Догенерация " + missingSubs.length + " подразделов";
        }

        // ── Последовательно догенерируем недостающие подразделы ──
        try {
          for (const subName of missingSubs) {
            const isContinueSub = streamingContinueMode
                               && streamingSub
                               && subName === streamingSub.name;
            if (isContinueSub) {
              // Режим продолжения
              await regenerateSubsection(targetSectionKey, subName, {
                includeCurrentContent: true,
                resumeFromInterruption: true,
                userNote: "Генерация этого подраздела была прервана (сетевая ошибка / " +
                          "лимит max_tokens / таймаут стрима). В блоке «НАЧАЛЬНЫЙ ФРАГМЕНТ " +
                          "ПОДРАЗДЕЛА» приведён уже написанный тобой текст. Сохрани его " +
                          "ДОСЛОВНО и продолжи писать именно с того места, где он " +
                          "заканчивается, до полного объёма задания. Не переписывай и не " +
                          "перефразируй уже написанное — только допиши недостающее."
              });
            } else {
              await regenerateSubsection(targetSectionKey, subName);
            }
          }

          // Все подразделы раздела готовы — помечаем pass как done
          if (st) {
            st.className = "progress-step done";
            const ic = st.querySelector(".step-icon");
            if (ic) ic.textContent = "✓";
          }

          // ── Переход к следующим pass'ам обычным путём ──
          await _continueAfterFilledSubs(ps, { p, defs, passes, dynamicOrder, effectiveDeps });
        } catch (err) {
          // Новая ошибка при догенерации — regenerateSubsection УЖЕ записала
          // её в genLog с status="error", но pausedState не установила (т.к. не fromPlan).
          // Устанавливаем pausedState сами, чтобы модалка могла снова возникнуть.
          console.error("_resumeFromSubsection: ошибка при догенерации:", err);
          const errorMsg = _pauseFriendlyMessage(err);

          const updatedDoneSubs = [];
          if (ct) {
            for (const subName of expectedSubs) {
              const subDiv = ct.querySelector(`[data-section="${subName}"]`);
              if (subDiv && subDiv.textContent.trim().length > 50) {
                updatedDoneSubs.push({ name: subName, chars: subDiv.innerHTML.length, status: "done" });
              }
            }
          }

          DOC_STATE.pausedState = {
            kind: "gen",
            passIdx: ps.passIdx,
            sectionKeys: sectionKeysInPass,
            sectionLabel: ps.sectionLabel,
            isPartial: updatedDoneSubs.length > 0,
            reason: errorMsg,
            reasonKind: err.kind || "partial",
            timestamp: new Date().toISOString(),
            partialSubsections: updatedDoneSubs,
            expectedSubsections: expectedSubs,
            completedPasses: ps.completedPasses || [],
            genParams: { ...p, secCtx: { ...p.secCtx } },
            maxTokensUsed: err.kind === "max-tokens" ? (err.maxTokensUsed || 20000) : null,
          };
          if (btn) { btn.disabled = false; btn.classList.remove("loading"); }
          if (btnText) btnText.textContent = "Синтезировать Концепцию";
          _showPauseBadge(true);
          showPauseModal();
        }
      }

      /**
       * Продолжает генерацию со следующего pass после того, как недостающие
       * подразделы текущего pass были догенерированы через _resumeFromSubsection.
       */
      async function _continueAfterFilledSubs(ps, ctx) {
        const { p, defs, passes, dynamicOrder, effectiveDeps } = ctx;
        const startIdx = ps.passIdx + 1;

        if (startIdx >= passes.length) {
          // Это был последний pass — финализируем
          _finalizeGenerationPostloop(p, defs, dynamicOrder, effectiveDeps, passes);
          return;
        }

        // Пересобираем SYS и partStatic (на случай, если контекст поменялся)
        const SYS = buildSYS(p);
        const partStatic = baseCtxStatic(p);
        const partBase = partStatic + baseCtxParents(p, (passes[startIdx] && passes[startIdx][0] && passes[startIdx][0].key) || null);

        // genCommon
        if (!genCommon) {
          const partQuality = buildQualityReinforcement(p);
          const scaffoldLen = `ПАРАМЕТРЫ СИНТЕЗА:



ЗАДАНИЕ: составь ТОЛЬКО следующие разделы (строго в указанном порядке, без добавления других):



`.length;
          const _sectionKeysForSpec13 = passes.map(pass => pass.map(d => d.key).join("+"));
          genCommon = {
            sysChars: SYS.length, baseChars: partBase.length,
            baseCharsWithoutConcepts: partStatic.length,
            totalConceptOverhead: partBase.length - partStatic.length,
            budgetMode: (p.keepFullBudget || (DOC_STATE.params && DOC_STATE.params.keepFullBudget)) ? 'full' : 'shrink',
            parentSpecBySection: buildParentSpecBySection(p, _sectionKeysForSpec13),
            rulesChars: 0, qualityChars: partQuality.length,
            scaffoldChars: scaffoldLen,
            totalChars: SYS.length + partBase.length + partQuality.length + scaffoldLen,
            conceptBlockSizes: computeFullConceptBlockSizes(p),
          };
        }

        try {
          await _runGenPassesFromIdx({
            p, defs, passes, dynamicOrder, effectiveDeps,
            SYS, partStatic, startIdx, source: "resume",
          });
        } catch (e) {
          console.error("_continueAfterFilledSubs: outer error", e);
        }

        // Если новая пауза — не финализируем
        if (DOC_STATE.pausedState && DOC_STATE.pausedState.kind === "gen") {
          return;
        }
        _finalizeGenerationPostloop(p, defs, dynamicOrder, effectiveDeps, passes);
      }

      /**
       * Основной цикл генерации passes.
       * Используется и при штатной генерации (generateDoc), и при возобновлении
       * (resumeGeneration) — отличаются только параметрами startIdx и source.
       *
       * @param {Object} args
       * @param {Object} args.p — параметры синтеза
       * @param {Array}  args.defs — определения всех разделов
       * @param {Array}  args.passes — сгруппированные passes
       * @param {Array}  args.dynamicOrder — динамический порядок ключей
       * @param {Object} args.effectiveDeps — зависимости
       * @param {string} args.SYS — system-промпт
       * @param {string} args.partBase — базовый контекст
       * @param {number} args.startIdx — с какого pass начинать (0 для штатной, passIdx для resume)
       * @param {string} [args.source] — "init" (штатная) или "resume" (возобновление)
       */
      async function _runGenPassesFromIdx(args) {
        const { p, defs, passes, dynamicOrder, effectiveDeps, SYS, startIdx } = args;
        // Селективность: статическая часть одна на всю генерацию, родительский
        // блок собирается per-section для каждого pass. Если вызывающий код всё
        // ещё передал монолитный partBase (legacy) — используем его, но только для
        // обычного синтеза без родителей; в мета-синтезе всегда выбираем селектив.
        const _partStatic = hasConceptParticipants(p)
          ? baseCtxStatic(p)
          : (args.partStatic != null ? args.partStatic : (args.partBase != null ? args.partBase : baseCtx(p)));
        const source = args.source || "init";
        const isResume = source === "resume";
        const labelSuffix = isResume ? " [возобновление]" : "";

        for (let i = startIdx; i < passes.length; i++) {
          const pass = passes[i];
          const ct = document.getElementById("db" + i);
          const st = document.getElementById("ps" + i);
          if (!ct || !st) {
            console.warn("_runGenPassesFromIdx: не найдены db/ps для idx", i);
            continue;
          }
          st.className = "progress-step active";
          const icEl = st.querySelector(".step-icon");
          if (icEl) icEl.textContent = "⟳";

          try {
            let prior = "";
            if (i > 0) {
              const generated = {};
              for (let n = 0; n < i; n++) {
                const el = document.getElementById("db" + n);
                if (!el || !el.querySelector(".doc-section")) continue;
                for (const def of passes[n]) {
                  generated[def.key] = el;
                }
              }
              for (const def of pass) {
                if (def.key === "sum") continue;
                try {
                  prior = buildContextForSection(def.key, generated, p.depth, effectiveDeps, resolveContextDeps(p));
                } catch (ctxErr) {
                  console.warn("Ошибка построения контекста для", def.key, ctxErr);
                  prior = "";
                }
                break;
              }
            }
            if (prior) {
              const keys = prior.match(/### .+/g)?.map(h => h.replace("### ", "")) || [];
              st.title = "Контекст: " + keys.join(", ") + " (" + prior.length + " симв.)";
            }

            const sp = pass
              .map((d) => `§ ${d.num} — ${d.title.toUpperCase()}\n${d.prompt}`)
              .join("\n\n");
            const _passKey = pass[0].key;
            const _partParentsForPass = hasConceptParticipants(p)
              ? baseCtxParents(p, _passKey) : "";
            const partBase = _partStatic + _partParentsForPass;
            const fp = `ПАРАМЕТРЫ СИНТЕЗА:\n${partBase}${prior}\n\nЗАДАНИЕ: составь ТОЛЬКО следующие разделы (строго в указанном порядке, без добавления других):\n\n${sp}${buildQualityReinforcement(p)}${STOP_SIGNAL}`;
            const sectionLabel = pass.map(d => d.title).join(" + ");
            const subsecMap = buildSubsectionMap(p);
            const expectedSubs = pass.flatMap(d => subsecMap[d.key] || []);

            const genEntry = {
              sectionKey: pass.map(d => d.key).join("+"),
              sectionLabel: sectionLabel + labelSuffix,
              priorChars: prior.length, taskChars: sp.length,
              inputChars: SYS.length + fp.length,
              outputChars: 0, outputTokens: 0, inputTokens: 0,
              cost: 0, error: null, status: "streaming",
              source,
              expectedSubsections: expectedSubs,
              subsections: [],
              _sys: SYS,
              _promptSkeleton: buildPromptSkeleton(fp),
            };
            _augmentGenEntry(genEntry, p, _passKey, _partParentsForPass.length);
            genLog.push(genEntry);
            refreshCtxLogIfOpen();

            let lastLogRefresh = 0;
            const onDelta = (charsSoFar, htmlSoFar) => {
              genEntry.outputChars = charsSoFar;
              if (htmlSoFar && expectedSubs.length > 0) {
                genEntry.subsections = parseSubsectionsFromHTML(htmlSoFar, expectedSubs);
              }
              const now = Date.now();
              if (now - lastLogRefresh > 300) {
                lastLogRefresh = now;
                refreshCtxLogIfOpen();
              }
            };

            try {
              const usage = await streamResp(fp, ct, SYS, onDelta);
              totalInputTokens += usage.input_tokens;
              totalOutputTokens += usage.output_tokens;
              genEntry.outputChars = ct.innerHTML.length;
              if (expectedSubs.length > 0) {
                genEntry.subsections = parseSubsectionsFromHTML(ct.innerHTML, expectedSubs);
                genEntry.subsections.forEach(s => { s.status = "done"; });
              }
              genEntry.inputTokens = usage.input_tokens;
              genEntry.outputTokens = usage.output_tokens;
              genEntry.cost = usage.input_tokens * 3 / 1e6 + usage.output_tokens * 15 / 1e6;
              genEntry.status = "done";
              refreshCtxLogIfOpen();

              st.className = "progress-step done";
              const ic2 = st.querySelector(".step-icon");
              if (ic2) ic2.textContent = "✓";

              for (const def of pass) {
                const ctxText = p.secCtx?.[def.key];
                if (ctxText) {
                  const disc = makeSectionCtxDisclosure(ctxText);
                  ct.insertBefore(disc, ct.firstChild);
                }
              }
              if (pass.some(d => d.key === "name")) updateDocTitleFromName(ct);
              if (i === graphBodyIdx) {
                try {
                  G = parseGraph(ct);
                  if (G.nodes.length > 0) document.getElementById("btnGraph").style.display = "";
                } catch (e) { console.warn("Graph parse:", e); }
              }
            } catch (e) {
              // Сбой streamResp — сохраняем pausedState и прерываем цикл.
              // При max-tokens токены реально потрачены — учитываем через err._usage.
              if (e._usage) {
                totalInputTokens += e._usage.input_tokens || 0;
                totalOutputTokens += e._usage.output_tokens || 0;
                genEntry.inputTokens = e._usage.input_tokens || 0;
                genEntry.outputTokens = e._usage.output_tokens || 0;
                genEntry.cost = (e._usage.input_tokens || 0) * 3 / 1e6
                              + (e._usage.output_tokens || 0) * 15 / 1e6;
                genEntry.outputChars = ct.innerHTML.length;
                if (typeof updateFooterCost === "function") updateFooterCost();
              }
              genEntry.error = e.message;
              genEntry.status = "error";
              refreshCtxLogIfOpen();
              st.className = "progress-step error";
              const ic3 = st.querySelector(".step-icon");
              if (ic3) ic3.textContent = "⚠";

              const errorMsg = _pauseFriendlyMessage(e);
              const hasContent = ct.querySelector(".doc-section");
              if (hasContent) {
                const errDiv = document.createElement("div");
                errDiv.className = "doc-section";
                errDiv.innerHTML = `<div class="callout warning"><span class="callout-label">⚠ Ошибка</span>Генерация прервана: ${errorMsg}</div>`;
                ct.appendChild(errDiv);
              } else {
                ct.innerHTML = `<div class="doc-section"><div class="callout warning"><span class="callout-label">⚠ Ошибка</span>${errorMsg}</div></div>`;
              }

              const doneSubs = (genEntry.subsections || []).filter(s => s.chars > 0);
              const isPartial = doneSubs.length > 0;
              const completedPasses = [];
              for (let n = 0; n < i; n++) completedPasses.push(passes[n].map(d => d.key));

              DOC_STATE.pausedState = {
                kind: "gen",
                passIdx: i,
                sectionKeys: pass.map(d => d.key),
                sectionLabel,
                isPartial,
                reason: errorMsg,
                reasonKind: e.kind || "partial",
                timestamp: new Date().toISOString(),
                partialSubsections: doneSubs.map(s => ({ name: s.name, chars: s.chars, status: s.status })),
                expectedSubsections: expectedSubs,
                completedPasses,
                genParams: { ...p, secCtx: { ...p.secCtx } },
                // Если ошибка max-tokens — запоминаем, какой лимит уже был использован,
                // чтобы модалка могла показать это и предложить увеличение.
                maxTokensUsed: e.kind === "max-tokens" ? (e.maxTokensUsed || 20000) : null,
              };
              _logPauseEvent("pause-marker", {
                kind: "gen",
                reasonKind: e.kind || "partial",
                reason: errorMsg,
                sectionLabel,
                passIdx: i,
                isPartial,
                maxTokensUsed: e.kind === "max-tokens" ? (e.maxTokensUsed || 20000) : null,
              });

              const btn = document.getElementById("submitBtn");
              if (btn) {
                btn.disabled = false;
                btn.classList.remove("loading");
              }
              const btnText = document.getElementById("btnText");
              if (btnText) btnText.textContent = "Синтезировать Концепцию";

              _showPauseBadge(true);
              showPauseModal();
              return; // прерываем цикл
            }
          } catch (outerErr) {
            // Ошибка построения контекста/промпта — тоже останавливаем цикл
            console.error("Ошибка построения контекста для раздела:", pass.map(d => d.key), outerErr);
            st.className = "progress-step error";
            const ic4 = st.querySelector(".step-icon");
            if (ic4) ic4.textContent = "⚠";
            ct.innerHTML = `<div class="doc-section"><div class="callout warning"><span class="callout-label">⚠ Ошибка контекста</span>Не удалось подготовить контекст для раздела: ${outerErr.message || outerErr}</div></div>`;

            const completedPasses = [];
            for (let n = 0; n < i; n++) completedPasses.push(passes[n].map(d => d.key));
            DOC_STATE.pausedState = {
              kind: "gen",
              passIdx: i,
              sectionKeys: pass.map(d => d.key),
              sectionLabel: pass.map(d => d.title).join(" + "),
              isPartial: false,
              reason: "Ошибка контекста: " + (outerErr.message || outerErr),
              reasonKind: "context-error",
              timestamp: new Date().toISOString(),
              partialSubsections: [],
              expectedSubsections: [],
              completedPasses,
              genParams: { ...p, secCtx: { ...p.secCtx } },
            };
            _logPauseEvent("pause-marker", {
              kind: "gen",
              reasonKind: "context-error",
              reason: "Ошибка контекста: " + (outerErr.message || outerErr),
              sectionLabel: pass.map(d => d.title).join(" + "),
              passIdx: i,
              isPartial: false,
            });

            const btn = document.getElementById("submitBtn");
            if (btn) {
              btn.disabled = false;
              btn.classList.remove("loading");
            }
            const btnText = document.getElementById("btnText");
            if (btnText) btnText.textContent = "Синтезировать Концепцию";

            _showPauseBadge(true);
            showPauseModal();
            return;
          }
        }
      }

      /**
       * Пересобирает progressPanel с шагами и их статусами
       * (для сценария импорта в паузе — панели ещё нет).
       */
      function _rebuildProgressPanelForResume(passes, pausedIdx, mode, completedPasses) {
        const ps = document.getElementById("progressSteps");
        if (!ps) return;
        ps.innerHTML = "";
        passes.forEach((pass, i) => {
          const d = document.createElement("div");
          d.className = "progress-step";
          d.id = "ps" + i;
          // Статус:
          //   i < pausedIdx → done (был успешно сгенерирован ДО паузы)
          //   i === pausedIdx → active (если retry) или error+skipped (если skip)
          //   i > pausedIdx → ожидает
          let icon = "◯";
          if (i < pausedIdx) {
            d.className = "progress-step done";
            icon = "✓";
          } else if (i === pausedIdx) {
            if (mode === "skip") {
              d.className = "progress-step error";
              icon = "⤴";
            } else {
              d.className = "progress-step active";
              icon = "⟳";
            }
          }
          d.innerHTML = `<span class="step-icon">${icon}</span> ${pass.map((x) => x.title).join(" + ")}`;
          ps.appendChild(d);
        });
        document.getElementById("progressPanel")?.classList.add("visible");
      }

      /**
       * Убеждается, что в #docBodies есть контейнеры db0..dbN для всех passes.
       * При импорте они могут быть не пересозданы.
       */
      function _ensureDocBodyContainers(passes) {
        const db = document.getElementById("docBodies");
        if (!db) return;
        for (let i = 0; i < passes.length; i++) {
          let el = document.getElementById("db" + i);
          if (!el) {
            el = document.createElement("div");
            el.className = "doc-body";
            el.id = "db" + i;
            if (i > 0) el.style.borderTop = "none";
            el.setAttribute("data-section-key", passes[i].map(d => d.key).join("+"));
            db.appendChild(el);
          }
        }
      }

      /**
       * Финализация при выборе "Остановить" в паузе gen.
       * Сохраняем текущее состояние как ready с тем, что успело сгенерироваться.
       */
      function _finalizeAfterStop_gen(ps) {
        _clearPausedState();
        const p = ps.genParams;
        if (!p) return;

        // Пересобираем инфраструктуру для корректного populateDocState
        const resolvedDeps = resolveContextDeps(p);
        const effectiveDeps = buildEffectiveDeps(p.sec, resolvedDeps, p.generationOrder);
        const dynamicOrder = buildDynamicOrder(effectiveDeps, p.sec, resolvedDeps, p.generationOrder);
        const baseDefs = buildSectionDefs(p);
        patchPromptsWithSecCtx(baseDefs, p.secCtx);
        const defsMap = Object.fromEntries(baseDefs.map(d => [d.key, d]));
        let secNum = 1;
        const defs = dynamicOrder.map(key => {
          const d = { ...defsMap[key] };
          d.num = secNum++;
          return d;
        });
        const passes = groupPasses(defs);

        // Удаляем из DOC_STATE пустые разделы и переносим только те, что успешно сгенерированы
        // Достаточно вызвать _finalizeGenerationPostloop — но нужно учесть,
        // что некоторые db могут быть пустыми или содержать только warning.
        // populateDocState безопасна для частичного состояния.
        _finalizeGenerationPostloop(p, defs, dynamicOrder, effectiveDeps, passes);
      }

      // ═══════════════════════════════════════════════════════════════════
      // Возобновление плана редактирования (kind="plan")
      // ═══════════════════════════════════════════════════════════════════
      //
      // mode: "retry" — повторить упавший шаг и продолжить
      //       "skip"  — пропустить упавший шаг, начать со следующего
      //       "stop"  — очистить остаток, завершить

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

// ───── [_streamRespOnce] philosynth.html строки 12463–12640 ─────
      async function _streamRespOnce(prompt, container, sys, onDelta, signal) {
        const body = {
          model: "claude-sonnet-4-6",
          max_tokens: 20000,
          stream: true,
          messages: [{ role: "user", content: prompt }],
        };
        if (sys) body.system = sys;

        let resp;
        try {
          resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": API_KEY,
              "anthropic-version": "2023-06-01",
              "anthropic-dangerous-direct-browser-access": "true",
            },
            body: JSON.stringify(body),
            signal,
          });
        } catch (netErr) {
          // Сеть / CORS / abort до старта
          throw _classifyStreamError(netErr, false);
        }

        if (!resp.ok) {
          let errMsg = resp.statusText;
          try {
            const e = await resp.json();
            errMsg = e.error?.message || errMsg;
          } catch (_) {}
          const err = new Error(errMsg);
          err.status = resp.status;
          // 401 — auth (ключ недействителен)
          if (resp.status === 401) err.kind = "auth";
          // 400 + "credit balance" — баланс исчерпан (не ретраим)
          else if (resp.status === 400 && /credit balance/i.test(errMsg)) err.kind = "billing";
          // 429 / 5xx — pre-stream (ретраим)
          else err.kind = "pre-stream";
          throw err;
        }

        const reader = resp.body.getReader(),
          dec = new TextDecoder();
        let buf = "", html = "";
        let usageIn = 0, usageOut = 0;
        let stopReason = null;
        let pendingFlush = false;
        let hasStreamedAnyContent = false;
        let lastTokenAt = Date.now();

        const cur = document.createElement("span");
        cur.className = "stream-cursor";
        container.appendChild(cur);

        // Stuck-детектор: таймер, который abort'ит reader если нет активности
        let stuckTimer = null;
        const resetStuck = () => {
          lastTokenAt = Date.now();
          if (stuckTimer) clearTimeout(stuckTimer);
          stuckTimer = setTimeout(() => {
            try {
              // Помечаем, что abort — из-за таймаута, чтобы отличить от user-abort
              if (window._genAbortController) window._genAbortController._stuckAbort = true;
              reader.cancel(new Error("Stuck stream"));
            } catch (_) {}
          }, window._STREAM_STUCK_MS);
        };
        resetStuck();

        try {
          while (true) {
            let chunk;
            try {
              chunk = await reader.read();
            } catch (readErr) {
              // Обрыв стрима
              // Если был флаг stuck — пометить
              if (signal && signal._stuckAbort) readErr._stuckAbort = true;
              throw _classifyStreamError(readErr, hasStreamedAnyContent);
            }
            const { done, value } = chunk;
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop();
            for (const l of lines) {
              if (!l.startsWith("data: ")) continue;
              const d = l.slice(6).trim();
              if (d === "[DONE]") continue;
              try {
                const p = JSON.parse(d);
                if (p.type === "content_block_delta" && p.delta?.text) {
                  hasStreamedAnyContent = true;
                  resetStuck();
                  html += p.delta.text;
                  if (!pendingFlush) {
                    pendingFlush = true;
                    requestAnimationFrame(() => {
                      pendingFlush = false;
                      cur.remove();
                      container.innerHTML = html;
                      container.appendChild(cur);
                      const distToBottom = document.documentElement.scrollHeight
                        - window.scrollY - window.innerHeight;
                      if (distToBottom < 150) {
                        cur.scrollIntoView({ block: "nearest" });
                      }
                    });
                  }
                  if (onDelta) onDelta(html.length, html);
                }
                if (p.type === "message_start" && p.message?.usage) {
                  usageIn = p.message.usage.input_tokens || 0;
                }
                if (p.type === "message_delta" && p.usage) {
                  usageOut = p.usage.output_tokens || 0;
                }
                if (p.type === "message_delta" && p.delta?.stop_reason) {
                  stopReason = p.delta.stop_reason;
                }
              } catch (e) {
                console.warn("SSE parse error:", e, "raw:", d);
              }
            }
          }

          // Хвост буфера
          if (buf.trim()) {
            const remaining = buf.trim();
            if (remaining.startsWith("data: ")) {
              const d = remaining.slice(6).trim();
              if (d !== "[DONE]") {
                try {
                  const p = JSON.parse(d);
                  if (p.type === "content_block_delta" && p.delta?.text) {
                    html += p.delta.text;
                  }
                  if (p.type === "message_start" && p.message?.usage) {
                    usageIn = p.message.usage.input_tokens || 0;
                  }
                  if (p.type === "message_delta" && p.usage) {
                    usageOut = p.usage.output_tokens || 0;
                  }
                  if (p.type === "message_delta" && p.delta?.stop_reason) {
                    stopReason = p.delta.stop_reason;
                  }
                } catch (e) {
                  console.warn("SSE tail parse error:", e, "raw:", d);
                }
              }
            }
          }
        } finally {
          if (stuckTimer) clearTimeout(stuckTimer);
        }

        cur.remove();
        container.innerHTML = html;

        // Проверяем причину остановки: если модель упёрлась в max_tokens —
        // считаем это ошибкой (контент оборван). Бросаем с kind="max-tokens".
        if (stopReason === "max_tokens") {
          const err = new Error(
            "Ответ оборван по лимиту токенов (max_tokens = 20 000). " +
            "Раздел слишком объёмный для одного запроса."
          );
          err.kind = "max-tokens";
          err.maxTokensUsed = 20000;
          // Токены реально потрачены — сохраняем usage, чтобы catch в
          // _runGenPassesFromIdx мог учесть их в genEntry и totalTokens.
          err._usage = { input_tokens: usageIn, output_tokens: usageOut };
          throw err;
        }
        return { input_tokens: usageIn, output_tokens: usageOut };
      }
