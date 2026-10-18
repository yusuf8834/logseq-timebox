import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg, EventClickArg, CalendarApi, EventContentArg, EventDropArg, ViewMountArg } from "@fullcalendar/core";
import type { DateClickArg, EventResizeDoneArg, EventDragStopArg } from "@fullcalendar/interaction";
import { closeSidebar } from "../../sidebar-stuff";
import {
  normalizeStartHour,
  normalizeFirstDay,
  normalizeMultiDaySpan,
  normalizeDurationMinutes,
  normalizeSnapInterval,
  collapseNamespacesInTitle,
  isClickAction,
  loadStoredCalendarView,
  persistCalendarView,
  loadStoredCalendarDate,
  persistCalendarDate,
  type ClickAction,
  type CalendarViewType,
} from "./calendarUtils";
import { getGraphAdapter } from "../adapters";
import { CalendarEventContent } from "./CalendarEventContent";
import { CalendarToolbar } from "./CalendarToolbar";
import { useScheduledEvents } from "./hooks/useScheduledEvents";
import { useInlineEdit } from "./hooks/useInlineEdit";
import { calendarDropTarget, isLogseqBlockDrag, readDroppedBlockUuid, type CalendarDropTarget } from "./logseqBlockDrop";

interface CalendarViewProps {
  onTogglePosition?: () => void;
  position?: "left" | "right";
}

export type { ClickAction, CalendarViewType } from "./calendarUtils";

const clickActionDescription = (a: ClickAction): string => {
  switch (a) {
    case "none":
      return "do nothing";
    case "edit":
      return "edit title in place";
    case "goto":
      return "open block in Logseq";
    case "cycleStatus":
      return "cycle status (Todo → Doing → Done)";
  }
};

