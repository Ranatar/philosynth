/**
 * Второй шаг кнопок для НЕОБРАТИМЫХ действий — беседа 12.4 (Д-17), правило
 * 8.4 (образцы: SynthesisCard 8.4, EdgePanel 8.4, TransformPanel 5.5,
 * LineageCandidateBlock 8.5): первый клик «взводит» кнопку — на её месте
 * появляются «Точно …?» + «Отмена» и строка-предупреждение; клик МИМО
 * контейнера (mousedown на document) возвращает первый шаг. window.confirm на
 * необратимом не используется (модальный диалог браузера не стилизуется, не
 * переводится и прерывает поток страницы); на ОБРАТИМЫХ действиях (откат
 * версии, активация версии шаблона, уход с несохранённого) он остаётся.
 *
 * Хук общий для пяти мест 12.4 (остановка генерации, удаление аккаунта,
 * удаление типа каталога, смена роли, удаление API-ключа); прежние образцы
 * держат состояние в своих компонентах — их не переписываем.
 *
 * Снимается только взведённое и не занятое состояние: пока действие
 * исполняется (busy), клик мимо ничего не сбрасывает — иначе «Отмена»
 * исчезла бы посреди запроса.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface SecondStep<K = true> {
  /** Что взведено (у одной кнопки — `true`; у строк списка — ключ строки) */
  armed: K | null;
  arm: (key: K) => void;
  disarm: () => void;
  /** Контейнер, клик вне которого сбрасывает второй шаг */
  ref: React.RefObject<HTMLElement | null>;
}

export function useSecondStep<K = true>(busy = false): SecondStep<K> {
  const [armed, setArmed] = useState<K | null>(null);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (armed === null || busy) return;
    const onDown = (ev: MouseEvent) => {
      const el = ref.current;
      if (el && ev.target instanceof Node && !el.contains(ev.target)) setArmed(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [armed, busy]);

  const arm = useCallback((key: K) => setArmed(key), []);
  const disarm = useCallback(() => setArmed(null), []);
  return { armed, arm, disarm, ref };
}
