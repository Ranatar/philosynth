/**
 * Страница регистрации. Беседа 0.4: минимальная рабочая форма.
 * Валидация полей — серверная (routes/auth.ts: email-формат,
 * пароль ≥ 8 символов); клиент показывает error + details.
 *
 * Беседа 16.2 (п. 1, 3): регистрация по приглашению — /register?invite=<довод>.
 * GET /auth/invitations/:token показывает врезку «X приглашает вас в
 * концепцию «…» в роли …»; адрес подставляется и заперт (участие
 * возникает только на адрес приглашения — сервер сверяет). Довод уходит в
 * POST /auth/register (inviteToken); после регистрации и входа — на
 * страницу принятия /invitations/:synthesisId. Недействительный довод —
 * врезка-предупреждение, регистрация идёт обычная.
 */
import { PASSWORD_MIN_LENGTH } from "@philosynth/shared/constants/auth";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import type { InvitationInfo } from "@philosynth/shared/types/notifications";
import { getInvitationInfo } from "../api/members";
import { roleLabel } from "../components/synthesis/MembersPanel";
import { useAuthStore } from "../stores/auth-store";
import { tl } from "@philosynth/shared/i18n/t";

type InviteState = { kind: "none" } | { kind: "loading" } | { kind: "ok"; info: InvitationInfo } | { kind: "invalid" };

export function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const { register, pending, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite") ?? "";
  const [invite, setInvite] = useState<InviteState>(inviteToken ? { kind: "loading" } : { kind: "none" });
  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    getInvitationInfo(inviteToken)
      .then((info) => {
        if (cancelled) return;
        setInvite({ kind: "ok", info });
        setEmail(info.email);
      })
      .catch(() => {
        if (!cancelled) setInvite({ kind: "invalid" });
      });
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);
  const emailLocked = invite.kind === "ok";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await register(email, password, displayName || undefined, emailLocked ? inviteToken : undefined);
    if (!ok) return;
    const applied = useAuthStore.getState().registeredInvitation;
    if (applied) navigate(`/invitations/${applied.synthesisId}`, { replace: true });
    else navigate("/catalog", { replace: true });
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="site-header auth-header">
          <div>
            <h1 className="brand-name">
              {tl("common.brandPhilo", "Philo")}<span>{tl("common.brandSynth", "Synth")}</span>
            </h1>
            <div className="brand-tagline">{tl("registerPage.registrationLower", "регистрация")}</div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="input-form"
        >
          {invite.kind === "loading" && <span className="meta-label">{tl("registerPage.inviteChecking", "проверка приглашения…")}</span>}
          {invite.kind === "ok" && (
            <div className="callout note" data-testid="register-invite">
              <span className="callout-label">{tl("registerPage.inviteLabel", "Приглашение")}</span>
              {tl("registerPage.inviteLead", "{inviter} приглашает вас в концепцию «{title}» в роли «{role}». Зарегистрируйтесь на адрес {email} — приглашение будет ждать вас после входа.", {
                inviter: invite.info.inviterName,
                title: invite.info.synthesisTitle,
                role: roleLabel(invite.info.role),
                email: invite.info.email,
              })}
            </div>
          )}
          {invite.kind === "invalid" && (
            <div className="callout warning" data-testid="register-invite-invalid">
              {tl("registerPage.inviteInvalid", "Ссылка приглашения недействительна — просрочена, отозвана или уже использована. Регистрация возможна и без неё; владелец концепции сможет пригласить вас снова.")}
            </div>
          )}
          <label className="form-group">
            <span className="form-label">{tl("common.email", "Email")}</span>
            <input
              type="email"
              required
              autoComplete="email"
              readOnly={emailLocked}
              data-locked={emailLocked ? "" : undefined}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) clearError();
              }}
              className="form-input"
            />
          </label>

          <label className="form-group">
            <span className="form-label">{tl("registerPage.passwordMinLength", "Пароль (не короче {minLength} символов)", { minLength: PASSWORD_MIN_LENGTH })}</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) clearError();
              }}
              className="form-input"
            />
          </label>

          <label className="form-group">
            <span className="form-label">{tl("registerPage.displayNameOptional", "Отображаемое имя (необязательно)")}</span>
            <input
              type="text"
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="form-input"
            />
          </label>

          {error && (
            <div role="alert" className="callout warning">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="submit-btn"
            style={{ justifyContent: "center", marginTop: 8 }}
          >
            {pending ? tl("common.creating", "Создание…") : tl("common.createAccount", "Создать аккаунт")}
          </button>

          <p className="submit-note" style={{ textAlign: "center", maxWidth: "100%" }}>
            {tl("registerPage.haveAccount", "Уже есть аккаунт?")} <Link to="/login">{tl("common.logIn", "Войти")}</Link>
            {" · "}
            <Link to="/">{tl("common.toHome", "На главную")}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
