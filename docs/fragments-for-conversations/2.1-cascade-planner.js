// Фрагмент philosynth.html (26025 строк) — собран
// scripts/extract-by-name.py по спецификации 2.1-cascade-planner.spec.
//
// Номера строк ниже — РЕЗУЛЬТАТ поиска по именам, а не входные
// данные: при правке исходника достаточно перезапустить сборку,
// спецификация не устаревает. Имена берутся из
// docs/04-code-reuse-map.md.

// ───── Каскадный анализ (server/services/cascade-analyzer.ts) · js:computeDependents
// philosynth.html строки 5473–5487 ─────
      function computeDependents(effectiveDeps) {
        const preds = computePredecessors(effectiveDeps);
        const dependents = {};
        for (const sec of Object.keys(effectiveDeps)) {
          dependents[sec] = new Set();
        }
        // Если B ∈ preds[A], значит A зависит от B → B влияет на A → A ∈ dependents[B]
        for (const [sec, predSet] of Object.entries(preds)) {
          for (const pred of predSet) {
            if (!dependents[pred]) dependents[pred] = new Set();
            dependents[pred].add(sec);
          }
        }
        return dependents;
      }

// ───── Каскадный анализ (server/services/cascade-analyzer.ts) · js:getIntraDependents
// philosynth.html строки 9566–9600 ─────
      function getIntraDependents(sectionKey, subsectionName) {
        const deps = INTRA_DEPS[sectionKey] || {};
        const result = new Set();
        const actualSubMap = buildSubsectionMap(DOC_STATE.params || {});
        const actualSubs = new Set(actualSubMap[sectionKey] || Object.keys(deps));

        // Канонизируем input: в INTRA_DEPS имя подраздела «Портрет...»
        // зафиксировано как канон («Портрет каждого философа»), но в DOM
        // и DOC_STATE оно может иметь другой вид — приводим.
        const canonInput = canonicalSubsectionKey(sectionKey, subsectionName);
        // И обратная карта «канон → актуальное отображаемое имя» — для
        // того, чтобы вернуть имена, совпадающие с DOM.
        const portraitActual = (sectionKey === "sum")
          ? SUBSECTION_SUM_PORTRAIT(DOC_STATE.params || {})
          : null;
        const denormalize = (name) =>
          (sectionKey === "sum" && name === "Портрет каждого философа" && portraitActual)
            ? portraitActual : name;

        const queue = [canonInput];
        while (queue.length > 0) {
          const current = queue.shift();
          for (const [sub, sources] of Object.entries(deps)) {
            if (sources.includes(current) && !result.has(sub)) {
              const actualName = denormalize(sub);
              if (actualSubs.has(actualName)) {
                result.add(actualName);
                queue.push(sub);  // для дальнейшего обхода — канон
              }
            }
          }
        }

        return [...result];
      }

// ───── Каскадный анализ (server/services/cascade-analyzer.ts) · js:getCrossSecDependents
// philosynth.html строки 9767–9785 ─────
      function getCrossSecDependents(sectionKey, subsectionName) {
        const canonName = canonicalSubsectionKey(sectionKey, subsectionName);
        const ctxKeys = (SUBSECTION_TO_CTX_KEYS[sectionKey] || {})[canonName] || [];
        if (!ctxKeys.length) return [];

        const consumers = buildCtxKeyConsumers();
        const result = [];

        for (const ctxKey of ctxKeys) {
          const list = consumers[ctxKey] || [];
          for (const entry of list) {
            // Не включаем потребителей из того же раздела — это покрывается INTRA_DEPS
            if (entry.section === sectionKey) continue;
            result.push({ ...entry, ctxKey });
          }
        }

        return result;
      }

// ───── Каскадный анализ (server/services/cascade-analyzer.ts) · js:getAffectedModes
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

// ───── Каскадный анализ (server/services/cascade-analyzer.ts) · js:sortInTopoOrder
// philosynth.html строки 20482–20486 ─────
      function sortInTopoOrder(keys) {
        const orderMap = {};
        DOC_STATE.sectionOrder.forEach((k, i) => { orderMap[k] = i; });
        return [...keys].sort((a, b) => (orderMap[a] ?? 999) - (orderMap[b] ?? 999));
      }

