"use client";

import { useEffect } from "react";

/**
 * What a coach sees when something genuinely failed.
 *
 * The alternative is worse than an error screen: an action that quietly does
 * nothing looks exactly like one that worked, and a coach walks away believing
 * a level was changed or a topic renamed when it was not.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
      <div className="rounded-lg border border-border bg-surface-raised p-6">
        <h1 className="text-lg font-semibold">That didn&apos;t save</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing was changed. Try again — if it keeps happening, the message
          below is the useful part.
        </p>

        <p className="mt-3 rounded bg-muted px-3 py-2 font-mono text-xs break-words">
          {error.message || "Unknown error"}
          {error.digest && (
            <span className="text-muted-foreground"> ({error.digest})</span>
          )}
        </p>

        <button
          type="button"
          onClick={reset}
          className="mt-4 h-10 cursor-pointer rounded-md bg-primary px-4 text-sm font-medium
                     text-primary-foreground transition-opacity duration-200 hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
