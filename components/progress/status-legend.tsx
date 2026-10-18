import { STATUSES, STATUS_META } from "@/lib/status";

// The grid uses the coaches' own shorthand. Spell it out once per page rather
// than relying on anyone remembering what a bare T means.
export function StatusLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {STATUSES.map((status) => {
        const meta = STATUS_META[status];
        return (
          <li key={status} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={`flex h-6 w-6 items-center justify-center rounded text-xs font-semibold ${meta.chip}`}
            >
              {meta.mark}
            </span>
            {/* Mark and label only. The full sentence was read once and then
                sat above the grid forever -- it is on every cell's title and
                accessible name, which is where somebody unsure of a mark
                actually looks. */}
            <span
              className="text-xs text-muted-foreground"
              title={meta.description}
            >
              {meta.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
