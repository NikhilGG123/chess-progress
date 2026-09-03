import { describe, expect, it } from "vitest";
import {
  STATUSES,
  STATUS_META,
  awaitingTest,
  countByStatus,
  cellKey,
  suggestNextTopic,
  type Status,
} from "@/lib/status";
import type { Topic } from "@/lib/types";

function topic(sort_order: number, name = `Topic ${sort_order}`): Topic {
  return { id: `t${sort_order}`, level_id: "l1", name, sort_order };
}

function row(sort_order: number, status: Status) {
  return { status, topic: topic(sort_order) };
}

describe("the coaches' marks", () => {
  it("uses their notation, and X means COMPLETE", () => {
    // This app shipped with X meaning "not seen" -- the opposite -- and it
    // would have inverted every student's record on import. Confirmed with the
    // coaches on 2026-09-02. If this test ever fails, do not "fix" the test.
    expect(STATUS_META.complete.mark).toBe("X");
    expect(STATUS_META.not_seen.mark).not.toBe("X");

    expect(STATUS_META.seen_once.mark).toBe("I");
    expect(STATUS_META.seen_multiple.mark).toBe("R");
    expect(STATUS_META.needs_testing.mark).toBe("T");
  });

  it("runs from nothing to finished, in that order", () => {
    expect([...STATUSES]).toEqual([
      "not_seen",
      "seen_once",
      "seen_multiple",
      "needs_testing",
      "complete",
    ]);
  });

  it("gives every status a distinct mark", () => {
    const marks = STATUSES.map((status) => STATUS_META[status].mark);
    expect(new Set(marks).size).toBe(STATUSES.length);
  });
});

describe("suggestNextTopic", () => {
  it("suggests the first topic for a brand new student", () => {
    const rows = [1, 2, 3].map((n) => row(n, "not_seen"));
    expect(suggestNextTopic(rows)?.sort_order).toBe(1);
  });

  it("returns the gap, not the last unfinished topic", () => {
    // Topics 1, 2, 4 and 5 are finished; 3 was skipped. A rule that walked to
    // the end would send the coach past the thing the student missed.
    const rows = [
      row(1, "complete"),
      row(2, "complete"),
      row(3, "seen_once"),
      row(4, "complete"),
      row(5, "complete"),
    ];
    expect(suggestNextTopic(rows)?.sort_order).toBe(3);
  });

  it("ignores the order the rows arrive in", () => {
    const rows = [row(9, "not_seen"), row(2, "not_seen"), row(5, "not_seen")];
    expect(suggestNextTopic(rows)?.sort_order).toBe(2);
  });

  it("returns null only when everything is complete", () => {
    expect(suggestNextTopic([1, 2, 3].map((n) => row(n, "complete")))).toBeNull();
  });

  it("still suggests a topic seen twice but never tested", () => {
    // Seen multiple times is not finished. Only a coach's test finishes it.
    const rows = [row(1, "complete"), row(2, "seen_multiple")];
    expect(suggestNextTopic(rows)?.sort_order).toBe(2);
  });

  it("still suggests a topic waiting on a test", () => {
    const rows = [row(1, "complete"), row(2, "needs_testing")];
    expect(suggestNextTopic(rows)?.sort_order).toBe(2);
  });

  it("returns null for a level with no topics", () => {
    expect(suggestNextTopic([])).toBeNull();
  });
});

describe("awaitingTest", () => {
  it("lists only what is waiting on a test, in level order", () => {
    const rows = [
      row(4, "needs_testing"),
      row(1, "complete"),
      row(2, "needs_testing"),
      row(3, "seen_multiple"),
    ];
    expect(awaitingTest(rows).map((t) => t.sort_order)).toEqual([2, 4]);
  });
});

describe("countByStatus", () => {
  it("counts every status, including the ones with none", () => {
    const counts = countByStatus([
      { status: "complete" },
      { status: "complete" },
      { status: "seen_multiple" },
    ]);
    expect(counts).toEqual({
      not_seen: 0,
      seen_once: 0,
      seen_multiple: 1,
      needs_testing: 0,
      complete: 2,
    });
  });
});

describe("cellKey", () => {
  it("is unique per student and topic", () => {
    expect(cellKey("s1", "t1")).not.toBe(cellKey("s1", "t2"));
    expect(cellKey("s1", "t1")).not.toBe(cellKey("s2", "t1"));
    expect(cellKey("s1", "t1")).toBe(cellKey("s1", "t1"));
  });
});
