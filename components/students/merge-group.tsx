"use client";

import { useState } from "react";
import { dismissMerge, mergeStudents } from "@/app/(app)/roster/actions";
import { formatSessionDate } from "@/lib/format";
import type { MergeGroup } from "@/lib/queries";
import { buttonClass } from "@/components/ui/button";

/**
 * One set of pages that might be the same child.
 *
 * The coach decides; this only shows the evidence and carries the decision out.
 * Deliberately not automated -- the centre wrote first names only for years, so
 * "Rohan" could be one child across three levels or three different children, and
 * fusing two children's records is far worse than leaving them apart.
 *
 * The page kept is the one with the most marked up, since the others are
 * usually thinner pages from earlier levels, but a coach can pick any of them.
 */
export function MergeGroupCard({ group }: { group: MergeGroup }) {
  const [keepId, setKeepId] = useState(group.students[0].id);
  const [name, setName] = useState(group.suggestedName);
  const [busy, setBusy] = useState<"merge" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function merge() {
    setBusy("merge");
    setError(null);

    const result = await mergeStudents({
      keepId,
      absorbIds: group.students.filter((s) => s.id !== keepId).map((s) => s.id),
      fullName: name,
    });

    if (result.error) setError(result.error);
    else setDone(`Merged into ${name.trim() || "one record"}.`);
    setBusy(null);
  }

  async function dismiss() {
    setBusy("dismiss");
    setError(null);

    const result = await dismissMerge(group.students.map((s) => s.id));

    if (result.error) setError(result.error);
    else setDone("Left as separate children.");
    setBusy(null);
  }

  if (done) {
    return (
      <li className="rounded-lg border border-border bg-surface-raised px-4 py-3 text-sm text-muted-foreground">
        {done}
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-border bg-surface-raised p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">
          {group.students.length} pages that might be{" "}
          <span className="font-semibold">{group.suggestedName}</span>
        </h2>
      </div>

      <ul className="mb-4 divide-y divide-border rounded-md border border-border">
        {group.students.map((student) => (
          <li
            key={student.id}
            className="flex flex-wrap items-start gap-3 px-3 py-2.5"
          >
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                name={`keep-${group.students[0].id}`}
                checked={keepId === student.id}
                onChange={() => setKeepId(student.id)}
                className="mt-1 h-4 w-4 accent-[var(--ring)]"
              />
              <span className="text-sm font-medium">
                {student.full_name}
                {!student.is_active && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    removed
                  </span>
                )}
              </span>
            </label>

            <div className="ml-auto text-right text-xs text-muted-foreground">
              <p>
                {student.levels.length > 0
                  ? student.levels.join(" · ")
                  : "not enrolled"}
              </p>
              <p className="tabular">
                {student.attended === 0
                  ? "never attended"
                  : `${student.attended} class${student.attended === 1 ? "" : "es"}` +
                    (student.firstSeen && student.lastSeen
                      ? ` · ${formatSessionDate(student.firstSeen, { weekday: false })} – ${formatSessionDate(student.lastSeen, { weekday: false })}`
                      : "")}
              </p>
              <p className="tabular">
                {student.marks} marked · {student.complete} complete
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[14rem] flex-1 flex-col gap-1.5">
          <label
            htmlFor={`name-${group.students[0].id}`}
            className="text-xs font-medium text-muted-foreground"
          >
            Their proper name
          </label>
          <input
            id={`name-${group.students[0].id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-10 rounded-md border border-border-strong bg-surface px-3 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={merge}
          disabled={busy !== null}
          className={buttonClass("primary", "md")}
        >
          {busy === "merge" ? "Merging…" : "Same child"}
        </button>

        <button
          type="button"
          onClick={dismiss}
          disabled={busy !== null}
          className={buttonClass("secondary", "md")}
        >
          {busy === "dismiss" ? "Saving…" : "Different children"}
        </button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Merging keeps every level, class, note and mark from all of these. Where
        two pages have the same topic, the one further along wins.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}
