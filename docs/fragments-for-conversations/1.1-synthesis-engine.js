// Фрагменты philosynth.html (26 024 стр., ревизия 2026-07) для беседы 1.1-synthesis-engine
// Сгенерировано extract-fragments.py; при обновлении исходника — перегенерировать.

// ───── [deepMergeUniq] philosynth.html строки 5967–5993 ─────
      function deepMergeUniq(...objects) {
        const allSections = new Set(objects.flatMap(o => Object.keys(o)));
        const result = {};
       
        for (const section of allSections) {
          let required = [];
          let optional  = [];
       
          for (const obj of objects) {
            if (!obj[section]) continue;
            const r   = obj[section].required ?? [];
            const opt = obj[section].optional ?? [];
       
            for (const k of r) {
              if (!required.includes(k)) required.push(k);
              optional = optional.filter(x => x !== k); // повышение: уходит из optional
            }
            for (const k of opt) {
              if (!required.includes(k) && !optional.includes(k)) optional.push(k);
            }
          }
       
          result[section] = { required, optional };
        }
       
        return result;
      }

// ───── [resolveContextDeps] philosynth.html строки 6267–6285 ─────
      function resolveContextDeps(p) {
        const level  = p.synthLevel ?? "comparative";
        const method = p.method     ?? "dialectical";
        const order  = p.generationOrder ?? "architectural";

        if (order === "genetic") {
          return deepMergeUniq(
            CONTEXT_DEPS_GENETIC,
            CONTEXT_DEPS_LEVEL_GENETIC[level] ?? {},
            CONTEXT_DEPS_METHOD[method]       ?? {}  // метод-патчи применимы и к генетическому
          );
        }

        return deepMergeUniq(
          CONTEXT_DEPS_BASE,
          CONTEXT_DEPS_LEVEL[level]   ?? {},
          CONTEXT_DEPS_METHOD[method] ?? {}
        );
      }

// ───── [buildEffectiveDeps] philosynth.html строки 6444–6480 ─────
      function buildEffectiveDeps(selectedSections, resolvedDeps, generationOrder) {
        const available = new Set(["sum", ...selectedSections]);
        const depsSource = resolvedDeps ?? CONTEXT_DEPS_BASE;
        const subMap = (generationOrder === "genetic")
          ? SUBSTITUTION_MAP_GENETIC : SUBSTITUTION_MAP;
        const result = {};

        for (const sec of selectedSections) {
          const base = depsSource[sec];
          if (!base) { result[sec] = { required: [], optional: [] }; continue; }

          const effective = { required: [], optional: [] };

          const resolve = (ctxKey, tier) => {
            const src = sourceOf(ctxKey);
            if (available.has(src)) {
              effective[tier].push(ctxKey);
            } else {
              const sub = findSubstitute(ctxKey, available, sec, subMap);
              if (sub) {
                const subQuality = (subMap[ctxKey] || []).find(c => c.key === sub)?.q ?? 1;
                const effectiveTier = (tier === "required" && subQuality < 3) ? "optional" : tier;
                effective[effectiveTier].push(sub);
              }
            }
          };

          for (const k of base.required)  resolve(k, "required");
          for (const k of base.optional)  resolve(k, "optional");

          result[sec] = {
            required: [...new Set(effective.required)],
            optional: [...new Set(effective.optional)],
          };
        }
        return result;
      }

// ───── [computePredecessors] philosynth.html строки 6486–6499 ─────
      function computePredecessors(effectiveDeps) {
        const preds = {}; // sectionKey → Set<sectionKey>

        for (const [sec, deps] of Object.entries(effectiveDeps)) {
          preds[sec] = new Set();
          for (const ctxKey of [...deps.required, ...deps.optional]) {
            const src = sourceOf(ctxKey);
            if (src !== "sum" && src !== sec) {
              preds[sec].add(src);
            }
          }
        }
        return preds;
      }

