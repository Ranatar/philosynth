/**
 * scripts/seed-configs.ts — начальное заполнение synthesis_configs
 * (беседа 0.3, задача 2; 01-architecture §4.1, ключи — 02-data-model §2.18).
 *
 * Данные: server/config/*.ts — конфиг-объекты, извлечённые ДОСЛОВНО из
 * philosynth.html генератором scripts/extract-seed-data.mjs (комплект
 * вложений docs/fragments-for-conversations/0.3-seed-prompts-configs.js).
 *
 * Идемпотентность — как у seed-prompts.ts: created / updated (новая версия
 * при изменении значения, история сохраняется) / skip; отчёт по каждому ключу.
 *
 * Запуск: npm run seed:configs   (или: npx tsx scripts/seed-configs.ts)
 */
import { and, eq, max } from "drizzle-orm";
import type { SynthesisConfigKey } from "@philosynth/shared/types/prompts";

import { closeDb, db, schema } from "../server/db/index.js";
import {
  CONTEXT_DEPS_BASE,
  CONTEXT_DEPS_GENETIC,
  CONTEXT_DEPS_LEVEL,
  CONTEXT_DEPS_LEVEL_GENETIC,
  CONTEXT_DEPS_METHOD,
} from "../server/config/context-deps.js";
import {
  SUBSTITUTION_MAP,
  SUBSTITUTION_MAP_GENETIC,
} from "../server/config/substitution-map.js";
import {
  COMPAT_MATRIX_COMPACT,
  COMPAT_SEC_LABELS,
} from "../server/config/compat-matrix.js";
import { INTRA_DEPS } from "../server/config/intra-deps.js";
import { SUBSECTION_TO_CTX_KEYS } from "../server/config/subsection-ctx-keys.js";
import { TOPOLOGY_ROLES_PROCEDURAL } from "../server/config/topology-roles.js";
import {
  CONTEXT_BUDGET,
  FRAGMENT_SHARE,
} from "../server/config/fragment-share.js";
import {
  EXTRA_CATEGORY_TYPES,
  EXTRA_EDGE_TYPES,
  SYNTH_LEVEL_TYPE_PHRASING,
} from "../server/config/extra-types.js";
import {
  PARENT_DEPS_BASE,
  PARENT_DEPS_GENETIC,
  PARENT_DEPS_LEVEL,
  PARENT_DEPS_LEVEL_GENETIC,
  PARENT_DEPS_METHOD,
  PARENT_FIELD_LABELS,
  PARENT_FIELD_ORDER,
  PARENT_INTRA_DEPS,
} from "../server/config/parent-deps.js";
import {
  MD_BY_CARD,
  SD_BY_CARD,
} from "../server/config/cardinality-prompts.js";
import { MODE_DEPS } from "../server/config/mode-deps.js";
import {
  SUBSECTION_CRITIQUE_CHECK,
  SUBSECTION_CRITIQUE_NOVELTY,
  SUBSECTION_MAP_BASE,
  SUBSECTION_MAP_GLOSSARY,
  SUM_PORTRAIT_VARIANTS,
} from "../server/config/subsection-map.js";

const { synthesisConfigs } = schema;

interface SeedConfig {
  key: SynthesisConfigKey;
  value: unknown;
  description: string;
}

const A = "philosynth.html"; // якорь для описаний

