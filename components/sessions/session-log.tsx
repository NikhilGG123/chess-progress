"use client";

import Link from "next/link";
import { useState } from "react";
import { formatSessionDate, formatSessionTime, hasStarted } from "@/lib/format";
import type { SessionSummary } from "@/lib/queries";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { useMinutesNow, useToday } from "@/hooks/use-today";
import { buttonClass } from "@/components/ui/button";

/**
 * Which side of today a class falls on.
 *
 * This did not used to matter: nothing existed past today, so "newest first"
 * and "most recent" were the same list. Once the calendar started generating
 * itself eight weeks ahead, both pages filled with classes that have not
 * happened -- the home page offered a coach six lessons to "pick up where you
 * left off" that nobody had taught yet, and the sessions log buried last
 * Friday under a hundred future dates.
 *
 * The date comes from the coach's own calendar; see use-today.ts for why that
 * matters. The server's date is rendered first so the page arrives with its
 * classes in it rather than a placeholder, and hydration corrects the handful
 * of evening hours where the two disagree. Being a day out for a moment costs
 * a row in the wrong section; it cannot lose anybody's record.
 */
function SessionRow({
  session,
  badge = false,
  topicLimit = 3,
}: {
  session: SessionSummary;
  /** The sessions log labels the class; the home page keeps the line plain. */
  badge?: boolean;
  topicLimit?: number;
}) {
  return (
    <li>
      <Link
        href={`/sessions/${session.id}`}
        className="flex items-start justify-between gap-4 px-4 py-3
                   transition-colors duration-200 hover:bg-muted"
      >
        <span className="text-sm">
          {formatSessionDate(session.session_date)}
          {session.session_time && (
            <span className="text-muted-foreground">
              {" "}
              · {formatSessionTime(session.session_time)}
            </span>
          )}
          {session.series_name &&
            (badge ? (
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {session.series_name}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {" "}
                · {session.series_name}
              </span>
            ))}

          {/* What the class covered -- the part that makes this a log worth
              reading rather than a list of dates. */}
          {session.topics_covered.length > 0 && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {session.topics_covered.slice(0, topicLimit).join(" · ")}
              {session.topics_covered.length > topicLimit &&
                ` · +${session.topics_covered.length - topicLimit} more`}
            </span>
          )}
        </span>
        <span className="tabular shrink-0 text-xs text-muted-foreground">
          {session.attendance_count} present
        </span>
      </Link>
    </li>
  );
}

/** The home page: the last few classes that were actually taught. */
export function RecentClasses({
  sessions,
  serverToday,
  serverMinutes,
  limit = 6,
}: {
  sessions: SessionSummary[];
  serverToday: string;
  serverMinutes: number;
  limit?: number;
}) {
  const today = useToday() ?? serverToday;
  const minutesNow = useMinutesNow() ?? serverMinutes;

  // Started, not merely dated today. "On or before today" put Friday's 5:35
  // class among the lessons already taught at one in the afternoon, with
  // "0 present" beside it because nobody had walked in yet.
  //
  // A class stays here once it has begun rather than once it has ended: a
  // Friday runs 4:30 and 5:35 back to back, and during the second the first is
  // exactly what a coach means by "the one I just finished". Everything on
  // today's date is also on the card at the top of the page, all day.
  const recent = sessions
    .filter((session) => hasStarted(session, today, minutesNow))
    .slice(0, limit);

  if (recent.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface-raised px-4 py-6 text-center text-sm text-muted-foreground">
        No classes taught yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
      {recent.map((session) => (
        <SessionRow key={session.id} session={session} />
      ))}
    </ul>
  );
}

/**
 * The sessions page: what is coming, then what has been taught.
 *
 * Upcoming classes run nearest-first -- the next one to walk into is the one a
 * coach wants at the top -- and taught classes newest-first, which is how you
 * look something up.
 */
export function SessionLog({
  sessions,
  serverToday,
  serverMinutes,
}: {
  sessions: SessionSummary[];
  serverToday: string;
  serverMinutes: number;
}) {
  const today = useToday() ?? serverToday;
  const minutesNow = useMinutesNow() ?? serverMinutes;
  const [showAllTaught, setShowAllTaught] = useState(false);

  // The same line as the home page draws, so a class cannot be "already
  // taught" on one screen and "coming up" on the other.
  const upcoming = sessions
    .filter((session) => !hasStarted(session, today, minutesNow))
    .reverse();
  const taught = sessions.filter((session) =>
    hasStarted(session, today, minutesNow),
  );
  const shown = showAllTaught ? taught : taught.slice(0, 50);

  // Collapsed, the heading still answers the only question this list is
  // usually asked: when is the next one?
  const nextUp = upcoming[0]
    ? `${formatSessionDate(upcoming[0].session_date)}${
        upcoming[0].session_time
          ? ` ${formatSessionTime(upcoming[0].session_time)}`
          : ""
      }`
    : "none";

  return (
    <>
      {/* Folded away by default. The calendar generates eight weeks ahead, so
          this is a hundred rows of classes nobody has taught yet, sitting
          between a coach and the log they came to read. */}
      {upcoming.length > 0 && (
        <CollapsibleSection
          id="upcoming"
          title="Coming up"
          count={upcoming.length}
          summary={`next is ${nextUp}`}
        >
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
            {upcoming.map((session) => (
              <SessionRow key={session.id} session={session} badge />
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* Open by default: this is what the page is for. */}
      <CollapsibleSection
        id="taught"
        title="Already taught"
        count={taught.length}
        summary={
          taught[0]
            ? `last was ${formatSessionDate(taught[0].session_date)}`
            : undefined
        }
        defaultOpen
      >
        {taught.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface-raised px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing yet. The first class you take attendance in appears here.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
              {shown.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  badge
                  topicLimit={4}
                />
              ))}
            </ul>

            {/* Their imported history is 500 classes long and growing. Showing
                it all makes a page nobody scrolls to the end of. */}
            {!showAllTaught && taught.length > shown.length && (
              <button
                type="button"
                onClick={() => setShowAllTaught(true)}
                className={buttonClass("secondary", "md", "mt-3 w-full")}
              >
                Show the other {taught.length - shown.length}
              </button>
            )}
          </>
        )}
      </CollapsibleSection>
    </>
  );
}
