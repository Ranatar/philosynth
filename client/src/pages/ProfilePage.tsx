/**
 * Страница профиля (беседа 0.6, требование A3):
 *   - секция «Профиль»: email (read-only), displayName → PATCH /auth/me;
 *   - секция «Смена пароля»: POST /auth/password-change (беседа 0.5);
 *     повтор нового пароля проверяется на клиенте; 401 сервера →
 *     «Неверный текущий пароль» (auth-store), details — по полям;
 *     при успехе — уведомление «Пароль изменён; прочие сессии завершены».
 * Маршрут /profile; ссылка — имя/email пользователя в Header.
 */
import { useState } from "react";

import { useAuthStore } from "../stores/auth-store";

/** Ошибки по полям формы (ключ = имя поля; ключ "_" — общая) */
type FieldErrors = Record<string, string>;

interface FieldProps {
  label: string;
  type?: string;
  autoComplete?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
  disabled?: boolean;
}

function Field({
  label,
  type = "text",
  autoComplete,
  value,
  onChange,
  error,
  disabled,
}: FieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="meta-label">{label}</span>
      <input
        type={type}
        {...(autoComplete ? { autoComplete } : {})}
        value={value}
        disabled={disabled ?? false}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-rule bg-white px-3 py-2 text-sm outline-none focus:border-gold disabled:bg-paper disabled:text-ink-mid"
      />
      {error && (
        <span role="alert" className="text-sm text-red">
          {error}
        </span>
      )}
    </label>
  );
}

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const changePassword = useAuthStore((s) => s.changePassword);

  /* ── Секция «Профиль» ── */
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [profileErrors, setProfileErrors] = useState<FieldErrors>({});
  const [profileSaved, setProfileSaved] = useState(false);
  const [profilePending, setProfilePending] = useState(false);

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfileErrors({});
    setProfileSaved(false);
    setProfilePending(true);
    const result = await updateProfile(displayName);
    setProfilePending(false);
    if (result.ok) {
      setProfileSaved(true);
    } else {
      setProfileErrors(result.details ?? { _: result.error });
    }
  }

  /* ── Секция «Смена пароля» ── */
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<FieldErrors>({});
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordErrors({});
    setPasswordChanged(false);
    if (newPassword !== repeatPassword) {
      setPasswordErrors({ repeatPassword: "Пароли не совпадают" });
      return;
    }
    setPasswordPending(true);
    const result = await changePassword(currentPassword, newPassword);
    setPasswordPending(false);
    if (result.ok) {
      setPasswordChanged(true);
      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
    } else {
      // details сервера — по полям; 401 «Неверный текущий пароль» —
      // к полю текущего пароля (auth-store уже уточнил текст)
      setPasswordErrors(
        result.details ??
          (result.error === "Неверный текущий пароль"
            ? { currentPassword: result.error }
            : { _: result.error }),
      );
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="meta-label">аккаунт</div>
      <h1 className="mt-1 text-2xl">Профиль</h1>

      {/* ── Профиль ── */}
      <form
        onSubmit={handleProfileSubmit}
        className="mt-6 flex flex-col gap-3 rounded border border-rule bg-paper p-6"
      >
        <h2 className="font-serif text-lg text-ink">Данные</h2>
        <Field
          label="Email"
          type="email"
          value={user?.email ?? ""}
          onChange={() => undefined}
          disabled
        />
        <Field
          label="Отображаемое имя"
          autoComplete="name"
          value={displayName}
          onChange={(v) => {
            setDisplayName(v);
            setProfileSaved(false);
            if (profileErrors.displayName || profileErrors._)
              setProfileErrors({});
          }}
          error={profileErrors.displayName}
        />
        {profileErrors._ && (
          <p role="alert" className="text-sm text-red">
            {profileErrors._}
          </p>
        )}
        {profileSaved && (
          <p role="status" className="text-sm text-green-check">
            Сохранено
          </p>
        )}
        <button
          type="submit"
          disabled={profilePending}
          className="mt-1 self-start rounded bg-blue-corp px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {profilePending ? "Сохранение…" : "Сохранить"}
        </button>
      </form>

      {/* ── Смена пароля ── */}
      <form
        onSubmit={handlePasswordSubmit}
        className="mt-6 flex flex-col gap-3 rounded border border-rule bg-paper p-6"
      >
        <h2 className="font-serif text-lg text-ink">Смена пароля</h2>
        <Field
          label="Текущий пароль"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(v) => {
            setCurrentPassword(v);
            setPasswordChanged(false);
            if (Object.keys(passwordErrors).length) setPasswordErrors({});
          }}
          error={passwordErrors.currentPassword}
        />
        <Field
          label="Новый пароль"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(v) => {
            setNewPassword(v);
            setPasswordChanged(false);
            if (Object.keys(passwordErrors).length) setPasswordErrors({});
          }}
          error={passwordErrors.newPassword}
        />
        <Field
          label="Новый пароль ещё раз"
          type="password"
          autoComplete="new-password"
          value={repeatPassword}
          onChange={(v) => {
            setRepeatPassword(v);
            setPasswordChanged(false);
            if (Object.keys(passwordErrors).length) setPasswordErrors({});
          }}
          error={passwordErrors.repeatPassword}
        />
        {passwordErrors._ && (
          <p role="alert" className="text-sm text-red">
            {passwordErrors._}
          </p>
        )}
        {passwordChanged && (
          <p role="status" className="text-sm text-green-check">
            Пароль изменён; прочие сессии завершены
          </p>
        )}
        <button
          type="submit"
          disabled={passwordPending}
          className="mt-1 self-start rounded bg-blue-corp px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {passwordPending ? "Смена…" : "Сменить пароль"}
        </button>
      </form>
    </div>
  );
}
