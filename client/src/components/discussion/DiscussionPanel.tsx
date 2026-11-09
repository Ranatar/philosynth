/**
 * Панель обсуждения адреса (беседа 16.3, п. 3). Пристыкована к правому краю
 * (position: fixed), документ остаётся виден и прокручивается — обсуждение
 * ведётся, глядя на место (на узких экранах — во весь экран). Это второе
 * после колокольчика 16.2 исключение из правила «раскрытие на месте, а не
 * поповер» (01 §8): раскрытие под разделом сдвигало бы весь документ ниже
 * и терялось бы при переходе к другому адресу; панель — одна на страницу.
 *
 * Содержимое:
 *  - название объекта и состояние адреса: текущая версия / «относится к
 *    прежней версии» с выдержкой «как было» (excerpt записи) / «объект
 *    удалён» (у адреса без записей — текущая: панель открыта с места);
 *  - ветки: открытые развёрнуты, решённые свёрнуты (CommentThread);
 *  - форма: тело + необязательный вид (вопрос/возражение/источник/неясность),
 *    «Отправить» — комментарий; «В мою рецензию» — замечание в мой черновик
 *    рецензии (создаётся, если его нет) по этому же адресу;
 *  - РЯДОМ, не слитно: замечания опубликованных рецензий об этом адресе и
 *    (владельцу — GET /recommendations только ему, 10.3) рекомендации
 *    критики, чей адрес — этот подраздел/раздел/элемент. Группировка —
 *    только по адресу, никакой машинной.
 * Кнопок изменения документа здесь нет (Фаза 17). Тексты — UserText.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { COMMENT_BODY_MAX, COMMENT_KINDS, type CommentKind } from "@philosynth/shared/constants/discussion";
import type { Comment, Review, ReviewFinding } from "@philosynth/shared/types/discussion";
import type { Recommendation } from "@philosynth/shared/types/recommendations";
import { nameKey, parseSubsectionKey } from "@philosynth/shared/utils/discussion-address";
import { tl } from "@philosynth/shared/i18n/t";

import { createComment, listAllComments } from "../../api/discussion";
import { kindLabel, orderThreads, stateLabel, threadsOf, type MarkTarget } from "../../utils/discussion";
import { CommentThread, errorText } from "./CommentThread";
import { UserText } from "./UserText";

export interface DiscussionPanelProps {
  synthesisId: string;
  target: MarkTarget;
  me: string | null;
  canManage: boolean;
  sectionTitles: Readonly<Record<string, string>>;
  /** Рецензии концепции (список вкладки); панель берёт замечания
   *  опубликованных по этому адресу */
  reviews: readonly Review[];
  /** Рекомендации критики (владельцу; иначе null) */
  recommendations: readonly Recommendation[] | null;
  /** Добавить замечание в мой черновик (создав его при нужде) */
  onAddToMyReview: (target: MarkTarget, body: string, kind: CommentKind | null) => Promise<Review>;
  /** Комментарии/замечания изменились — хозяин перечитывает сводку и рецензии */
  onChanged: () => void;
  onClose: () => void;
  /** Счётчик внешних изменений — повод перечитать ветки */
  version: number;
}

const squash = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Рекомендации критики об этом адресе — по адресу строки (addressSection /
 *  addressSubsection / element+elementKind), без иного сопоставления. */
export function recommendationsAt(rows: readonly Recommendation[], t: MarkTarget): Recommendation[] {
  switch (t.kind) {
    case "section":
      return rows.filter((r) => r.addressSection === t.key && !r.elementId);
    case "subsection": {
      const p = parseSubsectionKey(t.key);
      if (!p) return [];
      return rows.filter((r) => r.addressSection === p.sectionKey && squash(r.addressSubsection) === squash(p.dataSection) && !r.elementId);
    }
    case "category":
    case "glossary_term":
      return rows.filter((r) => r.elementKind === t.kind && r.element !== null && nameKey(r.element) === t.key);
    case "thesis":
      return rows.filter((r) => r.elementKind === "thesis" && r.element !== null && squash(r.element).replace(/^тезис\s+/, "") === squash(t.key));
    default:
      return [];
  }
}

/** Замечания опубликованных рецензий об этом адресе. */
export function findingsAt(reviews: readonly Review[], t: MarkTarget): { review: Review; finding: ReviewFinding }[] {
  const out: { review: Review; finding: ReviewFinding }[] = [];
  for (const review of reviews) {
    if (review.status !== "published") continue;
    for (const finding of review.findings) if (finding.address.kind === t.kind && finding.address.key === t.key) out.push({ review, finding });
  }
  return out;
}

