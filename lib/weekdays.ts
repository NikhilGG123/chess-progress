// Days of the week, numbered the way Postgres numbers them.
//
// extract(dow) yields 0 for Sunday through 6 for Saturday, and
// generate_series_sessions() compares against exactly that, so these values
// travel from a checkbox to the database untouched. The list starts on Monday
// because that is how a timetable reads, not how Postgres counts.
//
// Lives in lib/ rather than beside the form: the sessions page renders these
// labels on the server, and a value exported from a "use client" module is not
// a real value there.
export const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 0, short: "Sun", long: "Sunday" },
] as const;

/** [3, 5] -> "Wed · Fri", always in timetable order. */
export function weekdayLabel(weekdays: number[]): string {
  return WEEKDAYS.filter((day) => weekdays.includes(day.value))
    .map((day) => day.short)
    .join(" · ");
}
