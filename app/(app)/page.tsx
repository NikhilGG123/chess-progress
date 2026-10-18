import Link from "next/link";
import { RecentClasses } from "@/components/sessions/session-log";
import { TodayCard } from "@/components/sessions/today-card";
import { minutesNowIso, todayIso } from "@/lib/format";
import { currentCoach, getPrograms, getSessions } from "@/lib/queries";
import { createClient } from "@/utils/supabase/server";

/** Two head-only count queries: no rows travel, so neither hits the row cap. */
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

/**
 * The home page, built around one question: which class am I about to teach?
 * Today's classes come first, then the recent ones a coach may need to finish
 * writing up.
 */
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

      {/* One quiet line, not two large cards. "Topics awaiting a test: 632"
          is a roster-wide total nobody acts on, and between them the two cards
          pushed the classes below the fold for no return. Both numbers stay --
          they are just no longer the biggest thing on the page. */}
      <p className="mt-4 mb-8 text-sm text-muted-foreground">
        <Link href="/roster" className="hover:underline">
          <span className="tabular font-medium text-foreground">
            {stats.activeStudents}
          </span>{" "}
          active students
        </Link>
        {" · "}
        <span className="tabular font-medium text-foreground">
          {stats.awaitingTest}
        </span>{" "}
        topics waiting on a test
      </p>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium">Recent classes</h2>
          <Link href="/sessions" className="text-sm hover:underline">
            All sessions →
          </Link>
        </div>

        <RecentClasses
          sessions={sessions}
          serverToday={todayIso()}
          serverMinutes={minutesNowIso()}
        />
      </section>
    </main>
  );
}
