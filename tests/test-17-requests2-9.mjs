/**
 * Беседа 1.7 — тестовые запросы 2–9 протокола (07, «Последующие запросы»
 * беседы 1.7) одним заходом, по команде пользователя.
 *
 * ЗАПУСК: npx tsx tests/test-17-requests2-9.mjs   (из корня репо)
 *   — именно tsx: R3 (формы/цвета) импортирует клиентские TS-модули
 *     (graph-utils.ts, graph-geometry.ts) напрямую; расширение .mjs
 *     выбрано сознательно — tests/*.mts попадает под typecheck:scripts
 *     (NodeNext), которому клиентские bundler-импорты не по зубам.
 *
 * Харнесс — по образцу test-16b-requests2-9.mjs: живой сервер
 * (node --import tsx, преflight сирот — грабля 1.6) :3000 + vite :5199 +
 * живые PG/Redis + puppeteer-core с системным Chromium
 * /opt/google/chrome/chrome (headless "shell", кэш puppeteer пуст —
 * грабля 0.6) + ФЛАГ --enable-unsafe-swiftshader: WebGL для three.js
 * работает через SwiftShader (проверено пробой: ANGLE/Vulkan/SwiftShader).
 * Мок Claude не нужен — генерация не запускается.
 *
 * Данные — прямыми вставками в БД (categories / category_edges /
 * cluster_labels): графу нужен детерминированный набор ролей/типов/
 * направлений, а не конвейер.
 *
 * Методика 3D (сцена three.js не интроспектируется снаружи):
 *  - «рендерится» = канвас + стабилизация кадра + скриншот-диффы на
 *    действия (orbit/zoom/toggle меняют кадр, покой — не меняет);
 *  - «узлы видны» = «охота» курсором по сетке до появления тултипа —
 *    тултип доказывает raycast-попадание в реальную геометрию;
 *  - drag узла = cursor:grabbing на канвасе во время перетаскивания.
 * 2D проверяется по DOM (SVG) — счётчики, атрибуты, формы, drag.
 *
 * РАСХОЖДЕНИЕ ПРОТОКОЛА (в патч-копилку 1.7): запрос 3 в 07 сверяет
 * «онтологическая → #e74c3c, эпистемологическая → #3498db» — это
 * СТАТИЧЕСКАЯ палитра TC доревизии v10; первый запрос той же беседы
 * требует динамические палитры (_TC_HUE_SEEDS). Тест сверяет hue
 * динамической палитры с сидами (онтологическ→215, эпистемологическ→145)
 * и попарную различимость цветов.
 *
 * R9 (touch): CDP Input.dispatchTouchEvent (pinch-zoom, orbit, tap
 * спиралью от центра). Если CDP не потянет — фиксируется как ручная
 * проверка (протокол это разрешает), мышью НЕ имитируется.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";
import puppeteer from "puppeteer-core";
import * as THREE from "three";

// R3: клиентские модули напрямую (tsx транспилирует TS на лету)
import {
  buildGFromGraphData,
  edgeTypeStyle,
  graphState,
  nodeSymbolPath,
  typeColor,
  _hexToHSL,
} from "../client/src/components/graph/graph-utils.ts";
import { nodeGeometry3D } from "../client/src/utils/graph-geometry.ts";

const SERVER_PORT = 3000; // vite proxy → :3000
const VITE_PORT = 5199;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const UI = `http://127.0.0.1:${VITE_PORT}`;
const DB_URL = "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const CHROME = "/opt/google/chrome/chrome";

let passed = 0;
let failed = 0;
const fails = [];
function ok(cond, name) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    fails.push(name);
    console.log(`  ✗ ${name}`);
  }
}

/* ════ Сервер и vite (по 16b) ════════════════════════════════════════ */

let serverProc, viteProc;
let serverLog = "", viteLog = "";

async function assertPortFree(url, label) {
  try {
    const r = await fetch(url);
    if (r.ok) throw new Error(`${label} уже отвечает — сирота от прошлого прогона (pkill -9 -f "[t]sx"; pkill -9 -f "[v]ite")`);
  } catch (e) {
    if (String(e).includes("сирота")) throw e;
    /* ECONNREFUSED — порт свободен */
  }
}

