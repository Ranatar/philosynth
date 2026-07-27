/**
 * scripts/seed-taxonomy.ts — начальное заполнение каталогов типов
 * (беседа 0.3b; 01-architecture §4.8, 02-data-model §2.24–2.25).
 *
 *  - category_type_catalog: 18 системных типов категорий;
 *  - relationship_type_catalog: 29 системных типов связей.
 *
 * Все записи is_system=true. Русские названия согласованы с фиксированными
 * списками промптов исходника [philosynth.html ~10898 (категории, 14 базовых),
 * ~10909 (связи, 12 базовых)] и расширенными типами _EXTRA_CATEGORY_TYPES /
 * _EXTRA_EDGE_TYPES [~8951] — чтобы normalizeType() (element-taxonomy.ts)
 * попадал в каталог точным совпадением, а не только fuzzy-мэтчем.
 *
 * Идемпотентность (у каталогов НЕТ версионирования, key UNIQUE — в отличие
 * от prompt_templates/synthesis_configs): created — ключа не было;
 * updated — системная запись расходится (name_ru/description/direction)
 * и обновляется на месте; skip — совпадает. Пользовательские записи
 * (is_system=false) скрипт НИКОГДА не трогает: коллизия ключа с
 * пользовательским типом — fail с предупреждением.
 *
 * Запуск: npm run seed:taxonomy   (или: npx tsx scripts/seed-taxonomy.ts)
 */
import { eq } from "drizzle-orm";

import { closeDb, db, schema } from "../server/db/index.js";

const { categoryTypeCatalog, relationshipTypeCatalog } = schema;

/* ─────────────────── 18 системных типов категорий ─────────────────── */

interface CategoryTypeSeed {
  key: string;
  nameRu: string;
  description: string;
}

export const CATEGORY_TYPES: CategoryTypeSeed[] = [
  { key: "ontological", nameRu: "Онтологическая", description: "Категории бытия, сущего и способов существования" },
  { key: "epistemological", nameRu: "Эпистемологическая", description: "Категории познания, знания и его обоснования" },
  { key: "axiological", nameRu: "Аксиологическая", description: "Категории ценностей и их иерархий" },
  { key: "ethical", nameRu: "Этическая", description: "Категории морали, должного, добра и зла" },
  { key: "aesthetic", nameRu: "Эстетическая", description: "Категории прекрасного, искусства и восприятия форм" },
  { key: "metaphysical", nameRu: "Метафизическая", description: "Категории первоначал и предельных оснований реальности" },
  { key: "logical", nameRu: "Логическая", description: "Категории форм мышления, вывода и следования" },
  { key: "practical", nameRu: "Практическая", description: "Категории действия, праксиса и применения" },
  { key: "political", nameRu: "Политическая", description: "Категории власти, государства и общественного устройства" },
  { key: "theological", nameRu: "Теологическая", description: "Категории божественного, священного и религиозного опыта" },
  { key: "anthropological", nameRu: "Антропологическая", description: "Категории человека, его природы и существования" },
  { key: "social", nameRu: "Социальная", description: "Категории общества, коллективности и социальных связей" },
  { key: "linguistic", nameRu: "Лингвистическая", description: "Категории языка, значения и знаковых систем" },
  { key: "phenomenological", nameRu: "Феноменологическая", description: "Категории опыта сознания, данности и интенциональности" },
  { key: "existential", nameRu: "Экзистенциальная", description: "Категории экзистенции, свободы и конечности" },
  { key: "analytical", nameRu: "Аналитическая", description: "Категории концептуального анализа, ясности и аргументации" },
  { key: "hermeneutical", nameRu: "Герменевтическая", description: "Категории понимания, истолкования и традиции" },
  { key: "cross_disciplinary", nameRu: "Междисциплинарная", description: "Категории на стыке философии и других дисциплин" },
];

/* ──────────────────── 29 системных типов связей ───────────────────── */

interface RelationshipTypeSeed {
  key: string;
  nameRu: string;
  description: string;
  /** 'unidirectional' | 'bidirectional' | 'reflexive' —
   *  соответствует category_edges.direction
   *  (однонаправленная/двунаправленная/рефлексивная, 02-data-model §2.7). */
  defaultDirection: "unidirectional" | "bidirectional" | "reflexive";
}

