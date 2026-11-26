/**
 * Языки генерации одной таблицей (2026-11-26, вне бесед).
 *
 * Без сервера и без Claude: сервисы зовутся напрямую на живых PG/Redis
 * (посевы prompts/configs нужны buildSYS).
 *   G1 таблица: 15 языков, «Другой…» последним, экспериментальные и rtl
 *   G2 buildSYS — имя языка для модели (санскрит — деванагари; English как был)
 *   G3 индекс поиска: французский/итальянский/арабский — свой словарь,
 *      фарси и санскрит — simple; запрос по форме слова находит документ
 *   G4 миграция 0025: строка индекса французского документа, собранная
 *      simple, снимается тем же DELETE; search:reindex --missing её возвращает
 *   G5 экспорт HTML: <html lang>, lang/dir тел разделов, правила и шрифты
 *      письменностей, суффикс имени файла
 *   G6 (если есть Chrome) экспорт арабского документа в браузере: тело
 *      раздела справа налево, заголовок таблицы выровнен вправо, черта врезки
 *      справа, разрядка в заголовках снята; снимок — tests/out/gen-langs-ar.png
 *
 * Запуск: npx tsx tests/test-gen-langs.mjs
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";

import postgres from "postgres";

const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const sql = postgres(DB_URL, { max: 2, onnotice: () => {} });

let passed = 0;
let failed = 0;
function ok(cond, name, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail === undefined ? "" : " — " + JSON.stringify(detail).slice(0, 400)}`); }
}

const LOC = await import("../packages/shared/i18n/locales.ts");
const GS = await import("../packages/shared/i18n/gen-script-css.ts");
const { searchTsConfigFor } = await import("../packages/shared/constants/search.ts");
const { buildSYS } = await import("../server/services/prompt-builder.ts");
const { writeSearchIndex } = await import("../server/services/search-index.ts");
const { exportHTML } = await import("../server/services/export/html-exporter.ts");
const { getDocFilename } = await import("../server/services/export/filename.ts");
const { closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");

const tag = "gl" + Math.random().toString(36).slice(2, 7);
const ids = [];

const AR_SECTION = `<div class="doc-section"><div class="section-num">§ 2</div><div class="section-title">البنية المقولية</div><div class="doc-content">
<div data-section="Таблица категорий"><h4>جدول المقولات</h4>
<p>يقوم هذا التركيب على <strong>جدلية الوجود والمعرفة</strong>، كما حُدِّد في §1 من هذه الوثيقة.</p>
<table class="doc-table"><thead><tr><th>Название</th><th>Тип</th><th>Определение</th></tr></thead>
<tbody><tr><td>الوجود</td><td>онтологическая</td><td>ما يتقدّم على كل معرفة.</td></tr>
<tr><td>المعرفة</td><td>эпистемологическая</td><td>انكشاف الوجود للعقل.</td></tr></tbody></table>
<div class="callout note"><span class="callout-label">ملاحظة</span>المقولتان متضايفتان.</div>
<ul><li>الأولى: الوجود</li><li>الثانية: المعرفة</li></ul>
</div></div></div>`;

async function mkSynthesis(lang, title, extra = {}) {
  const [u] = await sql`INSERT INTO users (email, password_hash) VALUES (${`${tag}-${ids.length}@gl.local`}, 'x') RETURNING id`;
  const [s] = await sql`
    INSERT INTO syntheses (user_id, title, doc_num, status, lang, seed, capsule_html, section_order)
    VALUES (${u.id}, ${title}, ${tag + ids.length}, 'ready', ${lang}, ${extra.seed ?? ""}, ${extra.capsule ?? ""}, ${sql.json(extra.order ?? ["sum", "graph"])})
    RETURNING id`;
  ids.push({ user: u.id, synthesis: s.id });
  return s.id;
}

try {
  console.log("\n■ G1: таблица языков");
  const values = LOC.GEN_LANGS.map((l) => l.value);
  ok(values.length === 15 && LOC.LANG_OPTIONS.length === 16 && LOC.LANG_OPTIONS.at(-1)[0] === "__custom", "15 языков + «Другой…» последним", values);
  ok(["Italian", "Ancient Greek", "Portuguese", "Classical Chinese", "Arabic", "Persian", "Sanskrit"].every((v) => values.includes(v)), "семь новых языков в списке");
  ok(LOC.GEN_LANGS.filter((l) => l.experimental).map((l) => l.value).join() === "Ancient Greek,Classical Chinese,Sanskrit", "экспериментальные — древнегреческий, вэньянь, санскрит");
  ok(LOC.genLangContentAttrs("Persian").dir === "rtl" && LOC.genLangContentAttrs("arabic").lang === "ar", "фарси и арабский — справа налево, без учёта регистра");
  ok(LOC.genLangContentAttrs("Sanskrit").lang === "sa" && LOC.genLangContentAttrs("Sanskrit").dir === "ltr", "санскрит — sa, слева направо");

  console.log("\n■ G2: имя языка для модели");
  const sa = await buildSYS({ phil: [], lang: "Sanskrit" });
  ok(sa.includes("strictly in Sanskrit, written in Devanagari script (not in transliteration)."), "санскрит — деванагари, не транслитерация");
  const grc = await buildSYS({ phil: [], lang: "Ancient Greek" });
  ok(grc.includes("polytonic orthography"), "древнегреческий — политоника");
  const fa = await buildSYS({ phil: [], lang: "Persian" });
  ok(fa.includes("strictly in Persian (Farsi)."), "фарси — Persian (Farsi)");
  const it = await buildSYS({ phil: [], lang: "Italian" });
  ok(it.includes("strictly in Italian. ") && it.includes("CRITICAL MACHINE-VALUE RULE"), "итальянский — имя как есть, правило машинных значений на месте");
  const ru = await buildSYS({ phil: [], lang: "Russian" });
  ok(!ru.includes("CRITICAL OUTPUT LANGUAGE INSTRUCTION"), "русский — без языковой инструкции, как было");

  console.log("\n■ G3: индекс поиска");
  ok(searchTsConfigFor("Italian") === "italian" && searchTsConfigFor("Arabic") === "arabic" && searchTsConfigFor("Persian") === "simple" && searchTsConfigFor("Sanskrit") === "simple", "словари: italian, arabic; фарси и санскрит — simple");
  const fr = await mkSynthesis("French", `Les philosophies de la connaissance ${tag}`, { seed: "Une synthèse des théories critiques" });
  await writeSearchIndex(fr);
  const [frRow] = await sql`SELECT config FROM synthesis_search WHERE synthesis_id = ${fr}`;
  ok(frRow?.config === "french", "французский документ проиндексирован словарём french", frRow);
  const [hit] = await sql`SELECT count(*)::int AS n FROM synthesis_search WHERE synthesis_id = ${fr} AND title_tsv @@ websearch_to_tsquery('french', 'philosophie')`;
  ok(hit.n === 1, "«philosophie» находит «philosophies» (морфология)");
  const ar = await mkSynthesis("Arabic", `فلسفة المعرفة ${tag}`, { capsule: `<div data-section="Капсула"><h4>الكبسولة</h4><p>تركيب جدلي بين الوجود والمعرفة.</p></div>`, order: ["capsule", "graph"] });
  await writeSearchIndex(ar);
  const [arRow] = await sql`SELECT config FROM synthesis_search WHERE synthesis_id = ${ar}`;
  ok(arRow?.config === "arabic", "арабский — словарём arabic", arRow);
  const fa2 = await mkSynthesis("Persian", `فلسفه شناخت ${tag}`);
  await writeSearchIndex(fa2);
  const [faRow] = await sql`SELECT config FROM synthesis_search WHERE synthesis_id = ${fa2}`;
  ok(faRow?.config === "simple", "фарси — simple", faRow);

  console.log("\n■ G4: миграция 0025 снимает строки, собранные simple");
  await sql`UPDATE synthesis_search SET config = 'simple' WHERE synthesis_id = ${fr}`;
  const mig = readFileSync(new URL("../server/db/migrations/0025_gen_langs_search.sql", import.meta.url), "utf8");
  const del = mig.slice(mig.indexOf("DELETE FROM"));
  await sql.unsafe(del);
  const [gone] = await sql`SELECT count(*)::int AS n FROM synthesis_search WHERE synthesis_id = ${fr}`;
  const [kept] = await sql`SELECT count(*)::int AS n FROM synthesis_search WHERE synthesis_id IN ${sql([ar, fa2])}`;
  ok(gone.n === 0 && kept.n === 2, "французская строка на simple снята, арабская и фарси на месте", { gone: gone.n, kept: kept.n });
  await writeSearchIndex(fr); // то, что делает search:reindex --missing
  const [back] = await sql`SELECT config FROM synthesis_search WHERE synthesis_id = ${fr}`;
  ok(back?.config === "french", "пересчёт возвращает строку со словарём french");

  console.log("\n■ G5: экспорт HTML");
  await sql`INSERT INTO sections (synthesis_id, key, section_num, title, html_content) VALUES (${ar}, 'graph', 2, 'البنية المقولية', ${AR_SECTION})`;
  // режим — в выгрузке его окно обязано получить язык и направление документа
  await sql`INSERT INTO mode_results (synthesis_id, mode_key, param_value, html_content) VALUES (${ar}, 'adversarial', 'كانط', ${'<h4>اعتراض</h4><p>نص الاعتراض.</p><ul><li>أولاً</li></ul>'})`;
  const html = await exportHTML(ar);
  ok(/<html lang="ar">/.test(html), "<html lang=\"ar\">");
  ok(html.includes(`<div class="doc-body" lang="ar" dir="rtl">`), "тело раздела — lang=ar dir=rtl");
  ok(html.includes(`<div class="doc-title" dir="auto">`), "название — dir=auto");
  ok(html.includes(GS.GEN_SCRIPT_CSS) && html.includes("IBM+Plex+Sans+Arabic"), "правила и шрифты письменностей в файле");
  ok(/<details open id="docTOC" class="doc-body">|<div class="doc-header">/.test(html) && !/<div class="doc-header"[^>]*dir=/.test(html), "шапка без dir (направление страницы)");
  const base = { docNum: "PS-1", title: "x", method: "dialectical", synthLevel: "integrative", generationOrder: "architectural", depth: "standard", version: { major: 1, minor: 0, sub: 0 }, philosophers: [] };
  const fn = (lang) => getDocFilename({ ...base, conceptParentCount: 0, lang }, "html");
  ok(/-ar\.html$/.test(fn("Arabic")) && /-grc\.html$/.test(fn("Ancient Greek")) && /-ge\.html$/.test(fn("German")) && !/-r/.test(fn("Russian").replace(/^PS-1/, "")), "имя файла: -ar, -grc; прежнее -ge; у русского суффикса нет", [fn("Arabic"), fn("Ancient Greek"), fn("German"), fn("Russian")]);
  const ko = await mkSynthesis("Korean", `철학 ${tag}`);
  const koHtml = await exportHTML(ko);
  ok(/<html lang="und">/.test(koHtml), "язык, введённый руками, — lang=und (прежде звался английским)");
  ok(/id="philosynth-modes"[^>]*data-content-dir="rtl"[^>]*data-content-lang="ar"/.test(html), "режимы выгрузки несут язык и направление документа");
  const grcDoc = await mkSynthesis("Ancient Greek", `Περὶ ἀληθείας ${tag}`);
  await sql`INSERT INTO sections (synthesis_id, key, section_num, title, html_content) VALUES (${grcDoc}, 'sum', 1, 'Περὶ τῆς ἀληθείας', ${'<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">Περὶ τῆς ἀληθείας</div><div class="doc-content"><div data-section="Цели и задачи"><h4>Σκοποί</h4><p>Ἡ ἀλήθεια τοῦ ὄντος ᾗ ὄν ἐστιν.</p></div></div></div>'})`;
  const grcHtml = await exportHTML(grcDoc);
  ok(/<html lang="grc">/.test(grcHtml) && grcHtml.includes("Noto+Sans:") && grcHtml.includes("Noto+Serif:") && grcHtml.includes("Noto+Sans+Mono:"), "древнегреческий: lang=grc, семейства Noto в ссылке шрифтов файла");

  console.log("\n■ G6: арабский экспорт в браузере");
  const chromePath = [`${process.env.HOME}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`, process.env.CHROME_PATH, "/opt/google/chrome/chrome"].find((p) => p && existsSync(p));
  let puppeteer = null;
  try { puppeteer = (await import("puppeteer-core")).default; } catch { /* нет */ }
  if (!chromePath || !puppeteer) {
    console.log("  · пропущено: нет Chrome или puppeteer-core");
  } else {
    const browser = await puppeteer.launch({ executablePath: chromePath, args: ["--no-sandbox"], headless: true });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1100, height: 900 });
      // шрифты Google недоступны без сети — стиль проверяется по вычисленным значениям
      await page.setContent(html.replace(/<link href="https:\/\/fonts[^>]*>/, ""), { waitUntil: "domcontentloaded" });
      const st = await page.evaluate(() => {
        const body = document.querySelector('.doc-body[dir="rtl"]');
        const th = body?.querySelector(".doc-table th");
        const callout = body?.querySelector(".callout");
        const h4 = body?.querySelector(".doc-content h4");
        const ul = body?.querySelector(".doc-content ul");
        const cs = (el) => (el ? getComputedStyle(el) : null);
        return {
          direction: cs(body?.querySelector(".doc-content"))?.direction,
          thAlign: cs(th)?.textAlign,
          calloutRight: cs(callout)?.borderRightWidth,
          calloutLeft: cs(callout)?.borderLeftWidth,
          h4Spacing: cs(h4)?.letterSpacing,
          h4Size: cs(h4)?.fontSize,
          ulMarginRight: cs(ul)?.marginRight,
          headerDir: cs(document.querySelector(".doc-header"))?.direction,
          sansVar: getComputedStyle(document.documentElement).getPropertyValue("--sans"),
        };
      });
      ok(st.direction === "rtl" && st.headerDir === "ltr", "тело раздела rtl, шапка ltr", st);
      ok(st.thAlign === "right", "заголовок таблицы выровнен вправо", st.thAlign);
      ok(st.calloutRight === "3px" && st.calloutLeft === "0px", "черта врезки справа", st);
      ok(st.h4Spacing === "normal" && st.h4Size === "13px", "заголовок подраздела: без разрядки, 13 px", st);
      ok(st.ulMarginRight === "20px", "отступ списка справа", st.ulMarginRight);
      ok(/IBM Plex Sans Arabic/.test(st.sansVar), "стек --sans с IBM Plex Sans Arabic", st.sansVar);
      // режим в выгрузке: окно открыто кнопкой файла
      const mode = await page.evaluate(() => {
        window.openExportedMode("adversarial");
        const mc = document.getElementById("modeContent");
        const cs = (el) => (el ? getComputedStyle(el) : null);
        return { dir: mc?.getAttribute("dir"), lang: mc?.getAttribute("lang"), direction: cs(mc)?.direction, size: cs(mc)?.fontSize, ulRight: cs(mc?.querySelector("ul"))?.marginRight, ulLeft: cs(mc?.querySelector("ul"))?.marginLeft, h4Spacing: cs(mc?.querySelector("h4"))?.letterSpacing };
      });
      ok(mode.dir === "rtl" && mode.lang === "ar" && mode.direction === "rtl", "режим в выгрузке — lang=ar dir=rtl", mode);
      ok(mode.size === "14px" && mode.ulRight === "20px" && mode.ulLeft === "0px" && mode.h4Spacing === "normal", "режим: кегль 14, отступ списка справа, без разрядки (lang/dir на самом .doc-content)", mode);
      // древнегреческий: стеки под :lang(grc) начинаются с Noto, прописные сняты
      const gpage = await browser.newPage();
      await gpage.setContent(grcHtml.replace(/<link href="https:\/\/fonts[^>]*>/, ""), { waitUntil: "domcontentloaded" });
      const g = await gpage.evaluate(() => {
        const cs = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el) : null; };
        return { body: cs(".doc-content p")?.fontFamily, title: cs(".section-title")?.fontFamily, h4: cs(".doc-content h4")?.fontFamily, h4Case: cs(".doc-content h4")?.textTransform };
      });
      ok(/^"?Noto Sans"?,/.test(g.body ?? "") && /^"?Noto Serif"?,/.test(g.title ?? "") && /^"?Noto Sans Mono"?,/.test(g.h4 ?? ""), "древнегреческий: текст, заголовок и подзаголовок — с Noto первым в стеке", g);
      ok(g.h4Case === "none", "древнегреческий: прописные в подзаголовке сняты", g.h4Case);
      await gpage.close();
      mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
      const shot = new URL("./out/gen-langs-ar.png", import.meta.url).pathname;
      await (await page.$('.doc-body[dir="rtl"]'))?.screenshot({ path: shot });
      console.log(`  · снимок: ${shot}`);
    } finally {
      await browser.close();
    }
  }
} finally {
  for (const x of ids) {
    await sql`DELETE FROM syntheses WHERE id = ${x.synthesis}`;
    await sql`DELETE FROM users WHERE id = ${x.user}`;
  }
  await sql.end();
  await closeDb();
  await closeRedis();
}

console.log(`\nИтог: ${passed} ✓, ${failed} ✗`);
process.exit(failed ? 1 : 0);
