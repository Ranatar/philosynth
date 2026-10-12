/**
 * Смоук ассетов экспорта (беседа 12.2): просмотрщик экспортированного файла —
 * генерат из исходника плюс надстройка службы (Д-9, Д-10).
 *
 *  1. ГЕНЕРАТ ≡ ИСХОДНИКУ ПОБАЙТНО. Генератор scripts/extract/
 *     extract-export-assets.mjs исполняется со своего места (12.5, Д-39:
 *     ROOT на два уровня вверх) и его вывод сверяется с
 *     server/config/export-assets.ts байт в байт: генерат рукой не тронут и
 *     соответствует текущему source/philosynth.html; при расхождении прежний
 *     файл возвращается на место.
 *  2. НАДСТРОЙКА СНИМАЕТСЯ ПОБАЙТНО: strip(apply(fnBundle)) === fnBundle;
 *     каждая замена встречается ровно столько раз, сколько записано; в
 *     наложенном тексте не осталось `|| 0.5` / `|| 0.1` у характеристик и
 *     нечёткого поиска без точного совпадения; синтаксис бандла цел.
 *
 * Запуск: node tests/smoke-export-assets.mjs   (БД и tsx не нужны; нужен python3 —
 * им работает extract-by-name.py)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let ok = 0, bad = 0;
const t = (name, cond, extra = "") => { if (cond) { ok++; console.log(`  ✓ ${name}`); } else { bad++; console.log(`  ✗ ${name} ${extra}`); } };

const assets = await import("../server/config/export-assets.ts");
const ov = await import("../server/config/export-viewer-overrides.ts");
const assetsPath = path.join(ROOT, "server/config/export-assets.ts");
const source = readFileSync(path.join(ROOT, "source/philosynth.html"), "utf8");

console.log("1. генерат ≡ исходнику (генератор — со своего места, scripts/extract/)");
{
  // 12.5 (Д-39): ROOT генератора исправлен («..», «..»), extract-by-name.py — в scripts/extract/;
  // генератор гоняется САМ: вывод обязан быть побайтно равен зафиксированному генерату.
  // Расхождение — красный и возврат прежнего файла (смоук не правит репозиторий)
  const before = readFileSync(assetsPath, "utf8");
  let ran = false;
  try {
    execFileSync(process.execPath, [path.join(ROOT, "scripts/extract/extract-export-assets.mjs")], { stdio: "pipe", cwd: ROOT });
    ran = true;
  } catch (e) {
    t("генератор исполнился со своего места", false, String(e?.stderr ?? e?.message ?? e).slice(0, 300));
  }
  if (ran) {
    const regenerated = readFileSync(assetsPath, "utf8");
    t("server/config/export-assets.ts побайтно равен свежему выводу генератора", regenerated === before, `длины ${regenerated.length} / ${before.length}`);
    if (regenerated !== before) writeFileSync(assetsPath, before, "utf8");
  }
  const genSrc = readFileSync(path.join(ROOT, "scripts/extract/extract-export-assets.mjs"), "utf8");
  t("ROOT генератора — два уровня вверх, extract-by-name.py — scripts/extract/ (Д-39)",
    /const ROOT = path\.resolve\(path\.dirname\(fileURLToPath\(import\.meta\.url\)\), "\.\.", "\.\."\);/.test(genSrc) && /"scripts", "extract", "extract-by-name\.py"/.test(genSrc));
  t("CSS-ассет ≡ содержимому <style> исходника", assets.EXPORT_SOURCE_RAW_CSS === source.slice(source.indexOf("<style>") + 7, source.indexOf("</style>")));
}

console.log("2. надстройка: наложение и снятие");
{
  const gen = assets.EXPORT_GRAPH_FN_BUNDLE;
  const count = (text, frag) => text.split(frag).length - 1;
  for (const o of ov.EXPORT_VIEWER_OVERRIDES)
    if (count(gen, o.from) !== o.count || count(gen, o.to) !== 0)
      t(`замена «${o.from}»: в генерате ${o.count} раз, фрагмента службы нет`, false, `from=${count(gen, o.from)} to=${count(gen, o.to)}`);
  t(`все ${ov.EXPORT_VIEWER_OVERRIDES.length} замен встречаются в генерате ровно записанное число раз`, ov.EXPORT_VIEWER_OVERRIDES.every((o) => count(gen, o.from) === o.count && count(gen, o.to) === 0));
  const patched = ov.applyExportViewerOverrides(gen);
  t("наложение меняет текст", patched !== gen);
  t("СНЯТАЯ надстройка — побайтно генерат", ov.stripExportViewerOverrides(patched) === gen);
  t("в наложенном тексте нет `|| 0.5` и `|| 0.1` (Д-9)", !/\|\| 0\.[15](?![0-9])/.test(patched), (patched.match(/.{30}\|\| 0\.[15](?![0-9]).{10}/g) ?? []).join(" | "));
  t("в генерате они есть (надстройка не пустая)", (gen.match(/\|\| 0\.5(?![0-9])/g) ?? []).length === 24 && (gen.match(/\|\| 0\.1(?![0-9])/g) ?? []).length === 1, String((gen.match(/\|\| 0\.5(?![0-9])/g) ?? []).length));
  t("каждый фрагмент службы несёт метку долга", ov.EXPORT_VIEWER_OVERRIDES.every((o) => o.to.includes(`/*${o.debt}*/`)));
  t("метки Д-9 и Д-10 в наложенном тексте", ov.EXPORT_VIEWER_OVERRIDE_MARKERS.every((m) => patched.includes(m)));
  t("точное совпадение стоит ПЕРЕД нечётким (typeColor, edgeTypeStyle)",
    patched.indexOf("_nodeColorMap.has(lp)") > 0 && patched.indexOf("_nodeColorMap.has(lp)") < patched.indexOf("lp.includes(k) || k.includes(lp)") &&
    patched.indexOf("_edgeStyleMap.has(t)") > 0 && patched.indexOf("_edgeStyleMap.has(t)") < patched.indexOf("t.includes(k) || k.includes(t)"));
  let syntax = "";
  try { new Function(assets.EXPORT_GRAPH_CONST_BUNDLE + "\n" + patched); } catch (e) { syntax = e.message; }
  t("синтаксис бандла с надстройкой цел", syntax === "", syntax);
  let twice = false;
  try { ov.applyExportViewerOverrides(patched); } catch { twice = true; }
  t("повторное наложение — исключение, а не тихое удвоение", twice);
  let drift = false;
  try { ov.applyExportViewerOverrides(gen.replace("(d.str || 0.1)", "(d.str || 0.2)")); } catch { drift = true; }
  t("изменившийся генерат (число вхождений не сошлось) — исключение, а не тихо не применённое исправление", drift);
}

if (!existsSync(assetsPath)) bad++;
console.log(`\nИТОГ: ${ok} ✓ / ${bad} ✗`);
process.exit(bad ? 1 : 0);
