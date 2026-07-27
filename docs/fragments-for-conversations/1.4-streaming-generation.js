// Фрагменты philosynth.html (26 024 стр., ревизия 2026-07) для беседы 1.4-streaming-generation
// Сгенерировано extract-fragments.py; при обновлении исходника — перегенерировать.

// ───── [_STREAM_RETRY_DELAYS] philosynth.html строки 12425–12443 ─────
      window._STREAM_RETRY_DELAYS = [1000, 3000, 8000];

      function _classifyStreamError(err, hasStreamedAnyContent) {
        // Уже типизированная
        if (err && err.kind) return err;
        const msg = (err && err.message) || String(err);
        // AbortError → user-abort (если была отмена) или stuck (если по таймеру)
        if (err && err.name === "AbortError") {
          err.kind = err._stuckAbort ? "stuck" : "user-abort";
          return err;
        }
        // 401
        if (/401|unauthorized|authentication|invalid.*api.*key/i.test(msg)) {
          err.kind = "auth";
          return err;
        }
        err.kind = hasStreamedAnyContent ? "partial" : "pre-stream";
        return err;
      }

// ───── [_STREAM_STUCK_MS] philosynth.html строки 12423–12443 ─────
      window._STREAM_STUCK_MS = 45000;
      /** Число попыток streamResp и задержки (мс) между ними. */
      window._STREAM_RETRY_DELAYS = [1000, 3000, 8000];

      function _classifyStreamError(err, hasStreamedAnyContent) {
        // Уже типизированная
        if (err && err.kind) return err;
        const msg = (err && err.message) || String(err);
        // AbortError → user-abort (если была отмена) или stuck (если по таймеру)
        if (err && err.name === "AbortError") {
          err.kind = err._stuckAbort ? "stuck" : "user-abort";
          return err;
        }
        // 401
        if (/401|unauthorized|authentication|invalid.*api.*key/i.test(msg)) {
          err.kind = "auth";
          return err;
        }
        err.kind = hasStreamedAnyContent ? "partial" : "pre-stream";
        return err;
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

// ───── [streamResp] philosynth.html строки 12642–12691 ─────
      async function streamResp(prompt, container, sys, onDelta) {
        // AbortController: один на «активную генерацию».
        // Если его уже нет (первый вызов из gen/plan/mode/…) — создаём и регистрируем.
        const ownController = !window._genAbortController;
        if (ownController) {
          window._genAbortController = new AbortController();
          window._genAbortController._stuckAbort = false;
          _showAbortButton(true);
        }
        const ctrl = window._genAbortController;

        const delays = window._STREAM_RETRY_DELAYS || [1000, 3000, 8000];
        const maxAttempts = delays.length + 1;

        let lastErr = null;
        try {
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
              return await _streamRespOnce(prompt, container, sys, onDelta, ctrl.signal);
            } catch (err) {
              lastErr = err;
              // Не ретраим: auth, partial, stuck, user-abort, max-tokens
              // (max-tokens бессмысленно ретраить — упрёмся снова при том же промпте)
              if (err.kind === "auth" || err.kind === "partial"
                  || err.kind === "stuck" || err.kind === "user-abort"
                  || err.kind === "max-tokens" || err.kind === "billing") {
                throw err;
              }
              // pre-stream: ретраим до исчерпания попыток
              if (attempt < maxAttempts - 1) {
                const wait = delays[attempt];
                console.warn(`streamResp retry ${attempt + 1}/${maxAttempts - 1} in ${wait}ms:`, err.message);
                // Перед ретраем очищаем возможный частичный контент контейнера
                // (на pre-stream его быть не должно, но для надёжности)
                try { container.innerHTML = ""; } catch (_) {}
                await _sleep(wait, ctrl.signal);
                continue;
              }
              throw err;
            }
          }
        } finally {
          if (ownController) {
            _showAbortButton(false);
            window._genAbortController = null;
          }
        }
        // Недостижимо, но на всякий случай
        throw lastErr || new Error("streamResp: неизвестная ошибка");
      }