// ───── Каскадный анализ (server/services/cascade-analyzer.ts) · js:buildPlanOrder
// philosynth.html строки 20495–20578 ─────
      function buildPlanOrder(plan) {
        const p = DOC_STATE.params;
        if (!p) return [
          ...plan.add.map(k => ({ key: k, action: "add" })),
          ...plan.regen.map(k => ({ key: k, action: "regen" })),
        ];

        // ── 1. Будущий набор разделов (после удалений + добавлений) ──
        const removeSet = new Set(plan.remove);
        const futureSections = [
          ...DOC_STATE.sectionOrder.filter(k => k !== "sum" && !removeSet.has(k)),
          ...plan.add,
        ];

        // ── 2. Граф зависимостей для будущего состояния ──
        const futureParams = { ...p, sec: futureSections };
        const futureResolved = resolveContextDeps(futureParams);
        const futureEffDeps = buildEffectiveDeps(
          futureSections, futureResolved,
          p.generationOrder
        );

        // ── 3. Predecessors — для каждого раздела: от кого он зависит ──
        const preds = computePredecessors(futureEffDeps);

        // ── 4. Множество операций плана ──
        const planSet = new Set([...plan.add, ...plan.regen]);
        const addSet = new Set(plan.add);

        // ── 5. Топосорт (Кан) только среди операций плана ──
        // Учитываем только зависимости ВНУТРИ плана
        const inDegree = {};
        const adjList = {};
        for (const key of planSet) {
          inDegree[key] = 0;
          adjList[key] = [];
        }
        for (const key of planSet) {
          const predSet = preds[key] || new Set();
          for (const pred of predSet) {
            if (planSet.has(pred) && pred !== key) {
              adjList[pred].push(key);
              inDegree[key]++;
            }
          }
        }

        // Вторичная сортировка по каноническому порядку
        const TOPO = (p.generationOrder === "genetic")
          ? SECTION_TOPO_ORDER_GENETIC
          : SECTION_TOPO_ORDER_ARCHITECTURAL;

        const queue = [...planSet]
          .filter(k => inDegree[k] === 0)
          .sort((a, b) => (TOPO[a] ?? 99) - (TOPO[b] ?? 99));
        const order = [];

        while (queue.length) {
          const node = queue.shift();
          order.push({
            key: node,
            action: addSet.has(node) ? "add" : "regen",
          });
          for (const succ of (adjList[node] || []).sort((a, b) =>
            (TOPO[a] ?? 99) - (TOPO[b] ?? 99)
          )) {
            inDegree[succ]--;
            if (inDegree[succ] === 0) {
              const pos = queue.findIndex(q => (TOPO[q] ?? 99) > (TOPO[succ] ?? 99));
              if (pos === -1) queue.push(succ);
              else queue.splice(pos, 0, succ);
            }
          }
        }

        // Цикл: если что-то не вошло (циклическая зависимость) — добавляем в конец
        for (const key of planSet) {
          if (!order.some(o => o.key === key)) {
            order.push({ key, action: addSet.has(key) ? "add" : "regen" });
          }
        }

        return order;
      }

// ───── Каскадный анализ (server/services/cascade-analyzer.ts) · js:buildCtxKeyConsumers
// philosynth.html строки 9690–9735 ─────
      function buildCtxKeyConsumers() {
        const consumers = {};
        // Используем актуальные зависимости (учитывают generationOrder, level, method)
        const depsSource = DOC_STATE.resolvedDeps || CONTEXT_DEPS_BASE;

        for (const [sectionKey, deps] of Object.entries(depsSource)) {
          const allKeys = [...(deps.required || []), ...(deps.optional || [])];

          for (const ctxKey of allKeys) {
            if (!consumers[ctxKey]) consumers[ctxKey] = [];

            // Определяем, какие подразделы используют этот ключ.
            // Если раздел имеет parts с shared-блоками, scope указывает конкретных потребителей.
            // Иначе — весь раздел является потребителем (без гранулярности до подразделов).
            const def = DOC_STATE.sectionDefs?.[sectionKey];
            if (def?.parts) {
              // Ищем shared-блоки, в body которых упоминается ctxKey или его источник
              const sharedScopes = [];
              for (const item of def.parts.subsections) {
                if (item.type === "shared" && item.scope) {
                  sharedScopes.push(...item.scope);
                }
              }

              if (sharedScopes.length > 0) {
                // Конкретные подразделы из scope
                for (const subName of sharedScopes) {
                  consumers[ctxKey].push({ section: sectionKey, subsection: subName });
                }
              } else {
                // Нет shared — все именованные подразделы считаются потребителями
                for (const item of def.parts.subsections) {
                  if (item.name) {
                    consumers[ctxKey].push({ section: sectionKey, subsection: item.name });
                  }
                }
              }
            } else {
              // Нет parts — весь раздел
              consumers[ctxKey].push({ section: sectionKey, subsection: null });
            }
          }
        }

        return consumers;
      }

