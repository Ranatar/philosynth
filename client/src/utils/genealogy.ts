/**
 * Генеалогия концепций — клиентские порты. Беседа 3.2 (запрос 1, п. 1).
 *
 * Порты 1:1 из philosynth.html (фрагмент 3.2-genealogy-ui.js):
 *  - isPlaceholderConceptName [22228], resolveConceptName [22248]
 *    (с задокументированным FIX: \w в регекспе префиксов не матчит
 *    кириллицу — та же грабля, что чинилась беседой 1.4 в
 *    updateDocTitleFromName [11886]; порт несёт [а-яё]);
 *  - reconstructGenealogy [22181] — долг §12 (заведён 1.5b);
 *  - restoreCapsulesFromHTML [11745] — долг §12 (заведён 1.5b);
 *  - normalizeGenealogyNames [22298], stripCapsulesFromGenealogy [22321]
 *    (пригодятся экспорту 4.2 — лежат рядом с деревом);
 *  - collectPhilosopherAncestors [22451] — КЛИЕНТСКАЯ версия (обход
 *    genealogy-объекта; серверный аналог 3.1 ходит по CTE);
 *  - checkGenealogyOverlaps [22467] — тексты предупреждений дословно
 *    (серверная копия — meta-synthesis-service, беседа 3.1).
 *
 * Модуль намеренно НЕ импортирует concept-file.ts (тот импортирует
 * genealogy — цикл запрещён); минимальная форма метаданных объявлена
 * локально (GenealogyMeta ⊂ ConceptFileMeta).
 *
 * Адаптация API ↔ genealogy: дерево GET /lineage/ancestors (LineageNode,
 * беседа 3.1) несёт только type/name/synthesisId/depth/children — без
 * method/synthLevel/seed/capsule. lineageNodeToGenealogy переводит его в
 * GenealogyNode (карточки без мета-строки/зерна/капсулы); synthesisId
 * сохраняется — GenealogyTree рисует кликабельные ссылки (п. 4).
 */
import type { LineageNode } from "@philosynth/shared/types/lineage";

/* ─────────────────────────── Типы ─────────────────────────── */

/** Узел genealogy-дерева исходника (embeddedState.genealogy). */
export interface GenealogyNode {
  type: "concept" | "philosopher";
  name: string;
  method?: string;
  synthLevel?: string;
  generationOrder?: string;
  seed?: string;
  capsule?: string;
  participants?: GenealogyNode[];
  /** Только у узлов, пришедших из API (lineageNodeToGenealogy) —
   *  кликабельная ссылка /synthesis/:id в GenealogyTree */
  synthesisId?: string;
}

/** Участник для проверки пересечений (форма checkGenealogyOverlaps). */
export interface OverlapParticipant {
  type: "concept" | "philosopher";
  name: string;
  genealogy?: GenealogyNode | null;
}

export interface GenealogyWarning {
  level: "info" | "warn";
  text: string;
}

/** Минимум метаданных файла для reconstructGenealogy (⊂ ConceptFileMeta). */
export interface GenealogyMeta {
  phil?: string[];
  method?: string;
  synthLevel?: string;
  seed?: string;
}

/* ────────── isPlaceholderConceptName [22228–22237] ────────── */

export function isPlaceholderConceptName(s: string | null | undefined): boolean {
  if (!s) return true;
  const t = String(s).trim();
  if (!t) return true;
  if (t === "?" || t === "—" || t === "-") return true;
  // Регистронезависимое сравнение с дефолтом UI
  if (t.toLowerCase() === "синтез философской концепции") return true;
  if (t.toLowerCase() === "импортированный документ") return true;
  return false;
}

/* ───────────── resolveConceptName [22248–22293] ─────────────
 * Настоящее имя концепции: docTitle, при дефолте — из раздела «name»
 * (updateDocTitleFromName-совместимая логика). null — не нашлось.
 * FIX (см. шапку): \w → [а-яё] в регекспе срезания префиксов. */

