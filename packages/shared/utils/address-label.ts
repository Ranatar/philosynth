/**
 * Название объекта обсуждения для фраз уведомлений — общее серверу (сводка
 * по почте, services/notifications.ts) и клиенту (колокольчик,
 * utils/notification-text.ts), чтобы фразы не расходились.
 *
 * Фраза уже обрамляет адрес кавычками и сама говорит, что это («оставил
 * комментарий к «{addr}»…»), поэтому здесь — только имя объекта, без вида:
 * раздел — его название; подраздел — «имя — название раздела» (ключ
 * подраздела «ключ раздела:data-section» из реестра адресов 16.1 наружу не
 * выходит); связь — «источник → цель» (без типа и служебного «|»); прочее
 * (категория, термин, тезис) — ключ, он и есть имя/метка.
 * Вид «synthesis» каждая сторона подписывает своим ключом перевода.
 */
import type { DiscussionAddress } from "../types/discussion.js";
import { KEY_LABELS } from "../constants/section-labels.js";
import { tData } from "../i18n/data.js";

const sectionTitle = (key: string): string => tData(KEY_LABELS[key as keyof typeof KEY_LABELS] ?? key);

export function addressObjectLabel(addr: Pick<DiscussionAddress, "kind" | "key">): string {
  switch (addr.kind) {
    case "section":
      return sectionTitle(addr.key);
    case "subsection": {
      const i = addr.key.indexOf(":");
      if (i <= 0) return tData(addr.key);
      return `${tData(addr.key.slice(i + 1))} — ${sectionTitle(addr.key.slice(0, i))}`;
    }
    case "edge": {
      const pair = addr.key.split("|")[0] ?? addr.key;
      return pair.replace("→", " → ");
    }
    default:
      return addr.key;
  }
}
