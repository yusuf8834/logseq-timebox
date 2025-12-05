import packageJson from "../package.json" with { type: "json" };

const providedUiIdBase = "simple-sidebar-plugin";
const legacySpacerKey = `${providedUiIdBase}-spacer`;

const applicationId = packageJson.logseq.id;

const sidebarWidthStorageKey = `${applicationId}-sidebar-width`;
const sidebarPositionStorageKey = `${applicationId}-sidebar-position`;

const defaultWidth = 400;
const MIN_WIDTH = 300;

// Removed spacer logic; overlay now floats below header without shifting layout.

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

// Spacer logic removed to avoid affecting header/window controls and layout gaps

// Adjust main content area to make room for sidebar
const adjustMainContent = (width: number, position: "left" | "right") => {
  const doc = getParentViewportDocument();
  if (!doc) return;
  
  // Target the main content container
  const mainContent = doc.querySelector('#main-content-container') as HTMLElement | null;
  if (mainContent) {
    if (position === "left") {
      mainContent.style.marginLeft = `${width}px`;
      mainContent.style.marginRight = '';
    } else {
      mainContent.style.marginRight = `${width}px`;
      mainContent.style.marginLeft = '';
    }
    mainContent.style.transition = 'margin 0.15s ease';
  }
};

const resetMainContent = () => {
  const doc = getParentViewportDocument();
  if (!doc) return;
  
  const mainContent = doc.querySelector('#main-content-container') as HTMLElement | null;
  if (mainContent) {
    mainContent.style.marginLeft = '';
    mainContent.style.marginRight = '';
    mainContent.style.transition = '';
  }
};

// Main UI helpers
const setMainUIStyle = (width: number, position: "left" | "right") => {
  const px = `${width}px`;

  // Detect header height so overlay starts below it (keeps top buttons clickable)
  const doc = getParentViewportDocument();
  const headerEl = doc?.querySelector('.cp__header') as HTMLElement | null;
  const headerHeight = headerEl?.offsetHeight ?? 40;

  logseq.setMainUIInlineStyle({
    position: "absolute",
    zIndex: 11,
    width: px,
    top: `${headerHeight}px`,
    left: position === "left" ? "0" : `calc(100vw - ${px})`,
    height: `calc(100vh - ${headerHeight}px)`,
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
      <a class="button relative" data-on-click="toggle" title="Logseq Timebox" aria-label="Logseq Timebox" data-rect-tooltip="Logseq Timebox">
        <span class="${iconName}"><i class="ti ti-list-details"></i></span>
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

  try {
    // Clear any header padding-right left by older versions
    const doc = getParentViewportDocument();
    const headerEl = doc?.querySelector('.cp__header') as HTMLElement | null;
    if (headerEl) headerEl.style.paddingRight = "";
  } catch {}
};

