// Фрагменты philosynth.html (26 024 стр., ревизия 2026-07) для беседы 3.1-meta-synthesis
// Сгенерировано extract-fragments.py; при обновлении исходника — перегенерировать.

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

// ───── [checkGenealogyOverlaps] philosynth.html строки 22467–22509 ─────
    function checkGenealogyOverlaps(participants) {
      const warnings = [];
      const ancestorSets = participants
        .filter(p => p.type === "concept")
        .map(p => ({
          name: p.name,
          ancestors: collectPhilosopherAncestors(p.genealogy),
        }));

      // Пересечение концепций с концепциями
      for (let i = 0; i < ancestorSets.length; i++) {
        for (let j = i + 1; j < ancestorSets.length; j++) {
          const overlap = [...ancestorSets[i].ancestors]
            .filter(a => ancestorSets[j].ancestors.has(a));
          if (overlap.length > 0) {
            warnings.push({
              level: "info",
              text: "Концепции «" + ancestorSets[i].name + "» и «" +
                    ancestorSets[j].name + "» имеют общих предков: " +
                    overlap.join(", ") + ". Это может привести к доминированию их позиций.",
            });
          }
        }
      }

      // Пересечение концепций с выбранными философами
      const selectedPhils = new Set(
        participants.filter(p => p.type === "philosopher").map(p => p.name)
      );
      for (const cs of ancestorSets) {
        const overlap = [...cs.ancestors].filter(a => selectedPhils.has(a));
        if (overlap.length > 0) {
          warnings.push({
            level: "warn",
            text: "Философ(ы) " + overlap.join(", ") +
                  " выбран(ы) для синтеза и одновременно присутствуют в генеалогии " +
                  "концепции «" + cs.name + "». Их влияние будет удвоено.",
          });
        }
      }

      return warnings;
    }