const SEED_CONFIGS: SeedConfig[] = [
  // ── Межсекционные зависимости ──
  { key: "context_deps.base", value: CONTEXT_DEPS_BASE, description: `CONTEXT_DEPS_BASE [${A} ~5998]: {required, optional} ctx-ключи каждого раздела (архитектурный порядок)` },
  { key: "context_deps.genetic", value: CONTEXT_DEPS_GENETIC, description: `CONTEXT_DEPS_GENETIC [${A} ~6067]: оверлей генетического порядка (dialogue→theses→glossary→graph)` },
  { key: "context_deps.level", value: CONTEXT_DEPS_LEVEL, description: `CONTEXT_DEPS_LEVEL [${A} ~6156]: уровне-патчи (бывш. LEVEL_DEPS_PATCH), архитектурный порядок` },
  { key: "context_deps.level_genetic", value: CONTEXT_DEPS_LEVEL_GENETIC, description: `CONTEXT_DEPS_LEVEL_GENETIC [${A} ~6203]: уровне-патчи для генетического порядка` },
  { key: "context_deps.method", value: CONTEXT_DEPS_METHOD, description: `CONTEXT_DEPS_METHOD [${A} ~6247]: метод-патчи (бывш. METHOD_DEPS_PATCH; применяется к обоим порядкам)` },
  // ── Подстановки ──
  { key: "substitution_map", value: SUBSTITUTION_MAP, description: `SUBSTITUTION_MAP [${A} ~6287]: заменители недостающих ctx-фрагментов с качеством q (архитектурный порядок)` },
  { key: "substitution_map_genetic", value: SUBSTITUTION_MAP_GENETIC, description: `SUBSTITUTION_MAP_GENETIC [${A} ~6339]: заменители для генетического порядка` },
  // ── Совместимость ──
  { key: "compat_matrix", value: COMPAT_MATRIX_COMPACT, description: `COMPAT_MATRIX_COMPACT [${A} ~7012]: Advisor v2 — entry-модель level:method (rating/severity/desc/advice/replacements/sections_override)` },
  { key: "compat_sec_labels", value: COMPAT_SEC_LABELS, description: `COMPAT_SEC_LABELS [${A} ~7318]: короткие метки разделов для чипов Advisor v2 (COMPAT_KEYS удалён в v11)` },
  // ── Внутрисекционные зависимости и потребители контекста ──
  { key: "intra_deps", value: INTRA_DEPS, description: `INTRA_DEPS [${A} ~9493]: зависимости подразделов внутри раздела (канонические ключи заголовков)` },
  { key: "subsection_ctx_keys", value: SUBSECTION_TO_CTX_KEYS, description: `SUBSECTION_TO_CTX_KEYS [${A} ~9606]: подраздел → потребляемые ctx-ключи (гранулярный каскад)` },
  { key: "topology_roles", value: TOPOLOGY_ROLES_PROCEDURAL, description: `TOPOLOGY_ROLES_PROCEDURAL [${A} ~8778]: допустимые процессуальные роли топологии по методам` },
  // ── Бюджетирование контекста ──
  { key: "fragment_share", value: FRAGMENT_SHARE, description: `FRAGMENT_SHARE [${A} ~7566]: доля бюджета на фрагмент (в исходнике дубликат ключа dialogue:synthesis — действует last-win 0.3)` },
  { key: "context_budget", value: CONTEXT_BUDGET, description: `CONTEXT_BUDGET [${A} ~7529]: базовый бюджет межсекционного контекста по depth` },
  // ── Расширенные типы (v10) ──
  { key: "extra_types", value: { categoryTypes: EXTRA_CATEGORY_TYPES, edgeTypes: EXTRA_EDGE_TYPES, levelPhrasing: SYNTH_LEVEL_TYPE_PHRASING }, description: `_EXTRA_CATEGORY_TYPES/_EXTRA_EDGE_TYPES/_SYNTH_LEVEL_TYPE_PHRASING [${A} ~8951]: доп. типы по методу × уровню для _buildExtraTypesBlock` },
  // ── Селективный родительский контекст (v11, 01-arch §4.13) ──
  { key: "parent_field_order", value: PARENT_FIELD_ORDER, description: `PARENT_FIELD_ORDER [${A} ~9873]: канонический порядок 10 полей родителя` },
  { key: "parent_field_labels", value: PARENT_FIELD_LABELS, description: `PARENT_FIELD_LABELS [${A} ~9880]: русские заголовки блоков полей в промпте` },
  { key: "parent_deps.base", value: PARENT_DEPS_BASE, description: `PARENT_DEPS_BASE [${A} ~9896]: {required, optional} поля родителей на раздел` },
  { key: "parent_deps.genetic", value: PARENT_DEPS_GENETIC, description: `PARENT_DEPS_GENETIC [${A} ~9927]: оверлей генетического порядка` },
  { key: "parent_deps.level", value: PARENT_DEPS_LEVEL, description: `PARENT_DEPS_LEVEL [${A} ~9947]: уровне-патчи (архитектурный порядок; comparative без патчей — ключа нет, как в исходнике)` },
  { key: "parent_deps.level_genetic", value: PARENT_DEPS_LEVEL_GENETIC, description: `PARENT_DEPS_LEVEL_GENETIC [${A} ~9972]: уровне-патчи генетического порядка` },
  { key: "parent_deps.method", value: PARENT_DEPS_METHOD, description: `PARENT_DEPS_METHOD [${A} ~9995]: метод-патчи` },
  { key: "parent_intra_deps", value: PARENT_INTRA_DEPS, description: `PARENT_INTRA_DEPS [${A} ~10023]: поля родителей для подраздельной перегенерации (пустой {} = полный section-spec)` },
  // ── Кардинальность (v11, 01-arch §4.14) ──
  { key: "md_by_card", value: MD_BY_CARD, description: `MD_BY_CARD [${A} ~4428]: формулировка 6 методов × {multi|single|none}` },
  { key: "sd_by_card", value: SD_BY_CARD, description: `SD_BY_CARD [${A} ~4496]: порождение категорий, 3 уровня × {multi|single|none}` },
  // ── Режимы (v11) ──
  { key: "mode_deps", value: MODE_DEPS, description: `MODE_DEPS [${A} ~22543]: декларативные ctx-зависимости режимов (adversarial/translator/timeslice)` },
  // ── Карта подразделов (беседа 1.2; отложено из 0.3 намеренно) ──
  { key: "subsection_map", value: { base: SUBSECTION_MAP_BASE, glossary: SUBSECTION_MAP_GLOSSARY, critiqueNovelty: SUBSECTION_CRITIQUE_NOVELTY, critiqueCheck: SUBSECTION_CRITIQUE_CHECK, sumPortraitVariants: SUM_PORTRAIT_VARIANTS }, description: `SUBSECTION_MAP_BASE/GLOSSARY + SUBSECTION_CRITIQUE_NOVELTY/CHECK + _SUM_PORTRAIT_VARIANTS [${A} ~9314–9434, ~9746]: канонические ключи («Портрет каждого философа»); заголовок портрета по кардинальности резолвит SUBSECTION_SUM_PORTRAIT (section-defs-builder, 01-arch §4.14)` },
];

