/**
 * Метки методов синтеза (ML — Method Labels, строки 3955–4000).
 * Ключ: код метода. Значение: русское название.
 */
export const ML: Record<string, string> = {
  dialectical: "Диалектический",
  integrative: "Интегративный",
  deconstructive: "Деконструктивный",
  hermeneutical: "Герменевтический",
  analytical: "Аналитический",
  creative: "Творческий",
};

/**
 * Описания методов синтеза (развёрнутые — для формы и подсказок).
 */
export const ML_DESC: Record<string, string> = {
  dialectical:
    "Тезис → Антитезис → Синтез. Противопоставление идей философов " +
    "для порождения новой концепции через разрешение противоречий.",
  integrative:
    "Поиск общего основания. Выявление пересечений и " +
    "комплементарных элементов для построения целостной системы.",
  deconstructive:
    "Разборка допущений. Выявление скрытых предпосылок, бинарных " +
    "оппозиций и внутренних противоречий в исходных системах.",
  hermeneutical:
    "Герменевтический круг. Итеративное углубление понимания через " +
    "переинтерпретацию частей в свете целого и целого в свете частей.",
  analytical:
    "Логический анализ. Формализация аргументов, проверка " +
    "непротиворечивости, выявление логической структуры.",
  creative:
    "Свободный синтез. Минимум ограничений, максимум " +
    "концептуальной свободы. Допускает нестандартные типы связей.",
};

/**
 * Метки уровней синтеза (SL — Synth Level Labels, строки 4001–4030).
 */
export const SL: Record<string, string> = {
  comparative: "Сравнительный",
  transformative: "Трансформативный",
  generative: "Генеративный",
};

export const SL_DESC: Record<string, string> = {
  comparative:
    "Сопоставление систем. Выявление сходств, различий и возможных " +
    "точек синтеза без радикальной трансформации исходных идей.",
  transformative:
    "Трансформация идей. Исходные концепции переосмысляются и " +
    "перестраиваются для создания качественно нового единства.",
  generative:
    "Порождение нового. Исходные системы служат лишь отправной " +
    "точкой для создания принципиально новой философской концепции.",
};

/**
 * Метки глубины (DL — Depth Labels, строки 4031–4070).
 */
export const DL: Record<string, string> = {
  overview: "Обзорный",
  standard: "Стандартный",
  deep: "Глубокий",
  exhaustive: "Исчерпывающий",
};

export const DL_DESC: Record<string, string> = {
  overview:
    "Краткий обзор. Основные тезисы и ключевые категории. " +
    "~5–8 категорий, ~5 тезисов, сокращённый глоссарий.",
  standard:
    "Стандартная глубина. Развёрнутый анализ с обоснованиями. " +
    "~10–15 категорий, ~8–10 тезисов, полный глоссарий.",
  deep:
    "Глубокий анализ. Подробное исследование каждого аспекта. " +
    "~15–20 категорий, ~12–15 тезисов, расширенный глоссарий.",
  exhaustive:
    "Исчерпывающий. Максимально детальное исследование. " +
    "~20–30 категорий, ~15–20 тезисов, полный диалог в 5 частях.",
};

/**
 * Метки порядка генерации (OL — Order Labels).
 */
export const OL: Record<string, string> = {
  architectural: "Архитектурный",
  genetic: "Генетический",
};

export const OL_DESC: Record<string, string> = {
  architectural:
    "Архитектурный порядок. Разделы генерируются в оптимальном " +
    "порядке зависимостей: резюме → граф → топология → глоссарий → тезисы → ...",
  genetic:
    "Генетический порядок. Разделы генерируются в порядке " +
    "«генезиса» концепции: от тезисов к графу.",
};

// ─── Обратные маппинги (русское название → код) ────────────────────────────

export const REVERSE_ML: Record<string, string> = Object.fromEntries(
  Object.entries(ML).map(([k, v]) => [v, k]),
);

export const REVERSE_SL: Record<string, string> = Object.fromEntries(
  Object.entries(SL).map(([k, v]) => [v, k]),
);

export const REVERSE_DL: Record<string, string> = Object.fromEntries(
  Object.entries(DL).map(([k, v]) => [v, k]),
);

export const REVERSE_OL: Record<string, string> = Object.fromEntries(
  Object.entries(OL).map(([k, v]) => [v, k]),
);

// ─── Все допустимые значения (для валидации) ───────────────────────────────

export const ALL_METHODS = Object.keys(ML);
export const ALL_SYNTH_LEVELS = Object.keys(SL);
export const ALL_DEPTHS = Object.keys(DL);
export const ALL_ORDERS = Object.keys(OL);
