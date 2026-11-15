/**
 * Вкладка «Предложения» (беседа 17.2, п.2): открытые, устаревшие, решённые.
 * Участникам (capabilities.discuss). Строка раскрывает панель решения НА
 * МЕСТЕ (правило кита); решать (принять, отклонить, закрыть) может только
 * правящий — сервер проверяет то же.
 */
import { Fragment, useEffect, useMemo, useState } from "react";

import { tl } from "@philosynth/shared/i18n/t";
import type { EditPlan } from "@philosynth/shared/types/edit-plan";
import type { Proposal } from "@philosynth/shared/types/proposals";

import { proposalNumberIn } from "../../stores/collab-store";
import { addressLabel, fmtWhen } from "../../utils/discussion";
import { groupLabel, groupProposals, kindLabel, sourceLabel, statusLabel, type ProposalGroup } from "../../utils/proposals";
import { ProposalDecisionPanel } from "./ProposalDecisionPanel";

export interface ProposalsTabProps {
  synthesisId: string;
  proposals: Proposal[] | null;
  error: string | null;
  me: string | null;
  canEdit: boolean;
  live: boolean;
  sectionTitles: Readonly<Record<string, string>>;
  /** Предложение, которое нужно раскрыть (переход из панели адреса, после «нового поверх текущего») */
  focusId: string | null;
  onPlanReady: (plan: EditPlan, names: Record<string, string>) => void;
  onDiscuss: (p: Proposal) => void;
  onChanged: (focusId?: string) => void;
}

const GROUPS: readonly ProposalGroup[] = ["open", "stale", "decided"];

export function ProposalsTab({ synthesisId, proposals, error, me, canEdit, live, sectionTitles, focusId, onPlanReady, onDiscuss, onChanged }: ProposalsTabProps) {
  const [openId, setOpenId] = useState<string | null>(focusId);
  useEffect(() => {
    if (focusId) setOpenId(focusId);
  }, [focusId]);
  const groups = useMemo(() => groupProposals(proposals ?? []), [proposals]);

  if (error) return <div className="pool-status err" role="alert" data-testid="proposals-error">{error}</div>;
  if (!proposals) return <div className="data-table-empty" data-testid="proposals-loading">{tl("common.loading", "Загрузка…")}</div>;

  return (
    <div className="input-form proposals-tab" data-testid="proposals-tab">
      <div className="form-section-title">{tl("proposals.tab.title", "Предложения изменений")}</div>
      <div className="proposal-note">
        {tl("proposals.tab.lead", "Предложение документ не меняет. Принятое исполняется планом правок — с предпросмотром каскада и подтверждением; платит тот, кто исполняет.")}
      </div>
      {proposals.length === 0 && (
        <div className="data-table-empty" data-testid="proposals-empty">
          {tl("proposals.tab.empty", "Предложений пока нет. Предложить изменение можно из панели обсуждения у любого места документа и из замечания рецензии.")}
        </div>
      )}
      {GROUPS.map((g) =>
        groups[g].length === 0 ? null : (
          <div key={g} data-testid={`proposals-group-${g}`} data-count={groups[g].length}>
            <div className="form-sublabel proposals-group-title">
              {groupLabel(g)} · {groups[g].length}
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="num">{tl("proposals.tab.colNum", "№")}</th>
                    <th>{tl("proposals.tab.colAddress", "Адрес")}</th>
                    <th>{tl("proposals.tab.colKind", "Вид")}</th>
                    <th>{tl("proposals.tab.colAuthor", "Автор")}</th>
                    <th>{tl("proposals.tab.colSource", "Источник")}</th>
                    <th>{tl("proposals.tab.colStatus", "Состояние")}</th>
                    <th>{tl("proposals.tab.colDate", "Дата")}</th>
                  </tr>
                </thead>
                <tbody>
                  {groups[g].map((p) => {
                    const active = openId === p.id;
                    const rowCls = active ? "proposal-row active" : "proposal-row";
                    const isStale = g === "stale";
                    const badgeCls = isStale ? "cert-badge gold" : "cert-badge";
                    return (
                      <Fragment key={p.id}>
                        <tr
                          className={rowCls}
                          role="button"
                          tabIndex={0}
                          data-testid="proposal-row"
                          data-proposal-id={p.id}
                          data-proposal-group={g}
                          onClick={() => setOpenId(active ? null : p.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setOpenId(active ? null : p.id);
                            }
                          }}
                        >
                          <td className="num">{proposalNumberIn(proposals, p.id)}</td>
                          <td>{addressLabel(p.address, sectionTitles)}</td>
                          <td>{kindLabel(p.kind)}</td>
                          <td>{p.author.name}</td>
                          <td>{sourceLabel(p.source)}</td>
                          <td><span className={badgeCls}>{statusLabel(p)}</span></td>
                          <td>{fmtWhen(p.createdAt)}</td>
                        </tr>
                        {active && (
                          <tr className="proposal-row-panel">
                            <td colSpan={7}>
                              <ProposalDecisionPanel
                                synthesisId={synthesisId}
                                proposal={p}
                                num={proposalNumberIn(proposals, p.id)}
                                me={me}
                                canEdit={canEdit}
                                live={live}
                                sectionTitles={sectionTitles}
                                onPlanReady={onPlanReady}
                                onDiscuss={onDiscuss}
                                onChanged={onChanged}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ),
      )}
    </div>
  );
}
