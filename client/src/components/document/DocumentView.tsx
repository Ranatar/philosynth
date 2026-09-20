/**
 * Полный документ (аналог #docOutput). Беседа 1.6b (запрос 1, п. 3).
 *
 * Сборка: DocumentHeader → (TableOfContents + разделы) → DocumentFooter.
 * Разделы рендерятся в порядке synthesis.sectionOrder; ключ `capsule`
 * ИСКЛЮЧАЕТСЯ — капсула живёт в шапке (removeCapsuleFromDocBodies
 * исходника; store дополнительно не дотягивает её htmlContent, но
 * фильтр здесь — страховка на случай прямой передачи sections).
 * Разделы вне sectionOrder (не должно случаться) дорисовываются в конце —
 * лучше показать, чем потерять.
 *
 * Беседа 8.7 (п. 4b): режим витрины — synthesis.scope === 'showcase' у
 * невладельца: шапка (капсула, метаданные, философы, даты) рисуется, ниже —
 * врезка «Автор открыл только витрину» (.callout.note), а оглавления и
 * разделов нет: сервер их не отдал ПО ПРАВУ, не по сбою. Футер остаётся —
 * в нём философы и штамп; строку стоимости он и так рисует лишь при
 * определённых полях (8.6).
 */
import type { SectionFull, SectionSummary } from "@philosynth/shared/types/section";
import type { SynthesisFull } from "@philosynth/shared/types/synthesis";

import type { SubsectionEditState, SubsectionRef } from "../../utils/subsection-edit";

import { DocumentFooter } from "./DocumentFooter";
import { DocumentHeader } from "./DocumentHeader";
import { SectionView, type EditableRowRef } from "./SectionView";
import { TableOfContents } from "./TableOfContents";

export interface DocumentViewProps {
  synthesis: SynthesisFull;
  /** GET /sections — метаданные + subsections (оглавлению) */
  summaries: readonly SectionSummary[];
  /** Полные разделы с htmlContent */
  sections: readonly SectionFull[];
  /** Беседа 2.4: кнопка «◈ Лог» в футере */
  onOpenLog?: (() => void) | undefined;
  /** Беседа 3.2: слот «под шапкой документа» — секция генеалогии
   *  (аналог docHeaderExtras исходника; рендерит SynthesisPage) */
  afterHeader?: React.ReactNode;
  /** Беседа 5.2 (п. 7): правка строк таблиц тезисов/глоссария по месту */
  editable?: boolean | undefined;
  onRowEdit?: ((row: EditableRowRef) => void) | undefined;
  /** Редактор по месту для раздела с этим ключом */
  inlineEditorFor?: ((sectionKey: string) => React.ReactNode) | undefined;
  /** Беседа 5.5 (п. 7): строка действий над разделом («→ Граф» у theses) */
  sectionActionsFor?: ((sectionKey: string) => React.ReactNode) | undefined;
  /** Беседа 9.2: ручная правка подраздела — карандаши у заголовков <h4>
   *  незапертых подразделов и форма правки на месте подраздела */
  subsectionEditable?: boolean | undefined;
  subsectionEdit?: SubsectionEditState | null | undefined;
  onSubsectionEdit?: ((ref: SubsectionRef) => void) | undefined;
  onSubsectionSave?: ((html: string) => void) | undefined;
  onSubsectionCancel?: (() => void) | undefined;
}

export function DocumentView({
  synthesis,
  summaries,
  sections,
  onOpenLog,
  afterHeader,
  editable = false,
  onRowEdit,
  inlineEditorFor,
  sectionActionsFor,
  subsectionEditable = false,
  subsectionEdit,
  onSubsectionEdit,
  onSubsectionSave,
  onSubsectionCancel,
}: DocumentViewProps) {
  const showcase = synthesis.scope === "showcase" && !synthesis.isOwner;
  const byKey = new Map(
    sections.filter((s) => s.key !== "capsule").map((s) => [s.key, s]),
  );
  const ordered: SectionFull[] = [];
  for (const key of synthesis.sectionOrder) {
    const s = byKey.get(key);
    if (s) {
      ordered.push(s);
      byKey.delete(key);
    }
  }
  ordered.push(...byKey.values()); // разделы вне sectionOrder — в хвост

  return (
    <div>
      <DocumentHeader synthesis={synthesis} />
      {afterHeader}
      {showcase ? (
        <div className="callout note app-showcase-notice" data-testid="showcase-notice">
          <span className="callout-label">Витрина</span>
          Автор открыл только витрину этой концепции: капсулу, метаданные и
          состав участников. Тела разделов, граф категорий, тезисы и глоссарий
          закрыты для всех, кроме автора.
        </div>
      ) : (
        <div>
          <TableOfContents
            sectionOrder={synthesis.sectionOrder}
            summaries={summaries}
          />
          {ordered.map((section) => (
            <SectionView
              key={section.key}
              section={section}
              editable={editable}
              onRowEdit={onRowEdit}
              inlineEditor={inlineEditorFor?.(section.key)}
              actions={sectionActionsFor?.(section.key)}
              subsectionEditable={subsectionEditable}
              subsectionEdit={
                subsectionEdit && subsectionEdit.sectionKey === section.key
                  ? subsectionEdit
                  : undefined
              }
              subsectionEditBusy={!!subsectionEdit}
              onSubsectionEdit={onSubsectionEdit}
              onSubsectionSave={onSubsectionSave}
              onSubsectionCancel={onSubsectionCancel}
            />
          ))}
        </div>
      )}
      <DocumentFooter synthesis={synthesis} onOpenLog={onOpenLog} />
    </div>
  );
}
