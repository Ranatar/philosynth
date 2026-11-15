/**
 * «Предложить изменение» (беседа 17.2, п.2): форма предложения к адресу
 * обсуждения — из панели адреса (напрямую либо из комментария) и из
 * замечания рецензии. Доступна всем с правом обсуждения; документ ею НЕ
 * меняется — предложение ждёт решения человека с правом правки.
 *
 * Два вида: «готовая замена» (значение поля элемента либо текст подраздела;
 * разделу целиком замену предложить нельзя — сервер 400) и «только
 * замечание» (обоснование; способ исполнения выберет принимающий). Поле
 * замены заполняется ТЕКУЩИМ значением адресата — человек правит его, а не
 * пишет с нуля. Текст подраздела — разметка содержимого, как в виде
 * «Разметка» правки 13.1; сервер чистит её тем же санитайзером.
 */
import { useEffect, useRef, useState } from "react";

import { tl } from "@philosynth/shared/i18n/t";
import type { ProposalKind, ProposalSource } from "@philosynth/shared/constants/proposals";
import type { AddressTarget } from "@philosynth/shared/types/discussion";
import type { Proposal } from "@philosynth/shared/types/proposals";

import { createProposal } from "../../api/proposals";
import { loadCurrentTarget, type CurrentTarget } from "../../utils/proposal-current";
import { fieldLabel, proposalErrorText, replaceFieldsFor } from "../../utils/proposals";

export interface ProposeFormProps {
  synthesisId: string;
  /** Адрес объекта (вид + ключ + id) — у предложения из источника сервер
   *  берёт адрес источника, но форме он нужен для текущего значения */
  address: { kind: string; key: string; id: string | null };
  /** Цель для сервера (как у комментария 16.3); у источника не шлётся */
  target?: AddressTarget | undefined;
  source?: ProposalSource | undefined;
  sourceId?: string | undefined;
  /** Обоснование по умолчанию (текст комментария / замечания-источника) */
  initialRationale?: string | undefined;
  onCreated: (p: Proposal) => void;
  onCancel: () => void;
}

