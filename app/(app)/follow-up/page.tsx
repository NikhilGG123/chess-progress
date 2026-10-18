import { FollowupList } from "@/components/students/followup-list";
import { getStudents } from "@/lib/queries";

/**
 * One checkbox per student, meaning "look this one up in Jumbula".
 *
 * The coaches were offered payment tracking and turned it down: too much, and
 * not worth paying for hosting over. This is what they asked for instead, and
 * it is the better idea -- Jumbula stays the system that holds the money, and
 * this app holds a pointer to it.
 *
 * Called "Follow-up" rather than anything about payment, because it appears
 * beside children's names on screens a coach opens in a room with parents in
 * it. It is also honestly what the flag means: somebody needs to follow this
 * up. Not everything flagged will be about money.
 */
export default async function FollowUpPage() {
  const students = await getStudents();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Follow-up</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Tick a student to flag that something needs checking in Jumbula. The
        mark shows up beside their name when you take the register, so it gets
        noticed in the room rather than only on this page. Nothing else is
        recorded here — the detail stays in Jumbula.
      </p>

      <FollowupList students={students} />
    </main>
  );
}
