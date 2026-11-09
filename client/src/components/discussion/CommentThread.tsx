/**
 * Ветка обсуждения (беседа 16.3, п. 3): корень с видом и состоянием, ответы,
 * форма ответа, решить/переоткрыть (автор корня или владелец), скрыть/
 * показать (владелец), правка и удаление своего комментария. Решённая ветка
 * свёрнута (<details class="sec-disclosure">), открытая — развёрнута.
 *
 * Все тексты — через UserText (экранированный текст). Права на кнопки —
 * по данным сервера (author.id, capabilities.manage); сервер проверяет сам,
 * клиент лишь не рисует неработающее (правило 8.7).
 *
 * Удаление своего комментария необратимо — второй шаг (useSecondStep,
 * правило 8.4); скрытие/решение обратимы — без шага.
 */
import { useState } from "react";

import { COMMENT_BODY_MAX, COMMENT_KINDS, type CommentKind } from "@philosynth/shared/constants/discussion";
import type { Comment } from "@philosynth/shared/types/discussion";
import { tl } from "@philosynth/shared/i18n/t";

import { ApiError } from "../../api/client";
import {
  createComment,
  deleteComment,
  hideComment,
  reopenThread,
  resolveThread,
  unhideComment,
  updateComment,
} from "../../api/discussion";
import { useSecondStep } from "../../hooks/useSecondStep";
import { addressLabel, authorNote, fmtWhen, kindLabel, type Thread } from "../../utils/discussion";
import { UserText } from "./UserText";

export function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export interface CommentThreadProps {
  synthesisId: string;
  thread: Thread;
  /** id смотрящего (auth-store); null — неизвестен */
  me: string | null;
  canManage: boolean;
  /** Показывать адрес ветки (вкладка «Обсуждение»); в панели адреса — нет */
  showAddress?: boolean | undefined;
  sectionTitles?: Readonly<Record<string, string>> | undefined;
  /** Переход к адресу (вкладка «Обсуждение» → документ) */
  onJump?: ((c: Comment) => void) | undefined;
  /** Что-то изменилось — хозяин перечитывает список и сводку */
  onChanged: () => void;
}

function KindSelect({ value, onChange, disabled }: { value: CommentKind | ""; onChange: (v: CommentKind | "") => void; disabled: boolean }) {
  return (
    <select className="form-select discuss-kind" value={value} onChange={(e) => onChange(e.target.value as CommentKind | "")} disabled={disabled} aria-label={tl("discussion.commentThread.kind", "Вид")}>
      <option value="">{tl("discussion.commentThread.kindNone", "без вида")}</option>
      {COMMENT_KINDS.map((k) => (
        <option key={k} value={k}>
          {kindLabel(k)}
        </option>
      ))}
    </select>
  );
}

/** Строка-автор: имя · пометка · время · «изменён» */
function Byline({ c }: { c: Comment }) {
  const note = authorNote(c.author);
  return (
    <div className="discuss-byline">
      <span className="discuss-author">{c.author.deleted ? note : c.author.name}</span>
      {!c.author.deleted && note && <span className="discuss-note">{note}</span>}
      {c.kind && <span className="discuss-kind-chip">{kindLabel(c.kind)}</span>}
      <span className="discuss-when">{fmtWhen(c.createdAt)}</span>
      {c.edited && <span className="discuss-note">{tl("discussion.commentThread.edited", "изменён")}</span>}
    </div>
  );
}

