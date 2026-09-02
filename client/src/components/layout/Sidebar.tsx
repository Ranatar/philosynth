/**
 * Боковая навигация. В исходнике навигации нет — страница одна, поэтому
 * классы .app-* заведены в части 3 globals.css и оформлены по системе
 * исходника (mono, капитель, разрядка, синяя активная полоса).
 *
 * Desktop (≥900px): постоянная колонка .app-sidebar-desktop.
 * Mobile: выдвижная панель .app-sidebar-mobile (aria-hidden, кнопка ✕,
 * подложка .app-sidebar-backdrop) — контракт беседы 0.4 сохранён,
 * поменялось только оформление (правка 2026-09-02).
 */
import { NavLink } from "react-router-dom";

import { useAuthStore } from "../../stores/auth-store";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  to: string;
  label: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/catalog", label: "Каталог" },
  { to: "/synthesis/new", label: "Новый синтез" },
  { to: "/import", label: "Импорт" },
  { to: "/billing", label: "Биллинг" },
  { to: "/admin/prompts", label: "Промпты", adminOnly: true },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const items = NAV_ITEMS.filter(
    (item) => !item.adminOnly || user?.role === "admin",
  );

  const nav = (
    <nav>
      <div className="app-nav-group">Разделы</div>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onClose}
          className={({ isActive }) =>
            isActive ? "app-nav-link active" : "app-nav-link"
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="app-sidebar app-sidebar-desktop">{nav}</aside>

      {/* Mobile: подложка + выдвижная панель */}
      <div
        className={["app-sidebar-backdrop", open ? "open" : ""].join(" ")}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={["app-sidebar", "app-sidebar-mobile", open ? "open" : ""].join(
          " ",
        )}
        aria-hidden={!open}
      >
        <div className="app-sidebar-head">
          <span className="app-nav-group" style={{ border: "none", padding: 0 }}>
            Навигация
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть меню"
            className="action-btn"
            style={{ padding: "2px 10px" }}
          >
            ✕
          </button>
        </div>
        {nav}
      </aside>
    </>
  );
}
