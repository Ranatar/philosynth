/**
 * Панель решения по предложению (беседа 17.2, п.3). Раскрывается на месте
 * строки вкладки «Предложения» (правило кита: не всплывающее окно).
 *
 * Показывает: кто предложил, основание, источник со ссылкой, основу и
 * текущую версию адресата, разницу (пополевую у элемента, текстовую у
 * подраздела) и журнал событий. Действия:
 *   «Принять»  — НЕ правит документ: POST …/accept → ЧЕРНОВИК плана правок,
 *                который принимает EditModal (влияние и каскад — её
 *                предпросмотром, подтверждение, исполнение — там же). Прямого
 *                PATCH элемента или подраздела здесь нет (сторож 4bq). У
 *                замечания принимающий выбирает способ.
 *   «Обсудить» — панель адреса 16.3.
 *   «Отклонить» — второй шаг, со словом решившего.
 *   устаревшее — «Новое поверх текущего» (автору) и «Закрыть» (правящему);
 *                принять устаревшее нельзя — кнопки нет.
 * Платит за исполнение тот, кто нажал (принявший) — об этом сказано у
 * способов, зовущих модель.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { tl } from "@philosynth/shared/i18n/t";
import type { ProposalAcceptMethod } from "@philosynth/shared/constants/proposals";
import type { EditPlan } from "@philosynth/shared/types/edit-plan";
import type { Proposal, ProposalDetail } from "@philosynth/shared/types/proposals";

import { ApiError } from "../../api/client";
import { getPlan } from "../../api/plans";
import { acceptProposal, closeProposal, getProposal, rebaseProposal, rejectProposal, withdrawProposal } from "../../api/proposals";
import { useSecondStep } from "../../hooks/useSecondStep";
import { addressLabel, authorNote, fmtWhen } from "../../utils/discussion";
import { loadCurrentTarget, type CurrentTarget } from "../../utils/proposal-current";
import {
  acceptMethodsFor,
  baseLine,
  eventText,
  fieldDiff,
  fieldLabel,
  kindLabel,
  methodIsPaid,
  methodLabel,
  methodNeedsValue,
  proposalErrorText,
  replaceFieldsFor,
  sourceLabel,
  statusLabel,
  subsectionDiff,
  type ProposalDiff,
} from "../../utils/proposals";
import { UserText } from "../discussion/UserText";

export interface ProposalDecisionPanelProps {
  synthesisId: string;
  proposal: Proposal;
  /** Номер предложения в концепции (порядок создания) */
  num: number | null;
  me: string | null;
  canEdit: boolean;
  /** Идёт генерация / исполнение — принять нельзя */
  live: boolean;
  sectionTitles: Readonly<Record<string, string>>;
  /** Черновик плана готов — управление переходит EditModal */
  onPlanReady: (plan: EditPlan, names: Record<string, string>) => void;
  /** «Обсудить»: панель адреса */
  onDiscuss: (p: Proposal) => void;
  /** Предложение изменилось / появилось новое — перечитать список */
  onChanged: (focusId?: string) => void;
}

