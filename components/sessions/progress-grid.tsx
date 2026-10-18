"use client";

import Link from "next/link";
import {
  awaitingTest,
  cellKey,
  countByStatus,
  STATUS_META,
  type Status,
  type StatusMap,
} from "@/lib/status";
import { StatusPicker } from "@/components/progress/status-picker";
import type { Topic } from "@/lib/types";

export type GridStudent = {
  id: string;
  full_name: string;
  level_id: string | null;
};

type Props = {
  levelLabel: string;
  topics: Topic[];
  students: GridStudent[];
  statuses: StatusMap;
  onSet: (student: GridStudent, topic: Topic, next: Status) => void;
};

/**
 * The testing grid: one row per student, one column per topic in their level.
 *
 * Presentation only -- the statuses, and the writing of them, live in
 * SessionWorkspace, which owns the single realtime subscription shared by
 * every grid and note on the page.
 */
export function ProgressGrid({
  levelLabel,
  topics,
  students,
  statuses,
  onSet,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          {levelLabel} progress. Each cell opens a menu of the five marks.
        </caption>

        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-20 min-w-[13rem] border-b border-border
                         bg-surface-raised px-3 py-2 text-left align-bottom font-medium"
            >
              Student
            </th>
            {topics.map((topic, index) => (
              <th
                key={topic.id}
                scope="col"
                title={topic.name}
                className={`relative h-40 w-11 border-b border-border align-bottom font-medium
                            ${index === topics.length - 1 ? "pr-32" : ""}`}
              >
                {/* Diagonal, matching the sheet the coaches already read. It
                    fits far more columns than horizontal text and stays easier
                    to scan than vertical. Anchored bottom-left so each label
                    points at the column it belongs to; the wrapper carries
                    right padding so the last few do not get clipped.

                    Each label runs up and to the right, across the cells beside
                    it -- so those cells must not paint over it. No background
                    (the panel behind supplies one) and no left border, which
                    used to draw a line straight through every name. "Develop-
                    ment" read as "Develo". */}
                <span
                  className="absolute bottom-1.5 left-1/2 origin-bottom-left -rotate-45
                             whitespace-nowrap text-xs"
                >
                  {topic.name}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {students.map((student) => {
            const rows = topics.map((topic) => ({
              status: statuses[cellKey(student.id, topic.id)] ?? "not_seen",
              topic,
            }));
            const done = countByStatus(rows).complete;
            const toTest = awaitingTest(rows).length;

            return (
              <tr key={student.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-border bg-surface-raised
                             px-3 py-2 text-left font-normal"
                >
                  <Link
                    href={`/students/${student.id}`}
                    className="font-medium hover:underline"
                  >
                    {student.full_name}
                  </Link>

                  {/* Where this student stands, on the row a coach is already
                      reading. The student page has shown this since it was
                      built; the class page -- the screen actually open during
                      a lesson -- only ever said what to teach next, never how
                      far along they were or who was waiting on a test.

                      Both numbers come from lib/status.ts. Nothing new is
                      computed; it was simply never asked for here. */}
                  <span
                    className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs
                                   text-muted-foreground"
                  >
                    <span className="tabular">
                      {done}/{rows.length}
                    </span>

                    {toTest > 0 && (
                      <span
                        className={`tabular rounded px-1 font-medium ${STATUS_META.needs_testing.chip}`}
                      >
                        {toTest} to test
                      </span>
                    )}

                    {done === rows.length && rows.length > 0 && (
                      <span
                        className={`rounded px-1 font-medium ${STATUS_META.complete.chip}`}
                      >
                        level complete
                      </span>
                    )}
                  </span>
                </th>

                {topics.map((topic) => {
                  const status =
                    statuses[cellKey(student.id, topic.id)] ?? "not_seen";

                  return (
                    <td
                      key={topic.id}
                      className="border-b border-l border-border p-0.5"
                    >
                      <div className="flex justify-center">
                        <StatusPicker
                          status={status}
                          label={`${student.full_name}, ${topic.name}`}
                          onSelect={(next) => onSet(student, topic, next)}
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
