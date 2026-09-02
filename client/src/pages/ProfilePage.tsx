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
    <label className="form-group">
      <span className="form-label">{label}</span>
      <input
        type={type}
        {...(autoComplete ? { autoComplete } : {})}
        value={value}
        disabled={disabled ?? false}
        onChange={(e) => onChange(e.target.value)}
        className="form-input"
      />
      {error && (
        <span role="alert" className="form-sublabel" style={{ color: "var(--red)" }}>
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
    <div>
      <h1 className="form-section-title" style={{ border: "none" }}>
        Профиль
      </h1>

      {/* ── Профиль ── */}
      <form onSubmit={handleProfileSubmit} className="input-form">
        <div className="form-section-title">Данные</div>
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
          <p role="alert" className="callout warning">
            {profileErrors._}
          </p>
        )}
        {profileSaved && (
          <p role="status" className="callout note">
            Сохранено
          </p>
        )}
        <button
          type="submit"
          disabled={profilePending}
          className="submit-btn"
          style={{ alignSelf: "flex-start", marginTop: 4 }}
        >
          {profilePending ? "Сохранение…" : "Сохранить"}
        </button>
      </form>

      {/* ── Смена пароля ── */}
      <form
        onSubmit={handlePasswordSubmit}
        className="input-form"
      >
        <div className="form-section-title">Смена пароля</div>
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
          <p role="alert" className="callout warning">
            {passwordErrors._}
          </p>
        )}
        {passwordChanged && (
          <p role="status" className="callout note">
            Пароль изменён; прочие сессии завершены
          </p>
        )}
        <button
          type="submit"
          disabled={passwordPending}
          className="submit-btn"
          style={{ alignSelf: "flex-start", marginTop: 4 }}
        >
          {passwordPending ? "Смена…" : "Сменить пароль"}
        </button>
      </form>
    </div>
  );
}
