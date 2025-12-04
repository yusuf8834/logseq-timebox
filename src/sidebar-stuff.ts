import packageJson from "../package.json" with { type: "json" };

const providedUiIdBase = "simple-sidebar-plugin";
const spacerId = `${providedUiIdBase}-spacer`;

const applicationId = packageJson.logseq.id;

const sidebarWidthStorageKey = `${applicationId}-sidebar-width`;

const defaultWidth = 400;
const MIN_WIDTH = 300;

const sidebarHandleWidth = 4;
const spacerLeftPadding = 10;

// Local state
let isUiShowing = false;
let sidebarWidth = NaN;

// Sidebar width
const clampWidth = (width: number) => Math.max(MIN_WIDTH, width);

const getSidebarWidth = () => {
  if (isNaN(sidebarWidth)) {
    sidebarWidth = readStoredWidth();
  }
  return sidebarWidth;
};

// Element ID
const deriveProvidedElementId = (providedUiId: string) => {
  return `${applicationId}--${providedUiId}`;
};

const getParentViewportDocument = () => {
  try {
    const parentWindow = window.parent;
    if (parentWindow && parentWindow !== window) {
      return parentWindow.document;
    }
  } catch {
    return null;
  }

  return document;
};

// Spacer
const computeSpacerWidth = (targetSidebarWidth: number) =>
  targetSidebarWidth + sidebarHandleWidth + spacerLeftPadding;

const updateSpacerWidth = (newSidebarWidth: number) => {
  const doc = getParentViewportDocument();
  if (!doc) {
    return;
  }

  const element = doc.querySelector(
    `#${deriveProvidedElementId(spacerId)} > div`
  ) as HTMLDivElement | null;

  if (element) {
    element.style.width = `${computeSpacerWidth(newSidebarWidth)}px`;
  }
};

const injectSpacer = () => {
  logseq.provideUI({
    key: spacerId,
    path: "#root",
    template: `<div style="width: ${computeSpacerWidth(
      getSidebarWidth()
    )}px; background: transparent; height: 100vh; cursor: ew-resize"></div>`,
  });
};

const removeSpacer = () => {
  logseq.provideUI({
    key: spacerId,
    path: "#root",
    template: "",
  });
};

// Main UI helpers
const setMainUIStyle = (width: number) => {
  const px = `${width}px`;

  logseq.setMainUIInlineStyle({
    position: "absolute",
    zIndex: 11,
    width: px,
    top: "0",
    left: `calc(100vw - ${px})`,
    height: "100vh",
  });
};

// UI
const displayUI = () => {
  isUiShowing = true;

  injectSpacer();

  logseq.showMainUI();

  setMainUIStyle(getSidebarWidth());

  updateSpacerWidth(getSidebarWidth());
};

const hideUI = () => {
  isUiShowing = false;

  logseq.hideMainUI();
  removeSpacer();
};

// Toolbar
const initializeToolbar = () => {
  const iconName = `${applicationId}--${providedUiIdBase}-toolbar-icon`;

  logseq.provideStyle(`
    .${iconName} {
      font-size: 20px;
      margin-top: 2px;
    }

    .${iconName}:hover {
      opacity: 1;
    }
  `);

  logseq.provideModel({
    toggle() {
      if (isUiShowing) {
        hideUI();
      } else {
        displayUI();
      }
    },
  });

  logseq.provideStyle(`
    #injected-ui-item-${iconName}-${applicationId} {
      display: flex;
      align-items: center;
      font-weight: 500;
      position: relative;
    }

    #injected-ui-item-${iconName}-${applicationId}-overlay {
      display: flex;
      align-items: center;
      font-weight: 500;
      position: relative;
    }
  `);

  logseq.App.registerUIItem("toolbar", {
    key: iconName,
    template: `
      <a class="button relative" data-on-click="toggle">
        <span class="${iconName}"><i class="ti ti-calendar"></i></span>
      </a>  
    `,
  });

  console.log("Toolbar icon registered:", iconName);
};

// Persistence
const getLocalStorage = () => window.parent?.window?.localStorage;

const readStoredWidth = () => {
  try {
    const raw = getLocalStorage()?.getItem(sidebarWidthStorageKey);
    if (!raw) {
      return defaultWidth;
    }

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? clampWidth(parsed) : defaultWidth;
  } catch {
    return defaultWidth;
  }
};

// Initialization
export const initializeSidebarStuff = () => {
  injectGlobalStyleOverrides();

  initializeToolbar();
};

const injectGlobalStyleOverrides = () => {
  logseq.provideStyle(`
    #root { display: flex; }
    .theme-container { flex: 1; }
  `);
};

