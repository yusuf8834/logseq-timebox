import { useState, useRef, useEffect } from "react";
import packageJson from "../../../package.json" with { type: "json" };
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg, EventClickArg, CalendarApi, EventInput, EventContentArg } from "@fullcalendar/core";
import { closeSidebar } from "../../sidebar-stuff";
import { DB_CHANGED_EVENT } from "../../main";
import { 
  normalizeStartHour, 
  normalizeFirstDay, 
  normalizeMultiDaySpan, 
  formatDateForJournal, 
  formatScheduledDate, 
  parseDurationToken, 
  collapseNamespacesInTitle, 
  parseRepeater, 
  updateDurationTokenInContent 
} from "./calendarUtils";
import { CalendarEventContent } from "./CalendarEventContent";
import { fetchExternalIcs } from "./externalIcs";

interface CalendarViewProps {
  onTogglePosition?: () => void;
  position?: "left" | "right";
}

export type CalendarViewType = "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "timeGridMulti";

export function CalendarView({ onTogglePosition, position = "left" }: CalendarViewProps) {
  const [currentView, setCurrentView] = useState<CalendarViewType>("timeGridDay");
  const calendarRef = useRef<FullCalendar>(null);
  const [isCreatingBlock, setIsCreatingBlock] = useState(false);
  const [events, setEvents] = useState<EventInput[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Inline editing state
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [externalVisible, setExternalVisible] = useState<boolean>(() => (logseq as any)?.settings?.showExternalCalendars ?? true);
  useEffect(() => {
    if (!editingEventId) return;
    requestAnimationFrame(() => {
      const el = editInputRef.current;
      if (!el) return;
      const len = el.value.length;
      el.focus();
      el.setSelectionRange(len, len);
    });
  }, [editingEventId]);
  
  // Click tracking for single vs double click detection
  const clickTimeoutRef = useRef<number | null>(null);
  const lastClickedEventRef = useRef<string | null>(null);
  const [startOfDayHour, setStartOfDayHour] = useState<number>(() => normalizeStartHour((logseq as any)?.settings?.startOfDayHour));
  const [firstDayOfWeek, setFirstDayOfWeek] = useState<number>(() => normalizeFirstDay((logseq as any)?.settings?.firstDayOfWeek));
  const [multiDaySpan, setMultiDaySpan] = useState<number>(() => normalizeMultiDaySpan((logseq as any)?.settings?.multiDayViewSpan));
  
  // Click action settings: "none" | "edit" | "goto"
  const [clickAction, setClickAction] = useState<string>(() => (logseq as any)?.settings?.clickAction || "none");
  const [doubleClickAction, setDoubleClickAction] = useState<string>(() => (logseq as any)?.settings?.doubleClickAction || "goto");

  useEffect(() => {
    const unsubscribe = logseq?.onSettingsChanged?.((newSettings: any) => {
      if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "startOfDayHour")) {
        setStartOfDayHour(normalizeStartHour(newSettings.startOfDayHour));
      }
      if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "firstDayOfWeek")) {
        setFirstDayOfWeek(normalizeFirstDay(newSettings.firstDayOfWeek));
      }
      if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "multiDayViewSpan")) {
        setMultiDaySpan(normalizeMultiDaySpan(newSettings.multiDayViewSpan));
      }
      if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "showExternalCalendars")) {
        setExternalVisible(!!newSettings.showExternalCalendars);
        setTimeout(() => loadScheduledEvents(), 50);
      }
      if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "externalIcsUrls")) {
        setTimeout(() => loadScheduledEvents(), 50);
      }
      if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "clickAction")) {
        setClickAction(newSettings.clickAction || "none");
      }
      if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "doubleClickAction")) {
        setDoubleClickAction(newSettings.doubleClickAction || "goto");
      }
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

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
      left: "0",
      height: `calc(100vh - ${headerHeight}px)`,
    });
    setIsFullscreen(false);
  };

  const toggleFullscreen = () => {
    if (isFullscreen) exitFullscreen();
    else enterFullscreen();
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

      // Fetch external ICS if enabled
      let externalEvents: EventInput[] = [];
      if (externalVisible) {
        const urls = (((logseq as any)?.settings?.externalIcsUrls || "") as string)
          .split(/\r?\n/)
          .map((u) => u.trim())
          .filter(Boolean);
        if (urls.length) {
          externalEvents = await fetchExternalIcs(urls);
        }
      }

      setEvents([...calendarEvents, ...externalEvents]);
    } catch (error) {
      console.error("Error loading scheduled events:", error);
    }
  };

  useEffect(() => {
    loadScheduledEvents();

    // Listen for database changes from the main plugin context
    const handleDbChange = () => {
      loadScheduledEvents();
    };

    window.addEventListener(DB_CHANGED_EVENT, handleDbChange);

    return () => {
      window.removeEventListener(DB_CHANGED_EVENT, handleDbChange);
    };
  }, []);

  // Reload events when externalVisible changes
  useEffect(() => {
    loadScheduledEvents();
  }, [externalVisible]);

  // Allow ESC to save edit or exit fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editingEventId) {
          handleSaveEdit();
        } else if (isFullscreen) {
          exitFullscreen();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen, editingEventId]);

  // Cleanup click timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        window.clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  // Cancel editing when clicking on calendar background
  const handleCalendarClick = (e: React.MouseEvent) => {
    // Only cancel if clicking on empty calendar area, not on events
    const target = e.target as HTMLElement;
    if (!target.closest('.fc-event') && editingEventId) {
      handleSaveEdit();
    }
  };

  const handleDateSelect = async (selectInfo: DateSelectArg) => {
    // Create block when selecting a time range; store duration via [dur:...] token
    const hasTime = selectInfo.start.getHours() !== 0 || selectInfo.start.getMinutes() !== 0 ||
                    selectInfo.end.getHours() !== 0 || selectInfo.end.getMinutes() !== 0;
    
    // For month view clicks or all-day selections, treat as all-day
    const isAllDay = selectInfo.allDay || !hasTime;
    
    await createBlockInDailyPage(selectInfo.start, undefined, isAllDay, selectInfo.end ?? undefined);
    // Unselect after creating
    getCalendarApi()?.unselect();
  };

  // Navigate to block (used on double-click)
  const navigateToBlock = async (blockUuid: string) => {
    try {
      const block = await logseq.Editor.getBlock(blockUuid);
      if (block?.page) {
        const { id: pageId, originalName } = block.page;
        let pageName = originalName;
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
  };

  // Enter edit mode (used on single-click)
  const enterEditMode = async (blockUuid: string) => {
    try {
      const block = await logseq.Editor.getBlock(blockUuid);
      if (block) {
        const contentLines = (block.content || "").split("\n");
        const title = contentLines.find((line: string) => !line.startsWith("SCHEDULED:") && !line.startsWith("DEADLINE:")) || "";
        setEditingEventId(blockUuid);
        setEditingText(title);
        // Focus input after render
        setTimeout(() => editInputRef.current?.focus(), 50);
      }
    } catch (error) {
      console.error("Error entering edit mode:", error);
    }
  };

  // Save inline edit
  const handleSaveEdit = async () => {
    if (!editingEventId || !editingText.trim()) {
      setEditingEventId(null);
      setEditingText("");
      return;
    }

    try {
      const block = await logseq.Editor.getBlock(editingEventId);
      if (!block) {
        setEditingEventId(null);
        setEditingText("");
        return;
      }

      // Replace the title line while preserving SCHEDULED/DEADLINE lines
      const lines = (block.content || "").split("\n");
      const titleIndex = lines.findIndex((line: string) => !line.startsWith("SCHEDULED:") && !line.startsWith("DEADLINE:"));
      if (titleIndex !== -1) {
        lines[titleIndex] = editingText;
      } else {
        lines.unshift(editingText);
      }

      await logseq.Editor.updateBlock(editingEventId, lines.join("\n"));
      logseq.UI.showMsg("Event updated", "success");
      setTimeout(() => loadScheduledEvents(), 100);
    } catch (error) {
      console.error("Error updating event:", error);
      logseq.UI.showMsg(`Error updating event: ${error}`, "error");
    } finally {
      setEditingEventId(null);
      setEditingText("");
    }
  };

  // Perform action based on setting
  const performAction = async (action: string, blockUuid: string) => {
    if (action === "edit") {
      await enterEditMode(blockUuid);
    } else if (action === "goto") {
      await navigateToBlock(blockUuid);
    }
    // "none" does nothing
  };

  const handleEventClick = async (clickInfo: EventClickArg) => {
    const blockUuid = clickInfo.event.extendedProps.blockUuid;
    if (!blockUuid) return;
    if (clickInfo.event.extendedProps?.source === "external") return;

    // If already editing this event, do nothing (let the input handle it)
    if (editingEventId === blockUuid) return;

    // If editing another event, save it first
    if (editingEventId && editingEventId !== blockUuid) {
      await handleSaveEdit();
    }

    // Double-click detection
    if (lastClickedEventRef.current === blockUuid && clickTimeoutRef.current) {
      // Double-click detected
      window.clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      lastClickedEventRef.current = null;
      await performAction(doubleClickAction, blockUuid);
    } else {
      // First click - wait to see if it's a double-click
      lastClickedEventRef.current = blockUuid;
      clickTimeoutRef.current = window.setTimeout(() => {
        // Single click confirmed
        clickTimeoutRef.current = null;
        lastClickedEventRef.current = null;
        performAction(clickAction, blockUuid);
      }, 250);
    }
  };

  // Handle edit button click
  const handleEditClick = async (blockUuid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Clear any pending click timeout
    if (clickTimeoutRef.current) {
      window.clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      lastClickedEventRef.current = null;
    }
    await enterEditMode(blockUuid);
  };

  const handleEventDrop = async (dropInfo: any) => {
    const blockUuid = dropInfo.event.extendedProps.blockUuid;
    if (dropInfo.event.extendedProps?.source === "external") {
      dropInfo.revert();
      return;
    }
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

      // Preserve repeater pattern (e.g., ++1w, .+1d)
      const repeater = parseRepeater(block.content || "");
      const repeaterSuffix = repeater ? ` ${repeater}` : "";

      // Build new SCHEDULED with repeater preserved
      let newScheduledText = `SCHEDULED: <${formatScheduledDate(newDate, allDay)}${repeaterSuffix}>`;
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
    if (resizeInfo.event.extendedProps?.source === "external") {
      resizeInfo.revert();
      return;
    }
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

      // Preserve repeater pattern (e.g., ++1w, .+1d)
      const repeater = parseRepeater(block.content || "");
      const repeaterSuffix = repeater ? ` ${repeater}` : "";

      let newScheduledText = `SCHEDULED: <${formatScheduledDate(newStart, allDay)}${repeaterSuffix}>`;
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

  const handleClearSchedule = async (blockUuid: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event click from firing
    
    try {
      const block = await logseq.Editor.getBlock(blockUuid);
      if (!block) {
        logseq.UI.showMsg("Block not found", "error");
        return;
      }

      // Remove SCHEDULED line and duration token
      let updatedContent = block.content
        .split("\n")
        .filter((line: string) => !line.trim().startsWith("SCHEDULED:"))
        .join("\n");
      
      // Remove duration token [d:...]
      updatedContent = updatedContent.replace(/\s*\[d:[^\]]+\]/g, "");
      
      // Clean up any trailing whitespace
      updatedContent = updatedContent.trimEnd();

      await logseq.Editor.updateBlock(blockUuid, updatedContent);
      logseq.UI.showMsg("Schedule cleared", "success");
      
      // Reload events to reflect changes
      setTimeout(() => loadScheduledEvents(), 100);
    } catch (error) {
      console.error("Error clearing schedule:", error);
      logseq.UI.showMsg(`Error clearing schedule: ${error}`, "error");
    }
  };

  const renderEventContent = (eventInfo: EventContentArg) => (
    <CalendarEventContent
      eventInfo={eventInfo}
      editingEventId={editingEventId}
      editingText={editingText}
      editInputRef={editInputRef}
      hoveredEventId={hoveredEventId}
      setHoveredEventId={setHoveredEventId}
      setEditingText={setEditingText}
      handleSaveEdit={handleSaveEdit}
      handleClearSchedule={handleClearSchedule}
      handleEditClick={handleEditClick}
      collapseNamespacesInTitle={collapseNamespacesInTitle}
    />
  );

  const getCalendarApi = (): CalendarApi | null => {
    return calendarRef.current?.getApi() || null;
  };

  const goToTodayMinusOne = () => {
    const api = getCalendarApi();
    if (!api) return;
    const d = new Date();
    d.setDate(d.getDate() - 1);
    api.gotoDate(d);
  };
  const shiftByDays = (delta: number) => {
    const api = getCalendarApi();
    if (!api) return;
    const current = api.getDate();
    const next = new Date(current);
    next.setDate(next.getDate() + delta);
    api.gotoDate(next);
  };
  const handlePrev = () => {
    if (currentView === "timeGridDay" || currentView === "timeGridMulti") {
      shiftByDays(-1);
    } else {
      getCalendarApi()?.prev();
    }
  };
  const handleNext = () => {
    if (currentView === "timeGridDay" || currentView === "timeGridMulti") {
      shiftByDays(1);
    } else {
      getCalendarApi()?.next();
    }
  };

  useEffect(() => {
    if (currentView === "timeGridMulti") {
      getCalendarApi()?.changeView("timeGridMulti");
      goToTodayMinusOne();
    }
  }, [multiDaySpan]); 

  return (
    <div className="flex flex-col h-full" style={isFullscreen ? { marginLeft: '25%', marginRight: '25%', marginTop: 10, marginBottom: 10 } : undefined}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-logseq-cyan-low-saturation-800/70">
        <div className="flex items-center gap-2">
          <button
            onClick={() => logseq.showSettingsUI?.()}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70 text-gray-600 dark:text-logseq-cyan-low-saturation-300"
            title="Open settings"
            aria-label="Open settings"
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
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.3.31.48.73.49 1.17V10a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
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
            onClick={() => setExternalVisible((prev) => !prev)}
            className={`px-2 py-1 text-xs font-medium rounded-md ${externalVisible ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" : "bg-gray-100 dark:bg-logseq-cyan-low-saturation-800/50 text-gray-700 dark:text-logseq-cyan-low-saturation-300"}`}
            title="Toggle external calendars"
          >
            External {externalVisible ? "on" : "off"}
          </button>
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
          <button
            onClick={handlePrev}
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
            onClick={handleNext}
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
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
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
                setCurrentView("timeGridMulti");
                getCalendarApi()?.changeView("timeGridMulti");
                goToTodayMinusOne();
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${currentView === "timeGridMulti"
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                  : "text-gray-600 dark:text-logseq-cyan-low-saturation-400 hover:bg-gray-100 dark:hover:bg-logseq-cyan-low-saturation-800/50"
                }`}
            >
              {multiDaySpan}-day
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
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
          <button
            onClick={() => {
              getCalendarApi()?.today();
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 dark:bg-logseq-cyan-low-saturation-800/50 text-gray-700 dark:text-logseq-cyan-low-saturation-300 hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70"
          >
            Today
          </button>
          <button
            onClick={() => closeSidebar()}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70 text-gray-600 dark:text-logseq-cyan-low-saturation-300"
            title="Close panel"
            aria-label="Close panel"
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 overflow-hidden p-4" onClick={handleCalendarClick}>
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
          .fc-event:hover .fc-action-btn {
            opacity: 1 !important;
          }
          .fc-action-btn:hover {
            background-color: rgba(0,0,0,0.2) !important;
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
          views={{
            timeGridMulti: {
              type: "timeGrid",
              duration: { days: multiDaySpan },
              buttonText: `${multiDaySpan}-day`,
            },
          }}
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
          firstDay={firstDayOfWeek}
          slotMinTime={`${startOfDayHour.toString().padStart(2, '0')}:00:00`}
          scrollTime={`${startOfDayHour.toString().padStart(2, '0')}:00:00`}
          select={handleDateSelect}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventContent={renderEventContent}
          events={events}
          viewDidMount={(view: any) => {
            setCurrentView(view.view.type as CalendarViewType);
            if (view.view.type === "timeGridMulti") {
              goToTodayMinusOne();
            }
          }}
        />
      </div>
    </div>
  );
}
