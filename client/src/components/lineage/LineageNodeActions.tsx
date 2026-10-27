/**
 * Действия у узла генеалогического древа — беседа 15.1 (Д-68, Д-69).
 *
 * Прародителя в исходнике нет: там генеалогия жила в объекте файла, UUID не
 * знала и после импорта не менялась. Здесь — два действия у узлов ВЕРХНЕГО
 * уровня древа (прямые родители), только владельцу:
 *
 *  - «Связать с концепцией…» — у неперекрытого узла-концепции дерева файла
 *    (fromFile, position). Панель раскрывается ПО МЕСТУ, под карточкой
 *    (правило кита: popover в документе негде разместить): совпадения по
 *    имени среди своих синтезов (GET …/lineage/file-node/:position/
 *    candidates) и поиск по подстроке названия (тот же GET с ?q=); выбор
 *    подтверждается ВТОРЫМ шагом кнопок (useSecondStep: «Точно связать?» /
 *    «Отмена», клик мимо панели сбрасывает) → POST /lineage/link с явной
 *    позицией узла. LINEAGE_EXISTS = цель достигнута (как в ImportPage 8.5).
 *  - «Отвязать» — у связи-концепции, перекрывающей узел файла
 *    (coversFileNode): второй шаг → DELETE /lineage/link/:parentSynthesisId;
 *    узел файла проступает снова, потомки не трогаются. У родителя без узла
 *    файла (по нему сгенерирован документ) действия нет вовсе — сервер
 *    ответил бы LINEAGE_GENERATED.
 *
 * После любого действия хозяин (SynthesisPage) перечитывает синтез и древо
 * (onChanged). Оформление — блок «Беседа 15.1» части 3 globals.css: кнопки
 * и подписи в идиоме карточки древа (моно, капитель, золото на тёмном;
 * .gen-tree-light — чернила), поле поиска — рамка кита, без скруглений и
 * теней; палитра закрытая.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  FileNodeCandidates,
  LineageCandidateMatch,
} from "@philosynth/shared/types/lineage";
import { tl } from "@philosynth/shared/i18n/t";

import { ApiError } from "../../api/client";
import { getFileNodeCandidates, linkParent, unlinkParent } from "../../api/lineage";
import { useSecondStep } from "../../hooks/useSecondStep";
import { fmtDateShort } from "../../utils/format";
import type { GenealogyNode } from "../../utils/genealogy";

/** Что хозяин древа даёт действиям у узлов (SynthesisPage, владелец). */
export interface LineageActionsContext {
  synthesisId: string;
  /** Идёт генерация/пауза — действия недоступны (сервер ответил бы 409) */
  disabled: boolean;
  /** Перечитать синтез и древо после привязки/отвязки */
  onChanged: () => void | Promise<void>;
}

/** Какое действие положено узлу верхнего уровня (null — никакого). */
export function lineageActionFor(
  node: GenealogyNode,
  level: number,
): "link" | "unlink" | null {
  if (level !== 1 || node.type !== "concept" || node.position === undefined) return null;
  if (node.fromFile) return "link";
  if (node.coversFileNode && node.synthesisId) return "unlink";
  return null;
}

/** Текст отказа по коду ответа (03 §4.3) — тексты через tl(). */
export function lineageActionErrorText(err: unknown): string {
  if (!(err instanceof ApiError)) return tl("lineage.lineageNodeActions.failed", "Не удалось. Попробуйте ещё раз.");
  switch (err.code) {
    case "LINEAGE_SELF":
      return tl("lineage.lineageNodeActions.selfParent", "Концепция не может быть собственным родителем.");
    case "LINEAGE_CYCLE":
      return tl("lineage.lineageNodeActions.cycleParent", "Эта концепция — потомок текущей: связь замкнула бы родословную в цикл.");
    case "LINEAGE_NODE_UNAVAILABLE":
      return tl("lineage.lineageNodeActions.nodeUnavailable", "Узел дерева файла уже перекрыт связью или не является концепцией — древо обновлено.");
    case "LINEAGE_GENERATED":
      return tl("lineage.lineageNodeActions.generatedParent", "По этому родителю сгенерирован текст документа — отвязать его нельзя.");
    case "GENERATION_IN_PROGRESS":
      return tl("lineage.lineageNodeActions.generationInProgress", "Идёт генерация — дождитесь её завершения.");
    case "FORBIDDEN":
      return tl("lineage.lineageNodeActions.foreignParent", "Концепция принадлежит другому пользователю — в родители не идёт.");
    case "NOT_FOUND":
      return tl("lineage.lineageNodeActions.notFound", "Концепция не найдена (удалена?).");
    default:
      return err.message;
  }
}

