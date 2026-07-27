/**
 * Element Taxonomy (01-architecture §4.8; беседа 0.3b).
 *
 * Каталоги типов категорий (18 системных) и типов связей (29 системных) —
 * слой нормализации поверх свободного текста Claude. Сидинг —
 * scripts/seed-taxonomy.ts; пользовательские типы добавляются через
 * createCustomType (is_system=false).
 *
 * Кэширование: Redis, ключи taxonomy_cache:category_types /
 * taxonomy_cache:relationship_types (расширение схемы DATA LAYER,
 * 01-architecture §3). TTL бесконечный; инвалидация — при createCustomType
 * (и будущих админ-правках каталога, Фаза 2). Политика отказа Redis —
 * fail-open, как у prompt-registry (беседа 0.3): читаем из БД, не кэшируем.
 *
 * Нормализация (normalizeType): точное совпадение key / name_ru / алиаса →
 * подстрочное включение (аналог `part.includes(key)` исходника, 01-arch §4.8)
 * → Levenshtein-близость для suggestions. Неизвестные типы НЕ являются
 * ошибкой: вызывающий (graph-parser, беседа 1.4) сохраняет их свободным
 * текстом с fallback-стилизацией.
 */
import { eq } from "drizzle-orm";
import type {
  CategoryType,
  RelationshipType,
  TypeMatch,
} from "@philosynth/shared/types/elements";

import { db, schema } from "../db/index.js";
import { redis } from "../redis.js";

const { categoryTypeCatalog, relationshipTypeCatalog } = schema;

export type TaxonomyKind = "category" | "relationship";

/** Результат нормализации (03-spec §2.13, POST /taxonomy/normalize). */
export interface NormalizeResult {
  match: TypeMatch | null;
  suggestions: TypeMatch[];
}

const CACHE_KEYS: Record<TaxonomyKind, string> = {
  category: "taxonomy_cache:category_types",
  relationship: "taxonomy_cache:relationship_types",
};

/** Порог принятия fuzzy-совпадения как match (иначе — только suggestions). */
const MATCH_THRESHOLD = 0.75;
/** Сколько ближайших кандидатов возвращать в suggestions. */
const SUGGESTIONS_LIMIT = 3;
/** Минимальная длина варианта для подстрочного включения (защита от «и» ⊂ всё). */
const MIN_INCLUDES_LEN = 4;

/** Ошибка валидации createCustomType — маппится на 400 VALIDATION_ERROR. */
export class TaxonomyValidationError extends Error {
  readonly code = "VALIDATION_ERROR";
  constructor(
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = "TaxonomyValidationError";
  }
}

/* ─────────────────────────── Redis (fail-open) ─────────────────────── */

async function cacheGet(cacheKey: string): Promise<string | null> {
  try {
    return await redis.get(cacheKey);
  } catch {
    return null; // Redis недоступен — идём в БД
  }
}

async function cacheSet(cacheKey: string, value: string): Promise<void> {
  try {
    await redis.set(cacheKey, value); // без TTL — инвалидация явная
  } catch {
    /* fail-open: некэшированное чтение не ошибка */
  }
}

async function cacheDel(...cacheKeys: string[]): Promise<void> {
  try {
    await redis.del(...cacheKeys);
  } catch {
    /* fail-open */
  }
}

/** Сброс кэша каталогов (после createCustomType / админ-правок). */
export async function invalidateTaxonomyCache(
  kind?: TaxonomyKind,
): Promise<void> {
  if (kind) await cacheDel(CACHE_KEYS[kind]);
  else await cacheDel(CACHE_KEYS.category, CACHE_KEYS.relationship);
}

/* ─────────────────────────── Чтение каталогов ──────────────────────── */

interface CategoryTypeRow {
  id: string;
  key: string;
  nameRu: string;
  description: string;
  isSystem: boolean;
  createdBy: string | null;
  createdAt: Date;
}

interface RelationshipTypeRow extends CategoryTypeRow {
  defaultDirection: string;
}

const mapCategoryType = (r: CategoryTypeRow): CategoryType => ({
  id: r.id,
  key: r.key,
  nameRu: r.nameRu,
  description: r.description,
  isSystem: r.isSystem,
  createdBy: r.createdBy,
  createdAt: r.createdAt.toISOString(),
});

const mapRelationshipType = (r: RelationshipTypeRow): RelationshipType => ({
  ...mapCategoryType(r),
  defaultDirection: r.defaultDirection,
});

