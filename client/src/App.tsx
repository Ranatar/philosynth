/**
 * Маршрутизация. Беседа 0.4 (07 §2, «Каркас клиента», п. 4):
 * Login, Register, Catalog, CreateSynthesis, Synthesis/:id, Import,
 * Billing, AdminPrompts.
 *
 * RequireAuth: защищённые маршруты ждут restore() (проверка cookie-сессии
 * через GET /auth/me) и при её отсутствии redirect'ят на /login,
 * запоминая исходный путь. 401 из любого API-запроса сбрасывает
 * пользователя в auth-store → этот же guard срабатывает повторно.
 *
 * RequireAdmin (беседа 6.2, п. 5; долг §12 «Ролевая защита /admin/prompts»):
 * поверх RequireAuth — при role !== 'admin' redirect на /catalog
 * (protocol 07: «redirect на 403 или каталог» — выбран каталог: страницы
 * 403 в приложении нет, а серверные роуты §2.9 всё равно отвечают 403
 * FORBIDDEN). Ссылка «Промпты» в Sidebar admin-only с 0.4 — прямой ввод
 * URL до 6.2 показывал заглушку любому вошедшему.
 *
 * Беседа 8.7 (п. 2–3): гостевые маршруты. Layout больше не под RequireAuth
 * целиком — защита стоит на конкретных страницах (RequireAuth оборачивает
 * элемент маршрута). Гостю открыты «/» (LandingPage; вошедшего она сама
 * шлёт в /catalog), «/explore» (публичный каталог — CatalogPage publicOnly)
 * и «/synthesis/:id» (документ; доступ решает ответ сервера: 403 →
 * «концепция приватна» со ссылкой на вход, 404 → NotFound). Гость на любом
 * другом маршруте — редирект на «/» (исходный путь уходит в state.from —
 * LoginPage вернёт туда после входа, как прежде). Боковое меню гостю не
 * рисуется (Layout).
 *
 * Беседа 9.1 (п. 6): три гостевых маршрута почты ВНЕ Layout, рядом с
 * /login и /register (те же экраны .auth-screen): «/reset-password» (форма
 * с адресом), «/reset-password/:token» (новый пароль), «/verify-email/:token»
 * (подтверждение адреса). «Отправить ещё раз» — под входом: полоса в Header.
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
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RegisterPage } from "./pages/RegisterPage";
import {
  ResetPasswordConfirmPage,
  ResetPasswordRequestPage,
} from "./pages/ResetPasswordPage";
import { SynthesisPage } from "./pages/SynthesisPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { useAuthStore } from "./stores/auth-store";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (status === "restoring") {
    return (
      <div className="auth-screen">
        <span className="meta-label">проверка сессии…</span>
      </div>
    );
  }
  if (status === "anonymous") {
    // 8.7: гостя встречает стартовая страница, а не форма входа; исходный
    // путь сохраняется — LandingPage/LoginPage вернут туда после входа
    return (
      <Navigate
        to="/"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== "admin") return <Navigate to="/catalog" replace />;
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
        {/* Почта (9.1): гостевые — ссылку из письма открывают и без входа */}
        <Route path="/reset-password" element={<ResetPasswordRequestPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordConfirmPage />} />
        <Route path="/verify-email/:token" element={<VerifyEmailPage />} />

        {/* Общий каркас: шапка (гостевая или своя), меню — только вошедшему */}
        <Route element={<Layout />}>
          {/* Гостевые (8.7): стартовая, публичный каталог, документ */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/explore" element={<CatalogPage publicOnly />} />
          <Route path="/synthesis/:id" element={<SynthesisPage />} />

          {/* Защищённые */}
          <Route
            path="/catalog"
            element={
              <RequireAuth>
                <CatalogPage />
              </RequireAuth>
            }
          />
          <Route
            path="/synthesis/new"
            element={
              <RequireAuth>
                <CreateSynthesisPage />
              </RequireAuth>
            }
          />
          <Route
            path="/import"
            element={
              <RequireAuth>
                <ImportPage />
              </RequireAuth>
            }
          />
          <Route
            path="/billing"
            element={
              <RequireAuth>
                <BillingPage />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/prompts"
            element={
              <RequireAuth>
                <RequireAdmin>
                  <AdminPromptsPage />
                </RequireAdmin>
              </RequireAuth>
            }
          />
          {/* Неизвестный маршрут: вошедшему — 404, гостю — на «/» */}
          <Route
            path="*"
            element={
              <RequireAuth>
                <NotFoundPage />
              </RequireAuth>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
