import { useState, useCallback } from "react";
import { getStoredSidebarWidth } from "../../../sidebar-stuff";

const computeHeaderHeight = (): number => {
  const headerEl = window.parent?.document?.querySelector('.cp__header') as HTMLElement | null;
  return headerEl?.offsetHeight ?? 40;
};

interface UseFullscreenReturn {
  isFullscreen: boolean;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  toggleFullscreen: () => void;
}

export function useFullscreen(): UseFullscreenReturn {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const enterFullscreen = useCallback(() => {
    const headerHeight = computeHeaderHeight();
    logseq.setMainUIInlineStyle({
      position: "absolute",
      zIndex: 11,
      width: "100vw",
      top: `${headerHeight}px`,
      left: "0",
      height: `calc(100vh - ${headerHeight}px)`,
    });
    setIsFullscreen(true);
  }, []);

  const exitFullscreen = useCallback(() => {
    const px = `${getStoredSidebarWidth()}px`;
    const headerHeight = computeHeaderHeight();
    logseq.setMainUIInlineStyle({
      position: "absolute",
      zIndex: 11,
      width: px,
      top: `${headerHeight}px`,
      left: "0",
      height: `calc(100vh - ${headerHeight}px)`,
    });
    setIsFullscreen(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  return {
    isFullscreen,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  };
}

