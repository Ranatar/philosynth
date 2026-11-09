/**
 * Вкладка «Рецензии» (беседа 16.3, п. 4): список рецензий концепции —
 * опубликованные и отозванные всех участников, мои черновики (чужие
 * черновики сервер не отдаёт). Каждая — ссылка на страницу-документ
 * /synthesis/:id/reviews/:rid. «Начать рецензию» заводит черновик
 * (POST /reviews) и ведёт на его страницу. Рецензии людей — отдельно от
 * встроенной критики (та — панель 10.3 и строки «рядом» в панели адреса).
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { Review } from "@philosynth/shared/types/discussion";
import { tl } from "@philosynth/shared/i18n/t";

import { createReview } from "../../api/discussion";
import { fmtWhen } from "../../utils/discussion";
import { errorText } from "./CommentThread";

export function reviewStatusLabel(status: Review["status"]): string {
  switch (status) {
    case "draft":
      return tl("discussion.reviewsTab.statusDraft", "черновик");
    case "published":
      return tl("discussion.reviewsTab.statusPublished", "опубликована");
    case "withdrawn":
      return tl("discussion.reviewsTab.statusWithdrawn", "отозвана");
  }
}

/** Версия документа одной строкой: base.sub[.modes][-modeRegen] */
export function docVersionLabel(v: Review["docVersion"]): string {
  return `${v.base}.${v.sub}${v.modes ? `.${v.modes}` : ""}${v.modeRegen ? `-${v.modeRegen}` : ""}`;
}

export interface ReviewsTabProps {
  synthesisId: string;
  me: string | null;
  reviews: readonly Review[] | null;
  error: string | null;
  onChanged: () => void;
}

export function ReviewsTab({ synthesisId, me, reviews, error, onChanged }: ReviewsTabProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const myDraft = reviews?.find((r) => r.status === "draft" && r.author.id === me) ?? null;

  const start = async () => {
    setBusy(true);
    setCreateError(null);
    try {
      const r = myDraft ?? (await createReview(synthesisId));
      onChanged();
      navigate(`/synthesis/${synthesisId}/reviews/${r.id}`);
    } catch (err) {
      setCreateError(errorText(err, tl("discussion.reviewsTab.createFailed", "Не удалось завести черновик.")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="input-form discuss-tab" data-testid="reviews-tab">
      <div className="discuss-tab-head">
        <div className="form-section-title">{tl("discussion.reviewsTab.title", "Рецензии")}</div>
        <button type="button" className="action-btn primary" disabled={busy} onClick={() => void start()} data-testid="review-start">
          {myDraft ? tl("discussion.reviewsTab.continueDraft", "Продолжить мой черновик") : tl("discussion.reviewsTab.start", "Начать рецензию")}
        </button>
      </div>
      <p className="discuss-muted">
        {tl("discussion.reviewsTab.lead", "Рецензия — отдельный документ участника о версии концепции: поля и замечания к конкретным местам. Черновик виден только автору; опубликованная — всем участникам; встроенная критика (раздел документа) — отдельно, в панели критики.")}
      </p>
      {createError && <p className="discuss-error">{createError}</p>}
      {error && <p className="discuss-error">{error}</p>}
      {!reviews && !error && <p className="discuss-muted">{tl("common.loading", "Загрузка…")}</p>}
      {reviews && reviews.length === 0 && <p className="discuss-muted" data-testid="reviews-empty">{tl("discussion.reviewsTab.empty", "Рецензий пока нет.")}</p>}
      {reviews && reviews.length > 0 && (
        <table className="data-table reviews-table" data-testid="reviews-list">
          <thead>
            <tr>
              <th>{tl("discussion.reviewsTab.colTitle", "Рецензия")}</th>
              <th>{tl("discussion.reviewsTab.colAuthor", "Автор")}</th>
              <th>{tl("discussion.reviewsTab.colStatus", "Статус")}</th>
              <th>{tl("discussion.reviewsTab.colVersion", "Версия документа")}</th>
              <th>{tl("discussion.reviewsTab.colFindings", "Замечаний")}</th>
              <th>{tl("discussion.reviewsTab.colWhen", "Дата")}</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((r) => (
              <tr key={r.id} data-testid="review-row" data-status={r.status}>
                <td>
                  <Link to={`/synthesis/${synthesisId}/reviews/${r.id}`} data-testid="review-link">
                    {r.title || tl("discussion.reviewsTab.untitled", "без названия")}
                  </Link>
                </td>
                <td>
                  {r.author.name}
                  {r.author.isOwner && <span className="discuss-note"> · {tl("discussion.reviewsTab.owner", "владелец")}</span>}
                </td>
                <td>
                  <span className={`cert-badge review-status ${r.status}`}>{reviewStatusLabel(r.status)}</span>
                  {r.revision > 1 && <span className="discuss-note"> · {tl("discussion.reviewsTab.revision", "ред. {n}", { n: r.revision })}</span>}
                </td>
                <td className="discuss-mono">{docVersionLabel(r.docVersion)}</td>
                <td className="discuss-mono">{r.findings.length}</td>
                <td className="discuss-mono">{fmtWhen(r.publishedAt ?? r.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
