/**
 * Общий каркас: .topbar + .site-header (Header), колонка навигации и
 * .main-wrap исходника вокруг Outlet.
 * Беседа 0.4; правка 2026-09-02 — единство стилей с исходником.
 *
 * Беседа 8.7 (п. 2): каркас общий для гостя и вошедшего. Боковое меню
 * гостю не рисуется вовсе — все его пункты под RequireAuth; шапка сама
 * решает, что показать справа (имя/выход или «Войти · Регистрация»).
 * Пока сессия проверяется ('restoring'), меню не рисуем — иначе оно
 * мигнёт у гостя.
 */
import { useState } from "react";
import { Outlet } from "react-router-dom";

import { useAuthStore } from "../../stores/auth-store";

import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const authenticated = useAuthStore((s) => s.status === "authenticated");

  return (
    <div className="app-root">
      <Header
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        showBurger={authenticated}
      />
      <div className="app-shell">
        {authenticated && (
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        )}
        <main className="app-main">
          <div className="main-wrap">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
