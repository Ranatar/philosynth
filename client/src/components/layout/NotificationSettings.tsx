/**
 * Раздел «Уведомления» профиля (беседа 16.2, первый запрос, п. 4):
 * категории, которые можно отключить (отключённая не пишется вовсе — ни в
 * колокольчик, ни в сводку), и переключатель почтовой сводки. Каждый
 * переключатель — PATCH /notifications/settings сразу (как язык 11.3);
 * ошибка — строкой под списком, состояние откатывается к ответу сервера.
 */
import { useEffect, useState } from "react";

import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "@philosynth/shared/constants/notifications";
import type { NotificationSettings as Settings } from "@philosynth/shared/types/notifications";
import { tl } from "@philosynth/shared/i18n/t";

import { ApiError } from "../../api/client";
import { getNotificationSettings, updateNotificationSettings } from "../../api/notifications";

export function categoryLabel(c: NotificationCategory): string {
  switch (c) {
    case "membership":
      return tl("notificationSettings.catMembership", "Участие: приглашения, принятие, роль, исключение");
    case "comments":
      return tl("notificationSettings.catComments", "Комментарии: новые и ответы в моих ветках");
    case "reviews":
      return tl("notificationSettings.catReviews", "Рецензии: публикация");
    case "outdated":
      return tl("notificationSettings.catOutdated", "Устаревание: объект моего открытого замечания изменился");
    case "proposals":
      return tl("notificationSettings.catProposals", "Предложения изменений (Фаза 17)");
  }
}

export function NotificationSettingsSection() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getNotificationSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : tl("notificationSettings.loadFailed", "Не удалось загрузить настройки уведомлений."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(patch: Partial<Settings>) {
    if (busy || !settings) return;
    setBusy(true);
    setError(null);
    const prev = settings;
    setSettings({ ...settings, ...patch });
    try {
      setSettings(await updateNotificationSettings(patch));
    } catch (err) {
      setSettings(prev);
      setError(err instanceof ApiError ? err.message : tl("notificationSettings.saveFailed", "Не удалось сохранить настройки."));
    } finally {
      setBusy(false);
    }
  }

  function toggleCategory(c: NotificationCategory, enabled: boolean) {
    if (!settings) return;
    const muted = new Set(settings.mutedCategories);
    if (enabled) muted.delete(c);
    else muted.add(c);
    void save({ mutedCategories: [...muted] });
  }

  return (
    <div className="input-form" data-testid="profile-notifications">
      <div className="form-section-title">{tl("notificationSettings.title", "Уведомления")}</div>
      {!settings && !error && <span className="meta-label">{tl("common.loading", "Загрузка…")}</span>}
      {settings && (
        <>
          <div className="form-sublabel">
            {tl("notificationSettings.hint", "Отключённая категория не записывается вовсе — ни в колокольчик, ни в почтовую сводку.")}
          </div>
          <div className="notif-settings-list">
            {NOTIFICATION_CATEGORIES.map((c) => {
              const enabled = !settings.mutedCategories.includes(c);
              return (
                <label key={c} className="notif-settings-row" data-testid={`notif-cat-${c}`} data-enabled={enabled ? "1" : "0"}>
                  <input type="checkbox" checked={enabled} disabled={busy} onChange={(e) => toggleCategory(c, e.target.checked)} />
                  <span>{categoryLabel(c)}</span>
                </label>
              );
            })}
          </div>
          <label className="notif-settings-row notif-settings-digest" data-testid="notif-digest" data-enabled={settings.emailDigest ? "1" : "0"}>
            <input type="checkbox" checked={settings.emailDigest} disabled={busy} onChange={(e) => void save({ emailDigest: e.target.checked })} />
            <span>{tl("notificationSettings.digest", "Присылать сводку непрочитанного по почте (не чаще раза в несколько часов)")}</span>
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="callout warning">
          {error}
        </p>
      )}
    </div>
  );
}
