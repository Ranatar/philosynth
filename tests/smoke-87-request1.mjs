/**
 * Смоук беседы 8.7 (запрос 1; без сервера, БД и браузера):
 *  - utils/visibility-text: flagsShownFor по ступеням (витрина — только
 *    авторство, приватная — ничего, публичная — четыре), audienceText через
 *    effectiveFlags (действенность, не сырые значения), visibilityBadge;
 *  - synthesis-store: summariesFromSections из тел разделов, текстовый
 *    контракт последовательной загрузки (sections из ответа / витрина без
 *    разделов / иначе /sections), sectionsEmbedded в reloadSections;
 *  - маршруты App.tsx: Layout вне RequireAuth, «/», «/explore»,
 *    «/synthesis/:id» без RequireAuth, остальные — под ним, «*» тоже;
 *    RequireAuth шлёт гостя на «/» со state.from; 8 путей 0.4 на месте;
 *  - Layout/Header: меню и бургер только вошедшему, гостевые ссылки
 *    «Войти» и «Регистрация», бренд гостя → «/», выход → «/»;
 *  - LandingPage: витрина из listPublicSyntheses с лимитом 3–4, PlansTable
 *    (не вторая таблица), крупная кнопка «Создать аккаунт» в теле,
 *    вошедший → /catalog, restoring → заглушка, сбои строкой;
 *  - PlansTable вынесена из BillingPage: в BillingPage <table нет в секции
 *    подписки, столбец действия — слот;
 *  - CatalogPage: publicOnly без «Мои», «Новый синтез» и LineageSearch;
 *    публичность — один updateSynthesis({ visibility, 4 флага }) + тихая
 *    перечитка; флаги из getSynthesis; visibilityErrorText по кодам;
 *  - SynthesisCard/VisibilityControl: «Опубликовать» и isPublic в клиенте
 *    отсутствуют; три ступени, галочки по flagsShownFor, «Сохранить» —
 *    один onSave; клики гасятся; бейдж ступени/автора;
 *  - SynthesisPage: полоса невладельца + кнопка гостю, гейты
 *    contentAvailable/logsAvailable/promptsAvailable по effectiveFlags,
 *    WS/modes/lineage не у гостя, 403 гостю со ссылкой на вход и state.from,
 *    перечитка при смене authStatus; DocumentView — врезка витрины;
 *    DocumentHeader — authorName только при наличии; ContextLogViewer —
 *    promptsAvailable;
 *  - CreateSynthesisPage: metaNotAllowedText с названием;
 *  - globals.css: блок 8.7 в части 3 без новых hex; css-parity — отдельно;
 *  - dotfile: STRIPE_PRICE_* в .env.example, dev-billing-state/ в .gitignore.
 * Запуск: node_modules/.bin/tsx tests/smoke-87-request1.mjs
 */
import { readFileSync } from "node:fs";

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
}
const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. visibility-text ─────────────────────────────────────────────────
console.log("\n1. utils/visibility-text");
const vt = await import("../client/src/utils/visibility-text.ts");
check("VISIBILITY_STEPS — private, showcase, full", vt.VISIBILITY_STEPS.join() === "private,showcase,full");
check("flagsShownFor(full) — четыре", vt.flagsShownFor("full").length === 4);
check("flagsShownFor(showcase) — только showAuthor", vt.flagsShownFor("showcase").join() === "showAuthor");
check("flagsShownFor(private) — ничего", vt.flagsShownFor("private").length === 0);
const base = { showAuthor: true, showLogs: true, showPrompts: true, allowMeta: true };
const aShow = vt.audienceText({ visibility: "showcase", ...base });
check("audienceText витрины — содержание закрыто, мета нельзя", /закрыты/.test(aShow) && /мета-синтез концепцию взять нельзя/.test(aShow));
check("audienceText витрины — сырые флаги не выдаются за действенные", !/открыты логи/.test(aShow));
const aFull = vt.audienceText({ visibility: "full", ...base });
check("audienceText публичной — логи/запросы/мета по флагам", /открыты логи/.test(aFull) && /скачать запросы/.test(aFull) && /можно брать/.test(aFull));
const aFullOff = vt.audienceText({ visibility: "full", showAuthor: false, showLogs: false, showPrompts: false, allowMeta: false });
check("audienceText публичной без флагов — закрыто, без имени", /без имени автора/.test(aFullOff) && /Логи генерации закрыты/.test(aFullOff) && /взять нельзя/.test(aFullOff));
check("audienceText приватной — никто", /никто/.test(vt.audienceText({ visibility: "private", ...base })));
check("visibilityBadge", vt.visibilityBadge("showcase") === "витрина" && vt.visibilityBadge("full") === "публичная");
check("FLAG_LABELS — нет галочки за стоимость/токены", !Object.values(vt.FLAG_LABELS).some((l) => /стоимост|токен/i.test(l)));

