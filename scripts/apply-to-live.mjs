#!/usr/bin/env node
/**
 * Applies SQL to the centre's LIVE project, not the demo one.
 *
 *   node scripts/apply-to-live.mjs supabase/migrations/*.sql
 *   node scripts/apply-to-live.mjs --verify
 *
 * Identical to apply-sql.mjs except for which credentials it reads:
 * REAL_SUPABASE_DB_URL / REAL_SUPABASE_DB_PASSWORD. Kept as a separate command
 * rather than a flag, so that pointing at the real database is always a
 * deliberate act and never a typo.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

if (!env.REAL_SUPABASE_DB_URL || !env.REAL_SUPABASE_DB_PASSWORD) {
  console.error("REAL_SUPABASE_DB_URL and REAL_SUPABASE_DB_PASSWORD must be in .env.local");
  process.exit(1);
}

const url = new URL(env.REAL_SUPABASE_DB_URL);
const client = new pg.Client({
  host: url.hostname,
  port: Number(url.port || 5432),
  user: decodeURIComponent(url.username),
  database: url.pathname.replace(/^\//, "") || "postgres",
  password: env.REAL_SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 25000,
  statement_timeout: 900000,
});

const VERIFY = `
select 'programs' as name, count(*)::int as rows from programs
union all select 'levels',          count(*)::int from levels
union all select 'topics',          count(*)::int from topics
union all select 'students',        count(*)::int from students
union all select 'enrollments',     count(*)::int from enrollments
union all select 'progress',        count(*)::int from progress
union all select 'progress_events', count(*)::int from progress_events
union all select 'class_series',    count(*)::int from class_series
union all select 'class_regulars',  count(*)::int from class_regulars
union all select 'sessions',        count(*)::int from sessions
union all select 'session_topics',  count(*)::int from session_topics
union all select 'attendance',      count(*)::int from attendance
union all select 'session_notes',   count(*)::int from session_notes
union all select 'coaches',         count(*)::int from coaches
order by name;
`;

const args = process.argv.slice(2);
await client.connect();
console.log(`connected to ${url.hostname}\n`);

try {
  if (args[0] === "--verify") {
    console.table((await client.query(VERIFY)).rows);
  } else {
    for (const file of args) {
      process.stdout.write(`${file} … `);
      await client.query("begin");
      try {
        await client.query(fs.readFileSync(path.resolve(file), "utf8"));
        await client.query("commit");
        console.log("ok");
      } catch (error) {
        await client.query("rollback");
        console.log("FAILED (nothing applied)");
        console.error(`  ${error.message}`);
        process.exitCode = 1;
        break;
      }
    }
  }
} finally {
  await client.end();
}
