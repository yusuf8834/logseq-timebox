import "@logseq/libs";

import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App/App.tsx";
import { initializeSidebarStuff } from "./sidebar-stuff.ts";

const main = async () => {
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

