/**
 * Маршрутизация. Беседа 0.4 (07 §2, «Каркас клиента», п. 4):
 * Login, Register, Catalog, CreateSynthesis, Synthesis/:id, Import,
 * Billing, AdminPrompts.
 *
 * RequireAuth: защищённые маршруты ждут restore() (проверка cookie-сессии
 * через GET /auth/me) и при её отсутствии redirect'ят на /login,
 * запоминая исходный путь. 401 из любого API-запроса сбрасывает
 * пользователя в auth-store → этот же guard срабатывает повторно.
 */
import { useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import { Layout } from "./components/layout/Layout";
import { AdminPromptsPage } from "./pages/AdminPromptsPage";
import { BillingPage } from "./pages/BillingPage";
import { CatalogPage } from "./pages/CatalogPage";
import { CreateSynthesisPage } from "./pages/CreateSynthesisPage";
import { ImportPage } from "./pages/ImportPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RegisterPage } from "./pages/RegisterPage";
import { SynthesisPage } from "./pages/SynthesisPage";
import { useAuthStore } from "./stores/auth-store";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (status === "restoring") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="meta-label">проверка сессии…</span>
      </div>
    );
  }
  if (status === "anonymous") {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return <>{children}</>;
}

export function App() {
  const restore = useAuthStore((s) => s.restore);

  // Восстановление сессии по cookie — один раз при загрузке приложения
  useEffect(() => {
    void restore();
  }, [restore]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Публичные */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Защищённые — внутри Layout */}
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Navigate to="/catalog" replace />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/synthesis/new" element={<CreateSynthesisPage />} />
          <Route path="/synthesis/:id" element={<SynthesisPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin/prompts" element={<AdminPromptsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
