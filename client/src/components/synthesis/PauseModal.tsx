/**
 * Модалка паузы (беседа 1.4b; 01-architecture §4.12 п.6–7,
 * 05-file-structure client/components/synthesis/PauseModal.tsx).
 *
 * Порт showPauseModal [24700] и четырёх рендереров исходника:
 *  - _renderPauseContent_gen / _renderPauseFooter_gen [24769/24838]
 *    (partial и pre-stream ветки; действия fill-missing-subs / retry /
 *    skip / stop с оценками стоимости на кнопках);
 *  - _renderPauseContent_plan / _renderPauseFooter_plan [24908];
 *  - _renderPauseContent_billing / _renderPauseFooter_billing [24960]
 *    (ссылка на console.anthropic.com, «ключ менять не нужно»);
 *  - _renderPauseContent_auth [24998];
 * плюс бейдж паузы в шапке (_showPauseBadge [24660]) — экспорт PauseBadge.
 *
 * Адаптации (задокументированные отступления от исходника):
 *  - оценки стоимости приходят пропсом estimates (generation_paused §3.2 /
 *    GET /syntheses/:id + WS) — на клиенте _computeGenPauseEstimates не
 *    вычисляется (серверный аналог — pause-resume-service);
 *  - partialSubsections в shared-типе — имена без chars (решение 1.4):
 *    список успевших подразделов показывается без размеров;
 *  - costHint «оценочная стоимость продолжения» [24801] опущен — те же
 *    числа несут кнопки (skipRemaining/wholeSection/fillMissingSubs);
 *  - auth-рендерер: форма ввода нового ключа — порт _resumeWithNewApiKey
 *    [25028] СДЕЛАН беседой 6.2 (долг §12 «Форма ввода ключа в
 *    auth-модалке»): ключ сохраняется POST /billing/api-key (BYO-Key 6.1,
 *    становится активным), затем resume 'retry' — resolveBilling под
 *    слотом возьмёт новый ключ; сброс reasonKind → 'pre-stream' исходника
 *    не нужен: сервер переопределяет режим/ключ при каждом resume
 *    («По факту 6.1» п.3). Отступление от «модалка не ходит в API сама»
 *    (1.4b): ОДИН вызов storeApiKey здесь — иначе форму пришлось бы
 *    прокидывать через три хоста; кнопки «Повторить» (ключ уже заменён
 *    на странице биллинга) и «Остановить» сохранены;
 *  - confirm деградации зависимостей при skip [25686] — реализовано в
 *    2.2: сервер кладёт skipDegrades (потребители пропускаемых по
 *    effectiveDeps, computeSkipDegrades) в pausedState и
 *    generation_paused; модалка показывает window.confirm перед skip.
 *
 * Интеграция в страницы (SynthesisPage/GenerationProgress) — беседа 1.5:
 * компонент управляется пропсами и не ходит в API сам.
 *
 * Правка 2026-09-02 (единство стилей с исходником): разметка приведена
 * к #pauseOverlay [4366] — .pause-overlay.visible > .pause-modal >
 * .pause-modal-header (.pause-modal-title + .pause-modal-close),
 * .pause-modal-body (.pause-info-box / .pause-reason-box / .pause-subtle),
 * .pause-modal-footer (.pause-btn .primary/.danger/.ghost); бейдж —
 * .progress-pause-badge.visible.
 */
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";
import type {
  PausedState,
  PausedStateGen,
  PausedStatePlan,
} from "@philosynth/shared/types/synthesis";
import type {
  PauseEstimates,
  ResumeGenerationMode,
  ResumePlanMode,
} from "@philosynth/shared/types/ws-messages";
import { useState } from "react";

import { storeApiKey } from "../../api/billing";
import { ApiError } from "../../api/client";
import { tl } from "@philosynth/shared/i18n/t";
import { tData } from "@philosynth/shared/i18n/data";

const LABELS = KEY_LABELS as Record<string, string>;

/** Порт _fmtCost [24666]: форматирование оценки для кнопки. */
export function fmtCost(cost: number | null | undefined): string {
  if (cost == null) return "";
  if (cost === 0) return "$0";
  if (cost < 0.01) return "≈ " + (cost * 100).toFixed(2) + "¢";
  return "≈ $" + cost.toFixed(3);
}

