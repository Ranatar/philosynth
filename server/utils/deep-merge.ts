/**
 * deepMergeUniq — слияние dep-объектов (беседа 1.1).
 * Дословный порт из philosynth.html [5967–5993].
 *
 * Расположение: server/utils/deep-merge.ts (04-code-reuse-map §1.1,
 * 05-file-structure). Из server/services/synthesis-engine.ts функция
 * реэкспортируется (протокол 07, беседа 1.1, п. 1).
 *
 * Семантика (как в исходнике):
 *  - объединяются все секции всех входных карт;
 *  - required-ключи уникализируются с сохранением порядка первого вхождения;
 *  - «повышение»: ключ, попавший в required, удаляется из optional;
 *  - optional-ключи добавляются, только если их нет ни в required, ни в optional.
 */

/** Зависимости одного раздела: {required, optional} ctx-ключи */
export interface SectionDeps {
  required: string[];
  optional: string[];
}

/** Карта зависимостей: sectionKey → {required, optional} */
export type DepsMap = Record<string, SectionDeps>;

/**
 * Вход допускает частичные записи ({required} без {optional} и наоборот) —
 * как в патч-словарях CONTEXT_DEPS_LEVEL/METHOD исходника.
 */
export type PartialDepsMap = Record<string, Partial<SectionDeps>>;

/** Порт deepMergeUniq(...objects) [5967] — логика 1:1. */
export function deepMergeUniq(...objects: PartialDepsMap[]): DepsMap {
  const allSections = new Set(objects.flatMap((o) => Object.keys(o)));
  const result: DepsMap = {};

  for (const section of allSections) {
    let required: string[] = [];
    let optional: string[] = [];

    for (const obj of objects) {
      const entry = obj[section];
      if (!entry) continue;
      const r = entry.required ?? [];
      const opt = entry.optional ?? [];

      for (const k of r) {
        if (!required.includes(k)) required.push(k);
        optional = optional.filter((x) => x !== k); // повышение: уходит из optional
      }
      for (const k of opt) {
        if (!required.includes(k) && !optional.includes(k)) optional.push(k);
      }
    }

    result[section] = { required, optional };
  }

  return result;
}
