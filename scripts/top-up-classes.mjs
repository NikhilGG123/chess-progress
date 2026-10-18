#!/usr/bin/env node
/**
 * Keeps every active repeating class generated some weeks ahead.
 *
 *   node scripts/top-up-classes.mjs [weeks]
 *   node scripts/top-up-classes.mjs [weeks] --live
 *
 * --live reads REAL_SUPABASE_DB_* and tops up the centre's own calendar, which
 * is the one that matters: theirs is generated to a fixed horizon and simply
 * stops having classes after it. Same deliberate separation as backup.mjs --
 * which database you touch is decided by what you type.
 *
 * The centre's classes run indefinitely. Sessions are materialised rather than
 * computed -- so that cancelling one week actually cancels it -- which means
 * somebody has to keep filling the calendar in. That somebody is this script,
 * run nightly by .github/workflows/backup.yml, rather than a coach remembering
 * to press a button.
 *
 * Idempotent: only missing dates are created, and a cancelled week stays
 * cancelled.
 */
import fs from "node:fs";
import pg from "pg";

import { projectOf } from "./project-of.mjs";

const args = process.argv.slice(2);
const live = args.includes("--live");
const WEEKS = Number(args.find((arg) => !arg.startsWith("--")) ?? 8);

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
}

const prefix = live ? "REAL_SUPABASE_DB_" : "SUPABASE_DB_";
if (!env[`${prefix}URL`] || !env[`${prefix}PASSWORD`]) {
  console.error(`${prefix}URL and ${prefix}PASSWORD must be set in .env.local`);
  process.exit(1);
}

const url = new URL(env[`${prefix}URL`]);
console.log(`${live ? "LIVE" : "demo"} project ${projectOf(url)}`);

const client = new pg.Client({
  host: url.hostname,
  port: Number(url.port || 5432),
  user: decodeURIComponent(url.username),
  database: url.pathname.replace(/^\//, "") || "postgres",
  password: env[`${prefix}PASSWORD`],
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

await client.connect();

try {
  // The cast is load-bearing: `current_date + $1` leaves Postgres unable to
  // choose between date+int and date+interval, and it refuses rather than guess.
  const { rows } = await client.query(
    "select public.generate_all_series((current_date + ($1)::int)::date) as created",
    [WEEKS * 7],
  );

  const { rows: horizon } = await client.query(
    `select count(*) filter (where session_date >= current_date)::int as upcoming,
            max(session_date) as furthest
       from sessions where series_id is not null`,
  );

  console.log(
    `created ${rows[0].created} class${rows[0].created === 1 ? "" : "es"}; ` +
      `${horizon[0].upcoming} upcoming, through ${String(horizon[0].furthest).slice(0, 10)}`,
  );
} finally {
  await client.end();
}