// ───── Каскадный анализ (server/services/cascade-analyzer.ts) · js:canonicalSubsectionKey
// philosynth.html строки 9753–9759 ─────
      function canonicalSubsectionKey(sectionKey, subsectionName) {
        if (sectionKey === "sum" &&
            _SUM_PORTRAIT_VARIANTS.has(subsectionName)) {
          return "Портрет каждого философа";
        }
        return subsectionName;
      }

// ───── Каскадный анализ (server/services/cascade-analyzer.ts) · js:buildFactualDepsMap
// philosynth.html строки 5501–5536 ─────
      function buildFactualDepsMap(log) {
        if (!log || !log.length) return {};

        // При мультисессионном логе для одного sectionKey может быть
        // несколько записей (оригинал + перегенерации). Берём ПОСЛЕДНЮЮ:
        // она отражает актуальное состояние зависимостей раздела.
        const latestByKey = {};
        for (const entry of log) {
          latestByKey[entry.sectionKey] = entry; // перезаписывает → остаётся последняя
        }

        const map = {};
        for (const entry of Object.values(latestByKey)) {
          const consumer = entry.sectionKey;
          if (!map[consumer]) map[consumer] = {};

          for (const e of entry.entries) {
            const source = sourceOf(e.key);
            if (source === "sum" || source === consumer) continue;
            if (e.status === "missing") continue;

            if (!map[consumer][source]) {
              map[consumer][source] = { chars: 0, keys: [], statuses: [] };
            }

            const info = map[consumer][source];
            info.keys.push(e.key);
            info.statuses.push(e.status);

            if (e.status === "found" || e.status === "truncated") {
              info.chars += e.len || 0;
            }
          }
        }
        return map;
      }

// ───── Каскадный анализ (server/services/cascade-analyzer.ts) · js:computeFactualDependents
// philosynth.html строки 5544–5565 ─────
      function computeFactualDependents(factualDeps) {
        const result = {};

        for (const [consumer, sources] of Object.entries(factualDeps)) {
          for (const [source, info] of Object.entries(sources)) {
            if (!result[source]) result[source] = { consumers: [], totalChars: 0 };
            result[source].consumers.push({
              key: consumer,
              chars: info.chars,
              keys: info.keys,
            });
            result[source].totalChars += info.chars;
          }
        }

        // Сортируем потребителей по убыванию chars
        for (const data of Object.values(result)) {
          data.consumers.sort((a, b) => b.chars - a.chars);
        }

        return result;
      }

