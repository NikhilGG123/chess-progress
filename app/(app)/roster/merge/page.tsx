import Link from "next/link";
import { MergeGroupCard } from "@/components/students/merge-group";
import { getMergeCandidates } from "@/lib/queries";

/**
 * Tidying up: one child, several pages.
 *
 * The centre's old system kept a separate page per student per level, and for
 * years recorded first names only. So one child can appear as "Rohan", "Rohan M"
 * and "Rohan Mistry" across three levels, with their record split three ways.
 *
 * Tim: "I will need to go through manually and assign each topic sheet (Rohan
 * level 2, Rohan M level 3, etc) to their appropriate profile." This is that job,
 * done a child at a time with the evidence on screen, rather than in a
 * spreadsheet.
 *
 * Nothing is merged automatically anywhere in this app. The names are too thin
 * to be certain, and fusing two children's records is much worse than leaving
 * them apart.
 */
export default async function MergePage() {
  const groups = await getMergeCandidates();
  const pages = groups.reduce(
    (total, group) => total + group.students.length,
    0,
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Link
        href="/roster"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Roster
      </Link>

      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Tidy up the roster
      </h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Students who moved up a level often have a separate page for each one.
        Where these are the same child, merging keeps everything from all of
        their pages and gives them one record — with their proper name on it.
      </p>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-raised px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing to review. Every name on the roster is either unique or has
          already been settled.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            <span className="tabular font-medium text-foreground">
              {groups.length}
            </span>{" "}
            {groups.length === 1 ? "name" : "names"} to look at, covering{" "}
            <span className="tabular">{pages}</span> pages. There is no hurry
            and no need to finish in one go — the list remembers what you have
            settled.
          </p>

          <ul className="flex flex-col gap-4">
            {groups.map((group) => (
              <MergeGroupCard key={group.students[0].id} group={group} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
