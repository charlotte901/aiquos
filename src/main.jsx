import React from "react";
import { createRoot } from "react-dom/client";
import { SiteExperience } from "./SiteExperience.jsx";
import "./styles.css";
import "./responsive.css";
import "./cases.css";
import "./assessment.css";
import "./assessment-flow.css";
import "./choose.css";
import "./profile.css";
import "./profile-records.css";
import "./awakening-report.css";
import "./cube-turn.css";
import "./login.css";
import "./interface-transition.css";
import "./profile-details.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SiteExperience />
  </React.StrictMode>,
);