// ───── [buildDynamicOrder] philosynth.html строки 6535–6584 ─────
      function buildDynamicOrder(effectiveDeps, selectedSections, resolvedDeps, generationOrder) {
        const TOPO = (generationOrder === "genetic")
          ? SECTION_TOPO_ORDER_GENETIC
          : SECTION_TOPO_ORDER_ARCHITECTURAL;
        const preds = computePredecessors(effectiveDeps);

        // ── Разрываем циклы перед топосортировкой ──────────────────────
        // Мутирует и preds, и effectiveDeps (удаляет weakest optional-ключи).
        // После возврата effectiveDeps актуален для buildContextForSection.
        resolveCircularDeps(preds, effectiveDeps, resolvedDeps);
        // ─────────────────────────────────────────────────────────────────────

        const inDegree = {};
        const adjList  = {};

        for (const sec of selectedSections) {
          inDegree[sec] = 0;
          adjList[sec]  = [];
        }

        for (const [sec, predSet] of Object.entries(preds)) {
          for (const pred of predSet) {
            if (!selectedSections.includes(pred)) continue;
            adjList[pred].push(sec);
            inDegree[sec]++;
          }
        }

        const queue = selectedSections
          .filter(s => inDegree[s] === 0)
          .sort((a, b) => TOPO[a] - TOPO[b]);
        const order = [];

        while (queue.length) {
          const node = queue.shift();
          order.push(node);
          const succs = (adjList[node] || [])
            .sort((a, b) => TOPO[a] - TOPO[b]);
          for (const succ of succs) {
            inDegree[succ]--;
            if (inDegree[succ] === 0) {
              const pos = queue.findIndex(q => TOPO[q] > TOPO[succ]);
              if (pos === -1) queue.push(succ);
              else queue.splice(pos, 0, succ);
            }
          }
        }

        return ["sum", ...order];
      }

// ───── [resolveCircularDeps] philosynth.html строки 6929–6958 ─────
      function resolveCircularDeps(predecessors, effectiveDeps, resolvedDeps) {
        // Верхняя граница итераций = количество рёбер (каждая итерация удаляет хотя бы одно)
        const maxIter = Object.values(predecessors).reduce((s, p) => s + p.size, 0);

        for (let i = 0; i < maxIter; i++) {
          const cycle = findOneCycle(predecessors);
          if (!cycle) break; // циклов нет — готово

          // Ищем ребро с минимальным качеством
          let weakestEdge = null, weakestQ = Infinity;
          for (let j = 0; j < cycle.length; j++) {
            const to   = cycle[j];
            const from = cycle[(j + 1) % cycle.length];
            const q = getEdgeQuality(from, to, effectiveDeps, resolvedDeps);
            if (q < weakestQ) { weakestQ = q; weakestEdge = [from, to]; }
          }

          if (weakestEdge) {
            removeEdge(weakestEdge[0], weakestEdge[1], predecessors, effectiveDeps);
          } else {
            // Все рёбра — оригинальные зависимости (q=10/Infinity).
            // Такое возможно только если пользователь выбрал набор, где два раздела
            // являются оригинальными required-зависимостями друг друга.
            // Разрываем последнее ребро цикла как крайний fallback.
            removeEdge(cycle[0], cycle[cycle.length - 1], predecessors, effectiveDeps);
          }
        }

        return predecessors;
      }

// ───── [findOneCycle] philosynth.html строки 6886–6919 ─────
      function findOneCycle(predecessors) {
        const WHITE = 0, GRAY = 1, BLACK = 2;
        const color = {};
        for (const n of Object.keys(predecessors)) color[n] = WHITE;

        let foundCycle = null;

        function dfs(node, path) {
          if (foundCycle) return;
          color[node] = GRAY;
          path.push(node);

          for (const pred of [...(predecessors[node] || [])]) {
            if (foundCycle) return;
            if (color[pred] === GRAY) {
              // pred уже в текущем пути — цикл найден
              const idx = path.indexOf(pred);
              foundCycle = path.slice(idx); // [pred, ..., node] — последнее ребро node→pred замыкает цикл
              return;
            }
            if (color[pred] === WHITE) dfs(pred, path);
          }

          path.pop();
          color[node] = BLACK;
        }

        for (const node of Object.keys(predecessors)) {
          if (color[node] === WHITE) dfs(node, []);
          if (foundCycle) break;
        }

        return foundCycle;
      }

