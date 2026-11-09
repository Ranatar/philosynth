/**
 * Вкладка «Обсуждение» (беседа 16.3, п. 4): все ветки концепции с фильтрами
 * по адресу, виду, статусу и автору. Список берётся без серверного фильтра
 * `status` (он срезал бы ответы — у них статус всегда 'open') и фильтруется
 * на клиенте по корню ветки. Переход «→ адрес» открывает панель обсуждения
 * и прокручивает документ к месту (хозяин — SynthesisPage).
 */
import { useEffect, useMemo, useState } from "react";

import { COMMENT_KINDS, type CommentKind } from "@philosynth/shared/constants/discussion";
import type { Comment } from "@philosynth/shared/types/discussion";
import { tl } from "@philosynth/shared/i18n/t";

import { listAllComments } from "../../api/discussion";
import { addressLabel, kindLabel, orderThreads, threadsOf, type Thread } from "../../utils/discussion";
import { CommentThread, errorText } from "./CommentThread";

export interface DiscussionTabProps {
  synthesisId: string;
  me: string | null;
  canManage: boolean;
  sectionTitles: Readonly<Record<string, string>>;
  onJump: (c: Comment) => void;
  /** Внешние изменения (панель) — повод перечитать */
  version: number;
  onChanged: () => void;
}

type StatusFilter = "" | "open" | "resolved" | "hidden";

export function DiscussionTab({ synthesisId, me, canManage, sectionTitles, onJump, version, onChanged }: DiscussionTabProps) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const [fAddress, setFAddress] = useState("");
  const [fKind, setFKind] = useState<CommentKind | "">("");
  const [fStatus, setFStatus] = useState<StatusFilter>("");
  const [fAuthor, setFAuthor] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError(null);
    listAllComments(synthesisId)
      .then((rows) => {
        if (!cancelled) setComments(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err, tl("discussion.discussionTab.loadFailed", "Не удалось загрузить обсуждение.")));
      });
    return () => {
      cancelled = true;
    };
  }, [synthesisId, version, reloads]);

  const threads = useMemo(() => orderThreads(threadsOf(comments ?? [])), [comments]);

  const addresses = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of threads) m.set(`${t.root.address.kind}:${t.root.address.key}`, addressLabel(t.root.address, sectionTitles));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [threads, sectionTitles]);
  const authors = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of threads) for (const c of [t.root, ...t.replies]) if (c.author.id) m.set(c.author.id, c.author.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [threads]);

  const shown = useMemo(
    () =>
      threads.filter((t: Thread) => {
        if (fAddress && `${t.root.address.kind}:${t.root.address.key}` !== fAddress) return false;
        if (fKind && t.root.kind !== fKind) return false;
        if (fStatus && t.root.status !== fStatus) return false;
        if (fAuthor && ![t.root, ...t.replies].some((c) => c.author.id === fAuthor)) return false;
        return true;
      }),
    [threads, fAddress, fKind, fStatus, fAuthor],
  );

  const changed = () => {
    setReloads((n) => n + 1);
    onChanged();
  };

  return (
    <div className="input-form discuss-tab" data-testid="discussion-tab">
      <div className="form-section-title">{tl("discussion.discussionTab.title", "Обсуждение концепции")}</div>
      <div className="discuss-filters" data-testid="discussion-filters">
        <select className="form-select" value={fAddress} onChange={(e) => setFAddress(e.target.value)} aria-label={tl("discussion.discussionTab.fAddress", "Адрес")} data-testid="filter-address">
          <option value="">{tl("discussion.discussionTab.allAddresses", "все адреса")}</option>
          {addresses.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select className="form-select" value={fKind} onChange={(e) => setFKind(e.target.value as CommentKind | "")} aria-label={tl("discussion.discussionTab.fKind", "Вид")} data-testid="filter-kind">
          <option value="">{tl("discussion.discussionTab.allKinds", "все виды")}</option>
          {COMMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {kindLabel(k)}
            </option>
          ))}
        </select>
        <select className="form-select" value={fStatus} onChange={(e) => setFStatus(e.target.value as StatusFilter)} aria-label={tl("discussion.discussionTab.fStatus", "Статус")} data-testid="filter-status">
          <option value="">{tl("discussion.discussionTab.allStatuses", "все статусы")}</option>
          <option value="open">{tl("discussion.discussionTab.statusOpen", "открытые")}</option>
          <option value="resolved">{tl("discussion.discussionTab.statusResolved", "решённые")}</option>
          {canManage && <option value="hidden">{tl("discussion.discussionTab.statusHidden", "скрытые")}</option>}
        </select>
        <select className="form-select" value={fAuthor} onChange={(e) => setFAuthor(e.target.value)} aria-label={tl("discussion.discussionTab.fAuthor", "Автор")} data-testid="filter-author">
          <option value="">{tl("discussion.discussionTab.allAuthors", "все авторы")}</option>
          {authors.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="discuss-error">{error}</p>}
      {!comments && !error && <p className="discuss-muted">{tl("common.loading", "Загрузка…")}</p>}
      {comments && shown.length === 0 && (
        <p className="discuss-muted" data-testid="discussion-empty">
          {threads.length === 0 ? tl("discussion.discussionTab.empty", "Обсуждение ещё не начато: пометки ◉ у разделов, подразделов и строк таблиц открывают панель.") : tl("discussion.discussionTab.noneMatch", "Под фильтры не подходит ни одна ветка.")}
        </p>
      )}
      <div className="discuss-tab-list" data-testid="discussion-list" data-count={shown.length}>
        {shown.map((t) => (
          <CommentThread key={t.root.id} synthesisId={synthesisId} thread={t} me={me} canManage={canManage} showAddress sectionTitles={sectionTitles} onJump={onJump} onChanged={changed} />
        ))}
      </div>
    </div>
  );
}
