/**
 * Беседа 2.1 — тестовые запросы 2–5 протокола (07, «Последующие запросы»)
 * одним заходом, по команде пользователя:
 *
 *   R2 — план regen=["graph"]: каскад обнаруживает downstream
 *        (theses, dialogue), createPlan добавляет каскадные regen-шаги
 *        cascadeGenerated=true в топопорядке; затронутый результат
 *        режима (adversarial, optional graph:nodes) → regen_mode pending;
 *        весовые подсказки — из context_log (factReverse).
 *   R3 — план add=["dialogue"]:
 *        (a) синтез ["sum"] без graph/theses/glossary → upstream C1:
 *            missing hard deps (graph:nodes_compact, theses:summary —
 *            подстановок нет: их источники тоже отсутствуют, а
 *            dialogue:synthesis отсекается как selfSection) +
 *            C3-рекомендация добавить glossary (optional glossary:table);
 *        (b) синтез ["sum","graph"] → theses:summary ЗАМЕЩАЕТСЯ
 *            graph:nodes (SUBSTITUTION_MAP q=2) → жёсткой потери нет,
 *            вместо неё активная подстановка (C2).
 *   R4 — estimatePlanCost(план R2) === Σ estimateCost(isEdit) по
 *        затронутым разделам + estimateModeCost по mode-шагам
 *        (референс собирается независимо, тем же конвейером).
 *   R5 — edge case: remove=["graph"]+add=["graph"] — валиден (паттерн
 *        «заменить»), каскадных шагов ДЛЯ graph нет (delete+add — оба
 *        пользовательские), каскад для theses/dialogue присутствует.
 *
 * Плюс HTTP-смоук роутов §2.6 (живой сервер): POST → GET → PATCH
 * (skip базового regen → каскад исчезает при пересборке) → DELETE;
 * 404 на не-UUID; 403 на чужой план.
 *
 * Требует: PG+Redis подняты, миграции + 3 сида. Браузер НЕ нужен
 * (бэкенд-беседа). Запуск: npx tsx tests/test-21-requests2-5.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

process.env.DATABASE_URL ??=
  "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-secret-21";
process.env.ANTHROPIC_API_KEY ??= "sk-test-not-used";

const SERVER_PORT = 3131;
const BASE = `http://127.0.0.1:${SERVER_PORT}/api/v1`;

let passed = 0;
let failed = 0;
const fails = [];
function ok(cond, name, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    fails.push(name);
    console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`);
  }
}

/* ══ Импорты сервисов ═════════════════════════════════════════════════ */

const { db, closeDb } = await import("../server/db/index.js");
const schema = await import("../server/db/schema.js");
const { closeRedis } = await import("../server/redis.js");
const ca = await import("../server/services/cascade-analyzer.js");
const ep = await import("../server/services/edit-planner.js");
const ce = await import("../server/services/cost-estimator.js");
const se = await import("../server/services/synthesis-engine.js");
const sdb = await import("../server/services/section-defs-builder.js");
const pb = await import("../server/services/prompt-builder.js");
const prs = await import("../server/services/pause-resume-service.js");
const { buildDynamicOrder } = await import("../server/utils/topo-sort.js");
const { eq } = await import("drizzle-orm");

const { users, syntheses, synthesisLineage, contextLog, generationLog, modeResults, editPlans } =
  schema;

/* ══ Фикстуры ═════════════════════════════════════════════════════════ */

async function makeUser(email) {
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: "x", displayName: "t21" })
    .returning();
  return u;
}

async function makeSynthesis(userId, sectionOrder, phil = ["Кант", "Гегель"]) {
  const [s] = await db
    .insert(syntheses)
    .values({ userId, seed: "тестовое зерно 2.1", sectionOrder, status: "ready" })
    .returning();
  await db.insert(synthesisLineage).values(
    phil.map((name, i) => ({
      synthesisId: s.id,
      parentType: "philosopher",
      parentName: name,
      position: i,
    })),
  );
  return s;
}

const owner = await makeUser(`t21-owner-${Date.now()}@x.ru`);
const stranger = await makeUser(`t21-stranger-${Date.now()}@x.ru`);

