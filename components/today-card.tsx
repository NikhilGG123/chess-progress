"use client";

import Link from "next/link";
import { formatSessionDate, formatSessionTime } from "@/lib/format";
import { NewSessionForm } from "./new-session-form";
import { useToday } from "./use-today";
import type { Program } from "@/lib/types";

type SessionSummary = {
  id: string;
  session_date: string;
  session_time: string | null;
  attendance_count: number;
};

/**
 * The card at the top of the home page: today's classes, or an invitation to
 * start one. Which classes are "today" is the coach's question, not the
 * server's -- see use-today.ts -- hence the placeholder on first paint.
 */
export function TodayCard({
  sessions,
  programs,
}: {
  sessions: SessionSummary[];
  programs: Program[];
}) {
  const today = useToday();

  if (!today) {
    return (
      <div className="h-32 animate-pulse rounded-lg border border-border bg-surface-raised" />
    );
  }

  const todays = sessions.filter((session) => session.session_date === today);

  if (todays.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-raised p-5">
        <h2 className="text-sm font-medium">No class recorded for today</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Create the session, take attendance, and the grid opens ready to mark.
        </p>
        <NewSessionForm
          defaultDate={today}
          programs={programs}
          submitLabel="Start today&rsquo;s class"
        />
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {todays.map((session) => (
        <li key={session.id}>
          <Link
            href={`/sessions/${session.id}`}
            className="block rounded-lg border border-border bg-surface-raised p-5
                       transition-colors duration-200 hover:border-border-strong hover:bg-muted"
          >
            <p className="text-sm font-medium">
              Today
              {session.session_time && (
                <span className="text-muted-foreground">
                  {" "}
                  · {formatSessionTime(session.session_time)}
                </span>
              )}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatSessionDate(session.session_date)} ·{" "}
              <span className="tabular">{session.attendance_count}</span> checked
              in
            </p>
            <p className="mt-3 text-sm font-medium">Open the grid →</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
