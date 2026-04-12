// Заполнение каталогов типов (18 категорий + 29 связей)
import "dotenv/config";
import { db } from "../server/db/index.js";
import {
  categoryTypeCatalog,
  relationshipTypeCatalog,
} from "../server/db/schema.js";

const CATEGORY_TYPES = [
  { key: "ontological", nameRu: "Онтологическая" },
  { key: "epistemological", nameRu: "Эпистемологическая" },
  { key: "axiological", nameRu: "Аксиологическая" },
  { key: "ethical", nameRu: "Этическая" },
  { key: "aesthetic", nameRu: "Эстетическая" },
  { key: "metaphysical", nameRu: "Метафизическая" },
  { key: "logical", nameRu: "Логическая" },
  { key: "practical", nameRu: "Практическая" },
  { key: "political", nameRu: "Политическая" },
  { key: "theological", nameRu: "Теологическая" },
  { key: "anthropological", nameRu: "Антропологическая" },
  { key: "social", nameRu: "Социальная" },
  { key: "linguistic", nameRu: "Лингвистическая" },
  { key: "phenomenological", nameRu: "Феноменологическая" },
  { key: "existential", nameRu: "Экзистенциальная" },
  { key: "analytical", nameRu: "Аналитическая" },
  { key: "hermeneutical", nameRu: "Герменевтическая" },
  { key: "cross_disciplinary", nameRu: "Междисциплинарная" },
] as const;

const RELATIONSHIP_TYPES = [
  { key: "hierarchical", nameRu: "Иерархическая", dir: "unidirectional" },
  { key: "causal", nameRu: "Каузальная", dir: "unidirectional" },
  { key: "dialectical", nameRu: "Диалектическая", dir: "bidirectional" },
  { key: "correlational", nameRu: "Корреляционная", dir: "bidirectional" },
  { key: "disjunctive", nameRu: "Дизъюнктивная", dir: "bidirectional" },
  { key: "conjunctive", nameRu: "Конъюнктивная", dir: "bidirectional" },
  { key: "contradiction", nameRu: "Противоречие", dir: "bidirectional" },
  { key: "complementary", nameRu: "Комплементарная", dir: "bidirectional" },
  { key: "emergence", nameRu: "Эмерджентная", dir: "unidirectional" },
  {
    key: "necessary_condition",
    nameRu: "Необходимое условие",
    dir: "unidirectional",
  },
  {
    key: "sufficient_condition",
    nameRu: "Достаточное условие",
    dir: "unidirectional",
  },
  { key: "identity", nameRu: "Тождество", dir: "bidirectional" },
  { key: "analogy", nameRu: "Аналогия", dir: "bidirectional" },
  { key: "implementation", nameRu: "Реализация", dir: "unidirectional" },
  { key: "instantiation", nameRu: "Инстанциация", dir: "unidirectional" },
  { key: "generalization", nameRu: "Обобщение", dir: "unidirectional" },
  { key: "part_whole", nameRu: "Часть-целое", dir: "unidirectional" },
  { key: "means_end", nameRu: "Средство-цель", dir: "unidirectional" },
  { key: "deductive", nameRu: "Дедуктивная", dir: "unidirectional" },
  { key: "inductive", nameRu: "Индуктивная", dir: "unidirectional" },
  { key: "abductive", nameRu: "Абдуктивная", dir: "unidirectional" },
  { key: "temporal", nameRu: "Темпоральная", dir: "unidirectional" },
  { key: "conceptual", nameRu: "Концептуальная", dir: "bidirectional" },
  { key: "definitional", nameRu: "Дефиниционная", dir: "unidirectional" },
  { key: "manifestation", nameRu: "Манифестация", dir: "unidirectional" },
  { key: "foundational", nameRu: "Фундаментальная", dir: "unidirectional" },
  { key: "recognition", nameRu: "Признание", dir: "unidirectional" },
  { key: "reflexion", nameRu: "Рефлексия", dir: "reflexive" },
  { key: "development", nameRu: "Развитие", dir: "unidirectional" },
] as const;

async function main() {
  console.log("Seeding category type catalog (18 types)...");
  for (const ct of CATEGORY_TYPES) {
    await db
      .insert(categoryTypeCatalog)
      .values({ key: ct.key, nameRu: ct.nameRu, isSystem: true })
      .onConflictDoNothing();
  }

  console.log("Seeding relationship type catalog (29 types)...");
  for (const rt of RELATIONSHIP_TYPES) {
    await db
      .insert(relationshipTypeCatalog)
      .values({
        key: rt.key,
        nameRu: rt.nameRu,
        defaultDirection: rt.dir,
        isSystem: true,
      })
      .onConflictDoNothing();
  }

  console.log("Done!");
  process.exit(0);
}

main().catch(console.error);
