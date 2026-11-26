/**
 * Блок «Похожие концепции» на странице концепции. Беседа 18.3 (п. 2).
 *
 * Сервер (GET /syntheses/:id/similar) отдаёт N лучших среди видимых
 * смотрящему: превью каталога, меру СЛОВАМИ (`grade`: сильно / заметно /
 * слабо похожа — числа в ответе нет) и причины. Здесь — карточки:
 * название-ссылка на концепцию, слова меры, причины строками.
 *
 * Причины — текст: имена философов, названия концепций-предков, термины и
 * имена категорий рисуются текстовыми узлами React (экранируются сами).
 * Вставки произвольного HTML нет и быть не должно — в терминах и названиях
 * лежит текст документа, а его пишут модель и пользователи (сторож 4bt;
 * то же правило, что у фрагмента поиска 18.2).
 *
 * Ссылки «вся выдача по признаку» ведут в каталог и собираются тем же
 * сериализатором, что его адресная строка (`catalogSearchString`):
 * философ — `?philosopher=…&philArea=lineage`, эпоха — `?epoch=…`,
 * общий предок — `?descendantsOf=…`. Гостю каталог — `/explore` (только
 * публичное), вошедшему — `/catalog`: тому, кто концепцией управляет
 * (`capabilities.manage`), — список «Мои», прочим — «Публичные».
 *
 * Карточка — НЕ ссылка целиком (в отличие от SynthesisCard): внутри неё
 * свои ссылки причин, а ссылка в ссылке недопустима.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ML, SL } from "@philosynth/shared/constants/labels";
import { PHILOSOPHER_EPOCHS } from "@philosynth/shared/constants/philosophers";
import type { SimilarityGrade, SimilarityTextSkipReason } from "@philosynth/shared/constants/similarity";
import type { SimilarSynthesesResponse, SimilarSynthesisItem } from "@philosynth/shared/types/similarity";
import { tl } from "@philosynth/shared/i18n/t";
import { tData } from "@philosynth/shared/i18n/data";

import { ApiError } from "../../api/client";
import { getSimilarSyntheses } from "../../api/similar";
import {
  catalogSearchString,
  emptySearchState,
  type CatalogSearchContext,
  type CatalogSearchState,
} from "../../utils/catalog-search";
import { visibilityBadge } from "../../utils/visibility-text";

/** Мера словами */
export function similarityGradeLabel(grade: SimilarityGrade): string {
  switch (grade) {
    case "strong":
      return tl("catalog.similar.gradeStrong", "сильно похожа");
    case "notable":
      return tl("catalog.similar.gradeNotable", "заметно похожа");
    case "weak":
      return tl("catalog.similar.gradeWeak", "слабо похожа");
  }
}

/** Почему термины и категории не сравнивались */
export function textSkippedLabel(reason: SimilarityTextSkipReason): string {
  return reason === "language"
    ? tl("catalog.similar.skippedLanguage", "Термины и категории не сравнивались: у концепций разные языки генерации.")
    : tl("catalog.similar.skippedClosed", "Термины и категории не сравнивались: содержание открыто только витриной.");
}

const GRADE_CLASS: Record<SimilarityGrade, string> = {
  strong: "similar-grade strong",
  notable: "similar-grade notable",
  weak: "similar-grade weak",
};
const CARD_CLASS: Record<SimilarityGrade, string> = {
  strong: "similar-card strong",
  notable: "similar-card notable",
  weak: "similar-card weak",
};

/** Куда ведут ссылки «вся выдача по признаку» */
export interface SimilarCatalogTarget {
  /** Гость: каталог — /explore, список один */
  guest: boolean;
  /** Список «Мои» (смотрящий управляет концепцией), иначе «Публичные» */
  mine: boolean;
}

/** Адрес каталога с одним заданным признаком — тем же сериализатором, что
 *  адресная строка каталога (имена параметров — параметры маршрута поиска). */
export function similarCatalogHref(
  target: SimilarCatalogTarget,
  patch: Partial<Pick<CatalogSearchState, "philosophers" | "philArea" | "epochs" | "descendantsOf">>,
): string {
  const ctx: CatalogSearchContext = target.guest
    ? { defaultScope: "public", lockScope: true }
    : { defaultScope: "mine", lockScope: false };
  const scope = target.guest || !target.mine ? "public" : "mine";
  const qs = catalogSearchString({ ...emptySearchState(scope), ...patch }, ctx);
  return `${target.guest ? "/explore" : "/catalog"}${qs ? `?${qs}` : ""}`;
}

