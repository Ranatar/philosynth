/**
 * Страница регистрации. Беседа 0.4: минимальная рабочая форма.
 * Валидация полей — серверная (routes/auth.ts: email-формат,
 * пароль ≥ 8 символов); клиент показывает error + details.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuthStore } from "../stores/auth-store";

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
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <span aria-hidden className="text-2xl text-gold">◈</span>
          <h1 className="mt-1 text-2xl">PhiloSynth</h1>
          <p className="meta-label mt-1">регистрация</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-6 flex flex-col gap-3 rounded border border-rule bg-paper p-6"
        >
          <label className="flex flex-col gap-1">
            <span className="meta-label">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) clearError();
              }}
              className="rounded border border-rule bg-white px-3 py-2 text-sm outline-none focus:border-gold"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="meta-label">Пароль (не короче 8 символов)</span>
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
              className="rounded border border-rule bg-white px-3 py-2 text-sm outline-none focus:border-gold"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="meta-label">Отображаемое имя (необязательно)</span>
            <input
              type="text"
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="rounded border border-rule bg-white px-3 py-2 text-sm outline-none focus:border-gold"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-red">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded bg-blue-corp px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Создание…" : "Создать аккаунт"}
          </button>

          <p className="text-center text-sm text-ink-mid">
            Уже есть аккаунт? <Link to="/login">Войти</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
