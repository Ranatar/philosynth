/**
 * Шапка приложения. Беседа 0.4 (только скелет).
 * Мотив — шапка документа исходника: серифный вордмарк, знак ◈,
 * двойная линейка снизу (класс .double-rule в Layout).
 */
import { Link, useNavigate } from "react-router-dom";

import { useAuthStore } from "../../stores/auth-store";

interface HeaderProps {
  onToggleSidebar: () => void;
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <header className="flex items-center gap-4 bg-paper px-4 py-3 md:px-6">
      {/* Бургер — только на мобильных */}
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Открыть меню"
        className="rounded border border-rule px-2 py-1 font-mono text-sm text-ink-mid hover:border-rule-strong md:hidden"
      >
        ☰
      </button>

      <Link to="/catalog" className="flex items-baseline gap-2 no-underline hover:no-underline">
        <span aria-hidden className="text-gold">
          ◈
        </span>
        <span className="font-serif text-xl font-semibold text-ink">
          PhiloSynth
        </span>
        <span className="meta-label hidden sm:inline">service</span>
      </Link>

      <div className="ml-auto flex items-center gap-3">
        {user ? (
          <>
            <Link
              to="/profile"
              title="Профиль"
              className="max-w-[40vw] truncate font-mono text-xs text-ink-mid no-underline hover:text-ink hover:no-underline sm:max-w-xs"
            >
              {user.displayName || user.email}
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded border border-rule px-3 py-1 text-sm text-ink-mid transition-colors hover:border-rule-strong hover:text-ink"
            >
              Выйти
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="rounded border border-rule px-3 py-1 text-sm text-ink-mid hover:border-rule-strong hover:text-ink"
          >
            Войти
          </Link>
        )}
      </div>
    </header>
  );
}
