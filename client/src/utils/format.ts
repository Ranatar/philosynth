/**
 * Форматирование чисел и дат (05-file-structure: client/utils/format.ts;
 * создан беседой 6.2 — первый потребитель: BillingPage/AdminPromptsPage).
 *
 * Деньги — как футер документа исходника (updateFooterCost [5671]):
 * «$X.XXXX»; целые — с тонким разделителем тысяч (\u202f), как в UI-ките
 * («18 402»). Даты — локаль браузера, короткий формат для таблиц.
 */

export function fmtUsd(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return "—";
  const sign = v < 0 ? "−" : "";
  return `${sign}$${Math.abs(v).toFixed(digits)}`;
}

/** Сумма пополнения/транзакции — 2 знака */
export function fmtMoney(v: number): string {
  return fmtUsd(v, 2);
}

export function fmtInt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return Math.round(v)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
}

/** «01.09 14:22» — для строк таблиц; при другом годе — «01.09.25 14:22» */
export function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const yy = sameYear ? "" : `.${String(d.getFullYear()).slice(-2)}`;
  return `${dd}.${mm}${yy} ${hh}:${mi}`;
}

/** «7 сентября 2026» — период подписки */
export function fmtDateLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

/** ISO-дата (YYYY-MM-DD) для <input type="date"> и query from/to */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
