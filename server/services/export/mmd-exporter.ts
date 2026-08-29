/**
 * mmd-exporter — exportMMD() [16370–16590] (беседа 4.2; карта 04 §2.5).
 * Строит Mermaid-диаграмму: subgraph по кластерам, формы узлов по
 * процессуальным ролям, стили по типам, linkStyle по силе связей.
 *
 * АДАПТАЦИИ DOM→БД:
 *  - G — из loadGModel (categories + category_edges + cluster_labels);
 *  - alert("Нет графа.") → ExportError NO_GRAPH (роут: 400);
 *  - downloadFile(...) → возврат строки (имя файла даёт роут через
 *    exportFilename);
 *  - getRolesFromLayer/edgeTypeStyle/typeColorHex — из createGraphStyle
 *    (карты цветов — на экземпляр графа, сервер конкурентен);
 *  - локальная урезанная esc [16422] (только кавычки) сохранена дословно.
 * Тело в остальном 1:1.
 */
import { ExportError } from "./common.js";
import { loadGModel } from "./graph-model.js";
import {
  CPAL,
  createGraphStyle,
  PROCEDURAL_PRIORITY,
  STRUCTURAL_PRIORITY,
} from "./graph-style.js";

import type { GModel } from "./graph-model.js";

/** Ядро на готовой модели G (переиспользуется тестами/роутом). */
export function buildMMD(G: GModel): string {
  if (!G.nodes.length) {
    throw new ExportError("NO_GRAPH", "Нет графа.");
  }
  const style = createGraphStyle(G);

  const topo = G.topology || {
    clusters: {},
    roles: { structural: {}, procedural: {} },
    clusterLabels: [],
  };
  const clLabels = topo.clusterLabels || [];
  const lines: string[] = [];

  lines.push("graph TD");

  // ── Информация об узлах ────────────────────────────────────────
  const nodeInfo = G.nodes.map((n, i) => {
    const clusters = topo.clusters?.[n.name] || [];
    const structRoles = style.getRolesFromLayer("structural", n.name);
    const procRoles = style.getRolesFromLayer("procedural", n.name);

    let topStruct: string | null = null;
    for (const r of STRUCTURAL_PRIORITY)
      if (structRoles.has(r)) {
        topStruct = r;
        break;
      }

    let topProc: string | null = null;
    for (const r of PROCEDURAL_PRIORITY)
      if (procRoles.has(r)) {
        topProc = r;
        break;
      }

    return {
      idx: i,
      name: n.name,
      type: n.type || "другое",
      cen: n.cen ?? 0.5,
      cert: n.cert ?? 0.5,
      clusters,
      topStruct,
      topProc,
    };
  });

  // ── Карта копий узлов ──────────────────────────────────────────
  // Мульти-кластерный узел → по одной копии на кластер: N{i}_{copyIdx}
  // Одно-/без-кластерный   → N{i}
  const copyMap: Record<number, string>[] = nodeInfo.map((ni) => {
    const map: Record<number, string> = {};
    if (ni.clusters.length <= 1) {
      map[ni.clusters[0] ?? -1] = "N" + ni.idx;
    } else {
      ni.clusters.forEach((clIdx, ci) => {
        map[clIdx] = "N" + ni.idx + "_" + ci;
      });
    }
    return map;
  });

  function anyId(i: number): string {
    return Object.values(copyMap[i]!)[0]!;
  }
  function idInCluster(i: number, clIdx: number): string {
    return copyMap[i]![clIdx] || anyId(i);
  }

  // ── Экранирование метки ────────────────────────────────────────
  function esc(s: string): string {
    return s.replace(/"/g, "&quot;");
  }

  // ── Объявление узла (форма по процессуальной роли) ─────────────
  function nodeDecl(id: string, label: string, procRole: string | null): string {
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

  function textColorForBg(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    // Относительная яркость (формула W3C)
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.55 ? "#1a1814" : "#fff";
  }

  // ── Субграфы кластеров ─────────────────────────────────────────
  const clusterMembers: Record<number, number[]> = {}; // clIdx → [nodeIdx, …]
  nodeInfo.forEach((ni) => {
    ni.clusters.forEach((clIdx) => {
      if (!clusterMembers[clIdx]) clusterMembers[clIdx] = [];
      clusterMembers[clIdx]!.push(ni.idx);
    });
  });

  lines.push("");
  for (const [clIdxStr, members] of Object.entries(clusterMembers)) {
    const clIdx = Number(clIdxStr);
    const label = esc(clLabels[clIdx] || "Кластер " + (clIdx + 1));
    lines.push('    subgraph CL' + clIdx + '["' + label + '"]');
    for (const i of members) {
      lines.push(
        "        " +
          nodeDecl(copyMap[i]![clIdx]!, nodeInfo[i]!.name, nodeInfo[i]!.topProc),
      );
    }
    lines.push("    end");
  }

  // Узлы без кластера
  const orphans = nodeInfo.filter((ni) => ni.clusters.length === 0);
  for (const ni of orphans) {
    lines.push("    " + nodeDecl(anyId(ni.idx), ni.name, ni.topProc));
  }

  // ── Связи между копиями мульти-кластерных узлов ────────────────
  lines.push("");
  let linkIdx = 0;
  const interCopyIndices: number[] = [];

  nodeInfo.forEach((ni) => {
    if (ni.clusters.length <= 1) return;
    const ids = ni.clusters.map((clIdx) => copyMap[ni.idx]![clIdx]!);
    for (let j = 0; j < ids.length - 1; j++) {
      lines.push("    " + ids[j] + " --- " + ids[j + 1]);
      interCopyIndices.push(linkIdx);
      linkIdx++;
    }
  });

  // ── Рёбра графа ───────────────────────────────────────────────
  lines.push("");
  const nm: Record<string, number> = Object.fromEntries(
    G.nodes.map((n, i) => [n.name.toLowerCase(), i]),
  );
  const edgeStyleLines: string[] = [];

  for (const e of G.edges) {
    const si = nm[e.src.toLowerCase().trim()];
    const ti = nm[e.tgt.toLowerCase().trim()];
    if (si == null || ti == null) continue;

    // Маршрутизация через первый общий кластер
    const sCl = nodeInfo[si]!.clusters;
    const tCl = nodeInfo[ti]!.clusters;
    let shared = -1;
    for (const c of sCl) {
      if (tCl.includes(c)) {
        shared = c;
        break;
      }
    }

    const sId = shared !== -1 ? idInCluster(si, shared) : anyId(si);
    const tId = shared !== -1 ? idInCluster(ti, shared) : anyId(ti);

    const lb = esc(e.type || e.desc || "");
    const isRefl = e.dir.includes("рефлексив") || sId === tId;
    const isBi = e.dir.includes("двунаправлен");

    if (isRefl)        lines.push('    ' + sId + ' -->|"' + lb + ' ↺"| ' + sId);
    else if (isBi)     lines.push('    ' + sId + ' <-->|"' + lb + '"| ' + tId);
    else               lines.push('    ' + sId + ' -->|"' + lb + '"| ' + tId);

    // Стиль ребра: цвет по типу, толщина по силе
    const { color } = style.edgeTypeStyle(e.type);
    const str = e.str || 0.5;
    const sw = (1 + str * 4).toFixed(1);
    const dashPart = str < 0.3 ? ",stroke-dasharray:3" : "";
    edgeStyleLines.push(
      "    linkStyle " +
        linkIdx +
        " stroke:" +
        color +
        ",stroke-width:" +
        sw +
        "px" +
        dashPart,
    );
    linkIdx++;
  }

  // ── linkStyle: inter-copy связи ────────────────────────────────
  lines.push("");
  for (const idx of interCopyIndices) {
    lines.push(
      "    linkStyle " + idx + " stroke:#888,stroke-width:1px,stroke-dasharray:5",
    );
  }

  // ── linkStyle: рёбра графа ────────────────────────────────────
  edgeStyleLines.forEach((s) => lines.push(s));

  // ── classDef: цвет по типу категории ──────────────────────────
  lines.push("");
  const typeGroups: Record<string, string[]> = {};
  nodeInfo.forEach((ni) => {
    const t = ni.type;
    if (!typeGroups[t]) typeGroups[t] = [];
    typeGroups[t]!.push(...Object.values(copyMap[ni.idx]!));
  });

  // КВИРК исходника [16550–16556]: classDef t{N} объявляются, но строки
  // «class N0,N1 t0» НЕТ — классы никому не назначены (узлы фактически
  // красятся per-node `style` ниже). Сохранено дословно.
  let ci = 0;
  for (const [t, ids] of Object.entries(typeGroups)) {
    const cn = "t" + ci++;
    void ids; // ids не используется — как в исходнике (const [t, ids] of …)
    const hex = style.typeColorHex(t);
    const txtColor = textColorForBg(hex);
    lines.push(
      "    classDef " + cn + " fill:" + hex + ",stroke:" + hex + ",color:" + txtColor,
    );
  }

  // ── Per-node style: структурная роль + центральность + определённость ─
  lines.push("");
  const STRUCT_DASH: Record<string, string> = {
    generative: "8,3",
    bridge: "4,3",
    peripheral: "2,2",
  };
  // core, central — без пунктира (сплошная обводка)

  nodeInfo.forEach((ni) => {
    const ids = Object.values(copyMap[ni.idx]!);
    const sw = (1 + ni.cen * 4).toFixed(1);
    const fo = (0.2 + ni.cert * 0.65).toFixed(2);
    const dashArr = ni.topStruct ? STRUCT_DASH[ni.topStruct] : undefined;
    const dashPart = dashArr ? ",stroke-dasharray:" + dashArr : "";

    for (const id of ids) {
      lines.push(
        "    style " + id + " stroke-width:" + sw + "px,fill-opacity:" + fo + dashPart,
      );
    }
  });

  // ── Стили субграфов (кластерные цвета) ─────────────────────────
  lines.push("");
  for (const clIdxStr of Object.keys(clusterMembers)) {
    const clIdx = Number(clIdxStr);
    const hex = CPAL[clIdx % CPAL.length]!;
    lines.push(
      "    style CL" +
        clIdx +
        " fill:" +
        hex +
        ",fill-opacity:0.08,stroke:" +
        hex +
        ",stroke-width:2px",
    );
  }

  return lines.join("\n");
}

/** exportMMD(synthesisId) — контракт первого запроса 4.2. */
export async function exportMMD(synthesisId: string): Promise<string> {
  return buildMMD(await loadGModel(synthesisId));
}