// Синтез A: полный набор для каскада graph → theses, dialogue
const synthA = await makeSynthesis(owner.id, ["sum", "graph", "theses", "dialogue"]);
// context_log: theses фактически потребил graph:nodes (весовая подсказка)
await db.insert(contextLog).values({
  synthesisId: synthA.id,
  sectionKey: "theses",
  budget: 10000,
  totalUsed: 1234,
  entries: [
    { key: "graph:nodes", status: "found", len: 1234, priority: "required" },
    { key: "sum:goals", status: "found", len: 300, priority: "required" },
  ],
});
// generation_log: фактические размеры (isEdit-ветка оценщика)
await db.insert(generationLog).values(
  ["graph", "theses", "dialogue"].map((k, i) => ({
    synthesisId: synthA.id,
    logType: "generation",
    sectionKey: k,
    status: "done",
    outputChars: 5000 + i * 1000,
    inputTokens: 100,
    outputTokens: 200,
  })),
);
// Результат режима adversarial (optional graph:nodes → затронут regen graph)
await db.insert(modeResults).values({
  synthesisId: synthA.id,
  modeKey: "adversarial",
  paramValue: "Юм",
  htmlContent: "<div>возражения Юма</div>",
});

// Синтез B1: минимальный ["sum"] — для жёстких потерь при add=dialogue
const synthB1 = await makeSynthesis(owner.id, ["sum"]);
// Синтез B2: ["sum","graph"] — для активной подстановки theses:summary→graph:nodes
const synthB2 = await makeSynthesis(owner.id, ["sum", "graph"]);

/* ══ R2. Каскад regen=["graph"] → downstream ══════════════════════════ */

console.log("R2: план regen=[\"graph\"] — downstream-каскад");
{
  const impact = await ca.analyzeImpact(synthA.id, {
    regen: ["graph"],
    remove: [],
    add: [],
  });
  ok(
    impact.affectedSections.includes("theses") &&
      impact.affectedSections.includes("dialogue"),
    "affectedSections содержит theses и dialogue",
    JSON.stringify(impact.affectedSections),
  );
  ok(
    !impact.affectedSections.includes("graph") &&
      !impact.affectedSections.includes("sum"),
    "graph (операция плана) и sum исключены",
  );
  ok(
    impact.affectedSections.indexOf("theses") <
      impact.affectedSections.indexOf("dialogue"),
    "топопорядок: theses раньше dialogue",
  );
  const w = impact.factualWeights.theses ?? [];
  ok(
    w.some((h) => h.source === "graph" && h.chars === 1234),
    "весовая подсказка из ctxLog: theses ← graph 1234 симв.",
    JSON.stringify(impact.factualWeights),
  );
  ok(
    impact.affectedModes.some(
      (m) => m.modeKey === "adversarial" && /graph|Граф/i.test(m.reason),
    ),
    "затронут режим adversarial (optional graph:nodes)",
    JSON.stringify(impact.affectedModes),
  );

  const plan = await ep.createPlan(synthA.id, owner.id, {
    regen: ["graph"],
    remove: [],
    add: [],
  });
  globalThis.__planR2 = plan;
  const regenSteps = plan.steps.filter((s) => s.type === "regen");
  const userStep = regenSteps.find((s) => s.target === "graph");
  const cascadeTargets = plan.steps
    .filter((s) => s.cascadeGenerated)
    .map((s) => `${s.type}:${s.target}:${s.status}`);
  ok(
    userStep && userStep.status === "confirmed" && !userStep.cascadeGenerated,
    "шаг regen graph — пользовательский, confirmed",
  );
  ok(
    cascadeTargets.includes("regen:theses:pending") &&
      cascadeTargets.includes("regen:dialogue:pending"),
    "каскадные regen theses/dialogue — pending, cascadeGenerated",
    JSON.stringify(cascadeTargets),
  );
  const orderKeys = plan.steps
    .filter((s) => s.type === "regen")
    .map((s) => s.target);
  ok(
    orderKeys.indexOf("graph") < orderKeys.indexOf("theses") &&
      orderKeys.indexOf("theses") < orderKeys.indexOf("dialogue"),
    "buildPlanOrder: graph → theses → dialogue",
    JSON.stringify(orderKeys),
  );
  ok(
    cascadeTargets.some((t) => t.startsWith("regen_mode:adversarial:0")),
    "каскадный regen_mode adversarial:0 — pending",
    JSON.stringify(cascadeTargets),
  );
  ok(plan.status === "draft" && plan.estimatedCost > 0, "план draft, оценка > 0");
}

