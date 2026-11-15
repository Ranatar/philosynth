/**
 * Предложения изменений на клиенте (беседа 17.2; сервер — 17.1, 03 §2.20):
 * подписи, группы вкладки, способы принятия, разница «сейчас → предлагается».
 *
 * Чистые функции без DOM (кроме `markupToLines` за гардом) — их зовут смоук и
 * сторож. Фраз в БД нет (правило 14.2): всё собирается здесь по кодам.
 */
import { tl } from "@philosynth/shared/i18n/t";
import { tData } from "@philosynth/shared/i18n/data";
import { ELEMENT_STEP_FIELDS, ELEMENT_STEP_FIELD_LABELS, ELEMENT_STEP_KINDS } from "@philosynth/shared/constants/edit-steps";
import type { ProposalAcceptMethod, ProposalCloseReason, ProposalSource, ProposalStatus } from "@philosynth/shared/constants/proposals";
import type { ElementStepKind } from "@philosynth/shared/types/edit-plan";
import type { Proposal, ProposalEvent } from "@philosynth/shared/types/proposals";

import { ApiError } from "../api/client";
import { diffLines, type DiffLine } from "./text-diff";

/** Адресат — элемент (категория, связь, тезис, термин)? */
export const isElementStepKind = (k: string): k is ElementStepKind => (ELEMENT_STEP_KINDS as readonly string[]).includes(k);

/* ── Группы вкладки «Предложения» ────────────────────────────────────── */

export type ProposalGroup = "open" | "stale" | "decided";

/** Открытые (ждут решения, в том числе стоящие в черновике плана),
 *  устаревшие (открыты, но основа разошлась — принять нельзя), решённые. */
export function proposalGroupOf(p: Pick<Proposal, "status" | "stale">): ProposalGroup {
  if (p.status !== "open") return "decided";
  return p.stale ? "stale" : "open";
}

export function groupProposals<T extends Pick<Proposal, "status" | "stale">>(list: readonly T[]): Record<ProposalGroup, T[]> {
  const out: Record<ProposalGroup, T[]> = { open: [], stale: [], decided: [] };
  for (const p of list) out[proposalGroupOf(p)].push(p);
  return out;
}

export function groupLabel(g: ProposalGroup): string {
  if (g === "open") return tl("utils.proposals.groupOpen", "Открытые");
  if (g === "stale") return tl("utils.proposals.groupStale", "Устаревшие");
  return tl("utils.proposals.groupDecided", "Решённые");
}

/* ── Подписи ─────────────────────────────────────────────────────────── */

export function statusLabel(p: Pick<Proposal, "status" | "stale" | "planId">): string {
  const s: ProposalStatus = p.status;
  if (s === "open") {
    if (p.stale) return tl("utils.proposals.statusStale", "устарело");
    return p.planId ? tl("utils.proposals.statusInPlan", "в черновике плана") : tl("utils.proposals.statusOpen", "открыто");
  }
  if (s === "accepted") return tl("utils.proposals.statusAccepted", "принято");
  if (s === "rejected") return tl("utils.proposals.statusRejected", "отклонено");
  if (s === "withdrawn") return tl("utils.proposals.statusWithdrawn", "снято автором");
  return tl("utils.proposals.statusClosed", "закрыто");
}

export function kindLabel(kind: string): string {
  return kind === "replace" ? tl("utils.proposals.kindReplace", "готовая замена") : tl("utils.proposals.kindNote", "замечание");
}

export function sourceLabel(source: ProposalSource | string): string {
  if (source === "comment") return tl("utils.proposals.sourceComment", "из комментария");
  if (source === "review_finding") return tl("utils.proposals.sourceFinding", "из замечания рецензии");
  if (source === "recommendation") return tl("utils.proposals.sourceRecommendation", "по рекомендации критики");
  return tl("utils.proposals.sourceDirect", "напрямую");
}

export function closeReasonLabel(reason: ProposalCloseReason | string | null | undefined): string {
  if (reason === "member_removed") return tl("utils.proposals.closeMemberRemoved", "автор больше не участник");
  if (reason === "superseded") return tl("utils.proposals.closeSuperseded", "заменено новым поверх текущего");
  if (reason === "outdated") return tl("utils.proposals.closeOutdated", "устарело");
  if (reason === "manual") return tl("utils.proposals.closeManual", "закрыто вручную");
  return "";
}

