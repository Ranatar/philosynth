/**
 * Ожидаемая версия на путях правки (беседа 17.1, п.4): PATCH элемента,
 * правка подраздела, капсула, создание плана. Не совпало — `VersionConflictError`
 * → 409 VERSION_CONFLICT с текущим значением; без ожидания — как прежде
 * (старые клиенты), клиент 17.2 шлёт всегда. Перезаписи «последний победил»
 * здесь нет и обходного «force» нет.
 *
 * Гонка двух одновременных правок одного элемента: проверка и запись версии
 * идут в одной транзакции под `pg_advisory_xact_lock` по id элемента — второй
 * запрос ждёт первого и видит уже новую версию.
 */
import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "../db/index.js";
import { readSubsectionSource } from "../utils/html-parser.js";

import type { VersionedElementType } from "@philosynth/shared/types/elements";
import type { PlanExpectation } from "@philosynth/shared/types/edit-plan";
import {
  sectionContentHash,
  subsectionContentHash,
  type VersionConflictDetails,
} from "@philosynth/shared/utils/expected-version";
import { parseElementStepTarget } from "@philosynth/shared/constants/edit-steps";
import { tl } from "@philosynth/shared/i18n/t";

const { elementVersions, sections, syntheses } = schema;

type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export class VersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT" as const;
  constructor(public readonly details: VersionConflictDetails | { conflicts: VersionConflictDetails[] }) {
    super(tl("server.expectedVersion.conflict", "Объект изменился с тех пор, как вы его открыли, — перечитайте и повторите правку"));
    this.name = "VersionConflictError";
  }
}

/** Негодное ожидание (не целое ≥ 0 / не строка) — ошибка формы запроса. */
export class ExpectedVersionFormatError extends Error {
  readonly code = "VALIDATION_ERROR" as const;
  constructor(public readonly details: Record<string, string>) {
    super(tl("common.invalidData", "Невалидные данные"));
    this.name = "ExpectedVersionFormatError";
  }
}

/** Ответ на обе ошибки — одно место для всех роутов. */
export function expectedVersionErrorResponse(
  err: unknown,
): { status: 400 | 409; body: { error: string; code: string; details: unknown } } | null {
  if (err instanceof VersionConflictError)
    return { status: 409, body: { error: err.message, code: err.code, details: err.details } };
  if (err instanceof ExpectedVersionFormatError)
    return { status: 400, body: { error: err.message, code: err.code, details: err.details } };
  return null;
}

/** Текущий номер версии элемента (0 — версий не было). */
export async function currentElementVersion(
  tx: DbLike,
  elementType: VersionedElementType,
  elementId: string,
): Promise<number> {
  const [mx] = await tx
    .select({ max: sql<number>`coalesce(max(${elementVersions.version}), 0)` })
    .from(elementVersions)
    .where(and(eq(elementVersions.elementType, elementType), eq(elementVersions.elementId, elementId)));
  return Number(mx?.max ?? 0);
}

/**
 * 17.2 (Д-81): номера последних версий ВСЕХ элементов вида в синтезе — для
 * DTO чтения (`version`). Зовётся ДО чтения строк элементов: правка, попавшая
 * между двумя чтениями, даст клиенту новое содержимое со старым номером —
 * ложный конфликт при записи (безопасно), а не молчаливую перезапись.
 */
export async function elementVersionsOf(
  synthesisId: string,
  elementType: VersionedElementType,
): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: elementVersions.elementId, max: sql<number>`max(${elementVersions.version})` })
    .from(elementVersions)
    .where(and(eq(elementVersions.synthesisId, synthesisId), eq(elementVersions.elementType, elementType)))
    .groupBy(elementVersions.elementId);
  return new Map(rows.map((r) => [r.id, Number(r.max ?? 0)]));
}

/**
 * Сверка ожидаемого номера версии элемента. Зовётся ВНУТРИ транзакции правки
 * до записи версии. `expected === undefined` — ожидания нет: прежнее
 * поведение. Блокировка — по id элемента на время транзакции.
 */
