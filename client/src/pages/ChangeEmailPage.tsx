/**
 * Подтверждение смены адреса по ссылке из письма (беседа 15.3, Д-73).
 * Гостевой маршрут /change-email/:token — ссылка пришла на НОВЫЙ ящик, и её
 * открывают где угодно. Образец — VerifyEmailPage 9.1: довод гасится ОДИН
 * раз (ref-заслон от двойного эффекта StrictMode), после успеха — в профиль
 * при живой сессии, гостю — на вход с пояснением (входить — уже новым
 * адресом). Сессии сервер не завершает: пароль не менялся.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuthStore } from "../stores/auth-store";
import { tl } from "@philosynth/shared/i18n/t";

export const EMAIL_CHANGED_NOTICE = () => tl("changeEmailPage.changedLogin", "Адрес изменён. Войдите новым адресом, чтобы продолжить.");
const REDIRECT_DELAY_MS = 1500;

type Phase = { kind: "pending" } | { kind: "done" } | { kind: "error"; text: string };

export function ChangeEmailPage() {
  const { token = "" } = useParams<{ token: string }>();
  const confirmEmailChange = useAuthStore((s) => s.confirmEmailChange);
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: "pending" });
  const started = useRef(false);

  // Ждём исхода restore(): при живой сессии confirmEmailChange обновит user
  useEffect(() => {
    if (status === "restoring" || started.current) return;
    started.current = true;
    void confirmEmailChange(token).then((result) => {
      setPhase(result.ok ? { kind: "done" } : { kind: "error", text: result.error });
    });
  }, [status, token, confirmEmailChange]);

  useEffect(() => {
    if (phase.kind !== "done") return;
    const t = setTimeout(() => {
      if (useAuthStore.getState().status === "authenticated") navigate("/profile", { replace: true });
      else navigate("/login", { replace: true, state: { notice: EMAIL_CHANGED_NOTICE(), from: "/profile" } });
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(t);
  }, [phase, navigate]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="site-header auth-header">
          <div>
            <h1 className="brand-name">
              {tl("common.brandPhilo", "Philo")}<span>{tl("common.brandSynth", "Synth")}</span>
            </h1>
            <div className="brand-tagline">{tl("changeEmailPage.changeLower", "смена адреса")}</div>
          </div>
        </div>
        <div className="input-form" data-testid="change-email" data-phase={phase.kind}>
          {phase.kind === "pending" && <span className="meta-label">{tl("verifyEmailPage.checkingLink", "проверка ссылки…")}</span>}
          {phase.kind === "done" && (
            <p role="status" className="callout note">
              {tl("changeEmailPage.changedOpening", "Адрес изменён и подтверждён. Открываем профиль…")}
            </p>
          )}
          {phase.kind === "error" && (
            <>
              <div role="alert" className="callout warning">
                {phase.text}
              </div>
              <p className="submit-note" style={{ textAlign: "center", maxWidth: "100%" }}>
                {tl("changeEmailPage.retryNote", "Ссылка действует час и срабатывает один раз; если адрес к этому времени занят, смена не состоится. Новый запрос — в профиле, форма «Смена адреса».")}
                <br />
                <Link to="/login">{tl("common.logIn", "Войти")}</Link>
                {" · "}
                <Link to="/">{tl("common.toHome", "На главную")}</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