interface Report {
  created: string[];
  updated: string[];
  skipped: string[];
  failed: { key: string; error: string }[];
}

/**
 * Каноническая сериализация для сравнения с уже сохранённым значением.
 * ВАЖНО: jsonb в PostgreSQL НЕ сохраняет порядок ключей объекта (сортирует
 * по длине, затем побайтово), поэтому наивный JSON.stringify давал ложные
 * «updated» на каждом повторном запуске. Ключи объектов сортируются
 * рекурсивно; порядок элементов массивов значим и сохраняется.
 */
const canonical = (v: unknown): string =>
  JSON.stringify(v, function replacer(_k, value: unknown) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const rec = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(rec)
          .sort()
          .map((k) => [k, rec[k]]),
      );
    }
    return value;
  });

async function seedOne(c: SeedConfig, report: Report): Promise<void> {
  const active = await db.query.synthesisConfigs.findFirst({
    where: and(
      eq(synthesisConfigs.key, c.key),
      eq(synthesisConfigs.isActive, true),
    ),
    columns: { value: true },
  });

  if (active && canonical(active.value) === canonical(c.value)) {
    report.skipped.push(c.key);
    return;
  }

  await db.transaction(async (tx) => {
    const agg = await tx
      .select({ maxVersion: max(synthesisConfigs.version) })
      .from(synthesisConfigs)
      .where(eq(synthesisConfigs.key, c.key));
    const maxVersion = agg[0]?.maxVersion ?? null;
    const nextVersion = (maxVersion ?? 0) + 1;

    if (maxVersion !== null) {
      await tx
        .update(synthesisConfigs)
        .set({ isActive: false })
        .where(
          and(
            eq(synthesisConfigs.key, c.key),
            eq(synthesisConfigs.isActive, true),
          ),
        );
    }
    await tx.insert(synthesisConfigs).values({
      key: c.key,
      version: nextVersion,
      value: c.value,
      isActive: true,
      description: c.description,
    });

    (nextVersion === 1 ? report.created : report.updated).push(c.key);
  });
}

async function main(): Promise<void> {
  console.log(`Заполнение synthesis_configs: ${SEED_CONFIGS.length} конфигов…`);
  const report: Report = { created: [], updated: [], skipped: [], failed: [] };

  for (const c of SEED_CONFIGS) {
    try {
      await seedOne(c, report);
    } catch (err) {
      report.failed.push({ key: c.key, error: (err as Error).message });
    }
  }

  console.log(
    `\nИтог: created=${report.created.length}, updated=${report.updated.length}, ` +
      `skip=${report.skipped.length}, fail=${report.failed.length}`,
  );
  if (report.created.length) console.log(`  created: ${report.created.join(", ")}`);
  if (report.updated.length) console.log(`  updated: ${report.updated.join(", ")}`);
  for (const f of report.failed) console.error(`  FAIL ${f.key}: ${f.error}`);

  const total = await db.$count(synthesisConfigs);
  const active = await db.$count(
    synthesisConfigs,
    eq(synthesisConfigs.isActive, true),
  );
  console.log(`В БД: ${total} строк synthesis_configs, из них активных: ${active}`);

  if (report.failed.length > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("seed-configs: фатальная ошибка:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
