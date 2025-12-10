// Utility helpers extracted from CalendarView

export const normalizeStartHour = (raw: any): number => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 8;
  return Math.min(23, Math.max(0, Math.floor(n)));
};

export const normalizeFirstDay = (raw: any): number => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.min(6, Math.max(0, Math.floor(n)));
};

export const normalizeMultiDaySpan = (raw: any): number => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 3;
  return Math.min(14, Math.max(2, Math.floor(n)));
};

export const formatDateForJournal = (date: Date, format: string): string => {
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

export const formatScheduledDate = (date: Date, allDay: boolean): string => {
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

export const formatDurationToken = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `[d:${h}h${m}m]`;
  if (h > 0) return `[d:${h}h]`;
  return `[d:${m}m]`;
};

export const parseDurationToken = (content: string): number | null => {
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

// Collapse namespaces inside page refs: [[foo/bar/baz]] -> [[/baz]]
export const collapseNamespacesInTitle = (title: string): string => {
  if (!title) return "";
  return title.replace(/\[\[([^[\]]*\/[^[\]]+)\]\]/g, (_match, path: string) => {
    // Skip URLs to avoid mangling links
    if (path.includes("://")) return `[[${path}]]`;
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash === -1 || lastSlash === path.length - 1) return `[[${path}]]`;
    const leaf = path.substring(lastSlash + 1).trim();
    return leaf ? `[[/${leaf}]]` : `[[${path}]]`;
  });
};

// Extract repeater pattern from SCHEDULED line (e.g., ++1w, .+1d, +1m)
export const parseRepeater = (content: string): string | null => {
  const match = content.match(/SCHEDULED:\s*<[^>]*\s+(\+\+|\.\+|\+)(\d+[hdwmy])>/i);
  if (match) {
    return match[1] + match[2]; // e.g., "++1w"
  }
  return null;
};

export const updateDurationTokenInContent = (content: string, minutes: number | null): string => {
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