export function fieldLabel(field: string | null | undefined): string {
  if (!field) return "";
  return tData(ELEMENT_STEP_FIELD_LABELS[field] ?? field);
}

/** Поля элемента, которым можно предложить готовое значение (белый список
 *  шага 10.2 — тот же, что проверяет сервер). */
export function replaceFieldsFor(addressKind: string): readonly string[] {
  return isElementStepKind(addressKind) ? ELEMENT_STEP_FIELDS[addressKind as ElementStepKind] : [];
}

/* ── Способы принятия (зеркало services/proposals.acceptMethodsFor; сторож
      4bq сверяет таблицу на одном наборе адресатов) ───────────────────── */

export function acceptMethodsFor(addressKind: string, proposalKind: string): ProposalAcceptMethod[] {
  if (isElementStepKind(addressKind))
    return proposalKind === "replace" ? ["edit_element"] : ["edit_element", "refine_element"];
  if (addressKind === "subsection")
    return proposalKind === "replace" ? ["edit_subsection"] : ["edit_subsection", "regen_subsection"];
  if (addressKind === "section") return proposalKind === "replace" ? [] : ["regen"];
  return [];
}

/** Способу нужно значение от принимающего (ручная правка по замечанию). */
export const methodNeedsValue = (m: ProposalAcceptMethod): boolean => m === "edit_element" || m === "edit_subsection";
/** Способ зовёт модель — стоит квоты ПРИНИМАЮЩЕГО (плательщик — кто нажал). */
export const methodIsPaid = (m: ProposalAcceptMethod): boolean => m === "refine_element" || m === "regen_subsection" || m === "regen";

export function methodLabel(m: ProposalAcceptMethod): string {
  switch (m) {
    case "edit_element":
      return tl("utils.proposals.methodEditElement", "вписать значение вручную");
    case "edit_subsection":
      return tl("utils.proposals.methodEditSubsection", "вписать текст подраздела вручную");
    case "refine_element":
      return tl("utils.proposals.methodRefineElement", "точечная генерация в поле элемента");
    case "regen_subsection":
      return tl("utils.proposals.methodRegenSubsection", "перегенерировать подраздел");
    case "regen":
      return tl("utils.proposals.methodRegen", "перегенерировать раздел");
  }
}

/* ── Основа и текущая версия ─────────────────────────────────────────── */

/** «Основа v3 · сейчас v5» у элемента; у текста — «текст тот же / изменился». */
export function baseLine(p: Pick<Proposal, "base" | "resolution" | "address">): string {
  if (p.resolution.state === "deleted") return tl("utils.proposals.baseDeleted", "адресата больше нет в документе");
  if (isElementStepKind(p.address.kind)) {
    const base = p.base.version ?? 0;
    const cur = p.resolution.currentVersion ?? 0;
    return tl("utils.proposals.baseVersions", "основа — версия {base} · сейчас — версия {current}", { base, current: cur });
  }
  return p.base.hash === p.resolution.currentHash
    ? tl("utils.proposals.baseSameText", "написано к текущему тексту")
    : tl("utils.proposals.baseOtherText", "текст изменился после записи предложения");
}

/* ── Разница ─────────────────────────────────────────────────────────── */

/** Разметка подраздела построчно: блок на строку, теги сняты, сущности
 *  раскрыты (09 §6, 12.4: `&lt;p&gt;` читался бы как разметка). */
export function markupToLines(html: string): string {
  if (typeof DOMParser === "undefined") {
    return html
      .replace(/<\/(p|li|h5|tr|div|ul|ol|table)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  const lines: string[] = [];
  const BLOCK = new Set(["P", "LI", "H5", "TR", "DIV"]);
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      const hasBlockChild = [...child.children].some((c) => BLOCK.has(c.tagName) || ["UL", "OL", "TABLE", "TBODY", "THEAD"].includes(c.tagName));
      if (BLOCK.has(child.tagName) && !hasBlockChild) {
        const cells = child.tagName === "TR" ? [...child.children].map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim()).join(" | ") : (child.textContent ?? "").replace(/\s+/g, " ").trim();
        if (cells) lines.push(cells);
      } else walk(child);
    }
  };
  if (root) walk(root);
  if (lines.length === 0) {
    const t = (root?.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t) lines.push(t);
  }
  return lines.join("\n");
}

export interface ProposalDiff {
  /** Подпись того, что сравнивается (поле элемента либо «текст подраздела») */
  label: string;
  lines: DiffLine[];
  /** Нечего сравнивать: текущее значение совпало с предлагаемым */
  same: boolean;
}

