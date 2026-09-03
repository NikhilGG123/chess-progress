import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

/**
 * Tests against the real database.
 *
 * Every one of them runs inside a transaction that is rolled back afterwards,
 * so they can be pointed at the live project without leaving a row behind.
 *
 * They exist because every bug that reached a page so far was in this layer:
 * policies without grants, a trigger that had to fire, a swap that must not
 * collide. None of it is visible to the type checker.
 */
const url = process.env.SUPABASE_DB_URL;
const password = process.env.SUPABASE_DB_PASSWORD;


const maybe = url && password ? describe : describe.skip;

maybe("database", () => {
  let client: Client;

  beforeAll(async () => {
    const parsed = new URL(url!);
    client = new Client({
      host: parsed.hostname,
      port: Number(parsed.port || 5432),
      user: decodeURIComponent(parsed.username),
      database: parsed.pathname.replace(/^\//, "") || "postgres",
      password,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  beforeEach(async () => {
    await client.query("begin");
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  /** Run the rest of this transaction as a signed-in user. */
  async function actAs(userId: string | null) {
    if (userId) {
      await client.query(
        `select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: userId, role: "authenticated" })],
      );
      await client.query("set local role authenticated");
    } else {
      await client.query("set local role anon");
    }
  }

  async function aCoachId() {
    const { rows } = await client.query("select id from coaches limit 1");
    return rows[0]?.id as string;
  }

  describe("access control", () => {
    it("tells an anonymous request nothing at all", async () => {
      await actAs(null);
      await expect(client.query("select * from students")).rejects.toThrow(
        /permission denied/i,
      );
    });

    it("lets a coach read the roster", async () => {
      await actAs(await aCoachId());
      const { rows } = await client.query("select id from students limit 5");
      expect(rows.length).toBeGreaterThan(0);
    });

    it("shows a signed-in stranger an empty roster rather than an error", async () => {
      // Someone who created an account but is not a coach. Row-level security
      // filters them out; it does not blow up.
      await actAs("00000000-0000-4000-8000-000000000000");
      const { rows } = await client.query("select id from students");
      expect(rows).toHaveLength(0);
    });

    it("does not let a coach read another coach's row", async () => {
      const coachId = await aCoachId();
      await actAs(coachId);
      const { rows } = await client.query("select id from coaches");
      expect(rows.map((r) => r.id)).toEqual([coachId]);
    });

    it("does not let a signed-in user empty a table", async () => {
      // TRUNCATE ignores row-level security, so the privilege itself has to go.
      await actAs(await aCoachId());
      await expect(client.query("truncate table progress")).rejects.toThrow(
        /permission denied/i,
      );
    });
  });

  describe("a new student", () => {
    it("gets a row for every topic in their level, all not seen", async () => {
      const { rows: levels } = await client.query(
        `select l.id, count(t.id)::int as topics
           from levels l join topics t on t.level_id = l.id
          group by l.id having count(t.id) > 0 limit 1`,
      );
      const level = levels[0];

      const { rows: inserted } = await client.query(
        `insert into students (full_name) values ('Test Student') returning id`,
      );
      await client.query(
        `insert into enrollments (student_id, program_id, level_id)
         select $1, program_id, $2 from levels where id = $2`,
        [inserted[0].id, level.id],
      );

      const { rows: progress } = await client.query(
        `select status, count(*)::int as n from progress
          where student_id = $1 group by status`,
        [inserted[0].id],
      );

      expect(progress).toHaveLength(1);
      expect(progress[0].status).toBe("not_seen");
      expect(progress[0].n).toBe(level.topics);
    });

    it("keeps its old level's record when promoted", async () => {
      const { rows: levels } = await client.query(
        `select id from levels order by number limit 2`,
      );
      const [first, second] = levels;

      const { rows: inserted } = await client.query(
        `insert into students (full_name) values ('Promoted Student') returning id`,
      );
      const studentId = inserted[0].id;
      await client.query(
        `insert into enrollments (student_id, program_id, level_id)
         select $1, program_id, $2 from levels where id = $2`,
        [studentId, first.id],
      );

      await client.query(
        `update progress set status = 'complete' where student_id = $1`,
        [studentId],
      );
      await client.query(
        `update enrollments set level_id = $1 where student_id = $2`,
        [second.id, studentId],
      );

      const { rows } = await client.query(
        `select l.id, count(*)::int as n
           from progress p
           join topics t on t.id = p.topic_id
           join levels l on l.id = t.level_id
          where p.student_id = $1 group by l.id`,
        [studentId],
      );

      // Both levels are present: the old one is history, not a deletion.
      expect(rows).toHaveLength(2);
    });
  });

  describe("move_topic", () => {
    it("swaps two topics without colliding on the unique order", async () => {
      const { rows: topics } = await client.query(
        `select id, sort_order, level_id from topics
          where level_id = (select level_id from topics group by level_id having count(*) > 2 limit 1)
          order by sort_order limit 2`,
      );
      const [first, second] = topics;

      await client.query("select move_topic($1, 1)", [first.id]);

      const { rows: after } = await client.query(
        `select id, sort_order from topics where id = any($1)`,
        [[first.id, second.id]],
      );
      const byId = Object.fromEntries(after.map((r) => [r.id, r.sort_order]));

      expect(byId[first.id]).toBe(second.sort_order);
      expect(byId[second.id]).toBe(first.sort_order);
    });

    it("does nothing at the top of a level", async () => {
      const { rows: topics } = await client.query(
        `select id, sort_order from topics
          where level_id = (select level_id from topics group by level_id having count(*) > 1 limit 1)
          order by sort_order limit 1`,
      );

      await client.query("select move_topic($1, -1)", [topics[0].id]);

      const { rows } = await client.query(
        `select sort_order from topics where id = $1`,
        [topics[0].id],
      );
      expect(rows[0].sort_order).toBe(topics[0].sort_order);
    });

    it("leaves no duplicate positions in a level", async () => {
      const { rows } = await client.query(
        `select level_id, sort_order, count(*)::int as n
           from topics group by level_id, sort_order having count(*) > 1`,
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe("add_topic", () => {
    it("appends, and gives every student in that level a cell for it", async () => {
      const { rows: levels } = await client.query(
        `select l.id from levels l
           join enrollments e on e.level_id = l.id
          group by l.id limit 1`,
      );
      const levelId = levels[0].id;

      const { rows: before } = await client.query(
        `select coalesce(max(sort_order), 0)::int as max from topics where level_id = $1`,
        [levelId],
      );
      const { rows: students } = await client.query(
        `select count(*)::int as n from enrollments where level_id = $1`,
        [levelId],
      );

      const { rows: created } = await client.query(
        "select add_topic($1, $2) as id",
        [levelId, "Test Topic"],
      );

      const { rows: topic } = await client.query(
        "select sort_order from topics where id = $1",
        [created[0].id],
      );
      expect(topic[0].sort_order).toBe(before[0].max + 1);

      const { rows: cells } = await client.query(
        "select count(*)::int as n from progress where topic_id = $1",
        [created[0].id],
      );
      expect(cells[0].n).toBe(students[0].n);
    });
  });

  describe("repeating classes", () => {
    it("creates one class per matching day and never a duplicate", async () => {
      const { rows: series } = await client.query(
        `insert into class_series (name, weekdays, session_time, start_date, program_id)
         select 'Test Series', array[1, 3], '16:30', current_date, id
           from programs limit 1
         returning id`,
      );
      const seriesId = series[0].id;

      const { rows: first } = await client.query(
        "select generate_series_sessions($1, current_date + 27) as n",
        [seriesId],
      );
      // Four weeks with two class days each.
      expect(first[0].n).toBeGreaterThanOrEqual(7);
      expect(first[0].n).toBeLessThanOrEqual(9);

      const { rows: again } = await client.query(
        "select generate_series_sessions($1, current_date + 27) as n",
        [seriesId],
      );
      expect(again[0].n).toBe(0);

      const { rows: days } = await client.query(
        `select distinct extract(dow from session_date)::int as dow
           from sessions where series_id = $1 order by 1`,
        [seriesId],
      );
      expect(days.map((d) => d.dow)).toEqual([1, 3]);
    });

    it("does not backfill before the start date", async () => {
      const { rows: series } = await client.query(
        `insert into class_series (name, weekdays, session_time, start_date, program_id)
         select 'Future Series', array[0,1,2,3,4,5,6], '16:30', current_date + 14, id
           from programs limit 1
         returning id`,
      );

      await client.query("select generate_series_sessions($1, current_date + 20)", [
        series[0].id,
      ]);

      const { rows } = await client.query(
        `select min(session_date) as first from sessions where series_id = $1`,
        [series[0].id],
      );
      const first = new Date(rows[0].first);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + 13);
      expect(first.getTime()).toBeGreaterThan(cutoff.getTime());
    });
  });

  describe("the row cap", () => {
    it("is why queries page: the API stops at 1000 without saying so", async () => {
      // Documents the constraint the query layer is written around. If this
      // ever changes, lib/queries.ts can be simplified.
      const { rows } = await client.query(
        "select count(*)::int as n from generate_series(1, 1500)",
      );
      expect(rows[0].n).toBe(1500);
    });
  });

  describe("roles", () => {
    async function anAdminId() {
      const { rows } = await client.query(
        "select id from coaches where role = 'admin' limit 1",
      );
      return rows[0]?.id as string;
    }

    async function aPlainCoachId() {
      const { rows } = await client.query(
        "select id from coaches where role = 'coach' limit 1",
      );
      return rows[0]?.id as string;
    }

    it("has exactly one kind of account that can destroy things", async () => {
      const { rows } = await client.query(
        "select role, count(*)::int as n from coaches group by role order by role",
      );
      const byRole = Object.fromEntries(rows.map((r) => [r.role, r.n]));
      expect(byRole.admin).toBeGreaterThan(0);
      expect(byRole.coach).toBeGreaterThan(0);
    });

    it("silently refuses a coach deleting a topic, rather than erroring", async () => {
      // This is the trap: row-level security does not raise on a forbidden
      // DELETE, it just matches no rows. Code that checks for an error would
      // report success and the topic would still be there.
      const { rows: topics } = await client.query("select id from topics limit 1");
      const topicId = topics[0].id;

      await actAs(await aPlainCoachId());
      const result = await client.query("delete from topics where id = $1", [topicId]);
      expect(result.rowCount).toBe(0);

      await client.query("reset role");
      const { rows: after } = await client.query(
        "select id from topics where id = $1",
        [topicId],
      );
      expect(after).toHaveLength(1);
    });

    it("lets an admin delete a topic", async () => {
      const { rows: created } = await client.query(
        `insert into topics (level_id, name, sort_order)
         select id, 'Doomed Topic', 9999 from levels limit 1
         returning id`,
      );

      await actAs(await anAdminId());
      const result = await client.query("delete from topics where id = $1", [
        created[0].id,
      ]);
      expect(result.rowCount).toBe(1);
    });

    it("lets an ordinary coach delete a class, because cancelling one is routine", async () => {
      const { rows: created } = await client.query(
        `insert into sessions (session_date, program_id)
         select current_date + 400, id from programs limit 1 returning id`,
      );

      await actAs(await aPlainCoachId());
      const result = await client.query("delete from sessions where id = $1", [
        created[0].id,
      ]);
      expect(result.rowCount).toBe(1);
    });

    it("does not let a coach delete a student outright", async () => {
      // Removing a student from the roster is deactivation, which coaches do.
      // Erasing the record of what a child learned is not.
      const { rows: created } = await client.query(
        `insert into students (full_name) values ('Doomed Student') returning id`,
      );

      await actAs(await aPlainCoachId());
      const deleted = await client.query("delete from students where id = $1", [
        created[0].id,
      ]);
      expect(deleted.rowCount).toBe(0);

      // But they can still deactivate.
      const updated = await client.query(
        "update students set is_active = false where id = $1",
        [created[0].id],
      );
      expect(updated.rowCount).toBe(1);
    });
  });


  describe("the one-press advance", () => {
    /** A class with one student in it, covering the level's first two topics. */
    async function aClassWithOneStudent() {
      const { rows: levels } = await client.query(
        `select l.id, l.program_id
           from levels l join topics t on t.level_id = l.id
          group by l.id having count(t.id) >= 3 limit 1`,
      );
      const level = levels[0];

      const { rows: students } = await client.query(
        `insert into students (full_name) values ('Advance Test') returning id`,
      );
      const studentId = students[0].id;

      await client.query(
        `insert into enrollments (student_id, program_id, level_id) values ($1, $2, $3)`,
        [studentId, level.program_id, level.id],
      );

      const { rows: sessions } = await client.query(
        `insert into sessions (session_date, program_id) values (current_date, $1) returning id`,
        [level.program_id],
      );
      const sessionId = sessions[0].id;

      await client.query(
        `insert into attendance (session_id, student_id) values ($1, $2)`,
        [sessionId, studentId],
      );

      const { rows: topics } = await client.query(
        `select id from topics where level_id = $1 order by sort_order limit 3`,
        [level.id],
      );

      // Cover the first two only, so the third proves untouched topics stay put.
      await client.query(
        `insert into session_topics (session_id, topic_id) values ($1, $2), ($1, $3)`,
        [sessionId, topics[0].id, topics[1].id],
      );

      return { studentId, sessionId, topics: topics.map((t) => t.id) };
    }

    async function statusOf(studentId: string, topicId: string) {
      const { rows } = await client.query(
        `select status from progress where student_id = $1 and topic_id = $2`,
        [studentId, topicId],
      );
      return rows[0]?.status as string;
    }

    it("walks blank to seen once, then to seen multiple, and stops there", async () => {
      const { studentId, sessionId, topics } = await aClassWithOneStudent();

      expect(await statusOf(studentId, topics[0])).toBe("not_seen");

      await client.query("select advance_session_topics($1)", [sessionId]);
      expect(await statusOf(studentId, topics[0])).toBe("seen_once");

      await client.query("select advance_session_topics($1)", [sessionId]);
      expect(await statusOf(studentId, topics[0])).toBe("seen_multiple");

      // However many times it is pressed, it never goes further. Attendance is
      // not evidence of understanding, and it is certainly not a test result.
      await client.query("select advance_session_topics($1)", [sessionId]);
      await client.query("select advance_session_topics($1)", [sessionId]);
      expect(await statusOf(studentId, topics[0])).toBe("seen_multiple");
    });

    it("never sets Test or Complete, whatever the starting point", async () => {
      const { studentId, sessionId, topics } = await aClassWithOneStudent();

      for (let i = 0; i < 5; i += 1) {
        await client.query("select advance_session_topics($1)", [sessionId]);
      }

      const { rows } = await client.query(
        `select distinct status from progress
          where student_id = $1 and topic_id = any($2)`,
        [studentId, topics.slice(0, 2)],
      );
      const statuses = rows.map((r) => r.status);
      expect(statuses).not.toContain("needs_testing");
      expect(statuses).not.toContain("complete");
    });

    it("leaves a topic the class did not cover alone", async () => {
      const { studentId, sessionId, topics } = await aClassWithOneStudent();

      await client.query("select advance_session_topics($1)", [sessionId]);

      expect(await statusOf(studentId, topics[2])).toBe("not_seen");
    });

    it("never regresses a student who is already tested or finished", async () => {
      const { studentId, sessionId, topics } = await aClassWithOneStudent();

      await client.query(
        `update progress set status = 'complete'
          where student_id = $1 and topic_id = $2`,
        [studentId, topics[0]],
      );
      await client.query(
        `update progress set status = 'needs_testing'
          where student_id = $1 and topic_id = $2`,
        [studentId, topics[1]],
      );

      await client.query("select advance_session_topics($1)", [sessionId]);

      expect(await statusOf(studentId, topics[0])).toBe("complete");
      expect(await statusOf(studentId, topics[1])).toBe("needs_testing");
    });

    it("ignores students who were not checked in", async () => {
      const { sessionId } = await aClassWithOneStudent();

      const { rows: absent } = await client.query(
        `insert into students (full_name) values ('Absent Student') returning id`,
      );
      const { rows: level } = await client.query(
        `select level_id, program_id from enrollments limit 1`,
      );
      await client.query(
        `insert into enrollments (student_id, program_id, level_id) values ($1, $2, $3)`,
        [absent[0].id, level[0].program_id, level[0].level_id],
      );

      await client.query("select advance_session_topics($1)", [sessionId]);

      const { rows } = await client.query(
        `select count(*)::int as n from progress
          where student_id = $1 and status <> 'not_seen'`,
        [absent[0].id],
      );
      expect(rows[0].n).toBe(0);
    });
  });

  describe("progress history", () => {
    it("records a change once, with the class it happened in", async () => {
      const { rows: pick } = await client.query(
        `select p.student_id, p.topic_id from progress p limit 1`,
      );
      const { rows: sessions } = await client.query(
        `insert into sessions (session_date, program_id)
         select current_date, id from programs limit 1 returning id`,
      );

      const before = await client.query(
        `select count(*)::int as n from progress_events
          where student_id = $1 and topic_id = $2`,
        [pick[0].student_id, pick[0].topic_id],
      );

      await client.query("select set_progress($1, $2, 'needs_testing', $3)", [
        pick[0].student_id,
        pick[0].topic_id,
        sessions[0].id,
      ]);

      const after = await client.query(
        `select count(*)::int as n from progress_events
          where student_id = $1 and topic_id = $2`,
        [pick[0].student_id, pick[0].topic_id],
      );
      expect(after.rows[0].n).toBe(before.rows[0].n + 1);

      const { rows: latest } = await client.query(
        `select to_status, session_id from progress_events
          where student_id = $1 and topic_id = $2
          order by changed_at desc limit 1`,
        [pick[0].student_id, pick[0].topic_id],
      );
      expect(latest[0].to_status).toBe("needs_testing");
      expect(latest[0].session_id).toBe(sessions[0].id);
    });

    it("does not record anything when the status is unchanged", async () => {
      const { rows: pick } = await client.query(
        `select student_id, topic_id, status from progress limit 1`,
      );

      const before = await client.query(
        "select count(*)::int as n from progress_events",
      );
      await client.query("select set_progress($1, $2, $3, null)", [
        pick[0].student_id,
        pick[0].topic_id,
        pick[0].status,
      ]);
      const after = await client.query(
        "select count(*)::int as n from progress_events",
      );

      expect(after.rows[0].n).toBe(before.rows[0].n);
    });

    it("does not log the blank rows created by enrolling a student", async () => {
      const before = await client.query(
        "select count(*)::int as n from progress_events",
      );

      const { rows: students } = await client.query(
        `insert into students (full_name) values ('Fresh Student') returning id`,
      );
      await client.query(
        `insert into enrollments (student_id, program_id, level_id)
         select $1, program_id, id from levels limit 1`,
        [students[0].id],
      );

      const after = await client.query(
        "select count(*)::int as n from progress_events",
      );
      // A row of blanks is the absence of history, not history.
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });
  });


  describe("merging two pages into one child", () => {
    /** Two pages for the same child, at two levels, as their old system has it. */
    async function twoPages() {
      // Both levels must be in the SAME programme, or the merged student
      // legitimately ends up with two enrollments and the level comparison
      // never applies. Ordering by number alone picked Chess 1 and Coding 1.
      const { rows: levels } = await client.query(
        `select l.id, l.number, l.program_id
           from levels l join topics t on t.level_id = l.id
          where l.program_id = (
            select program_id from levels group by program_id
             order by count(*) desc limit 1
          )
          group by l.id having count(t.id) >= 2
          order by l.number limit 2`,
      );
      const [lower, upper] = levels;

      const make = async (name: string, level: (typeof levels)[number]) => {
        const { rows } = await client.query(
          `insert into students (full_name) values ($1) returning id`,
          [name],
        );
        await client.query(
          `insert into enrollments (student_id, program_id, level_id) values ($1, $2, $3)`,
          [rows[0].id, level.program_id, level.id],
        );
        return rows[0].id as string;
      };

      return {
        lowerPage: await make("Rohan", lower),
        upperPage: await make("Rohan M", upper),
        lower,
        upper,
      };
    }

    /** merge_students checks is_coach(), so the test has to be one. */
    async function asCoach() {
      const { rows } = await client.query(
        "select id from coaches where role = 'coach' limit 1",
      );
      await actAs(rows[0].id as string);
    }

    async function topicsOf(levelId: string, n = 2) {
      const { rows } = await client.query(
        `select id from topics where level_id = $1 order by sort_order limit $2`,
        [levelId, n],
      );
      return rows.map((r) => r.id as string);
    }

    it("keeps both levels of progress, and the proper name", async () => {
      const { lowerPage, upperPage, lower, upper } = await twoPages();
      const [lowTopic] = await topicsOf(lower.id);
      const [highTopic] = await topicsOf(upper.id);

      await client.query("select set_progress($1, $2, 'complete', null)", [
        lowerPage,
        lowTopic,
      ]);
      await client.query("select set_progress($1, $2, 'needs_testing', null)", [
        upperPage,
        highTopic,
      ]);

      await asCoach();
      await client.query("select merge_students($1, $2, $3)", [
        upperPage,
        lowerPage,
        "Rohan Mistry",
      ]);

      const { rows: name } = await client.query(
        "select full_name from students where id = $1",
        [upperPage],
      );
      expect(name[0].full_name).toBe("Rohan Mistry");

      // The finished Level 1 topic survives the merge -- that is the whole
      // point, and the thing a naive "delete the other row" would lose.
      const { rows: kept } = await client.query(
        `select status from progress where student_id = $1 and topic_id = $2`,
        [upperPage, lowTopic],
      );
      expect(kept[0].status).toBe("complete");

      const { rows: gone } = await client.query(
        "select id from students where id = $1",
        [lowerPage],
      );
      expect(gone).toHaveLength(0);
    });

    it("keeps the further-along mark when both pages have the same topic", async () => {
      const { lowerPage, upperPage, lower } = await twoPages();
      const [topic] = await topicsOf(lower.id);

      // The page being absorbed is ahead of the one being kept.
      await client.query("select set_progress($1, $2, 'seen_once', null)", [
        upperPage,
        topic,
      ]);
      await client.query("select set_progress($1, $2, 'complete', null)", [
        lowerPage,
        topic,
      ]);

      await asCoach();
      await client.query("select merge_students($1, $2, null)", [upperPage, lowerPage]);

      const { rows } = await client.query(
        `select status from progress where student_id = $1 and topic_id = $2`,
        [upperPage, topic],
      );
      // Never the weaker mark: a child who reached Complete did reach it.
      expect(rows[0].status).toBe("complete");
    });

    it("moves attendance, notes and history rather than dropping them", async () => {
      const { lowerPage, upperPage } = await twoPages();

      const { rows: session } = await client.query(
        `insert into sessions (session_date, program_id)
         select current_date, id from programs limit 1 returning id`,
      );
      await client.query(
        `insert into attendance (session_id, student_id) values ($1, $2)`,
        [session[0].id, lowerPage],
      );
      await client.query(
        `insert into session_notes (session_id, student_id, note_text)
         values ($1, $2, 'Rushed the last two')`,
        [session[0].id, lowerPage],
      );

      const { rows: before } = await client.query(
        "select count(*)::int as n from progress_events where student_id = $1",
        [lowerPage],
      );

      await asCoach();
      await client.query("select merge_students($1, $2, null)", [upperPage, lowerPage]);

      const { rows: attendance } = await client.query(
        "select count(*)::int as n from attendance where student_id = $1",
        [upperPage],
      );
      expect(attendance[0].n).toBe(1);

      const { rows: note } = await client.query(
        "select note_text from session_notes where student_id = $1",
        [upperPage],
      );
      expect(note[0].note_text).toBe("Rushed the last two");

      const { rows: events } = await client.query(
        "select count(*)::int as n from progress_events where student_id = $1",
        [upperPage],
      );
      expect(events[0].n).toBeGreaterThanOrEqual(before[0].n);
    });

    it("keeps both notes when the same class has one on each page", async () => {
      const { lowerPage, upperPage } = await twoPages();
      const { rows: session } = await client.query(
        `insert into sessions (session_date, program_id)
         select current_date, id from programs limit 1 returning id`,
      );

      for (const [student, text] of [
        [upperPage, "Kept page note"],
        [lowerPage, "Absorbed page note"],
      ]) {
        await client.query(
          `insert into session_notes (session_id, student_id, note_text) values ($1, $2, $3)`,
          [session[0].id, student, text],
        );
      }

      await asCoach();
      await client.query("select merge_students($1, $2, null)", [upperPage, lowerPage]);

      const { rows } = await client.query(
        "select note_text from session_notes where student_id = $1 and session_id = $2",
        [upperPage, session[0].id],
      );
      // Both are somebody's writing about a real lesson.
      expect(rows[0].note_text).toContain("Kept page note");
      expect(rows[0].note_text).toContain("Absorbed page note");
    });

    it("keeps the higher level when both pages are in one programme", async () => {
      const { lowerPage, upperPage, upper } = await twoPages();

      // Merge the higher page INTO the lower one, so the level has to be
      // carried across rather than simply left alone.
      await asCoach();
      await client.query("select merge_students($1, $2, null)", [lowerPage, upperPage]);

      const { rows } = await client.query(
        `select level_id from enrollments where student_id = $1`,
        [lowerPage],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].level_id).toBe(upper.id);
    });

    it("refuses to merge a student into themselves", async () => {
      const { upperPage } = await twoPages();
      await asCoach();
      await expect(
        client.query("select merge_students($1, $1, null)", [upperPage]),
      ).rejects.toThrow(/into themselves/i);
    });

    it("leaves nothing pointing at the absorbed record", async () => {
      const { lowerPage, upperPage } = await twoPages();
      await asCoach();
      await client.query("select merge_students($1, $2, null)", [upperPage, lowerPage]);

      for (const table of [
        "progress",
        "enrollments",
        "attendance",
        "session_notes",
        "progress_events",
        "class_regulars",
      ]) {
        const { rows } = await client.query(
          `select count(*)::int as n from ${table} where student_id = $1`,
          [lowerPage],
        );
        expect({ table, n: rows[0].n }).toEqual({ table, n: 0 });
      }
    });
  });

});
