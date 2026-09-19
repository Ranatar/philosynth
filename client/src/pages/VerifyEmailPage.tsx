/**
 * Подтверждение адреса по ссылке из письма (беседа 9.1, запрос 1, п. 6c).
 * Гостевой маршрут /verify-email/:token: ссылку открывают и в браузере без
 * входа. Довод гасится ОДИН раз — запрос уходит однократно (ref-заслон:
 * StrictMode двоит эффекты, второй вызов получил бы TOKEN_INVALID поверх
 * успеха). После успеха — в каталог; гостю — на вход с пояснением (каталог
 * под RequireAuth увёл бы его на «/» без слов).
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuthStore } from "../stores/auth-store";

export const EMAIL_VERIFIED_NOTICE = "Адрес подтверждён. Войдите, чтобы продолжить.";
const REDIRECT_DELAY_MS = 1500;

type Phase = { kind: "pending" } | { kind: "done" } | { kind: "error"; text: string };

export function VerifyEmailPage() {
  const { token = "" } = useParams<{ token: string }>();
  const confirmEmail = useAuthStore((s) => s.confirmEmail);
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: "pending" });
  const started = useRef(false);

  // Ждём исхода restore(): при живой сессии confirmEmail обновит user в store
  useEffect(() => {
    if (status === "restoring" || started.current) return;
    started.current = true;
    void confirmEmail(token).then((result) => {
      setPhase(result.ok ? { kind: "done" } : { kind: "error", text: result.error });
    });
  }, [status, token, confirmEmail]);

  useEffect(() => {
    if (phase.kind !== "done") return;
    const t = setTimeout(() => {
      if (useAuthStore.getState().status === "authenticated") navigate("/catalog", { replace: true });
      else navigate("/login", { replace: true, state: { notice: EMAIL_VERIFIED_NOTICE, from: "/catalog" } });
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(t);
  }, [phase, navigate]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="site-header auth-header">
          <div>
            <h1 className="brand-name">
              Philo<span>Synth</span>
            </h1>
            <div className="brand-tagline">подтверждение адреса</div>
          </div>
        </div>
        <div className="input-form" data-testid="verify-email" data-phase={phase.kind}>
          {phase.kind === "pending" && <span className="meta-label">проверка ссылки…</span>}
          {phase.kind === "done" && (
            <p role="status" className="callout note">
              Адрес подтверждён. Открываем каталог…
            </p>
          )}
          {phase.kind === "error" && (
            <>
              <div role="alert" className="callout warning">
                {phase.text}
              </div>
              <p className="submit-note" style={{ textAlign: "center", maxWidth: "100%" }}>
                Новое письмо отправляется из полосы «Адрес не подтверждён» в шапке — после входа.
                <br />
                <Link to="/login">Войти</Link>
                {" · "}
                <Link to="/">На главную</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
