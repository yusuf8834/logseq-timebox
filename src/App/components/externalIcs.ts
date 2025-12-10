import type { EventInput } from "@fullcalendar/core";

const EXTERNAL_BG = "#fce7ff";
const EXTERNAL_BORDER = "#f3c4ff";
const EXTERNAL_TEXT = "#5b1b73";

const parseDateValue = (raw: string): { date: Date; allDay: boolean } | null => {
  if (!raw) return null;
  let value = raw.trim();
  // Remove TZID prefix if present: DTSTART;TZID=...
  const tzSplit = value.split(":");
  if (tzSplit.length === 2 && tzSplit[0].includes("TZID")) {
    value = tzSplit[1];
  }
  const allDay = value.length === 8;
  if (allDay) {
    // YYYYMMDD
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    return { date: new Date(year, month, day), allDay: true };
  }
  // Formats like 20250101T120000Z or without Z (local)
  const isoLike =
    value.length === 15 // 20250101T120000Z
      ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}${value.endsWith("Z") ? "Z" : ""}`
      : value;
  const date = new Date(isoLike);
  if (Number.isNaN(date.getTime())) return null;
  return { date, allDay: false };
};

const unfoldLines = (ics: string): string[] => {
  const rawLines = ics.split(/\r?\n/);
  const lines: string[] = [];
  for (const line of rawLines) {
    if (!line) continue;
    if (line.startsWith(" ") || line.startsWith("\t")) {
      // continuation of previous line
      if (lines.length > 0) {
        lines[lines.length - 1] += line.slice(1);
      }
    } else {
      lines.push(line);
    }
  }
  return lines;
};

const parseIcsText = (ics: string, sourceLabel: string): EventInput[] => {
  const lines = unfoldLines(ics);
  const events: EventInput[] = [];
  let current: Record<string, string> | null = null;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      current = {};
      continue;
    }
    if (line.startsWith("END:VEVENT")) {
      if (current) {
        const summary = current["SUMMARY"] || "Untitled";
        const dtStartRaw = current["DTSTART"];
        const dtEndRaw = current["DTEND"];

        const startInfo = dtStartRaw ? parseDateValue(dtStartRaw) : null;
        if (!startInfo) {
          current = null;
          continue;
        }
        const endInfo = dtEndRaw ? parseDateValue(dtEndRaw) : null;

        const event: EventInput = {
          title: summary,
          start: startInfo.date.toISOString(),
          allDay: startInfo.allDay,
          extendedProps: {
            source: "external",
            sourceLabel,
          },
          backgroundColor: EXTERNAL_BG,
          borderColor: EXTERNAL_BORDER,
          textColor: EXTERNAL_TEXT,
          editable: false,
        };

        // For all-day, DTEND is usually exclusive; leave as-is for now.
        if (endInfo) {
          event.end = endInfo.date.toISOString();
          if (endInfo.allDay) event.allDay = true;
        }

        events.push(event);
      }
      current = null;
      continue;
    }

    if (!current) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const keyPart = line.slice(0, idx);
    const valuePart = line.slice(idx + 1);
    const key = keyPart.split(";")[0]; // strip params
    current[key] = valuePart;
  }

  return events;
};

export const fetchExternalIcs = async (urls: string[]): Promise<EventInput[]> => {
  const results: EventInput[] = [];
  const uniqueUrls = Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean)));
  if (uniqueUrls.length === 0) return results;

  const fetches = uniqueUrls.map(async (url) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const events = parseIcsText(text, url);
      results.push(...events);
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

