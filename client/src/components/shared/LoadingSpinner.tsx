/**
 * Спиннер загрузки. По 05-file-structure — components/shared/;
 * первый потребитель — беседа 1.6b (SynthesisPage: загрузка,
 * status='generating').
 */
export interface LoadingSpinnerProps {
  /** Подпись под спиннером (mono-капитель) */
  label?: string | undefined;
}

export function LoadingSpinner({ label }: LoadingSpinnerProps) {
  return (
    <div className="edit-regen-progress active" style={{ padding: "24px 0" }}>
      <div aria-hidden className="edit-regen-spinner" />
      {label && <span>{label}</span>}
    </div>
  );
}
