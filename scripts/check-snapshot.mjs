#!/usr/bin/env node
/**
 * Proof the newest snapshot is a backup and not an empty shell.
 *
 *   node scripts/check-snapshot.mjs backups/live
 *
 * The dangerous failure here is silent: valid JSON, every table present, and
 * no rows in any of them. A job that goes green on that is worse than one that
 * fails, because it tells you that you are covered when you are not.
 *
 * The floors are deliberately well under the real counts. They are there to
 * catch "nothing came back", not to track the roster.
 */
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? "backups/live";
const FLOORS = {
  students: 500,
  progress: 10000,
  sessions: 400,
  attendance: 1500,
};

const files = fs.existsSync(dir)
  ? fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
  : [];

if (files.length === 0) {
  console.error(`No snapshot in ${dir}. The backup step cannot have run.`);
  process.exit(1);
}

const file = path.join(dir, files[files.length - 1]);
const snapshot = JSON.parse(fs.readFileSync(file, "utf8"));
const rows = (table) => (snapshot.tables?.[table] ?? []).length;
const total = Object.values(snapshot.tables ?? {}).reduce(
  (n, r) => n + r.length,
  0,
);

console.log(
  `${file} — ${total} rows, project ${snapshot.project ?? "unstamped"}`,
);

let bad = false;
for (const [table, floor] of Object.entries(FLOORS)) {
  const n = rows(table);
  if (n < floor) {
    console.error(`  ${table}: ${n} rows, expected at least ${floor}`);
    bad = true;
  } else {
    console.log(`  ${table}: ${n}`);
  }
}

process.exit(bad ? 1 : 0);
