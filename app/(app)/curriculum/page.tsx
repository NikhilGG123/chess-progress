import { AddTopicForm } from "@/components/add-topic-form";
import { TopicRow } from "@/components/topic-row";
import { currentCoach, getLevelsWithTopics } from "@/lib/queries";
import { renameLevel } from "./actions";

export default async function CurriculumPage() {
  const [levels, { isAdmin }] = await Promise.all([
    getLevelsWithTopics(),
    currentCoach(),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Curriculum</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The topic list behind every grid. Levels 1–3 came straight from the
        Group Sheets workbook; Level 4 is a placeholder until you tell us how it
        actually runs. Edit any of it here — no code change needed.
      </p>
      <p className="mt-3 mb-8 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-muted-foreground">
        Adding a topic gives every student in that level a blank cell for it.
        {isAdmin
          ? " Deleting one deletes what every student had recorded against it."
          : " Deleting a topic needs the Admin account, because it erases every student's record of it."}
      </p>

      {levels.map((level) => (
        <section key={level.id} className="mb-8">
          <form action={renameLevel} className="mb-3 flex items-center gap-2">
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
              className="h-9 shrink-0 cursor-pointer rounded-md border border-border px-3 text-sm
                         transition-colors duration-200 hover:bg-muted"
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
    </main>
  );
}
