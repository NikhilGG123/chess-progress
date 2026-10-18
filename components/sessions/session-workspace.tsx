"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  advanceSession,
  setProgress,
  setSessionTopic,
} from "@/app/(app)/actions";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { Button } from "@/components/ui/button";
import { cellKey, type Status, type StatusMap } from "@/lib/status";
import type { Topic } from "@/lib/types";
import { ProgressGrid } from "@/components/sessions/progress-grid";
import { SessionNote } from "@/components/sessions/session-note";
import { StatusLegend } from "@/components/progress/status-legend";
import { LiveDot, useRealtime } from "@/hooks/use-realtime";

export type WorkspaceStudent = {
  id: string;
  full_name: string;
  level_id: string | null;
};

export type WorkspaceLevel = {
  id: string;
  name: string;
  number: number;
  topics: Topic[];
};

/**
 * Everything a coach touches during a class, in one place, kept live.
 *
 * Brad and Tim work the same session from two devices. One subscription --
 * shared by every grid and every note on the page -- means a mark made on one
 * screen appears on the other instead of being silently overwritten by
 * whoever happened to save last.
 *
 * Realtime respects row-level security, so this receives exactly the rows a
 * coach could already read.
 */
export function SessionWorkspace({
  sessionId,
  levels,
  students,
  initialStatuses,
  initialNotes,
  coveredTopicIds,
}: {
  sessionId: string;
  levels: WorkspaceLevel[];
  students: WorkspaceStudent[];
  initialStatuses: StatusMap;
  initialNotes: Record<string, string>;
  /** Topics this class has already been marked as covering. */
  coveredTopicIds: string[];
}) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<StatusMap>(initialStatuses);
  const [remoteNotes, setRemoteNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [covered, setCovered] = useState(() => new Set(coveredTopicIds));
  const [advancing, setAdvancing] = useState(false);
  const [advanced, setAdvanced] = useState<number | null>(null);

  // Read inside the subscription without making it a dependency: rebuilding
  // the channel on every render would drop changes between renders. Written
  // after render, not during it -- only the subscription reads it.
  const presentRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    presentRef.current = new Set(students.map((student) => student.id));
  }, [students]);

  // A student checked in by the other coach arrives via router.refresh(), so
  // their cells appear in the props but not in state. Take the server's value
  // for keys we do not have; never overwrite ones we do, which would undo a
  // mark made a moment ago.
  //
  // Adjusted during render rather than in an effect: React finishes this
  // component before it paints, so a newly checked-in student's row never
  // appears blank for a frame.
  const [adopted, setAdopted] = useState(initialStatuses);
  if (adopted !== initialStatuses) {
    setAdopted(initialStatuses);
    setStatuses((current) => {
      let changed = false;
      const next = { ...current };
      for (const [key, value] of Object.entries(initialStatuses)) {
        if (!(key in next)) {
          next[key] = value;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }

  const live = useRealtime(`session:${sessionId}`, [
    {
      table: "progress",
      handler: (payload) => {
        const row = payload.new as {
          student_id?: string;
          topic_id?: string;
          status?: Status;
        };
        if (!row?.student_id || !row.topic_id || !row.status) return;
        // Progress is not scoped to a session, so ignore anyone who is not in
        // the room -- a coach marking another class should not repaint this
        // grid.
        if (!presentRef.current.has(row.student_id)) return;

        const key = cellKey(row.student_id, row.topic_id);
        setStatuses((current) =>
          current[key] === row.status
            ? current
            : { ...current, [key]: row.status! },
        );
      },
    },
    {
      table: "session_notes",
      filter: `session_id=eq.${sessionId}`,
      handler: (payload) => {
        const row = payload.new as { student_id?: string; note_text?: string };
        if (!row?.student_id) return;
        setRemoteNotes((current) => ({
          ...current,
          [row.student_id!]: row.note_text ?? "",
        }));
      },
    },
    {
      table: "attendance",
      filter: `session_id=eq.${sessionId}`,
      // Attendance changes which students the page renders at all, so this one
      // needs the server rather than a local patch.
      handler: () => router.refresh(),
    },
  ]);

  async function set(student: WorkspaceStudent, topic: Topic, next: Status) {
    const key = cellKey(student.id, topic.id);
    const previous = statuses[key] ?? "not_seen";

    setStatuses((current) => ({ ...current, [key]: next }));
    setError(null);

    const result = await setProgress({
      studentId: student.id,
      topicId: topic.id,
      status: next,
      sessionId,
    });

    if (result.error) {
      setStatuses((current) => ({ ...current, [key]: previous }));
      setError(
        `Could not save ${student.full_name} — ${topic.name}: ${result.error}`,
      );
    }
  }

  async function toggleCovered(topicId: string) {
    const nowCovered = !covered.has(topicId);
    setCovered((current) => {
      const next = new Set(current);
      if (nowCovered) next.add(topicId);
      else next.delete(topicId);
      return next;
    });
    setAdvanced(null);
    setError(null);

    const result = await setSessionTopic({
      sessionId,
      topicId,
      covered: nowCovered,
    });

    if (result.error) {
      setCovered((current) => {
        const next = new Set(current);
        if (nowCovered) next.delete(topicId);
        else next.add(topicId);
        return next;
      });
      setError(result.error);
    }
  }

  async function advance() {
    setAdvancing(true);
    setAdvanced(null);
    setError(null);

    const result = await advanceSession(sessionId);

    if (result.error) setError(result.error);
    else setAdvanced(result.changed);

    setAdvancing(false);
  }

  const levelsPresent = levels
    .filter((level) =>
      students.some((student) => student.level_id === level.id),
    )
    .sort((a, b) => a.number - b.number);

  const unassigned = students.filter((student) => !student.level_id);

  return (
    <>
      <div className="mb-5 flex justify-end">
        <LiveDot live={live} />
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {/* Foldable, and remembered. Every topic of every level in the room is
          forty-odd chips between a coach and the first student -- fine on the
          way in, in the way for the rest of the lesson. */}
      <CollapsibleSection
        id="covered"
        title="What did you cover today?"
        count={covered.size}
        summary={
          covered.size === 0 ? "nothing ticked" : `${covered.size} ticked`
        }
        defaultOpen
        panel
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Tick the topics the class actually went through. It shows up in the
          class log, and it is what the button below works from.
        </p>

        {levelsPresent.map((level) => (
          <div key={level.id} className="mb-4 last:mb-0">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">
              {level.name}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {level.topics.map((topic) => {
                const on = covered.has(topic.id);
                return (
                  <button
                    key={topic.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleCovered(topic.id)}
                    className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs
                                transition-colors duration-200 ${
                                  on
                                    ? "border-border-strong bg-muted font-medium text-foreground"
                                    : "border-border text-muted-foreground hover:bg-muted"
                                }`}
                  >
                    {on ? "✓ " : ""}
                    {topic.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button
            variant="primary"
            disabled={covered.size === 0 || advancing}
            onClick={advance}
          >
            {advancing ? "Marking…" : "Everyone here saw these"}
          </Button>

          <p className="text-xs text-muted-foreground">
            {covered.size === 0
              ? "Tick a topic first."
              : advanced === null
                ? "Moves each student one step on the ticked topics: blank → I → R. Never past R — Test and Complete stay your call."
                : advanced === 0
                  ? "Nothing to move — everyone was already at R or beyond on those."
                  : `Moved ${advanced} mark${advanced === 1 ? "" : "s"}.`}
          </p>
        </div>
      </CollapsibleSection>

      {levelsPresent.map((level, index) => {
        const inLevel = students.filter(
          (student) => student.level_id === level.id,
        );

        if (level.topics.length === 0) {
          return (
            <section key={level.id} className="mb-8">
              <h2 className="mb-3 text-sm font-medium">
                {level.name}{" "}
                <span className="font-normal text-muted-foreground">
                  · {inLevel.length} present
                </span>
              </h2>
              <p className="rounded-lg border border-border bg-surface-raised px-4 py-6 text-sm text-muted-foreground">
                This level has no topics yet, so there is nothing to mark.{" "}
                <Link href="/curriculum" className="underline">
                  Add its topics
                </Link>
                , or use the notes below.
              </p>
            </section>
          );
        }

        return (
          <section key={level.id} className="mb-8">
            {/* The legend sits with the first grid, not at the top of the
                page: it explains the marks, and it used to be two scrolls
                away from any of them. */}
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
              <h2 className="text-sm font-medium">
                {level.name}{" "}
                <span className="font-normal text-muted-foreground">
                  · {inLevel.length} present · {level.topics.length} topics
                </span>
              </h2>
              {index === 0 && <StatusLegend />}
            </div>
            <ProgressGrid
              levelLabel={level.name}
              topics={level.topics}
              students={inLevel}
              statuses={statuses}
              onSet={set}
            />
          </section>
        );
      })}

      {unassigned.length > 0 && (
        <section className="mb-8 rounded-lg border border-border bg-surface-raised px-4 py-4">
          <h2 className="text-sm font-medium">Waiting on a level</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {unassigned.map((student) => student.full_name).join(", ")} —{" "}
            <Link href="/roster" className="underline">
              set a level
            </Link>{" "}
            and their grid appears here.
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-1 text-sm font-medium">Session notes</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Saved automatically. Your own shorthand is fine — nothing here is
          parsed by the app.
        </p>

        <div className="grid gap-5 rounded-lg border border-border bg-surface-raised p-5 sm:grid-cols-2">
          {students.map((student) => (
            <SessionNote
              key={student.id}
              sessionId={sessionId}
              studentId={student.id}
              studentName={student.full_name}
              initialText={initialNotes[student.id] ?? ""}
              remoteText={remoteNotes[student.id] ?? null}
            />
          ))}
        </div>
      </section>
    </>
  );
}
