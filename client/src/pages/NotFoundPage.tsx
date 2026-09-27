/**
 * 404 внутри Layout — чтобы неизвестный маршрут не давал белый экран.
 * Беседа 0.4.
 */
import { Link } from "react-router-dom";
import { tl } from "@philosynth/shared/i18n/t";

export function NotFoundPage() {
  return (
    <div className="input-form">
      <h1 className="form-section-title">{tl("notFoundPage.title", "Страница не найдена")}</h1>
      <p className="submit-note">
        {tl("notFoundPage.noSuchRoute", "Такого маршрута нет.")} <Link to="/catalog">{tl("notFoundPage.backToCatalog", "Вернуться в каталог")}</Link> ·{" "}
        <Link to="/">{tl("notFoundPage.toHomeLower", "на главную")}</Link>
      </p>
    </div>
  );
}
