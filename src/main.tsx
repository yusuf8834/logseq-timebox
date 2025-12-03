import "@logseq/libs";

import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App/App.tsx";
import { initializeSidebarStuff } from "./sidebar-stuff.ts";

const main = async () => {
  initializeSidebarStuff();
};

logseq.ready(main).catch((e) => {
  console.error(e);
  logseq.UI.showMsg(`${e ?? ""}`, "error");
});

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
}