/* ── Мелкие блоки разметки (аналог css-классов pause-* исходника) ────── */

function ReasonBox({ reason }: { reason: string }) {
  return <div className="pause-reason-box">{reason}</div>;
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return <div className="pause-info-box">{children}</div>;
}

function Subtle({ children }: { children: React.ReactNode }) {
  return <p className="pause-subtle">{children}</p>;
}

type BtnKind = "primary" | "default" | "danger";

function PauseBtn({
  kind = "default",
  title,
  onClick,
  children,
}: {
  kind?: BtnKind;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const byKind: Record<BtnKind, string> = {
    primary: "pause-btn primary",
    default: "pause-btn",
    danger: "pause-btn danger",
  };
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={byKind[kind]}
    >
      {children}
    </button>
  );
}

function CostSpan({ cost, prefix }: { cost: number | null | undefined; prefix?: string }) {
  const s = fmtCost(cost);
  if (!s) return null;
  return (
    <span className="pause-subtle"> ({prefix ? `${prefix} ` : ""}{s})</span>
  );
}

/* ── gen: основная генерация прервана [24769] ────────────────────────── */

function completedListOf(ps: PausedStateGen): string {
  return (
    (ps.completedPasses ?? [])
      .map((keys) => keys.map((k) => tData(LABELS[k] ?? k)).join(" + "))
      .join(", ") || "—"
  );
}

function GenContent({ ps }: { ps: PausedStateGen }) {
  const completedCount = (ps.completedPasses ?? []).length;
  const completedList = completedListOf(ps);
  const completedWord = completedCount === 1 ? tl("synthesis.pauseModal.sectionWord", "раздел") : tl("common.sectionsGen", "разделов");

  if (ps.isPartial) {
    // Partial: единая ветка для любых причин обрыва (сеть, max-tokens,
    // stuck) — основная стратегия одинакова [24817]
    const done = ps.partialSubsections ?? [];
    const expected = ps.expectedSubsections ?? [];
    const missing = expected.filter((s) => !done.includes(s));
    const causeHint =
      ps.reasonKind === "max-tokens"
        ? tl("synthesis.pauseModal.maxTokensExceeded", " (превышен лимит max_tokens = {maxTokensUsed})", { maxTokensUsed: (ps.maxTokensUsed ?? 20000).toLocaleString("ru") })
        : ps.reasonKind === "stuck"
          ? tl("synthesis.pauseModal.streamStuck", " (стрим завис без ответа)")
          : "";
    return (
      <div className="pause-content">
        <p>
          {tl("synthesis.pauseModal.sectionGeneration", "Генерация раздела")} <strong>{ps.sectionLabel}</strong> {tl("synthesis.pauseModal.brokeOff", "оборвалась{causeHint} — успело сгенерироваться", { causeHint })}
          <strong>
            {tl("synthesis.pauseModal.countOf", "{doneCount} из {expectedCount}", { doneCount: done.length, expectedCount: expected.length })}
          </strong>{tl("synthesis.pauseModal.subsectionsDot", "подразделов.")}
        </p>
        <ReasonBox reason={ps.reason} />
        <InfoBox>
          <strong>{tl("synthesis.pauseModal.completedEarlier", "Завершено ранее:")}</strong> {completedCount} {completedWord}
          {completedCount > 0 && (
            <>
              <br />
              <em className="pause-subtle">{completedList}</em>
            </>
          )}
          <br />
          <strong>{tl("synthesis.pauseModal.interruptedAt", "Прервано на:")}</strong> {ps.sectionLabel}
          {done.length > 0 && (
            <>
              <br />
              <strong>{tl("synthesis.pauseModal.doneSubsections", "Успевшие подразделы:")}</strong>
              {done.map((s) => (
                <span key={s}>
                  <br />• <strong>{s}</strong>
                </span>
              ))}
            </>
          )}
          {missing.length > 0 && (
            <>
              <br />
              <strong>{tl("synthesis.pauseModal.missing", "Недостающие:")}</strong>
              {missing.map((s) => (
                <span key={s}>
                  <br />• {s}
                </span>
              ))}
            </>
          )}
        </InfoBox>
        <Subtle>
          {tl("synthesis.pauseModal.recommendedLead", "Рекомендуется")} <strong>{tl("synthesis.pauseModal.generateRemaining", "догенерировать")}</strong> {tl("synthesis.pauseModal.onlyMissingNote", "только недостающие подразделы — они будут созданы по очереди с учётом уже готовых подразделов как контекста. Это дешевле перегенерации всего раздела.")}
        </Subtle>
      </div>
    );
  }

  // Pre-stream: ничего не сгенерировано в прерванном разделе [24825]
  return (
    <div className="pause-content">
      <p>
        {tl("synthesis.pauseModal.sectionGeneration", "Генерация раздела")} <strong>{ps.sectionLabel}</strong> {tl("synthesis.pauseModal.couldNotStart", "не смогла начаться — запрос к API не прошёл после 3 попыток.")}
      </p>
      <ReasonBox reason={ps.reason} />
      <InfoBox>
        <strong>{tl("synthesis.pauseModal.completedEarlier", "Завершено ранее:")}</strong> {completedCount} {completedWord}
        {completedCount > 0 && (
          <>
            <br />
            <em className="pause-subtle">{completedList}</em>
          </>
        )}
        <br />
        <strong>{tl("synthesis.pauseModal.interruptedAt", "Прервано на:")}</strong> {ps.sectionLabel}
      </InfoBox>
      <Subtle>
        {tl("synthesis.pauseModal.possibleCauses", "Возможные причины: перегрузка API, проблемы с сетью, превышение лимита. Попробуйте ещё раз через несколько минут.")}
      </Subtle>
    </div>
  );
}

