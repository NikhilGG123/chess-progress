"use client";

import { useActionState, useEffect, useRef } from "react";
import { addTopic, type TopicFormState } from "@/app/(app)/curriculum/actions";
import { buttonClass } from "@/components/ui/button";

const initialState: TopicFormState = { error: null };

/** One-line form at the foot of a level's topic list, on the curriculum page. */
export function AddTopicForm({ levelId }: { levelId: string }) {
  const [state, formAction, pending] = useActionState(addTopic, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the box after a successful add so several topics can be typed in a
  // row. useActionState keeps the same state object on failure, so the text
  // survives an error.
  useEffect(() => {
    if (!pending && !state.error) formRef.current?.reset();
  }, [pending, state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="level_id" value={levelId} />
      <input
        name="name"
        required
        placeholder="New topic name"
        aria-label="New topic name"
        className="h-10 min-w-[12rem] flex-1 rounded-md border border-border-strong bg-surface
                   px-3 text-sm placeholder:text-muted-foreground"
      />
      <button
        type="submit"
        disabled={pending}
        className={buttonClass("secondary", "md")}
      >
        {pending ? "Adding…" : "Add topic"}
      </button>

      {state.error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
