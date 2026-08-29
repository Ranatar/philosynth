/**
 * GraphModal — модальное окно графа категорий (вкладки 3D/2D). Беседа 1.7.
 *
 * React-порт «хрома» модалки из 1.7-graph-viz.js + разметки [4223–4256]:
 * switchView() [16303] (переключение вида + перестройка легенды под режим),
 * openGraph()/closeGraph() [16327/16337] (open → всегда 3D; освобождение
 * ресурсов — в dispose-функциях видов при unmount), toggleClusters()
 * [16046] (кнопка ◎ Кластеры, active-класс), toggleExportMenu/
 * closeExportMenu/doExport [16362–16380] (выпадающее меню ↓, клик вне —
 * закрыть), handleLegendClick [16260] (toggle фильтра легенды: повторный
 * клик — сброс + clearSelection, иначе applyRole/ClusterFilter активного
 * вида), тултип #graph-tooltip (инлайновые стили исходника).
 *
 * АДАПТАЦИИ:
 *  - Кнопки экспорта MMD/PNG/JSON (беседа 4.2, долг §12 закрыт):
 *    downloadExport → серверные services/export/* через GET
 *    /:id/export/{mmd,png,json}; заглушки 1.7 сняты.
 *  - Пустой граф: openGraph() исходника делал alert(«Нет данных графа.»)
 *    и не открывался; по протоколу 1.7 (edge case запроса 8) модалка
 *    ОТКРЫВАЕТСЯ и показывает пустое состояние, не падает.
 *  - Панели узла/связи — React-компоненты (NodePanel/EdgePanel) по
 *    колбэкам PanelCallbacks из рендер-ядер; смена вида скрывает панель
 *    (в исходнике панель оставалась в скрытом контейнере старого вида).
 *  - legendFilter синхронизирован с React через setLegendFilterListener
 *    (сбросы из рендер-ядер снимают active-класс в легенде).
 *  - G наполняется из GraphData (buildGFromGraphData) при открытии;
 *    _extended — из SynthesisFull.extGraphMetrics (проп).
 */

import { downloadExport } from "../../api/export";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Graph2D from "./Graph2D";
import Graph3D from "./Graph3D";
import GraphLegend from "./GraphLegend";
import EdgePanel from "./EdgePanel";
import NodePanel from "./NodePanel";
import {
  buildGFromGraphData,
  clearLegendFilter,
  graphState,
  setClusterVisible,
  setLegendFilter,
  setLegendFilterListener,
} from "./graph-utils";

import type { GraphData } from "@philosynth/shared/types/graph";
import type {
  GEdge,
  LegendFilter,
  PanelCallbacks,
  PanelLink,
  PanelNodeData,
} from "./graph-utils";

type PanelState =
  | { kind: "node"; d: PanelNodeData; links: PanelLink[] }
  | { kind: "edge"; edgeData: GEdge }
  | null;

export interface GraphModalProps {
  open: boolean;
  data: GraphData | null;
  extGraphMetrics: boolean;
  onClose: () => void;
  /** Беседа 4.2: id синтеза для серверных экспортов MMD/PNG/JSON
   *  (services/export/*); без него кнопки экспорта неактивны */
  synthesisId?: string | null;
}

