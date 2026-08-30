/**
 * Форма создания синтеза. Беседа 1.5 (запрос 1, п. 2).
 *
 * Поля — по протоколу 07 (зерно, контекст, метод, уровень, глубина,
 * порядок) + язык генерации (initLangUI исходника; 01 §4.15 п.6,
 * syntheses.lang) + пикеры философов/разделов. Тексты опций select —
 * дословно из формы исходника (визуальный референс, разметка React).
 *
 * Валидация (v11, 07 тест 5):
 *  - без философов и концепций → ДОПУСКАЕТСЯ (свободный синтез), но
 *    тогда зерно обязательно (иначе сервер отвечает 400 с кодом
 *    NO_PARTICIPANTS_SEED_REQUIRED — 03 §4.3, код приведён беседой 1.5);
 *  - без секций → ошибка;
 *  - с участниками без зерна → допускается.
 *
 * keepFullBudget (v11, 01 §4.13 ч.II п.5): чекбокс виден ТОЛЬКО при
 * концепциях-участниках в пуле; под ним — превью бюджета
 * (renderFullBudgetPreview [10456], порт — FullBudgetPreview ниже).
 *
 * Unified Concept Pool (беседа 1.5b): блок «Загруженные Концепции»
 * встроен в форму; участники-концепции берутся из pool-store
 * (пропс conceptParticipants беседы 1.5 заменён стором — пропс никем
 * не передавался, точка встраивания реализована). Связка пул → форма:
 *  - эффект по hasSynthConcepts включает secSynthReady + обязательные
 *    разделы (React-адаптация DOM-части toggleSynthParticipant [4744]);
 *  - при 0 ☑-концепций synthReady снимается (галочки разделов не
 *    трогаем — [4760] «пользователь сам решит»).
 *
 * ГЕЙТ МЕТА-СИНТЕЗА (1.5b → 3.2): сервер принимает участников-концепции
 * {type:'synthesis', synthesisId} с беседы 3.1 — блокировка сабмита СНЯТА
 * для концепций ИЗ КАТАЛОГА (у них есть synthesisId; долг §12 закрыт).
 * ФАЙЛОВЫЕ концепции по-прежнему блокируются: серверный импорт файлов
 * ГОТОВ (4.3: POST /syntheses/import), но авто-импорт при сабмите
 * (файл → импорт → участник type='synthesis' с полученным id) — долг
 * §12 за беседой 6.2 — TODO(6.2).
 *
 * Беседа 3.2, дополнительно:
 *  - предполётная проверка генеалогических пересечений ☑-концепций
 *    (каталожные — через GET /lineage/ancestors, файловые — по
 *    participant.genealogy из reconstructGenealogy) + confirm с текстами
 *    checkGenealogyOverlaps 1:1; отмена не отправляет форму. Серверные
 *    warnings из ответа POST (аддитивное поле 3.1) рисует
 *    CreateSynthesisPage — неблокирующе (синтез уже создан);
 *  - estimate-diff в FullBudgetPreview (долг §12): /estimate дважды —
 *    с участниками-концепциями и без, отрисовка разницы;
 *  - кнопки замен CompatAdvisor (долг §12): onApplyReplacement меняет
 *    method/synthLevel/generationOrder — пересчёт advice/warnings/
 *    estimate автоматически через deps (аналог цепочки applyReplacement →
 *    updateCompatAdvisor → updateSectionWarnings исходника).
 */
import { useEffect, useMemo, useRef, useState } from "react";

import type { ParticipantInput } from "@philosynth/shared/types/lineage";

import type { CreateSynthesisInput } from "../../api/syntheses";
import {
  estimateSynthesis,
  fetchSynthesisAdvice,
  type SynthesisAdvice,
  type SynthesisEstimate,
} from "../../api/syntheses";
import { getAncestors } from "../../api/lineage";
import { usePoolStore } from "../../stores/pool-store";
import {
  checkGenealogyOverlaps,
  lineageNodeToGenealogy,
  type OverlapParticipant,
} from "../../utils/genealogy";
import { ConceptPool } from "../pool/ConceptPool";
import { CompatAdvisor } from "./CompatAdvisor";
import { CostEstimate } from "./CostEstimate";
import { PhilosopherPicker } from "./PhilosopherPicker";
import {
  SectionPicker,
  SYNTH_READY_SECTIONS,
  type PickableSectionKey,
} from "./SectionPicker";
import { SectionWarnings } from "./SectionWarnings";

