/**
 * scripts/seed-prompts.ts — начальное заполнение prompt_templates
 * (беседа 0.3, задача 1; 01-architecture §4.1).
 *
 * Данные: server/config/prompt-templates.ts — 107 шаблонов, извлечённых
 * ДОСЛОВНО из philosynth.html генератором scripts/extract-seed-data.mjs
 * (buildSYS → system*, buildQualityReinforcement, STOP_SIGNAL,
 * METHOD_* → method.{method}.{section}, LEVEL_* → level.{level}.{aspect},
 * MODE_CONFIG → mode.{modeKey}); p-зависимые словоформы заменены
 * плейсхолдерами {{participants}} / {{participant_word}} /
 * {{participant_word_sg}} / {{each_participant}} / {{min_words}} и т.д.
 *
 * Идемпотентность (в духе патч-скриптов проекта, отчёт skip/fail):
 *  - ключа нет → INSERT version=1, is_active=true            [created]
 *  - активная версия с тем же телом уже есть → пропуск        [skip]
 *  - тело изменилось → новая версия max+1, активация, прежняя
 *    деактивируется (история сохраняется)                     [updated]
 *
 * Запуск: npm run seed:prompts   (или: npx tsx scripts/seed-prompts.ts)
 */
import { and, eq, max } from "drizzle-orm";

import { closeDb, db, schema } from "../server/db/index.js";
import { SEED_PROMPT_TEMPLATES } from "../server/config/prompt-templates.js";
import { SEED_SECTION_TEMPLATES } from "../server/config/section-templates.js";

const { promptTemplates } = schema;

/**
 * Беседа 1.2: к шаблонам 0.3 добавлены каркасы разделов section.{key}.*
 * (server/config/section-templates.ts, генератор
 * scripts/extract-section-templates.mjs) — закрытие TODO-3 беседы 0.3.
 */
const ALL_TEMPLATES = [...SEED_PROMPT_TEMPLATES, ...SEED_SECTION_TEMPLATES];

interface Report {
  created: string[];
  updated: string[];
  skipped: string[];
  failed: { key: string; error: string }[];
}

async function seedOne(
  t: (typeof ALL_TEMPLATES)[number],
  report: Report,
): Promise<void> {
  const active = await db.query.promptTemplates.findFirst({
    where: and(
      eq(promptTemplates.key, t.key),
      eq(promptTemplates.isActive, true),
    ),
    columns: { body: true },
  });

  if (active && active.body === t.body) {
    report.skipped.push(t.key);
    return;
  }

  await db.transaction(async (tx) => {
    const agg = await tx
      .select({ maxVersion: max(promptTemplates.version) })
      .from(promptTemplates)
      .where(eq(promptTemplates.key, t.key));
    const maxVersion = agg[0]?.maxVersion ?? null;
    const nextVersion = (maxVersion ?? 0) + 1;

    if (maxVersion !== null) {
      await tx
        .update(promptTemplates)
        .set({ isActive: false })
        .where(
          and(eq(promptTemplates.key, t.key), eq(promptTemplates.isActive, true)),
        );
    }
    await tx.insert(promptTemplates).values({
      key: t.key,
      version: nextVersion,
      body: t.body,
      isActive: true,
      description: t.description,
      createdBy: null, // системный seed
    });

    (nextVersion === 1 ? report.created : report.updated).push(t.key);
  });
}

async function main(): Promise<void> {
  console.log(
    `Заполнение prompt_templates: ${ALL_TEMPLATES.length} шаблонов ` +
      `(${SEED_PROMPT_TEMPLATES.length} из 0.3 + ${SEED_SECTION_TEMPLATES.length} section.* из 1.2)…`,
  );
  const report: Report = { created: [], updated: [], skipped: [], failed: [] };

  for (const t of ALL_TEMPLATES) {
    try {
      await seedOne(t, report);
    } catch (err) {
      report.failed.push({ key: t.key, error: (err as Error).message });
    }
  }

  console.log(
    `\nИтог: created=${report.created.length}, updated=${report.updated.length}, ` +
      `skip=${report.skipped.length}, fail=${report.failed.length}`,
  );
  if (report.created.length)
    console.log(`  created: ${report.created.slice(0, 10).join(", ")}${report.created.length > 10 ? ", …" : ""}`);
  if (report.updated.length)
    console.log(`  updated: ${report.updated.join(", ")}`);
  for (const f of report.failed) console.error(`  FAIL ${f.key}: ${f.error}`);

  const total = await db.$count(promptTemplates);
  const active = await db.$count(promptTemplates, eq(promptTemplates.isActive, true));
  console.log(`В БД: ${total} строк prompt_templates, из них активных: ${active}`);

  if (report.failed.length > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("seed-prompts: фатальная ошибка:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
