/**
 * Сообщение о конфликте версий (беседа 17.2, Д-81): что разошлось (с текущим
 * значением из ответа сервера), что запись не сделана, и ЕДИНСТВЕННЫЙ выбор —
 * «Перечитать и повторить». Кнопки «перезаписать» нет и быть не может
 * (сторож 4bq): клиент не умеет слать запись без ожидания.
 *
 * Оформление — выноска `.callout.warning` исходника; свой класс
 * `.version-conflict` несёт только отступы и строку «текущее значение»
 * (CSS, блок «Беседа 17.2»).
 */
import type { ReactNode } from "react";

import { tl } from "@philosynth/shared/i18n/t";

import { conflictAdvice, conflictText, type VersionConflictDetails } from "../../utils/version-conflict";

export interface VersionConflictNoticeProps {
  conflicts: readonly VersionConflictDetails[];
  /** Имя адресата для фразы (один адресат) либо подписи по target (план) */
  nameOf?: ((target: string) => string | undefined) | undefined;
  /** Идёт перечитка */
  busy?: boolean | undefined;
  /** После перечитки: форма уже на текущем состоянии — кнопки нет, есть
   *  подсказка «проверьте и сохраните снова» и (если дано) текущее значение */
  reread?: boolean | undefined;
  /** Текущее состояние после перечитки (поля, изменённые другими; текст) */
  current?: ReactNode | undefined;
  onReread: () => void;
  onDismiss?: (() => void) | undefined;
}

export function VersionConflictNotice({ conflicts, nameOf, busy = false, reread = false, current, onReread, onDismiss }: VersionConflictNoticeProps) {
  return (
    <div className="callout warning version-conflict" role="alert" data-testid="version-conflict" data-reread={reread ? "1" : "0"}>
      <span className="callout-label">{tl("edit.versionConflict.label", "Конфликт версий")}</span>
      {conflicts.length === 0 && <div>{tl("edit.versionConflict.generic", "Документ изменили, пока вы правили.")}</div>}
      {conflicts.map((c) => (
        <div key={c.target} data-conflict-target={c.target}>
          {conflictText(c, nameOf?.(c.target))}
        </div>
      ))}
      {reread ? (
        <>
          <div className="version-conflict-advice" data-testid="version-conflict-reread-note">
            {tl("edit.versionConflict.rereadNote", "Перечитано: форма стоит на текущем состоянии, ваше набранное сохранено. Проверьте и сохраните снова.")}
          </div>
          {current && <div className="version-conflict-current" data-testid="version-conflict-current">{current}</div>}
        </>
      ) : (
        <>
          <div className="version-conflict-advice">{conflictAdvice()}</div>
          <div className="inline-edit-actions">
            <button type="button" className="action-btn primary" disabled={busy} onClick={onReread} data-testid="version-conflict-reread">
              {busy ? tl("edit.versionConflict.rereading", "Перечитываю…") : tl("edit.versionConflict.reread", "Перечитать и повторить")}
            </button>
            {onDismiss && (
              <button type="button" className="action-btn" disabled={busy} onClick={onDismiss} data-testid="version-conflict-dismiss">
                {tl("common.cancel", "Отмена")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
