import "@logseq/libs";

import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App/App.tsx";
import { initializeSidebarStuff } from "./sidebar-stuff.ts";

// Custom event name for database changes - used to notify React components
export const DB_CHANGED_EVENT = "logseq-timebox-db-changed";

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
    {
      key: "multiDayViewSpan",
      type: "number",
      default: 3,
      title: "Multi-day view length (days)",
      description: "Number of days shown in the multi-day time-grid view (min 2, max 14).",
    },
    {
      key: "clickAction",
      type: "enum",
      default: "none",
      title: "Single click action",
      description: "What happens when you single-click an event",
      enumChoices: ["none", "edit", "goto"],
      enumPicker: "select",
    },
    {
      key: "doubleClickAction",
      type: "enum",
      default: "goto",
      title: "Double click action",
      description: "What happens when you double-click an event",
      enumChoices: ["none", "edit", "goto"],
      enumPicker: "select",
    },
  ]);

  console.log("Initializing simple sidebar plugin...");
  initializeSidebarStuff();

  // Set up database change listener in the main plugin context
  // This ensures it works correctly and dispatches events to the React app
  let dbChangeTimeout: number | undefined;
  logseq.DB.onChanged(() => {
    // Debounce to avoid excessive reloads
    if (dbChangeTimeout) window.clearTimeout(dbChangeTimeout);
    dbChangeTimeout = window.setTimeout(() => {
      // Dispatch custom event that React components can listen to
      window.dispatchEvent(new CustomEvent(DB_CHANGED_EVENT));
    }, 300);
  });

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

