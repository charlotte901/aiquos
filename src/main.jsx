import React from "react";
import { createRoot } from "react-dom/client";
import { SiteExperience } from "./SiteExperience.jsx";
import { DesignStage } from "./DesignStage.jsx";
import "./styles.css";
import "./tokens.css";
import "./responsive.css";
import "./cases.css";
import "./forum.css";
import "./forum-board.css";
import "./home-agent.css";
import "./assessment.css";
import "./duo-key.css";
import "./assessment-flow.css";
import "./choose.css";
import "./profile.css";
import "./profile-records.css";
import "./awakening-report.css";
import "./cube-turn.css";
import "./interface-transition.css";
import "./login.css";
import "./profile-details.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DesignStage>
      <SiteExperience />
    </DesignStage>
  </React.StrictMode>,
);
