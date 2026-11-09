/**
 * DTO участников, приглашений и уведомлений (беседа 16.2; 02 §2.33, §2.38–2.39;
 * 03 §2.18). Тексты пользователей — обычный текст; фразы уведомлений в строке
 * НЕ хранятся — собираются при чтении по `type` (клиент — `tl()` на языке
 * интерфейса, сводка по почте — на языке получателя).
 */
import type { MemberRole, MemberStatus } from "../constants/discussion.js";
import type {
  NotificationCategory,
  NotificationRefKind,
  NotificationType,
} from "../constants/notifications.js";
import type { DiscussionAddress } from "./discussion.js";
import type { SynthesisPreview } from "./synthesis.js";

/* ── Участники (вкладка «Участники», только владельцу) ───────────────── */

/** Строка участника с данными учётной записи — для владельца. */
export interface MemberView {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: MemberRole;
  status: MemberStatus;
  invitedAt: string;
  acceptedAt: string | null;
}

/** Ждущее приглашение адреса БЕЗ аккаунта (довод auth_tokens `member_invite`):
 *  строки участника ещё нет — она появится при регистрации по ссылке. */
export interface PendingInvitation {
  id: string;
  email: string;
  role: MemberRole;
  createdAt: string;
  expiresAt: string;
}

export interface MembersView {
  members: MemberView[];
  invitations: PendingInvitation[];
}

export interface MemberInviteInput {
  email: string;
  role: MemberRole;
}

/** Ответ POST /syntheses/:id/members: участник (адрес с аккаунтом) либо
 *  ждущее приглашение (адреса без аккаунта). */
export type MemberInviteResult =
  | { kind: "member"; member: MemberView; sent: boolean }
  | { kind: "invitation"; invitation: PendingInvitation; sent: boolean };

/** Моё участие в синтезе — страница принятия приглашения; `synthesis` —
 *  шапка без содержания (приглашённый читать концепцию ещё не вправе). */
export interface MyMembership {
  member: {
    id: string;
    role: MemberRole;
    status: MemberStatus;
    invitedAt: string;
    acceptedAt: string | null;
  };
  synthesis: { id: string; title: string; ownerName: string };
}

/** Что говорит ссылка приглашения на регистрацию (GET /auth/invitations/:token). */
export interface InvitationInfo {
  synthesisId: string;
  synthesisTitle: string;
  role: MemberRole;
  email: string;
  inviterName: string;
}

/** Концепция, где я участник (вкладка «Со мной поделились»). */
export interface SharedSynthesisPreview extends SynthesisPreview {
  myRole: MemberRole;
  myStatus: MemberStatus;
}

/* ── Уведомления ─────────────────────────────────────────────────────── */

/** Кто совершил событие (у `finding_outdated` — null: объект изменила служба). */
export interface NotificationActor {
  id: string | null;
  name: string;
}

/** Параметры события — то, что нужно фразе сверх ссылок; хранятся кодами и
 *  значениями, не текстом: `role` — новая роль; `excerpt` — начало
 *  комментария / заголовок рецензии (обычный текст автора, не переводится). */
export interface NotificationPayload {
  role?: MemberRole;
  excerpt?: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  synthesisId: string;
  /** Текущее название концепции (JOIN при чтении, не снимок) */
  synthesisTitle: string;
  actor: NotificationActor | null;
  address: DiscussionAddress | null;
  refKind: NotificationRefKind | null;
  refId: string | null;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: Notification[];
  unread: number;
  nextCursor: string | null;
}

/** Настройки уведомлений пользователя (профиль): отключённые категории
 *  (не пишутся вовсе) и сводка по почте. */
export interface NotificationSettings {
  mutedCategories: NotificationCategory[];
  emailDigest: boolean;
}
