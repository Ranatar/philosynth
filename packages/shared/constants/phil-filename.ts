/**
 * Маппинг имён философов → filename-safe имя (PHIL_FILENAME).
 * 70 записей из исходника (строка 13542), 36 дополнений (// +).
 */
export const PHIL_FILENAME: Record<string, string> = {
  // Античность
  "Пифагор": "Pythagoras",
  "Гераклит": "Heraclitus",
  "Парменид": "Parmenides",
  "Демокрит": "Democritus",                     // +
  "Сократ": "Socrates",
  "Платон": "Plato",
  "Аристотель": "Aristotle",
  "Эпикур": "Epicurus",
  "Зенон Стоик": "Zeno-Stoic",                  // +
  "Секст Эмпирик": "Sextus-Empiricus",          // +
  "Марк Аврелий": "Aurelius",
  "Плотин": "Plotinus",

  // Средневековье
  "Августин": "Augustine",
  "Боэций": "Boethius",                         // +
  "Аль-Фараби": "Al-Farabi",                    // +
  "Авиценна": "Avicenna",                       // +
  "Ансельм Кентерберийский": "Anselm",
  "Аверроэс": "Averroes",                       // +
  "Маймонид": "Maimonides",                     // +
  "Фома Аквинский": "Aquinas",
  "Дунс Скот": "Scotus",
  "Уильям Оккам": "Ockham",                     // +
  "Николай Кузанский": "Cusanus",

  // Новое время
  "Макиавелли": "Machiavelli",                  // +
  "Фрэнсис Бэкон": "Bacon",
  "Декарт": "Descartes",
  "Гоббс": "Hobbes",                            // +
  "Спиноза": "Spinoza",
  "Локк": "Locke",
  "Лейбниц": "Leibniz",
  "Беркли": "Berkeley",
  "Монтескьё": "Montesquieu",                   // +
  "Юм": "Hume",
  "Руссо": "Rousseau",

  // Классическая немецкая
  "Кант": "Kant",
  "Фихте": "Fichte",
  "Шеллинг": "Schelling",
  "Гегель": "Hegel",
  "Шопенгауэр": "Schopenhauer",
  "Фейербах": "Feuerbach",                      // +

  // XIX век
  "Огюст Конт": "Comte",
  "Кьеркегор": "Kierkegaard",
  "Маркс": "Marx",
  "Милль": "Mill",                              // +
  "Дильтей": "Dilthey",
  "Брентано": "Brentano",
  "Пирс": "Peirce",
  "Ницше": "Nietzsche",
  "Фреге": "Frege",
  "Мейнонг": "Meinong",
  "Джеймс": "James",                            // +

  // Психоанализ
  "Фрейд": "Freud",
  "Юнг": "Jung",

  // XX век
  "Гуссерль": "Husserl",
  "Бергсон": "Bergson",
  "Дьюи": "Dewey",
  "Уайтхед": "Whitehead",
  "Рассел": "Russell",
  "Кассирер": "Cassirer",
  "Витгенштейн": "Wittgenstein",
  "Хайдеггер": "Heidegger",
  "Ясперс": "Jaspers",                          // +
  "Карнап": "Carnap",
  "Батай": "Bataille",
  "Марсель": "Marcel",                          // +
  "Гадамер": "Gadamer",
  "Лакан": "Lacan",
  "Адорно": "Adorno",
  "Хоркхаймер": "Horkheimer",                   // +
  "Маркузе": "Marcuse",                         // +
  "Сартр": "Sartre",
  "Арендт": "Arendt",                           // +
  "Левинас": "Levinas",
  "Мерло-Понти": "Merleau-Ponty",

  // Аналитическая
  "Куайн": "Quine",
  "Поппер": "Popper",                           // +
  "Остин": "Austin",                            // +
  "Райл": "Ryle",                               // +
  "Кун": "Kuhn",                                // +
  "Лакатос": "Lakatos",                         // +
  "Дэвидсон": "Davidson",                       // +
  "Крипке": "Kripke",                           // +

  "Камю": "Camus",

  // Постструктурализм, постмодерн, политическая
  "Делёз": "Deleuze",
  "Фуко": "Foucault",
  "Деррида": "Derrida",
  "Рикёр": "Ricoeur",                           // +
  "Бодрийяр": "Baudrillard",                    // +
  "Лиотар": "Lyotard",                          // +
  "Хомский": "Chomsky",
  "Рорти": "Rorty",
  "Хабермас": "Habermas",
  "Ролз": "Rawls",                              // +
  "Нозик": "Nozick",                            // +
  "Жижек": "Zizek",

  // Восточная
  "Конфуций": "Confucius",
  "Лао-цзы": "Laozi",
  "Нагарджуна": "Nagarjuna",
  "Шанкара": "Shankara",

  // Русская
  "Чаадаев": "Chaadaev",                        // +
  "Соловьёв": "Solovyov",
  "Бердяев": "Berdyaev",
  "Лосский": "Lossky",                          // +
  "Флоренский": "Florensky",                    // +
  "Шестов": "Shestov",                          // +
  "Лосев": "Losev",
};

/**
 * Обратный маппинг: filename → русское имя.
 */
export const FILENAME_TO_PHIL: Record<string, string> = Object.fromEntries(
  Object.entries(PHIL_FILENAME).map(([name, fname]) => [fname, name]),
);
