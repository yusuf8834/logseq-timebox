import packageJson from "../package.json" with { type: "json" };

const providedUiIdBase = "simple-sidebar-plugin";
const legacySpacerKey = `${providedUiIdBase}-spacer`;

const applicationId = packageJson.logseq.id;

const sidebarWidthStorageKey = `${applicationId}-sidebar-width`;

const defaultWidth = 400;
const MIN_WIDTH = 300;

// Removed spacer logic; overlay now floats below header without shifting layout.

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

// Main UI helpers
const setMainUIStyle = (width: number) => {
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
    left: `calc(100vw - ${px})`,
    height: `calc(100vh - ${headerHeight}px)`,
  });
};

// UI
const displayUI = () => {
  isUiShowing = true;

  logseq.showMainUI();

  setMainUIStyle(getSidebarWidth());
};

const hideUI = () => {
  isUiShowing = false;

  logseq.hideMainUI();
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

// Initialization
export const initializeSidebarStuff = () => {
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