/**
 * Список типов категорий: Redis-кэш → fallback на БД (+ прогрев кэша).
 * Системные первыми, внутри групп — по key.
 */
export async function getCategoryTypes(): Promise<CategoryType[]> {
  const cached = await cacheGet(CACHE_KEYS.category);
  if (cached !== null) {
    try {
      return JSON.parse(cached) as CategoryType[];
    } catch {
      await cacheDel(CACHE_KEYS.category); // повреждённый кэш — перечитываем
    }
  }

  const rows = await db.query.categoryTypeCatalog.findMany({
    orderBy: (t, { asc, desc }) => [desc(t.isSystem), asc(t.key)],
  });
  const types = rows.map(mapCategoryType);
  await cacheSet(CACHE_KEYS.category, JSON.stringify(types));
  return types;
}

/** Список типов связей: аналогично getCategoryTypes. */
export async function getRelationshipTypes(): Promise<RelationshipType[]> {
  const cached = await cacheGet(CACHE_KEYS.relationship);
  if (cached !== null) {
    try {
      return JSON.parse(cached) as RelationshipType[];
    } catch {
      await cacheDel(CACHE_KEYS.relationship);
    }
  }

  const rows = await db.query.relationshipTypeCatalog.findMany({
    orderBy: (t, { asc, desc }) => [desc(t.isSystem), asc(t.key)],
  });
  const types = rows.map(mapRelationshipType);
  await cacheSet(CACHE_KEYS.relationship, JSON.stringify(types));
  return types;
}

/* ───────────────────────────── Нормализация ────────────────────────── */

/**
 * Русские алиасы системных ключей — варианты написания из фиксированных
 * списков промптов исходника [~10898, ~10909], _EXTRA_EDGE_TYPES [~8959]
 * и естественные синонимы. Дополняют key/name_ru при точном и подстрочном
 * сопоставлении. Пользовательские типы алиасов не имеют — только key/name_ru.
 */
const RU_ALIASES: Record<TaxonomyKind, Record<string, string[]>> = {
  category: {
    cross_disciplinary: ["междисциплинарная", "кросс-дисциплинарная"],
    axiological: ["ценностная"],
    metaphysical: ["метафизика"],
  },
  relationship: {
    causal: ["причинно-следственная", "причинная", "каузальность"],
    complementary: ["дополнительность", "комплементарная", "взаимодополняющая"],
    emergence: ["эмерджентная", "эмергентность"],
    foundational: ["основание", "фундирующая", "основополагающая", "фундаментальная"],
    definitional: ["определяющая", "дефиниционная", "определительная"],
    instantiation: ["конкретизация", "инстанциация", "экземплификация"],
    implementation: ["реализация", "воплощение"],
    generalization: ["обобщение", "генерализация"],
    part_whole: ["часть-целое", "часть целое", "мереологическая"],
    means_end: ["средство-цель", "средство цель", "инструментальная"],
    temporal: ["временная", "темпоральная"],
    identity: ["тождество", "тождественная", "идентичность"],
    contradiction: ["противоречие", "контрадикторная"],
    reflexion: ["рефлексия", "рефлексивная"],
    development: ["развитие", "становление"],
    recognition: ["признание"],
    analogy: ["аналогия", "аналогическая"],
    necessary_condition: ["необходимое условие"],
    sufficient_condition: ["достаточное условие"],
    hierarchical: ["иерархия", "субординация"],
    dialectical: ["диалектика"],
    correlational: ["корреляция", "соотнесённость"],
    manifestation: ["манифестация", "проявление"],
  },
};

/** Нормализация строки для сопоставления: регистр, ё→е, кавычки, пробелы. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/["'«»„“”]/g, "")
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Классический Левенштейн (две строки уже нормализованы). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1, // удаление
        cur[j - 1]! + 1, // вставка
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1), // замена
      );
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** Близость 0–1 по Левенштейну. */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

interface Candidate {
  key: string;
  nameRu: string;
  /** Нормализованные варианты написания: key, name_ru, алиасы. */
  variants: string[];
}

function buildCandidates(
  types: { key: string; nameRu: string }[],
  kind: TaxonomyKind,
): Candidate[] {
  const aliases = RU_ALIASES[kind];
  return types.map((t) => {
    const variants = new Set<string>([norm(t.key), norm(t.nameRu)]);
    for (const a of aliases[t.key] ?? []) variants.add(norm(a));
    return { key: t.key, nameRu: t.nameRu, variants: [...variants] };
  });
}

