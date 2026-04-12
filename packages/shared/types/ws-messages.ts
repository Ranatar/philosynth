import type { EditPlan } from "./edit-plan";

// ═══════════════════════════════════════════════════════════════════════════
//  Client → Server messages
// ═══════════════════════════════════════════════════════════════════════════

export interface WsStartGeneration {
  type: "start_generation";
  synthesisId: string;
  sectionKey: string;
}

export interface WsConfirmStep {
  type: "confirm_step";
  planId: string;
  stepIndex: number;
}

export interface WsCancel {
  type: "cancel";
}

export type ClientWsMessage =
  | WsStartGeneration
  | WsConfirmStep
  | WsCancel;

// ═══════════════════════════════════════════════════════════════════════════
//  Server → Client messages
// ═══════════════════════════════════════════════════════════════════════════

export interface WsStreamDelta {
  type: "stream_delta";
  html: string;
  charsSoFar: number;
}

export interface WsStreamDone {
  type: "stream_done";
  usage: WsUsageInfo;
  sectionKey: string;
}

export interface WsStreamError {
  type: "stream_error";
  error: string;
  partialHtml: string;
}

export interface WsPlanUpdated {
  type: "plan_updated";
  plan: EditPlan;
}

export interface WsSubsectionDetected {
  type: "subsection_detected";
  name: string;
  charsSoFar: number;
}

export type ServerWsMessage =
  | WsStreamDelta
  | WsStreamDone
  | WsStreamError
  | WsPlanUpdated
  | WsSubsectionDetected;

// ─── Shared sub-types ──────────────────────────────────────────────────────

export interface WsUsageInfo {
  inputTokens: number;
  outputTokens: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Union type for all WS messages
// ═══════════════════════════════════════════════════════════════════════════

export type WsMessage = ClientWsMessage | ServerWsMessage;

// ─── Type guards ───────────────────────────────────────────────────────────

export function isClientMessage(msg: WsMessage): msg is ClientWsMessage {
  return (
    msg.type === "start_generation" ||
    msg.type === "confirm_step" ||
    msg.type === "cancel"
  );
}

export function isServerMessage(msg: WsMessage): msg is ServerWsMessage {
  return (
    msg.type === "stream_delta" ||
    msg.type === "stream_done" ||
    msg.type === "stream_error" ||
    msg.type === "plan_updated" ||
    msg.type === "subsection_detected"
  );
}