/* ══ R3. Upstream: add=["dialogue"] ═══════════════════════════════════ */

console.log("R3a: add=[\"dialogue\"] на [\"sum\"] — жёсткие потери + рекомендации");
{
  const impact = await ca.analyzeImpact(synthB1.id, {
    regen: [],
    remove: [],
    add: ["dialogue"],
  });
  const hard = impact.missingHard.find((m) => m.consumer === "dialogue");
  const hardKeys = hard ? hard.sources.map((s) => s.ctxKey) : [];
  ok(!!hard, "missingHard содержит consumer=dialogue");
  ok(
    hardKeys.includes("graph:nodes_compact"),
    "жёсткая потеря graph:nodes_compact (подстановок из наличного нет)",
    JSON.stringify(hardKeys),
  );
  ok(
    hardKeys.includes("theses:summary"),
    "жёсткая потеря theses:summary (dialogue:synthesis отсечён как self)",
    JSON.stringify(hardKeys),
  );
  ok(
    impact.recommendations.some((r) => r.src === "glossary"),
    "C3-рекомендация: добавить glossary (optional glossary:table)",
    JSON.stringify(impact.recommendations),
  );
  ok(impact.affectedSections.length === 0, "downstream пуст (некому зависеть)");
}

console.log("R3b: add=[\"dialogue\"] на [\"sum\",\"graph\"] — активная подстановка");
{
  const impact = await ca.analyzeImpact(synthB2.id, {
    regen: [],
    remove: [],
    add: ["dialogue"],
  });
  const hard = impact.missingHard.find((m) => m.consumer === "dialogue");
  const hardKeys = hard ? hard.sources.map((s) => s.ctxKey) : [];
  ok(
    !hardKeys.includes("theses:summary"),
    "theses:summary НЕ в жёстких потерях (замещён)",
    JSON.stringify(hardKeys),
  );
  ok(
    impact.activeSubstitutions.some(
      (s) => s.consumer === "dialogue" && s.ctxKey === "graph:nodes",
    ),
    "активная подстановка: dialogue ← graph:nodes (замена theses:summary)",
    JSON.stringify(impact.activeSubstitutions),
  );
}

/* ══ R4. estimatePlanCost === независимая сумма ═══════════════════════ */

