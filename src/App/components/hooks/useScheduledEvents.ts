import { useState, useEffect, useRef, useCallback } from "react";
import type { EventInput } from "@fullcalendar/core";
import { DB_CHANGED_EVENT } from "../../../main";
import { parseDurationToken } from "../calendarUtils";
import { fetchExternalIcs } from "../externalIcs";

interface ScheduledInfo {
  date: Date;
  allDay: boolean;
  durationMins?: number;
}

interface PendingUpdate {
  start: string;
  end?: string;
  allDay: boolean;
  timestamp: number;
}

const parseScheduledTime = (content: string): ScheduledInfo | null => {
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

interface UseScheduledEventsReturn {
  events: EventInput[];
  externalVisible: boolean;
  setExternalVisible: (visible: boolean | ((prev: boolean) => boolean)) => void;
  refreshEvents: (forceExternalRefresh?: boolean) => void;
  setIsDragging: (dragging: boolean) => void;
  updateEventOptimistically: (event: EventInput) => void;
}

export function useScheduledEvents(): UseScheduledEventsReturn {
  const [events, setEvents] = useState<EventInput[]>([]);
  const [externalVisible, setExternalVisible] = useState<boolean>(
    () => (logseq as any)?.settings?.showExternalCalendars ?? true
  );

  // Debounce timer ref
  const debounceTimerRef = useRef<number | null>(null);
  // Cache for external ICS events (to avoid refetching on local changes)
  const externalCacheRef = useRef<{ urls: string; events: EventInput[] } | null>(null);
  
  // Track pending updates to prevent stale DB data from overwriting optimistic UI
  const pendingUpdatesRef = useRef<Map<string, PendingUpdate>>(new Map());
  // Track dragging state to pause refreshes
  const isDraggingRef = useRef(false);

  const setIsDragging = useCallback((dragging: boolean) => {
    if (dragging) {
      isDraggingRef.current = true;
    } else {
      // Delay setting false to allow handleEventDrop to fire and set pending update
      // This prevents a race condition where a refresh happens between drag stop and drop handler
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 200);
    }
  }, []);

  const updateEventOptimistically = useCallback((event: EventInput) => {
    if (!event.id) return;
    
    // Update pending updates
    pendingUpdatesRef.current.set(event.id, {
      start: event.start as string,
      end: event.end as string,
      allDay: event.allDay as boolean,
      timestamp: Date.now()
    });

    // Update local state immediately
    setEvents(prev => {
      return prev.map(e => {
        if (e.id === event.id) {
          return { ...e, ...event };
        }
        return e;
      });
    });
  }, []);

  const loadScheduledEvents = useCallback(async (forceExternalRefresh = false) => {
    // Skip loading if dragging
    if (isDraggingRef.current) return;

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

      const calendarEvents: EventInput[] = [];

      if (scheduledBlocks && scheduledBlocks.length > 0) {
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
          const title = contentLines.find(
            (line: string) => !line.startsWith("SCHEDULED:") && !line.startsWith("DEADLINE:")
          ) || "Untitled";
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
            const durMins = scheduledInfo.durationMins;
            if (durMins && durMins > 0) {
              const end = new Date(scheduledInfo.date.getTime() + durMins * 60000);
              event.end = end.toISOString();
            }
          }

          // Check for pending updates
          const pending = pendingUpdatesRef.current.get(block.uuid);
          if (pending) {
            // Check if DB matches pending (DB caught up)
            // We compare start time and allDay status
            // Note: event.start is ISO string, pending.start is ISO string
            const dbStart = event.start;
            const pendingStart = pending.start;
            
            // Simple comparison. Might need more robust date comparison if formats differ slightly,
            // but both should be ISO strings here.
            const isSynced = dbStart === pendingStart && event.allDay === pending.allDay;
            
            if (isSynced) {
              pendingUpdatesRef.current.delete(block.uuid);
            } else {
              // Not synced yet. Check if pending update is stale (e.g. > 15s)
              if (Date.now() - pending.timestamp < 15000) {
                // Keep optimistic state
                event.start = pending.start;
                event.end = pending.end;
                event.allDay = pending.allDay;
              } else {
                // Pending update timed out
                pendingUpdatesRef.current.delete(block.uuid);
              }
            }
          }

          calendarEvents.push(event);
        }
      }

      // Fetch external ICS if enabled
      let externalEvents: EventInput[] = [];
      if (externalVisible) {
        const urls = (((logseq as any)?.settings?.externalIcsUrls || "") as string)
          .split(/\r?\n/)
          .map((u) => u.trim())
          .filter(Boolean);
        const urlsKey = urls.join("|");

        // Use cache if available and not forcing refresh
        if (!forceExternalRefresh && externalCacheRef.current?.urls === urlsKey) {
          externalEvents = externalCacheRef.current.events;
        } else if (urls.length) {
          externalEvents = await fetchExternalIcs(urls);
          externalCacheRef.current = { urls: urlsKey, events: externalEvents };
        }
      }

      setEvents([...calendarEvents, ...externalEvents]);
    } catch (error) {
      console.error("Error loading scheduled events:", error);
    }
  }, [externalVisible]);

  // Debounced refresh function
  const refreshEvents = useCallback((forceExternalRefresh = false) => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      loadScheduledEvents(forceExternalRefresh);
    }, 100);
  }, [loadScheduledEvents]);

  // Initial load and DB change listener
  useEffect(() => {
    loadScheduledEvents();

    const handleDbChange = () => {
      refreshEvents(false); // Don't refetch external on DB changes
    };

    window.addEventListener(DB_CHANGED_EVENT, handleDbChange);

    return () => {
      window.removeEventListener(DB_CHANGED_EVENT, handleDbChange);
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [loadScheduledEvents, refreshEvents]);

  // Reload when externalVisible changes
  useEffect(() => {
    refreshEvents(true); // Force refresh external when visibility toggles
  }, [externalVisible, refreshEvents]);

  // Listen for settings changes related to external calendars
  useEffect(() => {
    const unsubscribe = logseq?.onSettingsChanged?.((newSettings: any) => {
      if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "showExternalCalendars")) {
        setExternalVisible(!!newSettings.showExternalCalendars);
      }
      if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "externalIcsUrls")) {
        // Clear cache and refresh when URLs change
        externalCacheRef.current = null;
        refreshEvents(true);
      }
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [refreshEvents]);

  return {
    events,
    externalVisible,
    setExternalVisible,
    refreshEvents: () => refreshEvents(false),
    setIsDragging,
    updateEventOptimistically
  };
}
