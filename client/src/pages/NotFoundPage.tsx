/**
 * 404 внутри Layout — чтобы неизвестный маршрут не давал белый экран.
 * Беседа 0.4.
 */
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="input-form">
      <h1 className="form-section-title">Страница не найдена</h1>
      <p className="submit-note">
        Такого маршрута нет. <Link to="/catalog">Вернуться в каталог</Link>
      </p>
    </div>
  );
}