export function resolveConceptName(doc: Document): string | null {
  const titleEl = doc.getElementById("docTitle");
  const rawTitle = titleEl?.textContent?.trim() || "";
  if (!isPlaceholderConceptName(rawTitle)) return rawTitle;

  // Секции помечены data-section-key
  let nameContainer: Element | null = null;
  const bodyEls = doc.querySelectorAll(".doc-body[data-section-key]");
  for (const el of Array.from(bodyEls)) {
    const keys = (el.getAttribute("data-section-key") || "").split("+");
    if (keys.includes("name")) {
      nameContainer = el;
      break;
    }
  }
  if (!nameContainer) return null;

  const divs = nameContainer.querySelectorAll("div[data-section]");
  let recSection: Element | null = null;
  for (const div of Array.from(divs)) {
    const sec = (div.getAttribute("data-section") || "").toLowerCase();
    if (sec.includes("итогов") || sec.includes("рекоменд")) {
      recSection = div;
      break;
    }
  }
  const strong = recSection
    ? recSection.querySelector("strong")
    : nameContainer.querySelector("strong");
  let nameText = strong?.textContent?.trim() || "";
  if (!nameText) return null;
  nameText = nameText
    // FIX \w → [а-яё] (кириллица; латентный баг исходника — см. шапку)
    .replace(
      /^(?:итогов[а-яё]+\s+рекомендаци[а-яё]*|рекомендуем[а-яё]+\s+названи[а-яё]*|названи[а-яё]+\s*концепци[а-яё]*)\s*[:：]\s*/i,
      "",
    )
    .replace(/^[«""]|[»""]$/g, "")
    .split(/\s*[:：]\s*/)[0]!
    .trim();
  return nameText || null;
}

/* ──────────── reconstructGenealogy [22181–22220] ──────────── */

export function reconstructGenealogy(
  meta: GenealogyMeta,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  embeddedState: any | null,
  doc: Document,
): GenealogyNode {
  // Если в embedded state уже есть genealogy — используем
  if (embeddedState?.genealogy) return embeddedState.genealogy as GenealogyNode;

  // Иначе реконструируем из метаданных:
  // Участники — философы из meta.phil
  const participants: GenealogyNode[] = (meta.phil || []).map((name) => ({
    type: "philosopher",
    name,
  }));

  // Настоящее имя: сначала docTitle, если дефолт — из раздела «name»,
  // иначе явный плейсхолдер. Это защищает от транзитивного
  // распространения «Синтез Философской Концепции» через многоступенчатый
  // метасинтез.
  const resolvedName = resolveConceptName(doc) || "[безымянная концепция]";

  // Если в embedded state есть participants с концепциями — используем их
  if (embeddedState?.participants) {
    return {
      type: "concept",
      name: resolvedName,
      method: meta.method ?? "",
      synthLevel: meta.synthLevel ?? "",
      seed: meta.seed || "",
      participants: (
        embeddedState.participants as Array<
          { type: string; name: string; genealogy?: GenealogyNode | null }
        >
      ).map((p) =>
        p.type === "concept"
          ? p.genealogy || { type: "concept" as const, name: p.name }
          : ({ type: "philosopher", name: p.name } as GenealogyNode),
      ),
    };
  }

  return {
    type: "concept",
    name: resolvedName,
    method: meta.method ?? "",
    synthLevel: meta.synthLevel ?? "",
    seed: meta.seed || "",
    participants,
  };
}

/* ─────────── restoreCapsulesFromHTML [11745–11770] ───────────
 * Долг §12 (1.5b → 3.2): капсулы родительских концепций живут в
 * .gen-card-capsule-body сохранённого дерева — восстанавливаем их в
 * genealogy-узлы. МУТИРУЕТ node (как исходник). */

export function restoreCapsulesFromHTML(
  node: GenealogyNode | null,
  doc: Document,
): void {
  if (!node || node.type === "philosopher") return;

  // Находим все карточки концепций в дереве
  const cards = doc.querySelectorAll(".gen-card");
  const capsuleMap: Record<string, string> = {};
  for (const card of Array.from(cards)) {
    const nameEl = card.querySelector(".gen-card-name");
    const capsuleBody = card.querySelector(".gen-card-capsule-body");
    if (nameEl && capsuleBody) {
      // Имя без префикса "◈ "
      const name = (nameEl.textContent ?? "").replace(/^◈\s*/, "").trim();
      capsuleMap[name] = capsuleBody.textContent ?? "";
    }
  }

  // Рекурсивно заполняем узлы
  function fill(n: GenealogyNode | null | undefined): void {
    if (!n || n.type === "philosopher") return;
    const cap = capsuleMap[n.name];
    if (!n.capsule && cap) {
      n.capsule = cap;
    }
    if (n.participants) n.participants.forEach(fill);
  }
  if (node.participants) node.participants.forEach(fill);
}

/* ─────────── normalizeGenealogyNames [22298–22315] ─────────── */

