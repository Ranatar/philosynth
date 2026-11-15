/**
 * Текущее состояние адресата предложения (беседа 17.2): значения правимых
 * полей элемента либо исходник подраздела — для формы «предложить замену»
 * (чем заполнить поле) и панели решения (левая сторона разницы).
 *
 * Элемент ищется по текущему id (после пересоздания строки адрес
 * переразрешён сервером — `resolution.currentId`), затем по ключу адреса теми
 * же shared-функциями, что считают ключи пометок 16.3.
 */
import { ELEMENT_STEP_FIELDS } from "@philosynth/shared/constants/edit-steps";
import type { ElementStepKind } from "@philosynth/shared/types/edit-plan";
import { categoryKey, edgeKey, parseSubsectionKey, termKey, thesisKey } from "@philosynth/shared/utils/discussion-address";

import { getCategories, getGlossary, getTheses } from "../api/elements";
import { getSubsectionSource } from "../api/sections";
import { isElementStepKind } from "./proposals";

export type CurrentTarget =
  | { kind: "element"; elementKind: ElementStepKind; id: string; name: string; fields: Record<string, string> }
  | { kind: "subsection"; sectionKey: string; name: string; html: string; locked: string | null }
  | { kind: "section"; sectionKey: string }
  | null;

const pick = (kind: ElementStepKind, row: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const f of ELEMENT_STEP_FIELDS[kind]) out[f] = typeof row[f] === "string" ? (row[f] as string) : "";
  return out;
};

export async function loadCurrentTarget(
  synthesisId: string,
  address: { kind: string; key: string; id: string | null },
  currentId?: string | null,
): Promise<CurrentTarget> {
  const id = currentId ?? address.id;
  if (address.kind === "section") return { kind: "section", sectionKey: address.key };
  if (address.kind === "subsection") {
    const parsed = parseSubsectionKey(address.key);
    if (!parsed) return null;
    const src = await getSubsectionSource(synthesisId, parsed.sectionKey, parsed.dataSection);
    return { kind: "subsection", sectionKey: parsed.sectionKey, name: parsed.dataSection, html: src.html, locked: src.lock ? src.lock.hint : null };
  }
  if (!isElementStepKind(address.kind)) return null;
  if (address.kind === "thesis") {
    const rows = await getTheses(synthesisId);
    const t = rows.find((x) => x.id === id) ?? rows.find((x) => thesisKey(x.label, x.thesisNum) === address.key);
    return t ? { kind: "element", elementKind: "thesis", id: t.id, name: t.label ?? `№${t.thesisNum}`, fields: pick("thesis", t as unknown as Record<string, unknown>) } : null;
  }
  if (address.kind === "glossary_term") {
    const rows = await getGlossary(synthesisId);
    const g = rows.find((x) => x.id === id) ?? rows.find((x) => termKey(x.term) === address.key);
    return g ? { kind: "element", elementKind: "glossary_term", id: g.id, name: g.term, fields: pick("glossary_term", g as unknown as Record<string, unknown>) } : null;
  }
  const graph = await getCategories(synthesisId);
  if (address.kind === "category") {
    const c = graph.categories.find((x) => x.id === id) ?? graph.categories.find((x) => categoryKey(x.name) === address.key);
    return c ? { kind: "element", elementKind: "category", id: c.id, name: c.name, fields: pick("category", c as unknown as Record<string, unknown>) } : null;
  }
  const names = new Map(graph.categories.map((c) => [c.id, c.name]));
  const e =
    graph.edges.find((x) => x.id === id) ??
    graph.edges.find((x) => edgeKey(names.get(x.sourceId) ?? "", names.get(x.targetId) ?? "", x.edgeType) === address.key);
  return e
    ? { kind: "element", elementKind: "edge", id: e.id, name: `${names.get(e.sourceId) ?? "?"} → ${names.get(e.targetId) ?? "?"}`, fields: pick("edge", e as unknown as Record<string, unknown>) }
    : null;
}
