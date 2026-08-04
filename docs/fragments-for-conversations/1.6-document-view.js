// Фрагмент philosynth.html (26025 строк) — собран
// scripts/extract-by-name.py по спецификации 1.6-document-view.spec.
//
// Номера строк ниже — РЕЗУЛЬТАТ поиска по именам, а не входные
// данные: при правке исходника достаточно перезапустить сборку,
// спецификация не устаревает. Имена берутся из
// docs/04-code-reuse-map.md.

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 482–488 ─────
      .doc-header {
        background: var(--blue-corp);
        color: #fff;
        padding: 36px 48px 32px;
        position: relative;
        overflow: hidden;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 489–497 ─────
      .doc-header::before {
        content: "";
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 300px;
        background: linear-gradient(135deg, transparent 40%, rgba(255, 255, 255, 0.04) 100%);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 498–505 ─────
      .doc-type {
        font-family: var(--mono);
        font-size: 9px;
        letter-spacing: 3px;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.5);
        margin-bottom: 10px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 506–512 ─────
      .doc-title {
        font-family: var(--serif);
        font-size: 30px;
        font-weight: 700;
        line-height: 1.2;
        margin-bottom: 8px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 513–518 ─────
      .doc-subtitle {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.65);
        font-style: italic;
        margin-bottom: 24px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 519–526 ─────
      .doc-meta-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 1px;
        background: rgba(255, 255, 255, 0.1);
        border-top: 1px solid rgba(255, 255, 255, 0.15);
        padding-top: 20px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 527–529 ─────
      .doc-meta-item {
        padding: 0 20px 0 0;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 530–538 ─────
      .doc-meta-key {
        font-family: var(--mono);
        font-size: 8px;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.4);
        display: block;
        margin-bottom: 3px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 539–544 ─────
      .doc-meta-val {
        font-family: var(--mono);
        font-size: 12px;
        color: rgba(255, 255, 255, 0.9);
        display: block;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 545–547 ─────
      .doc-meta-val.gold {
        color: var(--gold-light);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 548–553 ─────
      .doc-body {
        background: var(--paper);
        border: 1px solid var(--rule);
        border-top: none;
        padding: 0;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 625–628 ─────
      .doc-section {
        border-bottom: 1px solid var(--rule);
        padding: 32px 48px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 629–631 ─────
      .doc-section:last-child {
        border-bottom: none;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 649–653 ─────
      .doc-content {
        font-size: 13px;
        line-height: 1.85;
        color: var(--ink-mid);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 654–662 ─────
      .doc-content h4 {
        font-family: var(--mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: var(--ink);
        margin: 20px 0 8px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 663–671 ─────
      .doc-content h5 {
        font-family: var(--mono);
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: var(--ink-mid);
        margin: 16px 0 6px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 672–674 ─────
      .doc-content div[data-section] {
        margin: 16px 0;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 675–677 ─────
      .doc-content p {
        margin-bottom: 12px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 679–684 ─────
      .doc-content ol {
        margin: 8px 0 14px 20px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 685–687 ─────
      .doc-content li {
        line-height: 1.7;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 688–691 ─────
      .doc-content strong {
        color: var(--ink);
        font-weight: 600;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 692–696 ─────
      .doc-content em {
        color: var(--red);
        font-style: normal;
        font-weight: 500;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 697–702 ─────
      .doc-table {
        width: 100%;
        border-collapse: collapse;
        margin: 14px 0;
        font-size: 12px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 703–713 ─────
      .doc-table th {
        background: var(--blue-corp);
        color: #fff;
        font-family: var(--mono);
        font-size: 9px;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        padding: 9px 14px;
        text-align: left;
        font-weight: 500;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 714–720 ─────
      .doc-table td {
        padding: 9px 14px;
        border-bottom: 1px solid var(--rule);
        vertical-align: top;
        color: var(--ink-mid);
        line-height: 1.6;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 721–723 ─────
      .doc-table tr:nth-child(even) td {
        background: var(--off);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 724–726 ─────
      .doc-table tr:hover td {
        background: var(--blue-light);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 855–862 ─────
      .doc-footer {
        background: var(--off);
        border-top: 1px solid var(--rule);
        padding: 16px 48px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 863–869 ─────
      .doc-footer-left {
        font-family: var(--mono);
        font-size: 9px;
        color: var(--ink-dim);
        letter-spacing: 1px;
        line-height: 1.8;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.doc-
// philosynth.html строки 870–876 ─────
      .doc-footer-right {
        font-family: var(--mono);
        font-size: 9px;
        color: var(--ink-dim);
        text-align: right;
        line-height: 1.8;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:#docTOC
// philosynth.html строки 556–559 ─────
      #docTOC {
        border-bottom: 2px solid var(--gold) !important;
        border-top: none;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:#docTOC
// philosynth.html строки 560–576 ─────
      #docTOC summary {
        padding: 10px 48px;
        cursor: pointer;
        font-family: var(--mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: var(--gold);
        list-style: none;
        user-select: none;
        display: flex;
        align-items: center;
        gap: 6px;
        background: var(--paper);
        border-bottom: 1px solid var(--rule);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:#docTOC
// philosynth.html строки 577–577 ─────
      #docTOC summary::-webkit-details-marker { display: none; }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:#docTOC
// philosynth.html строки 578–582 ─────
      #docTOC .toc-arrow {
        font-size: 7px;
        transition: transform 0.2s;
        display: inline-block;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:#docTOC
// philosynth.html строки 583–585 ─────
      #docTOC[open] .toc-arrow {
        transform: rotate(90deg);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:#docTOC
// philosynth.html строки 607–609 ─────
      #docTOC a:hover {
        text-decoration: underline;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.toc-
// philosynth.html строки 578–582 ─────
      #docTOC .toc-arrow {
        font-size: 7px;
        transition: transform 0.2s;
        display: inline-block;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.toc-
// philosynth.html строки 583–585 ─────
      #docTOC[open] .toc-arrow {
        transform: rotate(90deg);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.toc-
// philosynth.html строки 586–589 ─────
      .toc-body {
        padding: 20px 48px;
        background: var(--paper);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.toc-
// philosynth.html строки 590–592 ─────
      .toc-section-link {
        margin: 4px 0;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.toc-
// philosynth.html строки 593–597 ─────
      .toc-section-link a {
        color: var(--blue-corp);
        text-decoration: none;
        font-weight: 500;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.toc-
// philosynth.html строки 598–602 ─────
      .toc-sub-link {
        margin: 2px 0;
        padding-left: 24px;
        font-size: 12px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.toc-
// philosynth.html строки 603–606 ─────
      .toc-sub-link a {
        color: var(--ink-dim);
        text-decoration: none;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.toc-
// philosynth.html строки 610–619 ─────
      .toc-back-btn {
        display: inline-block;
        font-size: 10px;
        color: var(--ink-dim);
        text-decoration: none;
        margin-left: 8px;
        opacity: 0.4;
        transition: opacity 0.15s;
        vertical-align: middle;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.toc-
// philosynth.html строки 620–623 ─────
      .toc-back-btn:hover {
        opacity: 1;
        color: var(--blue-corp);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.section-
// philosynth.html строки 632–639 ─────
      .section-num {
        font-family: var(--mono);
        font-size: 9px;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: var(--ink-dim);
        margin-bottom: 4px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.section-
// philosynth.html строки 640–648 ─────
      .section-title {
        font-family: var(--serif);
        font-size: 20px;
        font-weight: 700;
        color: var(--blue-corp);
        margin-bottom: 20px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--rule);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.callout
// philosynth.html строки 727–733 ─────
      .callout {
        border-left: 3px solid;
        padding: 12px 16px;
        margin: 16px 0;
        font-size: 12px;
        line-height: 1.7;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.callout
// philosynth.html строки 734–738 ─────
      .callout.warning {
        border-color: var(--red);
        background: #fff5f5;
        color: var(--red);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.callout
// philosynth.html строки 739–743 ─────
      .callout.note {
        border-color: var(--blue-corp);
        background: var(--blue-light);
        color: var(--blue-corp);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.callout
// philosynth.html строки 744–748 ─────
      .callout.gold {
        border-color: var(--gold);
        background: #fffbee;
        color: var(--gold);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.callout
// philosynth.html строки 749–757 ─────
      .callout-label {
        font-family: var(--mono);
        font-size: 9px;
        font-weight: 600;
        letter-spacing: 2px;
        text-transform: uppercase;
        display: block;
        margin-bottom: 5px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.risk
// philosynth.html строки 790–798 ─────
      .risk {
        display: inline-block;
        padding: 1px 8px;
        font-family: var(--mono);
        font-size: 9px;
        font-weight: 600;
        letter-spacing: 1px;
        text-transform: uppercase;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.risk
// philosynth.html строки 799–803 ─────
      .risk.high {
        background: #fff0f0;
        color: var(--red);
        border: 1px solid var(--red);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.risk
// philosynth.html строки 804–808 ─────
      .risk.medium {
        background: #fffbee;
        color: var(--gold);
        border: 1px solid var(--gold);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.risk
// philosynth.html строки 809–813 ─────
      .risk.low {
        background: #f0fff4;
        color: var(--green-check);
        border: 1px solid var(--green-check);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.validity-stamp
// philosynth.html строки 877–886 ─────
      .validity-stamp {
        font-family: var(--serif);
        font-size: 12px;
        font-weight: 700;
        color: var(--green-check);
        border: 1px solid var(--green-check);
        padding: 4px 14px;
        transform: rotate(-2deg);
        display: inline-block;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.stream-cursor
// philosynth.html строки 837–845 ─────
      .stream-cursor {
        display: inline-block;
        width: 2px;
        height: 14px;
        background: var(--blue-corp);
        vertical-align: middle;
        margin-left: 2px;
        animation: blink-cursor 0.7s infinite;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.actions-bar
// philosynth.html строки 887–893 ─────
      .actions-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 0;
        margin-bottom: 8px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.actions-bar
// philosynth.html строки 894–898 ─────
      .actions-bar-btns {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.action-btn
// philosynth.html строки 899–911 ─────
      .action-btn {
        font-family: var(--mono);
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        background: transparent;
        border: 1px solid var(--rule-strong);
        padding: 8px 18px;
        cursor: pointer;
        color: var(--ink-mid);
        transition: all 0.15s;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.action-btn
// philosynth.html строки 912–915 ─────
      .action-btn:hover {
        border-color: var(--blue-corp);
        color: var(--blue-corp);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.action-btn
// philosynth.html строки 916–920 ─────
      .action-btn.primary {
        background: var(--blue-corp);
        color: #fff;
        border-color: var(--blue-corp);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.action-btn
// philosynth.html строки 921–923 ─────
      .action-btn.primary:hover {
        background: var(--blue-mid);
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.action-btn
// philosynth.html строки 924–929 ─────
      .action-btn.gold-btn {
        background: var(--gold);
        color: var(--ink);
        border-color: var(--gold);
        font-weight: 600;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.sig-
// philosynth.html строки 758–763 ─────
      .sig-block {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 40px;
        margin-top: 24px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.sig-
// philosynth.html строки 764–770 ─────
      .sig-party-name {
        font-family: var(--serif);
        font-size: 15px;
        font-weight: 700;
        color: var(--blue-corp);
        margin-bottom: 3px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.sig-
// philosynth.html строки 771–778 ─────
      .sig-party-role {
        font-family: var(--mono);
        font-size: 9px;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: var(--ink-dim);
        margin-bottom: 20px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.sig-
// philosynth.html строки 779–783 ─────
      .sig-line {
        border-bottom: 1px solid var(--ink);
        height: 40px;
        margin-bottom: 4px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.sig-
// philosynth.html строки 784–789 ─────
      .sig-label {
        font-family: var(--mono);
        font-size: 9px;
        color: var(--ink-dim);
        letter-spacing: 1px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.graph-node
// philosynth.html строки 815–825 ─────
      .graph-node {
        display: inline-block;
        padding: 3px 10px;
        font-family: var(--mono);
        font-size: 11px;
        font-weight: 500;
        border: 1px solid var(--blue-corp);
        background: var(--blue-light);
        color: var(--blue-corp);
        margin: 2px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css*:.graph-edge
// philosynth.html строки 826–835 ─────
      .graph-edge {
        display: inline-block;
        padding: 2px 8px;
        font-family: var(--mono);
        font-size: 10px;
        border: 1px solid var(--gold);
        background: #fffbee;
        color: var(--gold);
        margin: 2px;
      }

// ───── CSS документа (область: от .output-wrap до баннера граф-модалки) · css:.doc-title-edit-btn
// philosynth.html строки 3304–3315 ─────
      .doc-title-edit-btn {
        background: none;
        border: 1px solid transparent;
        cursor: pointer;
        color: var(--gold);
        font-size: 14px;
        padding: 2px 6px;
        margin-left: 8px;
        opacity: 0.5;
        vertical-align: middle;
        transition: opacity 0.2s;
      }

// ───── Disclosure-CSS шапки и разделов · css*:.header-disclosure
// philosynth.html строки 2114–2117 ─────
      .header-disclosure {
        border: 1px solid rgba(255, 255, 255, 0.2);
        margin-bottom: 0;
      }

// ───── Disclosure-CSS шапки и разделов · css*:.header-disclosure
// philosynth.html строки 2118–2132 ─────
      .header-disclosure summary {
        padding: 6px 14px;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.55);
        font-family: var(--mono);
        font-size: 9px;
        letter-spacing: 2px;
        text-transform: uppercase;
        background: rgba(255, 255, 255, 0.06);
        list-style: none;
        display: flex;
        align-items: center;
        gap: 6px;
        user-select: none;
      }

// ───── Disclosure-CSS шапки и разделов · css*:.header-disclosure
// philosynth.html строки 2133–2133 ─────
      .header-disclosure summary::-webkit-details-marker { display: none; }

// ───── Disclosure-CSS шапки и разделов · css*:.header-disclosure
// philosynth.html строки 2134–2139 ─────
      .header-disclosure summary::before {
        content: "▶";
        font-size: 7px;
        transition: transform 0.2s;
        display: inline-block;
      }

// ───── Disclosure-CSS шапки и разделов · css*:.header-disclosure
// philosynth.html строки 2140–2140 ─────
      .header-disclosure[open] summary::before { transform: rotate(90deg); }

// ───── Disclosure-CSS шапки и разделов · css*:.header-disclosure
// philosynth.html строки 2141–2150 ─────
      .header-disclosure .disclosure-body {
        padding: 10px 14px;
        font-size: 12px;
        line-height: 1.7;
        color: rgba(255, 255, 255, 0.75);
        font-family: var(--sans);
        white-space: pre-wrap;
        background: rgba(0, 0, 0, 0.12);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

// ───── Disclosure-CSS шапки и разделов · css*:.header-disclosure
// philosynth.html строки 2153–2156 ─────
      .header-disclosure-capsule {
        border: 1px solid var(--gold);
        margin-bottom: 0;
      }

// ───── Disclosure-CSS шапки и разделов · css*:.header-disclosure
// philosynth.html строки 2157–2171 ─────
      .header-disclosure-capsule summary {
        padding: 6px 14px;
        cursor: pointer;
        color: var(--gold-light);
        font-family: var(--mono);
        font-size: 9px;
        letter-spacing: 2px;
        text-transform: uppercase;
        background: rgba(184, 134, 11, 0.15);
        list-style: none;
        display: flex;
        align-items: center;
        gap: 6px;
        user-select: none;
      }

// ───── Disclosure-CSS шапки и разделов · css*:.header-disclosure
// philosynth.html строки 2172–2172 ─────
      .header-disclosure-capsule summary::-webkit-details-marker { display: none; }

// ───── Disclosure-CSS шапки и разделов · css*:.header-disclosure
// philosynth.html строки 2173–2178 ─────
      .header-disclosure-capsule summary::before {
        content: "▶";
        font-size: 7px;
        transition: transform 0.2s;
        display: inline-block;
      }

// ───── Disclosure-CSS шапки и разделов · css*:.header-disclosure
// philosynth.html строки 2179–2179 ─────
      .header-disclosure-capsule[open] summary::before { transform: rotate(90deg); }

// ───── Disclosure-CSS шапки и разделов · css*:.header-disclosure
// philosynth.html строки 2180–2189 ─────
      .header-disclosure-capsule .disclosure-body {
        padding: 10px 14px;
        font-size: 12px;
        line-height: 1.7;
        color: rgba(255, 255, 255, 0.80);
        font-family: var(--sans);
        white-space: pre-wrap;
        background: rgba(184, 134, 11, 0.08);
        border-top: 1px solid var(--gold);
      }

// ───── Disclosure-CSS шапки и разделов · css*:.header-disclosure
// philosynth.html строки 21386–21391 ─────
          headerExtras.querySelectorAll("details.header-disclosure").forEach(det => {
            const summaryText = det.querySelector("summary")?.textContent?.trim()?.toLowerCase() || "";
            const bodyText = det.querySelector(".disclosure-body")?.textContent?.trim() || "";
            if (summaryText.includes("зерно")) seed = bodyText;
            else if (summaryText.includes("контекст")) ctx = bodyText;
          }

// ───── Disclosure-CSS шапки и разделов · css*:.sec-disclosure
// philosynth.html строки 2192–2195 ─────
      .sec-disclosure {
        border: 1px solid var(--blue-corp);
        margin-bottom: 12px;
      }

// ───── Disclosure-CSS шапки и разделов · css*:.sec-disclosure
// philosynth.html строки 2196–2210 ─────
      .sec-disclosure summary {
        padding: 6px 14px;
        cursor: pointer;
        color: var(--blue-corp);
        font-family: var(--mono);
        font-size: 9px;
        letter-spacing: 2px;
        text-transform: uppercase;
        background: var(--blue-light);
        list-style: none;
        display: flex;
        align-items: center;
        gap: 6px;
        user-select: none;
      }

// ───── Disclosure-CSS шапки и разделов · css*:.sec-disclosure
// philosynth.html строки 2211–2211 ─────
      .sec-disclosure summary::-webkit-details-marker { display: none; }

// ───── Disclosure-CSS шапки и разделов · css*:.sec-disclosure
// philosynth.html строки 2212–2217 ─────
      .sec-disclosure summary::before {
        content: "▶";
        font-size: 7px;
        transition: transform 0.2s;
        display: inline-block;
      }

// ───── Disclosure-CSS шапки и разделов · css*:.sec-disclosure
// philosynth.html строки 2218–2218 ─────
      .sec-disclosure[open] summary::before { transform: rotate(90deg); }

// ───── Disclosure-CSS шапки и разделов · css*:.sec-disclosure
// philosynth.html строки 2219–2228 ─────
      .sec-disclosure .disclosure-body {
        padding: 10px 14px;
        font-size: 12px;
        line-height: 1.7;
        color: var(--ink-mid);
        font-family: var(--sans);
        white-space: pre-wrap;
        background: var(--white);
        border-top: 1px solid var(--blue-corp);
      }

// ───── Разметка-эталон документа · html:#docOutput
// philosynth.html строки 4169–4219 ─────
        <div id="docOutput">
          <div class="doc-header">
            <div class="doc-type">PhiloSynth Pro™ · Синтез Философской Концепции</div>
            <div class="doc-title" id="docTitle">Синтез Философской Концепции</div>
            <button id="docTitleEditBtn" class="doc-title-edit-btn"
              onclick="editDocTitle()" title="Редактировать название">✎
            </button>
            <div class="doc-subtitle" id="docSubtitle">—</div>
            <div id="docHeaderExtras" style="margin-top:14px;display:flex;flex-direction:column;gap:6px;"></div>
            <div class="doc-meta-grid">
              <div class="doc-meta-item">
                <span class="doc-meta-key">Документ №</span>
                <span class="doc-meta-val" id="docNum">—</span>
              </div>
              <div class="doc-meta-item">
                <span class="doc-meta-key">Дата составления</span>
                <span class="doc-meta-val" id="docDate">—</span>
              </div>
              <div class="doc-meta-item">
                <span class="doc-meta-key">Метод синтеза</span>
                <span class="doc-meta-val gold" id="docMethod">—</span>
              </div>
              <div class="doc-meta-item">
                <span class="doc-meta-key">Глубина</span>
                <span class="doc-meta-val gold" id="docDepth">—</span>
              </div>
              <div class="doc-meta-item">
                <span class="doc-meta-key">Уровень синтеза</span>
                <span class="doc-meta-val gold" id="docSynthLevel">—</span>
              </div>
            </div>
          </div>
          <div id="docBodies"></div>
          <div class="doc-footer" id="docFooter" style="display: none">
            <div class="doc-footer-left">
              PhiloSynth Pro™ · v1.0
              <br />
              Документ сгенерирован на основе анализа ИИ (Claude)
              <br />
              Сессия:
              <span id="sessionId">—</span>
              <br />
              <span id="footerCost" style="color: var(--gold)"></span>
            </div>
            <div class="doc-footer-right">
              <div class="validity-stamp">СИНТЕЗ ЗАВЕРШЁН</div>
              <br />
              Философы: <span id="footerPhil">—</span>
            </div>
          </div>
        </div>

// ───── Шапка, оглавление, капсула, футер · js:makeHeaderDisclosure
// philosynth.html строки 11599–11610 ─────
      function makeHeaderDisclosure(label, text) {
        const details = document.createElement("details");
        details.className = "header-disclosure";
        const summary = document.createElement("summary");
        summary.textContent = label;
        const body = document.createElement("div");
        body.className = "disclosure-body";
        body.textContent = text;
        details.appendChild(summary);
        details.appendChild(body);
        return details;
      }

// ───── Шапка, оглавление, капсула, футер · js:buildDocHeaderExtras
// philosynth.html строки 11613–11619 ─────
      function buildDocHeaderExtras(seed, ctx) {
        const container = document.getElementById("docHeaderExtras");
        if (!container) return;
        container.innerHTML = "";
        if (seed) container.appendChild(makeHeaderDisclosure("Зерно концепции", seed));
        if (ctx)  container.appendChild(makeHeaderDisclosure("Дополнительный контекст", ctx));
      }

// ───── Шапка, оглавление, капсула, футер · js:buildTableOfContents
// philosynth.html строки 11620–11711 ─────

      function buildTableOfContents() {
        const db = document.getElementById("docBodies");
        if (!db) return;

        // Удаляем предыдущее содержание
        const oldToc = document.getElementById("docTOC");
        if (oldToc) oldToc.remove();

        // Удаляем старые кнопки ⏫
        db.querySelectorAll(".toc-back-btn").forEach(el => el.remove());

        const order = DOC_STATE.sectionOrder;
        if (!order || order.length < 2) return;

        const subsecMap = buildSubsectionMap(DOC_STATE.params);

        const lines = [];
        lines.push('<details open id="docTOC" class="doc-body">');
        lines.push('  <summary><span class="toc-arrow">▶</span> Содержание</summary>');
        lines.push('  <div class="toc-body">');

        for (const key of order) { if (key === "capsule") continue;
          const def = DOC_STATE.sectionDefs[key];
          if (!def) continue;
          const label = KEY_LABELS[key] || def.title || key;

          // Якорь на раздел
          const dbIdx = DOC_STATE.sectionDbIdx[key];
          const el = document.getElementById("db" + dbIdx);
          if (el && !el.querySelector("#sec-" + key)) {
            const anchor = document.createElement("a");
            anchor.id = "sec-" + key;
            el.insertBefore(anchor, el.firstChild);
          }

          lines.push(`    <p class="toc-section-link"><a href="#sec-${key}">§ ${def.num} — ${esc(label)}</a></p>`);

          // Подразделы — якоря
          const subs = subsecMap[key] || [];
          for (const subName of subs) {
            const subId = "subsec-" + key + "-" + subName.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, "_");
            lines.push(`    <p class="toc-sub-link"><a href="#${subId}">${esc(subName)}</a></p>`);
          }
        }

        lines.push('  </div>');
        lines.push('</details>');

        db.insertAdjacentHTML("afterbegin", lines.join("\n"));

        // ── Расставляем id на подразделы и кнопки ⏫ ──
        for (const key of order) {
          const dbIdx = DOC_STATE.sectionDbIdx[key];
          const el = document.getElementById("db" + dbIdx);
          if (!el) continue;

          // Кнопка ⏫ рядом с заголовком раздела
          const sectionTitle = el.querySelector(".section-title");
          if (sectionTitle && !sectionTitle.querySelector(".toc-back-btn")) {
            const btn = document.createElement("a");
            btn.href = "#docTOC";
            btn.className = "toc-back-btn";
            btn.textContent = "⏫";
            btn.title = "К содержанию";
            sectionTitle.appendChild(btn);
          }

          // Якоря и кнопки ⏫ на подразделах
          const subs = subsecMap[key] || [];
          for (const subName of subs) {
            const subId = "subsec-" + key + "-" + subName.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, "_");
            const subEl = el.querySelector(`[data-section="${subName}"]`);
            if (subEl) {
              if (!subEl.querySelector("#" + subId)) {
                const anchor = document.createElement("a");
                anchor.id = subId;
                subEl.insertBefore(anchor, subEl.firstChild);
              }
              const h4 = subEl.querySelector("h4");
              if (h4 && !h4.querySelector(".toc-back-btn")) {
                const btn = document.createElement("a");
                btn.href = "#docTOC";
                btn.className = "toc-back-btn";
                btn.textContent = "⏫";
                btn.title = "К содержанию";
                h4.appendChild(btn);
              }
            }
          }
        }
      }

// ───── Шапка, оглавление, капсула, футер · js:extractCapsuleText
// philosynth.html строки 11720–11739 ─────
      function extractCapsuleText(capsuleHTML) {
        if (!capsuleHTML) return "";
        const tmp = document.createElement("div");
        tmp.innerHTML = capsuleHTML;
        
        // Целимся в содержимое, минуя section-num и section-title
        const target = tmp.querySelector('[data-section="Капсула"]')
                    || tmp.querySelector('.doc-content')
                    || tmp;
        
        const clone = target.cloneNode(true);
        const h4 = clone.querySelector("h4");
        if (h4) h4.remove();
        
        return (clone.innerText || "")
          .replace(/^\s*Капсула\s*/i, "")
          .replace(/\n\s+/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }

// ───── Шапка, оглавление, капсула, футер · js:restoreCapsulesFromHTML
// philosynth.html строки 11745–11770 ─────
      function restoreCapsulesFromHTML(node, doc) {
        if (!node || node.type === "philosopher") return;

        // Находим все карточки концепций в дереве
        const cards = doc.querySelectorAll(".gen-card");
        const capsuleMap = {};
        for (const card of cards) {
          const nameEl = card.querySelector(".gen-card-name");
          const capsuleBody = card.querySelector(".gen-card-capsule-body");
          if (nameEl && capsuleBody) {
            // Имя без префикса "◈ "
            const name = nameEl.textContent.replace(/^◈\s*/, "").trim();
            capsuleMap[name] = capsuleBody.textContent;
          }
        }

        // Рекурсивно заполняем узлы
        function fill(n) {
          if (!n || n.type === "philosopher") return;
          if (!n.capsule && capsuleMap[n.name]) {
            n.capsule = capsuleMap[n.name];
          }
          if (n.participants) n.participants.forEach(fill);
        }
        if (node.participants) node.participants.forEach(fill);
      }

// ───── Шапка, оглавление, капсула, футер · js:updateCapsuleInHeader
// philosynth.html строки 11773–11796 ─────
      function updateCapsuleInHeader() {
        const container = document.getElementById("docHeaderExtras");
        if (!container || !DOC_STATE.capsuleHTML) return;

        // Удаляем предыдущую капсулу
        const old = container.querySelector(".header-disclosure-capsule");
        if (old) old.remove();

        // Извлекаем текст из HTML капсулы
        const text = extractCapsuleText(DOC_STATE.capsuleHTML);
        if (!text) return;

        const details = document.createElement("details");
        details.className = "header-disclosure-capsule";
        details.open = true; // открыта по умолчанию
        const summary = document.createElement("summary");
        summary.textContent = "◈ Капсула концепции";
        const body = document.createElement("div");
        body.className = "disclosure-body";
        body.textContent = text;
        details.appendChild(summary);
        details.appendChild(body);
        container.appendChild(details);
      }

// ───── Шапка, оглавление, капсула, футер · js:removeCapsuleFromDocBodies
// philosynth.html строки 11822–11829 ─────
      function removeCapsuleFromDocBodies() {
        const idx = DOC_STATE.sectionDbIdx["capsule"];
        if (idx == null) return;
        const el = document.getElementById("db" + idx);
        if (el) el.remove();
        delete DOC_STATE.sectionDbIdx["capsule"];
        rebuildDbMapping();
      }

// ───── Шапка, оглавление, капсула, футер · js:makeSectionCtxDisclosure
// philosynth.html строки 11832–11843 ─────
      function makeSectionCtxDisclosure(text) {
        const details = document.createElement("details");
        details.className = "sec-disclosure";
        const summary = document.createElement("summary");
        summary.textContent = "Дополнительный контекст раздела";
        const body = document.createElement("div");
        body.className = "disclosure-body";
        body.textContent = text;
        details.appendChild(summary);
        details.appendChild(body);
        return details;
      }

// ───── Шапка, оглавление, капсула, футер · js:editDocTitle
// philosynth.html строки 11844–11868 ─────

      function editDocTitle() {
        const el = document.getElementById("docTitle");
        const current = el.textContent.trim();
        const defaultTitle = "Синтез Философской Концепции";
        
        const newTitle = prompt(
          "Название концепции:",
          current === defaultTitle ? "" : current
        );
        
        if (newTitle?.trim()) {
          el.textContent = newTitle.trim();
          
          // Обновить генеалогию, если есть
          if (DOC_STATE.genealogy) {
            DOC_STATE.genealogy.name = newTitle.trim();
            updateGenealogyInHeader();
          }
          
          // Обновить футер
          const footerTitle = document.getElementById("footerTitle");
          if (footerTitle) footerTitle.textContent = newTitle.trim();
        }
      }

// ───── Шапка, оглавление, капсула, футер · js:updateDocTitleFromName
// philosynth.html строки 11871–11892 ─────
      function updateDocTitleFromName(nameContainer) {
        const divs = nameContainer.querySelectorAll("div[data-section]");
        let recSection = null;
        for (const div of divs) {
          const sec = div.getAttribute("data-section").toLowerCase();
          if (sec.includes("итогов") || sec.includes("рекоменд")) { recSection = div; break; }
        }
        const strong = recSection
          ? recSection.querySelector("strong")
          : nameContainer.querySelector("strong");
        let nameText = strong?.textContent?.trim();
        if (nameText) {
          nameText = nameText
            // Шаг 1: убрать известные служебные префиксы модели
            .replace(/^(?:итогов\w+\s+рекомендаци\w*|рекомендуем\w+\s+названи\w*|названи\w+\s*концепци\w*)\s*[:：]\s*/i, "")
            .replace(/^[«""]|[»""]$/g, "")
            // Шаг 2: оставить только основную часть до двоеточия (подзаголовок — в шапку не нужен)
            .split(/\s*[:：]\s*/)[0]
            .trim();
          if (nameText) document.getElementById("docTitle").textContent = nameText;
        }
      }

// ───── Шапка, оглавление, капсула, футер · js:updateFooterCost
// philosynth.html строки 5672–5683 ─────
      function updateFooterCost() {
        const costIn = totalInputTokens * 3 / 1e6;
        const costOut = totalOutputTokens * 15 / 1e6;
        const costTotal = costIn + costOut;
        const el = document.getElementById("footerCost");
        if (el) {
          el.textContent =
            "Токены: " + totalInputTokens.toLocaleString("ru") + " вх. + " +
            totalOutputTokens.toLocaleString("ru") + " вых. · Стоимость: $" +
            costTotal.toFixed(4) + " (" + (costTotal * 100).toFixed(2) + "¢)";
        }
      }

// ───── три ветки docSubtitle, footerPhil · lines:12110-12144
// philosynth.html строки 12110–12144 ─────
        const docNum =
          "PS-" +
          Math.floor(Math.random() * 9000 + 1000) +
          "-" +
          Date.now().toString(36).toUpperCase().slice(-4);
        document.getElementById("docNum").textContent = docNum;
        document.getElementById("docDate").textContent = new Date().toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
        document.getElementById("docMethod").textContent = ML[method];
        document.getElementById("docDepth").textContent = DL[depth];
        document.getElementById("docSynthLevel").textContent = SL[synthLevel];
        document.getElementById("docTitle").textContent = "Синтез Философской Концепции";
        // Подзаголовок — всегда перечень философов/концепций; зерно уходит только в раскрывающееся поле
        if (hasNoParticipants(p)) {
          document.getElementById("docSubtitle").textContent = "Свободный синтез (на основе зерна)";
        } else if (hasConceptParticipants(p)) {
          const philPart = philNames(p).join(", ");
          const conceptPart = conceptNames(p).join(", ");
          const parts = [];
          if (philPart) parts.push(philPart);
          if (conceptPart) parts.push(conceptPart);
          document.getElementById("docSubtitle").textContent = "На основе: " + parts.join(" + ");
        } else {
          document.getElementById("docSubtitle").textContent = `На основе: ${(p.phil || []).join(", ")}`;
        }
        document.getElementById("sessionId").textContent = docNum;

        // Заполняем раскрывающиеся поля шапки (зерно, контекст)
        buildDocHeaderExtras(seed, ctx);
        document.getElementById("footerPhil").textContent = hasNoParticipants(p)
          ? "свободный синтез"
          : (p.phil || []).join(", ");

// ───── Панель действий над документом (разметка) · lines:4134-4168
// philosynth.html строки 4134–4168 ─────
      <div class="output-wrap" id="outputWrap">
        <div class="actions-bar">
          <div
            style="
              font-family: var(--mono);
              font-size: 10px;
              color: var(--ink-dim);
              letter-spacing: 1px;
            "
          >
            ДОКУМЕНТ СГЕНЕРИРОВАН
            <span class="import-indicator" id="importIndicator"></span>
          </div>
          <div class="actions-bar-btns">
            <button
              class="action-btn gold-btn"
              id="btnGraph"
              onclick="openGraph()"
              style="display: none"
            >
              3D/2D Граф
            </button>
            <button class="action-btn" onclick="window.print()">Распечатать</button>
            <button class="action-btn" onclick="viewRawHTML()">Raw HTML</button>
            <button class="action-btn" onclick="viewCtxLog()">Лог контекста</button>
            <button class="action-btn gold-btn" id="btnEdit" onclick="openEditModal()">Изменить</button>
            <button class="action-btn" id="btnAdversarial" onclick="openModeModal('adversarial')" style="display:none">⚔ Оппонент</button>
            <button class="action-btn" id="btnTranslator" onclick="openModeModal('translator')" style="display:none">🔄 Переводчик</button>
            <button class="action-btn" id="btnTimeSlice" onclick="openModeModal('timeslice')" style="display:none">⏳ Временной срез</button>
            <button class="action-btn" onclick="saveHTML()">Сохранить HTML</button>
            <button class="action-btn" onclick="saveMD()">Сохранить MD</button>
            <button class="action-btn" onclick="resetForm()">Новый Синтез</button>
            <button class="action-btn primary" onclick="copyDoc()">Скопировать</button>
          </div>
        </div>