interface Props {
  node: GenealogyNode;
  action: "link" | "unlink";
  ctx: LineageActionsContext;
}

export function LineageNodeActions({ node, action, ctx }: Props) {
  return action === "link" ? (
    <LinkAction node={node} ctx={ctx} />
  ) : (
    <UnlinkAction node={node} ctx={ctx} />
  );
}

/* ── «Связать с концепцией…» (Д-68) ─────────────────────────────────── */

function LinkAction({ node, ctx }: { node: GenealogyNode; ctx: LineageActionsContext }) {
  const position = node.position as number;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FileNodeCandidates | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = useSecondStep<string>(busy);
  const reqRef = useRef(0);

  // Загрузка кандидатов: при открытии панели и при смене запроса (дебаунс 300 мс)
  const load = useCallback(
    async (q: string) => {
      const n = ++reqRef.current;
      setLoading(true);
      try {
        const res = await getFileNodeCandidates(ctx.synthesisId, position, q || undefined);
        if (n === reqRef.current) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (n === reqRef.current) setError(lineageActionErrorText(err));
      } finally {
        if (n === reqRef.current) setLoading(false);
      }
    },
    [ctx.synthesisId, position],
  );

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(query.trim()), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [open, query, load]);

  async function confirm(match: LineageCandidateMatch) {
    setBusy(true);
    setError(null);
    try {
      await linkParent(ctx.synthesisId, node.name, match.id, position);
    } catch (err) {
      // LINEAGE_EXISTS — пара уже есть: цель достигнута (как в ImportPage 8.5)
      if (!(err instanceof ApiError && err.code === "LINEAGE_EXISTS")) {
        setError(lineageActionErrorText(err));
        setBusy(false);
        step.disarm();
        return;
      }
    }
    setBusy(false);
    step.disarm();
    setOpen(false);
    await ctx.onChanged();
  }

  const renderMatch = (m: LineageCandidateMatch) => {
    const armed = step.armed === m.id;
    return (
      <li key={m.id} className="gen-link-item" data-testid="lineage-node-match" data-match-id={m.id}>
        <span className="gen-link-item-title">{m.title}</span>
        <span className="gen-link-item-date">{fmtDateShort(m.createdAt)}</span>
        {armed ? (
          <span className="gen-link-item-btns">
            <button
              type="button"
              className="gen-card-action-btn primary"
              disabled={busy}
              onClick={() => void confirm(m)}
              data-testid="lineage-node-link-confirm"
            >
              {tl("lineage.lineageNodeActions.confirmLink", "Точно связать?")}
            </button>
            <button
              type="button"
              className="gen-card-action-btn"
              disabled={busy}
              onClick={step.disarm}
              data-testid="lineage-node-link-cancel"
            >
              {tl("common.cancel", "Отмена")}
            </button>
          </span>
        ) : (
          <span className="gen-link-item-btns">
            <button
              type="button"
              className="gen-card-action-btn"
              disabled={busy || step.armed !== null}
              onClick={() => step.arm(m.id)}
              data-testid="lineage-node-link-pick"
            >
              {tl("lineage.lineageNodeActions.link", "Связать")}
            </button>
          </span>
        )}
      </li>
    );
  };

  return (
    <div
      className="gen-card-actions"
      data-testid="lineage-node-actions"
      data-action="link"
      data-position={position}
      ref={step.ref as React.RefObject<HTMLDivElement>}
    >
      {!open ? (
        <button
          type="button"
          className="gen-card-action-btn"
          disabled={ctx.disabled}
          onClick={() => setOpen(true)}
          data-testid="lineage-node-link"
        >
          {tl("lineage.lineageNodeActions.linkWithConcept", "⚭ Связать с концепцией…")}
        </button>
      ) : (
        <div className="gen-link-panel" data-testid="lineage-link-panel">
          <div className="gen-link-panel-head">
            <span>{tl("lineage.lineageNodeActions.panelTitle", "Какая концепция стоит за узлом «{name}»?", { name: node.name })}</span>
            <button
              type="button"
              className="gen-card-action-btn"
              onClick={() => {
                setOpen(false);
                step.disarm();
                setError(null);
              }}
              data-testid="lineage-link-close"
              aria-label={tl("common.close", "Закрыть")}
            >
              ✕
            </button>
          </div>
          <div className="gen-link-group-label">{tl("lineage.lineageNodeActions.byName", "Совпадения по имени среди ваших концепций")}</div>
          {data && data.matches.length === 0 && !loading && (
            <div className="gen-link-empty">{tl("lineage.lineageNodeActions.noMatches", "Совпадений по имени нет")}</div>
          )}
          {data && data.matches.length > 0 && (
            <ul className="gen-link-list" data-testid="lineage-link-matches">{data.matches.map(renderMatch)}</ul>
          )}
          <label className="gen-link-group-label" htmlFor={`gen-link-search-${position}`}>
            {tl("lineage.lineageNodeActions.search", "Поиск по названию среди своих")}
          </label>
          <input
            id={`gen-link-search-${position}`}
            type="search"
            className="gen-link-search"
            value={query}
            placeholder={tl("lineage.lineageNodeActions.searchPlaceholder", "часть названия…")}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="lineage-link-search"
          />
          {query.trim() && data && data.query === query.trim() && data.search.length === 0 && !loading && (
            <div className="gen-link-empty">{tl("lineage.lineageNodeActions.nothingFound", "Ничего не найдено")}</div>
          )}
          {query.trim() && data && data.search.length > 0 && (
            <ul className="gen-link-list" data-testid="lineage-link-search-results">{data.search.map(renderMatch)}</ul>
          )}
          {loading && <div className="gen-link-status">{tl("common.loading", "Загрузка…")}</div>}
          {error && <div className="gen-link-status err" role="alert" data-testid="lineage-node-error">{error}</div>}
        </div>
      )}
    </div>
  );
}