export default function GraphModal({
  open,
  data,
  extGraphMetrics,
  synthesisId = null,
  onClose,
}: GraphModalProps) {
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [clustersOn, setClustersOn] = useState(graphState.clusterVisible);
  const [exportOpen, setExportOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<LegendFilter>(null);
  const [panel, setPanel] = useState<PanelState>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // G наполняется ДО монтирования видов (useMemo — во время рендера)
  useMemo(() => {
    if (open && data) buildGFromGraphData(data, extGraphMetrics);
  }, [open, data, extGraphMetrics]);

  // openGraph(): открытие — всегда 3D, скролл страницы заблокирован
  useEffect(() => {
    if (!open) return;
    setMode("3d");
    graphState.currentViewMode = "3d";
    setPanel(null);
    clearLegendFilter();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Синхронизация legendFilter (сбросы из рендер-ядер → снятие active)
  useEffect(() => {
    if (!open) return;
    setLegendFilterListener(setActiveFilter);
    return () => setLegendFilterListener(null);
  }, [open]);

  // Клик в любое место вне меню — закрыть меню экспорта [16377]
  useEffect(() => {
    if (!exportOpen) return;
    const h = () => setExportOpen(false);
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [exportOpen]);

  const panels: PanelCallbacks = useMemo(
    () => ({
      onShowNode: (d, links) => setPanel({ kind: "node", d, links }),
      onShowEdge: (edgeData) => setPanel({ kind: "edge", edgeData }),
      onHidePanel: () => setPanel(null),
    }),
    [],
  );

  // switchView(v) [16303]
  const switchView = useCallback((v: "3d" | "2d") => {
    graphState.currentViewMode = v;
    clearLegendFilter();
    setPanel(null); // адаптация: панель старого вида скрывается
    setMode(v);
  }, []);

  // toggleClusters [16046]
  const toggleClusters = useCallback(() => {
    const v = !graphState.clusterVisible;
    setClusterVisible(v);
    setClustersOn(v);
  }, []);

  // handleLegendClick [16260]
  const onLegendToggle = useCallback(
    (f: Exclude<LegendFilter, null>) => {
      const is3d = graphState.currentViewMode === "3d";
      const api = is3d ? graphState.graphAPI3d : graphState.graphAPI2d;
      const same =
        activeFilter &&
        ((f.type === "role" &&
          activeFilter.type === "role" &&
          f.key === activeFilter.key &&
          f.layer === activeFilter.layer) ||
          (f.type === "cluster" &&
            activeFilter.type === "cluster" &&
            f.idx === activeFilter.idx));
      if (same) {
        // Повторный клик — сброс
        setLegendFilter(null);
        api?.clearSelection();
        return;
      }
      setLegendFilter(f);
      if (f.type === "role") api?.applyRoleFilter(f.key, f.layer);
      else api?.applyClusterFilter(f.idx);
    },
    [activeFilter],
  );

  // Беседа 4.2: экспорт графа — серверные services/export/* (03 §2.11);
  // заглушка 1.7 снята (долг §12 закрыт)
  const doExport = useCallback(
    (fmt: "mmd" | "png" | "json") => {
      setExportOpen(false);
      if (!synthesisId) return;
      downloadExport(synthesisId, fmt);
    },
    [synthesisId],
  );

  if (!open) return null;

  const G = graphState.G;
  const empty = G.nodes.length === 0;
  const nodeTypes = new Set(G.nodes.map((n) => n.type || "другое"));
  const edgeTypes = new Set(G.edges.map((e) => e.type).filter(Boolean));
  const clusterLabels = G.topology?.clusterLabels || [];

  return (
    <div className="gm-overlay visible">
      <div
        ref={tooltipRef}
        style={{
          position: "absolute",
          pointerEvents: "none",
          display: "none",
          background: "rgba(10,10,20,0.92)",
          border: "1px solid rgba(255,255,255,0.15)",
          color: "#c8c0b0",
          font: "12px 'IBM Plex Mono', monospace",
          padding: "8px 12px",
          borderRadius: 6,
          maxWidth: 280,
          whiteSpace: "pre-wrap",
          lineHeight: 1.5,
          zIndex: 999,
        }}
      />
      <div className="gm-header">
        <div className="gm-title">◈ Граф Категорий</div>
        <div className="gm-actions">
          <div className="gm-tabs">
            <button
              className={"gm-btn" + (mode === "3d" ? " active" : "")}
              onClick={() => switchView("3d")}
            >
              3D
            </button>
            <button
              className={"gm-btn" + (clustersOn ? " active" : "")}
              onClick={toggleClusters}
            >
              ◎ Кластеры
            </button>
            <button
              className={"gm-btn" + (mode === "2d" ? " active" : "")}
              onClick={() => switchView("2d")}
            >
              2D
            </button>
          </div>
          <div className={"gm-export-wrap" + (exportOpen ? " open" : "")}>
            <button
              className="gm-btn gold"
              onClick={(e) => {
                e.stopPropagation();
                setExportOpen((v) => !v);
              }}
            >
              ↓
            </button>
            <div className="gm-export-menu">
              <button
                className="gm-export-item"
                onClick={() => doExport("mmd")}
              >
                MMD
              </button>
              <button
                className="gm-export-item"
                onClick={() => doExport("png")}
              >
                PNG
              </button>
              <button
                className="gm-export-item"
                onClick={() => doExport("json")}
              >
                JSON
              </button>
            </div>
          </div>
          <button className="gm-btn close" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
      <div className="gm-body">
        {empty ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,.5)",
              fontFamily: "var(--mono)",
              fontSize: 12,
              letterSpacing: 1,
            }}
          >
            Нет данных графа — раздел «Граф» ещё не сгенерирован.
          </div>
        ) : (
          <>
            {mode === "3d" ? (
              <Graph3D key="3d" tooltipRef={tooltipRef} panels={panels} />
            ) : (
              <Graph2D key="2d" panels={panels} />
            )}
            <div className="gm-hint">
              {mode === "3d"
                ? "Вращение: мышь · Зум: колёсико · Перетаскивание узлов"
                : "Перетаскивание узлов · Зум: колёсико"}
            </div>
            <GraphLegend
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              clusterLabels={clusterLabels}
              mode={mode}
              activeFilter={activeFilter}
              onToggle={onLegendToggle}
            />
            {panel?.kind === "node" ? (
              <NodePanel
                d={panel.d}
                links={panel.links}
                clusterLabels={clusterLabels}
                onClose={() => setPanel(null)}
              />
            ) : null}
            {panel?.kind === "edge" ? (
              <EdgePanel
                edgeData={panel.edgeData}
                allNodes={G.nodes}
                clusterLabels={clusterLabels}
                onClose={() => setPanel(null)}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
