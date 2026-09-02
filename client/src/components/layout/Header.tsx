/**
 * Шапка приложения — .topbar + .site-header исходника [3531–3557],
 * дословно по классам. Правки 2026-09-02 (единство стилей с исходником):
 * вместо собственного каркаса на Tailwind используются классы исходника,
 * содержимое адаптировано под сервис (сессия вместо API-ключа в памяти
 * вкладки, ссылка на профиль и выход вместо статичной строки справа).
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
    <header>
      <div className="topbar">
        <div className="topbar-left">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Открыть меню"
            className="app-topbar-btn app-burger"
          >
            ☰
          </button>
          <span>PhiloSynth Pro™</span>
          <span className="topbar-badge">Synthesis Engine v1.0</span>
          <span className="topbar-tagline">
            Платформа синтеза философских концепций · Claude-Powered · 3D/2D Graph
          </span>
        </div>
        <div className="topbar-right app-topbar-right">
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
          ) : (
            <Link to="/login" className="app-topbar-link">
              Войти
            </Link>
          )}
        </div>
      </div>

      <div className="site-header">
        <div>
          <Link to="/catalog" className="brand-link">
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