export function DiscussionPanel({ synthesisId, target, me, canManage, sectionTitles, reviews, recommendations, onAddToMyReview, onChanged, onClose, version }: DiscussionPanelProps) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<CommentKind | "">("");
  const [busy, setBusy] = useState<"comment" | "finding" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNote, setFormNote] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  const addressKey = `${target.kind}:${target.key}`;

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    listAllComments(synthesisId, { kind: target.kind, key: target.key })
      .then((rows) => {
        if (!cancelled) setComments(rows);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorText(err, tl("discussion.discussionPanel.loadFailed", "Не удалось загрузить обсуждение.")));
      });
    return () => {
      cancelled = true;
    };
  }, [synthesisId, target.kind, target.key, version, reloads]);

  // смена адреса — форма чистая
  useEffect(() => {
    setBody("");
    setKind("");
    setFormError(null);
    setFormNote(null);
  }, [addressKey]);

  const changed = useCallback(() => {
    setReloads((n) => n + 1);
    onChanged();
  }, [onChanged]);

  const threads = useMemo(() => orderThreads(threadsOf(comments ?? [])), [comments]);
  const findings = useMemo(() => findingsAt(reviews, target), [reviews, target]);
  const recs = useMemo(() => (recommendations ? recommendationsAt(recommendations, target) : []), [recommendations, target]);

  // состояние адреса — по записям (у адреса без записей — текущая версия)
  const stateOf = useMemo(() => {
    const records: { state: "current" | "outdated" | "deleted"; excerpt: string; at: string }[] = [];
    for (const c of comments ?? []) if (c.parentId === null) records.push({ state: c.resolution.state, excerpt: c.excerpt, at: c.createdAt });
    for (const f of findings) records.push({ state: f.finding.resolution.state, excerpt: f.finding.excerpt, at: f.finding.createdAt });
    if (records.length === 0) return { state: "current" as const, excerpt: "" };
    records.sort((a, b) => (a.at < b.at ? 1 : -1));
    const latest = records[0]!;
    return { state: latest.state, excerpt: latest.excerpt };
  }, [comments, findings]);

  const submit = async (as: "comment" | "finding") => {
    const text = body.trim();
    if (!text) return;
    setBusy(as);
    setFormError(null);
    setFormNote(null);
    try {
      const k = kind === "" ? null : kind;
      if (as === "comment") {
        await createComment(synthesisId, { target: target.target, body: text, kind: k });
        setFormNote(null);
      } else {
        const review = await onAddToMyReview(target, text, k);
        setFormNote(tl("discussion.discussionPanel.addedToReview", "Замечание добавлено в вашу рецензию «{title}».", { title: review.title || tl("discussion.discussionPanel.untitledReview", "без названия") }));
      }
      setBody("");
      setKind("");
      changed();
    } catch (err) {
      setFormError(errorText(err, as === "comment" ? tl("discussion.discussionPanel.sendFailed", "Не удалось отправить.") : tl("discussion.discussionPanel.findingFailed", "Не удалось добавить в рецензию.")));
    } finally {
      setBusy(null);
    }
  };

  return (
    <aside className="discuss-dock" data-testid="discussion-panel" data-address={addressKey} aria-label={tl("discussion.discussionPanel.aria", "Обсуждение адреса")}>
      <div className="discuss-dock-head">
        <div className="discuss-dock-title">
          <span className="form-section-title discuss-dock-kicker">{tl("discussion.discussionPanel.kicker", "Обсуждение")}</span>
          <strong data-testid="discussion-title">{target.title}</strong>
          <span className={stateOf.state === "current" ? "discuss-state" : "discuss-state warn"} data-testid="discussion-state" data-state={stateOf.state}>
            {stateLabel(stateOf.state)}
          </span>
        </div>
        <button type="button" className="action-btn discuss-close" onClick={onClose} data-testid="discussion-close" aria-label={tl("common.close", "Закрыть")}>
          ✕
        </button>
      </div>
      {stateOf.state !== "current" && stateOf.excerpt && (
        <div className="callout note discuss-excerpt" data-testid="discussion-excerpt">
          <span className="discuss-kicker">{tl("discussion.discussionPanel.asItWas", "Как было")}</span>
          <UserText text={stateOf.excerpt} />
        </div>
      )}

      <div className="discuss-dock-body">
        <section className="discuss-block" data-testid="discussion-threads">
          <h4 className="discuss-kicker">
            {tl("discussion.discussionPanel.threads", "Ветки")}
            {comments && <span className="discuss-count">{threads.length}</span>}
          </h4>
          {loadError && <p className="discuss-error">{loadError}</p>}
          {!comments && !loadError && <p className="discuss-muted">{tl("common.loading", "Загрузка…")}</p>}
          {comments && threads.length === 0 && <p className="discuss-muted">{tl("discussion.discussionPanel.noThreads", "Об этом месте ещё не говорили.")}</p>}
          {threads.map((t) => (
            <CommentThread key={t.root.id} synthesisId={synthesisId} thread={t} me={me} canManage={canManage} onChanged={changed} />
          ))}
        </section>

        <section className="discuss-block discuss-compose" data-testid="discussion-form">
          <textarea
            className="form-textarea"
            value={body}
            rows={4}
            maxLength={COMMENT_BODY_MAX}
            disabled={busy !== null}
            placeholder={tl("discussion.discussionPanel.placeholder", "Замечание, вопрос, источник… Абзацы — пустой строкой.")}
            onChange={(e) => setBody(e.target.value)}
            data-testid="discussion-input"
          />
          <div className="discuss-form-row">
            <select className="form-select discuss-kind" value={kind} disabled={busy !== null} onChange={(e) => setKind(e.target.value as CommentKind | "")} data-testid="discussion-kind" aria-label={tl("discussion.discussionPanel.kind", "Вид")}>
              <option value="">{tl("discussion.discussionPanel.kindNone", "без вида")}</option>
              {COMMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
            <button type="button" className="action-btn primary" disabled={busy !== null || body.trim().length === 0} onClick={() => void submit("comment")} data-testid="discussion-send">
              {busy === "comment" ? tl("discussion.discussionPanel.sending", "Отправка…") : tl("discussion.discussionPanel.send", "Отправить")}
            </button>
            <button
              type="button"
              className="action-btn"
              disabled={busy !== null || body.trim().length === 0}
              onClick={() => void submit("finding")}
              data-testid="discussion-to-review"
              title={tl("discussion.discussionPanel.toReviewHint", "Записать набранное замечанием в мою рецензию (черновик создастся, если его нет)")}
            >
              {busy === "finding" ? tl("discussion.discussionPanel.adding", "Добавление…") : tl("discussion.discussionPanel.toReview", "В мою рецензию")}
            </button>
          </div>
          {formError && <p className="discuss-error" data-testid="discussion-form-error">{formError}</p>}
          {formNote && <p className="discuss-ok" data-testid="discussion-form-note">{formNote}</p>}
        </section>

        {/* РЯДОМ, не слитно: замечания рецензий об этом адресе */}
        <section className="discuss-block discuss-beside" data-testid="discussion-findings">
          <h4 className="discuss-kicker">
            {tl("discussion.discussionPanel.findings", "Замечания рецензий")}
            <span className="discuss-count">{findings.length}</span>
          </h4>
          {findings.length === 0 && <p className="discuss-muted">{tl("discussion.discussionPanel.noFindings", "Опубликованные рецензии об этом месте не говорят.")}</p>}
          {findings.map(({ review, finding }) => (
            <div className="discuss-finding" key={finding.id} data-testid="discussion-finding">
              <div className="discuss-byline">
                <Link to={`/synthesis/${synthesisId}/reviews/${review.id}`} className="discuss-author">
                  {review.title || tl("discussion.discussionPanel.untitledReview", "без названия")}
                </Link>
                <span className="discuss-note">{review.author.name}</span>
                {finding.kind && <span className="discuss-kind-chip">{kindLabel(finding.kind)}</span>}
                {finding.resolution.state !== "current" && <span className="discuss-note warn">{stateLabel(finding.resolution.state)}</span>}
              </div>
              <UserText text={finding.body} />
            </div>
          ))}
        </section>

        {recommendations && (
          <section className="discuss-block discuss-beside" data-testid="discussion-critique">
            <h4 className="discuss-kicker">
              {tl("discussion.discussionPanel.critique", "Встроенная критика")}
              <span className="discuss-count">{recs.length}</span>
            </h4>
            {recs.length === 0 && <p className="discuss-muted">{tl("discussion.discussionPanel.noCritique", "Рекомендаций критики по этому адресу нет.")}</p>}
            {recs.map((r) => (
              <div className="discuss-finding" key={r.id} data-testid="discussion-rec">
                <div className="discuss-byline">
                  <span className="discuss-author">№ {r.num}</span>
                  <span className="discuss-note">{r.op}</span>
                  <span className="discuss-note">{r.severity}</span>
                  <span className="discuss-note">{r.status}</span>
                </div>
                <UserText text={r.rationale} />
                {r.replacement && <UserText className="discuss-replacement" text={r.replacement} />}
              </div>
            ))}
            <p className="discuss-muted discuss-fine">{tl("discussion.discussionPanel.critiqueNote", "Исполнение рекомендаций — в панели критики (10.3); отсюда документ не меняется.")}</p>
          </section>
        )}
        <p className="discuss-muted discuss-fine">{tl("discussion.discussionPanel.sectionHint", "Раздел: {section}", { section: target.sectionKey ? sectionTitles[target.sectionKey] ?? target.sectionKey : "—" })}</p>
      </div>
    </aside>
  );
}
