import type { Config } from "tailwindcss";

/**
 * Дизайн-система из philosynth.html (:root, строки 14–35 исходника).
 * Цвета ссылаются на CSS-переменные из globals.css — единственный источник
 * hex-значений; Tailwind-классы (bg-paper, text-ink, border-rule, …) —
 * их проекция. Имена переменных сохранены дословно из исходника;
 * --parchment — алиас --off (#f2f0eb), терминология проектных доков.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: "var(--white)",
        off: "var(--off)",
        parchment: "var(--parchment)",
        paper: "var(--paper)",
        rule: "var(--rule)",
        "rule-strong": "var(--rule-strong)",
        ink: "var(--ink)",
        "ink-mid": "var(--ink-mid)",
        "ink-dim": "var(--ink-dim)",
        gold: "var(--gold)",
        "gold-light": "var(--gold-light)",
        red: "var(--red)",
        "blue-corp": "var(--blue-corp)",
        "blue-mid": "var(--blue-mid)",
        "blue-light": "var(--blue-light)",
        violet: "var(--violet)",
        "violet-light": "var(--violet-light)",
        "green-check": "var(--green-check)",
      },
      fontFamily: {
        mono: "var(--mono)",
        sans: "var(--sans)",
        serif: "var(--serif)",
      },
    },
  },
  plugins: [],
} satisfies Config;
