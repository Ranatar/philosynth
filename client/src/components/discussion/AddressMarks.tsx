/**
 * Пометки у места (беседа 16.3, п. 2): у заголовка раздела, у <h4> каждого
 * подраздела и у строк таблиц категорий, связей, тезисов и терминов —
 * счётчик открытых веток и замечаний рецензий по сводке 16.1. Клик открывает
 * панель обсуждения адреса.
 *
 * КАК, и почему именно так. Тело раздела — `dangerouslySetInnerHTML` со
 * строкой, обогащённой до вставки (1.6b/9.2); React 19 переписывает
 * innerHTML при каждой смене ссылки `{ __html }` (грабля 9.2) — вписать
 * пометки в строку значило бы пересобирать тело при каждом изменении сводки
 * и терять набранное в редакторе подраздела. Поэтому пометки — НАЛОЖЕНИЕ:
 * компонент-сосед измеряет готовый DOM (getBoundingClientRect целей
 * относительно хозяина `.doc-body-host`, position: relative) и рисует свои
 * кнопки абсолютным позиционированием в правой кромке (.doc-section даёт
 * 48px поля). Строка раздела и ссылка `{ __html }` не меняются (сторож 4bo).
 *
 * Перемер — на смену строки раздела, сводки, размеров хозяина
 * (ResizeObserver) и окна. Эффект — здесь, а не в SectionView (у того
 * эффекты запрещены сторожем 4p; здесь эффект не трогает тело раздела,
 * только читает его). Измерение — в useEffect, НЕ в useLayoutEffect: ref
 * хозяина (`.doc-body-host`, родитель этого компонента) React привязывает
 * ПОСЛЕ layout-эффектов детей, и при монтировании (переход с вкладки
 * обратно на документ) host.current ещё null — пометки не появлялись, пока
 * не менялась сводка (найдено харнессом test-163). Прокрутка к адресу —
 * useLayoutEffect по уже измеренным целям.
 *
 * Нулевые пометки (адрес без обсуждения) рисуются бледно и проявляются при
 * наведении на свою цель (делегирование mouseover по хозяину) — так ветку
 * можно начать с любого места, а текст не тонет в значках.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

import { subsectionKey } from "@philosynth/shared/utils/discussion-address";
import type { AddressCounts } from "@philosynth/shared/types/discussion";
import { tl } from "@philosynth/shared/i18n/t";

import { addressKeyOfTarget, addressKindLabel, targetOf, type MarkTarget } from "../../utils/discussion";

/** Подразделы-таблицы и вид их строк — те же имена, что TABLE_SUBSECTIONS
 *  рендерера 1.4 (server/services/element-renderer.ts; сторож 4bo сверяет). */
export const MARK_TABLES: Readonly<Record<string, "category" | "edge" | "thesis" | "glossary_term">> = {
  "Таблица категорий": "category",
  "Таблица связей": "edge",
  "Сводная таблица тезисов": "thesis",
  "Таблица определений": "glossary_term",
};

/** Столбцы таблицы связей (element-renderer: Источник, Описание, Цель, Тип) */
const EDGE_COLS = { source: 0, target: 2, type: 3 } as const;

export interface MarkSpot {
  target: MarkTarget;
  top: number;
  left: number;
  count: number;
  /** DOM-цель (для прокрутки к месту) */
  el: Element;
}

const cellText = (el: Element | null | undefined): string =>
  (el?.textContent ?? "").replace(/[✎⏫]/g, "").replace(/\s+/g, " ").trim();

/** Цели раздела в DOM хозяина — в порядке документа. */
export function collectMarkTargets(host: HTMLElement, sectionKey: string): { target: MarkTarget; el: Element }[] {
  const out: { target: MarkTarget; el: Element }[] = [];
  const title = host.querySelector(".section-title");
  if (title) out.push({ target: targetOf("section", sectionKey, sectionKey, `${addressKindLabel("section")}: ${cellText(title)}`), el: title });
  for (const sub of host.querySelectorAll("[data-section]")) {
    const name = sub.getAttribute("data-section") ?? "";
    if (!name) continue;
    let h4: Element | null = null;
    for (const child of sub.children) if (child.tagName === "H4") { h4 = child; break; }
    if (h4) out.push({ target: targetOf("subsection", subsectionKey(sectionKey, name), sectionKey, `${addressKindLabel("subsection")}: ${cellText(h4) || name}`), el: h4 });
    const kind = MARK_TABLES[name];
    if (!kind) continue;
    const table = sub.querySelector("table");
    if (!table) continue;
    for (const tr of table.querySelectorAll("tbody tr")) {
      const tds = [...tr.querySelectorAll("td")].filter((td) => !td.classList.contains("inline-edit-cell"));
      const first = cellText(tds[0]);
      if (!first) continue;
      if (kind === "edge") {
        const src = first, tgt = cellText(tds[EDGE_COLS.target]), type = cellText(tds[EDGE_COLS.type]);
        if (!tgt) continue;
        out.push({ target: targetOf("edge", { source: src, target: tgt, type }, sectionKey, `${addressKindLabel("edge")}: ${src} → ${tgt}${type ? ` (${type})` : ""}`), el: tr });
      } else {
        out.push({ target: targetOf(kind, first, sectionKey, `${addressKindLabel(kind)}: ${first}`), el: tr });
      }
    }
  }
  return out;
}

