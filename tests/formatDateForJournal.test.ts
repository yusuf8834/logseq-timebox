import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDateForJournal } from "../src/App/components/calendarUtils";

const date = new Date(2026, 9, 16);

test("formats every weekday token length", () => {
  assert.equal(formatDateForJournal(date, "E, d MMM yyyy"), "Fri, 16 Oct 2026");
  assert.equal(formatDateForJournal(date, "EE, d MMM yyyy"), "Fri, 16 Oct 2026");
  assert.equal(formatDateForJournal(date, "yyyy-MM-dd EEE"), "2026-10-16 Fri");
  assert.equal(formatDateForJournal(date, "EEEE, MMMM do, yyyy"), "Friday, October 16th, 2026");
});
