/**
 * Шрифты клиента — в проекте, а не ссылкой на Google Fonts (2026-11-26, вне
 * бесед; решение пользователя).
 *
 * Берёт файлы woff2 и диапазоны unicode-range из пакетов @fontsource/*
 * (те же подмножества, что отдаёт Google Fonts css2) и кладёт:
 *   client/public/fonts/*.woff2      — файлы шрифтов (в репозитории);
 *   client/public/fonts/LICENSES.md  — семейства, версии пакетов, лицензия;
 *   client/src/fonts.css             — @font-face (ГЕНЕРАТ, руками не править).
 *
 * Пакеты в зависимости проекта НЕ входят: скрипт нужен, только чтобы
 * пересобрать набор (новое семейство, начертание, подмножество).
 *
 *   mkdir /tmp/fontsrc && cd /tmp/fontsrc && npm init -y
 *   npm i @fontsource/ibm-plex-mono @fontsource/ibm-plex-sans \
 *         @fontsource/playfair-display @fontsource/ibm-plex-sans-arabic \
 *         @fontsource/ibm-plex-sans-devanagari @fontsource/noto-sans \
 *         @fontsource/noto-serif @fontsource/noto-sans-mono
 *   node scripts/fonts/vendor-fonts.mjs /tmp/fontsrc/node_modules
 *
 * Состав (FONT_SET): начертания — те, что звала ссылка client/index.html до
 * переноса, плюс 900 у Playfair Display (есть в правилах исходника) и 700 у
 * письменностей (заголовки разделов). Noto — ТОЛЬКО греческие подмножества:
 * политоника древнегреческого (greek-ext), которой нет в IBM Plex и Playfair
 * Display; латиницу и кириллицу эти семейства в проекте не несут, поэтому
 * стоять первыми в стеке под :lang(grc) им безопасно.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = join(ROOT, "client/public/fonts");
const OUT_CSS = join(ROOT, "client/src/fonts.css");

const BASE = ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "vietnamese"];

/** pkg — имя пакета @fontsource; variants — "вес" либо "вес-italic". */
export const FONT_SET = [
  { pkg: "ibm-plex-mono", family: "IBM Plex Mono", subsets: BASE, variants: ["400", "500", "600", "400-italic"] },
  { pkg: "ibm-plex-sans", family: "IBM Plex Sans", subsets: [...BASE, "greek"], variants: ["400", "500", "600", "400-italic"] },
  { pkg: "playfair-display", family: "Playfair Display", subsets: ["latin", "latin-ext", "cyrillic", "vietnamese"], variants: ["500", "600", "700", "900", "500-italic"] },
  { pkg: "ibm-plex-sans-arabic", family: "IBM Plex Sans Arabic", subsets: ["arabic"], variants: ["400", "500", "600", "700"] },
  { pkg: "ibm-plex-sans-devanagari", family: "IBM Plex Sans Devanagari", subsets: ["devanagari"], variants: ["400", "500", "600", "700"] },
  { pkg: "noto-sans", family: "Noto Sans", subsets: ["greek", "greek-ext"], variants: ["400", "500", "600", "400-italic"] },
  { pkg: "noto-serif", family: "Noto Serif", subsets: ["greek", "greek-ext"], variants: ["500", "600", "700", "900", "500-italic"] },
  { pkg: "noto-sans-mono", family: "Noto Sans Mono", subsets: ["greek", "greek-ext"], variants: ["400", "500", "600"] },
];

function main() {
  const src = process.argv[2];
  if (!src || !existsSync(join(src, "@fontsource"))) {
    console.error("Использование: node scripts/fonts/vendor-fonts.mjs <путь к node_modules с @fontsource/*>");
    process.exit(1);
  }
  if (existsSync(OUT_DIR)) for (const f of readdirSync(OUT_DIR)) rmSync(join(OUT_DIR, f));
  mkdirSync(OUT_DIR, { recursive: true });

  const faces = [];
  const licenses = [];
  let bytes = 0;
  for (const set of FONT_SET) {
    const dir = join(src, "@fontsource", set.pkg);
    const meta = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    licenses.push(`| ${set.family} | @fontsource/${set.pkg} ${meta.version} | ${meta.license} | ${set.subsets.join(", ")} | ${set.variants.join(", ")} |`);
    for (const variant of set.variants) {
      const cssPath = join(dir, `${variant}.css`);
      if (!existsSync(cssPath)) throw new Error(`${set.pkg}: нет ${variant}.css`);
      const css = readFileSync(cssPath, "utf8");
      const found = new Set();
      for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
        const body = m[1];
        const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(body)?.[1];
        // имя файла пакета: <пакет>-<подмножество>-<вес>-<normal|italic>.woff2
        const subset = file?.startsWith(set.pkg + "-") ? file.slice(set.pkg.length + 1).replace(/-\d+-(normal|italic)\.woff2$/, "") : "";
        if (!set.subsets.includes(subset)) continue;
        const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1];
        const weight = /font-weight:\s*([^;]+);/.exec(body)?.[1];
        const style = /font-style:\s*([^;]+);/.exec(body)?.[1];
        if (!file || !range || !weight || !style) throw new Error(`${set.pkg} ${variant} ${subset}: блок @font-face не разобран`);
        copyFileSync(join(dir, "files", file), join(OUT_DIR, file));
        bytes += readFileSync(join(OUT_DIR, file)).length;
        faces.push({ family: set.family, subset, weight: weight.trim(), style: style.trim(), file, range: range.trim() });
        found.add(subset);
      }
      for (const s of set.subsets) if (!found.has(s)) throw new Error(`${set.pkg} ${variant}: нет подмножества ${s}`);
    }
  }

  const head =
    "/* ГЕНЕРАТ scripts/fonts/vendor-fonts.mjs — РУКАМИ НЕ ПРАВИТЬ.\n" +
    " * Шрифты клиента лежат в проекте (client/public/fonts), ссылок на Google\n" +
    " * Fonts нет (2026-11-26). Диапазоны unicode-range — как у Google Fonts:\n" +
    " * браузер грузит файл, только встретив его буквы. */\n";
  const body = faces
    .map(
      (f) =>
        `/* ${f.family} · ${f.subset} */\n@font-face {\n  font-family: "${f.family}";\n  font-style: ${f.style};\n  font-weight: ${f.weight};\n  font-display: swap;\n  src: url("/fonts/${f.file}") format("woff2");\n  unicode-range: ${f.range};\n}`,
    )
    .join("\n");
  writeFileSync(OUT_CSS, head + body + "\n");

  writeFileSync(
    join(OUT_DIR, "LICENSES.md"),
    "# Шрифты клиента\n\n" +
      "Файлы woff2 взяты из пакетов @fontsource (сборка `scripts/fonts/vendor-fonts.mjs`).\n" +
      "Все семейства распространяются по SIL Open Font License 1.1\n" +
      "(https://openfontlicense.org): IBM Plex — © IBM Corp.; Playfair Display —\n" +
      "© The Playfair Project Authors; Noto — © The Noto Project Authors.\n\n" +
      "| Семейство | Пакет | Лицензия | Подмножества | Начертания |\n|---|---|---|---|---|\n" +
      licenses.join("\n") +
      "\n",
  );
  console.log(`файлов: ${faces.length}, ${(bytes / 1024).toFixed(0)} КБ → client/public/fonts; @font-face → client/src/fonts.css`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
