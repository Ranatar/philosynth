// Фрагменты philosynth.html (26 024 стр., ревизия 2026-07) для беседы 3.2-genealogy-ui
// Сгенерировано extract-fragments.py; при обновлении исходника — перегенерировать.

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

// ───── [genealogy] philosynth.html строки 22142–22151 ─────
        const genealogy = reconstructGenealogy(meta, embeddedState, doc);

        // Восстанавливаем капсулы всех не-корневых узлов из отрендеренного
        // HTML-дерева генеалогии импортируемого документа. Без этого капсулы
        // дальних предков теряются при метасинтезе 3-го уровня и глубже:
        // в embeddedState.genealogy они уже сняты через
        // stripCapsulesFromGenealogy, а .gen-card-capsule-body в HTML остаются.
        if (genealogy) {
          restoreCapsulesFromHTML(genealogy, doc);
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

// ───── [reconstructGenealogy] philosynth.html строки 22181–22220 ─────
      function reconstructGenealogy(meta, embeddedState, doc) {
        // Если в embedded state уже есть genealogy — используем
        if (embeddedState?.genealogy) return embeddedState.genealogy;

        // Иначе реконструируем из метаданных:
        // Участники — философы из meta.phil
        const participants = (meta.phil || []).map(name => ({
          type: "philosopher",
          name,
        }));

        // Настоящее имя: сначала docTitle, если дефолт — из раздела «name»,
        // иначе явный плейсхолдер. Это защищает от транзитивного
        // распространения «Синтез Философской Концепции» через многоступенчатый
        // метасинтез.
        const resolvedName = resolveConceptName(doc) || "[безымянная концепция]";

        // Если в embedded state есть participants с концепциями — используем их
        if (embeddedState?.participants) {
          return {
            type: "concept",
            name: resolvedName,
            method: meta.method,
            synthLevel: meta.synthLevel,
            seed: meta.seed || "",
            participants: embeddedState.participants.map(p =>
              p.type === "concept" ? p.genealogy || { type: "concept", name: p.name } : p
            ),
          };
        }

        return {
          type: "concept",
          name: resolvedName,
          method: meta.method,
          synthLevel: meta.synthLevel,
          seed: meta.seed || "",
          participants,
        };
      }

// ───── [renderGenealogyTree] philosynth.html строки 22343–22410 ─────
      function renderGenealogyTree(node, opts) {
        if (!node) return "";
        var isRoot = !opts || opts.isRoot !== false;
        var light = opts && opts.light;

        // renderNode — вложенная функция, вызывается рекурсивно
        function renderNode(n, isRootNode) {
          // Философ → простой блок
          if (n.type === "philosopher") {
            return '<div class="gen-phil"><div class="gen-phil-name">' +
                   esc(n.name) + '</div></div>';
          }

          // Концепция → карточка
          var methodLabel = ML[n.method] || n.method || "?";
          var levelLabel = SL[n.synthLevel] || n.synthLevel || "?";
          var orderLabel = n.generationOrder === "genetic" ? " · генетич." : " · архитект.";

          var seedHTML = "";
          if (n.seed) {
            if (isRootNode) {
              // Корень — простой усечённый текст
              seedHTML = '<div class="gen-card-seed">«' +
                esc(n.seed.length > 80 ? n.seed.slice(0, 80) + "…" : n.seed) +
                '»</div>';
            } else {
              // Родительская концепция — раскрывающийся блок
              seedHTML = '<details class="gen-card-seed-details">' +
                '<summary>Зерно</summary>' +
                '<div class="gen-card-seed-details-body">«' + esc(n.seed) + '»</div>' +
                '</details>';
            }
          }

          var capsuleHTML = (n.capsule && !isRootNode)
            ? '<details class="gen-card-capsule">' +
              '<summary>Капсула</summary>' +
              '<div class="gen-card-capsule-body">' + esc(n.capsule) + '</div>' +
              '</details>'
            : "";

          var html = '<div class="gen-card">' +
            '<div class="gen-card-name">◈ ' + esc(n.name) + '</div>' +
            '<div class="gen-card-meta">' + esc(methodLabel) + ' × ' + esc(levelLabel) + orderLabel + '</div>' +
            seedHTML + capsuleHTML +
            '</div>';

          // Дети → <ul><li>...рекурсия...</li></ul>
          if (n.participants && n.participants.length > 0) {
            var ulClass = n.participants.length > 4 ? ' class="gen-vertical"' : '';
            html += '<ul' + ulClass + '>' +
              n.participants.map(function(child) {
                return '<li>' + renderNode(child, false) + '</li>';
                                          //  ↑ рекурсия: ребёнок — не корень
              }).join("") +
              '</ul>';
          }

          return html;
        }

        // Точка входа: renderNode вызывается для корня
        var treeClass = "gen-tree" + (light ? " gen-tree-light" : "");
        return '<div class="' + treeClass + '">' +
               renderNode(node, isRoot) +
                        // ↑ первый вызов: корень
               '</div>';
      }

// ───── [safeGenealogy] philosynth.html строки 18059–18076 ─────
          const safeGenealogy = x.genealogy
            ? normalizeGenealogyNames(
                stripCapsulesFromGenealogy(x.genealogy),
                x.name
              )
            : null;
          return {
            type: x.type, name: x.name, method: x.method,
            synthLevel: x.synthLevel, seed: x.seed, genealogy: safeGenealogy,
            // generationOrder сохраняем, чтобы он был доступен как fallback
            // при построении genealogy в будущих метасинтезах (для случаев,
            // когда у участника нет собственной genealogy-структуры).
            generationOrder: x.generationOrder,
            // НЕ включаем: capsule, goals, tensions, graphNodes, graphEdges,
            //   dialogueConcepts, dialogueSynthesis, glossaryCompact, thesesSummary,
            //   portraits
            _filename: x._filename, _nodeCount: x._nodeCount, _thesesCount: x._thesesCount,
          };

// ───── [stripCapsulesFromGenealogy] philosynth.html строки 22321–22331 ─────
      function stripCapsulesFromGenealogy(node) {
        if (!node) return null;
        const copy = { ...node };
        delete copy.capsule;
        if (copy.participants) {
          copy.participants = copy.participants.map(p =>
            p.type === "philosopher" ? p : stripCapsulesFromGenealogy(p)
          );
        }
        return copy;
      }

// ───── [updateGenealogyInHeader] philosynth.html строки 22415–22446 ─────
      function updateGenealogyInHeader() {
        const container = document.getElementById("docHeaderExtras");
        if (!container || !DOC_STATE.genealogy) return;

        // Удаляем предыдущее дерево
        const old = container.querySelector(".header-disclosure-genealogy");
        if (old) old.remove();

        // Не показываем, если все участники — философы (нет рекурсии)
        const hasConcepts = (DOC_STATE.genealogy.participants || [])
          .some(p => p.type === "concept");
        if (!hasConcepts) return;

        const details = document.createElement("details");
        details.className = "header-disclosure header-disclosure-genealogy";
        details.open = true;

        const summary = document.createElement("summary");
        summary.textContent = "Генеалогическое древо";

        const body = document.createElement("div");
        body.className = "disclosure-body";
        body.style.cssText = "padding: 16px; overflow-x: auto;";
        // Шапка — тёмный фон, используем основной стиль (без light)
        body.innerHTML = renderGenealogyTree(DOC_STATE.genealogy, { isRoot: true, light: false });

        details.appendChild(summary);
        details.appendChild(body);
        container.appendChild(details);
        // ТЗ selective-parent-context 10.3: бейдж схемы
        try { updateSchemaBadgeInHeader(DOC_STATE._parentContextSchema); } catch (_) {}
      }
