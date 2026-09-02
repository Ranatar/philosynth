/**
 * Внутренний шаблон заглушки страницы. Беседа 0.4: реальный контент
 * страниц появится в беседах 1.5–1.7, 2.x, 4.3, 6.2.
 * Не входит в 05-file-structure — служебный компонент каркаса,
 * удаляется по мере наполнения страниц.
 */
interface PageStubProps {
  title: string;
  /** Номер беседы протокола (07), в которой страница будет наполнена */
  plannedIn: string;
  children?: React.ReactNode;
}

export function PageStub({ title, plannedIn, children }: PageStubProps) {
  return (
    <div className="input-form">
      <h1 className="form-section-title">{title}</h1>
      <div className="form-group full">
        <p className="submit-note">
          Заглушка каркаса (беседа 0.4). Наполнение — беседа {plannedIn}.
        </p>
        {children}
      </div>
    </div>
  );
}
