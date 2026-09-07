/**
 * Построчный diff двух текстов (беседа 6.2: сравнение версий шаблона
 * Prompt Registry и JSON конфигов). Чистая функция, без React.
 *
 * diffSnapshots из VersionHistory (5.2) — ПОПОЛЕВОЙ diff снимков элемента
 * и для многострочных тел не годится; форма результата DiffLine у обоих
 * одна — рендер через классы .diff / .diff-line.add|del|ctx кита (блок 5).
 *
 * Алгоритм: LCS по строкам (O(n·m) памяти — тела шаблонов ≤ несколько
 * сотен строк, это допустимо). Неизменённые строки сворачиваются: вокруг
 * изменений остаётся `context` строк, длинные одинаковые участки
 * заменяются одной строкой «… N строк без изменений …».
 */

export interface DiffLine {
  kind: "ctx" | "del" | "add";
  text: string;
}

interface RawOp {
  kind: "ctx" | "del" | "add";
  text: string;
}

function lcsOps(a: string[], b: string[]): RawOp[] {
  const n = a.length;
  const m = b.length;
  // dp[i][j] — длина LCS суффиксов a[i:], b[j:]
  const dp: Uint32Array[] = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i]!;
    const next = dp[i + 1]!;
    for (let j = m - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }
  const ops: RawOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "ctx", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ kind: "del", text: a[i]! });
      i++;
    } else {
      ops.push({ kind: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ kind: "del", text: a[i++]! });
  while (j < m) ops.push({ kind: "add", text: b[j++]! });
  return ops;
}

export interface DiffOptions {
  /** Строк контекста вокруг изменений (по умолчанию 2) */
  context?: number;
}

/** Diff «older → newer»: удалённые строки — del, добавленные — add. */
export function diffLines(older: string, newer: string, opts: DiffOptions = {}): DiffLine[] {
  const context = opts.context ?? 2;
  const a = older.split("\n");
  const b = newer.split("\n");
  if (older === newer) return [{ kind: "ctx", text: "Различий нет" }];

  const ops = lcsOps(a, b);
  const keep = new Array<boolean>(ops.length).fill(false);
  for (let idx = 0; idx < ops.length; idx++) {
    if (ops[idx]!.kind === "ctx") continue;
    for (let d = -context; d <= context; d++) {
      const t = idx + d;
      if (t >= 0 && t < ops.length) keep[t] = true;
    }
  }

  const out: DiffLine[] = [];
  let skipped = 0;
  const flush = (): void => {
    if (skipped > 0) {
      out.push({ kind: "ctx", text: `… ${skipped} ${pluralLines(skipped)} без изменений …` });
      skipped = 0;
    }
  };
  for (let idx = 0; idx < ops.length; idx++) {
    const op = ops[idx]!;
    if (keep[idx]) {
      flush();
      out.push({ kind: op.kind, text: op.text });
    } else {
      skipped++;
    }
  }
  flush();
  return out;
}

function pluralLines(n: number): string {
  const r10 = n % 10;
  const r100 = n % 100;
  if (r10 === 1 && r100 !== 11) return "строка";
  if (r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14)) return "строки";
  return "строк";
}

/** Сводка diff: сколько строк добавлено/удалено. */
export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.kind === "add") added++;
    else if (l.kind === "del") removed++;
  }
  return { added, removed };
}
