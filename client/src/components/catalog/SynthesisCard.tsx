/**
 * Карточка синтеза в каталоге. Беседа 1.6b (запрос 1, п. 5).
 *
 * Превью SynthesisPreview (транспорт 1.6): название, метод × уровень
 * (метки ML/SL), философы через запятую (или «свободный синтез»),
 * дата создания, статус, начало капсулы. Клик по карточке —
 * навигация на /synthesis/:id.
 *
 * На вкладке «Мои» показывается переключатель публикации
 * (PATCH /syntheses/:id { isPublic } — единственный способ попасть во
 * вкладку «Публичные», 03 §2.2); обработчик передаёт CatalogPage.
 *
 * Беседа 8.4 (запрос 1, п. 2–5): строка действий владельца —
 * «Опубликовать/Скрыть» · «Переименовать» · «Дублировать» · «Удалить»
 * (признак вкладки «Мои» — наличие обработчиков, как у публикации).
 *  - все кнопки живут ВНУТРИ <Link>: у каждой e.preventDefault() +
 *    e.stopPropagation(), иначе клик уводит на /synthesis/:id;
 *  - переименование — поле ПО МЕСТУ (.inline-edit-form кита, блок 7, а
 *    не модалка): Enter сохраняет, Esc отменяет; 400 VALIDATION_ERROR →
 *    details.title под полем;
 *  - удаление — ВТОРОЙ ШАГ КНОПОК (образец TransformPanel 5.5, правило
 *    UI-кита «подтверждение — второй шаг кнопок, не confirm»): кнопка
 *    переходит в «Точно удалить?» + «Отмена», клик мимо карточки
 *    возвращает назад; текст подтверждения называет, чем грозит
 *    удаление (CASCADE 02 §2.4), а число потомков хозяин узнаёт по
 *    GET /lineage/descendants до показа (countDescendants);
 *  - 409 GENERATION_IN_PROGRESS и прочие сбои — строкой в карточке
 *    (.pool-status.err), карточка не исчезает;
 *  - оформление — .action-btn в .catalog-card-foot; кнопка удаления
 *    красная (.action-btn.danger, --red — единственный цвет опасности).
 * Оба состояния (правка/подтверждение) — взаимоисключающие: открытие
 * одного закрывает другое.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { ML, SL } from "@philosynth/shared/constants/labels";
import type { SynthesisPreview } from "@philosynth/shared/types/synthesis";

const STATUS_LABELS: Record<string, string> = {
  draft: "черновик",
  generating: "генерируется…",
  paused: "на паузе",
  ready: "готов",
  error: "ошибка",
};

/** Множественное число «потомок» (8.4, п.4) */
export function descendantsPhrase(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "потомок"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)
        ? "потомка"
        : "потомков";
  return `${n} ${word}`;
}

/** Текст подтверждения удаления: ЧЕМ грозит (02 §2.4) + число потомков.
 *  descendantCount: null — не известно (сбой запроса) — без числа. */
export function deleteWarningText(descendantCount: number | null): string {
  const base =
    "Удаление необратимо: разделы, элементы, логи и родословная концепции будут стёрты.";
  if (descendantCount === null) return base;
  if (descendantCount === 0) return `${base} Потомков у концепции нет.`;
  return `${base} У концепции ${descendantsPhrase(descendantCount)} — они останутся без родителя.`;
}

/** Результат действия карточки: текст ошибки либо null (успех) */
export type CardActionResult = Promise<string | null>;

export interface SynthesisCardActions {
  /** PATCH { title } — ошибка возвращается строкой (details.title) */
  onRename: (s: SynthesisPreview, title: string) => CardActionResult;
  onDuplicate: (s: SynthesisPreview) => CardActionResult;
  onDelete: (s: SynthesisPreview) => CardActionResult;
  /** Число прямых потомков (GET /lineage/descendants?depth=1);
   *  null при сбое — подтверждение показывается без числа */
  countDescendants: (s: SynthesisPreview) => Promise<number | null>;
}

