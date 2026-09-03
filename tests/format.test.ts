import { describe, expect, it } from "vitest";
import { formatSessionDate, formatSessionTime, todayIso } from "@/lib/format";
import { weekdayLabel, WEEKDAYS } from "@/lib/weekdays";

describe("formatSessionDate", () => {
  it("shows the date that was stored, not the day before", () => {
    // Postgres hands back a bare 'YYYY-MM-DD'. new Date() would read that as
    // UTC midnight, which renders as the 2nd anywhere west of Greenwich --
    // a Wednesday class appearing as Tuesday.
    const formatted = formatSessionDate("2026-09-03");
    expect(formatted).toContain("3");
    expect(formatted).not.toContain("2");
  });

  it("names the weekday, because a timetable is read by day", () => {
    // 2026-09-03 is a Thursday.
    expect(formatSessionDate("2026-09-03")).toMatch(/Thu/i);
  });

  it("can omit the weekday", () => {
    expect(formatSessionDate("2026-09-03", { weekday: false })).not.toMatch(/Thu/i);
  });

  it("handles the first of a month, where an off-by-one crosses months", () => {
    const formatted = formatSessionDate("2026-09-01", { weekday: false });
    expect(formatted).toMatch(/Sep/i);
    expect(formatted).not.toMatch(/Aug/i);
  });
});

describe("formatSessionTime", () => {
  it("renders a Postgres time as a readable clock time", () => {
    expect(formatSessionTime("16:30:00")).toMatch(/4:30\s?pm/i);
  });

  it("renders nothing when a class has no set time", () => {
    expect(formatSessionTime(null)).toBe("");
  });
});

describe("todayIso", () => {
  it("matches the local calendar date, not UTC", () => {
    const now = new Date();
    const expected = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    expect(todayIso()).toBe(expected);
  });
});

describe("weekdayLabel", () => {
  it("reads in timetable order regardless of how it is stored", () => {
    // Postgres numbers Sunday 0, but nobody reads a timetable that way.
    expect(weekdayLabel([5, 3])).toBe("Wed · Fri");
    expect(weekdayLabel([0, 1])).toBe("Mon · Sun");
  });

  it("ignores days that are not set", () => {
    expect(weekdayLabel([])).toBe("");
  });

  it("covers all seven days exactly once", () => {
    const values = WEEKDAYS.map((day) => day.value).sort((a, b) => a - b);
    expect(values).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
