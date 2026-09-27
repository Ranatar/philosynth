/**
 * Точка входа клиента. Беседа 0.4.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./globals.css";
import { tl } from "@philosynth/shared/i18n/t";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error(tl("main.rootNotFound", "Элемент #root не найден в index.html"));

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
