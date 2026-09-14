/**
 * Шапка документа. Беседа 1.6b (запрос 1, п. 3).
 *
 * Порт разметки #docOutput [4169–4201] и заполнения шапки при старте
 * генерации [12110–12144] (фрагмент 1.6-document-view.js):
 *  - Документ № — synthesis.docNum (генерирует сервер, беседа 1.6);
 *  - Дата составления — createdAt в ru-RU (day 2-digit / month long / year);
 *  - Метод/Глубина/Уровень — метки ML/DL/SL (shared/constants/labels);
 *  - подзаголовок — три ветки исходника: свободный синтез / участники с
 *    концепциями («На основе: философы + концепции») / только философы;
 *  - раскрывающиеся поля (makeHeaderDisclosure/buildDocHeaderExtras
 *    [11599–11619]): «Зерно концепции», «Дополнительный контекст»;
 *  - капсула живёт В ШАПКЕ (updateCapsuleInHeader [11773]): золотой
 *    disclosure, открыт по умолчанию; текст — extractCapsuleText
 *    (порт 1.5b, client/src/utils/concept-file.ts).
 *
 * editDocTitle [11845] портирован как кнопка ✎ → prompt() → PATCH
 * /syntheses/:id { title } (беседа 1.6, только владелец; 403 у чужого
 * документа показывается алертом — SynthesisFull не несёт userId,
 * владение клиенту заранее не известно). Ветка genealogy исходника
 * (updateGenealogyInHeader) — беседа 3.2.
 *
 * Беседа 8.4 (п. 6): правка капсулы по месту — кнопка ✎ у капсулы
 * (.doc-title-edit-btn, как у названия), textarea с ТЕКСТОМ капсулы,
 * «Сохранить»/«Отмена»; HTML пересобирается buildCapsuleHtml
 * (utils/capsule-html: обёртка секции и <h4> сохраняются, содержимое →
 * абзацы) и уходит в updateCapsule (api/elements, написана 5.1 и до 8.4
 * не вызывалась); ответ { capsuleHtml } → applySynthesis. Кнопка есть
 * ТОЛЬКО у владельца (SynthesisFull.isOwner, 5.2) — у чужого документа
 * её нет вовсе; при status='generating' — disabled (сервер ответит 409).
 * Попутно под тот же гейт isOwner подведён ✎ названия (оптимизм 1.6b
 * «403 решит» с появлением флага 5.2 не нужен).
 */
import { useMemo, useState } from "react";

import { DL, ML, SL } from "@philosynth/shared/constants/labels";
import type { SynthesisFull } from "@philosynth/shared/types/synthesis";

import { ApiError } from "../../api/client";
import { updateCapsule } from "../../api/elements";
import { updateSynthesis } from "../../api/syntheses";
import { useSynthesisStore } from "../../stores/synthesis-store";
import { buildCapsuleHtml } from "../../utils/capsule-html";
import { extractCapsuleText } from "../../utils/concept-file";

export interface DocumentHeaderProps {
  synthesis: SynthesisFull;
}

/** Три ветки подзаголовка [12126–12139] */
function subtitleFor(s: SynthesisFull): string {
  const hasPhil = s.philosophers.length > 0;
  const hasConcepts = s.parentSyntheses.length > 0;
  if (!hasPhil && !hasConcepts) {
    return "Свободный синтез (на основе зерна)";
  }
  if (hasConcepts) {
    const parts: string[] = [];
    if (hasPhil) parts.push(s.philosophers.join(", "));
    parts.push(s.parentSyntheses.map((p) => p.title).join(", "));
    return "На основе: " + parts.join(" + ");
  }
  return `На основе: ${s.philosophers.join(", ")}`;
}

/** Текст ошибки сохранения капсулы (8.4): коды 03 §4.3 + details.html */
export function capsuleErrorText(err: unknown): string {
  if (!(err instanceof ApiError)) return "Не удалось сохранить капсулу.";
  if (err.code === "GENERATION_IN_PROGRESS")
    return "Генерация ещё идёт — правка капсулы заблокирована.";
  if (err.code === "FORBIDDEN") return "Капсулу может менять только владелец.";
  if (err.code === "VALIDATION_ERROR") {
    const d = err.details as Record<string, unknown> | undefined;
    const v = d && typeof d === "object" ? d.html : undefined;
    return typeof v === "string" ? `Капсула: ${v}` : err.message;
  }
  return err.message || "Не удалось сохранить капсулу.";
}

function Disclosure({ label, text }: { label: string; text: string }) {
  return (
    <details className="header-disclosure">
      <summary>{label}</summary>
      <div className="disclosure-body">{text}</div>
    </details>
  );
}

