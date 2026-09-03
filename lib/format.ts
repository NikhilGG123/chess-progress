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
    year: local.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
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
