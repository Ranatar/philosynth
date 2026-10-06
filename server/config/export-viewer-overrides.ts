/**
 * Просмотрщик графа экспортированного файла — отступления службы от
 * исходника (беседа 12.2: Д-9, Д-10). Рукописная НАДСТРОЙКА над генератом
 * `server/config/export-assets.ts` (образец — lang-templates.ts 11.1).
 *
 * ПОЧЕМУ НЕ ПРАВКА export-assets.ts. Он ГЕНЕРАТ из philosynth.html («НЕ
 * ПРАВИТЬ РУКАМИ»): fnBundle — функции исходника дословно; правка рукой
 * пропала бы при первом `npm run extract:export-assets`, а сверка ассетов с
 * исходником перестала бы сходиться. Поэтому отступление живёт ЗДЕСЬ:
 * html-exporter накладывает его на fnBundle (`applyExportViewerOverrides`),
 * смоук ассетов снимает (`stripExportViewerOverrides`) и сверяет остаток с
 * исходником побайтно, сторож 4ba проверяет, что генерат не тронут, а
 * выгрузка несёт надстройку.
 *
 * ЧТО ИСПРАВЛЯЕТСЯ (решение пользователя 2026-09-23 — квирки исходника
 * исправлять; двойники — клиент 1.7 и экспортёры 4.2, правятся вместе):
 *
 *  Д-9 — ноль характеристики читался как 0.5.
 *   - разбор таблиц встроенным parseGraph: `parseFloat(ячейка) || 0.5` →
 *     «не число → 0.5, число (включая 0) — как есть»;
 *   - отрисовка и физика: `(x || 0.5)` → `(x ?? 0.5)` — связь силой 0 рисуется
 *     самой тонкой и не тянет концы; там же `(d.str || 0.1)` силы связи
 *     2D-раскладки (тот же дефект под другим числом).
 *
 *  Д-10 — типы с вложенными названиями красились одним цветом.
 *   - сиды оттенка и штриха перебираются от САМОГО ДЛИННОГО ключа (порядок
 *     равных — исходный): «феноменологическая» берёт 275, а не 168 «логическ»;
 *   - typeColor и edgeTypeStyle: ТОЧНОЕ совпадение с ключом палитры первым,
 *     нечёткое «содержит» — запасным ходом для строк вне палитры.
 *
 * УСТРОЙСТВО. Каждая замена — пара «фрагмент генерата → фрагмент службы» с
 * ожидаемым числом вхождений. Фрагмент службы несёт метку-комментарий с
 * номером долга (константы D9 и D10 ниже): по ней замена однозначно обратима (в генерате
 * уже есть свои `?? 0.5`), а читатель экспортированного файла видит, где
 * служба отступила от исходника. Число вхождений не сошлось (исходник
 * обновили и перегенерировали ассеты) — исключение при наложении, а не тихо
 * не применённое исправление.
 */

export interface ViewerOverride {
  /** Какой долг закрывает замена */
  debt: "Д-9" | "Д-10";
  /** Фрагмент генерата (исходник дословно) */
  from: string;
  /** Фрагмент службы — обязан нести метку долга */
  to: string;
  /** Сколько раз фрагмент обязан встретиться в генерате */
  count: number;
}

const D9 = "/*Д-9*/";
const D10 = "/*Д-10*/";

/** Разбор: не число → 0.5; число, включая 0, — как есть. */
const parsed = (cell: string): string =>
  `${D9} ((v) => (isFinite(v) ? v : 0.5))(parseFloat(${cell}))`;

/** Отрисовка: `(x || d)` → `(x ?? d)`. */
const nullish = (expr: string, dflt: string, count: number): ViewerOverride => ({
  debt: "Д-9",
  from: `(${expr} || ${dflt})`,
  to: `(${expr} ?? ${dflt} ${D9})`,
  count,
});

/** Сиды — от самого длинного ключа (сортировка устойчива: равные — в исходном порядке). */
const longestFirst = (seeds: string): ViewerOverride => ({
  debt: "Д-10",
  from: `Object.entries(${seeds})`,
  to: `Object.entries(${seeds}).sort((a, b) => b[0].length - a[0].length) ${D10}`,
  count: 1,
});

