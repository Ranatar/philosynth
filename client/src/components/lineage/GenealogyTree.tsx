/**
 * Генеалогическое дерево (CSS org-chart). Беседа 3.2 (запрос 1, п. 2).
 *
 * Визуальный референс — renderGenealogyTree [22343–22410] исходника
 * (HTML-строки → React, esc() не нужен — React экранирует сам):
 *  - философ → простой блок .gen-phil;
 *  - концепция → карточка .gen-card: имя ◈, метод × уровень · порядок,
 *    зерно (корень — усечённый текст ≤80, родитель — <details>),
 *    капсула родителя — <details>;
 *  - дети → <ul><li>…рекурсия…</li></ul>; > 4 участников — .gen-vertical
 *    (вертикальная раскладка);
 *  - стили: тёмный (шапка документа) и светлый .gen-tree-light (в теле).
 *
 * АДАПТАЦИИ (беседа 3.2):
 *  1. Узлы из API (GET /lineage/ancestors → lineageNodeToGenealogy) не
 *     несут method/synthLevel/seed/capsule — мета-строка «? × ?» для них
 *     не рисуется (в исходнике данные шли из genealogy-объекта файла и
 *     были всегда; транспорт 3.1 отдаёт только type/name/synthesisId).
 *  2. Узлы с synthesisId — кликабельные ссылки на /synthesis/:id
 *     (п. 4 первого запроса: «ссылки на родительские концепции»).
 *
 * CSS .gen-* — в globals.css (порт из фрагмента 3.2-genealogy-ui.js:
 * базовые правила + @media light/print/≤500px + .gen-tree-light).
 */
import { Link } from "react-router-dom";

import { ML, SL } from "@philosynth/shared/constants/labels";

import type { GenealogyNode } from "../../utils/genealogy";

export interface GenealogyTreeProps {
  node: GenealogyNode | null;
  /** Светлая схема (.gen-tree-light) — дерево в теле документа */
  light?: boolean | undefined;
}

function NodeView({ n, isRootNode }: { n: GenealogyNode; isRootNode: boolean }) {
  // Философ → простой блок
  if (n.type === "philosopher") {
    return (
      <div className="gen-phil">
        <div className="gen-phil-name">{n.name}</div>
      </div>
    );
  }

  // Концепция → карточка. Мета-строка — только при известных параметрах
  // (адаптация 1: узлы из API их не несут)
  const hasMeta = !!(n.method || n.synthLevel);
  const methodLabel =
    (ML as Record<string, string>)[n.method ?? ""] || n.method || "?";
  const levelLabel =
    (SL as Record<string, string>)[n.synthLevel ?? ""] || n.synthLevel || "?";
  const orderLabel =
    n.generationOrder === "genetic" ? " · генетич." : " · архитект.";

  let seedNode: React.ReactNode = null;
  if (n.seed) {
    seedNode = isRootNode ? (
      // Корень — простой усечённый текст
      <div className="gen-card-seed">
        «{n.seed.length > 80 ? n.seed.slice(0, 80) + "…" : n.seed}»
      </div>
    ) : (
      // Родительская концепция — раскрывающийся блок
      <details className="gen-card-seed-details">
        <summary>Зерно</summary>
        <div className="gen-card-seed-details-body">«{n.seed}»</div>
      </details>
    );
  }

  const capsuleNode =
    n.capsule && !isRootNode ? (
      <details className="gen-card-capsule">
        <summary>Капсула</summary>
        <div className="gen-card-capsule-body">{n.capsule}</div>
      </details>
    ) : null;

  const nameContent = <>◈ {n.name}</>;

  return (
    <>
      <div className="gen-card">
        <div className="gen-card-name">
          {n.synthesisId ? (
            // Адаптация 2: кликабельная ссылка на страницу концепции
            <Link
              to={`/synthesis/${n.synthesisId}`}
              style={{ color: "inherit" }}
            >
              {nameContent}
            </Link>
          ) : (
            nameContent
          )}
        </div>
        {hasMeta && (
          <div className="gen-card-meta">
            {methodLabel} × {levelLabel}
            {orderLabel}
          </div>
        )}
        {seedNode}
        {capsuleNode}
      </div>
      {n.participants && n.participants.length > 0 && (
        <ul className={n.participants.length > 4 ? "gen-vertical" : undefined}>
          {n.participants.map((child, i) => (
            <li key={(child.synthesisId ?? child.name) + "_" + i}>
              <NodeView n={child} isRootNode={false} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function GenealogyTree({ node, light }: GenealogyTreeProps) {
  if (!node) return null;
  return (
    <div className={"gen-tree" + (light ? " gen-tree-light" : "")}>
      <NodeView n={node} isRootNode={true} />
    </div>
  );
}
