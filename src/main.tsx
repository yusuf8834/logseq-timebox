import "@logseq/libs";

import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App/App.tsx";
import { initializeSidebarStuff } from "./sidebar-stuff.ts";
import { resetGraphAdapter } from "./App/adapters";

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
      key: "defaultEventDurationMinutes",
      type: "number",
      default: 60,
      title: "Default event duration (minutes)",
      description: "How long a scheduled task without a [d:...] duration token is drawn (min 5, max 480). Display only; nothing is written to the block.",
    },
    {
      key: "newTaskDurationMinutes",
      type: "number",
      default: 30,
      title: "New task duration (minutes)",
      description: "Length of a task created by clicking an empty time slot (min 5, max 480). Dragging across slots uses the dragged length.",
    },
    {
      key: "snapIntervalMinutes",
      type: "enum",
      default: "30",
      title: "Snap interval (minutes)",
      description: "Step size when dragging, resizing or selecting in the time grid. Grid lines stay at 30 minutes.",
      enumChoices: ["5", "10", "15", "30"],
      enumPicker: "select",
    },
    {
      key: "clickAction",
      type: "enum",
      default: "goto",
      title: "Single click action",
      description: "What happens when you single-click an event (after the double-click wait).",
      enumChoices: ["none", "edit", "goto", "cycleStatus"],
      enumPicker: "select",
    },
    {
      key: "doubleClickAction",
      type: "enum",
      default: "cycleStatus",
      title: "Double click action",
      description: "What happens when you double-click an event. cycleStatus rotates status: Todo → Doing → Done → Todo (other statuses become Doing first).",
      enumChoices: ["none", "edit", "goto", "cycleStatus"],
      enumPicker: "select",
    },
    {
      key: "externalIcsUrls",
      type: "string",
      default: "",
      title: "External calendar ICS URLs (one per line)",
      description: "Read-only feeds to show in the calendar.",
      inputAs: "textarea",
    },
    {
      key: "showExternalCalendars",
      type: "boolean",
      default: true,
      title: "Show external calendars by default",
      description: "Toggle visibility of ICS events.",
    },
  ]);

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

  // Switching graphs may change the graph type (MD ↔ DB) — re-detect and reload
  logseq.App.onCurrentGraphChanged(() => {
    resetGraphAdapter();
    window.dispatchEvent(new CustomEvent(DB_CHANGED_EVENT));
  });

  // Logseq APIs are not reliable until ready() has connected the plugin host.
  // Mounting earlier can cache a false MD result during the slower web startup.
  const rootEl = document.getElementById("root");
  if (rootEl) {
    createRoot(rootEl).render(<App />);
  }
};

logseq.ready(main).catch((e) => {
  logseq.UI.showMsg(`${e ?? ""}`, "error");
});
