"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { setFollowup } from "@/app/(app)/roster/actions";
import { formatSessionDate } from "@/lib/format";
import type { StudentWithEnrollments } from "@/lib/types";

/**
 * One checkbox per student. Ticked means: look this student up in Jumbula.
 *
 * That is the whole feature. No amount, no reason, no note -- the detail lives
 * in Jumbula, which is the system that actually holds it. See migration 0018.
 *
 * Search covers every student; the list shows the first sixty, matching the
 * roster so it behaves the way a coach already expects.
 */
export function FollowupList({
  students,
}: {
  students: StudentWithEnrollments[];
}) {
  const [flags, setFlags] = useState(
    () =>
      new Map(
        students.map((s) => [
          s.id,
          { on: s.needs_followup, at: s.followup_set_at },
        ]),
      ),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const needle = query.trim().toLowerCase();

  // Flagged first: this page exists to answer "who needs looking at", and
  // burying those in an alphabetical list of 645 would defeat it.
  const ordered = useMemo(() => {
    const matching = needle
      ? students.filter((s) => s.full_name.toLowerCase().includes(needle))
      : students;

    return [...matching].sort((a, b) => {
      const flaggedA = flags.get(a.id)?.on ? 0 : 1;
      const flaggedB = flags.get(b.id)?.on ? 0 : 1;
      return flaggedA - flaggedB || a.full_name.localeCompare(b.full_name);
    });
  }, [students, needle, flags]);

  const flaggedCount = [...flags.values()].filter((f) => f.on).length;
  const shown = showAll || needle ? ordered : ordered.slice(0, 60);

  async function toggle(studentId: string) {
    const now = !flags.get(studentId)?.on;
    setBusy(studentId);
    setError(null);

    const result = await setFollowup({ studentId, needsFollowup: now });

    if (result.error) {
      setError(`Could not save that: ${result.error}`);
    } else {
      setFlags((current) => {
        const next = new Map(current);
        next.set(studentId, {
          on: now,
          at: now ? new Date().toISOString() : null,
        });
        return next;
      });
    }
    setBusy(null);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="tabular font-medium text-foreground">
            {flaggedCount}
          </span>{" "}
          flagged
          {needle && (
            <span>
              {" "}
              · <span className="tabular">{ordered.length}</span> matching
            </span>
          )}
        </p>

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name…"
          aria-label="Search students"
          className="h-10 w-full max-w-xs rounded-md border border-border-strong bg-surface px-3
                     text-sm placeholder:text-muted-foreground"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-raised px-4 py-8 text-center text-sm text-muted-foreground">
          {needle ? `Nobody matches “${query}”.` : "No students yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
          {shown.map((student) => {
            const flag = flags.get(student.id);
            const on = Boolean(flag?.on);

            return (
              <li
                key={student.id}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <input
                  type="checkbox"
                  id={`followup-${student.id}`}
                  checked={on}
                  disabled={busy === student.id}
                  onChange={() => toggle(student.id)}
                  className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--ring)]
                             disabled:cursor-not-allowed disabled:opacity-50"
                />

                <label
                  htmlFor={`followup-${student.id}`}
                  className="min-w-0 flex-1 cursor-pointer text-sm"
                >
                  <span className={on ? "font-medium" : ""}>
                    {student.full_name}
                  </span>
                  {on && flag?.at && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      since{" "}
                      {formatSessionDate(flag.at.slice(0, 10), {
                        weekday: false,
                      })}
                    </span>
                  )}
                </label>

                <Link
                  href={`/students/${student.id}`}
                  className="shrink-0 text-xs text-muted-foreground hover:underline"
                >
                  Record
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {!showAll && !needle && ordered.length > shown.length && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 h-10 w-full cursor-pointer rounded-md border border-border text-sm
                     text-muted-foreground transition-colors duration-200 hover:bg-muted"
        >
          Showing {shown.length} of {ordered.length} — search for a name, or
          show them all
        </button>
      )}
    </div>
  );
}
