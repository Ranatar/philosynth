/**
 * Страница входа. Беседа 0.4: минимальная рабочая форма поверх
 * auth-store (login протестируется отдельным запросом беседы).
 * Беседа 9.1: ссылка «Забыли пароль?» рядом с регистрацией; пояснение из
 * location.state.notice (после сброса пароля — «прочие сессии завершены»,
 * после подтверждения адреса гостем — «войдите, чтобы продолжить»).
 */
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuthStore } from "../stores/auth-store";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, pending, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Куда вернуться после входа (RequireAuth кладёт исходный путь в state)
  const navState = location.state as { from?: string; notice?: string } | null;
  const from = navState?.from ?? "/catalog";
  const notice = navState?.notice ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await login(email, password);
    if (ok) navigate(from, { replace: true });
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="site-header auth-header">
          <div>
            <h1 className="brand-name">
              Philo<span>Synth</span>
            </h1>
            <div className="brand-tagline">вход</div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="input-form"
        >
          {notice && (
            <p role="status" className="callout note" data-testid="login-notice">
              {notice}
            </p>
          )}
          <label className="form-group">
            <span className="form-label">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) clearError();
              }}
              className="form-input"
            />
          </label>

          <label className="form-group">
            <span className="form-label">Пароль</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) clearError();
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
            {pending ? "Вход…" : "Войти"}
          </button>

          <p className="submit-note" style={{ textAlign: "center", maxWidth: "100%" }}>
            Нет аккаунта? <Link to="/register">Регистрация</Link>
            {" · "}
            <Link to="/reset-password" data-testid="forgot-password-link">
              Забыли пароль?
            </Link>
            {" · "}
            <Link to="/">На главную</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
