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
    <div className="flex flex-col items-center gap-3 py-12">
      <div
        aria-hidden
        className="h-6 w-6 animate-spin rounded-full border-2 border-rule border-t-gold"
      />
      {label && <span className="meta-label">{label}</span>}
    </div>
  );
}