// ───── [getEdgeQuality] philosynth.html строки 6844–6865 ─────
      function getEdgeQuality(fromSection, toSection, effectiveDeps, resolvedDeps) {
        const deps = effectiveDeps[toSection];
        if (!deps) return Infinity;

        const allKeys = [...deps.required, ...deps.optional];
        const edgeKeys = allKeys.filter(k => sourceOf(k) === fromSection);
        if (!edgeKeys.length) return Infinity;

        let minQ = Infinity;
        for (const k of edgeKeys) {
          const origDeps = (resolvedDeps ?? CONTEXT_DEPS_BASE)[toSection];
          const isOriginal = origDeps &&
            [...origDeps.required, ...origDeps.optional].includes(k);
          if (isOriginal) {
            minQ = Math.min(minQ, 10); // оригинальная зависимость — высокая цена удаления
          } else {
            const q = getSubstituteQuality(k) ?? 1;
            minQ = Math.min(minQ, q);
          }
        }
        return minQ;
      }

// ───── [removeEdge] philosynth.html строки 6867–6884 ─────
      function removeEdge(fromSection, toSection, predecessors, effectiveDeps) {
        predecessors[toSection].delete(fromSection);

        const deps = effectiveDeps[toSection];
        if (!deps) return;

        // Удаляем из optional все ключи с источником fromSection
        deps.optional = deps.optional.filter(k => sourceOf(k) !== fromSection);

        // required-ключи с источником fromSection — это оригинальные зависимости (q=10),
        // до которых дошла очередь только при отсутствии других вариантов.
        // Переносим их в optional, не удаляем полностью (контекст ценен, просто не блокирует порядок).
        const reqFromSrc = deps.required.filter(k => sourceOf(k) === fromSection);
        if (reqFromSrc.length) {
          deps.required  = deps.required.filter(k => sourceOf(k) !== fromSection);
          deps.optional  = [...deps.optional, ...reqFromSrc];
        }
      }

// ───── [findSubstitute] philosynth.html строки 6423–6432 ─────
      function findSubstitute(ctxKey, available, selfSection, substitutionMap) {
        const map = substitutionMap || SUBSTITUTION_MAP;
        const candidates = map[ctxKey] || [];
        // Берём первый (наивысшее качество), чей источник доступен и не является selfSection
        for (const { key } of candidates) {
          const src = sourceOf(key);
          if (src !== selfSection && available.has(src)) return key;
        }
        return null;
      }