console.log("R4: estimatePlanCost = Σ estimateCost + Σ estimateModeCost");
{
  const plan = globalThis.__planR2;
  const [row] = await db
    .select()
    .from(syntheses)
    .where(eq(syntheses.id, synthA.id))
    .limit(1);
  const lineage = await db
    .select()
    .from(synthesisLineage)
    .where(eq(synthesisLineage.synthesisId, synthA.id));
  const phil = lineage
    .filter((l) => l.parentType === "philosopher")
    .map((l) => l.parentName);

  const planCost = await ep.estimatePlanCost(
    synthA.id,
    row,
    phil,
    plan.steps,
  );

  // ── Независимый референс тем же конвейером 1.1/1.2 ──
  const p = {
    seed: row.seed,
    phil,
    participants: phil.map((name) => ({ type: "philosopher", name })),
    sec: row.sectionOrder.filter((k) => k !== "sum"),
    method: row.method,
    synthLevel: row.synthLevel,
    depth: row.depth,
    generationOrder: row.generationOrder,
    extGraphMetrics: row.extGraphMetrics,
    ctx: row.context,
    lang: row.lang,
  };
  const resolved = await se.resolveContextDeps(p);
  const effective = await se.buildEffectiveDeps(p.sec, resolved, p.generationOrder);
  const dyn = buildDynamicOrder(effective, p.sec, resolved, p.generationOrder);
  const fp = { ...p, sec: dyn.filter((k) => k !== "sum") };
  const defs = await sdb.buildSectionDefs(fp);
  const defsMap = new Map(defs.map((d) => [d.key, d]));
  const estimatorParams = {
    depth: fp.depth,
    generationOrder: fp.generationOrder,
    keepFullBudget: row.keepFullBudget,
  };
  const sysChars = (await pb.buildSYS(fp)).length;
  const baseStaticChars = pb.hasConceptParticipants(fp)
    ? (await pb.baseCtxStatic(fp)).length
    : (await pb.baseCtx(fp)).length;
  const actualOutputChars = await prs.loadActualOutputChars(synthA.id);

  let ref = 0;
  const sectionSteps = plan.steps.filter(
    (s) => (s.type === "regen" || s.type === "add") && s.status !== "skipped",
  );
  for (const s of sectionSteps) {
    const def = defsMap.get(s.target);
    const est = await ce.estimateCost({
      params: estimatorParams,
      passes: [[{ key: def.key, prompt: def.prompt, title: def.title }]],
      effectiveDeps: effective,
      sysChars,
      baseStaticChars,
      isEdit: true,
      actualOutputChars,
    });
    ref += est.cost;
  }
  const modeSteps = plan.steps.filter(
    (s) => s.type === "regen_mode" && s.status !== "skipped",
  );
  if (modeSteps.length > 0) {
    const modeSysChars = (await pb.buildSYS(fp, { outputMode: "mode" })).length;
    for (const s of modeSteps) {
      const mk = s.target.slice(0, s.target.indexOf(":"));
      const deps = await ca.getEffectiveModeDepsFromConfig(
        mk,
        fp.generationOrder,
        row.sectionOrder,
      );
      const est = await ce.estimateModeCost({
        deps,
        params: { depth: fp.depth },
        sysChars: modeSysChars,
      });
      ref += est.cost;
    }
  }

  const diff = Math.abs(planCost - ref);
  ok(
    diff < 1e-9,
    `estimatePlanCost (${planCost.toFixed(6)}) === референс (${ref.toFixed(6)})`,
    `diff=${diff}`,
  );
  ok(planCost > 0, "оценка положительна");
  ok(
    sectionSteps.length === 3 && modeSteps.length === 1,
    "в плане R2: 3 секционных шага (graph+theses+dialogue) и 1 mode-шаг",
    JSON.stringify({ sections: sectionSteps.length, modes: modeSteps.length }),
  );
  // Skipped не считаются
  const stepsSkipped = plan.steps.map((s) =>
    s.target === "dialogue" ? { ...s, status: "skipped" } : s,
  );
  const costSkipped = await ep.estimatePlanCost(synthA.id, row, phil, stepsSkipped);
  ok(costSkipped < planCost, "skipped-шаг исключается из оценки");
}

/* ══ R5. Edge case: remove+add graph ══════════════════════════════════ */

console.log("R5: remove=[\"graph\"]+add=[\"graph\"] — без каскада ДЛЯ graph");
{
  const plan = await ep.createPlan(synthA.id, owner.id, {
    regen: [],
    remove: ["graph"],
    add: ["graph"],
  });
  const graphCascade = plan.steps.filter(
    (s) => s.target === "graph" && s.cascadeGenerated,
  );
  ok(graphCascade.length === 0, "каскадных шагов для graph нет");
  const types = plan.steps
    .filter((s) => s.target === "graph")
    .map((s) => `${s.type}:${s.status}`)
    .sort();
  ok(
    JSON.stringify(types) === JSON.stringify(["add:confirmed", "delete:confirmed"]),
    "graph: ровно delete+add, оба пользовательские confirmed",
    JSON.stringify(types),
  );
  const delIdx = plan.steps.findIndex((s) => s.type === "delete" && s.target === "graph");
  const addIdx = plan.steps.findIndex((s) => s.type === "add" && s.target === "graph");
  ok(delIdx < addIdx, "delete graph раньше add graph");
  ok(
    plan.steps.some((s) => s.cascadeGenerated && s.target === "theses") &&
      plan.steps.some((s) => s.cascadeGenerated && s.target === "dialogue"),
    "каскад для downstream (theses, dialogue) присутствует",
  );
  // Валидация: regen∩remove — ошибка
  let err = null;
  try {
    await ep.createPlan(synthA.id, owner.id, {
      regen: ["graph"],
      remove: ["graph"],
      add: [],
    });
  } catch (e) {
    err = e;
  }
  ok(
    err instanceof ep.PlanError && err.code === "VALIDATION_ERROR",
    "regen∩remove → VALIDATION_ERROR",
  );
  await ep.deletePlan(synthA.id, plan.id, owner.id);
}

/* ══ HTTP-смоук роутов §2.6 ═══════════════════════════════════════════ */

