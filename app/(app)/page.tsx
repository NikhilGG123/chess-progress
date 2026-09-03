import Link from "next/link";
import { RecentClasses } from "@/components/session-log";
import { TodayCard } from "@/components/today-card";
import { todayIso } from "@/lib/format";
import { currentCoach, getPrograms, getSessions } from "@/lib/queries";
import { createClient } from "@/utils/supabase/server";

async function counts() {
  const supabase = await createClient();

  const activeStudents = await supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  // Topics sitting at 'needs testing' across the active roster -- the queue a
  // coach actually works from at the start of a class.
  const awaitingTest = await supabase
    .from("progress")
    .select("student_id, students!inner(is_active)", {
      count: "exact",
      head: true,
    })
    .eq("status", "needs_testing")
    .eq("students.is_active", true);

  return {
    activeStudents: activeStudents.count ?? 0,
    awaitingTest: awaitingTest.count ?? 0,
  };
}

export default async function TodayPage() {
  const [{ coach }, sessions, stats, programs] = await Promise.all([
    currentCoach(),
    getSessions(),
    counts(),
    getPrograms(),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {coach?.display_name ? `Hello, ${coach.display_name}` : "Today"}
      </h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Start a class, or pick up where a previous one left off.
      </p>

      <TodayCard sessions={sessions} programs={programs} />

      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface-raised p-5">
          <p className="text-sm text-muted-foreground">Active students</p>
          <p className="tabular mt-1 text-3xl font-semibold">
            {stats.activeStudents}
          </p>
          <Link
            href="/roster"
            className="mt-3 inline-block text-sm hover:underline"
          >
            Manage roster →
          </Link>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-5">
          <p className="text-sm text-muted-foreground">Topics awaiting a test</p>
          <p className="tabular mt-1 text-3xl font-semibold">
            {stats.awaitingTest}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Across every active student.
          </p>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium">Recent classes</h2>
          <Link href="/sessions" className="text-sm hover:underline">
            All sessions →
          </Link>
        </div>

        <RecentClasses sessions={sessions} serverToday={todayIso()} />
      </section>
    </main>
  );
}