export function CalendarView({ onTogglePosition, position = "left" }: CalendarViewProps) {
  const [currentView, setCurrentView] = useState<CalendarViewType>(
    () => loadStoredCalendarView() ?? "timeGridDay",
  );
  const [calendarInitialDate] = useState<Date>(() => loadStoredCalendarDate() ?? new Date());
  const calendarRef = useRef<FullCalendar>(null);
  const calendarContainerRef = useRef<HTMLDivElement>(null);
  const [isCreatingBlock, setIsCreatingBlock] = useState(false);
  const [blockDropTarget, setBlockDropTarget] = useState<CalendarDropTarget | null>(null);
  const blockDropPendingRef = useRef(false);
  
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
  const [defaultEventDuration, setDefaultEventDuration] = useState<number>(() => normalizeDurationMinutes((logseq as any)?.settings?.defaultEventDurationMinutes, 60));
  const [newTaskDuration, setNewTaskDuration] = useState<number>(() => normalizeDurationMinutes((logseq as any)?.settings?.newTaskDurationMinutes, 30));
  const [snapInterval, setSnapInterval] = useState<number>(() => normalizeSnapInterval((logseq as any)?.settings?.snapIntervalMinutes));
  
  // Click action settings (defaults: single → goto block, double → cycle TODO/DOING/DONE)
  const [clickAction, setClickAction] = useState<ClickAction>(() => {
    const raw = (logseq as any)?.settings?.clickAction;
    return isClickAction(raw) ? raw : "goto";
  });
  const [doubleClickAction, setDoubleClickAction] = useState<ClickAction>(() => {
    const raw = (logseq as any)?.settings?.doubleClickAction;
    return isClickAction(raw) ? raw : "cycleStatus";
  });

  const eventInteractionHint = useMemo(
    () =>
      `Calendar: single-click — ${clickActionDescription(clickAction)}; double-click — ${clickActionDescription(doubleClickAction)}.`,
    [clickAction, doubleClickAction],
  );

  useEffect(() => {
    persistCalendarView(currentView);
  }, [currentView]);

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
      if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "defaultEventDurationMinutes")) {
        setDefaultEventDuration(normalizeDurationMinutes(newSettings.defaultEventDurationMinutes, 60));
      }
      if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "newTaskDurationMinutes")) {
        setNewTaskDuration(normalizeDurationMinutes(newSettings.newTaskDurationMinutes, 30));
      }
      if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "snapIntervalMinutes")) {
        setSnapInterval(normalizeSnapInterval(newSettings.snapIntervalMinutes));
      }
      if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "clickAction")) {
        setClickAction(isClickAction(newSettings.clickAction) ? newSettings.clickAction : "goto");
      }
      if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "doubleClickAction")) {
        setDoubleClickAction(
          isClickAction(newSettings.doubleClickAction) ? newSettings.doubleClickAction : "cycleStatus",
        );
      }
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const createBlockInDailyPage = useCallback(async (date: Date, allDay: boolean = false, endDate?: Date) => {
    if (isCreatingBlock) return;

    try {
      setIsCreatingBlock(true);

      // Compute duration when a timed selection has an end
      let durMins: number | null = null;
      if (!allDay && endDate && endDate.getTime() > date.getTime()) {
        durMins = Math.round((endDate.getTime() - date.getTime()) / 60000);
      }

      const adapter = await getGraphAdapter();
      const created = await adapter.createTask(date, allDay, durMins);

      if (created) {
        // Reload events to show the new scheduled block
        refreshEvents();
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
    
    await createBlockInDailyPage(selectInfo.start, isAllDay, selectInfo.end ?? undefined);
    // Unselect after creating
    getCalendarApi()?.unselect();
  }, [createBlockInDailyPage]);

  // A plain click never starts a selection (selectMinDistance), so it lands here with the new-task duration.
  const handleDateClick = useCallback(async (info: DateClickArg) => {
    const end = info.allDay ? undefined : new Date(info.date.getTime() + newTaskDuration * 60000);
    await createBlockInDailyPage(info.date, info.allDay, end);
  }, [createBlockInDailyPage, newTaskDuration]);

  const cycleBlockMarker = useCallback(async (blockUuid: string) => {
    try {
      const adapter = await getGraphAdapter();
      const next = await adapter.cycleStatus(blockUuid);
      if (!next) return;
      logseq.UI.showMsg(`Status: ${next}`, "success");
      refreshEvents();
    } catch (error) {
      logseq.UI.showMsg(`Error updating status: ${error}`, "error");
    }
  }, [refreshEvents]);

  // Navigate to block (used on double-click)
  const navigateToBlock = useCallback(async (blockUuid: string) => {
    try {
      const adapter = await getGraphAdapter();
      await adapter.navigateToTask(blockUuid);
    } catch {
    }
  }, []);

  // Perform action based on setting
  const performAction = useCallback(
    async (action: ClickAction, blockUuid: string) => {
      if (action === "edit") {
        await enterEditMode(blockUuid);
      } else if (action === "goto") {
        await navigateToBlock(blockUuid);
      } else if (action === "cycleStatus") {
        await cycleBlockMarker(blockUuid);
      }
      // "none" does nothing
    },
    [enterEditMode, navigateToBlock, cycleBlockMarker],
  );

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
      const computedDur = !allDay && eventEnd ? Math.max(1, Math.round((eventEnd.getTime() - newDate.getTime()) / 60000)) : null;

      const adapter = await getGraphAdapter();
      // An existing stored duration wins over the event-derived one on plain moves
      await adapter.reschedule(blockUuid, newDate, allDay, {
        durationMins: computedDur,
        preferExistingDuration: true,
      });
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

  const handleBlockDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!isLogseqBlockDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    const target = calendarDropTarget(event.currentTarget, event.clientX, event.clientY);
    // Avoid the native link badge over valid slots. Scheduling still updates
    // the original block in place; this only selects native drag feedback.
    event.dataTransfer.dropEffect = target && !blockDropPendingRef.current ? "move" : "none";
    setBlockDropTarget(target);
  }, []);

  const handleBlockDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    if (!isLogseqBlockDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    setBlockDropTarget(null);
    // Capture native transfer data before awaiting SDK calls.
    const target = calendarDropTarget(event.currentTarget, event.clientX, event.clientY);
    if (!target || blockDropPendingRef.current) return;
    const uuid = readDroppedBlockUuid(event.dataTransfer);
    if (!uuid) {
      logseq.UI.showMsg("Could not identify this block. Drag a block by its bullet.", "warning");
      return;
    }
    blockDropPendingRef.current = true;
    try {
      const adapter = await getGraphAdapter();
      await adapter.reschedule(uuid, target.date, target.allDay, {
        durationMins: target.allDay ? null : 60,
        preferExistingDuration: true,
      });
      refreshEvents();
      logseq.UI.showMsg("Block scheduled", "success");
    } catch {
      logseq.UI.showMsg("Could not schedule this block. Try dropping it again.", "error");
      refreshEvents();
    } finally {
      blockDropPendingRef.current = false;
    }
  }, [refreshEvents]);

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
      // Compute duration from resize
      let durMins: number | null = null;
      if (!allDay && newEnd) {
        durMins = Math.max(1, Math.round((newEnd.getTime() - newStart.getTime()) / 60000));
      }

      const adapter = await getGraphAdapter();
      // A resize explicitly sets the new duration, overriding any stored one
      await adapter.reschedule(blockUuid, newStart, allDay, {
        durationMins: durMins,
        preferExistingDuration: false,
      });
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
      const adapter = await getGraphAdapter();
      await adapter.clearSchedule(blockUuid);
      logseq.UI.showMsg("Schedule cleared", "success");

      // Reload events to reflect changes
      refreshEvents();
    } catch (error) {
      logseq.UI.showMsg(`Error clearing schedule: ${error}`, "error");
    }
  }, [refreshEvents]);

  const renderEventContent = useCallback(
    (eventInfo: EventContentArg) => (
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
        eventInteractionHint={
          eventInfo.event.extendedProps?.source === "external" ? undefined : eventInteractionHint
        }
      />
    ),
    [
      editingEventId,
      editingText,
      hoveredEventId,
      handleSaveEdit,
      handleClearSchedule,
      handleEditClick,
      eventInteractionHint,
    ],
  );

  const getCalendarApi = (): CalendarApi | null => {
    return calendarRef.current?.getApi() || null;
  };

  const updateCalendarSize = useCallback(() => {
    const api = getCalendarApi();
    if (!api) return;

    api.updateSize();
    requestAnimationFrame(() => api.updateSize());
  }, []);

  useEffect(() => {
    const container = calendarContainerRef.current;
    if (!container) return;

    let frameId: number | null = null;
    let settleTimeoutId: number | null = null;

    const scheduleUpdate = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }

      frameId = requestAnimationFrame(() => {
        frameId = null;
        updateCalendarSize();
        settleTimeoutId = window.setTimeout(updateCalendarSize, 180);
      });
    };

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(container);
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
    };
  }, [updateCalendarSize]);

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
    if (currentView !== "timeGridMulti") return;
    let attempts = 0;
    const applyMultiDuration = () => {
      const api = getCalendarApi();
      if (api) {
        const cur = api.getDate();
        api.changeView("timeGridMulti", cur);
        return;
      }
      attempts += 1;
      if (attempts < 24) requestAnimationFrame(applyMultiDuration);
    };
    requestAnimationFrame(applyMultiDuration);
  }, [multiDaySpan, currentView]);

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
      <div
        ref={calendarContainerRef}
        className="flex-1 overflow-hidden p-4"
        onClick={handleCalendarClick}
        onDragOver={handleBlockDragOver}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setBlockDropTarget(null);
        }}
        onDrop={handleBlockDrop}
      >
        {blockDropTarget && (
          <div
            aria-hidden="true"
            style={{
              position: "fixed", pointerEvents: "none", zIndex: 50,
              left: blockDropTarget.rect.left, top: blockDropTarget.rect.top,
              width: blockDropTarget.rect.width, height: blockDropTarget.rect.height,
              background: "rgba(59, 130, 246, 0.2)", border: "2px solid #3b82f6",
              boxSizing: "border-box",
            }}
          />
        )}
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={currentView}
          initialDate={calendarInitialDate}
          headerToolbar={false}
          height="100%"
          selectable={true}
          selectMirror={true}
          dayMaxEvents={true}
          defaultTimedEventDuration={{ minutes: defaultEventDuration }}
          snapDuration={{ minutes: snapInterval }}
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
          selectMinDistance={5}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventContent={renderEventContent}
          events={events}
          datesSet={(arg) => {
            persistCalendarDate(arg.view.calendar.getDate());
          }}
          viewDidMount={(arg: ViewMountArg) => {
            setCurrentView(arg.view.type as CalendarViewType);
          }}
        />
      </div>
    </div>
  );
}
