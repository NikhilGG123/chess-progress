"use client";

import { useRef } from "react";
import { setEnrollment } from "@/app/(app)/roster/actions";
import type { Level, Program } from "@/lib/types";

/**
 * A student's level in one programme, changed in a single step.
 *
 * One of these per programme, so a child doing chess and coding has two and
 * they never interfere. "Not enrolled" is a real option: it removes them from
 * that programme without touching what they had already learned in it.
 */
export function EnrollmentSelect({
  studentId,
  program,
  levels,
  currentLevelId,
}: {
  studentId: string;
  program: Program;
  /** Only the levels belonging to this programme. */
  levels: Level[];
  currentLevelId: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={setEnrollment} className="flex items-center gap-1.5">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="program_id" value={program.id} />
      <span className="text-xs text-muted-foreground">{program.name}</span>
      <select
        name="level_id"
        defaultValue={currentLevelId ?? ""}
        aria-label={`${program.name} level`}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm"
      >
        <option value="">Not enrolled</option>
        {levels.map((level) => (
          <option key={level.id} value={level.id}>
            {level.name}
          </option>
        ))}
      </select>
    </form>
  );
}
