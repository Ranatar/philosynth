/**
 * Фраза уведомления на языке интерфейса (беседа 16.2; правило 14.2:
 * сервер хранит код `type`, ссылки и параметры — фразу собирает читатель).
 * Зеркало серверного notificationText (сводка по почте) — тексты одни и те
 * же, ключи — в пространстве клиента (пространства по пути файла).
 */
import type { DiscussionAddress } from "@philosynth/shared/types/discussion";
import type { Notification } from "@philosynth/shared/types/notifications";
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";
import { tData } from "@philosynth/shared/i18n/data";
import { tl } from "@philosynth/shared/i18n/t";

import { roleLabel } from "../components/synthesis/MembersPanel";

function addressLabel(addr: DiscussionAddress | null): string {
  if (!addr) return "";
  if (addr.kind === "section") return tData(KEY_LABELS[addr.key as keyof typeof KEY_LABELS] ?? addr.key);
  if (addr.kind === "synthesis") return tl("utils.notificationText.addrSynthesis", "концепция в целом");
  return addr.key;
}

export function notificationText(n: Notification): string {
  const who = n.actor?.name ?? tl("utils.notificationText.someone", "кто-то");
  const title = n.synthesisTitle;
  const role = n.payload.role ? roleLabel(n.payload.role) : "";
  const excerpt = n.payload.excerpt ? ` «${n.payload.excerpt}»` : "";
  switch (n.type) {
    case "member_invited":
      return tl("utils.notificationText.memberInvited", "{who} приглашает вас в концепцию «{title}» в роли «{role}»", { who, title, role });
    case "member_accepted":
      return tl("utils.notificationText.memberAccepted", "{who} принял приглашение в концепцию «{title}»", { who, title });
    case "member_declined":
      return tl("utils.notificationText.memberDeclined", "{who} отклонил приглашение в концепцию «{title}»", { who, title });
    case "member_role_changed":
      return tl("utils.notificationText.memberRoleChanged", "Ваша роль в концепции «{title}» теперь «{role}»", { title, role });
    case "member_removed":
      return tl("utils.notificationText.memberRemoved", "Вы исключены из участников концепции «{title}»", { title });
    case "comment_new":
      return tl("utils.notificationText.commentNew", "{who} оставил комментарий к «{addr}» в концепции «{title}»{excerpt}", { who, addr: addressLabel(n.address), title, excerpt });
    case "comment_reply":
      return tl("utils.notificationText.commentReply", "{who} ответил в вашей ветке в концепции «{title}»{excerpt}", { who, title, excerpt });
    case "review_published":
      return tl("utils.notificationText.reviewPublished", "{who} опубликовал рецензию на концепцию «{title}»{excerpt}", { who, title, excerpt });
    case "finding_outdated":
      return tl("utils.notificationText.findingOutdated", "Объект «{addr}» вашего замечания в концепции «{title}» изменился", { addr: addressLabel(n.address), title });
    case "proposal_created":
      // 17.2: вид предложения и «заведено заново» — из payload (17.1)
      return (
        tl("utils.notificationText.proposalCreated", "{who} предложил изменение в концепции «{title}»", { who, title }) +
        (n.payload.kind === "note"
          ? tl("utils.notificationText.proposalKindNote", " (замечание)")
          : n.payload.kind === "replace"
            ? tl("utils.notificationText.proposalKindReplace", " (готовая замена)")
            : "") +
        (n.payload.rebasedFrom ? tl("utils.notificationText.proposalRebased", " — поверх текущего, взамен устаревшего") : "") +
        excerpt
      );
    case "proposal_decided":
      // 17.2: решение — кодом payload.decision (фраза собирается здесь, 14.2)
      return n.payload.decision === "accepted"
        ? tl("utils.notificationText.proposalAccepted", "Ваше предложение в концепции «{title}» принято: план исполнен", { title })
        : n.payload.decision === "rejected"
          ? tl("utils.notificationText.proposalRejected", "Ваше предложение в концепции «{title}» отклонено", { title })
          : n.payload.decision === "closed"
            ? tl("utils.notificationText.proposalClosed", "Ваше предложение в концепции «{title}» закрыто", { title })
            : tl("utils.notificationText.proposalDecided", "По вашему предложению в концепции «{title}» принято решение", { title });
  }
}

/** Куда ведёт уведомление: приглашение — на страницу принятия, остальное — к концепции. */
export function notificationLink(n: Notification): string {
  if (n.type === "member_invited") return `/invitations/${n.synthesisId}`;
  // 17.2: уведомление о предложении ведёт к нему во вкладке «Предложения»
  if (n.refKind === "proposal" && n.refId) return `/synthesis/${n.synthesisId}?proposal=${n.refId}`;
  return `/synthesis/${n.synthesisId}`;
}
