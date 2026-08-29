/**
 * css-audit — auditCSS() [17835–18001] (беседа 4.2; карта 04 §2.5,
 * 05: server/utils/css-audit.ts). Парсер CSS + консервативное удаление
 * «точно неиспользуемых» правил перед вставкой в автономный HTML.
 *
 * Порт 1:1 (вложенные parseCSS/definitelyUnused/serializeRules дословно);
 * средонезависим — адаптаций нет.
 */

interface CommentRule {
  type: "comment";
  raw: string;
}
interface AtSimpleRule {
  type: "at-simple";
  kw: string;
  prelude: string;
}
interface KeyframesRule {
  type: "keyframes";
  name: string;
  body: string;
}
interface AtCondRule {
  type: "at-cond";
  kw: string;
  prelude: string;
  inner: CssRule[];
}
interface AtBlockRule {
  type: "at-block";
  kw: string;
  prelude: string;
  body: string;
}
interface StyleRule {
  type: "rule";
  selector: string;
  body: string;
}
type CssRule =
  | CommentRule
  | AtSimpleRule
  | KeyframesRule
  | AtCondRule
  | AtBlockRule
  | StyleRule;

export function auditCSS(cssText: string, contentToCheck: string): string {
  // ── 1. Парсер CSS ──────────────────────────────────────────────
  // Нужен только чтобы найти границы правил.
  // Возвращает плоское дерево: rule / keyframes / at-cond / at-block / at-simple / comment
  function parseCSS(css: string): CssRule[] {
    let i = 0;
    const len = css.length;

    function readComment(): string {
      let s = "/*";
      i += 2;
      while (i < len - 1) {
        if (css[i] === "*" && css[i + 1] === "/") {
          s += "*/";
          i += 2;
          return s;
        }
        s += css[i++];
      }
      return s;
    }

    function readUntil(stops: string[]): string {
      let s = "";
      while (i < len) {
        if (css[i] === "/" && css[i + 1] === "*") {
          readComment();
          continue;
        }
        if (stops.indexOf(css[i] as string) !== -1) return s;
        s += css[i++];
      }
      return s;
    }

    function readBlock(): string {
      let depth = 1,
        s = "";
      while (i < len) {
        if (css[i] === "/" && i + 1 < len && css[i + 1] === "*") {
          s += readComment();
          continue;
        }
        if (css[i] === "{") depth++;
        if (css[i] === "}") {
          if (!--depth) {
            i++;
            return s;
          }
        }
        s += css[i++];
      }
      return s;
    }

    const rules: CssRule[] = [];

    while (i < len) {
      while (i < len && /\s/.test(css[i] as string)) i++;
      if (i >= len) break;

      if (css[i] === "/" && css[i + 1] === "*") {
        rules.push({ type: "comment", raw: readComment() });
        continue;
      }

      if (css[i] === "@") {
        i++;
        let kw = "";
        while (i < len && /[a-zA-Z-]/.test(css[i] as string)) kw += css[i++];
        while (i < len && /\s/.test(css[i] as string)) i++;
        const prelude = readUntil(["{", ";"]).trim();

        if (i < len && css[i] === ";") {
          i++;
          rules.push({ type: "at-simple", kw, prelude });
          continue;
        }
        if (i < len && css[i] === "{") {
          i++;
          const body = readBlock();
          if (/^(-\w+-)?keyframes$/.test(kw)) {
            rules.push({ type: "keyframes", name: prelude, body });
          } else if (kw === "media" || kw === "supports" || kw === "layer") {
            rules.push({ type: "at-cond", kw, prelude, inner: parseCSS(body) });
          } else {
            rules.push({ type: "at-block", kw, prelude, body });
          }
        }
        continue;
      }

      const selector = readUntil(["{", "}"]).trim();
      if (i >= len) break;
      if (css[i] === "}") {
        i++;
        continue;
      }
      i++;
      const body = readBlock();
      if (selector) rules.push({ type: "rule", selector, body });
    }

    return rules;
  }

  // ── 2. Консервативная проверка «точно не используется» ────────
  //
  // Используем indexOf по сырой строке контента — это намеренно
  // избыточно: если «foo» встречается где угодно (даже в комментарии
  // или строковом литерале JS), правило НЕ удаляется.
  // Это цена безопасности: лишние стили лучше, чем сломанные.

  function classesFromSelector(sel: string): string[] {
    const out: string[] = [];
    const re = /\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sel)) !== null) out.push(m[1] as string);
    return out;
  }

  function definitelyUnused(r: CssRule): boolean {
    // Комментарии, @font-face, @import, @charset и т.п. — никогда не удаляем
    if (r.type === "comment") return false;
    if (r.type === "at-simple") return false;
    if (r.type === "at-block") return false;

    // @keyframes: удаляем только если имя анимации нигде не встречается
    if (r.type === "keyframes") {
      return contentToCheck.indexOf(r.name) === -1;
    }

    // @media / @supports: удаляем только если ВСЕ вложенные правила точно не нужны
    if (r.type === "at-cond") {
      return r.inner.length > 0 && r.inner.every(definitelyUnused);
    }

    if (r.type === "rule") {
      const sel = r.selector;

      // Глобальные и элементные — никогда не удаляем
      if (/^(\*|:root|html|body)(\s*[,{]|$)/.test(sel)) return false;

      const classes = classesFromSelector(sel);

      // Нет класс-селекторов → элементный / атрибутный / псевдо → оставляем
      if (classes.length === 0) return false;

      // Удаляем только если НИ ОДИН класс не найден как подстрока
      return classes.every(function (c) {
        return contentToCheck.indexOf(c) === -1;
      });
    }

    // Неизвестный тип — оставляем
    return false;
  }

  // ── 3. Сериализация с удалением «точно ненужных» ──────────────
  function serializeRules(rules: CssRule[], indent: string): string {
    indent = indent || "";
    const parts: string[] = [];

    rules.forEach(function (r) {
      // Удаляем только если УВЕРЕНЫ
      if (definitelyUnused(r)) return;

      if (r.type === "comment") {
        parts.push(r.raw);
        return;
      }
      if (r.type === "at-simple") {
        parts.push("@" + r.kw + " " + r.prelude + ";");
        return;
      }
      if (r.type === "rule") {
        parts.push(r.selector + " {" + r.body + "}");
        return;
      }
      if (r.type === "keyframes") {
        parts.push("@keyframes " + r.name + " {" + r.body + "}");
        return;
      }
      if (r.type === "at-block") {
        parts.push("@" + r.kw + " " + r.prelude + " {" + r.body + "}");
        return;
      }

      if (r.type === "at-cond") {
        // Фильтруем вложенные, но только если внутри что-то осталось
        const inner = serializeRules(r.inner, indent + "  ");
        if (inner.trim())
          parts.push("@" + r.kw + " " + r.prelude + " {\n" + inner + "\n" + indent + "}");
        return;
      }
    });

    return parts.map(function (p) {
      return indent + p;
    }).join("\n");
  }

  return serializeRules(parseCSS(cssText), "");
}
