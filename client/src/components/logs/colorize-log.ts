/**
 * colorizeLog (беседа 2.4) — адрес по карте 04 §3 / 05 / 07 п.4.
 *
 * Реализация живёт в shared/utils/colorize-log.ts: раскраска нужна И
 * серверу (formatCtxLogHTML → GET /logs/formatted возвращает html по
 * 03 §2.12), И клиенту — здесь тонкий реэкспорт вместо дубля ~150 строк
 * паттернов (паттерн extractIntraSectionContext, 04 §2.1: соответствие
 * карте без дублирования кода).
 *
 * Основной поток ContextLogViewer использует ГОТОВЫЙ html с сервера
 * (07 п.5: dangerouslySetInnerHTML для colorized); клиентский порт —
 * для потребителей, раскрашивающих plain-текст локально.
 */
export { colorizeLog } from "@philosynth/shared/utils/colorize-log";
