/**
 * scripts/test-custom-type-0.3b.ts — тест createCustomType по протоколу
 * беседы 0.3b (запрос «createCustomType → новая запись с is_system=false,
 * created_by заполнен») + краевые случаи: занятый ключ, невалидный ключ,
 * инвалидация кэша каталога.
 *
 * Тест самоочищающийся: тестовый тип и тестовый пользователь удаляются
 * в конце (повторный запуск — с чистого листа).
 */
import { eq } from "drizzle-orm";

import { closeDb, db, schema } from "../server/db/index.js";
import { closeRedis, connectRedis, redis } from "../server/redis.js";
import {
  createCustomType,
  getCategoryTypes,
  normalizeType,
  TaxonomyValidationError,
} from "../server/services/element-taxonomy.js";

const { users, categoryTypeCatalog } = schema;

const TEST_EMAIL = "taxonomy-test@example.com";
const TEST_KEY = "dialogical";
const CACHE_KEY = "taxonomy_cache:category_types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  // Явное подключение (lazyConnect + enableOfflineQueue=false): сервисные
  // функции fail-open и работают без него, но тест проверяет сам кэш —
  // прямые redis.exists/del требуют установленного соединения.
  const redisUp = await connectRedis();
  if (!redisUp) throw new Error("тесту кэша нужен работающий Redis");

  /* ── Подготовка: тестовый пользователь (created_by — FK на users) ── */
  await db.delete(categoryTypeCatalog).where(eq(categoryTypeCatalog.key, TEST_KEY));
  await db.delete(users).where(eq(users.email, TEST_EMAIL));
  const [user] = await db
    .insert(users)
    .values({ email: TEST_EMAIL, passwordHash: "x", displayName: "taxonomy-test" })
    .returning({ id: users.id });
  const userId = user!.id;

  // Прогреваем кэш каталога, чтобы проверить его инвалидацию после create
  await getCategoryTypes();
  const cachedBefore = await redis.exists(CACHE_KEY);
  check("кэш категорий прогрет перед тестом", cachedBefore === 1);

  /* ── 1. Успешное создание пользовательского типа ── */
  const created = await createCustomType(
    TEST_KEY,
    "Диалогическая",
    "Категории диалогического отношения Я–Ты (Бубер, Бахтин)",
    "category",
    userId,
  );
  check("createCustomType возвращает запись", created.key === TEST_KEY);
  check("is_system=false в возвращённой записи", created.isSystem === false);
  check("created_by заполнен и равен userId", created.createdBy === userId);

  const row = await db.query.categoryTypeCatalog.findFirst({
    where: eq(categoryTypeCatalog.key, TEST_KEY),
  });
  check("запись существует в БД", !!row);
  check("в БД is_system=false", row?.isSystem === false);
  check("в БД created_by = userId", row?.createdBy === userId);

  /* ── 2. Кэш инвалидирован, каталог отдаёт новый тип ── */
  const cachedAfter = await redis.exists(CACHE_KEY);
  check("кэш категорий сброшен после createCustomType", cachedAfter === 0);
  const types = await getCategoryTypes();
  check(
    "getCategoryTypes включает новый тип (19-й)",
    types.some((t) => t.key === TEST_KEY) && types.length === 19,
    `length=${types.length}`,
  );
  check(
    "системные первыми: новый тип в хвосте списка",
    types[types.length - 1]?.key === TEST_KEY,
  );

  /* ── 3. Новый тип участвует в нормализации ── */
  const norm = await normalizeType("диалогическая", "category");
  check(
    "normalizeType находит пользовательский тип",
    norm.match?.key === TEST_KEY && norm.match.score === 1,
  );

  /* ── 4. Краевые случаи: занятый и невалидный ключ ── */
  let dupErr: unknown = null;
  try {
    await createCustomType("ontological", "Дубль", "", "category", userId);
  } catch (e) {
    dupErr = e;
  }
  check(
    "занятый ключ → TaxonomyValidationError (code=VALIDATION_ERROR)",
    dupErr instanceof TaxonomyValidationError && dupErr.code === "VALIDATION_ERROR",
  );

  let badErr: unknown = null;
  try {
    await createCustomType("Bad-Key!", "Плохой", "", "relationship", userId);
  } catch (e) {
    badErr = e;
  }
  check(
    "невалидный формат ключа → TaxonomyValidationError",
    badErr instanceof TaxonomyValidationError,
  );

  /* ── Очистка ── */
  await db.delete(categoryTypeCatalog).where(eq(categoryTypeCatalog.key, TEST_KEY));
  await db.delete(users).where(eq(users.id, userId));
  try {
    await redis.del(CACHE_KEY); // в кэше остался каталог с тестовым типом
  } catch {
    /* fail-open */
  }

  console.log(`\nИтог: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("test-custom-type: фатальная ошибка:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeRedis();
    await closeDb();
  });
