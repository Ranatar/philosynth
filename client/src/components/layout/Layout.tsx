/**
 * Общий каркас авторизованной части: .topbar + .site-header (Header),
 * колонка навигации и .main-wrap исходника вокруг Outlet.
 * Беседа 0.4; правка 2026-09-02 — единство стилей с исходником.
 */
import { useState } from "react";
import { Outlet } from "react-router-dom";

import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-root">
      <Header onToggleSidebar={() => setSidebarOpen((v) => !v)} />
      <div className="app-shell">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="app-main">
          <div className="main-wrap">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