export function DocumentHeader({ synthesis }: DocumentHeaderProps) {
  const applySynthesis = useSynthesisStore((s) => s.applySynthesis);

  const capsuleText = useMemo(
    () => extractCapsuleText(synthesis.capsuleHtml),
    [synthesis.capsuleHtml],
  );

  // Беседа 8.4 (п. 6): правка капсулы по месту
  const live = synthesis.status === "generating";
  const [capsuleEdit, setCapsuleEdit] = useState<{
    text: string;
    busy: boolean;
    error: string | null;
  } | null>(null);
  const startCapsuleEdit = () =>
    setCapsuleEdit({ text: capsuleText, busy: false, error: null });
  const saveCapsule = async () => {
    if (!capsuleEdit || capsuleEdit.busy) return;
    if (!capsuleEdit.text.trim()) {
      setCapsuleEdit({ ...capsuleEdit, error: "Капсула не может быть пустой." });
      return;
    }
    setCapsuleEdit({ ...capsuleEdit, busy: true, error: null });
    try {
      const html = buildCapsuleHtml(synthesis.capsuleHtml, capsuleEdit.text);
      const res = await updateCapsule(synthesis.id, html);
      applySynthesis({ ...synthesis, capsuleHtml: res.capsuleHtml });
      setCapsuleEdit(null);
    } catch (err) {
      setCapsuleEdit({
        ...capsuleEdit,
        busy: false,
        error: capsuleErrorText(err),
      });
    }
  };

  const docDate = new Date(synthesis.createdAt).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // editDocTitle [11845]: prompt() исходника + PATCH транспорта 1.6
  const onEditTitle = async () => {
    const defaultTitle = "Синтез Философской Концепции";
    const current = synthesis.title.trim();
    const newTitle = prompt(
      "Название концепции:",
      current === defaultTitle ? "" : current,
    );
    if (!newTitle?.trim()) return;
    try {
      const updated = await updateSynthesis(synthesis.id, {
        title: newTitle.trim(),
      });
      applySynthesis(updated);
    } catch (err) {
      alert(
        err instanceof ApiError && err.code === "FORBIDDEN"
          ? "Название может менять только владелец синтеза."
          : "Не удалось сохранить название.",
      );
    }
  };

  return (
    <div className="doc-header">
      <div className="doc-type">
        PhiloSynth Pro™ · Синтез Философской Концепции
      </div>
      <div className="doc-title">
        {synthesis.title}
        {synthesis.isOwner && (
          <button
            type="button"
            className="doc-title-edit-btn"
            title="Редактировать название"
            onClick={() => void onEditTitle()}
          >
            ✎
          </button>
        )}
      </div>
      <div className="doc-subtitle">{subtitleFor(synthesis)}</div>

      {/* buildDocHeaderExtras + updateCapsuleInHeader */}
      <div
        style={{
          marginTop: 14,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {synthesis.seed && (
          <Disclosure label="Зерно концепции" text={synthesis.seed} />
        )}
        {synthesis.context && (
          <Disclosure
            label="Дополнительный контекст"
            text={synthesis.context}
          />
        )}
        {capsuleText && (
          <details className="header-disclosure-capsule" open>
            <summary>
              ◈ Капсула концепции
              {synthesis.isOwner && !capsuleEdit && (
                <button
                  type="button"
                  className="doc-title-edit-btn"
                  title={
                    live
                      ? "Идёт генерация — правка капсулы заблокирована"
                      : "Редактировать капсулу"
                  }
                  disabled={live}
                  data-testid="capsule-edit"
                  onClick={(e) => {
                    // summary сворачивает details по клику — не даём
                    e.preventDefault();
                    e.stopPropagation();
                    startCapsuleEdit();
                  }}
                >
                  ✎
                </button>
              )}
            </summary>
            {capsuleEdit ? (
              <div className="disclosure-body inline-edit-form" data-testid="capsule-form">
                <textarea
                  className="form-textarea"
                  rows={6}
                  value={capsuleEdit.text}
                  disabled={capsuleEdit.busy}
                  onChange={(e) =>
                    setCapsuleEdit({ ...capsuleEdit, text: e.target.value, error: null })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setCapsuleEdit(null);
                    }
                  }}
                />
                {capsuleEdit.error && (
                  <div className="pool-status err" role="alert" data-testid="capsule-error">
                    {capsuleEdit.error}
                  </div>
                )}
                <div className="inline-edit-actions">
                  <button
                    type="button"
                    className="action-btn primary"
                    disabled={capsuleEdit.busy}
                    onClick={() => void saveCapsule()}
                    data-testid="capsule-save"
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    disabled={capsuleEdit.busy}
                    onClick={() => setCapsuleEdit(null)}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <div className="disclosure-body" data-testid="capsule-text">{capsuleText}</div>
            )}
          </details>
        )}
      </div>

      <div className="doc-meta-grid" style={{ marginTop: 20 }}>
        <div className="doc-meta-item">
          <span className="doc-meta-key">Документ №</span>
          <span className="doc-meta-val">{synthesis.docNum || "—"}</span>
        </div>
        <div className="doc-meta-item">
          <span className="doc-meta-key">Дата составления</span>
          <span className="doc-meta-val">{docDate}</span>
        </div>
        <div className="doc-meta-item">
          <span className="doc-meta-key">Метод синтеза</span>
          <span className="doc-meta-val gold">{ML[synthesis.method]}</span>
        </div>
        <div className="doc-meta-item">
          <span className="doc-meta-key">Глубина</span>
          <span className="doc-meta-val gold">{DL[synthesis.depth]}</span>
        </div>
        <div className="doc-meta-item">
          <span className="doc-meta-key">Уровень синтеза</span>
          <span className="doc-meta-val gold">{SL[synthesis.synthLevel]}</span>
        </div>
      </div>
    </div>
  );
}
