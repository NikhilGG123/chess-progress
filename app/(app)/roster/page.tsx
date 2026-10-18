import Link from "next/link";
import { AddStudentForm } from "@/components/students/add-student-form";
import { RosterList } from "@/components/students/roster-list";
import { getLevels, getPrograms, getStudents } from "@/lib/queries";

// Deliberately no progress summary here. It would mean pulling every progress
// row for every student on one page -- fine for ten demo students, and a
// truncated result once the real roster of several hundred lands. Progress
// lives one click away, on the student's own page.
export default async function RosterPage() {
  const [students, levels, programs] = await Promise.all([
    getStudents({ includeInactive: true }),
    getLevels(),
    getPrograms(),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Roster</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Levels are set by hand — a coach tests the student and decides. The
            app never promotes anyone on its own.
          </p>
        </div>
        <Link
          href="/roster/merge"
          className="h-9 shrink-0 rounded-md border border-border-strong px-3 text-sm
                     leading-9 transition-colors duration-200 hover:bg-muted"
        >
          Tidy up duplicates
        </Link>
      </div>
      <div className="mb-6" />

      <section className="mb-8 rounded-lg border border-border bg-surface-raised p-5">
        <h2 className="mb-4 text-sm font-medium">Add a student</h2>
        <AddStudentForm levels={levels} programs={programs} />
      </section>

      <RosterList students={students} levels={levels} programs={programs} />
    </main>
  );
}