function GenFooter({
  ps,
  estimates,
  onResume,
}: {
  ps: PausedStateGen;
  estimates: PauseEstimates;
  onResume: (mode: ResumeGenerationMode) => void;
}) {
  if (ps.isPartial) {
    return (
      <>
        <PauseBtn
          kind="primary"
          title={tl("synthesis.pauseModal.continueHint", "Продолжить раздел с обрывочного подраздела (самое экономное)")}
          onClick={() => onResume("fill-missing-subs")}
        >
          {tl("synthesis.pauseModal.generateMissing", "🎯 Догенерировать недостающие")}
          <CostSpan cost={estimates.fillMissingSubs} />
        </PauseBtn>
        <PauseBtn
          title={tl("synthesis.pauseModal.restartHint", "Очистить частичный контент и начать раздел заново")}
          onClick={() => onResume("retry")}
        >
          {tl("synthesis.pauseModal.restartSection", "↻ Весь раздел заново")}
          <CostSpan cost={estimates.wholeSection} />
        </PauseBtn>
        <PauseBtn
          title={tl("synthesis.pauseModal.skipHint", "Оставить частичный контент, продолжить со следующего раздела (оценка — стоимость оставшихся разделов)")}
          onClick={() => onResume("skip")}
        >
          {tl("synthesis.pauseModal.skip", "⤴ Пропустить")}
          <CostSpan cost={estimates.skipRemaining} prefix={tl("synthesis.pauseModal.next", "далее")} />
        </PauseBtn>
        <PauseBtn
          kind="danger"
          title={tl("synthesis.pauseModal.stopHint", "Сохранить текущее состояние как финальное, завершить")}
          onClick={() => onResume("stop")}
        >
          {tl("synthesis.pauseModal.stop", "◼ Остановить")}
        </PauseBtn>
      </>
    );
  }
  return (
    <>
      <PauseBtn
        kind="primary"
        title={tl("synthesis.pauseModal.retryHint", "Повторить запрос на этот раздел")}
        onClick={() => onResume("retry")}
      >
        {tl("synthesis.pauseModal.retryNow", "↻ Повторить сейчас")}
        <CostSpan cost={estimates.wholeSection} />
      </PauseBtn>
      <PauseBtn
        title={tl("synthesis.pauseModal.skipSectionHint", "Пропустить этот раздел, продолжить со следующего (оценка — остальные разделы)")}
        onClick={() => onResume("skip")}
      >
        {tl("synthesis.pauseModal.skip", "⤴ Пропустить")}
        <CostSpan cost={estimates.skipRemaining} prefix={tl("synthesis.pauseModal.next", "далее")} />
      </PauseBtn>
      <PauseBtn
        kind="danger"
        title={tl("synthesis.pauseModal.stopHint", "Сохранить текущее состояние как финальное, завершить")}
        onClick={() => onResume("stop")}
      >
        {tl("synthesis.pauseModal.stop", "◼ Остановить")}
      </PauseBtn>
    </>
  );
}

