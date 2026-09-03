import { STATUSES, STATUS_META } from "@/lib/status";

// The grid uses the coaches' own shorthand. Spell it out once per page rather
// than relying on anyone remembering what a bare T means.
export function StatusLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {STATUSES.map((status) => {
        const meta = STATUS_META[status];
        return (
          <li key={status} className="flex items-center gap-2">
            <span
              aria-hidden
              className={`flex h-6 w-6 items-center justify-center rounded text-xs font-semibold ${meta.chip}`}
            >
              {meta.mark}
            </span>
            <span className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{meta.label}</span>
              {" — "}
              {meta.description}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
