/**
 * Страница принятия приглашения — /invitations/:synthesisId (беседа 16.2,
 * первый запрос, п. 3). Под входом (RequireAuth): ссылка из письма ведёт
 * сюда; гостя RequireAuth отправит на «/» с from, после входа он вернётся.
 *
 *  - GET /syntheses/:id/membership → концепция, кто зовёт, роль, статус;
 *    404 — «приглашения нет» (отозвано владельцем или отклонено);
 *  - «Принять» → POST /membership/accept → участие действующее, ссылка на
 *    концепцию; «Отклонить» → POST /membership/decline → строка удалена,
 *    в каталог;
 *  - уже действующий участник — сразу ссылка на концепцию (повторный
 *    переход по письму).
 * Страница внутри Layout (шапка и меню на месте — человек уже вошёл);
 * карточка .invitation-card — блок «Беседа 16.2» в globals.css.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { MyMembership } from "@philosynth/shared/types/notifications";
import { tl } from "@philosynth/shared/i18n/t";

import { ApiError } from "../api/client";
import { acceptInvitation, declineInvitation, getMyMembership } from "../api/members";
import { roleLabel } from "../components/synthesis/MembersPanel";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";

type Phase =
  | { kind: "loading" }
  | { kind: "ready"; m: MyMembership }
  | { kind: "declined" }
  | { kind: "missing" }
  | { kind: "error"; text: string };

export function InvitationPage() {
  const { synthesisId = "" } = useParams<{ synthesisId: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyMembership(synthesisId)
      .then((m) => {
        if (!cancelled) setPhase({ kind: "ready", m });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === "NOT_FOUND") setPhase({ kind: "missing" });
        else setPhase({ kind: "error", text: err instanceof ApiError ? err.message : tl("invitationPage.loadFailed", "Не удалось загрузить приглашение.") });
      });
    return () => {
      cancelled = true;
    };
  }, [synthesisId]);

  async function onAccept() {
    if (busy) return;
    setBusy("accept");
    setActionError(null);
    try {
      const m = await acceptInvitation(synthesisId);
      setPhase({ kind: "ready", m });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tl("invitationPage.acceptFailed", "Не удалось принять приглашение."));
    } finally {
      setBusy(null);
    }
  }

  async function onDecline() {
    if (busy) return;
    setBusy("decline");
    setActionError(null);
    try {
      await declineInvitation(synthesisId);
      setPhase({ kind: "declined" });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tl("invitationPage.declineFailed", "Не удалось отклонить приглашение."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="form-section-title" style={{ border: "none" }}>
        {tl("invitationPage.title", "Приглашение в концепцию")}
      </h1>
      <div className="invitation-card">
        <div className="input-form" data-testid="invitation-page" data-phase={phase.kind}>
          {phase.kind === "loading" && <LoadingSpinner label={tl("invitationPage.loading", "загрузка приглашения…")} />}

          {phase.kind === "missing" && (
            <>
              <div role="alert" className="callout warning">
                {tl("invitationPage.missing", "Приглашения в эту концепцию у вас нет — возможно, владелец его отозвал или оно уже отклонено.")}
              </div>
              <p className="submit-note" style={{ textAlign: "center", maxWidth: "100%" }}>
                <Link to="/catalog">{tl("invitationPage.toCatalog", "В каталог")}</Link>
              </p>
            </>
          )}

          {phase.kind === "error" && (
            <div role="alert" className="callout warning">
              {phase.text}
            </div>
          )}

          {phase.kind === "declined" && (
            <>
              <p role="status" className="callout note">
                {tl("invitationPage.declined", "Приглашение отклонено. Владелец сможет пригласить вас снова.")}
              </p>
              <p className="submit-note" style={{ textAlign: "center", maxWidth: "100%" }}>
                <Link to="/catalog">{tl("invitationPage.toCatalog", "В каталог")}</Link>
              </p>
            </>
          )}

          {phase.kind === "ready" && (
            <>
              <div className="form-section-title">{phase.m.synthesis.title}</div>
              <p className="submit-note" style={{ maxWidth: "100%" }} data-testid="invitation-lead">
                {phase.m.member.status === "active"
                  ? tl("invitationPage.alreadyMember", "Вы участник этой концепции · роль: {role} · владелец: {owner}", {
                      role: roleLabel(phase.m.member.role),
                      owner: phase.m.synthesis.ownerName,
                    })
                  : tl("invitationPage.lead", "{owner} приглашает вас участвовать в обсуждении концепции в роли «{role}». Участник видит концепцию целиком, в том числе приватную, может комментировать и рецензировать; документ обсуждением не меняется.", {
                      owner: phase.m.synthesis.ownerName,
                      role: roleLabel(phase.m.member.role),
                    })}
              </p>
              {actionError && (
                <p role="alert" className="callout warning">
                  {actionError}
                </p>
              )}
              <div className="actions-bar-btns" style={{ marginTop: 4 }}>
                {phase.m.member.status === "active" ? (
                  <button type="button" className="action-btn primary" onClick={() => navigate(`/synthesis/${synthesisId}`)} data-testid="invitation-open">
                    {tl("invitationPage.openConcept", "Открыть концепцию")}
                  </button>
                ) : (
                  <>
                    <button type="button" className="action-btn primary" disabled={busy !== null} onClick={() => void onAccept()} data-testid="invitation-accept">
                      {busy === "accept" ? tl("invitationPage.accepting", "Принятие…") : tl("invitationPage.accept", "Принять")}
                    </button>
                    <button type="button" className="action-btn" disabled={busy !== null} onClick={() => void onDecline()} data-testid="invitation-decline">
                      {busy === "decline" ? tl("invitationPage.declining", "Отклонение…") : tl("invitationPage.decline", "Отклонить")}
                    </button>
                  </>
                )}
                <Link to="/catalog" className="action-btn">
                  {tl("invitationPage.toCatalog", "В каталог")}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
