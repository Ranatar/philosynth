/**
 * Сброс пароля по почте (беседа 9.1, запрос 1, пп. 6a–6b). Два гостевых
 * экрана одной задачи:
 *   /reset-password        — ResetPasswordRequestPage: форма с адресом;
 *     ответ ВСЕГДА один и тот же (сервер не говорит, есть ли такой адрес —
 *     иначе форма стала бы прибором для проверки, кто зарегистрирован);
 *   /reset-password/:token — ResetPasswordConfirmPage: новый пароль; после
 *     успеха — на /login с пояснением, что прочие сессии завершены.
 * Оформление — экран входа (.auth-screen/.auth-card, LoginPage 0.4); поля с
 * пополевыми ошибками — приём ProfilePage 0.6. Новых классов нет.
 */
import { PASSWORD_MIN_LENGTH } from "@philosynth/shared/constants/auth";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuthStore } from "../stores/auth-store";

/** Пояснение на /login после сброса (LoginPage читает location.state.notice) */
export const PASSWORD_RESET_DONE_NOTICE =
  "Пароль изменён; все прежние сессии завершены. Войдите с новым паролем.";

function AuthShell({ tagline, children }: { tagline: string; children: React.ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="site-header auth-header">
          <div>
            <h1 className="brand-name">
              Philo<span>Synth</span>
            </h1>
            <div className="brand-tagline">{tagline}</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function BackLinks() {
  return (
    <p className="submit-note" style={{ textAlign: "center", maxWidth: "100%" }}>
      <Link to="/login">Войти</Link>
      {" · "}
      <Link to="/">На главную</Link>
    </p>
  );
}

export function ResetPasswordRequestPage() {
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await requestPasswordReset(email);
    setPending(false);
    if (result.ok) setDone(result.message);
    else setError(result.details?.email ?? result.error);
  }

  return (
    <AuthShell tagline="сброс пароля">
      {done ? (
        <div className="input-form" data-testid="reset-request-done">
          <p role="status" className="callout note">
            {done}
          </p>
          <BackLinks />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="input-form" data-testid="reset-request-form">
          <label className="form-group">
            <span className="form-label">Email учётной записи</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
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
            {pending ? "Отправка…" : "Прислать ссылку"}
          </button>
          <BackLinks />
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordConfirmPage() {
  const { token = "" } = useParams<{ token: string }>();
  const confirmPasswordReset = useAuthStore((s) => s.confirmPasswordReset);
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setErrors({});
    if (newPassword !== repeatPassword) {
      setErrors({ repeatPassword: "Пароли не совпадают" });
      return;
    }
    setPending(true);
    const result = await confirmPasswordReset(token, newPassword);
    setPending(false);
    if (result.ok) {
      navigate("/login", { replace: true, state: { notice: PASSWORD_RESET_DONE_NOTICE } });
    } else {
      setErrors(result.details ?? { _: result.error });
    }
  }

  const clear = () => {
    if (Object.keys(errors).length) setErrors({});
  };

  return (
    <AuthShell tagline="новый пароль">
      <form onSubmit={handleSubmit} className="input-form" data-testid="reset-confirm-form">
        <label className="form-group">
          <span className="form-label">Новый пароль (не короче {PASSWORD_MIN_LENGTH} символов)</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              clear();
            }}
            className="form-input"
          />
          {errors.newPassword && (
            <span role="alert" className="form-sublabel" style={{ color: "var(--red)" }}>
              {errors.newPassword}
            </span>
          )}
        </label>
        <label className="form-group">
          <span className="form-label">Новый пароль ещё раз</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={repeatPassword}
            onChange={(e) => {
              setRepeatPassword(e.target.value);
              clear();
            }}
            className="form-input"
          />
          {errors.repeatPassword && (
            <span role="alert" className="form-sublabel" style={{ color: "var(--red)" }}>
              {errors.repeatPassword}
            </span>
          )}
        </label>
        {errors._ && (
          <div role="alert" className="callout warning" data-testid="reset-confirm-error">
            {errors._}{" "}
            <Link to="/reset-password">Запросить новую ссылку</Link>
          </div>
        )}
        <button
          type="submit"
          disabled={pending}
          className="submit-btn"
          style={{ justifyContent: "center", marginTop: 8 }}
        >
          {pending ? "Смена…" : "Сменить пароль"}
        </button>
        <BackLinks />
      </form>
    </AuthShell>
  );
}
