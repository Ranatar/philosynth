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
    <div className="mx-auto max-w-3xl">
      <div className="meta-label">страница</div>
      <h1 className="mt-1 text-2xl">{title}</h1>
      <div className="mt-6 rounded border border-rule bg-paper p-6">
        <p className="text-ink-mid">
          Заглушка каркаса (беседа 0.4). Наполнение — беседа {plannedIn}.
        </p>
        {children}
      </div>
    </div>
  );
}
