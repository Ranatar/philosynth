/**
 * Стартовая страница — гостя встречает рассказ о проекте, не форма входа.
 * Беседа 8.7 (запрос 1, п. 1). Маршрут «/», только для гостя: вошедшего
 * App перенаправляет на /catalog (прежний редирект «/» → /catalog сохранён
 * для него); пока сессия проверяется (status 'restoring'), рисуется
 * заглушка — иначе вошедший на мгновение увидит витрину.
 *
 *  a. что такое PhiloSynth — коротко, языком документа, без маркетинга:
 *     синтез концепций, граф категорий, мета-синтез, режимы;
 *  b. ЖИВАЯ витрина — три-четыре карточки из GET /syntheses/public
 *     (гостевой путь 8.6; SynthesisCard без действий — только чтение),
 *     не выдуманные примеры; пусто/сбой — строкой, страница не падает;
 *  c. цены — GET /billing/plans (гостю с 8.6), разметка — PlansTable,
 *     вынесенная из BillingPage 6.2 (не вторая таблица);
 *  d. КРУПНАЯ кнопка «Создать аккаунт» в ТЕЛЕ страницы (правый верхний угол
 *     шапки уже показал незаметность — кабинет по имени там не находят);
 *     рядом — «Войти» и «Смотреть публичный каталог» (/explore).
 *
 * Оформление: .site-header/.input-form/.form-section-title/.action-btn
 * исходника; своё — блок 8.7 в части 3 globals.css (.app-landing-*):
 * ширина ленты, сетка «что это», крупная кнопка. Палитра закрытая.
 */
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";

import type { SubscriptionPlan } from "@philosynth/shared/types/billing";
import type { SynthesisPreview } from "@philosynth/shared/types/synthesis";

import { getPlans } from "../api/subscription";
import { listPublicSyntheses } from "../api/syntheses";
import { PlansTable } from "../components/billing/PlansTable";
import { SynthesisList } from "../components/catalog/SynthesisList";
import { useAuthStore } from "../stores/auth-store";

/** Сколько карточек живой витрины показывать (три-четыре по протоколу) */
export const LANDING_SHOWCASE_LIMIT = 4;

/** Что такое PhiloSynth — четыре опоры, языком документа */
export const LANDING_FEATURES: readonly { title: string; text: string }[] = [
  {
    title: "Синтез концепций",
    text:
      "Из зерна — вопроса, тезиса, интуиции — и выбранных философских традиций " +
      "строится структурированный документ: цели и метод, портреты участников, " +
      "напряжения, критический анализ. Шесть методов синтеза, три уровня — от " +
      "сравнительного до порождающего, четыре глубины проработки.",
  },
  {
    title: "Граф категорий",
    text:
      "Категории новой концепции и связи между ними извлекаются в таблицы и " +
      "рисуются интерактивным графом — 3D и 2D, с ролями, кластерами и " +
      "топологией. Граф и корпус тезисов — два представления одного содержания " +
      "и порождают друг друга.",
  },
  {
    title: "Мета-синтез",
    text:
      "Готовая концепция становится участником следующей: капсула, категории, " +
      "глоссарий и тезисы родителя входят в контекст порождения. Родословная " +
      "концепций хранится и рисуется деревом.",
  },
  {
    title: "Режимы",
    text:
      "Оппонент — критика с позиций названного философа; переводчик — " +
      "изложение в терминах другой традиции; временной срез — концепция, " +
      "помещённая в иную эпоху. Каждый результат хранится рядом с документом.",
  },
];

