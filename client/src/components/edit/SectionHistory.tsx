/**
 * SectionHistory — вход в историю версий РАЗДЕЛА. Беседа 12.4 (Д-14).
 *
 * Сервер пишет версию elementType 'section' при ручной правке подраздела
 * (9.2), правке капсулы (5.1), ретрофите таблицы рекомендаций (10.1) и
 * автозамене имён; откатывает её POST …/elements/section/:id/rollback
 * (возвращает html_content и is_edited из снимка; у капсулы — и
 * syntheses.capsule_html, 12.1). До 12.4 панель VersionHistory была
 * встроена только в ElementEditor — испорченный правкой подраздел из
 * интерфейса было не вернуть.
 *
 * Два хозяина: раздел в документе (слот inlineEditorFor SynthesisPage —
 * под HTML раздела, как редактор строки 5.2) и карточка раздела в EditModal
 * (EditSectionCard). Оба — только владельцу и не при генерации (гейты
 * сервера 5.1 те же). elementId — SectionSummary.id / SectionFull.id (DTO
 * расширены 12.4); у капсулы без строки sections (импорт 4.3) — id синтеза.
 *
 * После отката хозяин перечитывает разделы; capsuleUpdated в ответе —
 * повод обновить шапку (applySynthesis с capsuleHtml). «Почему» версии
 * (origin 10.2) рисует сама VersionHistory — как у элементов.
 */
import { useState } from "react";

import type { RollbackResponse } from "../../api/elements";
import { tl } from "@philosynth/shared/i18n/t";

import { VersionHistory } from "./VersionHistory";

export interface SectionHistoryProps {
  synthesisId: string;
  /** id строки sections (SectionSummary.id); капсула без строки — id синтеза */
  sectionId: string;
  /** Текущее состояние раздела — правая сторона diff для самой новой версии */
  current: { title: string; htmlContent: string; secContext?: string; isEdited: boolean };
  /** Откат недоступен (генерация / занято) */
  disabled?: boolean | undefined;
  onRolledBack?: ((res: RollbackResponse) => void) | undefined;
  onClose?: (() => void) | undefined;
  /** Заголовок панели — метка раздела */
  label: string;
}

export function SectionHistory({
  synthesisId,
  sectionId,
  current,
  disabled = false,
  onRolledBack,
  onClose,
  label,
}: SectionHistoryProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const currentData: Record<string, unknown> = {
    title: current.title,
    htmlContent: current.htmlContent,
    secContext: current.secContext ?? "",
    isEdited: current.isEdited,
  };
  return (
    <div className="inline-edit-form section-history" data-testid="section-history" data-section-id={sectionId}>
      <div className="element-editor-head">
        <span className="form-section-title element-editor-title">
          {tl("edit.sectionHistory.title", "◷ История версий раздела · {label}", { label })}
        </span>
        {onClose && (
          <button type="button" className="raw-close" title={tl("common.close", "Закрыть")} onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      <div className="form-sublabel section-history-note">
        {tl("edit.sectionHistory.note", "Версии — снимки раздела до каждой правки: ручной правки подраздела, правки капсулы, ретрофита таблицы рекомендаций, автозамены имён. Откат возвращает разметку раздела из снимка; таблицы, которые служба рисует из БД, он не трогает.")}
      </div>
      <VersionHistory
        synthesisId={synthesisId}
        elementType="section"
        elementId={sectionId}
        currentData={currentData}
        refreshKey={refreshKey}
        disabled={disabled}
        onRolledBack={(res) => {
          setRefreshKey((k) => k + 1);
          onRolledBack?.(res);
        }}
      />
    </div>
  );
}