// ───── [generateDoc] philosynth.html строки 11897–12236 ─────
      async function generateDoc() {
        const seed = document.getElementById("seedInput").value.trim(),
          phil = getPhil(),
          sec = getSec(),
          method = document.getElementById("synthesisMethod").value,
          depth = document.getElementById("depthLevel").value,
          synthLevel = document.getElementById("synthesisLevel").value,
          ctx = document.getElementById("contextInput").value.trim();
        const hasPhil = phil.length > 0;
        const hasConcepts = _conceptParticipants.length > 0;
        const hasParticipants = hasPhil || hasConcepts;

        if (!seed && !hasParticipants) {
          alert("Введите зерно концепции или выберите хотя бы одного участника синтеза " +
                "(философа или импортированную концепцию).");
          return;
        }
        if (!API_KEY) {
          alert("Введите API-ключ Anthropic.");
          return;
        }
        // Свободный синтез (только зерно, без участников) допустим:
        // baseCtxStatic теперь помечает промпт явным режимом «СВОБОДНЫЙ СИНТЕЗ»,
        // секции с ссылками на участников переформулируются через helper'ы.
        // Однако одиночный философ без зерна — некорректный сценарий:
        // одного мыслителя без направляющего зерна недостаточно для синтеза.
        if (hasPhil && !hasConcepts && phil.length === 1 && !seed) {
          alert("Одного философа без зерна концепции недостаточно для синтеза.\n\n" +
                "Либо введите зерно, либо выберите ещё одного участника.");
          return;
        }
        if (hasConcepts && !hasPhil && _conceptParticipants.length < 2 && !seed) {
          alert("Для синтеза на основе одной концепции (без философов) " +
                "необходимо либо ввести зерно, которое задаст направление развития " +
                "единственной концепции-родителя, либо добавить ещё одну концепцию " +
                "или философа.");
          return;
        }
        // Раздел «Диалог» предполагает минимум два голоса. При свободном
        // синтезе (нет участников) его содержание рискует получиться странным,
        // ЕСЛИ пользователь также не вложил в доп.контекст раздела указания,
        // о каких голосах должен идти диалог. Если доп.контекст есть —
        // считаем, что пользователь осознанно описал голоса там, и молчим.
        // Если доп.контекста нет — мягкое предупреждение с возможностью
        // продолжить.
        if (!hasParticipants && sec.includes("dialogue")) {
          const secCtxForDialogue = (getSecCtxMap() || {}).dialogue || "";
          if (!secCtxForDialogue.trim()) {
            const ok = confirm(
              "Раздел «Диалог между традициями» обычно предполагает минимум два " +
              "голоса — участников синтеза. Вы запускаете свободный синтез (без " +
              "участников) и не заполнили дополнительный контекст раздела " +
              "«Диалог».\n\n" +
              "Без явного указания, чьи голоса должны столкнуться в диалоге, " +
              "раздел может получиться очень странным: модель вынуждена будет " +
              "импровизировать участников с опорой только на зерно.\n\n" +
              "Рекомендуется либо снять галочку с «Диалога», либо добавить в " +
              "доп.контекст раздела указания о предполагаемых голосах " +
              "(традициях, ролях, позициях).\n\n" +
              "Продолжить генерацию как есть?"
            );
            if (!ok) return;
          }
        }

        // Уровень transformative требует «напряжения между минимум двумя»
        // различимыми источниками. В свободном синтезе и при одном участнике
        // именованных источников для напряжения недостаточно — предупреждаем.
        // SD_BY_CARD.none/single переформулируют требование, но предупреждение
        // даёт пользователю шанс осознанно выбрать сценарий.
        const _card = hasParticipants
          ? (hasPhil && hasConcepts ? "multi"
            : (hasPhil ? (phil.length >= 2 ? "multi" : "single")
            : (_conceptParticipants.length >= 2 ? "multi" : "single")))
          : "none";
        if (synthLevel === "transformative" && _card !== "multi") {
          const kind = _card === "none" ? "свободном синтезе" : "синтезе с одним участником";
          const sourceDesc = _card === "none"
            ? "именованных источников в явном виде нет — модели придётся извлекать различимые трактовки/горизонты прямо из зерна концепции"
            : "второго источника напряжения нет — модели придётся извлекать второй полюс из зерна концепции";
          const ok = confirm(
            "Уровень синтеза «Преобразующий» требует, чтобы каждая категория " +
            "возникала из напряжения между минимум двумя различимыми источниками. " +
            "При " + kind + " " + sourceDesc + ".\n\n" +
            "Если зерно достаточно богато, чтобы развёртываться сразу в несколько " +
            "несовместимых трактовок, — это сработает. Если же зерно узкое — " +
            "результат может получиться натянутым.\n\n" +
            "Рекомендуется либо переключить уровень на «Сравнительный» или " +
            "«Порождающий», либо дополнить зерно в доп.контексте синтеза.\n\n" +
            "Продолжить с «Преобразующим» уровнем?"
          );
          if (!ok) return;
        }

        // ── Предупреждение о «дремлющих» концепциях в пуле ──
        const _dormantEligible = _loadedConcepts.filter(
          c => c.participant && !c.isSynthParticipant
        );
        if (_dormantEligible.length > 0) {
          const _list = _dormantEligible.map(c => "  • " + c.name).join("\n");
          const _header = hasConcepts
            ? "В мета-синтезе будут участвовать только концепции с ☑.\n" +
              "Следующие в пуле пригодны, но БЕЗ ☑ — будут проигнорированы:"
            : "В пуле есть концепции, пригодные к мета-синтезу, но без ☑ «Синтез».\n" +
              "Они НЕ будут участвовать в этой генерации:";
          const _tail = "\n\nЕсли вы хотели включить их в мета-синтез — " +
                        "отмените и поставьте ☑ «Синтез» на карточках.\n\n" +
                        "Продолжить без них?";
          if (!confirm(_header + "\n\n" + _list + _tail)) return;
        }

        const generationOrder = document.getElementById("generationOrder").value;
        const extGraphMetrics = document.getElementById("extGraphMetrics")?.checked || false;
        const p = { seed, phil, sec, method, depth, synthLevel, ctx, generationOrder, extGraphMetrics, lang: GEN_LANG };
        p.secCtx = getSecCtxMap(); 

        // ── Сборка участников ──
        p.participants = [
          ...phil.map(name => ({ type: "philosopher", name })),
          ..._conceptParticipants,
        ];
        p.isMetaSynthesis = _conceptParticipants.length > 0;

        // keepFullBudget: новое поле (ТЗ tz_budget_mode)
        p.keepFullBudget = _currentKeepFullBudget();

        // Для обратной совместимости: p.phil содержит все имена
        p.phil = p.participants.map(x =>
          x.type === "philosopher" ? x.name : "«" + x.name + "»"
        );

        // Результат мета-синтеза всегда должен быть пригоден к дальнейшему синтезу
        if (p.isMetaSynthesis) {
          document.getElementById("secSynthReady").checked = true;
          onSynthReadyChange(true);
          // Повторно считываем sec, т.к. разделы могли добавиться
          p.sec = getSec();
        }

        if (p.generationOrder === "genetic" && !p.sec.includes("dialogue")) {
          const ok = confirm(
            "Генетический порядок генерации строится на диалоге как первом " +
            "содержательном разделе.\n\n" +
            "Без раздела «Диалог» генетический порядок не имеет смысла: " +
            "глоссарий и тезисы не смогут извлечь понятия из несуществующего диалога.\n\n" +
            "Добавить раздел «Диалог» автоматически?"
          );
          if (ok) {
            p.sec.push("dialogue");
            document.getElementById("secDialogue").checked = true;
            syncCheckedClass(document.getElementById("secDialogue"));
          } else {
            // Переключить на архитектурный порядок
            p.generationOrder = "architectural";
          }
        }

        // ── Проверка совместимости перед генерацией ──
        const compatKey = p.synthLevel + ":" + p.method;
        const compatEntry = typeof getCompatEntryByKey !== "undefined" ? getCompatEntryByKey(compatKey) : null;
        if (compatEntry && (compatEntry.severity === "hard-conflict" || compatEntry.severity === "conflict")) {
          const sevLabel = compatEntry.severity === "hard-conflict" ? "ЖЁСТКИЙ КОНФЛИКТ (✗✗)" : "УМЕРЕННЫЙ КОНФЛИКТ (✗)";
          const confirmed = confirm(
            sevLabel + "\n\n" +
            "Текущая комбинация «" + SL[p.synthLevel] + " × " + ML[p.method] + "» " +
            "содержит конфликт параметров.\n\n" +
            "Результат может содержать противоречивые директивы, " +
            "что снизит качество синтеза.\n\n" +
            "Продолжить генерацию?"
          );
          if (!confirmed) return;
        }

        const btn = document.getElementById("submitBtn");
        btn.disabled = true;
        btn.classList.add("loading");
        document.getElementById("btnText").textContent = "Синтез...";

        // ── Очистка состояния просмотра из пула ──
        if (_selectedConceptId) {
          const prev = _loadedConcepts.find(c => c.id === _selectedConceptId);
          if (prev) {
            if (DOC_STATE.ready) {
              prev.snapshot = snapshotCurrentState();
              refreshPoolParticipant(prev);
            }
            prev.isSelected = false;
          }
          _selectedConceptId = null;
          renderPoolConcepts();
        }
        // Обновляем participant для всех концепций-участников из их снимков
        refreshAllSynthParticipants();
        // Скрываем футер и индикатор от предыдущего просмотра
        document.getElementById("docFooter").style.display = "none";
        document.getElementById("footerCost").textContent = "";
        const _impInd = document.getElementById("importIndicator");
        if (_impInd) _impInd.classList.remove("visible");
        // Сброс режимов, чтобы не пролезли из просмотренной концепции
        DOC_STATE.modes = {};

        document.getElementById("btnGraph").style.display = "none";
        G = {
          nodes: [], edges: [],
          topology: { clusters: {}, roles: { structural: {}, procedural: {} }, clusterLabels: [] }
        };
        graphBodyIdx = -1;
        totalInputTokens = 0;
        totalOutputTokens = 0;
        ctxLog = [];
        genLog = [];
        genCommon = null;

        const docNum =
          "PS-" +
          Math.floor(Math.random() * 9000 + 1000) +
          "-" +
          Date.now().toString(36).toUpperCase().slice(-4);
        document.getElementById("docNum").textContent = docNum;
        document.getElementById("docDate").textContent = new Date().toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
        document.getElementById("docMethod").textContent = ML[method];
        document.getElementById("docDepth").textContent = DL[depth];
        document.getElementById("docSynthLevel").textContent = SL[synthLevel];
        document.getElementById("docTitle").textContent = "Синтез Философской Концепции";
        // Подзаголовок — всегда перечень философов/концепций; зерно уходит только в раскрывающееся поле
        if (hasNoParticipants(p)) {
          document.getElementById("docSubtitle").textContent = "Свободный синтез (на основе зерна)";
        } else if (hasConceptParticipants(p)) {
          const philPart = philNames(p).join(", ");
          const conceptPart = conceptNames(p).join(", ");
          const parts = [];
          if (philPart) parts.push(philPart);
          if (conceptPart) parts.push(conceptPart);
          document.getElementById("docSubtitle").textContent = "На основе: " + parts.join(" + ");
        } else {
          document.getElementById("docSubtitle").textContent = `На основе: ${(p.phil || []).join(", ")}`;
        }
        document.getElementById("sessionId").textContent = docNum;

        // Заполняем раскрывающиеся поля шапки (зерно, контекст)
        buildDocHeaderExtras(seed, ctx);
        document.getElementById("footerPhil").textContent = hasNoParticipants(p)
          ? "свободный синтез"
          : (p.phil || []).join(", ");

        const effectiveDeps = buildEffectiveDeps(p.sec, resolveContextDeps(p), p.generationOrder);
        const dynamicOrder = buildDynamicOrder(effectiveDeps, p.sec, resolveContextDeps(p), p.generationOrder)
        p.sec = dynamicOrder.filter(k => k !== "sum");

        // Пересобираем defs в новом порядке
        const baseDefs = buildSectionDefs(p);    // sum всегда первый внутри
        patchPromptsWithSecCtx(baseDefs, p.secCtx);
        const defsMap  = Object.fromEntries(baseDefs.map(d => [d.key, d]));

        // Переставляем разделы по динамическому порядку и перенумеровываем
        let secNum = 1;
        const defs = dynamicOrder.map(key => {
          const d = { ...defsMap[key] };
          d.num = secNum++;
          return d;
        });

        const passes = groupPasses(defs);
        passes.forEach((pass, i) => {
          pass.forEach((d) => {
            if (d.key === "graph") graphBodyIdx = i;
          });
        });

        const ps = document.getElementById("progressSteps");
        ps.innerHTML = "";
        passes.forEach((pass, i) => {
          const d = document.createElement("div");
          d.className = "progress-step";
          d.id = "ps" + i;
          d.innerHTML = `<span class="step-icon">◯</span> ${pass.map((x) => x.title).join(" + ")}`;
          ps.appendChild(d);
        });
        document.getElementById("progressPanel").classList.add("visible");

        const db = document.getElementById("docBodies");
        db.innerHTML = "";
        passes.forEach((_, i) => {
          const d = document.createElement("div");
          d.className = "doc-body";
          d.id = "db" + i;
          if (i > 0) d.style.borderTop = "none";
          db.appendChild(d);
        });
        document.getElementById("outputWrap").classList.add("visible");
        document
          .getElementById("outputWrap")
          .scrollIntoView({ behavior: "smooth", block: "start" });

        const SYS = buildSYS(p);
        const partStatic = baseCtxStatic(p);
        // partBase оставляем для backward-compat с устаревшими местами, берёт селектив для первого pass
        const partBase = partStatic + baseCtxParents(p, (passes[0] && passes[0][0] && passes[0][0].key) || null);
        
        // Служебный каркас — литеральные связки. Длину вычисляем по шаблону с пустыми переменными частями:
        const partQuality = buildQualityReinforcement(p);
        const scaffoldLen = `ПАРАМЕТРЫ СИНТЕЗА:\n\n\n\nЗАДАНИЕ: составь ТОЛЬКО следующие разделы (строго в указанном порядке, без добавления других):\n\n\n\n`.length;
        const commonChars = SYS.length + partBase.length + partQuality.length + scaffoldLen;

        const _sectionKeysForSpec14 = passes.map(pass => pass.map(d => d.key).join("+"));
        genCommon = {
          sysChars:      SYS.length,
          baseChars:     partBase.length,
          baseCharsWithoutConcepts: partStatic.length,
          totalConceptOverhead: partBase.length - partStatic.length,
          budgetMode:    p.keepFullBudget ? 'full' : 'shrink',
          parentSpecBySection: buildParentSpecBySection(p, _sectionKeysForSpec14),
          rulesChars:    0,
          qualityChars:  partQuality.length,
          scaffoldChars: scaffoldLen,
          totalChars:    commonChars,
          conceptBlockSizes: computeFullConceptBlockSizes(p),
        };
        
        // Цикл генерации вынесен в _runGenPassesFromIdx — ту же функцию,
        // что использует resumeGeneration с другим startIdx. Это устраняет
        // дубликацию логики и гарантирует единообразие поведения при сбоях.
        await _runGenPassesFromIdx({
          p, defs, passes, dynamicOrder, effectiveDeps,
          SYS, partStatic, startIdx: 0, source: "init",
        });

        // Если цикл прервался из-за паузы — НЕ финализируем состояние.
        // pausedState уже сохранён в catch-блоке, модалка показана.
        if (DOC_STATE.pausedState && DOC_STATE.pausedState.kind === "gen") {
          return;
        }

        // ── Финализация после успешного завершения всех passes ──
        _finalizeGenerationPostloop(p, defs, dynamicOrder, effectiveDeps, passes);
      }

