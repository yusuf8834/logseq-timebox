import packageJson from "../package.json" with { type: "json" };

const providedUiIdBase = "simple-sidebar-plugin";
const legacySpacerKey = `${providedUiIdBase}-spacer`;

const applicationId = packageJson.logseq.id;

const sidebarWidthStorageKey = `${applicationId}-sidebar-width`;
const sidebarPositionStorageKey = `${applicationId}-sidebar-position`;

const defaultWidth = 400;
const MIN_WIDTH = 300;

// Layout shifting uses host-injected styles so it can work in sandboxed mode.

// Local state
let isUiShowing = false;
let sidebarWidth = NaN;
let sidebarPosition: "left" | "right" = "left";

// Sidebar width
const clampWidth = (width: number) => Math.max(MIN_WIDTH, width);

const getSidebarWidth = () => {
  if (isNaN(sidebarWidth)) {
    sidebarWidth = readStoredWidth();
  }
  return sidebarWidth;
};

const initSidebarPosition = () => {
  sidebarPosition = readStoredPosition();
};

// Element ID helper removed (no injected spacer elements anymore)

// Layout adjustments use injected styles instead of spacer elements.
let hasInjectedLayoutBaseStyle = false;
let lastLayoutVars = "";

const injectLayoutBaseStyle = () => {
  if (hasInjectedLayoutBaseStyle) return;
  hasInjectedLayoutBaseStyle = true;

  logseq.provideStyle(`
    :root {
      --logseq-timebox-left: 0px;
      --logseq-timebox-right: 0px;
    }

    #main-content-container {
      margin-left: var(--logseq-timebox-left) !important;
      margin-right: var(--logseq-timebox-right) !important;
      transition: margin 0.15s ease;
    }

    :root:not(:has(#main-content-container)) .cp__sidebar-main-content {
      margin-left: var(--logseq-timebox-left) !important;
      margin-right: var(--logseq-timebox-right) !important;
      transition: margin 0.15s ease;
    }

    :root:not(:has(#main-content-container)):not(:has(.cp__sidebar-main-content)) .cp__sidebar-main-layout {
      margin-left: var(--logseq-timebox-left) !important;
      margin-right: var(--logseq-timebox-right) !important;
      transition: margin 0.15s ease;
    }
  `);
};

const updateHostLayoutVars = (
  width: number,
  position: "left" | "right",
  visible: boolean,
) => {
  const appliedWidth = visible ? width : 0;
  const leftMargin = position === "left" ? appliedWidth : 0;
  const rightMargin = position === "right" ? appliedWidth : 0;
  const nextVars = `:root{--logseq-timebox-left:${leftMargin}px;--logseq-timebox-right:${rightMargin}px;}`;

  if (nextVars === lastLayoutVars) return;
  lastLayoutVars = nextVars;

  try {
    logseq.provideStyle(nextVars);
  } catch {}
};

// Adjust main content area to make room for sidebar
const adjustMainContent = (width: number, position: "left" | "right") => {
  updateHostLayoutVars(width, position, true);
};

const resetMainContent = () => {
  updateHostLayoutVars(0, sidebarPosition, false);
};

// Main UI helpers
const setMainUIStyle = (width: number, position: "left" | "right") => {
  const px = `${width}px`;
  const headerHeight = "var(--ls-top-bar-height, 40px)";

  logseq.setMainUIInlineStyle({
    position: "absolute",
    zIndex: 11,
    width: px,
    top: headerHeight,
    left: position === "left" ? "0" : `calc(100vw - ${px})`,
    height: `calc(100vh - ${headerHeight})`,
  });
};

// UI
const displayUI = () => {
  isUiShowing = true;

  logseq.showMainUI();

  const width = getSidebarWidth();
  setMainUIStyle(width, sidebarPosition);
  adjustMainContent(width, sidebarPosition);
};

const hideUI = () => {
  isUiShowing = false;

  logseq.hideMainUI();
  resetMainContent();
};

// Public helper to close/hide the sidebar overlay from UI components
export const closeSidebar = () => {
  try {
    hideUI();
  } catch {}
};

// Toolbar
const initializeToolbar = () => {
  const toolbarKey = "logseq-timebox";
  const toolbarLabel = "Logseq Timebox";
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
    #injected-ui-item-${toolbarKey}-${applicationId} {
      display: flex;
      align-items: center;
      font-weight: 500;
      position: relative;
    }

    #injected-ui-item-${toolbarKey}-${applicationId}-overlay {
      display: flex;
      align-items: center;
      font-weight: 500;
      position: relative;
    }
  `);

  logseq.App.registerUIItem("toolbar", {
    key: toolbarKey,
    template: `
      <a class="button relative" data-on-click="toggle" title="${toolbarLabel}" aria-label="${toolbarLabel}" data-rect-tooltip="${toolbarLabel}">
        <span class="${iconName}"><i class="ti ti-list-details"></i></span>
      </a>  
    `,
  });

  console.log("Toolbar icon registered:", iconName);
};

// Persistence
const getLocalStorage = () => window.localStorage;

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

const saveStoredWidth = (width: number) => {
  try {
    getLocalStorage()?.setItem(sidebarWidthStorageKey, String(width));
  } catch {}
};

const readStoredPosition = (): "left" | "right" => {
  try {
    const raw = getLocalStorage()?.getItem(sidebarPositionStorageKey);
    return raw === "right" ? "right" : "left";
  } catch {
    return "left";
  }
};

const saveStoredPosition = (position: "left" | "right") => {
  try {
    getLocalStorage()?.setItem(sidebarPositionStorageKey, position);
  } catch {}
};

// Called from App component when resizing
export const updateSidebarWidth = (width: number) => {
  const clampedWidth = clampWidth(width);
  sidebarWidth = clampedWidth;
  saveStoredWidth(clampedWidth);
  if (isUiShowing) {
    setMainUIStyle(clampedWidth, sidebarPosition);
    adjustMainContent(clampedWidth, sidebarPosition);
  }
};

export const getStoredSidebarWidth = () => getSidebarWidth();

export const getSidebarPosition = () => sidebarPosition;

export const toggleSidebarPosition = () => {
  sidebarPosition = sidebarPosition === "left" ? "right" : "left";
  saveStoredPosition(sidebarPosition);
  if (isUiShowing) {
    const width = getSidebarWidth();
    setMainUIStyle(width, sidebarPosition);
    adjustMainContent(width, sidebarPosition);
  }
  return sidebarPosition;
};

// Initialization
export const initializeSidebarStuff = () => {
  initSidebarPosition();
  injectGlobalStyleOverrides();
  cleanupLegacyArtifacts();
  injectLayoutBaseStyle();
  updateHostLayoutVars(0, sidebarPosition, false);
  initializeToolbar();
};

const injectGlobalStyleOverrides = () => {
  logseq.provideStyle(`
    #root { display: flex; }
    .theme-container { flex: 1; }
  `);
};

const cleanupLegacyArtifacts = () => {
  try {
    // Remove any previously injected spacer UI from older versions
    logseq.provideUI({ key: legacySpacerKey, path: "#root", template: "" });
  } catch {}
};

