/**
 * DTO социального слоя (беседа 16.1; врезка «Фаза 16» в 07; 02 §2.33–2.37,
 * 03 §2.17): права смотрящего, участники, устойчивые адреса обсуждения,
 * комментарии, рецензии с редакциями и замечаниями, сводка по адресам.
 *
 * Все тексты пользователей — ОБЫЧНЫЙ ТЕКСТ (абзацы по пустой строке), без
 * HTML и без Markdown-ссылок: сервер их не чистит и не размечает, клиент
 * обязан показывать экранированными. Тексты не переводятся.
 */
import type {
  AddressKind,
  AddressState,
  CommentKind,
  CommentStatus,
  MemberRole,
  MemberStatus,
  ReviewStatus,
  ReviewTextField,
} from "../constants/discussion.js";

/* ── Права (одна проверка — server/services/capabilities.ts) ─────────── */

/** Роль смотрящего относительно синтеза: владелец, участник (редактор /
 *  рецензент), читатель по видимости, гость без сессии. */
export type SynthesisRole = "owner" | MemberRole | "reader" | "guest";

/**
 * Что смотрящему можно (врезка «Фаза 16», таблица ролей):
 *  read — чтение (участник — на любой ступени видимости; читатель — по
 *         ступени); discuss — комментарии, рецензии (16.1), предложения (17);
 *  edit — прямая правка, генерация, принятие предложений (16.1: только
 *         владелец; редактор получает право в 17.1); manage — участники,
 *         видимость, удаление, копия, родословная (только владелец).
 * Отдаётся в `SynthesisFull.capabilities` рядом с прежним `isOwner`.
 */
export interface Capabilities {
  read: boolean;
  discuss: boolean;
  edit: boolean;
  manage: boolean;
  role: SynthesisRole;
}

/* ── Участники ───────────────────────────────────────────────────────── */

export interface SynthesisMember {
  id: string;
  synthesisId: string;
  userId: string;
  role: MemberRole;
  status: MemberStatus;
  /** Кто пригласил (владелец); null — строка заведена без приглашения
   *  (сид/тест) либо пригласивший удалён */
  invitedBy: string | null;
  createdAt: string;
  /** Когда участие стало действующим (принятие — 16.2); null у invited */
  acceptedAt: string | null;
  updatedAt: string;
}

/* ── Адрес обсуждения ────────────────────────────────────────────────── */

/**
 * Устойчивый адрес объекта концепции — фундамент фазы. Перегенерация графа
 * и трансформация граф↔тезисы пересоздают категории (новые id), повторный
 * разбор — тезисы и термины, поэтому адрес по одному id повис бы после
 * первой же перегенерации. Адрес = вид + ключ + id на момент записи + хэш
 * канонического содержимого (+ номер версии элемента). После пересоздания
 * объект находится заново по ключу (id → ключ); совпал хэш — current, не
 * совпал — outdated, не найден — deleted. Состояние ВЫЧИСЛЯЕТСЯ при чтении
 * (`AddressResolution`), в строке не хранится.
 *
 * Ключ по виду: synthesis — id синтеза; section — ключ раздела; subsection —
 * «ключ раздела:data-section»; category — имя (normalizeName); edge — «имя
 * источника→имя цели|тип»; thesis — метка (`label ?? thesis_num`);
 * glossary_term — термин.
 */
export interface DiscussionAddress {
  kind: AddressKind;
  key: string;
  /** id строки на момент записи (sections/categories/…; у synthesis — id
   *  синтеза); null — у объекта нет строки (подраздел) */
  id: string | null;
  /** sha256 канонического содержимого объекта на момент записи (hex);
   *  у synthesis — пустая строка: обсуждение документа «вообще» не
   *  устаревает от каждой правки */
  hash: string;
  /** Номер версии element_versions на момент записи (0 — версий не было);
   *  null — у вида нет версий (synthesis, subsection) */
  version: number | null;
}

/** Куда ставится новое замечание — что присылает клиент. Сервер строит по
 *  цели полный адрес (хэш, выдержка, версия) сам. Элемент адресуется id
 *  либо ключом (ключ — когда id ещё не известен клиенту). */
export interface AddressTarget {
  kind: AddressKind;
  id?: string;
  key?: string;
}

