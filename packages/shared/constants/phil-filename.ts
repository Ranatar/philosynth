/**
 * Маппинг имён философов → filename-safe транслитерация (PHIL_FILENAME, строки 13542–13613).
 * Используется при экспорте HTML/PNG/MMD: имя файла включает имена участников.
 *
 * Формат: "Имя" → "imya" (краткая латиница, lowercase, без пробелов).
 */
export const PHIL_FILENAME: Record<string, string> = {
  // Античность
  Пифагор: "pythagoras",
  Гераклит: "heraclitus",
  Парменид: "parmenides",
  Демокрит: "democritus",
  Сократ: "socrates",
  Платон: "plato",
  Аристотель: "aristotle",
  Эпикур: "epicurus",
  "Зенон Стоик": "zeno-stoic",
  Плотин: "plotinus",
  "Секст Эмпирик": "sextus-empiricus",

  // Средневековье
  Августин: "augustine",
  Боэций: "boethius",
  "Аль-Фараби": "al-farabi",
  Авиценна: "avicenna",
  "Ансельм Кентерберийский": "anselm",
  Аверроэс: "averroes",
  Маймонид: "maimonides",
  "Фома Аквинский": "aquinas",
  "Иоанн Дунс Скот": "duns-scotus",
  "Уильям Оккам": "ockham",
  "Николай Кузанский": "cusanus",

  // Возрождение и Новое время
  Макиавелли: "machiavelli",
  "Фрэнсис Бэкон": "bacon",
  Декарт: "descartes",
  Гоббс: "hobbes",
  Спиноза: "spinoza",
  Локк: "locke",
  Лейбниц: "leibniz",
  Беркли: "berkeley",
  Юм: "hume",
  Монтескьё: "montesquieu",
  Руссо: "rousseau",

  // Классическая немецкая
  Кант: "kant",
  Фихте: "fichte",
  Шеллинг: "schelling",
  Гегель: "hegel",
  Шопенгауэр: "schopenhauer",
  Фейербах: "feuerbach",

  // XIX век
  Маркс: "marx",
  Кьеркегор: "kierkegaard",
  Милль: "mill",
  Ницше: "nietzsche",
  Пирс: "peirce",
  Джеймс: "james",
  Дильтей: "dilthey",
  Бергсон: "bergson",
  Фреге: "frege",

  // Феноменология, экзистенциализм
  Гуссерль: "husserl",
  Хайдеггер: "heidegger",
  Ясперс: "jaspers",
  Сартр: "sartre",
  "Мерло-Понти": "merleau-ponty",
  Камю: "camus",
  Марсель: "marcel",
  Левинас: "levinas",

  // Аналитическая философия
  Рассел: "russell",
  Витгенштейн: "wittgenstein",
  Карнап: "carnap",
  Поппер: "popper",
  Куайн: "quine",
  Остин: "austin",
  Райл: "ryle",
  Куhn: "kuhn",
  Лакатос: "lakatos",
  Дэвидсон: "davidson",
  Крипке: "kripke",

  // Другие направления XX в.
  Дьюи: "dewey",
  Уайтхед: "whitehead",
  Адорно: "adorno",
  Хоркхаймер: "horkheimer",
  Маркузе: "marcuse",
  Хабермас: "habermas",
  Арендт: "arendt",
  Гадамер: "gadamer",
  Рикёр: "ricoeur",
  Фуко: "foucault",
  Деррида: "derrida",
  Делёз: "deleuze",
  Бодрийяр: "baudrillard",
  Лиотар: "lyotard",
  Ролз: "rawls",
  Нозик: "nozick",

  // Русская философия
  Чаадаев: "chaadaev",
  Соловьёв: "solovyov",
  Бердяев: "berdyaev",
  Лосский: "lossky",
  Флоренский: "florensky",
  Шестов: "shestov",
  Лосев: "losev",

  // Восточная философия
  Конфуций: "confucius",
  "Лао-Цзы": "laozi",
  Нагарджуна: "nagarjuna",
};

/**
 * Обратный маппинг: filename → русское имя.
 */
export const FILENAME_TO_PHIL: Record<string, string> = Object.fromEntries(
  Object.entries(PHIL_FILENAME).map(([name, fname]) => [fname, name]),
);

/**
 * Генерирует имя файла для синтеза по списку участников.
 * Например: ["Кант", "Гегель"] → "kant-hegel"
 */
export function buildSynthesisFilename(
  philosophers: string[],
  maxLength = 60,
): string {
  const parts = philosophers
    .map((p) => PHIL_FILENAME[p] ?? p.toLowerCase().replace(/\s+/g, "-"))
    .join("-");
  return parts.length > maxLength
    ? parts.slice(0, maxLength).replace(/-[^-]*$/, "")
    : parts;
}
