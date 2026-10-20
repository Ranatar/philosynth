/**
 * lineage-parent-access-report.ts — ОТЧЁТ о связях родословной, записанных
 * до правила 13.2 (Д-66). Только читает; строк не снимает.
 *
 * До 13.2 ветка UUID импорта связывала ребёнка с ЛЮБЫМ существующим синтезом
 * по идентификатору из файла — без проверки владельца, видимости и
 * `allow_meta`. С 13.2 ветка идёт по правилу мета-синтеза
 * (`metaParentAllowed`, shared/utils/visibility: своя — всегда; чужая —
 * только при действенном `allow_meta`, то есть `visibility='full'` и
 * `allow_meta=true`; витрина и приватная — никогда). Уже записанные строки
 * `synthesis_lineage` (parent_type='synthesis') скрипт сверяет с ЭТИМ
 * правилом сегодня и перечисляет те, где родитель чужой и по правилу не
 * годится: ребёнок, родитель, их владельцы, ступень видимости и флаг.
 *
 * Снимать ли такие строки — решение пользователя по отчёту (07, беседа 13.2:
 * «строки не снимать»); снятие родителя — предмет 15.1 (Д-69), а связь,
 * по которой документ сгенерирован, снимать нельзя вовсе (LINEAGE_GENERATED).
 * Поэтому у скрипта один режим — отчёт; `--dry` принимается ради единства с
 * sanitize-stored-html и ничего не меняет, любой другой ключ — отказ.
 *
 * Запуск ИЗ КОРНЯ репозитория (DATABASE_URL — из окружения, как у сидов):
 *   npm run report:lineage-parents            # отчёт в stdout
 *   npm run report:lineage-parents -- --json  # то же одной строкой JSON
 * Код возврата 0 всегда, когда база прочитана (нарушения — не ошибка
 * скрипта); число нарушений — в последней строке отчёта.
 * Модуль вне описи i18n (scripts/i18n/ui-strings-lib SCOPE): вывод для
 * оператора. Служба не останавливается.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { metaParentAllowed } from "@philosynth/shared/utils/visibility";

import { closeDb, db } from "../../server/db/index.js";
import { synthesisLineage, syntheses, users } from "../../server/db/schema.js";

export interface LineageViolation {
  lineageId: string;
  position: number;
  child: { id: string; title: string; ownerId: string; ownerEmail: string | null };
  parent: {
    id: string;
    title: string;
    ownerId: string;
    ownerEmail: string | null;
    visibility: string;
    allowMeta: boolean;
  };
  /** почему не годится сегодня: 'private' | 'showcase' | 'allow_meta_off' */
  reason: "private" | "showcase" | "allow_meta_off";
}

/** Причина отказа по правилу — для человека, читающего отчёт. */
export function violationReason(parent: {
  visibility: string;
  allowMeta: boolean;
}): LineageViolation["reason"] {
  if (parent.visibility === "private") return "private";
  if (parent.visibility === "showcase") return "showcase";
  return "allow_meta_off";
}

/**
 * Все строки synthesis_lineage parent_type='synthesis' с живым родителем,
 * где родитель принадлежит другому пользователю и по правилу 13.2 сегодня
 * в мета-синтез не годится. Чистая выборка — ничего не пишет.
 */
