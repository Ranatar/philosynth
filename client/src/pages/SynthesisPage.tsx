/**
 * Просмотр синтеза. Беседа 0.4: заглушка (показывает :id из URL).
 * Наполнение: беседы 1.6b (DocumentView), 1.7 (граф), 2.3 (EditModal).
 * Транспорт чтения готов (беседа 1.6).
 */
import { useParams } from "react-router-dom";

import { PageStub } from "./PageStub";

export function SynthesisPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <PageStub title="Синтез" plannedIn="1.6b / 1.7 / 2.3">
      <p className="mt-2 font-mono text-xs text-ink-dim">id: {id}</p>
    </PageStub>
  );
}
