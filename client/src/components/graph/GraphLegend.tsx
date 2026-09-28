/**
 * GraphLegend — легенда графа. Беседа 1.7.
 * React-порт buildLegend() [16054] из 1.7-graph-viz.js: секции
 * «ТИПЫ КАТЕГОРИЙ» (точки цветов), «ПРОЦЕССУАЛЬНЫЕ РОЛИ (ФОРМА/ГЕОМЕТРИЯ)»
 * (ROLE_REGISTRY — символы 2D / названия геометрий 3D), «СТРУКТУРНЫЕ РОЛИ
 * (МАРКЕР)» (STRUCT_LEGEND — SVG-иконки, отдельные для 2D и 3D),
 * «ТИПЫ СВЯЗЕЙ» (линии с цветом/пунктиром), «КЛАСТЕРЫ» (кликабельные),
 * подсказки. Показываются только роли, реально присутствующие в графе.
 *
 * АДАПТАЦИИ: разметка — JSX; active-класс кликабельных элементов ведёт
 * React (activeFilter — тот же graphState.legendFilter, синхронизирован
 * через setLegendFilterListener в GraphModal); handleLegendClick [16260]
 * (toggle + вызов graphAPI3d/2d) поднят в GraphModal (onToggle) — здесь
 * только выбор и stopPropagation. touchend-обработчик исходника не
 * требуется: click синтезируется и на таче, а двойного срабатывания
 * React-обработчик не даёт.
 */

import {
  CPAL,
  edgeTypeStyle,
  graphState,
  typeColorHex,
  PROCEDURAL_PRIORITY,
} from "./graph-utils";

import type { LegendFilter, RoleLayer } from "./graph-utils";
import { tl } from "@philosynth/shared/i18n/t";

interface RoleRegistryEntry {
  key: string;
  label: string;
  sym2d: string;
  name3d: string;
}

// ── Полный реестр ролей ───────────────────────────────────────────────
const ROLE_REGISTRY = (): RoleRegistryEntry[] => ([
  { key: "synthesis",         label: tl("common.synthesis", "Синтез"),          sym2d: "⯃", name3d: tl("graph.graphLegend.octahedron", "октаэдр") },
  { key: "thesis",            label: tl("common.thesis", "Тезис"),           sym2d: "▲", name3d: tl("graph.graphLegend.tetrahedronUp", "тетраэдр ▲") },
  { key: "antithesis",        label: tl("common.antithesis", "Антитезис"),       sym2d: "▽", name3d: tl("graph.graphLegend.tetrahedronDown", "тетраэдр ▽") },
  { key: "generative",        label: tl("common.generative", "Генеративная"),    sym2d: "⬡", name3d: tl("graph.graphLegend.icosahedron", "икосаэдр") },
  { key: "core",              label: tl("graph.graphLegend.core", "Ядро"),            sym2d: "◆", name3d: tl("graph.graphLegend.octahedronFlat", "октаэдр (плоский)") },
  { key: "bridge",            label: tl("common.bridge", "Мост"),            sym2d: "◼", name3d: tl("graph.graphLegend.cubeDashed", "куб - - -") },
  { key: "central",           label: tl("common.central", "Центральная"),     sym2d: "⬠", name3d: tl("graph.graphLegend.dodecahedron", "додекаэдр") },
  { key: "deconstructed",     label: tl("graph.graphLegend.deconstructedShort", "Деконструиров."),  sym2d: "✚", name3d: tl("graph.graphLegend.wireframe", "каркас") },
  { key: "reassembled",       label: tl("common.reassembled", "Пересобранная"),   sym2d: "✡", name3d: "stella octangula" },
  { key: "horizon-expansion", label: tl("graph.graphLegend.horizonExpansionShort", "Расш. горизонта"), sym2d: "◇", name3d: tl("graph.graphLegend.cone", "конус") },
  { key: "pre-horizon",       label: tl("common.prehorizon", "Предгоризонт"),    sym2d: "⏣", name3d: tl("graph.graphLegend.cylinder", "цилиндр") },
  { key: "integrating",       label: tl("common.integrating", "Интегрирующая"),   sym2d: "⋈", name3d: tl("graph.graphLegend.torus", "тор") },
  { key: "foundation",        label: tl("common.ground", "Основание"),       sym2d: "▬", name3d: tl("graph.graphLegend.flatCube", "плоский куб") },
  { key: "formalized",        label: tl("common.formalized", "Формализованная"), sym2d: "▭", name3d: tl("graph.graphLegend.cube", "куб") },
  { key: "verifying",         label: tl("common.verifying", "Верифицирующая"),  sym2d: "☆", name3d: tl("graph.graphLegend.dodecahedronWire", "додекаэдр-каркас") },
  { key: "peripheral",        label: tl("common.peripheral", "Периферийная"),    sym2d: "●", name3d: tl("graph.graphLegend.sphere", "сфера") },
]);

