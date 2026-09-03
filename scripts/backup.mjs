#!/usr/bin/env node
/**
 * Takes a full snapshot of the database to a timestamped JSON file.
 *
 *   node scripts/backup.mjs                  # -> backups/2026-09-02T0230.json
 *   node scripts/backup.mjs --out somewhere/
 *   node scripts/backup.mjs --restore backups/2026-09-02T0230.json
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

function client() {
  const env = readEnv();
  if (!env.SUPABASE_DB_URL || !env.SUPABASE_DB_PASSWORD) {
    throw new Error("SUPABASE_DB_URL and SUPABASE_DB_PASSWORD must be in .env.local");
  }
  const url = new URL(env.SUPABASE_DB_URL);
  return new pg.Client({
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    database: url.pathname.replace(/^\//, "") || "postgres",
    password: env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 600000,
  });
}

async function backup(outDir) {
  const db = client();
  await db.connect();

  const snapshot = {
    taken_at: new Date().toISOString(),
    note: "Table data only. Schema and policies live in supabase/migrations/.",
    tables: {},
  };

  try {
    for (const table of TABLES) {
      const { rows } = await db.query(`select * from ${table}`);
      snapshot.tables[table] = rows;
      console.log(`  ${table.padEnd(15)} ${String(rows.length).padStart(6)} rows`);
    }
  } finally {
    await db.end();
  }

  fs.mkdirSync(outDir, { recursive: true });
  const stamp = snapshot.taken_at.slice(0, 16).replace(/[:]/g, "").replace("T", "T");
  const file = path.join(outDir, `${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), "utf8");

  const total = Object.values(snapshot.tables).reduce((n, rows) => n + rows.length, 0);
  console.log(`\n  ${total} rows -> ${file}`);
  console.log("  Keep this somewhere that is not this laptop.");
}

async function restore(file) {
  if (!fs.existsSync(file)) throw new Error(`no such backup: ${file}`);
  const snapshot = JSON.parse(fs.readFileSync(file, "utf8"));

  console.log(`  Restoring the snapshot taken ${snapshot.taken_at}`);
  console.log("  This REPLACES the current contents of every table listed.\n");

  const db = client();
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

    for (const table of TABLES) {
      const rows = snapshot.tables[table] ?? [];
      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
        await db.query(
          `insert into ${table} (${columns.map((c) => `"${c}"`).join(", ")})
           values (${placeholders})`,
          columns.map((c) => row[c]),
        );
      }
      console.log(`  ${table.padEnd(15)} ${String(rows.length).padStart(6)} rows`);
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

const run = restoreIndex !== -1
  ? restore(args[restoreIndex + 1])
  : backup(outIndex !== -1 ? args[outIndex + 1] : "backups");

run.catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
