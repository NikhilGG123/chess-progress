import { BackupButton } from "@/components/backup-button";
import { currentCoach } from "@/lib/queries";
import { createClient } from "@/utils/supabase/server";

async function rowCounts() {
  const supabase = await createClient();
  const tables = [
    "students",
    "progress",
    "sessions",
    "attendance",
    "progress_events",
  ] as const;

  const counts = await Promise.all(
    tables.map(async (table) => {
      const { count } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });
      return { table, count: count ?? 0 };
    }),
  );

  return counts;
}

/**
 * The page you have to go looking for.
 *
 * Everything here is either destructive or holds the whole database, so it is
 * deliberately not on the way to anywhere. Ordinary coaching never needs it.
 */
export default async function AdminPage() {
  const { isAdmin, coach } = await currentCoach();

  if (!isAdmin) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
        <div className="rounded-lg border border-border bg-surface-raised p-6">
          <h1 className="text-lg font-semibold">Admin only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You are signed in as {coach?.display_name ?? "a coach"}. Backups and
            the destructive tools live behind the Admin account, so that a
            mis-click during a class cannot delete anything that matters.
          </p>
        </div>
      </main>
    );
  }

  const counts = await rowCounts();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Signed in as Admin. Deleting topics, levels and students is possible
        from their usual pages while you are on this account — take a backup
        first.
      </p>

      <section className="mb-8 rounded-lg border border-border bg-surface-raised p-5">
        <h2 className="text-sm font-medium">Backup</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          The free Supabase plan takes <strong>no automatic backups at all</strong>.
          A nightly job keeps a copy, and this button is the one to press before
          anything irreversible — an import, a bulk delete, the end of term.
        </p>
        <BackupButton />
      </section>

      <section className="rounded-lg border border-border bg-surface-raised p-5">
        <h2 className="mb-3 text-sm font-medium">What is in the database</h2>
        <ul className="divide-y divide-border text-sm">
          {counts.map(({ table, count }) => (
            <li key={table} className="flex justify-between py-2">
              <span className="text-muted-foreground">{table}</span>
              <span className="tabular font-medium">{count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
