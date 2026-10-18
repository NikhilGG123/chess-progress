#!/usr/bin/env node
/**
 * Takes a full snapshot of the database to a timestamped JSON file.
 *
 *   node scripts/backup.mjs                  # -> backups/2026-09-02T0230.json
 *   node scripts/backup.mjs --live           # -> backups/live/2026-09-02T0230.json
 *   node scripts/backup.mjs --out somewhere/
 *   node scripts/backup.mjs --restore backups/2026-09-02T0230.json
 *
 * --live reads REAL_SUPABASE_DB_* and writes to backups/live/, so the centre's
 * snapshots and the demo's never share a directory. A restore replaces every
 * table it touches; picking the wrong file out of one mixed folder would put
 * invented students over 645 real ones.
 *
 * WHY THIS EXISTS
 * Supabase's free tier has no automatic backups — none, not fewer. Their Pro
 * plan adds daily ones. Until this project is on Pro, this script is the
 * backup, and it is only as good as how often somebody runs it.
 *
 * It deliberately uses no tools beyond the `pg` package the project already
 * has, so it works from any machine with the repo checked out and .env.local
 * filled in. It is not a substitute for pg_dump: it captures table data, not
 * schema, functions, policies or auth users. Those live in
 * supabase/migrations/, which is in git — between the two you can rebuild.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

import { projectOf } from "./project-of.mjs";

// Order matters on restore: parents before children, so foreign keys hold.
const TABLES = [
  "programs",
  "levels",
  "topics",
  "coaches",
  "students",
  "enrollments",
  "class_series",
  "class_regulars",
  "sessions",
  "session_topics",
  "progress",
  "progress_events",
  "attendance",
  "session_notes",
];

function readEnv() {
  const file = ".env.local";
  if (!fs.existsSync(file)) throw new Error(`${file} not found`);
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function client(live) {
  const env = readEnv();
  const prefix = live ? "REAL_SUPABASE_DB_" : "SUPABASE_DB_";
  const dbUrl = env[`${prefix}URL`];
  const password = env[`${prefix}PASSWORD`];

  if (!dbUrl || !password) {
    throw new Error(`${prefix}URL and ${prefix}PASSWORD must be in .env.local`);
  }
  const url = new URL(dbUrl);
  return {
    // Written into every snapshot so a restore can tell whether the file in
    // front of it came from the database it is about to overwrite.
    //
    // Two connection shapes carry the project in different places. A direct
    // connection puts it in the host (db.abcd1234.supabase.co); the pooler
    // shares one host across every project and puts it in the user instead
    // (postgres.abcd1234 @ aws-0-us-west-2.pooler.supabase.com). Reading the
    // host alone stamped every pooled snapshot "pooler", which is the same
    // string for both databases -- quietly disarming the guard that stops a
    // demo snapshot being restored over 645 real children.
    project: projectOf(url),
    db: new pg.Client({
      host: url.hostname,
      port: Number(url.port || 5432),
      user: decodeURIComponent(url.username),
      database: url.pathname.replace(/^\//, "") || "postgres",
      password,
      ssl: { rejectUnauthorized: false },
      statement_timeout: 600000,
    }),
  };
}

async function backup(outDir, live) {
  const { db, project } = client(live);
  await db.connect();

  console.log(`  ${live ? "LIVE" : "demo"} project ${project}\n`);

  const snapshot = {
    taken_at: new Date().toISOString(),
    project,
    note: "Table data only. Schema and policies live in supabase/migrations/.",
    tables: {},
  };

  try {
    for (const table of TABLES) {
      const { rows } = await db.query(`select * from ${table}`);
      snapshot.tables[table] = rows;
      console.log(
        `  ${table.padEnd(15)} ${String(rows.length).padStart(6)} rows`,
      );
    }
  } finally {
    await db.end();
  }

  fs.mkdirSync(outDir, { recursive: true });
  const stamp = snapshot.taken_at
    .slice(0, 16)
    .replace(/[:]/g, "")
    .replace("T", "T");
  const file = path.join(outDir, `${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), "utf8");

  const total = Object.values(snapshot.tables).reduce(
    (n, rows) => n + rows.length,
    0,
  );
  console.log(`\n  ${total} rows -> ${file}`);
  console.log("  Keep this somewhere that is not this laptop.");
}

async function restore(file, live) {
  if (!fs.existsSync(file)) throw new Error(`no such backup: ${file}`);
  const snapshot = JSON.parse(fs.readFileSync(file, "utf8"));

  const { db, project } = client(live);

  // Snapshots taken before this field existed carry no project, and are let
  // through with a warning rather than blocked -- but a file that names a
  // different project than the one being written to is refused outright. A
  // restore replaces every table; doing that with the wrong file is the single
  // most destructive thing in this repository.
  if (snapshot.project && snapshot.project !== project) {
    throw new Error(
      `this snapshot came from project ${snapshot.project}, but you are ` +
        `restoring into ${project}. Refusing.` +
        (live ? "" : "\n  Did you mean to pass --live?"),
    );
  }
  if (!snapshot.project) {
    console.log(
      "  ! This snapshot predates project stamping -- check it is the right one.\n",
    );
  }

  console.log(`  Restoring the snapshot taken ${snapshot.taken_at}`);
  console.log(
    `  into ${live ? "the LIVE project" : "the demo project"} ${project}.`,
  );
  console.log("  This REPLACES the current contents of every table listed.\n");

  await db.connect();

  try {
    // One transaction: a restore that fails half way would be worse than the
    // problem it was fixing.
    await db.query("begin");

    // Triggers off for the duration. Inserting a student normally fires the
    // trigger that creates a blank progress row for every topic in their
    // level -- which would then sit in front of the real statuses being
    // restored and silently win. This also relaxes foreign key ordering.
    await db.query("set local session_replication_role = replica");

    for (const table of [...TABLES].reverse()) {
      await db.query(`delete from ${table}`);
    }

    // `generated always as identity` columns reject an explicit value unless
    // the insert says otherwise -- progress_events.id is one, and it is why
    // this path failed the first time it was ever run for real.
    const { rows: identityColumns } = await db.query(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public' and is_identity = 'YES'
          and identity_generation = 'ALWAYS'`,
    );
    const overriding = new Map(
      identityColumns.map((c) => [c.table_name, c.column_name]),
    );

    for (const table of TABLES) {
      const rows = snapshot.tables[table] ?? [];
      const override = overriding.has(table) ? " overriding system value" : "";

      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
        await db.query(
          `insert into ${table} (${columns.map((c) => `"${c}"`).join(", ")})
           ${override} values (${placeholders})`,
          columns.map((c) => row[c]),
        );
      }

      // Restoring explicit ids leaves the sequence where it was, so the next
      // ordinary insert would collide with a row we just put back.
      const identity = overriding.get(table);
      if (identity && rows.length > 0) {
        await db.query(
          `select setval(
             pg_get_serial_sequence($1, $2),
             (select coalesce(max("${identity}"), 1) from ${table})
           )`,
          [table, identity],
        );
      }

      console.log(
        `  ${table.padEnd(15)} ${String(rows.length).padStart(6)} rows`,
      );
    }

    await db.query("commit");
    console.log("\n  Restored.");
  } catch (error) {
    await db.query("rollback");
    console.error(`\n  FAILED — nothing was changed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

const args = process.argv.slice(2);
const restoreIndex = args.indexOf("--restore");
const outIndex = args.indexOf("--out");
const live = args.includes("--live");

const run =
  restoreIndex !== -1
    ? restore(args[restoreIndex + 1], live)
    : backup(
        outIndex !== -1
          ? args[outIndex + 1]
          : live
            ? "backups/live"
            : "backups",
        live,
      );

run.catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
