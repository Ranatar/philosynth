// Фрагмент philosynth.html (26025 строк) — собран
// scripts/extract-by-name.py по спецификации 3.2-genealogy-ui.spec.
//
// Номера строк ниже — РЕЗУЛЬТАТ поиска по именам, а не входные
// данные: при правке исходника достаточно перезапустить сборку,
// спецификация не устаревает. Имена берутся из
// docs/04-code-reuse-map.md.

// ───── Дерево генеалогии · js:reconstructGenealogy
// philosynth.html строки 22181–22220 ─────
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

// ───── Дерево генеалогии · js:renderGenealogyTree
// philosynth.html строки 22343–22410 ─────
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

// ───── Дерево генеалогии · js:stripCapsulesFromGenealogy
// philosynth.html строки 22321–22331 ─────
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

// ───── Дерево генеалогии · js:updateGenealogyInHeader
// philosynth.html строки 22415–22446 ─────
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

// ───── Дерево генеалогии · js:checkGenealogyOverlaps
// philosynth.html строки 22467–22509 ─────
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

// ───── Дерево генеалогии · js:normalizeGenealogyNames
// philosynth.html строки 22298–22315 ─────
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

// ───── дополнение пула, созданного беседой 1.5b) · js:refreshAllSynthParticipants
// philosynth.html строки 4940–4945 ─────
      function refreshAllSynthParticipants() {
        for (const c of _loadedConcepts) {
          if (c.isSynthParticipant) refreshPoolParticipant(c);
        }
        syncConceptParticipants();
      }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 2946–2954 ─────
    .gen-tree ul {
      display: flex;
      justify-content: center;
      padding-top: 20px;
      position: relative;
      list-style: none;
      margin: 0;
      padding-left: 0;
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 2957–2965 ─────
    .gen-tree ul::before {
      content: "";
      position: absolute;
      top: 0;
      left: 50%;
      width: 1px;
      height: 20px;
      background: rgba(255, 255, 255, 0.2);
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 2968–2974 ─────
    .gen-tree li {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      padding: 20px 6px 0;
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 2978–2985 ─────
    .gen-tree li::after {
      content: "";
      position: absolute;
      top: 0;
      width: 50%;
      height: 1px;
      background: rgba(255, 255, 255, 0.2);
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 2986–2986 ─────
    .gen-tree li::before { right: 50%; }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 2987–2987 ─────
    .gen-tree li::after  { left: 50%; }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 2990–2990 ─────
    .gen-tree li:first-child::before { display: none; }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 2992–2992 ─────
    .gen-tree li:last-child::after { display: none; }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 2995–2995 ─────
    .gen-tree li:only-child::after { display: none; }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 2999–3001 ─────
    .gen-tree li > .gen-phil {
      position: relative;
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3003–3011 ─────
    .gen-tree li > .gen-phil::before {
      content: "";
      position: absolute;
      top: -20px;
      left: 50%;
      width: 1px;
      height: 20px;
      background: rgba(255, 255, 255, 0.2);
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3014–3014 ─────
    .gen-tree > .gen-card::before { display: none; }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3016–3027 ─────
    .gen-tree > ul::before { display: none; }*/

    /* ── Карточка концепции ── */
    .gen-card {
      background: rgba(107, 0, 170, 0.12);
      border: 1px solid rgba(107, 0, 170, 0.35);
      padding: 10px 14px;
      min-width: 160px;
      max-width: 280px;
      text-align: center;
      position: relative;
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3019–3027 ─────
    .gen-card {
      background: rgba(107, 0, 170, 0.12);
      border: 1px solid rgba(107, 0, 170, 0.35);
      padding: 10px 14px;
      min-width: 160px;
      max-width: 280px;
      text-align: center;
      position: relative;
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3028–3035 ─────
    .gen-card-name {
      font-family: var(--serif);
      font-size: 13px;
      font-weight: 700;
      color: var(--violet);
      line-height: 1.3;
      margin-bottom: 4px;
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3036–3043 ─────
    .gen-card-meta {
      font-family: var(--mono);
      font-size: 8px;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.45);
      margin-bottom: 2px;
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3044–3054 ─────
    .gen-card-seed {
      font-family: var(--sans);
      font-size: 10px;
      font-style: italic;
      color: rgba(255, 255, 255, 0.5);
      line-height: 1.4;
      margin-top: 4px;
      max-height: 2.8em;
      overflow: hidden;
      text-overflow: ellipsis;
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3057–3060 ─────
    .gen-card-seed-details {
      margin-top: 4px;
      text-align: left;
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3061–3073 ─────
    .gen-card-seed-details summary {
      cursor: pointer;
      font-family: var(--mono);
      font-size: 8px;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
      list-style: none;
      display: flex;
      align-items: center;
      gap: 4px;
      justify-content: center;
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3074–3074 ─────
    .gen-card-seed-details summary::-webkit-details-marker { display: none; }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3075–3079 ─────
    .gen-card-seed-details summary::before {
      content: "▸";
      font-size: 8px;
      transition: transform 0.2s;
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3080–3082 ─────
    .gen-card-seed-details[open] summary::before {
      transform: rotate(90deg);
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3083–3097 ─────
    .gen-card-seed-details-body {
      font-family: var(--sans);
      font-size: 10px;
      font-style: italic;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.5);
      margin-top: 4px;
      padding: 6px 8px;
      background: rgba(0, 0, 0, 0.10);
      border-left: 2px solid rgba(255, 255, 255, 0.25);
      max-height: 150px;
      overflow-y: auto;
      text-align: left;
      white-space: pre-line;
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3100–3103 ─────
    .gen-card-capsule {
      margin-top: 6px;
      text-align: left;
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3104–3116 ─────
    .gen-card-capsule summary {
      cursor: pointer;
      font-family: var(--mono);
      font-size: 8px;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--gold);
      list-style: none;
      display: flex;
      align-items: center;
      gap: 4px;
      justify-content: center;
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3117–3117 ─────
    .gen-card-capsule summary::-webkit-details-marker { display: none; }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3118–3122 ─────
    .gen-card-capsule summary::before {
      content: "▸";
      font-size: 8px;
      transition: transform 0.2s;
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3123–3125 ─────
    .gen-card-capsule[open] summary::before {
      transform: rotate(90deg);
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3126–3139 ─────
    .gen-card-capsule-body {
      font-family: var(--sans);
      font-size: 10px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.65);
      margin-top: 6px;
      padding: 6px 8px;
      background: rgba(0, 0, 0, 0.15);
      border-left: 2px solid var(--gold);
      max-height: 200px;
      overflow-y: auto;
      text-align: left;
      white-space: pre-wrap;
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3142–3149 ─────
    .gen-phil {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 8px 14px;
      min-width: 100px;
      text-align: center;
      position: relative;
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3150–3155 ─────
    .gen-phil-name {
      font-family: var(--sans);
      font-size: 12px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.8);
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3158–3161 ─────
    .gen-tree > .gen-card {
      border-color: var(--gold);
      background: rgba(184, 134, 11, 0.12);
    }

// ───── безусловными (грабля, родственная легенде графа в 1.7). · css*:.gen-
// philosynth.html строки 3162–3165 ─────
    .gen-tree > .gen-card .gen-card-name {
      color: var(--gold-light);
      font-size: 14px;
    }

// ───── и «max-width: 500px». · lines:3168-3267
// philosynth.html строки 3168–3267 ─────
    @media (prefers-color-scheme: light) {
      .gen-tree ul::before,
      .gen-tree li::before,
      .gen-tree li::after,
      .gen-tree li > .gen-card::before,
      .gen-tree li > .gen-phil::before {
        background: var(--rule);
      }
      .gen-card {
        background: var(--violet-light);
        border-color: var(--violet);
      }
      .gen-card-meta { color: var(--ink-dim); }
      .gen-card-seed { color: var(--ink-dim); }
      .gen-card-seed-details summary { color: var(--ink-dim); }
      .gen-card-seed-details-body {
        color: var(--ink-dim);
        background: rgba(0,0,0,0.03);
      }
      .gen-card-capsule-body {
        color: var(--ink-mid);
        background: rgba(0,0,0,0.03);
      }
      .gen-phil {
        background: var(--off);
        border-color: var(--rule);
      }
      .gen-phil-name { color: var(--ink); }
      .gen-tree > .gen-card {
        border-color: var(--gold);
        background: #fffbee;
      }
    }

    /* ── Печать ── */
    @media print {
      .gen-tree { overflow: visible; }
      .gen-card-capsule { display: none; } /* капсулы скрыть при печати */
      .gen-card-seed-details { display: none; } /* зёрна скрыть при печати */
      .gen-card, .gen-phil { break-inside: avoid; }
    }

    /* ── Мобильные: вертикальный стек при нехватке ширины ── */
    @media (max-width: 500px) {
      .gen-tree ul {
        flex-direction: column;
        align-items: center;
        padding-top: 12px;
      }
      .gen-tree li {
        padding: 12px 0 0;
      }
      .gen-tree li::before,
      .gen-tree li::after {
        display: none;
      }
      /* Уровень 3+ — компактные карточки */
      .gen-tree li li li .gen-card {
        padding: 6px 10px;
        min-width: 120px;
        max-width: 200px;
      }
      .gen-tree li li li .gen-card-name { font-size: 11px; }
      .gen-tree li li li .gen-card-meta { font-size: 7px; }
      .gen-tree li li li .gen-card-seed { display: none; }
      .gen-tree li li li .gen-card-seed-details { display: none; }
      .gen-tree li li li .gen-card-capsule summary { font-size: 7px; }
      
      .gen-tree ul {
        flex-wrap: wrap;
        gap: 4px 0;
      }
      .gen-tree ul::before {
        height: 12px;
      }
      .gen-tree ul.gen-vertical {
        flex-direction: column;
        align-items: center;
        padding-top: 12px;
      }
      .gen-tree ul.gen-vertical > li {
        padding: 8px 0 0;
      }
      .gen-tree ul.gen-vertical > li::before,
      .gen-tree ul.gen-vertical > li::after {
        /* Вертикальная линия вместо горизонтальной */
        width: 1px;
        height: 8px;
        top: 0;
        left: 50%;
        right: auto;
      }
      .gen-tree ul.gen-vertical > li::after { display: none; }
      .gen-tree ul.gen-vertical > li:first-child::before { display: block; }
        .gen-tree li > .gen-card::before,
        .gen-tree li > .gen-phil::before {
          height: 12px;
          top: -12px;
        }
      }

// ───── Светлый контекст дерева в теле документа — идёт ПОСЛЕ медиазапросов · css*:.gen-
// philosynth.html строки 3274–3274 ─────
      .gen-tree-light .gen-card-name { color: var(--violet); }

// ───── Светлый контекст дерева в теле документа — идёт ПОСЛЕ медиазапросов · css*:.gen-
// philosynth.html строки 3275–3275 ─────
      .gen-tree-light .gen-card-meta { color: var(--ink-dim); }

// ───── Светлый контекст дерева в теле документа — идёт ПОСЛЕ медиазапросов · css*:.gen-
// philosynth.html строки 3276–3276 ─────
      .gen-tree-light .gen-card-seed { color: var(--ink-dim); }

// ───── Светлый контекст дерева в теле документа — идёт ПОСЛЕ медиазапросов · css*:.gen-
// philosynth.html строки 3277–3277 ─────
      .gen-tree-light .gen-card-seed-details summary { color: var(--ink-dim); }

// ───── Светлый контекст дерева в теле документа — идёт ПОСЛЕ медиазапросов · css*:.gen-
// philosynth.html строки 3278–3281 ─────
      .gen-tree-light .gen-card-seed-details-body {
        color: var(--ink-dim);
        background: var(--off);
      }

// ───── Светлый контекст дерева в теле документа — идёт ПОСЛЕ медиазапросов · css*:.gen-
// philosynth.html строки 3282–3285 ─────
      .gen-tree-light .gen-card-capsule-body {
        color: var(--ink-mid);
        background: var(--off);
      }

// ───── Светлый контекст дерева в теле документа — идёт ПОСЛЕ медиазапросов · css*:.gen-
// philosynth.html строки 3286–3289 ─────
      .gen-tree-light .gen-phil {
        background: var(--off);
        border-color: var(--rule);
      }

// ───── Светлый контекст дерева в теле документа — идёт ПОСЛЕ медиазапросов · css*:.gen-
// philosynth.html строки 3290–3290 ─────
      .gen-tree-light .gen-phil-name { color: var(--ink); }

// ───── Светлый контекст дерева в теле документа — идёт ПОСЛЕ медиазапросов · css*:.gen-
// philosynth.html строки 3295–3297 ─────
      .gen-tree-light li > .gen-phil::before {
        background: var(--rule);
      }

// ───── Светлый контекст дерева в теле документа — идёт ПОСЛЕ медиазапросов · css*:.gen-
// philosynth.html строки 3298–3301 ─────
      .gen-tree-light > .gen-card {
        background: #fffbee;
        border-color: var(--gold);
      }

// ───── Светлый контекст дерева в теле документа — идёт ПОСЛЕ медиазапросов · css*:.gen-
// philosynth.html строки 3302–3302 ─────
      .gen-tree-light > .gen-card .gen-card-name { color: var(--gold); }
