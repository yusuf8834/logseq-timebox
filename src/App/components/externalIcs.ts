import * as ICALRaw from "ical.js";
const ICAL: any = (ICALRaw as any)?.default ?? ICALRaw;
import type { EventInput } from "@fullcalendar/core";

const EXTERNAL_BG = "#fce7ff";
const EXTERNAL_BORDER = "#f3c4ff";
const EXTERNAL_TEXT = "#5b1b73";
const WINDOW_PAST_DAYS = 30;
const WINDOW_FUTURE_DAYS = 120;

const buildEventInput = (summary: string, start: Date, end: Date | null, allDay: boolean, sourceLabel: string): EventInput => {
  const evt: EventInput = {
    title: summary || "Untitled",
    start: start.toISOString(),
    allDay,
    extendedProps: {
      source: "external",
      sourceLabel,
    },
    backgroundColor: EXTERNAL_BG,
    borderColor: EXTERNAL_BORDER,
    textColor: EXTERNAL_TEXT,
    editable: false,
    classNames: ["fc-external-event"],
  };
  if (end) evt.end = end.toISOString();
  return evt;
};

const inWindow = (start: Date, windowStart: Date, windowEnd: Date) => start >= windowStart && start <= windowEnd;

export const fetchExternalIcs = async (urls: string[]): Promise<EventInput[]> => {
  const results: EventInput[] = [];
  const uniqueUrls = Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean)));
  if (uniqueUrls.length === 0) return results;

  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_PAST_DAYS * 24 * 3600 * 1000);
  const windowEnd = new Date(now.getTime() + WINDOW_FUTURE_DAYS * 24 * 3600 * 1000);

  const fetches = uniqueUrls.map(async (url) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text || !text.trim()) return;

      const jcalData = ICAL.parse(text);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents("vevent");

      for (const vevent of vevents) {
        try {
          const event = new ICAL.Event(vevent);
          if (event.status === "CANCELLED") continue;

          // Skip events without a valid startDate
          if (!event.startDate || typeof event.startDate.toJSDate !== "function") {
            continue;
          }

          if (event.isRecurring()) {
            try {
              const expand = new ICAL.RecurExpansion({
                component: vevent,
                dtstart: event.startDate,
              });
              let count = 0;
              const maxOccurrences = 500; // Safety limit
              while (expand.next() && count < maxOccurrences) {
                count++;
                const next = expand.last;
                if (!next || typeof next.toJSDate !== "function") {
                  continue;
                }
                const startDate = next.toJSDate();
                if (!inWindow(startDate, windowStart, windowEnd)) {
                  if (startDate > windowEnd) break;
                  continue;
                }
                const duration = event.duration;
                let endDate: Date | null = null;
                if (duration && typeof next.clone === "function") {
                  try {
                    endDate = next.clone().addDuration(duration).toJSDate();
                  } catch {
                    // ignore duration calculation errors
                  }
                }
                const allDay = next.isDate ?? false;
                results.push(buildEventInput(event.summary, startDate, endDate, allDay, url));
              }
            } catch (recurErr) {
              // If recurrence expansion fails, fall back to single event
              console.warn("Recurrence expansion failed, using single event", recurErr);
              const startDate = event.startDate.toJSDate();
              if (inWindow(startDate, windowStart, windowEnd)) {
                const endDate = event.endDate?.toJSDate?.() ?? null;
                const allDay = event.startDate.isDate ?? false;
                results.push(buildEventInput(event.summary, startDate, endDate, allDay, url));
              }
            }
          } else {
            const startDate = event.startDate.toJSDate();
            if (!inWindow(startDate, windowStart, windowEnd)) continue;
            const endDate = event.endDate?.toJSDate?.() ?? null;
            const allDay = event.startDate.isDate ?? false;
            results.push(buildEventInput(event.summary, startDate, endDate, allDay, url));
          }
        } catch (eventErr) {
          // Skip malformed events
          console.warn("Skipping malformed event", eventErr);
        }
      }
    } catch (err) {
      console.error("Failed to fetch ICS", url, err);
    }
  });

  await Promise.all(fetches);
  return results;
};

export const isExternalEvent = (event: EventInput | any): boolean => {
  return event?.extendedProps?.source === "external";
};