// ───── Каскадный анализ (server/services/cascade-analyzer.ts) · js:updateLiveCascade
// philosynth.html строки 19139–19505 ─────
      function updateLiveCascade(plan) {
        const panel = document.getElementById("cascadePanel");
        const titleEl = document.getElementById("cascadeTitle");
        const descEl = document.getElementById("cascadeDesc");
        const listEl = document.getElementById("cascadeList");
        if (!panel || !listEl) return;

        const activeSet = new Set([...plan.regen, ...plan.add]);
        const removeSet = new Set(plan.remove);

        // ══════════════════════════════════════════════════════════
        // A. Будущее состояние документа
        // ══════════════════════════════════════════════════════════

        const futureSections = [
          ...DOC_STATE.sectionOrder.filter(k => k !== "sum" && !removeSet.has(k)),
          ...plan.add,
        ];

        let futureResolved = null;
        let futureEffDeps  = null;

        if (futureSections.length > 0) {
          futureResolved = resolveContextDeps({ ...DOC_STATE.params, sec: futureSections });
          futureEffDeps  = buildEffectiveDeps(futureSections, futureResolved, DOC_STATE.params?.generationOrder);
        }

        // ══════════════════════════════════════════════════════════
        // B. DOWNSTREAM: существующие разделы, затронутые планом
        // ══════════════════════════════════════════════════════════

        const dependents = computeDependents(DOC_STATE.effectiveDeps);
        const factDeps = DOC_STATE.factualDeps || {};
        const factReverse = typeof computeFactualDependents === "function"
          ? computeFactualDependents(factDeps) : {};

        const affected = new Set();

        for (const key of plan.regen) {
          for (const dep of (dependents[key] || new Set())) {
            if (dep !== "sum") affected.add(dep);
          }
        }
        for (const key of plan.remove) {
          for (const dep of (dependents[key] || new Set())) {
            if (dep !== "sum") affected.add(dep);
          }
        }

        // Downstream-бенефициары добавлений
        if (plan.add.length > 0 && futureEffDeps) {
          const futureDependents = computeDependents(futureEffDeps);
          for (const key of plan.add) {
            for (const dep of (futureDependents[key] || new Set())) {
              if (dep !== "sum") affected.add(dep);
            }
          }
        }

        // Чистим affected
        for (const key of activeSet) affected.delete(key);
        for (const key of removeSet) affected.delete(key);

        const remainingAfterRemove = new Set(
          DOC_STATE.sectionOrder.filter(k => !removeSet.has(k))
        );
        for (const key of affected) {
          if (!remainingAfterRemove.has(key)) affected.delete(key);
        }

        // ══════════════════════════════════════════════════════════
        // C. UPSTREAM: анализ зависимостей добавляемых разделов
        // ══════════════════════════════════════════════════════════

        const missingHard     = [];   // { consumer, label, sources: [{ ctxKey, src, label }] }
        const activeSubs      = [];   // { consumer, consumerLabel, ctxLabel, replacedLabel, quality }
        const addableBenefits = {};   // srcKey → { label, consumers: string[] }

        if (plan.add.length > 0 && futureResolved && futureEffDeps) {
          const futureSet = new Set(["sum", ...futureSections]);

          for (const addKey of plan.add) {
            const origDeps = futureResolved[addKey];
            const effDeps  = futureEffDeps[addKey];
            if (!origDeps) continue;

            const consumerLabel = KEY_LABELS[addKey] || addKey;
            const origAll = new Set([
              ...(origDeps.required || []),
              ...(origDeps.optional || []),
            ]);
            const effAll = new Set([
              ...(effDeps?.required || []),
              ...(effDeps?.optional || []),
            ]);

            // ── C1. Жёсткие потери ──
            const hardMissing = [];
            for (const ctxKey of origDeps.required) {
              const src = sourceOf(ctxKey);
              if (src === "sum" || futureSet.has(src)) continue;
              const hasSubstitute = [...effAll].some(k =>
                !origAll.has(k) && sourceOf(k) !== src && sourceOf(k) !== addKey
              );
              if (!hasSubstitute) {
                hardMissing.push({ ctxKey, src, label: CTX_LABELS[ctxKey] || ctxKey });
              }
            }
            if (hardMissing.length > 0) {
              missingHard.push({ consumer: addKey, label: consumerLabel, sources: hardMissing });
            }

            // ── C2. Активные подстановки ──
            if (effDeps) {
              const addSet = new Set(plan.add);
              for (const ctxKey of [...(effDeps.required || []), ...(effDeps.optional || [])]) {
                if (origAll.has(ctxKey)) continue;
                const q = getSubstituteQuality(ctxKey);
                if (q == null) continue;

                let replacedKey = null;
                for (const [origK, candidates] of Object.entries(getActiveSubstitutionMap())) {
                  if (candidates.some(c => c.key === ctxKey)) { replacedKey = origK; break; }
                }

                // Если источник заменяемого контекста тоже добавляется в этом же плане —
                // подстановка не нужна: оригинал будет доступен после генерации
                if (replacedKey) {
                  const replacedSrc = sourceOf(replacedKey);
                  if (addSet.has(replacedSrc) || futureSet.has(replacedSrc)) continue;
                }

                activeSubs.push({
                  consumer: addKey,
                  consumerLabel,
                  ctxKey,
                  ctxLabel: CTX_LABELS[ctxKey] || ctxKey,
                  replacedKey,
                  replacedLabel: replacedKey ? (CTX_LABELS[replacedKey] || replacedKey) : "?",
                  quality: q,
                });
              }
            }

            // ── C3. Рекомендации по optional-зависимостям ──
            for (const ctxKey of (origDeps.optional || [])) {
              const src = sourceOf(ctxKey);
              if (src === "sum" || futureSet.has(src)) continue;
              if (!addableBenefits[src]) {
                addableBenefits[src] = { label: KEY_LABELS[src] || src, consumers: [] };
              }
              if (!addableBenefits[src].consumers.includes(consumerLabel)) {
                addableBenefits[src].consumers.push(consumerLabel);
              }
            }
          }
        }

        const hasUpstream = missingHard.length > 0
                         || activeSubs.length > 0
                         || Object.keys(addableBenefits).length > 0;

        // ══════════════════════════════════════════════════════════
        // D. ВИДИМОСТЬ
        // ══════════════════════════════════════════════════════════

        if (affected.size === 0 && !hasUpstream) {
          panel.classList.remove("visible");
          return;
        }

        // ══════════════════════════════════════════════════════════
        // E. РЕНДЕРИНГ
        // ══════════════════════════════════════════════════════════

        listEl.innerHTML = "";
        const descParts = [];

        // ── E1. Downstream: затронутые, но не включённые в план ──
        if (affected.size > 0) {
          descParts.push(
            "Следующие разделы будут затронуты выбранными действиями, " +
            "но не включены в план. Рекомендуется отметить их для перегенерации."
          );

          const sorted = sortInTopoOrder([...affected]);
          for (const depKey of sorted) {
            const depLabel = KEY_LABELS[depKey] || depKey;
            const def = DOC_STATE.sectionDefs[depKey];
            const num = def ? def.num : "?";

            let weightHint = "";
            for (const srcKey of [...plan.regen, ...plan.remove]) {
              const fi = factReverse[srcKey];
              if (fi) {
                const consumer = fi.consumers.find(c => c.key === depKey);
                if (consumer && consumer.chars > 0) {
                  weightHint += ` <span style="font-size:9px;color:var(--gold)">${consumer.chars.toLocaleString("ru")} симв. от ${KEY_LABELS[srcKey] || srcKey}</span>`;
                }
              }
            }

            const regenCb = document.getElementById("editRegen-" + depKey);
            const isCovered = regenCb?.checked;

            const item = document.createElement("div");
            item.className = "cascade-item-info " + (isCovered ? "covered" : "exposed");
            item.innerHTML = `<span>${isCovered ? "✓" : "⚡"} § ${num} — ${esc(depLabel)}${weightHint}</span>`;
            if (!isCovered) {
              const markBtn = document.createElement("button");
              markBtn.style.cssText =
                "font-family:var(--mono);font-size:9px;border:1px solid var(--gold);" +
                "background:transparent;color:var(--gold);padding:2px 8px;cursor:pointer;margin-left:auto";
              markBtn.textContent = "отметить ↑";
              markBtn.onclick = () => {
                if (regenCb) { regenCb.checked = true; onEditCheckChange(depKey, "regen"); }
              };
              item.appendChild(markBtn);
            }
            listEl.appendChild(item);
          }
        }

        // ── E2. Upstream: жёсткие потери зависимостей ──
        if (missingHard.length > 0) {
          descParts.push(
            "Обязательные зависимости отсутствуют — качество добавляемых разделов будет снижено."
          );

          for (const m of missingHard) {
            const srcNames = m.sources.map(s => "«" + esc(s.label) + "»").join(", ");

            const item = document.createElement("div");
            item.className = "sec-warning-item";
            item.style.borderColor = "var(--red)";
            item.style.background = "#fff0f0";
            item.style.color = "var(--red)";
            item.innerHTML =
              `<span class="warn-icon">⚠</span>` +
              `<span>«${esc(m.label)}»: отсутствует обязательный контекст ${srcNames}.</span>`;

            const seenSrc = new Set();
            for (const s of m.sources) {
              if (seenSrc.has(s.src)) continue;
              seenSrc.add(s.src);
              const addCb = document.getElementById("editAdd-" + s.src);
              if (addCb && !addCb.checked) {
                const addBtn = document.createElement("button");
                addBtn.style.cssText =
                  "font-family:var(--mono);font-size:9px;border:1px solid var(--red);" +
                  "background:transparent;color:var(--red);padding:2px 6px;cursor:pointer;" +
                  "margin-left:4px;flex-shrink:0";
                addBtn.textContent = "+ " + (KEY_LABELS[s.src] || s.src);
                addBtn.onclick = () => {
                  addCb.checked = true;
                  onEditCheckChange(s.src, "add");
                };
                item.appendChild(addBtn);
              }
            }
            listEl.appendChild(item);
          }
        }

        // ── E3. Upstream: активные подстановки контекста ──
        if (activeSubs.length > 0) {
          if (missingHard.length === 0) {
            descParts.push("Недостающий контекст заменён подстановками.");
          }

          for (const s of activeSubs) {
            const qLabel = s.quality === 3 ? "равноценная замена"
                         : s.quality === 2 ? "частичная замена"
                         :                   "слабая замена";

            const item = document.createElement("div");
            item.className = "sec-substituted-item";
            item.innerHTML =
              `<span class="rec-icon">⇄</span>` +
              `<span>«${esc(s.consumerLabel)}»: ` +
              `контекст «${esc(s.ctxLabel)}» используется как ${qLabel} ` +
              `для «${esc(s.replacedLabel)}».</span>`;
            listEl.appendChild(item);
          }
        }

        // ── E4. Upstream: рекомендации по добавлению ──
        if (Object.keys(addableBenefits).length > 0) {
          for (const [srcKey, info] of Object.entries(addableBenefits)) {
            const consumerList = info.consumers.map(c => "«" + esc(c) + "»").join(", ");
            const word = info.consumers.length === 1 ? "раздела" : "разделов";

            const item = document.createElement("div");
            item.className = "sec-recommend-item";
            item.innerHTML =
              `<span class="rec-icon">💡</span>` +
              `<span>Включение «${esc(info.label)}» может улучшить качество ` +
              `${word} ${consumerList} (дополнительный контекст).</span>`;

            const addCb = document.getElementById("editAdd-" + srcKey);
            if (addCb && !addCb.checked) {
              const addBtn = document.createElement("button");
              addBtn.style.cssText =
                "font-family:var(--mono);font-size:9px;border:1px solid var(--blue-corp);" +
                "background:transparent;color:var(--blue-corp);padding:2px 8px;cursor:pointer;" +
                "margin-left:auto;flex-shrink:0";
              addBtn.textContent = "добавить ↓";
              addBtn.onclick = () => {
                addCb.checked = true;
                onEditCheckChange(srcKey, "add");
              };
              item.appendChild(addBtn);
            }
            listEl.appendChild(item);
          }
        }

        // ── Заголовок и описание ──
        if (titleEl) {
          titleEl.textContent = hasUpstream && affected.size === 0
            ? "Зависимости добавляемых разделов"
            : affected.size > 0 && !hasUpstream
              ? "Каскад зависимостей"
              : "Каскад и зависимости";
        }
        if (descEl) descEl.textContent = descParts.join(" ");

        // ── E5. Затронутые режимы ──
        const changedSections = [...plan.regen, ...plan.remove, ...plan.add];
        const affectedModes = getAffectedModes(changedSections);

        if (affectedModes.length > 0) {
          descParts.push("Сгенерированные режимы затронуты выбранными действиями.");

          for (const am of affectedModes) {
            const item = document.createElement("div");
            item.style.cssText =
              "display:flex;align-items:center;gap:8px;font-family:var(--mono);" +
              "font-size:10px;color:var(--violet);padding:5px 10px;" +
              "background:var(--violet-light);border:1px solid rgba(107,0,170,0.25)";
            item.innerHTML =
              `<span>◈ ${esc(am.title)}: ${esc(am.reason)}</span>`;

            // Кнопка «отметить» для перегенерации режима
            const regenCb = document.getElementById(`editRegenMode-${am.modeKey}-${am.index}`);
            if (regenCb && !regenCb.checked) {
              const markBtn = document.createElement("button");
              markBtn.style.cssText =
                "font-family:var(--mono);font-size:9px;border:1px solid var(--violet);" +
                "background:transparent;color:var(--violet);padding:2px 8px;cursor:pointer;margin-left:auto";
              markBtn.textContent = "отметить ↑";
              markBtn.onclick = () => {
                regenCb.checked = true;
                recalcEditPlan();
              };
              item.appendChild(markBtn);
            } else if (regenCb?.checked) {
              item.innerHTML += '<span style="margin-left:auto;font-size:9px;opacity:0.6">✓ отмечен</span>';
            }

            listEl.appendChild(item);
          }
        }

        panel.classList.add("visible");
        panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }

