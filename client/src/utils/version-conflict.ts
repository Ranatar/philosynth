/**
 * Конфликт версий на клиенте (беседа 17.2, Д-81).
 *
 * Каждая запись шлёт ожидание: `expectedVersion` — правка элемента,
 * `expectedHash` — подраздел и капсула, `expected[]` — план. Сервер 17.1 при
 * расхождении отвечает 409 VERSION_CONFLICT с ТЕКУЩИМ значением и ничего не
 * пишет. Здесь — разбор ответа и фразы; выбор у человека один — «перечитать
 * и повторить»: объект читается заново, набранное остаётся в форме, запись
 * повторяет человек, уже видя текущее состояние. Пути «перезаписать» нет —
 * ожидание уходит с каждой записью и обходного флага у клиента не бывает.
 */
import { tl } from "@philosynth/shared/i18n/t";
import type { PlanExpectation } from "@philosynth/shared/types/edit-plan";
import { sectionContentHash, type VersionConflictDetails } from "@philosynth/shared/utils/expected-version";

import { ApiError } from "../api/client";

export type { VersionConflictDetails };

/** Расхождения из ответа 409 VERSION_CONFLICT; null — это не конфликт версий. */
export function conflictsOf(err: unknown): VersionConflictDetails[] | null {
  if (!(err instanceof ApiError) || err.code !== "VERSION_CONFLICT") return null;
  const d = err.details as { conflicts?: unknown; target?: unknown } | null | undefined;
  if (d && Array.isArray(d.conflicts)) return d.conflicts.filter(isConflict);
  if (isConflict(d)) return [d];
  return [];
}

function isConflict(v: unknown): v is VersionConflictDetails {
  return !!v && typeof v === "object" && typeof (v as { target?: unknown }).target === "string";
}

/** Вид адресата конфликта по `target` ответа сервера. */
export type ConflictTargetKind = "element" | "subsection" | "section" | "capsule";

export function conflictTargetKind(target: string): ConflictTargetKind {
  if (target === "capsule") return "capsule";
  if (/^(category|edge|thesis|glossary_term):/.test(target)) return "element";
  return target.includes(":") ? "subsection" : "section";
}

/**
 * Что сказать человеку об одном расхождении. У элемента называются номера
 * версий (его и текущая); у текста (подраздел, раздел, капсула) хэш человеку
 * ничего не говорит — называется сам факт, текущий текст показывает форма
 * после перечитки. `name` — как объект назван в интерфейсе.
 */
export function conflictText(c: VersionConflictDetails, name?: string): string {
  const kind = conflictTargetKind(c.target);
  if (kind === "element") {
    const mine = c.expected.version;
    const cur = c.current.version;
    const versions =
      typeof mine === "number" && typeof cur === "number"
        ? tl("utils.versionConflict.versions", " У вас была версия {mine}, сейчас — {current}.", { mine, current: cur })
        : "";
    return (
      (name
        ? tl("utils.versionConflict.elementNamed", "«{name}» изменили, пока вы правили.", { name })
        : tl("utils.versionConflict.element", "Элемент изменили, пока вы правили.")) + versions
    );
  }
  if (c.current.hash === null)
    return name
      ? tl("utils.versionConflict.goneNamed", "«{name}» больше нет в документе.", { name })
      : tl("utils.versionConflict.gone", "Адресата больше нет в документе.");
  if (kind === "capsule") return tl("utils.versionConflict.capsule", "Капсулу изменили, пока вы правили.");
  if (kind === "subsection")
    return name
      ? tl("utils.versionConflict.subsectionNamed", "Подраздел «{name}» изменили, пока вы правили.", { name })
      : tl("utils.versionConflict.subsection", "Подраздел изменили, пока вы правили.");
  return name
    ? tl("utils.versionConflict.sectionNamed", "Раздел «{name}» изменился после того, как вы открыли документ.", { name })
    : tl("utils.versionConflict.section", "Раздел изменился после того, как вы открыли документ.");
}

/** Общая приписка: запись не сделана, что делать дальше. */
export function conflictAdvice(): string {
  return tl(
    "utils.versionConflict.advice",
    "Запись не сделана — чужая правка не затёрта. Перечитайте: форма покажет текущее состояние, ваше набранное останется, и запись можно будет повторить.",
  );
}

/**
 * Ожидания плана по разделам, которые он перегенерирует или удаляет: хэш
 * содержимого раздела, каким его видит человек (store). Раздел без текста в
 * сторе (не загружен) ожидания не получает — сверять не с чем.
 */
export async function sectionExpectations(
  keys: readonly string[],
  htmlOf: (key: string) => string | undefined,
): Promise<PlanExpectation[]> {
  const out: PlanExpectation[] = [];
  for (const key of [...new Set(keys)]) {
    const html = htmlOf(key);
    if (typeof html !== "string") continue;
    out.push({ target: key, hash: await sectionContentHash(html) });
  }
  return out;
}

/**
 * Перенос набранного на перечитанный объект: поле, которое человек НЕ менял
 * (равно прежней основе), берётся из свежего состояния; изменённое — остаётся
 * как набрано. Так повтор записи не возвращает чужую правку соседнего поля к
 * прежнему значению. Сравнение — по JSON (поля черновиков плоские либо
 * массивы/словари строк).
 */
export function rebaseDraft<T extends object>(oldBase: T, value: T, fresh: T): { value: T; changedByOthers: (keyof T)[] } {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const out = { ...fresh };
  const changedByOthers: (keyof T)[] = [];
  for (const k of Object.keys(fresh) as (keyof T)[]) {
    if (!same(oldBase[k], fresh[k])) changedByOthers.push(k);
    if (!same(oldBase[k], value[k])) out[k] = value[k];
  }
  return { value: out, changedByOthers };
}