export const RELATIONSHIP_TYPES: RelationshipTypeSeed[] = [
  { key: "hierarchical", nameRu: "Иерархическая", description: "Отношение подчинения: более общая категория включает частную", defaultDirection: "unidirectional" },
  { key: "causal", nameRu: "Каузальная", description: "Причинно-следственная связь: одна категория порождает или обусловливает другую", defaultDirection: "unidirectional" },
  { key: "dialectical", nameRu: "Диалектическая", description: "Связь через противоречие и его снятие: тезис–антитезис–синтез", defaultDirection: "bidirectional" },
  { key: "correlational", nameRu: "Корреляционная", description: "Взаимная соотнесённость без причинной зависимости", defaultDirection: "bidirectional" },
  { key: "disjunctive", nameRu: "Дизъюнктивная", description: "Отношение исключающих или чередующихся альтернатив", defaultDirection: "bidirectional" },
  { key: "conjunctive", nameRu: "Конъюнктивная", description: "Совместное действие: категории работают только вместе", defaultDirection: "bidirectional" },
  { key: "contradiction", nameRu: "Противоречие", description: "Категории несовместимы или взаимно отрицают друг друга", defaultDirection: "bidirectional" },
  { key: "complementary", nameRu: "Дополнительность", description: "Категории восполняют друг друга до целостности", defaultDirection: "bidirectional" },
  { key: "emergence", nameRu: "Эмерджентность", description: "Новое качество возникает из взаимодействия исходных категорий", defaultDirection: "unidirectional" },
  { key: "necessary_condition", nameRu: "Необходимое условие", description: "Без первой категории вторая невозможна", defaultDirection: "unidirectional" },
  { key: "sufficient_condition", nameRu: "Достаточное условие", description: "Наличие первой категории гарантирует вторую", defaultDirection: "unidirectional" },
  { key: "identity", nameRu: "Тождество", description: "Категории совпадают по содержанию при различии выражения", defaultDirection: "bidirectional" },
  { key: "analogy", nameRu: "Аналогия", description: "Структурное или функциональное подобие категорий", defaultDirection: "bidirectional" },
  { key: "implementation", nameRu: "Реализация", description: "Одна категория воплощает или осуществляет другую", defaultDirection: "unidirectional" },
  { key: "instantiation", nameRu: "Конкретизация", description: "Частный случай или экземпляр общей категории", defaultDirection: "unidirectional" },
  { key: "generalization", nameRu: "Обобщение", description: "Переход от частной категории к более общей", defaultDirection: "unidirectional" },
  { key: "part_whole", nameRu: "Часть-целое", description: "Мереологическое отношение: категория входит в состав другой", defaultDirection: "unidirectional" },
  { key: "means_end", nameRu: "Средство-цель", description: "Одна категория служит средством достижения другой", defaultDirection: "unidirectional" },
  { key: "deductive", nameRu: "Дедуктивная", description: "Логическое выведение частного из общего", defaultDirection: "unidirectional" },
  { key: "inductive", nameRu: "Индуктивная", description: "Обобщающий вывод от частных случаев к общему", defaultDirection: "unidirectional" },
  { key: "abductive", nameRu: "Абдуктивная", description: "Вывод к наилучшему объяснению наблюдаемого", defaultDirection: "unidirectional" },
  { key: "temporal", nameRu: "Временная", description: "Отношение предшествования, следования или одновременности", defaultDirection: "unidirectional" },
  { key: "conceptual", nameRu: "Концептуальная", description: "Смысловая связь понятий внутри концептуальной сети", defaultDirection: "bidirectional" },
  { key: "definitional", nameRu: "Определяющая", description: "Одна категория входит в определение другой", defaultDirection: "unidirectional" },
  { key: "manifestation", nameRu: "Манифестация", description: "Одна категория есть проявление или выражение другой", defaultDirection: "unidirectional" },
  { key: "foundational", nameRu: "Основание", description: "Одна категория фундирует другую, служит её основанием", defaultDirection: "unidirectional" },
  { key: "recognition", nameRu: "Признание", description: "Категория конституируется через признание другой (Anerkennung)", defaultDirection: "bidirectional" },
  { key: "reflexion", nameRu: "Рефлексия", description: "Категория обращена на саму себя или своё основание", defaultDirection: "reflexive" },
  { key: "development", nameRu: "Развитие", description: "Одна категория есть развёрнутая ступень становления другой", defaultDirection: "unidirectional" },
];

