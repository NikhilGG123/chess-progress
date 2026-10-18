// The coaches' five marks.
//
// These are the marks already written in the Group Sheets workbook, so nobody
// has to learn a new notation to read the grid. The key, confirmed with Brad
// and Tim on 2026-09-02:
//
//   (blank)  none                     not covered with this student yet
//   I        seen one time
//   R        seen multiple times
//   T        test                     ready to be tested
//   X        complete                 tested and finished
//
// Note that X means *complete*. An outsider reads X as a cross and assumes the
// opposite -- this app shipped with exactly that mistake -- so do not "fix" it.
//
// Colour never carries the meaning on its own: every cell also shows its mark,
// and its full label is on the accessible name and the title.

export const STATUSES = [
  "not_seen",
  "seen_once",
  "seen_multiple",
  "needs_testing",
  "complete",
] as const;

export type Status = (typeof STATUSES)[number];

type StatusMeta = {
  /** The coaches' shorthand, as it appears in the cell. */
  mark: string;
  label: string;
  /** Expanded wording, for the legend and for screen readers. */
  description: string;
  /** Complete class strings -- Tailwind cannot see interpolated names. */
  cell: string;
  chip: string;
};

export const STATUS_META: Record<Status, StatusMeta> = {
  not_seen: {
    mark: "–",
    label: "None",
    description: "Not covered with this student yet",
    cell: "bg-status-not-seen text-status-not-seen-fg",
    chip: "bg-status-not-seen text-status-not-seen-fg",
  },
  seen_once: {
    mark: "I",
    label: "Seen once",
    description: "Covered one time",
    cell: "bg-status-seen-once text-status-seen-once-fg",
    chip: "bg-status-seen-once text-status-seen-once-fg",
  },
  seen_multiple: {
    mark: "R",
    label: "Seen again",
    description: "Covered more than once",
    cell: "bg-status-seen-multiple text-status-seen-multiple-fg",
    chip: "bg-status-seen-multiple text-status-seen-multiple-fg",
  },
  needs_testing: {
    mark: "T",
    label: "Test",
    description: "Ready to be tested",
    cell: "bg-status-needs-testing text-status-needs-testing-fg",
    chip: "bg-status-needs-testing text-status-needs-testing-fg",
  },
  complete: {
    mark: "X",
    label: "Complete",
    description: "Tested and finished",
    cell: "bg-status-complete text-status-complete-fg",
    chip: "bg-status-complete text-status-complete-fg",
  },
};

/**
 * The whole grid as one flat object: every cell keyed by student and topic.
 *
 * This lives here rather than beside the grid component because the server
 * builds the map and the client component reads it. Exporting it from a
 * "use client" module makes it unreachable from a server component -- Next
 * refuses the call at request time, and the type checker cannot see it coming.
 */
export type StatusMap = Record<string, Status>;

export function cellKey(studentId: string, topicId: string) {
  return `${studentId}:${topicId}`;
}

export function isStatus(value: unknown): value is Status {
  return STATUSES.includes(value as Status);
}

type TopicProgress = {
  status: Status;
  topic: { id: string; name: string; sort_order: number };
};

/**
 * Topics waiting on a test, in the curriculum's own order.
 *
 * `sort_order` is a display order, not a teaching sequence. The centre does not
 * teach a level front to back -- what gets taught depends on who is in the room
 * that evening, and it is the coach's call. An earlier version of this file
 * suggested "the first topic not yet complete" as each student's next lesson;
 * it was inventing a sequence that does not exist, so it is gone.
 */
export function awaitingTest(rows: TopicProgress[]) {
  return rows
    .filter((row) => row.status === "needs_testing")
    .sort((a, b) => a.topic.sort_order - b.topic.sort_order)
    .map((row) => row.topic);
}

export function countByStatus(rows: { status: Status }[]) {
  const counts: Record<Status, number> = {
    not_seen: 0,
    seen_once: 0,
    seen_multiple: 0,
    needs_testing: 0,
    complete: 0,
  };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}
