/**
 * Вкладка «Участники» страницы концепции — только владельцу (беседа 16.2,
 * первый запрос, п. 3; врезка «Фаза 16»: управление правами — главное).
 *
 *  - список участников: имя/адрес, роль, статус (приглашён / участник),
 *    даты; отдельно — ждущие приглашения адресам без аккаунта;
 *  - пригласить: email + роль (рецензент | редактор) → POST /members;
 *    409 — строкой под формой (владелец, уже участник, уже приглашён);
 *  - сменить роль — <select> в строке, PATCH сразу;
 *  - отозвать приглашение (без второго шага: обратимо — можно пригласить
 *    снова) / исключить участника — ВТОРОЙ ШАГ (useSecondStep, Д-17);
 *  - повторить письмо — приглашённому с аккаунтом и адресу без аккаунта
 *    (адресу без аккаунта — новый довод, прежняя ссылка гаснет).
 *
 * Таблица — .data-table (набор 6.2, блок 3); новые правила — блок
 * «Беседа 16.2» в globals.css. Фразы — tl(); правило 8.4 (второй шаг).
 */
import { useCallback, useEffect, useState } from "react";

import { MEMBER_ROLES, type MemberRole } from "@philosynth/shared/constants/discussion";
import type { MemberView, MembersView, PendingInvitation } from "@philosynth/shared/types/notifications";
import { tl } from "@philosynth/shared/i18n/t";

import { ApiError } from "../../api/client";
import {
  changeMemberRole,
  inviteMember,
  listMembers,
  removeMember,
  resendInvitation,
  resendMemberInvite,
  revokeInvitation,
} from "../../api/members";
import { useSecondStep } from "../../hooks/useSecondStep";
import { LoadingSpinner } from "../shared/LoadingSpinner";

export function roleLabel(role: MemberRole): string {
  return role === "editor" ? tl("members.roleEditor", "редактор") : tl("members.roleReviewer", "рецензент");
}

export function memberStatusLabel(status: "invited" | "active"): string {
  return status === "active" ? tl("members.statusActive", "участник") : tl("members.statusInvited", "приглашён");
}

const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString();

function errorText(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  if (err.code === "VALIDATION_ERROR") {
    const d = err.details as Record<string, unknown> | undefined;
    const first = d && typeof d === "object" ? Object.values(d).find((v) => typeof v === "string") : undefined;
    if (typeof first === "string") return first;
  }
  return err.message || fallback;
}

interface MembersPanelProps {
  synthesisId: string;
}

