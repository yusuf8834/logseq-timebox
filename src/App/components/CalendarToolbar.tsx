import React from "react";
import type { CalendarViewType } from "./CalendarView";

interface CalendarToolbarProps {
  currentView: CalendarViewType;
  multiDaySpan: number;
  isFullscreen: boolean;
  position: "left" | "right";
  externalVisible: boolean;
  onRefresh: () => void;
  onToggleFullscreen: () => void;
  onTogglePosition?: () => void;
  onToggleExternal: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectDay: () => void;
  onSelectMulti: () => void;
  onSelectWeek: () => void;
  onSelectMonth: () => void;
  onToday: () => void;
  onClose: () => void;
  onOpenSettings: () => void;
}

export const CalendarToolbar: React.FC<CalendarToolbarProps> = ({
  currentView,
  multiDaySpan,
  isFullscreen,
  position,
  externalVisible,
  onRefresh,
  onToggleFullscreen,
  onTogglePosition,
  onToggleExternal,
  onPrev,
  onNext,
  onSelectDay,
  onSelectMulti,
  onSelectWeek,
  onSelectMonth,
  onToday,
  onClose,
  onOpenSettings,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-1 px-2 py-2 border-b border-gray-200 dark:border-logseq-cyan-low-saturation-800/70">
      {/* Left group: Settings, Actions & Navigation */}
      <div className="flex flex-wrap items-center gap-1">
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70 text-gray-600 dark:text-logseq-cyan-low-saturation-300"
          title="Open settings"
          aria-label="Open settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.3.31.48.73.49 1.17V10a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </button>
        <button
          onClick={onRefresh}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70 text-gray-600 dark:text-logseq-cyan-low-saturation-300"
          title="Refresh events"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 21h5v-5" />
          </svg>
        </button>
        <button
          onClick={onToggleFullscreen}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70 text-gray-600 dark:text-logseq-cyan-low-saturation-300"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 9 3 9 3 3" /><line x1="3" y1="3" x2="10" y2="10" />
              <polyline points="15 9 21 9 21 3" /><line x1="14" y1="10" x2="21" y2="3" />
              <polyline points="15 15 21 15 21 21" /><line x1="14" y1="14" x2="21" y2="21" />
              <polyline points="9 15 3 15 3 21" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" /><line x1="21" y1="3" x2="14" y2="10" />
              <polyline points="9 3 3 3 3 9" /><line x1="3" y1="3" x2="10" y2="10" />
              <polyline points="21 15 21 21 15 21" /><line x1="21" y1="21" x2="14" y2="14" />
              <polyline points="3 15 3 21 9 21" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          )}
        </button>
        {onTogglePosition && (
          <button
            onClick={onTogglePosition}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70 text-gray-600 dark:text-logseq-cyan-low-saturation-300"
            title={position === "left" ? "Move panel to right" : "Move panel to left"}
          >
            {position === "left" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="15" y1="3" x2="15" y2="21" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            )}
          </button>
        )}
        <button
          onClick={onToggleExternal}
          className={`px-2 py-1 text-xs font-medium rounded-md whitespace-nowrap ${externalVisible ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" : "bg-gray-100 dark:bg-logseq-cyan-low-saturation-800/50 text-gray-700 dark:text-logseq-cyan-low-saturation-300"}`}
          title="Toggle external calendars"
        >
          External {externalVisible ? "on" : "off"}
        </button>
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5" />
        <button
          onClick={onPrev}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70 text-gray-600 dark:text-logseq-cyan-low-saturation-300"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M10 12 L6 8 L10 4" />
          </svg>
        </button>
        <button
          onClick={onNext}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70 text-gray-600 dark:text-logseq-cyan-low-saturation-300"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 4 L10 8 L6 12" />
          </svg>
        </button>
      </div>

      {/* Right group: View Selectors, Today & Close */}
      <div className="flex flex-wrap items-center gap-1">
        <div className="flex items-center gap-0.5">
          <button
            onClick={onSelectDay}
            className={`px-2 py-1 text-xs font-medium rounded-md capitalize transition-colors ${currentView === "timeGridDay"
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "text-gray-600 dark:text-logseq-cyan-low-saturation-400 hover:bg-gray-100 dark:hover:bg-logseq-cyan-low-saturation-800/50"
              }`}
          >
            Day
          </button>
          <button
            onClick={onSelectMulti}
            className={`px-2 py-1 text-xs font-medium rounded-md capitalize transition-colors ${currentView === "timeGridMulti"
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "text-gray-600 dark:text-logseq-cyan-low-saturation-400 hover:bg-gray-100 dark:hover:bg-logseq-cyan-low-saturation-800/50"
              }`}
          >
            {multiDaySpan}d
          </button>
          <button
            onClick={onSelectWeek}
            className={`px-2 py-1 text-xs font-medium rounded-md capitalize transition-colors ${currentView === "timeGridWeek"
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "text-gray-600 dark:text-logseq-cyan-low-saturation-400 hover:bg-gray-100 dark:hover:bg-logseq-cyan-low-saturation-800/50"
              }`}
          >
            Week
          </button>
          <button
            onClick={onSelectMonth}
            className={`px-2 py-1 text-xs font-medium rounded-md capitalize transition-colors ${currentView === "dayGridMonth"
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "text-gray-600 dark:text-logseq-cyan-low-saturation-400 hover:bg-gray-100 dark:hover:bg-logseq-cyan-low-saturation-800/50"
              }`}
          >
            Month
          </button>
        </div>
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5" />
        <button
          onClick={onToday}
          className="px-2 py-1 text-xs font-medium rounded-md bg-gray-100 dark:bg-logseq-cyan-low-saturation-800/50 text-gray-700 dark:text-logseq-cyan-low-saturation-300 hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70"
        >
          Today
        </button>
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70 text-gray-600 dark:text-logseq-cyan-low-saturation-300"
          title="Close panel"
          aria-label="Close panel"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
};
