#!/usr/bin/env node
/**
 * Runs SQL files against the project's database.
 *
 *   node scripts/apply-sql.mjs supabase/migrations/0008_whatever.sql
 *   node scripts/apply-sql.mjs --verify
 *
 * Each file runs inside its own transaction, so a file that fails half way
 * leaves nothing behind. Credentials come from .env.local and are never
 * printed.
 *
 * This is how migrations reach the database -- there is no automatic runner.
 * Applying the same migration twice will usually fail on a duplicate object,
 * which is the intended signal that it is already applied.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const ENV_FILE = ".env.local";

function readEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error(`${ENV_FILE} not found. Copy .env.example and fill it in.`);
  }
  const out = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function clientConfig(env) {
  if (!env.SUPABASE_DB_URL || !env.SUPABASE_DB_PASSWORD) {
    throw new Error(
      "SUPABASE_DB_URL and SUPABASE_DB_PASSWORD must be set in .env.local. " +
        "The URL is the Session pooler string from the dashboard's Connect " +
        "button; the password is reset under Settings -> Database.",
    );
  }

  const url = new URL(env.SUPABASE_DB_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    database: url.pathname.replace(/^\//, "") || "postgres",
    // Passed separately rather than spliced into the URL, so a password with
    // punctuation in it needs no escaping.
    password: env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
    statement_timeout: 600000,
  };
}

const VERIFY = `
select 'levels' as name, count(*)::int as rows from levels
union all select 'topics',        count(*)::int from topics
union all select 'students',      count(*)::int from students
union all select 'progress',      count(*)::int from progress
union all select 'sessions',      count(*)::int from sessions
union all select 'attendance',    count(*)::int from attendance
union all select 'session_notes', count(*)::int from session_notes
union all select 'class_series',  count(*)::int from class_series
union all select 'coaches',       count(*)::int from coaches
order by name;
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      "usage: node scripts/apply-sql.mjs <file.sql> [more.sql ...]\n" +
        "       node scripts/apply-sql.mjs --verify",
    );
    process.exitCode = 1;
    return;
  }

  const client = new pg.Client(clientConfig(readEnv()));
  await client.connect();

  try {
    if (args[0] === "--verify") {
      const { rows } = await client.query(VERIFY);
      console.table(rows);
      return;
    }

    for (const file of args) {
      const full = path.resolve(file);
      if (!fs.existsSync(full)) throw new Error(`no such file: ${file}`);

      process.stdout.write(`${file} … `);
      await client.query("begin");
      try {
        await client.query(fs.readFileSync(full, "utf8"));
        await client.query("commit");
        console.log("ok");
      } catch (error) {
        await client.query("rollback");
        console.log("FAILED (nothing was applied)");
        console.error(`  ${error.message}`);
        if (error.position) console.error(`  at character ${error.position}`);
        process.exitCode = 1;
        return;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
