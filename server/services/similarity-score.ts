/**
 * Мера сходства двух концепций — чистое ядро (беседа 18.3; 03 §2.22).
 *
 * Модуль-лист: ни БД, ни прав — только счёт по готовым признакам. Признаки
 * собирает services/similarity.ts; он же решает, чьё содержание читать
 * (у витрины множества терминов и категорий сюда приходят ПУСТЫМИ и с
 * `textComparable = false` — здесь их не с чем сравнивать по построению).
 *
 * Правило меры — шапка shared/constants/similarity.ts:
 *   мера = Σ w·J / Σ w по признакам, вошедшим в счёт.
 */
import {
  SIMILARITY_EVIDENCE_FEATURES,
  SIMILARITY_FEATURES,
  SIMILARITY_WEIGHTS,
  type SimilarityFeature,
} from "@philosynth/shared/constants/similarity";

/** Признаки одной концепции. */
export interface SimilarityFeatures {
  /** Ключ самой концепции в «роде»: `id:<uuid>` */
  selfKey: string;
  /** Прямые участники-философы (глубина 1 обхода) */
  philDirect: ReadonlySet<string>;
  /** Философы всей родословной, включая прямых */
  philLineage: ReadonlySet<string>;
  /** Род: сама концепция и её предки-концепции (ключи обхода) */
  kin: ReadonlySet<string>;
  /** Ключи терминов глоссария (лексемы имени словарём языка) */
  terms: ReadonlySet<string>;
  /** Ключи имён категорий */
  categories: ReadonlySet<string>;
  /** Эпохи философов родословной — номера PHILOSOPHER_EPOCHS */
  epochs: ReadonlySet<number>;
  method: string;
  synthLevel: string;
}

export interface SimilarityScore {
  /** Мера 0…1 — только для порядка выдачи и ступени; клиенту не отдаётся */
  score: number;
  /** Есть общий элемент содержательного признака (философ, род, термин,
   *  категория) — без него кандидат в выдачу не идёт */
  evidence: boolean;
  /** Признаки, вошедшие в знаменатель */
  compared: SimilarityFeature[];
  /** Общие элементы по признакам-множествам */
  shared: {
    philDirect: string[];
    philLineage: string[];
    kin: string[];
    terms: string[];
    categories: string[];
    epochs: number[];
  };
  method: boolean;
  synthLevel: boolean;
}

function intersect<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): T[] {
  const out: T[] = [];
  for (const x of a) if (b.has(x)) out.push(x);
  return out;
}

/** Коэффициент Жаккара по числу общих: |A∩B| / |A∪B|; у двух пустых — 0. */
export function jaccard(sizeA: number, sizeB: number, common: number): number {
  const union = sizeA + sizeB - common;
  return union > 0 ? common / union : 0;
}

/**
 * Мера сходства `a` и `b`. `textComparable` — можно ли сравнивать признаки
 * текста (один язык генерации и содержание обеих смотрящему открыто);
 * нельзя — термины и категории НЕ читаются из аргументов вовсе.
 */
export function scoreSimilarity(
  a: SimilarityFeatures,
  b: SimilarityFeatures,
  textComparable: boolean,
): SimilarityScore {
  const shared = {
    philDirect: intersect(a.philDirect, b.philDirect),
    philLineage: intersect(a.philLineage, b.philLineage),
    kin: intersect(a.kin, b.kin),
    terms: textComparable ? intersect(a.terms, b.terms) : [],
    categories: textComparable ? intersect(a.categories, b.categories) : [],
    epochs: intersect(a.epochs, b.epochs).sort((x, y) => x - y),
  };
  const method = a.method === b.method;
  const synthLevel = a.synthLevel === b.synthLevel;

  /* Значение признака 0…1 либо null — признак из меры выбывает (пуст у
   * обеих). Признаки текста не выбывают никогда: несравнимые и пустые
   * дают ноль — несравненное не засчитывается (шапка констант). */
  const set = (x: ReadonlySet<unknown>, y: ReadonlySet<unknown>, common: number): number | null =>
    x.size === 0 && y.size === 0 ? null : jaccard(x.size, y.size, common);
  const value: Record<SimilarityFeature, number | null> = {
    philDirect: set(a.philDirect, b.philDirect, shared.philDirect.length),
    philLineage: set(a.philLineage, b.philLineage, shared.philLineage.length),
    // род всегда содержит саму концепцию: в счёт идёт, когда предок есть хотя бы у одной
    kin: a.kin.size <= 1 && b.kin.size <= 1 ? null : jaccard(a.kin.size, b.kin.size, shared.kin.length),
    terms: textComparable ? jaccard(a.terms.size, b.terms.size, shared.terms.length) : 0,
    categories: textComparable ? jaccard(a.categories.size, b.categories.size, shared.categories.length) : 0,
    epochs: set(a.epochs, b.epochs, shared.epochs.length),
    method: method ? 1 : 0,
    level: synthLevel ? 1 : 0,
  };

  let sum = 0;
  let weight = 0;
  const compared: SimilarityFeature[] = [];
  for (const f of SIMILARITY_FEATURES) {
    const v = value[f];
    if (v === null) continue;
    compared.push(f);
    sum += SIMILARITY_WEIGHTS[f] * v;
    weight += SIMILARITY_WEIGHTS[f];
  }
  const evidence = SIMILARITY_EVIDENCE_FEATURES.some((f) => (value[f] ?? 0) > 0);
  return { score: weight > 0 ? sum / weight : 0, evidence, compared, shared, method, synthLevel };
}