// ── 2. synthesis-store ─────────────────────────────────────────────────
console.log("\n2. stores/synthesis-store");
const storeSrc = rd("client/src/stores/synthesis-store.ts");
const storeC = strip(storeSrc);
const store = await import("../client/src/stores/synthesis-store.ts");
const sums = store.summariesFromSections(
  [{ key: "sum", sectionNum: 1, title: "Резюме", htmlContent: "<p>abc</p>", secContext: "", isEdited: false, subsections: ["A"] }],
  "2026-09-15T00:00:00Z",
);
check("summariesFromSections — поля SectionSummary, htmlChars, score null", sums[0].htmlChars === 10 && sums[0].contextQualityScore === null && sums[0].subsections[0] === "A" && sums[0].updatedAt);
check("load — последовательно: сначала getSynthesis, затем разделы по ответу", /const synthesis = await getSynthesis\(id\);\s*const \{ summaries, sections, embedded \} = await sectionsFor\(synthesis\)/.test(storeC));
check("load — Promise.all([getSynthesis, fetchSections]) снят", !/Promise\.all\(\[\s*getSynthesis/.test(storeC));
check("sectionsFor — synthesis.sections → embedded", /if \(synthesis\.sections\)/.test(storeC) && /embedded: true/.test(storeC));
check("sectionsFor — витрина без /sections", /scope === "showcase"\)\s*\{\s*return \{ summaries: \[\], sections: \[\], embedded: false \}/.test(storeC));
check("reloadSections — при sectionsEmbedded перечитывает GET /:id", /if \(get\(\)\.sectionsEmbedded\)[\s\S]*?await getSynthesis\(id\)/.test(storeC));
check("капсула отсечена из вложенных разделов", /filter\(\(s\) => s\.key !== "capsule"\)/.test(storeC));

// ── 3. маршруты ────────────────────────────────────────────────────────
console.log("\n3. App.tsx — маршруты");
const app = rd("client/src/App.tsx"), appC = strip(app);
const guestRoutes = ["/", "/explore", "/synthesis/:id"];
for (const r of guestRoutes) {
  const m = appC.match(new RegExp(`<Route path="${r.replace(/[/:]/g, (c) => "\\" + c)}" element=\\{([\\s\\S]*?)\\} />`));
  check(`маршрут ${r} — вне RequireAuth`, m && !/RequireAuth/.test(m[1]), m ? m[1].slice(0, 60) : "нет маршрута");
}
for (const r of ["/catalog", "/synthesis/new", "/import", "/billing", "/profile", "/admin/prompts", "*"]) {
  const idx = appC.indexOf(`path="${r}"`);
  const chunk = appC.slice(idx, idx + 260);
  check(`маршрут ${r} — под RequireAuth`, idx > 0 && /<RequireAuth>/.test(chunk));
}
check("Layout не обёрнут RequireAuth", !/<RequireAuth>\s*<Layout \/>/.test(appC) && /<Route element=\{<Layout \/>\}>/.test(appC));
check("RequireAuth шлёт гостя на «/» со state.from", /to="\/"\s*replace\s*state=\{\{ from: location\.pathname \+ location\.search \}\}/.test(appC));
check("8 путей протокола 0.4 на месте", ["/login","/register","/catalog","/synthesis/new","/synthesis/:id","/import","/billing","/admin/prompts"].every((p) => appC.includes(`path="${p}"`)));
check("LandingPage импортирована", /import \{ LandingPage \} from "\.\/pages\/LandingPage"/.test(appC));
check("/explore — CatalogPage publicOnly", /path="\/explore" element=\{<CatalogPage publicOnly \/>\}/.test(appC));

// ── 4. Layout / Header ─────────────────────────────────────────────────
console.log("\n4. Layout / Header");
const layC = strip(rd("client/src/components/layout/Layout.tsx"));
const hdr = rd("client/src/components/layout/Header.tsx"), hdrC = strip(hdr);
check("Layout — Sidebar только вошедшему", /\{authenticated && \(\s*<Sidebar/.test(layC));
check("Layout — бургер по showBurger={authenticated}", /showBurger=\{authenticated\}/.test(layC));
check("Header — гостевые ссылки «Войти» и «Регистрация»", /app-guest-links[\s\S]*to="\/login"[\s\S]*Войти[\s\S]*to="\/register"[\s\S]*Регистрация/.test(hdrC));
check("Header — правая часть пуста при restoring", /status === "anonymous" \?/.test(hdrC) && /: null\}/.test(hdrC));
check("Header — бренд гостя → «/»", /to=\{user \? "\/catalog" : "\/"\}/.test(hdrC));
check("Header — выход → «/»", /await logout\(\);\s*navigate\("\/"\)/.test(hdrC));
check("Header — бургер под showBurger", /\{showBurger && \([\s\S]*app-burger/.test(hdrC));

// ── 5. LandingPage / PlansTable ────────────────────────────────────────
console.log("\n5. LandingPage / PlansTable");
const land = rd("client/src/pages/LandingPage.tsx"), landC = strip(land);
const landing = await import("../client/src/pages/LandingPage.tsx");
check("LANDING_SHOWCASE_LIMIT ∈ [3,4]", landing.LANDING_SHOWCASE_LIMIT >= 3 && landing.LANDING_SHOWCASE_LIMIT <= 4);
check("LANDING_FEATURES — синтез, граф, мета-синтез, режимы", landing.LANDING_FEATURES.map((f) => f.title).join("|") === "Синтез концепций|Граф категорий|Мета-синтез|Режимы");
check("витрина живая — listPublicSyntheses с лимитом", /listPublicSyntheses\(\{ limit: LANDING_SHOWCASE_LIMIT \}\)/.test(landC));
check("витрина — карточки SynthesisList без действий", /<SynthesisList\s+items=\{showcase\}\s+emptyText=/.test(landC) && !/actions=/.test(landC) && !/visibility=/.test(landC));
check("цены — getPlans + PlansTable", /getPlans\(\)/.test(landC) && /<PlansTable plans=\{plans\}/.test(landC) && !/<table/.test(landC));
check("крупная кнопка «Создать аккаунт» в теле — submit-btn app-landing-cta → /register", /to="\/register" className="submit-btn app-landing-cta"/.test(landC));
check("вошедший → /catalog, restoring → заглушка", /status === "authenticated"\) return <Navigate to="\/catalog" replace \/>/.test(landC) && /status === "restoring"/.test(landC));
check("сбои витрины/цен — строкой (catch → [])", (landC.match(/\.catch\(\(\) => \{/g) ?? []).length >= 2 && /Не удалось загрузить публичный каталог/.test(landC) && /Не удалось загрузить тарифы/.test(landC));
check("state.from доносится до «Войти»", /state=\{loginState\}/.test(landC));
check("ссылка на публичный каталог /explore", /to="\/explore"/.test(landC));
const plansC = strip(rd("client/src/components/billing/PlansTable.tsx"));
check("PlansTable — одна таблица data-table со слотом renderAction", /className="data-table"/.test(plansC) && /renderAction && <th \/>/.test(plansC) && /renderAction && <td>\{renderAction\(p\)\}<\/td>/.test(plansC));
const billC = strip(rd("client/src/pages/BillingPage.tsx"));
check("BillingPage — тарифы через PlansTable, своей таблицы тарифов нет", /<PlansTable\s+plans=\{plans\}\s+renderAction=/.test(billC) && !/<th>Тариф<\/th>/.test(billC));
check("BillingPage — «Оформить» в слоте, data-testid sub-plan-", /sub-plan-\$\{p\.name\}/.test(billC) && /Оформить/.test(billC));
check("periodWord — из PlansTable", /import \{ PlansTable, periodWord \} from "\.\.\/components\/billing\/PlansTable"/.test(billC) && !/^function periodWord/m.test(billC));

// ── 6. CatalogPage ─────────────────────────────────────────────────────
console.log("\n6. CatalogPage");
const cp = rd("client/src/pages/CatalogPage.tsx"), cpC = strip(cp);
const cpMod = await import("../client/src/pages/CatalogPage.tsx");
const { ApiError } = await import("../client/src/api/client.ts");
check("publicOnly — вкладка по умолчанию public", /useState<CatalogTab>\(publicOnly \? "public" : "mine"\)/.test(cpC));
check("publicOnly — без «Мои»/«Публичные» и «Новый синтез»", /\{!publicOnly && tabBtn\("mine", "Мои"\)\}/.test(cpC) && /publicOnly \? \([\s\S]*?\) : \(\s*<Link to="\/synthesis\/new"/.test(cpC));
check("LineageSearch — только вошедшему и не в publicOnly", /\{lineageSearchOpen && authenticated && !publicOnly && \(/.test(cpC) && /\{authenticated && !publicOnly && \(\s*<button/.test(cpC));
check("гостю на /explore — «Создать аккаунт»", /explore-register/.test(cpC) && /to="\/register"/.test(cpC));
check("публичность — ОДИН PATCH со ступенью и четырьмя флагами", /await updateSynthesis\(id, \{\s*visibility: flags\.visibility,\s*showAuthor: flags\.showAuthor,\s*showLogs: flags\.showLogs,\s*showPrompts: flags\.showPrompts,\s*allowMeta: flags\.allowMeta,\s*\}\)/.test(cpC));
check("после PATCH — тихая перечитка", /await updateSynthesis\([\s\S]*?await fetchList\(\{ silent: true \}\)/.test(cpC));
check("флаги черновика — из getSynthesis", /loadFlags: async \(id\) => \{\s*const full = await getSynthesis\(id\)/.test(cpC));
check("isPublic/handleTogglePublic/togglingId в CatalogPage нет", !/isPublic|handleTogglePublic|togglingId/.test(cpC));
check("updateSynthesis( на месте (4p)", cp.includes("updateSynthesis("));
check("visibility передаётся только на «Мои»", /visibility=\{tab === "mine" \? cardVisibility : undefined\}/.test(cpC));
check("visibilityErrorText — details.visibility у 400", cpMod.visibilityErrorText(new ApiError("x", "VALIDATION_ERROR", 400, { visibility: "вне перечисления" })) === "Публичность: вне перечисления");
check("visibilityErrorText — 403", /владелец/.test(cpMod.visibilityErrorText(new ApiError("Forbidden", "FORBIDDEN", 403))));
check("visibilityErrorText — не ApiError", /Не удалось/.test(cpMod.visibilityErrorText(new Error("boom"))));

// ── 7. SynthesisCard / VisibilityControl ───────────────────────────────
console.log("\n7. SynthesisCard / VisibilityControl / SynthesisList");
const card = rd("client/src/components/catalog/SynthesisCard.tsx"), cardC = strip(card);
const vc = rd("client/src/components/catalog/VisibilityControl.tsx"), vcC = strip(vc);
const listC = strip(rd("client/src/components/catalog/SynthesisList.tsx"));
check("карточка — «Опубликовать»/«Скрыть»/isPublic/onTogglePublic нет", !/Опубликовать|Скрыть|isPublic|onTogglePublic|togglingId/.test(cardC));
check("карточка — кнопка «Публичность» открывает VisibilityControl", /Публичность/.test(cardC) && /<VisibilityControl/.test(cardC) && /mode\.kind === "visibility"/.test(cardC));
check("карточка — бейдж ступени (visibilityBadge) и авторство", /visibilityBadge\(synthesis\.visibility\)/.test(cardC) && /synthesis\.authorName && \(/.test(cardC));
check("карточка — actions и visibility только по пропам (гостю — чтение)", /\{\(visibility \|\| actions\) && \(/.test(cardC));
check("SynthesisList — проброс visibility/actions, гостю без обоих", /visibility=\{visibility\}\s*actions=\{actions\}/.test(listC));
check("VisibilityControl — три ступени по VISIBILITY_STEPS, role=radio", /VISIBILITY_STEPS\.map/.test(vcC) && /role="radio"/.test(vcC));
check("VisibilityControl — галочки по flagsShownFor", /flagsShownFor\(shownStep\)/.test(vcC));
check("VisibilityControl — строка-пояснение на витрине", /shownStep === "showcase" && \([\s\S]*SHOWCASE_FLAGS_NOTE/.test(vcC));
check("VisibilityControl — смена ступени не трогает флаги", /setDraft\(\{ \.\.\.draft, visibility: v \}\)/.test(vcC));
check("VisibilityControl — один onSave по «Сохранить», без PATCH на галочку", (vcC.match(/onSave\(/g) ?? []).length === 1 && /Сохранить/.test(vcC) && !/updateSynthesis|apiPatch/.test(vcC));
check("VisibilityControl — audienceText по черновику", /audienceText\(draft\)/.test(vcC));
check("VisibilityControl — клики гасятся (preventDefault+stopPropagation)", /e\.preventDefault\(\);\s*e\.stopPropagation\(\);/.test(vcC) && /onClick=\{stop\}/.test(vcC));
check("VisibilityControl — флаги из loadFlags при открытии", /loadFlags\(synthesisId\)/.test(vcC));
check("VisibilityControl — без window.confirm/prompt", !/window\.confirm|window\.prompt|confirm\(/.test(vcC));
check("shared — isPublic снят из SynthesisFull/Preview/PatchInput (вариант б)", !/isPublic\??: boolean/.test(strip(rd("packages/shared/types/synthesis.ts"))));
check("сервер — DTO без isPublic, синоним PATCH → 400", !/isPublic: isPublicOf/.test(strip(rd("server/routes/syntheses.ts"))) && /details\.isPublic = "снят в 8\.7/.test(rd("server/routes/syntheses.ts")));

// ── 8. SynthesisPage / Document* ───────────────────────────────────────
console.log("\n8. SynthesisPage / DocumentView / DocumentHeader / ContextLogViewer");
const sp = rd("client/src/pages/SynthesisPage.tsx"), spC = strip(sp);
check("смотрящий — authStatus из auth-store, isGuest", /const isGuest = authStatus !== "authenticated"/.test(spC));
check("гейты — contentAvailable/logsAvailable/promptsAvailable по effectiveFlags", /effectiveFlags\(synthesis\)/.test(spC) && /const contentAvailable = isOwner \|\| \(!isGuest && scopeFull\)/.test(spC) && /logsAvailable = isOwner \|\| \(!isGuest && !!eff\?\.showLogs\)/.test(spC) && /promptsAvailable = isOwner \|\| \(!isGuest && !!eff\?\.showPrompts\)/.test(spC));
check("полоса невладельца + «Создать аккаунт» гостю", /\{!isOwner && \(\s*<div className="app-view-banner"/.test(spC) && /Вы смотрите публичную концепцию/.test(spC) && /\{isGuest && \(\s*<Link to="\/register"/.test(spC));
check("WS — synthesisId null гостю", /synthesisId: !isGuest \? \(id \?\? null\) : null/.test(spC));
check("GET /modes — только владельцу", /!isOwnerForModes\) return/.test(spC));
check("/lineage/ancestors — не гостю", /!isMetaSynthesis \|\| isGuest\) return/.test(spC));
check("граф и экспорт — под contentAvailable", (spC.match(/\{contentAvailable && \(/g) ?? []).length === 2);
check("✎ Изменить и режимы — под isOwner", /\{isOwner && \(\s*<button[\s\S]*?✎ Изменить/.test(spC) && /hasCapsule &&\s*isOwner &&\s*MODE_ORDER\.map/.test(spC));
check("◈ Лог — по logsAvailable, viewer с promptsAvailable", /onOpenLog=\{logsAvailable \? \(\) => setLogOpen\(true\) : undefined\}/.test(spC) && /promptsAvailable=\{promptsAvailable\}/.test(spC));
check("GenerationProgress/PauseModal — владельцу", /\{live && isOwner && \(/.test(spC) && /open=\{pauseModalOpen && paused && isOwner\}/.test(spC));
check("403 гостю — «приватна» + ссылка на вход со state.from", /Эта концепция приватна/.test(spC) && /to="\/login"\s*state=\{\{ from: location\.pathname \+ location\.search \}\}/.test(spC));
check("перечитка при смене authStatus (restoring — не переход)", /prevAuthRef/.test(spC) && /if \(prev !== authStatus && id\) void load\(id\)/.test(spC));
check("4p: viewOnly: true / pausedState / reloadSections / <PauseModal целы", sp.includes("viewOnly: true") && sp.includes("synthesis?.pausedState") || sp.includes("synthesis.pausedState") && sp.includes("reloadSections") && sp.includes("<PauseModal"));
check("потомки в каталоге — не гостю", /\{!isGuest && \(\s*<div className="doc-meta-key"[\s\S]*?descendantsOf/.test(spC));
const dvC = strip(rd("client/src/components/document/DocumentView.tsx"));
check("DocumentView — витрина: врезка вместо оглавления и разделов", /const showcase = synthesis\.scope === "showcase" && !synthesis\.isOwner/.test(dvC) && /Автор открыл только витрину/.test(dvC) && /showcase \? \([\s\S]*?\) : \(\s*<div>\s*<TableOfContents/.test(dvC));
const dhC = strip(rd("client/src/components/document/DocumentHeader.tsx"));
check("DocumentHeader — «Автор» только при authorName", /\{synthesis\.authorName && \([\s\S]*?Автор/.test(dhC));
const clv = strip(rd("client/src/components/logs/ContextLogViewer.tsx"));
check("ContextLogViewer — «Скачать промпты» под promptsAvailable", /promptsAvailable \!== false && \(/.test(clv));

// ── 9. META_NOT_ALLOWED ────────────────────────────────────────────────
console.log("\n9. CreateSynthesisPage — META_NOT_ALLOWED");
const cs = await import("../client/src/pages/CreateSynthesisPage.tsx");
check("metaNotAllowedText — название и причина", /«Тезис о ничто»/.test(cs.metaNotAllowedText({ participants: "u", title: "Тезис о ничто" })) && /не разрешил/.test(cs.metaNotAllowedText({ title: "X" })));
check("metaNotAllowedText — без title: общий текст", /одной из концепций/.test(cs.metaNotAllowedText({})));
check("serverErrorMessage — META_NOT_ALLOWED идёт в metaNotAllowedText", /Y-концепция/.test(cs.serverErrorMessage(new ApiError("Автор…", "META_NOT_ALLOWED", 403, { participants: "u", title: "Y-концепция" }))));

// ── 10. CSS и dotfile ──────────────────────────────────────────────────
console.log("\n10. globals.css блок 8.7 / dotfile");
const css = rd("client/src/globals.css");
const b87 = css.slice(css.indexOf("Беседа 8.7 — витрина"), css.indexOf("Беседа 6.2 — биллинг"));
check("блок 8.7 в части 3, ДО блока 6.2", b87.length > 500 && css.indexOf("Беседа 8.7 — витрина") > css.indexOf("Часть 3. Дополнения сервиса"));
for (const cls of [".app-landing", ".app-landing-cta", ".app-landing-grid", ".app-guest-link", ".app-view-banner", ".app-showcase-notice", ".visibility-steps", ".visibility-step.active", ".visibility-flags", ".visibility-note", ".visibility-audience"]) {
  check(`правило ${cls}`, b87.includes(`${cls} {`) || b87.includes(`${cls},`));
}
check("новых hex-цветов в блоке нет (только #fff)", (b87.match(/#[0-9a-fA-F]{3,6}\b/g) ?? []).every((h) => h.toLowerCase() === "#fff"));
check("активная ступень — --blue-corp (как вкладки)", /\.visibility-step\.active \{[^}]*var\(--blue-corp\)/.test(b87));
check("полоса — золотая рама (--gold)", /\.app-view-banner \{[^}]*var\(--gold\)/.test(b87));
const envEx = rd(".env.example");
check(".env.example — STRIPE_PRICE_STARTER/PRO/ACADEMIC", ["STARTER", "PRO", "ACADEMIC"].every((n) => new RegExp(`^STRIPE_PRICE_${n}=`, "m").test(envEx)));
check(".gitignore — dev-billing-state/", /^dev-billing-state\/$/m.test(rd(".gitignore")));

console.log(`\nИТОГ: ${n - failed} ✓ / ${failed} ✗`);
process.exit(failed ? 1 : 0);
