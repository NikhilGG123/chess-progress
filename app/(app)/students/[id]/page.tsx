import Link from "next/link";
import { notFound } from "next/navigation";
import { ClassHistory } from "@/components/class-history";
import { EnrollmentSelect } from "@/components/enrollment-select";
import { StudentWorkspace, type LevelProgress } from "@/components/student-workspace";
import {
  getLevels,
  getPrograms,
  getProgressWithTopics,
  getStudentHistory,
} from "@/lib/queries";
import type { Status } from "@/lib/status";
import { one, type Level, type Program } from "@/lib/types";
import { createClient } from "@/utils/supabase/server";
import { setStudentActive } from "../../roster/actions";

/**
 * Focus mode: one student, isolated from the roster.
 *
 * Built for the conversation a coach has with a parent -- what has been
 * covered, what is next, and what was said in past classes -- without the rest
 * of the class visible on screen. It is a view for a signed-in coach, not a
 * parent login.
 */
export default async function StudentPage({ params }: PageProps<"/students/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select(
      `id, full_name, is_active,
       enrollments (
         program:program_id (id, name, sort_order),
         level:level_id (id, number, name, program_id)
       )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!student) notFound();

  const enrollments = ((student.enrollments ?? []) as Record<string, unknown>[])
    .map((entry) => ({
      program: one<Program>(entry.program as never),
      level: one<Level>(entry.level as never),
    }))
    .filter((entry): entry is { program: Program; level: Level | null } =>
      entry.program !== null,
    )
    .sort((a, b) => a.program.sort_order - b.program.sort_order);

  // The levels a student is currently at, across every programme they are in.
  const currentLevelIds = new Set(
    enrollments.map((entry) => entry.level?.id).filter(Boolean) as string[],
  );

  const [levels, programs, progress, history] = await Promise.all([
    getLevels(),
    getPrograms(),
    getProgressWithTopics([student.id]),
    getStudentHistory(student.id),
  ]);

  // Progress rows are grouped by the level their topic belongs to, so a
  // promoted student keeps every level they have been through.
  const byLevel = new Map<string, LevelProgress>();

  for (const row of progress) {
    const level = row.topic.level;
    if (!level) continue;
    if (!byLevel.has(level.id)) {
      byLevel.set(level.id, {
        level,
        programName:
          programs.find((program) => program.id === level.program_id)?.name ?? "",
        rows: [],
      });
    }
    byLevel.get(level.id)!.rows.push({ topic: row.topic, status: row.status as Status });
  }

  for (const entry of byLevel.values()) {
    entry.rows.sort((a, b) => a.topic.sort_order - b.topic.sort_order);
  }

  // "Current" is now one level per programme, so the page shows each of them
  // and files everything else as history.
  const current = [...byLevel.values()]
    .filter((entry) => currentLevelIds.has(entry.level.id))
    .sort((a, b) => a.level.number - b.level.number);
  const past = [...byLevel.values()]
    .filter((entry) => !currentLevelIds.has(entry.level.id))
    .sort((a, b) => b.level.number - a.level.number);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Link href="/roster" className="text-sm text-muted-foreground hover:underline">
        ← Roster
      </Link>

      <div className="mt-1 mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {student.full_name}
          {!student.is_active && (
            <span className="ml-3 rounded bg-muted px-2 py-1 align-middle text-xs font-normal text-muted-foreground">
              Removed
            </span>
          )}
        </h1>

        <div className="flex items-center gap-2">
          {programs.map((program) => (
            <EnrollmentSelect
              key={program.id}
              studentId={student.id}
              program={program}
              levels={levels.filter((level) => level.program_id === program.id)}
              currentLevelId={
                enrollments.find((e) => e.program.id === program.id)?.level?.id ?? null
              }
            />
          ))}
          <form action={setStudentActive}>
            <input type="hidden" name="student_id" value={student.id} />
            <input
              type="hidden"
              name="is_active"
              value={student.is_active ? "false" : "true"}
            />
            <button
              type="submit"
              className="h-9 cursor-pointer rounded-md border border-border px-3 text-sm
                         text-muted-foreground transition-colors duration-200 hover:bg-muted"
            >
              {student.is_active ? "Remove" : "Bring back"}
            </button>
          </form>
        </div>
      </div>

      <StudentWorkspace
        studentId={student.id}
        studentName={student.full_name}
        current={current}
        past={past}
      />

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">Class history</h2>
          <p className="tabular text-sm text-muted-foreground">
            {history.length} class{history.length === 1 ? "" : "es"} attended
          </p>
        </div>
        <ClassHistory history={history} />
      </section>

    </main>
  );
}
