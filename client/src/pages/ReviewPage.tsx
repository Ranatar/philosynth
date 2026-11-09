/**
 * Страница рецензии (беседа 16.3, п. 4): /synthesis/:id/reviews/:rid — под
 * RequireAuth, внутри Layout. Рецензия — отдельный документ: версия
 * концепции, автор, дата, статус/редакция, семь полей (REVIEW_TEXT_FIELDS),
 * замечания с состоянием адреса и переходом к месту
 * (/synthesis/:id?discuss=вид:ключ — SynthesisPage открывает панель и
 * прокручивает к пометке), редакции (<details>).
 *
 * Автору своего черновика (и опубликованной — правка даёт новую редакцию)
 * страница же служит редактором: поля — textarea с сохранением по кнопке
 * (PATCH), замечания — правка вида/текста и удаление, «Опубликовать» /
 * «Отозвать» / «Удалить черновик» (необратимое — второй шаг useSecondStep).
 * Новые замечания добавляются из панели обсуждения адреса («В мою
 * рецензию») — так адрес берётся с места, а не набирается руками.
 *
 * Тексты — UserText; чужой черновик сервер отдаёт как 404.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { COMMENT_KINDS, REVIEW_FIELD_MAX, REVIEW_TEXT_FIELDS, REVIEW_TITLE_MAX, type CommentKind, type ReviewTextField } from "@philosynth/shared/constants/discussion";
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";
import type { Review, ReviewFinding, ReviewRevision } from "@philosynth/shared/types/discussion";
import type { SynthesisFull } from "@philosynth/shared/types/synthesis";
import { tData } from "@philosynth/shared/i18n/data";
import { tl } from "@philosynth/shared/i18n/t";

import { ApiError } from "../api/client";
import { deleteFinding, deleteReview, getReview, listRevisions, publishReview, updateFinding, updateReview, withdrawReview } from "../api/discussion";
import { getSynthesis } from "../api/syntheses";
import { errorText } from "../components/discussion/CommentThread";
import { docVersionLabel, reviewStatusLabel } from "../components/discussion/ReviewsTab";
import { UserText } from "../components/discussion/UserText";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";
import { useSecondStep } from "../hooks/useSecondStep";
import { useAuthStore } from "../stores/auth-store";
import { addressLabel, fmtWhen, kindLabel, stateLabel } from "../utils/discussion";

export function reviewFieldLabel(f: ReviewTextField): string {
  switch (f) {
    case "title":
      return tl("reviewPage.fieldTitle", "Название");
    case "summary":
      return tl("reviewPage.fieldSummary", "Общая оценка");
    case "strengths":
      return tl("reviewPage.fieldStrengths", "Сильные стороны");
    case "objections":
      return tl("reviewPage.fieldObjections", "Возражения");
    case "minor":
      return tl("reviewPage.fieldMinor", "Частные замечания");
    case "questions":
      return tl("reviewPage.fieldQuestions", "Вопросы");
    case "conclusion":
      return tl("reviewPage.fieldConclusion", "Заключение");
  }
}

export const discussHref = (synthesisId: string, addr: { kind: string; key: string }): string =>
  `/synthesis/${synthesisId}?discuss=${encodeURIComponent(`${addr.kind}:${addr.key}`)}`;

function FindingRow({ synthesisId, review, f, editable, onChanged, sectionTitles }: { synthesisId: string; review: Review; f: ReviewFinding; editable: boolean; onChanged: (r: Review) => void; sectionTitles: Record<string, string> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(f.body);
  const [kind, setKind] = useState<CommentKind | "">(f.kind ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const delStep = useSecondStep(busy);

  const run = async (fn: () => Promise<Review>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await fn());
      setEditing(false);
    } catch (err) {
      setError(errorText(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="review-finding" data-testid="review-finding" data-state={f.resolution.state}>
      <div className="discuss-byline">
        <span className="discuss-mono">{f.position}.</span>
        <Link to={discussHref(synthesisId, f.address)} className="discuss-link" data-testid="finding-jump">
          {addressLabel(f.address, sectionTitles)} →
        </Link>
        {f.kind && <span className="discuss-kind-chip">{kindLabel(f.kind)}</span>}
        <span className={f.resolution.state === "current" ? "discuss-state" : "discuss-state warn"} data-testid="finding-state">
          {stateLabel(f.resolution.state)}
        </span>
      </div>
      {f.resolution.state !== "current" && f.excerpt && (
        <div className="callout note discuss-excerpt">
          <span className="discuss-kicker">{tl("reviewPage.asItWas", "Как было")}</span>
          <UserText text={f.excerpt} />
        </div>
      )}
      {editing ? (
        <div className="discuss-form">
          <textarea className="form-textarea" rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={busy} />
          <div className="discuss-form-row">
            <select className="form-select discuss-kind" value={kind} onChange={(e) => setKind(e.target.value as CommentKind | "")} disabled={busy}>
              <option value="">{tl("reviewPage.kindNone", "без вида")}</option>
              {COMMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
            <button type="button" className="action-btn primary" disabled={busy || !draft.trim()} onClick={() => void run(() => updateFinding(synthesisId, review.id, f.id, { body: draft, kind: kind === "" ? null : kind }), tl("reviewPage.findingSaveFailed", "Не удалось сохранить замечание."))}>
              {tl("common.save", "Сохранить")}
            </button>
            <button type="button" className="action-btn" disabled={busy} onClick={() => { setEditing(false); setDraft(f.body); setKind(f.kind ?? ""); }}>
              {tl("common.cancel", "Отмена")}
            </button>
          </div>
        </div>
      ) : (
        <UserText text={f.body} />
      )}
      {editable && !editing && (
        <div className="discuss-actions" ref={delStep.ref as React.RefObject<HTMLDivElement | null>}>
          <button type="button" className="discuss-link" disabled={busy} onClick={() => setEditing(true)} data-testid="finding-edit">
            {tl("reviewPage.findingEdit", "править")}
          </button>
          {delStep.armed ? (
            <>
              <button type="button" className="discuss-link danger" disabled={busy} data-testid="finding-delete-confirm" onClick={() => void run(() => deleteFinding(synthesisId, review.id, f.id), tl("reviewPage.findingDeleteFailed", "Не удалось удалить замечание."))}>
                {tl("reviewPage.findingDeleteConfirm", "точно удалить?")}
              </button>
              <button type="button" className="discuss-link" disabled={busy} onClick={delStep.disarm}>
                {tl("common.cancel", "Отмена")}
              </button>
            </>
          ) : (
            <button type="button" className="discuss-link" disabled={busy} data-testid="finding-delete" onClick={() => delStep.arm(true)}>
              {tl("reviewPage.findingDelete", "удалить")}
            </button>
          )}
        </div>
      )}
      {error && <p className="discuss-error">{error}</p>}
    </li>
  );
}

export function ReviewPage() {
  const { id, rid } = useParams<{ id: string; rid: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user?.id ?? null);
  const [synthesis, setSynthesis] = useState<SynthesisFull | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [revisions, setRevisions] = useState<ReviewRevision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<ReviewTextField, string> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const delStep = useSecondStep(busy !== null);

  const sectionTitles = useMemo(() => {
    const out: Record<string, string> = {};
    for (const key of synthesis?.sectionOrder ?? []) out[key] = tData((KEY_LABELS as Record<string, string>)[key] ?? key);
    return out;
  }, [synthesis]);

  const applyReview = useCallback((r: Review) => {
    setReview(r);
    setFields(Object.fromEntries(REVIEW_TEXT_FIELDS.map((f) => [f, r[f] ?? ""])) as Record<ReviewTextField, string>);
  }, []);

  useEffect(() => {
    if (!id || !rid) return;
    let cancelled = false;
    setError(null);
    Promise.all([getSynthesis(id), getReview(id, rid)])
      .then(([s, r]) => {
        if (cancelled) return;
        setSynthesis(s);
        applyReview(r);
        if (r.status !== "draft") listRevisions(id, rid).then((rv) => { if (!cancelled) setRevisions(rv); }).catch(() => { if (!cancelled) setRevisions([]); });
        else setRevisions([]);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError && err.status === 404 ? tl("reviewPage.notFound", "Рецензия не найдена или недоступна.") : errorText(err, tl("reviewPage.loadFailed", "Не удалось загрузить рецензию.")));
      });
    return () => {
      cancelled = true;
    };
  }, [id, rid, applyReview]);

  if (!id || !rid) return null;
  if (error) {
    return (
      <div className="main-wrap">
        <div className="callout warning" data-testid="review-error">{error}</div>
        <p>
          <Link to={`/synthesis/${id}`} className="action-btn">{tl("reviewPage.backToConcept", "← К концепции")}</Link>
        </p>
      </div>
    );
  }
  if (!synthesis || !review || !fields) return <LoadingSpinner />;

  const mine = me !== null && review.author.id === me;
  const editable = mine && review.status !== "withdrawn";
  const dirty = REVIEW_TEXT_FIELDS.some((f) => (fields[f] ?? "") !== (review[f] ?? ""));

  const run = async (what: string, fn: () => Promise<Review | { ok: true }>, fallback: string, after?: (r: Review | { ok: true }) => void) => {
    setBusy(what);
    setActionError(null);
    setSaved(false);
    try {
      const r = await fn();
      if ("id" in r) applyReview(r);
      after?.(r);
    } catch (err) {
      setActionError(errorText(err, fallback));
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run("save", () => {
      const patch: Partial<Record<ReviewTextField, string>> = {};
      for (const f of REVIEW_TEXT_FIELDS) if ((fields[f] ?? "") !== (review[f] ?? "")) patch[f] = fields[f];
      return updateReview(id, rid, patch);
    }, tl("reviewPage.saveFailed", "Не удалось сохранить."), () => setSaved(true));

  return (
    <div className="main-wrap review-page" data-testid="review-page" data-status={review.status}>
      <p className="review-back">
        <Link to={`/synthesis/${id}`} data-testid="review-back">{tl("reviewPage.backTo", "← {title}", { title: synthesis.title })}</Link>
      </p>
      <div className="input-form review-doc">
        <div className="review-head">
          <span className="form-section-title">{tl("reviewPage.kicker", "Рецензия")}</span>
          <h1 className="review-title" data-testid="review-title">{review.title || tl("reviewPage.untitled", "без названия")}</h1>
          <dl className="review-meta" data-testid="review-meta">
            <dt>{tl("reviewPage.metaAuthor", "Автор")}</dt>
            <dd>
              {review.author.name}
              {review.author.isOwner ? ` · ${tl("reviewPage.owner", "владелец")}` : ""}
              {review.author.formerMember ? ` · ${tl("reviewPage.formerMember", "бывший участник")}` : ""}
            </dd>
            <dt>{tl("reviewPage.metaStatus", "Статус")}</dt>
            <dd>
              <span className={`cert-badge review-status ${review.status}`} data-testid="review-status">{reviewStatusLabel(review.status)}</span>
              {review.revision > 0 && ` · ${tl("reviewPage.revisionN", "редакция {n}", { n: review.revision })}`}
            </dd>
            <dt>{tl("reviewPage.metaDocVersion", "Версия концепции")}</dt>
            <dd className="discuss-mono" title={tl("reviewPage.docVersionHint", "база.подверсия[.режимы][-перегенерации режимов]; при публикации берётся текущая")}>{docVersionLabel(review.docVersion)}</dd>
            <dt>{tl("reviewPage.metaDate", "Дата")}</dt>
            <dd className="discuss-mono">{fmtWhen(review.publishedAt ?? review.updatedAt)}{review.withdrawnAt ? ` · ${tl("reviewPage.withdrawnAt", "отозвана {when}", { when: fmtWhen(review.withdrawnAt) })}` : ""}</dd>
          </dl>
        </div>

        {editable && (
          <div className="callout note review-editor-note">
            {review.status === "draft"
              ? tl("reviewPage.draftNote", "Черновик видите только вы. Поля сохраняются кнопкой; замечания к местам добавляются из панели обсуждения («В мою рецензию»).")
              : tl("reviewPage.publishedEditNote", "Рецензия опубликована: каждое сохранение полей или замечаний даёт новую редакцию.")}
          </div>
        )}

        {REVIEW_TEXT_FIELDS.map((f) => (
          <section className="review-field" key={f} data-testid={`review-field-${f}`}>
            <h4 className="discuss-kicker">{reviewFieldLabel(f)}</h4>
            {editable ? (
              f === "title" ? (
                <input className="form-input" value={fields[f]} maxLength={REVIEW_TITLE_MAX} disabled={busy !== null} onChange={(e) => setFields({ ...fields, [f]: e.target.value })} data-testid="review-input-title" />
              ) : (
                <textarea className="form-textarea" rows={5} value={fields[f]} maxLength={REVIEW_FIELD_MAX} disabled={busy !== null} onChange={(e) => setFields({ ...fields, [f]: e.target.value })} placeholder={tl("reviewPage.fieldPlaceholder", "Абзацы — пустой строкой.")} />
              )
            ) : review[f] ? (
              f === "title" ? null : <UserText text={review[f]} />
            ) : (
              f === "title" ? null : <p className="discuss-muted">—</p>
            )}
          </section>
        ))}

        {editable && (
          <div className="discuss-form-row review-save-row">
            <button type="button" className="action-btn primary" disabled={busy !== null || !dirty} onClick={() => void save()} data-testid="review-save">
              {busy === "save" ? tl("reviewPage.saving", "Сохранение…") : tl("reviewPage.saveFields", "Сохранить поля")}
            </button>
            {saved && !dirty && <span className="discuss-ok" data-testid="review-saved">{tl("reviewPage.saved", "Сохранено.")}</span>}
          </div>
        )}

        <section className="review-findings" data-testid="review-findings">
          <h4 className="discuss-kicker">
            {tl("reviewPage.findings", "Замечания к местам")}
            <span className="discuss-count">{review.findings.length}</span>
          </h4>
          {review.findings.length === 0 && (
            <p className="discuss-muted">
              {editable
                ? tl("reviewPage.noFindingsEditable", "Замечаний пока нет: откройте концепцию, нажмите пометку ◉ у нужного места и выберите «В мою рецензию».")
                : tl("reviewPage.noFindings", "Замечаний к местам нет.")}
            </p>
          )}
          <ol className="review-finding-list">
            {review.findings.map((f) => (
              <FindingRow key={f.id} synthesisId={id} review={review} f={f} editable={editable} onChanged={applyReview} sectionTitles={sectionTitles} />
            ))}
          </ol>
        </section>

        {mine && (
          <div className="actions-bar review-actions" ref={delStep.ref as React.RefObject<HTMLDivElement | null>} data-testid="review-actions">
            <div className="actions-bar-btns">
              {review.status !== "published" && (
                <button type="button" className="action-btn primary" disabled={busy !== null} data-testid="review-publish" onClick={() => void run("publish", () => publishReview(id, rid), tl("reviewPage.publishFailed", "Не удалось опубликовать."))}>
                  {review.status === "withdrawn" ? tl("reviewPage.republish", "Опубликовать снова") : tl("reviewPage.publish", "Опубликовать")}
                </button>
              )}
              {review.status === "published" && (
                <button type="button" className="action-btn" disabled={busy !== null} data-testid="review-withdraw" onClick={() => void run("withdraw", () => withdrawReview(id, rid), tl("reviewPage.withdrawFailed", "Не удалось отозвать."))}>
                  {tl("reviewPage.withdraw", "Отозвать")}
                </button>
              )}
              {review.status === "draft" &&
                (delStep.armed ? (
                  <>
                    <button type="button" className="action-btn danger" disabled={busy !== null} data-testid="review-delete-confirm" onClick={() => void run("delete", () => deleteReview(id, rid), tl("reviewPage.deleteFailed", "Не удалось удалить черновик."), () => navigate(`/synthesis/${id}`))}>
                      {tl("reviewPage.deleteConfirm", "Точно удалить черновик?")}
                    </button>
                    <button type="button" className="action-btn" disabled={busy !== null} onClick={delStep.disarm}>
                      {tl("common.cancel", "Отмена")}
                    </button>
                  </>
                ) : (
                  <button type="button" className="action-btn danger" disabled={busy !== null} data-testid="review-delete" onClick={() => delStep.arm(true)}>
                    {tl("reviewPage.deleteDraft", "Удалить черновик")}
                  </button>
                ))}
            </div>
            {delStep.armed && <span className="transform-warn">{tl("reviewPage.deleteWarn", "Черновик и его замечания исчезнут без следа.")}</span>}
          </div>
        )}
        {actionError && <p className="discuss-error" data-testid="review-action-error">{actionError}</p>}

        {revisions && revisions.length > 0 && (
          <details className="sec-disclosure review-revisions" data-testid="review-revisions">
            <summary>{tl("reviewPage.revisions", "Редакции ({n})", { n: revisions.length })}</summary>
            <div className="disclosure-body">
              <ul className="version-list">
                {revisions.map((rv) => (
                  <li className="version-item" key={rv.id} data-testid="review-revision">
                    <span className="version-num">{tl("reviewPage.revisionN", "редакция {n}", { n: rv.revision })}</span>
                    <span className="discuss-mono"> · {docVersionLabel(rv.docVersion)} · {fmtWhen(rv.createdAt)}</span>
                    <span className="discuss-note"> · {tl("reviewPage.revisionFindings", "{n, plural, one {# замечание} few {# замечания} many {# замечаний} other {# замечания}}", { n: rv.findings.length })}</span>
                    {rv.fields.title && <div className="discuss-muted">{rv.fields.title}</div>}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
