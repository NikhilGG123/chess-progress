"use client";

import type { ReactNode } from "react";
import { setPersistedFlag, usePersistedFlag } from "@/hooks/use-persisted-flag";

/**
 * A section a coach can fold away, which stays folded next time.
 *
 * Three lists on the sessions page are long enough to be in the way -- the
 * fourteen repeating classes, the hundred-odd not yet taught, and four hundred
 * already taught. Written three times they would drift into three behaviours,
 * so it is written once.
 *
 * Two rules it exists to enforce:
 *
 * - The count stays in the heading. Folding a list away should not hide how
 *   much is in it.
 * - `summary` says something useful while closed -- "next is Fri, Sep 4 4:30
 *   pm". A collapsed section that answers the question you came with saves the
 *   click entirely.
 *
 * Closed sections render no children at all rather than hiding them with CSS,
 * which is where the page weight actually goes.
 */
export function CollapsibleSection({
  id,
  title,
  count,
  summary,
  defaultOpen = false,
  panel = false,
  children,
}: {
  /** Storage key. Stable across renames, so pick it once and leave it. */
  id: string;
  title: string;
  count?: number;
  /** Shown on the right while closed. */
  summary?: string;
  defaultOpen?: boolean;
  /** Wrap the contents in a card, for sections that were one before. */
  panel?: boolean;
  children: ReactNode;
}) {
  const storageKey = `section.${id}.open`;
  const open = usePersistedFlag(storageKey, defaultOpen);

  return (
    <section className="mb-8">
      <button
        type="button"
        onClick={() => setPersistedFlag(storageKey, !open)}
        aria-expanded={open}
        className="mb-3 flex w-full cursor-pointer items-center gap-2 text-sm font-medium
                   transition-colors duration-200 hover:text-muted-foreground"
      >
        <span
          aria-hidden
          className={`text-xs transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        {title}
        {count !== undefined && (
          <span className="tabular font-normal text-muted-foreground">
            ({count})
          </span>
        )}
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {open ? "hide" : (summary ?? "show")}
        </span>
      </button>

      {open &&
        (panel ? (
          <div className="rounded-lg border border-border bg-surface-raised p-5">
            {children}
          </div>
        ) : (
          children
        ))}
    </section>
  );
}
