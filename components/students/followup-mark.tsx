import { formatSessionDate } from "@/lib/format";

/**
 * The quiet marker beside a flagged student's name.
 *
 * Small on purpose. It appears at check-in and on the roster, which are
 * screens a coach opens in a room containing the students and sometimes their
 * parents -- so it has to be noticeable to whoever is looking for it and
 * meaningless to whoever is reading over a shoulder. It says nothing about
 * money, and there is nothing about money behind it to say.
 *
 * Not colour alone: the dot carries a title and an accessible name, so it is
 * legible to a screen reader and to anyone who cannot pick amber out of a row.
 */
export function FollowupMark({ setAt }: { setAt?: string | null }) {
  const since = setAt
    ? ` since ${formatSessionDate(setAt.slice(0, 10), { weekday: false })}`
    : "";

  return (
    <span
      title={`Flagged for follow-up${since} — check Jumbula`}
      aria-label={`Flagged for follow-up${since}`}
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full
                 bg-status-needs-testing text-[0.6rem] font-semibold
                 text-status-needs-testing-fg"
    >
      <span aria-hidden>!</span>
    </span>
  );
}
