/**
 * Адреса обсуждения на сервере (беседа 16.1): индекс адресуемых объектов
 * концепции и переразрешение адреса «id → ключ» против него. Чистая часть
 * (ключи, хэш, выдержка, состояние) — `shared/utils/discussion-address.ts`;
 * здесь — чтение строк БД и подразделов из html_content.
 *
 * Индекс строится на запрос один раз (комментарии и замечания одной
 * концепции ссылаются на десяток адресов) и хранит объекты семи видов:
 * synthesis (строка syntheses), section (sections), subsection (data-section
 * внутри html_content раздела — через readSubsectionSource, тот же
 * исходник, что правит человек в 9.2), category / edge (categories,
 * category_edges с именами концов), thesis (theses), glossary_term
 * (glossary_terms). Версия — max(element_versions.version) по (тип, id);
 * у synthesis и subsection версии нет (null).
 *
 * Поиск цели (`findTarget`): по id — сначала, по ключу — если id не
 * найден или не прислан. Так адрес, записанный до перегенерации графа,
 * находит категорию с тем же именем и новым id; хэш содержимого решает,
 * current это или outdated.
 */
import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "../db/index.js";
import { listSubsectionNames, readSubsectionSource } from "../utils/html-parser.js";

import type { AddressKind } from "@philosynth/shared/constants/discussion";
import type {
  AddressResolution,
  AddressTarget,
  DiscussionAddress,
} from "@philosynth/shared/types/discussion";
import {
  addressKeyOf,
  buildAddress,
  categoryKey,
  contentHash,
  edgeKey,
  excerptOf,
  htmlToText,
  parseSubsectionKey,
  resolutionOf,
  subsectionKey,
  termKey,
  thesisKey,
  type AddressableObject,
} from "@philosynth/shared/utils/discussion-address";

const {
  categories,
  categoryEdges,
  elementVersions,
  glossaryTerms,
  sections,
  syntheses,
  theses,
} = schema;

export interface AddressIndex {
  synthesisId: string;
  /** Все объекты, кроме подразделов (те достраиваются по требованию) */
  objects: AddressableObject[];
  byId: Map<string, AddressableObject>;
  byKey: Map<string, AddressableObject>;
  /** Разделы: ключ → html (для подразделов по требованию) */
  sectionHtml: Map<string, string>;
  /** Кэш подразделов раздела (ключ раздела → объекты) */
  subsections: Map<string, AddressableObject[]>;
  /** Кэш хэшей по объекту */
  hashes: WeakMap<AddressableObject, Promise<string>>;
}

const idKey = (kind: AddressKind, id: string): string => `${kind}#${id}`;

/** Содержимое раздела для хэша: html с схлопнутыми пробелами (перерисовка
 *  таблицы рендерером 5.1 меняет html — и это законно «новая версия»). */
const sectionPayload = (html: string): { html: string } => ({ html: html.replace(/\s+/g, " ").trim() });

export async function loadAddressIndex(synthesisId: string): Promise<AddressIndex> {
  const [row] = await db
    .select({ id: syntheses.id, title: syntheses.title, capsuleHtml: syntheses.capsuleHtml })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  const [secRows, catRows, edgeRows, thesisRows, termRows, verRows] = await Promise.all([
    db.select().from(sections).where(eq(sections.synthesisId, synthesisId)),
    db.select().from(categories).where(eq(categories.synthesisId, synthesisId)),
    db.select().from(categoryEdges).where(eq(categoryEdges.synthesisId, synthesisId)),
    db.select().from(theses).where(eq(theses.synthesisId, synthesisId)),
    db.select().from(glossaryTerms).where(eq(glossaryTerms.synthesisId, synthesisId)),
    db
      .select({
        elementType: elementVersions.elementType,
        elementId: elementVersions.elementId,
        version: sql<number>`max(${elementVersions.version})`,
      })
      .from(elementVersions)
      .where(eq(elementVersions.synthesisId, synthesisId))
      .groupBy(elementVersions.elementType, elementVersions.elementId),
  ]);
  const versions = new Map<string, number>();
  for (const v of verRows) versions.set(`${v.elementType}#${v.elementId}`, Number(v.version) || 0);
  const ver = (type: string, id: string): number => versions.get(`${type}#${id}`) ?? 0;

  const objects: AddressableObject[] = [];
  if (row) {
    objects.push({
      kind: "synthesis",
      key: row.id,
      id: row.id,
      payload: null,
      text: row.title,
      version: null,
    });
  }
  const sectionHtml = new Map<string, string>();
  for (const s of secRows) {
    sectionHtml.set(s.key, s.htmlContent);
    objects.push({
      kind: "section",
      key: s.key,
      id: s.id,
      payload: sectionPayload(s.htmlContent),
      text: htmlToText(s.htmlContent),
      version: ver("section", s.id),
    });
  }
  const catName = new Map<string, string>();
  for (const c of catRows) {
    catName.set(c.id, c.name);
    objects.push({
      kind: "category",
      key: categoryKey(c.name),
      id: c.id,
      payload: { name: c.name, type: c.type, definition: c.definition, origin: c.origin },
      text: `${c.name} — ${c.definition}`,
      version: ver("category", c.id),
    });
  }
  for (const e of edgeRows) {
    const src = catName.get(e.sourceId) ?? "";
    const tgt = catName.get(e.targetId) ?? "";
    objects.push({
      kind: "edge",
      key: edgeKey(src, tgt, e.edgeType),
      id: e.id,
      payload: {
        source: src,
        target: tgt,
        type: e.edgeType,
        direction: e.direction,
        description: e.description,
      },
      text: `${src} → ${tgt} (${e.edgeType}): ${e.description}`,
      version: ver("edge", e.id),
    });
  }
  for (const t of thesisRows) {
    objects.push({
      kind: "thesis",
      key: thesisKey(t.label, t.thesisNum),
      id: t.id,
      payload: { label: thesisKey(t.label, t.thesisNum), formulation: t.formulation, justification: t.justification },
      text: `${thesisKey(t.label, t.thesisNum)}. ${t.formulation}`,
      version: ver("thesis", t.id),
    });
  }
  for (const g of termRows) {
    objects.push({
      kind: "glossary_term",
      key: termKey(g.term),
      id: g.id,
      payload: { term: g.term, definition: g.definition, extraColumns: g.extraColumns ?? {} },
      text: `${g.term} — ${g.definition}`,
      version: ver("glossary_term", g.id),
    });
  }
  const byId = new Map<string, AddressableObject>();
  const byKey = new Map<string, AddressableObject>();
  for (const o of objects) {
    if (o.id) byId.set(idKey(o.kind, o.id), o);
    // первый по порядку строк — при одноимённых объектах ключ адресует его
    const k = addressKeyOf(o.kind, o.key);
    if (!byKey.has(k)) byKey.set(k, o);
  }
  return { synthesisId, objects, byId, byKey, sectionHtml, subsections: new Map(), hashes: new WeakMap() };
}

