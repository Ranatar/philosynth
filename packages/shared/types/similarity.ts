/**
 * Похожие концепции (беседа 18.3) — DTO маршрута
 * `GET /syntheses/:id/similar` (03 §2.22).
 *
 * Числа меры здесь НЕТ и быть не должно (решение пользователя: сходство —
 * словами и причинами, не числом с десятыми): сервер отдаёт ступень
 * (`grade`) и причины, порядок выдачи — по убыванию меры.
 */
import type {
  SimilarityGrade,
  SimilarityKinKind,
  SimilarityTextSkipReason,
} from "../constants/similarity.js";
import type { SynthesisPreview } from "./synthesis.js";

/** Общий предок-концепция. */
export interface SimilarAncestor {
  /** id концепции-предка со строкой в БД (ссылка «её потомки в
   *  каталоге»); у снимка из дерева импортированного файла поля нет.
   *  Предок, смотрящему НЕ видимый, в список не входит вовсе — он только
   *  сосчитан в `ancestorsTotal` */
  id?: string;
  /** Название: из БД либо имя узла дерева файла */
  title: string;
}

/**
 * Почему концепция похожа. Всё — машинные значения и текст документа:
 * имена философов (как в `PHILOSOPHERS`), названия, термины и имена
 * категорий так, как они записаны У ЭТОЙ (исходной) концепции. Клиент
 * рисует их экранированным текстом (как фрагмент поиска 18.2).
 */
export interface SimilarityReasons {
  /** Общие ПРЯМЫЕ участники-философы */
  philosophers: string[];
  /** Общие философы по родословной СВЕРХ прямых (через предков) */
  lineagePhilosophers: string[];
  /** Общие предки-концепции (не более SIMILAR_REASON_ITEMS_MAX) */
  ancestors: SimilarAncestor[];
  ancestorsTotal: number;
  /** Прямое родство: кандидат — предок либо потомок этой концепции */
  kin: SimilarityKinKind | null;
  /** Общие термины глоссария (не более SIMILAR_REASON_ITEMS_MAX) */
  terms: string[];
  termsTotal: number;
  /** Общие имена категорий (не более SIMILAR_REASON_ITEMS_MAX) */
  categories: string[];
  categoriesTotal: number;
  /** Общие эпохи философов — номера в PHILOSOPHER_EPOCHS с нуля */
  epochs: number[];
  /** Совпал метод синтеза / уровень синтеза */
  method: boolean;
  synthLevel: boolean;
}

/** Строка выдачи: превью каталога + мера словами + причины. */
export interface SimilarSynthesisItem extends SynthesisPreview {
  similarity: {
    grade: SimilarityGrade;
    reasons: SimilarityReasons;
    /** Сравнивались ли термины и категории; нет — почему: другой язык
     *  генерации (`language`) либо содержание одной из концепций
     *  смотрящему закрыто (`closed` — витрина) */
    textCompared: boolean;
    textSkipped?: SimilarityTextSkipReason;
  };
}

/** Ответ `GET /syntheses/:id/similar`. */
export interface SimilarSynthesesResponse {
  items: SimilarSynthesisItem[];
  /** Сработал потолок кандидатов (SIMILAR_CANDIDATE_CAP): мера посчитана
   *  не по всему видимому каталогу, а по кандидатам с наибольшим числом
   *  общего */
  capped: boolean;
  /** Открыто ли смотрящему содержание самой концепции (нет — она витрина:
   *  термины и категории не сравнивались ни с кем) */
  sourceContentOpen: boolean;
}
