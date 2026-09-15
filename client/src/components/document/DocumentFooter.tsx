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
 * Беседа 2.4: кнопка «◈ Лог» (открывает ContextLogViewer). Модалка
 * живёт у родителя (SynthesisPage — там события live-обновления),
 * футер получает только onOpenLog; без пропа кнопка не рендерится.
 */
import type { SynthesisFull } from "@philosynth/shared/types/synthesis";

export interface DocumentFooterProps {
  synthesis: SynthesisFull;
  /** Беседа 2.4: открыть модалку лога контекста */
  onOpenLog?: (() => void) | undefined;
}

export function DocumentFooter({ synthesis, onOpenLog }: DocumentFooterProps) {
  const cost = synthesis.totalCostUsd;
  const hasCost =
    typeof cost === "number" &&
    typeof synthesis.totalInputTokens === "number" &&
    typeof synthesis.totalOutputTokens === "number";
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
        {hasCost && (
          <span style={{ color: "var(--gold)" }}>
            Токены: {(synthesis.totalInputTokens as number).toLocaleString("ru")} вх. +{" "}
            {(synthesis.totalOutputTokens as number).toLocaleString("ru")} вых. · Стоимость: $
            {(cost as number).toFixed(4)} ({((cost as number) * 100).toFixed(2)}¢)
          </span>
        )}
      </div>
      <div className="doc-footer-right">
        {onOpenLog && (
          <>
            <button
              type="button"
              className="raw-copy"
              onClick={onOpenLog}
              title="Лог контекста и генерации"
            >
              ◈ Лог
            </button>
            <br />
          </>
        )}
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