export const EXPORT_VIEWER_OVERRIDES: readonly ViewerOverride[] = [
  // ── Д-9: разбор таблиц (parseGraph) ──
  { debt: "Д-9", from: "parseFloat(td[3]) || 0.5", to: parsed("td[3]"), count: 1 },
  { debt: "Д-9", from: "parseFloat(td[4]) || 0.5", to: parsed("td[4]"), count: 1 },
  { debt: "Д-9", from: "parseFloat(td[5]) || 0.5", to: parsed("td[5]"), count: 1 },
  // ── Д-9: отрисовка, панели, физика, MMD и PNG просмотрщика ──
  nullish("edgeData.str", "0.5", 2),
  nullish("e.str", "0.5", 3),
  nullish("d.str", "0.5", 2),
  nullish("l.str", "0.5", 3),
  nullish("t.cen", "0.5", 1),
  nullish("s.cen", "0.5", 2),
  nullish("n.cen", "0.5", 4),
  nullish("ns[e.ti].cen", "0.5", 1),
  nullish("ns[e.si].cen", "0.5", 1),
  nullish("d.str", "0.1", 1),
  { debt: "Д-9", from: "const str = e.str || 0.5;", to: `const str = e.str ?? 0.5; ${D9}`, count: 2 },
  // ── Д-10: сиды по самому длинному ключу ──
  longestFirst("_TC_HUE_SEEDS"),
  longestFirst("_EC_HUE_SEEDS"),
  longestFirst("_EC_DASH_SEEDS"),
  // ── Д-10: точное совпадение с ключом палитры первым ──
  {
    debt: "Д-10",
    from: "for (const [k, v] of _nodeColorMap)",
    to: `if (_nodeColorMap.has(lp)) return _nodeColorMap.get(lp); ${D10} for (const [k, v] of _nodeColorMap)`,
    count: 1,
  },
  {
    debt: "Д-10",
    from: "for (const [k, v] of _edgeStyleMap)",
    to: `if (_edgeStyleMap.has(t)) { matched.push(_edgeStyleMap.get(t)); continue; } ${D10} for (const [k, v] of _edgeStyleMap)`,
    count: 1,
  },
];

function occurrences(text: string, fragment: string): number {
  return text.split(fragment).length - 1;
}

/**
 * Наложить надстройку на fnBundle генерата. Бросает, если фрагмент генерата
 * встретился не столько раз, сколько записано, либо фрагмент службы уже есть
 * в тексте (повторное наложение) — тихо не применённое исправление хуже
 * падения экспорта на стенде.
 */
export function applyExportViewerOverrides(fnBundle: string): string {
  let out = fnBundle;
  for (const o of EXPORT_VIEWER_OVERRIDES) {
    if (occurrences(out, o.to) !== 0)
      throw new Error(
        `export-viewer-overrides: фрагмент службы уже в тексте (${o.debt}): ${o.to}`,
      );
    const n = occurrences(out, o.from);
    if (n !== o.count)
      throw new Error(
        `export-viewer-overrides: «${o.from}» встречен ${n} раз вместо ${o.count} (${o.debt}) — ` +
          `ассеты перегенерированы из изменившегося исходника? Сверить список замен`,
      );
    out = out.split(o.from).join(o.to);
  }
  return out;
}

/**
 * Снять надстройку: вернуть текст генерата (для сверки ассетов с исходником).
 * Обратный порядок замен; каждая обязана найтись ровно `count` раз.
 */
export function stripExportViewerOverrides(patched: string): string {
  let out = patched;
  for (const o of [...EXPORT_VIEWER_OVERRIDES].reverse()) {
    const n = occurrences(out, o.to);
    if (n !== o.count)
      throw new Error(
        `export-viewer-overrides: при снятии «${o.to}» встречен ${n} раз вместо ${o.count} (${o.debt})`,
      );
    out = out.split(o.to).join(o.from);
  }
  return out;
}

/** Метки долгов в тексте просмотрщика — по ним сторож узнаёт надстройку. */
export const EXPORT_VIEWER_OVERRIDE_MARKERS = [D9, D10] as const;
