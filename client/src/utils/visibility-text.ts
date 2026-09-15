/**
 * Тексты ступеней публичности для интерфейса (беседа 8.7).
 *
 * Модель — 8.6 (02 §2.3, 03 §2.2, shared/utils/visibility): три ступени
 * private / showcase / full и четыре флага автора; showLogs, showPrompts,
 * allowMeta действуют ТОЛЬКО на 'full', showAuthor — на обеих неприватных.
 * Стоимость и токены флагом не управляются: зарегистрированный видит их у
 * любой неприватной концепции, гость — никогда.
 *
 * Здесь собрано всё, что переключатель в карточке каталога (VisibilityControl)
 * и полоса режима просмотра (SynthesisPage) говорят словами: подписи ступеней,
 * подписи галочек и «что увидит посторонний» — чтобы карточка и документ не
 * расходились в формулировках. Логики действенности здесь нет — только
 * effectiveFlags из shared.
 */
import type {
  SynthesisVisibility,
  VisibilityFlags,
} from "@philosynth/shared/types/synthesis";
import { effectiveFlags } from "@philosynth/shared/utils/visibility";

/** Порядок ступеней в переключателе — от закрытой к открытой */
export const VISIBILITY_STEPS: readonly SynthesisVisibility[] = [
  "private",
  "showcase",
  "full",
];

export const VISIBILITY_LABELS: Record<SynthesisVisibility, string> = {
  private: "Приватная",
  showcase: "Витрина",
  full: "Публичная",
};

/** Короткое пояснение ступени под её кнопкой */
export const VISIBILITY_DESCRIPTIONS: Record<SynthesisVisibility, string> = {
  private: "видите только вы",
  showcase: "капсула и метаданные — всем, содержание закрыто",
  full: "произведение целиком — всем, включая гостей",
};

/** Ключи флагов и порядок галочек в переключателе */
export type VisibilityFlagKey = Exclude<keyof VisibilityFlags, "visibility">;

export const FLAG_ORDER: readonly VisibilityFlagKey[] = [
  "showAuthor",
  "showLogs",
  "showPrompts",
  "allowMeta",
];

export const FLAG_LABELS: Record<VisibilityFlagKey, string> = {
  showAuthor: "показывать авторство",
  showLogs: "показывать логи генерации",
  showPrompts: "показывать запросы к модели",
  allowMeta: "разрешить брать в мета-синтез",
};

/** Какие галочки ПОКАЗЫВАТЬ на ступени (8.7 п.5b): на витрине — только
 *  авторство; три остальные там ПРЯЧУТСЯ (не рисуются неработающими), а
 *  сохранённые значения не трогаются — вернув «Публичную», человек получает
 *  прежние галочки. На приватной галочек нет: её видит только владелец. */
export function flagsShownFor(
  visibility: SynthesisVisibility,
): readonly VisibilityFlagKey[] {
  if (visibility === "full") return FLAG_ORDER;
  if (visibility === "showcase") return ["showAuthor"];
  return [];
}

/** Строка-пояснение под галочками витрины (8.7 п.5b) */
export const SHOWCASE_FLAGS_NOTE =
  "Логи, запросы к модели и участие в мета-синтезе на витрине не применяются: " +
  "содержание закрыто. Их значения сохранены и вернутся на публичной ступени.";

/** Что увидит посторонний — подпись под переключателем (8.7 п.5d), словами.
 *  Считается через effectiveFlags: действенность, а не сырые значения. */
export function audienceText(flags: VisibilityFlags): string {
  const eff = effectiveFlags(flags);
  if (flags.visibility === "private") {
    return "Концепцию не видит никто, кроме вас: её нет в публичном каталоге и по прямой ссылке.";
  }
  const who = eff.showAuthor ? "с вашим именем" : "без имени автора";
  if (flags.visibility === "showcase") {
    return (
      `Посторонний увидит карточку в публичном каталоге и по ссылке — капсулу, ` +
      `метаданные, философов и дату, ${who}. Разделы, граф, тезисы, логи и ` +
      `запросы к модели закрыты; в чужой мета-синтез концепцию взять нельзя. ` +
      `Зарегистрированные видят также стоимость и токены.`
    );
  }
  const parts: string[] = [
    `Посторонний прочтёт документ целиком ${who}; гость — без стоимости, токенов, логов и запросов.`,
  ];
  parts.push(
    eff.showLogs
      ? "Зарегистрированным открыты логи генерации."
      : "Логи генерации закрыты для всех, кроме вас.",
  );
  parts.push(
    eff.showPrompts
      ? "Зарегистрированные могут скачать запросы к модели."
      : "Запросы к модели закрыты для всех, кроме вас.",
  );
  parts.push(
    eff.allowMeta
      ? "Концепцию можно брать участником в чужой мета-синтез."
      : "В чужой мета-синтез концепцию взять нельзя.",
  );
  return parts.join(" ");
}

/** Короткая метка ступени для карточки чужого каталога / полосы просмотра */
export function visibilityBadge(v: SynthesisVisibility): string {
  return v === "showcase" ? "витрина" : v === "full" ? "публичная" : "приватная";
}
