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
 *
 * Беседа 9.1 (п. 6e): полоса «Адрес не подтверждён» у вошедшего с
 * неподтверждённым адресом — под .topbar, классами полосы 8.7
 * (.app-view-banner; новых правил нет). «Отправить письмо ещё раз» защищена
 * от повторного нажатия (ref-заслон + disabled на время запроса), после успеха её
 * сменяет строка «письмо отправлено» (до перезагрузки страницы). Рисуется
 * только при СТРОГОМ emailVerified === false: до дотяжки GET /auth/me поле
 * undefined, и полоса не мигает у подтверждённых. Подтверждение ничего не
 * ограничивает — полоса напоминает, а не запрещает.
 */
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuthStore } from "../../stores/auth-store";

interface HeaderProps {
  onToggleSidebar: () => void;
  /** 8.7: бургер меню — только вошедшему (у гостя меню нет) */
  showBurger?: boolean | undefined;
}

type ResendPhase = "idle" | "pending" | "sent";

function UnverifiedEmailBanner({ email }: { email: string }) {
  const resendVerification = useAuthStore((s) => s.resendVerification);
  const [phase, setPhase] = useState<ResendPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  // Заслон — ref, а не состояние: три клика в одном тике видят одно и то же
  // phase === "idle" (setState ещё не применён) и уходили тремя запросами —
  // найдено браузерным тестом R10
  const busy = useRef(false);

  async function handleResend() {
    if (busy.current || phase !== "idle") return; // защита от повторного нажатия
    busy.current = true;
    setPhase("pending");
    setError(null);
    const result = await resendVerification();
    if (result.ok) {
      // alreadyVerified → store уже обновил user, полоса исчезнет сама
      setPhase("sent");
    } else {
      busy.current = false; // после отказа повтор разрешён
      setPhase("idle");
      setError(result.error);
    }
  }

  return (
    <div
      className="app-view-banner"
      data-testid="unverified-banner"
      style={{ marginBottom: 0 }}
    >
      <span className="app-view-banner-text">
        Адрес не подтверждён · {email}
        {error ? ` · ${error}` : ""}
      </span>
      {phase === "sent" ? (
        <span className="app-view-banner-text" role="status" data-testid="unverified-sent">
          Письмо отправлено — проверьте почту
        </span>
      ) : (
        <button
          type="button"
          className="action-btn"
          onClick={handleResend}
          disabled={phase === "pending"}
          data-testid="unverified-resend"
        >
          {phase === "pending" ? "Отправка…" : "Отправить письмо ещё раз"}
        </button>
      )}
    </div>
  );
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

      {user && user.emailVerified === false && <UnverifiedEmailBanner email={user.email} />}

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
