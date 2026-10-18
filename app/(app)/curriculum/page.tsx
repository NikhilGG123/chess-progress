import {
  AddLevelForm,
  AddProgramForm,
} from "@/components/curriculum/add-curriculum-forms";
import { AddTopicForm } from "@/components/curriculum/add-topic-form";
import { TopicRow } from "@/components/curriculum/topic-row";
import { currentCoach, getLevelsWithTopics, getPrograms } from "@/lib/queries";
import { renameLevel, renameProgram } from "./actions";
import { buttonClass } from "@/components/ui/button";

/**
 * Programmes, levels and topics, editable in place. Coaches may add, rename
 * and reorder; deleting a topic is Admin-only, because it cascades into every
 * student's record of it.
 */
export default async function CurriculumPage() {
  const [levels, programs, { isAdmin }] = await Promise.all([
    getLevelsWithTopics(),
    getPrograms(),
    currentCoach(),
  ]);

  // Grouped by programme, because a level only means anything inside one --
  // "Level 1" is a different thing in Chess and in Coding, and they are
  // numbered separately.
  const byProgram = programs.map((program) => ({
    program,
    levels: levels.filter((level) => level.program_id === program.id),
  }));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Curriculum</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The topic list behind every grid. Chess levels 1–3 came straight from
        the Group Sheets workbook; Level 4 is a placeholder until you tell us
        how it actually runs. Edit any of it here — no code change needed.
      </p>
      <p className="mt-3 mb-8 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-muted-foreground">
        Adding a topic gives every student in that level a blank cell for it.
        {isAdmin
          ? " Deleting one deletes what every student had recorded against it."
          : " Deleting a topic needs the Admin account, because it erases every student's record of it."}
      </p>

      {byProgram.map(({ program, levels: programLevels }) => (
        <section
          key={program.id}
          className="mb-10 border-t border-border pt-6 first:border-t-0 first:pt-0"
        >
          <form action={renameProgram} className="mb-5 flex items-center gap-2">
            <input type="hidden" name="program_id" value={program.id} />
            <input
              name="name"
              defaultValue={program.name}
              aria-label={`Name for the ${program.name} programme`}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent
                         px-2 py-1 text-xl font-semibold tracking-tight hover:border-border
                         focus:border-border-strong focus:bg-surface"
            />
            <span className="tabular shrink-0 text-sm text-muted-foreground">
              {programLevels.length}{" "}
              {programLevels.length === 1 ? "level" : "levels"}
            </span>
            <button
              type="submit"
              className={buttonClass("secondary", "md", "shrink-0")}
            >
              Rename
            </button>
          </form>

          {programLevels.length === 0 && (
            <p className="mb-4 rounded-lg border border-border bg-surface-raised px-4 py-5 text-sm text-muted-foreground">
              No levels yet. Add the first one below, then give it its topics.
            </p>
          )}

          {programLevels.map((level) => (
            <section key={level.id} className="mb-8 pl-1">
              <form
                action={renameLevel}
                className="mb-3 flex items-center gap-2"
              >
                <input type="hidden" name="level_id" value={level.id} />
                <input
                  name="name"
                  defaultValue={level.name}
                  aria-label={`Name for level ${level.number}`}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent
                             px-2 py-1 text-lg font-semibold hover:border-border
                             focus:border-border-strong focus:bg-surface"
                />
                <span className="tabular shrink-0 text-sm text-muted-foreground">
                  {level.topics.length} topics
                </span>
                <button
                  type="submit"
                  className={buttonClass("secondary", "md", "shrink-0")}
                >
                  Rename
                </button>
              </form>

              {level.topics.length === 0 ? (
                <p className="rounded-lg border border-border bg-surface-raised px-4 py-5 text-sm text-muted-foreground">
                  No topics in this level yet.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
                  {level.topics.map((topic, index) => (
                    <TopicRow
                      key={topic.id}
                      topic={topic}
                      isFirst={index === 0}
                      isLast={index === level.topics.length - 1}
                      isAdmin={isAdmin}
                    />
                  ))}
                </ul>
              )}

              <div className="mt-3">
                <AddTopicForm levelId={level.id} />
              </div>
            </section>
          ))}

          <div className="pl-1">
            <AddLevelForm programId={program.id} />
          </div>
        </section>
      ))}

      <section className="mt-10 rounded-lg border border-border bg-surface-raised p-5">
        <h2 className="text-sm font-medium">Another programme</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Coding, or anything else the centre starts running. A student enrolls
          in each programme separately, so a child can do chess and coding at
          once without one replacing the other.
        </p>
        <AddProgramForm />
      </section>
    </main>
  );
}