/* ── plan: план редактирования прерван [24908] ───────────────────────── */

interface PlanOp {
  action?: string;
  key?: string;
}

function planOpLabel(op: PlanOp | null | undefined): string {
  if (!op) return "—";
  const prefix =
    op.action === "add"
      ? tl("synthesis.pauseModal.stepAdd", "Добавление: ")
      : op.action === "remove"
        ? tl("synthesis.pauseModal.stepDelete", "Удаление: ")
        : tl("synthesis.pauseModal.stepRegenerate", "Перегенерация: ");
  const key = op.key ?? "?";
  return prefix + tData(LABELS[key] ?? key);
}

function PlanContent({ ps }: { ps: PausedStatePlan }) {
  const op = ps.failedOp as PlanOp | undefined;
  const remaining = (ps.remainingOps ?? []) as PlanOp[];
  const remainingLabels = remaining
    .slice(0, 5)
    .map(
      (o) =>
        (o.action === "add" ? "➕ " : o.action === "remove" ? "✕ " : "↻ ") +
        tData(LABELS[o.key ?? ""] ?? o.key ?? "?"),
    )
    .join(", ");
  const moreHint =
    remaining.length > 5 ? tl("synthesis.pauseModal.andMore", " и ещё ") + (remaining.length - 5) : "";
  const stepsWord = remaining.length === 1 ? tl("synthesis.pauseModal.stepOne", "шаг") : tl("synthesis.pauseModal.stepMany", "шагов");
  return (
    <div className="pause-content">
      <p>
        {tl("synthesis.pauseModal.planStoppedAt", "План редактирования остановлен на шаге")}
        <strong>
          {tl("synthesis.pauseModal.countOf", "{doneCount} из {expectedCount}", { doneCount: ps.stepIdx + 1, expectedCount: ps.totalSteps })}
        </strong>
        .
      </p>
      <ReasonBox reason={ps.reason} />
      <InfoBox>
        <strong>{tl("synthesis.pauseModal.failedStep", "Упавший шаг:")}</strong> {planOpLabel(op)}
        <br />
        <strong>{tl("synthesis.pauseModal.remaining", "Осталось:")}</strong> {remaining.length} {stepsWord}
        {remaining.length > 0 && (
          <>
            <br />
            <em className="pause-subtle">
              {remainingLabels}
              {moreHint}
            </em>
          </>
        )}
      </InfoBox>
      <Subtle>
        {tl("synthesis.pauseModal.previousApplied", "Изменения предыдущих шагов уже применены к документу. Выберите действие:")}
      </Subtle>
    </div>
  );
}

function PlanFooter({
  onResume,
}: {
  onResume: (mode: ResumePlanMode) => void;
}) {
  return (
    <>
      <PauseBtn
        kind="primary"
        title={tl("synthesis.pauseModal.retryStepHint", "Повторить текущий шаг и продолжить")}
        onClick={() => onResume("retry")}
      >
        {tl("synthesis.pauseModal.retryStep", "↻ Повторить шаг")}
      </PauseBtn>
      <PauseBtn
        title={tl("synthesis.pauseModal.skipStepHint", "Пропустить текущий шаг и продолжить со следующего")}
        onClick={() => onResume("skip_step")}
      >
        {tl("synthesis.pauseModal.skipStep", "⤴ Пропустить шаг")}
      </PauseBtn>
      <PauseBtn
        kind="danger"
        title={tl("synthesis.pauseModal.stopPlanHint", "Остановить план, очистить остаток")}
        onClick={() => onResume("stop")}
      >
        {tl("synthesis.pauseModal.stopPlan", "◼ Остановить план")}
      </PauseBtn>
    </>
  );
}

/* ── billing: баланс API исчерпан [24960] ────────────────────────────── */