function DiffBlock({ diff }: { diff: ProposalDiff }) {
  return (
    <div data-testid="proposal-diff" data-diff-same={diff.same ? "1" : "0"}>
      <div className="form-sublabel">{tl("proposals.decision.diffTitle", "Разница — {label}: сейчас → предлагается", { label: diff.label })}</div>
      {diff.same ? (
        <div className="proposal-note">{tl("proposals.decision.diffSame", "Предлагаемое совпадает с текущим — менять нечего.")}</div>
      ) : (
        <div className="diff">
          {diff.lines.map((l, i) => (
            <div key={i} className={`diff-line ${l.kind}`}>{l.text || " "}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProposalDecisionPanel({ synthesisId, proposal, num, me, canEdit, live, sectionTitles, onPlanReady, onDiscuss, onChanged }: ProposalDecisionPanelProps) {
  const [detail, setDetail] = useState<ProposalDetail | null>(null);
  const [current, setCurrent] = useState<CurrentTarget | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const methods = acceptMethodsFor(proposal.address.kind, proposal.kind);
  const [method, setMethod] = useState<ProposalAcceptMethod | null>(proposal.kind === "note" ? null : (methods[0] ?? null));
  const noteFields = replaceFieldsFor(proposal.address.kind);
  const [noteField, setNoteField] = useState<string>(noteFields[0] ?? "");
  const [noteValue, setNoteValue] = useState("");
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [rebaseOpen, setRebaseOpen] = useState(false);
  const [rebaseValue, setRebaseValue] = useState(proposal.value ?? "");
  const [rebaseRationale, setRebaseRationale] = useState(proposal.rationale);
  const rejectStep = useSecondStep(busy !== null);
  const closeStep = useSecondStep(busy !== null);

  const isAuthor = !!me && proposal.author.id === me;
  const open = proposal.status === "open";
  const stale = open && proposal.stale;
  const inPlan = open && !!proposal.planId;

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    getProposal(synthesisId, proposal.id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        /* журнал — дополнение; строка списка уже несёт всё для решения */
      });
    setCurrent(undefined);
    loadCurrentTarget(synthesisId, proposal.address, proposal.resolution.currentId)
      .then((c) => {
        if (!cancelled) setCurrent(c);
      })
      .catch(() => {
        if (!cancelled) setCurrent(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synthesisId, proposal.id, proposal.updatedAt]);

  const run = async (label: string, fn: () => Promise<void>, fallback: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(proposalErrorText(err, fallback));
      // устарело / уже не открыто — список перечитывается: кнопки сменятся
      if (err instanceof ApiError && (err.code === "PROPOSAL_STALE" || err.code === "CONFLICT")) onChanged(proposal.id);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  /** Имена элементов для подписей шагов плана (шаг несёт только «kind:id») */
  const namesFor = (): Record<string, string> => (current?.kind === "element" ? { [current.id]: current.name } : {});

  /* «Принять» ведёт ЧЕРЕЗ ПЛАН: служба собирает черновик, документ не
     тронут; EditModal показывает шаги с каскадом, человек подтверждает и
     исполняет. Никакой записи в документ отсюда. */
  const accept = () =>
    run(
      "accept",
      async () => {
        const body =
          proposal.kind === "replace"
            ? {}
            : {
                method: method as ProposalAcceptMethod,
                ...(method && methodNeedsValue(method) ? { value: noteValue, ...(method === "edit_element" && noteFields.length ? { field: noteField } : {}) } : {}),
                ...(method === "refine_element" && noteFields.length ? { field: noteField } : {}),
              };
        const res = await acceptProposal(synthesisId, proposal.id, body);
        onChanged(proposal.id);
        onPlanReady(res.plan, namesFor());
      },
      tl("proposals.decision.acceptFailed", "Не удалось собрать план по предложению."),
    );

  const openPlan = () =>
    run(
      "plan",
      async () => {
        if (!proposal.planId) return;
        onPlanReady(await getPlan(synthesisId, proposal.planId), namesFor());
      },
      tl("proposals.decision.planOpenFailed", "План открыть не удалось: его исполняет и правит только тот, кто принял предложение."),
    );

  const reject = () =>
    run(
      "reject",
      async () => {
        await rejectProposal(synthesisId, proposal.id, rejectNote.trim() || undefined);
        rejectStep.disarm();
        onChanged(proposal.id);
      },
      tl("proposals.decision.rejectFailed", "Не удалось отклонить предложение."),
    );

  const close = () =>
    run(
      "close",
      async () => {
        await closeProposal(synthesisId, proposal.id, stale ? "outdated" : "manual");
        closeStep.disarm();
        onChanged(proposal.id);
      },
      tl("proposals.decision.closeFailed", "Не удалось закрыть предложение."),
    );

  const withdraw = () =>
    run(
      "withdraw",
      async () => {
        await withdrawProposal(synthesisId, proposal.id);
        onChanged(proposal.id);
      },
      tl("proposals.decision.withdrawFailed", "Не удалось снять предложение."),
    );

  const rebase = () =>
    run(
      "rebase",
      async () => {
        const fresh = await rebaseProposal(synthesisId, proposal.id, {
          ...(proposal.kind === "replace" ? { value: rebaseValue } : {}),
          ...(rebaseRationale.trim() ? { rationale: rebaseRationale.trim() } : {}),
        });
        setRebaseOpen(false);
        onChanged(fresh.id);
      },
      tl("proposals.decision.rebaseFailed", "Не удалось завести новое предложение поверх текущего."),
    );

  // Разница: слева — ТЕКУЩЕЕ состояние адресата, справа — предлагаемое
  let diff: ProposalDiff | null = null;
  if (proposal.kind === "replace" && typeof proposal.value === "string" && current) {
    if (current.kind === "element" && proposal.field) diff = fieldDiff(proposal.field, current.fields[proposal.field] ?? "", proposal.value);
    else if (current.kind === "subsection") diff = subsectionDiff(current.html, proposal.value);
  }

  const acceptReady = proposal.kind === "replace" ? true : !!method && (!methodNeedsValue(method) || noteValue.trim().length > 0);
  const rejectCls = "action-btn danger";
  // классы — переменными до JSX: литерал вида адреса в выражении className
  // css-parity принял бы за класс (09 §6, 16.2)
  const markupCls = "form-textarea subsection-edit-source";
  const noteValueCls = method === "edit_subsection" ? markupCls : "form-textarea";
  const rebaseValueCls = proposal.address.kind === "subsection" ? markupCls : "form-textarea";

  return (
    <div className="inline-edit-form proposal-panel" data-testid="proposal-panel" data-proposal-id={proposal.id} data-proposal-status={proposal.status} data-proposal-stale={stale ? "1" : "0"}>
      <dl className="proposal-meta">
        <dt>{tl("proposals.decision.who", "Кто предложил")}</dt>
        <dd data-testid="proposal-author">
          {proposal.author.name}
          {authorNote(proposal.author) ? <span className="discuss-note"> · {authorNote(proposal.author)}</span> : null}
          <span className="discuss-note"> · {fmtWhen(proposal.createdAt)}</span>
        </dd>
        <dt>{tl("proposals.decision.what", "Что")}</dt>
        <dd>
          {num !== null ? tl("proposals.decision.numbered", "предложение № {num} · ", { num }) : ""}
          {kindLabel(proposal.kind)}
          {proposal.field ? ` · ${fieldLabel(proposal.field)}` : ""} — {addressLabel(proposal.address, sectionTitles)}
        </dd>
        <dt>{tl("proposals.decision.source", "Источник")}</dt>
        <dd data-testid="proposal-source">
          {sourceLabel(proposal.source)}
          {proposal.source === "review_finding" && proposal.sourceReviewId && (
            <>
              {" · "}
              <Link to={`/synthesis/${synthesisId}/reviews/${proposal.sourceReviewId}`} data-testid="proposal-source-link">
                {tl("proposals.decision.openReview", "открыть рецензию")}
              </Link>
            </>
          )}
          {proposal.source === "comment" && (
            <>
              {" · "}
              <button type="button" className="discuss-link" onClick={() => onDiscuss(proposal)} data-testid="proposal-source-link">
                {tl("proposals.decision.openThread", "открыть ветку у адреса")}
              </button>
            </>
          )}
        </dd>
        <dt>{tl("proposals.decision.base", "Основа и текущая версия")}</dt>
        <dd data-testid="proposal-base">{baseLine(proposal)}</dd>
        <dt>{tl("proposals.decision.status", "Состояние")}</dt>
        <dd data-testid="proposal-status">
          {statusLabel(proposal)}
          {proposal.decidedBy ? ` · ${proposal.decidedBy.name}` : ""}
          {proposal.decidedAt ? ` · ${fmtWhen(proposal.decidedAt)}` : ""}
        </dd>
      </dl>

      {proposal.rationale ? (
        <>
          <div className="form-sublabel">{tl("proposals.decision.rationale", "Основание")}</div>
          <UserText text={proposal.rationale} className="proposal-rationale" />
        </>
      ) : null}
      {proposal.note ? (
        <>
          <div className="form-sublabel">{tl("proposals.decision.deciderNote", "Слово решившего")}</div>
          <UserText text={proposal.note} className="proposal-rationale" />
        </>
      ) : null}

      {proposal.kind === "replace" &&
        (current === undefined ? (
          <div className="proposal-note">{tl("common.loading", "Загрузка…")}</div>
        ) : diff ? (
          <DiffBlock diff={diff} />
        ) : (
          <>
            <div className="form-sublabel">{tl("proposals.decision.proposedValue", "Предлагаемое значение (адресата сейчас нет — сравнить не с чем)")}</div>
            <div className="diff"><div className="diff-line add">{proposal.value}</div></div>
          </>
        ))}
      {proposal.kind === "replace" && stale && proposal.excerpt ? (
        <div className="proposal-note" data-testid="proposal-excerpt">{tl("proposals.decision.excerptWas", "Как было, когда предложение писали: {excerpt}", { excerpt: proposal.excerpt })}</div>
      ) : null}

      {stale && (
        <div className="callout warning" data-testid="proposal-stale-note">
          <span className="callout-label">{tl("proposals.decision.staleLabel", "Устарело")}</span>
          {tl("proposals.decision.staleText", "Адресат изменили после записи предложения — принять его нельзя: оно написано к прежней версии. Автор может завести новое поверх текущего; иначе предложение закрывают.")}
        </div>
      )}
      {inPlan && (
        <div className="callout note" data-testid="proposal-inplan-note">
          <span className="callout-label">{tl("proposals.decision.inPlanLabel", "В черновике плана")}</span>
          {tl("proposals.decision.inPlanText", "Предложение принято в черновик плана правок, но ещё не исполнено: документ не менялся. «Принято» станет после исполнения плана.")}
        </div>
      )}

      {error && <div className="pool-status err" role="alert" data-testid="proposal-error">{error}</div>}

      {/* Выбор способа — у замечания; у готовой замены способ определён адресатом */}
      {acceptOpen && proposal.kind === "note" && (
        <div className="proposal-accept" data-testid="proposal-accept-form">
          <div className="form-sublabel">{tl("proposals.decision.chooseMethod", "Как исполнить замечание — решаете вы")}</div>
          {methods.map((m) => (
            <label key={m} className="proposal-kind-option">
              <input type="radio" name={`method-${proposal.id}`} checked={method === m} onChange={() => setMethod(m)} data-testid={`proposal-method-${m}`} />
              {methodLabel(m)}
              {methodIsPaid(m) ? <span className="discuss-note"> · {tl("proposals.decision.paidByYou", "обращение к модели — по вашей квоте")}</span> : <span className="discuss-note"> · {tl("proposals.decision.free", "бесплатно")}</span>}
            </label>
          ))}
          {method && (method === "edit_element" || method === "refine_element") && noteFields.length > 1 && (
            <>
              <label className="form-label" htmlFor={`note-field-${proposal.id}`}>{tl("proposals.decision.noteField", "Поле элемента")}</label>
              <select id={`note-field-${proposal.id}`} className="form-select" value={noteField} onChange={(e) => setNoteField(e.target.value)} data-testid="proposal-note-field">
                {noteFields.map((f) => (
                  <option key={f} value={f}>{fieldLabel(f)}</option>
                ))}
              </select>
            </>
          )}
          {method && methodNeedsValue(method) && (
            <>
              <label className="form-label" htmlFor={`note-value-${proposal.id}`}>
                {method === "edit_subsection" ? tl("proposals.decision.noteValueSubsection", "Новый текст подраздела (разметка содержимого)") : tl("proposals.decision.noteValueField", "Новое значение поля")}
              </label>
              <textarea
                id={`note-value-${proposal.id}`}
                className={noteValueCls}
                rows={method === "edit_subsection" ? 10 : 4}
                value={noteValue}
                placeholder={current?.kind === "element" ? (current.fields[noteField] ?? "") : ""}
                onChange={(e) => setNoteValue(e.target.value)}
                data-testid="proposal-note-value"
              />
              {current && noteValue === "" && (current.kind === "element" || current.kind === "subsection") && (
                <button type="button" className="discuss-link" onClick={() => setNoteValue(current.kind === "element" ? (current.fields[noteField] ?? "") : current.kind === "subsection" ? current.html : "")} data-testid="proposal-note-prefill">
                  {tl("proposals.decision.prefillCurrent", "подставить текущее значение")}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {rebaseOpen && (
        <div className="proposal-accept" data-testid="proposal-rebase-form">
          <div className="form-sublabel">{tl("proposals.decision.rebaseTitle", "Новое предложение поверх текущего состояния")}</div>
          {proposal.kind === "replace" && (
            <>
              {diff && <DiffBlock diff={current?.kind === "subsection" ? subsectionDiff(current.html, rebaseValue) : fieldDiff(proposal.field ?? "", current?.kind === "element" ? (current.fields[proposal.field ?? ""] ?? "") : "", rebaseValue)} />}
              <textarea className={rebaseValueCls} rows={proposal.address.kind === "subsection" ? 10 : 4} value={rebaseValue} onChange={(e) => setRebaseValue(e.target.value)} data-testid="proposal-rebase-value" />
            </>
          )}
          <label className="form-label" htmlFor={`rebase-rat-${proposal.id}`}>{tl("proposals.decision.rebaseRationale", "Обоснование")}</label>
          <textarea id={`rebase-rat-${proposal.id}`} className="form-textarea" rows={3} value={rebaseRationale} onChange={(e) => setRebaseRationale(e.target.value)} data-testid="proposal-rebase-rationale" />
          <div className="inline-edit-actions">
            <button type="button" className="action-btn primary" disabled={busy !== null} onClick={() => void rebase()} data-testid="proposal-rebase-submit">
              {tl("proposals.decision.rebaseSubmit", "Завести новое")}
            </button>
            <button type="button" className="action-btn" disabled={busy !== null} onClick={() => setRebaseOpen(false)}>{tl("common.cancel", "Отмена")}</button>
          </div>
        </div>
      )}

      <div className="inline-edit-actions proposal-actions">
        {/* Принять: только открытое, не устаревшее, не стоящее в плане; правящему */}
        {canEdit && open && !stale && !inPlan && methods.length > 0 && (
          proposal.kind === "note" && !acceptOpen ? (
            <button type="button" className="action-btn primary" disabled={live || busy !== null} onClick={() => setAcceptOpen(true)} data-testid="proposal-accept">
              {tl("proposals.decision.accept", "Принять")}
            </button>
          ) : (
            <button
              type="button"
              className="action-btn primary"
              disabled={live || busy !== null || !acceptReady}
              title={live ? tl("proposals.decision.acceptLocked", "Идёт генерация — план собрать нельзя") : tl("proposals.decision.acceptHint", "Соберёт черновик плана правок: влияние и каскад покажет предпросмотр, документ изменится только после исполнения")}
              onClick={() => void accept()}
              data-testid={proposal.kind === "note" ? "proposal-accept-confirm" : "proposal-accept"}
            >
              {busy === "accept" ? tl("proposals.decision.accepting", "Собираю план…") : proposal.kind === "note" ? tl("proposals.decision.acceptToPlan", "Собрать план") : tl("proposals.decision.accept", "Принять")}
            </button>
          )
        )}
        {inPlan && canEdit && (
          <button type="button" className="action-btn primary" disabled={live || busy !== null} onClick={() => void openPlan()} data-testid="proposal-open-plan">
            {tl("proposals.decision.openPlan", "Открыть план")}
          </button>
        )}
        <button type="button" className="action-btn" disabled={busy !== null} onClick={() => onDiscuss(proposal)} data-testid="proposal-discuss">
          {tl("proposals.decision.discuss", "Обсудить")}
        </button>
        {stale && isAuthor && !rebaseOpen && (
          <button type="button" className="action-btn" disabled={busy !== null} onClick={() => setRebaseOpen(true)} data-testid="proposal-rebase">
            {tl("proposals.decision.rebase", "Новое поверх текущего")}
          </button>
        )}
        {open && isAuthor && !inPlan && (
          <button type="button" className="action-btn" disabled={busy !== null} onClick={() => void withdraw()} data-testid="proposal-withdraw">
            {tl("proposals.decision.withdraw", "Снять")}
          </button>
        )}
        {/* Отклонить — второй шаг (решение человека по существу); у устаревшего — «Закрыть» */}
        {canEdit && open && !stale && !inPlan && (
          <span className="proposal-second-step" ref={rejectStep.ref as React.RefObject<HTMLSpanElement>}>
            {rejectStep.armed ? (
              <>
                <input className="form-input proposal-reject-note" value={rejectNote} placeholder={tl("proposals.decision.rejectNotePlaceholder", "почему (необязательно)")} onChange={(e) => setRejectNote(e.target.value)} data-testid="proposal-reject-note" />
                <button type="button" className={rejectCls} disabled={busy !== null} onClick={() => void reject()} data-testid="proposal-reject-confirm">
                  {tl("proposals.decision.rejectConfirm", "Точно отклонить?")}
                </button>
                <button type="button" className="action-btn" disabled={busy !== null} onClick={rejectStep.disarm} data-testid="proposal-reject-cancel">{tl("common.cancel", "Отмена")}</button>
              </>
            ) : (
              <button type="button" className={rejectCls} disabled={busy !== null} onClick={() => rejectStep.arm(true)} data-testid="proposal-reject">
                {tl("proposals.decision.reject", "Отклонить")}
              </button>
            )}
          </span>
        )}
        {canEdit && stale && (
          <span className="proposal-second-step" ref={closeStep.ref as React.RefObject<HTMLSpanElement>}>
            {closeStep.armed ? (
              <>
                <button type="button" className={rejectCls} disabled={busy !== null} onClick={() => void close()} data-testid="proposal-close-confirm">
                  {tl("proposals.decision.closeConfirm", "Точно закрыть?")}
                </button>
                <button type="button" className="action-btn" disabled={busy !== null} onClick={closeStep.disarm}>{tl("common.cancel", "Отмена")}</button>
              </>
            ) : (
              <button type="button" className={rejectCls} disabled={busy !== null} onClick={() => closeStep.arm(true)} data-testid="proposal-close">
                {tl("proposals.decision.close", "Закрыть")}
              </button>
            )}
          </span>
        )}
      </div>

      {detail && detail.events.length > 0 && (
        <details className="sec-disclosure proposal-events" data-testid="proposal-events">
          <summary>{tl("proposals.decision.events", "Журнал предложения ({n})", { n: detail.events.length })}</summary>
          <div className="disclosure-body">
            {detail.events.map((ev) => (
              <div key={ev.id} className="proposal-event" data-event-type={ev.type}>
                <span className="discuss-note">{fmtWhen(ev.createdAt)}</span> · {ev.actor ? ev.actor.name : tl("proposals.decision.eventService", "служба")} — {eventText(ev)}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
