/**
 * Состояние стрима в Redis (беседа 1.4; 05-file-structure:
 * server/ws/stream-state.ts, 01-architecture §4.4, 03-spec §3.3).
 *
 * Назначение — RECONNECT-буфер: бэкенд продолжает получать SSE от Claude,
 * даже если WebSocket клиента оборвался; при переподключении с
 * ?resume={synthesisId} клиенту отдаётся накопленный htmlSoFar и стрим
 * продолжается. Это НЕ пауза (01-arch §4.12): пауза — персистентное
 * syntheses.paused_state, переживающее сессию; stream_state — короткоживущий
 * буфер активной генерации.
 *
 * Схема ключей (совмещает обе формы из доков):
 *  - stream_state:{synthesisId}:{sectionKey} — буфер раздела (01-arch §4.4);
 *  - stream_state:{synthesisId}             — указатель на активный раздел
 *    (03-spec §3.3 ищет состояние по одному synthesisId).
 *
 * Политика отказа: как у rate-limiter (0.2) — fail-open. Redis недоступен →
 * запись/чтение молча пропускаются (reconnect-буфер деградирует, генерация
 * не падает). enableOfflineQueue=false в redis.ts гарантирует мгновенный
 * reject вместо накопления команд.
 */
import { redis } from "../redis.js";

/** TTL буфера: активная генерация раздела не живёт дольше часа. */
const STREAM_STATE_TTL_S = 3600;

export interface StreamState {
  synthesisId: string;
  sectionKey: string;
  /** Накопленный HTML раздела на момент записи */
  htmlSoFar: string;
  charsSoFar: number;
  /** 'streaming' — идёт стрим; 'error' — оборван (частичный результат) */
  status: "streaming" | "error";
  updatedAt: string;
}

const sectionKeyOf = (synthesisId: string, sectionKey: string): string =>
  `stream_state:${synthesisId}:${sectionKey}`;
const pointerKeyOf = (synthesisId: string): string =>
  `stream_state:${synthesisId}`;

/** Сохранить состояние стрима раздела (+ указатель активного раздела). */
export async function saveStreamState(state: StreamState): Promise<void> {
  try {
    await redis
      .multi()
      .set(
        sectionKeyOf(state.synthesisId, state.sectionKey),
        JSON.stringify(state),
        "EX",
        STREAM_STATE_TTL_S,
      )
      .set(
        pointerKeyOf(state.synthesisId),
        state.sectionKey,
        "EX",
        STREAM_STATE_TTL_S,
      )
      .exec();
  } catch {
    /* fail-open: Redis недоступен — буфер reconnect деградирует молча */
  }
}

/**
 * Прочитать состояние стрима. Без sectionKey — по указателю активного
 * раздела (путь reconnect §3.3: клиент знает только synthesisId).
 */
export async function getStreamState(
  synthesisId: string,
  sectionKey?: string,
): Promise<StreamState | null> {
  try {
    let key = sectionKey;
    if (!key) {
      key = (await redis.get(pointerKeyOf(synthesisId))) ?? undefined;
      if (!key) return null;
    }
    const raw = await redis.get(sectionKeyOf(synthesisId, key));
    return raw ? (JSON.parse(raw) as StreamState) : null;
  } catch {
    return null; // fail-open
  }
}

/** Удалить состояние раздела; без sectionKey — и указатель тоже. */
export async function clearStreamState(
  synthesisId: string,
  sectionKey?: string,
): Promise<void> {
  try {
    if (sectionKey) {
      await redis.del(sectionKeyOf(synthesisId, sectionKey));
      const ptr = await redis.get(pointerKeyOf(synthesisId));
      if (ptr === sectionKey) await redis.del(pointerKeyOf(synthesisId));
      return;
    }
    const ptr = await redis.get(pointerKeyOf(synthesisId));
    const keys = [pointerKeyOf(synthesisId)];
    if (ptr) keys.push(sectionKeyOf(synthesisId, ptr));
    await redis.del(...keys);
  } catch {
    /* fail-open */
  }
}
