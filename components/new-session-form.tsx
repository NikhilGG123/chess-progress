"use client";

import { useActionState } from "react";
import { createSession, type SessionFormState } from "@/app/(app)/sessions/actions";
import type { Program } from "@/lib/types";

const initialState: SessionFormState = { error: null };

export function NewSessionForm({
  defaultDate,
  defaultTime = "",
  submitLabel = "Create session",
  programs,
}: {
  defaultDate: string;
  defaultTime?: string;
  submitLabel?: string;
  /** A class belongs to one programme; the picker appears once there are two. */
  programs: Program[];
}) {
  const [state, formAction, pending] = useActionState(createSession, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      {programs.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="session_program" className="text-sm font-medium">
            Programme
          </label>
          <select
            id="session_program"
            name="program_id"
            defaultValue={programs[0]?.id ?? ""}
            className="h-11 rounded-md border border-border-strong bg-surface px-3 text-base"
          >
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="program_id" value={programs[0]?.id ?? ""} />
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="session_date" className="text-sm font-medium">
          Date
        </label>
        <input
          id="session_date"
          name="session_date"
          type="date"
          required
          defaultValue={defaultDate}
          className="h-11 rounded-md border border-border-strong bg-surface px-3 text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="session_time" className="text-sm font-medium">
          Time <span className="text-muted-foreground">(optional)</span>
        </label>
        <input
          id="session_time"
          name="session_time"
          type="time"
          defaultValue={defaultTime}
          className="h-11 rounded-md border border-border-strong bg-surface px-3 text-base"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="h-11 cursor-pointer rounded-md bg-primary px-4 text-base font-medium
                   text-primary-foreground transition-opacity duration-200 hover:opacity-90
                   disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creating…" : submitLabel}
      </button>

      {state.error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