function CommentBody({ c, me, synthesisId, canManage, onChanged }: { c: Comment; me: string | null; synthesisId: string; canManage: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const [kind, setKind] = useState<CommentKind | "">(c.kind ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const delStep = useSecondStep(busy);
  const mine = me !== null && c.author.id === me;

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(errorText(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  if (c.hidden && !mine && !canManage) {
    return <p className="discuss-hidden">{tl("discussion.commentThread.hiddenByOwner", "скрыто владельцем")}</p>;
  }
  if (c.deleted) {
    return <p className="discuss-hidden">{tl("discussion.commentThread.deletedByAuthor", "удалено автором")}</p>;
  }
  return (
    <div className={c.hidden ? "discuss-body is-hidden" : "discuss-body"}>
      {c.hidden && <p className="discuss-hidden">{tl("discussion.commentThread.hiddenMark", "скрыто владельцем — видно вам и автору")}</p>}
      {editing ? (
        <div className="discuss-form">
          <textarea className="form-textarea" value={draft} maxLength={COMMENT_BODY_MAX} onChange={(e) => setDraft(e.target.value)} disabled={busy} rows={4} />
          <div className="discuss-form-row">
            <KindSelect value={kind} onChange={setKind} disabled={busy} />
            <button
              type="button"
              className="action-btn primary"
              disabled={busy || draft.trim().length === 0}
              onClick={() =>
                void run(async () => {
                  await updateComment(synthesisId, c.id, { body: draft, kind: kind === "" ? null : kind });
                  setEditing(false);
                }, tl("discussion.commentThread.saveFailed", "Не удалось сохранить."))
              }
            >
              {tl("common.save", "Сохранить")}
            </button>
            <button type="button" className="action-btn" disabled={busy} onClick={() => { setEditing(false); setDraft(c.body); setKind(c.kind ?? ""); }}>
              {tl("common.cancel", "Отмена")}
            </button>
          </div>
        </div>
      ) : (
        <UserText text={c.body} />
      )}
      {(mine || canManage) && !editing && (
        <div className="discuss-actions" ref={delStep.ref as React.RefObject<HTMLDivElement | null>}>
          {mine && (
            <button type="button" className="discuss-link" disabled={busy} onClick={() => setEditing(true)}>
              {tl("discussion.commentThread.edit", "править")}
            </button>
          )}
          {mine &&
            (delStep.armed ? (
              <>
                <button type="button" className="discuss-link danger" disabled={busy} data-testid="comment-delete-confirm" onClick={() => void run(() => deleteComment(synthesisId, c.id), tl("discussion.commentThread.deleteFailed", "Не удалось удалить."))}>
                  {tl("discussion.commentThread.deleteConfirm", "точно удалить?")}
                </button>
                <button type="button" className="discuss-link" disabled={busy} onClick={delStep.disarm}>
                  {tl("common.cancel", "Отмена")}
                </button>
              </>
            ) : (
              <button type="button" className="discuss-link" disabled={busy} data-testid="comment-delete" onClick={() => delStep.arm(true)}>
                {tl("discussion.commentThread.delete", "удалить")}
              </button>
            ))}
          {canManage &&
            (c.hidden ? (
              <button type="button" className="discuss-link" disabled={busy} data-testid="comment-unhide" onClick={() => void run(() => unhideComment(synthesisId, c.id), tl("discussion.commentThread.unhideFailed", "Не удалось показать."))}>
                {tl("discussion.commentThread.unhide", "показать")}
              </button>
            ) : (
              <button type="button" className="discuss-link" disabled={busy} data-testid="comment-hide" onClick={() => void run(() => hideComment(synthesisId, c.id), tl("discussion.commentThread.hideFailed", "Не удалось скрыть."))}>
                {tl("discussion.commentThread.hide", "скрыть")}
              </button>
            ))}
        </div>
      )}
      {error && <p className="discuss-error">{error}</p>}
    </div>
  );
}

export function CommentThread({ synthesisId, thread, me, canManage, showAddress = false, sectionTitles, onJump, onChanged }: CommentThreadProps) {
  const { root, replies } = thread;
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolved = root.status === "resolved";
  const mine = me !== null && root.author.id === me;
  const canResolve = mine || canManage;

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(errorText(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const heading = (
    <>
      <span className={resolved ? "discuss-status resolved" : "discuss-status"}>
        {resolved ? tl("discussion.commentThread.statusResolved", "решено") : tl("discussion.commentThread.statusOpen", "открыто")}
      </span>
      {root.resolution.state !== "current" && (
        <span className="discuss-note warn">
          {root.resolution.state === "deleted" ? tl("discussion.commentThread.objectDeleted", "объект удалён") : tl("discussion.commentThread.outdated", "прежняя версия")}
        </span>
      )}
      {showAddress && (
        <span className="discuss-address">
          {onJump ? (
            <button type="button" className="discuss-link" onClick={() => onJump(root)} data-testid="thread-jump">
              {addressLabel(root.address, sectionTitles)} →
            </button>
          ) : (
            addressLabel(root.address, sectionTitles)
          )}
        </span>
      )}
      {replies.length > 0 && (
        <span className="discuss-note">
          {tl("discussion.commentThread.replies", "{n, plural, one {# ответ} few {# ответа} many {# ответов} other {# ответа}}", { n: replies.length })}
        </span>
      )}
    </>
  );

  const body = (
    <>
      <Byline c={root} />
      <CommentBody c={root} me={me} synthesisId={synthesisId} canManage={canManage} onChanged={onChanged} />
      {replies.map((r) => (
        <div className="discuss-reply" key={r.id} data-testid="thread-reply">
          <Byline c={r} />
          <CommentBody c={r} me={me} synthesisId={synthesisId} canManage={canManage} onChanged={onChanged} />
        </div>
      ))}
      <div className="discuss-actions discuss-thread-actions">
        {!replying && (
          <button type="button" className="discuss-link" disabled={busy} data-testid="thread-reply-btn" onClick={() => setReplying(true)}>
            {tl("discussion.commentThread.reply", "ответить")}
          </button>
        )}
        {canResolve &&
          (resolved ? (
            <button type="button" className="discuss-link" disabled={busy} data-testid="thread-reopen" onClick={() => void run(() => reopenThread(synthesisId, root.id), tl("discussion.commentThread.reopenFailed", "Не удалось переоткрыть."))}>
              {tl("discussion.commentThread.reopen", "переоткрыть")}
            </button>
          ) : (
            <button type="button" className="discuss-link" disabled={busy} data-testid="thread-resolve" onClick={() => void run(() => resolveThread(synthesisId, root.id), tl("discussion.commentThread.resolveFailed", "Не удалось решить."))}>
              {tl("discussion.commentThread.resolve", "решить")}
            </button>
          ))}
      </div>
      {replying && (
        <div className="discuss-form">
          <textarea
            className="form-textarea"
            value={reply}
            maxLength={COMMENT_BODY_MAX}
            rows={3}
            disabled={busy}
            placeholder={tl("discussion.commentThread.replyPlaceholder", "Ответ…")}
            onChange={(e) => setReply(e.target.value)}
            data-testid="thread-reply-input"
          />
          <div className="discuss-form-row">
            <button
              type="button"
              className="action-btn primary"
              disabled={busy || reply.trim().length === 0}
              data-testid="thread-reply-send"
              onClick={() =>
                void run(async () => {
                  await createComment(synthesisId, { parentId: root.id, body: reply });
                  setReply("");
                  setReplying(false);
                }, tl("discussion.commentThread.replyFailed", "Не удалось ответить."))
              }
            >
              {tl("discussion.commentThread.send", "Отправить")}
            </button>
            <button type="button" className="action-btn" disabled={busy} onClick={() => { setReplying(false); setReply(""); }}>
              {tl("common.cancel", "Отмена")}
            </button>
          </div>
        </div>
      )}
      {error && <p className="discuss-error">{error}</p>}
    </>
  );

  if (resolved) {
    return (
      <details className="sec-disclosure discuss-thread resolved" data-testid="thread" data-status="resolved">
        <summary className="discuss-thread-summary">{heading}</summary>
        <div className="disclosure-body">{body}</div>
      </details>
    );
  }
  return (
    <div className="discuss-thread" data-testid="thread" data-status={root.status}>
      <div className="discuss-thread-summary">{heading}</div>
      {body}
    </div>
  );
}