export function MembersPanel({ synthesisId }: MembersPanelProps) {
  const [view, setView] = useState<MembersView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("reviewer");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState<string | null>(null);

  /** Текущее действие над строкой (ключ строки) и его ошибка/заметка */
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [rowNote, setRowNote] = useState<{ key: string; text: string; warn: boolean } | null>(null);
  const excludeStep = useSecondStep<string>(busyRow !== null);

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      setView(await listMembers(synthesisId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tl("members.loadFailed", "Не удалось загрузить участников."));
    } finally {
      setLoading(false);
    }
  }, [synthesisId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (inviting) return;
    setInviting(true);
    setInviteError(null);
    setInviteNote(null);
    try {
      const res = await inviteMember(synthesisId, email.trim(), role);
      setEmail("");
      setInviteNote(
        res.kind === "member"
          ? res.sent
            ? tl("members.invitedSent", "Приглашение отправлено: {email}", { email: res.member.email })
            : tl("members.invitedNoMail", "Участник приглашён, но письмо не поставлено — повторите письмо из списка")
          : res.sent
            ? tl("members.inviteLinkSent", "На {email} отправлена ссылка для регистрации", { email: res.invitation.email })
            : tl("members.inviteLinkNoMail", "Приглашение создано, но письмо не поставлено — повторите письмо из списка"),
      );
      await reload(true);
    } catch (err) {
      setInviteError(errorText(err, tl("members.inviteFailed", "Не удалось пригласить.")));
    } finally {
      setInviting(false);
    }
  }

  async function runRow(key: string, fn: () => Promise<string | null>, fallback: string) {
    if (busyRow) return;
    setBusyRow(key);
    setRowNote(null);
    try {
      const note = await fn();
      await reload(true);
      if (note) setRowNote({ key, text: note, warn: false });
    } catch (err) {
      setRowNote({ key, text: errorText(err, fallback), warn: true });
    } finally {
      setBusyRow(null);
      excludeStep.disarm();
    }
  }

  const onRoleChange = (m: MemberView, next: MemberRole) =>
    runRow(m.id, async () => {
      await changeMemberRole(synthesisId, m.id, next);
      return null;
    }, tl("members.roleChangeFailed", "Не удалось сменить роль."));

  const onRemove = (m: MemberView) =>
    runRow(m.id, async () => {
      await removeMember(synthesisId, m.id);
      return null;
    }, tl("members.removeFailed", "Не удалось удалить участника."));

  const onResendMember = (m: MemberView) =>
    runRow(m.id, async () => {
      const r = await resendMemberInvite(synthesisId, m.id);
      return r.sent ? tl("members.letterSent", "Письмо отправлено") : tl("members.letterNotQueued", "Письмо не поставлено — попробуйте позже");
    }, tl("members.resendFailed", "Не удалось отправить письмо."));

  const onRevokeInvitation = (inv: PendingInvitation) =>
    runRow(inv.id, async () => {
      await revokeInvitation(synthesisId, inv.id);
      return null;
    }, tl("members.revokeFailed", "Не удалось отозвать приглашение."));

  const onResendInvitation = (inv: PendingInvitation) =>
    runRow(inv.id, async () => {
      const r = await resendInvitation(synthesisId, inv.id);
      return r.sent ? tl("members.letterSent", "Письмо отправлено") : tl("members.letterNotQueued", "Письмо не поставлено — попробуйте позже");
    }, tl("members.resendFailed", "Не удалось отправить письмо."));

  const noteRow = (key: string) =>
    rowNote && rowNote.key === key ? (
      <div className={rowNote.warn ? "members-row-note warn" : "members-row-note"} role={rowNote.warn ? "alert" : "status"}>
        {rowNote.text}
      </div>
    ) : null;

  return (
    <div className="members-panel" data-testid="members-panel">
      <form onSubmit={handleInvite} className="input-form" data-testid="invite-form">
        <div className="form-section-title">{tl("members.inviteTitle", "Пригласить участника")}</div>
        <p className="submit-note" style={{ maxWidth: "100%" }}>
          {tl("members.inviteHint", "Участник видит концепцию целиком, в том числе приватную, может комментировать и рецензировать; документ обсуждением не меняется. Адресу без аккаунта уйдёт ссылка для регистрации.")}
        </p>
        <div className="members-invite-row">
          <input
            type="email"
            required
            className="form-input"
            placeholder={tl("common.email", "Email")}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (inviteError) setInviteError(null);
            }}
            data-testid="invite-email"
          />
          <select
            className="form-select"
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
            data-testid="invite-role"
          >
            {MEMBER_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
          <button type="submit" className="action-btn primary" disabled={inviting || !email.trim()} data-testid="invite-submit">
            {inviting ? tl("members.inviting", "Отправка…") : tl("members.inviteBtn", "Пригласить")}
          </button>
        </div>
        {inviteError && (
          <p role="alert" className="callout warning" data-testid="invite-error">
            {inviteError}
          </p>
        )}
        {inviteNote && (
          <p role="status" className="callout note" data-testid="invite-note">
            {inviteNote}
          </p>
        )}
      </form>

      {loading ? (
        <LoadingSpinner label={tl("members.loading", "загрузка участников…")} />
      ) : error ? (
        <div className="callout warning">
          <span className="callout-label">{tl("common.error", "Ошибка")}</span>
          {error}
        </div>
      ) : view ? (
        <>
          <div className="form-section-title">
            {tl("members.listTitle", "Участники ({count})", { count: view.members.length })}
          </div>
          {view.members.length === 0 && view.invitations.length === 0 ? (
            <p className="pool-status" data-testid="members-empty">
              {tl("members.empty", "Участников пока нет — пригласите первого по адресу выше.")}
            </p>
          ) : (
            <div className="data-table-wrap" ref={excludeStep.ref as React.RefObject<HTMLDivElement>}>
              <table className="data-table members-table" data-testid="members-table">
                <thead>
                  <tr>
                    <th>{tl("members.colWho", "Кто")}</th>
                    <th>{tl("members.colRole", "Роль")}</th>
                    <th>{tl("members.colStatus", "Статус")}</th>
                    <th>{tl("members.colDates", "Даты")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {view.members.map((m) => {
                    const busy = busyRow === m.id;
                    const armed = excludeStep.armed === m.id;
                    return (
                      <tr key={m.id} data-testid="member-row" data-status={m.status}>
                        <td>
                          <div className="members-who">
                            <span>{m.displayName}</span>
                            {m.email && m.email !== m.displayName && <span className="members-email">{m.email}</span>}
                          </div>
                        </td>
                        <td>
                          <select
                            className="form-select"
                            value={m.role}
                            disabled={busy}
                            onChange={(e) => void onRoleChange(m, e.target.value as MemberRole)}
                            data-testid="member-role"
                          >
                            {MEMBER_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {roleLabel(r)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <span className={m.status === "active" ? "cert-badge gold" : "cert-badge"} data-testid="member-status">
                            {memberStatusLabel(m.status)}
                          </span>
                        </td>
                        <td className="members-dates">
                          {tl("members.invitedAt", "приглашён {date}", { date: fmtDate(m.invitedAt) })}
                          {m.acceptedAt ? ` · ${tl("members.acceptedAt", "принял {date}", { date: fmtDate(m.acceptedAt) })}` : ""}
                        </td>
                        <td>
                          <div className="members-actions">
                            {m.status === "invited" && (
                              <>
                                <button type="button" className="action-btn" disabled={busy} onClick={() => void onResendMember(m)} data-testid="member-resend">
                                  {tl("members.resend", "Письмо ещё раз")}
                                </button>
                                <button type="button" className="action-btn" disabled={busy} onClick={() => void onRemove(m)} data-testid="member-revoke">
                                  {tl("members.revoke", "Отозвать")}
                                </button>
                              </>
                            )}
                            {m.status === "active" &&
                              (armed ? (
                                <>
                                  <button type="button" className="action-btn danger" disabled={busy} onClick={() => void onRemove(m)} data-testid="member-exclude-confirm">
                                    {busy ? tl("members.excluding", "Исключение…") : tl("members.excludeConfirm", "Точно исключить?")}
                                  </button>
                                  <button type="button" className="action-btn" disabled={busy} onClick={excludeStep.disarm} data-testid="member-exclude-cancel">
                                    {tl("common.cancel", "Отмена")}
                                  </button>
                                </>
                              ) : (
                                <button type="button" className="action-btn danger" disabled={busy} onClick={() => excludeStep.arm(m.id)} data-testid="member-exclude">
                                  {tl("members.exclude", "Исключить")}
                                </button>
                              ))}
                          </div>
                          {armed && (
                            <div className="transform-warn" data-testid="member-exclude-warn">
                              {tl("members.excludeWarn", "Участник потеряет доступ к приватной концепции и обсуждению; его комментарии и рецензии останутся с пометкой «бывший участник».")}
                            </div>
                          )}
                          {noteRow(m.id)}
                        </td>
                      </tr>
                    );
                  })}
                  {view.invitations.map((inv) => {
                    const busy = busyRow === inv.id;
                    return (
                      <tr key={inv.id} data-testid="invitation-row">
                        <td>
                          <div className="members-who">
                            <span>{inv.email}</span>
                            <span className="members-email">{tl("members.noAccountYet", "аккаунта ещё нет")}</span>
                          </div>
                        </td>
                        <td>{roleLabel(inv.role)}</td>
                        <td>
                          <span className="cert-badge" data-testid="invitation-status">
                            {tl("members.statusLinkSent", "ссылка отправлена")}
                          </span>
                        </td>
                        <td className="members-dates">
                          {tl("members.invitedAt", "приглашён {date}", { date: fmtDate(inv.createdAt) })}
                          {` · ${tl("members.expiresAt", "до {date}", { date: fmtDate(inv.expiresAt) })}`}
                        </td>
                        <td>
                          <div className="members-actions">
                            <button type="button" className="action-btn" disabled={busy} onClick={() => void onResendInvitation(inv)} data-testid="invitation-resend">
                              {tl("members.resend", "Письмо ещё раз")}
                            </button>
                            <button type="button" className="action-btn" disabled={busy} onClick={() => void onRevokeInvitation(inv)} data-testid="invitation-revoke">
                              {tl("members.revoke", "Отозвать")}
                            </button>
                          </div>
                          {noteRow(inv.id)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
