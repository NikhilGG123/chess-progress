"use server";

import { createClient } from "@/utils/supabase/server";
import { currentCoach } from "@/lib/queries";

/** Parents before children, matching scripts/backup.mjs so a file from either
 *  restores the same way. */
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
] as const;

const PAGE = 1000;

export type BackupResult =
  | { error: string; json: null; filename: null }
  | { error: null; json: string; filename: string };

/**
 * Everything in the database, as one JSON file the browser downloads.
 *
 * The free Supabase tier takes no automatic backups at all, so until the
 * project is on a paid plan this and the nightly job are the only copies that
 * exist. This one is the manual escape hatch: press it before doing anything
 * you would hate to undo.
 *
 * Admin only -- not because reading is dangerous, but because a file
 * containing every child's record should not be one stray click away for
 * whoever happens to be signed in on the class laptop.
 */
export async function downloadBackup(): Promise<BackupResult> {
  const { isAdmin } = await currentCoach();
  if (!isAdmin) {
    return {
      error: "Only the Admin account can download a backup.",
      json: null,
      filename: null,
    };
  }

  const supabase = await createClient();
  const tables: Record<string, unknown[]> = {};

  for (const table of TABLES) {
    const rows: unknown[] = [];

    // The API stops at 1000 rows without saying so, and a backup that quietly
    // holds the first 1000 progress rows is worse than no backup at all.
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .range(from, from + PAGE - 1);

      if (error) {
        return {
          error: `Reading ${table} failed: ${error.message}`,
          json: null,
          filename: null,
        };
      }

      rows.push(...(data ?? []));
      if ((data ?? []).length < PAGE) break;
    }

    tables[table] = rows;
  }

  const takenAt = new Date().toISOString();
  const snapshot = {
    taken_at: takenAt,
    note:
      "Table data only. Schema, policies and functions live in " +
      "supabase/migrations/ in the repository.",
    tables,
  };

  return {
    error: null,
    json: JSON.stringify(snapshot, null, 2),
    filename: `chess-progress-${takenAt.slice(0, 16).replace(/[:]/g, "")}.json`,
  };
}
