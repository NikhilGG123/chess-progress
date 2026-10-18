// Dates arrive from Postgres as plain 'YYYY-MM-DD' with no timezone. Passing
// that straight to `new Date()` parses it as UTC midnight, which renders as the
// previous day for anyone west of Greenwich -- a class on the 3rd showing as
// the 2nd. Splitting the parts and building a local date avoids that entirely.
export function formatSessionDate(
  date: string,
  { weekday = true } = {},
): string {
  const [year, month, day] = date.split("-").map(Number);
  const local = new Date(year, month - 1, day);

  return local.toLocaleDateString(undefined, {
    weekday: weekday ? "short" : undefined,
    day: "numeric",
    month: "short",
    year:
      local.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/** '16:30:00' -> '4:30 pm'. Sessions without a time simply show nothing. */
export function formatSessionTime(time: string | null): string {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date
    .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    .toLowerCase();
}

/** Today in the browser's/server's local calendar, as 'YYYY-MM-DD'. */
export function todayIso(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Has this class started yet, in the reader's own clock?
 *
 * A date on its own is not enough. "Recent classes" used to mean "on or before
 * today", which put Friday's 5:35 class in the list of lessons already taught
 * at one in the afternoon -- with "0 present" beside it, because nobody had
 * walked in yet.
 *
 * A class counts as having happened once it has *started*, not once it has
 * finished: from 5:36 onwards the 5:35 class is the one a coach is standing in
 * and the one they want to open. Classes with no time recorded are treated as
 * having happened, since a session created without one is almost always being
 * written up after the fact.
 */
export function hasStarted(
  session: { session_date: string; session_time: string | null },
  today: string,
  minutesNow: number,
): boolean {
  if (session.session_date !== today) return session.session_date < today;
  if (!session.session_time) return true;

  const [hours, minutes] = session.session_time.split(":").map(Number);
  return hours * 60 + minutes <= minutesNow;
}

/** Minutes since midnight, for the server's first paint before the client corrects it. */
export function minutesNowIso(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}
