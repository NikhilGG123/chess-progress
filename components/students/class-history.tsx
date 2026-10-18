import Link from "next/link";
import { formatSessionDate, formatSessionTime } from "@/lib/format";
import type { StudentClassHistory } from "@/lib/queries";
import { STATUS_META } from "@/lib/status";

/**
 * Every class this student attended, newest first, with what moved on the day.
 *
 * This is the answer to "what did she actually get out of last Wednesday",
 * which the status column alone cannot give: it holds where a student stands
 * now, not how they got there. The entries come from progress_events, so they
 * are what really happened rather than a reconstruction.
 *
 * A class with no change recorded still appears. Turning up and covering
 * ground without moving a mark is a normal week, and hiding those would make
 * the register look wrong.
 */
export function ClassHistory({ history }: { history: StudentClassHistory[] }) {
  if (history.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface-raised px-4 py-6 text-sm text-muted-foreground">
        No classes attended yet.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
      {history.map((entry) => (
        <li key={entry.sessionId} className="px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <Link
              href={`/sessions/${entry.sessionId}`}
              className="text-sm font-medium hover:underline"
            >
              {formatSessionDate(entry.date)}
              {entry.time && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {formatSessionTime(entry.time)}
                </span>
              )}
            </Link>
            {entry.className && (
              <span className="text-xs text-muted-foreground">
                {entry.className}
              </span>
            )}
          </div>

          {entry.topicsCovered.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Covered: {entry.topicsCovered.join(" · ")}
            </p>
          )}

          {entry.changes.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {entry.changes.map((change, index) => (
                <li
                  key={`${change.topic}-${index}`}
                  className="flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs"
                >
                  <span className="text-muted-foreground">{change.topic}</span>
                  {change.from && (
                    <>
                      <span
                        aria-hidden
                        className={`inline-grid h-4 w-4 place-items-center rounded text-[10px]
                                    font-semibold ${STATUS_META[change.from].chip}`}
                      >
                        {STATUS_META[change.from].mark}
                      </span>
                      <span aria-hidden className="text-muted-foreground">
                        →
                      </span>
                    </>
                  )}
                  <span
                    aria-hidden
                    className={`inline-grid h-4 w-4 place-items-center rounded text-[10px]
                                font-semibold ${STATUS_META[change.to].chip}`}
                  >
                    {STATUS_META[change.to].mark}
                  </span>
                  <span className="sr-only">
                    {change.from
                      ? `${change.topic}: ${STATUS_META[change.from].label} to ${STATUS_META[change.to].label}`
                      : `${change.topic}: set to ${STATUS_META[change.to].label}`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {entry.studentNote && (
            <p className="mt-2 text-sm whitespace-pre-wrap">
              {entry.studentNote}
            </p>
          )}

          {entry.classNote && (
            <p className="mt-1 text-xs text-muted-foreground italic">
              About the class: {entry.classNote}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
