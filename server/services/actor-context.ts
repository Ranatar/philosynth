/**
 * Исполнитель операции — контекст запроса (беседа 17.1; врезка «Фаза 17»).
 *
 * С правами редактора «кто нажал» перестаёт совпадать с владельцем синтеза,
 * и это надо записать у КАЖДОЙ версии элемента и КАЖДОЙ строки журнала
 * (`element_versions.actor_user_id`, `generation_log.actor_user_id`).
 * Писателей — десятки (ручные правки, шаги плана, проходы генерации,
 * режимы, обогащения, трансформации, маркеры паузы); тянуть userId
 * параметром через все их сигнатуры значило бы однажды забыть его в новой.
 * Поэтому исполнитель живёт в AsyncLocalStorage — как язык запроса 11.2
 * (`server/i18n/locale.ts`):
 *   · HTTP: `requireAuth` / `optionalAuth` открывают контекст вокруг `next()`;
 *   · WebSocket: обработчик сообщения оборачивается явно (он вне цепочки Hono);
 *   · слот операции: `withGenerationSlot(synthesisId, userId, …)` открывает
 *     контекст сам — фон, запущенный из роута `void start…()`, и прямые
 *     вызовы сервисов в тестах несут исполнителя слота.
 * Читатели — `createVersion` (единственная точка записи версий) и
 * `genLogActor()` у каждой вставки в generation_log (сторож 4bp считает).
 *
 * Вне контекста (сиды, импорт без сессии, обслуживание) исполнителя нет —
 * NULL, что читается как «владелец» (старые строки до миграции 0019 — так же).
 *
 * Плательщик — тот же человек: `resolveBilling` получает userId слота, а
 * слот — userId запроса; владелец за редактора не платит (решение
 * пользователя 2026-11-05).
 */
import { AsyncLocalStorage } from "node:async_hooks";

interface ActorStore {
  userId: string | null;
}

const storage = new AsyncLocalStorage<ActorStore>();

/** Исполнить `fn` от имени пользователя (null — гость/служба). */
export function runWithActor<T>(userId: string | null, fn: () => T): T {
  return storage.run({ userId }, fn);
}

/** Кто исполняет текущую операцию; null — контекста нет либо гость. */
export function currentActorId(): string | null {
  return storage.getStore()?.userId ?? null;
}

/** Колонка исполнителя для вставки в generation_log:
 *  `db.insert(generationLog).values({ …, ...genLogActor() })`. */
export function genLogActor(): { actorUserId: string | null } {
  return { actorUserId: currentActorId() };
}