const STRUCT_LEGEND = (): {
  key: string;
  label: string;
  desc2d: string;
  desc3d: string;
}[] => ([
  { key: "core",       label: tl("graph.graphLegend.core", "Ядро"),
    desc2d: tl("graph.graphLegend.innerSilhouette", "внутренний силуэт"),
    desc3d: tl("graph.graphLegend.innerBody", "внутреннее тело (полупрозрачная оболочка)") },
  { key: "generative", label: tl("common.generative", "Генеративная"),
    desc2d: tl("graph.graphLegend.glow", "свечение (glow)"),
    desc3d: tl("graph.graphLegend.pointLightGlow", "PointLight + усиленное свечение") },
  { key: "bridge",     label: tl("common.bridge", "Мост"),
    desc2d: tl("graph.graphLegend.dashedOutline", "пунктирная обводка"),
    desc3d: tl("graph.graphLegend.wireframeOverlay", "wireframe-каркас поверх") },
  { key: "central",    label: tl("common.central", "Центральная"),
    desc2d: tl("graph.graphLegend.boldOutline", "жирная обводка"),
    desc3d: tl("graph.graphLegend.scaleUpBright", "увеличенный масштаб + яркость") },
  { key: "peripheral", label: tl("common.peripheral", "Периферийная"),
    desc2d: tl("graph.graphLegend.thinOutline", "тонкая обводка"),
    desc3d: tl("graph.graphLegend.scaleDownDim", "уменьшенный масштаб + приглушённость") },
]);

/** SVG-иконки структурных ролей (2D- и 3D-варианты исходника) */
function StructIcon({ k, mode }: { k: string; mode: "2d" | "3d" }) {
  const s = { flexShrink: 0 } as const;
  if (mode === "2d") {
    if (k === "core")
      return (
        <svg width="22" height="16" style={s}>
          <circle cx="11" cy="8" r="6" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="1.5" />
          <circle cx="11" cy="8" r="3.3" fill="rgba(255,255,255,.5)" />
        </svg>
      );
    if (k === "generative")
      return (
        <svg width="22" height="16" style={s}>
          <circle cx="11" cy="8" r="5" fill="rgba(255,200,50,.3)" stroke="rgba(255,200,50,.6)" strokeWidth="1" />
          <circle cx="11" cy="8" r="8" fill="none" stroke="rgba(255,200,50,.15)" strokeWidth="3" />
        </svg>
      );
    if (k === "bridge")
      return (
        <svg width="22" height="16" style={s}>
          <circle cx="11" cy="8" r="5" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1.5" strokeDasharray="3,2" />
        </svg>
      );
    if (k === "central")
      return (
        <svg width="22" height="16" style={s}>
          <circle cx="11" cy="8" r="5" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="3" />
        </svg>
      );
    if (k === "peripheral")
      return (
        <svg width="22" height="16" style={s}>
          <circle cx="11" cy="8" r="5" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="0.8" />
        </svg>
      );
    return null;
  }
  // 3D-иконки (стилизация под трёхмерный вид)
  if (k === "core")
    return (
      <svg width="22" height="16" style={s}>
        <circle cx="11" cy="8" r="6" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.3)" strokeWidth="1" />
        <circle cx="11" cy="8" r="3.3" fill="rgba(255,255,255,.7)" />
      </svg>
    );
  if (k === "generative")
    return (
      <svg width="22" height="16" style={s}>
        <circle cx="11" cy="8" r="5" fill="rgba(255,200,50,.4)" stroke="rgba(255,200,50,.8)" strokeWidth="1.5" />
        <circle cx="11" cy="8" r="8" fill="none" stroke="rgba(255,200,50,.25)" strokeWidth="4" />
      </svg>
    );
  if (k === "bridge")
    return (
      <svg width="22" height="16" style={s}>
        <circle cx="11" cy="8" r="5" fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.3)" strokeWidth="1" />
        <line x1="6" y1="4" x2="16" y2="4" stroke="rgba(255,255,255,.7)" strokeWidth="1" />
        <line x1="6" y1="8" x2="16" y2="8" stroke="rgba(255,255,255,.7)" strokeWidth="1" />
        <line x1="6" y1="12" x2="16" y2="12" stroke="rgba(255,255,255,.7)" strokeWidth="1" />
      </svg>
    );
  if (k === "central")
    return (
      <svg width="22" height="16" style={s}>
        <circle cx="11" cy="8" r="7" fill="rgba(255,255,255,.25)" stroke="rgba(255,255,255,.5)" strokeWidth="1.5" />
      </svg>
    );
  if (k === "peripheral")
    return (
      <svg width="22" height="16" style={s}>
        <circle cx="11" cy="8" r="3.5" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.2)" strokeWidth="0.8" />
      </svg>
    );
  return null;
}