function BillingContent({ ps }: { ps: PausedStateGen }) {
  const completedCount = (ps.completedPasses ?? []).length;
  const completedList = (ps.completedPasses ?? [])
    .map((keys) => keys.join("+"))
    .join(", ");
  const completedWord = completedCount === 1 ? tl("synthesis.pauseModal.sectionWord", "раздел") : tl("common.sectionsGen", "разделов");
  return (
    <div className="pause-content">
      <p>
        {tl("synthesis.pauseModal.pausedLead", "Генерация приостановлена:")} <strong>{tl("synthesis.pauseModal.balanceExhausted", "баланс API исчерпан")}</strong>.
      </p>
      <ReasonBox reason={ps.reason || "credit balance too low"} />
      <InfoBox>
        <strong>{tl("synthesis.pauseModal.completedBeforePause", "Завершено до паузы:")}</strong> {completedCount} {completedWord}
        {completedCount > 0 && (
          <>
            <br />
            <em className="pause-subtle">{completedList}</em>
          </>
        )}
        <br />
        <strong>{tl("synthesis.pauseModal.interruptedAt", "Прервано на:")}</strong> {ps.sectionLabel || "?"}
      </InfoBox>
      <Subtle>
        {tl("synthesis.pauseModal.topUpLead", "Пополните баланс на")}
        <a
          href="https://console.anthropic.com/settings/billing"
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--gold)" }}
        >
          {tl("synthesis.pauseModal.consoleUrl", "console.anthropic.com")}
        </a>
        {tl("synthesis.pauseModal.thenPress", ", затем нажмите")} <strong>{tl("synthesis.pauseModal.continueQuoted", "«Продолжить»")}</strong>{tl("synthesis.pauseModal.keyStillValid", ". API-ключ менять не нужно — он действителен.")}
      </Subtle>
    </div>
  );
}

function BillingFooter({
  onResume,
}: {
  onResume: (mode: ResumeGenerationMode) => void;
}) {
  return (
    <>
      <PauseBtn
        kind="primary"
        title={tl("synthesis.pauseModal.retryAfterTopUp", "Повторить запрос после пополнения баланса")}
        onClick={() => onResume("retry")}
      >
        {tl("synthesis.pauseModal.continue", "▶ Продолжить")}
      </PauseBtn>
      <PauseBtn
        title={tl("synthesis.pauseModal.skipCurrentSection", "Пропустить текущий раздел")}
        onClick={() => onResume("skip")}
      >
        {tl("synthesis.pauseModal.skip", "⤴ Пропустить")}
      </PauseBtn>
      <PauseBtn
        kind="danger"
        title={tl("synthesis.pauseModal.saveCurrentState", "Сохранить текущее состояние")}
        onClick={() => onResume("stop")}
      >
        {tl("synthesis.pauseModal.stop", "◼ Остановить")}
      </PauseBtn>
    </>
  );
}

/* ── auth: API-ключ недействителен [24998] ───────────────────────────── */

interface AuthKeyForm {
  value: string;
  setValue: (v: string) => void;
  pending: boolean;
  error: string | null;
}

function AuthContent({ ps, form }: { ps: PausedState; form: AuthKeyForm }) {
  const context =
    ps.kind === "gen" ? (
      <>
        {tl("synthesis.pauseModal.atSection", "на разделе")} <strong>{ps.sectionLabel || "—"}</strong>
      </>
    ) : (
      <>
        {tl("synthesis.pauseModal.atStep", "на шаге")} <strong>{ps.stepIdx + 1}</strong> {tl("synthesis.pauseModal.ofTotal", "из {totalSteps}", { totalSteps: ps.totalSteps })}
      </>
    );
  return (
    <div className="pause-content">
      {/* 11.3 (п. 6): JSX-элемент в подстановке tl() невозможен — строка
          разбита на две части вокруг элемента (<strong> внутри context) */}
      <p>
        {tl("synthesis.pauseModal.keyInvalidLead", "API-ключ Anthropic недействителен или истёк. Генерация остановлена")}{" "}
        {context}.
      </p>
      <ReasonBox reason={ps.reason} />
      <p>
        {tl("synthesis.pauseModal.enterNewKey", "Введите новый ключ — он будет сохранён как ваш ключ (BYO-Key), и генерация продолжится с прерванного места:")}
      </p>
      <div className="pause-apikey-row">
        <input
          type="password"
          autoComplete="off"
          placeholder={tl("synthesis.pauseModal.keyPlaceholder", "sk-ant-api...")}
          aria-label={tl("synthesis.pauseModal.newKeyLabel", "Новый API-ключ Anthropic")}
          value={form.value}
          disabled={form.pending}
          onChange={(e) => form.setValue(e.target.value)}
          data-testid="pause-new-api-key"
        />
      </div>
      {form.error && (
        <div className="pause-reason-box" role="alert" data-testid="pause-api-key-error">
          {form.error}
        </div>
      )}
      <Subtle>
        {tl("synthesis.pauseModal.keyReplacedNote", "Если ключ уже заменён на странице «Биллинг» — нажмите «Повторить». Если нового ключа нет — выберите «Остановить»: текущее состояние будет сохранено, и вы сможете возобновить позже.")}
      </Subtle>
    </div>
  );
}

