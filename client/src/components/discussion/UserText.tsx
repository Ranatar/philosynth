/**
 * Текст пользователя (комментарий, замечание, поле рецензии) — ТОЛЬКО
 * экранированным текстом (беседа 16.3, п. 5): абзацы по пустой строке,
 * внутри абзаца переводы строки сохраняются (white-space: pre-wrap в CSS).
 * Никакого dangerouslySetInnerHTML — сторож 4bo.
 */
import { paragraphsOf } from "../../utils/discussion";

export function UserText({ text, className }: { text: string; className?: string | undefined }) {
  const parts = paragraphsOf(text);
  if (parts.length === 0) return null;
  return (
    <div className={className ? `user-text ${className}` : "user-text"}>
      {parts.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