async function startServer() {
  await assertPortFree(`${API}/health`, "health сервера");
  serverProc = spawn(process.execPath, ["--import", "tsx", "index.ts"], {
    cwd: new URL("../server/", import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      ANTHROPIC_API_KEY: "mock-key-unused",
      CLIENT_ORIGIN: UI,
      DATABASE_URL: DB_URL,
      REDIS_URL: "redis://localhost:6379",
      RATE_LIMIT_HTTP_PER_MINUTE: "100000", // per-IP лимитер — грабля 1.6
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProc.stdout.on("data", (d) => (serverLog += d));
  serverProc.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${API}/health`);
      if (r.ok) return;
    } catch { /* поднимается */ }
    await sleep(300);
  }
  throw new Error("сервер не поднялся:\n" + serverLog.slice(-2000));
}

async function startVite() {
  await assertPortFree(UI + "/", "vite");
  // vite напрямую нодой (не npx): SIGKILL должен убивать САМ vite —
  // npx-обёртка при SIGKILL оставляла vite-сироту (вариант грабли 1.6);
  // бинарь — в КОРНЕВОМ node_modules (воркспейс), client/node_modules пуст
  viteProc = spawn(
    process.execPath,
    ["../node_modules/vite/bin/vite.js", "--port", String(VITE_PORT), "--strictPort"],
    {
      cwd: new URL("../client/", import.meta.url).pathname,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  viteProc.stdout.on("data", (d) => (viteLog += d));
  viteProc.stderr.on("data", (d) => (viteLog += d));
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(UI + "/");
      if (r.ok) return;
    } catch { /* поднимается */ }
    await sleep(300);
  }
  throw new Error("vite не поднялся:\n" + viteLog.slice(-2000));
}

/* ════ API/БД-хелперы ════════════════════════════════════════════════ */

async function makeUser(tag) {
  const email = `t17-${tag}-${Date.now()}@test.local`;
  const password = "Passw0rd!17";
  const r = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, displayName: `T17 ${tag}` }),
  });
  if (!r.ok) throw new Error("register: " + (await r.text()));
  return { email, password };
}

function secWrap(num, title, inner) {
  return (
    `<div class="doc-section">` +
    `<div class="section-num">РАЗДЕЛ ${num}</div>` +
    `<div class="section-title">${title}</div>` +
    `<div class="doc-content">${inner}</div>` +
    `</div>`
  );
}
const SUM_HTML = secWrap(1, "Резюме синтеза", `<p>Материал для страницы.</p>`);

async function insertSynthesis(sql, userId, over = {}) {
  const o = {
    title: "Синтез",
    status: "ready",
    isPublic: false,
    docNum: "",
    sectionOrder: ["sum"],
    extGraph: false,
    ...over,
  };
  const [row] = await sql`
    INSERT INTO syntheses (user_id, title, status, seed, context, is_public,
      doc_num, method, synth_level, depth, generation_order, lang,
      section_order, structure_sections, capsule_html, ext_graph_metrics,
      total_input_tokens, total_output_tokens, total_cost_usd)
    VALUES (${userId}, ${o.title}, ${o.status}, '', '', ${o.isPublic},
      ${o.docNum}, 'dialectical', 'transformative', 'standard',
      'architectural', 'Russian', ${sql.json(o.sectionOrder)},
      ${sql.json(o.sectionOrder)}, '', ${o.extGraph}, 0, 0, 0)
    RETURNING id`;
  return row.id;
}

async function insertSection(sql, synthesisId, key, num, title, html) {
  await sql`
    INSERT INTO sections (synthesis_id, key, section_num, title, html_content)
    VALUES (${synthesisId}, ${key}, ${num}, ${title}, ${html})`;
}

async function insertCategory(sql, synthesisId, i, o) {
  const [row] = await sql`
    INSERT INTO categories (synthesis_id, name, type, definition, origin,
      centrality, certainty, historical_significance, innovation_degree,
      clarity, breadth, depth_score, applicability,
      cluster_indices, structural_roles, procedural_roles, has_reflexive,
      position)
    VALUES (${synthesisId}, ${o.name}, ${o.type}, ${o.def ?? "Определение " + o.name},
      ${o.orig ?? ""}, ${o.cen ?? 0.5}, ${o.cert ?? 0.6},
      ${o.histSig ?? 0.5}, ${o.innov ?? 1}, ${o.clarity ?? 0},
      ${o.breadth ?? 0}, ${o.depth ?? 0}, ${o.applic ?? 0},
      ${sql.json(o.clusters ?? [])}, ${sql.json(o.sroles ?? [])},
      ${sql.json(o.proles ?? [])}, ${o.refl ?? false}, ${i})
    RETURNING id`;
  return row.id;
}

async function insertEdge(sql, synthesisId, i, srcId, tgtId, o) {
  await sql`
    INSERT INTO category_edges (synthesis_id, source_id, target_id,
      description, edge_type, direction, strength, certainty,
      historical_support, logical_necessity, innovation_degree,
      context_dependency, position)
    VALUES (${synthesisId}, ${srcId}, ${tgtId}, ${o.desc ?? ""},
      ${o.type}, ${o.dir ?? "однонаправленная"}, ${o.str ?? 0.5},
      ${o.cert ?? 0.5}, ${o.hist ?? 0.5}, ${o.logNec ?? 0.5},
      ${o.innov ?? 1}, ${o.ctx ?? 0.5}, ${i})`;
}

async function insertClusterLabel(sql, synthesisId, idx, label) {
  await sql`
    INSERT INTO cluster_labels (synthesis_id, cluster_index, label)
    VALUES (${synthesisId}, ${idx}, ${label})`;
}

/* ════ Браузерные хелперы ════════════════════════════════════════════ */

async function fill(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 8000 });
  await page.$eval(selector, (el, v) => {
    const proto = el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

const norm = (s) => s.replace(/\s+/g, " ");

async function pageText(page) {
  return page.evaluate(() => document.body.innerText);
}

async function waitText(page, substr, timeoutMs = 10000) {
  await page.waitForFunction(
    (s) => document.body.innerText.replace(/\s+/g, " ").includes(s),
    { timeout: timeoutMs },
    norm(substr),
  );
}

/** Клик по кнопке с текстом (button текстовым содержимым) */
async function clickButton(page, text) {
  const found = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.trim().includes(t),
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, text);
  if (!found) throw new Error(`кнопка «${text}» не найдена`);
}

/** Открыть модалку графа со страницы синтеза */
async function openGraph(page) {
  await clickButton(page, "Граф");
  await page.waitForSelector(".gm-overlay", { timeout: 10000 });
}

async function closeGraph(page) {
  await page.evaluate(() => {
    document.querySelector(".gm-btn.close")?.click();
  });
  await page.waitForFunction(() => !document.querySelector(".gm-overlay"), {
    timeout: 5000,
  });
}

/** Скриншот тела модалки (Buffer) */
async function shotBody(page) {
  const el = await page.$(".gm-body");
  return Buffer.from(await el.screenshot());
}

/** Дождаться статичного кадра 3D (два подряд равных скриншота) */
async function waitStaticFrame(page, timeoutMs = 10000) {
  const t0 = Date.now();
  let prev = await shotBody(page);
  while (Date.now() - t0 < timeoutMs) {
    await sleep(350);
    const cur = await shotBody(page);
    if (cur.equals(prev)) return cur;
    prev = cur;
  }
  return null; // не стабилизировался
}

/**
 * «Охота» на узел в 3D: сетка позиций над канвасом, mousemove до
 * появления тултипа. У РЁБЕР тоже есть тултип (desc+[тип], без имён) —
 * поэтому при переданном списке имён точка засчитывается только если
 * тултип содержит имя узла. Возвращает { x, y, text } или null.
 */
async function huntNode3d(page, names = null, center = null) {
  const rect = await page.$eval(".gm-view canvas", (cv) => {
    const r = cv.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const cx = center ? center.x : rect.x + rect.w / 2;
  const cy = center ? center.y : rect.y + rect.h / 2;
  // Относительные шаги: раскладка-«кольцо» уводит узлы к краям канваса
  const fr = [0, -0.08, 0.08, -0.16, 0.16, -0.24, 0.24, -0.32, 0.32, -0.4, 0.4];
  const steps = { x: fr.map((f) => f * rect.w), y: fr.map((f) => f * rect.h) };
  for (const dy of steps.y) {
    for (const dx of steps.x) {
      await page.mouse.move(cx + dx, cy + dy);
      await sleep(70);
      const tip = await page.evaluate(() => {
        const t = [...document.querySelectorAll(".gm-overlay > div")].find(
          (d) => d.style.pointerEvents === "none",
        );
        if (!t || t.style.display === "none") return null;
        return t.textContent;
      });
      if (tip && (!names || names.some((n) => tip.includes(n))))
        return { x: cx + dx, y: cy + dy, text: tip };
    }
  }
  return null;
}



/** Адресный клик по узлу 2D ПО ИМЕНИ (датум d3 в __data__): nth-порядок
 *  не инвариантен — hover делает raise() и переставляет g в конец DOM */
async function click2dNode(page, name) {
  await page.evaluate((nm) => {
    const g = [...document.querySelectorAll(".node-g")].find(
      (el) => el.__data__?.name === nm,
    );
    g?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, name);
}

/** Экранный центр узла 2D по имени (для честных hover/click мышью) */
async function nodeCenter2dByName(page, name) {
  return page.evaluate((nm) => {
    const g = [...document.querySelectorAll(".node-g")].find(
      (el) => el.__data__?.name === nm,
    );
    if (!g) return null;
    const r = g.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, name);
}

/** attr узла 2D по имени */
async function nodeAttr2dByName(page, name, attr) {
  return page.evaluate(([nm, a]) => {
    const g = [...document.querySelectorAll(".node-g")].find(
      (el) => el.__data__?.name === nm,
    );
    return g ? g.getAttribute(a) : "«узел не найден»";
  }, [name, attr]);
}

/** Адресный клик по n-й хит-зоне ребра 2D */
async function click2dEdgeHit(page, idx) {
  await page.evaluate((i) => {
    document.querySelectorAll(".edge-hit")[i]?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
  }, idx);
}

/**
 * Заведомо пустая точка 3D-канваса: elementFromPoint === canvas И после
 * mousemove тултип НЕ показался (тултип есть и у узлов, и у рёбер).
 * Для honesty orbit-жеста (клик по хитбоксу ребра НЕ ставит isOrbit) и
 * tap-сброса (tap по узлу — не сброс).
 */
async function emptyPoint3d(page) {
  const rect = await page.$eval(".gm-view canvas", (cv) => {
    const r = cv.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  for (const [fx, fy] of [
    [0.38, -0.38], [-0.38, -0.38], [0.38, 0.38], [0.3, 0], [0, -0.35],
    [-0.3, 0.2], [0.2, 0.3], [-0.2, -0.2], [0.42, 0.1], [0, 0.4],
  ]) {
    const x = cx + fx * rect.w;
    const y = cy + fy * rect.h;
    const clear = await page.evaluate(([px, py]) => {
      const cv = document.querySelector(".gm-view canvas");
      return document.elementFromPoint(px, py) === cv;
    }, [x, y]);
    if (!clear) continue;
    await page.mouse.move(x, y);
    await sleep(90);
    const tipShown = await page.evaluate(() => {
      const t = [...document.querySelectorAll(".gm-overlay > div")].find(
        (d) => d.style.pointerEvents === "none",
      );
      return t && t.style.display !== "none";
    });
    if (!tipShown) return { x, y };
  }
  return { x: cx + rect.w * 0.4, y: cy - rect.h * 0.4 }; // fallback: угол
}

/** Дождаться остановки 2D-симуляции: два одинаковых замера позиций */
async function waitSim2dSettled(page, timeoutMs = 9000) {
  const snap = () =>
    page.$$eval(".node-g", (els) =>
      els.map((e) => e.getAttribute("transform")).join("|"),
    );
  const t0 = Date.now();
  let prev = await snap();
  while (Date.now() - t0 < timeoutMs) {
    await sleep(400);
    const cur = await snap();
    if (cur === prev) return true;
    prev = cur;
  }
  return false;
}

/** Центры .node-g (2D) в порядке данных (== порядок position категорий) */
async function nodeCenters2d(page) {
  return page.$$eval(".node-g", (els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }),
  );
}

const hueOf = (hex) => _hexToHSL(hex).h;
const hueDist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/* ════ R3: формы и палитры (модульно, без браузера) ══════════════════ */

function moduleTestsR3() {
  console.log("R3: формы узлов и палитры (модульный уровень)");

  // Фикстура GraphData → G (адаптер как в GraphModal)
  const mkCat = (name, type, sroles = [], proles = []) => ({
    id: name, synthesisId: "s", name, type, definition: "", origin: "",
    centrality: 0.5, certainty: 0.6, historicalSignificance: 0.5,
    innovationDegree: 1, clarity: 0, breadth: 0, depthScore: 0,
    applicability: 0, typeCatalogId: null, clusterIndices: [],
    structuralRoles: sroles, proceduralRoles: proles, hasReflexive: false,
    position: 0, source: "generated", createdAt: "", updatedAt: "",
  });
  const types = [
    "онтологическая", "эпистемологическая", "этическая", "метафизическая",
    "политическая", "эстетическая", "герменевтическая", "феноменологическая",
    "экзистенциальная", "практическая", "аналитическая", "социальная",
  ];
  const cats = types.map((t, i) => mkCat("N" + i, t));
  cats[0].proceduralRoles = ["synthesis"];
  const mkEdge = (type) => ({
    id: type, synthesisId: "s", sourceId: "N0", targetId: "N1",
    description: "", edgeType: type, direction: "однонаправленная",
    strength: 0.5, certainty: 0.5, historicalSupport: 0.5,
    logicalNecessity: 0.5, innovationDegree: 1, contextDependency: 0.5,
    typeCatalogId: null, position: 0, sourceOrigin: "generated", createdAt: "",
  });
  const edgeTypes = [
    "иерархическая", "диалектическая", "каузальная", "противоречие",
    "корреляционная", "дополнительность", "развитие", "основание",
  ];
  buildGFromGraphData(
    {
      categories: cats,
      edges: edgeTypes.map(mkEdge),
      clusters: [],
      topology: { clusters: [], structuralRoles: [], proceduralRoles: [], hasReflexiveEdges: false },
    },
    false,
  );

  // ── Геометрии по ролям (three r128) ──
  ok(nodeGeometry3D("synthesis", 2) instanceof THREE.OctahedronGeometry, "synthesis → октаэдр");
  ok(nodeGeometry3D("thesis", 2) instanceof THREE.TetrahedronGeometry, "thesis → тетраэдр");
  ok(nodeGeometry3D("antithesis", 2) instanceof THREE.TetrahedronGeometry, "antithesis → тетраэдр (переворот кватернионом в build3D)");
  ok(nodeGeometry3D("bridge", 2) instanceof THREE.BoxGeometry, "bridge → куб (wireframe — маркером в build3D)");
  ok(nodeGeometry3D("generative", 2) instanceof THREE.IcosahedronGeometry, "generative → икосаэдр");
  ok(nodeGeometry3D("central", 2) instanceof THREE.DodecahedronGeometry, "central → додекаэдр");
  ok(nodeGeometry3D(null, 2) instanceof THREE.SphereGeometry, "без роли → сфера");

  // ── Динамические палитры узлов: hue от сидов, попарная различимость ──
  const hOnt = hueOf(typeColor("онтологическая"));
  const hEpi = hueOf(typeColor("эпистемологическая"));
  ok(hueDist(hOnt, 215) <= 20, `онтологическая → hue≈215 (сид), факт ${hOnt.toFixed(0)}`);
  ok(hueDist(hEpi, 145) <= 20, `эпистемологическая → hue≈145 (сид), факт ${hEpi.toFixed(0)}`);
  const colors = types.map((t) => typeColor(t));
  let distinct = true;
  for (let i = 0; i < colors.length; i++)
    for (let j = i + 1; j < colors.length; j++)
      if (colors[i] === colors[j]) distinct = false;
  ok(distinct, "цвета 12 типов (без подстрочных пар) попарно различны");


  // ── Стили рёбер: dash-семантика ──
  ok(edgeTypeStyle("противоречие").dash === "7,3", "противоречие → пунктир 7,3");
  ok(edgeTypeStyle("корреляционная").dash === "2,3", "корреляционная → пунктир 2,3");
  ok(edgeTypeStyle("иерархическая").dash === null, "иерархическая → сплошная");
  ok(
    edgeTypeStyle("противоречие / корреляционная").dash === "7,3",
    "смешанный тип: dash от типа с высшим приоритетом (противоречие)",
  );

  // ── 2D-формы: nodeSymbolPath по ролям ──
  const sd = (roles) => ({ cen: 0.5, roles: new Set(roles) });
  const octo = nodeSymbolPath(sd(["synthesis"]));
  ok(typeof octo === "string" && octo.startsWith("M") && octo.split("L").length === 8, "synthesis → восьмиугольник (polyPath 8)");
  ok(nodeSymbolPath(sd([])) === null, "без роли → null (circle)");
  ok(typeof nodeSymbolPath(sd(["thesis"])) === "string", "thesis → path (d3.symbolTriangle)");

  // В КОНЦЕ function: rebuild затирает _edgeStyleMap — dash-проверки выше.
  // КВИРК ИСХОДНИКА (порт 1:1, typeColor [556]: lp.includes(k)||k.includes(lp)):
  // «логическая» — подстрока «онтологическая» → получает ЕЁ цвет при
  // совместном присутствии. В патч-копилку 1.7 (наблюдение, не дефект порта).
  buildGFromGraphData(
    {
      categories: [mkCat("Q0", "онтологическая"), mkCat("Q1", "логическая")],
      edges: [],
      clusters: [],
      topology: { clusters: [], structuralRoles: [], proceduralRoles: [], hasReflexiveEdges: false },
    },
    false,
  );
  ok(
    typeColor("логическая") === typeColor("онтологическая"),
    "квирк исходника: «логическая» ⊂ «онтологическая» → один цвет (fuzzy-поиск)",
  );
}

/* ════ Основной сценарий ═════════════════════════════════════════════ */

async function main() {
  moduleTestsR3();

  await startServer();
  await startVite();
  const sql = postgres(DB_URL, { max: 3, onnotice: () => {} });

  /* ── Пользователи ── */
  const A = await makeUser("owner");
  const B = await makeUser("other");
  const [aRow] = await sql`SELECT id FROM users WHERE email = ${A.email}`;
  const [bRow] = await sql`SELECT id FROM users WHERE email = ${B.email}`;

  /* ── S_MAIN: 12 категорий, все роли/направления, 2 кластера ── */
  const S_MAIN = await insertSynthesis(sql, aRow.id, {
    title: "Граф-синтез T17", docNum: "PS-1700-T17",
    sectionOrder: ["sum", "graph"],
  });
  await insertSection(sql, S_MAIN, "sum", 1, "Резюме синтеза", SUM_HTML);
  const C = [];
  const defs = [
    { name: "Синтез-Ядро",       type: "онтологическая",    cen: 0.9,  cert: 0.9, clusters: [0], sroles: ["central"],    proles: ["synthesis"] },
    { name: "Тезис-Разум",       type: "эпистемологическая", cen: 0.6, cert: 0.8, clusters: [0], proles: ["thesis"] },
    { name: "Антитезис-Опыт",    type: "эпистемологическая", cen: 0.6, cert: 0.7, clusters: [0], proles: ["antithesis"] },
    { name: "Мост-Опосредование", type: "логическая",        cen: 0.5, cert: 0.6, clusters: [0, 1], sroles: ["bridge"] },
    { name: "Генератор-Различие", type: "метафизическая",    cen: 0.7, cert: 0.8, clusters: [1], sroles: ["generative"] },
    { name: "Ядро-Пересечение",  type: "этическая",          cen: 0.55, cert: 0.7, clusters: [1], sroles: ["core"] },
    { name: "Периферия-Деталь",  type: "эстетическая",       cen: 0.2, cert: 0.4, clusters: [1], sroles: ["peripheral"] },
    { name: "Деконструкт",       type: "герменевтическая",   cen: 0.5, cert: 0.5, proles: ["deconstructed"] },
    { name: "Пересборка",        type: "феноменологическая", cen: 0.5, cert: 0.6, proles: ["reassembled"] },
    { name: "Рефлексия-Само",    type: "экзистенциальная",   cen: 0.45, cert: 0.6, refl: true },
    { name: "Основание-База",    type: "практическая",       cen: 0.4, cert: 0.6, proles: ["foundation"] },
    { name: "Верификатор",       type: "аналитическая",      cen: 0.5, cert: 0.7, proles: ["verifying"] },
  ];
  for (let i = 0; i < defs.length; i++)
    C.push(await insertCategory(sql, S_MAIN, i, defs[i]));
  await insertClusterLabel(sql, S_MAIN, 0, "I — Ядро синтеза");
  await insertClusterLabel(sql, S_MAIN, 1, "II — Порождение");
  const E = [
    [0, 1, { type: "диалектическая", str: 0.8, desc: "тезис из ядра" }],
    [0, 2, { type: "диалектическая", str: 0.7, desc: "антитезис из ядра" }],
    [1, 2, { type: "противоречие", dir: "двунаправленная", str: 0.9, desc: "взаимное противоречие" }],
    [3, 0, { type: "иерархическая", str: 0.6, desc: "мост к ядру" }],
    [4, 5, { type: "каузальная", str: 0.5, desc: "порождение пересечения" }],
    [9, 9, { type: "развитие", dir: "рефлексивная", str: 0.6, desc: "саморазвитие" }],
    [6, 10, { type: "корреляционная", str: 0.2, desc: "слабая корреляция" }],
    [8, 7, { type: "дополнительность", str: 0.5, desc: "пересборка дополняет" }],
    [11, 0, { type: "основание", str: 0.25, desc: "верификация основания" }],
  ];
  for (let i = 0; i < E.length; i++)
    await insertEdge(sql, S_MAIN, i, C[E[i][0]], C[E[i][1]], E[i][2]);

  /* ── S_EXT: расширенные метрики (ext_graph_metrics=true) ── */
  const S_EXT = await insertSynthesis(sql, aRow.id, {
    title: "Расширенный граф T17", docNum: "PS-1701-T17",
    sectionOrder: ["sum", "graph"], extGraph: true,
  });
  await insertSection(sql, S_EXT, "sum", 1, "Резюме синтеза", SUM_HTML);
  const X0 = await insertCategory(sql, S_EXT, 0, {
    name: "Расширенное-Ядро", type: "онтологическая", cen: 0.8, cert: 0.9,
    histSig: 0.8, innov: 4, clarity: 0.7, breadth: 0.6, depth: 0.9, applic: 0.5,
    proles: ["synthesis"],
  });
  const X1 = await insertCategory(sql, S_EXT, 1, {
    name: "Расширенный-Тезис", type: "эпистемологическая", cen: 0.5,
    histSig: 0.4, innov: 2, clarity: 0.5, breadth: 0.3, depth: 0.4, applic: 0.6,
  });
  await insertEdge(sql, S_EXT, 0, X0, X1, {
    type: "диалектическая", str: 0.7, desc: "расширенная связь",
    cert: 0.9, hist: 0.7, logNec: 0.8, innov: 3, ctx: 0.4,
  });

  /* ── S_ONE: один узел без рёбер; S_EMPTY: пустой граф ── */
  const S_ONE = await insertSynthesis(sql, aRow.id, {
    title: "Один узел T17", docNum: "PS-1702-T17", sectionOrder: ["sum", "graph"],
  });
  await insertSection(sql, S_ONE, "sum", 1, "Резюме синтеза", SUM_HTML);
  await insertCategory(sql, S_ONE, 0, { name: "Одинокая-Категория", type: "онтологическая" });

  const S_EMPTY = await insertSynthesis(sql, aRow.id, {
    title: "Пустой граф T17", docNum: "PS-1703-T17",
  });
  await insertSection(sql, S_EMPTY, "sum", 1, "Резюме синтеза", SUM_HTML);

  /* ── Чужие: публичный с графом и приватный ── */
  const S_PUBB = await insertSynthesis(sql, bRow.id, {
    title: "Чужой публичный граф T17", docNum: "PS-1704-T17", isPublic: true,
    sectionOrder: ["sum", "graph"],
  });
  await insertSection(sql, S_PUBB, "sum", 1, "Резюме синтеза", SUM_HTML);
  const P0 = await insertCategory(sql, S_PUBB, 0, { name: "Публичная-А", type: "онтологическая" });
  const P1 = await insertCategory(sql, S_PUBB, 1, { name: "Публичная-Б", type: "этическая" });
  await insertEdge(sql, S_PUBB, 0, P0, P1, { type: "каузальная", str: 0.5 });

  const S_PRIVB = await insertSynthesis(sql, bRow.id, {
    title: "Чужой приватный граф T17", docNum: "PS-1705-T17",
    sectionOrder: ["sum", "graph"],
  });
  await insertSection(sql, S_PRIVB, "sum", 1, "Резюме синтеза", SUM_HTML);
  await insertCategory(sql, S_PRIVB, 0, { name: "Приватная-Категория", type: "онтологическая" });

  /* ── Браузер ── */
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "shell",
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--enable-unsafe-swiftshader", // WebGL через SwiftShader (проба ✓)
      // Фоновые страницы: без этих флагов вторая (мобильная) страница
      // получает замороженный rAF — appear-анимация не идёт, меши в
      // scale 0, raycast мимо всего, кадр байт-в-байт неподвижен (R9)
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push("console: " + m.text());
  });

  try {
    /* ── Логин A ── */
    await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
    await fill(page, "input[type=email]", A.email);
    await fill(page, "input[type=password]", A.password);
    await page.click("button[type=submit]");
    await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 20000 });

    /* ══ R2: Graph3D — рендер, узлы/рёбра, orbit/zoom/drag ══ */
    console.log("R2: Graph3D (рендер, вращение, зум, drag)");
    await page.goto(`${UI}/synthesis/${S_MAIN}`, { waitUntil: "domcontentloaded" });
    await waitText(page, "PS-1700-T17");
    await openGraph(page);
    ok(true, "клик «◈ Граф» открывает модалку (.gm-overlay)");
    await page.waitForSelector(".gm-view canvas", { timeout: 8000 });
    const cvSize = await page.$eval(".gm-view canvas", (cv) => ({ w: cv.width, h: cv.height }));
    ok(cvSize.w > 100 && cvSize.h > 100, `WebGL-канвас создан и не нулевой (${cvSize.w}×${cvSize.h})`);
    ok(
      (await pageText(page)).includes("Вращение: мышь"),
      "подсказка 3D-режима видна",
    );

    // Стабилизация (анимация появления 55 кадров + затухание симуляции)
    await sleep(2500);
    const staticShot = await waitStaticFrame(page);
    ok(staticShot !== null, "кадр стабилизируется (симуляция затухает)");

    // Диагностика: сколько канвасов, кто в центре (elementsFromPoint)
    const deskDiag = await page.evaluate(() => {
      const cvs = [...document.querySelectorAll(".gm-view canvas")];
      const first = cvs[0];
      const r = first.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const stack = document
        .elementsFromPoint(cx, cy)
        .slice(0, 4)
        .map((e) => e.tagName + "." + (e.className?.toString?.().slice(0, 20) ?? ""));
      return {
        nCanvas: cvs.length,
        sizes: cvs.map((c) => c.width + "x" + c.height),
        stack,
      };
    });
    console.log(`    [desk] canvas×${deskDiag.nCanvas} (${deskDiag.sizes.join(",")}), стек центра: ${deskDiag.stack.join(" > ")}`);

    // «Охота» на узел: тултип = raycast-доказательство (у рёбер тултип без
    // имён); при неудаче — лёгкий orbit меняет проекцию, вторая попытка
    const knownNames = defs.map((d) => d.name);
    let hunted = await huntNode3d(page, knownNames);
    if (!hunted) {
      const eR = await emptyPoint3d(page);
      await page.mouse.move(eR.x, eR.y);
      await page.mouse.down();
      await page.mouse.move(eR.x + 70, eR.y - 45, { steps: 5 });
      await page.mouse.up();
      await sleep(900);
      hunted = await huntNode3d(page, knownNames);
    }
    ok(hunted !== null, "узел найден курсором — тултип показан (узлы рендерятся)");
    ok(
      hunted !== null && knownNames.some((n) => hunted.text.includes(n)),
      `тултип содержит имя реального узла (${hunted ? hunted.text.split("\n")[0] : "не найден"})`,
    );

    // Orbit: drag из ЗАВЕДОМО пустой точки (клик по хитбоксу ребра не
    // ставит isOrbit — поведение порта; вслепую старт бывал по ребру)
    const emptyO = await emptyPoint3d(page);
    await page.mouse.move(emptyO.x, emptyO.y);
    const beforeOrbit = await shotBody(page);
    await page.mouse.down();
    await page.mouse.move(emptyO.x + 110, emptyO.y - 60, { steps: 8 });
    await page.mouse.up();
    await sleep(700); // инерция
    const afterOrbit = await shotBody(page);
    ok(!afterOrbit.equals(beforeOrbit), "orbit мышью вращает сцену (кадр изменился)");

    // Zoom колёсиком
    await waitStaticFrame(page);
    const beforeZoom = await shotBody(page);
    const rect = await page.$eval(".gm-view canvas", (cv) => {
      const r = cv.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(rect.x, rect.y);
    await page.mouse.wheel({ deltaY: -400 });
    await sleep(500);
    const afterZoom = await shotBody(page);
    ok(!afterZoom.equals(beforeZoom), "зум колёсиком меняет кадр");
    await page.mouse.wheel({ deltaY: 400 }); // вернуть
    await sleep(400);

    // Drag узла: на найденной точке узла cursor становится grabbing
    const hunted2 = await huntNode3d(page, knownNames);
    if (hunted2) {
      await page.mouse.move(hunted2.x, hunted2.y);
      await page.mouse.down();
      await sleep(120);
      const cursorDuringDrag = await page.$eval(".gm-view canvas", (cv) => cv.style.cursor);
      await page.mouse.move(hunted2.x + 50, hunted2.y + 30, { steps: 5 });
      await page.mouse.up();
      ok(cursorDuringDrag === "grabbing", `drag узла: cursor=grabbing во время перетаскивания (факт: "${cursorDuringDrag}")`);
    } else {
      ok(false, "drag узла: узел для перетаскивания не найден");
    }
    // Снять возможное выделение от mouseup-клика
    await page.keyboard.press("Escape"); // безвредно
    await page.mouse.move(60, 860);

    /* ══ R7 (3D-часть): hover-тултип формата имя+[тип] ══ */
    console.log("R7a: hover-тултип в 3D");
    // Формат проверяем по тултипу, уже добытому охотой R2 (третья охота флачила)
    ok(
      hunted !== null && /\[.+\]/.test(hunted.text),
      "тултип содержит [тип] (normalizeType)",
    );

    /* ══ R6 (3D-часть): toggle кластеров меняет сцену ══ */
    console.log("R6a: кластеры в 3D (toggle)");
    await page.mouse.move(60, 860); // увести курсор от узлов
    await waitStaticFrame(page);
    const beforeClusters = await shotBody(page);
    await clickButton(page, "Кластеры");
    await sleep(400);
    const afterClusters = await shotBody(page);
    ok(!afterClusters.equals(beforeClusters), "toggle кластеров: эллипсоиды/метки появились (кадр изменился)");
    await clickButton(page, "Кластеры"); // выключить
    await sleep(300);
    const afterClustersOff = await shotBody(page);
    ok(afterClustersOff.equals(beforeClusters) || !afterClustersOff.equals(afterClusters), "повторный toggle скрывает кластеры");

    /* ══ R4: Graph2D — DOM-проверки ══ */
    console.log("R4: Graph2D (SVG, формы, маркеры, drag, петля)");
    await clickButton(page, "2D");
    await page.waitForSelector(".gm-view svg", { timeout: 8000 });
    await sleep(1200); // прогон симуляции
    const counts = await page.evaluate(() => ({
      nodes: document.querySelectorAll(".node-g").length,
      labels: document.querySelectorAll(".node-label").length,
      lines: document.querySelectorAll(".edge-line").length,
      arcs: document.querySelectorAll(".edge-arc").length,
      markers: document.querySelectorAll("defs marker").length,
      rings: document.querySelectorAll(".cluster-ring").length,
    }));
    ok(counts.nodes === 12, `12 узлов (.node-g): ${counts.nodes}`);
    ok(counts.labels === 12, `12 меток (.node-label): ${counts.labels}`);
    ok(counts.lines === 8, `8 обычных рёбер (.edge-line): ${counts.lines}`);
    ok(counts.arcs === 1, `1 рефлексивная петля (.edge-arc): ${counts.arcs}`);
    ok(counts.markers === 24, `24 SVG-маркера стрелок (8 цветов × 3): ${counts.markers}`);
    ok(counts.rings === 8, `8 колец кластеров (по членствам): ${counts.rings}`);

    // Формы: узел 0 (synthesis) — path; узел 9 (без ролей) — circle;
    // узел 2 (antithesis) — path с rotate(180)
    const shapes = await page.$$eval(".node-g", (els) =>
      els.map((e) => {
        const s = e.querySelector(".node-circle");
        return { tag: s?.tagName.toLowerCase(), transform: s?.getAttribute("transform") };
      }),
    );
    ok(shapes[0].tag === "path", "узел synthesis → path (октагон)");
    ok(shapes[9].tag === "circle", "узел без ролей → circle");
    ok(shapes[2].tag === "path" && shapes[2].transform === "rotate(180)", "antithesis → path с rotate(180)");

    // Слабое ребро (str 0.25, тип «основание» без dash) → пунктир 3,3;
    // сильное сплошное (e0 диалектическая 0.8) → без dasharray;
    // двунаправленное e2 → marker-start
    const edgeAttrs = await page.$$eval(".edge-line", (els) =>
      els.map((e) => ({
        dash: e.getAttribute("stroke-dasharray"),
        ms: e.getAttribute("marker-start"),
      })),
    );
    // .edge-line идут в порядке regularLinks (data-порядок = position):
    // [e0,e1,e2,e3,e4,e6,e8*, e7] — regular исключает e5; порядок position:
    // 0,1,2,3,4,6,7,8 → индексы массива: e8 последний
    ok(edgeAttrs[0].dash === null, "сильная сплошная связь без пунктира");
    ok(edgeAttrs[2].ms !== null, "двунаправленная связь имеет marker-start");
    const weakLast = edgeAttrs[edgeAttrs.length - 1];
    ok(weakLast.dash === "3,3", `слабая связь (str<0.3, сплошной тип) → пунктир 3,3: ${weakLast.dash}`);

    // Drag узла в 2D: transform меняется
    const centersBefore = await nodeCenters2d(page);
    const n0 = centersBefore[0];
    await page.mouse.move(n0.x, n0.y);
    await page.mouse.down();
    await page.mouse.move(n0.x + 70, n0.y + 40, { steps: 6 });
    await page.mouse.up();
    await sleep(600);
    const centersAfter = await nodeCenters2d(page);
    const moved = Math.hypot(centersAfter[0].x - centersBefore[0].x, centersAfter[0].y - centersBefore[0].y);
    ok(moved > 20, `drag узла в 2D сдвигает его (Δ=${moved.toFixed(0)}px)`);
    // Снять выделение, которое click после drag мог поставить
    await page.mouse.click(30, 300);
    await sleep(200);

    /* ══ R5: NodePanel ══ */
    console.log("R5: NodePanel (панель узла, повторный клик)");
    await waitSim2dSettled(page); // после drag симуляция ещё затухает
    await click2dNode(page, "Синтез-Ядро");
    await page.waitForSelector(".gm-info-panel", { timeout: 5000 });
    const panelText = norm(await page.$eval(".gm-info-panel", (p) => p.innerText));
    console.log("    [дамп панели]:", panelText.slice(0, 360));
    const upper = panelText.toUpperCase(); // заголовки секций капсятся CSS-ом (грабля 1.5)
    ok(panelText.includes("Синтез-Ядро"), "панель: имя узла");
    ok(panelText.includes("Определение Синтез-Ядро"), "панель: определение");
    ok(panelText.includes("Центральность") && panelText.includes("Определённость"), "панель: метрики");
    ok(upper.includes("СТРУКТУРНЫЕ") && upper.includes("ПРОЦЕССУАЛЬНЫЕ"), "панель: обе группы ролей");
    ok(panelText.includes("Центральная") && panelText.includes("Точка синтеза"), "панель: подписи ролей");
    ok(upper.includes("ИСХОДЯЩИЕ") && upper.includes("ВХОДЯЩИЕ"), "панель: списки связей");
    ok(panelText.includes("Мост-Опосредование") || panelText.includes("Верификатор"), "панель: входящая связь названа");
    // Повторный клик — снятие
    await click2dNode(page, "Синтез-Ядро");
    await sleep(400);
    ok(
      (await page.$(".gm-info-panel")) === null,
      "повторный клик по узлу снимает выделение и панель",
    );

    // Панель рефлексивного узла: секция «Рефлексивные»
    await click2dNode(page, "Рефлексия-Само");
    await page.waitForSelector(".gm-info-panel", { timeout: 5000 });
    const reflPanel = norm(await page.$eval(".gm-info-panel", (p) => p.innerText));
    ok(reflPanel.toUpperCase().includes("РЕФЛЕКСИВНЫЕ"), "панель узла с петлёй: секция «Рефлексивные»");
    await page.mouse.click(30, 300); // фон — сброс
    await sleep(300);

    /* ══ R6b: кластеры в 2D — hull/метки, позиционирование ══ */
    console.log("R6b: кластеры в 2D (hull, метки, позиции)");
    const hullHiddenBefore = await page.$$eval(".cluster-hull", (els) =>
      els.every((e) => e.getAttribute("display") === "none"),
    );
    ok(hullHiddenBefore, "hull скрыты до toggle (clusterVisible=false)");
    await clickButton(page, "Кластеры");
    await sleep(300);
    const hullState = await page.evaluate(() => {
      const hulls = [...document.querySelectorAll(".cluster-hull")];
      const labels = [...document.querySelectorAll(".cluster-label")];
      return {
        n: hulls.length,
        visible: hulls.every((e) => e.getAttribute("display") !== "none"),
        labelTexts: labels.map((l) => l.textContent),
        boxes: hulls.map((h) => { const b = h.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }),
      };
    });
    ok(hullState.n === 2, `2 hull-оболочки: ${hullState.n}`);
    ok(hullState.visible, "hull видимы после toggle");
    ok(
      hullState.labelTexts.some((t) => t.includes("Ядро синтеза")),
      "метка кластера без римского префикса («Ядро синтеза»)",
    );
    // Позиционирование: члены кластера 0 (узлы 0–3) внутри bbox его hull
    const posCheck = await page.evaluate(() => {
      const svg = document.querySelector(".gm-view svg g");
      const gs = [...document.querySelectorAll(".node-g")];
      const hulls = [...document.querySelectorAll(".cluster-hull")];
      const parseXY = (el) => {
        const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(el.getAttribute("transform") || "");
        return m ? { x: +m[1], y: +m[2] } : null;
      };
      // hull данных в порядке clusterGroupEntries; кластер 0 — тот, чей
      // bbox содержит узел 0
      const results = [];
      for (const h of hulls) {
        const b = h.getBBox();
        const inside = [0, 1, 2, 3].map((i) => {
          const p = parseXY(gs[i]);
          return p && p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
        });
        results.push(inside.filter(Boolean).length);
      }
      return Math.max(...results);
    });
    ok(posCheck === 4, `hull кластера 0 накрывает все 4 узла-члена (${posCheck}/4)`);
    await clickButton(page, "Кластеры"); // выключить
    await sleep(200);

    /* ══ R7b: hover + select в 2D ══ */
    console.log("R7b: hover-подсветка и select-диммирование в 2D");
    const cSyn = await nodeCenter2dByName(page, "Синтез-Ядро");
    await page.mouse.move(cSyn.x, cSyn.y);
    await sleep(300);
    // Соседи узла 0: Тезис-Разум, Антитезис-Опыт, Мост-Опосредование, Верификатор
    ok(
      (await nodeAttr2dByName(page, "Тезис-Разум", "filter")) === "url(#glow2)" &&
        (await nodeAttr2dByName(page, "Антитезис-Опыт", "filter")) === "url(#glow2)",
      "hover: соседи подсвечены glow",
    );
    ok(
      (await nodeAttr2dByName(page, "Генератор-Различие", "filter")) === "url(#glow-gen)",
      "hover: generative сохраняет свой фильтр",
    );
    await page.mouse.move(30, 500);
    await sleep(300);
    const tzAfter = await nodeAttr2dByName(page, "Тезис-Разум", "filter");
    ok(tzAfter === null || tzAfter === "", "уход курсора снимает glow");

    // Клик — фиксация: несоседи задиммлены
    await click2dNode(page, "Синтез-Ядро");
    await page.waitForSelector(".gm-info-panel", { timeout: 5000 });
    ok(
      (await nodeAttr2dByName(page, "Периферия-Деталь", "opacity")) === "0.08",
      "select: несосед задиммлен (opacity=0.08)",
    );
    ok(
      (await nodeAttr2dByName(page, "Тезис-Разум", "opacity")) === "1",
      "select: сосед не задиммлен",
    );
    // Клик на пустое место — сброс (dispatch на svg: таргет сам svg)
    await page.evaluate(() => {
      document
        .querySelector(".gm-view svg")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await sleep(400);
    ok(
      (await nodeAttr2dByName(page, "Периферия-Деталь", "opacity")) === "1",
      "клик в фон сбрасывает диммирование",
    );
    ok((await page.$(".gm-info-panel")) === null, "клик в фон закрывает панель");

    /* ══ EdgePanel (в составе R5/R4): клик по связи ══ */
    console.log("R5+: EdgePanel (клик по связи в 2D)");
    // Хит-зона ребра e0 (0→1) — адресно
    await click2dEdgeHit(page, 0);
    await sleep(500);
    const edgePanelEl = await page.$(".gm-info-panel");
    if (edgePanelEl) {
      const ept = norm(await page.$eval(".gm-info-panel", (p) => p.innerText));
      ok(ept.includes("диалектическая") || ept.includes("ИСТОЧНИК"), "EdgePanel: тип/блоки узлов");
      ok(ept.includes("Сила связи"), "EdgePanel: сила связи");
      ok(ept.toUpperCase().includes("ИСТОЧНИК") && ept.toUpperCase().includes("ЦЕЛЬ"), "EdgePanel: блоки ИСТОЧНИК и ЦЕЛЬ");
      await page.mouse.click(30, 500);
      await sleep(300);
    } else {
      // Середина могла не попасть в хит-зону (узлы разошлись после drag)
      ok(false, "EdgePanel: клик в середину ребра не попал в хит-зону (проверить вручную)");
    }

    await closeGraph(page);

    /* ══ Расширенные метрики (S_EXT) ══ */
    console.log("R5b: расширенные метрики (_extended)");
    await page.goto(`${UI}/synthesis/${S_EXT}`, { waitUntil: "domcontentloaded" });
    await waitText(page, "PS-1701-T17");
    await openGraph(page);
    await clickButton(page, "2D");
    await page.waitForSelector(".node-g", { timeout: 8000 });
    await sleep(900);
    await waitSim2dSettled(page);
    await click2dNode(page, "Расширенное-Ядро");
    await page.waitForSelector(".gm-info-panel", { timeout: 5000 });
    const extPanel = norm(await page.$eval(".gm-info-panel", (p) => p.innerText));
    ok(extPanel.toUpperCase().includes("РАСШИРЕННЫЕ"), "NodePanel: секция РАСШИРЕННЫЕ при extGraphMetrics");
    ok(extPanel.includes("Ист. значимость") && extPanel.includes("4/5"), "NodePanel: histSig и innovDeg 4/5");
    ok(extPanel.includes("Глубина"), "NodePanel: метрика Глубина");
    // EdgePanel расширенный
    await click2dEdgeHit(page, 0);
    await sleep(500);
    const extEdge = await page.$(".gm-info-panel");
    if (extEdge) {
      const t = norm(await page.$eval(".gm-info-panel", (p) => p.innerText));
      ok(t.includes("Лог. необходим."), "EdgePanel: расширенные метрики связи (logNec)");
    } else {
      ok(false, "EdgePanel(ext): хит-зона не поймана");
    }
    await closeGraph(page);

    /* ══ R8: edge cases ══ */
    console.log("R8: edge cases (1 узел, пустой граф, петля, доступ)");
    // 1 узел без рёбер
    await page.goto(`${UI}/synthesis/${S_ONE}`, { waitUntil: "domcontentloaded" });
    await waitText(page, "PS-1702-T17");
    const errsBefore = consoleErrors.length;
    await openGraph(page);
    await page.waitForSelector(".gm-view canvas", { timeout: 8000 });
    await sleep(1500);
    await clickButton(page, "2D");
    await page.waitForSelector(".gm-view svg", { timeout: 8000 });
    await sleep(600);
    const oneCounts = await page.evaluate(() => ({
      nodes: document.querySelectorAll(".node-g").length,
      lines: document.querySelectorAll(".edge-line").length +
             document.querySelectorAll(".edge-arc").length,
    }));
    ok(oneCounts.nodes === 1 && oneCounts.lines === 0, "граф с 1 узлом: рендер 3D+2D без рёбер");
    ok(consoleErrors.length === errsBefore, "граф с 1 узлом: без ошибок страницы");
    await closeGraph(page);

    // Пустой граф
    await page.goto(`${UI}/synthesis/${S_EMPTY}`, { waitUntil: "domcontentloaded" });
    await waitText(page, "PS-1703-T17");
    await openGraph(page);
    ok(
      norm(await pageText(page)).includes("Нет данных графа"),
      "пустой граф: модалка открыта с пустым состоянием, не падает",
    );
    await closeGraph(page);

    // Рефлексивная петля уже проверена в R4 (.edge-arc=1) — фиксируем
    ok(true, "рефлексивная связь: петля в 2D (arc) проверена в R4");

    // Чужой публичный — граф открывается
    await page.goto(`${UI}/synthesis/${S_PUBB}`, { waitUntil: "domcontentloaded" });
    await waitText(page, "PS-1704-T17");
    await openGraph(page);
    await clickButton(page, "2D");
    await page.waitForSelector(".node-g", { timeout: 8000 });
    const pubNodes = await page.$$eval(".node-g", (e) => e.length);
    ok(pubNodes === 2, "чужой публичный синтез: граф открыт, узлы видны");
    await closeGraph(page);

    // Чужой приватный — 403 страница и 403 на прямом categories
    await page.goto(`${UI}/synthesis/${S_PRIVB}`, { waitUntil: "domcontentloaded" });
    await waitText(page, "403");
    ok(
      norm(await pageText(page)).includes("доступен только владельцу"),
      "чужой непубличный синтез: 403-страница (кнопки графа нет)",
    );
    const status = await page.evaluate(async (id) => {
      const r = await fetch(`/api/v1/syntheses/${id}/categories`);
      return r.status;
    }, S_PRIVB);
    ok(status === 403, `прямой GET /categories чужого приватного → 403 (${status})`);

    /* ══ R9: мобильный touch через CDP ══ */
    console.log("R9: мобильный touch (CDP Input.dispatchTouchEvent)");
    let touchSupported = true;
    const mpage = await browser.newPage();
    try {
      await mpage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      mpage.on("pageerror", (e) => consoleErrors.push("mobile: " + e));
      // Фоновая вкладка = мёртвый rAF: активируем мобильную страницу ДО
      // открытия графа, чтобы шла appear-анимация и рендер
      await mpage.bringToFront();
      await mpage.goto(`${UI}/synthesis/${S_MAIN}`, { waitUntil: "domcontentloaded" });
      await mpage.waitForFunction(
        () => document.body.innerText.includes("PS-1700-T17"),
        { timeout: 15000 },
      );
      // Кнопка графа
      await mpage.evaluate(() => {
        [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Граф"))?.click();
      });
      await mpage.waitForSelector(".gm-view canvas", { timeout: 10000 });
      await sleep(2500);

      // Диагностика живости: visibilityState + счётчик rAF-кадров за 500мс
      const alive = await mpage.evaluate(
        () =>
          new Promise((res) => {
            let n = 0;
            const t0 = performance.now();
            const f = () => {
              n++;
              if (performance.now() - t0 < 500) requestAnimationFrame(f);
              else res({ vis: document.visibilityState, frames: n });
            };
            requestAnimationFrame(f);
            setTimeout(() => res({ vis: document.visibilityState, frames: n }), 1200);
          }),
      );
      console.log(`    [mpage] visibility=${alive.vis}, rAF-кадров за 500мс: ${alive.frames}`);

      // Шпион на document (capture): устойчив к пересозданию канваса
      // StrictMode-ремоунтом; логируем и тег цели
      await mpage.evaluate(() => {
        window.__t = [];
        for (const t of ["touchstart", "touchmove", "touchend"])
          document.addEventListener(
            t,
            (e) => window.__t.push(t + ":" + e.touches.length + "@" + (e.target?.tagName ?? "?")),
            { capture: true },
          );
      });
      const tlog = () => mpage.evaluate(() => { const r = window.__t.join(","); window.__t = []; return r; });

      const cdp = await mpage.createCDPSession();
      const mrect = await mpage.$eval(".gm-view canvas", (cv) => {
        const r = cv.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });

      // На 390px легенда (bottom-left, без max-width — квирк исходника,
      // порт 1:1) перекрывает центр: шпион ловил touchstart@SPAN/@DIV.
      // Жесты ведём по точкам, где elementFromPoint === CANVAS.
      const freeMap = await mpage.evaluate(() => {
        const cv = document.querySelector(".gm-view canvas");
        const r = cv.getBoundingClientRect();
        const pts = [];
        for (let fy = 0.2; fy <= 0.8; fy += 0.15)
          for (let fx = 0.2; fx <= 0.8; fx += 0.15) {
            const x = r.x + r.width * fx;
            const y = r.y + r.height * fy;
            const el = document.elementFromPoint(x, y);
            pts.push({ x, y, free: el === cv, cls: el?.className?.toString?.().slice(0, 24) ?? el?.tagName });
          }
        return pts;
      });
      const mDiag = await mpage.evaluate(() => {
        const cvs = [...document.querySelectorAll(".gm-view canvas")];
        const r = cvs[0].getBoundingClientRect();
        const stack = document
          .elementsFromPoint(r.x + r.width * 0.7, r.y + r.height * 0.6)
          .slice(0, 4)
          .map((e) => e.tagName + "." + (e.className?.toString?.().slice(0, 20) ?? ""));
        return { nCanvas: cvs.length, sizes: cvs.map((c) => c.width + "x" + c.height), stack };
      });
      console.log(`    [mpage] canvas×${mDiag.nCanvas} (${mDiag.sizes.join(",")}), стек (0.7w,0.6h): ${mDiag.stack.join(" > ")}`);
      const freePts = freeMap.filter((p) => p.free);
      const blockers = [...new Set(freeMap.filter((p) => !p.free).map((p) => p.cls))];
      console.log(`    [mpage] свободных точек канваса: ${freePts.length}/${freeMap.length}; перекрыватели: ${blockers.join(" | ")}`);
      // Пара для пинча: две свободные точки на одной высоте с зазором ≥80px
      let pinchPair = null;
      for (const a of freePts) {
        for (const b of freePts) {
          if (Math.abs(a.y - b.y) < 2 && b.x - a.x >= 80) { pinchPair = [a, b]; break; }
        }
        if (pinchPair) break;
      }
      const freeC = freePts.length
        ? freePts[Math.floor(freePts.length / 2)]
        : { x: mrect.x + mrect.w * 0.7, y: mrect.y + mrect.h * 0.6 };
      const mcx = freeC.x;
      const mcy = freeC.y;

      const mShot = async () => {
        const el = await mpage.$(".gm-body");
        return Buffer.from(await el.screenshot());
      };
      const touch = (type, pts) =>
        cdp.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })),
        });

      // Дождаться статики
      let prevM = await mShot();
      for (let i = 0; i < 20; i++) {
        await sleep(350);
        const cur = await mShot();
        if (cur.equals(prevM)) break;
        prevM = cur;
      }

      // ── Pinch-zoom: две точки сходятся ──
      const beforePinch = await mShot();
      const pA = pinchPair ? pinchPair[0] : { x: mcx - 60, y: mcy };
      const pB = pinchPair ? pinchPair[1] : { x: mcx + 60, y: mcy };
      const step = (pB.x - pA.x) / 12;
      await touch("touchStart", [
        { x: pA.x, y: pA.y }, { x: pB.x, y: pB.y },
      ]);
      for (let s = 1; s <= 5; s++) {
        await touch("touchMove", [
          { x: pA.x + s * step, y: pA.y }, { x: pB.x - s * step, y: pB.y },
        ]);
        await sleep(40);
      }
      await touch("touchEnd", []);
      await sleep(800);
      const afterPinch = await mShot();
      ok(
        !afterPinch.equals(beforePinch),
        `pinch двумя пальцами меняет зум (события: ${await tlog()}; PNG ${beforePinch.length}→${afterPinch.length})`,
      );

      // ── Single-touch orbit ──
      let prevS = await mShot();
      for (let i = 0; i < 12; i++) { await sleep(300); const cur = await mShot(); if (cur.equals(prevS)) break; prevS = cur; }
      const beforeOrbitM = await mShot();
      await touch("touchStart", [{ x: mcx, y: mcy }]);
      for (let s = 1; s <= 6; s++) {
        await touch("touchMove", [{ x: mcx + s * 10, y: mcy - s * 8 }]);
        await sleep(40);
      }
      await touch("touchEnd", []);
      await sleep(700);
      const afterOrbitM = await mShot();
      ok(
        !afterOrbitM.equals(beforeOrbitM),
        `single-touch orbit вращает сцену (события: ${await tlog()}; PNG ${beforeOrbitM.length}→${afterOrbitM.length})`,
      );

      // ── Tap-select: охоту ведём мышью (поиск), сам жест — честный tap ──
      let panelOpened = false;
      const mNames = defs.map((d) => d.name);
      const found = await huntNode3d(mpage, mNames, freeC);
      if (found) {
        await touch("touchStart", [{ x: found.x, y: found.y }]);
        await sleep(40);
        await touch("touchEnd", []);
        await sleep(500);
        panelOpened = (await mpage.$(".gm-info-panel")) !== null;
      }
      ok(panelOpened, `tap по узлу открывает NodePanel (охота: ${found ? "узел найден" : "УЗЕЛ НЕ НАЙДЕН"}; события: ${await tlog()})`);
      if (panelOpened) {
        // Tap в ЗАВЕДОМО пустое место — сброс (freePts могла лечь на узел)
        const resetPt = await emptyPoint3d(mpage);
        await touch("touchStart", [{ x: resetPt.x, y: resetPt.y }]);
        await sleep(30);
        await touch("touchEnd", []);
        await sleep(400);
        ok((await mpage.$(".gm-info-panel")) === null, "tap в пустое место закрывает панель");
      }
    } catch (e) {
      touchSupported = false;
      console.log("  ! CDP touch недоступен: " + String(e).slice(0, 160));
      ok(false, "R9: CDP dispatchTouchEvent не потянул — ЗАФИКСИРОВАТЬ РУЧНУЮ ПРОВЕРКУ (TODO), мышью не имитируем");
    } finally {
      await mpage.close().catch(() => {});
    }
    if (touchSupported) ok(true, "R9 прошёл на CDP-таче (ручная проверка не требуется)");

    /* ── pageerror-гигиена ── */
    const realErrors = consoleErrors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("Failed to load resource") &&
        !e.includes("THREE.WebGLRenderer: Context Lost"), // возможный артефакт закрытия
    );
    ok(realErrors.length === 0, `ошибок страницы нет (${realErrors.length}): ${realErrors[0] ?? ""}`);
  } catch (e) {
    // Без этого catch исключение сценария глоталось finally→exit
    failed++;
    fails.push("ИСКЛЮЧЕНИЕ СЦЕНАРИЯ: " + String(e).slice(0, 200));
    console.error("\nИСКЛЮЧЕНИЕ СЦЕНАРИЯ:", e);
  } finally {
    console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗`);
    if (failed) console.log("Провалы:\n - " + fails.join("\n - "));
    await Promise.race([browser.close(), sleep(3000)]).catch(() => {});
    await Promise.race([sql.end({ timeout: 2 }), sleep(2500)]).catch(() => {});
    serverProc?.kill("SIGKILL");
    viteProc?.kill("SIGKILL");
    process.exit(failed ? 1 : 0);
  }
}

main().catch((e) => {
  console.error("ФАТАЛЬНО:", e);
  console.error("--- server log tail ---\n" + serverLog.slice(-1200));
  console.error("--- vite log tail ---\n" + viteLog.slice(-600));
  serverProc?.kill("SIGKILL");
  viteProc?.kill("SIGKILL");
  process.exit(1);
});