console.log("HTTP: POST/GET/PATCH/DELETE /syntheses/:id/plans");
const server = spawn("npx", ["tsx", "server/index.ts"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(SERVER_PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
let srvLog = "";
server.stdout.on("data", (d) => (srvLog += d));
server.stderr.on("data", (d) => (srvLog += d));
try {
  let up = false;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) {
        up = true;
        break;
      }
    } catch {}
  }
  ok(up, "сервер поднялся");

  const reg = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `t21-http-${Date.now()}@x.ru`,
      password: "секрет-21-длинный",
    }),
  });
  const regBody = await reg.json();
  ok(reg.status === 201 && !!regBody.user?.id, "регистрация → 201 + user");
  if (!regBody.user?.id) throw new Error("register не дал user — дальше бессмысленно");
  // Сессию даёт login (register по 03 §2.1 возвращает только user)
  const login = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: regBody.user.email, password: "секрет-21-длинный" }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  ok(login.ok && !!cookie, "login → cookie-сессия", `status=${login.status}`);
  const auth = { Cookie: cookie, "Content-Type": "application/json" };

  // Свой синтез HTTP-пользователя
  const synthH = await makeSynthesis(regBody.user.id, ["sum", "graph", "theses"]);

  const post = await fetch(`${BASE}/syntheses/${synthH.id}/plans`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ regen: ["graph"], remove: [], add: [] }),
  });
  const postBody = await post.json();
  ok(
    post.status === 200 && postBody.plan?.status === "draft",
    "POST /plans → 200, draft",
    JSON.stringify(postBody).slice(0, 200),
  );
  const planId = postBody.plan?.id;
  if (!planId) throw new Error("POST /plans не дал план: " + JSON.stringify(postBody));
  ok(
    postBody.plan.steps.some((s) => s.cascadeGenerated && s.target === "theses"),
    "HTTP-план содержит каскадный шаг theses",
  );

  const get = await fetch(`${BASE}/syntheses/${synthH.id}/plans/${planId}`, {
    headers: auth,
  });
  const getBody = await get.json();
  ok(
    get.status === 200 &&
      getBody.plan.id === planId &&
      typeof getBody.plan.estimatedCost === "number" &&
      getBody.plan.estimatedCost > 0,
    "GET /plans/:id → план с живой оценкой",
  );

  // PATCH: skip базового regen graph → каскад theses исчезает
  const regenIdx = getBody.plan.steps.findIndex(
    (s) => s.type === "regen" && s.target === "graph",
  );
  const patch = await fetch(`${BASE}/syntheses/${synthH.id}/plans/${planId}`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({ steps: [{ index: regenIdx, status: "skipped" }] }),
  });
  const patchBody = await patch.json();
  const pSteps = patchBody.plan?.steps ?? [];
  ok(patch.status === 200, "PATCH → 200");
  ok(
    pSteps.some((s) => s.type === "regen" && s.target === "graph" && s.status === "skipped"),
    "базовый шаг переведён в skipped (остался в плане)",
    JSON.stringify(pSteps),
  );
  ok(
    !pSteps.some((s) => s.cascadeGenerated),
    "каскадные шаги исчезли после снятия единственного базового",
    JSON.stringify(pSteps),
  );

  // 403 на чужой план (владелец synthA — owner, не HTTP-пользователь)
  const alien = await fetch(`${BASE}/syntheses/${synthA.id}/plans`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ regen: ["graph"], remove: [], add: [] }),
  });
  ok(alien.status === 403, "POST на чужой синтез → 403", String(alien.status));

  // 404 на не-UUID
  const nonUuid = await fetch(`${BASE}/syntheses/abc/plans/def`, { headers: auth });
  ok(nonUuid.status === 404, "не-UUID → 404");

  const del = await fetch(`${BASE}/syntheses/${synthH.id}/plans/${planId}`, {
    method: "DELETE",
    headers: auth,
  });
  ok(del.status === 200, "DELETE → 200");
  const gone = await fetch(`${BASE}/syntheses/${synthH.id}/plans/${planId}`, {
    headers: auth,
  });
  ok(gone.status === 404, "после DELETE — 404");
} finally {
  server.kill("SIGKILL");
}

/* ══ Итог ═════════════════════════════════════════════════════════════ */

console.log(`\n${passed} ✓ / ${failed} ✗`);
if (failed) {
  console.log("Провалы:", fails.join("; "));
  if (srvLog) console.log("\n── лог сервера (хвост) ──\n" + srvLog.slice(-1500));
}
await closeDb();
await closeRedis();
process.exit(failed ? 1 : 0);
