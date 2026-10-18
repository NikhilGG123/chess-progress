import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceList } from "@/components/sessions/attendance-list";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { SessionWorkspace } from "@/components/sessions/session-workspace";
import { formatSessionDate, formatSessionTime } from "@/lib/format";
import {
  getLevelsWithTopics,
  getProgressWithTopics,
  getStudents,
} from "@/lib/queries";
import { cellKey, type Status, type StatusMap } from "@/lib/status";
import { levelIn } from "@/lib/types";
import { createClient } from "@/utils/supabase/server";
import { deleteSession } from "../actions";

export default async function SessionPage({
  params,
}: PageProps<"/sessions/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, session_date, session_time, program_id, series_id")
    .eq("id", id)
    .maybeSingle();

  if (!session) notFound();

  const [students, levels, attendance, notes, covered, regulars] =
    await Promise.all([
      getStudents(),
      getLevelsWithTopics(),
      supabase.from("attendance").select("student_id").eq("session_id", id),
      supabase
        .from("session_notes")
        .select("student_id, note_text")
        .eq("session_id", id),
      supabase.from("session_topics").select("topic_id").eq("session_id", id),
      // Stars live on the repeating class, so a one-off session has none.
      session.series_id
        ? supabase
            .from("class_regulars")
            .select("student_id")
            .eq("series_id", session.series_id)
        : Promise.resolve({ data: [] as { student_id: string }[] }),
    ]);

  const coveredTopicIds = (covered.data ?? []).map(
    (row) => row.topic_id as string,
  );
  const regularIds = (regulars.data ?? []).map(
    (row) => row.student_id as string,
  );

  const presentIds = (attendance.data ?? []).map(
    (row) => row.student_id as string,
  );
  const present = students.filter((student) => presentIds.includes(student.id));

  const notesCount = (notes.data ?? []).length;

  const initialNotes: Record<string, string> = {};
  for (const row of notes.data ?? []) {
    initialNotes[row.student_id as string] = row.note_text as string;
  }

  const progress = await getProgressWithTopics(
    present.map((student) => student.id),
  );

  const statuses: StatusMap = {};
  for (const row of progress) {
    statuses[cellKey(row.student_id, row.topic.id)] = row.status as Status;
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/sessions"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Sessions
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {formatSessionDate(session.session_date)}
            {session.session_time && (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {formatSessionTime(session.session_time)}
              </span>
            )}
          </h1>
        </div>

        <ConfirmButton
          action={deleteSession}
          fields={{ session_id: session.id }}
          confirm={
            presentIds.length === 0 && notesCount === 0
              ? `Delete this class?

Nothing has been recorded against it.`
              : `Delete this class?

This also deletes ${presentIds.length} attendance record${
                  presentIds.length === 1 ? "" : "s"
                } and ${notesCount} note${notesCount === 1 ? "" : "s"}.
Students keep their progress. This cannot be undone.`
          }
        >
          Delete class
        </ConfirmButton>
      </div>

      {/* Step one of the evening, and the same collapsible as everywhere
          else. It was a bare <details> with a float-right Show/Hide -- the
          same gesture as the sessions page, built twice, remembered in
          neither. Open only when nobody is in yet. */}
      <CollapsibleSection
        id={`attendance.${session.id}`}
        title="Attendance"
        // Not "9 of 645": that is the whole roster, and reads as though 645
        // were expected in one room.
        summary={`${present.length} checked in`}
        defaultOpen={present.length === 0}
      >
        <AttendanceList
          sessionId={session.id}
          presentIds={presentIds}
          seriesId={session.series_id ?? null}
          regularIds={regularIds}
          students={students.map((student) => {
            // Which of this student's levels matters depends on the
            // programme the class belongs to.
            const level = levelIn(student, session.program_id);
            return {
              id: student.id,
              full_name: student.full_name,
              level_id: level?.id ?? null,
              level_label: level?.name ?? "Not in this programme",
              level_number: level?.number ?? null,
              needs_followup: student.needs_followup,
              followup_set_at: student.followup_set_at,
            };
          })}
        />
      </CollapsibleSection>

      {present.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-raised px-4 py-10 text-center text-sm text-muted-foreground">
          Check students in above and their grids appear here.
        </p>
      ) : (
        <SessionWorkspace
          sessionId={session.id}
          levels={levels
            .filter((level) => level.program_id === session.program_id)
            .map((level) => ({
              id: level.id,
              name: level.name,
              number: level.number,
              topics: level.topics,
            }))}
          students={present.map((student) => ({
            id: student.id,
            full_name: student.full_name,
            level_id: levelIn(student, session.program_id)?.id ?? null,
          }))}
          initialStatuses={statuses}
          initialNotes={initialNotes}
          coveredTopicIds={coveredTopicIds}
        />
      )}
    </main>
  );
}
