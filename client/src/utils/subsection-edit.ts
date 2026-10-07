/**
 * Ручная правка подраздела (беседа 9.2) — состояние правки и тексты отказов.
 *
 * В одностраничнике правки по месту нет вовсе: там опечатка чинилась только
 * перегенерацией. Единица правки — ПОДРАЗДЕЛ: правится разметка содержимого
 * <div data-section>, обёртка, якорь data-section и <h4> остаются серверу
 * (server/utils/html-parser.ts, replaceSubsectionContent). Поэтому клиент
 * НИЧЕГО не собирает: исходник приходит с сервера (GET …/subsections/:name),
 * присланное сервер сам чистит по белому списку тегов документа.
 *
 * 12.4 (Д-34): ответ правки несёт titleUpdated / thesesUpdated (12.1) —
 * страница применяет новое название к шапке (applySynthesis) и говорит о
 * сведённых тезисах заметкой (subsectionEditNotes), перечитывая только
 * разделы.
 */
import { ApiError } from "../api/client";
import { tl } from "@philosynth/shared/i18n/t";

/** Что рисует SectionView на месте подраздела, пока он правится. */
export interface SubsectionEditState {
  sectionKey: string;
  name: string;
  /** loading — исходник ещё едет; ready — поле открыто; saving — PATCH идёт;
   *  saved — сохранено, но серверу было что сказать (warnings) */
  phase: "loading" | "ready" | "saving" | "saved";
  /** Разметка в поле (исходник либо то, что человек успел набрать) */
  draft: string;
  /** Вложенные подразделы, стоящие в исходнике строками-ссылками */
  nested: string[];
  error: string | null;
  warnings: string[];
  /** 12.4 (Д-34): что сервер сделал заодно с правкой — название концепции
   *  обновлено из раздела name (titleUpdated), строки тезисов сведены с
   *  прозой (thesesUpdated, 12.1); показываются в фазе saved рядом с
   *  warnings, тоном сообщения, не предупреждения */
  notes?: string[] | undefined;
}

export interface SubsectionRef {
  sectionKey: string;
  name: string;
}

function detailOf(err: ApiError, field: string): string | null {
  const d = err.details as Record<string, unknown> | undefined;
  const v = d && typeof d === "object" ? d[field] : undefined;
  return typeof v === "string" ? v : null;
}

/** Текст отказа по кодам 03 §4.3; у SECTION_TABLE_LOCKED сообщение сервера
 *  уже говорит, ЧЕМ править, — его и показываем. */
export function subsectionErrorText(err: unknown): string {
  if (!(err instanceof ApiError)) return tl("utils.subsectionEdit.saveFailed", "Не удалось сохранить подраздел.");
  if (err.code === "GENERATION_IN_PROGRESS")
    return tl("utils.subsectionEdit.lockedGenerating", "Генерация ещё идёт — правка подраздела заблокирована.");
  if (err.code === "FORBIDDEN") return tl("utils.subsectionEdit.ownerOnly", "Править концепцию может только владелец.");
  if (err.code === "SECTION_TABLE_LOCKED")
    return err.message || tl("utils.subsectionEdit.notEditable", "Этот подраздел вручную не правится.");
  if (err.code === "VALIDATION_ERROR") {
    const v = detailOf(err, "html");
    return v ? tl("utils.subsectionEdit.markupRejected", "Разметка не принята: {reason}", { reason: v }) : err.message;
  }
  if (err.code === "NOT_FOUND")
    return tl("utils.subsectionEdit.subsectionGone", "Подраздел не найден — документ изменился. Закройте правку и откройте её заново.");
  return err.message || tl("utils.subsectionEdit.saveFailed", "Не удалось сохранить подраздел.");
}

/** 12.4 (Д-34): заметки о побочных следствиях правки (ответ 12.1) */
export function subsectionEditNotes(res: {
  titleUpdated?: string | undefined;
  thesesUpdated?: { label: string; fields: ("formulation" | "justification")[] }[] | undefined;
}): string[] {
  const notes: string[] = [];
  if (res.titleUpdated)
    notes.push(tl("utils.subsectionEdit.titleUpdated", "Название концепции обновлено: «{title}».", { title: res.titleUpdated }));
  if (res.thesesUpdated && res.thesesUpdated.length > 0) {
    const fieldLabel = (f: "formulation" | "justification"): string =>
      f === "formulation"
        ? tl("utils.subsectionEdit.fieldFormulation", "формулировка")
        : tl("utils.subsectionEdit.fieldJustification", "обоснование");
    const list = res.thesesUpdated
      .map((t) => `${t.label} (${t.fields.map(fieldLabel).join(", ")})`)
      .join("; ");
    notes.push(tl("utils.subsectionEdit.thesesUpdated", "Сведено со списком тезисов: {list}.", { list }));
  }
  return notes;
}