/** Лучший score кандидата против нормализованного текста запроса. */
function scoreCandidate(text: string, c: Candidate): number {
  let best = 0;
  for (const v of c.variants) {
    if (v === text) return 1;
    // Аналог part.includes(key) исходника: подстрочное включение в обе
    // стороны — «связь диалектическая (снятие)» ⊇ «диалектическая».
    if (
      (v.length >= MIN_INCLUDES_LEN && text.includes(v)) ||
      (text.length >= MIN_INCLUDES_LEN && v.includes(text))
    ) {
      const ratio = Math.min(v.length, text.length) / Math.max(v.length, text.length);
      best = Math.max(best, 0.8 + 0.2 * ratio);
      continue;
    }
    best = Math.max(best, similarity(text, v));
  }
  return best;
}

/**
 * Нормализация свободного текста → ближайший тип каталога.
 * match — при точном/подстрочном совпадении или Левенштейн-близости
 * ≥ MATCH_THRESHOLD; иначе match=null, suggestions — до 3 ближайших
 * кандидатов по убыванию score (в match-случае suggestions — альтернативы
 * без самого match).
 */
export async function normalizeType(
  text: string,
  kind: TaxonomyKind,
): Promise<NormalizeResult> {
  const q = norm(text);
  if (!q) return { match: null, suggestions: [] };

  const types =
    kind === "category" ? await getCategoryTypes() : await getRelationshipTypes();
  const candidates = buildCandidates(types, kind);

  const scored: TypeMatch[] = candidates
    .map((c) => ({
      key: c.key,
      nameRu: c.nameRu,
      score: Number(scoreCandidate(q, c).toFixed(4)),
    }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (top && top.score >= MATCH_THRESHOLD) {
    return {
      match: top,
      suggestions: scored.slice(1, 1 + SUGGESTIONS_LIMIT).filter((s) => s.score > 0.3),
    };
  }
  return {
    match: null,
    suggestions: scored.slice(0, SUGGESTIONS_LIMIT),
  };
}

/* ──────────────────────── Пользовательские типы ────────────────────── */

const KEY_RE = /^[a-z][a-z0-9_]{1,63}$/;

/**
 * Создание пользовательского типа (is_system=false, created_by=userId).
 * Каталоги расширяемы пользователем и админом (01-arch §4.8).
 * @throws TaxonomyValidationError — невалидный key/nameRu или занятый key.
 */
export async function createCustomType(
  key: string,
  nameRu: string,
  description: string,
  kind: TaxonomyKind,
  userId: string,
): Promise<CategoryType | RelationshipType> {
  if (!KEY_RE.test(key))
    throw new TaxonomyValidationError(
      "Невалидный ключ типа: латиница в нижнем регистре, цифры и _, начинается с буквы, 2–64 символа",
      { key },
    );
  const trimmedName = nameRu.trim();
  if (!trimmedName)
    throw new TaxonomyValidationError("Русское название типа обязательно", {
      nameRu,
    });

  if (kind === "category") {
    const dup = await db.query.categoryTypeCatalog.findFirst({
      where: eq(categoryTypeCatalog.key, key),
      columns: { id: true },
    });
    if (dup)
      throw new TaxonomyValidationError(`Тип категории «${key}» уже существует`, {
        key,
      });
    const [row] = await db
      .insert(categoryTypeCatalog)
      .values({
        key,
        nameRu: trimmedName,
        description: description.trim(),
        isSystem: false,
        createdBy: userId,
      })
      .returning();
    await invalidateTaxonomyCache("category");
    return mapCategoryType(row!);
  }

  const dup = await db.query.relationshipTypeCatalog.findFirst({
    where: eq(relationshipTypeCatalog.key, key),
    columns: { id: true },
  });
  if (dup)
    throw new TaxonomyValidationError(`Тип связи «${key}» уже существует`, {
      key,
    });
  const [row] = await db
    .insert(relationshipTypeCatalog)
    .values({
      key,
      nameRu: trimmedName,
      description: description.trim(),
      isSystem: false,
      createdBy: userId,
    })
    .returning();
  await invalidateTaxonomyCache("relationship");
  return mapRelationshipType(row!);
}
