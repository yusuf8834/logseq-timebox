import "@logseq/libs";

import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App/App.tsx";
import { initializeSidebarStuff } from "./sidebar-stuff.ts";

const main = async () => {
  logseq.useSettingsSchema([
    {
      key: "startOfDayHour",
      type: "number",
      default: 8,
      title: "Start of day hour (0-23)",
      description: "Controls the earliest time shown in the calendar day/week views. Enter a whole hour between 0 and 23.",
    },
    {
      key: "firstDayOfWeek",
      type: "number",
      default: 1,
      title: "First day of week (0-6)",
      description: "0 = Sunday, 1 = Monday, ... 6 = Saturday",
    },
  ]);

  console.log("Initializing simple sidebar plugin...");
  initializeSidebarStuff();
  console.log("Simple sidebar plugin initialized");
};

logseq.ready(main).catch((e) => {
  console.error("Error initializing plugin:", e);
  logseq.UI.showMsg(`${e ?? ""}`, "error");
});

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
}

