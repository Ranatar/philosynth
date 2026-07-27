/**
 * 404 внутри Layout — чтобы неизвестный маршрут не давал белый экран.
 * Беседа 0.4.
 */
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="meta-label">ошибка</div>
      <h1 className="mt-1 text-2xl">Страница не найдена</h1>
      <p className="mt-4 text-ink-mid">
        Такого маршрута нет. <Link to="/catalog">Вернуться в каталог</Link>
      </p>
    </div>
  );
}