// ───── [_runGenPassesFromIdx] philosynth.html строки 25573–25821 ─────
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

// ───── [groupPasses] philosynth.html строки 11588–11592 ─────
      function groupPasses(d) {
        const p = [];
        for (let i = 0; i < d.length; i += 1) p.push(d.slice(i, i + 1));
        return p;
      }

// ───── [buildPromptSkeleton] philosynth.html строки 8506–8588 ─────
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

// ───── [_finalizeGenerationPostloop] philosynth.html строки 12242–12346 ─────
      function _finalizeGenerationPostloop(p, defs, dynamicOrder, effectiveDeps, passes) {
        // Если капсула сгенерирована — обновляем шапку (первый раз, до populateDocState)
        if (DOC_STATE.sectionOrder && DOC_STATE.sectionOrder.includes("capsule")) {
          const capsuleIdx = DOC_STATE.sectionDbIdx["capsule"];
          const capsuleEl = document.getElementById("db" + capsuleIdx);
          if (capsuleEl) {
            DOC_STATE.capsuleHTML = capsuleEl.innerHTML;
            updateCapsuleInHeader();
          }
        }

        document.getElementById("docFooter").style.display = "flex";
        const costIn = totalInputTokens * 3 / 1e6;
        const costOut = totalOutputTokens * 15 / 1e6;
        const costTotal = costIn + costOut;
        document.getElementById("footerCost").textContent =
          "Токены: " + totalInputTokens.toLocaleString("ru") + " вх. + " +
          totalOutputTokens.toLocaleString("ru") + " вых. · Стоимость: $" +
          costTotal.toFixed(4) + " (" + (costTotal * 100).toFixed(2) + "¢)";

        const btn = document.getElementById("submitBtn");
        if (btn) {
          btn.disabled = false;
          btn.classList.remove("loading");
        }
        const btnText = document.getElementById("btnText");
        if (btnText) btnText.textContent = "Синтезировать Концепцию";

        // ── Заполнить DOC_STATE для системы редактирования ──
        populateDocState(p, defs, dynamicOrder, effectiveDeps, resolveContextDeps(p), passes);

        // ── Генеалогия ──
        DOC_STATE.participants = p.participants || [];
        // Имя: если docTitle ещё дефолтный (updateDocTitleFromName мог
        // не успеть), пробуем вытащить из раздела «name» напрямую. Если и это
        // не дало результата — fallback-плейсхолдер (не дефолт!), чтобы
        // при экспорте и дальнейших метасинтезах не протекал дефолт-дефект.
        const _rootName = (function () {
          const fromDoc = document.getElementById("docTitle").textContent || "";
          if (!isPlaceholderConceptName(fromDoc)) return fromDoc;
          const fromSection = resolveConceptName(document);
          return fromSection || "[безымянная концепция]";
        })();
        DOC_STATE.genealogy = {
          type: "concept",
          name: _rootName,
          method: p.method,
          synthLevel: p.synthLevel,
          seed: p.seed || "",
          generationOrder: p.generationOrder,
          participants: (p.participants || []).map(x => {
            if (x.type === "philosopher") return { type: "philosopher", name: x.name };
            const node = x.genealogy
              ? JSON.parse(JSON.stringify(x.genealogy))
              : {
                  type: "concept",
                  name: x.name,
                  method: x.method,
                  synthLevel: x.synthLevel,
                  seed: x.seed || "",
                  // Fallback-цепочка: пытаемся взять настоящий порядок у участника
                  // (поле перенесено из пула через syncConceptParticipants
                  // или через embedded state при импорте), затем у его genealogy
                  // (если есть минимальная), затем — architectural как последний рубеж.
                  generationOrder: x.generationOrder
                                 || x.genealogy?.generationOrder
                                 || "architectural",
                };
            if (!node.capsule && x.capsule) node.capsule = x.capsule;
            return node;
          }),
        };

        if (hasConceptParticipants(p)) {
          updateGenealogyInHeader();
        }

        if (DOC_STATE.sectionOrder.includes("capsule")) {
          const capsuleIdx = DOC_STATE.sectionDbIdx["capsule"];
          const capsuleEl = document.getElementById("db" + capsuleIdx);
          if (capsuleEl) {
            DOC_STATE.capsuleHTML = capsuleEl.innerHTML;
            updateCapsuleInHeader();
            removeCapsuleFromDocBodies();
          }
        }

        updateModeButtons();
        buildTableOfContents();

        // Документ успешно финализирован — гарантированно очищаем pausedState,
        // чтобы при следующем экспорте в файл не попал тяжёлый контекст родителей
        // из genParams.participants (который может ещё жить в pausedState,
        // если сюда зашли по пути resumeGeneration, где _clearPausedState
        // вызывался ДО цикла). Это защита от будущих рефакторингов.
        DOC_STATE.pausedState = null;
        if (typeof _showPauseBadge === "function") {
          try { _showPauseBadge(false); } catch (_) {}
        }

        // Автодобавление текущего документа в пул.
        // Если набор разделов достаточен для мета-синтеза — ставим ☑ сразу.
        try { _autoAddCurrentDocToPool(); }
        catch (_autoAddErr) { console.warn("Авто-добавление в пул упало:", _autoAddErr); }
      }

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

// ───── [updateDocTitleFromName] philosynth.html строки 11871–11892 ─────
      function updateDocTitleFromName(nameContainer) {
        const divs = nameContainer.querySelectorAll("div[data-section]");
        let recSection = null;
        for (const div of divs) {
          const sec = div.getAttribute("data-section").toLowerCase();
          if (sec.includes("итогов") || sec.includes("рекоменд")) { recSection = div; break; }
        }
        const strong = recSection
          ? recSection.querySelector("strong")
          : nameContainer.querySelector("strong");
        let nameText = strong?.textContent?.trim();
        if (nameText) {
          nameText = nameText
            // Шаг 1: убрать известные служебные префиксы модели
            .replace(/^(?:итогов\w+\s+рекомендаци\w*|рекомендуем\w+\s+названи\w*|названи\w+\s*концепци\w*)\s*[:：]\s*/i, "")
            .replace(/^[«""]|[»""]$/g, "")
            // Шаг 2: оставить только основную часть до двоеточия (подзаголовок — в шапку не нужен)
            .split(/\s*[:：]\s*/)[0]
            .trim();
          if (nameText) document.getElementById("docTitle").textContent = nameText;
        }
      }
