/**
 * Страница входа. Беседа 0.4: минимальная рабочая форма поверх
 * auth-store (login протестируется отдельным запросом беседы).
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
  const from =
    (location.state as { from?: string } | null)?.from ?? "/catalog";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await login(email, password);
    if (ok) navigate(from, { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <span aria-hidden className="text-2xl text-gold">◈</span>
          <h1 className="mt-1 text-2xl">PhiloSynth</h1>
          <p className="meta-label mt-1">вход</p>
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
            <span className="meta-label">Пароль</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) clearError();
              }}
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
            {pending ? "Вход…" : "Войти"}
          </button>

          <p className="text-center text-sm text-ink-mid">
            Нет аккаунта? <Link to="/register">Регистрация</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
