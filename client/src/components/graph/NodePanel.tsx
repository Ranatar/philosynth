/**
 * NodePanel — информационная панель узла. Беседа 1.7.
 * React-порт showNodePanel() [13234] из 1.7-graph-viz.js: та же разметка
 * (.gm-info-panel / .gm-panel-*), тот же состав — шапка с точкой цвета
 * типа, бейджи тип+кластеры, группы ролей (Структурные/Процессуальные),
 * определение, происхождение/генеалогия, метрики-полосы (центральность,
 * определённость), секция «РАСШИРЕННЫЕ» при _extended (histSig, innovDeg,
 * clarity, breadth, depth, applic — бары + значения), списки связей
 * Исходящие/Входящие/Рефлексивные (двунаправленные A→B дублируются во
 * «входящие» с перестановкой концов).
 *
 * Беседа 5.2 (п. 6): проп onEdit — кнопка «✎ Редактировать» под бейджами
 * (открывает CategoryEditor узла в GraphModal); в исходнике правки
 * элементов не было.
 *
 * АДАПТАЦИЯ: разметка — JSX вместо innerHTML (панель — React-компонент,
 * данные приходят колбэком onShowNode из рендер-ядра); класс .visible
 * навешивается эффектом после первого кадра — сохранена slide-in-анимация
 * исходника (requestAnimationFrame → transition).
 */

import { useEffect, useState } from "react";

import {
  CPAL,
  edgeTypeStyle,
  typeColorHex,
} from "./graph-utils";

import type { PanelLink, PanelNodeData } from "./graph-utils";

const ROLE_LABELS: Record<string, string> = {
  central: "Центральная",
  peripheral: "Периферийная",
  bridge: "Мост",
  synthesis: "Точка синтеза",
  thesis: "Тезис",
  antithesis: "Антитезис",
  generative: "Генеративная",
  core: "Ядро пересечений",
  deconstructed: "Деконструированная",
  reassembled: "Пересобранная",
  "horizon-expansion": "Расширение горизонта",
  "pre-horizon": "Предгоризонт",
  integrating: "Интегрирующая",
  foundation: "Основание",
  formalized: "Формализованная",
  verifying: "Верифицирующая",
};

const endId = (v: PanelLink["source"]): number =>
  typeof v === "object" ? v.id : v;
const endName = (v: PanelLink["source"]): string =>
  typeof v === "object" ? v.name : "?";

function RoleGroup({
  roles,
  groupLabel,
}: {
  roles: Set<string> | undefined;
  groupLabel: string;
}) {
  const arr = [...(roles || new Set<string>())];
  if (!arr.length) return null;
  return (
    <div className="gm-panel-role-group">
      <span className="gm-panel-role-group-label">{groupLabel}</span>
      {arr.map((r) => (
        <span key={r} className="gm-role-tag">
          {ROLE_LABELS[r] || r}
        </span>
      ))}
    </div>
  );
}

function EdgeRow({ l, dir }: { l: PanelLink; dir: "out" | "in" | "ref" }) {
  const other =
    dir === "ref" ? (
      <em>(рефлексивная)</em>
    ) : dir === "out" ? (
      endName(l.target)
    ) : (
      endName(l.source)
    );
  const { color: ec, dash } = edgeTypeStyle(l.type);
  return (
    <div className="gm-panel-edge">
      <svg width="16" height="10" style={{ flexShrink: 0, marginTop: 1 }}>
        <line
          x1="1"
          y1="5"
          x2="15"
          y2="5"
          stroke={ec}
          strokeWidth="2"
          strokeDasharray={dash ?? undefined}
        />
      </svg>
      <span className="gm-panel-edge-arrow">
        {dir === "out" ? "→" : dir === "in" ? "←" : "↺"}
      </span>
      <div>
        <div className="gm-panel-edge-name">{other}</div>
        <div className="gm-panel-edge-meta">
          {l.type || "—"}
          {l.desc ? " · " + l.desc : ""}
        </div>
      </div>
    </div>
  );
}

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

export interface NodePanelProps {
  d: PanelNodeData;
  links: PanelLink[];
  clusterLabels: string[];
  onClose: () => void;
  /** Беседа 5.2 (п. 6): кнопка «✎ Редактировать» → CategoryEditor узла.
   *  Не передан — кнопки нет (чужой/публичный синтез, нет dbId) */
  onEdit?: (() => void) | undefined;
  editDisabled?: boolean | undefined;
}

