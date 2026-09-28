/**
 * Хуки языка интерфейса (беседа 11.3, п. 2).
 *
 * useT() — подписка на смену языка: возвращает тот же tl(), но компонент,
 * вызвавший хук, перерисуется при смене языка или приходе каталога
 * (подписка на i18n-store.version). Вне компонентов (утилиты, store) tl()
 * зовётся напрямую — там подписываться нечему. Корень приложения (App)
 * тоже зовёт useT(): его перерисовка тянет всё дерево маршрутов, так что
 * компоненты без хука тоже обновляются; хук в компоненте нужен там, где
 * перерисовка от корня не доходит (memo, портал, собственный кэш).
 */
import { tl } from "@philosynth/shared/i18n/t";

import { useI18nStore, type UiLocale } from "./i18n-store";

export function useT(): typeof tl {
  useI18nStore((s) => s.version);
  return tl;
}

export function useLocale(): UiLocale {
  return useI18nStore((s) => s.locale);
}