/* ────────────────────────────── Сидинг ────────────────────────────── */

interface Report {
  created: string[];
  updated: string[];
  skipped: string[];
  failed: { key: string; error: string }[];
}

async function seedCategoryType(
  t: CategoryTypeSeed,
  report: Report,
): Promise<void> {
  const existing = await db.query.categoryTypeCatalog.findFirst({
    where: eq(categoryTypeCatalog.key, t.key),
  });

  if (!existing) {
    await db.insert(categoryTypeCatalog).values({
      key: t.key,
      nameRu: t.nameRu,
      description: t.description,
      isSystem: true,
    });
    report.created.push(t.key);
    return;
  }

  if (!existing.isSystem) {
    report.failed.push({
      key: t.key,
      error: "ключ занят пользовательским типом (is_system=false) — не перезаписываю",
    });
    return;
  }

  if (
    existing.nameRu === t.nameRu &&
    existing.description === t.description
  ) {
    report.skipped.push(t.key);
    return;
  }

  await db
    .update(categoryTypeCatalog)
    .set({ nameRu: t.nameRu, description: t.description })
    .where(eq(categoryTypeCatalog.id, existing.id));
  report.updated.push(t.key);
}

async function seedRelationshipType(
  t: RelationshipTypeSeed,
  report: Report,
): Promise<void> {
  const existing = await db.query.relationshipTypeCatalog.findFirst({
    where: eq(relationshipTypeCatalog.key, t.key),
  });

  if (!existing) {
    await db.insert(relationshipTypeCatalog).values({
      key: t.key,
      nameRu: t.nameRu,
      description: t.description,
      defaultDirection: t.defaultDirection,
      isSystem: true,
    });
    report.created.push(t.key);
    return;
  }

  if (!existing.isSystem) {
    report.failed.push({
      key: t.key,
      error: "ключ занят пользовательским типом (is_system=false) — не перезаписываю",
    });
    return;
  }

  if (
    existing.nameRu === t.nameRu &&
    existing.description === t.description &&
    existing.defaultDirection === t.defaultDirection
  ) {
    report.skipped.push(t.key);
    return;
  }

  await db
    .update(relationshipTypeCatalog)
    .set({
      nameRu: t.nameRu,
      description: t.description,
      defaultDirection: t.defaultDirection,
    })
    .where(eq(relationshipTypeCatalog.id, existing.id));
  report.updated.push(t.key);
}

function printReport(label: string, report: Report): void {
  console.log(
    `${label}: created=${report.created.length}, updated=${report.updated.length}, ` +
      `skip=${report.skipped.length}, fail=${report.failed.length}`,
  );
  if (report.created.length) console.log(`  created: ${report.created.join(", ")}`);
  if (report.updated.length) console.log(`  updated: ${report.updated.join(", ")}`);
  for (const f of report.failed) console.error(`  FAIL ${f.key}: ${f.error}`);
}

async function main(): Promise<void> {
  console.log(
    `Заполнение каталогов типов: ${CATEGORY_TYPES.length} категорий + ` +
      `${RELATIONSHIP_TYPES.length} связей…`,
  );

  const catReport: Report = { created: [], updated: [], skipped: [], failed: [] };
  for (const t of CATEGORY_TYPES) {
    try {
      await seedCategoryType(t, catReport);
    } catch (err) {
      catReport.failed.push({ key: t.key, error: (err as Error).message });
    }
  }
  printReport("category_type_catalog", catReport);

  const relReport: Report = { created: [], updated: [], skipped: [], failed: [] };
  for (const t of RELATIONSHIP_TYPES) {
    try {
      await seedRelationshipType(t, relReport);
    } catch (err) {
      relReport.failed.push({ key: t.key, error: (err as Error).message });
    }
  }
  printReport("relationship_type_catalog", relReport);

  const catTotal = await db.$count(categoryTypeCatalog);
  const relTotal = await db.$count(relationshipTypeCatalog);
  console.log(
    `\nВ БД: category_type_catalog=${catTotal} (ожидание системных: 18), ` +
      `relationship_type_catalog=${relTotal} (ожидание системных: 29)`,
  );

  if (catReport.failed.length > 0 || relReport.failed.length > 0)
    process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("seed-taxonomy: фатальная ошибка:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
