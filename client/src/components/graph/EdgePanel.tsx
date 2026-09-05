/**
 * EdgePanel — информационная панель связи. Беседа 1.7.
 * React-порт showEdgePanel() [13406] из 1.7-graph-viz.js: шапка с линией
 * цвета/пунктира типа, бейдж направления (→ / ↔ / ↺ + подпись), описание,
 * «Сила связи» (бар), расширенные метрики связи при _extended (certEdge,
 * innovDeg, histSupport, logNec, ctxDep), затем блоки обоих узлов-концов
 * (ИСТОЧНИК/ЦЕЛЬ; для рефлексивной — один блок УЗЕЛ): точка цвета, бейджи
 * тип+кластеры (кластеры — из G.topology.clusters по имени узла),
 * определение, метрики центральность/определённость. Узел, не найденный
 * в графе, помечается «не найден в графе».
 *
 * АДАПТАЦИЯ: JSX вместо innerHTML; данные — колбэком onShowEdge;
 * slide-in .visible — эффектом после первого кадра (rAF исходника).
 *
 * Беседа 5.4 (п. 5): проп onEdit — кнопка «✎ Редактировать» под бейджами
 * (открывает EdgeEditor связи поверх GraphModal, как NodePanel.onEdit 5.2);
 * связь находится по GEdge.dbId. В исходнике правки связей не было.
 */

import { useEffect, useState } from "react";

import {
  CPAL,
  edgeTypeStyle,
  graphState,
  typeColorHex,
} from "./graph-utils";

import type { GEdge, GNode } from "./graph-utils";

function Metric({
  label,
  pct,
  color,
  value,
}: {
  label: string;
  pct: number;
  color: string;
  value: string;
}) {
  return (
    <div className="gm-panel-metric">
      <span>{label}</span>
      <div className="gm-panel-bar">
        <div style={{ width: `${pct}%`, background: color }} />
      </div>
      <span>{value}</span>
    </div>
  );
}

function NodeBlock({
  nodeName,
  labelPrefix,
  allNodes,
  clusterLabels,
}: {
  nodeName: string;
  labelPrefix: string;
  allNodes: GNode[];
  clusterLabels: string[];
}) {
  const idx = allNodes.findIndex(
    (n) => n.name.toLowerCase().trim() === nodeName.toLowerCase().trim(),
  );
  if (idx < 0) {
    return (
      <div className="gm-panel-ep-block">
        <div className="gm-panel-ep-label">{labelPrefix}</div>
        <div className="gm-panel-ep-name">{nodeName}</div>
        <div className="gm-panel-ep-missing">не найден в графе</div>
      </div>
    );
  }
  const n = allNodes[idx]!;
  const color = typeColorHex(n.type);
  const certPct = Math.round((n.cert ?? 0.5) * 100);
  const cenPct = Math.round((n.cen ?? 0.5) * 100);
  const clusters = graphState.G.topology?.clusters?.[n.name] ?? [];
  return (
    <div className="gm-panel-ep-block">
      <div className="gm-panel-ep-label">{labelPrefix}</div>
      <div className="gm-panel-ep-header">
        <div
          className="gm-panel-dot"
          style={{ background: color, width: 7, height: 7 }}
        />
        <div className="gm-panel-ep-name">{n.name}</div>
      </div>
      <div className="gm-panel-badges" style={{ marginBottom: 4 }}>
        <span className="gm-panel-badge" style={{ borderColor: color, color }}>
          {n.type || "—"}
        </span>
        {clusters.map((ci) => {
          const label = clusterLabels[ci] || `Кластер ${ci + 1}`;
          const cc = CPAL[ci % CPAL.length]!;
          return (
            <span
              key={ci}
              className="gm-panel-badge"
              style={{
                borderColor: cc,
                color: cc,
                fontSize: 8,
                padding: "0 4px",
              }}
            >
              {label}
            </span>
          );
        })}
      </div>
      {n.def ? (
        <div
          className="gm-panel-def"
          style={{ marginBottom: 6, fontSize: 9.5 }}
        >
          {n.def}
        </div>
      ) : null}
      <div className="gm-panel-metrics" style={{ marginBottom: 4 }}>
        <Metric
          label="Центральность"
          pct={cenPct}
          color={color}
          value={(n.cen ?? 0.5).toFixed(2)}
        />
        <Metric
          label="Определённость"
          pct={certPct}
          color="#7f8c8d"
          value={(n.cert ?? 0.5).toFixed(2)}
        />
      </div>
    </div>
  );
}

export interface EdgePanelProps {
  edgeData: GEdge;
  allNodes: GNode[];
  clusterLabels: string[];
  onClose: () => void;
  /** Беседа 5.4: «✎ Редактировать» → EdgeEditor; не передан — кнопки нет */
  onEdit?: (() => void) | undefined;
  editDisabled?: boolean | undefined;
}

