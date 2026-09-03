"use client";

import { useState } from "react";
import { setProgress } from "@/app/(app)/actions";
import { STATUS_META, suggestNextTopic, type Status } from "@/lib/status";
import { StatusPicker } from "./status-picker";
import type { Topic } from "@/lib/types";

type Row = { topic: Topic; status: Status };

/**
 * One student's level, read top to bottom. The grid is built for working
 * across a class; this is built for looking at a single child -- in focus mode
 * with a parent, or when a coach tests someone outside a session.
 *
 * Editable for the same reason: progress is a permanent record, not something
 * that may only be touched while a session page happens to be open.
 */
export function StudentProgressList({
  studentId,
  studentName,
  rows: initialRows,
  editable = true,
}: {
  studentId: string;
  studentName: string;
  rows: Row[];
  editable?: boolean;
}) {
  const [statuses, setStatuses] = useState<Record<string, Status>>(() =>
    Object.fromEntries(initialRows.map((row) => [row.topic.id, row.status])),
  );
  const [error, setError] = useState<string | null>(null);

  const rows = initialRows.map((row) => ({
    topic: row.topic,
    status: statuses[row.topic.id] ?? row.status,
  }));
  const suggestion = suggestNextTopic(rows);

  async function set(topic: Topic, next: Status) {
    const previous = statuses[topic.id] ?? "not_seen";

    setStatuses((current) => ({ ...current, [topic.id]: next }));
    setError(null);

    const result = await setProgress({ studentId, topicId: topic.id, status: next });

    if (result.error) {
      setStatuses((current) => ({ ...current, [topic.id]: previous }));
      setError(`Could not save ${topic.name}: ${result.error}`);
    }
  }

  return (
    <div>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
        {rows.map(({ topic, status }) => {
          const meta = STATUS_META[status];
          const isNext = suggestion?.id === topic.id;

          return (
            <li
              key={topic.id}
              className="flex items-center gap-3 px-3 py-2"
            >
              <span className="tabular w-6 shrink-0 text-xs text-muted-foreground">
                {topic.sort_order}
              </span>

              <span className="flex-1 text-sm">
                {topic.name}
                {isNext && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    suggested next
                  </span>
                )}
              </span>

              {editable ? (
                <StatusPicker
                  status={status}
                  variant="wide"
                  label={`${studentName}, ${topic.name}`}
                  onSelect={(next) => set(topic, next)}
                />
              ) : (
                <span
                  className={`flex h-8 shrink-0 items-center gap-2 rounded px-2 text-xs
                              font-medium ${meta.cell}`}
                >
                  <span aria-hidden className="font-semibold">
                    {meta.mark}
                  </span>
                  {meta.label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
