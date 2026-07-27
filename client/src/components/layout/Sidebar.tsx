/**
 * Боковая навигация. Беседа 0.4 (только скелет).
 * Desktop (≥768px): постоянная колонка. Mobile: скрыта, открывается
 * бургером в Header (выдвижная панель + подложка).
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
    <nav className="flex flex-col gap-1 p-3">
      <div className="meta-label mb-2 px-2">Разделы</div>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onClose}
          className={({ isActive }) =>
            [
              "rounded px-3 py-2 text-sm no-underline transition-colors hover:no-underline",
              isActive
                ? "bg-off font-medium text-ink shadow-[inset_2px_0_0_var(--gold)]"
                : "text-ink-mid hover:bg-off hover:text-ink",
            ].join(" ")
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
      <aside className="hidden w-56 shrink-0 border-r border-rule bg-paper md:block">
        {nav}
      </aside>

      {/* Mobile: подложка + выдвижная панель */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 w-64 border-r border-rule bg-paper transition-transform md:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-rule px-4 py-3">
          <span className="font-serif font-semibold text-ink">
            <span aria-hidden className="text-gold">◈ </span>
            PhiloSynth
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть меню"
            className="rounded border border-rule px-2 py-0.5 text-sm text-ink-mid"
          >
            ✕
          </button>
        </div>
        {nav}
      </aside>
    </>
  );
}
