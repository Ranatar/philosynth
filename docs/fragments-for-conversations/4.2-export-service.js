// Фрагменты philosynth.html (26 024 стр., ревизия 2026-07) для беседы 4.2-export-service
// Сгенерировано extract-fragments.py; при обновлении исходника — перегенерировать.

// ───── [auditCSS] philosynth.html строки 17836–18002 ─────
      function auditCSS(cssText, contentToCheck) {
 
        // ── 1. Парсер CSS ──────────────────────────────────────────────
        // Нужен только чтобы найти границы правил.
        // Возвращает плоское дерево: rule / keyframes / at-cond / at-block / at-simple / comment
        function parseCSS(css) {
          let i = 0;
          const len = css.length;
       
          function readComment() {
            let s = '/*'; i += 2;
            while (i < len - 1) {
              if (css[i] === '*' && css[i+1] === '/') { s += '*/'; i += 2; return s; }
              s += css[i++];
            }
            return s;
          }
       
          function readUntil(stops) {
            let s = '';
            while (i < len) {
              if (css[i] === '/' && css[i+1] === '*') { readComment(); continue; }
              if (stops.indexOf(css[i]) !== -1) return s;
              s += css[i++];
            }
            return s;
          }
       
          function readBlock() {
            let depth = 1, s = '';
            while (i < len) {
              if (css[i] === '/' && i+1 < len && css[i+1] === '*') { s += readComment(); continue; }
              if (css[i] === '{') depth++;
              if (css[i] === '}') { if (!--depth) { i++; return s; } }
              s += css[i++];
            }
            return s;
          }
       
          const rules = [];
       
          while (i < len) {
            while (i < len && /\s/.test(css[i])) i++;
            if (i >= len) break;
       
            if (css[i] === '/' && css[i+1] === '*') {
              rules.push({ type: 'comment', raw: readComment() }); continue;
            }
       
            if (css[i] === '@') {
              i++;
              let kw = '';
              while (i < len && /[a-zA-Z-]/.test(css[i])) kw += css[i++];
              while (i < len && /\s/.test(css[i])) i++;
              const prelude = readUntil(['{', ';']).trim();
       
              if (i < len && css[i] === ';') {
                i++;
                rules.push({ type: 'at-simple', kw, prelude }); continue;
              }
              if (i < len && css[i] === '{') {
                i++;
                const body = readBlock();
                if (/^(-\w+-)?keyframes$/.test(kw)) {
                  rules.push({ type: 'keyframes', name: prelude, body });
                } else if (kw === 'media' || kw === 'supports' || kw === 'layer') {
                  rules.push({ type: 'at-cond', kw, prelude, inner: parseCSS(body) });
                } else {
                  rules.push({ type: 'at-block', kw, prelude, body });
                }
              }
              continue;
            }
       
            const selector = readUntil(['{', '}']).trim();
            if (i >= len) break;
            if (css[i] === '}') { i++; continue; }
            i++;
            const body = readBlock();
            if (selector) rules.push({ type: 'rule', selector, body });
          }
       
          return rules;
        }
       
        // ── 2. Консервативная проверка «точно не используется» ────────
        //
        // Используем indexOf по сырой строке контента — это намеренно
        // избыточно: если «foo» встречается где угодно (даже в комментарии
        // или строковом литерале JS), правило НЕ удаляется.
        // Это цена безопасности: лишние стили лучше, чем сломанные.
       
        function classesFromSelector(sel) {
          const out = [];
          const re = /\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g;
          let m;
          while ((m = re.exec(sel)) !== null) out.push(m[1]);
          return out;
        }
       
        function definitelyUnused(r) {
          // Комментарии, @font-face, @import, @charset и т.п. — никогда не удаляем
          if (r.type === 'comment')   return false;
          if (r.type === 'at-simple') return false;
          if (r.type === 'at-block')  return false;
       
          // @keyframes: удаляем только если имя анимации нигде не встречается
          if (r.type === 'keyframes') {
            return contentToCheck.indexOf(r.name) === -1;
          }
       
          // @media / @supports: удаляем только если ВСЕ вложенные правила точно не нужны
          if (r.type === 'at-cond') {
            return r.inner.length > 0 && r.inner.every(definitelyUnused);
          }
       
          if (r.type === 'rule') {
            const sel = r.selector;
       
            // Глобальные и элементные — никогда не удаляем
            if (/^(\*|:root|html|body)(\s*[,{]|$)/.test(sel)) return false;
       
            const classes = classesFromSelector(sel);
       
            // Нет класс-селекторов → элементный / атрибутный / псевдо → оставляем
            if (classes.length === 0) return false;
       
            // Удаляем только если НИ ОДИН класс не найден как подстрока
            return classes.every(function(c) {
              return contentToCheck.indexOf(c) === -1;
            });
          }
       
          // Неизвестный тип — оставляем
          return false;
        }
       
        // ── 3. Сериализация с удалением «точно ненужных» ──────────────
        function serializeRules(rules, indent) {
          indent = indent || '';
          const parts = [];
       
          rules.forEach(function(r) {
            // Удаляем только если УВЕРЕНЫ
            if (definitelyUnused(r)) return;
       
            if (r.type === 'comment')   { parts.push(r.raw); return; }
            if (r.type === 'at-simple') { parts.push('@' + r.kw + ' ' + r.prelude + ';'); return; }
            if (r.type === 'rule')      { parts.push(r.selector + ' {' + r.body + '}'); return; }
            if (r.type === 'keyframes') { parts.push('@keyframes ' + r.name + ' {' + r.body + '}'); return; }
            if (r.type === 'at-block')  { parts.push('@' + r.kw + ' ' + r.prelude + ' {' + r.body + '}'); return; }
       
            if (r.type === 'at-cond') {
              // Фильтруем вложенные, но только если внутри что-то осталось
              const inner = serializeRules(r.inner, indent + '  ');
              if (inner.trim())
                parts.push('@' + r.kw + ' ' + r.prelude + ' {\n' + inner + '\n' + indent + '}');
              return;
            }
          });
       
          return parts.map(function(p) { return indent + p; }).join('\n');
        }
       
        return serializeRules(parseCSS(cssText), '');
      }

// ───── [buildGraphExportSection] philosynth.html строки 17679–17834 ─────
      function buildGraphExportSection(graphData, filenameBase) {
        if (!graphData || !graphData.nodes || !graphData.nodes.length) return "";
 
        // ── 1. Клонируем модальное окно из DOM, очищаем динамическое состояние ──
        const overlayEl = document.getElementById("gmOverlay");
        if (!overlayEl) return "";
        const clone = overlayEl.cloneNode(true);
        clone.classList.remove("visible");
        // Убираем canvas Three.js если был открыт 3D-вид
        const oldCanvas = clone.querySelector("canvas");
        if (oldCanvas) oldCanvas.remove();
        // Очищаем содержимое 2D-вида (D3 SVG) — будет перестроено при открытии
        const v2 = clone.querySelector("#view2d");
        if (v2) v2.innerHTML = "";
        // Сбрасываем активные табы на 3D (дефолт при открытии openGraph)
        const t3 = clone.querySelector("#tab3d");
        const t2 = clone.querySelector("#tab2d");
        const vw3 = clone.querySelector("#view3d");
        const vw2 = clone.querySelector("#view2d");
        if (t3) { t3.classList.add("active");  }
        if (t2) { t2.classList.remove("active"); }
        if (vw3) { vw3.classList.add("active"); }
        if (vw2) { vw2.classList.remove("active"); }
        // Очищаем легенду — будет перестроена функцией buildLegend
        const leg = clone.querySelector("#gmLegend");
        if (leg) leg.innerHTML = "";
        const modalHTML = clone.outerHTML;
 
        // ── 2. Сериализуем все функции графа через .toString() ──
        // Порядок важен: хелперы — перед потребителями.
        const fnBundle = [
          normalizeName,
          normalizeType,
          parseTopology,
          parseGraph,
           _hexToHSL,
          _hslToHex,
          _blendHex,
          _rebuildNodeColors,
          _rebuildEdgeStyles,
          edgeTypeStyle,
          showNodePanel,
          showEdgePanel,
          typeColor,
          typeColorHex,
          getTopRole,
          getStructuralMarkers,
          getStructuralMarker,
          polyPath,
          hexStarPath,
          trapezoidPath,   
          rectPath,              
          nodeSymbolPath,
          nodeGeometry3D,
          tick,
          warmup,
          mkSprite,
          getRolesFromLayer,
          getRolesForMode,
          getAllRoles,
          applyClusters3D, 
          applyClusters2D, 
          toggleClusters,
          clearLegendFilter,
          build3D,
          build2D,
          buildLegend,
          switchView,
          openGraph,
          closeGraph,
          downloadFile,
          toggleExportMenu,
          closeExportMenu,
          doExport,
          exportMMD,
          exportPNG,
          exportJSON,
        ]
          .map((fn) => fn.toString())
          .join("\n\n");

        const constBundle = [
          ["_TC_HUE_SEEDS",      _TC_HUE_SEEDS],
          ["_EC_HUE_SEEDS",      _EC_HUE_SEEDS],
          ["_EC_DASH_SEEDS",     _EC_DASH_SEEDS],
          ["CPAL",               CPAL],
          ["PROCEDURAL_PRIORITY", PROCEDURAL_PRIORITY],
          ["STRUCTURAL_PRIORITY", STRUCTURAL_PRIORITY],
        ].map(([name, val]) => `const ${name} = ${JSON.stringify(val)};`).join("\n");
 
        // ── 3. Собираем самодостаточный скрипт ──
        // getDocFilename фиксируется по базовому имени на момент сохранения.
        // Все функции экспортируются в window, чтобы работали onclick-атрибуты
        // внутри клонированного модального HTML.

        const initScript = `
(function () {

  ${constBundle}

  var _nodeColorMap = new Map();
  var _edgeStyleMap = new Map();
  var G = {
          nodes: [], edges: [],
          topology: { clusters: {}, roles: { structural: {}, procedural: {} }, clusterLabels: [] }
        };
  var anim3d = null;
  var renderer3d = null;
  var scene3d = null;
  var sim2d = null;
  var resizeObs3d = null;
  var clusterVisible   = false;
  var roleMode         = "procedural";
  var clusterObjects3d = null;   
  var clusterObjects2d = null;
  var graphAPI3d       = null;
  var graphAPI2d       = null;
  var currentViewMode  = "3d";
  var legendFilter     = null;

  document.addEventListener('DOMContentLoaded', function () {
    var ct = document.getElementById('docOutput') || document.body;
    var parsed = parseGraph(ct);
    if (parsed.nodes.length) G = parsed;
  });

  document.addEventListener("click", function(e) {
    const wrap = document.getElementById("exportWrap");
    if (wrap && !wrap.contains(e.target)) closeExportMenu();
  });
 
  function getDocFilename(ext) {
    return ${JSON.stringify(filenameBase)} + (ext ? "." + ext : "");
  }
 
  ${fnBundle}
 
  // Экспорт в глобальную область для onclick-атрибутов клонированного модала
  window.openGraph   = openGraph;
  window.closeGraph  = closeGraph;
  window.switchView  = switchView;
  window.toggleExportMenu = toggleExportMenu;
  window.closeExportMenu  = closeExportMenu;
  window.doExport         = doExport;
  window.exportMMD   = exportMMD;
  window.exportPNG   = exportPNG;
  window.exportJSON  = exportJSON;
  window.toggleClusters = toggleClusters;
})();`;
 
        // ── 4. Кнопки-контролы встраиваются в saveHTML() в начало раздела графа ──
        return `${modalHTML}
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"><\/script>
<script>${initScript}<\/script>`;
      }

// ───── [exportJSON] philosynth.html строки 17266–17312 ─────
      function exportJSON() {
        if (!G.nodes.length) { alert("Нет графа."); return; }

        const topo = G.topology || { clusters: {}, roles: { structural: {}, procedural: {} }, clusterLabels: [] };

        const data = {
          meta: {
            format:    "PhiloSynth Graph",
            version:   1,
            exported:  new Date().toISOString(),
            document:  document.getElementById("docNum")?.textContent?.trim() || null,
            title:     document.getElementById("docTitle")?.textContent?.trim() || null,
          },
          nodes: G.nodes.map(n => ({
            name:        n.name,
            type:        n.type || null,
            definition:  n.def  || null,
            centrality:  n.cen  ?? 0.5,
            certainty:   n.cert ?? 0.5,
            origin:      n.orig || null,
            roles: {
              structural: [...(getRolesFromLayer("structural", n.name) || [])],
              procedural: [...(getRolesFromLayer("procedural", n.name) || [])],
            },
            clusters: (topo.clusters?.[n.name] || []).map(idx => ({
              index: idx,
              label: topo.clusterLabels?.[idx] || null,
            })),
          })),
          edges: G.edges.map(e => ({
            source:      e.src,
            target:      e.tgt,
            type:        e.type  || null,
            description: e.desc  || null,
            direction:   e.dir   || null,
            strength:    e.str   ?? 0.5,
          })),
          clusters: (topo.clusterLabels || []).map((label, idx) => ({
            index:   idx,
            label:   label,
            members: G.nodes.filter(n => (topo.clusters?.[n.name] || []).includes(idx)).map(n => n.name),
          })),
        };

        const json = JSON.stringify(data, null, 2);
        downloadFile(json, getDocFilename("json"), "application/json");
      }

// ───── [exportMMD] philosynth.html строки 16370–16591 ─────
      function exportMMD() {
        if (!G.nodes.length) {
          alert("Нет графа.");
          return;
        }

        const topo = G.topology || { clusters: {}, roles: { structural: {}, procedural: {} }, clusterLabels: [] };
        const clLabels = topo.clusterLabels || [];
        const lines = [];

        lines.push("graph TD");

        // ── Информация об узлах ────────────────────────────────────────
        const nodeInfo = G.nodes.map((n, i) => {
          const clusters = topo.clusters?.[n.name] || [];
          const structRoles = getRolesFromLayer("structural", n.name);
          const procRoles   = getRolesFromLayer("procedural", n.name);

          let topStruct = null;
          for (const r of STRUCTURAL_PRIORITY)
            if (structRoles.has(r)) { topStruct = r; break; }

          let topProc = null;
          for (const r of PROCEDURAL_PRIORITY)
            if (procRoles.has(r)) { topProc = r; break; }

          return {
            idx: i, name: n.name, type: n.type || "другое",
            cen: n.cen ?? 0.5, cert: n.cert ?? 0.5,
            clusters, topStruct, topProc,
          };
        });

        // ── Карта копий узлов ──────────────────────────────────────────
        // Мульти-кластерный узел → по одной копии на кластер: N{i}_{copyIdx}
        // Одно-/без-кластерный   → N{i}
        const copyMap = nodeInfo.map(ni => {
          const map = {};
          if (ni.clusters.length <= 1) {
            map[ni.clusters[0] ?? -1] = "N" + ni.idx;
          } else {
            ni.clusters.forEach((clIdx, ci) => {
              map[clIdx] = "N" + ni.idx + "_" + ci;
            });
          }
          return map;
        });

        function anyId(i)              { return Object.values(copyMap[i])[0]; }
        function idInCluster(i, clIdx) { return copyMap[i][clIdx] || anyId(i); }

        // ── Экранирование метки ────────────────────────────────────────
        function esc(s) { return s.replace(/"/g, "&quot;"); }

        // ── Объявление узла (форма по процессуальной роли) ─────────────
        function nodeDecl(id, label, procRole) {
          const e = esc(label);
          switch (procRole) {
            case "synthesis":     return id + '{{"`' + e + '`"}}';            // гексагон
            case "thesis":        return id + '[/"`' + e + '`"/]';            // параллелограмм →
            case "antithesis":    return id + '[\\"`' + e + '`"\\]';          // параллелограмм ←
            case "deconstructed": return id + '{"`' + e + '`"}';              // ромб
            case "reassembled":   return id + '>"`' + e + '`"]';              // асимметричная
            case "horizon-expansion":  return id + '(("`' + e + '`"))';       // круг
            case "pre-horizon":        return id + '(["`' + e + '`"])';       // стадион
            case "integrating":        return id + '[/"`' + e + '`"\\]';      // трапеция
            case "foundation":         return id + '[["`' + e + '`"]]';       // подпрограмма
            case "formalized":         return id + '[("`' + e + '`")]';       // цилиндр
            case "verifying":          return id + '((("`' + e + '`")))';     // двойной круг
            default:              return id + '["`' + e + '`"]';              // прямоугольник
          }
        }

        function textColorForBg(hex) {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          // Относительная яркость (формула W3C)
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          return lum > 0.55 ? "#1a1814" : "#fff";
        }

        // ── Субграфы кластеров ─────────────────────────────────────────
        const clusterMembers = {};   // clIdx → [nodeIdx, …]
        nodeInfo.forEach(ni => {
          ni.clusters.forEach(clIdx => {
            if (!clusterMembers[clIdx]) clusterMembers[clIdx] = [];
            clusterMembers[clIdx].push(ni.idx);
          });
        });

        lines.push("");
        for (const [clIdxStr, members] of Object.entries(clusterMembers)) {
          const clIdx = Number(clIdxStr);
          const label = esc(clLabels[clIdx] || "Кластер " + (clIdx + 1));
          lines.push('    subgraph CL' + clIdx + '["' + label + '"]');
          for (const i of members) {
            lines.push("        " + nodeDecl(copyMap[i][clIdx], nodeInfo[i].name, nodeInfo[i].topProc));
          }
          lines.push("    end");
        }

        // Узлы без кластера
        const orphans = nodeInfo.filter(ni => ni.clusters.length === 0);
        for (const ni of orphans) {
          lines.push("    " + nodeDecl(anyId(ni.idx), ni.name, ni.topProc));
        }

        // ── Связи между копиями мульти-кластерных узлов ────────────────
        lines.push("");
        let linkIdx = 0;
        const interCopyIndices = [];

        nodeInfo.forEach(ni => {
          if (ni.clusters.length <= 1) return;
          const ids = ni.clusters.map(clIdx => copyMap[ni.idx][clIdx]);
          for (let j = 0; j < ids.length - 1; j++) {
            lines.push("    " + ids[j] + " --- " + ids[j + 1]);
            interCopyIndices.push(linkIdx);
            linkIdx++;
          }
        });

        // ── Рёбра графа ───────────────────────────────────────────────
        lines.push("");
        const nm = Object.fromEntries(G.nodes.map((n, i) => [n.name.toLowerCase(), i]));
        const edgeStyleLines = [];

        for (const e of G.edges) {
          const si = nm[e.src.toLowerCase().trim()];
          const ti = nm[e.tgt.toLowerCase().trim()];
          if (si == null || ti == null) continue;

          // Маршрутизация через первый общий кластер
          const sCl = nodeInfo[si].clusters;
          const tCl = nodeInfo[ti].clusters;
          let shared = -1;
          for (const c of sCl) {
            if (tCl.includes(c)) { shared = c; break; }
          }

          const sId = shared !== -1 ? idInCluster(si, shared) : anyId(si);
          const tId = shared !== -1 ? idInCluster(ti, shared) : anyId(ti);

          const lb = esc(e.type || e.desc || "");
          const isRefl = e.dir.includes("рефлексив") || sId === tId;
          const isBi   = e.dir.includes("двунаправлен");

          if (isRefl)        lines.push('    ' + sId + ' -->|"' + lb + ' ↺"| ' + sId);
          else if (isBi)     lines.push('    ' + sId + ' <-->|"' + lb + '"| ' + tId);
          else               lines.push('    ' + sId + ' -->|"' + lb + '"| ' + tId);

          // Стиль ребра: цвет по типу, толщина по силе
          const { color } = edgeTypeStyle(e.type);
          const str = e.str || 0.5;
          const sw  = (1 + str * 4).toFixed(1);
          const dashPart = str < 0.3 ? ",stroke-dasharray:3" : "";
          edgeStyleLines.push("    linkStyle " + linkIdx +
            " stroke:" + color + ",stroke-width:" + sw + "px" + dashPart);
          linkIdx++;
        }

        // ── linkStyle: inter-copy связи ────────────────────────────────
        lines.push("");
        for (const idx of interCopyIndices) {
          lines.push("    linkStyle " + idx + " stroke:#888,stroke-width:1px,stroke-dasharray:5");
        }

        // ── linkStyle: рёбра графа ────────────────────────────────────
        edgeStyleLines.forEach(s => lines.push(s));

        // ── classDef: цвет по типу категории ──────────────────────────
        lines.push("");
        const typeGroups = {};
        nodeInfo.forEach(ni => {
          const t = ni.type;
          if (!typeGroups[t]) typeGroups[t] = [];
          typeGroups[t].push(...Object.values(copyMap[ni.idx]));
        });

        let ci = 0;
        for (const [t, ids] of Object.entries(typeGroups)) {
          const cn = "t" + ci++;
          const hex = typeColorHex(t);
          const txtColor = textColorForBg(hex);
          lines.push("    classDef " + cn + " fill:" + hex + ",stroke:" + hex + ",color:" + txtColor);
        }

        // ── Per-node style: структурная роль + центральность + определённость ─
        lines.push("");
        const STRUCT_DASH = {
          generative: "8,3",
          bridge:     "4,3",
          peripheral: "2,2",
        };
        // core, central — без пунктира (сплошная обводка)

        nodeInfo.forEach(ni => {
          const ids     = Object.values(copyMap[ni.idx]);
          const sw      = (1 + ni.cen * 4).toFixed(1);
          const fo      = (0.2 + ni.cert * 0.65).toFixed(2);
          const dashArr = STRUCT_DASH[ni.topStruct];
          const dashPart = dashArr ? ",stroke-dasharray:" + dashArr : "";

          for (const id of ids) {
            lines.push("    style " + id +
              " stroke-width:" + sw + "px,fill-opacity:" + fo + dashPart);
          }
        });

        // ── Стили субграфов (кластерные цвета) ─────────────────────────
        lines.push("");
        for (const clIdxStr of Object.keys(clusterMembers)) {
          const clIdx = Number(clIdxStr);
          const hex = CPAL[clIdx % CPAL.length];
          lines.push("    style CL" + clIdx +
            " fill:" + hex + ",fill-opacity:0.08,stroke:" + hex + ",stroke-width:2px");
        }

        downloadFile(lines.join("\n"), getDocFilename("mmd"), "text/plain");
      }

// ───── [exportPNG] philosynth.html строки 16592–17264 ─────
      function exportPNG() {
        if (!G.nodes.length) { alert("Нет графа."); return; }

        const topo  = G.topology || { clusters: {}, roles: { structural: {}, procedural: {} }, clusterLabels: [] };
        const clLabels = topo.clusterLabels || [];

        // ── Параметры холста ───────────────────────────────────────────
        const PAD   = 120;
        const W     = 2048;
        const H     = 2048;
        const cv    = document.createElement("canvas");
        cv.width    = W;
        cv.height   = H;
        const ctx   = cv.getContext("2d");

        // ── Раскладка (собственный 2D force layout) ────────────────────
        const { ns, es } = warmup(G.nodes, G.edges, 2);

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of ns) {
          if (n.x < minX) minX = n.x;
          if (n.x > maxX) maxX = n.x;
          if (n.y < minY) minY = n.y;
          if (n.y > maxY) maxY = n.y;
        }
        const spanX = (maxX - minX) || 1;
        const spanY = (maxY - minY) || 1;
        const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
        const offX  = W / 2 - (minX + maxX) / 2 * scale;
        const offY  = H / 2 - (minY + maxY) / 2 * scale;
        for (const n of ns) {
          n.px = n.x * scale + offX;
          n.py = n.y * scale + offY;
        }

        // ── Утилиты ────────────────────────────────────────────────────
        function hexStr(hexInt) {
          return "#" + hexInt.toString(16).padStart(6, "0");
        }

        function nodeR(n) { return 8 + (n.cen || 0.5) * 22; }

        function getTopProc(name) {
          const roles = getRolesFromLayer("procedural", name);
          for (const r of PROCEDURAL_PRIORITY) if (roles.has(r)) return r;
          return null;
        }

        // ── Формы процессуальных ролей (соответствуют nodeSymbolPath) ─
        function drawNodeShape(n) {
          const x = n.px, y = n.py, r = nodeR(n);
          const proc = getTopProc(n.name);
          ctx.beginPath();
          switch (proc) {
            case "synthesis":          polygon(x, y, r, 8); break;          // октагон
            case "thesis":             polygon(x, y, r, 3); break;          // треугольник ▲
            case "antithesis":         polygon(x, y, r, 3, Math.PI / 2); break; // треугольник ▽
            case "deconstructed":      crossShape(x, y, r); break;          // крест ✚
            case "reassembled":        hexStarShape(x, y, r); break;        // ✡ звезда Давида
            case "horizon-expansion":  diamondShape(x, y, r); break;        // ромб ◇
            case "pre-horizon":        polygon(x, y, r, 7); break;          // гептагон
            case "integrating":        wyeShape(x, y, r); break;            // Y-образная ⋈
            case "foundation":         trapezoid(x, y, r); break;           // трапеция
            case "formalized":         rectShape(x, y, r); break;           // прямоугольник
            case "verifying":          starShape5(x, y, r); break;          // пятилучевая ☆
            default:                   ctx.arc(x, y, r, 0, Math.PI * 2);    // круг ●
          }
        }

        function polygon(cx, cy, r, sides, rotOffset) {
          const rot = (rotOffset != null) ? rotOffset : -Math.PI / 2;
          for (let i = 0; i < sides; i++) {
            const a = rot + (i / sides) * Math.PI * 2;
            const px = cx + Math.cos(a) * r;
            const py = cy + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        }

        function crossShape(cx, cy, r) {
          const arm = r * 0.35;
          ctx.moveTo(cx - arm, cy - r);
          ctx.lineTo(cx + arm, cy - r);
          ctx.lineTo(cx + arm, cy - arm);
          ctx.lineTo(cx + r,   cy - arm);
          ctx.lineTo(cx + r,   cy + arm);
          ctx.lineTo(cx + arm, cy + arm);
          ctx.lineTo(cx + arm, cy + r);
          ctx.lineTo(cx - arm, cy + r);
          ctx.lineTo(cx - arm, cy + arm);
          ctx.lineTo(cx - r,   cy + arm);
          ctx.lineTo(cx - r,   cy - arm);
          ctx.lineTo(cx - arm, cy - arm);
          ctx.closePath();
        }

        function hexStarShape(cx, cy, r) {
          const inner = r / Math.sqrt(3);
          for (let i = 0; i < 12; i++) {
            const a = (i * Math.PI / 6) - Math.PI / 2;
            const rad = i % 2 === 0 ? r : inner;
            const px = cx + Math.cos(a) * rad;
            const py = cy + Math.sin(a) * rad;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        }

        function diamondShape(cx, cy, r) {
          ctx.moveTo(cx, cy - r);
          ctx.lineTo(cx + r * 0.6, cy);
          ctx.lineTo(cx, cy + r);
          ctx.lineTo(cx - r * 0.6, cy);
          ctx.closePath();
        }

        function wyeShape(cx, cy, r) {
          const armW = r * 0.3;
          const angles = [-Math.PI / 2, Math.PI / 6, 5 * Math.PI / 6];
          // Build Y-shape: 3 arms from center
          for (let a = 0; a < 3; a++) {
            const ang = angles[a];
            const perp = ang + Math.PI / 2;
            const tipX = cx + Math.cos(ang) * r;
            const tipY = cy + Math.sin(ang) * r;
            const lx = tipX + Math.cos(perp) * armW;
            const ly = tipY + Math.sin(perp) * armW;
            const rx = tipX - Math.cos(perp) * armW;
            const ry = tipY - Math.sin(perp) * armW;
            const blx = cx + Math.cos(perp) * armW * 0.5;
            const bly = cy + Math.sin(perp) * armW * 0.5;
            const brx = cx - Math.cos(perp) * armW * 0.5;
            const bry = cy - Math.sin(perp) * armW * 0.5;
            ctx.moveTo(blx, bly);
            ctx.lineTo(lx, ly);
            ctx.lineTo(rx, ry);
            ctx.lineTo(brx, bry);
            ctx.closePath();
          }
        }

        function trapezoid(cx, cy, r) {
          const top = r * 0.6, bot = r, h = r * 0.8;
          ctx.moveTo(cx - top, cy - h);
          ctx.lineTo(cx + top, cy - h);
          ctx.lineTo(cx + bot, cy + h);
          ctx.lineTo(cx - bot, cy + h);
          ctx.closePath();
        }

        function rectShape(cx, cy, r) {
          const w = r * 1.2, h = r * 0.8;
          ctx.rect(cx - w, cy - h, w * 2, h * 2);
        }

        function starShape5(cx, cy, r) {
          const inner = r * 0.45;
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
            const rad = i % 2 === 0 ? r : inner;
            const px = cx + Math.cos(a) * rad;
            const py = cy + Math.sin(a) * rad;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        }

        // ── Стрелка на конце линии ─────────────────────────────────────
        function drawArrow(x1, y1, x2, y2, color) {
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const len = 10;
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - len * Math.cos(angle - 0.35), y2 - len * Math.sin(angle - 0.35));
          ctx.lineTo(x2 - len * Math.cos(angle + 0.35), y2 - len * Math.sin(angle + 0.35));
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
        }

        // ── Convex hull для кластера ───────────────────────────────────
        function convexHull(points) {
          if (points.length < 3) return points;
          const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          const cross = (O, A, B) => (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
          const lower = [];
          for (const p of sorted) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
            lower.push(p);
          }
          const upper = [];
          for (const p of sorted.reverse()) {
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
            upper.push(p);
          }
          upper.pop();
          lower.pop();
          return lower.concat(upper);
        }

        function expandHull(hull, pad) {
          const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
          const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
          return hull.map(([x, y]) => {
            const dx = x - cx, dy = y - cy;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            return [x + (dx / d) * pad, y + (dy / d) * pad];
          });
        }

        // ══════════════════════════════════════════════════════════════
        // РИСОВАНИЕ
        // ══════════════════════════════════════════════════════════════

        // Фон
        ctx.fillStyle = "#0a0a14";
        ctx.fillRect(0, 0, W, H);

        // ── 1. Кластерные оболочки ─────────────────────────────────────
        const clusterGroups = {};
        ns.forEach(n => {
          const cls = topo.clusters?.[n.name] || [];
          cls.forEach(clIdx => {
            if (!clusterGroups[clIdx]) clusterGroups[clIdx] = [];
            clusterGroups[clIdx].push(n);
          });
        });

        for (const [clIdxStr, members] of Object.entries(clusterGroups)) {
          const clIdx = Number(clIdxStr);
          const clColor = CPAL[clIdx % CPAL.length];
          const pts = members.map(n => [n.px, n.py]);
          if (pts.length < 1) continue;

          // ── Построение оболочки в зависимости от числа точек ──
          let hullPath;  // функция, рисующая path в текущем ctx

          if (pts.length === 1) {
            // Один узел — окружность с паддингом
            const [x, y] = pts[0];
            const r = nodeR(members[0]) + 40;
            hullPath = () => {
              ctx.beginPath();
              ctx.arc(x, y, r, 0, Math.PI * 2);
              ctx.closePath();
            };
          } else if (pts.length === 2) {
            // Два узла — капсула (прямоугольник с полукруглыми торцами)
            const [a, b] = pts;
            const dx = b[0] - a[0], dy = b[1] - a[1];
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / len, uy = dy / len;          // единичный вектор вдоль
            const nx = -uy, ny = ux;                     // нормаль
            const pad = 40;
            const ra = nodeR(members[0]) + pad;
            const rb = nodeR(members[1]) + pad;
            // Используем максимальный радиус для единообразной ширины капсулы
            const r = Math.max(ra, rb);
            hullPath = () => {
              ctx.beginPath();
              // Левая дуга вокруг a
              const angleA = Math.atan2(uy, ux);
              ctx.arc(a[0], a[1], r, angleA + Math.PI / 2, angleA - Math.PI / 2);
              // Правая дуга вокруг b
              const angleB = Math.atan2(-uy, -ux);
              ctx.arc(b[0], b[1], r, angleB + Math.PI / 2, angleB - Math.PI / 2);
              ctx.closePath();
            };
          } else {
            // Три и больше — обычный convex hull
            const hull = expandHull(convexHull(pts), 40);
            hullPath = () => {
              ctx.beginPath();
              hull.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
              ctx.closePath();
            };
          }

          // ── Заливка ──
          hullPath();
          ctx.fillStyle = clColor + "15";
          ctx.fill();

          // ── Обводка ──
          hullPath();
          ctx.strokeStyle = clColor + "55";
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 4]);
          ctx.stroke();
          ctx.setLineDash([]);

          // ── Метка ──
          const cx = members.reduce((s, n) => s + n.px, 0) / members.length;
          const cy = members.reduce((s, n) => s + n.py, 0) / members.length - 50;
          const label = (clLabels[clIdx] || "Кластер " + (clIdx + 1))
            .replace(/^[IVXLCDM]+\s*[-–—]\s*/i, "").trim();
          ctx.font = "600 13px 'IBM Plex Mono', monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = clColor + "88";
          ctx.fillText(label, cx, cy);
        }

        // ── 2. Рёбра ──────────────────────────────────────────────────
        const nm = Object.fromEntries(G.nodes.map((n, i) => [n.name.toLowerCase(), i]));

        for (const e of G.edges) {
          const si = nm[e.src.toLowerCase().trim()];
          const ti = nm[e.tgt.toLowerCase().trim()];
          if (si == null || ti == null) continue;

          const sn = ns[si], tn = ns[ti];
          const { color, dash } = edgeTypeStyle(e.type);
          const str = e.str || 0.5;
          const lw  = 1 + str * 3;
          const isRefl = e.dir.includes("рефлексив") || si === ti;
          const isBi   = e.dir.includes("двунаправлен");

          ctx.strokeStyle = color;
          ctx.lineWidth   = lw;
          ctx.globalAlpha = 0.3 + str * 0.5;
          ctx.setLineDash(dash ? dash.split(",").map(Number) : (str < 0.3 ? [4, 4] : []));

          if (isRefl) {
            // Рефлексивная петля
            const r = nodeR(sn) + 18;
            ctx.beginPath();
            ctx.arc(sn.px, sn.py - r, r, 0.3 * Math.PI, 0.7 * Math.PI);
            ctx.stroke();
          } else {
            // Обычное ребро с отступом от края узла
            const angle = Math.atan2(tn.py - sn.py, tn.px - sn.px);
            const rs = nodeR(sn) + 2;
            const rt = nodeR(tn) + 2;
            const x1 = sn.px + Math.cos(angle) * rs;
            const y1 = sn.py + Math.sin(angle) * rs;
            const x2 = tn.px - Math.cos(angle) * rt;
            const y2 = tn.py - Math.sin(angle) * rt;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            // Стрелки
            ctx.setLineDash([]);
            drawArrow(x1, y1, x2, y2, color);
            if (isBi) drawArrow(x2, y2, x1, y1, color);
          }

          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }

        // ── 3. Узлы ───────────────────────────────────────────────────
        for (const n of ns) {
          const r    = nodeR(n);
          const hex  = hexStr(typeColor(n.type));
          const cert = n.cert ?? 0.5;

          // Все структурные маркеры (как в build2D)
          const sms = getStructuralMarkers(n.name);
          let strokeW    = 2;
          let strokeDash = null;
          let hasGlow    = false;
          let hasInner   = false;
          let innerScale = 0.55;
          let innerDarken = 0.35;
          for (const sm of sms) {
            if (sm.type === "central" || sm.type === "peripheral")
              strokeW = sm.strokeWidth;
            if (sm.strokeDash) strokeDash = sm.strokeDash.split(",").map(Number);
            if (sm.filter) hasGlow = true;
            if (sm.innerShape) {
              hasInner = true;
              innerScale = sm.innerScale;
              innerDarken = sm.innerDarken;
            }
          }

          // Glow (generative) — Canvas shadow
          if (hasGlow) {
          ctx.save();
          ctx.shadowBlur = 60;
          ctx.shadowColor = hex;
          ctx.shadowOffsetX = 3000;  // уводим сам объект за пределы
          ctx.shadowOffsetY = 0;

          // Повторяем 3 раза для плотности
          for (let i = 0; i < 3; i++) {
            drawNodeShape({ ...n, px: n.px - 3000, py: n.py });
            ctx.fillStyle = hex;
            ctx.fill();
          }
          ctx.restore();
        }

          // Заливка
          drawNodeShape(n);
          ctx.fillStyle = hex;
          ctx.globalAlpha = 0.25 + cert * 0.6;
          ctx.fill();

          // Обводка
          drawNodeShape(n);
          ctx.strokeStyle = hex;
          ctx.lineWidth = strokeW;
          ctx.globalAlpha = 0.85;
          ctx.setLineDash(strokeDash || []);
          ctx.stroke();
          ctx.setLineDash([]);

          if (hasGlow) ctx.restore();
          ctx.globalAlpha = 1;

          // Внутренний силуэт (core)
          if (hasInner) {
            const hsl = _hexToHSL(typeColor(n.type));
            const darkHex = "#" + _hslToHex({
              h: hsl.h, s: hsl.s * 0.9,
              l: Math.max(0.08, hsl.l - innerDarken),
            }).toString(16).padStart(6, "0");
            // Рисуем уменьшенную копию той же формы
            const saved = { px: n.px, py: n.py, cen: n.cen };
            const innerN = { ...n, cen: n.cen * innerScale };
            ctx.beginPath();
            drawNodeShape(innerN);
            ctx.fillStyle = darkHex;
            ctx.globalAlpha = 0.85;
            ctx.fill();
            ctx.globalAlpha = 1;
          }

          // ── Кольца кластеров ──────────────────────────────────────
          const cls = topo.clusters?.[n.name] || [];
          cls.forEach((clIdx, offset) => {
            const clColor = CPAL[clIdx % CPAL.length];
            const ringR = r + 6 + offset * 5;
            ctx.beginPath();
            ctx.arc(n.px, n.py, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = clColor;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.5;
            ctx.setLineDash([4, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
          });
        }

        // ── 4. Подписи ────────────────────────────────────────────────
        ctx.font = "500 13px 'IBM Plex Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        for (const n of ns) {
          const r = nodeR(n);
          const x = n.px, y = n.py - r - 5;

          // Обводка текста для читаемости
          ctx.strokeStyle = "#0a0a14";
          ctx.lineWidth = 3.5;
          ctx.lineJoin = "round";
          ctx.strokeText(n.name, x, y);

          ctx.fillStyle = "#d0c8b8";
          ctx.fillText(n.name, x, y);
        }

        // ── 5. Легенда (структура как в buildLegend) ─────────────────
        // Собираем данные: только те роли/типы, что есть в графе
        const nodeTypes = new Set(G.nodes.map(n => n.type || "другое"));
        const edgeTypes = new Set(G.edges.map(e => e.type).filter(Boolean));

        const procRolesActive = new Set();
        const procLayer = topo.roles?.procedural || {};
        for (const rl of Object.values(procLayer)) {
          const arr = rl instanceof Set ? [...rl] : Array.isArray(rl) ? rl : [];
          arr.forEach(r => procRolesActive.add(r));
        }
        const structRolesActive = new Set();
        const structLayer = topo.roles?.structural || {};
        for (const rl of Object.values(structLayer)) {
          const arr = rl instanceof Set ? [...rl] : Array.isArray(rl) ? rl : [];
          arr.forEach(r => structRolesActive.add(r));
        }

        const ROLE_REG_PNG = [
          { key:"synthesis",         label:"Синтез",           draw: (x,y,r)=>polygon(x,y,r,8) },
          { key:"thesis",            label:"Тезис",            draw: (x,y,r)=>polygon(x,y,r,3) },
          { key:"antithesis",        label:"Антитезис",        draw: (x,y,r)=>polygon(x,y,r,3,Math.PI/2) },
          { key:"deconstructed",     label:"Деконструиров.",   draw: (x,y,r)=>crossShape(x,y,r) },
          { key:"reassembled",       label:"Пересобранная",    draw: (x,y,r)=>hexStarShape(x,y,r) },
          { key:"horizon-expansion", label:"Расш. горизонта",  draw: (x,y,r)=>diamondShape(x,y,r) },
          { key:"pre-horizon",       label:"Предгоризонт",     draw: (x,y,r)=>polygon(x,y,r,7) },
          { key:"integrating",       label:"Интегрирующая",    draw: (x,y,r)=>wyeShape(x,y,r) },
          { key:"foundation",        label:"Основание",        draw: (x,y,r)=>trapezoid(x,y,r) },
          { key:"formalized",        label:"Формализованная",  draw: (x,y,r)=>rectShape(x,y,r) },
          { key:"verifying",         label:"Верифицирующая",   draw: (x,y,r)=>starShape5(x,y,r) },
        ];
        const activeProcRoles = ROLE_REG_PNG.filter(r => procRolesActive.has(r.key));

        const STRUCT_REG_PNG = [
          { key:"core",       label:"Ядро",          desc:"внутренний силуэт" },
          { key:"generative", label:"Генеративная",  desc:"свечение (glow)" },
          { key:"bridge",     label:"Мост",          desc:"пунктирная обводка" },
          { key:"central",    label:"Центральная",   desc:"жирная обводка" },
          { key:"peripheral", label:"Периферийная",  desc:"тонкая обводка" },
        ];
        const activeStructRoles = STRUCT_REG_PNG.filter(s => structRolesActive.has(s.key));

        // Подсчёт высоты легенды
        let legendRows = 0;
        legendRows += 1 + nodeTypes.size;                                       // типы категорий
        if (activeProcRoles.length) legendRows += 1 + activeProcRoles.length;   // процессуальные
        if (activeStructRoles.length) legendRows += 1 + activeStructRoles.length; // структурные
        if (edgeTypes.size) legendRows += 1 + edgeTypes.size;                   // связи
        if (clLabels.length) legendRows += 1 + clLabels.length;                 // кластеры
        legendRows += 1; // подсказка
        const ROW_H = 20;
        const legendH = legendRows * ROW_H + 30;
        const LX = 24, LY = H - legendH - 16;

        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#0a0a14dd";
        ctx.fillRect(LX - 10, LY - 14, 310, legendH + 10);
        ctx.strokeStyle = "#ffffff18";
        ctx.lineWidth = 1;
        ctx.strokeRect(LX - 10, LY - 14, 310, legendH + 10);

        let ly = LY;
        const secFont = "600 9px 'IBM Plex Mono', monospace";
        const itemFont = "500 10px 'IBM Plex Mono', monospace";
        const secColor = "rgba(255,255,255,0.45)";
        const txtColor = "#c8c0b0";

        function secTitle(text) {
          ctx.font = secFont;
          ctx.fillStyle = secColor;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(text, LX, ly);
          ly += ROW_H;
        }

        // ── Типы категорий ──
        secTitle("ТИПЫ КАТЕГОРИЙ");
        for (const t of nodeTypes) {
          ctx.beginPath();
          ctx.arc(LX + 6, ly, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = typeColorHex(t);
          ctx.fill();
          ctx.font = itemFont;
          ctx.fillStyle = txtColor;
          ctx.fillText(t, LX + 18, ly);
          ly += ROW_H;
        }

        // ── Процессуальные роли (ФОРМА) ──
        if (activeProcRoles.length) {
          secTitle("ПРОЦЕССУАЛЬНЫЕ РОЛИ (ФОРМА)");
          for (const r of activeProcRoles) {
            ctx.beginPath();
            r.draw(LX + 6, ly, 7);
            ctx.fillStyle = "#888";
            ctx.fill();
            ctx.strokeStyle = "#aaa";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.font = itemFont;
            ctx.fillStyle = txtColor;
            ctx.fillText(r.label, LX + 20, ly);
            ly += ROW_H;
          }
        }

        // ── Структурные роли (МАРКЕР) ──
        if (activeStructRoles.length) {
          secTitle("СТРУКТУРНЫЕ РОЛИ (МАРКЕР)");
          for (const s of activeStructRoles) {
            const sm = { core:{sw:2.5,d:null,glow:false,inner:true},
                         generative:{sw:2,d:null,glow:true,inner:false},
                         bridge:{sw:2,d:[4,2.5],glow:false,inner:false},
                         central:{sw:4,d:null,glow:false,inner:false},
                         peripheral:{sw:1,d:null,glow:false,inner:false} }[s.key];
            ctx.beginPath();
            ctx.arc(LX + 6, ly, 6, 0, Math.PI * 2);
            ctx.strokeStyle = "#aaa";
            ctx.lineWidth = sm.sw;
            ctx.setLineDash(sm.d || []);
            ctx.stroke();
            ctx.setLineDash([]);
            if (sm.inner) {
              ctx.beginPath();
              ctx.arc(LX + 6, ly, 3.3, 0, Math.PI * 2);
              ctx.fillStyle = "rgba(255,255,255,0.5)";
              ctx.fill();
            }
            if (sm.glow) {
              ctx.beginPath();
              ctx.arc(LX + 6, ly, 8, 0, Math.PI * 2);
              ctx.strokeStyle = "rgba(255,200,50,0.2)";
              ctx.lineWidth = 3;
              ctx.stroke();
            }
            ctx.font = itemFont;
            ctx.fillStyle = txtColor;
            ctx.fillText(s.label + " — " + s.desc, LX + 20, ly);
            ly += ROW_H;
          }
        }

        // ── Типы связей ──
        if (edgeTypes.size) {
          secTitle("ТИПЫ СВЯЗЕЙ");
          for (const t of edgeTypes) {
            const { color, dash } = edgeTypeStyle(t);
            ctx.beginPath();
            ctx.moveTo(LX, ly);
            ctx.lineTo(LX + 16, ly);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.setLineDash(dash ? dash.split(",").map(Number) : []);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = itemFont;
            ctx.fillStyle = txtColor;
            ctx.fillText(t, LX + 22, ly);
            ly += ROW_H;
          }
        }

        // ── Кластеры ──
        if (clLabels.length) {
          secTitle("КЛАСТЕРЫ");
          clLabels.forEach((label, i) => {
            const c = CPAL[i % CPAL.length];
            ctx.beginPath();
            ctx.arc(LX + 6, ly, 4, 0, Math.PI * 2);
            ctx.strokeStyle = c;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([2, 1.5]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = itemFont;
            ctx.fillStyle = txtColor;
            ctx.fillText(label, LX + 18, ly);
            ly += ROW_H;
          });
        }

        // ── Подсказка ──
        ctx.font = "500 9px 'IBM Plex Mono', monospace";
        ctx.fillStyle = "rgba(255,255,255,0.28)";
        ctx.fillText("→ однонаправл. · ↔ двунаправл. · ↺ рефлексив.", LX, ly);

        ctx.globalAlpha = 1;

        // ── Экспорт ───────────────────────────────────────────────────
        cv.toBlob(blob => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = getDocFilename("png");
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
        }, "image/png");
      }

// ───── [getDocFilename] philosynth.html строки 17478–17529 ─────
      function getDocFilename(ext) {
        const num = document.getElementById("docNum")?.textContent?.trim() || "synthesis";

        // ── Участники ──
        const isMeta = DOC_STATE.participants?.some(x => x.type === "concept")
                    || _conceptParticipants?.length > 0;

        let namePart;
        if (isMeta) {
          const title = document.getElementById("docTitle")?.textContent?.trim();
          if (title && title !== "Синтез Философской Концепции") {
            namePart = transliterate(title).slice(0, 60);
          } else {
            const participants = DOC_STATE.participants || [
              ...getPhil().map(() => ({ type: "philosopher" })),
              ..._conceptParticipants.map(() => ({ type: "concept" })),
            ];
            const pc = participants.filter(x => x.type === "concept").length;
            const pp = participants.filter(x => x.type === "philosopher").length;
            namePart = "meta-" + pc + "c" + (pp > 0 ? pp + "p" : "");
          }
        } else {
          const phil = DOC_STATE.ready && DOC_STATE.params?.phil
            ? DOC_STATE.params.phil : getPhil();
          namePart = phil.map(p => PHIL_FILENAME[p] || p).join("-");
        }

        // ── Параметры синтеза ──
        const p = DOC_STATE.ready ? DOC_STATE.params : null;
        const method = p?.method || document.getElementById("synthesisMethod")?.value || "";
        const level  = p?.synthLevel || document.getElementById("synthesisLevel")?.value || "";
        const order  = p?.generationOrder || document.getElementById("generationOrder")?.value || "";
        const depth  = p?.depth || document.getElementById("depthLevel")?.value || ""; 

        const paramCode = [
          METHOD_CODE[method] || "",
          LEVEL_CODE[level] || "",
          ORDER_CODE[order] || "",
          DEPTH_CODE[depth] || "",
        ].filter(Boolean).join("");

        // ── Версия ──
        const verStr = formatVersionFilename(DOC_STATE.docVersion);
        const ver = verStr !== "v1" ? "-" + verStr : "";

        // ── Сборка ──
        // PS-3950-G9OL-Kant-Heidegger-hm-t-2-v3-2m4-1.html
        const docLang = DOC_STATE.params?.lang || GEN_LANG || "Russian";
        const langSuffix = docLang === "Russian" ? "" : "-" + (docLang.slice(0, 2).toLowerCase());
        const parts = [num, namePart, paramCode].filter(Boolean);
        return parts.join("-") + ver + langSuffix + (ext ? "." + ext : "");
      }

// ───── [inline2md] philosynth.html строки 18251–18264 ─────
      function inline2md(el) {
        let r = "";
        el.childNodes.forEach((c) => {
          if (c.nodeType === 3) r += c.textContent;
          else if (c.nodeType === 1) {
            const t = c.tagName.toLowerCase();
            if (t === "strong") r += `**${c.textContent}**`;
            else if (t === "em") r += `*${c.textContent}*`;
            else if (c.classList?.contains("risk")) r += `\`${c.textContent}\``;
            else r += c.textContent;
          }
        });
        return r.trim();
      }

// ───── [node2md] philosynth.html строки 18222–18249 ─────
      function node2md(node) {
        const p = [];
        node.childNodes.forEach((c) => {
          if (c.nodeType === 3) {
            const t = c.textContent.trim();
            if (t) p.push(t);
          } else if (c.nodeType === 1) {
            const tag = c.tagName.toLowerCase();
            if (tag === "h4") p.push(`\n### ${c.textContent.trim()}`);
            else if (tag === "p") p.push(inline2md(c));
            else if (tag === "ul") {
              c.querySelectorAll("li").forEach((li) => p.push(`- ${inline2md(li)}`));
            } else if (tag === "ol") {
              let n = 1;
              c.querySelectorAll("li").forEach((li) => p.push(`${n++}. ${inline2md(li)}`));
            } else if (tag === "table") p.push(table2md(c));
            else if (c.classList?.contains("callout")) {
              const lb = c.querySelector(".callout-label")?.textContent?.trim() || "";
              const tx = c.innerText.replace(lb, "").trim();
              p.push(`> **${lb}** ${tx}`);
            } else {
              const inner = node2md(c);
              if (inner.trim()) p.push(inner);
            }
          }
        });
        return p.join("\n\n");
      }

// ───── [saveHTML] philosynth.html строки 18003–18192 ─────
      function saveHTML() {

        // Базовое имя файла фиксируется на момент сохранения (без расширения)
        const filenameBase = getDocFilename("html").replace(/\.html$/, "");

        // Граф-секция: модаль + сериализованные функции
        const graphSection = buildGraphExportSection(G, filenameBase);

        // Кнопки графа — вставляем в начало раздела db{graphBodyIdx},
        // чтобы они стояли непосредственно перед таблицами графа
        let docHTML = document.getElementById("docOutput").innerHTML;
        if (G.nodes.length > 0 && graphBodyIdx >= 0) {
          // Удаляем старые кнопки графа (от предыдущих сохранений)
          docHTML = docHTML.replace(
            /<div[^>]*>\s*<button[^>]*onclick="openGraph\(\)"[^>]*>[^<]*<\/button>\s*<\/div>/g,
            ""
          );

          const graphBtnHTML =
            `<div style="display:flex;gap:10px;flex-wrap:wrap;padding:12px 0 8px">` +
            `<button class="action-btn gold-btn" onclick="openGraph()">▦ Граф категорий</button>` +
            `</div>`;
          const marker = `id="db${graphBodyIdx}"`;
          const markerPos = docHTML.indexOf(marker);
          if (markerPos !== -1) {
            const closeAngle = docHTML.indexOf(">", markerPos);
            docHTML =
              docHTML.slice(0, closeAngle + 1) +
              graphBtnHTML +
              docHTML.slice(closeAngle + 1);
          }
        }

        // ── Режимы: вычисляем ДО CSS-аудита, чтобы стили не были удалены ──
        const modesSection = buildModesExportSection();

        // CSS-аудит: контент = всё что уйдёт в файл
        const contentToCheck = docHTML + graphSection + (modesSection || "");

        const rawCSS = Array.from(document.querySelectorAll("style"))
          .map(function(s) { return s.textContent; })
          .join("\n");

        const styles = "<style>\n" + auditCSS(rawCSS, contentToCheck) + "\n</style>";

        const tocEl = document.getElementById("docTOC");
        if (tocEl) tocEl.remove();
        document.querySelectorAll("#docBodies .toc-back-btn").forEach(el => el.remove());

        const cleanParticipants = (DOC_STATE.participants || []).map(x => {
          if (x.type === "philosopher") return x;
          // Санитайзим x.genealogy: (а) strip капсул — закрываем асимметрию
          // между корневым genealogy (который уже санитайзится ниже) и
          // genealogy внутри participants; (б) normalize имён — обрезаем
          // транзитивное распространение дефолта «Синтез Философской Концепции»
          // в многоступенчатых синтезах. Оба шага не мутируют исходный объект.
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
        });

        // ── Встраиваем состояние для импорта ──
        let stateJSON = "";
        try {
          const stateData = {
            version: 2,
            parentContextSchema: PARENT_CONTEXT_SCHEMA_ID,
            parentContextSchemaVersion: PARENT_CONTEXT_SCHEMA_VERSION,
            genLog: genLog.map(g => {
              const { _sys, _promptSkeleton, ...rest } = g;
              return rest;
            }),
            ctxLog: ctxLog,
            genCommon: genCommon,
            params: DOC_STATE.ready ? DOC_STATE.params : null,
            sectionOrder: DOC_STATE.ready ? DOC_STATE.sectionOrder : null,
            editedSections: DOC_STATE.ready ? [...DOC_STATE.editedSections] : [],
            docVersion: DOC_STATE.docVersion || 1,
            participants: cleanParticipants,
            genealogy: normalizeGenealogyNames(
              stripCapsulesFromGenealogy(DOC_STATE.genealogy),
              document.getElementById("docTitle")?.textContent?.trim()
            ),
            structureSections: DOC_STATE.structureSections || null,
            pausedState: DOC_STATE.pausedState || null,
          };
          stateJSON = `\n<script type="application/json" id="philosynth-state">\n${JSON.stringify(stateData, null, 2)}\n<\/script>`;

          // ── Видимый лог контекста ──
          if (genLog.length > 0 || ctxLog.length > 0) {
            // Сериализуем функции и константы — лог строится на лету из состояния
            const logBundle = [
              formatVersion,
              formatCtxLog,
              colorizeLog,
            ].map(fn => fn.toString()).join("\n\n");
          
            const logConstants = [
              ["CTX_LABELS", CTX_LABELS],
              ["KEY_LABELS", KEY_LABELS],
            ].map(([name, val]) => `var ${name} = ${JSON.stringify(val)};`)
             .join("\n");
          
            stateJSON += `\n<details style="
              max-width:1100px; margin:20px auto 0;
              border:1px solid #d8d4cc; background:#1a1814;
            ">
              <summary style="
                padding:10px 18px; cursor:pointer;
                font-family:'IBM Plex Mono',monospace; font-size:10px;
                letter-spacing:2px; text-transform:uppercase;
                color:#8a8278; background:#f2f0eb;
                list-style:none; display:flex; align-items:center; gap:6px;
                user-select:none;
              ">◈ Лог контекста и генерации</summary>
              <div style="padding:20px; overflow-x:auto;">
                <pre id="philosynth-log-raw" style="
                  font-family:'IBM Plex Mono',monospace; font-size:11px;
                  line-height:1.7; color:#c8c0b0; white-space:pre-wrap;
                  word-break:break-all; margin:0;
                "></pre>
              </div>
            </details>
            <script>
            (function(){
              var stateEl = document.getElementById("philosynth-state");
              if (!stateEl) return;
              try {
                var state = JSON.parse(stateEl.textContent);
                var genLog = state.genLog || [];
                var ctxLog = state.ctxLog || [];
                var genCommon = state.genCommon || null;
                var DOC_STATE = { docVersion: state.docVersion || 1 };
          
                ${logConstants}
                ${logBundle}
          
                var el = document.getElementById("philosynth-log-raw");
                if (el) {
                  var plain = formatCtxLog();
                  if (plain && plain.indexOf("Лог пуст") === -1) {
                    el.innerHTML = colorizeLog(plain);
                  } else {
                    el.style.color = "#8a8278";
                    el.textContent = plain;
                  }
                }
              } catch(e) {
                console.warn("Не удалось восстановить лог:", e);
                var el = document.getElementById("philosynth-log-raw");
                if (el) el.textContent = "Ошибка восстановления лога: " + e.message;
              }
            })();
            <\/script>`;
          }
        } catch (e) {
          console.warn("Не удалось сериализовать состояние:", e);
        }

        // ── Режимы: модальное окно с вкладками ──
        //if (modesSection) stateJSON += modesSection;

        const docLang = DOC_STATE.params?.lang || GEN_LANG || "Russian";
        const htmlLang = docLang === "Russian" ? "ru" :
          GEN_LANG === "English" ? "en" :
          GEN_LANG === "German" ? "de" :
          GEN_LANG === "French" ? "fr" :
          GEN_LANG === "Spanish" ? "es" :
          GEN_LANG === "Chinese" ? "zh" :
          GEN_LANG === "Japanese" ? "ja" :
          GEN_LANG === "Latin" ? "la" : "en";
        const html = `<!DOCTYPE html><html lang="${htmlLang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${document.getElementById("docTitle").textContent}</title><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">${styles}<style>body{background:#f2f0eb;padding:32px}#docOutput{max-width:1100px;margin:0 auto}</style></head><body><div id="docOutput">${modesSection}${docHTML}</div>${graphSection}${stateJSON}</body></html>`;
        downloadFile(html, getDocFilename("html"), "text/html");
        buildTableOfContents();
      }

// ───── [saveLang] philosynth.html строки 5845–5861 ─────
      function saveLang() {
        const sel = document.getElementById("langSelect").value;
        if (sel === "__custom") {
          const c = document.getElementById("customLangInput").value.trim();
          if (!c) {
            document.getElementById("langStatus").textContent = "⚠ Введите название языка";
            document.getElementById("langStatus").style.color = "var(--red)";
            return;
          }
          GEN_LANG = c;
        } else {
          GEN_LANG = sel;
        }
        localStorage.setItem("ps_gen_lang", GEN_LANG);
        document.getElementById("langStatus").textContent = "✓ Язык генерации: " + GEN_LANG;
        document.getElementById("langStatus").style.color = "var(--green-check)";
      }

// ───── [saveMD] philosynth.html строки 18197–18208 ─────
      function saveMD() {
        const lines = [];
        lines.push(`# ${document.getElementById("docTitle").textContent}`);
        lines.push(`\n> ${document.getElementById("docSubtitle").textContent}`);
        lines.push(
          `\n---\n\n| Параметр | Значение |\n|---|---|\n| Документ № | ${document.getElementById("docNum").textContent} |\n| Дата | ${document.getElementById("docDate").textContent} |\n| Метод | ${document.getElementById("docMethod").textContent} |\n| Глубина | ${document.getElementById("docDepth").textContent} |\n\n---\n`,
        );
        const db = document.getElementById("docBodies");
        if (db) db.querySelectorAll(".doc-section").forEach((sec) => lines.push(sec2md(sec)));
        lines.push(`\n---\n*PhiloSynth Pro™ · Документ сгенерирован Claude AI*`);
        downloadFile(lines.join("\n"), getDocFilename("md"), "text/markdown");
      }

// ───── [saved] philosynth.html строки 17019–17019 ─────
            const saved = { px: n.px, py: n.py, cen: n.cen };

// ───── [sec2md] philosynth.html строки 18210–18220 ─────
      function sec2md(sec) {
        const parts = [];
        const num = sec.querySelector(".section-num")?.textContent?.trim() || "";
        const title = sec.querySelector(".section-title")?.textContent?.trim() || "";
        if (num || title) parts.push(`## ${num}${num && title ? " — " : ""}${title}`);
        const ct = sec.querySelector(".doc-content");
        if (ct) parts.push(node2md(ct));
        const sig = sec.querySelector(".sig-block");
        if (sig) parts.push(sig2md(sig));
        return parts.join("\n\n");
      }

// ───── [sig2md] philosynth.html строки 18284–18292 ─────
      function sig2md(sig) {
        return Array.from(sig.querySelectorAll(".sig-party"))
          .map((p) => {
            const n = p.querySelector(".sig-party-name")?.textContent?.trim() || "";
            const r = p.querySelector(".sig-party-role")?.textContent?.trim() || "";
            return `**${n}** *(${r})*\n\n_________________\n*Подпись / Дата*`;
          })
          .join("\n\n---\n\n");
      }

// ───── [table2md] philosynth.html строки 18266–18282 ─────
      function table2md(table) {
        const rows = [];
        const hs = Array.from(table.querySelectorAll("thead th")).map((th) =>
          th.textContent.trim(),
        );
        if (hs.length) {
          rows.push(`| ${hs.join(" | ")} |`);
          rows.push(`| ${hs.map(() => "---").join(" | ")} |`);
        }
        table.querySelectorAll("tbody tr").forEach((tr) => {
          const cs = Array.from(tr.querySelectorAll("td")).map((td) =>
            (inline2md(td) || td.textContent.trim()).replace(/\|/g, "\\|"),
          );
          rows.push(`| ${cs.join(" | ")} |`);
        });
        return rows.join("\n");
      }

// ───── [reconstructBaseCtxSkeleton] philosynth.html строки 24149–24197 ─────
      function reconstructBaseCtxSkeleton(params, gc) {
        if (!params) return "";

        const p = params;
        const phils = (p.participants || []).filter(x => x.type === "philosopher").map(x => x.name);
        const concepts = (p.participants || []).filter(x => x.type === "concept").map(x => "«" + x.name + "»");

        let participantsLine = "";
        if (phils.length && concepts.length)
          participantsLine = "ФИЛОСОФЫ: " + phils.join(", ") + "\nКОНЦЕПЦИИ-УЧАСТНИКИ: " + concepts.join(", ");
        else if (phils.length)
          participantsLine = "ФИЛОСОФЫ: " + phils.join(", ");
        else if (concepts.length)
          participantsLine = "КОНЦЕПЦИИ-УЧАСТНИКИ: " + concepts.join(", ");

        const isMeta = concepts.length > 0;
        const metaNote = isMeta
          ? "\nРЕЖИМ: МЕТА-СИНТЕЗ. Среди участников есть ранее синтезированные " +
            "концепции. Их контекст (капсула, категории, тезисы) приведён ниже. " +
            "Обращайся с каждой концепцией-участником как с самостоятельной " +
            "философской позицией, обладающей собственным категориальным аппаратом."
          : "";

        let conceptCtx = "";
        if (isMeta) {
          const sizes = gc?.conceptBlockSizes || [];
          const markers = (p.participants || [])
            .filter(x => x.type === "concept")
            .map(c => {
              const found = sizes.find(s => s.name === c.name);
              const chars = found ? found.chars.toLocaleString("ru") : "?";
              return "[контекст «" + c.name + "»: " + chars + " симв.]";
            });
          conceptCtx = "\n\nКОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ СИНТЕЗА " +
            "(каждая — результат предыдущего синтеза; обращайся с ней " +
            "как с полноценной философской позицией, у которой есть " +
            "собственные категории, тезисы и внутренняя логика):\n\"\"\"\n" +
            markers.join("\n") + "\n\"\"\"";
        }

        return "ЗЕРНО КОНЦЕПЦИИ: «" + (p.seed || "") + "»\n" +
          participantsLine + metaNote + "\n" +
          "МЕТОД: " + (ML[p.method] || p.method) + " — " + (mdText(p, p.method) || "") + "\n" +
          "УРОВЕНЬ СИНТЕЗА: " + (SL[p.synthLevel] || p.synthLevel) + " — " +
          (sdText(p, p.synthLevel) || "") + "\n" +
          "ГЛУБИНА: " + (DL[p.depth] || p.depth) +
          (p.ctx ? "\nКОНТЕКСТ: " + p.ctx : "") +
          conceptCtx;
      }

// ───── [reconstructCtxMarkers] philosynth.html строки 24202–24239 ─────
      function reconstructCtxMarkers(sectionKey) {
        const parts = [];

        // Ищем все ctxLog-записи для этого ключа
        const entries = ctxLog.filter(c => c.sectionKey === sectionKey);

        for (const ctx of entries) {
          if (!ctx.entries?.length) continue;

          if (ctx.type === "intra-section") {
            // Внутрисекционный контекст (для подразделовых перегенераций)
            const markers = ctx.entries
              .filter(e => e.status === "found")
              .map(e => "[" + (e.key.replace("intra:", "")) + ": " +
                (e.len || 0).toLocaleString("ru") + " симв.]");
            if (markers.length) {
              parts.push("КОНТЕКСТ ДРУГИХ ПОДРАЗДЕЛОВ ЭТОГО РАЗДЕЛА:\n\"\"\"\n" +
                markers.join("\n") + "\n\"\"\"");
            }
          } else {
            // Межсекционный контекст (стандартный)
            const markers = ctx.entries
              .filter(e => e.status === "found" || e.status === "truncated")
              .map(e => {
                const label = (typeof CTX_LABELS !== "undefined" ? CTX_LABELS[e.key] : null) || e.key;
                const suffix = e.status === "truncated" ? " [обрезан]" : "";
                return "[" + label + ": " + (e.len || 0).toLocaleString("ru") + " симв." + suffix + "]";
              });
            if (markers.length) {
              parts.push("КОНТЕКСТ ИЗ ПРЕДЫДУЩИХ РАЗДЕЛОВ " +
                "(используй термины, §§ и названия категорий; не повторяй содержание):\n\"\"\"\n" +
                markers.join("\n") + "\n\"\"\"");
            }
          }
        }

        return parts.length ? "\n\n" + parts.join("\n\n") : "";
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

// ───── [reconstructSectionTask] philosynth.html строки 24247–24314 ─────
      function reconstructSectionTask(genEntry, params) {
        if (!params) return "";

        const key = genEntry.sectionKey;
        const source = genEntry.source || "";

        // Режимы — своя структура
        if (key?.startsWith("mode:")) {
          const modeKey = key.replace("mode:", "");
          const config = typeof MODE_CONFIG !== "undefined" ? MODE_CONFIG[modeKey] : null;
          if (!config) return "[режим " + modeKey + ": шаблон недоступен]";
          const param = genEntry.modeParam || "?";
          const ctxMarkers = reconstructCtxMarkers(key);
          // Шаблон режима с маркерами вместо контекста
          const template = config.buildPrompt(param,
            ctxMarkers ? "\n" + ctxMarkers + "\n" : "[контекст: " + (genEntry.priorChars || 0).toLocaleString("ru") + " симв.]"
          );
          return template;
        }

        // Подразделовая перегенерация
        if (source === "subsection-regen") {
          const parts = key.split(":");
          const secKey = parts[0];
          const subName = parts.slice(1).join(":");

          const allDefs = buildSectionDefs(params);
          patchPromptsWithSecCtx(allDefs, params.secCtx || {});
          const def = allDefs.find(d => d.key === secKey);
          if (!def?.parts) return "[подраздел " + subName + ": определение недоступно]";

          const sub = def.parts.subsections.find(s => s.name === subName);
          if (!sub) return "[подраздел «" + subName + "» не найден]";

          const lines = [];
          lines.push(def.parts.preamble_short || "");
          lines.push("Перегенерируй ТОЛЬКО секцию:\n\n«" + sub.name + "»\n" + sub.body);
          if (genEntry.hasUserNote && genEntry.userNotePreview)
            lines.push("ДОПОЛНИТЕЛЬНАЯ ИНСТРУКЦИЯ ПОЛЬЗОВАТЕЛЯ:\n" + genEntry.userNotePreview);
          if (genEntry.hasCurrentContent)
            lines.push("ТЕКУЩЕЕ СОДЕРЖИМОЕ ПОДРАЗДЕЛА: [" +
              (genEntry.currentContentChars || 0).toLocaleString("ru") + " симв.]");
          return lines.filter(Boolean).join("\n\n");
        }

        // Стандартные разделы (generation, edit, cascade, edit-add)
        const sectionKeys = key.includes("+") ? key.split("+") : [key];

        const allDefs = buildSectionDefs(params);
        patchPromptsWithSecCtx(allDefs, params.secCtx || {});
        const defsMap = Object.fromEntries(allDefs.map(d => [d.key, d]));

        // Восстанавливаем номера из DOC_STATE если доступны
        for (const k of sectionKeys) {
          if (defsMap[k] && DOC_STATE.sectionDefs?.[k]?.num) {
            defsMap[k].num = DOC_STATE.sectionDefs[k].num;
          }
        }

        const sp = sectionKeys
          .map(k => defsMap[k])
          .filter(Boolean)
          .map(d => "§ " + d.num + " — " + d.title.toUpperCase() + "\n" + d.prompt)
          .join("\n\n");

        return "ЗАДАНИЕ: составь ТОЛЬКО следующие разделы " +
          "(строго в указанном порядке, без добавления других):\n\n" + sp;
      }

// ───── [reconstructSkeleton] philosynth.html строки 24320–24351 ─────
      function reconstructSkeleton(genEntry) {
        const params = DOC_STATE.params || genCommon?._params;
        if (!params) return null;

        const key = genEntry.sectionKey;
        const source = genEntry.source || "";

        // Режимы — собственная структура промпта (без baseCtx)
        if (key?.startsWith("mode:")) {
          return reconstructSectionTask(genEntry, params);
        }

        // Все остальные: baseCtx + ctxMarkers + task + quality
        const base = reconstructBaseCtxSkeleton(params, genCommon);

        let ctx = "";
        if (source === "subsection-regen" && key?.includes(":")) {
          // Подразделовая перегенерация: inter-section по ключу раздела,
          // intra-section по полному ключу (раздел:подраздел)
          const secKey = key.split(":")[0];
          const interCtx = reconstructCtxMarkers(secKey);
          const intraCtx = reconstructCtxMarkers(key);
          ctx = interCtx + intraCtx;
        } else {
          ctx = reconstructCtxMarkers(key);
        }

        const task = reconstructSectionTask(genEntry, params);
        const quality = "\n\n[ТРЕБОВАНИЯ К КАЧЕСТВУ: см. общие элементы]";

        return "ПАРАМЕТРЫ СИНТЕЗА:\n" + base + ctx + "\n\n" + task + quality;
      }
