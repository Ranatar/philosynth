/**
 * Предупреждения разбора — кодом в БД, фразой при чтении (беседа 14.2, Д-55).
 *
 * До 14.2 `generation_log.metadata.parseWarnings` хранил готовые русские
 * фразы (graph-parser 11.1, `missingSubsectionsNote` 12.3, заметка повтора
 * таблицы рекомендаций, опознание подраздела по месту 11.2, чистка разметки
 * 14.1); с 11.3 их видит владелец пометкой у раздела в переведённом
 * интерфейсе — по-русски. Язык записи — язык запроса ГЕНЕРАЦИИ, читать могут
 * на другом, поэтому хранится код с параметрами, а фразу собирает сервер
 * под языком запроса (`server/services/parse-warnings.ts`, `renderParseWarning`
 * — образец `recommendation-issues.ts` 12.3). Старые записи — строки, они
 * показываются как есть: массив `parseWarnings` принимает и код, и строку.
 *
 * Параметры — данные документа и машинные значения (имена подразделов,
 * атрибуты data-section, значения ячеек, сообщения ошибок): не переводятся.
 */
import type { ParseWarningCode } from "../constants/parse-warnings.js";

export type ParseWarningParams = Record<string, string | number | string[]>;

export interface ParseWarning {
  code: ParseWarningCode;
  params?: ParseWarningParams;
}

/** Элемент `metadata.parseWarnings`: код (с 14.2) либо готовая строка (до 14.2). */
export type StoredParseWarning = ParseWarning | string;
