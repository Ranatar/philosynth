/**
 * Zustand-store аутентификации. Беседа 0.4.
 *
 * Контракт (03-specification §2.1, server/routes/auth.ts):
 *   POST /auth/register { email, password, displayName? } → { user: {id,email,displayName} }
 *   POST /auth/login    { email, password }               → { user: {id,email,displayName} }
 *   POST /auth/logout                                     → { ok: true }
 *   GET  /auth/me → { user: {id,email,displayName,role,balanceUsd} }
 *   PATCH /auth/me { displayName } → { user: полный }        (беседа 0.6)
 *   POST /auth/password-change { currentPassword, newPassword } → { ok } (0.5/0.6)
 *
 * login/register возвращают усечённого пользователя — после успеха store
 * дотягивает полный профиль через GET /auth/me (role нужна Sidebar'у для
 * пункта «Промпты», balanceUsd — будущей странице биллинга).
 *
 * Восстановление сессии при перезагрузке: restore() (GET /auth/me) —
 * вызывается один раз из App. status:
 *   "restoring" → сессия проверяется (RequireAuth ждёт);
 *   "authenticated" / "anonymous" → результат известен.
 */
import { create } from "zustand";

import {
  api,
  ApiError,
  apiGet,
  apiPatch,
  apiPost,
  setUnauthorizedHandler,
} from "../api/client";

/** Пользователь (ответ GET /auth/me; после login — до restore — role/balanceUsd могут отсутствовать) */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  role?: "user" | "admin";
  balanceUsd?: number;
}

export type AuthStatus = "restoring" | "authenticated" | "anonymous";

/** Результат действий профиля (беседа 0.6): пополевые ошибки — форме */
export type ProfileActionResult =
  | { ok: true }
  | { ok: false; error: string; details?: Record<string, string> };

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  /** Текст последней ошибки login/register (для формы); null — нет ошибки */
  error: string | null;
  /** Идёт login/register-запрос (дизейбл кнопки формы) */
  pending: boolean;

  login(email: string, password: string): Promise<boolean>;
  register(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<boolean>;
  logout(): Promise<void>;
  /** Восстановление сессии по cookie (GET /auth/me); вызывать один раз из App */
  restore(): Promise<void>;
  clearError(): void;
  /** PATCH /auth/me { displayName } (беседа 0.6); user в store обновляется */
  updateProfile(displayName: string): Promise<ProfileActionResult>;
  /** POST /auth/password-change (беседа 0.6); сессия текущего окна живёт */
  changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<ProfileActionResult>;
}

async function fetchMe(): Promise<AuthUser> {
  const { user } = await apiGet<{ user: AuthUser }>("/auth/me");
  return user;
}

/** ApiError → ProfileActionResult (details сервера — Record<поле, текст>) */
function toActionFailure(err: unknown, fallback: string): ProfileActionResult {
  if (err instanceof ApiError) {
    const details =
      err.details && typeof err.details === "object"
        ? (err.details as Record<string, string>)
        : undefined;
    return { ok: false, error: err.message, ...(details ? { details } : {}) };
  }
  return { ok: false, error: fallback };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: "restoring",
  error: null,
  pending: false,

  async login(email, password) {
    set({ pending: true, error: null });
    try {
      const { user } = await apiPost<{ user: AuthUser }>("/auth/login", {
        email,
        password,
      });
      // Дотягиваем полный профиль (role, balanceUsd); при сбое — усечённый
      let full = user;
      try {
        full = await fetchMe();
      } catch {
        /* усечённого пользователя достаточно для входа */
      }
      set({ user: full, status: "authenticated", pending: false });
      return true;
    } catch (err) {
      set({
        user: null,
        status: "anonymous",
        pending: false,
        error:
          err instanceof ApiError ? err.message : "Не удалось выполнить вход",
      });
      return false;
    }
  },

  async register(email, password, displayName) {
    set({ pending: true, error: null });
    try {
      await apiPost<{ user: AuthUser }>("/auth/register", {
        email,
        password,
        ...(displayName ? { displayName } : {}),
      });
      // Register не выдаёт сессию (03-spec: отдельный login после регистрации
      // не специфицирован; server/routes/auth.ts сессию на register не ставит) —
      // логинимся сразу теми же кредами.
      return await get().login(email, password);
    } catch (err) {
      set({
        pending: false,
        error:
          err instanceof ApiError
            ? err.message
            : "Не удалось зарегистрироваться",
      });
      return false;
    }
  },

  async logout() {
    try {
      await apiPost<{ ok: true }>("/auth/logout");
    } catch {
      /* сессию сбрасываем в любом случае */
    }
    set({ user: null, status: "anonymous", error: null });
  },

  async restore() {
    try {
      const user = await fetchMe();
      set({ user, status: "authenticated" });
    } catch {
      set({ user: null, status: "anonymous" });
    }
  },

  clearError() {
    set({ error: null });
  },

  async updateProfile(displayName) {
    try {
      const { user } = await apiPatch<{ user: AuthUser }>("/auth/me", {
        displayName,
      });
      set({ user });
      return { ok: true };
    } catch (err) {
      return toActionFailure(err, "Не удалось сохранить профиль");
    }
  },

  async changePassword(currentPassword, newPassword) {
    try {
      // skipUnauthorizedHandler: 401 здесь — штатный ответ формы при ЖИВОЙ
      // сессии (сервер отвечает единым AUTH_REQUIRED на неверный
      // currentPassword, анти-enumeration); без опции глобальный обработчик
      // 401 сбросил бы user и RequireAuth увёл бы на /login.
      await api<{ ok: true }>("/auth/password-change", {
        method: "POST",
        body: { currentPassword, newPassword },
        skipUnauthorizedHandler: true,
      });
      return { ok: true };
    } catch (err) {
      if (err instanceof ApiError && err.code === "AUTH_REQUIRED") {
        return { ok: false, error: "Неверный текущий пароль" };
      }
      return toActionFailure(err, "Не удалось сменить пароль");
    }
  },
}));

/* 401 из любого запроса → сессия невалидна → сброс пользователя
   (RequireAuth в App среагирует redirect'ом на /login).
   Регистрация на уровне модуля: store — синглтон. */
setUnauthorizedHandler(() => {
  const { status } = useAuthStore.getState();
  if (status === "authenticated") {
    useAuthStore.setState({ user: null, status: "anonymous" });
  }
});
