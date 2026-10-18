"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { setStudentActive } from "@/app/(app)/roster/actions";
import { EnrollmentSelect } from "@/components/students/enrollment-select";
import { FollowupMark } from "@/components/students/followup-mark";
import { Button } from "@/components/ui/button";
import type { Level, Program, StudentWithEnrollments } from "@/lib/types";

/**
 * The roster, searchable.
 *
 * Ten demo students fit on a screen; the centre's real list runs to several
 * hundred names going back to 2020. Filtering happens in the browser because
 * the page already has every row, so typing stays instant -- if the roster ever
 * outgrows a single query, this is the place that has to change.
 */
export function RosterList({
  students,
  levels,
  programs,
}: {
  students: StudentWithEnrollments[];
  levels: Level[];
  programs: Program[];
}) {
  const levelsOf = (programId: string) =>
    levels.filter((level) => level.program_id === programId);
  const [query, setQuery] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);

  const needle = query.trim().toLowerCase();

  const [active, removed] = useMemo(() => {
    const matching = needle
      ? students.filter((student) =>
          student.full_name.toLowerCase().includes(needle),
        )
      : students;

    return [
      matching.filter((student) => student.is_active),
      matching.filter((student) => !student.is_active),
    ];
  }, [students, needle]);

  const totalActive = students.filter((student) => student.is_active).length;

  /**
   * Only the first sixty rows are rendered.
   *
   * The browser already holds every student -- the data is a few tens of
   * kilobytes -- but rendering all 645 produced 1.3MB of markup, because each
   * row carries a form, a level select with five options and a remove button.
   * Nobody reads a 645-row list; they search. The rest are one keystroke away
   * and the count says so.
   */
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? active : active.slice(0, 60);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">
          Active{" "}
          <span className="tabular font-normal text-muted-foreground">
            ({needle ? `${active.length} of ${totalActive}` : totalActive})
          </span>
        </h2>

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name…"
          aria-label="Search the roster"
          className="h-10 w-full max-w-xs rounded-md border border-border-strong bg-surface px-3
                     text-sm placeholder:text-muted-foreground"
        />
      </div>

      {active.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-raised px-4 py-8 text-center text-sm text-muted-foreground">
          {needle
            ? `No active students match “${query}”.`
            : "No active students yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
          {shown.map((student) => (
            <li
              key={student.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
            >
              <span className="flex min-w-[10rem] flex-1 items-center gap-2">
                <Link
                  href={`/students/${student.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {student.full_name}
                </Link>
                {student.needs_followup && (
                  <FollowupMark setAt={student.followup_set_at} />
                )}
              </span>

              <div className="flex flex-wrap items-center gap-2">
                {programs.map((program) => (
                  <EnrollmentSelect
                    key={program.id}
                    studentId={student.id}
                    program={program}
                    levels={levelsOf(program.id)}
                    currentLevelId={
                      student.enrollments.find(
                        (e) => e.program.id === program.id,
                      )?.level?.id ?? null
                    }
                  />
                ))}
              </div>

              <form action={setStudentActive}>
                <input type="hidden" name="student_id" value={student.id} />
                <input type="hidden" name="is_active" value="false" />
                <Button type="submit" variant="danger" size="sm">
                  Remove
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {active.length > shown.length && (
        <Button
          variant="ghost"
          onClick={() => setShowAll(true)}
          className="mt-3 w-full border-border"
        >
          Showing {shown.length} of {active.length} — search for a name, or show
          them all
        </Button>
      )}

      {removed.length > 0 && (
        <section className="mt-8">
          <button
            type="button"
            onClick={() => setShowRemoved((current) => !current)}
            aria-expanded={showRemoved}
            className="cursor-pointer text-sm font-medium hover:underline"
          >
            Removed{" "}
            <span className="tabular font-normal text-muted-foreground">
              ({removed.length})
            </span>{" "}
            <span className="text-muted-foreground">
              {showRemoved ? "▾" : "▸"}
            </span>
          </button>

          {showRemoved && (
            <>
              <p className="mt-1 mb-3 text-sm text-muted-foreground">
                Their record is kept. Bringing one back restores exactly where
                they left off.
              </p>

              <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
                {removed.map((student) => (
                  <li
                    key={student.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <Link
                      href={`/students/${student.id}`}
                      className="min-w-[10rem] flex-1 text-sm text-muted-foreground hover:underline"
                    >
                      {student.full_name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {student.enrollments.length === 0
                        ? "Not enrolled"
                        : student.enrollments
                            .map(
                              (e) =>
                                `${e.program.name}: ${e.level?.name ?? "unplaced"}`,
                            )
                            .join(" · ")}
                    </span>

                    <form action={setStudentActive}>
                      <input
                        type="hidden"
                        name="student_id"
                        value={student.id}
                      />
                      <input type="hidden" name="is_active" value="true" />
                      <Button type="submit" size="sm">
                        Bring back
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