// ───── [collectPhilosopherAncestors] philosynth.html строки 22451–22461 ─────
    function collectPhilosopherAncestors(node) {
      const result = new Set();
      if (!node) return result;
      if (node.type === "philosopher") { result.add(node.name); return result; }
      for (const p of (node.participants || [])) {
        for (const name of collectPhilosopherAncestors(p)) {
          result.add(name);
        }
      }
      return result;
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

// ───── [isPlaceholderConceptName] philosynth.html строки 22228–22237 ─────
      function isPlaceholderConceptName(s) {
        if (!s) return true;
        const t = String(s).trim();
        if (!t) return true;
        if (t === "?" || t === "—" || t === "-") return true;
        // Регистронезависимое сравнение с дефолтом UI
        if (t.toLowerCase() === "синтез философской концепции") return true;
        if (t.toLowerCase() === "импортированный документ") return true;
        return false;
      }

// ───── [resolveConceptName] philosynth.html строки 22248–22286 ─────
      function resolveConceptName(doc) {
        const titleEl = (doc && doc.getElementById)
          ? doc.getElementById("docTitle")
          : document.getElementById("docTitle");
        const rawTitle = titleEl?.textContent?.trim() || "";
        if (!isPlaceholderConceptName(rawTitle)) return rawTitle;

        // Ищем секцию «name» и внутри — раздел «итогов/рекоменд», как
        // делает updateDocTitleFromName. Источник — DOM импортируемого doc.
        const scope = doc || document;
        // Секции помечены data-section-key
        let nameContainer = null;
        const bodyEls = scope.querySelectorAll?.(".doc-body[data-section-key]");
        if (bodyEls) {
          for (const el of bodyEls) {
            const keys = (el.getAttribute("data-section-key") || "").split("+");
            if (keys.includes("name")) { nameContainer = el; break; }
          }
        }
        if (!nameContainer) return null;

        const divs = nameContainer.querySelectorAll("div[data-section]");
        let recSection = null;
        for (const div of divs) {
          const sec = (div.getAttribute("data-section") || "").toLowerCase();
          if (sec.includes("итогов") || sec.includes("рекоменд")) { recSection = div; break; }
        }
        const strong = recSection
          ? recSection.querySelector("strong")
          : nameContainer.querySelector("strong");
        let nameText = strong?.textContent?.trim() || "";
        if (!nameText) return null;
        nameText = nameText
          .replace(/^(?:итогов\w+\s+рекомендаци\w*|рекомендуем\w+\s+названи\w*|названи\w+\s*концепци\w*)\s*[:：]\s*/i, "")
          .replace(/^[«""]|[»""]$/g, "")
          .split(/\s*[:：]\s*/)[0]
          .trim();
        return nameText || null;
      }

// ───── [conceptContextBlockFull] philosynth.html строки 10233–10258 ─────
      function conceptContextBlockFull(p) {
        if (!hasConceptParticipants(p)) return "";
        const concepts = p.participants.filter(x => x.type === "concept");
        const blocks = concepts.map(c => {
          const parts = [];
          parts.push("═══ КОНЦЕПЦИЯ-УЧАСТНИК: «" + c.name + "» ═══");
          parts.push("Метод: " + (ML[c.method] || c.method) +
                     " · Уровень: " + (SL[c.synthLevel] || c.synthLevel));
          if (c.seed) parts.push("Зерно: " + c.seed);
          parts.push("");
          if (c.capsule)           { parts.push("КАПСУЛА:");                        parts.push(c.capsule);           parts.push(""); }
          if (c.goals)             { parts.push("ЦЕЛИ И МЕТОД:");                   parts.push(c.goals);             parts.push(""); }
          if (c.tensions)          { parts.push("НАПРЯЖЕНИЯ:");                     parts.push(c.tensions);          parts.push(""); }
          if (c.graphNodes)        { parts.push("КАТЕГОРИИ (из графа):");           parts.push(c.graphNodes);        parts.push(""); }
          if (c.dialogueConcepts)  { parts.push("ПОНЯТИЯ (из диалога):");           parts.push(c.dialogueConcepts);  parts.push(""); }
          if (c.glossaryCompact)   { parts.push("ТЕРМИНЫ:");                        parts.push(c.glossaryCompact);   parts.push(""); }
          if (c.thesesSummary)     { parts.push("ТЕЗИСЫ:");                         parts.push(c.thesesSummary);     parts.push(""); }
          if (c.dialogueSynthesis) { parts.push("АНАЛИТИЧЕСКИЙ КОММЕНТАРИЙ К ДИАЛОГУ:"); parts.push(c.dialogueSynthesis); }
          return parts.join("\n");
        });
        return "\n\nКОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ СИНТЕЗА " +
               "(каждая — результат предыдущего синтеза; обращайся с ней " +
               "как с полноценной философской позицией, у которой есть " +
               "собственные категории, тезисы и внутренняя логика):\n\"\"\"\n" +
               blocks.join("\n\n") + "\n\"\"\"";
      }

// ───── [conceptContextBlockSelective] philosynth.html строки 10260–10300 ─────
      function conceptContextBlockSelective(p, sectionKey, explicitSpec) {
        if (!hasConceptParticipants(p)) return "";
        const concepts = p.participants.filter(x => x.type === "concept");
        if (concepts.length === 0) return "";
        const key = String(sectionKey || "").split("+")[0].split(":")[0];
        let spec;
        if (explicitSpec && (Array.isArray(explicitSpec.required) || Array.isArray(explicitSpec.optional))) {
          // Явный spec (например, из resolveParentDepsForSubsection для
          // подраздельной регенерации в мета-режиме) — используем как есть.
          spec = explicitSpec;
        } else {
          const deps = resolveParentDeps(p);
          spec = deps[key];
          if (!spec) console.warn("PARENT_DEPS: нет записи для «" + key + "» — минимум (capsule).");
        }
        const reqFields = (spec && spec.required) || ["capsule"];
        const optFields = (spec && spec.optional) || [];
        const includeSet = new Set([...reqFields, ...optFields]);
        const blocks = concepts.map(c => {
          const parts = [];
          parts.push("═══ КОНЦЕПЦИЯ-УЧАСТНИК: «" + c.name + "» ═══");
          parts.push("Метод: " + (ML[c.method] || c.method) +
                     " · Уровень: " + (SL[c.synthLevel] || c.synthLevel));
          if (c.seed) parts.push("Зерно: " + c.seed);
          parts.push("");
          for (const fld of PARENT_FIELD_ORDER) {
            if (!includeSet.has(fld)) continue;
            const val = c[fld];
            if (!val) continue;
            parts.push(PARENT_FIELD_LABELS[fld] + ":");
            parts.push(val);
            parts.push("");
          }
          return parts.join("\n").replace(/\n{3,}/g, "\n\n");
        });
        return "\n\nКОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ СИНТЕЗА " +
               "(каждая — результат предыдущего синтеза; обращайся с ней " +
               "как с полноценной философской позицией, у которой есть " +
               "собственные категории, тезисы и внутренняя логика):\n\"\"\"\n" +
               blocks.join("\n\n") + "\n\"\"\"";
      }

// ───── [resolveParentDeps] philosynth.html строки 10092–10109 ─────
      function resolveParentDeps(p) {
        const order  = (p && p.generationOrder) || "architectural";
        const level  = (p && p.synthLevel)      || "comparative";
        const method = (p && p.method)          || "dialectical";
        if (order === "genetic") {
          return deepMergeUniq(
            PARENT_DEPS_BASE,
            PARENT_DEPS_GENETIC,
            PARENT_DEPS_LEVEL_GENETIC[level] ?? {},
            PARENT_DEPS_METHOD[method]       ?? {}
          );
        }
        return deepMergeUniq(
          PARENT_DEPS_BASE,
          PARENT_DEPS_LEVEL[level]   ?? {},
          PARENT_DEPS_METHOD[method] ?? {}
        );
      }

// ───── [resolveParentDepsForSubsection] philosynth.html строки 10114–10131 ─────
      function resolveParentDepsForSubsection(p, sectionKey, subsectionName) {
        const key = String(sectionKey || "").split("+")[0].split(":")[0];
        const secDeps = resolveParentDeps(p)[key]
                     || { required: ["capsule"], optional: [] };
        const intra = PARENT_INTRA_DEPS?.[key]?.[subsectionName];
        if (!intra) return secDeps;
        const hasR = Array.isArray(intra.required);
        const hasO = Array.isArray(intra.optional);
        if (!hasR && !hasO) return secDeps;  // явный {} — полный section
        const secAll = new Set([
          ...(secDeps.required || []),
          ...(secDeps.optional || []),
        ]);
        return {
          required: (intra.required || []).filter(f => secAll.has(f)),
          optional: (intra.optional || []).filter(f => secAll.has(f)),
        };
      }

// ───── [parentFieldsUsedFor] philosynth.html строки 10182–10195 ─────
      function parentFieldsUsedFor(p, sectionKey, subsectionName) {
        const concepts = (p && p.participants || []).filter(x => x.type === "concept");
        if (concepts.length === 0) return [];
        const key = String(sectionKey || "").split("+")[0].split(":")[0];
        const spec = subsectionName
          ? resolveParentDepsForSubsection(p, key, subsectionName)
          : (resolveParentDeps(p)[key] || { required: ["capsule"], optional: [] });
        const all = new Set([...(spec.required || []), ...(spec.optional || [])]);
        const used = new Set();
        for (const c of concepts) {
          for (const fld of all) if (c[fld]) used.add(fld);
        }
        return PARENT_FIELD_ORDER.filter(f => used.has(f));
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

// ───── [PARENT_FIELD_ORDER] philosynth.html строки 9873–9891 ─────
      const PARENT_FIELD_ORDER = [
        "capsule", "goals", "portraits", "tensions",
        "graphNodes", "graphEdges",
        "dialogueConcepts", "dialogueSynthesis",
        "glossaryCompact", "thesesSummary",
      ];

      const PARENT_FIELD_LABELS = {
        capsule:            "КАПСУЛА",
        goals:              "ЦЕЛИ И МЕТОД",
        portraits:          "ПОРТРЕТЫ ФИЛОСОФОВ",
        tensions:           "НАПРЯЖЕНИЯ",
        graphNodes:         "КАТЕГОРИИ (из графа)",
        graphEdges:         "СВЯЗИ (из графа)",
        dialogueConcepts:   "ПОНЯТИЯ (из диалога)",
        dialogueSynthesis:  "АНАЛИТИЧЕСКИЙ КОММЕНТАРИЙ К ДИАЛОГУ",
        glossaryCompact:    "ТЕРМИНЫ",
        thesesSummary:      "ТЕЗИСЫ",
      };

// ───── [PARENT_FIELD_LABELS] philosynth.html строки 9880–9891 ─────
      const PARENT_FIELD_LABELS = {
        capsule:            "КАПСУЛА",
        goals:              "ЦЕЛИ И МЕТОД",
        portraits:          "ПОРТРЕТЫ ФИЛОСОФОВ",
        tensions:           "НАПРЯЖЕНИЯ",
        graphNodes:         "КАТЕГОРИИ (из графа)",
        graphEdges:         "СВЯЗИ (из графа)",
        dialogueConcepts:   "ПОНЯТИЯ (из диалога)",
        dialogueSynthesis:  "АНАЛИТИЧЕСКИЙ КОММЕНТАРИЙ К ДИАЛОГУ",
        glossaryCompact:    "ТЕРМИНЫ",
        thesesSummary:      "ТЕЗИСЫ",
      };

// ───── [PARENT_DEPS_BASE] philosynth.html строки 9896–9921 ─────
      const PARENT_DEPS_BASE = {
        sum:       { required: ["capsule","goals","tensions","thesesSummary","graphNodes"],
                     optional: ["graphEdges","glossaryCompact","dialogueSynthesis","portraits"] },
        graph:     { required: ["capsule","graphNodes","graphEdges"],
                     optional: ["glossaryCompact","thesesSummary","tensions"] },
        glossary:  { required: ["capsule","glossaryCompact","graphNodes"],
                     optional: ["tensions","thesesSummary"] },
        theses:    { required: ["capsule","thesesSummary","graphNodes","graphEdges","glossaryCompact"],
                     optional: ["tensions","goals"] },
        name:      { required: ["capsule","goals"],
                     optional: ["thesesSummary","graphNodes"] },
        history:   { required: ["capsule","goals","portraits"],
                     optional: ["thesesSummary","tensions"] },
        origin:    { required: ["capsule","goals","portraits","tensions","thesesSummary"],
                     optional: ["graphNodes","glossaryCompact"] },
        practical: { required: ["capsule","goals","thesesSummary"],
                     optional: ["glossaryCompact","graphNodes"] },
        dialogue:  { required: ["capsule","tensions","thesesSummary","graphNodes"],
                     optional: ["goals","dialogueSynthesis","portraits"] },
        evolution: { required: ["capsule","goals","thesesSummary"],
                     optional: ["graphNodes","graphEdges","tensions"] },
        critique:  { required: ["capsule","goals","portraits","tensions","thesesSummary","graphNodes","graphEdges","glossaryCompact"],
                     optional: ["dialogueSynthesis","dialogueConcepts"] },
        capsule:   { required: ["capsule","goals","thesesSummary"],
                     optional: ["graphNodes","glossaryCompact"] },
      };

// ───── [PARENT_INTRA_DEPS] philosynth.html строки 10023–10050 ─────
      const PARENT_INTRA_DEPS = {
        graph: {
          "Методология построения графа":  { required: ["capsule","goals"] },
          "Таблица категорий":             { required: ["capsule","graphNodes","tensions"] },
          "Таблица связей":                { required: ["graphNodes","graphEdges"] },
          "Топология графа":               { required: ["graphEdges"], optional: ["graphNodes"] },
          "Топологическая таблица":        { required: ["graphEdges"], optional: ["graphNodes"] },
        },
        theses: {
          "Онтологические тезисы":            { required: ["capsule","graphNodes","thesesSummary"] },
          "Эпистемологические тезисы":         { required: ["capsule","graphNodes","thesesSummary"] },
          "Этические и аксиологические тезисы":{ required: ["capsule","thesesSummary"] },
          "Сводная таблица тезисов":          { required: ["thesesSummary"] },
        },
        critique: {
          "Внутренняя когерентность":        { required: ["capsule","thesesSummary"] },
          "Философская новизна":              { required: ["capsule","portraits"] },
          "Эмерджентность концепции":         { required: ["graphNodes","graphEdges","tensions"] },
          "Проблемная генерация":             { required: ["capsule","tensions"] },
          "Верность методу синтеза":          { required: ["capsule"] },
          "Сохранение ценных аспектов":       {},   // полный section-уровневый набор
          "Разрешение противоречий":          { required: ["tensions","thesesSummary"] },
          "Слепые пятна":                     { required: ["capsule","portraits","goals"] },
          "Межслойная согласованность":       { required: ["thesesSummary"] },
          "Итоговая оценка":                   {},   // полный section-уровневый
          "Рекомендации по улучшению":         { required: ["capsule"] },
        },
      };

// ───── [PARENT_CONTEXT_SCHEMA_ID] philosynth.html строки 10053–10089 ─────
      const PARENT_CONTEXT_SCHEMA_ID = "selective-v1";

      function _validateParentDeps() {
        const valid = new Set(PARENT_FIELD_ORDER);
        function check(map, name) {
          for (const [section, spec] of Object.entries(map || {})) {
            for (const tier of ["required", "optional"]) {
              for (const fld of (spec[tier] || [])) {
                if (!valid.has(fld)) {
                  console.warn("[" + name + "] неизвестное поле «" + fld +
                    "» в разделе \"" + section + "\" (" + tier + ")");
                }
              }
            }
          }
        }
        // BASE карты
        check(PARENT_DEPS_BASE, "PARENT_DEPS_BASE");
        check(PARENT_DEPS_GENETIC, "PARENT_DEPS_GENETIC");
        // Патчи: проверяем каждый «лист» индивидуально
        for (const [level, map] of Object.entries(PARENT_DEPS_LEVEL)) {
          check(map, "PARENT_DEPS_LEVEL[" + level + "]");
        }
        for (const [level, map] of Object.entries(PARENT_DEPS_LEVEL_GENETIC)) {
          check(map, "PARENT_DEPS_LEVEL_GENETIC[" + level + "]");
        }
        for (const [method, map] of Object.entries(PARENT_DEPS_METHOD)) {
          check(map, "PARENT_DEPS_METHOD[" + method + "]");
        }
        // Intra-карта: по каждому (section × subsection) — отдельная проверка
        for (const [section, subs] of Object.entries(PARENT_INTRA_DEPS)) {
          for (const [subName, spec] of Object.entries(subs)) {
            check({ [subName]: spec },
                  "PARENT_INTRA_DEPS[" + section + "]");
          }
        }
      }

// ───── [PARENT_CONTEXT_SCHEMA_VERSION] philosynth.html строки 10052–10089 ─────
      const PARENT_CONTEXT_SCHEMA_VERSION = 1;
      const PARENT_CONTEXT_SCHEMA_ID = "selective-v1";

      function _validateParentDeps() {
        const valid = new Set(PARENT_FIELD_ORDER);
        function check(map, name) {
          for (const [section, spec] of Object.entries(map || {})) {
            for (const tier of ["required", "optional"]) {
              for (const fld of (spec[tier] || [])) {
                if (!valid.has(fld)) {
                  console.warn("[" + name + "] неизвестное поле «" + fld +
                    "» в разделе \"" + section + "\" (" + tier + ")");
                }
              }
            }
          }
        }
        // BASE карты
        check(PARENT_DEPS_BASE, "PARENT_DEPS_BASE");
        check(PARENT_DEPS_GENETIC, "PARENT_DEPS_GENETIC");
        // Патчи: проверяем каждый «лист» индивидуально
        for (const [level, map] of Object.entries(PARENT_DEPS_LEVEL)) {
          check(map, "PARENT_DEPS_LEVEL[" + level + "]");
        }
        for (const [level, map] of Object.entries(PARENT_DEPS_LEVEL_GENETIC)) {
          check(map, "PARENT_DEPS_LEVEL_GENETIC[" + level + "]");
        }
        for (const [method, map] of Object.entries(PARENT_DEPS_METHOD)) {
          check(map, "PARENT_DEPS_METHOD[" + method + "]");
        }
        // Intra-карта: по каждому (section × subsection) — отдельная проверка
        for (const [section, subs] of Object.entries(PARENT_INTRA_DEPS)) {
          for (const [subName, spec] of Object.entries(subs)) {
            check({ [subName]: spec },
                  "PARENT_INTRA_DEPS[" + section + "]");
          }
        }
      }