// ───── [computeSectionRating] philosynth.html строки 7245–7245 ─────
      function computeSectionRating(section, severity, method, overrides = {}) {

// ───── [getCompatEntry] philosynth.html строки 7298–7305 ─────
      function getCompatEntry(level, method) {
        const entry = COMPAT_MATRIX_COMPACT[`${level}:${method}`];
        if (!entry) return null;
        return {
          ...entry,
          sections: computeSections(entry.severity, method, entry.sections_override),
        };
      }

// ───── [getCompatEntryByKey] philosynth.html строки 7312–7315 ─────
      function getCompatEntryByKey(key) {
        const [level, method] = key.split(":");
        return getCompatEntry(level, method);
      }

// ───── [computeSectionWarnings] philosynth.html строки 6616–6629 ─────
      function computeSectionWarnings(resolvedDeps) {
        const warnings = {};
        for (const [sec, deps] of Object.entries(resolvedDeps)) {
          const secId = "sec" + sec.charAt(0).toUpperCase() + sec.slice(1);
          const needs = [...new Set(
            deps.required
              .map(k => sourceOf(k))
              .filter(src => src !== "sum")
              .map(src => "sec" + src.charAt(0).toUpperCase() + src.slice(1))
          )];
          warnings[secId] = { needs, label: SECTION_LABELS[secId] ?? sec };
        }
        return warnings;
      }

// ───── [updateSectionWarnings] philosynth.html строки 6645–6832 ─────
      function updateSectionWarnings() {
        const warBox = document.getElementById("secWarnings");
        const recBox = document.getElementById("secRecommendations");
        const subBox = document.getElementById("secSubstitutions");
        const warnings = [];
        const recommendations = [];
        const substitutions = [];

        const secIdToKey = {
          secGraph:     "graph",
          secGlossary:  "glossary",
          secTheses:    "theses",
          secHistory:   "history",
          secName:      "name",
          secPractical: "practical",
          secDialogue:  "dialogue",
          secEvolution: "evolution",
          secCritique:  "critique",
          secOrigin:    "origin",
          secCapsule:   "capsule",
        };

        const _resolvedForWarnings = _getResolvedDepsFromDOM();
        const sectionWarnings = computeSectionWarnings(_getResolvedDepsFromDOM());

        // ── 1. Предупреждения о зависимостях между разделами ─────────────────
        for (const [secId, cfg] of Object.entries(sectionWarnings)) {
          const el = document.getElementById(secId);
          if (!el || !el.checked || cfg.needs.length === 0) continue;
          const missing = cfg.needs.filter(depId => {
            const depEl = document.getElementById(depId);
            return !depEl || !depEl.checked;
          });
          if (missing.length > 0) {
            const missingNames = missing.map(id => "«" + SECTION_LABELS[id] + "»").join(", ");
            const word = missing.length === 1 ? "раздела" : "разделов";
            warnings.push(
              '<div class="sec-warning-item"><span class="warn-icon">⚠</span>' +
              '<span>Без ' + word + ' ' + missingNames + ' раздел «' + cfg.label + '» будет ненадлежащего качества!</span></div>'
            );
          }
        }

        // ── 2. Предупреждения: конфликт параметров для конкретных разделов ───
        const level = document.getElementById("synthesisLevel").value;
        const method = document.getElementById("synthesisMethod").value;
        const compatKey = level + ":" + method;
        const compatEntry = typeof getCompatEntryByKey !== "undefined" ? getCompatEntryByKey(compatKey) : null;

        if (compatEntry) {
          for (const [secId, secKey] of Object.entries(secIdToKey)) {
            const el = document.getElementById(secId);
            if (!el || !el.checked) continue;
            const secRating = compatEntry.sections[secKey];
            if (secRating === "✗✗") {
              const secLabel = SECTION_LABELS[secId] || secKey;
              warnings.push(
                '<div class="sec-warning-item" style="border-color:var(--red);background:#fff0f0;color:var(--red);">' +
                '<span class="warn-icon">✗✗</span>' +
                '<span>Раздел «' + secLabel + '» имеет жёсткий конфликт (✗✗) с текущей комбинацией ' +
                SL[level] + ' × ' + ML[method] + '. Результат будет содержать противоречивые директивы!</span></div>'
              );
            } else if (secRating === "✗") {
              const secLabel = SECTION_LABELS[secId] || secKey;
              warnings.push(
                '<div class="sec-warning-item" style="border-color:#c44;background:#fff5f5;color:#c44;">' +
                '<span class="warn-icon">✗</span>' +
                '<span>Раздел «' + secLabel + '» имеет умеренный конфликт (✗) с текущей комбинацией ' +
                SL[level] + ' × ' + ML[method] + '. Рекомендуется исключить этот раздел или изменить параметры.</span></div>'
              );
            }
          }
        }

        // ── 3. Мягкие рекомендации: необязательный контекст из CONTEXT_DEPS ──
        if (typeof resolveContextDeps !== "undefined") {
          const contextKeyToSecId = {
            graph: "secGraph", glossary: "secGlossary", theses: "secTheses",
            name: "secName", history: "secHistory", practical: "secPractical",
            dialogue: "secDialogue", evolution: "secEvolution", critique: "secCritique",
            origin: "secOrigin",
          };

          const secIdToDepKey = {
            secGraph: "graph", secGlossary: "glossary", secTheses: "theses",
            secHistory: "history", secName: "name", secPractical: "practical",
            secDialogue: "dialogue", secEvolution: "evolution", secCritique: "critique",
            secOrigin: "origin",
          };

          const benefitMap = {};

          for (const [secId, depKey] of Object.entries(secIdToDepKey)) {
            const el = document.getElementById(secId);
            if (!el || !el.checked) continue;

            const deps = _resolvedForWarnings[depKey];
            if (!deps || !deps.optional || deps.optional.length === 0) continue;

            for (const optKey of deps.optional) {
              const parentSection = optKey.split(":")[0];
              if (parentSection === "sum") continue;

              const parentSecId = contextKeyToSecId[parentSection];
              if (!parentSecId) continue;

              const parentEl = document.getElementById(parentSecId);
              if (parentEl && parentEl.checked) continue;

              const sectionWarningCfg = sectionWarnings[secId];
              if (sectionWarningCfg && sectionWarningCfg.needs.includes(parentSecId)) continue;

              if (!benefitMap[parentSecId]) benefitMap[parentSecId] = [];
              const consumerLabel = SECTION_LABELS[secId] || depKey;
              if (!benefitMap[parentSecId].includes(consumerLabel)) {
                benefitMap[parentSecId].push(consumerLabel);
              }
            }
          }

          for (const [srcSecId, consumers] of Object.entries(benefitMap)) {
            const srcLabel = SECTION_LABELS[srcSecId] || srcSecId;
            const consumerList = consumers.map(c => "«" + c + "»").join(", ");
            const word = consumers.length === 1 ? "раздела" : "разделов";
            recommendations.push(
              '<div class="sec-recommend-item">' +
              '<span class="rec-icon">💡</span>' +
              '<span>Включение «' + srcLabel + '» может улучшить качество ' + word + ' ' + consumerList +
              ' (дополнительный контекст).</span></div>'
            );
          }
        }

        // ── 4. Уведомления о подстановках контекста ──────────────────────────
        if (typeof buildEffectiveDeps !== "undefined") {
          const currentSections = Object.entries(secIdToKey)
            .filter(([id]) => document.getElementById(id)?.checked)
            .map(([, k]) => k);

          // Deep-clone, чтобы resolveCircularDeps не мутировал оригинал
          const effDeps = buildEffectiveDeps(currentSections, _getResolvedDepsFromDOM(), DOC_STATE.params?.generationOrder);
          const effDepsClone = {};
          for (const [k, v] of Object.entries(effDeps)) {
            effDepsClone[k] = {
              required: [...v.required],
              optional: [...v.optional],
            };
          }
          const predsClone = computePredecessors(effDepsClone);
          resolveCircularDeps(predsClone, effDepsClone, _resolvedForWarnings);

          // Используем effDepsClone (после разрешения циклов) для уведомлений
          const resolvedEffDeps = effDepsClone;

          for (const [sec, deps] of Object.entries(resolvedEffDeps)) {
            const originalDeps = _resolvedForWarnings[sec];
            // Множество всех ключей в оригинальных deps — и required, и optional
            const origAllKeys = new Set([
              ...(originalDeps?.required || []),
              ...(originalDeps?.optional || []),
            ]);

            // Перебираем и required, и optional из effectiveDeps
            for (const ctxKey of [...deps.required, ...deps.optional]) {
              // Если ключ присутствует в оригинале — это не замена, пропускаем
              if (origAllKeys.has(ctxKey)) continue;

              const q = getSubstituteQuality(ctxKey); // один аргумент
              const qLabel = q === 3 ? "равноценная замена"
                           : q === 2 ? "частичная замена"
                           :           "слабая замена";
              const secLabel = SECTION_LABELS[
                "sec" + sec.charAt(0).toUpperCase() + sec.slice(1)
              ] || sec;
              substitutions.push(
                `<div class="sec-substituted-item">` +
                `<span class="rec-icon">⇄</span>` +
                `<span>«${secLabel}»: контекст «${CTX_LABELS[ctxKey] || ctxKey}» ` +
                `используется как ${qLabel} для недостающего контекста.</span></div>`
              );
            }
          }
        }

        warBox.innerHTML = warnings.join("");
        if (recBox) recBox.innerHTML = recommendations.join("");
        if (subBox) subBox.innerHTML = substitutions.join("");
      }

// ───── [estimateCost] philosynth.html строки 7634–7799 ─────
      function estimateCost(opts) {
        const isEdit = opts && opts.sections && opts.sections.length > 0;

        // ── Параметры ──
        let p, effectiveDeps, targetKeys;

        if (isEdit) {
          p = DOC_STATE.params;
          if (!p || (!p.phil?.length && !p.seed)) return null;
          effectiveDeps = DOC_STATE.effectiveDeps || {};
          targetKeys = opts.sections;
          // Временно дополняем p.sec добавляемыми разделами,
          // чтобы buildSectionDefs создал для них определения
          const tempSec = new Set(p.sec);
          for (const k of targetKeys) tempSec.add(k);
          p = { ...p, sec: [...tempSec] };

          // Пересчитываем effectiveDeps с учётом добавляемых
          effectiveDeps = buildEffectiveDeps(p.sec, resolveContextDeps(p), p.generationOrder);
        } else {
          const phil       = getPhil();
          const sec        = getSec();
          const method     = document.getElementById("synthesisMethod").value;
          const depth      = document.getElementById("depthLevel").value;
          const synthLevel = document.getElementById("synthesisLevel").value;
          const seed       = document.getElementById("seedInput").value.trim();
          const ctx        = document.getElementById("contextInput").value.trim();
          if (!phil.length && !_conceptParticipants.length && !seed) return null;

          p = { seed, phil, sec, method, depth, synthLevel, ctx, lang: GEN_LANG };
          p.secCtx = getSecCtxMap();
          p.participants = [
            ...phil.map(name => ({ type: "philosopher", name })),
            ..._conceptParticipants,
          ];
          p.phil = p.participants.map(x =>
            x.type === "philosopher" ? x.name : "«" + x.name + "»"
          );
          p.isMetaSynthesis = _conceptParticipants.length > 0;
          effectiveDeps = buildEffectiveDeps(p.sec, resolveContextDeps(p), p.generationOrder);
          const dynamicOrder = buildDynamicOrder(effectiveDeps, p.sec, resolveContextDeps(p), p.generationOrder);
          p.sec = dynamicOrder.filter(k => k !== "sum");
          targetKeys = dynamicOrder; // все разделы, включая sum
        }

        // ── Определения разделов ──
        const baseDefs = buildSectionDefs(p);
        patchPromptsWithSecCtx(baseDefs, p.secCtx);
        const defsMap = Object.fromEntries(baseDefs.map(d => [d.key, d]));

        let secNum = 1;
        const defs = targetKeys.map(key => {
          const d = { ...defsMap[key] };
          if (!d.key) d.key = key;
          // При редактировании — сохраняем номер из DOC_STATE
          if (isEdit && DOC_STATE.sectionDefs[key]) {
            d.num = DOC_STATE.sectionDefs[key].num;
          } else {
            d.num = secNum++;
          }
          return d;
        }).filter(d => d.prompt); // отсекаем разделы без промпта (если key не найден в defs)

        const passes = groupPasses(defs);

        // ── Фиксированные части промпта ──
        const sysChars = genCommon?.sysChars || buildSYS(DOC_STATE.params).length;
        const baseChars    = genCommon?.baseChars     || baseCtx(p).length;
        const scaffoldChars = genCommon?.scaffoldChars ||
          `ПАРАМЕТРЫ СИНТЕЗА:\n\n\nЗАДАНИЕ: составь ТОЛЬКО следующие разделы (строго в указанном порядке, без добавления других):\n\n\n\n`.length;

        const _baseBudget0 = CONTEXT_BUDGET[p.depth] || 48000;
        // При явно переданном opts — уважаем его. Иначе — чекбокс
        // как user-facing источник истины (а не замороженный флаг из
        // DOC_STATE.params прошлой генерации).
        const _estKeepFullBudget = (opts && typeof opts.keepFullBudget === "boolean")
          ? opts.keepFullBudget
          : _currentKeepFullBudget();
        const _estParticipants = (DOC_STATE.participants || p.participants || []);
        const _estOrder = p.generationOrder || "architectural";
        const _estSynthLevel = p.synthLevel || "comparative";
        const _estMethod = p.method || "dialectical";

        // ── Оценка выхода каждого раздела ──
        const estimatedOutput = {};
        for (const def of defs) {
          const mult = SECTION_OUTPUT_MULT[def.key] ?? SECTION_OUTPUT_MULT._default;
          estimatedOutput[def.key] = Math.round(
            mw(p) * mult * WORDS_TO_CHARS * HTML_OVERHEAD * OUTPUT_MULTIPLIER
          );
        }

        // При редактировании: фактические размеры уже сгенерированных разделов
        // (используются для оценки контекста — сколько символов даст источник)
        if (isEdit) {
          for (const g of genLog) {
            if (g.status === "done" && g.outputChars > 0 && !opts.sections.includes(g.sectionKey)) {
              estimatedOutput[g.sectionKey] = g.outputChars;
            }
          }
        }

        // ── Суммирование ──
        let totalInChars  = 0;
        let totalOutChars = 0;

        // baseChars здесь — легаси-значение (static + full-monolithic). При селективности
        // берём только статическую часть; parentOverhead суммируется per-section.
        const _baseStaticChars = hasConceptParticipants(p)
          ? baseCtxStatic(p).length
          : baseChars;

        for (let i = 0; i < passes.length; i++) {
          const pass = passes[i];
          const needsContext = isEdit
            ? pass.some(d => d.key !== "sum")
            : i > 0;

          // Соответствие runtime (_runGenPassesFromIdx): partBase собирается
          // один раз на весь pass через pass[0].key. passParentOverhead и
          // budget вычисляются по репрезентативному ключу (pass[0]).
          const _passKey = pass[0].key;
          const passParentOverhead = parentOverheadForSection(
            _estParticipants, _passKey, _estOrder, _estSynthLevel, _estMethod);
          const baseWithCritic = (_passKey === "critique")
            ? Math.floor(_baseBudget0 * 1.5) : _baseBudget0;
          const { effectiveBudget: budgetForPass } = applyBudgetPressure(
            baseWithCritic, passParentOverhead, _estKeepFullBudget);

          // contextChars складывается по def (как было в оригинале — это
          // верхняя оценка, затем ограничивается общим pass-бюджетом).
          let contextChars = 0;
          if (needsContext) {
            for (const def of pass) {
              if (def.key === "sum") continue;
              const deps = effectiveDeps[def.key];
              if (!deps) continue;
              for (const ctxKey of [...(deps.required || []), ...(deps.optional || [])]) {
                const src = sourceOf(ctxKey);
                const srcOutput = estimatedOutput[src];
                if (!srcOutput) continue;
                const share = FRAGMENT_SHARE[ctxKey] ?? 0.25;
                contextChars += Math.round(srcOutput * share);
              }
            }
            contextChars = Math.min(contextChars, budgetForPass);
          }

          const sectionPromptsChars = pass.reduce(
            (s, d) => s + (d.prompt?.length || 0) + (d.title?.length || 0) + 20, 0
          );

          const passInChars = sysChars + _baseStaticChars + passParentOverhead + contextChars
                  + sectionPromptsChars + scaffoldChars;
          totalInChars += passInChars;

          for (const def of pass) {
            totalOutChars += estimatedOutput[def.key] || 0;
          }
        }

        const inTokens  = Math.ceil(totalInChars  / CHARS_PER_TOKEN);
        const outTokens = Math.ceil(totalOutChars / CHARS_PER_TOKEN);
        const cost = inTokens * PRICE_IN + outTokens * PRICE_OUT;
        return { inTokens, outTokens, cost, passes: passes.length };
      }

// ───── [estimateSubsectionCost] philosynth.html строки 7807–7905 ─────
      function estimateSubsectionCost(sectionKey, subsectionName) {
        const def = DOC_STATE.sectionDefs?.[sectionKey];
        if (!def?.parts) return null;
        const p = DOC_STATE.params;
        if (!p) return null;

        // ── Системные и базовые элементы ──
        // SYS для подраздела короче (subsection-режим), учитываем это в оценке.
        const sysChars = genCommon?.sysChars || buildSYS(p, { outputMode: "subsection" }).length;
        const baseChars = genCommon?.baseChars || baseCtx(p).length;

        // ── Промпт подраздела (serializeSubsectionRegen) ──
        // Включает: preamble_short + shared/bridge блоки + body подраздела + note_after
        const sub = def.parts.subsections.find(s => s.name === subsectionName);
        let subPromptChars = (def.parts.preamble_short || "").length
          + (subsectionName.length + 80)
          + (sub?.body?.length || 200)
          + (def.parts.postamble_short || "").length;

        // Shared/bridge блоки
        const subIdx = def.parts.subsections.indexOf(sub);
        for (let i = 0; i < def.parts.subsections.length; i++) {
          const item = def.parts.subsections[i];
          if (item.type === "shared" && item.scope?.includes(subsectionName)) {
            subPromptChars += (item.body?.length || 0);
          } else if (item.type === "bridge" && i < subIdx) {
            subPromptChars += (item.body?.length || 0);
          }
        }

        // ── Intra-section контекст (текст других подразделов того же раздела) ──
        // Входит в subPrompt как КОНТЕКСТ ДРУГИХ ПОДРАЗДЕЛОВ
        // Берём фактический размер раздела из genLog, если доступен
        const sectionGenEntry = genLog.findLast(g =>
          g.sectionKey === sectionKey && g.status === "done" && g.outputChars > 0
        );
        const sectionOutputChars = sectionGenEntry?.outputChars
          || Math.round(mw(p) * (SECTION_OUTPUT_MULT[sectionKey] ?? SECTION_OUTPUT_MULT._default)
                        * WORDS_TO_CHARS * HTML_OVERHEAD * OUTPUT_MULTIPLIER);

        // Intra-контекст ≈ весь раздел минус целевой подраздел (с сжатием ~0.6)
        const subsections = def.parts.subsections.filter(s => s.name);
        const subCount = Math.max(subsections.length, 1);
        const intraSectionEstimate = Math.round(sectionOutputChars * (1 - 1 / subCount) * 0.4);
        subPromptChars += intraSectionEstimate;

        // ── Prior контекст (из предыдущих разделов) ──
        // Используем тот же подход, что и estimateCost: FRAGMENT_SHARE + фактические размеры
        let baseBudget = CONTEXT_BUDGET[p.depth] || 48000;
        if (sectionKey === "critique") baseBudget = Math.floor(baseBudget * 1.5);
        // Приоритет чекбокса (см. hotfix2)
        const _subKeepFull = _currentKeepFullBudget();
        const _subParticipants = DOC_STATE.participants || [];
        const _subOrder = p.generationOrder || "architectural";
        const _subSynthLevel = p.synthLevel || "comparative";
        const _subMethod = p.method || "dialectical";
        const _subParentOverhead = parentOverheadForSection(
          _subParticipants, sectionKey, _subOrder,
          _subSynthLevel, _subMethod, subsectionName
        );
        const { effectiveBudget: budget } = applyBudgetPressure(
          baseBudget, _subParentOverhead, _subKeepFull);

        const effectiveDeps = DOC_STATE.effectiveDeps || {};
        const deps = effectiveDeps[sectionKey];
        let priorCtxEstimate = 0;
        if (deps) {
          const allKeys = [...(deps.required || []), ...(deps.optional || [])];
          for (const ctxKey of allKeys) {
            const src = sourceOf(ctxKey);
            // Фактический размер из genLog (приоритет) или оценка
            const srcEntry = genLog.findLast(g =>
              g.sectionKey === src && g.status === "done" && g.outputChars > 0
            );
            const srcOutput = srcEntry?.outputChars
              || Math.round(mw(p) * (SECTION_OUTPUT_MULT[src] ?? SECTION_OUTPUT_MULT._default)
                            * WORDS_TO_CHARS * HTML_OVERHEAD * OUTPUT_MULTIPLIER);
            const share = FRAGMENT_SHARE[ctxKey] ?? 0.25;
            priorCtxEstimate += Math.round(srcOutput * share);
          }
          priorCtxEstimate = Math.min(priorCtxEstimate, budget);
        }

        const _subBaseStaticChars = hasConceptParticipants(p)
          ? baseCtxStatic(p).length : baseChars;
        const totalInChars = sysChars + _subBaseStaticChars + _subParentOverhead
                           + subPromptChars + priorCtxEstimate;

        // ── Выход: подраздел ≈ 1/N от полного раздела ──
        const sectionMult = SECTION_OUTPUT_MULT[sectionKey] ?? SECTION_OUTPUT_MULT._default;
        const fullSectionOutput = mw(p) * sectionMult * WORDS_TO_CHARS * HTML_OVERHEAD * OUTPUT_MULTIPLIER;
        const subShare = 1 / subCount;
        const totalOutChars = Math.round(fullSectionOutput * subShare);

        const inTokens = Math.ceil(totalInChars / CHARS_PER_TOKEN);
        const outTokens = Math.ceil(totalOutChars / CHARS_PER_TOKEN);
        const cost = inTokens * PRICE_IN + outTokens * PRICE_OUT;
        return { inTokens, outTokens, cost };
      }

// ───── [estimateModeCost] philosynth.html строки 22748–22779 ─────
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
