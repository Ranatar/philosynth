/**
 * Оценка стоимости до генерации. Беседа 1.5 (запрос 1, п. 5; G3).
 *
 * Протокол 07 допускал «estimateCost на сервере ИЛИ клиентскую копию» —
 * выбран СЕРВЕР (POST /syntheses/estimate, беседа 1.5): клиентская копия
 * дублировала бы константы и конфиги Registry (fragment_share,
 * context_budget) с риском дрейфа; сервер зеркалит конвейер 1.1/1.2.
 *
 * Дебаунс 600 мс на изменение параметров (аналог пересчёта #costEstimate
 * исходника при изменениях формы). Сбой оценки не блокирует форму —
 * показывается прочерк (оценка вспомогательна).
 */
import { useEffect, useRef, useState } from "react";

import {
  estimateSynthesis,
  type CreateSynthesisInput,
  type SynthesisEstimate,
} from "../../api/syntheses";

const DEBOUNCE_MS = 600;

export interface CostEstimateProps {
  /** Текущие параметры формы; null — оценивать нечего (нет секций) */
  params: CreateSynthesisInput | null;
}

/** Формат строки — по мотивам #costEstimate исходника */
function fmtEstimate(e: SynthesisEstimate): string {
  const inK = Math.round(e.inTokens / 1000);
  const outK = Math.round(e.outTokens / 1000);
  return `≈ $${e.cost.toFixed(2)} · ${e.passes} проход(ов) · ~${inK}K in / ${outK}K out токенов`;
}

export function CostEstimate({ params }: CostEstimateProps) {
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!params || params.sections.length === 0) {
      setText("");
      setLoading(false);
      return;
    }
    setLoading(true);
    const seq = ++seqRef.current;
    timerRef.current = setTimeout(() => {
      estimateSynthesis(params)
        .then((est) => {
          if (seqRef.current !== seq) return; // устаревший ответ
          setText(fmtEstimate(est));
        })
        .catch(() => {
          if (seqRef.current !== seq) return;
          setText("оценка недоступна");
        })
        .finally(() => {
          if (seqRef.current === seq) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // Пересчёт по сериализованным параметрам — объект создаётся заново
    // на каждый рендер формы
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params ? JSON.stringify(params) : null]);

  if (!text && !loading) return null;
  // Стиль #costEstimate исходника [4110] — inline, как в самом исходнике
  return (
    <div
      style={{
        fontFamily: "var(--mono)",
        fontSize: 9,
        color: "var(--ink-dim)",
        letterSpacing: "0.5px",
        textAlign: "right",
      }}
    >
      {loading ? "оценка…" : text}
    </div>
  );
}
