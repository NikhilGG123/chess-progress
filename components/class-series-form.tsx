"use client";

import { useActionState, useEffect, useRef } from "react";
import { createSeries, type SeriesFormState } from "@/app/(app)/sessions/actions";
import { WEEKDAYS } from "@/lib/weekdays";
import { useToday } from "./use-today";
import type { Program } from "@/lib/types";

const initialState: SeriesFormState = { error: null, created: null };

export function ClassSeriesForm({ programs }: { programs: Program[] }) {
  const [state, formAction, pending] = useActionState(createSeries, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // The coach's own calendar date, not the server's -- a UTC host is already
  // on tomorrow by early evening in the Americas.
  const today = useToday() ?? "";

  useEffect(() => {
    if (state.created !== null) formRef.current?.reset();
  }, [state.created]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        {programs.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="series_program" className="text-sm font-medium">
                Programme
            </label>
            <select
                id="series_program"
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

        <div className="flex min-w-[14rem] flex-1 flex-col gap-1.5">
          <label htmlFor="series_name" className="text-sm font-medium">
            Class name
          </label>
          <input
            id="series_name"
            name="name"
            required
            placeholder="Level 1 — after school"
            className="h-11 rounded-md border border-border-strong bg-surface px-3 text-base
                       placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="series_time" className="text-sm font-medium">
            Time <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id="series_time"
            name="session_time"
            type="time"
            defaultValue="16:30"
            className="h-11 rounded-md border border-border-strong bg-surface px-3 text-base"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="series_start" className="text-sm font-medium">
            Starts
          </label>
          <input
            id="series_start"
            name="start_date"
            type="date"
            required
            defaultValue={today}
            className="h-11 rounded-md border border-border-strong bg-surface px-3 text-base"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="series_weeks" className="text-sm font-medium">
            Create ahead
          </label>
          <select
            id="series_weeks"
            name="weeks"
            defaultValue="8"
            className="h-11 rounded-md border border-border-strong bg-surface px-3 text-base"
          >
            <option value="4">4 weeks</option>
            <option value="8">8 weeks</option>
            <option value="12">12 weeks</option>
            <option value="16">16 weeks</option>
          </select>
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Runs on</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((day) => (
            <label
              key={day.value}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border
                         bg-surface px-3 py-2 text-sm transition-colors duration-200
                         hover:bg-muted has-checked:border-border-strong has-checked:bg-muted"
            >
              <input
                type="checkbox"
                name="weekdays"
                value={day.value}
                className="h-4 w-4 accent-[var(--ring)]"
              />
              <span aria-hidden>{day.short}</span>
              <span className="sr-only">{day.long}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-11 cursor-pointer rounded-md bg-primary px-4 text-base font-medium
                     text-primary-foreground transition-opacity duration-200 hover:opacity-90
                     disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create repeating class"}
        </button>

        <p aria-live="polite" className="text-sm">
          {state.error ? (
            <span role="alert" className="text-destructive">
              {state.error}
            </span>
          ) : state.created !== null ? (
            <span className="text-muted-foreground">
              Added {state.created} {state.created === 1 ? "class" : "classes"} to
              the calendar.
            </span>
          ) : null}
        </p>
      </div>
    </form>
  );
}
