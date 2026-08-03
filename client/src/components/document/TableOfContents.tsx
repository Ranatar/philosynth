/**
 * Оглавление документа. Беседа 1.6b (запрос 1, п. 3).
 *
 * Порт buildTableOfContents [11620–11711] на React:
 *  - <details open id="docTOC" class="doc-body"> с summary «▶ Содержание»;
 *  - якоря разделов #sec-{key} (сам якорь ставит SectionView на обёртке);
 *  - якоря подразделов #subsec-{key}-{slug}, slug — «не буквенно-цифровое
 *    → _» (регексп исходника /[^a-zA-Zа-яА-ЯёЁ0-9]/g);
 *  - метки KEY_LABELS, строка «§ {num} — {label}»;
 *  - ключ `capsule` пропускается (капсула живёт в шапке);
 *  - меньше 2 видимых разделов → оглавление не рендерится (исходник:
 *    order.length < 2).
 *
 * Подразделы — из SectionSummary.subsections (фактические data-section
 * из HTML, транспорт 1.6), а не из buildSubsectionMap: серверная
 * карта тянет Registry+params, а якорям нужны фактические имена.
 * Кнопки ⏫ и id подразделов внутри HTML расставляет SectionView.
 */
import type { SectionSummary } from "@philosynth/shared/types/section";
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";

export function subsectionSlugId(key: string, subName: string): string {
  return "subsec-" + key + "-" + subName.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, "_");
}

export interface TableOfContentsProps {
  /** synthesis.sectionOrder — порядок разделов */
  sectionOrder: readonly string[];
  /** GET /sections — sectionNum, title, subsections */
  summaries: readonly SectionSummary[];
}

export function TableOfContents({
  sectionOrder,
  summaries,
}: TableOfContentsProps) {
  const byKey = new Map(summaries.map((s) => [s.key, s]));
  const visible = sectionOrder.filter(
    (key) => key !== "capsule" && byKey.has(key),
  );
  if (visible.length < 2) return null;

  return (
    <details open id="docTOC" className="doc-body">
      <summary>
        <span className="toc-arrow">▶</span> Содержание
      </summary>
      <div className="toc-body">
        {visible.map((key) => {
          const summary = byKey.get(key);
          if (!summary) return null;
          const label =
            (KEY_LABELS as Record<string, string>)[key] ??
            summary.title ??
            key;
          return (
            <div key={key}>
              <p className="toc-section-link">
                <a href={`#sec-${key}`}>
                  § {summary.sectionNum} — {label}
                </a>
              </p>
              {summary.subsections.map((subName) => (
                <p className="toc-sub-link" key={subName}>
                  <a href={`#${subsectionSlugId(key, subName)}`}>{subName}</a>
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </details>
  );
}