/** Состояние адреса на момент чтения (вычислено заново). */
export interface AddressResolution {
  state: AddressState;
  /** Текущий id объекта (после переразрешения по ключу — новый); null у
   *  удалённого и у подраздела */
  currentId: string | null;
  /** Текущий хэш содержимого; null у удалённого */
  currentHash: string | null;
  /** Текущая версия element_versions; null — не применимо / удалён */
  currentVersion: number | null;
}

/* ── Автор ───────────────────────────────────────────────────────────── */

/** Автор комментария/рецензии. Удалённый аккаунт (7.1 анонимизирует строку
 *  users) показывается как «удалённый пользователь»: id null, deleted true,
 *  name — подпись на языке запроса. */
export interface DiscussionAuthor {
  id: string | null;
  name: string;
  deleted: boolean;
  /** Автор — владелец синтеза (пометка в интерфейсе) */
  isOwner: boolean;
}

/* ── Комментарии ─────────────────────────────────────────────────────── */

export interface Comment {
  id: string;
  synthesisId: string;
  author: DiscussionAuthor;
  address: DiscussionAddress;
  /** Выдержка объекта на момент записи — обычный текст ≤ ADDRESS_EXCERPT_MAX */
  excerpt: string;
  /** Состояние адреса на момент чтения (вычислено) */
  resolution: AddressResolution;
  /** null — корень ветки; иначе id корневого комментария (ветка плоская:
   *  ответ всегда к корню) */
  parentId: string | null;
  kind: CommentKind | null;
  /** Обычный текст; у удалённого автором — пустая строка */
  body: string;
  /** Статус ветки (у ответов — 'open'; скрытие — у любого) */
  status: CommentStatus;
  /** Скрыт владельцем — тело не отдаётся не-владельцу и не-автору, видна
   *  пометка «скрыто владельцем» */
  hidden: boolean;
  /** Удалён автором — остаётся заглушкой, пока есть ответы */
  deleted: boolean;
  /** Правился после создания */
  edited: boolean;
  /** Число ответов (у корня) */
  replyCount: number;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommentCreateInput {
  target?: AddressTarget;
  parentId?: string;
  body: string;
  kind?: CommentKind | null;
}

export interface CommentUpdateInput {
  body?: string;
  kind?: CommentKind | null;
}

export interface CommentListQuery {
  kind?: AddressKind;
  key?: string;
  status?: CommentStatus;
  author?: string;
  cursor?: string;
  limit?: number;
}

export interface CommentList {
  comments: Comment[];
  nextCursor: string | null;
}

/* ── Рецензии ────────────────────────────────────────────────────────── */

/** Версия документа, к которой писалась рецензия (строка syntheses на
 *  момент создания черновика; при публикации — обновляется). */
export interface ReviewDocVersion {
  base: number;
  sub: number;
  modes: number;
  modeRegen: number;
}

export type ReviewFields = Record<ReviewTextField, string>;

export interface ReviewFinding {
  id: string;
  reviewId: string;
  address: DiscussionAddress;
  excerpt: string;
  resolution: AddressResolution;
  body: string;
  kind: CommentKind | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface Review extends ReviewFields {
  id: string;
  synthesisId: string;
  author: DiscussionAuthor;
  docVersion: ReviewDocVersion;
  status: ReviewStatus;
  /** Номер текущей редакции (0 — черновик ещё не публиковался) */
  revision: number;
  findings: ReviewFinding[];
  publishedAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Редакция опубликованной рецензии — снимок полей и замечаний. */
export interface ReviewRevision {
  id: string;
  reviewId: string;
  revision: number;
  docVersion: ReviewDocVersion;
  fields: ReviewFields;
  findings: Omit<ReviewFinding, "resolution">[];
  createdAt: string;
}

export type ReviewUpsertInput = Partial<ReviewFields>;

export interface FindingCreateInput {
  target: AddressTarget;
  body: string;
  kind?: CommentKind | null;
}

export interface FindingUpdateInput {
  body?: string;
  kind?: CommentKind | null;
}

/* ── Сводка по адресам (пометки у элементов — 16.3) ──────────────────── */

export interface AddressCounts {
  kind: AddressKind;
  key: string;
  /** Открытые ветки комментариев (корни со статусом open, не скрытые) */
  openComments: number;
  /** Замечания опубликованных (не отозванных) рецензий */
  findings: number;
}

export interface DiscussionSummary {
  byAddress: AddressCounts[];
  totals: { openComments: number; findings: number; reviews: number };
}
