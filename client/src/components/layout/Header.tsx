/**
 * Шапка приложения — .topbar + .site-header исходника [3531–3557],
 * дословно по классам. Правки 2026-09-02 (единство стилей с исходником):
 * вместо собственного каркаса на Tailwind используются классы исходника,
 * содержимое адаптировано под сервис (сессия вместо API-ключа в памяти
 * вкладки, ссылка на профиль и выход вместо статичной строки справа).
 *
 * Беседа 8.7 (п. 2): гостевая шапка — справа, на месте имени пользователя,
 * пара ссылок текстом «Войти · Регистрация» (.app-guest-link: в отличие от
 * .app-topbar-link не прячется на узких экранах — у гостя иного входа в
 * шапке нет); бургер меню гостю не рисуется (меню нет — Layout). Бренд
 * ведёт гостя на «/», вошедшего — в каталог. Пока сессия проверяется,
 * правая часть пуста — не мигать чужим состоянием.
 */
import { Link, useNavigate } from "react-router-dom";

import { useAuthStore } from "../../stores/auth-store";

interface HeaderProps {
  onToggleSidebar: () => void;
  /** 8.7: бургер меню — только вошедшему (у гостя меню нет) */
  showBurger?: boolean | undefined;
}

export function Header({ onToggleSidebar, showBurger = true }: HeaderProps) {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    // 8.7: после выхода — на стартовую (гостя встречает рассказ, не форма)
    navigate("/");
  }

  return (
    <header>
      <div className="topbar">
        <div className="topbar-left">
          {showBurger && (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label="Открыть меню"
              className="app-topbar-btn app-burger"
            >
              ☰
            </button>
          )}
          <span>PhiloSynth Pro™</span>
          <span className="topbar-badge">Synthesis Engine v1.0</span>
          <span className="topbar-tagline">
            Платформа синтеза философских концепций · Claude-Powered · 3D/2D Graph
          </span>
        </div>
        <div className="topbar-right app-topbar-right" data-testid="topbar-right">
          {user ? (
            <>
              <Link to="/profile" title="Профиль" className="app-topbar-link">
                <span>{user.displayName || user.email}</span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="app-topbar-btn"
              >
                Выйти
              </button>
            </>
          ) : status === "anonymous" ? (
            <span className="app-guest-links" data-testid="guest-links">
              <Link to="/login" className="app-guest-link">
                Войти
              </Link>
              <span className="app-guest-sep">·</span>
              <Link to="/register" className="app-guest-link">
                Регистрация
              </Link>
            </span>
          ) : null}
        </div>
      </div>

      <div className="site-header">
        <div>
          <Link to={user ? "/catalog" : "/"} className="brand-link">
            <div className="brand-name">
              Philo<span>Synth</span>
            </div>
          </Link>
          <div className="brand-tagline">
            Система Синтеза Философских Концепций · Professional Grade
          </div>
          <div className="brand-desc">
            Платформа для автоматизированного синтеза, анализа и формализации
            философских концепций на основе выбранных философских традиций.
            Генерация графов категорий с интерактивной 3D/2D-визуализацией,
            тезисов, диалогов, исторической контекстуализации и критического
            анализа — в формате единого структурированного документа.
          </div>
        </div>
        <div className="header-badges">
          <div className="cert-badge gold">★ AI-POWERED SYNTHESIS</div>
          <div className="cert-badge">THREE.JS + D3.JS GRAPH</div>
          <div className="cert-badge">STREAMING OUTPUT</div>
        </div>
      </div>
    </header>
  );
}
