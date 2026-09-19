import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/dm-sans/900.css";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/500.css";
import "@fontsource/noto-sans-sc/700.css";
import "@fontsource/noto-sans-sc/900.css";
import "../tokens.css";
import "./admin.css";
import { AdminApp } from "./AdminApp.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>,
);
