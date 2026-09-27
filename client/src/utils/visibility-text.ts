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
import { tl } from "@philosynth/shared/i18n/t";

/** Порядок ступеней в переключателе — от закрытой к открытой */
export const VISIBILITY_STEPS: readonly SynthesisVisibility[] = [
  "private",
  "showcase",
  "full",
];

export const VISIBILITY_LABELS: Record<SynthesisVisibility, string> = {
  private: tl("utils.visibilityText.private", "Приватная"),
  showcase: tl("utils.visibilityText.showcase", "Витрина"),
  full: tl("utils.visibilityText.public", "Публичная"),
};

/** Короткое пояснение ступени под её кнопкой */
export const VISIBILITY_DESCRIPTIONS: Record<SynthesisVisibility, string> = {
  private: tl("utils.visibilityText.privateHint", "видите только вы"),
  showcase: tl("utils.visibilityText.showcaseHint", "капсула и метаданные — всем, содержание закрыто"),
  full: tl("utils.visibilityText.publicHint", "произведение целиком — всем, включая гостей"),
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
  showAuthor: tl("utils.visibilityText.showAuthorship", "показывать авторство"),
  showLogs: tl("utils.visibilityText.showLogs", "показывать логи генерации"),
  showPrompts: tl("utils.visibilityText.showPrompts", "показывать запросы к модели"),
  allowMeta: tl("utils.visibilityText.allowMeta", "разрешить брать в мета-синтез"),
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
  tl("utils.visibilityText.showcaseFlagsLead", "Логи, запросы к модели и участие в мета-синтезе на витрине не применяются: ") +
  tl("utils.visibilityText.showcaseFlagsTail", "содержание закрыто. Их значения сохранены и вернутся на публичной ступени.");

/** Что увидит посторонний — подпись под переключателем (8.7 п.5d), словами.
 *  Считается через effectiveFlags: действенность, а не сырые значения. */
export function audienceText(flags: VisibilityFlags): string {
  const eff = effectiveFlags(flags);
  if (flags.visibility === "private") {
    return tl("utils.visibilityText.privateSummary", "Концепцию не видит никто, кроме вас: её нет в публичном каталоге и по прямой ссылке.");
  }
  const who = eff.showAuthor ? tl("utils.visibilityText.withYourName", "с вашим именем") : tl("utils.visibilityText.withoutAuthorName", "без имени автора");
  if (flags.visibility === "showcase") {
    return (
      tl("utils.visibilityText.showcaseSummary1", "Посторонний увидит карточку в публичном каталоге и по ссылке — капсулу, ") +
      tl("utils.visibilityText.showcaseSummary2", "метаданные, философов и дату, {who}. Разделы, граф, тезисы, логи и ", { who }) +
      tl("utils.visibilityText.showcaseSummary3", "запросы к модели закрыты; в чужой мета-синтез концепцию взять нельзя. ") +
      tl("utils.visibilityText.showcaseSummary4", "Зарегистрированные видят также стоимость и токены.")
    );
  }
  const parts: string[] = [
    tl("utils.visibilityText.publicSummary", "Посторонний прочтёт документ целиком {who}; гость — без стоимости, токенов, логов и запросов.", { who }),
  ];
  parts.push(
    eff.showLogs
      ? tl("utils.visibilityText.logsOpen", "Зарегистрированным открыты логи генерации.")
      : tl("utils.visibilityText.logsClosed", "Логи генерации закрыты для всех, кроме вас."),
  );
  parts.push(
    eff.showPrompts
      ? tl("utils.visibilityText.promptsOpen", "Зарегистрированные могут скачать запросы к модели.")
      : tl("utils.visibilityText.promptsClosed", "Запросы к модели закрыты для всех, кроме вас."),
  );
  parts.push(
    eff.allowMeta
      ? tl("utils.visibilityText.metaAllowed", "Концепцию можно брать участником в чужой мета-синтез.")
      : tl("utils.visibilityText.metaForbidden", "В чужой мета-синтез концепцию взять нельзя."),
  );
  return parts.join(" ");
}

/** Короткая метка ступени для карточки чужого каталога / полосы просмотра */
export function visibilityBadge(v: SynthesisVisibility): string {
  return v === "showcase" ? tl("utils.visibilityText.badgeShowcase", "витрина") : v === "full" ? tl("utils.visibilityText.badgePublic", "публичная") : tl("utils.visibilityText.badgePrivate", "приватная");
}
