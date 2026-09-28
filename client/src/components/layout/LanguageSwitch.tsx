/**
 * Переключатель языка интерфейса ru / en / de (беседа 11.3, п. 3).
 *
 * Два вида одного компонента:
 *   "topbar" — в тёмной .topbar шапки (и гостю, и вошедшему), кнопки в
 *              идиоме .app-topbar-btn (моно, капитель, прозрачный фон);
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

  const choose = (next: UiLocale) => {
    if (next === locale) return;
    if (authenticated) void setUiLocale(next); // сам применит язык и вызовет PATCH
    else void setLocale(next);
  };

  const groupCls = variant === "topbar" ? "app-lang-switch" : "app-lang-choice";
  const btnCls = variant === "topbar" ? "app-topbar-btn app-lang-btn" : "action-btn app-lang-btn";
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