/** Клиентская копия CONTEXT_BUDGET [7529] — ТОЛЬКО для превью бюджета.
 *  Канон живёт в Registry (config context_budget) и применяется сервером;
 *  дрейф-риск задокументирован (план 1.5b, п. 6). Точная разница оценок
 *  full vs shrink требует серверной поддержки концепций — TODO(3.1). */
const CONTEXT_BUDGET_PREVIEW: Readonly<Record<string, number>> = {
  overview: 24000,
  standard: 48000,
  deep: 72000,
  exhaustive: 100000,
};

/** computeConceptOverhead [10133–10140] — дословно (клиентская копия для
 *  превью; серверный канон — context-builder.ts) */
function computeConceptOverheadPreview(
  participants: readonly {
    type: string;
    capsule?: string;
    graphNodes?: string;
    glossaryCompact?: string;
    thesesSummary?: string;
    goals?: string;
    tensions?: string;
  }[],
): number {
  if (!participants) return 0;
  return participants
    .filter((x) => x && x.type === "concept")
    .reduce(
      (sum, c) =>
        sum +
        (c.capsule?.length || 0) +
        (c.graphNodes?.length || 0) +
        (c.glossaryCompact?.length || 0) +
        (c.thesesSummary?.length || 0) +
        (c.goals?.length || 0) +
        (c.tensions?.length || 0),
      0,
    );
}

/** Порт renderFullBudgetPreview [10456–10520].
 *
 *  Беседа 3.2 — долг §12 «отрисовка estimate-diff» ЗАКРЫТ: при наличии
 *  участников в estimateParams превью дополнительно зовёт серверный
 *  POST /syntheses/estimate ДВАЖДЫ — с концепциями и без (механика
 *  зафиксирована в 03 §2.2 беседой 3.1: «клиент зовёт /estimate дважды;
 *  отрисовка разницы — 3.2») — и рисует разницу стоимости/токенов.
 *  Символьный расчёт исходника сохранён для файловых концепций (у
 *  каталожных контент живёт на сервере — клиентские поля пусты, их
 *  вес виден только через estimate-diff). Дебаунс 600 мс — как у
 *  CostEstimate (1.5); сбой оценки превью не блокирует. */
