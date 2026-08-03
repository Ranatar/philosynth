/**
 * Аудит согласованности: schema.ts ↔ shared/types ↔ shared/constants.
 */
import { getTableColumns } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { schema } from "./db/index.js";
import { ML, DL, SL } from "@philosynth/shared/constants/labels";
import { METHOD_CODE, LEVEL_CODE, ORDER_CODE, DEPTH_CODE } from "@philosynth/shared/constants/methods";
import { SECTION_KEYS } from "@philosynth/shared/constants/section-labels";
import { ALL_CTX_KEYS } from "@philosynth/shared/constants/ctx-keys";

const TYPES_DIR = "../packages/shared/types/";

/** Парсер полей интерфейса из .ts (файлы форматированы единообразно) */
function interfaceKeys(file: string, iface: string): Set<string> {
  const src = readFileSync(TYPES_DIR + file, "utf-8");
  const m = src.match(new RegExp(`export interface ${iface}\\b[^{]*\\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`${iface} не найден в ${file}`);
  const keys = new Set<string>();
  for (const line of m[1]!.split("\n")) {
    const km = line.match(/^\s{2}(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)\??:/);
    if (km) keys.add(km[1]!);
  }
  return keys;
}

interface Pair {
  table: keyof typeof schema; file: string; iface: string;
  /** Поля схемы, осознанно отсутствующие в API-типе */
  schemaOnly?: string[];
  /** Поля типа, осознанно отсутствующие в схеме (join/computed/mapped) */
  typeOnly?: string[];
  /** Переименования схема→тип */
  renamed?: Record<string, string>;
}

const PAIRS: Pair[] = [
  { table: "syntheses", file: "synthesis.ts", iface: "SynthesisFull",
    schemaOnly: ["userId", "versionBase", "versionSub", "versionModes", "versionModeRegen"],
    typeOnly: ["version", "philosophers", "parentSyntheses", "childSyntheses",
      // 1.6: оценки паузы вычисляются computePauseEstimates (1.4b), не колонка
      "pauseEstimates"] },
  { table: "sections", file: "section.ts", iface: "SectionFull",
    schemaOnly: ["id", "synthesisId", "createdAt", "updatedAt"],
    typeOnly: ["subsections"], renamed: { secContext: "secContext" } },
  { table: "categories", file: "graph.ts", iface: "Category" },
  { table: "categoryEdges", file: "graph.ts", iface: "CategoryEdge" },
  { table: "clusterLabels", file: "graph.ts", iface: "ClusterLabel" },
  { table: "theses", file: "elements.ts", iface: "Thesis" },
  { table: "glossaryTerms", file: "elements.ts", iface: "GlossaryTerm" },
  { table: "dialogueTurns", file: "elements.ts", iface: "DialogueTurn" },
  { table: "elementVersions", file: "elements.ts", iface: "ElementVersion" },
  { table: "editPlans", file: "edit-plan.ts", iface: "EditPlan",
    schemaOnly: ["userId", "updatedAt"], typeOnly: ["estimatedCost"] },
  { table: "modeResults", file: "modes.ts", iface: "ModeResult" },
  { table: "generationLog", file: "generation.ts", iface: "GenLogEntry" },
  { table: "contextLog", file: "generation.ts", iface: "CtxLogEntry" },
  { table: "synthesisLineage", file: "lineage.ts", iface: "LineageRecord" },
  { table: "apiUsage", file: "billing.ts", iface: "ApiUsage" },
  { table: "transactions", file: "billing.ts", iface: "Transaction" },
  { table: "subscriptionPlans", file: "billing.ts", iface: "SubscriptionPlan" },
  { table: "userSubscriptions", file: "billing.ts", iface: "UserSubscription" },
  { table: "apiKeys", file: "billing.ts", iface: "ApiKeyInfo",
    schemaOnly: ["userId", "encryptedKey"], renamed: { keyPrefix: "prefix" } },
  { table: "categoryTypeCatalog", file: "elements.ts", iface: "CategoryType" },
  { table: "relationshipTypeCatalog", file: "elements.ts", iface: "RelationshipType" },
  { table: "elementEnrichments", file: "elements.ts", iface: "ElementEnrichment" },
  { table: "characteristicJustifications", file: "elements.ts", iface: "CharacteristicJustification" },
  { table: "representationTransforms", file: "elements.ts", iface: "RepresentationTransform" },
  { table: "promptTemplates", file: "prompts.ts", iface: "PromptTemplate" },
  { table: "synthesisConfigs", file: "prompts.ts", iface: "SynthesisConfig" },
];

let problems = 0;
const report: string[] = [];

for (const p of PAIRS) {
  const table = schema[p.table] as Parameters<typeof getTableColumns>[0];
  const cols = new Set(Object.keys(getTableColumns(table)));
  const tkeys = interfaceKeys(p.file, p.iface);
  const ren = p.renamed ?? {};
  const missInType = [...cols].filter(c =>
    !tkeys.has(ren[c] ?? c) && !(p.schemaOnly ?? []).includes(c));
  const extraInType = [...tkeys].filter(k =>
    !cols.has(k) && !Object.values(ren).includes(k) && !(p.typeOnly ?? []).includes(k));
  if (missInType.length || extraInType.length) {
    problems++;
    report.push(`✗ ${String(p.table)} ↔ ${p.iface}: ` +
      (missInType.length ? `в схеме, но НЕТ в типе: [${missInType}] ` : "") +
      (extraInType.length ? `в типе, но НЕТ в схеме: [${extraInType}]` : ""));
  } else {
    report.push(`✓ ${String(p.table)} ↔ ${p.iface}`);
  }
}

// Таблицы без shared-типа
const covered = new Set(PAIRS.map(p => p.table as string));
const allTables = Object.keys(schema).filter(k => {
  try { getTableColumns(schema[k as keyof typeof schema] as never); return true; }
  catch { return false; }
});
const uncovered = allTables.filter(t => !covered.has(t));
report.push(`\nТаблицы без shared-типа: [${uncovered.join(", ")}]`);

// ── Enum-аудит: enum-колонки схемы ↔ константы / union-типы ──
function enumOf(tableKey: keyof typeof schema, col: string): string[] {
  const c = (getTableColumns(schema[tableKey] as never) as Record<string, { enumValues?: string[] }>)[col];
  return c?.enumValues ?? [];
}
function parseUnion(file: string, typeName: string): string[] {
  const src = readFileSync(TYPES_DIR + file, "utf-8");
  const m = src.match(new RegExp(`export type ${typeName} =([\\s\\S]*?);`));
  if (!m) return [];
  return [...m[1]!.matchAll(/"([^"]+)"/g)].map(x => x[1]!);
}
const eq = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

const enumChecks: [string, string[], string, string[]][] = [
  ["elementEnrichments.elementType", enumOf("elementEnrichments", "elementType"), "type EnrichableElementType", parseUnion("elements.ts", "EnrichableElementType")],
  ["elementEnrichments.enrichmentType", enumOf("elementEnrichments", "enrichmentType"), "type EnrichmentType", parseUnion("elements.ts", "EnrichmentType")],
  ["representationTransforms.direction", enumOf("representationTransforms", "direction"), "type TransformDirection", parseUnion("elements.ts", "TransformDirection")],
  ["syntheses.method", enumOf("syntheses", "method"), "keys(ML)=keys(METHOD_CODE)", Object.keys(ML)],
  ["syntheses.method", enumOf("syntheses", "method"), "METHOD_CODE", Object.keys(METHOD_CODE)],
  ["syntheses.synthLevel", enumOf("syntheses", "synthLevel"), "SL", Object.keys(SL)],
  ["syntheses.synthLevel", enumOf("syntheses", "synthLevel"), "LEVEL_CODE", Object.keys(LEVEL_CODE)],
  ["syntheses.depth", enumOf("syntheses", "depth"), "DL", Object.keys(DL)],
  ["syntheses.depth", enumOf("syntheses", "depth"), "DEPTH_CODE", Object.keys(DEPTH_CODE)],
  ["syntheses.generationOrder", enumOf("syntheses", "generationOrder"), "ORDER_CODE", Object.keys(ORDER_CODE)],
  ["syntheses.status", enumOf("syntheses", "status"), "type SynthesisStatus", parseUnion("synthesis.ts", "SynthesisStatus")],
  ["editPlans.status", enumOf("editPlans", "status"), "type EditPlanStatus", parseUnion("edit-plan.ts", "EditPlanStatus")],
  ["generationLog.logType", enumOf("generationLog", "logType"), "type GenerationLogType", parseUnion("generation.ts", "GenerationLogType")],
  ["generationLog.source", enumOf("generationLog", "source"), "type GenerationSource", parseUnion("generation.ts", "GenerationSource")],
  ["contextLog.budgetMode", enumOf("contextLog", "budgetMode"), "type BudgetMode", parseUnion("generation.ts", "BudgetMode")],
  ["categoryEdges.direction", enumOf("categoryEdges", "direction"), "type EdgeDirection", parseUnion("graph.ts", "EdgeDirection")],
  ["theses.thesisType", enumOf("theses", "thesisType"), "type ThesisType", parseUnion("elements.ts", "ThesisType")],
  ["elementVersions.elementType", enumOf("elementVersions", "elementType"), "type VersionedElementType", parseUnion("elements.ts", "VersionedElementType")],
  ["elementVersions.changeSource", enumOf("elementVersions", "changeSource"), "type ChangeSource", parseUnion("elements.ts", "ChangeSource")],
  ["transactions.type", enumOf("transactions", "type"), "type TransactionType", parseUnion("billing.ts", "TransactionType")],
  ["apiUsage.billingMode", enumOf("apiUsage", "billingMode"), "type BillingMode", parseUnion("billing.ts", "BillingMode")],
  ["userSubscriptions.status", enumOf("userSubscriptions", "status"), "type SubscriptionStatus", parseUnion("billing.ts", "SubscriptionStatus")],
  ["subscriptionPlans.billingPeriod", enumOf("subscriptionPlans", "billingPeriod"), "type BillingPeriod", parseUnion("billing.ts", "BillingPeriod")],
];
report.push("\n── Enum-аудит ──");
for (const [name, schemaVals, refName, refVals] of enumChecks) {
  if (eq(schemaVals, refVals)) report.push(`✓ ${name} ↔ ${refName} (${schemaVals.length})`);
  else { problems++; report.push(`✗ ${name} [${schemaVals}] ↔ ${refName} [${refVals}]`); }
}

// Не-enum текстовые колонки с косвенными контрактами
report.push("\n── Косвенные контракты (текст в схеме, union/константы в коде) ──");
report.push(`• sections.key: text; SECTION_KEYS = ${SECTION_KEYS.length} ключей (пользовательские разделы допустимы — не enum намеренно)`);
report.push(`• modeResults.modeKey: text; тип ModeKey = ${parseUnion("modes.ts", "ModeKey").join("|")}`);
report.push(`• syntheses.parentContextSchema: text default 'selective-v1'; тип ParentContextSchema = ${parseUnion("synthesis.ts", "ParentContextSchema").join("|")}`);
report.push(`• context_log.entries[].key → CtxKey (${ALL_CTX_KEYS.length} ключей)`);

console.log(report.join("\n"));
console.log(problems ? `\nИТОГ: ${problems} РАСХОЖДЕНИЙ` : "\nИТОГ: расхождений не найдено");
process.exit(problems ? 1 : 0);
