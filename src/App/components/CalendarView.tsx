import { useState, useRef, useEffect, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg, EventClickArg, CalendarApi, EventContentArg, EventDropArg, ViewMountArg } from "@fullcalendar/core";
import type { EventResizeDoneArg, EventDragStopArg } from "@fullcalendar/interaction";
import { closeSidebar } from "../../sidebar-stuff";
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
import { CalendarToolbar } from "./CalendarToolbar";
import { useScheduledEvents } from "./hooks/useScheduledEvents";
import { useInlineEdit } from "./hooks/useInlineEdit";

interface CalendarViewProps {
  onTogglePosition?: () => void;
  position?: "left" | "right";
}

export type CalendarViewType = "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "timeGridMulti";
export type ClickAction = "none" | "edit" | "goto";

export function CalendarView({ onTogglePosition, position = "left" }: CalendarViewProps) {
  const [currentView, setCurrentView] = useState<CalendarViewType>("timeGridDay");
  const calendarRef = useRef<FullCalendar>(null);
  const [isCreatingBlock, setIsCreatingBlock] = useState(false);
  
  // Use the scheduled events hook
  const { events, externalVisible, setExternalVisible, refreshEvents, setIsDragging, updateEventOptimistically } = useScheduledEvents();
  
  // Use the inline edit hook
  const {
    editingEventId,
    editingText,
    editInputRef,
    hoveredEventId,
    setHoveredEventId,
    setEditingText,
    enterEditMode,
    handleSaveEdit,
  } = useInlineEdit(refreshEvents);
  
  // Click tracking for single vs double click detection
  const clickTimeoutRef = useRef<number | null>(null);
  const lastClickedEventRef = useRef<string | null>(null);
  const dragDropTriggeredRef = useRef<boolean>(false);
  const dragOffsetRef = useRef<number>(0);
  const [startOfDayHour, setStartOfDayHour] = useState<number>(() => normalizeStartHour((logseq as any)?.settings?.startOfDayHour));
  const [firstDayOfWeek, setFirstDayOfWeek] = useState<number>(() => normalizeFirstDay((logseq as any)?.settings?.firstDayOfWeek));
  const [multiDaySpan, setMultiDaySpan] = useState<number>(() => normalizeMultiDaySpan((logseq as any)?.settings?.multiDayViewSpan));
  
  // Click action settings
  const [clickAction, setClickAction] = useState<ClickAction>(() => ((logseq as any)?.settings?.clickAction || "none") as ClickAction);
  const [doubleClickAction, setDoubleClickAction] = useState<ClickAction>(() => ((logseq as any)?.settings?.doubleClickAction || "goto") as ClickAction);

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
      if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "clickAction")) {
        setClickAction((newSettings.clickAction || "none") as ClickAction);
      }
      if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "doubleClickAction")) {
        setDoubleClickAction((newSettings.doubleClickAction || "goto") as ClickAction);
      }
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const createBlockInDailyPage = useCallback(async (date: Date, content?: string, allDay: boolean = false, endDate?: Date) => {
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
        refreshEvents();
        // Navigate to the journal page
        await logseq.Editor.scrollToBlockInPage(page.name, block.uuid);
        logseq.UI.showMsg(`Block created in ${date.toLocaleDateString()}`, "success");
      } else {
        logseq.UI.showMsg("Failed to create block", "error");
      }
    } catch (error) {
      logseq.UI.showMsg(`Error: ${error}`, "error");
    } finally {
      setIsCreatingBlock(false);
    }
  }, [isCreatingBlock, refreshEvents]);

  // Allow ESC to save edit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && editingEventId) {
        handleSaveEdit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingEventId, handleSaveEdit]);

  // Cleanup click timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        window.clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  // Cancel editing when clicking on calendar background
  const handleCalendarClick = useCallback((e: React.MouseEvent) => {
    // Only cancel if clicking on empty calendar area, not on events
    const target = e.target as HTMLElement;
    if (!target.closest('.fc-event') && editingEventId) {
      handleSaveEdit();
    }
  }, [editingEventId, handleSaveEdit]);

  const handleDateSelect = useCallback(async (selectInfo: DateSelectArg) => {
    // Create block when selecting a time range; store duration via [dur:...] token
    const hasTime = selectInfo.start.getHours() !== 0 || selectInfo.start.getMinutes() !== 0 ||
                    selectInfo.end.getHours() !== 0 || selectInfo.end.getMinutes() !== 0;
    
    // For month view clicks or all-day selections, treat as all-day
    const isAllDay = selectInfo.allDay || !hasTime;
    
    await createBlockInDailyPage(selectInfo.start, undefined, isAllDay, selectInfo.end ?? undefined);
    // Unselect after creating
    getCalendarApi()?.unselect();
  }, [createBlockInDailyPage]);

  // Navigate to block (used on double-click)
  const navigateToBlock = useCallback(async (blockUuid: string) => {
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
    } catch {
    }
  }, []);

  // Perform action based on setting
  const performAction = useCallback(async (action: ClickAction, blockUuid: string) => {
    if (action === "edit") {
      await enterEditMode(blockUuid);
    } else if (action === "goto") {
      await navigateToBlock(blockUuid);
    }
    // "none" does nothing
  }, [enterEditMode, navigateToBlock]);

  const handleEventClick = useCallback(async (clickInfo: EventClickArg) => {
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
  }, [editingEventId, handleSaveEdit, performAction, doubleClickAction, clickAction]);

  // Handle edit button click
  const handleEditClick = useCallback(async (blockUuid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Clear any pending click timeout
    if (clickTimeoutRef.current) {
      window.clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      lastClickedEventRef.current = null;
    }
    await enterEditMode(blockUuid);
  }, [enterEditMode]);

  const moveEvent = useCallback(async (blockUuid: string, newDate: Date, allDay: boolean, eventEnd: Date | null) => {
    // Optimistic update
    updateEventOptimistically({
      id: blockUuid,
      start: newDate.toISOString(),
      end: eventEnd?.toISOString(),
      allDay: allDay
    });

    try {
      const block = await logseq.Editor.getBlock(blockUuid);
      if (!block) {
        logseq.UI.showMsg("Block not found", "error");
        return;
      }

      // Preserve duration if present; otherwise compute from event end if available
      const existingDur = parseDurationToken(block.content || "");
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
      refreshEvents();
    } catch (error) {
      logseq.UI.showMsg(`Error moving event: ${error}`, "error");
      refreshEvents();
    }
  }, [refreshEvents, updateEventOptimistically]);

  const handleEventDrop = useCallback(async (dropInfo: EventDropArg) => {
    dragDropTriggeredRef.current = true;
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

    await moveEvent(blockUuid, newDate, allDay, dropInfo.event.end);
  }, [moveEvent]);

  const inferDateFromPoint = useCallback((x: number, y: number): { date: Date, allDay: boolean } | null => {
    const elements = document.elementsFromPoint(x, y);
    
    // Look for timegrid slot
    const timeSlot = elements.find(el => el.getAttribute('data-time'));
    // Look for daygrid day
    const daySlot = elements.find(el => el.getAttribute('data-date'));

    if (timeSlot) {
      const timeStr = timeSlot.getAttribute('data-time');
      // Find the column to get the date
      const col = elements.find(el => el.classList.contains('fc-timegrid-col') && el.getAttribute('data-date'));
      const dateStr = col?.getAttribute('data-date');
      
      if (dateStr && timeStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        const [hours, minutes, seconds] = timeStr.split(':').map(Number);
        return { 
          date: new Date(year, month - 1, day, hours, minutes, seconds), 
          allDay: false 
        };
      }
    } else if (daySlot) {
      const dateStr = daySlot.getAttribute('data-date');
      if (dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        return { 
          date: new Date(year, month - 1, day), 
          allDay: true 
        };
      }
    }
    return null;
  }, []);

  const handleDragStop = useCallback((info: EventDragStopArg) => {
    setIsDragging(false);
    
    // Capture necessary data synchronously
    const { jsEvent, event } = info;
    const x = jsEvent.clientX;
    const y = jsEvent.clientY;
    const blockUuid = event.extendedProps.blockUuid;
    const eventStart = event.start;
    const eventEnd = event.end;

    // Wait a tick to see if eventDrop fires first
    setTimeout(() => {
      // If eventDrop fired, we're good
      if (dragDropTriggeredRef.current) return;

      // Fallback: try to infer drop target from pointer location
      
      const inferred = inferDateFromPoint(x, y);

      if (inferred) {
        let newDate = inferred.date;
        const allDay = inferred.allDay;
        
        // Apply drag offset if applicable (timegrid -> timegrid)
        if (!allDay && !event.allDay && dragOffsetRef.current) {
          newDate = new Date(newDate.getTime() - dragOffsetRef.current);
        }

        if (blockUuid) {
          // Calculate new end time based on duration
          let newEnd: Date | null = null;
          if (!allDay && eventStart && eventEnd) {
            const duration = eventEnd.getTime() - eventStart.getTime();
            newEnd = new Date(newDate.getTime() + duration);
          }
          
          moveEvent(blockUuid, newDate, allDay, newEnd);
        }
      }
    }, 50);
  }, [setIsDragging, moveEvent, inferDateFromPoint]);

  const handleEventResize = useCallback(async (resizeInfo: EventResizeDoneArg) => {
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

    // Optimistic update
    updateEventOptimistically({
      id: resizeInfo.event.id,
      start: newStart.toISOString(),
      end: newEnd?.toISOString(),
      allDay: allDay
    });

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
      refreshEvents();
    } catch (error) {
      logseq.UI.showMsg(`Error resizing event: ${error}`, "error");
      resizeInfo.revert();
      refreshEvents();
    }
  }, [refreshEvents, updateEventOptimistically]);

  const handleClearSchedule = useCallback(async (blockUuid: string, e: React.MouseEvent) => {
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
      refreshEvents();
    } catch (error) {
      logseq.UI.showMsg(`Error clearing schedule: ${error}`, "error");
    }
  }, [refreshEvents]);

  const renderEventContent = useCallback((eventInfo: EventContentArg) => (
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
  ), [editingEventId, editingText, hoveredEventId, handleSaveEdit, handleClearSchedule, handleEditClick]);

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
    <div className="flex flex-col h-full">
      <CalendarToolbar
        currentView={currentView}
        multiDaySpan={multiDaySpan}
        position={position}
        externalVisible={externalVisible}
        onRefresh={refreshEvents}
        onTogglePosition={onTogglePosition}
        onToggleExternal={() => setExternalVisible((prev) => !prev)}
        onPrev={handlePrev}
        onNext={handleNext}
        onSelectDay={() => {
          setCurrentView("timeGridDay");
          getCalendarApi()?.changeView("timeGridDay");
        }}
        onSelectMulti={() => {
          setCurrentView("timeGridMulti");
          getCalendarApi()?.changeView("timeGridMulti");
          goToTodayMinusOne();
        }}
        onSelectWeek={() => {
          setCurrentView("timeGridWeek");
          getCalendarApi()?.changeView("timeGridWeek");
        }}
        onSelectMonth={() => {
          setCurrentView("dayGridMonth");
          getCalendarApi()?.changeView("dayGridMonth");
        }}
        onToday={() => getCalendarApi()?.today()}
        onClose={closeSidebar}
        onOpenSettings={() => logseq.showSettingsUI?.()}
      />

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
          .fc-day-today {
            background-color: rgb(239 246 255) !important;
          }
          .fc-col-header-cell {
            background-color: transparent;
            padding: 8px 4px;
            font-weight: 500;
            color: rgb(55 65 81);
          }
          .fc-daygrid-day-number,
          .fc-timegrid-slot-label {
            color: rgb(75 85 99);
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
          eventDragStart={(info) => {
            setIsDragging(true);
            dragDropTriggeredRef.current = false;
            
            // Calculate drag offset
            const { jsEvent, event } = info;
            const inferred = inferDateFromPoint(jsEvent.clientX, jsEvent.clientY);
            if (inferred && !inferred.allDay && event.start) {
              dragOffsetRef.current = inferred.date.getTime() - event.start.getTime();
            } else {
              dragOffsetRef.current = 0;
            }
          }}
          eventDragStop={handleDragStop}
          eventResizeStart={() => setIsDragging(true)}
          eventResizeStop={() => setIsDragging(false)}
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
          viewDidMount={(arg: ViewMountArg) => {
            setCurrentView(arg.view.type as CalendarViewType);
            if (arg.view.type === "timeGridMulti") {
              goToTodayMinusOne();
            }
          }}
        />
      </div>
    </div>
  );
}
