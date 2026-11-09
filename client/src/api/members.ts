/**
 * API участников концепции (беседа 16.2; 03 §2.18) и каталога «Со мной
 * поделились». Контракт — server/routes/members.ts; типы — shared.
 */
import type { MemberRole } from "@philosynth/shared/constants/discussion";
import type {
  InvitationInfo,
  MemberInviteResult,
  MemberView,
  MembersView,
  MyMembership,
  PendingInvitation,
  SharedSynthesisPreview,
} from "@philosynth/shared/types/notifications";

import { apiDelete, apiGet, apiPatch, apiPost } from "./client";

export const listMembers = (synthesisId: string): Promise<MembersView> =>
  apiGet<MembersView>(`/syntheses/${synthesisId}/members`);

export const inviteMember = (synthesisId: string, email: string, role: MemberRole): Promise<MemberInviteResult> =>
  apiPost<MemberInviteResult>(`/syntheses/${synthesisId}/members`, { email, role });

export const changeMemberRole = (synthesisId: string, memberId: string, role: MemberRole): Promise<MemberView> =>
  apiPatch<MemberView>(`/syntheses/${synthesisId}/members/${memberId}`, { role });

export const removeMember = (synthesisId: string, memberId: string): Promise<{ ok: true; removed: "invited" | "active" }> =>
  apiDelete(`/syntheses/${synthesisId}/members/${memberId}`);

export const resendMemberInvite = (synthesisId: string, memberId: string): Promise<{ ok: true; sent: boolean }> =>
  apiPost(`/syntheses/${synthesisId}/members/${memberId}/resend`);

export const revokeInvitation = (synthesisId: string, tokenId: string): Promise<{ ok: true }> =>
  apiDelete(`/syntheses/${synthesisId}/invitations/${tokenId}`);

export const resendInvitation = (
  synthesisId: string,
  tokenId: string,
): Promise<{ ok: true; sent: boolean; invitation: PendingInvitation }> =>
  apiPost(`/syntheses/${synthesisId}/invitations/${tokenId}/resend`);

export const getMyMembership = (synthesisId: string): Promise<MyMembership> =>
  apiGet<MyMembership>(`/syntheses/${synthesisId}/membership`);

export const acceptInvitation = (synthesisId: string): Promise<MyMembership> =>
  apiPost<MyMembership>(`/syntheses/${synthesisId}/membership/accept`);

export const declineInvitation = (synthesisId: string): Promise<{ ok: true }> =>
  apiPost(`/syntheses/${synthesisId}/membership/decline`);

export const listSharedSyntheses = (): Promise<{ items: SharedSynthesisPreview[] }> =>
  apiGet(`/syntheses/shared`);

/** Что за приглашение за доводом из письма (/register?invite=…); без сессии. */
export const getInvitationInfo = (token: string): Promise<InvitationInfo> =>
  apiGet<InvitationInfo>(`/auth/invitations/${encodeURIComponent(token)}`);