function rolesOfLayer(layer: RoleLayer): Set<string> {
  const active = new Set<string>();
  const layerMap = graphState.G.topology?.roles?.[layer] || {};
  for (const roleList of Object.values(layerMap)) {
    const arr =
      roleList instanceof Set
        ? [...roleList]
        : Array.isArray(roleList)
          ? roleList
          : [];
    arr.forEach((r) => active.add(r));
  }
  return active;
}

function SecTitle({ text, mt = 0 }: { text: string; mt?: number }) {
  return (
    <div className="gm-legend-sec" style={{ marginTop: mt }}>
      {text}
    </div>
  );
}

export interface GraphLegendProps {
  nodeTypes: Set<string>;
  edgeTypes: Set<string>;
  clusterLabels: string[];
  mode: "3d" | "2d";
  activeFilter: LegendFilter;
  /** handleLegendClick исходника — toggle фильтра (реализация в GraphModal) */
  onToggle: (f: Exclude<LegendFilter, null>) => void;
}

export default function GraphLegend({
  nodeTypes,
  edgeTypes,
  clusterLabels,
  mode,
  activeFilter,
  onToggle,
}: GraphLegendProps) {
  const isActive = (f: Exclude<LegendFilter, null>): boolean => {
    if (!activeFilter) return false;
    if (f.type === "role" && activeFilter.type === "role")
      return f.key === activeFilter.key && f.layer === activeFilter.layer;
    if (f.type === "cluster" && activeFilter.type === "cluster")
      return f.idx === activeFilter.idx;
    return false;
  };

  const clickable = (f: Exclude<LegendFilter, null>) =>
    "gm-legend-item gm-legend-clickable" + (isActive(f) ? " active" : "");

  // ── Какие роли реально присутствуют в текущем графе ──────────────────
  const procRolesActive = rolesOfLayer("procedural");
  const visibleProcRoles = ROLE_REGISTRY().filter(
    (r) => procRolesActive.has(r.key) && PROCEDURAL_PRIORITY.includes(r.key),
  );
  const structRolesActive = rolesOfLayer("structural");
  const visibleStruct = STRUCT_LEGEND().filter((s) =>
    structRolesActive.has(s.key),
  );

  return (
    <div className="gm-legend">
      {/* ── Секция 1: типы узлов ── */}
      <SecTitle text={tl("graph.graphLegend.categoryTypesHeading", "ТИПЫ КАТЕГОРИЙ")} />
      {[...nodeTypes].map((t) => (
        <div className="gm-legend-item" key={t}>
          <div
            className="gm-legend-dot"
            style={{ background: typeColorHex(t) }}
          />
          <span>{t}</span>
        </div>
      ))}

      {/* ── Секция 2a: Процессуальные роли (ФОРМА) ── */}
      {visibleProcRoles.length ? (
        <>
          <SecTitle
            text={
              mode === "2d"
                ? tl("graph.graphLegend.proceduralRolesShape", "ПРОЦЕССУАЛЬНЫЕ РОЛИ (ФОРМА)")
                : tl("graph.graphLegend.proceduralRolesGeometry", "ПРОЦЕССУАЛЬНЫЕ РОЛИ (ГЕОМЕТРИЯ)")
            }
            mt={10}
          />
          {visibleProcRoles.map((r) => {
            const f = {
              type: "role",
              key: r.key,
              layer: "procedural",
            } as const;
            return (
              <div
                className={clickable(f)}
                key={r.key}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(f);
                }}
              >
                {mode === "2d" ? (
                  <span
                    style={{
                      fontSize: 11,
                      width: 22,
                      textAlign: "center",
                      flexShrink: 0,
                      lineHeight: 1,
                    }}
                  >
                    {r.sym2d}
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: 9,
                      width: 22,
                      flexShrink: 0,
                      color: "rgba(255,255,255,.45)",
                      lineHeight: 1,
                    }}
                  >
                    {r.sym2d}
                  </span>
                )}
                <span>
                  {mode === "2d" ? r.label : `${r.name3d} — ${r.label}`}
                </span>
              </div>
            );
          })}
        </>
      ) : null}

      {/* ── Секция 2b: Структурные роли (МАРКЕР) ── */}
      {visibleStruct.length ? (
        <>
          <SecTitle text={tl("graph.graphLegend.structuralRolesMarker", "СТРУКТУРНЫЕ РОЛИ (МАРКЕР)")} mt={10} />
          {visibleStruct.map((s) => {
            const f = {
              type: "role",
              key: s.key,
              layer: "structural",
            } as const;
            return (
              <div
                className={clickable(f)}
                key={s.key}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(f);
                }}
              >
                <StructIcon k={s.key} mode={mode} />
                <span>
                  {s.label} — {mode === "2d" ? s.desc2d : s.desc3d}
                </span>
              </div>
            );
          })}
        </>
      ) : null}

      {/* ── Секция 3: типы рёбер ── */}
      {edgeTypes.size ? (
        <>
          <SecTitle text={tl("graph.graphLegend.edgeTypesHeading", "ТИПЫ СВЯЗЕЙ")} mt={10} />
          {[...edgeTypes].map((t) => {
            const { color, dash } = edgeTypeStyle(t);
            return (
              <div className="gm-legend-item" key={t}>
                <svg width="22" height="10" style={{ flexShrink: 0 }}>
                  <line
                    x1="1"
                    y1="5"
                    x2="21"
                    y2="5"
                    stroke={color}
                    strokeWidth="2"
                    strokeDasharray={dash ?? undefined}
                  />
                </svg>
                <span>{t}</span>
              </div>
            );
          })}
        </>
      ) : null}

      {/* ── Секция 4: кластеры ── */}
      {clusterLabels.length ? (
        <>
          <SecTitle text={tl("graph.graphLegend.clustersHeading", "КЛАСТЕРЫ")} mt={10} />
          {clusterLabels.map((label, i) => {
            const c = CPAL[i % CPAL.length]!;
            const f = { type: "cluster", idx: i } as const;
            return (
              <div
                className={clickable(f)}
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(f);
                }}
              >
                <svg width="22" height="10" style={{ flexShrink: 0 }}>
                  <circle
                    cx="11"
                    cy="5"
                    r="4"
                    fill="none"
                    stroke={c}
                    strokeWidth="1.5"
                    strokeDasharray="2,1.5"
                  />
                </svg>
                <span>{label}</span>
              </div>
            );
          })}
        </>
      ) : null}

      {/* ── Подсказки ── */}
      <div className="gm-legend-hint" style={{ marginTop: 8 }}>
        {tl("graph.graphLegend.directionLegend", "→ однонаправл. · ↔ двунаправл. · ↺ рефлексив.")}
      </div>
      <div className="gm-legend-hint">
        {tl("graph.graphLegend.certaintyLegend", "⌀ опр-ть = прозрач. заливки · ◼- - мост = пункт. обводка")}
      </div>
    </div>
  );
}
