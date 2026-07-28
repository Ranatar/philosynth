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
 * концепциях-участниках в пуле. Unified Concept Pool — беседа 1.5b;
 * до неё conceptParticipants=[] и блок скрыт (условие уже рабочее).
 */
import { useEffect, useMemo, useRef, useState } from "react";

import type { CreateSynthesisInput } from "../../api/syntheses";
import {
  fetchSynthesisAdvice,
  type SynthesisAdvice,
} from "../../api/syntheses";
import { CompatAdvisor } from "./CompatAdvisor";
import { CostEstimate } from "./CostEstimate";
import { PhilosopherPicker } from "./PhilosopherPicker";
import { SectionPicker, type PickableSectionKey } from "./SectionPicker";
import { SectionWarnings } from "./SectionWarnings";

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
  /** Концепции-участники из Unified Concept Pool (беседа 1.5b);
   *  пока пула нет — пусто, блок keepFullBudget скрыт */
  conceptParticipants?: readonly { name: string }[] | undefined;
}

export function SynthesisForm({
  onSubmit,
  busy,
  serverError,
  conceptParticipants = [],
}: SynthesisFormProps) {
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
  const [formError, setFormError] = useState<string | null>(null);

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
    ],
  );

  const handleSubmit = () => {
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
    setFormError(null);
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
        />
        {/* Порядок исходника: боксы предупреждений, затем compat-панель */}
        <SectionWarnings advice={advice?.advice ?? null} />
        <CompatAdvisor
          entry={advice?.entry ?? null}
          selectedSections={sections}
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
            onClick={handleSubmit}
            disabled={busy}
            className="rounded border border-gold bg-gold px-6 py-2.5 text-sm font-semibold text-white hover:bg-gold-light disabled:opacity-50"
          >
            {busy ? "Запуск…" : "Синтезировать Концепцию"}
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
