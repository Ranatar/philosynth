/**
 * Переход к термину глоссария в документе. Беседа 18.2 (п. 3).
 *
 * Поиск каталога (18.1) находит термин и отдаёт его id; карточка выдачи
 * ведёт на `/synthesis/:id?term=<id>&termKey=<ключ>`. Страница концепции
 * разрешает адрес в КЛЮЧ имени термина (`termKey`, тот же, что у адресов
 * обсуждения 16.1), а этот компонент находит строку термина в разделе
 * глоссария, прокручивает к ней и обводит рамкой.
 *
 * Рамка — НАЛОЖЕНИЕ, как пометки 16.3 (AddressMarks): тело раздела —
 * `dangerouslySetInnerHTML`, и вписать подсветку в его строку значило бы
 * сменить ссылку `{ __html }` и переписать innerHTML (грабля 9.2). Здесь DOM
 * раздела только читается: измеряется строка таблицы относительно хозяина
 * `.doc-body-host` (position: relative), рамка рисуется соседом. Эффекты
 * живут тут, а не в SectionView (там они запрещены сторожем 4p).
 * Измерение — в useEffect: ref хозяина привязывается после layout-эффектов
 * детей (урок 16.3).
 */
import { useEffect, useRef, useState, type RefObject } from "react";

import { termKey } from "@philosynth/shared/utils/discussion-address";
import { tl } from "@philosynth/shared/i18n/t";

import { MARK_TABLES } from "../discussion/AddressMarks";

/** Раздел, где живут термины (ключ раздела документа). */
export const TERM_SECTION_KEY = "glossary";
/** Таблица терминов — имя подраздела берётся из списка пометок 16.3
 *  (MARK_TABLES ≡ TABLE_SUBSECTIONS рендерера, сторож 4bo): второго списка
 *  машинных имён data-section здесь нет. */
const TERM_TABLE_SUBSECTION =
  Object.entries(MARK_TABLES).find(([, kind]) => kind === "glossary_term")?.[0] ?? "";

const cellText = (el: Element | null | undefined): string =>
  (el?.textContent ?? "").replace(/[✎⏫]/g, "").replace(/\s+/g, " ").trim();

/**
 * Строка термина в теле раздела по ключу имени. Сначала — «Таблица
 * определений», затем прочие таблицы раздела: в импортированном документе
 * термины стоят и в соседних таблицах (разбор 1.4 берёт их оттуда же).
 */
export function findTermRow(host: ParentNode, key: string): Element | null {
  if (!key) return null;
  const tables: Element[] = [];
  for (const sub of host.querySelectorAll("[data-section]")) {
    if (sub.getAttribute("data-section") === TERM_TABLE_SUBSECTION) tables.push(...sub.querySelectorAll("table"));
  }
  for (const t of host.querySelectorAll("table")) if (!tables.includes(t)) tables.push(t);
  for (const table of tables) {
    for (const tr of table.querySelectorAll("tbody tr")) {
      const first = [...tr.querySelectorAll("td")].find((td) => !td.classList.contains("inline-edit-cell"));
      if (first && termKey(cellText(first)) === key) return tr;
    }
  }
  return null;
}

export interface TermFocusRequest {
  /** Ключ имени термина (`termKey`) */
  key: string;
  /** Смена — повод прокрутить заново (повторный переход к тому же термину) */
  nonce: number;
}

export interface TermFocusProps {
  /** Хозяин тела раздела (.doc-body-host, position: relative) */
  host: RefObject<HTMLDivElement | null>;
  /** Строка раздела — повод перемерить (сама строка здесь не читается) */
  html: string;
  focus: TermFocusRequest;
  /** Нашлась ли строка термина в разделе (для сообщения страницы) */
  onResolved?: ((found: boolean) => void) | undefined;
}

interface Frame {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Страница после перехода ещё оседает (шрифты, соседние разделы) —
 *  прокрутка повторяется на перемерах в этом окне (урок 16.3). */
const SETTLE_MS = 1500;
/** Доля высоты окна, с которой строка считается «высокой» (ставится началом). */
const TALL_ROW = 0.8;

export function TermFocus({ host, html, focus, onResolved }: TermFocusProps) {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [tick, setTick] = useState(0);
  const settle = useRef<{ nonce: number; until: number } | null>(null);
  const resolved = useRef(onResolved);
  resolved.current = onResolved;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const row = findTermRow(el, focus.key);
    resolved.current?.(row !== null);
    if (!row) {
      setFrame(null);
    } else {
      const hr = el.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      setFrame({ top: r.top - hr.top, left: r.left - hr.left, width: r.width, height: r.height });
      const now = Date.now();
      const cur = settle.current;
      if (!cur || cur.nonce !== focus.nonce) settle.current = { nonce: focus.nonce, until: now + SETTLE_MS };
      // Строка выше окна (длинное определение) по центру не помещается —
      // её начало с именем термина ушло бы за верх: такую ставим началом
      if (now <= (settle.current?.until ?? 0)) row.scrollIntoView({ block: r.height > window.innerHeight * TALL_ROW ? "start" : "center" });
    }
    // html — повод перемерить после смены тела раздела; tick — размеры
  }, [host, html, focus.key, focus.nonce, tick]);

  // Наблюдатель размеров — отдельным эффектом без tick в зависимостях:
  // ResizeObserver сообщает о цели сразу при observe(), и пересоздание его
  // на каждом перемере крутило бы перемер без конца
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const bump = () => setTick((t) => t + 1);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(bump) : null;
    ro?.observe(el);
    window.addEventListener("resize", bump);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", bump);
    };
  }, [host]);

  useEffect(() => {
    const t1 = window.setTimeout(() => setTick((t) => t + 1), 400);
    const t2 = window.setTimeout(() => setTick((t) => t + 1), 1200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [focus.nonce]);

  if (!frame) return null;
  return (
    <div className="term-focus" style={frame} data-testid="term-focus" data-term-key={focus.key} aria-hidden="true">
      <span className="term-focus-label">{tl("document.termFocus.label", "найденный термин")}</span>
    </div>
  );
}