/** Подразделы раздела как адресуемые объекты (строятся по требованию). */
export function subsectionsOf(index: AddressIndex, sectionKey: string): AddressableObject[] {
  const cached = index.subsections.get(sectionKey);
  if (cached) return cached;
  const html = index.sectionHtml.get(sectionKey);
  const out: AddressableObject[] = [];
  if (html) {
    for (const name of listSubsectionNames(html)) {
      const src = readSubsectionSource(html, name);
      if (!src) continue;
      out.push({
        kind: "subsection",
        key: subsectionKey(sectionKey, name),
        id: null,
        payload: { html: src.html.replace(/\s+/g, " ").trim() },
        text: htmlToText(src.html),
        version: null,
      });
    }
  }
  index.subsections.set(sectionKey, out);
  return out;
}

/** Хэш содержимого объекта (кэш на индекс). */
export function hashOf(index: AddressIndex, obj: AddressableObject): Promise<string> {
  let p = index.hashes.get(obj);
  if (!p) {
    p = contentHash(obj.kind, obj.payload);
    index.hashes.set(obj, p);
  }
  return p;
}

function findByKey(index: AddressIndex, kind: AddressKind, key: string): AddressableObject | null {
  if (kind === "subsection") {
    const parsed = parseSubsectionKey(key);
    if (!parsed) return null;
    return subsectionsOf(index, parsed.sectionKey).find((o) => o.key === key) ?? null;
  }
  return index.byKey.get(addressKeyOf(kind, key)) ?? null;
}

/** Нормализация ключа, присланного клиентом (имя категории как в
 *  документе → ключ индекса); у разделов/подразделов ключ машинный. */
function normalizeTargetKey(kind: AddressKind, key: string): string {
  switch (kind) {
    case "category":
      return categoryKey(key);
    case "glossary_term":
      return termKey(key);
    case "thesis":
      return key.trim();
    default:
      return key;
  }
}

/**
 * Цель нового замечания → объект индекса: по id (если прислан и найден),
 * иначе по ключу. null — объекта нет.
 */
export function findTarget(index: AddressIndex, target: AddressTarget): AddressableObject | null {
  if (target.kind === "synthesis") return index.byKey.get(addressKeyOf("synthesis", index.synthesisId)) ?? null;
  if (target.id) {
    const byId = index.byId.get(idKey(target.kind, target.id));
    if (byId) return byId;
  }
  if (target.key) return findByKey(index, target.kind, normalizeTargetKey(target.kind, target.key));
  return null;
}

/** Адрес и выдержка объекта на момент записи. */
export async function addressOf(
  index: AddressIndex,
  obj: AddressableObject,
): Promise<{ address: DiscussionAddress; excerpt: string }> {
  const address = await buildAddress(obj);
  index.hashes.set(obj, Promise.resolve(address.hash));
  return { address, excerpt: excerptOf(obj.text) };
}

/**
 * Переразрешение адреса против текущего состояния концепции: сначала по id
 * (объект на месте — возможно, изменился), затем по ключу (пересоздан с
 * новым id), иначе удалён.
 */
export async function resolveAddress(index: AddressIndex, addr: DiscussionAddress): Promise<AddressResolution> {
  let obj: AddressableObject | null = null;
  if (addr.id) obj = index.byId.get(idKey(addr.kind, addr.id)) ?? null;
  if (!obj) obj = findByKey(index, addr.kind, addr.key);
  if (!obj) return resolutionOf(addr, null);
  return resolutionOf(addr, { id: obj.id, hash: await hashOf(index, obj), version: obj.version });
}

/** Условие «объект этого синтеза» для запросов по (kind, id) — используется
 *  сторожем и тестами; здесь же, чтобы перечень таблиц адресов жил в одном
 *  месте. */
export function addressTableOf(kind: AddressKind) {
  switch (kind) {
    case "section":
      return sections;
    case "category":
      return categories;
    case "edge":
      return categoryEdges;
    case "thesis":
      return theses;
    case "glossary_term":
      return glossaryTerms;
    default:
      return null;
  }
}

/** Объект с таким id принадлежит синтезу (защита от чужого id в цели). */
export async function objectBelongs(kind: AddressKind, id: string, synthesisId: string): Promise<boolean> {
  const table = addressTableOf(kind);
  if (!table) return kind === "synthesis" ? id === synthesisId : false;
  const [r] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.synthesisId, synthesisId)))
    .limit(1);
  return !!r;
}