export async function findLineageViolations(): Promise<{
  checked: number;
  violations: LineageViolation[];
}> {
  const child = alias(syntheses, "child");
  const parent = alias(syntheses, "parent");
  const childOwner = alias(users, "child_owner");
  const parentOwner = alias(users, "parent_owner");
  const rows = await db
    .select({
      lineageId: synthesisLineage.id,
      position: synthesisLineage.position,
      childId: child.id,
      childTitle: child.title,
      childOwnerId: child.userId,
      childOwnerEmail: childOwner.email,
      parentId: parent.id,
      parentTitle: parent.title,
      parentOwnerId: parent.userId,
      parentOwnerEmail: parentOwner.email,
      visibility: parent.visibility,
      showAuthor: parent.showAuthor,
      showLogs: parent.showLogs,
      showPrompts: parent.showPrompts,
      allowMeta: parent.allowMeta,
    })
    .from(synthesisLineage)
    .innerJoin(child, eq(child.id, synthesisLineage.synthesisId))
    .innerJoin(parent, eq(parent.id, synthesisLineage.parentSynthesisId))
    .leftJoin(childOwner, eq(childOwner.id, child.userId))
    .leftJoin(parentOwner, eq(parentOwner.id, parent.userId))
    .where(
      and(
        eq(synthesisLineage.parentType, "synthesis"),
        isNotNull(synthesisLineage.parentSynthesisId),
      ),
    )
    .orderBy(child.createdAt, synthesisLineage.position);

  const violations: LineageViolation[] = [];
  for (const r of rows) {
    const parentRow = {
      userId: r.parentOwnerId,
      visibility: r.visibility,
      showAuthor: r.showAuthor,
      showLogs: r.showLogs,
      showPrompts: r.showPrompts,
      allowMeta: r.allowMeta,
    };
    // Правило — то же, что у ветки UUID импорта и POST /syntheses: смотрящий —
    // владелец РЕБЁНКА (это он связывал файлом)
    if (metaParentAllowed(parentRow, r.childOwnerId)) continue;
    violations.push({
      lineageId: r.lineageId,
      position: r.position,
      child: {
        id: r.childId,
        title: r.childTitle,
        ownerId: r.childOwnerId,
        ownerEmail: r.childOwnerEmail,
      },
      parent: {
        id: r.parentId,
        title: r.parentTitle,
        ownerId: r.parentOwnerId,
        ownerEmail: r.parentOwnerEmail,
        visibility: r.visibility,
        allowMeta: r.allowMeta,
      },
      reason: violationReason({ visibility: r.visibility, allowMeta: r.allowMeta }),
    });
  }
  return { checked: rows.length, violations };
}

const REASON_TEXT: Record<LineageViolation["reason"], string> = {
  private: "родитель приватен",
  showcase: "родитель открыт витриной (содержание закрыто)",
  allow_meta_off: "автор родителя не разрешил мета-синтез (allow_meta снят)",
};

function printReport(result: Awaited<ReturnType<typeof findLineageViolations>>): void {
  console.log(
    `Связей «ребёнок → концепция-родитель» с живым родителем: ${result.checked}; ` +
      `из них чужой родитель, который по правилу 13.2 сегодня не годится: ${result.violations.length}`,
  );
  for (const v of result.violations) {
    console.log(
      `- связь ${v.lineageId} (позиция ${v.position}): ребёнок «${v.child.title}» (${v.child.id}, владелец ${v.child.ownerEmail ?? v.child.ownerId})` +
        ` → родитель «${v.parent.title}» (${v.parent.id}, владелец ${v.parent.ownerEmail ?? v.parent.ownerId}, ` +
        `visibility=${v.parent.visibility}, allow_meta=${v.parent.allowMeta}) — ${REASON_TEXT[v.reason]}`,
    );
  }
  console.log(
    result.violations.length === 0
      ? "Нарушений нет — записанные связи согласны с правилом."
      : "Строки НЕ сняты: решение по отчёту — за владельцем службы (07, беседа 13.2; снятие родителя — Фаза 15, Д-69).",
  );
}

const isMain = process.argv[1] !== undefined && /lineage-parent-access-report\.(ts|js|mts|mjs)$/.test(process.argv[1]);

if (isMain) {
  const args = process.argv.slice(2);
  const known = new Set(["--dry", "--json"]);
  const unknown = args.filter((a) => !known.has(a));
  if (unknown.length > 0) {
    console.error(
      `Неизвестные ключи: ${unknown.join(" ")}. Скрипт только отчитывается (--dry — то же самое; --json — одной строкой); снятие строк не предусмотрено — решение по отчёту.`,
    );
    process.exit(2);
  }
  findLineageViolations()
    .then((result) => {
      if (args.includes("--json")) console.log(JSON.stringify(result));
      else printReport(result);
    })
    .catch((err) => {
      console.error("Отчёт не собран:", err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
