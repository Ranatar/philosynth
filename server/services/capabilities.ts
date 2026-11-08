/**
 * Права смотрящего на синтез — ОДНА проверка (беседа 16.1; врезка «Фаза 16»
 * в 07). До 16.1 вопрос «владелец ли это» решался в десяти местах
 * сравнением `row.userId !== userId` (четыре копии ownerEditGate в роутах,
 * ownerGate генерации, ownerReadGate рекомендаций, четыре проверки
 * ws/handler, сервисы планов/паузы/генерации, loadSynthesisForRead) — с
 * появлением участников (рецензент, редактор) такое сравнение в каждом
 * месте пришлось бы переписывать порознь. Теперь ВСЕ сравнения с владельцем
 * живут здесь; остальной сервер спрашивает `capabilitiesFor` /
 * `canEditSynthesis` / `canManageSynthesis` (сторож 4bm красит прямое
 * сравнение вне модуля; белый список — с доводом).
 *
 * Таблица ролей (врезка «Фаза 16»):
 *   читатель (не участник) — read по видимости; discuss/edit/manage — нет;
 *   рецензент (active)     — read и приватной; discuss; edit/manage — нет;
 *   редактор (active)      — read, discuss; edit — с Фазы 17 (в 16.1 НЕТ);
 *   владелец               — всё.
 * Приглашённый (status 'invited') участником ещё не является — права
 * читателя. Гость (userId null) — читатель по видимости.
 *
 * Поведение владельца и чужих в 16.1 — побайтно прежнее: edit = владелец,
 * manage = владелец; изменилось только read у участника (пускается на
 * любой ступени) и появился discuss. Решение «кто правит» в 17.1 меняется в
 * ОДНОМ месте — `editCapability`.
 */
import { and, eq } from "drizzle-orm";

import { db, schema } from "../db/index.js";

import type { MemberRole, MemberStatus } from "@philosynth/shared/constants/discussion";
import type { Capabilities, SynthesisRole } from "@philosynth/shared/types/discussion";
import type { SynthesisVisibility } from "@philosynth/shared/types/synthesis";

const { synthesisMembers, syntheses } = schema;

/** Что нужно знать о строке syntheses для решения о правах. */
export interface OwnedSynthesisRow {
  userId: string;
  visibility: SynthesisVisibility;
}

/** Строка участия (synthesis_members) смотрящего в этом синтезе. */
export interface MembershipRow {
  role: MemberRole;
  status: MemberStatus;
}

/** Единственное место сравнения с владельцем (сторож 4bm). */
function isOwner(row: Pick<OwnedSynthesisRow, "userId">, userId: string | null): boolean {
  return userId !== null && row.userId === userId;
}

/** Действующее участие: приглашённый ещё не участник. */
function activeRole(membership: MembershipRow | null | undefined): MemberRole | null {
  return membership && membership.status === "active" ? membership.role : null;
}

/**
 * Право прямой правки, генерации и принятия предложений. 16.1 — только
 * владелец. 17.1 (решение пользователя: «редактор получает права с Фазы 17»)
 * заменяет тело на `owner || role === "editor"` — больше нигде ничего менять
 * не нужно: все гейты правки спрашивают сюда.
 */
function editCapability(owner: boolean, _role: MemberRole | null): boolean {
  return owner;
}

/**
 * Права смотрящего — чистая функция от строки синтеза, пользователя и его
 * участия (участие грузит `loadMembership`; владельцу и гостю не нужно).
 */
export function capabilitiesFor(
  row: OwnedSynthesisRow,
  userId: string | null,
  membership: MembershipRow | null = null,
): Capabilities {
  if (userId === null) {
    return {
      read: row.visibility !== "private",
      discuss: false,
      edit: false,
      manage: false,
      role: "guest",
    };
  }
  const owner = isOwner(row, userId);
  if (owner) return { read: true, discuss: true, edit: true, manage: true, role: "owner" };
  const role = activeRole(membership);
  if (role) {
    return { read: true, discuss: true, edit: editCapability(false, role), manage: false, role };
  }
  const reader: SynthesisRole = "reader";
  return {
    read: row.visibility !== "private",
    discuss: false,
    edit: false,
    manage: false,
    role: reader,
  };
}

/** Прямая правка / генерация / возобновление / планы / режимы / обогащение /
 *  трансформация / рекомендации / удаление элементов — то, что до 16.1
 *  стерегли ownerEditGate и ownerGate. В 16.1 ≡ владелец; участие — для
 *  17.1 (editCapability). */
export function canEditSynthesis(
  row: OwnedSynthesisRow,
  userId: string | null,
  membership: MembershipRow | null = null,
): boolean {
  return capabilitiesFor(row, userId, membership).edit;
}

/** Участники, видимость, удаление синтеза, копия, родословная — только
 *  владелец (и в Фазе 17 тоже). */
export function canManageSynthesis(row: Pick<OwnedSynthesisRow, "userId">, userId: string | null): boolean {
  return isOwner(row, userId);
}

/** Обсуждение: комментарии, рецензии (16.1), предложения (17). */
export function canDiscussSynthesis(
  row: OwnedSynthesisRow,
  userId: string | null,
  membership: MembershipRow | null = null,
): boolean {
  return capabilitiesFor(row, userId, membership).discuss;
}

/** Участие смотрящего в синтезе (строка synthesis_members); null — нет. */
export async function loadMembership(
  synthesisId: string,
  userId: string | null,
): Promise<MembershipRow | null> {
  if (userId === null) return null;
  const [m] = await db
    .select({ role: synthesisMembers.role, status: synthesisMembers.status })
    .from(synthesisMembers)
    .where(and(eq(synthesisMembers.synthesisId, synthesisId), eq(synthesisMembers.userId, userId)))
    .limit(1);
  return m ?? null;
}

/** Строка синтеза + права смотрящего одним вызовом; null — синтеза нет.
 *  Участие читается только у не-владельца (владельцу и гостю лишний запрос
 *  не нужен). */
export async function loadCapabilities(
  synthesisId: string,
  userId: string | null,
): Promise<{ row: typeof syntheses.$inferSelect; capabilities: Capabilities } | null> {
  const [row] = await db.select().from(syntheses).where(eq(syntheses.id, synthesisId)).limit(1);
  if (!row) return null;
  return { row, capabilities: await capabilitiesOfRow(row, userId) };
}

/** Права по уже загруженной строке (участие догружается при надобности). */
export async function capabilitiesOfRow(
  row: OwnedSynthesisRow & { id: string },
  userId: string | null,
): Promise<Capabilities> {
  if (userId === null || isOwner(row, userId)) return capabilitiesFor(row, userId, null);
  return capabilitiesFor(row, userId, await loadMembership(row.id, userId));
}
