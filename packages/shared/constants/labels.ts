/**
 * Метки методов синтеза (ML).
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
 * Описания методов синтеза (MD).
 */
export const MD: Record<string, string> = {
  dialectical:
    "Движение от тезиса к антитезису и к синтезу — обнаружение " +
    "внутренних противоречий между традициями и их снятие в новом единстве",
  integrative:
    "Поиск общих оснований, скрытых точек пересечения и " +
    "взаимодополняющих элементов между выбранными традициями",
  deconstructive:
    "Разбор базовых предпосылок каждой традиции, обнаружение " +
    "скрытых допущений и пересборка из очищенных элементов",
  hermeneutical:
    "Погружение в горизонт понимания каждой традиции и расширение " +
    "собственного горизонта через слияние перспектив",
  analytical:
    "Формализация ключевых положений, выявление логической " +
    "структуры и построение непротиворечивого синтеза",
  creative:
    "Свободная комбинаторика идей с упором на оригинальность, " +
    "неожиданные связи и порождающий потенциал",
};

/**
 * Метки глубины (DL).
 */
export const DL: Record<string, string> = {
  overview: "Обзорная",
  standard: "Стандартная",
  deep: "Глубокая",
  exhaustive: "Исчерпывающая",
};

/**
 * Метки уровней синтеза (SL).
 */
export const SL: Record<string, string> = {
  comparative: "Сравнительный",
  transformative: "Преобразующий",
  generative: "Порождающий",
};

/**
 * Описания уровней синтеза (SD).
 */
export const SD: Record<string, string> = {
  comparative:
    "Категории заимствуются из исходных философов с переопределением, " +
    "дополняются синтетическими",
  transformative:
    "Каждая категория обязана возникать из напряжения между минимум " +
    "двумя философами, прямое заимствование запрещено",
  generative:
    "Категории порождаются проблемой, а не философами; философы — " +
    "источники ограничений, которые синтез преодолевает",
};

/**
 * Порядок уровней (для индексации ORDER_HINT_MATRIX).
 */
export const LEVEL_ORDER = [
  "comparative",
  "transformative",
  "generative",
] as const;

/**
 * Матрица подсказок порядка генерации (метод × уровень).
 * Значения: "genetic" | "lean-genetic" | "neutral" | "lean-arch" | "architectural"
 */
export const ORDER_HINT_MATRIX: Record<string, string[]> = {
  //                     comparative      transformative     generative
  dialectical: ["lean-genetic", "genetic", "genetic"],
  hermeneutical: ["lean-genetic", "genetic", "lean-genetic"],
  deconstructive: ["lean-genetic", "genetic", "genetic"],
  creative: ["neutral", "lean-genetic", "lean-genetic"],
  integrative: ["lean-arch", "neutral", "neutral"],
  analytical: ["architectural", "neutral", "lean-arch"],
};

export type OrderHintKey =
  | "genetic"
  | "lean-genetic"
  | "neutral"
  | "lean-arch"
  | "architectural";

export const ORDER_HINT_ICON: Record<OrderHintKey, string> = {
  genetic: "◉",
  "lean-genetic": "◎",
  neutral: "○",
  "lean-arch": "◎",
  architectural: "◉",
};

// ─── Обратные маппинги ─────────────────────────────────────────────────────

export const REVERSE_ML = Object.fromEntries(
  Object.entries(ML).map(([k, v]) => [v, k]),
);
export const REVERSE_DL = Object.fromEntries(
  Object.entries(DL).map(([k, v]) => [v, k]),
);
export const REVERSE_SL = Object.fromEntries(
  Object.entries(SL).map(([k, v]) => [v, k]),
);

// ─── Валидация ─────────────────────────────────────────────────────────────

export const ALL_METHODS = Object.keys(ML);
export const ALL_SYNTH_LEVELS = Object.keys(SL);
export const ALL_DEPTHS = Object.keys(DL);
