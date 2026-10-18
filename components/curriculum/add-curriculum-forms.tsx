"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  addLevel,
  addProgram,
  type TopicFormState,
} from "@/app/(app)/curriculum/actions";
import { buttonClass } from "@/components/ui/button";

const initialState: TopicFormState = { error: null };

/**
 * Adding a level to a programme, and adding a programme.
 *
 * Same shape as AddTopicForm on purpose -- type, submit, the box clears, the
 * text survives an error -- because these three forms sit on one page and
 * behaving differently would be its own small surprise.
 */

function useResettingAction(action: typeof addProgram) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) formRef.current?.reset();
  }, [pending, state]);

  return { state, formAction, pending, formRef };
}

export function AddLevelForm({ programId }: { programId: string }) {
  const { state, formAction, pending, formRef } = useResettingAction(addLevel);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="program_id" value={programId} />
      <input
        name="name"
        required
        placeholder="New level name"
        aria-label="New level name"
        className="h-10 min-w-[12rem] flex-1 rounded-md border border-border-strong bg-surface
                   px-3 text-sm placeholder:text-muted-foreground"
      />
      <button
        type="submit"
        disabled={pending}
        className={buttonClass("secondary", "md")}
      >
        {pending ? "Adding…" : "Add a level"}
      </button>

      {state.error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function AddProgramForm() {
  const { state, formAction, pending, formRef } =
    useResettingAction(addProgram);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        name="name"
        required
        placeholder="Coding, for instance"
        aria-label="New programme name"
        className="h-10 min-w-[12rem] flex-1 rounded-md border border-border-strong bg-surface
                   px-3 text-sm placeholder:text-muted-foreground"
      />
      <button
        type="submit"
        disabled={pending}
        className={buttonClass("secondary", "md")}
      >
        {pending ? "Adding…" : "Add a programme"}
      </button>

      {state.error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
