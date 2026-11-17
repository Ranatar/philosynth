/**
 * Переключатель языка интерфейса ru / en / de (беседа 11.3, п. 3).
 *
 * Два вида одного компонента:
 *   "topbar" — в тёмной .topbar шапки (и гостю, и вошедшему): ВЫПАДАЮЩИЙ
 *              список (решение пользователя 2026-11-17 — три кнопки в ряд
 *              занимали шапку и множились бы с каждым новым языком).
 *              Кнопка-раскрывашка в идиоме .app-topbar-btn показывает
 *              текущий язык; список — бумага с рамкой, как .notif-dropdown;
 *              клик мимо и Escape закрывают. Пункты — те же
 *              button[data-locale] (.active у текущего): разметка списка
 *              есть всегда, закрытый скрыт атрибутом hidden;
 *   "form"   — в профиле, кнопки .action-btn (active — заливка --blue-corp,
 *              как у ступеней публичности 8.7 и вкладок каталога).
 * Подписи — самоназвания языков (UI_LOCALE_NAMES): НЕ переводятся и в
 * каталог не идут.
 *
 * Вошедший: PATCH /auth/me { uiLocale } через auth-store.setUiLocale —
 * сервер сам переписывает gen_lang (правило владельца). Гость: только
 * cookie ui_locale (i18n-store.setLocale). В обоих случаях интерфейс
 * перерисовывается сразу, без перезагрузки страницы. Одинаковый язык —
 * ни запроса, ни перерисовки (заслон в i18n-store).
 */
import { useEffect, useRef, useState } from "react";

import { useAuthStore } from "../../stores/auth-store";
import { UI_LOCALES, UI_LOCALE_NAMES, useI18nStore, type UiLocale } from "../../i18n/i18n-store";
import { useT } from "../../i18n/useT";

interface LanguageSwitchProps {
  variant: "topbar" | "form";
}

export function LanguageSwitch({ variant }: LanguageSwitchProps) {
  const tl = useT();
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);
  const authenticated = useAuthStore((s) => s.status === "authenticated");
  const setUiLocale = useAuthStore((s) => s.setUiLocale);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // клик мимо и Escape — закрыть (как у колокольчика уведомлений)
  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      const el = rootRef.current;
      if (el && ev.target instanceof Node && !el.contains(ev.target)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (next: UiLocale) => {
    setOpen(false);
    if (next === locale) return;
    if (authenticated) void setUiLocale(next); // сам применит язык и вызовет PATCH
    else void setLocale(next);
  };

  if (variant === "topbar") {
    return (
      <div className="app-lang-switch" ref={rootRef} data-testid="lang-switch-topbar">
        <button
          type="button"
          className="app-topbar-btn app-lang-toggle"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={tl("layout.languageSwitch.label", "Язык интерфейса")}
          title={tl("layout.languageSwitch.label", "Язык интерфейса")}
          onClick={() => setOpen((v) => !v)}
          data-testid="lang-switch-toggle"
        >
          <span lang={locale}>{UI_LOCALE_NAMES[locale]}</span>
          <span className="app-lang-caret" aria-hidden="true">▾</span>
        </button>
        <div className="app-lang-menu" role="listbox" aria-label={tl("layout.languageSwitch.label", "Язык интерфейса")} hidden={!open}>
          {UI_LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="option"
              lang={l}
              className={l === locale ? "app-lang-btn active" : "app-lang-btn"}
              aria-selected={l === locale}
              data-locale={l}
              onClick={() => choose(l)}
            >
              {UI_LOCALE_NAMES[l]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const groupCls = "app-lang-choice";
  const btnCls = "action-btn app-lang-btn";
  return (
    <div
      className={groupCls}
      role="group"
      aria-label={tl("layout.languageSwitch.label", "Язык интерфейса")}
      data-testid={`lang-switch-${variant}`}
    >
      {UI_LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          className={l === locale ? `${btnCls} active` : btnCls}
          aria-pressed={l === locale}
          data-locale={l}
          onClick={() => choose(l)}
        >
          {UI_LOCALE_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
