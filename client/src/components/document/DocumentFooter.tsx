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
 */
import type { SynthesisFull } from "@philosynth/shared/types/synthesis";

export interface DocumentFooterProps {
  synthesis: SynthesisFull;
}

export function DocumentFooter({ synthesis }: DocumentFooterProps) {
  const cost = synthesis.totalCostUsd;
  const footerPhil =
    synthesis.philosophers.length === 0 &&
    synthesis.parentSyntheses.length === 0
      ? "свободный синтез"
      : synthesis.philosophers.join(", ") || "—";

  return (
    <div className="doc-footer">
      <div className="doc-footer-left">
        PhiloSynth Pro™ · v1.0
        <br />
        Документ сгенерирован на основе анализа ИИ (Claude)
        <br />
        Сессия: <span>{synthesis.docNum || "—"}</span>
        <br />
        <span style={{ color: "var(--gold)" }}>
          Токены: {synthesis.totalInputTokens.toLocaleString("ru")} вх. +{" "}
          {synthesis.totalOutputTokens.toLocaleString("ru")} вых. · Стоимость: $
          {cost.toFixed(4)} ({(cost * 100).toFixed(2)}¢)
        </span>
      </div>
      <div className="doc-footer-right">
        {synthesis.status === "ready" && (
          <>
            <div className="validity-stamp">СИНТЕЗ ЗАВЕРШЁН</div>
            <br />
          </>
        )}
        Философы: <span>{footerPhil}</span>
      </div>
    </div>
  );
}