export async function assertElementVersion(
  tx: DbLike,
  elementType: VersionedElementType,
  elementId: string,
  expected: unknown,
): Promise<void> {
  if (expected === undefined || expected === null) return;
  if (typeof expected !== "number" || !Number.isInteger(expected) || expected < 0)
    throw new ExpectedVersionFormatError({
      expectedVersion: tl("server.expectedVersion.integerExpected", "ожидается целое ≥ 0 — номер версии элемента"),
    });
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`element-version:${elementId}`}))`);
  const current = await currentElementVersion(tx, elementType, elementId);
  if (current !== expected)
    throw new VersionConflictError({
      target: `${elementType}:${elementId}`,
      expected: { version: expected },
      current: { version: current },
    });
}

/** Сверка ожидаемого хэша содержимого (раздел, подраздел, капсула). */
export function assertContentHash(expected: unknown, currentHash: string, target: string): void {
  if (expected === undefined || expected === null) return;
  if (typeof expected !== "string" || !/^[0-9a-f]{64}$/.test(expected))
    throw new ExpectedVersionFormatError({
      expectedHash: tl("server.expectedVersion.hashExpected", "ожидается sha256 содержимого (64 шестнадцатеричных знака)"),
    });
  if (expected !== currentHash)
    throw new VersionConflictError({ target, expected: { hash: expected }, current: { hash: currentHash } });
}

export { sectionContentHash, subsectionContentHash };

/**
 * Ожидания плана (`CreatePlanRequest.expected`): каждый адресат сверяется с
 * живым документом ДО сборки шагов; расхождения отдаются ВСЕ разом
 * (`details.conflicts`). Адресата нет — тоже конфликт (current пуст).
 */
export async function assertPlanExpectations(synthesisId: string, expected: unknown): Promise<void> {
  if (expected === undefined || expected === null) return;
  if (!Array.isArray(expected))
    throw new ExpectedVersionFormatError({ expected: tl("server.expectedVersion.listExpected", "ожидается список { target, version | hash }") });
  const conflicts: VersionConflictDetails[] = [];
  let sectionRows: Map<string, string> | null = null;
  const sectionsOf = async (): Promise<Map<string, string>> => {
    if (sectionRows) return sectionRows;
    const rows = await db
      .select({ key: sections.key, html: sections.htmlContent })
      .from(sections)
      .where(eq(sections.synthesisId, synthesisId));
    sectionRows = new Map(rows.map((r) => [r.key, r.html]));
    return sectionRows;
  };
  for (const raw of expected as PlanExpectation[]) {
    const target = raw && typeof raw === "object" ? raw.target : undefined;
    if (typeof target !== "string" || !target)
      throw new ExpectedVersionFormatError({ expected: tl("server.expectedVersion.targetRequired", "у каждого ожидания обязателен target") });
    const el = parseElementStepTarget(target);
    if (el) {
      if (typeof raw.version !== "number" || !Number.isInteger(raw.version) || raw.version < 0)
        throw new ExpectedVersionFormatError({ expected: tl("server.expectedVersion.integerExpected", "ожидается целое ≥ 0 — номер версии элемента") });
      const current = await currentElementVersion(db, el.kind, el.elementId);
      if (current !== raw.version)
        conflicts.push({ target, expected: { version: raw.version }, current: { version: current } });
      continue;
    }
    if (typeof raw.hash !== "string" || !/^[0-9a-f]{64}$/.test(raw.hash))
      throw new ExpectedVersionFormatError({ expected: tl("server.expectedVersion.hashExpected", "ожидается sha256 содержимого (64 шестнадцатеричных знака)") });
    let currentHash: string | null = null;
    if (target === "capsule") {
      const [s] = await db
        .select({ capsule: syntheses.capsuleHtml })
        .from(syntheses)
        .where(eq(syntheses.id, synthesisId))
        .limit(1);
      currentHash = s ? await sectionContentHash(s.capsule) : null;
    } else {
      const i = target.indexOf(":");
      const map = await sectionsOf();
      if (i < 0) {
        const html = map.get(target);
        currentHash = html === undefined ? null : await sectionContentHash(html);
      } else {
        const html = map.get(target.slice(0, i));
        const src = html === undefined ? null : readSubsectionSource(html, target.slice(i + 1));
        currentHash = src ? await subsectionContentHash(src.html) : null;
      }
    }
    if (currentHash !== raw.hash) conflicts.push({ target, expected: { hash: raw.hash }, current: { hash: currentHash } });
  }
  if (conflicts.length) throw new VersionConflictError({ conflicts });
}