export default function NodePanel({
  d,
  links,
  clusterLabels,
  onClose,
  onEdit,
  editDisabled = false,
}: NodePanelProps) {
  // slide-in: .visible после первого кадра (rAF исходника)
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [d]);

  const color = typeColorHex(d.type);
  const certPct = Math.round((d.cert ?? 0.5) * 100);
  const cenPct = Math.round((d.cen ?? 0.5) * 100);
  // d.cluster всегда массив индексов (может быть пустым)
  const clusterIdx = Array.isArray(d.cluster) ? d.cluster : [];

  const out = links.filter(
    (l) => endId(l.source) === d.id && !l.dir.includes("рефлексив"),
  );
  const inc = links.filter(
    (l) => endId(l.target) === d.id && endId(l.source) !== d.id,
  );
  // Двунаправленные: если A→B двунаправленная и мы смотрим A,
  // добавить «входящую» сторону (B→A)
  const biIncoming = links
    .filter(
      (l) =>
        endId(l.source) === d.id &&
        endId(l.target) !== d.id &&
        l.dir.includes("двунаправлен"),
    )
    .map((l) => ({ ...l, source: l.target, target: l.source }));
  const incAll = [...inc, ...biIncoming];
  const ref = links.filter(
    (l) => endId(l.source) === d.id && l.dir.includes("рефлексив"),
  );

  return (
    <div className={"gm-info-panel" + (visible ? " visible" : "")}>
      <div className="gm-panel-header">
        <div className="gm-panel-dot" style={{ background: color }} />
        <div className="gm-panel-name">{d.name}</div>
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
          style={{ borderColor: color, color }}
        >
          {d.type || "—"}
        </span>
        {clusterIdx.map((idx) => {
          const label = clusterLabels[idx] || `Кластер ${idx + 1}`;
          const cc = CPAL[idx % CPAL.length]!;
          return (
            <span
              key={idx}
              className="gm-panel-badge"
              style={{ borderColor: cc, color: cc }}
            >
              {label}
            </span>
          );
        })}
      </div>
      {(d.structuralRoles?.size || d.roles?.size || d.proceduralRoles?.size) ? (
        <div className="gm-panel-roles">
          <RoleGroup
            roles={d.structuralRoles || d.roles}
            groupLabel="Структурные"
          />
          <RoleGroup roles={d.proceduralRoles} groupLabel="Процессуальные" />
        </div>
      ) : null}
      {onEdit ? (
        <div className="gm-panel-edit-row">
          <button
            type="button"
            className="gm-btn gm-panel-edit-btn"
            disabled={editDisabled}
            title={
              editDisabled
                ? "Идёт генерация — правки заблокированы"
                : "Редактировать категорию"
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
      <div className="gm-panel-def">{d.def || ""}</div>
      {d.orig ? (
        <div className="gm-panel-orig">
          <div className="gm-panel-orig-label">Происхождение / генеалогия</div>
          <div className="gm-panel-orig-text">{d.orig}</div>
        </div>
      ) : null}
      <div className="gm-panel-metrics">
        <Metric
          label="Центральность"
          pct={cenPct}
          color={color}
          value={(d.cen ?? 0.5).toFixed(2)}
        />
        <Metric
          label="Определённость"
          pct={certPct}
          color="#7f8c8d"
          value={(d.cert ?? 0.5).toFixed(2)}
        />
      </div>
      {d._extended ? (
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
            label="Ист. значимость"
            pct={Math.round((d.histSig ?? 0) * 100)}
            color="#e67e22"
            value={(d.histSig ?? 0).toFixed(2)}
          />
          <Metric
            label="Инновация"
            pct={Math.round((((d.innovDeg ?? 1) - 1) / 4) * 100)}
            color="#e74c3c"
            value={`${d.innovDeg ?? 1}/5`}
          />
          <Metric
            label="Ясность"
            pct={Math.round((d.clarity ?? 0) * 100)}
            color="#2ecc71"
            value={(d.clarity ?? 0).toFixed(2)}
          />
          <Metric
            label="Широта"
            pct={Math.round((d.breadth ?? 0) * 100)}
            color="#3498db"
            value={(d.breadth ?? 0).toFixed(2)}
          />
          <Metric
            label="Глубина"
            pct={Math.round((d.depth ?? 0) * 100)}
            color="#9b59b6"
            value={(d.depth ?? 0).toFixed(2)}
          />
          <Metric
            label="Применимость"
            pct={Math.round((d.applic ?? 0) * 100)}
            color="#1abc9c"
            value={(d.applic ?? 0).toFixed(2)}
          />
        </div>
      ) : null}
      {out.length ? (
        <>
          <div className="gm-panel-el-label">Исходящие</div>
          {out.map((l, i) => (
            <EdgeRow key={`o${i}`} l={l} dir="out" />
          ))}
        </>
      ) : null}
      {incAll.length ? (
        <>
          <div className="gm-panel-el-label">Входящие</div>
          {incAll.map((l, i) => (
            <EdgeRow key={`i${i}`} l={l} dir="in" />
          ))}
        </>
      ) : null}
      {ref.length ? (
        <>
          <div className="gm-panel-el-label">Рефлексивные</div>
          {ref.map((l, i) => (
            <EdgeRow key={`r${i}`} l={l} dir="ref" />
          ))}
        </>
      ) : null}
    </div>
  );
}
