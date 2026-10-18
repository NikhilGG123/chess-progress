import { ClassSeriesForm } from "@/components/sessions/class-series-form";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Button } from "@/components/ui/button";
import { NewSessionForm } from "@/components/sessions/new-session-form";
import { SessionLog } from "@/components/sessions/session-log";
import {
  formatSessionDate,
  formatSessionTime,
  minutesNowIso,
  todayIso,
} from "@/lib/format";
import { getClassSeries, getPrograms, getSessions } from "@/lib/queries";
import { weekdayLabel } from "@/lib/weekdays";
import { extendSeries, stopSeries } from "./actions";

/**
 * The calendar: the repeating timetable, a form for one-off classes, and the
 * log of every session, upcoming first.
 */
export default async function SessionsPage() {
  const [sessions, series, programs] = await Promise.all([
    getSessions(),
    getClassSeries(),
    getPrograms(),
  ]);

  // The date input needs a default. The server's idea of "today" is close
  // enough for a pre-filled field the coach can change, unlike the "is there a
  // class today?" question on the home page, which must be exact.
  const defaultDate = new Date().toISOString().slice(0, 10);
  const activeSeries = series.filter((entry) => entry.is_active);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        What is coming up, then everything already taught. Opening one takes you
        to its attendance list and grid.
      </p>

      {/* Folded away by default. The timetable is set once and then rarely
          touched, but it is fourteen rows of buttons sitting above the log
          every single time. */}
      <CollapsibleSection
        id="series"
        title="Repeating classes"
        count={activeSeries.length}
        summary="the timetable"
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Describe the timetable once and the classes appear on the calendar.
          They are ordinary sessions once created — delete one you are not
          running, or add an extra, without upsetting the pattern.
        </p>

        {activeSeries.length > 0 && (
          <ul className="mb-4 divide-y divide-border rounded-lg border border-border bg-surface-raised">
            {activeSeries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
              >
                <div className="min-w-[12rem] flex-1">
                  <p className="text-sm font-medium">{entry.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {weekdayLabel(entry.weekdays)}
                    {entry.session_time &&
                      ` · ${formatSessionTime(entry.session_time)}`}
                    {" · "}
                    <span className="tabular">{entry.upcoming}</span> upcoming
                    {entry.generated_through &&
                      ` · through ${formatSessionDate(entry.generated_through, { weekday: false })}`}
                  </p>
                </div>

                <form action={extendSeries}>
                  <input type="hidden" name="series_id" value={entry.id} />
                  <input type="hidden" name="weeks" value="8" />
                  <Button type="submit" size="sm">
                    Extend 8 weeks
                  </Button>
                </form>

                <ConfirmButton
                  size="sm"
                  action={stopSeries}
                  fields={{ series_id: entry.id }}
                  confirm={`Stop “${entry.name}”?

Its ${entry.upcoming} upcoming class${entry.upcoming === 1 ? "" : "es"} will be removed from the calendar.
Classes that already have students checked in are kept.`}
                >
                  Stop
                </ConfirmButton>
              </li>
            ))}
          </ul>
        )}

        <details className="rounded-lg border border-border bg-surface-raised">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium">
            {activeSeries.length > 0
              ? "Add another repeating class"
              : "Set up a repeating class"}
          </summary>
          <div className="border-t border-border p-5">
            <ClassSeriesForm programs={programs} />
          </div>
        </details>
      </CollapsibleSection>

      <section className="mb-8 rounded-lg border border-border bg-surface-raised p-5">
        <h2 className="mb-1 text-sm font-medium">One-off session</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          A make-up class, or anything off the timetable.
        </p>
        <NewSessionForm
          defaultDate={defaultDate}
          defaultTime="16:30"
          programs={programs}
        />
      </section>

      <SessionLog
        sessions={sessions}
        serverToday={todayIso()}
        serverMinutes={minutesNowIso()}
      />
    </main>
  );
}