/** «и ещё N» — когда названо не всё */
function moreLabel(total: number, shown: number): string | null {
  const rest = total - shown;
  return rest > 0 ? tl("catalog.similar.andMore", "и ещё {count}", { count: rest }) : null;
}

function ReasonRow({ label, testId, children }: { label: string; testId: string; children: React.ReactNode }) {
  return (
    <div className="similar-reason" data-testid={testId}>
      <span className="similar-reason-key">{label}</span>
      <span className="similar-reason-val">{children}</span>
    </div>
  );
}

/** Перечень через запятую: элементы — готовые узлы */
function joined(nodes: React.ReactNode[], more: string | null): React.ReactNode {
  return (
    <>
      {nodes.map((n, i) => (
        <span key={i}>
          {i > 0 ? ", " : ""}
          {n}
        </span>
      ))}
      {more ? <span className="similar-more"> {more}</span> : null}
    </>
  );
}

function SimilarCard({ item, target }: { item: SimilarSynthesisItem; target: SimilarCatalogTarget }) {
  const { grade, reasons, textCompared, textSkipped } = item.similarity;
  const philLink = (name: string) => (
    <Link to={similarCatalogHref(target, { philosophers: [name], philArea: "lineage" })} data-testid="similar-phil-link">
      {tData(name)}
    </Link>
  );
  return (
    <article className={CARD_CLASS[grade]} data-testid="similar-card" data-synthesis-id={item.id} data-grade={grade}>
      <div className="similar-card-head">
        <Link className="similar-card-title" to={`/synthesis/${item.id}`} data-testid="similar-card-title" dir="auto">
          {item.title}
        </Link>
        <span className={GRADE_CLASS[grade]} data-testid="similar-grade">
          {similarityGradeLabel(grade)}
        </span>
      </div>
      <div className="similar-card-meta">
        <span className="doc-meta-val gold">
          {tData(ML[item.method])} × {tData(SL[item.synthLevel])}
        </span>
        {item.hasConceptParents && (
          <span className="cert-badge gold">{tl("catalog.synthesisCard.metaSynthesisBadge", "◈ мета-синтез")}</span>
        )}
        {item.visibility === "showcase" && <span className="cert-badge">{visibilityBadge(item.visibility)}</span>}
        {item.authorName && (
          <span className="doc-meta-key">
            {tl("catalog.synthesisCard.author", "Автор: {authorName}", { authorName: item.authorName })}
          </span>
        )}
      </div>

      <div className="similar-reasons" data-testid="similar-reasons">
        {reasons.kin && (
          <ReasonRow label={tl("catalog.similar.reasonKin", "Родство")} testId="similar-reason-kin">
            {reasons.kin === "ancestor"
              ? tl("catalog.similar.kinAncestor", "предок этой концепции")
              : tl("catalog.similar.kinDescendant", "потомок этой концепции")}
          </ReasonRow>
        )}
        {reasons.philosophers.length > 0 && (
          <ReasonRow label={tl("catalog.similar.reasonPhilosophers", "Общие философы")} testId="similar-reason-philosophers">
            {joined(reasons.philosophers.map(philLink), null)}
          </ReasonRow>
        )}
        {reasons.lineagePhilosophers.length > 0 && (
          <ReasonRow label={tl("catalog.similar.reasonLineagePhilosophers", "Общие по родословной")} testId="similar-reason-lineage">
            {joined(reasons.lineagePhilosophers.map(philLink), null)}
          </ReasonRow>
        )}
        {reasons.ancestorsTotal > 0 && (
          <ReasonRow label={tl("catalog.similar.reasonAncestors", "Общие предки")} testId="similar-reason-ancestors">
            {reasons.ancestors.length === 0
              ? tl("catalog.similar.ancestorsHidden", "есть, но вам не видны: {count}", { count: reasons.ancestorsTotal })
              : joined(
                  reasons.ancestors.map((a) =>
                    a.id ? (
                      <>
                        <Link to={`/synthesis/${a.id}`}>{a.title}</Link>{" "}
                        <Link
                          className="similar-sub-link"
                          to={similarCatalogHref(target, { descendantsOf: a.id })}
                          data-testid="similar-descendants-link"
                        >
                          {tl("catalog.similar.descendantsLink", "(потомки в каталоге)")}
                        </Link>
                      </>
                    ) : (
                      <>{a.title}</>
                    ),
                  ),
                  moreLabel(reasons.ancestorsTotal, reasons.ancestors.length),
                )}
          </ReasonRow>
        )}
        {reasons.termsTotal > 0 && (
          <ReasonRow label={tl("catalog.similar.reasonTerms", "Общие термины")} testId="similar-reason-terms">
            {joined(
              reasons.terms.map((t) => <>{t}</>),
              moreLabel(reasons.termsTotal, reasons.terms.length),
            )}
          </ReasonRow>
        )}
        {reasons.categoriesTotal > 0 && (
          <ReasonRow label={tl("catalog.similar.reasonCategories", "Общие категории")} testId="similar-reason-categories">
            {joined(
              reasons.categories.map((t) => <>{t}</>),
              moreLabel(reasons.categoriesTotal, reasons.categories.length),
            )}
          </ReasonRow>
        )}
        {reasons.epochs.length > 0 && (
          <ReasonRow label={tl("catalog.similar.reasonEpochs", "Общие эпохи")} testId="similar-reason-epochs">
            {joined(
              reasons.epochs.map((n) => (
                <Link to={similarCatalogHref(target, { epochs: [n], philArea: "lineage" })}>
                  {tData(PHILOSOPHER_EPOCHS[n]?.label ?? "")}
                </Link>
              )),
              null,
            )}
          </ReasonRow>
        )}
        {(reasons.method || reasons.synthLevel) && (
          <ReasonRow label={tl("catalog.similar.reasonSame", "Совпали")} testId="similar-reason-same">
            {[
              reasons.method ? tl("catalog.similar.sameMethod", "метод синтеза") : null,
              reasons.synthLevel ? tl("catalog.similar.sameLevel", "уровень синтеза") : null,
            ]
              .filter(Boolean)
              .join(", ")}
          </ReasonRow>
        )}
      </div>

      {!textCompared && textSkipped && (
        <div className="similar-skip" data-testid="similar-skip" data-reason={textSkipped}>
          {textSkippedLabel(textSkipped)}
        </div>
      )}
    </article>
  );
}

