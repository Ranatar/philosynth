// Фрагменты philosynth.html (26 024 стр., ревизия 2026-07) для беседы 2.3-edit-modal-ui
// Сгенерировано extract-fragments.py; при обновлении исходника — перегенерировать.

// ───── [EDIT MODAL→EXECUTE EDIT PLAN] philosynth.html строки 18337–19506 ─────
      // ════════════════════════════════════════
      // EDIT MODAL — пакетный режим
      // ════════════════════════════════════════

      function openEditModal() {
        if (!DOC_STATE.ready) {
          alert("Документ ещё не сгенерирован.");
          return;
        }
        if (!API_KEY) {
          alert("API-ключ не задан.");
          return;
        }
        if (DOC_STATE.incomplete) {
          let msg = "Редактирование ограничено: при импорте не удалось извлечь список философов.\n\n";
          for (const w of (DOC_STATE.importWarnings || [])) {
            if (w.critical) msg += "⚠ " + w.message + "\n";
          }
          msg += "\nЗаполните поле «Философы» в форме ввода.\nОткрыть для просмотра?";
          if (!confirm(msg)) return;
        }
        renderEditSections();
        document.getElementById("editOverlay").classList.add("visible");
        document.body.style.overflow = "hidden";
      }

      function closeEditModal() {
        document.getElementById("editOverlay").classList.remove("visible");
        document.body.style.overflow = "";
      }

      /** Перегенерация «Структура документа» из модального окна редактирования */
      async function regenStructureFromEditModal() {
        const card = document.getElementById("structureOutdatedCard");
        const btn = card?.querySelector("button");
        if (btn) { btn.disabled = true; btn.textContent = "Генерация..."; }
        try {
          await regenerateSubsection("sum", "Структура документа");
          // structureSections обновляется внутри regenerateSubsection
          if (card) {
            card.style.borderColor = "var(--green-check)";
            card.style.background = "#f0fff4";
            card.innerHTML =
              '<div style="font-family:var(--mono);font-size:10px;color:var(--green-check);letter-spacing:0.3px">' +
              '<span style="margin-right:6px">✓</span>Подраздел «Структура документа» обновлён.</div>';
            setTimeout(() => card.remove(), 3000);
          }
        } catch (err) {
          if (btn) { btn.disabled = false; btn.textContent = "Обновить"; }
          alert("Ошибка: " + err.message);
        }
      }

      function esc(s) {
        if (typeof s !== "string") return "";
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;");
      }

      /** Текущий план изменений (пересчитывается при каждом тике галочки) */
      let _editPlan = { regen: [], remove: [], add: [] };

      function renderEditSections() {
        // Сбрасываем план ДО построения карточек (чтобы режимы не видели старый план)
        _editPlan = { regen: [], remove: [], add: [], modeRegen: [], modeRemove: [] };

        const body = document.getElementById("editModalBody");
        // Сохраняем каскадную панель (она стоит первой и не пересоздаётся)
        const cascadePanel = document.getElementById("cascadePanel");
        body.innerHTML = "";
        if (cascadePanel) body.appendChild(cascadePanel);

        // ── Карточка «Структура документа» устарела ──
        const structureOutdated = DOC_STATE.structureSections === null
          ? true  // старый файл — актуальность неизвестна
          : JSON.stringify(DOC_STATE.structureSections) !== JSON.stringify(DOC_STATE.sectionOrder);

        if (structureOutdated && DOC_STATE.sectionOrder.includes("sum")) {
          const structCard = document.createElement("div");
          structCard.id = "structureOutdatedCard";
          structCard.style.cssText =
            "border:1px solid var(--gold);background:#fffbee;padding:12px 16px;" +
            "margin-bottom:10px;display:flex;align-items:center;gap:12px;justify-content:space-between";
          const isUnknown = DOC_STATE.structureSections === null;
          const msg = isUnknown
            ? "Актуальность подраздела «Структура документа» в Резюме не определена. Рекомендуется обновить."
            : "Подраздел «Структура документа» в Резюме устарел (перечень разделов изменился).";
          structCard.innerHTML =
            '<div style="font-family:var(--mono);font-size:10px;color:var(--gold);letter-spacing:0.3px">' +
            '<span style="margin-right:6px">⚡</span>' + esc(msg) + '</div>' +
            '<button class="action-btn" style="border-color:var(--gold);color:var(--gold);white-space:nowrap;flex-shrink:0" ' +
            'onclick="regenStructureFromEditModal()">Обновить</button>';
          body.appendChild(structCard);
        }

        const order = DOC_STATE.sectionOrder.filter(k => k !== "sum");

        // ── Карточки существующих разделов ──
        for (const key of order) {
          const def = DOC_STATE.sectionDefs[key];
          if (!def) continue;
          const label = KEY_LABELS[key] || key;
          const currentCtx = DOC_STATE.params.secCtx[key] || "";
          const isEdited = DOC_STATE.editedSections.has(key);

          // Индикатор качества
          let qualityBadge = "";
          const quality = typeof getSectionContextQuality === "function"
            ? getSectionContextQuality(key) : null;
          if (quality) {
            const badgeColor = quality.score >= 90 ? "var(--green-check)"
              : quality.score >= 60 ? "var(--gold)" : "var(--red)";
            const tooltip = [
              `Контекст: ${quality.reqFound}/${quality.reqTotal} обяз., ${quality.optIncluded}/${quality.optTotal} опц.`,
              `Бюджет: ${quality.budgetUsed.toLocaleString("ru")}/${quality.budget.toLocaleString("ru")} симв.`,
              ...quality.issues,
            ].join("&#10;");
            qualityBadge = ` <span title="${tooltip}" style="font-family:var(--mono);font-size:9px;color:${badgeColor};border:1px solid ${badgeColor};padding:1px 5px;margin-left:6px;cursor:help">${quality.score}%</span>`;
          }

          // Предупреждение о деградации
          let degradationHTML = "";
          if (quality && quality.issues.length > 0 && quality.score < 70) {
            degradationHTML = `<div class="edit-dep-warn caution" style="margin-top:6px">
              <span class="dep-icon">⚡</span>
              <span>Сгенерирован с неполным контекстом (${quality.score}%). ${quality.issues.join("; ")}.</span>
            </div>`;
          }

          const card = document.createElement("div");
          card.className = "edit-sec-card";
          card.id = "editCard-" + key;
          card.innerHTML = `
            <div class="edit-sec-card-header">
              <div class="edit-sec-title">${isEdited ? "⟳ " : ""}§ ${def.num} — ${esc(label)}${qualityBadge}</div>
              <div class="edit-sec-num">${key}</div>
            </div>${degradationHTML}
            <div class="edit-sec-ctx-row">
              <div class="edit-sec-ctx-label">Дополнительный контекст раздела</div>
              <textarea class="edit-sec-ctx-field" id="editCtx-${key}"
                        placeholder="Особые требования, акценты, ограничения...">${esc(currentCtx)}</textarea>
            </div>
            ${key === "graph" ? `<div style="margin:4px 0 0 2px">
              <label class="checkbox-item" style="font-size:10px;color:var(--ink-dim)">
                <input type="checkbox" id="editExtGraphMetrics"
                  ${DOC_STATE.params.extGraphMetrics ? "checked" : ""}
                  onchange="DOC_STATE.params.extGraphMetrics = this.checked" />
                Расширенные характеристики
              </label>
            </div>` : ""}
            <div class="edit-sec-checks">
              <label class="edit-sec-check">
                <input type="checkbox" id="editRegen-${key}" onchange="onEditCheckChange('${key}','regen')">
                Перегенерировать
              </label>
              <label class="edit-sec-check delete-check">
                <input type="checkbox" id="editDelete-${key}" onchange="onEditCheckChange('${key}','delete')">
                Удалить
              </label>
            </div>
            <div class="edit-regen-progress" id="editProgress-${key}">
              <div class="edit-regen-spinner"></div>
              <span id="editProgressText-${key}"></span>
            </div>`;
          // ── Подразделы для точечной перегенерации ──
          const subsecMap = buildSubsectionMap(DOC_STATE.params);
          const subsections = (subsecMap[key] || []).filter(name => {
            // Исключаем shared/bridge — только именованные подразделы
            const item = def.parts?.subsections?.find(s => s.name === name);
            return item && !item.type;
          });
          if (subsections.length > 1 && def.parts) {
            const subsecPanel = document.createElement("div");
            subsecPanel.style.cssText = "margin-top:8px;padding:8px 0;border-top:1px dashed var(--rule)";
            subsecPanel.innerHTML = `
              <div style="font-family:var(--mono);font-size:9px;letter-spacing:1px;color:var(--ink-dim);margin-bottom:6px">
                ПОДРАЗДЕЛЫ (точечная перегенерация)
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:4px" id="subBtns-${key}">
                ${subsections.map(name => `
                  <button class="edit-sec-btn" style="font-size:9px;padding:4px 10px"
                          onclick="showSubsectionRegenUI('${key}', '${name.replace(/'/g, "\\'")}')">
                    ⟳ ${esc(name)}
                  </button>
                `).join("")}
              </div>
              <div id="subRegenPanel-${key}" style="display:none;margin-top:8px;padding:10px;border:1px solid var(--rule);background:var(--white)">
                <div style="font-family:var(--mono);font-size:10px;font-weight:600;color:var(--blue-corp);margin-bottom:6px" id="subRegenTitle-${key}"></div>
                <textarea class="edit-sec-ctx-field" id="subRegenNote-${key}"
                          placeholder="Дополнительная инструкция (необязательно)..." style="height:40px"
                          oninput="toggleSubRegenInclude('${key}')"></textarea>
                <div style="margin-top:6px;display:none" id="subRegenIncludeWrap-${key}">
                  <label class="edit-sec-check" style="font-size:10px">
                    <input type="checkbox" id="subRegenInclude-${key}">
                    Включить текущее содержимое подраздела в контекст
                  </label>
                </div>
                <div style="margin-top:8px;display:flex;gap:6px">
                  <button class="edit-sec-btn primary" style="font-size:9px;padding:5px 14px"
                          onclick="executeSubsectionRegen('${key}')">▶ Перегенерировать</button>
                  <button class="edit-sec-btn" style="font-size:9px;padding:5px 14px"
                          onclick="hideSubsectionRegenUI('${key}')">Отмена</button>
                </div>
                <div id="subIntraDeps-${key}" style="margin-top:6px;font-family:var(--mono);font-size:9px;color:var(--gold)"></div>
              </div>
              <div id="subProgress-${key}" class="edit-regen-progress">
                <div class="edit-regen-spinner"></div>
                <span id="subProgressText-${key}"></span>
              </div>
            `;
            card.appendChild(subsecPanel);
          }
          body.appendChild(card);
        }

        // ── Карточки режимов ──
        const modesWithResults = Object.entries(DOC_STATE.modes || {})
          .filter(([, results]) => Array.isArray(results) && results.some(r => r.html));

        if (modesWithResults.length > 0) {
          const modesPanel = document.createElement("div");
          modesPanel.style.cssText = "margin-top:12px;padding:14px 18px;border:2px solid var(--violet);background:var(--violet-light)";
          modesPanel.innerHTML = `<div style="font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:2px;color:var(--violet);margin-bottom:10px">РЕЖИМЫ</div>`;

          // Текущий план для проверки затронутых зависимостей
          const planSections = [
            ...(_editPlan.regen || []),
            ...(_editPlan.remove || []),
            ...(_editPlan.add || []),
          ];
          const allAffectedModes = getAffectedModes(planSections);

          for (const [modeKey, results] of modesWithResults) {
            const config = MODE_CONFIG[modeKey];
            if (!config) continue;

            for (let i = 0; i < results.length; i++) {
              const r = results[i];
              if (!r?.html) continue;

              const modeCard = document.createElement("div");
              modeCard.className = "edit-sec-card";
              modeCard.style.borderColor = "var(--violet)";
              modeCard.innerHTML = `
                <div class="edit-sec-card-header">
                  <div class="edit-sec-title" style="color:var(--violet)">
                    ${config.title} · ${esc(r.param)}
                  </div>
                  <div class="edit-sec-num" style="font-size:9px;color:var(--ink-dim)">
                    ${new Date(r.timestamp).toLocaleString("ru-RU")}
                  </div>
                </div>
                <div class="edit-sec-checks">
                  <label class="edit-sec-check" style="color:var(--violet)">
                    <input type="checkbox" id="editRegenMode-${modeKey}-${i}"
                           style="accent-color:var(--violet)" onchange="recalcEditPlan()">
                    Перегенерировать
                  </label>
                  <label class="edit-sec-check delete-check">
                    <input type="checkbox" id="editDeleteMode-${modeKey}-${i}"
                           onchange="recalcEditPlan()">
                    Удалить
                  </label>
                </div>`;

              // Предупреждение о затронутых зависимостях
              const modeAffected = allAffectedModes.filter(
                a => a.modeKey === modeKey && a.index === i
              );
              if (modeAffected.length > 0) {
                const warnDiv = document.createElement("div");
                warnDiv.style.cssText =
                  "margin-top:6px;font-family:var(--mono);font-size:9px;color:var(--violet);" +
                  "background:rgba(107,0,170,0.06);border:1px solid rgba(107,0,170,0.15);padding:5px 10px";
                warnDiv.textContent = "⚡ " + modeAffected[0].reason + " — рекомендуется перегенерация";
                modeCard.appendChild(warnDiv);
              }

              modesPanel.appendChild(modeCard);
            }
          }

          body.appendChild(modesPanel);
        }

        // ── Панель добавления ──
        const available = typeof getAvailableSectionsToAdd === "function"
          ? getAvailableSectionsToAdd() : [];
        if (available.length > 0) {
          const addPanel = document.createElement("div");
          addPanel.className = "edit-add-panel";
          let checksHTML = available.map(k =>
            `<label class="edit-add-check">
              <input type="checkbox" id="editAdd-${k}" onchange="onEditCheckChange('${k}','add')">
              + ${esc(KEY_LABELS[k] || k)}
            </label>`
          ).join("");

          // Поля контекста для добавляемых разделов (скрыты, появляются при установке галочки)
          let addCtxHTML = available.map(k =>
            `<div class="edit-sec-ctx-row" id="editAddCtxWrap-${k}" style="display:none;margin-top:8px">
              <div class="edit-sec-ctx-label">Контекст для «${esc(KEY_LABELS[k] || k)}»</div>
              <textarea class="edit-sec-ctx-field" id="editAddCtx-${k}"
                        placeholder="Особые требования..."></textarea>
            </div>`
          ).join("");

          addPanel.innerHTML = `
            <div class="edit-add-title">+ Добавить разделы</div>
            <div class="edit-add-checks">${checksHTML}</div>
            ${addCtxHTML}
            <div class="edit-regen-progress" id="editAddProgress">
              <div class="edit-regen-spinner"></div>
              <span id="editAddProgressText"></span>
            </div>`;
            
          body.appendChild(addPanel);
        }

        // План уже сброшен в начале функции
        updateEditPlanUI();
      }

      /** Обработчик изменения любой галочки в модальном окне */
      function onEditCheckChange(key, action) {
        if (action === "regen") {
          const regenCb = document.getElementById("editRegen-" + key);
          const delCb = document.getElementById("editDelete-" + key);
          // Взаимоисключение
          if (regenCb?.checked && delCb) { delCb.checked = false; delCb.disabled = true; }
          else if (delCb) { delCb.disabled = false; }
        }
        if (action === "delete") {
          const delCb = document.getElementById("editDelete-" + key);
          const regenCb = document.getElementById("editRegen-" + key);
          if (delCb?.checked && regenCb) { regenCb.checked = false; regenCb.disabled = true; }
          else if (regenCb) { regenCb.disabled = false; }
        }
        if (action === "add") {
          // Показать/скрыть поле контекста
          const cb = document.getElementById("editAdd-" + key);
          const ctxWrap = document.getElementById("editAddCtxWrap-" + key);
          if (ctxWrap) ctxWrap.style.display = cb?.checked ? "block" : "none";
        }

        recalcEditPlan();
      }

      let _subRegenTarget = {}; // { sectionKey: subsectionName }

      function showSubsectionRegenUI(sectionKey, subsectionName) {
        _subRegenTarget[sectionKey] = subsectionName;
        const panel = document.getElementById("subRegenPanel-" + sectionKey);
        const title = document.getElementById("subRegenTitle-" + sectionKey);
        if (panel) panel.style.display = "block";
        if (title) title.textContent = "⟳ " + subsectionName;

        // Показать зависимые подразделы
        const deps = getIntraDependents(sectionKey, subsectionName);
        const depsEl = document.getElementById("subIntraDeps-" + sectionKey);
        if (depsEl) {
          let html = "";
          if (deps.length > 0) {
            html += "⚡ Также будут предложены к перегенерации: " + deps.map(d => "«" + esc(d) + "»").join(", ");
          }

          // Межразделовые зависимости: какие подразделы других разделов затронуты
          const allChangedSubs = [subsectionName, ...deps];
          const crossDepsMap = new Map();
          const presentSections = new Set(DOC_STATE.sectionOrder || []);
          for (const sub of allChangedSubs) {
            for (const d of getCrossSecDependents(sectionKey, sub)) {
              if (!presentSections.has(d.section)) continue;
              const k = d.section + ":" + (d.subsection || "*");
              if (!crossDepsMap.has(k)) crossDepsMap.set(k, d);
            }
          }
          if (crossDepsMap.size > 0) {
            // Группируем по разделу, фильтруя подразделы по актуальной карте
            const subsMap = buildSubsectionMap(DOC_STATE.params || {});
            const grouped = {};
            for (const d of crossDepsMap.values()) {
              // Фильтр подразделов по актуальной карте секции
              if (d.subsection && subsMap[d.section] &&
                  !subsMap[d.section].includes(d.subsection)) continue;
              const secLabel = KEY_LABELS[d.section] || d.section;
              if (!grouped[secLabel]) grouped[secLabel] = [];
              // Капсула — единый раздел без гранулярных подразделов
              if (d.subsection && d.section !== "capsule") grouped[secLabel].push(d.subsection);
            }
            let crossHtml = '<div style="margin-top:6px">⚡ Затронуты в других разделах:</div>';
            crossHtml += '<div style="margin:4px 0 0 12px;line-height:1.6">';
            for (const [secLabel, subs] of Object.entries(grouped)) {
              if (subs.length === 0) {
                crossHtml += '<div>• <b>' + esc(secLabel) + '</b> (весь раздел)</div>';
              } else {
                crossHtml += '<div>• <b>' + esc(secLabel) + '</b>: ' +
                  subs.map(s => '«' + esc(s) + '»').join(', ') + '</div>';
              }
            }
            crossHtml += '</div>';
            html += crossHtml;
          }

          // Затронутые режимы
          const changedSubIds = allChangedSubs.map(s => sectionKey + ":" + s);
          const affModes = getAffectedModes([], changedSubIds);
          if (affModes.length > 0) {
            const modeNames = [...new Set(affModes.map(m => m.title))];
            html += '<div style="margin-top:6px">⚡ Затронутые режимы: ' +
              modeNames.map(n => '«' + esc(n) + '»').join(', ') + '</div>';
          }

          depsEl.innerHTML = html;
        }

        // Стоимость
        const costEst = estimateSubsectionCost(sectionKey, subsectionName);
        const costEl = document.getElementById("subRegenPanel-" + sectionKey);
        if (costEst && costEl) {
          const costDiv = costEl.querySelector(".sub-cost-estimate") || (() => {
            const d = document.createElement("div");
            d.className = "sub-cost-estimate";
            d.style.cssText = "font-family:var(--mono);font-size:9px;color:var(--gold);margin-top:4px";
            costEl.appendChild(d);
            return d;
          })();
          costDiv.textContent = "≈ $" + costEst.cost.toFixed(4) +
            " (~" + Math.round(costEst.inTokens / 1000) + "K вх. + ~" +
            Math.round(costEst.outTokens / 1000) + "K вых.)";
        }

        // Сбросить контекстное поле
        const note = document.getElementById("subRegenNote-" + sectionKey);
        if (note) note.value = "";
        toggleSubRegenInclude(sectionKey);
      }

      function hideSubsectionRegenUI(sectionKey) {
        const panel = document.getElementById("subRegenPanel-" + sectionKey);
        if (panel) panel.style.display = "none";
        delete _subRegenTarget[sectionKey];
      }

      function toggleSubRegenInclude(sectionKey) {
        const note = document.getElementById("subRegenNote-" + sectionKey);
        const wrap = document.getElementById("subRegenIncludeWrap-" + sectionKey);
        if (wrap) wrap.style.display = note?.value?.trim() ? "block" : "none";
      }

      async function executeSubsectionRegen(sectionKey) {
        const subsectionName = _subRegenTarget[sectionKey];
        if (!subsectionName) return;

        const note = document.getElementById("subRegenNote-" + sectionKey)?.value?.trim() || "";
        const includeContent = document.getElementById("subRegenInclude-" + sectionKey)?.checked || false;

        const progress = document.getElementById("subProgress-" + sectionKey);
        const progressText = document.getElementById("subProgressText-" + sectionKey);
        if (progress) progress.classList.add("active");
        if (progressText) progressText.textContent = "Перегенерация «" + subsectionName + "»...";

        hideSubsectionRegenUI(sectionKey);

        try {
          const affectedSubs = await regenerateSubsection(sectionKey, subsectionName, {
            userNote: note,
            includeCurrentContent: includeContent,
          });

          // Инкремент sub-версии
          const v = typeof DOC_STATE.docVersion === "object"
            ? DOC_STATE.docVersion
            : parseVersion(DOC_STATE.docVersion);
          v.sub += 1;
          DOC_STATE.docVersion = v;

          if (progressText) progressText.textContent = "✓ «" + subsectionName + "» обновлён";

          // Предложить каскад внутри раздела
          let doIntraCascade = false;
          if (affectedSubs.length > 0) {
            const intraCostEst = estimateCascadeWaveCost(
              affectedSubs.map(s => ({ section: sectionKey, subsection: s }))
            );
            doIntraCascade = confirm(
              "Подраздел «" + subsectionName + "» обновлён.\n\n" +
              "Зависимые подразделы: " + affectedSubs.join(", ") + "." +
              formatWaveCost(intraCostEst) + "\n\n" +
              "Перегенерировать их тоже?"
            );
            if (doIntraCascade) {
              for (const depSub of affectedSubs) {
                if (progressText) progressText.textContent = "Каскад: «" + depSub + "»...";
                await regenerateSubsection(sectionKey, depSub, {});
                // Каждый подраздел каскада — +1 к sub
                v.sub += 1;
              }

              if (progressText) progressText.textContent = "✓ Каскад завершён";
            }
          }

          // Межразделовый каскад на уровне подразделов
          // Собираем зависимости не только от исходного подраздела, но и от
          // всех подразделов, затронутых внутрираздельным каскадом.
          const allChangedSubs = [subsectionName];
          if (affectedSubs.length > 0 && doIntraCascade) {
            allChangedSubs.push(...affectedSubs);
          }
          const crossDepsMap = new Map(); // deduplicate by "section:subsection"
          for (const sub of allChangedSubs) {
            for (const d of getCrossSecDependents(sectionKey, sub)) {
              const key = d.section + ":" + (d.subsection || "*");
              if (!crossDepsMap.has(key)) crossDepsMap.set(key, d);
            }
          }
          const crossDeps = [...crossDepsMap.values()];
          if (crossDeps.length > 0) {
            // ── Фильтрация: оставляем только подразделы, существующие в DOM ──
            const filteredCrossDeps = crossDeps.filter(d => {
              // Если subsection не указан — это весь раздел, проверяем только наличие раздела
              if (!d.subsection) return DOC_STATE.sectionOrder.includes(d.section);
          
              // Проверяем, есть ли подраздел в DOM целевого раздела
              const idx = DOC_STATE.sectionDbIdx[d.section];
              if (idx == null) {
                // Раздел без DOM-контейнера (напр. capsule — живёт в шапке):
                // проверяем только наличие в sectionOrder
                return DOC_STATE.sectionOrder.includes(d.section);
              }
              const container = document.getElementById("db" + idx);
              if (!container) return false;
              return !!container.querySelector(`[data-section="${d.subsection}"]`);
            });
          
            if (filteredCrossDeps.length > 0) {
              // Группируем по разделу
              const grouped = {};
              for (const d of filteredCrossDeps) {
                if (!grouped[d.section]) grouped[d.section] = [];
                if (d.subsection && d.section !== "capsule") grouped[d.section].push(d.subsection);
              }
          
              const lines = [];
              for (const [sec, subs] of Object.entries(grouped)) {
                const secLabel = KEY_LABELS[sec] || sec;
                if (subs.length > 0) {
                  lines.push(secLabel + ": " + subs.join(", "));
                } else {
                  lines.push(secLabel + " (весь раздел)");
                }
              }
          
              const crossCostEst = estimateCascadeWaveCost(filteredCrossDeps);
              const doCrossCascade = confirm(
                "Подраздел «" + subsectionName + "» обновлён.\n\n" +
                "Затронуты подразделы других разделов:\n" +
                lines.join("\n") +
                formatWaveCost(crossCostEst) + "\n\n" +
                "Перегенерировать их?"
              );
          
              if (doCrossCascade) {
                for (const d of filteredCrossDeps) {
                  // Капсула живёт в шапке, а не в docBodies — всегда перегенерируем целиком
                  if (d.section === "capsule") {
                    if (progressText) progressText.textContent = "Каскад: Капсула концепции...";
                    await regenerateSection("capsule", DOC_STATE.params.secCtx["capsule"] || "");
                    v.sub += 1;
                  } else if (d.subsection) {
                    if (progressText) progressText.textContent = "Каскад: " + (KEY_LABELS[d.section] || d.section) + " → " + d.subsection + "...";
                    await regenerateSubsection(d.section, d.subsection, {});
                    v.sub += 1;
                  } else {
                    if (progressText) progressText.textContent = "Каскад: " + (KEY_LABELS[d.section] || d.section) + "...";
                    await regenerateSection(d.section, DOC_STATE.params.secCtx[d.section] || "");
                    v.base += 1;
                    v.sub = 0;
                  }
                }

                // ── Уведомление о дальнейших downstream-зависимостях ──
                // Собираем всё, что было перегенерировано во всех волнах
                const allRegenerated = new Set();
                allRegenerated.add(sectionKey + ":" + subsectionName);
                for (const s of allChangedSubs) allRegenerated.add(sectionKey + ":" + s);
                for (const d of filteredCrossDeps) {
                  allRegenerated.add(d.section + ":" + (d.subsection || "*"));
                }

                // Для каждого перегенерированного в cross-каскаде ищем ИХ downstream
                const furtherDepsMap = new Map();
                const presentSections = new Set(DOC_STATE.sectionOrder || []);
                const subsMap = buildSubsectionMap(DOC_STATE.params || {});
                for (const d of filteredCrossDeps) {
                  // Intra-зависимые в целевом разделе
                  if (d.subsection && d.section !== "capsule") {
                    for (const intra of getIntraDependents(d.section, d.subsection)) {
                      const k = d.section + ":" + intra;
                      if (!allRegenerated.has(k) && !furtherDepsMap.has(k)) {
                        furtherDepsMap.set(k, { section: d.section, subsection: intra });
                      }
                    }
                  }
                  // Cross-зависимые от целевого раздела
                  const subName = (d.section === "capsule") ? "Капсула" : d.subsection;
                  if (subName) {
                    for (const cd of getCrossSecDependents(d.section, subName)) {
                      if (!presentSections.has(cd.section)) continue;
                      if (cd.subsection && subsMap[cd.section] &&
                          !subsMap[cd.section].includes(cd.subsection)) continue;
                      const k = cd.section + ":" + (cd.subsection || "*");
                      if (!allRegenerated.has(k) && !furtherDepsMap.has(k)) {
                        furtherDepsMap.set(k, cd);
                      }
                    }
                  }
                }

                if (furtherDepsMap.size > 0) {
                  const furtherEntries = [...furtherDepsMap.values()];
                  // Группируем по разделам
                  const fGrouped = {};
                  for (const d of furtherEntries) {
                    const secLabel = KEY_LABELS[d.section] || d.section;
                    if (!fGrouped[secLabel]) fGrouped[secLabel] = [];
                    if (d.subsection && d.section !== "capsule") fGrouped[secLabel].push(d.subsection);
                  }
                  const fLines = [];
                  for (const [secLabel, subs] of Object.entries(fGrouped)) {
                    fLines.push(subs.length > 0
                      ? "• " + secLabel + ": " + subs.join(", ")
                      : "• " + secLabel);
                  }
                  const furtherCostEst = estimateCascadeWaveCost(furtherEntries);
                  const doFurtherCascade = confirm(
                    "Каскад завершён.\n\n" +
                    "Перегенерированные разделы затрагивают " +
                    "дополнительные зависимости:\n\n" +
                    fLines.join("\n") +
                    formatWaveCost(furtherCostEst) + "\n\n" +
                    "Перегенерировать их тоже?"
                  );

                  if (doFurtherCascade) {
                    for (const d of furtherEntries) {
                      if (d.section === "capsule") {
                        if (progressText) progressText.textContent = "Каскад (3): Капсула концепции...";
                        await regenerateSection("capsule", DOC_STATE.params.secCtx["capsule"] || "");
                        v.sub += 1;
                      } else if (d.subsection) {
                        if (progressText) progressText.textContent = "Каскад (3): " + (KEY_LABELS[d.section] || d.section) + " → " + d.subsection + "...";
                        await regenerateSubsection(d.section, d.subsection, {});
                        v.sub += 1;
                      } else {
                        if (progressText) progressText.textContent = "Каскад (3): " + (KEY_LABELS[d.section] || d.section) + "...";
                        await regenerateSection(d.section, DOC_STATE.params.secCtx[d.section] || "");
                        v.base += 1;
                        v.sub = 0;
                      }
                    }
                    if (progressText) progressText.textContent = "✓ Каскад (3) завершён";
                  }
                }
              }
            }
          }

          // Каскад режимов
          const affectedModes = getAffectedModes(
            [],  // разделы не менялись целиком
            allChangedSubs.map(s => sectionKey + ":" + s)  // все изменённые подразделы
          );
          if (affectedModes.length > 0) {
            const modeNames = affectedModes.map(a => a.title).join(", ");
            let modeCostTotal = 0;
            for (const am of affectedModes) {
              const mc = estimateModeCost(am.modeKey);
              if (mc) modeCostTotal += mc.cost;
            }
            const modeCostStr = modeCostTotal > 0
              ? "\nОценка стоимости: ≈ $" + modeCostTotal.toFixed(4) +
                " (" + (modeCostTotal * 100).toFixed(2) + "¢), " + affectedModes.length + " запр."
              : "";
            const doModeRegen = confirm(
              "Подраздел «" + subsectionName + "» обновлён.\n\n" +
              "Затронутые режимы: " + modeNames + "." +
              modeCostStr + "\n\n" +
              "Перегенерировать их?"
            );
            if (doModeRegen) {
              for (const am of affectedModes) {
                const modeData = DOC_STATE.modes[am.modeKey];
                if (!modeData) continue;
                if (progressText) progressText.textContent = "Каскад: " + am.title + "...";
                _currentMode = am.modeKey;
                await runMode(); // перегенерирует с текущим paramValue из модалки — нужен fallback
              }
            }
          }

          // Обновляем каскадную панель Edit Modal
          // (подразделовая перегенерация может затронуть межразделовые зависимости)
          recalcEditPlan();

        } catch (err) {
          if (progressText) progressText.textContent = "⚠ " + err.message;
        } finally {
          setTimeout(() => {
            if (progress) progress.classList.remove("active");
          }, 3000);
        }
      }

      /** Пересчитывает план на основе текущих галочек */
      function recalcEditPlan() {
        const plan = { regen: [], remove: [], add: [] };
        const order = DOC_STATE.sectionOrder.filter(k => k !== "sum");

        for (const key of order) {
          if (document.getElementById("editRegen-" + key)?.checked) plan.regen.push(key);
          if (document.getElementById("editDelete-" + key)?.checked) plan.remove.push(key);
        }
        const available = typeof getAvailableSectionsToAdd === "function"
          ? getAvailableSectionsToAdd() : [];
        for (const key of available) {
          if (document.getElementById("editAdd-" + key)?.checked) plan.add.push(key);
        }

        // ── Режимы ──
        plan.modeRegen = [];
        plan.modeRemove = [];
        for (const [modeKey, results] of Object.entries(DOC_STATE.modes || {})) {
          if (!Array.isArray(results)) continue;
          for (let i = 0; i < results.length; i++) {
            if (document.getElementById(`editRegenMode-${modeKey}-${i}`)?.checked)
              plan.modeRegen.push([modeKey, i]);
            if (document.getElementById(`editDeleteMode-${modeKey}-${i}`)?.checked)
              plan.modeRemove.push([modeKey, i]);
          }
        }

        _editPlan = plan;
        updateEditPlanUI();
      }

      /** Обновляет каскадную панель, стоимость, кнопку ▶ */
      function updateEditPlanUI() {
        const plan = _editPlan;
        const totalActions = plan.regen.length + plan.remove.length + plan.add.length
           + (plan.modeRegen?.length || 0)
           + (plan.modeRemove?.length || 0);
        const runBtn = document.getElementById("editRunBtn");
        if (runBtn) runBtn.disabled = totalActions === 0 || DOC_STATE.incomplete;

        // ── Информация ──
        const infoEl = document.getElementById("editFooterInfo");
        if (infoEl) {
          const parts = [];
          if (plan.regen.length) parts.push(plan.regen.length + " перегенер.");
          if (plan.remove.length) parts.push(plan.remove.length + " удал.");
          if (plan.add.length) parts.push(plan.add.length + " добавл.");
          if (plan.modeRegen?.length) parts.push(plan.modeRegen.length + " реж.");
          infoEl.textContent = parts.length ? parts.join(" · ") : "Выберите действия";
        }

        // ── Стоимость ──
        const costEl = document.getElementById("editCostEstimate");
        if (costEl) {
          let est = null;
          if (plan.regen.length + plan.add.length > 0) {
              est = estimateCost({ sections: [...plan.regen, ...plan.add] });
            costEl.textContent = est
              ? `≈ $${est.cost.toFixed(4)} (${(est.cost * 100).toFixed(2)}¢) · ${est.passes} запр.`
              : "";
          } else {
            costEl.textContent = plan.remove.length > 0 ? "Удаление бесплатно" : "";
          }

          // ── Стоимость отмеченных режимов ──
          let modeCost = 0;
          const modeCount = plan.modeRegen?.length || 0;
          for (const modeKey of (plan.modeRegen || [])) {
            const mc = estimateModeCost(modeKey);
            if (mc) modeCost += mc.cost;
          }

          if (modeCost > 0 && est) {
            const totalCost = est.cost + modeCost;
            costEl.textContent = `≈ $${totalCost.toFixed(4)} (${(totalCost * 100).toFixed(2)}¢) · ` +
              `${est.passes} разд. + ${modeCount} реж.`;
          } else if (modeCost > 0) {
            costEl.textContent = `≈ $${modeCost.toFixed(4)} (${(modeCost * 100).toFixed(2)}¢) · ${modeCount} режим(ов)`;
          }
        }

        // ── Каскад: какие разделы будут затронуты, но НЕ включены в план ──
        updateLiveCascade(plan);
      }

      /** Каскадная панель: live-обновление при изменении галочек */
      function updateLiveCascade(plan) {
        const panel = document.getElementById("cascadePanel");
        const titleEl = document.getElementById("cascadeTitle");
        const descEl = document.getElementById("cascadeDesc");
        const listEl = document.getElementById("cascadeList");
        if (!panel || !listEl) return;

        const activeSet = new Set([...plan.regen, ...plan.add]);
        const removeSet = new Set(plan.remove);

        // ══════════════════════════════════════════════════════════
        // A. Будущее состояние документа
        // ══════════════════════════════════════════════════════════

        const futureSections = [
          ...DOC_STATE.sectionOrder.filter(k => k !== "sum" && !removeSet.has(k)),
          ...plan.add,
        ];

        let futureResolved = null;
        let futureEffDeps  = null;

        if (futureSections.length > 0) {
          futureResolved = resolveContextDeps({ ...DOC_STATE.params, sec: futureSections });
          futureEffDeps  = buildEffectiveDeps(futureSections, futureResolved, DOC_STATE.params?.generationOrder);
        }

        // ══════════════════════════════════════════════════════════
        // B. DOWNSTREAM: существующие разделы, затронутые планом
        // ══════════════════════════════════════════════════════════

        const dependents = computeDependents(DOC_STATE.effectiveDeps);
        const factDeps = DOC_STATE.factualDeps || {};
        const factReverse = typeof computeFactualDependents === "function"
          ? computeFactualDependents(factDeps) : {};

        const affected = new Set();

        for (const key of plan.regen) {
          for (const dep of (dependents[key] || new Set())) {
            if (dep !== "sum") affected.add(dep);
          }
        }
        for (const key of plan.remove) {
          for (const dep of (dependents[key] || new Set())) {
            if (dep !== "sum") affected.add(dep);
          }
        }

        // Downstream-бенефициары добавлений
        if (plan.add.length > 0 && futureEffDeps) {
          const futureDependents = computeDependents(futureEffDeps);
          for (const key of plan.add) {
            for (const dep of (futureDependents[key] || new Set())) {
              if (dep !== "sum") affected.add(dep);
            }
          }
        }

        // Чистим affected
        for (const key of activeSet) affected.delete(key);
        for (const key of removeSet) affected.delete(key);

        const remainingAfterRemove = new Set(
          DOC_STATE.sectionOrder.filter(k => !removeSet.has(k))
        );
        for (const key of affected) {
          if (!remainingAfterRemove.has(key)) affected.delete(key);
        }

        // ══════════════════════════════════════════════════════════
        // C. UPSTREAM: анализ зависимостей добавляемых разделов
        // ══════════════════════════════════════════════════════════

        const missingHard     = [];   // { consumer, label, sources: [{ ctxKey, src, label }] }
        const activeSubs      = [];   // { consumer, consumerLabel, ctxLabel, replacedLabel, quality }
        const addableBenefits = {};   // srcKey → { label, consumers: string[] }

        if (plan.add.length > 0 && futureResolved && futureEffDeps) {
          const futureSet = new Set(["sum", ...futureSections]);

          for (const addKey of plan.add) {
            const origDeps = futureResolved[addKey];
            const effDeps  = futureEffDeps[addKey];
            if (!origDeps) continue;

            const consumerLabel = KEY_LABELS[addKey] || addKey;
            const origAll = new Set([
              ...(origDeps.required || []),
              ...(origDeps.optional || []),
            ]);
            const effAll = new Set([
              ...(effDeps?.required || []),
              ...(effDeps?.optional || []),
            ]);

            // ── C1. Жёсткие потери ──
            const hardMissing = [];
            for (const ctxKey of origDeps.required) {
              const src = sourceOf(ctxKey);
              if (src === "sum" || futureSet.has(src)) continue;
              const hasSubstitute = [...effAll].some(k =>
                !origAll.has(k) && sourceOf(k) !== src && sourceOf(k) !== addKey
              );
              if (!hasSubstitute) {
                hardMissing.push({ ctxKey, src, label: CTX_LABELS[ctxKey] || ctxKey });
              }
            }
            if (hardMissing.length > 0) {
              missingHard.push({ consumer: addKey, label: consumerLabel, sources: hardMissing });
            }

            // ── C2. Активные подстановки ──
            if (effDeps) {
              const addSet = new Set(plan.add);
              for (const ctxKey of [...(effDeps.required || []), ...(effDeps.optional || [])]) {
                if (origAll.has(ctxKey)) continue;
                const q = getSubstituteQuality(ctxKey);
                if (q == null) continue;

                let replacedKey = null;
                for (const [origK, candidates] of Object.entries(getActiveSubstitutionMap())) {
                  if (candidates.some(c => c.key === ctxKey)) { replacedKey = origK; break; }
                }

                // Если источник заменяемого контекста тоже добавляется в этом же плане —
                // подстановка не нужна: оригинал будет доступен после генерации
                if (replacedKey) {
                  const replacedSrc = sourceOf(replacedKey);
                  if (addSet.has(replacedSrc) || futureSet.has(replacedSrc)) continue;
                }

                activeSubs.push({
                  consumer: addKey,
                  consumerLabel,
                  ctxKey,
                  ctxLabel: CTX_LABELS[ctxKey] || ctxKey,
                  replacedKey,
                  replacedLabel: replacedKey ? (CTX_LABELS[replacedKey] || replacedKey) : "?",
                  quality: q,
                });
              }
            }

            // ── C3. Рекомендации по optional-зависимостям ──
            for (const ctxKey of (origDeps.optional || [])) {
              const src = sourceOf(ctxKey);
              if (src === "sum" || futureSet.has(src)) continue;
              if (!addableBenefits[src]) {
                addableBenefits[src] = { label: KEY_LABELS[src] || src, consumers: [] };
              }
              if (!addableBenefits[src].consumers.includes(consumerLabel)) {
                addableBenefits[src].consumers.push(consumerLabel);
              }
            }
          }
        }

        const hasUpstream = missingHard.length > 0
                         || activeSubs.length > 0
                         || Object.keys(addableBenefits).length > 0;

        // ══════════════════════════════════════════════════════════
        // D. ВИДИМОСТЬ
        // ══════════════════════════════════════════════════════════

        if (affected.size === 0 && !hasUpstream) {
          panel.classList.remove("visible");
          return;
        }

        // ══════════════════════════════════════════════════════════
        // E. РЕНДЕРИНГ
        // ══════════════════════════════════════════════════════════

        listEl.innerHTML = "";
        const descParts = [];

        // ── E1. Downstream: затронутые, но не включённые в план ──
        if (affected.size > 0) {
          descParts.push(
            "Следующие разделы будут затронуты выбранными действиями, " +
            "но не включены в план. Рекомендуется отметить их для перегенерации."
          );

          const sorted = sortInTopoOrder([...affected]);
          for (const depKey of sorted) {
            const depLabel = KEY_LABELS[depKey] || depKey;
            const def = DOC_STATE.sectionDefs[depKey];
            const num = def ? def.num : "?";

            let weightHint = "";
            for (const srcKey of [...plan.regen, ...plan.remove]) {
              const fi = factReverse[srcKey];
              if (fi) {
                const consumer = fi.consumers.find(c => c.key === depKey);
                if (consumer && consumer.chars > 0) {
                  weightHint += ` <span style="font-size:9px;color:var(--gold)">${consumer.chars.toLocaleString("ru")} симв. от ${KEY_LABELS[srcKey] || srcKey}</span>`;
                }
              }
            }

            const regenCb = document.getElementById("editRegen-" + depKey);
            const isCovered = regenCb?.checked;

            const item = document.createElement("div");
            item.className = "cascade-item-info " + (isCovered ? "covered" : "exposed");
            item.innerHTML = `<span>${isCovered ? "✓" : "⚡"} § ${num} — ${esc(depLabel)}${weightHint}</span>`;
            if (!isCovered) {
              const markBtn = document.createElement("button");
              markBtn.style.cssText =
                "font-family:var(--mono);font-size:9px;border:1px solid var(--gold);" +
                "background:transparent;color:var(--gold);padding:2px 8px;cursor:pointer;margin-left:auto";
              markBtn.textContent = "отметить ↑";
              markBtn.onclick = () => {
                if (regenCb) { regenCb.checked = true; onEditCheckChange(depKey, "regen"); }
              };
              item.appendChild(markBtn);
            }
            listEl.appendChild(item);
          }
        }

        // ── E2. Upstream: жёсткие потери зависимостей ──
        if (missingHard.length > 0) {
          descParts.push(
            "Обязательные зависимости отсутствуют — качество добавляемых разделов будет снижено."
          );

          for (const m of missingHard) {
            const srcNames = m.sources.map(s => "«" + esc(s.label) + "»").join(", ");

            const item = document.createElement("div");
            item.className = "sec-warning-item";
            item.style.borderColor = "var(--red)";
            item.style.background = "#fff0f0";
            item.style.color = "var(--red)";
            item.innerHTML =
              `<span class="warn-icon">⚠</span>` +
              `<span>«${esc(m.label)}»: отсутствует обязательный контекст ${srcNames}.</span>`;

            const seenSrc = new Set();
            for (const s of m.sources) {
              if (seenSrc.has(s.src)) continue;
              seenSrc.add(s.src);
              const addCb = document.getElementById("editAdd-" + s.src);
              if (addCb && !addCb.checked) {
                const addBtn = document.createElement("button");
                addBtn.style.cssText =
                  "font-family:var(--mono);font-size:9px;border:1px solid var(--red);" +
                  "background:transparent;color:var(--red);padding:2px 6px;cursor:pointer;" +
                  "margin-left:4px;flex-shrink:0";
                addBtn.textContent = "+ " + (KEY_LABELS[s.src] || s.src);
                addBtn.onclick = () => {
                  addCb.checked = true;
                  onEditCheckChange(s.src, "add");
                };
                item.appendChild(addBtn);
              }
            }
            listEl.appendChild(item);
          }
        }

        // ── E3. Upstream: активные подстановки контекста ──
        if (activeSubs.length > 0) {
          if (missingHard.length === 0) {
            descParts.push("Недостающий контекст заменён подстановками.");
          }

          for (const s of activeSubs) {
            const qLabel = s.quality === 3 ? "равноценная замена"
                         : s.quality === 2 ? "частичная замена"
                         :                   "слабая замена";

            const item = document.createElement("div");
            item.className = "sec-substituted-item";
            item.innerHTML =
              `<span class="rec-icon">⇄</span>` +
              `<span>«${esc(s.consumerLabel)}»: ` +
              `контекст «${esc(s.ctxLabel)}» используется как ${qLabel} ` +
              `для «${esc(s.replacedLabel)}».</span>`;
            listEl.appendChild(item);
          }
        }

        // ── E4. Upstream: рекомендации по добавлению ──
        if (Object.keys(addableBenefits).length > 0) {
          for (const [srcKey, info] of Object.entries(addableBenefits)) {
            const consumerList = info.consumers.map(c => "«" + esc(c) + "»").join(", ");
            const word = info.consumers.length === 1 ? "раздела" : "разделов";

            const item = document.createElement("div");
            item.className = "sec-recommend-item";
            item.innerHTML =
              `<span class="rec-icon">💡</span>` +
              `<span>Включение «${esc(info.label)}» может улучшить качество ` +
              `${word} ${consumerList} (дополнительный контекст).</span>`;

            const addCb = document.getElementById("editAdd-" + srcKey);
            if (addCb && !addCb.checked) {
              const addBtn = document.createElement("button");
              addBtn.style.cssText =
                "font-family:var(--mono);font-size:9px;border:1px solid var(--blue-corp);" +
                "background:transparent;color:var(--blue-corp);padding:2px 8px;cursor:pointer;" +
                "margin-left:auto;flex-shrink:0";
              addBtn.textContent = "добавить ↓";
              addBtn.onclick = () => {
                addCb.checked = true;
                onEditCheckChange(srcKey, "add");
              };
              item.appendChild(addBtn);
            }
            listEl.appendChild(item);
          }
        }

        // ── Заголовок и описание ──
        if (titleEl) {
          titleEl.textContent = hasUpstream && affected.size === 0
            ? "Зависимости добавляемых разделов"
            : affected.size > 0 && !hasUpstream
              ? "Каскад зависимостей"
              : "Каскад и зависимости";
        }
        if (descEl) descEl.textContent = descParts.join(" ");

        // ── E5. Затронутые режимы ──
        const changedSections = [...plan.regen, ...plan.remove, ...plan.add];
        const affectedModes = getAffectedModes(changedSections);

        if (affectedModes.length > 0) {
          descParts.push("Сгенерированные режимы затронуты выбранными действиями.");

          for (const am of affectedModes) {
            const item = document.createElement("div");
            item.style.cssText =
              "display:flex;align-items:center;gap:8px;font-family:var(--mono);" +
              "font-size:10px;color:var(--violet);padding:5px 10px;" +
              "background:var(--violet-light);border:1px solid rgba(107,0,170,0.25)";
            item.innerHTML =
              `<span>◈ ${esc(am.title)}: ${esc(am.reason)}</span>`;

            // Кнопка «отметить» для перегенерации режима
            const regenCb = document.getElementById(`editRegenMode-${am.modeKey}-${am.index}`);
            if (regenCb && !regenCb.checked) {
              const markBtn = document.createElement("button");
              markBtn.style.cssText =
                "font-family:var(--mono);font-size:9px;border:1px solid var(--violet);" +
                "background:transparent;color:var(--violet);padding:2px 8px;cursor:pointer;margin-left:auto";
              markBtn.textContent = "отметить ↑";
              markBtn.onclick = () => {
                regenCb.checked = true;
                recalcEditPlan();
              };
              item.appendChild(markBtn);
            } else if (regenCb?.checked) {
              item.innerHTML += '<span style="margin-left:auto;font-size:9px;opacity:0.6">✓ отмечен</span>';
            }

            listEl.appendChild(item);
          }
        }

        panel.classList.add("visible");
        panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }

// ───── [openEditModal] philosynth.html строки 18341–18361 ─────
      function openEditModal() {
        if (!DOC_STATE.ready) {
          alert("Документ ещё не сгенерирован.");
          return;
        }
        if (!API_KEY) {
          alert("API-ключ не задан.");
          return;
        }
        if (DOC_STATE.incomplete) {
          let msg = "Редактирование ограничено: при импорте не удалось извлечь список философов.\n\n";
          for (const w of (DOC_STATE.importWarnings || [])) {
            if (w.critical) msg += "⚠ " + w.message + "\n";
          }
          msg += "\nЗаполните поле «Философы» в форме ввода.\nОткрыть для просмотра?";
          if (!confirm(msg)) return;
        }
        renderEditSections();
        document.getElementById("editOverlay").classList.add("visible");
        document.body.style.overflow = "hidden";
      }

// ───── [regenerateSubsection] philosynth.html строки 20236–20236 ─────
      async function regenerateSubsection(sectionKey, subsectionName, opts = {}) {