function FullBudgetPreview({
  depth,
  estimateParams,
}: {
  depth: string;
  estimateParams: CreateSynthesisInput | null;
}) {
  const conceptParticipants = usePoolStore((s) => s.conceptParticipants);
  const N = conceptParticipants.length;

  const [diff, setDiff] = useState<{
    withParents: SynthesisEstimate;
    without: SynthesisEstimate;
  } | null>(null);
  const diffSeqRef = useRef(0);

  const hasServerParticipants = !!(
    estimateParams?.participants && estimateParams.participants.length > 0
  );

  useEffect(() => {
    const seq = ++diffSeqRef.current;
    if (!estimateParams || !hasServerParticipants) {
      setDiff(null);
      return;
    }
    const timer = setTimeout(() => {
      const { participants: _p, keepFullBudget: _k, ...rest } = estimateParams;
      Promise.all([
        estimateSynthesis(estimateParams),
        estimateSynthesis(rest), // без участников-концепций
      ])
        .then(([withParents, without]) => {
          if (diffSeqRef.current === seq) setDiff({ withParents, without });
        })
        .catch(() => {
          if (diffSeqRef.current === seq) setDiff(null);
        });
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(estimateParams), hasServerParticipants]);

  if (N === 0) return null;

  const conceptChars = computeConceptOverheadPreview(conceptParticipants);
  const rawBudget = CONTEXT_BUDGET_PREVIEW[depth] ?? 48000;
  const shrunkBudget = Math.max(
    rawBudget - conceptChars,
    Math.floor(rawBudget * 0.4),
  );

  const fmtUsd = (v: number) => "$" + v.toFixed(4);
  const diffCost = diff ? diff.withParents.cost - diff.without.cost : 0;
  const diffTokens = diff
    ? diff.withParents.inTokens - diff.without.inTokens
    : 0;

  return (
    <pre className="mt-2 whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-ink-dim">
      {"Контекст родителей: " +
        conceptChars.toLocaleString("ru") +
        " симв. (" +
        N +
        ")\n" +
        "При ужимании:       бюджет секций " +
        shrunkBudget.toLocaleString("ru") +
        " / " +
        rawBudget.toLocaleString("ru") +
        " симв.\n" +
        "Без ужимания:       бюджет секций " +
        rawBudget.toLocaleString("ru") +
        " симв." +
        (diff
          ? "\nОценка с родителями: " +
            fmtUsd(diff.withParents.cost) +
            " · без: " +
            fmtUsd(diff.without.cost) +
            " · разница: +" +
            fmtUsd(Math.max(diffCost, 0)) +
            " (+" +
            Math.max(diffTokens, 0).toLocaleString("ru") +
            " ток. входа)"
          : "")}
    </pre>
  );
}

/* Опции — тексты дословно из селектов формы исходника */
const METHOD_OPTIONS = [
  ["dialectical", "Диалектический (тезис → антитезис → синтез)"],
  ["integrative", "Интегративный (поиск общих оснований)"],
  ["deconstructive", "Деконструктивный (разбор и пересборка)"],
  ["hermeneutical", "Герменевтический (интерпретация и горизонт)"],
  ["analytical", "Аналитический (формализация и уточнение)"],
  ["creative", "Творческий (свободная комбинаторика)"],
] as const;

const ORDER_OPTIONS = [
  ["architectural", "Архитектурный (граф → определения → тезисы → диалог)"],
  ["genetic", "Генетический (диалог → тезисы → определения → граф)"],
] as const;

const LEVEL_OPTIONS = [
  ["comparative", "Сравнительный (заимствование и переопределение)"],
  ["transformative", "Преобразующий (из напряжений между философами)"],
  ["generative", "Порождающий (от проблемы, не от философов)"],
] as const;

const DEPTH_OPTIONS = [
  ["overview", "Обзорная (компактный документ)"],
  ["standard", "Стандартная (развёрнутый анализ)"],
  ["deep", "Глубокая (академический уровень)"],
  ["exhaustive", "Исчерпывающая (монография)"],
] as const;

const LANG_OPTIONS = [
  ["Russian", "Русский"],
  ["English", "English"],
  ["German", "Deutsch"],
  ["French", "Français"],
  ["Spanish", "Español"],
  ["Chinese", "中文"],
  ["Japanese", "日本語"],
  ["Latin", "Latina"],
  ["__custom", "Другой…"],
] as const;

/** Чекбоксы, отмеченные в исходнике по умолчанию */
const DEFAULT_SECTIONS: PickableSectionKey[] = [
  "graph",
  "glossary",
  "theses",
  "history",
  "name",
  "critique",
];

export interface SynthesisFormProps {
  onSubmit: (input: CreateSynthesisInput) => void;
  /** Идёт запрос/генерация — форма блокируется */
  busy: boolean;
  /** Ошибка сервера (VALIDATION_ERROR и пр.) для показа у кнопки */
  serverError?: string | null | undefined;
}

export function SynthesisForm({ onSubmit, busy, serverError }: SynthesisFormProps) {
  /* Участники-концепции — из пула (беседа 1.5b; см. шапку) */
  const conceptParticipants = usePoolStore((s) => s.conceptParticipants);
  const setPoolStatus = usePoolStore((s) => s.setPoolStatus);
  const [seed, setSeed] = useState("");
  const [context, setContext] = useState("");
  const [philosophers, setPhilosophers] = useState<string[]>([]);
  const [sections, setSections] = useState<PickableSectionKey[]>(
    DEFAULT_SECTIONS,
  );
  const [secCtx, setSecCtx] = useState<Record<string, string>>({});
  const [method, setMethod] = useState("dialectical");
  const [generationOrder, setGenerationOrder] = useState("architectural");
  const [synthLevel, setSynthLevel] = useState("comparative");
  const [depth, setDepth] = useState("standard");
  const [langChoice, setLangChoice] = useState("Russian");
  const [customLang, setCustomLang] = useState("");
  const [extGraphMetrics, setExtGraphMetrics] = useState(false);
  const [keepFullBudget, setKeepFullBudget] = useState(false);
  const [synthReady, setSynthReady] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /* onSynthReadyChange [5116–5142]: при включении — автовключить
     SYNTH_READY_SECTIONS (подсказку про «name» рендерит SectionPicker;
     updateSectionWarnings/updateCostEstimate — автоматически через deps) */
  const handleSynthReadyChange = (checked: boolean) => {
    setSynthReady(checked);
    if (checked) {
      setSections((prev) => {
        const next = [...prev];
        for (const key of SYNTH_READY_SECTIONS) {
          if (!next.includes(key)) next.push(key);
        }
        return next;
      });
    }
  };

  /* Связка пул → форма (React-адаптация DOM-части toggleSynthParticipant
     [4744–4763]): появились ☑-концепции — включаем synthReady + разделы
     (со статусом пула [4750]); ☑-концепций не осталось — снимаем
     synthReady (галочки разделов не трогаем) */
  const hasSynthConcepts = conceptParticipants.length > 0;
  const prevHasSynthRef = useRef(false);
  useEffect(() => {
    const prev = prevHasSynthRef.current;
    prevHasSynthRef.current = hasSynthConcepts;
    if (hasSynthConcepts && !prev && !synthReady) {
      handleSynthReadyChange(true);
      setPoolStatus(
        "☑ Включены разделы, обязательные для мета-синтеза " +
          "(граф, глоссарий, тезисы, диалог, критика, капсула)",
        "ok",
      );
    } else if (!hasSynthConcepts && prev && synthReady) {
      setSynthReady(false);
    }
    // handleSynthReadyChange/synthReady намеренно вне deps: реагируем
    // только на ПЕРЕХОД hasSynthConcepts (ref), не на смену synthReady
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSynthConcepts]);

  const lang =
    langChoice === "__custom" ? customLang.trim() || "Russian" : langChoice;

  /* Advisor v2 + Section Warnings (беседа 1.5): пересчёт при смене
     метода/уровня/порядка/секций — аналог updateCompatAdvisor исходника,
     который тянет за собой updateSectionWarnings. Данные — с сервера
     (POST /syntheses/advice), дебаунс 400 мс; сбой не блокирует форму. */
  const [advice, setAdvice] = useState<SynthesisAdvice | null>(null);
  const adviceSeqRef = useRef(0);
  useEffect(() => {
    const seq = ++adviceSeqRef.current;
    const timer = setTimeout(() => {
      fetchSynthesisAdvice({
        sections,
        method,
        synthLevel,
        generationOrder,
      })
        .then((a) => {
          if (adviceSeqRef.current === seq) setAdvice(a);
        })
        .catch(() => {
          if (adviceSeqRef.current === seq) setAdvice(null);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [sections, method, synthLevel, generationOrder]);

  const buildInput = (): CreateSynthesisInput => {
    // secCtx: только выбранные разделы и только непустые значения
    const sectionContexts: Record<string, string> = {};
    for (const key of sections) {
      const v = (secCtx[key] ?? "").trim();
      if (v) sectionContexts[key] = v;
    }
    const input: CreateSynthesisInput = {
      seed: seed.trim(),
      philosophers,
      sections,
      method,
      depth,
      synthLevel,
      generationOrder,
      extGraphMetrics,
      context: context.trim(),
      lang,
    };
    if (Object.keys(sectionContexts).length > 0)
      input.sectionContexts = sectionContexts;
    if (conceptParticipants.length > 0) input.keepFullBudget = keepFullBudget;
    // Беседа 3.2: каталожные ☑-концепции → ParticipantInput (сервер 3.1
    // принимает type='synthesis'); файловые (без synthesisId) не
    // представимы до авто-импорта при сабмите (долг §12 за 6.2; серверный
    // POST /syntheses/import готов с 4.3) — наличие блокирует сабмит
    const catalogParticipants: ParticipantInput[] = conceptParticipants
      .filter((p) => p.synthesisId)
      .map((p) => ({ type: "synthesis", synthesisId: p.synthesisId! }));
    if (catalogParticipants.length > 0)
      input.participants = catalogParticipants;
    return input;
  };

  /** Параметры для живой оценки стоимости (null — нечего оценивать) */
  const estimateParams = useMemo<CreateSynthesisInput | null>(
    () => (sections.length > 0 ? buildInput() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      seed,
      context,
      philosophers,
      sections,
      secCtx,
      method,
      generationOrder,
      synthLevel,
      depth,
      lang,
      extGraphMetrics,
      keepFullBudget,
      conceptParticipants, // беседа 3.2: участники-концепции в оценке
    ],
  );

  const [submitChecking, setSubmitChecking] = useState(false);

  /* Предполётная проверка генеалогических пересечений (беседа 3.2):
     каталожные ☑-концепции — предки через GET /lineage/ancestors
     (lineageNodeToGenealogy: дерево 3.1 → genealogy-форма), файловые —
     participant.genealogy (reconstructGenealogy). Тексты предупреждений —
     checkGenealogyOverlaps 1:1; confirm — паритет замысла исходника
     (в нём checkGenealogyOverlaps [22467] определена, но не вызвана —
     мёртвый код; серверная 3.1 вернёт те же тексты аддитивным warnings,
     их неблокирующе рисует CreateSynthesisPage). Сбой запроса предков
     проверку молча пропускает — сервер продублирует предупреждения. */
  const collectOverlapWarningTexts = async (): Promise<string[]> => {
    const parts: OverlapParticipant[] = philosophers.map((name) => ({
      type: "philosopher",
      name,
    }));
    for (const p of conceptParticipants) {
      if (p.synthesisId) {
        try {
          const tree = await getAncestors(p.synthesisId);
          parts.push({
            type: "concept",
            name: p.name || "[безымянная концепция]",
            genealogy: lineageNodeToGenealogy(tree),
          });
        } catch {
          parts.push({ type: "concept", name: p.name, genealogy: null });
        }
      } else {
        parts.push({
          type: "concept",
          name: p.name || "[безымянная концепция]",
          genealogy: p.genealogy,
        });
      }
    }
    return checkGenealogyOverlaps(parts).map((w) => w.text);
  };

  const handleSubmit = async () => {
    const participantsCount =
      philosophers.length + conceptParticipants.length;
    if (sections.length === 0) {
      setFormError("Выберите хотя бы один раздел документа.");
      return;
    }
    if (participantsCount === 0 && !seed.trim()) {
      setFormError(
        "Свободный синтез (без философов и концепций) требует зерна: " +
          "заполните «Зерно концепции» или выберите участников.",
      );
      return;
    }
    // Гейт 1.5b СУЖЕН беседой 3.2: сервер принимает каталожные концепции
    // (type='synthesis', беседа 3.1); блокируются только ФАЙЛОВЫЕ —
    // до авто-импорта файлов при сабмите (долг §12 за 6.2)
    const fileConcepts = conceptParticipants.filter((p) => !p.synthesisId);
    if (fileConcepts.length > 0) {
      setFormError(
        "Файловые концепции пока не поддержаны как участники мета-синтеза: " +
          "их нужно сначала импортировать в каталог (серверный импорт — " +
          "в разработке). Снимите ☑ с файловых концепций (" +
          fileConcepts.map((p) => "«" + p.name + "»").join(", ") +
          ") либо добавьте участников кнопкой «+ Из каталога».",
      );
      return;
    }
    setFormError(null);

    // Пересечения предков → confirm (см. комментарий выше)
    if (conceptParticipants.length > 0) {
      setSubmitChecking(true);
      let texts: string[] = [];
      try {
        texts = await collectOverlapWarningTexts();
      } finally {
        setSubmitChecking(false);
      }
      if (texts.length > 0) {
        const ok = window.confirm(
          "Генеалогические пересечения участников:\n\n— " +
            texts.join("\n— ") +
            "\n\nПродолжить генерацию?",
        );
        if (!ok) return;
      }
    }

    onSubmit(buildInput());
  };

  const fieldCls =
    "w-full rounded border border-rule bg-white p-2 text-sm text-ink " +
    "placeholder:text-ink-dim focus:border-gold focus:outline-none";
  const labelCls = "text-sm font-semibold text-ink";
  const sublabelCls =
    "mt-0.5 font-mono text-[10px] leading-relaxed text-ink-dim";

  return (
    <fieldset disabled={busy} className="space-y-5">
      {/* Зерно */}
      <div>
        <div className={labelCls}>Зерно концепции</div>
        <div className={sublabelCls}>
          Исходная идея, проблема или интуиция. Обязательно при свободном
          синтезе (0 участников).
        </div>
        <textarea
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="Например: время как ткань межличностных обязательств..."
          className={`${fieldCls} h-20`}
        />
      </div>

      <PhilosopherPicker selected={philosophers} onChange={setPhilosophers} />

      {/* Unified Concept Pool (беседа 1.5b): «Загруженные Концепции» —
          пул заменяет старые блоки импорта/концептов исходника */}
      <ConceptPool />

      {/* Метод / порядок / уровень / глубина / язык */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <div className={labelCls}>Метод Синтеза</div>
          <div className={sublabelCls}>
            Стратегия объединения идей выбранных философов.
          </div>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className={fieldCls}
          >
            {METHOD_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className={labelCls}>Порядок Генерации</div>
          <div className={sublabelCls}>
            Последовательность порождения разделов.
          </div>
          <select
            value={generationOrder}
            onChange={(e) => setGenerationOrder(e.target.value)}
            className={fieldCls}
          >
            {ORDER_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className={labelCls}>Уровень Синтеза</div>
          <div className={sublabelCls}>
            Насколько радикально категории отрываются от исходных традиций.
          </div>
          <select
            value={synthLevel}
            onChange={(e) => setSynthLevel(e.target.value)}
            className={fieldCls}
          >
            {LEVEL_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className={labelCls}>Глубина Проработки</div>
          <div className={sublabelCls}>
            Влияет на объём и детализацию каждого раздела.
          </div>
          <select
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
            className={fieldCls}
          >
            {DEPTH_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className={labelCls}>Язык генерации</div>
          <select
            value={langChoice}
            onChange={(e) => setLangChoice(e.target.value)}
            className={fieldCls}
          >
            {LANG_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        {langChoice === "__custom" && (
          <div>
            <div className={labelCls}>Укажите язык (по-английски)</div>
            <input
              value={customLang}
              onChange={(e) => setCustomLang(e.target.value)}
              placeholder="e.g. Korean, Ancient Greek, Hindi"
              className={fieldCls}
            />
          </div>
        )}
      </div>

      {/* Доп. контекст */}
      <div>
        <div className={labelCls}>Дополнительный Контекст</div>
        <div className={sublabelCls}>
          Опционально. Любые уточнения, ограничения, фокус внимания.
        </div>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Например: фокус на этике, игнорировать метафизику, интересует применимость к образованию..."
          className={`${fieldCls} h-16`}
        />
      </div>

      <div>
        <SectionPicker
          selected={sections}
          onChange={setSections}
          sectionContexts={secCtx}
          onSectionContextChange={(key, value) =>
            setSecCtx((prev) => ({ ...prev, [key]: value }))
          }
          extGraphMetrics={extGraphMetrics}
          onExtGraphMetricsChange={setExtGraphMetrics}
          synthReady={synthReady}
          onSynthReadyChange={handleSynthReadyChange}
        />
        {/* Порядок исходника: боксы предупреждений, затем compat-панель */}
        <SectionWarnings advice={advice?.advice ?? null} />
        <CompatAdvisor
          entry={advice?.entry ?? null}
          selectedSections={sections}
          generationOrder={generationOrder}
          onApplyReplacement={(param, value) => {
            // applyReplacement [7365] (беседа 3.2): смена параметра формы;
            // пересчёт advice/warnings/estimate — через deps эффектов
            if (param === "method") setMethod(value);
            else if (param === "level") setSynthLevel(value);
            else if (param === "order") setGenerationOrder(value);
          }}
        />
      </div>

      {/* keepFullBudget (v11): только при концепциях в пуле (1.5b) */}
      {conceptParticipants.length > 0 && (
        <div className="rounded border border-rule bg-black/[0.02] p-3">
          <label className="flex cursor-pointer items-start gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={keepFullBudget}
              onChange={(e) => setKeepFullBudget(e.target.checked)}
              className="mt-0.5 accent-[var(--gold)]"
            />
            <span>
              <strong>Сохранять полный бюджет секций</strong>
              <span className="font-normal text-ink-dim">
                {" "}
                — не ужимать из-за контекста родительских концепций
              </span>
            </span>
          </label>
          {/* fullBudgetPreview (renderFullBudgetPreview [10456]) +
              estimate-diff (беседа 3.2) */}
          <FullBudgetPreview depth={depth} estimateParams={estimateParams} />
        </div>
      )}

      {/* Submit-строка */}
      <div className="flex flex-col gap-3 border-t border-rule pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-md font-mono text-[10px] leading-relaxed text-ink-dim">
          Генерация выполняется в несколько проходов с потоковым выводом.
          Каждый проход — отдельный запрос к Claude API. Полный документ может
          занять 2–5 минут в зависимости от глубины и количества разделов.
        </div>
        {/* Кнопка всегда видна (07, тест responsive) */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy || submitChecking}
            className="rounded border border-gold bg-gold px-6 py-2.5 text-sm font-semibold text-white hover:bg-gold-light disabled:opacity-50"
          >
            {busy
              ? "Запуск…"
              : submitChecking
                ? "Проверка генеалогии…"
                : "Синтезировать Концепцию"}
          </button>
          <CostEstimate params={estimateParams} />
        </div>
      </div>

      {(formError || serverError) && (
        <div className="rounded border border-red bg-red/5 p-3 text-sm text-red">
          {formError ?? serverError}
        </div>
      )}
    </fieldset>
  );
}
