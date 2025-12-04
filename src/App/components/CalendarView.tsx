import { useState, useRef, useEffect } from "react";
import packageJson from "../../../package.json" with { type: "json" };
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg, EventClickArg, CalendarApi, EventInput } from "@fullcalendar/core";

export function CalendarView() {
  const [currentView, setCurrentView] = useState<"dayGridMonth" | "timeGridWeek" | "timeGridDay">("timeGridDay");
  const calendarRef = useRef<FullCalendar>(null);
  const [isCreatingBlock, setIsCreatingBlock] = useState(false);
  const [events, setEvents] = useState<EventInput[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sidebar width restore helpers (mirror sidebar-stuff.ts minimal logic)
  const applicationId = packageJson.logseq.id as string;
  const sidebarWidthStorageKey = `${applicationId}-sidebar-width`;
  const MIN_WIDTH = 300;
  const defaultWidth = 400;
  const clampWidth = (w: number) => Math.max(MIN_WIDTH, w);
  const readStoredWidth = () => {
    try {
      const raw = window.parent?.window?.localStorage?.getItem(sidebarWidthStorageKey);
      if (!raw) return defaultWidth;
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? clampWidth(parsed) : defaultWidth;
    } catch {
      return defaultWidth;
    }
  };

  const computeHeaderHeight = () => {
    const headerEl = window.parent?.document?.querySelector('.cp__header') as HTMLElement | null;
    return headerEl?.offsetHeight ?? 40;
  };

  const enterFullscreen = () => {
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
  };

  const exitFullscreen = () => {
    const px = `${readStoredWidth()}px`;
    const headerHeight = computeHeaderHeight();
    logseq.setMainUIInlineStyle({
      position: "absolute",
      zIndex: 11,
      width: px,
      top: `${headerHeight}px`,
      left: `calc(100vw - ${px})`,
      height: `calc(100vh - ${headerHeight}px)`,
    });
    setIsFullscreen(false);
  };

  const toggleFullscreen = () => {
    if (isFullscreen) exitFullscreen();
    else enterFullscreen();
  };

  const formatDateForJournal = (date: Date, format: string): string => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    const getOrdinal = (n: number) => {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    const tokens: Record<string, string> = {
      yyyy: String(year),
      MMMM: date.toLocaleDateString("en-US", { month: "long" }),
      MMM: date.toLocaleDateString("en-US", { month: "short" }),
      MM: String(month).padStart(2, "0"),
      M: String(month),
      dd: String(day).padStart(2, "0"),
      do: getOrdinal(day),
      d: String(day),
      EEEE: date.toLocaleDateString("en-US", { weekday: "long" }),
      EEE: date.toLocaleDateString("en-US", { weekday: "short" }),
    };

    const regex = /yyyy|MMMM|MMM|MM|M|dd|do|d|EEEE|EEE/g;

    return format.replace(regex, (match) => tokens[match]);
  };

  const formatScheduledDate = (date: Date, allDay: boolean): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dayName = date.toLocaleDateString("en-US", { weekday: "short" });

    if (allDay) {
      return `${year}-${month}-${day} ${dayName}`;
    } else {
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${year}-${month}-${day} ${dayName} ${hours}:${minutes}`;
    }
  };

  // Compact duration token helper: "[d:1h15m]" (write/read)
  const formatDurationToken = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `[d:${h}h${m}m]`;
    if (h > 0) return `[d:${h}h]`;
    return `[d:${m}m]`;
  };

  const parseDurationToken = (content: string): number | null => {
    const match = content.match(/\[d:([0-9hHmM]+)\]/);
    if (!match) return null;
    const spec = match[1];
    let total = 0;
    const hMatch = spec.match(/(\d+)h/i);
    const mMatch = spec.match(/(\d+)m/i);
    if (hMatch) total += parseInt(hMatch[1], 10) * 60;
    if (mMatch) total += parseInt(mMatch[1], 10);
    if (total === 0 && /^\d+$/.test(spec)) total = parseInt(spec, 10);
    return Number.isFinite(total) && total > 0 ? total : null;
  };

  const updateDurationTokenInContent = (content: string, minutes: number | null): string => {
    const lines = (content || "").split("\n");
    if (lines.length === 0) return content;
    const firstIndex = lines.findIndex((l) => !/^\s*(SCHEDULED:|DEADLINE:)/.test(l));
    const idx = firstIndex === -1 ? 0 : firstIndex;
    let title = lines[idx] || "";
    // remove existing [d:...] tokens
    title = title.replace(/\s*\[d:[^\]]+\]/g, "").trimEnd();
    if (minutes && minutes > 0) {
      title = `${title} ${formatDurationToken(minutes)}`;
    }
    lines[idx] = title;
    return lines.join("\n");
  };

  const createBlockInDailyPage = async (date: Date, content?: string, allDay: boolean = false, endDate?: Date) => {
    if (isCreatingBlock) return;

    try {
      setIsCreatingBlock(true);

      // Normalize date to local date (remove time component for journal page lookup)
      const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

      // Get user's preferred date format from Logseq config
      const userConfigs = await logseq.App.getUserConfigs();
      const preferredDateFormat = userConfigs?.preferredDateFormat || "yyyy-MM-dd EEE";

      // Format the date according to user's preference
      const journalName = formatDateForJournal(normalizedDate, preferredDateFormat);

      // Try to get the journal page
      let page = await logseq.Editor.getPage(journalName);

      // If page doesn't exist, try to create it
      if (!page) {
        page = await logseq.Editor.createPage(journalName, {}, { journal: true });
      }

      if (!page) {
        logseq.UI.showMsg(`Failed to get or create journal page for ${normalizedDate.toLocaleDateString()}`, "error");
        setIsCreatingBlock(false);
        return;
      }

      // Use provided content or default to "TODO new todo from calendar ui"
      let todoText = content || "TODO new todo from calendar ui";

      // Compute compact duration token for title when timed selection has end
      if (!allDay && endDate && endDate.getTime() > date.getTime()) {
        const durMins = Math.round((endDate.getTime() - date.getTime()) / 60000);
        todoText = updateDurationTokenInContent(todoText, durMins);
      } else {
        todoText = updateDurationTokenInContent(todoText, null);
      }

      // SCHEDULED line without duration
      const scheduledText = `SCHEDULED: <${formatScheduledDate(date, allDay)}>`;

      // Format: title with [d:...] on first line, SCHEDULED on second line
      const blockContent = `${todoText}\n${scheduledText}`;

      // Create a new block in the daily page
      const block = await logseq.Editor.appendBlockInPage(
        page.uuid,
        blockContent
      );

      if (block) {
        // Reload events to show the new scheduled block
        loadScheduledEvents();
        // Navigate to the journal page
        await logseq.Editor.scrollToBlockInPage(page.name, block.uuid);
        logseq.UI.showMsg(`Block created in ${date.toLocaleDateString()}`, "success");
      } else {
        logseq.UI.showMsg("Failed to create block", "error");
      }
    } catch (error) {
      console.error("Error creating block:", error);
      logseq.UI.showMsg(`Error: ${error}`, "error");
    } finally {
      setIsCreatingBlock(false);
    }
  };

  const parseScheduledTime = (content: string): { date: Date; allDay: boolean; durationMins?: number } | null => {
    // Parse SCHEDULED: <YYYY-MM-DD ddd HH:mm> or SCHEDULED: <YYYY-MM-DD ddd>
    const scheduledMatch = content.match(/SCHEDULED:\s*<([^>]+)>/);
    if (!scheduledMatch) return null;

    const scheduledStr = scheduledMatch[1];
    // Extract date and optional time
    const dateTimeMatch = scheduledStr.match(/(\d{4}-\d{2}-\d{2})\s+\w+\s*(\d{2}:\d{2})?/);
    if (!dateTimeMatch) return null;

    const dateStr = dateTimeMatch[1];
    const timeStr = dateTimeMatch[2];
    const allDay = !timeStr;

    if (allDay) {
      const date = new Date(dateStr + "T00:00:00");
      return { date, allDay: true };
    } else {
      const date = new Date(dateStr + "T" + timeStr + ":00");
      // Try to parse duration token [d:...]
      const durationMins = parseDurationToken(content) ?? undefined;
      return { date, allDay: false, durationMins };
    }
  };

  const loadScheduledEvents = async () => {
    try {
      // Query blocks with scheduled property
      const scheduledBlocks = await logseq.DB.datascriptQuery(`
        [:find (pull
          ?block
          [:block/uuid
            :block/content
            :block/marker
            :block/scheduled
            :block/deadline
            {:block/page
              [:db/id :block/name :block/original-name :block/journal-day :block/journal?]}])
          :where
          [?block :block/scheduled]
          (or-join [?block]
            (and
              [?block :block/marker ?marker]
              [(contains? #{"TODO" "DOING" "NOW" "LATER" "WAITING" "DONE" "CANCELED"} ?marker)])
            [(missing? $ ?block :block/marker)])]
      `);

      if (!scheduledBlocks || scheduledBlocks.length === 0) {
        setEvents([]);
        return;
      }

      const calendarEvents: EventInput[] = [];

      for (const result of scheduledBlocks) {
        const block = result[0];
        if (!block || !block.scheduled) continue;

        // Parse scheduled date
        let scheduledInfo = parseScheduledTime(block.content || "");
        if (!scheduledInfo) {
          // Fallback to block.scheduled property (YYYYMMDD format)
          const scheduledStr = String(block.scheduled);
          const year = parseInt(scheduledStr.substring(0, 4));
          const month = parseInt(scheduledStr.substring(4, 6)) - 1;
          const day = parseInt(scheduledStr.substring(6, 8));
          scheduledInfo = { date: new Date(year, month, day), allDay: true };
        }

        // Get block title (first line of content without SCHEDULED)
        const contentLines = (block.content || "").split("\n");
        const title = contentLines.find((line: string) => !line.startsWith("SCHEDULED:") && !line.startsWith("DEADLINE:")) || "Untitled";
        const cleanTitle = title.replace(/^\[(TODO|DOING|NOW|LATER|WAITING|DONE|CANCELED)\]\s*/, "").trim();

        const event: EventInput = {
          id: block.uuid,
          title: cleanTitle,
          start: scheduledInfo.date.toISOString(),
          allDay: scheduledInfo.allDay,
          extendedProps: {
            blockUuid: block.uuid,
            marker: block.marker,
          },
        };

        // Set soft green background for DONE tasks
        if (block.marker === "DONE") {
          event.backgroundColor = "#d1f4d1";
          event.borderColor = "#a3e4a3";
          event.textColor = "#2d5f2d";
        } else if (block.marker === "DOING") {
          event.backgroundColor = "#ffe4cc";
          event.borderColor = "#ffb366";
          event.textColor = "#994d00";
        } else {
          // Sweet blue for all other tasks (TODO, NOW, etc.)
          event.backgroundColor = "#cce7ff";
          event.borderColor = "#66b3ff";
          event.textColor = "#004d99";
        }

        if (!scheduledInfo.allDay) {
          const durMins = (scheduledInfo as any).durationMins as number | undefined;
          if (durMins && durMins > 0) {
            const end = new Date(scheduledInfo.date.getTime() + durMins * 60000);
            event.end = end.toISOString();
          }
        }

        calendarEvents.push(event);
      }

      setEvents(calendarEvents);
    } catch (error) {
      console.error("Error loading scheduled events:", error);
    }
  };

  useEffect(() => {
    loadScheduledEvents();

    // Reload events when database changes
    let timeoutId: number;
    const unsubscribe = logseq.DB.onChanged(() => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        loadScheduledEvents();
      }, 500);
    });

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  // Allow ESC to exit fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        exitFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  const handleDateClick = async (clickInfo: any) => {
    // Create block when clicking on a date (all-day event)
    await createBlockInDailyPage(clickInfo.date, undefined, true);
  };

  const handleDateSelect = async (selectInfo: DateSelectArg) => {
    // Create block when selecting a time range; store duration via [dur:...] token
    const hasTime = selectInfo.start.getHours() !== 0 || selectInfo.start.getMinutes() !== 0;
    await createBlockInDailyPage(selectInfo.start, undefined, !hasTime, selectInfo.end ?? undefined);
    // Unselect after creating
    getCalendarApi()?.unselect();
  };

  const handleEventClick = async (clickInfo: EventClickArg) => {
    const blockUuid = clickInfo.event.extendedProps.blockUuid;
    if (blockUuid) {
      try {
        const block = await logseq.Editor.getBlock(blockUuid);
        if (block?.page) {
          const { id: pageId, originalName } = block.page;
          let pageName = originalName;
          // If originalName is not available, fetch the page data
          if (!pageName) {
            const page = await logseq.Editor.getPage(pageId);
            pageName = page?.originalName || page?.name;
          }
          if (pageName) {
            await logseq.Editor.scrollToBlockInPage(pageName, blockUuid);
          }
        }
      } catch (error) {
        console.error("Error navigating to block:", error);
      }
    }
  };

  const handleEventDrop = async (dropInfo: any) => {
    const blockUuid = dropInfo.event.extendedProps.blockUuid;
    const newDate = dropInfo.event.start;
    const allDay = dropInfo.event.allDay;

    if (!blockUuid || !newDate) {
      dropInfo.revert();
      return;
    }

    try {
      const block = await logseq.Editor.getBlock(blockUuid);
      if (!block) {
        logseq.UI.showMsg("Block not found", "error");
        dropInfo.revert();
        return;
      }

      // Preserve duration if present; otherwise compute from event end if available
      const existingDur = parseDurationToken(block.content || "");
      const eventEnd: Date | null = dropInfo.event.end || null;
      const computedDur = !allDay && eventEnd ? Math.max(1, Math.round((eventEnd.getTime() - newDate.getTime()) / 60000)) : null;
      const durMins = existingDur ?? computedDur;

      // Build new SCHEDULED (no duration on this line)
      let newScheduledText = `SCHEDULED: <${formatScheduledDate(newDate, allDay)}>`;
      let updatedContent = block.content.replace(/SCHEDULED:\s*<[^>]+>(?:\s*\[d:[^\]]+\])?/, newScheduledText);

      // Ensure duration token is on the title line
      updatedContent = updateDurationTokenInContent(updatedContent, !allDay && durMins ? durMins : null);

      await logseq.Editor.updateBlock(blockUuid, updatedContent);
      logseq.UI.showMsg("Event moved successfully", "success");
      
      // Reload events to reflect changes
      setTimeout(() => loadScheduledEvents(), 100);
    } catch (error) {
      console.error("Error moving event:", error);
      logseq.UI.showMsg(`Error moving event: ${error}`, "error");
      dropInfo.revert();
    }
  };

  const handleEventResize = async (resizeInfo: any) => {
    const blockUuid = resizeInfo.event.extendedProps.blockUuid;
    const newStart = resizeInfo.event.start;
    const newEnd = resizeInfo.event.end;
    const allDay = resizeInfo.event.allDay;

    if (!blockUuid || !newStart) {
      resizeInfo.revert();
      return;
    }

    try {
      const block = await logseq.Editor.getBlock(blockUuid);
      if (!block) {
        logseq.UI.showMsg("Block not found", "error");
        resizeInfo.revert();
        return;
      }

      // Compute duration from resize and update token
      let durMins: number | null = null;
      if (!allDay && newEnd) {
        durMins = Math.max(1, Math.round((newEnd.getTime() - newStart.getTime()) / 60000));
      }

      let newScheduledText = `SCHEDULED: <${formatScheduledDate(newStart, allDay)}>`;
      let updatedContent = block.content.replace(/SCHEDULED:\s*<[^>]+>(?:\s*\[d:[^\]]+\])?/, newScheduledText);
      // Update/insert [d:...] token on the title line
      updatedContent = updateDurationTokenInContent(updatedContent, !allDay && durMins ? durMins : null);

      await logseq.Editor.updateBlock(blockUuid, updatedContent);
      logseq.UI.showMsg("Event resized successfully", "success");
      
      // Reload events to reflect changes
      setTimeout(() => loadScheduledEvents(), 100);
    } catch (error) {
      console.error("Error resizing event:", error);
      logseq.UI.showMsg(`Error resizing event: ${error}`, "error");
      resizeInfo.revert();
    }
  };

  const getCalendarApi = (): CalendarApi | null => {
    return calendarRef.current?.getApi() || null;
  };

  return (
    <div className="flex flex-col h-full" style={isFullscreen ? { marginLeft: '25%', marginRight: '25%', marginTop: 10, marginBottom: 10 } : undefined}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-logseq-cyan-low-saturation-800/70">
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadScheduledEvents()}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70 text-gray-600 dark:text-logseq-cyan-low-saturation-300"
            title="Refresh events"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
          </button>
          <button
            onClick={toggleFullscreen}
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
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
          <button
            onClick={() => {
              getCalendarApi()?.prev();
            }}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70 text-gray-600 dark:text-logseq-cyan-low-saturation-300"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M10 12 L6 8 L10 4" />
            </svg>
          </button>
          <button
            onClick={() => {
              getCalendarApi()?.next();
            }}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70 text-gray-600 dark:text-logseq-cyan-low-saturation-300"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 4 L10 8 L6 12" />
            </svg>
          </button>
        </div>
        <button
          onClick={() => {
            getCalendarApi()?.today();
          }}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 dark:bg-logseq-cyan-low-saturation-800/50 text-gray-700 dark:text-logseq-cyan-low-saturation-300 hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70"
        >
          Today
        </button>
      </div>

      {/* View Switcher */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 dark:border-logseq-cyan-low-saturation-800/70">
        <button
          onClick={() => {
            setCurrentView("timeGridDay");
            getCalendarApi()?.changeView("timeGridDay");
          }}
          className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${currentView === "timeGridDay"
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : "text-gray-600 dark:text-logseq-cyan-low-saturation-400 hover:bg-gray-100 dark:hover:bg-logseq-cyan-low-saturation-800/50"
            }`}
        >
          Day
        </button>
        <button
          onClick={() => {
            setCurrentView("timeGridWeek");
            getCalendarApi()?.changeView("timeGridWeek");
          }}
          className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${currentView === "timeGridWeek"
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : "text-gray-600 dark:text-logseq-cyan-low-saturation-400 hover:bg-gray-100 dark:hover:bg-logseq-cyan-low-saturation-800/50"
            }`}
        >
          Week
        </button>
        <button
          onClick={() => {
            setCurrentView("dayGridMonth");
            getCalendarApi()?.changeView("dayGridMonth");
          }}
          className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${currentView === "dayGridMonth"
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : "text-gray-600 dark:text-logseq-cyan-low-saturation-400 hover:bg-gray-100 dark:hover:bg-logseq-cyan-low-saturation-800/50"
            }`}
        >
          Month
        </button>
      </div>

      {/* Calendar */}
      <div className="flex-1 overflow-hidden p-4">
        <style>{`
          .fc {
            height: 100%;
            font-family: inherit;
          }
          .fc-header-toolbar {
            display: none;
          }
          .fc-theme-standard td,
          .fc-theme-standard th {
            border-color: rgb(229 231 235);
          }
          .dark .fc-theme-standard td,
          .dark .fc-theme-standard th {
            border-color: rgba(134, 239, 172, 0.1);
          }
          .fc-day-today {
            background-color: rgb(239 246 255) !important;
          }
          .dark .fc-day-today {
            background-color: rgba(59, 130, 246, 0.1) !important;
          }
          .fc-col-header-cell {
            background-color: transparent;
            padding: 8px 4px;
            font-weight: 500;
            color: rgb(55 65 81);
          }
          .dark .fc-col-header-cell {
            color: rgb(200, 210, 220);
          }
          .fc-daygrid-day-number,
          .fc-timegrid-slot-label {
            color: rgb(75 85 99);
          }
          .dark .fc-daygrid-day-number,
          .dark .fc-timegrid-slot-label {
            color: rgb(156 163 175);
          }
          .fc-button {
            background-color: rgb(59 130 246);
            border-color: rgb(37 99 235);
          }
          .fc-button:hover {
            background-color: rgb(37 99 235);
          }
          .fc-event {
            background-color: rgb(59 130 246);
            border-color: rgb(37 99 235);
          }
          .fc-timegrid-now-indicator-line {
            border-color: rgb(239 68 68);
            border-width: 2px;
          }
          .fc-timegrid-now-indicator-arrow {
            border-color: rgb(239 68 68);
          }
        `}</style>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={currentView}
          headerToolbar={false}
          height="100%"
          selectable={true}
          selectMirror={true}
          dayMaxEvents={true}
          weekends={true}
          editable={true}
          eventDurationEditable={true}
          eventStartEditable={true}
          nowIndicator={true}
          slotLabelFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }}
          eventTimeFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }}
          dateClick={handleDateClick}
          select={handleDateSelect}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          events={events}
          viewDidMount={(view: any) => {
            setCurrentView(view.view.type as "dayGridMonth" | "timeGridWeek" | "timeGridDay");
          }}
        />
      </div>
    </div>
  );
}
