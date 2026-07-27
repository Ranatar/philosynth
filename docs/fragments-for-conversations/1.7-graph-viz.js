// Фрагменты philosynth.html (26 024 стр., ревизия 2026-07) для беседы 1.7-graph-viz
// Сгенерировано extract-fragments.py; при обновлении исходника — перегенерировать.

// ───── [GRAPH MODAL→MMD EXPORT] philosynth.html строки 12990–16366 ─────
      // ════════════════════════════════════════
      // GRAPH MODAL
      // ════════════════════════════════════════

      // ── Цвета типов узлов ──────────────────────────────────────────────────────
      // ── Динамический кеш цветов узлов ──
      // Заполняется при каждом parseGraph / rebuildGraphColors
      let _nodeColorMap = new Map();  // stem → 0xRRGGBB

      // Семена hue — чтобы одинаковые типы в разных графах получали похожие оттенки.
      // Но итоговый цвет определяется набором типов конкретного графа (без повторов).
      const _TC_HUE_SEEDS = {
        онтологическ: 215, эпистемологическ: 145, этическ: 40, аксиологическ: 42,
        метафизическ: 280, логическ: 168, практическ: 25, эстетическ: 340,
        антропологическ: 38, феноменологическ: 275, экзистенциальн: 5,
        социальн: 145, политическ: 207, теологическ: 195,
        // расширенные из MMD
        лингвистическ: 55, герменевтическ: 300, аналитическ: 190, междисциплинарн: 120,
      };

      function _rebuildNodeColors(nodes) {
        const stems = new Set();
        for (const n of nodes) {
          if (!n.type) continue;
          for (const part of n.type.split(/[\/·,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean))
            stems.add(part);
        }
        _nodeColorMap = new Map();
        const arr = [...stems];
        // Сначала пытаемся использовать seed-hue (если есть)
        const usedHues = [];
        for (const stem of arr) {
          let bestSeed = null;
          for (const [k, h] of Object.entries(_TC_HUE_SEEDS)) {
            if (stem.includes(k)) { bestSeed = h; break; }
          }
          if (bestSeed != null) {
            // Немного смещаем, если hue уже занят
            let h = bestSeed;
            while (usedHues.some(uh => Math.abs(((uh - h + 540) % 360) - 180) < 15)) h = (h + 23) % 360;
            usedHues.push(h);
            _nodeColorMap.set(stem, _hslToHex({ h, s: 0.62, l: 0.52 }));
          }
        }
        // Типы без seed — распределяем по свободным участкам
        const GOLDEN = 137.508;
        let freeIdx = 0;
        for (const stem of arr) {
          if (_nodeColorMap.has(stem)) continue;
          let h;
          do { h = (freeIdx++ * GOLDEN + 90) % 360; }
          while (usedHues.some(uh => Math.abs(((uh - h + 540) % 360) - 180) < 15));
          usedHues.push(h);
          _nodeColorMap.set(stem, _hslToHex({ h, s: 0.58, l: 0.50 }));
        }
      }

      // ── Динамический кеш стилей рёбер ──
      let _edgeStyleMap = new Map(); // stem → { color, dash }

      const _EC_HUE_SEEDS = {
        иерархическ: 200, диалектическ: 5, каузальн: 215, корреляционн: 0,
        дополнительност: 145, противоречи: 355, эмерджентн: 48,
        часть: 280, средство: 25, основани: 168, определяющ: 20, развити: 140,
        // расширенные из MMD
        конъюнктивн: 60, дизъюнктивн: 310, необходим: 190, достаточн: 175,
        тождеств: 230, аналоги: 85, реализаци: 35, конкретизаци: 70,
        обобщени: 250, дедуктивн: 210, индуктивн: 150, абдуктивн: 110,
        временн: 95, концептуальн: 260, выражени: 330, понимани: 290,
        мышлени: 300,
      };
      // Приоритет: какой dash-паттерн побеждает при нескольких типах.
      // Чем выше pri — тем важнее визуальный сигнал этого типа.
      const _EC_DASH_SEEDS = {
        противоречи: { dash: "7,3",   pri: 7 },   // конфликт
        дизъюнктивн: { dash: "4,2",   pri: 5 },   // логическое разделение
        аналоги:     { dash: "12,4",  pri: 3 },   // подобие — длинный штрих
        корреляционн:{ dash: "2,3",   pri: 2 },   // слабая связь — мелкий пунктир
      };

      function _rebuildEdgeStyles(edges) {
        const stems = new Set();
        for (const e of edges) {
          if (!e.type) continue;
          for (const part of e.type.split(/[\/·,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean))
            stems.add(part);
        }
        _edgeStyleMap = new Map();
        const arr = [...stems];
        const usedHues = [];
        let freeHueIdx = 0;   // счётчик золотого угла (только для типов без hue-сида)
        let poolIdx = 0;      // счётчик пула dash (только для типов без dash-сида)
        for (const stem of arr) {
          // ── Hue ──
          let bestHue = null;
          for (const [k, h] of Object.entries(_EC_HUE_SEEDS)) {
            if (stem.includes(k)) { bestHue = h; break; }
          }
          let h;
          if (bestHue != null) {
            h = bestHue;
          } else {
            do { h = (freeHueIdx++ * 137.508 + 30) % 360; }
            while (usedHues.some(uh => Math.abs(((uh - h + 540) % 360) - 180) < 12));
          }
          while (usedHues.some(uh => Math.abs(((uh - h + 540) % 360) - 180) < 12)) h = (h + 19) % 360;
          usedHues.push(h);
          const hex = _hslToHex({ h, s: 0.55, l: 0.48 });

          // ── Dash + приоритет ──
          let dashInfo = null;  // { dash, pri }
          for (const [k, info] of Object.entries(_EC_DASH_SEEDS)) {
            if (stem.includes(k)) { dashInfo = info; break; }
          }
          const dash = dashInfo ? dashInfo.dash : null;
          const dashPri = dashInfo ? dashInfo.pri : 0;

          _edgeStyleMap.set(stem, {
            color: "#" + hex.toString(16).padStart(6, "0"),
            dash,
            dashPri,
          });
        }
      }

      // ── Палитра кластеров ───────────────────────────────────────────────────────
      const CPAL = [
        "#4a90d9","#e8a838","#50c878","#e74c3c",
        "#9b59b6","#1abc9c","#f39c12","#e91e63",
      ];

      const STRUCTURAL_PRIORITY = [
        "core", "generative", "bridge", "central", "peripheral"
      ];
      const PROCEDURAL_PRIORITY = [
        "synthesis",
        // dialectical
        "thesis", "antithesis",
        // deconstructive
        "deconstructed", "reassembled",
        // hermeneutical
        "horizon-expansion", "pre-horizon",
        // integrative
        "integrating", "foundation",
        // analytical
        "formalized", "verifying",
      ];
  
      // ── HSL-утилиты для смешивания нескольких цветов ────────────────────────────
      function _hexToHSL(hex) {
        const r = ((hex >> 16) & 0xff) / 255;
        const g = ((hex >>  8) & 0xff) / 255;
        const b = ( hex        & 0xff) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        if (max === min) return { h: 0, s: 0, l };
        const d = max - min;
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        let h;
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          default: h = ((r - g) / d + 4) / 6;
        }
        return { h: h * 360, s, l };
      }

      function _hslToHex({ h, s, l }) {
        h = ((h % 360) + 360) % 360;
        function hue2rgb(p, q, t) {
          if (t < 0) t += 1; if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        }
        if (s === 0) { const v = Math.round(l * 255); return (v << 16) | (v << 8) | v; }
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        return (Math.round(hue2rgb(p, q, h/360 + 1/3) * 255) << 16)
             | (Math.round(hue2rgb(p, q, h/360      ) * 255) <<  8)
             |  Math.round(hue2rgb(p, q, h/360 - 1/3) * 255);
      }

      // ── Цвет узла: поддержка нескольких типов («этическая / онтологическая») ─────
      // Разделители: / · , ;
      function _blendHex(hexArr) {
        const valid = hexArr.filter(c => c != null);
        if (!valid.length) return 0x95a5a6;
        if (valid.length === 1) return valid[0];
        let sinH = 0, cosH = 0, sumS = 0, sumL = 0;
        for (const c of valid) {
          const { h, s, l } = _hexToHSL(c);
          sinH += Math.sin(h * Math.PI / 180);
          cosH += Math.cos(h * Math.PI / 180);
          sumS += s; sumL += l;
        }
        return _hslToHex({
          h: Math.atan2(sinH, cosH) * 180 / Math.PI,
          s: sumS / valid.length,
          l: sumL / valid.length,
        });
      }

      // ── Стиль ребра: поддержка нескольких типов ──────────────────────────────────
      // Цвета смешиваются через _blendHex.
      // Dash берётся от типа с наивысшим dashPri (семантический вес).
      // Например: «противоречие / корреляционная» → dash от противоречия (pri 7 > pri 2).
      function edgeTypeStyle(type) {
        if (!type) return { color: "#444", dash: "3,3" };
        const parts = type.split(/[\/·,;]+/).map(s => s.trim()).filter(Boolean);
        const matched = [];
        for (const part of parts) {
          const t = part.toLowerCase();
          for (const [k, v] of _edgeStyleMap)
            if (t.includes(k) || k.includes(t)) { matched.push(v); break; }
        }
        if (!matched.length) return { color: "#b39ddb", dash: "4,2" };
        if (matched.length === 1) return matched[0];
        const mixed = "#" + _blendHex(matched.map(s => parseInt(s.color.slice(1), 16)))
                              .toString(16).padStart(6, "0");
        // Dash: побеждает тип с наивысшим семантическим приоритетом
        const withDash = matched.filter(s => s.dash);
        const dash = withDash.length
          ? withDash.sort((a, b) => (b.dashPri ?? 0) - (a.dashPri ?? 0))[0].dash
          : null;
        return { color: mixed, dash };
      }

      function showNodePanel(container, d, links, clusterLabels) {
        let panel = container.querySelector(".gm-info-panel");
        if (!panel) {
          panel = document.createElement("div");
          panel.className = "gm-info-panel";
          container.appendChild(panel);
        }
       
        const color   = typeColorHex(d.type);
        const certPct = Math.round((d.cert ?? 0.5) * 100);
        const cenPct  = Math.round((d.cen  ?? 0.5) * 100);
        // d.cluster теперь всегда массив индексов (может быть пустым)
        const clBadges = (Array.isArray(d.cluster) ? d.cluster : [])
          .map(idx => {
            const label = clusterLabels[idx] || `Кластер ${idx + 1}`;
            const color = CPAL[idx % CPAL.length];
            return `<span class="gm-panel-badge" style="border-color:${color};color:${color}">${label}</span>`;
          })
          .join("");
       
        const ROLE_LABELS = {
          central:               "Центральная",
          peripheral:            "Периферийная",
          bridge:                "Мост",
          synthesis:             "Точка синтеза",
          thesis:                "Тезис",
          antithesis:            "Антитезис",
          generative:           "Генеративная",
          core:                 "Ядро пересечений",
          deconstructed:        "Деконструированная",
          reassembled:          "Пересобранная",
          "horizon-expansion":  "Расширение горизонта",
          "pre-horizon":        "Предгоризонт",
          integrating:          "Интегрирующая",
          foundation:           "Основание",
          formalized:           "Формализованная",
          verifying:            "Верифицирующая",
        };

        function roleTagsHTML(rolesSet, groupLabel) {
          const arr = [...(rolesSet || new Set())];
          if (!arr.length) return "";
          const tags = arr.map(r =>
            `<span class="gm-role-tag">${ROLE_LABELS[r] || r}</span>`
          ).join("");
          return `<div class="gm-panel-role-group">
            <span class="gm-panel-role-group-label">${groupLabel}</span>${tags}
          </div>`;
        }

        const roleTags =
          roleTagsHTML(d.structuralRoles || d.roles, "Структурные") +
          roleTagsHTML(d.proceduralRoles, "Процессуальные");
       
        function edgeRow(l, dir) {
          let other;
          if (dir === "ref")      other = "<em>(рефлексивная)</em>";
          else if (dir === "out") other = typeof l.target === "object" ? l.target.name : "?";
          else                    other = typeof l.source === "object" ? l.source.name : "?";
          const { color: ec, dash } = edgeTypeStyle(l.type);
          const dashAttr = dash ? `stroke-dasharray="${dash}"` : "";
          return `<div class="gm-panel-edge">
            <svg width="16" height="10" style="flex-shrink:0;margin-top:1px">
              <line x1="1" y1="5" x2="15" y2="5" stroke="${ec}" stroke-width="2" ${dashAttr}/>
            </svg>
            <span class="gm-panel-edge-arrow">${dir === "out" ? "→" : dir === "in" ? "←" : "↺"}</span>
            <div>
              <div class="gm-panel-edge-name">${other}</div>
              <div class="gm-panel-edge-meta">${l.type || "—"}${l.desc ? " · " + l.desc : ""}</div>
            </div>
          </div>`;
        }
       
        const out = links.filter(l => {
          const s = typeof l.source === "object" ? l.source.id : l.source;
          return s === d.id && !l.dir.includes("рефлексив");
        });
        const inc = links.filter(l => {
          const t = typeof l.target === "object" ? l.target.id : l.target;
          const s = typeof l.source === "object" ? l.source.id : l.source;
          return t === d.id && s !== d.id;
        });
        // Двунаправленные: если A→B двунаправленная и мы смотрим A,
        // добавить «входящую» сторону (B→A)
        const biIncoming = links.filter(l => {
          const s = typeof l.source === "object" ? l.source.id : l.source;
          const t = typeof l.target === "object" ? l.target.id : l.target;
          return s === d.id && t !== d.id && l.dir.includes("двунаправлен");
        }).map(l => ({ ...l, source: l.target, target: l.source }));
        inc.push(...biIncoming);
        const ref = links.filter(l => {
          const s = typeof l.source === "object" ? l.source.id : l.source;
          return s === d.id && l.dir.includes("рефлексив");
        });
       
        panel.innerHTML = `
          <div class="gm-panel-header">
            <div class="gm-panel-dot" style="background:${color}"></div>
            <div class="gm-panel-name">${d.name}</div>
            <button class="gm-panel-close">✕</button>
          </div>
          <div class="gm-panel-badges">
            <span class="gm-panel-badge" style="border-color:${color};color:${color}">${d.type || "—"}</span>
            ${clBadges}
          </div>
          ${roleTags ? `<div class="gm-panel-roles">${roleTags}</div>` : ""}
          <div class="gm-panel-def">${d.def || ""}</div>
          ${d.orig ? `
            <div class="gm-panel-orig">
              <div class="gm-panel-orig-label">Происхождение / генеалогия</div>
              <div class="gm-panel-orig-text">${d.orig}</div>
            </div>` : ""}
          <div class="gm-panel-metrics">
            <div class="gm-panel-metric">
              <span>Центральность</span>
              <div class="gm-panel-bar"><div style="width:${cenPct}%;background:${color}"></div></div>
              <span>${(d.cen ?? 0.5).toFixed(2)}</span>
            </div>
            <div class="gm-panel-metric">
              <span>Определённость</span>
              <div class="gm-panel-bar"><div style="width:${certPct}%;background:#7f8c8d"></div></div>
              <span>${(d.cert ?? 0.5).toFixed(2)}</span>
            </div>
          </div>
          ${d._extended ? `
          <div class="gm-panel-metrics" style="margin-top:4px;border-top:1px dashed rgba(127,140,141,.3);padding-top:6px">
            <div style="font-family:var(--mono);font-size:8px;letter-spacing:1px;color:var(--ink-dim);margin-bottom:4px">РАСШИРЕННЫЕ</div>
            <div class="gm-panel-metric">
              <span>Ист. значимость</span>
              <div class="gm-panel-bar"><div style="width:${Math.round((d.histSig??0)*100)}%;background:#e67e22"></div></div>
              <span>${(d.histSig??0).toFixed(2)}</span>
            </div>
            <div class="gm-panel-metric">
              <span>Инновация</span>
              <div class="gm-panel-bar"><div style="width:${Math.round(((d.innovDeg??1)-1)/4*100)}%;background:#e74c3c"></div></div>
              <span>${d.innovDeg??1}/5</span>
            </div>
            <div class="gm-panel-metric">
              <span>Ясность</span>
              <div class="gm-panel-bar"><div style="width:${Math.round((d.clarity??0)*100)}%;background:#2ecc71"></div></div>
              <span>${(d.clarity??0).toFixed(2)}</span>
            </div>
            <div class="gm-panel-metric">
              <span>Широта</span>
              <div class="gm-panel-bar"><div style="width:${Math.round((d.breadth??0)*100)}%;background:#3498db"></div></div>
              <span>${(d.breadth??0).toFixed(2)}</span>
            </div>
            <div class="gm-panel-metric">
              <span>Глубина</span>
              <div class="gm-panel-bar"><div style="width:${Math.round((d.depth??0)*100)}%;background:#9b59b6"></div></div>
              <span>${(d.depth??0).toFixed(2)}</span>
            </div>
            <div class="gm-panel-metric">
              <span>Применимость</span>
              <div class="gm-panel-bar"><div style="width:${Math.round((d.applic??0)*100)}%;background:#1abc9c"></div></div>
              <span>${(d.applic??0).toFixed(2)}</span>
            </div>
          </div>` : ""}
          ${out.length ? `<div class="gm-panel-el-label">Исходящие</div>${out.map(l => edgeRow(l, "out")).join("")}` : ""}
          ${inc.length ? `<div class="gm-panel-el-label">Входящие</div>${inc.map(l => edgeRow(l, "in")).join("")}` : ""}
          ${ref.length ? `<div class="gm-panel-el-label">Рефлексивные</div>${ref.map(l => edgeRow(l, "ref")).join("")}` : ""}
        `;
       
        panel.querySelector(".gm-panel-close").onclick = e => {
          e.stopPropagation();
          panel.classList.remove("visible");
        };
       
        // Небольшая задержка, чтобы requestAnimationFrame успел до transition
        requestAnimationFrame(() => panel.classList.add("visible"));
      }

      function showEdgePanel(container, edgeData, allNodes, clusterLabels) {
        let panel = container.querySelector(".gm-info-panel");
        if (!panel) {
            panel = document.createElement("div");
            panel.className = "gm-info-panel";
            container.appendChild(panel);
        }

        const { color: edgeColor, dash } = edgeTypeStyle(edgeData.type);
        const dashAttr = dash ? `stroke-dasharray="${dash}"` : "";

        const isRefl = edgeData.dir.includes("рефлексив") ||
            edgeData.src.toLowerCase().trim() === edgeData.tgt.toLowerCase().trim();

        // Направление
        const isBi = edgeData.dir.includes("двунаправлен");
        const dirIcon = isRefl ? "↺" : isBi ? "↔" : "→";
        const dirLabel = isRefl ? "рефлексивная" : isBi ? "двунаправленная" : "однонаправленная";

        // Сила
        const strPct = Math.round((edgeData.str || 0.5) * 100);

        // ── Блок описания одного узла ──
        function nodeBlock(nodeName, labelPrefix) {
            const idx = allNodes.findIndex(
                n => n.name.toLowerCase().trim() === nodeName.toLowerCase().trim()
            );
            if (idx < 0) {
                return `<div class="gm-panel-ep-block">
                    <div class="gm-panel-ep-label">${labelPrefix}</div>
                    <div class="gm-panel-ep-name">${nodeName}</div>
                    <div class="gm-panel-ep-missing">не найден в графе</div>
                </div>`;
            }
            const n = allNodes[idx];
            const color = typeColorHex(n.type);
            const certPct = Math.round((n.cert ?? 0.5) * 100);
            const cenPct  = Math.round((n.cen  ?? 0.5) * 100);
            const clusters = (G.topology?.clusters?.[n.name] ?? [])
                .map(ci => {
                    const label = clusterLabels[ci] || `Кластер ${ci + 1}`;
                    const cc = CPAL[ci % CPAL.length];
                    return `<span class="gm-panel-badge" style="border-color:${cc};color:${cc};font-size:8px;padding:0 4px">${label}</span>`;
                }).join("");
            return `<div class="gm-panel-ep-block">
                <div class="gm-panel-ep-label">${labelPrefix}</div>
                <div class="gm-panel-ep-header">
                    <div class="gm-panel-dot" style="background:${color};width:7px;height:7px"></div>
                    <div class="gm-panel-ep-name">${n.name}</div>
                </div>
                <div class="gm-panel-badges" style="margin-bottom:4px">
                    <span class="gm-panel-badge" style="border-color:${color};color:${color}">${n.type || "—"}</span>
                    ${clusters}
                </div>
                ${n.def ? `<div class="gm-panel-def" style="margin-bottom:6px;font-size:9.5px">${n.def}</div>` : ""}
                <div class="gm-panel-metrics" style="margin-bottom:4px">
                    <div class="gm-panel-metric">
                        <span>Центральность</span>
                        <div class="gm-panel-bar"><div style="width:${cenPct}%;background:${color}"></div></div>
                        <span>${(n.cen ?? 0.5).toFixed(2)}</span>
                    </div>
                    <div class="gm-panel-metric">
                        <span>Определённость</span>
                        <div class="gm-panel-bar"><div style="width:${certPct}%;background:#7f8c8d"></div></div>
                        <span>${(n.cert ?? 0.5).toFixed(2)}</span>
                    </div>
                </div>
            </div>`;
        }

        // ── Расширенные метрики связи ──
        let extMetrics = "";
        if (edgeData._extended) {
            extMetrics = `
            <div class="gm-panel-metrics" style="margin-top:4px;border-top:1px dashed rgba(127,140,141,.3);padding-top:6px">
                <div style="font-family:var(--mono);font-size:8px;letter-spacing:1px;color:var(--ink-dim);margin-bottom:4px">РАСШИРЕННЫЕ</div>
                <div class="gm-panel-metric">
                    <span>Определённость</span>
                    <div class="gm-panel-bar"><div style="width:${Math.round((edgeData.certEdge??0)*100)}%;background:#e67e22"></div></div>
                    <span>${(edgeData.certEdge??0).toFixed(2)}</span>
                </div>
                <div class="gm-panel-metric">
                    <span>Инновация</span>
                    <div class="gm-panel-bar"><div style="width:${Math.round(((edgeData.innovDeg??1)-1)/4*100)}%;background:#e74c3c"></div></div>
                    <span>${edgeData.innovDeg??1}/5</span>
                </div>
                <div class="gm-panel-metric">
                    <span>Ист. подкрепл.</span>
                    <div class="gm-panel-bar"><div style="width:${Math.round((edgeData.histSupport??0)*100)}%;background:#f39c12"></div></div>
                    <span>${(edgeData.histSupport??0).toFixed(2)}</span>
                </div>
                <div class="gm-panel-metric">
                    <span>Лог. необходим.</span>
                    <div class="gm-panel-bar"><div style="width:${Math.round((edgeData.logNec??0)*100)}%;background:#3498db"></div></div>
                    <span>${(edgeData.logNec??0).toFixed(2)}</span>
                </div>
                <div class="gm-panel-metric">
                    <span>Контекст. завис.</span>
                    <div class="gm-panel-bar"><div style="width:${Math.round((edgeData.ctxDep??0)*100)}%;background:#9b59b6"></div></div>
                    <span>${(edgeData.ctxDep??0).toFixed(2)}</span>
                </div>
            </div>`;
        }

        const srcBlock = nodeBlock(edgeData.src, isRefl ? "УЗЕЛ" : "ИСТОЧНИК");
        const tgtBlock = isRefl ? "" : nodeBlock(edgeData.tgt, "ЦЕЛЬ");

        panel.innerHTML = `
            <div class="gm-panel-header">
                <svg width="18" height="12" style="flex-shrink:0;margin-top:2px">
                    <line x1="1" y1="6" x2="17" y2="6" stroke="${edgeColor}" stroke-width="2.5" ${dashAttr}/>
                </svg>
                <div class="gm-panel-name" style="font-size:11.5px">${edgeData.type || "Связь"}</div>
                <button class="gm-panel-close">✕</button>
            </div>
            <div class="gm-panel-badges">
                <span class="gm-panel-badge" style="border-color:${edgeColor};color:${edgeColor}">${dirIcon} ${dirLabel}</span>
            </div>
            ${edgeData.desc ? `<div class="gm-panel-def">${edgeData.desc}</div>` : ""}
            <div class="gm-panel-metrics">
                <div class="gm-panel-metric">
                    <span>Сила связи</span>
                    <div class="gm-panel-bar"><div style="width:${strPct}%;background:${edgeColor}"></div></div>
                    <span>${(edgeData.str || 0.5).toFixed(2)}</span>
                </div>
            </div>
            ${extMetrics}
            <div class="gm-panel-ep-divider"></div>
            ${srcBlock}
            ${isRefl ? "" : '<div class="gm-panel-ep-divider"></div>'}
            ${tgtBlock}
        `;

        panel.querySelector(".gm-panel-close").onclick = e => {
            e.stopPropagation();
            panel.classList.remove("visible");
        };

        requestAnimationFrame(() => panel.classList.add("visible"));
    }

      // ── Цвет узла: поддержка нескольких типов («этическая / онтологическая») ─────
      // Разделители: / · , ;
      function typeColor(t) {
        if (!t) return 0x95a5a6;
        const parts = t.split(/[\/·,;]+/).map(s => s.trim()).filter(Boolean);
        const colors = parts.map(part => {
          const lp = part.toLowerCase();
          // Ищем по ключам _nodeColorMap (fuzzy: stem.includes)
          for (const [k, v] of _nodeColorMap)
            if (lp.includes(k) || k.includes(lp)) return v;
          return null;
        });
        return _blendHex(colors);
      }

      function typeColorHex(t) {
              return "#" + typeColor(t).toString(16).padStart(6, "0");
      }

      function getTopRole(roles) {
        const list = roleMode === "structural"
          ? STRUCTURAL_PRIORITY
          : PROCEDURAL_PRIORITY;
        for (const r of list)
          if (roles.has(r)) return r;
        return null;
      }

      /**
       * Возвращает МАССИВ всех структурных маркеров для узла.
       * Каждый элемент — объект с полями type, strokeWidth, strokeDash, filter, innerShape, и т.д.
       * Если ролей нет — возвращает пустой массив.
       */
      function getStructuralMarkers(name) {
        const roles = getRolesFromLayer("structural", name);
        if (!roles.size) return [];

        const MARKER_DEFS = {
            core: {
                type: "core",
                strokeWidth: 2.5,
                strokeDash: null,
                filter: null,
                innerShape: true,
                innerScale: 0.55,
                innerDarken: 0.35,
                emissive3d: 0.15,
            },
            generative: {
                type: "generative",
                strokeWidth: 2,
                strokeDash: null,
                filter: "url(#glow-gen)",
                innerShape: false,
                emissive3d: 0.85,
                lightIntensity3d: 3.0,
            },
            bridge: {
                type: "bridge",
                strokeWidth: 2,
                strokeDash: "4,2.5",
                filter: null,
                innerShape: false,
                emissive3d: 0.15,
            },
            central: {
                type: "central",
                strokeWidth: 3.5,
                strokeDash: null,
                filter: null,
                innerShape: false,
                emissive3d: 0.30,
            },
            peripheral: {
                type: "peripheral",
                strokeWidth: 1,
                strokeDash: null,
                filter: null,
                innerShape: false,
                emissive3d: 0.05,
            },
        };

        const result = [];
        for (const r of STRUCTURAL_PRIORITY) {
            if (roles.has(r)) result.push(MARKER_DEFS[r]);
        }
        return result;
      }

      /** Обратная совместимость: возвращает маркер с наивысшим приоритетом (или null). */
      function getStructuralMarker(name) {
        const arr = getStructuralMarkers(name);
        return arr.length ? arr[0] : null;
      }

      // ── Чтение ролей из двухслойной топологии ─────────────────────────────
      function getRolesFromLayer(layer, name) {
        const map = G.topology?.roles?.[layer] || {};
        const r = map[name];
        if (!r) return new Set();
        if (r instanceof Set) return r;
        if (Array.isArray(r)) return new Set(r);
        return new Set();
      }

      function getRolesForMode(name) {
        return getRolesFromLayer(roleMode, name);
      }

      function getAllRoles(name) {
        const s = getRolesFromLayer("structural", name);
        const p = getRolesFromLayer("procedural", name);
        return new Set([...s, ...p]);
      }

      // Восьмиугольник и шестиугольник — кастомные, остальные через D3
      function polyPath(sides, r) {
        const pts = Array.from({ length: sides }, (_, i) => {
          const a = (i / sides) * 2 * Math.PI - Math.PI / 2;
          return [Math.cos(a) * r, Math.sin(a) * r];
        });
        return "M" + pts.map(p => p.join(",")).join("L") + "Z";
      }

      function hexStarPath(r) {
        const inner = r / Math.sqrt(3);
        let d = "";
        for (let i = 0; i < 12; i++) {
          const a   = (i * Math.PI / 6) - Math.PI / 2;  // 30° шаг, вершина вверху
          const rad = i % 2 === 0 ? r : inner;
          d += (i === 0 ? "M" : "L") + (Math.cos(a) * rad).toFixed(3) + "," + (Math.sin(a) * rad).toFixed(3);
        }
        return d + "Z";
      }

      /** Трапеция (основание шире верха) */
      function trapezoidPath(r) {
        const top = r * 0.6;
        const bot = r;
        const h = r * 0.8;
        return `M${-top},${-h} L${top},${-h} L${bot},${h} L${-bot},${h} Z`;
      }

      /** Прямоугольник (чуть вытянутый по горизонтали) */
      function rectPath(r) {
        const w = r * 1.2;
        const h = r * 0.8;
        return `M${-w},${-h} L${w},${-h} L${w},${h} L${-w},${h} Z`;
      }

      function nodeSymbolPath(d) {
        const r = 6 + d.cen * 14;
        const area = Math.PI * r * r;          // сохраняем площадь как у circle
        const role = getTopRole(d.roles);
        switch (role) {
          case "synthesis":    return polyPath(8, r);
          case "thesis":       return d3.symbol(d3.symbolTriangle, area)();
          case "antithesis":   return d3.symbol(d3.symbolTriangle, area)();   // + rotate ниже
          case "generative":   return polyPath(6, r);
          case "core":         return d3.symbol(d3.symbolSquare, area)();
          case "bridge":       return d3.symbol(d3.symbolSquare, area)();
          case "central":      return polyPath(5, r);
          case "deconstructed":return d3.symbol(d3.symbolCross, area)();
          case "reassembled": return hexStarPath(r);
          case "horizon-expansion":  return d3.symbol(d3.symbolDiamond, area)();
          case "pre-horizon":        return polyPath(7, r);
          case "integrating":        return d3.symbol(d3.symbolWye, area)();
          case "foundation":         return trapezoidPath(r);
          case "formalized":         return rectPath(r);
          case "verifying":          return d3.symbol(d3.symbolStar, area)();
          default:             return null;   // null → рисовать circle
        }
      }

      function nodeGeometry3D(role, r) {
        switch (role) {
          case "synthesis":     return new THREE.OctahedronGeometry(r, 0);
          case "thesis":        return new THREE.TetrahedronGeometry(r, 0);
          case "antithesis":    return new THREE.TetrahedronGeometry(r, 0);
          case "generative":    return new THREE.IcosahedronGeometry(r, 0);
          case "core":          return new THREE.OctahedronGeometry(r, 0);
          case "bridge":        return new THREE.BoxGeometry(r*1.6, r*1.6, r*1.6);
          case "central":       return new THREE.DodecahedronGeometry(r, 0);
          case "deconstructed": return new THREE.IcosahedronGeometry(r, 1);
          case "reassembled":   return new THREE.TetrahedronGeometry(r, 0);
          case "horizon-expansion":  return new THREE.ConeGeometry(r, r * 2, 8);
          case "pre-horizon":        return new THREE.CylinderGeometry(r, r, r * 0.5, 12);
          case "integrating":        return new THREE.TorusGeometry(r * 0.7, r * 0.3, 8, 12);
          case "foundation":         return new THREE.BoxGeometry(r * 2, r * 0.5, r * 2);
          case "formalized":         return new THREE.BoxGeometry(r * 1.4, r * 1.4, r * 1.4);
          case "verifying":          return new THREE.DodecahedronGeometry(r, 0);
          default:              return new THREE.SphereGeometry(r, 20, 20);
        }
      }

      function tick(ns, es, alpha, fixedIdx = null) {
        // Отталкивание
        for (let i = 0; i < ns.length; i++)
          for (let j = i + 1; j < ns.length; j++) {
            const dx = ns[j].x - ns[i].x, dy = ns[j].y - ns[i].y, dz = ns[j].z - ns[i].z;
            const d  = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
            const f  = (800 / (d*d)) * alpha;
            ns[i].vx -= (dx/d)*f; ns[i].vy -= (dy/d)*f; ns[i].vz -= (dz/d)*f;
            ns[j].vx += (dx/d)*f; ns[j].vy += (dy/d)*f; ns[j].vz += (dz/d)*f;
          }
        // Притяжение вдоль рёбер
        for (const e of es) {
          if (e.si === e.ti) continue;
          const s = ns[e.si], t = ns[e.ti];
          const dx = t.x - s.x, dy = t.y - s.y, dz = t.z - s.z;
          const d  = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
          const f  = (d - 30) * 0.05 * (e.str || 0.5) * alpha;
          s.vx += (dx/d)*f; s.vy += (dy/d)*f; s.vz += (dz/d)*f;
          t.vx -= (dx/d)*f; t.vy -= (dy/d)*f; t.vz -= (dz/d)*f;
        }
        // Центрирование + интеграция
        for (const n of ns) {
          if (n.id === fixedIdx) { n.vx = 0; n.vy = 0; n.vz = 0; continue; }
          n.vx -= n.x * 0.01 * alpha;
          n.vy -= n.y * 0.01 * alpha;
          n.vz -= n.z * 0.01 * alpha;
          n.x += n.vx; n.y += n.vy; n.z += n.vz;
          n.vx *= 0.85; n.vy *= 0.85; n.vz *= 0.85;
        }
      }

      function warmup(nodes, edges, dim) {
        const ns = nodes.map((n, i) => ({
          ...n, id: i,
          x: (Math.random() - 0.5) * 80,
          y: (Math.random() - 0.5) * 80,
          z: dim === 3 ? (Math.random() - 0.5) * 80 : 0,
          vx: 0, vy: 0, vz: 0,
        }));
        const nm = Object.fromEntries(G.nodes.map((n, i) => [n.name.toLowerCase(), i]));
        const es = edges
          .map((e) => ({
            ...e,
            si: nm[e.src.toLowerCase().trim()] ?? -1,
            ti: nm[e.tgt.toLowerCase().trim()] ?? -1,
          }))
          .filter((e) => e.si >= 0 && e.ti >= 0);
        for (let it = 0; it < 300; it++) {
          tick(ns, es, Math.max(0.01, 1 - it / 300));
        }
        return { ns, es };
      }

      function mkSprite(text) {
        const cv = document.createElement("canvas"),
          c = cv.getContext("2d");
        c.font = "28px IBM Plex Mono,monospace";
        const m = c.measureText(text);
        cv.width = m.width + 20;
        cv.height = 44;
        c.font = "28px IBM Plex Mono,monospace";
        c.fillStyle = "#c8c0b0";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(text, cv.width / 2, cv.height / 2);
        const tx = new THREE.CanvasTexture(cv);
        tx.minFilter = THREE.LinearFilter;
        const sp = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false }),
        );
        sp.scale.set(cv.width / 8, cv.height / 8, 1);
        return sp;
      }

      function build3D() {
        const ct = document.getElementById("view3d");
        const old = ct.querySelector("canvas");
        if (old) old.remove();
        if (renderer3d) { renderer3d.dispose(); renderer3d = null; }
        if (anim3d) cancelAnimationFrame(anim3d);
        if (sim2d) { sim2d.stop(); sim2d = null; }
        if (resizeObs3d) { resizeObs3d.disconnect(); resizeObs3d = null; }

        if (scene3d) {
          scene3d.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
              if (obj.material.map) obj.material.map.dispose();
              obj.material.dispose();
            }
          });
          scene3d = null;
        }

        const W = ct.clientWidth, H = ct.clientHeight;
        const { ns, es } = warmup(G.nodes, G.edges, 3);

        function getRoles(n) {
          return getRolesForMode(n.name);
        }

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a14);
        scene3d = scene;
        const cam = new THREE.PerspectiveCamera(50, W / H, 1, 2000);
        cam.position.set(0, 0, 150);
        renderer3d = new THREE.WebGLRenderer({ antialias: true });
        renderer3d.setSize(W, H);
        renderer3d.setPixelRatio(Math.min(devicePixelRatio, 2));
        ct.insertBefore(renderer3d.domElement, ct.firstChild);
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dl = new THREE.DirectionalLight(0xffffff, 0.8);
        dl.position.set(50, 80, 100);
        scene.add(dl);

        const meshes = [];
        const types = new Set();
        for (const n of ns) {
          const c    = typeColor(n.type);
          const cert = n.cert ?? 0.5;
          types.add(n.type || "другое");
          const r = 1.5 + n.cen * 3;

          // Процессуальная роль → геометрия (ВСЕГДА)
          const procRoles = getRolesFromLayer("procedural", n.name);
          const procRole  = (() => {
            for (const pr of PROCEDURAL_PRIORITY)
              if (procRoles.has(pr)) return pr;
            return null;
          })();
          const geometry = nodeGeometry3D(procRole, r);

          // Структурные маркеры (все роли)
          const sms = getStructuralMarkers(n.name);
          // emissive: берём максимальный из всех маркеров
          const emissiveInt = sms.length
            ? Math.max(...sms.map(s => s.emissive3d))
            : 0.15;

          const m = new THREE.Mesh(
            geometry,
            new THREE.MeshPhongMaterial({
              color: c,
              emissive: c,
              emissiveIntensity: emissiveInt,   // ← зависит от структурной роли
              transparent: true,
              opacity: 0.2 + cert * 0.65,
            }),
          );

          // ── Специфика процессуальных ролей (как было) ──
          if (procRole === "thesis") {
            m.quaternion.setFromUnitVectors(
              new THREE.Vector3(1, 1, 1).normalize(),
              new THREE.Vector3(0, 1, 0)
            );
          }
          if (procRole === "antithesis") {
            m.quaternion.setFromUnitVectors(
              new THREE.Vector3(1, 1, 1).normalize(),
              new THREE.Vector3(0, -1, 0)
            );
          }
          if (procRole === "deconstructed") {
            m.material.opacity = 0.05;
            const edges = new THREE.LineSegments(
              new THREE.EdgesGeometry(geometry),
              new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.8 }),
            );
            edges.userData = { baseOpacity: 0.8, baseEmissive: 0 };
            m.add(edges);
          }
          if (procRole === "reassembled") {
            m.material.side = THREE.DoubleSide;
            const geo2 = new THREE.TetrahedronGeometry(r, 0);
            const mat2 = new THREE.MeshPhongMaterial({
              color: c, emissive: c, emissiveIntensity: emissiveInt,
              transparent: true, opacity: 0.2 + cert * 0.65,
              side: THREE.DoubleSide,
            });
            const m2 = new THREE.Mesh(geo2, mat2);
            m2.scale.set(1, -1, 1);
            m2.userData = { baseOpacity: 0.2 + cert * 0.65, baseEmissive: emissiveInt };
            m.add(m2);
            m.quaternion.setFromUnitVectors(
              new THREE.Vector3(1, 1, 1).normalize(),
              new THREE.Vector3(0, 1, 0)
            );
          }
          if (procRole === "verifying") {
            m.material.opacity = 0.15;
            const edges = new THREE.LineSegments(
              new THREE.EdgesGeometry(geometry),
              new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9 }),
            );
            edges.userData = { baseOpacity: 0.9, baseEmissive: 0 };
            m.add(edges);
          }
          if (procRole === "foundation") {
            m.material.side = THREE.DoubleSide;
          }

          // ── Структурные маркеры (НОВОЕ) ──

          const smTypes = new Set(sms.map(s => s.type));

          // bridge — пунктирный wireframe + полупрозрачная оболочка
          if (smTypes.has("bridge")) {
              const hsl = _hexToHSL(c);
              const brightC = _hslToHex({ h: hsl.h, s: Math.min(1, hsl.s * 1.2), l: Math.min(0.92, hsl.l + 0.3) });
              // Пунктирный wireframe (аналог 2D strokeDash)
              const wf = new THREE.LineSegments(
                new THREE.EdgesGeometry(geometry),
                new THREE.LineDashedMaterial({
                  color: brightC, transparent: true, opacity: 1.0,
                  dashSize: 1.2, gapSize: 0.6, linewidth: 1,
                }),
              );
              wf.computeLineDistances();
              wf.userData = { baseOpacity: 1.0, baseEmissive: 0 };
              m.add(wf);
              // Полупрозрачная оболочка чуть крупнее тела — усиливает контур
              const shellGeo = nodeGeometry3D(procRole, r * 1.18);
              const shellMat = new THREE.MeshPhongMaterial({
                color: brightC, emissive: brightC, emissiveIntensity: 0.5,
                transparent: true, opacity: 0.22, depthWrite: false,
                side: THREE.DoubleSide,
              });
              const shell = new THREE.Mesh(shellGeo, shellMat);
              shell.userData = { baseOpacity: 0.22, baseEmissive: 0.5 };
              m.add(shell);
              m.material.opacity = Math.max(0.1, m.material.opacity - 0.15);
          }

          // core — внутреннее тело
          if (smTypes.has("core")) {
              m.material.opacity = Math.max(0.12, m.material.opacity - 0.25);
              m.material.depthWrite = false;
              const innerR   = r * 0.55;
              const innerGeo = nodeGeometry3D(procRole, innerR);
              const hsl      = _hexToHSL(c);
              const darkC    = _hslToHex({ h: hsl.h, s: hsl.s * 0.9, l: Math.max(0.08, hsl.l - 0.35) });
              const innerMat = new THREE.MeshPhongMaterial({
                color: darkC, emissive: darkC, emissiveIntensity: 0.1,
                transparent: true, opacity: 1.0,
              });
              const innerMesh = new THREE.Mesh(innerGeo, innerMat);
              innerMesh.userData = { baseOpacity: 1.0, baseEmissive: 0.1 };
              m.add(innerMesh);
              // Stella octangula: второй перевёрнутый тетраэдр внутри
              if (procRole === "reassembled") {
                const innerGeo2 = new THREE.TetrahedronGeometry(innerR, 0);
                const innerMat2 = new THREE.MeshPhongMaterial({
                  color: darkC, emissive: darkC, emissiveIntensity: 0.1,
                  transparent: true, opacity: 1.0,
                  side: THREE.DoubleSide,
                });
                const innerMesh2 = new THREE.Mesh(innerGeo2, innerMat2);
                innerMesh2.scale.set(1, -1, 1);
                innerMesh2.userData = { baseOpacity: 1.0, baseEmissive: 0.1 };
                m.add(innerMesh2);
              }
          }

          // generative — усиленный PointLight + glow-спрайт + масштаб
          if (smTypes.has("generative")) {
              const hexColor = parseInt(typeColorHex(n.type).slice(1), 16);
              const light = new THREE.PointLight(hexColor, 3.0, r * 35);
              light.position.set(0, 0, 0);
              light.userData = { baseIntensity: 3.0 };
              m.add(light);
              // Glow-спрайт с аддитивным смешиванием
              const glowCv = document.createElement("canvas");
              glowCv.width = 64; glowCv.height = 64;
              const gCtx = glowCv.getContext("2d");
              const grad = gCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
              const hexStr = "#" + hexColor.toString(16).padStart(6, "0");
              grad.addColorStop(0, hexStr);
              grad.addColorStop(0.4, hexStr + "88");
              grad.addColorStop(1, hexStr + "00");
              gCtx.fillStyle = grad;
              gCtx.fillRect(0, 0, 64, 64);
              const glowTex = new THREE.CanvasTexture(glowCv);
              const glowMat = new THREE.SpriteMaterial({
                map: glowTex, transparent: true, opacity: 0.7,
                blending: THREE.AdditiveBlending, depthWrite: false,
              });
              const glowSprite = new THREE.Sprite(glowMat);
              const glowSize = r * 4.5;
              glowSprite.scale.set(glowSize, glowSize, 1);
              glowSprite.userData = { baseOpacity: 0.7, baseEmissive: 0, baseGlowSize: glowSize };
              m.add(glowSprite);
              m.scale.setScalar(m.scale.x * 1.1);
          }

          // central — масштаб вверх
          if (smTypes.has("central")) {
              m.scale.setScalar(m.scale.x * 1.15);
          }

          // peripheral — масштаб вниз
          if (smTypes.has("peripheral")) {
              m.scale.setScalar(m.scale.x * 0.8);
          }

          m.position.set(n.x, n.y, n.z);
          const baseScale = m.scale.x;   // 1.0 или 1.1 для generative
          m.userData = {
            nodeIdx: n.id,
            baseOpacity: m.material.opacity,
            baseEmissive: emissiveInt,
            baseScale: m.scale.x,
          };
          scene.add(m);
          meshes.push(m);

          const sp = mkSprite(n.name);
          sp.position.set(n.x, n.y + r + 2.5, n.z);
          sp.userData = { labelFor: n.id };
          scene.add(sp);

          // Торические кольца кластеров — одно кольцо на каждый кластер узла.
          // Дочерние объекты mesh → следуют за узлом без ручного обновления.
          const clusterList = G.topology?.clusters?.[n.name] || [];
          clusterList.forEach((clIdx) => {
            const clColor = parseInt(
              (CPAL[clIdx % CPAL.length] || "#555555").replace("#", ""), 16
            );
            const torusR = r + 2.5;   // фиксированный: чуть больше тела узла
            const torus = new THREE.Mesh(
              new THREE.TorusGeometry(torusR, 0.5, 6, 24),
              new THREE.LineBasicMaterial({
                color: clColor, transparent: true,
                opacity: 0.55, depthWrite: false,
              }),
            );
            // Уникальный угол наклона для каждого кластера → различимы при пересечении
            torus.rotation.x = (clIdx * 1.3) % Math.PI;
            torus.rotation.z = (clIdx * 0.9) % Math.PI;
            torus.userData = { baseOpacity: 0.55 };
            m.add(torus);
          });
        }

        const edgeGeos      = [];  // { geo, si, ti }
        const edgeHitMeshes = [];  // { mesh, si, ti }
        const reflMeshes    = [];  // { mesh, si } — торусы вместо line geo
        const arrowMeshes   = [];  // { mesh, si, ti, pointsToTi }
        const edgeMaterials = [];  // все материалы рёбер для диммирования

        // [NEW] Обновляет позицию и ориентацию конуса-стрелки по текущим ns
        function updateCone(mesh, si, ti, pointsToTi) {
          const s = ns[si], t = ns[ti];
          const ev = new THREE.Vector3(t.x - s.x, t.y - s.y, t.z - s.z);
          const len = ev.length();
          if (len < 0.001) return;
          const dir = ev.divideScalar(len);
          if (pointsToTi) {
            const r = 1.5 + (t.cen || 0.5) * 3;
            mesh.position.copy(
              new THREE.Vector3(t.x, t.y, t.z).sub(dir.clone().multiplyScalar(r + 1.5))
            );
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          } else {
            const r = 1.5 + (s.cen || 0.5) * 3;
            const d2 = dir.clone().negate();
            mesh.position.copy(
              new THREE.Vector3(s.x, s.y, s.z).sub(d2.clone().multiplyScalar(r + 1.5))
            );
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d2);
          }
        }

        for (const e of es) {
          const s    = ns[e.si], t = ns[e.ti];
          const refl = e.dir.includes("рефлексив") || e.si === e.ti;
          const bi   = e.dir.includes("двунаправлен");

          // A1: цвет и пунктир по типу
          const { color: colHex, dash } = edgeTypeStyle(e.type);
          const col = parseInt(colHex.replace("#", ""), 16);
          const op  = 0.3 + (e.str || 0.5) * 0.5;

          if (refl) {
            const nodeR  = 1.5 + (s.cen || 0.5) * 1.5;
            const loopR  = nodeR * 1.8;
            const tubeR  = Math.max(0.2, nodeR * 0.1);
            const SEGS   = 48;
            const GAP    = Math.PI * 0.09; // ~32° разрыв у основания

            // Почти полная окружность в плоскости XY с разрывом внизу (где узел)
            // Центр окружности смещён вверх на nodeR + loopR, 
            // так что нижняя точка дуги совпадает с верхней границей узла
            const pts = [];
            const startA = -Math.PI / 2 + GAP / 2;
            for (let i = 0; i <= SEGS; i++) {
              const a = startA + (i / SEGS) * (2 * Math.PI - GAP);
              pts.push(new THREE.Vector3(
                Math.cos(a) * loopR,
                Math.sin(a) * loopR,
                0
              ));
            }
            const curve    = new THREE.CatmullRomCurve3(pts, false);
            const loopGeo  = new THREE.TubeGeometry(curve, SEGS, tubeR, 6, false);
            const loopMesh = new THREE.Mesh(
              loopGeo,
              new THREE.MeshPhongMaterial({
                color: col, emissive: col, emissiveIntensity: 0.2,
                transparent: true, opacity: op + 0.1,
              }),
            );
            // Центр петли — над узлом, разрыв приходится на поверхность
            loopMesh.position.set(s.x, s.y + nodeR + loopR, s.z);
            scene.add(loopMesh);
            reflMeshes.push({ mesh: loopMesh, si: e.si });
            loopMesh.material.userData = { baseOp: loopMesh.material.opacity };
            edgeMaterials.push(loopMesh.material);

            // Хитбокс — вертикальный тор как приближение петли
            const loopHit = new THREE.Mesh(
              new THREE.TorusGeometry(loopR, tubeR + 1.5, 6, 16),
              new THREE.MeshBasicMaterial({ visible: false }),
            );
            loopHit.position.set(s.x, s.y + nodeR + loopR, s.z);
            loopHit.userData = { edgeData: e };
            scene.add(loopHit);
            edgeHitMeshes.push({ mesh: loopHit, si: e.si, ti: e.ti });
          } else {
            // A1: LineDashedMaterial если тип требует пунктира
            let lineMat;
            if (dash) {
              const [dashSize, gapSize] = dash.split(",").map(Number);
              lineMat = new THREE.LineDashedMaterial({
                color: col, transparent: true, opacity: op,
                dashSize: dashSize ?? 3, gapSize: gapSize ?? 2,
              });
            } else {
              lineMat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op });
            }
            if (!lineMat.userData) lineMat.userData = {};
            lineMat.userData.baseOp = lineMat.opacity;
            edgeMaterials.push(lineMat);

            const geo = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(s.x, s.y, s.z),
              new THREE.Vector3(t.x, t.y, t.z),
            ]);
            const line = new THREE.Line(geo, lineMat);
            if (dash) line.computeLineDistances();
            line.userData = { si: e.si, ti: e.ti, baseOp: lineMat.opacity };
            scene.add(line);
            edgeGeos.push({ geo, si: e.si, ti: e.ti, line, isDashed: !!dash });

            // Конус к ti
            const dir = new THREE.Vector3(t.x - s.x, t.y - s.y, t.z - s.z).normalize();
            const tr  = 1.5 + (ns[e.ti].cen || 0.5) * 3;
            const ap  = new THREE.Vector3(t.x, t.y, t.z).sub(dir.clone().multiplyScalar(tr + 1.5));
            const cn  = new THREE.Mesh(
              new THREE.CylinderGeometry(0, 1, 3, 8),
              new THREE.MeshPhongMaterial({ color: col, transparent: true, opacity: op + 0.1 }),
            );
            cn.position.copy(ap);
            cn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            cn.userData = { si: e.si, ti: e.ti, baseOp: lineMat.opacity };
            scene.add(cn);
            arrowMeshes.push({ mesh: cn, si: e.si, ti: e.ti, pointsToTi: true });
            cn.material.userData = { baseOp: cn.material.opacity };
            edgeMaterials.push(cn.material);

            if (bi) {
              const d2  = dir.clone().negate();
              const sr  = 1.5 + (ns[e.si].cen || 0.5) * 3;
              const ap2 = new THREE.Vector3(s.x, s.y, s.z).sub(d2.clone().multiplyScalar(sr + 1.5));
              const cn2 = new THREE.Mesh(
                new THREE.CylinderGeometry(0, 1, 3, 8),
                new THREE.MeshPhongMaterial({ color: col, transparent: true, opacity: op + 0.1 }),
              );
              cn2.position.copy(ap2);
              cn2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d2);
              cn2.userData = { si: e.si, ti: e.ti, baseOp: lineMat.opacity };
              scene.add(cn2);
              arrowMeshes.push({ mesh: cn2, si: e.si, ti: e.ti, pointsToTi: false });
              cn2.material.userData = { baseOp: cn2.material.opacity };
              edgeMaterials.push(cn2.material);
            }

            // Хитбокс
            const edgeVec = new THREE.Vector3(t.x - s.x, t.y - s.y, t.z - s.z);
            const edgeLen = edgeVec.length();
            const hitMesh = new THREE.Mesh(
              new THREE.CylinderGeometry(2, 2, edgeLen, 6),
              new THREE.MeshBasicMaterial({ visible: false }),
            );
            hitMesh.position.set((s.x + t.x) / 2, (s.y + t.y) / 2, (s.z + t.z) / 2);
            hitMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), edgeVec.normalize());
            hitMesh.userData = { edgeData: e, _origLen: edgeLen };
            scene.add(hitMesh);
            edgeHitMeshes.push({ mesh: hitMesh, si: e.si, ti: e.ti });
          }
        }

        // A3 — кластерные оболочки (wireframe-эллипсоид) + спрайты-метки кластеров
        // Позиция и масштаб обновляются в updateAllVisuals по bounding box.
        const clusterShells      = [];  // { mesh, clusterIdx }
        const clusterLabelSprites = []; // { sprite, clusterIdx }
        {
          const topo   = G.topology;
          const labels = topo?.clusterLabels || [];
          if (labels.length > 0) {
            // Группируем ns по кластерам
            const clusterNodes = {};
            for (const n of ns) {
              const clusterList = topo.clusters?.[n.name] || [];
              for (const idx of clusterList) {
                if (!clusterNodes[idx]) clusterNodes[idx] = [];
                clusterNodes[idx].push(n);
              }
            }
            for (const [idxStr, members] of Object.entries(clusterNodes)) {
              const idx   = Number(idxStr);
              const color = parseInt((CPAL[idx % CPAL.length] || "#555555").replace("#", ""), 16);

              // Wireframe-эллипсоид: EdgesGeometry поверх SphereGeometry(1,…)
              // Итоговая форма задаётся через mesh.scale в updateAllVisuals
              const sphereGeo = new THREE.SphereGeometry(1, 10, 8);
              const shell = new THREE.LineSegments(
                new THREE.EdgesGeometry(sphereGeo),
                new THREE.LineBasicMaterial({
                  color, transparent: true, opacity: 0.18, depthWrite: false,
                }),
              );
              shell.userData = { clusterIdx: idx };
              scene.add(shell);
              clusterShells.push({ mesh: shell, clusterIdx: idx });

              // Спрайт-метка кластера (имя без римского префикса)
              const rawLabel = labels[idx] || `Кластер ${idx + 1}`;
              const labelText = rawLabel.replace(/^[IVXLCDM]+\s*[-–—]\s*/i, "").trim();
              const labelSpr = mkSprite(labelText);
              labelSpr.userData = { clusterLabelIdx: idx };
              scene.add(labelSpr);
              clusterLabelSprites.push({ sprite: labelSpr, clusterIdx: idx });
            }
          }
        }

        // [NEW] ── Живая силовая симуляция ──────────────────────────────────────
        let simAlpha    = 0;
        let fixedNodeIdx = null; // индекс перетаскиваемого узла в ns

        // [NEW] Обновляет все Three.js-объекты по текущим позициям ns
        function updateAllVisuals() {
          // Сферы-узлы
          meshes.forEach((m) => {
            const n = ns[m.userData.nodeIdx];
            m.position.set(n.x, n.y, n.z);
          });
          // Метки-спрайты
          scene.children.forEach((c) => {
            if (c.userData?.labelFor != null) {
              const n = ns[c.userData.labelFor];
              const r = 1.5 + (n.cen || 0.5) * 3;
              c.position.set(n.x, n.y + r + 2.5, n.z);
            }
          });
          // Линии рёбер
          for (const eg of edgeGeos) {
            const pos = eg.geo.attributes.position;
            pos.setXYZ(0, ns[eg.si].x, ns[eg.si].y, ns[eg.si].z);
            pos.setXYZ(1, ns[eg.ti].x, ns[eg.ti].y, ns[eg.ti].z);
            pos.needsUpdate = true;
            if (eg.isDashed) eg.line.computeLineDistances();
          }
          // Рефлексивные петли
          for (const { mesh, si } of reflMeshes) {
            const n     = ns[si];
            const nodeR = 1.5 + (n.cen || 0.5) * 1.5;
            const loopR = nodeR * 1.8;
            mesh.position.set(n.x, n.y + nodeR + loopR, n.z);
          }
          // Конусы-стрелки
          for (const { mesh, si, ti, pointsToTi } of arrowMeshes) {
            updateCone(mesh, si, ti, pointsToTi);
          }
          // Хитбоксы рёбер
          for (const { mesh, si, ti } of edgeHitMeshes) {
            if (si === ti) {
              const n     = ns[si];
              const nodeR = 1.5 + (n.cen || 0.5) * 1.5;
              const loopR = nodeR * 1.8;
              mesh.position.set(n.x, n.y + nodeR + loopR, n.z);
            } else {
              const a = ns[si], b = ns[ti];
              const ev  = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
              const len = ev.length();
              mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
              if (len > 0.001) {
                mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ev.normalize());
                mesh.scale.y = len / mesh.userData._origLen;
              }
            }
          }
          // A3: wireframe-эллипсоиды — bounding box по осям + спрайты-метки
          if (clusterShells.length) {
            const topo = G.topology;
            const PAD  = 12;  // отступ вокруг крайних узлов

            // Общий расчёт центроидов (нужен и для оболочек, и для меток)
            const centroids = {};
            for (const { clusterIdx } of clusterShells) {
              const members = ns.filter(n =>
                (topo.clusters?.[n.name] || []).includes(clusterIdx)
              );
              if (!members.length) continue;
              centroids[clusterIdx] = {
                cx: members.reduce((s, n) => s + n.x, 0) / members.length,
                cy: members.reduce((s, n) => s + n.y, 0) / members.length,
                cz: members.reduce((s, n) => s + n.z, 0) / members.length,
                members,
              };
            }

            // Wireframe-эллипсоиды: scale по полуосям bounding box
            for (const { mesh, clusterIdx } of clusterShells) {
              const c = centroids[clusterIdx];
              if (!c) continue;
              const { cx, cy, cz, members } = c;
              mesh.position.set(cx, cy, cz);

              const xs = members.map(n => n.x);
              const ys = members.map(n => n.y);
              const zs = members.map(n => n.z);
              // Полуось = (max - min) / 2 + отступ; минимум PAD (для одиночных узлов)
              mesh.scale.set(
                Math.max(PAD, (Math.max(...xs) - Math.min(...xs)) / 2 + PAD),
                Math.max(PAD, (Math.max(...ys) - Math.min(...ys)) / 2 + PAD),
                Math.max(PAD, (Math.max(...zs) - Math.min(...zs)) / 2 + PAD),
              );
            }

            // Спрайты-метки: позиционируем над верхней границей эллипсоида
            for (const { sprite, clusterIdx } of clusterLabelSprites) {
              const c = centroids[clusterIdx];
              if (!c) continue;
              const ys     = c.members.map(n => n.y);
              const topY   = Math.max(...ys) + PAD + 6;
              sprite.position.set(c.cx, topY, c.cz);
            }
          }
        }
        // ──────────────────────────────────────────────────────────────────────────

        let isDrag = false, isOrbit = false, pX = 0, pY = 0;
        let rotX = 0, rotY = 0, zoom = 150, dragNode = null;
        let orbitVX = 0, orbitVY = 0;
        let hoveredMesh = null;
        let selectedMesh3d = null;
        let selectedEdge3d = null;     
        let mouseDownX = 0, mouseDownY = 0;

        // Граф соседства: nodeIdx → Set<nodeIdx>
        const neighbors = {};
        for (const n of ns) neighbors[n.id] = new Set();
        for (const e of es) {
          if (e.si !== e.ti) {
            neighbors[e.si].add(e.ti);
            neighbors[e.ti].add(e.si);
          }
        }

        const DIM_OPACITY = 0.06;
        const DIM_EMISSIVE = 0.02;
        
        function resetAll3d() {
          meshes.forEach(m => {
            m.material.opacity           = m.userData.baseOpacity;
            m.material.emissiveIntensity = m.userData.baseEmissive ?? 0.15;  // ← из userData
            m.scale.setScalar(m.userData.baseScale ?? 1);
            // Восстанавливаем дочерние объекты (кольца, каркасы, тетраэдры, inner mesh, PointLight)
            m.children.forEach(c => {
              if (c.isLight) {
                // PointLight (generative)
                c.intensity = c.userData?.baseIntensity ?? 0.6;
              } else if (c.material && c.userData?.baseOpacity != null) {
                c.material.opacity = c.userData.baseOpacity;
                if (c.material.emissiveIntensity !== undefined)
                  c.material.emissiveIntensity = c.userData?.baseEmissive ?? 0.15;
              }
            });
          });
          edgeMaterials.forEach(mat => {
            mat.opacity = mat.userData?.baseOp ?? mat.opacity;
          });
          scene.children.forEach(c => {
            if (c.userData?.labelFor != null) c.material.opacity = 0.9;
            if ((c.isLine || c.isMesh) && c.userData?.si !== undefined)
              c.material.opacity = c.material.userData?.baseOp ?? c.material.opacity;
          });
        }

        function setHover(mesh) {
          if (hoveredMesh === mesh) return;
        
          // ── Сброс предыдущего hover ─────────────────────────────────────
          if (hoveredMesh) {
            const wasSelected = selectedMesh3d === hoveredMesh;
            const bs = hoveredMesh.userData.baseScale ?? 1;
            hoveredMesh.scale.setScalar(wasSelected ? bs * 1.3 : bs);
            hoveredMesh.material.emissiveIntensity = wasSelected
              ? 0.6
              : (hoveredMesh.userData.baseEmissive ?? 0.15);
        
            // Соседние узлы
            const prevIdx = hoveredMesh.userData.nodeIdx;
            const prevNbrs = neighbors[prevIdx] || new Set();
            meshes.forEach(m => {
              if (prevNbrs.has(m.userData.nodeIdx))
                m.material.emissiveIntensity = selectedMesh3d
                  ? DIM_EMISSIVE
                  : (m.userData.baseEmissive ?? 0.15);
            });
        
            // Рёбра — через массивы напрямую
            if (!selectedMesh3d && !selectedEdge3d && !legendFilter) {
              for (const eg of edgeGeos)
                eg.line.material.opacity = eg.line.material.userData?.baseOp ?? eg.line.material.opacity;
              for (const { mesh: arrow } of arrowMeshes)
                arrow.material.opacity = arrow.material.userData?.baseOp ?? arrow.material.opacity;
              for (const { mesh: torus } of reflMeshes)
                torus.material.opacity = torus.material.userData?.baseOp ?? torus.material.opacity;
            }
          }
        
          hoveredMesh = mesh;
          if (!mesh) {
            // Если фильтр легенды активен — восстановить его после сброса hover
            if (legendFilter) {
              if (legendFilter.type === "role") applyRoleFilter3d(legendFilter.key, legendFilter.layer);
              else if (legendFilter.type === "cluster") applyClusterFilter3d(legendFilter.idx);
            }
            return;
          }
        
          const hovIdx = mesh.userData.nodeIdx;
          const nbrs   = neighbors[hovIdx] || new Set();
          const visSet = new Set([hovIdx, ...nbrs]);
        
          // Подсветка соседних узлов и рёбер — только если нет активного выделения / фильтра
          if (!selectedMesh3d && !selectedEdge3d && !legendFilter) {
            meshes.forEach(m => {
              if (nbrs.has(m.userData.nodeIdx))
                m.material.emissiveIntensity = 0.45;
            });

            for (const eg of edgeGeos) {
              if (visSet.has(eg.si) && visSet.has(eg.ti))
                eg.line.material.opacity =
                  Math.min(1, (eg.line.material.userData?.baseOp ?? 0.5) * 2.2);
            }
            for (const { mesh: arrow, si, ti } of arrowMeshes) {
              if (visSet.has(si) && visSet.has(ti))
                arrow.material.opacity =
                  Math.min(1, (arrow.material.userData?.baseOp ?? 0.5) * 2.2);
            }
            for (const { mesh: torus, si } of reflMeshes) {
              if (si === hovIdx)
                torus.material.opacity =
                  Math.min(1, (torus.material.userData?.baseOp ?? 0.5) * 2.2);
            }
          }
        
          // ── Подсветка самого узла (не при фильтре легенды) ──────────
          if (!legendFilter) {
            mesh.scale.setScalar((mesh.userData.baseScale ?? 1) * 1.3);
            mesh.material.emissiveIntensity = 0.6;
          }
        }

        function setEdgeHover3d(edgeInfo) {
          // edgeInfo: { edgeData, si, ti } или null
          if (selectedMesh3d || selectedEdge3d || legendFilter) return;  // не ломать активное выделение / фильтр

          if (!edgeInfo) {
            // Сброс hover → resetAll3d
            resetAll3d();
            return;
          }

          const { si, ti } = edgeInfo;
          const endpointSet = new Set([si, ti]);

          // Подсветка узлов-концов
          meshes.forEach(m => {
            if (endpointSet.has(m.userData.nodeIdx))
              m.material.emissiveIntensity = 0.45;
          });

          // Подсветка связи
          for (const eg of edgeGeos) {
            if ((eg.si === si && eg.ti === ti) || (eg.si === ti && eg.ti === si))
              eg.line.material.opacity = Math.min(1, (eg.line.material.userData?.baseOp ?? 0.5) * 2.2);
          }
          for (const { mesh: arrow, si: aSi, ti: aTi } of arrowMeshes) {
            if ((aSi === si && aTi === ti) || (aSi === ti && aTi === si))
              arrow.material.opacity = Math.min(1, (arrow.material.userData?.baseOp ?? 0.5) * 2.2);
          }
          for (const { mesh: torus, si: rSi } of reflMeshes) {
            if (rSi === si && si === ti)
              torus.material.opacity = Math.min(1, (torus.material.userData?.baseOp ?? 0.5) * 2.2);
          }
        }

        function setEdgeSelected3d(edgeInfo) {
          // Снимаем предыдущее
          if (selectedMesh3d) { resetAll3d(); selectedMesh3d = null; }
          if (selectedEdge3d) { resetAll3d(); selectedEdge3d = null; }

          if (!edgeInfo) return;
          selectedEdge3d = edgeInfo;

          const { si, ti } = edgeInfo;
          const endpointSet = new Set([si, ti]);

          // Диммируем все узлы, кроме концов связи
          meshes.forEach(m => {
            const idx = m.userData.nodeIdx;
            if (!endpointSet.has(idx)) {
              m.material.opacity           = DIM_OPACITY;
              m.material.emissiveIntensity = DIM_EMISSIVE;
              m.children.forEach(c => {
                if (c.isLight) {
                  c.intensity = DIM_EMISSIVE * 0.1;
                } else if (c.material) {
                  c.material.opacity = DIM_OPACITY;
                  if (c.material.emissiveIntensity !== undefined)
                    c.material.emissiveIntensity = DIM_EMISSIVE;
                }
              });
            } else {
              // Подсвечиваем концы
              m.material.emissiveIntensity = Math.max(0.45, m.userData.baseEmissive ?? 0.15);
            }
          });

          // Диммируем метки
          scene.children.forEach(c => {
            if (c.userData?.labelFor != null && !endpointSet.has(c.userData.labelFor))
              c.material.opacity = DIM_OPACITY;
          });

          // Диммируем ВСЕ рёбра
          for (const eg of edgeGeos)
            eg.line.material.opacity = (eg.line.material.userData?.baseOp ?? eg.line.material.opacity) * 0.08;
          for (const { mesh: arrow } of arrowMeshes)
            arrow.material.opacity = (arrow.material.userData?.baseOp ?? arrow.material.opacity) * 0.08;
          for (const { mesh: torus } of reflMeshes)
            torus.material.opacity = (torus.material.userData?.baseOp ?? torus.material.opacity) * 0.08;

          // Восстанавливаем только выбранное ребро
          for (const eg of edgeGeos) {
            if ((eg.si === si && eg.ti === ti) || (eg.si === ti && eg.ti === si))
              eg.line.material.opacity = Math.min(1, (eg.line.material.userData?.baseOp ?? 0.5) * 1.5);
          }
          for (const { mesh: arrow, si: aSi, ti: aTi } of arrowMeshes) {
            if ((aSi === si && aTi === ti) || (aSi === ti && aTi === si))
              arrow.material.opacity = Math.min(1, (arrow.material.userData?.baseOp ?? 0.5) * 1.5);
          }
          for (const { mesh: torus, si: rSi } of reflMeshes) {
            if (rSi === si && si === ti)
              torus.material.opacity = Math.min(1, (torus.material.userData?.baseOp ?? 0.5) * 1.5);
          }
        }

        function setSelected(mesh) {
          // Снимаем старый selected
          if (selectedMesh3d) {
            resetAll3d();
            selectedMesh3d = null;
          }

          selectedMesh3d = mesh;
          if (!mesh) return;

          const selIdx = mesh.userData.nodeIdx;
          const nbrs   = neighbors[selIdx] || new Set();
          const visSet = new Set([selIdx, ...nbrs]);

          // Диммируем не-соседей (то же, что раньше делал hover)
          meshes.forEach(m => {
            const idx = m.userData.nodeIdx;
            if (!visSet.has(idx)) {
              m.material.opacity           = DIM_OPACITY;
              m.material.emissiveIntensity = DIM_EMISSIVE;
              // Затеняем все дочерние: inner mesh, wireframe, PointLight
              m.children.forEach(c => {
                if (c.isLight) {
                  // Приглушаем свет (не выключаем полностью — иначе резкий скачок)
                  c.intensity = DIM_EMISSIVE * 0.1;
                } else if (c.material) {
                  c.material.opacity = DIM_OPACITY;
                  if (c.material.emissiveIntensity !== undefined)
                    c.material.emissiveIntensity = DIM_EMISSIVE;
                }
              });
            }
          });
          scene.children.forEach(c => {
            if (c.userData?.labelFor != null && !visSet.has(c.userData.labelFor))
              c.material.opacity = DIM_OPACITY;
          });
          for (const eg of edgeGeos)
            eg.line.material.opacity = (eg.line.material.userData?.baseOp ?? eg.line.material.opacity) * 0.08;
          for (const { mesh: arrow, si, ti } of arrowMeshes)
            arrow.material.opacity = (arrow.material.userData?.baseOp ?? arrow.material.opacity) * 0.08;
          for (const { mesh: torus, si } of reflMeshes)
            torus.material.opacity = (torus.material.userData?.baseOp ?? torus.material.opacity) * 0.08;

          // Восстанавливаем только рёбра, непосредственно связанные с selIdx
          for (const eg of edgeGeos) {
            if (eg.si === selIdx || eg.ti === selIdx)
              eg.line.material.opacity = eg.line.material.userData?.baseOp ?? 0.5;
          }
          for (const { mesh: arrow, si, ti } of arrowMeshes) {
            if (si === selIdx || ti === selIdx)
              arrow.material.opacity = arrow.material.userData?.baseOp ?? 0.5;
          }
          for (const { mesh: torus, si } of reflMeshes) {
            if (si === selIdx)
              torus.material.opacity = torus.material.userData?.baseOp ?? 0.5;
          };

          // Подсвечиваем выбранный узел
          mesh.scale.setScalar((mesh.userData.baseScale ?? 1) * 1.3);
          mesh.material.emissiveIntensity = Math.max(0.6, mesh.userData.baseEmissive ?? 0.15);
          // Для generative (baseEmissive = 0.55) → max(0.6, 0.55) = 0.6
          // Для peripheral (baseEmissive = 0.05) → max(0.6, 0.05) = 0.6
          // Визуально одинаково при выделении, но формула корректна.

          // Восстанавливаем дочерние объекты выбранного узла
          mesh.children.forEach(c => {
            if (c.isLight) {
              c.intensity = c.userData?.baseIntensity ?? 0.6;
            } else if (c.material && c.userData?.baseOpacity != null) {
              c.material.opacity = c.userData.baseOpacity;
              if (c.material.emissiveIntensity !== undefined)
                c.material.emissiveIntensity = c.userData?.baseEmissive ?? 0.15;
            }
          });
        }

        // ── Фильтрация из легенды: роль ──────────────────────────────────────
        function applyRoleFilter3d(roleKey, layer) {
          resetAll3d();
          selectedMesh3d = null;
          selectedEdge3d = null;
          const matchSet = new Set();
          ns.forEach((n, i) => {
            const roles = getRolesFromLayer(layer, n.name);
            if (roles.has(roleKey)) matchSet.add(i);
          });
          meshes.forEach(m => {
            const idx = m.userData.nodeIdx;
            if (!matchSet.has(idx)) {
              m.material.opacity = DIM_OPACITY;
              m.material.emissiveIntensity = DIM_EMISSIVE;
              m.children.forEach(c => {
                if (c.isLight) c.intensity = DIM_EMISSIVE * 0.1;
                else if (c.material) {
                  c.material.opacity = DIM_OPACITY;
                  if (c.material.emissiveIntensity !== undefined)
                    c.material.emissiveIntensity = DIM_EMISSIVE;
                }
              });
            } else {
              m.material.emissiveIntensity = Math.max(0.45, m.userData.baseEmissive ?? 0.15);
            }
          });
          scene.children.forEach(c => {
            if (c.userData?.labelFor != null && !matchSet.has(c.userData.labelFor))
              c.material.opacity = DIM_OPACITY;
          });
          for (const eg of edgeGeos)
            eg.line.material.opacity = (matchSet.has(eg.si) && matchSet.has(eg.ti))
              ? (eg.line.material.userData?.baseOp ?? 0.5)
              : (eg.line.material.userData?.baseOp ?? 0.5) * 0.08;
          for (const { mesh: arrow, si, ti } of arrowMeshes)
            arrow.material.opacity = (matchSet.has(si) && matchSet.has(ti))
              ? (arrow.material.userData?.baseOp ?? 0.5)
              : (arrow.material.userData?.baseOp ?? 0.5) * 0.08;
          for (const { mesh: torus, si } of reflMeshes)
            torus.material.opacity = matchSet.has(si)
              ? (torus.material.userData?.baseOp ?? 0.5)
              : (torus.material.userData?.baseOp ?? 0.5) * 0.08;
          // Восстановить видимость кластерных оболочек (могли быть скрыты фильтром кластера)
          applyClusters3D();
        }

        // ── Фильтрация из легенды: кластер ──────────────────────────────────
        function applyClusterFilter3d(clusterIdx) {
          resetAll3d();
          selectedMesh3d = null;
          selectedEdge3d = null;
          const topo = G.topology;
          const matchSet = new Set();
          ns.forEach((n, i) => {
            const cl = topo?.clusters?.[n.name] || [];
            if (cl.includes(clusterIdx)) matchSet.add(i);
          });
          meshes.forEach(m => {
            const idx = m.userData.nodeIdx;
            if (!matchSet.has(idx)) {
              m.material.opacity = DIM_OPACITY;
              m.material.emissiveIntensity = DIM_EMISSIVE;
              m.children.forEach(c => {
                if (c.isLight) c.intensity = DIM_EMISSIVE * 0.1;
                else if (c.material) {
                  c.material.opacity = DIM_OPACITY;
                  if (c.material.emissiveIntensity !== undefined)
                    c.material.emissiveIntensity = DIM_EMISSIVE;
                }
              });
            } else {
              m.material.emissiveIntensity = Math.max(0.45, m.userData.baseEmissive ?? 0.15);
            }
          });
          scene.children.forEach(c => {
            if (c.userData?.labelFor != null && !matchSet.has(c.userData.labelFor))
              c.material.opacity = DIM_OPACITY;
          });
          for (const eg of edgeGeos)
            eg.line.material.opacity = (matchSet.has(eg.si) && matchSet.has(eg.ti))
              ? (eg.line.material.userData?.baseOp ?? 0.5)
              : (eg.line.material.userData?.baseOp ?? 0.5) * 0.08;
          for (const { mesh: arrow, si, ti } of arrowMeshes)
            arrow.material.opacity = (matchSet.has(si) && matchSet.has(ti))
              ? (arrow.material.userData?.baseOp ?? 0.5)
              : (arrow.material.userData?.baseOp ?? 0.5) * 0.08;
          for (const { mesh: torus, si } of reflMeshes)
            torus.material.opacity = matchSet.has(si)
              ? (torus.material.userData?.baseOp ?? 0.5)
              : (torus.material.userData?.baseOp ?? 0.5) * 0.08;
          // Показать только оболочку выбранного кластера
          if (clusterVisible) {
            clusterShells.forEach(({ mesh, clusterIdx: ci }) => {
              mesh.visible = (ci === clusterIdx);
            });
            clusterLabelSprites.forEach(({ sprite, clusterIdx: ci }) => {
              sprite.visible = (ci === clusterIdx);
            });
          }
        }

        const raycaster   = new THREE.Raycaster();
        const mouse       = new THREE.Vector2();
        const plane       = new THREE.Plane();
        const intersection = new THREE.Vector3();
        const cv          = renderer3d.domElement;
        const tooltip     = document.getElementById("graph-tooltip"); // [PREV]

        cv.addEventListener("mousedown", (e) => {
            mouseDownX = e.clientX;  // A6
            mouseDownY = e.clientY;  // A6
          raycaster.setFromCamera(mouse, cam);
          const hits = raycaster.intersectObjects(meshes);
          if (hits.length > 0) {
            dragNode = hits[0].object;
            fixedNodeIdx = dragNode.userData.nodeIdx; // [NEW]
            simAlpha = Math.max(simAlpha, 0.3);       // [NEW]
            plane.setFromNormalAndCoplanarPoint(
              cam.getWorldDirection(new THREE.Vector3()).negate(),
              dragNode.position,
            );
            cv.style.cursor = "grabbing";
          } else {
            // Не ставим isOrbit, если луч попал в хитбокс связи
            const eHits = raycaster.intersectObjects(edgeHitMeshes.map(h => h.mesh));
            if (eHits.length === 0) isOrbit = true;
          }
          pX = e.clientX;
          pY = e.clientY;
        });

        cv.addEventListener("mousemove", (e) => {
          // [PREV] Hover-тултип
          if (!dragNode && !isOrbit) {
            mouse.x = (e.offsetX / cv.clientWidth) * 2 - 1;
            mouse.y = -(e.offsetY / cv.clientHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, cam);
            const nodeHits = raycaster.intersectObjects(meshes);
            if (nodeHits.length > 0) {
              const hit = nodeHits[0].object;
              setHover(hit);
              const n = ns[hit.userData.nodeIdx];
              tooltip.style.display = "block";
              tooltip.style.left = (e.clientX + 14) + "px";
              tooltip.style.top  = (e.clientY - 10) + "px";
              tooltip.textContent = `${n.name}\n[${normalizeType(n.type)}]\n${n.def}`;
              cv.style.cursor = "pointer";
            } else {
              setHover(null);
              const edgeHits = raycaster.intersectObjects(edgeHitMeshes.map((h) => h.mesh));
              if (edgeHits.length > 0) {
                const hitObj = edgeHits[0].object;
                const ed = hitObj.userData.edgeData;
                // Hover-подсветка связи + концов
                const hitEntry = edgeHitMeshes.find(h => h.mesh === hitObj);
                if (hitEntry) setEdgeHover3d({ edgeData: ed, si: hitEntry.si, ti: hitEntry.ti });
                tooltip.style.display = "block";
                tooltip.style.left = (e.clientX + 14) + "px";
                tooltip.style.top  = (e.clientY - 10) + "px";
                tooltip.textContent = `${ed.desc}\n[${ed.type}]\n${ed.dir}`;
                cv.style.cursor = "pointer";
              } else {
                setEdgeHover3d(null);
                tooltip.style.display = "none";
                cv.style.cursor = "";
              }
            }
          }

          if (dragNode) {
            tooltip.style.display = "none";
            mouse.x = (e.offsetX / cv.clientWidth) * 2 - 1;
            mouse.y = -(e.offsetY / cv.clientHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, cam);
            if (raycaster.ray.intersectPlane(plane, intersection)) {
              const nodeIdx = dragNode.userData.nodeIdx;
              ns[nodeIdx].x = intersection.x; // [NEW] позиция в ns — источник правды
              ns[nodeIdx].y = intersection.y; // updateAllVisuals в animate обновит всё
              ns[nodeIdx].z = intersection.z;
              simAlpha = Math.max(simAlpha, 0.3); // [NEW] держим симуляцию живой
            }
          } else if (isOrbit) {
            tooltip.style.display = "none";
            const dX = (e.clientX - pX) * 0.005;
            const dY = (e.clientY - pY) * 0.005;
            orbitVX = dX;
            orbitVY = dY;
            rotY += dX;
            rotX += dY;
            rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
            pX = e.clientX;
            pY = e.clientY;
          }
        });

        cv.addEventListener("mouseup", (e) => {
          const moved = Math.hypot(e.clientX - mouseDownX, e.clientY - mouseDownY);  // A6

          // A6: если движения почти не было — это клик, а не начало drag/orbit
          if (moved < 5 && !isOrbit) {
            clearLegendFilter();
            mouse.x = (e.offsetX / cv.clientWidth) * 2 - 1;
            mouse.y = -(e.offsetY / cv.clientHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, cam);
            const hits = raycaster.intersectObjects(meshes);
            
            if (hits.length > 0) {
              // ── Тап по узлу ──
              if (selectedEdge3d) { resetAll3d(); selectedEdge3d = null; }

              const hitMesh = hits[0].object;
              const nodeIdx = hitMesh.userData.nodeIdx;
          
              if (selectedMesh3d === hitMesh) {
                setSelected(null);
                const panel = ct.querySelector(".gm-info-panel");
                if (panel) panel.classList.remove("visible");
              } else {
                setSelected(hitMesh);
                const n = ns[nodeIdx];
                const nodeData = {
                  ...G.nodes[nodeIdx],
                  id:      nodeIdx,
                  cluster: G.topology?.clusters?.[n.name] ?? [],
                  roles:   getRolesForMode(n.name),
                  structuralRoles: getRolesFromLayer("structural", n.name),
                  proceduralRoles: getRolesFromLayer("procedural", n.name),
                };
                const nm = Object.fromEntries(G.nodes.map((nd, i) => [nd.name.toLowerCase(), i]));
                const links3d = G.edges.map(ed => ({
                  source: { id: nm[ed.src.toLowerCase()] ?? -1, name: ed.src },
                  target: { id: nm[ed.tgt.toLowerCase()] ?? -1, name: ed.tgt },
                  type: ed.type, dir: ed.dir, str: ed.str, desc: ed.desc,
                })).filter(l => l.source.id >= 0 && l.target.id >= 0);
                showNodePanel(ct, nodeData, links3d, G.topology?.clusterLabels || []);
              }
            } else {
              // ── Проверяем тап по связи ──
              const edgeHits = raycaster.intersectObjects(edgeHitMeshes.map(h => h.mesh));
              if (edgeHits.length > 0) {
                const hitObj = edgeHits[0].object;
                const ed = hitObj.userData.edgeData;
                const hitEntry = edgeHitMeshes.find(h => h.mesh === hitObj);
                if (hitEntry) {
                  if (selectedEdge3d &&
                      selectedEdge3d.si === hitEntry.si &&
                      selectedEdge3d.ti === hitEntry.ti &&
                      selectedEdge3d.edgeData.type === ed.type) {
                    setEdgeSelected3d(null);
                    const panel = ct.querySelector(".gm-info-panel");
                    if (panel) panel.classList.remove("visible");
                  } else {
                    if (selectedMesh3d) { resetAll3d(); selectedMesh3d = null; }
                    setEdgeSelected3d({ edgeData: ed, si: hitEntry.si, ti: hitEntry.ti });
                    showEdgePanel(ct, ed, G.nodes, G.topology?.clusterLabels || []);
                  }
                }
              } else {
                // Тап по пустому месту — снять всё
                setSelected(null);
                setEdgeSelected3d(null);
                const panel = ct.querySelector(".gm-info-panel");
                if (panel) panel.classList.remove("visible");
              }
            }
          }

          if (moved < 5 && isOrbit) {
            clearLegendFilter();
            setSelected(null);
            setEdgeSelected3d(null);
            const panel = ct.querySelector(".gm-info-panel");
            if (panel) panel.classList.remove("visible");
          }

          isDrag = false;
          isOrbit = false;
          dragNode = null;
          fixedNodeIdx = null;
          simAlpha = Math.max(simAlpha, 0.4);
          cv.style.cursor = "";
        });
        cv.addEventListener("mouseleave", () => {
          isOrbit = false;
          dragNode = null;
          fixedNodeIdx = null;
          setHover(null);
          tooltip.style.display = "none";
        });
        cv.addEventListener("wheel", (e) => {
          zoom = Math.max(30, Math.min(400, zoom + e.deltaY * 0.1));
          e.preventDefault();
        }, { passive: false });
        cv.addEventListener("dblclick", () => {
          rotX = 0; rotY = 0; zoom = 150;
        });
        
        function getTouchPos(e) {
          const rect = cv.getBoundingClientRect();
          const t = e.touches[0] || e.changedTouches[0];
          return { clientX: t.clientX, clientY: t.clientY,
                   offsetX: t.clientX - rect.left, offsetY: t.clientY - rect.top };
        }
        
        let lastPinchDist = null;
        
        cv.addEventListener("touchstart", (e) => {
          e.preventDefault();
          if (e.touches.length === 2) {
            // Начало пинча — сбрасываем orbit/drag
            isOrbit = false;
            dragNode = null;
            fixedNodeIdx = null;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastPinchDist = Math.hypot(dx, dy);
            return;
          }
          lastPinchDist = null;
          const p = getTouchPos(e);
          mouseDownX = p.clientX; mouseDownY = p.clientY;
          mouse.x = (p.offsetX / cv.clientWidth) * 2 - 1;
          mouse.y = -(p.offsetY / cv.clientHeight) * 2 + 1;
          raycaster.setFromCamera(mouse, cam);
          const hits = raycaster.intersectObjects(meshes);
          if (hits.length > 0) {
            dragNode = hits[0].object;
            fixedNodeIdx = dragNode.userData.nodeIdx;
            simAlpha = Math.max(simAlpha, 0.3);
            plane.setFromNormalAndCoplanarPoint(
              cam.getWorldDirection(new THREE.Vector3()).negate(),
              dragNode.position,
            );
          } else {
            // Не ставим isOrbit, если луч попал в хитбокс связи
            const eHits = raycaster.intersectObjects(edgeHitMeshes.map(h => h.mesh));
            if (eHits.length === 0) isOrbit = true;
          }
          pX = p.clientX; pY = p.clientY;
        }, { passive: false });
        
        cv.addEventListener("touchmove", (e) => {
          e.preventDefault();
          if (e.touches.length === 2) {
            // Пинч — только масштабирование, без вращения
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            if (lastPinchDist !== null) {
              zoom = Math.max(30, Math.min(400, zoom - (dist - lastPinchDist) * 0.5));
            }
            lastPinchDist = dist;
            return;
          }
          lastPinchDist = null;
          const p = getTouchPos(e);
          if (dragNode) {
            mouse.x = (p.offsetX / cv.clientWidth) * 2 - 1;
            mouse.y = -(p.offsetY / cv.clientHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, cam);
            if (raycaster.ray.intersectPlane(plane, intersection)) {
              const idx = dragNode.userData.nodeIdx;
              ns[idx].x = intersection.x;
              ns[idx].y = intersection.y;
              ns[idx].z = intersection.z;
              simAlpha = Math.max(simAlpha, 0.3);
            }
          } else if (isOrbit) {
            const dX = (p.clientX - pX) * 0.005;
            const dY = (p.clientY - pY) * 0.005;
            orbitVX = dX; orbitVY = dY;
            rotY += dX; rotX += dY;
            rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
            pX = p.clientX; pY = p.clientY;
          }
        }, { passive: false });
        
        cv.addEventListener("touchend", (e) => {
          e.preventDefault();
          if (e.touches.length < 2) lastPinchDist = null;
          if (e.touches.length > 0) return;
          
          // ✅ Правильно получаем координаты из changedTouches
          const rect = cv.getBoundingClientRect();
          const touch = e.changedTouches[0];
          const offsetX = touch.clientX - rect.left;
          const offsetY = touch.clientY - rect.top;
          
          const moved = Math.hypot(touch.clientX - mouseDownX, touch.clientY - mouseDownY);
          
          if (moved < 5 && !isOrbit) {
            clearLegendFilter();
            mouse.x = (offsetX / cv.clientWidth) * 2 - 1;
            mouse.y = -(offsetY / cv.clientHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, cam);
            const hits = raycaster.intersectObjects(meshes);
            
            if (hits.length > 0) {
              // ── Тап по узлу ──
              if (selectedEdge3d) { resetAll3d(); selectedEdge3d = null; }

              const hitMesh = hits[0].object;
              const nodeIdx = hitMesh.userData.nodeIdx;
          
              if (selectedMesh3d === hitMesh) {
                setSelected(null);
                const panel = ct.querySelector(".gm-info-panel");
                if (panel) panel.classList.remove("visible");
              } else {
                setSelected(hitMesh);
                const n = ns[nodeIdx];
                const nodeData = {
                  ...G.nodes[nodeIdx],
                  id:      nodeIdx,
                  cluster: G.topology?.clusters?.[n.name] ?? [],
                  roles:   getRolesForMode(n.name),
                  structuralRoles: getRolesFromLayer("structural", n.name),
                  proceduralRoles: getRolesFromLayer("procedural", n.name),
                };
                const nm = Object.fromEntries(G.nodes.map((nd, i) => [nd.name.toLowerCase(), i]));
                const links3d = G.edges.map(ed => ({
                  source: { id: nm[ed.src.toLowerCase()] ?? -1, name: ed.src },
                  target: { id: nm[ed.tgt.toLowerCase()] ?? -1, name: ed.tgt },
                  type: ed.type, dir: ed.dir, str: ed.str, desc: ed.desc,
                })).filter(l => l.source.id >= 0 && l.target.id >= 0);
                showNodePanel(ct, nodeData, links3d, G.topology?.clusterLabels || []);
              }
            } else {
              // ── Проверяем тап по связи ──
              const edgeHits = raycaster.intersectObjects(edgeHitMeshes.map(h => h.mesh));
              if (edgeHits.length > 0) {
                const hitObj = edgeHits[0].object;
                const ed = hitObj.userData.edgeData;
                const hitEntry = edgeHitMeshes.find(h => h.mesh === hitObj);
                if (hitEntry) {
                  if (selectedEdge3d &&
                      selectedEdge3d.si === hitEntry.si &&
                      selectedEdge3d.ti === hitEntry.ti &&
                      selectedEdge3d.edgeData.type === ed.type) {
                    setEdgeSelected3d(null);
                    const panel = ct.querySelector(".gm-info-panel");
                    if (panel) panel.classList.remove("visible");
                  } else {
                    if (selectedMesh3d) { resetAll3d(); selectedMesh3d = null; }
                    setEdgeSelected3d({ edgeData: ed, si: hitEntry.si, ti: hitEntry.ti });
                    showEdgePanel(ct, ed, G.nodes, G.topology?.clusterLabels || []);
                  }
                }
              } else {
                // Тап по пустому месту — снять всё
                setSelected(null);
                setEdgeSelected3d(null);
                const panel = ct.querySelector(".gm-info-panel");
                if (panel) panel.classList.remove("visible");
              }
            }
          }

          if (moved < 5 && isOrbit) {
            clearLegendFilter();
            setSelected(null);
            setEdgeSelected3d(null);
            const panel = ct.querySelector(".gm-info-panel");
            if (panel) panel.classList.remove("visible");
          }

          isDrag = false;
          isOrbit = false;
          dragNode = null;
          fixedNodeIdx = null;
          simAlpha = Math.max(simAlpha, 0.4);
        }, { passive: false });

        ns.forEach((n) => { n.tx = n.x; n.ty = n.y; n.tz = n.z; n.x = 0; n.y = 0; n.z = 0; });
        let appearT = 0;
        const APPEAR_DUR = 55;
        function easeOut3(t) { return 1 - Math.pow(1 - t, 3); }

        function animate() {
          anim3d = requestAnimationFrame(animate);
          // Анимация появления
          if (appearT < APPEAR_DUR && fixedNodeIdx === null) {
            appearT++;
            const t = easeOut3(appearT / APPEAR_DUR);
            ns.forEach((n) => { n.x = n.tx * t; n.y = n.ty * t; n.z = n.tz * t; });
            meshes.forEach((m) => m.scale.setScalar(t));
            updateAllVisuals();
          } else {
            if (appearT < APPEAR_DUR) {
              // Прерываем анимацию — мгновенно к целевым позициям
              ns.forEach((n) => { n.x = n.tx; n.y = n.ty; n.z = n.tz; });
              meshes.forEach((m) => m.scale.setScalar(1));
              appearT = APPEAR_DUR;
            }
            if (simAlpha > 0.001 || fixedNodeIdx !== null) {
              tick(ns, es, simAlpha, fixedNodeIdx);
              simAlpha *= 0.95;
              if (simAlpha < 0.001 && fixedNodeIdx === null) simAlpha = 0;
              updateAllVisuals();
            }
          }
          if (!isOrbit) {
            orbitVX *= 0.96;
            orbitVY *= 0.96;
            rotY += orbitVX;
            rotX += orbitVY;
            rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
          }
          cam.position.x = zoom * Math.sin(rotY) * Math.cos(rotX);
          cam.position.y = zoom * Math.sin(rotX);
          cam.position.z = zoom * Math.cos(rotY) * Math.cos(rotX);
          cam.lookAt(0, 0, 0);
          renderer3d.render(scene, cam);
        }
        animate();

        resizeObs3d = new ResizeObserver(() => {
          if (!renderer3d) return;
          const w = ct.clientWidth, h = ct.clientHeight;
          cam.aspect = w / h;
          cam.updateProjectionMatrix();
          renderer3d.setSize(w, h);
        });
        resizeObs3d.observe(ct);

        // Сохраняем ссылки для toggleClusters и применяем текущее состояние
        clusterObjects3d = { shells: clusterShells, labelSprites: clusterLabelSprites };
        applyClusters3D();

        // Экспорт API для легенды
        graphAPI3d = {
          resetAll: () => { resetAll3d(); applyClusters3D(); },
          applyRoleFilter: applyRoleFilter3d,
          applyClusterFilter: applyClusterFilter3d,
          clearSelection() {
            selectedMesh3d = null;
            selectedEdge3d = null;
            resetAll3d();
            applyClusters3D();
            const p = ct.querySelector(".gm-info-panel");
            if (p) p.classList.remove("visible");
          },
        };
      }

      function build2D() {
        const ct = document.getElementById("view2d");
        if (sim2d) { sim2d.stop(); sim2d = null; }
        if (anim3d) { cancelAnimationFrame(anim3d); anim3d = null; }
        if (resizeObs3d) { resizeObs3d.disconnect(); resizeObs3d = null; }
        ct.innerHTML = "";
        const W = ct.clientWidth, H = ct.clientHeight;
       
        // ── Подготовка данных ─────────────────────────────────────────────────
        const topo = G.topology || { clusters: {}, roles: {}, clusterLabels: [] };
        const nm   = Object.fromEntries(G.nodes.map((n, i) => [n.name.toLowerCase(), i]));
       
        const nodes = G.nodes.map((n, i) => ({
          ...n,
          id:      i,
          cluster: topo.clusters[n.name] ?? [],
          roles:   getRolesForMode(n.name),
          structuralRoles: getRolesFromLayer("structural", n.name),
          proceduralRoles: getRolesFromLayer("procedural", n.name),
        }));
       
        const links = G.edges
          .map(e => ({
            source: nm[e.src.toLowerCase().trim()],
            target: nm[e.tgt.toLowerCase().trim()],
            type:   e.type,
            dir:    e.dir,
            str:    e.str,
            desc:   e.desc,
          }))
          .filter(l => l.source != null && l.target != null);
       
        const regularLinks = links.filter(l => !l.dir.includes("рефлексив"));
        const reflLinks    = links.filter(l =>  l.dir.includes("рефлексив"));

        // Плоский массив: один элемент на каждую пару (узел, кластер).
        // offset — порядковый номер кластера в списке узла (0, 1, 2…),
        // определяет смещение радиуса концентрического кольца.
        const ringData = nodes.flatMap(n =>
          n.cluster.map((clIdx, offset) => ({ node: n, clIdx, offset }))
        );

        // Группировка узлов по кластерам (для hull и меток)
        const clusterGroups = {};
        nodes.forEach(n => {
          n.cluster.forEach(clIdx => {
            if (!clusterGroups[clIdx]) clusterGroups[clIdx] = [];
            clusterGroups[clIdx].push(n);
          });
        });
        const clusterGroupEntries = Object.entries(clusterGroups)
          .map(([idxStr, members]) => ({ clIdx: Number(idxStr), members }));
       
        // ── SVG-сцена ─────────────────────────────────────────────────────────
        const svg = d3.select(ct).append("svg")
          .attr("width", W).attr("height", H)
          .style("background", "#0a0a14");
        const g = svg.append("g");
        svg.call(d3.zoom().scaleExtent([0.2, 5])
          .on("zoom", e => g.attr("transform", e.transform)));
       
        // ── Defs ──────────────────────────────────────────────────────────────
        const defs = g.append("defs");
       
        const glowFilter = defs.append("filter").attr("id", "glow2");
        glowFilter.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "blur");
        glowFilter.append("feMerge").selectAll("feMergeNode")
          .data(["blur", "SourceGraphic"]).enter()
          .append("feMergeNode").attr("in", d => d);
       
        const glowGen = defs.append("filter")
          .attr("id", "glow-gen")
          .attr("x", "-100%").attr("y", "-100%")
          .attr("width", "300%").attr("height", "300%");

        // Широкое внешнее свечение
        glowGen.append("feGaussianBlur")
          .attr("in", "SourceGraphic")
          .attr("stdDeviation", "10")
          .attr("result", "blurWide");

        // Плотное ближнее свечение
        glowGen.append("feGaussianBlur")
          .attr("in", "SourceGraphic")
          .attr("stdDeviation", "4")
          .attr("result", "blurTight");

        // Усиливаем насыщенность и яркость широкого слоя
        glowGen.append("feColorMatrix")
          .attr("in", "blurWide")
          .attr("type", "matrix")
          .attr("values",
            "1.0 0   0   0 0 " +
            "0   1.0 0   0 0 " +
            "0   0   1.0 0 0 " +
            "0   0   0   1.0 0")   // альфа × 2 — ключевой момент
          .attr("result", "glowWide");

        glowGen.append("feColorMatrix")
          .attr("in", "blurTight")
          .attr("type", "matrix")
          .attr("values",
            "1.0 0   0   0 0 " +
            "0   1.0 0   0 0 " +
            "0   0   1.0 0 0 " +
            "0   0   0   1.0 0")
          .attr("result", "glowTight");

        // Складываем: широкое + плотное + оригинал
        const merge = glowGen.append("feMerge");
        merge.append("feMergeNode").attr("in", "glowWide");
        //merge.append("feMergeNode").attr("in", "glowWide");   // двойной проход широкого
        merge.append("feMergeNode").attr("in", "glowTight");
        merge.append("feMergeNode").attr("in", "SourceGraphic");

        function addMarker(id, color, reverse) {
          defs.append("marker")
            .attr("id", id)
            .attr("viewBox", "0 -3 6 6")
            .attr("refX", 6)          // ← всегда 6, убрать условие
            .attr("refY", 0)
            .attr("markerWidth", 4).attr("markerHeight", 4)
            .attr("orient", reverse ? "auto-start-reverse" : "auto")
            .append("path").attr("d", "M0,-3L6,0L0,3").attr("fill", color);
        }

        // Собираем все уникальные цвета рёбер
        const markerColorSet = new Set();
        links.forEach(l => markerColorSet.add(edgeTypeStyle(l.type).color));

        // Создаём по три маркера на каждый цвет
        function colorId(hex) { return hex.replace("#", ""); }
        markerColorSet.forEach(color => {
          const cid = colorId(color);
          addMarker(`arr-fwd-${cid}`,       color, false);
          addMarker(`arr-bi-end-${cid}`,    color, false);
          addMarker(`arr-bi-start-${cid}`,  color, true);
        });
       
        // ── Геометрия рёбер ───────────────────────────────────────────────────
        function edgeEndpoints(d) {
          const sx = d.source.x, sy = d.source.y;
          const tx = d.target.x, ty = d.target.y;
          const angle = Math.atan2(ty - sy, tx - sx);
          const rs = 6 + (d.source.cen || 0) * 14;
          const rt = 6 + (d.target.cen || 0) * 14;
          return {
            x1: sx + Math.cos(angle) * rs, y1: sy + Math.sin(angle) * rs,
            x2: tx - Math.cos(angle) * rt, y2: ty - Math.sin(angle) * rt,
          };
        }
       
        // Рефлексивная дуга: радиус зависит от размера узла
        function arcPath(d) {
          const x = typeof d.source === "object" ? d.source.x : nodes[d.source].x;
          const y = typeof d.source === "object" ? d.source.y : nodes[d.source].y;
          const cen = typeof d.source === "object" ? (d.source.cen || 0) : 0;
          const r = 18 + cen * 12;
          return `M${x},${y}A${r},${r},0,1,1,${x + 1},${y + 1}`;
        }
       
        // ── Симуляция ─────────────────────────────────────────────────────────
        sim2d = d3.forceSimulation(nodes)
          .force("link",      d3.forceLink(links).id(d => d.id).distance(260).strength(d => (d.str || 0.1) * 0.18))
          .force("charge",    d3.forceManyBody().strength(-650))
          .force("center",    d3.forceCenter(W / 2, H / 2))
          .force("collision", d3.forceCollide().radius(d => 16 + d.cen * 26));
       
        // ── Невидимые зоны попадания ──────────────────────────────────────────
        const linkHit = g.selectAll(".edge-hit").data(regularLinks).enter()
          .append("line").attr("class", "edge-hit")
          .attr("stroke", "transparent").attr("stroke-width", 12).style("cursor", "pointer");
        linkHit.append("title").text(d => `${d.desc}\n[${d.type}]\n${d.dir}`);
       
        const arcHit = g.selectAll(".edge-arc-hit").data(reflLinks).enter()
          .append("path").attr("class", "edge-arc-hit").attr("fill", "none")
          .attr("stroke", "transparent").attr("stroke-width", 10).style("cursor", "pointer");
        arcHit.append("title").text(d => `${d.desc}\n[${d.type}]\n${d.dir}`);
       
        // ── Видимые рёбра ─────────────────────────────────────────────────────
        const link = g.selectAll(".edge-line").data(regularLinks).enter()
          .append("line").attr("class", "edge-line").attr("stroke-linecap", "round")
          .each(function(d) {
            const { color, dash } = edgeTypeStyle(d.type);
            const cid = colorId(color); 
            const isBi  = d.dir.includes("двунаправлен");
            // Слабые связи (str < 0.3) всегда пунктирные, даже если тип сплошной
            const finalDash = dash || (d.str < 0.3 ? "3,3" : null);
            d3.select(this)
              .attr("stroke",            color)
              .attr("stroke-opacity",    0.25 + (d.str || 0.5) * 0.55)
              .attr("stroke-width",      1 + (d.str || 0.5) * 2.5)
              .attr("stroke-dasharray",  finalDash || null)
              .attr("marker-end",   isBi ? `url(#arr-bi-end-${cid})`   : `url(#arr-fwd-${cid})`)
              .attr("marker-start", isBi ? `url(#arr-bi-start-${cid})` : null)
          });
       
        const arc = g.selectAll(".edge-arc").data(reflLinks).enter()
          .append("path").attr("class", "edge-arc").attr("fill", "none")
          .each(function(d) {
            const { color } = edgeTypeStyle(d.type);
            d3.select(this)
              .attr("stroke",         color)
              .attr("stroke-opacity", 0.7)
              .attr("stroke-width",   2);
          });
       
        // ── Кольца кластеров (под узлами) ─────────────────────────────────────
        const clusterRing = g.selectAll(".cluster-ring").data(ringData).enter()
          .append("circle").attr("class", "cluster-ring")
          .attr("r",               d => (6 + d.node.cen * 14) + 6 + d.offset * 5)
          .attr("fill",            "none")
          .attr("stroke",          d => CPAL[d.clIdx % CPAL.length])
          .attr("stroke-opacity",  0.5)
          .attr("stroke-width",    1.5)
          .attr("stroke-dasharray","3,2")
          .attr("pointer-events",  "none");

        // ── Выпуклые оболочки кластеров (под узлами) ──────────────────────────
        const clusterHull = g.selectAll(".cluster-hull").data(clusterGroupEntries).enter()
          .append("path").attr("class", "cluster-hull")
          .attr("fill",           d => CPAL[d.clIdx % CPAL.length])
          .attr("fill-opacity",   0.06)
          .attr("stroke",         d => CPAL[d.clIdx % CPAL.length])
          .attr("stroke-opacity", 0.30)
          .attr("stroke-width",   1.5)
          .attr("stroke-dasharray", "6,3")
          .attr("stroke-linejoin", "round")
          .attr("pointer-events", "none")
          .attr("d", "");

        // ── Текстовые метки кластеров ──────────────────────────────────────────
        const clusterLabel2d = g.selectAll(".cluster-label").data(clusterGroupEntries).enter()
          .append("text").attr("class", "cluster-label")
          .attr("font-family",  "IBM Plex Mono, monospace")
          .attr("font-size",    "9px")
          .attr("letter-spacing", "1px")
          .attr("fill",         d => CPAL[d.clIdx % CPAL.length])
          .attr("fill-opacity", 0.55)
          .attr("text-anchor",  "middle")
          .attr("pointer-events", "none")
          .text(d => {
            const raw = topo.clusterLabels?.[d.clIdx] || `Кластер ${d.clIdx + 1}`;
            return raw.replace(/^[IVXLCDM]+\s*[-–—]\s*/i, "").trim();
          });
       
        // ── Узлы ──────────────────────────────────────────────────────────────
        const nodeEnter = g.selectAll(".node-g").data(nodes).enter()
          .append("g").attr("class", "node-g").style("cursor", "pointer");
        
        // Для каждого узла — circle или path в зависимости от роли
        nodeEnter.each(function(d) {
          // Процессуальная роль → форма (ВСЕГДА)
          const procRoles = getRolesFromLayer("procedural", d.name);
          const procRole  = getTopRole(procRoles);   
          // NB: getTopRole теперь смотрит PROCEDURAL_PRIORITY,
          // т.к. roleMode = "procedural" зафиксирован

          const r      = 6 + d.cen * 14;
          const fill   = typeColorHex(d.type);
          const fillOp = 0.2 + (d.cert ?? 0.5) * 0.65;
          const sel    = d3.select(this);

          // Структурный маркер → наложение
          const sms = getStructuralMarkers(d.name);

          // ── Основная фигура ──
          if (!procRole || procRole === "peripheral") {
            sel.append("circle")
              .attr("class", "node-circle")
              .attr("r", r);
          } else {
            const rot = procRole === "antithesis" ? "rotate(180)"
                      : procRole === "core"       ? "rotate(45)"
                      : procRole === "formalized" ? "rotate(0)"
                      : null;
            sel.append("path")
               .attr("class", "node-circle")
               .attr("transform", rot)
               .attr("d", nodeSymbolPath(d));
               // NB: nodeSymbolPath вызывает getTopRole(d.roles),
               // а d.roles = getRolesForMode(name) — теперь это всегда procedural
          }

          // ── Стилизация основной фигуры: объединяем маркеры ──
          // central/peripheral → strokeWidth; bridge → strokeDash; generative → filter; прочее — default
          let strokeW    = 2;
          let strokeDash = null;
          let svgFilter  = null;
          let hasInner   = false;
          let innerScale = 0.55;
          let innerDarken = 0.35;
          for (const sm of sms) {
              if (sm.type === "central" || sm.type === "peripheral")
                  strokeW = sm.strokeWidth;
              if (sm.strokeDash) strokeDash = sm.strokeDash;
              if (sm.filter) svgFilter = sm.filter;
              if (sm.innerShape) {
                  hasInner = true;
                  innerScale = sm.innerScale;
                  innerDarken = sm.innerDarken;
              }
          }

          sel.select(".node-circle")
            .attr("fill",             fill)
            .attr("fill-opacity",     fillOp)
            .attr("stroke",           fill)
            .attr("stroke-width",     strokeW)
            .attr("stroke-dasharray", strokeDash)
            .attr("filter",           svgFilter);

          sel.attr("data-base-filter", svgFilter || "");

          // ── Внутренний силуэт (core) ──
          if (hasInner) {
            const innerR = r * innerScale;
            const hsl = _hexToHSL(typeColor(d.type));
            const darkHex = "#" + _hslToHex({
              h: hsl.h,
              s: hsl.s * 0.9,
              l: Math.max(0.08, hsl.l - innerDarken),
            }).toString(16).padStart(6, "0");

            if (!procRole || procRole === "peripheral") {
              // Основа — circle → вложенный circle
              sel.append("circle")
                .attr("class", "node-inner")
                .attr("r", innerR)
                .attr("fill", darkHex)
                .attr("fill-opacity", 0.85)
                .attr("stroke", "none")
                .attr("pointer-events", "none");
            } else {
              // Основа — path → вложенный path той же формы, масштабированный
              const rot = procRole === "antithesis" ? "rotate(180)"
                        : procRole === "core"       ? "rotate(45)"
                        : null;
              // Создаём временный объект с уменьшенным cen для nodeSymbolPath
              const innerD = { ...d, cen: d.cen * innerScale };
              const innerPath = nodeSymbolPath(innerD);
              if (innerPath) {
                sel.append("path")
                  .attr("class", "node-inner")
                  .attr("d", innerPath)
                  .attr("transform", rot)
                  .attr("fill", darkHex)
                  .attr("fill-opacity", 0.85)
                  .attr("stroke", "none")
                  .attr("pointer-events", "none");
              } else {
                // Фолбэк — circle
                sel.append("circle")
                  .attr("class", "node-inner")
                  .attr("r", innerR)
                  .attr("fill", darkHex)
                  .attr("fill-opacity", 0.85)
                  .attr("stroke", "none")
                  .attr("pointer-events", "none");
              }
            }
          }
        });
        
        const node = nodeEnter;  // далее весь код hover/click работает через nodeEnter
        
        // ── Drag ──────────────────────────────────────────────────────────────────
        node.call(d3.drag()
          .on("start", (event, d) => {
            if (!event.active) sim2d.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) sim2d.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
        );
       
        // ── Метки ─────────────────────────────────────────────────────────────
        const label = g.selectAll(".node-label").data(nodes).enter()
          .append("text").attr("class", "node-label")
          .attr("dy",           d => -(9 + d.cen * 14))
          .attr("text-anchor",  "middle")
          .attr("pointer-events", "none")
          .text(d => d.name);
       
        // ── Hover: подсветка окрестности ─────────────────────────────────────
        
        // Переменная выбранного узла (по клику)
        let selected2d = null;
        let legendFilterActive2d = false;  // флаг: фильтр легенды сейчас применён

        let selectedEdge2d = null;   // выбранная связь: { source, target, ... } или null
        
        // Применяет диммирование несвязанных (вызывается при клике)
        function applyDim2d(d) {
          const nbrIds = new Set([d.id]);
          links.forEach(l => {
            const s = typeof l.source === "object" ? l.source.id : l.source;
            const t = typeof l.target === "object" ? l.target.id : l.target;
            if (s === d.id) nbrIds.add(t);
            if (t === d.id) nbrIds.add(s);
          });
          const DIM = 0.08;
          node.attr("opacity",         n => nbrIds.has(n.id) ? 1 : DIM);
          label.attr("opacity",        n => nbrIds.has(n.id) ? 1 : DIM);
          clusterRing.attr("opacity",  d => nbrIds.has(d.node.id) ? 1 : DIM);
          // Hull и метки: диммируем кластеры, не содержащие выбранный узел
          clusterHull.attr("opacity",     d => d.members.some(m => nbrIds.has(m.id)) ? 1 : DIM);
          clusterLabel2d.attr("opacity",  d => d.members.some(m => nbrIds.has(m.id)) ? 1 : DIM);
          link.attr("opacity", l => {
            const s = typeof l.source === "object" ? l.source.id : l.source;
            const t = typeof l.target === "object" ? l.target.id : l.target;
            return (s === d.id || t === d.id) ? 1 : DIM * 0.5;
          });
          arc.attr("opacity", l => {
            const s = typeof l.source === "object" ? l.source.id : l.source;
            return s === d.id ? 1 : DIM * 0.5;
          });
        }
        
        // Снимает диммирование
        function resetDim2d() {
          node.attr("opacity", 1);
          label.attr("opacity", 1);
          clusterRing.attr("opacity", 1);
          clusterHull.attr("opacity", 1);
          clusterLabel2d.attr("opacity", 1);
          link.attr("opacity", null);
          arc.attr("opacity", null);
        }

        // ── Фильтрация из легенды: роль ──────────────────────────────────────
        function applyRoleFilter2d(roleKey, layer) {
          selected2d = null;
          selectedEdge2d = null;
          legendFilterActive2d = true;
          const matchIds = new Set();
          nodes.forEach(n => {
            const roles = getRolesFromLayer(layer, n.name);
            if (roles.has(roleKey)) matchIds.add(n.id);
          });
          const DIM = 0.08;
          node.attr("opacity",          n => matchIds.has(n.id) ? 1 : DIM);
          label.attr("opacity",         n => matchIds.has(n.id) ? 1 : DIM);
          clusterRing.attr("opacity",   d => matchIds.has(d.node.id) ? 1 : DIM);
          clusterHull.attr("opacity",   d => d.members.some(m => matchIds.has(m.id)) ? 1 : DIM);
          clusterLabel2d.attr("opacity", d => d.members.some(m => matchIds.has(m.id)) ? 1 : DIM);
          link.attr("opacity", l => {
            const s = typeof l.source === "object" ? l.source.id : l.source;
            const t = typeof l.target === "object" ? l.target.id : l.target;
            return (matchIds.has(s) && matchIds.has(t)) ? 1 : DIM * 0.5;
          });
          arc.attr("opacity", l => {
            const s = typeof l.source === "object" ? l.source.id : l.source;
            return matchIds.has(s) ? 1 : DIM * 0.5;
          });
          // Восстановить видимость hull-оболочек (могли быть скрыты фильтром кластера)
          applyClusters2D();
        }

        // ── Фильтрация из легенды: кластер ──────────────────────────────────
        function applyClusterFilter2d(clusterIdx) {
          selected2d = null;
          selectedEdge2d = null;
          legendFilterActive2d = true;
          const matchIds = new Set();
          nodes.forEach(n => {
            const cl = topo?.clusters?.[n.name] || [];
            if (cl.includes(clusterIdx)) matchIds.add(n.id);
          });
          const DIM = 0.08;
          node.attr("opacity",          n => matchIds.has(n.id) ? 1 : DIM);
          label.attr("opacity",         n => matchIds.has(n.id) ? 1 : DIM);
          clusterRing.attr("opacity",   d => matchIds.has(d.node.id) ? 1 : DIM);
          link.attr("opacity", l => {
            const s = typeof l.source === "object" ? l.source.id : l.source;
            const t = typeof l.target === "object" ? l.target.id : l.target;
            return (matchIds.has(s) && matchIds.has(t)) ? 1 : DIM * 0.5;
          });
          arc.attr("opacity", l => {
            const s = typeof l.source === "object" ? l.source.id : l.source;
            return matchIds.has(s) ? 1 : DIM * 0.5;
          });
          // Hull: только выбранный кластер
          if (clusterVisible) {
            clusterHull
              .attr("opacity", 1)
              .attr("display",    d => d.clIdx === clusterIdx ? null : "none");
            clusterLabel2d
              .attr("opacity", 1)
              .attr("display", d => d.clIdx === clusterIdx ? null : "none");
          } else {
            clusterHull.attr("opacity",    d => d.members.some(m => matchIds.has(m.id)) ? 1 : DIM);
            clusterLabel2d.attr("opacity", d => d.members.some(m => matchIds.has(m.id)) ? 1 : DIM);
          }
        }

        // Диммирование при выборе связи
        function applyEdgeDim2d(l) {
            const sId = typeof l.source === "object" ? l.source.id : l.source;
            const tId = typeof l.target === "object" ? l.target.id : l.target;
            const endpointIds = new Set([sId, tId]);
            const DIM = 0.08;

            node.attr("opacity",           n => endpointIds.has(n.id) ? 1 : DIM);
            label.attr("opacity",          n => endpointIds.has(n.id) ? 1 : DIM);
            clusterRing.attr("opacity",    d => endpointIds.has(d.node.id) ? 1 : DIM);
            clusterHull.attr("opacity",    d => d.members.some(m => endpointIds.has(m.id)) ? 1 : DIM);
            clusterLabel2d.attr("opacity", d => d.members.some(m => endpointIds.has(m.id)) ? 1 : DIM);

            // Все связи диммим, кроме выбранной
            link.attr("opacity", e => {
                const es = typeof e.source === "object" ? e.source.id : e.source;
                const et = typeof e.target === "object" ? e.target.id : e.target;
                return (es === sId && et === tId) || (es === tId && et === sId) ? 1 : DIM * 0.5;
            });
            arc.attr("opacity", e => {
                const es = typeof e.source === "object" ? e.source.id : e.source;
                return es === sId && sId === tId ? 1 : DIM * 0.5;
            });
        }
        
        node
        .on("mouseover", function(event, d) {
          const nbrIds = new Set([d.id]);
          links.forEach(l => {
            const s = typeof l.source === "object" ? l.source.id : l.source;
            const t = typeof l.target === "object" ? l.target.id : l.target;
            if (s === d.id) nbrIds.add(t);
            if (t === d.id) nbrIds.add(s);
          });

          node.attr("filter", function(n) {
            const base = d3.select(this).attr("data-base-filter");
            if (base) return base;                       // свой фильтр → не трогаем
            return nbrIds.has(n.id) ? "url(#glow2)" : null;
          });

          // stroke-opacity, а не opacity
          link.attr("stroke-opacity", l => {
            const s = typeof l.source === "object" ? l.source.id : l.source;
            const t = typeof l.target === "object" ? l.target.id : l.target;
            return (s === d.id || t === d.id) ? 1 : 0.25 + (l.str || 0.5) * 0.55;
          });
          arc.attr("stroke-opacity", l => {
            const s = typeof l.source === "object" ? l.source.id : l.source;
            return s === d.id ? 1 : 0.7;
          });

          d3.select(this).raise();
        })
        .on("mouseout", function() {
          node.each(function() {
            const base = d3.select(this).attr("data-base-filter");
            d3.select(this).attr("filter", base || null);
          });
          // Восстанавливаем stroke-opacity явно по формуле
          link.attr("stroke-opacity", l => 0.25 + (l.str || 0.5) * 0.55);
          arc.attr("stroke-opacity", 0.7);
          // Снимаем opacity-диммирование от клика (если было)
          link.attr("opacity", null);
          arc.attr("opacity", null);
          // Восстанавливаем диммирование выбранного узла или фильтра легенды
          if (legendFilterActive2d && legendFilter) {
            if (legendFilter.type === "role")
              applyRoleFilter2d(legendFilter.key, legendFilter.layer);
            else if (legendFilter.type === "cluster")
              applyClusterFilter2d(legendFilter.idx);
          } else if (selected2d !== null) {
            const selData = nodes.find(n => n.id === selected2d);
            if (selData) applyDim2d(selData);
          }
        });

        // ── Hover по связям ──────────────────────────────────────────────────
        function edgeHoverOn(event, l) {
          const sId = typeof l.source === "object" ? l.source.id : l.source;
          const tId = typeof l.target === "object" ? l.target.id : l.target;
          const endIds = new Set([sId, tId]);

          // Подсветка узлов-концов (если нет активного выделения)
          if (!selected2d && !selectedEdge2d) {
            node.attr("filter", function(n) {
              const base = d3.select(this).attr("data-base-filter");
              if (base) return base;
              return endIds.has(n.id) ? "url(#glow2)" : null;
            });
          }

          // Подсветка самой связи
          link.attr("stroke-opacity", e => {
            const es = typeof e.source === "object" ? e.source.id : e.source;
            const et = typeof e.target === "object" ? e.target.id : e.target;
            if ((es === sId && et === tId) || (es === tId && et === sId))
              return 1;
            return 0.25 + (e.str || 0.5) * 0.55;
          });
          arc.attr("stroke-opacity", e => {
            const es = typeof e.source === "object" ? e.source.id : e.source;
            return es === sId && sId === tId ? 1 : 0.7;
          });
        }

        function edgeHoverOff() {
          // Восстановить фильтры узлов
          node.each(function() {
            const base = d3.select(this).attr("data-base-filter");
            d3.select(this).attr("filter", base || null);
          });
          // Восстановить opacity связей
          link.attr("stroke-opacity", l => 0.25 + (l.str || 0.5) * 0.55);
          arc.attr("stroke-opacity", 0.7);
          link.attr("opacity", null);
          arc.attr("opacity", null);
          // Если есть фильтр легенды — восстановить его
          if (legendFilterActive2d && legendFilter) {
            if (legendFilter.type === "role")
              applyRoleFilter2d(legendFilter.key, legendFilter.layer);
            else if (legendFilter.type === "cluster")
              applyClusterFilter2d(legendFilter.idx);
          }
          // Если есть выделение — восстановить его dim
          else if (selectedEdge2d) applyEdgeDim2d(selectedEdge2d);
          else if (selected2d !== null) {
            const selData = nodes.find(n => n.id === selected2d);
            if (selData) applyDim2d(selData);
          }
        }

        linkHit
          .style("cursor", "pointer")
          .on("mouseover", edgeHoverOn)
          .on("mouseout", edgeHoverOff);

        arcHit
          .style("cursor", "pointer")
          .on("mouseover", edgeHoverOn)
          .on("mouseout", edgeHoverOff);
       
        // ── Клик по связям ───────────────────────────────────────────────────
        function edgeClick(event, l) {
          event.stopPropagation();
          clearLegendFilter();
          legendFilterActive2d = false;

          const sId = typeof l.source === "object" ? l.source.id : l.source;
          const tId = typeof l.target === "object" ? l.target.id : l.target;

          // Если кликнули повторно по той же связи — снять выделение
          if (selectedEdge2d &&
            typeof selectedEdge2d.source === "object" &&
            selectedEdge2d.source.id === sId &&
            (typeof selectedEdge2d.target === "object" ? selectedEdge2d.target.id : selectedEdge2d.target) === tId) {
            selectedEdge2d = null;
            selected2d = null;
            resetDim2d();
            const p = ct.querySelector(".gm-info-panel");
            if (p) p.classList.remove("visible");
            return;
          }

          // Снять узловое выделение, установить рёберное
          selected2d = null;
          selectedEdge2d = l;
          applyEdgeDim2d(l);

          // Восстановить исходные данные G.edges для панели
          const srcName = typeof l.source === "object" ? l.source.name : G.nodes[l.source]?.name;
          const tgtName = typeof l.target === "object" ? l.target.name : G.nodes[l.target]?.name;
          const origEdge = G.edges.find(e =>
            e.src.toLowerCase().trim() === (srcName || "").toLowerCase().trim() &&
            e.tgt.toLowerCase().trim() === (tgtName || "").toLowerCase().trim() &&
            e.type === l.type
          ) || { src: srcName, tgt: tgtName, type: l.type, dir: l.dir, str: l.str, desc: l.desc };

          showEdgePanel(ct, origEdge, G.nodes, topo.clusterLabels);
        }

        linkHit.on("click", edgeClick);
        arcHit.on("click", edgeClick);

        // ── Клик: диммирование + панель ──────────────────────────────────────
        node.on("click", function(event, d) {
          event.stopPropagation();
          clearLegendFilter();
          legendFilterActive2d = false;
          if (selected2d === d.id) {
            // Повторный клик по тому же узлу — снять выделение
            selected2d = null;
            selectedEdge2d = null;
            resetDim2d();
            const p = ct.querySelector(".gm-info-panel");
            if (p) p.classList.remove("visible");
          } else {
            selectedEdge2d = null;
            selected2d = d.id;
            applyDim2d(d);
            showNodePanel(ct, d, links, topo.clusterLabels);
          }
        });
        svg.on("click", () => {
          clearLegendFilter();
          legendFilterActive2d = false;
          selected2d = null;
          selectedEdge2d = null;
          resetDim2d();
          const p = ct.querySelector(".gm-info-panel");
          if (p) p.classList.remove("visible");
        });
       
        // ── Tick ──────────────────────────────────────────────────────────────
        sim2d.on("tick", () => {
          link.each(function(d) {
            const { x1, y1, x2, y2 } = edgeEndpoints(d);
            d3.select(this).attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
          });
          linkHit.each(function(d) {
            const { x1, y1, x2, y2 } = edgeEndpoints(d);
            d3.select(this).attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
          });
          arc.attr("d", arcPath);
          arcHit.attr("d", arcPath);
          node.attr("transform", d => `translate(${d.x},${d.y})`);   // ← заменяет cx/cy
          clusterRing.attr("cx", d => d.node.x).attr("cy", d => d.node.y);    // остаётся
          label.attr("x",        d => d.x).attr("y", d => d.y);

          // Hull-оболочки и метки кластеров
          clusterHull.attr("d", d => {
            // Отступ вокруг каждого узла — чтобы hull не прилипал вплотную к точкам
            const PAD = 22;
            // Набираем точки с «подушкой»: для каждого узла добавляем 8 смещённых точек
            const pts = [];
            d.members.forEach(n => {
              const r = 6 + (n.cen || 0) * 14 + PAD;
              for (let i = 0; i < 8; i++) {
                const a = (i / 8) * 2 * Math.PI;
                pts.push([n.x + Math.cos(a) * r, n.y + Math.sin(a) * r]);
              }
            });
            const hull = d3.polygonHull(pts);
            if (!hull) return "";
            return "M" + hull.map(p => p.join(",")).join("L") + "Z";
          });

          clusterLabel2d.each(function(d) {
            // Позиция метки — над самой верхней точкой hull (минимальный y)
            const PAD = 22;
            const pts = [];
            d.members.forEach(n => {
              const r = 6 + (n.cen || 0) * 14 + PAD;
              for (let i = 0; i < 8; i++) {
                const a = (i / 8) * 2 * Math.PI;
                pts.push([n.x + Math.cos(a) * r, n.y + Math.sin(a) * r]);
              }
            });
            const hull = d3.polygonHull(pts);
            if (!hull) return;
            const topPt = hull.reduce((a, b) => b[1] < a[1] ? b : a);
            d3.select(this).attr("x", topPt[0]).attr("y", topPt[1] - 5);
          });
        });
        // Сохраняем ссылки для toggleClusters и применяем текущее состояние
        clusterObjects2d = { hull: clusterHull, label: clusterLabel2d };
        applyClusters2D();

        // Экспорт API для легенды
        graphAPI2d = {
          resetDim() { resetDim2d(); legendFilterActive2d = false; applyClusters2D(); },
          applyRoleFilter: applyRoleFilter2d,
          applyClusterFilter: applyClusterFilter2d,
          clearSelection() {
            selected2d = null;
            selectedEdge2d = null;
            legendFilterActive2d = false;
            resetDim2d();
            applyClusters2D();
            const p = ct.querySelector(".gm-info-panel");
            if (p) p.classList.remove("visible");
          },
        };
      }

      // ── Применяет clusterVisible к объектам 3D-вида ──────────────────────────
      function applyClusters3D() {
        if (!clusterObjects3d) return;
        const v = clusterVisible;
        clusterObjects3d.shells.forEach(({ mesh }) => { mesh.visible = v; });
        clusterObjects3d.labelSprites.forEach(({ sprite }) => { sprite.visible = v; });
      }

      // ── Применяет clusterVisible к объектам 2D-вида ──────────────────────────
      function applyClusters2D() {
        if (!clusterObjects2d) return;
        const d = clusterVisible ? null : "none";
        clusterObjects2d.hull.attr("display",  d);
        clusterObjects2d.label.attr("display", d);
      }

      // ── Переключатель: вызывается кнопкой ◎ Кластеры ─────────────────────────
      function toggleClusters() {
        clusterVisible = !clusterVisible;
        const btn = document.getElementById("tabClusters");
        if (btn) btn.classList.toggle("active", clusterVisible);
        applyClusters3D();
        applyClusters2D();
      }

      function buildLegend(nodeTypes, edgeTypes, clusterLabels, mode) {
        const l = document.getElementById("gmLegend");
      
        // ── Полный реестр ролей ───────────────────────────────────────────────────
        const ROLE_REGISTRY = [
          { key: "synthesis",          label: "Синтез",             sym2d: "⯃",  name3d: "октаэдр"            },
          { key: "thesis",             label: "Тезис",              sym2d: "▲",  name3d: "тетраэдр ▲"        },
          { key: "antithesis",         label: "Антитезис",          sym2d: "▽",  name3d: "тетраэдр ▽"        },
          { key: "generative",         label: "Генеративная",       sym2d: "⬡",  name3d: "икосаэдр"           },
          { key: "core",               label: "Ядро",               sym2d: "◆",  name3d: "октаэдр (плоский)" },
          { key: "bridge",             label: "Мост",               sym2d: "◼",  name3d: "куб - - -"         },
          { key: "central",            label: "Центральная",        sym2d: "⬠",  name3d: "додекаэдр"          },
          { key: "deconstructed",      label: "Деконструиров.",     sym2d: "✚",  name3d: "каркас"            },
          { key: "reassembled",        label: "Пересобранная",      sym2d: "✡",  name3d: "stella octangula"  },
          { key: "horizon-expansion",  label: "Расш. горизонта",    sym2d: "◇",  name3d: "конус"             },
          { key: "pre-horizon",        label: "Предгоризонт",       sym2d: "⏣",  name3d: "цилиндр"           },
          { key: "integrating",        label: "Интегрирующая",      sym2d: "⋈",  name3d: "тор"               },
          { key: "foundation",         label: "Основание",          sym2d: "▬",  name3d: "плоский куб"       },
          { key: "formalized",         label: "Формализованная",    sym2d: "▭",  name3d: "куб"               },
          { key: "verifying",          label: "Верифицирующая",     sym2d: "☆",  name3d: "додекаэдр-каркас"  },
          { key: "peripheral",         label: "Периферийная",       sym2d: "●",  name3d: "сфера"             },
        ];
      
        // ── Какие роли реально присутствуют в текущем графе ──────────────────────
        const activeRoles = new Set();
        const rolesLayer = G.topology?.roles?.[roleMode] || {};
        for (const roleList of Object.values(rolesLayer)) {
          const arr = roleList instanceof Set ? [...roleList]
                    : Array.isArray(roleList)  ? roleList
                    : [];
          arr.forEach(r => activeRoles.add(r));
        }
      
        // ── Хелперы ───────────────────────────────────────────────────────────────
        function secTitle(text, mt = 0) {
          return `<div class="gm-legend-sec" style="margin-top:${mt}px">${text}</div>`;
        }
      
        // ── Секция 1: типы узлов ──────────────────────────────────────────────────
        let h = secTitle("ТИПЫ КАТЕГОРИЙ");
        for (const t of nodeTypes)
          h += `<div class="gm-legend-item">
            <div class="gm-legend-dot" style="background:${typeColorHex(t)}"></div>
            <span>${t}</span>
          </div>`;
      
        // ── Секция 2a: Процессуальные роли (ФОРМА) ──
        const procRolesActive = new Set();
        const procLayer = G.topology?.roles?.procedural || {};
        for (const roleList of Object.values(procLayer)) {
          const arr = roleList instanceof Set ? [...roleList]
                    : Array.isArray(roleList)  ? roleList : [];
          arr.forEach(r => procRolesActive.add(r));
        }
        const visibleProcRoles = ROLE_REGISTRY.filter(r =>
          procRolesActive.has(r.key) && PROCEDURAL_PRIORITY.includes(r.key)
        );
        if (visibleProcRoles.length) {
          h += secTitle(mode === "2d"
            ? "ПРОЦЕССУАЛЬНЫЕ РОЛИ (ФОРМА)"
            : "ПРОЦЕССУАЛЬНЫЕ РОЛИ (ГЕОМЕТРИЯ)", 10);
          for (const r of visibleProcRoles) {
            if (mode === "2d") {
              h += `<div class="gm-legend-item gm-legend-clickable" data-filter-type="role" data-role-key="${r.key}" data-role-layer="procedural">
                <span style="font-size:11px;width:22px;text-align:center;
                             flex-shrink:0;line-height:1">${r.sym2d}</span>
                <span>${r.label}</span>
              </div>`;
            } else {
              h += `<div class="gm-legend-item gm-legend-clickable" data-filter-type="role" data-role-key="${r.key}" data-role-layer="procedural">
                <span style="font-size:9px;width:22px;flex-shrink:0;
                             color:rgba(255,255,255,.45);line-height:1">${r.sym2d}</span>
                <span>${r.name3d} — ${r.label}</span>
              </div>`;
            }
          }
        }

        // ── Секция 2b: Структурные роли (МАРКЕР) ──
        const structRolesActive = new Set();
        const structLayer = G.topology?.roles?.structural || {};
        for (const roleList of Object.values(structLayer)) {
          const arr = roleList instanceof Set ? [...roleList]
                    : Array.isArray(roleList)  ? roleList : [];
          arr.forEach(r => structRolesActive.add(r));
        }

        const STRUCT_LEGEND = [
          { key: "core",       label: "Ядро",
            desc2d: "внутренний силуэт",
            desc3d: "внутреннее тело (полупрозрачная оболочка)" },
          { key: "generative", label: "Генеративная",
            desc2d: "свечение (glow)",
            desc3d: "PointLight + усиленное свечение" },
          { key: "bridge",     label: "Мост",
            desc2d: "пунктирная обводка",
            desc3d: "wireframe-каркас поверх" },
          { key: "central",    label: "Центральная",
            desc2d: "жирная обводка",
            desc3d: "увеличенный масштаб + яркость" },
          { key: "peripheral", label: "Периферийная",
            desc2d: "тонкая обводка",
            desc3d: "уменьшенный масштаб + приглушённость" },
      ];

      const visibleStruct = STRUCT_LEGEND.filter(s => structRolesActive.has(s.key));
      if (visibleStruct.length) {
        h += secTitle("СТРУКТУРНЫЕ РОЛИ (МАРКЕР)", 10);
        for (const s of visibleStruct) {
          const desc = mode === "2d" ? s.desc2d : s.desc3d;
          let icon = "";
          if (mode === "2d") {
            // 2D-иконки (SVG-маркеры обводки/силуэта)
            if (s.key === "core")
              icon = `<svg width="22" height="16" style="flex-shrink:0">
                <circle cx="11" cy="8" r="6" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.5"/>
                <circle cx="11" cy="8" r="3.3" fill="rgba(255,255,255,.5)"/>
              </svg>`;
            else if (s.key === "generative")
              icon = `<svg width="22" height="16" style="flex-shrink:0">
                <circle cx="11" cy="8" r="5" fill="rgba(255,200,50,.3)" stroke="rgba(255,200,50,.6)" stroke-width="1"/>
                <circle cx="11" cy="8" r="8" fill="none" stroke="rgba(255,200,50,.15)" stroke-width="3"/>
              </svg>`;
            else if (s.key === "bridge")
              icon = `<svg width="22" height="16" style="flex-shrink:0">
                <circle cx="11" cy="8" r="5" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1.5" stroke-dasharray="3,2"/>
              </svg>`;
            else if (s.key === "central")
              icon = `<svg width="22" height="16" style="flex-shrink:0">
                <circle cx="11" cy="8" r="5" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="3"/>
              </svg>`;
            else if (s.key === "peripheral")
              icon = `<svg width="22" height="16" style="flex-shrink:0">
                <circle cx="11" cy="8" r="5" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="0.8"/>
              </svg>`;
          } else {
              // 3D-иконки (стилизация под трёхмерный вид)
              if (s.key === "core")
                icon = `<svg width="22" height="16" style="flex-shrink:0">
                  <circle cx="11" cy="8" r="6" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.3)" stroke-width="1"/>
                  <circle cx="11" cy="8" r="3.3" fill="rgba(255,255,255,.7)"/>
                </svg>`;
              else if (s.key === "generative")
                icon = `<svg width="22" height="16" style="flex-shrink:0">
                  <circle cx="11" cy="8" r="5" fill="rgba(255,200,50,.4)" stroke="rgba(255,200,50,.8)" stroke-width="1.5"/>
                  <circle cx="11" cy="8" r="8" fill="none" stroke="rgba(255,200,50,.25)" stroke-width="4"/>
                </svg>`;
              else if (s.key === "bridge")
                icon = `<svg width="22" height="16" style="flex-shrink:0">
                  <circle cx="11" cy="8" r="5" fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.3)" stroke-width="1"/>
                  <line x1="6" y1="4" x2="16" y2="4" stroke="rgba(255,255,255,.7)" stroke-width="1"/>
                  <line x1="6" y1="8" x2="16" y2="8" stroke="rgba(255,255,255,.7)" stroke-width="1"/>
                  <line x1="6" y1="12" x2="16" y2="12" stroke="rgba(255,255,255,.7)" stroke-width="1"/>
                </svg>`;
              else if (s.key === "central")
                icon = `<svg width="22" height="16" style="flex-shrink:0">
                  <circle cx="11" cy="8" r="7" fill="rgba(255,255,255,.25)" stroke="rgba(255,255,255,.5)" stroke-width="1.5"/>
                </svg>`;
              else if (s.key === "peripheral")
                icon = `<svg width="22" height="16" style="flex-shrink:0">
                  <circle cx="11" cy="8" r="3.5" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.2)" stroke-width="0.8"/>
                </svg>`;
          }

          h += `<div class="gm-legend-item gm-legend-clickable" data-filter-type="role" data-role-key="${s.key}" data-role-layer="structural">${icon}<span>${s.label} — ${desc}</span></div>`;
        }
      }
      
        // ── Секция 3: типы рёбер ──────────────────────────────────────────────────
        if (edgeTypes?.size) {
          h += secTitle("ТИПЫ СВЯЗЕЙ", 10);
          for (const t of edgeTypes) {
            const { color, dash } = edgeTypeStyle(t);
            const da = dash ? `stroke-dasharray="${dash}"` : "";
            h += `<div class="gm-legend-item">
              <svg width="22" height="10" style="flex-shrink:0">
                <line x1="1" y1="5" x2="21" y2="5" stroke="${color}" stroke-width="2" ${da}/>
              </svg>
              <span>${t}</span>
            </div>`;
          }
        }
      
        // ── Секция 4: кластеры ────────────────────────────────────────────────────
        if (clusterLabels?.length) {
          h += secTitle("КЛАСТЕРЫ", 10);
          clusterLabels.forEach((label, i) => {
            const c = CPAL[i % CPAL.length];
            h += `<div class="gm-legend-item gm-legend-clickable" data-filter-type="cluster" data-cluster-idx="${i}">
              <svg width="22" height="10" style="flex-shrink:0">
                <circle cx="11" cy="5" r="4" fill="none" stroke="${c}"
                  stroke-width="1.5" stroke-dasharray="2,1.5"/>
              </svg>
              <span>${label}</span>
            </div>`;
          });
        }
      
        // ── Подсказки ─────────────────────────────────────────────────────────────
        h += `<div class="gm-legend-hint" style="margin-top:8px">→ однонаправл. · ↔ двунаправл. · ↺ рефлексив.</div>`;
        h += `<div class="gm-legend-hint">⌀ опр-ть = прозрач. заливки · ◼- - мост = пункт. обводка</div>`;
      
        l.innerHTML = h;

        // ── Обработчики click/touch на элементах легенды ────────────────────
        l.querySelectorAll(".gm-legend-clickable").forEach(el => {
          function handleLegendClick(e) {
            e.stopPropagation();
            e.preventDefault();
            const filterType = el.dataset.filterType;
            const is3d = currentViewMode === "3d";

            // Повторный клик — сброс
            if (el.classList.contains("active")) {
              el.classList.remove("active");
              legendFilter = null;
              if (is3d && graphAPI3d)  graphAPI3d.clearSelection();
              if (!is3d && graphAPI2d) graphAPI2d.clearSelection();
              return;
            }

            // Снять active со всех
            l.querySelectorAll(".gm-legend-clickable.active")
              .forEach(a => a.classList.remove("active"));
            el.classList.add("active");

            if (filterType === "role") {
              const roleKey = el.dataset.roleKey;
              const layer   = el.dataset.roleLayer;
              legendFilter  = { type: "role", key: roleKey, layer };
              if (is3d && graphAPI3d)  graphAPI3d.applyRoleFilter(roleKey, layer);
              if (!is3d && graphAPI2d) graphAPI2d.applyRoleFilter(roleKey, layer);
            }
            else if (filterType === "cluster") {
              const idx    = Number(el.dataset.clusterIdx);
              legendFilter = { type: "cluster", idx };
              if (is3d && graphAPI3d)  graphAPI3d.applyClusterFilter(idx);
              if (!is3d && graphAPI2d) graphAPI2d.applyClusterFilter(idx);
            }
          }

          el.addEventListener("click", handleLegendClick);
          el.addEventListener("touchend", (e) => {
            e.stopPropagation();
            handleLegendClick(e);
          }, { passive: false });
        });
      }

      function switchView(v) {
        currentViewMode = v;
        clearLegendFilter();
        document.getElementById("view3d").classList.toggle("active", v === "3d");
        document.getElementById("view2d").classList.toggle("active", v === "2d");
        document.getElementById("tab3d").classList.toggle("active", v === "3d");
        document.getElementById("tab2d").classList.toggle("active", v === "2d");
        document.getElementById("gmHint").textContent =
          v === "3d"
            ? "Вращение: мышь · Зум: колёсико · Перетаскивание узлов"
            : "Перетаскивание узлов · Зум: колёсико";

        if (v === "3d") build3D();
        else build2D();

        // Легенда строится здесь — один раз, гарантированно, с правильным режимом
        buildLegend(
          new Set(G.nodes.map(n => n.type || "другое")),
          new Set(G.edges.map(e => e.type).filter(Boolean)),
          G.topology?.clusterLabels || [],
          v
        );
      }

      function openGraph() {
        if (!G.nodes.length) {
          alert("Нет данных графа.");
          return;
        }
        document.getElementById("gmOverlay").classList.add("visible");
        document.body.style.overflow = "hidden";
        switchView("3d");
      }

      function closeGraph() {
        document.getElementById("gmOverlay").classList.remove("visible");
        document.body.style.overflow = "";
        if (anim3d) cancelAnimationFrame(anim3d);
        anim3d = null;
        if (sim2d) { sim2d.stop(); sim2d = null; }
        if (resizeObs3d) { resizeObs3d.disconnect(); resizeObs3d = null; }
        if (scene3d) {
          scene3d.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
              if (obj.material.map) obj.material.map.dispose();
              obj.material.dispose();
            }
          });
          scene3d = null;
        }
        const c = document.getElementById("view3d").querySelector("canvas");
        if (c) c.remove();
        if (renderer3d) {
          renderer3d.dispose();
          renderer3d = null;
        }
      }

      function toggleExportMenu(e) {
        e.stopPropagation();
        document.getElementById("exportWrap").classList.toggle("open");
      }

      function closeExportMenu() {
        document.getElementById("exportWrap").classList.remove("open");
      }

      function doExport(fn) {
        closeExportMenu();
        fn();
      }

      // Клик в любое место вне меню — закрыть
      document.addEventListener("click", function(e) {
        const wrap = document.getElementById("exportWrap");
        if (wrap && !wrap.contains(e.target)) closeExportMenu();
      });