export function normalizeGenealogyNames(
  node: GenealogyNode | null,
  fallbackName: string | null,
): GenealogyNode | null {
  if (!node) return null;
  if (node.type === "philosopher") return { ...node };
  const copy: GenealogyNode = { ...node };
  if (isPlaceholderConceptName(copy.name)) {
    copy.name =
      fallbackName && !isPlaceholderConceptName(fallbackName)
        ? fallbackName
        : "[безымянная концепция]";
  }
  if (copy.participants) {
    copy.participants = copy.participants
      .map((p) =>
        p && p.type === "philosopher"
          ? { ...p }
          : normalizeGenealogyNames(p, null),
      )
      .filter((p): p is GenealogyNode => p !== null);
  }
  return copy;
}

/* ────────── stripCapsulesFromGenealogy [22321–22331] ────────── */

export function stripCapsulesFromGenealogy(
  node: GenealogyNode | null,
): GenealogyNode | null {
  if (!node) return null;
  const copy: GenealogyNode = { ...node };
  delete copy.capsule;
  if (copy.participants) {
    copy.participants = copy.participants
      .map((p) =>
        p.type === "philosopher" ? p : stripCapsulesFromGenealogy(p),
      )
      .filter((p): p is GenealogyNode => p !== null);
  }
  return copy;
}

/* ────────── collectPhilosopherAncestors [22451–22461] ──────────
 * Клиентская версия — обход genealogy-объекта (серверная 3.1 — CTE). */

export function collectPhilosopherAncestors(
  node: GenealogyNode | null | undefined,
): Set<string> {
  const result = new Set<string>();
  if (!node) return result;
  if (node.type === "philosopher") {
    result.add(node.name);
    return result;
  }
  for (const p of node.participants || []) {
    for (const name of collectPhilosopherAncestors(p)) {
      result.add(name);
    }
  }
  return result;
}

/* ─────────── checkGenealogyOverlaps [22467–22509] ───────────
 * Тексты предупреждений дословно (= серверные [22475/22492] из 3.1). */

export function checkGenealogyOverlaps(
  participants: readonly OverlapParticipant[],
): GenealogyWarning[] {
  const warnings: GenealogyWarning[] = [];
  const ancestorSets = participants
    .filter((p) => p.type === "concept")
    .map((p) => ({
      name: p.name,
      ancestors: collectPhilosopherAncestors(p.genealogy),
    }));

  // Пересечение концепций с концепциями
  for (let i = 0; i < ancestorSets.length; i++) {
    for (let j = i + 1; j < ancestorSets.length; j++) {
      const a = ancestorSets[i]!;
      const b = ancestorSets[j]!;
      const overlap = [...a.ancestors].filter((x) => b.ancestors.has(x));
      if (overlap.length > 0) {
        warnings.push({
          level: "info",
          text:
            "Концепции «" +
            a.name +
            "» и «" +
            b.name +
            "» имеют общих предков: " +
            overlap.join(", ") +
            ". Это может привести к доминированию их позиций.",
        });
      }
    }
  }

  // Пересечение концепций с выбранными философами
  const selectedPhils = new Set(
    participants.filter((p) => p.type === "philosopher").map((p) => p.name),
  );
  for (const cs of ancestorSets) {
    const overlap = [...cs.ancestors].filter((a) => selectedPhils.has(a));
    if (overlap.length > 0) {
      warnings.push({
        level: "warn",
        text:
          "Философ(ы) " +
          overlap.join(", ") +
          " выбран(ы) для синтеза и одновременно присутствуют в генеалогии " +
          "концепции «" +
          cs.name +
          "». Их влияние будет удвоено.",
      });
    }
  }

  return warnings;
}

/* ───────── lineageNodeToGenealogy (адаптация API → дерево) ─────────
 * Дерево GET /lineage/ancestors: корень depth 0 — САМ синтез, children —
 * родители (беседа 3.1). Переводим в GenealogyNode; карточки из API — без
 * method/synthLevel/seed/capsule (транспорт их не несёт — адаптация,
 * задокументирована в шапке), зато с synthesisId для ссылок. */

export function lineageNodeToGenealogy(node: LineageNode): GenealogyNode {
  if (node.type === "philosopher") {
    return { type: "philosopher", name: node.name };
  }
  const g: GenealogyNode = {
    type: "concept",
    name: node.name,
    participants: node.children.map(lineageNodeToGenealogy),
  };
  if (node.synthesisId) g.synthesisId = node.synthesisId;
  return g;
}