export default function EdgePanel({
  edgeData,
  allNodes,
  clusterLabels,
  onClose,
  onEdit,
  editDisabled = false,
}: EdgePanelProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [edgeData]);

  const { color: edgeColor, dash } = edgeTypeStyle(edgeData.type);

  const isRefl =
    edgeData.dir.includes("рефлексив") ||
    edgeData.src.toLowerCase().trim() === edgeData.tgt.toLowerCase().trim();

  // Направление
  const isBi = edgeData.dir.includes("двунаправлен");
  const dirIcon = isRefl ? "↺" : isBi ? "↔" : "→";
  const dirLabel = isRefl
    ? "рефлексивная"
    : isBi
      ? "двунаправленная"
      : "однонаправленная";

  // Сила
  const strPct = Math.round((edgeData.str || 0.5) * 100);

  return (
    <div className={"gm-info-panel" + (visible ? " visible" : "")}>
      <div className="gm-panel-header">
        <svg width="18" height="12" style={{ flexShrink: 0, marginTop: 2 }}>
          <line
            x1="1"
            y1="6"
            x2="17"
            y2="6"
            stroke={edgeColor}
            strokeWidth="2.5"
            strokeDasharray={dash ?? undefined}
          />
        </svg>
        <div className="gm-panel-name" style={{ fontSize: 11.5 }}>
          {edgeData.type || "Связь"}
        </div>
        <button
          className="gm-panel-close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          ✕
        </button>
      </div>
      <div className="gm-panel-badges">
        <span
          className="gm-panel-badge"
          style={{ borderColor: edgeColor, color: edgeColor }}
        >
          {dirIcon} {dirLabel}
        </span>
      </div>
      {onEdit ? (
        <div className="gm-panel-edit-row">
          <button
            type="button"
            className="gm-btn gm-panel-edit-btn"
            disabled={editDisabled}
            title={
              editDisabled
                ? "Идёт генерация — правки заблокированы"
                : "Редактировать связь"
            }
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            ✎ Редактировать
          </button>
        </div>
      ) : null}
      {edgeData.desc ? (
        <div className="gm-panel-def">{edgeData.desc}</div>
      ) : null}
      <div className="gm-panel-metrics">
        <Metric
          label="Сила связи"
          pct={strPct}
          color={edgeColor}
          value={(edgeData.str || 0.5).toFixed(2)}
        />
      </div>
      {edgeData._extended ? (
        <div
          className="gm-panel-metrics"
          style={{
            marginTop: 4,
            borderTop: "1px dashed rgba(127,140,141,.3)",
            paddingTop: 6,
          }}
        >
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 8,
              letterSpacing: 1,
              color: "var(--ink-dim)",
              marginBottom: 4,
            }}
          >
            РАСШИРЕННЫЕ
          </div>
          <Metric
            label="Определённость"
            pct={Math.round((edgeData.certEdge ?? 0) * 100)}
            color="#e67e22"
            value={(edgeData.certEdge ?? 0).toFixed(2)}
          />
          <Metric
            label="Инновация"
            pct={Math.round((((edgeData.innovDeg ?? 1) - 1) / 4) * 100)}
            color="#e74c3c"
            value={`${edgeData.innovDeg ?? 1}/5`}
          />
          <Metric
            label="Ист. подкрепл."
            pct={Math.round((edgeData.histSupport ?? 0) * 100)}
            color="#f39c12"
            value={(edgeData.histSupport ?? 0).toFixed(2)}
          />
          <Metric
            label="Лог. необходим."
            pct={Math.round((edgeData.logNec ?? 0) * 100)}
            color="#3498db"
            value={(edgeData.logNec ?? 0).toFixed(2)}
          />
          <Metric
            label="Контекст. завис."
            pct={Math.round((edgeData.ctxDep ?? 0) * 100)}
            color="#9b59b6"
            value={(edgeData.ctxDep ?? 0).toFixed(2)}
          />
        </div>
      ) : null}
      <div className="gm-panel-ep-divider" />
      <NodeBlock
        nodeName={edgeData.src}
        labelPrefix={isRefl ? "УЗЕЛ" : "ИСТОЧНИК"}
        allNodes={allNodes}
        clusterLabels={clusterLabels}
      />
      {isRefl ? null : (
        <>
          <div className="gm-panel-ep-divider" />
          <NodeBlock
            nodeName={edgeData.tgt}
            labelPrefix="ЦЕЛЬ"
            allNodes={allNodes}
            clusterLabels={clusterLabels}
          />
        </>
      )}
    </div>
  );
}