// ───── Реэкспорт из 1.1 — не портируется заново, нужен для сверки сигнатуры · js:sourceOf
// philosynth.html строки 6410–6412 ─────
      function sourceOf(ctxKey) {
        return ctxKey.split(":")[0];
      }

// ───── Планирование правки (server/services/edit-planner.ts) · js:recalcEditPlan
// philosynth.html строки 19053–19082 ─────
      function recalcEditPlan() {
        const plan = { regen: [], remove: [], add: [] };
        const order = DOC_STATE.sectionOrder.filter(k => k !== "sum");

        for (const key of order) {
          if (document.getElementById("editRegen-" + key)?.checked) plan.regen.push(key);
          if (document.getElementById("editDelete-" + key)?.checked) plan.remove.push(key);
        }
        const available = typeof getAvailableSectionsToAdd === "function"
          ? getAvailableSectionsToAdd() : [];
        for (const key of available) {
          if (document.getElementById("editAdd-" + key)?.checked) plan.add.push(key);
        }

        // ── Режимы ──
        plan.modeRegen = [];
        plan.modeRemove = [];
        for (const [modeKey, results] of Object.entries(DOC_STATE.modes || {})) {
          if (!Array.isArray(results)) continue;
          for (let i = 0; i < results.length; i++) {
            if (document.getElementById(`editRegenMode-${modeKey}-${i}`)?.checked)
              plan.modeRegen.push([modeKey, i]);
            if (document.getElementById(`editDeleteMode-${modeKey}-${i}`)?.checked)
              plan.modeRemove.push([modeKey, i]);
          }
        }

        _editPlan = plan;
        updateEditPlanUI();
      }