/* ── «Отвязать» (Д-69) ──────────────────────────────────────────────── */

function UnlinkAction({ node, ctx }: { node: GenealogyNode; ctx: LineageActionsContext }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = useSecondStep(busy);
  const parentId = node.synthesisId as string;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await unlinkParent(ctx.synthesisId, parentId);
    } catch (err) {
      setError(lineageActionErrorText(err));
      setBusy(false);
      step.disarm();
      return;
    }
    setBusy(false);
    step.disarm();
    await ctx.onChanged();
  }

  return (
    <div
      className="gen-card-actions"
      data-testid="lineage-node-actions"
      data-action="unlink"
      data-parent-id={parentId}
      ref={step.ref as React.RefObject<HTMLDivElement>}
    >
      {step.armed ? (
        <>
          <div className="gen-link-note">
            {tl("lineage.lineageNodeActions.unlinkNote", "Связь снимется, узел из файла проступит снова; потомки не затронуты.")}
          </div>
          <button
            type="button"
            className="gen-card-action-btn danger"
            disabled={busy}
            onClick={() => void confirm()}
            data-testid="lineage-node-unlink-confirm"
          >
            {tl("lineage.lineageNodeActions.confirmUnlink", "Точно отвязать?")}
          </button>
          <button
            type="button"
            className="gen-card-action-btn"
            disabled={busy}
            onClick={step.disarm}
            data-testid="lineage-node-unlink-cancel"
          >
            {tl("common.cancel", "Отмена")}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="gen-card-action-btn"
          disabled={ctx.disabled}
          onClick={() => step.arm(true)}
          data-testid="lineage-node-unlink"
        >
          {tl("lineage.lineageNodeActions.unlink", "Отвязать")}
        </button>
      )}
      {error && <div className="gen-link-status err" role="alert" data-testid="lineage-node-error">{error}</div>}
    </div>
  );
}
