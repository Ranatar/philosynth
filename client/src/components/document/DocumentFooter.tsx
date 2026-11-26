/**
 * Футер документа. Беседа 1.6b (запрос 1, п. 3).
 *
 * Порт разметки .doc-footer [4204–4220] и формата updateFooterCost
 * [5672–5683]: «Токены: N вх. + M вых. · Стоимость: $X.XXXX (Y.YY¢)».
 *
 * РЕШЕНИЕ 1.6 (07, блок решений): стоимость — РОВНО значение
 * synthesis.totalCostUsd из БД; клиент НИЧЕГО не пересчитывает по
 * ставкам модели. Квирк исходника (updateFooterCost считал из токенов
 * по захардкоженным 3/15 $/M) намеренно не переносится.
 *
 * Сессия исходника = docNum (sessionId в [12140] заполняется docNum).
 *
 * Беседа 8.6: токены и стоимость — необязательные поля SynthesisFull
 * (гостю сервер их не отдаёт никогда): строка стоимости рендерится
 * только при определённых значениях. Единственная правка клиента в 8.6 —
 * устранение рассогласования типов, не витрина (та — 8.7).
 *
 * 2026-11-17: подпись «Себестоимость» вместо «Стоимость» — это свойство
 * документа (сумма обращений к модели по ставкам API, кто бы ни платил),
 * а не сумма списания: подписчик платит кредитами, баланс — с наценкой,
 * свой ключ — счётом Anthropic. Пояснение — в title строки.
 *
 * 0022: строка «С вас» — что документ стоил ВОШЕДШЕМУ пользователю
 * (GET /syntheses/:id/charges): кредиты подписки, деньги с баланса,
 * себестоимость по своему ключу, вызовы без списания (доработка после
 * сбоя). У каждого своя: владелец, редакторы и автор принятых предложений
 * платят каждый за свои операции. Ничего не списано — строки нет.
 * Перечитывается, когда меняется итог документа (totalCostUsd).
 *
 * Беседа 2.4: кнопка «◈ Лог» (открывает ContextLogViewer). Модалка
 * живёт у родителя (SynthesisPage — там события live-обновления),
 * футер получает только onOpenLog; без пропа кнопка не рендерится.
 */
import type { SynthesisCharges } from "@philosynth/shared/types/billing";
import type { SynthesisFull } from "@philosynth/shared/types/synthesis";
import { useEffect, useState } from "react";

import { getSynthesisCharges } from "../../api/syntheses";
import { fmtCredits, fmtUsd } from "../../hooks/useBillingView";
import { useAuthStore } from "../../stores/auth-store";
import { tl } from "@philosynth/shared/i18n/t";
import { uiIntlLocale } from "@philosynth/shared/i18n/format";

export interface DocumentFooterProps {
  synthesis: SynthesisFull;
  /** Беседа 2.4: открыть модалку лога контекста */
  onOpenLog?: (() => void) | undefined;
}

/** «С вас: …» — части по способам оплаты; пусто — ничего не списано. */
export function chargesLine(c: SynthesisCharges | null): string {
  if (!c) return "";
  const parts: string[] = [];
  if (c.credits > 0) parts.push(fmtCredits(c.credits));
  if (c.balanceUsd > 0) parts.push(tl("document.documentFooter.chargedBalance", "{usd} с баланса", { usd: fmtUsd(c.balanceUsd) }));
  if (c.byoUsd > 0) parts.push(tl("document.documentFooter.chargedByo", "{usd} по своему ключу", { usd: fmtUsd(c.byoUsd) }));
  if (c.waivedCalls > 0) parts.push(tl("document.documentFooter.chargedWaived", "{n, plural, one {# вызов} few {# вызова} many {# вызовов} other {# вызова}} без списания", { n: c.waivedCalls }));
  return parts.length ? tl("document.documentFooter.chargedLead", "С вас: ") + parts.join(" · ") : "";
}

export function DocumentFooter({ synthesis, onOpenLog }: DocumentFooterProps) {
  const cost = synthesis.totalCostUsd;
  const authenticated = useAuthStore((s) => s.status === "authenticated");
  const [charges, setCharges] = useState<SynthesisCharges | null>(null);
  useEffect(() => {
    if (!authenticated || typeof cost !== "number") {
      setCharges(null);
      return;
    }
    let cancelled = false;
    getSynthesisCharges(synthesis.id)
      .then((c) => {
        if (!cancelled) setCharges(c);
      })
      .catch(() => {
        if (!cancelled) setCharges(null);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, synthesis.id, cost]);
  const charged = chargesLine(charges);
  const hasCost =
    typeof cost === "number" &&
    typeof synthesis.totalInputTokens === "number" &&
    typeof synthesis.totalOutputTokens === "number";
  const footerPhil =
    synthesis.philosophers.length === 0 &&
    synthesis.parentSyntheses.length === 0
      ? tl("common.freeSynthesisLower", "свободный синтез")
      : synthesis.philosophers.join(", ") || "—";

  return (
    <div className="doc-footer">
      <div className="doc-footer-left">
        {tl("document.documentFooter.brandVersion", "PhiloSynth Pro™ · v1.0")}
        <br />
        {tl("document.documentFooter.aiGenerated", "Документ сгенерирован на основе анализа ИИ (Claude)")}
        <br />
        {tl("document.documentFooter.session", "Сессия:")} <span>{synthesis.docNum || "—"}</span>
        <br />
        {hasCost && (
          <span
            style={{ color: "var(--gold)" }}
            title={tl("document.documentFooter.costPriceHint", "Сколько стоили обращения к модели по ставкам API — свойство документа, кто бы за них ни платил. Списание зависит от способа оплаты: подписка — кредиты, баланс — с наценкой, свой ключ — счёт Anthropic.")}
            data-testid="doc-footer-cost"
          >
            {tl("document.documentFooter.tokensCostPrice", "Токены: {totalInputTokens} вх. + {totalOutputTokens} вых. · Себестоимость: ${costUsd} ({costCents}¢)", { totalInputTokens: (synthesis.totalInputTokens as number).toLocaleString(uiIntlLocale()), totalOutputTokens: (synthesis.totalOutputTokens as number).toLocaleString(uiIntlLocale()), costUsd: (cost as number).toFixed(4), costCents: ((cost as number) * 100).toFixed(2) })}
          </span>
        )}
        {charged && (
          <>
            <br />
            <span style={{ color: "var(--gold)" }} data-testid="doc-footer-charged">
              {charged}
            </span>
          </>
        )}
      </div>
      <div className="doc-footer-right">
        {onOpenLog && (
          <>
            <button
              type="button"
              className="raw-copy"
              onClick={onOpenLog}
              title={tl("document.documentFooter.contextLog", "Лог контекста и генерации")}
            >
              {tl("document.documentFooter.logButton", "◈ Лог")}
            </button>
            <br />
          </>
        )}
        {synthesis.status === "ready" && (
          <>
            <div className="validity-stamp">{tl("document.documentFooter.synthesisComplete", "СИНТЕЗ ЗАВЕРШЁН")}</div>
            <br />
          </>
        )}
        {tl("document.documentFooter.philosophers", "Философы:")} <span>{footerPhil}</span>
      </div>
    </div>
  );
}