// ───── (отложены из 1.1 сознательно — требуют каскадного анализа) · js:estimateCascadeWaveCost
// philosynth.html строки 7912–7925 ─────
      function estimateCascadeWaveCost(entries) {
        let totalCost = 0;
        let items = 0;
        for (const d of entries) {
          if (d.subsection && d.section !== "capsule") {
            const est = estimateSubsectionCost(d.section, d.subsection);
            if (est) { totalCost += est.cost; items++; }
          } else {
            const est = estimateCost({ sections: [d.section] });
            if (est) { totalCost += est.cost; items++; }
          }
        }
        return items > 0 ? { cost: totalCost, items } : null;
      }

// ───── (отложены из 1.1 сознательно — требуют каскадного анализа) · js:formatWaveCost
// philosynth.html строки 7928–7932 ─────
      function formatWaveCost(est) {
        if (!est) return "";
        return "\nОценка стоимости: ≈ $" + est.cost.toFixed(4) +
          " (" + (est.cost * 100).toFixed(2) + "¢), " + est.items + " запр.";
      }

// ───── updateLiveCascade без неё нечитаем · html:#cascadePanel
// philosynth.html строки 4302–4309 ─────
          <div class="cascade-panel" id="cascadePanel">
            <div class="cascade-title">
              <span>⚡</span>
              <span id="cascadeTitle">Каскад зависимостей</span>
            </div>
            <div class="cascade-desc" id="cascadeDesc"></div>
            <div class="cascade-list" id="cascadeList"></div>
          </div>
