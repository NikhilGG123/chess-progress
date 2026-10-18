"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addStudent, type RosterFormState } from "@/app/(app)/roster/actions";
import type { Level, Program } from "@/lib/types";
import { buttonClass } from "@/components/ui/button";

const initialState: RosterFormState = { error: null, added: null };

/**
 * Add a student to the roster, enrolled in a programme and optionally placed
 * at a level. Enrolling at a level gives them a blank cell for every topic in
 * it, so they appear in that level's grid straight away.
 */
export function AddStudentForm({
  levels,
  programs,
}: {
  levels: Level[];
  programs: Program[];
}) {
  // One programme is the common case; the picker only earns its place once
  // there are two.
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [state, formAction, pending] = useActionState(addStudent, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Coaches add a handful of students in a row. Clear the field and put the
  // cursor back so the next name can just be typed.
  useEffect(() => {
    if (state.added) {
      formRef.current?.reset();
      nameRef.current?.focus();
    }
  }, [state.added]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex min-w-[14rem] flex-1 flex-col gap-1.5">
        <label htmlFor="full_name" className="text-sm font-medium">
          Student name
        </label>
        <input
          ref={nameRef}
          id="full_name"
          name="full_name"
          required
          autoComplete="off"
          className="h-11 rounded-md border border-border-strong bg-surface px-3 text-base"
        />
      </div>

      {programs.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="program_id" className="text-sm font-medium">
            Programme
          </label>
          <select
            id="program_id"
            name="program_id"
            value={programId}
            onChange={(event) => setProgramId(event.target.value)}
            className="h-11 rounded-md border border-border-strong bg-surface px-3 text-base"
          >
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {programs.length <= 1 && (
        <input type="hidden" name="program_id" value={programId} />
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="level_id" className="text-sm font-medium">
          Level
        </label>
        <select
          id="level_id"
          name="level_id"
          defaultValue=""
          className="h-11 rounded-md border border-border-strong bg-surface px-3 text-base"
        >
          <option value="">Not set yet</option>
          {levels
            .filter((level) => level.program_id === programId)
            .map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={pending}
        className={buttonClass("primary", "lg")}
      >
        {pending ? "Adding…" : "Add student"}
      </button>

      <p aria-live="polite" className="w-full text-sm">
        {state.error ? (
          <span role="alert" className="text-destructive">
            {state.error}
          </span>
        ) : state.added ? (
          <span className="text-muted-foreground">
            Added {state.added}. Their level&apos;s topics start at “not seen”.
          </span>
        ) : null}
      </p>
    </form>
  );
}
