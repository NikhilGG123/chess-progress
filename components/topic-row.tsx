"use client";

import { useRef } from "react";
import { deleteTopic, moveTopic, renameTopic } from "@/app/(app)/curriculum/actions";
import type { Topic } from "@/lib/types";

/**
 * One topic in the curriculum editor. Renaming saves when the field loses
 * focus, and only when the text actually changed -- tabbing through the list
 * should not fire a write per row.
 *
 * The controls are separate sibling forms rather than one form with several
 * buttons: forms cannot nest, and each of these posts to a different action.
 */
export function TopicRow({
  topic,
  isFirst,
  isLast,
  isAdmin,
}: {
  topic: Topic;
  isFirst: boolean;
  isLast: boolean;
  /** Deleting a topic erases every student's record of it, so it is gated. */
  isAdmin: boolean;
}) {
  const renameRef = useRef<HTMLFormElement>(null);

  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <span className="tabular w-6 shrink-0 text-xs text-muted-foreground">
        {topic.sort_order}
      </span>

      <form ref={renameRef} action={renameTopic} className="min-w-0 flex-1">
        <input type="hidden" name="topic_id" value={topic.id} />
        <input
          name="name"
          defaultValue={topic.name}
          aria-label={`Topic name: ${topic.name}`}
          onBlur={(event) => {
            if (event.target.value.trim() !== topic.name) {
              renameRef.current?.requestSubmit();
            }
          }}
          className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5
                     text-sm hover:border-border focus:border-border-strong focus:bg-surface"
        />
      </form>

      <div className="flex shrink-0 items-center gap-1">
        <form action={moveTopic}>
          <input type="hidden" name="topic_id" value={topic.id} />
          <input type="hidden" name="direction" value="up" />
          <button
            type="submit"
            disabled={isFirst}
            aria-label={`Move ${topic.name} up`}
            className="h-8 w-8 cursor-pointer rounded border border-border text-sm
                       transition-colors duration-200 hover:bg-muted
                       disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↑
          </button>
        </form>

        <form action={moveTopic}>
          <input type="hidden" name="topic_id" value={topic.id} />
          <input type="hidden" name="direction" value="down" />
          <button
            type="submit"
            disabled={isLast}
            aria-label={`Move ${topic.name} down`}
            className="h-8 w-8 cursor-pointer rounded border border-border text-sm
                       transition-colors duration-200 hover:bg-muted
                       disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↓
          </button>
        </form>

        {isAdmin && (
          <form
            action={deleteTopic}
            onSubmit={(event) => {
              // Deleting a topic takes every student's record of it with it.
              const ok = window.confirm(
                `Delete “${topic.name}”?

This also deletes every student's progress on this topic. It cannot be undone.`,
              );
              if (!ok) event.preventDefault();
            }}
          >
            <input type="hidden" name="topic_id" value={topic.id} />
            <button
              type="submit"
              aria-label={`Delete ${topic.name}`}
              className="h-8 w-8 cursor-pointer rounded border border-border text-sm
                         text-muted-foreground transition-colors duration-200
                         hover:border-destructive hover:text-destructive"
            >
              ×
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
