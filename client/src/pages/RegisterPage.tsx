/**
 * Страница регистрации. Беседа 0.4: минимальная рабочая форма.
 * Валидация полей — серверная (routes/auth.ts: email-формат,
 * пароль ≥ 8 символов); клиент показывает error + details.
 */
import { PASSWORD_MIN_LENGTH } from "@philosynth/shared/constants/auth";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuthStore } from "../stores/auth-store";
import { tl } from "@philosynth/shared/i18n/t";

export function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const { register, pending, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await register(email, password, displayName || undefined);
    if (ok) navigate("/catalog", { replace: true });
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
          <label className="form-group">
            <span className="form-label">{tl("common.email", "Email")}</span>
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