export interface SimilarConceptsProps {
  synthesisId: string;
  /** Смотрит гость (ссылки в каталог ведут на /explore) */
  guest: boolean;
  /** Смотрящий управляет концепцией (capabilities.manage): ссылки причин
   *  ведут в список «Мои», иначе — в «Публичные» */
  mine: boolean;
}

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: SimilarSynthesesResponse };

export function SimilarConcepts({ synthesisId, guest, mine }: SimilarConceptsProps) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    getSimilarSyntheses(synthesisId)
      .then((data) => {
        if (alive) setState({ kind: "ready", data });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const message =
          err instanceof ApiError && err.message
            ? err.message
            : tl("catalog.similar.loadFailed", "Не удалось подобрать похожие концепции.");
        setState({ kind: "error", message });
      });
    return () => {
      alive = false;
    };
  }, [synthesisId, guest]);

  const target: SimilarCatalogTarget = { guest, mine };
  return (
    <section className="similar-block" data-testid="similar-block" aria-label={tl("catalog.similar.title", "Похожие концепции")}>
      <div className="similar-head">
        <span className="similar-title">{tl("catalog.similar.title", "Похожие концепции")}</span>
        <span className="similar-note">
          {guest
            ? tl("catalog.similar.noteGuest", "среди публичных концепций")
            : tl("catalog.similar.noteUser", "среди ваших, доступных вам и публичных концепций")}
        </span>
      </div>

      {state.kind === "loading" && (
        <div className="pool-status" data-testid="similar-loading">
          {tl("common.loading", "Загрузка…")}
        </div>
      )}
      {state.kind === "error" && (
        <div className="pool-status err" role="alert" data-testid="similar-error">
          {state.message}
        </div>
      )}
      {state.kind === "ready" && state.data.items.length === 0 && (
        <div className="similar-empty" data-testid="similar-empty">
          {tl("catalog.similar.empty", "Похожих концепций не нашлось: ни общих философов, ни общих предков, ни общих терминов и категорий.")}
        </div>
      )}
      {state.kind === "ready" && state.data.items.length > 0 && (
        <>
          <div className="similar-list" data-testid="similar-list">
            {state.data.items.map((item) => (
              <SimilarCard key={item.id} item={item} target={target} />
            ))}
          </div>
          <div className="similar-foot" data-testid="similar-foot">
            {tl("catalog.similar.footHow", "Сходство считается по общим философам и предкам, методу, уровню и эпохам; термины и категории сравниваются только у концепций одного языка генерации.")}
            {!state.data.sourceContentOpen &&
              ` ${tl("catalog.similar.footShowcase", "Эта концепция открыта вам витриной — её термины и категории не сравнивались.")}`}
            {state.data.capped &&
              ` ${tl("catalog.similar.footCapped", "Каталог велик: сравнивались концепции с наибольшим числом общего.")}`}
          </div>
        </>
      )}
    </section>
  );
}