export function LandingPage() {
  const status = useAuthStore((s) => s.status);
  // RequireAuth шлёт гостя сюда с исходным путём — «Войти» вернёт туда
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const loginState = from ? { from } : undefined;

  const [showcase, setShowcase] = useState<SynthesisPreview[] | null>(null);
  const [showcaseError, setShowcaseError] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [plansError, setPlansError] = useState(false);

  useEffect(() => {
    if (status !== "anonymous") return;
    let cancelled = false;
    listPublicSyntheses({ limit: LANDING_SHOWCASE_LIMIT })
      .then((r) => {
        if (!cancelled) setShowcase(r.items.slice(0, LANDING_SHOWCASE_LIMIT));
      })
      .catch(() => {
        if (!cancelled) {
          setShowcase([]);
          setShowcaseError(true);
        }
      });
    getPlans()
      .then((p) => {
        if (!cancelled) setPlans(p);
      })
      .catch(() => {
        if (!cancelled) {
          setPlans([]);
          setPlansError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status === "restoring") {
    return (
      <div className="auth-screen">
        <span className="meta-label">проверка сессии…</span>
      </div>
    );
  }
  // Зарегистрированного «/» по-прежнему ведёт в каталог
  if (status === "authenticated") return <Navigate to="/catalog" replace />;

  return (
    <div className="app-landing" data-testid="landing">
      {/* 1a. Что это */}
      <section className="input-form app-landing-hero">
        <h1 className="form-section-title">Синтез философских концепций</h1>
        <p className="app-landing-lead">
          PhiloSynth собирает новую философскую концепцию из зерна и выбранных
          традиций: строит документ с разделами, извлекает категории в граф,
          формулирует тезисы и глоссарий, проводит критический разбор — и
          хранит результат так, что его можно править по месту, перегенерировать
          каскадом, брать в следующий синтез и открывать другим.
        </p>
        {/* 1d. Единственное действие гостя — в теле страницы, крупно */}
        <div className="app-landing-cta-row">
          <Link to="/register" className="submit-btn app-landing-cta" data-testid="landing-register">
            Создать аккаунт
          </Link>
          <Link to="/login" state={loginState} className="action-btn" data-testid="landing-login">
            Войти
          </Link>
          <Link to="/explore" className="action-btn" data-testid="landing-explore">
            Смотреть публичный каталог
          </Link>
        </div>
      </section>

      <section className="input-form">
        <div className="app-landing-grid">
          {LANDING_FEATURES.map((f) => (
            <div key={f.title} className="app-landing-feature">
              <div className="form-label">{f.title}</div>
              <p className="app-landing-feature-text">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 1b. Живая витрина */}
      <section className="input-form" data-testid="landing-showcase">
        <div className="actions-bar" style={{ marginTop: 0 }}>
          <h2 className="form-section-title" style={{ margin: 0, border: "none" }}>
            Публичные концепции
          </h2>
          <Link to="/explore" className="action-btn">
            Все публичные →
          </Link>
        </div>
        {showcase === null ? (
          <div className="pool-status">загрузка витрины…</div>
        ) : (
          <SynthesisList
            items={showcase}
            emptyText={
              showcaseError
                ? "Не удалось загрузить публичный каталог."
                : "Публичных концепций пока нет — первой может стать ваша."
            }
          />
        )}
      </section>

      {/* 1c. Цены — до регистрации */}
      <section className="input-form" data-testid="landing-plans">
        <h2 className="form-section-title">Тарифы</h2>
        <p className="submit-note" style={{ maxWidth: "100%" }}>
          Работать можно тремя способами: со своим ключом Anthropic (стоимость
          для службы нулевая), по подписке с месячными квотами или с баланса —
          пополнение через Stripe, списание по себестоимости запроса с наценкой
          службы. Стоимость каждого синтеза показывается до запуска и в футере
          готового документа.
        </p>
        {plansError ? (
          <div className="pool-status err">Не удалось загрузить тарифы.</div>
        ) : (
          <PlansTable plans={plans} testId="landing-plans-table" />
        )}
      </section>

      <section className="input-form app-landing-foot">
        <Link to="/register" className="submit-btn app-landing-cta" data-testid="landing-register-bottom">
          Создать аккаунт
        </Link>
      </section>
    </div>
  );
}