export function ProposeForm({ synthesisId, address, target, source = "direct", sourceId, initialRationale = "", onCreated, onCancel }: ProposeFormProps) {
  const canReplace = address.kind !== "section";
  const [kind, setKind] = useState<ProposalKind>(canReplace ? "replace" : "note");
  const fields = replaceFieldsFor(address.kind);
  const [field, setField] = useState<string>(fields[0] ?? "");
  const [value, setValue] = useState("");
  const [rationale, setRationale] = useState(initialRationale);
  const [current, setCurrent] = useState<CurrentTarget | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const touched = useRef(false);

  // Текущее состояние адресата — один раз на адрес (09 §6, 9.1: под ref от
  // двойного эффекта не нужен — запрос только читает)
  useEffect(() => {
    if (!canReplace) return;
    let cancelled = false;
    setCurrent(undefined);
    setLoadError(null);
    loadCurrentTarget(synthesisId, address)
      .then((c) => {
        if (cancelled) return;
        setCurrent(c);
        if (!touched.current && c) setValue(c.kind === "element" ? (c.fields[fields[0] ?? ""] ?? "") : c.kind === "subsection" ? c.html : "");
      })
      .catch(() => {
        if (!cancelled) {
          setCurrent(null);
          setLoadError(tl("proposals.proposeForm.currentLoadFailed", "Не удалось прочитать текущее значение — замену придётся вписать целиком."));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synthesisId, address.kind, address.key, address.id]);

  const locked = current?.kind === "subsection" ? current.locked : null;
  const gone = canReplace && current === null && !loadError;
  const currentValue = current?.kind === "element" ? (current.fields[field] ?? "") : current?.kind === "subsection" ? current.html : "";
  const unchanged = kind === "replace" && current !== undefined && current !== null && value.trim() === currentValue.trim();

  const submit = async () => {
    if (busyRef.current) return;
    if (kind === "note" && !rationale.trim()) {
      setError(tl("proposals.proposeForm.rationaleRequired", "У замечания обязательно обоснование — это и есть его содержание."));
      return;
    }
    if (kind === "replace" && !value.trim()) {
      setError(tl("proposals.proposeForm.valueRequired", "Впишите предлагаемое значение."));
      return;
    }
    if (unchanged) {
      setError(tl("proposals.proposeForm.valueUnchanged", "Предлагаемое значение совпадает с текущим — менять нечего."));
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const p = await createProposal(synthesisId, {
        ...(source !== "direct" && sourceId ? { source, sourceId } : target ? { target } : {}),
        kind,
        ...(kind === "replace" ? { value, ...(fields.length ? { field } : {}) } : {}),
        ...(rationale.trim() ? { rationale: rationale.trim() } : {}),
      });
      onCreated(p);
    } catch (err) {
      setError(proposalErrorText(err, tl("proposals.proposeForm.createFailed", "Не удалось записать предложение.")));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // класс — переменной до JSX (css-parity: литерал в выражении className)
  const isSubsection = address.kind === "subsection";
  const valueCls = isSubsection ? "form-textarea subsection-edit-source" : "form-textarea";

  return (
    <div className="inline-edit-form proposal-form" data-testid="propose-form" data-proposal-source={source}>
      <div className="form-section-title">{tl("proposals.proposeForm.title", "Предложить изменение")}</div>
      <div className="proposal-note">
        {tl("proposals.proposeForm.lead", "Предложение документ не меняет: его рассмотрит владелец или редактор и, если примет, исполнит планом правок.")}
      </div>
      <div className="proposal-kind-row" role="radiogroup">
        <label className="proposal-kind-option">
          <input type="radio" name="proposal-kind" checked={kind === "replace"} disabled={!canReplace || !!locked || gone || busy} onChange={() => setKind("replace")} data-testid="propose-kind-replace" />
          {tl("proposals.proposeForm.kindReplace", "Готовая замена")}
        </label>
        <label className="proposal-kind-option">
          <input type="radio" name="proposal-kind" checked={kind === "note"} disabled={busy} onChange={() => setKind("note")} data-testid="propose-kind-note" />
          {tl("proposals.proposeForm.kindNote", "Только замечание")}
        </label>
      </div>
      {!canReplace && <div className="proposal-note">{tl("proposals.proposeForm.sectionNoteOnly", "Разделу целиком готовую замену предложить нельзя — только замечание; замену предлагают подразделу или элементу.")}</div>}
      {locked && <div className="proposal-note" data-testid="propose-locked">{tl("proposals.proposeForm.lockedSubsection", "Этот подраздел рисуется из данных — замену текста предложить нельзя ({hint}). Предложите замену элементу таблицы либо оставьте замечание.", { hint: locked })}</div>}
      {gone && <div className="proposal-note">{tl("proposals.proposeForm.targetGone", "Объекта больше нет в документе — предложить можно только замечание.")}</div>}
      {loadError && <div className="proposal-note">{loadError}</div>}

      {kind === "replace" && canReplace && !locked && !gone && (
        <>
          {fields.length > 1 && (
            <>
              <label className="form-label" htmlFor="proposal-field">{tl("proposals.proposeForm.field", "Что заменить")}</label>
              <select
                id="proposal-field"
                className="form-select"
                value={field}
                disabled={busy}
                data-testid="propose-field"
                onChange={(e) => {
                  const f = e.target.value;
                  setField(f);
                  // поле сменили — в форму встаёт его текущее значение
                  if (current?.kind === "element") setValue(current.fields[f] ?? "");
                  touched.current = false;
                }}
              >
                {fields.map((f) => (
                  <option key={f} value={f}>{fieldLabel(f)}</option>
                ))}
              </select>
            </>
          )}
          <label className="form-label" htmlFor="proposal-value">
            {address.kind === "subsection"
              ? tl("proposals.proposeForm.valueSubsection", "Предлагаемый текст подраздела (разметка содержимого)")
              : tl("proposals.proposeForm.valueField", "Предлагаемое значение: {field}", { field: fieldLabel(field) })}
          </label>
          <textarea
            id="proposal-value"
            className={valueCls}
            rows={address.kind === "subsection" ? 12 : 4}
            value={current === undefined ? "" : value}
            placeholder={current === undefined ? tl("common.loading", "Загрузка…") : ""}
            disabled={busy || current === undefined}
            data-testid="propose-value"
            onChange={(e) => {
              touched.current = true;
              setValue(e.target.value);
              setError(null);
            }}
          />
        </>
      )}

      <label className="form-label" htmlFor="proposal-rationale">
        {kind === "note" ? tl("proposals.proposeForm.rationaleNote", "Замечание: что не так и что требуется") : tl("proposals.proposeForm.rationaleReplace", "Обоснование (необязательно)")}
      </label>
      <textarea
        id="proposal-rationale"
        className="form-textarea"
        rows={3}
        value={rationale}
        disabled={busy}
        data-testid="propose-rationale"
        onChange={(e) => {
          setRationale(e.target.value);
          setError(null);
        }}
      />
      {error && <div className="pool-status err" role="alert" data-testid="propose-error">{error}</div>}
      <div className="inline-edit-actions">
        <button type="button" className="action-btn primary" disabled={busy} onClick={() => void submit()} data-testid="propose-submit">
          {busy ? tl("proposals.proposeForm.sending", "Отправка…") : tl("proposals.proposeForm.submit", "Предложить")}
        </button>
        <button type="button" className="action-btn" disabled={busy} onClick={onCancel} data-testid="propose-cancel">
          {tl("common.cancel", "Отмена")}
        </button>
      </div>
    </div>
  );
}