function AuthFooter({
  ps,
  form,
  onSaveKey,
  onResumeGeneration,
  onResumePlan,
}: {
  ps: PausedState;
  form: AuthKeyForm;
  onSaveKey: () => void;
  onResumeGeneration: (mode: ResumeGenerationMode) => void;
  onResumePlan: (mode: ResumePlanMode) => void;
}) {
  const retry = (): void =>
    ps.kind === "plan" ? onResumePlan("retry") : onResumeGeneration("retry");
  const stop = (): void =>
    ps.kind === "plan" ? onResumePlan("stop") : onResumeGeneration("stop");
  const hasKey = form.value.trim().length > 0;
  return (
    <>
      <button
        type="button"
        className="pause-btn primary"
        title={tl("synthesis.pauseModal.saveKeyHint", "Сохранить новый ключ и возобновить")}
        disabled={form.pending || !hasKey}
        onClick={onSaveKey}
        data-testid="pause-save-key"
      >
        {form.pending ? tl("common.saving", "Сохранение…") : tl("synthesis.pauseModal.saveAndContinue", "✓ Сохранить и продолжить")}
      </button>
      <PauseBtn title={tl("synthesis.pauseModal.retryWithKeyHint", "Повторить с текущим ключом")} onClick={retry}>
        {tl("synthesis.pauseModal.retry", "↻ Повторить")}
      </PauseBtn>
      <PauseBtn
        kind="danger"
        title={tl("synthesis.pauseModal.stopSaveHint", "Остановить, сохранить текущее состояние")}
        onClick={stop}
      >
        {tl("synthesis.pauseModal.stop", "◼ Остановить")}
      </PauseBtn>
    </>
  );
}

/* ── Бейдж паузы в шапке (_showPauseBadge [24660]) ───────────────────── */

export function PauseBadge({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick?: (() => void) | undefined;
}) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title={tl("synthesis.pauseModal.pausedOpenActions", "Генерация приостановлена — открыть действия")}
      className="progress-pause-badge visible"
    >
      {tl("synthesis.pauseModal.pausedBadge", "⏸ Приостановлено")}
    </button>
  );
}

/* ── Модалка (showPauseModal [24700]) ────────────────────────────────── */

export interface PauseModalProps {
  open: boolean;
  /** syntheses.paused_state (GET /syntheses/:id) либо собранный из
   *  generation_paused (§3.2) */
  pausedState: PausedState | null;
  /** Оценки стоимости действий (generation_paused.estimates) */
  estimates?: PauseEstimates | undefined;
  onResumeGeneration: (mode: ResumeGenerationMode) => void;
  onResumePlan: (mode: ResumePlanMode) => void;
  onClose: () => void;
}

