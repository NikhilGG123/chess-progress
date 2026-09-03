"use client";

import { useState } from "react";
import { setProgress } from "@/app/(app)/actions";
import {
  awaitingTest,
  countByStatus,
  suggestNextTopic,
  type Status,
} from "@/lib/status";
import type { Level, Topic } from "@/lib/types";
import { StatusPicker } from "./status-picker";
import { StatusLegend } from "./status-legend";
import { LiveDot, useRealtime } from "./use-realtime";

export type LevelProgress = {
  level: Level;
  /** Which programme this level belongs to, for the heading. */
  programName: string;
  rows: { topic: Topic; status: Status }[];
};

/**
 * One student's whole record, kept consistent with itself.
 *
 * The summary above each list -- what is next, how many are waiting to be
 * tested, how many are complete -- is derived from the same state the list
 * renders, not from a separate server render. Rendering them apart is how this
 * page ended up saying "waiting to be tested: 0" directly above a row marked
 * "Test".
 *
 * A student can be current in more than one programme at once, so "current" is
 * a list: chess and coding sit side by side, each with its own summary.
 *
 * It is also live: a coach marking this student from a class on another device
 * updates this screen.
 */
export function StudentWorkspace({
  studentId,
  studentName,
  current,
  past,
}: {
  studentId: string;
  studentName: string;
  current: LevelProgress[];
  past: LevelProgress[];
}) {
  const [statuses, setStatuses] = useState<Record<string, Status>>(() =>
    Object.fromEntries(
      [...current, ...past].flatMap((entry) =>
        entry.rows.map((row) => [row.topic.id, row.status]),
      ),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  // Topics added to a level while the page is open arrive as new props; adopt
  // those without disturbing marks made here.
  //
  // Adjusted during render rather than in an effect: React finishes this
  // component before it paints, so the grid never shows a frame with the new
  // topic missing, and there is no second pass over the whole page.
  const [adopted, setAdopted] = useState({ current, past });
  if (adopted.current !== current || adopted.past !== past) {
    setAdopted({ current, past });
    setStatuses((existing) => {
      let changed = false;
      const next = { ...existing };
      for (const entry of [...current, ...past]) {
        for (const row of entry.rows) {
          if (!(row.topic.id in next)) {
            next[row.topic.id] = row.status;
            changed = true;
          }
        }
      }
      return changed ? next : existing;
    });
  }

  const live = useRealtime(`student:${studentId}`, [
    {
      table: "progress",
      filter: `student_id=eq.${studentId}`,
      handler: (payload) => {
        const row = payload.new as { topic_id?: string; status?: Status };
        if (!row?.topic_id || !row.status) return;
        setStatuses((existing) =>
          existing[row.topic_id!] === row.status
            ? existing
            : { ...existing, [row.topic_id!]: row.status! },
        );
      },
    },
  ]);

  function rowsOf(entry: LevelProgress) {
    return entry.rows.map((row) => ({
      topic: row.topic,
      status: statuses[row.topic.id] ?? row.status,
    }));
  }

  async function set(topic: Topic, next: Status) {
    const previous = statuses[topic.id] ?? "not_seen";
    setStatuses((existing) => ({ ...existing, [topic.id]: next }));
    setError(null);

    const result = await setProgress({ studentId, topicId: topic.id, status: next });

    if (result.error) {
      setStatuses((existing) => ({ ...existing, [topic.id]: previous }));
      setError(`Could not save ${topic.name}: ${result.error}`);
    }
  }

  // The programme only needs naming once there is more than one of them.
  const showProgramNames =
    new Set([...current, ...past].map((entry) => entry.programName)).size > 1;

  return (
    <>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {current.length === 0 && (
        <p className="mb-8 rounded-lg border border-border bg-surface-raised px-4 py-6 text-sm text-muted-foreground">
          Not enrolled in anything yet — pick a level above and this fills in.
        </p>
      )}

      {current.map((entry, index) => {
        const rows = rowsOf(entry);
        const suggestion = suggestNextTopic(rows);
        const toTest = awaitingTest(rows);
        const counts = countByStatus(rows);

        return (
          <section key={entry.level.id} className="mb-10">
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-surface-raised p-5">
                <p className="text-sm text-muted-foreground">
                  Suggested next lesson
                  {showProgramNames && ` · ${entry.programName}`}
                </p>
                <p className="mt-1 text-lg font-medium">
                  {suggestion ? suggestion.name : "Level complete"}
                </p>
                {!suggestion && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Every topic in {entry.level.name} is complete. Moving up is
                    your call — change the level above.
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-border bg-surface-raised p-5">
                <p className="text-sm text-muted-foreground">Waiting to be tested</p>
                <p className="tabular mt-1 text-lg font-medium">{toTest.length}</p>
                {toTest.length > 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {toTest.map((topic) => topic.name).join(", ")}
                  </p>
                )}
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium">
                {showProgramNames ? `${entry.programName} · ` : ""}
                {entry.level.name}
              </h2>
              <div className="flex items-center gap-4">
                <p className="tabular text-sm text-muted-foreground">
                  {counts.complete} of {rows.length} complete
                </p>
                {index === 0 && <LiveDot live={live} />}
              </div>
            </div>

            {index === 0 && (
              <div className="mb-4">
                <StatusLegend />
              </div>
            )}

            <TopicList
              rows={rows}
              studentName={studentName}
              suggestionId={suggestion?.id}
              onSet={set}
            />
          </section>
        );
      })}

      {past.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium">Earlier levels</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Kept in full. Moving a student up never erases where they came from.
          </p>
          {past.map((entry) => {
            const rows = rowsOf(entry);
            const done = countByStatus(rows).complete;
            return (
              <details
                key={entry.level.id}
                className="mb-2 rounded-lg border border-border bg-surface-raised"
              >
                <summary className="cursor-pointer px-4 py-3 text-sm">
                  {showProgramNames ? `${entry.programName} · ` : ""}
                  {entry.level.name}
                  <span className="tabular ml-2 text-muted-foreground">
                    {done} of {rows.length} complete
                  </span>
                </summary>
                <div className="border-t border-border p-3">
                  <TopicList rows={rows} studentName={studentName} onSet={set} />
                </div>
              </details>
            );
          })}
        </section>
      )}
    </>
  );
}

function TopicList({
  rows,
  studentName,
  suggestionId,
  onSet,
}: {
  rows: { topic: Topic; status: Status }[];
  studentName: string;
  suggestionId?: string;
  onSet: (topic: Topic, next: Status) => void;
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
      {rows.map(({ topic, status }) => (
        <li key={topic.id} className="flex items-center gap-3 px-3 py-2">
          <span className="tabular w-6 shrink-0 text-xs text-muted-foreground">
            {topic.sort_order}
          </span>

          <span className="flex-1 text-sm">
            {topic.name}
            {suggestionId === topic.id && (
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                suggested next
              </span>
            )}
          </span>

          <StatusPicker
            status={status}
            variant="wide"
            label={`${studentName}, ${topic.name}`}
            onSelect={(next) => onSet(topic, next)}
          />
        </li>
      ))}
    </ul>
  );
}
