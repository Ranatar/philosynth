/**
 * Оценка стоимости до генерации. Беседа 1.5 (запрос 1, п. 5; G3).
 *
 * Протокол 07 допускал «estimateCost на сервере ИЛИ клиентскую копию» —
 * выбран СЕРВЕР (POST /syntheses/estimate, беседа 1.5): клиентская копия
 * дублировала бы константы и конфиги Registry (fragment_share,
 * context_budget) с риском дрейфа; сервер зеркалит конвейер 1.1/1.2.
 *
 * 2026-11-17: подпись по способу оплаты (useBillingView): BYO-ключ —
 * себестоимость, баланс — с наценкой, подписка — кредиты и остаток.
 *
 * Дебаунс 600 мс на изменение параметров (аналог пересчёта #costEstimate
 * исходника при изменениях формы). Сбой оценки не блокирует форму —
 * показывается прочерк (оценка вспомогательна).
 */
import { useEffect, useRef, useState } from "react";

import {
  estimateSynthesisFull,
  type CreateSynthesisInput,
  type SynthesisEstimate,
} from "../../api/syntheses";
import { chargeLine, useBillingView } from "../../hooks/useBillingView";
import { tl } from "@philosynth/shared/i18n/t";

const DEBOUNCE_MS = 600;

export interface CostEstimateProps {
  /** Текущие параметры формы; null — оценивать нечего (нет секций) */
  params: CreateSynthesisInput | null;
}

/** Технические числа оценки — по мотивам #costEstimate исходника */
function fmtEstimateTech(e: SynthesisEstimate): string {
  const inK = Math.round(e.inTokens / 1000);
  const outK = Math.round(e.outTokens / 1000);
  return tl("synthesis.costEstimate.estimateTech", "{passes, plural, one {# проход} few {# прохода} many {# проходов} other {# прохода}} · ~{inK}K in / {outK}K out токенов", { passes: e.passes, inK, outK });
}

export function CostEstimate({ params }: CostEstimateProps) {
  const [text, setText] = useState<string>("");
  const [est, setEst] = useState<{ e: SynthesisEstimate; credits?: number | undefined } | null>(null);
  const view = useBillingView();
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!params || params.sections.length === 0) {
      setText("");
      setEst(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const seq = ++seqRef.current;
    timerRef.current = setTimeout(() => {
      estimateSynthesisFull(params)
        .then((r) => {
          if (seqRef.current !== seq) return; // устаревший ответ
          setEst({ e: r.estimate, credits: r.credits });
          setText("");
        })
        .catch(() => {
          if (seqRef.current !== seq) return;
          setEst(null);
          setText(tl("synthesis.costEstimate.unavailable", "оценка недоступна"));
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

  if (!text && !est && !loading) return null;
  const shown = est
    ? `${chargeLine(view, { usd: est.e.cost, credits: est.credits })} · ${fmtEstimateTech(est.e)}`
    : text;
  // Стиль #costEstimate исходника [4110] — inline, как в самом исходнике
  return (
    <div
      data-testid="cost-estimate"
      style={{
        fontFamily: "var(--mono)",
        fontSize: 9,
        color: "var(--ink-dim)",
        letterSpacing: "0.5px",
        textAlign: "right",
      }}
    >
      {loading ? tl("synthesis.costEstimate.estimating", "оценка…") : shown}
    </div>
  );
}
