// ─── Enums ──────────────────────────────────────────────────────────────────

export type UserRole = "user" | "admin";

export type SynthesisMethod =
  | "dialectical"
  | "integrative"
  | "deconstructive"
  | "hermeneutical"
  | "analytical"
  | "creative";

export type SynthLevel = "comparative" | "transformative" | "generative";

export type DepthLevel = "overview" | "standard" | "deep" | "exhaustive";

export type GenerationOrder = "architectural" | "genetic";

export type SynthesisStatus = "draft" | "generating" | "ready" | "error";

// ─── Row types (match schema.ts field-by-field) ────────────────────────────

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  role: UserRole;
  /** numeric(10,4) — Drizzle returns string */
  balanceUsd: string;
  createdAt: Date;
  updatedAt: Date;
}

/** User without sensitive fields — for API responses */
export interface UserPublic {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  balanceUsd: string;
  createdAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface Synthesis {
  id: string;
  userId: string;

  // Параметры
  seed: string;
  method: SynthesisMethod;
  synthLevel: SynthLevel;
  depth: DepthLevel;
  generationOrder: GenerationOrder;
  context: string;
  lang: string;

  // Состояние
  title: string;
  docNum: string;
  status: SynthesisStatus;
  isPublic: boolean;

  /** Порядок разделов — массив ключей: ["sum","graph","glossary",...] */
  sectionOrder: string[];

  // Версионирование
  versionBase: number;
  versionSub: number;
  versionModes: number;
  versionModeRegen: number;

  // Капсула
  capsuleHtml: string;

  // Статистика
  totalInputTokens: number;
  totalOutputTokens: number;
  /** numeric(10,6) */
  totalCostUsd: string;

  createdAt: Date;
  updatedAt: Date;
}

// ─── Input / params ────────────────────────────────────────────────────────

/** Параметры создания нового синтеза (POST /api/syntheses) */
export interface SynthesisCreateInput {
  seed: string;
  method?: SynthesisMethod;
  synthLevel?: SynthLevel;
  depth?: DepthLevel;
  generationOrder?: GenerationOrder;
  context?: string;
  lang?: string;
  sectionOrder?: string[];
  /** Участники: философы и/или концепции для мета-синтеза */
  participants?: ParticipantInput[];
}

/** Участник синтеза: философ или существующая концепция */
export interface ParticipantInput {
  type: "philosopher" | "synthesis";
  /** Имя философа (если type = 'philosopher') */
  name?: string;
  /** ID концепции (если type = 'synthesis') */
  synthesisId?: string;
}

/** Обновляемые поля синтеза (PATCH) */
export interface SynthesisUpdateInput {
  title?: string;
  isPublic?: boolean;
  context?: string;
}

// ─── Projections ───────────────────────────────────────────────────────────

/** Карточка синтеза для каталога */
export interface SynthesisPreview {
  id: string;
  userId: string;
  title: string;
  seed: string;
  method: SynthesisMethod;
  synthLevel: SynthLevel;
  depth: DepthLevel;
  status: SynthesisStatus;
  isPublic: boolean;
  capsuleHtml: string;
  totalCostUsd: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Полный синтез со всеми вложенными данными */
export interface SynthesisFull extends Synthesis {
  user?: UserPublic;
  participantNames?: string[];
}

/** Версия документа */
export interface DocVersion {
  base: number;
  sub: number;
  modes: number;
  modeRegen: number;
}
