"use client";

import { useMemo, useState } from "react";
import {
  setAttendance,
  setAttendanceBulk,
  setRegular,
} from "@/app/(app)/actions";

export type AttendanceStudent = {
  id: string;
  full_name: string;
  level_id: string | null;
  level_label: string;
  level_number: number | null;
};

/**
 * Check-in list, grouped by level.
 *
 * Built for the real roster rather than the demo one: several hundred names
 * ticked one at a time at 4:30pm is not a workflow. Search narrows the list,
 * each level can be checked in as a group, and the regulars -- the children who
 * come to this class every week, starred by a coach -- go in with one press.
 * Drop-ins stay ordinary students, found by search.
 *
 * Toggles wait for the server rather than pretending to be instant: attendance
 * decides which students the grid below renders, and a half-applied list would
 * show a coach a grid missing a child.
 */
export function AttendanceList({
  sessionId,
  students,
  presentIds,
  seriesId,
  regularIds,
}: {
  sessionId: string;
  students: AttendanceStudent[];
  presentIds: string[];
  /** Stars belong to the repeating class, so a one-off session has none. */
  seriesId: string | null;
  regularIds: string[];
}) {
  const [present, setPresent] = useState(() => new Set(presentIds));
  const [regulars, setRegulars] = useState(() => new Set(regularIds));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const missingRegulars = students.filter(
    (student) => regulars.has(student.id) && !present.has(student.id),
  ).length;
  const visible = useMemo(
    () =>
      needle
        ? students.filter((student) =>
            student.full_name.toLowerCase().includes(needle),
          )
        : students,
    [students, needle],
  );

  // Grouped by level, levels in order, "no level" last.
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; order: number; students: AttendanceStudent[] }>();
    for (const student of visible) {
      const key = student.level_id ?? "none";
      if (!map.has(key)) {
        map.set(key, {
          label: student.level_label,
          order: student.level_number ?? 99,
          students: [],
        });
      }
      map.get(key)!.students.push(student);
    }
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [visible]);

  async function toggle(studentId: string) {
    const nowPresent = !present.has(studentId);
    setBusy(studentId);
    setError(null);

    const result = await setAttendance({ sessionId, studentId, present: nowPresent });

    if (result.error) {
      setError(result.error);
    } else {
      setPresent((current) => {
        const next = new Set(current);
        if (nowPresent) next.add(studentId);
        else next.delete(studentId);
        return next;
      });
    }
    setBusy(null);
  }

  async function toggleRegular(studentId: string) {
    if (!seriesId) return;
    const nowRegular = !regulars.has(studentId);

    // Optimistic, unlike attendance: a star is a preference about future
    // classes, not a record of who was in the room. Worst case it flips back.
    setRegulars((current) => {
      const next = new Set(current);
      if (nowRegular) next.add(studentId);
      else next.delete(studentId);
      return next;
    });
    setError(null);

    const result = await setRegular({ seriesId, studentId, isRegular: nowRegular });

    if (result.error) {
      setRegulars((current) => {
        const next = new Set(current);
        if (nowRegular) next.delete(studentId);
        else next.add(studentId);
        return next;
      });
      setError(result.error);
    }
  }

  async function checkInRegulars() {
    const ids = students
      .filter((student) => regulars.has(student.id) && !present.has(student.id))
      .map((student) => student.id);
    if (ids.length === 0) return;

    setBusy("group");
    setError(null);

    const result = await setAttendanceBulk({ sessionId, studentIds: ids, present: true });

    if (result.error) {
      setError(result.error);
    } else {
      setPresent((current) => new Set([...current, ...ids]));
    }
    setBusy(null);
  }

  async function toggleGroup(groupStudents: AttendanceStudent[], nowPresent: boolean) {
    const ids = groupStudents
      .filter((student) => present.has(student.id) !== nowPresent)
      .map((student) => student.id);
    if (ids.length === 0) return;

    setBusy("group");
    setError(null);

    const result = await setAttendanceBulk({ sessionId, studentIds: ids, present: nowPresent });

    if (result.error) {
      setError(result.error);
    } else {
      setPresent((current) => {
        const next = new Set(current);
        for (const id of ids) {
          if (nowPresent) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    }
    setBusy(null);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="tabular font-medium text-foreground">{present.size}</span>{" "}
          of {students.length} checked in
          {needle && (
            <span className="tabular">
              {" "}
              · showing {visible.length}
            </span>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {seriesId && regulars.size > 0 && (
            <button
              type="button"
              disabled={busy !== null || missingRegulars === 0}
              onClick={checkInRegulars}
              className="h-10 cursor-pointer rounded-md border border-border-strong px-3
                         text-sm font-medium transition-colors duration-200 hover:bg-muted
                         disabled:cursor-not-allowed disabled:opacity-60"
            >
              {missingRegulars === 0
                ? `All ${regulars.size} regulars in`
                : `Check in ${missingRegulars} regular${missingRegulars === 1 ? "" : "s"}`}
            </button>
          )}

          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search students…"
            aria-label="Search students"
            className="h-10 w-full max-w-xs rounded-md border border-border-strong bg-surface px-3
                       text-sm placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          Could not update attendance: {error}
        </p>
      )}

      {groups.length === 0 && (
        <p className="rounded-lg border border-border bg-surface-raised px-4 py-6 text-center text-sm text-muted-foreground">
          No students match “{query}”.
        </p>
      )}

      {groups.map((group) => {
        const allIn = group.students.every((student) => present.has(student.id));

        return (
          <section key={group.label} className="mb-5">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h3 className="text-sm font-medium">
                {group.label}{" "}
                <span className="tabular font-normal text-muted-foreground">
                  ({group.students.filter((s) => present.has(s.id)).length}/
                  {group.students.length})
                </span>
              </h3>

              <button
                type="button"
                disabled={busy !== null}
                onClick={() => toggleGroup(group.students, !allIn)}
                className="h-8 cursor-pointer rounded-md border border-border-strong px-2.5
                           text-xs font-medium transition-colors duration-200 hover:bg-muted
                           disabled:cursor-not-allowed disabled:opacity-60"
              >
                {allIn ? "Clear all" : `Check in all ${group.students.length}`}
              </button>
            </div>

            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {group.students.map((student) => {
                const checked = present.has(student.id);
                return (
                  <li key={student.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5
                                  transition-colors duration-200 ${
                                    checked
                                      ? "border-border-strong bg-muted"
                                      : "border-border bg-surface-raised hover:bg-muted"
                                  }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy !== null}
                        onChange={() => toggle(student.id)}
                        className="h-4 w-4 accent-[var(--ring)]"
                      />
                      <span className="flex-1 text-sm">{student.full_name}</span>

                      {seriesId && (
                        <button
                          type="button"
                          onClick={(event) => {
                            // The row is a <label> wrapping the checkbox, so a
                            // plain click here would also toggle attendance.
                            event.preventDefault();
                            event.stopPropagation();
                            toggleRegular(student.id);
                          }}
                          aria-pressed={regulars.has(student.id)}
                          aria-label={
                            regulars.has(student.id)
                              ? `${student.full_name} is a regular of this class. Remove.`
                              : `Mark ${student.full_name} as a regular of this class.`
                          }
                          className={`cursor-pointer text-base leading-none transition-colors
                                      duration-200 ${
                                        regulars.has(student.id)
                                          ? "text-status-needs-testing-fg"
                                          : "text-border-strong hover:text-muted-foreground"
                                      }`}
                        >
                          {regulars.has(student.id) ? "★" : "☆"}
                        </button>
                      )}
                      {busy === student.id && (
                        <span className="text-xs text-muted-foreground">Saving…</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