export function PauseModal({
  open,
  pausedState: ps,
  estimates = {},
  onResumeGeneration,
  onResumePlan,
  onClose,
}: PauseModalProps) {
  // Состояние формы ключа auth-рендерера (6.2) — хуки до раннего return
  const [newKey, setNewKey] = useState("");
  const [keyPending, setKeyPending] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  if (!open || !ps) return null;

  const keyForm: AuthKeyForm = {
    value: newKey,
    setValue: (v) => {
      setNewKey(v);
      setKeyError(null);
    },
    pending: keyPending,
    error: keyError,
  };

  /* Порт _resumeWithNewApiKey [25028]: сохранить ключ → возобновить retry.
     Валидация формата — серверная (sk-ant-…, ≥ 20 символов, 400 с
     details.key); клиент лишь не шлёт пустое. */
  const saveKeyAndRetry = async (): Promise<void> => {
    const key = newKey.trim();
    if (!key) return;
    setKeyPending(true);
    setKeyError(null);
    try {
      await storeApiKey(key);
      setNewKey("");
      if (ps.kind === "plan") onResumePlan("retry");
      else onResumeGeneration("retry");
    } catch (err) {
      const details =
        err instanceof ApiError && err.details && typeof err.details === "object"
          ? (err.details as Record<string, unknown>).key
          : undefined;
      setKeyError(
        err instanceof ApiError
          ? `${err.message}${typeof details === "string" ? `: ${details}` : ""}`
          : tl("synthesis.pauseModal.keySaveFailed", "Не удалось сохранить ключ"),
      );
    } finally {
      setKeyPending(false);
    }
  };

  /* Confirm деградации при skip [25686] (беседа 2.2, долг §12):
     сервер кладёт в pausedState/generation_paused список разделов,
     строящихся на пропускаемом контенте (skipDegrades). */
  const resumeGenConfirmed = (mode: ResumeGenerationMode): void => {
    if (
      mode === "skip" &&
      ps.kind === "gen" &&
      (ps.skipDegrades?.length ?? 0) > 0
    ) {
      const list = (ps.skipDegrades as string[]).join(", ");
      // globalThis-аксессор вместо window: smoke-1.4b.mts импортирует
      // модуль под scripts/tsconfig (lib ES2022 без DOM) — «window»
      // там не существует как имя (грабля завершения 2.2)
      const confirmFn = (
        globalThis as { confirm?: (msg: string) => boolean }
      ).confirm;
      const sure =
        confirmFn?.(
          tl("synthesis.pauseModal.dependentSections", "На пропускаемом контенте строятся разделы: {list}. ", { list }) +
            tl("synthesis.pauseModal.confirmSkip", "Их качество может деградировать. Всё равно пропустить?"),
        ) ?? true;
      if (!sure) return;
    }
    onResumeGeneration(mode);
  };

  // Диспетчеризация по reasonKind/kind [24735–24766]
  let title: string;
  let body: React.ReactNode;
  let footer: React.ReactNode;
  if (ps.reasonKind === "billing" && ps.kind === "gen") {
    title = tl("synthesis.pauseModal.titleBalance", "💳 Баланс API исчерпан");
    body = <BillingContent ps={ps} />;
    footer = <BillingFooter onResume={resumeGenConfirmed} />;
  } else if (ps.reasonKind === "auth") {
    title = tl("synthesis.pauseModal.titleKeyInvalid", "🔑 API-ключ недействителен");
    body = <AuthContent ps={ps} form={keyForm} />;
    footer = (
      <AuthFooter
        ps={ps}
        form={keyForm}
        onSaveKey={() => void saveKeyAndRetry()}
        onResumeGeneration={onResumeGeneration}
        onResumePlan={onResumePlan}
      />
    );
  } else if (ps.kind === "gen") {
    title = ps.isPartial
      ? tl("synthesis.pauseModal.titleInterruptedMidway", "⏸ Раздел прерван в середине")
      : tl("synthesis.pauseModal.titleNotStarted", "⏸ Генерация не началась");
    body = <GenContent ps={ps} />;
    footer = (
      <GenFooter ps={ps} estimates={estimates} onResume={resumeGenConfirmed} />
    );
  } else if (ps.kind === "plan") {
    title = tl("synthesis.pauseModal.titlePlanInterrupted", "⏸ План редактирования прерван");
    body = <PlanContent ps={ps} />;
    footer = <PlanFooter onResume={onResumePlan} />;
  } else {
    title = tl("synthesis.pauseModal.titlePaused", "⏸ Генерация приостановлена");
    body = <p>{tl("synthesis.pauseModal.unknownPause", "Неизвестный тип паузы.")}</p>;
    footer = (
      <PauseBtn title={tl("common.close", "Закрыть")} onClick={onClose}>
        {tl("common.close", "Закрыть")}
      </PauseBtn>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="pause-overlay visible"
      onClick={onClose}
    >
      <div className="pause-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pause-modal-header">
          <div className="pause-modal-title">{title}</div>
          <button
            type="button"
            onClick={onClose}
            title={tl("synthesis.pauseModal.minimize", "Свернуть (пауза сохраняется)")}
            className="pause-modal-close"
          >
            ✕
          </button>
        </div>
        <div className="pause-modal-body">{body}</div>
        <div className="pause-modal-footer">{footer}</div>
      </div>
    </div>
  );
}