export interface SynthesisCardProps {
  synthesis: SynthesisPreview;
  /** Есть только на вкладке «Мои»: переключатель публикации */
  onTogglePublic?: ((s: SynthesisPreview) => void) | undefined;
  /** id синтеза, чей PATCH публикации сейчас в полёте */
  togglingId?: string | null | undefined;
  /** Беседа 8.4: действия владельца (только на вкладке «Мои») */
  actions?: SynthesisCardActions | undefined;
}

type Mode =
  | { kind: "view" }
  | { kind: "rename"; value: string; error: string | null; busy: boolean }
  | {
      kind: "confirm-delete";
      descendants: number | null;
      loading: boolean;
      busy: boolean;
    };

function stop(e: { preventDefault(): void; stopPropagation(): void }) {
  // Клик по кнопке не должен открывать /synthesis/:id
  e.preventDefault();
  e.stopPropagation();
}

export function SynthesisCard({
  synthesis,
  onTogglePublic,
  togglingId,
  actions,
}: SynthesisCardProps) {
  const phil =
    synthesis.philosophers.length > 0
      ? synthesis.philosophers.join(", ")
      : "свободный синтез";
  const date = new Date(synthesis.createdAt).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [status, setStatus] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const cardRef = useRef<HTMLAnchorElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Второй шаг возвращается назад по клику МИМО карточки (правило кита)
  useEffect(() => {
    if (mode.kind !== "confirm-delete" || mode.busy) return;
    const onDown = (ev: MouseEvent) => {
      const el = cardRef.current;
      if (el && ev.target instanceof Node && !el.contains(ev.target))
        setMode({ kind: "view" });
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [mode]);

  useEffect(() => {
    if (mode.kind === "rename") inputRef.current?.focus();
  }, [mode.kind]);

  const startRename = () => {
    setStatus(null);
    setMode({ kind: "rename", value: synthesis.title, error: null, busy: false });
  };

  const submitRename = async () => {
    if (!actions || mode.kind !== "rename" || mode.busy) return;
    const title = mode.value;
    setMode({ ...mode, busy: true, error: null });
    const err = await actions.onRename(synthesis, title);
    if (err) setMode({ kind: "rename", value: title, error: err, busy: false });
    else setMode({ kind: "view" });
  };

  const armDelete = async () => {
    if (!actions) return;
    setStatus(null);
    setMode({ kind: "confirm-delete", descendants: null, loading: true, busy: false });
    // Число потомков — ДО показа числа в подтверждении (8.4, п.4)
    const n = await actions.countDescendants(synthesis);
    setMode((m) =>
      m.kind === "confirm-delete" ? { ...m, descendants: n, loading: false } : m,
    );
  };

  const confirmDelete = async () => {
    if (!actions || mode.kind !== "confirm-delete" || mode.busy) return;
    setMode({ ...mode, busy: true });
    const err = await actions.onDelete(synthesis);
    // Успех: хозяин перечитывает список, карточка исчезает вместе с ним
    if (err) {
      setStatus(err);
      setMode({ kind: "view" });
    }
  };

  const duplicate = async () => {
    if (!actions || duplicating) return;
    setStatus(null);
    setDuplicating(true);
    const err = await actions.onDuplicate(synthesis);
    setDuplicating(false);
    if (err) setStatus(err);
  };

  const busy = duplicating || (mode.kind !== "view" && mode.busy);

  return (
    <Link
      ref={cardRef}
      to={`/synthesis/${synthesis.id}`}
      className="catalog-card"
      data-synthesis-id={synthesis.id}
    >
      <div className="catalog-card-head">
        <div className="section-title" style={{ margin: 0, padding: 0, border: "none" }}>
          {synthesis.title}
        </div>
        <span className="header-badges" style={{ flexDirection: "row", gap: 6 }}>
          {/* Беседа 3.2 (п. 5): бейдж мета-синтеза (родители-концепции
              в генеалогии — SynthesisPreview.hasConceptParents) */}
          {synthesis.hasConceptParents && (
            <span className="cert-badge gold">◈ мета-синтез</span>
          )}
          <span className="cert-badge">
            {STATUS_LABELS[synthesis.status] ?? synthesis.status}
          </span>
        </span>
      </div>

      <div className="doc-meta-val gold">
        {ML[synthesis.method]} × {SL[synthesis.synthLevel]}
      </div>

      <div className="doc-content" style={{ marginTop: 6 }}>{phil}</div>

      {synthesis.capsulePreview && (
        <p className="catalog-card-preview">{synthesis.capsulePreview}</p>
      )}

      {/* Беседа 8.4 (п. 3): переименование по месту */}
      {actions && mode.kind === "rename" && (
        <div
          className="inline-edit-form catalog-card-rename"
          data-testid="card-rename-form"
          onClick={stop}
        >
          <label className="form-label" htmlFor={`rename-${synthesis.id}`}>
            Название
          </label>
          <input
            id={`rename-${synthesis.id}`}
            ref={inputRef}
            type="text"
            className="form-input"
            value={mode.value}
            disabled={mode.busy}
            onChange={(e) =>
              setMode({ ...mode, value: e.target.value, error: null })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitRename();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setMode({ kind: "view" });
              }
            }}
          />
          {mode.error && (
            <div className="pool-status err" role="alert" data-testid="card-rename-error">
              {mode.error}
            </div>
          )}
          <div className="inline-edit-actions">
            <button
              type="button"
              className="action-btn primary"
              disabled={mode.busy}
              onClick={(e) => {
                stop(e);
                void submitRename();
              }}
              data-testid="card-rename-save"
            >
              Сохранить
            </button>
            <button
              type="button"
              className="action-btn"
              disabled={mode.busy}
              onClick={(e) => {
                stop(e);
                setMode({ kind: "view" });
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Беседа 8.4 (п. 4): второй шаг удаления — чем грозит + потомки */}
      {actions && mode.kind === "confirm-delete" && (
        <div
          className="transform-warn catalog-card-danger"
          data-testid="card-delete-warn"
          onClick={stop}
        >
          {mode.loading ? "Считаю потомков…" : deleteWarningText(mode.descendants)}
        </div>
      )}

      {status && (
        <div className="pool-status err" role="alert" data-testid="card-status">
          {status}
        </div>
      )}

      <div className="catalog-card-foot">
        <span className="doc-footer-left">{date}</span>
        {(onTogglePublic || actions) && (
          <span className="catalog-card-actions" data-testid="card-actions">
            {onTogglePublic && mode.kind !== "confirm-delete" && (
              <button
                type="button"
                className="action-btn"
                disabled={togglingId === synthesis.id || busy}
                onClick={(e) => {
                  stop(e);
                  onTogglePublic(synthesis);
                }}
              >
                {synthesis.isPublic ? "Скрыть" : "Опубликовать"}
              </button>
            )}
            {actions && mode.kind === "confirm-delete" ? (
              <>
                <button
                  type="button"
                  className="action-btn danger"
                  disabled={mode.busy || mode.loading}
                  onClick={(e) => {
                    stop(e);
                    void confirmDelete();
                  }}
                  data-testid="card-delete-confirm"
                >
                  Точно удалить?
                </button>
                <button
                  type="button"
                  className="action-btn"
                  disabled={mode.busy}
                  onClick={(e) => {
                    stop(e);
                    setMode({ kind: "view" });
                  }}
                  data-testid="card-delete-cancel"
                >
                  Отмена
                </button>
              </>
            ) : actions ? (
              <>
                <button
                  type="button"
                  className="action-btn"
                  disabled={busy || mode.kind === "rename"}
                  onClick={(e) => {
                    stop(e);
                    startRename();
                  }}
                  data-testid="card-rename"
                >
                  Переименовать
                </button>
                <button
                  type="button"
                  className="action-btn"
                  disabled={busy}
                  onClick={(e) => {
                    stop(e);
                    void duplicate();
                  }}
                  data-testid="card-duplicate"
                >
                  {duplicating ? "Дублирую…" : "Дублировать"}
                </button>
                <button
                  type="button"
                  className="action-btn danger"
                  disabled={busy}
                  onClick={(e) => {
                    stop(e);
                    void armDelete();
                  }}
                  data-testid="card-delete"
                >
                  Удалить
                </button>
              </>
            ) : null}
          </span>
        )}
      </div>
    </Link>
  );
}
