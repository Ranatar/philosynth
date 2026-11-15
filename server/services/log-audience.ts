/**
 * Кто смотрит журнал и версии (беседа 17.1, п.3): имена исполнителей и
 * стоимость строк.
 *
 * Исполнитель строки — `generation_log.actor_user_id` /
 * `element_versions.actor_user_id` (NULL — строка до Фазы 17 либо импорт:
 * исполнитель — владелец). Правила показа:
 *   - «запустил X» / `actor` в DTO — только у строк НЕ-владельца и только
 *     УЧАСТНИКАМ (владелец, редактор, рецензент). Читатель, допущенный к
 *     журналу флагом showLogs (8.6), имён не видит; выгрузки имён не несут;
 *   - стоимость строки не-владельца — владельцу и самому исполнителю (платил
 *     он); остальным — скрыта. Строки владельца — как прежде.
 * «Владелец ли исполнитель» решает модуль прав (сравнение там одно).
 */
import { inArray } from "drizzle-orm";

import { db, schema } from "../db/index.js";
import { anonymizedEmailFor } from "./account-deletion.js";
import { canManageSynthesis } from "./capabilities.js";

import type { Capabilities } from "@philosynth/shared/types/discussion";
import type { ActorRef } from "@philosynth/shared/types/elements";
import { tl } from "@philosynth/shared/i18n/t";

const { users } = schema;

export interface LogAudience {
  /** показывать имена исполнителей */
  names: boolean;
  /** id смотрящего — своя стоимость видна всегда */
  viewerId: string | null;
  /** видит стоимость всех строк (владелец) */
  allCosts: boolean;
}

/** Выгрузка и служебные вызовы: без имён, стоимость — как у владельца. */
export const EXPORT_AUDIENCE: LogAudience = { names: false, viewerId: null, allCosts: true };

export function audienceOf(capabilities: Capabilities, userId: string | null): LogAudience {
  const participant =
    capabilities.role === "owner" || capabilities.role === "editor" || capabilities.role === "reviewer";
  return { names: participant, viewerId: userId, allCosts: capabilities.role === "owner" };
}

/** Исполнитель — не владелец (NULL считается владельцем). */
export function isForeignActor(actorUserId: string | null, ownerId: string): boolean {
  return actorUserId !== null && !canManageSynthesis({ userId: ownerId }, actorUserId);
}

/** Видна ли смотрящему стоимость строки с этим исполнителем. */
export function costVisible(actorUserId: string | null, ownerId: string, audience: LogAudience): boolean {
  if (!isForeignActor(actorUserId, ownerId)) return true;
  return audience.allCosts || (audience.viewerId !== null && audience.viewerId === actorUserId);
}

/** Имена исполнителей по id (удалённый аккаунт — подпись, id null). */
export async function loadActorRefs(
  ids: Iterable<string | null>,
  ownerId: string,
): Promise<Map<string, ActorRef>> {
  const uniq = [...new Set([...ids].filter((x): x is string => !!x))];
  const out = new Map<string, ActorRef>();
  if (uniq.length === 0) return out;
  const rows = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, uniq));
  for (const u of rows) {
    const deleted = u.email === anonymizedEmailFor(u.id);
    out.set(u.id, {
      id: deleted ? null : u.id,
      name: deleted ? tl("server.discussion.deletedUser", "удалённый пользователь") : u.displayName?.trim() || u.email,
      isOwner: canManageSynthesis({ userId: ownerId }, u.id),
    });
  }
  return out;
}

/**
 * Исполнитель для показа: только не-владелец и только аудитории с именами;
 * иначе null (строка владельца, читатель, выгрузка).
 */
export function shownActor(
  actorUserId: string | null,
  ownerId: string,
  refs: Map<string, ActorRef>,
  audience: LogAudience,
): ActorRef | null {
  if (!audience.names || !isForeignActor(actorUserId, ownerId)) return null;
  return (
    refs.get(actorUserId as string) ?? {
      id: null,
      name: tl("server.discussion.deletedUser", "удалённый пользователь"),
      isOwner: false,
    }
  );
}