export interface AddressMarksProps {
  sectionKey: string;
  /** Хозяин тела раздела (.doc-body-host, position: relative) */
  host: RefObject<HTMLDivElement | null>;
  /** Строка раздела — повод перемерить (сама строка здесь не читается) */
  html: string;
  counts: ReadonlyMap<string, AddressCounts>;
  /** Открытый в панели адрес — пометка подсвечена */
  activeKey: string | null;
  /** Просьба прокрутить к адресу (переход из вкладки/рецензии); nonce —
   *  чтобы повторный переход к тому же адресу тоже прокрутил */
  focus?: { key: string; nonce: number } | null | undefined;
  onOpen: (target: MarkTarget) => void;
}

export function AddressMarks({ sectionKey, host, html, counts, activeKey, focus, onOpen }: AddressMarksProps) {
  const [spots, setSpots] = useState<MarkSpot[]>([]);
  const [tick, setTick] = useState(0);
  const [hover, setHover] = useState<number>(-1);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let found: { target: MarkTarget; el: Element }[] = [];
    const measure = () => {
      const hostRect = el.getBoundingClientRect();
      found = collectMarkTargets(el, sectionKey);
      const next: MarkSpot[] = found.map(({ target, el: t }) => {
        const r = t.getBoundingClientRect();
        const c = counts.get(addressKeyOfTarget(target));
        const count = (c?.openComments ?? 0) + (c?.findings ?? 0);
        // правая кромка цели: в поле .doc-section (48px) пометка помещается;
        // если поля нет (узкий экран) — внутри кромки
        const room = hostRect.right - r.right;
        const left = room >= 40 ? r.right - hostRect.left + 6 : Math.max(0, r.right - hostRect.left - 34);
        return { target, top: r.top - hostRect.top + 2, left, count, el: t };
      });
      setSpots(next);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => setTick((t) => t + 1)) : null;
    ro?.observe(el);
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    // наведение на цель — показать её нулевую пометку
    const onOver = (ev: Event) => {
      const t = ev.target as Element | null;
      if (!t) return;
      const row = t.closest("tbody tr, h4, .section-title");
      if (!row) { setHover(-1); return; }
      const i = found.findIndex((f) => f.el === row);
      setHover(i);
    };
    const onLeave = () => setHover(-1);
    el.addEventListener("mouseover", onOver);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", onResize);
      el.removeEventListener("mouseover", onOver);
      el.removeEventListener("mouseleave", onLeave);
    };
    // html — повод перемерить после смены тела раздела; tick — ресайз
  }, [host, sectionKey, html, counts, tick]);

  const active = useMemo(() => spots.findIndex((s) => addressKeyOfTarget(s.target) === activeKey), [spots, activeKey]);

  // прокрутка к адресу — по nonce, когда цель измерена; страница после
  // перехода ещё оседает (шрифты, соседние разделы, правое поле панели),
  // поэтому в течение SETTLE_MS прокрутка повторяется на каждом перемере
  // и по двум таймерам — иначе место уезжает из-под первой прокрутки
  const SETTLE_MS = 1500;
  const focusRef = useRef<{ nonce: number; until: number } | null>(null);
  useLayoutEffect(() => {
    if (!focus) return;
    const now = Date.now();
    const cur = focusRef.current;
    if (!cur || cur.nonce !== focus.nonce) focusRef.current = { nonce: focus.nonce, until: now + SETTLE_MS };
    else if (now > cur.until) return;
    const spot = spots.find((s) => addressKeyOfTarget(s.target) === focus.key);
    if (!spot) return;
    spot.el.scrollIntoView({ block: "center" });
  }, [focus, spots]);
  useEffect(() => {
    if (!focus) return;
    const t1 = window.setTimeout(() => setTick((t) => t + 1), 400);
    const t2 = window.setTimeout(() => setTick((t) => t + 1), 1200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [focus]);

  return (
    <>
      {spots.map((s, i) => {
        const visible = s.count > 0 || i === hover || i === active;
        const cls = ["addr-mark", s.count > 0 ? "has" : "empty", i === active ? "active" : "", visible ? "" : "faint"].filter(Boolean).join(" ");
        return (
          <button
            key={addressKeyOfTarget(s.target)}
            type="button"
            className={cls}
            style={{ top: s.top, left: s.left }}
            title={s.count > 0 ? tl("discussion.addressMarks.openHint", "{title} — {n, plural, one {# запись} few {# записи} many {# записей} other {# записи}} обсуждения и рецензий", { title: s.target.title, n: s.count }) : tl("discussion.addressMarks.startHint", "{title} — обсудить", { title: s.target.title })}
            data-testid="addr-mark"
            data-address={addressKeyOfTarget(s.target)}
            data-count={s.count}
            onMouseEnter={() => setHover(i)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpen(s.target);
            }}
          >
            <span className="addr-mark-glyph" aria-hidden="true">◉</span>
            {s.count > 0 && <span className="addr-mark-count">{s.count}</span>}
          </button>
        );
      })}
    </>
  );
}