/** Пополевая разница элемента: текущее значение поля → предлагаемое. */
export function fieldDiff(field: string, current: string, proposed: string): ProposalDiff {
  return { label: fieldLabel(field), lines: diffLines(current, proposed), same: current.trim() === proposed.trim() };
}

/** Текстовая разница подраздела: текущая разметка → предлагаемая, по блокам. */
export function subsectionDiff(currentHtml: string, proposedHtml: string): ProposalDiff {
  const a = markupToLines(currentHtml);
  const b = markupToLines(proposedHtml);
  return { label: tl("utils.proposals.subsectionText", "текст подраздела"), lines: diffLines(a, b), same: a === b };
}

/* ── Журнал событий ──────────────────────────────────────────────────── */

export function eventText(ev: Pick<ProposalEvent, "type" | "payload">): string {
  const p = ev.payload ?? {};
  switch (ev.type) {
    case "created":
      return tl("utils.proposals.eventCreated", "предложение записано");
    case "plan_drafted":
      return tl("utils.proposals.eventPlanDrafted", "взято в черновик плана правок");
    case "plan_released": {
      const r = typeof p["reason"] === "string" ? p["reason"] : "";
      const why =
        r === "plan_deleted"
          ? tl("utils.proposals.releasePlanDeleted", "план удалён")
          : r === "plan_stopped"
            ? tl("utils.proposals.releasePlanStopped", "план остановлен")
            : r === "step_skipped"
              ? tl("utils.proposals.releaseStepSkipped", "шаг снят")
              : r === "step_failed"
                ? tl("utils.proposals.releaseStepFailed", "шаг не исполнился")
                : r === "stale"
                  ? tl("utils.proposals.releaseStale", "документ изменился — предложение устарело")
                  : r === "not_open"
                    ? tl("utils.proposals.releaseNotOpen", "предложение уже не открыто")
                    : r === "member_removed"
                      ? tl("utils.proposals.releaseMemberRemoved", "автор плана больше не участник")
                      : "";
      return tl("utils.proposals.eventPlanReleased", "снова ждёт решения") + (why ? ` — ${why}` : "");
    }
    case "accepted": {
      const st = typeof p["stepType"] === "string" ? p["stepType"] : "";
      const how =
        st === "regen"
          ? tl("utils.proposals.acceptedRegen", "раздел перегенерирован")
          : st === "regen_subsection"
            ? tl("utils.proposals.acceptedRegenSubsection", "подраздел перегенерирован")
            : st === "refine_element"
              ? tl("utils.proposals.acceptedRefine", "значение написано моделью")
              : st === "edit_subsection"
                ? tl("utils.proposals.acceptedEditSubsection", "текст подраздела вписан")
                : st === "edit_element"
                  ? tl("utils.proposals.acceptedEditElement", "значение вписано")
                  : "";
      return tl("utils.proposals.eventAccepted", "принято: план исполнен") + (how ? ` — ${how}` : "");
    }
    case "rejected":
      return tl("utils.proposals.eventRejected", "отклонено");
    case "withdrawn":
      return tl("utils.proposals.eventWithdrawn", "снято автором");
    case "closed":
      return tl("utils.proposals.eventClosed", "закрыто") + (closeReasonLabel(p["reason"] as string) ? ` — ${closeReasonLabel(p["reason"] as string)}` : "");
    case "rebased":
      return tl("utils.proposals.eventRebased", "заведено заново поверх текущего");
  }
}

/* ── Ошибки ──────────────────────────────────────────────────────────── */

export function proposalErrorText(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  if (err.code === "PROPOSAL_STALE")
    return tl("utils.proposals.errStale", "Предложение устарело: адресат изменился после его записи. Принять нельзя — автор может завести новое поверх текущего, либо предложение закрывается.");
  if (err.code === "FORBIDDEN") return tl("utils.proposals.errForbidden", "На это действие нет права.");
  if (err.code === "GENERATION_IN_PROGRESS") return tl("utils.proposals.errBusy", "Идёт генерация или исполнение плана — дождитесь завершения.");
  if (err.code === "VALIDATION_ERROR" && err.details && typeof err.details === "object") {
    const first = Object.values(err.details as Record<string, unknown>).find((v) => typeof v === "string");
    if (typeof first === "string") return first;
  }
  return err.message || fallback;
}
